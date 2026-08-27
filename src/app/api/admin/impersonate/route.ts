import { NextRequest, NextResponse } from "next/server";
import { IMPERSONATION_COOKIE, sessionToken } from "@/lib/proxy-auth";

export const dynamic = "force-dynamic";

/**
 * "Login As" — start and stop viewing the app as another staff member.
 *
 * This route exists because the generic proxy cannot carry an impersonation:
 * every route prefers the httpOnly session cookie over any Authorization
 * header, so a token held in localStorage was silently ignored and the
 * impersonated session kept the admin's own permissions.
 *
 * The token is stored in its own httpOnly cookie instead, which the proxies
 * prefer over sz_access. It is minted for the target staff member, so it can
 * only ever narrow what the caller can do.
 */

function getApiBase() {
  if (process.env.NODE_ENV !== "production") {
    const dev = process.env.NEXT_PUBLIC_API_BASE_URL;
    return dev ? dev.replace(/\/+$/, "") : "http://127.0.0.1:8000";
  }
  const configured = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
  if (configured) return configured.replace(/^http:\/\//, "https://");
  return "https://sushizen-shift-app-038d846023bc.herokuapp.com";
}

const COOKIE_OPTS = {
  httpOnly: true as const,
  secure: true as const,
  sameSite: "strict" as const,
  path: "/api" as const,
};

export async function POST(req: NextRequest) {
  // Start impersonating. Authorisation is the upstream's call — it allows
  // HQ/ADMIN only and writes an audit entry. Deliberately uses sz_access,
  // not sessionToken(): impersonating from inside an impersonation would
  // chain sessions and make the audit trail meaningless.
  const admin = req.cookies.get("sz_access")?.value || req.headers.get("authorization") || "";
  if (!admin) {
    return NextResponse.json({ detail: "Authentication required." }, { status: 401 });
  }
  if (req.cookies.get(IMPERSONATION_COOKIE)?.value) {
    return NextResponse.json(
      { detail: "Already viewing as someone else. Exit first." },
      { status: 409 },
    );
  }

  const body = await req.text();
  const upstream = await fetch(`${getApiBase()}/api/admin/impersonate`, {
    method: "POST",
    headers: {
      Authorization: admin.startsWith("Bearer ") ? admin : `Bearer ${admin}`,
      "Content-Type": "application/json",
      ...(req.cookies.get("sz_session")?.value
        ? { "X-Session-Id": req.cookies.get("sz_session")!.value }
        : {}),
    },
    body,
    cache: "no-store",
  });

  const text = await upstream.text();
  if (!upstream.ok) {
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    return NextResponse.json({ detail: "Unexpected response from the server." }, { status: 502 });
  }

  const token = String(data.access_token || "");
  if (!token) {
    return NextResponse.json({ detail: "No session was issued." }, { status: 502 });
  }

  // The token never reaches client-side JavaScript — the cookie is the only
  // place it lives, exactly as the normal session works.
  delete data.access_token;
  const res = NextResponse.json(data, { headers: { "cache-control": "no-store" } });
  res.cookies.set(IMPERSONATION_COOKIE, token, { ...COOKIE_OPTS, maxAge: 4 * 60 * 60 });
  return res;
}

export async function DELETE(req: NextRequest) {
  // Stop impersonating. Clearing the cookie restores the admin's own session,
  // which was never touched.
  const was = Boolean(req.cookies.get(IMPERSONATION_COOKIE)?.value);
  const res = NextResponse.json({ ok: true, was_impersonating: was }, {
    headers: { "cache-control": "no-store" },
  });
  res.cookies.set(IMPERSONATION_COOKIE, "", { ...COOKIE_OPTS, maxAge: 0 });
  return res;
}

export async function GET(req: NextRequest) {
  // Lets the banner ask the server, rather than trusting a localStorage flag
  // that a reload or a second tab can leave stale.
  return NextResponse.json(
    { impersonating: Boolean(req.cookies.get(IMPERSONATION_COOKIE)?.value), has_session: Boolean(sessionToken(req)) },
    { headers: { "cache-control": "no-store" } },
  );
}
