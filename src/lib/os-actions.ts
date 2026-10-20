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

/**
 * Singleton launcher for the DevOS Browser (spec §7): exactly one `browser`
 * window exists, many tabs inside it.
 *
 * Slug wiring per case:
 * - Fresh window → `pendingSlug` (the slice has no setter by design; the
 *   launcher writes the launch payload through the store and the BrowserApp
 *   consumes it exactly once via `consumePendingSlug` on mount).
 * - Relaunch on an existing window → seed the record if cold (rehydration
 *   drops slice state while the window instance persists) and then
 *   `openProjectTab` directly: the app is already mounted, so the slug has to
 *   land in state straight away instead of waiting for a consume that may
 *   never re-run.
 */
// Note (Task 11 builder-check): `openApp("projects")` will delegate here.
export function openBrowser(projectSlug?: string): void {
  const store = useStore.getState();
  const existing = store.windows.find((w) => w.type === "browser");
  if (!existing) {
    launchBrowser(projectSlug);
    return;
  }
  if (existing.isMinimized) store.restoreWindow(existing.id);
  store.focusWindow(existing.id);
  if (projectSlug) {
    // Seed before routing: a rehydrated window can carry a cold (missing)
    // slice record, and `openProjectTab` no-ops on one — the slug would
    // silently drop. Seeding is idempotent, so a warm record is untouched.
    store.openBrowserWindow(existing.id);
    store.openProjectTab(existing.id, projectSlug);
  }
}

/** First launch: open the window, then wire the slug payload if any. */
function launchBrowser(projectSlug?: string): void {
  const store = useStore.getState();
  const windowId = store.openWindow({ title: "Browser", type: "browser", component: "browser" });
  if (projectSlug) {
    // Launch payload — written through the store because the slice
    // deliberately exposes `consumePendingSlug` but no setter (Task 6).
    useStore.setState({ pendingSlug: projectSlug });
  }
  // Idempotent: only seeds the home tab when the record is missing/empty.
  store.openBrowserWindow(windowId);
}

type StoreState = ReturnType<typeof useStore.getState>;

/** Remove an existing widget of the type, or add one at the right edge of the content zone. */
export function toggleWidget(type: WidgetType): "added" | "removed" {
  const store = useStore.getState();
  const existing = store.widgets.find((w) => w.type === type);
  if (existing) {
    store.removeWidget(existing.id);
    return "removed";
  }

  addWidgetAtContentEdge(store, type);
  return "added";
}

function addWidgetAtContentEdge(store: StoreState, type: WidgetType): void {
  const def = WIDGET_DEFS.find((w) => w.type === type);
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const { topBar } = getViewportBounds(vw);
  store.addWidget(type, def?.title ?? type, vw - 220, topBar + 10 + store.widgets.length * 110);
}

export type MusicAction = "play" | "pause" | "toggle" | "next" | "prev";

const MUSIC_HANDLERS: Record<MusicAction, (store: StoreState) => void> = {
  play: (store) => {
    if (!store.isPlaying) store.togglePlay();
  },
  pause: (store) => {
    if (store.isPlaying) store.togglePlay();
  },
  toggle: (store) => store.togglePlay(),
  next: (store) => store.nextTrack(),
  prev: (store) => store.prevTrack(),
};

export function musicControl(action: MusicAction): void {
  // Unknown actions (e.g. from a stale command table) are a silent no-op, never a
  // crash — the store must stay usable no matter what callers pass in.
  const handler: ((store: StoreState) => void) | undefined = MUSIC_HANDLERS[action];
  handler?.(useStore.getState());
}

/** Switch theme by name; returns false (and changes nothing) on an unknown theme. */
export function setThemeByName(name: string): boolean {
  const key = name.trim().toLowerCase();
  const def = THEME_DEFS.find((t) => t.name === key);
  if (!def) return false;
  useStore.getState().setTheme(def.name);
  return true;
}
