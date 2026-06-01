"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PackageCheck,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  MapPin,
  Truck,
  User,
  KeyRound,
} from "lucide-react";
import { procurementJson, saveProcurementSession, friendlyProcurementError, defaultProcurementName, defaultProcurementPin } from "@/lib/procurementClient";
import {
  GLASS_CARD,
  INPUT_CLASS,
  SELECT_CLASS,
  T_PAGE_TITLE,
  T_SECTION,
  T_LABEL,
  T_CAPTION,
  T_BODY,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_ERROR,
} from "@/lib/ui-tokens";

type LineItem = {
  item_name: string;
  qty: number;
  unit: string;
  unit_price: number;
  vendor_name?: string;
};

type CkPendingRow = {
  id: string;
  po_no: string;
  vendor_name: string;
  amount: number;
  line_items_json: LineItem[];
  status: string;
  delivery_date?: string;
  dispatched_at: string;
  dispatched_by: string;
  delivery_note: string;
  delivery_photo_url: string;
  request_id: string;
  request_no: string;
  store_code: string;
  city: string;
};

type ReceivingItem = {
  item_name: string;
  qty_expected: number;
  unit: string;
  qty_received: number | string;
  quality_status: "ACCEPTED" | "ISSUE";
};

export default function StoreReceivingPage() {
  const PAGE_BG = "min-h-screen text-white";
  const TEAL_GLASS = `${GLASS_CARD} bg-teal-950/30`;
  const TEAL_PRIMARY =
    "rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-5 py-2.5 font-semibold text-white transition-all duration-200 shadow-lg shadow-teal-500/25 hover:scale-[1.02] hover:from-teal-500 hover:to-emerald-500 active:scale-[0.98] disabled:opacity-60";
  const TEAL_SECONDARY =
    "rounded-xl border border-teal-400/15 bg-teal-950/30 px-5 py-2.5 text-white transition-all duration-200 hover:border-teal-500/25 hover:bg-teal-950/45 disabled:opacity-60";

  const [staffName, setStaffName] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [city, setCity] = useState("manila");

  const [rows, setRows] = useState<CkPendingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fetched, setFetched] = useState(false);

  // Per-PO expanded state and receiving items
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [itemsByPo, setItemsByPo] = useState<Record<string, ReceivingItem[]>>({});
  const [submitBusy, setSubmitBusy] = useState<Record<string, boolean>>({});
  const [submitSuccess, setSubmitSuccess] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<Record<string, string>>({});
  const [notesById, setNotesById] = useState<Record<string, string>>({});

  const loadPending = useCallback(async (cityOverride?: string) => {
    const activeCity = cityOverride ?? city;
    if (!staffName.trim() || !pin.trim()) {
      setError("Please enter your name and PIN.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({
        city: activeCity,
        approver_name: staffName.trim(),
        pin: pin.trim(),
      });
      const data = await procurementJson<{ rows: CkPendingRow[] }>(
        `/api/admin/procurement/ck-receiving/pending?${qs}`,
        { method: "GET" },
        staffName,
        pin,
      );
      const newRows = Array.isArray(data?.rows) ? data.rows : [];
      setRows(newRows);
      // Initialize receiving items from line_items_json for any new rows
      setItemsByPo((prev) => {
        const next = { ...prev };
        for (const row of newRows) {
          if (!next[row.id]) {
            next[row.id] = (row.line_items_json || []).map((li) => ({
              item_name: li.item_name || "",
              qty_expected: Number(li.qty) || 0,
              unit: li.unit || "",
              qty_received: li.qty || 0,
              quality_status: "ACCEPTED" as const,
            }));
          }
        }
        return next;
      });
      setFetched(true);
      saveProcurementSession(staffName.trim(), pin.trim());
    } catch (e: unknown) {
      setError(friendlyProcurementError(e));
    } finally {
      setLoading(false);
    }
  }, [city, staffName, pin]);

  const handleConfirm = async (poId: string) => {
    const items = itemsByPo[poId] || [];
    const notes = notesById[poId] || "";
    setSubmitBusy((p) => ({ ...p, [poId]: true }));
    setSubmitError((p) => ({ ...p, [poId]: "" }));
    try {
      const result = await procurementJson<{ ok: boolean; receiving_no: string }>(
        "/api/admin/procurement/ck-receiving/confirm",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            approver_name: staffName.trim(),
            pin: pin.trim(),
            po_id: poId,
            items_json: items.map((i) => ({
              item_name: i.item_name,
              qty_expected: i.qty_expected,
              qty_received: Number(i.qty_received) || 0,
              quality_status: i.quality_status,
            })),
            notes: notes.trim(),
          }),
        },
        staffName,
        pin,
      );
      const receivingNo = result?.receiving_no || "confirmed";
      setSubmitSuccess((p) => ({ ...p, [poId]: `✓ Confirmed — ${receivingNo}` }));
      setExpandedId(null);
      // Remove this PO from the pending list after a brief delay
      setTimeout(() => {
        setRows((prev) => prev.filter((r) => r.id !== poId));
      }, 2500);
    } catch (e: unknown) {
      setSubmitError((p) => ({ ...p, [poId]: friendlyProcurementError(e) }));
    } finally {
      setSubmitBusy((p) => ({ ...p, [poId]: false }));
    }
  };

  const formatDate = (iso: string | undefined) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className={PAGE_BG}>
      <motion.div
        className="mx-auto max-w-2xl px-4 py-8"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600/20 border border-teal-500/30">
              <PackageCheck className="h-5 w-5 text-teal-400" />
            </div>
            <div>
              <h1 className={T_PAGE_TITLE}>CK Delivery Receiving</h1>
              <p className={T_BODY}>Confirm receipt of Central Kitchen deliveries.</p>
            </div>
          </div>
        </div>

        {/* Auth + City card */}
        <div className={`${TEAL_GLASS} p-4 mb-5 space-y-3`}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`${T_LABEL} mb-1.5 flex items-center gap-1.5`}>
                <User className="h-3 w-3" /> Your Name
              </label>
              <input
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                placeholder="Staff name"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 flex items-center gap-1.5`}>
                <KeyRound className="h-3 w-3" /> PIN
              </label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••••"
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div>
            <label className={`${T_LABEL} mb-1.5 flex items-center gap-1.5`}>
              <MapPin className="h-3 w-3" /> City
            </label>
            <select
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                if (fetched) void loadPending(e.target.value);
              }}
              className={SELECT_CLASS}
            >
              <option value="manila">Manila</option>
              <option value="dubai">Dubai</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => void loadPending()}
            disabled={loading}
            className={`${TEAL_PRIMARY} w-full flex items-center justify-center gap-2 text-sm`}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Loading…" : fetched ? "Refresh" : "Load Pending Deliveries"}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-700/40 bg-red-900/20 px-4 py-3 text-sm text-red-300 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {/* Pending delivery list */}
        {fetched && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className={T_SECTION}>
                Pending Deliveries
                <span className={`${T_CAPTION} ml-2`}>({rows.length})</span>
              </h2>
            </div>

            {rows.length === 0 ? (
              <div className={`${TEAL_GLASS} flex flex-col items-center gap-2 py-12`}>
                <CheckCircle2 className="h-8 w-8 text-teal-500" />
                <p className={T_CAPTION}>No pending CK deliveries to confirm.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {rows.map((row) => {
                  const isExpanded = expandedId === row.id;
                  const items = itemsByPo[row.id] || [];
                  const busy = submitBusy[row.id] || false;
                  const success = submitSuccess[row.id] || "";
                  const err = submitError[row.id] || "";

                  return (
                    <div
                      key={row.id}
                      className={`rounded-xl border transition-all duration-200 overflow-hidden ${
                        success
                          ? "border-emerald-700/50 bg-emerald-900/15"
                          : isExpanded
                            ? "border-teal-500/40 bg-teal-950/20"
                            : "border-white/8 bg-white/4 hover:border-teal-500/30 hover:bg-teal-950/15"
                      }`}
                    >
                      {/* PO Header — always visible */}
                      <button
                        type="button"
                        className="w-full px-4 py-3 flex items-start justify-between gap-3 text-left"
                        onClick={() => setExpandedId(isExpanded ? null : row.id)}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <Truck className="h-4 w-4 text-teal-400 shrink-0" />
                            <span className="font-mono text-sm font-semibold text-white">{row.po_no}</span>
                            {success && <span className={BADGE_SUCCESS}>Confirmed</span>}
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
                            <span>{row.store_code || row.city}</span>
                            <span className="text-teal-400">Dispatched {formatDate(row.dispatched_at)}</span>
                            {row.dispatched_by && <span>by {row.dispatched_by}</span>}
                          </div>
                          {row.delivery_note && (
                            <p className="mt-1 text-xs text-zinc-500 truncate">Note: {row.delivery_note}</p>
                          )}
                          {success && (
                            <p className="mt-1 text-xs font-semibold text-emerald-400">{success}</p>
                          )}
                        </div>
                        <div className="shrink-0 pt-0.5">
                          {isExpanded
                            ? <ChevronUp className="h-4 w-4 text-teal-400" />
                            : <ChevronDown className="h-4 w-4 text-zinc-500" />}
                        </div>
                      </button>

                      {/* Expanded receiving form */}
                      <AnimatePresence>
                        {isExpanded && !success && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="border-t border-white/8 px-4 pb-4 pt-3 space-y-3">
                              {/* Delivery photo link */}
                              {row.delivery_photo_url && (
                                <a
                                  href={row.delivery_photo_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-teal-700/40 bg-teal-950/30 px-3 py-1.5 text-xs text-teal-300 hover:bg-teal-900/40 transition-colors"
                                >
                                  📎 View Delivery Invoice
                                </a>
                              )}

                              {/* Items checklist */}
                              <div>
                                <p className={`${T_LABEL} mb-2`}>Items</p>
                                <div className="space-y-2">
                                  {items.map((item, idx) => (
                                    <div
                                      key={idx}
                                      className="rounded-xl border border-white/8 bg-white/3 p-3"
                                    >
                                      <p className="text-sm font-medium text-white mb-2">{item.item_name || `Item ${idx + 1}`}</p>
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <label className={`${T_LABEL} mb-1 block`}>Expected</label>
                                          <p className="text-sm text-zinc-400">{item.qty_expected} {item.unit}</p>
                                        </div>
                                        <div>
                                          <label className={`${T_LABEL} mb-1 block`}>Received</label>
                                          <input
                                            type="number"
                                            min="0"
                                            step="0.1"
                                            value={item.qty_received}
                                            onChange={(e) =>
                                              setItemsByPo((prev) => {
                                                const updated = [...(prev[row.id] || [])];
                                                updated[idx] = { ...updated[idx], qty_received: e.target.value };
                                                return { ...prev, [row.id]: updated };
                                              })
                                            }
                                            className={`${INPUT_CLASS} text-sm`}
                                          />
                                        </div>
                                      </div>
                                      {/* Quality toggle */}
                                      <div className="mt-2 flex gap-2">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setItemsByPo((prev) => {
                                              const updated = [...(prev[row.id] || [])];
                                              updated[idx] = { ...updated[idx], quality_status: "ACCEPTED" };
                                              return { ...prev, [row.id]: updated };
                                            })
                                          }
                                          className={[
                                            "flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all",
                                            item.quality_status === "ACCEPTED"
                                              ? "border-emerald-600/60 bg-emerald-900/30 text-emerald-300"
                                              : "border-white/10 bg-white/5 text-zinc-500 hover:border-emerald-700/40 hover:text-emerald-400",
                                          ].join(" ")}
                                        >
                                          ✓ Good
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setItemsByPo((prev) => {
                                              const updated = [...(prev[row.id] || [])];
                                              updated[idx] = { ...updated[idx], quality_status: "ISSUE" };
                                              return { ...prev, [row.id]: updated };
                                            })
                                          }
                                          className={[
                                            "flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all",
                                            item.quality_status === "ISSUE"
                                              ? "border-red-600/60 bg-red-900/30 text-red-300"
                                              : "border-white/10 bg-white/5 text-zinc-500 hover:border-red-700/40 hover:text-red-400",
                                          ].join(" ")}
                                        >
                                          ✗ Issue
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Notes */}
                              <div>
                                <label className={`${T_LABEL} mb-1.5 block`}>Notes (optional)</label>
                                <textarea
                                  value={notesById[row.id] || ""}
                                  onChange={(e) => setNotesById((p) => ({ ...p, [row.id]: e.target.value }))}
                                  placeholder="Any issues, missing items, etc."
                                  rows={2}
                                  className={`${INPUT_CLASS} resize-none`}
                                />
                              </div>

                              {err && (
                                <p className="rounded-lg border border-red-700/40 bg-red-900/20 px-3 py-2 text-xs text-red-300">{err}</p>
                              )}

                              <button
                                type="button"
                                onClick={() => void handleConfirm(row.id)}
                                disabled={busy}
                                className={`${TEAL_PRIMARY} w-full flex items-center justify-center gap-2`}
                              >
                                {busy
                                  ? <><RefreshCw className="h-4 w-4 animate-spin" /> Confirming…</>
                                  : <><PackageCheck className="h-4 w-4" /> Confirm Receipt</>}
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
