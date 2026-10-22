import type { NextConfig } from "next";

// Dev runtime needs 'unsafe-eval' (Turbopack/webpack HMR + dynamic imports);
// production must not have it, so it is gated on the environment Next.js sets.
// 'unsafe-inline' stays on script-src until the nonce upgrade (inline boot
// script — documented in the hardening spec).
const scriptSrc = `script-src 'self' 'unsafe-inline'${
  process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""
}`;

/**
 * The production origin from NEXT_PUBLIC_SITE_URL, or null when the value is
 * absent or unusable.
 *
 * The parse MUST NOT throw: this module is evaluated by `next build` /
 * `next dev` BEFORE the app exists, and the owner sets the variable in the
 * host environment (README + .env.example). A typo like `saadahmad.dev`
 * (no scheme) makes `new URL()` throw `TypeError: Invalid URL`, which kills
 * the build with an opaque stack. So a malformed value degrades to null →
 * 'self' alone — the same tolerance `src/lib/site.ts` shows (an unusable
 * value falls back to the localhost default).
 */
function configuredSiteOrigin(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const origin = new URL(raw).origin;
    // Non-special schemes (mailto:, data:, file:) report the LITERAL origin
    // "null" — never a usable frame-ancestor value.
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
}

/**
 * Anti-clickjacking: the app may only be framed by itself, plus our own
 * production origin when NEXT_PUBLIC_SITE_URL is configured — the Browser
 * embeds the deployed portfolio. Read at config-eval time (Next.js loads
 * .env files before evaluating this config); when unset (local dev), 'self'
 * alone already covers localhost. Deliberately NOT the site.ts localhost
 * fallback: pinning `https://localhost:3000` in a production deployment
 * would be meaningless at best.
 */
const siteOrigin = configuredSiteOrigin(process.env.NEXT_PUBLIC_SITE_URL);
const frameAncestors = siteOrigin ? `'self' ${siteOrigin}` : "'self'";

const csp = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https:",
  "frame-src 'self' https:",
  // Vercel Analytics (<Analytics /> in layout.tsx) beacons to this origin
  // client-side; a bare 'self' would silently block it.
  "connect-src 'self' https://va.vercel-scripts.com",
  "object-src 'none'",
  "base-uri 'self'",
  `frame-ancestors ${frameAncestors}`,
].join("; ");

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.100.53"],
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Content-Security-Policy", value: csp },
      ],
    },
    // Explicit fixture header for the WebView refusal tests: /embed-refusal is
    // never embeddable, even if the global rule above ever changes. BOTH
    // headers stay: modern browsers honour a frame-ancestors CSP over
    // X-Frame-Options, so with the global CSP now allowing 'self' framing an
    // XFO alone would no longer block — the 'none' CSP is what keeps the
    // fixture unembeddable. Both the global CSP ('self'+origin) and this
    // source-level 'none' reach the response; browsers intersect multiple CSP
    // policies, so the stricter one wins as intended.
    {
      source: "/embed-refusal",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      ],
    },
  ],
};

export default nextConfig;
