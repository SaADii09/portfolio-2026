import { test, expect, type Page, type Locator } from "@playwright/test";
import { gotoApp } from "./utils";

/**
 * Short windows are a CONTRACT (short-window spec G1–G4, the permanent
 * successor of the deleted e2e spike):
 *
 * - every app's window height stops at its per-app floor through the resize
 *   gesture, and a floored window stays inside the safe zone;
 * - at the floor, each app's primary action is IN-VIEWPORT WITHOUT
 *   SCROLLING (that is what the floor VALUE means);
 * - the browser start page compacts below the 299px panel threshold (pure
 *   CSS @container) and restores the full layout above it;
 * - a stale below-floor lastGeometry restores clamped UP;
 * - maximize/restore and the Alt+Arrow snap respect the floor and the zone;
 * - the scroll fade is a real affordance: present while there is more
 *   below, gone at the scroll end.
 *
 * The floor table mirrors APP_MIN_HEIGHTS in src/lib/window-geometry.ts —
 * the repo's locked-table mirror pattern (drift fails here).
 */

test.skip(({ browserName }) => browserName !== "chromium", "chromium only");

type AppKey = "about" | "browser" | "control-panel" | "contact" | "resume";

const VIEWPORT = { width: 1440, height: 900 };
const TOP_BAR = 36;
const BOTTOM_BAR = 76;

/** Mirror of APP_MIN_HEIGHTS (src/lib/window-geometry.ts) — the apps this
 * suite actually launches (the other two floors are exercised by the store
 * pins in src/test/stores.test.ts and the mirror test in window-content-fit). */
const FLOORS: Record<AppKey, number> = {
  about: 480,
  browser: 380,
  "control-panel": 420,
  contact: 500,
  resume: 320,
};

const ICON_TITLES: Record<AppKey, string> = {
  about: "Open About Me",
  browser: "Open Browser",
  "control-panel": "Open Settings",
  contact: "Open Contact",
  resume: "Open Resume",
};

/** Window-header titles (APP_DEFS titles — "About Me", not "About"). */
const WINDOW_TITLES: Record<AppKey, string> = {
  about: "About Me",
  browser: "Browser",
  "control-panel": "Control Panel",
  contact: "Contact",
  resume: "Resume",
};

/** The OS window whose header reads exactly `title`. */
function windowByTitle(page: Page, title: string): Locator {
  return page
    .locator(".os-window-enter")
    .filter({ has: page.locator("span.font-display", { hasText: new RegExp(`^${title}$`) }) });
}

/** Launch an app through its desktop icon (the established dblclick path). */
async function launchApp(page: Page, key: AppKey): Promise<Locator> {
  await page.getByTitle(ICON_TITLES[key]).dblclick();
  const win = windowByTitle(page, WINDOW_TITLES[key]);
  await expect(win).toBeVisible();
  return win;
}

/** The window HEADER's close button (the browser's Home tab has its own). */
function closeWindow(page: Page, win: Locator): Promise<void> {
  return win.locator(".os-drag-handle").getByLabel("Close").click();
}

/**
 * Drag the south edge handle UP far enough that the gesture's clamp — not
 * the pointer — decides the final height: the window MUST land exactly on
 * its floor. The pointer path stays inside the viewport (chromium delivers
 * real coordinates; firefox's interpolated steps are why this pin is
 * chromium-pinned).
 */
async function shrinkToFloor(page: Page, win: Locator, floor: number): Promise<number> {
  const before = (await win.boundingBox())!;
  const handle = win.locator(".cursor-ns-resize.bottom-0");
  const hb = (await handle.boundingBox())!;
  const startX = hb.x + hb.width / 2;
  const startY = hb.y + hb.height / 2;
  const dy = before.height - floor + 80;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, Math.max(5, startY - dy), { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(async () => (await win.boundingBox())?.height ?? -1, { timeout: 5_000 })
    .toBe(floor);
  return floor;
}

/** True when the painted box sits inside the content zone (±1 rounding). */
async function inSafeZone(win: Locator): Promise<boolean> {
  const box = (await win.boundingBox())!;
  const vh = VIEWPORT.height;
  return (
    box.y >= TOP_BAR - 1 &&
    box.y + box.height <= vh - BOTTOM_BAR + 1 &&
    box.x >= -1 &&
    box.x + box.width <= VIEWPORT.width + 1
  );
}

/** True when the element's box is inside the visible vertical band (top bar
 * → dock). Horizontal containment is asserted separately where it matters
 * (inSafeZone); these reachability pins only need the band. */
function inVerticalBand(box: { y: number; height: number }): boolean {
  return (
    box.y >= TOP_BAR - 1 && box.y + box.height <= VIEWPORT.height - BOTTOM_BAR + 1 && box.height > 0
  );
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await gotoApp(page);
});

