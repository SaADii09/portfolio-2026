import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createWindowSlice, WindowSlice } from "@/store/windowSlice";
import { getViewportBounds } from "@/lib/boundaries";
import {
  getAppWindowGeometry,
  minHeightFor,
  WEBVIEW_GEOMETRY_KEY,
  shouldUseTableGeometry,
} from "@/lib/window-geometry";

describe("minHeightFor — the per-app floor table (short-window spec)", () => {
  it("returns every table value via the component string", () => {
    expect(minHeightFor("contact")).toBe(500);
    expect(minHeightFor("about")).toBe(480);
    expect(minHeightFor("control-panel")).toBe(420);
    expect(minHeightFor("browser")).toBe(380);
    expect(minHeightFor("projects")).toBe(360);
    expect(minHeightFor("resume")).toBe(320);
    expect(minHeightFor("terminal")).toBe(200);
  });

  it("falls back to MIN_WINDOW_HEIGHT (200) for unknown, undefined, and webview keys", () => {
    expect(minHeightFor("not-an-app")).toBe(200);
    expect(minHeightFor(undefined)).toBe(200);
    expect(minHeightFor(`${WEBVIEW_GEOMETRY_KEY}https://example.com`)).toBe(200);
  });

  it("does not inherit Object.prototype keys (review M1)", () => {
    // A tampered key must resolve to the fallback NUMBER — never an inherited
    // function (which would poison the clamp maths into NaN heights).
    expect(minHeightFor("toString")).toBe(200);
    expect(minHeightFor("constructor")).toBe(200);
    expect(minHeightFor("valueOf")).toBe(200);
    expect(minHeightFor("hasOwnProperty")).toBe(200);
  });
});

/**
 * Locked per-app geometry (control-panel/geometry design spec §4.4).
 *
 * getAppWindowGeometry returns store coords in the window content-zone frame
 * (windows paint at paintedY = y + topBar); the slot maths in the spec run in
 * painted viewport coords, so these tests assert the painted top edge:
 * topEdge = geo.y + topBar. Values below are locked, verbatim from §4.4.
 */

const TOP_BAR = 36;
const BOTTOM_BAR = 76;
const MOBILE_TOP_GAP = 8;

/** Table locked in spec §4.4 — [width, height] desktop. */
const TABLE: Record<string, [number, number]> = {
  about: [560, 620],
  projects: [720, 640],
  "control-panel": [460, 640],
  resume: [700, 760],
  terminal: [640, 420],
  contact: [480, 520],
  browser: [960, 660],
  [`${WEBVIEW_GEOMETRY_KEY}https://example.com`]: [800, 560],
};

