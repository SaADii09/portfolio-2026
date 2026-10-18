import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useStore } from "@/store";
import { createChatSlice, ChatSlice } from "@/store/chatSlice";
import { MusicWidget } from "@/components/widgets/MusicWidget";
import { WeatherWidget } from "@/components/widgets/WeatherWidget";

// jsdom has no Web Audio API — keep the store import hermetic (musicSlice
// must still update state with the engine faked away).
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

describe("MusicWidget — 44px mobile touch targets", () => {
  beforeEach(() => {
    useStore.setState({
      isPlaying: false,
      currentTrack: { id: "t1", title: "Neon Lights", artist: "Synthwave Dreams" },
    });
  });

  it("transport buttons are 44px (h-11) on mobile, desktop classes preserved", () => {
    render(<MusicWidget />);

    const prev = screen.getByRole("button", { name: "Previous track" });
    const play = screen.getByRole("button", { name: /play/i });
    const next = screen.getByRole("button", { name: "Next track" });

    for (const btn of [prev, next]) {
      expect(btn.className).toContain("h-11");
      // md: desktop class list is byte-identical to the old desktop sizing
      expect(btn.className).toContain("md:h-6");
    }
    expect(play.className).toContain("h-11");
    expect(play.className).toContain("md:h-7");
  });
});

describe("WeatherWidget — retry on failure", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a Retry button after a failed fetch; clicking re-invokes fetch and recovers", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Upstream down" }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          current: { temperature_2m: 21.4, relative_humidity_2m: 55, weather_code: 0 },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<WeatherWidget />);

    // Initial load fails → failure state with a Retry affordance
    expect(await screen.findByText("Weather unavailable")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    });

    await waitFor(() => expect(screen.getByText("21°C")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Weather unavailable")).not.toBeInTheDocument();
  });
});

describe("chatSlice — friendly pre-stream error copy", () => {
  // Same minimal harness as src/test/chat-stream.test.ts.
  function createTestStore(): ChatSlice {
    const store: ChatSlice = {} as ChatSlice;
    const set = (partial: Partial<ChatSlice> | ((s: ChatSlice) => Partial<ChatSlice>)) => {
      const val = typeof partial === "function" ? partial(store) : partial;
      Object.assign(store, val);
    };
    const get = () => store;
    const api = {} as never;
    Object.assign(store, createChatSlice(set, get, api));
    return store;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps the unconfigured-key server error to friendly copy (no key name leaked)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: "ANTHROPIC_API_KEY not configured" }),
      }),
    );

    const store = createTestStore();
    await store.sendMessage("hi");

    const assistant = store.messages.find((m) => m.role === "assistant");
    expect(assistant?.content).toBe("The assistant is not configured yet.");
    expect(JSON.stringify(store.messages)).not.toContain("ANTHROPIC_API_KEY");
    expect(assistant?.streaming).toBe(false);
    expect(store.isLoading).toBe(false);
  });

  it("keeps the generic shape for unknown server errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: "Too many requests" }),
      }),
    );

    const store = createTestStore();
    await store.sendMessage("hi");

    const assistant = store.messages.find((m) => m.role === "assistant");
    expect(assistant?.content).toBe("Error: Too many requests");
  });
});
