import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProjectGrid } from "@/components/apps/ProjectGrid";
import { PROJECTS } from "@/lib/portfolio-data";

/**
 * ProjectGrid contract (Task 9): the extracted ProjectsApp card grid renders
 * one card per PROJECTS entry (title + tech chips) and reports clicks as
 * slugs — the same renderer serves the legacy Projects window and the Browser
 * home tab.
 */

describe("ProjectGrid", () => {
  it("renders one card per PROJECTS entry with its tech chips", () => {
    render(<ProjectGrid onOpen={vi.fn()} />);
    for (const project of PROJECTS) {
      expect(screen.getByText(project.title)).toBeDefined();
    }
    // Tech chips render verbatim from the entry data.
    expect(screen.getAllByText("Next.js").length).toBeGreaterThan(0);
  });

  it("calls onOpen with the entry slug when a card is activated", () => {
    const onOpen = vi.fn();
    render(<ProjectGrid onOpen={onOpen} />);
    fireEvent.click(screen.getByText("DevOS Portfolio"));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith("devos");
  });
});
