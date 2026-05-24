"use client";

import { AlertCircle, AlertTriangle, BarChart2, RefreshCw, Search, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson, procurementTokenHeaders } from "@/lib/procurementClient";

// ── Types ─────────────────────────────────────────────────────────────────────

type MonthlySpend = {
  month: string;
  supplier_name: string;
  total_amount: number;
  currency: string;
};

type ConcentrationRow = {
  supplier_name: string;
  total_amount: number;
  pct_of_market: number;
  currency: string;
  is_concentrated: boolean;
};

type MomChange = {
  supplier_name: string;
  this_month: number;
  last_month: number;
  pct_change: number;
  currency: string;
  is_spike: boolean;
};

type SpendSummary = {
  monthly: MonthlySpend[];
  concentration: ConcentrationRow[];
  mom_changes: MomChange[];
  market_total_90d: number;
  market: string;
};

type BenchmarkRow = {
  item_description: string;
  dubai_avg: number;
  manila_avg: number;
  dubai_currency: string;
  manila_currency: string;
  unit: string;
  data_points: number;
};

// ── Phase 5: New vendor / item types (for week digest) ────────────────────────
type NewSupplierRow = { supplier_name: string; first_invoice_date: string; invoice_no: string; amount: number; currency: string };
type NewItemRow = { item_description: string; supplier_name: string; first_invoice_date: string; unit_price: number | null; unit: string; currency: string };
type ReappearedRow = { supplier_name: string; last_seen_before: string; latest_invoice_date: string; invoice_no: string };
type VendorAlertSummary = {
  new_suppliers: NewSupplierRow[];
  new_items: NewItemRow[];
  reappeared_suppliers: ReappearedRow[];
  counts: { new_suppliers: number; new_items: number; reappeared_suppliers: number; total: number };
  week_digest: { new_suppliers_this_week: NewSupplierRow[]; new_items_this_week: NewItemRow[] };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtDec(amount: number): string {
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 });
}

