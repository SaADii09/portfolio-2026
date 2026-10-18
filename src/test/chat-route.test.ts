import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { TextEncoder, TextDecoder } from "node:util";
import { ReadableStream } from "node:stream/web";

// Route imports retrieveRelevantContext from @/lib/rag — stub it so the route
// test never loads the real knowledge base.
vi.mock("@/lib/rag", () => ({
  retrieveRelevantContext: vi.fn(() => ""),
}));

import { POST } from "@/app/api/chat/route";

let consoleError: ReturnType<typeof vi.spyOn>;

// Exact mid-stream interruption copy from route.ts's catch — keep verbatim.
const INTERRUPTION_TEXT = "The assistant was interrupted. Please try again.";

// The route only needs headers.get + json(); jsdom has no Request global.
function makeRequest(): Request {
  return {
    headers: { get: () => null },
    json: async () => ({
      messages: [{ role: "user", content: "hello" }],
    }),
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
