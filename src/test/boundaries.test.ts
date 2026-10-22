import { describe, it, expect } from "vitest";
import { resolveWidgetCollisions, availableWindowHeight, clampWindowSize } from "@/lib/boundaries";

const OTHER = { x: 100, y: 100, width: 200, isCollapsed: false };

describe("resolveWidgetCollisions", () => {
  it("pushes the widget right of an overlap with a 4px gap", () => {
    // Widget (295..495) clips the other widget's right edge (100..300);
    // the smallest push-out vector is to the right.
    const result = resolveWidgetCollisions(295, 100, 200, 100, [OTHER], 1024, 768);
    expect(result.x).toBe(OTHER.x + (OTHER.width ?? 200) + 4);
    expect(result.y).toBe(100);
  });

  it("returns a non-overlapping position unchanged", () => {
    const result = resolveWidgetCollisions(100, 300, 200, 100, [{ ...OTHER, x: 600 }], 1024, 768);
    expect(result).toEqual({ x: 100, y: 300 });
  });

  it("clamps a position beyond the viewport back into the safe zone", () => {
    const result = resolveWidgetCollisions(900, 10, 200, 100, [], 1024, 768);
    expect(result.x).toBe(824); // vw - w
    expect(result.y).toBe(36); // desktop top bar at vw 1024
  });

  it("does not skip collapsed entries itself — callers pre-filter them", () => {
    const result = resolveWidgetCollisions(
      295,
      100,
      200,
      100,
      [{ ...OTHER, isCollapsed: true }],
      1024,
      768,
    );
    expect(result.x).toBe(304);
  });
});

describe("availableWindowHeight", () => {
  it("returns 788 for desktop 1440×900", () => {
    expect(availableWindowHeight(1440, 900)).toBe(788);
  });

  it("returns 672 for mobile 375×812", () => {
    expect(availableWindowHeight(375, 812)).toBe(672);
  });

  it("collapses a floor above available (mobile 375×375, floor 470 → 235)", () => {
    const vw = 375;
    const vh = 375;
    const floor = 470;
    const available = availableWindowHeight(vw, vh); // 235
    expect(clampWindowSize(375, floor, vw, vh, floor).height).toBe(available);
  });

  it("collapses a floor above available (desktop 812×375, floor 360 → 263)", () => {
    const vw = 812;
    const vh = 375;
    const floor = 360;
    const available = availableWindowHeight(vw, vh); // 263
    expect(clampWindowSize(812, floor, vw, vh, floor).height).toBe(available);
  });

  it("uses default MIN_WINDOW_HEIGHT (200) if no floor provided", () => {
    // Minimal desktop 400x400: available = 400 - 112 = 288.
    // MIN_WINDOW_HEIGHT is 200.
    // clampWindowSize(400, 100, 400, 400) -> h = max(200, min(100, 288)) = 200.
    expect(clampWindowSize(400, 100, 400, 400).height).toBe(200);
  });
});

describe("clampWindowSize", () => {
  it("clamps height to [floor, available]", () => {
    const vw = 1000;
    const vh = 800;
    const floor = 500;
    // available = 800 - 112 = 688.
    // clamp(1000, 550, 1000, 800, 500) -> [500, 688]
    expect(clampWindowSize(1000, 550, vw, vh, floor).height).toBe(550);
    expect(clampWindowSize(1000, 450, vw, vh, floor).height).toBe(500);
    expect(clampWindowSize(1000, 700, vw, vh, floor).height).toBe(688);
  });
});
