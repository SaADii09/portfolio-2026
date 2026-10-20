import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useStore } from "@/store";
import { BrowserApp } from "@/components/apps/BrowserApp";
import { computeWarmSet } from "@/lib/warm-set";
import { BROWSER_TILES } from "@/lib/browser-apps";
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

describe("BrowserApp", () => {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => makeMeta("devos"),
  }));

  beforeEach(() => {
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

    fireEvent.click(screen.getByText("DevOS Portfolio"));
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

  it("blocked tile opens a web tab rendering FallbackPanel with no iframe", () => {
    render(<BrowserApp windowId="w1" />);

    fireEvent.click(screen.getByRole("button", { name: "Google" }));

    const state = windowState("w1");
    const tab = state.tabs.find((t) => t.kind === "web");
    expect(tab?.url).toBe("https://www.google.com");
    expect(state.activeTabId).toBe(tab?.id);
    const panel = document.querySelector(`[data-tab-id="${tab?.id}"]`);
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain("can't be embedded");
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
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("revalidates once on Reload, then never re-requests when the tab wakes", async () => {
    render(<BrowserApp windowId="w1" />);

    fireEvent.click(screen.getByText("DevOS Portfolio"));
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
    fireEvent.click(screen.getByRole("tab", { name: "devos" }));
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
    fireEvent.click(screen.getByRole("tab", { name: "devos" }));
    await flush();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("BrowserApp — tab strip ARIA + keyboard (G8)", () => {
  beforeEach(() => {
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

    fireEvent.click(screen.getByText("DevOS Portfolio"));
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
