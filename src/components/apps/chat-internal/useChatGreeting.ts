"use client";

import { useEffect } from "react";
import { useStore } from "@/store";

/**
 * One-shot concierge greeting (Task 10). Call with the surface's visibility:
 * true while the desktop chat window is open, or while the mobile sheet is.
 * Fires only when the conversation is bare AND `chatGreeted` is still false,
 * so it can never duplicate across remounts or reloads (the flag persists).
 */
export function useChatGreeting(active: boolean): void {
  const chatGreeted = useStore((s) => s.chatGreeted);
  const messageCount = useStore((s) => s.messages.length);
  const greet = useStore((s) => s.greet);

  useEffect(() => {
    if (active && !chatGreeted && messageCount === 0) greet();
  }, [active, chatGreeted, messageCount, greet]);
}
