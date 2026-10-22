"use client";

import { ProjectGrid } from "@/components/apps/ProjectGrid";
import { openBrowser } from "@/lib/os-actions";

/**
 * Legacy Projects window shell (Task 9 migration): the card grid moved to
 * `ProjectGrid` and opening a project now routes into the DevOS Browser
 * singleton (`openBrowser(slug)`) instead of spawning a direct iframe window.
 * The window itself is NOT retired: the Task-11 delegation of
 * `openApp("projects")` to `openBrowser` was REVERTED (spec D7 — the Browser
 * is a stand-alone app with its own launcher), so `projects` is back on the
 * registry path and this shell keeps rendering the Projects registry window.
 */
export function ProjectsApp() {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-base text-os-accent">Projects</h2>
      <ProjectGrid onOpen={openBrowser} />
    </div>
  );
}
