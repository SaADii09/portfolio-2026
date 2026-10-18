import { describe, it, expect, vi } from "vitest";
import { TextEncoder } from "node:util";
import { ReadableStream } from "node:stream/web";
import { createChatSlice, ChatSlice } from "@/store/chatSlice";

// Same shape the server emits: `data: {"type":"token","text":…}` lines, \n\n separated.
const SSE_PAYLOAD = 'data: {"type":"token","text":"Hi"}\n\n';

// Mirrors the recording set/get stub harness from src/test/stores.test.ts —
// a direct createChatSlice call, no `vi.mock("@/store")`.
function createTestStore(): ChatSlice {
  const store: ChatSlice = {} as ChatSlice;
  const set = (partial: Partial<ChatSlice> | ((s: ChatSlice) => Partial<ChatSlice>)) => {
    const val = typeof partial === "function" ? partial(store) : partial;
    Object.assign(store, val);
  };
  const get = () => store;
  const api = {} as never;
  Object.assign(store, createChatSlice(set, get, api));
  return store;
}

function streamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

describe("chatSlice SSE streaming", () => {
  it("reassembles token payloads split across reader chunks at every offset", async () => {
    const encoder = new TextEncoder();

    for (let offset = 1; offset < SSE_PAYLOAD.length; offset++) {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        body: streamFromChunks([
          encoder.encode(SSE_PAYLOAD.slice(0, offset)),
          encoder.encode(SSE_PAYLOAD.slice(offset)),
        ]),
      });
      vi.stubGlobal("fetch", fetchMock);

      try {
        const store = createTestStore();
        await store.sendMessage("t");

        const assistant = store.messages.find((m) => m.role === "assistant");
        try {
          expect(assistant?.content).toBe("Hi");
        } catch (err) {
          throw new Error(
            `split offset ${offset}: assistant content was ${JSON.stringify(assistant?.content)}`,
            { cause: err },
          );
        }
        expect(store.messages.find((m) => m.role === "assistant")?.streaming).toBe(false);
      } finally {
        vi.unstubAllGlobals();
      }
    }
  });
});

// Exact terminal-error copy emitted by the route's mid-stream catch
// (src/app/api/chat/route.ts) — keep verbatim with the route.
const INTERRUPTION_TEXT = "The assistant was interrupted. Please try again.";
const ERROR_EVENT = `data: ${JSON.stringify({ type: "error", text: INTERRUPTION_TEXT })}\n\n`;

describe("chatSlice mid-stream interruption", () => {
  it("renders the error event into the assistant message and ends streaming even when the reader then rejects", async () => {
    const encoder = new TextEncoder();
    // Simulates the route having already emitted the one-shot error event and
    // then the connection dying before a clean close: tokens land, the error
    // event lands, then reader.read() rejects. The catch path must not clobber
    // the already-rendered interruption.
    let sent = 0;
    const chunks = [
      'data: {"type":"token","text":"Hi"}\n\n',
      'data: {"type":"token","text":" there"}\n\n',
      ERROR_EVENT,
    ];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream<Uint8Array>({
        // pull-based so chunks survive until each read; erroring in start()
        // would discard already-enqueued chunks per the streams spec
        pull(controller) {
          if (sent < chunks.length) {
            controller.enqueue(encoder.encode(chunks[sent]));
            sent++;
          } else {
            controller.error(new Error("upstream broke mid-stream"));
          }
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const store = createTestStore();
      await store.sendMessage("t");

      const assistant = store.messages.find((m) => m.role === "assistant");
      expect(assistant?.content).toBe(`Hi there${INTERRUPTION_TEXT}`);
      expect(assistant?.streaming).toBe(false);
      expect(store.isLoading).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not duplicate the interruption text when the same error event arrives twice", async () => {
    const encoder = new TextEncoder();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"type":"token","text":"Hi"}\n\n'));
          controller.enqueue(encoder.encode(ERROR_EVENT));
          controller.enqueue(encoder.encode(ERROR_EVENT));
          controller.close();
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const store = createTestStore();
      await store.sendMessage("t");

      const assistant = store.messages.find((m) => m.role === "assistant");
      expect(assistant?.content).toBe(`Hi${INTERRUPTION_TEXT}`);
      expect(assistant?.streaming).toBe(false);
      expect(store.isLoading).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
