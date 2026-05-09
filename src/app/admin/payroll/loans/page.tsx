"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2, ChevronDown, ChevronRight, Clock, Loader2,
  Plus, RefreshCw, XCircle, Zap, AlertCircle, Banknote,
} from "lucide-react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import {
  GLASS_CARD, PRIMARY_BUTTON, SECONDARY_BUTTON, SMALL_BUTTON, DANGER_BUTTON,
  KPI_CARD, KPI_LABEL, KPI_VALUE,
  TAB_CONTAINER, TAB_ACTIVE, TAB_INACTIVE,
  INPUT_CLASS, SELECT_CLASS, TEXTAREA_CLASS,
  TABLE_HEADER, TABLE_ROW, TABLE_CELL,
  T_PAGE_TITLE, T_SECTION, T_LABEL, T_BODY, T_CAPTION,
  BADGE_SUCCESS, BADGE_WARNING, BADGE_ERROR, BADGE_INFO, BADGE_ACCENT,
} from "@/lib/ui-tokens";

// ── Types ────────────────────────────────────────────────────────────────────

type Loan = {
  id: string; city: string; staff_name: string;
  amount: number; installment_amount: number;
  total_installments: number; remaining_installments: number;
  status: string; purpose: string;
  requested_by: string; requested_at: string;
  approved_by: string; approved_at: string | null;
  rejected_by: string; rejected_at: string | null; rejection_note: string;
  disbursed_by: string; disbursed_at: string | null;
  start_cycle_id: number | null;
  note: string; created_at: string;
};
type Repayment = {
  id: string; loan_id: string; cycle_id: number;
  installment_no: number; amount: number; status: string;
  note: string; created_at: string; year: number; month: number;
};
type Cycle = { id: number; city: string; year: number; month: number; status: string };

// ── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function extractApiError(r: Response, fallback: string) {
  try { const j = await r.json(); return j?.detail || j?.message || fallback; } catch { return fallback; }
}

const STATUS_BADGE: Record<string, string> = {
  pending:   BADGE_WARNING,
  approved:  BADGE_INFO,
  active:    BADGE_ACCENT,
  completed: BADGE_SUCCESS,
  rejected:  BADGE_ERROR,
  cancelled: "inline-flex items-center gap-1.5 rounded-full bg-zinc-500/15 border border-zinc-500/25 px-2.5 py-0.5 text-xs font-medium text-zinc-400",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "Pending", approved: "Approved", active: "Active",
  completed: "Completed", rejected: "Rejected", cancelled: "Cancelled",
};

// ── CreateLoanModal ───────────────────────────────────────────────────────────

