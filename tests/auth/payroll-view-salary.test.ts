import { describe, it, expect, beforeEach } from "vitest";
import { hasPayrollViewSalary, setAuth, clearAuth, type Auth } from "@/lib/auth";

const base = (role: string, permissions: string[]): Auth => ({
  staffName: "Test Person", city: "manila", role: role as Auth["role"],
  permissions, hasSession: true, accessToken: "t",
});

describe("hasPayrollViewSalary", () => {
  beforeEach(() => { try { clearAuth(); } catch {} });

  it("honours the wildcard — a session holding only '*' holds this too", () => {
    expect(hasPayrollViewSalary(base("ADMIN", ["*"]))).toBe(true);
  });

  it("honours the key itself", () => {
    expect(hasPayrollViewSalary(base("ADMIN", ["payroll.view_salary"]))).toBe(true);
  });

  it("is false for a session holding neither", () => {
    expect(hasPayrollViewSalary(base("ADMIN", ["channel.admin.dashboard.view"]))).toBe(false);
  });

  it("HQ passes on role alone", () => {
    expect(hasPayrollViewSalary(base("HQ", []))).toBe(true);
  });
});
