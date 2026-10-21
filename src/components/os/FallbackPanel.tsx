"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { AlertTriangle, ArrowLeft, BookOpen, ExternalLink, RefreshCw } from "lucide-react";

export interface FallbackPanelProps {
  /** Page the caller tried to embed — drives the screenshot proxy and escape hatch. */
  url: string;
  /**
   * Whether a cached-screenshot attempt is allowed for this url at all.
   * Callers decide (iframe path: always — /api/screenshot's allow-list degrades
   * via the img's own error; blocked tiles: the screenshot allow-list).
   */
  allowScreenshot: boolean;
  /**
   * Re-attempt the embed. Omitted when retrying is pointless — a blocked tile
   * has no frame to reload into, so it renders without the retry affordance.
   */
  onRetry?: () => void;
}

/**
 * The host or a neutral caption — the header names the SITE, never the raw
 * url (a screen reader must not read a full url out loud).
 */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "This page";
  }
}

/**
 * Alt text for the cached-screenshot card: the SITE (host), never the raw
 * url — a screen reader must not read "https://github.com/SaADii09/…"
 * out loud. A url with no parsable host falls back to a generic caption.
 */
function previewAlt(url: string): string {
  try {
    return `Preview of ${new URL(url).host}`;
  } catch {
    return "Cached preview";
  }
}

/**
 * The public render proxy (no new dependency — an HTTP service, not a
 * package). Its responses carry no framing blockers, so the page's real
 * content renders in a scrollable iframe.
 */
function readerUrl(url: string): string {
  return `https://r.jina.ai/${url}`;
}

const PRIMARY_ACTION =
  "inline-flex items-center gap-1.5 min-h-[44px] px-5 py-2.5 text-xs font-body rounded-os " +
  "bg-os-accent text-os-bg transition-opacity hover:opacity-80";

const SECONDARY_ACTION =
  "inline-flex items-center gap-1.5 min-h-[44px] px-5 py-2.5 text-xs font-body rounded-os " +
  "bg-os-surface-alt text-os-text transition-opacity hover:opacity-80 cursor-pointer";

/**
 * Reader degrade budget. Real browsers fire `load` (never `error`) for a
 * cross-origin frame's failed navigation — the proxy's error page is itself a
 * load into an unreadable cross-origin document — so "the reader errored" is
 * only observable as "no settled load inside the budget". An engine that does
 * surface the error event degrades immediately through onError.
 */
const READER_TIMEOUT_MS = 10000;

/**
 * Retry re-arms the screenshot attempt alongside the caller's retry (the
 * panel's attempt state resets on remount, so each retry inherits a clean one).
 */
function RetryButton({ onRetry, onReset }: { onRetry: () => void; onReset: () => void }) {
  return (
    <button
      onClick={() => {
        onReset();
        onRetry();
      }}
      className={SECONDARY_ACTION}
    >
      <RefreshCw size={14} />
      Retry
    </button>
  );
}

/**
 * The reader's graceful degrade: the proxy errored or was unreachable — the
 * reader's own header row (Back to preview · attribution) stays above us.
 */
function ReaderUnavailable({ url }: { url: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-os-muted">
      <AlertTriangle size={28} className="opacity-70" aria-hidden="true" />
      <p className="font-body text-sm">Reader unavailable.</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <a href={url} target="_blank" rel="noopener noreferrer" className={PRIMARY_ACTION}>
          <ExternalLink size={14} />
          Open in new tab
        </a>
      </div>
    </div>
  );
}

interface ReaderProps {
  url: string;
  onClose: () => void;
}

/**
 * Reader mode (Task A3): the third-party workaround for refusers — clearly
 * attributed, opt-in, degrading to a message rather than silently emptying.
 * The loading state owns the frame until it settles.
 */
