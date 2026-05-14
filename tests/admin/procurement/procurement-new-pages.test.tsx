// tests/admin/procurement/procurement-new-pages.test.tsx
// Tests for 4 procurement pages changed/added in this session:
//   - admin/procurement/page.tsx (root)
//   - price-checks/page.tsx
//   - risk-lab/page.tsx
//   - invoices/page.tsx

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── lucide-react ───────────────────────────────────────────────────────────────
const _icon = () => null;
vi.mock("lucide-react", () => ({
  AlertCircle: _icon, AlertTriangle: _icon, ArrowDown: _icon, ArrowLeft: _icon,
  ArrowUp: _icon, ArrowUpDown: _icon, BarChart3: _icon, Building2: _icon,
  Camera: _icon, CheckCircle: _icon, CheckCircle2: _icon, ChevronDown: _icon,
  ChevronRight: _icon, ChevronUp: _icon, Database: _icon, Download: _icon,
  ExternalLink: _icon, Inbox: _icon, Minus: _icon, Package: _icon, Plus: _icon,
  RefreshCw: _icon, Save: _icon, ScrollText: _icon, Search: _icon, Send: _icon,
  ShieldAlert: _icon, ShieldCheck: _icon, ShoppingCart: _icon, SquarePen: _icon,
  Tag: _icon, TrendingDown: _icon, TrendingUp: _icon, TriangleAlert: _icon,
  Upload: _icon, X: _icon,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/procurement",
  useParams: () => ({}),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, className }: any) => <a href={href} className={className}>{children}</a>,
}));

vi.mock("framer-motion", () => ({
  motion: { div: ({ children, ...p }: any) => <div {...p}>{children}</div> },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock("@/components/DatePicker", () => ({
  default: ({ value, onChange }: any) =>
    <input type="date" value={value} onChange={(e) => onChange(e.target.value)} />,
}));

vi.mock("@/components/MonthPicker", () => ({
  default: ({ value, onChange }: any) =>
    <input type="month" value={value} onChange={(e) => onChange(e.target.value)} />,
}));

vi.mock("@/components/DateRangePicker", () => ({
  default: ({ onFromChange, onToChange }: any) => <div data-testid="date-range-picker" />,
}));

vi.mock("@/components/ProcurementTabs", () => ({
  default: () => <div data-testid="procurement-tabs">ProcurementTabs</div>,
}));

vi.mock("@/components/ProcurementSessionBar", () => ({
  default: () => <div data-testid="session-bar">ProcurementSessionBar</div>,
}));

// ── Auth mock ──────────────────────────────────────────────────────────────────
let mockAuthReturn: any = null;

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getAuth: vi.fn(() => mockAuthReturn),
    refreshAuthFromApi: vi.fn(async () => mockAuthReturn),
    setAuth: vi.fn(),
    hasPermission: vi.fn(() => false),
  };
});

// ── procurementClient mock ─────────────────────────────────────────────────────
let mockProcurementJson = vi.fn(async () => ({ rows: [] }));

vi.mock("@/lib/procurementClient", () => ({
  procurementJson: (...args: any[]) => (mockProcurementJson as any)(...args),
  defaultProcurementName: vi.fn(() => "Jay"),
  defaultProcurementPin: vi.fn(() => "1234"),
  procurementTokenHeaders: vi.fn(async () => ({ Authorization: "Bearer tok" })),
  saveProcurementSession: vi.fn(),
  clearProcurementSession: vi.fn(),
}));

// ── Auth fixtures ──────────────────────────────────────────────────────────────
const HQ_AUTH = { accessToken: "tok", role: "HQ", city: "manila", staffName: "Jay", permissions: ["*"], pin: "1234" };
const DUBAI_AUTH = { accessToken: "tok", role: "DUBAI_MANAGEMENT", city: "dubai", staffName: "Ahmed", permissions: [], pin: "5678" };
const NO_AUTH = { accessToken: "tok", role: "STAFF", city: "manila", staffName: "Bob", permissions: [], pin: "" };

