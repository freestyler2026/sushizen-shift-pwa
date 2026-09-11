import { describe, it, expect, beforeEach, vi } from "vitest";
import { setAuth, clearAuth, ACCESS_CHANGED_EVENT, type Auth } from "@/lib/auth";

const a = (permissions: string[], role = "ADMIN"): Auth => ({
  staffName: "Test Person", city: "manila", role: role as Auth["role"],
  permissions, hasSession: true, accessToken: "t",
});

describe("ACCESS_CHANGED_EVENT", () => {
  beforeEach(() => { try { clearAuth(); } catch {} });

  it("does not fire on a first sign-in", () => {
    const spy = vi.fn();
    window.addEventListener(ACCESS_CHANGED_EVENT, spy);
    setAuth(a(["channel.admin.dashboard.view"]));
    expect(spy).not.toHaveBeenCalled();
    window.removeEventListener(ACCESS_CHANGED_EVENT, spy);
  });

  it("does not fire when the refresh writes the same access back", () => {
    setAuth(a(["channel.admin.dashboard.view"]));
    const spy = vi.fn();
    window.addEventListener(ACCESS_CHANGED_EVENT, spy);
    setAuth(a(["channel.admin.dashboard.view"]));
    expect(spy).not.toHaveBeenCalled();
    window.removeEventListener(ACCESS_CHANGED_EVENT, spy);
  });

  it("fires when a permission is granted", () => {
    setAuth(a(["channel.admin.dashboard.view"]));
    const spy = vi.fn();
    window.addEventListener(ACCESS_CHANGED_EVENT, spy);
    setAuth(a(["channel.admin.dashboard.view", "payroll.view_salary"]));
    expect(spy).toHaveBeenCalledTimes(1);
    window.removeEventListener(ACCESS_CHANGED_EVENT, spy);
  });

  it("fires when a permission is taken away", () => {
    setAuth(a(["channel.admin.dashboard.view", "payroll.view_salary"]));
    const spy = vi.fn();
    window.addEventListener(ACCESS_CHANGED_EVENT, spy);
    setAuth(a(["channel.admin.dashboard.view"]));
    expect(spy).toHaveBeenCalledTimes(1);
    window.removeEventListener(ACCESS_CHANGED_EVENT, spy);
  });

  it("ignores the order the server happens to send them in", () => {
    setAuth(a(["b.perm", "a.perm"]));
    const spy = vi.fn();
    window.addEventListener(ACCESS_CHANGED_EVENT, spy);
    setAuth(a(["a.perm", "b.perm"]));
    expect(spy).not.toHaveBeenCalled();
    window.removeEventListener(ACCESS_CHANGED_EVENT, spy);
  });
});
