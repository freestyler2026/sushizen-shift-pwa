"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  GLASS_CARD, KPI_CARD, KPI_LABEL, KPI_VALUE,
  T_PAGE_TITLE, T_SECTION, SMALL_BUTTON, PRIMARY_BUTTON,
  TAB_ACTIVE, TAB_INACTIVE, TAB_CONTAINER,
  BADGE_WARNING, BADGE_ERROR, BADGE_SUCCESS, BADGE_INFO,
} from "@/lib/ui-tokens";
import { getAuth } from "@/lib/auth";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CostSummary {
  year_month: string;
  city: string;
  store_code: string;
  currency: string;
  revenue: number;
  revenue_source: "manual" | "ar_payouts" | "none";
  revenue_ar_total: number;
  food_cost: number;
  labor_cost: number;
  overhead_total: number;
  prime_cost: number;
  total_cost: number;
  food_cost_rate: number | null;
  labor_cost_rate: number | null;
  prime_cost_rate: number | null;
  total_cost_rate: number | null;
  food_by_store: { store_code: string; amount: number }[];
  overhead_by_category: { category: string; amount: number }[];
  budget: Record<string, number>;
  budget_vs_actual: {
    food: { actual: number; budget: number; variance: number };
    labor: { actual: number; budget: number; variance: number };
    overhead: { actual: number; budget: number; variance: number };
  };
}

