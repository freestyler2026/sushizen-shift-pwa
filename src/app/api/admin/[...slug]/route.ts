import { NextRequest, NextResponse } from "next/server";
import { tryRefreshUpstream, setRefreshedCookie, sessionToken, IMPERSONATION_COOKIE } from "@/lib/proxy-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function getApiBase() {
  if (process.env.NODE_ENV !== "production") { const _devBase = process.env.NEXT_PUBLIC_API_BASE_URL; if (_devBase) return _devBase.replace(/\/+$/, ""); return "http://127.0.0.1:8000"; }
  const configured = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
  if (configured) {
    if (configured.startsWith("http://")) {
      return configured.replace("http://", "https://");
    }
    return configured;
  }
  return "https://sushizen-shift-app-038d846023bc.herokuapp.com";
}

type ForwardMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Response headers worth keeping. Content-type was the only one carried, so a
 *  206 arrived without its Content-Range and a player could not tell how long
 *  the audio was or seek within it. Cache-control defaults to no-store, which is
 *  right for JSON and wrong for a recording that never changes -- the upstream
 *  says which it wants. */
function passThrough(upstream: Response): Record<string, string> {
  const out: Record<string, string> = {
    "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
    "cache-control": upstream.headers.get("cache-control") || "no-store",
  };
  for (const k of ["content-range", "accept-ranges", "content-length", "content-disposition"]) {
    const v = upstream.headers.get(k);
    if (v) out[k] = v;
  }
  return out;
}

/** Build auth headers: httpOnly cookie takes precedence, client header is backward-compat fallback. */
function resolveAuthHeaders(req: NextRequest): Record<string, string> {
  const access = sessionToken(req);
  const session = req.cookies.get("sz_session")?.value;
  const headers: Record<string, string> = {};
  const auth = access ? `Bearer ${access}` : (req.headers.get("authorization") || "");
  if (auth) headers.Authorization = auth;
  const sid = session || req.headers.get("x-session-id") || "";
  if (sid) headers["X-Session-Id"] = sid;
  return headers;
}

async function forward(req: NextRequest, params: { slug: string[] }, method: ForwardMethod) {
  const apiBase = getApiBase();
  if (!apiBase) {
    return NextResponse.json({ detail: "API base URL is not configured." }, { status: 500 });
  }

  const slug = (params.slug || []).map((part) => encodeURIComponent(part)).join("/");
  const search = req.nextUrl.search || "";
  const body = method === "GET" ? undefined : await req.arrayBuffer();

  const upstreamUrl = `${apiBase}/api/admin/${slug}${search}`;
  const upstreamHeaders: Record<string, string> = {
    Accept: req.headers.get("accept") || "*/*",
    ...resolveAuthHeaders(req),
    ...(req.headers.get("x-approver-pin") ? { "X-Approver-Pin": req.headers.get("x-approver-pin") as string } : {}),
      ...(req.headers.get("x-step-up-token") ? { "X-Step-Up-Token": req.headers.get("x-step-up-token") as string } : {}),
    ...(req.headers.get("x-webauthn-origin") ? { "X-WebAuthn-Origin": req.headers.get("x-webauthn-origin") as string } : {}),
    ...(req.headers.get("origin") ? { Origin: req.headers.get("origin") as string } : {}),
    // Media needs byte ranges. Without forwarding this the upstream never sees
    // a Range request, always answers 200, and Safari refuses to play the audio
    // at all -- the recordings on the voice screening page.
    ...(req.headers.get("range") ? { Range: req.headers.get("range") as string } : {}),
    ...(body && body.byteLength > 0 ? { "Content-Type": req.headers.get("content-type") || "application/json" } : {}),
  };

  let upstream = await fetch(upstreamUrl, { method, headers: upstreamHeaders, body, cache: "no-store" });

  if (upstream.status === 401) {
    const sid = req.cookies.get("sz_session")?.value || "";
    // Never refresh while impersonating: sz_session belongs to the admin,
    // so refreshing would silently restore their own permissions.
    const impersonating = Boolean(req.cookies.get(IMPERSONATION_COOKIE)?.value);

    const newToken = impersonating ? null : await tryRefreshUpstream(apiBase, sid);
    if (newToken) {
      upstream = await fetch(upstreamUrl, {
        method,
        headers: { ...upstreamHeaders, Authorization: `Bearer ${newToken}` },
        body,
        cache: "no-store",
      });
      const bytes = await upstream.arrayBuffer();
      const res = new NextResponse(bytes, {
        status: upstream.status,
        headers: passThrough(upstream),
      });
      setRefreshedCookie(res, newToken);
      return res;
    }
  }

  const bytes = await upstream.arrayBuffer();
  return new NextResponse(bytes, { status: upstream.status, headers: passThrough(upstream) });
}

export async function GET(req: NextRequest, context: { params: Promise<{ slug: string[] }> }) {
  const params = await context.params;
  return forward(req, params, "GET");
}

export async function POST(req: NextRequest, context: { params: Promise<{ slug: string[] }> }) {
  const params = await context.params;
  return forward(req, params, "POST");
}

export async function PUT(req: NextRequest, context: { params: Promise<{ slug: string[] }> }) {
  const params = await context.params;
  return forward(req, params, "PUT");
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ slug: string[] }> }) {
  const params = await context.params;
  return forward(req, params, "PATCH");
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ slug: string[] }> }) {
  const params = await context.params;
  return forward(req, params, "DELETE");
}
