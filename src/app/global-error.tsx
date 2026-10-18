"use client";

import "./globals.css";

interface GlobalErrorProps {
  error: Error;
  reset: () => void;
}

/**
 * Root-level crash page: global-error replaces the root layout, so it must
 * render raw <html><body>. Tokens only — ThemeProvider can't rehydrate here,
 * so plain `:root` defaults apply (pre-ruled).
 */
export default function GlobalError({ reset }: GlobalErrorProps) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen bg-os-bg font-body flex items-center justify-center p-6">
          <div className="glass glass-border rounded-os shadow-os w-full max-w-md p-8 text-center">
            <h1 className="font-display text-sm text-os-text mb-4">
              Something went wrong in the OS.
            </h1>
            <p className="text-xs text-os-muted mb-6 leading-relaxed">
              A fatal error occurred and the system could not recover. Nothing
              was lost — reset the shell and reboot.
            </p>
            <button
              onClick={reset}
              className="bg-os-accent text-os-bg font-display text-xs px-6 py-3 rounded-os hover:opacity-80 transition-opacity"
            >
              Reset
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
