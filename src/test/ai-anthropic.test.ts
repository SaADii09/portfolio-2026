import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { TextEncoder, TextDecoder } from "node:util";
import {
  ReadableStream as NodeReadableStream,
  type UnderlyingSource as NodeUnderlyingSource,
} from "node:stream/web";
import { ANTHROPIC_ADAPTER, createAnthropicAdapter } from "@/lib/ai/adapters/anthropic";
import type { NormalizedStreamEvent, StreamRequest } from "@/lib/ai/provider";

/** Node's ReadableStream is structurally close to lib.dom's but not identical under strict types. */
function nodeStream(source: NodeUnderlyingSource<Uint8Array>): ReadableStream<Uint8Array> {
  return new NodeReadableStream<Uint8Array>(source) as unknown as ReadableStream<Uint8Array>;
}

beforeAll(() => {
  // The adapter reads TextDecoder unqualified; pin Node's implementation.
  vi.stubGlobal("TextEncoder", TextEncoder);
  vi.stubGlobal("TextDecoder", TextDecoder);
});

afterAll(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const UPSTREAM_URL = "https://api.anthropic.com/v1/messages";

/** A content_block_delta SSE line as Anthropic emits it. */
function delta(text: string): string {
  return `data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text } })}\n\n`;
}

/**
 * A frozen inline upstream transcript: framing blocks the parser must skip
 * (message_start/content_block_start/content_block_stop/message_delta/
 * message_stop), the [DONE] sentinel, and exactly two text deltas.
 */
const SSE_TRANSCRIPT = [
  'data: {"type":"message_start","message":{"id":"msg_1"}}\n\n',
  'data: {"type":"content_block_start","index":0,"content_block":{"type":"text"}}\n\n',
  delta("Hi"),
  delta(" there"),
  'data: {"type":"content_block_stop","index":0}\n\n',
  'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n',
  'data: {"type":"message_stop"}\n\n',
  "data: [DONE]\n\n",
].join("");

function testRequest(overrides: Partial<StreamRequest> = {}): StreamRequest {
  return {
    messages: [{ role: "user", content: "hi" }],
    system: "sys",
    maxTokens: 1024,
    temperature: 0.3,
    signal: new AbortController().signal,
    ...overrides,
  };
}

function bodyStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return nodeStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

/** URL-aware fetch mock: records the call, answers with a canned Response-like. */
function fetchReturning(response: {
  ok: boolean;
  status: number;
  body?: ReadableStream<Uint8Array>;
  text?: string;
}): { fetch: typeof fetch; calls: Array<[string | URL | Request, RequestInit | undefined]> } {
  const calls: Array<[string | URL | Request, RequestInit | undefined]> = [];
  const mock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    calls.push([input, init]);
    return {
      ok: response.ok,
      status: response.status,
      body: response.body,
      text: async () => response.text ?? "",
    } as unknown as Response;
  });
  return { fetch: mock as unknown as typeof fetch, calls };
}

