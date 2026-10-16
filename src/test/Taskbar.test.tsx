import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Taskbar } from "@/components/os/Taskbar";

vi.mock("@/components/os/StartMenu", () => ({
  StartMenu: () => <div data-testid="start-menu" />,
}));

const mocks = vi.hoisted(() => {
  const focusWindow = vi.fn();
  const restoreWindow = vi.fn();
  const state = {
    windows: [
      {
        id: "win-1",
        title: "About",
        component: "about",
        isMinimized: false,
        isMaximized: false,
      },
      {
        id: "win-2",
        title: "Terminal",
        component: "terminal",
        isMinimized: true,
        isMaximized: false,
      },
    ],
    focusWindow,
    restoreWindow,
    minimizeWindow: vi.fn(),
    maximizeWindow: vi.fn(),
    closeWindow: vi.fn(),
    openWindow: vi.fn(),
  };
  return { state, focusWindow, restoreWindow };
});

vi.mock("@/store", () => ({
  useStore: Object.assign((selector: (s: unknown) => unknown) => selector(mocks.state), {
    getState: () => mocks.state,
  }),
}));

describe("Taskbar (mobile)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the Home button", () => {
    render(<Taskbar />);
    expect(screen.getByLabelText("Home")).toBeDefined();
  });

  it("renders a button for each open window", () => {
    render(<Taskbar />);
    expect(screen.getByLabelText("About")).toBeDefined();
    expect(screen.getByLabelText("Terminal")).toBeDefined();
  });

  it("focuses a non-minimized window when its button is tapped", () => {
    render(<Taskbar />);
    fireEvent.click(screen.getByLabelText("About"));
    expect(mocks.focusWindow).toHaveBeenCalledWith("win-1");
  });

  it("restores a minimized window when its button is tapped", () => {
    render(<Taskbar />);
    fireEvent.click(screen.getByLabelText("Terminal"));
    expect(mocks.restoreWindow).toHaveBeenCalledWith("win-2");
  });

  it("opens the Start menu from the Home button", () => {
    render(<Taskbar />);
    fireEvent.click(screen.getByLabelText("Home"));
    expect(screen.getByTestId("start-menu")).toBeDefined();
  });
});
