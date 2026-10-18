export const metadata = {
  title: "Embed refusal fixture",
};

/**
 * Deterministic test fixture: this route always carries `X-Frame-Options: DENY`
 * (explicit header entry in next.config.ts, on top of the global DENY), so any
 * attempt to frame it is refused by every engine. The e2e spike and the WebView
 * fallback tests frame it to calibrate and verify refusal detection.
 */
export default function EmbedRefusalPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 bg-os-bg">
      <h1 className="font-display text-base text-os-text">Embed refusal fixture</h1>
      <p className="font-body text-xs text-os-muted">
        This page always sends X-Frame-Options: DENY and must never render inside a frame.
      </p>
    </main>
  );
}
