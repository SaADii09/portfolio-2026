/**
 * Embed rules for the Browser (spec D3, Task T0).
 *
 * Known refuser hosts are classified by HOSTNAME suffix before any iframe
 * attempt: both curated tile clicks and typed URLs hit `isEmbedBlocked`,
 * covering every path/variant (`youtube.com`, `www.youtube.com`,
 * `api.youtube.com` — but never `notyoutube.com`).
 *
 * A plain array the owner can extend — no registry ceremony.
 */
export const EMBED_BLOCKED_HOSTS: readonly string[] = [
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
];

/** Equality on the host itself OR a `.host`-suffix (subdomain variants). */
export function hostnameMatchesBlockedHost(hostname: string): boolean {
  return EMBED_BLOCKED_HOSTS.some(
    (blocked) => hostname === blocked || hostname.endsWith(`.${blocked}`),
  );
}

/**
 * https-only, fail-closed host classification: non-https and unparsable
 * urls are BOTH treated as blocked — an unverifiable scheme is never given
 * an iframe attempt.
 */
export function isEmbedBlocked(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }
  if (parsed.protocol !== "https:") return true;
  return hostnameMatchesBlockedHost(parsed.hostname);
}
