import { test, expect, type Page } from "@playwright/test";
import { gotoApp } from "./utils";
import { MIN_WINDOW_WIDTH } from "@/lib/constants";
import { getViewportBounds } from "@/lib/boundaries";

const TOLERANCE = 8;

/**
 * `page.keyboard.press("Control+w")` cannot be used: Chromium/Firefox act on
 * Ctrl+W themselves (Playwright's driver would close the page). Dispatch a
 * cancelable synthetic keydown on the in-page element that currently has focus
 * (falling back to <body>) instead. It bubbles to the `window` listener in
 * useKeyboardShortcuts, just like a real keystroke, and we return whether the OS
 * layer claimed it via preventDefault().
 */
async function dispatchCtrlW(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const target =
      document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
    const event = new KeyboardEvent("keydown", {
      key: "w",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  });
}

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

    // Empty desktop area: just right of the About window (per-app slot puts it
    // flush against the zone's left edge, x 0..~560), away from icons,
    // widgets, and the paint area of both. Point derived from the live box so
    // it stays valid at any default-viewport shift.
    const aboutBox = (await win.boundingBox())!;
    // Settle before the right-click: the desktop context-menu listener mounts
    // in a post-hydration effect, and a right-click fired within the same
    // couple of frames as the About window's first paint landed on a DOM with
    // no listener (menu silently never opened — matrix run reproduced this
    // deterministically on all three engines).
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 300)));
    await page.mouse.click(Math.min(aboutBox.x + aboutBox.width + 80, 1100), 450, {
      button: "right",
    });
    // ContextMenu items render as <button role="menuitem"> — the explicit ARIA
    // role overrides the implicit button role, so the lookup must use menuitem
    // (stale since the Phase 12.1 focus-traversal hardening).
    const menuItem = page.getByRole("menuitem", { name: "About DevOS" });
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

    const urlBefore = page.url();

    // Mirror the hook (useKeyboardShortcuts) instead of re-deriving its maths:
    // geometry comes from the live viewport plus the shared safe-zone bounds.
    // The snap writes store y = 0 (zone top), and the window paints inside a
    // container offset topBar below the viewport top (Desktop.tsx) — so the
    // painted top edge is exactly the zone container's top. zoneTop already
    // includes topBar; adding it again would double-count (+36px).
    const { vw, vh, zoneTop } = await page.evaluate(() => {
      const el = document.querySelector(".os-window-enter");
      return {
        vw: window.innerWidth,
        vh: window.innerHeight,
        zoneTop: el?.parentElement?.getBoundingClientRect().top ?? 0,
      };
    });
    const { topBar, bottomBar } = getViewportBounds(vw);
    const expectedWidth = Math.max(MIN_WINDOW_WIDTH, Math.round(vw / 2));
    const expectedHeight = vh - topBar - bottomBar;
    const expectedY = zoneTop;

    await page.keyboard.press("Alt+ArrowRight");

    await expect(async () => {
      const box = (await win.boundingBox())!;
      expect(Math.abs(box.x - (vw - expectedWidth))).toBeLessThanOrEqual(TOLERANCE);
      expect(Math.abs(box.width - expectedWidth)).toBeLessThanOrEqual(TOLERANCE);
      expect(Math.abs(box.y - expectedY)).toBeLessThanOrEqual(TOLERANCE);
      expect(Math.abs(box.height - expectedHeight)).toBeLessThanOrEqual(TOLERANCE);
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

  test("Ctrl+W closes the focused window", async ({ page }) => {
    await page.getByTitle("Open About Me").dblclick();
    const win = page.locator(".os-window-enter");
    await expect(win).toBeVisible();

    expect(await dispatchCtrlW(page)).toBe(true);

    await expect(win).not.toBeVisible();
    // The synthetic keystroke was handled in-page: the app is still alive.
    await expect(page.getByTitle("Open About Me")).toBeVisible();
  });

  test("Ctrl+W with no focused window closes nothing", async ({ page }) => {
    await expect(page.locator(".os-window-enter")).toHaveCount(0);

    expect(await dispatchCtrlW(page)).toBe(true);

    await expect(page.locator(".os-window-enter")).toHaveCount(0);
    await expect(page.getByTitle("Open About Me")).toBeVisible();
  });

  test("Ctrl+W while the terminal input is focused leaves the window open", async ({ page }) => {
    await page.getByTitle("Open Terminal").dblclick();
    const win = page.locator(".os-window-enter");
    await expect(win).toBeVisible();

    const input = page.getByPlaceholder("Type a command...");
    await input.click();
    await expect(input).toBeFocused();

    // Dispatched on the focused input, so target is editable and the shortcut
    // bails out (no preventDefault) — the terminal keeps its own behaviour.
    expect(await dispatchCtrlW(page)).toBe(false);

    await expect(win).toBeVisible();
    await expect(input).toBeFocused();
  });
});
