"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  XCircle,
} from "lucide-react";
import { canAccessAdminNav, getAuth, getAuthHeaders } from "@/lib/auth";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SELECT_CLASS,
  T_CAPTION,
  T_LABEL,
  T_PAGE_TITLE,
  TAB_ACTIVE,
  TAB_INACTIVE,
} from "@/lib/ui-tokens";

// ─── Constants ────────────────────────────────────────────────────────────────

const BRANCHES = [
  { code: "", label: "All branches" },
  { code: "PAR",  label: "Paranaque" },
  { code: "CUB",  label: "Cubao" },
  { code: "TAFT", label: "Taft" },
];

const STATUS_TABS = [
  { key: "",         label: "All" },
  { key: "PENDING",  label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "SETTLED",  label: "Settled" },
  { key: "REJECTED", label: "Rejected" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type Receipt = {
  id: string;
  amount: number;
  description: string;
  photo_url: string;
  uploaded_by: string;
  uploaded_at: string;
};

type Expense = {
  id: string;
  branch_code: string;
  staff_name: string;
  request_date: string;
  advance_amount: number;
  purpose: string;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  settled_by: string | null;
  settled_at: string | null;
  created_at: string;
  total_receipts?: number;
  balance?: number;
  receipt_count?: number;
  receipts?: Receipt[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(n: number | undefined): string {
  if (n === undefined || n === null) return "—";
  return `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric",
  });
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-PH", {
    timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit",
  });
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  PENDING:  { label: "Pending",  color: "border-amber-500/30 bg-amber-500/10 text-amber-300" },
  APPROVED: { label: "Approved", color: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" },
  REJECTED: { label: "Rejected", color: "border-red-500/30 bg-red-500/10 text-red-300" },
  SETTLED:  { label: "Settled",  color: "border-sky-500/30 bg-sky-500/10 text-sky-300" },
};

// ─── Expense Card ─────────────────────────────────────────────────────────────

function ExpenseCard({
  expense: initialExpense,
  onAction,
}: {
  expense: Expense;
  onAction: () => void;
}) {
  const [expense, setExpense] = useState(initialExpense);
  const [open, setOpen]       = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [acting, setActing]   = useState<string | null>(null);
  const [msg, setMsg]         = useState<{ ok: boolean; text: string } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailLoaded, setDetailLoaded]   = useState(false);

  const meta   = STATUS_META[expense.status] ?? STATUS_META["PENDING"];
  const bal    = expense.balance ?? (expense.advance_amount - (expense.total_receipts ?? 0));
  const branch = BRANCHES.find((b) => b.code === expense.branch_code)?.label ?? expense.branch_code;

  const loadDetail = async () => {
    if (detailLoaded) return;
    setLoadingDetail(true);
    try {
      const r = await fetch(`/api/admin/transport/${expense.id}`, {
        headers: getAuthHeaders(), cache: "no-store",
      });
      const d = await r.json();
      if (r.ok && d.expense) { setExpense(d.expense); setDetailLoaded(true); }
    } finally {
      setLoadingDetail(false);
    }
  };

  const toggle = () => { if (!open) loadDetail(); setOpen(!open); };

  const callAction = async (action: "approve" | "reject" | "settle") => {
    setActing(action); setMsg(null);
    try {
      const body = action === "reject" ? JSON.stringify({ reason: rejectReason }) : "{}";
      const r = await fetch(`/api/admin/transport/${expense.id}/${action}`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body,
        cache: "no-store",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || `${action} failed`);
      setExpense(d.expense);
      setMsg({ ok: true, text: `${action.charAt(0).toUpperCase() + action.slice(1)}d ✓` });
      setShowRejectInput(false); setRejectReason("");
      onAction();
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setActing(null);
    }
  };

  return (
    <div className={`rounded-2xl border bg-white/3 ${expense.status === "PENDING" ? "border-amber-500/20" : "border-white/8"}`}>
      {/* Header */}
      <button type="button" onClick={toggle} className="w-full text-left p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-white">{expense.staff_name}</p>
            <p className={`${T_CAPTION} mt-0.5`}>
              {branch} · {fmtDate(expense.request_date)}
            </p>
            {expense.purpose && (
              <p className="text-xs text-white/40 mt-0.5 truncate max-w-[180px]">{expense.purpose}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.color}`}>
              {meta.label}
            </span>
            <span className="text-xs font-semibold text-white/70">{fmtCurrency(expense.advance_amount)}</span>
            {expense.status === "APPROVED" && (
              <span className="text-[10px] text-amber-300">
                {fmtCurrency(bal)} remaining
              </span>
            )}
            {open ? <ChevronUp size={13} className="text-white/40" /> : <ChevronDown size={13} className="text-white/40" />}
          </div>
        </div>
      </button>

      {/* Detail panel */}
      {open && (
        <div className="border-t border-white/6 px-4 pb-4 pt-3 space-y-3">
          {loadingDetail && (
            <div className="flex justify-center py-2"><RefreshCw size={14} className="animate-spin text-white/30" /></div>
          )}

          {/* Receipts */}
          {(expense.receipts && expense.receipts.length > 0) && (
            <div className="space-y-1.5">
              <p className={T_LABEL}>Receipts ({expense.receipts.length})</p>
              {expense.receipts.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg bg-white/4 px-3 py-2 text-xs">
                  <div>
                    <span className="font-semibold text-white">{fmtCurrency(r.amount)}</span>
                    {r.description && <span className="ml-2 text-white/50">{r.description}</span>}
                    <div className={T_CAPTION}>{r.uploaded_by} · {fmtTime(r.uploaded_at)}</div>
                  </div>
                  {r.photo_url && (
                    <a href={r.photo_url} target="_blank" rel="noopener noreferrer"
                      className="text-sky-400 text-[10px] underline hover:text-sky-300">📎 Photo</a>
                  )}
                </div>
              ))}
              <div className="flex justify-between rounded-lg bg-white/5 px-3 py-2 text-xs font-semibold border border-white/6">
                <span className="text-white/50">Total / Balance</span>
                <span className="text-white">
                  {fmtCurrency(expense.total_receipts ?? 0)} / {fmtCurrency(bal)}
                </span>
              </div>
            </div>
          )}
          {expense.receipts?.length === 0 && expense.status === "APPROVED" && (
            <p className="text-xs text-white/30 italic">No receipts submitted yet</p>
          )}

          {msg && (
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${msg.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>
              {msg.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />} {msg.text}
            </div>
          )}

          {/* Actions */}
          {expense.status === "PENDING" && (
            <div className="space-y-2">
              {!showRejectInput ? (
                <div className="flex gap-2">
                  <button onClick={() => callAction("approve")} disabled={!!acting}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50">
                    {acting === "approve" ? <RefreshCw size={11} className="animate-spin" /> : <ThumbsUp size={11} />}
                    Approve
                  </button>
                  <button onClick={() => setShowRejectInput(true)} disabled={!!acting}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/20 disabled:opacity-50">
                    <ThumbsDown size={11} /> Reject
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <input type="text" className={SELECT_CLASS} placeholder="Rejection reason (optional)"
                    value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                  <div className="flex gap-2">
                    <button onClick={() => callAction("reject")} disabled={!!acting}
                      className="flex-1 rounded-xl border border-red-500/30 bg-red-500/10 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/20 disabled:opacity-50">
                      {acting === "reject" ? <RefreshCw size={11} className="animate-spin mx-auto" /> : "Confirm Reject"}
                    </button>
                    <button onClick={() => { setShowRejectInput(false); setRejectReason(""); }}
                      className="rounded-xl border border-white/10 px-3 py-2 text-xs text-white/50 hover:text-white">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {expense.status === "APPROVED" && (
            <button onClick={() => callAction("settle")} disabled={!!acting}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 py-2 text-xs font-semibold text-sky-300 hover:bg-sky-500/20 disabled:opacity-50">
              {acting === "settle" ? <RefreshCw size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
              Mark as Settled
            </button>
          )}

          {/* Info footer */}
          {expense.approved_by && (
            <p className={T_CAPTION}>✓ Approved by {expense.approved_by} · {fmtTime(expense.approved_at)}</p>
          )}
          {expense.rejected_by && (
            <p className={T_CAPTION}>✗ Rejected by {expense.rejected_by} · {fmtTime(expense.rejected_at)}</p>
          )}
          {expense.settled_by && (
            <p className={T_CAPTION}>⊙ Settled by {expense.settled_by} · {fmtTime(expense.settled_at)}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminTransportExpensePage() {
  const router = useRouter();

  useEffect(() => {
    const a = getAuth();
    if (!a) { router.replace("/login"); return; }
    if (!canAccessAdminNav(a) && a.role !== "HQ") { router.replace("/week"); }
  }, [router]);

  const [statusTab, setStatusTab] = useState("PENDING");
  const [branch, setBranch]       = useState("");
  const [staffFilter, setStaffFilter] = useState("");

  const [expenses, setExpenses]   = useState<Expense[]>([]);
  const [loading, setLoading]     = useState(false);
  const [msg, setMsg]             = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    setLoading(true); setMsg(null);
    const p = new URLSearchParams({ city: "manila" });
    if (statusTab)   p.set("status",      statusTab);
    if (branch)      p.set("branch_code", branch);
    if (staffFilter) p.set("staff_name",  staffFilter);

    fetch(`/api/admin/transport/list?${p}`, { headers: getAuthHeaders(), cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setExpenses(d.expenses ?? []))
      .catch(() => setMsg({ ok: false, text: "Failed to load" }))
      .finally(() => setLoading(false));
  }, [statusTab, branch, staffFilter]);

  useEffect(() => { load(); }, [load]);

  const pendingAll = expenses.length;
  const totalAdv   = expenses.reduce((s, e) => s + Number(e.advance_amount), 0);
  const totalRec   = expenses.reduce((s, e) => s + Number(e.total_receipts ?? 0), 0);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-400 mb-1">ADMIN · MANILA</p>
            <h1 className={T_PAGE_TITLE}>Transport Expense</h1>
            <p className="text-sm text-white/40 mt-1">Review &amp; approve staff advance requests</p>
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:text-white">
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>

        {/* Filters */}
        <div className={`${GLASS_CARD} grid grid-cols-2 gap-3`}>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Branch</label>
            <select className={SELECT_CLASS} value={branch} onChange={(e) => setBranch(e.target.value)}>
              {BRANCHES.map((b) => <option key={b.code} value={b.code}>{b.label}</option>)}
            </select>
          </div>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Staff Name</label>
            <input type="text" className={SELECT_CLASS} placeholder="Search…"
              value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()} />
          </div>
        </div>

        {/* KPI chips */}
        <div className="flex gap-3">
          <div className="flex-1 rounded-xl border border-white/8 bg-white/3 px-3 py-3 text-center">
            <p className="text-2xl font-bold text-white">{pendingAll}</p>
            <p className={`${T_CAPTION} mt-0.5`}>{statusTab || "All"} records</p>
          </div>
          <div className="flex-1 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-3 text-center">
            <p className="text-lg font-bold text-amber-300">{fmtCurrency(totalAdv)}</p>
            <p className={`${T_CAPTION} mt-0.5 text-amber-400/60`}>Total advanced</p>
          </div>
          <div className="flex-1 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-3 text-center">
            <p className="text-lg font-bold text-emerald-300">{fmtCurrency(totalRec)}</p>
            <p className={`${T_CAPTION} mt-0.5 text-emerald-400/60`}>Receipts in</p>
          </div>
        </div>

        {msg && (
          <div className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${msg.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"}`}>
            {msg.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />} {msg.text}
          </div>
        )}

        {/* Status tabs */}
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((t) => (
            <button key={t.key} onClick={() => setStatusTab(t.key)}
              className={statusTab === t.key ? TAB_ACTIVE : TAB_INACTIVE}>
              {t.label}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="space-y-3">
          {loading && (
            <div className="flex justify-center py-8">
              <RefreshCw size={20} className="animate-spin text-white/30" />
            </div>
          )}
          {!loading && expenses.length === 0 && (
            <p className="text-center text-sm text-white/30 py-8">
              No {statusTab.toLowerCase() || ""} requests found.
            </p>
          )}
          {expenses.map((e) => (
            <ExpenseCard key={e.id} expense={e} onAction={load} />
          ))}
        </div>

      </div>
    </main>
  );
}