test("every floored app keeps its primary action in-viewport without scrolling", async ({
  page,
}) => {
  // contact 500 → Send Message · about 480 → GitHub link · control-panel 420
  // → the Theme section (its controls). Each is the action the floor VALUE
  // was derived from (spec's acceptance semantics).
  const cases: Array<{ key: AppKey; find: () => Locator }> = [
    { key: "contact", find: () => page.getByRole("button", { name: /send message/i }) },
    { key: "about", find: () => page.getByRole("link", { name: /github/i }) },
    {
      key: "control-panel",
      find: () => page.getByRole("heading", { name: "Theme" }).locator(".."),
    },
  ];
  for (const { key, find } of cases) {
    const win = await launchApp(page, key);
    await shrinkToFloor(page, win, FLOORS[key]);
    const action = find();
    await expect(action).toBeVisible();
    const box = (await action.boundingBox())!;
    expect(inVerticalBand(box), `${key}'s primary action at its floor`).toBe(true);
    await closeWindow(page, win);
    await expect(win).toHaveCount(0);
  }
});

test("the resize handle stops at the floor and the floored window stays in the zone", async ({
  page,
}) => {
  for (const key of ["browser", "resume"] as const) {
    const win = await launchApp(page, key);
    await shrinkToFloor(page, win, FLOORS[key]);
    expect(await inSafeZone(win), `${key} at its floor stays in the safe zone`).toBe(true);
    await closeWindow(page, win);
    await expect(win).toHaveCount(0);
  }
});

test("the browser start page compacts at the floor and restores above it", async ({ page }) => {
  const win = await launchApp(page, "browser");
  const panel = win.locator(".browser-tab-panel");

  // Full layout at the open size (660): greeting + tile labels visible.
  await expect(page.getByText(/good (morning|afternoon|evening|night)/i)).toBeVisible();
  await expect(panel.locator(".browser-tile-label").first()).toBeVisible();

  await shrinkToFloor(page, win, FLOORS.browser);

  // Compact layout at the 380 floor: greeting + labels hidden, the colored
  // squares (aria-labels) and the Shortcuts region remain fully in view.
  await expect(page.getByText(/good (morning|afternoon|evening|night)/i)).toBeHidden();
  await expect(panel.locator(".browser-tile-label").first()).toBeHidden();
  await expect(panel.getByRole("button", { name: "GitHub" })).toBeVisible();
  const shortcuts = panel.getByRole("heading", { name: "Shortcuts" }).locator("..");
  const box = (await shortcuts.boundingBox())!;
  expect(inVerticalBand(box), "Shortcuts region fully in view at the floor").toBe(true);

  // The measured panel announces itself for the fade — at the 380 floor the
  // projects list genuinely overflows, so the panel IS scrollable (exact
  // value, not presence: the false case would mean the compaction broke).
  await expect(panel).toHaveAttribute("data-scrollable", "true");

  // Restoring the full height brings the full layout back (pure CSS — no
  // JS breakpoint to get stuck).
  const handle = win.locator(".cursor-ns-resize.bottom-0");
  const hb = (await handle.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, Math.min(VIEWPORT.height - 5, hb.y + 400), {
    steps: 8,
  });
  await page.mouse.up();
  await expect(page.getByText(/good (morning|afternoon|evening|night)/i)).toBeVisible({
    timeout: 5_000,
  });
  await expect(panel.locator(".browser-tile-label").first()).toBeVisible();
});

