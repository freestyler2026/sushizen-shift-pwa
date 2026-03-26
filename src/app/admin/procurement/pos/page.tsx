"use client";

import { useCallback, useEffect, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";

type PoRow = {
  id: string;
  request_id: string;
  parent_case_no: string;
  po_no: string;
  vendor_name: string;
  amount: number;
  status: string;
  created_at: string;
};

export default function ProcurementPoPage() {
  const auth = getAuth();
  const [allowed, setAllowed] = useState(false);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [requestId, setRequestId] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [amount, setAmount] = useState("0");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [rows, setRows] = useState<PoRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await procurementJson<{ rows: PoRow[] }>(
        `/api/admin/procurement/pos?request_id=${encodeURIComponent(requestId)}`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }, [pin, requestId, requestedBy]);

  const createPo = async () => {
    if (!requestId.trim()) {
      setError("request_id is required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await procurementJson(
        "/api/admin/procurement/pos/create",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request_id: requestId.trim(),
            vendor_name: vendorName,
            amount: Number(amount || 0),
            delivery_date: deliveryDate,
            delivery_address: deliveryAddress,
            payment_terms: paymentTerms,
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
      setBusy(false);
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
      const can = canAccessProcurementAdmin(refreshed || auth);
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
        <input value={requestId} onChange={(e) => setRequestId(e.target.value)} placeholder="Request ID" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <button type="button" onClick={() => void load()} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm hover:bg-neutral-900">
          Refresh
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4 md:grid-cols-2">
        <input value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="Vendor name" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Delivery address" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="Payment terms" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm md:col-span-2" />
        <button type="button" onClick={() => void createPo()} disabled={busy} className="rounded-xl border border-emerald-700/60 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-800/30 disabled:opacity-60 md:col-span-2">
          {busy ? "Creating..." : "Create PO"}
        </button>
      </div>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
            <div className="text-sm font-medium text-neutral-100">{row.po_no}</div>
            <div className="mt-1 text-xs text-neutral-400">
              {row.parent_case_no} | {row.vendor_name || "-"} | {Number(row.amount || 0).toFixed(2)} PHP | {row.status}
            </div>
          </div>
        ))}
        {!rows.length ? <div className="text-sm text-neutral-500">No purchase orders.</div> : null}
      </div>
    </div>
  );
}
