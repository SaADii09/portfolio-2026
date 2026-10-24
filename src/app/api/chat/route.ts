import {
  clientIpOf,
  createRateLimiter,
  pruneTimestamps as pruneStamps,
  rateLimitedResponse,
} from "@/lib/rate-limit";
import { resolveProviderFromEnv, type ProviderResolutionError } from "@/lib/ai/registry";
import { buildSystemPrompt } from "@/lib/ai/prompt";
import type { NormalizedStreamEvent, StreamRequest } from "@/lib/ai/provider";

const MAX_REQUESTS_PER_MINUTE = Number(process.env.AI_RATE_LIMIT_PER_MIN ?? 15);
const RATE_LIMIT_WINDOW_MS = 60_000;

const ALLOWED_ROLES = new Set<string>(["user", "assistant"]);
const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 10_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 1024;
const DEFAULT_TEMPERATURE = 0.3;
/** The verbatim one-shot interruption copy — emitted only if the adapter (which owns every
 * upstream failure) somehow throws. */
const STREAM_ERROR_TEXT = "The assistant was interrupted. Please try again.";

const limiter = createRateLimiter({
  limit: MAX_REQUESTS_PER_MINUTE,
  windowMs: RATE_LIMIT_WINDOW_MS,
});

/**
 * The window's own pruner — kept here for the route's existing contract.
 * @expected-unused -- consumed only by test files (the limiter prunes for real)
 */
export function pruneTimestamps(stamps: number[], now: number): number[] {
  return pruneStamps(stamps, now, RATE_LIMIT_WINDOW_MS);
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isChatMessage(message: unknown): message is ChatMessage {
  if (typeof message !== "object" || message === null) return false;
  const role = (message as { role?: unknown }).role;
  const content = (message as { content?: unknown }).content;
  if (typeof role !== "string" || !ALLOWED_ROLES.has(role)) return false;
  if (!isNonEmptyString(content)) return false;
  return content.length <= MAX_MESSAGE_LENGTH;
}

type ValidationOk = { ok: true; messages: ChatMessage[] };
type ValidationFail = { ok: false; reason: string };

export function validateMessages(input: unknown): ValidationOk | ValidationFail {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, reason: "messages array is required" };
  }
  if (input.length > MAX_MESSAGES) {
    return { ok: false, reason: "messages must contain at most 20 entries" };
  }
  if (!input.every(isChatMessage)) {
    return {
      ok: false,
      reason:
        "each message must have role 'user' or 'assistant' and string content of at most 10000 characters",
    };
  }
  const messages = input.map((message) => {
    const { role, content } = message as ChatMessage;
    return { role, content } as ChatMessage;
  });
  return { ok: true, messages };
}

function toSsePayload(event: NormalizedStreamEvent): { type: string; text: string } {
  return { type: event.type, text: event.text };
}

/** One SSE data line for a plain `{type, text}` payload. */
function sseLineFor(encoder: TextEncoder, payload: { type: string; text: string }): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

/**
 * Relays the provider's normalized events into SSE line bytes: tokens as
 * `{"type":"token",…}` and terminal errors as `{"type":"error",…}` — the
 * exact byte-format the pre-cutover route emitted (the internal error `code`
 * is route knowledge, never client-visible). The adapter itself is the
 * single error boundary — it ends the stream with a terminal error event
 * instead of throwing — so the catch here is defensive parity with
 * yesterday's read loop.
 */
async function* sseBytes(
  iterator: AsyncIterator<NormalizedStreamEvent>,
  first: { type: string; text: string } | null,
): AsyncGenerator<Uint8Array, void, undefined> {
  const encoder = new TextEncoder();
  if (first !== null) {
    yield sseLineFor(encoder, first);
  }
  try {
    let next = await iterator.next();
    while (!next.done) {
      yield sseLineFor(encoder, toSsePayload(next.value));
      next = await iterator.next();
    }
  } catch (err) {
    console.error("Stream error:", err);
    yield sseLineFor(encoder, { type: "error", text: STREAM_ERROR_TEXT });
  }
}

/** Maps a registry gap kind to today's exact pre-stream status and body. */
function resolutionErrorToResponse(kind: ProviderResolutionError): Response {
  if (kind === "not_configured") {
    // Byte-exact legacy body — the client renders its friendly copy from
    // this exact string; it must never change.
    return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }
  if (kind === "invalid_provider") {
    const requested = process.env.AI_PROVIDER?.trim() ?? "";
    return Response.json({ error: `Unknown AI_PROVIDER: "${requested}"` }, { status: 500 });
  }
  // Reachable only once task 3 wires openai-compat without a model pinned.
  return Response.json({ error: "AI_MODEL is required for the configured provider" }, {
    status: 500,
  });
}

/** The stream Response with the exact headers the route has always sent. */
function sseResponseFor(
  iterator: AsyncIterator<NormalizedStreamEvent>,
  first: { type: string; text: string } | null,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const bytes of sseBytes(iterator, first)) {
          // enqueue can throw if the client aborted mid-stream — the
          // response is dead either way; the finally still closes quietly.
          controller.enqueue(bytes);
        }
      } finally {
        try {
          controller.close();
        } catch {
          // stream already closed or cancelled — nothing left to close
        }
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export async function POST(request: Request) {
  const ip = clientIpOf(request);

  if (limiter.isLimited(ip)) {
    return rateLimitedResponse();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validated = validateMessages((body as { messages?: unknown } | null)?.messages);
  if (!validated.ok) {
    return Response.json({ error: validated.reason }, { status: 400 });
  }
  const messages = validated.messages;

  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  const systemPrompt = buildSystemPrompt({ userQuery: lastUserMessage?.content ?? "" });

  const resolved = resolveProviderFromEnv(process.env);
  if ("error" in resolved) return resolutionErrorToResponse(resolved.error);

  // The legacy route never aborted on client disconnect; a fresh signal
  // keeps that posture while giving the adapter a well-formed AbortSignal
  // (its idle timeout listens for a later Task's disconnect wiring).
  const streamRequest: StreamRequest = {
    messages,
    system: systemPrompt,
    maxTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    temperature: DEFAULT_TEMPERATURE,
    signal: new AbortController().signal,
  };
  const iterator = resolved.provider.stream(streamRequest)[Symbol.asyncIterator]();

  // Pull the first event before building the Response, so a first-event
  // `error` (a non-200 upstream) or an unexpected setup throw keeps today's
  // pre-stream status/body instead of leaking into an SSE stream.
  let first: IteratorResult<NormalizedStreamEvent, undefined>;
  try {
    first = await iterator.next();
  } catch (err) {
    console.error("Chat API error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
  if (!first.done && first.value.type === "error") {
    return Response.json({ error: "AI service unavailable" }, { status: 502 });
  }
  return sseResponseFor(iterator, first.done ? null : toSsePayload(first.value));
}
