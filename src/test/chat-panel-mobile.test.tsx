import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// jsdom has no Web Audio API — the store pulls the synth engine in at module load.
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

// Force the mobile branch: FAB + bottom sheet (Task 10 badge coverage).
vi.mock("@/hooks/useMediaQuery", () => ({
  useIsMobile: () => true,
  useMediaQuery: () => true,
}));

import { useStore } from "@/store";
import { ChatPanel } from "@/components/os/ChatPanel";

/**
 * Task 10 mobile concierge pins: the FAB carries the unread badge and opens
 * the bottom sheet; the sheet header carries reset + close.
 */
describe("ChatPanel mobile FAB + sheet", () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.setState({
      windows: [],
      activeWindowId: null,
      chatOpen: false,
      messages: [],
      isLoading: false,
      unreadCount: 0,
      chatGreeted: true,
    });
  });

  it("shows the unread count on the FAB and caps it at 9+", () => {
    useStore.setState({ unreadCount: 3 });
    const { unmount } = render(<ChatPanel />);
    const fab = screen.getByLabelText("Open chat, 3 unread");
    expect(fab.textContent).toBe("3");
    unmount();

    useStore.setState({ chatOpen: false, unreadCount: 12 });
    render(<ChatPanel />);
    expect(screen.getByLabelText("Open chat, 12 unread").textContent).toBe("9+");
  });

  it("shows no badge on the FAB at zero unread", () => {
    render(<ChatPanel />);
    expect(screen.getByLabelText("Open chat").textContent).toBe("");
  });

  it("opens the sheet from the FAB and exposes reset + close", () => {
    useStore.setState({ messages: [{ id: "u1", role: "user", content: "hi", timestamp: 1 }] });

    render(<ChatPanel />);
    fireEvent.click(screen.getByLabelText("Open chat"));

    expect(useStore.getState().chatOpen).toBe(true);
    expect(screen.getByText("Dev Chat")).toBeInTheDocument();
    expect(screen.getByLabelText("Clear conversation")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Clear conversation"));
    expect(useStore.getState().messages).toHaveLength(0);

    fireEvent.click(screen.getByLabelText("Close chat"));
    expect(useStore.getState().chatOpen).toBe(false);
  });
});
