// src/app/admin/staff/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  BarChart2,
  ClipboardList,
  ClockAlert,
  Download,
  KeyRound,
  Pencil,
  ScrollText,
  Settings2,
  ShieldCheck,
  UserPlus,
  Users,
  X,
  Zap,
} from "lucide-react";
import { canAccessAdminNav, canAccessRoleManagement, getAuth, type City } from "@/lib/auth";
import { apiGet, apiPost, qs } from "@/lib/api";
import { fmtNum } from "@/lib/formatters";
import {
  BADGE_ACCENT,
  BADGE_ERROR,
  BADGE_INFO,
  BADGE_SUCCESS,
  BADGE_WARNING,
  DANGER_BUTTON,
  DIVIDER,
  GLASS_CARD,
  INPUT_CLASS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SELECT_CLASS,
  SMALL_BUTTON,
  T_BODY,
  T_CAPTION,
  T_LABEL,
  T_PAGE_TITLE,
  T_SECTION,
  TABLE_CELL,
  TABLE_HEADER,
  TABLE_ROW,
} from "@/lib/ui-tokens";

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
    return BADGE_ACCENT;
  }
  if (role === "HQ") {
    return "inline-flex items-center rounded-full border border-amber-500/25 bg-amber-500/12 px-2.5 py-0.5 text-xs text-amber-300";
  }
  if (role === "MANAGER") {
    return BADGE_INFO;
  }
  if (role === "MANAGEMENT") {
    return "inline-flex items-center rounded-full border border-sky-500/25 bg-sky-500/12 px-2.5 py-0.5 text-xs text-sky-300";
  }
  if (role === "DUBAI_MANAGEMENT" || role === "MANILA_MANAGEMENT") {
    return "inline-flex items-center rounded-full border border-teal-500/25 bg-teal-500/12 px-2.5 py-0.5 text-xs text-teal-300";
  }
  return "inline-flex items-center rounded-full border border-white/10 bg-white/8 px-2.5 py-0.5 text-xs text-zinc-400";
}

function statusBadgeClass(status: StaffStatus) {
  if (status === "ACTIVE") {
    return BADGE_SUCCESS;
  }
  return BADGE_ERROR;
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
    return BADGE_SUCCESS;
  }
  if (setupRequired) {
    return BADGE_WARNING;
  }
  return "inline-flex items-center rounded-full border border-white/10 bg-white/8 px-2.5 py-0.5 text-xs text-zinc-400";
}

