import type { LucideIcon } from "lucide-react";
import {
  CloudSun,
  Cpu,
  FileText,
  FolderKanban,
  Mail,
  Music,
  Settings,
  StickyNote,
  Terminal,
  User,
} from "lucide-react";
import type { AppId } from "@/lib/apps";
import type { WidgetType } from "@/types/widget";

/** Shared icon map for apps — Desktop, StartMenu, Dock, and the palette all read this. */
export const APP_ICONS: Record<AppId, LucideIcon> = {
  about: User,
  projects: FolderKanban,
  "control-panel": Settings,
  resume: FileText,
  terminal: Terminal,
  contact: Mail,
};

/** Shared icon map for widgets. */
export const WIDGET_ICONS: Record<WidgetType, LucideIcon> = {
  weather: CloudSun,
  cpu: Cpu,
  music: Music,
  notes: StickyNote,
};
