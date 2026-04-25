"use client";

import { AlertTriangle, ArrowDown, ArrowUp, Minus, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementTokenHeaders } from "@/lib/procurementClient";
import DatePicker from "@/components/DatePicker";

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
};

type PoVarianceResult = {
  market: string;
  min_pct: number;
  total_variances: number;
  over_charged_count: number;
  under_charged_count: number;
  total_overcharge_amount: number;
  total_undercharge_amount: number;
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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
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
  return "text-neutral-400";
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
    : "border-neutral-700/40 bg-neutral-800/40 text-neutral-400";
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${cls}`}>
      {pct > 0 ? <ArrowUp className="h-3 w-3" /> : pct < 0 ? <ArrowDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      {sign}{fmt(Math.abs(pct), 1)}%
    </span>
  );
}

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: "rose" | "emerald" | "amber" | "neutral" }) {
  const borderCls = accent === "rose"
    ? "border-rose-800/40"
    : accent === "emerald"
    ? "border-emerald-800/40"
    : accent === "amber"
    ? "border-amber-800/40"
    : "border-neutral-800";
  const valueCls = accent === "rose"
    ? "text-rose-200"
    : accent === "emerald"
    ? "text-emerald-300"
    : accent === "amber"
    ? "text-amber-200"
    : "text-neutral-100";
  return (
    <div className={`rounded-2xl border ${borderCls} bg-neutral-900/30 p-4`}>
      <div className="text-[10px] uppercase tracking-widest text-neutral-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${valueCls}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab ①: PO Variance
// ─────────────────────────────────────────────────────────────────────────────

function PoVarianceTab({
  city,
  requestedBy,
  pin,
}: {
  city: "dubai" | "manila";
  requestedBy: string;
  pin: string;
}) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [supplier, setSupplier] = useState("");
  const [minPct, setMinPct] = useState(1);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PoVarianceResult | null>(null);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const headers = await procurementTokenHeaders(requestedBy, pin);
      const qs = new URLSearchParams({ market: city, min_pct: String(minPct), limit: "300" });
      if (dateFrom) qs.set("date_from", dateFrom);
      if (dateTo) qs.set("date_to", dateTo);
      if (supplier.trim()) qs.set("supplier_name", supplier.trim());
      const res = await fetch(`/api/admin/procurement/price-checks/po-variance?${qs.toString()}`, {
        cache: "no-store",
        headers,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail || String(res.status));
      setResult(json);
      setSearched(true);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [city, dateFrom, dateTo, supplier, minPct, requestedBy, pin]);

  const currency = result?.currency || "AED";
  const rows = result?.rows || [];

  return (
    <div className="space-y-5">
      {/* Filters */}
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="text-sm font-semibold text-neutral-200">Filter</div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-widest text-neutral-500">From</div>
            <DatePicker value={dateFrom} onChange={setDateFrom} />
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-widest text-neutral-500">To</div>
            <DatePicker value={dateTo} onChange={setDateTo} />
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-widest text-neutral-500">Supplier</div>
            <input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="All suppliers"
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-violet-500/50"
            />
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-widest text-neutral-500">Min Variance %</div>
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={minPct}
              onChange={(e) => setMinPct(Math.max(0, Number(e.target.value || 0)))}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-violet-500/50"
            />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => void load()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl border border-violet-700/50 bg-violet-900/20 px-4 py-2 text-sm text-violet-200 hover:bg-violet-800/30 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
            {busy ? "Loading…" : "Run"}
          </button>
        </div>
        {error && <div className="mt-3 rounded-xl border border-rose-800/40 bg-rose-900/20 px-4 py-3 text-sm text-rose-300">{error}</div>}
      </section>

      {/* KPI summary */}
      {result && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Total Variances" value={String(result.total_variances)} accent="neutral" />
          <KpiCard label="Overcharged Lines" value={String(result.over_charged_count)} accent="rose" />
          <KpiCard label="Undercharged Lines" value={String(result.under_charged_count)} accent="emerald" />
          <KpiCard
            label="Net Overcharge Exposure"
            value={`${currency} ${fmt(result.total_overcharge_amount - result.total_undercharge_amount)}`}
            accent={result.total_overcharge_amount > result.total_undercharge_amount ? "rose" : "emerald"}
          />
        </div>
      )}

      {/* Empty state */}
      {searched && rows.length === 0 && !busy && (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-8 text-center text-sm text-neutral-500">
          No price variances found for the selected filters. Try lowering the minimum % threshold, or ensure invoices have a PO number linked.
        </div>
      )}

      {/* Table */}
      {rows.length > 0 && (
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-neutral-200">
              Variance Details — {rows.length} line{rows.length !== 1 ? "s" : ""}
            </div>
            <div className="text-xs text-neutral-500">Sorted by largest variance first</div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-neutral-500">
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Supplier</th>
                  <th className="px-3 py-2">PO No</th>
                  <th className="px-3 py-2">Invoice No</th>
                  <th className="px-3 py-2">Inv Date</th>
                  <th className="px-3 py-2 text-right">PO Price</th>
                  <th className="px-3 py-2 text-right">Inv Price</th>
                  <th className="px-3 py-2 text-right">Delta</th>
                  <th className="px-3 py-2 text-right">%</th>
                  <th className="px-3 py-2">Branch</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const isOver = r.pct_delta > 0;
                  const rowBg = isOver ? "bg-rose-950/10" : "bg-emerald-950/10";
                  return (
                    <tr key={i} className={`border-t border-neutral-800/60 ${rowBg}`}>
                      <td className="px-3 py-2.5 font-medium text-neutral-100">{r.item_description || "—"}</td>
                      <td className="px-3 py-2.5 text-neutral-300">{r.invoice_supplier || r.po_vendor || "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-neutral-400">{r.po_number || "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-neutral-400">{r.invoice_no || "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-neutral-400">{r.invoice_date || "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-neutral-400">
                        {r.currency} {fmt(r.po_unit_price)}
                        {r.po_unit ? <span className="ml-1 text-neutral-600">/{r.po_unit}</span> : null}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-neutral-100">
                        {r.currency} {fmt(r.invoice_unit_price)}
                        {r.invoice_unit ? <span className="ml-1 text-neutral-500">/{r.invoice_unit}</span> : null}
                      </td>
                      <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${pctClass(r.pct_delta)}`}>
                        {r.price_delta > 0 ? "+" : ""}{r.currency} {fmt(r.price_delta)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <PctBadge pct={r.pct_delta} />
                      </td>
                      <td className="px-3 py-2.5 text-xs text-neutral-500">{r.branch || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab ②: Item Price Change History
// ─────────────────────────────────────────────────────────────────────────────

type DetailRow = {
  invoice_date: string;
  unit_price: number;
  prev_unit_price: number | null;
  pct_change: number | null;
  currency: string;
  invoice_no: string;
};

function PriceChangeTab({
  city,
  requestedBy,
  pin,
}: {
  city: "dubai" | "manila";
  requestedBy: string;
  pin: string;
}) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [supplier, setSupplier] = useState("");
  const [minPct, setMinPct] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PriceChangeResult | null>(null);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, DetailRow[]>>({});

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const headers = await procurementTokenHeaders(requestedBy, pin);
      const qs = new URLSearchParams({ market: city, min_pct: String(minPct), limit: "300" });
      if (dateFrom) qs.set("date_from", dateFrom);
      if (dateTo) qs.set("date_to", dateTo);
      if (supplier.trim()) qs.set("supplier_name", supplier.trim());
      const res = await fetch(`/api/admin/procurement/price-checks/item-price-changes?${qs.toString()}`, {
        cache: "no-store",
        headers,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail || String(res.status));
      setResult(json);
      setSearched(true);
      setExpandedKey(null);
      setDetailCache({});
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [city, dateFrom, dateTo, supplier, minPct, requestedBy, pin]);

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
        cache: "no-store",
        headers,
      });
      const json = await res.json();
      setDetailCache((prev) => ({ ...prev, [key]: (json?.rows || []) as DetailRow[] }));
    } catch {
      setDetailCache((prev) => ({ ...prev, [key]: [] }));
    }
  }, [expandedKey, detailCache, city, dateFrom, dateTo, requestedBy, pin]);

  const rows = result?.rows || [];

  return (
    <div className="space-y-5">
      {/* Filters */}
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="text-sm font-semibold text-neutral-200">Filter</div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-widest text-neutral-500">From</div>
            <DatePicker value={dateFrom} onChange={setDateFrom} />
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-widest text-neutral-500">To</div>
            <DatePicker value={dateTo} onChange={setDateTo} />
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-widest text-neutral-500">Supplier</div>
            <input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="All suppliers"
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-violet-500/50"
            />
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-widest text-neutral-500">Min Change %</div>
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={minPct}
              onChange={(e) => setMinPct(Math.max(0, Number(e.target.value || 0)))}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-violet-500/50"
            />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => void load()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl border border-violet-700/50 bg-violet-900/20 px-4 py-2 text-sm text-violet-200 hover:bg-violet-800/30 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
            {busy ? "Loading…" : "Run"}
          </button>
        </div>
        {error && <div className="mt-3 rounded-xl border border-rose-800/40 bg-rose-900/20 px-4 py-3 text-sm text-rose-300">{error}</div>}
      </section>

      {/* KPI */}
      {result && (
        <div className="grid grid-cols-3 gap-3">
          <KpiCard label="Items with Change" value={String(result.total_items)} accent="neutral" />
          <KpiCard label="Price Increased" value={String(result.increased_count)} sub="vs first invoice" accent="rose" />
          <KpiCard label="Price Decreased" value={String(result.decreased_count)} sub="vs first invoice" accent="emerald" />
        </div>
      )}

      {/* Empty state */}
      {searched && rows.length === 0 && !busy && (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-8 text-center text-sm text-neutral-500">
          No price changes found. Either all items have stable prices, or the selected period has insufficient history (need at least 2 invoices per item).
        </div>
      )}

      {/* Expandable list */}
      {rows.length > 0 && (
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-neutral-200">
              Changed Items — {rows.length} item{rows.length !== 1 ? "s" : ""}
            </div>
            <div className="text-xs text-neutral-500">Click a row to see full price timeline</div>
          </div>
          <div className="mt-4 space-y-1.5">
            {rows.map((r, i) => {
              const key = `${r.item_description}|||${r.supplier_name}`;
              const isOpen = expandedKey === key;
              const detail = detailCache[key];
              return (
                <div key={i} className="rounded-xl border border-neutral-800 bg-neutral-950/40">
                  <button
                    type="button"
                    onClick={() => void loadDetail(r.item_description, r.supplier_name)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-neutral-900/50 transition rounded-xl"
                  >
                    {/* Trend icon */}
                    <div className="shrink-0">
                      {r.pct_change > 0
                        ? <TrendingUp className="h-5 w-5 text-rose-400" />
                        : <TrendingDown className="h-5 w-5 text-emerald-400" />}
                    </div>
                    {/* Item + supplier */}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-neutral-100">{r.item_description}</div>
                      <div className="text-xs text-neutral-500">{r.supplier_name || "—"}</div>
                    </div>
                    {/* Price span */}
                    <div className="shrink-0 text-right hidden sm:block">
                      <div className="text-sm text-neutral-400 tabular-nums">
                        {r.currency} {fmt(r.first_price)}
                        <span className="mx-1.5 text-neutral-600">→</span>
                        <span className="font-semibold text-neutral-200">{fmt(r.latest_price)}</span>
                      </div>
                      <div className="text-xs text-neutral-600">{r.unit || ""}</div>
                    </div>
                    {/* Pct badge */}
                    <div className="shrink-0">
                      <PctBadge pct={r.pct_change} />
                    </div>
                    {/* Records / date range */}
                    <div className="shrink-0 text-right hidden md:block">
                      <div className="text-xs text-neutral-500">{r.data_points} records</div>
                      <div className="text-xs text-neutral-600">{r.first_date} → {r.latest_date}</div>
                    </div>
                    {/* Chevron */}
                    <div className="shrink-0 text-xs text-neutral-600">{isOpen ? "▲" : "▼"}</div>
                  </button>

                  {/* Expanded timeline */}
                  {isOpen && (
                    <div className="border-t border-neutral-800 px-4 pb-4 pt-3">
                      {!detail ? (
                        <div className="text-sm text-neutral-500">Loading…</div>
                      ) : detail.length === 0 ? (
                        <div className="text-sm text-neutral-500">No history records found.</div>
                      ) : (
                        <>
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                              <thead>
                                <tr className="text-[10px] uppercase tracking-widest text-neutral-600">
                                  <th className="px-2 py-1 text-left">Date</th>
                                  <th className="px-2 py-1 text-right">Unit Price</th>
                                  <th className="px-2 py-1 text-right">Change</th>
                                  <th className="px-2 py-1 text-left">Invoice</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detail.map((d, di) => (
                                  <tr key={di} className="border-t border-neutral-800/60">
                                    <td className="px-2 py-1.5 tabular-nums text-neutral-400">{d.invoice_date}</td>
                                    <td className="px-2 py-1.5 text-right tabular-nums font-medium text-neutral-100">
                                      {d.currency} {fmt(d.unit_price)}
                                    </td>
                                    <td className="px-2 py-1.5 text-right">
                                      {d.pct_change != null ? (
                                        <PctBadge pct={Number(d.pct_change)} />
                                      ) : (
                                        <span className="text-xs text-neutral-600">first</span>
                                      )}
                                    </td>
                                    <td className="px-2 py-1.5 text-xs text-neutral-500">{d.invoice_no}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-4 text-xs text-neutral-500">
                            <span>Min: <span className="text-neutral-300">{r.currency} {fmt(r.min_price)}</span></span>
                            <span>Max: <span className="text-neutral-300">{r.currency} {fmt(r.max_price)}</span></span>
                            <span>Latest invoice: <span className="text-neutral-300">{r.latest_invoice_no}</span></span>
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
// Main page
// ─────────────────────────────────────────────────────────────────────────────

type ActiveTab = "variance" | "changes";

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

  if (!ready) return <div className="text-sm text-neutral-500">Loading price checks…</div>;
  if (!allowed) return <div className="text-sm text-rose-300">Procurement page is available only to authorized admin roles.</div>;

  return (
    <div className="space-y-5">
      {/* Page header + auth controls */}
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold text-neutral-100">Price Checks</div>
            <div className="mt-1 text-sm text-neutral-400">
              Compare invoice prices against PO rates, and track price movements per item over time.
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-widest text-neutral-500">Approver</div>
              <input
                value={requestedBy}
                onChange={(e) => setRequestedBy(e.target.value)}
                placeholder="Name"
                className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-violet-500/50 w-40"
              />
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-widest text-neutral-500">PIN</div>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="PIN"
                className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-violet-500/50 w-28"
              />
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-widest text-neutral-500">Market</div>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value as "dubai" | "manila")}
                className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-violet-500/50"
              >
                <option value="dubai">Dubai</option>
                <option value="manila">Manila</option>
              </select>
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
                : "border-neutral-700/50 bg-neutral-900/40 text-neutral-400 hover:border-rose-800/40 hover:bg-rose-950/20 hover:text-rose-300"
            }`}
          >
            <AlertTriangle className={`h-4 w-4 ${activeTab === "variance" ? "text-rose-400" : "text-neutral-500"}`} />
            ① Invoice vs PO Variance
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("changes")}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === "changes"
                ? "border-violet-600/60 bg-violet-900/30 text-violet-200 shadow-[0_0_12px_rgba(124,58,237,0.15)]"
                : "border-neutral-700/50 bg-neutral-900/40 text-neutral-400 hover:border-violet-800/40 hover:bg-violet-950/20 hover:text-violet-300"
            }`}
          >
            <TrendingUp className={`h-4 w-4 ${activeTab === "changes" ? "text-violet-400" : "text-neutral-500"}`} />
            ② Price Change History
          </button>
        </div>
      </section>

      {/* Tab content */}
      {activeTab === "variance" && (
        <PoVarianceTab city={city} requestedBy={requestedBy} pin={pin} />
      )}
      {activeTab === "changes" && (
        <PriceChangeTab city={city} requestedBy={requestedBy} pin={pin} />
      )}
    </div>
  );
}
