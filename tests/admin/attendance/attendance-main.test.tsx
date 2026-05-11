// tests/admin/attendance/attendance-main.test.tsx
// Tests for src/app/admin/attendance/page.tsx
// Covers: auth guard, status dashboard, pending banner, workflow cards, quick access, refresh.

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── next/navigation ────────────────────────────────────────────────────────────
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/attendance",
}));

// ── next/link ─────────────────────────────────────────────────────────────────
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));

// ── framer-motion ─────────────────────────────────────────────────────────────
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// ── lucide-react ──────────────────────────────────────────────────────────────
vi.mock("lucide-react", () => ({
  AlertTriangle: () => <svg data-testid="icon-alert" />,
  BarChart2: () => <svg data-testid="icon-bar" />,
  CheckCircle2: () => <svg data-testid="icon-check" />,
  ChevronRight: () => <svg data-testid="icon-chevron" />,
  Clock: () => <svg data-testid="icon-clock" />,
  History: () => <svg data-testid="icon-history" />,
  MapPin: () => <svg data-testid="icon-map" />,
  RefreshCw: () => <svg data-testid="icon-refresh" />,
  Upload: () => <svg data-testid="icon-upload" />,
  UserCheck: () => <svg data-testid="icon-usercheck" />,
  Users: () => <svg data-testid="icon-users" />,
  XCircle: () => <svg data-testid="icon-x" />,
}));

// ── ui-tokens ─────────────────────────────────────────────────────────────────
vi.mock("@/lib/ui-tokens", () => ({
  GLASS_CARD: "glass-card",
  PRIMARY_BUTTON: "primary-button",
  SECONDARY_BUTTON: "secondary-button",
  T_CAPTION: "t-caption",
  T_LABEL: "t-label",
  T_PAGE_TITLE: "t-page-title",
  T_SECTION: "t-section",
}));

// ── auth ──────────────────────────────────────────────────────────────────────
let mockCanAccess = true;
const ATT_AUTH = {
  accessToken: "tok-att",
  role: "HQ",
  city: "dubai",
  staffName: "Jay",
  permissions: ["attendance.read"],
  pin: "1234",
};

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getAuth: vi.fn(() => ATT_AUTH),
    refreshAuthFromApi: vi.fn(async () => ATT_AUTH),
    canAccessAdminNav: vi.fn(() => mockCanAccess),
    getAuthHeaders: vi.fn(() => ({ Authorization: "Bearer tok-att" })),
  };
});

// ── fetch mock ────────────────────────────────────────────────────────────────
const LATEST_BATCH = {
  status: "SUCCESS",
  imported_rows: 42,
  error_rows: 0,
  date_from: "2026-05-01",
  date_to: "2026-05-10",
  created_at: new Date(Date.now() - 30 * 60000).toISOString(), // 30m ago
  city: "dubai",
};

function makeMainFetch(opts: {
  batchRows?: any[];
  locations?: any[];
  employees?: any[];
  failHistory?: boolean;
} = {}) {
  const batchRows = opts.batchRows ?? [LATEST_BATCH];
  const locations = opts.locations ?? [{ id: 1, raw_location: "JBR", branch_code: "JBR" }];
  const employees = opts.employees ?? [{ canonical_staff_name: "Jay Tanaka" }];

  return vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("/attendance/history")) {
      if (opts.failHistory) return { ok: false, status: 500, json: async () => ({}) } as any;
      return { ok: true, status: 200, json: async () => ({ rows: batchRows }) } as any;
    }
    if (u.includes("/attendance/locations")) {
      return { ok: true, status: 200, json: async () => ({ locations }) } as any;
    }
    if (u.includes("/attendance/employee-matches")) {
      return { ok: true, status: 200, json: async () => ({ employees }) } as any;
    }
    return { ok: false, status: 404, json: async () => ({}) } as any;
  });
}

import AttendanceAdminPage from "@/app/admin/attendance/page";

