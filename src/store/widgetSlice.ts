import { StateCreator } from "zustand";
import { WidgetInstance, WidgetType } from "@/types/widget";
import { clampWidgetBounds, DEFAULT_WIDGET_W, DEFAULT_WIDGET_H } from "@/lib/boundaries";

let nextId = 1;
const genId = () => `widget-${nextId++}-${Date.now()}`;

export interface WidgetSlice {
  widgets: WidgetInstance[];
  addWidget: (type: WidgetType, title: string, x: number, y: number) => void;
  removeWidget: (id: string) => void;
  updateWidgetPosition: (id: string, x: number, y: number) => void;
  toggleWidgetCollapse: (id: string) => void;
  toggleWidgetPin: (id: string) => void;
  clampAllWidgets: () => void;
  resolveAllWidgetCollisions: () => void;
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

  resolveAllWidgetCollisions: () => {
    if (typeof window === "undefined") return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    set((s) => {
      const sorted = [...s.widgets].sort((a, b) => a.y - b.y || a.x - b.x);
      for (let i = 0; i < sorted.length; i++) {
        const a = sorted[i];
        const aw = a.width || DEFAULT_WIDGET_W;
        const ah = a.height || DEFAULT_WIDGET_H;
        for (let j = i + 1; j < sorted.length; j++) {
          const b = sorted[j];
          const bw = b.width || DEFAULT_WIDGET_W;
          const bh = b.height || DEFAULT_WIDGET_H;
          const overlaps =
            a.x < b.x + bw && a.x + aw > b.x && a.y < b.y + bh && a.y + ah > b.y;
          if (overlaps) {
            sorted[j] = { ...b, y: a.y + ah + 4 };
          }
        }
        const clamped = clampWidgetBounds(
          a.x,
          a.y,
          aw,
          ah,
          vw,
          vh,
        );
        sorted[i] = { ...a, ...clamped };
      }
      return { widgets: sorted };
    });
  },
});
