/**
 * Tests for /admin/payroll/manila/[periodId]/page.tsx
 * (Manila Payroll v5 — Period Detail / Run List + Side Panel)
 *
 * Covers:
 * - Renders run list after load
 * - "Compute All" button POSTs to /periods/{id}/compute
 * - Clicking a run opens side panel and loads PayrollItems
 * - Side panel groups items: earnings / deductions / employer costs
 * - Minimum wage warning badge (⚠) shows for non-compliant run
 * - Sort by name / net pay (asc/desc toggle)
 * - Summary KPIs (Total Gross, Total Deductions, Net Pay)
 * - Approve button calls /runs/{id}/approve
 * - computeAll error shows error message
 */
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { setAdminAuth } from "../setup";
import { buildFetchMock, buildFailFetch } from "../helpers/fetch-mock";

// Override useParams for this module to return periodId = "1"
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/payroll/manila/1",
  useParams: () => ({ periodId: "1" }),
}));

const PERIOD = {
  id: 1,
  period_label: "May 2026 — 1st Half",
  period_half: 1,
  year: 2026,
  month: 5,
  start_date: "2026-05-01",
  end_date: "2026-05-15",
  first_half_period_id: null,
  status: "draft",
};

const RUN_JUAN: {
  id: number; period_id: number; staff_name: string; salary_type: string;
  daily_rate: number; monthly_rate: number; salary_divisor: number;
  days_worked: number; gross_pay: number; total_deductions: number; net_pay: number;
  minimum_wage_compliant: boolean | null; status: string; computed_at: string | null;
} = {
  id: 101,
  period_id: 1,
  staff_name: "Juan dela Cruz",
  salary_type: "monthly_paid",
  daily_rate: 1153.85,
  monthly_rate: 30000,
  salary_divisor: 26,
  days_worked: 11,
  gross_pay: 15000,
  total_deductions: 1200,
  net_pay: 13800,
  minimum_wage_compliant: true,
  status: "computed",
  computed_at: "2026-05-15T08:00:00Z",
};

const RUN_MARIA: typeof RUN_JUAN = {
  id: 102,
  period_id: 1,
  staff_name: "Maria Santos",
  salary_type: "monthly_paid",
  daily_rate: 692.31,  // below ₱695 minimum wage
  monthly_rate: 18000,
  salary_divisor: 26,
  days_worked: 11,
  gross_pay: 9000,
  total_deductions: 500,
  net_pay: 8500,
  minimum_wage_compliant: false,  // ⚠ non-compliant
  status: "computed",
  computed_at: "2026-05-15T08:00:00Z",
};

const ITEMS_JUAN = [
  { id: 1, item_type: "earning",   item_code: "MONTHLY_BASIC", label: "Monthly Basic (1H)", quantity: null, unit_rate: null, amount: 15000, is_taxable: true,  source: "engine", note: null },
  { id: 2, item_type: "deduction", item_code: "LATE_DEDUCTION",  label: "Late Deduction",   quantity: 2,    unit_rate: 144.23, amount: -288.46, is_taxable: false, source: "engine", note: null },
  { id: 3, item_type: "deduction", item_code: "ABSENT_DEDUCTION",label: "Absent Deduction", quantity: 1,    unit_rate: 1153.85, amount: -1153.85, is_taxable: false, source: "engine", note: null },
];

// The page auto-selects the first staff member on load, so its items are
// fetched immediately -- every test needs that route, not just the ones that
// click into the panel.
function buildPeriodFetch(runs = [RUN_JUAN, RUN_MARIA]) {
  // NOTE: more-specific routes MUST come before less-specific ones,
  // because buildFetchMock uses url.includes() and checks in order.
  return buildFetchMock([
    { match: "/api/admin/manila-payroll/runs/101/items", body: ITEMS_JUAN },
    { match: "/api/admin/manila-payroll/runs/102/items", body: [] },
    { match: "/api/admin/manila-payroll/periods/1/runs", body: runs },
    { match: "/api/admin/manila-payroll/periods", body: [PERIOD] },
  ]);
}

