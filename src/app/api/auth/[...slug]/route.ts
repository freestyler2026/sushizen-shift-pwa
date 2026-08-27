import { NextRequest, NextResponse } from "next/server";
import { sessionToken } from "@/lib/proxy-auth";

export const dynamic = "force-dynamic";

function getApiBase() {
  if (process.env.NODE_ENV !== "production") { const _devBase = process.env.NEXT_PUBLIC_API_BASE_URL; if (_devBase) return _devBase.replace(/\/+$/, ""); return "http://127.0.0.1:8000"; }
  const configured = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
  if (configured) return configured;
  return "https://sushizen-shift-app-038d846023bc.herokuapp.com";
}

const COOKIE_MAX_AGE = 604800; // 7 days

/** Read sz_access/sz_session cookies and build Authorization / X-Session-Id headers. */
function cookieAuthHeaders(req: NextRequest): Record<string, string> {
  const access = sessionToken(req);
  const session = req.cookies.get("sz_session")?.value;
  const headers: Record<string, string> = {};
  // Cookie takes precedence; fall back to client-provided header (backward compat).
  const authValue = access ? `Bearer ${access}` : (req.headers.get("authorization") || "");
  if (authValue) headers.Authorization = authValue;
  const sessionValue = session || req.headers.get("x-session-id") || "";
  if (sessionValue) headers["X-Session-Id"] = sessionValue;
  return headers;
}

/** Cookie attributes shared by both tokens. */
function cookieOpts() {
  return { httpOnly: true, secure: true, sameSite: "strict" as const, path: "/api", maxAge: COOKIE_MAX_AGE };
}

async function forward(req: NextRequest, params: { slug: string[] }, method: "GET" | "POST") {
  const slug = (params.slug || []).join("/");

  // POST /api/auth/logout — clear cookies only, no upstream call needed.
  if (method === "POST" && slug === "logout") {
    const res = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
    res.cookies.set("sz_access", "", { ...cookieOpts(), maxAge: 0 });
    res.cookies.set("sz_session", "", { ...cookieOpts(), maxAge: 0 });
    return res;
  }

  const apiBase = getApiBase();
  if (!apiBase) {
    return NextResponse.json({ detail: "API base URL is not configured." }, { status: 500 });
  }

  const search = req.nextUrl.search || "";
  const body = method === "POST" ? await req.arrayBuffer() : undefined;

  const upstream = await fetch(`${apiBase}/api/auth/${slug}${search}`, {
    method,
    headers: {
      Accept: req.headers.get("accept") || "*/*",
      ...cookieAuthHeaders(req),
      ...(req.headers.get("x-approver-pin") ? { "X-Approver-Pin": req.headers.get("x-approver-pin") as string } : {}),
      ...(req.headers.get("x-step-up-token") ? { "X-Step-Up-Token": req.headers.get("x-step-up-token") as string } : {}),
      ...(req.headers.get("x-webauthn-origin") ? { "X-WebAuthn-Origin": req.headers.get("x-webauthn-origin") as string } : {}),
      ...(req.headers.get("origin") ? { Origin: req.headers.get("origin") as string } : {}),
      ...(body && body.byteLength > 0
        ? { "Content-Type": req.headers.get("content-type") || "application/json" }
        : {}),
    },
    body,
    cache: "no-store",
  });

  // POST /api/auth/refresh — intercept to update cookies with the new token.
  if (method === "POST" && slug === "refresh" && upstream.ok) {
    let refreshBody: Record<string, unknown> = {};
    try { refreshBody = await upstream.json(); } catch { refreshBody = {}; }

    const newToken = String(refreshBody.access_token || "").trim();
    const newSession = String(refreshBody.session_id || "").trim();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { access_token, session_id, ...safeBody } = refreshBody;

    const res = new NextResponse(JSON.stringify(safeBody), {
      status: upstream.status,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
    if (newToken) res.cookies.set("sz_access", newToken, cookieOpts());
    if (newSession) res.cookies.set("sz_session", newSession, cookieOpts());
    return res;
  }

  const bytes = await upstream.arrayBuffer();
  return new NextResponse(bytes, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function GET(req: NextRequest, context: { params: Promise<{ slug: string[] }> }) {
  return forward(req, await context.params, "GET");
}

export async function POST(req: NextRequest, context: { params: Promise<{ slug: string[] }> }) {
  return forward(req, await context.params, "POST");
}
