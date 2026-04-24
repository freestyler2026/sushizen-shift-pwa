import { NextRequest, NextResponse } from "next/server";

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
  try {
    const upstream = await fetch(`${apiBase}/api/draft/ai_analyze`, {
      method: "POST",
      headers: {
        "Content-Type": req.headers.get("content-type") || "application/json",
        ...(req.headers.get("authorization") ? { Authorization: req.headers.get("authorization") as string } : {}),
      },
      body: body.byteLength ? body : undefined,
      cache: "no-store",
    });
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch (e: any) {
    return NextResponse.json({ ok: false, detail: String(e?.message || e) }, { status: 500 });
  }
}
