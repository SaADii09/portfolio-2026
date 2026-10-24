"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Bot, User, Clock, RotateCcw } from "lucide-react";
import { useStore } from "@/store";
import { useScrollFade } from "@/hooks/useScrollFade";
import type { Message } from "@/types/chat";
import { AssistantMarkdown } from "@/components/apps/chat-internal/AssistantMarkdown";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Role avatar — accent fill for the visitor, surface fill for the assistant. */
function MessageAvatar({ role }: { role: Message["role"] }) {
  const isUser = role === "user";
  return (
    <div
      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
      style={{ background: isUser ? "var(--accent-1)" : "var(--bg-tertiary)" }}
    >
      {isUser ? (
        <User size={12} style={{ color: "var(--bg-primary)" }} />
      ) : (
        <Bot size={12} style={{ color: "var(--text-primary)" }} />
      )}
    </div>
  );
}

/** Assistant answers render markdown; visitor text stays verbatim. */
function BubbleBody({ msg }: { msg: Message }) {
  if (msg.role === "assistant") {
    return <AssistantMarkdown content={msg.content} streaming={msg.streaming === true} />;
  }
  return <p className="whitespace-pre-wrap">{msg.content}</p>;
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div
      className="rounded-os px-3 py-2 leading-relaxed break-words"
      style={{
        background: isUser
          ? "linear-gradient(135deg, var(--accent-1), color-mix(in srgb, var(--accent-2) 60%, var(--accent-1)))"
          : undefined,
        color: isUser ? "var(--bg-primary)" : "var(--text-primary)",
      }}
    >
      <BubbleBody msg={msg} />
    </div>
  );
}

function MessageTimestamp({ ts }: { ts: number }) {
  return (
    <span
      className="flex items-center gap-1 text-[9px] px-1"
      style={{ color: "var(--text-secondary)" }}
    >
      <Clock size={8} />
      {formatTime(ts)}
    </span>
  );
}

function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <button
      onClick={onRetry}
      className="flex items-center gap-1 self-start min-h-[44px] px-2 text-[10px] underline underline-offset-2"
      style={{ color: "var(--accent-1)" }}
      aria-label="Retry the last message"
    >
      <RotateCcw size={10} />
      Retry
    </button>
  );
}

function MessageRow({
  msg,
  isLoading,
  onRetry,
}: {
  msg: Message;
  isLoading: boolean;
  onRetry: () => void;
}) {
  const showRetry = msg.error === true && !isLoading;
  return (
    <motion.div
      initial={{ y: 6, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", damping: 20, stiffness: 300 }}
      className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
    >
      <MessageAvatar role={msg.role} />
      <div className="max-w-[80%] flex flex-col gap-0.5">
        <MessageBubble msg={msg} />
        <MessageTimestamp ts={msg.timestamp} />
        {showRetry && <RetryButton onRetry={onRetry} />}
      </div>
    </motion.div>
  );
}

/**
 * Shared transcript surface — one implementation for the desktop window and
 * the mobile sheet. Assistant answers render through `AssistantMarkdown`
 * (marker stripping + link allow-list live there). A failed assistant turn
 * carries `error` and gets a Retry affordance wired to `retryLast()`.
 *
 * This is also the chat list the short-window spec's scroll affordance (G4)
 * measures: `useScrollFade` publishes `data-scrollable` / `data-scrolled-end`
 * so the sticky-bottom fade says "more below" and disappears at the end.
 */
export function MessageList({ messages }: { messages: Message[] }) {
  const listRef = useRef<HTMLDivElement>(null);
  useScrollFade(listRef);
  const isLoading = useStore((s) => s.isLoading);
  const retryLast = useStore((s) => s.retryLast);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div
      ref={listRef}
      aria-live="polite"
      className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 font-body text-xs bg-os-surface"
    >
      {messages.length === 0 && (
        <div className="text-center py-6" style={{ color: "var(--text-secondary)" }}>
          <Bot size={24} className="mx-auto mb-2 opacity-50" />
          <p>Ask me anything about my work, skills, or projects.</p>
        </div>
      )}

      {messages.map((msg) => (
        <MessageRow key={msg.id} msg={msg} isLoading={isLoading} onRetry={() => void retryLast()} />
      ))}
    </div>
  );
}
