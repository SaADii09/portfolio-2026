"use client";

import { motion } from "framer-motion";
import { APP_ICONS } from "@/components/os/appIcons";
import { APP_DEFS, type AppDef } from "@/lib/apps";
import { openApp } from "@/lib/os-actions";

interface StartMenuProps {
  onClose: () => void;
}

const menuVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      type: "spring" as const,
      damping: 25,
      stiffness: 350,
      staggerChildren: 0.04,
      delayChildren: 0.06,
    },
  },
  exit: { y: 20, opacity: 0, transition: { duration: 0.15 } },
};

const itemVariants = {
  hidden: { x: -8, opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: { type: "spring" as const, damping: 20, stiffness: 300 },
  },
};

export function StartMenu({ onClose }: StartMenuProps) {
  const handleLaunch = (app: AppDef) => {
    openApp(app.id);
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
        {APP_DEFS.map((app) => {
          const Icon = APP_ICONS[app.id];
          return (
            <motion.button
              key={app.id}
              variants={itemVariants}
              onClick={() => handleLaunch(app)}
              className="flex items-center gap-3 px-3 py-2 text-sm font-body text-os-text rounded-os transition-all hover:translate-x-1"
              style={{ background: "transparent" }}
              whileHover={{ background: "color-mix(in srgb, var(--accent-1) 10%, transparent)" }}
            >
              <Icon size={16} className="text-os-accent" />
              {app.title}
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}
