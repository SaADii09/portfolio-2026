import { test, expect } from "@playwright/test";
import { gotoApp } from "./utils";

const TOLERANCE = 8;
const MIN_WINDOW_WIDTH = 280;

test.describe("Global keyboard shortcuts", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test("Escape closes the focused window", async ({ page }) => {
    await page.getByTitle("Open About Me").dblclick();
    const win = page.locator(".os-window-enter");
    await expect(win).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(win).not.toBeVisible();
  });

  test("Escape in the terminal input only blurs", async ({ page }) => {
    await page.getByTitle("Open Terminal").dblclick();
    const win = page.locator(".os-window-enter");
    await expect(win).toBeVisible();

    const input = page.getByPlaceholder("Type a command...");
    await input.click();
    await expect(input).toBeFocused();

    await page.keyboard.press("Escape");

    await expect(input).not.toBeFocused();
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("BODY");
    await expect(win).toBeVisible();
  });

  test("Escape with the desktop context menu open closes only the menu", async ({ page }) => {
    await page.getByTitle("Open About Me").dblclick();
    const win = page.locator(".os-window-enter");
    await expect(win).toBeVisible();

    // Empty desktop area: away from icons, windows, and widgets.
    await page.mouse.click(640, 450, { button: "right" });
    const menuItem = page.getByRole("button", { name: "About DevOS" });
    await expect(menuItem).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(menuItem).not.toBeVisible();
    await expect(win).toBeVisible();
    await expect(page.locator(".os-window-enter")).toHaveCount(1);
  });

  test("Alt+ArrowRight snaps the window to the right half without navigating", async ({ page }) => {
    await page.getByTitle("Open About Me").dblclick();
    const win = page.locator(".os-window-enter");
    await expect(win).toBeVisible();

    const vp = page.viewportSize()!;
    const urlBefore = page.url();
    const expectedWidth = Math.max(MIN_WINDOW_WIDTH, Math.round(vp.width / 2));

    await page.keyboard.press("Alt+ArrowRight");

    await expect(async () => {
      const box = (await win.boundingBox())!;
      expect(Math.abs(box.x - (vp.width - expectedWidth))).toBeLessThanOrEqual(TOLERANCE);
      expect(Math.abs(box.width - expectedWidth)).toBeLessThanOrEqual(TOLERANCE);
    }).toPass();

    expect(page.url()).toBe(urlBefore);
  });

  test("Alt+ArrowLeft while the terminal input is focused does nothing", async ({ page }) => {
    await page.getByTitle("Open Terminal").dblclick();
    const win = page.locator(".os-window-enter");
    await expect(win).toBeVisible();

    const input = page.getByPlaceholder("Type a command...");
    await input.click();
    await expect(input).toBeFocused();

    const before = (await win.boundingBox())!;
    await page.keyboard.press("Alt+ArrowLeft");
    await page.waitForTimeout(150);

    const after = (await win.boundingBox())!;
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);
  });
});
