import { test, expect } from "@playwright/test";
import { gotoApp } from "./utils";

test.describe("Command palette", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test("Ctrl/Cmd+K opens it; filtering and Enter switch the theme", async ({ page }) => {
    await page.keyboard.press("ControlOrMeta+k");

    const dialog = page.getByRole("dialog", { name: "Command palette" });
    await expect(dialog).toBeVisible();
    const input = page.getByRole("combobox");
    await expect(input).toBeFocused();

    await input.fill("neon");
    await expect(dialog.getByText("Switch theme: Neon City")).toBeVisible();

    await page.keyboard.press("Enter");

    await expect(dialog).not.toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "neon");
  });

  test("typing 'term' and pressing Enter opens the Terminal window", async ({ page }) => {
    await page.keyboard.press("ControlOrMeta+k");
    const input = page.getByRole("combobox");

    await input.fill("term");
    await expect(page.getByRole("option", { name: /Open Terminal/ })).toBeVisible();

    await page.keyboard.press("Enter");

    await expect(page.getByRole("dialog", { name: "Command palette" })).not.toBeVisible();
    await expect(
      page
        .locator(".os-window-enter")
        .filter({ has: page.locator("span.font-display", { hasText: /^Terminal$/ }) }),
    ).toBeVisible();
  });

  test("shows the empty state when nothing matches", async ({ page }) => {
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByRole("combobox").fill("zzz");

    await expect(page.getByText("No matching commands")).toBeVisible();
  });

  test("Escape closes it without opening or closing windows", async ({ page }) => {
    await page.getByTitle("Open About Me").dblclick();
    await expect(page.locator(".os-window-enter")).toHaveCount(1);

    await page.keyboard.press("ControlOrMeta+k");
    const dialog = page.getByRole("dialog", { name: "Command palette" });
    await expect(dialog).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(dialog).not.toBeVisible();
    await expect(page.locator(".os-window-enter")).toHaveCount(1);
  });

  test("opens from the TopBar trigger button", async ({ page }) => {
    await page.locator('button[aria-label="Command palette"]').click();

    await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
    await expect(page.getByRole("combobox")).toBeFocused();
  });

  test.describe("mobile", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("opens from the shade's Search & commands row", async ({ page }) => {
      await page.getByTestId("mobile-shade-knob").click();

      const row = page.getByRole("button", { name: "Search & commands" });
      await expect(row).toBeVisible();

      await row.click();

      await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
      await expect(page.getByRole("combobox")).toBeFocused();
    });
  });
});
