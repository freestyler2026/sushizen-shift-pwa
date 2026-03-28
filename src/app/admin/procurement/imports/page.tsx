"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";

type ImportBatchRow = {
  id: string;
  filename: string;
  file_sha256: string;
  imported_by: string;
  record_count: number;
  sheet_names_json: string[];
  month_keys_json: string[];
  store_counts_json: Record<string, number>;
  order_type_counts_json: Record<string, number>;
  created_at: string;
};

type ImportRow = {
  id: string;
  batch_id: string;
  source_sheet: string;
  store: string;
  order_type: string;
  order_date: string;
  category: string;
  section: string;
  supplier: string;
  item_name: string;
  unit: string;
  unit_price: number;
  quantity: number;
  receive: number;
  amount: number;
};

type CreatedRequestResult = {
  request?: {
    id: string;
    request_no: string;
    store_code: string;
    request_date: string;
    status: string;
  };
  import_rows?: string[];
};

function fmtDateTime(value: string): string {
  return value ? String(value).slice(0, 16).replace("T", " ") : "-";
}

export default function ProcurementImportsPage() {
  const auth = getAuth();
  const [allowed, setAllowed] = useState(false);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [city, setCity] = useState((auth?.city || "manila").toLowerCase() === "dubai" ? "dubai" : "manila");
  const [store, setStore] = useState("");
  const [orderType, setOrderType] = useState("");
  const [sourceSheet, setSourceSheet] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [submitImmediately, setSubmitImmediately] = useState(true);
  const [urgentFlag, setUrgentFlag] = useState(false);
  const [newVendorFlag, setNewVendorFlag] = useState(false);
  const [batches, setBatches] = useState<ImportBatchRow[]>([]);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [createdRequests, setCreatedRequests] = useState<CreatedRequestResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selectedCount = selectedIds.length;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const batchData = await procurementJson<{ rows: ImportBatchRow[] }>(
        `/api/admin/procurement/import/orders-excel/batches?city=${encodeURIComponent(city)}&limit=20`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      const qs = new URLSearchParams({ city, limit: "500" });
      if (store.trim()) qs.set("store", store.trim());
      if (orderType.trim()) qs.set("order_type", orderType.trim());
      if (sourceSheet.trim()) qs.set("source_sheet", sourceSheet.trim());
      if (dateFrom.trim()) qs.set("date_from", dateFrom.trim());
      if (dateTo.trim()) qs.set("date_to", dateTo.trim());
      const rowData = await procurementJson<{ rows: ImportRow[] }>(
        `/api/admin/procurement/import/orders-excel/rows?${qs.toString()}`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      setBatches(Array.isArray(batchData?.rows) ? batchData.rows : []);
      setRows(Array.isArray(rowData?.rows) ? rowData.rows : []);
      setSelectedIds((prev) => prev.filter((id) => (rowData?.rows || []).some((row) => row.id === id)));
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [city, dateFrom, dateTo, orderType, pin, requestedBy, sourceSheet, store]);

  const allVisibleSelected = useMemo(() => rows.length > 0 && rows.every((row) => selectedIds.includes(row.id)), [rows, selectedIds]);

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const createRequests = async () => {
    if (!selectedIds.length) {
      setError("Select at least one imported row.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await procurementJson<{ requests: CreatedRequestResult[] }>(
        `/api/admin/procurement/import/orders-excel/create-requests`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            city,
            row_ids: selectedIds,
            requested_by: requestedBy,
            approver_name: requestedBy,
            pin,
            submit_immediately: submitImmediately,
            urgent_flag: urgentFlag,
            new_vendor_flag: newVendorFlag,
          }),
        },
        requestedBy,
        pin,
      );
      setCreatedRequests(Array.isArray(data?.requests) ? data.requests : []);
      setSelectedIds([]);
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

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
    return <div className="text-sm text-red-300">Procurement imports are available only to authorized Manila admin roles.</div>;
  }

  return (
    <div className="space-y-4">
      {error ? <div className="text-sm text-red-300">{error}</div> : null}

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/20 p-3 lg:grid-cols-4">
        <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Approver name" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <select value={city} onChange={(e) => setCity((String(e.target.value || "manila").toLowerCase() === "dubai" ? "dubai" : "manila"))} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm">
          <option value="manila">Manila</option>
          <option value="dubai">Dubai</option>
        </select>
        <input value={sourceSheet} onChange={(e) => setSourceSheet(e.target.value)} placeholder="Source sheet" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <button type="button" onClick={() => void load()} disabled={loading} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm hover:bg-neutral-900 disabled:opacity-60 lg:col-span-2">
          {loading ? "Refreshing..." : "Refresh"}
        </button>
        <input value={store} onChange={(e) => setStore(e.target.value)} placeholder="Store filter" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <select value={orderType} onChange={(e) => setOrderType(e.target.value)} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm">
          <option value="">All order types</option>
          <option value="WH">WH</option>
          <option value="Supplier">Supplier</option>
          <option value="CK">CK</option>
          <option value="CK_WH_to_supplier">CK_WH_to_supplier</option>
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm font-medium">Import Batches</div>
            <div className="mt-1 text-xs text-neutral-400">Saved workbook sync history. Use row selection below to raise PR from imported data.</div>
          </div>
          <Link href="/admin/procurement" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs hover:bg-neutral-900">
            Back to Requests
          </Link>
        </div>
        <div className="mt-3 space-y-2">
          {batches.map((batch) => (
            <div key={batch.id} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3 text-xs">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="text-sm text-white">{batch.filename}</div>
                <div className="text-neutral-400">{fmtDateTime(batch.created_at)}</div>
              </div>
              <div className="mt-2 text-neutral-400">
                Records {batch.record_count} | Imported by {batch.imported_by || "-"} | Months {(batch.month_keys_json || []).join(", ") || "-"}
              </div>
              <div className="mt-1 text-neutral-500">
                Stores {Object.entries(batch.store_counts_json || {}).map(([key, value]) => `${key}:${value}`).join(" / ") || "-"}
              </div>
            </div>
          ))}
          {!batches.length ? <div className="text-sm text-neutral-500">No import batches yet.</div> : null}
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm font-medium">Imported Rows</div>
            <div className="mt-1 text-xs text-neutral-400">{selectedCount} row(s) selected. Selected rows are grouped by store + date + order type when PRs are created.</div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <label className="inline-flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2">
              <input type="checkbox" checked={submitImmediately} onChange={(e) => setSubmitImmediately(e.target.checked)} />
              Submit immediately
            </label>
            <label className="inline-flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2">
              <input type="checkbox" checked={urgentFlag} onChange={(e) => setUrgentFlag(e.target.checked)} />
              Urgent
            </label>
            <label className="inline-flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2">
              <input type="checkbox" checked={newVendorFlag} onChange={(e) => setNewVendorFlag(e.target.checked)} />
              New vendor
            </label>
            <button
              type="button"
              onClick={() => setSelectedIds(allVisibleSelected ? [] : rows.map((row) => row.id))}
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 hover:bg-neutral-900"
            >
              {allVisibleSelected ? "Clear Visible" : "Select Visible"}
            </button>
            <button
              type="button"
              onClick={() => void createRequests()}
              disabled={busy || !selectedIds.length}
              className="rounded-xl border border-emerald-700/60 bg-emerald-900/20 px-3 py-2 text-emerald-200 hover:bg-emerald-800/30 disabled:opacity-60"
            >
              {busy ? "Creating..." : "Create PR from Selected"}
            </button>
          </div>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="text-neutral-400">
              <tr>
                <th className="px-2 py-2">Select</th>
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Store</th>
                <th className="px-2 py-2">Type</th>
                <th className="px-2 py-2">Item</th>
                <th className="px-2 py-2">Supplier</th>
                <th className="px-2 py-2">Qty</th>
                <th className="px-2 py-2">Unit Price</th>
                <th className="px-2 py-2">Sheet</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const checked = selectedIds.includes(row.id);
                return (
                  <tr key={row.id} className={checked ? "bg-amber-950/10" : ""}>
                    <td className="px-2 py-2">
                      <input type="checkbox" checked={checked} onChange={() => toggleRow(row.id)} />
                    </td>
                    <td className="px-2 py-2">{row.order_date}</td>
                    <td className="px-2 py-2">{row.store || "-"}</td>
                    <td className="px-2 py-2">{row.order_type || "-"}</td>
                    <td className="px-2 py-2">{row.item_name || "-"}</td>
                    <td className="px-2 py-2">{row.supplier || "-"}</td>
                    <td className="px-2 py-2">{Number(row.quantity || 0).toFixed(2)}</td>
                    <td className="px-2 py-2">{Number(row.unit_price || 0).toFixed(2)}</td>
                    <td className="px-2 py-2">{row.source_sheet || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!rows.length ? <div className="mt-3 text-sm text-neutral-500">No imported rows for the selected filter.</div> : null}
      </div>

      {createdRequests.length ? (
        <div className="rounded-2xl border border-sky-800/60 bg-sky-950/10 p-4">
          <div className="text-sm font-medium text-sky-100">Created Requests</div>
          <div className="mt-3 space-y-2">
            {createdRequests.map((entry, idx) => (
              <div key={`${entry.request?.id || idx}`} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3 text-xs">
                <div className="text-sm text-white">{entry.request?.request_no || entry.request?.id || "Request"}</div>
                <div className="mt-1 text-neutral-400">
                  {entry.request?.store_code || "-"} | {entry.request?.request_date || "-"} | {entry.request?.status || "-"}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
