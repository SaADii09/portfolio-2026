import { describe, it, expect, beforeEach, vi } from "vitest";
import { createWindowSlice, WindowSlice } from "@/store/windowSlice";
import { createThemeSlice, ThemeSlice } from "@/store/themeSlice";
import { createWidgetSlice, WidgetSlice } from "@/store/widgetSlice";
import { createMusicSlice, MusicSlice } from "@/store/musicSlice";
import { createUiSlice, UiSlice } from "@/store/uiSlice";
import { useStore, persistPartialize, persistMigrator, PersistedAppState } from "@/store";

// jsdom has no Web Audio API — stub the synth engine so music slice logic is testable
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

type Slice = WindowSlice & ThemeSlice & WidgetSlice & MusicSlice & UiSlice;

function createTestStore(): Slice {
  const store: Slice = {} as Slice;
  const set = (partial: Partial<Slice> | ((s: Slice) => Partial<Slice>)) => {
    const val = typeof partial === "function" ? partial(store) : partial;
    Object.assign(store, val);
  };
  const get = () => store;
  // The slices only use `set`/`get`; the third `api` argument is never referenced at
  // runtime, so a stub keeps the StateCreator signature satisfied without a cast error.
  const api = {} as never;
  Object.assign(
    store,
    createWindowSlice(set, get, api),
    createThemeSlice(set, get, api),
    createWidgetSlice(set, get, api),
    createMusicSlice(set, get, api),
    createUiSlice(set, get, api),
  );
  return store;
}

