import { test, expect } from "@playwright/test";
import { gotoApp } from "./utils";

test.describe("Theme switching", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test("defaults to retro theme", async ({ page }) => {
    await expect(page.locator("html")).toHaveAttribute("data-theme", "retro");
  });

  test("switches to neon theme via control center", async ({ page }) => {
    await page.getByLabel("Control Center").click();
    await page.getByLabel("Neon").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "neon");
  });

  test("switches to editorial theme via control center", async ({ page }) => {
    await page.getByLabel("Control Center").click();
    await page.getByLabel("Editorial").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "editorial");
  });

  test("persists theme across page reload", async ({ page }) => {
    await page.getByLabel("Control Center").click();
    await page.getByLabel("Neon").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "neon");

    await page.reload();
    await page.locator(".boot-overlay").waitFor({ state: "detached", timeout: 15000 });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "neon");
  });
});

test.describe("Glass surfaces react to glass variables", () => {
  test("retro default window computes blur(0px), not none", async ({ page }) => {
    await gotoApp(page);
    await page.getByTitle("Open Settings").dblclick();
    const bf = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(".os-window-surface");
      return el ? getComputedStyle(el).backdropFilter : "";
    });
    expect(bf).not.toBe("none");
  });
  test("retro blur slider visibly changes window blur", async ({ page }) => {
    await gotoApp(page);
    await page.getByTitle("Open Settings").dblclick();
    await page.getByRole("slider", { name: "Glass blur intensity" }).fill("30");
    const bf = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(".os-window-surface");
      return el ? getComputedStyle(el).backdropFilter : "";
    });
    expect(bf).toContain("blur(30px)");
  });
  test("blur slider visibly changes windows in every theme", async ({ page }) => {
    await gotoApp(page);
    await page.getByTitle("Open Settings").dblclick();
    const slider = page.getByRole("slider", { name: "Glass blur intensity" });
    for (const theme of ["Neon City", "Classic Editorial", "Retro 2D"] as const) {
      await page.getByRole("button", { name: theme }).click();
      await slider.fill("30");
      const bf = await page.evaluate(() => {
        const el = document.querySelector<HTMLElement>(".os-window-surface");
        return el ? getComputedStyle(el).backdropFilter : "";
      });
      expect(bf, theme).toContain("blur(30px)");
    }
  });
  test("retro rest alpha is the shipped 0.45 black", async ({ page }) => {
    await gotoApp(page);
    await page.getByTitle("Open Settings").dblclick();
    const alpha = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(".os-window-surface");
      if (!el) return NaN;
      const m = getComputedStyle(el).backgroundColor.match(/rgba?\(\d+, \d+, \d+, ([\d.]+)/);
      return m?.[1] ? parseFloat(m[1]) : NaN;
    });
    // Chromium may serialize color-mix as color(srgb…) — normalize via alpha channel when needed.
    expect(
      Number.isNaN(alpha)
        ? await page.evaluate(() => {
            const el = document.querySelector<HTMLElement>(".os-window-surface")!;
            const c = getComputedStyle(el).backgroundColor;
            const srgb = c.match(/color\(srgb .* ([\d.]+)\)/);
            return srgb?.[1] ? parseFloat(srgb[1]) : NaN;
          })
        : alpha,
    ).toBeCloseTo(0.45, 2);
  });
});
