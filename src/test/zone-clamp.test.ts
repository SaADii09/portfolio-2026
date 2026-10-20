import { describe, it, expect, beforeEach } from "vitest";
import { createWindowSlice, WindowSlice } from "@/store/windowSlice";
import { clampWindowPosition, clampDragPosition } from "@/lib/boundaries";

/**
 * Zone-frame clamp pin (task-3 review fix).
 *
 * Window store coords are content-zone-relative: paintedY = y + topBar, with
 * the zone floor at 0. The clamp helpers run on live paths (drag commit,
 * resize commit, clampAllWindows on viewport resize) and must NOT re-clamp a
 * window parked in the zone's top slots up by a chrome-bar offset — that was
 * the painted-frame bug: windows opened at zone y < topBar (resume/about/
 * control-panel slots, every mobile window at zone y = 8) teleported +36px
 * (desktop) / +32px (mobile) on the first clamped interaction.
 */

describe("clampWindowPosition — zone floor", () => {
  it("keeps a window parked at the desktop zone top (y = 0)", () => {
    const pos = clampWindowPosition(100, 0, 400, 320, 1024, 768);
    expect(pos).toEqual({ x: 100, y: 0 });
    // Painted top edge = 0 + topBar(36) — exactly the zone top, not 72.
  });

  it("keeps a window parked at the mobile zone top (y = 0)", () => {
    const pos = clampWindowPosition(50, 0, 300, 400, 375, 812);
    expect(pos.y).toBe(0);
    expect(pos.y + 32).toBe(32); // painted top = status-bar edge
  });

  it("still clamps negative y up to the zone floor", () => {
    const pos = clampWindowPosition(100, -50, 400, 320, 1024, 768);
    expect(pos.y).toBe(0);
  });

  it("clamps an oversized rect to the zone frame (y max = zoneHeight − h)", () => {
    // Oversized rect: clampWindowSize caps h at vh − 112 = 656, then the max
    // bound pins y to zoneHeight − h = (768 − 112) − 656 = 0. The previous
    // pin froze a pre-zone translation bug (y max missing −topBar), which let
    // reload-clamped windows paint 36px into the dock zone and reverted
    // committed drags on reload (pinned by the full-matrix run).
    const pos = clampWindowPosition(9000, 9000, 1024, 656, 1024, 768);
    expect(pos).toEqual({ x: 0, y: 0 });
  });

  it("keeps the right/bottom clamps for oversized windows", () => {
    const pos = clampWindowPosition(100, 100, 400, 320, 1024, 768);
    expect(pos).toEqual({ x: 100, y: 100 });
    expect(clampWindowPosition(2000, 100, 400, 320, 1024, 768).x).toBe(1024 - 400);
    expect(clampWindowPosition(100, 2000, 400, 320, 1024, 768).y).toBe(768 - 36 - 76 - 320);
  });
});

describe("clampDragPosition — zone floor", () => {
  it("lets a drag commit land at the zone top (y = 0)", () => {
    expect(clampDragPosition(100, 0, 400, 1024, 768).y).toBe(0);
    expect(clampDragPosition(100, -100, 400, 1024, 768).y).toBe(0);
  });

  it("parks the painted top at the dock top (faithful pre-zone allowance)", () => {
    // y max = zoneHeight: painted top (store y + topBar) reaches the dock top
    // (768 − 76 = 692), the same allowance the painted-frame clamp had before
    // the zone shift. The previous pin ((768 − 76) in store coords) left the
    // −topBar untranslated, parking the painted top 36px inside the dock.
    expect(clampDragPosition(100, 700, 400, 1024, 768).y).toBe(768 - 36 - 76);
  });

  it("keeps the horizontal half-visibility drag clamps", () => {
    const pos = clampDragPosition(-400, 100, 400, 1024, 768);
    expect(pos.x).toBe(-200); // −(w × 0.5)
    expect(clampDragPosition(1400, 100, 400, 1024, 768).x).toBe(1024 - 200);
  });
});

describe("integration — clampAllWindows must not teleport zone-frame windows", () => {
  let store: WindowSlice;

  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 768 });
    store = {} as WindowSlice;
    const set = (partial: Partial<WindowSlice> | ((s: WindowSlice) => Partial<WindowSlice>)) => {
      const val = typeof partial === "function" ? partial(store) : partial;
      Object.assign(store, val);
    };
    const get = () => store;
    const api = {} as never;
    Object.assign(store, createWindowSlice(set, get, api) as never);
  });

  it("desktop: a window opened at zone y=0 survives clampAllWindows at y=0", () => {
    // At 1024×768 the resume slot's raw anchor clamps to the zone top.
    store.openWindow({ title: "Resume", type: "app", component: "resume" });
    expect(store.windows[0]?.y).toBe(0);
    store.clampAllWindows();
    expect(store.windows[0]?.y, "no painted-frame teleport").toBe(0);
  });

  it("mobile: a window opened at zone y=8 survives clampAllWindows at y=8", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 812 });
    store.openWindow({ title: "Contact", type: "app", component: "contact" });
    expect(store.windows[0]?.y).toBe(8); // painted 40 = status bar + 8
    store.clampAllWindows();
    expect(store.windows[0]?.y, "no status-bar teleport").toBe(8);
  });
});
