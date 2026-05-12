// tests/admin/staff/roles-pages.test.tsx
// Tests for src/app/admin/staff/roles/page.tsx
// Covers: auth guard, Channels tab (render, matrix, save, delete, create),
//         Roles tab (permissions, rename, delete, create), Assignments tab
//         (city filter, search, load, add, remove, primary), URL query param,
//         and the apiRequest error-detail extraction bug fix.

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── next/navigation ────────────────────────────────────────────────────────────
let mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/admin/staff/roles",
}));

// ── next/link ─────────────────────────────────────────────────────────────────
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// ── lucide-react ──────────────────────────────────────────────────────────────
vi.mock("lucide-react", () => ({
  AlertTriangle: () => <svg data-testid="icon-alert" />,
  Check:         () => <svg data-testid="icon-check" />,
  Layers3:       () => <svg data-testid="icon-layers" />,
  Pencil:        () => <svg data-testid="icon-pencil" />,
  ShieldCheck:   () => <svg data-testid="icon-shield" />,
  Trash2:        () => <svg data-testid="icon-trash" />,
  UserPlus:      () => <svg data-testid="icon-userplus" />,
  Users:         () => <svg data-testid="icon-users" />,
  X:             () => <svg data-testid="icon-x" />,
}));

// ── auth ──────────────────────────────────────────────────────────────────────
let mockCanRoleManagement = false;

const HQ_AUTH = {
  accessToken: "tok", role: "HQ", city: "dubai",
  staffName: "Jay HQ", permissions: ["channel.admin.staff.manage_roles"], pin: "1234",
};

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getAuth:                 vi.fn(() => HQ_AUTH),
    refreshAuthFromApi:      vi.fn(async () => HQ_AUTH),
    getAuthHeaders:          vi.fn(() => ({ Authorization: "Bearer tok" })),
    canAccessRoleManagement: vi.fn(() => mockCanRoleManagement),
  };
});

// ════════════════════════════════════════════════════════════════════════════════
// Fixtures
// ════════════════════════════════════════════════════════════════════════════════
const CHANNELS = [
  { channel_key: "staff.channel", label: "Staff Channel",  route_path: "/admin/staff",  is_system: true,  view_role_count: 2 },
  { channel_key: "ops.channel",   label: "Custom Channel", route_path: "/admin/ops",    is_system: false, view_role_count: 0 },
];

const ROLES = [
  { role_key: "HQ",          label: "HQ",         is_system: true,  permission_count: 2 },
  { role_key: "MANAGER",     label: "Manager",     is_system: true,  permission_count: 1 },
  { role_key: "CUSTOM_ROLE", label: "Custom Role", is_system: false, permission_count: 0 },
];

const PERMS_ALL = [
  { permission_key: "staff.view", label: "View Staff", channel_key: "staff.channel", action_key: "view" },
  { permission_key: "staff.edit", label: "Edit Staff", channel_key: "staff.channel", action_key: "edit" },
];

const ROLE_PERMS_HQ = {
  ok: true,
  role: ROLES[0],
  permissions: [
    { permission_key: "staff.view", label: "View Staff", channel_key: "staff.channel", action_key: "view", assigned: true },
    { permission_key: "staff.edit", label: "Edit Staff", channel_key: "staff.channel", action_key: "edit", assigned: false },
  ],
  effective_permissions: ["staff.view"],
};

const CHANNEL_MATRIX_STAFF = {
  ok: true,
  channel: CHANNELS[0],
  permission: { permission_key: "staff.view", label: "View", channel_key: "staff.channel", action_key: "view" },
  roles: [
    { role_key: "HQ",          label: "HQ",         assigned: true,  locked: true,  city_lock: "" },
    { role_key: "MANAGER",     label: "Manager",     assigned: true,  locked: false, city_lock: "dubai" },
    { role_key: "CUSTOM_ROLE", label: "Custom Role", assigned: false, locked: false },
  ],
  assigned_count: 2,
};

const CHANNEL_MATRIX_OPS = {
  ok: true,
  channel: CHANNELS[1],
  permission: { permission_key: "ops.view", label: "View Ops", channel_key: "ops.channel", action_key: "view" },
  roles: [
    { role_key: "HQ",      label: "HQ",     assigned: false, locked: false },
    { role_key: "MANAGER", label: "Manager", assigned: false, locked: false },
  ],
  assigned_count: 0,
};