describe("windowSlice", () => {
  let store: Slice;

  beforeEach(() => {
    store = createTestStore();
  });

  it("starts empty", () => {
    expect(store.windows).toEqual([]);
    expect(store.activeWindowId).toBeNull();
    expect(store.lastGeometry).toEqual({});
  });

  it("opens a window with default dimensions", () => {
    const id = store.openWindow({ title: "Test", type: "app", component: "AboutApp" });
    expect(store.windows).toHaveLength(1);
    const win = store.windows[0];
    expect(win?.id).toBe(id);
    expect(win?.title).toBe("Test");
    expect(win?.type).toBe("app");
    expect(win?.component).toBe("AboutApp");
    expect(win?.zIndex).toBe(101);
    expect(win?.opacity).toBe(1);
    expect(win?.isMinimized).toBe(false);
    expect(win?.isMaximized).toBe(false);
    expect(store.activeWindowId).toBe(id);
  });

  it("opens an iframe window with url", () => {
    store.openWindow({ title: "Web", type: "iframe", url: "https://example.com" });
    const win = store.windows[0];
    expect(win?.url).toBe("https://example.com");
    expect(win?.type).toBe("iframe");
  });

  it("increments z-index on new windows", () => {
    store.openWindow({ title: "A", type: "app", component: "A" });
    store.openWindow({ title: "B", type: "app", component: "B" });
    expect(store.windows[0]?.zIndex).toBe(101);
    expect(store.windows[1]?.zIndex).toBe(102);
  });

  it("closes a window", () => {
    const id = store.openWindow({ title: "X", type: "app", component: "X" });
    expect(store.windows).toHaveLength(1);
    store.closeWindow(id);
    expect(store.windows).toHaveLength(0);
  });

  it("clears activeWindowId when closing active window", () => {
    const id = store.openWindow({ title: "A", type: "app", component: "A" });
    expect(store.activeWindowId).toBe(id);
    store.closeWindow(id);
    expect(store.activeWindowId).toBeNull();
  });

  it("focuses a window", () => {
    store.openWindow({ title: "A", type: "app", component: "A" });
    store.openWindow({ title: "B", type: "app", component: "B" });
    store.focusWindow(store.windows[0]?.id ?? "");
    expect(store.windows[0]?.zIndex).toBe(103);
    expect(store.activeWindowId).toBe(store.windows[0]?.id);
  });

  it("minimizes a window", () => {
    const id = store.openWindow({ title: "X", type: "app", component: "X" });
    store.minimizeWindow(id);
    expect(store.windows[0]?.isMinimized).toBe(true);
  });

  it("maximizes and restores a window", () => {
    const id = store.openWindow({ title: "X", type: "app", component: "X" });
    store.maximizeWindow(id);
    expect(store.windows[0]?.isMaximized).toBe(true);
    expect(store.windows[0]?.isMinimized).toBe(false);
    store.restoreWindow(id);
    expect(store.windows[0]?.isMaximized).toBe(false);
    expect(store.windows[0]?.isMinimized).toBe(false);
  });

  it("updates position", () => {
    const id = store.openWindow({ title: "X", type: "app", component: "X" });
    store.updateWindowPosition(id, 200, 300);
    expect(store.windows[0]?.x).toBe(200);
    expect(store.windows[0]?.y).toBe(300);
  });

  it("updates size with min constraints", () => {
    const id = store.openWindow({ title: "X", type: "app", component: "X" });
    store.updateWindowSize(id, 300, 250);
    expect(store.windows[0]?.width).toBe(300);
    expect(store.windows[0]?.height).toBe(250);
    store.updateWindowSize(id, 10, 10);
    expect(store.windows[0]?.width).toBe(280);
    expect(store.windows[0]?.height).toBe(200);
  });

  it("sets opacity", () => {
    const id = store.openWindow({ title: "X", type: "app", component: "X" });
    store.setWindowOpacity(id, 0.5);
    expect(store.windows[0]?.opacity).toBe(0.5);
  });

  it("saves a closed window's committed rect under lastGeometry[component]", () => {
    const id = store.openWindow({ title: "X", type: "app", component: "X" });
    store.updateWindowPosition(id, 120, 90);
    store.updateWindowSize(id, 420, 360);
    store.closeWindow(id);
    expect(store.lastGeometry["X"]).toEqual({ x: 120, y: 90, width: 420, height: 360 });
  });

  it("reopens a component at its remembered rect instead of the defaults table", () => {
    const id = store.openWindow({ title: "About", type: "app", component: "about" });
    store.updateWindowPosition(id, 140, 80);
    store.updateWindowSize(id, 500, 300);
    store.closeWindow(id);
    store.openWindow({ title: "About", type: "app", component: "about" });
    const win = store.windows[0];
    // The defaults table resolves "about" to 560×620 at its slot — the
    // remembered rect (500×300 @ 140,80) must win instead.
    expect(win?.x).toBe(140);
    expect(win?.y).toBe(80);
    expect(win?.width).toBe(500);
    expect(win?.height).toBe(300);
  });

  it("saves webview geometry under webview:<url> independently per url", () => {
    const a = store.openWindow({ title: "A", type: "iframe", url: "https://a.test" });
    const b = store.openWindow({ title: "B", type: "iframe", url: "https://b.test" });
    store.updateWindowPosition(a, 40, 50);
    store.updateWindowSize(a, 300, 280);
    const openedB = store.windows[1];
    store.closeWindow(a);
    store.closeWindow(b);

    const savedA = store.lastGeometry["webview:https://a.test"];
    const savedB = store.lastGeometry["webview:https://b.test"];
    expect(savedA).toEqual({ x: 40, y: 50, width: 300, height: 280 });
    // B's rect was never touched — it saves its own open-time geometry, so the
    // two urls never share or clobber each other's memory slot.
    expect(savedB).toEqual({
      x: openedB?.x ?? -1,
      y: openedB?.y ?? -1,
      width: openedB?.width ?? -1,
      height: openedB?.height ?? -1,
    });
    expect(savedA).not.toEqual(savedB);
  });

  it("does not save geometry on minimize or restore — only on close", () => {
    const id = store.openWindow({ title: "X", type: "app", component: "X" });
    store.updateWindowPosition(id, 120, 90);
    store.minimizeWindow(id);
    store.restoreWindow(id);
    expect(store.lastGeometry).toEqual({});
    store.updateWindowSize(id, 460, 380);
    store.closeWindow(id);
    expect(Object.keys(store.lastGeometry)).toEqual(["X"]);
    expect(store.lastGeometry["X"]?.width).toBe(460);
    expect(store.lastGeometry["X"]?.height).toBe(380);
  });

  it("clamps remembered geometry that exceeds the viewport at open time", () => {
    const id = store.openWindow({ title: "X", type: "app", component: "X" });
    store.updateWindowPosition(id, 9000, 9000);
    store.updateWindowSize(id, 5000, 5000);
    store.closeWindow(id);
    store.openWindow({ title: "X", type: "app", component: "X" });
    const win = store.windows[0];
    const vw = window.innerWidth; // jsdom default 1024
    const vh = window.innerHeight; // jsdom default 768
    // clampWindowSize caps at the safe-zone size; clampWindowPosition pins
    // the oversized top-left back into view.
    expect(win?.width).toBe(vw);
    expect(win?.height).toBe(vh - 36 - 76); // desktop top/bottom chrome
    expect(win?.x).toBe(0);
    expect(win?.y).toBe(36);
  });
});

