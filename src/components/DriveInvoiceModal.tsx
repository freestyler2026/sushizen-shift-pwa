"use client";

import { useState, useEffect, useRef } from "react";
import type { DriveInvoice, LineItem } from "./DriveInvoiceInbox";

interface Props {
  invoice: DriveInvoice;
  authHeaders: Record<string, string>;
  onClose: () => void;
  onUpdated: (inv: DriveInvoice) => void;
}

interface POCandidate {
  id: string;
  po_no: string;
  vendor_name: string;
  amount: number | null;
  delivery_date: string | null;
  status: string;
  score?: number;
}

function ConfidenceWarnings({ notes }: { notes: string[] }) {
  if (!notes || notes.length === 0) return null;
  return (
    <div className="mb-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-2 space-y-1">
      {notes.map((n, i) => (
        <p key={i} className="text-yellow-300 text-xs flex items-start gap-1">
          <span>⚠</span>
          <span>{n}</span>
        </p>
      ))}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  type?: string;
  readOnly?: boolean;
}) {
  return (
    <div>
      <label className="block text-white/50 text-[11px] mb-1">{label}</label>
      <input
        type={type}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        className={`w-full rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-amber-500/50 ${
          readOnly ? "opacity-50 cursor-not-allowed" : ""
        }`}
      />
    </div>
  );
}

