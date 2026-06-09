"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";
import DatePicker from "@/components/DatePicker";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SMALL_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  TEXTAREA_CLASS,
  T_PAGE_TITLE,
  T_SECTION,
  T_LABEL,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_ERROR,
  BADGE_INFO,
} from "@/lib/ui-tokens";
import { RefreshCw, AlertCircle, CheckCircle, ChevronRight, ChevronDown, XCircle, Package } from "lucide-react";

type ReceivingItem = {
  id: string;
  receiving_id: string;
  request_item_id: string;
  item_name: string;
  category: string;
  vendor_name: string;
  unit: string;
  qty_ordered: number;
  qty_received: number;
  unit_price: number;
  line_total_received: number;
  notes: string;
};

type ReceivingRow = {
  id: string;
  request_id: string;
  case_id: string;
  po_id: string;
  request_no: string;
  parent_case_no: string;
  receiving_no: string;
  vendor_name: string;
  store_code: string;
  qty_expected: number;
  qty_received: number;
  shortage_qty: number;
  excess_qty: number;
  unit: string;
  unit_price: number;
  amount_received: number;
  quality_status: string;
  variance_reason: string;
  status: string;
  delivery_date: string;
  confirmed_by: string;
  confirmed_at: string;
  created_at: string;
};

function formatDateTime(value: string): string {
  return value ? String(value).slice(0, 16).replace("T", " ") : "-";
}

function qualityBadge(qs: string) {
  const s = String(qs || "").toUpperCase();
  if (s === "ACCEPTED")       return <span className={BADGE_SUCCESS}>ACCEPTED</span>;
  if (s === "QUALITY_REVIEW") return <span className={BADGE_WARNING}>QUALITY REVIEW</span>;
  if (s === "REJECTED")       return <span className={BADGE_ERROR}>REJECTED</span>;
  return <span className={BADGE_INFO}>{qs || "-"}</span>;
}

function statusBadge(status: string) {
  const s = String(status || "").toUpperCase();
  if (s === "CONFIRMED") return <span className={BADGE_SUCCESS}>CONFIRMED</span>;
  if (s === "DRAFT")     return <span className={BADGE_WARNING}>DRAFT</span>;
  if (s === "VOID")      return <span className="inline-flex items-center rounded-full bg-zinc-700/60 px-2 py-0.5 text-xs font-semibold text-zinc-400">VOID</span>;
  return <span className={BADGE_INFO}>{status || "-"}</span>;
}

