import { test, expect } from "@playwright/test";

test.describe("Window lifecycle", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("opens About app from desktop icon", async ({ page }) => {
    await page.getByLabel("About Me").first().click();
    await expect(page.getByText("About Me")).toBeVisible();
  });

  test("opens Projects app from desktop icon", async ({ page }) => {
    await page.getByLabel("Projects").first().click();
    await expect(page.getByText("Projects")).toBeVisible();
  });

  test("opens Control Panel from Settings button in Start menu", async ({ page }) => {
    await page.getByText("Start").click();
    await page.getByText("Settings").click();
    await expect(page.getByText("Control Panel")).toBeVisible();
  });

  test("Taskbar shows window chips when windows are open", async ({ page }) => {
    await page.getByLabel("About Me").first().click();
    await page.getByLabel("Projects").first().click();
    const chips = page.locator("button:has-text('About Me'), button:has-text('Projects')");
    await expect(chips.first()).toBeVisible();
  });

  test("window close button removes window", async ({ page }) => {
    await page.getByLabel("About Me").first().click();
    await expect(page.getByText("About Me")).toBeVisible();
    await page.getByLabel("Close").first().click();
    await expect(page.getByText("About Me")).not.toBeVisible();
  });
});
