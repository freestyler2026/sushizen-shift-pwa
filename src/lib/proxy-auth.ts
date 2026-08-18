// src/lib/proxy-auth.ts
// Server-only: used by Next.js Route Handlers (proxy routes) to handle
// 401 auto-refresh at the proxy layer — transparent to all client-side code.

import type { NextResponse } from "next/server";

export const PROXY_COOKIE_OPTS = {
  httpOnly: true as const,
  secure: true as const,
  sameSite: "strict" as const,
  path: "/api" as const,
  maxAge: 604800, // 7 days — same as auth/verify
};

/**
 * When Heroku returns 401, try to get a new JWT using the server-side
 * sz_session cookie (forwarded as X-Session-Id). Returns the new JWT or null.
 */
export async function tryRefreshUpstream(
  apiBase: string,
  sessionId: string
): Promise<string | null> {
  if (!sessionId) return null;
  try {
    const res = await fetch(`${apiBase}/api/auth/refresh`, {
      method: "POST",
      headers: { "X-Session-Id": sessionId },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    return String(data.access_token || "").trim() || null;
  } catch {
    return null;
  }
}

/** Set new sz_access cookie on a NextResponse after a successful refresh-retry. */
export function setRefreshedCookie(res: NextResponse, newToken: string): void {
  res.cookies.set("sz_access", newToken, PROXY_COOKIE_OPTS);
}