async function collect(
  events: AsyncIterable<NormalizedStreamEvent>,
): Promise<NormalizedStreamEvent[]> {
  const out: NormalizedStreamEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

describe("ANTHROPIC_ADAPTER capabilities", () => {
  it("pins the adapter's declared capabilities", () => {
    expect(ANTHROPIC_ADAPTER.capabilities).toEqual({
      name: "anthropic",
      supportsCaching: true,
      contextCharacterBudget: 120_000,
      defaultTemperature: 0.3,
    });
  });
});

describe("anthropic adapter streaming", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("maps content_block_delta to token events, skipping non-delta blocks and [DONE]", async () => {
    const { fetch, calls } = fetchReturning({
      ok: true,
      status: 200,
      body: bodyStream(SSE_TRANSCRIPT),
    });
    const adapter = createAnthropicAdapter({ fetchImpl: fetch });

    const events = await collect(adapter.stream(testRequest()));

    expect(events).toEqual([
      { type: "token", text: "Hi" },
      { type: "token", text: " there" },
    ]);

    const [url, init] = calls[0] ?? [];
    expect(url).toBe(UPSTREAM_URL);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      "Content-Type": "application/json",
      "x-api-key": "test-key",
      "anthropic-version": "2023-06-01",
    });
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toEqual({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      temperature: 0.3,
      system: "sys",
      messages: [{ role: "user", content: "hi" }],
      stream: true,
    });
  });

  it("uses the x-api-key from the generic AI_API_KEY as a fallback", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    const prevGeneric = process.env.AI_API_KEY;
    process.env.ANTHROPIC_API_KEY = "";
    process.env.AI_API_KEY = "generic-key";
    try {
      const { fetch, calls } = fetchReturning({
        ok: true,
        status: 200,
        body: bodyStream(SSE_TRANSCRIPT),
      });
      const adapter = createAnthropicAdapter({ fetchImpl: fetch });
      await collect(adapter.stream(testRequest()));
      expect((calls[0]?.[1]?.headers as Record<string, string>)["x-api-key"]).toBe("generic-key");
    } finally {
      process.env.ANTHROPIC_API_KEY = prev;
      process.env.AI_API_KEY = prevGeneric;
    }
  });

  it("turns a non-200 upstream into a FIRST-event error — never thrown, and ends the stream", async () => {
    const statusCodes: Array<[number, string]> = [
      [401, "auth"],
      [403, "auth"],
      [429, "rate_limited"],
      [503, "unavailable"],
      [500, "unavailable"],
    ];
    for (const [status, code] of statusCodes) {
      const { fetch } = fetchReturning({ ok: false, status, text: '{"error":"upstream"}' });
      const adapter = createAnthropicAdapter({ fetchImpl: fetch });
      const events = await collect(adapter.stream(testRequest()));
      expect(events, `status ${status}`).toEqual([
        { type: "error", code, text: expect.any(String) },
      ]);
    }
  });

  it("relays an upstream mid-stream failure as a terminal error event (verbatim friendly copy)", async () => {
    const encoder = new TextEncoder();
    let sent = 0;
    const exploding = nodeStream({
      pull(controller) {
        if (sent === 0) {
          controller.enqueue(encoder.encode(delta("Hi")));
          sent = 1;
        } else {
          controller.error(new Error("upstream exploded"));
        }
      },
    });
    const { fetch } = fetchReturning({ ok: true, status: 200, body: exploding });
    const adapter = createAnthropicAdapter({ fetchImpl: fetch });

    const events = await collect(adapter.stream(testRequest()));

    expect(events).toEqual([
      { type: "token", text: "Hi" },
      {
        type: "error",
        code: "unavailable",
        text: "The assistant was interrupted. Please try again.",
      },
    ]);
  });

  it("attaches cache_control to the system block ONLY when AI_CACHE_SYSTEM=true", async () => {
    const prev = process.env.AI_CACHE_SYSTEM;
    try {
      process.env.AI_CACHE_SYSTEM = "true";
      const cached = fetchReturning({ ok: true, status: 200, body: bodyStream(SSE_TRANSCRIPT) });
      const adapter = createAnthropicAdapter({ fetchImpl: cached.fetch });
      await collect(adapter.stream(testRequest()));
      expect(JSON.parse(String(cached.calls[0]?.[1]?.body)).system).toEqual([
        { type: "text", text: "sys", cache_control: { type: "ephemeral" } },
      ]);

      process.env.AI_CACHE_SYSTEM = "";
      const uncached = fetchReturning({ ok: true, status: 200, body: bodyStream(SSE_TRANSCRIPT) });
      const adapter2 = createAnthropicAdapter({ fetchImpl: uncached.fetch });
      await collect(adapter2.stream(testRequest()));
      expect(JSON.parse(String(uncached.calls[0]?.[1]?.body)).system).toBe("sys");
    } finally {
      process.env.AI_CACHE_SYSTEM = prev;
    }
  });

  it("overrides the model from AI_MODEL when set", async () => {
    const prev = process.env.AI_MODEL;
    process.env.AI_MODEL = "claude-3-haiku-test";
    try {
      const { fetch, calls } = fetchReturning({
        ok: true,
        status: 200,
        body: bodyStream(SSE_TRANSCRIPT),
      });
      const adapter = createAnthropicAdapter({ fetchImpl: fetch });
      await collect(adapter.stream(testRequest()));
      expect(JSON.parse(String(calls[0]?.[1]?.body)).model).toBe("claude-3-haiku-test");
    } finally {
      process.env.AI_MODEL = prev;
    }
  });

  it("emits a terminal timeout error after the 20s idle gap (fake timers)", async () => {
    vi.useFakeTimers();
    try {
      const stalled = nodeStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(delta("Hi")));
          // never enqueues again — a stalled upstream body
        },
      });
      const { fetch } = fetchReturning({ ok: true, status: 200, body: stalled });
      const adapter = createAnthropicAdapter({ fetchImpl: fetch });

      const iterator = adapter.stream(testRequest())[Symbol.asyncIterator]();
      // The one buffered token lands immediately; the stream then stalls.
      expect(await iterator.next()).toEqual({
        done: false,
        value: { type: "token", text: "Hi" },
      });
      const pending = iterator.next();
      await vi.advanceTimersByTimeAsync(20_000);
      const next = await pending;
      expect(next.done).toBe(false);
      expect(next.value).toEqual({ type: "error", code: "timeout", text: expect.any(String) });
      const after = await iterator.next();
      expect(after.done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ends quietly (no error event) when the request signal aborts mid-stream", async () => {
    const controller = new AbortController();
    const encoder = new TextEncoder();
    let sent = 0;
    const stallingAfterOne = nodeStream({
      pull(ctrl) {
        if (sent === 0) {
          ctrl.enqueue(encoder.encode(delta("Hi")));
          sent = 1;
        } else {
          // stall until abort cancels the body
        }
      },
    });
    const { fetch } = fetchReturning({ ok: true, status: 200, body: stallingAfterOne });
    const adapter = createAnthropicAdapter({ fetchImpl: fetch });

    const iterator = adapter
      .stream(testRequest({ signal: controller.signal }))
      [Symbol.asyncIterator]();
    expect(await iterator.next()).toEqual({
      done: false,
      value: { type: "token", text: "Hi" },
    });
    controller.abort();
    expect(await iterator.next()).toEqual({ done: true, value: undefined });
  });
});
