"use client";

import { PROJECTS } from "@/lib/portfolio-data";

interface ProjectGridProps {
  /** Called with the project's slug when a card is activated. */
  onOpen: (slug: string) => void;
}

/**
 * The project card grid, extracted from ProjectsApp (Task 9) so the legacy
 * Projects window and the Browser home tab share one renderer. Purely
 * presentational — the caller decides what opening a project means (the
 * legacy window routes into the Browser; the home tab opens a project tab).
 */
export function ProjectGrid({ onOpen }: ProjectGridProps) {
  return (
    <div className="flex flex-col gap-3">
      {PROJECTS.map((p) => (
        <button
          key={p.slug}
          onClick={() => onOpen(p.slug)}
          className="group p-3 rounded-os glass glass-pos glass-border text-left transition-all hover:-translate-y-0.5 hover:glow-sm cursor-pointer"
        >
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-display text-xs text-os-accent group-hover:glow-accent">
              {p.title}
            </h3>
            <span className="text-[9px] px-1.5 py-0.5 rounded-os glass glass-pos text-os-muted">
              {p.category}
            </span>
          </div>
          <p className="font-body text-sm leading-relaxed mb-2 text-os-text">{p.description}</p>
          <div className="flex flex-wrap gap-1">
            {p.tech.map((t) => (
              <span
                key={t}
                className="px-1.5 py-0.5 text-[10px] rounded-os glass glass-pos text-os-muted"
              >
                {t}
              </span>
            ))}
          </div>
        </button>
      ))}
    </div>
  );
}
