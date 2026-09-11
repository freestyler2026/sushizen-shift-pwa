"use client";

import {
  AlertCircle, AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Download,
  Minus, RefreshCw, TrendingDown, TrendingUp, TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementTokenHeaders } from "@/lib/procurementClient";
import DatePicker from "@/components/DatePicker";
import SelectDark from "@/components/SelectDark";

// ─────────────────────────────────────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────────────────────────────────────

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getPresetRange(key: string): { from: string; to: string } {
  const today = new Date();
  const to = toIso(today);
  if (key === "today") return { from: to, to };
  if (key === "week") {
    const d = new Date(today);
    d.setDate(d.getDate() - 6);
    return { from: toIso(d), to };
  }
  if (key === "month") {
    const d = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: toIso(d), to };
  }
  if (key === "last_month") {
    const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const e = new Date(today.getFullYear(), today.getMonth(), 0);
    return { from: toIso(s), to: toIso(e) };
  }
  if (key === "90d") {
    const d = new Date(today);
    d.setDate(d.getDate() - 89);
    return { from: toIso(d), to };
  }
  // default: last 30 days
  const d = new Date(today);
  d.setDate(d.getDate() - 29);
  return { from: toIso(d), to };
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type PoVarianceRow = {
  po_number: string;
  item_description: string;
  po_vendor: string;
  invoice_supplier: string;
  invoice_no: string;
  invoice_date: string;
  po_date: string;
  po_unit_price: number;
  invoice_unit_price: number;
  po_unit: string;
  invoice_unit: string;
  po_qty: number;
  invoice_qty: number;
  currency: string;
  branch: string;
  price_delta: number;
  pct_delta: number;
  total_impact: number;
  unit_mismatch: boolean;
};

type PoVarianceResult = {
  market: string;
  min_pct: number;
  total_variances: number;
  over_charged_count: number;
  under_charged_count: number;
  total_overcharge_amount: number;
  total_undercharge_amount: number;
  unit_mismatch_count: number;
  unlinked_lines: number;
  total_invoice_lines: number;
  /** The newest invoice this market holds, and how many days back that is.
      An empty table means nothing without it. */
  newest_invoice_date?: string;
  days_behind?: number | null;
  currency: string;
  rows: PoVarianceRow[];
};

type PriceChangeRow = {
  market: string;
  item_description: string;
  supplier_name: string;
  data_points: number;
  first_date: string;
  latest_date: string;
  first_price: number;
  latest_price: number;
  max_price: number;
  min_price: number;
  currency: string;
  unit: string;
  latest_invoice_no: string;
  price_delta: number;
  pct_change: number;
};

type PriceChangeResult = {
  market: string;
  min_pct: number;
  total_items: number;
  increased_count: number;
  decreased_count: number;
  rows: PriceChangeRow[];
};

type DetailRow = {
  invoice_date: string;
  unit_price: number;
  prev_unit_price: number | null;
  pct_change: number | null;
  currency: string;
  invoice_no: string;
};

// Sort key for PO variance table
type SortKey = "total_impact" | "pct_delta" | "item" | "supplier" | "invoice_date";

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null || isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function pctClass(pct: number): string {
  if (pct > 5) return "text-rose-300";
  if (pct > 0) return "text-amber-300";
  if (pct < -5) return "text-emerald-400";
  if (pct < 0) return "text-teal-400";
  return "text-zinc-400";
}

