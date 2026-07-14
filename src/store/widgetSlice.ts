import { StateCreator } from "zustand";
import { WidgetInstance, WidgetType } from "@/types/widget";

let nextId = 1;
const genId = () => `widget-${nextId++}-${Date.now()}`;

const DEFAULT_W = 200;
const DEFAULT_H = 100;

export interface WidgetSlice {
  widgets: WidgetInstance[];
  addWidget: (type: WidgetType, title: string, x: number, y: number) => void;
  removeWidget: (id: string) => void;
  updateWidgetPosition: (id: string, x: number, y: number) => void;
  toggleWidgetCollapse: (id: string) => void;
  toggleWidgetPin: (id: string) => void;
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
          width: DEFAULT_W,
          height: DEFAULT_H,
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
});
