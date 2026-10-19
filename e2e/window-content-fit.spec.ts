import { test, expect, type Page } from "@playwright/test";
import { gotoApp } from "./utils";

/**
 * Content-fit pin (spec AC 8, promoted from e2e/diagnostic-app-measure.spec.ts).
 *
 * Opens every app at 1440×900, 1366×768 and 375×812 and asserts:
 * - Control Panel / About / Contact content fully visible without scrolling;
 * - Projects / Resume open ≥ 90% of their usable safe-zone height;
 * - every window sits inside the safe zone (top bar → dock/status bar);
 * - per-app first-open slots and the locked size table hold at both
 *   desktop viewports (values mirrored from spec §4.4 below — if the
 *   implementation drifts from the locked table, this spec fails).
 */

type Key = "about" | "projects" | "control-panel" | "resume" | "terminal" | "contact";

const APP_KEYS: Key[] = ["about", "projects", "control-panel", "resume", "terminal", "contact"];

/** Desktop icon titles (control-panel's desktop label is "Settings"). */
const ICON_TITLES: Record<Key, string> = {
  about: "Open About Me",
  projects: "Open Projects",
  "control-panel": "Open Settings",
  resume: "Open Resume",
  terminal: "Open Terminal",
  contact: "Open Contact",
};

/** Locked per-app content-fit sizes (spec §4.4, measured content footprints). */
const TABLE: Record<Key, [number, number]> = {
  about: [560, 620],
  projects: [720, 640],
  "control-panel": [460, 640],
  resume: [700, 760],
  terminal: [640, 420],
  contact: [480, 520],
};

/** Apps whose entire content region must be visible with no scrollbars (AC 8). */
const NO_SCROLL_APPS: Key[] = ["about", "control-panel", "contact"];

/** Apps pinned to ≥ 90% of their table height (AC 8's big-window rule). */
const BIG_WINDOW_APPS: Key[] = ["projects", "resume"];

/** Leftover-space anchor fractions (spec §4.4). */
const FRACS: Record<Key, [number, number]> = {
  about: [0, 0.18],
  projects: [0.55, 0.25],
  "control-panel": [0.5, 0.5],
  resume: [0.5, 0.06],
  terminal: [0, 0.9],
  contact: [0.72, 0.25],
};

const MIN_WINDOW_WIDTH = 280;
const MIN_WINDOW_HEIGHT = 200;
const MOBILE_BREAKPOINT = 768;
const MOBILE_TOP_GAP = 8;

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

      // AC 8's big-window rule: Projects/Resume open ≥ 90% of their table
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

test.describe("webview window geometry", () => {
  // The locked webview row (800×560 via the `webview:<url>` key) is only
  // reachable from the UI once Task 4 removes ProjectsApp's hardcoded
  // 520×400 open — while that explicit-size call exists, a project-card
  // webview can never carry the table geometry. The table row is pinned at
  // the unit level (src/test/window-geometry.test.ts) so this spec skips
  // rather than lies. Task 6's diagnostic cleanup / Task 4 Step 0 should
  // flip this to a real open-and-assert.
  test.skip("webview opens at the locked 800×560 default", async () => {});

  test("project preview window opens inside the safe zone @ 1440×900", async ({ page }) => {
    await page.route("**/embeddable-ok", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: "<html><body><h1>Embeddable preview</h1></body></html>",
      }),
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoApp(page);

    await openApp(page, "projects", false);
    await page.getByRole("button", { name: /DevOS Portfolio/ }).click();
    await expect(page.locator('iframe[title="Website preview"]')).toBeVisible({ timeout: 20000 });

    const windows = await page.evaluate(() => {
      const nodes = document.querySelectorAll<HTMLElement>(".os-window-enter");
      return [...nodes].map((el) => {
        const rect = el.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      });
    });
    // Two windows are open (Projects list + preview); both must sit in the zone.
    for (const win of windows) expectInSafeZone(win, 1440, 900);
  });
});
