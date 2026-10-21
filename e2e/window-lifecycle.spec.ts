import { test, expect, type Page } from "@playwright/test";
import { gotoApp } from "./utils";

test.describe("Window lifecycle", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test("opens About app from desktop icon", async ({ page }) => {
    await page.getByTitle("Open About Me").dblclick();
    await expect(page.getByRole("heading", { name: "About Me" })).toBeVisible();
  });

  test("opens the Browser and the Projects window from their own desktop icons", async ({
    page,
  }) => {
    // Identity split (real-web round, C3): each launcher now opens its OWN
    // window — the globe icon opens the Browser singleton, the folder icon
    // opens the Projects window. (The pre-split reality — "Projects" routing
    // into the browser — is gone.)
    await page.getByTitle("Open Browser").dblclick();
    // The globe icon opens the window titled "Browser" with the tab strip.
    await expect(
      page
        .locator(".os-window-enter")
        .filter({ has: page.locator("span.font-display", { hasText: /^Browser$/ }) }),
    ).toBeVisible();
    await expect(page.getByRole("tablist", { name: "Browser tabs" })).toBeVisible();
    // The Projects window must not be what the Browser icon opened.
    await expect(
      page
        .locator(".os-window-enter")
        .filter({ has: page.locator("span.font-display", { hasText: /^Projects$/ }) }),
    ).toHaveCount(0);

    await page.getByTitle("Open Projects").dblclick();
    // The folder icon opens the Projects registry window: its own "Projects"
    // window surface with the project grid inside (not a browser shell).
    await expect(
      page
        .locator(".os-window-enter")
        .filter({ has: page.locator("span.font-display", { hasText: /^Projects$/ }) }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
  });

  test("opens About app from desktop icon via keyboard", async ({ page }) => {
    // Press evaluates (focuses) the locator target first, so no explicit focus
    // call is needed; a keyboard "click" has event.detail === 0 in every engine.
    await page.getByTitle("Open About Me").press("Enter");
    await expect(page.getByRole("heading", { name: "About Me" })).toBeVisible();
  });

  test("opens Settings app from desktop icon", async ({ page }) => {
    await page.getByTitle("Open Settings").dblclick();
    await expect(page.getByRole("heading", { name: "Theme" })).toBeVisible();
  });

  test("dock shows an icon for each open window", async ({ page }) => {
    await page.getByTitle("Open About Me").dblclick();
    await expect(page.getByLabel("About Me")).toBeVisible();

    // Close About before opening Projects: the About window anchors wide
    // enough to occlude the desktop icon grid, which would make the next
    // double-click land on the window surface instead of the icon.
    await page.getByLabel("Close").first().click();
    await expect(page.getByLabel("About Me")).not.toBeVisible();

    await page.getByTitle("Open Projects").dblclick();
    // The dock icon carries the OPEN WINDOW's title — the Projects launcher
    // now opens the Projects WINDOW again (identity split), so the icon row
    // reads "Projects". (A bare getByLabel("Projects") could also match the
    // browser home tab's <section aria-label="Your live projects"> substring
    // on other queries, so the exact-name match keeps this pinned to the
    // dock icon itself; the window surfaces carry no label "Projects".)
    await expect(page.getByLabel("Projects", { exact: true })).toBeVisible();

    // Close the Projects window before opening the browser so the double-click
    // below tracks the dock's second icon without window occlusion.
    await page.getByLabel("Close").first().click();
    await expect(page.getByLabel("Projects", { exact: true })).not.toBeVisible();

    await page.getByTitle("Open Browser").dblclick();
    // The dock icon for the browser singleton reads "Browser".
    await expect(page.getByLabel("Browser", { exact: true })).toBeVisible();
  });

  test("window close button removes window and dock icon", async ({ page }) => {
    await page.getByTitle("Open About Me").dblclick();
    const heading = page.getByRole("heading", { name: "About Me" });
    await expect(heading).toBeVisible();

    await page.getByLabel("Close").first().click();
    await expect(heading).not.toBeVisible();
    await expect(page.getByLabel("About Me")).not.toBeVisible();
  });
});

// First context-menu coverage in this file. Click point (400, 300) is empty
// desktop: icons live in a top-left column, widgets hug the right edge.
test.describe("Context menu (keyboard)", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await page.mouse.click(400, 300, { button: "right" });
    await expect(page.getByRole("menuitem", { name: "Refresh" })).toBeVisible();
  });

  test("Escape closes the desktop context menu without side effects", async ({ page }) => {
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menuitem")).toHaveCount(0);
  });

  test("ArrowDown + Enter selects a menu item and runs its action", async ({ page }) => {
    // Roving focus opens on "Refresh"; ArrowDown skips the separator and lands
    // on the first app item ("About Me"). Enter actuates it and opens the app.
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "About Me" })).toBeVisible();
  });
});

