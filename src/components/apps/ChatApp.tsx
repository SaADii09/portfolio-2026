"use client";

import { useStore } from "@/store";
import { useChatGreeting } from "@/components/apps/chat-internal/useChatGreeting";
import { MessageList } from "@/components/apps/chat-internal/MessageList";
import { ChatComposer } from "@/components/apps/chat-internal/ChatComposer";
import { StarterChips } from "@/components/apps/chat-internal/StarterChips";
import { Trash2 } from "lucide-react";

/**
 * Body of the Dev Chat OS window (desktop) — the shared chat internals:
 * transcript, starter suggestions while the conversation is empty, and the
 * textarea composer (Enter sends, Shift+Enter newlines). Sizing/geometry is
 * the window's; this component only fills its own height.
 *
 * Also fires the one-shot greeting while the window is open, and carries the
 * header's reset control (`clearConversation`).
 */
export function ChatApp() {
  const messages = useStore((s) => s.messages);
  const isLoading = useStore((s) => s.isLoading);
  const sendMessage = useStore((s) => s.sendMessage);
  const clearConversation = useStore((s) => s.clearConversation);

  useChatGreeting(true);

  const handleSend = (text: string) => {
    if (!text.trim()) return;
    void sendMessage(text);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-os-bg">
      <div
        className="flex items-center justify-between px-3 flex-shrink-0 border-b"
        style={{
          borderColor: "color-mix(in srgb, var(--border) 40%, transparent)",
        }}
      >
        <span
          className="font-display text-[9px] tracking-widest uppercase"
          style={{ color: "var(--text-secondary)" }}
        >
          Assistant
        </span>
        <button
          onClick={clearConversation}
          className="flex items-center justify-center min-w-[44px] min-h-[44px] transition-all hover:scale-110 active:scale-95"
          style={{ color: "var(--text-secondary)" }}
          aria-label="Clear conversation"
        >
          <Trash2 size={12} />
        </button>
      </div>

      <MessageList messages={messages} />

      {messages.length === 0 && <StarterChips onPick={handleSend} />}

      <ChatComposer onSend={handleSend} disabled={isLoading} />
    </div>
  );
}
