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

/** The parsed `data:` payload of a line, or null for anything not a token. */
function tokenFromLine(line: string): NormalizedStreamEvent | null {
  const trimmed = line.trim();
  // Non-data lines are skipped; malformed payloads are swallowed (same as the
  // original route's `catch { /* skip malformed SSE lines */ }`).
  if (!trimmed.startsWith("data: ")) return null;
  if (trimmed.slice(6) === "[DONE]") return null;
  try {
    const parsed = JSON.parse(trimmed.slice(6)) as {
      type?: string;
      delta?: { type?: string; text?: string };
    };
    if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
      return { type: "token", text: parsed.delta.text ?? "" };
    }
    return null;
  } catch {
    return null;
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

/**
 * Builds the anthropic adapter. `ANTHROPIC_ADAPTER` is the process-wide
 * instance resolved by the registry; tests inject `fetchImpl` so no suite
 * ever touches the network.
 */
export function createAnthropicAdapter(options: AnthropicAdapterOptions = {}): ModelProvider {
  const stream = async function* (req: StreamRequest) {
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.AI_API_KEY;
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
      body: JSON.stringify(
        buildRequestBody(
          req,
          process.env.AI_CACHE_SYSTEM === "true",
          process.env.AI_MODEL || DEFAULT_ANTHROPIC_MODEL,
        ),
      ),
      signal: req.signal,
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error("Anthropic API error:", response.status, detail);
      yield {
        type: "error",
        code: statusToErrorCode(response.status),
        text: "AI service unavailable",
      };
      return;
    }
    yield* streamEvents(response, req);
  } as ModelProvider["stream"];

  return { stream, capabilities: ANTHROPIC_CAPABILITIES };
}

export const ANTHROPIC_ADAPTER: ModelProvider = createAnthropicAdapter();
