"use client";

import { motion } from "framer-motion";
import { useStore } from "@/store";
import { User, FolderKanban, FileText, Terminal, Mail } from "lucide-react";

interface StartMenuProps {
  onClose: () => void;
}

const APPS = [
  { id: "about", title: "About Me", icon: User, component: "about" },
  { id: "projects", title: "Projects", icon: FolderKanban, component: "projects" },
  { id: "resume", title: "Resume", icon: FileText, component: "resume" },
  { id: "terminal", title: "Terminal", icon: Terminal, component: "terminal" },
  { id: "contact", title: "Contact", icon: Mail, component: "contact" },
];

export function StartMenu({ onClose }: StartMenuProps) {
  const openWindow = useStore((s) => s.openWindow);

  const handleLaunch = (app: (typeof APPS)[number]) => {
    openWindow({
      title: app.title,
      type: "app",
      component: app.component,
    });
    onClose();
  };

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 20, opacity: 0 }}
      transition={{ type: "spring", damping: 25, stiffness: 350 }}
      className="absolute bottom-taskbar left-0 w-[280px] bg-os-surface border border-os-border shadow-os rounded-os overflow-hidden z-[9998]"
    >
      <div
        className="px-4 py-3 text-xs font-display tracking-wide"
        style={{ background: "var(--accent-1)", color: "var(--bg-primary)" }}
      >
        DevOS Launcher
      </div>

      <div className="p-2 flex flex-col gap-0.5">
        {APPS.map((app) => (
          <button
            key={app.id}
            onClick={() => handleLaunch(app)}
            className="flex items-center gap-3 px-3 py-2 text-sm font-body text-os-text rounded-os transition-colors hover:bg-os-surface-alt"
          >
            <app.icon size={16} className="text-os-accent" />
            {app.title}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
