// tests/admin/procurement/procurement-pages.test.tsx
// Tests for key procurement pages:
//   - approval-inbox/page.tsx
//   - exceptions/page.tsx (city hardcode bug)
//   - audit/page.tsx
//   - dashboard/page.tsx
// Covers: auth guard, data rendering, bug regressions, error display.

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildFetchMock, buildFailFetch } from "../../helpers/fetch-mock";

// ── Next.js mocks ─────────────────────────────────────────────────────────────
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/procurement",
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
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const _icon = () => null;
vi.mock("lucide-react", () => ({
  AlertCircle: _icon,
  AlertTriangle: _icon,
  ArrowDown: _icon,
  ArrowLeft: _icon,
  ArrowUp: _icon,
  ArrowUpDown: _icon,
  BarChart3: _icon,
  Building2: _icon,
  Camera: _icon,
  CheckCircle: _icon,
  CheckCircle2: _icon,
  ChevronDown: _icon,
  ChevronRight: _icon,
  ChevronUp: _icon,
  Database: _icon,
  Download: _icon,
  ExternalLink: _icon,
  Inbox: _icon,
  Minus: _icon,
  Package: _icon,
  Plus: _icon,
  RefreshCw: _icon,
  Save: _icon,
  ScrollText: _icon,
  Search: _icon,
  Send: _icon,
  ShieldAlert: _icon,
  ShieldCheck: _icon,
  ShoppingCart: () => <span data-testid="cart-icon" />,
  SquarePen: _icon,
  Tag: _icon,
  TrendingDown: _icon,
  TrendingUp: _icon,
  TriangleAlert: _icon,
  Upload: _icon,
  X: _icon,
}));

