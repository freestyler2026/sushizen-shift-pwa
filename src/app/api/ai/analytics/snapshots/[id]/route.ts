import { NextRequest, NextResponse } from "next/server";
import { sessionToken } from "@/lib/proxy-auth";

export const dynamic = "force-dynamic";

function getApiBase(): string {
  if (process.env.NODE_ENV !== "production") { const _devBase = process.env.NEXT_PUBLIC_API_BASE_URL; if (_devBase) return _devBase.replace(/\/+$/, ""); return "http://127.0.0.1:8000"; }
  const configured = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
  if (configured) {
    if (configured.startsWith("http://")) return configured.replace("http://", "https://");
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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const apiBase = getApiBase();
  const { id } = await params;
  const upstream = await fetch(`${apiBase}/api/ai/analytics/snapshots/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { ...resolveAuthHeaders(req) },
    cache: "no-store",
  });
  const text = await upstream.text();
  return new NextResponse(text || null, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") || "application/json", "cache-control": "no-store" },
  });
}
