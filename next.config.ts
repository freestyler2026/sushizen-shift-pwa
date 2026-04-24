import type { NextConfig } from "next";

const RAW_API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim();
const API_BASE = RAW_API_BASE ? RAW_API_BASE.replace(/\/+$/, "") : "";
const IS_DEV = process.env.NODE_ENV === "development";
const CONNECT_SRC = IS_DEV
  ? "connect-src 'self' http://127.0.0.1:8000 http://localhost:8000 https: ws: wss:;"
  : "connect-src 'self' https: wss:;";
const SECURITY_HEADERS = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value:
      `default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; ${CONNECT_SRC}`,
  },
];

if (!IS_DEV) {
  SECURITY_HEADERS.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" });
}

// Bake the deployment SHA into the client bundle so AutoReload can detect
// when the PWA is running stale cached JavaScript and force a reload.
const BUILD_ID =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.VERCEL_DEPLOYMENT_ID ||
  String(Date.now());

const nextConfig: NextConfig = {
  reactStrictMode: false,
  // Prevent dev/build cache collisions that can cause missing module errors.
  distDir: IS_DEV ? ".next-dev" : ".next",
  env: {
    // Available client-side as process.env.NEXT_PUBLIC_BUILD_ID
    NEXT_PUBLIC_BUILD_ID: BUILD_ID,
  },
  async redirects() {
    return [
      {
        source: "/admin/attendance/monthly-summary",
        destination: "/admin/analytics",
        permanent: false,
      },
      {
        source: "/admin/attendance/payroll",
        destination: "/admin/analytics",
        permanent: false,
      },
      {
        source: "/admin/attendance/corrections",
        destination: "/admin/corrections",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    if (!API_BASE) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${API_BASE}/api/:path*`,
      },
    ];
  },
  async headers() {
    // Admin HTML must not be cached long at the edge/browser, or users can keep an old
    // document shell that references pre-Ratings-tab JS after a deploy.
    const adminNoStore = [
      ...SECURITY_HEADERS,
      { key: "Cache-Control", value: "private, no-store, must-revalidate" },
    ] as const;
    return [
      { source: "/admin", headers: [...adminNoStore] },
      { source: "/admin/:path*", headers: [...adminNoStore] },
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;