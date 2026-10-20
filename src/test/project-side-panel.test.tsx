import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useStore } from "@/store";
import { BrowserApp } from "@/components/apps/BrowserApp";
import { ProjectSidePanel, type ProjectSidePanelProps } from "@/components/apps/ProjectSidePanel";
import type { ProjectMeta } from "@/app/api/project-meta/route";
import type { ProjectEntry } from "@/lib/portfolio-data";

/**
 * Project side panel contract (Task 10): the presentational panel (loading,
 * timeline rows verbatim, degraded notice, error + retry, tech chips, links,
 * collapse) and the BrowserApp wiring around it (F2 — a warm slice cache
 * costs ZERO network; N3 — a cold slug costs exactly ONE request and that
 * response feeds BOTH slice caches).
 */

const META: ProjectMeta = {
  slug: "devos",
  readmeHtml: "<p>readme body</p>",
  degraded: false,
  timeline: [
    { label: "Created", period: "2024-01" },
    { label: "Latest release v1.0", period: "unknown" },
    { label: "Last push", period: "2024-06" },
  ],
  language: "TypeScript",
  stars: 42,
  homepage: null,
  createdAt: "2024-01-01T00:00:00Z",
  pushedAt: "2024-06-01T00:00:00Z",
};

const ENTRY: ProjectEntry = {
  title: "DevOS Portfolio",
  description: "Interactive Web OS portfolio with window management.",
  tech: ["Next.js", "TypeScript", "Zustand"],
  category: "Personal",
  slug: "devos",
  repoUrl: "https://github.com/SaADii09/portfolio-2026",
  demoUrl: "https://portfolio-2026-sp9k.vercel.app",
};

const DEFAULTS: ProjectSidePanelProps = {
  entry: ENTRY,
  meta: META,
  loading: false,
  error: null,
  onRetry: () => {},
  onCollapse: () => {},
};

function renderPanel(overrides: Partial<ProjectSidePanelProps> = {}) {
  return render(<ProjectSidePanel {...DEFAULTS} {...overrides} />);
}

/** Flush pending microtasks (the stubbed fetch chain) inside act. */
async function flush() {
  await act(async () => {});
}

async function openProjectTab(windowId: string, slug: string) {
  await act(async () => {
    useStore.getState().openProjectTab(windowId, slug);
  });
}

