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

  test("mobile shade sliders meet the 44px minimum touch target", async ({ page }) => {
    await page.getByTestId("mobile-shade-knob").click();
    const glassSlider = page.getByLabel("Glass blur");
    await expect(glassSlider).toBeVisible();

    const glassBox = await glassSlider.boundingBox();
    const volumeBox = await page.getByLabel("Volume").boundingBox();
    expect(glassBox, "glass blur slider should have bounds").not.toBeNull();
    expect(volumeBox, "volume slider should have bounds").not.toBeNull();
    expect(Math.round(glassBox!.height)).toBeGreaterThanOrEqual(44);
    expect(Math.round(volumeBox!.height)).toBeGreaterThanOrEqual(44);
  });
});

/**
 * Exactly 768px is the boundary the breakpoint definitions share: Tailwind's
 * `md:` (min-width: 768px) and `MOBILE_BREAKPOINT` in src/lib/boundaries.ts
 * both call it desktop, so `useIsMobile` (`max-width: 767.98px`) must too — the
 * mobile presentation belongs to 767px and below. This pins that agreement: the
 * 44px slider rule above is checked at 375/390px only, so nothing else would
 * catch a boundary that flips back to mobile.
 */
test.describe("768px breakpoint boundary", () => {
  test.use({ viewport: { width: 768, height: 900 } });

  test("presents desktop chrome instead of the mobile shade", async ({ page }) => {
    await gotoApp(page);

    // Mobile-only markers: the status-bar shade knob and the bottom tab bar.
    await expect(page.getByTestId("mobile-shade-knob")).toHaveCount(0);
    await expect(page.getByLabel("Home")).toHaveCount(0);

    // Desktop chrome, whose sliders keep the thin desktop height (`h-1`, 4px)
    // rather than the 44px touch target the same slider gets on mobile.
    await page.getByLabel("Control Center").click();
    const glassSlider = page.getByLabel("Glass blur");
    await expect(glassSlider).toBeVisible();

    const box = await glassSlider.boundingBox();
    expect(box, "desktop glass slider should have bounds").not.toBeNull();
    expect(Math.round(box!.height)).toBeGreaterThan(0);
    expect(Math.round(box!.height)).toBeLessThanOrEqual(8);
  });
});
