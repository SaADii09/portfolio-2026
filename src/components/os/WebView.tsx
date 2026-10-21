"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";
import { ExternalLink } from "lucide-react";
import { FallbackPanel } from "./FallbackPanel";

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
 * replaced by the real document); (3) HISTORICAL: the spike-era assumption
 * "an unreadable document must be a refusal" held only while every embedded
 * url was a known refuser. Cross-origin frames are ALWAYS unreadable to the
 * parent (Same-Origin Policy) — refusals and working sites alike — so since
 * the real-web rework an unreadable document consults the `/api/embed-check`
 * server verdict instead of failing the frame; only a "blocked" verdict swaps
 * to the fallback panel.
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
 * as accessible-but-blank until the real document lands). Observed signals:
 * `{ kind: "load", contentAccessible: true }` → ok; `{ kind: "load",
 * contentAccessible: false }`, `{ kind: "error" }`, `{ kind: "timeout" }` →
 * "refused", which the API consumer now reads as "consult the server verdict"
 * — an unreadable frame is no longer failed on this label alone.
 */
export function decideRefusal(signals: FrameSignal[]): "ok" | "refused" {
  const last = signals[signals.length - 1];
  if (!last) return "ok";
  if (last.kind !== "load") return "refused";
  if (last.contentAccessible === true) return "ok";
  return "refused";
}

/**
 * A SAME-ORIGIN document is always readable unless the browser refused to
 * load it (X-Frame-Options binds same-origin framing too, and a broken frame
 * leaves the document unreadable). So an unreadable same-origin frame is a
 * genuine refusal and must decide locally — no server round trip. That also
 * keeps local/dev (`http://localhost`) truthful: the embed-check route is
 * https-only and would answer 400, which the client would otherwise degrade
 * to a permanently blank frame.
 */
