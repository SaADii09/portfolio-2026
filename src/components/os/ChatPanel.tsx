"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "@/store";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { MessageCircle, X, Send, ChevronLeft, ChevronRight, Bot, User, Clock } from "lucide-react";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ChatPanel() {
  const chatOpen = useStore((s) => s.chatOpen);
  const chatExpanded = useStore((s) => s.chatExpanded);
  const messages = useStore((s) => s.messages);
  const isLoading = useStore((s) => s.isLoading);
  const toggleChat = useStore((s) => s.toggleChat);
  const setChatExpanded = useStore((s) => s.setChatExpanded);
  const sendMessage = useStore((s) => s.sendMessage);
  const isMobile = useIsMobile();

  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    sendMessage(text);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
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
            aria-label="Open chat"
          >
            <MessageCircle size={20} />
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
                      <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
                    </span>
                  )}
                </span>
                <button
                  onClick={toggleChat}
                  className="flex items-center justify-center min-w-[44px] min-h-[44px] transition-all hover:scale-110 active:scale-95"
                  aria-label="Close chat"
                >
                  <X size={16} />
                </button>
              </div>

              <div
                ref={listRef}
                className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 font-body text-xs"
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
                        {msg.content}
                        {msg.streaming && (
                          <span
                            className="inline-block w-1.5 h-3.5 ml-0.5 animate-pulse rounded-sm"
                            style={{ background: "var(--accent-1)" }}
                          />
                        )}
                      </div>
                      <span
                        className="flex items-center gap-1 text-[9px] px-1"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        <Clock size={8} />
                        {formatTime(msg.timestamp)}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div
                className="flex items-center gap-2 p-3 border-t"
                style={{ borderColor: "color-mix(in srgb, var(--border) 40%, transparent)" }}
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  disabled={isLoading}
                  className="flex-1 px-3 py-2.5 text-xs font-body rounded-os outline-none border glass glass-pos min-h-[44px] focus:glow-sm transition-shadow"
                  style={{
                    color: "var(--text-primary)",
                    borderColor: "color-mix(in srgb, var(--border) 40%, transparent)",
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-os transition-all hover:scale-105 active:scale-95 disabled:opacity-30"
                  style={{
                    background: "var(--accent-1)",
                    color: "var(--bg-primary)",
                  }}
                  aria-label="Send"
                >
                  <Send size={16} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }
  if (!chatOpen) {
    return (
      <button
        onClick={toggleChat}
        className="fixed right-0 top-1/3 z-[9997] flex items-center justify-center w-8 h-12 rounded-l-os transition-all hover:w-10 glow-sm"
        style={{
          background: "var(--accent-1)",
          color: "var(--bg-primary)",
        }}
        aria-label="Open chat"
      >
        <MessageCircle size={16} />
      </button>
    );
  }

  return (
    <motion.div
      initial={{ x: 320 }}
      animate={{ x: 0 }}
      exit={{ x: 320 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className="fixed right-0 z-[9997] flex flex-col glass-heavy border"
      style={{
        top: 36,
        width: chatExpanded ? 280 : 240,
        bottom: 0,
        borderColor: "color-mix(in srgb, var(--accent-1) 15%, transparent)",
        boxShadow: "var(--shadow-glass)",
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-2.5"
        style={{
          background: "var(--accent-1)",
          color: "var(--bg-primary)",
        }}
      >
        <span className="font-display text-xs tracking-wide flex items-center gap-2">
          Dev Chat
          {isLoading && (
            <span className="flex items-center gap-0.5 opacity-70">
              <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
          )}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setChatExpanded(!chatExpanded)}
            className="flex items-center justify-center w-5 h-5 rounded-sm transition-all hover:scale-110 active:scale-95"
            aria-label={chatExpanded ? "Collapse" : "Expand"}
          >
            {chatExpanded ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
          </button>
          <button
            onClick={toggleChat}
            className="flex items-center justify-center w-5 h-5 rounded-sm transition-all hover:scale-110 active:scale-95"
            aria-label="Close chat"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {chatExpanded && (
        <>
          <div
            ref={listRef}
            className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 font-body text-xs"
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
                  className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    background: msg.role === "user" ? "var(--accent-1)" : "var(--bg-tertiary)",
                  }}
                >
                  {msg.role === "user" ? (
                    <User size={10} style={{ color: "var(--bg-primary)" }} />
                  ) : (
                    <Bot size={10} style={{ color: "var(--text-primary)" }} />
                  )}
                </div>
                <div className="max-w-[80%] flex flex-col gap-0.5">
                  <div
                    className="rounded-os px-2.5 py-1.5 leading-relaxed break-words"
                    style={{
                      background:
                        msg.role === "user"
                          ? "linear-gradient(135deg, var(--accent-1), color-mix(in srgb, var(--accent-2) 60%, var(--accent-1)))"
                          : undefined,
                      color: msg.role === "user" ? "var(--bg-primary)" : "var(--text-primary)",
                    }}
                  >
                    {msg.content}
                    {msg.streaming && (
                      <span
                        className="inline-block w-1.5 h-3.5 ml-0.5 animate-pulse rounded-sm"
                        style={{ background: "var(--accent-1)" }}
                      />
                    )}
                  </div>
                  <span
                    className="flex items-center gap-1 text-[9px] px-1"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <Clock size={8} />
                    {formatTime(msg.timestamp)}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>

          <div
            className="flex items-center gap-1.5 p-2.5 border-t"
            style={{ borderColor: "color-mix(in srgb, var(--border) 40%, transparent)" }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              disabled={isLoading}
              className="flex-1 px-2.5 py-1.5 text-xs font-body rounded-os outline-none border glass glass-pos focus:glow-sm transition-shadow"
              style={{
                color: "var(--text-primary)",
                borderColor: "color-mix(in srgb, var(--border) 40%, transparent)",
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="flex items-center justify-center w-7 h-7 rounded-os transition-all hover:scale-105 active:scale-95 disabled:opacity-30"
              style={{
                background: "var(--accent-1)",
                color: "var(--bg-primary)",
              }}
              aria-label="Send"
            >
              <Send size={12} />
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
}
