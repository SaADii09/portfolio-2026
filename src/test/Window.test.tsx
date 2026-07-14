import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Window } from "@/components/os/Window";

vi.mock("@/hooks/useMediaQuery", () => ({
  useIsMobile: () => false,
}));

const mockFocus = vi.fn();
const mockClose = vi.fn();
const mockMinimize = vi.fn();
const mockMaximize = vi.fn();
const mockRestore = vi.fn();
const mockSetOpacity = vi.fn();
const mockUpdatePosition = vi.fn();
const mockUpdateSize = vi.fn();

const baseWindow = {
  id: "win-1",
  title: "Test App",
  type: "app" as const,
  component: "AboutApp",
  x: 100,
  y: 100,
  width: 400,
  height: 300,
  zIndex: 101,
  opacity: 1,
  isMinimized: false,
  isMaximized: false,
  isPinned: false,
};

vi.mock("@/store", () => ({
  useStore: (selector: (s: unknown) => unknown) => {
    const state = {
      windows: [baseWindow],
      activeWindowId: "win-1",
      focusWindow: mockFocus,
      closeWindow: mockClose,
      minimizeWindow: mockMinimize,
      maximizeWindow: mockMaximize,
      restoreWindow: mockRestore,
      setWindowOpacity: mockSetOpacity,
      updateWindowPosition: mockUpdatePosition,
      updateWindowSize: mockUpdateSize,
    };
    return selector(state);
  },
}));

describe("Window", () => {
  it("renders the window title", () => {
    render(
      <Window id="win-1">
        <p>content</p>
      </Window>,
    );
    expect(screen.getByText("Test App")).toBeDefined();
  });

  it("renders children content", () => {
    render(
      <Window id="win-1">
        <p>hello world</p>
      </Window>,
    );
    expect(screen.getByText("hello world")).toBeDefined();
  });

  it("renders control buttons (minimize, maximize, close)", () => {
    render(
      <Window id="win-1">
        <p>content</p>
      </Window>,
    );
    expect(screen.getByLabelText("Minimize")).toBeDefined();
    expect(screen.getByLabelText("Maximize")).toBeDefined();
    expect(screen.getByLabelText("Close")).toBeDefined();
  });

  it("renders opacity slider", () => {
    render(
      <Window id="win-1">
        <p>content</p>
      </Window>,
    );
    expect(screen.getByLabelText("Window opacity")).toBeDefined();
  });

  it("returns null for non-existent window", () => {
    const { container } = render(
      <Window id="nonexistent">
        <p>content</p>
      </Window>,
    );
    expect(container.innerHTML).toBe("");
  });
});
