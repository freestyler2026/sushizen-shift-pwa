// New-hire follow-up and onboarding settings (2026-11-23).
//
// The HR Manager asked for the new-hire follow-up procedure to be "put in OS".
// It is now HR's own: the checklist and the procedure are edited under
// Onboarding settings, and each new hire's check-ins are recorded against it.
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));
vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ staffName: "Camilla Gadingan", role: "HR_STAFF", city: "manila" }),
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

const TEMPLATE = {
  title: "New Hire Follow-up & Interview Record",
  effective_from: "2026-11-11",
  methods: [{ key: "C", label: "Discord chat only", counts: false }, { key: "P", label: "Phone", counts: true },
    { key: "F", label: "Face-to-face", counts: true }],
  milestones: [{ key: "day1", label: "Day 1", offset_days: 0, suggested_method: "C", focus: "Orientation" },
    { key: "day3", label: "Day 3", offset_days: 2, suggested_method: "P", focus: "Workload" }],
  questions: [{ key: "account", label: "Employee's own account" }],
  ratings: [{ key: "growth", label: "Growth", options: ["Improved", "Stable"] },
    { key: "retention_risk", label: "Retention risk", options: ["Low", "High"] }],
  pic: { label: "Direct PIC consultation", due_offset_days: 14, competency_areas: ["Cold"], questions: [{ key: "station", label: "Station" }] },
  minimums: { phone: 2, face_to_face: 1, pic: 1 },
  rules: ["Chat alone does not count toward the minimums."],
};
const line = (done: number, required: number) => ({ done, required, met: done >= required });
const PLAN = {
  started: true, staff_name: "New Hire", start_date: "2026-11-16", template_version: 1, latest_version: 1,
  template: TEMPLATE, hr_owner: "Camilla Gadingan", direct_pic: "Richard S. Gante", training_buddy: "",
  schedule: [
    { key: "day1", label: "Day 1", focus: "Orientation", suggested_method: "C", planned_date: "2026-11-16", deadline: "2026-11-16",
      state: "overdue", completed: null, attempts: [], records: [] },
    { key: "pic", label: "Direct PIC consultation", focus: "", suggested_method: "", planned_date: "2026-11-30", deadline: "2026-11-30",
      state: "upcoming", completed: null, attempts: [], records: [] },
  ],
  audit: { checkins: line(0, 2), phone: line(0, 2), face_to_face: line(0, 1), pic: line(0, 1), actions: line(0, 0), late_or_missed: ["Day 1"] },
  review: {},
};

describe("Follow-up on the onboarding record", () => {
  it("shows the schedule and audit, and records a check-in with the method and answers", async () => {
    routes.push([/\/followup$/, "GET", () => [200, PLAN]]);
    routes.push([/\/followup\/contacts$/, "POST", () => [200, { ...PLAN, audit: { ...PLAN.audit, checkins: line(1, 2) } }]]);
    const { default: FollowUpSection } = await import("@/app/admin/hr/onboarding/FollowUp");
    render(<FollowUpSection onboardingId="ob1" />);
    expect(await screen.findByText("New Hire Follow-up & Interview Record")).toBeTruthy();
    expect(screen.getByTestId("followup-day1").textContent).toMatch(/Overdue/);
    expect(screen.getByTestId("followup-audit").textContent).toMatch(/Phone calls0 \/ 2 not met/);
    fireEvent.click(screen.getAllByText("Record")[0]);
    expect((screen.getByLabelText("Method") as HTMLSelectElement).value).toBe("C");       // suggested for Day 1
    fireEvent.change(screen.getByLabelText("Method"), { target: { value: "P" } });
    fireEvent.change(screen.getByLabelText("Employee's own account"), { target: { value: "Settling in fine." } });
    fireEvent.change(screen.getByLabelText("Growth"), { target: { value: "Stable" } });
    fireEvent.change(screen.getByLabelText("Retention risk"), { target: { value: "Low" } });
    fireEvent.click(screen.getByText("Save record"));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toMatch(/\/api\/admin\/hr\/onboarding\/ob1\/followup\/contacts$/);
    expect(post.body).toMatchObject({ milestone_key: "day1", method: "P", status: "completed",
      answers: { account: "Settling in fine." }, ratings: { growth: "Stable", retention_risk: "Low" } });
  });

  it("offers Start for a hire from before the procedure", async () => {
    routes.push([/\/followup$/, "GET", () => [200, { started: false, can_start: true, staff_name: "Old Hire" }]]);
    routes.push([/\/followup\/start$/, "POST", () => [200, PLAN]]);
    const { default: FollowUpSection } = await import("@/app/admin/hr/onboarding/FollowUp");
    render(<FollowUpSection onboardingId="ob2" />);
    fireEvent.click(await screen.findByText("Start follow-up"));
    expect(await screen.findByText("New Hire Follow-up & Interview Record")).toBeTruthy();
  });
});

