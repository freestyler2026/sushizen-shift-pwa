import { NextRequest, NextResponse } from "next/server";
import { IMPERSONATION_COOKIE } from "@/lib/proxy-auth";

export const dynamic = "force-dynamic";

const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: "strict" as const,
  path: "/api",
  maxAge: 0,
};

export async function POST(_req: NextRequest) {
  const res = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  res.cookies.set("sz_access", "", COOKIE_OPTS);
  res.cookies.set("sz_session", "", COOKIE_OPTS);
  // Logging out while impersonating must not leave the impersonation behind:
  // the next person to sign in on this browser would inherit it.
  res.cookies.set(IMPERSONATION_COOKIE, "", COOKIE_OPTS);
  return res;
}
