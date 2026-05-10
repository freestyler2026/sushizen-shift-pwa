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
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
  {
    key: "Content-Security-Policy",
    value:
      `default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; ${CONNECT_SRC}`,
  },
];

if (!IS_DEV) {
  SECURITY_HEADERS.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" });
}

// Bake a unique deployment ID into the client bundle so AutoReload can detect
// when the PWA is running stale cached JavaScript and force a reload.
// VERCEL_URL is unique per deployment (e.g. "my-site-abc123.vercel.app") and
// is a real Vercel system env var available at both build time and runtime.
// VERCEL_GIT_COMMIT_SHA works for git-connected deployments.
// Date.now() is the local-dev fallback.
// VERCEL_URL is unique per deployment (e.g. "my-site-abc123.vercel.app"),
// even when the same git commit is deployed multiple times via CLI.
// It must come BEFORE VERCEL_GIT_COMMIT_SHA so that repeated `vercel --prod`
// runs with unchanged code still produce a fresh ID and trigger AutoReload.
const BUILD_ID =
  process.env.VERCEL_URL ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  "dev";  // local build fallback — AutoReload skips comparison when either side is "dev"

const nextConfig: NextConfig = {
  reactStrictMode: false,
  // Prevent dev/build cache collisions that can cause missing module errors.
  distDir: IS_DEV ? ".next-dev" : ".next",
  // Disable the client-side router cache so navigating back to a page always
  // remounts the component and re-runs useEffect hooks, loading fresh data.
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 0,
    },
  },
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
    // All navigable pages must not be cached at the edge/browser, or the PWA can serve
    // a stale document shell after a deploy (especially iOS Safari in standalone mode).
    const pageNoStore = [
      ...SECURITY_HEADERS,
      { key: "Cache-Control", value: "private, no-store, must-revalidate" },
    ] as const;
    return [
      { source: "/admin", headers: [...pageNoStore] },
      { source: "/admin/:path*", headers: [...pageNoStore] },
      {
        // Apply no-store to all routes except Next.js static bundles and image optimizer,
        // which have their own immutable content-hash cache busting.
        source: "/((?!_next/static|_next/image).*)",
        headers: [...pageNoStore],
      },
    ];
  },
};

export default nextConfig;