import { describe, it, expect } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

/**
 * Regression pins for the metadata routes (Phase 13 quick wins). Both modules
 * are plain functions over `@/lib/site` — no mocks, no server runtime.
 *
 * The lastmod date is pinned as a LITERAL rather than imported from site.ts:
 * a pin that re-derives its expectation is a tautology, and a deliberate bump
 * of SITE_LAST_UPDATED should fail here first.
 */
const PINNED_LAST_UPDATED = "2026-10-18";

/** The single wildcard rule — the app returns one rule object, never an array. */
function wildcardRule(): { disallow?: string | string[] } | undefined {
  const rules = robots().rules;
  return Array.isArray(rules) ? rules[0] : rules;
}

describe("robots()", () => {
  it("disallows exactly /api/ — a bare /api without the trailing slash fails this pin", () => {
    expect(wildcardRule()?.disallow).toEqual(["/api/"]);
  });
});

describe("sitemap()", () => {
  it("pins every lastmod to the site's last-updated date", () => {
    const entries = sitemap();

    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.lastModified).toBe(PINNED_LAST_UPDATED);
    }
  });
});
