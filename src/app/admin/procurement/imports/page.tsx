"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";
import DateRangePicker from "@/components/DateRangePicker";
import {
  GLASS_CARD,
  SECONDARY_BUTTON,
  PRIMARY_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  TABLE_HEADER,
  TABLE_ROW,
  TABLE_CELL,
  T_PAGE_TITLE,
  T_SECTION,
  T_CAPTION,
  T_LABEL,
  BADGE_SUCCESS,
} from "@/lib/ui-tokens";
import { RefreshCw, AlertCircle, CheckCircle, Upload, ArrowLeft, FileSpreadsheet } from "lucide-react";

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
  const auth = useMemo(() => getAuth(), []);
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
  const [uploading, setUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

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
    setSuccessMsg("");
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
      const created = Array.isArray(data?.requests) ? data.requests : [];
      setCreatedRequests(created);
      setSelectedIds([]);
      setSuccessMsg(`Created ${created.length} procurement request(s).`);
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) { setError("Please select an Excel file first."); return; }
    if (!requestedBy.trim()) { setError("Approver name is required."); return; }
    if (!pin.trim()) { setError("PIN is required."); return; }
    setUploading(true);
    setError("");
    setSuccessMsg("");
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("approver_name", requestedBy.trim());
      formData.append("pin", pin.trim());
      formData.append("city", city);
      formData.append("skip_zero_quantity", "true");
      const authState = getAuth();
      const token = authState?.accessToken || "";
      const res = await fetch("/api/admin/procurement/import/orders-excel", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || data?.message || `Upload failed (${res.status})`);
      const count = data.record_count ?? data.rows_inserted ?? 0;
      setSuccessMsg(`Imported ${count} rows from "${uploadFile.name}". Refresh to see them below.`);
      setUploadFile(null);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      if (cancelled) return;
      const can = canAccessProcurementAdmin(String((refreshed || auth)?.role || ""), city === "dubai" ? "dubai" : "manila");
      setAllowed(can);
    }
    void init();
    return () => { cancelled = true; };
  }, [auth, city]);

  useEffect(() => {
    if (!allowed) return;
    void load();
  }, [allowed, load]);

  if (!allowed) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Procurement imports are available only to authorized admin roles.
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className={T_PAGE_TITLE}>Import Orders</h2>
          <p className="mt-1 text-sm text-zinc-400">Create procurement requests from imported Excel order data.</p>
        </div>
        <Link href="/admin/procurement" className="inline-flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" />Back to Requests
        </Link>
      </div>

      {/* Upload new Excel file */}
      <div className={`${GLASS_CARD} p-4`}>
        <p className={`${T_SECTION} mb-1`}>Upload Order Workbook</p>
        <p className={`${T_CAPTION} mb-3`}>Upload a Sushi ZEN order Excel file (.xlsx). All tabs (WH, Supplier, CK, CK WH to supplier, etc.) will be parsed automatically.</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className={`${T_LABEL} mb-1.5 block`}>Excel File (.xlsx)</label>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-white/20 bg-white/3 px-4 py-3 text-sm text-zinc-300 hover:border-violet-400/50 hover:bg-white/5 transition-colors">
              <FileSpreadsheet className="h-4 w-4 shrink-0 text-violet-400" />
              <span className="truncate">{uploadFile ? uploadFile.name : "Click to choose file…"}</span>
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setUploadFile(f);
                  setError("");
                  setSuccessMsg("");
                }}
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => void handleUpload()}
            disabled={uploading || !uploadFile}
            className={`${PRIMARY_BUTTON} flex shrink-0 items-center gap-2 self-end`}
          >
            <Upload className="h-4 w-4" />
            {uploading ? "Uploading…" : "Upload & Import"}
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

      {/* Session / filter bar */}
      <div className={`${GLASS_CARD} p-4`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Approver Name</label>
            <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Name" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>PIN</label>
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••••••" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>City</label>
            <select value={city} onChange={(e) => setCity(String(e.target.value || "manila").toLowerCase() === "dubai" ? "dubai" : "manila")} className={SELECT_CLASS}>
              <option value="manila">Manila</option>
              <option value="dubai">Dubai</option>
            </select>
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Source Sheet</label>
            <input value={sourceSheet} onChange={(e) => setSourceSheet(e.target.value)} placeholder="Sheet name" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Store Filter</label>
            <input value={store} onChange={(e) => setStore(e.target.value)} placeholder="Store" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Order Type</label>
            <select value={orderType} onChange={(e) => setOrderType(e.target.value)} className={SELECT_CLASS}>
              <option value="">All order types</option>
              <option value="WH">WH</option>
              <option value="Supplier">Supplier</option>
              <option value="CK">CK</option>
              <option value="CK_WH_to_supplier">CK_WH_to_supplier</option>
            </select>
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Date Range</label>
            <DateRangePicker value={{ from: dateFrom, to: dateTo }} onChange={(range) => { setDateFrom(range.from); setDateTo(range.to); }} />
          </div>
          <div className="flex items-end">
            <button type="button" onClick={() => void load()} disabled={loading} className={`${SECONDARY_BUTTON} w-full flex items-center justify-center gap-2`}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>
      </div>

      {/* Import batches */}
      <div className={`${GLASS_CARD} p-4`}>
        <p className={`${T_SECTION} mb-1`}>Import Batches</p>
        <p className={`${T_CAPTION} mb-3`}>Saved workbook sync history. Use row selection below to raise PRs from imported data.</p>
        <div className="space-y-2">
          {batches.map((batch) => (
            <div key={batch.id} className="rounded-xl border border-white/6 bg-white/3 p-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-medium text-white">{batch.filename}</div>
                <span className={T_CAPTION}>{fmtDateTime(batch.created_at)}</span>
              </div>
              <div className={`mt-1 ${T_CAPTION}`}>
                Records {batch.record_count} | Imported by {batch.imported_by || "-"} | Months {(batch.month_keys_json || []).join(", ") || "-"}
              </div>
              <div className={T_CAPTION}>
                Stores {Object.entries(batch.store_counts_json || {}).map(([key, value]) => `${key}:${value}`).join(" / ") || "-"}
              </div>
            </div>
          ))}
          {!batches.length && <p className={T_CAPTION}>No import batches yet.</p>}
        </div>
      </div>

      {/* Imported rows */}
      <div className={`${GLASS_CARD} p-4`}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className={T_SECTION}>Imported Rows</p>
            <p className={`mt-0.5 ${T_CAPTION}`}>{selectedCount} row(s) selected. Selected rows are grouped by store + date + order type when PRs are created.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-zinc-300">
              <input type="checkbox" checked={submitImmediately} onChange={(e) => setSubmitImmediately(e.target.checked)} />
              Submit immediately
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-zinc-300">
              <input type="checkbox" checked={urgentFlag} onChange={(e) => setUrgentFlag(e.target.checked)} />
              Urgent
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-zinc-300">
              <input type="checkbox" checked={newVendorFlag} onChange={(e) => setNewVendorFlag(e.target.checked)} />
              New vendor
            </label>
            <button
              type="button"
              onClick={() => setSelectedIds(allVisibleSelected ? [] : rows.map((row) => row.id))}
              className={SECONDARY_BUTTON}
            >
              {allVisibleSelected ? "Clear Visible" : "Select Visible"}
            </button>
            <button
              type="button"
              onClick={() => void createRequests()}
              disabled={busy || !selectedIds.length}
              className={`${PRIMARY_BUTTON} flex items-center gap-2`}
            >
              <Upload className="h-3.5 w-3.5" />
              {busy ? "Creating…" : "Create PR from Selected"}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr>
                {["Select","Date","Store","Type","Item","Supplier","Qty","Unit Price","Sheet"].map((h) => (
                  <th key={h} className={`${TABLE_HEADER} px-2 py-2`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const checked = selectedIds.includes(row.id);
                return (
                  <tr key={row.id} className={`${TABLE_ROW} ${checked ? "bg-amber-500/6" : ""}`}>
                    <td className={`${TABLE_CELL} px-2`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleRow(row.id)} />
                    </td>
                    <td className={`${TABLE_CELL} px-2`}>{row.order_date}</td>
                    <td className={`${TABLE_CELL} px-2`}>{row.store || "-"}</td>
                    <td className={`${TABLE_CELL} px-2`}>{row.order_type || "-"}</td>
                    <td className={`${TABLE_CELL} px-2`}>{row.item_name || "-"}</td>
                    <td className={`${TABLE_CELL} px-2`}>{row.supplier || "-"}</td>
                    <td className={`${TABLE_CELL} px-2`}>{Number(row.quantity || 0).toFixed(2)}</td>
                    <td className={`${TABLE_CELL} px-2`}>{Number(row.unit_price || 0).toFixed(2)}</td>
                    <td className={`${TABLE_CELL} px-2`}>{row.source_sheet || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!rows.length && <p className={`mt-3 ${T_CAPTION}`}>No imported rows for the selected filter.</p>}
      </div>

      {/* Created requests result */}
      {createdRequests.length > 0 && (
        <div className="rounded-2xl border border-sky-500/20 bg-sky-500/8 p-4">
          <p className={`${T_SECTION} mb-3`}>Created Requests</p>
          <div className="space-y-2">
            {createdRequests.map((entry, idx) => (
              <div key={entry.request?.id || idx} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/6 bg-white/3 p-3">
                <span className="text-sm font-medium text-white">{entry.request?.request_no || entry.request?.id || "Request"}</span>
                <span className={BADGE_SUCCESS}>{entry.request?.status || "CREATED"}</span>
                <span className={T_CAPTION}>{entry.request?.store_code || "-"} | {entry.request?.request_date || "-"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
