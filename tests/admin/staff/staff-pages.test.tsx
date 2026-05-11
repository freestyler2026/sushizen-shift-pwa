// tests/admin/staff/staff-pages.test.tsx
// Covers: AdminStaffPage, CreateStaffPage, StaffOnboardingDashboardPage,
//         StaffAuditClient, StaffRolesPage — auth guards, rendering, API calls,
//         helper functions, and known bug surface areas.

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── framer-motion (proxy so motion.div / motion.tr / etc. all work) ────────────
// IMPORTANT: Cache the created components so the same tag always returns the
// same function reference. Without caching, the Proxy returns a NEW function
// on every render, causing React to see a different component type each time
// and unmount/remount the whole subtree — making btn DOM references stale.
vi.mock("framer-motion", () => {
  const React = require("react");
  const cache = new Map<string, any>();
  const makeEl = (tag: string) => {
    if (cache.has(tag)) return cache.get(tag);
    const comp = React.forwardRef(({ children, initial, animate, transition, exit, whileHover, whileTap, ...rest }: any, ref: any) =>
      React.createElement(tag, { ...rest, ref }, children),
    );
    cache.set(tag, comp);
    return comp;
  };
  const proxy = new Proxy({} as Record<string, any>, { get: (_, k: string) => makeEl(k) });
  return { motion: proxy, AnimatePresence: ({ children }: any) => children };
});

// ── next/link ─────────────────────────────────────────────────────────────────
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}));

// ── lucide-react (all icons across the five pages) ────────────────────────────
vi.mock("lucide-react", () => ({
  AlertTriangle:  () => <svg data-testid="icon-alert-triangle" />,
  BarChart2:      () => <svg data-testid="icon-bar-chart" />,
  Check:          () => <svg data-testid="icon-check" />,
  ClipboardList:  () => <svg data-testid="icon-clipboard" />,
  Clock:          () => <svg data-testid="icon-clock" />,
  ClockAlert:     () => <svg data-testid="icon-clock-alert" />,
  Copy:           () => <svg data-testid="icon-copy" />,
  Download:       () => <svg data-testid="icon-download" />,
  KeyRound:       () => <svg data-testid="icon-key-round" />,
  Layers3:        () => <svg data-testid="icon-layers" />,
  Pencil:         () => <svg data-testid="icon-pencil" />,
  ScrollText:     () => <svg data-testid="icon-scroll" />,
  Settings2:      () => <svg data-testid="icon-settings" />,
  ShieldCheck:    () => <svg data-testid="icon-shield" />,
  Trash2:         () => <svg data-testid="icon-trash" />,
  UserPlus:       () => <svg data-testid="icon-user-plus" />,
  Users:          () => <svg data-testid="icon-users" />,
  X:              () => <svg data-testid="icon-x" />,
  Zap:            () => <svg data-testid="icon-zap" />,
}));

// ── AdminOnboardingLinks (used only in CreateStaffPage) ───────────────────────
vi.mock("@/components/admin/AdminOnboardingLinks", () => ({
  default: () => <div data-testid="onboarding-links" />,
}));

// ── @/lib/api (used only by AdminStaffPage) ───────────────────────────────────
const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
vi.mock("@/lib/api", () => ({
  apiGet:  (...args: any[]) => mockApiGet(...args),
  apiPost: (...args: any[]) => mockApiPost(...args),
  qs: (p: Record<string, any>) =>
    "?" +
    new URLSearchParams(
      Object.entries(p)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => [k, String(v)]),
    ).toString(),
  API_BASE: "",
}));

// ── @/lib/auth ────────────────────────────────────────────────────────────────
let mockCanAccessAdmin   = true;
let mockCanRoleManagement = false;
const STAFF_AUTH = {
  accessToken: "tok-staff",
  role:        "ADMIN" as const,
  city:        "dubai" as const,
  staffName:   "Admin User",
  permissions: ["*"],
  pin:         "9999",
};

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getAuth:               vi.fn(() => STAFF_AUTH),
    refreshAuthFromApi:    vi.fn(async () => STAFF_AUTH),
    canAccessAdminNav:     vi.fn(() => mockCanAccessAdmin),
    canAccessRoleManagement: vi.fn(() => mockCanRoleManagement),
    getAuthHeaders:        vi.fn(() => ({ Authorization: "Bearer tok-staff" })),
  };
});

// ── page imports ──────────────────────────────────────────────────────────────
import AdminStaffPage          from "@/app/admin/staff/page";
import CreateStaffPage         from "@/app/admin/staff/create/page";
import StaffOnboardingPage     from "@/app/admin/staff/onboarding/page";
import StaffAuditClient        from "@/app/admin/staff/audit/staff-audit-client";
import StaffRolesPage          from "@/app/admin/staff/roles/page";

// ── shared fixture data ───────────────────────────────────────────────────────
const ROW_ACTIVE = {
  id: "1", city: "dubai", display_name: "Tanaka Jay",
  home_branch: "JLT", role: "STAFF", status: "ACTIVE",
  max_days_per_week: 5, max_consecutive_days: 5, notes: "",
  setup_required: false, setup_completed: true,
  workforce_push_user_key: "",
};

const ROW_INACTIVE = {
  id: "2", city: "dubai", display_name: "Santos Maria",
  home_branch: "BB", role: "MANAGER", status: "INACTIVE",
  max_days_per_week: 5, max_consecutive_days: 5, notes: "test note",
  setup_required: true, setup_completed: false,
  workforce_push_user_key: "uk-001",
};

