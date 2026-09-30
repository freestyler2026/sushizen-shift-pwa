/**
 * The warning on /admin/payroll/dubai for somebody being paid a whole cycle
 * they were not employed for.
 *
 * The Dubai engine does not produce basic pay, so a mid-cycle joiner is paid
 * the full monthly package unless a person enters a partial_month line. Twice
 * that has been caught by whoever was reading the payslips, the second time
 * with AED 4,278.71 about to go out. This block is what says so before the
 * money moves, so what it must never do is fail to appear, and what it must
 * never do more is take the page down with it.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { setAdminAuth } from "../setup";
import { buildFetchMock } from "../helpers/fetch-mock";

const CYCLES = "/api/admin/payroll/cycles";
const PERIODS = "/api/admin/dubai-payroll/periods";
const GAPS = "/api/admin/dubai-payroll/proration-gaps";

const SEPTEMBER = {
  id: 41, city: "dubai", year: 2026, month: 9, status: "open",
  closed_at: null, created_at: "2026-09-01T00:00:00Z",
  period_start: "2026-08-26", period_end: "2026-09-25",
  hourly_period_start: "2026-09-01", hourly_period_end: "2026-09-25",
};

/** Paid, but has been settled. Nothing can be done, so nothing is shown. */
const CLOSED = { ...SEPTEMBER, id: 38, month: 8, status: "closed" };

/** The real 2026-09 finding, as the production endpoint returns it. */
const GAPS_BODY = {
  ok: true, cycle_id: 41, examined: 64, population: "payroll run",
  period_start: "2026-08-26", period_end: "2026-09-25",
  already_prorated_count: 4,
  no_hire_date: ["Ayako Nishimura", "Yuri Yamada"],
  leavers_note: "Joiners only. Dubai has nowhere to record a last working day, "
    + "so someone who left mid-cycle still has to be spotted by eye.",
  total_suggested: 4038.71,
  rows: [
    {
      staff_name: "Jeffril Marcos Vergara", branch_code: "JLT",
      hired_at: "2026-09-24", period_start: "2026-08-26", period_end: "2026-09-25",
      period_days: 31, employed_days: 2, unworked_days: 29,
      pay_basis: "monthly package", base_amount: 3800, suggested_deduction: 3554.84,
      net_pay_now: 3802.98, already_prorated: false,
    },
    {
      staff_name: "Sanjeev Tamang", branch_code: "AB",
      hired_at: "2026-09-01", period_start: "2026-08-26", period_end: "2026-09-25",
      period_days: 31, employed_days: 25, unworked_days: 6,
      pay_basis: "monthly package", base_amount: 2500, suggested_deduction: 483.87,
      net_pay_now: 2628.21, already_prorated: false,
    },
  ],
};

function mount(cycles: unknown[], gaps: unknown = GAPS_BODY) {
  vi.stubGlobal("fetch", buildFetchMock([
    { match: GAPS, body: gaps },        // before CYCLES: both contain "payroll"
    { match: CYCLES, body: { cycles } },
    { match: PERIODS, body: { periods: [] } },
  ]));
  return import("../../src/app/admin/payroll/dubai/page");
}

describe("Dubai payroll — paid for days before they joined", () => {
  beforeEach(() => setAdminAuth("dubai"));

  it("names the people and what each one is carrying", async () => {
    const { default: Page } = await mount([SEPTEMBER]);
    render(<Page />);
    await waitFor(() => {
      expect(screen.getByText(/2 people are being paid for days before they joined/)).toBeTruthy();
    });
    expect(screen.getByText("Jeffril Marcos Vergara")).toBeTruthy();
    expect(screen.getByText("Sanjeev Tamang")).toBeTruthy();
    // The deduction, not just "check this person" — a row nobody can act on
    // from the row itself becomes a second job in another screen.
    expect(screen.getByText("−3,554.84")).toBeTruthy();
    expect(screen.getByText("−483.87")).toBeTruthy();
    expect(screen.getByText(/AED 4,038.71/)).toBeTruthy();
  });

  it("shows the arithmetic, so the figure can be disagreed with", async () => {
    const { default: Page } = await mount([SEPTEMBER]);
    render(<Page />);
    await waitFor(() => {
      expect(screen.getByText(/AED 3,800.00 × 29\/31/)).toBeTruthy();
    });
    expect(screen.getByText(/employed 2 of 31 days/)).toBeTruthy();
  });

  it("says nothing has been written, because nothing has", async () => {
    // The endpoint is read-only. If this text goes, somebody will assume the
    // deduction is already in and skip entering it.
    const { default: Page } = await mount([SEPTEMBER]);
    render(<Page />);
    await waitFor(() => {
      expect(screen.getByText(/Nothing here has been written/)).toBeTruthy();
    });
  });

  it("says once — not per cycle — what the check cannot see", async () => {
    const { default: Page } = await mount([SEPTEMBER, { ...SEPTEMBER, id: 43, month: 10 }]);
    render(<Page />);
    await waitFor(() => {
      expect(screen.getAllByText(/Joiners only/)).toHaveLength(1);
    });
  });

  it("leaves a closed cycle alone", async () => {
    // It has been paid. A finding there is a report, not an action, and it
    // would sit on the screen for good.
    const { default: Page } = await mount([CLOSED]);
    render(<Page />);
    await waitFor(() => expect(screen.getByText(/ID #38/)).toBeTruthy());
    expect(screen.queryByText(/being paid for days before they joined/)).toBeNull();
  });

  it("an empty result says how many were checked, not nothing at all", async () => {
    // "No warning" and "the check did not run" must not look the same.
    const { default: Page } = await mount([SEPTEMBER], { ...GAPS_BODY, rows: [], total_suggested: 0 });
    render(<Page />);
    await waitFor(() => {
      expect(screen.getByText(/Joining dates checked for 64 on this payroll/)).toBeTruthy();
    });
  });

  it("survives a response that is missing fields", async () => {
    // The page ships separately from the API, so it will meet an older or
    // partial response. Reading .length off an absent array threw inside
    // render and took the whole page — cycles, Auto-Calculate and all — down
    // over a footnote. Caught by the existing cycle-window tests going red.
    const { default: Page } = await mount([SEPTEMBER], { ok: true, examined: 3 });
    render(<Page />);
    await waitFor(() => expect(screen.getByText(/Pays for 2026-08-26/)).toBeTruthy());
    expect(screen.getByText("Auto-Calculate")).toBeTruthy();
  });

  it("shows a dash, not a zero, when the amounts are masked", async () => {
    // Non-HQ readers get null for every money field. Printing 0.00 would say
    // the deduction is nothing, which is the opposite of "you may not see it".
    const masked = {
      ...GAPS_BODY, total_suggested: null,
      rows: [{
        ...GAPS_BODY.rows[0],
        base_amount: null, suggested_deduction: null, net_pay_now: null,
      }],
    };
    const { default: Page } = await mount([SEPTEMBER], masked);
    render(<Page />);
    await waitFor(() => {
      expect(screen.getByText("Jeffril Marcos Vergara")).toBeTruthy();
    });
    expect(screen.getByText("−—")).toBeTruthy();
    expect(screen.queryByText("−0.00")).toBeNull();
  });
});
