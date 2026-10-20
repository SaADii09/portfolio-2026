import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Globe, Monitor } from "lucide-react";
import { useStore } from "@/store";
import { openApp } from "@/lib/os-actions";
import { renderAppContent } from "@/components/os/Desktop";
import { APP_ICONS, WINDOW_ICONS, windowIconKeyFor } from "@/components/os/appIcons";
import { Dock } from "@/components/os/Dock";
import { Taskbar } from "@/components/os/Taskbar";
import type { WindowInstance } from "@/types/window";

/**
 * Launch migration (Task 11): the `openApp` choke point routes the Projects
 * launcher into the DevOS Browser singleton, `renderAppContent` mounts
 * `BrowserApp` for a `browser` window (bound to that window's id), and the
 * dock/taskbar resolve the globe glyph for the browser window type.
 *
 * The legacy paths stay pinned here too: a persisted `projects` window still
 * renders the Projects app and a persisted `iframe` window still renders the
 * WebView — the migration only changes how a NEW browser window is launched
 * and rendered.
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

describe("openApp — the launch choke point", () => {
  beforeEach(() => {
    resetStore();
  });

  it("routes the projects launcher into the Browser singleton", () => {
    const openWindow = vi.fn(realOpenWindow);
    useStore.setState({ openWindow });

    openApp("projects");

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

  it("never opens a projects window (the legacy component is retired)", () => {
    openApp("projects");

    const state = useStore.getState();
    expect(state.windows.some((w) => w.component === "projects")).toBe(false);
  });

  it("keeps the browser a singleton across repeated launches", () => {
    openApp("projects");
    openApp("projects");

    const state = useStore.getState();
    expect(state.windows).toHaveLength(1);
    expect(state.windows[0]?.type).toBe("browser");
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

  it("mounts BrowserApp for a browser window, bound to that window's id", () => {
    const win = browserWindow("win-browser-7");

    render(renderAppContent(win));

    // The real BrowserApp mounted — its home tab is the selected tab.
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("Home");
    // ...and the browser record was seeded for THIS window id.
    expect(useStore.getState().browserWindows["win-browser-7"]).toBeDefined();
  });

  it("keeps rendering the legacy projects window (persisted windows)", () => {
    const win = makeWindow({
      id: "win-legacy-projects",
      title: "Projects",
      component: "projects",
    });

    render(renderAppContent(win));

    expect(screen.getByRole("heading", { name: "Projects" })).toBeDefined();
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
