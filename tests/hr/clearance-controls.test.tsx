// Clearance that cannot be skipped (owner, 2026-11-22).
//
// A Manila leaver was marked SEPARATED with no clearance case and sent to the
// CK to have a paper signed. Kitchen managers now record what was handed back
// (counts, at a kitchen); HR signs the office items; approvals are by named
// people; the employee signs the deduction authorization at onboarding.
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }) }));
vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ staffName: "Hidenobu Yuzawa", role: "MANAGER", city: "manila" }),
  getAuthHeaders: () => ({ "Content-Type": "application/json" }),
  hasChannelAccess: () => true,
  tryRefreshAccessToken: async () => false,
}));
// jsdom has no canvas: the pad becomes a button that "signs".
vi.mock("@/components/SignaturePad", () => ({
  default: ({ onChange }: { onChange: (v: string | null) => void }) => (
    <button type="button" onClick={() => onChange("data:image/png;base64,SIGNED")}>sign-here</button>
  ),
}));

type Call = { url: string; method: string; body: Record<string, unknown> };
let calls: Call[] = [];
let routes: Array<[RegExp, string, (b: Record<string, unknown>) => [number, unknown]]> = [];

function respond(url: string, init?: RequestInit) {
  const method = (init?.method || "GET").toUpperCase();
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  calls.push({ url, method, body });
  const hit = routes.find(([re, m]) => m === method && re.test(url));
  const [status, json] = hit ? hit[2](body) : [404, { detail: "not mocked" }];
  return Promise.resolve(new Response(JSON.stringify(json), { status, headers: { "Content-Type": "application/json" } }));
}

const AT = { lat: 14.611406, lng: 121.051762 };

beforeEach(() => {
  calls = [];
  routes = [];
  global.fetch = vi.fn((u: string | URL | Request, i?: RequestInit) => respond(String(u), i)) as unknown as typeof fetch;
  Object.defineProperty(global.navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: AT.lat, longitude: AT.lng } }) },
  });
});
afterEach(() => vi.clearAllMocks());

const uniform = {
  id: "i1", case_id: "c1", item_key: "UNIFORM", label: "Uniforms returned", where: "kitchen", kind: "return",
  status: "pending", qty_issued: 3, qty_returned: null, unreturned: 0, notes: "", signed_by: "", signed_as: "",
  signed_at: null, sign_place: "",
};

describe("Leaver Returns (kitchen)", () => {
  it("records the counts with the device's location", async () => {
    const kase = { id: "c1", employee_name: "Jose Mari A. Dejecacion", department: "CK", position: "Cook",
      last_working_day: "2026-11-15", pending: 1, items: [uniform] };
    routes.push([/\/api\/store\/clearance-returns(\?|$)/, "GET", () => [200, { city: "manila", cases: [kase] }]]);
    routes.push([/\/api\/store\/clearance-returns\/c1\/UNIFORM$/, "POST", () => [200, { cases: [{ ...kase, pending: 0,
      items: [{ ...uniform, status: "done", qty_returned: 3, signed_by: "Hidenobu Yuzawa", sign_place: "Central Kitchen" }] }] }]]);
    const { default: Page } = await import("@/app/store/clearance-returns/page");
    render(<Page />);
    expect(await screen.findByText("Jose Mari A. Dejecacion")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Uniforms returned returned"), { target: { value: "3" } });
    fireEvent.click(screen.getByText("Record"));
    await screen.findByText(/3 of 3 returned · Hidenobu Yuzawa · Central Kitchen/);
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.body).toMatchObject({ qty_issued: "3", qty_returned: "3", ...AT });
  });

  it("shows the server's reason when it refuses", async () => {
    const kase = { id: "c1", employee_name: "A Leaver", department: "", position: "", last_working_day: null,
      pending: 1, items: [uniform] };
    routes.push([/\/api\/store\/clearance-returns(\?|$)/, "GET", () => [200, { city: "manila", cases: [kase] }]]);
    routes.push([/UNIFORM$/, "POST", () => [400, { detail: "This can only be signed at a kitchen or the office. You are 9,800 m from Central Kitchen." }]]);
    const { default: Page } = await import("@/app/store/clearance-returns/page");
    render(<Page />);
    await screen.findByText("A Leaver");
    fireEvent.change(screen.getByLabelText("Uniforms returned returned"), { target: { value: "3" } });
    fireEvent.click(screen.getByText("Record"));
    expect(await screen.findByText(/You are 9,800 m from Central Kitchen/)).toBeTruthy();
  });
});

const CASE = { id: "c9", city: "manila", employee_name: "Jose Mari A. Dejecacion", staff_name: "Jose Mari A. Dejecacion",
  current_stage: 0, status: "active", separation_type: "resignation" };

