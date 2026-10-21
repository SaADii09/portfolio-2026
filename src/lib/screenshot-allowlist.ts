import { BROWSER_TILES } from "@/lib/browser-apps";
import { EMBED_BLOCKED_HOSTS, hostnameMatchesBlockedHost } from "@/lib/embed-rules";
import { PROJECTS } from "@/lib/portfolio-data";

/**
 * Origins the /api/screenshot proxy is allowed to capture. Single source of
 * truth: the union of
 *   - every PROJECTS repo/demo origin,
 *   - every curated BROWSER_TILES origin, and
 *   - the github.com origin (repo pages are a first-class capture target —
 *     Review Focus 5).
 *
 * Every origin is derived through `safeOrigin` (try/catch, skip malformed):
 * this module loads at import time, so a throw would take down BOTH API
 * routes.
 */
const GITHUB_ORIGIN = "https://github.com";

/** Origin of a url string, or null when absent/unparseable. */
function safeOrigin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

const PROJECT_ORIGINS: readonly string[] = PROJECTS.flatMap((project) =>
  [safeOrigin(project.repoUrl), safeOrigin(project.demoUrl)].filter(
    (origin): origin is string => origin !== null,
  ),
);

// Same safe derivation as PROJECTS (the same `safeOrigin` helper): a
// malformed tile url is skipped, never thrown.
const TILE_ORIGINS: readonly string[] = BROWSER_TILES.map((tile) => safeOrigin(tile.url)).filter(
  (origin): origin is string => origin !== null,
);

export const SCREENSHOT_ALLOWED_ORIGINS: ReadonlySet<string> = new Set([
  ...PROJECT_ORIGINS,
  ...TILE_ORIGINS,
  GITHUB_ORIGIN,
]);

/**
 * Two-clause check, widened by the T0 ruling: https protocol + (an
 * allow-listed origin OR a hostname suffix-matching EMBED_BLOCKED_HOSTS).
 * The refuser-host widening covers captures for the preview experience —
 * the origin set itself stays curated/static and the actual fetching is
 * Microlink's, so the SSRF envelope is unchanged.
 */
export function isScreenshotAllowed(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return (
      SCREENSHOT_ALLOWED_ORIGINS.has(parsed.origin) || hostnameMatchesBlockedHost(parsed.hostname)
    );
  } catch {
    return false;
  }
}
