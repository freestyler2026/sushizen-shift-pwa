import { NextRequest, NextResponse } from "next/server";
import { tryRefreshUpstream, setRefreshedCookie } from "@/lib/proxy-auth";

export const dynamic = "force-dynamic";

function getApiBase() {
  if (process.env.NODE_ENV !== "production") { const _devBase = process.env.NEXT_PUBLIC_API_BASE_URL; if (_devBase) return _devBase.replace(/\/+$/, ""); return "http://127.0.0.1:8000"; }
  const configured = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
  if (configured) {
    if (configured.startsWith("http://")) return configured.replace("http://", "https://");
    return configured;
  }
  return "https://sushizen-shift-app-038d846023bc.herokuapp.com";
}

type ForwardMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Build auth headers: httpOnly cookie takes precedence, client header is backward-compat fallback. */
function resolveAuthHeaders(req: NextRequest): Record<string, string> {
  const access = req.cookies.get("sz_access")?.value;
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
  const slug = (params.slug || []).map((part) => encodeURIComponent(part)).join("/");
  const search = req.nextUrl.search || "";
  const body = method === "GET" ? undefined : await req.arrayBuffer();

  const upstreamUrl = `${apiBase}/api/store/${slug}${search}`;
  const upstreamHeaders: Record<string, string> = {
    Accept: req.headers.get("accept") || "*/*",
    ...resolveAuthHeaders(req),
    ...(req.headers.get("x-approver-pin") ? { "X-Approver-Pin": req.headers.get("x-approver-pin") as string } : {}),
      ...(req.headers.get("x-step-up-token") ? { "X-Step-Up-Token": req.headers.get("x-step-up-token") as string } : {}),
    ...(body && body.byteLength > 0 ? { "Content-Type": req.headers.get("content-type") || "application/json" } : {}),
  };

  let upstream = await fetch(upstreamUrl, { method, headers: upstreamHeaders, body, cache: "no-store" });

  if (upstream.status === 401) {
    const sid = req.cookies.get("sz_session")?.value || "";
    const newToken = await tryRefreshUpstream(apiBase, sid);
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
        headers: {
          "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
          "cache-control": "no-store",
        },
      });
      setRefreshedCookie(res, newToken);
      return res;
    }
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
export async function PUT(req: NextRequest, context: { params: Promise<{ slug: string[] }> }) {
  return forward(req, await context.params, "PUT");
}
export async function PATCH(req: NextRequest, context: { params: Promise<{ slug: string[] }> }) {
  return forward(req, await context.params, "PATCH");
}
export async function DELETE(req: NextRequest, context: { params: Promise<{ slug: string[] }> }) {
  return forward(req, await context.params, "DELETE");
}
