"use client";

import { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { useStore } from "@/store";
import { Monitor, Palette } from "lucide-react";
import type { ThemeName } from "@/types/theme";
import { StartMenu } from "./StartMenu";

const THEMES: { name: ThemeName; label: string; color: string }[] = [
  { name: "retro", label: "Retro 2D", color: "#ff9f1c" },
  { name: "neon", label: "Neon City", color: "#ff00ff" },
  { name: "editorial", label: "Classic Editorial", color: "#8a6d3a" },
];

export function Taskbar() {
  const windows = useStore((s) => s.windows);
  const focusWindow = useStore((s) => s.focusWindow);
  const restoreWindow = useStore((s) => s.restoreWindow);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const [startOpen, setStartOpen] = useState(false);
  const [time, setTime] = useState("");

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      );
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
                background: w.isMinimized
                  ? "var(--bg-tertiary)"
                  : "var(--accent-3)",
                color: "var(--text-primary)",
                opacity: w.isMinimized ? 0.6 : 1,
              }}
            >
              {w.title}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <Palette size={14} className="text-os-muted" />
          {THEMES.map((t) => (
            <button
              key={t.name}
              onClick={() => setTheme(t.name)}
              className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
              style={{
                background: t.color,
                borderColor:
                  theme === t.name ? "var(--accent-1)" : "transparent",
              }}
              aria-label={t.label}
              title={t.label}
            />
          ))}
        </div>

        <span className="font-display text-xs min-w-[48px] text-right text-os-muted">
          {time}
        </span>
      </div>
    </>
  );
}
