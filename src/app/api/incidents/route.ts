import { NextRequest, NextResponse } from "next/server";
import { sessionToken } from "@/lib/proxy-auth";

export const dynamic = "force-dynamic";

function getApiBase() {
  if (process.env.NODE_ENV !== "production") { const _devBase = process.env.NEXT_PUBLIC_API_BASE_URL; if (_devBase) return _devBase.replace(/\/+$/, ""); return "http://127.0.0.1:8000"; }
  const configured = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
  if (configured) {
    if (configured.startsWith("http://")) { return configured.replace("http://", "https://"); }
    return configured;
  }
  return "https://sushizen-shift-app-038d846023bc.herokuapp.com";
}

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

async function forward(req: NextRequest, method: "GET" | "POST") {
  const apiBase = getApiBase();
  const search = req.nextUrl.search || "";
  const body = method === "GET" ? undefined : await req.arrayBuffer();
  const upstream = await fetch(`${apiBase}/api/incidents${search}`, {
    method,
    headers: {
      Accept: req.headers.get("accept") || "*/*",
      ...resolveAuthHeaders(req),
      ...(body && body.byteLength > 0
        ? { "Content-Type": req.headers.get("content-type") || "application/json" }
        : {}),
    },
    body,
    cache: "no-store",
  });
  const bytes = await upstream.arrayBuffer();
  return new NextResponse(bytes, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function GET(req: NextRequest) { return forward(req, "GET"); }
export async function POST(req: NextRequest) { return forward(req, "POST"); }
