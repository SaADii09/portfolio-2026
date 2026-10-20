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
    // Address bar is honest on the home tab: empty and disabled.
    const address = screen.getByRole("textbox", { name: /address/i });
    expect(address).toBeDisabled();
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
