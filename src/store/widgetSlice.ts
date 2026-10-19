import { StateCreator } from "zustand";
import { WidgetInstance, WidgetType } from "@/types/widget";
import {
  clampWidgetBounds,
  getViewportBounds,
  DEFAULT_WIDGET_W,
  DEFAULT_WIDGET_H,
} from "@/lib/boundaries";

let nextId = 1;
const genId = () => `widget-${nextId++}-${Date.now()}`;

/** Default right-edge column x: widgets hug the viewport's right edge. */
const DEFAULT_WIDGET_COLUMN_X_OFFSET = 220;
/** Vertical stride of the bootstrap column: a 10px top gap plus one 110px row per widget. */
const DEFAULT_WIDGET_COLUMN_TOP_GAP = 10;
const DEFAULT_WIDGET_COLUMN_ROW_STRIDE = 110;

export interface WidgetSlice {
  widgets: WidgetInstance[];
  addWidget: (type: WidgetType, title: string, x: number, y: number) => void;
  removeWidget: (id: string) => void;
  updateWidgetPosition: (id: string, x: number, y: number) => void;
  toggleWidgetCollapse: (id: string) => void;
  toggleWidgetPin: (id: string) => void;
  clampAllWidgets: () => void;
  resolveAllWidgetCollisions: () => void;
  resetWidgetPositions: () => void;
}

export const createWidgetSlice: StateCreator<WidgetSlice> = (set) => ({
  widgets: [],

  addWidget: (type, title, x, y) => {
    set((s) => ({
      widgets: [
        ...s.widgets,
        {
          id: genId(),
          type,
          title,
          x,
          y,
          width: DEFAULT_WIDGET_W,
          height: DEFAULT_WIDGET_H,
          isPinned: false,
          isCollapsed: false,
        },
      ],
    }));
  },

  removeWidget: (id) => {
    set((s) => ({ widgets: s.widgets.filter((w) => w.id !== id) }));
  },

  updateWidgetPosition: (id, x, y) => {
    set((s) => ({
      widgets: s.widgets.map((w) => (w.id === id ? { ...w, x, y } : w)),
    }));
  },

  toggleWidgetCollapse: (id) => {
    set((s) => ({
      widgets: s.widgets.map((w) => (w.id === id ? { ...w, isCollapsed: !w.isCollapsed } : w)),
    }));
  },

  toggleWidgetPin: (id) => {
    set((s) => ({
      widgets: s.widgets.map((w) => (w.id === id ? { ...w, isPinned: !w.isPinned } : w)),
    }));
  },

  clampAllWidgets: () => {
    if (typeof window === "undefined") return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    set((s) => ({
      widgets: s.widgets.map((w) => {
        const cw = w.width || DEFAULT_WIDGET_W;
        const ch = w.height || DEFAULT_WIDGET_H;
        const clamped = clampWidgetBounds(w.x, w.y, cw, ch, vw, vh);
        return { ...w, ...clamped };
      }),
    }));
  },

  resetWidgetPositions: () => {
    if (typeof window === "undefined") return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const { topBar } = getViewportBounds(vw);
    set((s) => ({
      // Same bootstrap column Desktop seeds new widgets into (x = vw - 220,
      // y = topBar + 10 + i * 110), in membership (array) order. Sizes reset
      // through clampWidgetBounds' width/height result; flag state is preserved
      // by the spread.
      widgets: s.widgets.map((w, i) => ({
        ...w,
        ...clampWidgetBounds(
          vw - DEFAULT_WIDGET_COLUMN_X_OFFSET,
          topBar + DEFAULT_WIDGET_COLUMN_TOP_GAP + DEFAULT_WIDGET_COLUMN_ROW_STRIDE * i,
          DEFAULT_WIDGET_W,
          DEFAULT_WIDGET_H,
          vw,
          vh,
        ),
      })),
    }));
  },

  resolveAllWidgetCollisions: () => {
    if (typeof window === "undefined") return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    set((s) => {
      const sorted = [...s.widgets].sort((a, b) => a.y - b.y || a.x - b.x);
      for (let i = 0; i < sorted.length; i++) {
        const a = sorted[i];
        if (!a) break; // provably in-bounds; guard satisfies noUncheckedIndexedAccess
        const aw = a.width || DEFAULT_WIDGET_W;
        const ah = a.height || DEFAULT_WIDGET_H;
        for (let j = i + 1; j < sorted.length; j++) {
          const b = sorted[j];
          if (!b) continue; // provably in-bounds; guard satisfies noUncheckedIndexedAccess
          const bw = b.width || DEFAULT_WIDGET_W;
          const bh = b.height || DEFAULT_WIDGET_H;
          const overlaps = a.x < b.x + bw && a.x + aw > b.x && a.y < b.y + bh && a.y + ah > b.y;
          if (overlaps) {
            sorted[j] = { ...b, y: a.y + ah + 4 };
          }
        }
        const clamped = clampWidgetBounds(a.x, a.y, aw, ah, vw, vh);
        sorted[i] = { ...a, ...clamped };
      }
      return { widgets: sorted };
    });
  },
});
