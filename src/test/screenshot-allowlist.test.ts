import { describe, expect, it } from "vitest";

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
});