// ════════════════════════════════════════════════════════════════════════════════
describe("AttendanceAdminPage — auth guard", () => {
  beforeEach(() => {
    mockCanAccess = true;
    vi.stubGlobal("fetch", makeMainFetch());
  });
  afterEach(() => { vi.unstubAllGlobals(); mockReplace.mockClear(); });

  it("redirects to login when auth is missing", async () => {
    const { refreshAuthFromApi, getAuth } = await import("@/lib/auth");
    vi.mocked(getAuth).mockReturnValueOnce(null as any);
    vi.mocked(refreshAuthFromApi).mockResolvedValueOnce(null as any);
    render(<AttendanceAdminPage />);
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining("/login"));
    });
  });

  it("shows 'not authorized' message when canAccessAdminNav returns false", async () => {
    mockCanAccess = false;
    render(<AttendanceAdminPage />);
    await screen.findByText(/Attendance admin is available only to authorized admin roles/i);
  });

  it("shows 'Bayzat Attendance' heading for authorized user", async () => {
    render(<AttendanceAdminPage />);
    await screen.findByText("Bayzat Attendance");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("AttendanceAdminPage — status dashboard", () => {
  beforeEach(() => {
    mockCanAccess = true;
    vi.stubGlobal("fetch", makeMainFetch());
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("shows Latest Import card with SUCCESS status", async () => {
    render(<AttendanceAdminPage />);
    await screen.findByText("Bayzat Attendance");
    await screen.findByText("SUCCESS");
    expect(screen.getByText(/42 records/i)).toBeInTheDocument();
  });

  it("shows 'All mapped' when no unmapped locations", async () => {
    render(<AttendanceAdminPage />);
    await screen.findByText("Bayzat Attendance");
    await screen.findByText("All mapped");
  });

  it("shows 'All matched' when no unmatched employees", async () => {
    render(<AttendanceAdminPage />);
    await screen.findByText("Bayzat Attendance");
    await screen.findByText("All matched");
  });

  it("shows unmapped location count with warning", async () => {
    vi.stubGlobal("fetch", makeMainFetch({
      locations: [
        { id: 1, raw_location: "JBR", branch_code: null },
        { id: 2, raw_location: "MOA", branch_code: null },
      ],
    }));
    render(<AttendanceAdminPage />);
    await screen.findByText("Bayzat Attendance");
    await screen.findByText(/locations need branch assignment/i);
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Fix now/i })).toHaveAttribute("href", "/admin/attendance/locations");
  });

  it("shows unmatched employee count with link", async () => {
    vi.stubGlobal("fetch", makeMainFetch({
      employees: [
        { canonical_staff_name: null },
        { canonical_staff_name: null },
        { canonical_staff_name: null },
      ],
    }));
    render(<AttendanceAdminPage />);
    await screen.findByText("Bayzat Attendance");
    await screen.findByText(/Bayzat names need staff matching/i);
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Match now/i })).toHaveAttribute("href", "/admin/attendance/employees");
  });

  it("shows 'No imports yet' when no batch", async () => {
    vi.stubGlobal("fetch", makeMainFetch({ batchRows: [] }));
    render(<AttendanceAdminPage />);
    await screen.findByText("Bayzat Attendance");
    await screen.findByText("No imports yet");
  });

  it("shows date coverage range for latest batch", async () => {
    render(<AttendanceAdminPage />);
    await screen.findByText("Bayzat Attendance");
    await screen.findByText(/Coverage:.*2026-05-01.*2026-05-10/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("AttendanceAdminPage — pending banner", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("shows pending banner when there are unmapped locations", async () => {
    vi.stubGlobal("fetch", makeMainFetch({
      locations: [{ id: 1, raw_location: "JBR", branch_code: null }],
    }));
    render(<AttendanceAdminPage />);
    await screen.findByText(/Action required/i);
    expect(screen.getByText(/1 unmapped location/i)).toBeInTheDocument();
  });

  it("does not show pending banner when everything is mapped", async () => {
    vi.stubGlobal("fetch", makeMainFetch());
    render(<AttendanceAdminPage />);
    await screen.findByText("All mapped");
    expect(screen.queryByText(/Action required/i)).not.toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("AttendanceAdminPage — workflow cards", () => {
  beforeEach(() => {
    mockCanAccess = true;
    vi.stubGlobal("fetch", makeMainFetch());
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("renders all 6 Daily Workflow step cards", async () => {
    render(<AttendanceAdminPage />);
    await screen.findByText("Daily Workflow");
    expect(screen.getByText("Import")).toBeInTheDocument();
    expect(screen.getByText("Import History")).toBeInTheDocument();
    expect(screen.getByText("Map Locations")).toBeInTheDocument();
    expect(screen.getByText("Match Employees")).toBeInTheDocument();
    expect(screen.getByText("Verify Attendance")).toBeInTheDocument();
    expect(screen.getByText("Corrections")).toBeInTheDocument();
  });

  it("workflow card links point to correct hrefs", async () => {
    render(<AttendanceAdminPage />);
    await screen.findByText("Daily Workflow");
    const allLinks = screen.getAllByRole("link");
    const importLink = allLinks.find(l => l.getAttribute("href") === "/admin/attendance/import");
    expect(importLink).toBeDefined();
    const historyLink = allLinks.find(l => l.getAttribute("href") === "/admin/attendance/history");
    expect(historyLink).toBeDefined();
  });

  it("renders 4 Quick Access cards", async () => {
    render(<AttendanceAdminPage />);
    await screen.findByText("Quick Access");
    expect(screen.getAllByText("Analytics").length).toBeGreaterThan(0);
    expect(screen.getByText("Import Now")).toBeInTheDocument();
    expect(screen.getAllByText("Locations").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Employees").length).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("AttendanceAdminPage — refresh button", () => {
  beforeEach(() => {
    mockCanAccess = true;
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("clicking Refresh triggers another fetch cycle", async () => {
    const mockFetch = makeMainFetch();
    vi.stubGlobal("fetch", mockFetch);
    render(<AttendanceAdminPage />);
    await screen.findByText("Bayzat Attendance");
    const callsBefore = mockFetch.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /Refresh/i }));
    await waitFor(() => {
      expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });
});
