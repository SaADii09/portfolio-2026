import { test, expect, type Locator, type Page } from "@playwright/test";
import { gotoApp } from "./utils";

const TOLERANCE = 8;

async function dragHeader(page: Page, x: number, y: number, dx: number, dy: number) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  await page.mouse.up();
}

async function waitBoot(page: Page) {
  await page.locator(".boot-overlay").waitFor({ state: "detached", timeout: 15000 });
}

/**
 * Wait until the drag frame has fully settled: the rAF-batched store commit
 * and the React re-render it triggers must both have flushed before the
 * painted geometry is meaningful.
 */
async function settledBox(page: Page, locator: Locator) {
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 300)));
  return (await locator.boundingBox())!;
}

function weatherWidget(page: Page) {
  return page.locator(".glass-light", { hasText: "Weather" }).first();
}

test.describe("Drag behavior", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test("window header drag moves the window and persists after reload", async ({ page }) => {
    await page.getByTitle("Open About Me").dblclick();
    const win = page.locator(".os-window-enter");
    await expect(win).toBeVisible();
    const before = (await win.boundingBox())!;
    const header = (await win.locator(".os-drag-handle").boundingBox())!;

    await dragHeader(page, header.x + 60, header.y + header.height / 2, 120, 80);

    const after = (await win.boundingBox())!;
    expect(after.x).toBeGreaterThan(before.x + 120 - TOLERANCE);
    expect(after.x).toBeLessThan(before.x + 120 + TOLERANCE);
    expect(after.y).toBeGreaterThan(before.y + 80 - TOLERANCE);
    expect(after.y).toBeLessThan(before.y + 80 + TOLERANCE);

    await page.reload();
    await waitBoot(page);
    const persisted = (await page.locator(".os-window-enter").boundingBox())!;
    expect(Math.abs(persisted.x - after.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(persisted.y - after.y)).toBeLessThanOrEqual(1);
  });

  test("widget header drag moves the widget and persists after reload", async ({ page }) => {
    const widget = weatherWidget(page);
    await expect(widget).toBeVisible();
    const before = (await widget.boundingBox())!;

    await dragHeader(page, before.x + 40, before.y + 11, -100, 0);

    const after = (await widget.boundingBox())!;
    expect(after.x).toBeGreaterThan(before.x - 100 - TOLERANCE);
    expect(after.x).toBeLessThan(before.x - 100 + TOLERANCE);
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(TOLERANCE);

    await page.reload();
    await waitBoot(page);
    const persisted = (await weatherWidget(page).boundingBox())!;
    expect(Math.abs(persisted.x - after.x)).toBeLessThanOrEqual(1);
  });

  test("widget tracks the pointer while dragged over another widget and is collision-resolved on drop", async ({
    page,
  }) => {
    const widget = weatherWidget(page);
    const other = page.locator(".glass-light", { hasText: "CPU" }).first();
    await expect(widget).toBeVisible();
    await expect(other).toBeVisible();

    const start = (await widget.boundingBox())!;
    const otherBox = (await other.boundingBox())!;
    const grabX = start.x + 40;
    const grabY = start.y + 11;

    await page.mouse.move(grabX, grabY);
    await page.mouse.down();
    // One pointer event per move, then a fully settled sample: the painted
    // position afterwards is what the user actually sees while the button is held.
    await page.mouse.move(grabX, grabY + 40);
    const mid1 = await settledBox(page, widget);
    await page.mouse.move(grabX, grabY + 90);
    const mid2 = await settledBox(page, widget);
    await page.mouse.up();
    const after = await settledBox(page, widget);

    // (a) Mid-drag the painted position follows the pointer 1:1, even while the
    // widget overlaps the one below it. Regression: mid-drag commits went through
    // the collision-resolving store write, so the painted y froze for the whole
    // overlap band (was ~6px / ~0px instead of ~40px / ~50px of pointer travel).
    expect(
      mid1.y - start.y,
      "widget should track the pointer during the first move",
    ).toBeGreaterThan(25);
    expect(
      mid2.y - mid1.y,
      "widget should keep tracking the pointer while overlapping another widget",
    ).toBeGreaterThan(30);

    // (b) Releasing still resolves collisions: the raw drop position (mid2, inside
    // the widget below) is replaced by the resolved one — no overlap after the drop.
    expect(
      after.y,
      "drop should resolve the collision instead of committing the raw position",
    ).toBeLessThan(mid2.y - 20);
    expect(
      after.y + after.height,
      "released widget must not overlap the widget below",
    ).toBeLessThanOrEqual(otherBox.y + 1);
  });

  test("pinned widget does not move on drag", async ({ page }) => {
    const widget = weatherWidget(page);
    await expect(widget).toBeVisible();
    await widget.getByLabel("Pin to top").click();
    await expect(widget.getByLabel("Unpin")).toBeVisible();

    const before = (await widget.boundingBox())!;
    await dragHeader(page, before.x + 40, before.y + 11, -100, 60);

    const after = (await widget.boundingBox())!;
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
  });
});

test.describe("Mobile drag behavior", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("window header drags but widgets stay fixed", async ({ page }) => {
    await gotoApp(page);

    // Widgets live in a horizontal scroll strip on mobile — dragging is disabled.
    const widget = weatherWidget(page);
    await expect(widget).toBeVisible();
    const widgetBefore = (await widget.boundingBox())!;
    await dragHeader(page, widgetBefore.x + 40, widgetBefore.y + 20, -40, 0);
    const widgetAfter = (await widget.boundingBox())!;
    expect(Math.abs(widgetAfter.x - widgetBefore.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(widgetAfter.y - widgetBefore.y)).toBeLessThanOrEqual(1);

    // Windows still drag from the header on mobile.
    await page.getByTitle("Open About Me").click();
    const win = page.locator(".os-window-enter");
    await expect(win).toBeVisible();
    const winBefore = (await win.boundingBox())!;
    const header = (await win.locator(".os-drag-handle").boundingBox())!;

    await dragHeader(page, header.x + 40, header.y + header.height / 2, -100, 80);

    const winAfter = (await win.boundingBox())!;
    // Vertical movement is exact (no render-time clamp in play).
    expect(winAfter.y).toBeGreaterThan(winBefore.y + 80 - TOLERANCE);
    expect(winAfter.y).toBeLessThan(winBefore.y + 80 + TOLERANCE);
    // Horizontal drag follows the pointer until the mobile render clamp (x >= 0) kicks in.
    expect(winAfter.x).toBeLessThan(winBefore.x);
    expect(winAfter.x).toBeLessThanOrEqual(1);
  });
});
