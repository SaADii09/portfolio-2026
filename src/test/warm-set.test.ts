import { describe, it, expect } from "vitest";
import { computeWarmSet, evictLru } from "@/lib/warm-set";

/**
 * Pins for the warm-tail helper (spec §7.5, builder-check F1):
 * `computeWarmSet` takes the RECENCY-ordered tab-id list (front = most recent
 * activation) — NOT the tabs array, which is creation order.
 */
describe("computeWarmSet", () => {
  it("keeps both tabs warm when only two exist", () => {
    // recency front = most recent activation
    expect(computeWarmSet(["t2", "t1"], "t2")).toEqual(["t2", "t1"]);
    expect(computeWarmSet(["t2", "t1"], "t1")).toEqual(["t1", "t2"]);
  });

  it("returns last three activations for five tabs (active first)", () => {
    expect(computeWarmSet(["t5", "t4", "t3", "t2", "t1"], "t5")).toEqual(["t5", "t4", "t3"]);
  });

  it("adds-to-front drops-tail: activating a cold tab evicts the coldest warm tab", () => {
    // 5 tabs in creation order, first tab re-activated → moved to front,
    // warm set overflows and the tail (oldest) falls out.
    expect(computeWarmSet(["t1", "t5", "t4", "t3", "t2"], "t1")).toEqual(["t1", "t5", "t4"]);
  });

  it("recomputes after a warm tab is closed (promotes the next tab)", () => {
    // t3 was warm, got closed → recency no longer contains it, tail fills in
    expect(computeWarmSet(["t1", "t2", "t4", "t5"], "t1")).toEqual(["t1", "t2", "t4"]);
  });

  it("always includes the active tab even when it is missing from the recency list", () => {
    expect(computeWarmSet(["t2", "t1"], "tX")).toEqual(["tX", "t2", "t1"]);
  });

  it("skips the active tab when scanning the recency list (no duplicate)", () => {
    expect(computeWarmSet(["t1", "t2", "t3"], "t1")).toEqual(["t1", "t2", "t3"]);
  });

  it("drops a repeated id only when it falls outside the cap window (no dedupe)", () => {
    // The helper does NOT dedupe: the recency list is copied verbatim minus
    // the active id. A repeat INSIDE the cap window is returned twice…
    expect(computeWarmSet(["t2", "t1", "t2"], "t3", 5)).toEqual(["t3", "t2", "t1", "t2"]);
    // …and the default cap of 3 is the only reason the repeat disappears here.
    expect(computeWarmSet(["t2", "t1", "t2"], "t3")).toEqual(["t3", "t2", "t1"]);
  });

  it("returns the first `cap` recency ids when there is no active tab", () => {
    // No active tab → the warm set is the recency list itself, truncated to
    // the cap. The null branch must not throw and must not empty the set.
    expect(computeWarmSet(["t4", "t3", "t2", "t1"], null, 3)).toEqual(["t4", "t3", "t2"]);
    expect(computeWarmSet(["t4", "t3", "t2", "t1"], null)).toEqual(["t4", "t3", "t2"]);
    expect(computeWarmSet(["t2", "t1"], null, 3)).toEqual(["t2", "t1"]);
  });

  it("honors a smaller cap override and returns everything when under cap", () => {
    expect(computeWarmSet(["t3", "t2", "t1"], "t3", 2)).toEqual(["t3", "t2"]);
    expect(computeWarmSet(["t2", "t1"], "t2")).toEqual(["t2", "t1"]);
  });
});

/** Generic LRU cache-upsert shared by readmeLru (cap 5) and metaLru (cap 8). */
describe("evictLru", () => {
  it("keeps the newest `cap` entries, evicting the first-in key", () => {
    let state: Record<string, string> = {};
    for (let i = 1; i <= 6; i++) {
      state = evictLru(state, `r${i}`, `html-${i}`, 5).next;
    }
    expect(Object.keys(state)).toEqual(["r2", "r3", "r4", "r5", "r6"]);
  });

  it("refreshes recency when an existing key is updated", () => {
    let state: Record<string, string> = {};
    for (let i = 1; i <= 5; i++) state = evictLru(state, `r${i}`, `v${i}`).next;
    // bump r2 to newest, then overflow — r2 must survive, r1 must go
    state = evictLru(state, "r2", "v2-new").next;
    state = evictLru(state, "r6", "v6").next;
    expect(Object.keys(state)).toEqual(["r3", "r4", "r5", "r2", "r6"]);
    expect(state["r2"]).toBe("v2-new");
  });

  it("is generic over the value type", () => {
    let state: Record<string, { n: number }> = {};
    for (let i = 1; i <= 3; i++) state = evictLru(state, `k${i}`, { n: i }, 2).next;
    expect(Object.keys(state)).toEqual(["k2", "k3"]);
    expect(state["k3"]).toEqual({ n: 3 });
  });
});
