import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useStore, persistPartialize } from "@/store";
import { createBrowserSlice, type BrowserSlice } from "@/store/browserSlice";
import { openBrowser } from "@/lib/os-actions";

/**
 * Browser window plumbing (spec §7): the `type: "browser"` window opens at its
 * locked 960×660 / (0.5, 0.1) geometry slot, `openBrowser` enforces the
 * singleton (find-or-open, focus + restore), the slug is wired through the
 * browserSlice per the launcher protocol, and none of the browser slice state
 * reaches the persisted store.
 */

/**
 * The browser slice's STATE keys (its actions excluded) — derived from the
 * slice itself so the persist non-leak pin below can never drift: a browser
 * key added to the slice MUST be added to the pinned list, or the pin fails.
 */
const BROWSER_STATE_KEYS: string[] = Object.entries(
  createBrowserSlice(
    () => undefined,
    () => ({}) as BrowserSlice,
    {} as never,
  ),
)
  .filter(([, value]) => typeof value !== "function")
  .map(([key]) => key)
  .sort();

const BROWSER_KEYS = [
  "browserWindows",
  "metaLru",
  "pendingSlug",
  "readmeLru",
  "sidePanelOpen",
  "visitCounts",
  "visitRecency",
];

describe("browser window plumbing @ 1440×900", () => {
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;

  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
    localStorage.clear();
    useStore.setState({
      windows: [],
      activeWindowId: null,
      lastGeometry: {},
      browserWindows: {},
      pendingSlug: null,
      readmeLru: {},
      metaLru: {},
      sidePanelOpen: false,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: originalInnerWidth });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: originalInnerHeight,
    });
  });

  function findBrowserWindow() {
    return useStore.getState().windows.find((w) => w.type === "browser");
  }

  describe("geometry slot", () => {
    it("openWindow resolves the 960×660 table geometry for component 'browser'", () => {
      const id = useStore.getState().openWindow({
        title: "Browser",
        type: "browser",
        component: "browser",
      });
      const win = useStore.getState().windows.find((w) => w.id === id)!;
      expect(win.component).toBe("browser");
      expect(win.type).toBe("browser");
      expect([win.width, win.height]).toEqual([960, 660]);
      // Painted frame: raw slot 0.5 × (1440 − 960) = 240; y raws at 0.1 × 164
      // = 16.4, which sits above the top bar, so the clamp parks it at 36
      // (store y = 0 in the content-zone frame).
      expect(win.x).toBe(240);
      expect(win.y).toBe(0);
    });
  });

  describe("openBrowser — singleton launcher", () => {
    it("first call opens one type:'browser' window and sets pendingSlug", () => {
      openBrowser("devos");
      const state = useStore.getState();
      expect(state.windows).toHaveLength(1);
      const win = state.windows[0]!;
      expect(win.type).toBe("browser");
      expect(win.component).toBe("browser");
      expect(win.title).toBe("Browser");
      expect(state.pendingSlug).toBe("devos");
      // The browser record is seeded (home tab) so the app mounts onto state.
      const record = state.browserWindows[win.id]!;
      expect(record.tabs).toHaveLength(1);
      expect(record.tabs[0]!.kind).toBe("home");
    });

    it("second call without a slug adds no window and focuses the existing one", () => {
      openBrowser("devos");
      const first = findBrowserWindow()!;
      const beforeZ = first.zIndex;
      openBrowser();
      const state = useStore.getState();
      expect(state.windows).toHaveLength(1);
      expect(state.activeWindowId).toBe(first.id);
      // Still focused on top of the z-index pile, slug payload untouched.
      expect(state.windows[0]!.zIndex).toBeGreaterThan(beforeZ);
      expect(state.pendingSlug).toBe("devos");
    });

    it("second call with a slug routes it through the slice without a new window", () => {
      openBrowser("devos");
      const first = findBrowserWindow()!;
      openBrowser("projects");
      const state = useStore.getState();
      expect(state.windows).toHaveLength(1);
      expect(state.activeWindowId).toBe(first.id);
      const record = state.browserWindows[first.id]!;
      const projectTab = record.tabs.find((tab) => tab.kind === "project");
      expect(projectTab?.slug).toBe("projects");
      expect(record.activeTabId).toBe(projectTab!.id);
    });

    it("relaunch on a cold record seeds before opening the slug tab", () => {
      openBrowser("devos");
      const first = findBrowserWindow()!;
      // Simulate a reload: the window instance persists (persisted `windows`),
      // but the browser slice state is not persisted — the record is gone.
      useStore.setState({ browserWindows: {} });
      openBrowser("projects");
      const state = useStore.getState();
      expect(state.windows).toHaveLength(1);
      expect(state.activeWindowId).toBe(first.id);
      const record = state.browserWindows[first.id]!;
      // Cold record re-seeded with its home tab, then the slug tab appended.
      expect(record.tabs).toHaveLength(2);
      expect(record.tabs[0]!.kind).toBe("home");
      const projectTab = record.tabs.find((tab) => tab.kind === "project");
      expect(projectTab?.slug).toBe("projects");
      expect(record.activeTabId).toBe(projectTab!.id);
    });

    it("restores a minimized browser window and focuses it", () => {
      openBrowser("devos");
      const id = findBrowserWindow()!.id;
      useStore.getState().minimizeWindow(id);
      openBrowser();
      const win = findBrowserWindow()!;
      expect(useStore.getState().windows).toHaveLength(1);
      expect(win.isMinimized).toBe(false);
      expect(useStore.getState().activeWindowId).toBe(id);
    });

    it("a slug on a fresh window does not mutate the LRU caches", () => {
      openBrowser("devos");
      const state = useStore.getState();
      expect(state.readmeLru).toEqual({});
      expect(state.metaLru).toEqual({});
    });
  });

  /**
   * Closing the browser window (F2 + F4): the window's slice record is
   * unreachable garbage once the window is gone (a reopened browser gets a
   * NEW id), and the slice-global `pendingSlug` must not survive into the
   * next browser window.
   */
  describe("closing the browser window", () => {
    it("drops the browser record and the pending slug", () => {
      openBrowser("devos");
      const id = findBrowserWindow()!.id;
      expect(useStore.getState().browserWindows[id]).toBeDefined();

      useStore.getState().closeWindow(id);

      expect(useStore.getState().browserWindows[id]).toBeUndefined();
      expect(useStore.getState().pendingSlug).toBeNull();
    });

    it("leaves the browser record alone when an APP window closes", () => {
      openBrowser("devos");
      const browserId = findBrowserWindow()!.id;
      const appId = useStore.getState().openWindow({
        title: "About",
        type: "app",
        component: "AboutApp",
      });

      useStore.getState().closeWindow(appId);

      const state = useStore.getState();
      expect(state.browserWindows[browserId]).toBeDefined();
      // The browser's launch payload is none of the app window's business.
      expect(state.pendingSlug).toBe("devos");
    });

    it("drops the record so a reopen starts from a fresh home tab", () => {
      openBrowser("devos");
      const first = findBrowserWindow()!;
      useStore.getState().closeWindow(first.id);

      openBrowser();

      const second = findBrowserWindow()!;
      expect(second.id).not.toBe(first.id);
      const record = useStore.getState().browserWindows[second.id]!;
      expect(record.tabs).toHaveLength(1);
      expect(record.tabs[0]!.kind).toBe("home");
    });

    /**
     * The close-while-launching race (plan Review Focus 1): the browser
     * window closes between `openBrowser(slug)` and the app's mount, so the
     * launch payload is never consumed. The NEXT browser window must not
     * inherit it — no phantom project tab, no stale slug.
     */
    it("a close between launch and mount leaves no phantom project tab", () => {
      openBrowser("devos");
      const first = findBrowserWindow()!;
      // The window closes BEFORE BrowserApp ever mounts.
      useStore.getState().closeWindow(first.id);
      expect(useStore.getState().pendingSlug).toBeNull();

      // The next launch carries no slug.
      openBrowser();

      const second = findBrowserWindow()!;
      const record = useStore.getState().browserWindows[second.id]!;
      expect(record.tabs).toHaveLength(1);
      expect(record.tabs[0]!.kind).toBe("home");
      expect(record.tabs.some((tab) => tab.kind === "project")).toBe(false);
      expect(useStore.getState().pendingSlug).toBeNull();
    });
  });

  describe("persist non-leak", () => {
    it("serialized persist state contains no browser slice keys or README HTML", () => {
      openBrowser("devos");
      const partial = persistPartialize(useStore.getState());
      const keys = Object.keys(partial);
      // The pinned list is the slice's FULL state surface — a browser key
      // added to the slice without a matching pin entry fails here.
      expect(BROWSER_KEYS).toEqual(BROWSER_STATE_KEYS);
      for (const key of BROWSER_KEYS) {
        expect(keys).not.toContain(key);
      }
      // The SERIALIZED substance carries none of the browser keys — a
      // nested/renamed field would still leak the session (T7).
      const serialized = JSON.stringify(partial);
      for (const key of BROWSER_KEYS) {
        expect(serialized).not.toContain(key);
      }
    });
  });
});
