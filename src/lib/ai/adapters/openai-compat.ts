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

/** The parsed `data:` payload of a line, or null for anything not a token. */
function tokenFromLine(line: string): NormalizedStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data: ")) return null;
  const payload = trimmed.slice(6);
  if (payload === "[DONE]") return null;
  try {
    const parsed = JSON.parse(payload) as {
      choices?: Array<{ delta?: { content?: string; role?: string } }>;
    };
    const content = parsed.choices?.[0]?.delta?.content;
    if (content !== undefined) return { type: "token", text: content };
    return null;
  } catch {
    return null;
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

async function* tokensFromChunks(
  chunks: AsyncIterable<Uint8Array>,
): AsyncGenerator<NormalizedStreamEvent, void, undefined> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of chunks) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const token = tokenFromLine(line);
      if (token !== null) yield token;
    }
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
        void reader.cancel();
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

/** Builds the openai-compat adapter. The module-level instance is used by the
 * registry; tests inject `fetchImpl` so no suite ever touches the network. */
export function createOpenAiCompatAdapter(options: OpenAiCompatAdapterOptions = {}): ModelProvider {
  const stream = async function* (req: StreamRequest) {
    const baseUrl = process.env.AI_BASE_URL?.trim() ?? "";
    const model = process.env.AI_MODEL?.trim() ?? "";
    const apiKey = process.env.AI_API_KEY?.trim() ?? "";
    if (!baseUrl || !model) {
      // Reachable only when the registry's row is wired but env is incomplete.
      yield { type: "error", code: "unavailable", text: MISSING_CONFIG_TEXT };
      return;
    }
    const doFetch = options.fetchImpl ?? fetch;
    const response = await doFetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(buildRequestBody(req, model)),
      signal: req.signal,
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error("OpenAI-compat API error:", response.status, detail);
      yield {
        type: "error",
        code: statusToErrorCode(response.status),
        text: "AI service unavailable",
      };
      return;
    }
    yield* streamEvents(response, req);
  } as ModelProvider["stream"];

  return { stream, capabilities: OPENAI_COMPAT_CAPABILITIES };
}

export const OPENAI_COMPAT_ADAPTER: ModelProvider = createOpenAiCompatAdapter();