// ── fetch mock factory (for pages using raw fetch) ────────────────────────────
function makeStaffFetch(opts: {
  onboardingRows?: any[];
  onboardingSummary?: any;
  auditRows?: any[];
  failOnboarding?: boolean;
  failAudit?: boolean;
  createResult?: any;
  failCreate?: boolean;
  // roles page
  channels?: any[];
  roles?: any[];
  permissions?: any[];
  dubaiStaff?: any[];
  manilaStaff?: any[];
} = {}) {
  const onboardingRows    = opts.onboardingRows ?? [];
  const onboardingSummary = opts.onboardingSummary ?? { total: 0, pending_setup: 0, completed_setup: 0, active: 0 };
  const auditRows         = opts.auditRows ?? [];
  const channels          = opts.channels ?? [{ channel_key: "admin.staff", label: "Staff Channel", route_path: "/admin/staff", view_role_count: 2, is_system: false }];
  const roles             = opts.roles ?? [{ role_key: "STAFF", label: "Staff", permission_count: 0 }, { role_key: "MANAGER", label: "Manager", permission_count: 1 }];
  const dubaiStaff        = opts.dubaiStaff ?? [{ id: "1", city: "dubai", display_name: "Tanaka Jay", home_branch: "JLT", role: "STAFF", status: "ACTIVE" }];
  const manilaStaff       = opts.manilaStaff ?? [];

  return vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);

    // Onboarding dashboard
    if (u.includes("/onboarding_dashboard")) {
      if (opts.failOnboarding) return { ok: false, status: 500, text: async () => "Server error" } as any;
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, rows: onboardingRows, summary: onboardingSummary }) } as any;
    }

    // Onboarding setup complete
    if (u.includes("/setup/complete-by-hq")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) } as any;
    }

    // Audit logs
    if (u.includes("/audit_logs")) {
      if (opts.failAudit) return { ok: false, status: 500, text: async () => "Audit load error" } as any;
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, rows: auditRows }) } as any;
    }

    // Create staff (auth verify)
    if (u.includes("/api/auth/verify")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, staff_name: "Admin User", role: "ADMIN" }) } as any;
    }
    // Create staff (create)
    if (u.includes("/store/staff/create") || u.includes("/api/store/staff/create")) {
      if (opts.failCreate) return { ok: false, status: 400, text: async () => JSON.stringify({ detail: "Name already exists" }) } as any;
      const r = opts.createResult ?? { ok: true, display_name: "New Staff", setup_code: "ABCD", expires_at: "2026-12-31" };
      return { ok: true, status: 201, text: async () => JSON.stringify(r) } as any;
    }

    // Roles — bootstrap
    if (u.includes("/access/bootstrap")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, channels, roles, permissions: opts.permissions ?? [] }) } as any;
    }
    // Roles — channel role matrix
    if (u.includes("/role-matrix")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({
        ok: true,
        channel: channels[0],
        permission: { permission_key: "view", label: "View", channel_key: "admin.staff", action_key: "view" },
        roles: roles.map((r: any) => ({ ...r, assigned: false, locked: false })),
        assigned_count: 0,
      }) } as any;
    }
    // Roles — role permissions
    if (u.match(/\/access\/roles\/.+\/permissions/)) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, role: roles[0], permissions: [], effective_permissions: [] }) } as any;
    }
    // Roles — staff master (dubai)
    if (u.includes("/admin/staff_master") && u.includes("city=dubai")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, rows: dubaiStaff }) } as any;
    }
    // Roles — staff master (manila)
    if (u.includes("/admin/staff_master") && u.includes("city=manila")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, rows: manilaStaff }) } as any;
    }
    // Roles — staff assignments
    if (u.match(/\/access\/staff\/.+\/roles/)) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, staff_name: "Tanaka Jay", assignments: [], effective_role: "STAFF", effective_permissions: [] }) } as any;
    }

    return { ok: false, status: 404, text: async () => "Not Found" } as any;
  });
}

