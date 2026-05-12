// tests/admin/payroll/adjustments-page.test.tsx

import React from "react";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const BASE_AUTH = { staffName: "Jay", city: "manila" as const, role: "ADMIN" as const, accessToken: "tok", permissions: ["*"] };

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getAuth: vi.fn(() => BASE_AUTH), getAuthHeaders: vi.fn(() => ({})) };
});

const mockFetch = vi.fn();
Object.defineProperty(globalThis, "fetch", { writable: true, configurable: true, value: mockFetch });

import { getAuth } from "@/lib/auth";
import AdjustmentsPage from "@/app/admin/payroll/adjustments/page";
import { routerMock } from "../../setup";

const CYCLE = { id: 1, city: "manila", year: 2026, month: 5, status: "open" };

function mockJson(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: vi.fn(async () => body), text: async () => "", headers: new Headers(), clone: function () { return this as Response; } } as unknown as Response;
}

function setupFetch(adjustments: unknown[] = []) {
  mockFetch.mockImplementation((url: string) => {
    if (String(url).includes("/cycles")) return Promise.resolve(mockJson({ cycles: [CYCLE] }));
    if (String(url).includes("/adjustments")) return Promise.resolve(mockJson({ adjustments }));
    return Promise.resolve(mockJson({}, 404));
  });
}

describe("AdjustmentsPage", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(getAuth).mockReturnValue(BASE_AUTH); });
  afterEach(() => cleanup());

  it("redirects to /week for non-admin role", async () => {
    vi.mocked(getAuth).mockReturnValue({ ...BASE_AUTH, role: "STAFF" as any });
    setupFetch();
    render(<AdjustmentsPage />);
    await waitFor(() => { expect(routerMock.replace).toHaveBeenCalledWith("/week"); });
  });

  it("renders page title", () => {
    setupFetch();
    render(<AdjustmentsPage />);
    expect(screen.getByText(/Payroll Adjustments/i)).toBeInTheDocument();
  });

  it("fetches cycles on mount", async () => {
    setupFetch();
    render(<AdjustmentsPage />);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("/cycles"), expect.any(Object));
    });
  });

  it("shows empty state when no adjustments", async () => {
    setupFetch([]);
    render(<AdjustmentsPage />);
    await waitFor(() => {
      expect(screen.getByText(/No adjustments for this cycle/i)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("shows error when API fails", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (String(url).includes("/cycles")) return Promise.resolve(mockJson({ cycles: [CYCLE] }));
      if (String(url).includes("/adjustments")) return Promise.resolve(mockJson({ detail: "Server error" }, 500));
      return Promise.resolve(mockJson({}, 404));
    });
    render(<AdjustmentsPage />);
    await waitFor(() => {
      expect(screen.getByText(/Server error/i)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("shows Addition, Deduction, and Recurring buttons", async () => {
    setupFetch([]);
    render(<AdjustmentsPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Addition/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Deduction/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Recurring/i })).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("shows adjustments in table when data exists", async () => {
    const adj = { id: "adj-1", city: "manila", cycle_id: 1, staff_name: "Alice", adj_type: "addition", subtype: "Overtime", amount: 500, vat: 0, incurred_at: null, reference_no: "REF001", note: "", source: "manual", created_at: new Date().toISOString() };
    setupFetch([adj]);
    render(<AdjustmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("filter select shows All Types, Additions, Deductions options", async () => {
    setupFetch([]);
    render(<AdjustmentsPage />);
    // Page has two selects: cycle selector and type filter
    await waitFor(() => {
      expect(screen.getAllByRole("combobox").length).toBeGreaterThanOrEqual(2);
    }, { timeout: 5000 });
    // getAllByRole("option") returns options from all selects
    const options = screen.getAllByRole("option");
    const optionTexts = options.map(o => o.textContent?.trim());
    expect(optionTexts).toContain("All Types");
    expect(optionTexts).toContain("Additions");
    expect(optionTexts).toContain("Deductions");
  });

  it("city toggle shows Dubai and Manila buttons", () => {
    setupFetch([]);
    render(<AdjustmentsPage />);
    expect(screen.getByRole("button", { name: /^Dubai$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Manila$/i })).toBeInTheDocument();
  });

  it("opens AdjModal when Addition button is clicked", async () => {
    setupFetch([]);
    render(<AdjustmentsPage />);
    await waitFor(() => screen.getByRole("button", { name: /^Addition$/i }), { timeout: 5000 });
    fireEvent.click(screen.getByRole("button", { name: /^Addition$/i }));
    await waitFor(() => {
      // Modal title for addition type is "New Addition"
      expect(screen.getByText(/New Addition/i)).toBeInTheDocument();
    });
  });
});