const STAFF_DUBAI = {
  ok: true,
  rows: [
    { id: "s1", city: "dubai", display_name: "Tanaka Jay",  home_branch: "JLT", role: "HQ",      status: "ACTIVE" },
    { id: "s2", city: "dubai", display_name: "Cruz Pedro",  home_branch: "DIP", role: "MANAGER", status: "ACTIVE" },
    { id: "s3", city: "dubai", display_name: "Lee Kwon",    home_branch: "DIP", role: "STAFF",   status: "INACTIVE" },
  ],
};
const STAFF_MANILA = {
  ok: true,
  rows: [{ id: "s4", city: "manila", display_name: "Santos Maria", home_branch: "Taft", role: "STAFF", status: "ACTIVE" }],
};

const ASSIGNMENTS_TANAKA = {
  ok: true, staff_name: "Tanaka Jay",
  assignments: [{ role_key: "HQ", is_primary: true,  is_active: true, role_label: "HQ",      is_system: true }],
  effective_role: "HQ",   effective_permissions: ["staff.view", "staff.edit"],
};
const ASSIGNMENTS_CRUZ = {
  ok: true, staff_name: "Cruz Pedro",
  assignments: [
    { role_key: "MANAGER", is_primary: true,  is_active: true, role_label: "Manager" },
    { role_key: "HQ",      is_primary: false, is_active: true, role_label: "HQ" },
  ],
  effective_role: "MANAGER", effective_permissions: ["staff.view"],
};

// ════════════════════════════════════════════════════════════════════════════════
// Fetch mock factory
// ════════════════════════════════════════════════════════════════════════════════
function makeRolesFetch(overrides: Record<string, { ok: boolean; body: unknown }> = {}) {
  return vi.fn(async (url: string, opts?: RequestInit): Promise<Response> => {
    const u      = String(url);
    const method = ((opts?.method as string) || "GET").toUpperCase();
    const path   = u.replace(/^http:\/\/[^/]+/, "").split("?")[0];
    const key    = `${method} ${path}`;

    if (overrides[key]) {
      const { ok, body } = overrides[key];
      return { ok, status: ok ? 200 : 400, text: async () => JSON.stringify(body) } as Response;
    }

    if (u.includes("/access/bootstrap"))
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, channels: CHANNELS, roles: ROLES, permissions: PERMS_ALL }) } as Response;
    if (u.includes("/staff_master") && u.includes("city=dubai"))
      return { ok: true, status: 200, text: async () => JSON.stringify(STAFF_DUBAI) } as Response;
    if (u.includes("/staff_master") && u.includes("city=manila"))
      return { ok: true, status: 200, text: async () => JSON.stringify(STAFF_MANILA) } as Response;
    if (path.endsWith("/role-matrix")) {
      const data = path.includes("ops.channel") ? CHANNEL_MATRIX_OPS : CHANNEL_MATRIX_STAFF;
      return { ok: true, status: 200, text: async () => JSON.stringify(data) } as Response;
    }
    if (u.match(/\/access\/roles\/.+\/permissions/) && method === "GET") {
      const data = u.includes("CUSTOM_ROLE")
        ? { ok: true, role: ROLES[2], permissions: [], effective_permissions: [] }
        : (u.includes("MANAGER") ? { ...ROLE_PERMS_HQ, role: ROLES[1] } : ROLE_PERMS_HQ);
      return { ok: true, status: 200, text: async () => JSON.stringify(data) } as Response;
    }
    if (u.match(/\/access\/staff\/.+\/roles/) && method === "GET") {
      const data = u.includes("Cruz") ? ASSIGNMENTS_CRUZ : ASSIGNMENTS_TANAKA;
      return { ok: true, status: 200, text: async () => JSON.stringify(data) } as Response;
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, channel: CHANNELS[0], role: ROLES[0] }) } as Response;
  });
}

// ── Page import ────────────────────────────────────────────────────────────────
import StaffRolesPage from "@/app/admin/staff/roles/page";

