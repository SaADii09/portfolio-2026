import { afterEach, describe, expect, it, vi } from "vitest";

import { BROWSER_TILES } from "@/lib/browser-apps";
import { PROJECTS } from "@/lib/portfolio-data";
import { isScreenshotAllowed, SCREENSHOT_ALLOWED_ORIGINS } from "@/lib/screenshot-allowlist";

// Interface pinned by Task 2 (screenshot allow-list module):
//   SCREENSHOT_ALLOWED_ORIGINS — PROJECTS repo/demo origins + "https://github.com"
//   isScreenshotAllowed(url) — https: protocol + origin in the set
// github.com stays eligible (Review Focus 5): repo pages are a capture target.
// Task 5 unions BROWSER_TILES origins into the set.

describe("SCREENSHOT_ALLOWED_ORIGINS", () => {
  it("contains the github.com origin", () => {
    expect(SCREENSHOT_ALLOWED_ORIGINS.has("https://github.com")).toBe(true);
  });

  it("contains an origin derived from every PROJECTS repoUrl", () => {
    for (const project of PROJECTS) {
      expect(SCREENSHOT_ALLOWED_ORIGINS.has(new URL(project.repoUrl).origin)).toBe(true);
    }
  });

  it("contains an origin derived from every PROJECTS demoUrl", () => {
    for (const project of PROJECTS) {
      if (!project.demoUrl) continue;
      expect(SCREENSHOT_ALLOWED_ORIGINS.has(new URL(project.demoUrl).origin)).toBe(true);
    }
  });

  it("contains the curated tile origins, pinned literally", () => {
    // The literal tile origins — not a re-derivation from the same registry
    // the module reads — so a tile change cannot silently drop its capture
    // eligibility.
    for (const origin of [
      "https://www.google.com",
      "https://www.youtube.com",
      "https://github.com",
      "https://en.wikipedia.org",
      "https://portfolio-2026-sp9k.vercel.app",
      "https://auth-kit-fe.vercel.app",
      "https://venuze-dashboard.vercel.app",
      "https://mega-blog-taupe.vercel.app",
    ]) {
      expect(SCREENSHOT_ALLOWED_ORIGINS.has(origin), origin).toBe(true);
    }
  });
});

describe("isScreenshotAllowed", () => {
  it("allows every BROWSER_TILES origin (Task 5 union)", () => {
    for (const tile of BROWSER_TILES) {
      expect(isScreenshotAllowed(tile.url), tile.name).toBe(true);
    }
  });

  it("allows the vercel app-tile origin with a path", () => {
    expect(isScreenshotAllowed("https://auth-kit-fe.vercel.app/some/path")).toBe(true);
  });

  it("allows google.com even though the tile renders blocked-fallback", () => {
    expect(isScreenshotAllowed("https://www.google.com/search?q=x")).toBe(true);
  });

  it("allows github.com profile and repo urls", () => {
    expect(isScreenshotAllowed("https://github.com/SaADii09")).toBe(true);
    expect(isScreenshotAllowed("https://github.com/SaADii09/devos")).toBe(true);
  });

  it("allows a deployed demo origin", () => {
    expect(isScreenshotAllowed("https://portfolio-2026-sp9k.vercel.app/")).toBe(true);
  });

  it("rejects http even on an allow-listed origin", () => {
    expect(isScreenshotAllowed("http://github.com/x")).toBe(false);
  });

  it("rejects unknown origins", () => {
    expect(isScreenshotAllowed("https://evil.example")).toBe(false);
  });

  it("rejects unparseable urls", () => {
    expect(isScreenshotAllowed("not a url")).toBe(false);
    expect(isScreenshotAllowed("://missing-scheme")).toBe(false);
  });

  it("accepts https urls whose hostname suffix-matches EMBED_BLOCKED_HOSTS (T0 ruling)", () => {
    // The origin set is origin-EXACT (www.youtube.com ≠ youtube.com), so the
    // host suffix-match is the widening that covers refuser-host captures —
    // Microlink does the actual fetching.
    expect(isScreenshotAllowed("https://youtube.com/watch?v=x")).toBe(true);
    expect(isScreenshotAllowed("https://www.youtube.com/watch?v=x")).toBe(true);
    expect(isScreenshotAllowed("https://api.reddit.com/r/dev")).toBe(true);
  });

  it("still rejects non-https on a widened host and unknown hosts under it", () => {
    expect(isScreenshotAllowed("http://youtube.com/watch?v=x")).toBe(false);
    expect(isScreenshotAllowed("https://evil.example")).toBe(false);
    expect(isScreenshotAllowed("https://notyoutube.com")).toBe(false);
  });
});

describe("allow-list module load", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/browser-apps");
    vi.resetModules();
  });

  it("imports cleanly and skips a malformed tile url", async () => {
    // The allow set is derived from the tile registry at MODULE LOAD — a
    // malformed tile url must be skipped, never thrown (a throw would take
    // down BOTH /api/screenshot and /api/project-meta). The tile registry
    // itself is owned elsewhere, so the resilience lives on this side.
    vi.doMock("@/lib/browser-apps", () => ({
      BROWSER_TILES: [
        { name: "Broken", url: "not a url", kind: "blocked", icon: "globe" },
        { name: "Wiki", url: "https://en.wikipedia.org", kind: "web", icon: "globe" },
      ],
    }));
    vi.resetModules();

    const allowlist = await import("@/lib/screenshot-allowlist");

    // The good tile origin made it into the allow set…
    expect(allowlist.isScreenshotAllowed("https://en.wikipedia.org/wiki/DevOS")).toBe(true);
    // …the malformed one was skipped, not fatal.
    expect(allowlist.isScreenshotAllowed("https://not a url")).toBe(false);
    // The skip is REAL: the malformed tile contributed no origin at all —
    // the set holds exactly the project's own origins + the one well-formed
    // tile + github.com.
    const expected = new Set(
      [
        ...PROJECTS.flatMap((project) => [project.repoUrl, project.demoUrl ?? ""]),
        "https://en.wikipedia.org",
        "https://github.com",
      ]
        .filter((url) => url !== "")
        .map((url) => new URL(url).origin),
    );
    expect([...allowlist.SCREENSHOT_ALLOWED_ORIGINS].sort()).toEqual([...expected].sort());
  });
});
