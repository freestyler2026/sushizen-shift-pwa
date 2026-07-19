"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAuth, refreshAuthFromApi } from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import {
  GLASS_CARD, PRIMARY_BUTTON, SECONDARY_BUTTON, INPUT_CLASS,
  T_PAGE_TITLE, T_LABEL, BADGE_ERROR, BADGE_WARNING, BADGE_SUCCESS, BADGE_INFO,
} from "@/lib/ui-tokens";
import { RefreshCw, AlertCircle, UserCheck, Calendar } from "lucide-react";

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

const ADMIN_ROLES = new Set(["ADMIN", "HQ", "HR_MANAGER", "MANILA_MANAGEMENT", "MANILA_MANAGER"]);

function statusBadge(emp: ProbationEmployee) {
  if (emp.termination_flagged) return <span className={BADGE_ERROR}>⛔ Termination Risk</span>;
  if (emp.graduated) return <span className={BADGE_SUCCESS}>✓ Graduated</span>;
  if (emp.cycle_status === "PASSED") return <span className={BADGE_SUCCESS}>✓ Passed</span>;
  if (emp.cycle_status === "FAILED") return <span className={BADGE_WARNING}>↩ Failed — retry</span>;
  if (emp.cycle_status === "IN_PROGRESS") return <span className={BADGE_INFO}>In Progress</span>;
  return <span className={BADGE_INFO}>No cycle yet</span>;
}

export default function ProbationPage() {
  const auth = useMemo(() => getAuth(), []);
  const [allowed, setAllowed] = useState(false);
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

  useEffect(() => {
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      const resolved = refreshed || auth;
      setAllowed(ADMIN_ROLES.has(String(resolved?.role || "").toUpperCase()));
      setCity(String(resolved?.city || "manila").toLowerCase() === "dubai" ? "dubai" : "manila");
    }
    void init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (!auth?.accessToken) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/probation/summary?city=${encodeURIComponent(city)}`, {
        headers: { Authorization: `Bearer ${auth.accessToken}` },
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
    if (!auth?.accessToken) return;
    fetch(`/api/admin/staff_master/names?city=${city}&status=ACTIVE&limit=5000`, {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    })
      .then((r) => r.json())
      .then((d) => setStaffNames(Array.isArray(d?.names) ? d.names : []))
      .catch(() => {});
  }, [auth, city]);

  const handleSetHiredAt = async () => {
    if (!auth?.accessToken || !hiredAtName.trim() || !hiredAtDate.trim()) return;
    setSettingHiredAt(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/probation/set-hired-at`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.accessToken}` },
        body: JSON.stringify({ staff_name: hiredAtName.trim(), hired_at: hiredAtDate }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.detail || `HTTP ${res.status}`);
      }
      setSuccessMsg(`✓ Hire date set for ${hiredAtName.trim()}`);
      setHiredAtName("");
      setHiredAtDate("");
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSettingHiredAt(false);
    }
  };

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
              <select value={hiredAtName} onChange={(e) => setHiredAtName(e.target.value)}
                className={INPUT_CLASS + " cursor-pointer"}>
                <option value="">— Select active staff —</option>
                {staffNames.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
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
          {employees.map((emp) => (
            <div key={emp.staff_name} className={[
              "rounded-2xl border p-4",
              emp.termination_flagged ? "border-red-500/40 bg-red-950/15" :
              emp.graduated ? "border-emerald-500/30 bg-emerald-950/10" :
              "border-white/8 bg-white/4",
            ].join(" ")}>
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
                  {/* Violation counts */}
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
                {emp.bonus_awarded && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-3 py-1.5 text-xs text-emerald-300">
                    PHP 2,000 ✓ awarded
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