describe("Onboarding settings (kept by HR)", () => {
  it("adds a checklist item, also to new hires in progress", async () => {
    const items = [{ item_key: "UNIFORM", label: "Uniform Size & Issue", category: "contract", city: "all", active: true, locked: true, sort_order: 10, updated_by: "seed" }];
    routes.push([/settings\/items$/, "GET", () => [200, { items, categories: ["contract", "orientation"] }]]);
    routes.push([/settings\/items$/, "POST", (b) => [200, { templates: [...items, { ...items[0], item_key: "LOCKER", label: b.label, locked: false }], added_to_in_progress: 9 }]]);
    const { default: OnboardingSettings } = await import("@/app/admin/hr/onboarding/Settings");
    render(<OnboardingSettings onClose={() => {}} />);
    expect(await screen.findByText("Locked")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("New item name"), { target: { value: "Locker assigned" } });
    fireEvent.change(screen.getByLabelText("New item category"), { target: { value: "orientation" } });
    fireEvent.click(screen.getByText("Add item"));
    expect(await screen.findByText(/9 new hires in progress also got it/)).toBeTruthy();
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.body).toEqual({ label: "Locker assigned", category: "orientation", city: "all", add_to_in_progress: true });
  });

  it("edits the follow-up procedure and saves a new version", async () => {
    routes.push([/settings\/items$/, "GET", () => [200, { items: [], categories: [] }]]);
    routes.push([/settings\/followup\?city=manila$/, "GET", () => [200, { current: { version: 1, template: TEMPLATE, saved_by: "Peter Villafuerte", saved_at: "" }, default: TEMPLATE }]]);
    routes.push([/settings\/followup$/, "PUT", (b) => [200, { current: { version: 2, template: b.template, saved_by: "Camilla Gadingan" } }]]);
    const { default: OnboardingSettings } = await import("@/app/admin/hr/onboarding/Settings");
    render(<OnboardingSettings onClose={() => {}} />);
    fireEvent.click(screen.getByText("Follow-up procedure"));
    expect(await screen.findByText(/Version 1, saved by Peter Villafuerte/)).toBeTruthy();
    fireEvent.click(screen.getByText("+ Add check-in"));
    fireEvent.change(screen.getByLabelText("Check-in 3 name"), { target: { value: "3 months" } });
    fireEvent.change(screen.getByLabelText("Check-in 3 timing"), { target: { value: "months" } });
    fireEvent.change(screen.getByLabelText("Check-in 3 amount"), { target: { value: "3" } });
    fireEvent.click(screen.getByText("Save procedure"));
    expect(await screen.findByText(/Saved as version 2/)).toBeTruthy();
    const put = calls.find((c) => c.method === "PUT")!;
    const ms = (put.body.template as typeof TEMPLATE).milestones;
    expect(ms[2]).toMatchObject({ label: "3 months", offset_months: 3 });
  });
});
