import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReadmeView } from "@/components/apps/ReadmeView";

/**
 * Unit contract for the README reader (Task 8).
 *
 * Callers (the project-meta route) sanitize before storing/serving; ReadmeView
 * runs `sanitizeReadmeHtml` again at render — belt and suspenders, so a caller
 * bug can never put a live script/iframe in the window. Anchors are forced to
 * external behavior (target=_blank + noopener), and `degraded` swaps the body
 * for friendly copy plus an "Open on GitHub" escape hatch.
 *
 * F6 (hardening round): the escape hatch paints with THEME TOKENS — no static
 * inline styles survive in the markup.
 * T8: the escape hatch is resolved from the slug (no fabricated floor link)
 * and its icon leads the label (the codebase's established button pattern).
 */

const REPO_URL = "https://github.com/SaADii09/portfolio-2026"; // slug "devos"

const README = [
  "<h1>DevOS</h1>",
  `<p>Read the <a href="${REPO_URL}">docs</a>.</p>`,
  '<script>alert("pwned")</script>',
  '<iframe src="https://evil.example/frame"></iframe>',
  "<img src='https://camo.githubusercontent.com/x.png' alt='preview'/>",
].join("");

describe("ReadmeView", () => {
  it("renders the html inside a token-prose wrapper and re-strips script/iframe at render", () => {
    const { container } = render(<ReadmeView html={README} degraded={false} slug="devos" />);
    expect(container.querySelector(".token-prose")).not.toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    expect(screen.queryByText(/pwned/)).toBeNull();
  });

  it("keeps benign content and normalizes anchors to external behavior", () => {
    render(<ReadmeView html={README} degraded={false} slug="devos" />);
    expect(screen.getByText("DevOS", { selector: "h1" })).toBeDefined();
    const link = screen.getByRole("link", { name: "docs" });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("renders degraded copy with an Open on GitHub escape hatch", () => {
    render(<ReadmeView html="" degraded slug="devos" />);
    expect(screen.getByText(/cache/i)).toBeDefined();
    expect(screen.getByText(/upstream/i)).toBeDefined();
    const link = screen.getByRole("link", { name: /open on github/i });
    expect(link.getAttribute("href")).toBe(REPO_URL);
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("top-aligns the degraded body — never center-clips in a short scroller", () => {
    // Short-window spec G3: flex-centering + h-full inside an overflow-auto
    // body clips BOTH edges in a short window; the top is then unreachable.
    // Top-aligned + min-h-full keeps the whole block reachable by scrolling.
    render(<ReadmeView html="" degraded slug="devos" />);
    const body = screen.getByText(/cache/i).closest("div");
    const tokens = body?.className.split(" ") ?? [];
    expect(tokens).toContain("justify-start");
    expect(tokens).toContain("min-h-full");
    expect(tokens).not.toContain("justify-center");
    expect(tokens).not.toContain("h-full");
  });

  it("paints the degraded escape hatch with theme tokens", () => {
    render(<ReadmeView html="" degraded slug="devos" />);
    // F6: `background: var(--accent-1)` / `color: var(--bg-primary)` became
    // the token classes — the rendered colors are unchanged.
    const link = screen.getByRole("link", { name: /open on github/i });
    expect(link.getAttribute("style")).toBeNull();
    expect(link.className).toContain("bg-os-accent");
    expect(link.className).toContain("text-os-bg");
  });

  it("leads with the icon (the established button pattern)", () => {
    render(<ReadmeView html="" degraded slug="devos" />);
    const link = screen.getByRole("link", { name: /open on github/i });
    // Icon-then-label, like every other icon button in the OS.
    expect(link.firstElementChild?.tagName.toLowerCase()).toBe("svg");
  });

  it("fabricates no repo link for an unknown slug", () => {
    // T8: the old `?? "https://github.com"` floor linked to the wrong page.
    // The only production caller (BrowserApp's ReadmeBody) renders its own
    // "Unknown project" notice for an unknown slug, so ReadmeView never
    // fabricates a link — it says the project is unknown.
    render(<ReadmeView html="" degraded slug="not-a-project" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(/unknown project/i)).toBeDefined();
  });
});