function itemsResponse(mySteps: string[]) {
  return {
    items: [
      { ...uniform, case_id: "c9", status: "done", qty_returned: 2, unreturned: 1, deduction: 0,
        deduction_note: "Not returned. Not deducted: no signed deduction authorization.", signed_by: "Hidenobu Yuzawa",
        sign_place: "Central Kitchen" },
      { id: "e1", case_id: "c9", item_key: "EXIT_INTERVIEW", label: "Exit interview (reason for leaving)", where: "office",
        kind: "task", status: "pending", qty_issued: null, qty_returned: null, unreturned: 0, notes: "", signed_by: "",
        signed_as: "", signed_at: null, sign_place: "" },
    ],
    missing: ["Exit interview (reason for leaving)"],
    complete: false,
    consent: null,
    property_deduction: 0,
    currency: "PHP",
    exit_reasons: ["Studies", "Other"],
    office_location_checked: true,
    approval: { flow: ["hr", "payroll", "hq"], next_step: "hr", next_label: "HR", next_names: ["Peter Villafuerte"], my_steps: mySteps },
  };
}

describe("Clearance items on the HR Clearance page", () => {
  it("says what is left, whose approval is next, and gives non-HR no Sign", async () => {
    routes.push([/\/items$/, "GET", () => [200, itemsResponse([])]]);
    const { ClearanceItemsSection } = await import("@/app/admin/hr/clearance/ClearanceItems");
    render(<ClearanceItemsSection c={CASE} onCaseChanged={() => {}} />);
    expect(await screen.findByText(/1 to sign before HR can approve: Exit interview/)).toBeTruthy();
    expect(screen.getByText(/no signed deduction authorization/i, { selector: "p.text-xs.text-amber-300" })).toBeTruthy();
    expect(screen.getByTestId("next-approval").textContent).toMatch(/HR → Payroll → HQ.*next: HR \(Peter Villafuerte\).*not you/);
    expect(screen.queryByText("Sign")).toBeNull();
  });

  it("HR signs the exit interview with the reason, notes and location", async () => {
    routes.push([/\/items$/, "GET", () => [200, itemsResponse(["hr"])]]);
    routes.push([/\/items\/EXIT_INTERVIEW$/, "POST", () => [200, { ...itemsResponse(["hr"]), missing: [], complete: true }]]);
    const changed = vi.fn();
    const { ClearanceItemsSection } = await import("@/app/admin/hr/clearance/ClearanceItems");
    render(<ClearanceItemsSection c={CASE} onCaseChanged={changed} />);
    await screen.findByText(/1 to sign/);
    fireEvent.click(screen.getByText("Sign"));
    fireEvent.change(screen.getByLabelText("Reason for leaving"), { target: { value: "Studies" } });
    fireEvent.change(screen.getByLabelText("Exit interview (reason for leaving) notes"), { target: { value: "Back to college in January." } });
    fireEvent.click(screen.getAllByText("Sign").at(-1)!);
    await waitFor(() => expect(changed).toHaveBeenCalled());
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toMatch(/\/api\/admin\/hr\/clearance\/c9\/items\/EXIT_INTERVIEW$/);
    expect(post.body).toMatchObject({ reason: "Studies", notes: "Back to college in January.", ...AT });
  });
});

describe("Property deduction authorization at onboarding", () => {
  const item = { id: "p1", item_label: "Property Deduction Authorization (signed by employee)",
    status: "pending", notes: "", verified_by: "" };

  it("has no tick or N/A; the employee reads, types their name and signs", async () => {
    routes.push([/property-consent$/, "GET", () => [200, { text: "AUTHORIZATION TO DEDUCT ... PHP 500.00 per piece", staff_name: "New Hire" }]]);
    routes.push([/property-consent$/, "POST", () => [200, { ok: true, signed: { witnessed_by: "Peter Villafuerte" } }]]);
    const updated = vi.fn();
    const { default: ConsentRow } = await import("@/app/admin/hr/onboarding/ConsentRow");
    render(<ConsentRow onboardingId="ob1" item={item} onUpdated={updated} />);
    expect(screen.queryByText(/Mark verified/)).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    fireEvent.click(screen.getByText("Employee signs"));
    expect(await screen.findByText(/PHP 500.00 per piece/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Employee full name"), { target: { value: "New Hire" } });
    fireEvent.click(screen.getByText("sign-here"));
    fireEvent.click(screen.getByText("Save signed authorization"));
    await waitFor(() => expect(updated).toHaveBeenCalledWith(expect.objectContaining({ status: "verified", verified_by: "Peter Villafuerte" })));
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toMatch(/\/api\/admin\/hr\/onboarding\/ob1\/property-consent$/);
    expect(calls[0].url).toMatch(/onboarding\/ob1\/property-consent$/);
    expect(post.body).toEqual({ typed_name: "New Hire", signature: "data:image/png;base64,SIGNED" });
  });
});