// ── global.fetch helper ────────────────────────────────────────────────────────
function makeFetch(body: unknown = { rows: [], summary: null }, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

// ════════════════════════════════════════════════════════════════════════════════
// Root AdminProcurementPage
// ════════════════════════════════════════════════════════════════════════════════
describe("AdminProcurementPage (root)", () => {
  let Page: React.ComponentType;

  beforeEach(async () => {
    vi.resetModules();
    vi.mock("@/lib/auth", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/auth")>();
      return {
        ...actual,
        getAuth: vi.fn(() => mockAuthReturn),
        refreshAuthFromApi: vi.fn(async () => mockAuthReturn),
        setAuth: vi.fn(),
        hasPermission: vi.fn(() => false),
      };
    });
    vi.mock("@/lib/procurementClient", () => ({
      procurementJson: (...args: any[]) => (mockProcurementJson as any)(...args),
      defaultProcurementName: vi.fn(() => "Jay"),
      defaultProcurementPin: vi.fn(() => "1234"),
      procurementTokenHeaders: vi.fn(async () => ({ Authorization: "Bearer tok" })),
      saveProcurementSession: vi.fn(),
      clearProcurementSession: vi.fn(),
    }));
    const mod = await import("@/app/admin/procurement/page");
    Page = mod.default;
    mockProcurementJson = vi.fn(async () => ({ rows: [] }));
    // Default: fetch succeeds with empty data
    global.fetch = makeFetch({ rows: [], summary: null });
  });

  it("shows access denied for NO_AUTH user", async () => {
    mockAuthReturn = NO_AUTH;
    render(<Page />);
    await screen.findByText(/Procurement Control is only available to authorized admin roles/i);
  });

  it("renders 'Procurement Control' heading for HQ_AUTH", async () => {
    mockAuthReturn = HQ_AUTH;
    global.fetch = makeFetch({ rows: [], summary: null });
    render(<Page />);
    await screen.findByText("Procurement Control");
  });

  it("shows 'No requests.' when fetch returns empty rows", async () => {
    mockAuthReturn = HQ_AUTH;
    global.fetch = makeFetch({ rows: [], summary: null });
    render(<Page />);
    await screen.findByText("No requests.");
  });

  it("shows KPI labels in cards section", async () => {
    mockAuthReturn = HQ_AUTH;
    global.fetch = makeFetch({ rows: [], summary: null });
    render(<Page />);
    // Wait for Procurement Control heading (page is allowed and rendered)
    await screen.findByText("Procurement Control");
    // All four KPI card labels should be present (may be multiple "Requests" elements)
    const allElements = screen.getAllByText("Requests");
    expect(allElements.length).toBeGreaterThan(0);
    expect(screen.getByText("Approval Inbox")).toBeInTheDocument();
    expect(screen.getByText("Open Exceptions")).toBeInTheDocument();
    expect(screen.getByText("Staff Count")).toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// ProcurementPriceChecksPage
// ════════════════════════════════════════════════════════════════════════════════
describe("ProcurementPriceChecksPage", () => {
  let Page: React.ComponentType;

  beforeEach(async () => {
    vi.resetModules();
    vi.mock("@/lib/auth", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/auth")>();
      return {
        ...actual,
        getAuth: vi.fn(() => mockAuthReturn),
        refreshAuthFromApi: vi.fn(async () => mockAuthReturn),
        setAuth: vi.fn(),
        hasPermission: vi.fn(() => false),
      };
    });
    vi.mock("@/lib/procurementClient", () => ({
      procurementJson: (...args: any[]) => (mockProcurementJson as any)(...args),
      defaultProcurementName: vi.fn(() => "Jay"),
      defaultProcurementPin: vi.fn(() => "1234"),
      procurementTokenHeaders: vi.fn(async () => ({ Authorization: "Bearer tok" })),
      saveProcurementSession: vi.fn(),
      clearProcurementSession: vi.fn(),
    }));
    const mod = await import("@/app/admin/procurement/price-checks/page");
    Page = mod.default;
    mockProcurementJson = vi.fn(async () => ({ rows: [], variances: [], changes: [] }));
  });

  it("shows access denied for NO_AUTH user", async () => {
    mockAuthReturn = NO_AUTH;
    render(<Page />);
    await screen.findByText(/Price Checks are only available to authorized admin roles/i);
  });

  it("renders without error for HQ_AUTH", async () => {
    mockAuthReturn = HQ_AUTH;
    render(<Page />);
    // Should not show access denied
    await waitFor(() => {
      expect(screen.queryByText(/only available to authorized admin roles/i)).toBeNull();
    });
  });

  it("shows tab button '① Invoice vs PO Variance'", async () => {
    mockAuthReturn = HQ_AUTH;
    render(<Page />);
    await screen.findByText(/① Invoice vs PO Variance/i);
  });

  it("shows tab button '② Price Change History'", async () => {
    mockAuthReturn = HQ_AUTH;
    render(<Page />);
    await screen.findByText(/② Price Change History/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// ProcurementRiskLabPage
// ════════════════════════════════════════════════════════════════════════════════
describe("ProcurementRiskLabPage", () => {
  let Page: React.ComponentType;

  beforeEach(async () => {
    vi.resetModules();
    vi.mock("@/lib/auth", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/auth")>();
      return {
        ...actual,
        getAuth: vi.fn(() => mockAuthReturn),
        refreshAuthFromApi: vi.fn(async () => mockAuthReturn),
        setAuth: vi.fn(),
        hasPermission: vi.fn(() => false),
      };
    });
    vi.mock("@/lib/procurementClient", () => ({
      procurementJson: (...args: any[]) => (mockProcurementJson as any)(...args),
      defaultProcurementName: vi.fn(() => "Jay"),
      defaultProcurementPin: vi.fn(() => "1234"),
      procurementTokenHeaders: vi.fn(async () => ({ Authorization: "Bearer tok" })),
      saveProcurementSession: vi.fn(),
      clearProcurementSession: vi.fn(),
    }));
    const mod = await import("@/app/admin/procurement/risk-lab/page");
    Page = mod.default;
    mockProcurementJson = vi.fn(async () => ({ rows: [] }));
  });

  it("shows access denied for NO_AUTH user", async () => {
    mockAuthReturn = NO_AUTH;
    render(<Page />);
    await screen.findByText(/Risk Lab is only available to authorized admin roles/i);
  });

  it("renders 'Risk Lab' heading for HQ_AUTH", async () => {
    mockAuthReturn = HQ_AUTH;
    render(<Page />);
    await screen.findByText("Risk Lab");
  });

  it("shows 'Risk Threshold Settings' section", async () => {
    mockAuthReturn = HQ_AUTH;
    render(<Page />);
    await screen.findByText("Risk Threshold Settings");
  });

  it("shows error when procurementJson throws", async () => {
    mockAuthReturn = HQ_AUTH;
    mockProcurementJson = vi.fn(async () => { throw new Error("Risk Lab load error"); });
    render(<Page />);
    await screen.findByText("Risk Lab load error");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// ProcurementInvoicesPage
// ════════════════════════════════════════════════════════════════════════════════
describe("ProcurementInvoicesPage", () => {
  let Page: React.ComponentType;

  beforeEach(async () => {
    vi.resetModules();
    vi.mock("@/lib/auth", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/auth")>();
      return {
        ...actual,
        getAuth: vi.fn(() => mockAuthReturn),
        refreshAuthFromApi: vi.fn(async () => mockAuthReturn),
        setAuth: vi.fn(),
        hasPermission: vi.fn(() => false),
      };
    });
    vi.mock("@/lib/procurementClient", () => ({
      procurementJson: (...args: any[]) => (mockProcurementJson as any)(...args),
      defaultProcurementName: vi.fn(() => "Jay"),
      defaultProcurementPin: vi.fn(() => "1234"),
      procurementTokenHeaders: vi.fn(async () => ({ Authorization: "Bearer tok" })),
      saveProcurementSession: vi.fn(),
      clearProcurementSession: vi.fn(),
    }));
    const mod = await import("@/app/admin/procurement/invoices/page");
    Page = mod.default;
    mockProcurementJson = vi.fn(async () => ({ rows: [], quality_summary: null }));
  });

  it("shows access denied for NO_AUTH user", async () => {
    mockAuthReturn = NO_AUTH;
    render(<Page />);
    await screen.findByText(/Invoice Hub is only available to authorized procurement admin roles/i);
  });

  it("renders 'Supplier Invoice Hub' heading for HQ_AUTH", async () => {
    mockAuthReturn = HQ_AUTH;
    render(<Page />);
    await screen.findByText("Supplier Invoice Hub");
  });

  it("shows 'Valid Data' tab button", async () => {
    mockAuthReturn = HQ_AUTH;
    render(<Page />);
    await screen.findByText(/Valid Data/i);
  });

  it("shows 'Problem Data' tab button", async () => {
    mockAuthReturn = HQ_AUTH;
    render(<Page />);
    await screen.findByText(/Problem Data/i);
  });
});
