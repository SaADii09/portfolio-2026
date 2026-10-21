import { StateCreator } from "zustand";
import type { ProjectMeta } from "@/app/api/project-meta/route";
import { evictLru } from "@/lib/warm-set";

/**
 * State layer for the DevOS Browser (spec §7). Keyed per OS-window id; the
 * singleton-browser invariant lives upstream (os-actions `openBrowser`). Tab
 * records keep enough per-tab detail (localHistory, scrollTop, refusal verdict)
 * that a cold tab can be woken faithfully from this state alone, while
 * `computeWarmSet`/`evictLru` (lib/warm-set.ts) bound how much actually stays
 * mounted across all tabs.
 */
export type BrowserTabKind = "home" | "project" | "web";

export interface BrowserTab {
  id: string;
  kind: BrowserTabKind;
  title: string;
  url?: string; // kind web
  slug?: string; // kind project
  refusal?: boolean; // kind web — probe verdict (no kind mutation, spec §7)
  localHistory: string[];
  scrollTop: number;
}

export interface BrowserWindowState {
  tabs: BrowserTab[];
  activeTabId: string | null;
  /** Warm-set input (F1): tab ids ordered by activation, front = most recent. */
  recency: string[];
}

/** Cap for the README HTML LRU (`readmeLru`). */
const README_LRU_CAP = 5;
/** Cap for the per-slug meta LRU (`metaLru`, F2 — network-free wake). */
const META_LRU_CAP = 8;

export interface BrowserSlice {
  browserWindows: Record<string, BrowserWindowState>;
  /** Slice-global under the singleton invariant; toggled from the toolbar. */
  sidePanelOpen: boolean;
  /** Pre-open payload consumed once by BrowserApp; set via the store by the launcher. */
  pendingSlug: string | null;
  /** Last 5 README HTMLs by slug. */
  readmeLru: Record<string, string>;
  /** Per-slug meta cache (cap 8) — Task 10 consults it before fetching. */
  metaLru: Record<string, ProjectMeta>;
  openBrowserWindow: (windowId: string) => void;
  openProjectTab: (windowId: string, slug: string) => string;
  openWebTab: (windowId: string, url: string, title: string) => string;
  /**
   * Open (or activate an existing) home tab — the tab-strip `+` button
   * (Task 9 amendment: the brief's new-tab button needs a home-tab creator
   * and `openBrowserWindow` only seeds empty records, so this mirrors the
   * dedupe-activate convention of the other open actions).
   */
  openHomeTab: (windowId: string) => string;
  closeTab: (windowId: string, tabId: string) => void;
  activateTab: (windowId: string, tabId: string) => void;
  /**
   * Drops a CLOSED browser window's record and the pending launch payload
   * (F2 + F4). A reopened browser gets a new window id, so the old record is
   * unreachable garbage; the slice-global `pendingSlug` would otherwise leak
   * into the next browser window as a phantom project tab. Called by the
   * window slice's close path through a narrow seam.
   */
  closeBrowserWindow: (windowId: string) => void;
  setActiveRefusal: (windowId: string, tabId: string, refusal: boolean) => void;
  /** Pushes `url` into the active tab's localHistory and resets scrollTop. */
  navigateActive: (windowId: string, url: string) => void;
  setScrollTop: (windowId: string, tabId: string, top: number) => void;
  /** LRU evict oldest at cap 5. */
  pushReadme: (slug: string, html: string) => void;
  /** Per-slug meta cache (F2), cap 8 oldest evict via the generic `evictLru`. */
  pushMeta: (slug: string, meta: ProjectMeta) => void;
  toggleSidePanel: () => void;
  /** Returns the pending slug and nulls it — exactly-once consumption. */
  consumePendingSlug: () => string | null;
}

// Mirror of the windowSlice id style (slice-local counter + timestamp suffix).
let nextTabId = 1;
function generateTabId(): string {
  return `tab-${nextTabId++}-${Date.now()}`;
}

/** Move `id` to the front of an activation trail, deduping (single entry per id). */
function toFront(list: string[], id: string): string[] {
  return [id, ...list.filter((existing) => existing !== id)];
}

/** Next window state after appending a tab: append, activate, bump recency. */
function appendTab(
  prev: BrowserWindowState | undefined,
  tab: BrowserTab,
): BrowserWindowState | null {
  if (!prev) return null;
  return {
    tabs: [...prev.tabs, tab],
    activeTabId: tab.id,
    recency: toFront(prev.recency, tab.id),
  };
}

/** Next window state after closing a tab: drop from tabs + recency. */
function dissolveTab(prev: BrowserWindowState, tabId: string): BrowserWindowState {
  const tabs = prev.tabs.filter((tab) => tab.id !== tabId);
  const recency = prev.recency.filter((id) => id !== tabId);
  const wasActive = prev.activeTabId === tabId;
  return {
    // Hand the baton to the most recently used remaining tab.
    tabs,
    recency,
    activeTabId: wasActive ? (recency[0] ?? null) : prev.activeTabId,
  };
}

/**
 * Drops one window's record — the surviving records keep their identity (a
 * no-op when the window never had one).
 */
function evictWindow(
  records: Record<string, BrowserWindowState>,
  windowId: string,
): Record<string, BrowserWindowState> {
  if (records[windowId] === undefined) return records;
  const next = { ...records };
  delete next[windowId];
  return next;
}

