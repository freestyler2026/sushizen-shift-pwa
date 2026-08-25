"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  GLASS_CARD, KPI_CARD, KPI_LABEL, KPI_VALUE,
  T_PAGE_TITLE, T_SECTION, SMALL_BUTTON, PRIMARY_BUTTON,
  TAB_ACTIVE, TAB_INACTIVE, TAB_CONTAINER,
  BADGE_SUCCESS, BADGE_WARNING,
} from "@/lib/ui-tokens";
import { getAuth } from "@/lib/auth";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PlatformData {
  platform: string;
  gross_sales: number;
  commission: number;
  net_revenue: number;
  is_estimated: boolean;
  currency: string;
}

interface StoreDay {
  store_code: string;
  gross_sales: number;
  commission: number;
  net_revenue: number;
  cogs: number;
  labor: number;
  overhead: number;
  profit: number;
  margin_pct: number | null;
  is_confirmed: boolean;
  currency: string;
  platforms: PlatformData[];
}

interface DayTotal {
  gross_sales: number;
  commission: number;
  net_revenue: number;
  cogs: number;
  labor: number;
  overhead: number;
  profit: number;
}

interface DayRow {
  date: string;
  stores: StoreDay[];
  total: DayTotal;
}

interface Summary {
  gross_sales: number;
  commission: number;
  net_revenue: number;
  cogs: number;
  labor: number;
  overhead: number;
  profit: number;
  margin_pct: number | null;
}

