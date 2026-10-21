import { test, expect, type Page } from "@playwright/test";
import { gotoApp } from "./utils";

/**
 * DevOS Browser — the embed-verdict round trip (Task E1, real-web round).
 *
 * Four verdict paths, one per source of truth:
 * 1. HOST-BLOCKED (embed-rules): a known refuser host never mounts an iframe
 *    and never asks the server — the preview is instantaneous.
 * 2. EMBEDDABLE: a cross-origin frame that loads STAYS mounted through the
 *    verdict flight (the anti-false-refusal pin — the pre-rework probe used to
 *    swap every unreadable cross-origin document to the fallback).
 * 3. BLOCKED VERDICT: only a positive "blocked" verdict from /api/embed-check
 *    swaps the live frame out for the preview panel.
 * 4. SAME-ORIGIN LOCAL: our own fixture (/embed-refusal) is http:// —
 *    host-classified as blocked, so the client decides alone with zero
 *    server calls.
 * Plus the preview's two affordances: Reader mode (r.jina.ai) and
 * "Open in new tab".
 *
 * Determinism rules (mirroring e2e/browser.spec.ts): every network neighbor
 * is ROUTE-MOCKED — /api/screenshot with a 1×1 png (the panel never reaches
 * Microlink), /api/embed-check with a scripted verdict, and the embedded
 * site with a tiny HTML page fulfilled on demand.
 *
 * Chromium only (the matrix's reference engine).
 */

const VIEWPORT = { width: 1440, height: 900 };

/** The 1×1 png the mocked /api/screenshot route serves. */
const PNG_1X1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/** The tiny page the mocked embeddable site serves. */
const EMBED_OK_HTML = "<!doctype html><html><body><h1>embed-ok</h1></body></html>";

/** Mock /api/screenshot so the preview panel never reaches Microlink. */
async function mockScreenshot(page: Page): Promise<void> {
  await page.route("**/api/screenshot*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(PNG_1X1_BASE64, "base64"),
    }),
  );
}

/**
 * Intercepts /api/embed-check and answers with the given verdict; returns the
 * intercepted request urls — the counter is what proves the route was (or was
 * never) consulted.
 */
async function mockEmbedCheck(page: Page, verdict: { embeddable: boolean; reason: string }) {
  const calls: string[] = [];
  await page.route("**/api/embed-check*", (route) => {
    calls.push(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(verdict),
    });
  });
  return calls;
}

/** The tiny HTML page embed-ok.example serves (route-fulfilled). */
async function mockEmbeddableSite(page: Page): Promise<void> {
  await page.route("https://embed-ok.example/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: EMBED_OK_HTML,
    }),
  );
}

/**
 * The reader proxy fulfills with an article — its content is pinned through
 * the frame (Playwright's frameLocator pierces cross-origin frames), so the
 * pin proves the proxy's document actually renders, body-shape and all.
 */
async function mockReaderProxy(page: Page): Promise<void> {
  await page.route("https://r.jina.ai/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><html><body><article>Reader content pin</article></body></html>",
    }),
  );
}

/** Open the DevOS Browser through the "Open Browser" desktop icon. */
async function openBrowser(page: Page): Promise<void> {
  await page.getByTitle("Open Browser").dblclick();
  await expect(page.getByRole("tablist", { name: "Browser tabs" })).toBeVisible();
}

/** The ACTIVE tab's panel (the only `.browser-tab-panel` without `hidden`). */
function activePanel(page: Page) {
  return page.locator(".browser-tab-panel:not([hidden])");
}

/** Types a url into the address bar and submits it. */
async function typeAddress(page: Page, url: string): Promise<void> {
  const address = page.getByLabel("Address bar");
  await address.fill(url);
  await address.press("Enter");
}

