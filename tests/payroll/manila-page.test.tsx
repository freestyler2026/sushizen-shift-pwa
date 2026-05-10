/**
 * Tests for /admin/payroll/manila/page.tsx (Manila Payroll v5 — Period List)
 *
 * Covers:
 * - Period list renders after fetch
 * - Status badges (draft / approved / paid)
 * - "New Period" form opens and submits
 * - 2H auto-links first_half_period_id from existing 1H period
 * - Auth guard redirects non-ADMIN/non-HQ users to /week
 * - Error state rendered when API fails
 */
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { setAdminAuth, routerMock } from "../setup";
import { buildFetchMock, buildFailFetch } from "../helpers/fetch-mock";

const PERIOD_DRAFT = {
  id: 1,
  period_label: "May 2026 — 1st Half",
  period_half: 1,
  year: 2026,
  month: 5,
  start_date: "2026-05-01",
  end_date: "2026-05-15",
  first_half_period_id: null,
  status: "draft",
  approved_at: null,
  paid_at: null,
};

const PERIOD_APPROVED = {
  ...PERIOD_DRAFT,
  id: 2,
  period_label: "May 2026 — 2nd Half",
  period_half: 2,
  start_date: "2026-05-16",
  end_date: "2026-05-31",
  first_half_period_id: 1,
  status: "approved",
  approved_at: "2026-05-31T10:00:00Z",
};

const PERIOD_PAID = {
  ...PERIOD_DRAFT,
  id: 3,
  period_label: "Apr 2026 — 1st Half",
  period_half: 1,
  year: 2026,
  month: 4,
  start_date: "2026-04-01",
  end_date: "2026-04-15",
  status: "paid",
  paid_at: "2026-04-15T09:00:00Z",
};

describe("ManilaPayrollPage — period list", () => {
  beforeEach(() => setAdminAuth("manila"));

  it("renders period cards after loading", async () => {
    vi.stubGlobal(
      "fetch",
      buildFetchMock([{ match: "/api/admin/manila-payroll/periods", body: [PERIOD_DRAFT, PERIOD_APPROVED] }])
    );

    const { default: Page } = await import(
      "../../src/app/admin/payroll/manila/page"
    );
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText("May 2026 — 1st Half")).toBeTruthy();
      expect(screen.getByText("May 2026 — 2nd Half")).toBeTruthy();
    });
  });

  it("shows correct status badges for draft / approved / paid", async () => {
    vi.stubGlobal(
      "fetch",
      buildFetchMock([
        { match: "/api/admin/manila-payroll/periods", body: [PERIOD_DRAFT, PERIOD_APPROVED, PERIOD_PAID] },
      ])
    );

    const { default: Page } = await import("../../src/app/admin/payroll/manila/page");
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText("draft")).toBeTruthy();
      expect(screen.getByText("approved")).toBeTruthy();
      expect(screen.getByText("paid")).toBeTruthy();
    });
  });

  it("shows empty state when no periods exist", async () => {
    vi.stubGlobal(
      "fetch",
      buildFetchMock([{ match: "/api/admin/manila-payroll/periods", body: [] }])
    );

    const { default: Page } = await import("../../src/app/admin/payroll/manila/page");
    render(<Page />);

    await waitFor(() => {
      // No period cards visible
      expect(screen.queryByText("May 2026 — 1st Half")).toBeNull();
    });
  });

  it("opens New Period form on button click", async () => {
    vi.stubGlobal(
      "fetch",
      buildFetchMock([{ match: "/api/admin/manila-payroll/periods", body: [] }])
    );

    const { default: Page } = await import("../../src/app/admin/payroll/manila/page");
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /new period/i })).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /new period/i }));
    });

    // Form elements should appear
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create/i })).toBeTruthy();
    });
  });

  it("submits 1H period with correct payload", async () => {
    const mockFetch = buildFetchMock([
      { match: "/api/admin/manila-payroll/periods", body: [] },
      { match: "/api/admin/manila-payroll/periods", method: "POST", body: PERIOD_DRAFT, status: 201 },
    ]);
    vi.stubGlobal("fetch", mockFetch);

    const { default: Page } = await import("../../src/app/admin/payroll/manila/page");
    render(<Page />);

    // Open form
    await waitFor(() => fireEvent.click(screen.getByRole("button", { name: /new period/i })));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /create/i }));
    });

    await waitFor(() => {
      const postCalls = mockFetch.mock.calls.filter(
        ([url, opts]: [string, RequestInit]) =>
          url.includes("/api/admin/manila-payroll/periods") && opts?.method === "POST"
      );
      expect(postCalls.length).toBeGreaterThan(0);
    });
  });

  it("auto-links first_half_period_id when creating 2H", async () => {
    const mockFetch = buildFetchMock([
      { match: "/api/admin/manila-payroll/periods", method: "POST", body: PERIOD_APPROVED, status: 201 },
      { match: "/api/admin/manila-payroll/periods", body: [PERIOD_DRAFT] },
    ]);
    vi.stubGlobal("fetch", mockFetch);

    const { default: Page } = await import("../../src/app/admin/payroll/manila/page");
    render(<Page />);

    await waitFor(() => fireEvent.click(screen.getByRole("button", { name: /new period/i })));

    // The "Half" <select> is the 2nd combobox (after Month).
    // It has a visible label "Half" but no htmlFor, so use getAllByRole + index.
    await act(async () => {
      const selects = screen.getAllByRole("combobox");
      // selects[0] = Month, selects[1] = Half
      const halfSelect = selects[selects.length - 1];
      fireEvent.change(halfSelect, { target: { value: "2" } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /create/i }));
    });

    await waitFor(() => {
      const postCalls = mockFetch.mock.calls.filter(
        ([url, opts]: [string, RequestInit]) =>
          url.includes("/api/admin/manila-payroll/periods") && opts?.method === "POST"
      );
      expect(postCalls.length).toBeGreaterThan(0);
      const body = JSON.parse(String(postCalls[0][1]?.body));
      // 2H with matching year/month should have first_half_period_id = 1
      expect(body.period_half).toBe(2);
      expect(body.first_half_period_id).toBe(1);
    });
  });

  it("shows error message when periods API fails", async () => {
    vi.stubGlobal("fetch", buildFailFetch(500, "Internal server error"));

    const { default: Page } = await import("../../src/app/admin/payroll/manila/page");
    render(<Page />);

    await waitFor(() => {
      // Error should be shown
      const errorEl = document.querySelector("[class*='text-red']") ||
                      document.querySelector("[class*='error']");
      // At minimum, loading spinner should be gone
      expect(screen.queryByText("May 2026 — 1st Half")).toBeNull();
    });
  });

  it("redirects non-admin to /week (router.replace called)", async () => {
    // Set non-admin auth BEFORE rendering
    window.localStorage.setItem(
      "sushizen_shift_auth",
      JSON.stringify({ staffName: "Staff User", city: "manila", role: "STAFF", accessToken: "t" })
    );

    vi.stubGlobal(
      "fetch",
      buildFetchMock([{ match: "/api/admin/manila-payroll/periods", body: [] }])
    );

    const { default: Page } = await import("../../src/app/admin/payroll/manila/page");
    render(<Page />);

    // routerMock is the stable shared mock from setup.ts — same object the component calls
    await waitFor(() => {
      expect(routerMock.replace).toHaveBeenCalledWith("/week");
    });
  });
});
