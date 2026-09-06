import type { NextConfig } from "next";

const RAW_API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim();
const API_BASE = RAW_API_BASE ? RAW_API_BASE.replace(/\/+$/, "") : "";
const IS_DEV = process.env.NODE_ENV === "development";
const CONNECT_SRC = IS_DEV
  ? "connect-src 'self' http://127.0.0.1:8000 http://localhost:8000 https: ws: wss:;"
  : "connect-src 'self' https: wss:;";
// Where a page is allowed to ask for hardware. The default denies the
// microphone outright, and `microphone=()` denies it to THIS origin too -- the
// browser refuses getUserMedia before it ever asks the person, so the voice
// screening failed on every device with "the browser is not letting us use the
// microphone". It read like a laptop problem and was ours.
//
// Two pages record: /apply, where an applicant answers straight after sending
// the form, and /voice/:token, where they answer from an invite link. Those get
// microphone=(self); everything else keeps the deny.
const PERMISSIONS_DENY_MIC = "camera=(), microphone=(), geolocation=(self)";
const PERMISSIONS_ALLOW_MIC = "camera=(), microphone=(self), geolocation=(self)";

const SECURITY_HEADERS = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: PERMISSIONS_DENY_MIC },
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
    // Use "fallback" so that Next.js route handlers (including dynamic catch-alls like
    // /api/admin/[...slug]) always take precedence over the CDN-level rewrite.
    // With the plain array format ("afterFiles"), Vercel CDN bypasses dynamic catch-all
    // routes for external-URL rewrites — this broke the httpOnly cookie proxy.
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [
        {
          source: "/api/:path*",
          destination: `${API_BASE}/api/:path*`,
        },
      ],
    };
  },
  async headers() {
    // All navigable pages must not be cached at the edge/browser, or the PWA can serve
    // a stale document shell after a deploy (especially iOS Safari in standalone mode).
    const pageNoStore = [
      ...SECURITY_HEADERS,
      { key: "Cache-Control", value: "private, no-store, must-revalidate" },
    ] as const;
    // Same set, with the microphone allowed to this origin. Built by swapping
    // the one value rather than writing a second list: a copy would drift, and
    // the copy is the one that would quietly lose the CSP.
    const recordingPage = pageNoStore.map((h) =>
      h.key === "Permissions-Policy"
        ? { key: h.key, value: PERMISSIONS_ALLOW_MIC }
        : h,
    );
    return [
      { source: "/admin", headers: [...pageNoStore] },
      { source: "/admin/:path*", headers: [...pageNoStore] },
      // Before the catch-all, and excluded from it below. Next sends every
      // matching entry, and two Permissions-Policy headers are intersected by
      // the browser -- the deny would win and nothing would change.
      { source: "/apply", headers: [...recordingPage] },
      { source: "/voice/:path*", headers: [...recordingPage] },
      {
        // Apply no-store to all routes except Next.js static bundles and image optimizer,
        // which have their own immutable content-hash cache busting -- and except
        // the two recording pages, which set their own policy above.
        source: "/((?!_next/static|_next/image|apply$|voice/).*)",
        headers: [...pageNoStore],
      },
    ];
  },
};

export default nextConfig;