describe("themeSlice", () => {
  let store: Slice;

  beforeEach(() => {
    store = createTestStore();
  });

  it("defaults to retro", () => {
    expect(store.theme).toBe("retro");
  });

  it("switches theme", () => {
    store.setTheme("neon");
    expect(store.theme).toBe("neon");
    store.setTheme("editorial");
    expect(store.theme).toBe("editorial");
  });

  it("updates custom tokens", () => {
    store.updateCustomToken("--bg", "#000");
    expect(store.customTokens).toEqual({ "--bg": "#000" });
    store.updateCustomToken("--text", "#fff");
    expect(store.customTokens).toEqual({ "--bg": "#000", "--text": "#fff" });
  });

  it("resets custom tokens", () => {
    store.updateCustomToken("--bg", "#000");
    store.resetCustomTokens();
    expect(store.customTokens).toEqual({});
  });
});

describe("widgetSlice", () => {
  let store: Slice;

  beforeEach(() => {
    store = createTestStore();
  });

  it("starts empty", () => {
    expect(store.widgets).toEqual([]);
  });

  it("adds a widget", () => {
    store.addWidget("cpu", "CPU", 100, 100);
    expect(store.widgets).toHaveLength(1);
    const w = store.widgets[0];
    expect(w?.type).toBe("cpu");
    expect(w?.title).toBe("CPU");
    expect(w?.x).toBe(100);
    expect(w?.y).toBe(100);
    expect(w?.isPinned).toBe(false);
    expect(w?.isCollapsed).toBe(false);
  });

  it("removes a widget", () => {
    store.addWidget("cpu", "CPU", 0, 0);
    const id = store.widgets[0]?.id ?? "";
    store.removeWidget(id);
    expect(store.widgets).toHaveLength(0);
  });

  it("updates widget position", () => {
    store.addWidget("weather", "Weather", 0, 0);
    const id = store.widgets[0]?.id ?? "";
    store.updateWidgetPosition(id, 50, 60);
    expect(store.widgets[0]?.x).toBe(50);
    expect(store.widgets[0]?.y).toBe(60);
  });

  it("toggles collapse", () => {
    store.addWidget("music", "Music", 0, 0);
    const id = store.widgets[0]?.id ?? "";
    expect(store.widgets[0]?.isCollapsed).toBe(false);
    store.toggleWidgetCollapse(id);
    expect(store.widgets[0]?.isCollapsed).toBe(true);
    store.toggleWidgetCollapse(id);
    expect(store.widgets[0]?.isCollapsed).toBe(false);
  });

  it("toggles pin", () => {
    store.addWidget("notes", "Notes", 0, 0);
    const id = store.widgets[0]?.id ?? "";
    expect(store.widgets[0]?.isPinned).toBe(false);
    store.toggleWidgetPin(id);
    expect(store.widgets[0]?.isPinned).toBe(true);
  });
});