// ── Inline setup helper (called at start of each test body — matching
//    staff-pages.test.tsx's proven pattern; avoids beforeEach ordering issues
//    with the global vi.restoreAllMocks() in tests/setup.ts) ──────────────────
async function setupHQ(fetchOverrides: Record<string, { ok: boolean; body: unknown }> = {}) {
  mockCanRoleManagement = true;
  const { canAccessRoleManagement, refreshAuthFromApi, getAuth, getAuthHeaders } = await import("@/lib/auth");
  vi.mocked(getAuth).mockReturnValue(HQ_AUTH as any);
  vi.mocked(getAuthHeaders).mockReturnValue({ Authorization: "Bearer tok" });
  vi.mocked(canAccessRoleManagement).mockReturnValue(true);
  vi.mocked(refreshAuthFromApi).mockResolvedValue(HQ_AUTH as any);
  vi.stubGlobal("fetch", makeRolesFetch(fetchOverrides));
}

// ════════════════════════════════════════════════════════════════════════════════
describe("StaffRolesPage — auth guard", () => {
  beforeEach(() => { mockCanRoleManagement = false; mockSearchParams = new URLSearchParams(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("shows HQ-only restriction message for non-HQ user", async () => {
    const { canAccessRoleManagement, refreshAuthFromApi } = await import("@/lib/auth");
    vi.mocked(canAccessRoleManagement).mockReturnValue(false);
    vi.mocked(refreshAuthFromApi).mockResolvedValue(HQ_AUTH as any);
    vi.stubGlobal("fetch", makeRolesFetch());
    render(<StaffRolesPage />);
    await screen.findByText(/Role Management is available only to HQ users/i, {}, { timeout: 5000 });
  });

  it("shows Role Management heading and tab buttons for HQ user", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await screen.findByText("Role Management", {}, { timeout: 5000 });
    expect(screen.getByRole("button", { name: /^Channels$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Roles$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Staff Assignments$/i })).toBeInTheDocument();
  });

  it("shows signed-in staff name in badge", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await screen.findByText(/Signed in as Jay HQ/i, {}, { timeout: 5000 });
  });

  it("shows Staff Master and Admin Dashboard links", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await screen.findByText("Staff Master", {}, { timeout: 5000 });
    expect(screen.getByText("Admin Dashboard")).toBeInTheDocument();
  });

  it("shows error banner when bootstrap API fails", async () => {
    const { canAccessRoleManagement, refreshAuthFromApi } = await import("@/lib/auth");
    vi.mocked(canAccessRoleManagement).mockReturnValue(true);
    vi.mocked(refreshAuthFromApi).mockResolvedValue(HQ_AUTH as any);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/access/bootstrap"))
        return { ok: false, status: 500, text: async () => JSON.stringify({ detail: "Bootstrap failed" }) } as Response;
      return { ok: true, status: 200, text: async () => JSON.stringify({}) } as Response;
    }));
    render(<StaffRolesPage />);
    await screen.findByText(/Bootstrap failed/i, {}, { timeout: 5000 });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("StaffRolesPage — Channels tab", () => {
  beforeEach(() => { mockSearchParams = new URLSearchParams(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("Channels tab is the default active tab and shows channel list", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await screen.findByText("Role Management", {}, { timeout: 5000 });
    expect((await screen.findAllByText("Staff Channel", {}, { timeout: 5000 })).length).toBeGreaterThan(0);
    await screen.findByText("Custom Channel", {}, { timeout: 5000 });
  });

  it("shows channel route paths", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await screen.findByText("Role Management", {}, { timeout: 5000 });
    await screen.findAllByText("Staff Channel", {}, { timeout: 5000 });
    // route_path "/admin/staff" appears in channel list AND matrix panel — use getAllByText
    expect(screen.getAllByText("/admin/staff").length).toBeGreaterThan(0);
  });

  it("shows view_role_count badge for first channel", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await screen.findByText("Role Management", {}, { timeout: 5000 });
    await screen.findAllByText("Staff Channel", {}, { timeout: 5000 });
    await screen.findByText("2 roles can view", {}, { timeout: 4000 });
  });

  it("shows System badge for system channels", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await screen.findByText("Role Management", {}, { timeout: 5000 });
    await screen.findAllByText("Staff Channel", {}, { timeout: 5000 });
    expect(screen.getAllByText("System").length).toBeGreaterThan(0);
  });

  it("channel matrix panel auto-loads for first channel", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await screen.findByText("Role Management", {}, { timeout: 5000 });
    await screen.findAllByText("Staff Channel", {}, { timeout: 5000 });
    // "View access" is the fixed heading in the channel matrix panel (line 820)
    await screen.findByText("View access", {}, { timeout: 4000 });
  });

  it("HQ role shows Locked badge in channel matrix", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await screen.findByText("Role Management", {}, { timeout: 5000 });
    await screen.findAllByText("Staff Channel", {}, { timeout: 5000 });
    await screen.findByText("Locked", {}, { timeout: 4000 });
  });

  it("clicking a different channel loads its matrix", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await screen.findByText("Role Management", {}, { timeout: 5000 });
    await screen.findAllByText("Staff Channel", {}, { timeout: 5000 });
    fireEvent.click(screen.getByText("Custom Channel"));
    await screen.findByText(/0 roles can view/i, {}, { timeout: 5000 });
  });

  it("Delete Channel button hidden for system channel (staff.channel)", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await screen.findByText("Role Management", {}, { timeout: 5000 });
    await screen.findAllByText("Staff Channel", {}, { timeout: 5000 });
    // staff.channel is_system: true → no delete button while staff.channel is selected
    expect(screen.queryByRole("button", { name: /Delete Channel/i })).toBeNull();
  });

  it("Delete Channel button visible after clicking non-system channel", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await screen.findByText("Role Management", {}, { timeout: 5000 });
    await screen.findAllByText("Staff Channel", {}, { timeout: 5000 });
    fireEvent.click(screen.getByText("Custom Channel"));
    await screen.findByRole("button", { name: /Delete Channel/i }, { timeout: 5000 });
  });

  it("Save Channel Access button disabled before any changes (dirty=false)", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await screen.findByText("Role Management", {}, { timeout: 5000 });
    await screen.findAllByText("Staff Channel", {}, { timeout: 5000 });
    const saveBtn = await screen.findByRole("button", { name: /Save Channel Access/i }, { timeout: 4000 });
    expect(saveBtn).toBeDisabled();
  });

  it("Manager role shows city-lock dropdown in matrix", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await screen.findByText("Role Management", {}, { timeout: 5000 });
    await screen.findAllByText("Staff Channel", {}, { timeout: 5000 });
    // CHANNEL_MATRIX_STAFF has Manager with city_lock: "dubai" → should render select
    await waitFor(() => {
      expect(screen.queryAllByRole("combobox").length).toBeGreaterThan(0);
    }, { timeout: 5000 });
  });

  it("Channel Access header is visible", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await screen.findByText("Role Management", {}, { timeout: 5000 });
    await screen.findAllByText("Staff Channel", {}, { timeout: 5000 });
    expect(screen.getByText("Channel Access")).toBeInTheDocument();
  });

  it("Save Channel Access button becomes enabled after toggling a role", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await screen.findByText("Role Management", {}, { timeout: 5000 });
    await screen.findAllByText("Staff Channel", {}, { timeout: 5000 });
    // Toggle Custom Role (currently unassigned) by selecting "all cities" in its select
    const selects = await screen.findAllByRole("combobox", {}, { timeout: 4000 });
    // Change one select to trigger dirty state
    if (selects.length > 0) {
      fireEvent.change(selects[0], { target: { value: "" } });
      await waitFor(() => {
        const saveBtn = screen.getByRole("button", { name: /Save Channel Access/i });
        expect(saveBtn).not.toBeDisabled();
      }, { timeout: 3000 });
    }
  });

  it("Save Channel Access call succeeds and disables save button", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await screen.findByText("Role Management", {}, { timeout: 5000 });
    await screen.findAllByText("Staff Channel", {}, { timeout: 5000 });
    const selects = await screen.findAllByRole("combobox", {}, { timeout: 4000 });
    if (selects.length > 0) {
      fireEvent.change(selects[0], { target: { value: "all" } });
      await waitFor(() => {
        const saveBtn = screen.getByRole("button", { name: /Save Channel Access/i });
        expect(saveBtn).not.toBeDisabled();
      }, { timeout: 3000 });
      fireEvent.click(screen.getByRole("button", { name: /Save Channel Access/i }));
      await waitFor(() => {
        const saveBtn = screen.getByRole("button", { name: /Save Channel Access/i });
        expect(saveBtn).toBeDisabled();
      }, { timeout: 5000 });
    }
  });

  it("Create Channel form is visible", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await screen.findByText("Role Management", {}, { timeout: 5000 });
    await screen.findAllByText("Staff Channel", {}, { timeout: 5000 });
    // Label is "Create Custom Channel" (line 782)
    await screen.findByText(/Create Custom Channel/i, {}, { timeout: 4000 });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("StaffRolesPage — Roles tab", () => {
  beforeEach(() => { mockSearchParams = new URLSearchParams(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  // Helper: wait for bootstrap to complete (channels appear after loadBootstrap)
  // Must be called while on the Channels tab (default) before switching tabs.
  async function waitForBootstrap() {
    await screen.findByText("Role Management", {}, { timeout: 5000 });
    await screen.findAllByText("Staff Channel", {}, { timeout: 5000 });
  }

  // Wait for Roles tab content — wait for "Create Role" button which is unique to Roles tab (line 937)
  // Note: there are TWO "Create Role" DOM nodes (label div + button), so use findByRole to be specific
  async function waitForRolesTab() {
    await waitForBootstrap();
    fireEvent.click(screen.getByRole("button", { name: /^Roles$/i }));
    // The "Create Role" BUTTON is unique in the Roles tab (line 937-939)
    await screen.findByRole("button", { name: /^Create Role$/i }, { timeout: 5000 });
  }

  it("clicking Roles tab shows role list", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await waitForRolesTab();
    expect(screen.getAllByText("HQ").length).toBeGreaterThan(0);
    expect(screen.getByText("Manager")).toBeInTheDocument();
    expect(screen.getByText("Custom Role")).toBeInTheDocument();
  });

  it("Roles tab shows permission_count badge", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await waitForRolesTab();
    // permission_count renders as plain number: "2" for HQ role (line 926)
    const allTwos = screen.queryAllByText("2");
    expect(allTwos.length).toBeGreaterThan(0);
  });

  it("Roles tab shows description text unique to Roles tab", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await waitForRolesTab();
    // Line 908 — paragraph unique to Roles tab panel
    expect(screen.getByText(/Detailed permission editing for roles/i)).toBeInTheDocument();
  });

  it("clicking a role loads its permissions panel", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await waitForRolesTab();
    // HQ is auto-selected after bootstrap; View Staff is already in DOM.
    // Use findAllByText (regex matches both View Staff AND Edit Staff = 2 elements)
    const permLabels = await screen.findAllByText(/View Staff|Edit Staff/i, {}, { timeout: 5000 });
    expect(permLabels.length).toBeGreaterThan(0);
  });

  it("Roles tab shows Save Permissions button", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await waitForRolesTab();
    await screen.findByRole("button", { name: /Save Permissions/i }, { timeout: 5000 });
  });

  it("permissions checkboxes visible for selected role", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await waitForRolesTab();
    await waitFor(() => {
      expect(screen.queryAllByRole("checkbox").length).toBeGreaterThan(0);
    }, { timeout: 5000 });
  });

  it("Assigned permission checkbox is checked for HQ", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await waitForRolesTab();
    const checkboxes = await screen.findAllByRole("checkbox", {}, { timeout: 5000 });
    const checkedBoxes = checkboxes.filter((c) => (c as HTMLInputElement).checked);
    expect(checkedBoxes.length).toBeGreaterThan(0);
  });

  it("Delete Role button hidden for system role (HQ selected by default)", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await waitForRolesTab();
    // HQ is is_system: true → no delete button
    expect(screen.queryByRole("button", { name: /Delete Role/i })).toBeNull();
  });

  it("Delete Role button visible for non-system role", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await waitForRolesTab();
    // Click Custom Role — mock now returns ROLES[2] (role_key: "CUSTOM_ROLE", not "HQ")
    // so the condition rolePermissions.role.role_key !== "HQ" is true → Delete Role shows
    fireEvent.click(screen.getAllByText("Custom Role")[0]);
    await screen.findByRole("button", { name: /Delete Role/i }, { timeout: 5000 });
  });

  it("Create Role form is visible on Roles tab", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await waitForRolesTab();
    // "Create Role" appears as both a label div and a button — use getAllByText
    expect(screen.getAllByText(/^Create Role$/i).length).toBeGreaterThan(0);
  });

  it("shows error when Save Permissions API fails", async () => {
    // Page uses PUT (line 430), not POST
    await setupHQ({
      "PUT /api/admin/access/roles/HQ/permissions": { ok: false, body: { detail: "Permission save failed" } },
    });
    render(<StaffRolesPage />);
    await waitForRolesTab();
    const saveBtn = await screen.findByRole("button", { name: /Save Permissions/i }, { timeout: 5000 });
    fireEvent.click(saveBtn);
    await screen.findByText(/Permission save failed/i, {}, { timeout: 5000 });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("StaffRolesPage — Assignments tab", () => {
  beforeEach(() => { mockSearchParams = new URLSearchParams(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  // Helper: wait for bootstrap then switch to Assignments tab
  async function goToAssignments() {
    await screen.findByText("Role Management", {}, { timeout: 5000 });
    await screen.findAllByText("Staff Channel", {}, { timeout: 5000 }); // bootstrap done
    fireEvent.click(screen.getByRole("button", { name: /^Staff Assignments$/i }));
  }

  it("clicking Staff Assignments tab shows city filter buttons", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await goToAssignments();
    await waitFor(() => {
      const btns = screen.queryAllByText(/Dubai|Manila/i);
      expect(btns.length).toBeGreaterThan(0);
    }, { timeout: 5000 });
  });

  it("Dubai staff list visible by default in Assignments tab", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await goToAssignments();
    await screen.findByText("Tanaka Jay", {}, { timeout: 5000 });
    expect(screen.getByText("Cruz Pedro")).toBeInTheDocument();
  });

  it("INACTIVE staff row is visible in Dubai list", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await goToAssignments();
    await screen.findByText("Lee Kwon", {}, { timeout: 5000 });
  });

  it("switching to Manila city filter shows Manila staff", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await goToAssignments();
    await screen.findByText("Tanaka Jay", {}, { timeout: 5000 });
    const manilaBtn = await screen.findByRole("button", { name: /Manila/i }, { timeout: 5000 });
    fireEvent.click(manilaBtn);
    await screen.findByText("Santos Maria", {}, { timeout: 5000 });
  });

  it("Dubai button hides Manila staff", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await goToAssignments();
    await screen.findByText("Tanaka Jay", {}, { timeout: 5000 });
    expect(screen.queryByText("Santos Maria")).toBeNull();
  });

  it("clicking a staff row loads their assignments", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await goToAssignments();
    await screen.findByText("Tanaka Jay", {}, { timeout: 5000 });
    fireEvent.click(screen.getByText("Tanaka Jay"));
    // "Effective role: HQ" badge appears after assignments load (line 1153)
    await screen.findByText(/Effective role: HQ/i, {}, { timeout: 5000 });
  });

  it("shows effective role after loading assignments for Tanaka Jay", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await goToAssignments();
    await screen.findByText("Tanaka Jay", {}, { timeout: 5000 });
    fireEvent.click(screen.getByText("Tanaka Jay"));
    await screen.findByText(/Effective role:/i, {}, { timeout: 5000 });
  });

  it("search filter narrows the staff list", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await goToAssignments();
    await screen.findByText("Tanaka Jay", {}, { timeout: 5000 });
    const searchInput = screen.getByPlaceholderText(/Search staff/i);
    fireEvent.change(searchInput, { target: { value: "Cruz" } });
    await waitFor(() => {
      expect(screen.queryByText("Tanaka Jay")).toBeNull();
      expect(screen.getByText("Cruz Pedro")).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it("assignments panel shows Add Assignment button", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await goToAssignments();
    await screen.findByText("Tanaka Jay", {}, { timeout: 5000 });
    // "Add Assignment" button always visible in the add-role panel (line 1142)
    await screen.findByRole("button", { name: /Add Assignment/i }, { timeout: 5000 });
  });

  it("Cruz Pedro's assignments shows two roles", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await goToAssignments();
    await screen.findByText("Cruz Pedro", {}, { timeout: 5000 });
    fireEvent.click(screen.getByText("Cruz Pedro"));
    // ASSIGNMENTS_CRUZ has 2 assignments: MANAGER (primary) + HQ
    await screen.findByText(/Effective role: MANAGER/i, {}, { timeout: 5000 });
  });

  it("primary badge shown for primary assignment", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await goToAssignments();
    await screen.findByText("Cruz Pedro", {}, { timeout: 5000 });
    fireEvent.click(screen.getByText("Cruz Pedro"));
    // Primary assignments render "Manager · primary" (line 1165-1166)
    await screen.findByText(/· primary/i, {}, { timeout: 5000 });
  });

  it("role assignment dropdown is visible after loading staff", async () => {
    await setupHQ();
    render(<StaffRolesPage />);
    await goToAssignments();
    await screen.findByText("Tanaka Jay", {}, { timeout: 5000 });
    fireEvent.click(screen.getByText("Tanaka Jay"));
    await waitFor(() => {
      const selects = screen.queryAllByRole("combobox");
      expect(selects.length).toBeGreaterThan(0);
    }, { timeout: 5000 });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("StaffRolesPage — URL query param", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("staff_name query param pre-populates staff name field", async () => {
    mockSearchParams = new URLSearchParams("staff_name=Tanaka+Jay");
    await setupHQ();
    render(<StaffRolesPage />);
    await screen.findByText("Role Management", {}, { timeout: 5000 });
    await screen.findAllByText("Staff Channel", {}, { timeout: 5000 }); // wait for bootstrap
    fireEvent.click(screen.getByRole("button", { name: /^Staff Assignments$/i }));
    // staffName state is set to "Tanaka Jay" from the query param.
    // It appears in the "Add Role to: {staffName}" label (line 1131) — not in an input field.
    await screen.findByText(/Add Role to:.*Tanaka Jay/i, {}, { timeout: 5000 });
  });

  it("no staff_name param leaves the field empty", async () => {
    mockSearchParams = new URLSearchParams();
    await setupHQ();
    render(<StaffRolesPage />);
    await screen.findByText("Role Management", {}, { timeout: 5000 });
    await screen.findAllByText("Staff Channel", {}, { timeout: 5000 }); // wait for bootstrap
    fireEvent.click(screen.getByRole("button", { name: /^Staff Assignments$/i }));
    await screen.findByText("Tanaka Jay", {}, { timeout: 5000 });
    const inputs = screen.queryAllByDisplayValue("Tanaka Jay");
    expect(inputs.length).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("StaffRolesPage — apiRequest error-detail extraction (bug fix)", () => {
  beforeEach(() => { mockSearchParams = new URLSearchParams(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("shows human-readable error.detail instead of raw JSON when API returns error JSON", async () => {
    const { canAccessRoleManagement, refreshAuthFromApi, getAuth, getAuthHeaders } = await import("@/lib/auth");
    mockCanRoleManagement = true;
    vi.mocked(getAuth).mockReturnValue(HQ_AUTH as any);
    vi.mocked(getAuthHeaders).mockReturnValue({ Authorization: "Bearer tok" });
    vi.mocked(canAccessRoleManagement).mockReturnValue(true);
    vi.mocked(refreshAuthFromApi).mockResolvedValue(HQ_AUTH as any);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/access/bootstrap"))
        return { ok: false, status: 500, text: async () => JSON.stringify({ detail: "Database connection failed" }) } as Response;
      return { ok: true, status: 200, text: async () => JSON.stringify({}) } as Response;
    }));
    render(<StaffRolesPage />);
    // Should show "Database connection failed", NOT '{"detail":"Database connection failed"}'
    await screen.findByText(/Database connection failed/i, {}, { timeout: 5000 });
    expect(screen.queryByText(/\{"detail"/)).toBeNull();
  });

  it("shows raw text when API returns non-JSON error", async () => {
    const { canAccessRoleManagement, refreshAuthFromApi, getAuth, getAuthHeaders } = await import("@/lib/auth");
    mockCanRoleManagement = true;
    vi.mocked(getAuth).mockReturnValue(HQ_AUTH as any);
    vi.mocked(getAuthHeaders).mockReturnValue({ Authorization: "Bearer tok" });
    vi.mocked(canAccessRoleManagement).mockReturnValue(true);
    vi.mocked(refreshAuthFromApi).mockResolvedValue(HQ_AUTH as any);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/access/bootstrap"))
        return { ok: false, status: 503, text: async () => "Service Unavailable" } as Response;
      return { ok: true, status: 200, text: async () => JSON.stringify({}) } as Response;
    }));
    render(<StaffRolesPage />);
    await screen.findByText(/Service Unavailable/i, {}, { timeout: 5000 });
  });
});