// Embed/WebView coverage in this file. Two refusal shapes and one positive
// control, in the post-real-web world: (1) a TYPED refuser host is
// host-classified — the preview renders instantly with no iframe and no
// /api/embed-check call; (2) a genuinely refused frame (the same-origin
// /embed-refusal fixture, XFO DENY via a seeded legacy type:"iframe" window)
// rides the WebView probe and decides LOCALLY — the panel keeps the probe
// path's Retry and still makes zero server calls; (3) the "embeddable"
// positive control is per the hardening ruling: page.route-fulfilled
// same-origin HTML, not a real external project URL. No page-mouse drags
// here (Playwright 1.64.1 Firefox interpolates off-viewport mouse moves) —
// only iframe loads and waits.
test.describe("WebView embed refusal fallback", () => {
  const PNG_1X1_BASE64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

  /** The fixed ProjectMeta the mocked /api/project-meta route answers with. */
  const PROJECT_META = {
    slug: "devos",
    readmeHtml: "<h1>Mocked README</h1><p>Mocked readme body for the lifecycle pin.</p>",
    degraded: false,
    timeline: [{ label: "Created", period: "Jan 2024" }],
    language: "TypeScript",
    stars: 42,
    homepage: "https://portfolio-2026-sp9k.vercel.app",
    createdAt: "2024-01-01T00:00:00Z",
    pushedAt: "2024-03-01T00:00:00Z",
  };

  /**
   * Mocks /api/embed-check and records the intercepted calls — the counter is
   * what proves a refusal was decided WITHOUT a server round trip (host
   * classification and the same-origin local decision both skip the route).
   */
  async function mockEmbedCheck(page: Page): Promise<string[]> {
    const calls: string[] = [];
    await page.route("**/api/embed-check*", (route) => {
      calls.push(route.request().url());
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ embeddable: false, reason: "x-frame-options" }),
      });
    });
    return calls;
  }

  test.beforeEach(async ({ page }) => {
    // The suite must never touch Microlink: /api/screenshot answers with a
    // 1×1 png (this covers Task 5's image contract the <img> consumes).
    await page.route("**/api/screenshot*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/png",
        body: Buffer.from(PNG_1X1_BASE64, "base64"),
      }),
    );
  });

  /** Open the DevOS Browser through its own desktop icon (identity split). */
  async function openBrowserViaIcon(page: Page): Promise<void> {
    await page.getByTitle("Open Browser").dblclick();
    await expect(page.getByRole("tablist", { name: "Browser tabs" })).toBeVisible();
  }

  /** Types a url into the browser's address bar and submits it. */
  async function typeAddress(page: Page, url: string): Promise<void> {
    const address = page.getByLabel("Address bar");
    await address.fill(url);
    await address.press("Enter");
  }

  test("a project card opens a project tab with the project content (no iframe window)", async ({
    page,
  }) => {
    // The project-meta route is mocked so the README body never depends on
    // GitHub's rate limits.
    await page.route("**/api/project-meta*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(PROJECT_META),
      }),
    );
    await gotoApp(page);

    // The globe icon opens the Browser singleton (identity split); the home
    // tab is its start page, where the compact "Your live projects" row
    // replaced the old project grid.
    await page.getByTitle("Open Browser").dblclick();
    await expect(page.getByRole("tablist", { name: "Browser tabs" })).toBeVisible();
    // The compact row's card (title + host + badge) — not a grid card.
    await page.getByRole("button", { name: /DevOS Portfolio/ }).click();

    // The row opens a project TAB inside the browser window…
    await expect(page.getByRole("tab", { name: "DevOS Portfolio" })).toBeVisible();
    // …and one grew next to the home tab.
    await expect(page.getByRole("tab")).toHaveCount(2);
    // …showing the project content…
    await expect(page.getByText("Mocked readme body for the lifecycle pin.")).toBeVisible();
    // …and NOT a second OS window holding an iframe (the legacy
    // iframe-window producer is gone).
    await expect(page.locator(".os-window-enter")).toHaveCount(1);
    await expect(page.locator('iframe[title="Website preview"]')).toHaveCount(0);
  });

  test("a typed refuser host renders the preview instantly — no iframe, no server verdict", async ({
    page,
  }) => {
    // github.com is a KNOWN REFUSER HOST (EMBED_BLOCKED_HOSTS): host
    // classification, so no iframe is ever mounted and /api/embed-check (the
    // mock answers "blocked" on purpose — a single call would prove the
    // client leaked the local case to the server) must stay silent.
    const checkCalls = await mockEmbedCheck(page);
    await gotoApp(page);
    await openBrowserViaIcon(page);

    await typeAddress(page, "https://github.com/SaADii09/portfolio-2026");

    // The web tab opens (titled by the host) and the preview panel appears
    // instantly — well inside the old watchdog window's budget.
    await expect(page.getByRole("tab", { name: "github.com" })).toBeVisible();
    await expect(page.getByText(/blocks embedding/i)).toBeVisible({ timeout: 6500 });

    // No iframe anywhere in the tab router — host-blocked tabs skip the
    // embed pipeline entirely.
    await expect(page.locator(".browser-tab-panel iframe")).toHaveCount(0);
    await expect(page.locator('iframe[title="Website preview"]')).toHaveCount(0);

    // The live preview card points at the EXACT typed url… (the panel never
    // reached Microlink — the route mock answers the img request).
    const shot = page.locator("img[src*='/api/screenshot']");
    await expect(shot).toBeVisible();
    await expect(shot).toHaveAttribute(
      "src",
      `/api/screenshot?url=${encodeURIComponent("https://github.com/SaADii09/portfolio-2026")}`,
    );

    // …and ZERO /api/embed-check calls: the host was classified locally.
    expect(checkCalls.length, "no embed-check round trip for a blocked host").toBe(0);
  });

  test("a genuinely refusing frame keeps the probe path — local decision, no server verdict", async ({
    page,
  }) => {
    // The refusal UI's real teeth ride the legacy persisted-iframe window
    // (type:"iframe" still renders WebView): the /embed-refusal fixture is
    // SAME-ORIGIN (relative url) and served with XFO DENY + frame-ancestors
    // 'none', so the WebView probe observes an unreadable same-origin commit
    // and decides LOCALLY — the preview must carry the probe path's Retry
    // affordance (host-blocked tabs render the panel without one) and zero
    // embed-check calls.
    const checkCalls = await mockEmbedCheck(page);

    // Seed a persisted legacy iframe window (addInitScript runs ahead of
    // hydration and of the app's own persist writes — same pattern as
    // persistence.spec.ts).
    await page.addInitScript(() => {
      const store = JSON.parse(localStorage.getItem("devos-store") || "{}");
      store.state = {
        ...(store.state ?? {}),
        windows: [
          {
            id: "win-e2e-refusal",
            title: "Refused embed",
            type: "iframe",
            url: "/embed-refusal",
            x: 160,
            y: 120,
            width: 560,
            height: 420,
            zIndex: 101,
            opacity: 1,
            isMinimized: false,
            isMaximized: false,
            isPinned: false,
          },
        ],
      };
      localStorage.setItem("devos-store", JSON.stringify(store));
    });
    await gotoApp(page);

    // The preview panel appears (the probe has a 250ms delay after the frame's
    // load, watchdog 3500ms — this must beat headless scheduling).
    await expect(page.getByText(/blocks embedding/i)).toBeVisible({ timeout: 6500 });

    // The refused frame is unmounted — the panel replaced it.
    await expect(page.locator('iframe[title="Website preview"]')).toHaveCount(0);

    // Probe path vs host-blocked: only the WebView pipeline hands the panel
    // an onRetry, so the Retry affordance is the discriminator.
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    const shot = page.locator("img[src*='/api/screenshot']");
    await expect(shot).toBeVisible();
    await expect(shot).toHaveAttribute(
      "src",
      `/api/screenshot?url=${encodeURIComponent("/embed-refusal")}`,
    );

    // A same-origin refusal never consults the server.
    expect(checkCalls.length, "same-origin refusal decides locally").toBe(0);
  });

  test("fulfill-routed embeddable frame settles as ok (no fallback)", async ({ page }) => {
    await page.route("**/embeddable-ok", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body:
          "<html><body><h1>Embeddable preview</h1>" +
          "<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p></body></html>",
      }),
    );
    await gotoApp(page);

    // Seed a persisted iframe window (addInitScript runs ahead of hydration and
    // of the app's own persist writes — same pattern as persistence.spec.ts).
    await page.addInitScript(() => {
      const store = JSON.parse(localStorage.getItem("devos-store") || "{}");
      store.state = {
        ...(store.state ?? {}),
        windows: [
          {
            id: "win-e2e-embeddable",
            title: "Embeddable preview",
            type: "iframe",
            url: "/embeddable-ok",
            x: 120,
            y: 120,
            width: 520,
            height: 400,
            zIndex: 101,
            opacity: 1,
            isMinimized: false,
            isMaximized: false,
            isPinned: false,
          },
        ],
      };
      localStorage.setItem("devos-store", JSON.stringify(store));
    });
    await page.reload();
    await page.locator(".boot-overlay").waitFor({ state: "detached", timeout: 20000 });
    await expect(page.locator('iframe[title="Website preview"]')).toBeVisible();

    // Cover the full settle budget: the boot-end subtree remount re-arms a
    // fresh watchdog (3500ms) + probe (250ms) + buffer, and some commits
    // resolve only at the deadline. Then assert nothing tripped the fallback.
    await page.waitForTimeout(7000);
    await expect(page.getByText(/blocks embedding/i)).toHaveCount(0);
    await expect(page.locator("img[src*='/api/screenshot']")).toHaveCount(0);
    await expect(page.locator('iframe[title="Website preview"]')).toBeVisible();
  });
});

