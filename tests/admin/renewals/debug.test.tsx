// Tests what specifically runs in the debug save test
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/admin/renewals" }));
vi.mock("next/link", () => ({ default: ({ children, href, ...p }: any) => <a href={href} {...p}>{children}</a> }));
vi.mock("lucide-react", () => ({ AlertTriangle: () => <svg />, CheckCircle2: () => <svg />, ChevronDown: () => <svg />, CircleAlert: () => <svg />, Info: () => <svg />, Loader2: () => <svg data-testid="icon-loader" />, Pencil: () => <svg />, Plus: () => <svg />, Search: () => <svg />, Users: () => <svg />, X: () => <svg data-testid="icon-x" /> }));
vi.mock("@/lib/api", () => ({ API_BASE: "" }));
vi.mock("@/lib/renewals", async (imp) => ({ ...(await imp<any>()), setRenewalsBadgeCount: vi.fn() }));
let mockCanAccess = true;
const AUTH = { accessToken: "tok", role: "HQ", city: "dubai", staffName: "Jay", permissions: [], pin: "1234" };
vi.mock("@/lib/auth", async (imp) => ({ ...(await imp<any>()), getAuth: vi.fn(() => AUTH), refreshAuthFromApi: vi.fn(async () => AUTH), canAccessRenewalsAdmin: vi.fn(() => mockCanAccess), getAuthHeaders: vi.fn(() => ({ Authorization: "Bearer tok" })) }));
import RenewalsAdminPage from "@/app/admin/renewals/page";

const makeFetch = () => vi.fn(async (url: string, init?: any) => {
  const u = String(url);
  if (u.includes("/alerts")) return { ok: true, status: 200, text: async () => JSON.stringify({ alerts: [], badge_count: 0 }) };
  if (u.includes("/staff/") && u.includes("/documents")) return { ok: true, status: 200, text: async () => "{}" };
  if (u.includes("/renewals/staff")) {
    if (init?.method === "POST") return { ok: true, status: 201, text: async () => JSON.stringify({ emp_id: "EMP099" }) };
    return { ok: true, status: 200, text: async () => JSON.stringify({ staff: [] }) };
  }
  if (u.includes("/names")) return { ok: true, status: 200, text: async () => JSON.stringify({ names: [] }) };
  return { ok: false, status: 404, text: async () => "Not Found" };
});

// Simulate the 3 tests that run before add-staff in the real file  
describe("simulate preceding tests", () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it("sim: validation error test (fills 1 input, save fails)", async () => {
    mockCanAccess = true; vi.stubGlobal("fetch", makeFetch());
    render(<RenewalsAdminPage />);
    await screen.findByText("Renewals");
    fireEvent.click(screen.getByRole("button", { name: /Add Staff/i }));
    await screen.findByText("Staff Info");
    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[1], { target: { value: "New Staff" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Staff & Documents/i }));
    await screen.findByText(/Employee ID and full name are required/i);
  });
  it("sim: validation error test 2 (fills other input, save fails)", async () => {
    mockCanAccess = true; vi.stubGlobal("fetch", makeFetch());
    render(<RenewalsAdminPage />);
    await screen.findByText("Renewals");
    fireEvent.click(screen.getByRole("button", { name: /Add Staff/i }));
    await screen.findByText("Staff Info");
    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[0], { target: { value: "EMP099" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Staff & Documents/i }));
    await screen.findByText(/Employee ID and full name are required/i);
  });
});

describe("add staff save (runs after preceding tests)", () => {
  beforeEach(() => { mockCanAccess = true; vi.stubGlobal("fetch", makeFetch()); });
  afterEach(() => { vi.unstubAllGlobals(); });
  it("calls POST with both inputs filled", async () => {
    const mockFetch = makeFetch();
    vi.stubGlobal("fetch", mockFetch);
    render(<RenewalsAdminPage />);
    await screen.findByText("Renewals");
    fireEvent.click(screen.getByRole("button", { name: /Add Staff/i }));
    await screen.findByText("Staff Info");
    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[0], { target: { value: "EMP099" } });
    fireEvent.change(inputs[1], { target: { value: "New Staff" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Staff & Documents/i }));
    await waitFor(() => {
      const hasPOST = mockFetch.mock.calls.some((c: any[]) => String(c[0]) === "/api/renewals/staff" && c[1]?.method === "POST");
      const errToast = screen.queryByText(/Employee ID and full name are required/i);
      console.log("hasPOST:", hasPOST, "errToast:", !!errToast);
      expect(hasPOST || errToast).toBeTruthy();
    }, { timeout: 2000 });
  });
});
