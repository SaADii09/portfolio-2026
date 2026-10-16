import { test, expect } from "@playwright/test";
import { gotoApp } from "./utils";

test.describe("LocalStorage persistence", () => {
  test("saves theme preference to localStorage", async ({ page }) => {
    await gotoApp(page);

    await page.getByLabel("Control Center").click();
    await page.getByLabel("Neon").click();

    await expect
      .poll(async () => {
        const store = await page.evaluate(() => localStorage.getItem("devos-store"));
        return JSON.parse(store ?? "{}").state?.theme;
      })
      .toBe("neon");
  });

  test("restores theme from localStorage on reload", async ({ page }) => {
    await gotoApp(page);

    // Seed the persisted store before the next document loads. addInitScript runs
    // ahead of the app's inline theme script, so the theme is applied on first paint.
    // (Touching localStorage after hydration would race with the app's own persist writes.)
    await page.addInitScript(() => {
      const store = JSON.parse(localStorage.getItem("devos-store") || "{}");
      store.state = { ...(store.state ?? {}), theme: "editorial" };
      localStorage.setItem("devos-store", JSON.stringify(store));
    });

    await page.reload();
    await page.locator(".boot-overlay").waitFor({ state: "detached", timeout: 15000 });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "editorial");
  });

  test("preserves windows after reload", async ({ page }) => {
    await gotoApp(page);

    await page.getByTitle("Open About Me").dblclick();
    await expect(page.getByRole("heading", { name: "About Me" })).toBeVisible();

    await page.reload();
    await page.locator(".boot-overlay").waitFor({ state: "detached", timeout: 15000 });
    await expect(page.getByRole("heading", { name: "About Me" })).toBeVisible();
  });
});
