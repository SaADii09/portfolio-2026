import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useStore } from "@/store";
import { BrowserApp, resetMetaRequests } from "@/components/apps/BrowserApp";
import { computeWarmSet } from "@/lib/warm-set";
import { BROWSER_TILES } from "@/lib/browser-apps";
import { PROJECTS } from "@/lib/portfolio-data";
import type { ProjectMeta } from "@/app/api/project-meta/route";

/**
 * BrowserApp shell contract (Task 9): home tab (ProjectGrid + site tiles),
 * tab-strip activation, the warm-tail content router (exactly three
 * `.browser-tab-panel` nodes, active visible, coldest asleep), toolbar
 * navigation over localHistory, and the exactly-once pendingSlug consumption.
 *
 * Task 9 review pins: the F2 network-free wake (a reloaded or degraded
 * project never re-requests), the G8 tab-strip ARIA + keyboard contract, the
 * 44px mobile hit areas, and a live address bar on every tab kind.
 */

function makeMeta(slug: string): ProjectMeta {
  return {
    slug,
    readmeHtml: `<p>${slug} body</p>`,
    degraded: false,
    timeline: [{ label: "v1.0", period: "2024" }],
    language: "TypeScript",
    stars: 10,
    homepage: null,
    createdAt: "2024-01-01T00:00:00Z",
    pushedAt: "2024-06-01T00:00:00Z",
  };
}

/** A degraded project: the upstream answered, but with no README. */
function makeDegradedMeta(slug: string): ProjectMeta {
  return { ...makeMeta(slug), readmeHtml: null, degraded: true };
}

function windowState(windowId: string) {
  const state = useStore.getState().browserWindows[windowId];
  if (state === undefined) throw new Error(`no browser record for ${windowId}`);
  return state;
}

/** Flush pending microtasks (stubbed fetch chains) inside act. */
async function flush() {
  await act(async () => {});
}

describe("BrowserApp — start-page compaction classes (short-window B1)", () => {
  it("renders the greeting, tile-label and project-host hooks the compact CSS keys on", () => {
    render(<BrowserApp windowId="win-b1" />);
    // The greeting row — hidden by @container tabpanel (max-height: 299px).
    const greeting = screen.getByText(/good (morning|afternoon|evening|night)/i);
    expect(greeting.className).toContain("browser-home-greeting");
    // Every tile's label span — hidden in compact mode; the colored square,
    // the grid, the aria-labels and the 44px targets remain.
    const tiles = screen.getAllByRole("button", { name: BROWSER_TILES[0]?.name ?? "" });
    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of BROWSER_TILES) {
      const btn = screen.getByRole("button", { name: tile.name });
      const label = btn.querySelector(".browser-tile-label");
      expect(label, `label span for ${tile.name}`).not.toBeNull();
    }
    // Project rows: the host span is the compact-mode hide (name+arrow stay).
    for (const entry of PROJECTS) {
      const row = screen.getByRole("button", { name: new RegExp(entry.title, "i") });
      expect(
        row.querySelector(".browser-project-row-host"),
        `host span for ${entry.slug}`,
      ).not.toBeNull();
    }
  });

  it("keys the tab-panel container + compaction rules in the SOURCE css", () => {
    // Unit tests can only see source css; the built-CSS pipeline (Tailwind +
    // lightningcss) is asserted in the e2e css-integrity spec.
    const css = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf-8");
    expect(css).toMatch(/\.browser-tab-panel\s*\{[^}]*container-type:\s*size/);
    expect(css).toMatch(/\.browser-tab-panel\s*\{[^}]*container-name:\s*tabpanel/);
    expect(css).toContain("@container tabpanel (max-height: 299px)");
    for (const hook of [
      "browser-home-greeting",
      "browser-tile-label",
      "browser-project-row-host",
    ]) {
      expect(css.indexOf(hook), `${hook} appears in a compaction rule`).toBeGreaterThan(
        css.indexOf("@container tabpanel (max-height: 299px)"),
      );
    }
  });
});

