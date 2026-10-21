import { test, expect, type Page } from "@playwright/test";
import { gotoApp } from "./utils";

/**
 * DevOS Browser e2e matrix (real-web reconciliation, spec D6/D7/D8).
 *
 * The Browser is a STAND-ALONE app (spec D7): its own desktop icon opens the
 * `type:"browser"` singleton; the Projects desktop icon opens the Projects
 * window again, and a project card THERE launches a browser tab. A
 * Chrome-like tab strip rides over a warm-tail content router (active + 2
 * MRU tabs stay mounted) with a project side panel beside it, and the home
 * tab is the Chrome-classic start page (greeting, shortcut tiles, recently
 * visited chips, compact "Your live projects" rows — spec D6).
 *
 * Determinism rules for this file:
 * - `/api/project-meta` is ROUTE-MOCKED with a fixed ProjectMeta, so the side
 *   panel's rows and the README body never depend on GitHub's rate limits.
 * - `/api/screenshot` is ROUTE-MOCKED with a 1×1 png, so the fallback panel
 *   never calls Microlink.
 * - The typed site is route-STALLED (never fulfilled), so the embedded frame
 *   stays mounted and the pin can observe it deterministically.
 *
 * Chromium only (the matrix's reference engine) — the other engines run the
 * OS-level specs that guard the shared window chrome.
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

/** The 1×1 png the mocked /api/screenshot route serves. */
const PNG_1X1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/**
 * Mock /api/project-meta and collect the intercepted request URLs — the
 * counter is what proves the network-free wake (F2) and the single-request
 * rule (N3).
 */
async function mockProjectMeta(page: Page): Promise<string[]> {
  const calls: string[] = [];
  await page.route("**/api/project-meta*", (route) => {
    calls.push(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(PROJECT_META),
    });
  });
  return calls;
}

/** Mock /api/screenshot so the fallback panel never reaches Microlink. */
async function mockScreenshot(page: Page): Promise<void> {
  await page.route("**/api/screenshot*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(PNG_1X1_BASE64, "base64"),
    }),
  );
}

/** The Browser OS window — the only window whose title is "Browser". */
function browserWindow(page: Page) {
  return page
    .locator(".os-window-enter")
    .filter({ has: page.locator("span.font-display", { hasText: /^Browser$/ }) });
}

/** The Projects registry window (the project-list window the Projects icon opens). */
function projectsRegistryWindow(page: Page) {
  return page
    .locator(".os-window-enter")
    .filter({ has: page.locator("h2", { hasText: /^Projects$/ }) });
}

/** Open the DevOS Browser through the "Browser" desktop icon. */
async function openBrowser(page: Page): Promise<void> {
  await page.getByTitle("Open Browser").dblclick();
  await expect(page.getByRole("tablist", { name: "Browser tabs" })).toBeVisible();
}

/** The tab strip's tab buttons. */
function tabs(page: Page) {
  return page.getByRole("tab");
}

/** The mounted tab content panels (the warm tail). */
function panels(page: Page) {
  return page.locator(".browser-tab-panel");
}

/** The panel of the ACTIVE tab (the only one without the hidden attribute). */
function activePanel(page: Page) {
  return page.locator(".browser-tab-panel:not([hidden])");
}

