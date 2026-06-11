import type { NextConfig } from "next";

// Phase 4.5 A5/C7 — static security headers. The CSP itself is ENFORCED with a
// per-request nonce in proxy.ts (the Report-Only phase soaked clean in Slice A).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  // The floating dev indicator portal sits bottom-start (bottom-LEFT in RTL),
  // exactly over the mobile nav's «المزيد» cell, and intercepts pointer events
  // in e2e runs. Dev-only cosmetic — disabled. Production is unaffected.
  devIndicators: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
