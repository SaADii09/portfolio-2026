import { test, expect } from "@playwright/test";
import { gotoApp } from "./utils";

test.describe("Theme switching", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test("defaults to retro theme", async ({ page }) => {
    await expect(page.locator("html")).toHaveAttribute("data-theme", "retro");
  });

  test("switches to neon theme via control center", async ({ page }) => {
    await page.getByLabel("Control Center").click();
    await page.getByLabel("Neon").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "neon");
  });

  test("switches to editorial theme via control center", async ({ page }) => {
    await page.getByLabel("Control Center").click();
    await page.getByLabel("Editorial").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "editorial");
  });

  test("persists theme across page reload", async ({ page }) => {
    await page.getByLabel("Control Center").click();
    await page.getByLabel("Neon").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "neon");

    await page.reload();
    await page.locator(".boot-overlay").waitFor({ state: "detached", timeout: 15000 });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "neon");
  });
});
