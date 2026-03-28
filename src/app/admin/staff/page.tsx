// src/app/admin/staff/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { canAccessAdminNav, getAuth, type City } from "@/lib/auth";
import { apiGet, apiPost, qs } from "@/lib/api";

const ROLE_OPTIONS = [
  "STAFF",
  "MANAGER",
  "MANAGEMENT",
  "HQ",
  "ADMIN",
  "DUBAI_MANAGEMENT",
  "MANILA_MANAGEMENT",
] as const;
type StaffRole = (typeof ROLE_OPTIONS)[number];

const STATUS_OPTIONS = ["ACTIVE", "INACTIVE"] as const;
type StaffStatus = (typeof STATUS_OPTIONS)[number];

type StaffRow = {
  id: string;
  city: string;
  display_name: string;

  home_branch?: string;
  role?: string;
  status?: string;
  max_days_per_week?: number;
  max_consecutive_days?: number;
  notes?: string;
  skill_rank?: string;
  workforce_push_user_key?: string;

  setup_required?: boolean;
  setup_completed?: boolean;

  created_at?: string | null;
  updated_at?: string | null;
};

type CreateStaffResp = {
  ok: boolean;
  display_name?: string;
  home_branch?: string;
  role?: string;
  status?: string;
};

type ChangeRoleResp = {
  ok: boolean;
  staff_name?: string;
  role?: string;
};

type Msg = { kind: "ok" | "err" | "info"; text: string } | null;

function norm(s: any) {
  return String(s ?? "").trim();
}

function legacyPinOrEmpty(pin: string) {
  const p = norm(pin);
  if (!p) return "";
  if (p.toLowerCase() === "session") return "";
  return p;
}

function canonicalStaffName(name: string) {
  return norm(name).toLowerCase().replace(/\s+/g, " ");
}

function dedupeStaffRows(input: StaffRow[]): StaffRow[] {
  const byName = new Map<string, StaffRow>();
  for (const row of input) {
    const key = canonicalStaffName(String(row.display_name || ""));
    if (!key) continue;
    const prev = byName.get(key);
    if (!prev) {
      byName.set(key, row);
      continue;
    }
    const prevScore =
      (norm(prev.home_branch) ? 1 : 0) +
      (norm(prev.notes) ? 1 : 0) +
      (norm(prev.role) && norm(prev.role) !== "STAFF" ? 1 : 0);
    const nextScore =
      (norm(row.home_branch) ? 1 : 0) +
      (norm(row.notes) ? 1 : 0) +
      (norm(row.role) && norm(row.role) !== "STAFF" ? 1 : 0);
    if (nextScore > prevScore) byName.set(key, row);
  }
  return Array.from(byName.values()).sort((a, b) =>
    norm(a.display_name).localeCompare(norm(b.display_name))
  );
}

function friendlyErrorText(raw: string): string {
  const x = String(raw || "");
  if (!x) return "Unknown error";
  if (x.includes("STEP_UP_REQUIRED:phishing_resistant")) {
    return "This action requires a fresh Passkey verification.";
  }
  if (x.includes("Only ADMIN can use this endpoint") || x.includes("\"Only ADMIN can use this endpoint\"")) {
    return "Legacy backend endpoint detected. Please redeploy backend, then retry.";
  }
  return x;
}

function asRole(s: any): StaffRole {
  const u = norm(s).toUpperCase();
  if (ROLE_OPTIONS.includes(u as any)) return u as StaffRole;
  return "STAFF";
}

function asStatus(s: any): StaffStatus {
  const u = norm(s).toUpperCase();
  if (STATUS_OPTIONS.includes(u as any)) return u as StaffStatus;
  return "ACTIVE";
}

function roleBadgeClass(role: StaffRole) {
  if (role === "ADMIN") {
    return "border-fuchsia-900/40 bg-fuchsia-950/10 text-fuchsia-200";
  }
  if (role === "HQ") {
    return "border-amber-900/40 bg-amber-950/10 text-amber-200";
  }
  if (role === "MANAGER") {
    return "border-sky-900/40 bg-sky-950/10 text-sky-200";
  }
  if (role === "MANAGEMENT") {
    return "border-cyan-900/40 bg-cyan-950/10 text-cyan-200";
  }
  if (role === "DUBAI_MANAGEMENT" || role === "MANILA_MANAGEMENT") {
    return "border-teal-900/40 bg-teal-950/10 text-teal-200";
  }
  return "border-neutral-800 bg-neutral-950/40 text-neutral-200";
}

