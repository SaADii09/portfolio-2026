import { describe, it, expect, vi } from "vitest";
import { createChatSlice, ChatSlice, MESSAGE_CAP, trimMessages } from "@/store/chatSlice";
import { useStore, persistMigrator, persistPartialize } from "@/store/index";
import type { WindowSlice } from "@/store/windowSlice";
import type { Message } from "@/types/chat";
import { ReadableStream } from "node:stream/web";

/** Narrow seam mirror of the slice's own WindowSeam (tests compile isolated slice stores). */
type WindowSeam = Pick<WindowSlice, "windows">;

type ChatStateSetter = (
  partial: Partial<ChatSlice> | ((s: ChatSlice) => Partial<ChatSlice>),
) => void;

/**
 * Isolated slice store, same harness shape as createPersistedDefaults.
 * `onSet` lets a test observe every `set()` the slice makes.
 */
function buildSlice(create: typeof createChatSlice, onSet?: (partial: unknown) => void) {
  const store: ChatSlice & Partial<WindowSeam> = {} as ChatSlice & Partial<WindowSeam>;
  const set: ChatStateSetter = (partial) => {
    const val = typeof partial === "function" ? partial(store as ChatSlice) : partial;
    Object.assign(store, val);
    onSet?.(val);
  };
  const get = () => store as ChatSlice;
  const api = {} as never;
  Object.assign(store, create(set, get, api));
  return store;
}

const slice = () => buildSlice(createChatSlice);

function streamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

const encode = (...lines: string[]) => lines.map((l) => new TextEncoder().encode(`${l}\n\n`));

const tokenLine = (text: string) => `data: ${JSON.stringify({ type: "token", text })}`;

function okStream(lines: string[]) {
  return {
    ok: true,
    body: streamFromChunks(encode(...lines)),
  };
}

/** Each call gets a FRESH Response body — a used ReadableStream is locked, never reusable. */
function streamedOk(lines: string[]) {
  return vi.fn().mockImplementation(async () => okStream(lines));
}

/** Stub global fetch for the slice's /api/chat call. Restores in finally by the caller. */
function stubFetch(mock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", mock);
}