test.describe("DevOS Browser", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "chromium only");

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await gotoApp(page);
  });

  test("the Browser desktop icon opens the Browser singleton (not a Projects window)", async ({
    page,
  }) => {
    // Both launcher icons exist — the count-0 probe below would be vacuous if
    // the wrong icon were clicked, so the Projects icon is pinned present
    // before the Browser icon is chosen.
    const projectsIcon = page.getByTitle("Open Projects");
    await expect(projectsIcon).toBeVisible();
    await openBrowser(page);

    // The launcher routes the "Browser" icon into the browser singleton: the
    // window that opens is titled "Browser" and carries the browser shell.
    await expect(browserWindow(page)).toBeVisible();
    await expect(page.getByRole("tablist", { name: "Browser tabs" })).toBeVisible();

    // The Projects window must NOT be what this icon opened (the count-0
    // probes the "Open Browser" click above).
    await expect(projectsRegistryWindow(page)).toHaveCount(0);

    // The window opens with exactly one tab — the home tab — and it is active.
    await expect(tabs(page)).toHaveCount(1);
    await expect(page.getByRole("tab", { name: "Home" })).toHaveAttribute("aria-selected", "true");
    await expect(panels(page)).toHaveCount(1);
  });

  test("the Projects desktop icon opens the Projects window and its card opens a browser project tab", async ({
    page,
  }) => {
    // Route-mocked: the project tab's README must never reach GitHub.
    await mockProjectMeta(page);

    await page.getByTitle("Open Projects").dblclick();
    await expect(projectsRegistryWindow(page)).toBeVisible();

    // The card routes into the browser singleton via openBrowser(slug)…
    await projectsRegistryWindow(page)
      .getByRole("button", { name: /DevOS Portfolio/ })
      .click();

    // …and the browser window opens with a project tab on top of home.
    await expect(browserWindow(page)).toBeVisible();
    await expect(tabs(page)).toHaveCount(2);
    await expect(page.getByRole("tab", { name: "DevOS Portfolio" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("a row on the start page opens a project tab and the side panel shows the mocked meta", async ({
    page,
  }) => {
    const calls = await mockProjectMeta(page);
    await openBrowser(page);

    // The "DevOS Portfolio" compact row on the start page opens the project
    // tab (the home no longer carries the project grid — spec D6).
    await page.getByRole("button", { name: /DevOS Portfolio/ }).click();

    // A project tab joined the strip and took over. The tab is named by the
    // PROJECT TITLE — "DevOS Portfolio" is also a substring of no other tab
    // name, and unlike "devos" it cannot pass against the pre-15.1 slug
    // title (Playwright's name matching is substring + case-insensitive).
    await expect(page.getByRole("tab", { name: "DevOS Portfolio" })).toBeVisible();
    await expect(tabs(page)).toHaveCount(2);
    await expect(page.getByRole("tab", { name: "DevOS Portfolio" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // The side panel is closed by default — the toolbar toggle opens it.
    await page.getByRole("button", { name: "Toggle side panel" }).click();
    const panel = page.getByLabel("Project details");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading", { name: "DevOS Portfolio" })).toBeVisible();

    // The MOCKED timeline rows render (the panel is fed by the mocked route).
    const timeline = page.getByLabel("Timeline");
    await expect(timeline.getByText("Created")).toBeVisible();
    await expect(timeline.getByText("Jan 2024")).toBeVisible();
    await expect(timeline.getByText("Updated")).toBeVisible();
    await expect(timeline.getByText("Mar 2024")).toBeVisible();

    // The README body renders from the SAME response (one request, two caches).
    await expect(page.getByText("Mocked readme body for the browser pin.")).toBeVisible();
    expect(calls.length, "one /api/project-meta request per slug").toBe(1);
  });

  test("the warm tail keeps 3 panels mounted and the oldest tab wakes network-free", async ({
    page,
  }) => {
    const calls = await mockProjectMeta(page);
    await openBrowser(page);

    // Four project tabs on top of the home tab. The rows live on the HOME
    // tab's start page ("Your live projects" compact row), so the flow is
    // home → row → home → row … (the home tab stays mounted, hidden, while a
    // project tab is active).
    for (const row of [/DevOS Portfolio/, /AI Job Portal/, /SaaS CRM Platform/, /API Automation/]) {
      await page.getByRole("tab", { name: "Home" }).click();
      await page.getByRole("button", { name: row }).click();
    }
    await expect(tabs(page)).toHaveCount(5);

    // F1: only the active tab + the 2 most-recent ones stay mounted.
    await expect(panels(page)).toHaveCount(3);

    // One request per slug (the README and the panel share it — N3).
    await expect.poll(() => calls.length).toBe(4);
    const before = calls.length;

    // The OLDEST tab sleeps; clicking it wakes it back up.
    await page.getByRole("tab", { name: "DevOS Portfolio" }).click();
    await expect(page.getByRole("tab", { name: "DevOS Portfolio" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(panels(page)).toHaveCount(3);

    // F2: the wake costs ZERO network — both slice caches were already warm.
    await page.waitForTimeout(1_000);
    expect(calls.length, "the wake must not re-request the project meta").toBe(before);
  });

  test("a blocked tile opens the fallback panel with no iframe at all", async ({ page }) => {
    await mockScreenshot(page);
    await openBrowser(page);

    await page.getByRole("button", { name: "Google", exact: true }).click();

    // The web tab opens…
    await expect(page.getByRole("tab", { name: "Google" })).toBeVisible();

    // …and the blocked tile renders the fallback panel INSTANTLY (the iframe
    // pipeline is skipped entirely, so there is no blank-frame flash). The
    // D4 copy names the host and promises a live preview. The budget stays
    // under the WebView watchdog (3500ms) on purpose.
    await expect(page.getByText(/www\.google\.com blocks embedding/)).toBeVisible({
      timeout: 3_000,
    });

    // A host-blocked tile had NO iframe attempt — the Retry affordance must
    // not exist (it renders only when onRetry is provided).
    await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);

    // The blocked tile NEVER mounts an iframe — not in its panel, not anywhere
    // in the browser window.
    await expect(activePanel(page).locator("iframe")).toHaveCount(0);
    await expect(page.locator(".browser-tab-panel iframe")).toHaveCount(0);
  });

  test("the address bar opens a web tab that embeds the site in an iframe", async ({ page }) => {
    await openBrowser(page);

    // The typed site is route-STALLED (the handler never fulfils): the frame
    // stays mounted, so the pin observes the embed deterministically instead
    // of racing the WebView probe (which classifies cross-origin frames as
    // refusals a beat after the load event).
    await page.route(/^https:\/\/en\.wikipedia\.org\/?$/, () => {
      /* deliberately stalled — see the comment above */
    });

    const address = page.getByLabel("Address bar");
    await address.fill("https://en.wikipedia.org");
    await address.press("Enter");

    // A web tab named after the host opens…
    await expect(page.getByRole("tab", { name: "en.wikipedia.org" })).toBeVisible();

    // …and the site is embedded in an iframe inside that tab's panel.
    await expect(activePanel(page).locator('iframe[title="Website preview"]')).toHaveCount(1, {
      timeout: 2_500,
    });
  });

  test("closing a tab activates the previous one and lands back on the home tab", async ({
    page,
  }) => {
    await mockProjectMeta(page);
    await openBrowser(page);

    // Two project tabs, opened from the home tab's compact "Your live
    // projects" rows.
    await page.getByRole("button", { name: /DevOS Portfolio/ }).click();
    await page.getByRole("tab", { name: "Home" }).click();
    await page.getByRole("button", { name: /AI Job Portal/ }).click();
    await expect(tabs(page)).toHaveCount(3);

    // Re-activate the first project tab, so the most-recently-used tab
    // behind it is the second one.
    await page.getByRole("tab", { name: "DevOS Portfolio" }).click();
    await expect(page.getByRole("tab", { name: "DevOS Portfolio" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // Closing the active tab hands the baton to the most-recently-used tab.
    await page.getByRole("button", { name: "Close DevOS Portfolio" }).click();
    await expect(page.getByRole("tab", { name: "DevOS Portfolio" })).toHaveCount(0);
    // The tab is named by the PROJECT TITLE (not the slug) since Lane B —
    // the close button's name is pinned the same way above.
    await expect(page.getByRole("tab", { name: "AI Job Portal" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // Closing that one lands back on the home tab, and its content is shown.
    await page.getByRole("button", { name: "Close AI Job Portal" }).click();
    await expect(page.getByRole("tab", { name: "AI Job Portal" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Home" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("button", { name: /DevOS Portfolio/ })).toBeVisible();
  });

  test("closing the LAST tab lands on a freshly seeded home tab (never the blank shell)", async ({
    page,
  }) => {
    await openBrowser(page);

    // Open a project tab from the compact row, then close the home tab so
    // exactly one tab remains. (Attritional closes like the test above never
    // empty the tab list — home survives them — so the D8 reseed needs the
    // home tab itself to go first.)
    await page.getByRole("button", { name: /DevOS Portfolio/ }).click();
    await page.getByRole("tab", { name: "Home" }).click();
    await page.getByRole("button", { name: "Close Home" }).click();
    await expect(page.getByRole("tab", { name: "Home" })).toHaveCount(0);
    await expect(tabs(page)).toHaveCount(1);
    await expect(page.getByRole("tab", { name: "DevOS Portfolio" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // The LAST-tab close: the slice dissolves the record and reseeds Home
    // (the blank `<div className="h-full" />` cold shell is unreachable).
    await page.getByRole("button", { name: "Close DevOS Portfolio" }).click();
    await expect(page.getByRole("tab", { name: "DevOS Portfolio" })).toHaveCount(0);
    await expect(tabs(page)).toHaveCount(1);
    await expect(page.getByRole("tab", { name: "Home" })).toHaveAttribute("aria-selected", "true");

    // The seeded tab is the real start page (its content shows), not a shell.
    await expect(page.getByRole("heading", { name: "Your live projects" })).toBeVisible();
    await expect(page.getByRole("button", { name: /DevOS Portfolio/ })).toBeVisible();
  });
});
