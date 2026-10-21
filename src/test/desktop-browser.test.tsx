import { describe, it, expect, vi, beforeAll, afterAll, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Globe, Monitor } from "lucide-react";
import { useStore } from "@/store";
import { openApp } from "@/lib/os-actions";
import { APP_DEFS } from "@/lib/apps";
import { PROJECTS } from "@/lib/portfolio-data";
import { Desktop, renderAppContent } from "@/components/os/Desktop";
import { APP_ICONS, WINDOW_ICONS, windowIconKeyFor } from "@/components/os/appIcons";
import { Dock } from "@/components/os/Dock";
import { Taskbar } from "@/components/os/Taskbar";
import type { WindowInstance } from "@/types/window";

/**
 * Launch identity (real-web Task C3): the Browser is a stand-alone app — a
 * dedicated `browser` AppId whose launcher opens `type: "browser"` (never the
 * registry `type: "app"` path, which would break the close cleanup, the
 * relaunch dedupe, and the globe glyph), while `openApp("projects")` opens the
 * registry Projects window again — its project cards open browser tabs.
 *
 * The legacy paths stay pinned here too: a persisted `iframe` window still
 * renders the WebView — the identity split only changes which app ids carry
 * which launchers.
 */

/** The real store action — the spies below wrap it, never replace it. */
const realOpenWindow = useStore.getState().openWindow;

function makeWindow(overrides: Partial<WindowInstance> = {}): WindowInstance {
  return {
    id: "win-test",
    title: "Window",
    type: "app",
    component: "about",
    x: 0,
    y: 0,
    width: 600,
    height: 400,
    zIndex: 10,
    opacity: 1,
    isMinimized: false,
    isMaximized: false,
    isPinned: false,
    ...overrides,
  };
}

/** A browser window as the launcher creates it. */
function browserWindow(id = "win-browser-1"): WindowInstance {
  return makeWindow({ id, title: "Browser", type: "browser", component: "browser" });
}

/** Store reset — the browser slice state is per test. */
function resetStore(): void {
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
    openWindow: realOpenWindow,
  });
}

/** jsdom lacks ResizeObserver and matchMedia — Desktop's hooks need both. */
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
function matchMediaStub(query: string): MediaQueryList {
  return {
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  } as unknown as MediaQueryList;
}

describe("openApp — the launch choke point", () => {
  beforeEach(() => {
    resetStore();
  });

  it("routes the browser launcher into the Browser singleton", () => {
    const openWindow = vi.fn(realOpenWindow);
    useStore.setState({ openWindow });

    openApp("browser");

    // The browser launcher is the only producer of this window shape.
    expect(openWindow).toHaveBeenCalledTimes(1);
    expect(openWindow).toHaveBeenCalledWith({
      title: "Browser",
      type: "browser",
      component: "browser",
    });

    const state = useStore.getState();
    expect(state.windows).toHaveLength(1);
    expect(state.windows[0]?.type).toBe("browser");
    expect(state.windows[0]?.component).toBe("browser");
    expect(state.activeWindowId).toBe(state.windows[0]?.id);
  });

  it("never opens the Browser as a registry (type:'app') window", () => {
    openApp("browser");

    const state = useStore.getState();
    expect(state.windows.some((w) => w.type === "app" && w.component === "browser")).toBe(false);
    expect(state.windows.every((w) => w.type === "browser")).toBe(true);
  });

  it("keeps the browser a singleton across repeated launches, focusing instead of duplicating", () => {
    openApp("browser");
    const firstId = useStore.getState().windows[0]?.id;

    openApp("browser");

    const state = useStore.getState();
    expect(state.windows).toHaveLength(1);
    expect(state.windows[0]?.type).toBe("browser");
    expect(state.windows[0]?.id).toBe(firstId);
    expect(state.activeWindowId).toBe(firstId);
  });

  it("opens a Projects window again on the registry path", () => {
    openApp("projects");

    const state = useStore.getState();
    const projects = state.windows[0];
    expect(projects?.type).toBe("app");
    expect(projects?.component).toBe("projects");
    expect(projects?.title).toBe("Projects");
  });

  it("leaves every other app id on the registry path", () => {
    openApp("about");
    openApp("terminal");

    const state = useStore.getState();
    expect(state.windows.map((w) => w.component)).toEqual(["about", "terminal"]);
    expect(state.windows.every((w) => w.type === "app")).toBe(true);
  });
});

