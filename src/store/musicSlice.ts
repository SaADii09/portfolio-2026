import { StateCreator } from "zustand";
import { getSynthEngine } from "@/lib/audio-engine";

export interface Track {
  id: string;
  title: string;
  artist: string;
}

const DEFAULT_TRACKS: Track[] = [
  { id: "t1", title: "Neon Lights", artist: "Synthwave Dreams" },
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

export const createMusicSlice: StateCreator<MusicSlice> = (set, get) => ({
  isPlaying: false,
  currentTrack: DEFAULT_TRACKS[0],
  volume: 0.7,
  queue: DEFAULT_TRACKS,

  togglePlay: () => {
    const engine = getSynthEngine();
    const { isPlaying, currentTrack } = get();
    if (isPlaying) {
      engine.pause();
      set({ isPlaying: false });
    } else {
      engine.play(currentTrack.id);
      set({ isPlaying: true });
    }
  },

  nextTrack: () => {
    const engine = getSynthEngine();
    const { queue, currentTrack } = get();
    const idx = queue.findIndex((t) => t.id === currentTrack.id);
    const next = queue[(idx + 1) % queue.length];
    engine.play(next.id);
    set({ currentTrack: next, isPlaying: true });
  },

  prevTrack: () => {
    const engine = getSynthEngine();
    const { queue, currentTrack } = get();
    const idx = queue.findIndex((t) => t.id === currentTrack.id);
    const prev = queue[(idx - 1 + queue.length) % queue.length];
    engine.play(prev.id);
    set({ currentTrack: prev, isPlaying: true });
  },

  setVolume: (v) => {
    const engine = getSynthEngine();
    const clamped = Math.max(0, Math.min(1, v));
    engine.setVolume(clamped);
    set({ volume: clamped });
  },
});
