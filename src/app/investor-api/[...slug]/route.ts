import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getApiBase() {
  if (process.env.NODE_ENV !== "production") return "http://127.0.0.1:8000";
  const configured = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
  if (configured) return configured;
  return "https://sushizen-shift-app-038d846023bc.herokuapp.com";
}

const INVESTOR_KEY = "sushizen-demo";

async function forward(req: NextRequest, params: { slug: string[] }, method: string) {
  const apiBase = getApiBase();
  const slug = (params.slug || []).join("/");
  const search = req.nextUrl.search || "";
  const body = method === "GET" ? undefined : await req.arrayBuffer();
  const upstream = await fetch(`${apiBase}/api/investor/${slug}${search}`, {
    method,
    headers: {
      Accept: req.headers.get("accept") || "*/*",
      "x-investor-key": INVESTOR_KEY,
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

export async function GET(req: NextRequest, context: { params: Promise<{ slug: string[] }> }) {
  return forward(req, await context.params, "GET");
}
