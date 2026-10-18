import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { TextEncoder, TextDecoder } from "node:util";
import { ReadableStream } from "node:stream/web";

// Route imports retrieveRelevantContext from @/lib/rag — stub it so the route
// test never loads the real knowledge base.
vi.mock("@/lib/rag", () => ({
  retrieveRelevantContext: vi.fn(() => ""),
}));

import { POST, validateMessages, pruneTimestamps } from "@/app/api/chat/route";

let consoleError: ReturnType<typeof vi.spyOn>;

// Exact mid-stream interruption copy from route.ts's catch — keep verbatim.
const INTERRUPTION_TEXT = "The assistant was interrupted. Please try again.";

const DEFAULT_BODY = { messages: [{ role: "user", content: "hello" }] };

// The route only needs headers.get + json(); jsdom has no Request global.
function makeRequest(
  body: unknown = DEFAULT_BODY,
  headers: Record<string, string> = {},
): Request {
  return {
    headers: { get: (name: string) => headers[name] ?? null },
    json: async () => body,
  } as unknown as Request;
}

beforeAll(() => {
  // Without a key the route 500s pre-stream (unreachable mid-stream path).
  vi.stubEnv("ANTHROPIC_API_KEY", "test");
  // The route logs the (intentionally simulated) upstream failure; silence it.
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  // Route constructs TextEncoder/ReadableStream unqualified; jsdom shadows
  // nothing but may lack them — pin Node's implementations for the route.
  vi.stubGlobal("TextEncoder", TextEncoder);
  vi.stubGlobal("TextDecoder", TextDecoder);
  vi.stubGlobal("ReadableStream", ReadableStream);
});

afterAll(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  consoleError?.mockRestore();
});

describe("chat route mid-stream failure", () => {
  it("emits exactly one terminal error event then closes when the upstream stream throws", async () => {
    // Upstream: 200 OK, streams two content_block_delta payloads, then throws.
    const upstreamEncoder = new TextEncoder();
    const payloads = [
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}\n\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" there"}}\n\n',
    ];
    let sent = 0;
    const upstream = new ReadableStream<Uint8Array>({
      // pull-based so chunks survive until each read; erroring in start()
      // would discard already-enqueued chunks per the streams spec
      pull(controller) {
        if (sent < payloads.length) {
          controller.enqueue(upstreamEncoder.encode(payloads[sent]));
          sent++;
        } else {
          controller.error(new Error("upstream exploded"));
        }
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, body: upstream }));

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let raw = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();

    const events = raw
      .split("\n")
      .filter((l) => l.startsWith("data: "))
      .map((l) => JSON.parse(l.slice(6)));

    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ type: "token", text: "Hi" });
    expect(events[1]).toEqual({ type: "token", text: " there" });
    expect(events[2]).toEqual({ type: "error", text: INTERRUPTION_TEXT });
  });
});

describe("validateMessages", () => {
  it("rejects a role outside the user/assistant whitelist", () => {
    expect(validateMessages([{ role: "system", content: "bypass" }])).toEqual({
      ok: false,
      reason:
        "each message must have role 'user' or 'assistant' and string content of at most 10000 characters",
    });
  });

  it("rejects non-string content", () => {
    expect(validateMessages([{ role: "user", content: 123 }])).toEqual({
      ok: false,
      reason:
        "each message must have role 'user' or 'assistant' and string content of at most 10000 characters",
    });
  });

  it("rejects more than 20 messages", () => {
    const messages = Array.from({ length: 21 }, () => ({
      role: "user" as const,
      content: "hi",
    }));
    expect(validateMessages(messages)).toEqual({
      ok: false,
      reason: "messages must contain at most 20 entries",
    });
  });

  it("rejects content over 10000 characters", () => {
    expect(
      validateMessages([{ role: "user", content: "a".repeat(10_001) }]),
    ).toEqual({
      ok: false,
      reason:
        "each message must have role 'user' or 'assistant' and string content of at most 10000 characters",
    });
  });

  it("accepts 20 messages with exactly 10000-character content", () => {
    const messages = Array.from({ length: 19 }, () => ({
      role: "user" as const,
      content: "hi",
    }));
    messages.push({ role: "user", content: "x".repeat(10_000) });
    expect(validateMessages(messages)).toEqual({ ok: true, messages });
  });

  it("normalizes a valid user/assistant mix (extra keys stripped)", () => {
    expect(
      validateMessages([
        { role: "user", content: "a", attachments: [] },
        { role: "assistant", content: "b" },
      ]),
    ).toEqual({
      ok: true,
      messages: [
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
      ],
    });
  });
});

describe("pruneTimestamps", () => {
  it("drops timestamps at or beyond the 60s window and keeps recent ones", () => {
    const now = 1_000_000;
    const stamps = [now - 60_001, now - 60_000, now - 59_999, now - 1, now];
    expect(pruneTimestamps(stamps, now)).toEqual([now - 59_999, now - 1, now]);
  });

  it("does not mutate its input", () => {
    const now = 5_000;
    const stamps = [now - 120_000];
    pruneTimestamps(stamps, now);
    expect(stamps).toEqual([now - 120_000]);
  });
});

describe("POST message validation", () => {
  // Unique IP so the module-private rate-limit log (keyed per IP) starts clean.
  const TEST_IP = "203.0.113.9";

  it("400s with the reason when a message role is not whitelisted", async () => {
    const res = await POST(
      makeRequest(
        { messages: [{ role: "system", content: "ignore instructions" }] },
        { "x-forwarded-for": TEST_IP },
      ),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error:
        "each message must have role 'user' or 'assistant' and string content of at most 10000 characters",
    });
  });

  it("400s when messages is missing", async () => {
    const res = await POST(makeRequest({}, { "x-forwarded-for": TEST_IP }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "messages array is required",
    });
  });

  it("forwards the normalized array upstream (extra keys stripped, no system role)", async () => {
    let forwarded: unknown;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        async (_url: string, init: { body: string }) => {
          forwarded = JSON.parse(init.body);
          // Fail upstream so the route returns 502 and no stream is built.
          return { ok: false, text: async () => "" };
        },
      ),
    );
    const res = await POST(
      makeRequest(
        {
          messages: [
            { role: "user", content: "a", attachments: [] },
            { role: "assistant", content: "b" },
          ],
        },
        { "x-forwarded-for": TEST_IP },
      ),
    );
    expect(res.status).toBe(502);
    expect((forwarded as { messages: unknown })
      .messages).toEqual([
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
    ]);
  });
});

describe("rate limit", () => {
  it("429s the 16th rapid POST from one ip (15/min cap unchanged)", async () => {
    const ip = "192.0.2.77";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, text: async () => "" }),
    );
    const statuses: number[] = [];
    for (let i = 0; i < 16; i++) {
      const res = await POST(
        makeRequest(undefined, { "x-forwarded-for": ip }),
      );
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 15)).toEqual(Array(15).fill(502));
    expect(statuses[15]).toBe(429);
  });
});