export const createBrowserSlice: StateCreator<BrowserSlice> = (set, get) => ({
  browserWindows: {},
  sidePanelOpen: false,
  pendingSlug: null,
  readmeLru: {},
  metaLru: {},

  openBrowserWindow: (windowId) => {
    const state = get().browserWindows[windowId];
    // Seed only when the record is missing or empty — a re-launch (Task 7
    // `openBrowser`) must not clobber the restored tab set.
    if (state && state.tabs.length > 0) return;
    const home: BrowserTab = {
      id: generateTabId(),
      kind: "home",
      title: "Home",
      localHistory: [],
      scrollTop: 0,
    };
    set((s) => ({
      browserWindows: {
        ...s.browserWindows,
        [windowId]: { tabs: [home], activeTabId: home.id, recency: [home.id] },
      },
    }));
  },

  openProjectTab: (windowId, slug) => {
    const state = get().browserWindows[windowId];
    const existing = state?.tabs.find((tab) => tab.kind === "project" && tab.slug === slug);
    if (existing) {
      get().activateTab(windowId, existing.id);
      return existing.id;
    }
    const id = generateTabId();
    const tab: BrowserTab = {
      id,
      kind: "project",
      title: slug,
      slug,
      localHistory: [],
      scrollTop: 0,
    };
    set((s) => {
      const next = appendTab(s.browserWindows[windowId], tab);
      if (!next) return s;
      return {
        browserWindows: { ...s.browserWindows, [windowId]: next },
      };
    });
    return id;
  },

  openWebTab: (windowId, url, title) => {
    const state = get().browserWindows[windowId];
    const existing = state?.tabs.find((tab) => tab.kind === "web" && tab.url === url);
    if (existing) {
      get().activateTab(windowId, existing.id);
      return existing.id;
    }
    const id = generateTabId();
    const tab: BrowserTab = {
      id,
      kind: "web",
      title,
      url,
      // The initial URL counts as first navigation so the toolbar's back
      // button has somewhere to go.
      localHistory: [url],
      scrollTop: 0,
    };
    set((s) => {
      const next = appendTab(s.browserWindows[windowId], tab);
      if (!next) return s;
      return {
        browserWindows: { ...s.browserWindows, [windowId]: next },
      };
    });
    return id;
  },

  openHomeTab: (windowId) => {
    const state = get().browserWindows[windowId];
    const existing = state?.tabs.find((tab) => tab.kind === "home");
    if (existing) {
      get().activateTab(windowId, existing.id);
      return existing.id;
    }
    const id = generateTabId();
    const home: BrowserTab = { id, kind: "home", title: "Home", localHistory: [], scrollTop: 0 };
    set((s) => {
      const next = appendTab(s.browserWindows[windowId], home);
      if (!next) return s;
      return {
        browserWindows: { ...s.browserWindows, [windowId]: next },
      };
    });
    return id;
  },

  closeTab: (windowId, tabId) => {
    set((s) => {
      const prev = s.browserWindows[windowId];
      if (!prev) return s;
      if (!prev.tabs.some((tab) => tab.id === tabId)) return s;
      return {
        browserWindows: { ...s.browserWindows, [windowId]: dissolveTab(prev, tabId) },
      };
    });
  },

  activateTab: (windowId, tabId) => {
    set((s) => {
      const prev = s.browserWindows[windowId];
      if (!prev || !prev.tabs.some((tab) => tab.id === tabId)) return s;
      return {
        browserWindows: {
          ...s.browserWindows,
          [windowId]: {
            ...prev,
            activeTabId: tabId,
            recency: toFront(prev.recency, tabId),
          },
        },
      };
    });
  },

  setActiveRefusal: (windowId, tabId, refusal) => {
    set((s) => {
      const prev = s.browserWindows[windowId];
      if (!prev) return s;
      const tabs = prev.tabs.map((tab) => (tab.id === tabId ? { ...tab, refusal } : tab));
      return {
        browserWindows: { ...s.browserWindows, [windowId]: { ...prev, tabs } },
      };
    });
  },

  closeBrowserWindow: (windowId) => {
    set((s) => ({
      browserWindows: evictWindow(s.browserWindows, windowId),
      // The launch payload belonged to the window that just closed. A stale
      // slug would open a phantom project tab in the NEXT browser window.
      pendingSlug: null,
    }));
  },

  navigateActive: (windowId, url) => {
    set((s) => {
      const prev = s.browserWindows[windowId];
      const active = prev?.tabs.find((tab) => tab.id === prev.activeTabId);
      if (!prev || !active) return s;
      const tabs = prev.tabs.map((tab) =>
        tab.id === active.id
          ? {
              ...tab,
              // Web tabs track their current location so reload re-fetches it.
              url: tab.kind === "web" ? url : tab.url,
              localHistory: [...tab.localHistory, url],
              scrollTop: 0,
            }
          : tab,
      );
      return {
        browserWindows: { ...s.browserWindows, [windowId]: { ...prev, tabs } },
      };
    });
  },

  setScrollTop: (windowId, tabId, top) => {
    set((s) => {
      const prev = s.browserWindows[windowId];
      if (!prev) return s;
      const tabs = prev.tabs.map((tab) => (tab.id === tabId ? { ...tab, scrollTop: top } : tab));
      return {
        browserWindows: { ...s.browserWindows, [windowId]: { ...prev, tabs } },
      };
    });
  },

  pushReadme: (slug, html) => {
    set((s) => ({
      readmeLru: evictLru(s.readmeLru, slug, html, README_LRU_CAP).next,
    }));
  },

  pushMeta: (slug, meta) => {
    set((s) => ({
      metaLru: evictLru(s.metaLru, slug, meta, META_LRU_CAP).next,
    }));
  },

  toggleSidePanel: () => {
    set((s) => ({ sidePanelOpen: !s.sidePanelOpen }));
  },

  consumePendingSlug: () => {
    const pending = get().pendingSlug;
    set({ pendingSlug: null });
    return pending;
  },
});