vi.mock("@/components/DatePicker", () => ({
  default: ({ value, onChange }: any) => (
    <input type="date" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

vi.mock("@/components/MonthPicker", () => ({
  default: ({ value, onChange }: any) => (
    <input type="month" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

vi.mock("@/components/ProcurementTabs", () => ({
  default: () => <div data-testid="procurement-tabs">ProcurementTabs</div>,
}));

vi.mock("@/components/ProcurementSessionBar", () => ({
  default: () => <div data-testid="session-bar">ProcurementSessionBar</div>,
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
    hasPermission: vi.fn(() => false),
  };
});

// ── procurementClient mock ────────────────────────────────────────────────────
let mockProcurementJson = vi.fn(async () => ({ rows: [] }));

vi.mock("@/lib/procurementClient", () => ({
  procurementJson: (...args: any[]) => (mockProcurementJson as (...a: any[]) => any)(...args),
  defaultProcurementName: vi.fn(() => "Jay"),
  defaultProcurementPin: vi.fn(() => "1234"),
  saveProcurementSession: vi.fn(),
  clearProcurementSession: vi.fn(),
}));

// ── Auth fixtures ─────────────────────────────────────────────────────────────
const HQ_AUTH = {
  accessToken: "tok",
  role: "HQ",
  city: "manila",
  staffName: "Jay",
  permissions: ["*"],
  pin: "1234",
};

const DUBAI_AUTH = {
  accessToken: "tok",
  role: "DUBAI_MANAGEMENT",
  city: "dubai",
  staffName: "Ahmed",
  permissions: [],
  pin: "5678",
};

const NO_AUTH = {
  accessToken: "tok",
  role: "STAFF",
  city: "manila",
  staffName: "Bob",
  permissions: [],
  pin: "",
};

// ════════════════════════════════════════════════════════════════════════════════
// Approval Inbox
// ════════════════════════════════════════════════════════════════════════════════
describe("ProcurementApprovalInboxPage", () => {
  let ApprovalInboxPage: React.ComponentType;

  beforeEach(async () => {
    vi.resetModules();
    vi.mock("@/lib/auth", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/auth")>();
      return {
        ...actual,
        getAuth: vi.fn(() => mockAuthReturn),
        refreshAuthFromApi: vi.fn(async () => mockAuthReturn),
        setAuth: vi.fn(),
      };
    });
    vi.mock("@/lib/procurementClient", () => ({
      procurementJson: (...args: any[]) => (mockProcurementJson as (...a: any[]) => any)(...args),
      defaultProcurementName: vi.fn(() => "Jay"),
      defaultProcurementPin: vi.fn(() => "1234"),
      saveProcurementSession: vi.fn(),
    }));
    const mod = await import("@/app/admin/procurement/approval-inbox/page");
    ApprovalInboxPage = mod.default;
    mockProcurementJson = vi.fn(async () => ({ rows: [] }));
  });

  it("shows access denied when user is not authorized", async () => {
    mockAuthReturn = NO_AUTH;
    render(<ApprovalInboxPage />);
    await screen.findByText(/Procurement approval inbox is only available to authorized admin roles/i);
  });

  it("shows case list when HQ user is authorized", async () => {
    mockAuthReturn = HQ_AUTH;
    mockProcurementJson = vi.fn(async () => ({
      rows: [
        {
          id: "case-1",
          parent_case_no: "PC-001",
          request_no: "PR-001",
          requested_by: "Alice",
          store_code: "MNL-01",
          total_amount: 5000,
          severity: "MEDIUM",
          status: "IN_REVIEW",
          current_assignee_role: "MANAGER",
          claimed_by: "",
          document_status: "PENDING",
          po_status: "PENDING",
          notification_failed_count: 0,
        },
      ],
    }));
    render(<ApprovalInboxPage />);
    await screen.findByText("PC-001");
    // "Alice" is part of "Alice | MNL-01 | MEDIUM | IN_REVIEW" — use regex
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
  });

  it("shows 'No approval cases' when list is empty", async () => {
    mockAuthReturn = HQ_AUTH;
    mockProcurementJson = vi.fn(async () => ({ rows: [] }));
    render(<ApprovalInboxPage />);
    await screen.findByText("No pending approval cases.");
  });

  it("shows error message when API call fails", async () => {
    mockAuthReturn = HQ_AUTH;
    mockProcurementJson = vi.fn(async () => {
      throw new Error("Server error loading cases");
    });
    render(<ApprovalInboxPage />);
    await screen.findByText("Server error loading cases");
  });

  it("[FIXED] error message says 'authorized admin roles' not 'Manila admin roles'", async () => {
    mockAuthReturn = NO_AUTH;
    render(<ApprovalInboxPage />);
    const msg = await screen.findByText(/authorized admin roles/i);
    expect(msg.textContent).not.toContain("Manila");
  });

  it("shows notification failed warning when notification_failed_count > 0", async () => {
    mockAuthReturn = HQ_AUTH;
    mockProcurementJson = vi.fn(async () => ({
      rows: [
        {
          id: "case-2",
          parent_case_no: "PC-002",
          request_no: "PR-002",
          requested_by: "Bob",
          store_code: "MNL-02",
          total_amount: 1000,
          severity: "LOW",
          status: "SUBMITTED",
          current_assignee_role: "MANAGER",
          claimed_by: "",
          document_status: "PENDING",
          po_status: "PENDING",
          notification_failed_count: 2,
          blocked_reason: "Webhook timeout",
        },
      ],
    }));
    render(<ApprovalInboxPage />);
    await screen.findByText(/Push Failed ×2/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// Exceptions Page (city hardcode bug)
// ════════════════════════════════════════════════════════════════════════════════
describe("ProcurementExceptionsPage", () => {
  let ExceptionsPage: React.ComponentType;

  beforeEach(async () => {
    vi.resetModules();
    vi.mock("@/lib/auth", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/auth")>();
      return {
        ...actual,
        getAuth: vi.fn(() => mockAuthReturn),
        refreshAuthFromApi: vi.fn(async () => mockAuthReturn),
        setAuth: vi.fn(),
      };
    });
    // Use the top-level procurementClient mock (delegates to mockProcurementJson).
    // This lets us inspect mockProcurementJson.mock.calls for URL assertions.
    vi.mock("@/lib/procurementClient", () => ({
      procurementJson: (...args: any[]) => (mockProcurementJson as (...a: any[]) => any)(...args),
      defaultProcurementName: vi.fn(() => "Jay"),
      defaultProcurementPin: vi.fn(() => "1234"),
      saveProcurementSession: vi.fn(),
    }));
    const mod = await import("@/app/admin/procurement/exceptions/page");
    ExceptionsPage = mod.default;
    mockProcurementJson = vi.fn(async () => ({ rows: [] }));
  });

  it("shows access denied for unauthorized user", async () => {
    mockAuthReturn = NO_AUTH;
    render(<ExceptionsPage />);
    await screen.findByText(/authorized admin roles/i);
  });

  it("shows exception list for HQ user", async () => {
    mockAuthReturn = HQ_AUTH;
    mockProcurementJson = vi.fn(async () => ({
      rows: [
        {
          id: "ex-1",
          case_id: "c-1",
          request_no: "PR-001",
          rule_code: "PRICE_DEVIATION",
          severity: "HIGH",
          score: 8.5,
          status: "OPEN",
          requested_by: "Alice",
        },
      ],
    }));
    render(<ExceptionsPage />);
    await screen.findByText("PRICE_DEVIATION");
    expect(screen.getByText(/HIGH/)).toBeInTheDocument();
  });

  it("shows 'No exception events.' when list is empty", async () => {
    mockAuthReturn = HQ_AUTH;
    render(<ExceptionsPage />);
    await screen.findByText("No exception events.");
  });

  it("[FIXED] uses user city (manila) in API call — not hardcoded", async () => {
    mockAuthReturn = HQ_AUTH; // city: manila
    render(<ExceptionsPage />);
    // Wait for load() to fire, then check call args via the mock spy
    await waitFor(() => {
      const urls = (mockProcurementJson as ReturnType<typeof vi.fn>).mock.calls
        .map((c: any[]) => String(c[0] || ""));
      expect(urls.some((u) => u.includes("city=manila"))).toBe(true);
    });
  });

  it("[FIXED] uses Dubai city in API call when user is Dubai admin", async () => {
    mockAuthReturn = DUBAI_AUTH; // city: dubai
    render(<ExceptionsPage />);
    await waitFor(() => {
      const urls = (mockProcurementJson as ReturnType<typeof vi.fn>).mock.calls
        .map((c: any[]) => String(c[0] || ""));
      expect(urls.some((u) => u.includes("city=dubai"))).toBe(true);
    });
  });

  it("[FIXED] does NOT hardcode city=manila for Dubai users", async () => {
    mockAuthReturn = DUBAI_AUTH;
    render(<ExceptionsPage />);
    // Wait long enough for load() to fire, then confirm no city=manila calls
    await screen.findByText("No exception events.");
    const urls = (mockProcurementJson as ReturnType<typeof vi.fn>).mock.calls
      .map((c: any[]) => String(c[0] || ""));
    const wrongCalls = urls.filter(
      (u) => u.includes("/procurement/exceptions") && u.includes("city=manila"),
    );
    expect(wrongCalls.length).toBe(0);
  });

  it("[FIXED] error message says 'authorized admin roles' not 'Manila admin roles'", async () => {
    mockAuthReturn = NO_AUTH;
    render(<ExceptionsPage />);
    const msg = await screen.findByText(/authorized admin roles/i);
    expect(msg.textContent).not.toContain("Manila");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// Audit Page
// ════════════════════════════════════════════════════════════════════════════════
describe("ProcurementAuditPage", () => {
  let AuditPage: React.ComponentType;

  beforeEach(async () => {
    vi.resetModules();
    vi.mock("@/lib/auth", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/auth")>();
      return {
        ...actual,
        getAuth: vi.fn(() => mockAuthReturn),
        refreshAuthFromApi: vi.fn(async () => mockAuthReturn),
        setAuth: vi.fn(),
      };
    });
    vi.mock("@/lib/procurementClient", () => ({
      procurementJson: (...args: any[]) => (mockProcurementJson as (...a: any[]) => any)(...args),
      defaultProcurementName: vi.fn(() => "Jay"),
      defaultProcurementPin: vi.fn(() => "1234"),
      saveProcurementSession: vi.fn(),
    }));
    const mod = await import("@/app/admin/procurement/audit/page");
    AuditPage = mod.default;
    mockProcurementJson = vi.fn(async () => ({ rows: [] }));
  });

  it("shows access denied for unauthorized user", async () => {
    mockAuthReturn = NO_AUTH;
    render(<AuditPage />);
    await screen.findByText(/authorized admin roles/i);
  });

  it("shows audit log entries for HQ user", async () => {
    mockAuthReturn = HQ_AUTH;
    mockProcurementJson = vi.fn(async () => ({
      rows: [
        {
          id: 42,
          request_id: "req-123",
          case_id: "case-456",
          actor_name: "Jay",
          actor_role: "HQ",
          action_key: "APPROVE",
          reason_code: "",
          created_at: "2026-05-10T10:00:00",
        },
      ],
    }));
    render(<AuditPage />);
    await screen.findByText("APPROVE");
    expect(screen.getByText(/Jay/)).toBeInTheDocument();
  });

  it("shows 'No audit logs.' when empty", async () => {
    mockAuthReturn = HQ_AUTH;
    render(<AuditPage />);
    await screen.findByText("No audit logs. Enter a Request ID and click Search.");
  });

  it("[FIXED] error message says 'authorized admin roles' not 'Manila admin roles'", async () => {
    mockAuthReturn = NO_AUTH;
    render(<AuditPage />);
    const msg = await screen.findByText(/authorized admin roles/i);
    expect(msg.textContent).not.toContain("Manila");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// Dashboard Page
// ════════════════════════════════════════════════════════════════════════════════
describe("ProcurementDashboardPage", () => {
  let DashboardPage: React.ComponentType;

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
      procurementJson: (...args: any[]) => (mockProcurementJson as (...a: any[]) => any)(...args),
      defaultProcurementName: vi.fn(() => "Jay"),
      defaultProcurementPin: vi.fn(() => "1234"),
      saveProcurementSession: vi.fn(),
    }));
    vi.mock("@/components/MonthPicker", () => ({
      default: ({ value, onChange }: any) => (
        <input type="month" value={value} onChange={(e) => onChange(e.target.value)} />
      ),
    }));
    const mod = await import("@/app/admin/procurement/dashboard/page");
    DashboardPage = mod.default;
    mockProcurementJson = vi.fn(async () => ({ rows: [], summary: null }));
  });

  it("shows access denied for unauthorized user", async () => {
    mockAuthReturn = NO_AUTH;
    render(<DashboardPage />);
    await screen.findByText(/authorized admin roles/i);
  });

  it("shows Today's Actions section for HQ user", async () => {
    mockAuthReturn = HQ_AUTH;
    mockProcurementJson = vi.fn(async () => ({ rows: [], summary: null }));
    render(<DashboardPage />);
    await screen.findByText("Today's Actions");
  });

  it("shows KPI Snapshot section", async () => {
    mockAuthReturn = HQ_AUTH;
    render(<DashboardPage />);
    await screen.findByText("KPI Snapshot");
  });

  it("shows 'No open exceptions.' when exception list is empty", async () => {
    mockAuthReturn = HQ_AUTH;
    render(<DashboardPage />);
    await screen.findByText("No open exceptions.");
  });

  it("shows 'No critical / high stock risks.' when risk list is empty", async () => {
    mockAuthReturn = HQ_AUTH;
    render(<DashboardPage />);
    await screen.findByText("No critical / high stock risks.");
  });

  it("shows error message on API failure", async () => {
    mockAuthReturn = HQ_AUTH;
    mockProcurementJson = vi.fn(async () => {
      throw new Error("Dashboard load failed");
    });
    render(<DashboardPage />);
    await screen.findByText("Dashboard load failed");
  });
});
