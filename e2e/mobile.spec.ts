import { test, expect } from "@playwright/test";
import { gotoApp } from "./utils";

test.describe("Mobile layout", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test("shows the Home button in the bottom taskbar", async ({ page }) => {
    await expect(page.getByLabel("Home")).toBeVisible();
  });

  test("opens an app window by tapping a home-screen icon", async ({ page }) => {
    await page.getByTitle("Open About Me").click();
    await expect(page.getByRole("heading", { name: "About Me" })).toBeVisible();
  });

  test("shows chat trigger and opens the bottom sheet", async ({ page }) => {
    await page.getByLabel("Open chat").click();
    await expect(page.getByPlaceholder("Type a message...")).toBeVisible();
  });
});
