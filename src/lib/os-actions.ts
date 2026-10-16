import { useStore } from "@/store";
import { APP_DEFS, THEME_DEFS, WIDGET_DEFS, type AppId } from "@/lib/apps";
import { getViewportBounds } from "@/lib/boundaries";
import type { WidgetType } from "@/types/widget";

/**
 * Imperative OS actions over the Zustand store — callable from anywhere
 * (launchers, terminal, command palette) via `useStore.getState()`.
 */

/** Focus an existing window whose component matches; restore if minimized, else open it. */
export function openApp(id: AppId): void {
  const def = APP_DEFS.find((a) => a.id === id);
  if (!def) return;

  const store = useStore.getState();
  const existing = store.windows.find((w) => w.component === def.component);
  if (existing) {
    if (existing.isMinimized) store.restoreWindow(existing.id);
    store.focusWindow(existing.id);
    return;
  }

  store.openWindow({ title: def.title, type: "app", component: def.component });
}

/** Remove an existing widget of the type, or add one at the right edge of the content zone. */
export function toggleWidget(type: WidgetType): "added" | "removed" {
  const store = useStore.getState();
  const existing = store.widgets.find((w) => w.type === type);
  if (existing) {
    store.removeWidget(existing.id);
    return "removed";
  }

  const def = WIDGET_DEFS.find((w) => w.type === type);
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const { topBar } = getViewportBounds(vw);
  store.addWidget(type, def?.title ?? type, vw - 220, topBar + 10 + store.widgets.length * 110);
  return "added";
}

export function musicControl(action: "play" | "pause" | "toggle" | "next" | "prev"): void {
  const store = useStore.getState();
  switch (action) {
    case "play":
      if (!store.isPlaying) store.togglePlay();
      break;
    case "pause":
      if (store.isPlaying) store.togglePlay();
      break;
    case "toggle":
      store.togglePlay();
      break;
    case "next":
      store.nextTrack();
      break;
    case "prev":
      store.prevTrack();
      break;
  }
}

/** Switch theme by name; returns false (and changes nothing) on an unknown theme. */
export function setThemeByName(name: string): boolean {
  const key = name.trim().toLowerCase();
  const def = THEME_DEFS.find((t) => t.name === key);
  if (!def) return false;
  useStore.getState().setTheme(def.name);
  return true;
}
