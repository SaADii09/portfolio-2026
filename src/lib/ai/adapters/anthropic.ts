/**
 * Anthropic messages-stream adapter (design §anthropic adapter). The inline
 * logic of the pre-phase-17 `route.ts` — messages call, `content_block_delta`
 * parsing, terminal error event — lifted verbatim and normalized to the
 * internal protocol (`../provider.ts`), so the browser's SSE shape is decided
 * by the ROUTE's re-encoder, never here.
 *
 * This module owns every vendor-specific shape: the URL, the headers, the
 * upstream request body, the SSE line dialect, the status→error-code map, and
 * the optional system prompt caching (`AI_CACHE_SYSTEM=true` → `cache_control`
 * on the system block only).
 */
import type {
  ModelProvider,
  NormalizedStreamEvent,
  ProviderCapabilities,
  ProviderErrorCode,
  StreamRequest,
} from "../provider";
import { StreamTimeoutError, withIdleTimeout } from "../timeout";

export const ANTHROPIC_CAPABILITIES: ProviderCapabilities = {
  name: "anthropic",
  supportsCaching: true,
  contextCharacterBudget: 120_000,
  defaultTemperature: 0.3,
};

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

// Bounds a free/hung upstream so the UI always recovers (§Idle-read timeout).
const IDLE_TIMEOUT_MS = 20_000;
const TOTAL_TIMEOUT_MS = 90_000;

/** The verbatim mid-stream interruption copy the route has always emitted. */
const INTERRUPTION_TEXT = "The assistant was interrupted. Please try again.";
const TIMEOUT_TEXT = "The assistant took too long to respond. Please try again.";

export interface AnthropicAdapterOptions {
  /** Test seam — defaults to the global fetch, resolved at call time. */
  fetchImpl?: typeof fetch;
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

interface AnthropicDeltaEvent {
  type?: string;
  delta?: { type?: string; text?: string };
}

/** The SSE payload after `data: `, or null for non-data / `[DONE]` lines. */
function dataPayload(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data: ")) return null;
  const payload = trimmed.slice(6);
  return payload === "[DONE]" ? null : payload;
}

/** Parsed JSON, or null for a malformed payload (same tolerance as the old route). */
function parseEvent(payload: string): AnthropicDeltaEvent | null {
  try {
    return JSON.parse(payload) as AnthropicDeltaEvent;
  } catch {
    return null;
  }
}

function isTextDelta(event: AnthropicDeltaEvent): boolean {
  return event.type === "content_block_delta" && event.delta?.type === "text_delta";
}

function deltaText(event: AnthropicDeltaEvent): string {
  return event.delta?.text ?? "";
}

/** The text of a `text_delta` event, or null for every other event type. */
function textDeltaOf(event: AnthropicDeltaEvent | null): string | null {
  if (event === null) return null;
  return isTextDelta(event) ? deltaText(event) : null;
}

/** The parsed `data:` payload of a line, or null for anything not a token. */
function tokenFromLine(line: string): NormalizedStreamEvent | null {
  const payload = dataPayload(line);
  if (payload === null) return null;
  const text = textDeltaOf(parseEvent(payload));
  if (text === null) return null;
  return { type: "token", text };
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

function statusToErrorCode(status: number): ProviderErrorCode {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limited";
  return "unavailable";
}

/** The upstream messages body; system caching flattens the block to a list. */
function buildRequestBody(req: StreamRequest, caching: boolean, model: string): object {
  const body: Record<string, unknown> = {
    model,
    max_tokens: req.maxTokens,
    temperature: req.temperature,
    system: req.system,
    messages: req.messages,
    stream: true,
  };
  if (caching) {
    body.system = [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }];
  }
  return body;
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

function anthropicApiKey(): string {
  return process.env.ANTHROPIC_API_KEY || process.env.AI_API_KEY || "";
}

function anthropicModel(): string {
  return process.env.AI_MODEL || DEFAULT_ANTHROPIC_MODEL;
}

function anthropicRequestBody(req: StreamRequest): string {
  const caching = process.env.AI_CACHE_SYSTEM === "true";
  return JSON.stringify(buildRequestBody(req, caching, anthropicModel()));
}

/** Non-200 upstream → one terminal error event (never thrown). */
async function upstreamErrorEvent(response: Response): Promise<NormalizedStreamEvent> {
  const detail = await response.text();
  console.error("Anthropic API error:", response.status, detail);
  return {
    type: "error",
    code: statusToErrorCode(response.status),
    text: "AI service unavailable",
  };
}

/**
 * Builds the anthropic adapter. `ANTHROPIC_ADAPTER` is the process-wide
 * instance resolved by the registry; tests inject `fetchImpl` so no suite
 * ever touches the network.
 */
export function createAnthropicAdapter(options: AnthropicAdapterOptions = {}): ModelProvider {
  const stream = async function* (req: StreamRequest) {
    const apiKey = anthropicApiKey();
    if (!apiKey) {
      // Unreachable via the route (the registry gates it) — a direct call
      // still fails loudly at protocol level instead of crashing.
      yield { type: "error", code: "auth", text: "ANTHROPIC_API_KEY not configured" };
      return;
    }
    const doFetch = options.fetchImpl ?? fetch;
    const response = await doFetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: anthropicRequestBody(req),
      signal: req.signal,
    });
    if (!response.ok) {
      yield await upstreamErrorEvent(response);
      return;
    }
    yield* streamEvents(response, req);
  } as ModelProvider["stream"];

  return { stream, capabilities: ANTHROPIC_CAPABILITIES };
}

export const ANTHROPIC_ADAPTER: ModelProvider = createAnthropicAdapter();