describe("ProjectSidePanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the loading state while the project details are in flight", () => {
    renderPanel({ meta: null, loading: true });

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("renders a 264px right rail on desktop", () => {
    const { container } = renderPanel();

    const aside = container.querySelector("aside");
    expect(aside?.className).toContain("w-[264px]");
    expect(aside?.className).toContain("border-l");
    // The rail is hard-capped: it can never steal more than 45% of the
    // content width (spec §4 anti-goal), at any window width.
    expect(aside?.className).toContain("max-w-[45%]");
  });

  it("renders a bottom drawer capped at 45% height in a narrow browser window", () => {
    // The switch is a CSS CONTAINER query on the browser window's own
    // content width — the viewport no longer decides it (the OS window is
    // independently resizable). jsdom evaluates no container query, so the
    // drawer is asserted through the variant that carries it.
    const { container } = renderPanel();

    const aside = container.querySelector("aside");
    expect(aside?.className).toContain("max-h-[45%]");
    expect(aside?.className).toContain("w-full");
    expect(aside?.className).toContain("border-t");
    expect(aside?.className).toContain("@max-[560px]:max-h-[45%]");
    expect(aside?.className).toContain("@max-[560px]:w-full");
    expect(aside?.className).toContain("@max-[560px]:border-t");
  });

  it("keys the layout to the browser window's width, not to the viewport", () => {
    // A mobile viewport must NOT change the panel's classes any more: the
    // rail/drawer switch is a container query on the window's own width.
    const desktop = renderPanel();
    const desktopClasses = desktop.container.querySelector("aside")?.className ?? "";

    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("767.98"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const mobile = renderPanel();
    const mobileClasses = mobile.container.querySelector("aside")?.className ?? "";

    expect(mobileClasses).toBe(desktopClasses);
    // The window-width switch is present in both renders.
    expect(desktopClasses).toContain("@max-[560px]:w-full");
  });

  it("renders every timeline row verbatim from the meta", () => {
    renderPanel();

    expect(screen.getByText("Created")).toBeInTheDocument();
    expect(screen.getByText("2024-01")).toBeInTheDocument();
    expect(screen.getByText("Latest release v1.0")).toBeInTheDocument();
    expect(screen.getByText("unknown")).toBeInTheDocument();
    expect(screen.getByText("Last push")).toBeInTheDocument();
    expect(screen.getByText("2024-06")).toBeInTheDocument();
  });

  it("flags a degraded README without hiding the repo facts", () => {
    renderPanel({ meta: { ...META, degraded: true } });

    expect(screen.getByText(/README unavailable/i)).toBeInTheDocument();
    expect(screen.getByText("Created")).toBeInTheDocument();
  });

  it("shows the failure and calls onRetry from the retry control", () => {
    const onRetry = vi.fn();
    renderPanel({ meta: null, error: "Project details unavailable (502).", onRetry });

    expect(screen.getByRole("alert")).toHaveTextContent("Project details unavailable (502).");
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders one tech chip per entry.tech item", () => {
    renderPanel();

    expect(document.querySelectorAll("[data-tech-chip]")).toHaveLength(ENTRY.tech.length);
  });

  it("links the repository and the live demo as external links", () => {
    renderPanel();

    const repo = screen.getByRole("link", { name: /repository/i });
    expect(repo.getAttribute("href")).toBe(ENTRY.repoUrl);
    expect(repo.getAttribute("target")).toBe("_blank");
    expect(repo.getAttribute("rel")).toContain("noopener");

    const demo = screen.getByRole("link", { name: /live demo/i });
    expect(demo.getAttribute("href")).toBe(ENTRY.demoUrl);
    expect(demo.getAttribute("target")).toBe("_blank");
    expect(demo.getAttribute("rel")).toContain("noreferrer");
  });

  it("calls onCollapse from the collapse control", () => {
    const onCollapse = vi.fn();
    renderPanel({ onCollapse });

    fireEvent.click(screen.getByRole("button", { name: /collapse/i }));
    expect(onCollapse).toHaveBeenCalledTimes(1);
  });
});

describe("BrowserApp — side panel wiring", () => {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => META,
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

  it("renders the panel rows from the slice cache with zero network calls (F2)", async () => {
    useStore.setState({
      metaLru: { devos: META },
      readmeLru: { devos: "<p>cached readme</p>" },
    });

    render(<BrowserApp windowId="w1" />);
    await openProjectTab("w1", "devos");
    fireEvent.click(screen.getByRole("button", { name: /toggle side panel/i }));
    await flush();

    expect(screen.getByText("Created")).toBeInTheDocument();
    expect(screen.getByText("2024-01")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("costs exactly one request on a cold cache and feeds both slice caches (N3)", async () => {
    render(<BrowserApp windowId="w1" />);
    await openProjectTab("w1", "devos");
    fireEvent.click(screen.getByRole("button", { name: /toggle side panel/i }));
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/project-meta?repo=SaADii09%2Fportfolio-2026");
    expect(useStore.getState().metaLru["devos"]).toBeDefined();
    expect(useStore.getState().readmeLru["devos"]).toBeDefined();
  });

  it("surfaces a failed request in the panel and re-stores on retry", async () => {
    fetchMock.mockImplementationOnce(async () => ({
      ok: false,
      status: 502,
      json: async () => META,
    }));

    render(<BrowserApp windowId="w1" />);
    await openProjectTab("w1", "devos");
    fireEvent.click(screen.getByRole("button", { name: /toggle side panel/i }));
    await flush();

    expect(screen.getByRole("alert")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(useStore.getState().metaLru["devos"]).toBeDefined();
    expect(useStore.getState().readmeLru["devos"]).toBeDefined();
  });

  it("makes the browser window a query container and switches the content zone by width", () => {
    render(<BrowserApp windowId="w1" />);

    // The container is the BROWSER WINDOW's content area, so the rail /
    // drawer switch follows the window (resizable) — not the viewport.
    const shell = document.querySelector(".browser-shell");
    expect(shell?.className).toContain("@container");

    const zone = document.querySelector(".browser-content-zone");
    expect(zone?.className).toContain("flex-row");
    expect(zone?.className).toContain("@max-[560px]:flex-col");
  });
});