export default function ProcurementReceivingPage() {
  const auth = useMemo(() => getAuth(), []);
  const [allowed, setAllowed] = useState(false);
  const [isHqAdmin, setIsHqAdmin] = useState(false);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [city, setCity] = useState<"dubai" | "manila">(
    String(auth?.city || "").toLowerCase() === "dubai" ? "dubai" : "manila"
  );

  // Filter state
  const [filterRequestId, setFilterRequestId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Create form state
  const [createRequestId, setCreateRequestId] = useState("");
  const [poId, setPoId] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [qtyExpected, setQtyExpected] = useState("0");
  const [qtyReceived, setQtyReceived] = useState("0");
  const [unit, setUnit] = useState("");
  const [unitPrice, setUnitPrice] = useState("0");
  const [qualityStatus, setQualityStatus] = useState("ACCEPTED");
  const [varianceReason, setVarianceReason] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [rows, setRows] = useState<ReceivingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Item detail expand + edit state
  const [expandedId, setExpandedId] = useState("");
  const [itemsCache, setItemsCache] = useState<Record<string, ReceivingItem[]>>({});
  const [itemsLoading, setItemsLoading] = useState<Record<string, boolean>>({});
  // Per-item edits: { [itemId]: { qty_received, unit_price } }
  const [editValues, setEditValues] = useState<Record<string, { qty_received: number; unit_price: number }>>({});
  const [savingItemId, setSavingItemId] = useState("");
  // 2-step confirm guard: confirmTarget = receiving row.id being confirmed
  const [confirmTarget, setConfirmTarget] = useState("");

  const loadItems = async (receivingId: string) => {
    if (!receivingId || itemsCache[receivingId] || itemsLoading[receivingId]) return;
    setItemsLoading((prev) => ({ ...prev, [receivingId]: true }));
    try {
      const data = await procurementJson<{ items: ReceivingItem[] }>(
        `/api/admin/procurement/receiving/${encodeURIComponent(receivingId)}/items`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      const items = Array.isArray(data?.items) ? data.items : [];
      setItemsCache((prev) => ({ ...prev, [receivingId]: items }));
      // Seed editValues with current values from DB
      const seeds: Record<string, { qty_received: number; unit_price: number }> = {};
      items.forEach((it) => {
        seeds[it.id] = { qty_received: Number(it.qty_received), unit_price: Number(it.unit_price) };
      });
      setEditValues((prev) => ({ ...seeds, ...prev }));
    } catch {
      setItemsCache((prev) => ({ ...prev, [receivingId]: [] }));
    } finally {
      setItemsLoading((prev) => ({ ...prev, [receivingId]: false }));
    }
  };

  const toggleExpand = (row: ReceivingRow) => {
    const next = expandedId === row.id ? "" : row.id;
    setExpandedId(next);
    if (next) void loadItems(row.id);
  };

  const saveItem = async (item: ReceivingItem) => {
    const ev = editValues[item.id];
    if (!ev) return;
    setSavingItemId(item.id);
    setError("");
    try {
      const data = await procurementJson<{ item: ReceivingItem; receiving: ReceivingRow }>(
        `/api/admin/procurement/receiving/${encodeURIComponent(item.receiving_id)}/items/${encodeURIComponent(item.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            qty_received: ev.qty_received,
            unit_price: ev.unit_price,
            notes: item.notes || "",
            approver_name: requestedBy,
            pin,
          }),
        },
        requestedBy,
        pin,
      );
      // Update cache with returned item
      if (data?.item) {
        setItemsCache((prev) => ({
          ...prev,
          [item.receiving_id]: (prev[item.receiving_id] ?? []).map((it) =>
            it.id === item.id ? (data.item as ReceivingItem) : it
          ),
        }));
        setEditValues((prev) => ({
          ...prev,
          [item.id]: { qty_received: Number(data.item.qty_received), unit_price: Number(data.item.unit_price) },
        }));
      }
      // Refresh the rows list so aggregate totals update
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSavingItemId("");
    }
  };

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("city", city);
      if (filterRequestId.trim()) qs.set("request_id", filterRequestId.trim());
      if (statusFilter.trim()) qs.set("status", statusFilter.trim());
      qs.set("limit", "200");
      const data = await procurementJson<{ rows: ReceivingRow[] }>(
        `/api/admin/procurement/receiving?${qs.toString()}`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [city, filterRequestId, pin, requestedBy, statusFilter]);

  const createReceiving = async () => {
    if (!createRequestId.trim()) { setError("Request ID is required."); return; }
    setBusy("create");
    setError("");
    setSuccessMsg("");
    try {
      await procurementJson(
        "/api/admin/procurement/receiving",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request_id: createRequestId.trim(),
            po_id: poId.trim(),
            vendor_name: vendorName.trim(),
            delivery_date: deliveryDate,
            qty_expected: Number(qtyExpected || 0),
            qty_received: Number(qtyReceived || 0),
            unit: unit.trim(),
            unit_price: Number(unitPrice || 0),
            quality_status: qualityStatus,
            variance_reason: varianceReason.trim(),
            approver_name: requestedBy,
            pin,
          }),
        },
        requestedBy,
        pin,
      );
      setVarianceReason("");
      setSuccessMsg("Receiving record created successfully.");
      setShowCreateForm(false);
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy("");
    }
  };

  const confirmReceiving = async (receivingId: string) => {
    setBusy(receivingId);
    setError("");
    setSuccessMsg("");
    try {
      await procurementJson(
        `/api/admin/procurement/receiving/${receivingId}/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ receiving_id: receivingId, approver_name: requestedBy, pin }),
        },
        requestedBy,
        pin,
      );
      setSuccessMsg("Receiving record confirmed.");
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy("");
    }
  };

  const voidReceiving = async (row: ReceivingRow) => {
    const msg = `Void receiving record ${row.receiving_no}?\n\nThis will cancel the existing record and allow a new receiving record to be created for the same order.\n\nThis action cannot be undone.`;
    if (!window.confirm(msg)) return;
    setBusy(`void-${row.id}`);
    setError("");
    setSuccessMsg("");
    try {
      await procurementJson(
        `/api/admin/procurement/receiving/${row.id}/void`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ receiving_id: row.id, approver_name: requestedBy, pin }),
        },
        requestedBy,
        pin,
      );
      setSuccessMsg(`${row.receiving_no} has been voided. You can now create a new receiving record.`);
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy("");
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const initialRequestId = sp.get("request_id") || "";
    if (initialRequestId) {
      setFilterRequestId(initialRequestId);
      setCreateRequestId(initialRequestId);
    }
  }, []);

  useEffect(() => {
    if (!allowed) return;
    void load();
  }, [allowed, city, load]);

  useEffect(() => {
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      const resolvedAuth = refreshed || auth;
      const role = String(resolvedAuth?.role || "").toUpperCase();
      const can = canAccessProcurementAdmin(
        role,
        String(resolvedAuth?.city || "").toLowerCase() === "dubai" ? "dubai" : "manila",
      );
      setAllowed(can);
      setIsHqAdmin(role === "HQ" || role === "ADMIN");
    }
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!allowed) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Procurement receiving is only available to authorized admin roles.
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className={T_PAGE_TITLE}>Receiving Records</h2>
          <p className="mt-1 text-sm text-zinc-400">Record and confirm delivery of procurement orders.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* City toggle */}
          <div className="flex rounded-xl overflow-hidden border border-white/10">
            {(["dubai", "manila"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCity(c)}
                className={[
                  "px-3 py-1.5 text-xs font-semibold transition-colors",
                  city === c
                    ? "bg-violet-600/70 text-white"
                    : "bg-white/5 text-zinc-400 hover:bg-white/10",
                ].join(" ")}
              >
                {c === "dubai" ? "Dubai" : "Manila"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowCreateForm((v) => !v)}
            className={PRIMARY_BUTTON}
          >
            {showCreateForm ? "Cancel" : "+ New Record"}
          </button>
        </div>
      </div>

      {/* Error / Success */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}
      {successMsg && !error && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-700/40 bg-emerald-900/15 px-4 py-3 text-sm text-emerald-300">
          <CheckCircle className="h-4 w-4 shrink-0" />{successMsg}
        </div>
      )}

      {/* Session + Filter bar */}
      <div className={`${GLASS_CARD} p-4`}>
        <p className="mb-3 text-sm font-semibold text-white">Session & Filter</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Approver Name</label>
            <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Name" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>PIN</label>
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••••••" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Request ID Filter</label>
            <input value={filterRequestId} onChange={(e) => setFilterRequestId(e.target.value)} placeholder="Filter by request ID" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={SELECT_CLASS}>
              <option value="">All statuses</option>
              <option value="DRAFT">DRAFT</option>
              <option value="CONFIRMED">CONFIRMED</option>
              <option value="VOID">VOID</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className={`${SECONDARY_BUTTON} w-full flex items-center justify-center gap-2`}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <div id="create-receiving-form" className={`${GLASS_CARD} p-5`}>
          <p className={`${T_SECTION} mb-4`}>New Receiving Record</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Request ID *</label>
              <input value={createRequestId} onChange={(e) => setCreateRequestId(e.target.value)} placeholder="Request ID" className={INPUT_CLASS} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>PO ID (optional)</label>
              <input value={poId} onChange={(e) => setPoId(e.target.value)} placeholder="PO ID" className={INPUT_CLASS} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Vendor Name</label>
              <input value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="Vendor name" className={INPUT_CLASS} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Delivery Date</label>
              <DatePicker value={deliveryDate} onChange={setDeliveryDate} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Qty Expected</label>
              <input value={qtyExpected} onChange={(e) => setQtyExpected(e.target.value)} placeholder="0" className={INPUT_CLASS} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Qty Received</label>
              <input value={qtyReceived} onChange={(e) => setQtyReceived(e.target.value)} placeholder="0" className={INPUT_CLASS} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Unit</label>
              <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="kg / pcs / box" className={INPUT_CLASS} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Unit Price</label>
              <input value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="0.00" className={INPUT_CLASS} />
            </div>
            <div>
              <label className={`${T_LABEL} mb-1.5 block`}>Quality Status</label>
              <select value={qualityStatus} onChange={(e) => setQualityStatus(e.target.value)} className={SELECT_CLASS}>
                <option value="ACCEPTED">ACCEPTED</option>
                <option value="QUALITY_REVIEW">QUALITY_REVIEW</option>
                <option value="REJECTED">REJECTED</option>
              </select>
            </div>
            <div className="sm:col-span-3">
              <label className={`${T_LABEL} mb-1.5 block`}>Variance / Quality Note</label>
              <textarea value={varianceReason} onChange={(e) => setVarianceReason(e.target.value)} placeholder="Explain any shortage, excess, or quality issue" className={`${TEXTAREA_CLASS} min-h-20`} />
            </div>
            <div className="sm:col-span-3 flex justify-end">
              <button
                type="button"
                onClick={() => void createReceiving()}
                disabled={busy === "create"}
                className={`${PRIMARY_BUTTON} flex items-center gap-2`}
              >
                {busy === "create" ? <><RefreshCw className="h-4 w-4 animate-spin" />Creating…</> : "Create Receiving Record"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !rows.length && (
        <div className={`${GLASS_CARD} p-10 flex items-center justify-center gap-3 text-zinc-500`}>
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading records…</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && !rows.length && !filterRequestId.trim() && (
        <div className={`${GLASS_CARD} p-10 flex flex-col items-center gap-3`}>
          <p className="text-sm text-zinc-500">No receiving records found.</p>
        </div>
      )}

      {/* Empty state when filtering by request ID — guide user to create a receiving record */}
      {!loading && !rows.length && filterRequestId.trim() && (
        <div className={`${GLASS_CARD} p-6`}>
          <div className="flex flex-col items-center gap-4 text-center">
            <Package className="h-8 w-8 text-zinc-600" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-zinc-200">No receiving records found for <span className="font-mono text-violet-300">{filterRequestId.trim()}</span></p>
              <p className="text-xs text-zinc-500">
                If this order has been approved but delivery has not yet been recorded,<br />
                create a new receiving record using the button below.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setCreateRequestId(filterRequestId.trim());
                setShowCreateForm(true);
                setTimeout(() => {
                  document.getElementById("create-receiving-form")?.scrollIntoView({ behavior: "smooth" });
                }, 100);
              }}
              className="flex items-center gap-2 rounded-xl border border-violet-500/40 bg-violet-500/20 px-4 py-2 text-sm font-medium text-violet-200 transition hover:bg-violet-500/30"
            >
              + Create Receiving Record for this Order
            </button>
          </div>
        </div>
      )}

      {/* Records list */}
      <div className="space-y-3">
        {rows.map((row) => {
          const statusUpper = String(row.status || "").toUpperCase();
          const isConfirmed = statusUpper === "CONFIRMED";
          const isVoid = statusUpper === "VOID";
          const hasVariance = Number(row.shortage_qty || 0) > 0 || Number(row.excess_qty || 0) > 0 || row.quality_status !== "ACCEPTED";
          const isExpanded = expandedId === row.id;
          const rowItems = itemsCache[row.id] ?? [];
          const rowItemsLoading = itemsLoading[row.id] ?? false;
          const isConfirmTarget = confirmTarget === row.id;

          return (
            <div
              key={row.id}
              className={[
                "rounded-2xl border transition-all",
                isVoid
                  ? "border-white/5 bg-white/2 opacity-60"
                  : hasVariance && !isConfirmed
                  ? "border-amber-500/30 bg-amber-950/10"
                  : "border-white/8 bg-white/4",
              ].join(" ")}
            >
              {/* ── Header row (always visible) ── */}
              <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleExpand(row)}
                      className="flex items-center gap-1.5 font-mono text-sm font-semibold text-white hover:text-violet-300 transition-colors"
                    >
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4 text-violet-400" />
                        : <ChevronRight className="h-4 w-4 text-zinc-500" />}
                      {row.receiving_no}
                    </button>
                    {statusBadge(row.status)}
                    {!isVoid && qualityBadge(row.quality_status)}
                    {hasVariance && !isConfirmed && !isVoid && <span className={BADGE_WARNING}>⚠ Variance</span>}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
                    <span>Req: <span className="text-zinc-200">{row.request_no || row.parent_case_no || "-"}</span></span>
                    <span>Vendor: <span className="text-zinc-200">{row.vendor_name || "-"}</span></span>
                    <span>Store: <span className="text-zinc-200">{row.store_code || "-"}</span></span>
                  </div>
                  {!isVoid && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                      <span>Expected: <span className="text-zinc-300">{Number(row.qty_expected || 0).toFixed(2)} {row.unit}</span></span>
                      <span>Received: <span className="text-zinc-300">{Number(row.qty_received || 0).toFixed(2)}</span></span>
                      {Number(row.shortage_qty || 0) > 0 && <span className="text-red-400">Short: {Number(row.shortage_qty || 0).toFixed(2)}</span>}
                      {Number(row.excess_qty || 0) > 0 && <span className="text-amber-400">Excess: {Number(row.excess_qty || 0).toFixed(2)}</span>}
                      <span>Amount: <span className="font-medium text-zinc-200">PHP {Number(row.amount_received || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
                    </div>
                  )}
                  {isConfirmed && !isVoid && (
                    <p className="text-xs text-zinc-500">
                      Confirmed by {row.confirmed_by || "-"} at {formatDateTime(row.confirmed_at)}
                    </p>
                  )}
                  {isVoid && (
                    <p className="text-xs text-zinc-500">
                      Voided by {row.confirmed_by || "-"} at {formatDateTime(row.confirmed_at)}
                    </p>
                  )}
                  {row.variance_reason && !isVoid && (
                    <p className="text-sm text-amber-300">{row.variance_reason}</p>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap items-start gap-2">
                  {row.case_id && !isVoid && (
                    <Link
                      href={`/admin/procurement/cases/${row.case_id}`}
                      className={`${SMALL_BUTTON} flex items-center gap-1`}
                    >
                      Case <ChevronRight className="h-3 w-3" />
                    </Link>
                  )}
                  {/* Confirm button — 2-step guard for DRAFT records */}
                  {!isVoid && !isConfirmed && (
                    isConfirmTarget ? (
                      <div className="flex flex-col items-end gap-1.5">
                        <p className="text-xs font-medium text-amber-200 text-right">
                          Confirm delivery of {row.receiving_no}?
                        </p>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => { setConfirmTarget(""); void confirmReceiving(row.id); }}
                            disabled={busy === row.id}
                            className={`${PRIMARY_BUTTON} flex items-center gap-1.5 px-3 py-1.5 text-xs`}
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                            {busy === row.id ? "Confirming…" : "Yes, Confirm"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmTarget("")}
                            disabled={busy === row.id}
                            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-400 hover:bg-white/10 transition"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmTarget(row.id)}
                        disabled={busy === row.id}
                        className={`${PRIMARY_BUTTON} flex items-center gap-1.5 px-4 py-2 text-xs`}
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        Confirm
                      </button>
                    )
                  )}
                  {!isVoid && isConfirmed && (
                    <div className={`${SMALL_BUTTON} flex items-center gap-1.5 opacity-50 cursor-not-allowed`}>
                      <CheckCircle className="h-3.5 w-3.5" />
                      Confirmed
                    </div>
                  )}
                  {/* Void button — HQ/Admin only, not already void */}
                  {isHqAdmin && !isVoid && (
                    <button
                      type="button"
                      onClick={() => void voidReceiving(row)}
                      disabled={busy === `void-${row.id}`}
                      className="flex items-center gap-1.5 rounded-lg border border-red-700/40 bg-red-900/20 px-3 py-1.5 text-xs font-semibold text-red-400 transition-colors hover:bg-red-900/40 disabled:opacity-50"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      {busy === `void-${row.id}` ? "Voiding…" : "Void"}
                    </button>
                  )}
                </div>
              </div>

              {/* ── Received Items panel (expanded, editable) ── */}
              {isExpanded && (
                <div className="border-t border-white/8 bg-black/15 px-4 pb-4 pt-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Package className="h-3.5 w-3.5 text-violet-400" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Received Items</span>
                    {!isConfirmed && (
                      <span className="ml-1 text-[10px] text-zinc-600">— edit qty / price before confirming</span>
                    )}
                  </div>

                  {rowItemsLoading ? (
                    <div className="flex items-center gap-2 py-4 text-xs text-zinc-500">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading items…
                    </div>
                  ) : rowItems.length === 0 ? (
                    <div className="py-3">
                      <p className="text-xs text-zinc-500">
                        No per-item data — this record was created before item tracking was enabled.
                      </p>
                      {row.case_id && (
                        <Link
                          href={`/admin/procurement/cases/${row.case_id}`}
                          className="mt-1.5 inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300"
                        >
                          View order items in Case <ChevronRight className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-white/8">
                      {/* Table header */}
                      <div className="grid grid-cols-[1fr_80px_56px_110px_110px_56px_80px] gap-x-2 border-b border-white/8 bg-black/20 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                        <div>Item</div>
                        <div className="text-right">Ordered</div>
                        <div>Unit</div>
                        <div className="text-center">Qty Received</div>
                        <div className="text-center">Unit Price</div>
                        <div className="text-right">Total</div>
                        <div></div>
                      </div>
                      {/* Item rows */}
                      {rowItems.map((item) => {
                        const ev = editValues[item.id] ?? { qty_received: Number(item.qty_received), unit_price: Number(item.unit_price) };
                        const lineTotal = ev.qty_received * ev.unit_price;
                        const isDirty =
                          ev.qty_received !== Number(item.qty_received) ||
                          ev.unit_price !== Number(item.unit_price);
                        const shortage = Number(item.qty_ordered) - ev.qty_received;
                        const isSaving = savingItemId === item.id;

                        return (
                          <div
                            key={item.id}
                            className={[
                              "grid grid-cols-[1fr_80px_56px_110px_110px_56px_80px] gap-x-2 border-b border-white/5 px-3 py-2.5 last:border-0 transition-colors",
                              isDirty ? "bg-amber-950/20" : "hover:bg-white/2",
                            ].join(" ")}
                          >
                            {/* Item info */}
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-white">{item.item_name}</div>
                              {item.vendor_name && (
                                <div className="mt-0.5 truncate text-[11px] text-zinc-500">{item.vendor_name}</div>
                              )}
                              {shortage > 0.001 && (
                                <div className="mt-0.5 text-[10px] text-red-400">
                                  Short {shortage.toFixed(2)} {item.unit}
                                </div>
                              )}
                            </div>
                            {/* Ordered qty */}
                            <div className="text-right text-xs text-zinc-500 tabular-nums self-center">
                              {Number(item.qty_ordered).toFixed(2)}
                            </div>
                            {/* Unit */}
                            <div className="text-xs text-zinc-500 self-center">{item.unit || "-"}</div>
                            {/* Qty Received — editable */}
                            <div className="self-center">
                              {isConfirmed ? (
                                <span className="block text-center text-sm text-zinc-200 tabular-nums">
                                  {Number(item.qty_received).toFixed(2)}
                                </span>
                              ) : (
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={ev.qty_received === 0 && !isDirty ? "" : ev.qty_received}
                                  placeholder="0"
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) =>
                                    setEditValues((prev) => ({
                                      ...prev,
                                      [item.id]: { ...ev, qty_received: Number(e.target.value || 0) },
                                    }))
                                  }
                                  className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-center text-sm text-white outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 tabular-nums"
                                />
                              )}
                            </div>
                            {/* Unit Price — editable */}
                            <div className="self-center">
                              {isConfirmed ? (
                                <span className="block text-center text-sm text-zinc-200 tabular-nums">
                                  {Number(item.unit_price).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                                </span>
                              ) : (
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={ev.unit_price === 0 && !isDirty ? "" : ev.unit_price}
                                  placeholder="0.00"
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) =>
                                    setEditValues((prev) => ({
                                      ...prev,
                                      [item.id]: { ...ev, unit_price: Number(e.target.value || 0) },
                                    }))
                                  }
                                  className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-center text-sm text-white outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 tabular-nums"
                                />
                              )}
                            </div>
                            {/* Line total */}
                            <div className={[
                              "text-right text-sm tabular-nums self-center",
                              isDirty ? "text-amber-300 font-medium" : "text-zinc-300",
                            ].join(" ")}>
                              {lineTotal.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            {/* Save button */}
                            <div className="flex items-center justify-end self-center">
                              {!isConfirmed && isDirty && (
                                <button
                                  type="button"
                                  onClick={() => void saveItem(item)}
                                  disabled={isSaving}
                                  className="rounded-lg border border-violet-500/40 bg-violet-500/15 px-2 py-1 text-[11px] font-semibold text-violet-300 transition hover:bg-violet-500/25 disabled:opacity-50"
                                >
                                  {isSaving ? "…" : "Save"}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {/* Total row */}
                      <div className="grid grid-cols-[1fr_80px_56px_110px_110px_56px_80px] gap-x-2 border-t border-white/10 bg-black/20 px-3 py-2">
                        <div className="text-xs font-semibold text-zinc-400">
                          {rowItems.length} item{rowItems.length !== 1 ? "s" : ""}
                        </div>
                        <div className="col-span-4 text-right text-xs text-zinc-500 self-center">Received Total</div>
                        <div className="text-right text-sm font-semibold text-white tabular-nums self-center">
                          {rowItems.reduce((s, it) => {
                            const ev = editValues[it.id];
                            const qr = ev ? ev.qty_received : Number(it.qty_received);
                            const up = ev ? ev.unit_price : Number(it.unit_price);
                            return s + qr * up;
                          }, 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
