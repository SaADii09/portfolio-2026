import { StateCreator } from "zustand";
import { WindowInstance, WindowConfig } from "@/types/window";
import { clampWindowSize, clampWindowPosition } from "@/lib/boundaries";
import { MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT, INITIAL_Z_INDEX } from "@/lib/constants";
import { resolveOpenGeometry, WEBVIEW_GEOMETRY_KEY, WindowGeometry } from "@/lib/window-geometry";

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

function clampToViewport(w: WindowInstance): WindowInstance {
  if (typeof window === "undefined") return w;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const size = clampWindowSize(w.width, w.height, vw, vh);
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

/** Re-clamps a remembered rect so it fits the current viewport (safe-zone aware). */
function clampRemembered(rect: WindowGeometry, vw: number, vh: number): WindowGeometry {
  const size = clampWindowSize(rect.width, rect.height, vw, vh);
  const pos = clampWindowPosition(rect.x, rect.y, size.width, size.height, vw, vh);
  return { ...rect, ...size, ...pos };
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
    const remembered = key ? get().lastGeometry[key] : undefined;
    const geometry = remembered
      ? clampRemembered(remembered, vw, vh)
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
    set((s) => {
      const closing = s.windows.find((w) => w.id === id);
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
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id
          ? {
              ...w,
              width: Math.max(MIN_WINDOW_WIDTH, width),
              height: Math.max(MIN_WINDOW_HEIGHT, height),
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
