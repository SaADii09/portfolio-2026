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
});