export default function AdminStaffPage() {
  const router = useRouter();

  const [authed, setAuthed] = useState<ReturnType<typeof getAuth> | null>(null);
  const [city, setCity] = useState<City>("dubai");

  const [approverName, setApproverName] = useState("");
  const [pin, setPin] = useState("");

  const [statusFilter, setStatusFilter] = useState<StaffStatus | "">("");
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
  const [branchDrafts, setBranchDrafts] = useState<Record<string, string>>({});
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [infoSavingName, setInfoSavingName] = useState("");
  const [infoSavedName, setInfoSavedName] = useState("");
  const [pushKeyDrafts, setPushKeyDrafts] = useState<Record<string, string>>({});
  const [pushKeySavingName, setPushKeySavingName] = useState("");
  const [pushKeySavedName, setPushKeySavedName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const hasLoaded = useRef(false);
  const canOpenRoleManagement = canAccessRoleManagement(authed);

  useEffect(() => {
    // Only auto-reload if the user has already authenticated and
    // loaded data at least once — prevents firing before login
    if (!hasLoaded.current) return;
    if (!norm(approverName)) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, homeBranchFilter, q, limit, listSelectedDisplayName]);

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


  const loadListStaffOptions = useCallback(async (nextCity: City, nextStatus: StaffStatus | "") => {
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
          ...(nextStatus ? { status: nextStatus } : {}),
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
          ...(statusFilter ? { status: statusFilter } : {}),
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
      hasLoaded.current = true;
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
          hasLoaded.current = true;
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
    setMsg(null);
    try {
      const nm = norm(approverName);
      const p = legacyPinOrEmpty(pin);
      if (!nm) throw new Error("Approver name is required.");
      if (!p) throw new Error("PIN is required for role change.");
      const dn = norm(displayName);
      if (!dn) throw new Error("display_name is required.");
      const nextRole = roleDrafts[dn] || asRole(rows.find((x) => norm(x.display_name) === dn)?.role);
      if (!window.confirm(`Change role for ${dn} to ${nextRole}?`)) return;
      setLoading(true);
      setRoleSavingName(displayName);

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

  const saveAll = async (displayName: string) => {
    setMsg(null);
    try {
      const nm = norm(approverName);
      const p = legacyPinOrEmpty(pin);
      if (!nm) throw new Error("Approver name is required.");
      if (!p) throw new Error("PIN is required.");
      const dn = norm(displayName);
      if (!dn) throw new Error("display_name is required.");
      const row = rows.find((x) => norm(x.display_name) === dn);
      if (!row) throw new Error("staff row not found.");

      const newName = norm(nameDrafts[dn] ?? dn);
      const newBranch = (branchDrafts[dn] ?? norm(row.home_branch)).trim();
      const nextRole = roleDrafts[dn] || asRole(row.role);
      const curBranch = norm(row.home_branch);

      const changes: string[] = [];
      if (newName !== dn) changes.push(`name: ${dn} → ${newName}`);
      if (newBranch !== curBranch) changes.push(`branch: ${curBranch || "(none)"} → ${newBranch || "(none)"}`);
      if (nextRole !== asRole(row.role)) changes.push(`role: ${asRole(row.role)} → ${nextRole}`);

      if (changes.length === 0) {
        setMsg({ kind: "ok", text: "No changes detected." });
        return;
      }
      if (!window.confirm(`Save changes for ${dn}?\n${changes.join("\n")}`)) return;

      setLoading(true);
      setInfoSavingName(displayName);

      // Always save name + branch via update_info
      await apiPost<{ ok: boolean }>("/api/admin/staff/update_info", {
        city: norm(row.city || city),
        old_name: dn,
        new_name: newName,
        new_branch: newBranch,
        approver_name: nm,
        pin: p,
      });

      // Save role only if it changed (uses the existing HQ-gated endpoint)
      if (nextRole !== asRole(row.role)) {
        await apiPost<ChangeRoleResp>("/api/admin/staff/change_role", {
          target_staff_name: newName,
          new_role: nextRole,
          approver_name: nm,
          pin: p,
        });
      }

      setMsg({ kind: "ok", text: `Saved: ${changes.join(" | ")}` });
      setInfoSavedName(dn);
      await load();
    } catch (e: any) {
      const raw = String(e?.message || e || "");
      setMsg({ kind: "err", text: friendlyErrorText(raw) });
    } finally {
      setInfoSavingName("");
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
    setMsg(null);
    try {
      const nm = norm(approverName);
      const p = legacyPinOrEmpty(pin);
      if (!nm) throw new Error("Approver name is required.");
      if (!p) throw new Error("PIN is required for status change.");

      const dn = norm(display_name);
      if (!dn) throw new Error("display_name missing.");
      if (!window.confirm(`Change status for ${dn} to ${newStatus}?`)) return;
      setLoading(true);

      const r = await apiPost<{ ok: boolean; updated: number }>(
        "/api/admin/staff/change_status",
        {
          target_staff_name: dn,
          new_status: newStatus,
          approver_name: nm,
          pin: p,
        }
      );

      setMsg({
        kind: "ok",
        text: `Status updated: ${dn} → ${newStatus} (updated=${r.updated ?? 0})`,
      });
      setRows((prev) =>
        prev.map((row) =>
          norm(row.display_name) === dn
            ? {
                ...row,
                status: newStatus,
              }
            : row
        )
      );
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

  const filteredRows = useMemo(() => {
    const statusNeedle = norm(statusFilter).toUpperCase();
    const statusScopedRows = !statusNeedle
      ? rows
      : rows.filter((row) => norm(row.status).toUpperCase() === statusNeedle);

    const q = norm(searchQuery).toLowerCase();
    if (!q) return statusScopedRows;
    return statusScopedRows.filter((row) => {
      const name = norm(row.display_name).toLowerCase();
      const branch = norm(row.home_branch).toLowerCase();
      const role = norm(row.role).toLowerCase();
      const status = norm(row.status).toLowerCase();
      return [name, branch, role, status].some((value) => value.includes(q));
    });
  }, [rows, searchQuery, statusFilter]);

  function downloadRoster() {
    const headers = ["name", "branch", "role", "status", "setup", "push_key"];
    const lines = [
      headers.join(","),
      ...filteredRows.map((row) =>
        [
          JSON.stringify(norm(row.display_name)),
          JSON.stringify(norm(row.home_branch)),
          JSON.stringify(asRole(row.role)),
          JSON.stringify(asStatus(row.status)),
          JSON.stringify(Boolean(row.setup_completed) ? "completed" : Boolean(row.setup_required) ? "pending" : "n/a"),
          JSON.stringify(norm(pushKeyDrafts[norm(row.display_name)] ?? row.workforce_push_user_key)),
        ].join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `staff_roster_${city}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!authed) return <div className="p-6 text-sm text-neutral-400">Loading...</div>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="mx-auto max-w-5xl space-y-6 px-4 py-8"
    >
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/20 to-purple-500/10">
          <Users className="h-5 w-5 text-violet-400" />
        </div>
        <div>
          <h1 className={T_PAGE_TITLE}>Staff Master</h1>
          <p className={T_CAPTION}>Manage roster, onboarding, role assignments, and staff analytics.</p>
        </div>
      </div>

      <div className="mb-2">
        <div className="mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4 text-violet-400" />
          <h2 className={T_SECTION}>Quick Links</h2>
          <p className={T_CAPTION + " ml-1"}>Move between staff master, onboarding, and HQ role management.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            {
              href: "/admin/staff/create",
              label: "Create Staff Record",
              desc: "Register a new staff member and issue setup code.",
              icon: UserPlus,
              color: "text-violet-400",
              border: "border-violet-500/20",
              bg: "from-violet-500/10 to-purple-500/5",
            },
            {
              href: "/admin/analytics",
              label: "Analytics",
              desc: "Review historical hours, weekday averages, staff workload, and absences.",
              icon: BarChart2,
              color: "text-sky-400",
              border: "border-sky-500/20",
              bg: "from-sky-500/10 to-blue-500/5",
            },
            {
              href: "/admin/staff/onboarding",
              label: "Pending Staff Setup",
              desc: "View pending setup staff and reissue codes.",
              icon: ClockAlert,
              color: "text-amber-400",
              border: "border-amber-500/20",
              bg: "from-amber-500/10 to-orange-500/5",
            },
            ...(canOpenRoleManagement
              ? [{
                  href: "/admin/staff/roles",
                  label: "Role Management",
                  desc: "HQ only. Manage channel visibility and staff role assignments.",
                  icon: ShieldCheck,
                  color: "text-amber-300",
                  border: "border-amber-400/30",
                  bg: "from-amber-400/12 to-orange-400/6",
                }]
              : []),
            {
              href: "/admin/staff/onboarding",
              label: "Onboarding Dashboard",
              desc: "View staff created, pending setup, and completed onboarding status.",
              icon: ClipboardList,
              color: "text-emerald-400",
              border: "border-emerald-500/20",
              bg: "from-emerald-500/10 to-teal-500/5",
            },
            {
              href: "/admin/staff/audit",
              label: "Audit Logs",
              desc: "View staff creation, setup completion, code reissue, and role change history.",
              icon: ScrollText,
              color: "text-zinc-400",
              border: "border-white/10",
              bg: "from-white/5 to-white/2",
            },
          ].map((item, index) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className="h-full"
            >
              <Link
                href={item.href}
                className={`group flex h-full min-h-[180px] flex-col rounded-2xl border ${item.border} bg-gradient-to-br ${item.bg} p-4 text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-lg`}
              >
                <item.icon className={`mb-2 h-5 w-5 ${item.color}`} />
                <p className="mb-1 min-h-[2.75rem] text-sm font-semibold text-white transition-colors duration-200">
                  {item.label}
                </p>
                <p className={T_CAPTION + " flex-1"}>{item.desc}</p>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      <div className={GLASS_CARD + " p-5"}>
        <div className="mb-1 flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-violet-400" />
          <h2 className={T_SECTION}>Admin · Staff Master</h2>
        </div>
        <p className={T_BODY + " mb-4"}>Manage roster without code changes (ACTIVE/INACTIVE, branch, constraints).</p>

        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={T_LABEL + " mb-1.5 block"}>City</label>
            <select className={SELECT_CLASS} value={city} onChange={(e) => setCity(e.target.value as City)}>
              <option value="dubai">Dubai</option>
              <option value="manila">Manila</option>
            </select>
          </div>
          <div>
            <label className={T_LABEL + " mb-1.5 block"}>Approver Name (HQ/ADMIN)</label>
            <input
              className={INPUT_CLASS}
              value={approverName}
              onChange={(e) => setApproverName(e.target.value)}
              placeholder="e.g. Yukihiro Nishimura"
            />
          </div>
          <div>
            <label className={T_LABEL + " mb-1.5 block"}>PIN (optional legacy)</label>
            <input
              className={INPUT_CLASS}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Leave blank for session auth"
              type="password"
              inputMode="numeric"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading || !norm(approverName)}
            className={PRIMARY_BUTTON + " flex items-center gap-2"}
          >
            <ShieldCheck className="h-4 w-4" />
            {loading ? (hasLoaded.current ? "Refreshing..." : "Loading...") : hasLoaded.current ? "Refresh list" : "Login & Load"}
          </button>
          <button type="button" onClick={resetForm} className={SECONDARY_BUTTON + " flex items-center gap-2"}>
            <X className="h-4 w-4" />
            Clear Form
          </button>
        </div>

        {msg ? (
          <div className={`mt-4 rounded-xl px-4 py-3 text-sm ${msg.kind === "err" ? "border border-red-500/25 bg-red-500/10 text-red-300" : msg.kind === "ok" ? "border border-emerald-500/25 bg-emerald-500/10 text-emerald-300" : "border border-amber-500/25 bg-amber-500/10 text-amber-300"}`}>
            {msg.text}
          </div>
        ) : null}
      </div>

      <div className={GLASS_CARD + " p-5"}>
        <div className="mb-1 flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-emerald-400" />
          <h2 className={T_SECTION}>Add New Staff</h2>
        </div>
        <p className={T_BODY + " mb-4"}>Create only. Existing staff updates are managed from the role/status list below.</p>

        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <label className={T_LABEL + " mb-1.5 block"}>
              City <span className="text-red-400">*</span>
            </label>
            <select
              className={SELECT_CLASS}
              value={city}
              onChange={(e) => setCity(e.target.value as City)}
            >
              <option value="dubai">Dubai</option>
              <option value="manila">Manila</option>
            </select>
          </div>
          <div className="sm:col-span-1">
            <label className={T_LABEL + " mb-1.5 block"}>New Staff Full Name</label>
            <input
              className={INPUT_CLASS}
              value={newStaffName}
              onChange={(e) => setNewStaffName(e.target.value)}
              placeholder="e.g. Test User"
            />
          </div>
          <div>
            <label className={T_LABEL + " mb-1.5 block"}>Home Branch</label>
            <input
              list="branch_list"
              className={INPUT_CLASS}
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
            <label className={T_LABEL + " mb-1.5 block"}>Role</label>
            <select
              className={SELECT_CLASS}
              value={newStaffRole}
              onChange={(e) => setNewStaffRole(e.target.value as "STAFF" | "MANAGER")}
            >
              <option value="STAFF">STAFF</option>
              <option value="MANAGER">MANAGER</option>
            </select>
          </div>
        </div>

        <div className="mb-4">
          <label className={T_LABEL + " mb-1.5 block"}>Status</label>
          <select
            className={SELECT_CLASS + " max-w-[180px]"}
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

        <button
          type="button"
          disabled={loading || !norm(approverName)}
          onClick={createNewStaff}
          className={PRIMARY_BUTTON + " flex items-center gap-2"}
        >
          <UserPlus className="h-4 w-4" />
          Add New Staff
        </button>
      </div>

      <div className={GLASS_CARD + " overflow-hidden"}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-5 py-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-violet-400" />
            <h2 className={T_SECTION}>Staff Roster</h2>
            <span className={BADGE_INFO}>{fmtNum(filteredRows.length)} members</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              className={INPUT_CLASS + " max-w-[200px]"}
              placeholder="Search staff..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button type="button" onClick={downloadRoster} className={SECONDARY_BUTTON + " flex items-center gap-2 text-sm"}>
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 border-b border-white/5 bg-white/3 px-5 py-4 sm:grid-cols-4 lg:grid-cols-5">
          <div>
            <label className={T_LABEL + " mb-1.5 block"}>Status</label>
            <select
              className={[
                "w-full rounded-xl border px-3 py-2 text-sm bg-neutral-950",
                statusFilter === "INACTIVE"
                  ? "border-amber-500 text-amber-200"
                  : statusFilter === "ACTIVE"
                  ? "border-emerald-700 text-emerald-200"
                  : "border-neutral-800",
              ].join(" ")}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StaffStatus | "")}
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={T_LABEL + " mb-1.5 block"}>Home Branch</label>
            <input
              list="branch_list"
              className={INPUT_CLASS}
              value={homeBranchFilter}
              onChange={(e) => setHomeBranchFilter(e.target.value)}
              placeholder="(optional)"
            />
          </div>
          <div className="sm:col-span-2">
            <label className={T_LABEL + " mb-1.5 block"}>Staff</label>
            <select className={SELECT_CLASS} value={listSelectedDisplayName} onChange={(e) => setListSelectedDisplayName(e.target.value)}>
              <option value="">All staff</option>
              {listStaffOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={T_LABEL + " mb-1.5 block"}>Limit</label>
            <input
              className={INPUT_CLASS}
              type="number"
              min={1}
              max={5000}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            />
          </div>
        </div>
        <p className="px-5 pb-3 text-[11px] italic text-neutral-500">(auto-refreshes on filter change)</p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead className="bg-white/3">
              <tr>
                {["Name", "Branch", "Role", "Status", "Actions"].map((col) => (
                  <th key={col} className={TABLE_HEADER + " px-4 py-3 text-left"}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r, i) => {
                const dn = norm(r.display_name);
                const st = asStatus(r.status);
                const hb = norm(r.home_branch);
                const rr = asRole(r.role);
                const setupRequired = Boolean(r.setup_required);
                const setupCompleted = Boolean(r.setup_completed);
                return (
                  <motion.tr
                    key={`${r.city}__${dn}`}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: i * 0.02 }}
                    className={[TABLE_ROW, !statusFilter && st === "INACTIVE" ? "opacity-60" : ""].join(" ")}
                  >
                    <td className={TABLE_CELL + " px-4 align-top"}>
                      <div className="flex items-start gap-2.5">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full border border-violet-500/20 bg-violet-500/15 text-xs font-bold text-violet-300">
                          {dn.charAt(0) || "?"}
                        </div>
                        <div className="space-y-1">
                          <span className="font-medium text-white">{dn}</span>
                          <input
                            className={INPUT_CLASS + " py-1 text-xs max-w-[220px]"}
                            placeholder="rename staff..."
                            value={nameDrafts[dn] ?? dn}
                            onChange={(e) => setNameDrafts((prev) => ({ ...prev, [dn]: e.target.value }))}
                          />
                          <div className="flex flex-wrap gap-2 text-xs text-zinc-400">
                            {r.notes ? <span>{norm(r.notes)}</span> : null}
                            <span className={setupBadgeClass(setupRequired, setupCompleted)}>
                              {setupCompleted ? "setup:done" : setupRequired ? "setup:pending" : "setup:n/a"}
                            </span>
                            {norm(r.skill_rank) ? (
                              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs ${skillBadgeClass(norm(r.skill_rank))}`}>
                                skill:{norm(r.skill_rank)}
                              </span>
                            ) : null}
                          </div>
                          <div className="flex max-w-[360px] items-center gap-2">
                            <input
                              className={INPUT_CLASS + " py-1.5 text-xs"}
                              placeholder="workforce_push_user_key"
                              value={pushKeyDrafts[dn] ?? norm(r.workforce_push_user_key)}
                              onChange={(e) => setPushKeyDrafts((prev) => ({ ...prev, [dn]: e.target.value }))}
                            />
                            <button
                              type="button"
                              onClick={() => void savePushUserKey(dn)}
                              className={SMALL_BUTTON}
                              disabled={loading}
                            >
                              {pushKeySavingName === dn ? "Saving..." : "Save Key"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className={TABLE_CELL + " px-4 align-top text-zinc-400"}>
                      <div className="space-y-2">
                        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs ${branchBadgeClass(hb)}`}>{hb || "-"}</span>
                        <div className="text-xs text-zinc-500">
                          max/wk:{Number(r.max_days_per_week ?? 6)} | max/cons:{Number(r.max_consecutive_days ?? 6)}
                        </div>
                        <input
                          className={INPUT_CLASS + " py-1.5 text-xs max-w-[140px]"}
                          placeholder="branch code"
                          value={branchDrafts[dn] ?? hb}
                          onChange={(e) => setBranchDrafts((prev) => ({ ...prev, [dn]: e.target.value }))}
                        />
                      </div>
                    </td>
                    <td className={TABLE_CELL + " px-4 align-top"}>
                      <div className="space-y-2">
                        <span className={roleBadgeClass(rr)}>{rr}</span>
                        <select
                          className={SELECT_CLASS + " max-w-[220px] py-1.5 text-xs"}
                          value={roleDrafts[dn] || rr}
                          onChange={(e) => setRoleDrafts((prev) => ({ ...prev, [dn]: asRole(e.target.value) }))}
                        >
                          {ROLE_OPTIONS.map((x) => (
                            <option key={x} value={x}>
                              {x}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className={TABLE_CELL + " px-4 align-top"}>
                      <div className="space-y-2">
                        <span className={statusBadgeClass(st)}>{st}</span>
                        {pushKeySavedName === dn ? <div className="text-xs text-emerald-300">Push key saved</div> : null}
                        {infoSavedName === dn ? <div className="text-xs text-emerald-300">Saved ✓</div> : null}
                      </div>
                    </td>
                    <td className={TABLE_CELL + " px-4 align-top"}>
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" onClick={() => void saveAll(dn)} className={SMALL_BUTTON + " flex items-center gap-1"} disabled={loading}>
                          <Pencil className="h-3 w-3" />
                          {infoSavingName === dn ? "Saving..." : "Edit"}
                        </button>
                        {canOpenRoleManagement ? (
                          <Link href={`/admin/staff/roles?staff_name=${encodeURIComponent(dn)}`} className={SMALL_BUTTON + " flex items-center gap-1"}>
                            <ShieldCheck className="h-3 w-3" />
                            Roles
                          </Link>
                        ) : null}
                        <Link href={`/admin/staff/audit?target_staff_name=${encodeURIComponent(dn)}`} className={SMALL_BUTTON + " flex items-center gap-1"}>
                          <ScrollText className="h-3 w-3" />
                          Audit
                        </Link>
                        {setupRequired && !setupCompleted ? (
                          <Link href="/admin/staff/onboarding" className={SMALL_BUTTON + " flex items-center gap-1"}>
                            <KeyRound className="h-3 w-3" />
                            Reissue
                          </Link>
                        ) : null}
                        {st === "ACTIVE" ? (
                          <button type="button" onClick={() => setStatusOnly(dn, "INACTIVE")} className={DANGER_BUTTON + " px-3 py-1.5 text-xs"} disabled={loading}>
                            Deactivate
                          </button>
                        ) : (
                          <button type="button" onClick={() => setStatusOnly(dn, "ACTIVE")} className={SMALL_BUTTON + " text-xs"} disabled={loading}>
                            Activate
                          </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
              {!filteredRows.length && !loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-zinc-500">
                    No rows.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-4 text-xs text-zinc-500">
          Note: role/status changes apply from this list and require PIN re-authentication.
        </div>
      </div>

      <div className={DIVIDER} />
    </motion.div>
  );
}