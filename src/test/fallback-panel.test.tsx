import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { FallbackPanel } from "@/components/os/FallbackPanel";

/**
 * Unit contract for the blocked-site preview panel (Task A3 redesign).
 *
 * The panel is the intentional preview for sites that genuinely refuse
 * framing: a full-width live-preview screenshot (not a 176px thumbnail), a
 * slim honest header naming the host, "Open in new tab" as the primary
 * action, a Reader mode (public render proxy, clearly attributed) for
 * readable in-page content, and Retry only where an iframe attempt happened.
 * The raw url never leaks into the visible text; every surface is painted
 * with theme tokens.
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

  it("renders the screenshot as a live page preview that fills the panel", () => {
    const { container } = render(<FallbackPanel url={REPO_URL} allowScreenshot />);
    const shot = container.querySelector<HTMLImageElement>("img[src*='/api/screenshot']");
    expect(shot?.className).toContain("w-full");
    // The capture fills the space the header/actions leave (the old capped
    // aspect-video stamp pushed the escape hatch below the fold).
    expect(shot?.className).toContain("flex-1");
    expect(shot?.className).toContain("object-cover");
    expect(shot?.className).toContain("object-top");
    expect(shot?.className).not.toContain("max-h-44");
  });

  it("keeps the header and actions ABOVE the preview (they must be visible at rest)", () => {
    const { container } = render(<FallbackPanel url={REPO_URL} allowScreenshot />);
    const shot = container.querySelector<HTMLImageElement>("img[src*='/api/screenshot']");
    const header = screen.getByText(/blocks embedding — live preview below/);
    const opens = screen.getByRole("link", { name: /Open in new tab/ });
    const preview = shot as HTMLImageElement;
    // Node.compareDocumentPosition: FOLLOWING (0x04) means the preview comes after.
    expect(header.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(opens.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Markup order alone isn't enough: the container must be a column flex.
    expect(container.firstElementChild?.className).toContain("flex-col");
  });

  it("headers the host, not the line about X-Frame-Options", () => {
    render(<FallbackPanel url={REPO_URL} allowScreenshot />);
    expect(screen.getByText(/github\.com blocks embedding — live preview below/)).toBeDefined();
  });

  it("keeps a host header for an unparsable url", () => {
    render(<FallbackPanel url="not a url" allowScreenshot />);
    expect(screen.getByText(/This page blocks embedding — live preview below/)).toBeDefined();
  });

  it("degrades silently when the screenshot img errors (neutral info turns into the error icon)", () => {
    const { container } = render(<FallbackPanel url={REPO_URL} allowScreenshot />);
    const shot = container.querySelector<HTMLImageElement>("img[src*='/api/screenshot']");
    expect(shot).not.toBeNull();
    // Neutral header: no warning triangle while the preview is intact.
    expect(container.querySelector('[data-testid="screenshot-failed-icon"]')).toBeNull();

    act(() => {
      fireEvent(shot as HTMLImageElement, new Event("error"));
    });

    expect(container.querySelector("img[src*='/api/screenshot']")).toBeNull();
    // The panel itself never depends on the img: copy + escape hatch stay.
    expect(screen.getByText(/blocks embedding/)).toBeDefined();
    expect(screen.getByText(/Open in new tab/i)).toBeDefined();
    // The warning triangle appears ONLY when the screenshot itself failed.
    expect(container.querySelector('[data-testid="screenshot-failed-icon"]')).not.toBeNull();
  });

  it("keeps the external escape hatch as the primary 44px action", () => {
    render(<FallbackPanel url={REPO_URL} allowScreenshot={false} />);
    const link = screen.getByRole("link", { name: /open in new tab/i });
    expect(link.getAttribute("href")).toBe(REPO_URL);
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.className).toContain("min-h-[44px]");
    expect(link.className).toContain("bg-os-accent");
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

  it("keeps its controls hit-testable and the retry control 44px", () => {
    const { container } = render(
      <FallbackPanel url={REPO_URL} allowScreenshot onRetry={() => {}} />,
    );
    // The panel carries NO pointer-events rule of its own — by design: the OS
    // window root is `pointer-events-auto` (Window.tsx) over the content zone's
    // `pointer-events-none` (Desktop.tsx), so the panel's controls are
    // hit-testable through that root. Preview branch controls: open (1),
    // read (2), retry (3).
    const controls = Array.from(container.querySelectorAll("a, button"));
    expect(controls.length).toBe(3);
    for (const control of controls) {
      expect(control.getAttribute("style")).toBeNull();
      expect(control.className).not.toContain("pointer-events-none");
    }
    const retry = screen.getByRole("button", { name: /retry/i });
    expect(retry.className).toContain("min-h-[44px]");
    expect(retry.className).toContain("bg-os-surface-alt");
  });

  describe("Reader mode", () => {
    it('swaps to an attributed r.jina.ai reader behind "Read this page"', () => {
      const { container } = render(<FallbackPanel url={REPO_URL} allowScreenshot />);

      act(() => {
        screen.getByRole("button", { name: /read this page/i }).click();
      });

      const reader = container.querySelector<HTMLIFrameElement>("iframe[title='Reader view']");
      expect(reader).not.toBeNull();
      expect(reader?.getAttribute("src")).toBe(`https://r.jina.ai/${REPO_URL}`);
      expect(screen.getByText(/content via r\.jina\.ai/)).toBeDefined();
      // A loading state owns the frame until it settles (jsdom never fires
      // the load, so the indicator staying visible is itself the pin).
      expect(screen.getByText(/loading reader/i)).toBeDefined();
      // The preview body is gone while reading.
      expect(container.querySelector("img[src*='/api/screenshot']")).toBeNull();
    });

    it("clears the loading state once the reader frame loads", () => {
      const { container } = render(<FallbackPanel url={REPO_URL} allowScreenshot />);
      act(() => {
        screen.getByRole("button", { name: /read this page/i }).click();
      });

      const reader = container.querySelector("iframe[title='Reader view']") as HTMLIFrameElement;
      act(() => {
        fireEvent.load(reader);
      });

      expect(screen.queryByText(/loading reader/i)).toBeNull();
      expect(container.querySelector("iframe[title='Reader view']")).not.toBeNull();
    });

    it("degrades to 'Reader unavailable' when the reader settles too slowly (or errors)", () => {
      vi.useFakeTimers();
      try {
        const { container } = render(<FallbackPanel url={REPO_URL} allowScreenshot />);
        act(() => {
          screen.getByRole("button", { name: /read this page/i }).click();
        });

        // No settled load inside the budget → the degrade state.
        act(() => {
          vi.advanceTimersByTime(10000);
        });

        expect(container.querySelector("iframe[title='Reader view']")).toBeNull();
        expect(screen.getByText(/reader unavailable/i)).toBeDefined();
        expect(screen.getByRole("link", { name: /open in new tab/i })).toBeDefined();
      } finally {
        vi.useRealTimers();
      }
    });

    it('restores the preview behind "Back to preview"', () => {
      const { container } = render(<FallbackPanel url={REPO_URL} allowScreenshot />);
      act(() => {
        screen.getByRole("button", { name: /read this page/i }).click();
      });
      act(() => {
        screen.getByRole("button", { name: /back to preview/i }).click();
      });

      expect(container.querySelector("iframe[title='Reader view']")).toBeNull();
      expect(screen.getByText(/blocks embedding/)).toBeDefined();
    });

    it("still offers Back to preview from the degraded reader", () => {
      vi.useFakeTimers();
      try {
        const { container } = render(<FallbackPanel url={REPO_URL} allowScreenshot />);
        act(() => {
          screen.getByRole("button", { name: /read this page/i }).click();
        });
        act(() => {
          vi.advanceTimersByTime(10000);
        });

        act(() => {
          screen.getByRole("button", { name: /back to preview/i }).click();
        });

        expect(screen.getByText(/blocks embedding/)).toBeDefined();
        expect(container.querySelector("iframe[title='Reader view']")).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it("never renders the raw url as visible text", () => {
    const { container } = render(<FallbackPanel url={REPO_URL} allowScreenshot />);
    // The url may appear in href/src/alt attributes (the proxy + escape hatch
    // need it), but none of it is echoed into the panel's text.
    expect(container.textContent).not.toContain(REPO_URL);

    act(() => {
      screen.getByRole("button", { name: /read this page/i }).click();
    });
    expect(container.textContent).not.toContain(REPO_URL);
  });

  it("paints every surface with theme tokens (no static inline styles)", () => {
    const { container } = render(
      <FallbackPanel url={REPO_URL} allowScreenshot onRetry={() => {}} />,
    );

    const panel = container.firstElementChild as HTMLElement;
    expect(panel.getAttribute("style")).toBeNull();
    expect(panel.className).toContain("text-os-muted");

    const link = screen.getByRole("link", { name: /open in new tab/i });
    expect(link.getAttribute("style")).toBeNull();
    expect(link.className).toContain("text-os-bg");

    const shot = container.querySelector<HTMLImageElement>("img[src*='/api/screenshot']");
    expect(shot?.getAttribute("style")).toBeNull();
    expect(shot?.className).toContain("border-os-border");

    // The reader branch shares the token-only rule.
    act(() => {
      screen.getByRole("button", { name: /read this page/i }).click();
    });
    const readerBody = container.firstElementChild as HTMLElement;
    expect(readerBody.getAttribute("style")).toBeNull();
    for (const control of Array.from(container.querySelectorAll("a, button"))) {
      expect(control.getAttribute("style")).toBeNull();
    }
  });

  it("announces the cached preview by host, never by the raw url", () => {
    const { container } = render(<FallbackPanel url={REPO_URL} allowScreenshot />);
    const shot = container.querySelector<HTMLImageElement>("img[src*='/api/screenshot']");
    expect(shot?.getAttribute("alt")).toBe("Preview of github.com");
    expect(shot?.getAttribute("alt")).not.toContain("SaADii09");
  });

  it("falls back to a generic alt when the url carries no host", () => {
    const { container } = render(<FallbackPanel url="not a url" allowScreenshot />);
    const shot = container.querySelector<HTMLImageElement>("img[src*='/api/screenshot']");
    // A malformed url must not throw out of the render.
    expect(shot?.getAttribute("alt")).toBe("Cached preview");
  });
});
