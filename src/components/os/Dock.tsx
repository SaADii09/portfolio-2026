"use client";

import { useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useStore } from "@/store";
import {
  Monitor,
  Settings,
  User,
  FolderKanban,
  FileText,
  Terminal,
  Mail,
  Maximize2,
  Minimize2,
  X,
  Target,
} from "lucide-react";
import { ContextMenu } from "./ContextMenu";

const APP_ICONS: Record<string, typeof Monitor> = {
  about: User,
  projects: FolderKanban,
  "control-panel": Settings,
  resume: FileText,
  terminal: Terminal,
  contact: Mail,
};

export function Dock() {
  const windows = useStore((s) => s.windows);
  const activeWindowId = useStore((s) => s.activeWindowId);
  const focusWindow = useStore((s) => s.focusWindow);
  const restoreWindow = useStore((s) => s.restoreWindow);
  const minimizeWindow = useStore((s) => s.minimizeWindow);
  const maximizeWindow = useStore((s) => s.maximizeWindow);
  const closeWindow = useStore((s) => s.closeWindow);
  const [contextMenu, setContextMenu] = useState<{
    windowId: string;
    x: number;
    y: number;
  } | null>(null);

  const handleIconClick = useCallback(
    (id: string) => {
      const w = windows.find((w) => w.id === id);
      if (w?.isMinimized) restoreWindow(id);
      else focusWindow(id);
    },
    [windows, focusWindow, restoreWindow],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.preventDefault();
      setContextMenu({ windowId: id, x: e.clientX, y: e.clientY });
    },
    [],
  );

  const getWindowMenuItems = (windowId: string) => {
    const w = windows.find((w) => w.id === windowId);
    if (!w) return [];

    return [
      {
        label: w.isMinimized ? "Restore" : "Focus",
        icon: w.isMinimized ? Maximize2 : Target,
        onClick: () => {
          if (w.isMinimized) restoreWindow(windowId);
          else focusWindow(windowId);
        },
      },
      {
        label: "Minimize",
        icon: Minimize2,
        onClick: () => minimizeWindow(windowId),
      },
      {
        label: w.isMaximized ? "Restore Size" : "Maximize",
        icon: Maximize2,
        onClick: () => {
          if (w.isMaximized) {
            useStore.getState().restoreWindow(windowId);
          } else {
            maximizeWindow(windowId);
          }
        },
      },
      { label: "", separator: true, onClick: () => {} },
      {
        label: "Close",
        icon: X,
        danger: true,
        onClick: () => closeWindow(windowId),
      },
    ];
  };

  if (windows.length === 0) return null;

  return (
    <>
      <AnimatePresence>
        {contextMenu && (
          <ContextMenu
            items={getWindowMenuItems(contextMenu.windowId)}
            position={{ x: contextMenu.x, y: contextMenu.y }}
            onClose={() => setContextMenu(null)}
          />
        )}
      </AnimatePresence>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-1 px-2.5 glass-heavy"
        style={{
          height: 64,
          borderRadius: 9999,
          border: "1px solid color-mix(in srgb, var(--accent-1) 15%, transparent)",
          boxShadow: "var(--shadow-glass-heavy)",
        }}
      >
        {windows.map((w) => (
          <DockIcon
            key={w.id}
            window={w}
            isActive={activeWindowId === w.id}
            onClick={() => handleIconClick(w.id)}
            onContextMenu={(e) => handleContextMenu(e, w.id)}
          />
        ))}
      </motion.div>
    </>
  );
}

function DockIcon({
  window: w,
  isActive,
  onClick,
  onContextMenu,
}: {
  window: {
    id: string;
    component?: string;
    title: string;
    isMinimized: boolean;
    zIndex: number;
  };
  isActive: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const Icon = w.component ? APP_ICONS[w.component] ?? Monitor : Monitor;

  return (
    <div className="relative flex flex-col items-center">
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 400 }}
            className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-1 text-[10px] font-body glass-heavy"
            style={{
              borderRadius: "var(--radius)",
              border: "1px solid color-mix(in srgb, var(--accent-1) 20%, transparent)",
              color: "var(--text-primary)",
              zIndex: w.zIndex + 1,
            }}
          >
            {w.title}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        onClick={onClick}
        onContextMenu={onContextMenu}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        whileHover={{ scale: 1.18, y: -6 }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: "spring", damping: 15, stiffness: 300 }}
        className="relative flex items-center justify-center w-10 h-10 rounded-xl transition-colors"
        style={{
          background: isActive
            ? "color-mix(in srgb, var(--accent-1) 20%, transparent)"
            : "color-mix(in srgb, var(--bg-tertiary) 60%, transparent)",
          color: isActive ? "var(--accent-1)" : "var(--text-primary)",
          border: isActive
            ? "1px solid color-mix(in srgb, var(--accent-1) 30%, transparent)"
            : "1px solid transparent",
        }}
        aria-label={w.title}
      >
        <Icon size={20} />

        <div
          className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full transition-all"
          style={{
            width: 5,
            height: 5,
            background: isActive
              ? "var(--accent-1)"
              : "color-mix(in srgb, var(--text-secondary) 50%, transparent)",
            boxShadow: isActive
              ? "0 0 6px color-mix(in srgb, var(--accent-1) 50%, transparent)"
              : "none",
          }}
        />
      </motion.button>
    </div>
  );
}
