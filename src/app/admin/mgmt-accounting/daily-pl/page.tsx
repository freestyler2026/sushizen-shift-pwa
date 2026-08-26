"use client";

import { useEffect, useState, useCallback } from "react";
import { MgmtTabBar, DashboardLink } from "../MgmtTabs";
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
  food_cost_blockers?: { item: string; qty: number; reason: "no_recipe_cost" | "name_not_in_master" }[];
  overhead_carried_from?: Record<string, string>;
  days: DayRow[];
  summary: Summary & {
    revenue_filled?: number; filled_days?: number;
    revenue_day_coverage?: number; range_days?: number;
  };
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
      setData({ ok: false, error: "取得に失敗しました" } as PLData);
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
          : `✗ ${json.error || "更新に失敗しました"}`
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
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-400">Management Accounting</p>
          <DashboardLink />
        </div>
        <h1 className={T_PAGE_TITLE}>日次P&amp;L</h1>
        <p className="text-sm text-slate-500 mt-1">売上 ・ 原価 ・ 経費 ・ 利益</p>
      </div>

      {/* Same bar as the monthly views — this page is one of them, not a detour. */}
      <div className="mb-5">
        <MgmtTabBar active="daily" />
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
          <label className={KPI_LABEL}>開始日</label>
          <input type="date" value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="mt-1 block bg-[var(--bg-card)] border border-[var(--border)] rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className={KPI_LABEL}>終了日</label>
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

      {/* The flat-rate setting is only a fallback now — food cost comes from what
          sold. Warning on a zero rate fired even when COGS was computed fine. */}
      {data?.ok && data.food_cost_missing && data.food_cost_rate === 0 && (
        <div className="mb-4 bg-amber-900/30 border border-amber-700 rounded p-3 text-sm text-amber-300">
          ⚠ 一律レートが未設定です。{" "}
          <a href="/admin/mgmt-accounting/settings" className="underline">設定</a>{" "}
          → 「Compute Food Cost Rate」で登録できます。販売数×原価で算出できない場合の
          予備として使われます。
        </div>
      )}

      {/* ── Summary KPI cards ── */}
      {data?.ok && data.summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-5">
          {[
            { key: "gross",  label: "総売上",   value: data.summary.gross_sales },
            { key: "comm",   label: "手数料",   value: data.summary.commission },
            { key: "net",    label: "純売上",   value: data.summary.net_revenue },
            { key: "cogs",   label: "食材費",   value: data.summary.cogs },
            { key: "labor",  label: "人件費",   value: data.summary.labor },
            { key: "oh",     label: "経費",     value: data.summary.overhead },
            { key: "profit", label: "営業利益", value: data.summary.profit, highlight: true },
          ].map(card => (
            <div key={card.key} className={KPI_CARD}>
              <div className={KPI_LABEL}>{card.label}</div>
              <div className={`${KPI_VALUE} ${card.highlight ? profitColor(card.value) : ""}`}>
                {fmt(card.value, cur)}
              </div>
              {card.key === "profit" && data.summary.margin_pct !== null && (
                <div className={`text-xs mt-0.5 ${profitColor(data.summary.profit)}`}>
                  {fmtPct(data.summary.margin_pct)} 利益率
                </div>
              )}
              {card.key === "cogs" && (
                <div className="text-xs mt-0.5">
                  {data.food_cost_source === "item_sales" ? (
                    <span className="text-slate-500">
                      販売数×原価 ・ 売上の{data.food_cost_coverage_pct}%を計上
                    </span>
                  ) : data.food_cost_source === "flat_rate" ? (
                    <span className="text-amber-400">
                      一律{data.food_cost_rate_pct}% ― メニュー平均（販売実績ではありません）
                    </span>
                  ) : (
                    <span className="text-rose-400">未算出</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* The absolute profit here runs below the monthly page whenever revenue
          covers fewer days than cost. Say it rather than let them disagree. */}
      {data?.ok && (data.summary.revenue_day_coverage ?? 0) > 0
        && (data.summary.revenue_day_coverage ?? 0) < (data.summary.range_days ?? 0) && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 mb-4">
          <p className="text-sm font-semibold text-amber-300">売上データが期間の一部しかありません</p>
          <p className="text-xs text-amber-200/85 mt-1 leading-relaxed">
            {data.summary.range_days}日のうち、売上が記録されているのは
            {data.summary.revenue_day_coverage}日分です。人件費・家賃は全日分を計上しているため、
            <b className="text-amber-100">利益は実態より低く出ます</b>。
            {(data.summary.filled_days ?? 0) > 0 && (
              <> うち{data.summary.filled_days}日分は各店舗の日平均で補完しています。</>
            )}
            月単位の損益は「全社管理」タブをご覧ください。
          </p>
        </div>
      )}

      {/* Counted differently from the monthly page, on purpose — say so. */}
      <div className="rounded-xl border border-slate-600/50 bg-slate-700/20 px-4 py-3 mb-4">
        <p className="text-xs font-semibold text-slate-200 mb-1">このページが集計しているもの</p>
        <p className="text-xs text-slate-400 leading-relaxed">
          <b className="text-slate-300">売上</b>はPOSの計上額です。アグリゲーターの手数料を引く前の
          金額で、手数料は別行に表示しています。
          <b className="text-slate-300">食材費</b>は消費額で、販売数×レシピ原価に廃棄3%を加えたものです。
          <br />
          <b className="text-slate-300">全社管理</b>タブは別の基準で集計しています（入金額と、消費ではなく
          仕入額）。そのため合計は一致しませんが、どちらも誤りではありません。
        </p>
      </div>

      {/* A rate of zero produced a COGS of zero on every row, in silence.
          Say it instead of booking sales against no food cost. */}
      {data?.ok && data.food_cost_missing && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 mb-4">
          <p className="text-sm font-semibold text-rose-300">食材費が算出できません</p>
          <p className="text-xs text-rose-200/80 mt-1 leading-relaxed">
            販売された{data.food_cost_items_total}商品のうち、Cost Calculation に原価があるのは
            {data.food_cost_items_matched}商品のみです（販売数の{data.food_cost_coverage_pct}%）。
            食材費が0なのは実際に0だったからではなく、算出できないためです。
            Cost Calculation › Products で原価を登録してください。
          </p>
        </div>
      )}
      {data?.ok && !data.food_cost_missing && (data.food_cost_coverage_pct ?? 100) < 95 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 mb-4">
          <p className="text-xs text-amber-200/90 leading-relaxed">
            食材費は販売数の{data.food_cost_coverage_pct}%をカバーしています
            （{data.food_cost_items_total}商品中{data.food_cost_items_matched}商品に原価あり）。
            残りは同じ原価率で運営されているものとして計算しています。
          </p>
          {(data.food_cost_blockers?.length ?? 0) > 0 && (
            <div className="mt-2 pt-2 border-t border-amber-500/20">
              <p className="text-[11px] uppercase tracking-wider text-amber-300/70 mb-1">
                Biggest sellers not priced
              </p>
              <div className="space-y-0.5">
                {data.food_cost_blockers!.slice(0, 6).map((b) => (
                  <div key={b.item} className="flex items-baseline gap-2 text-xs text-amber-100/85">
                    <span className="tabular-nums text-amber-300/80 w-14 text-right">
                      {b.qty.toLocaleString()}
                    </span>
                    <span className="flex-1 truncate">{b.item}</span>
                    <span className="text-[11px] text-amber-300/70 whitespace-nowrap">
                      {b.reason === "name_not_in_master"
                        ? "Cost Calculation に該当名なし"
                        : "原価未設定"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {data?.ok && data.overhead_carried_from
        && Object.keys(data.overhead_carried_from).length > 0 && (
        <div className="rounded-xl border border-slate-600/50 bg-slate-700/20 px-4 py-2.5 mb-4">
          <p className="text-xs text-slate-300">
            固定費は{" "}
            {Array.from(new Set(Object.values(data.overhead_carried_from))).join(", ")} —
            から引き継いでいます（当月分は未登録）。
          </p>
        </div>
      )}

      {/* ── View mode tabs ── */}
      {data?.ok && (
        <div className={`${TAB_CONTAINER} mb-4 w-fit`}>
          <button className={viewMode === "summary" ? TAB_ACTIVE : TAB_INACTIVE}
            onClick={() => setViewMode("summary")}>サマリー</button>
          <button className={viewMode === "detail" ? TAB_ACTIVE : TAB_INACTIVE}
            onClick={() => setViewMode("detail")}>日別明細</button>
        </div>
      )}

      {/* ── Loading / Error ── */}
      {loading && (
        <div className="text-center py-12 text-slate-400">Loading P&amp;L data…</div>
      )}
      {!loading && data && !data.ok && (
        <div className="text-center py-12 text-red-400">
          {data.error ?? "日次P&Lの読み込みに失敗しました"}
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
              <th className="text-left py-2 pr-3">店舗</th>
              <th className="text-right py-2 px-3">総売上</th>
              <th className="text-right py-2 px-3">手数料</th>
              <th className="text-right py-2 px-3">純売上</th>
              <th className="text-right py-2 px-3">食材費</th>
              <th className="text-right py-2 px-3">人件費</th>
              <th className="text-right py-2 px-3">経費</th>
              <th className="text-right py-2 px-3 font-semibold">利益</th>
              <th className="text-right py-2 pl-3">利益率</th>
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
            <span className="text-xs text-slate-600 italic">キャッシュにデータがありません</span>
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
                    <span className="text-slate-600 italic text-xs">売上なし</span>
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
                      <p className="text-xs text-slate-500 mb-1">プラットフォーム内訳</p>
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