function CreateLoanModal({
  city, onClose, onCreated,
}: { city: string; onClose: () => void; onCreated: (l: Loan) => void }) {
  const auth = getAuth();
  const [staffName, setStaffName] = useState("");
  const [amount, setAmount] = useState("");
  const [installments, setInstallments] = useState("6");
  const [installmentAmount, setInstallmentAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // Auto-calculate installment amount
  useEffect(() => {
    const a = parseFloat(amount);
    const n = parseInt(installments);
    if (a > 0 && n > 0) setInstallmentAmount(String(Math.ceil((a / n) * 100) / 100));
  }, [amount, installments]);

  async function save() {
    if (!auth) return;
    if (!staffName.trim() || !amount || !installments) { setErr("Fill all required fields"); return; }
    setSaving(true); setErr("");
    try {
      const r = await fetch(`${API_BASE}/api/admin/payroll/loans?city=${city}`, {
        method: "POST",
        headers: { ...getAuthHeaders(auth), "Content-Type": "application/json" },
        body: JSON.stringify({
          staff_name: staffName.trim(),
          amount: parseFloat(amount),
          installment_amount: parseFloat(installmentAmount),
          total_installments: parseInt(installments),
          purpose, note,
        }),
      });
      if (!r.ok) { setErr(await extractApiError(r, "Failed to create loan")); return; }
      const j = await r.json();
      onCreated(j.loan);
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className={`${GLASS_CARD} w-full max-w-md p-6 space-y-4`}>
        <div className="flex items-center justify-between">
          <p className={T_SECTION}>New Loan Application</p>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><XCircle className="h-5 w-5" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <p className={`${T_LABEL} mb-1`}>Staff Name *</p>
            <input value={staffName} onChange={e => setStaffName(e.target.value)} placeholder="Full name as registered" className={INPUT_CLASS} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className={`${T_LABEL} mb-1`}>Loan Amount *</p>
              <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className={INPUT_CLASS} />
            </div>
            <div>
              <p className={`${T_LABEL} mb-1`}>Installments *</p>
              <input type="number" min="1" max="60" value={installments} onChange={e => setInstallments(e.target.value)} className={INPUT_CLASS} />
            </div>
          </div>
          <div>
            <p className={`${T_LABEL} mb-1`}>Monthly Deduction</p>
            <input type="number" step="0.01" value={installmentAmount} onChange={e => setInstallmentAmount(e.target.value)} className={INPUT_CLASS} />
            <p className={`${T_CAPTION} mt-1`}>Auto-calculated. Adjust if needed.</p>
          </div>
          <div>
            <p className={`${T_LABEL} mb-1`}>Purpose</p>
            <input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="e.g. Medical, Housing, Emergency" className={INPUT_CLASS} />
          </div>
          <div>
            <p className={`${T_LABEL} mb-1`}>Note</p>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className={TEXTAREA_CLASS} />
          </div>
        </div>

        {/* Preview */}
        {parseFloat(amount) > 0 && parseInt(installments) > 0 && (
          <div className="rounded-xl bg-violet-500/8 border border-violet-500/15 p-3 text-sm space-y-1">
            <p className="text-violet-300 font-medium text-xs uppercase tracking-wider">Repayment Preview</p>
            <div className="flex justify-between text-zinc-300">
              <span>Total Amount</span><span className="tabular-nums font-semibold">{fmt(parseFloat(amount) || 0)}</span>
            </div>
            <div className="flex justify-between text-zinc-300">
              <span>Monthly Deduction</span><span className="tabular-nums font-semibold">{fmt(parseFloat(installmentAmount) || 0)}</span>
            </div>
            <div className="flex justify-between text-zinc-300">
              <span>Duration</span><span>{installments} months</span>
            </div>
          </div>
        )}

        {err && <p className="text-sm text-red-400">{err}</p>}
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className={`${SECONDARY_BUTTON} flex-1`}>Cancel</button>
          <button onClick={save} disabled={saving} className={`${PRIMARY_BUTTON} flex-1 flex items-center justify-center gap-2`}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}Submit
          </button>
        </div>
      </div>
    </div>
  );
}

// ── LoanDetailPanel ───────────────────────────────────────────────────────────

function LoanDetailPanel({
  loan, cycles, city,
  onClose, onUpdated,
}: {
  loan: Loan; cycles: Cycle[]; city: string;
  onClose: () => void; onUpdated: (l: Loan) => void;
}) {
  const auth = getAuth();
  const [repayments, setRepayments] = useState<Repayment[]>([]);
  const [loadingRep, setLoadingRep] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [err, setErr] = useState("");
  // Reject modal state
  const [rejectNote, setRejectNote] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  // Disburse modal state
  const [showDisburseForm, setShowDisburseForm] = useState(false);
  const [disburseAt, setDisburseAt] = useState(new Date().toISOString().slice(0, 10));
  const [startCycleId, setStartCycleId] = useState<string>(String(cycles[0]?.id ?? ""));

  useEffect(() => {
    if (!auth) return;
    (async () => {
      setLoadingRep(true);
      try {
        const r = await fetch(`${API_BASE}/api/admin/payroll/loans/${loan.id}/repayments?city=${city}`, { headers: getAuthHeaders(auth) });
        if (r.ok) { const j = await r.json(); setRepayments(j.repayments || []); }
      } finally { setLoadingRep(false); }
    })();
  }, [loan.id]);

  async function act(action: string, body?: object) {
    if (!auth) return;
    setActing(action); setErr("");
    try {
      const r = await fetch(`${API_BASE}/api/admin/payroll/loans/${loan.id}/${action}?city=${city}`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(auth), "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!r.ok) { setErr(await extractApiError(r, `${action} failed`)); return; }
      const j = await r.json();
      onUpdated(j.loan);
    } finally { setActing(null); }
  }

  const paidInstallments = loan.total_installments - loan.remaining_installments;
  const progressPct = loan.total_installments > 0 ? (paidInstallments / loan.total_installments) * 100 : 0;
  const amountRepaid = paidInstallments * loan.installment_amount;
  const amountRemaining = loan.amount - amountRepaid;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={`relative z-10 flex h-full w-full max-w-lg flex-col overflow-y-auto ${GLASS_CARD} rounded-r-none border-r-0 shadow-2xl`}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/8 p-6">
          <div>
            <p className={T_SECTION}>{loan.staff_name}</p>
            <p className={`${T_CAPTION} mt-1`}>Loan ID: {loan.id.slice(0, 8).toUpperCase()}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={STATUS_BADGE[loan.status] || BADGE_INFO}>{STATUS_LABEL[loan.status]}</span>
            <button onClick={onClose} className="text-zinc-500 hover:text-white"><XCircle className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="flex-1 space-y-5 p-6">
          {/* Amounts */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Loan Amount", value: fmt(loan.amount) },
              { label: "Monthly", value: fmt(loan.installment_amount) },
              { label: "Duration", value: `${loan.total_installments} months` },
            ].map(kpi => (
              <div key={kpi.label} className={`${KPI_CARD} !p-3`}>
                <p className={KPI_LABEL}>{kpi.label}</p>
                <p className="mt-1 text-sm font-bold text-white tabular-nums">{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Progress bar (active / completed) */}
          {(loan.status === "active" || loan.status === "completed") && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-zinc-400">
                <span>{paidInstallments} of {loan.total_installments} installments paid</span>
                <span>{Math.round(progressPct)}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/8">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-emerald-500 transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-emerald-400">Repaid: {fmt(amountRepaid)}</span>
                <span className="text-zinc-400">Remaining: {fmt(Math.max(0, amountRemaining))}</span>
              </div>
            </div>
          )}

          {/* Details */}
          <div className="space-y-2 text-sm">
            {[
              ["Purpose", loan.purpose || "—"],
              ["Requested by", loan.requested_by || "—"],
              ["Requested at", new Date(loan.requested_at).toLocaleDateString()],
              ...(loan.approved_at ? [["Approved by", `${loan.approved_by} on ${new Date(loan.approved_at).toLocaleDateString()}`] as [string,string]] : []),
              ...(loan.disbursed_at ? [["Disbursed", new Date(loan.disbursed_at).toLocaleDateString()] as [string,string]] : []),
              ...(loan.rejection_note ? [["Rejection reason", loan.rejection_note] as [string,string]] : []),
              ...(loan.note ? [["Note", loan.note] as [string,string]] : []),
            ].map(([k, v]) => (
              <div key={k} className="flex gap-3">
                <span className="text-zinc-500 shrink-0 w-28">{k}</span>
                <span className="text-zinc-200">{v}</span>
              </div>
            ))}
          </div>

          {err && <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-3 py-2">{err}</p>}

          {/* Action buttons */}
          <div className="space-y-3 border-t border-white/8 pt-4">
            {loan.status === "pending" && (
              <>
                <button
                  onClick={() => void act("approve")}
                  disabled={acting !== null}
                  className={`${PRIMARY_BUTTON} w-full flex items-center justify-center gap-2`}
                >
                  {acting === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Approve Loan
                </button>
                {!showRejectForm ? (
                  <button onClick={() => setShowRejectForm(true)} className={`${DANGER_BUTTON} w-full`}>Reject</button>
                ) : (
                  <div className="space-y-2">
                    <textarea
                      value={rejectNote} onChange={e => setRejectNote(e.target.value)}
                      placeholder="Reason for rejection (optional)" rows={2} className={TEXTAREA_CLASS}
                    />
                    <div className="flex gap-2">
                      <button onClick={() => setShowRejectForm(false)} className={`${SECONDARY_BUTTON} flex-1`}>Cancel</button>
                      <button
                        onClick={() => void act("reject", { rejection_note: rejectNote })}
                        disabled={acting !== null}
                        className={`${DANGER_BUTTON} flex-1 flex items-center justify-center gap-2`}
                      >
                        {acting === "reject" && <Loader2 className="h-4 w-4 animate-spin" />}Confirm Reject
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {loan.status === "approved" && (
              <>
                {!showDisburseForm ? (
                  <button
                    onClick={() => setShowDisburseForm(true)}
                    className={`${PRIMARY_BUTTON} w-full flex items-center justify-center gap-2`}
                  >
                    <Banknote className="h-4 w-4" /> Disburse Loan
                  </button>
                ) : (
                  <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-sm font-medium text-white">Disburse Loan</p>
                    <div>
                      <p className={`${T_LABEL} mb-1`}>Disbursement Date</p>
                      <input type="date" value={disburseAt} onChange={e => setDisburseAt(e.target.value)} className={INPUT_CLASS} />
                    </div>
                    <div>
                      <p className={`${T_LABEL} mb-1`}>Start Repayments from Cycle</p>
                      <select value={startCycleId} onChange={e => setStartCycleId(e.target.value)} className={SELECT_CLASS}>
                        {cycles.map(c => (
                          <option key={c.id} value={c.id}>{MONTHS[c.month - 1]} {c.year}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setShowDisburseForm(false)} className={`${SECONDARY_BUTTON} flex-1`}>Cancel</button>
                      <button
                        onClick={() => void act("disburse", {
                          disbursed_at: disburseAt,
                          start_cycle_id: parseInt(startCycleId),
                        })}
                        disabled={acting !== null || !startCycleId}
                        className={`${PRIMARY_BUTTON} flex-1 flex items-center justify-center gap-2`}
                      >
                        {acting === "disburse" && <Loader2 className="h-4 w-4 animate-spin" />}Confirm
                      </button>
                    </div>
                  </div>
                )}
                <button
                  onClick={() => { if (confirm("Cancel this loan?")) void act("cancel"); }}
                  disabled={acting !== null}
                  className={`${DANGER_BUTTON} w-full`}
                >
                  Cancel Loan
                </button>
              </>
            )}

            {loan.status === "active" && (
              <button
                onClick={() => { if (confirm("Cancel this active loan? Remaining installments will be forgiven.")) void act("cancel"); }}
                disabled={acting !== null}
                className={`${DANGER_BUTTON} w-full flex items-center justify-center gap-2`}
              >
                {acting === "cancel" && <Loader2 className="h-4 w-4 animate-spin" />}Cancel Loan
              </button>
            )}
          </div>

          {/* Repayment history */}
          <div className="border-t border-white/8 pt-4">
            <p className={`${T_SECTION} mb-3`}>Repayment Schedule</p>
            {loadingRep ? (
              <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-violet-400" /></div>
            ) : repayments.length === 0 ? (
              <p className={`${T_BODY} text-center py-4`}>
                {loan.status === "active" || loan.status === "completed"
                  ? "No repayments recorded yet."
                  : "Repayments will appear here once the loan is active."}
              </p>
            ) : (
              <div className="space-y-1.5">
                {Array.from({ length: loan.total_installments }, (_, i) => {
                  const rep = repayments.find(r => r.installment_no === i + 1);
                  return (
                    <div key={i} className="flex items-center gap-3 rounded-xl bg-white/3 px-3 py-2 text-sm">
                      <span className={`shrink-0 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold ${rep ? "bg-emerald-500/20 text-emerald-400" : "bg-white/8 text-zinc-500"}`}>
                        {i + 1}
                      </span>
                      <span className="flex-1 text-zinc-300">
                        {rep ? `${MONTHS[rep.month - 1]} ${rep.year}` : `Installment ${i + 1}`}
                      </span>
                      <span className="tabular-nums text-zinc-200">{fmt(loan.installment_amount)}</span>
                      {rep ? (
                        <span className={BADGE_SUCCESS}><CheckCircle2 className="h-3 w-3" /> Deducted</span>
                      ) : (
                        <span className={BADGE_WARNING}><Clock className="h-3 w-3" /> Pending</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function LoansPage() {
  const router = useRouter();
  const auth = getAuth();

  const [city, setCity] = useState(
    typeof auth === "object" && auth !== null && "city" in auth
      ? String((auth as { city?: string }).city || "").toLowerCase() === "dubai" ? "dubai" : "manila"
      : "manila",
  );
  const [loans, setLoans] = useState<Loan[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [createModal, setCreateModal] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);

  // Apply-to-cycle state
  const [applyCycleId, setApplyCycleId] = useState<string>("");
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{ applied: string[]; skipped: string[]; completed: string[] } | null>(null);

  const loadRef = useRef(0);

  // Auth guard
  useEffect(() => {
    if (!auth) { router.replace("/login"); return; }
    const role = String((auth as { role?: string }).role || "").toUpperCase();
    if (!["HQ", "ADMIN", "MANILA_MANAGEMENT", "MANAGEMENT", "HR_MANAGER"].includes(role)) {
      router.replace("/week");
    }
  }, []);

  const loadLoans = useCallback(async () => {
    if (!auth) return;
    const token = ++loadRef.current;
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API_BASE}/api/admin/payroll/loans?city=${city}&status=${statusFilter}`, { headers: getAuthHeaders(auth) });
      if (token !== loadRef.current) return;
      if (r.ok) { const j = await r.json(); setLoans(j.loans || []); }
      else setErr(await extractApiError(r, "Failed to load loans"));
    } finally { if (token === loadRef.current) setLoading(false); }
  }, [city, statusFilter]);

  useEffect(() => {
    if (!auth) return;
    (async () => {
      const r = await fetch(`${API_BASE}/api/admin/payroll/cycles?city=${city}&limit=24`, { headers: getAuthHeaders(auth) });
      if (r.ok) { const j = await r.json(); setCycles(j.cycles || []); if (j.cycles?.[0]) setApplyCycleId(String(j.cycles[0].id)); }
    })();
  }, [city]);

  useEffect(() => { void loadLoans(); }, [loadLoans]);

  async function applyToCycle() {
    if (!auth || !applyCycleId) return;
    setApplying(true); setApplyResult(null); setErr("");
    try {
      const r = await fetch(`${API_BASE}/api/admin/payroll/loans/apply-to-cycle?city=${city}&cycle_id=${applyCycleId}`, {
        method: "POST", headers: getAuthHeaders(auth),
      });
      if (!r.ok) { setErr(await extractApiError(r, "Apply failed")); return; }
      const j = await r.json();
      setApplyResult(j);
      await loadLoans();
    } finally { setApplying(false); }
  }

  function updateLoan(updated: Loan) {
    setLoans(prev => prev.map(l => l.id === updated.id ? updated : l));
    setSelectedLoan(updated);
  }

  const activeLoanCount = loans.filter(l => l.status === "active").length;
  const pendingCount = loans.filter(l => l.status === "pending").length;
  const totalActive = loans.filter(l => l.status === "active").reduce((s, l) => s + l.amount, 0);

  const filtered = statusFilter === "all" ? loans : loans.filter(l => l.status === statusFilter);

  return (
    <div className="min-h-screen bg-[#0a0b0f] px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={T_PAGE_TITLE}>Employee Loans</p>
            <p className={`${T_BODY} mt-1`}>ローン申請・承認・分割返済管理</p>
          </div>
          <div className="flex items-center gap-2">
            {["dubai", "manila"].map(c => (
              <button key={c} onClick={() => { setCity(c); setLoans([]); setApplyResult(null); }}
                className={city === c ? TAB_ACTIVE : TAB_INACTIVE}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </button>
            ))}
            <button
              onClick={() => setCreateModal(true)}
              className={`${PRIMARY_BUTTON} flex items-center gap-2`}
            >
              <Plus className="h-4 w-4" /> New Loan
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Active Loans", value: String(activeLoanCount) },
            { label: "Pending Approval", value: String(pendingCount) },
            { label: "Total Outstanding", value: activeLoanCount > 0 ? fmt(totalActive) : "—" },
          ].map(kpi => (
            <div key={kpi.label} className={KPI_CARD}>
              <p className={KPI_LABEL}>{kpi.label}</p>
              <p className={KPI_VALUE}>{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Apply to Cycle */}
        <div className={`${GLASS_CARD} p-4`}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-violet-400" />
              <p className="text-sm font-semibold text-white">Auto-apply Loan Deductions to Payroll</p>
            </div>
            <div className="flex flex-1 items-center gap-3 min-w-[260px]">
              <div className="relative flex-1">
                <select value={applyCycleId} onChange={e => setApplyCycleId(e.target.value)} className={SELECT_CLASS}>
                  <option value="">— Select Cycle —</option>
                  {cycles.map(c => (
                    <option key={c.id} value={c.id}>{MONTHS[c.month - 1]} {c.year} ({c.status})</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              </div>
              <button
                onClick={applyToCycle}
                disabled={applying || !applyCycleId || activeLoanCount === 0}
                className={`${PRIMARY_BUTTON} flex items-center gap-2 shrink-0`}
              >
                {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                Apply ({activeLoanCount})
              </button>
            </div>
          </div>
          <p className={`${T_CAPTION} mt-2`}>
            Adds a <strong>Loan Installment</strong> recurring deduction to each active employee&apos;s payroll adjustments for the selected cycle. Idempotent — safe to run multiple times.
          </p>
          {applyResult && (
            <div className="mt-3 rounded-xl bg-emerald-500/8 border border-emerald-500/15 p-3 text-sm space-y-1">
              <p className="text-emerald-300 font-medium">Applied successfully</p>
              <p className="text-zinc-300">Applied: <span className="text-white font-medium">{applyResult.applied.length}</span> employees</p>
              {applyResult.skipped.length > 0 && <p className="text-zinc-400">Skipped (already applied): {applyResult.skipped.join(", ")}</p>}
              {applyResult.completed.length > 0 && <p className="text-emerald-400">Loans completed this cycle: {applyResult.completed.join(", ")}</p>}
            </div>
          )}
        </div>

        {err && <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-2">{err}</p>}

        {/* Status Tabs */}
        <div className={TAB_CONTAINER}>
          {["all","pending","approved","active","completed","rejected","cancelled"].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} className={statusFilter === s ? TAB_ACTIVE : TAB_INACTIVE}>
              {STATUS_LABEL[s] || "All"}
              {s === "pending" && pendingCount > 0 && (
                <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
          <button onClick={() => void loadLoans()} className={SMALL_BUTTON}><RefreshCw className="h-3.5 w-3.5" /></button>
        </div>

        {/* Loan Table */}
        <div className={`${GLASS_CARD} overflow-hidden`}>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-violet-400" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-14 text-center">
              <AlertCircle className="mx-auto h-8 w-8 text-zinc-600 mb-3" />
              <p className={T_BODY}>No loans found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className="border-b border-white/8">
                  <tr className="px-6">
                    {["Staff Name","Amount","Monthly","Progress","Purpose","Status",""].map(h => (
                      <th key={h} className={`${TABLE_HEADER} px-4 py-3 text-left`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(loan => {
                    const paid = loan.total_installments - loan.remaining_installments;
                    return (
                      <tr key={loan.id} className={`${TABLE_ROW} cursor-pointer`} onClick={() => setSelectedLoan(loan)}>
                        <td className={`${TABLE_CELL} px-4 font-medium`}>{loan.staff_name}</td>
                        <td className={`${TABLE_CELL} px-4 tabular-nums`}>{fmt(loan.amount)}</td>
                        <td className={`${TABLE_CELL} px-4 tabular-nums text-zinc-400`}>{fmt(loan.installment_amount)}</td>
                        <td className="px-4 py-3">
                          {loan.status === "active" || loan.status === "completed" ? (
                            <div className="flex items-center gap-2 min-w-[100px]">
                              <div className="flex-1 h-1.5 rounded-full bg-white/8">
                                <div
                                  className="h-1.5 rounded-full bg-violet-500"
                                  style={{ width: `${(paid / loan.total_installments) * 100}%` }}
                                />
                              </div>
                              <span className="text-xs text-zinc-400 tabular-nums shrink-0">{paid}/{loan.total_installments}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-zinc-600">—</span>
                          )}
                        </td>
                        <td className={`${TABLE_CELL} px-4 text-zinc-400 max-w-[140px] truncate`}>{loan.purpose || "—"}</td>
                        <td className="px-4 py-3">
                          <span className={STATUS_BADGE[loan.status] || BADGE_INFO}>{STATUS_LABEL[loan.status]}</span>
                        </td>
                        <td className="px-4 py-3">
                          <ChevronRight className="h-4 w-4 text-zinc-600" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {createModal && (
        <CreateLoanModal
          city={city}
          onClose={() => setCreateModal(false)}
          onCreated={l => { setLoans(prev => [l, ...prev]); setCreateModal(false); setSelectedLoan(l); }}
        />
      )}

      {selectedLoan && (
        <LoanDetailPanel
          loan={selectedLoan}
          cycles={cycles}
          city={city}
          onClose={() => setSelectedLoan(null)}
          onUpdated={updateLoan}
        />
      )}
    </div>
  );
}
