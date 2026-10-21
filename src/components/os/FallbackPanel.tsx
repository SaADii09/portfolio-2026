"use client";

import { useState } from "react";
import { ExternalLink, AlertTriangle, RefreshCw } from "lucide-react";

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
 * Branch-isolated helpers so the panel body stays under the CRAP threshold:
 * the header carries the icon-size ternary, the retry click re-arms the
 * screenshot attempt alongside the caller's retry.
 */
function FallbackHeader({ screenshotShown }: { screenshotShown: boolean }) {
  return (
    <>
      <AlertTriangle size={screenshotShown ? 20 : 32} className="opacity-50" />
      <p className="font-body text-sm">This site can&apos;t be embedded (X-Frame-Options).</p>
    </>
  );
}

function RetryButton({ onRetry, onReset }: { onRetry: () => void; onReset: () => void }) {
  return (
    <button
      onClick={() => {
        onReset();
        onRetry();
      }}
      className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-body rounded-os transition-opacity hover:opacity-80 bg-os-surface-alt text-os-text"
    >
      <RefreshCw size={12} />
      Retry
    </button>
  );
}

/**
 * Embed-failure body, extracted verbatim from WebView's refused-frame branch
 * so web tabs and direct callers (BrowserApp blocked tiles) reuse one panel.
 * The screenshot card hides itself on its own img error; a fresh attempt is
 * re-armed by retry (state resets within this panel, so remounts inherit a
 * clean attempt).
 */
export function FallbackPanel({ url, allowScreenshot, onRetry }: FallbackPanelProps) {
  const [screenshotFailed, setScreenshotFailed] = useState(false);
  const showScreenshot = allowScreenshot && !screenshotFailed;

  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center overflow-auto text-os-muted">
      {showScreenshot && (
        // no-img-element: deliberate — the src is an internal proxy route
        // (/api/screenshot) whose onError is the degrade path; next/image's
        // optimizer would add a second failure mode inside a fallback panel.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/screenshot?url=${encodeURIComponent(url)}`}
          alt={previewAlt(url)}
          onError={() => setScreenshotFailed(true)}
          className="max-h-44 max-w-full w-auto rounded-os border border-os-border"
        />
      )}
      <FallbackHeader screenshotShown={showScreenshot} />
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-body rounded-os transition-opacity hover:opacity-80 bg-os-accent text-os-bg"
      >
        <ExternalLink size={12} />
        Open in new tab
      </a>
      {onRetry !== undefined && (
        // Blocked tiles render the panel without a retry path — no dead button.
        <RetryButton onRetry={onRetry} onReset={() => setScreenshotFailed(false)} />
      )}
    </div>
  );
}