interface TrendMonth {
  year_month: string;
  food_cost: number;
  labor_cost: number;
  overhead: number;
  prime_cost: number;
  revenue: number;
  prime_cost_rate: number | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DUBAI_STORES = ["", "AM", "AB", "JLT", "BB", "ARJ", "JJAD_AM", "JJAD_JLT", "RZ_ARJ", "RZ_BB"];
const MANILA_STORES = ["", "CUB", "BER", "MOA", "MKT", "QC", "CEB"];

function fmtAmt(v: number, cur = "AED") {
  return `${cur} ${v.toLocaleString("en", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function fmtRate(v: number | null) {
  return v != null ? `${v.toFixed(1)}%` : "—";
}
function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function prevMonths(n: number): string[] {
  const result: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    result.unshift(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() - 1);
  }
  return result;
}

function variantCls(variance: number) {
  if (variance > 0) return "text-rose-400";
  if (variance < 0) return "text-emerald-400";
  return "text-zinc-400";
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function MgmtAccountingPage() {
  const router = useRouter();
  const [city, setCity] = useState("dubai");
  const [storeCode, setStoreCode] = useState("");
  const [yearMonth, setYearMonth] = useState(thisMonth());
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [trend, setTrend] = useState<TrendMonth[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const monthOptions = prevMonths(12);
  const storeOptions = city === "dubai" ? DUBAI_STORES : MANILA_STORES;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const auth = getAuth();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (auth?.accessToken) headers.Authorization = `Bearer ${auth.accessToken}`;

      const qs = new URLSearchParams({ city, year_month: yearMonth });
      if (storeCode) qs.set("store_code", storeCode);

      const [sumRes, trendRes] = await Promise.all([
        fetch(`/api/admin/mgmt/cost-summary?${qs}`, { headers }),
        fetch(`/api/admin/mgmt/cost-trend?city=${city}&months=6${storeCode ? `&store_code=${storeCode}` : ""}`, { headers }),
      ]);

      if (!sumRes.ok) throw new Error(`Cost summary: ${sumRes.status}`);
      if (!trendRes.ok) throw new Error(`Cost trend: ${trendRes.status}`);

      const sumData = await sumRes.json();
      const trendData = await trendRes.json();
      setSummary(sumData);
      setTrend(trendData.months || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [city, storeCode, yearMonth]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const cur = summary?.currency || (city === "dubai" ? "AED" : "PHP");

  return (
    <div className="min-h-screen p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-400 mb-1">Management Accounting</p>
          <h1 className={T_PAGE_TITLE}>Cost Intelligence</h1>
          <p className="text-sm text-zinc-500 mt-1">Food Cost · Labor Cost · Prime Cost — by city &amp; store</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => router.push("/admin/mgmt-accounting/cost-detail")}
            className={SMALL_BUTTON}>Cost Detail ›</button>
          <button onClick={() => router.push("/admin/mgmt-accounting/settings")}
            className={SMALL_BUTTON}>Settings ›</button>
        </div>
      </div>

      {/* Filters */}
      <div className={`${GLASS_CARD} p-4 flex flex-wrap gap-3`}>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">City</label>
          <select value={city} onChange={e => { setCity(e.target.value); setStoreCode(""); }}
            className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white">
            <option value="dubai">Dubai</option>
            <option value="manila">Manila</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Store</label>
          <select value={storeCode} onChange={e => setStoreCode(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white">
            <option value="">All Stores</option>
            {storeOptions.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Month</label>
          <select value={yearMonth} onChange={e => setYearMonth(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white">
            {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button onClick={fetchData} className={PRIMARY_BUTTON} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
        {summary?.revenue_source === "none" && (
          <div className="flex items-end">
            <span className={BADGE_WARNING}>No revenue — enter in Settings or sync AR Payouts</span>
          </div>
        )}
      </div>

      {error && (
        <div className={`${GLASS_CARD} p-4 border-rose-500/30`}>
          <p className="text-sm text-rose-400">{error}</p>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <div className={KPI_CARD}>
          <div className="flex items-center justify-between mb-0.5">
            <p className={KPI_LABEL}>Revenue</p>
            {summary && (
              summary.revenue_source === "ar_payouts"
                ? <span className={BADGE_SUCCESS} style={{fontSize: "9px", padding: "1px 6px"}}>AR Payouts</span>
                : summary.revenue_source === "manual"
                  ? <span className={BADGE_INFO} style={{fontSize: "9px", padding: "1px 6px"}}>Manual</span>
                  : <span className={BADGE_WARNING} style={{fontSize: "9px", padding: "1px 6px"}}>Not set</span>
            )}
          </div>
          <p className={KPI_VALUE}>{summary ? fmtAmt(summary.revenue, cur) : "—"}</p>
          <p className="text-xs text-zinc-600 mt-1">
            {summary?.revenue_source === "ar_payouts"
              ? "Auto from delivery platforms"
              : summary?.revenue_source === "manual"
                ? "Manually entered"
                : "Enter in Settings or sync AR Payouts"}
          </p>
        </div>
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>Food Cost</p>
          <p className={`${KPI_VALUE} text-amber-300`}>{summary ? fmtAmt(summary.food_cost, cur) : "—"}</p>
          <p className="text-xs text-zinc-500 mt-1">Rate: {fmtRate(summary?.food_cost_rate ?? null)}</p>
        </div>
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>Labor Cost</p>
          <p className={`${KPI_VALUE} text-blue-300`}>{summary ? fmtAmt(summary.labor_cost, cur) : "—"}</p>
          <p className="text-xs text-zinc-500 mt-1">Rate: {fmtRate(summary?.labor_cost_rate ?? null)}</p>
        </div>
        <div className={`${KPI_CARD} border-violet-500/20`}>
          <p className={KPI_LABEL}>Prime Cost</p>
          <p className={`${KPI_VALUE} text-violet-300`}>{summary ? fmtAmt(summary.prime_cost, cur) : "—"}</p>
          <p className="text-xs text-zinc-500 mt-1">Rate: {fmtRate(summary?.prime_cost_rate ?? null)}</p>
        </div>
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>Overhead</p>
          <p className={`${KPI_VALUE} text-zinc-300`}>{summary ? fmtAmt(summary.overhead_total, cur) : "—"}</p>
          <p className="text-xs text-zinc-500 mt-1">Rent, utilities, etc.</p>
        </div>
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>Total Cost</p>
          <p className={`${KPI_VALUE} text-rose-300`}>{summary ? fmtAmt(summary.total_cost, cur) : "—"}</p>
          <p className="text-xs text-zinc-500 mt-1">Rate: {fmtRate(summary?.total_cost_rate ?? null)}</p>
        </div>
      </div>

      {/* Budget vs Actual */}
      {summary && (
        <div className={`${GLASS_CARD} p-5`}>
          <h2 className={`${T_SECTION} mb-4`}>Budget vs Actual</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-white/8">
                  <th className="pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Category</th>
                  <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Budget</th>
                  <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Actual</th>
                  <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Variance</th>
                </tr>
              </thead>
              <tbody>
                {(["food", "labor", "overhead"] as const).map(cat => {
                  const bva = summary.budget_vs_actual[cat];
                  return (
                    <tr key={cat} className="border-t border-white/5">
                      <td className="py-3 text-zinc-300 capitalize">{cat === "food" ? "Food Cost" : cat === "labor" ? "Labor Cost" : "Overhead"}</td>
                      <td className="py-3 text-right font-mono text-zinc-400">{fmtAmt(bva.budget, cur)}</td>
                      <td className="py-3 text-right font-mono text-white">{fmtAmt(bva.actual, cur)}</td>
                      <td className={`py-3 text-right font-mono font-semibold ${variantCls(bva.variance)}`}>
                        {bva.variance > 0 ? "+" : ""}{fmtAmt(bva.variance, cur)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {Object.values(summary.budget).every(v => v === 0) && (
            <p className="text-xs text-zinc-600 mt-3">No budgets set — enter budgets in Settings.</p>
          )}
        </div>
      )}

      {/* Trend Table */}
      {trend.length > 0 && (
        <div className={`${GLASS_CARD} p-5`}>
          <h2 className={`${T_SECTION} mb-4`}>6-Month Trend</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-white/8">
                  <th className="pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Month</th>
                  <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Revenue</th>
                  <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Food Cost</th>
                  <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Labor</th>
                  <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Prime Cost</th>
                  <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Prime %</th>
                </tr>
              </thead>
              <tbody>
                {trend.map(m => (
                  <tr key={m.year_month} className={`border-t border-white/5 ${m.year_month === yearMonth ? "bg-violet-500/8" : ""}`}>
                    <td className="py-2.5 text-zinc-300 font-medium">{m.year_month}</td>
                    <td className="py-2.5 text-right font-mono text-zinc-400">{m.revenue > 0 ? fmtAmt(m.revenue, cur) : "—"}</td>
                    <td className="py-2.5 text-right font-mono text-amber-300">{fmtAmt(m.food_cost, cur)}</td>
                    <td className="py-2.5 text-right font-mono text-blue-300">{fmtAmt(m.labor_cost, cur)}</td>
                    <td className="py-2.5 text-right font-mono text-violet-300">{fmtAmt(m.prime_cost, cur)}</td>
                    <td className="py-2.5 text-right font-mono text-zinc-300">{fmtRate(m.prime_cost_rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Overhead by Category */}
      {summary && summary.overhead_by_category.length > 0 && (
        <div className={`${GLASS_CARD} p-5`}>
          <h2 className={`${T_SECTION} mb-4`}>Overhead Breakdown</h2>
          <div className="space-y-2">
            {summary.overhead_by_category.map(o => (
              <div key={o.category} className="flex items-center justify-between py-2 border-b border-white/5">
                <span className="text-sm text-zinc-300">{o.category}</span>
                <span className="text-sm font-mono text-zinc-200">{fmtAmt(o.amount, cur)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Food by Store */}
      {summary && summary.food_by_store.length > 1 && (
        <div className={`${GLASS_CARD} p-5`}>
          <h2 className={`${T_SECTION} mb-4`}>Food Cost by Store</h2>
          <div className="space-y-2">
            {summary.food_by_store.map(s => (
              <div key={s.store_code} className="flex items-center justify-between py-2 border-b border-white/5">
                <span className="text-sm font-mono text-zinc-300">{s.store_code}</span>
                <span className="text-sm font-mono text-amber-300">{fmtAmt(s.amount, cur)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
