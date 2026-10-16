"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Search } from "lucide-react";
import { useStore } from "@/store";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { APP_DEFS, THEME_DEFS, WIDGET_DEFS } from "@/lib/apps";
import { musicControl, openApp, setThemeByName, toggleWidget } from "@/lib/os-actions";
import { fuzzyScore } from "@/lib/fuzzy";
import type { WindowInstance } from "@/types/window";
import type { WidgetInstance } from "@/types/widget";
import type { Track } from "@/store/musicSlice";

export type PaletteCategory = "App" | "Theme" | "Widget" | "Music" | "Window";

export interface PaletteItem {
  id: string;
  label: string;
  category: PaletteCategory;
  keywords: string[];
  run(): void;
}

export interface PaletteSources {
  windows: WindowInstance[];
  widgets: WidgetInstance[];
  isPlaying: boolean;
  currentTrack: Track;
}

/**
 * Pure palette source list — every app, theme, widget toggle, music control,
 * and open window as a runnable item. Filtering happens separately so the
 * palette can rebuild instantly when store state changes.
 */
export function buildPaletteItems(s: PaletteSources): PaletteItem[] {
  const items: PaletteItem[] = [];

  for (const app of APP_DEFS) {
    items.push({
      id: `app:${app.id}`,
      label: `Open ${app.title}`,
      category: "App",
      keywords: app.keywords,
      run: () => openApp(app.id),
    });
  }

  for (const theme of THEME_DEFS) {
    items.push({
      id: `theme:${theme.name}`,
      label: `Switch theme: ${theme.label}`,
      category: "Theme",
      keywords: [theme.name, "theme", "appearance"],
      run: () => setThemeByName(theme.name),
    });
  }

  for (const widget of WIDGET_DEFS) {
    const shown = s.widgets.some((w) => w.type === widget.type);
    items.push({
      id: `widget:${widget.type}`,
      label: `${shown ? "Hide" : "Show"} ${widget.title} widget`,
      category: "Widget",
      keywords: widget.keywords,
      run: () => toggleWidget(widget.type),
    });
  }

  items.push({
    id: "music:toggle",
    label: s.isPlaying ? "Pause" : "Play",
    category: "Music",
    keywords: ["music", "player", "audio", s.currentTrack.title, s.currentTrack.artist],
    run: () => musicControl("toggle"),
  });
  items.push({
    id: "music:next",
    label: "Next track",
    category: "Music",
    keywords: ["music", "skip", "forward", "song"],
    run: () => musicControl("next"),
  });
  items.push({
    id: "music:prev",
    label: "Previous track",
    category: "Music",
    keywords: ["music", "back", "song"],
    run: () => musicControl("prev"),
  });

  for (const w of s.windows) {
    items.push({
      id: `window:${w.id}`,
      label: `Focus: ${w.title}`,
      category: "Window",
      keywords: ["window", "focus", "switch"],
      run: () => {
        const store = useStore.getState();
        if (w.isMinimized) store.restoreWindow(w.id);
        store.focusWindow(w.id);
      },
    });
  }

  return items;
}

/** Best fuzzy score across an item's label and keywords; null when nothing matches. */
function bestScore(query: string, item: PaletteItem): number | null {
  let best: number | null = null;
  for (const text of [item.label, ...item.keywords]) {
    const score = fuzzyScore(query, text);
    if (score !== null && (best === null || score > best)) best = score;
  }
  return best;
}

