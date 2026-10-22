import { test, expect, type Page } from "@playwright/test";
import { gotoApp } from "./utils";

/**
 * Content-fit pin (spec AC 8, promoted from e2e/diagnostic-app-measure.spec.ts).
 *
 * Opens every app at 1440×900, 1366×768 and 375×812 and asserts:
 * - Control Panel / About / Contact content fully visible without scrolling;
 * - Browser / Resume open ≥ 90% of their usable safe-zone height;
 * - every window sits inside the safe zone (top bar → dock/status bar);
 * - per-app first-open slots and the locked size table hold at both
 *   desktop viewports (values mirrored from spec §4.4 below — if the
 *   implementation drifts from the locked table, this spec fails).
 */

type Key = "about" | "browser" | "control-panel" | "resume" | "terminal" | "contact";

const APP_KEYS: Key[] = ["about", "browser", "control-panel", "resume", "terminal", "contact"];

/**
 * Desktop icon titles (control-panel's desktop label is "Settings"). After
 * the identity split each app launches via its OWN icon — the DevOS Browser
 * singleton's geometry is measured through the dedicated "Open Browser" icon,
 * while the "Open Projects" icon now opens the Projects registry window.
 */
const ICON_TITLES: Record<Key, string> = {
  about: "Open About Me",
  browser: "Open Browser",
  "control-panel": "Open Settings",
  resume: "Open Resume",
  terminal: "Open Terminal",
  contact: "Open Contact",
};

/**
 * Locked per-app content-fit sizes (spec §4.4, measured content footprints).
 * The browser row mirrors BROWSER_SIZE in src/lib/window-geometry.ts.
 */
const TABLE: Record<Key, [number, number]> = {
  about: [560, 620],
  browser: [960, 660],
  "control-panel": [460, 640],
  resume: [700, 760],
  terminal: [640, 420],
  contact: [480, 520],
};

/** Apps whose entire content region must be visible with no scrollbars (AC 8). */
const NO_SCROLL_APPS: Key[] = ["about", "control-panel", "contact"];

/** Apps pinned to ≥ 90% of their table height (AC 8's big-window rule). */
const BIG_WINDOW_APPS: Key[] = ["browser", "resume"];

/** Leftover-space anchor fractions (spec §4.4). The browser row mirrors
 *  BROWSER_SLOT in src/lib/window-geometry.ts. */
const FRACS: Record<Key, [number, number]> = {
  about: [0, 0.18],
  browser: [0.5, 0.1],
  "control-panel": [0.5, 0.5],
  resume: [0.5, 0.06],
  terminal: [0, 0.9],
  contact: [0.72, 0.25],
};

const MIN_WINDOW_WIDTH = 280;
const MIN_WINDOW_HEIGHT = 200;
const MOBILE_BREAKPOINT = 768;
const MOBILE_TOP_GAP = 8;

/**
 * Mirror of APP_MIN_HEIGHTS (src/lib/window-geometry.ts, short-window spec).
 * The mirror above computes open-path heights the SAME way the store does;
 * this table exists to VERIFY the floors never bind on the open path at the
 * tested viewports (a floor binding would change open sizes — and this spec
 * would then be asserting stale numbers).
 */
const FLOORS: Record<Key, number> = {
  about: 480,
  browser: 380,
  "control-panel": 420,
  resume: 320,
  terminal: 200,
  contact: 500,
};

const clampNum = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));

/**
 * Mirror of spec §4.4's locked first-open geometry (same formula and rounding
 * order as src/lib/window-geometry.ts): slot → clamp → round → safe-zone clamp.
 */
function expectedAppGeometry(key: Key, vw: number, vh: number, cascade: number) {
  const isMobile = vw < MOBILE_BREAKPOINT;
  const topBar = isMobile ? 32 : 36;
  const bottomBar = isMobile ? 52 : 76;
  const [tableW, tableH] = TABLE[key];
  const width = isMobile
    ? Math.max(MIN_WINDOW_WIDTH, Math.min(tableW, vw - 32))
    : Math.max(MIN_WINDOW_WIDTH, Math.min(tableW, vw));
  const height = isMobile
    ? Math.max(MIN_WINDOW_HEIGHT, Math.min(tableH, vh - 140))
    : Math.max(MIN_WINDOW_HEIGHT, Math.min(tableH, vh - topBar - bottomBar));
  let rawX: number;
  let rawY: number;
  if (isMobile) {
    rawX = clampNum((vw - width) / 2 + cascade, 0, vw - width);
    rawY = clampNum(topBar + MOBILE_TOP_GAP + cascade, topBar, vh - height - bottomBar);
  } else {
    const [leftFrac, topFrac] = FRACS[key];
    rawX = clampNum(leftFrac * (vw - width) + cascade, 0, vw - width);
    rawY = clampNum(topFrac * (vh - height - bottomBar) + cascade, topBar, vh - height - bottomBar);
  }
  return {
    x: clampNum(Math.round(rawX), 0, vw - width),
    y: clampNum(Math.round(rawY), topBar, vh - height - bottomBar),
    width,
    height,
  };
}

