import { describe, it, expect, vi } from "vitest";

// Regression guard: headless WebKit defines no global AudioContext, so every
// synth-engine call throws a ReferenceError. Music state must still update.
vi.mock("@/lib/audio-engine", () => {
  const explode = () => {
    throw new ReferenceError("Can't find variable: AudioContext");
  };
  return {
    getSynthEngine: () => ({
      play: explode,
      pause: explode,
      stop: explode,
      setVolume: explode,
      destroy: explode,
      isPlaying: false,
    }),
  };
});

import { createMusicSlice, type MusicSlice } from "@/store/musicSlice";

function createSlice(): MusicSlice {
  const state = {} as MusicSlice;
  const set = (partial: Partial<MusicSlice> | ((s: MusicSlice) => Partial<MusicSlice>)) => {
    Object.assign(state, typeof partial === "function" ? partial(state) : partial);
  };
  const get = () => state;
  Object.assign(state, createMusicSlice(set, get, {} as never));
  return state;
}

describe("musicSlice — audio engine failures are non-fatal", () => {
  it("advances tracks even when playback throws", () => {
    const slice = createSlice();
    expect(() => slice.nextTrack()).not.toThrow();
    expect(slice.currentTrack.title).toBe("Pixel Rain");
    expect(slice.isPlaying).toBe(true);
  });

  it("goes back a track even when playback throws", () => {
    const slice = createSlice();
    expect(() => slice.prevTrack()).not.toThrow();
    expect(slice.currentTrack.title).toBe("Terminal Sunrise");
  });

  it("toggles playback state even when playback throws", () => {
    const slice = createSlice();
    expect(() => slice.togglePlay()).not.toThrow();
    expect(slice.isPlaying).toBe(true);
    expect(() => slice.togglePlay()).not.toThrow();
    expect(slice.isPlaying).toBe(false);
  });

  it("clamps and stores volume even when playback throws", () => {
    const slice = createSlice();
    expect(() => slice.setVolume(2)).not.toThrow();
    expect(slice.volume).toBe(1);
  });
});
