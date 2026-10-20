/**
 * Curated Browser app tile registry (spec §7, Task 5).
 *
 * `kind` drives the content path chosen by the Browser home tab (Task 9):
 * - "blocked"  → sites that refuse iframe embedding; FallbackPanel opens instantly
 * - "web"      → iframe pipeline (screenshot fallback via /api/screenshot)
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
