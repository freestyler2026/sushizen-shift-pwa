// tests/admin/renewals/renewals.test.tsx
// Tests for src/app/admin/renewals/page.tsx
// Covers: auth guard, alerts tab, staff tab, add staff tab,
//         edit modal, toast, helper functions.

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── next/navigation ───────────────────────────────────────────────────────────
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/renewals",
}));

// ── next/link ─────────────────────────────────────────────────────────────────
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));

// ── lucide-react ──────────────────────────────────────────────────────────────
vi.mock("lucide-react", () => ({
  AlertTriangle:  () => <svg data-testid="icon-alert-triangle" />,
  CheckCircle2:   () => <svg data-testid="icon-check-circle" />,
  ChevronDown:    () => <svg data-testid="icon-chevron-down" />,
  CircleAlert:    () => <svg data-testid="icon-circle-alert" />,
  Info:           () => <svg data-testid="icon-info" />,
  Loader2:        () => <svg data-testid="icon-loader" />,
  Pencil:         () => <svg data-testid="icon-pencil" />,
  Plus:           () => <svg data-testid="icon-plus" />,
  Search:         () => <svg data-testid="icon-search" />,
  Users:          () => <svg data-testid="icon-users" />,
  X:              () => <svg data-testid="icon-x" />,
}));

// ── @/lib/api ─────────────────────────────────────────────────────────────────
vi.mock("@/lib/api", () => ({ API_BASE: "" }));

// ── @/lib/renewals ────────────────────────────────────────────────────────────
vi.mock("@/lib/renewals", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/renewals")>();
  return {
    ...actual,
    setRenewalsBadgeCount: vi.fn(),
  };
});

// ── auth ──────────────────────────────────────────────────────────────────────
let mockCanAccess = true;
const RENEWALS_AUTH = {
  accessToken: "tok-renewals",
  role: "HQ",
  city: "dubai",
  staffName: "Jay",
  permissions: ["renewals.admin"],
  pin: "1234",
};

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getAuth: vi.fn(() => RENEWALS_AUTH),
    refreshAuthFromApi: vi.fn(async () => RENEWALS_AUTH),
    canAccessRenewalsAdmin: vi.fn(() => mockCanAccess),
    getAuthHeaders: vi.fn(() => ({ Authorization: "Bearer tok-renewals" })),
  };
});

// ── fixture data ──────────────────────────────────────────────────────────────
const ALERT_EXPIRED: import("@/lib/renewals").RenewalAlertItem = {
  document_id: 101,
  staff_id: 1,
  emp_id: "EMP001",
  full_name: "Tanaka Jay",
  position: "Chef",
  branch: "JLT",
  active_status: "Active",
  doc_type: "VISA",
  issued_date: "2020-01-01",
  expiry_date: "2024-01-01",
  renewal_status: "PENDING",
  doc_reference: "VZ-001",
  notes: "",
  last_renewed_at: null,
  alert_level: "EXPIRED",
  days_until_expiry: -30,
};

const ALERT_WARNING: import("@/lib/renewals").RenewalAlertItem = {
  document_id: 102,
  staff_id: 2,
  emp_id: "EMP002",
  full_name: "Santos Maria",
  position: "Cashier",
  branch: "Al Barsha",
  active_status: "Active",
  doc_type: "EID",
  issued_date: "2022-06-01",
  expiry_date: "2026-06-30",
  renewal_status: "IN_PROGRESS",
  doc_reference: "EID-002",
  notes: "",
  last_renewed_at: null,
  alert_level: "WARNING",
  days_until_expiry: 35,
};

const ALERT_RESIGNED: import("@/lib/renewals").RenewalAlertItem = {
  document_id: 103,
  staff_id: 3,
  emp_id: "EMP003",
  full_name: "Cruz Pedro",
  position: "Waiter",
  branch: "JLT",
  active_status: "Resigned",
  doc_type: "PASSPORT",
  issued_date: "2019-01-01",
  expiry_date: "2025-01-01",
  renewal_status: "PENDING",
  doc_reference: "",
  notes: "",
  last_renewed_at: null,
  alert_level: "CRITICAL",
  days_until_expiry: 10,
};

