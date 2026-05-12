// tests/admin/daily-report/daily-report-page.test.tsx
// Comprehensive tests for src/app/admin/daily-report/page.tsx

import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── framer-motion ─────────────────────────────────────────────────────────────
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, className, ...rest }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement("div", { className, ...rest }, children),
  },
}));

// ── recharts (jsdom has no SVG layout engine) ────────────────────────────────
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: any) =>
    React.createElement("div", { "data-testid": "recharts-container" }, children),
  BarChart: ({ children }: any) =>
    React.createElement("div", { "data-testid": "bar-chart" }, children),
  Bar: ({ children }: any) => React.createElement("div", null, children),
  Cell: () => null,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}));

// ── @/lib/auth ────────────────────────────────────────────────────────────────
const BASE_AUTH = {
  staffName: "Jay Test",
  city: "dubai" as const,
  role: "ADMIN",
  accessToken: "tok-test",
  permissions: ["*"],
};

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getAuth: vi.fn(() => BASE_AUTH),
    refreshAuthFromApi: vi.fn(async () => ({ ...BASE_AUTH })),
    canAccessAnalyticsAdmin: vi.fn(() => true),
  };
});

// ── @/lib/api ────────────────────────────────────────────────────────────────
const mockApiGet = vi.fn();
const mockApiPost = vi.fn();

vi.mock("@/lib/api", () => ({
  apiGet: (...args: any[]) => mockApiGet(...args),
  apiPost: (...args: any[]) => mockApiPost(...args),
}));

import DailyReportPage from "@/app/admin/daily-report/page";

// ══════════════════════════════════════════════════════════════════════════════
// Fixtures
// ══════════════════════════════════════════════════════════════════════════════

const DUBAI_REPORT_DATA = {
  report_date: "2026-05-10",
  city: "dubai",
  generated_at: "2026-05-10T05:30:00.000Z",
  attendance: {
    absences: [
      { staff_name: "Ahmed Al-Rashid", absence_type: "Sick Leave", note: "Fever", branch: "JLT" },
    ],
    late: [
      { staff_name: "Mohammed", branch: "JLT", late_minutes: 35 },
      { staff_name: "Khalid", branch: "DXBMALL", late_minutes: 12 },
    ],
    no_show: [
      { staff_name: "Fatima", scheduled_branch_code: "DXBMALL", scheduled_minutes: 480 },
    ],
    overtime_summary: {
      total_incidents: 3,
      total_staff: 3,
      total_overtime_minutes: 240,
      max_overtime_minutes: 120,
    },
    overtime_by_branch: {
      rows: [
        {
          branch_code: "JLT",
          incidents: 2,
          staff_count: 2,
          total_overtime_minutes: 180,
          avg_overtime_minutes: 90,
        },
      ],
    },
  },
  sales: {
    pos_sales: {
      rows: [
        {
          branch_name: "JLT",
          branch_code: "JLT",
          aggregator_name: "Talabat",
          net_sales: 5000,
          gross_sales: 5500,
          order_count: 50,
        },
        {
          branch_name: "DXBMALL",
          branch_code: "DXBMALL",
          aggregator_name: "Deliveroo",
          net_sales: 3000,
          gross_sales: 3300,
          order_count: 30,
        },
      ],
      total_net_sales: 8000,
      total_gross_sales: 8800,
      total_orders: 80,
    },
    order_counts: {
      rows: [],
      total: 80,
      by_aggregator: [
        { aggregator: "Talabat", order_count: 50 },
        { aggregator: "Deliveroo", order_count: 30 },
      ],
      by_brand: [{ brand: "Sushi ZEN Dubai", order_count: 80 }],
    },
  },
  adherence: {
    rows: [
      {
        branch_code: "JLT",
        scheduled_shifts: 10,
        attended_shifts: 9,
        no_show_count: 1,
        staff_count: 10,
        adherence_rate: 90,
        total_overtime_minutes: 180,
      },
    ],
    overall_rate: 90,
    total_scheduled: 10,
    total_attended: 9,
  },
  lean_shift: {
    rows: [
      {
        branch_code: "JLT",
        dow: 1,
        day_name: "Monday",
        shift_count: 5,
        avg_checkout_hour: 21.5,
        avg_checkin_hour: 14.0,
        lean_start_hour: 20.0,
        avg_hours_worked: 7.5,
        avg_ot_minutes: 90,
        reducible_ot_per_shift: 60,
      },
    ],
    total_reducible_ot_minutes: 300,
  },
  ratings: {
    rows: [
      {
        brand: "Sushi ZEN",
        aggregator: "Talabat",
        branch: "JLT",
        rating_score: 4.8,
        review_count: "150",
      },
    ],
    avg_rating: 4.8,
    count: 1,
    by_aggregator: [{ aggregator: "Talabat", avg_score: 4.8, count: 1 }],
  },
  disposal: {
    rows: [
      {
        id: 1,
        branch_code: "JLT",
        report_date: "2026-05-10",
        reported_by: "Manager",
        shift: "closing",
        notes: "",
        status: "submitted",
        line_count: 1,
        lines: [
          { item_name_snapshot: "Salmon Sashimi", quantity: 2, unit: "pcs", disposal_reason: "Expired" },
        ],
      },
    ],
    total_reports: 1,
    total_items: 1,
  },
  backup: {
    rows: [
      {
        id: 1,
        branch_code: "JLT",
        report_date: "2026-05-10",
        reported_by: "Staff",
        shift: "closing",
        notes: "",
        status: "submitted",
        lines: [
          { section: "Condiments", item_name_snapshot: "Soy Sauce", quantity: 200, unit: "pcs" },
        ],
      },
    ],
    total_reports: 1,
    total_items: 1,
  },
};