describe("chatSlice v2 — ids, persistence, unread, retry, reset", () => {
  describe("message ids", () => {
    it("uses the msg-<Date.now()>-<n> format and never collides within a session", async () => {
      const store = slice();
      stubFetch(streamedOk([tokenLine("ok")]));
      try {
        await store.sendMessage("first");
        await store.sendMessage("second");
        const ids = store.messages.map((m) => m.id);
        expect(ids).toHaveLength(4); // 2 user + 2 assistant
        expect(new Set(ids).size).toBe(4); // two ids never collide in one session
        for (const id of ids) {
          expect(id).toMatch(/^msg-\d+-\d+$/);
        }
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("after a simulated reload a fresh module instance never collides with old ids", async () => {
      let oldIds: Set<string>;
      const store = slice();
      stubFetch(streamedOk([tokenLine("ok")]));
      try {
        await store.sendMessage("before reload");
        oldIds = new Set(store.messages.map((m) => m.id));
        expect(oldIds.size).toBe(2);
      } finally {
        vi.unstubAllGlobals();
      }

      const realNow = Date.now();
      const nowSpy = vi.spyOn(Date, "now").mockReturnValue(realNow + 60_000);
      vi.resetModules();
      try {
        const fresh = (await import("@/store/chatSlice")) as typeof import("@/store/chatSlice");
        const reloadedStore = buildSlice(fresh.createChatSlice);
        stubFetch(streamedOk([tokenLine("ok")]));
        try {
          await reloadedStore.sendMessage("after reload");
          for (const m of reloadedStore.messages) {
            expect(oldIds!.has(m.id)).toBe(false); // timestamps differ → no cross-reload collision
            expect(m.id).toMatch(/^msg-\d+-\d+$/);
          }
        } finally {
          vi.unstubAllGlobals();
        }
      } finally {
        nowSpy.mockRestore();
        vi.resetModules();
      }
    });
  });

  describe("persistence pipeline", () => {
    it("hydrates a v1-shaped blob (no chat fields) through the REAL migrator → chat defaults, no crash, old keys intact", () => {
      const v1Blob = {
        theme: "neon",
        customTokens: { "--bg": "#000000" },
        glassBlur: 12,
        glassSaturate: 140,
        glassOpacity: 65,
        lastGeometry: { terminal: { x: 11, y: 22, width: 640, height: 420 } },
        windows: [],
        widgets: [],
        volume: 0.4,
        currentTrack: { id: "t3", title: "Midnight Code", artist: "DevOS Beats" },
      };

      const migrated = persistMigrator(v1Blob, 1);

      expect(migrated.messages).toEqual([]);
      expect(migrated.unreadCount).toBe(0);
      expect(migrated.chatGreeted).toBe(false);
      expect(migrated.theme).toBe("neon");
      expect(migrated.volume).toBe(0.4);
    });

    it("persistPartialize stores messages (capped at 50), unreadCount, chatGreeted", () => {
      const messages: Message[] = Array.from({ length: 60 }, (_, i) => ({
        id: `m-${i}`,
        role: i % 2 === 0 ? "user" : "assistant",
        content: `message ${i}`,
        timestamp: Date.now() + i,
      }));
      useStore.setState({ messages, unreadCount: 3, chatGreeted: true });

      const persisted = persistPartialize(useStore.getState());

      expect(persisted.messages).toHaveLength(MESSAGE_CAP);
      expect(persisted.messages[0]?.id).toBe(`m-${60 - MESSAGE_CAP}`);
      expect(persisted.messages[MESSAGE_CAP - 1]?.id).toBe("m-59");
      expect(persisted.unreadCount).toBe(3);
      expect(persisted.chatGreeted).toBe(true);
    });

    it("persistPartialize EXCLUDES transient fields (chatOpen, chatExpanded, isLoading)", () => {
      useStore.setState({
        chatOpen: true,
        isLoading: true,
        unreadCount: 0,
        chatGreeted: false,
      });

      const persisted = persistPartialize(useStore.getState());

      expect(persisted).not.toHaveProperty("chatOpen");
      expect(persisted).not.toHaveProperty("chatExpanded");
      expect(persisted).not.toHaveProperty("isLoading");
    });

    it("persistPartialize coerces a trailing streaming:true assistant message to streaming:false", () => {
      useStore.setState({
        messages: [
          { id: "u1", role: "user", content: "hello", timestamp: Date.now() },
          {
            id: "a1",
            role: "assistant",
            content: "hi there",
            timestamp: Date.now(),
            streaming: true,
          },
        ],
        unreadCount: 0,
        chatGreeted: false,
      });

      const persisted = persistPartialize(useStore.getState());

      expect(persisted.messages).toHaveLength(2);
      expect(persisted.messages[1]?.streaming).toBe(false);
    });

    it("trimMessages keeps the LAST 50 and is shared with the persist pipeline", () => {
      const messages: Message[] = Array.from({ length: 55 }, (_, i) => ({
        id: `m-${i}`,
        role: "user",
        content: `m ${i}`,
        timestamp: i,
      }));
      expect(trimMessages(messages)).toHaveLength(50);
      expect(trimMessages(messages)[0]?.id).toBe("m-5");
      expect(trimMessages(messages)[49]?.id).toBe("m-54");
    });
  });

  describe("unread count", () => {
    it("increments on successful finalization when chat is hidden", async () => {
      const store = slice();
      stubFetch(streamedOk([tokenLine("Hi")]));
      try {
        await store.sendMessage("test");
        expect(store.unreadCount).toBe(1);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("does NOT increment when a non-minimized chat window is visible", async () => {
      const store = slice();
      store.windows = [
        { id: "win-1", component: "chat", isMinimized: false },
      ] as WindowSlice["windows"];
      stubFetch(streamedOk([tokenLine("Hi")]));
      try {
        await store.sendMessage("test");
        expect(store.unreadCount).toBe(0);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("does NOT count a minimized chat window as visible", async () => {
      const store = slice();
      store.windows = [
        { id: "win-1", component: "chat", isMinimized: true },
      ] as WindowSlice["windows"];
      stubFetch(streamedOk([tokenLine("Hi")]));
      try {
        await store.sendMessage("test");
        expect(store.unreadCount).toBe(1);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("does NOT increment on mobile semantics when chatOpen === true and no chat window exists", async () => {
      const store = slice();
      store.chatOpen = true;
      stubFetch(streamedOk([tokenLine("Hi")]));
      try {
        await store.sendMessage("test");
        expect(store.unreadCount).toBe(0);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("increments on HTTP-error finalization when hidden", async () => {
      const store = slice();
      stubFetch(vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "boom" }) }));
      try {
        await store.sendMessage("test");
        expect(store.unreadCount).toBe(1);
        const assistant = store.messages.find((m) => m.role === "assistant");
        expect(assistant?.streaming).toBe(false);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("counts exactly ONE unread per turn even when the stream ends in a mid-stream error", async () => {
      const store = slice();
      stubFetch(streamedOk([tokenLine("Hi"), 'data: {"type":"error","text":"Interrupted"}']));
      try {
        await store.sendMessage("test");
        expect(store.messages.some((m) => m.content.includes("Hi"))).toBe(true);
        const assistant = store.messages.find((m) => m.role === "assistant");
        expect(assistant?.content).toContain("Interrupted");
        expect(store.unreadCount).toBe(1); // one finalization, not one per error event
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  describe("retryLast", () => {
    it("re-runs the last user turn WITHOUT duplicating the user message", async () => {
      let callCount = 0;
      const fetchMock = vi.fn().mockImplementation(async () => {
        callCount++;
        return okStream([tokenLine("response")]);
      });
      stubFetch(fetchMock);
      const store = slice();
      try {
        await store.sendMessage("first user message");
        expect(store.messages).toHaveLength(2);
        expect(store.messages[0]?.content).toBe("first user message");

        await store.retryLast();

        expect(store.messages).toHaveLength(2); // user preserved, assistant replaced — not 3
        expect(store.messages[0]?.role).toBe("user");
        expect(store.messages[0]?.content).toBe("first user message");
        expect(callCount).toBe(2); // the API was called again
        const assistant = store.messages.find((m) => m.role === "assistant");
        expect(assistant?.streaming).toBe(false);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("drops everything after the last user message before re-streaming", async () => {
      const store = slice();
      stubFetch(streamedOk([tokenLine("response")]));
      try {
        await store.sendMessage("first");
        await store.sendMessage("second");
        expect(store.messages).toHaveLength(4);

        await store.retryLast();

        // user(first), assistant, user("second"), new assistant — the trailing turn was dropped and rebuilt
        expect(store.messages).toHaveLength(4);
        expect(store.messages[2]?.content).toBe("second");
        expect(store.messages[3]?.role).toBe("assistant");
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("does nothing when no user message exists", async () => {
      const store = slice();
      const fetchMock = vi.fn();
      stubFetch(fetchMock);
      try {
        await store.retryLast();
        expect(store.messages).toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("sends the last user turn to the API with the history window (last 10)", async () => {
      const store = slice();
      const fetchMock = streamedOk([tokenLine("x")]);
      stubFetch(fetchMock);
      try {
        for (let i = 0; i < 8; i++) await store.sendMessage(`t${i}`);
        fetchMock.mockClear();
        await store.retryLast();
        const init = fetchMock.mock.calls[0]?.[1] as { body: string } | undefined;
        const body = JSON.parse(init?.body ?? "{}") as {
          messages: Array<{ role: string; content: string }>;
        };
        expect(body.messages.length).toBeLessThanOrEqual(10);
        expect(body.messages[body.messages.length - 1]?.content).toBe("t7");
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  describe("clearConversation", () => {
    it("empties messages and resets unreadCount to 0", () => {
      const store = slice();
      store.messages = [
        { id: "1", role: "user", content: "hi", timestamp: Date.now() },
        { id: "2", role: "assistant", content: "hello", timestamp: Date.now() },
      ];
      store.unreadCount = 5;

      store.clearConversation();

      expect(store.messages).toEqual([]);
      expect(store.unreadCount).toBe(0);
    });

    it("keeps chatGreeted untouched", () => {
      const store = slice();
      store.chatGreeted = true;
      store.unreadCount = 3;

      store.clearConversation();

      expect(store.chatGreeted).toBe(true);
    });
  });

  describe("trim at 50 during writes", () => {
    it("caps stored messages at 50 while sending many turns", async () => {
      const store = slice();
      stubFetch(streamedOk([tokenLine("x")]));
      try {
        for (let i = 0; i < 30; i++) await store.sendMessage(`msg ${i}`);
        expect(store.messages.length).toBe(MESSAGE_CAP);
        // the 60-message history trims to the LAST 50: first kept user turn is "msg 5"
        expect(store.messages[0]?.content).toBe("msg 5");
        expect(store.messages[store.messages.length - 1]?.role).toBe("assistant");
        expect(store.messages[store.messages.length - 2]?.content).toBe("msg 29");
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  describe("rAF write-batching in the streaming loop", () => {
    it("5 rapid token writes within one frame → exactly 1 set() flush (fake rAF)", async () => {
      // Fake rAF: capture the callback; run it only AFTER sendMessage returns, i.e.
      // after the frame would have "ticked" — proving the writes accumulated in between.
      const rafCbs: Array<(time: number) => void> = [];
      const rafSpy = vi.fn((cb: (time: number) => void) => {
        rafCbs.push(cb);
        return rafCbs.length;
      });
      vi.stubGlobal("requestAnimationFrame", rafSpy);

      /** Only in-flight flush sets carry an assistant bubble still marked streaming:true. */
      let flushSets = 0;
      const store = buildSlice(createChatSlice, (val) => {
        const a = (val as Partial<ChatSlice>).messages?.find((m) => m.role === "assistant");
        if (a?.streaming === true && a.content.startsWith("t1")) flushSets++;
      });
      stubFetch(
        streamedOk([
          tokenLine("t1"),
          tokenLine("t2"),
          tokenLine("t3"),
          tokenLine("t4"),
          tokenLine("t5"),
        ]),
      );
      try {
        await store.sendMessage("hi");

        // all five token writes landed within ONE frame: a single rAF was scheduled,
        // and the buffered deltas flushed exactly once, already fully concatenated.
        expect(rafSpy).toHaveBeenCalledTimes(1);
        expect(flushSets).toBe(1);
        expect(store.messages.find((m) => m.role === "assistant")?.content).toBe("t1t2t3t4t5");

        // the frame ticking late must not flush anything again (the buffer already drained)
        rafCbs[0]?.(16);
        expect(flushSets).toBe(1);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  describe("streaming finalization", () => {
    it("always leaves the assistant bubble streaming:false, plus unread marker once", async () => {
      const store = slice();
      stubFetch(streamedOk([tokenLine("Hi")]));
      try {
        await store.sendMessage("test");
        const assistant = store.messages.find((m) => m.role === "assistant");
        expect(assistant?.streaming).toBe(false);
        expect(assistant?.content).toContain("Hi");
        expect(store.isLoading).toBe(false);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("mid-stream error event finalizes the bubble with appended error text", async () => {
      const store = slice();
      stubFetch(streamedOk([tokenLine("Hi"), 'data: {"type":"error","text":"Interrupted"}']));
      try {
        await store.sendMessage("test");
        const assistant = store.messages.find((m) => m.role === "assistant");
        expect(assistant?.content).toBe("HiInterrupted");
        expect(assistant?.streaming).toBe(false);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("network transport failure still finalizes state (store never skips the final set())", async () => {
      const store = slice();
      stubFetch(vi.fn().mockRejectedValue(new Error("Network error")));
      try {
        await store.sendMessage("test");
        const assistant = store.messages.find((m) => m.role === "assistant");
        expect(assistant?.content).toBe("Network error. Please try again.");
        expect(assistant?.streaming).toBe(false);
        expect(store.isLoading).toBe(false);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("mid-stream transport failure REPLACES accumulated content with the error copy and finalizes", async () => {
      const store = slice();
      // Stream that emits one token, then dies mid-stream.
      const failingStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`${tokenLine("tok")}\n\n`));
          setTimeout(() => controller.error(new Error("dead pipe")), 0);
        },
      });
      stubFetch(vi.fn().mockResolvedValue({ ok: true, body: failingStream }));
      try {
        await store.sendMessage("test");
        const assistant = store.messages.find((m) => m.role === "assistant");
        expect(assistant?.content).toBe("Network error. Please try again.");
        expect(assistant?.streaming).toBe(false);
        expect(assistant?.error).toBe(true);
        expect(store.isLoading).toBe(false);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("maps the missing-key server contract to friendly copy", async () => {
      const store = slice();
      stubFetch(
        vi.fn().mockResolvedValue({
          ok: false,
          json: async () => ({ error: "ANTHROPIC_API_KEY not configured" }),
        }),
      );
      try {
        await store.sendMessage("test");
        const assistant = store.messages.find((m) => m.role === "assistant");
        expect(assistant?.content).toBe("The assistant is not configured yet.");
        expect(assistant?.streaming).toBe(false);
        expect(assistant?.error).toBe(true);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  describe("greet", () => {
    it("seeds exactly one assistant greeting and flips the persisted flag", () => {
      const store = slice();

      store.greet();

      expect(store.chatGreeted).toBe(true);
      expect(store.messages).toHaveLength(1);
      expect(store.messages[0]?.role).toBe("assistant");
      expect(store.messages[0]?.content).toMatch(/Hi! I'm DevOS AI/);

      // Second call is a no-op — the flag gates it.
      store.greet();
      expect(store.messages).toHaveLength(1);
    });

    it("never greets into an existing conversation", () => {
      const store = slice();
      store.messages = [{ id: "u1", role: "user", content: "already here", timestamp: 1 }];

      store.greet();

      expect(store.messages).toHaveLength(1);
      expect(store.messages[0]?.content).toBe("already here");
      expect(store.chatGreeted).toBe(false);
    });

    it("a clear keeps the greeted flag (no second welcome after reset)", () => {
      const store = slice();
      store.greet();
      store.clearConversation();

      store.greet();

      expect(store.messages).toHaveLength(0);
      expect(store.chatGreeted).toBe(true);
    });
  });
});
