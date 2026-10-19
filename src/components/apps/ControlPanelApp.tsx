"use client";

import { useStore } from "@/store";
import { THEMES, type ThemeName } from "../../../lib/design-tokens";
import { useGlassControls, useMusicPlayback, useMusicVolume } from "@/hooks/useOsSelectors";
import { GlassSlider } from "@/components/os/GlassSlider";
import { Play, Pause, SkipBack, SkipForward, Volume2, RotateCcw } from "lucide-react";

/** Swatch preview per theme: its accent-1/2/3 palette straight from the token source. */
const THEME_SWATCHES: { name: ThemeName; label: string; colors: [string, string, string] }[] = (
  [
    { name: "retro", label: "Retro 2D" },
    { name: "neon", label: "Neon City" },
    { name: "editorial", label: "Classic Editorial" },
  ] as { name: ThemeName; label: string }[]
).map(({ name, label }) => ({
  name,
  label,
  colors: [THEMES[name]["accent-1"], THEMES[name]["accent-2"], THEMES[name]["accent-3"]] as [
    string,
    string,
    string,
  ],
}));

const COLOR_FALLBACKS: Record<string, string> = {
  "accent-1": THEMES.retro["accent-1"],
  "bg-primary": THEMES.retro["bg-primary"],
};

/** Current custom token, or its default when the user has not picked one. */
function colorValue(tokens: Record<string, string>, key: string) {
  return tokens[key] || COLOR_FALLBACKS[key];
}

/** Transport glyph + label for the current playback state. */
function playLabel(isPlaying: boolean) {
  return isPlaying ? "Pause" : "Play";
}

function playIcon(isPlaying: boolean) {
  return isPlaying ? <Pause size={16} /> : <Play size={16} />;
}

export function ControlPanelApp() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const customTokens = useStore((s) => s.customTokens);
  const updateCustomToken = useStore((s) => s.updateCustomToken);
  const resetCustomTokens = useStore((s) => s.resetCustomTokens);
  const resetWidgetPositions = useStore((s) => s.resetWidgetPositions);

  const {
    glassBlur,
    glassSaturate,
    glassOpacity,
    setGlassBlur,
    setGlassSaturate,
    setGlassOpacity,
    resetGlass,
  } = useGlassControls();

  const { volume, setVolume } = useMusicVolume();
  const { isPlaying, currentTrack, togglePlay, nextTrack, prevTrack } = useMusicPlayback();

  return (
    <div className="flex flex-col gap-5 font-body text-sm">
      {/* Theme Selector */}
      <section>
        <h3 className="font-display text-xs mb-2.5 text-os-accent">Theme</h3>
        <div className="flex gap-2">
          {THEME_SWATCHES.map((t) => (
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

      {/* Glass Controls */}
      <section>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="font-display text-xs text-os-accent">Glass</h3>
          <button
            onClick={resetGlass}
            className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-os transition-opacity hover:opacity-70"
            style={{ color: "var(--text-secondary)" }}
            aria-label="Reset glass"
          >
            <RotateCcw size={9} /> Reset
          </button>
        </div>
        <div className="flex flex-col gap-2.5">
          <GlassSlider
            label="Blur"
            value={glassBlur}
            min={0}
            max={40}
            step={1}
            onChange={setGlassBlur}
            format={(v) => `${v}px`}
            ariaLabel="Glass blur intensity"
          />
          <GlassSlider
            label="Saturate"
            value={glassSaturate}
            min={100}
            max={250}
            step={5}
            onChange={setGlassSaturate}
            format={(v) => `${v}%`}
            ariaLabel="Glass saturation"
          />
          <GlassSlider
            label="Tint"
            value={glassOpacity}
            min={5}
            max={100}
            step={5}
            onChange={setGlassOpacity}
            format={(v) => `${v}%`}
            ariaLabel="Glass tint opacity"
          />
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
              value={colorValue(customTokens, "accent-1")}
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
              value={colorValue(customTokens, "bg-primary")}
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

      {/* Widgets */}
      <section>
        <h3 className="font-display text-xs mb-2.5 text-os-accent">Widgets</h3>
        <button
          onClick={resetWidgetPositions}
          className="text-xs px-2 py-1 rounded-os self-start transition-opacity hover:opacity-80"
          style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
        >
          Reset Widget Positions
        </button>
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
              aria-label={playLabel(isPlaying)}
            >
              {playIcon(isPlaying)}
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
            <div className="flex-1 min-w-0">
              <GlassSlider
                label=""
                value={Math.round(volume * 100)}
                min={0}
                max={100}
                onChange={(v) => setVolume(v / 100)}
                ariaLabel="Volume"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
