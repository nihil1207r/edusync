import type { NextConfig } from "next";

// Security headers baseline. CSP allows the Razorpay checkout script/frame
// and the app's own API — everything else is locked down. connect-src now
// derives from NEXT_PUBLIC_API_URL at build time instead of a hardcoded
// localhost value, so a production build actually allows its real API
// origin rather than silently keeping the dev default.
const apiOrigin = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com",
      "frame-src https://api.razorpay.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      `connect-src 'self' ${apiOrigin} https://api.razorpay.com https://demotiles.maplibre.org https://*.tile.openstreetmap.org`,
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
