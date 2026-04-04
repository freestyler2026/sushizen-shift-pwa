"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson, procurementTokenHeaders } from "@/lib/procurementClient";
import DatePicker from "@/components/DatePicker";

type InvoiceRow = {
  id: string;
  request_id: string;
  case_id: string;
  po_id: string;
  request_no: string;
  store_code: string;
  invoice_no: string;
  vendor_name: string;
  invoice_date: string;
  due_date: string;
  invoice_amount: number;
  currency: string;
  match_status: string;
  variance_amount: number;
  variance_reason: string;
  status: string;
  uploaded_by: string;
  file_name: string;
  drive_file_url: string;
  sender_name: string;
  reviewed_by: string;
  reviewed_at: string;
  created_at: string;
};

function formatDateTime(value: string): string {
  return value ? String(value).slice(0, 16).replace("T", " ") : "-";
}

export default function ProcurementInvoicesPage() {
  const auth = getAuth();
  const [allowed, setAllowed] = useState(false);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [requestId, setRequestId] = useState("");
  const [poId, setPoId] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [invoiceAmount, setInvoiceAmount] = useState("0");
  const [statusFilter, setStatusFilter] = useState("");
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [varianceReasonById, setVarianceReasonById] = useState<Record<string, string>>({});
  const [senderNameById, setSenderNameById] = useState<Record<string, string>>({});
  const [fileById, setFileById] = useState<Record<string, File | null>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const qs = new URLSearchParams();
      if (requestId.trim()) qs.set("request_id", requestId.trim());
      if (statusFilter.trim()) qs.set("status", statusFilter.trim());
      qs.set("limit", "200");
      const data = await procurementJson<{ rows: InvoiceRow[] }>(
        `/api/admin/procurement/invoices?${qs.toString()}`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }, [pin, requestId, requestedBy, statusFilter]);

  const createInvoice = async () => {
    if (!requestId.trim() || !invoiceNo.trim()) {
      setError("request_id and invoice_no are required.");
      return;
    }
    setBusy("create");
    setError("");
    try {
      await procurementJson(
        "/api/admin/procurement/invoices",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request_id: requestId.trim(),
            po_id: poId.trim(),
            invoice_no: invoiceNo.trim(),
            vendor_name: vendorName.trim(),
            invoice_date: invoiceDate,
            due_date: dueDate,
            invoice_amount: Number(invoiceAmount || 0),
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

  const matchInvoice = async (invoiceId: string) => {
    setBusy(invoiceId);
    setError("");
    try {
      await procurementJson(
        `/api/admin/procurement/invoices/${invoiceId}/match`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invoice_id: invoiceId,
            variance_reason: varianceReasonById[invoiceId] || "",
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

  const uploadInvoice = async (invoiceId: string) => {
    const file = fileById[invoiceId];
    if (!file) {
      setError("Select a file to upload.");
      return;
    }
    setBusy(`upload:${invoiceId}`);
    setError("");
    try {
      const headers = await procurementTokenHeaders(requestedBy, pin);
      const formData = new FormData();
      formData.set("approver_name", requestedBy);
      formData.set("pin", pin);
      formData.set("sender_name", senderNameById[invoiceId] || requestedBy);
      formData.set("file", file);
      const res = await fetch(`/api/admin/procurement/invoices/${encodeURIComponent(invoiceId)}/upload`, {
        method: "POST",
        headers,
        body: formData,
        cache: "no-store",
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `Upload failed (${res.status})`);
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
            <option value="UPLOADED">UPLOADED</option>
            <option value="MATCHED">MATCHED</option>
            <option value="HOLD">HOLD</option>
          </select>
          <button type="button" onClick={() => void load()} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm hover:bg-neutral-900">
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4 md:grid-cols-3">
        <input value={requestId} onChange={(e) => setRequestId(e.target.value)} placeholder="Request ID" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input value={poId} onChange={(e) => setPoId(e.target.value)} placeholder="PO ID (optional)" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="Invoice no" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="Vendor name" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <DatePicker value={invoiceDate} onChange={setInvoiceDate} />
        <DatePicker value={dueDate} onChange={setDueDate} />
        <input value={invoiceAmount} onChange={(e) => setInvoiceAmount(e.target.value)} placeholder="Invoice amount" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm md:col-span-3" />
        <button type="button" onClick={() => void createInvoice()} disabled={busy === "create"} className="rounded-xl border border-emerald-700/60 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-800/30 disabled:opacity-60 md:col-span-3">
          {busy === "create" ? "Creating..." : "Register Invoice"}
        </button>
      </div>

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-sm font-medium text-neutral-100">{row.invoice_no}</div>
                <div className="mt-1 text-xs text-neutral-400">
                  {row.request_no || row.request_id} | {row.vendor_name || "-"} | {Number(row.invoice_amount || 0).toFixed(2)} {row.currency || "PHP"} | {row.status}
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  Match {row.match_status || "-"} | Variance {Number(row.variance_amount || 0).toFixed(2)} | Reviewed {row.reviewed_by || "-"} at {formatDateTime(row.reviewed_at)}
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  Invoice file {row.file_name || "-"} | Sender {row.sender_name || row.uploaded_by || "-"}
                </div>
                {row.variance_reason ? <div className="mt-2 text-sm text-amber-200">{row.variance_reason}</div> : null}
                {row.drive_file_url ? (
                  <a href={row.drive_file_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-sky-300 underline">
                    Open Invoice in Drive
                  </a>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/admin/procurement/cases/${row.case_id}`} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs hover:bg-neutral-900">
                  Open Case
                </Link>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4">
              <textarea
                value={varianceReasonById[row.id] || ""}
                onChange={(e) => setVarianceReasonById((prev) => ({ ...prev, [row.id]: e.target.value }))}
                placeholder="Variance note or review memo"
                className="min-h-24 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm md:col-span-3"
              />
              <button type="button" onClick={() => void matchInvoice(row.id)} disabled={busy === row.id} className="rounded-xl border border-sky-700/60 bg-sky-900/20 px-3 py-2 text-sm text-sky-200 hover:bg-sky-800/30 disabled:opacity-60">
                {busy === row.id ? "Matching..." : "Run 3-Way Match"}
              </button>
              <input
                value={senderNameById[row.id] || requestedBy}
                onChange={(e) => setSenderNameById((prev) => ({ ...prev, [row.id]: e.target.value }))}
                placeholder="Sender name"
                className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm md:col-span-2"
              />
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
                onChange={(e) => setFileById((prev) => ({ ...prev, [row.id]: e.target.files?.[0] || null }))}
                className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void uploadInvoice(row.id)}
                disabled={busy === `upload:${row.id}`}
                className="rounded-xl border border-emerald-700/60 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-800/30 disabled:opacity-60 md:col-span-4"
              >
                {busy === `upload:${row.id}` ? "Uploading..." : "Upload Invoice to Drive"}
              </button>
            </div>
          </div>
        ))}
        {!rows.length ? <div className="text-sm text-neutral-500">No invoices.</div> : null}
      </div>
    </div>
  );
}