function ReaderView({ url, onClose }: ReaderProps) {
  const [readerFailed, setReaderFailed] = useState(false);
  const [readerLoading, setReaderLoading] = useState(true);
  const readerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopReaderTimeout = useCallback(() => {
    if (readerTimeoutRef.current !== null) {
      clearTimeout(readerTimeoutRef.current);
      readerTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    readerTimeoutRef.current = setTimeout(() => setReaderFailed(true), READER_TIMEOUT_MS);
    return stopReaderTimeout;
  }, [stopReaderTimeout]);

  const handleReaderLoad = useCallback(() => {
    stopReaderTimeout();
    setReaderLoading(false);
  }, [stopReaderTimeout]);

  const handleReaderError = useCallback(() => {
    stopReaderTimeout();
    setReaderFailed(true);
  }, [stopReaderTimeout]);

  return (
    <div className="flex flex-col h-full gap-2 p-3 overflow-hidden text-os-muted">
      <div className="flex items-center justify-between gap-2">
        <button onClick={onClose} className={SECONDARY_ACTION}>
          <ArrowLeft size={12} />
          Back to preview
        </button>
        <span className="font-body text-xs text-os-muted">content via r.jina.ai</span>
      </div>
      <div className="relative flex-1 min-h-0 rounded-os overflow-hidden border border-os-border">
        {readerFailed ? (
          <ReaderUnavailable url={url} />
        ) : (
          <>
            {readerLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-os-surface-alt">
                <span className="font-body text-xs">Loading reader…</span>
              </div>
            )}
            <iframe
              src={readerUrl(url)}
              title="Reader view"
              onLoad={handleReaderLoad}
              onError={handleReaderError}
              // Reader content is third-party html — no same-origin grant.
              sandbox="allow-scripts allow-popups allow-forms"
              className="h-full w-full border-none bg-os-bg"
            />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Retry renders only when the caller can actually retry into something —
 * blocked tiles render the panel without a retry path (no dead button).
 */
function OptionalRetry({ onRetry, onReset }: { onRetry?: () => void; onReset: () => void }) {
  if (onRetry === undefined) return null;
  return <RetryButton onRetry={onRetry} onReset={onReset} />;
}

/**
 * The preview body: a full-width live preview, an honest header line, the
 * external hatch, and the opt-in Reader. The screenshot card hides itself on
 * its own img error — only then does the warning triangle appear; the resting
 * panel is neutral. Reader state intentionally lives OUTSIDE: swapping bodies
 * remounts the Reader with a clean clock (its timeout can't leak a stale
 * degrade back into the preview branch).
 */
function PreviewBody({
  url,
  allowScreenshot,
  onRetry,
  onOpenReader,
}: {
  url: string;
  allowScreenshot: boolean;
  onRetry?: () => void;
  onOpenReader: () => void;
}) {
  const [screenshotFailed, setScreenshotFailed] = useState(false);
  const showScreenshot = allowScreenshot && !screenshotFailed;

  return (
    <div className="flex h-full flex-col gap-2 p-3 text-center text-os-muted">
      {/* Header + actions come FIRST (D4): at rest they must be visible, and
          the preview fills whatever vertical space is left. The previous
          order put a full-width capture above them and pushed the escape
          hatch below the fold inside the fixed-height OS window. */}
      <p className="font-body text-sm">{hostOf(url)} blocks embedding — live preview below</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <a href={url} target="_blank" rel="noopener noreferrer" className={PRIMARY_ACTION}>
          <ExternalLink size={14} />
          Open in new tab
        </a>
        <button onClick={onOpenReader} className={SECONDARY_ACTION}>
          <BookOpen size={14} />
          Read this page
        </button>
        <OptionalRetry onRetry={onRetry} onReset={() => setScreenshotFailed(false)} />
      </div>
      {showScreenshot && (
        // no-img-element: deliberate — the src is an internal proxy route
        // (/api/screenshot) whose onError is the degrade path; next/image's
        // optimizer would add a second failure mode inside a fallback panel.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/screenshot?url=${encodeURIComponent(url)}`}
          alt={previewAlt(url)}
          onError={() => setScreenshotFailed(true)}
          className="min-h-[120px] w-full flex-1 rounded-os border border-os-border object-cover object-top"
        />
      )}
      {screenshotFailed && (
        <div className="flex flex-1 items-center justify-center">
          <AlertTriangle
            size={28}
            className="opacity-70"
            aria-hidden="true"
            data-testid="screenshot-failed-icon"
          />
        </div>
      )}
    </div>
  );
}

export function FallbackPanel({ url, allowScreenshot, onRetry }: FallbackPanelProps) {
  const [readerOpen, setReaderOpen] = useState(false);
  const openReader = useCallback(() => setReaderOpen(true), []);
  const closeReader = useCallback(() => setReaderOpen(false), []);

  if (readerOpen) {
    return <ReaderView url={url} onClose={closeReader} />;
  }
  return (
    <PreviewBody
      url={url}
      allowScreenshot={allowScreenshot}
      onRetry={onRetry}
      onOpenReader={openReader}
    />
  );
}
