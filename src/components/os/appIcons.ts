import type { LucideIcon } from "lucide-react";
import { FileText, FolderKanban, Mail, Settings, Terminal, User } from "lucide-react";
import type { AppId } from "@/lib/apps";

/** Shared icon map for apps — Desktop, StartMenu, Dock, and the palette all read this. */
export const APP_ICONS: Record<AppId, LucideIcon> = {
  about: User,
  projects: FolderKanban,
  "control-panel": Settings,
  resume: FileText,
  terminal: Terminal,
  contact: Mail,
};
