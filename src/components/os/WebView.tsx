"use client";

import { useState, useRef, useCallback } from "react";
import { ExternalLink, AlertTriangle, RefreshCw } from "lucide-react";

interface WebViewProps {
  url: string;
}

export function WebView({ url }: WebViewProps) {
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleError = useCallback(() => {
    setFailed(true);
    setLoading(false);
  }, []);

  const handleLoad = useCallback(() => {
    setLoading(false);
  }, []);

  const handleRetry = useCallback(() => {
    setFailed(false);
    setLoading(true);
    if (iframeRef.current) {
      iframeRef.current.src = url;
    }
  }, [url]);

  if (failed) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center"
        style={{ color: "var(--text-secondary)" }}
      >
        <AlertTriangle size={32} className="opacity-50" />
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
          onClick={handleRetry}
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
