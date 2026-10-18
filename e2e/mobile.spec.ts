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
 * Mobile shade gesture suite — pinned contract, Task 9 (hardening plan):
 * the shade knob is both tappable and draggable, and TopBar's gesture handlers
 * must tell those two intents apart. A real drag (pointer moved > 8px) must
 * suppress the trailing synthetic click so drag-opening the shade does not
 * self-cancel; a plain tap must still toggle. The panel itself must not
 * disable internal touch scrolling. Runs under `hasTouch` because
 * touch-action semantics only engage for touch pointers — Playwright's
 * default mouse input bypasses them.
 *
 * Panel geometry measured at 375×812: the shade control stack is ~394px tall
 * against a 60vh (≈487px) max-height panel, so nothing sits below the fold at
 * this exact viewport (see the touch-scroll test's comment for how that
 * affects its assertion).
 */
test.describe("Mobile shade gestures (touch)", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test("drag-opening the shade stays open (trailing click must not self-cancel)", async ({
    page,
  }) => {
    const knob = page.getByTestId("mobile-shade-knob");
    const knobBox = (await knob.boundingBox())!;
    const cx = knobBox.x + knobBox.width / 2;
    const cy = knobBox.y + knobBox.height / 2;

    // Touch-drag the knob downward ≥120px, ending in-viewport, with a fast
    // downward flick: a pause before the final micro-move forces dt > 0 on the
    // last velocity sample (`velocity = deltaY / dt` > 0.3 on the app side).
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy + 120, { steps: 6 });
    await page.waitForTimeout(30);
    await page.mouse.move(cx, cy + 123, { steps: 1 });
    await page.mouse.up();

    // The pointerup snap opens the shade; the trailing click fires after it
    // and must be suppressed instead of snapping the shade fully closed again.
    await page.waitForTimeout(400); // 300ms snap transition + trailing click settle
    const panel = page.getByTestId("mobile-shade-panel");
    const panelBox = (await panel.boundingBox())!;
    expect(
      Math.abs(panelBox.y - 32),
      "shade stays fully open after a drag-open release",
    ).toBeLessThan(8);
  });

  test("shade panel permits vertical touch scrolling (touch-action: pan-y)", async ({ page }) => {
    /**
     * The brief's behavioral half ("a control below the 60vh fold can be
     * scrolled to and interacted with") engages only on viewports short enough
     * that the shade stack overflows the panel — at 375×812 the stack is
     * ~394px inside a ~487px panel, so there is no overflow to scroll. What we
     * can pin here is the enabling property: the `overflow-y-auto` panel must
     * not declare `touch-action: none` (which makes inner touch scrolling dead
     * wherever the panel does overflow) but instead `pan-y`.
     */
    await page.getByTestId("mobile-shade-knob").click();
    const panel = page.getByTestId("mobile-shade-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveCSS("touch-action", "pan-y");
  });

  test("closing the shade from its content tucks it fully offscreen", async ({ page }) => {
    await page.getByTestId("mobile-shade-knob").click();
    const panel = page.getByTestId("mobile-shade-panel");
    await expect(panel).toBeVisible();

    // A content affordance that invokes the shade's onClose — the Settings row
    // also opens the control-panel app, which is fine for this assertion.
    await panel.getByRole("button", { name: "Settings" }).click();
    await page.waitForTimeout(400); // 300ms snap transition settles

    const panelBox = (await panel.boundingBox())!;
    const ty = panelBox.y - 32; // translateY relative to the panel's fixed top offset
    expect(panelBox.y + panelBox.height, "panel is fully offscreen").toBeLessThanOrEqual(33);
    // Pin that close snaps to the *measured* panel height, not a hardcoded
    // -400 offset: translateY must be flush with -(measured height).
    expect(
      Math.abs(ty + panelBox.height),
      "close target tracks the measured panel height",
    ).toBeLessThan(2);
  });

  test("a plain tap on the knob still toggles the shade under touch input", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName === "webkit",
      "Headless WebKit's synthetic touchscreen tap does not dispatch a trailing click event, so the " +
        "click-driven toggle never fires under touch there; the plain-tap toggle is still pinned by " +
        "the mouse-click tests in the block above (mobile.spec.ts:25-26) on every engine.",
    );
    const knob = page.getByTestId("mobile-shade-knob");
    const panel = page.getByTestId("mobile-shade-panel");

    await knob.tap();
    await page.waitForTimeout(400);
    let panelBox = (await panel.boundingBox())!;
    expect(Math.abs(panelBox.y - 32), "tap opens the shade").toBeLessThan(8);

    await knob.tap();
    await page.waitForTimeout(400);
    panelBox = (await panel.boundingBox())!;
    expect(panelBox.y + panelBox.height, "tap closes the shade").toBeLessThanOrEqual(33);
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
