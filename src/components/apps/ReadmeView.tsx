"use client";

import { useMemo } from "react";
import { BookOpen, ExternalLink } from "lucide-react";
import { sanitizeReadmeHtml } from "@/lib/readme-sanitize";
import { projectBySlug } from "@/lib/portfolio-data";

interface ReadmeViewProps {
  /**
   * Sanitized by the caller (the project-meta route before it caches/serves);
   * run through `sanitizeReadmeHtml` again at render — cheap, and a caller bug
   * can never put a live script/iframe in the window.
   */
  html: string;
  /** True when the README could not be fetched (rate limits / no README). */
  degraded: boolean;
  /** Project slug; resolves the degraded-mode "Open on GitHub" escape hatch. */
  slug: string;
}

/**
 * README reader for browser project tabs. Renders GitHub-rendered HTML
 * (sanitized) inside the token-prose wrapper; the degraded branch replaces the
 * body entirely with friendly copy — the LRU never seeds a usable body — plus
 * a direct link to the repo.
 */
export function ReadmeView({ html, degraded, slug }: ReadmeViewProps) {
  const safeHtml = useMemo(() => sanitizeReadmeHtml(html), [html]);

  if (degraded) {
    // The repo link is resolved from the slug. The only production caller
    // (BrowserApp's ReadmeBody) renders its own "Unknown project" notice for
    // an unknown slug, so this lookup always resolves there — and an unknown
    // slug never fabricates a link to the wrong page (the old floor).
    const repoUrl = projectBySlug(slug)?.repoUrl;
    if (repoUrl === undefined) {
      return <p className="p-4 font-body text-sm text-os-muted">Unknown project.</p>;
    }
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center overflow-auto">
        <BookOpen size={28} className="opacity-50 text-os-muted" />
        <p className="font-body text-sm text-os-muted max-w-xs">
          The README cache isn&apos;t ready and the upstream source may be busy. It should warm up
          shortly — meanwhile the repo is one click away.
        </p>
        <a
          href={repoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 min-h-[44px] px-3 py-1.5 text-xs font-body rounded-os transition-opacity hover:opacity-80 bg-os-accent text-os-bg"
        >
          <ExternalLink size={12} />
          Open on GitHub
        </a>
      </div>
    );
  }

  return (
    <div
      className="token-prose max-w-3xl px-5 py-4"
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}
