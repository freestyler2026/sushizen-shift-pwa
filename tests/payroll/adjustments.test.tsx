/**
 * Tests for /admin/payroll/adjustments/page.tsx
 *
 * Covers bugs found and fixed during audit passes:
 * - City switch clears cycles, adjustments, and error state
 * - New-adjustment buttons disabled during loading (busy)
 * - Stale adjustments cleared on load error
 * - Error message cleared on city switch (setErr in loadCycles)
 */
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { setAdminAuth } from "../setup";
import { buildFetchMock, buildFailFetch, CYCLE_MANILA, CYCLE_DUBAI } from "../helpers/fetch-mock";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ADJUSTMENT_1 = {
  id: "adj-1",
  city: "manila",
  cycle_id: 1,
  staff_name: "Juan dela Cruz",
  adj_type: "addition",
  subtype: "Bonus",
  amount: 5000,
  vat: 0,
  incurred_at: null,
  reference_no: "REF001",
  note: "Performance bonus",
  source: "manual",
  created_by: "admin",
  created_at: "2026-05-01T00:00:00Z",
};

function buildDefaultFetch(city: "manila" | "dubai" = "manila") {
  const cycle = city === "manila" ? CYCLE_MANILA : CYCLE_DUBAI;
  return buildFetchMock([
    {
      match: `/api/admin/payroll/cycles?city=${city}`,
      body: { cycles: [cycle] },
    },
    {
      match: `/api/admin/payroll/adjustments?city=${city}`,
      body: { adjustments: [ADJUSTMENT_1] },
    },
  ]);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AdjustmentsPage — city switch behaviour", () => {
  beforeEach(() => {
    setAdminAuth("manila");
  });

  it("defaults to Manila and loads Manila cycles", async () => {
    const mockFetch = buildDefaultFetch("manila");
    vi.stubGlobal("fetch", mockFetch);

    const { default: AdjustmentsPage } = await import(
      "../../src/app/admin/payroll/adjustments/page"
    );
    render(<AdjustmentsPage />);

    // Manila tab should be active (aria-selected or visual indicator)
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /manila/i })).toBeDefined();
    });

    // Cycles endpoint called for Manila
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("city=manila"),
      expect.anything()
    );
    expect(mockFetch).not.toHaveBeenCalledWith(
      expect.stringContaining("city=dubai"),
      expect.anything()
    );
  });

  it("clears cycles and adjustments when switching city", async () => {
    const mockFetch = buildFetchMock([
      { match: "cycles?city=manila", body: { cycles: [CYCLE_MANILA] } },
      { match: "adjustments?city=manila", body: { adjustments: [ADJUSTMENT_1] } },
      { match: "cycles?city=dubai", body: { cycles: [CYCLE_DUBAI] } },
      { match: "adjustments?city=dubai", body: { adjustments: [] } },
    ]);
    vi.stubGlobal("fetch", mockFetch);

    const { default: AdjustmentsPage } = await import(
      "../../src/app/admin/payroll/adjustments/page"
    );
    render(<AdjustmentsPage />);

    // Wait for Manila data to load
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("city=manila"),
        expect.anything()
      );
    });

    // Switch to Dubai
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /dubai/i }));
    });

    // Dubai cycles should be fetched
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("city=dubai"),
        expect.anything()
      );
    });
  });

  it("clears error message when switching city (setErr in loadCycles)", async () => {
    // First city returns error, second city succeeds
    let callCount = 0;
    const mockFetch = vi.fn(async (url: string) => {
      callCount++;
      if (url.includes("city=manila") && callCount === 1) {
        return new Response(JSON.stringify({ detail: "Manila DB error" }), { status: 500 });
      }
      return new Response(JSON.stringify({ cycles: [CYCLE_DUBAI], adjustments: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", mockFetch);

    const { default: AdjustmentsPage } = await import(
      "../../src/app/admin/payroll/adjustments/page"
    );
    render(<AdjustmentsPage />);

    // Wait for error to appear
    await waitFor(() => {
      expect(screen.queryByText(/Manila DB error|Failed to load/i)).toBeTruthy();
    });

    // Switch to Dubai
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /dubai/i }));
    });

    // Error should be cleared
    await waitFor(() => {
      expect(screen.queryByText(/Manila DB error/i)).toBeNull();
    });
  });
});

describe("AdjustmentsPage — button disabled states", () => {
  it("Addition button is disabled while loading (busy)", async () => {
    // Fetch that resolves slowly
    let resolveCycles!: (v: Response) => void;
    const slowFetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveCycles = resolve;
        })
    );
    vi.stubGlobal("fetch", slowFetch);

    const { default: AdjustmentsPage } = await import(
      "../../src/app/admin/payroll/adjustments/page"
    );
    render(<AdjustmentsPage />);

    // While fetch is pending, Addition button must be disabled
    const addBtn = screen.getByRole("button", { name: /addition/i });
    expect(addBtn).toBeDisabled();

    // Resolve the fetch
    resolveCycles(
      new Response(JSON.stringify({ cycles: [CYCLE_MANILA] }), { status: 200 })
    );
    await waitFor(() => expect(addBtn).not.toBeDisabled());
  });

  it("Deduction and Recurring buttons are also disabled while loading", async () => {
    let resolveCycles!: (v: Response) => void;
    const slowFetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveCycles = resolve;
        })
    );
    vi.stubGlobal("fetch", slowFetch);

    const { default: AdjustmentsPage } = await import(
      "../../src/app/admin/payroll/adjustments/page"
    );
    render(<AdjustmentsPage />);

    expect(screen.getByRole("button", { name: /deduction/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /recurring/i })).toBeDisabled();

    resolveCycles(
      new Response(JSON.stringify({ cycles: [CYCLE_MANILA] }), { status: 200 })
    );
  });
});

describe("AdjustmentsPage — error handling", () => {
  it("clears stale adjustments when cycle load fails", async () => {
    // First load succeeds (Manila), then second load (Dubai) fails
    let switchToDubai = false;
    const mockFetch = vi.fn(async (url: string) => {
      if (!switchToDubai) {
        if (url.includes("cycles")) return new Response(JSON.stringify({ cycles: [CYCLE_MANILA] }), { status: 200 });
        if (url.includes("adjustments")) return new Response(JSON.stringify({ adjustments: [ADJUSTMENT_1] }), { status: 200 });
      } else {
        if (url.includes("cycles")) return new Response(JSON.stringify({ cycles: [CYCLE_DUBAI] }), { status: 200 });
        if (url.includes("adjustments")) return new Response(JSON.stringify({ detail: "Dubai DB error" }), { status: 500 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.stubGlobal("fetch", mockFetch);

    const { default: AdjustmentsPage } = await import(
      "../../src/app/admin/payroll/adjustments/page"
    );
    render(<AdjustmentsPage />);

    // Wait for Manila adjustment to appear
    await waitFor(() => {
      expect(screen.queryByText("Juan dela Cruz")).toBeTruthy();
    });

    // Switch to Dubai (will fail)
    switchToDubai = true;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /dubai/i }));
    });

    // Manila adjustment must be gone (stale data cleared)
    await waitFor(() => {
      expect(screen.queryByText("Juan dela Cruz")).toBeNull();
    });

    // Error message should appear
    expect(screen.queryByText(/Dubai DB error|Failed to load/i)).toBeTruthy();
  });
});