/** Ranked (desc, stable on ties) matches; an empty query keeps source order. */
function filterItems(items: PaletteItem[], query: string): PaletteItem[] {
  const q = query.trim();
  const scored: { item: PaletteItem; score: number }[] = [];
  for (const item of items) {
    const score = bestScore(q, item);
    if (score !== null) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((entry) => entry.item);
}

const LISTBOX_ID = "command-palette-listbox";

const optionId = (index: number) => `command-palette-option-${index}`;

/** Everything tabbable inside the dialog, in DOM order (input first, then result rows). */
const FOCUSABLE_SELECTOR = 'input, button:not([disabled]), [tabindex]:not([tabindex="-1"])';

const paletteVariants = {
  hidden: { scale: 0.96, y: -8, opacity: 0 },
  visible: {
    scale: 1,
    y: 0,
    opacity: 1,
    transition: { type: "spring" as const, damping: 28, stiffness: 380 },
  },
  exit: { scale: 0.96, y: -8, opacity: 0, transition: { duration: 0.12 } },
};

export function CommandPalette() {
  const isMobile = useIsMobile();
  const closePalette = useStore((s) => s.closePalette);
  const windows = useStore((s) => s.windows);
  const widgets = useStore((s) => s.widgets);
  const isPlaying = useStore((s) => s.isPlaying);
  const currentTrack = useStore((s) => s.currentTrack);

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const items = useMemo(
    () => buildPaletteItems({ windows, widgets, isPlaying, currentTrack }),
    [windows, widgets, isPlaying, currentTrack],
  );
  const results = useMemo(() => filterItems(items, query), [items, query]);

  const selectedIndex = results.length === 0 ? -1 : Math.min(activeIndex, results.length - 1);

  // Autofocus on mount; restore focus to whatever was focused before on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  // Modal semantics: while the palette owns the screen the document cannot
  // scroll, and the inline styles we touched are restored on close/unmount.
  useEffect(() => {
    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousHtmlOverflow = documentElement.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    // Compensate for a disappearing classic scrollbar, but only when the
    // document actually had one (a zero clientWidth means jsdom / no layout).
    const scrollbar =
      documentElement.clientWidth > 0 ? window.innerWidth - documentElement.clientWidth : 0;
    body.style.overflow = "hidden";
    documentElement.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    return () => {
      body.style.overflow = previousBodyOverflow;
      documentElement.style.overflow = previousHtmlOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  }, []);

  // Esc ownership convention: claim the event so the global shortcut layer
  // (deferred, checks `defaultPrevented`) stands down and no window closes.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closePalette();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closePalette]);

  // Keep the highlighted row visible while arrowing through the list.
  useEffect(() => {
    if (selectedIndex < 0) return;
    document.getElementById(optionId(selectedIndex))?.scrollIntoView?.({ block: "nearest" });
  }, [selectedIndex]);

  const runItem = (item: PaletteItem) => {
    item.run();
    closePalette();
  };

  /**
   * Keep Tab inside the dialog (the palette claims `aria-modal`, so focus must
   * not walk into the page behind it). Cycles input → result rows → input; with
   * nothing else focusable, focus stays on the input.
   */
  const trapTab = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const focusables = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
    );
    if (focusables.length <= 1) {
      focusables[0]?.focus();
      return;
    }
    const current = focusables.indexOf(document.activeElement as HTMLElement);
    const next = e.shiftKey
      ? current <= 0
        ? focusables.length - 1
        : current - 1
      : (current + 1) % focusables.length;
    focusables[next]?.focus();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (results.length === 0) return;
      setActiveIndex((selectedIndex + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length === 0) return;
      setActiveIndex((selectedIndex - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[selectedIndex];
      if (item) runItem(item); // no-op when nothing is selected
    }
  };

  return (
    <motion.div
      data-testid="command-palette-overlay"
      variants={paletteVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="fixed inset-0 z-[10000] flex items-start justify-center"
      style={{
        paddingTop: isMobile ? "15vh" : "20vh",
        paddingLeft: isMobile ? 12 : 0,
        paddingRight: isMobile ? 12 : 0,
        transformOrigin: "50% 20vh",
      }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) closePalette();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={trapTab}
        className="glass-heavy flex flex-col overflow-hidden"
        style={{
          width: isMobile ? "100%" : 560,
          maxHeight: isMobile ? "60vh" : "70vh",
          borderRadius: "var(--radius)",
          border: "1px solid color-mix(in srgb, var(--accent-1) 20%, transparent)",
          boxShadow: "var(--shadow-glass-heavy)",
        }}
      >
        <div
          className="flex items-center gap-2.5 px-4 h-12 flex-shrink-0"
          style={{
            borderBottom: "1px solid color-mix(in srgb, var(--accent-1) 12%, transparent)",
          }}
        >
          <Search size={15} className="text-os-accent flex-shrink-0" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={results.length > 0 ? LISTBOX_ID : undefined}
            aria-autocomplete="list"
            aria-activedescendant={selectedIndex >= 0 ? optionId(selectedIndex) : undefined}
            aria-label="Search commands"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search apps, themes and commands…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleInputKeyDown}
            className="flex-1 min-w-0 bg-transparent outline-none text-sm font-body"
            style={{ color: "var(--text-primary)" }}
          />
        </div>

        {results.length > 0 ? (
          <div
            id={LISTBOX_ID}
            role="listbox"
            aria-label="Commands"
            className="overflow-y-auto py-1.5"
          >
            {results.map((item, i) => (
              <button
                key={item.id}
                type="button"
                id={optionId(i)}
                role="option"
                aria-selected={i === selectedIndex}
                onClick={() => runItem(item)}
                onMouseEnter={() => setActiveIndex(i)}
                className="w-full flex items-center justify-between gap-3 px-4 text-left text-xs font-body transition-colors"
                style={{
                  minHeight: 40,
                  color: "var(--text-primary)",
                  background:
                    i === selectedIndex
                      ? "color-mix(in srgb, var(--accent-1) 14%, transparent)"
                      : "transparent",
                }}
              >
                <span className="truncate">{item.label}</span>
                <span
                  className="text-[9px] flex-shrink-0"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {item.category}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div
            className="px-4 py-6 text-center text-xs font-body"
            style={{ color: "var(--text-secondary)" }}
          >
            No matching commands
          </div>
        )}
      </div>
    </motion.div>
  );
}