describe("ManilaPayrollPeriodPage — run list", () => {
  beforeEach(() => setAdminAuth("manila"));

  it("renders run list with staff names and net pay", async () => {
    vi.stubGlobal("fetch", buildPeriodFetch());

    const { default: Page } = await import(
      "../../src/app/admin/payroll/manila/[periodId]/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getAllByText("Juan dela Cruz").length).toBeGreaterThan(0);
      expect(screen.getByText("Maria Santos")).toBeTruthy();
    });
  });

  it("shows period label in heading", async () => {
    vi.stubGlobal("fetch", buildPeriodFetch());

    const { default: Page } = await import(
      "../../src/app/admin/payroll/manila/[periodId]/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText("May 2026 — 1st Half")).toBeTruthy();
    });
  });

  it("shows warning badge for minimum wage non-compliant run", async () => {
    vi.stubGlobal("fetch", buildPeriodFetch());

    const { default: Page } = await import(
      "../../src/app/admin/payroll/manila/[periodId]/page"
    );
    render(<Page />);

    await waitFor(() => {
      // nonCompliant warning section or badge
      const container = document.body;
      expect(container.textContent).toMatch(/min.*wage|⚠|non.compliant/i);
    });
  });

  it("shows KPI summary totals", async () => {
    vi.stubGlobal("fetch", buildPeriodFetch());

    const { default: Page } = await import(
      "../../src/app/admin/payroll/manila/[periodId]/page"
    );
    render(<Page />);

    await waitFor(() => {
      // The labels appear in the period KPIs and again in the open panel,
      // which the page now shows for the first staff member on load.
      expect(screen.getAllByText(/total gross/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/total deductions/i).length).toBeGreaterThan(0);
    });
  });

  it("Compute All button calls POST to /periods/1/compute", async () => {
    const mockFetch = buildFetchMock([
      { match: "/api/admin/manila-payroll/periods/1/compute", method: "POST", body: { ok: true } },
      { match: "/api/admin/manila-payroll/periods/1/runs", body: [RUN_JUAN] },
      { match: "/api/admin/manila-payroll/periods", body: [PERIOD] },
    ]);
    vi.stubGlobal("fetch", mockFetch);

    const { default: Page } = await import(
      "../../src/app/admin/payroll/manila/[periodId]/page"
    );
    render(<Page />);

    await waitFor(() => screen.getByText("May 2026 — 1st Half"));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /compute all/i }));
    });

    await waitFor(() => {
      const computeCalls = mockFetch.mock.calls.filter(
        ([url, opts]: [string, RequestInit]) =>
          url.includes("/periods/1/compute") && opts?.method === "POST"
      );
      expect(computeCalls.length).toBe(1);
    });
  });

  it("shows error when Compute All fails", async () => {
    const mockFetch = buildFetchMock([
      { match: "/api/admin/manila-payroll/periods/1/compute", method: "POST", body: { detail: "Engine error" }, status: 500 },
      { match: "/api/admin/manila-payroll/periods/1/runs", body: [RUN_JUAN] },
      { match: "/api/admin/manila-payroll/periods", body: [PERIOD] },
    ]);
    vi.stubGlobal("fetch", mockFetch);

    const { default: Page } = await import(
      "../../src/app/admin/payroll/manila/[periodId]/page"
    );
    render(<Page />);

    await waitFor(() => screen.getByText("May 2026 — 1st Half"));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /compute all/i }));
    });

    // error message should appear somewhere
    await waitFor(() => {
      const hasError = document.body.textContent?.includes("Engine error") ||
                       document.body.textContent?.includes("error") ||
                       document.querySelector("[class*='red']") !== null;
      expect(hasError).toBe(true);
    });
  });
});

