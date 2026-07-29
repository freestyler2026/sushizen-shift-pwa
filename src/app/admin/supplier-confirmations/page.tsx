"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";
import {
  GLASS_CARD,
  SMALL_BUTTON,
  INPUT_CLASS,
  TEXTAREA_CLASS,
  T_PAGE_TITLE,
  T_SECTION,
  T_CAPTION,
  T_LABEL,
} from "@/lib/ui-tokens";
import { Phone, RefreshCw, X, CheckCircle2, Clock, AlertCircle, Package, MessageSquare } from "lucide-react";
import SelectDark from "@/components/SelectDark";

type SubResult =
  | "confirmed" | "partial" | "out_of_stock" | "rescheduled" | "cancelled"
  | "no_answer" | "message_sent";

type PendingPoRow = {
  id: string;
  po_no: string;
  vendor_name: string;
  amount: number;
  delivery_date?: string;
  po_status: string;
  supplier_confirmation_status: string;
  supplier_confirmation_notes: string;
  created_at: string;
  request_id: string;
  request_no: string;
  store_code: string;
  city: string;
};

type CallLog = {
  id: number;
  call_date: string;
  called_by: string;
  call_time: string;
  result: string;
  expected_delivery_date?: string;
  notes: string;
  connected?: boolean | null;
  items_affected?: string | null;
  alt_supplier?: string | null;
  retry_at?: string | null;
  escalated_to?: string | null;
  channel?: string | null;
  cancel_reason?: string | null;
  call_attempt?: number;
};

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; bg: string; border: string; text: string; cardBorder: string }> = {
  confirmed:    { label: "✓ Confirmed",    bg: "bg-emerald-900/40", border: "border-emerald-700/50", text: "text-emerald-300",  cardBorder: "border-emerald-500/20" },
  partial:      { label: "⚠ Partial",      bg: "bg-yellow-900/40",  border: "border-yellow-700/50",  text: "text-yellow-300",   cardBorder: "border-yellow-500/30" },
  out_of_stock: { label: "📦 Out of Stock", bg: "bg-rose-900/40",    border: "border-rose-700/50",    text: "text-rose-300",     cardBorder: "border-rose-500/40" },
  rescheduled:  { label: "↻ Rescheduled",  bg: "bg-amber-900/40",   border: "border-amber-700/50",   text: "text-amber-300",    cardBorder: "border-amber-500/20" },
  cancelled:    { label: "✕ Cancelled",    bg: "bg-red-900/40",     border: "border-red-700/50",     text: "text-red-300",      cardBorder: "border-red-500/40" },
  no_answer:    { label: "✗ No Answer",    bg: "bg-orange-900/40",  border: "border-orange-700/50",  text: "text-orange-300",   cardBorder: "border-orange-500/30" },
  message_sent: { label: "✉ Msg Sent",     bg: "bg-blue-900/40",    border: "border-blue-700/50",    text: "text-blue-300",     cardBorder: "border-blue-500/20" },
};

function confBadge(status: string) {
  const m = STATUS_META[status];
  if (m) return (
    <span className={`rounded-full ${m.bg} ${m.border} border px-2 py-0.5 text-[10px] font-semibold ${m.text}`}>
      {m.label}
    </span>
  );
  return <span className="rounded-full bg-zinc-800 border border-zinc-600 px-2 py-0.5 text-[10px] font-semibold text-zinc-400">Call Pending</span>;
}

function resultLabel(r: string) {
  return STATUS_META[r]?.label ?? r;
}

const STATUS_SORT: Record<string, number> = {
  out_of_stock: 0, cancelled: 1, no_answer: 2, partial: 3,
  message_sent: 4, pending: 5, rescheduled: 6,
};

// ── Connected outcome options ─────────────────────────────────────────────────
const CONNECTED_OUTCOMES: { val: SubResult; label: string; color: string }[] = [
  { val: "confirmed",    label: "✅ Confirmed",     color: "emerald" },
  { val: "partial",      label: "⚠️ Partial",       color: "yellow" },
  { val: "out_of_stock", label: "📦 Out of Stock",  color: "rose" },
  { val: "rescheduled",  label: "🔄 Rescheduled",   color: "amber" },
  { val: "cancelled",    label: "❌ Cancelled",      color: "red" },
];

const NOT_CONNECTED_OUTCOMES: { val: SubResult; label: string; color: string }[] = [
  { val: "no_answer",    label: "📵 No Answer",     color: "orange" },
  { val: "message_sent", label: "✉️ Message Sent",  color: "blue" },
];

