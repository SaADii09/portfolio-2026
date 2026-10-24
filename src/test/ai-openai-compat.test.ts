import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { TextEncoder, TextDecoder } from "node:util";
import {
  ReadableStream as NodeReadableStream,
  type UnderlyingSource as NodeUnderlyingSource,
} from "node:stream/web";
import { OPENAI_COMPAT_ADAPTER, createOpenAiCompatAdapter } from "@/lib/ai/adapters/openai-compat";
import type { NormalizedStreamEvent, StreamRequest } from "@/lib/ai/provider";

/** Node's ReadableStream is structurally close to lib.dom's but not identical under strict types. */
function nodeStream(source: NodeUnderlyingSource<Uint8Array>): ReadableStream<Uint8Array> {
  return new NodeReadableStream<Uint8Array>(source) as unknown as ReadableStream<Uint8Array>;
}

beforeAll(() => {
  vi.stubGlobal("TextEncoder", TextEncoder);
  vi.stubGlobal("TextDecoder", TextDecoder);
});

afterAll(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const UPSTREAM_PATH = "/chat/completions";

/** An OpenAI-compat `content` delta SSE line. */
function delta(text: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
}

/** A frozen inline upstream transcript: framing blocks the parser must skip
 * (a role-only delta, an empty delta, [DONE]), and exactly two text deltas. */
const SSE_TRANSCRIPT = [
  'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
  'data: {"choices":[{"delta":{}}]}\n\n',
  delta("Hi"),
  delta(" there"),
  'data: {"choices":[{"finish_reason":"stop","index":0}]}\n\n',
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

describe("OPENAI_COMPAT_ADAPTER capabilities", () => {
  it("pins the adapter's declared capabilities", () => {
    expect(OPENAI_COMPAT_ADAPTER.capabilities).toEqual({
      name: "openai-compat",
      supportsCaching: false,
      contextCharacterBudget: 64_000,
      defaultTemperature: 0.3,
    });
  });
});

describe("openai-compat adapter streaming", () => {
  it("maps choices[].delta.content to token events, skipping framing and [DONE]", async () => {
    const base = "https://api.openai.com/v1";
    const { fetch, calls } = fetchReturning({
      ok: true,
      status: 200,
      body: bodyStream(SSE_TRANSCRIPT),
    });
    process.env.AI_BASE_URL = base;
    process.env.AI_MODEL = "gpt-4o-mini";
    try {
      const adapter = createOpenAiCompatAdapter({ fetchImpl: fetch });

      const events = await collect(adapter.stream(testRequest()));

      expect(events).toEqual([
        { type: "token", text: "Hi" },
        { type: "token", text: " there" },
      ]);

      const [url, init] = calls[0] ?? [];
      expect(String(url)).toBe(`${base}${UPSTREAM_PATH}`);
      expect(init?.method).toBe("POST");
      const headers = init?.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers.Authorization).toBeUndefined();
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.model).toBe("gpt-4o-mini");
      expect(body.max_tokens).toBe(1024);
      expect(body.temperature).toBe(0.3);
      expect(body.stream).toBe(true);
      // The system prompt prepends as a system message.
      expect((body.messages as Array<{ role: string; content: string }>)[0]).toEqual({
        role: "system",
        content: "sys",
      });
      expect((body.messages as Array<{ role: string }>)[1]?.role).toBe("user");
    } finally {
      delete process.env.AI_BASE_URL;
      delete process.env.AI_MODEL;
    }
  });

  it("sends the Authorization bearer header when AI_API_KEY is set", async () => {
    const base = "https://api.openrouter.ai/api/v1";
    const { fetch, calls } = fetchReturning({
      ok: true,
      status: 200,
      body: bodyStream(SSE_TRANSCRIPT),
    });
    process.env.AI_BASE_URL = base;
    process.env.AI_MODEL = "<model>:free";
    process.env.AI_API_KEY = "sk-or-test";
    try {
      const adapter = createOpenAiCompatAdapter({ fetchImpl: fetch });
      await collect(adapter.stream(testRequest()));
      expect((calls[0]?.[1]?.headers as Record<string, string>)["Authorization"]).toBe(
        "Bearer sk-or-test",
      );
    } finally {
      delete process.env.AI_BASE_URL;
      delete process.env.AI_MODEL;
      delete process.env.AI_API_KEY;
    }
  });

  it("turns a non-200 upstream into a FIRST-event error — never thrown", async () => {
    process.env.AI_BASE_URL = "http://localhost:11434/v1";
    process.env.AI_MODEL = "llama3.1";
    try {
      const statusCodes: Array<[number, string]> = [
        [401, "auth"],
        [403, "auth"],
        [429, "rate_limited"],
        [503, "unavailable"],
        [500, "unavailable"],
      ];
      for (const [status, code] of statusCodes) {
        const { fetch } = fetchReturning({ ok: false, status, text: '{"error":"upstream"}' });
        const adapter = createOpenAiCompatAdapter({ fetchImpl: fetch });
        const events = await collect(adapter.stream(testRequest()));
        expect(events, `status ${status}`).toEqual([
          { type: "error", code, text: expect.any(String) },
        ]);
      }
    } finally {
      delete process.env.AI_BASE_URL;
      delete process.env.AI_MODEL;
    }
  });

  it("relays an upstream mid-stream failure as a terminal error event", async () => {
    process.env.AI_BASE_URL = "https://api.groq.com/openai/v1";
    process.env.AI_MODEL = "llama-3.3-70b-versatile";
    try {
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
      const adapter = createOpenAiCompatAdapter({ fetchImpl: fetch });

      const events = await collect(adapter.stream(testRequest()));

      expect(events).toEqual([
        { type: "token", text: "Hi" },
        {
          type: "error",
          code: "unavailable",
          text: "The assistant was interrupted. Please try again.",
        },
      ]);
    } finally {
      delete process.env.AI_BASE_URL;
      delete process.env.AI_MODEL;
    }
  });

  it("emits a terminal timeout error after the 20s idle gap (fake timers)", async () => {
    vi.useFakeTimers();
    try {
      process.env.AI_BASE_URL = "https://api.openai.com/v1";
      process.env.AI_MODEL = "gpt-4o-mini";
      const stalled = nodeStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(delta("Hi")));
          // never enqueues again — a stalled upstream body
        },
      });
      const { fetch } = fetchReturning({ ok: true, status: 200, body: stalled });
      const adapter = createOpenAiCompatAdapter({ fetchImpl: fetch });

      const iterator = adapter.stream(testRequest())[Symbol.asyncIterator]();
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
      delete process.env.AI_BASE_URL;
      delete process.env.AI_MODEL;
    }
  });

  it("ends quietly (no error event) when the request signal aborts mid-stream", async () => {
    process.env.AI_BASE_URL = "https://api.openai.com/v1";
    process.env.AI_MODEL = "gpt-4o-mini";
    try {
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
      const adapter = createOpenAiCompatAdapter({ fetchImpl: fetch });

      const iterator = adapter
        .stream(testRequest({ signal: controller.signal }))
        [Symbol.asyncIterator]();
      expect(await iterator.next()).toEqual({
        done: false,
        value: { type: "token", text: "Hi" },
      });
      controller.abort();
      expect(await iterator.next()).toEqual({ done: true, value: undefined });
    } finally {
      vi.useRealTimers();
      delete process.env.AI_BASE_URL;
      delete process.env.AI_MODEL;
    }
  });

  it("fails fast with unavailable when AI_BASE_URL or AI_MODEL is missing", async () => {
    delete process.env.AI_BASE_URL;
    delete process.env.AI_MODEL;
    try {
      const adapter = createOpenAiCompatAdapter();
      const events = await collect(adapter.stream(testRequest()));
      expect(events).toEqual([
        {
          type: "error",
          code: "unavailable",
          text: "openai-compat needs AI_BASE_URL and AI_MODEL set — check .env.example.",
        },
      ]);
    } finally {
      delete process.env.AI_BASE_URL;
      delete process.env.AI_MODEL;
    }
  });
});
