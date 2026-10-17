// tests/lib/fetch-refresh.test.ts — the one retry every bare fetch("/api/...") gets.
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

const refresh = vi.fn(async () => true);
let impersonating: unknown = null;
vi.mock("@/lib/auth", () => ({ tryRefreshAccessToken: () => refresh() }));
vi.mock("@/lib/impersonation", () => ({ getImpersonationInfo: () => impersonating }));

const seen: string[] = [];
let failFirst = true;
const base = vi.fn(async (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  seen.push(url);
  if (failFirst) { failFirst = false; return new Response('{"detail":"Authentication required"}', { status: 401 }); }
  return new Response("{}", { status: 200 });
});

beforeAll(async () => {
  window.fetch = base as unknown as typeof fetch;
  const m = await import("@/lib/fetch-refresh");
  m.installFetchRefresh();
});
beforeEach(async () => { await new Promise(r => setTimeout(r, 1)); seen.length = 0; failFirst = true; refresh.mockClear(); impersonating = null; });

describe("installFetchRefresh", () => {
  it("refreshes and retries a 401 from /api/", async () => {
    const r = await window.fetch("/api/request/notifications/inbox?city=manila");
    expect(r.status).toBe(200);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(seen).toHaveLength(2);
  });

  it("does not touch /api/auth/ — that is the refresh itself", async () => {
    const r = await window.fetch("/api/auth/refresh", { method: "POST" });
    expect(r.status).toBe(401);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not refresh while impersonating", async () => {
    impersonating = { impersonating: "Someone", impersonatedBy: "Admin" };
    const r = await window.fetch("/api/store/management/checklist?city=dubai&branch=BB");
    expect(r.status).toBe(401);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("returns the 401 when the refresh fails", async () => {
    refresh.mockResolvedValueOnce(false);
    const r = await window.fetch("/api/admin/overview");
    expect(r.status).toBe(401);
    expect(seen).toHaveLength(1);
  });

  it("leaves other origins alone", async () => {
    const r = await window.fetch("https://example.com/api/x");
    expect(r.status).toBe(401);
    expect(refresh).not.toHaveBeenCalled();
  });
});
