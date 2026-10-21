import { test, expect, type Page } from "@playwright/test";
import { gotoApp } from "./utils";

/**
 * DevOS Browser — the two wild paths only a REAL browser can prove (Task D1).
 *
 * 1. RELOAD PERSISTENCE (review focus 2): a persisted `type:"browser"` window
 *    must re-hydrate into a USABLE browser shell — the tab strip renders (not
 *    the cold `<div className="h-full" />` frame) and a project tab still
 *    opens. The window is seeded through the persisted store; before the
 *    reload the test proves the APP re-serialized that blob (keys the seed
 *    never wrote appear via `persistPartialize`), so the reload hydrates
 *    from the app's own write, not the seed's bytes.
 * 2. THE CONTAINER-QUERY FLIP (review focus 3): the side panel is a 264px
 *    RIGHT RAIL in a 960px-wide browser window and a FULL-WIDTH BOTTOM
 *    DRAWER in a 480px-wide one. The switch is a CSS container query on the
 *    browser WINDOW's own content width — jsdom evaluates no container
 *    queries, so only a real browser can pin it.
 *
 * Determinism rules (mirroring e2e/browser.spec.ts):
 * - `/api/project-meta` is ROUTE-MOCKED, so the side panel's rows never
 *   depend on GitHub's rate limits.
 * - The window geometry under test is SEEDED, never dragged — a drag would
 *   make the container width a function of the pointer, and Firefox's
 *   interpolated mouse steps are known to land outside the viewport.
 *
 * Chromium only (the matrix's reference engine).
 */

const VIEWPORT = { width: 1440, height: 900 };

/** The fixed ProjectMeta the mocked /api/project-meta route answers with. */
const PROJECT_META = {
  slug: "devos",
  readmeHtml: "<h1>Mocked README</h1><p>Mocked readme body for the browser pin.</p>",
  degraded: false,
  timeline: [
    { label: "Created", period: "Jan 2024" },
    { label: "Updated", period: "Mar 2024" },
  ],
  language: "TypeScript",
  stars: 42,
  homepage: "https://portfolio-2026-sp9k.vercel.app",
  createdAt: "2024-01-01T00:00:00Z",
  pushedAt: "2024-03-01T00:00:00Z",
};

/** Mock /api/project-meta so the panel never reaches GitHub. */
async function mockProjectMeta(page: Page): Promise<void> {
  await page.route("**/api/project-meta*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(PROJECT_META),
    }),
  );
}

/**
 * The persisted window record the seed writes — ONE browser window.
 *
 * The shape mirrors the persisted `WindowInstance` (the store's persisted
 * Pick carries `windows` verbatim) and the proven `addInitScript` seeds in
 * e2e/window-lifecycle.spec.ts. `x`/`y` are CONTENT-ZONE-relative store
 * coordinates (the painted top is `y + topBar`).
 *
 * Two keys mount the browser, and they do different jobs:
 * - `component: "browser"` picks the RENDERER (`APP_RENDERERS`) — this is what
 *   puts the tab strip on screen. Change it and the shell is gone.
 * - `type: "browser"` picks the CLOSE path (`windowSlice.closeWindow` releases
 *   the browser slice record for a `type === "browser"` window).
 */
function seededBrowserWindow(width: number) {
  return {
    id: "bw1",
    title: "Browser",
    type: "browser",
    component: "browser",
    x: 120,
    y: 0,
    width,
    height: 660,
    zIndex: 101,
    opacity: 1,
    isMinimized: false,
    isMaximized: false,
    isPinned: false,
  };
}

/**
 * Seeds the persisted store with one browser window of the given width.
 *
 * The seed is injected ONCE per tab: a sessionStorage flag (which survives a
 * reload but not a new tab) turns the init script into a no-op on the SECOND
 * load. Without that guard the script would re-inject the window on every
 * navigation, and the reload assertion would prove nothing about the app's
 * own persistence — the window would simply be re-seeded.
 */
async function seedBrowserWindow(page: Page, width: number): Promise<void> {
  const seed = { state: { windows: [seededBrowserWindow(width)] }, version: 1 };
  await page.addInitScript((payload) => {
    if (window.sessionStorage.getItem("devos-e2e-seeded") === "1") return;
    window.sessionStorage.setItem("devos-e2e-seeded", "1");
    window.localStorage.setItem("devos-store", JSON.stringify(payload));
  }, seed);
}

/**
 * The window ids currently in the persisted blob. NOTE: the seed writes the
 * SAME key (`devos-store`) with ONLY `windows`, so this alone cannot tell
 * the app's persist write from the seed's bytes — the app-written-keys
 * assertion below the boot is what proves the blob was re-serialized by the
 * APP before the reload hydrates from it.
 */
async function persistedWindowIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("devos-store");
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as { state?: { windows?: { id?: string }[] } };
    return (parsed.state?.windows ?? []).map((win) => win.id ?? "");
  });
}

/** The `state` keys currently in the persisted blob. */
async function persistedStateKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("devos-store");
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
    return Object.keys(parsed.state ?? {});
  });
}

/** The browser's content zone — the tab router and the side panel share it. */
function contentZone(page: Page) {
  return page.locator(".browser-content-zone");
}

/** The ACTIVE tab's panel (the only `.browser-tab-panel` without `hidden`). */
function activePanel(page: Page) {
  return page.locator(".browser-tab-panel:not([hidden])");
}

/** The project side panel (the right rail in a wide window, the drawer otherwise). */
function sidePanel(page: Page) {
  return page.getByLabel("Project details");
}

