"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  TrendingUp,
  XCircle,
} from "lucide-react";
import {
  BADGE_ERROR,
  BADGE_SUCCESS,
  DANGER_BUTTON,
  GLASS_CARD,
  INPUT_CLASS,
  KPI_CARD,
  KPI_LABEL,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SELECT_CLASS,
  SMALL_BUTTON,
  T_CAPTION,
  T_LABEL,
  T_PAGE_TITLE,
  T_SECTION,
  TABLE_CELL,
  TABLE_HEADER,
  TABLE_ROW,
  TAB_ACTIVE,
  TAB_CONTAINER,
  TAB_INACTIVE,
  TEXTAREA_CLASS,
} from "@/lib/ui-tokens";
import { getAuth } from "@/lib/auth";

const API = (path: string) => `/api/admin${path}`;

async function apiFetch(path: string, opts?: RequestInit) {
  const auth = getAuth();
  const res = await fetch(API(path), {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth?.accessToken || ""}`,
      ...(opts?.headers || {}),
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

type PoRow = {
  id: string;
  po_no: string;
  vendor_name: string;
  po_amount: number;
  currency: string;
  po_date: string;
  status: string;
  city?: string;
};

type CheckRow = {
  id: string;
  city: string;
  vendor_name: string;
  po_no: string;
  po_date: string;
  po_amount: number;
  invoice_no: string;
  invoice_date: string;
  invoice_amount: number;
  currency: string;
  match_status: "MATCHED" | "DISCREPANCY";
  variance_amount: number;
  discrepancy_type: string;
  resolution_note: string;
  resolved_by: string;
  resolved_at: string;
  contacted_by: string;
  contacted_at: string;
  entered_by: string;
  notes: string;
  photo_data: string;
  created_at: string;
};

type SupplierStat = {
  vendor_name: string;
  total_checks: number;
  matched_count: number;
  discrepancy_count: number;
  unresolved_count: number;
  total_variance_abs: number;
  avg_discrepancy_amount: number;
  discrepancy_rate_pct: number;
  last_check_at: string;
};

type MatchSettings = {
  city: string;
  tolerance_aed: number;
  tolerance_pct: number;
  updated_by: string;
  updated_at: string | null;
};

const TODAY = new Date().toISOString().slice(0, 10);

// City context — set by PoMatchPage, consumed by all tabs
const CityCtx = createContext<string>("dubai");
const useCity = () => useContext(CityCtx);

// Reads auth city, but localStorage override (set by the city selector) takes priority
function getInitialCity(): string {
  if (typeof window !== "undefined") {
    const v = window.localStorage.getItem("po_match_city");
    if (v === "dubai" || v === "manila") return v;
  }
  return (getAuth()?.city || "dubai").toLowerCase();
}

function getCurrency(city: string) { return city === "manila" ? "PHP" : "AED"; }

const DISCREPANCY_TYPES = [
  { value: "PRICE", label: "Price Error — unit price differs from PO" },
  { value: "QUANTITY", label: "Quantity Error — delivery count differs" },
  { value: "SHORTAGE", label: "Shortage — items not delivered" },
  { value: "OVERCHARGE", label: "Overcharge — billed more than agreed" },
  { value: "OTHER", label: "Other" },
];

function fmtAmount(n: number | null | undefined, currency: string) {
  if (n == null) return "—";
  return currency + " " + Math.abs(n).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function MatchBadge({ status, variance }: { status: string; variance: number }) {
  if (status === "MATCHED")
    return <span className={BADGE_SUCCESS}><CheckCircle2 size={11} /> Matched</span>;
  return (
    <span className={BADGE_ERROR}>
      <XCircle size={11} />
      Discrepancy {variance > 0 ? "+" : ""}{variance.toFixed(2)}
    </span>
  );
}

function PaymentStatusBadge({ row }: { row: CheckRow }) {
  if (row.match_status !== "DISCREPANCY") return null;
  if (row.resolved_by)
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">✓ Resolved</span>;
  if (row.contacted_by)
    return <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">⏳ Awaiting Supplier</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-400">🔴 Payment Hold</span>;
}

// ─── Photo upload helper ──────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function PhotoUpload({
  value,
  onChange,
  checkId,
  compact = false,
}: {
  value: string;
  onChange: (v: string) => void;
  checkId?: string;
  compact?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { setMsg("File must be under 8 MB."); return; }
    setUploading(true);
    setMsg("");
    try {
      const b64 = await fileToBase64(file);
      if (checkId) {
        await apiFetch(`/procurement/po-match/${checkId}/photo`, {
          method: "POST",
          body: JSON.stringify({ photo_data: b64 }),
        });
      }
      onChange(b64);
    } catch { setMsg("Upload failed. Try again."); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  return (
    <div className={compact ? "" : "space-y-2"}>
      {value ? (
        <div className="relative inline-block">
          <img
            src={value}
            alt="Invoice photo"
            className="max-h-48 rounded-xl border border-white/10 object-contain"
          />
          <button
            className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-zinc-400 hover:text-red-400"
            onClick={() => onChange("")}
            title="Remove photo"
          >
            <XCircle size={14} />
          </button>
        </div>
      ) : (
        <button
          className={`${SMALL_BUTTON} flex items-center gap-1.5`}
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          <Camera size={13} />
          {uploading ? "Uploading…" : compact ? "Add Photo" : "Attach Invoice Photo (optional)"}
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />
      {msg && <p className="text-xs text-red-400">{msg}</p>}
    </div>
  );
}

// ─── Tab 1: Quick Entry ───────────────────────────────────────────────────────

function QuickEntryTab({
  onSaved,
  settings,
}: {
  onSaved: () => void;
  settings: MatchSettings | null;
}) {
  const city = useCity();
  const currency = getCurrency(city);
  const [vendorQ, setVendorQ] = useState("");
  const [poRows, setPoRows] = useState<PoRow[]>([]);
  const [poLoading, setPoLoading] = useState(false);
  const [selectedPo, setSelectedPo] = useState<PoRow | null>(null);
  const [manualPoNo, setManualPoNo] = useState("");
  const [manualPoAmount, setManualPoAmount] = useState("");
  const [poDate, setPoDate] = useState(TODAY);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(TODAY);
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [photoData, setPhotoData] = useState("");
  const [discrepancyType, setDiscrepancyType] = useState("OTHER");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [showPoList, setShowPoList] = useState(false);
  const vendorDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const poNoDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchPos = useCallback(async (q: string) => {
    if (!q.trim()) { setPoRows([]); setShowPoList(false); return; }
    setPoLoading(true);
    try {
      const d = await apiFetch(`/procurement/po-match/pos?city=${city}&vendor_name=${encodeURIComponent(q)}&limit=20`);
      setPoRows(d.rows || []);
      setShowPoList(true);
    } catch { setPoRows([]); }
    finally { setPoLoading(false); }
  }, [city]);

  // Auto-search when vendor name changes (300 ms debounce, min 2 chars)
  useEffect(() => {
    if (vendorDebounce.current) clearTimeout(vendorDebounce.current);
    if (vendorQ.trim().length >= 2) {
      vendorDebounce.current = setTimeout(() => searchPos(vendorQ), 300);
    } else {
      setPoRows([]);
      setShowPoList(false);
    }
    return () => { if (vendorDebounce.current) clearTimeout(vendorDebounce.current); };
  }, [vendorQ, searchPos]);

  // Search by PO number when typed (500 ms debounce, min 4 chars)
  useEffect(() => {
    if (selectedPo) return; // already selected, don't overwrite
    if (poNoDebounce.current) clearTimeout(poNoDebounce.current);
    const q = manualPoNo.trim();
    if (q.length >= 4) {
      poNoDebounce.current = setTimeout(async () => {
        setPoLoading(true);
        try {
          const d = await apiFetch(`/procurement/po-match/pos?city=${city}&po_no=${encodeURIComponent(q)}&limit=10`);
          const rows: PoRow[] = d.rows || [];
          if (rows.length === 1) {
            setSelectedPo(rows[0]);
            setVendorQ(rows[0].vendor_name);
            setManualPoAmount(String(rows[0].po_amount));
            setPoDate(rows[0].po_date?.slice(0, 10) || TODAY);
          } else if (rows.length > 1) {
            setPoRows(rows);
            setShowPoList(true);
          }
        } catch { /* ignore */ }
        finally { setPoLoading(false); }
      }, 500);
    }
    return () => { if (poNoDebounce.current) clearTimeout(poNoDebounce.current); };
  }, [manualPoNo, city, selectedPo]);

  const selectPo = (po: PoRow) => {
    setSelectedPo(po);
    setVendorQ(po.vendor_name);
    setManualPoNo(po.po_no);
    setManualPoAmount(String(po.po_amount));
    setPoDate(po.po_date?.slice(0, 10) || TODAY);
    setShowPoList(false);
  };

  const tolAed = settings?.tolerance_aed ?? 1.0;
  const tolPct = settings?.tolerance_pct ?? 0.005;
  const poAmount = selectedPo ? selectedPo.po_amount : parseFloat(manualPoAmount || "0");
  const invAmount = parseFloat(invoiceAmount || "0");
  const variance = invAmount - poAmount;
  const effectiveTol = poAmount > 0 ? Math.max(tolAed, poAmount * tolPct) : tolAed;
  const isMatch = poAmount > 0 && Math.abs(variance) <= effectiveTol;

  const handleSubmit = async () => {
    if (!vendorQ.trim()) { setMsg({ text: "Enter supplier name.", ok: false }); return; }
    if (!(poAmount > 0)) { setMsg({ text: "Enter PO amount.", ok: false }); return; }
    if (!invoiceNo.trim()) { setMsg({ text: "Enter invoice number.", ok: false }); return; }
    if (!(invAmount > 0)) { setMsg({ text: "Enter invoice amount.", ok: false }); return; }
    setSaving(true);
    setMsg(null);
    try {
      await apiFetch("/procurement/po-match", {
        method: "POST",
        body: JSON.stringify({
          city,
          vendor_name: vendorQ.trim(),
          po_no: manualPoNo.trim(),
          po_date: poDate,
          po_amount: poAmount,
          invoice_no: invoiceNo.trim(),
          invoice_date: invoiceDate,
          invoice_amount: invAmount,
          currency,
          notes: notes.trim(),
          photo_data: photoData,
          discrepancy_type: !isMatch ? discrepancyType : "",
        }),
      });
      const matchMsg = isMatch
        ? "✅ Matched — no further action needed."
        : `⚠️ Discrepancy detected (${variance > 0 ? "+" : ""}${variance.toFixed(2)} ${currency}). Added to review queue.`;
      setMsg({ text: matchMsg, ok: isMatch });
      setVendorQ(""); setSelectedPo(null); setManualPoNo(""); setManualPoAmount("");
      setInvoiceNo(""); setInvoiceAmount(""); setNotes(""); setPhotoData("");
      setPoDate(TODAY); setInvoiceDate(TODAY); setPoRows([]);
      onSaved();
    } catch (e: unknown) {
      setMsg({ text: String(e), ok: false });
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div className={`${GLASS_CARD} p-6`}>
        <h2 className={T_SECTION}>Enter Today&apos;s Invoice</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Enter the PO amount and the invoice amount received from the supplier. If they match
          within the tolerance, the record closes automatically.
          {settings && (
            <span className="ml-1 text-violet-400">
              (Tolerance: {currency} {tolAed.toFixed(2)} or {(tolPct * 100).toFixed(1)}%)
            </span>
          )}
        </p>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          {/* Supplier */}
          <div className="sm:col-span-2">
            <label className={T_LABEL}>Supplier / Vendor *</label>
            <div className="relative mt-1.5">
              <input
                className={INPUT_CLASS}
                placeholder="Type supplier name to search POs…"
                value={vendorQ}
                onChange={e => { setVendorQ(e.target.value); setSelectedPo(null); setManualPoNo(""); }}
                onKeyDown={e => e.key === "Enter" && searchPos(vendorQ)}
              />
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-zinc-400 hover:text-white"
                onClick={() => searchPos(vendorQ)}
              >
                {poLoading ? <RefreshCw size={15} className="animate-spin" /> : <Search size={15} />}
              </button>
              {showPoList && poRows.length > 0 && (
                <div className="absolute z-20 mt-1 w-full rounded-xl border border-white/10 bg-zinc-900 shadow-2xl">
                  {poRows.map(po => (
                    <button
                      key={po.id}
                      className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-violet-500/10"
                      onClick={() => selectPo(po)}
                    >
                      <span className="flex items-center gap-2 text-zinc-200">
                        {po.vendor_name}
                        {po.city && (
                          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${po.city === "dubai" ? "bg-amber-500/20 text-amber-300" : "bg-blue-500/20 text-blue-300"}`}>
                            {po.city === "dubai" ? "DXB" : "MNL"}
                          </span>
                        )}
                      </span>
                      <span className="ml-2 text-right text-zinc-400">
                        {po.po_no} · {fmtAmount(po.po_amount, po.currency || currency)} · {po.po_date?.slice(0, 10)}
                      </span>
                    </button>
                  ))}
                  <button className="w-full px-4 py-2 text-xs text-zinc-500 hover:bg-white/5" onClick={() => setShowPoList(false)}>
                    Close
                  </button>
                </div>
              )}
              {showPoList && poRows.length === 0 && !poLoading && vendorQ && (
                <div className="absolute z-20 mt-1 w-full rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-zinc-500">
                  No POs found — enter PO details manually below.
                </div>
              )}
            </div>
          </div>

          {/* PO No */}
          <div>
            <label className={T_LABEL}>PO Number</label>
            <div className="relative mt-1.5">
              <input
                className={INPUT_CLASS}
                placeholder="e.g. DXB-PO-2026-0042 — auto-fills on match"
                value={manualPoNo}
                onChange={e => { setManualPoNo(e.target.value); if (selectedPo) setSelectedPo(null); }}
              />
              {poLoading && <RefreshCw size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-zinc-500" />}
            </div>
          </div>

          {/* PO Date */}
          <div>
            <label className={T_LABEL}>PO Date *</label>
            <input type="date" className={`mt-1.5 ${INPUT_CLASS}`} value={poDate} onChange={e => setPoDate(e.target.value)} />
          </div>

          {/* PO Amount */}
          <div>
            <label className={T_LABEL}>PO Amount ({currency}) *</label>
            <input
              type="number" min="0" step="0.01"
              className={`mt-1.5 ${INPUT_CLASS}`}
              placeholder="0.00"
              value={selectedPo ? selectedPo.po_amount : manualPoAmount}
              onChange={e => { if (!selectedPo) setManualPoAmount(e.target.value); }}
              readOnly={!!selectedPo}
            />
            {selectedPo && (
              <p className={`mt-1 ${T_CAPTION}`}>
                Auto-filled from PO {selectedPo.po_no}.{" "}
                <button className="text-violet-400 hover:underline" onClick={() => setSelectedPo(null)}>Clear</button>
              </p>
            )}
          </div>

          {/* Spacer */}
          <div />

          {/* Invoice No */}
          <div>
            <label className={T_LABEL}>Invoice Number *</label>
            <input
              className={`mt-1.5 ${INPUT_CLASS}`}
              placeholder="Supplier invoice no."
              value={invoiceNo}
              onChange={e => setInvoiceNo(e.target.value)}
            />
          </div>

          {/* Invoice Date */}
          <div>
            <label className={T_LABEL}>Invoice Date</label>
            <input type="date" className={`mt-1.5 ${INPUT_CLASS}`} value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
          </div>

          {/* Invoice Amount */}
          <div className="sm:col-span-2">
            <label className={T_LABEL}>Invoice Amount ({currency}) *</label>
            <input
              type="number" min="0" step="0.01"
              className={`mt-1.5 ${INPUT_CLASS}`}
              placeholder="0.00"
              value={invoiceAmount}
              onChange={e => setInvoiceAmount(e.target.value)}
            />
          </div>
        </div>

        {/* Live match preview */}
        {poAmount > 0 && invAmount > 0 && (
          <div className={`mt-5 rounded-xl border p-4 ${isMatch ? "border-emerald-500/30 bg-emerald-500/8" : "border-amber-500/30 bg-amber-500/8"}`}>
            <div className="flex items-center gap-3">
              {isMatch
                ? <CheckCircle2 size={22} className="text-emerald-400 shrink-0" />
                : <AlertTriangle size={22} className="text-amber-400 shrink-0" />}
              <div>
                <p className={`font-semibold ${isMatch ? "text-emerald-300" : "text-amber-300"}`}>
                  {isMatch ? "Amounts match — will auto-close" : "Discrepancy detected — will go to review queue"}
                </p>
                <p className="text-sm text-zinc-400">
                  PO: {fmtAmount(poAmount, currency)} · Invoice: {fmtAmount(invAmount, currency)} · Variance: {variance > 0 ? "+" : ""}{variance.toFixed(2)} {currency}
                  {!isMatch && <span className="ml-2 text-zinc-500">(tolerance: ±{effectiveTol.toFixed(2)} {currency})</span>}
                </p>
              </div>
            </div>
            {!isMatch && (
              <div className="mt-3 border-t border-amber-500/20 pt-3">
                <label className={T_LABEL}>Discrepancy Type *</label>
                <select
                  className={`mt-1.5 ${SELECT_CLASS}`}
                  value={discrepancyType}
                  onChange={e => setDiscrepancyType(e.target.value)}
                >
                  {DISCREPANCY_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        <div className="mt-5">
          <label className={T_LABEL}>Notes (optional)</label>
          <textarea
            className={`mt-1.5 ${TEXTAREA_CLASS}`}
            rows={2}
            placeholder="Any remarks…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>

        {/* Photo upload */}
        <div className="mt-5">
          <label className={`${T_LABEL} mb-1.5 block`}>Invoice Photo (optional)</label>
          <PhotoUpload value={photoData} onChange={setPhotoData} />
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button className={PRIMARY_BUTTON} onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : "Submit Invoice Check"}
          </button>
          {msg && (
            <p className={`text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab 2: Discrepancy Queue ─────────────────────────────────────────────────

function DiscrepancyQueueTab() {
  const city = useCity();
  const currency = getCurrency(city);
  const [rows, setRows] = useState<CheckRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolveType, setResolveType] = useState("OTHER");
  const [resolveNote, setResolveNote] = useState("");
  const [resolving, setResolving] = useState<string | null>(null);
  const [contacting, setContacting] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch(`/procurement/po-match?city=${city}&match_status=DISCREPANCY&limit=200`);
      setRows(d.rows || []);
    } catch { setRows([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const unresolvedRows = rows.filter(r => !r.resolved_by);
  const resolvedRows = rows.filter(r => r.resolved_by);

  const handleResolve = async (id: string) => {
    if (!resolveNote.trim()) { setMsg("Please enter a resolution note."); return; }
    setResolving(id);
    setMsg("");
    try {
      const d = await apiFetch(`/procurement/po-match/${id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ discrepancy_type: resolveType, resolution_note: resolveNote }),
      });
      setRows(prev => prev.map(r => r.id === id ? d.row : r));
      setExpandedId(null);
      setResolveNote("");
    } catch (e: unknown) { setMsg(String(e)); }
    finally { setResolving(null); }
  };

  const handleContact = async (id: string) => {
    setContacting(id);
    setMsg("");
    try {
      const d = await apiFetch(`/procurement/po-match/${id}/contact`, { method: "POST" });
      setRows(prev => prev.map(r => r.id === id ? d.row : r));
    } catch (e: unknown) { setMsg(String(e)); }
    finally { setContacting(null); }
  };

  const DiscrepancyList = ({ items, title }: { items: CheckRow[]; title: string }) => (
    <div className="space-y-2">
      {items.length === 0 && (
        <p className="py-4 text-center text-sm text-zinc-500">{title === "Unresolved" ? "No pending discrepancies. 🎉" : "None yet."}</p>
      )}
      {items.map(row => (
        <div key={row.id} className={`${GLASS_CARD} overflow-hidden`}>
          <button
            className="flex w-full items-center justify-between p-4 text-left"
            onClick={() => {
              const next = expandedId === row.id ? null : row.id;
              if (next !== expandedId) { setResolveNote(""); setResolveType("OTHER"); setMsg(""); }
              setExpandedId(next);
            }}
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold text-white">{row.vendor_name}</span>
              <span className={T_CAPTION}>{row.invoice_no}</span>
              <MatchBadge status={row.match_status} variance={row.variance_amount} />
              <PaymentStatusBadge row={row} />
              {row.photo_data && <span title="Has photo"><Camera size={12} className="text-violet-400" /></span>}
            </div>
            <div className="flex items-center gap-3 text-right">
              <span className={`${T_CAPTION} hidden sm:block`}>{row.created_at?.slice(0, 10)}</span>
              {expandedId === row.id ? <ChevronUp size={16} className="text-zinc-400" /> : <ChevronDown size={16} className="text-zinc-400" />}
            </div>
          </button>

          {expandedId === row.id && (
            <div className="border-t border-white/5 px-4 pb-4 pt-3">
              <div className="grid gap-3 text-sm sm:grid-cols-3">
                <div><p className={T_LABEL}>PO Amount</p><p className="mt-0.5 text-zinc-200">{fmtAmount(row.po_amount, currency)}</p></div>
                <div><p className={T_LABEL}>Invoice Amount</p><p className="mt-0.5 text-zinc-200">{fmtAmount(row.invoice_amount, currency)}</p></div>
                <div>
                  <p className={T_LABEL}>Variance</p>
                  <p className={`mt-0.5 font-semibold ${row.variance_amount > 0 ? "text-red-400" : "text-amber-400"}`}>
                    {row.variance_amount > 0 ? "+" : ""}{row.variance_amount.toFixed(2)} {row.currency || currency}
                  </p>
                </div>
                <div><p className={T_LABEL}>PO No.</p><p className="mt-0.5 text-zinc-300">{row.po_no || "—"}</p></div>
                <div><p className={T_LABEL}>PO Date</p><p className="mt-0.5 text-zinc-300">{row.po_date?.slice(0, 10) || "—"}</p></div>
                <div><p className={T_LABEL}>Invoice Date</p><p className="mt-0.5 text-zinc-300">{row.invoice_date?.slice(0, 10) || "—"}</p></div>
                {row.notes && (
                  <div className="sm:col-span-3"><p className={T_LABEL}>Notes</p><p className="mt-0.5 text-zinc-300">{row.notes}</p></div>
                )}
              </div>

              {/* Photo display */}
              {row.photo_data && (
                <div className="mt-4">
                  <p className={`${T_LABEL} mb-1.5`}>Invoice Photo</p>
                  <img src={row.photo_data} alt="Invoice" className="max-h-64 rounded-xl border border-white/10 object-contain" />
                </div>
              )}

              {/* Supplier contact tracking */}
              {!row.resolved_by && (
                <div className="mt-4">
                  {row.contacted_by ? (
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 p-3 text-sm">
                      <p className="font-medium text-amber-300">📞 Supplier contacted by {row.contacted_by}</p>
                      <p className={`mt-0.5 ${T_CAPTION}`}>{row.contacted_at?.slice(0, 16).replace("T", " ")} — Awaiting supplier response</p>
                    </div>
                  ) : (
                    <button
                      className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-2 text-sm font-medium text-amber-300 transition hover:bg-amber-500/15 disabled:opacity-50"
                      onClick={() => handleContact(row.id)}
                      disabled={contacting === row.id}
                    >
                      {contacting === row.id ? "Recording…" : "📞 Contacted Supplier"}
                    </button>
                  )}
                </div>
              )}

              {row.resolved_by ? (
                <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/8 p-3 text-sm">
                  <p className="font-medium text-emerald-300">Resolved by {row.resolved_by}</p>
                  <p className="mt-0.5 text-zinc-400">{row.discrepancy_type} — {row.resolution_note}</p>
                  <p className={`mt-0.5 ${T_CAPTION}`}>{row.resolved_at?.slice(0, 16).replace("T", " ")}</p>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <p className="text-sm font-medium text-amber-300">Resolve this discrepancy</p>
                  <div>
                    <label className={T_LABEL}>Discrepancy Type</label>
                    <select className={`mt-1.5 ${SELECT_CLASS}`} value={resolveType} onChange={e => setResolveType(e.target.value)}>
                      {DISCREPANCY_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={T_LABEL}>Resolution Note *</label>
                    <textarea
                      className={`mt-1.5 ${TEXTAREA_CLASS}`}
                      rows={2}
                      placeholder="e.g. Supplier confirmed overcharge, credit note to be issued…"
                      value={resolveNote}
                      onChange={e => setResolveNote(e.target.value)}
                    />
                  </div>
                  {/* Photo upload for existing check */}
                  {!row.photo_data && (
                    <div>
                      <label className={`${T_LABEL} mb-1`}>Attach Photo</label>
                      <PhotoUpload
                        value=""
                        onChange={async (v) => {
                          setRows(prev => prev.map(r => r.id === row.id ? { ...r, photo_data: v } : r));
                        }}
                        checkId={row.id}
                        compact
                      />
                    </div>
                  )}
                  {msg && <p className="text-sm text-red-400">{msg}</p>}
                  <button
                    className={PRIMARY_BUTTON}
                    onClick={() => handleResolve(row.id)}
                    disabled={resolving === row.id}
                  >
                    {resolving === row.id ? "Resolving…" : "Mark as Resolved"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className={T_SECTION}>Discrepancy Queue</h2>
          <p className="mt-0.5 text-sm text-zinc-500">Review and resolve all PO vs Invoice mismatches.</p>
        </div>
        <button className={SMALL_BUTTON} onClick={load} disabled={loading}>
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {unresolvedRows.length > 0 && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 text-sm text-amber-300">
          <AlertTriangle size={14} className="mr-2 inline" />
          {unresolvedRows.length} unresolved discrepanc{unresolvedRows.length === 1 ? "y" : "ies"} pending review
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-semibold text-amber-400">Pending ({unresolvedRows.length})</p>
        <DiscrepancyList items={unresolvedRows} title="Unresolved" />
      </div>

      {resolvedRows.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-zinc-500">Resolved ({resolvedRows.length})</p>
          <DiscrepancyList items={resolvedRows} title="Resolved" />
        </div>
      )}
    </div>
  );
}

// ─── Tab 3: All Records ───────────────────────────────────────────────────────

function AllRecordsTab() {
  const city = useCity();
  const currency = getCurrency(city);
  const [rows, setRows] = useState<CheckRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [vendorFilter, setVendorFilter] = useState("");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(TODAY);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        city, date_from: dateFrom, date_to: dateTo,
        ...(vendorFilter ? { vendor_name: vendorFilter } : {}), limit: "500",
      });
      const d = await apiFetch(`/procurement/po-match?${params}`);
      setRows(d.rows || []);
    } catch { setRows([]); }
    finally { setLoading(false); }
  }, [vendorFilter, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const matched = rows.filter(r => r.match_status === "MATCHED").length;
  const discrepancy = rows.filter(r => r.match_status === "DISCREPANCY").length;
  const matchRate = rows.length ? Math.round((matched / rows.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[180px]">
          <label className={T_LABEL}>Supplier Filter</label>
          <input className={`mt-1.5 ${INPUT_CLASS}`} placeholder="All suppliers" value={vendorFilter} onChange={e => setVendorFilter(e.target.value)} />
        </div>
        <div>
          <label className={T_LABEL}>From</label>
          <input type="date" className={`mt-1.5 ${INPUT_CLASS}`} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label className={T_LABEL}>To</label>
          <input type="date" className={`mt-1.5 ${INPUT_CLASS}`} value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        <button className={SECONDARY_BUTTON} onClick={load} disabled={loading}>
          {loading ? <RefreshCw size={13} className="animate-spin" /> : "Search"}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className={KPI_CARD}><p className={KPI_LABEL}>Total Checks</p><p className="mt-1 text-2xl font-bold text-white">{rows.length}</p></div>
        <div className={KPI_CARD}><p className={KPI_LABEL}>Match Rate</p><p className={`mt-1 text-2xl font-bold ${matchRate >= 90 ? "text-emerald-400" : matchRate >= 70 ? "text-amber-400" : "text-red-400"}`}>{matchRate}%</p></div>
        <div className={KPI_CARD}><p className={KPI_LABEL}>Discrepancies</p><p className={`mt-1 text-2xl font-bold ${discrepancy === 0 ? "text-emerald-400" : "text-amber-400"}`}>{discrepancy}</p></div>
      </div>

      <div className={`${GLASS_CARD} overflow-x-auto`}>
        <table className="w-full min-w-[640px]">
          <thead>
            <tr>
              <th className={`${TABLE_HEADER} py-3 pl-4 text-left`}>Date</th>
              <th className={`${TABLE_HEADER} py-3 text-left`}>Supplier</th>
              <th className={`${TABLE_HEADER} py-3 text-left`}>Invoice No.</th>
              <th className={`${TABLE_HEADER} py-3 text-right`}>PO</th>
              <th className={`${TABLE_HEADER} py-3 text-right`}>Invoice</th>
              <th className={`${TABLE_HEADER} py-3 text-right`}>Variance</th>
              <th className={`${TABLE_HEADER} py-3 pr-4 text-center`}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-sm text-zinc-500">{loading ? "Loading…" : "No records found."}</td></tr>
            )}
            {rows.map(row => (
              <tr key={row.id} className={TABLE_ROW}>
                <td className={`${TABLE_CELL} pl-4 text-zinc-400`}>{row.created_at?.slice(0, 10)}</td>
                <td className={`${TABLE_CELL} font-medium text-zinc-200`}>
                  {row.vendor_name}
                  {row.photo_data && <Camera size={11} className="ml-1 inline text-violet-400" />}
                </td>
                <td className={`${TABLE_CELL} text-zinc-400`}>{row.invoice_no}</td>
                <td className={`${TABLE_CELL} text-right font-mono text-zinc-300`}>{fmtAmount(row.po_amount, currency)}</td>
                <td className={`${TABLE_CELL} text-right font-mono text-zinc-300`}>{fmtAmount(row.invoice_amount, currency)}</td>
                <td className={`${TABLE_CELL} text-right font-mono ${row.variance_amount !== 0 ? "text-amber-400" : "text-zinc-500"}`}>
                  {row.variance_amount === 0 ? "—" : (row.variance_amount > 0 ? "+" : "") + row.variance_amount.toFixed(2)}
                </td>
                <td className={`${TABLE_CELL} pr-4 text-center`}>
                  <MatchBadge status={row.match_status} variance={row.variance_amount} />
                  {row.match_status === "DISCREPANCY" && <PaymentStatusBadge row={row} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab 4: Supplier Scorecard ────────────────────────────────────────────────

function SupplierScorecardTab() {
  const city = useCity();
  const currency = getCurrency(city);
  const [rows, setRows] = useState<SupplierStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch(`/procurement/po-match/supplier-stats?city=${city}&days=${days}`);
      setRows(d.rows || []);
    } catch { setRows([]); }
    finally { setLoading(false); }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const getRatingColor = (rate: number) => rate === 0 ? "text-emerald-400" : rate <= 10 ? "text-amber-400" : "text-red-400";
  const getRatingLabel = (rate: number) => rate === 0 ? "Perfect" : rate <= 5 ? "Good" : rate <= 15 ? "Fair" : "Poor";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className={T_SECTION}>Supplier Scorecard</h2>
          <p className="mt-0.5 text-sm text-zinc-500">Discrepancy history per supplier — use this for negotiations.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className={T_LABEL}>Period</label>
          <select className={SELECT_CLASS + " w-auto"} value={days} onChange={e => setDays(Number(e.target.value))}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 6 months</option>
          </select>
          <button className={SMALL_BUTTON} onClick={load} disabled={loading}><RefreshCw size={13} className={loading ? "animate-spin" : ""} /></button>
        </div>
      </div>

      {rows.length === 0 && !loading && (
        <div className={`${GLASS_CARD} p-8 text-center text-zinc-500`}>
          No data yet for this period. Start entering invoices to build the scorecard.
        </div>
      )}

      <div className="space-y-3">
        {rows.map(stat => (
          <div key={stat.vendor_name} className={GLASS_CARD}>
            <div className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">{stat.vendor_name}</p>
                  <p className={T_CAPTION}>{stat.total_checks} invoice{stat.total_checks !== 1 ? "s" : ""} checked · last {stat.last_check_at?.slice(0, 10)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-lg font-bold ${getRatingColor(Number(stat.discrepancy_rate_pct || 0))}`}>{getRatingLabel(Number(stat.discrepancy_rate_pct || 0))}</span>
                  <span className={`text-sm ${getRatingColor(Number(stat.discrepancy_rate_pct || 0))}`}>({stat.discrepancy_rate_pct ?? 0}% error rate)</span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className={KPI_CARD + " !p-3"}><p className={KPI_LABEL}>Matched</p><p className="mt-0.5 text-xl font-bold text-emerald-400">{stat.matched_count}</p></div>
                <div className={KPI_CARD + " !p-3"}><p className={KPI_LABEL}>Discrepancies</p><p className={`mt-0.5 text-xl font-bold ${stat.discrepancy_count > 0 ? "text-red-400" : "text-zinc-400"}`}>{stat.discrepancy_count}</p></div>
                <div className={KPI_CARD + " !p-3"}><p className={KPI_LABEL}>Unresolved</p><p className={`mt-0.5 text-xl font-bold ${stat.unresolved_count > 0 ? "text-amber-400" : "text-zinc-400"}`}>{stat.unresolved_count}</p></div>
                <div className={KPI_CARD + " !p-3"}><p className={KPI_LABEL}>Total Variance</p><p className={`mt-0.5 text-base font-bold ${Number(stat.total_variance_abs) > 0 ? "text-red-400" : "text-zinc-400"}`}>{fmtAmount(stat.total_variance_abs, currency)}</p></div>
              </div>

              <div className="mt-3 h-1.5 rounded-full bg-white/5">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${Number(stat.discrepancy_rate_pct || 0) === 0 ? "bg-emerald-500" : Number(stat.discrepancy_rate_pct || 0) <= 15 ? "bg-amber-500" : "bg-red-500"}`}
                  style={{ width: `${Math.min(100, Number(stat.discrepancy_rate_pct || 0) * 2)}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tab 5: Settings ─────────────────────────────────────────────────────────

function SettingsTab({ onSettingsChange }: { onSettingsChange: (s: MatchSettings) => void }) {
  const city = useCity();
  const currency = getCurrency(city);
  const [settings, setSettings] = useState<MatchSettings | null>(null);
  const [tolAed, setTolAed] = useState("1.00");
  const [tolPct, setTolPct] = useState("0.5");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch(`/procurement/po-match/settings?city=${city}`);
      const s = d.settings as MatchSettings;
      setSettings(s);
      setTolAed(String(s.tolerance_aed ?? 1.0));
      setTolPct(String(((s.tolerance_pct ?? 0.005) * 100).toFixed(2)));
    } catch { /* keep defaults */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    const aed = parseFloat(tolAed || "1");
    const pct = parseFloat(tolPct || "0.5") / 100;
    if (isNaN(aed) || aed < 0) { setMsg({ text: `${currency} tolerance must be ≥ 0.`, ok: false }); return; }
    if (isNaN(pct) || pct < 0 || pct > 1) { setMsg({ text: "Percentage must be between 0% and 100%.", ok: false }); return; }
    setSaving(true);
    setMsg(null);
    try {
      const d = await apiFetch("/procurement/po-match/settings", {
        method: "POST",
        body: JSON.stringify({ city, tolerance_aed: aed, tolerance_pct: pct }),
      });
      setSettings(d.settings);
      onSettingsChange(d.settings);
      setMsg({ text: "Settings saved.", ok: true });
    } catch (e: unknown) { setMsg({ text: String(e), ok: false }); }
    finally { setSaving(false); }
  };

  const previewTol = (poAmt: number) => {
    const aed = parseFloat(tolAed || "1");
    const pct = parseFloat(tolPct || "0.5") / 100;
    return Math.max(aed, poAmt * pct).toFixed(2);
  };

  return (
    <div className="space-y-6">
      <div className={`${GLASS_CARD} p-6`}>
        <h2 className={T_SECTION}>Match Tolerance Settings</h2>
        <p className="mt-1 text-sm text-zinc-500">
          An invoice is considered <span className="text-emerald-400 font-medium">Matched</span> when the variance is within both the fixed {currency} tolerance <strong>and</strong> the percentage tolerance.
          The larger of the two is used as the effective tolerance.
        </p>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div>
            <label className={T_LABEL}>Fixed Tolerance ({currency})</label>
            <p className={`${T_CAPTION} mt-0.5`}>Minimum absolute tolerance regardless of PO size</p>
            <div className="relative mt-2">
              <input
                type="number" min="0" step="0.01"
                className={INPUT_CLASS}
                value={tolAed}
                onChange={e => setTolAed(e.target.value)}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-zinc-500">{currency}</span>
            </div>
          </div>

          <div>
            <label className={T_LABEL}>Percentage Tolerance (%)</label>
            <p className={`${T_CAPTION} mt-0.5`}>Scales with the PO amount (e.g. 0.5% of {currency} 1,000 = {currency} 5)</p>
            <div className="relative mt-2">
              <input
                type="number" min="0" max="100" step="0.01"
                className={INPUT_CLASS}
                value={tolPct}
                onChange={e => setTolPct(e.target.value)}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-zinc-500">%</span>
            </div>
          </div>
        </div>

        {/* Preview table */}
        <div className={`mt-6 rounded-xl border border-white/8 bg-white/3 p-4`}>
          <p className="mb-3 text-sm font-medium text-zinc-400">Effective tolerance preview</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className={`${TABLE_HEADER} text-left pb-2`}>PO Amount</th>
                  <th className={`${TABLE_HEADER} text-right pb-2`}>Effective Tolerance</th>
                  <th className={`${TABLE_HEADER} text-right pb-2`}>Max Invoice Allowed</th>
                  <th className={`${TABLE_HEADER} text-right pb-2`}>Min Invoice Allowed</th>
                </tr>
              </thead>
              <tbody>
                {[100, 500, 1000, 5000, 10000].map(amt => {
                  const tol = parseFloat(previewTol(amt));
                  return (
                    <tr key={amt} className={TABLE_ROW}>
                      <td className={`${TABLE_CELL} text-zinc-300`}>{currency} {amt.toLocaleString()}</td>
                      <td className={`${TABLE_CELL} text-right text-violet-300`}>±{currency} {tol.toFixed(2)}</td>
                      <td className={`${TABLE_CELL} text-right text-zinc-400`}>{currency} {(amt + tol).toFixed(2)}</td>
                      <td className={`${TABLE_CELL} text-right text-zinc-400`}>{currency} {(amt - tol).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button className={PRIMARY_BUTTON} onClick={handleSave} disabled={saving}>
            <Save size={14} className="mr-1.5 inline" />
            {saving ? "Saving…" : "Save Settings"}
          </button>
          {msg && <p className={`text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>}
        </div>

        {settings?.updated_by && (
          <p className={`mt-3 ${T_CAPTION}`}>
            Last updated by {settings.updated_by} · {settings.updated_at?.slice(0, 16).replace("T", " ")}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = "entry" | "queue" | "records" | "scorecard" | "settings";

export default function PoMatchPage() {
  const [tab, setTab] = useState<Tab>("entry");
  const [discrepancyCount, setDiscrepancyCount] = useState(0);
  const [settings, setSettings] = useState<MatchSettings | null>(null);
  const [city, setCity] = useState<string>(getInitialCity);

  const handleCityChange = (newCity: string) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("po_match_city", newCity);
    }
    setCity(newCity);
  };

  const refreshBadge = useCallback(async () => {
    try {
      const d = await apiFetch(`/procurement/po-match?city=${city}&match_status=DISCREPANCY&limit=500`);
      const unresolved = (d.rows || []).filter((r: CheckRow) => !r.resolved_by).length;
      setDiscrepancyCount(unresolved);
    } catch { /* ignore */ }
  }, [city]);

  const loadSettings = useCallback(async () => {
    try {
      const d = await apiFetch(`/procurement/po-match/settings?city=${city}`);
      setSettings(d.settings);
    } catch { /* use defaults */ }
  }, [city]);

  useEffect(() => {
    refreshBadge();
    loadSettings();
  }, [refreshBadge, loadSettings]);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "entry", label: "Quick Entry", icon: <ClipboardList size={15} /> },
    {
      id: "queue",
      label: discrepancyCount > 0 ? `Discrepancy Queue (${discrepancyCount})` : "Discrepancy Queue",
      icon: <AlertTriangle size={15} />,
    },
    { id: "records", label: "All Records", icon: <ShieldCheck size={15} /> },
    { id: "scorecard", label: "Supplier Scorecard", icon: <TrendingUp size={15} /> },
    { id: "settings", label: "Settings", icon: <Settings size={15} /> },
  ];

  return (
    <CityCtx.Provider value={city}>
      <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 p-4 sm:p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className={T_PAGE_TITLE}>PO — Invoice Match</h1>
              <p className="mt-1 text-sm text-zinc-500">
                Enter daily supplier invoices. Matching amounts close automatically. Discrepancies go to review queue.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <label className={T_LABEL}>City</label>
              <select
                className={SELECT_CLASS + " w-auto"}
                value={city}
                onChange={e => handleCityChange(e.target.value)}
              >
                <option value="dubai">Dubai (AED)</option>
                <option value="manila">Manila (PHP)</option>
              </select>
            </div>
          </div>

          <div className={TAB_CONTAINER}>
            {tabs.map(t => (
              <button
                key={t.id}
                className={`flex items-center gap-1.5 ${tab === t.id ? TAB_ACTIVE : TAB_INACTIVE} ${t.id === "queue" && discrepancyCount > 0 ? "text-amber-300" : ""}`}
                onClick={() => setTab(t.id)}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          {tab === "entry" && <QuickEntryTab key={`entry-${city}`} onSaved={refreshBadge} settings={settings} />}
          {tab === "queue" && <DiscrepancyQueueTab key={`queue-${city}`} />}
          {tab === "records" && <AllRecordsTab key={`records-${city}`} />}
          {tab === "scorecard" && <SupplierScorecardTab key={`scorecard-${city}`} />}
          {tab === "settings" && <SettingsTab key={`settings-${city}`} onSettingsChange={setSettings} />}
        </div>
      </div>
    </CityCtx.Provider>
  );
}
