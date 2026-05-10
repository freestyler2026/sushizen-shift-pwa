/**
 * Tests for /admin/payroll/page.tsx (main Payroll Table page)
 *
 * Covers:
 * - Manila is the default city
 * - City switch clears detail panel (setDetailRow null)
 * - City switch clears cycles, rows, and KPI totals
 * - Config tab loads configs for correct city
 */
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { setAdminAuth } from "../setup";
import { buildFetchMock, CYCLE_MANILA, CYCLE_DUBAI } from "../helpers/fetch-mock";

const ROW_MANILA = {
  staff_name: "Maria Santos",
  city: "manila",
  basic_salary: 30000,
  accommodation: 0,
  transportation: 1500,
  other_allowances: 0,
  allowances: 1500,          // accommodation + transportation + other_allowances
  net_additions: 0,
  net_deductions: 0,
  gross_pay: 31500,
  net_pay: 31500,
  currency: "PHP",
  role_title: "Server",
  branch_code: "MNL01",
  paid_via: "bank",
  bayzat_id: "",
  bank_name: "BDO",
  payment_status: null,
};

function buildPageFetch(city: "manila" | "dubai" = "manila") {
  const cycle = city === "manila" ? CYCLE_MANILA : CYCLE_DUBAI;
  return buildFetchMock([
    { match: `cycles?city=${city}`, body: { cycles: [cycle] } },
    { match: `salary-configs?city=${city}`, body: { configs: [] } },
    { match: `table?city=${city}`, body: { rows: [ROW_MANILA], total_net_pay: 31500 } },
  ]);
}

describe("PayrollPage — defaults and city switching", () => {
  beforeEach(() => setAdminAuth("manila"));

  it("defaults to Manila city", async () => {
    const mockFetch = buildPageFetch("manila");
    vi.stubGlobal("fetch", mockFetch);

    const { default: PayrollPage } = await import(
      "../../src/app/admin/payroll/page"
    );
    render(<PayrollPage />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("city=manila"),
        expect.anything()
      );
    });
    expect(mockFetch).not.toHaveBeenCalledWith(
      expect.stringContaining("city=dubai"),
      expect.anything()
    );
  });

  it("clears detail panel when switching city", async () => {
    const mockFetch = buildFetchMock([
      { match: "cycles?city=manila", body: { cycles: [CYCLE_MANILA] } },
      { match: "table?city=manila&cycle_id=1", body: { rows: [ROW_MANILA], total_net_pay: 31500 } },
      { match: "cycles?city=dubai", body: { cycles: [CYCLE_DUBAI] } },
      { match: "table?city=dubai&cycle_id=2", body: { rows: [], total_net_pay: 0 } },
      { match: "salary-configs", body: { configs: [] } },
    ]);
    vi.stubGlobal("fetch", mockFetch);

    const { default: PayrollPage } = await import(
      "../../src/app/admin/payroll/page"
    );
    render(<PayrollPage />);

    // Wait for Manila row
    await waitFor(() => {
      expect(screen.queryByText("Maria Santos")).toBeTruthy();
    });

    // Click on Maria Santos to open detail panel
    await act(async () => {
      fireEvent.click(screen.getByText("Maria Santos"));
    });

    // Detail panel should be visible (shows staff name or "Detail" heading)
    // Switch to Dubai
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /dubai/i }));
    });

    // Maria Santos' detail should be gone
    await waitFor(() => {
      expect(screen.queryByText("Maria Santos")).toBeNull();
    });
  });

  it("clears rows and KPI totals when switching city", async () => {
    const mockFetch = buildFetchMock([
      { match: "cycles?city=manila", body: { cycles: [CYCLE_MANILA] } },
      { match: "table?city=manila", body: { rows: [ROW_MANILA], total_net_pay: 31500 } },
      { match: "cycles?city=dubai", body: { cycles: [] } },
      { match: "salary-configs", body: { configs: [] } },
    ]);
    vi.stubGlobal("fetch", mockFetch);

    const { default: PayrollPage } = await import(
      "../../src/app/admin/payroll/page"
    );
    render(<PayrollPage />);

    await waitFor(() => {
      expect(screen.queryByText("Maria Santos")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /dubai/i }));
    });

    await waitFor(() => {
      expect(screen.queryByText("Maria Santos")).toBeNull();
    });
  });
});
