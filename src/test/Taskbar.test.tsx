import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Taskbar } from "@/components/os/Taskbar";

vi.mock("@/hooks/useMediaQuery", () => ({
  useIsMobile: () => false,
}));

const mockFocus = vi.fn();
const mockRestore = vi.fn();
const mockOpenWindow = vi.fn();
const mockSetTheme = vi.fn();

vi.mock("@/store", () => ({
  useStore: (selector: (s: unknown) => unknown) => {
    const state = {
      windows: [
        {
          id: "win-1",
          title: "About",
          component: "about",
          isMinimized: false,
        },
        {
          id: "win-2",
          title: "Terminal",
          component: "terminal",
          isMinimized: true,
        },
      ],
      focusWindow: mockFocus,
      restoreWindow: mockRestore,
      openWindow: mockOpenWindow,
      theme: "retro" as const,
      setTheme: mockSetTheme,
    };
    return selector(state);
  },
}));

describe("Taskbar (desktop)", () => {
  it("renders Start button", () => {
    render(<Taskbar />);
    expect(screen.getByText("Start")).toBeDefined();
  });

  it("renders window chips for each open window", () => {
    render(<Taskbar />);
    expect(screen.getByText("About")).toBeDefined();
    expect(screen.getByText("Terminal")).toBeDefined();
  });

  it("renders theme toggle buttons", () => {
    render(<Taskbar />);
    expect(screen.getByLabelText("Retro 2D")).toBeDefined();
    expect(screen.getByLabelText("Neon City")).toBeDefined();
    expect(screen.getByLabelText("Classic Editorial")).toBeDefined();
  });

  it("renders Settings button", () => {
    render(<Taskbar />);
    expect(screen.getByLabelText("Open Settings")).toBeDefined();
  });

  it("shows current time", () => {
    render(<Taskbar />);
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    expect(screen.getByText(now)).toBeDefined();
  });
});
