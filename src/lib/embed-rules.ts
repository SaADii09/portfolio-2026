/**
 * Embed rules for the Browser (spec D3, Task T0).
 *
 * Known refuser hosts are classified by HOSTNAME suffix before any iframe
 * attempt: both curated tile clicks and typed URLs hit `isEmbedBlocked`,
 * covering every path/variant (`youtube.com`, `www.youtube.com`,
 * `api.youtube.com`, the trailing-dot root form `youtube.com.` — but never
 * `notyoutube.com`).
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

/**
 * The hostname with ONE trailing dot removed — the DNS-root spelling
 * (`youtube.com.`) is the SAME host as `youtube.com`, and the WHATWG URL
 * parser keeps the dot in `hostname`. Matching the raw hostname would let
 * that form of a known refuser escape the block classification (neither
 * `=== "youtube.com"` nor `.endsWith(".youtube.com")` matches it).
 *
 * Exactly one dot is stripped: `youtube.com..` is not a valid DNS name, so
 * there is no second level of root to unwind.
 */
function normalizeHostname(hostname: string): string {
  return hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
}

/** Equality on the host itself OR a `.host`-suffix (subdomain variants). */
export function hostnameMatchesBlockedHost(hostname: string): boolean {
  const host = normalizeHostname(hostname);
  return EMBED_BLOCKED_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
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
