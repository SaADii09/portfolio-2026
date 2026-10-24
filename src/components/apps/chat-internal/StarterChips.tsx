"use client";

import { useStore } from "@/store";

/**
 * PROVISIONAL starter-prompt copy — finalized at Task 11's owner gate.
 * No semantics beyond "starter prompt suggestions"; each chip hands its
 * literal text to `onPick`.
 */
const STARTERS = [
  "What can you do?",
  "Show me your projects",
  "What's your tech stack?",
  "How do I get in touch?",
] as const;

/**
 * Starter prompt suggestions shown while the conversation is empty. Chips
 * read `isLoading` from the store themselves (one implementation — callers
 * only supply `onPick`), disable while a turn streams, carry 44px touch
 * targets, and horizontally scroll when they overflow.
 */
export function StarterChips({ onPick }: { onPick: (text: string) => void }) {
  const isLoading = useStore((s) => s.isLoading);

  return (
    <div
      role="group"
      aria-label="Starter prompts"
      className="flex gap-2 overflow-x-auto px-3 py-2 flex-shrink-0 bg-os-surface"
    >
      {STARTERS.map((chip) => (
        <button
          key={chip}
          onClick={() => onPick(chip)}
          disabled={isLoading}
          className="min-h-[44px] flex-shrink-0 whitespace-nowrap px-3 text-xs font-body rounded-os border glass glass-pos disabled:opacity-40 transition-all hover:glow-sm active:scale-95"
          style={{
            color: "var(--text-primary)",
            borderColor: "color-mix(in srgb, var(--border) 40%, transparent)",
          }}
        >
          {chip}
        </button>
      ))}
    </div>
  );
}
