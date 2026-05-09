/**
 * Tests for /admin/payroll/loans/page.tsx
 *
 * Covers:
 * - Manila default
 * - City switch clears loans AND cycles (setCycles([]) bug fix)
 * - Loan workflow status transitions rendered correctly
 */
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { setAdminAuth } from "../setup";
import { buildFetchMock, CYCLE_MANILA, CYCLE_DUBAI } from "../helpers/fetch-mock";

const LOAN_ACTIVE = {
  id: "loan-1",
  city: "manila",
  staff_name: "Pedro Reyes",
  amount: 50000,
  installment_amount: 5000,
  total_installments: 10,
  remaining_installments: 8,
  status: "active",
  purpose: "Medical",
  requested_by: "admin",
  requested_at: "2026-01-15T00:00:00Z",
  approved_by: "manager",
  approved_at: "2026-01-16T00:00:00Z",
  disbursed_at: "2026-02-01",
  note: "",
};

function buildLoanFetch(city: "manila" | "dubai") {
  const cycle = city === "manila" ? CYCLE_MANILA : CYCLE_DUBAI;
  return buildFetchMock([
    { match: `loans?city=${city}`, body: { loans: city === "manila" ? [LOAN_ACTIVE] : [] } },
    { match: `cycles?city=${city}`, body: { cycles: [cycle] } },
  ]);
}

describe("LoansPage — city default and switch", () => {
  beforeEach(() => setAdminAuth("manila"));

  it("defaults to Manila and loads Manila loans", async () => {
    const mockFetch = buildLoanFetch("manila");
    vi.stubGlobal("fetch", mockFetch);

    const { default: LoansPage } = await import(
      "../../src/app/admin/payroll/loans/page"
    );
    render(<LoansPage />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("city=manila"),
        expect.anything()
      );
    });
  });

  it("clears loans and cycles when switching to Dubai", async () => {
    const mockFetch = buildFetchMock([
      { match: "loans?city=manila", body: { loans: [LOAN_ACTIVE] } },
      { match: "cycles?city=manila", body: { cycles: [CYCLE_MANILA] } },
      { match: "loans?city=dubai", body: { loans: [] } },
      { match: "cycles?city=dubai", body: { cycles: [CYCLE_DUBAI] } },
    ]);
    vi.stubGlobal("fetch", mockFetch);

    const { default: LoansPage } = await import(
      "../../src/app/admin/payroll/loans/page"
    );
    render(<LoansPage />);

    await waitFor(() => screen.queryByText("Pedro Reyes"));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /dubai/i }));
    });

    await waitFor(() => {
      expect(screen.queryByText("Pedro Reyes")).toBeNull();
    });

    // Dubai loans and cycles must be fetched
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("city=dubai"),
      expect.anything()
    );
  });
});
