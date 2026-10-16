import type { ThemeName } from "@/types/theme";
import type { WidgetType } from "@/types/widget";

/** Canonical app ids — the union the registry, launchers, and terminal all agree on. */
export type AppId = "about" | "projects" | "control-panel" | "resume" | "terminal" | "contact";

export interface AppDef {
  id: AppId;
  /** Window title + palette label ("About Me", "Control Panel", …). */
  title: string;
  /** Matches `WindowInstance.component`. */
  component: string;
  /** Desktop icon label; control-panel uses "Settings" (pinned by e2e getByTitle("Open Settings")). */
  desktopLabel?: string;
  /** Palette/fuzzy search keywords. */
  keywords: string[];
}

export const APP_DEFS: AppDef[] = [
  {
    id: "about",
    title: "About Me",
    component: "about",
    keywords: ["about", "me", "whoami", "profile", "bio"],
  },
  {
    id: "projects",
    title: "Projects",
    component: "projects",
    keywords: ["work", "portfolio", "apps"],
  },
  {
    id: "control-panel",
    title: "Control Panel",
    component: "control-panel",
    desktopLabel: "Settings",
    keywords: ["settings", "preferences", "glass", "theme"],
  },
  {
    id: "resume",
    title: "Resume",
    component: "resume",
    keywords: ["cv", "experience"],
  },
  {
    id: "terminal",
    title: "Terminal",
    component: "terminal",
    keywords: ["shell", "command"],
  },
  {
    id: "contact",
    title: "Contact",
    component: "contact",
    keywords: ["email", "mail", "message", "reach out"],
  },
];

export interface WidgetDef {
  type: WidgetType;
  title: string;
  keywords: string[];
}

export const WIDGET_DEFS: WidgetDef[] = [
  { type: "weather", title: "Weather", keywords: ["forecast", "temperature", "climate"] },
  { type: "cpu", title: "CPU", keywords: ["performance", "usage", "processor"] },
  { type: "music", title: "Music", keywords: ["player", "audio", "track", "song"] },
  { type: "notes", title: "Notes", keywords: ["sticky", "memo", "note", "write"] },
];

export const THEME_DEFS: { name: ThemeName; label: string }[] = [
  { name: "retro", label: "Retro 2D" },
  { name: "neon", label: "Neon City" },
  { name: "editorial", label: "Classic Editorial" },
];

const APP_ALIASES: Record<string, AppId> = {
  settings: "control-panel",
  cv: "resume",
};

/** Resolve an app id (or alias such as `settings`/`cv`) to a canonical `AppId`. */
export function resolveAppId(arg: string): AppId | null {
  const key = arg.trim().toLowerCase();
  const def = APP_DEFS.find((a) => a.id === key);
  if (def) return def.id;
  return APP_ALIASES[key] ?? null;
}
