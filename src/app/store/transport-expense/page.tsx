"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  RefreshCw,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { prepareUpload } from "@/lib/image-compress";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import SelectDark from "@/components/SelectDark";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SELECT_CLASS,
  T_CAPTION,
  T_LABEL,
  T_PAGE_TITLE,
} from "@/lib/ui-tokens";

// ─── Constants ────────────────────────────────────────────────────────────────

const BRANCHES = [
  { code: "PAR",  label: "Paranaque" },
  { code: "CUB",  label: "Cubao" },
  { code: "TAFT", label: "Taft" },
];

const DEFAULT_ADVANCE = 1000;

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

function fmtCurrency(n: number): string {
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
  PENDING:  { label: "Pending Approval", color: "border-amber-500/30 bg-amber-500/10 text-amber-300" },
  APPROVED: { label: "Approved",         color: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" },
  REJECTED: { label: "Rejected",         color: "border-red-500/30 bg-red-500/10 text-red-300" },
  SETTLED:  { label: "Settled",          color: "border-sky-500/30 bg-sky-500/10 text-sky-300" },
};

// ─── Receipt Upload Form ───────────────────────────────────────────────────────

function ReceiptUploadPanel({
  expense,
  onUploaded,
}: {
  expense: Expense;
  onUploaded: (updated: Expense) => void;
}) {
  const [amount, setAmount] = useState("");
  const [desc, setDesc]     = useState("");
  const [file, setFile]     = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setMsg({ ok: false, text: "Enter a valid amount" }); return; }
    setUploading(true); setMsg(null);
    try {
      const form = new FormData();
      form.append("amount", String(amt));
      form.append("description", desc);
      form.append("uploaded_by", expense.staff_name);
      if (file) form.append("file", await prepareUpload(file));

      const headers = getAuthHeaders();
      delete (headers as Record<string, string>)["Content-Type"];

      const r = await fetch(`/api/store/transport/${expense.id}/receipt`, {
        method: "POST", headers, body: form,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Upload failed");
      setMsg({ ok: true, text: "Receipt submitted ✓" });
      setAmount(""); setDesc(""); setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      onUploaded(d.expense as Expense);
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setUploading(false);
    }
  };

  const balance = expense.balance ?? (expense.advance_amount - (expense.total_receipts ?? 0));

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-emerald-300">Submit Receipt</p>
        <span className="text-xs text-white/50">
          Balance: <span className={balance <= 0 ? "text-emerald-400 font-semibold" : "text-amber-300 font-semibold"}>{fmtCurrency(balance)}</span>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={`${T_LABEL} mb-1 block`}>Amount (PHP)</label>
          <input type="number" min="1" step="0.01"
            className={SELECT_CLASS} placeholder="0.00"
            value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <label className={`${T_LABEL} mb-1 block`}>Description</label>
          <input type="text" className={SELECT_CLASS} placeholder="Jeepney, Bus, Grab…"
            value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>
      </div>

      <div>
        <label className={`${T_LABEL} mb-1 block`}>Receipt Photo (optional)</label>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*" capture="environment"
            className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button type="button" onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/60 hover:text-white">
            <UploadCloud size={13} /> {file ? file.name : "Choose photo"}
          </button>
          {file && (
            <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }}
              className="text-xs text-red-400 hover:text-red-300">✕</button>
          )}
        </div>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${msg.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>
          {msg.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />} {msg.text}
        </div>
      )}

      <button onClick={submit} disabled={uploading}
        className={`${PRIMARY_BUTTON} w-full py-2 text-sm`}>
        {uploading ? <RefreshCw size={14} className="animate-spin mx-auto" /> : "Submit Receipt"}
      </button>
    </div>
  );
}

// ─── Expense Card ──────────────────────────────────────────────────────────────