test("a stale below-floor lastGeometry restores clamped UP to the floor", async ({ page }) => {
  // A geometry persisted before the floors shipped (960×225) must not
  // resurrect a 225px browser — it restores at the 380 floor, x/y kept.
  await page.addInitScript(() => {
    const store = {
      state: {} as {
        lastGeometry?: Record<string, { x: number; y: number; width: number; height: number }>;
      },
      version: 1,
    };
    store.state.lastGeometry = {
      browser: { x: 40, y: 30, width: 960, height: 225 },
    };
    localStorage.setItem("devos-store", JSON.stringify(store));
  });
  await page.goto("/");
  await gotoApp(page);

  const win = await launchApp(page, "browser");
  const box = (await win.boundingBox())!;
  expect(box.height).toBe(FLOORS.browser);
  expect(box.width).toBe(960);
  expect(box.x).toBe(40);
  // Store y 30 paints at 30 + topBar (zone-frame restore, no +topBar shift).
  expect(box.y).toBe(30 + TOP_BAR);
});

test("maximize → restore round-trips a floored window", async ({ page }) => {
  const win = await launchApp(page, "browser");
  await shrinkToFloor(page, win, FLOORS.browser);

  await win.getByLabel("Maximize").click();
  await expect
    .poll(async () => (await win.boundingBox())?.height ?? -1)
    .toBe(VIEWPORT.height - TOP_BAR - BOTTOM_BAR);

  await win.getByLabel("Restore").click();
  await expect.poll(async () => (await win.boundingBox())?.height ?? -1).toBe(FLOORS.browser);
  expect(await inSafeZone(win)).toBe(true);
});

test("Alt+Arrow snap on a floored window stays inside the safe zone", async ({ page }) => {
  const win = await launchApp(page, "about");
  await shrinkToFloor(page, win, FLOORS.about);

  await win.locator(".os-drag-handle").click();
  await page.keyboard.press("Alt+ArrowLeft");

  await expect
    .poll(async () => {
      const box = (await win.boundingBox())!;
      return box.width;
    })
    .toBeLessThan(VIEWPORT.width);
  expect(await inSafeZone(win), "snapped half stays in the safe zone").toBe(true);
});

test("the scroll fade appears while there is more below and leaves at the end", async ({
  page,
}) => {
  // Control Panel at its 420 floor deliberately scrolls below the Theme
  // section (the floor trades full-content fit for the settings' reach) —
  // a genuinely scrollable body to exercise the G4 affordance.
  const win = await launchApp(page, "control-panel");
  await shrinkToFloor(page, win, FLOORS["control-panel"]);

  const content = win.locator(".os-window-content");
  await expect(content).toHaveAttribute("data-scrollable", "true");
  await expect(content).toHaveAttribute("data-scrolled-end", "false");
  const whileScrolling = await content.evaluate((el) => getComputedStyle(el, "::after").content);
  expect(whileScrolling, "the fade ::after is painted mid-scroll").not.toBe("none");

  await content.hover();
  await page.mouse.wheel(0, 2000);
  await expect(content).toHaveAttribute("data-scrolled-end", "true", { timeout: 5_000 });
  const atEnd = await content.evaluate((el) => getComputedStyle(el, "::after").content);
  expect(atEnd, "the fade is gone at the scroll end").toBe("none");
});

test("the degraded README escape hatch stays reachable at the browser floor", async ({ page }) => {
  // Route-mocked degraded meta (no network): the README leg renders the
  // top-aligned escape hatch — reachable at the 380 floor (G3 + B2).
  await page.route("**/api/project-meta*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        slug: "devos",
        readmeHtml: null,
        degraded: true,
        timeline: [],
        language: "TypeScript",
        stars: 0,
        homepage: null,
        createdAt: "2024-01-01T00:00:00Z",
        pushedAt: "2024-03-01T00:00:00Z",
      }),
    }),
  );

  const win = await launchApp(page, "browser");
  await page.getByRole("button", { name: /DevOS Portfolio/ }).click();
  const readmeBody = win.locator(".browser-tab-panel");
  await expect(readmeBody.getByRole("link", { name: /open on github/i })).toBeVisible({
    timeout: 10_000,
  });

  await shrinkToFloor(page, win, FLOORS.browser);
  const link = readmeBody.getByRole("link", { name: /open on github/i });
  const box = (await link.boundingBox())!;
  expect(inVerticalBand(box), "the escape hatch is in-viewport at the floor").toBe(true);
});
