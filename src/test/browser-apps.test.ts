import { describe, expect, it } from "vitest";

import { BROWSER_TILES, type TileKind } from "@/lib/browser-apps";

// Interface pinned by Task 5 (spec §7): 8 curated tiles, unique names/urls,
// kind per tile (blocked → FallbackPanel, web → iframe pipeline), https-only.

const NAMES: readonly TileKind[] = ["blocked", "web"];

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
    for (const tile of BROWSER_TILES) expect(NAMES).toContain(tile.kind);
  });

  it("kinds every url https", () => {
    for (const tile of BROWSER_TILES) {
      expect(new URL(tile.url).protocol).toBe("https:");
    }
  });

  it('marks Google, YouTube, GitHub as "blocked"', () => {
    for (const name of ["Google", "YouTube", "GitHub"]) {
      expect(tileByName(name)?.kind).toBe("blocked");
    }
  });

  it('marks vercel tiles as "web"', () => {
    for (const name of ["DevOS live", "Auth Kit", "Venuze", "MegaBlog"]) {
      expect(tileByName(name)?.kind).toBe("web");
    }
  });

  it('marks Wikipedia as "web"', () => {
    expect(tileByName("Wikipedia")?.kind).toBe("web");
  });

  it("carries a non-empty icon key on every tile", () => {
    for (const tile of BROWSER_TILES) expect(tile.icon.length).toBeGreaterThan(0);
  });
});
