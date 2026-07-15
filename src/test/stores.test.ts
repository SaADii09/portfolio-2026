import { describe, it, expect, beforeEach } from "vitest";
import { createWindowSlice, WindowSlice } from "@/store/windowSlice";
import { createThemeSlice, ThemeSlice } from "@/store/themeSlice";
import { createWidgetSlice, WidgetSlice } from "@/store/widgetSlice";
import { createMusicSlice, MusicSlice } from "@/store/musicSlice";

type Slice = WindowSlice & ThemeSlice & WidgetSlice & MusicSlice;

function createTestStore(): Slice {
  const store: Slice = {} as Slice;
  const set = (partial: Partial<Slice> | ((s: Slice) => Partial<Slice>)) => {
    const val = typeof partial === "function" ? partial(store) : partial;
    Object.assign(store, val);
  };
  const get = () => store;
  Object.assign(
    store,
    createWindowSlice(set, get),
    createThemeSlice(set, get),
    createWidgetSlice(set, get),
    createMusicSlice(set, get),
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
  });

  it("opens a window with default dimensions", () => {
    const id = store.openWindow({ title: "Test", type: "app", component: "AboutApp" });
    expect(store.windows).toHaveLength(1);
    const win = store.windows[0];
    expect(win.id).toBe(id);
    expect(win.title).toBe("Test");
    expect(win.type).toBe("app");
    expect(win.component).toBe("AboutApp");
    expect(win.zIndex).toBe(101);
    expect(win.opacity).toBe(1);
    expect(win.isMinimized).toBe(false);
    expect(win.isMaximized).toBe(false);
    expect(store.activeWindowId).toBe(id);
  });

  it("opens an iframe window with url", () => {
    store.openWindow({ title: "Web", type: "iframe", url: "https://example.com" });
    const win = store.windows[0];
    expect(win.url).toBe("https://example.com");
    expect(win.type).toBe("iframe");
  });

  it("increments z-index on new windows", () => {
    store.openWindow({ title: "A", type: "app", component: "A" });
    store.openWindow({ title: "B", type: "app", component: "B" });
    expect(store.windows[0].zIndex).toBe(101);
    expect(store.windows[1].zIndex).toBe(102);
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
    store.focusWindow(store.windows[0].id);
    expect(store.windows[0].zIndex).toBe(103);
    expect(store.activeWindowId).toBe(store.windows[0].id);
  });

  it("minimizes a window", () => {
    const id = store.openWindow({ title: "X", type: "app", component: "X" });
    store.minimizeWindow(id);
    expect(store.windows[0].isMinimized).toBe(true);
  });

  it("maximizes and restores a window", () => {
    const id = store.openWindow({ title: "X", type: "app", component: "X" });
    store.maximizeWindow(id);
    expect(store.windows[0].isMaximized).toBe(true);
    expect(store.windows[0].isMinimized).toBe(false);
    store.restoreWindow(id);
    expect(store.windows[0].isMaximized).toBe(false);
    expect(store.windows[0].isMinimized).toBe(false);
  });

  it("updates position", () => {
    const id = store.openWindow({ title: "X", type: "app", component: "X" });
    store.updateWindowPosition(id, 200, 300);
    expect(store.windows[0].x).toBe(200);
    expect(store.windows[0].y).toBe(300);
  });

  it("updates size with min constraints", () => {
    const id = store.openWindow({ title: "X", type: "app", component: "X" });
    store.updateWindowSize(id, 300, 250);
    expect(store.windows[0].width).toBe(300);
    expect(store.windows[0].height).toBe(250);
    store.updateWindowSize(id, 10, 10);
    expect(store.windows[0].width).toBe(280);
    expect(store.windows[0].height).toBe(200);
  });

  it("sets opacity", () => {
    const id = store.openWindow({ title: "X", type: "app", component: "X" });
    store.setWindowOpacity(id, 0.5);
    expect(store.windows[0].opacity).toBe(0.5);
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
    expect(w.type).toBe("cpu");
    expect(w.title).toBe("CPU");
    expect(w.x).toBe(100);
    expect(w.y).toBe(100);
    expect(w.isPinned).toBe(false);
    expect(w.isCollapsed).toBe(false);
  });

  it("removes a widget", () => {
    store.addWidget("cpu", "CPU", 0, 0);
    const id = store.widgets[0].id;
    store.removeWidget(id);
    expect(store.widgets).toHaveLength(0);
  });

  it("updates widget position", () => {
    store.addWidget("weather", "Weather", 0, 0);
    const id = store.widgets[0].id;
    store.updateWidgetPosition(id, 50, 60);
    expect(store.widgets[0].x).toBe(50);
    expect(store.widgets[0].y).toBe(60);
  });

  it("toggles collapse", () => {
    store.addWidget("music", "Music", 0, 0);
    const id = store.widgets[0].id;
    expect(store.widgets[0].isCollapsed).toBe(false);
    store.toggleWidgetCollapse(id);
    expect(store.widgets[0].isCollapsed).toBe(true);
    store.toggleWidgetCollapse(id);
    expect(store.widgets[0].isCollapsed).toBe(false);
  });

  it("toggles pin", () => {
    store.addWidget("notes", "Notes", 0, 0);
    const id = store.widgets[0].id;
    expect(store.widgets[0].isPinned).toBe(false);
    store.toggleWidgetPin(id);
    expect(store.widgets[0].isPinned).toBe(true);
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
