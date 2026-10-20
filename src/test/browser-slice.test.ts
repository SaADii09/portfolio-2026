import { describe, it, expect, beforeEach } from "vitest";
import { BrowserSlice, createBrowserSlice, BrowserWindowState } from "@/store/browserSlice";
import { computeWarmSet } from "@/lib/warm-set";
import { ProjectMeta } from "@/app/api/project-meta/route";

type Slice = BrowserSlice;

function createTestStore(): Slice {
  const store: Slice = {} as Slice;
  const set = (partial: Partial<Slice> | ((s: Slice) => Partial<Slice>)) => {
    const val = typeof partial === "function" ? partial(store) : partial;
    Object.assign(store, val);
  };
  const get = () => store;
  // Same reasoning as stores.test.ts: the slice only uses `set`/`get`.
  const api = {} as never;
  Object.assign(store, createBrowserSlice(set, get, api));
  return store;
}

function makeMeta(slug: string, overrides: Partial<ProjectMeta> = {}): ProjectMeta {
  return {
    slug,
    readmeHtml: `<p>${slug}</p>`,
    degraded: false,
    timeline: [{ label: "v1.0", period: "2024" }],
    language: "TypeScript",
    stars: 10,
    homepage: null,
    createdAt: "2024-01-01T00:00:00Z",
    pushedAt: "2024-06-01T00:00:00Z",
    ...overrides,
  };
}

/** Window state lookup that throws if the window id was never seeded. */
function win(store: Slice, id: string): BrowserWindowState {
  const state = store.browserWindows[id];
  if (!state) throw new Error(`no browser state for window ${id}`);
  return state;
}

