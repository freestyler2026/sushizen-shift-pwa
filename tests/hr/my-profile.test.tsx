// My Profile (HR Manager's request, 2026-11-24): the employee keeps their own
// record; government numbers and the payroll account wait for HR to check.
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ staffName: "Juan Dela Cruz", role: "STAFF", city: "manila" }),
  getAuthHeaders: () => ({ "Content-Type": "application/json" }),
  tryRefreshAccessToken: async () => false,
}));

type Call = { url: string; method: string; body: Record<string, unknown> };
let calls: Call[] = [];
let routes: Array<[RegExp, string, (b: Record<string, unknown>) => [number, unknown]]> = [];
beforeEach(() => {
  calls = [];
  routes = [];
  global.fetch = vi.fn((u: string | URL | Request, init?: RequestInit) => {
    const url = String(u);
    const method = (init?.method || "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ url, method, body });
    const hit = routes.find(([re, m]) => m === method && re.test(url));
    const [status, json] = hit ? hit[2](body) : [404, { detail: "not mocked" }];
    return Promise.resolve(new Response(JSON.stringify(json), { status, headers: { "Content-Type": "application/json" } }));
  }) as unknown as typeof fetch;
});

const SENSITIVE = { sss_number: "SSS number", philhealth_id: "PhilHealth number", pagibig_mid: "Pag-IBIG MID", tin: "TIN",
  bank_name: "Bank / wallet", bank_account_no: "Bank account number", gcash_number: "GCash number" };
const PROFILE = {
  staff_name: "Juan Dela Cruz", city: "manila", status: "ACTIVE",
  values: { staff_name: "Juan Dela Cruz", position: "Cook", date_of_birth: "", phone: "0917 123 4567", hire_date: "2026-11-24",
    claimed_hire_date: "", address: "", email: "", emergency_name: "", emergency_phone: "", emergency_relation: "",
    sss_number: "", philhealth_id: "", pagibig_mid: "", tin: "", bank_name: "", bank_account_no: "", gcash_number: "" },
  sensitive_fields: SENSITIVE, payroll_profile_exists: true, pending: [], missing: ["Home address", "SSS number"],
  complete: false, history: [],
};

describe("My Profile (employee)", () => {
  it("saves only what changed; the SSS number shows as waiting for HR", async () => {
    routes.push([/\/api\/me\/profile$/, "GET", () => [200, PROFILE]]);
    routes.push([/\/api\/me\/employment$/, "GET", () => [200, { confirmed_hire_date: "2026-11-24" }]]);
    routes.push([/\/api\/me\/profile$/, "POST", (b) => [200, {
      ...PROFILE, values: { ...PROFILE.values, address: String(b.address) },
      pending: [{ id: "r1", field: "sss_number", value: "3412345678", submitted_by: "Juan Dela Cruz", submitted_at: "2026-11-24T08:00:00Z" }],
    }]]);
    const { default: Page } = await import("@/app/my-contact/page");
    render(<Page />);
    expect(await screen.findByText("My Profile")).toBeTruthy();
    expect(screen.getByText(/Still missing: Home address, SSS number/)).toBeTruthy();
    expect((screen.getByLabelText("Position") as HTMLInputElement).disabled).toBe(true);   // HR only
    fireEvent.change(screen.getByLabelText("Home address"), { target: { value: "12 Mabini St, Taft" } });
    fireEvent.change(screen.getByLabelText("SSS number"), { target: { value: "34-1234567-8" } });
    fireEvent.click(screen.getByText("Save"));
    expect(await screen.findByText(/Waiting for HR to check: 3412345678/)).toBeTruthy();
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.body).toEqual({ address: "12 Mabini St, Taft", sss_number: "34-1234567-8" });
  });
});

describe("Employee profiles (HR)", () => {
  it("lists who is missing what, and verifies a change against the document", async () => {
    routes.push([/onboarding\/profiles\?city=manila$/, "GET", () => [200, { profiles: [
      { staff_name: "Juan Dela Cruz", missing: ["Home address"], complete: false, pending: 1, payroll_profile_exists: true }] }]]);
    const withPending = { ...PROFILE, pending: [{ id: "r1", field: "sss_number", value: "3412345678", submitted_by: "Juan Dela Cruz",
      submitted_at: "2026-11-24T08:00:00Z" }] };
    routes.push([/onboarding\/profiles\/Juan%20Dela%20Cruz$/, "GET", () => [200, withPending]]);
    routes.push([/profile-requests\/r1$/, "POST", () => [200, { ...PROFILE, values: { ...PROFILE.values, sss_number: "3412345678" } }]]);
    const { default: EmployeeProfiles } = await import("@/app/admin/hr/onboarding/Profiles");
    render(<EmployeeProfiles city="manila" onClose={() => {}} />);
    expect(await screen.findByText("1 to check")).toBeTruthy();
    fireEvent.click(screen.getByText("Juan Dela Cruz"));
    expect(await screen.findByTestId("profile-pending")).toBeTruthy();
    expect((screen.getByLabelText("Position") as HTMLInputElement).disabled).toBe(false);  // HR edits it
    fireEvent.click(screen.getByText("Verified — use it"));
    await waitFor(() => expect(screen.queryByTestId("profile-pending")).toBeNull());
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({ approve: true, note: "" });
    expect((screen.getByLabelText("SSS number") as HTMLInputElement).value).toBe("3412345678");
  });
});
