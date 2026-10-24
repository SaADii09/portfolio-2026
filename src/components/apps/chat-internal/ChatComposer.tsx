"use client";

import { useState } from "react";
import { Send } from "lucide-react";

/**
 * Shared composer — the ONE intentional behavior upgrade of the lift: a
 * `<textarea>` instead of the legacy `<input>`, so Enter sends and
 * Shift+Enter inserts a newline. Owns its draft state and trims before
 * sending (a whitespace-only draft never dispatches, even uncontrolled).
 */
export function ChatComposer({
  onSend,
  disabled,
  autoFocus = false,
}: {
  onSend: (text: string) => void;
  disabled: boolean;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");

  const submit = () => {
    const value = text.trim();
    if (!value || disabled) return;
    onSend(value);
    setText("");
  };

  return (
    <div
      className="flex items-end gap-2 p-3 border-t flex-shrink-0"
      style={{ borderColor: "color-mix(in srgb, var(--border) 40%, transparent)" }}
    >
      <textarea
        autoFocus={autoFocus}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Type a message..."
        disabled={disabled}
        rows={1}
        className="flex-1 resize-none px-3 py-2.5 text-xs font-body rounded-os outline-none border glass glass-pos min-h-[44px] focus:glow-sm transition-shadow"
        style={{
          color: "var(--text-primary)",
          borderColor: "color-mix(in srgb, var(--border) 40%, transparent)",
        }}
      />
      <button
        onClick={submit}
        disabled={disabled || text.trim().length === 0}
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
  );
}
