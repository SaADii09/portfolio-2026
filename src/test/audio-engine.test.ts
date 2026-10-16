import { describe, it, expect, afterEach, vi } from "vitest";
import { SynthEngine } from "@/lib/audio-engine";

const calls = { gains: 0, filters: 0, oscillators: 0 };

function makeGain() {
  return {
    gain: { value: 0, linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

function makeFilter() {
  return { type: "lowpass", frequency: { value: 0 }, Q: { value: 0 }, connect: vi.fn() };
}

function makeOscillator() {
  return { type: "sine", frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
}

/** Stand-in for the Web Audio constructor: the first filter node creation throws. */
class FlakyAudioContext {
  state = "running";
  currentTime = 0;
  destination = {};
  resume = () => Promise.resolve();
  close = () => Promise.resolve();

  createGain() {
    calls.gains += 1;
    return makeGain();
  }

  createBiquadFilter() {
    calls.filters += 1;
    if (calls.filters === 1) throw new Error("createBiquadFilter failed");
    return makeFilter();
  }

  createOscillator() {
    calls.oscillators += 1;
    return makeOscillator();
  }
}

/** jsdom exposes no Web Audio constructor, so define the global under test. */
function setAudioContext(value: unknown): void {
  Object.defineProperty(window, "AudioContext", { value, configurable: true, writable: true });
}

afterEach(() => {
  setAudioContext(undefined);
  calls.gains = 0;
  calls.filters = 0;
  calls.oscillators = 0;
});

describe("SynthEngine", () => {
  it("stays silent (and never throws) when Web Audio is unavailable", () => {
    setAudioContext(undefined);
    const engine = new SynthEngine();

    expect(() => engine.play("t1")).not.toThrow();
    expect(engine.isPlaying).toBe(true);
    expect(calls.filters).toBe(0);

    engine.pause();
  });

  it("resets a half-built graph so a later init() can retry instead of staying silent forever", () => {
    setAudioContext(FlakyAudioContext);
    const engine = new SynthEngine();

    // First attempt: ctor succeeds, node creation fails — degrade, don't throw.
    expect(() => engine.play("t1")).not.toThrow();
    expect(engine.isPlaying).toBe(true);
    expect(calls.filters).toBe(1);

    // Had the broken context been kept, init() would early-return here forever.
    expect(() => engine.play("t1")).not.toThrow();
    expect(calls.filters).toBe(2);
    expect(calls.oscillators).toBeGreaterThan(0);

    engine.pause();
  });
});