describe("BrowserApp", () => {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => makeMeta("devos"),
  }));

  beforeEach(() => {
    localStorage.clear();
    resetMetaRequests();
    useStore.setState({
      windows: [],
      activeWindowId: null,
      lastGeometry: {},
      browserWindows: {},
      pendingSlug: null,
      readmeLru: {},
      metaLru: {},
      sidePanelOpen: false,
      visitRecency: [],
      visitCounts: {},
    });
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("mounts the home tab with project cards and site tiles (cold record re-seeded)", () => {
    render(<BrowserApp windowId="w1" />);

    const state = windowState("w1");
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]?.kind).toBe("home");
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("Home");
    for (const tile of BROWSER_TILES) {
      expect(screen.getByRole("button", { name: tile.name })).toBeDefined();
    }
    expect(screen.getByText("DevOS Portfolio")).toBeDefined();
    // The address bar is live on the home tab: empty, but ready for a URL.
    const address = screen.getByRole("textbox", { name: /address/i });
    expect(address).not.toBeDisabled();
    expect(address).toHaveValue("");
  });

  it("clicking a project card adds a project tab, activates it, and seeds the caches", async () => {
    render(<BrowserApp windowId="w1" />);

    // Wave 1.5 B2: the home grid left — this targets the compact
    // "Your live projects" row (was `screen.getByText("DevOS Portfolio")`).
    fireEvent.click(screen.getByRole("button", { name: /DevOS Portfolio/ }));
    await flush();

    const state = windowState("w1");
    const tab = state.tabs.find((t) => t.kind === "project");
    expect(tab?.slug).toBe("devos");
    expect(state.activeTabId).toBe(tab?.id);
    // N3: the single /api/project-meta fetch feeds BOTH slice caches.
    expect(useStore.getState().readmeLru["devos"]).toBeDefined();
    expect(useStore.getState().metaLru["devos"]).toBeDefined();
    // The active project tab renders the README body.
    expect(document.querySelector(".token-prose")).not.toBeNull();
  });

  it("titles a project tab with the project name, and the slug when unknown", async () => {
    render(<BrowserApp windowId="w1" />);

    await act(async () => {
      useStore.getState().openProjectTab("w1", "devos");
    });
    await flush();
    expect(screen.getByRole("tab", { name: "DevOS Portfolio" })).toBeDefined();

    await act(async () => {
      useStore.getState().openProjectTab("w1", "not-a-project");
    });
    await flush();
    expect(screen.getByRole("tab", { name: "not-a-project" })).toBeDefined();
  });

  it("blocked tile opens a web tab rendering FallbackPanel with no iframe", () => {
    render(<BrowserApp windowId="w1" />);

    fireEvent.click(screen.getByRole("button", { name: "Google" }));

    const state = windowState("w1");
    const tab = state.tabs.find((t) => t.kind === "web");
    expect(tab?.url).toBe("https://www.google.com");
    expect(state.activeTabId).toBe(tab?.id);
    const panel = document.querySelector(`[data-tab-id="${tab?.id}"]`);
    expect(panel).not.toBeNull();
    // Wave 1.5 B2 re-point — the old byte-exact copy was
    // `contain("can't be embedded")`; the redesigned preview (A3) names the
    // host instead.
    expect(panel?.textContent).toContain("blocks embedding — live preview below");
    expect(panel?.querySelector("iframe")).toBeNull();
  });

  it("warm tail: exactly 3 panels mount, active is visible, coldest sleeps", async () => {
    render(<BrowserApp windowId="w1" />);

    await act(async () => {
      for (const slug of ["devos", "ai-job-portal", "saas-crm", "api-automation"]) {
        useStore.getState().openProjectTab("w1", slug);
      }
    });
    await flush();

    const state = windowState("w1");
    const warm = computeWarmSet(state.recency, state.activeTabId);
    expect(warm).toHaveLength(3);

    const panels = document.querySelectorAll(".browser-tab-panel");
    expect(panels).toHaveLength(3);
    for (const id of warm) {
      const panel = document.querySelector(`[data-tab-id="${id}"]`) as HTMLElement | null;
      expect(panel).not.toBeNull();
      expect(panel?.hasAttribute("hidden")).toBe(id !== state.activeTabId);
    }
    // The coldest tab (last in recency) renders nothing at all.
    const coldest = state.recency[state.recency.length - 1];
    expect(coldest).toBeDefined();
    expect(document.querySelector(`[data-tab-id="${coldest}"]`)).toBeNull();
  });

  it("address Enter dispatches navigateActive for the web tab", () => {
    render(<BrowserApp windowId="w1" />);

    fireEvent.click(screen.getByRole("button", { name: "Wikipedia" }));
    const tabId = windowState("w1").activeTabId;
    expect(tabId).not.toBeNull();

    const input = screen.getByRole("textbox", { name: /address/i });
    fireEvent.change(input, { target: { value: "en.wikipedia.org/wiki/DevOS" } });
    fireEvent.keyDown(input, { key: "Enter" });

    const tab = windowState("w1").tabs.find((t) => t.id === tabId);
    expect(tab?.localHistory).toHaveLength(2);
    expect(tab?.localHistory[1]).toBe("https://en.wikipedia.org/wiki/DevOS");
    expect(tab?.url).toBe("https://en.wikipedia.org/wiki/DevOS");
  });

  it("back/forward walk the active web tab's localHistory", () => {
    render(<BrowserApp windowId="w1" />);

    fireEvent.click(screen.getByRole("button", { name: "Wikipedia" }));
    const input = screen.getByRole("textbox", { name: /address/i });
    fireEvent.change(input, { target: { value: "https://en.wikipedia.org/wiki/DevOS" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // Fresh navigation sits at the tip of its history: back enabled,
    // forward disabled. Walking back lands on the seeded base URL.
    expect(screen.getByRole("button", { name: "Back" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Forward" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    const frame = () => screen.getByTitle("Website preview");
    expect(frame().getAttribute("src")).toBe("https://en.wikipedia.org");
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    expect(frame().getAttribute("src")).toBe("https://en.wikipedia.org");

    fireEvent.click(screen.getByRole("button", { name: "Forward" }));
    expect(frame().getAttribute("src")).toBe("https://en.wikipedia.org/wiki/DevOS");
    expect(screen.getByRole("button", { name: "Forward" })).toBeDisabled();
  });

  it("consumes pendingSlug exactly once on mount", async () => {
    useStore.setState({ pendingSlug: "devos" });

    render(<BrowserApp windowId="w1" />);
    await flush();

    const state = useStore.getState();
    expect(state.pendingSlug).toBeNull();
    const tab = state.browserWindows["w1"]?.tabs.find((t) => t.kind === "project");
    expect(tab?.slug).toBe("devos");
  });

  it("new-tab button activates the home tab", () => {
    render(<BrowserApp windowId="w1" />);

    fireEvent.click(screen.getByRole("button", { name: "Wikipedia" }));
    expect(windowState("w1").tabs.find((t) => t.kind === "web")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /new tab/i }));

    const state = windowState("w1");
    const home = state.tabs.find((t) => t.kind === "home");
    expect(home).toBeDefined();
    expect(state.activeTabId).toBe(home?.id);
  });

  it("toolbar side-panel toggle flips the slice flag", () => {
    render(<BrowserApp windowId="w1" />);

    fireEvent.click(screen.getByRole("button", { name: /toggle side panel/i }));
    expect(useStore.getState().sidePanelOpen).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /toggle side panel/i }));
    expect(useStore.getState().sidePanelOpen).toBe(false);
  });
});

