import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { render } from "@testing-library/react";
import { Wallpaper, countParticles, shouldAnimate } from "@/components/os/Wallpaper";
import { useStore } from "@/store";

/**
 * jsdom returns null from `canvas.getContext("2d")`, which makes Wallpaper's
 * effect early-return before any listener/animation work. Every test therefore
 * stubs the prototype with a minimal 2D surface covering every method the
 * effect calls.
 */
function createCtxStub() {
  return {
    clearRect: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    putImageData: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    beginPath: vi.fn(),
    quadraticCurveTo: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    createImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  };
}

type CtxStub = ReturnType<typeof createCtxStub>;
type MqlListener = (event: MediaQueryListEvent) => void;

let ctxStub: CtxStub;
let rafSpy: MockInstance<typeof window.requestAnimationFrame>;
let cancelRafSpy: MockInstance<typeof window.cancelAnimationFrame>;
let addSpy: MockInstance<typeof window.addEventListener>;
let removeSpy: MockInstance<typeof window.removeEventListener>;
let reduceMotion = false;
/** change listeners captured from the matchMedia mocks the effect created */
let changeListeners = new Set<MqlListener>();

function installMatchMediaStub() {
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => {
    const listeners = new Set<MqlListener>();
    const mql = {
      // live getter: a real MediaQueryList reflects the current preference
      get matches() {
        return reduceMotion;
      },
      media: query,
      onchange: null,
      addEventListener: (type: string, cb: MqlListener) => {
        if (type === "change") listeners.add(cb);
      },
      removeEventListener: (type: string, cb: MqlListener) => {
        if (type === "change") listeners.delete(cb);
      },
      addListener: (cb: MqlListener) => listeners.add(cb),
      removeListener: (cb: MqlListener) => listeners.delete(cb),
      dispatchEvent: () => false,
    };
    changeListeners = listeners;
    return mql as unknown as MediaQueryList;
  });
}

function flipReducedMotion(matches: boolean) {
  reduceMotion = matches;
  changeListeners.forEach((cb) => cb({ matches } as MediaQueryListEvent));
}

function callsWithType(spy: { mock: { calls: unknown[][] } }, type: string) {
  return spy.mock.calls.filter((call) => call[0] === type);
}

let rafId = 0;

beforeEach(() => {
  ctxStub = createCtxStub();
  reduceMotion = false;
  changeListeners = new Set();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    ctxStub as unknown as CanvasRenderingContext2D,
  );
  installMatchMediaStub();
  if (!window.requestAnimationFrame) {
    Object.defineProperty(window, "requestAnimationFrame", { value: () => 0, configurable: true });
  }
  if (!window.cancelAnimationFrame) {
    Object.defineProperty(window, "cancelAnimationFrame", { value: () => {}, configurable: true });
  }
  rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => ++rafId);
  cancelRafSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  addSpy = vi.spyOn(window, "addEventListener");
  removeSpy = vi.spyOn(window, "removeEventListener");
  useStore.setState({ theme: "retro" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Object.defineProperty(window, "devicePixelRatio", { value: 1, configurable: true });
});

describe("Wallpaper reduced motion", () => {
  it("draws one static frame, tracks resize, and never starts rAF or attaches mousemove", () => {
    reduceMotion = true;
    const { container } = render(<Wallpaper />);
    expect(container.querySelector("canvas")).not.toBeNull();
    expect(rafSpy).not.toHaveBeenCalled();
    // resize is tracked in both modes (cheap geometric update); mousemove is not
    expect(callsWithType(addSpy, "resize")).toHaveLength(1);
    expect(callsWithType(addSpy, "mousemove")).toHaveLength(0);
    // exactly one static frame drawn (clearRect runs once, no loop)
    expect(ctxStub.clearRect).toHaveBeenCalledTimes(1);
  });

  it("re-enters animated mode when the media query flips to animate", () => {
    reduceMotion = true;
    render(<Wallpaper />);
    expect(rafSpy).not.toHaveBeenCalled();
    flipReducedMotion(false);
    expect(rafSpy).toHaveBeenCalled();
    expect(callsWithType(addSpy, "resize")).toHaveLength(1);
    expect(callsWithType(addSpy, "mousemove")).toHaveLength(1);
  });

  it("returns to a static frame when the media query flips back to reduce", () => {
    render(<Wallpaper />);
    const rafCallsAnimated = rafSpy.mock.calls.length;
    expect(rafCallsAnimated).toBeGreaterThan(0);
    flipReducedMotion(true);
    expect(cancelRafSpy).toHaveBeenCalled();
    // mousemove detaches on flip-back; resize stays attached in both modes
    expect(callsWithType(removeSpy, "mousemove").length).toBeGreaterThanOrEqual(1);
    expect(callsWithType(removeSpy, "resize")).toHaveLength(0);
    // static frame drawn on flip-back (the animated rAF stub never executed draw)
    expect(ctxStub.clearRect).toHaveBeenCalledTimes(1);
  });
});

