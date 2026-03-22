import type { NextConfig } from "next";

const RAW_API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim();
const API_BASE = RAW_API_BASE ? RAW_API_BASE.replace(/\/+$/, "") : "";
const IS_DEV = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  // Prevent dev/build cache collisions that can cause missing module errors.
  distDir: IS_DEV ? ".next-dev" : ".next",
  async rewrites() {
    if (!API_BASE) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${API_BASE}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;