"use client";

import { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { useStore } from "@/store";
import { useIsMobile } from "@/hooks/useMediaQuery";
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
} from "lucide-react";
import type { ThemeName } from "@/types/theme";
import { StartMenu } from "./StartMenu";

const THEMES: { name: ThemeName; label: string; color: string }[] = [
  { name: "retro", label: "Retro 2D", color: "#ff9f1c" },
  { name: "neon", label: "Neon City", color: "#ff00ff" },
  { name: "editorial", label: "Classic Editorial", color: "#8a6d3a" },
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
  const openWindow = useStore((s) => s.openWindow);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const [startOpen, setStartOpen] = useState(false);
  const [time, setTime] = useState("");
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

  const handleAppChipClick = (id: string) => {
    const w = windows.find((w) => w.id === id);
    if (w?.isMinimized) restoreWindow(id);
    else focusWindow(id);
  };

  const handleOpenSettings = () => {
    const existing = windows.find((w) => w.component === "control-panel");
    if (existing) {
      if (existing.isMinimized) restoreWindow(existing.id);
      focusWindow(existing.id);
      return;
    }
    openWindow({ title: "Control Panel", type: "app", component: "control-panel" });
  };

  if (isMobile) {
    return (
      <div
        className="flex items-center justify-around px-2 z-[9999] bg-os-surface"
        style={{
          height: "var(--taskbar-height, 52px)",
          borderTop: "1px solid var(--border)",
        }}
      >
        <button
          onClick={() => setStartOpen((v) => !v)}
          className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-os transition-opacity hover:opacity-80"
          style={{ color: "var(--text-primary)" }}
          aria-label="Home"
        >
          <Home size={20} />
        </button>

        {windows.map((w) => {
          const Icon = w.component ? APP_ICONS[w.component] : null;
          return (
            <button
              key={w.id}
              onClick={() => handleAppChipClick(w.id)}
              className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-os transition-opacity"
              style={{
                color: w.isMinimized ? "var(--text-secondary)" : "var(--accent-1)",
                opacity: w.isMinimized ? 0.5 : 1,
              }}
              aria-label={w.title}
            >
              {Icon ? <Icon size={20} /> : <Monitor size={20} />}
            </button>
          );
        })}

        <button
          onClick={handleOpenSettings}
          className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-os transition-opacity hover:opacity-80"
          style={{ color: "var(--text-secondary)" }}
          aria-label="Settings"
        >
          <Settings size={20} />
        </button>
      </div>
    );
  }

  return (
    <>
      <AnimatePresence>
        {startOpen && <StartMenu onClose={() => setStartOpen(false)} />}
      </AnimatePresence>

      <div
        className="flex items-center gap-2 px-3 z-[9999] bg-os-surface"
        style={{
          height: "var(--taskbar-height, 48px)",
          borderTop: "1px solid var(--border)",
        }}
      >
        <button
          onClick={() => setStartOpen((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-display rounded-os transition-opacity hover:opacity-80"
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
              className="px-2.5 py-1 text-xs font-body rounded-os whitespace-nowrap transition-opacity"
              style={{
                background: w.isMinimized ? "var(--bg-tertiary)" : "var(--accent-3)",
                color: "var(--text-primary)",
                opacity: w.isMinimized ? 0.6 : 1,
              }}
            >
              {w.title}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleOpenSettings}
            className="flex items-center justify-center w-6 h-6 rounded-os transition-opacity hover:opacity-80"
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
              className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
              style={{
                background: t.color,
                borderColor: theme === t.name ? "var(--accent-1)" : "transparent",
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
