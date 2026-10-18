"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ExternalLink, AlertTriangle, RefreshCw } from "lucide-react";

interface WebViewProps {
  url: string;
}

/**
 * One observed event from the embedded frame, as seen from the parent page.
 *
 * Per-engine calibration (temporary e2e spike, run against Playwright
 * 1.64.1 / Windows — chromium, firefox, webkit all behave alike):
 *
 * | engine   | XFO refusal (`/embed-refusal`, cross-origin XFO)        | embeddable (route-fulfilled HTML)          |
 * | -------- | ------------------------------------------------------- | ------------------------------------------ |
 * | chromium | `load` fires (~0.04–1.9s), contentDocument unreadable,  | `load` fires, contentDocument accessible,  |
 * | firefox  | `window.location.href` throws SecurityError, body blank | content non-blank, `location.href` readable |
 * | webkit   | (identical in all three engines)                        | (identical in all three engines)           |
 *
 * Key findings: (1) no engine leaves an XFO-refused frame silent — `load`
 * always fires, so the watchdog is the safety net for slow/hung network loads,
 * not for refusals themselves; (2) a refused frame's error page is ALWAYS
 * unreadable to the parent, while a same-origin embeddable frame is readable
 * (WebKit additionally fires `load` for the initial about:blank commit when
 * the iframe mounts with its src already set — readable but blank, later
 * replaced by the real document); (3) cross-origin refusal is
 * indistinguishable from cross-origin success from the parent (both
 * unreadable). Since every project URL embedded here (github.com) refuses
 * framing by design, an unreadable document on `load` is classified as a
 * refusal so the screenshot fallback shows promptly instead of the frame
 * lingering.
 */
export type FrameSignal = {
  kind: "load" | "error" | "timeout";
  contentAccessible?: boolean;
  contentLooksBlank?: boolean;
};

/** Only same-origin embeddable loads are provably "ok" — see calibration above. */
const FRAME_PROBE_DELAY_MS = 250;
const FRAME_WATCHDOG_MS = 3500;

/**
 * Pure classifier: judge by the latest observed signal only.
 *
 * "Accessible" is the load-or-refuse hinge: a document the parent can read is
 * a genuine same-origin commit (WebKit additionally fires `load` for the
 * initial about:blank commit when the iframe mounts with src, which presents
 * as accessible-but-blank until the real document lands), while an unreadable
 * document always matches the engine error page engines commit for refused
 * frames. Observed refusal sequences: `{ kind: "load", contentAccessible:
 * false }` (chrome/firefox error page; webkit sandbox block), `{ kind:
 * "error" }` (classic engine error), `{ kind: "timeout" }` (watchdog-hung).
 */
export function decideRefusal(signals: FrameSignal[]): "ok" | "refused" {
  const last = signals[signals.length - 1];
  if (!last) return "ok";
  if (last.kind !== "load") return "refused";
  if (last.contentAccessible === true) return "ok";
  return "refused";
}

/** External-link escape hatch + retry, with the cached screenshot attempt. */
function FailedEmbedPanel({
  url,
  screenshotFailed,
  onScreenshotError,
  onRetry,
}: {
  url: string;
  screenshotFailed: boolean;
  onScreenshotError: () => void;
  onRetry: () => void;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center overflow-auto"
      style={{ color: "var(--text-secondary)" }}
    >
      {!screenshotFailed && (
        // no-img-element: deliberate — the src is an internal proxy route
        // (/api/screenshot) whose onError is the degrade path; next/image's
        // optimizer would add a second failure mode inside a fallback panel.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/screenshot?url=${encodeURIComponent(url)}`}
          alt={`Cached screenshot of ${url}`}
          onError={onScreenshotError}
          className="max-h-44 max-w-full w-auto rounded-os"
          style={{ border: "1px solid var(--border)" }}
        />
      )}
      <AlertTriangle size={screenshotFailed ? 32 : 20} className="opacity-50" />
      <p className="font-body text-sm">This site can&apos;t be embedded (X-Frame-Options).</p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-body rounded-os transition-opacity hover:opacity-80"
        style={{
          background: "var(--accent-1)",
          color: "var(--bg-primary)",
        }}
      >
        <ExternalLink size={12} />
        Open in new tab
      </a>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-body rounded-os transition-opacity hover:opacity-80"
        style={{
          background: "var(--bg-tertiary)",
          color: "var(--text-primary)",
        }}
      >
        <RefreshCw size={12} />
        Retry
      </button>
    </div>
  );
}

