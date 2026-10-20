"use client";

import { ProjectGrid } from "@/components/apps/ProjectGrid";
import { openBrowser } from "@/lib/os-actions";

/**
 * Legacy Projects window shell (Task 9 migration): the card grid moved to
 * `ProjectGrid` and opening a project now routes into the DevOS Browser
 * singleton (`openBrowser(slug)`) instead of spawning a direct iframe window.
 * The window itself retires in Task 11 when `openApp("projects")` delegates
 * to `openBrowser`; until then this shell keeps the persisted-window path
 * rendering with the new open behavior.
 */
export function ProjectsApp() {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-base text-os-accent">Projects</h2>
      <ProjectGrid onOpen={openBrowser} />
    </div>
  );
}