interface WindowMeasure {
  x: number;
  y: number;
  width: number;
  height: number;
  overflowX: number;
  overflowY: number;
}

async function measureWindow(page: Page): Promise<WindowMeasure> {
  return page.evaluate(() => {
    const win = document.querySelector<HTMLElement>(".os-window-enter");
    if (!win) throw new Error("no window open");
    const content = win.querySelector<HTMLElement>(".os-window-content");
    const rect = win.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      overflowX: content ? content.scrollWidth - content.clientWidth : 0,
      overflowY: content ? content.scrollHeight - content.clientHeight : 0,
    };
  });
}

/** Contained in the content safe zone (below the top bar, above the dock/status bar). */
function expectInSafeZone(
  m: { x: number; y: number; width: number; height: number },
  vw: number,
  vh: number,
) {
  const topBar = vw < MOBILE_BREAKPOINT ? 32 : 36;
  const bottomBar = vw < MOBILE_BREAKPOINT ? 52 : 76;
  expect(m.x, "left edge inside viewport").toBeGreaterThanOrEqual(0);
  expect(m.x + m.width, "right edge inside viewport").toBeLessThanOrEqual(vw + 1);
  expect(m.y, "top edge below the top bar").toBeGreaterThanOrEqual(topBar - 1);
  expect(m.y + m.height, "bottom edge above the bottom bar").toBeLessThanOrEqual(
    vh - bottomBar + 1,
  );
}

test("the per-app floors never bind on the open path at the tested viewports", async () => {
  // Pure mirror arithmetic (no browser): at every viewport this spec opens
  // apps at, the open path's clamped height must sit AT OR ABOVE the app's
  // floor — otherwise a floor WOULD bind and every size pin above would be
  // asserting post-floor numbers while the mirror above (floorless) says
  // otherwise. This is the explicit reconciliation the short-window spec
  // demands; if it fails, the mirror and the floor table have drifted.
  for (const [vw, vh] of [
    [1440, 900],
    [1366, 768],
    [375, 812],
  ] as const) {
    for (const key of APP_KEYS) {
      const expected = expectedAppGeometry(key, vw, vh, 0);
      expect(
        expected.height,
        `open height for ${key} @ ${vw}×${vh} ≥ floor (floor must not bind)`,
      ).toBeGreaterThanOrEqual(FLOORS[key]);
    }
  }
});

async function openApp(page: Page, key: Key, mobile: boolean) {
  const icon = page.getByTitle(ICON_TITLES[key]);
  await expect(icon).toBeVisible();
  if (mobile) {
    await icon.click(); // mobile icons open on a single tap
  } else {
    await icon.dblclick();
  }
  await expect(page.locator(".os-window-enter")).toBeVisible();
}

for (const [vw, vh] of [
  [1440, 900],
  [1366, 768],
] as [number, number][]) {
  for (const app of APP_KEYS) {
    test(`slot pin: ${app} opens at its locked size and slot @ ${vw}×${vh}`, async ({ page }) => {
      await page.setViewportSize({ width: vw, height: vh });
      await gotoApp(page);

      await openApp(page, app, false);
      const measured = await measureWindow(page);
      const expected = expectedAppGeometry(app, vw, vh, 0);

      expect(Math.abs(measured.width - expected.width), `${app} width`).toBeLessThanOrEqual(1);
      expect(Math.abs(measured.height - expected.height), `${app} height`).toBeLessThanOrEqual(1);
      expect(Math.abs(measured.x - expected.x), `${app} slot x`).toBeLessThanOrEqual(1);
      // expectedAppGeometry is in the spec's painted frame; measured rect too.
      expect(Math.abs(measured.y - expected.y), `${app} slot y`).toBeLessThanOrEqual(1);

      expectInSafeZone(measured, vw, vh);

      // AC 8's big-window rule: Browser/Resume open ≥ 90% of their table
      // height (which opens as min(table, safe-zone height) exactly).
      if (BIG_WINDOW_APPS.includes(app)) {
        expect(measured.height, `${app} ≥ 90% of its table height`).toBeGreaterThanOrEqual(
          0.9 * Math.min(TABLE[app][1], expected.height),
        );
      }

      // Entire content visible without scrolling (AC 8).
      if (NO_SCROLL_APPS.includes(app)) {
        expect(measured.overflowY, `${app} content overflowY`).toBeLessThanOrEqual(1);
        expect(measured.overflowX, `${app} content overflowX`).toBeLessThanOrEqual(1);
      }
    });
  }
}

test.describe("mobile content fit @ 375×812", () => {
  for (const app of APP_KEYS) {
    test(`${app} opens inside the safe zone`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await gotoApp(page);

      await openApp(page, app, true);
      const measured = await measureWindow(page);
      const expected = expectedAppGeometry(app, 375, 812, 0);

      expect(Math.abs(measured.width - expected.width), `${app} fill width`).toBeLessThanOrEqual(1);
      expect(Math.abs(measured.height - expected.height), `${app} fill height`).toBeLessThanOrEqual(
        1,
      );
      // Mobile windows are centered and pinned just under the status bar
      // (painted frame, same function for both branches).
      expect(Math.abs(measured.x - expected.x), `${app} centered x`).toBeLessThanOrEqual(1);
      expect(Math.abs(measured.y - expected.y), `${app} status-bar y`).toBeLessThanOrEqual(1);

      expectInSafeZone(measured, 375, 812);
    });
  }
});

