import { test, expect } from "@playwright/test";
import { gotoApp } from "./utils";

test.describe("Terminal OS bridge", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test("bridge commands drive theme, apps, and music", async ({ page }) => {
    await page.getByTitle("Open Terminal").dblclick();

    const input = page.getByPlaceholder("Type a command...");
    await input.click();

    await input.fill("theme editorial");
    await input.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "editorial");

    await input.fill("open resume");
    await input.press("Enter");
    await expect(
      page
        .locator(".os-window-enter")
        .filter({ has: page.locator("span.font-display", { hasText: /^Resume$/ }) }),
    ).toBeVisible();

    await input.fill("music next");
    await input.press("Enter");
    await expect(
      page
        .locator(".os-window-enter")
        .filter({ hasText: "Welcome to DevOS Terminal" })
        .getByText(/Pixel Rain/),
    ).toBeVisible();
  });
});
