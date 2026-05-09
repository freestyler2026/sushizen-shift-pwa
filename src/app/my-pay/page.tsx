"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Banknote,
  ChevronRight,
  Clock,
  CreditCard,
  FileText,
  Loader2,
  Receipt,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import {
  BADGE_ERROR,
  BADGE_INFO,
  BADGE_SUCCESS,
  BADGE_WARNING,
  GLASS_CARD,
  KPI_CARD,
  T_PAGE_TITLE,
  TAB_ACTIVE,
  TAB_INACTIVE,
} from "@/lib/ui-tokens";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { API_BASE } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type City = "dubai" | "manila";

interface Payslip {
  id: string;
  cycle_id: number;
  cycle_label: string;
  period_start: string | null;
  period_end: string | null;
  pay_date: string | null;
  base_salary: number;
  total_adjustments: number;
  loan_deduction: number;
  net_pay: number;
  currency: string;
  snapshot_at: string;
}

interface Adjustment {
  id: string;
  cycle_id: number;
  cycle_label: string | null;
  period_start: string | null;
  period_end: string | null;
  pay_date: string | null;
  kind: string;
  amount: number;
  currency: string;
  reason: string;
  created_by: string;
  created_at: string;
}

interface Loan {
  id: string;
  amount: number;
  currency: string;
  installment_amount: number;
  total_installments: number;
  paid_installments: number;
  remaining_balance: number;
  total_repaid: number;
  status: string;
  purpose: string;
  note: string;
  approved_by: string;
  approved_at: string | null;
  disbursed_at: string | null;
  created_at: string;
}

interface LeaveSalaryReq {
  id: string;
  leave_start_date: string;
  leave_end_date: string;
  leave_days: number;
  currency: string;
  daily_rate: number;
  advance_amount: number;
  status: string;
  purpose: string;
  requested_at: string;
  approved_by: string;
  approved_at: string | null;
  paid_at: string | null;
  paid_via: string;
  rejection_note: string;
}

interface Summary {
  latest_payslip: {
    net_pay: number;
    currency: string;
    cycle_label: string;
    pay_date: string | null;
  } | null;
  active_loans: number;
  total_loan_remaining: number;
  pending_adjustments: number;
  pending_adj_net: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function loanStatusBadge(status: string) {
  if (status === "active") return <span className={BADGE_INFO}>Active</span>;
  if (status === "completed") return <span className={BADGE_SUCCESS}>Completed</span>;
  if (status === "approved") return <span className={BADGE_WARNING}>Approved</span>;
  if (status === "rejected") return <span className={BADGE_ERROR}>Rejected</span>;
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-500/15 border border-zinc-500/25 px-2.5 py-0.5 text-xs font-medium text-zinc-400">{status}</span>;
}

function leaveSalaryBadge(status: string) {
  if (status === "paid") return <span className={BADGE_SUCCESS}>Paid</span>;
  if (status === "approved") return <span className={BADGE_INFO}>Approved</span>;
  if (status === "pending") return <span className={BADGE_WARNING}>Pending</span>;
  if (status === "rejected") return <span className={BADGE_ERROR}>Rejected</span>;
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-500/15 border border-zinc-500/25 px-2.5 py-0.5 text-xs font-medium text-zinc-400">{status}</span>;
}

// ─── Payslip Detail Modal ─────────────────────────────────────────────────────

function PayslipModal({ slip, onClose }: { slip: Payslip; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className={`${GLASS_CARD} w-full max-w-md`}>
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-white/10">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-violet-400 mb-1">Pay Slip</p>
            <h2 className="text-xl font-semibold text-white">{slip.cycle_label || "—"}</h2>
            {slip.period_start && slip.period_end && (
              <p className="text-sm text-zinc-400 mt-0.5">
                {fmtDate(slip.period_start)} – {fmtDate(slip.period_end)}
              </p>
            )}
            {slip.pay_date && (
              <p className="text-xs text-zinc-500 mt-0.5">Pay date: {fmtDate(slip.pay_date)}</p>
            )}
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Breakdown */}
        <div className="p-6 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">Base Salary</span>
            <span className="text-white font-medium">{fmt(slip.base_salary, slip.currency)}</span>
          </div>

          {slip.total_adjustments !== 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Adjustments</span>
              <span className={slip.total_adjustments >= 0 ? "text-emerald-400 font-medium" : "text-red-400 font-medium"}>
                {slip.total_adjustments >= 0 ? "+" : ""}{fmt(slip.total_adjustments, slip.currency)}
              </span>
            </div>
          )}

