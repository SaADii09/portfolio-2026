"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Bot, User, Clock, RotateCcw } from "lucide-react";
import { useStore } from "@/store";
import type { Message } from "@/types/chat";
import { AssistantMarkdown } from "@/components/apps/chat-internal/AssistantMarkdown";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Shared transcript surface — one implementation for the desktop window and
 * the mobile sheet. Assistant answers render through `AssistantMarkdown`
 * (marker stripping + link allow-list live there). A failed assistant turn
 * carries `error` and gets a Retry affordance wired to `retryLast()`.
 */
export function MessageList({ messages }: { messages: Message[] }) {
  const listRef = useRef<HTMLDivElement>(null);
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
        <motion.div
          key={msg.id}
          initial={{ y: 6, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
          className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
        >
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
            style={{
              background: msg.role === "user" ? "var(--accent-1)" : "var(--bg-tertiary)",
            }}
          >
            {msg.role === "user" ? (
              <User size={12} style={{ color: "var(--bg-primary)" }} />
            ) : (
              <Bot size={12} style={{ color: "var(--text-primary)" }} />
            )}
          </div>
          <div className="max-w-[80%] flex flex-col gap-0.5">
            <div
              className="rounded-os px-3 py-2 leading-relaxed break-words"
              style={{
                background:
                  msg.role === "user"
                    ? "linear-gradient(135deg, var(--accent-1), color-mix(in srgb, var(--accent-2) 60%, var(--accent-1)))"
                    : undefined,
                color: msg.role === "user" ? "var(--bg-primary)" : "var(--text-primary)",
              }}
            >
              {msg.role === "assistant" ? (
                <AssistantMarkdown content={msg.content} streaming={msg.streaming === true} />
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
            <span
              className="flex items-center gap-1 text-[9px] px-1"
              style={{ color: "var(--text-secondary)" }}
            >
              <Clock size={8} />
              {formatTime(msg.timestamp)}
            </span>
            {msg.error === true && !isLoading && (
              <button
                onClick={() => void retryLast()}
                className="flex items-center gap-1 self-start min-h-[44px] px-2 text-[10px] underline underline-offset-2"
                style={{ color: "var(--accent-1)" }}
                aria-label="Retry the last message"
              >
                <RotateCcw size={10} />
                Retry
              </button>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
