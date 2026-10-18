import { StateCreator } from "zustand";
import { Message } from "@/types/chat";

let msgId = 1;
const genMsgId = () => `msg-${msgId++}`;

export interface ChatSlice {
  chatOpen: boolean;
  chatExpanded: boolean;
  messages: Message[];
  isLoading: boolean;
  toggleChat: () => void;
  setChatExpanded: (v: boolean) => void;
  sendMessage: (text: string) => Promise<void>;
}

export const createChatSlice: StateCreator<ChatSlice> = (set, get) => ({
  chatOpen: false,
  chatExpanded: false,
  messages: [],
  isLoading: false,

  toggleChat: () => {
    set((s) => ({
      chatOpen: !s.chatOpen,
      chatExpanded: s.chatOpen ? false : true,
    }));
  },

  setChatExpanded: (v) => set({ chatExpanded: v }),

  sendMessage: async (text) => {
    const userMsg: Message = {
      id: genMsgId(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    const assistantId = genMsgId();

    set((s) => ({
      messages: [...s.messages, userMsg],
      isLoading: true,
      chatExpanded: true,
    }));

    const pending: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      streaming: true,
    };
    set((s) => ({ messages: [...s.messages, pending] }));

    const { messages } = get();
    const apiMessages = messages
      .filter((m) => m.id !== assistantId)
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === assistantId ? { ...m, content: `Error: ${err.error}`, streaming: false } : m,
          ),
          isLoading: false,
        }));
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === assistantId
              ? { ...m, content: "No response stream available.", streaming: false }
              : m,
          ),
          isLoading: false,
        }));
        return;
      }

      const decoder = new TextDecoder();

      // Accumulate across reader chunks: a token payload can be split mid-line,
      // so only complete lines are handed to the parser until the next chunk.
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "token") {
              const text: string = data.text;
              set((s) => ({
                messages: s.messages.map((m) =>
                  m.id === assistantId ? { ...m, content: m.content + text } : m,
                ),
              }));
            }
            // Terminal mid-stream failure from the route: render the
            // interruption into the streaming message (idempotent against a
            // double flush) and stop streaming.
            if (data.type === "error") {
              const text: string = data.text;
              set((s) => ({
                messages: s.messages.map((m) => {
                  if (m.id !== assistantId || m.content.includes(text)) return m;
                  return { ...m, content: m.content + text, streaming: false };
                }),
              }));
            }
          } catch {
            // skip malformed lines
          }
        }
      }

      // Flush the decoder's tail and parse any remaining complete line.
      buffer += decoder.decode();
      for (const line of buffer.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "token") {
            const text: string = data.text;
            set((s) => ({
              messages: s.messages.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + text } : m,
              ),
            }));
          }
          if (data.type === "error") {
            const text: string = data.text;
            set((s) => ({
              messages: s.messages.map((m) => {
                if (m.id !== assistantId || m.content.includes(text)) return m;
                return { ...m, content: m.content + text, streaming: false };
              }),
            }));
          }
        } catch {
          // skip malformed lines
        }
      }
    } catch {
      set((s) => ({
        messages: s.messages.map((m) => {
          if (m.id !== assistantId) return m;
          // Already finalized (e.g. by an error event before the reader
          // rejected) — leave the rendered interruption in place.
          if (!m.streaming) return m;
          return { ...m, content: "Network error. Please try again.", streaming: false };
        }),
        isLoading: false,
      }));
      return;
    }

    set((s) => ({
      messages: s.messages.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m)),
      isLoading: false,
    }));
  },
});
