"use client";

import { useStore } from "@/store";

/**
 * Glass (dynamic glassmorphism) settings and their setters, so the Control
 * Panel, the desktop control center and the mobile shade stay in sync.
 */
export function useGlassControls() {
  const glassBlur = useStore((s) => s.glassBlur);
  const glassSaturate = useStore((s) => s.glassSaturate);
  const glassOpacity = useStore((s) => s.glassOpacity);
  const setGlassBlur = useStore((s) => s.setGlassBlur);
  const setGlassSaturate = useStore((s) => s.setGlassSaturate);
  const setGlassOpacity = useStore((s) => s.setGlassOpacity);
  const resetGlass = useStore((s) => s.resetGlass);

  return {
    glassBlur,
    glassSaturate,
    glassOpacity,
    setGlassBlur,
    setGlassSaturate,
    setGlassOpacity,
    resetGlass,
  };
}

/**
 * Music player state and transport controls shared by the Music widget, the
 * Control Panel and the control-center dropdowns.
 */
export function useMusicControls() {
  const isPlaying = useStore((s) => s.isPlaying);
  const currentTrack = useStore((s) => s.currentTrack);
  const volume = useStore((s) => s.volume);
  const togglePlay = useStore((s) => s.togglePlay);
  const nextTrack = useStore((s) => s.nextTrack);
  const prevTrack = useStore((s) => s.prevTrack);
  const setVolume = useStore((s) => s.setVolume);

  return { isPlaying, currentTrack, volume, togglePlay, nextTrack, prevTrack, setVolume };
}
