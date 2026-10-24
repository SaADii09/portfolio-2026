"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "@/store";
import { openApp } from "@/lib/os-actions";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { useChatActionExecutor } from "@/components/apps/chat-internal/useChatActionExecutor";
import { useChatGreeting } from "@/components/apps/chat-internal/useChatGreeting";
import { MessageList } from "@/components/apps/chat-internal/MessageList";
import { ChatComposer } from "@/components/apps/chat-internal/ChatComposer";
import { StarterChips } from "@/components/apps/chat-internal/StarterChips";
import { MessageCircle, Trash2, X } from "lucide-react";

/**
 * Thin chat shell — a visibility rule plus the mobile FAB/sheet chrome. All
 * chat UI lives in the shared `chat-internal` internals; the desktop window
 * body is `ChatApp` (via Desktop's APP_RENDERERS).
 *
 * EXECUTION RULE (chat phase, Task 5/8): ChatPanel is always mounted on both
 * platforms regardless of open state, so the executor hook below is mounted
 * exactly ONCE per runtime platform and keeps observing the streaming
 * assistant message even when the chat window/sheet is closed.
 */
export function ChatPanel() {
  const chatOpen = useStore((s) => s.chatOpen);
  const messages = useStore((s) => s.messages);
  const isLoading = useStore((s) => s.isLoading);
  const unreadCount = useStore((s) => s.unreadCount);
  const toggleChat = useStore((s) => s.toggleChat);
  const sendMessage = useStore((s) => s.sendMessage);
  const clearConversation = useStore((s) => s.clearConversation);
  // Chat is a registered OS app: the desktop edge tab stands in for the chat
  // WINDOW, so it only exists while no non-minimized chat window is on screen.
  const hasChatWindow = useStore((s) =>
    s.windows.some((w) => w.component === "chat" && !w.isMinimized),
  );
  const isMobile = useIsMobile();

  // One-shot greeting: only the mobile sheet is a chat surface here (desktop
  // renders its greeting from ChatApp inside the window).
  useChatGreeting(isMobile && chatOpen);

  // Exactly as the slice represents it: pick the assistant message whose
  // `streaming === true` and pass `{id, content}` (null when none).
  const streamingMessage = messages.find((m) => m.role === "assistant" && m.streaming === true);
  useChatActionExecutor(
    streamingMessage ? { id: streamingMessage.id, content: streamingMessage.content } : null,
  );

  const handleMobileSend = (text: string) => {
    if (!text.trim() || isLoading) return;
    void sendMessage(text);
  };

  if (isMobile) {
    return (
      <>
        {!chatOpen && (
          <button
            onClick={toggleChat}
            className="fixed bottom-20 right-4 z-[9997] flex items-center justify-center w-12 h-12 rounded-full transition-all hover:scale-110 active:scale-95 glow-sm"
            style={{
              background: "var(--accent-1)",
              color: "var(--bg-primary)",
            }}
            aria-label={`Open chat${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
          >
            <MessageCircle size={20} />
            {unreadCount > 0 && (
              <span
                className="absolute right-1 top-1 flex items-center justify-center w-4 h-4 min-w-4 rounded-full"
                style={{
                  background: "var(--bg-primary)",
                  color: "var(--accent-1)",
                  fontSize: "10px",
                  fontWeight: "600",
                  lineHeight: "1",
                }}
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        )}

        <AnimatePresence>
          {chatOpen && (
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="fixed left-0 right-0 z-[9997] flex flex-col glass-heavy border"
              style={{
                bottom: "var(--taskbar-height, 52px)",
                height: "60%",
                borderTopLeftRadius: "var(--radius)",
                borderTopRightRadius: "var(--radius)",
                borderColor: "color-mix(in srgb, var(--accent-1) 15%, transparent)",
                boxShadow: "var(--shadow-glass)",
              }}
            >
              <div className="flex items-center justify-center pt-2 pb-1">
                <div
                  className="w-10 h-1 rounded-full"
                  style={{ background: "var(--text-secondary)" }}
                />
              </div>

              <div
                className="flex items-center justify-between px-4 py-2"
                style={{
                  background: "var(--accent-1)",
                  color: "var(--bg-primary)",
                }}
              >
                <span className="font-display text-xs tracking-wide flex items-center gap-2">
                  Dev Chat
                  {isLoading && (
                    <span className="flex items-center gap-0.5 opacity-70">
                      <span
                        className="w-1 h-1 rounded-full bg-current animate-bounce"
                        style={{ animationDelay: "0ms" }}
                      />
                      <span
                        className="w-1 h-1 rounded-full bg-current animate-bounce"
                        style={{ animationDelay: "150ms" }}
                      />
                      <span
                        className="w-1 h-1 rounded-full bg-current animate-bounce"
                        style={{ animationDelay: "300ms" }}
                      />
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={clearConversation}
                    className="flex items-center justify-center min-w-[44px] min-h-[44px] transition-all hover:scale-110 active:scale-95"
                    aria-label="Clear conversation"
                  >
                    <Trash2 size={14} />
                  </button>
                  <button
                    onClick={toggleChat}
                    className="flex items-center justify-center min-w-[44px] min-h-[44px] transition-all hover:scale-110 active:scale-95"
                    aria-label="Close chat"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              <MessageList messages={messages} />

              {messages.length === 0 && <StarterChips onPick={handleMobileSend} />}

              <ChatComposer onSend={handleMobileSend} disabled={isLoading} />
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  // A chat window is already the chat surface — no edge tab beside it.
  if (hasChatWindow) return null;

  return (
    <button
      onClick={() => openApp("chat")}
      className="fixed right-0 top-1/3 z-[9997] flex items-center justify-center w-8 h-12 rounded-l-os transition-all hover:w-10 glow-sm"
      style={{
        background: "var(--accent-1)",
        color: "var(--bg-primary)",
      }}
      aria-label={`Open chat${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
    >
      <MessageCircle size={16} />
      {unreadCount > 0 && (
        <span
          className="absolute right-0 top-0 flex items-center justify-center w-4 h-4 min-w-4 rounded-full"
          style={{
            background: "var(--bg-primary)",
            color: "var(--accent-1)",
            fontSize: "10px",
            fontWeight: "600",
            lineHeight: "1",
            transform: "translate(25%, -25%)",
          }}
        >
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </button>
  );
}