function statusBadgeClass(status: StaffStatus) {
  if (status === "ACTIVE") {
    return "border-emerald-900/40 bg-emerald-950/10 text-emerald-200";
  }
  return "border-rose-900/40 bg-rose-950/10 text-rose-200";
}

function branchBadgeClass(branch: string) {
  const b = (branch || "").trim().toUpperCase();

  if (b === "BB" || b === "BUSINESS BAY") {
    return "border-sky-900/40 bg-sky-950/10 text-sky-200";
  }
  if (b === "JLT") {
    return "border-cyan-900/40 bg-cyan-950/10 text-cyan-200";
  }
  if (b === "ARJ" || b === "ARJAN") {
    return "border-emerald-900/40 bg-emerald-950/10 text-emerald-200";
  }
  if (b === "AM" || b === "AL MINA") {
    return "border-rose-900/40 bg-rose-950/10 text-rose-200";
  }
  if (b === "AB" || b === "AL BARSHA") {
    return "border-amber-900/40 bg-amber-950/10 text-amber-200";
  }
  if (b === "CK") {
    return "border-violet-900/40 bg-violet-950/10 text-violet-200";
  }

  return "border-neutral-800 bg-neutral-950/40 text-neutral-200";
}

function skillBadgeClass(skill: string) {
  const s = (skill || "").trim().toUpperCase();

  if (s === "A") {
    return "border-emerald-900/40 bg-emerald-950/10 text-emerald-200";
  }
  if (s === "B") {
    return "border-sky-900/40 bg-sky-950/10 text-sky-200";
  }
  if (s === "C") {
    return "border-amber-900/40 bg-amber-950/10 text-amber-200";
  }
  if (s === "D") {
    return "border-orange-900/40 bg-orange-950/10 text-orange-200";
  }

  return "border-neutral-800 bg-neutral-950/40 text-neutral-200";
}

function setupBadgeClass(setupRequired: boolean, setupCompleted: boolean) {
  if (setupCompleted) {
    return "border-emerald-900/40 bg-emerald-950/10 text-emerald-200";
  }
  if (setupRequired) {
    return "border-amber-900/40 bg-amber-950/10 text-amber-200";
  }
  return "border-neutral-800 bg-neutral-950/40 text-neutral-200";
}