describe("BrowserApp — network-free wake (F2)", () => {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => makeMeta("devos"),
  }));

  beforeEach(() => {
    localStorage.clear();
    resetMetaRequests();
    useStore.setState({
      windows: [],
      activeWindowId: null,
      lastGeometry: {},
      browserWindows: {},
      pendingSlug: null,
      readmeLru: {},
      metaLru: {},
      sidePanelOpen: false,
      visitRecency: [],
      visitCounts: {},
    });
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("revalidates once on Reload, then never re-requests when the tab wakes", async () => {
    render(<BrowserApp windowId="w1" />);

    // Wave 1.5 B2 re-point — this used to click the project card on the old
    // home grid (`getByText`); the home now carries the compact row instead.
    fireEvent.click(screen.getByRole("button", { name: /DevOS Portfolio/ }));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // An explicit Reload costs exactly ONE forced request.
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Three web tabs push the project tab out of the warm set — it sleeps.
    await act(async () => {
      useStore.getState().openWebTab("w1", "https://en.wikipedia.org", "Wikipedia");
      useStore.getState().openWebTab("w1", "https://example.com/live", "DevOS live");
      useStore.getState().openWebTab("w1", "https://example.com/auth", "Auth Kit");
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const projectId = windowState("w1").tabs.find((tab) => tab.kind === "project")?.id;
    expect(document.querySelector(`[data-tab-id="${projectId}"]`)).toBeNull();

    // Waking it again must cost zero network, even though the tab still
    // carries its reload counter.
    fireEvent.click(screen.getByRole("tab", { name: "DevOS Portfolio" }));
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(document.querySelector(`[data-tab-id="${projectId}"]`)).not.toBeNull();
  });

  it("never re-requests a degraded project when the tab wakes", async () => {
    useStore.setState({ metaLru: { devos: makeDegradedMeta("devos") } });

    render(<BrowserApp windowId="w1" />);
    await act(async () => {
      useStore.getState().openProjectTab("w1", "devos");
    });
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();

    // Three web tabs push the project tab out of the warm set — it sleeps.
    await act(async () => {
      useStore.getState().openWebTab("w1", "https://en.wikipedia.org", "Wikipedia");
      useStore.getState().openWebTab("w1", "https://example.com/live", "DevOS live");
      useStore.getState().openWebTab("w1", "https://example.com/auth", "Auth Kit");
    });
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();

    // Waking it again still costs zero network: the degraded meta IS the
    // upstream answer, not a cache miss.
    fireEvent.click(screen.getByRole("tab", { name: "DevOS Portfolio" }));
    await flush();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("BrowserApp — tab strip ARIA + keyboard (G8)", () => {
  beforeEach(() => {
    localStorage.clear();
    resetMetaRequests();
    useStore.setState({
      windows: [],
      activeWindowId: null,
      lastGeometry: {},
      browserWindows: {},
      pendingSlug: null,
      readmeLru: {},
      metaLru: {},
      sidePanelOpen: false,
      visitRecency: [],
      visitCounts: {},
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => makeMeta("devos"),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("links every tab to its panel (role=tabpanel, aria-controls/labelledby)", async () => {
    render(<BrowserApp windowId="w1" />);

    // Wave 1.5 B2 re-point — was the old home grid's `getByText` click.
    fireEvent.click(screen.getByRole("button", { name: /DevOS Portfolio/ }));
    await flush();

    const tabId = windowState("w1").activeTabId;
    const tab = screen.getByRole("tab", { selected: true });
    const panel = document.querySelector(`[data-tab-id="${tabId}"]`) as HTMLElement | null;

    expect(panel).not.toBeNull();
    expect(panel?.getAttribute("role")).toBe("tabpanel");
    expect(tab.getAttribute("aria-controls")).toBe(panel?.id);
    expect(panel?.getAttribute("aria-labelledby")).toBe(tab.id);
  });

  it("keeps the tablist free of non-tab children", () => {
    render(<BrowserApp windowId="w1" />);

    const tablist = screen.getByRole("tablist");
    expect(tablist.children.length).toBeGreaterThan(0);
    for (const child of Array.from(tablist.children)) {
      expect(child.getAttribute("role")).toBe("tab");
    }
    // The new-tab and close controls live beside the tablist.
    expect(tablist.querySelector('[aria-label="New tab"]')).toBeNull();
  });

  it("moves and activates tabs with ArrowLeft/ArrowRight/Home/End", () => {
    render(<BrowserApp windowId="w1" />);

    fireEvent.click(screen.getByRole("button", { name: "Wikipedia" }));
    const tabs = windowState("w1").tabs;
    const homeId = tabs[0]?.id;
    const wikiId = tabs[1]?.id;
    expect(wikiId).toBeDefined();

    // ArrowRight from the last tab wraps to the first.
    fireEvent.keyDown(screen.getByRole("tab", { name: "Wikipedia" }), { key: "ArrowRight" });
    expect(windowState("w1").activeTabId).toBe(homeId);

    // End jumps to the last tab, Home back to the first.
    fireEvent.keyDown(screen.getByRole("tab", { name: "Home" }), { key: "End" });
    expect(windowState("w1").activeTabId).toBe(wikiId);
    fireEvent.keyDown(screen.getByRole("tab", { name: "Wikipedia" }), { key: "Home" });
    expect(windowState("w1").activeTabId).toBe(homeId);

    // ArrowLeft from the first tab wraps to the last.
    fireEvent.keyDown(screen.getByRole("tab", { name: "Home" }), { key: "ArrowLeft" });
    expect(windowState("w1").activeTabId).toBe(wikiId);
  });

  it("closes the active tab with Delete", () => {
    render(<BrowserApp windowId="w1" />);

    fireEvent.click(screen.getByRole("button", { name: "Wikipedia" }));
    const wikiId = windowState("w1").activeTabId;

    fireEvent.keyDown(screen.getByRole("tab", { name: "Wikipedia" }), { key: "Delete" });

    const state = windowState("w1");
    expect(state.tabs.some((tab) => tab.id === wikiId)).toBe(false);
  });

  it("moves the roving focus with the keyboard and re-homes it after a close", () => {
    render(<BrowserApp windowId="w1" />);

    fireEvent.click(screen.getByRole("button", { name: "Wikipedia" }));
    const wiki = screen.getByRole("tab", { name: "Wikipedia" });
    wiki.focus();

    fireEvent.keyDown(wiki, { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Home" }));

    // A closed tab takes the focus with it — the tab that took over gets it.
    const home = screen.getByRole("tab", { name: "Home" });
    home.focus();
    fireEvent.keyDown(home, { key: "Delete" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Wikipedia" }));
  });
});

describe("BrowserApp — address bar, touch targets, panel toggle", () => {
  beforeEach(() => {
    localStorage.clear();
    resetMetaRequests();
    useStore.setState({
      windows: [],
      activeWindowId: null,
      lastGeometry: {},
      browserWindows: {},
      pendingSlug: null,
      readmeLru: {},
      metaLru: {},
      sidePanelOpen: false,
      visitRecency: [],
      visitCounts: {},
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => makeMeta("devos"),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens a web tab when a URL is typed on the home tab", () => {
    render(<BrowserApp windowId="w1" />);

    const address = screen.getByRole("textbox", { name: /address/i });
    fireEvent.change(address, { target: { value: "en.wikipedia.org" } });
    fireEvent.keyDown(address, { key: "Enter" });

    const state = windowState("w1");
    const tab = state.tabs.find((t) => t.kind === "web");
    expect(tab?.url).toBe("https://en.wikipedia.org");
    expect(state.activeTabId).toBe(tab?.id);
  });

  it("ignores a blank address submit", () => {
    render(<BrowserApp windowId="w1" />);

    const address = screen.getByRole("textbox", { name: /address/i });
    fireEvent.change(address, { target: { value: "   " } });
    fireEvent.keyDown(address, { key: "Enter" });

    const state = windowState("w1");
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]?.kind).toBe("home");
  });

  it("gives the browser chrome a 44px mobile hit area", () => {
    render(<BrowserApp windowId="w1" />);

    expect(screen.getByRole("button", { name: "Back" }).className).toContain("h-11");
    expect(screen.getByRole("button", { name: /new tab/i }).className).toContain("h-11");
    expect(screen.getByRole("tab", { selected: true }).className).toContain("min-h-[44px]");
    expect(screen.getByRole("textbox", { name: /address/i }).className).toContain("min-h-[44px]");
    // Wave 1.5 B2: the start page's own controls — shortcut tiles and the
    // compact projects row — carry the same 44px floor.
    expect(screen.getByRole("button", { name: "Google" }).className).toContain("min-h-[44px]");
    expect(screen.getByRole("button", { name: /DevOS Portfolio/ }).className).toContain(
      "min-h-[44px]",
    );
  });

  it("does not claim the side panel is pressed when no panel can show", () => {
    render(<BrowserApp windowId="w1" />);

    const toggle = screen.getByRole("button", { name: /toggle side panel/i });
    fireEvent.click(toggle);
    expect(useStore.getState().sidePanelOpen).toBe(true);
    // The home tab has no project to describe — the button stays honest.
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });
});

/**
 * The close-while-launching race (F4): the browser window closes between the
 * launch and the app's mount, so the launch payload is never consumed. The
 * NEXT browser window must not inherit it — a phantom project tab would open
 * a project the user never asked for.
 */
describe("BrowserApp — a closed browser window leaves no phantom tab", () => {
  beforeEach(() => {
    localStorage.clear();
    resetMetaRequests();
    useStore.setState({
      windows: [],
      activeWindowId: null,
      lastGeometry: {},
      browserWindows: {},
      pendingSlug: null,
      readmeLru: {},
      metaLru: {},
      sidePanelOpen: false,
      visitRecency: [],
      visitCounts: {},
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => makeMeta("devos"),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens the next browser window on the home tab only", async () => {
    const closedId = useStore.getState().openWindow({
      title: "Browser",
      type: "browser",
      component: "browser",
    });
    useStore.getState().openBrowserWindow(closedId);
    // The launcher wrote the payload; the window closed before the mount.
    useStore.setState({ pendingSlug: "devos" });
    useStore.getState().closeWindow(closedId);
    expect(useStore.getState().pendingSlug).toBeNull();

    const nextId = useStore.getState().openWindow({
      title: "Browser",
      type: "browser",
      component: "browser",
    });
    render(<BrowserApp windowId={nextId} />);
    await flush();

    const record = useStore.getState().browserWindows[nextId]!;
    expect(record.tabs).toHaveLength(1);
    expect(record.tabs[0]?.kind).toBe("home");
    expect(record.tabs.some((tab) => tab.kind === "project")).toBe(false);
  });
});

/**
 * Scroll persistence (I-4): a scroll burst must never write to the global
 * store per event. The live position lives in a ref; the store learns it
 * once the burst ends (debounced) or when the tab is left (flushed).
 */
describe("BrowserApp — scroll persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    resetMetaRequests();
    useStore.setState({
      windows: [],
      activeWindowId: null,
      lastGeometry: {},
      browserWindows: {},
      pendingSlug: null,
      readmeLru: {},
      metaLru: {},
      sidePanelOpen: false,
      visitRecency: [],
      visitCounts: {},
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => makeMeta("devos"),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** The scrollable panel of a tab (jsdom has no layout, so scrollTop is set directly). */
  function panelOf(tabId: string): HTMLElement {
    const panel = document.querySelector(`[data-tab-id="${tabId}"]`);
    if (!(panel instanceof HTMLElement)) throw new Error(`no panel for ${tabId}`);
    return panel;
  }

  /** Counts the store updates that replace the browser window record. */
  function countBrowserWrites(): { counter: { writes: number }; stop: () => void } {
    const counter = { writes: 0 };
    const stop = useStore.subscribe((state, prev) => {
      if (state.browserWindows !== prev.browserWindows) counter.writes += 1;
    });
    return { counter, stop };
  }

  /** The persisted scroll position of one tab. */
  function persistedScroll(tabId: string): number | undefined {
    return windowState("w1").tabs.find((tab) => tab.id === tabId)?.scrollTop;
  }

  /** Opens the project tab and returns its id. */
  async function openProject(): Promise<string> {
    render(<BrowserApp windowId="w1" />);
    // Wave 1.5 B2 re-point — was the old home grid's `getByText` click.
    fireEvent.click(screen.getByRole("button", { name: /DevOS Portfolio/ }));
    await flush();
    const tabId = windowState("w1").activeTabId;
    if (tabId === null) throw new Error("no active tab");
    return tabId;
  }

  it("collapses a burst of scroll events into a single store write", async () => {
    const tabId = await openProject();
    const panel = panelOf(tabId);
    const { counter, stop } = countBrowserWrites();

    for (let step = 1; step <= 20; step += 1) {
      panel.scrollTop = step * 10;
      fireEvent.scroll(panel);
    }

    // The burst itself never touches the store.
    expect(counter.writes).toBe(0);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    // One write when the burst ends — and the position is the last one.
    expect(counter.writes).toBe(1);
    expect(persistedScroll(tabId)).toBe(200);
    stop();
  });

  it("persists the scroll position immediately when the user switches away", async () => {
    const tabId = await openProject();
    const panel = panelOf(tabId);

    panel.scrollTop = 240;
    fireEvent.scroll(panel);

    // Switch tabs BEFORE the debounce fires — the position is flushed now.
    fireEvent.click(screen.getByRole("tab", { name: "Home" }));

    expect(persistedScroll(tabId)).toBe(240);
  });

  it("restores the persisted scroll position when the tab comes back", async () => {
    const tabId = await openProject();
    const panel = panelOf(tabId);

    panel.scrollTop = 240;
    fireEvent.scroll(panel);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(persistedScroll(tabId)).toBe(240);

    // Leave the tab (the DOM scroll state is lost) and come back.
    fireEvent.click(screen.getByRole("tab", { name: "Home" }));
    fireEvent.click(screen.getByRole("tab", { name: "DevOS Portfolio" }));

    expect(panelOf(tabId).scrollTop).toBe(240);
  });
});

/**
 * Wave 1.5 B2 — the chrome-classic start page and the host-aware tab path:
 * the shortcut tile grid (Concept A), the "Recently visited" chips (B1's
 * slice state), the compact "Your live projects" row (the grid itself left
 * with the Projects window), and `isEmbedBlocked` replacing the byte-exact
 * tile match in WebTabBody.
 */
describe("BrowserApp — chrome-classic home + host-aware tabs (Wave 1.5 B2)", () => {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => makeMeta("devos"),
  }));

  beforeEach(() => {
    localStorage.clear();
    resetMetaRequests();
    useStore.setState({
      windows: [],
      activeWindowId: null,
      lastGeometry: {},
      browserWindows: {},
      pendingSlug: null,
      readmeLru: {},
      metaLru: {},
      sidePanelOpen: false,
      visitRecency: [],
      visitCounts: {},
    });
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a typed refuser-host variant renders the preview instantly — no iframe, no embed-check", () => {
    render(<BrowserApp windowId="w1" />);

    const address = screen.getByRole("textbox", { name: /address/i });
    fireEvent.change(address, { target: { value: "https://www.youtube.com/watch?v=x" } });
    fireEvent.keyDown(address, { key: "Enter" });

    const tab = windowState("w1").tabs.find((t) => t.kind === "web");
    expect(tab?.url).toBe("https://www.youtube.com/watch?v=x");
    const panel = document.querySelector(`[data-tab-id="${tab?.id}"]`);
    expect(panel).not.toBeNull();
    // Host classification (G3): the iframe is never mounted and the verdict
    // route is never consulted — the HOST alone decides.
    expect(panel?.querySelector("iframe")).toBeNull();
    expect(panel?.textContent).toContain("blocks embedding — live preview below");
    const embedChecks = fetchMock.mock.calls.filter((call) =>
      String(call.map(String).join(" ")).includes("/api/embed-check"),
    );
    expect(embedChecks).toHaveLength(0);
  });

  it("a typed INSECURE url says so — it never accuses the site of blocking", () => {
    // A non-https url gets no iframe (our own CSP `frame-src 'self' https:`
    // would refuse it), but the site did not block anything — the panel must
    // not tell the visitor that it did.
    render(<BrowserApp windowId="w1" />);

    const address = screen.getByRole("textbox", { name: /address/i });
    fireEvent.change(address, { target: { value: "http://insecure.example/page" } });
    fireEvent.keyDown(address, { key: "Enter" });

    const tab = windowState("w1").tabs.find((t) => t.kind === "web");
    const panel = document.querySelector(`[data-tab-id="${tab?.id}"]`);
    expect(panel).not.toBeNull();
    expect(panel?.querySelector("iframe")).toBeNull();
    expect(panel?.textContent).toContain("isn't served over HTTPS");
    expect(panel?.textContent).not.toContain("blocks embedding");
  });

  it("renders all eight shortcut tiles by name", () => {
    render(<BrowserApp windowId="w1" />);
    for (const tile of BROWSER_TILES) {
      expect(screen.getByRole("button", { name: tile.name })).toBeDefined();
    }
  });

  it("the projects row renders title + host and opens a project tab", async () => {
    render(<BrowserApp windowId="w1" />);

    expect(screen.getByText("DevOS Portfolio")).toBeDefined();
    // The row names the DEPLOYED origin (demo url host; the repo host when
    // there is no demo).
    expect(screen.getByText("portfolio-2026-sp9k.vercel.app")).toBeDefined();
    expect(screen.getByText("github.com")).toBeDefined(); // api-automation has no demo
    expect(screen.getAllByText("yours")).toHaveLength(PROJECTS.length);

    fireEvent.click(screen.getByRole("button", { name: /DevOS Portfolio/ }));
    await flush();

    const state = windowState("w1");
    const tab = state.tabs.find((t) => t.kind === "project");
    expect(tab?.slug).toBe("devos");
    expect(state.activeTabId).toBe(tab?.id);
  });

  it("a recorded visit shows a chip on the home and clicking it reopens the web tab", () => {
    render(<BrowserApp windowId="w1" />);

    fireEvent.click(screen.getByRole("button", { name: "Wikipedia" }));
    fireEvent.click(screen.getByRole("tab", { name: "Home" }));

    const chip = screen.getByRole("button", { name: /en\.wikipedia\.org/ });
    fireEvent.click(chip);

    const state = windowState("w1");
    const wiki = state.tabs.find((t) => t.kind === "web");
    expect(wiki?.url).toBe("https://en.wikipedia.org");
    expect(state.activeTabId).toBe(wiki?.id);
  });

  it("the home is a start page — the projects GRID left with the Projects window", () => {
    render(<BrowserApp windowId="w1" />);

    // ProjectGrid renders descriptions and category chips; the compact row
    // must not.
    expect(screen.queryByText(PROJECTS[0]!.description)).toBeNull();
    expect(screen.queryByText(PROJECTS[0]!.category)).toBeNull();
  });

  it("the shortcut grid wraps 3 columns on mobile", () => {
    render(<BrowserApp windowId="w1" />);

    const grid = screen.getByLabelText("Shortcuts").querySelector(".grid");
    expect(grid?.className).toContain("grid-cols-3");
  });
});
