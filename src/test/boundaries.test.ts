import { describe, it, expect } from "vitest";
import { resolveWidgetCollisions } from "@/lib/boundaries";

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
