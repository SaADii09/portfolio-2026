import { test, expect } from "@playwright/test";
import { gotoApp } from "./utils";

test.describe("Social & sharing metadata", () => {
  test("emits an OpenGraph title containing the site name", async ({ page }) => {
    await gotoApp(page);

    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /DevOS/);
  });

  test("serves robots.txt that points at the sitemap", async ({ page }) => {
    await gotoApp(page);
    const origin = new URL(page.url()).origin;

    const response = await page.request.get("/robots.txt");

    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain("Sitemap");
    expect(body).toContain(`Sitemap: ${origin}/sitemap.xml`);
  });

  test("serves sitemap.xml with a loc entry", async ({ page }) => {
    await gotoApp(page);
    const origin = new URL(page.url()).origin;

    const response = await page.request.get("/sitemap.xml");

    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain("<loc>");
    expect(body).toContain(`<loc>${origin}`);
  });

  test("emits a generated OpenGraph image", async ({ page }) => {
    await gotoApp(page);

    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      /opengraph-image/,
    );
    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
      "content",
      /twitter-image/,
    );
  });

  test("serves the OpenGraph image as a PNG", async ({ page }) => {
    await gotoApp(page);

    const href = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(href).toBeTruthy();
    const response = await page.request.get(href ?? "");

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
  });
});