// Palette for up to 12 suppliers — violet/emerald/sky/amber/rose/teal/indigo/orange/lime/pink
const PALETTE = [
  "bg-violet-500", "bg-emerald-500", "bg-sky-500", "bg-amber-500",
  "bg-rose-500", "bg-teal-500", "bg-indigo-400", "bg-orange-500",
  "bg-lime-500", "bg-pink-500", "bg-cyan-500", "bg-yellow-500",
];
const PALETTE_TEXT = [
  "text-violet-300", "text-emerald-300", "text-sky-300", "text-amber-300",
  "text-rose-300", "text-teal-300", "text-indigo-300", "text-orange-300",
  "text-lime-300", "text-pink-300", "text-cyan-300", "text-yellow-300",
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProcurementIntelligencePage() {
  const defaultAuth = getAuth();
  const defaultCity: "dubai" | "manila" = String(defaultAuth?.city || "").toLowerCase() === "dubai" ? "dubai" : "manila";

  const [allowed, setAllowed] = useState(false);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [city, setCity] = useState<"dubai" | "manila">(defaultCity);
  const [monthsBack, setMonthsBack] = useState(6);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [spendData, setSpendData] = useState<SpendSummary | null>(null);
  const [benchmarkRows, setBenchmarkRows] = useState<BenchmarkRow[]>([]);
  const [benchmarkSearch, setBenchmarkSearch] = useState("");
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  const [vendorData, setVendorData] = useState<VendorAlertSummary | null>(null);
  const [vendorLoading, setVendorLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ market: city, months_back: String(monthsBack) });
      const data = await procurementJson<SpendSummary & { ok?: boolean }>(
        `/api/admin/procurement/analytics/supplier-invoices/spend-summary?${qs.toString()}`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      setSpendData({
        monthly: Array.isArray(data?.monthly) ? data.monthly : [],
        concentration: Array.isArray(data?.concentration) ? data.concentration : [],
        mom_changes: Array.isArray(data?.mom_changes) ? data.mom_changes : [],
        market_total_90d: Number(data?.market_total_90d || 0),
        market: city,
      });
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [city, monthsBack, pin, requestedBy]);

  const loadBenchmark = useCallback(async (search: string) => {
    setBenchmarkLoading(true);
    try {
      const qs = new URLSearchParams({ item_search: search, top_n: "40" });
      const data = await procurementJson<{ ok?: boolean; rows?: BenchmarkRow[] }>(
        `/api/admin/procurement/analytics/supplier-invoices/cross-market-benchmark?${qs.toString()}`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      setBenchmarkRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch {
      setBenchmarkRows([]);
    } finally {
      setBenchmarkLoading(false);
    }
  }, [pin, requestedBy]);

  const loadVendor = useCallback(async () => {
    setVendorLoading(true);
    try {
      const qs = new URLSearchParams({ market: city });
      const data = await procurementJson<Partial<VendorAlertSummary> & { ok?: boolean }>(
        `/api/admin/procurement/analytics/supplier-invoices/new-vendor-alerts?${qs.toString()}`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      setVendorData({
        new_suppliers:        Array.isArray(data?.new_suppliers)        ? (data.new_suppliers as NewSupplierRow[])        : [],
        new_items:            Array.isArray(data?.new_items)            ? (data.new_items as NewItemRow[])                : [],
        reappeared_suppliers: Array.isArray(data?.reappeared_suppliers) ? (data.reappeared_suppliers as ReappearedRow[])  : [],
        counts: {
          new_suppliers:        Number(data?.counts?.new_suppliers        || 0),
          new_items:            Number(data?.counts?.new_items            || 0),
          reappeared_suppliers: Number(data?.counts?.reappeared_suppliers || 0),
          total:                Number(data?.counts?.total                || 0),
        },
        week_digest: {
          new_suppliers_this_week: Array.isArray(data?.week_digest?.new_suppliers_this_week) ? (data.week_digest.new_suppliers_this_week as NewSupplierRow[]) : [],
          new_items_this_week:     Array.isArray(data?.week_digest?.new_items_this_week)     ? (data.week_digest.new_items_this_week     as NewItemRow[])     : [],
        },
      });
    } catch {
      setVendorData(null);
    } finally {
      setVendorLoading(false);
    }
  }, [city, pin, requestedBy]);

  useEffect(() => {
    async function init() {
      const currentAuth = getAuth();
      const refreshed = await refreshAuthFromApi(currentAuth);
      const nextCity: "dubai" | "manila" = String((refreshed || currentAuth)?.city || "").toLowerCase() === "dubai" ? "dubai" : "manila";
      const can = canAccessProcurementAdmin(String((refreshed || currentAuth)?.role || ""), nextCity);
      setAllowed(can);
      if (can) setCity(nextCity);
    }
    void init();
  }, []);

  useEffect(() => {
    if (!allowed) return;
    void load();
  }, [allowed, load]);

  useEffect(() => {
    if (!allowed) return;
    void loadBenchmark("");
  }, [allowed, loadBenchmark]);

  useEffect(() => {
    if (!allowed) return;
    void loadVendor();
  }, [allowed, loadVendor]);

  // ── Derived chart data ──────────────────────────────────────────────────────

  // Unique months descending → ascending for chart
  const months = useMemo(() => {
    const set = new Set<string>();
    for (const r of (spendData?.monthly ?? [])) set.add(r.month);
    return Array.from(set).sort();
  }, [spendData]);

  // Top 10 suppliers by total spend
  const topSuppliers = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const r of (spendData?.monthly ?? [])) {
      totals[r.supplier_name] = (totals[r.supplier_name] || 0) + r.total_amount;
    }
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name]) => name);
  }, [spendData]);

  // Matrix: supplier → month → amount
  const spendMatrix = useMemo(() => {
    const m: Record<string, Record<string, number>> = {};
    for (const r of (spendData?.monthly ?? [])) {
      if (!topSuppliers.includes(r.supplier_name)) continue;
      if (!m[r.supplier_name]) m[r.supplier_name] = {};
      m[r.supplier_name][r.month] = r.total_amount;
    }
    return m;
  }, [spendData, topSuppliers]);

  // Monthly totals (for bar scale)
  const monthlyTotals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const month of months) {
      t[month] = topSuppliers.reduce((sum, s) => sum + (spendMatrix[s]?.[month] || 0), 0);
    }
    return t;
  }, [months, topSuppliers, spendMatrix]);

  const maxMonthlyTotal = useMemo(() => Math.max(...Object.values(monthlyTotals), 1), [monthlyTotals]);

  const currency = city === "dubai" ? "AED" : "PHP";

  if (!allowed) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Intelligence is only available to authorized procurement admin roles.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && <div className="rounded-2xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">{error}</div>}

      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[168px] flex-1 xl:w-52 xl:flex-none">
            <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Approver</div>
            <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Approver name" className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500/50" />
          </div>
          <div className="min-w-[132px] xl:w-36 xl:flex-none">
            <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">PIN</div>
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500/50" />
          </div>
          <div className="min-w-[124px] xl:w-32 xl:flex-none">
            <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Market</div>
            <select value={city} onChange={(e) => setCity(e.target.value === "dubai" ? "dubai" : "manila")} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500/50">
              <option value="manila">Manila</option>
              <option value="dubai">Dubai</option>
            </select>
          </div>
          <div className="xl:w-36 xl:flex-none">
            <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Period</div>
            <select value={monthsBack} onChange={(e) => setMonthsBack(Number(e.target.value))} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500/50">
              <option value={3}>3 months</option>
              <option value={6}>6 months</option>
              <option value={12}>12 months</option>
            </select>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-w-[110px] items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/6 px-3 py-2.5 text-sm hover:bg-white/5 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Section 1: Supplier Concentration ────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center gap-2 mb-4">
          <BarChart2 className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-semibold text-white">Supplier Concentration</span>
          <span className="text-xs text-zinc-500">— last 90 days</span>
          {spendData?.concentration.some((r) => r.is_concentrated) && (
            <span className="ml-auto rounded-full border border-rose-700/60 bg-rose-900/25 px-2 py-0.5 text-[10px] font-bold text-rose-300">
              HIGH CONCENTRATION RISK
            </span>
          )}
        </div>

        {spendData?.market_total_90d ? (
          <>
            <div className="mb-3 text-xs text-zinc-400">
              Total market spend (90d): <span className="font-semibold text-white">{fmt(spendData.market_total_90d, currency)}</span>
            </div>
            <div className="space-y-2">
              {(spendData?.concentration ?? []).map((row, idx) => {
                const barPct = Math.min(row.pct_of_market, 100);
                const colorClass = PALETTE[idx % PALETTE.length];
                const textClass = PALETTE_TEXT[idx % PALETTE_TEXT.length];
                return (
                  <div key={row.supplier_name}>
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-xs font-medium ${textClass} truncate max-w-[200px]`}>{row.supplier_name}</span>
                        {row.is_concentrated && (
                          <span className="shrink-0 rounded border border-rose-700/50 bg-rose-900/20 px-1 py-0.5 text-[9px] font-bold text-rose-400">⚠ {row.pct_of_market.toFixed(0)}%</span>
                        )}
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <span className="text-xs text-white">{row.pct_of_market.toFixed(1)}%</span>
                        <span className="ml-2 text-[11px] text-zinc-500">{fmt(row.total_amount, row.currency)}</span>
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                      <div className={`h-full rounded-full ${colorClass} opacity-80`} style={{ width: `${barPct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="text-sm text-zinc-500">{loading ? "Loading..." : "No data for the last 90 days."}</div>
        )}
      </div>

      {/* ── Section 2: Monthly Spend Chart ───────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-semibold text-white">Monthly Spend by Supplier</span>
          <span className="text-xs text-zinc-500">— last {monthsBack} months</span>
        </div>

        {/* Legend */}
        {topSuppliers.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4 mt-2">
            {topSuppliers.map((name, idx) => (
              <button
                key={name}
                type="button"
                onClick={() => setSelectedSupplier(selectedSupplier === name ? null : name)}
                className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] transition ${selectedSupplier === null || selectedSupplier === name ? "opacity-100" : "opacity-30"} border-white/10 bg-white/5 hover:bg-white/10`}
              >
                <span className={`inline-block h-2 w-2 rounded-full ${PALETTE[idx % PALETTE.length]}`} />
                <span className={PALETTE_TEXT[idx % PALETTE_TEXT.length]}>{name}</span>
              </button>
            ))}
          </div>
        )}

        {months.length > 0 ? (
          <div className="overflow-x-auto">
            <div className="min-w-[480px]">
              {/* Bars */}
              <div className="flex items-end gap-2 h-48">
                {months.map((month) => {
                  const total = monthlyTotals[month] || 0;
                  const heightPct = total / maxMonthlyTotal;
                  const displaySuppliers = selectedSupplier ? [selectedSupplier] : topSuppliers;
                  return (
                    <div key={month} className="flex-1 flex flex-col items-center gap-0.5">
                      <div className="w-full flex flex-col-reverse justify-start" style={{ height: "180px" }}>
                        <div className="w-full flex flex-col-reverse" style={{ height: `${Math.round(heightPct * 180)}px` }}>
                          {displaySuppliers.map((name, idx) => {
                            const amount = spendMatrix[name]?.[month] || 0;
                            if (!amount) return null;
                            const supplierPct = amount / Math.max(total, 1);
                            return (
                              <div
                                key={name}
                                title={`${name}: ${fmt(amount, currency)}`}
                                className={`w-full ${PALETTE[topSuppliers.indexOf(name) % PALETTE.length]} opacity-80`}
                                style={{ height: `${Math.round(supplierPct * heightPct * 180)}px`, minHeight: amount > 0 ? "2px" : "0" }}
                              />
                            );
                          })}
                        </div>
                      </div>
                      <div className="text-[10px] text-zinc-600 text-center">{month.slice(5)}</div>
                      <div className="text-[10px] text-zinc-500 text-center">{fmt(total, currency).replace(/[^0-9KMB.]/g, "").replace(/000$/, "K")}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-zinc-500">{loading ? "Loading..." : "No monthly data available."}</div>
        )}

        {/* Detailed table for selected supplier */}
        {selectedSupplier && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/3 overflow-x-auto">
            <div className="px-3 py-2 text-xs font-semibold text-white border-b border-white/5">{selectedSupplier} — monthly breakdown</div>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="px-3 py-1.5 text-left font-normal text-zinc-500">Month</th>
                  <th className="px-3 py-1.5 text-right font-normal text-zinc-500">Amount</th>
                </tr>
              </thead>
              <tbody>
                {[...months].reverse().map((month) => {
                  const amount = spendMatrix[selectedSupplier]?.[month] || 0;
                  return (
                    <tr key={month} className="border-b border-white/5 hover:bg-white/3">
                      <td className="px-3 py-1.5 text-zinc-400">{month}</td>
                      <td className="px-3 py-1.5 text-right text-white">{amount > 0 ? fmt(amount, currency) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Section 3: Month-over-Month Changes ──────────────────────────── */}
      {(spendData?.mom_changes ?? []).length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-semibold text-white">Month-over-Month Spend Change</span>
            <span className="text-xs text-zinc-500">— this month vs last month</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-white/10 text-zinc-500">
                  <th className="px-3 py-2 text-left font-normal">Supplier</th>
                  <th className="px-3 py-2 text-right font-normal">Last Month</th>
                  <th className="px-3 py-2 text-right font-normal">This Month</th>
                  <th className="px-3 py-2 text-right font-normal">Change</th>
                </tr>
              </thead>
              <tbody>
                {(spendData?.mom_changes ?? []).map((row) => (
                  <tr key={row.supplier_name} className="border-b border-white/5 hover:bg-white/3">
                    <td className="px-3 py-2 font-medium text-white">{row.supplier_name}</td>
                    <td className="px-3 py-2 text-right text-zinc-400">{fmt(row.last_month, row.currency)}</td>
                    <td className="px-3 py-2 text-right text-zinc-300">{fmt(row.this_month, row.currency)}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={`font-semibold ${row.pct_change > 30 ? "text-rose-400" : row.pct_change > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                        {row.pct_change > 0 ? "+" : ""}{row.pct_change.toFixed(1)}%
                        {row.is_spike && <span className="ml-1 text-[10px]">⚠</span>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Section 5: New Vendor & Item Radar ──────────────────────────────── */}
      <div className="rounded-2xl border border-violet-900/40 bg-violet-950/10 p-5">
        <div className="flex items-center gap-2 mb-4">
          <AlertCircle className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-semibold text-white">New Vendor &amp; Item Radar</span>
          <span className="text-xs text-zinc-500">— last 30 days</span>
          {vendorLoading && <RefreshCw className="h-3.5 w-3.5 text-zinc-500 animate-spin ml-auto" />}
          {vendorData && vendorData.counts.total > 0 && (
            <span className="ml-auto rounded-full border border-violet-700/60 bg-violet-900/30 px-2 py-0.5 text-[10px] font-bold text-violet-300">
              {vendorData.counts.total} new signals
            </span>
          )}
        </div>

        {/* Week digest summary */}
        {(vendorData?.week_digest.new_suppliers_this_week.length ?? 0) + (vendorData?.week_digest.new_items_this_week.length ?? 0) > 0 ? (
          <div className="mb-4 rounded-xl border border-violet-700/40 bg-violet-900/15 p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-violet-400 mb-2">This Week</div>
            <div className="flex flex-wrap gap-2">
              {vendorData!.week_digest.new_suppliers_this_week.map((s, idx) => (
                <span key={idx} className="rounded-full border border-violet-700/50 bg-violet-900/30 px-2.5 py-1 text-[11px] text-violet-200">
                  ✦ {s.supplier_name}
                  <span className="ml-1 text-violet-500 text-[9px]">NEW SUPPLIER</span>
                </span>
              ))}
              {vendorData!.week_digest.new_items_this_week.map((item, idx) => (
                <span key={idx} className="rounded-full border border-indigo-700/50 bg-indigo-900/30 px-2.5 py-1 text-[11px] text-indigo-200">
                  {item.item_description}
                  <span className="ml-1 text-indigo-500 text-[9px]">{item.supplier_name}</span>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {/* Full 30-day listings */}
        {vendorData && vendorData.counts.total > 0 ? (
          <div className="space-y-4">
            {/* New Suppliers */}
            {vendorData.new_suppliers.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-violet-300 mb-2">New Suppliers ({vendorData.new_suppliers.length})</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-white/5 text-zinc-500">
                        <th className="px-3 py-1.5 text-left font-normal">Supplier</th>
                        <th className="px-3 py-1.5 text-left font-normal">Invoice</th>
                        <th className="px-3 py-1.5 text-left font-normal">First Invoice Date</th>
                        <th className="px-3 py-1.5 text-right font-normal">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vendorData.new_suppliers.map((s, idx) => (
                        <tr key={idx} className="border-b border-white/5 hover:bg-white/3">
                          <td className="px-3 py-1.5 font-medium text-white">{s.supplier_name}</td>
                          <td className="px-3 py-1.5 text-zinc-500">#{s.invoice_no}</td>
                          <td className="px-3 py-1.5 text-zinc-400">{s.first_invoice_date?.slice(0, 10)}</td>
                          <td className="px-3 py-1.5 text-right text-zinc-300">{s.amount > 0 ? `${s.currency} ${Number(s.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* New Items */}
            {vendorData.new_items.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-indigo-300 mb-2">New Items from Existing Suppliers ({vendorData.new_items.length})</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-white/5 text-zinc-500">
                        <th className="px-3 py-1.5 text-left font-normal">Item</th>
                        <th className="px-3 py-1.5 text-left font-normal">Supplier</th>
                        <th className="px-3 py-1.5 text-left font-normal">First Seen</th>
                        <th className="px-3 py-1.5 text-right font-normal">Unit Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vendorData.new_items.map((item, idx) => (
                        <tr key={idx} className="border-b border-white/5 hover:bg-white/3">
                          <td className="px-3 py-1.5 font-medium text-white max-w-[200px] truncate">{item.item_description}</td>
                          <td className="px-3 py-1.5 text-zinc-400">{item.supplier_name}</td>
                          <td className="px-3 py-1.5 text-zinc-500">{item.first_invoice_date?.slice(0, 10)}</td>
                          <td className="px-3 py-1.5 text-right text-zinc-300">
                            {item.unit_price !== null && item.unit_price !== undefined ? `${item.currency} ${Number(item.unit_price).toFixed(2)}/${item.unit || "unit"}` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Reappeared Suppliers */}
            {vendorData.reappeared_suppliers.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-sky-300 mb-2">Reappeared Suppliers ({vendorData.reappeared_suppliers.length})</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-white/5 text-zinc-500">
                        <th className="px-3 py-1.5 text-left font-normal">Supplier</th>
                        <th className="px-3 py-1.5 text-left font-normal">Invoice</th>
                        <th className="px-3 py-1.5 text-left font-normal">Last Seen Before</th>
                        <th className="px-3 py-1.5 text-left font-normal">Latest Invoice</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vendorData.reappeared_suppliers.map((s, idx) => (
                        <tr key={idx} className="border-b border-white/5 hover:bg-white/3">
                          <td className="px-3 py-1.5 font-medium text-white">{s.supplier_name}</td>
                          <td className="px-3 py-1.5 text-zinc-500">#{s.invoice_no}</td>
                          <td className="px-3 py-1.5 text-zinc-400">{s.last_seen_before?.slice(0, 10)}</td>
                          <td className="px-3 py-1.5 text-zinc-300">{s.latest_invoice_date?.slice(0, 10)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-zinc-500">
            {vendorLoading ? "Loading..." : "No new suppliers or items detected in the last 30 days."}
          </div>
        )}
      </div>

      {/* ── Section 4: Dubai ↔ Manila Price Benchmark ────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Search className="h-4 w-4 text-sky-400" />
          <span className="text-sm font-semibold text-white">Dubai ↔ Manila Price Benchmark</span>
          <span className="text-xs text-zinc-500">— avg unit price, last 90 days</span>
        </div>
        <div className="flex gap-2 mb-4">
          <input
            value={benchmarkSearch}
            onChange={(e) => setBenchmarkSearch(e.target.value)}
            placeholder="Search item name..."
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-sky-500/50"
            onKeyDown={(e) => { if (e.key === "Enter") void loadBenchmark(benchmarkSearch); }}
          />
          <button
            type="button"
            onClick={() => void loadBenchmark(benchmarkSearch)}
            disabled={benchmarkLoading}
            className="inline-flex items-center gap-2 rounded-xl border border-sky-700/50 bg-sky-900/20 px-3 py-2 text-sm text-sky-200 hover:bg-sky-800/30 disabled:opacity-60"
          >
            <Search className={`h-3.5 w-3.5 ${benchmarkLoading ? "animate-pulse" : ""}`} />
            Search
          </button>
        </div>
        {benchmarkRows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-white/10 text-zinc-500">
                  <th className="px-3 py-2 text-left font-normal">Item</th>
                  <th className="px-3 py-2 text-right font-normal">Dubai avg</th>
                  <th className="px-3 py-2 text-right font-normal">Manila avg</th>
                  <th className="px-3 py-2 text-center font-normal">Unit</th>
                  <th className="px-3 py-2 text-right font-normal">Data pts</th>
                </tr>
              </thead>
              <tbody>
                {benchmarkRows.map((row, idx) => (
                  <tr key={idx} className="border-b border-white/5 hover:bg-white/3">
                    <td className="px-3 py-2 font-medium text-white max-w-[200px] truncate">{row.item_description}</td>
                    <td className="px-3 py-2 text-right text-sky-300">{row.dubai_currency} {fmtDec(row.dubai_avg)}</td>
                    <td className="px-3 py-2 text-right text-emerald-300">{row.manila_currency} {fmtDec(row.manila_avg)}</td>
                    <td className="px-3 py-2 text-center text-zinc-500">{row.unit || "—"}</td>
                    <td className="px-3 py-2 text-right text-zinc-600">{row.data_points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-sm text-zinc-500">
            {benchmarkLoading ? "Loading..." : "Items that appear in both Dubai and Manila invoices (last 90 days) will be shown here."}
          </div>
        )}
      </div>
    </div>
  );
}
