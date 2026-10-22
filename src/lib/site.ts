/**
 * Canonical site URL — consumed by `metadataBase` in the root layout,
 * `sitemap.ts`, and `robots.ts`. Falls back to localhost so local builds
 * and previews always emit valid absolute URLs. Trailing slashes are
 * stripped so composed URLs never double up (e.g. `…//sitemap.xml`).
 *
 * A MALFORMED value must not brick the build: `new URL(siteUrl)` runs in
 * the root layout's `metadataBase`, so an env typo like `saadahmad.dev`
 * (no scheme) would throw at build time — an opaque `TypeError` before the
 * app exists. An unusable value therefore falls back to localhost, and the
 * canonical URL is reported in the build output so the typo is visible.
 */
const FALLBACK_SITE_URL = "http://localhost:3000";

/** The canonical form of a usable value, or null when it is unusable. */
function parseAbsoluteUrl(candidate: string): string | null {
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/** The configured value, or the localhost fallback when it is unusable. */
function siteUrlFrom(raw: string | undefined): string {
  const candidate = (raw ?? "").trim();
  if (candidate === "") return FALLBACK_SITE_URL;
  const parsed = parseAbsoluteUrl(candidate);
  if (parsed !== null) return parsed;
  // The repo logs to the console in development only (docs/Rules.md §4) —
  // but a malformed site url is worth shouting about at BUILD time, where
  // NODE_ENV is "production" for the build itself. The build log is the
  // place the owner will look, so the warning stays for the build.
  console.warn(
    `[site] NEXT_PUBLIC_SITE_URL is not a valid absolute URL (${JSON.stringify(
      candidate,
    )}) — falling back to ${FALLBACK_SITE_URL}`,
  );
  return FALLBACK_SITE_URL;
}

export const siteUrl = siteUrlFrom(process.env.NEXT_PUBLIC_SITE_URL);

/**
 * Pinned date of the last meaningful sitemap change (YYYY-MM-DD). Using a
 * constant instead of `new Date()` keeps `/sitemap.xml` stable across builds,
 * so crawlers don't see a pointless `lastmod` bump on every deploy.
 */
export const SITE_LAST_UPDATED = "2026-10-18";
