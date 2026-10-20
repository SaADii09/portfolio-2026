"use client";

import type { ReactNode } from "react";
import { ChevronRight, ExternalLink, GitFork, Loader2, RotateCw } from "lucide-react";
import type { ProjectMeta } from "@/app/api/project-meta/route";
import type { ProjectEntry } from "@/lib/portfolio-data";
import { useIsMobile } from "@/hooks/useMediaQuery";

export interface ProjectSidePanelProps {
  /** The project behind the active tab; null when the slug is unknown. */
  entry: ProjectEntry | null;
  /** GitHub-derived facts; null until the meta request lands. */
  meta: ProjectMeta | null;
  /** True while the first request for this slug is in flight (nothing to show yet). */
  loading: boolean;
  /** Failure copy; the retry control re-requests and re-stores. */
  error: string | null;
  onRetry(): void;
  onCollapse(): void;
}

/** Section heading — the panel's four sections share one label style. */
function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-display text-[10px] uppercase tracking-wide text-os-accent mb-1.5">
      {children}
    </h3>
  );
}

function AboutSection({ entry }: { entry: ProjectEntry }) {
  return (
    <section aria-label="About">
      <SectionTitle>About</SectionTitle>
      <p className="text-xs font-body leading-relaxed text-os-text">{entry.description}</p>
    </section>
  );
}

function TechSection({ tech }: { tech: string[] }) {
  return (
    <section aria-label="Tech">
      <SectionTitle>Tech</SectionTitle>
      <div className="flex flex-wrap gap-1">
        {tech.map((item) => (
          <span
            key={item}
            data-tech-chip
            className="px-1.5 py-0.5 text-[10px] rounded-os glass glass-pos text-os-muted"
          >
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}

/** Timeline rows render the derived `label` + `period` verbatim. */
function TimelineSection({ rows }: { rows: { label: string; period: string }[] }) {
  return (
    <section aria-label="Timeline">
      <SectionTitle>Timeline</SectionTitle>
      {rows.length === 0 ? (
        <p className="text-xs font-body text-os-muted">No timeline yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <li
              key={`${row.label}-${row.period}`}
              className="flex items-baseline justify-between gap-2 text-xs font-body"
            >
              <span className="text-os-text">{row.label}</span>
              <span className="text-os-muted">{row.period}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LinksSection({ entry }: { entry: ProjectEntry }) {
  const linkClass =
    "inline-flex items-center gap-1.5 min-h-11 md:min-h-0 text-xs font-body text-os-accent hover:underline";
  return (
    <section aria-label="Links">
      <SectionTitle>Links</SectionTitle>
      <div className="flex flex-col">
        <a href={entry.repoUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
          <GitFork size={12} />
          Repository
        </a>
        {entry.demoUrl !== undefined && (
          <a href={entry.demoUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
            <ExternalLink size={12} />
            Live demo
          </a>
        )}
      </div>
    </section>
  );
}

/** Degraded README — the repo facts below stay usable. */
function DegradedNotice() {
  return (
    <p className="text-[11px] font-body leading-relaxed text-os-muted">
      README unavailable — the upstream source may be busy. The repo facts below are still current.
    </p>
  );
}

function LoadingState() {
  return (
    <div role="status" className="flex items-center gap-2 text-xs font-body text-os-muted">
      <Loader2 size={12} className="animate-spin" />
      Loading project details...
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2">
      <p className="text-xs font-body text-os-muted">{message}</p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-11 md:min-h-0 rounded-os glass glass-pos glass-border text-xs font-body text-os-accent transition-all hover:glow-sm cursor-pointer"
      >
        <RotateCw size={12} />
        Retry
      </button>
    </div>
  );
}

/** Unknown project — the slug behind the active tab is not in the data set. */
function UnknownProject() {
  return <p className="text-xs font-body text-os-muted">Unknown project.</p>;
}

/** The four sections (About / Tech / Timeline / Links) of a known project. */
function ProjectSections({ entry, meta }: { entry: ProjectEntry; meta: ProjectMeta | null }) {
  const degraded = meta !== null && meta.degraded;
  const rows = meta === null ? [] : meta.timeline;
  return (
    <>
      {degraded && <DegradedNotice />}
      <AboutSection entry={entry} />
      <TechSection tech={entry.tech} />
      <TimelineSection rows={rows} />
      <LinksSection entry={entry} />
    </>
  );
}

/**
 * Panel body — the state machine the panel shows for one project: failure
 * first, then the in-flight state, then the four sections. The degraded
 * README notice rides alongside the sections (the repo facts still hold).
 */
function PanelBody({
  entry,
  meta,
  loading,
  error,
  onRetry,
}: Pick<ProjectSidePanelProps, "entry" | "meta" | "loading" | "error" | "onRetry">) {
  if (error !== null) return <ErrorState message={error} onRetry={onRetry} />;
  if (loading) return <LoadingState />;
  if (entry === null) return <UnknownProject />;
  return <ProjectSections entry={entry} meta={meta} />;
}

/**
 * The project side panel (Task 10): a 264px right rail inside the browser
 * window on desktop, a bottom drawer capped at 45% of the window height on
 * mobile (<768px). The panel is presentational — the caller owns the fetch,
 * the caches and the open/closed state.
 */
export function ProjectSidePanel({
  entry,
  meta,
  loading,
  error,
  onRetry,
  onCollapse,
}: ProjectSidePanelProps) {
  const isMobile = useIsMobile();
  const frameClass = [
    "flex flex-col min-h-0 shrink-0 overflow-hidden glass glass-pos border-os-border",
    isMobile ? "w-full max-h-[45%] border-t" : "w-[264px] border-l",
  ].join(" ");

  return (
    <aside aria-label="Project details" className={frameClass}>
      <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-os-border shrink-0">
        <h2 className="font-display text-xs text-os-accent truncate">
          {entry?.title ?? "Project"}
        </h2>
        <button
          onClick={onCollapse}
          aria-label="Collapse side panel"
          className="flex items-center justify-center w-11 h-11 md:w-7 md:h-7 shrink-0 rounded-os text-os-muted transition-all hover:scale-110 hover:text-os-accent cursor-pointer"
        >
          <ChevronRight size={14} />
        </button>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 flex flex-col gap-4">
        <PanelBody entry={entry} meta={meta} loading={loading} error={error} onRetry={onRetry} />
      </div>
    </aside>
  );
}
