import { StateCreator } from "zustand";
import { Message } from "@/types/chat";
import type { WindowSlice } from "./windowSlice";

/** Narrow seam for sibling window state (no type widening — isolated test stores must compile). */
type WindowSeam = Pick<WindowSlice, "windows">;

type ChatStateSetter = (
  partial: Partial<ChatSlice> | ((s: ChatSlice) => Partial<ChatSlice>),
) => void;
type ChatStateGetter = () => ChatSlice & Partial<WindowSeam>;

let msgId = 1;
function genMsgId(): string {
  return `msg-${Date.now()}-${msgId++}`;
}

export const MESSAGE_CAP = 50;

/** Stored messages are capped at 50 both on every write and in the persist pipeline. */
export function trimMessages(messages: Message[]): Message[] {
  return messages.slice(-MESSAGE_CAP);
}

function isChatVisible(get: ChatStateGetter): boolean {
  const state = get();
  const windows = state.windows ?? [];
  const hasVisibleWindow = windows.some((w) => w.component === "chat" && !w.isMinimized);
  if (hasVisibleWindow) return true;
  // Mobile semantics: no chat window exists → visibility is the chat panel itself.
  return state.chatOpen;
}

function pendingAssistant(id: string): Message {
  return { id, role: "assistant", content: "", timestamp: Date.now(), streaming: true };
}

/** Server contract: send the last 10 turns as plain role/content pairs. */
function buildApiHistory(history: Message[]): Array<{ role: Message["role"]; content: string }> {
  return history.slice(-10).map((m) => ({ role: m.role, content: m.content }));
}

async function openChatResponse(history: Message[]): Promise<Response | null> {
  try {
    return await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: buildApiHistory(history) }),
    });
  } catch {
    return null;
  }
}

/** Map an HTTP error response to the assistant copy shown in the bubble. */
async function errorCopyFrom(res: Response): Promise<string> {
  try {
    const err = (await res.json()) as { error?: string };
    return err.error === "ANTHROPIC_API_KEY not configured"
      ? "The assistant is not configured yet."
      : `Error: ${err.error}`;
  } catch {
    return "Error: Request failed";
  }
}

type SseEvent = { type: "token" | "error"; text: string };

function parseSseEvent(payload: string): SseEvent | null {
  try {
    return JSON.parse(payload) as SseEvent;
  } catch {
    return null;
  }
}

/** Emit `data: ` payloads of complete SSE lines into the turn. */
function emitPayloads(lines: string[], io: TurnIo): void {
  for (const line of lines) {
    if (line.startsWith("data: ")) io.applyEvent(line.slice(6));
  }
}

/** Effects (store writes) open to one assistant turn. Keeps the reader loop cyclomatic-flat. */
interface TurnIo {
  applyEvent: (payload: string) => void;
  /** Flush, then render a failure copy — for HTTP errors and transport failures. */
  finalizeFailure: (text: string) => void;
  /** Stream drained cleanly: flush remaining tokens, close the cursor, mark unread if hidden. */
  settle: () => void;
}

function createTurnIo(assistantId: string, set: ChatStateSetter, get: ChatStateGetter): TurnIo {
  let tokenBuffer = "";
  let rafScheduled = false;

  const patchAssistant = (patch: (m: Message) => Message) => {
    set((s) => ({
      messages: s.messages.map((m) => (m.id === assistantId ? patch(m) : m)),
    }));
  };
  const flushBuffer = () => {
    rafScheduled = false;
    if (!tokenBuffer) return;
    const buffered = tokenBuffer;
    tokenBuffer = "";
    patchAssistant((m) => ({ ...m, content: m.content + buffered }));
  };
  const scheduleFlush = () => {
    if (rafScheduled) return;
    rafScheduled = true;
    // ONE set() per animation frame: rAF batches the accumulated token deltas.
    requestAnimationFrame(flushBuffer);
  };
  const settle = () => {
    flushBuffer();
    patchAssistant((m) => (m.streaming ? { ...m, streaming: false } : m));
    set(() => ({ isLoading: false }));
    if (!isChatVisible(get)) {
      set((s) => ({ unreadCount: s.unreadCount + 1 }));
    }
  };

  return {
    applyEvent: (payload) => {
      const event = parseSseEvent(payload);
      if (!event) return;
      if (event.type === "token") {
        tokenBuffer += event.text;
        scheduleFlush();
        return;
      }
      // Terminal mid-stream failure from the route: flush pending tokens, then append.
      flushBuffer();
      patchAssistant((m) =>
        m.streaming ? { ...m, content: m.content + event.text, streaming: false } : m,
      );
    },
    finalizeFailure: (text) => {
      flushBuffer();
      patchAssistant((m) => (m.streaming ? { ...m, content: text, streaming: false } : m));
      settle();
    },
    settle,
  };
}

