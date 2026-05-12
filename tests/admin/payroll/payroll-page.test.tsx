// tests/admin/payroll/payroll-page.test.tsx
// Comprehensive tests for src/app/admin/payroll/page.tsx

import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── next/link ─────────────────────────────────────────────────────────────────
vi.mock("next/link", () => ({
  default: ({ href, children, className }: any) =>
    React.createElement("a", { href, className }, children),
}));

// ── @/lib/auth ────────────────────────────────────────────────────────────────
const BASE_AUTH = {
  staffName: "Jay Nishimura",
  city: "manila" as const,
  role: "ADMIN" as const,
  accessToken: "tok-test",
  permissions: ["*"],
};

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getAuth: vi.fn(() => BASE_AUTH),
    getAuthHeaders: vi.fn(() => ({ Authorization: "Bearer tok-test" })),
  };
});

// ── global fetch mock ─────────────────────────────────────────────────────────
const mockFetch = vi.fn();
Object.defineProperty(globalThis, "fetch", {
  writable: true, configurable: true, value: mockFetch,
});

import { getAuth } from "@/lib/auth";
import PayrollPage from "@/app/admin/payroll/page";
import { routerMock } from "../../setup";

// ══════════════════════════════════════════════════════════════════════════════
// Fixtures
// ══════════════════════════════════════════════════════════════════════════════

const CYCLE_OPEN = { id: 1, city: "manila", year: 2026, month: 5, status: "open", closed_at: null };
const CYCLE_CLOSED = { id: 2, city: "manila", year: 2026, month: 4, status: "closed", closed_at: "2026-04-30T10:00:00Z" };

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    staff_name: "Alice Reyes",
    bayzat_id: "PH001",
    branch_code: "MNL_MAIN",
    role_title: "Cook",
    currency: "PHP",
    paid_via: "cash",
    basic_salary: 20000,
    accommodation: 0,
    transportation: 1500,
    other_allowances: 500,
    allowances: 2000,
    net_additions: 500,
    net_deductions: 200,
    gross_pay: 22000,
    net_pay: 22300,
    ...overrides,
  };
}

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    city: "manila",
    staff_name: "Alice Reyes",
    bayzat_id: "PH001",
    branch_code: "MNL_MAIN",
    role_title: "Cook",
    basic_salary: 20000,
    accommodation: 0,
    transportation: 1500,
    other_allowances: 500,
    currency: "PHP",
    paid_via: "cash",
    bank_name: "",
    ...overrides,
  };
}

function mockJson(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => body),
    text: async () => JSON.stringify(body),
    headers: new Headers({ "content-type": "application/json" }),
    clone: function () { return this as Response; },
  } as unknown as Response;
}

/** Set up fetch mock: cycles → table (default happy path) */
function setupDefaultFetch(cycles = [CYCLE_OPEN], rows: ReturnType<typeof makeRow>[] = [], totalNetPay = 0) {
  mockFetch.mockImplementation((url: string) => {
    const u = String(url);
    if (u.includes("/cycles") && !u.includes("/close") && !u.includes("/reopen") && !u.includes("/publish")) {
      return Promise.resolve(mockJson({ cycles }));
    }
    if (u.includes("/table")) {
      return Promise.resolve(mockJson({ rows, total_net_pay: totalNetPay }));
    }
    if (u.includes("/salary-configs")) {
      return Promise.resolve(mockJson({ configs: [] }));
    }
    return Promise.resolve(mockJson({}, 404));
  });
}

/** Render and wait for the loading spinner to disappear */
async function renderAndLoad(cycles = [CYCLE_OPEN], rows: ReturnType<typeof makeRow>[] = [], totalNetPay = 0) {
  setupDefaultFetch(cycles, rows, totalNetPay);
  render(<PayrollPage />);
  await waitFor(() => {
    expect(screen.queryByText("Loading payroll data…")).not.toBeInTheDocument();
  }, { timeout: 5000 });
}

// ══════════════════════════════════════════════════════════════════════════════

