import { test, expect } from "@playwright/test";
import { gotoApp } from "./utils";

/** Page-side sampler installed before Escape (see the exit-animation test). */
interface ExitSampler {
  armed: boolean;
  done: boolean;
  fadingFrames: number;
  minOpacity: number;
}

test.describe("Command palette", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test("Ctrl/Cmd+K opens it; filtering and Enter switch the theme", async ({ page }) => {
    await page.keyboard.press("ControlOrMeta+k");

    const dialog = page.getByRole("dialog", { name: "Command palette" });
    await expect(dialog).toBeVisible();
    const input = page.getByRole("combobox");
    await expect(input).toBeFocused();

    await input.fill("neon");
    await expect(dialog.getByText("Switch theme: Neon City")).toBeVisible();

    await page.keyboard.press("Enter");

    await expect(dialog).not.toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "neon");
  });

  test("typing 'term' and pressing Enter opens the Terminal window", async ({ page }) => {
    await page.keyboard.press("ControlOrMeta+k");
    const input = page.getByRole("combobox");

    await input.fill("term");
    await expect(page.getByRole("option", { name: /Open Terminal/ })).toBeVisible();

    await page.keyboard.press("Enter");

    await expect(page.getByRole("dialog", { name: "Command palette" })).not.toBeVisible();
    await expect(
      page
        .locator(".os-window-enter")
        .filter({ has: page.locator("span.font-display", { hasText: /^Terminal$/ }) }),
    ).toBeVisible();
  });

  test("typing 'projects' and pressing Enter opens the Projects window", async ({ page }) => {
    await page.keyboard.press("ControlOrMeta+k");
    const input = page.getByRole("combobox");

    await input.fill("projects");
    await expect(page.getByRole("option", { name: /Open Projects/ })).toBeVisible();

    await page.keyboard.press("Enter");

    await expect(page.getByRole("dialog", { name: "Command palette" })).not.toBeVisible();
    await expect(
      page
        .locator(".os-window-enter")
        .filter({ has: page.locator("span.font-display", { hasText: /^Projects$/ }) }),
    ).toBeVisible();
  });

  test("Tab and Shift+Tab keep focus inside the palette", async ({ page }) => {
    await page.keyboard.press("ControlOrMeta+k");
    const dialog = page.getByRole("dialog", { name: "Command palette" });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("combobox")).toBeFocused();

    const focusIsInside = () =>
      page.evaluate(() => {
        const el = document.querySelector('[role="dialog"][aria-label="Command palette"]');
        return Boolean(el && el.contains(document.activeElement));
      });

    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Shift+Tab");
      expect(await focusIsInside()).toBe(true);
    }
    // More presses than there are rows: the cycle wraps inside the dialog.
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab");
      expect(await focusIsInside()).toBe(true);
    }
  });

  test("locks document scroll while open and restores it on close", async ({ page }) => {
    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();

    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");

    await page.keyboard.press("Escape");

    await expect(page.getByRole("dialog", { name: "Command palette" })).not.toBeVisible();
    // The lock is released when the palette unmounts (after its exit animation).
    await expect.poll(async () => page.evaluate(() => document.body.style.overflow)).toBe("");
  });

  test("animates out on Escape instead of snapping detached", async ({ page }) => {
    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.getByTestId("command-palette-overlay")).toBeVisible();

    // Sample the overlay once per animation frame *in the page*, so the
    // measurement never depends on the driver's round-trip timing.
    await page.evaluate(() => {
      const sampler: ExitSampler = { armed: false, done: false, fadingFrames: 0, minOpacity: 1 };
      (window as unknown as { __paletteExit: ExitSampler }).__paletteExit = sampler;
      window.addEventListener(
        "keydown",
        (e) => {
          if (e.key === "Escape") sampler.armed = true;
        },
        { capture: true },
      );
      const tick = () => {
        const el = document.querySelector<HTMLElement>('[data-testid="command-palette-overlay"]');
        if (!el) {
          sampler.done = true;
          return;
        }
        const opacity = Number(getComputedStyle(el).opacity);
        if (sampler.armed && opacity < 1) {
          sampler.fadingFrames += 1;
          sampler.minOpacity = Math.min(sampler.minOpacity, opacity);
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => (window as unknown as { __paletteExit?: ExitSampler }).__paletteExit?.done === true,
    );

    const sampler = await page.evaluate(
      () => (window as unknown as { __paletteExit: ExitSampler }).__paletteExit,
    );
    // A real exit: the node survived several frames while opacity animated to 0.
    // A snap-hide detaches at opacity 1, which fails both assertions.
    expect(sampler.fadingFrames).toBeGreaterThanOrEqual(2);
    expect(sampler.minOpacity).toBeLessThan(0.5);
  });

  test("shows the empty state when nothing matches", async ({ page }) => {
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByRole("combobox").fill("zzz");

    await expect(page.getByText("No matching commands")).toBeVisible();
  });

  test("Escape closes it without opening or closing windows", async ({ page }) => {
    await page.getByTitle("Open About Me").dblclick();
    await expect(page.locator(".os-window-enter")).toHaveCount(1);

    await page.keyboard.press("ControlOrMeta+k");
    const dialog = page.getByRole("dialog", { name: "Command palette" });
    await expect(dialog).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(dialog).not.toBeVisible();
    await expect(page.locator(".os-window-enter")).toHaveCount(1);
  });

  test("opens from the TopBar trigger button", async ({ page }) => {
    await page.locator('button[aria-label="Command palette"]').click();

    await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
    await expect(page.getByRole("combobox")).toBeFocused();
  });

  test.describe("mobile", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("opens from the shade's Search & commands row", async ({ page }) => {
      await page.getByTestId("mobile-shade-knob").click();

      const row = page.getByRole("button", { name: "Search & commands" });
      await expect(row).toBeVisible();

      await row.click();

      await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
      await expect(page.getByRole("combobox")).toBeFocused();
    });
  });
});
