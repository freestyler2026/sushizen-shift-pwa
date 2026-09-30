"use client";

import SelectDark from "@/components/SelectDark";
import {
  AlertCircle, Calculator, CheckCircle2, ClipboardList, Database,
  Loader2, RefreshCw, Trash2, Users, Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getAuth, canAccessPayrollAdmin } from "@/lib/auth";
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
  // The days this cycle actually pays for. Dubai runs 26th-to-25th, so the
  // month in the name is a label. Null means the calendar month.
  period_start: string | null;
  period_end: string | null;
  // September 2026 pays the hourly staff for a different span, because
  // August ended on the 25th for monthly staff and the 31st for hourly.
  // Null means they share the window above.
  hourly_period_start: string | null;
  hourly_period_end: string | null;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

/** The first and last day a cycle pays for; the calendar month when unset. */
function cycleWindow(c: PayrollCycle, hourly = false): [string, string] {
  if (hourly && c.hourly_period_start && c.hourly_period_end) {
    return [c.hourly_period_start, c.hourly_period_end];
  }
  if (c.period_start && c.period_end) return [c.period_start, c.period_end];
  const lastDay = new Date(c.year, c.month, 0).getDate();
  return [`${c.year}-${pad2(c.month)}-01`, `${c.year}-${pad2(c.month)}-${pad2(lastDay)}`];
}

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
  date_range?: string;
  message?: string;
  grace_waived_count?: number;
  grace_window?: string;
  grace_waived?: { staff_name: string; work_date: string; subtype: string }[];
};

/** Somebody on this cycle's payroll who joined after it started and still
 *  carries the whole package. The engine does not produce basic pay, so the
 *  deduction only exists if a person enters it, and nothing used to say when
 *  one was missing — it was caught by eye, twice, the second time with
 *  AED 4,278.71 about to go out. */
type ProrationGap = {
  staff_name: string;
  branch_code: string;
  hired_at: string;
  period_start: string;
  period_end: string;
  period_days: number;
  employed_days: number;
  unworked_days: number;
  pay_basis: string;
  base_amount: number | null;
  suggested_deduction: number | null;
  net_pay_now: number | null;
  already_prorated: boolean;
};

type ProrationGaps = {
  ok: boolean;
  examined: number;
  rows: ProrationGap[];
  total_suggested: number | null;
  already_prorated_count: number;
  no_hire_date: string[];
  population: string;
  leavers_note: string;
  unavailable?: string;
};

