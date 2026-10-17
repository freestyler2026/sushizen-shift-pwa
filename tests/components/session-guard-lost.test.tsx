// tests/components/session-guard-lost.test.tsx
//
// 2026-10-17: the owner's browser had no session cookie and no usable token.
// Every API said 401, the menu still showed him signed in, and each page
// printed a raw 401. "no_session_id" now asks the server whether it can still
// sign this browser in, and goes to the login screen only on an explicit 401.
import React from "react";
import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => "/request", useRouter: () => ({ replace }) }));
const clearAuth = vi.fn();
vi.mock("@/lib/impersonation", () => ({ getImpersonationInfo: () => null }));
vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ staffName: "Yukihiro Nishimura", role: "HQ", hasSession: true, accessToken: "" }),
  setAuth: vi.fn(), clearAuth: () => clearAuth(),
  nonDowngradedAccess: (_a: unknown, role: string, permissions: string[]) => ({ role, permissions }),
}));

let refreshStatus = 401;
beforeEach(() => {
  vi.useFakeTimers();
  replace.mockClear(); clearAuth.mockClear();
  global.fetch = vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("/api/auth/session-check")) return new Response(JSON.stringify({ valid: false, reason: "no_session_id" }), { status: 200 });
    if (u.includes("/api/auth/refresh")) return new Response("{}", { status: refreshStatus });
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
});
afterEach(() => { vi.useRealTimers(); });

import SessionGuard from "@/components/SessionGuard";

async function run(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }

describe("SessionGuard — no session at all", () => {
  it("goes to the login screen when the server cannot sign this browser in", async () => {
    refreshStatus = 401;
    render(<SessionGuard />);
    await run(2100);
    expect(screen.getByRole("alert").textContent).toMatch(/session has expired/i);
    await run(3100);
    expect(clearAuth).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/login?reason=expired");
  });

  it("stays put when the refresh works", async () => {
    refreshStatus = 200;
    render(<SessionGuard />);
    await run(6000);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it("checks again when a page reports a lost session", async () => {
    refreshStatus = 200;
    render(<SessionGuard />);
    await run(2100);
    refreshStatus = 401;
    await act(async () => { window.dispatchEvent(new Event("zen:session-lost")); await vi.advanceTimersByTimeAsync(10); });
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});

describe("SessionGuard — many lost signals at once", () => {
  it("asks the server once for a burst of lost-session events", async () => {
    refreshStatus = 200;
    render(<SessionGuard />);
    await run(2100);
    const before = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .filter(c => String(c[0]).includes("/api/auth/refresh")).length;
    await act(async () => {
      for (let i = 0; i < 15; i++) window.dispatchEvent(new Event("zen:session-lost"));
      await vi.advanceTimersByTimeAsync(10);
    });
    const after = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .filter(c => String(c[0]).includes("/api/auth/refresh")).length;
    expect(after - before).toBe(1);
  });
});
