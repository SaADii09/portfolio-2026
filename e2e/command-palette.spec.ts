import { test, expect } from "@playwright/test";
import { gotoApp } from "./utils";

/** Page-side sampler installed before Escape (see the exit-animation test). */
interface ExitSampler {
  armed: boolean;
  done: boolean;
  /** True once the overlay was observed still attached after Escape was dispatched. */
  attachedAfterEscape: boolean;
  /** Observations (from any sampling mechanism) at opacity < 0.9 while attached. */
  fadingSamples: number;
  minOpacity: number;
  /** Informational only: whether this engine reports prefers-reduced-motion. */
  reducedMotion: boolean;
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

    // Let the *enter* animation settle to full opacity before we arm the
    // sampler. Otherwise a still-rising enter animation could be mistaken for
    // the exit fade and make the assertion vacuous.
    await page.waitForFunction(
      () => {
        const el = document.querySelector('[data-testid="command-palette-overlay"]');
        return !!el && Number(getComputedStyle(el).opacity) >= 0.99;
      },
      undefined,
      { timeout: 10_000 },
    );

    // Sample the overlay once per animation frame *in the page*, so the
    // measurement never depends on the driver's round-trip timing.
    //
    // Headless engines can starve any single sampler: rAF callbacks are tied to
    // compositor frames, and the main thread can block for the whole ~120ms exit
    // so only one or two callbacks ever run. We therefore record via three
    // independent mechanisms and take their union — rAF-sampled computed
    // opacity, a MutationObserver on the inline `style` framer-motion writes,
    // and a plain timer sampler (which keeps firing when rAF is coalesced).
    await page.evaluate(() => {
      const sampler: ExitSampler = {
        armed: false,
        done: false,
        attachedAfterEscape: false,
        fadingSamples: 0,
        minOpacity: 1,
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      };
      (window as unknown as { __paletteExit: ExitSampler }).__paletteExit = sampler;

      const record = (opacity: number) => {
        if (!sampler.armed || !Number.isFinite(opacity)) return;
        sampler.attachedAfterEscape = true;
        if (opacity < 0.9) {
          sampler.fadingSamples += 1;
          sampler.minOpacity = Math.min(sampler.minOpacity, opacity);
        }
      };

      const overlay = () =>
        document.querySelector<HTMLElement>('[data-testid="command-palette-overlay"]');

      window.addEventListener(
        "keydown",
        (e) => {
          if (e.key === "Escape") sampler.armed = true;
        },
        { capture: true },
      );

      // Mechanism 1: framer-motion animates opacity through inline styles.
      const first = overlay();
      if (first) {
        new MutationObserver(() => {
          const value = first.style.opacity;
          if (value !== "") record(Number(value));
        }).observe(first, { attributes: true, attributeFilter: ["style"] });
      }

      // Mechanism 2: a timer sampler — keeps ticking even while rAF is starved.
      const timer = window.setInterval(() => {
        const el = overlay();
        if (!el) {
          if (sampler.done) window.clearInterval(timer);
          return;
        }
        record(Number(getComputedStyle(el).opacity));
      }, 5);

      // Mechanism 3: per-frame sampler — also detects the detach that ends the exit.
      const tick = () => {
        const el = overlay();
        if (!el) {
          sampler.done = true;
          window.clearInterval(timer);
          return;
        }
        record(Number(getComputedStyle(el).opacity));
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

    // A real exit: the overlay survived Escape and was observed mid-fade
    // (opacity well below 1) while still attached. A snap-hide removes the node
    // at opacity 1, so it records no fading sample and leaves minOpacity at 1 —
    // both assertions fail. We deliberately do NOT require a minimum *frame
    // count*: headless engines can block the main thread through the whole exit
    // and observe only a single sample, which made the old `>= 2` threshold
    // engine-brittle (webkit deterministically saw one rAF frame).
    const detail = `sampler=${JSON.stringify(sampler)}`;
    expect(
      sampler.attachedAfterEscape,
      `overlay was never observed attached after Escape; ${detail}`,
    ).toBe(true);
    expect(
      sampler.fadingSamples,
      `overlay was never observed fading while attached; ${detail}`,
    ).toBeGreaterThanOrEqual(1);
    expect(sampler.minOpacity, `overlay never faded towards transparent; ${detail}`).toBeLessThan(
      0.5,
    );
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
