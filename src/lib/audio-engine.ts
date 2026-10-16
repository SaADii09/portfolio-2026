interface TrackPreset {
  waveform: OscillatorType;
  notes: number[];
  tempo: number;
  filterFreq: number;
  lfoRate: number;
  gain: number;
}

const TRACK_PRESETS: Record<string, TrackPreset> = {
  t1: {
    waveform: "sawtooth",
    notes: [261.63, 329.63, 392, 523.25],
    tempo: 0.4,
    filterFreq: 800,
    lfoRate: 2,
    gain: 0.3,
  },
  t2: {
    waveform: "square",
    notes: [440, 554.37, 659.25, 880],
    tempo: 0.2,
    filterFreq: 1200,
    lfoRate: 6,
    gain: 0.15,
  },
  t3: {
    waveform: "sine",
    notes: [130.81, 164.81, 196, 261.63],
    tempo: 0.6,
    filterFreq: 400,
    lfoRate: 0.5,
    gain: 0.4,
  },
  t4: {
    waveform: "triangle",
    notes: [329.63, 392, 493.88, 659.25],
    tempo: 0.5,
    filterFreq: 2000,
    lfoRate: 3,
    gain: 0.25,
  },
};

type AudioContextCtor = typeof AudioContext;

/**
 * Resolve the Web Audio constructor, tolerating engines that expose it under
 * an experimental name (old Safari) or not at all (headless WebKit, where
 * referencing `AudioContext` throws a ReferenceError). Returns `null` when
 * Web Audio is unavailable so callers can degrade to a silent no-op.
 */
function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const win = window as typeof globalThis & { webkitAudioContext?: AudioContextCtor };
  return win.AudioContext ?? win.webkitAudioContext ?? null;
}

export class SynthEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private lfo: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;
  private oscillators: OscillatorNode[] = [];
  private noteIndex = 0;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private _isPlaying = false;
  private _volume = 0.7;
  private _currentTrackId = "t1";

  private init() {
    if (this.ctx) return;
    const Ctor = getAudioContextCtor();
    if (!Ctor) return; // Web Audio unavailable — stay silent instead of throwing
    const ctx = new Ctor();
    this.ctx = ctx;
    try {
      this.buildGraph(ctx);
    } catch {
      // A half-built graph would early-return here forever (ctx non-null, filter
      // null ⇒ permanently silent while `_isPlaying` claims otherwise). Drop it so
      // a later init() can retry, and stay silent for now.
      this.resetGraph();
    }
  }

  private buildGraph(ctx: AudioContext) {
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this._volume;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 1000;
    this.filter.Q.value = 5;
    this.lfo = ctx.createOscillator();
    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 200;
    this.lfo.type = "sine";
    this.lfo.frequency.value = 2;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.filter.frequency);
    this.lfo.start();
    this.filter.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);
  }

  /** Tear down a partial/failed graph so the next `init()` starts clean. */
  private resetGraph() {
    const ctx = this.ctx;
    this.ctx = null;
    this.masterGain = null;
    this.filter = null;
    this.lfo = null;
    this.lfoGain = null;
    this.oscillators = [];
    try {
      void ctx?.close();
    } catch {
      // Closing a broken context is best-effort.
    }
  }

  private stopOscillators() {
    for (const osc of this.oscillators) {
      try {
        osc.stop();
      } catch {}
    }
    this.oscillators = [];
  }

  private scheduleNote() {
    if (!this._isPlaying || !this.ctx || !this.filter) return;

    const preset = TRACK_PRESETS[this._currentTrackId] ?? TRACK_PRESETS.t1;
    const note = preset.notes[this.noteIndex % preset.notes.length];
    this.noteIndex++;

    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = preset.waveform;
    osc.frequency.value = note;
    env.gain.value = 0;
    env.gain.linearRampToValueAtTime(preset.gain, this.ctx.currentTime + 0.02);
    env.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + preset.tempo * 0.9);
    osc.connect(env);
    env.connect(this.filter);
    osc.start(this.ctx.currentTime);
    osc.stop(this.ctx.currentTime + preset.tempo);
    this.oscillators.push(osc);

    this.timerId = setTimeout(() => this.scheduleNote(), preset.tempo * 1000);
  }

  play(trackId: string) {
    this.init();
    if (this.ctx?.state === "suspended") {
      void this.ctx.resume().catch(() => {});
    }
    this._currentTrackId = trackId;
    const preset = TRACK_PRESETS[trackId] ?? TRACK_PRESETS.t1;
    if (this.filter) {
      this.filter.frequency.value = preset.filterFreq;
    }
    if (this.lfo) {
      this.lfo.frequency.value = preset.lfoRate;
    }
    this.noteIndex = 0;
    this.stopOscillators();
    this._isPlaying = true;
    this.scheduleNote();
  }

  pause() {
    this._isPlaying = false;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.stopOscillators();
  }

  stop() {
    this.pause();
    this.noteIndex = 0;
  }

  setVolume(v: number) {
    this._volume = v;
    if (this.masterGain) {
      this.masterGain.gain.value = v;
    }
  }

  get isPlaying() {
    return this._isPlaying;
  }

  destroy() {
    this.stop();
    this.ctx?.close();
    this.ctx = null;
  }
}

let engine: SynthEngine | null = null;

export function getSynthEngine(): SynthEngine {
  if (!engine) {
    engine = new SynthEngine();
  }
  return engine;
}
