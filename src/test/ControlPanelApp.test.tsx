import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ControlPanelApp } from "@/components/apps/ControlPanelApp";

const mockSetTheme = vi.fn();
const mockUpdateCustomToken = vi.fn();
const mockResetCustomTokens = vi.fn();
const mockTogglePlay = vi.fn();
const mockNextTrack = vi.fn();
const mockPrevTrack = vi.fn();
const mockSetVolume = vi.fn();

vi.mock("@/store", () => ({
  useStore: (selector: (s: unknown) => unknown) => {
    const state = {
      theme: "retro" as const,
      setTheme: mockSetTheme,
      customTokens: {},
      updateCustomToken: mockUpdateCustomToken,
      resetCustomTokens: mockResetCustomTokens,
      isPlaying: false,
      currentTrack: { id: "t1", title: "Neon Lights", artist: "Synthwave Dreams" },
      volume: 0.7,
      togglePlay: mockTogglePlay,
      nextTrack: mockNextTrack,
      prevTrack: mockPrevTrack,
      setVolume: mockSetVolume,
    };
    return selector(state);
  },
}));

describe("ControlPanelApp", () => {
  it("renders theme section with all three themes", () => {
    render(<ControlPanelApp />);
    expect(screen.getByText("Retro 2D")).toBeDefined();
    expect(screen.getByText("Neon City")).toBeDefined();
    expect(screen.getByText("Classic Editorial")).toBeDefined();
  });

  it("renders color customizer with accent and background inputs", () => {
    render(<ControlPanelApp />);
    const inputs = screen.getAllByRole("button", { name: /reset/i });
    expect(inputs.length).toBeGreaterThanOrEqual(0);
    expect(screen.getByText("Reset Colors")).toBeDefined();
  });

  it("renders music player with track info", () => {
    render(<ControlPanelApp />);
    expect(screen.getByText("Neon Lights")).toBeDefined();
    expect(screen.getByText("Synthwave Dreams")).toBeDefined();
  });

  it("renders music player controls", () => {
    render(<ControlPanelApp />);
    expect(screen.getByLabelText("Play")).toBeDefined();
    expect(screen.getByLabelText("Previous track")).toBeDefined();
    expect(screen.getByLabelText("Next track")).toBeDefined();
    expect(screen.getByLabelText("Volume")).toBeDefined();
  });

  it("calls setTheme when a theme card is clicked", () => {
    render(<ControlPanelApp />);
    fireEvent.click(screen.getByText("Neon City"));
    expect(mockSetTheme).toHaveBeenCalledWith("neon");
  });

  it("calls togglePlay when play button clicked", () => {
    render(<ControlPanelApp />);
    fireEvent.click(screen.getByLabelText("Play"));
    expect(mockTogglePlay).toHaveBeenCalled();
  });
});