describe("browserSlice", () => {
  let store: Slice;

  beforeEach(() => {
    store = createTestStore();
  });

  it("starts empty", () => {
    expect(store.browserWindows).toEqual({});
    expect(store.sidePanelOpen).toBe(false);
    expect(store.pendingSlug).toBeNull();
    expect(store.readmeLru).toEqual({});
    expect(store.metaLru).toEqual({});
  });

  describe("openBrowserWindow", () => {
    it("seeds a home tab with recency front = home id", () => {
      store.openBrowserWindow("w1");
      const state = win(store, "w1");
      expect(state.tabs).toHaveLength(1);
      const home = state.tabs[0]!;
      expect(home.kind).toBe("home");
      expect(home.slug).toBeUndefined();
      expect(home.localHistory).toEqual([]);
      expect(store.browserWindows!["w1"]!.activeTabId).toBe(home.id);
      expect(state.recency).toEqual([home.id]);
    });

    it("is idempotent for a window that already has tabs", () => {
      store.openBrowserWindow("w1");
      const slugId = store.openWebTab("w1", "https://example.com", "Example");
      store.openBrowserWindow("w1");
      expect(win(store, "w1").tabs).toHaveLength(2);
      expect(win(store, "w1").activeTabId).toBe(slugId);
    });

    it("keeps per-window states independent", () => {
      store.openBrowserWindow("w1");
      store.openBrowserWindow("w2");
      expect(win(store, "w1").tabs).toHaveLength(1);
      expect(win(store, "w2").tabs).toHaveLength(1);
      expect(win(store, "w1").tabs[0]!.id).not.toBe(win(store, "w2").tabs[0]!.id);
    });
  });

  describe("openProjectTab", () => {
    it("adds a project tab, activates it, and prepends to recency", () => {
      store.openBrowserWindow("w1");
      const homeId = win(store, "w1").tabs[0]!.id;
      const id = store.openProjectTab("w1", "devos");
      const state = win(store, "w1");
      const tab = state.tabs.find((t) => t.id === id)!;
      expect(tab.kind).toBe("project");
      expect(tab.slug).toBe("devos");
      expect(state.activeTabId).toBe(id);
      expect(state.recency).toEqual([id, homeId]);
    });

    it("dedupes by slug — activates the existing tab, no new tab", () => {
      store.openBrowserWindow("w1");
      const first = store.openProjectTab("w1", "devos");
      const homeId = win(store, "w1").tabs[0]!.id;
      // home is currently most recent; re-open same slug
      const second = store.openProjectTab("w1", "devos");
      const state = win(store, "w1");
      expect(second).toBe(first);
      expect(state.tabs).toHaveLength(2); // home + one project tab
      expect(state.activeTabId).toBe(first);
      expect(state.recency).toEqual([first, homeId]);
    });
  });

  describe("openWebTab", () => {
    it("adds a web tab with url + seeded history", () => {
      store.openBrowserWindow("w1");
      const id = store.openWebTab("w1", "https://example.com", "Example");
      const tab = win(store, "w1").tabs.find((t) => t.id === id)!;
      expect(tab.kind).toBe("web");
      expect(tab.url).toBe("https://example.com");
      expect(tab.title).toBe("Example");
      expect(tab.localHistory).toEqual(["https://example.com"]);
      expect(tab.scrollTop).toBe(0);
    });

    it("dedupes by url — activates the existing tab, no new tab", () => {
      store.openBrowserWindow("w1");
      const first = store.openWebTab("w1", "https://example.com", "Example");
      const second = store.openWebTab("w1", "https://example.com", "Example again");
      const state = win(store, "w1");
      expect(second).toBe(first);
      expect(state.tabs.filter((t) => t.kind === "web")).toHaveLength(1);
      expect(state.activeTabId).toBe(first);
      // original title preserved — no mutation on dedupe hit
      expect(state.tabs.find((t) => t.id === first)!.title).toBe("Example");
    });
  });

  describe("openHomeTab", () => {
    it("appends a home tab, activates it, and prepends to recency", () => {
      store.openBrowserWindow("w1");
      const webId = store.openWebTab("w1", "https://example.com", "Example");
      const id = store.openHomeTab("w1");
      const state = win(store, "w1");
      const tab = state.tabs.find((t) => t.id === id)!;
      expect(tab.kind).toBe("home");
      expect(tab.localHistory).toEqual([]);
      expect(state.activeTabId).toBe(id);
      expect(state.recency).toEqual([id, webId]);
    });

    it("dedupes — activates the existing home tab instead of duplicating", () => {
      store.openBrowserWindow("w1");
      const seeded = win(store, "w1").tabs[0]!.id;
      const opened = store.openHomeTab("w1");
      const state = win(store, "w1");
      expect(opened).toBe(seeded);
      expect(state.tabs.filter((t) => t.kind === "home")).toHaveLength(1);
      expect(state.activeTabId).toBe(seeded);
    });
  });

  describe("closeTab", () => {
    it("closing the active tab activates the most recent remaining tab", () => {
      store.openBrowserWindow("w1");
      const homeId = win(store, "w1").tabs[0]!.id;
      const p1 = store.openProjectTab("w1", "a");
      const p2 = store.openProjectTab("w1", "b");
      store.closeTab("w1", p2);
      const state = win(store, "w1");
      expect(state.activeTabId).toBe(p1);
      expect(state.recency).toEqual([p1, homeId]);
      expect(state.tabs.find((t) => t.id === p2)).toBeUndefined();
    });

    it("closing down to empty leaves null active state with no tabs", () => {
      store.openBrowserWindow("w1");
      const homeId = win(store, "w1").tabs[0]!.id;
      const p1 = store.openProjectTab("w1", "a");
      store.closeTab("w1", p1);
      store.closeTab("w1", homeId);
      const state = win(store, "w1");
      expect(state.tabs).toEqual([]);
      expect(state.activeTabId).toBeNull();
      expect(state.recency).toEqual([]);
    });

    it("closing a non-active tab keeps the active tab active", () => {
      store.openBrowserWindow("w1");
      const p1 = store.openProjectTab("w1", "a");
      const p2 = store.openProjectTab("w1", "b");
      store.closeTab("w1", p1);
      expect(win(store, "w1").activeTabId).toBe(p2);
    });
  });

  describe("activateTab + warm-set recency (F1)", () => {
    it("moves the activated tab to recency front, no duplicates", () => {
      store.openBrowserWindow("w1");
      const homeId = win(store, "w1").tabs[0]!.id;
      const p1 = store.openProjectTab("w1", "a");
      const p2 = store.openProjectTab("w1", "b");
      // recency is [p2, p1, home]; activate p1
      store.activateTab("w1", p1);
      const state = win(store, "w1");
      expect(state.recency).toEqual([p1, p2, homeId]);
      expect(state.activeTabId).toBe(p1);
      // activate home — still exactly one entry per id
      store.activateTab("w1", homeId);
      expect(win(store, "w1").recency).toEqual([homeId, p1, p2]);
    });

    it("computeWarmSet over the slice recency yields active + 2 MRU; 4th tab sleeps", () => {
      store.openBrowserWindow("w1");
      const homeId = win(store, "w1").tabs[0]!.id;
      const p1 = store.openProjectTab("w1", "a");
      const p2 = store.openProjectTab("w1", "b");
      const p3 = store.openProjectTab("w1", "c");
      const state = win(store, "w1");
      const warm = computeWarmSet(state.recency, state.activeTabId);
      expect(warm).toEqual([p3, p2, p1]); // home (coldest) sleeps
      // activate home → it wakes, p1 falls out of the warm set
      store.activateTab("w1", homeId);
      const next = win(store, "w1");
      // recency after activation: [home, p3, p2, p1] — p3 is MRU of the rest
      expect(computeWarmSet(next.recency, next.activeTabId)).toEqual([homeId, p3, p2]);
    });
  });

  describe("setActiveRefusal", () => {
    it("sets refusal on the web tab and keeps kind web", () => {
      store.openBrowserWindow("w1");
      const id = store.openWebTab("w1", "https://example.com", "Example");
      store.setActiveRefusal("w1", id, true);
      const tab = win(store, "w1").tabs.find((t) => t.id === id)!;
      expect(tab.kind).toBe("web");
      expect(tab.refusal).toBe(true);
      store.setActiveRefusal("w1", id, false);
      expect(win(store, "w1").tabs.find((t) => t.id === id)!.refusal).toBe(false);
    });

    it("updates the target tab without touching refusal of another tab", () => {
      store.openBrowserWindow("w1");
      const a = store.openWebTab("w1", "https://example.com", "Example");
      const b = store.openWebTab("w1", "https://example.org", "Other org");
      store.setActiveRefusal("w1", a, true);
      const state = win(store, "w1");
      expect(state.tabs.find((t) => t.id === a)!.refusal).toBe(true);
      expect(state.tabs.find((t) => t.id === b)!.refusal).toBeUndefined();
    });
  });

  describe("navigateActive", () => {
    it("pushes into localHistory and resets scrollTop (web tab)", () => {
      store.openBrowserWindow("w1");
      const id = store.openWebTab("w1", "https://example.com", "Example");
      store.setScrollTop("w1", id, 240);
      store.navigateActive("w1", "https://example.com/next");
      const tab = win(store, "w1").tabs.find((t) => t.id === id)!;
      expect(tab.localHistory).toEqual(["https://example.com", "https://example.com/next"]);
      expect(tab.scrollTop).toBe(0);
      // current url tracked for reload rendering
      expect(tab.url).toBe("https://example.com/next");
    });

    it("does not throw when the window has no browser state", () => {
      expect(() => store.navigateActive("missing", "https://x.com")).not.toThrow();
    });
  });

  describe("setScrollTop", () => {
    it("restores per-tab scroll position before wake repaint", () => {
      store.openBrowserWindow("w1");
      const p1 = store.openProjectTab("w1", "a");
      const p2 = store.openProjectTab("w1", "b");
      store.setScrollTop("w1", p1, 512);
      store.setScrollTop("w1", p2, 9);
      const state = win(store, "w1");
      expect(state.tabs.find((t) => t.id === p1)!.scrollTop).toBe(512);
      expect(state.tabs.find((t) => t.id === p2)!.scrollTop).toBe(9);
    });
  });

  describe("pushReadme (LRU cap 5)", () => {
    it("keeps the 5 most recent slugs, evicting the first-in", () => {
      for (let i = 1; i <= 6; i++) store.pushReadme(`r${i}`, `<p>${i}</p>`);
      expect(Object.keys(store.readmeLru)).toEqual(["r2", "r3", "r4", "r5", "r6"]);
      expect(store.readmeLru!["r6"]).toBe("<p>6</p>");
    });

    it("updating an existing slug refreshes it in the LRU", () => {
      for (let i = 1; i <= 5; i++) store.pushReadme(`r${i}`, `<p>${i}</p>`);
      store.pushReadme("r2", "<p>r2 updated</p>"); // refresh
      store.pushReadme("r6", "<p>6</p>"); // overflow
      expect(Object.keys(store.readmeLru)).toEqual(["r3", "r4", "r5", "r2", "r6"]);
      expect(store.readmeLru!["r2"]).toBe("<p>r2 updated</p>");
    });
  });

  describe("pushMeta (metaLru cap 8, F2)", () => {
    it("keeps the 8 most recent metas, evicting the oldest", () => {
      for (let i = 1; i <= 9; i++) store.pushMeta(`m${i}`, makeMeta(`m${i}`));
      expect(Object.keys(store.metaLru)).toEqual(["m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9"]);
    });

    it("hit-path: cached meta is retrievable in full without any fetch", () => {
      const meta = makeMeta("devos");
      store.pushMeta("devos", meta);
      const cached = store.metaLru!["devos"];
      expect(cached).toEqual(meta); // whole object — readmeHtml, timeline, stars…
      // re-push of the same slug updates value without adding a key
      const updated = makeMeta("devos", { stars: 11 });
      store.pushMeta("devos", updated);
      expect(store.metaLru!["devos"]).toEqual(updated);
      expect(store.metaLru!["devos"]).not.toBe(meta); // immutability kept
    });

    it("metaLru and readmeLru maintain independent caps (8 vs 5)", () => {
      for (let i = 1; i <= 9; i++) {
        store.pushMeta(`m${i}`, makeMeta(`m${i}`));
        store.pushReadme(`m${i}`, `<p>${i}</p>`);
      }
      expect(Object.keys(store.metaLru)).toHaveLength(8);
      expect(Object.keys(store.readmeLru)).toHaveLength(5);
    });
  });

  describe("toggleSidePanel", () => {
    it("flips slice-global sidePanelOpen", () => {
      store.toggleSidePanel();
      expect(store.sidePanelOpen).toBe(true);
      store.toggleSidePanel();
      expect(store.sidePanelOpen).toBe(false);
    });
  });

  describe("consumePendingSlug", () => {
    it("returns the pending slug exactly once, then null", () => {
      // Task 7 sets this through the store before calling openBrowserWindow.
      store.pendingSlug = "devos";
      expect(store.consumePendingSlug()).toBe("devos");
      expect(store.consumePendingSlug()).toBeNull();
    });

    it("returns null when nothing is pending", () => {
      expect(store.consumePendingSlug()).toBeNull();
    });
  });
});