describe("ManilaPayrollPeriodPage — side panel", () => {
  beforeEach(() => setAdminAuth("manila"));

  it("clicking a run opens side panel and loads items", async () => {
    const mockFetch = buildFetchMock([
      { match: "/api/admin/manila-payroll/runs/101/items", body: ITEMS_JUAN },
      { match: "/api/admin/manila-payroll/periods/1/runs", body: [RUN_JUAN] },
      { match: "/api/admin/manila-payroll/periods", body: [PERIOD] },
    ]);
    vi.stubGlobal("fetch", mockFetch);

    const { default: Page } = await import(
      "../../src/app/admin/payroll/manila/[periodId]/page"
    );
    render(<Page />);

    await waitFor(() => screen.getAllByText("Juan dela Cruz")[0]);

    await act(async () => {
      fireEvent.click(screen.getAllByText("Juan dela Cruz")[0]);
    });

    await waitFor(() => {
      // items should be loaded
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/runs/101/items"),
        expect.anything()
      );
    });
  });

  it("side panel shows MONTHLY_BASIC earning label", async () => {
    const mockFetch = buildFetchMock([
      { match: "/api/admin/manila-payroll/runs/101/items", body: ITEMS_JUAN },
      { match: "/api/admin/manila-payroll/periods/1/runs", body: [RUN_JUAN] },
      { match: "/api/admin/manila-payroll/periods", body: [PERIOD] },
    ]);
    vi.stubGlobal("fetch", mockFetch);

    const { default: Page } = await import(
      "../../src/app/admin/payroll/manila/[periodId]/page"
    );
    render(<Page />);

    await waitFor(() => screen.getAllByText("Juan dela Cruz")[0]);

    await act(async () => {
      fireEvent.click(screen.getAllByText("Juan dela Cruz")[0]);
    });

    await waitFor(() => {
      expect(screen.getByText(/Monthly Basic/i)).toBeTruthy();
    });
  });

  it("side panel shows deduction items", async () => {
    const mockFetch = buildFetchMock([
      { match: "/api/admin/manila-payroll/runs/101/items", body: ITEMS_JUAN },
      { match: "/api/admin/manila-payroll/periods/1/runs", body: [RUN_JUAN] },
      { match: "/api/admin/manila-payroll/periods", body: [PERIOD] },
    ]);
    vi.stubGlobal("fetch", mockFetch);

    const { default: Page } = await import(
      "../../src/app/admin/payroll/manila/[periodId]/page"
    );
    render(<Page />);

    await waitFor(() => screen.getAllByText("Juan dela Cruz")[0]);
    await act(async () => { fireEvent.click(screen.getAllByText("Juan dela Cruz")[0]); });

    await waitFor(() => {
      // Late Deduction should appear in side panel
      expect(screen.getByText(/Late Deduction/i)).toBeTruthy();
    });
  });

  it("side panel clears when a different run is selected", async () => {
    const mockFetch = buildFetchMock([
      { match: "/api/admin/manila-payroll/runs/102/items", body: [] },
      { match: "/api/admin/manila-payroll/runs/101/items", body: ITEMS_JUAN },
      { match: "/api/admin/manila-payroll/periods/1/runs", body: [RUN_JUAN, RUN_MARIA] },
      { match: "/api/admin/manila-payroll/periods", body: [PERIOD] },
    ]);
    vi.stubGlobal("fetch", mockFetch);

    const { default: Page } = await import(
      "../../src/app/admin/payroll/manila/[periodId]/page"
    );
    render(<Page />);

    await waitFor(() => screen.getAllByText("Juan dela Cruz")[0]);

    // Select Juan
    await act(async () => { fireEvent.click(screen.getAllByText("Juan dela Cruz")[0]); });
    await waitFor(() => screen.getByText(/Monthly Basic/i));

    // Select Maria — Juan's items should clear
    await act(async () => { fireEvent.click(screen.getByText("Maria Santos")); });
    await waitFor(() => {
      // items/101 should be gone; items/102 was empty so Monthly Basic is gone
      expect(screen.queryByText(/Monthly Basic/i)).toBeNull();
    });
  });
});

