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
import { RefreshCw, AlertCircle, CheckCircle, ChevronRight } from "lucide-react";

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
  return <span className={BADGE_INFO}>{status || "-"}</span>;
}

export default function ProcurementReceivingPage() {
  const auth = useMemo(() => getAuth(), []);
  const [allowed, setAllowed] = useState(false);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());

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

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const qs = new URLSearchParams();
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
  }, [filterRequestId, pin, requestedBy, statusFilter]);

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
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      const resolvedAuth = refreshed || auth;
      const can = canAccessProcurementAdmin(
        String(resolvedAuth?.role || ""),
        String(resolvedAuth?.city || "").toLowerCase() === "dubai" ? "dubai" : "manila",
      );
      setAllowed(can);
      if (can) await load();
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
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className={T_PAGE_TITLE}>Receiving Records</h2>
          <p className="mt-1 text-sm text-zinc-400">Record and confirm delivery of procurement orders.</p>
        </div>
        <div className="flex items-center gap-2">
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
        <div className={`${GLASS_CARD} p-5`}>
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
      {!loading && !rows.length && (
        <div className={`${GLASS_CARD} p-10 flex flex-col items-center gap-3`}>
          <p className="text-sm text-zinc-500">No receiving records found.</p>
        </div>
      )}

      {/* Records list */}
      <div className="space-y-3">
        {rows.map((row) => {
          const hasVariance = Number(row.shortage_qty || 0) > 0 || Number(row.excess_qty || 0) > 0 || row.quality_status !== "ACCEPTED";
          const isConfirmed = String(row.status || "").toUpperCase() === "CONFIRMED";
          return (
            <div
              key={row.id}
              className={[
                "rounded-2xl border p-4 transition-all",
                hasVariance && !isConfirmed
                  ? "border-amber-500/30 bg-amber-950/10"
                  : "border-white/8 bg-white/4",
              ].join(" ")}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-white">{row.receiving_no}</span>
                    {statusBadge(row.status)}
                    {qualityBadge(row.quality_status)}
                    {hasVariance && !isConfirmed && <span className={BADGE_WARNING}>⚠ Variance</span>}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
                    <span>Req: <span className="text-zinc-200">{row.request_no || row.parent_case_no || "-"}</span></span>
                    <span>Vendor: <span className="text-zinc-200">{row.vendor_name || "-"}</span></span>
                    <span>Store: <span className="text-zinc-200">{row.store_code || "-"}</span></span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                    <span>Expected: <span className="text-zinc-300">{Number(row.qty_expected || 0).toFixed(2)} {row.unit}</span></span>
                    <span>Received: <span className="text-zinc-300">{Number(row.qty_received || 0).toFixed(2)}</span></span>
                    {Number(row.shortage_qty || 0) > 0 && <span className="text-red-400">Short: {Number(row.shortage_qty || 0).toFixed(2)}</span>}
                    {Number(row.excess_qty || 0) > 0 && <span className="text-amber-400">Excess: {Number(row.excess_qty || 0).toFixed(2)}</span>}
                    <span>Amount: <span className="text-zinc-300">{Number(row.amount_received || 0).toFixed(2)}</span></span>
                  </div>
                  {isConfirmed && (
                    <p className="text-xs text-zinc-500">
                      Confirmed by {row.confirmed_by || "-"} at {formatDateTime(row.confirmed_at)}
                    </p>
                  )}
                  {row.variance_reason && (
                    <p className="text-sm text-amber-300">{row.variance_reason}</p>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  {row.case_id && (
                    <Link
                      href={`/admin/procurement/cases/${row.case_id}`}
                      className={`${SMALL_BUTTON} flex items-center gap-1`}
                    >
                      Case <ChevronRight className="h-3 w-3" />
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => void confirmReceiving(row.id)}
                    disabled={busy === row.id || isConfirmed}
                    className={
                      isConfirmed
                        ? `${SMALL_BUTTON} opacity-50 cursor-not-allowed flex items-center gap-1.5`
                        : `${PRIMARY_BUTTON} flex items-center gap-1.5 px-4 py-2 text-xs`
                    }
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                    {busy === row.id ? "Confirming…" : isConfirmed ? "Confirmed" : "Confirm"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