describe("getAppWindowGeometry — desktop anchor slots @ 1440×900", () => {
  const VW = 1440;
  const VH = 900;

  /** Spec §4.4's painted frame: leftover safe-zone space under the chrome bars. */
  function painted(geo: { x: number; y: number; width: number; height: number }) {
    return { ...geo, y: geo.y + TOP_BAR };
  }

  it("control-panel opens 460×640, clamped inside the safe zone", () => {
    const geo = getAppWindowGeometry("control-panel", VW, VH, 0);
    expect([geo.width, geo.height]).toEqual(TABLE["control-panel"]);
    expect(geo.x).toBeGreaterThanOrEqual(0);
    expect(geo.x).toBeLessThan(VW);
    const top = painted(geo);
    expect(top.y).toBeGreaterThanOrEqual(TOP_BAR);
    expect(top.y).toBeLessThanOrEqual(VH - geo.height - BOTTOM_BAR);
  });

  it("projects opens 720×640", () => {
    const geo = getAppWindowGeometry("projects", VW, VH, 0);
    expect([geo.width, geo.height]).toEqual(TABLE.projects);
  });

  it("each app's size comes from the locked table", () => {
    for (const [key, [w, h]] of Object.entries(TABLE)) {
      const geo = getAppWindowGeometry(key, VW, VH, 0);
      expect([geo.width, geo.height], `size for ${key}`).toEqual([w, h]);
    }
  });

  it("resume parks center-near-top from its (0.5, 0.06) anchor", () => {
    const geo = getAppWindowGeometry("resume", VW, VH, 0);
    const leftover = VH - geo.height - BOTTOM_BAR; // 64
    // The raw anchor (3.84) lands above the top bar, so the clamp resolves to topBar.
    const top = painted(geo);
    expect(top.x).toBe(Math.round(0.5 * (VW - geo.width)));
    expect(Math.abs(top.y - Math.max(TOP_BAR, 0.06 * leftover))).toBeLessThanOrEqual(1);
  });

  it("terminal parks bottom-left from its (0, 0.9) anchor", () => {
    const geo = getAppWindowGeometry("terminal", VW, VH, 0);
    const leftover = VH - geo.height - BOTTOM_BAR; // 404
    expect(painted(geo).x).toBe(0);
    // Painted top edge at 0.9 × leftover = 364 ± 1.
    expect(Math.abs(painted(geo).y - Math.round(0.9 * leftover))).toBeLessThanOrEqual(1);
    expect(Math.abs(painted(geo).y - 364)).toBeLessThanOrEqual(1);
  });

  it("about parks left, upper-middle from its (0, 0.18) anchor", () => {
    const geo = getAppWindowGeometry("about", VW, VH, 0);
    expect(painted(geo).x).toBe(0);
    expect(
      Math.abs(painted(geo).y - Math.round(0.18 * (VH - geo.height - BOTTOM_BAR))),
    ).toBeLessThanOrEqual(1);
  });

  it("contact parks right, upper-middle from its (0.72, 0.25) anchor", () => {
    const geo = getAppWindowGeometry("contact", VW, VH, 0);
    expect(geo.width).toBe(480);
    expect(Math.abs(painted(geo).x - Math.round(0.72 * (VW - geo.width)))).toBeLessThanOrEqual(1);
    expect(
      Math.abs(painted(geo).y - Math.round(0.25 * (VH - geo.height - BOTTOM_BAR))),
    ).toBeLessThanOrEqual(1);
  });

  it("webview keys resolve via the WEBVIEW_GEOMETRY_KEY prefix to 800×560 center", () => {
    expect(WEBVIEW_GEOMETRY_KEY).toBe("webview:");
    const geo = getAppWindowGeometry(`${WEBVIEW_GEOMETRY_KEY}https://example.com`, VW, VH, 0);
    expect([geo.width, geo.height]).toEqual([800, 560]);
    expect(Math.abs(painted(geo).x - Math.round(0.5 * (VW - 800)))).toBeLessThanOrEqual(1);
    expect(
      Math.abs(painted(geo).y - Math.round(0.4 * (VH - 560 - BOTTOM_BAR))),
    ).toBeLessThanOrEqual(1);
  });

  it("browser opens 960×660 from its (0.5, 0.1) anchor", () => {
    const geo = getAppWindowGeometry("browser", VW, VH, 0);
    expect([geo.width, geo.height]).toEqual(TABLE.browser);
    expect(Math.abs(painted(geo).x - Math.round(0.5 * (VW - 960)))).toBeLessThanOrEqual(1);
    // Raw anchor 0.1 × 164 = 16.4 sits above the top bar, so the clamp parks
    // the painted top edge at the top bar itself.
    expect(painted(geo).y).toBe(TOP_BAR);
  });

  it("unknown components fall back to the legacy defaults (400×320 @ 80,60)", () => {
    const geo = getAppWindowGeometry("not-an-app", VW, VH, 0);
    expect([geo.width, geo.height]).toEqual([400, 320]);
    expect(geo.x).toBe(80);
    expect(geo.y).toBe(60);
  });

  it("every desktop window sits inside the painted safe zone", () => {
    for (const [key] of Object.entries(TABLE)) {
      const geo = getAppWindowGeometry(key, VW, VH, 0);
      const top = painted(geo);
      expect(top.y, `painted top for ${key}`).toBeGreaterThanOrEqual(TOP_BAR - 1);
      expect(top.y + geo.height, `painted bottom for ${key}`).toBeLessThanOrEqual(
        VH - BOTTOM_BAR + 1,
      );
      expect(top.x, `painted left for ${key}`).toBeGreaterThanOrEqual(-1);
      expect(top.x + geo.width, `painted right for ${key}`).toBeLessThanOrEqual(VW + 1);
    }
  });
});