const COLOR_MAP: Record<string, string> = {
  emerald: "border-emerald-600 bg-emerald-900/40 text-emerald-300",
  yellow:  "border-yellow-600  bg-yellow-900/40  text-yellow-300",
  rose:    "border-rose-600    bg-rose-900/40    text-rose-300",
  amber:   "border-amber-600   bg-amber-900/40   text-amber-300",
  red:     "border-red-600     bg-red-900/40     text-red-300",
  orange:  "border-orange-600  bg-orange-900/40  text-orange-300",
  blue:    "border-blue-600    bg-blue-900/40    text-blue-300",
};

// ─────────────────────────────────────────────────────────────────────────────

export default function SupplierConfirmationsPage() {
  const auth = useMemo(() => getAuth(), []);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [rows, setRows] = useState<PendingPoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmedToday, setConfirmedToday] = useState(0);

  // Modal
  const [modal, setModal] = useState<PendingPoRow | null>(null);
  const [callLog, setCallLog] = useState<CallLog[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [subResult, setSubResult] = useState<SubResult | null>(null);
  const [callTime, setCallTime] = useState("");
  const [expDate, setExpDate] = useState("");
  const [notes, setNotes] = useState("");
  const [itemsAffected, setItemsAffected] = useState("");
  const [altSupplier, setAltSupplier] = useState("");
  const [retryAt, setRetryAt] = useState("");
  const [escalatedTo, setEscalatedTo] = useState("");
  const [channel, setChannel] = useState("WhatsApp");
  const [cancelReason, setCancelReason] = useState("Supplier issue");
  const [busy, setBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await procurementJson<{ ok: boolean; rows: PendingPoRow[] }>(
        "/api/admin/supplier-confirmation/pending?city=manila",
        { method: "GET" },
        requestedBy,
        pin,
      );
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e: unknown) {
      setError(String((e as Error)?.message || e));
    } finally {
      setLoading(false);
    }
  }, [requestedBy, pin]);

  useEffect(() => {
    void (async () => {
      const refreshed = await refreshAuthFromApi();
      if (refreshed?.staffName && !requestedBy.trim()) setRequestedBy(refreshed.staffName);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (requestedBy.trim() && pin.trim()) void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetModal = () => {
    setConnected(null);
    setSubResult(null);
    setCallTime("");
    setExpDate("");
    setNotes("");
    setItemsAffected("");
    setAltSupplier("");
    setRetryAt("");
    setEscalatedTo("");
    setChannel("WhatsApp");
    setCancelReason("Supplier issue");
    setSaveMsg("");
  };

  const openModal = async (row: PendingPoRow) => {
    setModal(row);
    resetModal();
    try {
      const data = await procurementJson<{ ok: boolean; calls: CallLog[] }>(
        `/api/admin/supplier-confirmation/${encodeURIComponent(row.id)}/calls`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      setCallLog(data?.calls || []);
    } catch { setCallLog([]); }
  };

  const setStep1 = (c: boolean) => {
    setConnected(c);
    setSubResult(null);
  };

  const setStep2 = (r: SubResult) => {
    setSubResult(r);
  };

  const canSave = subResult !== null && !busy;

  const submitCall = async () => {
    if (!modal || !subResult) return;
    setBusy(true);
    setSaveMsg("");
    try {
      await procurementJson(
        "/api/admin/supplier-confirmation/log",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            po_id: modal.id,
            called_by: requestedBy.trim() || auth?.staffName || "",
            result: subResult,
            connected,
            call_time: callTime.trim(),
            expected_delivery_date: expDate || null,
            notes: notes.trim(),
            items_affected: itemsAffected.trim() || null,
            alt_supplier: altSupplier.trim() || null,
            retry_at: retryAt || null,
            escalated_to: escalatedTo.trim() || null,
            channel: channel || null,
            cancel_reason: cancelReason || null,
          }),
        },
        requestedBy,
        pin,
      );
      setSaveMsg("Saved.");
      setRows((prev) =>
        prev.map((r) => r.id === modal.id ? { ...r, supplier_confirmation_status: subResult } : r)
      );
      if (subResult === "confirmed") {
        setTimeout(() => {
          setRows((prev) => prev.filter((r) => r.id !== modal.id));
          setModal(null);
          setConfirmedToday((n) => n + 1);
        }, 1000);
      }
    } catch (e: unknown) {
      setSaveMsg("Error: " + String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  };

  // Sorted list: problem statuses first, then by delivery date
  const sortedRows = [...rows].sort((a, b) => {
    const pa = STATUS_SORT[a.supplier_confirmation_status] ?? 9;
    const pb = STATUS_SORT[b.supplier_confirmation_status] ?? 9;
    if (pa !== pb) return pa - pb;
    if (a.delivery_date && b.delivery_date) return a.delivery_date.localeCompare(b.delivery_date);
    if (a.delivery_date) return -1;
    if (b.delivery_date) return 1;
    return 0;
  });

  const cnt = (s: string) => rows.filter((r) => r.supplier_confirmation_status === s).length;

  const kpis = [
    { label: "Pending",       count: cnt("pending"),       color: "text-amber-400" },
    { label: "No Answer",     count: cnt("no_answer"),     color: "text-orange-400" },
    { label: "Out of Stock",  count: cnt("out_of_stock"),  color: "text-rose-400" },
    { label: "Rescheduled",   count: cnt("rescheduled"),   color: "text-amber-300" },
    { label: "Confirmed ✓",   count: confirmedToday,       color: "text-emerald-400" },
  ];

  const outcomeBtn = (o: { val: SubResult; label: string; color: string }) => (
    <button
      key={o.val}
      type="button"
      onClick={() => setStep2(o.val)}
      className={`flex-1 rounded-xl border py-2 text-xs font-semibold transition-all ${
        subResult === o.val
          ? COLOR_MAP[o.color]
          : "border-white/10 bg-white/3 text-zinc-400 hover:bg-white/6"
      }`}
    >
      {o.label}
    </button>
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <h1 className={T_PAGE_TITLE}>Supplier Confirmation Calls</h1>
        <p className="text-sm text-zinc-400 mt-1">Manila only — Log pre-delivery confirmation calls to vendors.</p>
      </div>

      {/* Auth + load */}
      <div className={`${GLASS_CARD} p-4 mb-6`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Your Name</label>
            <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>PIN</label>
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••••••" className={INPUT_CLASS} />
          </div>
          <div className="flex items-end">
            <button type="button" onClick={() => void load()} disabled={loading} className={`${SMALL_BUTTON} w-full flex items-center justify-center gap-2`}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </div>

      {/* KPI cards — 5 */}
      {(rows.length > 0 || confirmedToday > 0) && (
        <div className="grid grid-cols-5 gap-3 mb-6">
          {kpis.map((k) => (
            <div key={k.label} className={`${GLASS_CARD} p-4 text-center`}>
              <p className={`text-2xl font-bold ${k.color}`}>{k.count}</p>
              <p className={T_CAPTION}>{k.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* PO list */}
      {rows.length === 0 && !loading ? (
        <div className={`${GLASS_CARD} p-10 flex flex-col items-center gap-2`}>
          <CheckCircle2 className="h-8 w-8 text-emerald-500/50" />
          <p className={T_CAPTION}>No pending confirmation calls. All caught up!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedRows.map((row) => {
            const statusBorder = STATUS_META[row.supplier_confirmation_status]?.cardBorder ?? "";
            return (
              <div
                key={row.id}
                className={`${GLASS_CARD} p-4 cursor-pointer hover:border-violet-500/30 transition-colors ${statusBorder}`}
                onClick={() => void openModal(row)}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-semibold text-white">{row.po_no}</span>
                      {confBadge(row.supplier_confirmation_status)}
                    </div>
                    <p className={T_CAPTION}>{row.vendor_name} | {row.store_code} | {row.request_no}</p>
                    {row.delivery_date && (
                      <p className={`text-xs mt-0.5 flex items-center gap-1 ${
                        row.delivery_date <= new Date().toISOString().slice(0, 10) ? "text-amber-400" : "text-zinc-400"
                      }`}>
                        <Clock className="h-3 w-3" />Delivery: {row.delivery_date}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); void openModal(row); }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-violet-700/50 bg-violet-900/25 px-3 py-1.5 text-xs font-semibold text-violet-300 hover:bg-violet-900/40 shrink-0"
                  >
                    <Phone className="h-3 w-3" />
                    Log Call
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal ──────────────────────────────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 shadow-2xl flex flex-col max-h-[92vh]">

            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4 shrink-0">
              <div>
                <p className="text-sm font-semibold text-white flex items-center gap-2">
                  <Phone className="h-4 w-4 text-violet-400" />
                  Log Confirmation Call
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">{modal.po_no} — {modal.vendor_name}</p>
                {modal.delivery_date && (
                  <p className="text-xs text-amber-400 mt-0.5"><Clock className="inline h-3 w-3 mr-1" />Delivery: {modal.delivery_date}</p>
                )}
              </div>
              <button type="button" onClick={() => setModal(null)} className="rounded-lg p-1.5 text-zinc-500 hover:text-white hover:bg-white/8">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body — scrollable */}
            <div className="overflow-y-auto px-5 py-4 space-y-5">

              {/* Step 1: Connected? */}
              <div>
                <p className="text-xs font-semibold text-zinc-300 mb-2">1. Were you able to reach them?</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setStep1(true)}
                    className={`rounded-xl border py-2.5 text-xs font-semibold transition-all ${
                      connected === true
                        ? "border-emerald-600 bg-emerald-900/40 text-emerald-300"
                        : "border-white/10 bg-white/3 text-zinc-400 hover:bg-white/6"
                    }`}
                  >
                    ✅ Yes — Connected
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep1(false)}
                    className={`rounded-xl border py-2.5 text-xs font-semibold transition-all ${
                      connected === false
                        ? "border-red-600 bg-red-900/40 text-red-300"
                        : "border-white/10 bg-white/3 text-zinc-400 hover:bg-white/6"
                    }`}
                  >
                    📵 No — Not Connected
                  </button>
                </div>
              </div>

              {/* Step 2A: Connected outcomes */}
              {connected === true && (
                <div>
                  <p className="text-xs font-semibold text-zinc-300 mb-2">2. What was the outcome?</p>
                  <div className="grid grid-cols-3 gap-2">
                    {CONNECTED_OUTCOMES.slice(0, 3).map(outcomeBtn)}
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {CONNECTED_OUTCOMES.slice(3).map(outcomeBtn)}
                  </div>
                </div>
              )}

              {/* Step 2B: Not connected outcomes */}
              {connected === false && (
                <div>
                  <p className="text-xs font-semibold text-zinc-300 mb-2">2. What did you do?</p>
                  <div className="grid grid-cols-2 gap-2">
                    {NOT_CONNECTED_OUTCOMES.map(outcomeBtn)}
                  </div>
                </div>
              )}

              {/* Step 3: Context-specific fields */}
              {subResult && (
                <>
                  {/* Partial / Out of Stock */}
                  {(subResult === "partial" || subResult === "out_of_stock") && (
                    <div className="rounded-xl border border-white/8 bg-white/3 p-3 space-y-3">
                      <div>
                        <label className={`${T_LABEL} mb-1.5 block`}>
                          Items Affected <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="text"
                          value={itemsAffected}
                          onChange={(e) => setItemsAffected(e.target.value)}
                          placeholder="e.g. Tuna 5kg, Salmon 3kg"
                          className={INPUT_CLASS}
                        />
                      </div>
                      {subResult === "out_of_stock" && (
                        <div>
                          <label className={`${T_LABEL} mb-1.5 block`}>Alternative Supplier Being Contacted</label>
                          <input
                            type="text"
                            value={altSupplier}
                            onChange={(e) => setAltSupplier(e.target.value)}
                            placeholder="Supplier name (or leave blank)"
                            className={INPUT_CLASS}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Rescheduled */}
                  {subResult === "rescheduled" && (
                    <div className="rounded-xl border border-white/8 bg-white/3 p-3">
                      <label className={`${T_LABEL} mb-1.5 block`}>
                        New Delivery Date <span className="text-red-400">*</span>
                      </label>
                      <input type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} className={INPUT_CLASS} />
                    </div>
                  )}

                  {/* Cancelled */}
                  {subResult === "cancelled" && (
                    <div className="rounded-xl border border-white/8 bg-white/3 p-3 space-y-3">
                      <div>
                        <label className={`${T_LABEL} mb-1.5 block`}>
                          Reason <span className="text-red-400">*</span>
                        </label>
                        <SelectDark
                          value={cancelReason}
                          onChange={setCancelReason}
                          options={[
                            { value: "Supplier issue", label: "Supplier issue" },
                            { value: "Price dispute", label: "Price dispute" },
                            { value: "Out of stock", label: "Out of stock" },
                            { value: "Other", label: "Other" },
                          ]}
                        />
                      </div>
                      <div>
                        <label className={`${T_LABEL} mb-1.5 block`}>Escalated to</label>
                        <input
                          type="text"
                          value={escalatedTo}
                          onChange={(e) => setEscalatedTo(e.target.value)}
                          placeholder="Name or role of person handling this"
                          className={INPUT_CLASS}
                        />
                      </div>
                    </div>
                  )}

                  {/* No Answer */}
                  {subResult === "no_answer" && (
                    <div className="rounded-xl border border-white/8 bg-white/3 p-3 space-y-3">
                      <div>
                        <label className={`${T_LABEL} mb-1.5 block`}>Retry at (scheduled time)</label>
                        <input type="time" value={retryAt} onChange={(e) => setRetryAt(e.target.value)} className={INPUT_CLASS} />
                      </div>
                      <div>
                        <label className={`${T_LABEL} mb-1.5 block`}>Escalate to (optional)</label>
                        <input
                          type="text"
                          value={escalatedTo}
                          onChange={(e) => setEscalatedTo(e.target.value)}
                          placeholder="Leave blank if retrying yourself"
                          className={INPUT_CLASS}
                        />
                      </div>
                    </div>
                  )}

                  {/* Message Sent */}
                  {subResult === "message_sent" && (
                    <div className="rounded-xl border border-white/8 bg-white/3 p-3 space-y-3">
                      <div>
                        <label className={`${T_LABEL} mb-1.5 block`}>
                          Channel <span className="text-red-400">*</span>
                        </label>
                        <SelectDark
                          value={channel}
                          onChange={setChannel}
                          options={[
                            { value: "WhatsApp", label: "WhatsApp" },
                            { value: "Email", label: "Email" },
                            { value: "Other", label: "Other" },
                          ]}
                        />
                      </div>
                    </div>
                  )}

                  {/* Common fields */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={`${T_LABEL} mb-1.5 block`}>Call Time</label>
                      <input type="time" value={callTime} onChange={(e) => setCallTime(e.target.value)} className={INPUT_CLASS} />
                    </div>
                    {subResult === "confirmed" && (
                      <div>
                        <label className={`${T_LABEL} mb-1.5 block`}>Expected Delivery</label>
                        <input type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} className={INPUT_CLASS} />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className={`${T_LABEL} mb-1.5 block`}>Notes</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={
                        subResult === "confirmed"    ? "Contact person, agreed window, etc." :
                        subResult === "out_of_stock" ? "Which alternative supplier? Any workaround?" :
                        subResult === "cancelled"    ? "Details of cancellation, next steps…" :
                        subResult === "no_answer"    ? "Tried at what time? Other contact tried?" :
                        "Additional notes…"
                      }
                      rows={2}
                      className={TEXTAREA_CLASS}
                    />
                  </div>
                </>
              )}

              {/* Save feedback */}
              {saveMsg && (
                <div className={`rounded-xl border px-4 py-2 text-sm ${
                  saveMsg.startsWith("Error")
                    ? "border-red-700/50 bg-red-900/20 text-red-300"
                    : "border-emerald-700/50 bg-emerald-900/20 text-emerald-300"
                }`}>
                  {saveMsg}
                </div>
              )}

              {/* Previous Calls */}
              {callLog.length > 0 && (
                <div>
                  <p className={`${T_SECTION} mb-2`}>Previous Calls ({callLog.length})</p>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {callLog.map((c) => (
                      <div key={c.id} className="rounded-xl border border-white/6 bg-white/3 px-3 py-2 text-xs text-zinc-300">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{resultLabel(c.result)}</span>
                          {c.call_attempt && c.call_attempt > 1 && (
                            <span className="text-[10px] text-zinc-500 bg-white/5 rounded px-1">attempt {c.call_attempt}</span>
                          )}
                          <span className="text-zinc-500">{c.call_date}{c.call_time ? ` ${c.call_time}` : ""} · {c.called_by}</span>
                        </div>
                        {c.items_affected && <p className="text-zinc-400 mt-0.5">Items: {c.items_affected}</p>}
                        {c.alt_supplier && <p className="text-zinc-400">Alt. supplier: {c.alt_supplier}</p>}
                        {c.retry_at && <p className="text-amber-400/80">Retry at: {c.retry_at}</p>}
                        {c.escalated_to && <p className="text-zinc-400">Escalated to: {c.escalated_to}</p>}
                        {c.channel && <p className="text-blue-400/80">Via: {c.channel}</p>}
                        {c.notes && <p className="text-zinc-500 mt-0.5">{c.notes}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-3 border-t border-white/8 px-5 py-4 shrink-0">
              <button
                type="button"
                onClick={() => void submitCall()}
                disabled={!canSave}
                className="flex-1 rounded-xl border border-violet-600/50 bg-violet-700/30 py-2.5 text-sm font-semibold text-violet-200 hover:bg-violet-700/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy ? "Saving…" : subResult ? `Save — ${STATUS_META[subResult]?.label ?? subResult}` : "Select outcome to save"}
              </button>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-xl border border-white/10 bg-white/3 px-4 py-2.5 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-white/6 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
