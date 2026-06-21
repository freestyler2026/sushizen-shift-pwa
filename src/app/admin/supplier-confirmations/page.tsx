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
  T_CARD_TITLE,
} from "@/lib/ui-tokens";
import { Phone, RefreshCw, X, CheckCircle2, Clock, AlertCircle } from "lucide-react";

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
};

function confBadge(status: string) {
  if (status === "confirmed") return <span className="rounded-full bg-emerald-900/40 border border-emerald-700/50 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">✓ Confirmed</span>;
  if (status === "rescheduled") return <span className="rounded-full bg-amber-900/40 border border-amber-700/50 px-2 py-0.5 text-[10px] font-semibold text-amber-300">↻ Rescheduled</span>;
  if (status === "no_answer") return <span className="rounded-full bg-red-900/40 border border-red-700/50 px-2 py-0.5 text-[10px] font-semibold text-red-300">✗ No Answer</span>;
  return <span className="rounded-full bg-zinc-800 border border-zinc-600 px-2 py-0.5 text-[10px] font-semibold text-zinc-400">Call Pending</span>;
}

export default function SupplierConfirmationsPage() {
  const auth = useMemo(() => getAuth(), []);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [rows, setRows] = useState<PendingPoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Modal
  const [modal, setModal] = useState<PendingPoRow | null>(null);
  const [callLog, setCallLog] = useState<CallLog[]>([]);
  const [result, setResult] = useState<"confirmed" | "rescheduled" | "no_answer">("confirmed");
  const [callTime, setCallTime] = useState("");
  const [expDate, setExpDate] = useState("");
  const [notes, setNotes] = useState("");
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

  const openModal = async (row: PendingPoRow) => {
    setModal(row);
    setResult("confirmed");
    setCallTime("");
    setExpDate("");
    setNotes("");
    setSaveMsg("");
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

  const submitCall = async () => {
    if (!modal) return;
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
            result,
            call_time: callTime.trim(),
            expected_delivery_date: expDate || null,
            notes: notes.trim(),
          }),
        },
        requestedBy,
        pin,
      );
      setSaveMsg("Saved.");
      setRows((prev) => prev.map((r) => r.id === modal.id ? { ...r, supplier_confirmation_status: result } : r));
      if (result === "confirmed") {
        setTimeout(() => {
          setRows((prev) => prev.filter((r) => r.id !== modal.id));
          setModal(null);
        }, 1200);
      }
    } catch (e: unknown) {
      setSaveMsg("Error: " + String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const pending = rows.filter((r) => r.supplier_confirmation_status === "pending");
  const needsFollowUp = rows.filter((r) => r.supplier_confirmation_status !== "pending");

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

      {/* Stats */}
      {rows.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className={`${GLASS_CARD} p-4 text-center`}>
            <p className="text-2xl font-bold text-amber-400">{pending.length}</p>
            <p className={T_CAPTION}>Pending Call</p>
          </div>
          <div className={`${GLASS_CARD} p-4 text-center`}>
            <p className="text-2xl font-bold text-red-400">{needsFollowUp.filter((r) => r.supplier_confirmation_status === "no_answer").length}</p>
            <p className={T_CAPTION}>No Answer</p>
          </div>
          <div className={`${GLASS_CARD} p-4 text-center`}>
            <p className="text-2xl font-bold text-amber-300">{needsFollowUp.filter((r) => r.supplier_confirmation_status === "rescheduled").length}</p>
            <p className={T_CAPTION}>Rescheduled</p>
          </div>
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
          {rows.map((row) => (
            <div
              key={row.id}
              className={`${GLASS_CARD} p-4 cursor-pointer hover:border-violet-500/30 transition-colors`}
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
                    <p className="text-xs text-amber-400 mt-0.5">
                      <Clock className="inline h-3 w-3 mr-1" />Delivery: {row.delivery_date}
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
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-white flex items-center gap-2">
                  <Phone className="h-4 w-4 text-violet-400" />
                  Log Confirmation Call
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">{modal.po_no} — {modal.vendor_name}</p>
              </div>
              <button type="button" onClick={() => setModal(null)} className="rounded-lg p-1.5 text-zinc-500 hover:text-white hover:bg-white/8">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className={`${T_LABEL} mb-2 block`}>Call Result</label>
                <div className="flex gap-2">
                  {(["confirmed", "rescheduled", "no_answer"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setResult(r)}
                      className={`flex-1 rounded-xl border py-2 text-xs font-semibold transition-all ${
                        result === r
                          ? r === "confirmed"
                            ? "border-emerald-600 bg-emerald-900/40 text-emerald-300"
                            : r === "rescheduled"
                              ? "border-amber-600 bg-amber-900/40 text-amber-300"
                              : "border-red-600 bg-red-900/40 text-red-300"
                          : "border-white/10 bg-white/3 text-zinc-400 hover:bg-white/6"
                      }`}
                    >
                      {r === "confirmed" ? "✓ Confirmed" : r === "rescheduled" ? "↻ Rescheduled" : "✗ No Answer"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`${T_LABEL} mb-1.5 block`}>Call Time</label>
                  <input type="time" value={callTime} onChange={(e) => setCallTime(e.target.value)} className={INPUT_CLASS} />
                </div>
                <div>
                  <label className={`${T_LABEL} mb-1.5 block`}>Expected Delivery</label>
                  <input type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} className={INPUT_CLASS} />
                </div>
              </div>
              <div>
                <label className={`${T_LABEL} mb-1.5 block`}>Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Contact person, agreed window, etc." rows={2} className={TEXTAREA_CLASS} />
              </div>
              {saveMsg && (
                <div className={`rounded-xl border px-4 py-2 text-sm ${saveMsg.startsWith("Error") ? "border-red-700/50 bg-red-900/20 text-red-300" : "border-emerald-700/50 bg-emerald-900/20 text-emerald-300"}`}>
                  {saveMsg}
                </div>
              )}
              {callLog.length > 0 && (
                <div>
                  <p className={`${T_SECTION} mb-2`}>Previous Calls</p>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {callLog.map((c) => (
                      <div key={c.id} className="rounded-xl border border-white/6 bg-white/3 px-3 py-2 text-xs text-zinc-300">
                        <span className="font-semibold">{c.result}</span>
                        <span className="text-zinc-500"> · {c.call_date}{c.call_time ? ` ${c.call_time}` : ""} · by {c.called_by}</span>
                        {c.notes && <p className="text-zinc-500 mt-0.5">{c.notes}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3 border-t border-white/8 px-5 py-4">
              <button
                type="button"
                onClick={() => void submitCall()}
                disabled={busy}
                className="flex-1 rounded-xl border border-violet-600/50 bg-violet-700/30 py-2.5 text-sm font-semibold text-violet-200 hover:bg-violet-700/50 transition-colors disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save Call"}
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
