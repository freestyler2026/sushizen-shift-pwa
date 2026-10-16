// tests/payroll/allowances-unsynced.test.tsx
//
// Marithel, 2026-10-16: Abegail worked 13 days in Cutoff 2 and was paid for 9.
// The 4 missing days were 10/11-10/15, which were not in the DTR yet. The page
// now says so and offers to sync them.
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/auth", () => ({
  getAuthHeaders: () => ({}),
  getUploadHeaders: () => ({}),
  getAuth: () => ({ staffName: "Yukihiro Nishimura", role: "HQ", city: "manila" }),
}));

const ITEM = {
  id: 1, staff_name: "Abegail A. Dalida", rules_version: "v2",
  cutoff1_start: "2026-09-16", cutoff1_end: "2026-09-30", cutoff1_working_days: 12, cutoff1_late_count: 3,
  cutoff1_late_minutes: 27, cutoff1_awol_days: 1, cutoff1_rejected_requests: 0, cutoff1_flag_no_notice: false,
  cutoff1_eligible: true, cutoff1_disqualify_reasons: "", cutoff1_amount: 600, cutoff1_short_days: 0,
  cutoff2_start: "2026-10-01", cutoff2_end: "2026-10-15", cutoff2_working_days: 9, cutoff2_late_count: 4,
  cutoff2_late_minutes: 58, cutoff2_awol_days: 0, cutoff2_rejected_requests: 0, cutoff2_flag_no_notice: false,
  cutoff2_eligible: true, cutoff2_disqualify_reasons: "", cutoff2_amount: 450, cutoff2_short_days: 0,
  pa_late_count: 7, pa_late_minutes: 85, pa_awol_days: 1, pa_eligible: false, pa_disqualify_reasons: "Absent 1d", pa_amount: 0,
  total_amount: 1050, computed_at: "2026-10-16T03:32:00Z", computed_by: "x", payout_month: "2026-10",
};
const empty = { days: 0, staff: 0, date_from: null, date_to: null, by_staff: {} };
const calls: string[] = [];
global.fetch = vi.fn((url: string, init?: RequestInit) => {
  const u = String(url);
  calls.push(`${init?.method || "GET"} ${u} ${init?.body || ""}`);
  const body = u.includes("/allowances?month")
    ? { items: [ITEM], cutoff1: { start: "2026-09-16", end: "2026-09-30" }, cutoff2: { start: "2026-10-01", end: "2026-10-15" },
        unsynced: { cutoff1: empty, cutoff2: { days: 264, staff: 66, date_from: "2026-10-11", date_to: "2026-10-15", by_staff: { "Abegail A. Dalida": 4 } } } }
    : u.includes("/allowances/compute") ? { staff_count: 81, cutoff1: "a", cutoff2: "b", removed_stale: [] }
    : { synced: 294 };
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
}) as unknown as typeof fetch;

import Page from "@/app/admin/payroll/manila/allowances/page";

describe("Allowances — days not in the DTR yet", () => {
  it("says which days are missing and syncs them before recomputing", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Page />);
    expect(await screen.findByText(/not in the DTR yet, so they are not counted/)).toBeTruthy();
    expect(screen.getByText(/264 days from 66 staff/)).toBeTruthy();
    fireEvent.click(screen.getByText("Abegail A. Dalida"));
    expect(await screen.findByText(/4 more not in the DTR yet/)).toBeTruthy();
    fireEvent.click(screen.getByText("Sync these days and recompute"));
    await waitFor(() => expect(calls.some(c => c.includes("/allowances/compute"))).toBe(true));
    const sync = calls.findIndex(c => c.includes("/sync-dtr-os"));
    const comp = calls.findIndex(c => c.includes("/allowances/compute"));
    expect(sync).toBeGreaterThan(-1);
    expect(calls[sync]).toContain('"date_from":"2026-10-11"');
    expect(calls[sync]).toContain('"date_to":"2026-10-15"');
    expect(sync).toBeLessThan(comp);
  });
});
