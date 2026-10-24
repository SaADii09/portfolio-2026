import { StateCreator } from "zustand";
import { WindowInstance, WindowConfig } from "@/types/window";
import { clampWindowSize, clampWindowPosition, getViewportBounds } from "@/lib/boundaries";
import { MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT, INITIAL_Z_INDEX } from "@/lib/constants";
import {
  resolveOpenGeometry,
  WEBVIEW_GEOMETRY_KEY,
  WindowGeometry,
  minHeightFor,
  clampResizedHeight,
} from "@/lib/window-geometry";
import type { BrowserSlice } from "./browserSlice";

/**
 * The narrow seam to the browser slice.
 *
 * The window slice cannot widen its own type: the browser slice is a
 * SIBLING in the composed store, and widening would cascade into the
 * isolated test stores that compose the window slice alone. So the browser
 * cleanup is reached through this optional pick — a no-op when the browser
 * slice is not composed (the isolated stores, the persist defaults).
 */
type BrowserSeam = Pick<BrowserSlice, "closeBrowserWindow">;

/**
 * Releases the browser slice's state for a CLOSED browser window (F2 + F4):
 * the window's record is unreachable garbage once the window is gone (a
 * reopened browser gets a new id), and the slice-global `pendingSlug` would
 * otherwise leak into the next browser window as a phantom project tab.
 *
 * The seam is a no-op when the browser slice is not composed (the isolated
 * test stores, the persist defaults).
 */
function releaseBrowserWindow(
  get: () => WindowSlice,
  id: string,
  closing: WindowInstance | undefined,
): void {
  if (closing?.type !== "browser") return;
  (get() as WindowSlice & BrowserSeam).closeBrowserWindow?.(id);
}

let nextId = 1;
function generateId(): string {
  return `win-${nextId++}-${Date.now()}`;
}

/** Viewport for open-time geometry resolution (windowSlice only runs client-side). */
function viewportSize() {
  if (typeof window === "undefined") {
    return { vw: MIN_WINDOW_WIDTH, vh: MIN_WINDOW_HEIGHT };
  }
  return { vw: window.innerWidth, vh: window.innerHeight };
}

/**
 * A remembered rect is usable only as a finite plain rect (review M1): a
 * tampered `lastGeometry[key]` from corrupt localStorage (a function, or a
 * non-finite rect) must not reach the clamp maths — null falls through to
 * the per-app table.
 */
function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function usableRect(value: unknown): WindowGeometry | null {
  if (typeof value !== "object" || value === null) return null;
  const r = value as WindowGeometry;
  if (![r.x, r.y, r.width, r.height].every(isFiniteNumber)) return null;
  return r;
}

function clampToViewport(w: WindowInstance): WindowInstance {
  if (typeof window === "undefined") return w;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Per-app floor (short-window spec G1): a viewport resize never leaves a
  // window shorter than its floor (collapsed to the available height when
  // the viewport cannot paint it).
  const size = clampWindowSize(w.width, w.height, vw, vh, minHeightFor(w.component));
  const pos = clampWindowPosition(w.x, w.y, size.width, size.height, vw, vh);
  return { ...w, ...size, ...pos };
}

/** Geometry key for a config: `component` for app windows, `webview:<url>` for iframe windows. */
function geometryKeyForConfig(config: WindowConfig): string {
  return config.component ?? (config.url ? `${WEBVIEW_GEOMETRY_KEY}${config.url}` : "");
}

/** Same key derivation for a live window instance (used on close). */
function geometryKeyForWindow(w: WindowInstance): string {
  return w.component ?? (w.url ? `${WEBVIEW_GEOMETRY_KEY}${w.url}` : "");
}

/**
 * Re-clamps a remembered rect so it fits the current viewport — in the ZONE
 * frame (content-zone-relative store coords: painted y = store y + topBar,
 * see the container offset in Desktop.tsx). y stays within
 * [0, zoneHeight − h], mirroring `settle()` in window-geometry.ts and the
 * zone-floor semantics of `clampWindowPosition` in boundaries.ts, which now
 * clamps the y floor at zone 0 instead of topBar (no +topBar shift on
 * restore). `key` resolves the per-app floor (short-window spec G1): a stale
 * below-floor rect (persisted before the floors shipped) restores clamped UP.
 */
function clampRemembered(
  rect: WindowGeometry,
  vw: number,
  vh: number,
  key: string,
): WindowGeometry {
  const size = clampWindowSize(rect.width, rect.height, vw, vh, minHeightFor(key));
  const { topBar, bottomBar } = getViewportBounds(vw);
  const zoneHeight = vh - topBar - bottomBar;
  return {
    x: Math.max(0, Math.min(rect.x, vw - size.width)),
    y: Math.max(0, Math.min(rect.y, zoneHeight - size.height)),
    width: size.width,
    height: size.height,
  };
}