describe("renderAppContent", () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    // The card-click test stubs `fetch` (the active project tab asks the meta
    // route on mount); unstub regardless of assertion outcome.
    vi.unstubAllGlobals();
  });

  it("mounts BrowserApp for a browser window, bound to that window's id", () => {
    const win = browserWindow("win-browser-7");

    render(renderAppContent(win));

    // The real BrowserApp mounted — its home tab is the selected tab.
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("Home");
    // ...and the browser record was seeded for THIS window id.
    expect(useStore.getState().browserWindows["win-browser-7"]).toBeDefined();
  });

  it("renders the Projects window through ProjectsApp", () => {
    const win = makeWindow({
      id: "win-projects",
      title: "Projects",
      component: "projects",
    });

    render(renderAppContent(win));

    expect(screen.getByRole("heading", { name: "Projects" })).toBeDefined();
  });

  it("opens a browser project tab from a Projects-window project card", async () => {
    const first = PROJECTS[0];
    if (!first) throw new Error("PROJECTS seed data missing");
    // The active project tab asks /api/project-meta for meta + README on mount
    // (never real network in unit suites) — a benign upstream answer.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          slug: first.slug,
          readmeHtml: "<p>body</p>",
          degraded: false,
          timeline: [],
          language: "TypeScript",
          stars: 10,
          homepage: null,
          createdAt: "2024-01-01T00:00:00Z",
          pushedAt: "2024-06-01T00:00:00Z",
        }),
      })),
    );
    render(
      renderAppContent(
        makeWindow({ id: "win-projects", title: "Projects", component: "projects" }),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: new RegExp(first.title) }));

    // The OS mounts the new browser window; its app consumes the pendingSlug
    // on mount (fresh-launch delivery), materializing the project tab.
    const browserWin = useStore
      .getState()
      .windows.find((w) => w.type === "browser" && w.component === "browser");
    if (!browserWin) throw new Error("clicking a project card did not open the browser window");
    render(renderAppContent(browserWin));
    await act(async () => {});

    // The card routed into the DevOS Browser as a project tab for the slug.
    const state = useStore.getState();
    expect(state.windows.some((w) => w.type === "browser")).toBe(true);
    const projectTab = state.browserWindows[browserWin.id]?.tabs.find(
      (tab) => tab.kind === "project",
    );
    expect(projectTab?.slug).toBe(first.slug);
  });

  it("keeps rendering the legacy iframe window through the WebView", () => {
    const win = makeWindow({
      id: "win-legacy-iframe",
      title: "Site",
      type: "iframe",
      component: undefined,
      url: "https://example.com",
    });

    render(renderAppContent(win));

    expect(screen.getByTitle("Website preview")).toBeDefined();
  });
});

describe("dock/taskbar window icons", () => {
  beforeEach(() => {
    resetStore();
  });

  it("resolves the globe glyph for a browser window", () => {
    expect(WINDOW_ICONS[windowIconKeyFor({ type: "browser", component: "browser" })]).toBe(Globe);
  });

  it("keeps the app glyph for a regular app window", () => {
    expect(WINDOW_ICONS[windowIconKeyFor({ type: "app", component: "about" })]).toBe(
      APP_ICONS.about,
    );
  });

  it("falls back to the monitor glyph for an unknown window", () => {
    expect(WINDOW_ICONS[windowIconKeyFor({ type: "app" })]).toBe(Monitor);
    expect(WINDOW_ICONS[windowIconKeyFor({})]).toBe(Monitor);
  });

  it("never resolves an inherited object key as an icon", () => {
    // "toString" is on Object.prototype — the lookup uses own keys only.
    expect(windowIconKeyFor({ type: "app", component: "toString" })).toBe("monitor");
  });

  it("shows the globe in the dock for the browser window", () => {
    useStore.setState({ windows: [browserWindow()], activeWindowId: "win-browser-1" });

    const { container } = render(<Dock />);

    expect(container.querySelector(".lucide-globe")).not.toBeNull();
  });

  it("shows the globe in the mobile taskbar for the browser window", () => {
    useStore.setState({ windows: [browserWindow()], activeWindowId: "win-browser-1" });

    const { container } = render(<Taskbar />);

    expect(container.querySelector(".lucide-globe")).not.toBeNull();
  });
});

describe("desktop icon table", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.stubGlobal("matchMedia", matchMediaStub);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("renders 7 icons (one per AppId) with the globe on the Browser launcher", () => {
    render(<Desktop />);

    // Desktop icons are the only `title="Open …"` buttons in the OS shell.
    const iconButtons = screen.getAllByTitle(/^Open /);
    expect(iconButtons).toHaveLength(7);
    for (const def of APP_DEFS) {
      expect(
        screen.getByTitle(`Open ${def.desktopLabel ?? def.title}`),
        `icon for ${def.id}`,
      ).toBeDefined();
    }
    const browserButton = screen.getByTitle("Open Browser");
    expect(browserButton.querySelector(".lucide-globe")).not.toBeNull();
  });
});
