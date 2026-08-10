"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAuth, refreshAuthFromApi } from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import SelectDark from "@/components/SelectDark";
import {
  GLASS_CARD, PRIMARY_BUTTON, SECONDARY_BUTTON, INPUT_CLASS,
  T_PAGE_TITLE, T_LABEL, BADGE_ERROR, BADGE_WARNING, BADGE_SUCCESS, BADGE_INFO,
} from "@/lib/ui-tokens";
import { RefreshCw, AlertCircle, UserCheck, Calendar, Pencil, X, Check, Trash2 } from "lucide-react";

type ProbationEmployee = {
  staff_name: string;
  city: string;
  hired_at: string | null;
  is_active: boolean;
  cycle_number: number | null;
  cycle_start_date: string | null;
  cycle_end_date: string | null;
  cycle_status: string | null;
  absent_count: number;
  late_count: number;
  total_late_minutes: number;
  early_leave_count: number;
  graduated: boolean;
  bonus_awarded: boolean;
  termination_flagged: boolean;
  termination_reason: string | null;
};

type EditDraft = {
  hired_at: string;
  cycle_start_date: string;
  cycle_end_date: string;
  cycle_status: string;
  graduated: boolean;
  bonus_awarded: boolean;
  termination_flagged: boolean;
  termination_reason: string;
};

const ADMIN_ROLES = new Set(["ADMIN", "HQ", "HR_MANAGER", "MANILA_MANAGEMENT", "MANILA_MANAGER"]);

function canAccessProbation(role: string, permissions: string[]): boolean {
  if (ADMIN_ROLES.has(role.toUpperCase())) return true;
  if (permissions.includes("*")) return true;
  return permissions.some((p) => p.includes("probation"));
}

function statusBadge(emp: ProbationEmployee) {
  if (emp.termination_flagged) return <span className={BADGE_ERROR}>⛔ Termination Risk</span>;
  if (emp.graduated) return <span className={BADGE_SUCCESS}>✓ Graduated</span>;
  if (emp.cycle_status === "PASSED") return <span className={BADGE_SUCCESS}>✓ Passed</span>;
  if (emp.cycle_status === "FAILED") return <span className={BADGE_WARNING}>↩ Failed — retry</span>;
  if (emp.cycle_status === "IN_PROGRESS") return <span className={BADGE_INFO}>In Progress</span>;
  return <span className={BADGE_INFO}>No cycle yet</span>;
}

function empToEditDraft(emp: ProbationEmployee): EditDraft {
  return {
    hired_at: emp.hired_at ? String(emp.hired_at).slice(0, 10) : "",
    cycle_start_date: emp.cycle_start_date ? String(emp.cycle_start_date).slice(0, 10) : "",
    cycle_end_date: emp.cycle_end_date ? String(emp.cycle_end_date).slice(0, 10) : "",
    cycle_status: emp.cycle_status || "",
    graduated: emp.graduated,
    bonus_awarded: emp.bonus_awarded,
    termination_flagged: emp.termination_flagged,
    termination_reason: emp.termination_reason || "",
  };
}

