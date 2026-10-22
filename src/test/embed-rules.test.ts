import { describe, expect, it } from "vitest";

import { BROWSER_TILES } from "@/lib/browser-apps";
import { EMBED_BLOCKED_HOSTS, embedBlockReason } from "@/lib/embed-rules";

// Interface pinned by Task T0 (embed rules module) + the real-web review:
//   EMBED_BLOCKED_HOSTS — the owner-extensible seed list of known refusers
//   embedBlockReason(url) — https-only + hostname suffix match on ".host" or
//   equality; it returns WHY a url gets no iframe attempt:
//     "blocked"  — a known refuser host;
//     "insecure" — not served over HTTPS (or unparsable) — fail closed, but
//                  the site did NOT block anything, so the panel must not say
//                  that it did;
//     null       — the url may be framed.
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

describe("embedBlockReason", () => {
  it("blocks the bare host itself (equality)", () => {
    expect(embedBlockReason("https://youtube.com")).toBe("blocked");
    expect(embedBlockReason("https://google.com")).toBe("blocked");
  });

  it("blocks subdomain variants (suffix on .host)", () => {
    expect(embedBlockReason("https://www.youtube.com/watch?v=x")).toBe("blocked");
    expect(embedBlockReason("https://api.youtube.com/feed")).toBe("blocked");
    expect(embedBlockReason("https://www.google.com/search?q=x")).toBe("blocked");
    expect(embedBlockReason("https://docs.google.com/doc")).toBe("blocked");
  });

  it("blocks the trailing-dot (DNS-root) form of a refuser host", () => {
    // `youtube.com.` is the DNS-root spelling of `youtube.com` — the SAME
    // host, and the WHATWG URL parser keeps the dot in `hostname`. The block
    // classification must not lose it there: an iframe attempt for a known
    // refuser breaks the "no iframe attempt for a refuser host" contract.
    expect(embedBlockReason("https://youtube.com./watch")).toBe("blocked");
    expect(embedBlockReason("https://www.youtube.com./watch")).toBe("blocked");
  });

  it("does NOT match hosts that merely contain a list entry", () => {
    expect(embedBlockReason("https://notyoutube.com")).toBeNull();
    expect(embedBlockReason("https://youtubeevil.com")).toBeNull();
    expect(embedBlockReason("https://reddit-blog.com")).toBeNull();
  });

  it("allows non-listed https hosts", () => {
    expect(embedBlockReason("https://en.wikipedia.org")).toBeNull();
    expect(embedBlockReason("https://portfolio-2026-sp9k.vercel.app/")).toBeNull();
  });

  it("calls a non-https url INSECURE, not blocked (the site did not refuse)", () => {
    // The fail-closed scheme gate stays (our own CSP `frame-src 'self' https:`
    // would refuse the frame anyway) — but the reason must tell the panel
    // the truth, so it never accuses a site of blocking.
    expect(embedBlockReason("http://example.com")).toBe("insecure");
    expect(embedBlockReason("http://youtube.com")).toBe("insecure");
    expect(embedBlockReason("ftp://example.com/file")).toBe("insecure");
  });

  it("calls an unparsable url INSECURE (fail closed)", () => {
    expect(embedBlockReason("not a url")).toBe("insecure");
    expect(embedBlockReason("://missing-scheme")).toBe("insecure");
    expect(embedBlockReason("")).toBe("insecure");
  });

  it("classifies every BROWSER_TILES url per its kind", () => {
    for (const tile of BROWSER_TILES) {
      const expected = tile.kind === "blocked" ? "blocked" : null;
      expect(embedBlockReason(tile.url), `${tile.name} (${tile.kind})`).toBe(expected);
    }
  });
});
