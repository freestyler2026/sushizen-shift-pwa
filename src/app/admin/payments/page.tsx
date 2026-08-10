"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coins,
  Edit2,
  History,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { canAccessPaymentsAdmin, getAuth, getAuthHeaders } from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  T_PAGE_TITLE,
  TAB_ACTIVE,
  TAB_INACTIVE,
} from "@/lib/ui-tokens";
import type {
  Payment,
  PaymentCategory,
  PaymentCity,
  PaymentMethod,
  PaymentRecurrence,
} from "@/types/payment";
import {
  CATEGORY_LABELS,
  CURRENCY_OPTIONS,
  PAYMENT_METHOD_LABELS,
  RECURRENCE_LABELS,
} from "@/types/payment";

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const parts = d.slice(0, 10).split("-");
  if (parts.length !== 3) return d.slice(0, 10);
  const [y, m, day] = parts;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m) - 1]} ${parseInt(day)}, ${y}`;
}

function fmtAmt(amount: number | null, currency: string): string {
  if (amount == null) return "—";
  return `${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function isOverdue(p: Payment): boolean {
  return !p.is_paid && p.due_date < today();
}

function isDueSoon(p: Payment): boolean {
  const t = today();
  return !p.is_paid && p.due_date >= t && p.due_date <= addDays(t, 7);
}

function addDays(d: string, n: number): string {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().slice(0, 10);
}

function statusLabel(p: Payment): { label: string; color: string } {
  if (p.is_paid) return { label: "Paid", color: "text-emerald-400" };
  if (isOverdue(p)) return { label: "Overdue", color: "text-red-400" };
  if (isDueSoon(p)) return { label: "Due Soon", color: "text-yellow-400" };
  return { label: "Upcoming", color: "text-sky-400" };
}

// ─── empty form ─────────────────────────────────────────────────────────────

function emptyForm() {
  return {
    city: "both" as PaymentCity,
    branch: "",
    category: "other" as PaymentCategory,
    payee_name: "",
    description: "",
    amount: "",
    currency: "AED",
    payment_method: "bank_transfer" as PaymentMethod,
    due_date: "",
    alert_date: "",
    is_recurring: false,
    recurrence: "" as PaymentRecurrence,
    notes: "",
  };
}

// ─── AddPaymentModal ─────────────────────────────────────────────────────────

function AddPaymentModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: Payment | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const auth = getAuth();
  const [form, setForm] = useState(() =>
    editing
      ? {
          city: editing.city,
          branch: editing.branch,
          category: editing.category,
          payee_name: editing.payee_name,
          description: editing.description,
          amount: editing.amount != null ? String(editing.amount) : "",
          currency: editing.currency,
          payment_method: editing.payment_method,
          due_date: editing.due_date,
          alert_date: editing.alert_date ?? "",
          is_recurring: editing.is_recurring,
          recurrence: editing.recurrence,
          notes: editing.notes,
        }
      : emptyForm()
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.due_date) { setError("Due date is required."); return; }
    if (!form.payee_name.trim()) { setError("Payee name is required."); return; }
    setSaving(true);
    setError("");
    try {
      const body = {
        ...form,
        amount: form.amount !== "" ? parseFloat(form.amount) : null,
        alert_date: form.alert_date || null,
        recurrence: form.is_recurring ? form.recurrence : "",
      };
      const url = editing
        ? `${API_BASE}/api/admin/payments/${editing.id}`
        : `${API_BASE}/api/admin/payments`;
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { ...getAuthHeaders(auth), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail || "Failed to save.");
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving payment.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500";
  const labelCls = "block text-xs text-white/60 mb-1";
  const selectCls = inputCls + " appearance-none";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className={`${GLASS_CARD} w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-6`}>
        <h2 className="text-lg font-semibold text-white mb-5">
          {editing ? "Edit Payment" : "Add Payment"}
        </h2>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>City</label>
              <select className={selectCls} value={form.city} onChange={e => set("city", e.target.value)}>
                <option value="both">Both</option>
                <option value="manila">Manila</option>
                <option value="dubai">Dubai</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Branch (optional)</label>
              <input className={inputCls} value={form.branch} onChange={e => set("branch", e.target.value)} placeholder="e.g. SM Aura" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Category</label>
              <select className={selectCls} value={form.category} onChange={e => set("category", e.target.value)}>
                {(Object.entries(CATEGORY_LABELS) as [PaymentCategory, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Payment Method</label>
              <select className={selectCls} value={form.payment_method} onChange={e => set("payment_method", e.target.value)}>
                {(Object.entries(PAYMENT_METHOD_LABELS) as [PaymentMethod, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Payee Name *</label>
            <input className={inputCls} value={form.payee_name} onChange={e => set("payee_name", e.target.value)} placeholder="e.g. Dubai Electricity & Water Authority" required />
          </div>

          <div>
            <label className={labelCls}>Description</label>
            <input className={inputCls} value={form.description} onChange={e => set("description", e.target.value)} placeholder="Optional details" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Amount</label>
              <input className={inputCls} type="number" step="0.01" value={form.amount} onChange={e => set("amount", e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className={labelCls}>Currency</label>
              <select className={selectCls} value={form.currency} onChange={e => set("currency", e.target.value)}>
                {CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Due Date *</label>
              <input className={inputCls} type="date" value={form.due_date} onChange={e => set("due_date", e.target.value)} required />
            </div>
            <div>
              <label className={labelCls}>Alert Date</label>
              <input className={inputCls} type="date" value={form.alert_date} onChange={e => set("alert_date", e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input id="is_recurring" type="checkbox" className="w-4 h-4 accent-sky-500" checked={form.is_recurring} onChange={e => set("is_recurring", e.target.checked)} />
            <label htmlFor="is_recurring" className="text-sm text-white/80">Recurring payment</label>
          </div>

          {form.is_recurring && (
            <div>
              <label className={labelCls}>Recurrence</label>
              <select className={selectCls} value={form.recurrence} onChange={e => set("recurrence", e.target.value)}>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="semi_annual">Semi-Annual</option>
                <option value="annual">Annual</option>
              </select>
            </div>
          )}

          <div>
            <label className={labelCls}>Notes</label>
            <textarea className={inputCls} rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Internal notes..." />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-xl border border-white/20 text-white/70 hover:bg-white/10 text-sm transition">
              Cancel
            </button>
            <button type="submit" disabled={saving} className={`flex-1 py-2 rounded-xl text-sm font-medium transition ${PRIMARY_BUTTON}`}>
              {saving ? "Saving…" : editing ? "Update" : "Add Payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── MarkPaidModal ───────────────────────────────────────────────────────────

function MarkPaidModal({
  payment,
  onClose,
  onSaved,
}: {
  payment: Payment;
  onClose: () => void;
  onSaved: () => void;
}) {
  const auth = getAuth();
  const [paidDate, setPaidDate] = useState(today());
  const [paidAmount, setPaidAmount] = useState(payment.amount != null ? String(payment.amount) : "");
  const [paidRef, setPaidRef] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/payments/${payment.id}/mark-paid`, {
        method: "POST",
        headers: { ...getAuthHeaders(auth), "Content-Type": "application/json" },
        body: JSON.stringify({
          paid_date: paidDate || null,
          paid_amount: paidAmount !== "" ? parseFloat(paidAmount) : null,
          paid_reference: paidRef,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail || "Failed to mark paid.");
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500";
  const labelCls = "block text-xs text-white/60 mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className={`${GLASS_CARD} w-full max-w-sm rounded-2xl p-6`}>
        <h2 className="text-lg font-semibold text-white mb-1">Mark as Paid</h2>
        <p className="text-white/60 text-sm mb-5">{payment.payee_name}</p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className={labelCls}>Paid Date</label>
            <input className={inputCls} type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Amount Paid ({payment.currency})</label>
            <input className={inputCls} type="number" step="0.01" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <label className={labelCls}>Reference / Receipt No.</label>
            <input className={inputCls} value={paidRef} onChange={e => setPaidRef(e.target.value)} placeholder="Optional" />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-xl border border-white/20 text-white/70 hover:bg-white/10 text-sm transition">
              Cancel
            </button>
            <button type="submit" disabled={saving} className={`flex-1 py-2 rounded-xl text-sm font-medium transition ${PRIMARY_BUTTON}`}>
              {saving ? "Saving…" : "Confirm Paid"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── PaymentCard ─────────────────────────────────────────────────────────────

function PaymentCard({
  payment,
  canManage,
  onEdit,
  onMarkPaid,
  onDelete,
}: {
  payment: Payment;
  canManage: boolean;
  onEdit: (p: Payment) => void;
  onMarkPaid: (p: Payment) => void;
  onDelete: (p: Payment) => void;
}) {
  const st = statusLabel(payment);

  return (
    <div className={`${GLASS_CARD} rounded-xl p-4 space-y-2`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-white font-medium text-sm truncate">{payment.payee_name}</p>
          {payment.description && (
            <p className="text-white/50 text-xs truncate">{payment.description}</p>
          )}
        </div>
        <span className={`text-xs font-medium shrink-0 ${st.color}`}>{st.label}</span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/60">
        <span>{CATEGORY_LABELS[payment.category]}</span>
        {payment.branch && <span>{payment.branch}</span>}
        <span className="capitalize">{payment.city}</span>
        {payment.is_recurring && payment.recurrence && (
          <span className="text-sky-400">{RECURRENCE_LABELS[payment.recurrence]}</span>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-white/70">
        <span>Due: <span className="text-white">{fmtDate(payment.due_date)}</span></span>
        {payment.amount != null && (
          <span className="font-medium text-white">{fmtAmt(payment.amount, payment.currency)}</span>
        )}
      </div>

      {payment.alert_date && !payment.is_paid && (
        <p className="text-xs text-amber-400/80">
          Alert from: {fmtDate(payment.alert_date)}
        </p>
      )}

      {payment.is_paid && payment.paid_date && (
        <p className="text-xs text-emerald-400/80">
          Paid {fmtDate(payment.paid_date)}
          {payment.paid_reference ? ` · ${payment.paid_reference}` : ""}
        </p>
      )}

      {canManage && !payment.is_paid && (
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => onMarkPaid(payment)}
            className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition"
          >
            <CheckCircle2 size={14} /> Mark Paid
          </button>
          <button
            onClick={() => onEdit(payment)}
            className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 transition"
          >
            <Edit2 size={14} /> Edit
          </button>
          <button
            onClick={() => onDelete(payment)}
            className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition ml-auto"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

const TABS = ["schedule", "history"] as const;
type Tab = (typeof TABS)[number];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function PaymentsPage() {
  const router = useRouter();
  const auth = getAuth();
  const canManage = (() => {
    if (!auth) return false;
    const role = String(auth.role || "").toUpperCase();
    if (role === "HQ" || role === "ADMIN") return true;
    const perms: string[] = (auth as unknown as { permissions?: string[] }).permissions ?? [];
    return perms.includes("channel.admin.payments.manage");
  })();

  useEffect(() => {
    if (!canAccessPaymentsAdmin(auth)) router.replace("/admin");
  }, [auth, router]);

  const [tab, setTab] = useState<Tab>("schedule");

  // Schedule filters
  const nowRef = useRef(new Date());
  const [scheduleYear, setScheduleYear] = useState(nowRef.current.getFullYear());
  const [scheduleMonth, setScheduleMonth] = useState(nowRef.current.getMonth() + 1);
  const [filterCity, setFilterCity] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");

  // History filters
  const [histYear, setHistYear] = useState(nowRef.current.getFullYear());
  const [histMonth, setHistMonth] = useState(nowRef.current.getMonth() + 1);

  const [scheduleRows, setScheduleRows] = useState<Payment[]>([]);
  const [historyRows, setHistoryRows] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Payment | null>(null);
  const [markPaidTarget, setMarkPaidTarget] = useState<Payment | null>(null);

  const fetchSchedule = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        year: String(scheduleYear),
        month: String(scheduleMonth),
        limit: "200",
      });
      if (filterCity !== "all") params.set("city", filterCity);
      if (filterCategory !== "all") params.set("category", filterCategory);
      const res = await fetch(`${API_BASE}/api/admin/payments?${params}`, {
        headers: getAuthHeaders(auth),
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json() as { rows: Payment[] };
      setScheduleRows(data.rows ?? []);
    } finally {
      setLoading(false);
    }
  }, [auth, scheduleYear, scheduleMonth, filterCity, filterCategory]);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ year: String(histYear), month: String(histMonth), limit: "200" });
      const res = await fetch(`${API_BASE}/api/admin/payments/history?${params}`, {
        headers: getAuthHeaders(auth),
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json() as { rows: Payment[] };
      setHistoryRows(data.rows ?? []);
    } finally {
      setLoading(false);
    }
  }, [auth, histYear, histMonth]);

  useEffect(() => { if (tab === "schedule") void fetchSchedule(); }, [tab, fetchSchedule]);
  useEffect(() => { if (tab === "history") void fetchHistory(); }, [tab, fetchHistory]);

  async function handleDelete(p: Payment) {
    if (!confirm(`Delete "${p.payee_name}"?`)) return;
    await fetch(`${API_BASE}/api/admin/payments/${p.id}`, {
      method: "DELETE",
      headers: getAuthHeaders(auth),
    });
    void fetchSchedule();
  }

  // Group schedule rows
  const overdue = scheduleRows.filter(isOverdue);
  const dueSoon = scheduleRows.filter(isDueSoon);
  const upcoming = scheduleRows.filter(p => !p.is_paid && !isOverdue(p) && !isDueSoon(p));
  const paidThisMonth = scheduleRows.filter(p => p.is_paid);

  const monthLabel = `${MONTHS[scheduleMonth - 1]} ${scheduleYear}`;

  function stepScheduleMonth(dir: 1 | -1) {
    let m = scheduleMonth + dir;
    let y = scheduleYear;
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    setScheduleMonth(m);
    setScheduleYear(y);
  }

  function stepHistMonth(dir: 1 | -1) {
    let m = histMonth + dir;
    let y = histYear;
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    setHistMonth(m);
    setHistYear(y);
  }

  const selectCls = "bg-white/10 border border-white/20 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none";

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 pb-24">
      <div className="max-w-2xl mx-auto px-4 pt-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Coins size={24} className="text-sky-400 shrink-0" />
          <h1 className={T_PAGE_TITLE}>Payment Schedule</h1>
          <button onClick={() => tab === "schedule" ? void fetchSchedule() : void fetchHistory()} className="ml-auto text-white/40 hover:text-white/70 transition">
            <RefreshCw size={16} />
          </button>
          {canManage && tab === "schedule" && (
            <button onClick={() => setAddOpen(true)} className={`flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg ${PRIMARY_BUTTON}`}>
              <Plus size={15} /> Add
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white/5 rounded-xl p-1">
          <button onClick={() => setTab("schedule")} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition ${tab === "schedule" ? TAB_ACTIVE : TAB_INACTIVE}`}>
            <Calendar size={15} /> Schedule
          </button>
          <button onClick={() => setTab("history")} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition ${tab === "history" ? TAB_ACTIVE : TAB_INACTIVE}`}>
            <History size={15} /> History
          </button>
        </div>

        {/* ── Schedule Tab ── */}
        {tab === "schedule" && (
          <>
            {/* Month navigator */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => stepScheduleMonth(-1)} className="p-1 text-white/50 hover:text-white transition">
                <ChevronLeft size={20} />
              </button>
              <span className="text-white font-medium text-sm">{monthLabel}</span>
              <button onClick={() => stepScheduleMonth(1)} className="p-1 text-white/50 hover:text-white transition">
                <ChevronRight size={20} />
              </button>
            </div>

            {/* Filters */}
            <div className="flex gap-2 mb-5">
              <select className={selectCls} value={filterCity} onChange={e => setFilterCity(e.target.value)}>
                <option value="all">All Cities</option>
                <option value="manila">Manila</option>
                <option value="dubai">Dubai</option>
              </select>
              <select className={selectCls} value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                <option value="all">All Categories</option>
                {(Object.entries(CATEGORY_LABELS) as [string, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            {loading && <p className="text-white/40 text-sm text-center py-8">Loading…</p>}

            {!loading && scheduleRows.length === 0 && (
              <div className="text-center py-16 text-white/40">
                <Coins size={40} className="mx-auto mb-3 opacity-30" />
                <p>No payments for {monthLabel}.</p>
                {canManage && (
                  <button onClick={() => setAddOpen(true)} className="mt-4 text-sky-400 text-sm underline">Add a payment</button>
                )}
              </div>
            )}

            {overdue.length > 0 && (
              <section className="mb-5">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={15} className="text-red-400" />
                  <h2 className="text-red-400 text-sm font-semibold">Overdue ({overdue.length})</h2>
                </div>
                <div className="space-y-3">
                  {overdue.map(p => (
                    <PaymentCard key={p.id} payment={p} canManage={canManage}
                      onEdit={setEditTarget} onMarkPaid={setMarkPaidTarget} onDelete={handleDelete} />
                  ))}
                </div>
              </section>
            )}

            {dueSoon.length > 0 && (
              <section className="mb-5">
                <div className="flex items-center gap-2 mb-3">
                  <Clock size={15} className="text-yellow-400" />
                  <h2 className="text-yellow-400 text-sm font-semibold">Due Soon ({dueSoon.length})</h2>
                </div>
                <div className="space-y-3">
                  {dueSoon.map(p => (
                    <PaymentCard key={p.id} payment={p} canManage={canManage}
                      onEdit={setEditTarget} onMarkPaid={setMarkPaidTarget} onDelete={handleDelete} />
                  ))}
                </div>
              </section>
            )}

            {upcoming.length > 0 && (
              <section className="mb-5">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar size={15} className="text-sky-400" />
                  <h2 className="text-sky-400 text-sm font-semibold">Upcoming ({upcoming.length})</h2>
                </div>
                <div className="space-y-3">
                  {upcoming.map(p => (
                    <PaymentCard key={p.id} payment={p} canManage={canManage}
                      onEdit={setEditTarget} onMarkPaid={setMarkPaidTarget} onDelete={handleDelete} />
                  ))}
                </div>
              </section>
            )}

            {paidThisMonth.length > 0 && (
              <section className="mb-5">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 size={15} className="text-emerald-400" />
                  <h2 className="text-emerald-400 text-sm font-semibold">Paid This Month ({paidThisMonth.length})</h2>
                </div>
                <div className="space-y-3">
                  {paidThisMonth.map(p => (
                    <PaymentCard key={p.id} payment={p} canManage={canManage}
                      onEdit={setEditTarget} onMarkPaid={setMarkPaidTarget} onDelete={handleDelete} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* ── History Tab ── */}
        {tab === "history" && (
          <>
            <div className="flex items-center justify-between mb-5">
              <button onClick={() => stepHistMonth(-1)} className="p-1 text-white/50 hover:text-white transition">
                <ChevronLeft size={20} />
              </button>
              <span className="text-white font-medium text-sm">{MONTHS[histMonth - 1]} {histYear}</span>
              <button onClick={() => stepHistMonth(1)} className="p-1 text-white/50 hover:text-white transition">
                <ChevronRight size={20} />
              </button>
            </div>

            {loading && <p className="text-white/40 text-sm text-center py-8">Loading…</p>}

            {!loading && historyRows.length === 0 && (
              <div className="text-center py-16 text-white/40">
                <History size={40} className="mx-auto mb-3 opacity-30" />
                <p>No paid payments for {MONTHS[histMonth - 1]} {histYear}.</p>
              </div>
            )}

            <div className="space-y-3">
              {historyRows.map(p => (
                <div key={p.id} className={`${GLASS_CARD} rounded-xl p-4`}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium text-sm truncate">{p.payee_name}</p>
                      {p.description && <p className="text-white/50 text-xs truncate">{p.description}</p>}
                    </div>
                    {p.amount != null && (
                      <p className="text-emerald-400 text-sm font-medium shrink-0">{fmtAmt(p.amount, p.currency)}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-white/50">
                    <span>{CATEGORY_LABELS[p.category]}</span>
                    <span className="capitalize">{p.city}</span>
                    {p.is_recurring && <span className="text-sky-400">{RECURRENCE_LABELS[p.recurrence]}</span>}
                  </div>
                  <div className="mt-1 text-xs text-white/60">
                    Paid: <span className="text-white">{fmtDate(p.paid_date)}</span>
                    {p.paid_reference ? <span className="text-white/40"> · {p.paid_reference}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {(addOpen || editTarget) && (
        <AddPaymentModal
          editing={editTarget}
          onClose={() => { setAddOpen(false); setEditTarget(null); }}
          onSaved={() => { void fetchSchedule(); }}
        />
      )}
      {markPaidTarget && (
        <MarkPaidModal
          payment={markPaidTarget}
          onClose={() => setMarkPaidTarget(null)}
          onSaved={() => { void fetchSchedule(); }}
        />
      )}
    </main>
  );
}
