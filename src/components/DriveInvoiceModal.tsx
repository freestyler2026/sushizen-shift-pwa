"use client";

import { useState, useEffect, useRef } from "react";
import type { DriveInvoice, LineItem } from "./DriveInvoiceInbox";
import PhotoLoupe from "./PhotoLoupe";

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
  const [amountExclTax, setAmountExclTax] = useState(
    invoice.amount_excl_tax != null ? String(invoice.amount_excl_tax) : ""
  );
  const [taxAmount, setTaxAmount] = useState(
    invoice.tax_amount != null ? String(invoice.tax_amount) : ""
  );
  const [taxRatePct, setTaxRatePct] = useState(
    invoice.tax_rate_pct != null ? String(invoice.tax_rate_pct) : ""
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
  // Open when nothing downstream will read them. A linked PO means Receiving
  // checks these line by line; without one this screen is the only place they
  // are ever seen, so it must not hide them.
  const [showLines, setShowLines] = useState(!invoice.matched_po_id);
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
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);

  // Reading the invoice while correcting the fields.
  //
  // The server already sends this at 2000px on the long edge precisely so the
  // number, the date and the total can be read. The panel then drew it at about
  // 460px wide with no way to look closer, so a reviewer who needed to check a
  // twelve-digit invoice number opened the Drive folder instead -- where the
  // files are called IMG_5142.jpg and the only way to find the right one is to
  // open them until it appears. The zoom is what they were going to Drive for.
  const [zoom, setZoom] = useState(1);
  const [rot, setRot] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [wide, setWide] = useState(false);
  // The glass. Off by default: it follows the pointer, and something that
  // follows the pointer unasked is in the way when you are not using it.
  const [loupe, setLoupe] = useState(false);
  const [loupeFactor, setLoupeFactor] = useState(2.5);
  const photoPaneRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const resetView = () => { setZoom(1); setRot(0); setPan({ x: 0, y: 0 }); };
  // A new invoice starts fitted, not wherever the last one was left.
  useEffect(() => { resetView(); }, [invoice.id]);

  const zoomTo = (z: number) => {
    const next = Math.min(8, Math.max(1, Math.round(z * 100) / 100));
    setZoom(next);
    if (next === 1) setPan({ x: 0, y: 0 });
  };

  // The Drive embed asks the person at the screen for their own access to the
  // file, and only the upload service account has it. Fetch it through the
  // server, which does.
  useEffect(() => {
    if (isPdf || !invoice.id) return;
    let alive = true;
    setPhoto(null);
    setPreviewError(false);
    setPhotoLoading(true);
    fetch(`/api/admin/drive-invoices/${invoice.id}/file`, {
      headers: authHeaders,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        if (!alive) return;
        if (d?.photo) setPhoto(d.photo);
        else setPreviewError(true);
      })
      .catch(() => { if (alive) setPreviewError(true); })
      .finally(() => { if (alive) setPhotoLoading(false); });
    return () => { alive = false; };
  }, [invoice.id, isPdf, authHeaders]);

  // The three figures the invoice prints, and whether they agree.
  //
  // Reported with a screenshot of a Chef Middle East invoice: net 163.50,
  // VAT 8.18, total 171.68, two lines of 96.00 and 67.50 — and a panel
  // showing only "Total Amount 171.68" above two line amounts that could
  // never add up to it. Nothing was wrong with the figures; there was no VAT
  // on the screen to put between them.
  const num = (v: string) => {
    const n = Number(v);
    return v.trim() === "" || Number.isNaN(n) ? null : n;
  };
  const net = num(amountExclTax);
  const vat = num(taxAmount);
  const gross = num(totalAmount);
  const lineSum = lineItems.reduce<number | null>((acc, li) => {
    if (acc === null) return null;
    const v = li.amount;
    return v === null || v === undefined ? null : acc + Number(v);
  }, 0);
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const headerOff =
    net !== null && vat !== null && gross !== null ? round2(net + vat - gross) : null;
  const linesOff = lineSum !== null && net !== null ? round2(lineSum - net) : null;

  // What the column would come to if every line used its own qty x price,
  // and which lines that would change. Where that lands on the printed net,
  // the invoice has checked the answer and one press applies it.
  const recomputable = lineItems.every(
    (li) => li.qty !== null && li.qty !== undefined && li.unit_price !== null && li.unit_price !== undefined,
  );
  const recomputed = recomputable
    ? lineItems.map((li) => round2(Number(li.qty) * Number(li.unit_price)))
    : null;
  const wouldChange = recomputed
    ? recomputed.filter((v, i) => Math.abs(v - Number(lineItems[i].amount ?? NaN)) > 0.02 || lineItems[i].amount == null).length
    : 0;
  const recomputedSum = recomputed ? round2(recomputed.reduce((a, b) => a + b, 0)) : null;
  const recomputeReconciles =
    recomputedSum !== null && net !== null && Math.abs(recomputedSum - net) <= 0.02;
  const applyQtyTimesPrice = () => {
    if (!recomputed) return;
    setLineItems((prev) =>
      prev.map((li, i) => ({ ...li, amount: recomputed[i] })),
    );
  };

  const buildPayload = (reviewStatus: string) => ({
    vendor_name: vendorName,
    invoice_number: invoiceNumber,
    invoice_date: invoiceDate || null,
    due_date: dueDate || null,
    total_amount: totalAmount ? Number(totalAmount) : null,
    amount_excl_tax: amountExclTax ? Number(amountExclTax) : null,
    tax_amount: taxAmount ? Number(taxAmount) : null,
    tax_rate_pct: taxRatePct ? Number(taxRatePct) : null,
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
          <div className={`w-full ${wide ? "lg:w-[72%]" : "lg:w-[45%]"} border-b lg:border-b-0 lg:border-r border-white/10 bg-black/20 shrink-0 h-64 lg:h-auto flex flex-col transition-[width]`}>
            {photo ? (
              <>
                <div
                  ref={photoPaneRef}
                  className={`relative flex-1 min-h-0 overflow-hidden ${zoom > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`}
                  onWheel={(e) => { e.preventDefault(); zoomTo(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); }}
                  onDoubleClick={() => (zoom > 1 ? resetView() : zoomTo(2.5))}
                  onPointerDown={(e) => {
                    if (zoom <= 1) return;
                    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                    dragRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
                  }}
                  onPointerMove={(e) => {
                    const d = dragRef.current;
                    if (!d) return;
                    setPan({ x: d.px + (e.clientX - d.x), y: d.py + (e.clientY - d.y) });
                  }}
                  onPointerUp={() => { dragRef.current = null; }}
                  onPointerLeave={() => { dragRef.current = null; }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo}
                    alt="Invoice"
                    draggable={false}
                    className="absolute inset-0 h-full w-full object-contain select-none"
                    style={{
                      transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rot}deg)`,
                      transformOrigin: "center",
                    }}
                  />
                  {loupe ? (
                    <PhotoLoupe containerRef={photoPaneRef} active={loupe} factor={loupeFactor}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo}
                        alt=""
                        draggable={false}
                        className="absolute inset-0 h-full w-full object-contain select-none"
                        style={{
                          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rot}deg)`,
                          transformOrigin: "center",
                        }}
                      />
                    </PhotoLoupe>
                  ) : null}
                </div>
                <div className="flex items-center gap-1 border-t border-white/10 bg-black/30 px-2 py-1.5">
                  <button type="button" onClick={() => zoomTo(zoom / 1.4)} disabled={zoom <= 1}
                    title="Zoom out"
                    className="rounded px-2 py-0.5 text-sm text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30">−</button>
                  <button type="button" onClick={resetView} title="Fit"
                    className="rounded px-2 py-0.5 text-[11px] tabular-nums text-white/70 hover:bg-white/10 hover:text-white">
                    {Math.round(zoom * 100)}%
                  </button>
                  <button type="button" onClick={() => zoomTo(zoom * 1.4)} disabled={zoom >= 8}
                    title="Zoom in"
                    className="rounded px-2 py-0.5 text-sm text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30">+</button>
                  <button type="button" onClick={() => setRot((r) => (r + 90) % 360)} title="Rotate"
                    className="rounded px-2 py-0.5 text-sm text-white/70 hover:bg-white/10 hover:text-white">↻</button>
                  <button
                    type="button"
                    onClick={() => setLoupe((v) => !v)}
                    title="Magnifier — enlarges what is under the pointer"
                    className={`rounded px-2 py-0.5 text-sm ${
                      loupe ? "bg-amber-400/20 text-amber-300" : "text-white/70 hover:bg-white/10 hover:text-white"
                    }`}
                  >🔎</button>
                  {loupe && (
                    <button
                      type="button"
                      onClick={() => setLoupeFactor((f) => (f >= 5 ? 1.5 : Math.round((f + 0.5) * 10) / 10))}
                      title="Change the magnification"
                      className="rounded px-1.5 py-0.5 text-[11px] tabular-nums text-amber-300 hover:bg-white/10"
                    >{loupeFactor}x</button>
                  )}
                  <button type="button" onClick={() => setWide((w) => !w)}
                    title={wide ? "Narrow the preview" : "Widen the preview"}
                    className="ml-auto hidden rounded px-2 py-0.5 text-[11px] text-white/70 hover:bg-white/10 hover:text-white lg:block">
                    {wide ? "◧ Narrow" : "◨ Wider"}
                  </button>
                  <span className="hidden text-[10px] text-white/30 lg:block">scroll to zoom · drag to move · double-click to fit</span>
                </div>
              </>
            ) : isPdf && !previewError ? (
              <iframe
                src={previewUrl}
                title="Invoice preview"
                className="w-full flex-1 border-0"
                onError={() => setPreviewError(true)}
              />
            ) : photoLoading ? (
              <div className="flex-1 flex items-center justify-center text-white/40 text-sm">
                Loading the invoice…
              </div>
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
              {/* Branch was printed once in small type under the file name. It is
                  one of the five things being checked here, so it gets a label
                  like the other four. Read-only on purpose: it comes from the
                  folder the file was captured into, not from the OCR, so an
                  editable box would invite correcting the wrong thing. */}
              <div className="col-span-2">
                <label className="block text-white/50 text-[11px] mb-1">Branch / Location</label>
                <div className="w-full rounded-lg bg-white/[0.03] border border-white/10 px-3 py-1.5 text-sm text-white/80">
                  {invoice.store_name || "—"} · {invoice.city.toUpperCase()}
                </div>
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
              {/* Net, tax, total — in the order the invoice prints them, so the
                  sum can be followed down the column. */}
              <Field label="Total excl. VAT" value={amountExclTax} onChange={setAmountExclTax} type="number" />
              <div className="grid grid-cols-[1fr_auto] gap-1 items-end">
                <Field label="VAT" value={taxAmount} onChange={setTaxAmount} type="number" />
                <div className="w-16">
                  <Field label="Rate %" value={taxRatePct} onChange={setTaxRatePct} type="number" />
                </div>
              </div>
              <div className="col-span-2">
                <Field label="Total (incl. VAT)" value={totalAmount} onChange={setTotalAmount} type="number" />
              </div>
              <div className="col-span-2">
                {headerOff === null ? (
                  <p className="text-white/30 text-[11px]">
                    Enter the net and the VAT and this line checks the total for you.
                  </p>
                ) : headerOff === 0 ? (
                  <p className="text-emerald-300/80 text-[11px]">
                    ✓ {net} + {vat} = {gross}
                  </p>
                ) : (
                  <p className="text-amber-300 text-[11px]">
                    ⚠ {net} + {vat} = {round2((net ?? 0) + (vat ?? 0))}, not {gross}
                    <span className="text-amber-300/60"> — out by {headerOff}</span>
                  </p>
                )}
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

            {/* Line items.

                Checked in full at Receiving -> PO Match, so re-reading fourteen
                rows here is the same work twice — and 419 invoices had been
                sitting unreviewed against three approved. But that only holds
                where a PO exists: a quarter of them have none, and for those
                nothing downstream ever looks at the lines, so they stay open. */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() => setShowLines((v) => !v)}
                  className="flex items-center gap-1.5 text-white/50 text-[11px] hover:text-white/80"
                >
                  <span className={`transition-transform ${showLines ? "rotate-90" : ""}`}>▸</span>
                  Line Items ({lineItems.length})
                </button>
                {showLines && (
                  <button
                    onClick={addLineItem}
                    className="text-xs text-amber-400/70 hover:text-amber-400"
                  >
                    + Add row
                  </button>
                )}
              </div>
              {!showLines && (
                <p className="text-white/35 text-xs italic">
                  Detailed line items are verified at Receiving → PO Match.
                </p>
              )}
              {showLines && lineItems.length === 0 && (
                <p className="text-white/30 text-xs italic">No line items were read from this invoice.</p>
              )}
              {showLines && lineItems.length > 0 && (
                <div className="rounded-lg overflow-x-auto border border-white/10">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-white/5 text-white/40">
                        <th className="text-left px-2 py-1.5">Description</th>
                        <th className="text-right px-2 py-1.5 w-16">Qty</th>
                        <th className="text-left px-2 py-1.5 w-16">Unit</th>
                        <th className="text-right px-2 py-1.5 w-20">Price</th>
                        <th className="text-right px-2 py-1.5 w-24">Amount excl. VAT</th>
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
                            {/* Where all three were read, say so when they
                                disagree — one line came back 12 x 10.63 =
                                127.56 for a line printed 8 x 12.000 = 96.00. */}
                            {item.qty != null && item.unit_price != null && item.amount != null
                              && Math.abs(Number(item.qty) * Number(item.unit_price) - Number(item.amount)) > 0.02 ? (
                              <button
                                type="button"
                                title="Use qty × price"
                                onClick={() =>
                                  updateLineItem(i, "amount",
                                    String(round2(Number(item.qty) * Number(item.unit_price))))
                                }
                                className="block w-full text-right text-[10px] text-amber-300/80 underline decoration-dotted underline-offset-2 hover:text-amber-300"
                              >
                                ⚠ use {item.qty} × {item.unit_price} = {round2(Number(item.qty) * Number(item.unit_price))}
                              </button>
                            ) : null}
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
                    {/* The column has to add to the net. This is the row that
                        makes a misread line visible without opening a
                        calculator. */}
                    <tfoot>
                      <tr className="border-t border-white/10 bg-white/5">
                        <td className="px-2 py-1.5 text-white/40" colSpan={4}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span>
                              {lineSum === null
                                ? "Some lines have no amount, so they cannot be added up."
                                : linesOff === null
                                  ? "Lines add up to"
                                  : linesOff === 0
                                    ? "✓ Lines add up to the net"
                                    : `⚠ Lines are out by ${linesOff} against the net ${net}`}
                            </span>
                            {/* The reading gets the quantity and the price right
                                far more often than the line total. Where using
                                them lands exactly on the net the invoice prints,
                                the invoice has checked the answer itself. */}
                            {linesOff !== 0 && wouldChange > 0 && recomputedSum !== null ? (
                              <button
                                type="button"
                                onClick={applyQtyTimesPrice}
                                className={`rounded-md border px-2 py-0.5 text-[11px] ${
                                  recomputeReconciles
                                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                                    : "border-white/15 bg-white/5 text-white/70"
                                }`}
                              >
                                {recomputeReconciles
                                  ? `Use qty × price on ${wouldChange} line${wouldChange === 1 ? "" : "s"} → ${recomputedSum} ✓`
                                  : `Use qty × price on ${wouldChange} line${wouldChange === 1 ? "" : "s"} → ${recomputedSum}`}
                              </button>
                            ) : null}
                          </div>
                        </td>
                        <td className={`px-2 py-1.5 text-right font-mono ${
                          linesOff === 0 ? "text-emerald-300" : linesOff === null ? "text-white/60" : "text-amber-300"
                        }`}>
                          {lineSum === null ? "—" : round2(lineSum)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
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
            {/* Our own paperwork gets posted into the supplier invoice
                channels — delivery notes from the Central Kitchen, the
                Warehouse, branch-to-branch documents. 97 of them were sitting
                in the review queue as if a supplier had sent them. This takes
                one out without calling it rejected, which it is not. */}
            <button
              onClick={() => submit("not_supplier_invoice")}
              disabled={saving}
              title="A ZEN document — a CK or Warehouse delivery note, not a supplier's invoice"
              className="text-sm px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/60 hover:text-white/90 transition-all border border-white/10 disabled:opacity-50"
            >
              Not a supplier invoice
            </button>
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