const STAFF_ACTIVE: import("@/lib/renewals").RenewalStaff = {
  id: 1,
  emp_id: "EMP001",
  full_name: "Tanaka Jay",
  position: "Chef",
  branch: "JLT",
  nationality: "Japanese",
  active_status: "Active",
  phone_no: "+971501234567",
  documents: [],
  alert_count: 1,
};

const STAFF_RESIGNED: import("@/lib/renewals").RenewalStaff = {
  id: 2,
  emp_id: "EMP002",
  full_name: "Santos Maria",
  position: "Cashier",
  branch: "Al Barsha",
  nationality: "Filipino",
  active_status: "Resigned",
  phone_no: "+971509876543",
  documents: [],
  alert_count: 0,
};

// ── fetch mock factory ────────────────────────────────────────────────────────
function makeRenewalsFetch(opts: {
  alerts?: import("@/lib/renewals").RenewalAlertItem[];
  staff?: import("@/lib/renewals").RenewalStaff[];
  failAlerts?: boolean;
  failStaff?: boolean;
} = {}) {
  const alerts = opts.alerts ?? [ALERT_EXPIRED, ALERT_WARNING];
  const staff  = opts.staff  ?? [STAFF_ACTIVE];

  return vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);

    if (u.includes("/api/renewals/alerts")) {
      if (opts.failAlerts) return { ok: false, status: 500, text: async () => "Server Error" } as any;
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({ alerts, badge_count: alerts.length }),
      } as any;
    }
    if (u.includes("/api/renewals/staff/") && u.includes("/documents")) {
      return { ok: true, status: 200, text: async () => "{}" } as any;
    }
    if (u.includes("/api/renewals/documents/") && u.includes("/status")) {
      return { ok: true, status: 200, text: async () => "{}" } as any;
    }
    if (u.includes("/api/renewals/staff/")) {
      // PATCH individual staff
      return { ok: true, status: 200, text: async () => JSON.stringify({ ...STAFF_ACTIVE }) } as any;
    }
    if (u.includes("/api/renewals/staff")) {
      if (opts.failStaff) return { ok: false, status: 500, text: async () => "Server Error" } as any;
      if (init?.method === "POST") {
        return { ok: true, status: 201, text: async () => JSON.stringify({ ...STAFF_ACTIVE }) } as any;
      }
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({ staff }),
      } as any;
    }
    if (u.includes("/api/admin/staff_master/names")) {
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({ names: ["Tanaka Jay", "Santos Maria"] }),
      } as any;
    }
    return { ok: false, status: 404, text: async () => "Not Found" } as any;
  });
}

import RenewalsAdminPage from "@/app/admin/renewals/page";

