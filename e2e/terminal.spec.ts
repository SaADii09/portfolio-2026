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
    // Window-locating pattern used by the existing specs: dock/taskbar icons
    // expose the open window's title as their accessible name
    // (see "dock shows an icon for each open window" in window-lifecycle.spec.ts).
    await expect(page.getByLabel("Resume")).toBeVisible();

    await input.fill("music next");
    await input.press("Enter");
    // The music line format only ever appears in the terminal's own output.
    await expect(page.getByText(/♪ Pixel Rain/)).toBeVisible();
  });
});
