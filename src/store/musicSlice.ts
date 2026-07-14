import { StateCreator } from "zustand";

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

  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),

  nextTrack: () => {
    const { queue, currentTrack } = get();
    const idx = queue.findIndex((t) => t.id === currentTrack.id);
    const next = queue[(idx + 1) % queue.length];
    set({ currentTrack: next, isPlaying: true });
  },

  prevTrack: () => {
    const { queue, currentTrack } = get();
    const idx = queue.findIndex((t) => t.id === currentTrack.id);
    const prev = queue[(idx - 1 + queue.length) % queue.length];
    set({ currentTrack: prev, isPlaying: true });
  },

  setVolume: (v) => set({ volume: Math.max(0, Math.min(1, v)) }),
});
