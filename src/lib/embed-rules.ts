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
 * WHY a url is not embedded. The two reasons read very differently to a
 * visitor, and the panel says so:
 *   - `blocked`  — the site refuses to be framed (a known refuser host);
 *   - `insecure` — the url is not served over HTTPS. Our own page's CSP
 *     (`frame-src 'self' https:`) would refuse the frame anyway, so the
 *     fail-closed scheme gate stays — but the site did not "block" anything.
 */
export type EmbedBlockReason = "blocked" | "insecure";

/**
 * The reason a url gets no iframe attempt, or null when it may be framed.
 * https-only, fail-closed: a non-https or unparsable url is never given an
 * iframe attempt, and the reason tells the panel which story to tell.
 */
export function embedBlockReason(url: string): EmbedBlockReason | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "insecure";
  }
  if (parsed.protocol !== "https:") return "insecure";
  return hostnameMatchesBlockedHost(parsed.hostname) ? "blocked" : null;
}