export default function ProbationPage() {
  const auth = useMemo(() => getAuth(), []);
  const [allowed, setAllowed] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [city, setCity] = useState("manila");
  const [employees, setEmployees] = useState<ProbationEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Set hired_at form
  const [hiredAtName, setHiredAtName] = useState("");
  const [hiredAtDate, setHiredAtDate] = useState("");
  const [settingHiredAt, setSettingHiredAt] = useState(false);
  const [staffNames, setStaffNames] = useState<string[]>([]);

  // Inline edit state: key = staff_name
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const localAuth = auth ?? getAuth();
      const refreshed = await refreshAuthFromApi(localAuth);
      const resolved = refreshed || localAuth;
      setAllowed(canAccessProbation(String(resolved?.role || ""), Array.isArray(resolved?.permissions) ? (resolved.permissions as string[]) : []));
      setCity(String(resolved?.city || "manila").toLowerCase() === "dubai" ? "dubai" : "manila");
      setAuthChecked(true);
    }
    void init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (!auth?.hasSession && !auth?.accessToken) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/probation/summary?city=${encodeURIComponent(city)}`, {
        headers: auth?.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {},
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEmployees(Array.isArray(data?.employees) ? data.employees : []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [auth, city]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  useEffect(() => {
    if (!allowed || (!auth?.hasSession && !auth?.accessToken)) return;
    fetch(`/api/admin/staff_master/names?city=${city}&status=ACTIVE&limit=5000`, {
      headers: auth?.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {},
    })
      .then((r) => r.json())
      .then((d) => setStaffNames(Array.isArray(d?.names) ? d.names : []))
      .catch(() => {});
  }, [allowed, auth, city]);

  const handleSetHiredAt = async () => {
    if ((!auth?.hasSession && !auth?.accessToken) || !hiredAtName.trim() || !hiredAtDate.trim()) return;
    setSettingHiredAt(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await fetch(`/api/admin/probation/set-hired-at`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(auth?.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {}) },
        body: JSON.stringify({ staff_name: hiredAtName.trim(), hired_at: hiredAtDate }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.detail || `HTTP ${res.status}`);
      }
      setSuccessMsg(`Hire date set for ${hiredAtName.trim()}`);
      setHiredAtName("");
      setHiredAtDate("");
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSettingHiredAt(false);
    }
  };

  const startEdit = (emp: ProbationEmployee) => {
    setEditingName(emp.staff_name);
    setEditDraft(empToEditDraft(emp));
    setDeleteConfirm(null);
  };

  const cancelEdit = () => {
    setEditingName(null);
    setEditDraft(null);
    setDeleteConfirm(null);
  };

  const handleSave = async (emp: ProbationEmployee) => {
    if ((!auth?.hasSession && !auth?.accessToken) || !editDraft) return;
    setSaving(true);
    setError("");
    setSuccessMsg("");
    try {
      const body: Record<string, unknown> = {
        staff_name: emp.staff_name,
        city: emp.city,
        hired_at: editDraft.hired_at || null,
      };
      if (emp.cycle_number !== null) {
        body.cycle_number = emp.cycle_number;
        if (editDraft.cycle_start_date) body.cycle_start_date = editDraft.cycle_start_date;
        if (editDraft.cycle_end_date) body.cycle_end_date = editDraft.cycle_end_date;
        if (editDraft.cycle_status) body.cycle_status = editDraft.cycle_status;
        body.graduated = editDraft.graduated;
        body.bonus_awarded = editDraft.bonus_awarded;
        body.termination_flagged = editDraft.termination_flagged;
        body.termination_reason = editDraft.termination_reason || null;
      }
      const res = await fetch(`/api/admin/probation/update`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(auth?.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {}) },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.detail || `HTTP ${res.status}`);
      }
      setSuccessMsg(`Saved changes for ${emp.staff_name}`);
      cancelEdit();
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (emp: ProbationEmployee) => {
    if (!auth?.hasSession && !auth?.accessToken) return;
    setSaving(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await fetch(
        `/api/admin/probation/delete?staff_name=${encodeURIComponent(emp.staff_name)}&city=${encodeURIComponent(emp.city)}`,
        { method: "DELETE", headers: auth?.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {} },
      );
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.detail || `HTTP ${res.status}`);
      }
      setSuccessMsg(`Removed ${emp.staff_name} from probation tracking`);
      cancelEdit();
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!authChecked) return null;
  if (!allowed) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
        <AlertCircle className="h-4 w-4 shrink-0" /> Probation management is only available to HR / Admin roles.
      </div>
    );
  }

  const active = employees.filter((e) => !e.graduated && e.cycle_status !== "TERMINATED");
  const graduated = employees.filter((e) => e.graduated);
  const terminated = employees.filter((e) => e.termination_flagged);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className={T_PAGE_TITLE}>New Employee Probation</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Track 14-day probation cycles. Perfect attendance → PHP 2,000 bonus + Meal Allowance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl overflow-hidden border border-white/10">
            {(["manila", "dubai"] as const).map((c) => (
              <button key={c} type="button" onClick={() => setCity(c)}
                className={["px-3 py-1.5 text-xs font-semibold transition-colors capitalize",
                  city === c ? "bg-violet-600/70 text-white" : "bg-white/5 text-zinc-400 hover:bg-white/10",
                ].join(" ")}>{c}</button>
            ))}
          </div>
          <button type="button" onClick={() => void load()} disabled={loading}
            className={`${SECONDARY_BUTTON} flex items-center gap-1.5`}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Set Hired At */}
      <div className={`${GLASS_CARD} p-4`}>
        <p className="mb-3 text-sm font-semibold text-white flex items-center gap-2">
          <Calendar className="h-4 w-4 text-violet-400" /> Set Hire Date for Staff
        </p>
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className={`${T_LABEL} mb-1 block`}>Staff Name</label>
            {staffNames.length > 0 ? (
              <SelectDark
                value={hiredAtName}
                onChange={setHiredAtName}
                options={staffNames}
                placeholder="— Select active staff —"
              />
            ) : (
              <input value={hiredAtName} onChange={(e) => setHiredAtName(e.target.value)}
                placeholder="Full name (exact match)" className={INPUT_CLASS} />
            )}
          </div>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Hire Date</label>
            <input type="date" value={hiredAtDate} onChange={(e) => setHiredAtDate(e.target.value)} className={INPUT_CLASS} />
          </div>
          <div className="flex items-end">
            <button type="button" onClick={() => void handleSetHiredAt()}
              disabled={settingHiredAt || !hiredAtName.trim() || !hiredAtDate}
              className={`${PRIMARY_BUTTON} flex items-center gap-2`}>
              <UserCheck className="h-4 w-4" />
              {settingHiredAt ? "Saving…" : "Set Hire Date"}
            </button>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-700/40 bg-emerald-900/15 px-4 py-3 text-sm text-emerald-300">
          ✓ {successMsg}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className={`${GLASS_CARD} p-4 text-center`}>
          <div className="text-2xl font-bold text-amber-300">{active.length}</div>
          <div className="text-xs text-zinc-500 mt-1">In Probation</div>
        </div>
        <div className={`${GLASS_CARD} p-4 text-center`}>
          <div className="text-2xl font-bold text-emerald-300">{graduated.length}</div>
          <div className="text-xs text-zinc-500 mt-1">Graduated</div>
        </div>
        <div className={`${GLASS_CARD} p-4 text-center`}>
          <div className={`text-2xl font-bold ${terminated.length > 0 ? "text-red-400" : "text-zinc-500"}`}>{terminated.length}</div>
          <div className="text-xs text-zinc-500 mt-1">Termination Risk</div>
        </div>
      </div>

      {/* Employee list */}
      {loading && !employees.length ? (
        <div className={`${GLASS_CARD} p-10 flex items-center justify-center gap-3 text-zinc-500`}>
          <RefreshCw className="h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : !employees.length ? (
        <div className={`${GLASS_CARD} p-10 text-center text-sm text-zinc-500`}>
          No new employees in probation. Set hire dates above to start tracking.
        </div>
      ) : (
        <div className="space-y-3">
          {employees.map((emp) => {
            const isEditing = editingName === emp.staff_name;
            return (
              <div key={emp.staff_name} className={[
                "rounded-2xl border p-4",
                emp.termination_flagged ? "border-red-500/40 bg-red-950/15" :
                emp.graduated ? "border-emerald-500/30 bg-emerald-950/10" :
                "border-white/8 bg-white/4",
              ].join(" ")}>
                {isEditing && editDraft ? (
                  /* ── Edit mode ── */
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">{emp.staff_name}</span>
                      <button type="button" onClick={cancelEdit} className="text-zinc-500 hover:text-zinc-300">
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <div>
                        <label className={`${T_LABEL} mb-1 block`}>Hire Date</label>
                        <input type="date" value={editDraft.hired_at}
                          onChange={(e) => setEditDraft({ ...editDraft, hired_at: e.target.value })}
                          className={INPUT_CLASS} />
                      </div>
                      {emp.cycle_number !== null && (
                        <>
                          <div>
                            <label className={`${T_LABEL} mb-1 block`}>Cycle Start</label>
                            <input type="date" value={editDraft.cycle_start_date}
                              onChange={(e) => setEditDraft({ ...editDraft, cycle_start_date: e.target.value })}
                              className={INPUT_CLASS} />
                          </div>
                          <div>
                            <label className={`${T_LABEL} mb-1 block`}>Cycle End</label>
                            <input type="date" value={editDraft.cycle_end_date}
                              onChange={(e) => setEditDraft({ ...editDraft, cycle_end_date: e.target.value })}
                              className={INPUT_CLASS} />
                          </div>
                          <div>
                            <label className={`${T_LABEL} mb-1 block`}>Cycle Status</label>
                            <SelectDark
                              value={editDraft.cycle_status}
                              onChange={(v) => setEditDraft({ ...editDraft, cycle_status: v })}
                              className={INPUT_CLASS + " cursor-pointer"}
                              options={[
                                { value: "IN_PROGRESS", label: "IN_PROGRESS" },
                                { value: "PASSED", label: "PASSED" },
                                { value: "FAILED", label: "FAILED" },
                              ]}
                            />
                          </div>
                        </>
                      )}
                    </div>

                    {emp.cycle_number !== null && (
                      <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input type="checkbox" checked={editDraft.graduated}
                            onChange={(e) => setEditDraft({ ...editDraft, graduated: e.target.checked })}
                            className="h-4 w-4 rounded border-white/20 bg-white/10 accent-emerald-500" />
                          <span className="text-sm text-zinc-300">Graduated</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input type="checkbox" checked={editDraft.bonus_awarded}
                            onChange={(e) => setEditDraft({ ...editDraft, bonus_awarded: e.target.checked })}
                            className="h-4 w-4 rounded border-white/20 bg-white/10 accent-emerald-500" />
                          <span className="text-sm text-zinc-300">Bonus Awarded (PHP 2,000)</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input type="checkbox" checked={editDraft.termination_flagged}
                            onChange={(e) => setEditDraft({ ...editDraft, termination_flagged: e.target.checked })}
                            className="h-4 w-4 rounded border-white/20 bg-white/10 accent-red-500" />
                          <span className="text-sm text-zinc-300">Termination Risk Flag</span>
                        </label>
                      </div>
                    )}

                    {emp.cycle_number !== null && editDraft.termination_flagged && (
                      <div>
                        <label className={`${T_LABEL} mb-1 block`}>Termination Reason</label>
                        <input value={editDraft.termination_reason}
                          onChange={(e) => setEditDraft({ ...editDraft, termination_reason: e.target.value })}
                          placeholder="Reason for termination flag…"
                          className={INPUT_CLASS} />
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button type="button" onClick={() => void handleSave(emp)} disabled={saving}
                        className={`${PRIMARY_BUTTON} flex items-center gap-1.5`}>
                        <Check className="h-3.5 w-3.5" />
                        {saving ? "Saving…" : "Save Changes"}
                      </button>
                      <button type="button" onClick={cancelEdit}
                        className={`${SECONDARY_BUTTON} flex items-center gap-1.5`}>
                        <X className="h-3.5 w-3.5" /> Cancel
                      </button>
                      <div className="ml-auto">
                        {deleteConfirm === emp.staff_name ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-red-400">Remove from probation tracking?</span>
                            <button type="button" onClick={() => void handleDelete(emp)} disabled={saving}
                              className="rounded-lg border border-red-600/50 bg-red-900/30 px-2 py-1 text-xs text-red-300 hover:bg-red-900/50">
                              Confirm Remove
                            </button>
                            <button type="button" onClick={() => setDeleteConfirm(null)}
                              className="text-xs text-zinc-500 hover:text-zinc-300">Cancel</button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setDeleteConfirm(emp.staff_name)}
                            className="flex items-center gap-1 rounded-lg border border-red-700/30 bg-red-950/20 px-2 py-1 text-xs text-red-400 hover:bg-red-950/40">
                            <Trash2 className="h-3 w-3" /> Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── View mode ── */
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-semibold text-white">{emp.staff_name}</span>
                        {statusBadge(emp)}
                      </div>
                      <div className="text-xs text-zinc-500 mb-2">
                        Hired: {emp.hired_at ? String(emp.hired_at).slice(0, 10) : "—"}
                        {emp.cycle_number ? ` · Cycle #${emp.cycle_number}` : ""}
                        {emp.cycle_start_date ? ` · ${String(emp.cycle_start_date).slice(0, 10)} → ${String(emp.cycle_end_date || "").slice(0, 10)}` : ""}
                      </div>
                      <div className="flex gap-4">
                        <div className="text-center">
                          <div className={`text-xl font-bold ${emp.absent_count >= 2 ? "text-red-400" : "text-white"}`}>
                            {emp.absent_count}
                          </div>
                          <div className="text-[10px] text-zinc-500">Absences</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xl font-bold text-white">{emp.late_count}</div>
                          <div className="text-[10px] text-zinc-500">Late/Early</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xl font-bold text-white">
                            {Math.round(emp.total_late_minutes / 60 * 10) / 10}h
                          </div>
                          <div className="text-[10px] text-zinc-500">Late Total</div>
                        </div>
                      </div>
                      {emp.termination_reason && (
                        <p className="mt-2 text-xs text-red-400">⛔ {emp.termination_reason}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {emp.bonus_awarded && (
                        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-3 py-1.5 text-xs text-emerald-300">
                          PHP 2,000 ✓ awarded
                        </div>
                      )}
                      <button type="button" onClick={() => startEdit(emp)}
                        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-zinc-400 hover:bg-white/10 hover:text-zinc-200 transition-colors">
                        <Pencil className="h-3 w-3" /> Edit
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
