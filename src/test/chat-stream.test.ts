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
