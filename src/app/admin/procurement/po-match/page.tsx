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
  Trash2,
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
import SelectDark from "@/components/SelectDark";
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
  branch?: string;
  request_id?: string;
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
  extra_photos?: string[];
  created_at: string;
  branch?: string;
  vat_rate?: number;
  vat_amount?: number;
  grand_total?: number;
  receiving_id?: string;
};

type PoLineItem = {
  line_no: number;
  item_name: string;
  po_qty: number;
  po_unit: string;
  po_unit_price: number;
  po_line_total: number;
  category?: string;
};

type InvLineItem = {
  line_no: number;
  item_name: string;
  po_qty: number;
  po_unit: string;
  po_unit_price: number;
  po_line_total: number;
  inv_qty: string;
  inv_unit: string;
  inv_unit_price: string;
  is_extra: boolean;
};

type CheckLine = {
  id: string;
  check_id: string;
  line_no: number;
  item_name: string;
  po_qty: number;
  po_unit: string;
  po_unit_price: number;
  po_line_total: number;
  inv_qty: number;
  inv_unit: string;
  inv_unit_price: number;
  inv_line_total: number;
  line_status: string;
  qty_delta: number;
  price_delta: number;
  amount_delta: number;
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

type LinkedRequest = {
  id: string;
  request_no: string;
  po_no: string;
  branch: string;
  total_amount: number;
  currency: string;
  request_date: string;
  receiving_status: string;
  vendor_summary: string;
};

type MatchSettings = {
  city: string;
  tolerance_aed: number;
  tolerance_pct: number;
  default_vat_rate?: number;
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

const LINE_STATUS_META: Record<string, { label: string; color: string }> = {
  MATCHED:     { label: "✅ Matched",     color: "text-emerald-400" },
  AMOUNT_DIFF: { label: "🔴 Amount Diff", color: "text-red-400" },
  QTY_DIFF:    { label: "🟡 Qty Diff",    color: "text-amber-300" },
  PRICE_DIFF:  { label: "🟡 Price Diff",  color: "text-amber-300" },
  MISSING:     { label: "⚫ Missing",      color: "text-zinc-400" },
  EXTRA:       { label: "🟣 Extra Line",  color: "text-violet-400" },
};

function LineBadge({ status }: { status: string }) {
  const m = LINE_STATUS_META[status] || { label: status, color: "text-zinc-400" };
  return <span className={`text-xs font-semibold ${m.color}`}>{m.label}</span>;
}

function CheckLinesTable({ lines, currency }: { lines: CheckLine[]; currency: string }) {
  if (!lines.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/10">
            <th className="py-2 pr-3 text-left font-medium text-zinc-500">Item</th>
            <th className="py-2 pr-2 text-right font-medium text-zinc-500">PO Qty</th>
            <th className="py-2 pr-2 text-left font-medium text-zinc-500">Unit</th>
            <th className="py-2 pr-3 text-right font-medium text-zinc-500">PO Price</th>
            <th className="py-2 pr-3 text-right font-medium text-zinc-500">PO Total</th>
            <th className="py-2 pr-2 text-right font-medium text-zinc-500">Inv Qty</th>
            <th className="py-2 pr-3 text-right font-medium text-zinc-500">Inv Price</th>
            <th className="py-2 pr-3 text-right font-medium text-zinc-500">Inv Total</th>
            <th className="py-2 text-left font-medium text-zinc-500">Status</th>
          </tr>
        </thead>
        <tbody>
          {lines.map(l => (
            <tr key={l.id} className="border-b border-white/5">
              <td className="py-2 pr-3 text-zinc-200">{l.item_name || "—"}</td>
              <td className="py-2 pr-2 text-right text-zinc-400">{l.po_qty > 0 ? l.po_qty : "—"}</td>
              <td className="py-2 pr-2 text-zinc-400">{l.po_unit || "—"}</td>
              <td className="py-2 pr-3 text-right text-zinc-400">{l.po_unit_price > 0 ? l.po_unit_price.toFixed(2) : "—"}</td>
              <td className="py-2 pr-3 text-right text-zinc-300">{l.po_line_total > 0 ? l.po_line_total.toFixed(2) : "—"}</td>
              <td className="py-2 pr-2 text-right text-zinc-200">{l.inv_qty > 0 ? l.inv_qty : "—"}</td>
              <td className="py-2 pr-3 text-right text-zinc-200">{l.inv_unit_price > 0 ? l.inv_unit_price.toFixed(2) : "—"}</td>
              <td className={`py-2 pr-3 text-right font-semibold ${l.line_status === "MATCHED" ? "text-emerald-400" : l.line_status === "AMOUNT_DIFF" || l.line_status === "MISSING" ? "text-red-400" : "text-amber-300"}`}>
                {l.inv_line_total > 0 ? l.inv_line_total.toFixed(2) : l.line_status === "MISSING" ? "0.00" : "—"}
              </td>
              <td className="py-2 whitespace-nowrap"><LineBadge status={l.line_status} /></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-white/10">
            <td colSpan={4} className="py-2 text-xs text-zinc-500">Line totals ({currency})</td>
            <td className="py-2 pr-3 text-right text-xs font-semibold text-zinc-300">
              {lines.reduce((s, l) => s + l.po_line_total, 0).toFixed(2)}
            </td>
            <td colSpan={2} />
            <td className="py-2 pr-3 text-right text-xs font-semibold text-emerald-300">
              {lines.reduce((s, l) => s + l.inv_line_total, 0).toFixed(2)}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

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
          {uploading ? "Uploading…" : compact ? "Add Photo" : "Attach Invoice Photo"}
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

// ─── Multi-photo upload ───────────────────────────────────────────────────────

function MultiPhotoUpload({
  photos,
  onChange,
  checkId,
  maxPhotos = 5,
  allowRemove,
}: {
  photos: string[];
  onChange: (photos: string[]) => void;
  checkId?: string;
  maxPhotos?: number;
  allowRemove?: boolean;
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
        // 既存レコードへの追加：add-photo エンドポイントを呼ぶ
        if (photos.length === 0) {
          await apiFetch(`/procurement/po-match/${checkId}/photo`, {
            method: "POST",
            body: JSON.stringify({ photo_data: b64 }),
          });
        } else {
          await apiFetch(`/procurement/po-match/${checkId}/add-photo`, {
            method: "POST",
            body: JSON.stringify({ photo_data: b64 }),
          });
        }
      }
      onChange([...photos, b64]);
    } catch { setMsg("Upload failed. Try again."); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const removePhoto = (index: number) => {
    onChange(photos.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {photos.map((src, i) => (
            <div key={i} className="relative inline-block">
              <img
                src={src}
                alt={`Invoice photo ${i + 1}`}
                className="h-32 rounded-xl border border-white/10 object-contain"
              />
              {(allowRemove ?? !checkId) && (
                <button
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-zinc-400 hover:text-red-400"
                  onClick={() => removePhoto(i)}
                  title="Remove photo"
                >
                  <XCircle size={14} />
                </button>
              )}
              {i === 0 && (
                <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-zinc-300">
                  Main
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {photos.length < maxPhotos && (
        <button
          className={`${SMALL_BUTTON} flex items-center gap-1.5`}
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          <Camera size={13} />
          {uploading ? "Uploading…" : photos.length === 0 ? "Attach Invoice Photo" : "Add Another Invoice"}
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
  // Phase 2: line items
  const [invLineItems, setInvLineItems] = useState<InvLineItem[]>([]);
  const [linesLoading, setLinesLoading] = useState(false);
  const poLinesFetchRef = useRef<AbortController | null>(null);
  const isAmountOverriddenRef = useRef(false);
  const [vatRate, setVatRate] = useState(() => String(settings?.default_vat_rate ?? 0));
  const vatRateInitialized = useRef(false);
  useEffect(() => {
    if (!vatRateInitialized.current && settings?.default_vat_rate != null) {
      setVatRate(String(settings.default_vat_rate));
      vatRateInitialized.current = true;
    }
  }, [settings]);
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [discrepancyType, setDiscrepancyType] = useState("OTHER");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [showPoList, setShowPoList] = useState(false);
  const vendorDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const poNoDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Close Order – Not Received
  const [cnrOpen, setCnrOpen] = useState(false);
  const [cnrApproverName, setCnrApproverName] = useState("");
  const [cnrPin, setCnrPin] = useState("");
  const [cnrReason, setCnrReason] = useState("");
  const [cnrBusy, setCnrBusy] = useState(false);
  const [cnrMsg, setCnrMsg] = useState<{ text: string; ok: boolean } | null>(null);
  // Tier-2 link: find a matching proc_request for manual Quick Entry records
  const [linkedRequest, setLinkedRequest] = useState<LinkedRequest | null>(null);
  const [linkSuggestions, setLinkSuggestions] = useState<LinkedRequest[]>([]);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkDismissed, setLinkDismissed] = useState(false);
  const linkDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Lookup proc_request candidates for Tier-2 sync (manual Quick Entry without a formal PO)
  useEffect(() => {
    if (linkedRequest || linkDismissed) return;
    if (linkDebounce.current) clearTimeout(linkDebounce.current);
    const pn = manualPoNo.trim();
    const vn = vendorQ.trim();
    if (pn.length >= 4 || vn.length >= 2) {
      linkDebounce.current = setTimeout(async () => {
        setLinkLoading(true);
        try {
          const params = new URLSearchParams({ city, limit: "3" });
          if (pn) params.set("po_no", pn);
          if (vn) params.set("vendor_name", vn);
          const d = await apiFetch(`/procurement/po-match/lookup-request?${params}`);
          setLinkSuggestions(d.rows || []);
        } catch { /* ignore */ }
        finally { setLinkLoading(false); }
      }, 600);
    } else {
      setLinkSuggestions([]);
    }
    return () => { if (linkDebounce.current) clearTimeout(linkDebounce.current); };
  }, [manualPoNo, vendorQ, city, linkedRequest, linkDismissed]);

  const selectPo = async (po: PoRow) => {
    setSelectedPo(po);
    setVendorQ(po.vendor_name);
    setManualPoNo(po.po_no);
    setManualPoAmount(String(po.po_amount));
    setPoDate(po.po_date?.slice(0, 10) || TODAY);
    setShowPoList(false);
    // Cancel any in-flight PO-lines fetch from a prior selection
    if (poLinesFetchRef.current) poLinesFetchRef.current.abort();
    if (po.po_no) {
      const controller = new AbortController();
      poLinesFetchRef.current = controller;
      isAmountOverriddenRef.current = false; // new PO selected — re-enable auto-sum
      setLinesLoading(true);
      try {
        const d = await apiFetch(`/procurement/po-match/po-lines?city=${city}&po_no=${encodeURIComponent(po.po_no)}`, { signal: controller.signal });
        const poLines: PoLineItem[] = d.lines || [];
        setInvLineItems(poLines.map(l => ({
          line_no: l.line_no,
          item_name: l.item_name,
          po_qty: l.po_qty,
          po_unit: l.po_unit,
          po_unit_price: l.po_unit_price,
          po_line_total: l.po_line_total,
          inv_qty: String(l.po_qty || ""),
          inv_unit: l.po_unit,
          inv_unit_price: String(l.po_unit_price || ""),
          is_extra: false,
        })));
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return; // stale fetch — ignore
        /* other errors: leave lines empty */
      } finally { setLinesLoading(false); }
    } else {
      setInvLineItems([]);
    }
  };

  // Auto-sync invoice amount from line totals when lines are present
  const lineTotal = invLineItems.reduce((s, l) => {
    const q = parseFloat(l.inv_qty || "0");
    const p = parseFloat(l.inv_unit_price || "0");
    return s + Math.round(q * p * 100) / 100;
  }, 0);

  useEffect(() => {
    if (invLineItems.length === 0 || isAmountOverriddenRef.current) return;
    setInvoiceAmount(lineTotal > 0 ? lineTotal.toFixed(2) : "0.00");
  }, [lineTotal, invLineItems.length]);

  const updateInvLine = (idx: number, field: keyof InvLineItem, value: string) => {
    setInvLineItems(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };

  const addExtraLine = () => {
    setInvLineItems(prev => [...prev, {
      line_no: prev.length + 1,
      item_name: "",
      po_qty: 0, po_unit: "", po_unit_price: 0, po_line_total: 0,
      inv_qty: "", inv_unit: "", inv_unit_price: "",
      is_extra: true,
    }]);
  };

  const removeExtraLine = (idx: number) => {
    setInvLineItems(prev => prev.filter((_, i) => i !== idx));
  };

  const tolAed = settings?.tolerance_aed ?? 1.0;
  const tolPct = settings?.tolerance_pct ?? 0.005;
  const poAmount = selectedPo ? selectedPo.po_amount : parseFloat(manualPoAmount || "0");
  const invAmount = parseFloat(invoiceAmount || "0");
  const vatRateVal = parseFloat(vatRate || "0");
  const vatAmountVal = Math.round(invAmount * vatRateVal) / 100;
  const grandTotalVal = invAmount + vatAmountVal;
  const variance = invAmount - poAmount;
  const effectiveTol = poAmount > 0 ? Math.max(tolAed, poAmount * tolPct) : tolAed;
  const isMatch = poAmount > 0 && Math.abs(variance) <= effectiveTol;

  const handleSubmit = async () => {
    if (!vendorQ.trim()) { setMsg({ text: "Enter supplier name.", ok: false }); return; }
    if (!(poAmount > 0)) { setMsg({ text: "Enter PO amount.", ok: false }); return; }
    if (!invoiceNo.trim()) { setMsg({ text: "Enter invoice number.", ok: false }); return; }
    if (!(invAmount > 0)) { setMsg({ text: "Enter invoice amount.", ok: false }); return; }
    if (photos.length === 0) { setMsg({ text: "Invoice photo is required. Please attach the supplier invoice before submitting.", ok: false }); return; }
    setSaving(true);
    setMsg(null);
    try {
      const linesPayload = invLineItems.length > 0
        ? invLineItems
            .filter(l => l.item_name.trim() || l.is_extra === false)
            .map((l, i) => ({
              line_no: i + 1,
              item_name: l.item_name,
              po_qty: l.po_qty,
              po_unit: l.po_unit,
              po_unit_price: l.po_unit_price,
              po_line_total: l.po_line_total,
              inv_qty: parseFloat(l.inv_qty || "0"),
              inv_unit: l.inv_unit,
              inv_unit_price: parseFloat(l.inv_unit_price || "0"),
              inv_line_total: Math.round(parseFloat(l.inv_qty || "0") * parseFloat(l.inv_unit_price || "0") * 100) / 100,
              is_extra: l.is_extra,
            }))
        : null;
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
          vat_rate: vatRateVal,
          vat_amount: vatAmountVal,
          grand_total: grandTotalVal,
          notes: notes.trim(),
          photo_data: photos[0] ?? "",
          extra_photos: photos.slice(1),
          discrepancy_type: !isMatch ? discrepancyType : "",
          ...(linkedRequest ? { linked_request_id: linkedRequest.id } : {}),
          ...(linesPayload ? { lines: linesPayload } : {}),
        }),
      });
      const matchMsg = isMatch
        ? "✅ Matched — no further action needed."
        : `⚠️ Discrepancy detected (${variance > 0 ? "+" : ""}${variance.toFixed(2)} ${currency}). Added to review queue.`;
      const syncMsg = linkedRequest && isMatch ? " Store Procurement order status updated to Confirmed." : "";
      setMsg({ text: matchMsg + syncMsg, ok: isMatch });
      setVendorQ(""); setSelectedPo(null); setManualPoNo(""); setManualPoAmount("");
      setInvoiceNo(""); setInvoiceAmount(""); setNotes(""); setPhotos([]);
      setPoDate(TODAY); setInvoiceDate(TODAY); setPoRows([]);
      setDiscrepancyType("OTHER");
      setVatRate(String(settings?.default_vat_rate ?? 0));
      setInvLineItems([]);
      setLinkedRequest(null); setLinkSuggestions([]); setLinkDismissed(false);
      isAmountOverriddenRef.current = false;
      poLinesFetchRef.current = null;
      onSaved();
    } catch (e: unknown) {
      setMsg({ text: String(e), ok: false });
    } finally { setSaving(false); }
  };

  const handleCnrSubmit = async () => {
    if (!selectedPo?.request_id) { setCnrMsg({ text: "No procurement request linked to this PO. Close from Store Procurement → Receiving instead.", ok: false }); return; }
    if (!cnrApproverName.trim()) { setCnrMsg({ text: "Enter approver name.", ok: false }); return; }
    if (!cnrPin.trim()) { setCnrMsg({ text: "Enter PIN.", ok: false }); return; }
    setCnrBusy(true);
    setCnrMsg(null);
    try {
      await apiFetch(`/procurement/requests/${selectedPo.request_id}/close-not-received`, {
        method: "POST",
        body: JSON.stringify({ approver_name: cnrApproverName.trim(), pin: cnrPin.trim(), reason: cnrReason.trim() }),
      });
      setCnrOpen(false); setCnrApproverName(""); setCnrPin(""); setCnrReason(""); setCnrMsg(null);
      setMsg({ text: "✅ Order closed as Not Received.", ok: true });
      setVendorQ(""); setSelectedPo(null); setManualPoNo(""); setManualPoAmount("");
      onSaved();
    } catch (e: unknown) {
      setCnrMsg({ text: String(e), ok: false });
    } finally { setCnrBusy(false); }
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

          {/* Tier-2 link suggestion: match to an existing proc_request */}
          {!linkedRequest && !linkDismissed && linkSuggestions.length > 0 && (
            <div className="sm:col-span-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="mb-2 text-xs font-medium text-amber-300">
                🔗 Possible procurement order match — link to sync receiving status automatically:
              </p>
              <div className="space-y-1.5">
                {linkSuggestions.map(req => (
                  <div key={req.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-zinc-200">{req.vendor_summary || req.po_no}</p>
                      <p className="text-xs text-zinc-500">
                        {req.request_no} · {req.branch} · {req.total_amount.toLocaleString()} {req.currency} · {req.request_date?.slice(0, 10)}
                      </p>
                    </div>
                    <button
                      className="shrink-0 rounded-lg bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/30"
                      onClick={() => { setLinkedRequest(req); setLinkSuggestions([]); }}
                    >
                      Link
                    </button>
                  </div>
                ))}
              </div>
              <button
                className="mt-2 text-xs text-zinc-500 hover:text-zinc-300"
                onClick={() => { setLinkDismissed(true); setLinkSuggestions([]); }}
              >
                Skip — no match
              </button>
            </div>
          )}
          {linkedRequest && (
            <div className="sm:col-span-2 flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-2.5">
              <div>
                <p className="text-xs font-medium text-emerald-400">🔗 Linked to procurement order</p>
                <p className="text-xs text-zinc-400">
                  {linkedRequest.request_no} · {linkedRequest.vendor_summary || linkedRequest.po_no} · {linkedRequest.branch}
                </p>
              </div>
              <button
                className="text-xs text-zinc-500 hover:text-zinc-300"
                onClick={() => { setLinkedRequest(null); setLinkDismissed(false); }}
              >
                Unlink
              </button>
            </div>
          )}
          {linkLoading && !linkedRequest && !linkDismissed && (
            <div className="sm:col-span-2 flex items-center gap-2 text-xs text-zinc-500">
              <RefreshCw size={11} className="animate-spin" />
              Searching for matching procurement orders…
            </div>
          )}

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

          {/* Branch / Location — shown when a PO is selected */}
          {selectedPo?.branch ? (
            <div>
              <label className={T_LABEL}>Branch / Location</label>
              <div className="mt-1.5 flex items-center rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <span className="text-zinc-200">{selectedPo.branch}</span>
              </div>
            </div>
          ) : <div />}

          {/* Phase 2: Line Items Table */}
          {(invLineItems.length > 0 || linesLoading) && (
            <div className="sm:col-span-2 border-t border-white/10 pt-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-zinc-300">📋 Invoice Line Items</p>
                <button
                  type="button"
                  className="text-xs text-violet-400 hover:underline"
                  onClick={addExtraLine}
                >
                  + Add Extra Line
                </button>
              </div>
              {linesLoading ? (
                <p className="text-xs text-zinc-500">Loading PO line items…</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="py-1.5 pr-2 text-left font-medium text-zinc-500">Item</th>
                        <th className="py-1.5 pr-2 text-right font-medium text-zinc-500">PO Qty</th>
                        <th className="py-1.5 pr-2 text-right font-medium text-zinc-500">PO Price</th>
                        <th className="py-1.5 pr-2 text-right font-medium text-zinc-500">PO Total</th>
                        <th className="py-1.5 pr-2 text-center font-medium text-zinc-500">→</th>
                        <th className="py-1.5 pr-2 font-medium text-zinc-300">Inv Qty *</th>
                        <th className="py-1.5 pr-2 font-medium text-zinc-300">Inv Price *</th>
                        <th className="py-1.5 pr-2 text-right font-medium text-zinc-300">Inv Total</th>
                        <th className="py-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {invLineItems.map((line, idx) => {
                        const iq = parseFloat(line.inv_qty || "0");
                        const ip = parseFloat(line.inv_unit_price || "0");
                        const invTotal = Math.round(iq * ip * 100) / 100;
                        const poTotal = line.po_line_total;
                        const diff = invTotal - poTotal;
                        const isDiff = !line.is_extra && poTotal > 0 && Math.abs(diff) > (settings?.tolerance_aed ?? 1);
                        return (
                          <tr key={idx} className="border-b border-white/5">
                            <td className="py-1 pr-2">
                              {line.is_extra ? (
                                <input
                                  className="w-28 rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-violet-500"
                                  placeholder="Item name"
                                  value={line.item_name}
                                  onChange={e => updateInvLine(idx, "item_name", e.target.value)}
                                />
                              ) : (
                                <span className="text-zinc-300">{line.item_name}</span>
                              )}
                            </td>
                            <td className="py-1 pr-2 text-right text-zinc-500">{line.po_qty > 0 ? line.po_qty : "—"}</td>
                            <td className="py-1 pr-2 text-right text-zinc-500">{line.po_unit_price > 0 ? line.po_unit_price.toFixed(2) : "—"}</td>
                            <td className="py-1 pr-2 text-right text-zinc-400">{line.po_line_total > 0 ? line.po_line_total.toFixed(2) : "—"}</td>
                            <td className="py-1 pr-2 text-center text-zinc-600">→</td>
                            <td className="py-1 pr-2">
                              <input
                                type="number" min="0" step="0.001"
                                className="w-20 rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-violet-500"
                                placeholder="0"
                                value={line.inv_qty}
                                onChange={e => updateInvLine(idx, "inv_qty", e.target.value)}
                              />
                            </td>
                            <td className="py-1 pr-2">
                              <input
                                type="number" min="0" step="0.01"
                                className="w-24 rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-violet-500"
                                placeholder="0.00"
                                value={line.inv_unit_price}
                                onChange={e => updateInvLine(idx, "inv_unit_price", e.target.value)}
                              />
                            </td>
                            <td className={`py-1 pr-2 text-right font-semibold ${isDiff ? "text-red-400" : "text-emerald-300"}`}>
                              {invTotal > 0 ? invTotal.toFixed(2) : "—"}
                              {isDiff && <span className="ml-1 text-red-400">({diff > 0 ? "+" : ""}{diff.toFixed(2)})</span>}
                            </td>
                            <td className="py-1">
                              {line.is_extra && (
                                <button
                                  type="button"
                                  className="text-zinc-600 hover:text-red-400"
                                  onClick={() => removeExtraLine(idx)}
                                >
                                  <XCircle size={13} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-white/10">
                        <td colSpan={3} className="py-1.5 text-xs text-zinc-500">Line totals</td>
                        <td className="py-1.5 pr-2 text-right text-xs font-semibold text-zinc-400">
                          {invLineItems.reduce((s, l) => s + l.po_line_total, 0).toFixed(2)}
                        </td>
                        <td colSpan={3} />
                        <td className="py-1.5 pr-2 text-right text-xs font-bold text-emerald-300">
                          {lineTotal.toFixed(2)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
              <p className="mt-1 text-xs text-zinc-600">Invoice Amount below is auto-filled from line totals. Edit to override (e.g. to include tax).</p>
            </div>
          )}

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
              onChange={e => { isAmountOverriddenRef.current = true; setInvoiceAmount(e.target.value); }}
            />
            {invLineItems.length > 0 && (
              <p className={`mt-1 ${T_CAPTION}`}>← Auto-summed from line items. Edit to override.</p>
            )}
          </div>

          {/* VAT fields */}
          <div>
            <label className={T_LABEL}>VAT Rate (%)</label>
            <div className="relative mt-1.5">
              <input
                type="number" min="0" max="100" step="0.1"
                className={INPUT_CLASS}
                placeholder="0"
                value={vatRate}
                onChange={e => setVatRate(e.target.value)}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-zinc-500">%</span>
            </div>
            <p className={`mt-1 ${T_CAPTION}`}>0 = no VAT</p>
          </div>

          <div>
            <label className={T_LABEL}>Grand Total ({currency})</label>
            <div className="mt-1.5 flex items-center rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <span className="text-zinc-200 font-mono">
                {grandTotalVal > 0 ? grandTotalVal.toFixed(2) : "—"}
              </span>
              {vatAmountVal > 0 && (
                <span className="ml-2 text-xs text-zinc-500">
                  (incl. {currency} {vatAmountVal.toFixed(2)} VAT)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Live match preview — only show after invoice number is entered */}
        {poAmount > 0 && invAmount > 0 && invoiceNo.trim() && (
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
                <SelectDark
                  className={`mt-1.5 ${SELECT_CLASS}`}
                  value={discrepancyType}
                  onChange={setDiscrepancyType}
                  options={DISCREPANCY_TYPES.map(t => ({ value: t.value, label: t.label }))}
                />
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
          <label className={`${T_LABEL} mb-1.5 block`}>
            Invoice Photo(s) *
            {photos.length > 1 && <span className="ml-2 text-xs font-normal text-zinc-400">{photos.length} photos attached</span>}
          </label>
          <MultiPhotoUpload photos={photos} onChange={setPhotos} />
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

      {/* Close Order – Not Received (only when a PO with a request_id is selected) */}
      {selectedPo?.request_id && (
        <div className={`${GLASS_CARD} p-5`}>
          {cnrOpen ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-red-300">⚠️ Close Order – Not Received</p>
              <p className="text-xs text-zinc-400">
                This will mark the procurement request linked to <span className="text-white font-medium">{selectedPo.po_no || selectedPo.vendor_name}</span> as NOT RECEIVED.
                A manager PIN is required.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={T_LABEL}>Approver Name *</label>
                  <input
                    className={`mt-1.5 ${INPUT_CLASS}`}
                    placeholder="Manager name"
                    value={cnrApproverName}
                    onChange={e => setCnrApproverName(e.target.value)}
                  />
                </div>
                <div>
                  <label className={T_LABEL}>PIN *</label>
                  <input
                    type="password"
                    className={`mt-1.5 ${INPUT_CLASS}`}
                    placeholder="Manager PIN"
                    value={cnrPin}
                    onChange={e => setCnrPin(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleCnrSubmit()}
                  />
                </div>
              </div>
              <div>
                <label className={T_LABEL}>Reason (optional)</label>
                <input
                  className={`mt-1.5 ${INPUT_CLASS}`}
                  placeholder="e.g. Supplier did not deliver"
                  value={cnrReason}
                  onChange={e => setCnrReason(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <button className={DANGER_BUTTON} onClick={handleCnrSubmit} disabled={cnrBusy}>
                  {cnrBusy ? "Processing…" : "Confirm – Close Not Received"}
                </button>
                <button className={SECONDARY_BUTTON} onClick={() => { setCnrOpen(false); setCnrApproverName(""); setCnrPin(""); setCnrReason(""); setCnrMsg(null); }}>
                  Cancel
                </button>
              </div>
              {cnrMsg && (
                <p className={`text-sm ${cnrMsg.ok ? "text-emerald-400" : "text-red-400"}`}>{cnrMsg.text}</p>
              )}
            </div>
          ) : (
            <button
              className="flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/8 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/15"
              onClick={() => setCnrOpen(true)}
            >
              <XCircle size={14} /> Close Order – Not Received
            </button>
          )}
        </div>
      )}
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
  const [cnrId, setCnrId] = useState<string | null>(null);
  const [cnrPin, setCnrPin] = useState("");
  const [cnrBusy, setCnrBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [linesCache, setLinesCache] = useState<Record<string, CheckLine[]>>({});

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

  const handleCloseNotReceived = async () => {
    if (!cnrId || !cnrPin.trim()) { setMsg("Enter your PIN to confirm."); return; }
    const auth = getAuth();
    setCnrBusy(true);
    setMsg("");
    try {
      await apiFetch(`/procurement/po-match/${cnrId}/close-not-received`, {
        method: "POST",
        body: JSON.stringify({ staff_name: auth?.staffName || "", pin: cnrPin.trim(), city }),
      });
      setCnrId(null); setCnrPin("");
      setMsg("Order marked as Not Received.");
      load();
    } catch (e: unknown) { setMsg(String(e)); }
    finally { setCnrBusy(false); }
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
            onClick={async () => {
              const next = expandedId === row.id ? null : row.id;
              if (next !== expandedId) { setResolveNote(""); setResolveType(row.discrepancy_type || "OTHER"); setMsg(""); }
              setExpandedId(next);
              // Fetch line items on first expand
              if (next && !linesCache[next]) {
                try {
                  const d = await apiFetch(`/procurement/po-match/${next}/lines`);
                  setLinesCache(prev => ({ ...prev, [next]: d.lines || [] }));
                } catch { /* lines unavailable */ }
              }
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
                {row.branch && (
                  <div><p className={T_LABEL}>Branch</p><p className="mt-0.5 text-zinc-300">{row.branch}</p></div>
                )}
                {(row.vat_rate ?? 0) > 0 && (
                  <div>
                    <p className={T_LABEL}>Grand Total (incl. VAT {row.vat_rate}%)</p>
                    <p className="mt-0.5 text-zinc-200">{fmtAmount(row.grand_total, currency)}</p>
                  </div>
                )}
                {row.notes && (
                  <div className="sm:col-span-3"><p className={T_LABEL}>Notes</p><p className="mt-0.5 text-zinc-300">{row.notes}</p></div>
                )}
              </div>

              {/* Line items breakdown */}
              {linesCache[row.id] && linesCache[row.id].length > 0 && (
                <div className="mt-4">
                  <p className={`${T_LABEL} mb-2`}>Line Item Detail</p>
                  <CheckLinesTable lines={linesCache[row.id]} currency={row.currency || currency} />
                </div>
              )}

              {/* Photo display */}
              {(row.photo_data || (row.extra_photos?.length ?? 0) > 0) && (
                <div className="mt-4">
                  <p className={`${T_LABEL} mb-1.5`}>
                    Invoice Photo{((row.extra_photos?.length ?? 0) > 0) ? `s (${1 + (row.extra_photos?.length ?? 0)})` : ""}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {row.photo_data && (
                      <div className="relative inline-block">
                        <img src={row.photo_data} alt="Invoice 1" className="max-h-48 rounded-xl border border-white/10 object-contain" />
                        <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-zinc-300">1</span>
                      </div>
                    )}
                    {(row.extra_photos ?? []).map((src, i) => (
                      <div key={i} className="relative inline-block">
                        <img src={src} alt={`Invoice ${i + 2}`} className="max-h-48 rounded-xl border border-white/10 object-contain" />
                        <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-zinc-300">{i + 2}</span>
                      </div>
                    ))}
                  </div>
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

              {/* Phase 5: Close Order – Not Received (only for linked receivings) */}
              {!row.resolved_by && row.receiving_id && (
                <div className="mt-4">
                  {cnrId === row.id ? (
                    <div className="rounded-xl border border-red-500/25 bg-red-500/8 p-3 space-y-2">
                      <p className="text-sm font-medium text-red-300">⚠️ Close Order – Not Received</p>
                      <p className="text-xs text-zinc-400">This will mark the linked receiving request as NOT RECEIVED. Enter your PIN to confirm.</p>
                      <div className="flex items-center gap-2">
                        <input
                          type="password"
                          className={`${INPUT_CLASS} w-32`}
                          placeholder="Your PIN"
                          value={cnrPin}
                          onChange={e => setCnrPin(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && handleCloseNotReceived()}
                        />
                        <button className={DANGER_BUTTON} onClick={handleCloseNotReceived} disabled={cnrBusy}>
                          {cnrBusy ? "Processing…" : "Confirm"}
                        </button>
                        <button className={SECONDARY_BUTTON} onClick={() => { setCnrId(null); setCnrPin(""); setMsg(""); }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/8 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/15"
                      onClick={() => { setCnrId(row.id); setCnrPin(""); setMsg(""); }}
                    >
                      <XCircle size={14} /> Close Order – Not Received
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
                    <SelectDark
                      className={`mt-1.5 ${SELECT_CLASS}`}
                      value={resolveType}
                      onChange={setResolveType}
                      options={DISCREPANCY_TYPES.map(t => ({ value: t.value, label: t.label }))}
                    />
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
                  <div>
                    <label className={`${T_LABEL} mb-1`}>
                      {row.photo_data ? "Add Invoice Photo" : "Attach Invoice Photo *"}
                    </label>
                    <MultiPhotoUpload
                      photos={[
                        ...(row.photo_data ? [row.photo_data] : []),
                        ...(row.extra_photos ?? []),
                      ]}
                      onChange={(newPhotos) => {
                        setRows(prev => prev.map(r =>
                          r.id === row.id
                            ? { ...r, photo_data: newPhotos[0] ?? "", extra_photos: newPhotos.slice(1) }
                            : r
                        ));
                      }}
                      checkId={row.id}
                    />
                  </div>
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
  const [deleting, setDeleting] = useState<string | null>(null);
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

  const handleDelete = async (id: string, vendorName: string) => {
    if (!confirm(`Delete this record?\n\n${vendorName}\n\nThis cannot be undone.`)) return;
    setDeleting(id);
    try {
      await apiFetch(`/procurement/po-match/${id}`, { method: "DELETE" });
      setRows(prev => prev.filter(r => r.id !== id));
    } catch (e) {
      alert(`Delete failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDeleting(null);
    }
  };

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
        <table className="w-full min-w-[780px]">
          <thead>
            <tr>
              <th className={`${TABLE_HEADER} py-3 pl-4 text-left`}>Date</th>
              <th className={`${TABLE_HEADER} py-3 pr-3 text-left`}>Supplier</th>
              <th className={`${TABLE_HEADER} py-3 pr-3 text-left`}>Branch</th>
              <th className={`${TABLE_HEADER} py-3 text-left`}>Invoice No.</th>
              <th className={`${TABLE_HEADER} py-3 pl-3 text-right`}>PO</th>
              <th className={`${TABLE_HEADER} py-3 pl-3 text-right`}>Invoice</th>
              <th className={`${TABLE_HEADER} py-3 pl-3 text-right`}>Variance</th>
              <th className={`${TABLE_HEADER} py-3 pr-4 text-center`}>Status</th>
              <th className={`${TABLE_HEADER} py-3 pr-4`}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={9} className="py-8 text-center text-sm text-zinc-500">{loading ? "Loading…" : "No records found."}</td></tr>
            )}
            {rows.map(row => (
              <tr key={row.id} className={TABLE_ROW}>
                <td className={`${TABLE_CELL} pl-4 text-zinc-400`}>{row.created_at?.slice(0, 10)}</td>
                <td className={`${TABLE_CELL} pr-3 font-medium text-zinc-200`}>
                  {row.vendor_name}
                  {row.photo_data && (
                    <span title={`${1 + (row.extra_photos?.length ?? 0)} photo(s)`}>
                      <Camera size={11} className="ml-1 inline text-violet-400" />
                      {(row.extra_photos?.length ?? 0) > 0 && (
                        <span className="ml-0.5 text-[10px] text-violet-400">{1 + (row.extra_photos?.length ?? 0)}</span>
                      )}
                    </span>
                  )}
                </td>
                <td className={`${TABLE_CELL} pr-3 text-zinc-400`}>{row.branch || "—"}</td>
                <td className={`${TABLE_CELL} text-zinc-400`}>{row.invoice_no}</td>
                <td className={`${TABLE_CELL} pl-3 text-right font-mono text-zinc-300`}>{fmtAmount(row.po_amount, currency)}</td>
                <td className={`${TABLE_CELL} pl-3 text-right font-mono text-zinc-300`}>{fmtAmount(row.invoice_amount, currency)}</td>
                <td className={`${TABLE_CELL} pl-3 text-right font-mono ${row.variance_amount !== 0 ? "text-amber-400" : "text-zinc-500"}`}>
                  {row.variance_amount === 0 ? "—" : (row.variance_amount > 0 ? "+" : "") + row.variance_amount.toFixed(2)}
                </td>
                <td className={`${TABLE_CELL} pr-4 text-center`}>
                  <MatchBadge status={row.match_status} variance={row.variance_amount} />
                  {row.match_status === "DISCREPANCY" && <PaymentStatusBadge row={row} />}
                </td>
                <td className={`${TABLE_CELL} pr-4 text-center`}>
                  <button
                    onClick={() => handleDelete(row.id, row.vendor_name)}
                    disabled={deleting === row.id}
                    title="Delete record"
                    className="text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-30"
                  >
                    {deleting === row.id ? "…" : <Trash2 size={14} />}
                  </button>
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
          <SelectDark
            className={SELECT_CLASS + " w-auto"}
            value={String(days)}
            onChange={v => setDays(Number(v))}
            options={[
              { value: "7", label: "Last 7 days" },
              { value: "30", label: "Last 30 days" },
              { value: "90", label: "Last 90 days" },
              { value: "180", label: "Last 6 months" },
            ]}
          />
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
  const [defaultVatRate, setDefaultVatRate] = useState("0");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch(`/procurement/po-match/settings?city=${city}`);
      const s = d.settings as MatchSettings;
      setSettings(s);
      setTolAed(String(s.tolerance_aed ?? 1.0));
      setTolPct(String(((s.tolerance_pct ?? 0.005) * 100).toFixed(2)));
      setDefaultVatRate(String(s.default_vat_rate ?? 0));
    } catch { /* keep defaults */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    const aed = parseFloat(tolAed || "1");
    const pct = parseFloat(tolPct || "0.5") / 100;
    const dvat = parseFloat(defaultVatRate || "0");
    if (isNaN(aed) || aed < 0) { setMsg({ text: `${currency} tolerance must be ≥ 0.`, ok: false }); return; }
    if (isNaN(pct) || pct < 0 || pct > 1) { setMsg({ text: "Percentage must be between 0% and 100%.", ok: false }); return; }
    if (isNaN(dvat) || dvat < 0 || dvat > 100) { setMsg({ text: "Default VAT rate must be between 0% and 100%.", ok: false }); return; }
    setSaving(true);
    setMsg(null);
    try {
      const d = await apiFetch("/procurement/po-match/settings", {
        method: "POST",
        body: JSON.stringify({ city, tolerance_aed: aed, tolerance_pct: pct, default_vat_rate: dvat }),
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

          <div className="sm:col-span-2">
            <label className={T_LABEL}>Default VAT Rate (%)</label>
            <p className={`${T_CAPTION} mt-0.5`}>Pre-fills the VAT rate field in Quick Entry for this city. Set to 0 to disable.</p>
            <div className="relative mt-2 max-w-xs">
              <input
                type="number" min="0" max="100" step="0.1"
                className={INPUT_CLASS}
                value={defaultVatRate}
                onChange={e => setDefaultVatRate(e.target.value)}
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
              <SelectDark
                className={SELECT_CLASS + " w-auto"}
                value={city}
                onChange={handleCityChange}
                options={[
                  { value: "dubai", label: "Dubai (AED)" },
                  { value: "manila", label: "Manila (PHP)" },
                ]}
              />
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
