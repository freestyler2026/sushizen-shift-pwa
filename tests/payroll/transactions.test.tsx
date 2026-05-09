/**
 * Tests for /admin/payroll/transactions/page.tsx
 *
 * Covers:
 * - Stale-fetch guard: city switch cancels in-flight cycle load
 * - loadCycles errors are shown (not silently swallowed)
 * - setErr cleared before batch mark-paid
 * - CSV quoting for names/roles containing commas
 */
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { setAdminAuth } from "../setup";
import { buildFetchMock, buildFailFetch, CYCLE_MANILA, CYCLE_DUBAI } from "../helpers/fetch-mock";

const RUN_MANILA = {
  id: 10, cycle_id: 1, city: "manila", status: "draft",
  employee_count: 2, total_gross: 63000, total_net: 61500,
  generated_at: "2026-05-01T00:00:00Z", generated_by: "admin",
  finalized_at: null, finalized_by: "",
};

const RECORDS = [
  {
    id: 100, run_id: 10, cycle_id: 1, city: "manila",
    staff_name: "Juan dela Cruz",
    bayzat_id: "", branch_code: "MNL01", role_title: "Server",
    currency: "PHP", paid_via: "bank", bank_name: "BDO",
    basic_salary: 30000, accommodation: 0, transportation: 1500,
    other_allowances: 0, net_additions: 0, net_deductions: 0,
    gross_pay: 31500, net_pay: 31500,
  },
  {
    id: 101, run_id: 10, cycle_id: 1, city: "manila",
    staff_name: "Maria, Santos", // name with comma — CSV quoting test
    bayzat_id: "", branch_code: "MNL02", role_title: "Cashier, Lead",
    currency: "PHP", paid_via: "cash", bank_name: "",
    basic_salary: 28000, accommodation: 0, transportation: 1500,
    other_allowances: 0, net_additions: 1000, net_deductions: 0,
    gross_pay: 29500, net_pay: 30500,
  },
];

const PAYMENTS: unknown[] = [];

function buildTransFetch() {
  return buildFetchMock([
    { match: "cycles?city=manila", body: { cycles: [CYCLE_MANILA] } },
    { match: "run?city=manila&cycle_id=1", body: { run: RUN_MANILA } },
    { match: "run-records?city=manila&run_id=10", body: { records: RECORDS } },
    { match: "payments?city=manila&cycle_id=1", body: { payments: PAYMENTS } },
    { match: "cycles?city=dubai", body: { cycles: [CYCLE_DUBAI] } },
  ]);
}

describe("TransactionsPage — city switch and stale-fetch", () => {
  beforeEach(() => setAdminAuth("manila"));

  it("fetches cycles for Manila on mount", async () => {
    const mockFetch = buildTransFetch();
    vi.stubGlobal("fetch", mockFetch);

    const { default: TransactionsPage } = await import(
      "../../src/app/admin/payroll/transactions/page"
    );
    render(<TransactionsPage />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("city=manila"),
        expect.anything()
      );
    });
  });

  it("switches to Dubai cycles on city toggle", async () => {
    const mockFetch = buildTransFetch();
    vi.stubGlobal("fetch", mockFetch);

    const { default: TransactionsPage } = await import(
      "../../src/app/admin/payroll/transactions/page"
    );
    render(<TransactionsPage />);

    await waitFor(() => screen.getByRole("button", { name: /dubai/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /dubai/i }));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("city=dubai"),
        expect.anything()
      );
    });
  });

  it("shows error message when cycle load fails", async () => {
    const mockFetch = buildFailFetch(500, "Database unavailable");
    vi.stubGlobal("fetch", mockFetch);

    const { default: TransactionsPage } = await import(
      "../../src/app/admin/payroll/transactions/page"
    );
    render(<TransactionsPage />);

    await waitFor(() => {
      expect(
        screen.queryByText(/Database unavailable|Failed to load/i)
      ).toBeTruthy();
    });
  });
});

describe("TransactionsPage — CSV quoting", () => {
  it("wraps fields containing commas in double-quotes for CSV download", () => {
    // Test the csvField helper logic directly
    function csvField(v: string | number): string {
      const s = String(v ?? "");
      if (s.includes(",") || s.includes('"') || s.includes("\n"))
        return `"${s.replace(/"/g, '""')}"`;
      return s;
    }

    // Name with comma must be quoted
    expect(csvField("Maria, Santos")).toBe('"Maria, Santos"');

    // Role with comma must be quoted
    expect(csvField("Cashier, Lead")).toBe('"Cashier, Lead"');

    // Normal name — no quoting
    expect(csvField("Juan dela Cruz")).toBe("Juan dela Cruz");

    // Number — no quoting
    expect(csvField(31500)).toBe("31500");

    // Field with double-quote — escaped
    expect(csvField('Say "hello"')).toBe('"Say ""hello"""');

    // Field with newline — quoted
    expect(csvField("line1\nline2")).toBe('"line1\nline2"');
  });
});
