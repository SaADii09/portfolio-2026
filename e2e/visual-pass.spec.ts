import { test, expect, type Page } from "@playwright/test";
import { gotoApp } from "./utils";

/**
 * Visual pass (Task 6 / spec §7 manual-matrix companion):
 * for each theme × viewport, open the Settings (control-panel) and Projects
 * windows over the live wallpaper and screenshot the desktop at rest.
 * Screenshots land in `visual-pass/` for human inspection.
 *
 * Windows are seeded through the persisted store (same pattern as
 * persistence.spec.ts / window-lifecycle.spec.ts) — deterministic across
 * viewports, immune to desktop-icon occlusion, and with geometry in the
 * content-zone frame the store uses. Runs on chromium only (mirrors the
 * plan's "Playwright script (chromium)" wording).
 */
const THEMES = ["retro", "neon", "editorial"] as const;
const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "375x812", width: 375, height: 812 },
] as const;

test.describe("Visual pass — themes × viewports", () => {
  for (const theme of THEMES) {
    for (const vp of VIEWPORTS) {
      test(`${theme} @ ${vp.name} — Settings + Projects over wallpaper`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await gotoApp(page);

        // Seed the desktop state before hydration: chosen theme + two windows
        // positioned at their per-app anchors in the zone frame.
        await page.addInitScript(
          ({ t, vw, vh }) => {
            const mobile = vw <= 430;
            const zoneTop = mobile ? 32 : 36;
            const zoneBottom = mobile ? 52 : 76;
            const maxW = vw - 32;
            const maxH = vh - zoneTop - zoneBottom;
            const projectsW = Math.min(800, maxW);
            const projectsH = Math.min(560, maxH);
            const panelW = Math.min(560, maxW);
            const panelH = Math.min(520, maxH);
            const projects = mobile
              ? { x: 16, y: zoneTop + 8, width: projectsW, height: projectsH }
              : {
                  x: Math.round(0.55 * (vw - projectsW)),
                  y: Math.round(0.25 * (vh - projectsH - zoneBottom)),
                  width: projectsW,
                  height: projectsH,
                };
            const panel = mobile
              ? { x: 16, y: zoneTop + 8 + 24, width: panelW, height: panelH }
              : {
                  x: Math.round(0.5 * (vw - panelW)),
                  y: Math.round(0.5 * (vh - panelH - zoneBottom)),
                  width: panelW,
                  height: panelH,
                };
            const store = JSON.parse(localStorage.getItem("devos-store") || "{}");
            store.state = {
              ...(store.state ?? {}),
              theme: t,
              windows: [
                {
                  id: "win-visual-projects",
                  title: "Projects",
                  type: "app",
                  component: "projects",
                  ...projects,
                  zIndex: 100,
                  opacity: 1,
                  isMinimized: false,
                  isMaximized: false,
                  isPinned: false,
                },
                {
                  id: "win-visual-panel",
                  title: "Settings",
                  type: "app",
                  component: "control-panel",
                  ...panel,
                  zIndex: 101,
                  opacity: 1,
                  isMinimized: false,
                  isMaximized: false,
                  isPinned: false,
                },
              ],
            };
            localStorage.setItem("devos-store", JSON.stringify(store));
          },
          { t: theme, vw: vp.width, vh: vp.height },
        );

        await page.reload();
        await page.locator(".boot-overlay").waitFor({ state: "detached", timeout: 30_000 });

        // Both windows render.
        await expect(page.getByLabel("Projects")).toBeVisible();
        await expect(page.getByRole("slider", { name: "Glass blur intensity" })).toBeVisible();

        // Let entrance/wallpaper/spring animations settle before the shot.
        await page.waitForTimeout(1_500);
        await page.screenshot({ path: `visual-pass/${theme}-${vp.name}.png` });
      });
    }
  }
});

