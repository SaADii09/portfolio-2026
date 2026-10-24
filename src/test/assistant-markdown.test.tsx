import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AssistantMarkdown } from "@/components/apps/chat-internal/AssistantMarkdown";
import { CHAT_LINKS, CHAT_PROJECT_LINKS, isAllowedChatLink } from "@/lib/chat-links";

/**
 * Task 9 pins: GFM rendering, the closed link allow-list (Review Focus #4),
 * marker stripping, and the streaming cursor.
 */

describe("AssistantMarkdown", () => {
  it("renders GFM bold as <strong>", () => {
    render(<AssistantMarkdown content="This is **bold** text" />);
    const strong = screen.getByText("bold");
    expect(strong.tagName).toBe("STRONG");
  });

  it("renders a GitHub-flavored table", () => {
    const table = ["| Skill | Years |", "| --- | --- |", "| TypeScript | 3 |"].join("\n");
    const { container } = render(<AssistantMarkdown content={table} />);
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelectorAll("th")).toHaveLength(2);
  });

  it("renders an allow-listed link with the exact safe attributes", () => {
    const { container } = render(
      <AssistantMarkdown content={`See [GitHub](${CHAT_LINKS.github}) and [LinkedIn](${CHAT_LINKS.linkedin}).`} />,
    );
    const anchors = container.querySelectorAll("a");
    expect(anchors).toHaveLength(2);
    expect(anchors[0]?.getAttribute("href")).toBe(CHAT_LINKS.github);
    expect(anchors[0]?.getAttribute("target")).toBe("_blank");
    expect(anchors[0]?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("renders the email as a mailto anchor", () => {
    const { container } = render(
      <AssistantMarkdown content={`Email me at [Saad](${CHAT_LINKS.email}).`} />,
    );
    const anchor = container.querySelector("a");
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute("href")).toBe(CHAT_LINKS.email);
    expect(anchor?.textContent).toBe("Saad");
  });

  it("renders a project demo/link from the KB table", () => {
    const first = CHAT_PROJECT_LINKS[0];
    expect(first).toBeDefined();
    const { container } = render(<AssistantMarkdown content={`[Demo](${first})`} />);
    expect(container.querySelector("a")?.getAttribute("href")).toBe(first);
  });

  it("never renders a foreign href as an anchor — the label survives as text", () => {
    const { container } = render(
      <AssistantMarkdown content="[click here](http://evil.example/steal)" />,
    );
    expect(container.querySelector("a")).toBeNull();
    expect(screen.getByText("click here").tagName).toBe("SPAN");
  });

  it("rejects non-http schemes and lookalike hosts", () => {
    expect(isAllowedChatLink("javascript:alert(1)")).toBe(false);
    expect(isAllowedChatLink("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isAllowedChatLink("https://github.com.evil.example/SaADii09")).toBe(false);
    expect(isAllowedChatLink("https://evil.example/github.com")).toBe(false);
  });

  it("accepts an allow-listed URL with a trailing slash (copy tolerance)", () => {
    expect(isAllowedChatLink(`${CHAT_LINKS.github}/`)).toBe(true);
  });

  it("never displays an action marker", () => {
    const { container } = render(
      <AssistantMarkdown content={"Opening it now — [[action:open_app:about]]"} />,
    );
    expect(container.textContent).not.toContain("[[action:");
    expect(container.textContent).toContain("Opening it now");
  });

  it("shows the streaming cursor only while streaming", () => {
    const { container, rerender } = render(<AssistantMarkdown content="Hello" streaming />);
    expect(container.querySelector(".md-os-cursor")).not.toBeNull();

    rerender(<AssistantMarkdown content="Hello" streaming={false} />);
    expect(container.querySelector(".md-os-cursor")).toBeNull();
  });
});
