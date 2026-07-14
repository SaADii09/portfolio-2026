import { test, expect } from "@playwright/test";

test.describe("Mobile layout", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("shows bottom tab bar instead of desktop taskbar", async ({ page }) => {
    await expect(page.getByLabel("Home")).toBeVisible();
    await expect(page.getByLabel("Settings")).toBeVisible();
    await expect(page.getByText("Start")).not.toBeVisible();
  });

  test("opens app full-screen on mobile", async ({ page }) => {
    await page.getByLabel("About Me").first().click();
    const window = page.getByText("About Me").first();
    await expect(window).toBeVisible();
  });

  test("shows chat button and opens bottom sheet", async ({ page }) => {
    await page.click('[aria-label*="chat"]');
    const chat = page.getByPlaceholder(/ask/i);
    await expect(chat).toBeVisible();
  });
});