// ════════════════════════════════════════════════════════════════════════════
describe("RenewalsAdminPage — auth guard", () => {
  beforeEach(() => { mockCanAccess = true; vi.stubGlobal("fetch", makeRenewalsFetch()); });
  afterEach(() => { vi.unstubAllGlobals(); mockReplace.mockClear(); });

  it("redirects to /login when auth is missing", async () => {
    const { getAuth, refreshAuthFromApi } = await import("@/lib/auth");
    vi.mocked(getAuth).mockReturnValueOnce(null as any);
    vi.mocked(refreshAuthFromApi).mockResolvedValueOnce(null as any);
    render(<RenewalsAdminPage />);
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining("/login"));
    });
  });

  it("redirects to /week when canAccessRenewalsAdmin returns false", async () => {
    mockCanAccess = false;
    const { canAccessRenewalsAdmin } = await import("@/lib/auth");
    vi.mocked(canAccessRenewalsAdmin).mockReturnValue(false);
    render(<RenewalsAdminPage />);
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/week");
    });
  });

  it("renders 'Renewals' heading for authorized user", async () => {
    render(<RenewalsAdminPage />);
    await screen.findByText("Renewals");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("RenewalsAdminPage — tabs", () => {
  beforeEach(() => { mockCanAccess = true; vi.stubGlobal("fetch", makeRenewalsFetch()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("renders Alerts, All Staff, and Add Staff tab buttons", async () => {
    render(<RenewalsAdminPage />);
    await screen.findByText("Renewals");
    // "All Staff" appears in BOTH the tab nav and the alerts filter — use getAllByRole
    expect(screen.getAllByRole("button", { name: /Alerts/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /All Staff/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Add Staff/i }).length).toBeGreaterThan(0);
  });

  it("switches to All Staff tab when clicked", async () => {
    render(<RenewalsAdminPage />);
    await screen.findByText("Renewals");
    // The tab "All Staff" is the FIRST button with that name in DOM order
    fireEvent.click(screen.getAllByRole("button", { name: /All Staff/i })[0]);
    await screen.findByText("Tanaka Jay");
  });

  it("switches to Add Staff tab when clicked", async () => {
    render(<RenewalsAdminPage />);
    await screen.findByText("Renewals");
    fireEvent.click(screen.getByRole("button", { name: /Add Staff/i }));
    await screen.findByText("Staff Info");
    expect(screen.getByText("Save Staff & Documents")).toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("RenewalsAdminPage — alerts tab", () => {
  beforeEach(() => { mockCanAccess = true; });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("shows loading state initially", async () => {
    let resolveAlerts!: (v: any) => void;
    const p = new Promise((res) => { resolveAlerts = res; });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/api/renewals/alerts")) return p;
      return { ok: true, status: 200, text: async () => JSON.stringify({ staff: [] }) } as any;
    }));
    render(<RenewalsAdminPage />);
    await screen.findByText("Renewals");
    expect(screen.getByTestId("icon-loader")).toBeInTheDocument();
    resolveAlerts({ ok: true, status: 200, text: async () => JSON.stringify({ alerts: [], badge_count: 0 }) });
  });

  it("shows 'No renewal alerts right now.' when alert list is empty", async () => {
    vi.stubGlobal("fetch", makeRenewalsFetch({ alerts: [] }));
    render(<RenewalsAdminPage />);
    await screen.findByText("No renewal alerts right now.");
  });

  it("displays alert group with staff name and doc type badge", async () => {
    vi.stubGlobal("fetch", makeRenewalsFetch({ alerts: [ALERT_EXPIRED] }));
    render(<RenewalsAdminPage />);
    await screen.findByText("Tanaka Jay");
    expect(screen.getAllByText(/Residency Visa/i).length).toBeGreaterThan(0);
  });

  it("shows EXPIRED / WARNING alert level badges", async () => {
    vi.stubGlobal("fetch", makeRenewalsFetch({ alerts: [ALERT_EXPIRED, ALERT_WARNING] }));
    render(<RenewalsAdminPage />);
    await screen.findByText("Tanaka Jay");
    expect(screen.getByText("EXPIRED")).toBeInTheDocument();
    expect(screen.getByText("WARNING")).toBeInTheDocument();
  });

  it("shows summary badge counts for Expired and Warning", async () => {
    vi.stubGlobal("fetch", makeRenewalsFetch({ alerts: [ALERT_EXPIRED, ALERT_WARNING] }));
    render(<RenewalsAdminPage />);
    await screen.findByText("Tanaka Jay");
    expect(screen.getByText(/Expired: 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Warning ≤42d: 1/i)).toBeInTheDocument();
  });

  it("shows expiry copy on alert card", async () => {
    vi.stubGlobal("fetch", makeRenewalsFetch({ alerts: [ALERT_EXPIRED] }));
    render(<RenewalsAdminPage />);
    await screen.findByText("Tanaka Jay");
    // ALERT_EXPIRED has days_until_expiry: -30 → "30 days overdue"
    expect(screen.getByText(/30 days overdue/i)).toBeInTheDocument();
  });

  it("shows 'Mark as Renewed' button for active staff alert", async () => {
    vi.stubGlobal("fetch", makeRenewalsFetch({ alerts: [ALERT_EXPIRED] }));
    render(<RenewalsAdminPage />);
    await screen.findByText("Tanaka Jay");
    expect(screen.getByRole("button", { name: /Mark as Renewed/i })).toBeInTheDocument();
  });

  it("clicking 'Mark as Renewed' calls PATCH /api/renewals/documents/:id/status", async () => {
    const mockFetch = makeRenewalsFetch({ alerts: [ALERT_EXPIRED] });
    vi.stubGlobal("fetch", mockFetch);
    render(<RenewalsAdminPage />);
    await screen.findByText("Tanaka Jay");
    fireEvent.click(screen.getByRole("button", { name: /Mark as Renewed/i }));
    await waitFor(() => {
      const patchCall = (mockFetch.mock.calls as any[]).find(
        ([url]: [string]) => String(url).includes("/api/renewals/documents/101/status"),
      );
      expect(patchCall).toBeDefined();
      expect((patchCall as any[])[1]?.method).toBe("PATCH");
    });
  });

  it("'Mark as Renewed' removes the alert from the list on success", async () => {
    vi.stubGlobal("fetch", makeRenewalsFetch({ alerts: [ALERT_EXPIRED] }));
    render(<RenewalsAdminPage />);
    await screen.findByText("Tanaka Jay");
    fireEvent.click(screen.getByRole("button", { name: /Mark as Renewed/i }));
    await screen.findByText("Document marked as renewed.");
    // alert group should disappear (RENEWED items are filtered out)
    await waitFor(() => {
      expect(screen.queryByText(/30 days overdue/i)).not.toBeInTheDocument();
    });
  });

  it("shows 'Mark as Resigned' button for active staff in alerts", async () => {
    vi.stubGlobal("fetch", makeRenewalsFetch({ alerts: [ALERT_EXPIRED] }));
    render(<RenewalsAdminPage />);
    await screen.findByText("Tanaka Jay");
    expect(screen.getByRole("button", { name: /Mark as Resigned/i })).toBeInTheDocument();
  });

  it("'Mark as Resigned' calls confirm dialog and PATCH on confirm", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const mockFetch = makeRenewalsFetch({ alerts: [ALERT_EXPIRED] });
    vi.stubGlobal("fetch", mockFetch);
    render(<RenewalsAdminPage />);
    await screen.findByText("Tanaka Jay");
    fireEvent.click(screen.getByRole("button", { name: /Mark as Resigned/i }));
    await waitFor(() => {
      const patchCall = (mockFetch.mock.calls as any[]).find(
        ([url]: [string]) => String(url).includes("/api/renewals/staff/EMP001"),
      );
      expect(patchCall).toBeDefined();
      expect((patchCall as any[])[1]?.method).toBe("PATCH");
    });
  });

  it("'Mark as Resigned' does NOT call API when confirm returns false", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    const mockFetch = makeRenewalsFetch({ alerts: [ALERT_EXPIRED] });
    vi.stubGlobal("fetch", mockFetch);
    render(<RenewalsAdminPage />);
    await screen.findByText("Tanaka Jay");
    const callsBefore = mockFetch.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /Mark as Resigned/i }));
    await waitFor(() => expect(mockFetch.mock.calls.length).toBe(callsBefore));
  });

  it("shows resigned staff notice in alert card when staff is resigned", async () => {
    vi.stubGlobal("fetch", makeRenewalsFetch({ alerts: [ALERT_RESIGNED] }));
    render(<RenewalsAdminPage />);
    await screen.findByText("Cruz Pedro");
    expect(screen.getByText(/Staff has resigned - no renewal action required/i)).toBeInTheDocument();
  });

  it("'Resigned' filter shows only resigned staff alerts", async () => {
    vi.stubGlobal("fetch", makeRenewalsFetch({ alerts: [ALERT_EXPIRED, ALERT_RESIGNED] }));
    render(<RenewalsAdminPage />);
    await screen.findByText("Tanaka Jay");
    fireEvent.click(screen.getByRole("button", { name: "Resigned" }));
    await waitFor(() => {
      expect(screen.queryByText("Tanaka Jay")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Cruz Pedro")).toBeInTheDocument();
  });

  it("'Active' filter shows only active staff alerts", async () => {
    vi.stubGlobal("fetch", makeRenewalsFetch({ alerts: [ALERT_EXPIRED, ALERT_RESIGNED] }));
    render(<RenewalsAdminPage />);
    await screen.findByText("Cruz Pedro");
    fireEvent.click(screen.getByRole("button", { name: "Active" }));
    await waitFor(() => {
      expect(screen.queryByText("Cruz Pedro")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Tanaka Jay")).toBeInTheDocument();
  });

  it("shows error toast when alerts API fails", async () => {
    // The page's requestJson catches JSON.parse failure and rethrows with raw text
    // Our mock returns "Server Error" as text → toast shows "Server Error"
    vi.stubGlobal("fetch", makeRenewalsFetch({ failAlerts: true }));
    render(<RenewalsAdminPage />);
    await screen.findByText("Server Error");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("RenewalsAdminPage — staff tab", () => {
  beforeEach(() => { mockCanAccess = true; });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("shows loading state on staff tab", async () => {
    let resolveStaff!: (v: any) => void;
    const p = new Promise((res) => { resolveStaff = res; });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/api/renewals/alerts")) return { ok: true, status: 200, text: async () => JSON.stringify({ alerts: [], badge_count: 0 }) } as any;
      if (String(url).includes("/api/renewals/staff")) return p;
      return { ok: true, status: 200, text: async () => JSON.stringify({ names: [] }) } as any;
    }));
    render(<RenewalsAdminPage />);
    await screen.findByText("Renewals");
    // Tab "All Staff" is first [0]; filter "All Staff" is second [1]
    fireEvent.click(screen.getAllByRole("button", { name: /All Staff/i })[0]);
    expect(screen.getAllByTestId("icon-loader").length).toBeGreaterThan(0);
    resolveStaff({ ok: true, status: 200, text: async () => JSON.stringify({ staff: [] }) });
  });

  it("shows staff cards with name, position, and branch", async () => {
    vi.stubGlobal("fetch", makeRenewalsFetch({ staff: [STAFF_ACTIVE] }));
    render(<RenewalsAdminPage />);
    await screen.findByText("Renewals");
    fireEvent.click(screen.getAllByRole("button", { name: /All Staff/i })[0]);
    await screen.findByText("Tanaka Jay");
    expect(screen.getByText(/Chef.*JLT|JLT.*Chef/i)).toBeInTheDocument();
  });

  it("shows 'Active' badge on active staff card", async () => {
    vi.stubGlobal("fetch", makeRenewalsFetch({ staff: [STAFF_ACTIVE] }));
    render(<RenewalsAdminPage />);
    await screen.findByText("Renewals");
    fireEvent.click(screen.getAllByRole("button", { name: /All Staff/i })[0]);
    await screen.findByText("Tanaka Jay");
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
  });

  it("shows alert count on staff card", async () => {
    vi.stubGlobal("fetch", makeRenewalsFetch({ staff: [STAFF_ACTIVE] }));
    render(<RenewalsAdminPage />);
    await screen.findByText("Renewals");
    fireEvent.click(screen.getAllByRole("button", { name: /All Staff/i })[0]);
    await screen.findByText("Tanaka Jay");
    expect(screen.getByText(/Alerts: 1/i)).toBeInTheDocument();
  });

  it("search filter narrows staff list", async () => {
    vi.stubGlobal("fetch", makeRenewalsFetch({ staff: [STAFF_ACTIVE, STAFF_RESIGNED] }));
    render(<RenewalsAdminPage />);
    await screen.findByText("Renewals");
    fireEvent.click(screen.getAllByRole("button", { name: /All Staff/i })[0]);
    await screen.findByText("Tanaka Jay");
    await screen.findByText("Santos Maria");
    const searchInput = screen.getByPlaceholderText(/Search by staff name/i);
    fireEvent.change(searchInput, { target: { value: "Tanaka" } });
    await waitFor(() => {
      expect(screen.queryByText("Santos Maria")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Tanaka Jay")).toBeInTheDocument();
  });

  it("'Active' filter on staff tab hides resigned staff", async () => {
    vi.stubGlobal("fetch", makeRenewalsFetch({ staff: [STAFF_ACTIVE, STAFF_RESIGNED] }));
    render(<RenewalsAdminPage />);
    await screen.findByText("Renewals");
    fireEvent.click(screen.getAllByRole("button", { name: /All Staff/i })[0]);
    await screen.findByText("Santos Maria");
    // In the staff tab filter bar, "Active" and "All" toggle buttons appear.
    // Find the "Active" button that is NOT in the alerts filter section.
    // After switching to staff tab, the alerts filter is gone — only staff filter remains.
    const activeButtons = screen.getAllByRole("button", { name: "Active" });
    fireEvent.click(activeButtons[0]);
    await waitFor(() => {
      expect(screen.queryByText("Santos Maria")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Tanaka Jay")).toBeInTheDocument();
  });

  it("Edit button on staff card opens edit modal", async () => {
    vi.stubGlobal("fetch", makeRenewalsFetch({ staff: [STAFF_ACTIVE] }));
    render(<RenewalsAdminPage />);
    await screen.findByText("Renewals");
    fireEvent.click(screen.getAllByRole("button", { name: /All Staff/i })[0]);
    await screen.findByText("Tanaka Jay");
    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
    await screen.findByText("Edit Renewal Record");
    expect(screen.getAllByText("Tanaka Jay").length).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("RenewalsAdminPage — add staff tab", () => {
  beforeEach(() => { mockCanAccess = true; vi.stubGlobal("fetch", makeRenewalsFetch()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("shows Staff Info and Document Dates sections", async () => {
    render(<RenewalsAdminPage />);
    await screen.findByText("Renewals");
    fireEvent.click(screen.getByRole("button", { name: /Add Staff/i }));
    await screen.findByText("Staff Info");
    expect(screen.getByText("Document Dates")).toBeInTheDocument();
  });

  it("shows validation error when Employee ID is missing", async () => {
    render(<RenewalsAdminPage />);
    await screen.findByText("Renewals");
    fireEvent.click(screen.getByRole("button", { name: /Add Staff/i }));
    await screen.findByText("Staff Info");
    // fill only full_name
    const inputs = screen.getAllByRole("textbox");
    // full_name is 2nd textbox (after emp_id)
    fireEvent.change(inputs[1], { target: { value: "New Staff" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Staff & Documents/i }));
    await screen.findByText(/Employee ID and full name are required/i);
  });

  it("shows validation error when Full Name is missing", async () => {
    render(<RenewalsAdminPage />);
    await screen.findByText("Renewals");
    fireEvent.click(screen.getByRole("button", { name: /Add Staff/i }));
    await screen.findByText("Staff Info");
    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[0], { target: { value: "EMP099" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Staff & Documents/i }));
    await screen.findByText(/Employee ID and full name are required/i);
  });

  it("calls POST /api/renewals/staff on valid submit", async () => {
    const mockFetch = makeRenewalsFetch();
    vi.stubGlobal("fetch", mockFetch);
    render(<RenewalsAdminPage />);
    await screen.findByText("Renewals");
    fireEvent.click(screen.getAllByRole("button", { name: /Add Staff/i })[0]);
    const empInput = await screen.findByPlaceholderText("EMP052");
    fireEvent.change(empInput, { target: { value: "EMP099" } });
    // When staffMasterNames loads, the full_name input gains a `list` attribute which
    // changes its ARIA role from "textbox" to "combobox" — so getAllByRole("textbox")[1]
    // skips it and hits Position instead. Target by placeholder once names have loaded.
    const fullNameInput = await screen.findByPlaceholderText("Type to search staff...");
    fireEvent.change(fullNameInput, { target: { value: "New Staff Member" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Staff & Documents/i }));
    await waitFor(() => {
      expect(
        mockFetch.mock.calls.some(
          (c: any[]) => String(c[0]) === "/api/renewals/staff" && c[1]?.method === "POST",
        ),
      ).toBe(true);
    }, { timeout: 5000 });
  });

  it("shows success toast after successful staff creation", async () => {
    vi.stubGlobal("fetch", makeRenewalsFetch());
    render(<RenewalsAdminPage />);
    await screen.findByText("Renewals");
    fireEvent.click(screen.getAllByRole("button", { name: /Add Staff/i })[0]);
    const empInput = await screen.findByPlaceholderText("EMP052");
    fireEvent.change(empInput, { target: { value: "EMP099" } });
    // full_name becomes a combobox (ARIA) once staffMasterNames loads — target by placeholder
    const fullNameInput = await screen.findByPlaceholderText("Type to search staff...");
    fireEvent.change(fullNameInput, { target: { value: "New Staff Member" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Staff & Documents/i }));
    await screen.findByText("Staff and documents saved.", {}, { timeout: 5000 });
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("RenewalsAdminPage — edit modal", () => {
  beforeEach(() => { mockCanAccess = true; vi.stubGlobal("fetch", makeRenewalsFetch({ staff: [STAFF_ACTIVE] })); });
  afterEach(() => { vi.unstubAllGlobals(); });

  async function openEditModal() {
    render(<RenewalsAdminPage />);
    await screen.findByText("Renewals");
    fireEvent.click(screen.getAllByRole("button", { name: /All Staff/i })[0]);
    await screen.findByText("Tanaka Jay");
    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
    await screen.findByText("Edit Renewal Record");
  }

  it("modal shows employee name in header", async () => {
    await openEditModal();
    expect(screen.getAllByText("Tanaka Jay").length).toBeGreaterThan(0);
  });

  it("modal closes when X button is clicked", async () => {
    await openEditModal();
    fireEvent.click(screen.getByTestId("icon-x").closest("button")!);
    await waitFor(() => {
      expect(screen.queryByText("Edit Renewal Record")).not.toBeInTheDocument();
    });
  });

  it("modal closes when Cancel button is clicked", async () => {
    await openEditModal();
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    await waitFor(() => {
      expect(screen.queryByText("Edit Renewal Record")).not.toBeInTheDocument();
    });
  });

  it("Save button calls PATCH /api/renewals/staff/:empId", async () => {
    const mockFetch = makeRenewalsFetch({ staff: [STAFF_ACTIVE] });
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", mockFetch);
    render(<RenewalsAdminPage />);
    await screen.findByText("Renewals");
    fireEvent.click(screen.getAllByRole("button", { name: /All Staff/i })[0]);
    await screen.findByText("Tanaka Jay");
    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
    await screen.findByText("Edit Renewal Record");
    const saveButtons = screen.getAllByRole("button", { name: /^Save$/i });
    fireEvent.click(saveButtons[0]);
    await waitFor(() => {
      const patchCall = (mockFetch.mock.calls as any[]).find(
        ([url]: [string]) => String(url).includes("/api/renewals/staff/EMP001"),
      );
      expect(patchCall).toBeDefined();
      expect((patchCall as any[])[1]?.method).toBe("PATCH");
    });
  });

  it("shows success toast after successful edit save", async () => {
    await openEditModal();
    const saveButtons = screen.getAllByRole("button", { name: /^Save$/i });
    fireEvent.click(saveButtons[0]);
    await screen.findByText("Renewal record updated.");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("RenewalsAdminPage — helper functions (pure)", () => {
  // Import helpers directly from page module internals by testing observed behavior

  it("expiryCopy: negative days → 'X days overdue'", async () => {
    vi.stubGlobal("fetch", makeRenewalsFetch({ alerts: [{ ...ALERT_EXPIRED, days_until_expiry: -5 }] }));
    render(<RenewalsAdminPage />);
    await screen.findByText("Tanaka Jay");
    expect(screen.getByText(/5 days overdue/i)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("expiryCopy: 0 days → 'expires today'", async () => {
    vi.stubGlobal("fetch", makeRenewalsFetch({ alerts: [{ ...ALERT_EXPIRED, days_until_expiry: 0 }] }));
    render(<RenewalsAdminPage />);
    await screen.findByText("Tanaka Jay");
    expect(screen.getByText(/expires today/i)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("expiryCopy: positive days → 'X days left'", async () => {
    vi.stubGlobal("fetch", makeRenewalsFetch({ alerts: [{ ...ALERT_WARNING, days_until_expiry: 14 }] }));
    render(<RenewalsAdminPage />);
    await screen.findByText("Santos Maria");
    expect(screen.getByText(/14 days left/i)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("isResignedStatus: 'Resigned' → treated as resigned in alert filter", async () => {
    vi.stubGlobal("fetch", makeRenewalsFetch({ alerts: [ALERT_RESIGNED] }));
    render(<RenewalsAdminPage />);
    await screen.findByText("Cruz Pedro");
    // The active filter should remove this resigned staff
    fireEvent.click(screen.getByRole("button", { name: "Active" }));
    await waitFor(() => {
      expect(screen.queryByText("Cruz Pedro")).not.toBeInTheDocument();
    });
    vi.unstubAllGlobals();
  });

  it("groupedAlerts groups multiple alerts by emp_id + full_name", async () => {
    const alert2: import("@/lib/renewals").RenewalAlertItem = {
      ...ALERT_EXPIRED,
      document_id: 999,
      doc_type: "EID",
    };
    vi.stubGlobal("fetch", makeRenewalsFetch({ alerts: [ALERT_EXPIRED, alert2] }));
    render(<RenewalsAdminPage />);
    await screen.findByText("Tanaka Jay");
    // "Tanaka Jay" appears in: 1 group header + each alert card body → ≥ 1 total
    expect(screen.getAllByText("Tanaka Jay").length).toBeGreaterThan(0);
    // EXPIRED level badge should appear (both alerts have level EXPIRED)
    expect(screen.getAllByText("EXPIRED").length).toBeGreaterThan(0);
    // Two "Mark as Renewed" buttons (one per alert item in the same group)
    expect(screen.getAllByRole("button", { name: /Mark as Renewed/i }).length).toBe(2);
    vi.unstubAllGlobals();
  });

  it("statusSummary returns VALID badge for RENEWED document", async () => {
    const staffWithRenewedDoc: import("@/lib/renewals").RenewalStaff = {
      ...STAFF_ACTIVE,
      documents: [{
        id: 1,
        doc_type: "VISA",
        issued_date: "2023-01-01",
        expiry_date: "2027-01-01",
        renewal_status: "RENEWED",
        doc_reference: "",
        notes: "",
        last_renewed_at: null,
        alert_level: null,
        days_until_expiry: 365,
      }],
    };
    vi.stubGlobal("fetch", makeRenewalsFetch({ staff: [staffWithRenewedDoc] }));
    render(<RenewalsAdminPage />);
    await screen.findByText("Renewals");
    fireEvent.click(screen.getAllByRole("button", { name: /All Staff/i })[0]);
    await screen.findByText("Tanaka Jay");
    // VISA should show VALID badge
    expect(screen.getAllByText("VALID").length).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });
});
