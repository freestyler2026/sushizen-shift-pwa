"use client";

import {
  AlertCircle, AlertTriangle, BadgeCheck, Banknote, CalendarDays,
  ChevronLeft, Loader2, Plus, RefreshCw, ReceiptText, Trash2, X, Wand2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getAuth, canAccessPayrollAdmin } from "@/lib/auth";
import { GLASS_CARD, PRIMARY_BUTTON, INPUT_CLASS, SELECT_CLASS, TABLE_HEADER, TABLE_ROW, TABLE_CELL } from "@/lib/ui-tokens";

const API = "/api/admin/manila-payroll";

function apiFetch(path: string, opts?: RequestInit) {
  const auth = getAuth();
  const method = (opts?.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {};
  if (method !== "GET") headers["Content-Type"] = "application/json";
  if (auth?.accessToken) headers["Authorization"] = `Bearer ${auth.accessToken}`;
  return fetch(path, { ...opts, headers: { ...headers, ...(opts?.headers as Record<string, string> ?? {}) } });
}

// ── Types ──────────────────────────────────────────────────────────────────────

type Agency = "SSS" | "PHILHEALTH" | "PAGIBIG" | "BIR";

type Remittance = {
  id: number;
  agency: Agency;
  period_month: number;
  period_year: number;
  period_label: string;
  amount: string;
  employee_count: number;
  due_date: string;
  paid_date: string | null;
  paid_amount: string | null;
  reference_no: string | null;
  notes: string;
  status: "pending" | "paid";
  is_overdue: boolean;
  created_at: string;
  updated_at: string;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const AGENCY_LABELS: Record<Agency, string> = {
  SSS: "SSS",
  PHILHEALTH: "PhilHealth",
  PAGIBIG: "Pag-IBIG",
  BIR: "BIR (WHT)",
};

const AGENCY_COLORS: Record<Agency, string> = {
  SSS:       "bg-blue-900/40 text-blue-300 border-blue-700/50",
  PHILHEALTH:"bg-emerald-900/40 text-emerald-300 border-emerald-700/50",
  PAGIBIG:   "bg-violet-900/40 text-violet-300 border-violet-700/50",
  BIR:       "bg-amber-900/40 text-amber-300 border-amber-700/50",
};

const MONTH_NAMES = ["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmt(amount: string | null) {
  if (!amount) return "—";
  return `₱${parseFloat(amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
}

function statusBadge(r: Remittance) {
  const effective = r.is_overdue ? "overdue" : r.status;
  if (effective === "paid")
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-900/50 px-2.5 py-0.5 text-xs font-medium text-emerald-300"><BadgeCheck size={11}/>Paid</span>;
  if (effective === "overdue")
    return <span className="inline-flex items-center gap-1 rounded-full bg-red-900/50 px-2.5 py-0.5 text-xs font-medium text-red-300"><AlertTriangle size={11}/>Overdue</span>;
  const days = Math.ceil((new Date(r.due_date).getTime() - Date.now()) / 86400000);
  if (days <= 5)
    return <span className="inline-flex items-center gap-1 rounded-full bg-amber-900/50 px-2.5 py-0.5 text-xs font-medium text-amber-300"><AlertCircle size={11}/>Due in {days}d</span>;
  return <span className="inline-flex rounded-full bg-slate-700/60 px-2.5 py-0.5 text-xs font-medium text-slate-300">Pending</span>;
}

// ── Mark as Paid Modal ─────────────────────────────────────────────────────────

function MarkPaidModal({ row, onSaved, onClose }: { row: Remittance; onSaved: (r: Remittance) => void; onClose: () => void }) {
  const [paidDate, setPaidDate]     = useState(row.paid_date ?? new Date().toISOString().slice(0,10));
  const [paidAmount, setPaidAmount] = useState(row.paid_amount ?? row.amount);
  const [refNo, setRefNo]           = useState(row.reference_no ?? "");
  const [notes, setNotes]           = useState(row.notes ?? "");
  const [saving, setSaving]         = useState(false);
  const [err, setErr]               = useState("");

  async function save() {
    if (!paidDate) { setErr("Paid date is required"); return; }
    setSaving(true); setErr("");
    try {
      const r = await apiFetch(`${API}/remittances/${row.id}`, {
        method: "PUT",
        body: JSON.stringify({ status: "paid", paid_date: paidDate, paid_amount: parseFloat(paidAmount as string) || null, reference_no: refNo.trim() || null, notes }),
      });
      if (!r.ok) { setErr(await r.text()); return; }
      onSaved(await r.json() as Remittance);
    } catch (e) { setErr(String(e)); } finally { setSaving(false); }
  }

  const L = "block text-xs font-medium text-slate-400 mb-1";
  const I = INPUT_CLASS + " w-full";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className={GLASS_CARD + " w-full max-w-md"}>
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className="text-base font-semibold text-white">Mark as Paid — {AGENCY_LABELS[row.agency]}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18}/></button>
        </div>
        <div className="space-y-4 px-6 py-5">
          <div className="rounded-lg bg-slate-800/60 px-4 py-3 text-sm text-slate-300">
            <span className="text-slate-400">Period:</span> {MONTH_NAMES[row.period_month]} {row.period_year}
            <span className="ml-4 text-slate-400">Amount due:</span> {fmt(row.amount)}
          </div>
          {err && <p className="rounded bg-red-900/40 px-3 py-2 text-xs text-red-300">{err}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={L}>Paid Date *</label>
              <input className={I} type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)} />
            </div>
            <div>
              <label className={L}>Paid Amount (PHP)</label>
              <input className={I} type="number" min="0" step="0.01" value={paidAmount ?? ""} onChange={e => setPaidAmount(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={L}>Reference / Transaction No.</label>
            <input className={I} value={refNo} onChange={e => setRefNo(e.target.value)} placeholder="e.g. MSS-2026-07-001" />
          </div>
          <div>
            <label className={L}>Notes</label>
            <input className={I} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-white/10 px-6 py-4">
          <button onClick={onClose} disabled={saving} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-400 hover:text-white disabled:opacity-50">Cancel</button>
          <button onClick={() => { void save(); }} disabled={saving} className={PRIMARY_BUTTON + " flex items-center gap-2 text-sm"}>
            {saving ? <Loader2 size={14} className="animate-spin"/> : <BadgeCheck size={14}/>}
            Confirm Payment
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add Remittance Modal ───────────────────────────────────────────────────────

function AddModal({ onSaved, onClose }: { onSaved: (r: Remittance) => void; onClose: () => void }) {
  const now = new Date();
  const [agency,   setAgency]   = useState<Agency>("SSS");
  const [month,    setMonth]    = useState(now.getMonth() + 1);
  const [year,     setYear]     = useState(now.getFullYear());
  const [amount,   setAmount]   = useState("");
  const [dueDate,  setDueDate]  = useState("");
  const [label,    setLabel]    = useState("");
  const [notes,    setNotes]    = useState("");
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState("");

  async function save() {
    if (!amount || !dueDate) { setErr("Amount and due date are required"); return; }
    setSaving(true); setErr("");
    try {
      const r = await apiFetch(`${API}/remittances`, {
        method: "POST",
        body: JSON.stringify({ agency, period_month: month, period_year: year, period_label: label || `${MONTH_NAMES[month]} ${year}`, amount: parseFloat(amount), due_date: dueDate, notes }),
      });
      if (!r.ok) { setErr(await r.text()); return; }
      onSaved(await r.json() as Remittance);
    } catch (e) { setErr(String(e)); } finally { setSaving(false); }
  }

  const L = "block text-xs font-medium text-slate-400 mb-1";
  const I = INPUT_CLASS + " w-full";
  const S = SELECT_CLASS + " w-full";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className={GLASS_CARD + " w-full max-w-md"}>
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className="text-base font-semibold text-white">Add Remittance Record</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18}/></button>
        </div>
        <div className="space-y-4 px-6 py-5">
          {err && <p className="rounded bg-red-900/40 px-3 py-2 text-xs text-red-300">{err}</p>}
          <div>
            <label className={L}>Agency</label>
            <select className={S} value={agency} onChange={e => setAgency(e.target.value as Agency)}>
              <option value="SSS">SSS</option>
              <option value="PHILHEALTH">PhilHealth</option>
              <option value="PAGIBIG">Pag-IBIG (HDMF)</option>
              <option value="BIR">BIR (Withholding Tax)</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={L}>Period Month</label>
              <select className={S} value={month} onChange={e => setMonth(parseInt(e.target.value))}>
                {MONTH_NAMES.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className={L}>Period Year</label>
              <input className={I} type="number" value={year} min={2024} max={2030} onChange={e => setYear(parseInt(e.target.value))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={L}>Total Amount (PHP) *</label>
              <input className={I} type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className={L}>Due Date *</label>
              <input className={I} type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={L}>Period Label (optional)</label>
            <input className={I} value={label} onChange={e => setLabel(e.target.value)} placeholder={`e.g. ${MONTH_NAMES[month]} ${year} 2H`} />
          </div>
          <div>
            <label className={L}>Notes</label>
            <input className={I} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-white/10 px-6 py-4">
          <button onClick={onClose} disabled={saving} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-400 hover:text-white disabled:opacity-50">Cancel</button>
          <button onClick={() => { void save(); }} disabled={saving} className={PRIMARY_BUTTON + " flex items-center gap-2 text-sm"}>
            {saving ? <Loader2 size={14} className="animate-spin"/> : <Plus size={14}/>}
            Add Record
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function RemittancesPage() {
  const router = useRouter();
  const [rows,       setRows]      = useState<Remittance[]>([]);
  const [loading,    setLoading]   = useState(true);
  const [error,      setError]     = useState("");
  const [filterYear, setFilterYear]= useState(new Date().getFullYear());
  const [filterStatus, setFilterStatus] = useState("");
  const [filterAgency, setFilterAgency] = useState("");
  const [showAdd,    setShowAdd]   = useState(false);
  const [markPaid,   setMarkPaid]  = useState<Remittance | null>(null);
  const [deleting,   setDeleting]  = useState<number | null>(null);

  useEffect(() => {
    const auth = getAuth();
    if (!auth || (!canAccessPayrollAdmin(auth) && auth.role !== "HQ" && auth.role !== "ADMIN")) {
      router.replace("/week"); return;
    }
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ year: String(filterYear) });
      if (filterStatus) params.set("status", filterStatus);
      if (filterAgency) params.set("agency", filterAgency);
      const r = await apiFetch(`${API}/remittances?${params}`);
      if (!r.ok) throw new Error(await r.text());
      setRows(await r.json() as Remittance[]);
    } catch (e) { setError(String(e)); } finally { setLoading(false); }
  }, [filterYear, filterStatus, filterAgency]);

  useEffect(() => { void load(); }, [load]);

  async function deleteRow(id: number) {
    if (!confirm("Delete this remittance record?")) return;
    setDeleting(id);
    try {
      await apiFetch(`${API}/remittances/${id}`, { method: "DELETE" });
      setRows(r => r.filter(x => x.id !== id));
    } finally { setDeleting(null); }
  }

  // KPI summary
  const pending = rows.filter(r => r.status !== "paid");
  const overdue = rows.filter(r => r.is_overdue);
  const totalPending = pending.reduce((s, r) => s + parseFloat(r.amount), 0);
  const agencyTotals = (["SSS","PHILHEALTH","PAGIBIG","BIR"] as Agency[]).map(a => ({
    agency: a,
    pending: rows.filter(r => r.agency === a && r.status !== "paid").reduce((s,r) => s + parseFloat(r.amount), 0),
    count: rows.filter(r => r.agency === a && r.status !== "paid").length,
  }));

  const years = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="min-h-screen bg-[#0a0a1a] p-4 text-white md:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/payroll/manila" className="mb-1 flex items-center gap-1 text-sm text-slate-400 hover:text-white">
            <ChevronLeft size={14}/> Manila Payroll
          </Link>
          <div className="flex items-center gap-3">
            <ReceiptText className="text-violet-400" size={26}/>
            <div>
              <h1 className="text-xl font-bold text-white">Remittance Tracking</h1>
              <p className="text-sm text-slate-400">SSS · PhilHealth · Pag-IBIG · BIR — government contribution payments</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { void load(); }} className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 hover:text-white">
            <RefreshCw size={14}/> Refresh
          </button>
          <button onClick={() => setShowAdd(true)} className={PRIMARY_BUTTON + " flex items-center gap-2 text-sm"}>
            <Plus size={14}/> Add Record
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
        <div className={GLASS_CARD + " flex flex-col gap-1 p-4"}>
          <span className="text-xs text-slate-400">Total Pending</span>
          <span className="text-lg font-bold text-white">{fmt(String(totalPending))}</span>
          {overdue.length > 0 && (
            <span className="text-xs font-medium text-red-400">{overdue.length} overdue</span>
          )}
        </div>
        {agencyTotals.map(({ agency, pending: amt, count }) => (
          <div key={agency} className={GLASS_CARD + " flex flex-col gap-1 p-4"}>
            <span className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-xs font-medium ${AGENCY_COLORS[agency]}`}>{AGENCY_LABELS[agency]}</span>
            <span className="text-base font-bold text-white">{amt > 0 ? fmt(String(amt)) : "—"}</span>
            <span className="text-xs text-slate-500">{count > 0 ? `${count} pending` : "All paid"}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className={GLASS_CARD + " mb-4 flex flex-wrap items-center gap-3 p-4"}>
        <div className="flex items-center gap-2">
          <CalendarDays size={14} className="text-slate-400"/>
          <select className={SELECT_CLASS} value={filterYear} onChange={e => setFilterYear(parseInt(e.target.value))}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <select className={SELECT_CLASS} value={filterAgency} onChange={e => setFilterAgency(e.target.value)}>
          <option value="">All agencies</option>
          <option value="SSS">SSS</option>
          <option value="PHILHEALTH">PhilHealth</option>
          <option value="PAGIBIG">Pag-IBIG</option>
          <option value="BIR">BIR</option>
        </select>
        <select className={SELECT_CLASS} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
        </select>
        {(filterStatus || filterAgency) && (
          <button onClick={() => { setFilterStatus(""); setFilterAgency(""); }} className="text-xs text-slate-400 underline hover:text-white">
            Clear filters
          </button>
        )}
        <span className="ml-auto text-xs text-slate-500">{rows.length} records</span>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-900/30 px-4 py-3 text-sm text-red-300">
          <AlertCircle size={16}/> {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-violet-400" size={32}/></div>
      ) : rows.length === 0 ? (
        <div className={GLASS_CARD + " py-16 text-center"}>
          <ReceiptText className="mx-auto mb-3 text-slate-600" size={40}/>
          <p className="text-slate-400">No remittance records for {filterYear}.</p>
          <p className="mt-1 text-xs text-slate-500">Use "Add Record" to create one, or generate from an approved payroll period.</p>
        </div>
      ) : (
        <div className={GLASS_CARD + " overflow-x-auto"}>
          <table className="w-full text-sm">
            <thead>
              <tr className={TABLE_HEADER}>
                <th className="px-4 py-3 text-left">Agency</th>
                <th className="px-4 py-3 text-left">Period</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-left">Due Date</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Paid Date</th>
                <th className="px-4 py-3 text-left">Reference</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} className={TABLE_ROW}>
                  <td className={TABLE_CELL}>
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${AGENCY_COLORS[row.agency]}`}>
                      {AGENCY_LABELS[row.agency]}
                    </span>
                  </td>
                  <td className={TABLE_CELL}>
                    <div className="font-medium">{row.period_label || `${MONTH_NAMES[row.period_month]} ${row.period_year}`}</div>
                    {row.employee_count > 0 && <div className="text-xs text-slate-500">{row.employee_count} employees</div>}
                  </td>
                  <td className={TABLE_CELL + " text-right font-mono font-medium"}>{fmt(row.amount)}</td>
                  <td className={TABLE_CELL}>
                    <span className={row.is_overdue ? "text-red-400" : ""}>{row.due_date}</span>
                  </td>
                  <td className={TABLE_CELL}>{statusBadge(row)}</td>
                  <td className={TABLE_CELL}>
                    {row.paid_date ? (
                      <div>
                        <div>{row.paid_date}</div>
                        {row.paid_amount && <div className="text-xs text-emerald-400">{fmt(row.paid_amount)}</div>}
                      </div>
                    ) : "—"}
                  </td>
                  <td className={TABLE_CELL}>
                    <span className="max-w-[120px] truncate block text-slate-400 text-xs">{row.reference_no || "—"}</span>
                  </td>
                  <td className={TABLE_CELL + " text-right"}>
                    <div className="flex items-center justify-end gap-1">
                      {row.status !== "paid" && (
                        <button
                          onClick={() => setMarkPaid(row)}
                          title="Mark as Paid"
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-emerald-900/40 hover:text-emerald-400 transition-colors"
                        >
                          <BadgeCheck size={15}/>
                        </button>
                      )}
                      <button
                        onClick={() => { void deleteRow(row.id); }}
                        disabled={deleting === row.id}
                        title="Delete"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-red-900/40 hover:text-red-400 transition-colors disabled:opacity-40"
                      >
                        {deleting === row.id ? <Loader2 size={13} className="animate-spin"/> : <Trash2 size={13}/>}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Generate hint */}
      <div className={GLASS_CARD + " mt-4 flex items-center gap-3 p-4 text-sm text-slate-400"}>
        <Wand2 size={16} className="shrink-0 text-violet-400"/>
        <span>
          To auto-generate remittance amounts from a payroll run, go to{" "}
          <Link href="/admin/payroll/manila" className="text-violet-300 underline hover:text-white">
            Manila Payroll
          </Link>{" "}
          → open an approved 2nd-half period → click <strong className="text-slate-300">Generate Remittances</strong>.
        </span>
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between text-xs text-slate-600">
        <Link href="/admin/payroll/manila" className="flex items-center gap-1 hover:text-slate-400">
          <ChevronLeft size={12}/> Back to Manila Payroll
        </Link>
        <span>{rows.length} records loaded</span>
      </div>

      {/* Modals */}
      {showAdd    && <AddModal    onSaved={r => { setRows(prev => [r, ...prev.filter(x => x.id !== r.id)]); setShowAdd(false); }}   onClose={() => setShowAdd(false)}/>}
      {markPaid   && <MarkPaidModal row={markPaid} onSaved={r => { setRows(prev => prev.map(x => x.id === r.id ? r : x)); setMarkPaid(null); }} onClose={() => setMarkPaid(null)}/>}
    </div>
  );
}
