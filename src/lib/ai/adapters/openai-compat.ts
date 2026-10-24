/**
 * OpenAI-compatible chat-completions streaming adapter (design §openai-compat adapter).
 * Covers Groq, OpenRouter, Ollama, OpenAI and any vendor exposing the
 * OpenAI `POST /chat/completions` streaming shape via `AI_BASE_URL` + `AI_MODEL`.
 *
 * This module owns every vendor-specific shape: the URL, the headers, the
 * upstream request body, the SSE line dialect, the status→error-code map.
 * The browser's SSE shape is decided by the ROUTE's re-encoder, never here.
 *
 * openai-compat may run KEYLESS (Ollama/LM Studio) — `AI_API_KEY` is optional.
 * `AI_BASE_URL` and `AI_MODEL` are REQUIRED; requests fail fast without them.
 */
import type {
  ModelProvider,
  NormalizedStreamEvent,
  ProviderCapabilities,
  ProviderErrorCode,
  StreamRequest,
} from "../provider";
import { StreamTimeoutError, withIdleTimeout } from "../timeout";

export const OPENAI_COMPAT_CAPABILITIES: ProviderCapabilities = {
  name: "openai-compat",
  supportsCaching: false,
  /** Free/compat models usually carry smaller contexts; pin conservatively. */
  contextCharacterBudget: 64_000,
  defaultTemperature: 0.3,
};

const IDLE_TIMEOUT_MS = 20_000;
const TOTAL_TIMEOUT_MS = 90_000;

const INTERRUPTION_TEXT = "The assistant was interrupted. Please try again.";
const TIMEOUT_TEXT = "The assistant took too long to respond. Please try again.";
const MISSING_CONFIG_TEXT =
  "openai-compat needs AI_BASE_URL and AI_MODEL set — check .env.example.";

export interface OpenAiCompatAdapterOptions {
  /** Test seam — defaults to the global fetch, resolved at call time. */
  fetchImpl?: typeof fetch;
}

interface OpenAiDeltaEvent {
  choices?: Array<{ delta?: { content?: string; role?: string } }>;
}

/** One env value, trimmed; empty string when unset. */
function envValue(name: string): string {
  return process.env[name]?.trim() ?? "";
}

/** The SSE payload after `data: `, or null for non-data / `[DONE]` lines. */
function dataPayload(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data: ")) return null;
  const payload = trimmed.slice(6);
  return payload === "[DONE]" ? null : payload;
}

/** Parsed JSON, or null for a malformed payload. */
function parseEvent(payload: string): OpenAiDeltaEvent | null {
  try {
    return JSON.parse(payload) as OpenAiDeltaEvent;
  } catch {
    return null;
  }
}

/** The parsed `data:` payload of a line, or null for anything not a token. */
function tokenFromLine(line: string): NormalizedStreamEvent | null {
  const payload = dataPayload(line);
  if (payload === null) return null;
  const content = parseEvent(payload)?.choices?.[0]?.delta?.content;
  return content === undefined ? null : { type: "token", text: content };
}

/** Splits the decode buffer into complete lines and the trailing partial line. */
function splitLines(buffer: string): { lines: string[]; rest: string } {
  const lines = buffer.split("\n");
  return { lines, rest: lines.pop() ?? "" };
}

function* tokensFromLines(lines: string[]): Generator<NormalizedStreamEvent, void, undefined> {
  for (const line of lines) {
    const token = tokenFromLine(line);
    if (token !== null) yield token;
  }
}

async function* tokensFromChunks(
  chunks: AsyncIterable<Uint8Array>,
): AsyncGenerator<NormalizedStreamEvent, void, undefined> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of chunks) {
    buffer += decoder.decode(chunk, { stream: true });
    const { lines, rest } = splitLines(buffer);
    buffer = rest;
    yield* tokensFromLines(lines);
  }
}

async function* readChunks(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<Uint8Array, void, undefined> {
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    yield value;
  }
}

function statusToErrorCode(status: number): ProviderErrorCode {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limited";
  return "unavailable";
}

/** The upstream chat-completions body; the system prompt prepends as a system message. */
function buildRequestBody(req: StreamRequest, model: string): object {
  const messages = req.system
    ? [{ role: "system" as const, content: req.system }, ...req.messages]
    : [...req.messages];
  return {
    model,
    max_tokens: req.maxTokens,
    temperature: req.temperature,
    messages,
    stream: true,
  };
}

async function* streamEvents(
  response: Response,
  req: StreamRequest,
): AsyncGenerator<NormalizedStreamEvent, void, undefined> {
  const body = response.body;
  if (!body) return; // matches the original route: an unreadable body ends silently
  const reader = body.getReader();
  try {
    yield* withIdleTimeout(tokensFromChunks(readChunks(reader)), {
      ms: IDLE_TIMEOUT_MS,
      totalMs: TOTAL_TIMEOUT_MS,
      signal: req.signal,
      cancel: () => {
        // A stream that already errored rejects cancel() with that same
        // error; the reader is gone either way, so swallow it.
        void reader.cancel().catch(() => {});
      },
    });
  } catch (err) {
    if (err instanceof StreamTimeoutError) {
      yield { type: "error", code: "timeout", text: TIMEOUT_TEXT };
      return;
    }
    console.error("Stream error:", err);
    yield { type: "error", code: "unavailable", text: INTERRUPTION_TEXT };
  }
}

interface CompletionConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

function completionConfig(): CompletionConfig {
  return {
    baseUrl: envValue("AI_BASE_URL"),
    model: envValue("AI_MODEL"),
    apiKey: envValue("AI_API_KEY"),
  };
}

function isConfigured(config: CompletionConfig): boolean {
  return config.baseUrl !== "" && config.model !== "";
}

function authHeaders(apiKey: string): Record<string, string> {
  return apiKey === "" ? {} : { Authorization: `Bearer ${apiKey}` };
}

function chatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

/** Non-200 upstream → one terminal error event (never thrown). */
async function upstreamErrorEvent(response: Response): Promise<NormalizedStreamEvent> {
  const detail = await response.text();
  console.error("OpenAI-compat API error:", response.status, detail);
  return {
    type: "error",
    code: statusToErrorCode(response.status),
    text: "AI service unavailable",
  };
}

/** Builds the openai-compat adapter. The module-level instance is used by the
 * registry; tests inject `fetchImpl` so no suite ever touches the network. */
export function createOpenAiCompatAdapter(options: OpenAiCompatAdapterOptions = {}): ModelProvider {
  const stream = async function* (req: StreamRequest) {
    const config = completionConfig();
    if (!isConfigured(config)) {
      // Reachable only when the registry's row is wired but env is incomplete.
      yield { type: "error", code: "unavailable", text: MISSING_CONFIG_TEXT };
      return;
    }
    const doFetch = options.fetchImpl ?? fetch;
    const response = await doFetch(chatCompletionsUrl(config.baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(config.apiKey) },
      body: JSON.stringify(buildRequestBody(req, config.model)),
      signal: req.signal,
    });
    if (!response.ok) {
      yield await upstreamErrorEvent(response);
      return;
    }
    yield* streamEvents(response, req);
  } as ModelProvider["stream"];

  return { stream, capabilities: OPENAI_COMPAT_CAPABILITIES };
}

export const OPENAI_COMPAT_ADAPTER: ModelProvider = createOpenAiCompatAdapter();
