import { test, expect } from "@playwright/test";
import { gotoApp } from "./utils";

test.describe("Window lifecycle", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test("opens About app from desktop icon", async ({ page }) => {
    await page.getByTitle("Open About Me").dblclick();
    await expect(page.getByRole("heading", { name: "About Me" })).toBeVisible();
  });

  test("opens Projects app from desktop icon", async ({ page }) => {
    await page.getByTitle("Open Projects").dblclick();
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
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

    await page.getByTitle("Open Projects").dblclick();
    await expect(page.getByLabel("Projects")).toBeVisible();
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

// Only embed/WebView coverage in the repo. The "refused" fixture is a
// cross-origin frame served with X-Frame-Options: DENY (route-fulfilled, so
// the suite never touches github.com); the "embeddable" positive control is
// per the hardening ruling: page.route-fulfilled same-origin HTML, not a real
// external project URL. No page-mouse drags here (Playwright 1.64.1 Firefox
// interpolates off-viewport mouse moves) — only iframe loads and waits.
test.describe("WebView embed refusal fallback", () => {
  const PNG_1X1_BASE64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

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

  test("github-refused frame shows the screenshot fallback within watchdog window", async ({
    page,
  }) => {
    await page.route("https://github.com/**", (route) =>
      route.fulfill({
        status: 200,
        headers: { "x-frame-options": "DENY", "content-type": "text/html" },
        body: "<html><body></body></html>",
      }),
    );
    await gotoApp(page);

    await page.getByTitle("Open Projects").dblclick();
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
    await page.getByRole("button", { name: /DevOS Portfolio/ }).click();

    // Watchdog is 3500ms and the refused frame fires load well before that;
    // 6500ms = watchdog + probe + buffer, and this frame must beat it.
    await expect(page.getByText(/can't be embedded/i)).toBeVisible({ timeout: 6500 });
    const shot = page.locator("img[src*='/api/screenshot']");
    await expect(shot).toBeVisible();
    await expect(shot).toHaveAttribute(
      "src",
      `/api/screenshot?url=${encodeURIComponent("https://github.com/SaADii09")}`,
    );
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
    await expect(page.getByText(/can't be embedded/i)).toHaveCount(0);
    await expect(page.locator("img[src*='/api/screenshot']")).toHaveCount(0);
    await expect(page.locator('iframe[title="Website preview"]')).toBeVisible();
  });
});
