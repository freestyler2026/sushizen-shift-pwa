"use client";

import {
  AlertCircle, AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown,
  ChevronUp, Clock, Loader2, Play, RefreshCw, X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { getAuth } from "@/lib/auth";
import { GLASS_CARD, PRIMARY_BUTTON } from "@/lib/ui-tokens";

const API = "/api/admin/manila-payroll";

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
  first_half_period_id: number | null;
  status: "draft" | "approved" | "paid";
};

type Run = {
  id: number;
  period_id: number;
  staff_name: string;
  salary_type: string;
  daily_rate: number;
  monthly_rate: number;
  salary_divisor: number;
  days_worked: number;
  gross_pay: number;
  total_deductions: number;
  net_pay: number;
  minimum_wage_compliant: boolean | null;
  status: string;
  computed_at: string | null;
};

type PayrollItem = {
  id: number;
  item_type: "earning" | "deduction" | "employer_cost";
  item_code: string;
  label: string;
  quantity: number | null;
  unit_rate: number | null;
  amount: number;
  is_taxable: boolean;
  source: string;
  note: string | null;
};

const fmtPHP = (v: number) =>
  "₱" + v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_BADGE: Record<string, string> = {
  draft:    "bg-slate-700 text-slate-300",
  computed: "bg-blue-900/60 text-blue-300 border border-blue-500/30",
  approved: "bg-emerald-900/60 text-emerald-300 border border-emerald-500/30",
  paid:     "bg-violet-900/60 text-violet-300 border border-violet-500/30",
};

const ITEM_TYPE_COLOR = {
  earning:       "text-emerald-300",
  deduction:     "text-red-300",
  employer_cost: "text-slate-400",
};

