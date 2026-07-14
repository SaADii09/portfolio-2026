import { test, expect } from "@playwright/test";

test.describe("LocalStorage persistence", () => {
  test("saves theme preference to localStorage", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.getByLabel("Neon City").click();
    const store = await page.evaluate(() => localStorage.getItem("devos-store"));
    expect(store).not.toBeNull();
    const parsed = JSON.parse(store!);
    expect(parsed.state?.theme).toBe("neon");
  });

  test("restores theme from localStorage on reload", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.evaluate(() => {
      const store = JSON.parse(localStorage.getItem("devos-store") || "{}");
      store.state = { ...store.state, theme: "editorial" };
      localStorage.setItem("devos-store", JSON.stringify(store));
    });

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "editorial");
  });

  test("preserves windows after reload", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.getByLabel("About Me").first().click();

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("About Me")).toBeVisible();
  });
});
