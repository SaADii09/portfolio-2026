import { StateCreator } from "zustand";
import { WindowInstance, WindowConfig } from "@/types/window";
import {
  MIN_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
  INITIAL_Z_INDEX,
  DEFAULT_WINDOW_WIDTH,
  DEFAULT_WINDOW_HEIGHT,
} from "@/lib/constants";

let nextId = 1;
function generateId(): string {
  return `win-${nextId++}-${Date.now()}`;
}

function clampToViewport(w: WindowInstance): WindowInstance {
  if (typeof window === "undefined") return w;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    ...w,
    x: Math.max(0, Math.min(w.x, vw - Math.min(w.width, vw))),
    y: Math.max(0, Math.min(w.y, vh - Math.min(w.height, vh) - 60)),
  };
}

export interface WindowSlice {
  windows: WindowInstance[];
  activeWindowId: string | null;
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

  openWindow: (config) => {
    const id = generateId();
    const existing = get().windows;
    const maxZ = existing.reduce((max, w) => Math.max(max, w.zIndex), INITIAL_Z_INDEX);
    const offset = (existing.length % 10) * 30;

    const win: WindowInstance = {
      id,
      title: config.title,
      type: config.type,
      component: config.component,
      url: config.url,
      x: config.x ?? 80 + offset,
      y: config.y ?? 60 + offset,
      width: config.width ?? DEFAULT_WINDOW_WIDTH,
      height: config.height ?? DEFAULT_WINDOW_HEIGHT,
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
    set((s) => ({
      windows: s.windows.filter((w) => w.id !== id),
      activeWindowId:
        s.activeWindowId === id
          ? (s.windows.filter((w) => w.id !== id).at(-1)?.id ?? null)
          : s.activeWindowId,
    }));
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
