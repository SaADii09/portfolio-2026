import type { LucideIcon } from "lucide-react";
import {
  FileText,
  FolderKanban,
  Globe,
  Mail,
  Monitor,
  Settings,
  Terminal,
  User,
} from "lucide-react";
import type { AppId } from "@/lib/apps";
import type { WindowType } from "@/types/window";

/** Shared icon map for apps — Desktop, StartMenu, Dock, and the palette all read this. */
export const APP_ICONS: Record<AppId, LucideIcon> = {
  about: User,
  projects: FolderKanban,
  "control-panel": Settings,
  resume: FileText,
  terminal: Terminal,
  contact: Mail,
};

/**
 * Icon key per window TYPE. The browser window is not an AppId (it has no
 * desktop icon of its own — the Projects launcher opens it), so the dock and
 * the taskbar resolve it from its type.
 */
const WINDOW_TYPE_ICON_KEYS: Partial<Record<WindowType, string>> = {
  browser: "browser",
};

/**
 * Every icon a window can resolve to, by key: the app icons, the browser
 * window's globe, and the monitor fallback for anything unknown.
 */
export const WINDOW_ICONS: Record<string, LucideIcon> = {
  ...APP_ICONS,
  browser: Globe,
  monitor: Monitor,
};

/**
 * The icon key for a window: its type first (the browser window is a type, not
 * an app), then its app component, then the monitor fallback.
 */
export function windowIconKeyFor(w: { type?: WindowType; component?: string }): string {
  return typeIconKey(w.type) ?? appIconKey(w.component) ?? "monitor";
}

/** The icon key a window TYPE maps to, when it has one. */
function typeIconKey(type: WindowType | undefined): string | undefined {
  if (type === undefined) return undefined;
  return WINDOW_TYPE_ICON_KEYS[type];
}

/** The app component names that own an icon (own keys only — no prototype hits). */
const APP_ICON_KEYS = new Set(Object.keys(APP_ICONS));

/** The icon key an app COMPONENT maps to, when it names a known app. */
function appIconKey(component: string | undefined): string | undefined {
  if (component === undefined) return undefined;
  return APP_ICON_KEYS.has(component) ? component : undefined;
}
