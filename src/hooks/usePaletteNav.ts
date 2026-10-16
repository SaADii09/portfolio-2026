"use client";

import { useCallback, useMemo, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useStore } from "@/store";
import { filterItems } from "@/lib/paletteItems";
import type { PaletteItem, PaletteSources } from "@/lib/paletteItems";

export interface PaletteNav {
  query: string;
  results: PaletteItem[];
  selectedIndex: number;
  setQuery(value: string): void;
  select(index: number): void;
  runItem(item: PaletteItem): void;
  moveNext(): void;
  movePrev(): void;
  activate(): void;
}

/**
 * Store slices the palette renders from, selected field-by-field so the palette
 * only re-renders when one of them actually changes. Callers memoize on the
 * individual fields — the returned object is intentionally not referentially
 * stable.
 */
export function usePaletteSources(): PaletteSources {
  return {
    windows: useStore((s) => s.windows),
    widgets: useStore((s) => s.widgets),
    isPlaying: useStore((s) => s.isPlaying),
    currentTrack: useStore((s) => s.currentTrack),
  };
}

/** Index of the highlighted row, clamped into range (-1 when there are no results). */
function clampSelection(index: number, count: number): number {
  if (count === 0) return -1;
  return Math.min(index, count - 1);
}

/** Wrap an index into `[0, count)` so arrow navigation cycles the list. */
function wrapIndex(value: number, count: number): number {
  return ((value % count) + count) % count;
}

/** Selection, filtering and command-dispatch state for the command palette. */
export function usePaletteNav(items: PaletteItem[]): PaletteNav {
  const closePalette = useStore((s) => s.closePalette);
  const [query, setQueryRaw] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const results = useMemo(() => filterItems(items, query), [items, query]);
  const selectedIndex = clampSelection(activeIndex, results.length);

  const setQuery = useCallback((value: string) => {
    setQueryRaw(value);
    setActiveIndex(0);
  }, []);

  const select = useCallback((index: number) => setActiveIndex(index), []);

  const runItem = useCallback(
    (item: PaletteItem) => {
      item.run();
      closePalette();
    },
    [closePalette],
  );

  const moveNext = useCallback(() => {
    if (results.length === 0) return;
    setActiveIndex(wrapIndex(selectedIndex + 1, results.length));
  }, [selectedIndex, results.length]);

  const movePrev = useCallback(() => {
    if (results.length === 0) return;
    setActiveIndex(wrapIndex(selectedIndex - 1, results.length));
  }, [selectedIndex, results.length]);

  const activate = useCallback(() => {
    const item = results[selectedIndex];
    if (item) runItem(item); // no-op when nothing is selected
  }, [results, selectedIndex, runItem]);

  return { query, results, selectedIndex, setQuery, select, runItem, moveNext, movePrev, activate };
}

type NavCommand = "next" | "prev" | "activate";

const KEY_COMMANDS: Record<string, NavCommand | undefined> = {
  ArrowDown: "next",
  ArrowUp: "prev",
  Enter: "activate",
};

const RUN_COMMAND: Record<NavCommand, (nav: PaletteNav) => void> = {
  next: (nav) => nav.moveNext(),
  prev: (nav) => nav.movePrev(),
  activate: (nav) => nav.activate(),
};

/** Search-input key handling: arrow keys move the highlight, Enter runs it. */
export function handleInputKeyDown(e: ReactKeyboardEvent<HTMLInputElement>, nav: PaletteNav): void {
  const command = KEY_COMMANDS[e.key];
  if (!command) return;
  e.preventDefault();
  RUN_COMMAND[command](nav);
}
