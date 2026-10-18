import { StateCreator } from "zustand";
import { getSynthEngine } from "@/lib/audio-engine";

export interface Track {
  id: string;
  title: string;
  artist: string;
}

const DEFAULT_TRACK: Track = {
  id: "t1",
  title: "Neon Lights",
  artist: "Synthwave Dreams",
};

const DEFAULT_TRACKS: Track[] = [
  DEFAULT_TRACK,
  { id: "t2", title: "Pixel Rain", artist: "8-Bit Universe" },
  { id: "t3", title: "Midnight Code", artist: "DevOS Beats" },
  { id: "t4", title: "Terminal Sunrise", artist: "The Debuggers" },
];

export interface MusicSlice {
  isPlaying: boolean;
  currentTrack: Track;
  volume: number;
  queue: Track[];
  togglePlay: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  setVolume: (v: number) => void;
}

/**
 * Audio output is best-effort: a missing, blocked, or unroutable AudioContext
 * (autoplay policy, headless browsers) must never prevent the OS store from
 * updating. Swallow playback errors so track/volume state always changes.
 */
function tryAudio(fn: () => void): void {
  try {
    fn();
  } catch {
    // Playback is optional; ignore so callers still update their state.
  }
}

export const createMusicSlice: StateCreator<MusicSlice> = (set, get) => ({
  isPlaying: false,
  currentTrack: DEFAULT_TRACK,
  volume: 0.7,
  queue: DEFAULT_TRACKS,

  togglePlay: () => {
    const { isPlaying, currentTrack } = get();
    if (isPlaying) {
      tryAudio(() => getSynthEngine().pause());
      set({ isPlaying: false });
    } else {
      tryAudio(() => getSynthEngine().play(currentTrack.id));
      set({ isPlaying: true });
    }
  },

  nextTrack: () => {
    const { queue, currentTrack } = get();
    const idx = queue.findIndex((t) => t.id === currentTrack.id);
    // Queue length ≥ 1 in practice; clamp + fallback keep the read provably safe
    // without changing the wrap-around behavior.
    const next = queue[(idx + 1) % Math.max(1, queue.length)] ?? currentTrack;
    tryAudio(() => getSynthEngine().play(next.id));
    set({ currentTrack: next, isPlaying: true });
  },

  prevTrack: () => {
    const { queue, currentTrack } = get();
    const idx = queue.findIndex((t) => t.id === currentTrack.id);
    const prev = queue[(idx - 1 + queue.length) % Math.max(1, queue.length)] ?? currentTrack;
    tryAudio(() => getSynthEngine().play(prev.id));
    set({ currentTrack: prev, isPlaying: true });
  },

  setVolume: (v) => {
    const clamped = Math.max(0, Math.min(1, v));
    tryAudio(() => getSynthEngine().setVolume(clamped));
    set({ volume: clamped });
  },
});
