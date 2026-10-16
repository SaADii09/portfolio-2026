import { Page } from "@playwright/test";

/**
 * Navigate to the app and wait for the boot screen to finish.
 * The boot overlay sits at z-index 99999 and intercepts all pointer
 * events, so tests must wait until it unmounts before interacting.
 */
export async function gotoApp(page: Page, path = "/") {
  await page.goto(path);
  await page.locator(".boot-overlay").waitFor({ state: "detached", timeout: 15000 });
}
