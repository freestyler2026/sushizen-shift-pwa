import { NextRequest, NextResponse } from "next/server";

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

async function forward(req: NextRequest, params: { slug: string[] }, method: ForwardMethod) {
  const apiBase = getApiBase();
  const slug = (params.slug || []).map((part) => encodeURIComponent(part)).join("/");
  const search = req.nextUrl.search || "";
  const body = method === "GET" ? undefined : await req.arrayBuffer();
  const upstream = await fetch(`${apiBase}/api/store/${slug}${search}`, {
    method,
    headers: {
      Accept: req.headers.get("accept") || "*/*",
      ...(req.headers.get("authorization") ? { Authorization: req.headers.get("authorization") as string } : {}),
      ...(req.headers.get("x-step-up-token") ? { "X-Step-Up-Token": req.headers.get("x-step-up-token") as string } : {}),
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
