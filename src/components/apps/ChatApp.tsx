"use client";

import { useStore } from "@/store";
import { MessageList } from "@/components/apps/chat-internal/MessageList";
import { ChatComposer } from "@/components/apps/chat-internal/ChatComposer";
import { StarterChips } from "@/components/apps/chat-internal/StarterChips";

/**
 * Body of the Dev Chat OS window (desktop) — the shared chat internals:
 * transcript, starter suggestions while the conversation is empty, and the
 * textarea composer (Enter sends, Shift+Enter newlines). Sizing/geometry is
 * the window's; this component only fills its own height.
 */
export function ChatApp() {
  const messages = useStore((s) => s.messages);
  const isLoading = useStore((s) => s.isLoading);
  const sendMessage = useStore((s) => s.sendMessage);

  const handleSend = (text: string) => {
    if (!text.trim()) return;
    void sendMessage(text);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-os-bg">
      <MessageList messages={messages} />

      {messages.length === 0 && <StarterChips onPick={handleSend} />}

      <ChatComposer onSend={handleSend} disabled={isLoading} />
    </div>
  );
}