test.describe("Visual pass — DevOS Browser", () => {
  // Chromium only: this block writes a per-theme artifact, and pinning the
  // engine keeps that artifact written exactly once (the blocks above run on
  // every engine and overwrite each other's files — pre-existing behavior).
  test.skip(({ browserName }) => browserName !== "chromium", "chromium only");

  /** The fixed ProjectMeta the mocked /api/project-meta route answers with. */
  const PROJECT_META = {
    slug: "devos",
    readmeHtml: "<h1>Mocked README</h1><p>Mocked readme body for the visual pass.</p>",
    degraded: false,
    timeline: [
      { label: "Created", period: "Jan 2024" },
      { label: "Updated", period: "Mar 2024" },
    ],
    language: "TypeScript",
    stars: 42,
    homepage: "https://portfolio-2026-sp9k.vercel.app",
    createdAt: "2024-01-01T00:00:00Z",
    pushedAt: "2024-03-01T00:00:00Z",
  };

  for (const theme of THEMES) {
    test(`${theme} @ 1440x900 — Browser window with tabs and the project side panel`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await gotoApp(page);

      // The theme is seeded through the persisted store (same pattern as the
      // blocks above) so the shot is deterministic.
      await page.addInitScript(
        ({ t }) => {
          const store = JSON.parse(localStorage.getItem("devos-store") || "{}");
          store.state = { ...(store.state ?? {}), theme: t };
          localStorage.setItem("devos-store", JSON.stringify(store));
        },
        { t: theme },
      );

      // The project-meta route is mocked so the side panel always has
      // content (no GitHub round trip, no rate limit, no empty rail).
      await page.route("**/api/project-meta*", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(PROJECT_META),
        }),
      );

      await page.reload();
      await page.locator(".boot-overlay").waitFor({ state: "detached", timeout: 30_000 });

      // Open the Browser through the "Projects" desktop icon, then open two
      // project tabs from its home tab.
      await page.getByTitle("Open Projects").dblclick();
      await expect(page.getByRole("tablist", { name: "Browser tabs" })).toBeVisible();
      await page.getByRole("button", { name: /DevOS Portfolio/ }).click();
      await page.getByRole("tab", { name: "Home" }).click();
      await page.getByRole("button", { name: /AI Job Portal/ }).click();
      // The project tab's label is the project title (the hardening round
      // renamed it from the slug) — accept either spelling so the leg
      // survives both builds.
      await expect(page.getByRole("tab", { name: /ai[- ]job[- ]portal/i })).toBeVisible();

      // The side panel is closed by default — the toolbar toggle opens it.
      await page.getByRole("button", { name: "Toggle side panel" }).click();
      await expect(page.getByLabel("Project details")).toBeVisible();
      await expect(page.getByLabel("Timeline").getByText("Created")).toBeVisible();

      // Let entrance/wallpaper/spring animations settle before the shot.
      await page.waitForTimeout(1_500);
      await page.screenshot({ path: `visual-pass/browser-${theme}-1440x900.png` });
    });
  }
});

test.describe("Visual pass — DevOS Browser fallback surfaces", () => {
  // Chromium only: same reason as the browser block above — one artifact per
  // theme, written exactly once.
  test.skip(({ browserName }) => browserName !== "chromium", "chromium only");

  /**
   * A degraded /api/project-meta answer: the upstream served the repo facts
   * but no README body, so the reader renders its degraded copy + escape
   * hatch (the surface the Phase 15 visual pass never captured).
   */
  const DEGRADED_META = {
    slug: "devos",
    readmeHtml: null,
    degraded: true,
    timeline: [
      { label: "Created", period: "2024-01" },
      { label: "Updated", period: "2024-03" },
    ],
    language: "TypeScript",
    stars: 42,
    homepage: "https://portfolio-2026-sp9k.vercel.app",
    createdAt: "2024-01-01T00:00:00Z",
    pushedAt: "2024-03-01T00:00:00Z",
  };

  /** The screenshot proxy is mocked — the panel must never call Microlink. */
  const SCREENSHOT_STUB =
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">' +
    '<rect width="640" height="360" fill="#1a1a2e"/>' +
    '<text x="320" y="185" fill="#a0a0b0" font-family="monospace" font-size="22" ' +
    'text-anchor="middle">mocked cached preview</text></svg>';

  /** Seed the theme through the persisted store (same pattern as above). */
  async function seedTheme(page: Page, theme: string): Promise<void> {
    await page.addInitScript((t) => {
      const store = JSON.parse(localStorage.getItem("devos-store") || "{}");
      store.state = { ...(store.state ?? {}), theme: t };
      localStorage.setItem("devos-store", JSON.stringify(store));
    }, theme);
  }

  for (const theme of THEMES) {
    test(`${theme} @ 1440x900 — a blocked tile renders the fallback panel`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await gotoApp(page);
      await seedTheme(page, theme);

      // The screenshot proxy answers with a stub so the cached-preview card
      // renders without burning Microlink quota.
      await page.route("**/api/screenshot*", (route) =>
        route.fulfill({
          status: 200,
          contentType: "image/svg+xml",
          body: SCREENSHOT_STUB,
        }),
      );

      await page.reload();
      await page.locator(".boot-overlay").waitFor({ state: "detached", timeout: 30_000 });

      await page.getByTitle("Open Projects").dblclick();
      await expect(page.getByRole("tablist", { name: "Browser tabs" })).toBeVisible();

      // "Google" is a BLOCKED tile → the fallback panel renders instantly and
      // no iframe is ever mounted.
      await page.getByRole("button", { name: /^Google$/ }).click();
      await expect(page.getByText(/can't be embedded/i)).toBeVisible();
      await expect(page.getByRole("img", { name: "Preview of www.google.com" })).toBeVisible();
      await expect(page.getByRole("link", { name: /open in new tab/i })).toBeVisible();
      await expect(page.locator("iframe")).toHaveCount(0);

      // Let entrance/wallpaper/spring animations settle before the shot.
      await page.waitForTimeout(1_500);
      await page.screenshot({ path: `visual-pass/fallback-${theme}-1440x900.png` });
    });

    test(`${theme} @ 1440x900 — a degraded meta renders the degraded README`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await gotoApp(page);
      await seedTheme(page, theme);

      await page.route("**/api/project-meta*", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(DEGRADED_META),
        }),
      );

      await page.reload();
      await page.locator(".boot-overlay").waitFor({ state: "detached", timeout: 30_000 });

      await page.getByTitle("Open Projects").dblclick();
      await expect(page.getByRole("tablist", { name: "Browser tabs" })).toBeVisible();

      // The project tab opens on the degraded reader: friendly copy plus the
      // "Open on GitHub" escape hatch (no README body in the cache).
      await page.getByRole("button", { name: /DevOS Portfolio/ }).click();
      await expect(page.getByText(/upstream source may be busy/i)).toBeVisible();
      await expect(page.getByRole("link", { name: /open on github/i })).toBeVisible();
      await expect(page.locator(".token-prose")).toHaveCount(0);

      // Let entrance/wallpaper/spring animations settle before the shot.
      await page.waitForTimeout(1_500);
      await page.screenshot({ path: `visual-pass/degraded-readme-${theme}-1440x900.png` });
    });
  }
});