// Reset-widget regression: a widget dragged off-screen must be recoverable to
// the default right-edge bootstrap column from the desktop context menu.
//
// The widget is seeded through the persisted `devos-store` state BEFORE first
// navigation (addInitScript runs ahead of hydration and of the app's own
// persist writes — same pattern as in persistence.spec.ts / the embed spec
// above). Note x: -300 means "dragged off the left edge"; the boot-time clamp
// will pull it to x=0, so the interesting pre/post discriminator is the
// default column position (x = vw - 220), not raw viewport containment.
test.describe("Reset widgets (context menu)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("repositions an off-screen widget to the default desktop column", async ({ page }) => {
    await page.addInitScript(() => {
      const seeded = {
        state: {
          widgets: [
            {
              id: "seed-weather-e2e",
              type: "weather",
              title: "Weather",
              x: -300,
              y: 120,
              width: 200,
              height: 100,
              isPinned: false,
              isCollapsed: false,
            },
          ],
        },
        version: 1,
      };
      localStorage.setItem("devos-store", JSON.stringify(seeded));
    });
    await gotoApp(page);

    // The single seeded widget: the glass card whose header reads exactly "Weather".
    const weatherWidget = page
      .locator(".glass-light")
      .filter({ has: page.getByText("Weather", { exact: true }) })
      .first();

    await expect(weatherWidget).toBeVisible();

    // Sanity: before the reset the widget is NOT at the default column, so the
    // later assertion cannot pass vacuously.
    const before = await weatherWidget.boundingBox();
    expect(before).not.toBeNull();
    expect((before as { x: number }).x).toBeLessThan(1440 - 220 - 5);

    // Right-click empty desktop (icons live top-left, widgets hug the right edge).
    await page.mouse.click(400, 300, { button: "right" });
    await page.getByRole("menuitem", { name: "Reset Widgets" }).click();

    // After the reset: at the default bootstrap column (x = vw - 220 = 1220)
    // and bounding box fully inside the viewport.
    await expect
      .poll(async () => (await weatherWidget.boundingBox())?.x ?? -1)
      .toBeGreaterThanOrEqual(1440 - 220 - 2);

    const after = await weatherWidget.boundingBox();
    expect(after).not.toBeNull();
    const box = after as { x: number; y: number; width: number; height: number };
    expect(Math.abs(box.x - (1440 - 220))).toBeLessThanOrEqual(2); // default column
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1440);
    expect(box.y).toBeGreaterThanOrEqual(36); // TopBar safe zone
    expect(box.y + box.height).toBeLessThanOrEqual(900);
  });
});
