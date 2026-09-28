"use client";

import { isoDate } from "@/lib/date";
import {
  AlertCircle, AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Download,
  Minus, Receipt, RefreshCw, TrendingDown, TrendingUp, TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson, procurementTokenHeaders } from "@/lib/procurementClient";
import DatePicker from "@/components/DatePicker";
import SelectDark from "@/components/SelectDark";

// ─────────────────────────────────────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────────────────────────────────────

function toIso(d: Date): string {
  return isoDate(d);
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
  price_disputed?: number;
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
            {(result.price_disputed ?? 0) > 0 && (
              // 黙って一覧から外さない。「差が無い」ではなく「単価が決まらない」
              // という別の事実なので、件数を出す（教訓58）。
              <span className="text-amber-400/80">
                {result.price_disputed} were invoiced at two different prices on the same day, every
                time we looked — no single price to offer, so they are not in the list
              </span>
            )}
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
// ④ Invoice → Receiving
//
// 第一段階で `proc_receiving_items` に `invoice_unit_price` を足し、第二段階で
// 請求書の明細をそこへ運ぶ規則を書いた。**その規則を呼ぶ画面が無かった** ので、
// 適用済みの行は全て one-off dyno から流したもので、現場からは触れなかった。
// ここがその入口（教訓147）。
// ─────────────────────────────────────────────────────────────────────────────

type MatchCandidate = { item_name: string; why: string; score: number };
type MatchProposal = {
  supplier: string;
  invoice_description: string;
  unit: string;
  unit_price: number;
  candidates: MatchCandidate[];
  reason: string;
  detail: string;
};
type MatchPreview = {
  item_name: string; unit: string; supplier: string; invoice_no: string;
  invoice_date: string; ordered: number; invoice: number; diff: number; how: string;
};
type MatchAlias = {
  supplier_key: string; invoice_description: string; item_name: string;
  confirmed_by: string; confirmed_at: string;
};
type MatchResult = {
  city: string; since: string;
  auto: number; by_alias: number; already: number; would_write: number;
  ambiguous: number; contested: number; no_receiving: number;
  actionable: number;
  blocked_by: Record<string, number>;
  preview: MatchPreview[];
  proposals: MatchProposal[];
  aliases: MatchAlias[];
  // ⚠️ 本番の戻り値をそのまま写すこと。私は `total`/`with_invoice`/`pct` と
  // 推測で書き、画面が「0.0% · 0 of 0 lines」を出すところだった（実キーは
  // `lines`/`confirmed`/`confirmed_pct`）。型は書けば通るので、tsc も build も
  // 何も言わない。
  coverage?: { lines?: number; confirmed?: number; confirmed_pct?: number;
               ordered_value?: number; effective_value?: number };
  coverage_error?: string;
};
type MatchedRow = {
  id: string; item_name: string; unit: string; vendor_name: string;
  qty_received: number | null; ordered_price: number | null;
  invoice_price: number | null; price_confirmed_by: string;
  price_confirmed_at: string | null; delivery_date: string | null;
};

// 押せない理由。**バックエンドの `_REASONS` と同じ鍵**で、文言だけこちら側。
// 鍵を2か所で作らない（教訓120）。
const REASON_ORDER = [
  "unit_differs", "two_deliveries", "no_delivery_near", "name_unknown", "already_priced",
];
const REASON_TEXT: Record<string, string> = {
  unit_differs: "were received, but counted in a different unit",
  two_deliveries: "have two deliveries that could be the one",
  no_delivery_near: "have no delivery from that supplier within three days",
  name_unknown: "read nothing like anything that supplier delivered that week",
  already_priced: "already have an invoice price on the delivery line",
};
const REASON_FIX: Record<string, string> = {
  unit_differs:
    "This one is worth fixing: the supplier bills in one unit and we count in another, so every " +
    "price from them lands on the wrong quantity. Correct the unit in Cost Calculation and these " +
    "go through on the next run.",
  two_deliveries:
    "Two deliveries of the same item in the same window. Which one the invoice is for cannot be " +
    "read from either record, so nothing is written.",
  no_delivery_near:
    "Either the delivery was never recorded, or the invoice covers a week we are not looking at — " +
    "move the date at the top back and see if it appears.",
  name_unknown:
    "Usually a product we buy under a different name, or a delivery nobody entered.",
};

type CatalogEvidenceRow = {
  item_name: string; unit: string; supplier: string; billed: number | null;
  deliveries: number; dates_used: number; dates_disputed: number;
  last_delivery: string; confirmed_by: string;
  catalog_id?: string; catalog_price?: number; catalog_unit?: string;
  catalog_supplier?: string; order_type?: string; store_scope?: string;
  diff?: number; diff_pct?: number | null; reason: string; detail?: string;
};
type CatalogEvidence = {
  city: string; threshold_pct: number;
  catalog_total: number; catalog_priced: number;
  evidenced: number; evidenced_pct: number; confirmed_lines: number;
  agrees: CatalogEvidenceRow[];
  differs: CatalogEvidenceRow[];
  blocked: CatalogEvidenceRow[];
  blocked_by: Record<string, number>;
};

const EVIDENCE_BLOCK_TEXT: Record<string, string> = {
  no_catalog_row: "we were billed for it, but the catalogue does not carry it",
  unit_differs: "the catalogue counts it in a different unit",
  supplier_differs: "the catalogue buys it from someone else",
  ambiguous: "more than one catalogue row could be the one",
  // 空欄どうしは一致ではない。どちらが欠けているかを言う。
  supplier_unknown: "the delivery line records no supplier, so it cannot be placed",
  unit_unknown: "the delivery line records no unit, so the price cannot be compared",
  // 同じ納品日に単価が割れている。どれが単価か決まらない。
  prices_disagree: "two different prices on the same delivery date",
  // 「単価が無い」と「単価が違う」は別の作業（教訓135）。
  no_catalog_price: "the catalogue row has no price yet — this one is worth filling in",
};

// 見出しの数字を押すとその節へ飛ぶ。6画面ぶんスクロールする画面で
// 「読める数字が押せない」のは、数えた意味が半分無くなる（型7）。
function Jump({ to, className, children }:
              { to: string; className?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => document.getElementById(to)?.scrollIntoView({ behavior: "smooth", block: "start" })}
      className={`${className || ""} text-left transition hover:brightness-125 focus:outline-none focus:ring-1 focus:ring-white/30`}
    >
      {children}
    </button>
  );
}

