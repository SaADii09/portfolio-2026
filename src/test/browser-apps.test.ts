import { describe, expect, it } from "vitest";

import { BROWSER_TILES, type TileKind } from "@/lib/browser-apps";

// Interface pinned by Task 5 (spec §7): 8 curated tiles, unique names/urls,
// kind per tile (blocked → FallbackPanel, web → iframe pipeline), https-only.
//
// T5 (hardening round): the per-tile contract is pinned LITERALLY — every
// tile's url, kind and icon key is written out in the table below, never
// re-derived from the registry the test is meant to police. A change to
// BROWSER_TILES must be a deliberate edit of that table.

/** The literal contract of the 8 curated tiles. */
const EXPECTED_TILES = [
  { name: "Google", url: "https://www.google.com", kind: "blocked", icon: "search" },
  { name: "YouTube", url: "https://www.youtube.com", kind: "blocked", icon: "play" },
  { name: "GitHub", url: "https://github.com/SaADii09", kind: "blocked", icon: "github" },
  { name: "Wikipedia", url: "https://en.wikipedia.org", kind: "web", icon: "globe" },
  {
    name: "DevOS live",
    url: "https://portfolio-2026-sp9k.vercel.app",
    kind: "web",
    icon: "globe",
  },
  { name: "Auth Kit", url: "https://auth-kit-fe.vercel.app", kind: "web", icon: "globe" },
  { name: "Venuze", url: "https://venuze-dashboard.vercel.app", kind: "web", icon: "globe" },
  { name: "MegaBlog", url: "https://mega-blog-taupe.vercel.app", kind: "web", icon: "globe" },
] as const;

/** The kinds a tile may carry (the contract, not a re-derivation). */
const TILE_KINDS: readonly TileKind[] = ["blocked", "web"];

function tileByName(name: string) {
  const tile = BROWSER_TILES.find((t) => t.name === name);
  expect(tile, `tile ${name} should exist`).toBeDefined();
  return tile;
}

describe("BROWSER_TILES", () => {
  it("has exactly 8 tiles", () => {
    expect(BROWSER_TILES).toHaveLength(8);
  });

  it("has unique names", () => {
    expect(new Set(BROWSER_TILES.map((t) => t.name)).size).toBe(BROWSER_TILES.length);
  });

  it("has unique urls", () => {
    expect(new Set(BROWSER_TILES.map((t) => t.url)).size).toBe(BROWSER_TILES.length);
  });

  it("uses only valid kinds", () => {
    for (const tile of BROWSER_TILES) expect(TILE_KINDS).toContain(tile.kind);
  });

  it("kinds every url https", () => {
    for (const tile of BROWSER_TILES) {
      expect(new URL(tile.url).protocol).toBe("https:");
    }
  });

  // One pin per tile: the exact url, kind and icon key, written out above.
  it.each(EXPECTED_TILES)("pins the $name tile", ({ name, url, kind, icon }) => {
    const tile = tileByName(name);
    expect(tile?.url).toBe(url);
    expect(tile?.kind).toBe(kind);
    expect(tile?.icon).toBe(icon);
  });

  it("carries no tile outside the literal table", () => {
    const pinned = [...EXPECTED_TILES.map((t) => t.name)].sort();
    expect([...BROWSER_TILES.map((t) => t.name)].sort()).toEqual(pinned);
  });
});
