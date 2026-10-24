import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// jsdom has no Web Audio API — stub the synth engine so music actions are testable
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
import {
  openApp,
  chatLauncher,
  toggleWidget,
  musicControl,
  setThemeByName,
  type MusicAction,
} from "@/lib/os-actions";
import { getViewportBounds } from "@/lib/boundaries";
import { APP_DEFS, resolveAppId, type AppId } from "@/lib/apps";

/** Desktop vs mobile viewport — the chat launcher reads the 768 rule from boundaries. */
const originalInnerWidth = window.innerWidth;

function setViewportWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
}

describe("os-actions", () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.setState({
      windows: [],
      activeWindowId: null,
      widgets: [],
      theme: "retro",
      chatOpen: false,
      isPlaying: false,
      volume: 0.7,
      currentTrack: { id: "t1", title: "Neon Lights", artist: "Synthwave Dreams" },
      // Browser identity state — the browser singleton is now launchable from
      // this suite, so isolate its per-window records too.
      browserWindows: {},
      pendingSlug: null,
      readmeLru: {},
      metaLru: {},
      sidePanelOpen: false,
    });
  });

  afterEach(() => {
    setViewportWidth(originalInnerWidth);
  });

  describe("openApp", () => {
    it("opens a window from the registry on first call", () => {
      openApp("about");
      const state = useStore.getState();
      expect(state.windows).toHaveLength(1);
      expect(state.windows[0]?.title).toBe("About Me");
      expect(state.windows[0]?.component).toBe("about");
      expect(state.windows[0]?.type).toBe("app");
      expect(state.activeWindowId).toBe(state.windows[0]?.id);
    });

    it("focuses the existing window instead of duplicating", () => {
      openApp("projects");
      const projectsId = useStore.getState().windows[0]?.id;
      openApp("about");

      openApp("projects");
      const state = useStore.getState();
      expect(state.windows).toHaveLength(2);
      expect(state.activeWindowId).toBe(projectsId);
      const projects = state.windows.find((w) => w.id === projectsId)!;
      expect(projects.zIndex).toBe(Math.max(...state.windows.map((w) => w.zIndex)));
    });

    it("opens a SECOND window for projects even when a browser already exists", () => {
      // Identity split (real-web Task C3): `browser` and `projects` are
      // separate app ids with separate windows — the browser singleton's
      // relaunch dedupe never catches a Projects launch.
      openApp("browser");
      openApp("projects");
      openApp("projects");

      const state = useStore.getState();
      expect(state.windows).toHaveLength(2);
      expect(state.windows.filter((w) => w.type === "browser")).toHaveLength(1);
      expect(state.windows.find((w) => w.component === "projects")?.type).toBe("app");
    });

    it("restores a minimized window", () => {
      openApp("terminal");
      const id = useStore.getState().windows[0]?.id ?? "";
      useStore.getState().minimizeWindow(id);
      expect(useStore.getState().windows[0]?.isMinimized).toBe(true);

      openApp("terminal");
      const state = useStore.getState();
      expect(state.windows).toHaveLength(1);
      expect(state.windows[0]?.isMinimized).toBe(false);
      expect(state.activeWindowId).toBe(id);
    });

    it("titles the control-panel window 'Control Panel' while its desktop label stays 'Settings'", () => {
      openApp("control-panel");
      expect(useStore.getState().windows[0]?.title).toBe("Control Panel");
      const def = APP_DEFS.find((a) => a.id === "control-panel");
      expect(def?.desktopLabel).toBe("Settings");
    });

    it("no-ops (instead of throwing) on an unknown app id", () => {
      // Same posture as musicControl: an id outside the launch table is a
      // silent no-op — never a crash, never a window.
      const unknown = "not-an-app" as AppId;
      expect(() => openApp(unknown)).not.toThrow();
      const state = useStore.getState();
      expect(state.windows).toHaveLength(0);
      expect(state.activeWindowId).toBeNull();
    });
  });

  describe("chatLauncher (device-mapped registry launcher)", () => {
    it("opens a registry Dev Chat window on desktop", () => {
      chatLauncher(false);
      const state = useStore.getState();
      expect(state.windows).toHaveLength(1);
      expect(state.windows[0]?.title).toBe("Dev Chat");
      expect(state.windows[0]?.component).toBe("chat");
      expect(state.windows[0]?.type).toBe("app");
      expect(state.activeWindowId).toBe(state.windows[0]?.id);
      // The desktop branch must not open the mobile bottom sheet.
      expect(state.chatOpen).toBe(false);
    });

    it("focuses the existing Dev Chat window instead of duplicating", () => {
      chatLauncher(false);
      const chatId = useStore.getState().windows[0]?.id;
      chatLauncher(false);

      const state = useStore.getState();
      expect(state.windows).toHaveLength(1);
      expect(state.activeWindowId).toBe(chatId);
      const chat = state.windows.find((w) => w.id === chatId)!;
      expect(chat.zIndex).toBe(Math.max(...state.windows.map((w) => w.zIndex)));
    });

    it("restores a minimized Dev Chat window", () => {
      chatLauncher(false);
      const chatId = useStore.getState().windows[0]?.id ?? "";
      useStore.getState().minimizeWindow(chatId);
      expect(useStore.getState().windows[0]?.isMinimized).toBe(true);

      chatLauncher(false);
      const state = useStore.getState();
      expect(state.windows).toHaveLength(1);
      expect(state.windows[0]?.isMinimized).toBe(false);
      expect(state.activeWindowId).toBe(chatId);
    });

    it("toggles the mobile chat sheet and opens no window", () => {
      chatLauncher(true);
      expect(useStore.getState().chatOpen).toBe(true);
      expect(useStore.getState().windows).toHaveLength(0);

      chatLauncher(true);
      expect(useStore.getState().chatOpen).toBe(false);
      expect(useStore.getState().windows).toHaveLength(0);
    });
  });

  describe("openApp('chat') — the registry row is device-aware", () => {
    it("opens the Dev Chat window on a desktop viewport", () => {
      setViewportWidth(1024);
      expect(getViewportBounds(1024).isMobile).toBe(false);

      openApp("chat");
      const state = useStore.getState();
      expect(state.windows).toHaveLength(1);
      expect(state.windows[0]?.component).toBe("chat");
      expect(state.chatOpen).toBe(false);
    });

    it("toggles the mobile chat sheet below the 768 breakpoint", () => {
      setViewportWidth(767);
      expect(getViewportBounds(767).isMobile).toBe(true);

      openApp("chat");
      const state = useStore.getState();
      expect(state.chatOpen).toBe(true);
      expect(state.windows).toHaveLength(0);
    });
  });

  describe("setThemeByName", () => {
    it("switches to a known theme", () => {
      expect(setThemeByName("neon")).toBe(true);
      expect(useStore.getState().theme).toBe("neon");
    });

    it("returns false on an unknown theme without changing state", () => {
      expect(setThemeByName("bogus")).toBe(false);
      expect(useStore.getState().theme).toBe("retro");
    });
  });

  describe("musicControl", () => {
    it("plays and pauses", () => {
      musicControl("play");
      expect(useStore.getState().isPlaying).toBe(true);
      musicControl("play");
      expect(useStore.getState().isPlaying).toBe(true);

      musicControl("pause");
      expect(useStore.getState().isPlaying).toBe(false);
      musicControl("pause");
      expect(useStore.getState().isPlaying).toBe(false);

      musicControl("toggle");
      expect(useStore.getState().isPlaying).toBe(true);
      musicControl("toggle");
      expect(useStore.getState().isPlaying).toBe(false);
    });

    it("advances tracks", () => {
      musicControl("next");
      expect(useStore.getState().currentTrack.title).toBe("Pixel Rain");
      musicControl("prev");
      expect(useStore.getState().currentTrack.title).toBe("Neon Lights");
    });

    it("no-ops (instead of throwing) on an unknown action", () => {
      const unknown: string = "sideways";
      expect(() => musicControl(unknown as MusicAction)).not.toThrow();
      const state = useStore.getState();
      expect(state.isPlaying).toBe(false);
      expect(state.currentTrack.title).toBe("Neon Lights");
    });
  });

  describe("toggleWidget", () => {
    it("adds then removes a widget of the same type", () => {
      expect(toggleWidget("cpu")).toBe("added");
      const added = useStore.getState().widgets;
      expect(added).toHaveLength(1);
      expect(added[0]?.type).toBe("cpu");
      expect(added[0]?.title).toBe("CPU");

      expect(toggleWidget("cpu")).toBe("removed");
      expect(useStore.getState().widgets).toHaveLength(0);
    });

    it("places a new widget inside the right edge of the content zone", () => {
      toggleWidget("weather");
      const widget = useStore.getState().widgets[0];
      expect(widget?.x).toBe(window.innerWidth - 220);
      expect(widget?.y).toBe(46); // topBar (36) + 10 with no widgets on screen
    });
  });
});

describe("resolveAppId", () => {
  it("resolves ids and aliases, null for unknown", () => {
    expect(resolveAppId("projects")).toBe("projects");
    expect(resolveAppId("settings")).toBe("control-panel");
    expect(resolveAppId("cv")).toBe("resume");
    expect(resolveAppId("chat")).toBe("chat");
    expect(resolveAppId("CHAT")).toBe("chat");
    expect(resolveAppId("nope")).toBeNull();
  });
});