          {slip.loan_deduction > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Loan Deduction</span>
              <span className="text-amber-400 font-medium">−{fmt(slip.loan_deduction, slip.currency)}</span>
            </div>
          )}

          <div className="border-t border-white/10 pt-3 mt-3 flex justify-between items-end">
            <span className="font-semibold text-white">Net Pay</span>
            <span className="text-2xl font-bold text-emerald-400">{fmt(slip.net_pay, slip.currency)}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={() => window.print()}
            className="flex-1 rounded-xl border border-violet-400/20 bg-violet-500/10 py-2.5 text-sm font-medium text-violet-300 transition hover:bg-violet-500/20"
          >
            Print / Save PDF
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-white/10"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Loan Card ────────────────────────────────────────────────────────────────

function LoanCard({ loan }: { loan: Loan }) {
  const pct = loan.total_installments > 0
    ? Math.round((loan.paid_installments / loan.total_installments) * 100)
    : 0;

  return (
    <div className={`${GLASS_CARD} p-5`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-white">{fmt(loan.amount, loan.currency)}</p>
          <p className="text-xs text-zinc-400 mt-0.5">{loan.purpose || "No purpose specified"}</p>
        </div>
        {loanStatusBadge(loan.status)}
      </div>

      {(loan.status === "active" || loan.status === "completed") && (
        <>
          <div className="mb-1 flex justify-between text-xs text-zinc-400">
            <span>{loan.paid_installments}/{loan.total_installments} installments</span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-zinc-500">Remaining balance</p>
              <p className="font-semibold text-amber-400 mt-0.5">{fmt(loan.remaining_balance, loan.currency)}</p>
            </div>
            <div className="text-right">
              <p className="text-zinc-500">Monthly installment</p>
              <p className="font-medium text-zinc-300 mt-0.5">{fmt(loan.installment_amount, loan.currency)}</p>
            </div>
          </div>
        </>
      )}

      <div className="mt-3 border-t border-white/10 pt-3 flex justify-between text-xs text-zinc-600">
        <span>Applied: {fmtDate(loan.created_at)}</span>
        {loan.disbursed_at && <span>Disbursed: {fmtDate(loan.disbursed_at)}</span>}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = "payslips" | "adjustments" | "loans" | "leave";

export default function MyPayPage() {
  const router = useRouter();
  const [city, setCity] = useState<City>("dubai");
  const [tab, setTab] = useState<Tab>("payslips");

  const [summary, setSummary] = useState<Summary | null>(null);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [leaveReqs, setLeaveReqs] = useState<LeaveSalaryReq[]>([]);

  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedSlip, setSelectedSlip] = useState<Payslip | null>(null);

  const loadRef = useRef(0);
  const authRef = useRef(getAuth());

  // Auth guard — redirect if not logged in
  useEffect(() => {
    const auth = getAuth();
    authRef.current = auth;
    if (!auth) {
      router.replace("/");
      return;
    }
    if (auth.city === "manila") setCity("manila");
    else setCity("dubai");
  }, [router]);

  const doFetch = useCallback(async (path: string) => {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: getAuthHeaders(authRef.current),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `HTTP ${res.status}`);
    }
    return res.json();
  }, []);

  // Load summary cards
  const loadSummary = useCallback(async (c: City) => {
    const id = ++loadRef.current;
    setLoading(true);
    setError("");
    try {
      const data = await doFetch(`/api/admin/payroll/my-pay/summary?city=${c}`);
      if (loadRef.current !== id) return;
      setSummary(data);
    } catch {
      if (loadRef.current !== id) return;
      setError("Failed to load pay summary. Please try again.");
    } finally {
      if (loadRef.current === id) setLoading(false);
    }
  }, [doFetch]);

  // Load current tab
  const loadTab = useCallback(async (t: Tab, c: City) => {
    const id = ++loadRef.current;
    setTabLoading(true);
    try {
      if (t === "payslips") {
        const data = await doFetch(`/api/admin/payroll/my-pay/payslips?city=${c}`);
        if (loadRef.current !== id) return;
        setPayslips(data.payslips ?? []);
      } else if (t === "adjustments") {
        const data = await doFetch(`/api/admin/payroll/my-pay/adjustments?city=${c}`);
        if (loadRef.current !== id) return;
        setAdjustments(data.adjustments ?? []);
      } else if (t === "loans") {
        const data = await doFetch(`/api/admin/payroll/my-pay/loans?city=${c}`);
        if (loadRef.current !== id) return;
        setLoans(data.loans ?? []);
      } else if (t === "leave") {
        const data = await doFetch(`/api/admin/payroll/my-pay/leave-salary?city=${c}`);
        if (loadRef.current !== id) return;
        setLeaveReqs(data.requests ?? []);
      }
    } catch {
      // non-critical — show empty state
    } finally {
      if (loadRef.current === id) setTabLoading(false);
    }
  }, [doFetch]);

  useEffect(() => {
    loadSummary(city);
    loadTab(tab, city);
  }, [city]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadTab(tab, city);
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCityChange = (c: City) => {
    setCity(c);
    setSummary(null);
    setPayslips([]);
    setAdjustments([]);
    setLoans([]);
    setLeaveReqs([]);
    loadSummary(c);
    loadTab(tab, c);
  };

  const defaultCurrency = city === "dubai" ? "AED" : "PHP";

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "payslips", label: "Pay Slips", icon: <Receipt className="h-4 w-4" /> },
    { key: "adjustments", label: "Adjustments", icon: <TrendingUp className="h-4 w-4" /> },
    { key: "loans", label: "Loans", icon: <CreditCard className="h-4 w-4" /> },
    { key: "leave", label: "Leave Advance", icon: <Wallet className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 md:p-6">
      <div className="mx-auto max-w-3xl space-y-6">

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-violet-400 mb-1">Self-Service</p>
            <h1 className={T_PAGE_TITLE}>My Pay</h1>
          </div>

          {/* City Toggle */}
          <div className="flex rounded-xl border border-white/10 bg-white/5 p-1 gap-1">
            {(["dubai", "manila"] as City[]).map((c) => (
              <button
                key={c}
                onClick={() => handleCityChange(c)}
                className={city === c
                  ? "rounded-lg bg-violet-500/30 px-4 py-1.5 text-sm font-semibold text-violet-200 transition"
                  : "rounded-lg px-4 py-1.5 text-sm text-zinc-400 transition hover:text-zinc-200"}
              >
                {c === "dubai" ? "🇦🇪 Dubai" : "🇵🇭 Manila"}
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16 text-zinc-400">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading your pay data…
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* KPI Summary */}
        {!loading && summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Last Net Pay */}
            <div className={KPI_CARD}>
              <div className="flex items-center gap-2 mb-2">
                <Banknote className="h-4 w-4 text-emerald-400" />
                <span className="text-xs text-zinc-400">Last Net Pay</span>
              </div>
              {summary.latest_payslip ? (
                <>
                  <p className="text-base font-bold text-emerald-400 leading-tight">
                    {fmt(summary.latest_payslip.net_pay, summary.latest_payslip.currency)}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5 truncate">{summary.latest_payslip.cycle_label}</p>
                </>
              ) : (
                <p className="text-sm text-zinc-500">No records yet</p>
              )}
            </div>

            {/* Loan Balance */}
            <div className={KPI_CARD}>
              <div className="flex items-center gap-2 mb-2">
                <CreditCard className="h-4 w-4 text-amber-400" />
                <span className="text-xs text-zinc-400">Loan Balance</span>
              </div>
              {summary.active_loans > 0 ? (
                <>
                  <p className="text-base font-bold text-amber-400 leading-tight">
                    {fmt(summary.total_loan_remaining, defaultCurrency)}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {summary.active_loans} active loan{summary.active_loans > 1 ? "s" : ""}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-base font-bold text-zinc-500">—</p>
                  <p className="text-xs text-zinc-600 mt-0.5">No active loans</p>
                </>
              )}
            </div>

            {/* Pending Adjustments */}
            <div className={KPI_CARD}>
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4 text-violet-400" />
                <span className="text-xs text-zinc-400">Pending Adj.</span>
              </div>
              <p className="text-base font-bold text-violet-300">{summary.pending_adjustments}</p>
              {summary.pending_adjustments > 0 && (
                <p className={`text-xs mt-0.5 font-medium ${summary.pending_adj_net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {summary.pending_adj_net >= 0 ? "+" : ""}
                  {fmt(summary.pending_adj_net, defaultCurrency)}
                </p>
              )}
            </div>

            {/* Last Pay Date */}
            <div className={KPI_CARD}>
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-teal-400" />
                <span className="text-xs text-zinc-400">Last Pay Date</span>
              </div>
              <p className="text-sm font-semibold text-teal-300">
                {summary.latest_payslip?.pay_date ? fmtDate(summary.latest_payslip.pay_date) : "—"}
              </p>
            </div>
          </div>
        )}

        {/* Tab Bar */}
        {!loading && (
          <div className="flex flex-wrap gap-2">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 ${tab === t.key ? TAB_ACTIVE : TAB_INACTIVE}`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Tab Content */}
        {!loading && (
          <div className="relative min-h-[240px]">
            {tabLoading && (
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
              </div>
            )}

            {/* ── Pay Slips ── */}
            {tab === "payslips" && !tabLoading && (
              <div className="space-y-3">
                {payslips.length === 0 ? (
                  <div className={`${GLASS_CARD} flex flex-col items-center justify-center py-16 text-center`}>
                    <Receipt className="h-10 w-10 text-zinc-600 mb-3" />
                    <p className="text-zinc-400 font-medium">No pay slips yet</p>
                    <p className="text-xs text-zinc-600 mt-1">Pay slips appear after your payroll cycle is closed</p>
                  </div>
                ) : (
                  payslips.map((slip) => (
                    <button
                      key={slip.id}
                      onClick={() => setSelectedSlip(slip)}
                      className={`${GLASS_CARD} w-full text-left p-4 hover:border-violet-500/30 transition group`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-white text-sm">{slip.cycle_label}</p>
                          {slip.period_start && slip.period_end && (
                            <p className="text-xs text-zinc-400 mt-0.5">
                              {fmtDate(slip.period_start)} – {fmtDate(slip.period_end)}
                            </p>
                          )}
                          {slip.pay_date && (
                            <p className="text-xs text-zinc-500 mt-0.5">Paid: {fmtDate(slip.pay_date)}</p>
                          )}
                        </div>
                        <div className="text-right ml-4 shrink-0">
                          <p className="text-lg font-bold text-emerald-400">{fmt(slip.net_pay, slip.currency)}</p>
                          {slip.loan_deduction > 0 && (
                            <p className="text-xs text-amber-400">−{fmt(slip.loan_deduction, slip.currency)} loan</p>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4 text-zinc-600 ml-3 group-hover:text-violet-400 transition shrink-0" />
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            {/* ── Adjustments ── */}
            {tab === "adjustments" && !tabLoading && (
              <div className="space-y-3">
                {adjustments.length === 0 ? (
                  <div className={`${GLASS_CARD} flex flex-col items-center justify-center py-16 text-center`}>
                    <TrendingUp className="h-10 w-10 text-zinc-600 mb-3" />
                    <p className="text-zinc-400 font-medium">No adjustments on record</p>
                    <p className="text-xs text-zinc-600 mt-1">Bonuses, allowances, and deductions will appear here</p>
                  </div>
                ) : (
                  adjustments.map((adj) => {
                    const isPositive = ["bonus", "allowance", "overtime"].includes(adj.kind);
                    return (
                      <div key={adj.id} className={`${GLASS_CARD} p-4`}>
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              {isPositive
                                ? <TrendingUp className="h-4 w-4 text-emerald-400 shrink-0" />
                                : <TrendingDown className="h-4 w-4 text-red-400 shrink-0" />}
                              <span className="text-sm font-medium text-white capitalize">{adj.kind}</span>
                              {adj.cycle_label && (
                                <span className="text-xs text-zinc-500">· {adj.cycle_label}</span>
                              )}
                            </div>
                            <p className="text-xs text-zinc-400">{adj.reason || "No reason provided"}</p>
                            <p className="text-xs text-zinc-600 mt-1">
                              Added by {adj.created_by} · {fmtDate(adj.created_at)}
                            </p>
                          </div>
                          <p className={`text-base font-bold ml-4 shrink-0 ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                            {isPositive ? "+" : "−"}{fmt(adj.amount, adj.currency)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* ── Loans ── */}
            {tab === "loans" && !tabLoading && (
              <div className="space-y-3">
                {loans.length === 0 ? (
                  <div className={`${GLASS_CARD} flex flex-col items-center justify-center py-16 text-center`}>
                    <CreditCard className="h-10 w-10 text-zinc-600 mb-3" />
                    <p className="text-zinc-400 font-medium">No loan records</p>
                    <p className="text-xs text-zinc-600 mt-1">Your loans and repayment progress will appear here</p>
                  </div>
                ) : (
                  loans.map((loan) => <LoanCard key={loan.id} loan={loan} />)
                )}
              </div>
            )}

            {/* ── Leave Advance ── */}
            {tab === "leave" && !tabLoading && (
              <div className="space-y-3">
                {leaveReqs.length === 0 ? (
                  <div className={`${GLASS_CARD} flex flex-col items-center justify-center py-16 text-center`}>
                    <Wallet className="h-10 w-10 text-zinc-600 mb-3" />
                    <p className="text-zinc-400 font-medium">No leave advance requests</p>
                    <p className="text-xs text-zinc-600 mt-1">Leave salary advance requests will appear here</p>
                  </div>
                ) : (
                  leaveReqs.map((req) => (
                    <div key={req.id} className={`${GLASS_CARD} p-4`}>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-sm font-semibold text-white">
                            {fmtDate(req.leave_start_date)} – {fmtDate(req.leave_end_date)}
                          </p>
                          <p className="text-xs text-zinc-400 mt-0.5">
                            {req.leave_days} days · {req.purpose || "Leave advance"}
                          </p>
                        </div>
                        {leaveSalaryBadge(req.status)}
                      </div>

                      <div className="flex justify-between text-sm mt-3 pt-3 border-t border-white/10">
                        <div>
                          <p className="text-xs text-zinc-500">Daily Rate</p>
                          <p className="text-sm font-medium text-zinc-300">{fmt(req.daily_rate, req.currency)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-zinc-500">Advance Amount</p>
                          <p className="text-base font-bold text-teal-400">{fmt(req.advance_amount, req.currency)}</p>
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap justify-between gap-1 text-xs text-zinc-600">
                        <span>Requested: {fmtDate(req.requested_at)}</span>
                        {req.paid_at
                          ? <span>Paid: {fmtDate(req.paid_at)} via {req.paid_via}</span>
                          : req.approved_at
                          ? <span>Approved: {fmtDate(req.approved_at)}</span>
                          : null}
                      </div>

                      {req.rejection_note && (
                        <div className="mt-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
                          Reason: {req.rejection_note}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Payslip Modal */}
      {selectedSlip && (
        <PayslipModal slip={selectedSlip} onClose={() => setSelectedSlip(null)} />
      )}
    </div>
  );
}
