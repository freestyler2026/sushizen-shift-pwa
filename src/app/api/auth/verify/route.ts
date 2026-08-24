import { NextRequest, NextResponse } from "next/server";

function getApiBase() {
  if (process.env.NODE_ENV !== "production") { const _devBase = process.env.NEXT_PUBLIC_API_BASE_URL; if (_devBase) return _devBase.replace(/\/+$/, ""); return "http://127.0.0.1:8000"; }
  const configured = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
  if (configured) return configured;
  return "https://sushizen-shift-app-038d846023bc.herokuapp.com";
}

const COOKIE_MAX_AGE = 604800; // 7 days — server-side session/JWT expiry is the real gate

export async function POST(req: NextRequest) {
  const apiBase = getApiBase();
  if (!apiBase) {
    return NextResponse.json({ detail: "API base URL is not configured." }, { status: 500 });
  }

  const search = req.nextUrl.search || "";

  // Forward the existing sz_access cookie as Authorization so Heroku can issue
  // a same-or-higher-role token (non-downgrade guard on remint).
  const existingToken = req.cookies.get("sz_access")?.value;
  const clientAuth = req.headers.get("authorization");
  const authHeader = existingToken
    ? `Bearer ${existingToken}`
    : clientAuth || "";

  const upstream = await fetch(`${apiBase}/api/auth/verify${search}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      ...(authHeader ? { Authorization: authHeader } : {}),
      ...(req.headers.get("x-approver-pin") ? { "X-Approver-Pin": req.headers.get("x-approver-pin") as string } : {}),
      ...(req.headers.get("x-step-up-token") ? { "X-Step-Up-Token": req.headers.get("x-step-up-token") as string } : {}),
      ...(req.headers.get("x-webauthn-origin") ? { "X-WebAuthn-Origin": req.headers.get("x-webauthn-origin") as string } : {}),
      ...(req.headers.get("origin") ? { Origin: req.headers.get("origin") as string } : {}),
    },
    cache: "no-store",
  });

  const text = await upstream.text();

  if (!upstream.ok) {
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  let body: Record<string, unknown> = {};
  try { body = JSON.parse(text); } catch { body = {}; }

  // Extract tokens before they reach the browser (httpOnly cookie security).
  const accessToken = String(body.access_token || "").trim();
  const sessionId = String(body.session_id || "").trim();

  // Return body WITHOUT the tokens — frontend only sees metadata (name, role, city…).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { access_token, session_id, ...safeBody } = body;

  const res = new NextResponse(JSON.stringify(safeBody), {
    status: upstream.status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

  if (accessToken) {
    res.cookies.set("sz_access", accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/api",
      maxAge: COOKIE_MAX_AGE,
    });
  }
  if (sessionId) {
    res.cookies.set("sz_session", sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/api",
      maxAge: COOKIE_MAX_AGE,
    });
  }

  return res;
}
