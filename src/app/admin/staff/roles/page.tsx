// src/app/admin/staff/roles/page.tsx
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Check, Layers3, Pencil, ShieldCheck, Trash2, UserPlus, Users, X } from "lucide-react";
import { canAccessRoleManagement, getAuth, getAuthHeaders, refreshAuthFromApi, type Auth } from "@/lib/auth";
import {
  BADGE_INFO,
  GLASS_CARD,
  INPUT_CLASS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SELECT_CLASS,
  T_CAPTION,
  T_LABEL,
  T_PAGE_TITLE,
  T_SECTION,
} from "@/lib/ui-tokens";

/** Same-origin /api in production so Vercel proxies to Heroku (avoids browser CORS to Heroku). */
function clientApiOrigin(): string {
  if (process.env.NODE_ENV !== "production") {
    const u = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
    return u || "http://127.0.0.1:8000";
  }
  return "";
}

type AccessChannel = {
  channel_key: string;
  label: string;
  description?: string;
  route_path?: string;
  group_name?: string;
  is_system?: boolean;
  is_active?: boolean;
  view_role_count?: number;
};

type AccessRole = {
  role_key: string;
  label: string;
  description?: string;
  is_system?: boolean;
  is_active?: boolean;
  permission_count?: number;
};

type AccessPermission = {
  permission_key: string;
  label: string;
  description?: string;
  channel_key: string;
  action_key: string;
  assigned?: boolean;
};

type BootstrapResp = {
  ok: boolean;
  channels: AccessChannel[];
  roles: AccessRole[];
  permissions: AccessPermission[];
};

type RolePermissionsResp = {
  ok: boolean;
  role: AccessRole;
  permissions: AccessPermission[];
  effective_permissions: string[];
};

type ChannelRoleMatrixRole = {
  role_key: string;
  label: string;
  description?: string;
  is_system?: boolean;
  is_active?: boolean;
  assigned: boolean;
  locked?: boolean;
  city_lock?: string; // '' = all cities, 'dubai' = Dubai only, 'manila' = Manila only
};

type ChannelRoleMatrixResp = {
  ok: boolean;
  channel: AccessChannel;
  permission: {
    permission_key: string;
    label: string;
    description?: string;
    channel_key: string;
    action_key: string;
  };
  roles: ChannelRoleMatrixRole[];
  assigned_count: number;
  updated_role_keys?: string[];
};

type StaffAssignment = {
  role_key: string;
  is_primary: boolean;
  is_active: boolean;
  assigned_by?: string;
  role_label?: string;
  is_system?: boolean;
};

type StaffAssignmentsResp = {
  ok: boolean;
  staff_name: string;
  assignments: StaffAssignment[];
  effective_role: string;
  effective_permissions: string[];
};

type StaffNameListResp = {
  ok: boolean;
  city: string;
  status: string;
  names: string[];
};

type StaffMasterRow = {
  id: string;
  city: string;
  display_name: string;
  home_branch?: string;
  role?: string;
  status?: string;
};

type StaffMasterListResp = {
  ok: boolean;
  rows: StaffMasterRow[];
};

