"use client";

import { useStore } from "@/store";
import type { ThemeName } from "@/types/theme";
import { Play, Pause, SkipBack, SkipForward, Volume2 } from "lucide-react";

const THEMES: { name: ThemeName; label: string; colors: string[] }[] = [
  {
    name: "retro",
    label: "Retro 2D",
    colors: ["#ff9f1c", "#ffbf00", "#2ec4b6"],
  },
  {
    name: "neon",
    label: "Neon City",
    colors: ["#00f5ff", "#ff00ff", "#39ff14"],
  },
  {
    name: "editorial",
    label: "Classic Editorial",
    colors: ["#f7a501", "#23251d", "#2c84e0"],
  },
];

export function ControlPanelApp() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const customTokens = useStore((s) => s.customTokens);
  const updateCustomToken = useStore((s) => s.updateCustomToken);
  const resetCustomTokens = useStore((s) => s.resetCustomTokens);

  const isPlaying = useStore((s) => s.isPlaying);
  const currentTrack = useStore((s) => s.currentTrack);
  const volume = useStore((s) => s.volume);
  const togglePlay = useStore((s) => s.togglePlay);
  const nextTrack = useStore((s) => s.nextTrack);
  const prevTrack = useStore((s) => s.prevTrack);
  const setVolume = useStore((s) => s.setVolume);

  return (
    <div className="flex flex-col gap-5 font-body text-sm">
      {/* Theme Selector */}
      <section>
        <h3 className="font-display text-xs mb-2.5 text-os-accent">Theme</h3>
        <div className="flex gap-2">
          {THEMES.map((t) => (
            <button
              key={t.name}
              onClick={() => setTheme(t.name)}
              className="flex-1 p-2.5 rounded-os border-2 transition-all"
              style={{
                background: theme === t.name ? "var(--bg-tertiary)" : "var(--bg-primary)",
                borderColor: theme === t.name ? "var(--accent-1)" : "var(--border)",
              }}
            >
              <span className="font-display text-[10px] block mb-1.5">{t.label}</span>
              <div className="flex gap-1 justify-center">
                {t.colors.map((c, i) => (
                  <span key={i} className="w-3 h-3 rounded-full block" style={{ background: c }} />
                ))}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Color Customizer */}
      <section>
        <h3 className="font-display text-xs mb-2.5 text-os-accent">Customize</h3>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <label className="text-xs flex-1" style={{ color: "var(--text-secondary)" }}>
              Accent Color
            </label>
            <input
              type="color"
              value={customTokens["accent-1"] || "#ff9f1c"}
              onChange={(e) => updateCustomToken("accent-1", e.target.value)}
              className="w-7 h-7 rounded-os border cursor-pointer"
              style={{ borderColor: "var(--border)" }}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs flex-1" style={{ color: "var(--text-secondary)" }}>
              Background
            </label>
            <input
              type="color"
              value={customTokens["bg-primary"] || "#2d1b14"}
              onChange={(e) => updateCustomToken("bg-primary", e.target.value)}
              className="w-7 h-7 rounded-os border cursor-pointer"
              style={{ borderColor: "var(--border)" }}
            />
          </div>
          <button
            onClick={resetCustomTokens}
            className="text-xs px-2 py-1 rounded-os self-start transition-opacity hover:opacity-80"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
          >
            Reset Colors
          </button>
        </div>
      </section>

      {/* Music Player */}
      <section>
        <h3 className="font-display text-xs mb-2.5 text-os-accent">Now Playing</h3>
        <div className="p-3 rounded-os" style={{ background: "var(--bg-tertiary)" }}>
          <div className="flex flex-col mb-2">
            <span className="font-display text-xs truncate">{currentTrack.title}</span>
            <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
              {currentTrack.artist}
            </span>
          </div>

          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={prevTrack}
              className="flex items-center justify-center w-6 h-6 rounded-os hover:opacity-70 transition-opacity"
              style={{ background: "var(--bg-primary)" }}
              aria-label="Previous track"
            >
              <SkipBack size={12} />
            </button>
            <button
              onClick={togglePlay}
              className="flex items-center justify-center w-8 h-8 rounded-os transition-opacity hover:opacity-80"
              style={{ background: "var(--accent-1)", color: "var(--bg-primary)" }}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button
              onClick={nextTrack}
              className="flex items-center justify-center w-6 h-6 rounded-os hover:opacity-70 transition-opacity"
              style={{ background: "var(--bg-primary)" }}
              aria-label="Next track"
            >
              <SkipForward size={12} />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <Volume2 size={10} style={{ color: "var(--text-secondary)" }} />
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(volume * 100)}
              onChange={(e) => setVolume(Number(e.target.value) / 100)}
              className="flex-1 h-1 accent-os-accent cursor-pointer"
              aria-label="Volume"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