/** Reads the frame's document; null when the frame is gone or unreadable. */
function readFrameDocument(frame: HTMLIFrameElement | null): Document | null {
  try {
    return frame?.contentDocument ?? null;
  } catch {
    // Unreadable documents (engine error pages) can throw on access.
    return null;
  }
}

export function WebView({ url }: WebViewProps) {
  const [failed, setFailed] = useState(false);
  const [screenshotFailed, setScreenshotFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const probeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current !== null) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const probeFrame = useCallback((): FrameSignal => {
    const doc = readFrameDocument(iframeRef.current);
    if (doc && doc.body) {
      return {
        kind: "load",
        contentAccessible: true,
        contentLooksBlank: doc.body.childElementCount === 0,
      };
    }
    return { kind: "load", contentAccessible: false };
  }, []);

  const markFailed = useCallback(() => {
    clearWatchdog();
    setFailed(true);
    setLoading(false);
  }, [clearWatchdog]);

  const handleLoad = useCallback(() => {
    probeTimerRef.current = setTimeout(() => {
      const signal = probeFrame();
      if (decideRefusal([signal]) === "refused") {
        markFailed();
        return;
      }
      clearWatchdog();
      setLoading(false);
    }, FRAME_PROBE_DELAY_MS);
  }, [probeFrame, markFailed, clearWatchdog]);

  const handleError = useCallback(() => {
    if (probeTimerRef.current !== null) {
      clearTimeout(probeTimerRef.current);
      probeTimerRef.current = null;
    }
    markFailed();
  }, [markFailed]);

  const handleRetry = useCallback(() => {
    setScreenshotFailed(false);
    setFailed(false);
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  // Watchdog: arms one timer per (re)load attempt, cleared exactly once by
  // this effect's cleanup on unmount or re-arm, and canceled by a genuine load
  // (in handleLoad). At the deadline it re-probes instead of failing blindly:
  // WebKit can commit an iframe's document without ever firing the element's
  // load event (observed for a frame remounted mid-session — document readable
  // with full content, no load event), and some engines deliver nothing at all
  // when a refusal should be shown immediately. Readable content at the
  // deadline is genuinely loaded (stays ok); unreadable/blank still fails.
  useEffect(() => {
    watchdogRef.current = setTimeout(() => {
      watchdogRef.current = null;
      if (decideRefusal([probeFrame()]) === "refused") {
        setFailed(true);
        setLoading(false);
        return;
      }
      setLoading(false);
    }, FRAME_WATCHDOG_MS);
    return () => {
      if (watchdogRef.current !== null) {
        clearTimeout(watchdogRef.current);
        watchdogRef.current = null;
      }
      if (probeTimerRef.current !== null) {
        clearTimeout(probeTimerRef.current);
        probeTimerRef.current = null;
      }
    };
  }, [url, reloadKey, probeFrame]);

  if (failed) {
    return (
      <FailedEmbedPanel
        url={url}
        screenshotFailed={screenshotFailed}
        onScreenshotError={() => setScreenshotFailed(true)}
        onRetry={handleRetry}
      />
    );
  }

  return (
    <div className="relative w-full h-full flex flex-col">
      {loading && (
        <div
          className="absolute inset-0 flex items-center justify-center z-10"
          style={{ background: "var(--bg-secondary)" }}
        >
          <span className="font-body text-xs" style={{ color: "var(--text-secondary)" }}>
            Loading...
          </span>
        </div>
      )}

      <div
        className="flex items-center gap-2 px-3 py-1.5 text-xs font-body border-b"
        style={{
          background: "var(--bg-tertiary)",
          borderColor: "var(--border)",
          color: "var(--text-secondary)",
        }}
      >
        <span className="flex-1 truncate">{url}</span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:opacity-70 transition-opacity"
          style={{ color: "var(--accent-1)" }}
          aria-label="Open external"
        >
          <ExternalLink size={12} />
        </a>
      </div>

      <iframe
        key={reloadKey}
        ref={iframeRef}
        src={url}
        className="flex-1 w-full border-none bg-white"
        sandbox="allow-scripts allow-same-origin allow-forms"
        onError={handleError}
        onLoad={handleLoad}
        title="Website preview"
      />
    </div>
  );
}
