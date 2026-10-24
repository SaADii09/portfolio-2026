import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

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

// Executor boundary (same mock shape as T5's suite): the shell pins observe
// the execution calls, not OS side effects.
vi.mock("@/lib/ai/actions-client", () => ({
  executeMarkerAction: vi.fn(() => true),
}));

import { useStore } from "@/store";
import { executeMarkerAction } from "@/lib/ai/actions-client";
import { ChatApp } from "@/components/apps/ChatApp";
import { ChatPanel } from "@/components/os/ChatPanel";
import { StarterChips } from "@/components/apps/chat-internal/StarterChips";
import type { Message } from "@/types/chat";
import type { ChatSlice } from "@/store/chatSlice";

/**
 * Task 8 pins for the shared chat internals + thin ChatPanel shell.
 *
 * jsdom ships no media-query engine, so `useIsMobile` resolves false and
 * ChatPanel renders its desktop branch.
 */

const mockExecute = vi.mocked(executeMarkerAction);

function msg(
  id: string,
  role: Message["role"],
  content: string,
  extra: Partial<Message> = {},
): Message {
  return { id, role, content, timestamp: Date.now(), ...extra };
}

/** Replace the slice's streaming action so a compose/pick dispatches nothing. */
function spyOnSendMessage(): ReturnType<typeof vi.fn> {
  const spy = vi.fn((text: string) => Promise.resolve());
  useStore.setState({ sendMessage: spy as ChatSlice["sendMessage"] });
  return spy;
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
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

describe("ChatApp", () => {
  it("renders the conversation from the store", () => {
    useStore.setState({
      messages: [
        msg("u1", "user", "What do you build?"),
        msg("a1", "assistant", "Portfolio tools like this desktop."),
      ],
    });

    render(<ChatApp />);

    expect(screen.getByText("What do you build?")).toBeInTheDocument();
    expect(screen.getByText("Portfolio tools like this desktop.")).toBeInTheDocument();
  });

  it("renders assistant markdown from the store", () => {
    useStore.setState({
      messages: [msg("a1", "assistant", "The **dashboard** is live.")],
    });

    render(<ChatApp />);

    expect(screen.getByText("dashboard").tagName).toBe("STRONG");
  });

  it("shows the empty state while the conversation is bare", () => {
    render(<ChatApp />);

    expect(
      screen.getByText("Ask me anything about my work, skills, or projects."),
    ).toBeInTheDocument();
  });

  it("shows starter chips only while the conversation is empty", () => {
    const { rerender } = render(<ChatApp />);

    expect(screen.getByRole("group", { name: "Starter prompts" })).toBeInTheDocument();

    useStore.setState({ messages: [msg("u1", "user", "Hello")] });
    rerender(<ChatApp />);

    expect(screen.queryByRole("group", { name: "Starter prompts" })).toBeNull();
  });

  it("composer Enter sends the draft and clears the field", () => {
    const sendMessage = spyOnSendMessage();
    render(<ChatApp />);

    const composer = screen.getByPlaceholderText(
      "Type a message...",
    ) as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: "Show me projects" } });
    fireEvent.keyDown(composer, { key: "Enter" });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith("Show me projects");
    expect(composer.value).toBe("");

    // The send button dispatches the same draft path.
    fireEvent.change(composer, { target: { value: "Via the button" } });
    fireEvent.click(screen.getByLabelText("Send"));
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenLastCalledWith("Via the button");
  });

  it("composer Shift+Enter inserts a newline instead of sending", () => {
    const sendMessage = spyOnSendMessage();
    render(<ChatApp />);

    const composer = screen.getByPlaceholderText(
      "Type a message...",
    ) as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: "line one" } });
    fireEvent.keyDown(composer, { key: "Enter", shiftKey: true });

    expect(sendMessage).not.toHaveBeenCalled();
    expect(composer.value).toBe("line one");
  });

  it("carry 44px touch targets on composer textarea, send button, and chips", () => {
    render(<ChatApp />);

    const composer = screen.getByPlaceholderText("Type a message...");
    expect(composer.className).toContain("min-h-[44px]");

    const send = screen.getByLabelText("Send");
    expect(send.className).toContain("min-h-[44px]");
    expect(send.className).toContain("min-w-[44px]");

    const chips = screen.getAllByRole("button", { name: "What can you do?" });
    for (const chip of chips) {
      expect(chip.className).toContain("min-h-[44px]");
    }
  });

});

describe("StarterChips", () => {
  it("calls onPick with the chip's text", () => {
    const onPick = vi.fn();
    useStore.setState({ isLoading: false });
    render(<StarterChips onPick={onPick} />);

    fireEvent.click(screen.getByRole("button", { name: "What can you do?" }));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith("What can you do?");
  });

  it("disables every chip while a turn streams", () => {
    const onPick = vi.fn();
    useStore.setState({ isLoading: true });
    render(<StarterChips onPick={onPick} />);

    const group = screen.getByRole("group", { name: "Starter prompts" });
    const chips = within(group).getAllByRole("button");
    expect(chips.length).toBeGreaterThan(0);
    for (const chip of chips) {
      expect(chip).toBeDisabled();
    }

    fireEvent.click(screen.getByRole("button", { name: "Show me your projects" }));
    expect(onPick).not.toHaveBeenCalled();
  });
});

describe("ChatPanel shell executor mount", () => {
  it("fires a completed marker from the shell while the chat window is closed", () => {
    useStore.setState({
      messages: [
        msg("u1", "user", "Open the about app for me"),
        msg("a1", "assistant", "Sure — [[action:open_app:about]]", { streaming: true }),
      ],
      windows: [],
      chatOpen: false,
      isLoading: false,
    });

    render(<ChatPanel />);

    // Window closed: no non-minimized chat window → the edge tab shows, and
    // the always-mounted shell executor still executed the marker.
    expect(screen.getByLabelText("Open chat")).toBeInTheDocument();
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledWith({ verb: "open_app", arg: "about" });
  });

  it("ignores a finished (non-streaming) message", () => {
    useStore.setState({
      messages: [
        msg("a1", "assistant", "Done — [[action:open_app:about]]", { streaming: false }),
      ],
    });

    render(<ChatPanel />);

    expect(mockExecute).not.toHaveBeenCalled();
  });
});
