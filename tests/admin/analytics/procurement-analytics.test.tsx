// tests/admin/analytics/procurement-analytics.test.tsx
// Tests for src/app/admin/analytics/procurement/page.tsx
// Covers: auth guard, market initialization, data rendering, error display.
// Uses STATIC imports — avoids the jsdom collection-phase hang that occurs
// when the lucide-react Proxy mock is combined with dynamic imports.

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Next.js mocks ─────────────────────────────────────────────────────────────
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/analytics?tab=procurement",
  useParams: () => ({}),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, className }: any) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...p }: any) => <div {...p}>{children}</div>,
    section: ({ children, ...p }: any) => <section {...p}>{children}</section>,
    button: ({ children, ...p }: any) => <button {...p}>{children}</button>,
    span: ({ children, ...p }: any) => <span {...p}>{children}</span>,
    p: ({ children, ...p }: any) => <p {...p}>{children}</p>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock("recharts", () => ({
  LineChart: ({ children }: any) => <div>{children}</div>,
  Line: () => null,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
}));

// lucide-react: explicit names only — Proxy mock deadlocks with static imports
vi.mock("lucide-react", () => ({
  BarChart2: () => null,
  RefreshCw: () => null,
  ChevronDown: () => null,
  ChevronRight: () => null,
  Search: () => null,
  Download: () => null,
  AlertTriangle: () => null,
  CheckCircle2: () => null,
  XCircle: () => null,
  Clock: () => null,
  Calendar: () => null,
  Info: () => null,
  Filter: () => null,
}));

vi.mock("@/components/DateRangePicker", () => ({
  default: () => <div data-testid="date-range-picker" />,
}));

vi.mock("@/components/procurement/ItemSearchInput", () => ({
  default: () => <div data-testid="item-search" />,
}));

vi.mock("@/components/procurement/SupplierSearchInput", () => ({
  default: () => <div data-testid="supplier-search" />,
}));

vi.mock("@/components/ui/Spinner", () => ({
  Spinner: () => <div data-testid="spinner" />,
}));
vi.mock("@/components/ui/EmptyState", () => ({
  EmptyState: ({ message }: any) => <div>{message}</div>,
}));
vi.mock("@/components/ui/FlashValue", () => ({
  FlashValue: ({ value }: any) => <span>{value}</span>,
}));

// ── Auth mock ─────────────────────────────────────────────────────────────────
let mockAuthReturn: any = null;

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getAuth: vi.fn(() => mockAuthReturn),
    refreshAuthFromApi: vi.fn(async () => mockAuthReturn),
    setAuth: vi.fn(),
    canAccessProcurementAdmin: vi.fn((role: string, market: string) => {
      if (role === "HQ") return true;
      if (role === "DUBAI_MANAGEMENT" && market === "dubai") return true;
      if (role === "MANILA_MANAGEMENT" && market === "manila") return true;
      return false;
    }),
  };
});

// ── procurementClient mock ────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockProcurementJson: ReturnType<typeof vi.fn> = vi.fn(async () => ({
  ok: true, rows: [], summary: null,
  supplier_rows: [], item_rows: [], monthly_rows: [],
}));

vi.mock("@/lib/procurementClient", () => ({
  procurementJson: (...args: any[]) => (mockProcurementJson as (...a: any[]) => any)(...args),
  defaultProcurementName: vi.fn(() => "Jay"),
  defaultProcurementPin: vi.fn(() => "1234"),
  saveProcurementSession: vi.fn(),
  clearProcurementSession: vi.fn(),
}));

// ── Auth fixtures ─────────────────────────────────────────────────────────────
const HQ_AUTH = {
  accessToken: "tok", role: "HQ", city: "manila",
  staffName: "Jay", permissions: ["*"], pin: "1234",
};

const DUBAI_AUTH = {
  accessToken: "tok", role: "DUBAI_MANAGEMENT", city: "dubai",
  staffName: "Ahmed", permissions: [], pin: "5678",
};

const NO_AUTH = {
  accessToken: "tok", role: "STAFF", city: "manila",
  staffName: "Bob", permissions: [], pin: "",
};

// ── Static import ─────────────────────────────────────────────────────────────
import ProcurementAnalyticsPage from "@/app/admin/analytics/procurement/page";

// ════════════════════════════════════════════════════════════════════════════════
// ProcurementAnalyticsPage
// ════════════════════════════════════════════════════════════════════════════════
describe("ProcurementAnalyticsPage", () => {
  beforeEach(() => {
    mockProcurementJson = vi.fn(async () => ({
      ok: true, rows: [], summary: null,
      supplier_rows: [], item_rows: [], monthly_rows: [],
    }));
  });

  it("shows access denied for STAFF role", async () => {
    mockAuthReturn = NO_AUTH;
    render(<ProcurementAnalyticsPage />);
    await screen.findByText(/authorized procurement admin roles/i);
  });

  it("shows content for HQ user (no access-denied message)", async () => {
    mockAuthReturn = HQ_AUTH;
    mockProcurementJson = vi.fn(async () => ({
      ok: true,
      market: "manila",
      summary: {
        invoice_count: 10, line_count: 50, supplier_count: 5,
        grand_total: 100000, vat_total: 12000, excise_total: 0,
        latest_invoice_date: "2026-05-10",
      },
      supplier_rows: [], item_rows: [], monthly_rows: [],
    }));
    render(<ProcurementAnalyticsPage />);
    await waitFor(() => {
      expect(screen.queryByText(/authorized procurement admin roles/i)).not.toBeInTheDocument();
    });
  });

  it("shows content for DUBAI_MANAGEMENT on dubai market", async () => {
    mockAuthReturn = DUBAI_AUTH;
    mockProcurementJson = vi.fn(async () => ({
      ok: true,
      market: "dubai",
      summary: {
        invoice_count: 5, line_count: 20, supplier_count: 3,
        grand_total: 50000, vat_total: 5000, excise_total: 500,
        latest_invoice_date: "2026-05-09",
      },
      supplier_rows: [], item_rows: [], monthly_rows: [],
    }));
    render(<ProcurementAnalyticsPage />);
    await waitFor(() => {
      expect(screen.queryByText(/authorized procurement admin roles/i)).not.toBeInTheDocument();
    });
  });

  it("shows error message when API fails", async () => {
    mockAuthReturn = HQ_AUTH;
    mockProcurementJson = vi.fn(async () => {
      throw new Error("Procurement analytics API error");
    });
    render(<ProcurementAnalyticsPage />);
    await screen.findByText("Procurement analytics API error");
  });

  it("shows market selector (Manila / Dubai)", async () => {
    mockAuthReturn = HQ_AUTH;
    render(<ProcurementAnalyticsPage />);
    await waitFor(() => {
      const options = screen.queryAllByText(/manila/i);
      expect(options.length).toBeGreaterThan(0);
    });
  });

  it("shows invoice count KPI when data loads", async () => {
    mockAuthReturn = HQ_AUTH;
    mockProcurementJson = vi.fn(async (url: string) => {
      if (url.includes("/overview"))
        return {
          ok: true,
          market: "manila",
          summary: {
            invoice_count: 42, line_count: 200, supplier_count: 10,
            grand_total: 500000, vat_total: 60000, excise_total: 0,
            latest_invoice_date: "2026-05-10",
          },
          supplier_rows: [], item_rows: [], monthly_rows: [],
        };
      return { ok: true, rows: [] };
    });
    render(<ProcurementAnalyticsPage />);
    await screen.findByText("42");
  });
});
