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
 * it is prepended in that case.
 *
 * NO DEDUPE HAPPENS. The recency list is copied verbatim (minus the active
 * id), so a repeated id INSIDE the cap window is returned TWICE — the cap
 * truncation is the only thing that can drop a repeat, and only when the
 * repeat falls past the cap. The recency list from the slice never holds
 * repeats (toFront keeps one entry per activation), so this is safe in
 * practice, but the helper does not enforce it: hand it a repeated list and
 * you get a repeated warm set.
 *
 * With NO active tab (`activeTabId === null`) the result is the first `cap`
 * ids of the recency list — the null branch never throws and never empties
 * the set.
 */
export function computeWarmSet(order: string[], activeTabId: string | null, cap = 3): string[] {
  const warm = activeTabId === null ? [] : [activeTabId];
  // Drop the active id from the recency list — it is already prepended.
  // This is NOT a dedupe: a repeat anywhere else in `order` survives, and
  // only the cap truncation below can remove it. `warm` holds at most the
  // active id, which the `id !== activeTabId` test already excludes, so no
  // membership test is needed.
  const rest = order.filter((id) => id !== activeTabId);
  return [...warm, ...rest].slice(0, Math.max(cap, 0));
}

/**
 * Bounded map upsert with LRU eviction: set `key` to `value` inside `cache`
 * (update counts as a fresh use and moves the key to insertion-end), then drop
 * the oldest keys while the result exceeds `cap`. Generic — serves both the
 * string README cache (cap 5) and the `ProjectMeta` cache (cap 8); the caller
 * passes the cap override. Immutably returns `{ next }` (never mutates input).
 *
 * CAVEAT — the eviction order is `Object.keys` order, not insertion order:
 * JS lists INTEGER-like keys ("0", "1", "42") first, in ascending numeric
 * order, and only then the string keys in insertion order. The cache keys
 * here are project slugs (kebab-case, e.g. "devos" — see
 * `portfolio-data.ts`), so they are never integer-like and `keys[0..overflow)`
 * are exactly the least recently used. A numeric-like key would break that
 * order — keep the cache keys non-numeric.
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
    // The keys are non-numeric slugs → `Object.keys` order IS insertion
    // order, so keys[0..overflow) are exactly the least recently used.
    for (const oldest of keys.slice(0, overflow)) delete next[oldest];
  }
  return { next };
}
