/**
 * Pure, fallow-safe helpers behind the browser's warm-tail LRU (spec §7.5,
 * builder-check F1/F2). No store, React, or window dependencies — safe to unit
 * test and free of side effects.
 */

/**
 * Which tab ids stay mounted ("warm") given the window's RECENCY-ordered tab
 * id list (front = most recent activation). Returns the first `cap` ids.
 *
 * The active tab is ALWAYS in the returned set, even if it is absent from the
 * recency list (e.g. a very first paint before any activation was recorded) —
 * it is prepended in that case. Duplicates in `order` are ignored.
 */
export function computeWarmSet(order: string[], activeTabId: string | null, cap = 3): string[] {
  const warm = activeTabId === null ? [] : [activeTabId];
  // Dedupe against the active id; recency from the slice never holds repeats
  // (toFront keeps one entry per activation), but stay defensive here.
  const rest = order.filter((id) => id !== activeTabId && !warm.includes(id));
  return [...warm, ...rest].slice(0, Math.max(cap, 0));
}

/**
 * Bounded map upsert with LRU eviction: set `key` to `value` inside `cache`
 * (update counts as a fresh use and moves the key to insertion-end), then drop
 * the oldest keys while the result exceeds `cap`. Generic — serves both the
 * string README cache (cap 5) and the `ProjectMeta` cache (cap 8); the caller
 * passes the cap override. Immutably returns `{ next }` (never mutates input).
 */
export function evictLru<V>(
  cache: Record<string, V>,
  key: string,
  value: V,
  cap = 5,
): { next: Record<string, V> } {
  const next = { ...cache };
  delete next[key];
  next[key] = value;
  const keys = Object.keys(next);
  const overflow = keys.length - cap;
  if (overflow > 0) {
    // Plain-object numeric-ish slugs keep insertion order in `Object.keys`,
    // so keys[0..overflow) are exactly the least recently used.
    for (const oldest of keys.slice(0, overflow)) delete next[oldest];
  }
  return { next };
}
