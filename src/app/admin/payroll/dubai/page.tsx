"use client";

import {
  AlertCircle, Calculator, CheckCircle2, ClipboardList, Database,
  Loader2, RefreshCw, Trash2, Users, Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getAuth } from "@/lib/auth";
import { GLASS_CARD, PRIMARY_BUTTON } from "@/lib/ui-tokens";

const API      = "/api/admin/dubai-payroll";
const PAY_API  = "/api/admin/payroll";

function apiFetch(path: string, opts?: RequestInit) {
  const auth = getAuth();
  const method = (opts?.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {};
  if (method !== "GET") headers["Content-Type"] = "application/json";
  if (auth?.accessToken) headers["Authorization"] = `Bearer ${auth.accessToken}`;
  return fetch(path, { ...opts, headers: { ...headers, ...(opts?.headers as Record<string, string> ?? {}) } });
}

type Period = {
  id: number;
  period_label: string;
  period_half: number;
  year: number;
  month: number;
  start_date: string;
  end_date: string;
  status: string;
};

type PayrollCycle = {
  id: number;
  city: string;
  year: number;
  month: number;
  status: string;
  closed_at: string | null;
  created_at: string;
};

type CalcResult = {
  ok: boolean;
  adjustments_inserted: number;
  staff_processed: number;
  night_premium_count: number;
  late_deduction_count: number;
  late_surcharge_count: number;
  absent_deduction_count: number;
  undertime_deduction_count: number;
  missing_punch_count: number;
  break_excess_count: number;
  monthly_late_penalty_count: number;
  message?: string;
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function DubaiPayrollPage() {
  const router = useRouter();

  useEffect(() => {
    const auth = getAuth();
    const role = auth?.role ?? "";
    if (!auth || (role !== "ADMIN" && role !== "HQ")) router.replace("/week");
  }, [router]);

  const [periods, setPeriods]     = useState<Period[]>([]);
  const [loading, setLoading]     = useState(true);
  const [err, setErr]             = useState("");
  const [creating, setCreating]   = useState(false);

  // New period form
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const [newStart, setNewStart]   = useState(todayStr);
  const [newEnd, setNewEnd]       = useState(todayStr);
  const [newLabel, setNewLabel]   = useState("");
  const [showCreate, setShowCreate] = useState(false);

  // Payroll cycles state
  const [cycles, setCycles]           = useState<PayrollCycle[]>([]);
  const [cyclesLoading, setCyclesLoading] = useState(true);
  const [cycleErr, setCycleErr]       = useState("");
  const [calcLoading, setCalcLoading] = useState<number | null>(null);
  const [calcResults, setCalcResults] = useState<Record<number, CalcResult>>({});
  const [creatingCycle, setCreatingCycle] = useState(false);
  const [clearLoading, setClearLoading] = useState<number | null>(null);
  const [clearResults, setClearResults] = useState<Record<number, number>>({});
  const [confirmClearId, setConfirmClearId] = useState<number | null>(null);

  const loadPeriods = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await apiFetch(`${API}/periods`);
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json() as { periods: Period[] };
      setPeriods(d.periods ?? []);
    } catch (e) { setErr(String(e)); }
    finally { setLoading(false); }
  }, []);

  const loadCycles = useCallback(async () => {
    setCyclesLoading(true); setCycleErr("");
    try {
      const r = await apiFetch(`${PAY_API}/cycles?city=dubai`);
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json() as { cycles: PayrollCycle[] };
      setCycles(d.cycles ?? []);
    } catch (e) { setCycleErr(String(e)); }
    finally { setCyclesLoading(false); }
  }, []);

  useEffect(() => { void loadPeriods(); void loadCycles(); }, [loadPeriods, loadCycles]);

  async function handleCreate() {
    if (!newStart || !newEnd) { setErr("Please select both start and end dates"); return; }
    if (newStart > newEnd)   { setErr("Start date must be before end date"); return; }
    setCreating(true); setErr("");
    try {
      const [yr, mo] = newStart.split("-").map(Number);
      const autoLabel = newLabel.trim() ||
        `${MONTHS[mo - 1]} ${yr} (${newStart.slice(8)} – ${newEnd.slice(8)})`;
      const r = await apiFetch(`${API}/periods`, {
        method: "POST",
        body: JSON.stringify({
          period_label: autoLabel,
          period_half: 0,
          year: yr, month: mo,
          start_date: newStart,
          end_date: newEnd,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      setShowCreate(false);
      setNewLabel("");
      await loadPeriods();
    } catch (e) { setErr(String(e)); }
    finally { setCreating(false); }
  }

  async function handleGetOrCreateCycle() {
    setCreatingCycle(true); setCycleErr("");
    try {
      const r = await apiFetch(
        `${PAY_API}/cycles?city=dubai&year=${now.getFullYear()}&month=${now.getMonth() + 1}`,
        { method: "POST" },
      );
      if (!r.ok) throw new Error(await r.text());
      await loadCycles();
    } catch (e) { setCycleErr(String(e)); }
    finally { setCreatingCycle(false); }
  }

  async function handleClearAutoCalc(cycle: PayrollCycle) {
    setClearLoading(cycle.id); setCycleErr(""); setConfirmClearId(null);
    try {
      const r = await apiFetch(`${API}/auto-adjustments/${cycle.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json() as { ok: boolean; deleted_count: number };
      setClearResults(prev => ({ ...prev, [cycle.id]: data.deleted_count }));
      setCalcResults(prev => { const n = { ...prev }; delete n[cycle.id]; return n; });
    } catch (e) { setCycleErr(String(e)); }
    finally { setClearLoading(null); }
  }

  async function handleAutoCalculate(cycle: PayrollCycle) {
    setCalcLoading(cycle.id); setCycleErr("");
    try {
      const r = await apiFetch(`${API}/auto-adjustments`, {
        method: "POST",
        body: JSON.stringify({ cycle_id: cycle.id, year: cycle.year, month: cycle.month }),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json() as CalcResult;
      setCalcResults(prev => ({ ...prev, [cycle.id]: data }));
    } catch (e) { setCycleErr(String(e)); }
    finally { setCalcLoading(null); }
  }

  const periodStatusColor = (s: string) =>
    s === "paid"     ? "bg-emerald-900/30 text-emerald-300" :
    s === "approved" ? "bg-blue-900/30 text-blue-300" :
    "bg-zinc-800 text-zinc-400";

  const cycleStatusColor = (s: string) =>
    s === "closed" ? "bg-zinc-700/50 text-zinc-400" : "bg-sky-900/30 text-sky-300";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="mx-auto max-w-4xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Link href="/admin/payroll" className="text-sm text-slate-400 hover:text-slate-200">
              &larr; Payroll
            </Link>
            <h1 className="mt-2 text-3xl font-light tracking-tight text-white flex items-center gap-3">
              <span className="text-2xl">🇦🇪</span>
              Dubai Payroll
            </h1>
            <p className="mt-1 text-sm text-slate-400">Manage Dubai staff attendance, penalties, and payroll cycles</p>
          </div>

          <div className="flex flex-col gap-2">
            <Link href="/admin/payroll/dubai/dtr-upload"
              className={PRIMARY_BUTTON + " flex items-center gap-2 text-sm"}>
              <ClipboardList size={15} />
              DTR Sync / Upload
            </Link>
            <button onClick={() => setShowCreate(v => !v)}
              className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10 transition-colors">
              <Database size={14} />
              New Period
            </button>
          </div>
        </div>

        {err && (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-900/20 p-4 text-sm text-red-300">
            <AlertCircle size={15} /> {err}
          </div>
        )}

        {/* Create period form */}
        {showCreate && (
          <div className={GLASS_CARD + " p-5 space-y-4"}>
            <h3 className="text-sm font-semibold text-white">Create Payroll Period</h3>
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="mb-1 block text-xs text-slate-400">Start Date</label>
                <input type="date" value={newStart} onChange={e => setNewStart(e.target.value)}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">End Date</label>
                <input type="date" value={newEnd} onChange={e => setNewEnd(e.target.value)}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Label (optional)</label>
                <input type="text" value={newLabel} onChange={e => setNewLabel(e.target.value)}
                  placeholder="Auto-generated if blank"
                  className="w-52 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none" />
              </div>
              <button onClick={handleCreate} disabled={creating}
                className={PRIMARY_BUTTON + " flex items-center gap-2 text-sm disabled:opacity-40"}>
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
            <p className="text-xs text-slate-500">Label is auto-generated from dates if left blank.</p>
          </div>
        )}

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Link href="/admin/payroll/dubai/dtr-upload"
            className={GLASS_CARD + " p-4 hover:border-sky-500/40 transition-colors"}>
            <ClipboardList size={20} className="text-sky-400 mb-2" />
            <div className="text-sm font-medium text-white">DTR Sync</div>
            <div className="text-xs text-slate-400">Sync from OS Attendance or upload CSV</div>
          </Link>
          <div className={GLASS_CARD + " p-4 opacity-50"}>
            <Users size={20} className="text-violet-400 mb-2" />
            <div className="text-sm font-medium text-white">Staff Profiles</div>
            <div className="text-xs text-slate-400">Coming soon</div>
          </div>
          <div className={GLASS_CARD + " p-4"}>
            <Calculator size={20} className="text-emerald-400 mb-2" />
            <div className="text-sm font-medium text-white">Payroll Compute</div>
            <div className="text-xs text-slate-400">Auto-calculate penalties &amp; night premium below</div>
          </div>
        </div>

        {/* Payroll Cycles */}
        <div className={GLASS_CARD + " overflow-hidden"}>
          <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Zap size={15} className="text-emerald-400" />
                Payroll Cycles &amp; Auto-Calculate
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Auto-calculates night premium (22:00–04:00 +10%), late deductions, absent, undertime, missing punch, and break excess from attendance data.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={loadCycles} className="text-slate-400 hover:text-white transition-colors">
                <RefreshCw size={14} className={cyclesLoading ? "animate-spin" : ""} />
              </button>
              <button
                onClick={handleGetOrCreateCycle}
                disabled={creatingCycle}
                className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-900/20 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-900/30 disabled:opacity-40 transition-colors"
              >
                {creatingCycle ? <Loader2 size={12} className="animate-spin" /> : <Database size={12} />}
                {creatingCycle ? "Creating…" : "Get / Create Cycle"}
              </button>
            </div>
          </div>

          {cycleErr && (
            <div className="mx-5 mt-3 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-900/20 p-3 text-xs text-red-300">
              <AlertCircle size={13} /> {cycleErr}
            </div>
          )}

          {cyclesLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={18} className="animate-spin text-slate-400" />
            </div>
          ) : cycles.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              No payroll cycles yet. Click &ldquo;Get / Create Cycle&rdquo; to create the current month&rsquo;s cycle.
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {cycles.map(c => {
                const res = calcResults[c.id];
                const isCalcing = calcLoading === c.id;
                return (
                  <div key={c.id} className="px-5 py-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <span className="text-sm font-medium text-white">
                          {MONTHS[c.month - 1]} {c.year}
                        </span>
                        <span className={`ml-3 rounded-full px-2 py-0.5 text-xs font-medium ${cycleStatusColor(c.status)}`}>
                          {c.status}
                        </span>
                        <span className="ml-2 text-xs text-slate-500">ID #{c.id}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Clear Auto-Calc — two-step confirm */}
                        {confirmClearId === c.id ? (
                          <div className="flex items-center gap-2 rounded-xl border border-orange-500/40 bg-orange-900/20 px-3 py-1.5">
                            <span className="text-xs text-orange-300">Delete auto-calc entries?</span>
                            <button
                              onClick={() => setConfirmClearId(null)}
                              className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleClearAutoCalc(c)}
                              disabled={clearLoading === c.id}
                              className="flex items-center gap-1 rounded-lg bg-orange-600 px-2 py-1 text-xs text-white hover:bg-orange-500 disabled:opacity-40 transition-colors"
                            >
                              {clearLoading === c.id
                                ? <Loader2 size={11} className="animate-spin" />
                                : <Trash2 size={11} />}
                              Delete
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmClearId(c.id)}
                            disabled={clearLoading === c.id}
                            className="flex items-center gap-1.5 rounded-xl border border-orange-500/30 bg-orange-900/20 px-3 py-1.5 text-xs text-orange-300 hover:bg-orange-900/30 disabled:opacity-40 transition-colors"
                            title="Delete all auto-calculated entries for this cycle. Manual entries are preserved."
                          >
                            {clearLoading === c.id
                              ? <Loader2 size={12} className="animate-spin" />
                              : <Trash2 size={12} />}
                            Clear Auto-Calc
                          </button>
                        )}

                        <button
                          onClick={() => handleAutoCalculate(c)}
                          disabled={isCalcing || c.status === "closed"}
                          className="flex items-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-900/20 px-3 py-1.5 text-xs text-sky-300 hover:bg-sky-900/40 disabled:opacity-40 transition-colors"
                          title={c.status === "closed" ? "Cycle is closed" : "Recalculate all attendance-based adjustments for this cycle"}
                        >
                          {isCalcing
                            ? <Loader2 size={12} className="animate-spin" />
                            : <Calculator size={12} />}
                          {isCalcing ? "Calculating…" : "Auto-Calculate"}
                        </button>
                      </div>
                    </div>

                    {/* Clear result */}
                    {clearResults[c.id] !== undefined && !res && (
                      <div className="rounded-xl border border-orange-500/20 bg-orange-900/10 p-3 flex items-center gap-2">
                        <Trash2 size={13} className="text-orange-400 flex-shrink-0" />
                        <span className="text-xs text-orange-300">
                          {clearResults[c.id] === 0
                            ? "No auto-calculated entries found for this cycle."
                            : `${clearResults[c.id]} auto-calculated entries removed. Manual entries preserved.`}
                        </span>
                      </div>
                    )}

                    {/* Calculation result */}
                    {res && (
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-900/10 p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle2 size={13} className="text-emerald-400" />
                          <span className="text-xs font-semibold text-emerald-300">
                            {res.message ?? `${res.adjustments_inserted} adjustments inserted for ${res.staff_processed} staff`}
                          </span>
                        </div>
                        {res.adjustments_inserted > 0 && (
                          <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs text-slate-400">
                            <span>Night premium: <span className="text-emerald-300">{res.night_premium_count}</span></span>
                            <span>Late deductions: <span className="text-amber-300">{res.late_deduction_count}</span></span>
                            <span>Late surcharge: <span className="text-amber-300">{res.late_surcharge_count}</span></span>
                            <span>Absent: <span className="text-red-300">{res.absent_deduction_count}</span></span>
                            <span>Undertime: <span className="text-red-300">{res.undertime_deduction_count}</span></span>
                            <span>Missing punch: <span className="text-red-300">{res.missing_punch_count}</span></span>
                            <span>Break excess: <span className="text-red-300">{res.break_excess_count}</span></span>
                            <span>Monthly late penalty: <span className="text-orange-300">{res.monthly_late_penalty_count}</span></span>
                          </div>
                        )}
                        <p className="mt-2 text-xs text-slate-500">
                          Previous auto-calculated adjustments for this cycle were replaced. View in Payroll &gt; Adjustments.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Attendance Periods list */}
        <div className={GLASS_CARD + " overflow-hidden"}>
          <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Database size={15} className="text-sky-400" />
              Attendance Periods
            </h2>
            <button onClick={loadPeriods} className="text-slate-400 hover:text-white transition-colors">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-slate-400" />
            </div>
          ) : periods.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              No periods yet &mdash; create the first one above.
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {periods.map(p => (
                <div key={p.id} className="flex items-center justify-between px-5 py-3 hover:bg-white/3 transition-colors">
                  <div>
                    <span className="text-sm font-medium text-white">{p.period_label}</span>
                    <span className="ml-3 text-xs text-slate-400 font-mono">{p.start_date} &ndash; {p.end_date}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${periodStatusColor(p.status)}`}>
                      {p.status}
                    </span>
                    <Link href={`/admin/payroll/dubai/dtr-upload?period_id=${p.id}`}
                      className="text-xs text-sky-400 hover:text-sky-200 transition-colors">
                      DTR &rarr;
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