test.describe("zone-frame clamp holds on viewport resize (no painted-frame teleport)", () => {
  // Windows opened in the content zone's top slots (store y < topBar) must
  // not teleport down by a chrome-bar offset when clampAllWindows runs on a
  // viewport resize (useViewportClamp → clampToViewport).
  test("desktop zone-top window stays put across a viewport resize", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoApp(page);
    await openApp(page, "about", false);
    const before = await measureWindow(page);
    expect(before.y, "about opens at its zone-top slot").toBeLessThanOrEqual(38);

    await page.setViewportSize({ width: 1366, height: 768 });
    await expect(async () => {
      const after = await measureWindow(page);
      expect(after.y, "no +36px teleport after clampAllWindows").toBeLessThanOrEqual(before.y + 1);
      expect(after.y, "still at the zone top").toBeGreaterThanOrEqual(35);
    }).toPass();
  });

  test("mobile status-bar window stays put across a viewport resize", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoApp(page);
    await openApp(page, "contact", true);
    const before = await measureWindow(page);
    expect(before.y, "contact opens just under the status bar").toBeLessThanOrEqual(42);

    await page.setViewportSize({ width: 320, height: 700 });
    await expect(async () => {
      const after = await measureWindow(page);
      expect(after.y, "no +32px teleport after clampAllWindows").toBeLessThanOrEqual(before.y + 1);
    }).toPass();
  });
});

test.describe("browser-hosted webview geometry", () => {
  // The DevOS Browser is now the webview's HOST: a web page opens as a TAB
  // inside the browser window instead of a separate `webview:<url>` OS window
  // (the legacy iframe-window producer is gone — project cards open browser
  // tabs). The locked `webview:<url>` row stays pinned at the unit level
  // (src/test/window-geometry.test.ts); what the browser level must prove is
  // that the host window keeps its locked browser size and that no second OS
  // window is spawned for the embed.
  test("the browser window hosts the webview at its locked 960×660 default @ 1440×900", async ({
    page,
  }) => {
    // The embed target is stalled (never fulfilled) so the suite never
    // reaches an external site and the frame stays mounted.
    await page.route(/^https:\/\/en\.wikipedia\.org\/?$/, () => {
      /* deliberately stalled — see the comment above */
    });
    // The stalled frame makes the WebView's 3500ms watchdog ask the server
    // for a verdict — the route is MOCKED so the suite stays network-free
    // (the real one does a DNS + HEAD against the embed host).
    await page.route("**/api/embed-check*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ embeddable: true, reason: "ok" }),
      }),
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoApp(page);

    await openApp(page, "browser", false);

    // The webview surface — the browser window that hosts the embed.
    const webview = page
      .locator(".os-window-surface")
      .filter({ has: page.getByRole("tablist", { name: "Browser tabs" }) });
    await expect(webview).toHaveCount(1);
    const box = await webview.boundingBox();
    expect(box, "browser window paints").not.toBeNull();
    expect(Math.abs(box!.width - 960), "browser width = locked 960").toBeLessThanOrEqual(2);
    expect(Math.abs(box!.height - 660), "browser height = locked 660").toBeLessThanOrEqual(2);
    expectInSafeZone(box!, 1440, 900);

    // A web tile opens a TAB inside that window — never a second OS window.
    await page.getByRole("button", { name: "Wikipedia", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Wikipedia" })).toBeVisible();
    await expect(page.locator(".os-window-enter")).toHaveCount(1);
  });

  test("a project card opens a project tab inside the browser window @ 1440×900", async ({
    page,
  }) => {
    await page.route("**/api/project-meta*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          slug: "devos",
          readmeHtml: "<h1>Mocked README</h1>",
          degraded: false,
          timeline: [{ label: "Created", period: "Jan 2024" }],
          language: "TypeScript",
          stars: 42,
          homepage: null,
          createdAt: "2024-01-01T00:00:00Z",
          pushedAt: "2024-03-01T00:00:00Z",
        }),
      }),
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoApp(page);

    await openApp(page, "browser", false);
    await page.getByRole("button", { name: /DevOS Portfolio/ }).click();
    // Project tabs are titled by the PROJECT title (not the slug — Phase 15.1).
    await expect(page.getByRole("tab", { name: "DevOS Portfolio" })).toBeVisible();

    // ONE window is open (the browser) and it must sit in the zone.
    const windows = await page.evaluate(() => {
      const nodes = document.querySelectorAll<HTMLElement>(".os-window-enter");
      return [...nodes].map((el) => {
        const rect = el.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      });
    });
    expect(windows, "the project card must not spawn a second OS window").toHaveLength(1);
    for (const win of windows) expectInSafeZone(win, 1440, 900);
  });
});
