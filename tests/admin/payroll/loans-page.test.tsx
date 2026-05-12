// tests/admin/payroll/loans-page.test.tsx

import React from "react";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const BASE_AUTH = { staffName: "Jay", city: "manila" as const, role: "ADMIN" as const, accessToken: "tok", permissions: ["*"] };

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getAuth: vi.fn(() => BASE_AUTH), getAuthHeaders: vi.fn(() => ({})) };
});

vi.mock("@/lib/api", () => ({ API_BASE: "" }));

const mockFetch = vi.fn();
Object.defineProperty(globalThis, "fetch", { writable: true, configurable: true, value: mockFetch });

import { getAuth } from "@/lib/auth";
import LoansPage from "@/app/admin/payroll/loans/page";
import { routerMock } from "../../setup";

const CYCLE = { id: 1, city: "manila", year: 2026, month: 5, status: "open" };

function mockJson(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: vi.fn(async () => body), text: async () => "", headers: new Headers(), clone: function () { return this as Response; } } as unknown as Response;
}

function setupFetch(loans: unknown[] = []) {
  mockFetch.mockImplementation((url: string) => {
    const u = String(url);
    if (u.includes("/cycles")) return Promise.resolve(mockJson({ cycles: [CYCLE] }));
    if (u.includes("/loans")) return Promise.resolve(mockJson({ loans }));
    return Promise.resolve(mockJson({}, 404));
  });
}

const LOAN = {
  id: "loan-001",
  city: "manila",
  staff_name: "Alice Santos",
  amount: 10000,
  installment_amount: 1667,
  total_installments: 6,
  remaining_installments: 4,
  status: "active",
  purpose: "Medical",
  requested_by: "Alice",
  requested_at: new Date().toISOString(),
  approved_by: "Jay",
  approved_at: new Date().toISOString(),
  rejected_by: "",
  rejected_at: null,
  rejection_note: "",
  disbursed_by: "Jay",
  disbursed_at: new Date().toISOString(),
  start_cycle_id: 1,
  note: "",
  created_at: new Date().toISOString(),
};

describe("LoansPage", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(getAuth).mockReturnValue(BASE_AUTH); });
  afterEach(() => cleanup());

  it("redirects to / when not authenticated", async () => {
    vi.mocked(getAuth).mockReturnValue(null as any);
    setupFetch();
    render(<LoansPage />);
    await waitFor(() => { expect(routerMock.replace).toHaveBeenCalledWith("/"); });
  });

  it("redirects to /week for non-allowed role", async () => {
    vi.mocked(getAuth).mockReturnValue({ ...BASE_AUTH, role: "STAFF" as any });
    setupFetch();
    render(<LoansPage />);
    await waitFor(() => { expect(routerMock.replace).toHaveBeenCalledWith("/week"); });
  });

  it("renders page title", () => {
    setupFetch();
    render(<LoansPage />);
    expect(screen.getByText(/Employee Loans/i)).toBeInTheDocument();
  });

  it("shows Dubai and Manila toggle buttons", () => {
    setupFetch();
    render(<LoansPage />);
    expect(screen.getByRole("button", { name: /^Dubai$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Manila$/i })).toBeInTheDocument();
  });

  it("shows New Loan button", () => {
    setupFetch();
    render(<LoansPage />);
    expect(screen.getByRole("button", { name: /New Loan/i })).toBeInTheDocument();
  });

  it("fetches cycles and loans on mount", async () => {
    setupFetch();
    render(<LoansPage />);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("/cycles"), expect.any(Object));
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("/loans"), expect.any(Object));
    });
  });

  it("shows empty state when no loans", async () => {
    setupFetch([]);
    render(<LoansPage />);
    await waitFor(() => {
      expect(screen.getByText(/No loans found/i)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("shows loan in table when data exists", async () => {
    setupFetch([LOAN]);
    render(<LoansPage />);
    await waitFor(() => {
      expect(screen.getByText("Alice Santos")).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("shows network error when API fails", async () => {
    mockFetch.mockRejectedValue(new Error("Network down"));
    render(<LoansPage />);
    await waitFor(() => {
      expect(screen.getByText(/Network error/i)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("renders KPI cards: Active Loans, Pending Approval, Total Outstanding", async () => {
    setupFetch([]);
    render(<LoansPage />);
    await waitFor(() => {
      expect(screen.getByText(/Active Loans/i)).toBeInTheDocument();
      expect(screen.getByText(/Pending Approval/i)).toBeInTheDocument();
      expect(screen.getByText(/Total Outstanding/i)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("renders status filter tabs", async () => {
    setupFetch([]);
    render(<LoansPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^All$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Pending$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Active$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Completed$/i })).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("opens CreateLoanModal when New Loan is clicked", async () => {
    setupFetch([]);
    render(<LoansPage />);
    await waitFor(() => screen.getByRole("button", { name: /New Loan/i }));
    fireEvent.click(screen.getByRole("button", { name: /New Loan/i }));
    await waitFor(() => {
      expect(screen.getByText(/New Loan Application/i)).toBeInTheDocument();
    });
  });

  it("shows auto-apply panel with Apply button", async () => {
    setupFetch([]);
    render(<LoansPage />);
    await waitFor(() => {
      expect(screen.getByText(/Auto-apply Loan Deductions/i)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("allows HQ role (not just ADMIN)", async () => {
    vi.mocked(getAuth).mockReturnValue({ ...BASE_AUTH, role: "HQ" as any });
    setupFetch([]);
    render(<LoansPage />);
    await waitFor(() => {
      expect(routerMock.replace).not.toHaveBeenCalled();
    });
    expect(screen.getByText(/Employee Loans/i)).toBeInTheDocument();
  });
});
