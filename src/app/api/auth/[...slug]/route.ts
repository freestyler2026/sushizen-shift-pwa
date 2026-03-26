import { NextRequest, NextResponse } from "next/server";

function getApiBase() {
  if (process.env.NODE_ENV !== "production") return "http://127.0.0.1:8000";
  const configured = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
  if (configured) return configured;
  return "";
}

async function forward(req: NextRequest, params: { slug: string[] }, method: "GET" | "POST") {
  const apiBase = getApiBase();
  if (!apiBase) {
    return NextResponse.json({ detail: "API base URL is not configured." }, { status: 500 });
  }

  const slug = (params.slug || []).map((part) => encodeURIComponent(part)).join("/");
  const search = req.nextUrl.search || "";
  const body = method === "POST" ? await req.arrayBuffer() : undefined;
  const upstream = await fetch(`${apiBase}/api/auth/${slug}${search}`, {
    method,
    headers: {
      Accept: req.headers.get("accept") || "*/*",
      ...(req.headers.get("authorization") ? { Authorization: req.headers.get("authorization") as string } : {}),
      ...(req.headers.get("x-step-up-token") ? { "X-Step-Up-Token": req.headers.get("x-step-up-token") as string } : {}),
      ...(req.headers.get("x-webauthn-origin") ? { "X-WebAuthn-Origin": req.headers.get("x-webauthn-origin") as string } : {}),
      ...(req.headers.get("origin") ? { Origin: req.headers.get("origin") as string } : {}),
      ...(body
        ? {
            "Content-Type": req.headers.get("content-type") || "application/json",
          }
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
  const params = await context.params;
  return forward(req, params, "GET");
}

export async function POST(req: NextRequest, context: { params: Promise<{ slug: string[] }> }) {
  const params = await context.params;
  return forward(req, params, "POST");
}