describe("getAppWindowGeometry — mobile @ 375×812", () => {
  const VW = 375;
  const VH = 812;

  /** Mobile chrome: status bar 32 top, taskbar 52 bottom; painted y = y + 32. */
  function paintedTop(geo: { y: number }) {
    return geo.y + 32;
  }

  it("every app fits: size ≤ vw−32 and ≤ vh−140, painted y = topBar + 8", () => {
    const { topBar, bottomBar, isMobile } = getViewportBounds(VW);
    expect(isMobile).toBe(true);
    for (const [key, [tw, th]] of Object.entries(TABLE)) {
      const geo = getAppWindowGeometry(key, VW, VH, 0);
      expect(geo.width, `width for ${key}`).toBeLessThanOrEqual(VW - 32);
      expect(geo.height, `height for ${key}`).toBeLessThanOrEqual(VH - 140);
      const expectedW = Math.min(tw, VW - 32);
      const expectedH = Math.min(th, VH - 140);
      expect([geo.width, geo.height], `fill size for ${key}`).toEqual([expectedW, expectedH]);
      expect(paintedTop(geo), `painted y for ${key}`).toBe(topBar + MOBILE_TOP_GAP);
      expect(geo.y).toBeGreaterThan(0);
      expect(paintedTop(geo) + geo.height).toBeLessThanOrEqual(VH - bottomBar);
      expect(geo.x).toBeGreaterThanOrEqual(0);
      expect(geo.x + geo.width).toBeLessThanOrEqual(VW);
    }
  });

  it("mobile centers horizontally (leftFrac ignored)", () => {
    const geo = getAppWindowGeometry("terminal", VW, VH, 0);
    // Terminal's 343-wide fill centers with a 0.5px side gap; ±1 tolerance.
    expect(Math.abs(geo.x - (VW - geo.width) / 2)).toBeLessThanOrEqual(1);
  });

  it("cascade > 0 shifts mobile y by ≤ cascade px and never breaks the safe zone", () => {
    const base = getAppWindowGeometry("control-panel", VW, VH, 0);
    const shifted = getAppWindowGeometry("control-panel", VW, VH, 100);
    expect(Math.abs(shifted.y - base.y)).toBeLessThanOrEqual(100);
    expect(shifted.y).toBeGreaterThan(0);
    expect(paintedTop(shifted) + shifted.height).toBeLessThanOrEqual(VH - 52);
    expect(shifted.x + shifted.width).toBeLessThanOrEqual(VW);
    expect(shifted.x).toBeGreaterThanOrEqual(0);
  });
});

describe("getAppWindowGeometry — cascade and clamping", () => {
  it("cascade > 0 shifts x/y by at most cascade px", () => {
    const base = getAppWindowGeometry("about", 1440, 900, 0);
    const shifted = getAppWindowGeometry("about", 1440, 900, 150);
    expect(Math.abs(shifted.x - base.x)).toBeLessThanOrEqual(150);
    expect(Math.abs(shifted.y - base.y)).toBeLessThanOrEqual(150);
    expect(shifted.x - base.x).toBe(150);
    expect(shifted.y - base.y).toBe(150);
  });

  it("large cascade never breaks the clamps (painted frame)", () => {
    const geo = getAppWindowGeometry("control-panel", 1440, 900, 350);
    expect(geo.x).toBeLessThanOrEqual(1440 - geo.width);
    expect(geo.x).toBeGreaterThanOrEqual(0);
    expect(geo.y + TOP_BAR).toBeGreaterThanOrEqual(TOP_BAR);
    expect(geo.y + TOP_BAR + geo.height).toBeLessThanOrEqual(900 - BOTTOM_BAR);
  });

  it("degenerate viewports normalize to ≥ 320×480 and still clamp", () => {
    const geo = getAppWindowGeometry("projects", 100, 100, 0);
    expect(Number.isFinite(geo.x)).toBe(true);
    expect(Number.isFinite(geo.y)).toBe(true);
    expect(geo.width).toBeLessThanOrEqual(320);
    expect(geo.height).toBeLessThanOrEqual(480 - 36 - 76);
  });
});

