import { APP_DEFS, THEME_DEFS, WIDGET_DEFS } from "@/lib/apps";
import { musicControl, openApp, setThemeByName, toggleWidget } from "@/lib/os-actions";
import { fuzzyScore } from "@/lib/fuzzy";
import { useStore } from "@/store";
import type { Track } from "@/store/musicSlice";
import type { WidgetInstance, WidgetType } from "@/types/widget";
import type { WindowInstance } from "@/types/window";

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

function appItems(): PaletteItem[] {
  return APP_DEFS.map((app) => ({
    id: `app:${app.id}`,
    label: `Open ${app.title}`,
    category: "App",
    keywords: app.keywords,
    run: () => openApp(app.id),
  }));
}

function themeItems(): PaletteItem[] {
  return THEME_DEFS.map((theme) => ({
    id: `theme:${theme.name}`,
    label: `Switch theme: ${theme.label}`,
    category: "Theme",
    keywords: [theme.name, "theme", "appearance"],
    run: () => setThemeByName(theme.name),
  }));
}

function isWidgetShown(widgets: WidgetInstance[], type: WidgetType): boolean {
  return widgets.some((w) => w.type === type);
}

function widgetItems(widgets: WidgetInstance[]): PaletteItem[] {
  return WIDGET_DEFS.map((widget) => ({
    id: `widget:${widget.type}`,
    label: `${isWidgetShown(widgets, widget.type) ? "Hide" : "Show"} ${widget.title} widget`,
    category: "Widget",
    keywords: widget.keywords,
    run: () => toggleWidget(widget.type),
  }));
}

function musicItems(isPlaying: boolean, track: Track): PaletteItem[] {
  return [
    {
      id: "music:toggle",
      label: isPlaying ? "Pause" : "Play",
      category: "Music",
      keywords: ["music", "player", "audio", track.title, track.artist],
      run: () => musicControl("toggle"),
    },
    {
      id: "music:next",
      label: "Next track",
      category: "Music",
      keywords: ["music", "skip", "forward", "song"],
      run: () => musicControl("next"),
    },
    {
      id: "music:prev",
      label: "Previous track",
      category: "Music",
      keywords: ["music", "back", "song"],
      run: () => musicControl("prev"),
    },
  ];
}

function focusWindow(id: string, isMinimized: boolean): void {
  const store = useStore.getState();
  if (isMinimized) store.restoreWindow(id);
  store.focusWindow(id);
}

function windowItems(windows: WindowInstance[]): PaletteItem[] {
  return windows.map((w) => ({
    id: `window:${w.id}`,
    label: `Focus: ${w.title}`,
    category: "Window",
    keywords: ["window", "focus", "switch"],
    run: () => focusWindow(w.id, w.isMinimized),
  }));
}

/**
 * Pure palette source list — every app, theme, widget toggle, music control,
 * and open window as a runnable item. Filtering happens separately so the
 * palette can rebuild instantly when store state changes.
 */
export function buildPaletteItems(s: PaletteSources): PaletteItem[] {
  return [
    ...appItems(),
    ...themeItems(),
    ...widgetItems(s.widgets),
    ...musicItems(s.isPlaying, s.currentTrack),
    ...windowItems(s.windows),
  ];
}

function higherScore(current: number | null, candidate: number | null): number | null {
  if (candidate === null) return current;
  if (current === null) return candidate;
  return Math.max(current, candidate);
}

/** Best fuzzy score across an item's label and keywords; null when nothing matches. */
function bestScore(query: string, item: PaletteItem): number | null {
  const scores = [item.label, ...item.keywords].map((text) => fuzzyScore(query, text));
  return scores.reduce(higherScore, null as number | null);
}

/** Ranked (desc, stable on ties) matches; an empty query keeps source order. */
export function filterItems(items: PaletteItem[], query: string): PaletteItem[] {
  const q = query.trim();
  const scored: { item: PaletteItem; score: number }[] = [];
  for (const item of items) {
    const score = bestScore(q, item);
    if (score !== null) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((entry) => entry.item);
}
