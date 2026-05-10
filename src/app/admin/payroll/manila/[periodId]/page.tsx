"use client";

import {
  AlertCircle, AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown,
  ChevronUp, Eye, EyeOff, Loader2, Play, Printer, Send, X,
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
  monthly_rate: number | null;
  salary_divisor: number | null;
  days_worked: number | null;
  gross_pay: number;
  total_deductions: number;
  net_pay: number;
  minimum_wage_compliant: boolean | null;
  status: string;
  computed_at: string | null;
  published_at: string | null;
  published_by: string | null;
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

const fmtPHP = (v: number | null | undefined) =>
  v == null ? "—" : "₱" + v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtPHPAbs = (v: number | null | undefined) =>
  v == null ? "—" : "₱" + Math.abs(v).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_BADGE: Record<string, string> = {
  draft:    "bg-slate-700 text-slate-300",
  computed: "bg-blue-900/60 text-blue-300 border border-blue-500/30",
  approved: "bg-emerald-900/60 text-emerald-300 border border-emerald-500/30",
  paid:     "bg-violet-900/60 text-violet-300 border border-violet-500/30",
};

// ─── Payslip detail (right panel) ────────────────────────────────────────────

function PayslipDetail({
  run,
  items,
  itemsLoading,
  onApprove,
  onPublish,
  onUnpublish,
  onClose,
  period,
}: {
  run: Run;
  items: PayrollItem[];
  itemsLoading: boolean;
  onApprove: (id: number) => void;
  onPublish: (id: number) => void;
  onUnpublish: (id: number) => void;
  onClose: () => void;
  period: Period | null;
}) {
  const earnings      = items.filter(i => i.item_type === "earning"      && i.amount > 0);
  const deductions    = items.filter(i => i.item_type === "deduction");
  const employerCosts = items.filter(i => i.item_type === "employer_cost");

  const earningsTotal   = earnings.reduce((s, i) => s + i.amount, 0);
  const deductionsTotal = deductions.reduce((s, i) => s + Math.abs(i.amount), 0);

  // Computation basis string
  const basisParts: string[] = [];
  if (run.monthly_rate != null && run.salary_divisor != null && run.days_worked != null) {
    basisParts.push(
      `₱${run.monthly_rate.toLocaleString("en-PH")} ÷ ${run.salary_divisor} × ${run.days_worked} day(s) = ₱${((run.monthly_rate / run.salary_divisor) * run.days_worked).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
    );
  } else if (run.daily_rate && run.days_worked != null) {
    basisParts.push(`₱${run.daily_rate.toLocaleString("en-PH")}/day × ${run.days_worked} day(s)`);
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="flex-none border-b border-white/5 p-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">{run.staff_name}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {run.salary_type === "monthly" ? "Monthly" : "Daily"}
              &nbsp;·&nbsp;Monthly Rate: {fmtPHP(run.monthly_rate)}
              &nbsp;·&nbsp;Divisor: {run.salary_divisor ?? "—"}
              &nbsp;·&nbsp;Days Worked: {run.days_worked ?? "—"}
            </p>
            {basisParts.length > 0 && (
              <p className="text-xs text-violet-300/70 mt-1 font-mono">
                Basic Pay: {basisParts.join(" + ")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 ml-2 shrink-0 flex-wrap justify-end">
            {run.status === "computed" && (
              <button
                onClick={() => onApprove(run.id)}
                className="flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-900/30 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-900/50"
              >
                <CheckCircle2 size={12} /> Approve
              </button>
            )}
            {/* Publish / Unpublish */}
            {run.published_at ? (
              <button
                onClick={() => onUnpublish(run.id)}
                className="flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-900/20 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-900/40"
                title="Unpublish"
              >
                <EyeOff size={12} /> Unpublish
              </button>
            ) : (
              <button
                onClick={() => onPublish(run.id)}
                disabled={!["approved","paid","computed"].includes(run.status)}
                className="flex items-center gap-1 rounded-lg border border-violet-500/40 bg-violet-900/30 px-3 py-1.5 text-xs text-violet-200 hover:bg-violet-900/50 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Publish to staff My Pay"
              >
                <Send size={12} /> Publish to Staff
              </button>
            )}
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
              title="Print / Save as PDF"
            >
              <Printer size={12} />
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-white">
              <X size={16} />
            </button>
          </div>
        </div>

        {run.minimum_wage_compliant === false && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-900/20 px-3 py-2 text-xs text-amber-300">
            <AlertTriangle size={12} /> Daily rate is below minimum wage (₱695/day)
          </div>
        )}

        {/* Published badge */}
        {run.published_at && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-900/20 px-3 py-2 text-xs text-emerald-300">
            <Eye size={12} />
            Published to staff — {new Date(run.published_at).toLocaleString("en-US")}
            {run.published_by && <span className="text-emerald-400/60 ml-1">by {run.published_by}</span>}
          </div>
        )}

        {/* ── Formula banner: Gross Pay − Deductions = Net Pay ── */}
        <div className="mt-4 flex items-stretch gap-1 rounded-xl overflow-hidden border border-white/10 text-center">
          {/* Gross */}
          <div className="flex-1 bg-slate-800/80 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Gross Pay</p>
            <p className="text-base font-bold text-white tabular-nums">{fmtPHP(run.gross_pay)}</p>
          </div>
          {/* Minus sign */}
          <div className="flex items-center justify-center bg-slate-900/60 px-2 text-xl font-light text-slate-500 select-none">
            −
          </div>
          {/* Deductions */}
          <div className="flex-1 bg-slate-800/80 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Total Deductions</p>
            <p className="text-base font-bold text-red-300 tabular-nums">{fmtPHPAbs(run.total_deductions)}</p>
          </div>
          {/* Equals sign */}
          <div className="flex items-center justify-center bg-slate-900/60 px-2 text-xl font-light text-slate-500 select-none">
            =
          </div>
          {/* Net pay */}
          <div className="flex-1 bg-gradient-to-br from-violet-900/70 to-purple-900/70 border-l border-violet-500/20 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-300 mb-1">Net Pay</p>
            <p className="text-base font-bold text-emerald-300 tabular-nums">{fmtPHP(run.net_pay)}</p>
          </div>
        </div>
      </div>

      {/* ── Line items ── */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {itemsLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={20} className="animate-spin text-violet-400" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-center text-sm text-slate-500 py-8">
            Not yet computed. Click &quot;Compute All&quot; to generate payroll.
          </p>
        ) : (
          <>
            {/* ── Earnings ── */}
            {earnings.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-400/80">
                    Earnings
                  </p>
                  <span className="text-xs text-slate-500">Subtotal</span>
                </div>
                <div className="rounded-xl border border-white/5 overflow-hidden">
                  {earnings.map((item, idx) => (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between px-4 py-3 ${
                        idx < earnings.length - 1 ? "border-b border-white/5" : ""
                      } hover:bg-white/5`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-200">{item.label}</p>
                        {item.quantity != null && item.unit_rate != null && (
                          <p className="text-xs text-slate-500 mt-0.5">
                            {item.quantity} day(s) × ₱{item.unit_rate.toLocaleString("en-PH", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                          </p>
                        )}
                        {item.note && (
                          <p className="text-xs text-slate-500 mt-0.5">{item.note}</p>
                        )}
                        {item.is_taxable && (
                          <span className="text-[10px] text-slate-600">Taxable</span>
                        )}
                      </div>
                      <span className="ml-4 tabular-nums text-sm font-semibold text-emerald-300">
                        {fmtPHP(item.amount)}
                      </span>
                    </div>
                  ))}
                  {/* Earnings subtotal */}
                  <div className="flex items-center justify-between bg-emerald-900/20 border-t border-emerald-500/20 px-4 py-2.5">
                    <p className="text-xs font-bold text-emerald-400/80 uppercase tracking-wide">Total Earnings</p>
                    <span className="tabular-nums text-sm font-bold text-emerald-300">{fmtPHP(earningsTotal)}</span>
                  </div>
                </div>
              </section>
            )}

            {/* ── Deductions ── */}
            {deductions.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-red-400/80">
                    Deductions
                  </p>
                  <span className="text-xs text-slate-500">Amount Deducted</span>
                </div>
                <div className="rounded-xl border border-white/5 overflow-hidden">
                  {deductions.map((item, idx) => (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between px-4 py-3 ${
                        idx < deductions.length - 1 ? "border-b border-white/5" : ""
                      } hover:bg-white/5`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-200">{item.label}</p>
                        {item.note && (
                          <p className="text-xs text-slate-500 mt-0.5">{item.note}</p>
                        )}
                        {item.source && item.source !== "computed" && (
                          <p className="text-xs text-slate-600 mt-0.5">Source: {item.source}</p>
                        )}
                      </div>
                      <span className="ml-4 tabular-nums text-sm font-semibold text-red-300">
                        ({fmtPHPAbs(item.amount)})
                      </span>
                    </div>
                  ))}
                  {/* Deductions subtotal */}
                  <div className="flex items-center justify-between bg-red-900/20 border-t border-red-500/20 px-4 py-2.5">
                    <p className="text-xs font-bold text-red-400/80 uppercase tracking-wide">Total Deductions</p>
                    <span className="tabular-nums text-sm font-bold text-red-300">({fmtPHP(deductionsTotal)})</span>
                  </div>
                </div>
              </section>
            )}

            {/* ── Net pay recap ── */}
            {(earnings.length > 0 || deductions.length > 0) && (
              <div className="rounded-xl border border-violet-500/30 bg-gradient-to-r from-violet-900/40 to-purple-900/40 px-5 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-violet-300/70 uppercase tracking-wide font-semibold mb-0.5">Net Pay</p>
                    <p className="text-[11px] text-slate-500">
                      {fmtPHP(earningsTotal)} − {fmtPHP(deductionsTotal)}
                    </p>
                  </div>
                  <p className="text-2xl font-black text-emerald-300 tabular-nums">{fmtPHP(run.net_pay)}</p>
                </div>
              </div>
            )}

            {/* ── Employer costs (reference) ── */}
            {employerCosts.length > 0 && (
              <section>
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-600 mb-2">
                  Employer Costs (not deducted from employee — reference only)
                </p>
                <div className="rounded-xl border border-white/5 overflow-hidden">
                  {employerCosts.map((item, idx) => (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between px-4 py-2.5 ${
                        idx < employerCosts.length - 1 ? "border-b border-white/5" : ""
                      } hover:bg-white/5`}
                    >
                      <p className="text-xs text-slate-500">{item.label}</p>
                      <span className="text-xs text-slate-500 tabular-nums">{fmtPHP(item.amount)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between bg-slate-800/60 border-t border-white/5 px-4 py-2">
                    <p className="text-xs text-slate-600 uppercase tracking-wide">Total Employer Costs</p>
                    <span className="text-xs text-slate-500 tabular-nums">
                      {fmtPHP(employerCosts.reduce((s, i) => s + i.amount, 0))}
                    </span>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

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

  const publishRun = async (runId: number) => {
    try {
      const r = await apiFetch(`${API}/runs/${runId}/publish`, { method: "POST" });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json() as { run: Run };
      setRuns(prev => prev.map(ru => ru.id === runId ? { ...ru, published_at: data.run.published_at, published_by: data.run.published_by } : ru));
      if (selectedRun?.id === runId) {
        setSelectedRun(prev => prev ? { ...prev, published_at: data.run.published_at, published_by: data.run.published_by } : null);
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const unpublishRun = async (runId: number) => {
    try {
      const r = await apiFetch(`${API}/runs/${runId}/unpublish`, { method: "POST" });
      if (!r.ok) throw new Error(await r.text());
      setRuns(prev => prev.map(ru => ru.id === runId ? { ...ru, published_at: null, published_by: null } : ru));
      if (selectedRun?.id === runId) {
        setSelectedRun(prev => prev ? { ...prev, published_at: null, published_by: null } : null);
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const publishAll = async () => {
    if (!period) return;
    if (!confirm(`Publish all computed/approved payslips for this period to staff My Pay?`)) return;
    try {
      const r = await apiFetch(`${API.replace("/runs", "")}/periods/${periodId}/publish-all`, { method: "POST" });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json() as { published_count: number };
      await loadPeriod();
      alert(`${data.published_count} payslip(s) published to staff.`);
    } catch (e) {
      setError(String(e));
    }
  };

  // Sort runs
  const sortedRuns = [...runs].sort((a, b) => {
    const va: string|number = sortBy === "name" ? a.staff_name : a.net_pay;
    const vb: string|number = sortBy === "name" ? b.staff_name : b.net_pay;
    if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(String(vb)) : String(vb).localeCompare(va);
    return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
  });

  const toggleSort = (col: "name"|"net") => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
  };

  // Summary totals
  const totals = runs.reduce((acc, r) => ({
    gross: acc.gross + r.gross_pay,
    ded:   acc.ded   + r.total_deductions,
    net:   acc.net   + r.net_pay,
  }), { gross: 0, ded: 0, net: 0 });

  const nonCompliant = runs.filter(r => r.minimum_wage_compliant === false);

  return (
    <>
      {/* Print styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden !important; }
          #payroll-print-area, #payroll-print-area * { visibility: visible !important; }
          #payroll-print-area {
            position: fixed !important; inset: 0 !important;
            padding: 32px !important; background: #fff !important;
            color: #1e293b !important;
          }
        }
      `}} />

      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="flex h-screen overflow-hidden">

          {/* ── Left: period + run list ── */}
          <div className="flex w-[52%] flex-col overflow-hidden border-r border-white/5">
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
                      {period.period_half === 2 && " · Statutory deductions (SSS/PhilHealth/Pag-IBIG)"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {runs.length > 0 && runs.some(r => !r.published_at && ["approved","paid","computed"].includes(r.status)) && (
                      <button
                        onClick={publishAll}
                        className="flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-900/30 px-3 py-1.5 text-sm text-violet-200 hover:bg-violet-900/50"
                      >
                        <Send size={14} /> Publish All
                      </button>
                    )}
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
                </div>
              )}

              {/* Summary KPIs with formula */}
              {runs.length > 0 && (
                <div className="mt-4 flex items-stretch gap-1 rounded-xl border border-white/5 overflow-hidden text-center">
                  <div className="flex-1 bg-slate-800/60 px-3 py-3">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">Total Gross Pay</p>
                    <p className="text-sm font-bold text-white mt-1 tabular-nums">{fmtPHP(totals.gross)}</p>
                  </div>
                  <div className="flex items-center justify-center bg-slate-900/50 px-2 text-slate-600 font-light text-lg select-none">−</div>
                  <div className="flex-1 bg-slate-800/60 px-3 py-3">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">Total Deductions</p>
                    <p className="text-sm font-bold text-red-300 mt-1 tabular-nums">{fmtPHPAbs(totals.ded)}</p>
                  </div>
                  <div className="flex items-center justify-center bg-slate-900/50 px-2 text-slate-600 font-light text-lg select-none">=</div>
                  <div className="flex-1 bg-violet-900/30 border-l border-violet-500/20 px-3 py-3">
                    <p className="text-[10px] text-violet-400/70 uppercase tracking-wider">Total Net Pay</p>
                    <p className="text-sm font-bold text-emerald-300 mt-1 tabular-nums">{fmtPHP(totals.net)}</p>
                  </div>
                </div>
              )}

              {/* Staff count */}
              {runs.length > 0 && (
                <p className="mt-2 text-xs text-slate-600">
                  {runs.length} staff member(s)
                  {nonCompliant.length > 0 && (
                    <span className="text-amber-400 ml-2">
                      ⚠ {nonCompliant.length} below minimum wage
                    </span>
                  )}
                </p>
              )}

              {/* Minimum wage warning */}
              {nonCompliant.length > 0 && (
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-900/20 px-3 py-2 text-xs text-amber-300">
                  <AlertTriangle size={14} />
                  Below minimum wage (₱695/day): {nonCompliant.map(r => r.staff_name).join(", ")}
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
                  <p className="text-slate-400 text-sm">No results yet. Click &quot;Compute All&quot; to generate payroll.</p>
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
                      <th className="py-2 text-right text-xs text-slate-500">Gross</th>
                      <th className="py-2 text-right text-xs text-red-400/70">Deductions</th>
                      <th className="py-2 text-right cursor-pointer select-none hover:text-white"
                          onClick={() => toggleSort("net")}>
                        <span className="flex items-center justify-end gap-1 text-emerald-400/70">
                          Net Pay {sortBy==="net" && (sortDir==="asc"?<ChevronUp size={12}/>:<ChevronDown size={12}/>)}
                        </span>
                      </th>
                      <th className="py-2 text-center text-xs text-slate-500">Status</th>
                      <th className="py-2 text-center text-xs text-violet-400/70">Published</th>
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
                        <td className="py-2.5 text-right text-slate-300 tabular-nums">{fmtPHP(run.gross_pay)}</td>
                        <td className="py-2.5 text-right text-red-300/80 tabular-nums text-xs">
                          ({fmtPHPAbs(run.total_deductions)})
                        </td>
                        <td className="py-2.5 text-right font-bold text-emerald-300 tabular-nums">{fmtPHP(run.net_pay)}</td>
                        <td className="py-2.5 text-center">
                          <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[run.status] ?? STATUS_BADGE.draft}`}>
                            {run.status}
                          </span>
                        </td>
                        <td className="py-2.5 text-center">
                          {run.published_at
                            ? <span title="Published"><Eye size={13} className="inline text-emerald-400" /></span>
                            : <span title="Unpublished"><EyeOff size={13} className="inline text-slate-600" /></span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Table footer totals */}
                  <tfoot>
                    <tr className="border-t-2 border-white/10">
                      <td className="py-2.5 text-xs font-semibold text-slate-400">Total ({runs.length})</td>
                      <td className="py-2.5 text-right text-sm font-bold text-white tabular-nums">{fmtPHP(totals.gross)}</td>
                      <td className="py-2.5 text-right text-sm font-bold text-red-300 tabular-nums">({fmtPHP(totals.ded)})</td>
                      <td className="py-2.5 text-right text-sm font-bold text-emerald-300 tabular-nums">{fmtPHP(totals.net)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>

          {/* ── Right: payslip detail ── */}
          <div className="flex w-[48%] flex-col overflow-hidden" id="payroll-print-area">
            {!selectedRun ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center p-8">
                <div className="rounded-xl border border-white/5 bg-white/5 p-6">
                  <p className="text-sm text-slate-400 font-medium">Select a staff member</p>
                  <p className="text-xs text-slate-600 mt-1">
                    Click a name from the list on the left<br />
                    to view the payroll breakdown.
                  </p>
                </div>
              </div>
            ) : (
              <PayslipDetail
                run={selectedRun}
                items={items}
                itemsLoading={itemsLoading}
                onApprove={approveRun}
                onPublish={publishRun}
                onUnpublish={unpublishRun}
                onClose={() => setSelectedRun(null)}
                period={period}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