export default function AdminStaffPage() {
  const router = useRouter();

  const [authed, setAuthed] = useState<ReturnType<typeof getAuth> | null>(null);
  const [city, setCity] = useState<City>("dubai");

  const [approverName, setApproverName] = useState("");
  const [pin, setPin] = useState("");

  const [statusFilter, setStatusFilter] = useState<StaffStatus>("ACTIVE");
  const [homeBranchFilter, setHomeBranchFilter] = useState("");
  const q = "";
  const [limit, setLimit] = useState(2000);
  const [listSelectedDisplayName, setListSelectedDisplayName] = useState("");
  const [listStaffOptions, setListStaffOptions] = useState<string[]>([]);

  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffHomeBranch, setNewStaffHomeBranch] = useState("");
  const [newStaffRole, setNewStaffRole] = useState<"STAFF" | "MANAGER">("STAFF");
  const [newStaffStatus, setNewStaffStatus] = useState<StaffStatus>("ACTIVE");
  const [roleDrafts, setRoleDrafts] = useState<Record<string, StaffRole>>({});
  const [roleSavingName, setRoleSavingName] = useState("");
  const [roleSavedName, setRoleSavedName] = useState("");
  const [pushKeyDrafts, setPushKeyDrafts] = useState<Record<string, string>>({});
  const [pushKeySavingName, setPushKeySavingName] = useState("");
  const [pushKeySavedName, setPushKeySavedName] = useState("");

  useEffect(() => {
    const a = getAuth();
    if (!a) {
      router.replace("/login?next=%2Fadmin%2Fstaff");
      return;
    }
    if (!canAccessAdminNav(a)) {
      router.replace("/week");
      return;
    }
    setAuthed(a);
    setCity(a.city || "dubai");
    setApproverName(a.staffName || "");
    setPin(a.pin || "");
  }, [router]);


  const loadListStaffOptions = useCallback(async (nextCity: City, nextStatus: StaffStatus) => {
    try {
      const nm = norm(approverName);
      if (!nm) {
        setListStaffOptions([]);
        return;
      }
      const p = legacyPinOrEmpty(pin);
      const res = await apiGet<{ ok?: boolean; names?: string[] }>(
        `/api/admin/staff_master/names${qs({
          city: nextCity,
          status: nextStatus,
          limit: 5000,
          approver_name: nm,
          ...(p ? { pin: p } : {}),
        })}`
      );
      setListStaffOptions(Array.isArray(res?.names) ? res.names : []);
    } catch {
      setListStaffOptions([]);
    }
  }, [approverName, pin]);

  useEffect(() => {
    if (approverName.trim()) {
      void loadListStaffOptions(city, statusFilter);
    } else {
      setListStaffOptions([]);
    }
  }, [city, statusFilter, approverName, loadListStaffOptions]);


  const msgCls =
    msg?.kind === "err"
      ? "text-red-300"
      : msg?.kind === "ok"
        ? "text-emerald-200"
        : "text-amber-200";


  const load = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const nm = norm(approverName);
      const p = legacyPinOrEmpty(pin);
      if (!nm) throw new Error("Approver name is required.");

      const res = await apiGet<{ ok: boolean; rows: StaffRow[] }>(
        `/api/admin/staff_master${qs({
          city,
          status: statusFilter,
          home_branch: homeBranchFilter,
          q: norm(listSelectedDisplayName) || q,
          limit,
          approver_name: nm,
          ...(p ? { pin: p } : {}),
        })}`
      );

      const list = (res.rows || []).map((r) => ({
        ...r,
        display_name: norm(r.display_name),
        home_branch: norm(r.home_branch),
        role: norm(r.role),
        status: norm(r.status),
        notes: norm(r.notes),
        workforce_push_user_key: norm(r.workforce_push_user_key),
      }));

      const deduped = dedupeStaffRows(list);
      setRows(deduped);
      setMsg({ kind: "ok", text: `Loaded: ${deduped.length} rows` });
    } catch (e: any) {
      const errText = String(e?.message || e || "");
      const looksLegacyAdminGate =
        errText.includes("Only ADMIN can use this endpoint") || errText.includes("\"Only ADMIN can use this endpoint\"");
      if (looksLegacyAdminGate) {
        try {
          const nm = norm(approverName);
          const p = legacyPinOrEmpty(pin);
          if (!p) {
            throw new Error("Legacy backend detected. Enter PIN once, then retry Verify & Load.");
          }
          const namesRes = await apiGet<{ ok?: boolean; names?: string[] }>(
            `/api/admin/staff_master/names${qs({
              city,
              status: statusFilter,
              limit: Math.max(1, Math.min(limit, 500)),
              approver_name: nm,
              pin: p,
            })}`
          );
          const names = (Array.isArray(namesRes?.names) ? namesRes.names : []).slice(0, Math.max(1, Math.min(limit, 500)));
          const detailRows = await Promise.all(
            names.map(async (name) => {
              const one = await apiGet<{ ok?: boolean; row?: any }>(
                `/api/admin/staff/one${qs({
                  display_name: name,
                  approver_name: nm,
                  pin: p,
                })}`
              );
              return {
                id: norm(one?.row?.display_name || name),
                city: norm(one?.row?.city || city),
                display_name: norm(one?.row?.display_name || name),
                home_branch: norm(one?.row?.home_branch),
                role: norm(one?.row?.role || "STAFF"),
                status: norm(one?.row?.status || "ACTIVE"),
                max_days_per_week: 6,
                max_consecutive_days: 6,
                notes: "",
                setup_required: Boolean(one?.row?.setup_required),
                setup_completed: Boolean(one?.row?.setup_completed),
              } as StaffRow;
            })
          );
          const deduped = dedupeStaffRows(detailRows);
          setRows(deduped);
          setMsg({ kind: "info", text: `Legacy backend fallback used. Loaded: ${deduped.length} rows` });
          return;
        } catch (fallbackErr: any) {
          setRows([]);
          setMsg({ kind: "err", text: friendlyErrorText(String(fallbackErr?.message || fallbackErr || errText)) });
          return;
        }
      }
      setRows([]);
      setMsg({ kind: "err", text: friendlyErrorText(errText) });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setNewStaffName("");
    setNewStaffHomeBranch("");
    setNewStaffRole("STAFF");
    setNewStaffStatus("ACTIVE");
  };

  const createNewStaff = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const nm = norm(approverName);
      const p = legacyPinOrEmpty(pin);
      if (!nm) throw new Error("Approver name is required.");
      if (!p) throw new Error("PIN is required for Add New Staff.");
      const display = norm(newStaffName);
      const branch = norm(newStaffHomeBranch);
      if (!display) throw new Error("New staff name is required.");
      if (!branch) throw new Error("Home branch is required.");

      const r = await apiPost<CreateStaffResp>("/api/store/staff/create", {
        city,
        display_name: display,
        home_branch: branch,
        role: newStaffRole,
        status: newStaffStatus,
        approver_name: nm,
        pin: p,
      });

      setMsg({ kind: "ok", text: `Created: ${norm(r?.display_name || display)}` });
      resetForm();
      await load();
    } catch (e: any) {
      const raw = String(e?.message || e || "");
      setMsg({ kind: "err", text: friendlyErrorText(raw) });
    } finally {
      setLoading(false);
    }
  };

  const changeRole = async (displayName: string) => {
    setLoading(true);
    setMsg(null);
    setRoleSavingName(displayName);
    try {
      const nm = norm(approverName);
      const p = legacyPinOrEmpty(pin);
      if (!nm) throw new Error("Approver name is required.");
      if (!p) throw new Error("PIN is required for role change.");
      const dn = norm(displayName);
      if (!dn) throw new Error("display_name is required.");
      const nextRole = roleDrafts[dn] || asRole(rows.find((x) => norm(x.display_name) === dn)?.role);

      const res = await apiPost<ChangeRoleResp>("/api/admin/staff/change_role", {
        target_staff_name: dn,
        new_role: nextRole,
        approver_name: nm,
        pin: p,
      });
      setMsg({ kind: "ok", text: `Role updated: ${dn} -> ${norm(res?.role || nextRole)}` });
      setRoleSavedName(dn);
      await load();
    } catch (e: any) {
      const raw = String(e?.message || e || "");
      setMsg({ kind: "err", text: friendlyErrorText(raw) });
    } finally {
      setRoleSavingName("");
      setLoading(false);
    }
  };

  const savePushUserKey = async (displayName: string) => {
    setLoading(true);
    setMsg(null);
    setPushKeySavingName(displayName);
    try {
      const nm = norm(approverName);
      const p = legacyPinOrEmpty(pin);
      if (!nm) throw new Error("Approver name is required.");
      if (!p) throw new Error("PIN is required for workforce push key save.");
      const dn = norm(displayName);
      if (!dn) throw new Error("display_name is required.");
      const row = rows.find((x) => norm(x.display_name) === dn);
      if (!row) throw new Error("staff row not found.");
      const keyDraft = norm(pushKeyDrafts[dn] ?? row.workforce_push_user_key);
      await apiPost<{ ok: boolean; id?: string }>("/api/admin/staff_master/upsert", {
        city: norm(row.city || city),
        display_name: dn,
        home_branch: norm(row.home_branch),
        role: asRole(row.role),
        status: asStatus(row.status),
        max_days_per_week: Number(row.max_days_per_week ?? 6),
        max_consecutive_days: Number(row.max_consecutive_days ?? 6),
        notes: norm(row.notes),
        workforce_push_user_key: keyDraft,
        approver_name: nm,
        pin: p,
      });
      setMsg({ kind: "ok", text: `Push key saved: ${dn}` });
      setPushKeySavedName(dn);
      await load();
    } catch (e: any) {
      const raw = String(e?.message || e || "");
      setMsg({ kind: "err", text: friendlyErrorText(raw) });
    } finally {
      setPushKeySavingName("");
      setLoading(false);
    }
  };

  const setStatusOnly = async (display_name: string, newStatus: StaffStatus) => {
    setLoading(true);
    setMsg(null);
    try {
      const nm = norm(approverName);
      const p = legacyPinOrEmpty(pin);
      if (!nm) throw new Error("Approver name is required.");

      const dn = norm(display_name);
      if (!dn) throw new Error("display_name missing.");

      const r = await apiPost<{ ok: boolean; updated: number }>(
        "/api/admin/staff_master/set_status",
        {
          city,
          display_name: dn,
          status: newStatus,
          approver_name: nm,
          ...(p ? { pin: p } : {}),
        }
      );

      setMsg({
        kind: "ok",
        text: `Status updated: ${dn} → ${newStatus} (updated=${r.updated ?? 0})`,
      });
      await load();
    } catch (e: any) {
      setMsg({ kind: "err", text: friendlyErrorText(String(e?.message || e || "")) });
    } finally {
      setLoading(false);
    }
  };

  const branches = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      const hb = norm(r.home_branch);
      if (hb) set.add(hb);
    });

    [
      "Business Bay",
      "JLT",
      "Arjan",
      "Al Mina",
      "Al Barsha",
      "CK",
      "Delivery",
    ].forEach((x) => set.add(x));

    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  if (!authed) return <div className="p-6 text-sm text-neutral-400">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
        <div className="text-sm font-semibold">Quick Links</div>
        <div className="mt-1 text-xs text-neutral-500">
          Move between staff master, onboarding, and HQ role management.
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <a
            href="/admin/staff/create"
            className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 transition hover:bg-neutral-900"
          >
            <div className="text-sm font-semibold">Create Staff Record</div>
            <div className="mt-1 text-xs text-neutral-400">
              Register a new staff member and issue setup code.
            </div>
          </a>

          <a
            href="/admin/analytics"
            className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 transition hover:bg-neutral-900"
          >
            <div className="text-sm font-semibold">Analytics</div>
            <div className="mt-1 text-xs text-neutral-400">
              Review historical hours, weekday averages, staff workload, and absences.
            </div>
          </a>

          <a
            href="/admin/staff/setup"
            className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 transition hover:bg-neutral-900"
          >
            <div className="text-sm font-semibold">Pending Staff Setup</div>
            <div className="mt-1 text-xs text-neutral-400">
              View pending setup staff and reissue codes.
            </div>
          </a>

          <a
            href="/admin/staff/roles"
            className="rounded-xl border border-amber-900/40 bg-amber-950/10 p-4 transition hover:bg-amber-950/20"
          >
            <div className="text-sm font-semibold text-amber-200">Role Management</div>
            <div className="mt-1 text-xs text-neutral-400">
              HQ only. Change staff roles including ADMIN.
            </div>
          </a>

          <a
            href="/admin/staff/onboarding"
            className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 transition hover:bg-neutral-900"
          >
            <div className="text-sm font-semibold">Onboarding Dashboard</div>
            <div className="mt-1 text-xs text-neutral-400">
              View staff created, pending setup, and completed onboarding status.
            </div>
          </a>

          <a
            href="/admin/staff/audit"
            className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 transition hover:bg-neutral-900"
          >
            <div className="text-sm font-semibold">Audit Logs</div>
            <div className="mt-1 text-xs text-neutral-400">
              View staff creation, setup completion, code reissue, and role change history.
            </div>
          </a>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4">
        <div className="text-sm font-semibold">Admin • Staff Master</div>
        <div className="mt-1 text-xs text-neutral-500">
          Manage roster without code changes (ACTIVE/INACTIVE, branch, constraints).
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="mb-1 text-xs text-neutral-400">City</div>
            <select
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={city}
              onChange={(e) => setCity(e.target.value as City)}
            >
              <option value="dubai">Dubai</option>
              <option value="manila">Manila</option>
            </select>
          </div>

          <div>
            <div className="mb-1 text-xs text-neutral-400">Approver name (HQ/ADMIN)</div>
            <input
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={approverName}
              onChange={(e) => setApproverName(e.target.value)}
              placeholder="e.g. Yukihiro Nishimura"
            />
          </div>

          <div>
            <div className="mb-1 text-xs text-neutral-400">PIN (optional legacy)</div>
            <input
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Leave blank for session auth"
              type="password"
              inputMode="numeric"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading || !norm(approverName)}
            className="rounded-xl border border-neutral-800 bg-neutral-950/30 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900/40 hover:text-white disabled:opacity-60"
            title="Load"
          >
            {loading ? "Loading..." : "Verify & Load"}
          </button>

          <button
            type="button"
            onClick={resetForm}
            className="rounded-xl border border-neutral-800 bg-neutral-950/30 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900/40"
          >
            Clear form
          </button>

          {msg ? <div className={`text-sm ${msgCls}`}>{msg.text}</div> : null}
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
        <div className="text-sm font-semibold">Add New Staff</div>
        <div className="mt-1 text-xs text-neutral-500">
          Create only. Existing staff updates are managed from the role/status list below.
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <div className="mb-1 text-xs text-neutral-400">New staff full name</div>
            <input
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={newStaffName}
              onChange={(e) => setNewStaffName(e.target.value)}
              placeholder="e.g. Test User"
            />
          </div>

          <div>
            <div className="mb-1 text-xs text-neutral-400">Home branch</div>
            <input
              list="branch_list"
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={newStaffHomeBranch}
              onChange={(e) => setNewStaffHomeBranch(e.target.value)}
              placeholder="Business Bay / JLT / ..."
            />
            <datalist id="branch_list">
              {branches.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </div>

          <div>
            <div className="mb-1 text-xs text-neutral-400">Role</div>
            <select
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={newStaffRole}
              onChange={(e) => setNewStaffRole(e.target.value as "STAFF" | "MANAGER")}
            >
              <option value="STAFF">STAFF</option>
              <option value="MANAGER">MANAGER</option>
            </select>
          </div>

          <div>
            <div className="mb-1 text-xs text-neutral-400">Status</div>
            <select
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={newStaffStatus}
              onChange={(e) => setNewStaffStatus(e.target.value as StaffStatus)}
            >
              {STATUS_OPTIONS.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            disabled={loading || !norm(approverName)}
            onClick={createNewStaff}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm hover:bg-neutral-900 disabled:opacity-60"
          >
            Add New Staff
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Role Management</div>
            <div className="text-xs text-neutral-500">
              Rows: <span className="text-neutral-200">{rows.length}</span>
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-5">
          <div>
            <div className="mb-1 text-xs text-neutral-400">Status</div>
            <select
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StaffStatus)}
            >
              {STATUS_OPTIONS.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-1 text-xs text-neutral-400">Home branch</div>
            <input
              list="branch_list"
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={homeBranchFilter}
              onChange={(e) => setHomeBranchFilter(e.target.value)}
              placeholder="(optional)"
            />
          </div>

          <div className="sm:col-span-2">
            <div className="mb-1 text-xs text-neutral-400">Staff</div>
            <select
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={listSelectedDisplayName}
              onChange={(e) => setListSelectedDisplayName(e.target.value)}
            >
              <option value="">All staff</option>
              {listStaffOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-1 text-xs text-neutral-400">Limit</div>
            <input
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              type="number"
              min={1}
              max={5000}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading || !norm(approverName)}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm hover:bg-neutral-900 disabled:opacity-60"
          >
            Load List
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {!rows.length && !loading ? (
            <div className="text-sm text-neutral-500">No rows.</div>
          ) : null}

          {rows.map((r) => {
            const dn = norm(r.display_name);
            const st = asStatus(r.status);
            const hb = norm(r.home_branch);
            const rr = asRole(r.role);
            const mdw = Number(r.max_days_per_week ?? 6);
            const mcd = Number(r.max_consecutive_days ?? 6);
            const sr = norm(r.skill_rank);
            const setupRequired = Boolean(r.setup_required);
            const setupCompleted = Boolean(r.setup_completed);
            const setupLabel = setupCompleted ? "setup:done" : setupRequired ? "setup:pending" : "setup:n/a";

            return (
              <div
                key={`${r.city}__${dn}`}
                className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{dn}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
                      <span
                        className={[
                          "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                          branchBadgeClass(hb),
                        ].join(" ")}
                      >
                        {hb || "-"}
                      </span>

                      <span
                        className={[
                          "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                          roleBadgeClass(rr),
                        ].join(" ")}
                      >
                        {rr}
                      </span>

                      <span
                        className={[
                          "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                          statusBadgeClass(st),
                        ].join(" ")}
                      >
                        {st}
                      </span>

                      <span>max/wk:{mdw}</span>
                      <span>max/cons:{mcd}</span>
                      {sr ? (
                        <span
                          className={[
                            "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                            skillBadgeClass(sr),
                          ].join(" ")}
                        >
                          skill:{sr}
                        </span>
                      ) : null}
                      <span
                        className={[
                          "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                          setupBadgeClass(setupRequired, setupCompleted),
                        ].join(" ")}
                      >
                        {setupLabel}
                      </span>
                    </div>
                    {r.notes ? (
                      <div className="mt-1 truncate text-xs text-neutral-500">
                        {norm(r.notes)}
                      </div>
                    ) : null}
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        className="w-72 max-w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs"
                        placeholder="workforce_push_user_key"
                        value={pushKeyDrafts[dn] ?? norm(r.workforce_push_user_key)}
                        onChange={(e) =>
                          setPushKeyDrafts((prev) => ({ ...prev, [dn]: e.target.value }))
                        }
                      />
                      <button
                        type="button"
                        onClick={() => void savePushUserKey(dn)}
                        className="rounded-lg border border-fuchsia-900 bg-fuchsia-950/20 px-3 py-1 text-xs text-fuchsia-200 hover:bg-fuchsia-950/40 disabled:opacity-60"
                        disabled={loading}
                      >
                        {pushKeySavingName === dn ? "Saving key..." : "Save Push Key"}
                      </button>
                      {pushKeySavedName === dn ? (
                        <span className="text-[11px] text-emerald-300">Saved</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs"
                      value={roleDrafts[dn] || rr}
                      onChange={(e) =>
                        setRoleDrafts((prev) => ({ ...prev, [dn]: asRole(e.target.value) }))
                      }
                    >
                      {ROLE_OPTIONS.map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void changeRole(dn)}
                      className="rounded-lg border border-amber-900 bg-amber-950/20 px-3 py-1 text-xs text-amber-200 hover:bg-amber-950/40 disabled:opacity-60"
                      disabled={loading}
                    >
                      {roleSavingName === dn ? "Saving..." : "Save Role"}
                    </button>
                    {roleSavedName === dn ? (
                      <span className="text-[11px] text-emerald-300">Saved</span>
                    ) : null}

                    <a
                      href={`/admin/staff/audit?target_staff_name=${encodeURIComponent(dn)}`}
                      className="rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-900"
                    >
                      Audit
                    </a>

                    {setupRequired && !setupCompleted ? (
                      <a
                        href="/admin/staff/setup"
                        className="rounded-lg border border-sky-900/40 bg-sky-950/10 px-3 py-1 text-xs text-sky-200 hover:bg-sky-950/20"
                      >
                        Pending Setup
                      </a>
                    ) : null}

                    {st === "ACTIVE" ? (
                      <button
                        type="button"
                        onClick={() => setStatusOnly(dn, "INACTIVE")}
                        className="rounded-lg border border-amber-900 bg-amber-950/30 px-3 py-1 text-xs text-amber-200 hover:bg-amber-950/50"
                        disabled={loading}
                      >
                        Deactivate
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setStatusOnly(dn, "ACTIVE")}
                        className="rounded-lg border border-emerald-900 bg-emerald-950/30 px-3 py-1 text-xs text-emerald-200 hover:bg-emerald-950/50"
                        disabled={loading}
                      >
                        Activate
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 text-xs text-neutral-500">
          Note: role/status changes apply from this list. If role update fails with legacy backend, redeploy backend and retry.
        </div>
      </div>
    </div>
  );
}