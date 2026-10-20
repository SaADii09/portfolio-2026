import { test, expect, type Page } from "@playwright/test";
import { gotoApp } from "./utils";

/**
 * DevOS Browser e2e matrix (Task 12).
 *
 * The Browser is the singleton OS window the "Projects" launchers open
 * (spec §7): a Chrome-like tab strip over a warm-tail content router
 * (active + 2 MRU tabs stay mounted) with a project side panel beside it.
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

/** The window whose body is the legacy Projects list (must never open now). */
function legacyProjectsWindow(page: Page) {
  return page
    .locator(".os-window-enter")
    .filter({ has: page.locator("h2", { hasText: /^Projects$/ }) });
}

/** Open the DevOS Browser through the "Projects" desktop icon. */
async function openBrowser(page: Page): Promise<void> {
  await page.getByTitle("Open Projects").dblclick();
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

  test("the Projects desktop icon opens the Browser window (not a Projects window)", async ({
    page,
  }) => {
    await openBrowser(page);

    // The launcher routes "Projects" into the Browser singleton: the window
    // that opens is titled "Browser" and carries the browser shell.
    await expect(browserWindow(page)).toBeVisible();
    await expect(page.getByRole("tablist", { name: "Browser tabs" })).toBeVisible();

    // The legacy Projects list window must NOT be what opened.
    await expect(legacyProjectsWindow(page)).toHaveCount(0);

    // The window opens with exactly one tab — the home tab — and it is active.
    await expect(tabs(page)).toHaveCount(1);
    await expect(page.getByRole("tab", { name: "Home" })).toHaveAttribute("aria-selected", "true");
    await expect(panels(page)).toHaveCount(1);
  });

  test("a project card opens a project tab and the side panel shows the mocked meta", async ({
    page,
  }) => {
    const calls = await mockProjectMeta(page);
    await openBrowser(page);

    await page.getByRole("button", { name: /DevOS Portfolio/ }).click();

    // A project tab joined the strip and took over.
    await expect(page.getByRole("tab", { name: "devos" })).toBeVisible();
    await expect(tabs(page)).toHaveCount(2);
    await expect(page.getByRole("tab", { name: "devos" })).toHaveAttribute("aria-selected", "true");

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

    // Four project tabs on top of the home tab. The cards live on the HOME
    // tab, so the flow is home → card → home → card … (the home tab stays
    // mounted, hidden, while a project tab is active).
    for (const card of [
      /DevOS Portfolio/,
      /AI Job Portal/,
      /SaaS CRM Platform/,
      /API Automation/,
    ]) {
      await page.getByRole("tab", { name: "Home" }).click();
      await page.getByRole("button", { name: card }).click();
    }
    await expect(tabs(page)).toHaveCount(5);

    // F1: only the active tab + the 2 most-recent ones stay mounted.
    await expect(panels(page)).toHaveCount(3);

    // One request per slug (the README and the panel share it — N3).
    await expect.poll(() => calls.length).toBe(4);
    const before = calls.length;

    // The OLDEST tab sleeps; clicking it wakes it back up.
    await page.getByRole("tab", { name: "devos" }).click();
    await expect(page.getByRole("tab", { name: "devos" })).toHaveAttribute("aria-selected", "true");
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
    // budget stays under the WebView watchdog (3500ms) on purpose.
    await expect(page.getByText(/can't be embedded/i)).toBeVisible({ timeout: 3_000 });

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

    // Two project tabs, opened from the home tab's grid.
    await page.getByRole("button", { name: /DevOS Portfolio/ }).click();
    await page.getByRole("tab", { name: "Home" }).click();
    await page.getByRole("button", { name: /AI Job Portal/ }).click();
    await expect(tabs(page)).toHaveCount(3);

    // Re-activate the first project tab, so the most-recently-used tab
    // behind it is the second one.
    await page.getByRole("tab", { name: "devos" }).click();
    await expect(page.getByRole("tab", { name: "devos" })).toHaveAttribute("aria-selected", "true");

    // Closing the active tab hands the baton to the most-recently-used tab.
    await page.getByRole("button", { name: "Close devos" }).click();
    await expect(page.getByRole("tab", { name: "devos" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "ai-job-portal" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // Closing that one lands back on the home tab, and its content is shown.
    await page.getByRole("button", { name: "Close ai-job-portal" }).click();
    await expect(page.getByRole("tab", { name: "ai-job-portal" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Home" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("button", { name: /DevOS Portfolio/ })).toBeVisible();
  });
});
