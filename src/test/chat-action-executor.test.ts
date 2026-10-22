import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, type RenderHookResult } from "@testing-library/react";
import { executeMarkerAction } from "@/lib/ai/actions-client";
import { extractChatActions } from "@/lib/ai/actions";
import type { ActionRef } from "@/lib/ai/actions";
import { useChatActionExecutor } from "@/components/apps/chat-internal/useChatActionExecutor";

// The hook must never touch the OS — the executor half is a mock boundary so
// pins observe calls, not side effects. No network, no store.
vi.mock("@/lib/ai/actions-client", () => ({
  executeMarkerAction: vi.fn(() => true),
}));

// Real parser by default (parser realism for the split-content pin) — the
// wrapper is seeded back to the actual implementation in beforeEach (it must
// be lazy: the factory runs before this module's top-level bindings exist).
vi.mock("@/lib/ai/actions", () => ({
  extractChatActions: vi.fn(),
}));

const mockExecute = vi.mocked(executeMarkerAction);
const mockExtract = vi.mocked(extractChatActions);

beforeEach(async () => {
  vi.clearAllMocks();
  // Restore the wrapper to the real (unmocked) parser between tests.
  const actual = await vi.importActual<typeof import("@/lib/ai/actions")>("@/lib/ai/actions");
  mockExtract.mockImplementation(actual.extractChatActions);
});

type Streaming = { id: string; content: string } | null;

let testHook: RenderHookResult<void, { streaming: Streaming }> | null = null;

/** Advance the hook to a new snapshot of the streaming message. */
function stream(id: string, content: string): void {
  act(() => {
    testHook?.rerender({ streaming: { id, content } });
  });
}

function mount(streaming: Streaming): void {
  act(() => {
    testHook = renderHook(({ streaming }) => useChatActionExecutor(streaming), {
      initialProps: { streaming },
    });
  });
}

describe("useChatActionExecutor", () => {
  it("fires a marker completed across two stream writes exactly once", () => {
    mount(null);
    stream("m1", "Sure! [[act");
    expect(mockExecute).not.toHaveBeenCalled();

    stream("m1", "Sure! [[action:open_app:about]]");
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledWith({ verb: "open_app", arg: "about" });
  });

  it("never re-fires a duplicate full marker on later writes", () => {
    const content = "Hello [[action:music:play]] there";
    mount(null);
    stream("m1", content);
    expect(mockExecute).toHaveBeenCalledTimes(1);

    // Same content re-delivered (re-render), then with extra prose appended —
    // neither re-arms the already-executed marker.
    stream("m1", content);
    stream("m1", `${content} More prose.`);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("never fires an unknown or malformed marker", () => {
    mount(null);
    stream("m1", "[[action:open_app:notanapp]] [[action:bogus:x]] [[draft 1]]");
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("holds back an open partial until ]] arrives", () => {
    mount(null);
    stream("m1", "text [[action:music:pl");
    expect(mockExecute).not.toHaveBeenCalled();

    stream("m1", "text [[action:music:play]]");
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledWith({ verb: "music", arg: "play" });
  });

  it("silently drops markers beyond the 32-per-message cap", () => {
    mockExtract.mockImplementation((content: string) => {
      // Lenient fake parser used ONLY here: the hook trusts the parser
      // contract, so 40 syntactically-fake markers exercise the cap without
      // needing 40 distinct real verb:arg pairs (the closed tables offer 25).
      const actions: ActionRef[] = [...content.matchAll(/\[\[c:(\d+)\]\]/g)].map((match) => ({
        verb: "music",
        arg: `m${match[1]}`,
      }));
      return { text: "", actions, openPartial: false };
    });

    const forty = Array.from({ length: 40 }, (_, i) => `[[c:${i}]]`).join(" ");
    mount(null);
    stream("m1", forty);
    expect(mockExecute).toHaveBeenCalledTimes(32);

    // Further writes with the same oversized batch never un-cap.
    stream("m1", forty);
    expect(mockExecute).toHaveBeenCalledTimes(32);
  });

  it("resets bookkeeping when a fresh message id streams", () => {
    mount(null);
    stream("m1", "[[action:toggle_widget:notes]]");
    expect(mockExecute).toHaveBeenCalledTimes(1);

    stream("m2", "[[action:toggle_widget:notes]]");
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it("survives re-renders without double-firing", () => {
    mount(null);
    stream("m1", "a [[action:set_theme:neon]] b");
    expect(mockExecute).toHaveBeenCalledTimes(1);

    // Several idle re-renders (snapshot unchanged, object identity new).
    for (let i = 0; i < 5; i += 1) {
      act(() => {
        testHook?.rerender({ streaming: { id: "m1", content: "a [[action:set_theme:neon]] b" } });
      });
    }
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("does nothing when there is no streaming message", () => {
    mount(null);
    stream("m1", "[[action:music:pause]]");
    expect(mockExecute).toHaveBeenCalledTimes(1);

    act(() => {
      testHook?.rerender({ streaming: null });
    });
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});
