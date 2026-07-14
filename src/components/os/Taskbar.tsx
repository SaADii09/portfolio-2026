"use client";

import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useStore } from "@/store";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { useLongPress } from "@/hooks/useLongPress";
import {
  Monitor,
  Palette,
  Settings,
  User,
  FolderKanban,
  FileText,
  Terminal,
  Mail,
  Home,
  Maximize2,
  Minimize2,
  X,
  Target,
} from "lucide-react";
import type { ThemeName } from "@/types/theme";
import { StartMenu } from "./StartMenu";
import { ContextMenu } from "./ContextMenu";

const THEMES: { name: ThemeName; label: string; color: string }[] = [
  { name: "retro", label: "Retro 2D", color: "#ff9f1c" },
  { name: "neon", label: "Neon City", color: "#ff00ff" },
  { name: "editorial", label: "Classic Editorial", color: "#f7a501" },
];

const APP_ICONS: Record<string, typeof Home> = {
  about: User,
  projects: FolderKanban,
  "control-panel": Settings,
  resume: FileText,
  terminal: Terminal,
  contact: Mail,
};

export function Taskbar() {
  const windows = useStore((s) => s.windows);
  const focusWindow = useStore((s) => s.focusWindow);
  const restoreWindow = useStore((s) => s.restoreWindow);
  const minimizeWindow = useStore((s) => s.minimizeWindow);
  const maximizeWindow = useStore((s) => s.maximizeWindow);
  const closeWindow = useStore((s) => s.closeWindow);
  const openWindow = useStore((s) => s.openWindow);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const [startOpen, setStartOpen] = useState(false);
  const [time, setTime] = useState("");
  const [contextMenu, setContextMenu] = useState<{ windowId: string; x: number; y: number } | null>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    };
    tick();
    const id = setInterval(tick, 10000);
    return () => clearInterval(id);
  }, []);

  const handleAppChipClick = useCallback((id: string) => {
    const w = useStore.getState().windows.find((w) => w.id === id);
    if (w?.isMinimized) restoreWindow(id);
    else focusWindow(id);
  }, [focusWindow, restoreWindow]);

  const handleAppChipContextMenu = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setContextMenu({ windowId: id, x: e.clientX, y: e.clientY });
  }, []);

  const handleOpenSettings = () => {
    const existing = windows.find((w) => w.component === "control-panel");
    if (existing) {
      if (existing.isMinimized) restoreWindow(existing.id);
      focusWindow(existing.id);
      return;
    }
    openWindow({ title: "Control Panel", type: "app", component: "control-panel" });
  };

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

  if (isMobile) {
    return (
      <>
        <div
          className="flex items-center justify-around px-2 fixed bottom-0 left-0 right-0 z-[9999] glass-heavy"
          style={{
            height: "var(--taskbar-height, 52px)",
            borderTop: "1px solid color-mix(in srgb, var(--accent-1) 10%, transparent)",
            boxShadow: "var(--shadow-glass)",
          }}
        >
          <button
            onClick={() => setStartOpen((v) => !v)}
            className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-os transition-all hover:scale-110 active:scale-95"
            style={{ color: "var(--text-primary)" }}
            aria-label="Home"
          >
            <Home size={20} />
          </button>

          {windows.map((w) => (
            <MobileTaskbarButton
              key={w.id}
              window={w}
              onClick={() => handleAppChipClick(w.id)}
              onLongPress={(e) => {
                e.preventDefault();
                setContextMenu({ windowId: w.id, x: e.clientX, y: e.clientY });
              }}
            />
          ))}

          <button
            onClick={handleOpenSettings}
            className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-os transition-all hover:scale-110 active:scale-95"
            style={{ color: "var(--text-secondary)" }}
            aria-label="Settings"
          >
            <Settings size={20} />
          </button>
        </div>

        <AnimatePresence>
          {startOpen && <StartMenu onClose={() => setStartOpen(false)} />}
        </AnimatePresence>

        <AnimatePresence>
          {contextMenu && (
            <ContextMenu
              items={getWindowMenuItems(contextMenu.windowId)}
              position={{ x: contextMenu.x, y: contextMenu.y }}
              onClose={() => setContextMenu(null)}
            />
          )}
        </AnimatePresence>
      </>
    );
  }

  return (
    <>
      <AnimatePresence>
        {startOpen && <StartMenu onClose={() => setStartOpen(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {contextMenu && (
          <ContextMenu
            items={getWindowMenuItems(contextMenu.windowId)}
            position={{ x: contextMenu.x, y: contextMenu.y }}
            onClose={() => setContextMenu(null)}
          />
        )}
      </AnimatePresence>

      <div
        className="flex items-center gap-2 px-3 z-[9999] glass-heavy"
        style={{
          height: "var(--taskbar-height, 48px)",
          borderTop: "1px solid color-mix(in srgb, var(--accent-1) 10%, transparent)",
          boxShadow: "var(--shadow-glass)",
        }}
      >
        <button
          onClick={() => setStartOpen((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-display rounded-os transition-all hover:scale-105 active:scale-95"
          style={{ background: "var(--accent-1)", color: "var(--bg-primary)" }}
        >
          <Monitor size={14} />
          Start
        </button>

        <div className="flex-1 flex items-center gap-1 overflow-x-auto">
          {windows.map((w) => (
            <button
              key={w.id}
              onClick={() => handleAppChipClick(w.id)}
              onContextMenu={(e) => handleAppChipContextMenu(e, w.id)}
              className="relative px-2.5 py-1 text-xs font-body rounded-os whitespace-nowrap transition-all hover:scale-105 active:scale-95"
              style={{
                background: w.isMinimized ? "color-mix(in srgb, var(--bg-tertiary) 60%, transparent)" : "var(--accent-3)",
                color: "var(--text-primary)",
                opacity: w.isMinimized ? 0.6 : 1,
              }}
            >
              {w.title}
              {!w.isMinimized && (
                <motion.div
                  layoutId="activeChipIndicator"
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full"
                  style={{ background: "var(--accent-1)" }}
                  transition={{ type: "spring", damping: 20, stiffness: 300 }}
                />
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleOpenSettings}
            className="flex items-center justify-center w-6 h-6 rounded-os transition-all hover:scale-110 active:scale-95"
            style={{ color: "var(--text-secondary)" }}
            aria-label="Open Settings"
            title="Settings"
          >
            <Settings size={14} />
          </button>

          <Palette size={14} className="text-os-muted" />

          {THEMES.map((t) => (
            <button
              key={t.name}
              onClick={() => setTheme(t.name)}
              className="w-5 h-5 rounded-full border-2 transition-all hover:scale-125"
              style={{
                background: t.color,
                borderColor: theme === t.name ? "var(--accent-1)" : "transparent",
                boxShadow: theme === t.name
                  ? `0 0 8px ${t.color}, 0 0 16px color-mix(in srgb, ${t.color} 40%, transparent)`
                  : "none",
              }}
              aria-label={t.label}
              title={t.label}
            />
          ))}
        </div>

        <span className="font-display text-xs min-w-[48px] text-right text-os-muted">{time}</span>
      </div>
    </>
  );
}

function MobileTaskbarButton({
  window: w,
  onClick,
  onLongPress,
}: {
  window: { id: string; component?: string; title: string; isMinimized: boolean };
  onClick: () => void;
  onLongPress: (e: React.PointerEvent) => void;
}) {
  const longPress = useLongPress({ onLongPress });
  const Icon = w.component ? APP_ICONS[w.component] : null;

  return (
    <button
      onClick={onClick}
      onPointerDown={longPress.onPointerDown}
      onPointerMove={longPress.onPointerMove}
      onPointerUp={longPress.onPointerUp}
      onContextMenu={longPress.onContextMenu}
      className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-os transition-all active:scale-95"
      style={{
        color: w.isMinimized ? "var(--text-secondary)" : "var(--accent-1)",
        opacity: w.isMinimized ? 0.5 : 1,
      }}
      aria-label={w.title}
    >
      {Icon ? <Icon size={20} /> : <Monitor size={20} />}
    </button>
  );
}
