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

/** Blur-only slice for the mobile shade, which tunes nothing else. */
export function useGlassBlurControl() {
  const glassBlur = useStore((s) => s.glassBlur);
  const setGlassBlur = useStore((s) => s.setGlassBlur);

  return { glassBlur, setGlassBlur };
}

/**
 * Music transport + now-playing, without the volume slider: consumers that only
 * render/control playback (Music widget, control centers) must not re-render on
 * every volume-slider tick.
 */
export function useMusicPlayback() {
  const isPlaying = useStore((s) => s.isPlaying);
  const currentTrack = useStore((s) => s.currentTrack);
  const togglePlay = useStore((s) => s.togglePlay);
  const nextTrack = useStore((s) => s.nextTrack);
  const prevTrack = useStore((s) => s.prevTrack);

  return { isPlaying, currentTrack, togglePlay, nextTrack, prevTrack };
}

/** Volume-only slice: volume changes must not re-render transport consumers. */
export function useMusicVolume() {
  const volume = useStore((s) => s.volume);
  const setVolume = useStore((s) => s.setVolume);

  return { volume, setVolume };
}
