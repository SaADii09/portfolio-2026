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
});
