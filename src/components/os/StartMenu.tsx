"use client";

import { motion } from "framer-motion";
import { useStore } from "@/store";
import { User, FolderKanban, FileText, Terminal, Mail, Settings } from "lucide-react";

interface StartMenuProps {
  onClose: () => void;
}

const APPS = [
  { id: "about", title: "About Me", icon: User, component: "about" },
  { id: "projects", title: "Projects", icon: FolderKanban, component: "projects" },
  { id: "control-panel", title: "Control Panel", icon: Settings, component: "control-panel" },
  { id: "resume", title: "Resume", icon: FileText, component: "resume" },
  { id: "terminal", title: "Terminal", icon: Terminal, component: "terminal" },
  { id: "contact", title: "Contact", icon: Mail, component: "contact" },
];

const menuVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: "spring" as const, damping: 25, stiffness: 350, staggerChildren: 0.04, delayChildren: 0.06 },
  },
  exit: { y: 20, opacity: 0, transition: { duration: 0.15 } },
};

const itemVariants = {
  hidden: { x: -8, opacity: 0 },
  visible: { x: 0, opacity: 1, transition: { type: "spring" as const, damping: 20, stiffness: 300 } },
};

export function StartMenu({ onClose }: StartMenuProps) {
  const openWindow = useStore((s) => s.openWindow);
  const windows = useStore((s) => s.windows);

  const handleLaunch = (app: (typeof APPS)[number]) => {
    const existing = windows.find((w) => w.component === app.component);
    if (existing) {
      if (existing.isMinimized) useStore.getState().restoreWindow(existing.id);
      useStore.getState().focusWindow(existing.id);
      onClose();
      return;
    }
    openWindow({
      title: app.title,
      type: "app",
      component: app.component,
    });
    onClose();
  };

  return (
    <motion.div
      variants={menuVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="absolute bottom-taskbar left-0 w-[280px] glass-heavy border overflow-hidden z-[9998]"
      style={{
        borderRadius: "var(--radius)",
        borderColor: "color-mix(in srgb, var(--accent-1) 20%, transparent)",
        boxShadow: "var(--shadow-glass-heavy)",
      }}
    >
      <div
        className="px-4 py-3 text-xs font-display tracking-wide"
        style={{ background: "var(--accent-1)", color: "var(--bg-primary)" }}
      >
        DevOS Launcher
      </div>

      <div className="p-2 flex flex-col gap-0.5">
        {APPS.map((app) => (
          <motion.button
            key={app.id}
            variants={itemVariants}
            onClick={() => handleLaunch(app)}
            className="flex items-center gap-3 px-3 py-2 text-sm font-body text-os-text rounded-os transition-all hover:translate-x-1"
            style={{ background: "transparent" }}
            whileHover={{ background: "color-mix(in srgb, var(--accent-1) 10%, transparent)" }}
          >
            <app.icon size={16} className="text-os-accent" />
            {app.title}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
