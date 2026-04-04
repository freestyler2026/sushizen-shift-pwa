"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";
import DatePicker from "@/components/DatePicker";

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

export default function ProcurementReceivingPage() {
  const auth = getAuth();
  const [allowed, setAllowed] = useState(false);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [requestId, setRequestId] = useState("");
  const [poId, setPoId] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [qtyExpected, setQtyExpected] = useState("0");
  const [qtyReceived, setQtyReceived] = useState("0");
  const [unit, setUnit] = useState("");
  const [unitPrice, setUnitPrice] = useState("0");
  const [qualityStatus, setQualityStatus] = useState("ACCEPTED");
  const [varianceReason, setVarianceReason] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [rows, setRows] = useState<ReceivingRow[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const qs = new URLSearchParams();
      if (requestId.trim()) qs.set("request_id", requestId.trim());
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
    }
  }, [pin, requestId, requestedBy, statusFilter]);

  const createReceiving = async () => {
    if (!requestId.trim()) {
      setError("request_id is required.");
      return;
    }
    setBusy("create");
    setError("");
    try {
      await procurementJson(
        "/api/admin/procurement/receiving",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request_id: requestId.trim(),
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
    try {
      await procurementJson(
        `/api/admin/procurement/receiving/${receivingId}/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            receiving_id: receivingId,
            approver_name: requestedBy,
            pin,
          }),
        },
        requestedBy,
        pin,
      );
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
    if (initialRequestId) setRequestId((prev) => prev || initialRequestId);
  }, []);

  useEffect(() => {
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      const can = canAccessProcurementAdmin(
        String((refreshed || auth)?.role || ""),
        String((refreshed || auth)?.city || "").toLowerCase() === "dubai" ? "dubai" : "manila",
      );
      setAllowed(can);
      if (can) await load();
    }
    void init();
  }, [auth, load]);

  if (!allowed) {
    return <div className="text-sm text-red-300">Procurement page is available only to authorized Manila admin roles.</div>;
  }

  return (
    <div className="space-y-4">
      {error ? <div className="text-sm text-red-300">{error}</div> : null}

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/20 p-3 md:grid-cols-4">
        <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Approver name" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input value={requestId} onChange={(e) => setRequestId(e.target.value)} placeholder="Request ID filter" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <div className="flex gap-2">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="flex-1 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm">
            <option value="">All statuses</option>
            <option value="DRAFT">DRAFT</option>
            <option value="CONFIRMED">CONFIRMED</option>
          </select>
          <button type="button" onClick={() => void load()} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm hover:bg-neutral-900">
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4 md:grid-cols-3">
        <input value={requestId} onChange={(e) => setRequestId(e.target.value)} placeholder="Request ID" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input value={poId} onChange={(e) => setPoId(e.target.value)} placeholder="PO ID (optional)" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="Vendor name" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <DatePicker value={deliveryDate} onChange={setDeliveryDate} />
        <input value={qtyExpected} onChange={(e) => setQtyExpected(e.target.value)} placeholder="Qty expected" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input value={qtyReceived} onChange={(e) => setQtyReceived(e.target.value)} placeholder="Qty received" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unit" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="Unit price" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <select value={qualityStatus} onChange={(e) => setQualityStatus(e.target.value)} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm">
          <option value="ACCEPTED">ACCEPTED</option>
          <option value="QUALITY_REVIEW">QUALITY_REVIEW</option>
          <option value="REJECTED">REJECTED</option>
        </select>
        <textarea value={varianceReason} onChange={(e) => setVarianceReason(e.target.value)} placeholder="Variance or quality note" className="min-h-24 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm md:col-span-3" />
        <button type="button" onClick={() => void createReceiving()} disabled={busy === "create"} className="rounded-xl border border-emerald-700/60 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-800/30 disabled:opacity-60 md:col-span-3">
          {busy === "create" ? "Creating..." : "Create Receiving"}
        </button>
      </div>

      <div className="space-y-3">
        {rows.map((row) => {
          const hasVariance = Number(row.shortage_qty || 0) > 0 || Number(row.excess_qty || 0) > 0 || row.quality_status !== "ACCEPTED";
          return (
            <div key={row.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-sm font-medium text-neutral-100">{row.receiving_no}</div>
                  <div className="mt-1 text-xs text-neutral-400">
                    {row.request_no || row.parent_case_no} | {row.vendor_name || "-"} | {row.store_code || "-"} | {row.status}
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    Expected {Number(row.qty_expected || 0).toFixed(2)} {row.unit || ""} / Received {Number(row.qty_received || 0).toFixed(2)} / Short {Number(row.shortage_qty || 0).toFixed(2)} / Excess {Number(row.excess_qty || 0).toFixed(2)}
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    Quality {row.quality_status || "-"} | Amount {Number(row.amount_received || 0).toFixed(2)} PHP | Confirmed {row.confirmed_by || "-"} at {formatDateTime(row.confirmed_at)}
                  </div>
                  {row.variance_reason ? <div className="mt-2 text-sm text-amber-200">{row.variance_reason}</div> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {hasVariance ? <div className="rounded-xl border border-amber-700/60 bg-amber-900/20 px-3 py-2 text-xs text-amber-200">Variance detected</div> : null}
                  <Link href={`/admin/procurement/cases/${row.case_id}`} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs hover:bg-neutral-900">
                    Open Case
                  </Link>
                  <button
                    type="button"
                    onClick={() => void confirmReceiving(row.id)}
                    disabled={busy === row.id || row.status === "CONFIRMED"}
                    className="rounded-xl border border-sky-700/60 bg-sky-900/20 px-3 py-2 text-xs text-sky-200 hover:bg-sky-800/30 disabled:opacity-60"
                  >
                    {busy === row.id ? "Confirming..." : row.status === "CONFIRMED" ? "Confirmed" : "Confirm"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {!rows.length ? <div className="text-sm text-neutral-500">No receiving records.</div> : null}
      </div>
    </div>
  );
}
