import { test, expect } from "@playwright/test";

test.describe("Theme switching", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("defaults to retro theme", async ({ page }) => {
    await expect(page.locator("html")).toHaveAttribute("data-theme", "retro");
  });

  test("switches to neon theme", async ({ page }) => {
    await page.getByLabel("Neon City").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "neon");
  });

  test("switches to editorial theme", async ({ page }) => {
    await page.getByLabel("Classic Editorial").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "editorial");
  });

  test("persists theme across page reload", async ({ page }) => {
    await page.getByLabel("Neon City").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "neon");

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "neon");
  });
});