export default function ManilaPayrollPeriodPage() {
  const router   = useRouter();
  const params   = useParams();
  const periodId = Number(params.periodId);

  const [period, setPeriod]     = useState<Period | null>(null);
  const [runs, setRuns]         = useState<Run[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [computing, setComputing] = useState(false);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [items, setItems]       = useState<PayrollItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [sortBy, setSortBy]     = useState<"name"|"net">("name");
  const [sortDir, setSortDir]   = useState<"asc"|"desc">("asc");

  const loadRef = useRef(0);

  const loadPeriod = useCallback(async () => {
    const seq = ++loadRef.current;
    setLoading(true);
    setError("");
    try {
      const [pr, rr] = await Promise.all([
        apiFetch(`${API}/periods`),
        apiFetch(`${API}/periods/${periodId}/runs`),
      ]);
      if (seq !== loadRef.current) return;
      const periods = await pr.json() as Period[];
      const p = periods.find(x => x.id === periodId);
      setPeriod(p ?? null);
      if (!rr.ok) throw new Error(await rr.text());
      setRuns(await rr.json() as Run[]);
    } catch (e) {
      if (seq !== loadRef.current) return;
      setError(String(e));
    } finally {
      if (seq === loadRef.current) setLoading(false);
    }
  }, [periodId]);

  useEffect(() => { void loadPeriod(); }, [loadPeriod]);

  // Auth guard
  useEffect(() => {
    const auth = getAuth();
    const role = auth?.role ?? "";
    if (!auth || (role !== "ADMIN" && role !== "HQ")) {
      router.replace("/week");
    }
  }, [router]);

  // Load items when run selected
  useEffect(() => {
    if (!selectedRun) { setItems([]); return; }
    setItemsLoading(true);
    apiFetch(`${API}/runs/${selectedRun.id}/items`)
      .then(r => r.json())
      .then(d => setItems(d as PayrollItem[]))
      .catch(e => setError(String(e)))
      .finally(() => setItemsLoading(false));
  }, [selectedRun]);

  const computeAll = async () => {
    setComputing(true);
    setError("");
    try {
      const r = await apiFetch(`${API}/periods/${periodId}/compute`, { method: "POST" });
      if (!r.ok) throw new Error(await r.text());
      await loadPeriod();
    } catch (e) {
      setError(String(e));
    } finally {
      setComputing(false);
    }
  };

  const approveRun = async (runId: number) => {
    try {
      const r = await apiFetch(`${API}/runs/${runId}/approve`, { method: "POST" });
      if (!r.ok) throw new Error(await r.text());
      await loadPeriod();
      if (selectedRun?.id === runId) {
        setSelectedRun(prev => prev ? { ...prev, status: "approved" } : null);
      }
    } catch (e) {
      setError(String(e));
    }
  };

  // Sort runs
  const sortedRuns = [...runs].sort((a, b) => {
    let va: string|number = sortBy === "name" ? a.staff_name : a.net_pay;
    let vb: string|number = sortBy === "name" ? b.staff_name : b.net_pay;
    if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(String(vb)) : String(vb).localeCompare(va);
    return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
  });

  const toggleSort = (col: "name"|"net") => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
  };

  // Summary
  const totals = runs.reduce((acc, r) => ({
    gross: acc.gross + r.gross_pay,
    ded:   acc.ded   + r.total_deductions,
    net:   acc.net   + r.net_pay,
  }), { gross: 0, ded: 0, net: 0 });

  const nonCompliant = runs.filter(r => r.minimum_wage_compliant === false);

  // Items grouped
  const earnings       = items.filter(i => i.item_type === "earning"       && i.amount > 0);
  const deductions     = items.filter(i => i.item_type === "deduction");
  const employerCosts  = items.filter(i => i.item_type === "employer_cost");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="flex h-screen overflow-hidden">

        {/* ── Left: period + run list ── */}
        <div className="flex w-[55%] flex-col overflow-hidden border-r border-white/5">
          <div className="flex-none p-5">

            {/* Nav */}
            <Link href="/admin/payroll/manila" className="flex items-center gap-2 text-sm text-slate-400 hover:text-white mb-4">
              <ArrowLeft size={14} /> Back to Periods
            </Link>

            {period && (
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-2xl font-light text-white">{period.period_label}</h1>
                  <p className="text-sm text-slate-400">
                    {period.start_date} → {period.end_date}
                    {period.period_half === 2 && " · Includes statutory deductions"}
                  </p>
                </div>
                <button
                  onClick={computeAll}
                  disabled={computing}
                  className={PRIMARY_BUTTON + " flex items-center gap-2 text-sm"}
                >
                  {computing
                    ? <Loader2 size={14} className="animate-spin" />
                    : <Play size={14} />}
                  Compute All
                </button>
              </div>
            )}

            {/* Summary KPIs */}
            {runs.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-3">
                {[
                  { label: "Total Gross", val: totals.gross, color: "text-white" },
                  { label: "Total Deductions", val: totals.ded, color: "text-red-300" },
                  { label: "Total Net Pay", val: totals.net, color: "text-emerald-300" },
                ].map(k => (
                  <div key={k.label} className={GLASS_CARD + " p-3"}>
                    <p className="text-xs text-slate-500">{k.label}</p>
                    <p className={`mt-1 text-base font-semibold ${k.color}`}>{fmtPHP(k.val)}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Minimum wage warning */}
            {nonCompliant.length > 0 && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-900/20 px-3 py-2 text-xs text-amber-300">
                <AlertTriangle size={14} />
                {nonCompliant.length} staff below minimum wage (₱695/day):{" "}
                {nonCompliant.map(r => r.staff_name).join(", ")}
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="mx-5 mb-3 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-900/20 p-3 text-sm text-red-300">
              <AlertCircle size={14} /> {error}
              <button onClick={() => setError("")} className="ml-auto"><X size={14}/></button>
            </div>
          )}

          {/* Run list */}
          <div className="flex-1 overflow-y-auto px-5 pb-5">
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 size={24} className="animate-spin text-violet-400" />
              </div>
            ) : runs.length === 0 ? (
              <div className={GLASS_CARD + " p-8 text-center"}>
                <p className="text-slate-400 text-sm">No runs yet. Click "Compute All" to generate payroll.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-xs text-slate-500">
                    <th className="py-2 text-left cursor-pointer select-none hover:text-white"
                        onClick={() => toggleSort("name")}>
                      <span className="flex items-center gap-1">
                        Staff {sortBy==="name" && (sortDir==="asc"?<ChevronUp size={12}/>:<ChevronDown size={12}/>)}
                      </span>
                    </th>
                    <th className="py-2 text-right text-xs text-slate-500">Monthly Rate</th>
                    <th className="py-2 text-right text-xs text-slate-500">Gross</th>
                    <th className="py-2 text-right cursor-pointer select-none hover:text-white"
                        onClick={() => toggleSort("net")}>
                      <span className="flex items-center justify-end gap-1">
                        Net Pay {sortBy==="net" && (sortDir==="asc"?<ChevronUp size={12}/>:<ChevronDown size={12}/>)}
                      </span>
                    </th>
                    <th className="py-2 text-center text-xs text-slate-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRuns.map(run => (
                    <tr
                      key={run.id}
                      onClick={() => setSelectedRun(selectedRun?.id === run.id ? null : run)}
                      className={`cursor-pointer border-b border-white/5 hover:bg-white/5 transition-colors ${
                        selectedRun?.id === run.id ? "bg-violet-900/20" : ""
                      }`}
                    >
                      <td className="py-2.5 text-left">
                        <div className="flex items-center gap-2">
                          {run.minimum_wage_compliant === false && (
                            <AlertTriangle size={12} className="text-amber-400 flex-none" />
                          )}
                          <span className="text-white">{run.staff_name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 text-right text-slate-400">{fmtPHP(run.monthly_rate)}</td>
                      <td className="py-2.5 text-right text-slate-300">{fmtPHP(run.gross_pay)}</td>
                      <td className="py-2.5 text-right font-semibold text-emerald-300">{fmtPHP(run.net_pay)}</td>
                      <td className="py-2.5 text-center">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[run.status] ?? STATUS_BADGE.draft}`}>
                          {run.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── Right: payslip side panel ── */}
        <div className="flex w-[45%] flex-col overflow-hidden">
          {!selectedRun ? (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-sm text-slate-500">Select a staff member to view payslip</p>
            </div>
          ) : (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-none border-b border-white/5 p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-white">{selectedRun.staff_name}</h2>
                    <p className="text-xs text-slate-400">
                      Monthly ₱{selectedRun.monthly_rate.toLocaleString()}
                      &nbsp;·&nbsp; Divisor {selectedRun.salary_divisor}
                      &nbsp;·&nbsp; Days worked: {selectedRun.days_worked}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedRun.status === "computed" && (
                      <button
                        onClick={() => approveRun(selectedRun.id)}
                        className="flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-900/30 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-900/50"
                      >
                        <CheckCircle2 size={12} /> Approve
                      </button>
                    )}
                    <button onClick={() => setSelectedRun(null)} className="text-slate-400 hover:text-white">
                      <X size={16} />
                    </button>
                  </div>
                </div>

                {/* Net Pay highlight */}
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className={GLASS_CARD + " p-3"}>
                    <p className="text-xs text-slate-500">Gross Pay</p>
                    <p className="text-sm font-semibold text-white">{fmtPHP(selectedRun.gross_pay)}</p>
                  </div>
                  <div className={GLASS_CARD + " p-3"}>
                    <p className="text-xs text-slate-500">Total Deductions</p>
                    <p className="text-sm font-semibold text-red-300">{fmtPHP(selectedRun.total_deductions)}</p>
                  </div>
                  <div className={GLASS_CARD + " p-3 border-violet-500/20"}>
                    <p className="text-xs text-slate-500">Net Pay</p>
                    <p className="text-base font-bold text-emerald-300">{fmtPHP(selectedRun.net_pay)}</p>
                  </div>
                </div>

                {selectedRun.minimum_wage_compliant === false && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-900/20 px-3 py-2 text-xs text-amber-300">
                    <AlertTriangle size={12} /> Daily rate below NCR minimum wage (₱695/day)
                  </div>
                )}
              </div>

              {/* Items */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {itemsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 size={20} className="animate-spin text-violet-400" />
                  </div>
                ) : (
                  <>
                    {/* Earnings */}
                    {earnings.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Earnings</p>
                        <div className="space-y-1">
                          {earnings.map(item => (
                            <div key={item.id} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-white/5">
                              <div>
                                <p className="text-sm text-slate-200">{item.label}</p>
                                {item.note && (
                                  <p className="text-xs text-slate-500">{item.note}</p>
                                )}
                                {item.quantity != null && item.unit_rate != null && (
                                  <p className="text-xs text-slate-500">
                                    {item.quantity}h × ₱{item.unit_rate.toFixed(2)}
                                  </p>
                                )}
                              </div>
                              <span className="font-medium text-emerald-300">{fmtPHP(item.amount)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Deductions */}
                    {deductions.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Deductions</p>
                        <div className="space-y-1">
                          {deductions.map(item => (
                            <div key={item.id} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-white/5">
                              <div>
                                <p className="text-sm text-slate-200">{item.label}</p>
                                {item.note && <p className="text-xs text-slate-500">{item.note}</p>}
                              </div>
                              <span className="font-medium text-red-300">{fmtPHP(Math.abs(item.amount))}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Employer costs (collapsed by default shown small) */}
                    {employerCosts.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-600">Employer Cost (not deducted)</p>
                        <div className="space-y-1">
                          {employerCosts.map(item => (
                            <div key={item.id} className="flex items-center justify-between rounded-lg px-3 py-1.5 hover:bg-white/5">
                              <p className="text-xs text-slate-500">{item.label}</p>
                              <span className="text-xs text-slate-500">{fmtPHP(item.amount)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {items.length === 0 && (
                      <p className="text-center text-sm text-slate-500 py-8">
                        No line items yet. Run compute first.
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
