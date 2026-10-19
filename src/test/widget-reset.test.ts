import { describe, it, expect, beforeEach } from "vitest";
import { createWidgetSlice, WidgetSlice } from "@/store/widgetSlice";
import { DEFAULT_WIDGET_W, DEFAULT_WIDGET_H, getViewportBounds } from "@/lib/boundaries";

/**
 * Unit tests for `resetWidgetPositions` (Task 5, control-panel/geometry plan).
 * Deliberately in their own file — `src/test/stores.test.ts` is owned by Task 4.
 *
 * Same harness shape as `stores.test.ts`: slices only use `set`/`get`, so the
 * third StateCreator argument stays an empty stub.
 */

type Slice = WidgetSlice;

function createTestStore(): Slice {
  const store: Slice = {} as Slice;
  const set = (partial: Partial<Slice> | ((s: Slice) => Partial<Slice>)) => {
    const val = typeof partial === "function" ? partial(store) : partial;
    Object.assign(store, val);
  };
  const get = () => store;
  const api = {} as never;
  Object.assign(store, createWidgetSlice(set, get, api));
  return store;
}

describe("widgetSlice.resetWidgetPositions", () => {
  let store: Slice;

  beforeEach(() => {
    store = createTestStore();
  });

  /** jsdom defaults (1024×768) → desktop geometry. */
  function expectedColumn() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const { topBar, bottomBar } = getViewportBounds(vw);
    return { vw, vh, topBar, bottomBar };
  }

  function seedTwoOffscreenWidgets(): [string, string] {
    store.addWidget("weather", "Weather", -300, 5000);
    store.addWidget("cpu", "CPU", -300, 5000);
    // Drag them further off the defaults: inflate sizes so the size reset is
    // observable, and pin/collapse one each so state preservation is observable.
    for (const w of store.widgets) {
      w.x = -300;
      w.y = 5000;
      w.width = 480;
      w.height = 320;
    }
    const ids = store.widgets.map((w) => w.id);
    const first = ids[0] ?? "";
    const second = ids[1] ?? "";
    store.toggleWidgetPin(first);
    store.toggleWidgetCollapse(second);
    return [first, second];
  }

  it("puts off-screen widgets at the default desktop column, in viewport", () => {
    const [, secondId] = seedTwoOffscreenWidgets();
    const { vw, vh, topBar, bottomBar } = expectedColumn();

    store.resetWidgetPositions();

    expect(store.widgets).toHaveLength(2);
    const weather = store.widgets.find((w) => w.id !== secondId)!;
    const cpu = store.widgets.find((w) => w.id === secondId)!;

    // Default column: x = vw - 220, y = topBar + 10 + i * 110 in membership order
    expect(weather.x).toBe(vw - 220);
    expect(weather.y).toBe(topBar + 10);
    expect(cpu.x).toBe(vw - 220);
    expect(cpu.y).toBe(topBar + 10 + 110);

    // In-bounds (clamp): right/bottom edges inside the desktop content zone
    expect(weather.x + weather.width).toBeLessThanOrEqual(vw);
    expect(weather.y).toBeGreaterThanOrEqual(topBar);
    expect(weather.y + weather.height).toBeLessThanOrEqual(vh - bottomBar);
    expect(cpu.x + cpu.width).toBeLessThanOrEqual(vw);
    expect(cpu.y + cpu.height).toBeLessThanOrEqual(vh - bottomBar);
  });

  it("preserves array order, resets sizes, and keeps ids", () => {
    const [firstId, secondId] = seedTwoOffscreenWidgets();

    store.resetWidgetPositions();

    expect(store.widgets.map((w) => w.id)).toEqual([firstId, secondId]);
    expect(store.widgets.map((w) => w.type)).toEqual(["weather", "cpu"]);
    for (const w of store.widgets) {
      expect(w.width).toBe(DEFAULT_WIDGET_W);
      expect(w.height).toBe(DEFAULT_WIDGET_H);
    }
  });

  it("preserves collapse and pin state", () => {
    const [firstId, secondId] = seedTwoOffscreenWidgets();
    const first = store.widgets.find((w) => w.id === firstId)!;
    const second = store.widgets.find((w) => w.id === secondId)!;
    expect(first.isPinned).toBe(true);
    expect(second.isCollapsed).toBe(true);

    store.resetWidgetPositions();

    expect(store.widgets.find((w) => w.id === firstId)?.isPinned).toBe(true);
    expect(store.widgets.find((w) => w.id === secondId)?.isCollapsed).toBe(true);
    // The unflagged states stay unflagged too
    expect(store.widgets.find((w) => w.id === firstId)?.isCollapsed).toBe(false);
    expect(store.widgets.find((w) => w.id === secondId)?.isPinned).toBe(false);
  });
});
