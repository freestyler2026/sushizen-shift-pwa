import { NextRequest, NextResponse } from "next/server";
import { sessionToken } from "@/lib/proxy-auth";

/** AI Pro can exceed default serverless limits; stream from Heroku without buffering the full body.
 *  120s was cutting long answers off mid-stream: the function died, no final
 *  event ever arrived, and the page told people to rephrase a question that was
 *  never the problem. A help-mode answer that reads the code can take 20-35
 *  tool rounds. */
export const maxDuration = 300;
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

/** Phase 3: sz_access httpOnly cookie takes precedence; fall back to client Authorization header. */
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

export async function POST(req: NextRequest) {
  const apiBase = getApiBase();
  const body = await req.arrayBuffer();
  const upstream = await fetch(`${apiBase}/api/ai/analytics/chat-pro`, {
    method: "POST",
    headers: {
      Accept: req.headers.get("accept") || "*/*",
      ...resolveAuthHeaders(req),
      ...(req.headers.get("x-step-up-token") ? { "X-Step-Up-Token": req.headers.get("x-step-up-token") as string } : {}),
      ...(req.headers.get("x-webauthn-origin") ? { "X-WebAuthn-Origin": req.headers.get("x-webauthn-origin") as string } : {}),
      "Content-Type": req.headers.get("content-type") || "application/json",
    },
    body: body.byteLength ? body : undefined,
    cache: "no-store",
  });

  const ct = upstream.headers.get("content-type") || "text/event-stream";
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": ct,
      "cache-control": "no-store",
      ...(upstream.headers.get("x-accel-buffering")
        ? { "x-accel-buffering": upstream.headers.get("x-accel-buffering") as string }
        : {}),
    },
  });
}
