"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp,
  XCircle,
} from "lucide-react";
import {
  BADGE_ERROR,
  BADGE_SUCCESS,
  BADGE_WARNING,
  GLASS_CARD,
  INPUT_CLASS,
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
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
  entered_by: string;
  notes: string;
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

const TODAY = new Date().toISOString().slice(0, 10);
const CITY = "dubai";

const DISCREPANCY_TYPES = [
  { value: "PRICE", label: "Price Error — unit price differs from PO" },
  { value: "QUANTITY", label: "Quantity Error — delivery count differs" },
  { value: "SHORTAGE", label: "Shortage — items not delivered" },
  { value: "OVERCHARGE", label: "Overcharge — billed more than agreed" },
  { value: "OTHER", label: "Other" },
];

function fmtAED(n: number | null | undefined) {
  if (n == null) return "—";
  return (
    "AED " +
    Math.abs(n).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
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

function ResolveBadge({ row }: { row: CheckRow }) {
  if (row.match_status !== "DISCREPANCY") return null;
  if (row.resolved_by)
    return <span className="ml-1 text-xs text-emerald-400">✓ Resolved</span>;
  return <span className="ml-1 text-xs text-amber-400">⚠ Pending</span>;
}

// ─── Tab 1: Quick Entry ───────────────────────────────────────────────────────

function QuickEntryTab({ onSaved }: { onSaved: () => void }) {
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
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [showPoList, setShowPoList] = useState(false);

  const searchPos = useCallback(async () => {
    if (!vendorQ.trim()) { setPoRows([]); return; }
    setPoLoading(true);
    try {
      const d = await apiFetch(`/procurement/po-match/pos?city=${CITY}&vendor_name=${encodeURIComponent(vendorQ)}&limit=20`);
      setPoRows(d.rows || []);
      setShowPoList(true);
    } catch { setPoRows([]); }
    finally { setPoLoading(false); }
  }, [vendorQ]);

  const selectPo = (po: PoRow) => {
    setSelectedPo(po);
    setVendorQ(po.vendor_name);
    setManualPoNo(po.po_no);
    setManualPoAmount(String(po.po_amount));
    setPoDate(po.po_date?.slice(0, 10) || TODAY);
    setShowPoList(false);
  };

  const poAmount = selectedPo ? selectedPo.po_amount : parseFloat(manualPoAmount || "0");
  const invAmount = parseFloat(invoiceAmount || "0");
  const variance = invAmount - poAmount;
  const isMatch = poAmount > 0 && Math.abs(variance) <= Math.max(1.0, poAmount * 0.005);

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
          city: CITY,
          vendor_name: vendorQ.trim(),
          po_no: manualPoNo.trim(),
          po_date: poDate,
          po_amount: poAmount,
          invoice_no: invoiceNo.trim(),
          invoice_date: invoiceDate,
          invoice_amount: invAmount,
          currency: "AED",
          notes: notes.trim(),
        }),
      });
      const matchMsg = isMatch
        ? "✅ Matched — no further action needed."
        : `⚠️ Discrepancy detected (${variance > 0 ? "+" : ""}${variance.toFixed(2)} AED). Added to review queue.`;
      setMsg({ text: matchMsg, ok: isMatch });
      setVendorQ(""); setSelectedPo(null); setManualPoNo(""); setManualPoAmount("");
      setInvoiceNo(""); setInvoiceAmount(""); setNotes(""); setPoDate(TODAY); setInvoiceDate(TODAY);
      setPoRows([]);
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
          Enter the PO amount and the invoice amount received from the supplier. If they match,
          the record is closed automatically — no further review needed.
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
                onChange={e => { setVendorQ(e.target.value); setSelectedPo(null); }}
                onKeyDown={e => e.key === "Enter" && searchPos()}
              />
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-zinc-400 hover:text-white"
                onClick={searchPos}
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
                      <span className="text-zinc-200">{po.vendor_name}</span>
                      <span className="ml-2 text-right text-zinc-400">
                        {po.po_no} · {fmtAED(po.po_amount)} · {po.po_date?.slice(0, 10)}
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
                  No POs found — you can enter PO details manually below.
                </div>
              )}
            </div>
          </div>

          {/* PO No */}
          <div>
            <label className={T_LABEL}>PO Number</label>
            <input
              className={`mt-1.5 ${INPUT_CLASS}`}
              placeholder="e.g. DXB-PO-2026-0042"
              value={manualPoNo}
              onChange={e => setManualPoNo(e.target.value)}
            />
          </div>

          {/* PO Date */}
          <div>
            <label className={T_LABEL}>PO Date *</label>
            <input type="date" className={`mt-1.5 ${INPUT_CLASS}`} value={poDate} onChange={e => setPoDate(e.target.value)} />
          </div>

          {/* PO Amount */}
          <div>
            <label className={T_LABEL}>PO Amount (AED) *</label>
            <input
              type="number"
              min="0"
              step="0.01"
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
            <label className={T_LABEL}>Invoice Amount (AED) *</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className={`mt-1.5 ${INPUT_CLASS}`}
              placeholder="0.00"
              value={invoiceAmount}
              onChange={e => setInvoiceAmount(e.target.value)}
            />
          </div>
        </div>

        {/* Live preview */}
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
                  PO: {fmtAED(poAmount)} · Invoice: {fmtAED(invAmount)} · Variance: {variance > 0 ? "+" : ""}{variance.toFixed(2)} AED
                </p>
              </div>
            </div>
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
  const [rows, setRows] = useState<CheckRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolveType, setResolveType] = useState("OTHER");
  const [resolveNote, setResolveNote] = useState("");
  const [resolving, setResolving] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch(`/procurement/po-match?city=${CITY}&match_status=DISCREPANCY&limit=200`);
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

  const DiscrepancyList = ({ items, title }: { items: CheckRow[]; title: string }) => (
    <div className="space-y-2">
      {items.length === 0 && (
        <p className="py-4 text-center text-sm text-zinc-500">{title === "Unresolved" ? "No pending discrepancies. 🎉" : "None yet."}</p>
      )}
      {items.map(row => (
        <div key={row.id} className={`${GLASS_CARD} overflow-hidden`}>
          <button
            className="flex w-full items-center justify-between p-4 text-left"
            onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold text-white">{row.vendor_name}</span>
              <span className={T_CAPTION}>{row.invoice_no}</span>
              <MatchBadge status={row.match_status} variance={row.variance_amount} />
              <ResolveBadge row={row} />
            </div>
            <div className="flex items-center gap-3 text-right">
              <span className={`${T_CAPTION} hidden sm:block`}>{row.created_at?.slice(0, 10)}</span>
              {expandedId === row.id ? <ChevronUp size={16} className="text-zinc-400" /> : <ChevronDown size={16} className="text-zinc-400" />}
            </div>
          </button>

          {expandedId === row.id && (
            <div className="border-t border-white/5 px-4 pb-4 pt-3">
              <div className="grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <p className={T_LABEL}>PO Amount</p>
                  <p className="mt-0.5 text-zinc-200">{fmtAED(row.po_amount)}</p>
                </div>
                <div>
                  <p className={T_LABEL}>Invoice Amount</p>
                  <p className="mt-0.5 text-zinc-200">{fmtAED(row.invoice_amount)}</p>
                </div>
                <div>
                  <p className={T_LABEL}>Variance</p>
                  <p className={`mt-0.5 font-semibold ${row.variance_amount > 0 ? "text-red-400" : "text-amber-400"}`}>
                    {row.variance_amount > 0 ? "+" : ""}{row.variance_amount.toFixed(2)} AED
                  </p>
                </div>
                <div>
                  <p className={T_LABEL}>PO No.</p>
                  <p className="mt-0.5 text-zinc-300">{row.po_no || "—"}</p>
                </div>
                <div>
                  <p className={T_LABEL}>PO Date</p>
                  <p className="mt-0.5 text-zinc-300">{row.po_date?.slice(0, 10) || "—"}</p>
                </div>
                <div>
                  <p className={T_LABEL}>Invoice Date</p>
                  <p className="mt-0.5 text-zinc-300">{row.invoice_date?.slice(0, 10) || "—"}</p>
                </div>
                {row.notes && (
                  <div className="sm:col-span-3">
                    <p className={T_LABEL}>Notes</p>
                    <p className="mt-0.5 text-zinc-300">{row.notes}</p>
                  </div>
                )}
              </div>

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
        city: CITY,
        date_from: dateFrom,
        date_to: dateTo,
        ...(vendorFilter ? { vendor_name: vendorFilter } : {}),
        limit: "500",
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
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>Total Checks</p>
          <p className="mt-1 text-2xl font-bold text-white">{rows.length}</p>
        </div>
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>Match Rate</p>
          <p className={`mt-1 text-2xl font-bold ${matchRate >= 90 ? "text-emerald-400" : matchRate >= 70 ? "text-amber-400" : "text-red-400"}`}>
            {matchRate}%
          </p>
        </div>
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>Discrepancies</p>
          <p className={`mt-1 text-2xl font-bold ${discrepancy === 0 ? "text-emerald-400" : "text-amber-400"}`}>{discrepancy}</p>
        </div>
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
              <tr>
                <td colSpan={7} className="py-8 text-center text-sm text-zinc-500">
                  {loading ? "Loading…" : "No records found."}
                </td>
              </tr>
            )}
            {rows.map(row => (
              <tr key={row.id} className={TABLE_ROW}>
                <td className={`${TABLE_CELL} pl-4 text-zinc-400`}>{row.created_at?.slice(0, 10)}</td>
                <td className={`${TABLE_CELL} font-medium text-zinc-200`}>{row.vendor_name}</td>
                <td className={`${TABLE_CELL} text-zinc-400`}>{row.invoice_no}</td>
                <td className={`${TABLE_CELL} text-right font-mono text-zinc-300`}>{fmtAED(row.po_amount)}</td>
                <td className={`${TABLE_CELL} text-right font-mono text-zinc-300`}>{fmtAED(row.invoice_amount)}</td>
                <td className={`${TABLE_CELL} text-right font-mono ${row.variance_amount !== 0 ? "text-amber-400" : "text-zinc-500"}`}>
                  {row.variance_amount === 0 ? "—" : (row.variance_amount > 0 ? "+" : "") + row.variance_amount.toFixed(2)}
                </td>
                <td className={`${TABLE_CELL} pr-4 text-center`}>
                  <MatchBadge status={row.match_status} variance={row.variance_amount} />
                  {row.match_status === "DISCREPANCY" && <ResolveBadge row={row} />}
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
  const [rows, setRows] = useState<SupplierStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch(`/procurement/po-match/supplier-stats?city=${CITY}&days=${days}`);
      setRows(d.rows || []);
    } catch { setRows([]); }
    finally { setLoading(false); }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const getRatingColor = (rate: number) => {
    if (rate === 0) return "text-emerald-400";
    if (rate <= 10) return "text-amber-400";
    return "text-red-400";
  };

  const getRatingLabel = (rate: number) => {
    if (rate === 0) return "Perfect";
    if (rate <= 5) return "Good";
    if (rate <= 15) return "Fair";
    return "Poor";
  };

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
          <button className={SMALL_BUTTON} onClick={load} disabled={loading}>
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
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
                  <span className={`text-lg font-bold ${getRatingColor(Number(stat.discrepancy_rate_pct || 0))}`}>
                    {getRatingLabel(Number(stat.discrepancy_rate_pct || 0))}
                  </span>
                  <span className={`text-sm ${getRatingColor(Number(stat.discrepancy_rate_pct || 0))}`}>
                    ({stat.discrepancy_rate_pct ?? 0}% error rate)
                  </span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className={KPI_CARD + " !p-3"}>
                  <p className={KPI_LABEL}>Matched</p>
                  <p className="mt-0.5 text-xl font-bold text-emerald-400">{stat.matched_count}</p>
                </div>
                <div className={KPI_CARD + " !p-3"}>
                  <p className={KPI_LABEL}>Discrepancies</p>
                  <p className={`mt-0.5 text-xl font-bold ${stat.discrepancy_count > 0 ? "text-red-400" : "text-zinc-400"}`}>
                    {stat.discrepancy_count}
                  </p>
                </div>
                <div className={KPI_CARD + " !p-3"}>
                  <p className={KPI_LABEL}>Unresolved</p>
                  <p className={`mt-0.5 text-xl font-bold ${stat.unresolved_count > 0 ? "text-amber-400" : "text-zinc-400"}`}>
                    {stat.unresolved_count}
                  </p>
                </div>
                <div className={KPI_CARD + " !p-3"}>
                  <p className={KPI_LABEL}>Total Variance</p>
                  <p className={`mt-0.5 text-base font-bold ${Number(stat.total_variance_abs) > 0 ? "text-red-400" : "text-zinc-400"}`}>
                    {fmtAED(stat.total_variance_abs)}
                  </p>
                </div>
              </div>

              {/* Bar indicator */}
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

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = "entry" | "queue" | "records" | "scorecard";

export default function PoMatchPage() {
  const [tab, setTab] = useState<Tab>("entry");
  const [discrepancyCount, setDiscrepancyCount] = useState(0);

  const refreshBadge = useCallback(async () => {
    try {
      const d = await apiFetch(`/procurement/po-match?city=${CITY}&match_status=DISCREPANCY&limit=500`);
      const unresolved = (d.rows || []).filter((r: CheckRow) => !r.resolved_by).length;
      setDiscrepancyCount(unresolved);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { refreshBadge(); }, [refreshBadge]);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "entry", label: "Quick Entry", icon: <ClipboardList size={15} /> },
    {
      id: "queue",
      label: discrepancyCount > 0 ? `Discrepancy Queue (${discrepancyCount})` : "Discrepancy Queue",
      icon: <AlertTriangle size={15} />,
    },
    { id: "records", label: "All Records", icon: <ShieldCheck size={15} /> },
    { id: "scorecard", label: "Supplier Scorecard", icon: <TrendingUp size={15} /> },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className={T_PAGE_TITLE}>PO — Invoice Match</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Enter daily supplier invoices. Matching amounts close automatically. Discrepancies go to review queue.
          </p>
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

        {tab === "entry" && <QuickEntryTab onSaved={refreshBadge} />}
        {tab === "queue" && <DiscrepancyQueueTab />}
        {tab === "records" && <AllRecordsTab />}
        {tab === "scorecard" && <SupplierScorecardTab />}
      </div>
    </div>
  );
}