function PctBadge({ pct }: { pct: number }) {
  const sign = pct > 0 ? "+" : "";
  const cls = pct > 5
    ? "border-rose-700/40 bg-rose-900/25 text-rose-200"
    : pct > 0
    ? "border-amber-700/40 bg-amber-900/20 text-amber-200"
    : pct < -5
    ? "border-emerald-700/40 bg-emerald-900/20 text-emerald-300"
    : pct < 0
    ? "border-teal-700/40 bg-teal-900/15 text-teal-300"
    : "border-white/8/40 bg-white/6 text-zinc-400";
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${cls}`}>
      {pct > 0 ? <ArrowUp className="h-3 w-3" /> : pct < 0 ? <ArrowDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      {sign}{fmt(Math.abs(pct), 1)}%
    </span>
  );
}

function KpiCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string;
  accent?: "rose" | "emerald" | "amber" | "neutral" | "orange";
}) {
  const borderCls = accent === "rose" ? "border-rose-800/40"
    : accent === "emerald" ? "border-emerald-800/40"
    : accent === "amber" ? "border-amber-800/40"
    : accent === "orange" ? "border-orange-800/40"
    : "border-white/10";
  const valueCls = accent === "rose" ? "text-rose-200"
    : accent === "emerald" ? "text-emerald-300"
    : accent === "amber" ? "text-amber-200"
    : accent === "orange" ? "text-orange-300"
    : "text-white";
  return (
    <div className={`rounded-2xl border ${borderCls} bg-white/5 p-4`}>
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${valueCls}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

// Quick date preset bar
function DatePresets({ onSelect }: { onSelect: (from: string, to: string) => void }) {
  const presets = [
    { key: "today", label: "Today" },
    { key: "week", label: "This Week" },
    { key: "month", label: "This Month" },
    { key: "last_month", label: "Last Month" },
    { key: "30d", label: "Last 30d" },
    { key: "90d", label: "Last 90d" },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {presets.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => { const r = getPresetRange(p.key); onSelect(r.from, r.to); }}
          className="rounded-lg border border-white/8 bg-white/6 px-2.5 py-1 text-xs text-zinc-300 hover:border-violet-600/50 hover:bg-violet-900/20 hover:text-violet-200 transition"
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

// CSV export helper
function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const lines = [headers.join(","), ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// Column sort helper
function SortHeader({
  label, sortKey, current, dir, onClick,
}: {
  label: string; sortKey: SortKey; current: SortKey; dir: "asc" | "desc";
  onClick: (k: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <th
      className="px-3 py-2 cursor-pointer select-none hover:text-violet-300 transition"
      onClick={() => onClick(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active
          ? (dir === "asc" ? <ArrowUp className="h-3 w-3 text-violet-400" /> : <ArrowDown className="h-3 w-3 text-violet-400" />)
          : <ArrowUpDown className="h-3 w-3 text-zinc-600" />}
      </span>
    </th>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab ①: PO Variance (fully improved)
// ─────────────────────────────────────────────────────────────────────────────

function PoVarianceTab({
  city, requestedBy, pin,
}: {
  city: "dubai" | "manila"; requestedBy: string; pin: string;
}) {
  const defaultRange = getPresetRange("30d");
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);
  const [supplier, setSupplier] = useState("");
  const [itemDesc, setItemDesc] = useState("");
  const [minPct, setMinPct] = useState(1);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PoVarianceResult | null>(null);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total_impact");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [hideUnitMismatch, setHideUnitMismatch] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const headers = await procurementTokenHeaders(requestedBy, pin);
      const qs = new URLSearchParams({ market: city, min_pct: String(minPct), limit: "300" });
      if (dateFrom) qs.set("date_from", dateFrom);
      if (dateTo) qs.set("date_to", dateTo);
      if (supplier.trim()) qs.set("supplier_name", supplier.trim());
      if (itemDesc.trim()) qs.set("item_description", itemDesc.trim());
      const res = await fetch(`/api/admin/procurement/price-checks/po-variance?${qs.toString()}`, {
        cache: "no-store", headers,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail || String(res.status));
      setResult(json);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [city, dateFrom, dateTo, supplier, itemDesc, minPct, requestedBy, pin]);

  // Auto-load on mount
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function applyPreset(from: string, to: string) {
    setDateFrom(from);
    setDateTo(to);
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const currency = result?.currency || "AED";

  const filteredRows = useMemo(() => {
    const allRows = result?.rows ?? [];
    const r = hideUnitMismatch ? allRows.filter((x) => !x.unit_mismatch) : allRows;
    return [...r].sort((a, b) => {
      let av = 0, bv = 0;
      if (sortKey === "total_impact") { av = Math.abs(a.total_impact); bv = Math.abs(b.total_impact); }
      else if (sortKey === "pct_delta") { av = Math.abs(a.pct_delta); bv = Math.abs(b.pct_delta); }
      else if (sortKey === "item") return sortDir === "asc"
        ? a.item_description.localeCompare(b.item_description)
        : b.item_description.localeCompare(a.item_description);
      else if (sortKey === "supplier") return sortDir === "asc"
        ? (a.invoice_supplier || "").localeCompare(b.invoice_supplier || "")
        : (b.invoice_supplier || "").localeCompare(a.invoice_supplier || "");
      else if (sortKey === "invoice_date") return sortDir === "asc"
        ? a.invoice_date.localeCompare(b.invoice_date)
        : b.invoice_date.localeCompare(a.invoice_date);
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [result, sortKey, sortDir, hideUnitMismatch]);

  function handleExport() {
    const headers = ["Item", "Supplier", "PO No", "Invoice No", "Invoice Date", "PO Unit Price", "Invoice Unit Price", "PO Unit", "Invoice Unit", "Qty", "Price Delta", "% Delta", "Total Impact", "Currency", "Branch", "Unit Mismatch"];
    const rowData = filteredRows.map((r) => [
      r.item_description, r.invoice_supplier || r.po_vendor, r.po_number,
      r.invoice_no, r.invoice_date,
      String(r.po_unit_price), String(r.invoice_unit_price),
      r.po_unit, r.invoice_unit,
      String(r.invoice_qty),
      String(r.price_delta), String(r.pct_delta), String(r.total_impact),
      r.currency, r.branch,
      r.unit_mismatch ? "YES" : "no",
    ]);
    downloadCsv(`po-variance-${dateFrom}-${dateTo}.csv`, headers, rowData);
  }

  const netExposure = (result?.total_overcharge_amount ?? 0) - (result?.total_undercharge_amount ?? 0);
  const unlinkedPct = result && result.total_invoice_lines > 0
    ? Math.round((result.unlinked_lines / result.total_invoice_lines) * 100)
    : null;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
        <div>
          <div className="mb-2 text-xs text-zinc-500 font-medium">Quick range</div>
          <DatePresets onSelect={applyPreset} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">From</div>
            <DatePicker value={dateFrom} onChange={setDateFrom} />
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">To</div>
            <DatePicker value={dateTo} onChange={setDateTo} />
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">Supplier</div>
            <input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="All suppliers"
              className="w-full rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white outline-none focus:border-violet-500/50"
            />
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">Item</div>
            <input
              value={itemDesc}
              onChange={(e) => setItemDesc(e.target.value)}
              placeholder="All items"
              className="w-full rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white outline-none focus:border-violet-500/50"
            />
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">Min Variance %</div>
            <input
              type="number" min={0} max={100} step={0.5}
              value={minPct}
              onChange={(e) => setMinPct(Math.max(0, Number(e.target.value || 0)))}
              className="w-full rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white outline-none focus:border-violet-500/50"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => void load()} disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl border border-violet-700/50 bg-violet-900/20 px-4 py-2 text-sm text-violet-200 hover:bg-violet-800/30 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
            {busy ? "Loading…" : "Refresh"}
          </button>
          {result && (
            <>
              <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hideUnitMismatch}
                  onChange={(e) => setHideUnitMismatch(e.target.checked)}
                  className="accent-violet-500"
                />
                Hide unit-mismatch rows
              </label>
              <button
                onClick={handleExport}
                className="ml-auto inline-flex items-center gap-2 rounded-xl border border-white/8 bg-white/6 px-3 py-2 text-xs text-zinc-300 hover:border-violet-600/50 hover:text-violet-200 transition"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </button>
            </>
          )}
        </div>
        {error && <div className="rounded-xl border border-rose-800/40 bg-rose-900/20 px-4 py-3 text-sm text-rose-300">{error}</div>}
      </section>

      {/* Unlinked invoice diagnostic */}
      {/* How current the data is. Dubai's newest invoice was 104 days old while
          the sheet was being typed into every day — an empty screen read as
          "no price problems" instead of "nothing recent has been entered". */}
      {/* Where the numbers come from. This screen and the Management Inbox
          alert used to read different tables, so a page showing nothing sat
          beside unread price alerts about the same invoices. */}
      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 mb-4">
        <div className="text-xs text-zinc-400">
          From the <strong className="text-zinc-200">PO / invoice check entered at receiving</strong> —
          the PO price and the invoiced price read off the same document by the person
          checking the delivery. These are the same rows the Management Inbox price
          alerts are raised from, so the two always agree.
        </div>
      </div>

      {result && Number(result.days_behind ?? 0) > 30 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 mb-4">
          <div className="text-sm text-amber-200 font-medium">
            The newest invoice in {city === "dubai" ? "Dubai" : "Manila"} is dated{" "}
            {result.newest_invoice_date} — {Number(result.days_behind)} days ago.
          </div>
          <div className="text-xs text-amber-200/70 mt-1">
            Everything below covers up to that date only. The import runs daily and is
            working; what it imports is what has been entered in the supplier invoice
            sheet, and nothing newer has been.
          </div>
        </div>
      )}

      {result && result.unlinked_lines > 0 && (
        <div className="rounded-2xl border border-amber-800/30 bg-amber-950/15 px-5 py-3.5 flex items-start gap-3">
          <TriangleAlert className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <span className="font-semibold text-amber-300">
              {result.unlinked_lines.toLocaleString()} of {result.total_invoice_lines.toLocaleString()} invoice lines ({unlinkedPct}%) have no PO number linked.
            </span>
            <span className="ml-1 text-amber-500/80">
              These cannot be matched to a PO and are excluded from the variance table below. Link PO numbers when creating invoices to improve coverage.
            </span>
          </div>
        </div>
      )}

      {/* Unit mismatch warning */}
      {result && (result.unit_mismatch_count ?? 0) > 0 && !hideUnitMismatch && (
        <div className="rounded-2xl border border-orange-800/30 bg-orange-950/15 px-5 py-3 flex items-center gap-3">
          <TriangleAlert className="h-4 w-4 text-orange-400 shrink-0" />
          <span className="text-sm text-orange-300">
            <span className="font-semibold">{result.unit_mismatch_count} rows</span> have mismatched units (e.g. PO in <em>kg</em>, Invoice in <em>g</em>).
            These may show inflated variances. Use &ldquo;Hide unit-mismatch rows&rdquo; to focus on genuine price differences.
          </span>
        </div>
      )}

      {/* KPI summary */}
      {result && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Variance Lines" value={String(filteredRows.length)} sub={`≥ ${minPct}% threshold`} accent="neutral" />
          <KpiCard label="Overcharged" value={String(result.over_charged_count)} sub={`${currency} ${fmt(result.total_overcharge_amount)}`} accent="rose" />
          <KpiCard label="Undercharged" value={String(result.under_charged_count)} sub={`${currency} ${fmt(result.total_undercharge_amount)}`} accent="emerald" />
          <KpiCard
            label="Net Exposure"
            value={`${currency} ${fmt(Math.abs(netExposure))}`}
            sub={netExposure > 0 ? "you paid more than PO" : netExposure < 0 ? "you paid less than PO" : "balanced"}
            accent={netExposure > 500 ? "rose" : netExposure < -500 ? "emerald" : "neutral"}
          />
        </div>
      )}

      {/* Empty state.
          "No variances found" reads as "the prices matched", and for a table
          where every single line is missing a PO number it is the opposite of
          what happened: the comparison never ran. Both cities were in that
          state — 8,078 invoice lines, not one with a PO number — and the
          screen offered "try lowering the Min Variance %", which cannot help. */}
      {result && filteredRows.length === 0 && !busy && (() => {
        // Read as numbers before anything is formatted: a response that is
        // older or partial has these undefined, and .toLocaleString() then
        // throws during render — which turns an empty table into a blank page.
        const totalLines = Number(result.total_invoice_lines ?? 0);
        const unlinked = Number(result.unlinked_lines ?? 0);
        return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center space-y-2">
          {totalLines === 0 ? (
            <>
              <div className="text-sm text-zinc-400 font-medium">No invoice lines in this period</div>
              <div className="text-xs text-zinc-600 max-w-md mx-auto">
                Nothing has been imported for these dates, so there is nothing to compare.
                Check Supplier Hub for the last successful invoice import.
              </div>
            </>
          ) : unlinked >= totalLines ? (
            <>
              <div className="text-sm text-amber-300 font-medium">
                This comparison could not run
              </div>
              <div className="text-xs text-zinc-500 max-w-lg mx-auto">
                Every one of the {totalLines.toLocaleString()} invoice lines in
                this period is missing a PO number, and the comparison needs one on each line.
                <strong className="text-zinc-300"> This is not a result — nothing was checked.</strong>
              </div>
              <div className="text-xs text-zinc-600 max-w-lg mx-auto pt-1">
                The supplier invoice workbook has no PO column. The link is taken from the
                PO/invoice check entered at receiving, which carries both numbers — so a line
                gets its PO number once that check exists for the same invoice number.
                Lowering the Min Variance % will not change this.
              </div>
            </>
          ) : (
            <>
              <div className="text-sm text-zinc-400 font-medium">No variances found for this period</div>
              <div className="text-xs text-zinc-600 max-w-md mx-auto">
                Of {totalLines.toLocaleString()} invoice lines,{" "}
                {(totalLines - unlinked).toLocaleString()} could be
                compared against a PO and none differed by more than {minPct}%.
                {unlinked > 0 ? ` The other ${unlinked.toLocaleString()} have no PO number and were not checked.` : ""}
              </div>
            </>
          )}
        </div>
        );
      })()}

      {/* Table */}
      {filteredRows.length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="text-sm font-semibold text-zinc-200">
              Variance Details — {filteredRows.length} line{filteredRows.length !== 1 ? "s" : ""}
            </div>
            <div className="text-xs text-zinc-500">Click column headers to sort</div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-zinc-500">
                  <SortHeader label="Item" sortKey="item" current={sortKey} dir={sortDir} onClick={handleSort} />
                  <SortHeader label="Supplier" sortKey="supplier" current={sortKey} dir={sortDir} onClick={handleSort} />
                  <th className="px-3 py-2">PO No</th>
                  <th className="px-3 py-2">Invoice No</th>
                  <SortHeader label="Date" sortKey="invoice_date" current={sortKey} dir={sortDir} onClick={handleSort} />
                  <th className="px-3 py-2 text-right">PO Price</th>
                  <th className="px-3 py-2 text-right">Inv Price</th>
                  <SortHeader label="% Diff" sortKey="pct_delta" current={sortKey} dir={sortDir} onClick={handleSort} />
                  <th className="px-3 py-2 text-right">Qty</th>
                  <SortHeader label="Total Impact" sortKey="total_impact" current={sortKey} dir={sortDir} onClick={handleSort} />
                  <th className="px-3 py-2">Branch</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r, i) => {
                  const isOver = r.pct_delta > 0;
                  const rowBg = r.unit_mismatch
                    ? "bg-orange-950/10"
                    : isOver ? "bg-rose-950/10" : "bg-emerald-950/10";
                  return (
                    <tr key={i} className={`border-t border-white/8 ${rowBg}`}>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-white">{r.item_description || "—"}</span>
                          {r.unit_mismatch && (
                            <span title={`Unit mismatch: PO=${r.po_unit}, Invoice=${r.invoice_unit}`}
                              className="inline-flex items-center gap-0.5 rounded border border-orange-700/40 bg-orange-900/20 px-1.5 py-0.5 text-[9px] font-bold text-orange-300">
                              <TriangleAlert className="h-2.5 w-2.5" />
                              UNIT
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-zinc-300">{r.invoice_supplier || r.po_vendor || "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-zinc-400 font-mono">{r.po_number || "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-zinc-400 font-mono">{r.invoice_no || "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-zinc-400">{r.invoice_date || "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-zinc-400">
                        {fmt(r.po_unit_price)}
                        {r.po_unit ? <span className="ml-0.5 text-zinc-600 text-[10px]">/{r.po_unit}</span> : null}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-white">
                        {fmt(r.invoice_unit_price)}
                        {r.invoice_unit ? <span className="ml-0.5 text-zinc-500 text-[10px]">/{r.invoice_unit}</span> : null}
                      </td>
                      <td className="px-3 py-2.5">
                        <PctBadge pct={r.pct_delta} />
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-zinc-400">{fmt(r.invoice_qty, 0)}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${pctClass(r.pct_delta)}`}>
                        {r.total_impact > 0 ? "+" : ""}{r.currency} {fmt(Math.abs(r.total_impact))}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-zinc-500">{r.branch || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Footer totals */}
              <tfoot>
                <tr className="border-t-2 border-white/8">
                  <td colSpan={9} className="px-3 py-2.5 text-xs text-zinc-500">Total</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-bold text-zinc-200">
                    {currency} {fmt(Math.abs(netExposure))}
                    <span className={`ml-1 text-xs ${netExposure > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                      {netExposure > 0 ? "over" : "under"}
                    </span>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="mt-3 border-t border-white/10 pt-3 text-xs text-zinc-600">
            Rows sorted by <strong className="text-zinc-400">Total Impact</strong> (price delta × invoice qty).
            Overcharged = invoice price &gt; PO price. Undercharged = invoice price &lt; PO price.
          </div>
        </section>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab ②: Item Price Change History (improved)
// ─────────────────────────────────────────────────────────────────────────────

function PriceChangeTab({
  city, requestedBy, pin,
}: {
  city: "dubai" | "manila"; requestedBy: string; pin: string;
}) {
  const defaultRange = getPresetRange("30d");
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);
  const [supplier, setSupplier] = useState("");
  const [minPct, setMinPct] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PriceChangeResult | null>(null);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, DetailRow[]>>({});

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const headers = await procurementTokenHeaders(requestedBy, pin);
      const qs = new URLSearchParams({ market: city, min_pct: String(minPct), limit: "300" });
      if (dateFrom) qs.set("date_from", dateFrom);
      if (dateTo) qs.set("date_to", dateTo);
      if (supplier.trim()) qs.set("supplier_name", supplier.trim());
      const res = await fetch(`/api/admin/procurement/price-checks/item-price-changes?${qs.toString()}`, {
        cache: "no-store", headers,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail || String(res.status));
      setResult(json); setSearched(true);
      setExpandedKey(null); setDetailCache({});
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [city, dateFrom, dateTo, supplier, minPct, requestedBy, pin]);

  // Auto-load on mount
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadDetail = useCallback(async (item: string, supplierName: string) => {
    const key = `${item}|||${supplierName}`;
    if (expandedKey === key) { setExpandedKey(null); return; }
    setExpandedKey(key);
    if (detailCache[key]) return;
    try {
      const headers = await procurementTokenHeaders(requestedBy, pin);
      const qs = new URLSearchParams({ market: city, item_description: item, supplier_name: supplierName, limit: "60" });
      if (dateFrom) qs.set("date_from", dateFrom);
      if (dateTo) qs.set("date_to", dateTo);
      const res = await fetch(`/api/admin/procurement/analytics/supplier-invoices/item-history?${qs.toString()}`, {
        cache: "no-store", headers,
      });
      const json = await res.json();
      setDetailCache((prev) => ({ ...prev, [key]: (json?.rows || []) as DetailRow[] }));
    } catch {
      setDetailCache((prev) => ({ ...prev, [key]: [] }));
    }
  }, [expandedKey, detailCache, city, dateFrom, dateTo, requestedBy, pin]);

  function handleExport() {
    if (!result) return;
    const headers = ["Item", "Supplier", "First Date", "Latest Date", "First Price", "Latest Price", "Min Price", "Max Price", "% Change", "Currency", "Unit", "Data Points"];
    const rowData = result.rows.map((r) => [
      r.item_description, r.supplier_name, r.first_date, r.latest_date,
      String(r.first_price), String(r.latest_price), String(r.min_price), String(r.max_price),
      String(r.pct_change), r.currency, r.unit, String(r.data_points),
    ]);
    downloadCsv(`price-changes-${dateFrom}-${dateTo}.csv`, headers, rowData);
  }

  const rows = result?.rows || [];

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
        <div>
          <div className="mb-2 text-xs text-zinc-500 font-medium">Quick range</div>
          <DatePresets onSelect={(f, t) => { setDateFrom(f); setDateTo(t); }} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">From</div>
            <DatePicker value={dateFrom} onChange={setDateFrom} />
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">To</div>
            <DatePicker value={dateTo} onChange={setDateTo} />
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">Supplier</div>
            <input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="All suppliers"
              className="w-full rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white outline-none focus:border-violet-500/50"
            />
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">Min Change %</div>
            <input
              type="number" min={0} max={100} step={0.5}
              value={minPct}
              onChange={(e) => setMinPct(Math.max(0, Number(e.target.value || 0)))}
              className="w-full rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white outline-none focus:border-violet-500/50"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => void load()} disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl border border-violet-700/50 bg-violet-900/20 px-4 py-2 text-sm text-violet-200 hover:bg-violet-800/30 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
            {busy ? "Loading…" : "Refresh"}
          </button>
          {result && rows.length > 0 && (
            <button
              onClick={handleExport}
              className="ml-auto inline-flex items-center gap-2 rounded-xl border border-white/8 bg-white/6 px-3 py-2 text-xs text-zinc-300 hover:border-violet-600/50 hover:text-violet-200 transition"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          )}
        </div>
        {error && <div className="rounded-xl border border-rose-800/40 bg-rose-900/20 px-4 py-3 text-sm text-rose-300">{error}</div>}
      </section>

      {result && (
        <div className="grid grid-cols-3 gap-3">
          <KpiCard label="Items with Change" value={String(result.total_items)} accent="neutral" />
          <KpiCard label="Price Increased" value={String(result.increased_count)} sub="vs first invoice in period" accent="rose" />
          <KpiCard label="Price Decreased" value={String(result.decreased_count)} sub="vs first invoice in period" accent="emerald" />
        </div>
      )}

      {searched && rows.length === 0 && !busy && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center space-y-2">
          <div className="text-sm text-zinc-400 font-medium">No price changes found</div>
          <div className="text-xs text-zinc-600">
            All items have stable prices in this period, or there are fewer than 2 invoices per item. Try a longer date range.
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="text-sm font-semibold text-zinc-200">
              Changed Items — {rows.length} item{rows.length !== 1 ? "s" : ""}
            </div>
            <div className="text-xs text-zinc-500">Click a row to see full price timeline</div>
          </div>
          <div className="space-y-1.5">
            {rows.map((r, i) => {
              const key = `${r.item_description}|||${r.supplier_name}`;
              const isOpen = expandedKey === key;
              const detail = detailCache[key];
              const absChange = Math.abs(r.pct_change);
              return (
                <div key={i} className="rounded-xl border border-white/10 bg-white/4">
                  <button
                    type="button"
                    onClick={() => void loadDetail(r.item_description, r.supplier_name)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/4 transition rounded-xl"
                  >
                    <div className="shrink-0">
                      {r.pct_change > 0
                        ? <TrendingUp className="h-5 w-5 text-rose-400" />
                        : <TrendingDown className="h-5 w-5 text-emerald-400" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-white">{r.item_description}</div>
                      <div className="text-xs text-zinc-500">{r.supplier_name || "—"}</div>
                    </div>
                    <div className="shrink-0 text-right hidden sm:block">
                      <div className="text-sm text-zinc-400 tabular-nums">
                        {r.currency} {fmt(r.first_price)}
                        <span className="mx-1.5 text-zinc-600">→</span>
                        <span className="font-semibold text-zinc-200">{fmt(r.latest_price)}</span>
                      </div>
                      <div className="text-xs text-zinc-600">{r.unit || ""}</div>
                    </div>
                    <div className="shrink-0">
                      <PctBadge pct={r.pct_change} />
                    </div>
                    <div className="shrink-0 text-right hidden md:block">
                      <div className="text-xs text-zinc-500">{r.data_points} invoices</div>
                      <div className="text-xs text-zinc-600">{r.first_date} → {r.latest_date}</div>
                    </div>
                    {/* Severity indicator */}
                    {absChange >= 20 && (
                      <span className="shrink-0 rounded border border-rose-700/40 bg-rose-900/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">HIGH</span>
                    )}
                    {absChange >= 10 && absChange < 20 && (
                      <span className="shrink-0 rounded border border-amber-700/40 bg-amber-900/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">MED</span>
                    )}
                    <div className="shrink-0 text-xs text-zinc-600">{isOpen ? "▲" : "▼"}</div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-white/10 px-4 pb-4 pt-3">
                      {!detail ? (
                        <div className="text-sm text-zinc-500">Loading…</div>
                      ) : detail.length === 0 ? (
                        <div className="text-sm text-zinc-500">No history found.</div>
                      ) : (
                        <>
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                              <thead>
                                <tr className="text-[10px] uppercase tracking-widest text-zinc-600">
                                  <th className="px-2 py-1 text-left">Date</th>
                                  <th className="px-2 py-1 text-right">Unit Price</th>
                                  <th className="px-2 py-1 text-right">Change vs prev</th>
                                  <th className="px-2 py-1 text-left">Invoice</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detail.map((d, di) => (
                                  <tr key={di} className="border-t border-white/8">
                                    <td className="px-2 py-1.5 tabular-nums text-zinc-400">{d.invoice_date}</td>
                                    <td className="px-2 py-1.5 text-right tabular-nums font-medium text-white">
                                      {d.currency} {fmt(d.unit_price)}
                                    </td>
                                    <td className="px-2 py-1.5 text-right">
                                      {d.pct_change != null
                                        ? <PctBadge pct={Number(d.pct_change)} />
                                        : <span className="text-xs text-zinc-600">first</span>}
                                    </td>
                                    <td className="px-2 py-1.5 text-xs font-mono text-zinc-500">{d.invoice_no}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-500">
                            <span>Min: <span className="text-zinc-300">{r.currency} {fmt(r.min_price)}</span></span>
                            <span>Max: <span className="text-zinc-300">{r.currency} {fmt(r.max_price)}</span></span>
                            <span>Latest invoice: <span className="font-mono text-zinc-300">{r.latest_invoice_no}</span></span>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ③ Catalogue vs latest invoices
//
// 発注カタログの単価は手で登録する。請求書は実際に払った額。ずれたままだと
// 発注画面に出る金額が静かに嘘になる（Salt: カタログ ₱400/SACK・請求 ₱30/KG）。
//
// ⚠️ 比較は **同じ仕入先** の請求だけ。品名だけで突合していた最初の版では、
// マニラ30件中27件が別の会社の請求と比べられており、Sunny Lettuce は
// Richcath's と Three-S の両方に Green Nature の ₱450 を提示していた。
// 1クリックで書き換えられる画面なので、これは「見づらい」ではなく押すと壊れる。
//
// この画面の要点は「気づける」ことではなく **その場で直せる** こと。
// Order Catalog は `showTo: ["full"]` なので、実際に発注している
// INVENTORY_PURCHASING の人は開けない。直す口をここに置いてある。
// ─────────────────────────────────────────────────────────────────────────────

type DriftRow = {
  catalog_id: string;
  item_name: string;
  catalog_unit: string;
  catalog_price: number;
  catalog_supplier: string;
  catalog_category: string;
  currency_code: string;
  invoice_price: number;
  invoice_points: number;
  invoice_min: number;
  invoice_max: number;
  invoice_unit: string;
  invoice_supplier: string;
  latest_invoice_date: string;
  latest_invoice_no: string;
  latest_invoice_price: number;
  diff_pct: number;
  abs_diff_pct: number;
  diff_amount: number;
  unit_mismatch: boolean;
  invoice_spread: number;
};

type DriftResult = {
  city: string;
  threshold_pct: number;
  catalog_total: number;
  compared: number;
  cross_supplier: number;
  uncomparable: number;
  within_threshold: number;
  total: number;
  rows: DriftRow[];
  unit_total: number;
  unit_rows: DriftRow[];
};

type FixState = {
  before: number;
  after: number;
  beforeUnit: string;
  afterUnit: string;
};

function CatalogDriftTab({
  city, requestedBy, pin,
}: { city: "dubai" | "manila"; requestedBy: string; pin: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DriftResult | null>(null);
  const [minPct, setMinPct] = useState<number | null>(null); // null = server default
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState("");
  // 直したセッションのあいだ、直した行を一覧に残す。消えると「元に戻す」も
  // 一緒に消えるので、「戻せます」が嘘になる（教訓56）。
  const [fixed, setFixed] = useState<Record<string, FixState>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [showUnits, setShowUnits] = useState(false);

  const money = city === "dubai" ? "AED" : "₱";

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const headers = await procurementTokenHeaders(requestedBy, pin);
      const qs = new URLSearchParams({ market: city, limit: "500" });
      if (minPct != null) qs.set("min_pct", String(minPct));
      const res = await fetch(`/api/admin/procurement/price-checks/catalog-drift?${qs.toString()}`, {
        cache: "no-store", headers,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail || String(res.status));
      setResult(json);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [city, minPct, requestedBy, pin]);

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function applyPrice(row: DriftRow, price: number, unit: string) {
    setSavingId(row.catalog_id);
    setRowError((m) => ({ ...m, [row.catalog_id]: "" }));
    try {
      const headers = await procurementTokenHeaders(requestedBy, pin);
      const res = await fetch(`/api/admin/procurement/price-checks/catalog-price`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          approver_name: requestedBy,
          pin,
          city,
          catalog_id: row.catalog_id,
          unit_price: price,
          unit,
        }),
      });
      // 保存のレスポンスを見ないUIは、失敗を成功と同じ見た目にする（教訓46）。
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.detail || `Save failed (${res.status})`);
      const before = json?.before || {};
      const after = json?.after || {};
      setFixed((m) => ({
        ...m,
        [row.catalog_id]: {
          before: Number(before?.unit_price ?? row.catalog_price),
          after: Number(after?.unit_price ?? price),
          beforeUnit: String(before?.unit ?? row.catalog_unit),
          afterUnit: String(after?.unit ?? unit ?? row.catalog_unit),
        },
      }));
      window.dispatchEvent(new Event("procurement-badge-refresh"));
    } catch (e: any) {
      setRowError((m) => ({ ...m, [row.catalog_id]: e?.message || String(e) }));
    } finally {
      setSavingId("");
    }
  }

  async function undo(row: DriftRow) {
    const f = fixed[row.catalog_id];
    if (!f) return;
    setSavingId(row.catalog_id);
    setRowError((m) => ({ ...m, [row.catalog_id]: "" }));
    try {
      const headers = await procurementTokenHeaders(requestedBy, pin);
      const res = await fetch(`/api/admin/procurement/price-checks/catalog-price`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          approver_name: requestedBy, pin, city,
          catalog_id: row.catalog_id,
          unit_price: f.before,
          unit: f.beforeUnit,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.detail || `Undo failed (${res.status})`);
      setFixed((m) => { const n = { ...m }; delete n[row.catalog_id]; return n; });
      window.dispatchEvent(new Event("procurement-badge-refresh"));
    } catch (e: any) {
      setRowError((m) => ({ ...m, [row.catalog_id]: e?.message || String(e) }));
    } finally {
      setSavingId("");
    }
  }

  function fmt(n: number) {
    return `${money}${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  const rows = result?.rows ?? [];
  const unitRows = result?.unit_rows ?? [];

  return (
    <div className="space-y-4">
      {/* What this compares, and what it cannot see */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-zinc-300">
            Catalogue unit price vs the <span className="text-white">median of the last 3 invoices from the same supplier</span>.
          </div>
          <div className="flex items-center gap-2">
            <div className="text-[11px] uppercase tracking-widest text-zinc-500">Flag over</div>
            <SelectDark
              value={String(minPct ?? result?.threshold_pct ?? 30)}
              onChange={(v) => setMinPct(Number(v))}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-amber-500/50"
              options={[10, 20, 30, 50, 100].map((n) => ({ value: String(n), label: `${n}%` }))}
            />
            <button
              type="button"
              onClick={() => void load()}
              disabled={busy}
              className="flex items-center gap-2 rounded-xl border border-amber-600/50 bg-amber-900/25 px-3 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-900/40 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {result && (
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-zinc-400">
            <span>
              Comparing <span className="text-white">{result.compared}</span> of {result.catalog_total} catalogue items
            </span>
            <span>{result.within_threshold} within {result.threshold_pct}%</span>
            <span className="text-zinc-500">
              {result.cross_supplier} are invoiced under this name, but never by the supplier the catalogue names —
              another company&apos;s price is not evidence about this one, so they are not compared
            </span>
            <span className="text-zinc-500">
              {result.uncomparable} have never appeared on an invoice under this name — this report cannot see them
            </span>
          </div>
        )}
      </section>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            {error}
            {!pin.trim() && (
              <div className="mt-1 text-red-200/80">
                Enter your PIN in the box at the top of the page, then press Refresh.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Price differs — the actionable queue.
          **読み込めていないときは何も出さない。** 取得に失敗した状態で
          「0 items — 直すものはありません」と出すのは、この画面が出しうる
          最悪の嘘（教訓58）。実際に PIN 未入力で出た。 */}
      {result && (
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-white">
            Price differs — {rows.length} item{rows.length !== 1 ? "s" : ""}
          </div>
          <div className="text-xs text-zinc-500">Same unit on both sides, so the two prices are comparable.</div>
        </div>

        {!busy && result && rows.length === 0 && (
          <div className="mt-4 text-sm text-zinc-500">
            No catalogue price is more than {result?.threshold_pct ?? 30}% away from its recent invoices.
          </div>
        )}

        <div className="mt-4 space-y-2">
          {rows.map((r) => {
            const f = fixed[r.catalog_id];
            const draft = drafts[r.catalog_id] ?? String(r.invoice_price);
            // 直した後も古い % を出すと、画面の中で数字どうしが食い違う（教訓73）。
            // 直した価格で計算し直す。
            const shownPct = f && f.after > 0
              ? Math.round(((r.invoice_price - f.after) / f.after) * 1000) / 10
              : r.diff_pct;
            const up = shownPct > 0;
            return (
              <div key={r.catalog_id} className="rounded-xl border border-white/8 bg-black/20 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">{r.item_name}</div>
                    <div className="mt-0.5 text-[11px] text-zinc-500">
                      {[r.catalog_supplier, r.catalog_category].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-zinc-500">Catalogue</div>
                      <div className="tabular-nums text-zinc-200">
                        {fmt(f ? f.after : r.catalog_price)} <span className="text-zinc-500">/ {f ? f.afterUnit : r.catalog_unit || "—"}</span>
                      </div>
                    </div>
                    <div className={Math.abs(shownPct) < (result?.threshold_pct ?? 30)
                      ? "text-zinc-400" : up ? "text-rose-300" : "text-emerald-300"}>
                      {up ? <TrendingUp className="inline h-4 w-4" /> : <TrendingDown className="inline h-4 w-4" />}
                      <span className="ml-1 tabular-nums font-semibold">{up ? "+" : ""}{shownPct}%</span>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-zinc-500">
                        {r.invoice_supplier || "Invoices"} — median of {r.invoice_points}
                      </div>
                      <div className="tabular-nums text-white">
                        {fmt(r.invoice_price)} <span className="text-zinc-500">/ {r.invoice_unit || "—"}</span>
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        latest {r.latest_invoice_date}
                        {r.latest_invoice_no ? ` · ${r.latest_invoice_no}` : ""}
                        {r.invoice_spread > 0 ? ` · range ${fmt(r.invoice_min)}–${fmt(r.invoice_max)}` : ""}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {f ? (
                    <>
                      <span className="rounded-lg border border-emerald-700/40 bg-emerald-900/20 px-2.5 py-1 text-xs text-emerald-200">
                        Updated {fmt(f.before)} → {fmt(f.after)}
                      </span>
                      <button
                        type="button"
                        onClick={() => void undo(r)}
                        disabled={savingId === r.catalog_id}
                        className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-zinc-300 hover:bg-white/5 disabled:opacity-50"
                      >
                        Undo — back to {fmt(f.before)}
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-xs text-zinc-500">Set catalogue price to</span>
                      <input
                        value={draft}
                        inputMode="decimal"
                        onChange={(e) => setDrafts((m) => ({ ...m, [r.catalog_id]: e.target.value }))}
                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                        className="w-28 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-sm tabular-nums text-white outline-none focus:border-amber-500/50"
                      />
                      <span className="text-xs text-zinc-500">per {r.catalog_unit || "—"}</span>
                      <button
                        type="button"
                        disabled={savingId === r.catalog_id || !(Number(draft) > 0)}
                        onClick={() => void applyPrice(r, Number(draft), "")}
                        className="rounded-lg border border-amber-600/50 bg-amber-900/25 px-3 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-900/40 disabled:opacity-50"
                      >
                        {savingId === r.catalog_id ? "Saving…" : "Update catalogue"}
                      </button>
                    </>
                  )}
                  {rowError[r.catalog_id] && (
                    <span className="text-xs text-red-300">{rowError[r.catalog_id]}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
      )}

      {/* Unit differs — a different job, deliberately not mixed in */}
      {unitRows.length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <button
            type="button"
            onClick={() => setShowUnits((v) => !v)}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <div className="text-sm font-semibold text-white">
              Unit differs — {unitRows.length} item{unitRows.length !== 1 ? "s" : ""}
            </div>
            <div className="text-xs text-zinc-500">
              {showUnits ? "Hide" : "Show"} — no % here: a per-piece price and a per-pack price are not the same measurement
            </div>
          </button>

          {showUnits && (
            <div className="mt-4 space-y-2">
              {unitRows.map((r) => {
                const f = fixed[r.catalog_id];
                const draft = drafts[r.catalog_id] ?? "";
                return (
                  <div key={r.catalog_id} className="rounded-xl border border-white/8 bg-black/20 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white">{r.item_name}</div>
                        <div className="mt-0.5 text-[11px] text-zinc-500">
                          {[r.catalog_supplier, r.catalog_category].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        <div>
                          <div className="text-[10px] uppercase tracking-widest text-zinc-500">Catalogue</div>
                          <div className="tabular-nums text-zinc-200">
                            {fmt(f ? f.after : r.catalog_price)} <span className="text-zinc-500">/ {f ? f.afterUnit : r.catalog_unit || "—"}</span>
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-widest text-zinc-500">Invoices ({r.invoice_points})</div>
                          <div className="tabular-nums text-white">
                            {fmt(r.invoice_price)} <span className="text-zinc-500">/ {r.invoice_unit || "—"}</span>
                          </div>
                          <div className="text-[11px] text-zinc-500">latest {r.latest_invoice_date}</div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 text-xs text-zinc-400">
                      Buying by the {r.catalog_unit || "?"} while the invoice bills by the {r.invoice_unit || "?"} is normal
                      (a pack holds many pieces). Only change this if the catalogue unit is wrong for how this item is ordered.
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {f ? (
                        <>
                          <span className="rounded-lg border border-emerald-700/40 bg-emerald-900/20 px-2.5 py-1 text-xs text-emerald-200">
                            Updated {fmt(f.before)}/{f.beforeUnit || "—"} → {fmt(f.after)}/{f.afterUnit || "—"}
                          </span>
                          <button
                            type="button"
                            onClick={() => void undo(r)}
                            disabled={savingId === r.catalog_id}
                            className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-zinc-300 hover:bg-white/5 disabled:opacity-50"
                          >
                            Undo
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="text-xs text-zinc-500">Set to</span>
                          <input
                            value={draft}
                            inputMode="decimal"
                            placeholder="price"
                            onChange={(e) => setDrafts((m) => ({ ...m, [r.catalog_id]: e.target.value }))}
                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
                            className="w-24 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-sm tabular-nums text-white outline-none focus:border-amber-500/50"
                          />
                          <input
                            value={drafts[`${r.catalog_id}:unit`] ?? r.catalog_unit}
                            placeholder="unit"
                            onChange={(e) => setDrafts((m) => ({ ...m, [`${r.catalog_id}:unit`]: e.target.value }))}
                            className="w-24 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-sm text-white outline-none focus:border-amber-500/50"
                          />
                          <button
                            type="button"
                            disabled={savingId === r.catalog_id || !(Number(draft) > 0)}
                            onClick={() => void applyPrice(r, Number(draft), (drafts[`${r.catalog_id}:unit`] ?? r.catalog_unit) || "")}
                            className="rounded-lg border border-amber-600/50 bg-amber-900/25 px-3 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-900/40 disabled:opacity-50"
                          >
                            {savingId === r.catalog_id ? "Saving…" : "Update catalogue"}
                          </button>
                        </>
                      )}
                      {rowError[r.catalog_id] && (
                        <span className="text-xs text-red-300">{rowError[r.catalog_id]}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

type ActiveTab = "variance" | "changes" | "catalog";

export default function ProcurementPriceChecksPage() {
  const auth = useMemo(() => getAuth(), []);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState<"dubai" | "manila">("dubai");
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [activeTab, setActiveTab] = useState<ActiveTab>("variance");

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      if (cancelled) return;
      const resolved = refreshed || auth;
      const resolvedCity = String(resolved?.city || "").toLowerCase() === "dubai" ? "dubai" : "manila";
      setAllowed(canAccessProcurementAdmin(String(resolved?.role || ""), resolvedCity));
      setCity(resolvedCity);
      setReady(true);
    }
    void init();
    return () => { cancelled = true; };
  }, [auth]);

  if (!ready) return <div className="text-sm text-zinc-500">Loading…</div>;
  if (!allowed) return (
    <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
      <AlertCircle className="h-4 w-4 shrink-0" />
      Supplier Price Checks are only available to authorized admin roles.
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Page header + auth */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold text-white">Supplier Price Checks</div>
            <div className="mt-1 text-sm text-zinc-400">
              What we are billed by suppliers — invoice vs PO, price movements, and the order catalogue&apos;s own prices.
              For StoreHub selling prices, see Menu Price Check.
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">Approver</div>
              <input
                value={requestedBy}
                onChange={(e) => setRequestedBy(e.target.value)}
                placeholder="Name"
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-violet-500/50 w-40"
              />
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">PIN</div>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="PIN"
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-violet-500/50 w-28"
              />
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">Market</div>
              <SelectDark
                value={city}
                onChange={(v) => setCity(v as "dubai" | "manila")}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-violet-500/50"
                options={[
                  { value: "dubai", label: "Dubai" },
                  { value: "manila", label: "Manila" },
                ]}
              />
            </div>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("variance")}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === "variance"
                ? "border-rose-600/60 bg-rose-900/30 text-rose-200 shadow-[0_0_12px_rgba(225,29,72,0.15)]"
                : "border-white/8 bg-white/5 text-zinc-400 hover:border-rose-800/40 hover:bg-rose-950/20 hover:text-rose-300"
            }`}
          >
            <AlertTriangle className={`h-4 w-4 ${activeTab === "variance" ? "text-rose-400" : "text-zinc-500"}`} />
            ① Invoice vs PO Variance
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("changes")}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === "changes"
                ? "border-violet-600/60 bg-violet-900/30 text-violet-200 shadow-[0_0_12px_rgba(124,58,237,0.15)]"
                : "border-white/8 bg-white/5 text-zinc-400 hover:border-violet-800/40 hover:bg-violet-950/20 hover:text-violet-300"
            }`}
          >
            <TrendingUp className={`h-4 w-4 ${activeTab === "changes" ? "text-violet-400" : "text-zinc-500"}`} />
            ② Price Change History
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("catalog")}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === "catalog"
                ? "border-amber-600/60 bg-amber-900/30 text-amber-200 shadow-[0_0_12px_rgba(217,119,6,0.15)]"
                : "border-white/8 bg-white/5 text-zinc-400 hover:border-amber-800/40 hover:bg-amber-950/20 hover:text-amber-300"
            }`}
          >
            <TriangleAlert className={`h-4 w-4 ${activeTab === "catalog" ? "text-amber-400" : "text-zinc-500"}`} />
            ③ Catalogue vs Invoices
          </button>
        </div>
      </section>

      {activeTab === "variance" && (
        <PoVarianceTab key={`variance-${city}`} city={city} requestedBy={requestedBy} pin={pin} />
      )}
      {activeTab === "changes" && (
        <PriceChangeTab key={`changes-${city}`} city={city} requestedBy={requestedBy} pin={pin} />
      )}
      {activeTab === "catalog" && (
        <CatalogDriftTab key={`catalog-${city}`} city={city} requestedBy={requestedBy} pin={pin} />
      )}
    </div>
  );
}
