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
