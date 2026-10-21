import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { FallbackPanel } from "@/components/os/FallbackPanel";

/**
 * Unit contract for the extracted embed-failure panel (Task 8).
 *
 * Extracted verbatim from WebView's refused-frame body; the WebView suite
 * (`webview-refusal.test.tsx`) pins that WebView's wiring of it is unchanged.
 * Here we pin the component contract itself: the screenshot attempt renders
 * only when the caller allows one, the img's own error degrades silently, the
 * external escape hatch is always wired to the url, retry is opt-in (blocked
 * tiles have nothing to retry into), and the raw url never leaks into the
 * visible text.
 *
 * F6 (hardening round): the panel paints its surfaces with THEME TOKENS
 * (`bg-os-accent`, `text-os-bg`, `bg-os-surface-alt`, `text-os-text`,
 * `border-os-border`) — no static inline styles survive in the markup.
 * T8: the screenshot card announces the HOST, never the raw url.
 */

const REPO_URL = "https://github.com/SaADii09/portfolio-2026";

describe("FallbackPanel", () => {
  it("renders the cached-screenshot img only when allowScreenshot", () => {
    const { container, rerender } = render(<FallbackPanel url={REPO_URL} allowScreenshot />);
    const shot = container.querySelector<HTMLImageElement>("img[src*='/api/screenshot']");
    expect(shot).not.toBeNull();
    expect(shot?.getAttribute("src")).toBe(`/api/screenshot?url=${encodeURIComponent(REPO_URL)}`);

    rerender(<FallbackPanel url={REPO_URL} allowScreenshot={false} />);
    expect(container.querySelector("img[src*='/api/screenshot']")).toBeNull();
  });

  it("degrades silently when the screenshot img errors", () => {
    const { container } = render(<FallbackPanel url={REPO_URL} allowScreenshot />);
    const shot = container.querySelector<HTMLImageElement>("img[src*='/api/screenshot']");
    expect(shot).not.toBeNull();

    act(() => {
      fireEvent(shot as HTMLImageElement, new Event("error"));
    });

    expect(container.querySelector("img[src*='/api/screenshot']")).toBeNull();
    // The panel itself never depends on the img: copy + escape hatch stay.
    expect(screen.getByText(/can't be embedded/i)).toBeDefined();
    expect(screen.getByText(/Open in new tab/i)).toBeDefined();
  });

  it("keeps the external escape hatch wired to the url", () => {
    render(<FallbackPanel url={REPO_URL} allowScreenshot={false} />);
    const link = screen.getByRole("link", { name: /open in new tab/i });
    expect(link.getAttribute("href")).toBe(REPO_URL);
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("shows the retry affordance only when onRetry is provided", () => {
    const { rerender } = render(
      <FallbackPanel url={REPO_URL} allowScreenshot={false} onRetry={() => {}} />,
    );
    expect(screen.getByRole("button", { name: /retry/i })).toBeDefined();

    // Blocked tiles render the panel without a retry path — no dead button.
    rerender(<FallbackPanel url={REPO_URL} allowScreenshot={false} />);
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
  });

  it("never renders the raw url as visible text", () => {
    const { container } = render(<FallbackPanel url={REPO_URL} allowScreenshot />);
    // The url may appear in href/src/alt attributes (the proxy + escape hatch
    // need it), but none of it is echoed into the panel's text.
    expect(container.textContent).not.toContain(REPO_URL);
  });

  it("paints every surface with theme tokens (no static inline styles)", () => {
    const { container } = render(
      <FallbackPanel url={REPO_URL} allowScreenshot onRetry={() => {}} />,
    );

    // F6: the token classes replace the former inline styles 1:1 — the
    // rendered colors are unchanged, the markup is token-driven.
    const panel = container.firstElementChild as HTMLElement;
    expect(panel.getAttribute("style")).toBeNull();
    expect(panel.className).toContain("text-os-muted");

    const link = screen.getByRole("link", { name: /open in new tab/i });
    expect(link.getAttribute("style")).toBeNull();
    expect(link.className).toContain("bg-os-accent");
    expect(link.className).toContain("text-os-bg");

    const retry = screen.getByRole("button", { name: /retry/i });
    expect(retry.getAttribute("style")).toBeNull();
    expect(retry.className).toContain("bg-os-surface-alt");
    expect(retry.className).toContain("text-os-text");

    const shot = container.querySelector<HTMLImageElement>("img[src*='/api/screenshot']");
    expect(shot?.getAttribute("style")).toBeNull();
    expect(shot?.className).toContain("border");
    expect(shot?.className).toContain("border-os-border");
  });

  it("announces the cached preview by host, never by the raw url", () => {
    const { container } = render(<FallbackPanel url={REPO_URL} allowScreenshot />);
    const shot = container.querySelector<HTMLImageElement>("img[src*='/api/screenshot']");
    // T8: the alt text names the SITE — a screen reader must not read
    // "https://github.com/SaADii09/portfolio-2026" out loud.
    expect(shot?.getAttribute("alt")).toBe("Preview of github.com");
    expect(shot?.getAttribute("alt")).not.toContain("SaADii09");
  });

  it("falls back to a generic alt when the url carries no host", () => {
    const { container } = render(<FallbackPanel url="not a url" allowScreenshot />);
    const shot = container.querySelector<HTMLImageElement>("img[src*='/api/screenshot']");
    // A malformed url must not throw out of the render.
    expect(shot?.getAttribute("alt")).toBe("Cached preview");
  });

  it("keeps its controls hit-testable (the OS window root re-enables pointer events)", () => {
    const { container } = render(
      <FallbackPanel url={REPO_URL} allowScreenshot onRetry={() => {}} />,
    );
    // The panel carries NO pointer-events rule of its own — by design: the OS
    // window root is `pointer-events-auto` (Window.tsx) over the content zone's
    // `pointer-events-none` (Desktop.tsx), so the panel's controls are
    // hit-testable through that root. Pin that nothing INSIDE the panel
    // re-disables them (no inline style, no `pointer-events-none` class).
    const controls = Array.from(container.querySelectorAll("a, button"));
    expect(controls.length).toBe(2);
    for (const control of controls) {
      expect(control.getAttribute("style")).toBeNull();
      expect(control.className).not.toContain("pointer-events-none");
    }
  });
});
