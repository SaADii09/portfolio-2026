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

import { useStore } from "@/store";
import { ChatPanel } from "@/components/os/ChatPanel";
import type { WindowInstance } from "@/types/window";

/**
 * Chat as a registered OS app (chat phase, Task 7): the desktop edge tab is a
 * VISIBILITY rule only — it stands in for the chat window, so it must show iff
 * no non-minimized `chat` window exists. Badges are a later task's.
 *
 * jsdom ships no media-query engine, so `useIsMobile` resolves false and
 * `ChatPanel` renders its desktop branch.
 */

function chatWindow(overrides: Partial<WindowInstance> = {}): WindowInstance {
  return {
    id: "win-chat",
    title: "Dev Chat",
    type: "app",
    component: "chat",
    x: 0,
    y: 0,
    width: 420,
    height: 640,
    zIndex: 10,
    opacity: 1,
    isMinimized: false,
    isMaximized: false,
    isPinned: false,
    ...overrides,
  };
}

describe("ChatPanel desktop edge tab", () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.setState({
      windows: [],
      activeWindowId: null,
      chatOpen: false,
      messages: [],
      isLoading: false,
    });
  });

  it("shows the edge tab when no chat window exists", () => {
    render(<ChatPanel />);
    expect(screen.getByLabelText("Open chat")).toBeInTheDocument();
  });

  it("hides the edge tab while a non-minimized chat window is open", () => {
    useStore.setState({ windows: [chatWindow()] });

    render(<ChatPanel />);

    expect(screen.queryByLabelText("Open chat")).toBeNull();
  });

  it("keeps the edge tab while the chat window is only minimized", () => {
    useStore.setState({ windows: [chatWindow({ isMinimized: true })] });

    render(<ChatPanel />);

    expect(screen.getByLabelText("Open chat")).toBeInTheDocument();
  });

  it("keeps the edge tab while another app's window is open", () => {
    useStore.setState({ windows: [chatWindow({ component: "about", title: "About Me" })] });

    render(<ChatPanel />);

    expect(screen.getByLabelText("Open chat")).toBeInTheDocument();
  });

  it("launches the Dev Chat window on click", () => {
    render(<ChatPanel />);

    fireEvent.click(screen.getByLabelText("Open chat"));

    const state = useStore.getState();
    expect(state.windows).toHaveLength(1);
    expect(state.windows[0]?.component).toBe("chat");
    // The edge tab steps aside for the window it just opened.
    expect(screen.queryByLabelText("Open chat")).toBeNull();
  });
});
