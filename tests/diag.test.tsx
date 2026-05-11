import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("framer-motion", () => {
  const React = require("react");
  const proxy = new Proxy({} as any, { get: (_, k: string) => React.forwardRef(({ children, ...rest }: any, ref: any) => React.createElement(k, { ...rest, ref }, children)) });
  return { motion: proxy, AnimatePresence: ({ children }: any) => children };
});
vi.mock("next/link", () => ({ default: ({ children, href, ...rest }: any) => <a href={href} {...rest}>{children}</a> }));
vi.mock("lucide-react", () => new Proxy({}, { get: (_, k) => () => <svg data-testid={String(k)} /> }));
vi.mock("@/components/admin/AdminOnboardingLinks", () => ({ default: () => <div /> }));

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
vi.mock("@/lib/api", () => ({
  apiGet:  (...a: any[]) => mockApiGet(...a),
  apiPost: (...a: any[]) => mockApiPost(...a),
  qs: (p: Record<string, any>) => "?" + new URLSearchParams(Object.entries(p).filter(([,v])=>v!==undefined&&v!=="").map(([k,v])=>[k,String(v)])).toString(),
  API_BASE: "",
}));

const STAFF_AUTH = { accessToken: "tok", role: "ADMIN" as const, city: "dubai" as const, staffName: "Admin User", permissions: ["*"], pin: "9999" };
vi.mock("@/lib/auth", async (imp) => {
  const actual = await imp<any>();
  return { ...actual, getAuth: vi.fn(() => STAFF_AUTH), refreshAuthFromApi: vi.fn(async () => STAFF_AUTH), canAccessAdminNav: vi.fn(() => true), canAccessRoleManagement: vi.fn(() => false), getAuthHeaders: vi.fn(() => ({})) };
});

import AdminStaffPage from "@/app/admin/staff/page";

const ROW_ACTIVE = { id: "1", city: "dubai", display_name: "Tanaka Jay", home_branch: "JLT", role: "STAFF", status: "ACTIVE", max_days_per_week: 5, max_consecutive_days: 5, notes: "", setup_required: false, setup_completed: true, workforce_push_user_key: "" };

describe("Diag", () => {
  it("dedupe test - what actually happens", async () => {
    mockApiGet.mockResolvedValue({
      ok: true,
      rows: [
        { ...ROW_ACTIVE },
        { ...ROW_ACTIVE, id: "1b", display_name: "tanaka jay", home_branch: "", role: "STAFF", notes: "" },
      ],
    });
    render(<AdminStaffPage />);
    
    // Wait for auth to settle
    await screen.findByText("Staff Master", {}, { timeout: 3000 });
    
    const btn = await screen.findByRole("button", { name: /Login & Load/i }, { timeout: 3000 });
    console.log("Button found, disabled?", (btn as HTMLButtonElement).disabled);
    console.log("Button textContent:", btn.textContent);
    
    await act(async () => {
      fireEvent.click(btn);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    
    // Check what's in the DOM now
    await waitFor(() => {
      const body = document.body.textContent;
      console.log("mockApiGet call count:", mockApiGet.mock.calls.length);
      console.log("Body contains 'Loaded':", body?.includes('Loaded'));
      console.log("Body contains 'members':", body?.match(/\d+ members/)?.[0]);
      console.log("Body contains 'Refresh list':", body?.includes('Refresh list'));
      // Force pass to see logs
      expect(true).toBe(true);
    }, { timeout: 1000 });
  }, 15000);
});