/** The panel's box and the content zone's box, in viewport coordinates. */
async function panelGeometry(page: Page): Promise<{
  zoneBox: { x: number; y: number; width: number; height: number };
  panelBox: { x: number; y: number; width: number; height: number };
}> {
  const zoneBox = await contentZone(page).boundingBox();
  const panelBox = await sidePanel(page).boundingBox();
  if (zoneBox === null || panelBox === null) {
    throw new Error("the browser shell or the side panel has no box");
  }
  return { zoneBox, panelBox };
}

/**
 * Opens the DevOS Portfolio project tab from the compact "Your live projects"
 * row on the home tab's start page (spec D6 — the home carries rows now, not
 * the old project grid).
 *
 * The row locator is scoped to the ACTIVE tab panel: once a DevOS tab is
 * open, the tab strip's close button ("Close DevOS Portfolio") also matches
 * the /DevOS Portfolio/ name, and the strip sits OUTSIDE every
 * `.browser-tab-panel`. The row button's accessible name ("DevOS Portfolio +
 * host + yours badge") is unique within its panel — the row's external
 * "Open DevOS Portfolio in a new tab" affordance is a link, not a button —
 * so the scoped locator stays single-match (strict mode) in every caller.
 */
async function openDevosProjectTab(page: Page): Promise<void> {
  await activePanel(page)
    .getByRole("button", { name: /DevOS Portfolio/ })
    .click();
  await expect(page.getByRole("tab", { name: "DevOS Portfolio" })).toBeVisible();
}

test.describe("DevOS Browser — reload + container query", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "chromium only");
  test.use({ viewport: VIEWPORT });

  test("a persisted browser window rehydrates into a usable shell and survives a reload", async ({
    page,
  }) => {
    await mockProjectMeta(page);
    await seedBrowserWindow(page, 960);
    await gotoApp(page);

    // The rehydrated window is a REAL browser shell: the tab strip renders.
    // (The cold frame is a bare `<div className="h-full" />` — no tablist.)
    await expect(page.getByRole("tablist", { name: "Browser tabs" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Home" })).toHaveAttribute("aria-selected", "true");

    // A project tab opens from the compact "Your live projects" row on the
    // start page (the tab is named by TITLE).
    await openDevosProjectTab(page);

    // The side panel toggles open for the project tab.
    await page.getByRole("button", { name: "Toggle side panel" }).click();
    await expect(sidePanel(page)).toBeVisible();

    // The APP re-serialized the persisted blob. The seed wrote ONLY
    // `state.windows`, so the id poll below cannot by itself distinguish the
    // app's persist write from the seed's bytes — but `persistPartialize`
    // always emits ALL persisted keys, and these five were never in the
    // seed. Their presence proves the store's own write landed (the boot's
    // `openBrowserWindow` re-seed is a setState → persist setItem).
    await expect
      .poll(async () => persistedStateKeys(page))
      .toEqual(
        expect.arrayContaining(["theme", "widgets", "lastGeometry", "volume", "currentTrack"]),
      );

    // The APP persisted the window into that same blob — the reload below
    // hydrates from THIS write (the init script does not re-seed: the
    // sessionStorage guard is set).
    await expect.poll(async () => persistedWindowIds(page)).toContain("bw1");

    await page.reload();
    await page.locator(".boot-overlay").waitFor({ state: "detached", timeout: 30_000 });

    // The window survived the reload and the home tab re-seeded. The browser
    // slice is deliberately NOT persisted, so the project tab is gone.
    await expect(page.getByRole("tablist", { name: "Browser tabs" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Home" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "DevOS Portfolio" })).toHaveCount(0);

    // The rehydrated shell is still usable: a project tab opens and the panel
    // toggles (the panel's open state is not persisted either).
    await openDevosProjectTab(page);
    await page.getByRole("button", { name: "Toggle side panel" }).click();
    await expect(sidePanel(page)).toBeVisible();
  });

  test("a narrowed browser window renders the side panel as a full-width bottom drawer", async ({
    page,
  }) => {
    await mockProjectMeta(page);
    await seedBrowserWindow(page, 480);
    await gotoApp(page);

    await openDevosProjectTab(page);

    // The panel is CLOSED by default — the toolbar toggle opens it.
    await expect(sidePanel(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Toggle side panel" }).click();
    await expect(sidePanel(page)).toBeVisible();

    const { zoneBox, panelBox } = await panelGeometry(page);

    // The premise: the browser WINDOW's own content width is under the 560px
    // container breakpoint (a 480px window minus the retro chrome border and
    // the content padding lands at ≈442px).
    expect(zoneBox.width).toBeLessThan(560);

    // The drawer sits BELOW the tab content …
    expect(panelBox.y).toBeGreaterThan(zoneBox.y);

    // … and spans the FULL content width (a bottom drawer, not a rail).
    expect(Math.abs(panelBox.width - zoneBox.width)).toBeLessThanOrEqual(1);
  });

  test("the default-width browser window renders the side panel as a 264px right rail", async ({
    page,
  }) => {
    await mockProjectMeta(page);
    await seedBrowserWindow(page, 960);
    await gotoApp(page);

    await openDevosProjectTab(page);

    await page.getByRole("button", { name: "Toggle side panel" }).click();
    await expect(sidePanel(page)).toBeVisible();

    const { zoneBox, panelBox } = await panelGeometry(page);

    // The premise: the container is over the 560px breakpoint, so the panel
    // stays the right rail.
    expect(zoneBox.width).toBeGreaterThanOrEqual(560);

    // The rail sits to the RIGHT of the tab content …
    expect(panelBox.x).toBeGreaterThan(zoneBox.x);

    // … and is exactly 264px wide (the rail width; the 45% cap is looser).
    expect(Math.abs(panelBox.width - 264)).toBeLessThanOrEqual(1);
  });
});