describe("musicSlice", () => {
  let store: Slice;

  beforeEach(() => {
    store = createTestStore();
  });

  it("has default state", () => {
    expect(store.isPlaying).toBe(false);
    expect(store.currentTrack.title).toBe("Neon Lights");
    expect(store.volume).toBe(0.7);
    expect(store.queue).toHaveLength(4);
  });

  it("toggles play", () => {
    store.togglePlay();
    expect(store.isPlaying).toBe(true);
    store.togglePlay();
    expect(store.isPlaying).toBe(false);
  });

  it("goes to next track", () => {
    store.nextTrack();
    expect(store.currentTrack.title).toBe("Pixel Rain");
    expect(store.isPlaying).toBe(true);
  });

  it("wraps around on next track", () => {
    store.nextTrack();
    store.nextTrack();
    store.nextTrack();
    store.nextTrack();
    expect(store.currentTrack.title).toBe("Neon Lights");
  });

  it("goes to previous track", () => {
    store.prevTrack();
    expect(store.currentTrack.title).toBe("Terminal Sunrise");
  });

  it("wraps around on prev track", () => {
    store.prevTrack();
    store.prevTrack();
    store.prevTrack();
    store.prevTrack();
    expect(store.currentTrack.title).toBe("Neon Lights");
  });

  it("clamps volume between 0 and 1", () => {
    store.setVolume(1.5);
    expect(store.volume).toBe(1);
    store.setVolume(-0.5);
    expect(store.volume).toBe(0);
    store.setVolume(0.5);
    expect(store.volume).toBe(0.5);
  });
});

describe("persist partialize", () => {
  it("writes music state under the music slice's own top-level keys", () => {
    const state = useStore.getState();
    const persisted = persistPartialize(state);

    expect(Object.keys(persisted).sort()).toEqual([
      "currentTrack",
      "customTokens",
      "glassBlur",
      "glassOpacity",
      "glassSaturate",
      "lastGeometry",
      "theme",
      "volume",
      "widgets",
      "windows",
    ]);
    expect(persisted.volume).toBe(state.volume);
    expect(persisted.currentTrack).toBe(state.currentTrack);
    // Regression: a synthetic `music` key rehydrated as a stray field, so volume
    // and current track silently reset on every reload.
    expect(persisted).not.toHaveProperty("music");
  });

  it("round-trips volume and current track through localStorage", () => {
    localStorage.clear();
    const track = { id: "t3", title: "Midnight Code", artist: "DevOS Beats" };

    useStore.setState({ volume: 0.33, currentTrack: track });

    const raw = JSON.parse(localStorage.getItem("devos-store") ?? "{}");
    expect(raw.state.volume).toBe(0.33);
    expect(raw.state.currentTrack).toEqual(track);
    expect(raw.state.music).toBeUndefined();
  });

  it("round-trips lastGeometry through localStorage", () => {
    localStorage.clear();
    const geometry = {
      terminal: { x: 11, y: 22, width: 640, height: 420 },
      "webview:https://example.com": { x: 50, y: 60, width: 800, height: 560 },
    };

    useStore.setState({ lastGeometry: geometry });

    const raw = JSON.parse(localStorage.getItem("devos-store") ?? "{}");
    expect(raw.state.lastGeometry).toEqual(geometry);
  });
});

