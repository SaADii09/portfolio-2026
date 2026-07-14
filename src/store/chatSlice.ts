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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

        for (const line of lines) {
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
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch {
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === assistantId
            ? { ...m, content: "Network error. Please try again.", streaming: false }
            : m,
        ),
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
