/**
 * Curated Browser app tile registry (spec §7, Task 5).
 *
 * `kind` is DOCUMENTATION-ONLY — it declares the tile's nature:
 * - "blocked"  → a site that refuses iframe embedding
 * - "web"      → an embeddable site (iframe pipeline, screenshot fallback
 *                via /api/screenshot)
 *
 * Since the real-web rework the RUNTIME path is HOST-based, not tile-based:
 * `isEmbedBlocked` (src/lib/embed-rules.ts) classifies the clicked or typed
 * url by hostname, so no production code path reads `kind` to choose a
 * content path. The field stays as the table's declared intent, and a unit
 * pin asserts every tile's `kind` agrees with the live classifier — so a
 * stale tile table cannot drift away from the host rules unnoticed.
 *
 * `icon` is a lucide-react icon-name key; the renderer maps it to a component
 * (search → Search, play → Play, github → Github, globe → Globe).
 */
export type TileKind = "web" | "blocked";

export interface BrowserTile {
  name: string;
  url: string;
  kind: TileKind;
  /** lucide-react icon-name key used by the renderer. */
  icon: string;
}

export const BROWSER_TILES: BrowserTile[] = [
  { name: "Google", url: "https://www.google.com", kind: "blocked", icon: "search" },
  { name: "YouTube", url: "https://www.youtube.com", kind: "blocked", icon: "play" },
  { name: "GitHub", url: "https://github.com/SaADii09", kind: "blocked", icon: "github" },
  { name: "Wikipedia", url: "https://en.wikipedia.org", kind: "web", icon: "globe" },
  {
    name: "DevOS live",
    url: "https://portfolio-2026-sp9k.vercel.app",
    kind: "web",
    icon: "globe",
  },
  { name: "Auth Kit", url: "https://auth-kit-fe.vercel.app", kind: "web", icon: "globe" },
  { name: "Venuze", url: "https://venuze-dashboard.vercel.app", kind: "web", icon: "globe" },
  { name: "MegaBlog", url: "https://mega-blog-taupe.vercel.app", kind: "web", icon: "globe" },
];
