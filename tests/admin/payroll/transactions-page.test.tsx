// tests/admin/payroll/transactions-page.test.tsx

import React from "react";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
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
import PayrollTransactionsPage from "@/app/admin/payroll/transactions/page";
import { routerMock } from "../../setup";

const CYCLE = { id: 1, city: "manila", year: 2026, month: 5, status: "open", closed_at: null };

function mockJson(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: vi.fn(async () => body), text: async () => "", headers: new Headers(), clone: function () { return this as Response; } } as unknown as Response;
}

function setupFetch() {
  mockFetch.mockImplementation((url: string) => {
    const u = String(url);
    if (u.includes("/cycles")) return Promise.resolve(mockJson({ cycles: [CYCLE] }));
    if (u.includes("/runs") && !u.includes("/records") && !u.includes("/finalize") && !u.includes("/payslip")) {
      return Promise.resolve(mockJson({ run: null }));
    }
    if (u.includes("/payments")) return Promise.resolve(mockJson({ payments: [] }));
    return Promise.resolve(mockJson({}, 404));
  });
}

describe("PayrollTransactionsPage", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(getAuth).mockReturnValue(BASE_AUTH); });
  afterEach(() => cleanup());

  it("redirects to / when not authenticated", async () => {
    vi.mocked(getAuth).mockReturnValue(null as any);
    setupFetch();
    render(<PayrollTransactionsPage />);
    await waitFor(() => { expect(routerMock.replace).toHaveBeenCalledWith("/"); });
  });

  it("redirects to /week for non-allowed role", async () => {
    vi.mocked(getAuth).mockReturnValue({ ...BASE_AUTH, role: "STAFF" as any });
    setupFetch();
    render(<PayrollTransactionsPage />);
    await waitFor(() => { expect(routerMock.replace).toHaveBeenCalledWith("/week"); });
  });

  it("renders page title", () => {
    setupFetch();
    render(<PayrollTransactionsPage />);
    expect(screen.getByText(/Payroll Transactions/i)).toBeInTheDocument();
  });

  it("shows Dubai and Manila toggle buttons", () => {
    setupFetch();
    render(<PayrollTransactionsPage />);
    expect(screen.getByRole("button", { name: /^Dubai$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Manila$/i })).toBeInTheDocument();
  });

  it("fetches cycles on mount", async () => {
    setupFetch();
    render(<PayrollTransactionsPage />);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("/cycles"), expect.any(Object));
    });
  });

  it("shows Pay Period selector", async () => {
    setupFetch();
    render(<PayrollTransactionsPage />);
    await waitFor(() => {
      expect(screen.getByText(/Pay Period/i)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("shows prompt to select pay period before cycle is selected", async () => {
    // The component auto-selects first cycle from API, so mock an empty cycles list
    mockFetch.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes("/cycles")) return Promise.resolve(mockJson({ cycles: [] }));
      return Promise.resolve(mockJson({}, 404));
    });
    render(<PayrollTransactionsPage />);
    await waitFor(() => {
      expect(screen.getByText(/Select a pay period/i)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("shows Payroll Run, Payments, Payslips tabs after cycle loads", async () => {
    setupFetch();
    render(<PayrollTransactionsPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Payroll Run/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Payments/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Payslips/i })).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("shows no run message in Run tab when run is null", async () => {
    setupFetch();
    render(<PayrollTransactionsPage />);
    await waitFor(() => {
      expect(screen.getByText(/No payroll run generated yet/i)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("shows Generate Run button", async () => {
    setupFetch();
    render(<PayrollTransactionsPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Generate Run/i })).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("shows error when cycles fetch fails", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (String(url).includes("/cycles")) return Promise.resolve(mockJson({ detail: "Unauthorized" }, 401));
      return Promise.resolve(mockJson({}, 404));
    });
    render(<PayrollTransactionsPage />);
    // The page shows the API's detail message, not the generic fallback
    await waitFor(() => {
      expect(screen.getByText(/Unauthorized|Failed to load/i)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("allows HQ role", async () => {
    vi.mocked(getAuth).mockReturnValue({ ...BASE_AUTH, role: "HQ" as any });
    setupFetch();
    render(<PayrollTransactionsPage />);
    await waitFor(() => {
      expect(routerMock.replace).not.toHaveBeenCalled();
    });
    expect(screen.getByText(/Payroll Transactions/i)).toBeInTheDocument();
  });
});
