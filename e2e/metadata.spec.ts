import { test, expect } from "@playwright/test";
import { gotoApp } from "./utils";

/**
 * Canonical origin the app publishes in robots.txt / sitemap.xml: `siteUrl` in
 * src/lib/site.ts is `NEXT_PUBLIC_SITE_URL` when configured, otherwise its
 * localhost fallback. Derive the expectation from the environment/baseURL
 * instead of assuming localhost, so the spec also holds when the suite is run
 * against a deployment (`PLAYWRIGHT_BASE_URL`) or a configured canonical URL.
 */
function canonicalOrigin(baseURL: string | undefined, pageUrl: string): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return new URL(configured).origin;
  return new URL(baseURL ?? pageUrl).origin;
}

test.describe("Social & sharing metadata", () => {
  test("emits an OpenGraph title containing the site name", async ({ page }) => {
    await gotoApp(page);

    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /DevOS/);
  });

  test("serves robots.txt that points at the sitemap", async ({ page, baseURL }) => {
    await gotoApp(page);
    const origin = canonicalOrigin(baseURL, page.url());

    const response = await page.request.get("/robots.txt");

    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain("Sitemap");
    expect(body).toContain(`Sitemap: ${origin}/sitemap.xml`);
  });

  test("serves sitemap.xml with a loc entry", async ({ page, baseURL }) => {
    await gotoApp(page);
    const origin = canonicalOrigin(baseURL, page.url());

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
