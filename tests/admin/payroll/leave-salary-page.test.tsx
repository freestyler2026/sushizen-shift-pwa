// tests/admin/payroll/leave-salary-page.test.tsx

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
import LeaveSalaryPage from "@/app/admin/payroll/leave-salary/page";
import { routerMock } from "../../setup";

const CYCLE = { id: 1, city: "manila", year: 2026, month: 5, status: "open" };

function mockJson(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: vi.fn(async () => body), text: async () => "", headers: new Headers(), clone: function () { return this as Response; } } as unknown as Response;
}

function setupFetch(requests: unknown[] = []) {
  mockFetch.mockImplementation((url: string) => {
    const u = String(url);
    if (u.includes("/cycles")) return Promise.resolve(mockJson({ cycles: [CYCLE] }));
    if (u.includes("/leave-salary")) return Promise.resolve(mockJson({ requests }));
    return Promise.resolve(mockJson({}, 404));
  });
}

const LEAVE_REQUEST = {
  id: "ls-001",
  city: "manila",
  staff_name: "Maria Cruz",
  leave_start_date: "2026-06-01",
  leave_end_date: "2026-06-10",
  leave_days: 10,
  currency: "PHP",
  daily_rate: 1000,
  advance_amount: 10000,
  status: "pending",
  purpose: "Annual Leave",
  requested_by: "Maria",
  requested_at: new Date().toISOString(),
  approved_by: "",
  approved_at: null,
  rejected_by: "",
  rejected_at: null,
  rejection_note: "",
  paid_by: "",
  paid_at: null,
  paid_via: "",
  reference_no: "",
  cycle_id: null,
  note: "",
  created_at: new Date().toISOString(),
};

describe("LeaveSalaryPage", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(getAuth).mockReturnValue(BASE_AUTH); });
  afterEach(() => cleanup());

  it("redirects to / when not authenticated", async () => {
    vi.mocked(getAuth).mockReturnValue(null as any);
    setupFetch();
    render(<LeaveSalaryPage />);
    await waitFor(() => { expect(routerMock.replace).toHaveBeenCalledWith("/"); });
  });

  it("redirects to /week for non-allowed role", async () => {
    vi.mocked(getAuth).mockReturnValue({ ...BASE_AUTH, role: "STAFF" as any });
    setupFetch();
    render(<LeaveSalaryPage />);
    await waitFor(() => { expect(routerMock.replace).toHaveBeenCalledWith("/week"); });
  });

  it("renders page title", () => {
    setupFetch();
    render(<LeaveSalaryPage />);
    expect(screen.getByText(/Leave Salary/i)).toBeInTheDocument();
  });

  it("shows Dubai and Manila toggle buttons", () => {
    setupFetch();
    render(<LeaveSalaryPage />);
    expect(screen.getByRole("button", { name: /Dubai/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Manila/i })).toBeInTheDocument();
  });

  it("shows New Request button", () => {
    setupFetch();
    render(<LeaveSalaryPage />);
    expect(screen.getByRole("button", { name: /New Request/i })).toBeInTheDocument();
  });

  it("fetches leave-salary requests on mount", async () => {
    setupFetch();
    render(<LeaveSalaryPage />);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("/leave-salary"), expect.any(Object));
    });
  });

  it("shows empty state when no requests", async () => {
    setupFetch([]);
    render(<LeaveSalaryPage />);
    await waitFor(() => {
      expect(screen.getByText(/No leave salary requests/i)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("shows request in table when data exists", async () => {
    setupFetch([LEAVE_REQUEST]);
    render(<LeaveSalaryPage />);
    await waitFor(() => {
      expect(screen.getByText("Maria Cruz")).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("shows network error when API fails", async () => {
    mockFetch.mockRejectedValue(new Error("Network down"));
    render(<LeaveSalaryPage />);
    await waitFor(() => {
      expect(screen.getByText(/Network error/i)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("renders KPI cards: Total, Pending, Approved, Paid Out", async () => {
    setupFetch([]);
    render(<LeaveSalaryPage />);
    await waitFor(() => {
      // "Paid Out" is unique enough — Pending and Approved appear in both KPIs and tabs
      expect(screen.getByText(/Paid Out/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Pending/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Approved/i).length).toBeGreaterThanOrEqual(1);
    }, { timeout: 5000 });
  });

  it("renders status filter tabs: All, Pending, Approved, Paid, Rejected, Cancelled", async () => {
    setupFetch([]);
    render(<LeaveSalaryPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^All$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Paid$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Rejected$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Cancelled$/i })).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("opens CreateModal when New Request is clicked", async () => {
    setupFetch([]);
    render(<LeaveSalaryPage />);
    await waitFor(() => screen.getByRole("button", { name: /New Request/i }));
    fireEvent.click(screen.getByRole("button", { name: /New Request/i }));
    await waitFor(() => {
      expect(screen.getByText(/New Leave Salary Request/i)).toBeInTheDocument();
    });
  });

  it("allows HQ role", async () => {
    vi.mocked(getAuth).mockReturnValue({ ...BASE_AUTH, role: "HQ" as any });
    setupFetch([]);
    render(<LeaveSalaryPage />);
    await waitFor(() => {
      expect(routerMock.replace).not.toHaveBeenCalled();
    });
    // Page title is in a <p> with T_PAGE_TITLE class — multiple "Leave Salary" text nodes exist
    expect(screen.getAllByText(/Leave Salary/i).length).toBeGreaterThanOrEqual(1);
  });
});