async function readAll(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  io: TurnIo,
  decoder: TextDecoder,
): Promise<void> {
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer = appendAndSplit(buffer, decoder.decode(value, { stream: true }), io);
  }
  // Decoder tail: the final line may lack its terminating newline.
  emitPayloads((buffer + decoder.decode() + "\n").split("\n"), io);
}

/** Append decoded text, emit the completed lines, return the carry for the next chunk. */
function appendAndSplit(buffer: string, decoded: string, io: TurnIo): string {
  const lines = (buffer + decoded).split("\n");
  emitPayloads(lines.slice(0, -1), io);
  return lines[lines.length - 1] ?? "";
}

async function consumeReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  io: TurnIo,
): Promise<void> {
  try {
    await readAll(reader, io, new TextDecoder());
  } catch {
    // Transport failure mid-stream: ALWAYS finalize (never let a dead reader skip the final set()).
    io.finalizeFailure("Network error. Please try again.");
  }
}

/** Map an open failure (transport / HTTP / no body) to the assistant copy shown in the bubble. */
async function failureCopyFor(res: Response | null): Promise<string> {
  if (res === null) return "Network error. Please try again.";
  if (!res.ok) return await errorCopyFrom(res);
  return "No response stream available.";
}

/** Shared streaming turn: one fetch + one SSE loop + exactly one finalization per turn. */
async function runAssistantTurn(
  assistantId: string,
  history: Message[],
  set: ChatStateSetter,
  get: ChatStateGetter,
): Promise<void> {
  const io = createTurnIo(assistantId, set, get);
  const res = await openChatResponse(history);
  if (res === null || !res.ok || !res.body) {
    io.finalizeFailure(await failureCopyFor(res));
    return;
  }
  await consumeReader(res.body.getReader(), io);
  io.settle();
}

export interface ChatSlice {
  chatOpen: boolean;
  chatExpanded: boolean;
  messages: Message[];
  isLoading: boolean;
  unreadCount: number;
  chatGreeted: boolean;
  toggleChat: () => void;
  setChatExpanded: (v: boolean) => void;
  sendMessage: (text: string) => Promise<void>;
  retryLast: () => Promise<void>;
  clearConversation: () => void;
  markDeliveredIfHidden: () => void;
}

export const createChatSlice: StateCreator<ChatSlice> = (set, get) => ({
  chatOpen: false,
  chatExpanded: false,
  messages: [],
  isLoading: false,
  unreadCount: 0,
  chatGreeted: false,

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
      messages: trimMessages([...s.messages, userMsg]),
      isLoading: true,
      chatExpanded: true,
    }));
    // History = everything after the user write, before the pending assistant bubble.
    const history = get().messages;
    set((s) => ({ messages: trimMessages([...s.messages, pendingAssistant(assistantId)]) }));
    await runAssistantTurn(assistantId, history, set, get);
  },

  retryLast: async () => {
    const { messages } = get();
    const lastUserIdx = messages.findLastIndex((m) => m.role === "user");
    if (lastUserIdx === -1) return;
    // Drop everything after the last user turn and re-stream it — no duplicate user message.
    const history = messages.slice(0, lastUserIdx + 1);
    const assistantId = genMsgId();
    set(() => ({
      messages: trimMessages([...history, pendingAssistant(assistantId)]),
      isLoading: true,
      chatExpanded: true,
    }));
    await runAssistantTurn(assistantId, history, set, get);
  },

  clearConversation: () => {
    set({ messages: [], unreadCount: 0 });
    // chatGreeted is intentionally NOT reset (greeting logic lives in Task 10).
  },

  markDeliveredIfHidden: () => {
    if (!isChatVisible(get)) {
      set((s) => ({ unreadCount: s.unreadCount + 1 }));
    }
  },
});