test.describe("Visual pass — low-Tint floor leg", () => {
  const tints = THEMES;
  for (const theme of tints) {
    test(`${theme} @ 1440x900 — windows at Tint 5 must stay readable`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await gotoApp(page);

      await page.addInitScript(
        ({ t }) => {
          const store = JSON.parse(localStorage.getItem("devos-store") || "{}");
          store.state = {
            ...(store.state ?? {}),
            theme: t,
            windows: [
              {
                id: "win-visual-projects",
                title: "Projects",
                type: "app",
                component: "projects",
                x: 352,
                y: 66,
                width: 800,
                height: 560,
                zIndex: 100,
                opacity: 1,
                isMinimized: false,
                isMaximized: false,
                isPinned: false,
              },
              {
                id: "win-visual-panel",
                title: "Settings",
                type: "app",
                component: "control-panel",
                x: 440,
                y: 152,
                width: 560,
                height: 520,
                zIndex: 101,
                opacity: 1,
                isMinimized: false,
                isMaximized: false,
                isPinned: false,
              },
            ],
          };
          localStorage.setItem("devos-store", JSON.stringify(store));
        },
        { t: theme },
      );
      await page.reload();
      await page.locator(".boot-overlay").waitFor({ state: "detached", timeout: 30_000 });
      await expect(page.getByLabel("Projects")).toBeVisible();

      // Drag the glass Tint down to its minimum on the Settings window.
      const tint = page.getByRole("slider", { name: "Tint" });
      await expect(tint).toBeVisible();
      await tint.fill("5");
      await expect(tint).toHaveValue("5");

      await page.waitForTimeout(1_000);
      await page.screenshot({ path: `visual-pass/lowTint-${theme}-1440x900.png` });

      // Floors: the window body must never go transparent at Tint 5.
      // - generic (retro/editorial): the surface paints backgroundColor with a
      //   color-mix alpha floor → assert backgroundColor alpha.
      // - neon: the surface paints a gradient whose stops carry the floored
      //   max(...) terms → rgba-less, assert the floored gradient is applied.
      const surface = await page.evaluate(() => {
        const el = document.querySelector<HTMLElement>(".os-window-surface");
        if (!el) return null;
        const cs = getComputedStyle(el);
        const srgb = cs.backgroundColor.match(/color\(srgb [^)]+ ([\d.]+)\)/);
        const rgba = cs.backgroundColor.match(/rgba?\([\d.]+, [\d.]+, [\d.]+, ([\d.]+)\)/);
        return {
          bgAlpha: rgba ? parseFloat(rgba[1] ?? "0") : srgb ? parseFloat(srgb[1] ?? "0") : null,
          image: cs.backgroundImage,
        };
      });
      if (theme === "neon") {
        // Chromium resolves max(var(--glass-opacity-dark)*2.5,100%) / max(...,60%)
        // into literal stop alphas: stop-1 opaque (alpha 1, omitted) and
        // stop-2 = 0.6 — the neon stop-2 floor at any Tint ≤ 60.
        expect(surface?.image ?? "", "neon floored gradient applied").toMatch(
          /linear-gradient\(135deg, color\(srgb [^)]+\), color\(srgb [^)]+ \/ 0\.6\)\)/,
        );
      } else {
        expect(surface?.bgAlpha, `${theme} window surface alpha at Tint 5`).toBeGreaterThan(0.4);
      }
    });
  }
});
