import { NextRequest, NextResponse } from "next/server";

/** AI Pro can exceed default serverless limits; stream from Heroku without buffering the full body. */
export const maxDuration = 120;
export const dynamic = "force-dynamic";

function getApiBase(): string {
  if (process.env.NODE_ENV !== "production") return "http://127.0.0.1:8000";
  const configured = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
  if (configured) {
    if (configured.startsWith("http://")) return configured.replace("http://", "https://");
    return configured;
  }
  return "https://sushizen-shift-app-038d846023bc.herokuapp.com";
}

export async function POST(req: NextRequest) {
  const apiBase = getApiBase();
  const body = await req.arrayBuffer();
  const upstream = await fetch(`${apiBase}/api/ai/analytics/chat-pro`, {
    method: "POST",
    headers: {
      Accept: req.headers.get("accept") || "*/*",
      ...(req.headers.get("authorization") ? { Authorization: req.headers.get("authorization") as string } : {}),
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
