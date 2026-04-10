// src/app/admin/staff/roles/page.tsx
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Layers3, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
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

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");

type AccessChannel = {
  channel_key: string;
  label: string;
  description?: string;
  route_path?: string;
  group_name?: string;
  is_system?: boolean;
  is_active?: boolean;
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

async function apiRequest<T>(path: string, options: RequestInit = {}, auth?: Auth | null): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
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
  const [tab, setTab] = useState<"roles" | "channels" | "assignments">("roles");

  const [channels, setChannels] = useState<AccessChannel[]>([]);
  const [roles, setRoles] = useState<AccessRole[]>([]);
  const [selectedRoleKey, setSelectedRoleKey] = useState("");
  const [rolePermissions, setRolePermissions] = useState<RolePermissionsResp | null>(null);
  const [checkedPermissions, setCheckedPermissions] = useState<Record<string, boolean>>({});

  const [newRoleKey, setNewRoleKey] = useState("");
  const [newRoleLabel, setNewRoleLabel] = useState("");

  const [newChannelKey, setNewChannelKey] = useState("");
  const [newChannelLabel, setNewChannelLabel] = useState("");
  const [newChannelRoute, setNewChannelRoute] = useState("");

  const [staffName, setStaffName] = useState("");
  const [assignmentRoleKey, setAssignmentRoleKey] = useState("");
  const [assignmentPrimary, setAssignmentPrimary] = useState(true);
  const [staffAssignments, setStaffAssignments] = useState<StaffAssignmentsResp | null>(null);

  const canManage = canAccessRoleManagement(auth);

  async function loadBootstrap(currentAuth?: Auth | null) {
    const active = currentAuth || auth;
    if (!active) return;
    const data = await apiRequest<BootstrapResp>("/api/admin/access/bootstrap", {}, active);
    setChannels(data.channels || []);
    setRoles(data.roles || []);
    const firstRole = selectedRoleKey || data.roles?.[0]?.role_key || "";
    setSelectedRoleKey(firstRole);
    if (!assignmentRoleKey && data.roles?.[0]?.role_key) setAssignmentRoleKey(data.roles[0].role_key);
    if (firstRole) {
      await loadRolePermissions(firstRole, active);
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

  async function loadStaffAssignments(targetName?: string, currentAuth?: Auth | null) {
    const active = currentAuth || auth;
    const target = String(targetName || staffName || "").trim();
    if (!active || !target) return;
    const data = await apiRequest<StaffAssignmentsResp>(`/api/admin/access/staff/${encodeURIComponent(target)}/roles`, {}, active);
    setStaffAssignments(data);
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

  async function handleCreateRole() {
    if (!auth) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/admin/access/roles", {
        method: "POST",
        body: JSON.stringify({ role_key: newRoleKey, label: newRoleLabel || newRoleKey, description: "" }),
      }, auth);
      setNewRoleKey("");
      setNewRoleLabel("");
      await loadBootstrap(auth);
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
      await apiRequest(`/api/admin/access/roles/${encodeURIComponent(selectedRoleKey)}/permissions`, {
        method: "PUT",
        body: JSON.stringify({ permissions }),
      }, auth);
      await loadRolePermissions(selectedRoleKey, auth);
      await loadBootstrap(auth);
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
      await loadBootstrap(auth);
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to delete role"));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateChannel() {
    if (!auth) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/admin/access/channels", {
        method: "POST",
        body: JSON.stringify({
          channel_key: newChannelKey,
          label: newChannelLabel || newChannelKey,
          route_path: newChannelRoute,
          group_name: newChannelKey.startsWith("admin.") ? "admin" : "general",
          route_match: "prefix",
          is_admin_channel: newChannelKey.startsWith("admin."),
        }),
      }, auth);
      setNewChannelKey("");
      setNewChannelLabel("");
      setNewChannelRoute("");
      await loadBootstrap(auth);
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
      await loadBootstrap(auth);
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to delete channel"));
    } finally {
      setBusy(false);
    }
  }

  async function handleAddAssignment() {
    if (!auth || !staffName.trim() || !assignmentRoleKey) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/admin/access/staff/roles", {
        method: "POST",
        body: JSON.stringify({ staff_name: staffName.trim(), role_key: assignmentRoleKey, is_primary: assignmentPrimary }),
      }, auth);
      await loadStaffAssignments(staffName.trim(), auth);
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to add assignment"));
    } finally {
      setBusy(false);
    }
  }

  async function handleMakePrimary(roleKey: string) {
    if (!auth || !staffName.trim()) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/admin/access/staff/roles/primary", {
        method: "POST",
        body: JSON.stringify({ staff_name: staffName.trim(), role_key: roleKey }),
      }, auth);
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
      await apiRequest(`/api/admin/access/staff/${encodeURIComponent(staffName.trim())}/roles/${encodeURIComponent(roleKey)}`, { method: "DELETE" }, auth);
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
          <p className="mt-3 text-sm text-rose-300">This page is available only to users with role-management permissions.</p>
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
            <p className={T_CAPTION}>Manage custom roles, channel permissions, and staff assignments from one screen.</p>
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
          ["roles", "Roles"],
          ["channels", "Channels"],
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

      {tab === "roles" ? (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className={`${GLASS_CARD} p-5`}>
            <div className="mb-3 flex items-center gap-2">
              <Layers3 className="h-4 w-4 text-violet-300" />
              <h2 className={T_SECTION}>Roles</h2>
            </div>
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
              <div>
                <h2 className={T_SECTION}>{rolePermissions?.role?.label || "Select a role"}</h2>
                <p className={T_CAPTION}>{rolePermissions?.role?.description || "Channel permissions are grouped below."}</p>
              </div>
              {rolePermissions?.role && !rolePermissions.role.is_system ? (
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

      {tab === "channels" ? (
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <div className={`${GLASS_CARD} p-5`}>
            <h2 className={T_SECTION}>Create Custom Channel</h2>
            <p className={`${T_CAPTION} mt-1`}>Custom channels appear in the access model and can later be attached to roles.</p>
            <div className="mt-4 space-y-3">
              <input value={newChannelKey} onChange={(e) => setNewChannelKey(e.target.value)} className={INPUT_CLASS} placeholder="e.g. admin.ops" />
              <input value={newChannelLabel} onChange={(e) => setNewChannelLabel(e.target.value)} className={INPUT_CLASS} placeholder="Channel label" />
              <input value={newChannelRoute} onChange={(e) => setNewChannelRoute(e.target.value)} className={INPUT_CLASS} placeholder="/admin/ops" />
              <button type="button" onClick={handleCreateChannel} disabled={busy || !newChannelKey.trim()} className={PRIMARY_BUTTON}>
                Create Channel
              </button>
            </div>
          </div>

          <div className={`${GLASS_CARD} p-5`}>
            <h2 className={T_SECTION}>Seeded And Custom Channels</h2>
            <div className="mt-4 grid gap-3">
              {channels.map((channel) => (
                <div key={channel.channel_key} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-white">{channel.label}</div>
                    <div className="text-xs text-neutral-500">{channel.channel_key} {channel.route_path ? `· ${channel.route_path}` : ""}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {channel.is_system ? <span className={BADGE_INFO}>System</span> : null}
                    {!channel.is_system ? (
                      <button type="button" onClick={() => handleDeleteChannel(channel.channel_key)} className={`${SECONDARY_BUTTON} text-rose-300`}>
                        <Trash2 className="mr-1 h-4 w-4" /> Delete
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {tab === "assignments" ? (
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <div className={`${GLASS_CARD} p-5`}>
            <div className="mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-violet-300" />
              <h2 className={T_SECTION}>Staff Assignments</h2>
            </div>
            <div className="space-y-3">
              <input value={staffName} onChange={(e) => setStaffName(e.target.value)} className={INPUT_CLASS} placeholder="Staff full name" />
              <select value={assignmentRoleKey} onChange={(e) => setAssignmentRoleKey(e.target.value)} className={SELECT_CLASS}>
                {roles.map((role) => (
                  <option key={role.role_key} value={role.role_key}>{role.label}</option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm text-neutral-300">
                <input type="checkbox" checked={assignmentPrimary} onChange={(e) => setAssignmentPrimary(e.target.checked)} />
                Set as primary role
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => loadStaffAssignments(staffName.trim(), auth)} disabled={busy || !staffName.trim()} className={SECONDARY_BUTTON}>
                  Load Staff
                </button>
                <button type="button" onClick={handleAddAssignment} disabled={busy || !staffName.trim() || !assignmentRoleKey} className={PRIMARY_BUTTON}>
                  <UserPlus className="mr-1 h-4 w-4" /> Add Assignment
                </button>
              </div>
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
                <div className="mt-4 space-y-3">
                  {staffAssignments.assignments.map((assignment) => (
                    <div key={`${assignment.role_key}-${assignment.assigned_by || "na"}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <div>
                        <div className="text-sm font-semibold text-white">{assignment.role_label || assignment.role_key}</div>
                        <div className="text-xs text-neutral-500">{assignment.role_key}</div>
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