function money(n: number | null | undefined, city: string): string {
  if (n === null || n === undefined) return "—";
  const sym = city === "dubai" ? "AED " : "₱";
  return sym + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function InvoiceMatchTab({ city, requestedBy, pin }: { city: string; requestedBy: string; pin: string }) {
  const [since, setSince] = useState("2026-07-01");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<MatchResult | null>(null);
  const [matched, setMatched] = useState<MatchedRow[]>([]);
  const [showRules, setShowRules] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [rowBusy, setRowBusy] = useState<string>("");
  const [evidence, setEvidence] = useState<CatalogEvidence | null>(null);
  const [fixedCat, setFixedCat] = useState<Record<string, { before: number; after: number }>>({});

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const qs = new URLSearchParams({ city, since });
      // ⚠️ `procurementJson` は呼ぶたびにトークンを取り直す。3本を Promise.all で
      // 並べると `/api/auth/session` が毎回3回走る（本番で実測）。ヘッダは1回だけ
      // 作って使い回す。
      const headers = await procurementTokenHeaders(requestedBy, pin);
      const get = async <T,>(url: string): Promise<T> => {
        const res = await fetch(url, { cache: "no-store", headers });
        const text = await res.text();
        if (!res.ok) {
          let msg = text || `Request failed (${res.status})`;
          try { const j = JSON.parse(text); if (typeof j?.detail === "string") msg = j.detail; } catch { /* keep raw */ }
          throw new Error(msg);
        }
        return JSON.parse(text || "{}") as T;
      };
      const [dry, done, ev] = await Promise.all([
        get<MatchResult>(`/api/admin/procurement/invoice-match/proposals?${qs.toString()}`),
        get<{ rows: MatchedRow[] }>(`/api/admin/procurement/invoice-match/matched?${qs.toString()}`),
        get<CatalogEvidence>(
          `/api/admin/procurement/invoice-match/catalog-evidence?city=${encodeURIComponent(city)}`),
      ]);
      setResult(dry);
      setMatched(done.rows || []);
      setEvidence(ev);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [city, since, requestedBy, pin]);

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function applyAll() {
    setBusy(true); setError(""); setNotice("");
    try {
      const out = await procurementJson<{ applied: number }>(
        `/api/admin/procurement/invoice-match/apply`,
        { method: "POST", body: JSON.stringify({ city, since }) }, requestedBy, pin);
      setNotice(out.applied === 1
        ? "1 line now carries the invoice price. Undo it below."
        : `${out.applied} lines now carry the invoice price. Undo any of them below.`);
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  // 1タップ: 「この請求書の名前はこの品」を確定し、そのまま適用まで通す。
  // 確定と適用を別ボタンにすると、確定しただけで何も起きない画面になる。
  async function confirmCandidate(p: MatchProposal, itemName: string, score: number) {
    const key = `${p.supplier}|${p.invoice_description}`;
    setRowBusy(key); setError(""); setNotice("");
    try {
      await procurementJson(`/api/admin/procurement/invoice-match/alias`, {
        method: "POST",
        body: JSON.stringify({
          city, supplier_name: p.supplier,
          invoice_description: p.invoice_description,
          item_name: itemName, score,
        }),
      }, requestedBy, pin);
      const out = await procurementJson<{ applied: number }>(
        `/api/admin/procurement/invoice-match/apply`,
        { method: "POST", body: JSON.stringify({ city, since }) }, requestedBy, pin);
      setNotice(
        out.applied > 0
          ? `“${p.invoice_description}” = ${itemName}. ${out.applied} line${out.applied === 1 ? "" : "s"} updated.`
          : `“${p.invoice_description}” = ${itemName}. No line matched yet — the unit or the delivery date still has to line up.`);
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setRowBusy("");
    }
  }

  async function undoAlias(a: MatchAlias) {
    setRowBusy(a.invoice_description); setError(""); setNotice("");
    try {
      await procurementJson(`/api/admin/procurement/invoice-match/alias`, {
        method: "POST",
        body: JSON.stringify({
          city, supplier_name: a.supplier_key,
          invoice_description: a.invoice_description, remove: true,
        }),
      }, requestedBy, pin);
      setNotice(`Removed “${a.invoice_description}” = ${a.item_name}. Prices already written stay — undo those in the list below.`);
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setRowBusy("");
    }
  }

  // カタログの書き換えは ③ と同じ1本だけを使う。ここで別の口を作ると、
  // 同じ列に2つの経路ができて必ずずれる（教訓62・74）。PIN が要るのも ③ と同じ。
  async function fixCatalog(row: CatalogEvidenceRow) {
    if (!row.catalog_id) return;
    setRowBusy(row.catalog_id); setError(""); setNotice("");
    try {
      const out = await procurementJson<{ before?: { unit_price?: number }; after?: { unit_price?: number } }>(
        `/api/admin/procurement/price-checks/catalog-price`,
        {
          method: "POST",
          body: JSON.stringify({
            approver_name: requestedBy, pin, city,
            catalog_id: row.catalog_id,
            unit_price: row.billed,
            unit: row.catalog_unit || row.unit,
          }),
        }, requestedBy, pin);
      setFixedCat((m) => ({
        ...m,
        [row.catalog_id as string]: {
          before: Number(out?.before?.unit_price ?? row.catalog_price ?? 0),
          after: Number(out?.after?.unit_price ?? row.billed),
        },
      }));
      setNotice(`${row.item_name} in the order catalogue is now ${money(row.billed, city)} per ${row.catalog_unit || row.unit}.`);
      window.dispatchEvent(new Event("procurement-badge-refresh"));
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setRowBusy("");
    }
  }

  async function undoPrice(row: MatchedRow) {
    setRowBusy(row.id); setError(""); setNotice("");
    try {
      await procurementJson(`/api/admin/procurement/invoice-match/undo`,
        { method: "POST", body: JSON.stringify({ city, ids: [row.id] }) }, requestedBy, pin);
      setNotice(`${row.item_name} is back to the ordered price. Nothing was written to the PO.`);
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setRowBusy("");
    }
  }

  const cov = result?.coverage;
  const proposals = result?.proposals || [];
  const withCands = proposals.filter((p) => (p.candidates || []).length > 0);
  const noCands = proposals.filter((p) => (p.candidates || []).length === 0);

  return (
    <div className="space-y-4">
      {/* What this is and how far it has got */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="text-sm font-semibold text-white">Carry the invoice price onto the receiving line</div>
            <p className="mt-1 text-sm text-zinc-400">
              A receiving line starts life with the price the catalogue had on the day the order was raised.
              That is an estimate. This puts the price the supplier actually billed beside it, in its own
              column, so cost can say which one it is using. <span className="text-zinc-300">The ordered price is never overwritten.</span>
            </p>
          </div>
          <div className="flex items-end gap-3">
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">Deliveries from</div>
              <DatePicker value={since} onChange={setSince} />
            </div>
            <button
              type="button" onClick={() => void load()} disabled={busy}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-200 hover:border-emerald-700/40 hover:text-emerald-200 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">Backed by an invoice</div>
            <div className="mt-0.5 text-lg font-semibold text-white">
              {result?.coverage_error ? "—" : cov ? `${Number(cov.confirmed_pct ?? 0).toFixed(1)}%` : "…"}
            </div>
            <div className="text-[11px] text-zinc-500">
              {result?.coverage_error
                ? "could not be measured"
                : cov ? `${(cov.confirmed ?? 0).toLocaleString()} of ${(cov.lines ?? 0).toLocaleString()} lines` : "reading…"}
            </div>
          </div>
          {/* ⚠️ 読み込み中に 0 を出さない。0 は「やることは無い」という断定で、
              「まだ見ていない」とは別の事実（教訓58）。*/}
          <Jump to="match-safe" className="rounded-xl border border-emerald-800/30 bg-emerald-950/15 px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-widest text-emerald-500/80">Safe to write now</div>
            <div className="mt-0.5 text-lg font-semibold text-emerald-200">{result ? result.would_write : "…"}</div>
            <div className="text-[11px] text-zinc-500">
              {result
                ? `${result.auto} on an exact match, ${result.by_alias} on a name you confirmed`
                : "reading…"}
            </div>
          </Jump>
          <Jump to="match-taps" className="rounded-xl border border-amber-800/30 bg-amber-950/15 px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-widest text-amber-500/80">One tap each</div>
            <div className="mt-0.5 text-lg font-semibold text-amber-200">{result ? withCands.length : "…"}</div>
            <div className="text-[11px] text-zinc-500">
              {result ? "every one of them writes a price" : "reading…"}
            </div>
          </Jump>
          {/* カタログの誤りは、この画面で唯一「これから出る発注」の金額を動かす。
              6画面ぶんスクロールしないと見えない位置にあったので、見出しに出す
              （教訓: 対応が必要な件数は画面を開いた瞬間に分かること）。*/}
          <Jump to="match-catalogue"
                className={`rounded-xl border px-3 py-2.5 ${
                  (evidence?.differs.length ?? 0) > 0
                    ? "border-rose-700/50 bg-rose-950/25"
                    : "border-white/8 bg-black/20"}`}>
            <div className={`text-[10px] uppercase tracking-widest ${
              (evidence?.differs.length ?? 0) > 0 ? "text-rose-400/90" : "text-zinc-500"}`}>
              Catalogue is wrong
            </div>
            <div className={`mt-0.5 text-lg font-semibold ${
              (evidence?.differs.length ?? 0) > 0 ? "text-rose-200" : "text-zinc-300"}`}>
              {evidence ? evidence.differs.length : "…"}
            </div>
            <div className="text-[11px] text-zinc-500">
              {evidence
                ? (evidence.differs.length > 0
                    ? "every order quotes these"
                    : `${evidence.evidenced} row${evidence.evidenced === 1 ? "" : "s"} checked`)
                : "reading…"}
            </div>
          </Jump>
          <Jump to="match-blocked" className="rounded-xl border border-white/8 bg-black/20 px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">Nothing to press</div>
            <div className="mt-0.5 text-lg font-semibold text-zinc-300">
              {result ? (result.no_receiving ?? 0) + noCands.length : "…"}
            </div>
            <div className="text-[11px] text-zinc-500">{result ? "reasons below" : "reading…"}</div>
          </Jump>
        </div>

        <button
          type="button" onClick={() => setShowRules((v) => !v)}
          className="mt-3 text-xs text-zinc-500 underline decoration-dotted underline-offset-4 hover:text-zinc-300"
        >
          {showRules ? "Hide" : "What gets written without asking me?"}
        </button>
        {showRules && (
          <div className="mt-2 rounded-xl border border-white/8 bg-black/20 p-4 text-xs text-zinc-400">
            <div className="text-zinc-300">All five have to be true, or the line is left for you:</div>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>the item name on the invoice is <em>exactly</em> ours (case and spacing aside)</li>
              <li>the unit is the same — <span className="text-zinc-300">CASE and BTL are not the same</span></li>
              <li>the supplier is the same</li>
              <li>the delivery is within 3 days of the invoice date</li>
              <li>the quantity matches to within 1%</li>
            </ol>
            <p className="mt-2">
              Number five is there because the first four line up by accident with a supplier who delivers
              daily: a 1.00 kg invoice line landed on a 20.00 kg delivery.
              A delivery line that two invoice lines both claim is left alone as well — one of them is wrong
              and nothing here can say which.
            </p>
            <p className="mt-2">
              <span className="text-zinc-300">A different quantity on the invoice is not an error to hide.</span>{" "}
              Four billed against three received is exactly what this is supposed to surface, so those stay out
              of the automatic write and wait for you.
            </p>
          </div>
        )}
      </section>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-700/40 bg-emerald-900/15 px-4 py-3 text-sm text-emerald-300">
          {notice}
        </div>
      )}

      {/* Safe to write — show what, not just how many */}
      {(result?.would_write ?? 0) > 0 && (
        <section id="match-safe" className="scroll-mt-4 rounded-2xl border border-emerald-800/30 bg-emerald-950/10 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-emerald-200">
                {result?.would_write === 1
                  ? "1 line can take its invoice price now"
                  : `${result?.would_write} lines can take their invoice price now`}
              </div>
              <button
                type="button" onClick={() => setShowPreview((v) => !v)}
                className="mt-1 text-xs text-emerald-400/80 underline decoration-dotted underline-offset-4 hover:text-emerald-300"
              >
                {showPreview ? "Hide the list" : "See exactly what would change"}
              </button>
            </div>
            <button
              type="button" onClick={() => void applyAll()} disabled={busy}
              className="rounded-xl border border-emerald-600/60 bg-emerald-900/30 px-4 py-2.5 text-sm font-semibold text-emerald-200 hover:bg-emerald-900/50 disabled:opacity-50"
            >
              Write these {result?.would_write}
            </button>
          </div>
          {showPreview && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] text-xs">
                <thead className="text-[10px] uppercase tracking-widest text-zinc-500">
                  <tr className="border-b border-white/10">
                    <th className="px-2 py-2 text-left">Item</th>
                    <th className="px-2 py-2 text-left">Unit</th>
                    <th className="px-2 py-2 text-left">Supplier</th>
                    <th className="px-2 py-2 text-left">Invoice</th>
                    <th className="px-2 py-2 text-right">Ordered</th>
                    <th className="px-2 py-2 text-right">Billed</th>
                    <th className="px-2 py-2 text-right">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {(result?.preview || []).map((r, i) => (
                    <tr key={`${r.invoice_no}-${r.item_name}-${i}`} className="border-b border-white/5">
                      <td className="px-2 py-1.5 text-zinc-200">{r.item_name}</td>
                      <td className="px-2 py-1.5 text-zinc-500">{r.unit}</td>
                      <td className="px-2 py-1.5 text-zinc-400">{r.supplier}</td>
                      <td className="px-2 py-1.5 text-zinc-500">{r.invoice_no} · {r.invoice_date}</td>
                      <td className="px-2 py-1.5 text-right text-zinc-400 tabular-nums">{money(r.ordered, city)}</td>
                      <td className="px-2 py-1.5 text-right text-white tabular-nums">{money(r.invoice, city)}</td>
                      <td className={`px-2 py-1.5 text-right tabular-nums ${
                        Math.abs(r.diff) < 0.005 ? "text-zinc-600" : r.diff > 0 ? "text-rose-300" : "text-emerald-300"
                      }`}>
                        {Math.abs(r.diff) < 0.005 ? "same" : (r.diff > 0 ? "+" : "") + money(r.diff, city)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Needs a person — tap the item it is */}
      <section id="match-taps" className="scroll-mt-4 rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="text-sm font-semibold text-white">
          Invoice names we could not place ({withCands.length})
        </div>
        <p className="mt-1 text-sm text-zinc-400">
          Tap the item each one is. It is remembered per supplier, so the same wording goes through on its
          own next time — and the price is written straight away.
          <span className="text-zinc-500">{" "}Only items that supplier actually delivered that week, in the
          unit they billed, are offered — so every tap here does something.</span>
        </p>
        {withCands.length === 0 && (
          <div className="mt-4 rounded-xl border border-white/8 bg-black/20 px-4 py-6 text-center text-sm text-zinc-500">
            {busy ? "Reading the invoices…" : "Nothing waiting. Every invoice line either matched or has no delivery to match against."}
          </div>
        )}
        <div className="mt-4 space-y-2">
          {withCands.map((p) => {
            const key = `${p.supplier}|${p.invoice_description}`;
            return (
              <div key={key} className="rounded-xl border border-white/8 bg-black/20 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-sm text-zinc-200">{p.invoice_description}</div>
                  <div className="text-xs text-zinc-500">
                    {p.supplier} · {money(p.unit_price, city)} / {p.unit || "—"}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {p.candidates.map((c) => (
                    <button
                      key={c.item_name} type="button"
                      disabled={rowBusy === key}
                      onClick={() => void confirmCandidate(p, c.item_name, c.score)}
                      className="min-h-[38px] rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:border-emerald-600/50 hover:bg-emerald-950/30 hover:text-emerald-200 disabled:opacity-40"
                    >
                      {c.item_name}
                      <span className="ml-2 text-[10px] text-zinc-500">
                        {c.why === "exact" ? "same name" : `${Math.round(c.score * 100)}% of the words`}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {noCands.length > 0 && (
          <div id="match-blocked" className="mt-5 scroll-mt-4 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Nothing to press ({noCands.length}) — and why
            </div>
            {REASON_ORDER.filter((r) => (result?.blocked_by?.[r] ?? 0) > 0).map((r) => {
              const rows = noCands.filter((p) => p.reason === r);
              return (
                <details key={r} className="rounded-xl border border-white/8 bg-black/20 px-3 py-2">
                  <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-200">
                    <span className="font-semibold text-zinc-200">{rows.length}</span> {REASON_TEXT[r] || r}
                  </summary>
                  <div className="mt-2 space-y-1">
                    {rows.map((p) => (
                      <div key={`${p.supplier}|${p.invoice_description}`}
                           className="rounded-lg border border-white/5 bg-black/30 px-3 py-1.5 text-xs">
                        <div className="flex flex-wrap justify-between gap-2">
                          <span className="text-zinc-300">{p.invoice_description}</span>
                          <span className="text-zinc-600">{p.supplier} · {money(p.unit_price, city)} / {p.unit || "—"}</span>
                        </div>
                        {p.detail && <div className="mt-0.5 text-[11px] text-zinc-600">{p.detail}</div>}
                      </div>
                    ))}
                  </div>
                  {REASON_FIX[r] && (
                    <p className="mt-2 text-[11px] text-zinc-600">{REASON_FIX[r]}</p>
                  )}
                </details>
              );
            })}
          </div>
        )}
      </section>

      {/* Names you have confirmed — with the way back */}
      {(result?.aliases?.length ?? 0) > 0 && (
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="text-sm font-semibold text-white">Names you have confirmed ({result?.aliases.length})</div>
          <p className="mt-1 text-xs text-zinc-500">
            Removing one stops it matching from now on. Prices already written stay where they are — undo those
            in the list below.
          </p>
          <div className="mt-3 space-y-1">
            {result?.aliases.map((a) => (
              <div key={`${a.supplier_key}|${a.invoice_description}`}
                   className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-xs">
                <span className="text-zinc-300">
                  {a.invoice_description} <span className="text-zinc-600">=</span> <span className="text-zinc-100">{a.item_name}</span>
                </span>
                <span className="flex items-center gap-3 text-zinc-600">
                  <span>{a.confirmed_by || "—"} · {a.confirmed_at}</span>
                  <button
                    type="button" disabled={rowBusy === a.invoice_description}
                    onClick={() => void undoAlias(a)}
                    className="text-zinc-500 underline decoration-dotted underline-offset-4 hover:text-rose-300 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ⑤ What the billed prices say about the order catalogue (phase 4) */}
      {evidence && (
        <section id="match-catalogue" className="scroll-mt-4 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-2xl">
              <div className="text-sm font-semibold text-white">
                What these prices say about the order catalogue
              </div>
              <p className="mt-1 text-sm text-zinc-400">
                Every order screen quotes the catalogue. A price confirmed against a delivery is the
                only thing that can tell you whether that quote is still true &mdash; and unlike tab ③,
                it reaches items the invoices never name.
              </p>
            </div>
            <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2.5 text-right">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500">Catalogue rows with a delivery behind them</div>
              <div className="mt-0.5 text-lg font-semibold text-white">
                {evidence.evidenced} <span className="text-sm font-normal text-zinc-500">of {evidence.catalog_total.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {evidence.differs.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-widest text-rose-400/80">
                The catalogue is wrong ({evidence.differs.length})
              </div>
              {evidence.differs.map((r) => {
                const done = r.catalog_id ? fixedCat[r.catalog_id] : undefined;
                return (
                  <div key={r.catalog_id || r.item_name}
                       className="rounded-xl border border-rose-800/30 bg-rose-950/10 p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="text-sm text-zinc-100">{r.item_name}</div>
                      <div className="text-xs text-zinc-500">
                        {/* ⚠️ 提示額が何から出たかを書く。`deliveries` は確定行の総数なので、
                            「12 deliveries」の隣に3日ぶんの額が出ていた。 */}
                        {r.supplier} · priced from {r.dates_used} delivery date
                        {r.dates_used === 1 ? "" : "s"}
                        {r.deliveries > r.dates_used ? ` of ${r.deliveries} lines` : ""}
                        {r.dates_disputed > 0
                          ? `, ${r.dates_disputed} date${r.dates_disputed === 1 ? "" : "s"} skipped (two prices)`
                          : ""}
                        {r.last_delivery ? `, last ${r.last_delivery}` : ""}
                      </div>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                      <span className="text-zinc-400">
                        catalogue <span className="tabular-nums text-zinc-300">{money(r.catalog_price, city)}</span>
                        {" / "}{r.catalog_unit || r.unit}
                      </span>
                      <span className="text-zinc-600">→</span>
                      <span className="text-rose-200">
                        billed <span className="tabular-nums">{money(r.billed, city)}</span>
                        {r.diff_pct !== null && r.diff_pct !== undefined
                          ? ` (${r.diff_pct > 0 ? "+" : ""}${r.diff_pct}%)` : ""}
                      </span>
                      {r.detail && <span className="text-zinc-500">{r.detail}</span>}
                      <span className="ml-auto">
                        {done ? (
                          <span className="text-emerald-300">
                            updated {money(done.before, city)} → {money(done.after, city)}
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={rowBusy === r.catalog_id || !pin.trim() || !requestedBy.trim()}
                            onClick={() => void fixCatalog(r)}
                            // PIN が空のまま押せると、押した先で「PIN is required
                            // (procurement.config.write)」という内部キー入りの
                            // 文言に当たる。押せなくして、理由をその場に書く。
                            title={!pin.trim() || !requestedBy.trim()
                              ? "Fill in Approver and PIN at the top of the page first"
                              : undefined}
                            className="min-h-[38px] rounded-lg border border-rose-600/50 bg-rose-900/25 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-900/45 disabled:opacity-40"
                          >
                            Set catalogue to {money(r.billed, city)}
                          </button>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
              <p className="text-[11px] text-zinc-600">
                Changing a catalogue price needs your Approver and PIN at the top of the page &mdash; the same
                permission and the same audit trail as tab ③. It does not touch any order already raised.
                {(!pin.trim() || !requestedBy.trim()) && (
                  <span className="text-amber-400/90">
                    {" "}The buttons are off until those two boxes are filled in.
                  </span>
                )}
              </p>
            </div>
          )}

          {evidence.agrees.length > 0 && (
            <details className="mt-4 rounded-xl border border-white/8 bg-black/20 px-3 py-2">
              <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-200">
                <span className="font-semibold text-emerald-300">{evidence.agrees.length}</span>{" "}
                catalogue price{evidence.agrees.length === 1 ? " is" : "s are"} confirmed by a delivery
              </summary>
              <div className="mt-2 space-y-1">
                {evidence.agrees.map((r) => (
                  <div key={r.catalog_id || r.item_name}
                       className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/5 bg-black/30 px-3 py-1.5 text-xs">
                    <span className="text-zinc-300">{r.item_name}</span>
                    <span className="flex items-center gap-3 text-zinc-500">
                      <span className="tabular-nums">
                        {money(r.catalog_price, city)} / {r.catalog_unit || r.unit}
                      </span>
                      {r.detail
                        ? <span className="text-amber-300/80">billed {money(r.billed, city)} &mdash; {r.detail}</span>
                        : <span className="text-emerald-400/70">billed the same</span>}
                      <span className="text-zinc-600">
                        {r.dates_used} date{r.dates_used === 1 ? "" : "s"}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-zinc-600">
                Anything inside {evidence.threshold_pct}% counts as confirmed, the same line tab ③ draws.
                The billed figure is shown for each one, so a gap you disagree with is visible rather than
                hidden behind the word &ldquo;confirmed&rdquo;.
              </p>
            </details>
          )}

          {evidence.blocked.length > 0 && (
            <details className="mt-2 rounded-xl border border-white/8 bg-black/20 px-3 py-2">
              <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-200">
                <span className="font-semibold text-zinc-200">{evidence.blocked.length}</span>{" "}
                billed price{evidence.blocked.length === 1 ? "" : "s"} that cannot correct a
                catalogue row yet
              </summary>
              <div className="mt-2 space-y-1">
                {evidence.blocked.map((r) => (
                  <div key={`${r.item_name}|${r.supplier}|${r.unit}`}
                       className="rounded-lg border border-white/5 bg-black/30 px-3 py-1.5 text-xs">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="text-zinc-300">{r.item_name}</span>
                      <span className="text-zinc-600">
                        {r.supplier} · {r.billed === null ? "price not settled" : money(r.billed, city)}
                        {" / "}{r.unit || "—"}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-zinc-600">
                      {EVIDENCE_BLOCK_TEXT[r.reason] || r.reason}{r.detail ? ` — ${r.detail}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}

          {evidence.differs.length === 0 && evidence.agrees.length === 0 && evidence.blocked.length === 0 && (
            <div className="mt-4 rounded-xl border border-white/8 bg-black/20 px-4 py-6 text-center text-sm text-zinc-500">
              No delivery has a confirmed price yet, so nothing can be said about the catalogue.
              Confirm some prices above and this fills in.
            </div>
          )}
        </section>
      )}

      {/* Written — the undo lives here, and it stays here */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="text-sm font-semibold text-white">Lines carrying an invoice price ({matched.length})</div>
        {matched.length === 0 ? (
          <div className="mt-3 rounded-xl border border-white/8 bg-black/20 px-4 py-6 text-center text-sm text-zinc-500">
            None yet. Everything in cost is still reading the price the catalogue had on the day the order was raised.
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-xs">
              <thead className="text-[10px] uppercase tracking-widest text-zinc-500">
                <tr className="border-b border-white/10">
                  <th className="px-2 py-2 text-left">Item</th>
                  <th className="px-2 py-2 text-left">Unit</th>
                  <th className="px-2 py-2 text-left">Supplier</th>
                  <th className="px-2 py-2 text-left">Delivered</th>
                  <th className="px-2 py-2 text-right">Ordered</th>
                  <th className="px-2 py-2 text-right">Billed</th>
                  <th className="px-2 py-2 text-left">Confirmed</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {matched.map((r) => (
                  <tr key={r.id} className="border-b border-white/5">
                    <td className="px-2 py-1.5 text-zinc-200">{r.item_name}</td>
                    <td className="px-2 py-1.5 text-zinc-500">{r.unit}</td>
                    <td className="px-2 py-1.5 text-zinc-400">{r.vendor_name}</td>
                    <td className="px-2 py-1.5 text-zinc-500">{r.delivery_date || "—"}</td>
                    <td className="px-2 py-1.5 text-right text-zinc-400 tabular-nums">{money(r.ordered_price, city)}</td>
                    <td className="px-2 py-1.5 text-right text-white tabular-nums">{money(r.invoice_price, city)}</td>
                    <td className="px-2 py-1.5 text-zinc-600">
                      {r.price_confirmed_by || "—"}{r.price_confirmed_at ? ` · ${r.price_confirmed_at}` : ""}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        type="button" disabled={rowBusy === r.id}
                        onClick={() => void undoPrice(r)}
                        className="text-zinc-500 underline decoration-dotted underline-offset-4 hover:text-rose-300 disabled:opacity-40"
                      >
                        Undo
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

type ActiveTab = "variance" | "changes" | "catalog" | "match";

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
          <button
            type="button"
            onClick={() => setActiveTab("match")}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === "match"
                ? "border-emerald-600/60 bg-emerald-900/30 text-emerald-200 shadow-[0_0_12px_rgba(5,150,105,0.15)]"
                : "border-white/8 bg-white/5 text-zinc-400 hover:border-emerald-800/40 hover:bg-emerald-950/20 hover:text-emerald-300"
            }`}
          >
            <Receipt className={`h-4 w-4 ${activeTab === "match" ? "text-emerald-400" : "text-zinc-500"}`} />
            ④ Invoice → Receiving
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
      {activeTab === "match" && (
        <InvoiceMatchTab key={`match-${city}`} city={city} requestedBy={requestedBy} pin={pin} />
      )}
    </div>
  );
}
