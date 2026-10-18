import { test, expect } from "@playwright/test";
import { gotoApp } from "./utils";
import { SITE_LAST_UPDATED } from "../src/lib/site";

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

test.describe("SEO truth & accessibility metadata", () => {
  test("does not disable pinch zoom in the viewport meta", async ({ page }) => {
    await gotoApp(page);

    const content = await page.locator('meta[name="viewport"]').getAttribute("content");

    expect(content).toBeTruthy();
    expect(content).not.toContain("user-scalable=no");
    expect(content).not.toContain("maximum-scale");
  });

  test("robots.txt disallows crawling the API routes", async ({ page }) => {
    await gotoApp(page);

    const response = await page.request.get("/robots.txt");

    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toMatch(/Disallow:\s*\/api\/?/);
  });

  test("sitemap.xml pins lastModified to SITE_LAST_UPDATED", async ({ page }) => {
    await gotoApp(page);

    const response = await page.request.get("/sitemap.xml");

    expect(response.status()).toBe(200);
    const body = await response.text();
    const lastmod = body.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] ?? "";

    expect(lastmod).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(lastmod).toBe(SITE_LAST_UPDATED);
  });
});

test.describe("Security headers", () => {
  /**
   * The `script-src` assertion only holds against a production server: the
   * Next.js dev runtime (HMR/dynamic imports) legitimately needs
   * 'unsafe-eval', and the dev-server default launches `npm run dev`. Set
   * `PLAYWRIGHT_NEXT_SERVER_MODE=production` when the suite runs against a
   * `next build && next start` server (this is what the final-gate spot check
   * does) to enable the assertion.
   */
  const isProductionServer = process.env.PLAYWRIGHT_NEXT_SERVER_MODE === "production";

  test("serves a hardened Content-Security-Policy", async ({ page }) => {
    await gotoApp(page);

    const response = await page.request.get("/");

    expect(response.status()).toBe(200);
    const csp = response.headers()["content-security-policy"];
    expect(csp).toBeTruthy();
    // Stronger directives added by the hardening lane.
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    // Vercel Analytics mounts client-side beacons to this origin; a bare
    // 'self' connect-src would silently block them.
    expect(csp).toContain("va.vercel-scripts.com");
    if (isProductionServer) {
      const scriptSrc = csp
        .split(";")
        .find((directive) => directive.trim().startsWith("script-src"));
      expect(scriptSrc).toBeDefined();
      expect(scriptSrc).not.toContain("'unsafe-eval'");
    }
  });
});
