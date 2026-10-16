import { test, expect } from "@playwright/test";
import { gotoApp } from "./utils";

test.describe("Social & sharing metadata", () => {
  test("emits an OpenGraph title containing the site name", async ({ page }) => {
    await gotoApp(page);

    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /DevOS/);
  });

  test("serves robots.txt that points at the sitemap", async ({ page }) => {
    const response = await page.request.get("/robots.txt");

    expect(response.status()).toBe(200);
    expect(await response.text()).toContain("Sitemap");
  });

  test("serves sitemap.xml with a loc entry", async ({ page }) => {
    const response = await page.request.get("/sitemap.xml");

    expect(response.status()).toBe(200);
    expect(await response.text()).toContain("<loc>");
  });
});