function ExpenseCard({
  expense: initialExpense,
}: {
  expense: Expense;
}) {
  const [expense, setExpense] = useState(initialExpense);
  const [open, setOpen]       = useState(false);
  const [detailLoaded, setDetailLoaded] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const meta = STATUS_META[expense.status] ?? STATUS_META["PENDING"];
  const balance = expense.balance ?? (expense.advance_amount - (expense.total_receipts ?? 0));
  const canAddReceipt = expense.status === "APPROVED";

  const loadDetail = async () => {
    if (detailLoaded) return;
    setLoadingDetail(true);
    try {
      const r = await fetch(`/api/store/transport/${expense.id}`, {
        headers: getAuthHeaders(), cache: "no-store",
      });
      const d = await r.json();
      if (r.ok && d.expense) { setExpense(d.expense); setDetailLoaded(true); }
    } finally {
      setLoadingDetail(false);
    }
  };

  const toggle = () => {
    if (!open) loadDetail();
    setOpen(!open);
  };

  return (
    <div className={`rounded-2xl border bg-white/3 ${canAddReceipt ? "border-emerald-500/20" : "border-white/8"}`}>
      {/* Header row */}
      <button type="button" onClick={toggle} className="w-full text-left p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-white">
              {fmtCurrency(expense.advance_amount)} advance
            </p>
            <p className={`${T_CAPTION} mt-0.5`}>
              {fmtDate(expense.request_date)} · {BRANCHES.find((b) => b.code === expense.branch_code)?.label ?? expense.branch_code}
            </p>
            {expense.purpose && (
              <p className="text-xs text-white/40 mt-0.5 truncate max-w-[220px]">{expense.purpose}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.color}`}>
              {meta.label}
            </span>
            {expense.status === "APPROVED" && (
              <span className="text-xs font-semibold text-amber-300">{fmtCurrency(balance)} left</span>
            )}
            {expense.status === "SETTLED" && (
              <span className="text-[10px] text-emerald-400">✓ Settled {fmtDate(expense.settled_at)}</span>
            )}
            {open ? <ChevronUp size={13} className="text-white/40" /> : <ChevronDown size={13} className="text-white/40" />}
          </div>
        </div>
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-white/6 px-4 pb-4 pt-3 space-y-3">
          {loadingDetail && (
            <div className="flex justify-center py-2"><RefreshCw size={14} className="animate-spin text-white/30" /></div>
          )}

          {/* Rejection note */}
          {expense.status === "REJECTED" && expense.rejection_reason && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
              ✗ Rejected: {expense.rejection_reason}
            </p>
          )}

          {/* Receipts */}
          {(expense.receipts && expense.receipts.length > 0) && (
            <div className="space-y-2">
              <p className={`${T_LABEL}`}>Submitted Receipts</p>
              {expense.receipts.map((r, i) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg bg-white/4 px-3 py-2 text-xs">
                  <div>
                    <span className="font-semibold text-white">{fmtCurrency(r.amount)}</span>
                    {r.description && <span className="ml-2 text-white/50">{r.description}</span>}
                    <div className={T_CAPTION}>{fmtTime(r.uploaded_at)}</div>
                  </div>
                  {r.photo_url && (
                    <a href={r.photo_url} target="_blank" rel="noopener noreferrer"
                      className="text-sky-400 hover:text-sky-300 text-[10px] underline">
                      📎 Photo
                    </a>
                  )}
                </div>
              ))}
              <div className="flex justify-between rounded-lg bg-white/5 px-3 py-2 text-xs font-semibold">
                <span className="text-white/50">Total submitted</span>
                <span className="text-white">{fmtCurrency(expense.total_receipts ?? 0)}</span>
              </div>
            </div>
          )}

          {/* Receipt upload */}
          {canAddReceipt && (
            <ReceiptUploadPanel expense={expense} onUploaded={setExpense} />
          )}

          {/* Approval info */}
          {expense.approved_by && (
            <p className={T_CAPTION}>Approved by {expense.approved_by} · {fmtTime(expense.approved_at)}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TransportExpensePage() {
  const router = useRouter();

  useEffect(() => {
    if (!getAuth()) router.replace("/login");
  }, [router]);

  const auth = getAuth();

  const [branch, setBranch]   = useState(BRANCHES[0].code);
  const [staffName, setStaffName] = useState(auth?.staffName || "");
  const [amount, setAmount]   = useState(String(DEFAULT_ADVANCE));
  const [purpose, setPurpose] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg]   = useState<{ ok: boolean; text: string } | null>(null);

  const [myExpenses, setMyExpenses] = useState<Expense[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  const loadMyExpenses = useCallback(async () => {
    if (!staffName.trim()) return;
    setLoadingList(true);
    try {
      const r = await fetch(
        `/api/store/transport/my-requests?city=manila&staff_name=${encodeURIComponent(staffName.trim())}`,
        { headers: getAuthHeaders(), cache: "no-store" }
      );
      const d = await r.json();
      if (r.ok) setMyExpenses(d.expenses ?? []);
    } finally {
      setLoadingList(false);
    }
  }, [staffName]);

  useEffect(() => { loadMyExpenses(); }, [loadMyExpenses]);

  const submitRequest = async () => {
    if (!staffName.trim()) { setSubmitMsg({ ok: false, text: "Enter your name" }); return; }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setSubmitMsg({ ok: false, text: "Enter a valid amount" }); return; }
    if (amt > 5000) { setSubmitMsg({ ok: false, text: "Maximum advance is ₱5,000" }); return; }

    setSubmitting(true); setSubmitMsg(null);
    try {
      const r = await fetch("/api/store/transport/request", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          city: "manila",
          branch_code: branch,
          staff_name: staffName.trim(),
          advance_amount: amt,
          purpose,
        }),
        cache: "no-store",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Request failed");
      setSubmitMsg({ ok: true, text: "Request submitted! Waiting for approval." });
      setAmount(String(DEFAULT_ADVANCE)); setPurpose("");
      loadMyExpenses();
    } catch (e: unknown) {
      setSubmitMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSubmitting(false);
    }
  };

  const pendingCount   = myExpenses.filter((e) => e.status === "PENDING").length;
  const approvedCount  = myExpenses.filter((e) => e.status === "APPROVED").length;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-8">
      <div className="mx-auto max-w-lg space-y-5">

        {/* Header */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-400 mb-1">STORE · MANILA</p>
          <h1 className={T_PAGE_TITLE}>Transport Expense</h1>
          <p className="text-sm text-white/40 mt-1">Request advance &amp; submit receipts</p>
        </div>

        {/* New Request Form */}
        <div className={GLASS_CARD + " space-y-4"}>
          <p className="text-xs font-semibold uppercase tracking-widest text-white/40">New Request</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Your Name</label>
              <input type="text" className={SELECT_CLASS} placeholder="Full name"
                value={staffName} onChange={(e) => setStaffName(e.target.value)} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Branch</label>
              <SelectDark
                className={SELECT_CLASS}
                value={branch}
                onChange={setBranch}
                options={BRANCHES.map((b) => ({ value: b.code, label: b.label }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Amount (PHP)</label>
              <input type="number" min="1" max="5000" step="50"
                className={SELECT_CLASS}
                value={amount} onChange={(e) => setAmount(e.target.value)} />
              <p className={`${T_CAPTION} mt-1`}>Default ₱1,000 · max ₱5,000</p>
            </div>
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Purpose</label>
              <input type="text" className={SELECT_CLASS} placeholder="e.g. Delivery run"
                value={purpose} onChange={(e) => setPurpose(e.target.value)} />
            </div>
          </div>

          {submitMsg && (
            <div className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${
              submitMsg.ok
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-red-500/30 bg-red-500/10 text-red-300"
            }`}>
              {submitMsg.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
              {submitMsg.text}
            </div>
          )}

          <button onClick={submitRequest} disabled={submitting}
            className={`${PRIMARY_BUTTON} w-full`}>
            {submitting ? <RefreshCw size={14} className="animate-spin mx-auto" /> : "Request Advance"}
          </button>
        </div>

        {/* My Requests */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/40">
              My Requests
              {pendingCount > 0 && (
                <span className="ml-2 inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
                  {pendingCount}
                </span>
              )}
              {approvedCount > 0 && (
                <span className="ml-1 inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-semibold text-white">
                  {approvedCount}
                </span>
              )}
            </p>
            <button onClick={loadMyExpenses} disabled={loadingList}
              className="flex items-center gap-1 text-xs text-white/40 hover:text-white">
              <RefreshCw size={11} className={loadingList ? "animate-spin" : ""} /> Refresh
            </button>
          </div>

          {loadingList && (
            <div className="flex justify-center py-6"><RefreshCw size={18} className="animate-spin text-white/30" /></div>
          )}
          {!loadingList && myExpenses.length === 0 && (
            <p className="text-center text-sm text-white/30 py-6">No requests yet. Submit one above.</p>
          )}
          <div className="space-y-3">
            {myExpenses.map((e) => <ExpenseCard key={e.id} expense={e} />)}
          </div>
        </div>

      </div>
    </main>
  );
}
