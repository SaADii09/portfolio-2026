import type { NextConfig } from "next";

// Dev runtime needs 'unsafe-eval' (Turbopack/webpack HMR + dynamic imports);
// production must not have it, so it is gated on the environment Next.js sets.
// 'unsafe-inline' stays on script-src until the nonce upgrade (inline boot
// script — documented in the hardening spec).
const scriptSrc = `script-src 'self' 'unsafe-inline'${
  process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""
}`;

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
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.100.53"],
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Content-Security-Policy", value: csp },
      ],
    },
    // Explicit fixture header for the WebView refusal tests: /embed-refusal is
    // never embeddable, even if the global rule above ever changes. Additive on
    // purpose — the CSP block above is owned by the hardening lane (Task 13).
    {
      source: "/embed-refusal",
      headers: [{ key: "X-Frame-Options", value: "DENY" }],
    },
  ],
};

export default nextConfig;