function isSameOrigin(url: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
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

interface EmbedVerdict {
  embeddable?: unknown;
}

/**
 * The verdict from one `/api/embed-check` response, collapsed to the single
 * thing the probe needs: true when the server positively reported the frame
 * blocked. Every other shape (non-ok status, unparsable body, network error)
 * degrades to "keep the live frame" — only a positive "blocked" verdict swaps
 * the fallback panel in.
 */
async function readBlockedSignal(res: Response): Promise<boolean> {
  if (!res.ok) return false;
  try {
    const verdict = (await res.json()) as EmbedVerdict;
    return verdict.embeddable === false;
  } catch {
    return false;
  }
}

/**
 * One abortable verdict request. Settles "blocked" into the fallback panel,
 * guards every settle path behind the controller's signal (an unmount or a
 * url change must never leave a state write behind), and stands the watchdog
 * down once the verdict is known so a degraded answer cannot re-fire it.
 */
async function settleFraming(
  controller: AbortController,
  url: string,
  clearWatchdog: () => void,
  setFailed: Dispatch<SetStateAction<boolean>>,
): Promise<void> {
  try {
    const res = await fetch(`/api/embed-check?url=${encodeURIComponent(url)}`, {
      signal: controller.signal,
    });
    const blocked = await readBlockedSignal(res);
    if (controller.signal.aborted) return;
    clearWatchdog();
    if (blocked) setFailed(true);
  } catch {
    // Degrade-to-frame: a failed/unreachable verdict keeps the live frame.
  }
}

export function WebView({ url }: WebViewProps) {
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const probeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const verdictAbortRef = useRef<AbortController | null>(null);
  const verdictPendingRef = useRef(false);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current !== null) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const cancelProbe = useCallback(() => {
    if (probeTimerRef.current !== null) {
      clearTimeout(probeTimerRef.current);
      probeTimerRef.current = null;
    }
  }, []);

  const abortVerdict = useCallback(() => {
    if (verdictAbortRef.current !== null) {
      verdictAbortRef.current.abort();
      verdictAbortRef.current = null;
    }
    verdictPendingRef.current = false;
  }, []);

  /**
   * Asks the server whether the loaded-but-unreadable frame may render here.
   * The iframe STAYS MOUNTED the whole flight and the loading overlay comes
   * down — it is rendering the real site; only a "blocked" verdict swaps the
   * fallback panel in.
   */
  const requestVerdict = useCallback(() => {
    abortVerdict();
    const controller = new AbortController();
    verdictAbortRef.current = controller;
    verdictPendingRef.current = true;
    setLoading(false);
    const flight = settleFraming(controller, url, clearWatchdog, setFailed);
    void flight.finally(() => {
      if (verdictAbortRef.current === controller) verdictAbortRef.current = null;
      verdictPendingRef.current = false;
    });
  }, [url, abortVerdict, clearWatchdog]);

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
    // WebKit fires TWO load events per mount (initial readable-blank
    // about:blank commit, then the real document). The second load must
    // supersede, not overwrite, the pending probe — otherwise the first
    // timer's id is lost: it leaks past cleanup/unmount and can fire during
    // the gap, reading a mid-navigation document and mis-failing the frame.
    cancelProbe();
    probeTimerRef.current = setTimeout(() => {
      const signal = probeFrame();
      if (decideRefusal([signal]) === "ok") {
        clearWatchdog();
        setLoading(false);
        return;
      }
      // Unreadable after a genuine SAME-ORIGIN load is a real refusal: a
      // same-origin document the parent cannot read means the browser refused
      // to load it (XFO binds same-origin too). Cross-origin frames are a
      // different story — every one of them is unreadable (Same-Origin
      // Policy), so the server verdict owns their outcome while the frame
      // stays mounted (the watchdog deliberately stays armed: it defers to a
      // pending verdict).
      if (isSameOrigin(url)) {
        markFailed();
        return;
      }
      requestVerdict();
    }, FRAME_PROBE_DELAY_MS);
  }, [probeFrame, clearWatchdog, cancelProbe, requestVerdict, markFailed, url]);

  const handleError = useCallback(() => {
    cancelProbe();
    markFailed();
  }, [markFailed, cancelProbe]);

  const handleRetry = useCallback(() => {
    // Screenshot-attempt state now resets inside FallbackPanel (unmount on
    // this transition gives the next panel a clean attempt).
    setFailed(false);
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  // Watchdog: arms one timer per (re)load attempt, cleared exactly once by
  // this effect's cleanup on unmount or re-arm, and canceled by a genuine
  // same-origin load (in handleLoad). At the deadline it re-probes instead of
  // failing blindly: WebKit can commit an iframe's document without ever
  // firing the element's load event (observed for a frame remounted
  // mid-session — document readable with full content, no load event), and
  // some engines deliver nothing at all when a refusal should be shown
  // immediately. While a verdict is pending the watchdog stands down — the
  // verdict flow owns a loaded-but-unreadable frame's outcome, and a second
  // probe would just re-fire a false refusal. A readable deadline probe is
  // genuinely loaded (stays ok); unreadable now consults the server verdict.
  useEffect(() => {
    watchdogRef.current = setTimeout(() => {
      watchdogRef.current = null;
      if (verdictPendingRef.current) return;
      if (decideRefusal([probeFrame()]) === "refused") {
        // Same-origin unreadable is a local refusal (see handleLoad) — the
        // server cannot and need not arbitrate our own origin.
        if (isSameOrigin(url)) {
          markFailed();
          return;
        }
        requestVerdict();
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
      abortVerdict();
    };
  }, [url, reloadKey, probeFrame, requestVerdict, abortVerdict, markFailed]);

  if (failed) {
    return (
      // allowScreenshot: the iframe path always attempts the proxy — its
      // per-origin allow-listing degrades through the img's own error inside
      // the panel (behavior unchanged from the pre-extraction panel).
      <FallbackPanel url={url} allowScreenshot onRetry={handleRetry} />
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