export interface WindowSlice {
  windows: WindowInstance[];
  activeWindowId: string | null;
  /** Last committed rect per geometry key (`component` or `webview:<url>`). */
  lastGeometry: Record<string, WindowGeometry>;
  openWindow: (config: WindowConfig) => string;
  closeWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  maximizeWindow: (id: string) => void;
  restoreWindow: (id: string) => void;
  updateWindowPosition: (id: string, x: number, y: number) => void;
  updateWindowSize: (id: string, width: number, height: number) => void;
  setWindowOpacity: (id: string, opacity: number) => void;
  clampAllWindows: () => void;
}

export const createWindowSlice: StateCreator<WindowSlice> = (set, get) => ({
  windows: [],
  activeWindowId: null,
  lastGeometry: {},

  openWindow: (config) => {
    const id = generateId();
    const existing = get().windows;
    const maxZ = existing.reduce((max, w) => Math.max(max, w.zIndex), INITIAL_Z_INDEX);
    const offset = (existing.length % 8) * 50;

    // Last-window-geometry memory (spec §4.5): a remembered rect for this key
    // wins over the per-app defaults table, re-clamped to the current viewport.
    // No explicit-config priority branch — memory is checked first and only
    // falls through to `resolveOpenGeometry` when nothing was remembered.
    const { vw, vh } = viewportSize();
    const key = geometryKeyForConfig(config);
    const rememberedRect = usableRect(get().lastGeometry[key]);
    const geometry = rememberedRect
      ? clampRemembered(rememberedRect, vw, vh, key)
      : resolveOpenGeometry(config, vw, vh, offset);

    const win: WindowInstance = {
      id,
      title: config.title,
      type: config.type,
      component: config.component,
      url: config.url,
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
      zIndex: maxZ + 1,
      opacity: 1,
      isMinimized: false,
      isMaximized: false,
      isPinned: false,
    };

    set((s) => ({
      windows: [...s.windows, win],
      activeWindowId: id,
    }));
    return id;
  },

  closeWindow: (id) => {
    // The closing window is read BEFORE the set — afterwards it is gone.
    const closing = get().windows.find((w) => w.id === id);
    set((s) => {
      // Snapshot-on-close (spec §4.5): commit the window's final rect into
      // lastGeometry before filtering. Minimize/restore paths never run this.
      let lastGeometry = s.lastGeometry;
      if (closing) {
        const key = geometryKeyForWindow(closing);
        if (key) {
          lastGeometry = {
            ...s.lastGeometry,
            [key]: {
              x: closing.x,
              y: closing.y,
              width: closing.width,
              height: closing.height,
            },
          };
        }
      }
      return {
        windows: s.windows.filter((w) => w.id !== id),
        lastGeometry,
        activeWindowId:
          s.activeWindowId === id
            ? (s.windows.filter((w) => w.id !== id).at(-1)?.id ?? null)
            : s.activeWindowId,
      };
    });
    // A closed browser window drops its slice record AND the pending launch
    // payload. Every close path funnels through here, so the cleanup covers
    // the window chrome, the dock, the taskbar and the keyboard shortcuts
    // alike.
    releaseBrowserWindow(get, id, closing);
  },

  focusWindow: (id) => {
    const maxZ = get().windows.reduce((max, w) => Math.max(max, w.zIndex), INITIAL_Z_INDEX);
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, zIndex: maxZ + 1 } : w)),
      activeWindowId: id,
    }));
  },

  minimizeWindow: (id) => {
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, isMinimized: true } : w)),
    }));
  },

  maximizeWindow: (id) => {
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id ? { ...w, isMaximized: true, isMinimized: false } : w,
      ),
    }));
  },

  restoreWindow: (id) => {
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id ? { ...w, isMaximized: false, isMinimized: false } : w,
      ),
    }));
  },

  updateWindowPosition: (id, x, y) => {
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, x, y } : w)),
    }));
  },

  updateWindowSize: (id, width, height) => {
    // The floor makes the resize unfakeable (short-window spec G1): whatever
    // the gesture reports, the committed height passes clampResizedHeight —
    // never below the per-app floor, never above the paintable height.
    const { vw, vh } = viewportSize();
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id
          ? {
              ...w,
              width: Math.max(MIN_WINDOW_WIDTH, width),
              height: clampResizedHeight(height, w.component, vw, vh),
            }
          : w,
      ),
    }));
  },

  setWindowOpacity: (id, opacity) => {
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, opacity } : w)),
    }));
  },

  clampAllWindows: () => {
    set((s) => ({
      windows: s.windows.map(clampToViewport),
    }));
  },
});
