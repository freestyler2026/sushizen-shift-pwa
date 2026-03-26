import type { NextConfig } from "next";

const RAW_API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim();
const API_BASE = RAW_API_BASE ? RAW_API_BASE.replace(/\/+$/, "") : "";
const IS_DEV = process.env.NODE_ENV === "development";
const SECURITY_HEADERS = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: "default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
];

if (!IS_DEV) {
  SECURITY_HEADERS.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" });
}

const nextConfig: NextConfig = {
  reactStrictMode: false,
  // Prevent dev/build cache collisions that can cause missing module errors.
  distDir: IS_DEV ? ".next-dev" : ".next",
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
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;