type StaffGroup = "all" | "parttime";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function DubaiPayrollPage() {
  const router = useRouter();

  useEffect(() => {
    const auth = getAuth();
    if (!auth || !canAccessPayrollAdmin(auth)) router.replace("/week");
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
  const [gaps, setGaps] = useState<Record<number, ProrationGaps>>({});

  // Date range & staff group per cycle
  const [showRangeId, setShowRangeId]     = useState<number | null>(null);
  const [rangeFrom, setRangeFrom]         = useState<Record<number, string>>({});
  const [rangeTo, setRangeTo]             = useState<Record<number, string>>({});
  const [staffGroup, setStaffGroup]       = useState<Record<number, StaffGroup>>({});

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
      const list = d.cycles ?? [];
      setCycles(list);

      // Loaded here rather than behind the Calculate button. A check that only
      // runs when somebody presses something is a check for people who already
      // suspected there was a problem, and those are not the months it is for.
      // Closed cycles are left alone: they have been paid, so a finding there
      // is a report, not an action, and it would sit on the screen forever.
      const open = list.filter(c => String(c.status).toLowerCase() !== "closed");
      const found = await Promise.all(open.map(async c => {
        try {
          const g = await apiFetch(`${API}/proration-gaps?cycle_id=${c.id}`);
          if (!g.ok) return null;
          return [c.id, await g.json() as ProrationGaps] as const;
        } catch { return null; }
      }));
      setGaps(Object.fromEntries(found.filter(Boolean) as (readonly [number, ProrationGaps])[]));
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
      // No year/month: the server knows Dubai's cycle runs 26th-to-25th, so
      // on the 26th it opens the NEXT month's cycle. Sending the browser's
      // calendar month re-opened the cycle that had just stopped paying —
      // and those six days are exactly when the new cycle must be created.
      const r = await apiFetch(`${PAY_API}/cycles?city=dubai`, { method: "POST" });
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
    const useRange = showRangeId === cycle.id;
    const df = rangeFrom[cycle.id] || null;
    const dt = rangeTo[cycle.id] || null;
    const group = staffGroup[cycle.id] ?? "all";
    const body: Record<string, unknown> = { cycle_id: cycle.id, year: cycle.year, month: cycle.month };
    if (useRange && df && dt) { body.date_from = df; body.date_to = dt; }
    // Who is paid by the hour is a property of the salary config. Sending a
    // list from here meant maintaining it here, and the list had two people
    // who had left and was missing one who had joined.
    if (group === "parttime") body.staff_group = "parttime";
    try {
      const r = await apiFetch(`${API}/auto-adjustments`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json() as CalcResult;
      setClearResults(prev => { const n = { ...prev }; delete n[cycle.id]; return n; });
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
            <Link href="/admin/payroll/dubai/end-of-service"
              className="flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-600/10 px-4 py-2 text-sm text-violet-300 hover:bg-violet-600/20 transition-colors">
              🏁 End of Service &amp; Leave
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
              {/* What the joining-date check cannot see, said once. It used to
                  be repeated on every cycle card, which is the same sentence
                  three times for one fact and teaches people to skip it. */}
              {(() => {
                // Not Object.values(...)[0]: the keys are cycle ids, and JS
                // orders integer-like keys numerically, so the first value was
                // cycle #1 — the one with no period, whose result is
                // "nothing to measure against". The note never appeared.
                const any = Object.values(gaps).find(g => g && !g.unavailable);
                if (!any) return null;
                // Nothing here assumes a field arrived. A response that is
                // missing one used to throw inside render, and a throw in
                // render takes the whole Dubai Payroll page down — cycles,
                // Auto-Calculate and all — over a footnote. The frontend also
                // ships separately from the API, so it will meet an older
                // response eventually.
                const noDate = any.no_hire_date ?? [];
                return (
                  <p className="mt-1 text-xs text-slate-500">
                    {any.leavers_note}
                    {noDate.length > 0 && (
                      <> {noDate.length} people have no joining date on record and
                        are never checked ({noDate.join(", ")}).</>
                    )}
                  </p>
                );
              })()}
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
                // Same reason as the footnote above: never index into a
                // field the response might not carry.
                const raw = gaps[c.id];
                const gap = raw ? { ...raw, rows: raw.rows ?? [] } : undefined;
                const money = (v: number | null) =>
                  v === null || v === undefined
                    ? "—"   // masked for this reader, not zero
                    : v.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
                        {/* The month is only a name. Say which days are paid,
                            or nobody can check the figures against the DTR.
                            Cycles opened before 2026-09-24 recorded no period,
                            and the cycles closed by then were not all one span
                            (August paid the monthly staff to 08-25 and the
                            hourly staff to 08-31), so say "not recorded"
                            rather than assert a range that was never true. */}
                        <div className="mt-1 text-xs text-slate-400">
                          {c.period_start && c.period_end ? (
                            <>
                              Pays for {c.period_start} &ndash; {c.period_end}
                              {c.hourly_period_start && c.hourly_period_end && (
                                <span className="ml-2 text-amber-300">
                                  &middot; hourly staff {c.hourly_period_start} &ndash; {c.hourly_period_end}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-slate-500">
                              Period not recorded &mdash; check the DTR dates before using these figures
                            </span>
                          )}
                        </div>
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
                          onClick={() => {
                            setShowRangeId(prev => prev === c.id ? null : c.id);
                            // Default to the days the cycle pays for, not the
                            // calendar month — for Dubai they are not the same.
                            if (showRangeId !== c.id) {
                              const [wFrom, wTo] = cycleWindow(c);
                              setRangeFrom(prev => ({ ...prev, [c.id]: prev[c.id] ?? wFrom }));
                              setRangeTo(prev => ({ ...prev, [c.id]: prev[c.id] ?? wTo }));
                            }
                          }}
                          className="flex items-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-900/20 px-3 py-1.5 text-xs text-sky-300 hover:bg-sky-900/40 disabled:opacity-40 transition-colors"
                          title="Configure and run auto-calculation"
                        >
                          <Calculator size={12} />
                          Auto-Calculate
                        </button>
                      </div>
                    </div>

                    {/* Date range / staff group panel */}
                    {showRangeId === c.id && (
                      <div className="rounded-xl border border-sky-500/20 bg-sky-900/10 p-4 space-y-3">
                        <div className="flex flex-wrap items-end gap-3">
                          <div>
                            <label className="mb-1 block text-xs text-slate-400">Date From</label>
                            <input type="date" value={rangeFrom[c.id] ?? ""} onChange={e => setRangeFrom(prev => ({ ...prev, [c.id]: e.target.value }))}
                              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white focus:border-sky-400 focus:outline-none" />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-slate-400">Date To</label>
                            <input type="date" value={rangeTo[c.id] ?? ""} onChange={e => setRangeTo(prev => ({ ...prev, [c.id]: e.target.value }))}
                              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white focus:border-sky-400 focus:outline-none" />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-slate-400">Staff Group</label>
                            <SelectDark
                              className="rounded-lg border border-white/10 bg-slate-800 px-2.5 py-1.5 text-xs text-white focus:border-sky-400 focus:outline-none"
                              value={staffGroup[c.id] ?? "all"}
                              onChange={(v) => setStaffGroup(prev => ({ ...prev, [c.id]: v as StaffGroup }))}
                              options={[
                                { value: "all", label: "All Staff" },
                                { value: "parttime", label: "Part-time Staff only (8 names)" },
                              ]}
                            />
                          </div>
                          <button
                            onClick={() => handleAutoCalculate(c)}
                            disabled={isCalcing}
                            className="flex items-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-700/40 px-3 py-1.5 text-xs text-sky-200 hover:bg-sky-700/60 disabled:opacity-40 transition-colors font-medium"
                          >
                            {isCalcing ? <Loader2 size={12} className="animate-spin" /> : <Calculator size={12} />}
                            {isCalcing ? "Calculating…" : "Run"}
                          </button>
                        </div>
                        <p className="text-xs text-slate-500">
                          Leave the dates empty to recalculate the days this cycle pays for
                          {c.period_start && c.period_end
                            ? <> (<span className="text-slate-300 font-mono">{c.period_start} → {c.period_end}</span>)</>
                            : null}.
                          A narrower range replaces only the days inside it and leaves the rest
                          of the cycle alone.
                        </p>
                      </div>
                    )}

                    {/* Joined mid-cycle, still on a full package.
                        Above the calculate controls on purpose: this is the
                        one thing on the card that money is about to go out
                        over, and it is not something Run fixes — Run writes
                        attendance lines only. */}
                    {gap && gap.rows.length > 0 && (
                      <div className="rounded-xl border border-amber-500/40 bg-amber-900/15 p-3">
                        <div className="flex items-center gap-2">
                          <AlertCircle size={13} className="text-amber-400 flex-shrink-0" />
                          <span className="text-xs font-semibold text-amber-200">
                            {gap.rows.length === 1
                              ? "1 person is being paid for days before they joined"
                              : `${gap.rows.length} people are being paid for days before they joined`}
                          </span>
                          <span className="ml-auto text-xs text-amber-300 font-mono">
                            AED {money(gap.total_suggested)}
                          </span>
                        </div>
                        <div className="mt-2 space-y-1.5">
                          {gap.rows.map(g => (
                            <div key={g.staff_name} className="text-xs text-slate-300 flex flex-wrap items-baseline gap-x-2">
                              <span className="font-medium text-white">{g.staff_name}</span>
                              {g.branch_code && <span className="text-slate-500">{g.branch_code}</span>}
                              <span className="text-slate-400">
                                joined {g.hired_at} &middot; employed {g.employed_days} of {g.period_days} days
                              </span>
                              <span className="ml-auto font-mono text-amber-300">
                                &minus;{money(g.suggested_deduction)}
                              </span>
                              <span className="basis-full text-slate-500">
                                {g.pay_basis} AED {money(g.base_amount)} &times; {g.unworked_days}/{g.period_days}
                                {g.net_pay_now !== null && <> &middot; currently paying AED {money(g.net_pay_now)}</>}
                              </span>
                            </div>
                          ))}
                        </div>
                        {/* What to do, on the card. The deduction is not
                            written automatically: a package can look wrong for
                            reasons a hire date cannot see, and this figure is
                            money coming off somebody's pay. */}
                        <p className="mt-2 text-xs text-slate-400">
                          Add these as <span className="text-slate-200">partial_month</span> deductions
                          in Adjustments before paying. Nothing here has been written.
                        </p>
                      </div>
                    )}
                    {gap && gap.rows.length === 0 && (
                      <div className="text-xs text-slate-500 flex items-center gap-1.5">
                        <CheckCircle2 size={12} className="text-slate-600" />
                        {gap.unavailable
                          ? gap.unavailable
                          : <>Joining dates checked for {gap.examined} on this payroll
                              {gap.already_prorated_count > 0 &&
                                <> &middot; {gap.already_prorated_count} already prorated</>}.</>}
                      </div>
                    )}

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
                          {res.date_range && (
                            <span className="ml-auto text-xs text-slate-500 font-mono">{res.date_range}</span>
                          )}
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
                        {!!res.grace_waived_count && res.grace_waived_count > 0 && (
                          <div className="mt-2 rounded-lg border border-sky-500/25 bg-sky-900/15 p-2.5">
                            <div className="text-xs font-semibold text-sky-300">
                              {res.grace_waived_count} punch {res.grace_waived_count === 1 ? "penalty" : "penalties"} waived — go-live grace
                              {res.grace_window && (
                                <span className="ml-1.5 font-mono font-normal text-slate-400">{res.grace_window}</span>
                              )}
                            </div>
                            {/* Listed by name. A penalty that quietly fails to appear is
                                indistinguishable from one the engine forgot to compute. */}
                            <div className="mt-1.5 max-h-32 overflow-y-auto text-xs text-slate-400">
                              {(res.grace_waived ?? []).map((w, i) => (
                                <div key={i} className="tabular-nums">
                                  {w.work_date} · {w.staff_name} · {w.subtype.replace(/_/g, " ")}
                                </div>
                              ))}
                            </div>
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
