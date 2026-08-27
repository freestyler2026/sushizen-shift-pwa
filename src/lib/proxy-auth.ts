// src/lib/proxy-auth.ts
// Server-only: used by Next.js Route Handlers (proxy routes) to handle
// 401 auto-refresh at the proxy layer — transparent to all client-side code.

import type { NextResponse } from "next/server";

/**
 * Cookie holding an impersonation token, set by /api/admin/impersonate.
 *
 * It has to take precedence over sz_access, or the impersonated session is
 * silently ignored: every proxy route preferred the cookie, so "Login As"
 * showed the target's name while still calling the API with the admin's own
 * credentials. The tool for checking a role setup always reported HQ's view,
 * which is why nobody noticed the permission system was inert.
 *
 * The token it carries is always for the impersonated staff member, so it can
 * only ever narrow what the caller can do, never widen it.
 */
export const IMPERSONATION_COOKIE = "sz_imp";

/** The credential a proxy route should forward: impersonation first. */
export function sessionToken(req: { cookies: { get(name: string): { value: string } | undefined } }): string | undefined {
  return req.cookies.get(IMPERSONATION_COOKIE)?.value || req.cookies.get("sz_access")?.value;
}

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