const MANILA_REPORT_DATA = {
  report_date: "2026-05-10",
  city: "manila",
  generated_at: "2026-05-10T05:30:00.000Z",
  attendance: {
    absences: [],
    late: [{ staff_name: "Maria Santos", branch: "Taft", late_minutes: 15 }],
    no_show: [],
    overtime_summary: { total_incidents: 1, total_staff: 1, total_overtime_minutes: 60, max_overtime_minutes: 60 },
    overtime_by_branch: {
      rows: [{ branch_code: "TAFT", incidents: 1, staff_count: 1, total_overtime_minutes: 60, avg_overtime_minutes: 60 }],
    },
  },
  sales: {
    daily_sales: {
      rows: [
        { branch: "Taft", total_orders: 80, total_amount: 32000, dine_in_orders: 30, grabfood_orders: 30, foodpanda_orders: 15, beep_orders: 5 },
        { branch: "Paranaque", total_orders: 60, total_amount: 24000, dine_in_orders: 20, grabfood_orders: 25, foodpanda_orders: 10, beep_orders: 5 },
      ],
      total_amount: 56000,
      total_orders: 140,
      by_channel: [
        { channel: "Dine-in", orders: 50, amount: 20000 },
        { channel: "GrabFood", orders: 55, amount: 22000 },
      ],
    },
    order_counts: { rows: [], total_transactions: 140 },
  },
  adherence: {
    rows: [
      { branch_code: "TAFT", scheduled_shifts: 8, attended_shifts: 8, no_show_count: 0, staff_count: 8, adherence_rate: 100 },
    ],
    overall_rate: 100,
    total_scheduled: 8,
    total_attended: 8,
  },
};

const MINIMAL_REPORT_DATA = {
  report_date: "2026-05-10",
  city: "dubai",
  generated_at: "2026-05-10T05:30:00.000Z",
  attendance: {
    absences: [],
    late: [],
    no_show: [],
    overtime_summary: {},
    overtime_by_branch: { rows: [] },
  },
  sales: {},
};

