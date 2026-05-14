// tests/admin/procurement/procurement-admin-pages.test.tsx
// Tests for admin/ops pages:
//   - quotes/page.tsx
//   - pos/page.tsx
//   - approval-matrix/page.tsx
//   - items/page.tsx
//   - kpi/page.tsx
//   - whitelist/page.tsx
//   - scorecards/page.tsx
//   - imports/page.tsx

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
  default: ({ value, onChange }: any) => <div data-testid="date-range-picker" />,
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

// ════════════════════════════════════════════════════════════════════════════════
// ProcurementQuotesPage
// ════════════════════════════════════════════════════════════════════════════════
describe("ProcurementQuotesPage", () => {
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
    const mod = await import("@/app/admin/procurement/quotes/page");
    Page = mod.default;
    mockProcurementJson = vi.fn(async () => ({ rows: [] }));
  });

  it("shows access denied for NO_AUTH user", async () => {
    mockAuthReturn = NO_AUTH;
    render(<Page />);
    await screen.findByText(/Procurement quotes is only available to authorized admin roles/i);
  });

  it("shows empty state 'No requests found.' for HQ_AUTH", async () => {
    mockAuthReturn = HQ_AUTH;
    render(<Page />);
    await screen.findByText("No requests found.");
  });

  it("shows request_no when procurementJson returns rows", async () => {
    mockAuthReturn = HQ_AUTH;
    mockProcurementJson = vi.fn(async (url: string) => {
      if (url.includes("/requests")) return { rows: [{ id: "r1", request_no: "PR-001", store_code: "MNL-01", request_date: "2026-05-01", status: "SUBMITTED", total_amount: 5000 }] };
      return { rows: [] };
    });
    render(<Page />);
    await screen.findByText("PR-001");
  });

  it("shows error message when procurementJson throws", async () => {
    mockAuthReturn = HQ_AUTH;
    mockProcurementJson = vi.fn(async () => { throw new Error("Quotes load error"); });
    render(<Page />);
    await screen.findByText("Quotes load error");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// ProcurementPosPage
// ════════════════════════════════════════════════════════════════════════════════
describe("ProcurementPosPage", () => {
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
    const mod = await import("@/app/admin/procurement/pos/page");
    Page = mod.default;
    mockProcurementJson = vi.fn(async () => ({ rows: [] }));
  });

  it("shows access denied for NO_AUTH user", async () => {
    mockAuthReturn = NO_AUTH;
    render(<Page />);
    await screen.findByText(/Procurement PO management is only available to authorized admin roles/i);
  });

  it("shows empty state 'No purchase orders.' for HQ_AUTH", async () => {
    mockAuthReturn = HQ_AUTH;
    render(<Page />);
    await screen.findByText(/No purchase orders/i);
  });

  it("shows vendor_name when PO row returned", async () => {
    mockAuthReturn = HQ_AUTH;
    mockProcurementJson = vi.fn(async (url: string) => {
      if (url.includes("/pos/item-catalog")) return { request: undefined, suppliers: [] };
      if (url.includes("/pos")) return {
        rows: [{
          id: "po-1", request_id: "r-1", parent_case_no: "PC-001", po_no: "PO-001",
          vendor_name: "VendorABC", amount: 5000, status: "CREATED",
          drive_file_url: "", last_email_status: "", last_recipient_email: "",
          last_email_sent_at: "", receipt_confirmed_at: "", receipt_confirmed_by: "", created_at: "",
        }]
      };
      return { rows: [] };
    });
    render(<Page />);
    // Wait for the page to become accessible (allowed = true)
    const input = await screen.findByPlaceholderText("Request ID");
    fireEvent.change(input, { target: { value: "r-1" } });
    const loadBtn = screen.getByRole("button", { name: /Load Request/i });
    fireEvent.click(loadBtn);
    await screen.findByText(/VendorABC/i);
  });

  it("shows error message when procurementJson throws", async () => {
    mockAuthReturn = HQ_AUTH;
    mockProcurementJson = vi.fn(async () => { throw new Error("PO load error"); });
    render(<Page />);
    // Wait for the page to become accessible (allowed = true)
    const input = await screen.findByPlaceholderText("Request ID");
    fireEvent.change(input, { target: { value: "r-bad" } });
    const loadBtn = screen.getByRole("button", { name: /Load Request/i });
    fireEvent.click(loadBtn);
    await screen.findByText("PO load error");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// ProcurementApprovalMatrixPage
// ════════════════════════════════════════════════════════════════════════════════
describe("ProcurementApprovalMatrixPage", () => {
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
    const mod = await import("@/app/admin/procurement/approval-matrix/page");
    Page = mod.default;
    mockProcurementJson = vi.fn(async () => ({ rows: [] }));
  });

  it("shows access denied for NO_AUTH user", async () => {
    mockAuthReturn = NO_AUTH;
    render(<Page />);
    await screen.findByText(/Approval matrix is only available to authorized admin roles/i);
  });

  it("shows empty state for HQ_AUTH", async () => {
    mockAuthReturn = HQ_AUTH;
    render(<Page />);
    await screen.findByText(/No matrix rows/i);
  });

  it("shows matrix row level when rows returned", async () => {
    mockAuthReturn = HQ_AUTH;
    mockProcurementJson = vi.fn(async () => ({
      rows: [{
        id: "mx-1", level_no: 1, min_amount: 0, max_amount: 10000,
        required_roles_json: ["MANAGER"], is_active: true,
      }]
    }));
    render(<Page />);
    // Level badge shows as L1
    await screen.findByText("L1");
  });

  it("shows success banner after save", async () => {
    mockAuthReturn = HQ_AUTH;
    // First call (load) returns empty, subsequent call (save) returns success
    let callCount = 0;
    mockProcurementJson = vi.fn(async () => {
      callCount++;
      return { rows: [] };
    });
    render(<Page />);
    await screen.findByText(/No matrix rows/i);
    // Click Save
    const saveBtn = screen.getByRole("button", { name: /Save Approval Matrix/i });
    fireEvent.click(saveBtn);
    await screen.findByText("Approval matrix saved.");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// ProcurementItemsPage
// ════════════════════════════════════════════════════════════════════════════════
describe("ProcurementItemsPage", () => {
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
    const mod = await import("@/app/admin/procurement/items/page");
    Page = mod.default;
    mockProcurementJson = vi.fn(async () => ({ rows: [] }));
  });

  it("shows access denied for NO_AUTH user", async () => {
    mockAuthReturn = NO_AUTH;
    render(<Page />);
    await screen.findByText(/Item benchmarks are only available to authorized admin roles/i);
  });

  it("shows empty state 'No item benchmarks found.' for HQ_AUTH", async () => {
    mockAuthReturn = HQ_AUTH;
    render(<Page />);
    await screen.findByText("No item benchmarks found.");
  });

  it("shows item_name when rows returned", async () => {
    mockAuthReturn = HQ_AUTH;
    mockProcurementJson = vi.fn(async () => ({
      rows: [{
        id: "item-1", item_name: "Salmon", category: "Fish", unit: "kg",
        min_unit_price: 10, max_unit_price: 20, preferred_vendor: "FishCo",
        city: "manila", is_active: true,
      }]
    }));
    render(<Page />);
    await screen.findByText("Salmon");
  });

  it("shows edit/new benchmark panel heading when item clicked", async () => {
    mockAuthReturn = HQ_AUTH;
    mockProcurementJson = vi.fn(async () => ({ rows: [] }));
    render(<Page />);
    await screen.findByText("No item benchmarks found.");
    // The 'New Benchmark' button or panel should be accessible
    const newBtn = screen.queryByText(/New Benchmark/i) || screen.queryByText(/Add Benchmark/i);
    expect(newBtn).not.toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// ProcurementKpiPage
// ════════════════════════════════════════════════════════════════════════════════
describe("ProcurementKpiPage", () => {
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
    const mod = await import("@/app/admin/procurement/kpi/page");
    Page = mod.default;
    mockProcurementJson = vi.fn(async () => ({ summary: null, staff_rows: [], store_rows: [] }));
  });

  it("shows access denied for NO_AUTH user", async () => {
    mockAuthReturn = NO_AUTH;
    render(<Page />);
    await screen.findByText(/KPI dashboard is only available to authorized admin roles/i);
  });

  it("shows 'No staff KPI rows for this month.' when empty", async () => {
    mockAuthReturn = HQ_AUTH;
    render(<Page />);
    await screen.findByText("No staff KPI rows for this month.");
  });

  it("shows 'No store KPI rows for this month.' when empty", async () => {
    mockAuthReturn = HQ_AUTH;
    render(<Page />);
    await screen.findByText("No store KPI rows for this month.");
  });

  it("renders KPI card labels", async () => {
    mockAuthReturn = HQ_AUTH;
    render(<Page />);
    await screen.findByText("Overall Score");
    expect(screen.getByText("Receiving Delay")).toBeInTheDocument();
    expect(screen.getByText("Variance Rate")).toBeInTheDocument();
    expect(screen.getByText("Payment Compliance")).toBeInTheDocument();
  });

  it("shows owner_name when staff rows returned", async () => {
    mockAuthReturn = HQ_AUTH;
    mockProcurementJson = vi.fn(async () => ({
      summary: { score_total: 85, grade: "A", receiving_delay_rate: 5, variance_rate: 2, claim_rate: 1, payment_compliance_rate: 95, hold_release_lead_hours: 2, request_count: 10, staff_count: 3 },
      staff_rows: [{ owner_name: "Alice", score_total: 90, grade: "A", receiving_delay_rate: 3, variance_rate: 1, payment_compliance_rate: 98, requests_count: 5 }],
      store_rows: [],
    }));
    render(<Page />);
    await screen.findByText("Alice");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// ProcurementWhitelistPage
// ════════════════════════════════════════════════════════════════════════════════
describe("ProcurementWhitelistPage", () => {
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
    const mod = await import("@/app/admin/procurement/whitelist/page");
    Page = mod.default;
    mockProcurementJson = vi.fn(async () => ({ rows: [] }));
  });

  it("shows access denied for NO_AUTH user", async () => {
    mockAuthReturn = NO_AUTH;
    render(<Page />);
    await screen.findByText(/Emergency whitelist is only available to authorized admin roles/i);
  });

  it("shows 'No whitelist entries.' when empty", async () => {
    mockAuthReturn = HQ_AUTH;
    render(<Page />);
    await screen.findByText("No whitelist entries.");
  });

  it("shows 'No stockout risk rows for this snapshot.' when empty", async () => {
    mockAuthReturn = HQ_AUTH;
    render(<Page />);
    await screen.findByText("No stockout risk rows for this snapshot.");
  });

  it("shows whitelist entry reason when rows returned", async () => {
    mockAuthReturn = HQ_AUTH;
    // Pre-configure mock before render so the initial load() returns whitelist rows
    mockProcurementJson = vi.fn(async (url: string) => {
      if (String(url).includes("/whitelist?")) {
        return {
          rows: [{
            id: "wl-1", scope_type: "ITEM", scope_key: "salmon-01", vendor_code: "FishCo",
            item_code: "salmon-01", store_code: "MNL-01", reason: "Emergency restock",
            approver_name: "Jay", approver_role: "HQ", start_date: "2026-05-01",
            end_date: "2026-06-01", sla_hours: 48, active: true,
          }]
        };
      }
      return { rows: [] };
    });
    render(<Page />);
    await screen.findByText("Emergency restock");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// ProcurementScorecardsPage
// ════════════════════════════════════════════════════════════════════════════════
describe("ProcurementScorecardsPage", () => {
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
    const mod = await import("@/app/admin/procurement/scorecards/page");
    Page = mod.default;
    mockProcurementJson = vi.fn(async () => ({ rows: [] }));
  });

  it("shows access denied for NO_AUTH user", async () => {
    mockAuthReturn = NO_AUTH;
    render(<Page />);
    await screen.findByText(/Scorecards are only available to authorized admin roles/i);
  });

  it("shows 'No improvement actions.' when empty", async () => {
    mockAuthReturn = HQ_AUTH;
    render(<Page />);
    await screen.findByText("No improvement actions.");
  });

  it("shows owner_name when scorecard rows returned", async () => {
    mockAuthReturn = HQ_AUTH;
    mockProcurementJson = vi.fn(async (url: string) => {
      if (url.includes("/kpi/staff")) {
        return {
          rows: [{
            id: "sc-1", month_key: "2026-05", owner_name: "Carlos",
            score_total: 88, grade: "B", receiving_delay_rate: 4,
            variance_rate: 3, claim_rate: 2, payment_compliance_rate: 92,
          }]
        };
      }
      return { rows: [] };
    });
    render(<Page />);
    await screen.findByText("Carlos");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// ProcurementImportsPage
// ════════════════════════════════════════════════════════════════════════════════
describe("ProcurementImportsPage", () => {
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
    const mod = await import("@/app/admin/procurement/imports/page");
    Page = mod.default;
    mockProcurementJson = vi.fn(async () => ({ rows: [] }));
  });

  it("shows access denied for NO_AUTH user", async () => {
    mockAuthReturn = NO_AUTH;
    render(<Page />);
    await screen.findByText(/authorized admin roles/i);
  });

  it("renders without crash for HQ_AUTH", async () => {
    mockAuthReturn = HQ_AUTH;
    render(<Page />);
    // Should not show access denied
    await waitFor(() => {
      expect(screen.queryByText(/only available.*authorized admin roles/i)).toBeNull();
    });
  });

  it("shows table headers: Date, Store, Item", async () => {
    mockAuthReturn = HQ_AUTH;
    render(<Page />);
    await screen.findByText("Date");
    expect(screen.getByText("Store")).toBeInTheDocument();
    expect(screen.getByText("Item")).toBeInTheDocument();
    // "Supplier" may appear multiple times; just check at least one exists
    expect(screen.getAllByText("Supplier").length).toBeGreaterThan(0);
  });
});