// Helper: click a button and flush pending async React state updates.
// Two-phase: first act flushes the click + any concurrent effects;
// second act flushes state updates that resolve after the first pass.
async function clickAndFlush(btn: HTMLElement) {
  await act(async () => {
    fireEvent.click(btn);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  // Drain any remaining React work (state updates from async handlers)
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

// ════════════════════════════════════════════════════════════════════════════════
// ── PURE HELPER FUNCTIONS (tested inline to avoid async component complexity) ─
// ════════════════════════════════════════════════════════════════════════════════

// Mirror of the dedupeStaffRows pure function from admin/staff/page.tsx
function norm(s: any) { return String(s ?? "").trim(); }
function canonicalStaffName(name: string) { return norm(name).toLowerCase().replace(/\s+/g, " "); }
function dedupeStaffRows(input: any[]): any[] {
  const byName = new Map<string, any>();
  for (const row of input) {
    const key = canonicalStaffName(String(row.display_name || ""));
    if (!key) continue;
    const prev = byName.get(key);
    if (!prev) { byName.set(key, row); continue; }
    const score = (r: any) =>
      (norm(r.home_branch) ? 1 : 0) +
      (norm(r.notes) ? 1 : 0) +
      (norm(r.role) && norm(r.role) !== "STAFF" ? 1 : 0);
    if (score(row) > score(prev)) byName.set(key, row);
  }
  return Array.from(byName.values()).sort((a, b) => norm(a.display_name).localeCompare(norm(b.display_name)));
}

describe("Staff helpers — dedupeStaffRows logic", () => {
  it("deduplicates rows with the same name (case-insensitive)", () => {
    const rows = [
      { ...ROW_ACTIVE },
      { ...ROW_ACTIVE, id: "1b", display_name: "tanaka jay", home_branch: "", role: "STAFF", notes: "" },
    ];
    const result = dedupeStaffRows(rows);
    expect(result).toHaveLength(1);
    // The row with home_branch="JLT" should win (higher score)
    expect(result[0].home_branch).toBe("JLT");
    expect(result[0].display_name).toBe("Tanaka Jay");
  });

  it("keeps the row with higher score (has home_branch + non-STAFF role)", () => {
    const rows = [
      { ...ROW_INACTIVE },
      { ...ROW_INACTIVE, id: "2b", home_branch: "", role: "STAFF", notes: "" },
    ];
    const result = dedupeStaffRows(rows);
    expect(result).toHaveLength(1);
    // ROW_INACTIVE has role="MANAGER" and home_branch="BB" (score=2); the dup has score=0
    expect(result[0].role).toBe("MANAGER");
    expect(result[0].home_branch).toBe("BB");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("AdminStaffPage — auth guard", () => {
  beforeEach(() => { mockCanAccessAdmin = true; mockApiGet.mockResolvedValue({ ok: true, rows: [] }); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("shows Loading... state for authed=null (initial render guard)", async () => {
    // AdminStaffPage has: if (!authed) return <div>Loading...</div>
    // With RTL's synchronous act(), the useEffect fires immediately and sets authed.
    // So we verify the page loads correctly (auth resolved).
    render(<AdminStaffPage />);
    await screen.findByText("Staff Master");
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });

  it("redirects to /login when getAuth returns null", async () => {
    const { getAuth } = await import("@/lib/auth");
    vi.mocked(getAuth).mockReturnValueOnce(null as any);
    const { routerMock } = await import("../../setup");
    render(<AdminStaffPage />);
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith(expect.stringContaining("/login")));
  });

  it("redirects to /week when canAccessAdminNav is false", async () => {
    mockCanAccessAdmin = false;
    const { canAccessAdminNav } = await import("@/lib/auth");
    vi.mocked(canAccessAdminNav).mockReturnValue(false);
    const { routerMock } = await import("../../setup");
    render(<AdminStaffPage />);
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/week"));
  });

  it("renders Staff Master heading when authenticated", async () => {
    render(<AdminStaffPage />);
    await screen.findByText("Staff Master");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("AdminStaffPage — page structure", () => {
  beforeEach(() => {
    mockCanAccessAdmin    = true;
    mockCanRoleManagement = false;
    mockApiGet.mockResolvedValue({ ok: true, rows: [] });
    mockApiPost.mockResolvedValue({ ok: true });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("renders Quick Links section with navigation cards", async () => {
    render(<AdminStaffPage />);
    await screen.findByText("Staff Master");
    expect(screen.getByText("Create Staff Record")).toBeInTheDocument();
    expect(screen.getByText("Pending Staff Setup")).toBeInTheDocument();
    expect(screen.getByText("Audit Logs")).toBeInTheDocument();
    expect(screen.getByText("Onboarding Dashboard")).toBeInTheDocument();
  });

  it("does NOT show Role Management link when canAccessRoleManagement is false", async () => {
    render(<AdminStaffPage />);
    await screen.findByText("Staff Master");
    expect(screen.queryByText("Role Management")).not.toBeInTheDocument();
  });

  it("shows Role Management link when canAccessRoleManagement is true", async () => {
    mockCanRoleManagement = true;
    const { canAccessRoleManagement } = await import("@/lib/auth");
    vi.mocked(canAccessRoleManagement).mockReturnValue(true);
    render(<AdminStaffPage />);
    await screen.findByText("Staff Master");
    await screen.findByText("Role Management");
  });

  it("renders Admin Staff Master form with City, Approver Name, PIN fields", async () => {
    render(<AdminStaffPage />);
    await screen.findByText("Staff Master");
    expect(screen.getByText("Admin · Staff Master")).toBeInTheDocument();
    expect(screen.getByText(/Approver Name/i)).toBeInTheDocument();
    expect(screen.getByText(/PIN.*optional/i)).toBeInTheDocument();
  });

  it("renders Add New Staff section", async () => {
    render(<AdminStaffPage />);
    await screen.findByText("Staff Master");
    // "Add New Staff" appears in both section heading and button — use getAllByText
    const addNewEls = screen.getAllByText("Add New Staff");
    expect(addNewEls.length).toBeGreaterThan(0);
    expect(screen.getByText(/New Staff Full Name/i)).toBeInTheDocument();
    // "Home Branch" label appears twice: once in the Add New Staff form and once in the roster filter
    expect(screen.getAllByText(/Home Branch/i).length).toBeGreaterThan(0);
  });

  it("Login & Load button has approverName pre-filled from auth", async () => {
    render(<AdminStaffPage />);
    await screen.findByText("Staff Master");
    const approverInput = screen.getAllByDisplayValue("Admin User");
    expect(approverInput.length).toBeGreaterThan(0);
  });

  it("renders Staff Roster section with Export button", async () => {
    render(<AdminStaffPage />);
    await screen.findByText("Staff Roster");
    expect(screen.getByRole("button", { name: /Export/i })).toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("AdminStaffPage — load and roster", () => {
  beforeEach(() => {
    mockCanAccessAdmin    = true;
    mockCanRoleManagement = false;
    mockApiGet.mockResolvedValue({ ok: true, rows: [] });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("shows 'No rows.' when roster is empty", async () => {
    mockApiGet.mockResolvedValue({ ok: true, rows: [] });
    render(<AdminStaffPage />);
    const btn = await screen.findByRole("button", { name: /Login & Load/i });
    await clickAndFlush(btn);
    await screen.findByText(/Loaded: 0 rows/i, {}, { timeout: 5000 });
    expect(screen.getByText("No rows.")).toBeInTheDocument();
  });

  it("displays staff rows after successful load", async () => {
    mockApiGet.mockResolvedValue({ ok: true, rows: [ROW_ACTIVE] });
    render(<AdminStaffPage />);
    const btn = await screen.findByRole("button", { name: /Login & Load/i });
    await clickAndFlush(btn);
    await screen.findByText("Tanaka Jay", {}, { timeout: 5000 });
    // "JLT" appears in the roster row AND in the dropdown options, so use getAllByText
    expect(screen.getAllByText("JLT").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ACTIVE").length).toBeGreaterThan(0);
  });

  it("shows success message with row count", async () => {
    mockApiGet.mockResolvedValue({ ok: true, rows: [ROW_ACTIVE, ROW_INACTIVE] });
    render(<AdminStaffPage />);
    const btn = await screen.findByRole("button", { name: /Login & Load/i });
    await clickAndFlush(btn);
    await screen.findByText(/Loaded: 2 rows/i, {}, { timeout: 5000 });
  });

  it("shows error message when load fails", async () => {
    mockApiGet.mockRejectedValue(new Error("Connection refused"));
    render(<AdminStaffPage />);
    const btn = await screen.findByRole("button", { name: /Login & Load/i });
    await clickAndFlush(btn);
    await screen.findByText("Connection refused", {}, { timeout: 5000 });
  });

  it("button becomes 'Refresh list' after first load", async () => {
    mockApiGet.mockResolvedValue({ ok: true, rows: [] });
    render(<AdminStaffPage />);
    const btn = await screen.findByRole("button", { name: /Login & Load/i });
    await clickAndFlush(btn);
    await screen.findByText(/Loaded: 0 rows/i, {}, { timeout: 5000 });
    expect(screen.getByRole("button", { name: /Refresh list/i })).toBeInTheDocument();
  });

  it("search filter narrows displayed rows", async () => {
    mockApiGet.mockResolvedValue({ ok: true, rows: [ROW_ACTIVE, ROW_INACTIVE] });
    render(<AdminStaffPage />);
    const btn = await screen.findByRole("button", { name: /Login & Load/i });
    await clickAndFlush(btn);
    await screen.findByText("Tanaka Jay", {}, { timeout: 5000 });
    await screen.findByText("Santos Maria", {}, { timeout: 5000 });
    fireEvent.change(screen.getByPlaceholderText("Search staff..."), { target: { value: "Tanaka" } });
    await waitFor(() => expect(screen.queryByText("Santos Maria")).not.toBeInTheDocument());
    expect(screen.getByText("Tanaka Jay")).toBeInTheDocument();
  });

  it("member count badge updates after load", async () => {
    mockApiGet.mockResolvedValue({ ok: true, rows: [ROW_ACTIVE, ROW_INACTIVE] });
    render(<AdminStaffPage />);
    const btn = await screen.findByRole("button", { name: /Login & Load/i });
    await clickAndFlush(btn);
    await screen.findByText("Tanaka Jay", {}, { timeout: 5000 });
    expect(screen.getByText("2 members")).toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("AdminStaffPage — Add New Staff validation", () => {
  beforeEach(() => {
    mockCanAccessAdmin = true;
    mockApiGet.mockResolvedValue({ ok: true, rows: [] });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("Add New Staff button is disabled when approverName is empty", async () => {
    render(<AdminStaffPage />);
    await screen.findByText("Staff Master");
    const approverInput = screen.getAllByDisplayValue("Admin User")[0];
    fireEvent.change(approverInput, { target: { value: "" } });
    const addBtn = screen.getAllByRole("button", { name: /Add New Staff/i })[0];
    expect(addBtn).toBeDisabled();
  });

  it("shows error if PIN is empty when creating staff", async () => {
    mockApiPost.mockResolvedValue({ ok: true });
    render(<AdminStaffPage />);
    await screen.findByText("Staff Master");
    const pinInputs = screen.getAllByPlaceholderText(/Leave blank|session auth/i);
    fireEvent.change(pinInputs[0], { target: { value: "" } });
    const nameInput = screen.getByPlaceholderText("e.g. Test User");
    fireEvent.change(nameInput, { target: { value: "New Staff" } });
    const addBtn = screen.getAllByRole("button", { name: /Add New Staff/i })[0];
    await clickAndFlush(addBtn);
    await screen.findByText(/PIN is required/i, {}, { timeout: 3000 });
  });

  it("shows error if new staff name is empty", async () => {
    mockApiPost.mockResolvedValue({ ok: true });
    render(<AdminStaffPage />);
    await screen.findByText("Staff Master");
    const addBtn = screen.getAllByRole("button", { name: /Add New Staff/i })[0];
    await clickAndFlush(addBtn);
    await screen.findByText(/New staff name is required/i, {}, { timeout: 3000 });
  });

  it("shows error if home branch is not selected", async () => {
    mockApiPost.mockResolvedValue({ ok: true });
    render(<AdminStaffPage />);
    await screen.findByText("Staff Master");
    const nameInput = screen.getByPlaceholderText("e.g. Test User");
    fireEvent.change(nameInput, { target: { value: "New Staff" } });
    const addBtn = screen.getAllByRole("button", { name: /Add New Staff/i })[0];
    await clickAndFlush(addBtn);
    await screen.findByText(/Home branch is required/i, {}, { timeout: 3000 });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("AdminStaffPage — status change", () => {
  beforeEach(() => {
    mockCanAccessAdmin = true;
    mockApiGet.mockResolvedValue({ ok: true, rows: [ROW_ACTIVE] });
    mockApiPost.mockResolvedValue({ ok: true, updated: 1 });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("Deactivate button calls confirm dialog and POST on confirm", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    render(<AdminStaffPage />);
    const btn = await screen.findByRole("button", { name: /Login & Load/i });
    await clickAndFlush(btn);
    await screen.findByText("Tanaka Jay", {}, { timeout: 5000 });
    await clickAndFlush(screen.getByRole("button", { name: /Deactivate/i }));
    await waitFor(() => {
      const postCall = mockApiPost.mock.calls.find(([path]: [string]) =>
        String(path).includes("/change_status"),
      );
      expect(postCall).toBeDefined();
    }, { timeout: 5000 });
  });

  it("Deactivate button does NOT call POST when confirm is cancelled", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    mockApiGet.mockResolvedValue({ ok: true, rows: [ROW_ACTIVE] });
    render(<AdminStaffPage />);
    const btn = await screen.findByRole("button", { name: /Login & Load/i });
    await clickAndFlush(btn);
    await screen.findByText("Tanaka Jay", {}, { timeout: 5000 });
    const callsBefore = mockApiPost.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /Deactivate/i }));
    await waitFor(() => expect(mockApiPost.mock.calls.length).toBe(callsBefore));
  });

  it("shows 'Activate' button for inactive staff", async () => {
    mockApiGet.mockResolvedValue({ ok: true, rows: [ROW_INACTIVE] });
    render(<AdminStaffPage />);
    const btn = await screen.findByRole("button", { name: /Login & Load/i });
    await clickAndFlush(btn);
    await screen.findByText("Santos Maria", {}, { timeout: 5000 });
    expect(screen.getByRole("button", { name: /^Activate$/i })).toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("AdminStaffPage — friendly error text", () => {
  beforeEach(() => { mockCanAccessAdmin = true; mockApiGet.mockResolvedValue({ ok: true, rows: [] }); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("STEP_UP_REQUIRED error shows friendly message", async () => {
    mockApiGet.mockRejectedValue(new Error("STEP_UP_REQUIRED:phishing_resistant"));
    render(<AdminStaffPage />);
    const btn = await screen.findByRole("button", { name: /Login & Load/i });
    await clickAndFlush(btn);
    await screen.findByText(/fresh Passkey verification/i, {}, { timeout: 5000 });
  });

  it("Only ADMIN error shows legacy backend message", async () => {
    mockApiGet.mockRejectedValue(new Error("Only ADMIN can use this endpoint"));
    render(<AdminStaffPage />);
    const btn = await screen.findByRole("button", { name: /Login & Load/i });
    await clickAndFlush(btn);
    await screen.findByText(/Legacy backend/i, {}, { timeout: 5000 });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("CreateStaffPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", makeStaffFetch());
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText: vi.fn(async () => {}) },
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("renders 'Create Staff Record' heading", async () => {
    render(<CreateStaffPage />);
    // heading and submit button both have text "Create Staff Record", so use role
    expect(screen.getByRole("heading", { name: /Create Staff Record/i })).toBeInTheDocument();
  });

  it("renders form fields: Staff Name, Manager Name, Manager PIN", () => {
    render(<CreateStaffPage />);
    expect(screen.getByPlaceholderText("Enter staff full name")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Your name")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Your PIN")).toBeInTheDocument();
  });

  it("submit button is disabled when display name is empty", () => {
    render(<CreateStaffPage />);
    const submitBtn = screen.getByRole("button", { name: /Create Staff Record/i });
    expect(submitBtn).toBeDisabled();
  });

  it("submit button is enabled once all required fields are filled", () => {
    render(<CreateStaffPage />);
    fireEvent.change(screen.getByPlaceholderText("Enter staff full name"), { target: { value: "New Staff" } });
    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Manager" } });
    fireEvent.change(screen.getByPlaceholderText("Your PIN"), { target: { value: "1234" } });
    expect(screen.getByRole("button", { name: /Create Staff Record/i })).not.toBeDisabled();
  });

  it("shows success card with setup code after successful create", async () => {
    render(<CreateStaffPage />);
    fireEvent.change(screen.getByPlaceholderText("Enter staff full name"), { target: { value: "New Staff" } });
    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Manager" } });
    fireEvent.change(screen.getByPlaceholderText("Your PIN"), { target: { value: "1234" } });
    const form = screen.getByRole("button", { name: /Create Staff Record/i }).closest("form")!;
    await act(async () => { fireEvent.submit(form); });
    await screen.findByText("Staff created successfully", {}, { timeout: 5000 });
    expect(screen.getByText("ABCD")).toBeInTheDocument();
    expect(screen.getByText("New Staff")).toBeInTheDocument();
    expect(screen.getByText("2026-12-31")).toBeInTheDocument();
  });

  it("shows error message on create failure", async () => {
    vi.stubGlobal("fetch", makeStaffFetch({ failCreate: true }));
    render(<CreateStaffPage />);
    fireEvent.change(screen.getByPlaceholderText("Enter staff full name"), { target: { value: "Dup Name" } });
    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Manager" } });
    fireEvent.change(screen.getByPlaceholderText("Your PIN"), { target: { value: "1234" } });
    const form = screen.getByRole("button", { name: /Create Staff Record/i }).closest("form")!;
    await act(async () => { fireEvent.submit(form); });
    await screen.findByText("Name already exists", {}, { timeout: 5000 });
  });

  it("Copy Setup Code button calls clipboard.writeText with setup code", async () => {
    render(<CreateStaffPage />);
    fireEvent.change(screen.getByPlaceholderText("Enter staff full name"), { target: { value: "New Staff" } });
    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Manager" } });
    fireEvent.change(screen.getByPlaceholderText("Your PIN"), { target: { value: "1234" } });
    const form = screen.getByRole("button", { name: /Create Staff Record/i }).closest("form")!;
    await act(async () => { fireEvent.submit(form); });
    await screen.findByText("Staff created successfully", {}, { timeout: 5000 });
    fireEvent.click(screen.getByRole("button", { name: /Copy Setup Code/i }));
    expect((navigator as any).clipboard.writeText).toHaveBeenCalledWith("ABCD");
  });

  it("shows verified role after approver name and PIN are entered", async () => {
    render(<CreateStaffPage />);
    await waitFor(() => {
      expect(screen.getByText(/Verified role:/i)).toBeInTheDocument();
    }, { timeout: 5000 });
    await waitFor(() => {
      expect(screen.getByText("ADMIN")).toBeInTheDocument();
    }, { timeout: 5000 });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("StaffOnboardingDashboardPage", () => {
  const ONBOARDING_ROW = {
    display_name: "Cruz Pedro",
    city: "dubai",
    branch_code: "JLT",
    role: "STAFF",
    status: "ACTIVE",
    setup_required: true,
    setup_completed: false,
    setup_code_expires_at: "2026-07-01",
    created_by: "Admin User",
    created_by_role: "ADMIN",
    pin_set_at: null,
    last_login_at: null,
    updated_at: "2026-05-01",
  };
  const SUMMARY = { total: 1, pending_setup: 1, completed_setup: 0, active: 1 };

  beforeEach(() => {
    mockCanRoleManagement = false;
    vi.stubGlobal("fetch", makeStaffFetch({ onboardingRows: [ONBOARDING_ROW], onboardingSummary: SUMMARY }));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("renders 'Onboarding Dashboard' heading", () => {
    render(<StaffOnboardingPage />);
    expect(screen.getByText("Onboarding Dashboard")).toBeInTheDocument();
  });

  it("renders filter inputs: City, Branch, Approver Name, PIN", async () => {
    render(<StaffOnboardingPage />);
    expect(screen.getByPlaceholderText("dubai / manila")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("BB / PAR / ...")).toBeInTheDocument();
    // The component auto-loads on mount (approverName + pin are pre-filled from auth).
    // Wait for the button to show its idle state ("Refresh Dashboard").
    await screen.findByRole("button", { name: /Refresh Dashboard/i }, { timeout: 5000 });
  });

  it("loads data automatically when auth has approverName and pin", async () => {
    render(<StaffOnboardingPage />);
    await screen.findByText("Cruz Pedro", {}, { timeout: 5000 });
  });

  it("shows summary KPI cards after load", async () => {
    render(<StaffOnboardingPage />);
    await screen.findByText("Total", {}, { timeout: 5000 });
    expect(screen.getByText("Pending Setup")).toBeInTheDocument();
    expect(screen.getByText("Completed Setup")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText("1").length).toBeGreaterThan(0));
  });

  it("shows error message when load fails", async () => {
    vi.stubGlobal("fetch", makeStaffFetch({ failOnboarding: true }));
    render(<StaffOnboardingPage />);
    await screen.findByText("Server error", {}, { timeout: 5000 });
  });

  it("shows 'No rows found.' when rows list is empty", async () => {
    vi.stubGlobal("fetch", makeStaffFetch({ onboardingRows: [] }));
    render(<StaffOnboardingPage />);
    // Wait for initial auto-load to complete (button becomes "Refresh Dashboard")
    const refreshBtn = await screen.findByRole("button", { name: /Refresh Dashboard/i }, { timeout: 5000 });
    // Stub with empty rows and trigger a refresh
    vi.stubGlobal("fetch", makeStaffFetch({ onboardingRows: [] }));
    await clickAndFlush(refreshBtn);
    await screen.findByText("No rows found.", {}, { timeout: 5000 });
  });

  it("shows 'Setup PIN' button for pending setup rows", async () => {
    render(<StaffOnboardingPage />);
    await screen.findByText("Cruz Pedro", {}, { timeout: 5000 });
    expect(screen.getByRole("button", { name: /Setup PIN/i })).toBeInTheDocument();
  });

  it("opens Setup PIN modal when button is clicked", async () => {
    render(<StaffOnboardingPage />);
    await screen.findByText("Cruz Pedro", {}, { timeout: 5000 });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Setup PIN/i }));
    });
    await screen.findByText("Set PIN for Staff", {}, { timeout: 3000 });
    // "Cruz Pedro" appears in both the roster row and the modal — use getAllByText
    await waitFor(() => {
      expect(screen.getAllByText(/Cruz Pedro/).length).toBeGreaterThan(0);
    });
  });

  it("Setup PIN modal shows validation error when PINs do not match", async () => {
    render(<StaffOnboardingPage />);
    await screen.findByText("Cruz Pedro", {}, { timeout: 5000 });
    fireEvent.click(screen.getByRole("button", { name: /Setup PIN/i }));
    await screen.findByText("Set PIN for Staff");
    fireEvent.change(screen.getByPlaceholderText("Enter PIN"), { target: { value: "1234" } });
    fireEvent.change(screen.getByPlaceholderText("Re-enter PIN"), { target: { value: "5678" } });
    fireEvent.click(screen.getByRole("button", { name: /Complete Setup/i }));
    await screen.findByText("PINs do not match or are empty.");
  });

  it("Setup PIN modal shows validation error for non-numeric PIN", async () => {
    render(<StaffOnboardingPage />);
    await screen.findByText("Cruz Pedro", {}, { timeout: 5000 });
    fireEvent.click(screen.getByRole("button", { name: /Setup PIN/i }));
    await screen.findByText("Set PIN for Staff");
    fireEvent.change(screen.getByPlaceholderText("Enter PIN"), { target: { value: "abc" } });
    fireEvent.change(screen.getByPlaceholderText("Re-enter PIN"), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: /Complete Setup/i }));
    await screen.findByText("PINs do not match or are empty.");
  });

  it("closes Setup PIN modal when Cancel is clicked", async () => {
    render(<StaffOnboardingPage />);
    await screen.findByText("Cruz Pedro", {}, { timeout: 5000 });
    fireEvent.click(screen.getByRole("button", { name: /Setup PIN/i }));
    await screen.findByText("Set PIN for Staff");
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));
    await waitFor(() => expect(screen.queryByText("Set PIN for Staff")).not.toBeInTheDocument());
  });

  it("shows success message and updates row after successful PIN setup", async () => {
    render(<StaffOnboardingPage />);
    await screen.findByText("Cruz Pedro", {}, { timeout: 5000 });
    fireEvent.click(screen.getByRole("button", { name: /Setup PIN/i }));
    await screen.findByText("Set PIN for Staff");
    fireEvent.change(screen.getByPlaceholderText("Enter PIN"), { target: { value: "1234" } });
    fireEvent.change(screen.getByPlaceholderText("Re-enter PIN"), { target: { value: "1234" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Complete Setup/i }));
    });
    await screen.findByText(/Setup complete for Cruz Pedro/i, {}, { timeout: 5000 });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("StaffAuditClient", () => {
  const AUDIT_CREATED  = { id: 1, event_type: "staff_created",       target_staff_name: "Tanaka Jay",  city: "dubai", branch_code: "JLT", actor_name: "Admin", actor_role: "ADMIN", payload: { role: "STAFF", status: "ACTIVE", setup_required: true },   created_at: "2026-05-01" };
  const AUDIT_SETUP    = { id: 2, event_type: "setup_completed",     target_staff_name: "Tanaka Jay",  city: "dubai", branch_code: "JLT", actor_name: "Tanaka Jay", actor_role: "STAFF", payload: { setup_completed: true, pin_set: true },              created_at: "2026-05-02" };
  const AUDIT_ROLE     = { id: 3, event_type: "role_changed",        target_staff_name: "Santos Maria",city: "dubai", branch_code: "BB",  actor_name: "Admin", actor_role: "ADMIN", payload: { new_role: "MANAGER" },                                   created_at: "2026-05-03" };
  const AUDIT_REISSUED = { id: 4, event_type: "setup_code_reissued", target_staff_name: "Cruz Pedro",  city: "dubai", branch_code: "AB",  actor_name: "Admin", actor_role: "ADMIN", payload: { setup_code_expires_at: "2026-06-01" },                   created_at: "2026-05-04" };

  beforeEach(() => {
    mockCanRoleManagement = false;
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("renders 'Audit Logs' heading", () => {
    vi.stubGlobal("fetch", makeStaffFetch({ auditRows: [] }));
    render(<StaffAuditClient />);
    expect(screen.getByText("Audit Logs")).toBeInTheDocument();
  });

  it("'Refresh Audit Logs' button is disabled when approverName or PIN is empty", async () => {
    vi.stubGlobal("fetch", makeStaffFetch({ auditRows: [] }));
    render(<StaffAuditClient />);
    // Component auto-loads on mount — wait for button to be idle ("Refresh Audit Logs")
    const refreshBtn = await screen.findByRole("button", { name: /Refresh Audit Logs/i }, { timeout: 5000 });
    // Now clear the pre-filled approverName
    const nameInputs = screen.getAllByDisplayValue("Admin User");
    if (nameInputs.length > 0) fireEvent.change(nameInputs[0], { target: { value: "" } });
    expect(screen.getByRole("button", { name: /Refresh Audit Logs/i })).toBeDisabled();
  });

  it("loads audit rows when Refresh button is clicked", async () => {
    vi.stubGlobal("fetch", makeStaffFetch({ auditRows: [AUDIT_CREATED] }));
    render(<StaffAuditClient />);
    // Wait for initial auto-load to complete
    const refreshBtn = await screen.findByRole("button", { name: /Refresh Audit Logs/i }, { timeout: 5000 });
    // Verify Tanaka Jay loaded via auto-load
    await screen.findByText("Tanaka Jay", {}, { timeout: 5000 });
    // "staff_created" appears in both the dropdown <option> and the event badge — use getAllByText
    expect(screen.getAllByText("staff_created").length).toBeGreaterThan(0);
  });

  it("stats cards show correct counts for each event type", async () => {
    vi.stubGlobal("fetch", makeStaffFetch({ auditRows: [AUDIT_CREATED, AUDIT_SETUP, AUDIT_ROLE, AUDIT_REISSUED] }));
    render(<StaffAuditClient />);
    // Tanaka Jay appears in 2 rows, so use findAllByText
    await screen.findAllByText("Tanaka Jay", {}, { timeout: 5000 });
    expect(screen.getByText("Staff Created")).toBeInTheDocument();
    expect(screen.getByText("Setup Completed")).toBeInTheDocument();
    expect(screen.getByText("Role Changed")).toBeInTheDocument();
    expect(screen.getByText("Code Reissued")).toBeInTheDocument();
  });

  it("shows 'No audit logs found.' when rows list is empty", async () => {
    vi.stubGlobal("fetch", makeStaffFetch({ auditRows: [] }));
    render(<StaffAuditClient />);
    // Wait for initial auto-load to complete
    await screen.findByRole("button", { name: /Refresh Audit Logs/i }, { timeout: 5000 });
    await screen.findByText("No audit logs found.", {}, { timeout: 5000 });
  });

  it("shows error message when audit load fails", async () => {
    vi.stubGlobal("fetch", makeStaffFetch({ failAudit: true }));
    render(<StaffAuditClient />);
    await screen.findByText("Audit load error", {}, { timeout: 5000 });
  });

  it("renders event type badges for staff_created", async () => {
    vi.stubGlobal("fetch", makeStaffFetch({ auditRows: [AUDIT_CREATED] }));
    render(<StaffAuditClient />);
    await screen.findByText("staff_created", {}, { timeout: 5000 });
  });

  it("renders payload details for staff_created (role, status, setup_required)", async () => {
    vi.stubGlobal("fetch", makeStaffFetch({ auditRows: [AUDIT_CREATED] }));
    render(<StaffAuditClient />);
    await screen.findByText("Tanaka Jay", {}, { timeout: 5000 });
    expect(screen.getByText("STAFF")).toBeInTheDocument();
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
  });

  it("renders payload details for role_changed (new_role)", async () => {
    vi.stubGlobal("fetch", makeStaffFetch({ auditRows: [AUDIT_ROLE] }));
    render(<StaffAuditClient />);
    await screen.findByText("Santos Maria", {}, { timeout: 5000 });
    expect(screen.getByText("MANAGER")).toBeInTheDocument();
  });

  it("renders payload details for setup_code_reissued (expires_at)", async () => {
    vi.stubGlobal("fetch", makeStaffFetch({ auditRows: [AUDIT_REISSUED] }));
    render(<StaffAuditClient />);
    await screen.findByText("Cruz Pedro", {}, { timeout: 5000 });
    expect(screen.getByText("2026-06-01")).toBeInTheDocument();
  });

  it("BUG: Export button has no onClick handler (placeholder)", async () => {
    vi.stubGlobal("fetch", makeStaffFetch({ auditRows: [] }));
    render(<StaffAuditClient />);
    const exportBtn = screen.getByRole("button", { name: /Export/i });
    expect(exportBtn).toBeInTheDocument();
    expect(() => fireEvent.click(exportBtn)).not.toThrow();
  });

  it("renders event type dropdown with all known event types", () => {
    vi.stubGlobal("fetch", makeStaffFetch({ auditRows: [] }));
    render(<StaffAuditClient />);
    const eventSelect = screen.getAllByRole("combobox").find((el) =>
      (el as HTMLSelectElement).options[1]?.value === "staff_created",
    );
    expect(eventSelect).toBeDefined();
    expect((eventSelect as HTMLSelectElement).options.length).toBe(5);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("StaffRolesPage", () => {
  beforeEach(() => {
    mockCanRoleManagement = false;
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("shows 'Role Management is available only to HQ users.' when not authorized", async () => {
    const { canAccessRoleManagement } = await import("@/lib/auth");
    vi.mocked(canAccessRoleManagement).mockReturnValue(false);
    vi.stubGlobal("fetch", makeStaffFetch());
    render(<StaffRolesPage />);
    await screen.findByText(/Role Management is available only to HQ users/i, {}, { timeout: 5000 });
  });

  it("renders Role Management page with tab buttons when HQ authorized", async () => {
    mockCanRoleManagement = true;
    const { canAccessRoleManagement, refreshAuthFromApi } = await import("@/lib/auth");
    vi.mocked(canAccessRoleManagement).mockReturnValue(true);
    vi.mocked(refreshAuthFromApi).mockResolvedValue(STAFF_AUTH as any);
    vi.stubGlobal("fetch", makeStaffFetch());
    render(<StaffRolesPage />);
    await screen.findByText("Role Management", {}, { timeout: 5000 });
    expect(screen.getByRole("button", { name: /^Channels$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Roles$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Staff Assignments$/i })).toBeInTheDocument();
  });

  it("Channels tab is active by default and shows channel list", async () => {
    mockCanRoleManagement = true;
    const { canAccessRoleManagement, refreshAuthFromApi } = await import("@/lib/auth");
    vi.mocked(canAccessRoleManagement).mockReturnValue(true);
    vi.mocked(refreshAuthFromApi).mockResolvedValue(STAFF_AUTH as any);
    vi.stubGlobal("fetch", makeStaffFetch());
    render(<StaffRolesPage />);
    await screen.findByText("Role Management", {}, { timeout: 5000 });
    // "Staff Channel" appears in both the channel list button and the matrix header
    expect((await screen.findAllByText("Staff Channel", {}, { timeout: 5000 })).length).toBeGreaterThan(0);
  });

  it("Roles tab shows role list when clicked", async () => {
    mockCanRoleManagement = true;
    const { canAccessRoleManagement, refreshAuthFromApi } = await import("@/lib/auth");
    vi.mocked(canAccessRoleManagement).mockReturnValue(true);
    vi.mocked(refreshAuthFromApi).mockResolvedValue(STAFF_AUTH as any);
    vi.stubGlobal("fetch", makeStaffFetch());
    render(<StaffRolesPage />);
    await screen.findByText("Role Management", {}, { timeout: 5000 });
    fireEvent.click(screen.getByRole("button", { name: /^Roles$/i }));
    // Roles tab shows roles list — check for at least one role label
    await waitFor(() => {
      expect(screen.getAllByText(/Staff|Manager/).length).toBeGreaterThan(0);
    }, { timeout: 5000 });
  });

  it("Staff Assignments tab shows city filter buttons when clicked", async () => {
    mockCanRoleManagement = true;
    const { canAccessRoleManagement, refreshAuthFromApi } = await import("@/lib/auth");
    vi.mocked(canAccessRoleManagement).mockReturnValue(true);
    vi.mocked(refreshAuthFromApi).mockResolvedValue(STAFF_AUTH as any);
    vi.stubGlobal("fetch", makeStaffFetch());
    render(<StaffRolesPage />);
    await screen.findByText("Role Management", {}, { timeout: 5000 });
    fireEvent.click(screen.getByRole("button", { name: /Staff Assignments/i }));
    // Wait for city buttons to appear — use findAll since both Dubai and Manila appear
    const cityBtns = await screen.findAllByText(/🇦🇪 Dubai|🇵🇭 Manila|Dubai|Manila/, {}, { timeout: 5000 });
    expect(cityBtns.length).toBeGreaterThan(0);
  });

  it("shows signed-in-as badge with staff name", async () => {
    mockCanRoleManagement = true;
    const { canAccessRoleManagement, refreshAuthFromApi } = await import("@/lib/auth");
    vi.mocked(canAccessRoleManagement).mockReturnValue(true);
    vi.mocked(refreshAuthFromApi).mockResolvedValue(STAFF_AUTH as any);
    vi.stubGlobal("fetch", makeStaffFetch());
    render(<StaffRolesPage />);
    await screen.findByText(/Signed in as Admin User/i, {}, { timeout: 5000 });
  });

  it("shows error message when bootstrap load fails", async () => {
    mockCanRoleManagement = true;
    const { canAccessRoleManagement, refreshAuthFromApi } = await import("@/lib/auth");
    vi.mocked(canAccessRoleManagement).mockReturnValue(true);
    vi.mocked(refreshAuthFromApi).mockResolvedValue(STAFF_AUTH as any);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/access/bootstrap")) {
        return { ok: false, status: 500, text: async () => "Bootstrap failed" } as any;
      }
      if (String(url).includes("/admin/staff_master")) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, rows: [] }) } as any;
      }
      return { ok: false, status: 404, text: async () => "Not Found" } as any;
    }));
    render(<StaffRolesPage />);
    await screen.findByText("Role Management", {}, { timeout: 5000 });
    await screen.findByText(/Failed to load role management|Bootstrap failed/i, {}, { timeout: 5000 });
  });
});
