/**
 * Canonical site URL — consumed by `metadataBase` in the root layout,
 * `sitemap.ts`, and `robots.ts`. Falls back to localhost so local builds
 * and previews always emit valid absolute URLs. Trailing slashes are
 * stripped so composed URLs never double up (e.g. `…//sitemap.xml`).
 */
export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
  /\/+$/,
  "",
);

/**
 * Pinned date of the last meaningful sitemap change (YYYY-MM-DD). Using a
 * constant instead of `new Date()` keeps `/sitemap.xml` stable across builds,
 * so crawlers don't see a pointless `lastmod` bump on every deploy.
 */
export const SITE_LAST_UPDATED = "2026-10-18";
