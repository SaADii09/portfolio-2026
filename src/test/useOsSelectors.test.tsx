import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render } from "@testing-library/react";
import { useStore } from "@/store";
import { useMusicPlayback, useMusicVolume } from "@/hooks/useOsSelectors";

// jsdom has no Web Audio API — the selectors never play anything, but mocking
// keeps the store import hermetic.
vi.mock("@/lib/audio-engine", () => ({
  getSynthEngine: () => ({
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    setVolume: vi.fn(),
    destroy: vi.fn(),
    isPlaying: false,
  }),
}));

/**
 * Per-field subscription granularity: a consumer of one slice of the music state
 * must not re-render for changes to the other slice (a 7-field hook made the
 * widget re-render on every volume-slider tick).
 */
describe("useOsSelectors — music granularity", () => {
  beforeEach(() => {
    useStore.setState({
      isPlaying: false,
      volume: 0.7,
      currentTrack: { id: "t1", title: "Neon Lights", artist: "Synthwave Dreams" },
    });
  });

  it("playback consumers ignore volume changes but follow track changes", () => {
    let renders = 0;
    function Probe() {
      const { currentTrack } = useMusicPlayback();
      renders += 1;
      return <span>{currentTrack.title}</span>;
    }

    render(<Probe />);
    const afterMount = renders;

    act(() => {
      useStore.setState({ volume: 0.25 });
    });
    expect(renders).toBe(afterMount);

    act(() => {
      useStore.setState({
        currentTrack: { id: "t2", title: "Pixel Rain", artist: "8-Bit Universe" },
      });
    });
    expect(renders).toBeGreaterThan(afterMount);
  });

  it("volume consumers ignore playback changes but follow volume changes", () => {
    let renders = 0;
    function Probe() {
      const { volume } = useMusicVolume();
      renders += 1;
      return <span>{volume}</span>;
    }

    render(<Probe />);
    const afterMount = renders;

    act(() => {
      useStore.setState({
        isPlaying: true,
        currentTrack: { id: "t2", title: "Pixel Rain", artist: "8-Bit Universe" },
      });
    });
    expect(renders).toBe(afterMount);

    act(() => {
      useStore.setState({ volume: 0.4 });
    });
    expect(renders).toBeGreaterThan(afterMount);
  });
});