interface PLData {
  ok: boolean;
  city: string;
  date_from: string;
  date_to: string;
  currency: string;
  food_cost_rate: number;
  food_cost_rate_pct: number;
  food_cost_source?: "item_sales" | "flat_rate" | "none";
  food_cost_missing?: boolean;
  food_cost_coverage_pct?: number;
  food_cost_items_matched?: number;
  food_cost_items_total?: number;
  days: DayRow[];
  summary: Summary;
  error?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number, currency: string) =>
  `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const fmtPct = (n: number | null) =>
  n === null ? "—" : `${n.toFixed(1)}%`;

const profitColor = (n: number) =>
  n > 0 ? "text-emerald-400" : n < 0 ? "text-red-400" : "text-slate-400";

const today = () => {
  const d = new Date();
  return d.toISOString().slice(0, 10);
};

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

// ─── Platform label map ───────────────────────────────────────────────────────

const PLATFORM_LABEL: Record<string, string> = {
  talabat: "Talabat",
  careem: "Careem",
  noon: "Noon",
  keeta: "Keeta",
  smiles: "Smiles",
  grab: "Grab",
  grabfood: "Grab",
  foodpanda: "FoodPanda",
};

const platformLabel = (p: string) =>
  PLATFORM_LABEL[p.toLowerCase()] ?? p;

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DailyPLPage() {
  const router = useRouter();
  const [city, setCity] = useState<"dubai" | "manila">("dubai");
  const [dateFrom, setDateFrom] = useState(daysAgo(7));
  const [dateTo, setDateTo] = useState(daysAgo(1));
  const [data, setData] = useState<PLData | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedStores, setExpandedStores] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"summary" | "detail">("summary");
  const [refreshMsg, setRefreshMsg] = useState("");

  // Auth guard
  useEffect(() => {
    const auth = getAuth();
    if (!auth) { router.push("/"); return; }
    const r = auth.role;
    if (!["ADMIN","HQ","MANILA_MANAGEMENT","DUBAI_MANAGEMENT"].includes(r)) {
      router.push("/week");
    }
  }, [router]);

  const fetchPL = useCallback(async () => {
    setLoading(true);
    setData(null);
    try {
      const res = await fetch(
        `/api/admin/mgmt/daily-pl?city=${city}&date_from=${dateFrom}&date_to=${dateTo}`
      );
      const json = await res.json();
      setData(json);
    } catch {
      setData({ ok: false, error: "Fetch failed" } as PLData);
    } finally {
      setLoading(false);
    }
  }, [city, dateFrom, dateTo]);

  useEffect(() => { fetchPL(); }, [fetchPL]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshMsg("");
    try {
      const res = await fetch("/api/admin/mgmt/daily-pl/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, date_from: dateFrom, date_to: dateTo }),
      });
      const json = await res.json();
      setRefreshMsg(
        json.ok
          ? `✓ Refreshed: ${json.payouts_processed} payouts → ${json.records_written} day records`
          : `✗ ${json.error || "Refresh failed"}`
      );
      if (json.ok) await fetchPL();
    } finally {
      setRefreshing(false);
    }
  };

  const toggleStore = (key: string) => {
    setExpandedStores(prev => {
      const s = new Set(prev);
      s.has(key) ? s.delete(key) : s.add(key);
      return s;
    });
  };

  const cur = data?.currency ?? (city === "dubai" ? "AED" : "PHP");

  // ─── Quick range presets ────────────────────────────────────────────────────
  const applyPreset = (days: number) => {
    setDateFrom(daysAgo(days));
    setDateTo(daysAgo(1));
  };

  return (
    <div className="min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)] p-4 md:p-6 max-w-[1400px] mx-auto">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h1 className={T_PAGE_TITLE}>Daily P&amp;L</h1>
        <span className="text-slate-500 text-sm mt-1">Delivery Revenue · COGS · Overhead · Profit</span>
      </div>

      {/* ── Controls ── */}
      <div className={`${GLASS_CARD} mb-5 flex flex-wrap gap-3 items-end`}>
        {/* City */}
        <div>
          <label className={KPI_LABEL}>City</label>
          <div className={`${TAB_CONTAINER} mt-1`}>
            {(["dubai","manila"] as const).map(c => (
              <button key={c}
                className={city === c ? TAB_ACTIVE : TAB_INACTIVE}
                onClick={() => setCity(c)}
              >
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Date range */}
        <div>
          <label className={KPI_LABEL}>From</label>
          <input type="date" value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="mt-1 block bg-[var(--bg-card)] border border-[var(--border)] rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className={KPI_LABEL}>To</label>
          <input type="date" value={dateTo}
            max={today()}
            onChange={e => setDateTo(e.target.value)}
            className="mt-1 block bg-[var(--bg-card)] border border-[var(--border)] rounded px-2 py-1 text-sm"
          />
        </div>

        {/* Presets */}
        <div className="flex gap-1 flex-wrap">
          {[
            { label: "Yesterday", days: 1 },
            { label: "7 days", days: 7 },
            { label: "14 days", days: 14 },
            { label: "30 days", days: 30 },
          ].map(p => (
            <button key={p.days} onClick={() => applyPreset(p.days)}
              className={SMALL_BUTTON}>{p.label}</button>
          ))}
        </div>

        {/* Refresh */}
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={handleRefresh} disabled={refreshing}
            className={`${SMALL_BUTTON} ${refreshing ? "opacity-50" : ""}`}>
            {refreshing ? "Refreshing…" : "⟳ Sync Payouts"}
          </button>
        </div>
      </div>

      {refreshMsg && (
        <div className={`mb-4 text-xs px-3 py-2 rounded ${refreshMsg.startsWith("✓") ? "bg-emerald-900/30 text-emerald-300" : "bg-red-900/30 text-red-300"}`}>
          {refreshMsg}
        </div>
      )}

      {/* ── Food cost rate notice ── */}
      {data?.ok && data.food_cost_rate === 0 && (
        <div className="mb-4 bg-amber-900/30 border border-amber-700 rounded p-3 text-sm text-amber-300">
          ⚠ Food cost rate not computed. Go to{" "}
          <a href="/admin/mgmt-accounting/settings" className="underline">Settings</a>{" "}
          → &ldquo;Compute Food Cost Rate&rdquo; to auto-calculate from Cost Calculation master.
          COGS is shown as 0 until this is set.
        </div>
      )}

      {/* ── Summary KPI cards ── */}
      {data?.ok && data.summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-5">
          {[
            { label: "Gross Revenue", value: data.summary.gross_sales },
            { label: "Commission", value: data.summary.commission },
            { label: "Net Revenue", value: data.summary.net_revenue },
            { label: "COGS", value: data.summary.cogs },
            { label: "Labor", value: data.summary.labor },
            { label: "Overhead", value: data.summary.overhead },
            { label: "Operating Profit", value: data.summary.profit, highlight: true },
          ].map(card => (
            <div key={card.label} className={KPI_CARD}>
              <div className={KPI_LABEL}>{card.label}</div>
              <div className={`${KPI_VALUE} ${card.highlight ? profitColor(card.value) : ""}`}>
                {fmt(card.value, cur)}
              </div>
              {card.label === "Operating Profit" && data.summary.margin_pct !== null && (
                <div className={`text-xs mt-0.5 ${profitColor(data.summary.profit)}`}>
                  {fmtPct(data.summary.margin_pct)} margin
                </div>
              )}
              {card.label === "COGS" && (
                <div className="text-xs mt-0.5">
                  {data.food_cost_source === "item_sales" ? (
                    <span className="text-slate-500">
                      From items sold · {data.food_cost_coverage_pct}% of sales costed
                    </span>
                  ) : data.food_cost_source === "flat_rate" ? (
                    <span className="text-amber-400">
                      Flat {data.food_cost_rate_pct}% — menu average, not items sold
                    </span>
                  ) : (
                    <span className="text-rose-400">Not calculated</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* A rate of zero produced a COGS of zero on every row, in silence.
          Say it instead of booking sales against no food cost. */}
      {data?.ok && data.food_cost_missing && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 mb-4">
          <p className="text-sm font-semibold text-rose-300">Food cost not calculated</p>
          <p className="text-xs text-rose-200/80 mt-1 leading-relaxed">
            Only {data.food_cost_items_matched} of {data.food_cost_items_total} items sold have a
            cost in Cost Calculation — {data.food_cost_coverage_pct}% of quantity sold. COGS is
            shown as zero because it cannot be computed, not because there was none. Enter
            recipe costs under Cost Calculation › Products.
          </p>
        </div>
      )}
      {data?.ok && !data.food_cost_missing && data.food_cost_source === "item_sales"
        && (data.food_cost_coverage_pct ?? 0) < 80 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 mb-4">
          <p className="text-xs text-amber-200/90 leading-relaxed">
            Food cost covers {data.food_cost_coverage_pct}% of quantity sold
            ({data.food_cost_items_matched} of {data.food_cost_items_total} items costed).
            The uncosted items are assumed to run at the same rate.
          </p>
        </div>
      )}

      {/* ── View mode tabs ── */}
      {data?.ok && (
        <div className={`${TAB_CONTAINER} mb-4 w-fit`}>
          <button className={viewMode === "summary" ? TAB_ACTIVE : TAB_INACTIVE}
            onClick={() => setViewMode("summary")}>Summary</button>
          <button className={viewMode === "detail" ? TAB_ACTIVE : TAB_INACTIVE}
            onClick={() => setViewMode("detail")}>Daily Detail</button>
        </div>
      )}

      {/* ── Loading / Error ── */}
      {loading && (
        <div className="text-center py-12 text-slate-400">Loading P&amp;L data…</div>
      )}
      {!loading && data && !data.ok && (
        <div className="text-center py-12 text-red-400">
          {data.error ?? "Failed to load P&L"}
        </div>
      )}
      {!loading && data?.ok && data.days.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          No revenue data in cache for this range.<br />
          Click <strong>⟳ Sync Payouts</strong> to distribute settlements into daily records.
        </div>
      )}

      {/* ── Summary view: aggregated per-store table ── */}
      {!loading && data?.ok && viewMode === "summary" && data.days.length > 0 && (
        <StoreSummaryTable data={data} cur={cur} />
      )}

      {/* ── Detail view: day-by-day ── */}
      {!loading && data?.ok && viewMode === "detail" && data.days.length > 0 && (
        <div className="space-y-4">
          {data.days.map(day => (
            <DayCard key={day.date} day={day} cur={cur}
              expandedStores={expandedStores} toggleStore={toggleStore} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Summary Table ────────────────────────────────────────────────────────────

function StoreSummaryTable({ data, cur }: { data: PLData; cur: string }) {
  // Aggregate across all days per store
  const storeMap: Record<string, {
    gross_sales: number; commission: number; net_revenue: number;
    cogs: number; labor: number; overhead: number; profit: number;
    platforms: Record<string, number>;
  }> = {};

  for (const day of data.days) {
    for (const store of day.stores) {
      if (!storeMap[store.store_code]) {
        storeMap[store.store_code] = {
          gross_sales: 0, commission: 0, net_revenue: 0,
          cogs: 0, labor: 0, overhead: 0, profit: 0, platforms: {},
        };
      }
      const s = storeMap[store.store_code];
      s.gross_sales += store.gross_sales;
      s.commission += store.commission;
      s.net_revenue += store.net_revenue;
      s.cogs += store.cogs;
      s.labor += store.labor;
      s.overhead += store.overhead;
      s.profit += store.profit;
      for (const plat of store.platforms) {
        s.platforms[plat.platform] = (s.platforms[plat.platform] ?? 0) + plat.gross_sales;
      }
    }
  }

  const stores = Object.entries(storeMap).sort((a, b) => b[1].profit - a[1].profit);

  return (
    <div className={GLASS_CARD}>
      <p className={`${T_SECTION} mb-3`}>
        Store Summary — {data.date_from} → {data.date_to}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-slate-400 text-xs">
              <th className="text-left py-2 pr-3">Store</th>
              <th className="text-right py-2 px-3">Gross Revenue</th>
              <th className="text-right py-2 px-3">Commission</th>
              <th className="text-right py-2 px-3">Net Revenue</th>
              <th className="text-right py-2 px-3">COGS</th>
              <th className="text-right py-2 px-3">Labor</th>
              <th className="text-right py-2 px-3">Overhead</th>
              <th className="text-right py-2 px-3 font-semibold">Profit</th>
              <th className="text-right py-2 pl-3">Margin</th>
            </tr>
          </thead>
          <tbody>
            {stores.map(([storeCode, s]) => {
              const margin = s.net_revenue > 0
                ? (s.profit / s.net_revenue * 100)
                : null;
              return (
                <tr key={storeCode}
                  className="border-b border-[var(--border)]/50 hover:bg-[var(--bg-card)]/50">
                  <td className="py-2 pr-3">
                    <div className="font-medium">{storeCode}</div>
                    <div className="text-xs text-slate-500 space-x-1">
                      {Object.entries(s.platforms)
                        .sort((a, b) => b[1] - a[1])
                        .map(([p, amt]) => (
                          <span key={p}>{platformLabel(p)} {Math.round(amt / s.gross_sales * 100)}%</span>
                        ))}
                    </div>
                  </td>
                  <td className="text-right py-2 px-3">{fmt(s.gross_sales, cur)}</td>
                  <td className="text-right py-2 px-3 text-red-400">({fmt(s.commission, cur)})</td>
                  <td className="text-right py-2 px-3">{fmt(s.net_revenue, cur)}</td>
                  <td className="text-right py-2 px-3 text-amber-400">({fmt(s.cogs, cur)})</td>
                  <td className="text-right py-2 px-3 text-amber-400">({fmt(s.labor, cur)})</td>
                  <td className="text-right py-2 px-3 text-amber-400">({fmt(s.overhead, cur)})</td>
                  <td className={`text-right py-2 px-3 font-semibold ${profitColor(s.profit)}`}>
                    {fmt(s.profit, cur)}
                  </td>
                  <td className={`text-right py-2 pl-3 ${profitColor(s.profit)}`}>
                    {fmtPct(margin)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--border)] font-semibold text-slate-300">
              <td className="py-2 pr-3">Total</td>
              <td className="text-right py-2 px-3">{fmt(data.summary.gross_sales, cur)}</td>
              <td className="text-right py-2 px-3 text-red-400">({fmt(data.summary.commission, cur)})</td>
              <td className="text-right py-2 px-3">{fmt(data.summary.net_revenue, cur)}</td>
              <td className="text-right py-2 px-3 text-amber-400">({fmt(data.summary.cogs, cur)})</td>
              <td className="text-right py-2 px-3 text-amber-400">({fmt(data.summary.labor, cur)})</td>
              <td className="text-right py-2 px-3 text-amber-400">({fmt(data.summary.overhead, cur)})</td>
              <td className={`text-right py-2 px-3 ${profitColor(data.summary.profit)}`}>
                {fmt(data.summary.profit, cur)}
              </td>
              <td className={`text-right py-2 pl-3 ${profitColor(data.summary.profit)}`}>
                {fmtPct(data.summary.margin_pct)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Day Card ─────────────────────────────────────────────────────────────────

function DayCard({
  day, cur, expandedStores, toggleStore,
}: {
  day: DayRow;
  cur: string;
  expandedStores: Set<string>;
  toggleStore: (key: string) => void;
}) {
  const dayLabel = new Date(day.date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });

  const hasRevenue = day.stores.some(s => s.gross_sales > 0);

  return (
    <div className={GLASS_CARD}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-200">{day.date}</span>
          <span className="text-slate-500 text-sm">{dayLabel}</span>
          {!hasRevenue && (
            <span className="text-xs text-slate-600 italic">No data in cache</span>
          )}
        </div>
        {hasRevenue && (
          <div className={`text-sm font-semibold ${profitColor(day.total.profit)}`}>
            {fmt(day.total.profit, cur)}
            <span className="text-slate-500 font-normal ml-1 text-xs">
              {day.total.net_revenue > 0
                ? `${(day.total.profit / day.total.net_revenue * 100).toFixed(1)}% margin`
                : ""}
            </span>
          </div>
        )}
      </div>

      {hasRevenue && (
        <div className="space-y-2">
          {day.stores.map(store => {
            const key = `${day.date}-${store.store_code}`;
            const expanded = expandedStores.has(key);
            const hasData = store.gross_sales > 0;

            return (
              <div key={key}
                className="bg-[var(--bg-card)]/40 rounded-lg border border-[var(--border)]/50">
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left"
                  onClick={() => hasData && toggleStore(key)}
                >
                  <span className="font-medium w-36 shrink-0">{store.store_code}</span>
                  {!hasData ? (
                    <span className="text-slate-600 italic text-xs">No revenue</span>
                  ) : (
                    <>
                      <div className="flex gap-4 flex-wrap text-xs text-slate-400">
                        <span>Gross <strong className="text-slate-300">{fmt(store.gross_sales, cur)}</strong></span>
                        <span>Net <strong className="text-slate-300">{fmt(store.net_revenue, cur)}</strong></span>
                        {store.cogs > 0 && <span className="text-amber-500">COGS ({fmt(store.cogs, cur)})</span>}
                        {(store.labor > 0 || store.overhead > 0) && (
                          <span className="text-amber-500">
                            Fixed ({fmt(store.labor + store.overhead, cur)})
                          </span>
                        )}
                      </div>
                      <span className={`ml-auto font-semibold text-sm ${profitColor(store.profit)}`}>
                        {fmt(store.profit, cur)}
                      </span>
                      {!store.is_confirmed && (
                        <span className={`${BADGE_WARNING} text-xs ml-1`}>推計</span>
                      )}
                      <span className="text-slate-600 ml-1">{expanded ? "▲" : "▼"}</span>
                    </>
                  )}
                </button>

                {expanded && hasData && (
                  <div className="px-3 pb-3 border-t border-[var(--border)]/50">
                    {/* Platform breakdown */}
                    <div className="mt-2">
                      <p className="text-xs text-slate-500 mb-1">Platform breakdown</p>
                      <div className="space-y-1">
                        {store.platforms.map(plat => (
                          <div key={plat.platform}
                            className="flex items-center justify-between text-xs px-2 py-1 bg-[var(--bg-card)]/60 rounded">
                            <span className="text-slate-400 w-28">
                              {platformLabel(plat.platform)}
                              {plat.is_estimated && (
                                <span className="ml-1 text-amber-500">推計</span>
                              )}
                            </span>
                            <span className="text-slate-300">{fmt(plat.gross_sales, cur)}</span>
                            <span className="text-red-400">-{fmt(plat.commission, cur)}</span>
                            <span className="font-medium">{fmt(plat.net_revenue, cur)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* P&L breakdown */}
                    <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      {[
                        { label: "COGS", value: -store.cogs, note: "Food cost" },
                        { label: "Labor", value: -store.labor, note: store.labor === 0 ? "Not entered" : undefined },
                        { label: "Overhead", value: -store.overhead, note: store.overhead === 0 ? "Not entered" : undefined },
                        { label: "Profit", value: store.profit, bold: true },
                      ].map(row => (
                        <div key={row.label}
                          className="bg-[var(--bg-card)]/40 rounded px-2 py-1">
                          <div className="text-slate-500">{row.label}</div>
                          <div className={`font-medium ${row.bold ? profitColor(store.profit) : row.value < 0 ? "text-amber-400" : "text-slate-300"}`}>
                            {row.value !== 0 ? fmt(Math.abs(row.value), cur) : "—"}
                          </div>
                          {row.note && <div className="text-slate-600">{row.note}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
