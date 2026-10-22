import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * The canonical site URL contract.
 *
 * `siteUrl` is consumed by `metadataBase` in the root layout, `sitemap.ts`
 * and `robots.ts` — every one of them calls `new URL(siteUrl)`. A malformed
 * `NEXT_PUBLIC_SITE_URL` (a host without a scheme, for instance) must
 * therefore never reach those consumers: an env typo used to throw a
 * `TypeError` at build time, before the app existed, and the failure looked
 * like a broken app rather than a broken variable.
 */
async function siteUrlWith(raw: string | undefined): Promise<string> {
  vi.resetModules();
  if (raw === undefined) {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", undefined as unknown as string);
  } else {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", raw);
  }
  const mod = await import("@/lib/site");
  return mod.siteUrl;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("siteUrl", () => {
  it("keeps a valid absolute url and strips its trailing slashes", async () => {
    expect(await siteUrlWith("https://saadahmad.dev/")).toBe("https://saadahmad.dev");
    expect(await siteUrlWith("https://saadahmad.dev")).toBe("https://saadahmad.dev");
    expect(await siteUrlWith("https://saadahmad.dev///")).toBe("https://saadahmad.dev");
  });

  it("falls back to localhost when the variable is unset or empty", async () => {
    expect(await siteUrlWith(undefined)).toBe("http://localhost:3000");
    expect(await siteUrlWith("")).toBe("http://localhost:3000");
    expect(await siteUrlWith("   ")).toBe("http://localhost:3000");
  });

  it("falls back to localhost for a malformed value instead of throwing", async () => {
    // The typo that used to brick `next build` at `metadataBase`.
    expect(await siteUrlWith("saadahmad.dev")).toBe("http://localhost:3000");
    expect(await siteUrlWith("not a url")).toBe("http://localhost:3000");
    expect(await siteUrlWith("ftp://saadahmad.dev")).toBe("http://localhost:3000");
  });

  it("is always parsable by `new URL` — the metadataBase contract", async () => {
    for (const raw of [undefined, "", "   ", "saadahmad.dev", "not a url", "https://ok.dev/"]) {
      const value = await siteUrlWith(raw);
      expect(() => new URL(value)).not.toThrow();
    }
  });
});