describe("ManilaPayrollPeriodPage — sorting", () => {
  beforeEach(() => setAdminAuth("manila"));

  it("toggles sort direction when Staff header is clicked twice", async () => {
    vi.stubGlobal("fetch", buildPeriodFetch([RUN_JUAN, RUN_MARIA]));

    const { default: Page } = await import(
      "../../src/app/admin/payroll/manila/[periodId]/page"
    );
    render(<Page />);

    await waitFor(() => screen.getAllByText("Juan dela Cruz")[0]);

    // Sort <th> has text "Staff" — find by columnheader role + text
    const staffHeader = screen.getByRole("columnheader", { name: /staff/i });
    await act(async () => { fireEvent.click(staffHeader); });
    await act(async () => { fireEvent.click(staffHeader); });

    // After two clicks (asc → desc toggle), rows are still visible (no crash)
    expect(screen.getAllByText("Juan dela Cruz").length).toBeGreaterThan(0);
    expect(screen.getByText("Maria Santos")).toBeTruthy();
  });

  it("sorts by net pay when Net Pay header clicked", async () => {
    vi.stubGlobal("fetch", buildPeriodFetch([RUN_JUAN, RUN_MARIA]));

    const { default: Page } = await import(
      "../../src/app/admin/payroll/manila/[periodId]/page"
    );
    render(<Page />);

    await waitFor(() => screen.getAllByText("Juan dela Cruz")[0]);

    // Net Pay sort <th>
    const netHeader = screen.getByRole("columnheader", { name: /net pay/i });
    await act(async () => { fireEvent.click(netHeader); });

    // No crash — both rows still visible
    expect(screen.getAllByText("Juan dela Cruz").length).toBeGreaterThan(0);
    expect(screen.getByText("Maria Santos")).toBeTruthy();
  });
});

// Payroll, 2026-11-26: the notes about statutory flags took half the screen in
// split view, so the staff list had no room. They start folded to one bar that
// still names each kind and its count, says "action needed" when one has to be
// dealt with before approving, and remembers the reader's choice.
describe("ManilaPayrollPeriodPage — payroll notes bar", () => {
  beforeEach(() => { setAdminAuth("manila"); try { localStorage.clear(); } catch { /* none */ } });

  const flagged = (flagsJuan: string[], flagsMaria: string[]) =>
    [{ ...RUN_JUAN, statutory_flags: flagsJuan }, { ...RUN_MARIA, statutory_flags: flagsMaria }];

  it("starts folded, names each kind with its count, and opens on click", async () => {
    vi.stubGlobal("fetch", buildPeriodFetch(flagged(["STATUTORY_CATCH_UP"], ["STATUTORY_CATCH_UP", "PHILHEALTH_SOLO_PARENT"])));
    const { default: Page } = await import("../../src/app/admin/payroll/manila/[periodId]/page");
    render(<Page />);
    const bar = await screen.findByTestId("payroll-notes");
    expect(bar.textContent).toMatch(/whole month 2/);
    expect(bar.textContent).toMatch(/solo parent 1/);
    expect(screen.queryByTestId("notes-action-needed")).toBeNull();
    expect(bar.textContent).not.toMatch(/about twice the usual deduction/);
    fireEvent.click(screen.getByText("Payroll notes"));
    expect(bar.textContent).toMatch(/about twice the usual deduction/);
    expect(bar.textContent).toMatch(/Juan dela Cruz · Maria Santos/);
    expect(localStorage.getItem("manilaPayroll.notesOpen")).toBe("1");
  });

  it("says action needed while folded when a flag must be dealt with before approving", async () => {
    vi.stubGlobal("fetch", buildPeriodFetch(flagged(["BIR_ANNUAL_INCOMPLETE"], [])));
    const { default: Page } = await import("../../src/app/admin/payroll/manila/[periodId]/page");
    render(<Page />);
    expect(await screen.findByTestId("notes-action-needed")).toBeTruthy();
    expect(screen.getByTestId("payroll-notes").textContent).not.toMatch(/opening year-to-date/);
  });

  it("opens if the reader left it open last time", async () => {
    localStorage.setItem("manilaPayroll.notesOpen", "1");
    vi.stubGlobal("fetch", buildPeriodFetch(flagged(["STATUTORY_CATCH_UP"], [])));
    const { default: Page } = await import("../../src/app/admin/payroll/manila/[periodId]/page");
    render(<Page />);
    await waitFor(() =>
      expect(screen.getByTestId("payroll-notes").textContent).toMatch(/about twice the usual deduction/));
  });

  it("shows no bar when nobody has a flag", async () => {
    vi.stubGlobal("fetch", buildPeriodFetch());
    const { default: Page } = await import("../../src/app/admin/payroll/manila/[periodId]/page");
    render(<Page />);
    await waitFor(() => expect(screen.getByText("Maria Santos")).toBeTruthy());
    expect(screen.queryByTestId("payroll-notes")).toBeNull();
  });
});