async function apiRequest<T>(path: string, options: RequestInit = {}, auth?: Auth | null): Promise<T> {
  const res = await fetch(`${clientApiOrigin()}${path}`, {
    cache: "no-store",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(getAuthHeaders(auth) || {}),
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    try {
      const j = JSON.parse(text);
      throw new Error(j?.detail || text || `${options.method || "GET"} ${path} failed`);
    } catch {
      throw new Error(text || `${options.method || "GET"} ${path} failed`);
    }
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

function StaffRolesPageInner() {
  const searchParams = useSearchParams();
  const [auth, setAuthState] = useState<Auth | null>(getAuth());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"roles" | "channels" | "assignments">("channels");

  const [channels, setChannels] = useState<AccessChannel[]>([]);
  const [roles, setRoles] = useState<AccessRole[]>([]);
  const [selectedRoleKey, setSelectedRoleKey] = useState("");
  const [selectedChannelKey, setSelectedChannelKey] = useState("");
  const [rolePermissions, setRolePermissions] = useState<RolePermissionsResp | null>(null);
  const [checkedPermissions, setCheckedPermissions] = useState<Record<string, boolean>>({});
  const [channelMatrix, setChannelMatrix] = useState<ChannelRoleMatrixResp | null>(null);
  // '' = no access, 'all' = all cities, 'dubai' = Dubai only, 'manila' = Manila only
  const [channelRoleDrafts, setChannelRoleDrafts] = useState<Record<string, string>>({});
  const [channelMatrixBusy, setChannelMatrixBusy] = useState(false);
  const [channelMatrixDirty, setChannelMatrixDirty] = useState(false);

  const [newRoleKey, setNewRoleKey] = useState("");
  const [newRoleLabel, setNewRoleLabel] = useState("");
  const [renamingLabel, setRenamingLabel] = useState<string | null>(null); // null = not editing

  const [newChannelKey, setNewChannelKey] = useState("");
  const [newChannelLabel, setNewChannelLabel] = useState("");
  const [newChannelRoute, setNewChannelRoute] = useState("");

  const [staffName, setStaffName] = useState("");
  const [assignmentRoleKey, setAssignmentRoleKey] = useState("");
  const [assignmentPrimary, setAssignmentPrimary] = useState(true);
  const [staffAssignments, setStaffAssignments] = useState<StaffAssignmentsResp | null>(null);
  const [staffOptions, setStaffOptions] = useState<string[]>([]);
  const [staffOptionsLoading, setStaffOptionsLoading] = useState(false);
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, string>>({});
  const [assignmentSavingRoleKey, setAssignmentSavingRoleKey] = useState("");
  // City-filtered staff list for assignments tab
  const [assignmentCityFilter, setAssignmentCityFilter] = useState<"dubai" | "manila">("dubai");
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [staffMasterRows, setStaffMasterRows] = useState<StaffMasterRow[]>([]);
  // Cache of effective roles loaded from the access system (keyed by display_name)
  const [effectiveRoleCache, setEffectiveRoleCache] = useState<Record<string, string>>({});

  const canManage = canAccessRoleManagement(auth);

  function applyChannelRoleDrafts(data: ChannelRoleMatrixResp | null) {
    const nextDrafts: Record<string, string> = {};
    (data?.roles || []).forEach((role) => {
      if (!role.assigned) {
        nextDrafts[role.role_key] = "";
      } else if (role.city_lock === "dubai") {
        nextDrafts[role.role_key] = "dubai";
      } else if (role.city_lock === "manila") {
        nextDrafts[role.role_key] = "manila";
      } else {
        nextDrafts[role.role_key] = "all";
      }
    });
    setChannelRoleDrafts(nextDrafts);
    setChannelMatrixDirty(false);
  }

  function syncChannelCount(channelKey: string, assignedCount: number) {
    setChannels((prev) =>
      prev.map((channel) =>
        channel.channel_key === channelKey
          ? {
              ...channel,
              view_role_count: assignedCount,
            }
          : channel,
      ),
    );
  }

  async function loadChannelRoleMatrix(channelKey: string, currentAuth?: Auth | null) {
    const active = currentAuth || auth;
    if (!active || !channelKey) return;
    setChannelMatrixBusy(true);
    try {
      const data = await apiRequest<ChannelRoleMatrixResp>(`/api/admin/access/channels/${encodeURIComponent(channelKey)}/role-matrix`, {}, active);
      setChannelMatrix(data);
      setSelectedChannelKey(channelKey);
      applyChannelRoleDrafts(data);
      syncChannelCount(channelKey, data.assigned_count || 0);
    } finally {
      setChannelMatrixBusy(false);
    }
  }

  async function loadBootstrap(currentAuth?: Auth | null, preferredChannelKey?: string, preferredRoleKey?: string) {
    const active = currentAuth || auth;
    if (!active) return;
    const data = await apiRequest<BootstrapResp>("/api/admin/access/bootstrap", {}, active);
    const nextChannels = data.channels || [];
    const nextRoles = data.roles || [];
    setChannels(nextChannels);
    setRoles(nextRoles);
    await loadStaffOptions(active);

    const nextRoleKey = preferredRoleKey || selectedRoleKey || nextRoles[0]?.role_key || "";
    const nextChannelKey = preferredChannelKey || selectedChannelKey || nextChannels[0]?.channel_key || "";

    setSelectedRoleKey(nextRoleKey);
    setSelectedChannelKey(nextChannelKey);
    if (!assignmentRoleKey && nextRoles[0]?.role_key) setAssignmentRoleKey(nextRoles[0].role_key);

    if (nextRoleKey) {
      await loadRolePermissions(nextRoleKey, active);
    } else {
      setRolePermissions(null);
      setCheckedPermissions({});
    }
    if (nextChannelKey) {
      await loadChannelRoleMatrix(nextChannelKey, active);
    } else {
      setChannelMatrix(null);
      setChannelRoleDrafts({});
      setChannelMatrixDirty(false);
    }
  }

  async function loadRolePermissions(roleKey: string, currentAuth?: Auth | null) {
    const active = currentAuth || auth;
    if (!active || !roleKey) return;
    const data = await apiRequest<RolePermissionsResp>(`/api/admin/access/roles/${encodeURIComponent(roleKey)}/permissions`, {}, active);
    setRolePermissions(data);
    const nextChecked: Record<string, boolean> = {};
    (data.permissions || []).forEach((permission) => {
      nextChecked[permission.permission_key] = Boolean(permission.assigned);
    });
    setCheckedPermissions(nextChecked);
  }

  async function loadStaffOptions(currentAuth?: Auth | null) {
    const active = currentAuth || auth;
    if (!active) return;
    setStaffOptionsLoading(true);
    try {
      // Load full staff master rows (with role/branch) from both cities
      const [dubaiRows, manilaRows] = await Promise.all([
        apiRequest<StaffMasterListResp>(`/api/admin/staff_master?city=dubai&limit=5000`, {}, active),
        apiRequest<StaffMasterListResp>(`/api/admin/staff_master?city=manila&limit=5000`, {}, active),
      ]);
      const allRows = [
        ...(dubaiRows.rows || []),
        ...(manilaRows.rows || []),
      ].sort((a, b) => a.display_name.localeCompare(b.display_name));
      setStaffMasterRows(allRows);
      setStaffOptions(allRows.map((r) => r.display_name));
    } catch {
      setStaffOptions([]);
      setStaffMasterRows([]);
    } finally {
      setStaffOptionsLoading(false);
    }
  }

  async function loadStaffAssignments(targetName?: string, currentAuth?: Auth | null) {
    const active = currentAuth || auth;
    const target = String(targetName || staffName || "").trim();
    if (!active || !target) return;
    const data = await apiRequest<StaffAssignmentsResp>(`/api/admin/access/staff/${encodeURIComponent(target)}/roles`, {}, active);
    setStaffAssignments(data);
    const nextDrafts: Record<string, string> = {};
    (data.assignments || []).forEach((assignment) => {
      nextDrafts[assignment.role_key] = assignment.role_key;
    });
    setAssignmentDrafts(nextDrafts);
    // Cache effective role so the list badge stays in sync with the access system
    if (data.effective_role) {
      setEffectiveRoleCache((prev) => ({ ...prev, [target]: data.effective_role }));
    }
  }

  useEffect(() => {
    const qsStaffName = String(searchParams.get("staff_name") || "").trim();
    if (qsStaffName) setStaffName(qsStaffName);
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const current = getAuth();
        const refreshed = await refreshAuthFromApi(current);
        if (cancelled) return;
        setAuthState(refreshed || current);
        setReady(true);
        if (!canAccessRoleManagement(refreshed || current)) return;
        await loadBootstrap(refreshed || current);
        if (staffName.trim()) await loadStaffAssignments(staffName.trim(), refreshed || current);
      } catch (err: any) {
        if (!cancelled) {
          setError(String(err?.message || err || "Failed to load role management"));
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const permissionsByChannel = useMemo(() => {
    const grouped = new Map<string, AccessPermission[]>();
    for (const permission of rolePermissions?.permissions || []) {
      const list = grouped.get(permission.channel_key) || [];
      list.push(permission);
      grouped.set(permission.channel_key, list);
    }
    return Array.from(grouped.entries());
  }, [rolePermissions]);

  const filteredStaffOptions = useMemo(() => {
    const q = staffName.trim().toLowerCase();
    if (!q) return staffOptions.slice(0, 18);
    return staffOptions.filter((name) => name.toLowerCase().includes(q)).slice(0, 18);
  }, [staffName, staffOptions]);

  // City-filtered + searched staff list for the assignments tab
  const assignmentCityRows = useMemo(() => {
    const q = assignmentSearch.trim().toLowerCase();
    return staffMasterRows
      .filter((r) => r.city.toLowerCase() === assignmentCityFilter)
      .filter((r) => !q || r.display_name.toLowerCase().includes(q));
  }, [staffMasterRows, assignmentCityFilter, assignmentSearch]);

  const selectedStaffRoleKeys = useMemo(
    () => new Set((staffAssignments?.assignments || []).map((assignment) => assignment.role_key)),
    [staffAssignments],
  );

  async function handleCreateRole() {
    if (!auth) return;
    setBusy(true);
    setError("");
    try {
      const created = await apiRequest<{ ok: boolean; role: AccessRole }>(
        "/api/admin/access/roles",
        {
          method: "POST",
          body: JSON.stringify({ role_key: newRoleKey, label: newRoleLabel || newRoleKey, description: "" }),
        },
        auth,
      );
      setNewRoleKey("");
      setNewRoleLabel("");
      await loadBootstrap(auth, selectedChannelKey, created.role.role_key);
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to create role"));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveRolePermissions() {
    if (!auth || !selectedRoleKey) return;
    setBusy(true);
    setError("");
    try {
      const permissions = Object.entries(checkedPermissions)
        .filter(([, checked]) => checked)
        .map(([permission_key]) => ({ permission_key }));
      await apiRequest(
        `/api/admin/access/roles/${encodeURIComponent(selectedRoleKey)}/permissions`,
        {
          method: "PUT",
          body: JSON.stringify({ permissions }),
        },
        auth,
      );
      await loadRolePermissions(selectedRoleKey, auth);
      await loadBootstrap(auth, selectedChannelKey, selectedRoleKey);
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to save permissions"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteRole(roleKey: string) {
    if (!auth) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/api/admin/access/roles/${encodeURIComponent(roleKey)}`, { method: "DELETE" }, auth);
      setSelectedRoleKey("");
      setRolePermissions(null);
      await loadBootstrap(auth, selectedChannelKey);
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to delete role"));
    } finally {
      setBusy(false);
    }
  }

  async function handleRenameRole() {
    if (!auth || !selectedRoleKey || renamingLabel === null) return;
    const newLabel = renamingLabel.trim();
    if (!newLabel) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<{ ok: boolean; role: AccessRole }>(
        `/api/admin/access/roles/${encodeURIComponent(selectedRoleKey)}`,
        { method: "PATCH", body: JSON.stringify({ label: newLabel }) },
        auth,
      );
      setRenamingLabel(null);
      // Immediately update the roles list in state so the left panel reflects the new label
      if (result?.role) {
        setRoles((prev) => prev.map((r) => r.role_key === selectedRoleKey ? { ...r, label: result.role.label } : r));
        setRolePermissions((prev) => prev ? { ...prev, role: result.role } : prev);
      }
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to rename role"));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateChannel() {
    if (!auth) return;
    setBusy(true);
    setError("");
    try {
      const created = await apiRequest<{ ok: boolean; channel: AccessChannel }>(
        "/api/admin/access/channels",
        {
          method: "POST",
          body: JSON.stringify({
            channel_key: newChannelKey,
            label: newChannelLabel || newChannelKey,
            route_path: newChannelRoute,
            group_name: newChannelKey.startsWith("admin.") ? "admin" : "general",
            route_match: "prefix",
            is_admin_channel: newChannelKey.startsWith("admin."),
          }),
        },
        auth,
      );
      setNewChannelKey("");
      setNewChannelLabel("");
      setNewChannelRoute("");
      await loadBootstrap(auth, created.channel.channel_key, selectedRoleKey);
      setTab("channels");
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to create channel"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteChannel(channelKey: string) {
    if (!auth) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/api/admin/access/channels/${encodeURIComponent(channelKey)}`, { method: "DELETE" }, auth);
      const fallbackChannelKey = channels.find((channel) => channel.channel_key !== channelKey)?.channel_key || "";
      setSelectedChannelKey(fallbackChannelKey);
      await loadBootstrap(auth, fallbackChannelKey, selectedRoleKey);
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to delete channel"));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveChannelAccess() {
    if (!auth || !selectedChannelKey) return;
    setChannelMatrixBusy(true);
    setError("");
    try {
      // Build role_entries: only include roles that have access ('all', 'dubai', 'manila')
      const role_entries = Object.entries(channelRoleDrafts)
        .filter(([, access]) => access && access !== "")
        .map(([roleKey, access]) => ({
          role_key: roleKey,
          city_lock: access === "all" ? "" : access, // 'all' → '' (global), 'dubai'/'manila' as-is
        }));
      const data = await apiRequest<ChannelRoleMatrixResp>(
        `/api/admin/access/channels/${encodeURIComponent(selectedChannelKey)}/role-matrix`,
        {
          method: "PUT",
          body: JSON.stringify({ role_entries }),
        },
        auth,
      );
      setChannelMatrix(data);
      applyChannelRoleDrafts(data);
      syncChannelCount(selectedChannelKey, data.assigned_count || 0);
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to save channel access"));
    } finally {
      setChannelMatrixBusy(false);
    }
  }

  function handleResetChannelAccess() {
    applyChannelRoleDrafts(channelMatrix);
  }

  async function handleAddAssignment() {
    if (!auth || !staffName.trim() || !assignmentRoleKey) return;
    setBusy(true);
    setError("");
    try {
      // Always fetch fresh assignments before adding — prevents stale-state duplicates
      // (state resets on page re-visit, so selectedStaffRoleKeys could be empty even if roles exist)
      const fresh = await apiRequest<StaffAssignmentsResp>(
        `/api/admin/access/staff/${encodeURIComponent(staffName.trim())}/roles`,
        {},
        auth,
      );
      setStaffAssignments(fresh);
      const existingKeys = new Set((fresh.assignments || []).map((a) => a.role_key));
      if (existingKeys.has(assignmentRoleKey)) {
        setError(`"${assignmentRoleKey}" is already assigned to this staff member.`);
        return;
      }
      await apiRequest(
        "/api/admin/access/staff/roles",
        {
          method: "POST",
          body: JSON.stringify({ staff_name: staffName.trim(), role_key: assignmentRoleKey, is_primary: assignmentPrimary }),
        },
        auth,
      );
      await loadStaffAssignments(staffName.trim(), auth);
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to add assignment"));
    } finally {
      setBusy(false);
    }
  }

  async function handleReplaceAssignment(fromRoleKey: string) {
    if (!auth || !staffAssignments?.staff_name) return;
    const nextRoleKey = String(assignmentDrafts[fromRoleKey] || "").trim();
    if (!nextRoleKey || nextRoleKey === fromRoleKey) return;
    const currentAssignment = (staffAssignments.assignments || []).find((assignment) => assignment.role_key === fromRoleKey);
    if (!currentAssignment) return;
    const targetStaffName = staffAssignments.staff_name;
    const targetExists = (staffAssignments.assignments || []).some((assignment) => assignment.role_key === nextRoleKey);
    const confirmed = window.confirm(`Replace ${fromRoleKey} with ${nextRoleKey} for ${targetStaffName}?`);
    if (!confirmed) return;
    setBusy(true);
    setAssignmentSavingRoleKey(fromRoleKey);
    setError("");
    try {
      if (!targetExists) {
        await apiRequest(
          "/api/admin/access/staff/roles",
          {
            method: "POST",
            body: JSON.stringify({
              staff_name: targetStaffName,
              role_key: nextRoleKey,
              is_primary: Boolean(currentAssignment.is_primary),
            }),
          },
          auth,
        );
      } else if (currentAssignment.is_primary) {
        await apiRequest(
          "/api/admin/access/staff/roles/primary",
          {
            method: "POST",
            body: JSON.stringify({ staff_name: targetStaffName, role_key: nextRoleKey }),
          },
          auth,
        );
      }
      await apiRequest(
        `/api/admin/access/staff/${encodeURIComponent(targetStaffName)}/roles/${encodeURIComponent(fromRoleKey)}`,
        { method: "DELETE" },
        auth,
      );
      await loadStaffAssignments(targetStaffName, auth);
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to change assignment"));
    } finally {
      setAssignmentSavingRoleKey("");
      setBusy(false);
    }
  }

  async function handleMakePrimary(roleKey: string) {
    if (!auth || !staffName.trim()) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(
        "/api/admin/access/staff/roles/primary",
        {
          method: "POST",
          body: JSON.stringify({ staff_name: staffName.trim(), role_key: roleKey }),
        },
        auth,
      );
      await loadStaffAssignments(staffName.trim(), auth);
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to update primary role"));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveAssignment(roleKey: string) {
    if (!auth || !staffName.trim()) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(
        `/api/admin/access/staff/${encodeURIComponent(staffName.trim())}/roles/${encodeURIComponent(roleKey)}`,
        { method: "DELETE" },
        auth,
      );
      await loadStaffAssignments(staffName.trim(), auth);
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to remove assignment"));
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return <div className="min-h-screen bg-neutral-950 text-white" />;
  }

  if (!canManage) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className={`${GLASS_CARD} p-6`}>
          <h1 className={T_PAGE_TITLE}>Role Management</h1>
          <p className="mt-3 text-sm text-rose-300">Role Management is available only to HQ users.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-violet-500/30 bg-violet-500/10">
            <ShieldCheck className="h-5 w-5 text-violet-300" />
          </div>
          <div>
            <h1 className={T_PAGE_TITLE}>Role Management</h1>
            <p className={T_CAPTION}>HQ-only workspace for channel view access, detailed permissions, and staff role assignments.</p>
            <div className="mt-2 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-300">
              Signed in as {auth?.staffName || "Unknown"}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/staff" className={SECONDARY_BUTTON}>Staff Master</Link>
          <Link href="/admin" className={SECONDARY_BUTTON}>Admin Dashboard</Link>
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-900/50 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {([
          ["channels", "Channels"],
          ["roles", "Roles"],
          ["assignments", "Staff Assignments"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-xl border px-4 py-2 text-sm transition ${tab === key ? "border-violet-500 bg-violet-500/15 text-white" : "border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "channels" ? (
        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          <div className={`${GLASS_CARD} p-5`}>
            <div className="mb-3">
              <h2 className={T_SECTION}>Channel Access</h2>
              <p className={`${T_CAPTION} mt-1`}>See which roles can open each channel and update view access in one place.</p>
            </div>
            <div className="space-y-2">
              {channels.map((channel) => (
                <button
                  key={channel.channel_key}
                  type="button"
                  onClick={() => loadChannelRoleMatrix(channel.channel_key, auth)}
                  className={`w-full rounded-2xl border px-3 py-3 text-left transition ${selectedChannelKey === channel.channel_key ? "border-violet-500 bg-violet-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{channel.label}</div>
                      <div className="text-xs text-neutral-400">{channel.channel_key}</div>
                      <div className="text-xs text-neutral-500">{channel.route_path || "No route path"}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={BADGE_INFO}>{channel.view_role_count || 0} roles</span>
                      {channel.is_system ? <span className={BADGE_INFO}>System</span> : null}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-5 space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className={T_LABEL}>Create Custom Channel</div>
              <input value={newChannelKey} onChange={(e) => setNewChannelKey(e.target.value)} className={INPUT_CLASS} placeholder="e.g. admin.ops" />
              <input value={newChannelLabel} onChange={(e) => setNewChannelLabel(e.target.value)} className={INPUT_CLASS} placeholder="Channel label" />
              <input value={newChannelRoute} onChange={(e) => setNewChannelRoute(e.target.value)} className={INPUT_CLASS} placeholder="/admin/ops" />
              <button type="button" onClick={handleCreateChannel} disabled={busy || !newChannelKey.trim()} className={PRIMARY_BUTTON}>
                Create Channel
              </button>
            </div>
          </div>

          <div className={`${GLASS_CARD} p-5`}>
            {channelMatrix ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className={T_SECTION}>{channelMatrix.channel.label}</h2>
                    <p className={T_CAPTION}>{channelMatrix.channel.description || "This screen manages channel view access only."}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-neutral-400">
                      <span>{channelMatrix.channel.channel_key}</span>
                      <span>{channelMatrix.channel.route_path || "No route path"}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={BADGE_INFO}>{channelMatrix.assigned_count || 0} roles can view</span>
                    {!channelMatrix.channel.is_system ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteChannel(channelMatrix.channel.channel_key)}
                        disabled={busy}
                        className={`${SECONDARY_BUTTON} text-rose-300`}
                      >
                        <Trash2 className="mr-1 h-4 w-4" /> Delete Channel
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-sm font-semibold text-white">View access</div>
                  <div className="mt-1 text-xs text-neutral-400">
                    HQ is always allowed and cannot be removed. This screen manages channel view access only.
                  </div>
                  <div className="mt-4 space-y-3">
                    {channelMatrix.roles.map((role) => {
                      const access = channelRoleDrafts[role.role_key] ?? "";
                      const hasAccess = access !== "";
                      const disabled = Boolean(role.locked || role.is_active === false);
                      const ACCESS_OPTIONS = [
                        { value: "", label: "No Access" },
                        { value: "all", label: "All Cities" },
                        { value: "dubai", label: "Dubai 🇦🇪" },
                        { value: "manila", label: "Manila 🇵🇭" },
                      ];
                      return (
                        <div
                          key={role.role_key}
                          className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${hasAccess ? "border-violet-500/30 bg-violet-500/10" : "border-white/10 bg-neutral-950/30"}`}
                        >
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-sm font-semibold text-white">{role.label}</div>
                              {role.is_system ? <span className={BADGE_INFO}>System</span> : null}
                              {role.locked ? <span className={BADGE_INFO}>Locked</span> : null}
                              {role.is_active === false ? <span className={BADGE_INFO}>Inactive</span> : null}
                              {hasAccess && access !== "all" ? (
                                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">
                                  {access === "dubai" ? "Dubai only" : "Manila only"}
                                </span>
                              ) : null}
                            </div>
                            <div className="text-xs text-neutral-500">{role.role_key}</div>
                          </div>
                          <select
                            value={access}
                            disabled={disabled}
                            onChange={(e) => {
                              setChannelRoleDrafts((prev) => ({ ...prev, [role.role_key]: e.target.value }));
                              setChannelMatrixDirty(true);
                            }}
                            className={`${SELECT_CLASS} w-auto min-w-[120px] text-xs ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                          >
                            {ACCESS_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSaveChannelAccess}
                    disabled={channelMatrixBusy || !channelMatrixDirty}
                    className={PRIMARY_BUTTON}
                  >
                    {channelMatrixBusy ? "Saving..." : "Save Channel Access"}
                  </button>
                  <button
                    type="button"
                    onClick={handleResetChannelAccess}
                    disabled={channelMatrixBusy || !channelMatrixDirty}
                    className={SECONDARY_BUTTON}
                  >
                    Reset
                  </button>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-neutral-400">
                Select a channel to manage which roles can view it.
              </div>
            )}
          </div>
        </div>
      ) : null}

      {tab === "roles" ? (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className={`${GLASS_CARD} p-5`}>
            <div className="mb-3 flex items-center gap-2">
              <Layers3 className="h-4 w-4 text-violet-300" />
              <h2 className={T_SECTION}>Roles</h2>
            </div>
            <p className={`${T_CAPTION} mb-4`}>Detailed permission editing for roles. Daily channel visibility is easier to manage from the Channels tab.</p>
            <div className="space-y-2">
              {roles.map((role) => (
                <button
                  key={role.role_key}
                  type="button"
                  onClick={() => {
                    setSelectedRoleKey(role.role_key);
                    loadRolePermissions(role.role_key, auth);
                  }}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${selectedRoleKey === role.role_key ? "border-violet-500 bg-violet-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{role.label}</div>
                      <div className="text-xs text-neutral-400">{role.role_key}</div>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-neutral-300">
                      {role.permission_count || 0}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-5 space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className={T_LABEL}>Create Role</div>
              <input value={newRoleKey} onChange={(e) => setNewRoleKey(e.target.value)} className={INPUT_CLASS} placeholder="e.g. AREA_MANAGER" />
              <input value={newRoleLabel} onChange={(e) => setNewRoleLabel(e.target.value)} className={INPUT_CLASS} placeholder="Display label" />
              <button type="button" onClick={handleCreateRole} disabled={busy || !newRoleKey.trim()} className={PRIMARY_BUTTON}>
                Create Role
              </button>
            </div>
          </div>

          <div className={`${GLASS_CARD} p-5`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {rolePermissions?.role && renamingLabel !== null ? (
                  /* ── Rename inline edit ── */
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={renamingLabel}
                      onChange={(e) => setRenamingLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleRenameRole();
                        if (e.key === "Escape") setRenamingLabel(null);
                      }}
                      className={`${INPUT_CLASS} max-w-xs text-base font-semibold`}
                    />
                    <button
                      type="button"
                      onClick={() => void handleRenameRole()}
                      disabled={busy || !renamingLabel.trim()}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 disabled:opacity-40"
                      title="Save"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenamingLabel(null)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-neutral-400 hover:bg-white/10"
                      title="Cancel"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h2 className={T_SECTION}>{rolePermissions?.role?.label || "Select a role"}</h2>
                    {rolePermissions?.role && rolePermissions.role.role_key !== "HQ" ? (
                      <button
                        type="button"
                        onClick={() => setRenamingLabel(rolePermissions.role.label || "")}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 hover:bg-white/10 hover:text-neutral-200 transition"
                        title="Rename role"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                )}
                <p className={T_CAPTION}>{rolePermissions?.role?.description || "Channel permissions are grouped below."}</p>
              </div>
              {rolePermissions?.role && rolePermissions.role.role_key !== "HQ" && renamingLabel === null ? (
                <button type="button" onClick={() => handleDeleteRole(rolePermissions.role.role_key)} className={`${SECONDARY_BUTTON} text-rose-300`}>
                  <Trash2 className="mr-1 h-4 w-4" /> Delete Role
                </button>
              ) : null}
            </div>

            <div className="mt-5 space-y-4">
              {permissionsByChannel.map(([channelKey, permissions]) => {
                const channel = channels.find((item) => item.channel_key === channelKey);
                return (
                  <div key={channelKey} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">{channel?.label || channelKey}</div>
                        <div className="text-xs text-neutral-500">{channel?.route_path || channelKey}</div>
                      </div>
                      <span className={BADGE_INFO}>{permissions.filter((item) => checkedPermissions[item.permission_key]).length} selected</span>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {permissions.map((permission) => (
                        <label key={permission.permission_key} className="flex items-start gap-3 rounded-xl border border-white/10 bg-neutral-950/40 px-3 py-2">
                          <input
                            type="checkbox"
                            checked={Boolean(checkedPermissions[permission.permission_key])}
                            onChange={(e) => setCheckedPermissions((prev) => ({ ...prev, [permission.permission_key]: e.target.checked }))}
                            className="mt-1"
                          />
                          <div>
                            <div className="text-sm text-white">{permission.label}</div>
                            <div className="text-xs text-neutral-500">{permission.permission_key}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {rolePermissions ? (
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button type="button" onClick={handleSaveRolePermissions} disabled={busy} className={PRIMARY_BUTTON}>
                  Save Permissions
                </button>
                <div className="text-xs text-neutral-400">
                  Effective permission count: {rolePermissions.effective_permissions?.length || 0}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "assignments" ? (
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <div className={`${GLASS_CARD} p-5`}>
            <div className="mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-violet-300" />
              <h2 className={T_SECTION}>Staff Assignments</h2>
            </div>
            <p className={`${T_CAPTION} mb-4`}>HQ-only staff role assignment management.</p>

            {/* City filter tabs */}
            <div className="mb-3 flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
              {(["dubai", "manila"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { setAssignmentCityFilter(c); setAssignmentSearch(""); }}
                  className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${assignmentCityFilter === c ? "bg-violet-500 text-white" : "text-neutral-400 hover:text-white"}`}
                >
                  {c === "dubai" ? "🇦🇪 Dubai" : "🇵🇭 Manila"}
                </button>
              ))}
            </div>

            {/* Search */}
            <input
              value={assignmentSearch}
              onChange={(e) => setAssignmentSearch(e.target.value)}
              className={INPUT_CLASS + " mb-2"}
              placeholder="Search staff..."
            />
            <div className="mb-2 text-xs text-neutral-500">
              {staffOptionsLoading
                ? "Loading..."
                : `${assignmentCityRows.length} staff in ${assignmentCityFilter === "dubai" ? "Dubai" : "Manila"}`}
            </div>

            {/* Full staff list */}
            <div className="max-h-[480px] space-y-1 overflow-y-auto pr-1">
              {assignmentCityRows.map((row) => {
                const isSelected = staffAssignments?.staff_name === row.display_name;
                const isInactive = row.status === "INACTIVE";
                const branchLabel = row.home_branch || "";
                // Use cached effective role (access system) if available; fall back to staff_master.role
                const cachedRole = effectiveRoleCache[row.display_name];
                const displayRole = cachedRole || (row.role || "STAFF").toUpperCase();
                const isCached = Boolean(cachedRole);
                const roleBadgeClass = isCached
                  ? displayRole === "HQ"
                    ? "border-violet-500/40 bg-violet-500/10 text-violet-300"
                    : displayRole === "MANAGER" || displayRole.includes("MANAGER")
                    ? "border-sky-500/40 bg-sky-500/10 text-sky-300"
                    : displayRole === "STAFF"
                    ? "border-white/10 bg-white/5 text-neutral-300"
                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-white/5 bg-white/3 text-neutral-500"; // dim = not yet loaded
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => {
                      setStaffName(row.display_name);
                      setAssignmentSearch("");
                      loadStaffAssignments(row.display_name, auth);
                    }}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition ${isSelected ? "border-violet-500 bg-violet-500/10" : "border-white/10 bg-neutral-950/30 hover:bg-white/10"} ${isInactive ? "opacity-40" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`truncate text-sm font-medium ${isSelected ? "text-white" : "text-neutral-200"}`}>{row.display_name}</span>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${roleBadgeClass}`}>
                        {displayRole}
                      </span>
                    </div>
                    {branchLabel ? <div className="mt-0.5 text-xs text-neutral-500">{branchLabel}</div> : null}
                  </button>
                );
              })}
              {!staffOptionsLoading && assignmentCityRows.length === 0 ? (
                <p className="py-4 text-center text-xs text-neutral-500">No staff found.</p>
              ) : null}
            </div>

            {/* Add assignment controls */}
            <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
              <div className={T_LABEL}>Add Role to: {staffName || "—"}</div>
              <select value={assignmentRoleKey} onChange={(e) => setAssignmentRoleKey(e.target.value)} className={SELECT_CLASS}>
                {roles.map((role) => (
                  <option key={role.role_key} value={role.role_key}>{role.label}</option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm text-neutral-300">
                <input type="checkbox" checked={assignmentPrimary} onChange={(e) => setAssignmentPrimary(e.target.checked)} />
                Set as primary role
              </label>
              <button type="button" onClick={handleAddAssignment} disabled={busy || !staffName.trim() || !assignmentRoleKey} className={PRIMARY_BUTTON + " w-full justify-center"}>
                <UserPlus className="mr-1 h-4 w-4" /> Add Assignment
              </button>
            </div>
          </div>

          <div className={`${GLASS_CARD} p-5`}>
            <h2 className={T_SECTION}>{staffAssignments?.staff_name || "No staff loaded"}</h2>
            <p className={T_CAPTION}>Primary role decides the default role claim. Effective permissions are still merged from all active assignments.</p>
            {staffAssignments ? (
              <>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={BADGE_INFO}>Effective role: {staffAssignments.effective_role}</span>
                  <span className={BADGE_INFO}>Permissions: {staffAssignments.effective_permissions?.length || 0}</span>
                </div>
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">Current roles</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {staffAssignments.assignments.length ? (
                      staffAssignments.assignments.map((assignment) => (
                        <span
                          key={assignment.role_key}
                          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${assignment.is_primary ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-neutral-950/40 text-neutral-300"}`}
                        >
                          {assignment.role_label || assignment.role_key}
                          {assignment.is_primary ? " · primary" : ""}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-neutral-400">No active roles assigned.</span>
                    )}
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {staffAssignments.assignments.map((assignment, idx) => (
                    <div key={`${assignment.role_key}-${assignment.assigned_by || "na"}-${idx}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <div className="min-w-[260px] flex-1">
                        <div className="text-sm font-semibold text-white">{assignment.role_label || assignment.role_key}</div>
                        <div className="text-xs text-neutral-500">{assignment.role_key}</div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <select
                            value={assignmentDrafts[assignment.role_key] || assignment.role_key}
                            onChange={(e) => setAssignmentDrafts((prev) => ({ ...prev, [assignment.role_key]: e.target.value }))}
                            className={`${SELECT_CLASS} max-w-[220px]`}
                          >
                            {roles.map((role) => (
                              <option key={role.role_key} value={role.role_key}>
                                {role.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleReplaceAssignment(assignment.role_key)}
                            disabled={busy || (assignmentDrafts[assignment.role_key] || assignment.role_key) === assignment.role_key}
                            className={SECONDARY_BUTTON}
                          >
                            {assignmentSavingRoleKey === assignment.role_key ? "Saving..." : "Change Role"}
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {assignment.is_primary ? <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">Primary</span> : null}
                        {!assignment.is_primary ? (
                          <button type="button" onClick={() => handleMakePrimary(assignment.role_key)} className={SECONDARY_BUTTON}>
                            Set Primary
                          </button>
                        ) : null}
                        <button type="button" onClick={() => handleRemoveAssignment(assignment.role_key)} className={`${SECONDARY_BUTTON} text-rose-300`}>
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-4 text-sm text-neutral-400">Load a staff member to inspect and update assignments.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function StaffRolesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-neutral-950 text-white" />}>
      <StaffRolesPageInner />
    </Suspense>
  );
}