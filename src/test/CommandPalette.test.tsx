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

// Spy on the imperative os-actions without losing their real behavior: the
// palette's action coverage is "did we call the right action with the right arg".
vi.mock("@/lib/os-actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/os-actions")>();
  return {
    ...actual,
    musicControl: vi.fn(actual.musicControl),
    toggleWidget: vi.fn(actual.toggleWidget),
  };
});

import { useStore } from "@/store";
import { CommandPalette } from "@/components/os/CommandPalette";
import { musicControl, toggleWidget } from "@/lib/os-actions";

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
    vi.mocked(musicControl).mockClear();
    vi.mocked(toggleWidget).mockClear();
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

    // "neon city" matches the theme row alone; bare "neon" also scores the music
    // toggle's "Neon Lights" keyword, so the row order decided the old assertion.
    fireEvent.change(input, { target: { value: "neon city" } });

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

    fireEvent.change(input, { target: { value: "neon city" } });
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
    expect(input).toHaveAttribute("aria-activedescendant", afterDown[1]?.id ?? "");

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

  it("runs the musicControl action and closes the palette", () => {
    openPaletteInDom();

    fireEvent.click(screen.getByRole("option", { name: /Next track/ }));

    expect(musicControl).toHaveBeenCalledTimes(1);
    expect(musicControl).toHaveBeenCalledWith("next");
    expect(useStore.getState().isPaletteOpen).toBe(false);
  });

  it("runs the toggleWidget action and closes the palette", () => {
    openPaletteInDom();

    fireEvent.click(screen.getByRole("option", { name: /Show Weather widget/ }));

    expect(toggleWidget).toHaveBeenCalledTimes(1);
    expect(toggleWidget).toHaveBeenCalledWith("weather");
    expect(useStore.getState().widgets.map((w) => w.type)).toContain("weather");
    expect(useStore.getState().isPaletteOpen).toBe(false);
  });

  it("advertises the listbox only while results are rendered", () => {
    const input = openPaletteInDom();

    expect(input).toHaveAttribute("aria-autocomplete", "list");
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-controls", "command-palette-listbox");

    fireEvent.change(input, { target: { value: "zzz" } });

    // No rows rendered → no dangling aria-controls, and the combobox is collapsed.
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).not.toHaveAttribute("aria-controls");
  });

  it("keeps Tab inside the dialog, cycling input → results → input", () => {
    const input = openPaletteInDom();
    const options = screen.getAllByRole("option");
    // The trap reads `document.activeElement`, so always dispatch from the focused node.
    const tab = (shiftKey = false) =>
      fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Tab", shiftKey });

    tab();
    expect(options[0]).toHaveFocus();

    tab();
    expect(options[1]).toHaveFocus();

    // Walk off the end of the list: focus wraps back to the input, never out of the dialog.
    options[options.length - 1]?.focus();
    tab();
    expect(input).toHaveFocus();

    tab(true);
    expect(options[options.length - 1]).toHaveFocus();
  });

  it("keeps focus on the input when nothing else is focusable", () => {
    const input = openPaletteInDom();

    fireEvent.change(input, { target: { value: "zzz" } });
    fireEvent.keyDown(input, { key: "Tab" });

    expect(input).toHaveFocus();
  });

  it("locks document scroll while open and restores it on close", () => {
    render(<PaletteHost />);
    expect(document.body.style.overflow).toBe("");

    act(() => useStore.getState().openPalette());
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.documentElement.style.overflow).toBe("hidden");

    act(() => useStore.getState().closePalette());
    expect(document.body.style.overflow).toBe("");
    expect(document.documentElement.style.overflow).toBe("");
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