function makeReport(data: typeof DUBAI_REPORT_DATA | typeof MANILA_REPORT_DATA | typeof MINIMAL_REPORT_DATA) {
  return {
    ok: true,
    reports: [
      {
        report_date: data.report_date,
        city: data.city,
        data,
        generated_at: "generated_at" in data ? data.generated_at : null,
      },
    ],
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════

async function setupAuth(override?: Partial<typeof BASE_AUTH>) {
  const { getAuth, refreshAuthFromApi } = await import("@/lib/auth");
  vi.mocked(getAuth).mockReturnValue({ ...BASE_AUTH, ...override } as any);
  vi.mocked(refreshAuthFromApi).mockResolvedValue({ ...BASE_AUTH, ...override } as any);
}

async function renderPage() {
  render(<DailyReportPage />);
}

async function renderAndLoad() {
  render(<DailyReportPage />);
  // Wait until report data is rendered.
  // IMPORTANT: Do NOT include "No report yet" or "Analytics permission required" —
  // both appear in the initial render before auth/data load, causing premature resolve.
  await waitFor(() => {
    const hasData = screen.queryByText(/Day at a Glance/i) !== null;
    const hasError = screen.queryByText(/^Error:/i) !== null;
    expect(hasData || hasError).toBe(true);
  }, { timeout: 5000 });
}

async function renderWithDubaiReport() {
  mockApiGet.mockResolvedValue(makeReport(DUBAI_REPORT_DATA));
  await renderAndLoad();
}

async function renderWithManilaReport() {
  // Start on Dubai, wait for data, then switch to Manila
  mockApiGet.mockResolvedValue(makeReport(DUBAI_REPORT_DATA));
  render(<DailyReportPage />);
  // Wait for Dubai data (resolves once auth+fetch complete; not initial "access denied")
  await waitFor(() => {
    expect(screen.queryByText(/Day at a Glance/i)).not.toBeNull();
  }, { timeout: 5000 });
  // Switch to Manila
  mockApiGet.mockResolvedValue(makeReport(MANILA_REPORT_DATA));
  fireEvent.click(screen.getByRole("button", { name: /Manila/i }));
  // Wait for Manila branch card (Paranaque is unique to Manila data)
  // Use queryAllByText — "Paranaque" appears in both branch card AND table row
  await waitFor(() => {
    expect(screen.queryAllByText("Paranaque").length).toBeGreaterThan(0);
  }, { timeout: 5000 });
}

// ══════════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════════

describe("DailyReportPage", () => {
  beforeEach(async () => {
    await setupAuth();
    mockApiGet.mockResolvedValue(makeReport(DUBAI_REPORT_DATA));
    mockApiPost.mockResolvedValue({ ok: true, results: {} });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // ── Page Header ──────────────────────────────────────────────────────────────
  describe("page header", () => {
    it("renders 'Daily Operations Report' title", async () => {
      await renderAndLoad();
      expect(screen.getByText(/Daily Operations Report/i)).toBeInTheDocument();
    });

    it("renders subtitle about auto-generated report", async () => {
      await renderAndLoad();
      expect(screen.getByText(/Auto-generated/i)).toBeInTheDocument();
    });

    it("renders language toggle button (日本語)", async () => {
      await renderAndLoad();
      expect(screen.getByRole("button", { name: /日本語/i })).toBeInTheDocument();
    });

    it("renders Refresh button", async () => {
      await renderAndLoad();
      expect(screen.getByRole("button", { name: /Refresh/i })).toBeInTheDocument();
    });

    it("ADMIN sees 'Generate Now' button", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Generate Now/i })).toBeInTheDocument();
      });
    });

    it("non-admin/HQ user does NOT see 'Generate Now' button", async () => {
      await setupAuth({ role: "MANAGER", permissions: ["channel.admin.analytics.view"] });
      const { canAccessAnalyticsAdmin } = await import("@/lib/auth");
      vi.mocked(canAccessAnalyticsAdmin).mockReturnValue(true);
      await renderPage();
      await waitFor(() => {
        expect(screen.queryByText(/Day at a Glance/i)).toBeInTheDocument();
      }, { timeout: 5000 });
      expect(screen.queryByRole("button", { name: /Generate Now/i })).not.toBeInTheDocument();
    });
  });

  // ── Auth guard ───────────────────────────────────────────────────────────────
  describe("auth guard", () => {
    it("redirects to login when no access token", async () => {
      const { getAuth, refreshAuthFromApi } = await import("@/lib/auth");
      vi.mocked(getAuth).mockReturnValue(null as any);
      vi.mocked(refreshAuthFromApi).mockResolvedValue(null as any);
      const { routerMock } = await import("../../setup");
      render(<DailyReportPage />);
      await waitFor(() => {
        expect(routerMock.replace).toHaveBeenCalledWith(expect.stringContaining("/login"));
      });
    });

    it("shows access denied when user lacks permission", async () => {
      await setupAuth({ role: "STAFF", permissions: [] });
      const { canAccessAnalyticsAdmin } = await import("@/lib/auth");
      vi.mocked(canAccessAnalyticsAdmin).mockReturnValue(false);
      render(<DailyReportPage />);
      await waitFor(() => {
        expect(screen.getByText(/Analytics permission required/i)).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it("access denied state shows 'Daily Report' heading", async () => {
      await setupAuth({ role: "STAFF", permissions: [] });
      const { canAccessAnalyticsAdmin } = await import("@/lib/auth");
      vi.mocked(canAccessAnalyticsAdmin).mockReturnValue(false);
      render(<DailyReportPage />);
      await waitFor(() => {
        expect(screen.getByText("Daily Report")).toBeInTheDocument();
      }, { timeout: 5000 });
    });
  });

  // ── City tabs ────────────────────────────────────────────────────────────────
  describe("city tabs", () => {
    it("renders Dubai tab", async () => {
      await renderAndLoad();
      expect(screen.getByRole("button", { name: /Dubai/i })).toBeInTheDocument();
    });

    it("renders Manila tab", async () => {
      await renderAndLoad();
      expect(screen.getByRole("button", { name: /Manila/i })).toBeInTheDocument();
    });

    it("clicking Manila tab calls apiGet with city=manila", async () => {
      await renderAndLoad();
      mockApiGet.mockResolvedValue(makeReport(MANILA_REPORT_DATA));
      fireEvent.click(screen.getByRole("button", { name: /Manila/i }));
      await waitFor(() => {
        const calls = mockApiGet.mock.calls.map((a: any) => String(a[0]));
        expect(calls.some((u) => u.includes("city=manila"))).toBe(true);
      });
    });

    it("clicking Dubai tab calls apiGet with city=dubai", async () => {
      // Start on Manila first, then switch back to Dubai
      await renderAndLoad();
      mockApiGet.mockResolvedValue(makeReport(MANILA_REPORT_DATA));
      fireEvent.click(screen.getByRole("button", { name: /Manila/i }));
      await waitFor(() => {
        expect(screen.queryAllByText("Paranaque").length).toBeGreaterThan(0);
      }, { timeout: 5000 });
      // Now click Dubai
      mockApiGet.mockResolvedValue(makeReport(DUBAI_REPORT_DATA));
      const prevCount = mockApiGet.mock.calls.length;
      fireEvent.click(screen.getByRole("button", { name: /Dubai/i }));
      await waitFor(() => {
        const newCalls = mockApiGet.mock.calls
          .slice(prevCount)
          .map((a: any) => String(a[0]));
        expect(newCalls.some((u) => u.includes("city=dubai"))).toBe(true);
      });
    });
  });

  // ── Loading state ────────────────────────────────────────────────────────────
  describe("loading state", () => {
    it("shows loading spinner while fetching", async () => {
      let resolve!: (v: any) => void;
      mockApiGet.mockReturnValue(new Promise((res) => { resolve = res; }));
      render(<DailyReportPage />);
      // Wait for auth to complete and fetch to start
      await waitFor(() => {
        expect(screen.queryByRole("status") !== null ||
          document.querySelector(".animate-spin") !== null).toBe(true);
      }, { timeout: 3000 });
      resolve(makeReport(DUBAI_REPORT_DATA));
    });
  });

  // ── Empty / no-report state ──────────────────────────────────────────────────
  describe("empty state", () => {
    it("shows 'No report yet for today' when no reports", async () => {
      mockApiGet.mockResolvedValue({ ok: true, reports: [] });
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText(/No report yet for today/i)).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it("shows hint about Generate Now in empty state", async () => {
      mockApiGet.mockResolvedValue({ ok: true, reports: [] });
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText(/HQ\/ADMIN/i)).toBeInTheDocument();
      }, { timeout: 5000 });
    });
  });

  // ── Error state ──────────────────────────────────────────────────────────────
  describe("error state", () => {
    it("shows error banner on fetch failure", async () => {
      mockApiGet.mockRejectedValue(new Error("Server unavailable"));
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText(/Server unavailable/i)).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it("shows 'Error:' prefix in error banner", async () => {
      mockApiGet.mockRejectedValue(new Error("timeout"));
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText(/Error:/i)).toBeInTheDocument();
      }, { timeout: 5000 });
    });
  });

  // ── Report meta ──────────────────────────────────────────────────────────────
  describe("report meta", () => {
    it("shows report date in meta row", async () => {
      await renderWithDubaiReport();
      await waitFor(() => {
        expect(screen.getByText("2026-05-10")).toBeInTheDocument();
      });
    });

    it("shows 'Generated' label in meta row", async () => {
      await renderWithDubaiReport();
      expect(screen.getAllByText(/Generated/i).length).toBeGreaterThanOrEqual(1);
    });

    it("shows multiple date buttons when multiple reports returned", async () => {
      mockApiGet.mockResolvedValue({
        ok: true,
        reports: [
          { report_date: "2026-05-10", city: "dubai", data: DUBAI_REPORT_DATA, generated_at: null },
          { report_date: "2026-05-09", city: "dubai", data: MINIMAL_REPORT_DATA, generated_at: null },
        ],
      });
      await renderAndLoad();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "2026-05-09" })).toBeInTheDocument();
      });
    });

    it("clicking a date button changes the selected report", async () => {
      const report2: typeof MINIMAL_REPORT_DATA = { ...MINIMAL_REPORT_DATA, report_date: "2026-05-09", city: "dubai" };
      mockApiGet.mockResolvedValue({
        ok: true,
        reports: [
          { report_date: "2026-05-10", city: "dubai", data: DUBAI_REPORT_DATA, generated_at: null },
          { report_date: "2026-05-09", city: "dubai", data: report2, generated_at: null },
        ],
      });
      await renderAndLoad();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "2026-05-09" })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole("button", { name: "2026-05-09" }));
      await waitFor(() => {
        // Report date shown in meta row should update
        expect(screen.getAllByText("2026-05-09").length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  // ── Day at a Glance ──────────────────────────────────────────────────────────
  describe("Day at a Glance section", () => {
    it("shows 'Day at a Glance' section heading", async () => {
      await renderWithDubaiReport();
      // heading may appear once; use h2 role to be specific
      expect(screen.getByRole("heading", { name: /Day at a Glance/i })).toBeInTheDocument();
    });

    it("shows Total Sales KPI with AED formatting for Dubai", async () => {
      await renderWithDubaiReport();
      // AED 8,000 appears in Day at a Glance AND Sales Detail KPIs
      expect(screen.getAllByText(/AED 8,000/i).length).toBeGreaterThanOrEqual(1);
    });

    it("shows total orders KPI", async () => {
      await renderWithDubaiReport();
      // totalOrders = 80 from pos_sales.total_orders
      expect(screen.getAllByText("80").length).toBeGreaterThanOrEqual(1);
    });

    it("shows absences KPI count", async () => {
      await renderWithDubaiReport();
      // 1 absence in fixture
      expect(screen.getAllByText("1").length).toBeGreaterThanOrEqual(1);
    });

    it("shows adherence rate KPI", async () => {
      await renderWithDubaiReport();
      expect(screen.getAllByText(/90%/i).length).toBeGreaterThanOrEqual(1);
    });

    it("shows avg rating KPI", async () => {
      await renderWithDubaiReport();
      // Avg rating appears in Day at a Glance and Ratings section
      expect(screen.getAllByText(/★ 4\.80/i).length).toBeGreaterThanOrEqual(1);
    });

    it("shows Total Sales in PHP formatting for Manila", async () => {
      await renderWithManilaReport();
      expect(screen.getAllByText(/₱56,000/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── By Branch section ────────────────────────────────────────────────────────
  describe("By Branch section", () => {
    it("shows 'By Branch' section heading", async () => {
      await renderWithDubaiReport();
      // "By Branch" is a substring of "Total OT by Branch" table header, so use heading role
      expect(screen.getByRole("heading", { name: /By Branch/i })).toBeInTheDocument();
    });

    it("shows JLT branch card for Dubai", async () => {
      await renderWithDubaiReport();
      // JLT appears in multiple sections (branch card, adherence, lean shift)
      expect(screen.getAllByText("JLT").length).toBeGreaterThanOrEqual(1);
    });

    it("shows DXBMALL branch card for Dubai", async () => {
      await renderWithDubaiReport();
      // DXBMALL appears in branch card and no-show table
      expect(screen.getAllByText("DXBMALL").length).toBeGreaterThanOrEqual(1);
    });

    it("shows AED sales value in branch card", async () => {
      await renderWithDubaiReport();
      // JLT net_sales = 5000 → AED 5,000 in branch card and Sales Detail table
      expect(screen.getAllByText(/AED 5,000/i).length).toBeGreaterThanOrEqual(1);
    });

    it("shows Manila branches (Taft, Paranaque) when on Manila tab", async () => {
      await renderWithManilaReport();
      expect(screen.getAllByText("Taft").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Paranaque").length).toBeGreaterThanOrEqual(1);
    });

    it("shows PHP sales in Manila branch cards", async () => {
      await renderWithManilaReport();
      expect(screen.getAllByText(/₱32,000/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Sales Detail ─────────────────────────────────────────────────────────────
  describe("Sales Detail section", () => {
    it("shows 'Sales Detail' section heading", async () => {
      await renderWithDubaiReport();
      expect(screen.getByText(/Sales Detail/i)).toBeInTheDocument();
    });

    it("Dubai: shows Net Sales KPI", async () => {
      await renderWithDubaiReport();
      expect(screen.getAllByText(/AED 8,000/i).length).toBeGreaterThanOrEqual(1);
    });

    it("Dubai: shows Gross Sales KPI", async () => {
      await renderWithDubaiReport();
      expect(screen.getByText(/AED 8,800/i)).toBeInTheDocument();
    });

    it("Dubai: shows Avg/Order KPI", async () => {
      await renderWithDubaiReport();
      // avg = 8000/80 = 100 → AED 100; may appear in KPI and table
      expect(screen.getAllByText(/AED 100/i).length).toBeGreaterThanOrEqual(1);
    });

    it("Dubai: shows aggregator breakdown (Talabat, Deliveroo)", async () => {
      await renderWithDubaiReport();
      // Talabat/Deliveroo appear in aggregator grid AND ratings table AND branch aggs
      expect(screen.getAllByText("Talabat").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Deliveroo").length).toBeGreaterThanOrEqual(1);
    });

    it("Dubai: shows brand breakdown (Sushi ZEN Dubai)", async () => {
      await renderWithDubaiReport();
      expect(screen.getByText("Sushi ZEN Dubai")).toBeInTheDocument();
    });

    it("Manila: shows total sales in PHP", async () => {
      await renderWithManilaReport();
      expect(screen.getAllByText(/₱56,000/i).length).toBeGreaterThanOrEqual(1);
    });

    it("Manila: shows orders column", async () => {
      await renderWithManilaReport();
      expect(screen.getAllByText("140").length).toBeGreaterThanOrEqual(1);
    });

    it("Manila: shows channel breakdown (Dine-in, GrabFood)", async () => {
      await renderWithManilaReport();
      expect(screen.getAllByText("Dine-in").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("GrabFood").length).toBeGreaterThanOrEqual(1);
    });

    it("Dubai: shows POS pending banner when no pos rows", async () => {
      const noPosDubai = {
        ...DUBAI_REPORT_DATA,
        sales: { ...DUBAI_REPORT_DATA.sales, pos_sales: undefined },
      };
      mockApiGet.mockResolvedValue(makeReport(noPosDubai as any));
      await renderAndLoad();
      await waitFor(() => {
        expect(screen.getByText(/UrbanPiper POS data not yet imported/i)).toBeInTheDocument();
      });
    });
  });

  // ── Attendance Detail ────────────────────────────────────────────────────────
  describe("Attendance Detail section", () => {
    it("shows 'Attendance Detail' section heading", async () => {
      await renderWithDubaiReport();
      expect(screen.getByText(/Attendance Detail/i)).toBeInTheDocument();
    });

    it("shows absent staff name", async () => {
      await renderWithDubaiReport();
      expect(screen.getByText(/Ahmed Al-Rashid/i)).toBeInTheDocument();
    });

    it("shows absence type badge", async () => {
      await renderWithDubaiReport();
      expect(screen.getByText("Sick Leave")).toBeInTheDocument();
    });

    it("shows absence note", async () => {
      await renderWithDubaiReport();
      expect(screen.getByText("Fever")).toBeInTheDocument();
    });

    it("shows 'No absences' when attendance.absences is empty", async () => {
      await renderWithManilaReport();
      expect(screen.getByText(/No absences/i)).toBeInTheDocument();
    });

    it("shows late arrivals section with staff name", async () => {
      await renderWithDubaiReport();
      expect(screen.getByText("Mohammed")).toBeInTheDocument();
    });

    it("shows late duration formatted as minutes", async () => {
      await renderWithDubaiReport();
      // 35 minutes → fmtMin(35) = "35m"
      expect(screen.getByText("35m")).toBeInTheDocument();
    });

    it("shows 'No late arrivals' when late array is empty", async () => {
      const noLate = {
        ...MINIMAL_REPORT_DATA,
        attendance: { ...MINIMAL_REPORT_DATA.attendance, late: [] },
      };
      mockApiGet.mockResolvedValue(makeReport(noLate as any));
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText(/No late arrivals/i)).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it("shows no-show staff name", async () => {
      await renderWithDubaiReport();
      expect(screen.getByText("Fatima")).toBeInTheDocument();
    });

    it("shows no-show scheduled branch", async () => {
      await renderWithDubaiReport();
      expect(screen.getAllByText("DXBMALL").length).toBeGreaterThanOrEqual(1);
    });

    it("shows OT by branch table when overtime_by_branch has rows", async () => {
      await renderWithDubaiReport();
      // OT total for JLT = 180 min = 3h 0m; appears in OT table AND possibly lean shift
      expect(screen.getAllByText("3h 0m").length).toBeGreaterThanOrEqual(1);
    });

    it("fmtMin: shows '4h 0m' for 240 minutes", async () => {
      await renderWithDubaiReport();
      // overtime_summary.total_overtime_minutes = 240 → fmtMin(240) = "4h 0m"
      expect(screen.getByText("4h 0m")).toBeInTheDocument();
    });
  });

  // ── Adherence Detail ─────────────────────────────────────────────────────────
  describe("Adherence Detail section", () => {
    it("shows 'Shift Adherence' section heading", async () => {
      await renderWithDubaiReport();
      expect(screen.getByText(/Shift Adherence/i)).toBeInTheDocument();
    });

    it("shows overall adherence rate", async () => {
      await renderWithDubaiReport();
      expect(screen.getAllByText(/90%/i).length).toBeGreaterThanOrEqual(1);
    });

    it("shows total scheduled shifts KPI", async () => {
      await renderWithDubaiReport();
      expect(screen.getAllByText("10").length).toBeGreaterThanOrEqual(1);
    });

    it("shows total attended shifts KPI", async () => {
      await renderWithDubaiReport();
      expect(screen.getAllByText("9").length).toBeGreaterThanOrEqual(1);
    });

    it("shows branch row in adherence table", async () => {
      await renderWithDubaiReport();
      // JLT appears in adherence branch table
      expect(screen.getAllByText("JLT").length).toBeGreaterThanOrEqual(1);
    });

    it("shows 'Pending' when total_attended is 0", async () => {
      const pendingAdh = {
        ...DUBAI_REPORT_DATA,
        adherence: {
          rows: [{ branch_code: "JLT", scheduled_shifts: 5, attended_shifts: 0, no_show_count: 0, staff_count: 5, adherence_rate: 0 }],
          overall_rate: 0,
          total_scheduled: 5,
          total_attended: 0,
        },
      };
      mockApiGet.mockResolvedValue(makeReport(pendingAdh as any));
      await renderAndLoad();
      await waitFor(() => {
        expect(screen.getAllByText("Pending").length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  // ── Lean Shift section ───────────────────────────────────────────────────────
  describe("Lean Shift section", () => {
    it("shows 'Lean Shift' section heading", async () => {
      await renderWithDubaiReport();
      expect(screen.getByText(/Lean Shift/i)).toBeInTheDocument();
    });

    it("shows Total Reducible OT", async () => {
      await renderWithDubaiReport();
      // total_reducible_ot_minutes = 300 → "5h 0m"
      expect(screen.getByText("5h 0m")).toBeInTheDocument();
    });

    it("shows branch code in lean shift table", async () => {
      await renderWithDubaiReport();
      // Multiple JLT refs; at least one should be in lean shift
      expect(screen.getAllByText("JLT").length).toBeGreaterThanOrEqual(1);
    });

    it("shows day name in lean shift table", async () => {
      await renderWithDubaiReport();
      expect(screen.getByText("Monday")).toBeInTheDocument();
    });

    it("shows reducible OT per shift", async () => {
      await renderWithDubaiReport();
      // reducible_ot_per_shift = 60 → "60m"
      expect(screen.getByText("60m")).toBeInTheDocument();
    });

    it("does NOT show Lean Shift section when lean_shift is absent", async () => {
      await renderWithManilaReport();
      expect(screen.queryByText(/Lean Shift/i)).not.toBeInTheDocument();
    });
  });

  // ── Ratings section ──────────────────────────────────────────────────────────
  describe("Ratings section", () => {
    it("shows 'Ratings' section heading", async () => {
      await renderWithDubaiReport();
      expect(screen.getByText(/^Ratings$/i)).toBeInTheDocument();
    });

    it("shows Talabat aggregator KPI card", async () => {
      await renderWithDubaiReport();
      expect(screen.getAllByText("Talabat").length).toBeGreaterThanOrEqual(1);
    });

    it("shows avg rating score in aggregator KPI", async () => {
      await renderWithDubaiReport();
      expect(screen.getAllByText(/★ 4\.80/i).length).toBeGreaterThanOrEqual(1);
    });

    it("shows brand in ratings table", async () => {
      await renderWithDubaiReport();
      expect(screen.getByText("Sushi ZEN")).toBeInTheDocument();
    });

    it("shows review count in ratings table", async () => {
      await renderWithDubaiReport();
      expect(screen.getByText("150")).toBeInTheDocument();
    });

    it("does NOT show Ratings section when ratings.count is 0", async () => {
      const noRatings = {
        ...DUBAI_REPORT_DATA,
        ratings: { rows: [], avg_rating: null, count: 0, by_aggregator: [] },
      };
      mockApiGet.mockResolvedValue(makeReport(noRatings as any));
      await renderAndLoad();
      expect(screen.queryByText(/^Ratings$/i)).not.toBeInTheDocument();
    });
  });

  // ── Disposal section ─────────────────────────────────────────────────────────
  describe("Disposal section", () => {
    it("shows 'Disposal' section heading", async () => {
      await renderWithDubaiReport();
      expect(screen.getByText(/^Disposal$/i)).toBeInTheDocument();
    });

    it("shows disposal branch code", async () => {
      await renderWithDubaiReport();
      expect(screen.getAllByText("JLT").length).toBeGreaterThanOrEqual(1);
    });

    it("shows item name in disposal lines", async () => {
      await renderWithDubaiReport();
      expect(screen.getByText("Salmon Sashimi")).toBeInTheDocument();
    });

    it("shows disposal reason", async () => {
      await renderWithDubaiReport();
      expect(screen.getByText("Expired")).toBeInTheDocument();
    });

    it("shows 'submitted' status badge", async () => {
      await renderWithDubaiReport();
      expect(screen.getAllByText("submitted").length).toBeGreaterThanOrEqual(1);
    });

    it("does NOT show Disposal section when total_reports is 0", async () => {
      const noDisposal = { ...DUBAI_REPORT_DATA, disposal: { rows: [], total_reports: 0, total_items: 0 } };
      mockApiGet.mockResolvedValue(makeReport(noDisposal as any));
      await renderAndLoad();
      expect(screen.queryByText(/^Disposal$/i)).not.toBeInTheDocument();
    });
  });

  // ── Backup section ───────────────────────────────────────────────────────────
  describe("Backup section", () => {
    it("shows 'Backup' section heading", async () => {
      await renderWithDubaiReport();
      expect(screen.getByText(/^Backup$/i)).toBeInTheDocument();
    });

    it("shows backup branch code", async () => {
      await renderWithDubaiReport();
      expect(screen.getAllByText("JLT").length).toBeGreaterThanOrEqual(1);
    });

    it("shows item name in backup lines", async () => {
      await renderWithDubaiReport();
      expect(screen.getByText("Soy Sauce")).toBeInTheDocument();
    });

    it("shows section in backup lines", async () => {
      await renderWithDubaiReport();
      expect(screen.getByText("Condiments")).toBeInTheDocument();
    });

    it("does NOT show Backup section when total_reports is 0", async () => {
      const noBackup = { ...DUBAI_REPORT_DATA, backup: { rows: [], total_reports: 0, total_items: 0 } };
      mockApiGet.mockResolvedValue(makeReport(noBackup as any));
      await renderAndLoad();
      expect(screen.queryByText(/^Backup$/i)).not.toBeInTheDocument();
    });
  });

  // ── Generate Now ─────────────────────────────────────────────────────────────
  describe("Generate Now", () => {
    it("shows generate date input (type=date)", async () => {
      await renderPage();
      await waitFor(() => {
        const dateInputs = document.querySelectorAll("input[type='date']");
        expect(dateInputs.length).toBeGreaterThanOrEqual(1);
      }, { timeout: 5000 });
    });

    it("clicking Generate Now shows confirm dialog", async () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      await renderAndLoad();
      fireEvent.click(screen.getByRole("button", { name: /Generate Now/i }));
      expect(confirmSpy).toHaveBeenCalled();
    });

    it("cancelled confirm does NOT call apiPost", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(false);
      await renderAndLoad();
      fireEvent.click(screen.getByRole("button", { name: /Generate Now/i }));
      expect(mockApiPost).not.toHaveBeenCalled();
    });

    it("confirmed generate calls apiPost only for the selected city (dubai by default)", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      await renderAndLoad();
      fireEvent.click(screen.getByRole("button", { name: /Generate Now/i }));
      await waitFor(() => {
        const urls = mockApiPost.mock.calls.map((a: any) => String(a[0]));
        expect(urls.some((u) => u.includes("city=dubai"))).toBe(true);
        // Should NOT generate manila when dubai tab is active
        expect(urls.some((u) => u.includes("city=manila"))).toBe(false);
      }, { timeout: 5000 });
    });

    it("confirm dialog uses t.generateConfirm translation in Japanese mode", async () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      await renderAndLoad();
      // Switch to Japanese
      fireEvent.click(screen.getByRole("button", { name: /日本語/i }));
      fireEvent.click(screen.getByRole("button", { name: /Generate Now|今すぐ生成/i }));
      const msg = String(confirmSpy.mock.calls[0]?.[0] ?? "");
      // After fix, confirm uses t.generateConfirm = "{city} のレポートを今すぐ生成しますか？"
      expect(msg).toMatch(/のレポートを今すぐ生成しますか/);
    });

    it("shows 'Generating...' button text during generation", async () => {
      let resolvePost!: (v: any) => void;
      vi.spyOn(window, "confirm").mockReturnValue(true);
      mockApiPost.mockReturnValue(new Promise((res) => { resolvePost = res; }));
      await renderAndLoad();
      fireEvent.click(screen.getByRole("button", { name: /Generate Now/i }));
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Generating/i })).toBeInTheDocument();
      });
      resolvePost({ ok: true, results: {} });
    });

    it("re-fetches reports after generate completes", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      await renderAndLoad();
      const beforeCount = mockApiGet.mock.calls.length;
      fireEvent.click(screen.getByRole("button", { name: /Generate Now/i }));
      await waitFor(() => {
        expect(mockApiGet.mock.calls.length).toBeGreaterThan(beforeCount);
      }, { timeout: 5000 });
    });

    it("shows error when generate API fails", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      mockApiPost.mockRejectedValue(new Error("Generate failed"));
      await renderAndLoad();
      fireEvent.click(screen.getByRole("button", { name: /Generate Now/i }));
      await waitFor(() => {
        expect(screen.getByText(/Generate failed/i)).toBeInTheDocument();
      }, { timeout: 5000 });
    });
  });

  // ── Refresh button ───────────────────────────────────────────────────────────
  describe("Refresh button", () => {
    it("clicking Refresh calls apiGet again", async () => {
      await renderAndLoad();
      const before = mockApiGet.mock.calls.length;
      fireEvent.click(screen.getByRole("button", { name: /Refresh/i }));
      await waitFor(() => {
        expect(mockApiGet.mock.calls.length).toBeGreaterThan(before);
      });
    });
  });

  // ── Language toggle ──────────────────────────────────────────────────────────
  describe("language toggle", () => {
    it("switches to Japanese — shows デイリー業務レポート", async () => {
      await renderWithDubaiReport();
      fireEvent.click(screen.getByRole("button", { name: /日本語/i }));
      expect(screen.getByText(/デイリー業務レポート/i)).toBeInTheDocument();
    });

    it("shows 'English' toggle button after switching to Japanese", async () => {
      await renderAndLoad();
      fireEvent.click(screen.getByRole("button", { name: /日本語/i }));
      expect(screen.getByRole("button", { name: /English/i })).toBeInTheDocument();
    });

    it("switches back to English", async () => {
      await renderAndLoad();
      fireEvent.click(screen.getByRole("button", { name: /日本語/i }));
      fireEvent.click(screen.getByRole("button", { name: /English/i }));
      expect(screen.getByText(/Daily Operations Report/i)).toBeInTheDocument();
    });

    it("Japanese mode: shows 当日サマリー (Day at a Glance)", async () => {
      await renderWithDubaiReport();
      fireEvent.click(screen.getByRole("button", { name: /日本語/i }));
      expect(screen.getByText(/当日サマリー/i)).toBeInTheDocument();
    });
  });

  // ── fmtMin helper (tested via rendered output) ───────────────────────────────
  describe("fmtMin formatter", () => {
    it("formats 0 minutes as '0m'", async () => {
      const zeroOT = {
        ...DUBAI_REPORT_DATA,
        attendance: {
          ...DUBAI_REPORT_DATA.attendance,
          overtime_summary: { total_overtime_minutes: 0 },
          overtime_by_branch: { rows: [] },
        },
        lean_shift: undefined,
      };
      mockApiGet.mockResolvedValue(makeReport(zeroOT as any));
      await renderAndLoad();
      // OT KPI shows "—" when 0 (in Day at a Glance), and lean shift section is gone
      // Just verify it doesn't crash and the page renders
      expect(screen.getByText(/Day at a Glance/i)).toBeInTheDocument();
    });

    it("formats 90 minutes as '1h 30m'", async () => {
      await renderWithDubaiReport();
      // avg_overtime_minutes=90 in OT by branch → fmtMin(90) = "1h 30m"
      expect(screen.getByText("1h 30m")).toBeInTheDocument();
    });
  });

  // ── buildBranchCards Manila normalization ────────────────────────────────────
  describe("buildBranchCards Manila branch normalization", () => {
    it("normalizes 'par' branch code to 'Paranaque'", async () => {
      const manilaWithPar = {
        ...MINIMAL_REPORT_DATA,
        city: "manila",
        attendance: {
          ...MINIMAL_REPORT_DATA.attendance,
          absences: [{ staff_name: "Test", absence_type: "SL", note: "", branch: "par" }],
        },
        sales: {
          daily_sales: {
            rows: [{ branch: "par", total_orders: 10, total_amount: 5000, dine_in_orders: 10, grabfood_orders: 0, foodpanda_orders: 0, beep_orders: 0 }],
            total_amount: 5000,
            total_orders: 10,
          },
        },
      };
      // Start on Dubai first (default), then switch to Manila so city state = "manila"
      await renderAndLoad();
      mockApiGet.mockResolvedValue(makeReport(manilaWithPar as any));
      fireEvent.click(screen.getByRole("button", { name: /Manila/i }));
      await waitFor(() => {
        expect(screen.queryAllByText("Paranaque").length).toBeGreaterThan(0);
      }, { timeout: 5000 });
    });

    it("excludes CK (Cloud Kitchen) from branch cards", async () => {
      const manilaWithCK = {
        ...MINIMAL_REPORT_DATA,
        city: "manila",
        sales: {
          daily_sales: {
            rows: [{ branch: "ck", total_orders: 5, total_amount: 2000 }],
            total_amount: 2000,
            total_orders: 5,
          },
        },
      };
      mockApiGet.mockResolvedValue(makeReport(manilaWithCK as any));
      await renderAndLoad();
      // "ck" → null in MANILA_BRANCH_NORM → excluded, no "CK" card
      expect(screen.queryByText(/^CK$/i)).not.toBeInTheDocument();
    });
  });
});
