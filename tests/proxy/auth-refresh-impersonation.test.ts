// tests/proxy/auth-refresh-impersonation.test.ts
//
// 2026-10-17: a refresh during "Login As" sent the sz_imp token upstream, got a
// full token for the other person back, and wrote it into the admin's own
// sz_access. The auth proxy now refuses the refresh while sz_imp is set.
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

const upstream = vi.fn(async () => new Response(JSON.stringify({ ok: true, access_token: "new" }), { status: 200 }));
global.fetch = upstream as unknown as typeof fetch;

import { POST } from "@/app/api/auth/[...slug]/route";

function req(cookie: string) {
  return new NextRequest("https://sushizen-shift-pwa.vercel.app/api/auth/refresh", {
    method: "POST", headers: { cookie },
  });
}

describe("auth proxy — refresh during Login As", () => {
  it("refuses without calling the backend or touching sz_access", async () => {
    upstream.mockClear();
    const res = await POST(req("sz_imp=imp-token; sz_access=admin-token; sz_session=s1"),
      { params: Promise.resolve({ slug: ["refresh"] }) });
    expect(res.status).toBe(409);
    expect(upstream).not.toHaveBeenCalled();
    expect(res.cookies.get("sz_access")).toBeUndefined();
  });

  it("still refreshes normally when not impersonating", async () => {
    upstream.mockClear();
    const res = await POST(req("sz_access=admin-token; sz_session=s1"),
      { params: Promise.resolve({ slug: ["refresh"] }) });
    expect(res.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(res.cookies.get("sz_access")?.value).toBe("new");
  });
});
