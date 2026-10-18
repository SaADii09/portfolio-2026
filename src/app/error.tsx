"use client";

interface ErrorPageProps {
  error: Error;
  reset: () => void;
}

/**
 * Fullscreen crash panel for app-route errors. Tokens only — error boundaries
 * mount outside the ThemeProvider, so plain `:root` tokens are pre-ruled.
 */
export default function ErrorPage({ reset }: ErrorPageProps) {
  return (
    <div className="min-h-screen bg-os-bg font-body flex items-center justify-center p-6">
      <div className="glass glass-border rounded-os shadow-os w-full max-w-md p-8 text-center">
        <h1 className="font-display text-sm text-os-text mb-4">
          Something went wrong in the OS.
        </h1>
        <p className="text-xs text-os-muted mb-6 leading-relaxed">
          An unexpected error occurred and the session crashed. Nothing was lost —
          reset the shell and carry on.
        </p>
        <button
          onClick={reset}
          className="bg-os-accent text-os-bg font-display text-xs px-6 py-3 rounded-os hover:opacity-80 transition-opacity"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