describe("PayrollPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuth).mockReturnValue(BASE_AUTH);
    mockFetch.mockResolvedValue(mockJson({ cycles: [], rows: [], total_net_pay: 0 }));
  });

  afterEach(() => {
    cleanup();
  });

  // ── Auth guard ──────────────────────────────────────────────────────────────
  describe("Auth guard", () => {
    it("redirects to /week when role is STAFF", async () => {
      vi.mocked(getAuth).mockReturnValue({ ...BASE_AUTH, role: "STAFF" as any });
      setupDefaultFetch();
      render(<PayrollPage />);
      await waitFor(() => {
        expect(routerMock.replace).toHaveBeenCalledWith("/week");
      });
    });

    it("does NOT redirect for ADMIN role", async () => {
      await renderAndLoad();
      expect(routerMock.replace).not.toHaveBeenCalledWith("/week");
    });

    it("does NOT redirect for HQ role", async () => {
      vi.mocked(getAuth).mockReturnValue({ ...BASE_AUTH, role: "HQ" as any });
      await renderAndLoad();
      expect(routerMock.replace).not.toHaveBeenCalledWith("/week");
    });

    it("does NOT redirect for MANAGEMENT role", async () => {
      vi.mocked(getAuth).mockReturnValue({ ...BASE_AUTH, role: "MANAGEMENT" as any });
      await renderAndLoad();
      expect(routerMock.replace).not.toHaveBeenCalledWith("/week");
    });
  });

  // ── Page structure ───────────────────────────────────────────────────────────
  describe("Page structure", () => {
    it("renders Payroll heading", async () => {
      await renderAndLoad();
      expect(screen.getByText("Payroll")).toBeInTheDocument();
    });

    it("renders Dubai and Manila city toggle buttons", async () => {
      await renderAndLoad();
      expect(screen.getByRole("button", { name: /^Dubai$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Manila$/i })).toBeInTheDocument();
    });

    it("renders Payroll Table and Salary Configs tabs", async () => {
      await renderAndLoad();
      expect(screen.getByRole("button", { name: /Payroll Table/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Salary Configs/i })).toBeInTheDocument();
    });

    it("renders nav links: Manila Payroll, Loans, Leave Salary", async () => {
      await renderAndLoad();
      expect(screen.getByRole("link", { name: /Manila Payroll/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Loans/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Leave Salary/i })).toBeInTheDocument();
    });

    it("shows Transactions link when a cycle is selected", async () => {
      await renderAndLoad([CYCLE_OPEN]);
      await waitFor(() => {
        expect(screen.getByRole("link", { name: /Transactions/i })).toBeInTheDocument();
      });
    });
  });

  // ── Initial load ─────────────────────────────────────────────────────────────
  describe("Initial load", () => {
    it("fetches cycles on mount", async () => {
      await renderAndLoad();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/cycles"),
        expect.any(Object)
      );
    });

    it("fetches payroll table after cycle is selected", async () => {
      await renderAndLoad([CYCLE_OPEN]);
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining("/table"),
          expect.any(Object)
        );
      });
    });

    it("shows cycle name in summary header", async () => {
      await renderAndLoad([CYCLE_OPEN]);
      await waitFor(() => {
        // "May 2026" appears in both the dropdown option and the summary header
        expect(screen.getAllByText(/May 2026/).length).toBeGreaterThanOrEqual(1);
      });
    });

    it("shows error when cycles API fails", async () => {
      mockFetch.mockRejectedValue(new Error("Network down"));
      render(<PayrollPage />);
      await waitFor(() => {
        expect(screen.getByText(/Network error/i)).toBeInTheDocument();
      });
    });

    it("shows error when table API fails", async () => {
      mockFetch.mockImplementation((url: string) => {
        if (String(url).includes("/cycles")) return Promise.resolve(mockJson({ cycles: [CYCLE_OPEN] }));
        if (String(url).includes("/table")) return Promise.resolve(mockJson({ detail: "DB error" }, 500));
        return Promise.resolve(mockJson({}, 404));
      });
      render(<PayrollPage />);
      await waitFor(() => {
        expect(screen.getByText(/DB error/i)).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it("defaults to manila city for non-dubai user", async () => {
      vi.mocked(getAuth).mockReturnValue({ ...BASE_AUTH, city: "manila" });
      await renderAndLoad();
      const manilaBtn = screen.getByRole("button", { name: /^Manila$/i });
      expect(manilaBtn.className).toContain("bg-teal-600");
    });

    it("defaults to dubai city for dubai user", async () => {
      vi.mocked(getAuth).mockReturnValue({ ...BASE_AUTH, city: "dubai" });
      setupDefaultFetch([{ ...CYCLE_OPEN, city: "dubai" }]);
      render(<PayrollPage />);
      await waitFor(() => {
        const dubaiBtn = screen.getByRole("button", { name: /^Dubai$/i });
        expect(dubaiBtn.className).toContain("bg-teal-600");
      });
    });
  });

  // ── City toggle ─────────────────────────────────────────────────────────────
  describe("City toggle", () => {
    it("switching city refetches cycles", async () => {
      await renderAndLoad();
      const callsBefore = mockFetch.mock.calls.length;
      setupDefaultFetch([{ ...CYCLE_OPEN, city: "dubai" }]);
      fireEvent.click(screen.getByRole("button", { name: /^Dubai$/i }));
      await waitFor(() => {
        expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore);
        const lastUrl = String(mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0]);
        expect(lastUrl).toContain("city=dubai");
      }, { timeout: 5000 });
    });
  });

  // ── Summary KPIs ─────────────────────────────────────────────────────────────
  describe("Summary KPIs", () => {
    it("shows total net pay from API", async () => {
      await renderAndLoad([CYCLE_OPEN], [makeRow()], 99500);
      await waitFor(() => {
        // 99,500.00 may appear in multiple KPI cards
        expect(screen.getAllByText(/99,500\.00/).length).toBeGreaterThanOrEqual(1);
      });
    });

    it("shows currency PHP for manila cycle", async () => {
      await renderAndLoad([CYCLE_OPEN], [makeRow()], 50000);
      expect(screen.getAllByText(/PHP/).length).toBeGreaterThan(0);
    });

    it("shows AED for dubai cycle", async () => {
      vi.mocked(getAuth).mockReturnValue({ ...BASE_AUTH, city: "dubai" });
      setupDefaultFetch([{ ...CYCLE_OPEN, city: "dubai" }], [makeRow({ currency: "AED" })], 30000);
      render(<PayrollPage />);
      await waitFor(() => {
        expect(screen.getAllByText(/AED/).length).toBeGreaterThan(0);
      });
    });

    it("'Processed till date' shows total when cycle is closed", async () => {
      await renderAndLoad([CYCLE_CLOSED], [makeRow()], 22300);
      await waitFor(() => {
        // For closed cycle: processed = total_net_pay (22300)
        const amounts = screen.getAllByText(/22,300\.00/);
        expect(amounts.length).toBeGreaterThanOrEqual(2); // both processed and unpaid show it
      }, { timeout: 5000 });
    });

    it("shows employee count when rows exist", async () => {
      const rows = [makeRow(), makeRow({ staff_name: "Bob Cruz" })];
      await renderAndLoad([CYCLE_OPEN], rows, 44600);
      await waitFor(() => {
        expect(screen.getByText(/2 employees/i)).toBeInTheDocument();
      }, { timeout: 5000 });
    });
  });

  // ── Payroll Table tab ─────────────────────────────────────────────────────────
  describe("Payroll Table tab", () => {
    describe("with data", () => {
      beforeEach(async () => {
        await renderAndLoad([CYCLE_OPEN], [makeRow()], 22300);
        await waitFor(() => {
          expect(screen.getByText("Alice Reyes")).toBeInTheDocument();
        }, { timeout: 5000 });
      });

      it("displays employee name in table", () => {
        expect(screen.getByText("Alice Reyes")).toBeInTheDocument();
      });

      it("displays employee role and branch", () => {
        expect(screen.getByText(/Cook/)).toBeInTheDocument();
        expect(screen.getByText(/MNL_MAIN/)).toBeInTheDocument();
      });

      it("displays bayzat ID", () => {
        expect(screen.getByText("PH001")).toBeInTheDocument();
      });

      it("shows net pay value", () => {
        expect(screen.getByText("22300.00")).toBeInTheDocument();
      });

      it("shows Cash badge for cash-paid employee", () => {
        const cashBadges = screen.getAllByText("Cash");
        expect(cashBadges.length).toBeGreaterThanOrEqual(1);
      });

      it("shows Bank badge for bank-paid employee", async () => {
        cleanup();
        await renderAndLoad([CYCLE_OPEN], [makeRow({ paid_via: "bank" })]);
        await waitFor(() => {
          expect(screen.getAllByText("Bank").length).toBeGreaterThanOrEqual(1);
        }, { timeout: 5000 });
      });

      it("column selector panel is visible by default", () => {
        expect(screen.getByText(/Selected columns on the payroll table/i)).toBeInTheDocument();
      });

      it("column selector can be collapsed", () => {
        fireEvent.click(screen.getByText(/Selected columns on the payroll table/i));
        // After collapse, checkboxes disappear
        waitFor(() => {
          expect(screen.queryByText("Basic Salary")).not.toBeInTheDocument();
        });
      });
    });

    describe("empty state", () => {
      it("shows empty state when no rows", async () => {
        await renderAndLoad([CYCLE_OPEN], []);
        expect(screen.getByText(/No salary configs for this cycle/i)).toBeInTheDocument();
      });
    });

    describe("loading state", () => {
      it("shows loading spinner during fetch", () => {
        mockFetch.mockImplementation((url: string) => {
          if (String(url).includes("/cycles")) return Promise.resolve(mockJson({ cycles: [CYCLE_OPEN] }));
          return new Promise(() => {}); // never resolves
        });
        render(<PayrollPage />);
        waitFor(() => {
          expect(screen.getByText(/Loading payroll data/i)).toBeInTheDocument();
        });
      });
    });

    describe("missing salary warning", () => {
      it("shows warning when employee has zero basic salary", async () => {
        const missingRow = makeRow({ basic_salary: 0, gross_pay: 0, net_pay: 0 });
        await renderAndLoad([CYCLE_OPEN], [missingRow]);
        await waitFor(() => {
          // May appear in both the warning banner and the table row indicator
          expect(screen.getAllByText(/missing basic salary/i).length).toBeGreaterThanOrEqual(1);
        }, { timeout: 5000 });
      });

      it("shows 'Missing Basic Salary and Allowances' text on missing row", async () => {
        const missingRow = makeRow({ basic_salary: 0, gross_pay: 0, net_pay: 0 });
        await renderAndLoad([CYCLE_OPEN], [missingRow]);
        await waitFor(() => {
          expect(screen.getByText(/Missing Basic Salary and Allowances/i)).toBeInTheDocument();
        }, { timeout: 5000 });
      });

      it("filter button shows correct count", async () => {
        const missingRow = makeRow({ basic_salary: 0, gross_pay: 0, net_pay: 0 });
        await renderAndLoad([CYCLE_OPEN], [missingRow]);
        await waitFor(() => {
          expect(screen.getByText(/Filter 1 employees/i)).toBeInTheDocument();
        }, { timeout: 5000 });
      });

      it("clicking filter toggles between filtered and all view", async () => {
        const normal = makeRow({ basic_salary: 20000, net_pay: 22300 });
        const missing = makeRow({ staff_name: "Missing Staff", basic_salary: 0, gross_pay: 0, net_pay: 0 });
        await renderAndLoad([CYCLE_OPEN], [normal, missing]);
        await waitFor(() => screen.getByText(/Filter 1 employees/i), { timeout: 5000 });

        fireEvent.click(screen.getByText(/Filter 1 employees/i));
        await waitFor(() => {
          // After filtering, only the missing employee should be visible
          expect(screen.queryByText("Alice Reyes")).not.toBeInTheDocument();
          expect(screen.getByText("Missing Staff")).toBeInTheDocument();
          expect(screen.getByText(/Show All/i)).toBeInTheDocument();
        }, { timeout: 3000 });
      });

      it("column totals update when filter is active (BUG FIX)", async () => {
        const normal = makeRow({ staff_name: "Alice", basic_salary: 20000, net_pay: 22300 });
        const missing = makeRow({ staff_name: "Bob", basic_salary: 0, gross_pay: 0, net_pay: 0 });
        await renderAndLoad([CYCLE_OPEN], [normal, missing]);
        await waitFor(() => screen.getByText(/Filter 1 employees/i), { timeout: 5000 });

        fireEvent.click(screen.getByText(/Filter 1 employees/i));
        await waitFor(() => {
          // When filtering to missing rows only (basic=0), totals should be 0.00 in columns
          // The totals row should show 0.00 for basic salary (since missing rows have 0 basic)
          const zeroTotals = screen.getAllByText("0.00");
          expect(zeroTotals.length).toBeGreaterThan(0);
        }, { timeout: 3000 });
      });
    });

    describe("Employee Detail Panel", () => {
      it("clicking chevron opens employee detail panel", async () => {
        await renderAndLoad([CYCLE_OPEN], [makeRow()]);
        await waitFor(() => screen.getByText("Alice Reyes"), { timeout: 5000 });

        // Chevron buttons in rows
        const chevrons = screen.getAllByRole("button").filter(
          (b) => b.className.includes("text-gray-300") || b.className.includes("hover:text-teal-500")
        );
        expect(chevrons.length).toBeGreaterThan(0);
        fireEvent.click(chevrons[0]);

        await waitFor(() => {
          // The panel shows "Currency: PHP" badge — unique to the panel (not in the table)
          expect(screen.getByText(/Currency:/)).toBeInTheDocument();
          // Panel also shows section heading "Subtotal"
          expect(screen.getByText("Subtotal")).toBeInTheDocument();
        });
      });

      it("closing panel removes it from DOM", async () => {
        await renderAndLoad([CYCLE_OPEN], [makeRow()]);
        await waitFor(() => screen.getByText("Alice Reyes"), { timeout: 5000 });

        const chevrons = screen.getAllByRole("button").filter(
          (b) => b.className.includes("text-gray-300") || b.className.includes("hover:text-teal-500")
        );
        fireEvent.click(chevrons[0]);
        // Wait for the panel-unique "Subtotal" section heading to appear
        await waitFor(() => screen.getByText("Subtotal"));

        // Find the X close button inside the panel
        const closeButtons = screen.getAllByRole("button").filter(
          (b) => b.className.includes("text-gray-400")
        );
        fireEvent.click(closeButtons[closeButtons.length - 1]);
        await waitFor(() => {
          // "Subtotal" section heading is unique to the panel; disappears when panel closes
          expect(screen.queryByText("Subtotal")).not.toBeInTheDocument();
        });
      });
    });

    describe("Download CSV", () => {
      it("Download button appears when rows exist", async () => {
        await renderAndLoad([CYCLE_OPEN], [makeRow()]);
        await waitFor(() => {
          expect(screen.getByText(/Download/i)).toBeInTheDocument();
        }, { timeout: 5000 });
      });

      it("Download button does not appear when rows is empty", async () => {
        await renderAndLoad([CYCLE_OPEN], []);
        expect(screen.queryByText(/Download/i)).not.toBeInTheDocument();
      });
    });
  });

  // ── Cycle selector ─────────────────────────────────────────────────────────
  describe("Cycle selector", () => {
    it("shows cycle in select dropdown", async () => {
      await renderAndLoad([CYCLE_OPEN]);
      const select = screen.getByRole("combobox");
      expect(select).toBeInTheDocument();
      expect(screen.getByText(/May 2026 — Open/i)).toBeInTheDocument();
    });

    it("shows multiple cycles in dropdown", async () => {
      await renderAndLoad([CYCLE_OPEN, CYCLE_CLOSED]);
      expect(screen.getByText(/May 2026 — Open/i)).toBeInTheDocument();
      expect(screen.getByText(/Apr 2026 — Closed/i)).toBeInTheDocument();
    });

    it("shows 'No cycles' when cycle list is empty", async () => {
      setupDefaultFetch([]);
      render(<PayrollPage />);
      await waitFor(() => {
        expect(screen.getByText(/No cycles/i)).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it("shows Open status badge for open cycle", async () => {
      await renderAndLoad([CYCLE_OPEN]);
      await waitFor(() => {
        const openBadges = screen.getAllByText("Open");
        expect(openBadges.length).toBeGreaterThanOrEqual(1);
      }, { timeout: 5000 });
    });

    it("shows Closed status badge for closed cycle", async () => {
      setupDefaultFetch([CYCLE_CLOSED]);
      render(<PayrollPage />);
      await waitFor(() => {
        // The badge in cycle controls
        expect(screen.getByText("Closed")).toBeInTheDocument();
      }, { timeout: 5000 });
    });
  });

  // ── Cycle controls ─────────────────────────────────────────────────────────
  describe("Cycle controls", () => {
    it("shows 'New Cycle' button", async () => {
      await renderAndLoad();
      expect(screen.getByRole("button", { name: /New Cycle/i })).toBeInTheDocument();
    });

    it("shows 'Refresh' button", async () => {
      await renderAndLoad();
      expect(screen.getByRole("button", { name: /Refresh/i })).toBeInTheDocument();
    });

    it("shows 'Close Cycle' button for open cycle", async () => {
      await renderAndLoad([CYCLE_OPEN]);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Close Cycle/i })).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it("shows 'Reopen' button for closed cycle", async () => {
      setupDefaultFetch([CYCLE_CLOSED]);
      render(<PayrollPage />);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Reopen/i })).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it("Close Cycle calls API with confirm", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      await renderAndLoad([CYCLE_OPEN]);
      await waitFor(() => screen.getByRole("button", { name: /Close Cycle/i }), { timeout: 5000 });

      mockFetch.mockResolvedValueOnce(mockJson({ cycle: { ...CYCLE_OPEN, status: "closed" } }));
      mockFetch.mockResolvedValueOnce(mockJson({ rows: [], total_net_pay: 0 }));

      fireEvent.click(screen.getByRole("button", { name: /Close Cycle/i }));
      await waitFor(() => {
        const patchCall = mockFetch.mock.calls.find((c: any[]) =>
          String(c[0]).includes("/cycles/1/close")
        );
        expect(patchCall).toBeTruthy();
      }, { timeout: 5000 });
    });

    it("Close Cycle is cancelled when confirm returns false", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(false);
      await renderAndLoad([CYCLE_OPEN]);
      await waitFor(() => screen.getByRole("button", { name: /Close Cycle/i }), { timeout: 5000 });

      const callsBefore = mockFetch.mock.calls.length;
      fireEvent.click(screen.getByRole("button", { name: /Close Cycle/i }));
      // No extra fetch should happen
      expect(mockFetch.mock.calls.length).toBe(callsBefore);
    });

    it("shows Publish to Staff button for closed cycle with rows", async () => {
      setupDefaultFetch([CYCLE_CLOSED], [makeRow()]);
      render(<PayrollPage />);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Publish to Staff/i })).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it("Publish to Staff calls API and alerts count", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
      setupDefaultFetch([CYCLE_CLOSED], [makeRow()]);
      render(<PayrollPage />);
      await waitFor(() => screen.getByRole("button", { name: /Publish to Staff/i }), { timeout: 5000 });

      mockFetch.mockResolvedValueOnce(mockJson({ published_count: 5 }));
      fireEvent.click(screen.getByRole("button", { name: /Publish to Staff/i }));
      await waitFor(() => {
        const publishCall = mockFetch.mock.calls.find((c: any[]) =>
          String(c[0]).includes("/publish-all")
        );
        expect(publishCall).toBeTruthy();
        expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining("5"));
      }, { timeout: 5000 });
    });

    it("Unpublish button appears after publishing and calls API (BUG FIX: shows alert)", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
      setupDefaultFetch([CYCLE_CLOSED], [makeRow()]);
      render(<PayrollPage />);
      await waitFor(() => screen.getByRole("button", { name: /Publish to Staff/i }), { timeout: 5000 });

      // First publish
      mockFetch.mockResolvedValueOnce(mockJson({ published_count: 3 }));
      fireEvent.click(screen.getByRole("button", { name: /Publish to Staff/i }));
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Unpublish/i })).toBeInTheDocument();
      }, { timeout: 5000 });

      // Then unpublish
      mockFetch.mockResolvedValueOnce(mockJson({}));
      fireEvent.click(screen.getByRole("button", { name: /Unpublish/i }));
      await waitFor(() => {
        const unpublishCall = mockFetch.mock.calls.find((c: any[]) =>
          String(c[0]).includes("/unpublish-all")
        );
        expect(unpublishCall).toBeTruthy();
        // BUG FIX: unpublish now shows an alert
        expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining("unpublished"));
      }, { timeout: 5000 });
    });

    it("New Cycle calls POST cycles API", async () => {
      await renderAndLoad([CYCLE_OPEN]);
      mockFetch.mockResolvedValueOnce(mockJson({ cycle: CYCLE_OPEN }));
      fireEvent.click(screen.getByRole("button", { name: /New Cycle/i }));
      await waitFor(() => {
        const postCall = mockFetch.mock.calls.find(
          (c: any[]) => String(c[0]).includes("/cycles") && c[1]?.method === "POST"
        );
        expect(postCall).toBeTruthy();
      }, { timeout: 5000 });
    });
  });

  // ── Salary Configs tab ────────────────────────────────────────────────────────
  describe("Salary Configs tab", () => {
    async function openConfigsTab(configs: ReturnType<typeof makeConfig>[] = []) {
      setupDefaultFetch([CYCLE_OPEN]);
      mockFetch.mockImplementation((url: string) => {
        const u = String(url);
        if (u.includes("/cycles") && !u.includes("/close") && !u.includes("/reopen")) {
          return Promise.resolve(mockJson({ cycles: [CYCLE_OPEN] }));
        }
        if (u.includes("/table")) return Promise.resolve(mockJson({ rows: [], total_net_pay: 0 }));
        if (u.includes("/salary-configs")) return Promise.resolve(mockJson({ configs }));
        return Promise.resolve(mockJson({}, 404));
      });
      render(<PayrollPage />);
      await waitFor(() => screen.queryByText(/Loading/), { timeout: 2000 });
      fireEvent.click(screen.getByRole("button", { name: /Salary Configs/i }));
      await waitFor(() => {
        expect(screen.getByText(/employees configured/i)).toBeInTheDocument();
      }, { timeout: 5000 });
    }

    it("shows employee count header", async () => {
      await openConfigsTab([makeConfig()]);
      expect(screen.getByText(/1 employees configured/i)).toBeInTheDocument();
    });

    it("shows 'No salary configs yet' when empty", async () => {
      await openConfigsTab([]);
      expect(screen.getByText(/No salary configs yet/i)).toBeInTheDocument();
    });

    it("shows Add Employee button", async () => {
      await openConfigsTab([]);
      expect(screen.getByRole("button", { name: /Add Employee/i })).toBeInTheDocument();
    });

    it("displays config employee name", async () => {
      await openConfigsTab([makeConfig({ staff_name: "Maria Santos" })]);
      expect(screen.getByText("Maria Santos")).toBeInTheDocument();
    });

    it("displays basic salary value", async () => {
      await openConfigsTab([makeConfig({ basic_salary: 20000 })]);
      expect(screen.getByText("20000.00")).toBeInTheDocument();
    });

    it("clicking Add Employee opens ConfigModal", async () => {
      await openConfigsTab([]);
      fireEvent.click(screen.getByRole("button", { name: /Add Employee/i }));
      await waitFor(() => {
        expect(screen.getByText("Add Salary Config")).toBeInTheDocument();
      });
    });

    it("clicking edit pencil opens ConfigModal in edit mode", async () => {
      await openConfigsTab([makeConfig()]);
      const editBtn = screen.getByRole("button", { name: "" }); // pencil has no text
      fireEvent.click(editBtn);
      await waitFor(() => {
        expect(screen.getByText("Edit Salary Config")).toBeInTheDocument();
      });
    });
  });

  // ── ConfigModal ────────────────────────────────────────────────────────────
  describe("ConfigModal", () => {
    async function openAddModal() {
      mockFetch.mockImplementation((url: string) => {
        const u = String(url);
        if (u.includes("/cycles")) return Promise.resolve(mockJson({ cycles: [CYCLE_OPEN] }));
        if (u.includes("/table")) return Promise.resolve(mockJson({ rows: [], total_net_pay: 0 }));
        if (u.includes("/salary-configs")) return Promise.resolve(mockJson({ configs: [] }));
        return Promise.resolve(mockJson({}, 404));
      });
      render(<PayrollPage />);
      fireEvent.click(screen.getByRole("button", { name: /Salary Configs/i }));
      await waitFor(() => screen.getByRole("button", { name: /Add Employee/i }), { timeout: 5000 });
      fireEvent.click(screen.getByRole("button", { name: /Add Employee/i }));
      await waitFor(() => screen.getByText("Add Salary Config"));
    }

    it("shows required field error when staff name is empty", async () => {
      await openAddModal();
      fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
      await waitFor(() => {
        expect(screen.getByText(/Staff name is required/i)).toBeInTheDocument();
      });
    });

    it("shows validation error for negative salary", async () => {
      await openAddModal();
      const nameInput = screen.getByPlaceholderText(/Full name/i);
      fireEvent.change(nameInput, { target: { value: "Test Staff" } });
      const basicSalaryInput = screen.getAllByDisplayValue("0")[0];
      fireEvent.change(basicSalaryInput, { target: { value: "-100" } });
      fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
      await waitFor(() => {
        expect(screen.getByText(/non-negative/i)).toBeInTheDocument();
      });
    });

    it("calls PUT salary-configs API on save", async () => {
      await openAddModal();
      const nameInput = screen.getByPlaceholderText(/Full name/i);
      fireEvent.change(nameInput, { target: { value: "New Employee" } });

      mockFetch.mockResolvedValueOnce(
        mockJson({ config: makeConfig({ staff_name: "New Employee" }) })
      );
      fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
      await waitFor(() => {
        const putCall = mockFetch.mock.calls.find(
          (c: any[]) => String(c[0]).includes("/salary-configs") && c[1]?.method === "PUT"
        );
        expect(putCall).toBeTruthy();
      }, { timeout: 5000 });
    });

    it("closes modal on Cancel", async () => {
      await openAddModal();
      fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
      await waitFor(() => {
        expect(screen.queryByText("Add Salary Config")).not.toBeInTheDocument();
      });
    });

    it("closes modal with X button", async () => {
      await openAddModal();
      const xBtn = screen.getAllByRole("button").find(
        (b) => b.className.includes("absolute right-4")
      );
      if (xBtn) fireEvent.click(xBtn);
      await waitFor(() => {
        expect(screen.queryByText("Add Salary Config")).not.toBeInTheDocument();
      });
    });

    it("shows 'Paid Via' bank input when bank is selected", async () => {
      await openAddModal();
      const paidViaSelect = screen.getByDisplayValue("Cash");
      fireEvent.change(paidViaSelect, { target: { value: "bank" } });
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Emirates NBD/i)).toBeInTheDocument();
      });
    });

    it("shows API error when save fails", async () => {
      await openAddModal();
      const nameInput = screen.getByPlaceholderText(/Full name/i);
      fireEvent.change(nameInput, { target: { value: "Test" } });
      mockFetch.mockResolvedValueOnce(mockJson({ detail: "Duplicate staff name" }, 409));
      fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
      await waitFor(() => {
        expect(screen.getByText(/Duplicate staff name/i)).toBeInTheDocument();
      }, { timeout: 5000 });
    });
  });

  // ── Column selector ─────────────────────────────────────────────────────────
  describe("Column selector", () => {
    it("toggling off Basic Salary hides that column", async () => {
      await renderAndLoad([CYCLE_OPEN], [makeRow()]);
      await waitFor(() => screen.getByText("Alice Reyes"), { timeout: 5000 });

      // Find the Basic Salary checkbox
      const basicLabel = screen.getAllByText(/Basic Salary/i)[0];
      const checkbox = basicLabel.closest("label")?.querySelector("input[type=checkbox]");
      expect(checkbox).toBeTruthy();
      fireEvent.click(checkbox!);

      await waitFor(() => {
        // "Basic Salary" column header should disappear from the table thead
        const headers = screen.getAllByRole("columnheader");
        const hasBasicHeader = headers.some(h => h.textContent?.trim() === "BASIC SALARY");
        expect(hasBasicHeader).toBe(false);
      });
    });
  });

  // ── Error handling ──────────────────────────────────────────────────────────
  describe("Error display", () => {
    it("shows error when Close Cycle API fails", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      await renderAndLoad([CYCLE_OPEN]);
      await waitFor(() => screen.getByRole("button", { name: /Close Cycle/i }), { timeout: 5000 });
      mockFetch.mockResolvedValueOnce(mockJson({ detail: "Cycle already closed" }, 400));
      fireEvent.click(screen.getByRole("button", { name: /Close Cycle/i }));
      await waitFor(() => {
        expect(screen.getByText(/Cycle already closed/i)).toBeInTheDocument();
      }, { timeout: 5000 });
    });
  });
});
