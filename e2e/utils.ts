import { Page } from "@playwright/test";

/**
 * Navigate to the app and wait for the boot screen to finish.
 * The boot overlay sits at z-index 99999 and intercepts all pointer
 * events, so tests must wait until it unmounts before interacting.
 *
 * The boot sequence itself is short — BootScreen runs fixed ~2.7s timers and
 * then unmounts the overlay — but under the full 3-browser Playwright matrix
 * the Next.js dev server also recompiles on every source save, which can
 * stretch first-load bundle delivery + hydration well past the old 15s budget.
 * Give it a generous ceiling, and fail with an explicit message so a genuine
 * boot-screen hang is obvious rather than a bare "waitFor timed out".
 */
export async function gotoApp(page: Page, path = "/") {
  await page.goto(path);
  const overlay = page.locator(".boot-overlay");
  try {
    await overlay.waitFor({ state: "detached", timeout: 30_000 });
  } catch {
    const overlayPresent = await overlay.count().catch(() => -1);
    const bootDelay = await overlay.getAttribute("data-boot-delay").catch(() => null);
    throw new Error(
      `gotoApp: .boot-overlay was still attached 30s after navigating to ${path} ` +
        `(overlayPresent=${overlayPresent}, data-boot-delay=${bootDelay}). ` +
        `If this recurs, suspect stalled client hydration (slow/severed dev-server ` +
        `compile) or a BootScreen/phase bug — not the wait itself.`,
    );
  }
}
