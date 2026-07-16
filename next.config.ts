import type { NextConfig } from "next";

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // need 'unsafe-eval' for next dynamic imports
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https:",
  "frame-src 'self' https:",
  "connect-src 'self' https:",
].join("; ");

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.100.52"],
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
  ],
};

export default nextConfig;
