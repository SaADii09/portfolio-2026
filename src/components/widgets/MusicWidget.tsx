"use client";

import { useMemo } from "react";
import { useStore } from "@/store";
import { Play, Pause, SkipBack, SkipForward, Volume2 } from "lucide-react";

const BAR_COUNT = 12;

function buildBarConfig() {
  return Array.from({ length: BAR_COUNT }, (_, i) => ({
    height: `${20 + ((i * 17 + 5) % 61)}%`,
    duration: `${0.4 + ((i * 13 + 3) % 6) * 0.1}s`,
  }));
}

export function MusicWidget() {
  const isPlaying = useStore((s) => s.isPlaying);
  const currentTrack = useStore((s) => s.currentTrack);
  const volume = useStore((s) => s.volume);
  const togglePlay = useStore((s) => s.togglePlay);
  const nextTrack = useStore((s) => s.nextTrack);
  const prevTrack = useStore((s) => s.prevTrack);
  const setVolume = useStore((s) => s.setVolume);
  const bars = useMemo(() => buildBarConfig(), []);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col">
        <span className="font-display text-[11px] truncate">{currentTrack.title}</span>
        <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
          {currentTrack.artist}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={prevTrack}
          className="flex items-center justify-center w-6 h-6 rounded-os hover:opacity-70 transition-opacity"
          style={{ background: "var(--bg-tertiary)" }}
          aria-label="Previous track"
        >
          <SkipBack size={12} />
        </button>

        <button
          onClick={togglePlay}
          className="flex items-center justify-center w-7 h-7 rounded-os transition-opacity hover:opacity-80"
          style={{ background: "var(--accent-1)", color: "var(--bg-primary)" }}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
        </button>

        <button
          onClick={nextTrack}
          className="flex items-center justify-center w-6 h-6 rounded-os hover:opacity-70 transition-opacity"
          style={{ background: "var(--bg-tertiary)" }}
          aria-label="Next track"
        >
          <SkipForward size={12} />
        </button>
      </div>

      <div className="flex items-end gap-[2px] h-8">
        {bars.map((b, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-sm transition-all"
            style={{
              background: "var(--accent-1)",
              height: isPlaying ? b.height : "20%",
              animationName: isPlaying ? "music-bar" : undefined,
              animationDuration: isPlaying ? b.duration : undefined,
              animationTimingFunction: isPlaying ? "ease-in-out" : undefined,
              animationIterationCount: isPlaying ? "infinite" : undefined,
              animationDirection: isPlaying ? "alternate" : undefined,
              animationDelay: isPlaying ? `${i * 0.05}s` : undefined,
              opacity: isPlaying ? 1 : 0.3,
            }}
          />
        ))}
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

      <style>{`
        @keyframes music-bar {
          0% { transform: scaleY(0.3); }
          100% { transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
}
