import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";

// jsdom has no Web Audio API — stub the synth engine so store music actions work.
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

// jsdom has no reliable matchMedia — the palette's own mobile layout is covered by e2e.
vi.mock("@/hooks/useMediaQuery", () => ({
  useIsMobile: () => false,
}));

import { useStore } from "@/store";
import { CommandPalette } from "@/components/os/CommandPalette";

/** Mirrors Desktop's mount: the palette only exists while `isPaletteOpen`. */
function PaletteHost() {
  const isOpen = useStore((s) => s.isPaletteOpen);
  if (!isOpen) return null;
  return <CommandPalette />;
}

function openPaletteInDom() {
  render(<PaletteHost />);
  act(() => useStore.getState().openPalette());
  return screen.getByRole("combobox");
}

describe("CommandPalette", () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.setState({
      windows: [],
      activeWindowId: null,
      widgets: [],
      theme: "retro",
      isPlaying: false,
      isPaletteOpen: false,
    });
  });

  it("renders nothing while closed and autofocuses the input when opened", () => {
    render(<PaletteHost />);
    expect(screen.queryByRole("dialog")).toBeNull();

    act(() => useStore.getState().openPalette());

    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeDefined();
    expect(screen.getByRole("combobox")).toHaveFocus();
  });

  it("filters results while typing", () => {
    const input = openPaletteInDom();

    fireEvent.change(input, { target: { value: "neon" } });

    expect(screen.getByText("Switch theme: Neon City")).toBeDefined();
    expect(screen.queryByText("Open Terminal")).toBeNull();
  });

  it("shows the empty state when no item matches", () => {
    const input = openPaletteInDom();

    fireEvent.change(input, { target: { value: "zzz" } });

    expect(screen.getByText("No matching commands")).toBeDefined();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("runs the highlighted action on Enter and closes the palette", () => {
    const input = openPaletteInDom();

    fireEvent.change(input, { target: { value: "neon" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(useStore.getState().theme).toBe("neon");
    expect(useStore.getState().isPaletteOpen).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("moves the selection with ArrowUp/ArrowDown and wraps around", () => {
    const input = openPaletteInDom();

    // Empty query lists everything in source order: apps first.
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    const afterDown = screen.getAllByRole("option");
    expect(afterDown[1]).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", afterDown[1].id);

    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    const wrapped = screen.getAllByRole("option");
    expect(wrapped[wrapped.length - 1]).toHaveAttribute("aria-selected", "true");
  });

  it("Enter on the second item opens the Projects window", () => {
    const input = openPaletteInDom();

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(useStore.getState().windows.map((w) => w.title)).toContain("Projects");
    expect(useStore.getState().isPaletteOpen).toBe(false);
  });

  it("Enter is a no-op when there is no selection", () => {
    const input = openPaletteInDom();

    fireEvent.change(input, { target: { value: "zzz" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(useStore.getState().isPaletteOpen).toBe(true);
    expect(useStore.getState().windows).toHaveLength(0);
    expect(useStore.getState().theme).toBe("retro");
  });

  it("closes on Escape, claims the event, and leaves open windows alone", () => {
    act(() =>
      useStore.getState().openWindow({ title: "About Me", type: "app", component: "about" }),
    );
    const input = openPaletteInDom();

    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      input.dispatchEvent(event);
    });

    // The deferring global shortcut layer checks `defaultPrevented`.
    expect(event.defaultPrevented).toBe(true);
    expect(useStore.getState().isPaletteOpen).toBe(false);
    expect(useStore.getState().windows).toHaveLength(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes when the backdrop is clicked", () => {
    const { container } = render(<PaletteHost />);
    act(() => useStore.getState().openPalette());

    const backdrop = container.firstElementChild as HTMLElement;
    fireEvent.pointerDown(backdrop);

    expect(useStore.getState().isPaletteOpen).toBe(false);
  });

  it("restores focus to the previously focused element on close", () => {
    render(
      <>
        <button type="button">outside</button>
        <PaletteHost />
      </>,
    );
    const outside = screen.getByText("outside");
    outside.focus();
    expect(outside).toHaveFocus();

    act(() => useStore.getState().openPalette());
    expect(screen.getByRole("combobox")).toHaveFocus();

    act(() => useStore.getState().closePalette());
    expect(outside).toHaveFocus();
  });
});
