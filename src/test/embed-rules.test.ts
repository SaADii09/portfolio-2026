import { describe, expect, it } from "vitest";

import { BROWSER_TILES } from "@/lib/browser-apps";
import { EMBED_BLOCKED_HOSTS, isEmbedBlocked } from "@/lib/embed-rules";

// Interface pinned by Task T0 (embed rules module):
//   EMBED_BLOCKED_HOSTS — the owner-extensible seed list of known refusers
//   isEmbedBlocked(url) — https-only + hostname suffix match on ".host" or
//   equality; unparsable → true (fail closed).
// `notyoutube.com` must NOT match `youtube.com` (suffix-boundary rule).

describe("EMBED_BLOCKED_HOSTS", () => {
  it("is exactly the seed list, in order", () => {
    expect(EMBED_BLOCKED_HOSTS).toEqual([
      "youtube.com",
      "google.com",
      "github.com",
      "x.com",
      "twitter.com",
      "facebook.com",
      "instagram.com",
      "linkedin.com",
      "reddit.com",
      "amazon.com",
    ]);
  });
});

describe("isEmbedBlocked", () => {
  it("blocks the bare host itself (equality)", () => {
    expect(isEmbedBlocked("https://youtube.com")).toBe(true);
    expect(isEmbedBlocked("https://google.com")).toBe(true);
  });

  it("blocks subdomain variants (suffix on .host)", () => {
    expect(isEmbedBlocked("https://www.youtube.com/watch?v=x")).toBe(true);
    expect(isEmbedBlocked("https://api.youtube.com/feed")).toBe(true);
    expect(isEmbedBlocked("https://www.google.com/search?q=x")).toBe(true);
    expect(isEmbedBlocked("https://docs.google.com/doc")).toBe(true);
  });

  it("does NOT match hosts that merely contain a list entry", () => {
    expect(isEmbedBlocked("https://notyoutube.com")).toBe(false);
    expect(isEmbedBlocked("https://youtubeevil.com")).toBe(false);
    expect(isEmbedBlocked("https://reddit-blog.com")).toBe(false);
  });

  it("allows non-listed https hosts", () => {
    expect(isEmbedBlocked("https://en.wikipedia.org")).toBe(false);
    expect(isEmbedBlocked("https://portfolio-2026-sp9k.vercel.app/")).toBe(false);
  });

  it("blocks non-https urls (fail closed)", () => {
    expect(isEmbedBlocked("http://example.com")).toBe(true);
    expect(isEmbedBlocked("http://youtube.com")).toBe(true);
    expect(isEmbedBlocked("ftp://example.com/file")).toBe(true);
  });

  it("blocks unparsable urls (fail closed)", () => {
    expect(isEmbedBlocked("not a url")).toBe(true);
    expect(isEmbedBlocked("://missing-scheme")).toBe(true);
    expect(isEmbedBlocked("")).toBe(true);
  });

  it("classifies every BROWSER_TILES url per its kind", () => {
    for (const tile of BROWSER_TILES) {
      expect(isEmbedBlocked(tile.url), `${tile.name} (${tile.kind})`).toBe(tile.kind === "blocked");
    }
  });
});