export default function DriveInvoiceModal({ invoice, authHeaders, onClose, onUpdated }: Props) {
  const [vendorName, setVendorName] = useState(invoice.vendor_name || "");
  const [invoiceNumber, setInvoiceNumber] = useState(invoice.invoice_number || "");
  const [invoiceDate, setInvoiceDate] = useState(invoice.invoice_date || "");
  const [dueDate, setDueDate] = useState(invoice.due_date || "");
  const [totalAmount, setTotalAmount] = useState(
    invoice.total_amount != null ? String(invoice.total_amount) : ""
  );
  const [currency, setCurrency] = useState(invoice.currency || "AED");
  const [notes, setNotes] = useState(invoice.notes || "");
  const [lineItems, setLineItems] = useState<LineItem[]>(invoice.line_items || []);
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState("");
  const [previewError, setPreviewError] = useState(false);

  // PO match state
  const [matchedPoId, setMatchedPoId] = useState(invoice.matched_po_id);
  const [matchedPoNo, setMatchedPoNo] = useState(invoice.matched_po_no);
  const [matchedPoVendor, setMatchedPoVendor] = useState(invoice.matched_po_vendor);
  const [matchedPoAmount, setMatchedPoAmount] = useState(invoice.matched_po_amount);
  const [matchConfidence, setMatchConfidence] = useState(invoice.match_confidence);
  const [matchMethod, setMatchMethod] = useState(invoice.match_method || "");
  const [showPoSearch, setShowPoSearch] = useState(false);
  const [poQuery, setPoQuery] = useState("");
  const [poCandidates, setPoCandidates] = useState<POCandidate[]>([]);
  const [poSearching, setPoSearching] = useState(false);
  const [poSaving, setPoSaving] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isPdf = (invoice.drive_file_name || "").toLowerCase().endsWith(".pdf");
  const driveFileId = invoice.drive_file_id;
  const previewUrl = `https://drive.google.com/file/d/${driveFileId}/preview`;

  const buildPayload = (reviewStatus: string) => ({
    vendor_name: vendorName,
    invoice_number: invoiceNumber,
    invoice_date: invoiceDate || null,
    due_date: dueDate || null,
    total_amount: totalAmount ? Number(totalAmount) : null,
    currency,
    line_items: lineItems,
    notes,
    review_status: reviewStatus,
  });

  const submit = async (reviewStatus: string) => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/drive-invoices/${invoice.id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(reviewStatus)),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.detail || data.message || "Save failed");
        return;
      }
      onUpdated({ ...invoice, ...buildPayload(reviewStatus) });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSaving(false);
    }
  };

  const retryOcr = async () => {
    setRetrying(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/drive-invoices/${invoice.id}/retry-ocr`, {
        method: "POST",
        headers: authHeaders,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.detail || "Retry failed");
        return;
      }
      onUpdated({ ...invoice, ocr_status: "pending" });
    } catch {
      setError("Network error");
    } finally {
      setRetrying(false);
    }
  };

  const updateLineItem = (i: number, field: keyof LineItem, value: string) => {
    setLineItems((prev) =>
      prev.map((item, idx) =>
        idx === i
          ? {
              ...item,
              [field]: field === "qty" || field === "unit_price" || field === "amount"
                ? value === "" ? null : Number(value)
                : value,
            }
          : item
      )
    );
  };

  const removeLineItem = (i: number) => {
    setLineItems((prev) => prev.filter((_, idx) => idx !== i));
  };

  const addLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      { description: "", qty: null, unit: "", unit_price: null, amount: null },
    ]);
  };

  // PO search with debounce
  useEffect(() => {
    if (!showPoSearch) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setPoSearching(true);
      try {
        const q = encodeURIComponent(poQuery);
        const res = await fetch(
          `/api/admin/drive-invoices/${invoice.id}/po-candidates?q=${q}&limit=10`,
          { headers: authHeaders }
        );
        if (res.ok) {
          const data = await res.json();
          setPoCandidates(data.candidates ?? []);
        }
      } catch {
        // silent
      } finally {
        setPoSearching(false);
      }
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [poQuery, showPoSearch, invoice.id, authHeaders]);

  const openPoSearch = () => {
    setPoQuery(invoice.vendor_name || "");
    setShowPoSearch(true);
  };

  const selectPO = async (candidate: POCandidate) => {
    setPoSaving(true);
    try {
      const res = await fetch(`/api/admin/drive-invoices/${invoice.id}/set-po-match`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ po_id: candidate.id, matched_by: "" }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setMatchedPoId(candidate.id);
        setMatchedPoNo(candidate.po_no);
        setMatchedPoVendor(candidate.vendor_name);
        setMatchedPoAmount(candidate.amount);
        setMatchConfidence(null);
        setMatchMethod("manual");
        setShowPoSearch(false);
        onUpdated({
          ...invoice,
          matched_po_id: candidate.id,
          matched_po_no: candidate.po_no,
          matched_po_vendor: candidate.vendor_name,
          matched_po_amount: candidate.amount,
          match_confidence: null,
          match_method: "manual",
        });
      }
    } catch {
      // silent
    } finally {
      setPoSaving(false);
    }
  };

  const clearPO = async () => {
    setPoSaving(true);
    try {
      const res = await fetch(`/api/admin/drive-invoices/${invoice.id}/set-po-match`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ po_id: null, matched_by: "" }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setMatchedPoId(null);
        setMatchedPoNo(null);
        setMatchedPoVendor(null);
        setMatchedPoAmount(null);
        setMatchConfidence(null);
        setMatchMethod("");
        setShowPoSearch(false);
        onUpdated({
          ...invoice,
          matched_po_id: null,
          matched_po_no: null,
          matched_po_vendor: null,
          matched_po_amount: null,
          match_confidence: null,
          match_method: "",
        });
      }
    } catch {
      // silent
    } finally {
      setPoSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl bg-[#1a1a2e] border border-white/15 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-lg">📄</span>
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm truncate">{invoice.drive_file_name}</p>
              <p className="text-white/40 text-xs">{invoice.store_name} · {invoice.city.toUpperCase()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {(invoice.ocr_status === "error" || invoice.ocr_status === "skipped") && (
              <button
                onClick={retryOcr}
                disabled={retrying}
                className="text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all border border-white/10"
              >
                {retrying ? "Queuing…" : "↺ Retry OCR"}
              </button>
            )}
            <a
              href={invoice.drive_web_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all border border-white/10"
            >
              Open in Drive ↗
            </a>
            <button
              onClick={onClose}
              className="text-white/40 hover:text-white transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-col lg:flex-row flex-1 overflow-hidden min-h-0">
          {/* Left: file preview */}
          <div className="w-full lg:w-[45%] border-b lg:border-b-0 lg:border-r border-white/10 bg-black/20 shrink-0 h-48 lg:h-auto flex flex-col">
            {!previewError ? (
              <iframe
                src={previewUrl}
                title="Invoice preview"
                className="w-full flex-1 border-0"
                onError={() => setPreviewError(true)}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-white/40">
                <span className="text-4xl">{isPdf ? "📄" : "🖼"}</span>
                <p className="text-sm">Preview unavailable</p>
                <a
                  href={invoice.drive_web_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 hover:text-amber-300 text-sm underline"
                >
                  Open in Google Drive
                </a>
              </div>
            )}
          </div>

          {/* Right: form */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <ConfidenceWarnings notes={invoice.confidence_notes} />

            {/* Core fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Field label="Vendor Name" value={vendorName} onChange={setVendorName} />
              </div>
              <Field label="Invoice Number" value={invoiceNumber} onChange={setInvoiceNumber} />
              <div>
                <label className="block text-white/50 text-[11px] mb-1">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
                >
                  {["AED", "USD", "PHP", "EUR", "GBP"].map((c) => (
                    <option key={c} value={c} className="bg-[#1a1a2e]">{c}</option>
                  ))}
                </select>
              </div>
              <Field label="Invoice Date" value={invoiceDate} onChange={setInvoiceDate} type="date" />
              <Field label="Due Date" value={dueDate} onChange={setDueDate} type="date" />
              <div className="col-span-2">
                <Field label="Total Amount" value={totalAmount} onChange={setTotalAmount} type="number" />
              </div>
            </div>

            {/* PO Match section */}
            <div className="rounded-xl border border-blue-500/25 bg-blue-500/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-blue-300 text-[11px] font-semibold tracking-wide uppercase">
                  Purchase Order Match
                </p>
                <div className="flex items-center gap-1.5">
                  {matchedPoId && (
                    <button
                      onClick={clearPO}
                      disabled={poSaving}
                      className="text-[10px] px-2 py-0.5 rounded bg-white/10 hover:bg-white/15 text-white/40 hover:text-white/70 transition-all"
                    >
                      Clear
                    </button>
                  )}
                  <button
                    onClick={showPoSearch ? () => setShowPoSearch(false) : openPoSearch}
                    disabled={poSaving}
                    className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 hover:text-blue-200 transition-all border border-blue-500/30"
                  >
                    {showPoSearch ? "Cancel" : matchedPoId ? "Change PO" : "Link PO"}
                  </button>
                </div>
              </div>

              {matchedPoId && !showPoSearch ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-white text-xs font-mono">{matchedPoNo}</p>
                    <p className="text-white/60 text-[11px] truncate">{matchedPoVendor}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {matchedPoAmount != null && (
                      <p className="text-white/80 text-xs font-mono">
                        AED {Number(matchedPoAmount).toLocaleString()}
                      </p>
                    )}
                    <div className="flex items-center gap-1 justify-end mt-0.5">
                      {matchConfidence != null && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-mono">
                          {Math.round(matchConfidence * 100)}%
                        </span>
                      )}
                      <span className="text-[10px] text-white/30">
                        {matchMethod === "auto" ? "auto-matched" : "manual"}
                      </span>
                    </div>
                  </div>
                </div>
              ) : !showPoSearch ? (
                <p className="text-white/30 text-xs italic">No PO linked — click Link PO to search</p>
              ) : null}

              {showPoSearch && (
                <div className="space-y-2">
                  <input
                    autoFocus
                    value={poQuery}
                    onChange={(e) => setPoQuery(e.target.value)}
                    placeholder="Search vendor or PO number…"
                    className="w-full rounded-lg bg-white/5 border border-blue-500/30 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-400/60 placeholder:text-white/30"
                  />
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-white/10 divide-y divide-white/5">
                    {poSearching ? (
                      <p className="text-white/40 text-xs px-3 py-2 text-center">Searching…</p>
                    ) : poCandidates.length === 0 ? (
                      <p className="text-white/30 text-xs px-3 py-2 text-center italic">No POs found</p>
                    ) : (
                      poCandidates.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => selectPO(c)}
                          disabled={poSaving}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-blue-500/10 text-left transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="text-white text-xs font-mono">{c.po_no}</p>
                            <p className="text-white/50 text-[10px] truncate">{c.vendor_name}</p>
                          </div>
                          <div className="text-right shrink-0">
                            {c.amount != null && (
                              <p className="text-white/70 text-[10px] font-mono">
                                AED {Number(c.amount).toLocaleString()}
                              </p>
                            )}
                            {c.delivery_date && (
                              <p className="text-white/30 text-[10px]">{c.delivery_date}</p>
                            )}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Line items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-white/50 text-[11px]">Line Items ({lineItems.length})</p>
                <button
                  onClick={addLineItem}
                  className="text-xs text-amber-400/70 hover:text-amber-400"
                >
                  + Add row
                </button>
              </div>
              {lineItems.length > 0 && (
                <div className="rounded-lg overflow-x-auto border border-white/10">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-white/5 text-white/40">
                        <th className="text-left px-2 py-1.5">Description</th>
                        <th className="text-right px-2 py-1.5 w-16">Qty</th>
                        <th className="text-left px-2 py-1.5 w-16">Unit</th>
                        <th className="text-right px-2 py-1.5 w-20">Price</th>
                        <th className="text-right px-2 py-1.5 w-20">Amount</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((item, i) => (
                        <tr key={i} className="border-t border-white/5">
                          <td className="px-2 py-1">
                            <input
                              value={item.description}
                              onChange={(e) => updateLineItem(i, "description", e.target.value)}
                              className="w-full bg-transparent text-white focus:outline-none"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="number"
                              value={item.qty ?? ""}
                              onChange={(e) => updateLineItem(i, "qty", e.target.value)}
                              className="w-full bg-transparent text-white text-right focus:outline-none"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              value={item.unit}
                              onChange={(e) => updateLineItem(i, "unit", e.target.value)}
                              className="w-full bg-transparent text-white focus:outline-none"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="number"
                              value={item.unit_price ?? ""}
                              onChange={(e) => updateLineItem(i, "unit_price", e.target.value)}
                              className="w-full bg-transparent text-white text-right focus:outline-none"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="number"
                              value={item.amount ?? ""}
                              onChange={(e) => updateLineItem(i, "amount", e.target.value)}
                              className="w-full bg-transparent text-white text-right focus:outline-none"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <button
                              onClick={() => removeLineItem(i)}
                              className="text-white/30 hover:text-red-400"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-white/50 text-[11px] mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-amber-500/50 resize-none"
              />
            </div>

            {error && (
              <p className="text-red-400 text-xs bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
            )}
          </div>
        </div>

        {/* Footer buttons */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-white/10 shrink-0 bg-black/20">
          <button
            onClick={() => submit("pending_review")}
            disabled={saving}
            className="text-sm px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all border border-white/10 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Draft"}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => submit("rejected")}
              disabled={saving}
              className="text-sm px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 hover:text-red-200 transition-all border border-red-500/30 disabled:opacity-50"
            >
              Reject
            </button>
            <button
              onClick={() => submit("approved")}
              disabled={saving}
              className="text-sm px-4 py-2 rounded-xl bg-green-500/20 hover:bg-green-500/30 text-green-300 hover:text-green-200 transition-all border border-green-500/30 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Approve"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
