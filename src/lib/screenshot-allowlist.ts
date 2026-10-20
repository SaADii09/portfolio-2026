import { PROJECTS } from "@/lib/portfolio-data";

/**
 * Origins the /api/screenshot proxy is allowed to capture. Single source of
 * truth: a union of project repo/demo origins and the github.com origin
 * (repo pages are a first-class capture target — Review Focus 5).
 *
 * Task 5 (browser tabs) feeds tile origins here; the TILE_ORIGINS slot
 * below is the one-line edit point for that extension.
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

/** Tile origins (BROWSER_TILES) are appended here in Task 5. */
const TILE_ORIGINS: readonly string[] = [];

export const SCREENSHOT_ALLOWED_ORIGINS: ReadonlySet<string> = new Set([
  ...PROJECT_ORIGINS,
  ...TILE_ORIGINS,
  GITHUB_ORIGIN,
]);

/** Two-clause pure check: https protocol + allow-listed origin. */
export function isScreenshotAllowed(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && SCREENSHOT_ALLOWED_ORIGINS.has(parsed.origin);
  } catch {
    return false;
  }
}