describe("Wallpaper animation", () => {
  it("schedules the animation loop when motion is allowed", () => {
    render(<Wallpaper />);
    expect(rafSpy).toHaveBeenCalled();
  });
});

describe("Wallpaper helpers", () => {
  it("countParticles keeps per-theme maxima at full viewport width", () => {
    expect(countParticles("retro", 1440)).toEqual({ far: 25, near: 25 });
    expect(countParticles("neon", 1440)).toEqual({ far: 30, near: 30 });
    expect(countParticles("editorial", 1440)).toEqual({ far: 28, near: 27 });
  });

  it("countParticles scales down on small viewports but never below half", () => {
    const mobile = countParticles("neon", 375);
    const desktop = countParticles("neon", 2560);
    expect(mobile.far).toBeLessThan(desktop.far);
    expect(mobile.far).toEqual(Math.round(desktop.far * 0.5));
    // unknown theme falls back to retro constants
    expect(countParticles("unknown", 1440)).toEqual({ far: 25, near: 25 });
  });

  it("shouldAnimate is the negation of the reduced-motion preference", () => {
    expect(shouldAnimate(true)).toBe(false);
    expect(shouldAnimate(false)).toBe(true);
  });
});

describe("Wallpaper HiDPI", () => {
  it("sizes the canvas at devicePixelRatio 2 and applies the scale transform", () => {
    Object.defineProperty(window, "devicePixelRatio", { value: 2, configurable: true });
    const { container } = render(<Wallpaper />);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas.width).toBe(window.innerWidth * 2);
    expect(canvas.height).toBe(window.innerHeight * 2);
    expect(ctxStub.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
  });

  it("caps devicePixelRatio above 2 at 2", () => {
    Object.defineProperty(window, "devicePixelRatio", { value: 3, configurable: true });
    const { container } = render(<Wallpaper />);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas.width).toBe(window.innerWidth * 2);
    expect(canvas.height).toBe(window.innerHeight * 2);
    expect(ctxStub.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
  });
});

describe("Wallpaper resize", () => {
  it("debounces noise regeneration so 10 rapid resizes regen at most once more", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(<Wallpaper />);
    // initial noise generation at mount
    expect(ctxStub.createImageData).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 10; i++) {
      window.dispatchEvent(new Event("resize"));
    }
    // nothing regenerates before the debounce window elapses
    vi.advanceTimersByTime(149);
    expect(ctxStub.createImageData).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(ctxStub.createImageData).toHaveBeenCalledTimes(2);
  });

  it("reduced motion: a resize repaints exactly one static frame after the debounce window", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reduceMotion = true;
    render(<Wallpaper />);
    // one static frame + one initial noise generation at mount
    expect(ctxStub.clearRect).toHaveBeenCalledTimes(1);
    expect(ctxStub.createImageData).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 10; i++) {
      window.dispatchEvent(new Event("resize"));
    }
    // debounce still pending — no extra draw, no noise regen
    vi.advanceTimersByTime(149);
    expect(ctxStub.clearRect).toHaveBeenCalledTimes(1);
    expect(ctxStub.createImageData).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    // debounced tail regenerates noise AND repaints exactly one static frame
    expect(ctxStub.createImageData).toHaveBeenCalledTimes(2);
    expect(ctxStub.clearRect).toHaveBeenCalledTimes(2);
  });
});
