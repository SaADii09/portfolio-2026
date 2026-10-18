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