describe("shouldUseTableGeometry", () => {
  it("requires all four geometry fields undefined", () => {
    expect(
      shouldUseTableGeometry({ component: "about", x: 10, y: 10, width: 10, height: 10 }),
    ).toBe(false);
    expect(shouldUseTableGeometry({ component: "about", width: 520 })).toBe(false);
    expect(shouldUseTableGeometry({ component: "about", y: 300 })).toBe(false);
    expect(shouldUseTableGeometry({ component: "about" })).toBe(true);
    expect(shouldUseTableGeometry({ url: "https://example.com" })).toBe(true);
    expect(shouldUseTableGeometry({})).toBe(false);
  });
});

describe("windowSlice.openWindow — per-app geometry wiring", () => {
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;
  let store: WindowSlice;

  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1366 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 768 });
    store = {} as WindowSlice;
    const set = (partial: Partial<WindowSlice> | ((s: WindowSlice) => Partial<WindowSlice>)) => {
      const val = typeof partial === "function" ? partial(store) : partial;
      Object.assign(store, val);
    };
    const get = () => store;
    const api = {} as never;
    Object.assign(store, createWindowSlice(set, get, api));
  });

  afterEach(() => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: originalInnerWidth });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: originalInnerHeight,
    });
  });

  it("resolves table geometry when no explicit geometry is given", () => {
    store.openWindow({ title: "Settings", type: "app", component: "control-panel" });
    const win = store.windows[0];
    expect(win?.width).toBe(460);
    expect(win?.height).toBe(640);
    // Store coords are content-zone-relative: painted top = y + topBar.
    // At 1366×768 the (0.5, 0.5) slot raws at 26, clamps to the top bar.
    expect(win?.x).toBe(Math.round(0.5 * (1366 - 460)));
    expect(win?.y).toBe(0);
  });

  it("keeps explicit config geometry (legacy ProjectsApp call shape)", () => {
    store.openWindow({
      title: "Preview",
      type: "iframe",
      url: "https://example.com",
      width: 520,
      height: 400,
    });
    const win = store.windows[0];
    expect(win?.width).toBe(520);
    expect(win?.height).toBe(400);
  });

  it("partially-explicit config keeps the legacy fallback for the missing fields", () => {
    store.openWindow({ title: "Half", type: "app", component: "terminal", width: 900 });
    const win = store.windows[0];
    expect(win?.width).toBe(900);
    expect(win?.height).toBe(320);
    expect(win?.x).toBe(80);
    expect(win?.y).toBe(60);
  });

  it("resolves webview table geometry for url-only configs", () => {
    store.openWindow({ title: "Preview", type: "iframe", url: "https://example.com" });
    const win = store.windows[0];
    expect(win?.width).toBe(800);
    expect(win?.height).toBe(560);
  });

  it("cascades repeat opens by 50px via the existing offset", () => {
    for (let i = 0; i < 3; i++) {
      store.openWindow({ title: "About", type: "app", component: "about" });
    }
    const [first, second, third] = store.windows;
    const base = getAppWindowGeometry("about", 1366, 768, 0);
    expect(first?.x).toBe(base.x);
    // About's x slot (frac 0) never clamps, so the 50px steps are exact.
    expect((second?.x ?? 0) - (first?.x ?? 0)).toBe(50);
    expect((third?.x ?? 0) - (first?.x ?? 0)).toBe(100);
    // y shifts stay within one cascade step even when the slot clamps down.
    for (const pair of [
      [first?.y, second?.y],
      [second?.y, third?.y],
    ]) {
      const [prev, next] = pair as [number, number];
      expect(Math.abs((next ?? 0) - (prev ?? 0))).toBeLessThanOrEqual(50);
    }
  });
});