test.describe("DevOS Browser — embed verdicts", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "chromium only");

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await gotoApp(page);
  });

  test("a host-blocked typed url is an instant preview — no iframe, no server verdict", async ({
    page,
  }) => {
    await mockScreenshot(page);
    const checkCalls = await mockEmbedCheck(page, { embeddable: false, reason: "x-frame-options" });
    await openBrowser(page);

    // The typed refuser goes straight to the preview: the embed-check mock
    // answers "blocked", so any server round trip would ALSO render the
    // panel — the zero-call assert below is what separates host-classified
    // from verdict-driven rendering.
    await typeAddress(page, "https://www.youtube.com/watch?v=x");

    // The web tab opens and the preview panel appears… (the tab is titled by
    // the hostname with any `www.` stripped — see titleForUrl.)
    await expect(page.getByRole("tab", { name: "youtube.com", exact: true })).toBeVisible();
    await expect(activePanel(page).getByText(/blocks embedding/i)).toBeVisible({
      timeout: 3_000,
    });

    // …with ZERO iframes anywhere in the tab router — not in the active
    // panel, not in any warm one.
    await expect(activePanel(page).locator("iframe")).toHaveCount(0);
    await expect(page.locator(".browser-tab-panel iframe")).toHaveCount(0);

    // …and ZERO /api/embed-check calls: the host was classified locally.
    expect(checkCalls.length, "no embed-check round trip for a blocked host").toBe(0);
  });

  test("a cross-origin site that allows framing stays a live frame", async ({ page }) => {
    await mockScreenshot(page);
    await mockEmbeddableSite(page);
    const checkCalls = await mockEmbedCheck(page, { embeddable: true, reason: "ok" });
    await openBrowser(page);

    await typeAddress(page, "https://embed-ok.example/");
    await expect(page.getByRole("tab", { name: "embed-ok.example" })).toBeVisible();

    // The frame mounts and the site's content is LIVE inside it (pinned
    // through the cross-origin frame — the same-origin-policy blind spot the
    // old probe's `contentDocument` read tripped on). The verdict mock is
    // consulted for that unreadable document…
    const frame = activePanel(page).locator('iframe[title="Website preview"]');
    const frameBody = page.frameLocator('iframe[title="Website preview"]');
    await expect(frame).toHaveCount(1);
    await expect(frameBody.getByRole("heading", { name: "embed-ok" })).toBeVisible();
    await expect(activePanel(page).getByText(/blocks embedding/i)).toHaveCount(0);
    // Plain counters don't auto-retry — poll until the probe's 250ms delay
    // has produced its verdict request.
    await expect
      .poll(() => checkCalls.length, { message: "the verdict flow consulted the route" })
      .toBeGreaterThanOrEqual(1);

    // …and the frame STAYS live through the old watchdog deadline (~3.5s):
    // the false-refusal regression this round exists to pin swaps the panel
    // in right here.
    await page.waitForTimeout(4_500);
    await expect(frame).toHaveCount(1);
    await expect(frameBody.getByRole("heading", { name: "embed-ok" })).toBeVisible();
    await expect(activePanel(page).getByText(/blocks embedding/i)).toHaveCount(0);
  });

  test("a blocked verdict swaps the live frame to the preview", async ({ page }) => {
    await mockScreenshot(page);
    await mockEmbeddableSite(page);
    const checkCalls = await mockEmbedCheck(page, { embeddable: false, reason: "x-frame-options" });
    await openBrowser(page);

    await typeAddress(page, "https://embed-ok.example/");
    await expect(page.getByRole("tab", { name: "embed-ok.example" })).toBeVisible();

    // The verdict says blocked: the preview panel replaces the frame.
    await expect(activePanel(page).getByText(/blocks embedding/i)).toBeVisible();
    await expect(activePanel(page).locator('iframe[title="Website preview"]')).toHaveCount(0);
    await expect(page.locator(".browser-tab-panel iframe")).toHaveCount(0);

    // The panel was earned by exactly ONE server verdict, asked about the
    // typed url (polling — same counter-timing caveat as above).
    await expect.poll(() => checkCalls.length, { message: "one embed-check round trip" }).toBe(1);
    expect(checkCalls[0]).toContain(`url=${encodeURIComponent("https://embed-ok.example/")}`);
  });

  test("our own same-origin fixture decides locally — zero server calls, zero iframes", async ({
    page,
  }) => {
    await mockScreenshot(page);
    const checkCalls = await mockEmbedCheck(page, { embeddable: true, reason: "ok" });
    await openBrowser(page);

    // Non-https is host-classified as blocked (fail-closed), so the typed
    // http:// fixture never reaches the https-only embed-check route — the
    // verdict mock answers "embeddable" on purpose: a single round trip
    // would prove the client leaked the local case to the server.
    await typeAddress(page, "http://localhost:3000/embed-refusal");

    // No iframe attempt happened: the tight window right after the submit
    // pins the frame's ABSENCE, not merely its eventual removal — the later
    // settled-state re-checks would also pass through the probe path's
    // transient frame.
    await expect(page.locator(".browser-tab-panel iframe")).toHaveCount(0, { timeout: 1_000 });
    await expect(page.locator('iframe[title="Website preview"]')).toHaveCount(0);

    // The preview panel appears…
    await expect(page.getByRole("tab", { name: "localhost", exact: true })).toBeVisible();
    await expect(activePanel(page).getByText(/blocks embedding/i)).toBeVisible({
      timeout: 3_000,
    });
    expect(checkCalls.length, "the same-origin local case never calls embed-check").toBe(0);
  });

  test("reader mode swaps the preview for a r.jina.ai frame and back", async ({ page }) => {
    await mockScreenshot(page);
    await mockEmbedCheck(page, { embeddable: false, reason: "x-frame-options" });
    await mockReaderProxy(page);
    await openBrowser(page);

    // A host-blocked site shows the preview panel…
    await typeAddress(page, "https://www.youtube.com/watch?v=x");
    await expect(page.getByRole("tab", { name: "youtube.com", exact: true })).toBeVisible();
    await expect(activePanel(page).getByText(/blocks embedding/i)).toBeVisible({
      timeout: 3_000,
    });

    // …whose "Read this page" opens the reader: a frame of the public render
    // proxy mounts with the typed url forwarded (readerUrl is plain
    // concatenation — no encoding).
    await activePanel(page).getByRole("button", { name: "Read this page" }).click();
    const reader = activePanel(page).locator('iframe[title="Reader view"]');
    await expect(reader).toHaveCount(1);
    await expect(reader).toHaveAttribute("src", /^https:\/\/r\.jina\.ai\//);
    await expect(reader).toHaveAttribute(
      "src",
      "https://r.jina.ai/https://www.youtube.com/watch?v=x",
    );
    // The proxy's document renders inside the reader frame.
    await expect(
      page.frameLocator('iframe[title="Reader view"]').getByText("Reader content pin"),
    ).toBeVisible();

    // "Back to preview" restores the preview panel — the reader frame is gone.
    await activePanel(page).getByRole("button", { name: "Back to preview" }).click();
    await expect(activePanel(page).getByText(/blocks embedding/i)).toBeVisible();
    await expect(activePanel(page).locator('iframe[title="Reader view"]')).toHaveCount(0);
  });

  test("the preview's primary affordance opens the typed url in a new tab", async ({ page }) => {
    await mockScreenshot(page);
    await mockEmbedCheck(page, { embeddable: false, reason: "x-frame-options" });
    await openBrowser(page);

    await typeAddress(page, "https://www.youtube.com/watch?v=x");
    const panel = activePanel(page);
    await expect(panel.getByText(/blocks embedding/i)).toBeVisible({ timeout: 3_000 });
    // The escape hatch points at the exact typed url and opens safely.
    const openExternal = panel.getByRole("link", { name: "Open in new tab" });
    await expect(openExternal).toHaveAttribute("href", "https://www.youtube.com/watch?v=x");
    await expect(openExternal).toHaveAttribute("target", "_blank");
    await expect(openExternal).toHaveAttribute("rel", /noopener/);
  });
});