describe("persist migrator", () => {
  const PERSISTED_KEYS = [
    "currentTrack",
    "customTokens",
    "glassBlur",
    "glassOpacity",
    "glassSaturate",
    "lastGeometry",
    "theme",
    "volume",
    "widgets",
    "windows",
  ];

  it("migrates a version-less state: persisted keys survive, missing keys get defaults, junk keys drop", () => {
    const legacy = {
      theme: "neon",
      customTokens: { "--bg": "#000000" },
      windows: [{ id: "w1" }],
      widgets: [{ id: "wid1" }],
      // Legacy pre-Phase-12 nested music shape + other stray fields
      music: { volume: 0.2 },
      isPlaying: true,
      chatMessages: [{ role: "user", content: "hi" }],
    };

    const migrated = persistMigrator(legacy, 0);

    expect(Object.keys(migrated).sort()).toEqual(PERSISTED_KEYS);
    // Persisted values win over defaults (defaults merged FIRST)
    expect(migrated.theme).toBe("neon");
    expect(migrated.customTokens).toEqual({ "--bg": "#000000" });
    expect(migrated.windows).toEqual([{ id: "w1" }]);
    expect(migrated.widgets).toEqual([{ id: "wid1" }]);
    // Missing keys land on real slice defaults
    expect(migrated.volume).toBe(0.7);
    expect(migrated.currentTrack.title).toBe("Neon Lights");
    expect(migrated.glassBlur).toBe(0);
    expect(migrated.glassSaturate).toBe(100);
    expect(migrated.glassOpacity).toBe(70);
    // lastGeometry is additive (Task 4): older persisted states can lack it —
    // the migrator settles it on the slice default without a version bump.
    expect(migrated.lastGeometry).toEqual({});
    // Junk / obsolete keys never rehydrate
    expect(migrated).not.toHaveProperty("music");
    expect(migrated).not.toHaveProperty("isPlaying");
    expect(migrated).not.toHaveProperty("chatMessages");
  });

  it("migrates an already-current version-1 state as an identity merge", () => {
    const state: PersistedAppState = {
      theme: "editorial",
      customTokens: { "--bg": "#faf8f6" },
      glassBlur: 12,
      glassSaturate: 140,
      glassOpacity: 65,
      lastGeometry: { terminal: { x: 11, y: 22, width: 640, height: 420 } },
      windows: [],
      widgets: [],
      volume: 0.4,
      currentTrack: { id: "t3", title: "Midnight Code", artist: "DevOS Beats" },
    };

    expect(persistMigrator(state, 1)).toEqual(state);
  });

  it("does not crash on a junk customTokens entry and keeps the rest of the merge", () => {
    const legacy = {
      customTokens: { "--bg": "#000000", junkEntry: 5 },
      theme: "retro",
    };

    const migrated = persistMigrator(legacy, 0);

    expect(migrated.customTokens).toEqual({ "--bg": "#000000", junkEntry: 5 });
    expect(migrated.theme).toBe("retro");
    expect(migrated.windows).toEqual([]);
    expect(migrated.volume).toBe(0.7);
  });

  it("returns pure defaults when nothing usable was persisted", () => {
    const migrated = persistMigrator(null, 0);

    expect(migrated.theme).toBe("retro");
    expect(migrated.customTokens).toEqual({});
    expect(migrated.glassBlur).toBe(0);
    expect(migrated.windows).toEqual([]);
    expect(migrated.widgets).toEqual([]);
    expect(migrated.lastGeometry).toEqual({});
    expect(migrated.volume).toBe(0.7);
    expect(migrated.currentTrack.title).toBe("Neon Lights");
  });
});

describe("uiSlice", () => {
  let store: Slice;

  beforeEach(() => {
    store = createTestStore();
  });

  it("starts with the palette closed", () => {
    expect(store.isPaletteOpen).toBe(false);
  });

  it("opens and closes the palette", () => {
    store.openPalette();
    expect(store.isPaletteOpen).toBe(true);
    store.closePalette();
    expect(store.isPaletteOpen).toBe(false);
  });

  it("toggles the palette", () => {
    store.togglePalette();
    expect(store.isPaletteOpen).toBe(true);
    store.togglePalette();
    expect(store.isPaletteOpen).toBe(false);
  });
});
