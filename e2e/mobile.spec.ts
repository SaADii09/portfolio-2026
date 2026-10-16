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
