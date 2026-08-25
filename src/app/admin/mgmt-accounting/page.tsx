"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { MgmtTabBar, DashboardLink } from "./MgmtTabs";
import {
  GLASS_CARD, KPI_CARD, KPI_LABEL, KPI_VALUE,
  T_PAGE_TITLE, T_SECTION, SMALL_BUTTON, PRIMARY_BUTTON,
  TAB_ACTIVE, TAB_INACTIVE, TAB_CONTAINER,
  BADGE_SUCCESS, BADGE_INFO, BADGE_WARNING,
} from "@/lib/ui-tokens";
import { getAuth } from "@/lib/auth";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CostSummary {
  year_month: string; city: string; store_code: string; currency: string;
  revenue: number; revenue_source: "manual" | "ar_payouts" | "none"; revenue_ar_total: number;
  food_cost: number; food_source?: "proc_requests" | "manual_excel" | string;
  labor_cost: number; labor_source?: "payroll" | "estimated_shifts" | "manual_excel" | "none"; overhead_total: number;
  prime_cost: number; total_cost: number;
  food_cost_rate: number | null; labor_cost_rate: number | null;
  prime_cost_rate: number | null; total_cost_rate: number | null;
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
  year_month: string; food_cost: number; labor_cost: number;
  overhead: number; prime_cost: number; revenue: number; prime_cost_rate: number | null;
}

interface NativeCity {
  currency: string; revenue: number; food_cost: number; labor_cost?: number;
  revenue_source: "manual" | "ar_payouts" | "none";
  food_source?: "proc_requests" | "manual_excel" | string;
  labor_source?: "payroll" | "estimated_shifts" | "manual_excel" | "none";
}
interface CityData {
  revenue: number; food_cost: number; labor_cost: number; overhead_total: number;
  prime_cost: number; total_cost: number;
  food_cost_rate: number | null; prime_cost_rate: number | null;
  overhead_missing?: boolean;
  overhead_carried_from?: string | null;
  partial_month?: boolean;
  days_covered?: number;
  days_in_month?: number;
  revenue_days?: number;
  revenue_incomplete?: boolean;
  revenue_estimated?: number;
  estimate_detail?: {
    through?: string; days_elapsed?: number; days_in_month?: number;
    by_platform?: { platform: string; missing_days: number; daily_avg: number;
                    estimated: number; basis: string }[];
  };
  native: NativeCity;
}
interface GroupData {
  revenue: number; food_cost: number; labor_cost: number; overhead_total: number;
  prime_cost: number; total_cost: number;
  food_cost_rate: number | null; labor_cost_rate: number | null;
  prime_cost_rate: number | null; total_cost_rate: number | null;
}
interface GroupSummary {
  year_month: string; fx_rates: { AED_JPY: number; PHP_JPY: number };
  dubai: CityData; manila: CityData; group: GroupData;
}
interface StoreRow {
  city: string; store_code: string; currency: string;
  revenue: number; food_cost: number; food_cost_rate: number | null;
  revenue_source: "manual" | "ar_payouts" | "none";
}
interface StoreRanking { year_month: string; stores: StoreRow[]; }
interface KpiAlert {
  city: string; severity: "warning" | "critical"; type: string; title: string; message: string;
}
interface AlertData { year_month: string; alerts: KpiAlert[]; alert_count: number; }
interface GroupTarget {
  year_month: string; city: string;
  food_cost_rate_target: number | null; prime_cost_rate_target: number | null; notes: string;
}
interface Prediction {
  city: string; next_month: string | null; based_on_months: number;
  predictions: {
    food_cost: number | null; revenue: number | null;
    food_cost_trend: "up" | "down" | "flat";
  } | null;
  error: string | null;
}
interface ExecReport {
  year_month: string; generated_at: string;
  group: GroupSummary;
  store_ranking: { year_month: string; stores: StoreRow[] };
  alerts: { year_month: string; alerts: KpiAlert[]; alert_count: number };
  predictions: { dubai: Prediction; manila: Prediction };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DUBAI_STORES = ["AM", "AB", "JLT", "BB", "ARJ", "JJAD_AM", "JJAD_JLT", "RZ_ARJ", "RZ_BB"];
const MANILA_STORES = ["CUB", "BER", "MOA", "MKT", "QC", "CEB"];

const fmtJpy = (v: number) => `¥${Math.round(v).toLocaleString("en")}`;
const fmtNat = (v: number, cur: string) => `${cur} ${Math.round(v).toLocaleString("en")}`;

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
  const r: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    r.unshift(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() - 1);
  }
  return r;
}
function foodRateCls(v: number | null) {
  if (v == null) return "";
  if (v > 35) return "text-rose-400";
  if (v > 28) return "text-amber-400";
  return "text-emerald-400";
}
function primeRateCls(v: number | null) {
  if (v == null) return "";
  if (v > 65) return "text-rose-400";
  if (v > 55) return "text-amber-400";
  return "text-emerald-400";
}
function variantCls(v: number) {
  if (v > 0) return "text-rose-400";
  if (v < 0) return "text-emerald-400";
  return "text-zinc-400";
}

function getHeaders() {
  const auth = getAuth();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (auth?.accessToken) h.Authorization = `Bearer ${auth.accessToken}`;
  return h;
}

// ─── Tab: Cost Intelligence ───────────────────────────────────────────────────

function CostIntelligenceTab({ yearMonth }: { yearMonth: string }) {
  const router = useRouter();
  const [city, setCity] = useState("dubai");
  const [storeCode, setStoreCode] = useState("");
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [trend, setTrend] = useState<TrendMonth[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const storeOptions = city === "dubai" ? DUBAI_STORES : MANILA_STORES;

  const fetchData = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const h = getHeaders();
      const qs = new URLSearchParams({ city, year_month: yearMonth });
      if (storeCode) qs.set("store_code", storeCode);
      const [sumRes, trendRes] = await Promise.all([
        fetch(`/api/admin/mgmt/cost-summary?${qs}`, { headers: h }),
        fetch(`/api/admin/mgmt/cost-trend?city=${city}&months=6${storeCode ? `&store_code=${storeCode}` : ""}`, { headers: h }),
      ]);
      if (!sumRes.ok) throw new Error(`Cost summary: ${sumRes.status}`);
      if (!trendRes.ok) throw new Error(`Cost trend: ${trendRes.status}`);
      setSummary(await sumRes.json());
      const td = await trendRes.json();
      setTrend(td.months || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [city, storeCode, yearMonth]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const cur = summary?.currency || (city === "dubai" ? "AED" : "PHP");

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className={`${GLASS_CARD} p-4 flex flex-wrap gap-3 items-end`}>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">都市</label>
          <select value={city} onChange={e => { setCity(e.target.value); setStoreCode(""); }}
            className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white">
            <option value="dubai">ドバイ</option>
            <option value="manila">マニラ</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">店舗</label>
          <select value={storeCode} onChange={e => setStoreCode(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white">
            <option value="">全店舗</option>
            {storeOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <button onClick={fetchData} className={PRIMARY_BUTTON} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
        <div className="ml-auto flex gap-2">
          <button onClick={() => router.push("/admin/mgmt-accounting/daily-pl")} className={SMALL_BUTTON}>Daily P&amp;L ›</button>
          <button onClick={() => router.push("/admin/mgmt-accounting/cost-detail")} className={SMALL_BUTTON}>Cost Detail ›</button>
          <button onClick={() => router.push("/admin/mgmt-accounting/settings")} className={SMALL_BUTTON}>Settings ›</button>
        </div>
        {summary?.revenue_source === "none" && (
          <span className={BADGE_WARNING}>No revenue — enter in Settings or sync AR Payouts</span>
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
            <p className={KPI_LABEL}>売上</p>
            {summary && (
              summary.revenue_source === "ar_payouts"
                ? <span className={BADGE_SUCCESS} style={{ fontSize: "9px", padding: "1px 6px" }}>入金データ</span>
                : summary.revenue_source === "manual"
                  ? <span className={BADGE_INFO} style={{ fontSize: "9px", padding: "1px 6px" }}>手入力</span>
                  : (summary.revenue_source as string) === "sales_data_input"
                    ? <span className={BADGE_SUCCESS} style={{ fontSize: "9px", padding: "1px 6px" }}>日次売上入力</span>
                    : <span className={BADGE_WARNING} style={{ fontSize: "9px", padding: "1px 6px" }}>未設定</span>
            )}
          </div>
          <p className={KPI_NUM}>{summary ? fmtAmt(summary.revenue, cur) : "—"}</p>
          <p className="text-xs text-zinc-600 mt-1">
            {summary?.revenue_source === "ar_payouts"
              ? "Auto from delivery platforms"
              : summary?.revenue_source === "manual"
                ? "Manually entered"
                : (summary?.revenue_source as string) === "sales_data_input"
                  ? "Auto from daily sales data"
                  : "Enter in Settings or sync AR Payouts"}
          </p>
        </div>
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>食材費</p>
          <div className="flex items-center gap-2">
            <p className={`${KPI_NUM} text-amber-300`}>{summary ? fmtAmt(summary.food_cost, cur) : "—"}</p>
            {summary?.food_source === "manual_excel" && (
              <span className="text-xs bg-violet-500/20 text-violet-300 border border-violet-500/30 rounded px-1.5 py-0.5">Excel</span>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-1">Rate: {fmtRate(summary?.food_cost_rate ?? null)}</p>
        </div>
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>人件費</p>
          <div className="flex items-center gap-2">
            <p className={`${KPI_NUM} text-blue-300`}>{summary ? fmtAmt(summary.labor_cost, cur) : "—"}</p>
            {summary?.labor_source === "estimated_shifts" && (
              <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded px-1.5 py-0.5">推定</span>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            {summary?.labor_source === "estimated_shifts" ? "Estimated from shifts · Rate: " : "Rate: "}
            {fmtRate(summary?.labor_cost_rate ?? null)}
          </p>
        </div>
        <div className={`${KPI_CARD} border-violet-500/20`}>
          <p className={KPI_LABEL}>プライム計</p>
          <p className={`${KPI_NUM} text-violet-300`}>{summary ? fmtAmt(summary.prime_cost, cur) : "—"}</p>
          <p className="text-xs text-zinc-500 mt-1">Rate: {fmtRate(summary?.prime_cost_rate ?? null)}</p>
        </div>
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>経費</p>
          <p className={`${KPI_NUM} text-zinc-300`}>{summary ? fmtAmt(summary.overhead_total, cur) : "—"}</p>
          <p className="text-xs text-zinc-500 mt-1">Rent, utilities, etc.</p>
        </div>
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>総コスト</p>
          <p className={`${KPI_NUM} text-rose-300`}>{summary ? fmtAmt(summary.total_cost, cur) : "—"}</p>
          <p className="text-xs text-zinc-500 mt-1">Rate: {fmtRate(summary?.total_cost_rate ?? null)}</p>
        </div>
      </div>

      {/* Budget vs Actual */}
      {summary && (
        <div className={`${GLASS_CARD} p-5`}>
          <h2 className={`${T_SECTION} mb-4`}>予算 対 実績</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-white/8">
                  <th className="pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">費目</th>
                  <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500">予算</th>
                  <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500">実績</th>
                  <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500">差異</th>
                </tr>
              </thead>
              <tbody>
                {(["food", "labor", "overhead"] as const).map(cat => {
                  const bva = summary.budget_vs_actual[cat];
                  return (
                    <tr key={cat} className="border-t border-white/5">
                      <td className="py-3 text-zinc-300 capitalize">
                        {cat === "food" ? "Food Cost" : cat === "labor" ? "Labor Cost" : "Overhead"}
                      </td>
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

      {/* 6-Month Trend */}
      {trend.length > 0 && (
        <div className={`${GLASS_CARD} p-5`}>
          <h2 className={`${T_SECTION} mb-4`}>6-Month Trend</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-white/8">
                  <th className="pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">対象月</th>
                  <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500">売上</th>
                  <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500">食材費</th>
                  <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500">人件費</th>
                  <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500">プライム計</th>
                  <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500">プライム率</th>
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
          <h2 className={`${T_SECTION} mb-4`}>経費内訳</h2>
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
          <h2 className={`${T_SECTION} mb-4`}>店舗別 食材費</h2>
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

// ─── Tab: Group Management ────────────────────────────────────────────────────

function GroupManagementTab({ yearMonth }: { yearMonth: string }) {
  const router = useRouter();
  const [summary, setSummary] = useState<GroupSummary | null>(null);
  const [ranking, setRanking] = useState<StoreRanking | null>(null);
  const [alerts, setAlerts] = useState<AlertData | null>(null);
  const [dubaiPred, setDubaiPred] = useState<Prediction | null>(null);
  const [manilaPred, setManilaPred] = useState<Prediction | null>(null);
  const [dubaiTarget, setDubaiTarget] = useState<GroupTarget | null>(null);
  const [manilaTarget, setManilaTarget] = useState<GroupTarget | null>(null);
  const [dubaiFoodTarget, setDubaiFoodTarget] = useState("");
  const [dubaiPrimeTarget, setDubaiPrimeTarget] = useState("");
  const [manilaFoodTarget, setManilaFoodTarget] = useState("");
  const [manilaPrimeTarget, setManilaPrimeTarget] = useState("");
  const [aedJpy, setAedJpy] = useState("40.50");
  const [phpJpy, setPhpJpy] = useState("2.55");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [savingFx, setSavingFx] = useState(false);
  const [fxMsg, setFxMsg] = useState("");
  const [savingTargets, setSavingTargets] = useState(false);
  const [targetMsg, setTargetMsg] = useState("");
  const [pushingAlerts, setPushingAlerts] = useState(false);
  const [pushMsg, setPushMsg] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const h = getHeaders();
      const [gRes, rRes, aRes, dpRes, mpRes, tRes] = await Promise.all([
        fetch(`/api/admin/mgmt/group-summary?year_month=${yearMonth}`, { headers: h }),
        fetch(`/api/admin/mgmt/store-ranking?year_month=${yearMonth}`, { headers: h }),
        fetch(`/api/admin/mgmt/kpi-alerts?year_month=${yearMonth}`, { headers: h }),
        fetch(`/api/admin/mgmt/trend-prediction?city=dubai&months=6`, { headers: h }),
        fetch(`/api/admin/mgmt/trend-prediction?city=manila&months=6`, { headers: h }),
        fetch(`/api/admin/mgmt/group-targets?year_month=${yearMonth}`, { headers: h }),
      ]);
      if (!gRes.ok) throw new Error(`Group summary: ${gRes.status}`);
      if (!rRes.ok) throw new Error(`Store ranking: ${rRes.status}`);
      const g: GroupSummary = await gRes.json();
      const r: StoreRanking = await rRes.json();
      setSummary(g);
      setRanking(r);
      if (g.fx_rates) {
        setAedJpy(g.fx_rates.AED_JPY.toFixed(2));
        setPhpJpy(g.fx_rates.PHP_JPY.toFixed(2));
      }
      if (aRes.ok)  setAlerts(await aRes.json());
      if (dpRes.ok) setDubaiPred(await dpRes.json());
      if (mpRes.ok) setManilaPred(await mpRes.json());
      if (tRes.ok) {
        const tData = await tRes.json();
        const targets: GroupTarget[] = tData.targets || [];
        const dt = targets.find(t => t.city === "dubai") || null;
        const mt = targets.find(t => t.city === "manila") || null;
        setDubaiTarget(dt);
        setManilaTarget(mt);
        setDubaiFoodTarget(dt?.food_cost_rate_target?.toString() ?? "");
        setDubaiPrimeTarget(dt?.prime_cost_rate_target?.toString() ?? "");
        setManilaFoodTarget(mt?.food_cost_rate_target?.toString() ?? "");
        setManilaPrimeTarget(mt?.prime_cost_rate_target?.toString() ?? "");
        setPushMsg("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [yearMonth]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function saveFxRates() {
    setSavingFx(true); setFxMsg("");
    try {
      const h = getHeaders();
      await Promise.all([
        fetch("/api/admin/mgmt/fx-rates", {
          method: "POST", headers: h,
          body: JSON.stringify({ year_month: yearMonth, currency_from: "AED", currency_to: "JPY", rate: parseFloat(aedJpy) }),
        }),
        fetch("/api/admin/mgmt/fx-rates", {
          method: "POST", headers: h,
          body: JSON.stringify({ year_month: yearMonth, currency_from: "PHP", currency_to: "JPY", rate: parseFloat(phpJpy) }),
        }),
      ]);
      setFxMsg("Saved");
      await fetchData();
    } catch (e) {
      setFxMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingFx(false);
    }
  }

  async function saveTargets() {
    setSavingTargets(true); setTargetMsg("");
    try {
      const h = getHeaders();
      await Promise.all([
        fetch("/api/admin/mgmt/group-targets", {
          method: "POST", headers: h,
          body: JSON.stringify({
            year_month: yearMonth, city: "dubai",
            food_cost_rate_target: dubaiFoodTarget ? parseFloat(dubaiFoodTarget) : null,
            prime_cost_rate_target: dubaiPrimeTarget ? parseFloat(dubaiPrimeTarget) : null,
          }),
        }),
        fetch("/api/admin/mgmt/group-targets", {
          method: "POST", headers: h,
          body: JSON.stringify({
            year_month: yearMonth, city: "manila",
            food_cost_rate_target: manilaFoodTarget ? parseFloat(manilaFoodTarget) : null,
            prime_cost_rate_target: manilaPrimeTarget ? parseFloat(manilaPrimeTarget) : null,
          }),
        }),
      ]);
      setTargetMsg("Saved");
      await fetchData();
    } catch (e) {
      setTargetMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingTargets(false);
    }
  }

  async function pushAlerts() {
    if (!alerts || alerts.alert_count === 0) return;
    setPushingAlerts(true); setPushMsg("");
    try {
      const res = await fetch("/api/admin/mgmt/push-kpi-alerts", {
        method: "POST", headers: getHeaders(),
        body: JSON.stringify({ year_month: yearMonth }),
      });
      const data = await res.json();
      if (data.pushed > 0) {
        setPushMsg(`${data.pushed} alert${data.pushed > 1 ? "s" : ""} pushed to Manager Inbox`);
      } else if (data.skipped > 0) {
        setPushMsg(`Already in Inbox (${data.skipped} existing)`);
      } else {
        setPushMsg("No alerts to push");
      }
    } catch (e) {
      setPushMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setPushingAlerts(false);
    }
  }

  const g = summary?.group;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <button onClick={fetchData} disabled={loading} className={PRIMARY_BUTTON}>
          {loading ? "Loading…" : "Refresh"}
        </button>
        <button onClick={() => router.push("/admin/mgmt-accounting/settings")} className={SMALL_BUTTON}>
          Settings ›
        </button>
      </div>

      {error && <div className="text-rose-400 text-sm px-1">{error}</div>}

      {/* KPI Alerts */}
      {alerts && alerts.alert_count > 0 && (
        <div className="space-y-2">
          {alerts.alerts.map((a, i) => (
            <div key={i} className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
              a.severity === "critical"
                ? "border-rose-500/30 bg-rose-500/10"
                : "border-amber-500/30 bg-amber-500/10"
            }`}>
              <span className="text-base mt-0.5">{a.severity === "critical" ? "🔴" : "🟠"}</span>
              <div className="flex-1">
                <div className={`font-semibold text-sm ${a.severity === "critical" ? "text-rose-300" : "text-amber-300"}`}>
                  {a.title}
                </div>
                <div className="text-xs text-zinc-400 mt-0.5">{a.message}</div>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-3 px-1">
            <button onClick={pushAlerts} disabled={pushingAlerts}
              className="text-xs px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors disabled:opacity-50">
              {pushingAlerts ? "Pushing…" : "Push to Manager Inbox"}
            </button>
            {pushMsg && (
              <span className={`text-xs ${pushMsg.includes("pushed") ? "text-emerald-400" : "text-zinc-400"}`}>
                {pushMsg}
              </span>
            )}
          </div>
        </div>
      )}

      {/* The monthly and daily pages count different things on purpose. Both
          label their columns "Revenue" and "Food Cost", so without saying which
          is which a reader cannot tell why the two disagree. */}
      <div className="rounded-xl border border-slate-600/50 bg-slate-700/20 px-4 py-3">
        <p className="text-xs font-semibold text-slate-200 mb-1">このページが集計しているもの</p>
        <p className="text-xs text-slate-400 leading-relaxed">
          <b className="text-slate-300">売上</b> is money received — aggregator payouts after
          their commission, attributed to the period earned. <b className="text-slate-300">Food
          cost</b> is what was purchased in the month, not what was consumed.
          <br />
          The Daily P&amp;L counts differently: POS sales as rung up, and food cost as items
          sold × recipe cost. Its totals will not match this page, and neither is wrong —
          use this page for the month, and Daily P&amp;L for day-to-day movement.
        </p>
      </div>

      {/* Payouts lag, so part of a running month is inferred rather than banked.
          The figure is usable for a decision only if that is said plainly. */}
      {summary && (["dubai", "manila"] as const)
        .filter((k) => (summary[k].revenue_estimated ?? 0) > 0)
        .map((k) => {
          const d = summary[k];
          const ed = d.estimate_detail ?? {};
          const name = k === "dubai" ? "ドバイ" : "マニラ";
          const cur = d.native.currency;
          return (
            <div key={`est-${k}`} className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-3">
              <p className="text-sm font-semibold text-sky-300">
                {name} — 売上に未入金分の推定を含みます（{ed.through} まで）
              </p>
              <p className="text-xs text-sky-200/85 mt-1 leading-relaxed">
                実績 {fmtNat(d.native.revenue - (d.revenue_estimated ?? 0), cur)} ＋
                推定 {fmtNat(d.revenue_estimated ?? 0, cur)}。
                各社の入金サイクルは遅れて着金するため、未着日はその社の実績日平均で補っています。
                家賃・人件費も同じ日数に合わせています。
              </p>
              {(ed.by_platform?.length ?? 0) > 0 && (
                <div className="mt-2 pt-2 border-t border-sky-500/20 space-y-0.5">
                  {ed.by_platform!.map((b) => (
                    <div key={b.platform} className="flex items-baseline gap-2 text-xs text-sky-100/85">
                      <span className="w-20">{b.platform}</span>
                      <span className="text-sky-300/70">未着 {b.missing_days}日</span>
                      <span className="text-sky-300/70">日平均 {fmtNat(b.daily_avg, cur)}</span>
                      <span className="flex-1 text-right tabular-nums">{fmtNat(b.estimated, cur)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

      {/* A month short of sales days is a data gap, not a bad month — but the
          profit line cannot tell the two apart, so it has to be said here. */}
      {summary && (["dubai", "manila"] as const)
        .filter((k) => summary[k].revenue_incomplete || summary[k].partial_month)
        .map((k) => {
          const d = summary[k];
          const name = k === "dubai" ? "ドバイ" : "マニラ";
          const gap = d.revenue_incomplete;
          return (
            <div key={k} className={`rounded-xl border px-4 py-3 ${
              gap ? "border-rose-500/40 bg-rose-500/10" : "border-amber-500/40 bg-amber-500/10"}`}>
              <p className={`text-sm font-semibold ${gap ? "text-rose-300" : "text-amber-300"}`}>
                {name} — {gap ? "売上データが不足しています" : "集計途中の月です"}
              </p>
              <p className={`text-xs mt-1 leading-relaxed ${gap ? "text-rose-200/80" : "text-amber-200/85"}`}>
                {gap ? (
                  <>
                    {d.days_in_month}日のうち売上が登録されているのは{d.revenue_days}日分のみです。
                    不足分は入金データで補っており、店内飲食が含まれていません。
                    利益が実態より低く出ます。日次売上入力をご確認ください。
                  </>
                ) : (
                  <>
                    売上は{d.days_covered}日分（{d.days_in_month}日中）です。
                    家賃・人件費などの固定費も同じ日数に合わせて計算しています。
                  </>
                )}
              </p>
            </div>
          );
        })}

      {/* Rent, utilities and licences have no rows at all for these cities, so the
          margin below is prime cost only. Left unsaid it reads as profit. */}
      {summary && (summary.dubai.overhead_missing || summary.manila.overhead_missing) && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3">
          <p className="text-sm font-semibold text-rose-300">
            Operating costs not entered
            {summary.dubai.overhead_missing && summary.manila.overhead_missing
              ? " — Dubai and Manila"
              : summary.dubai.overhead_missing ? " — Dubai" : " — Manila"}
          </p>
          <p className="text-xs text-rose-200/80 mt-1 leading-relaxed">
            No rent, utilities, licences or other operating costs are recorded for this month,
            so everything below prime cost is missing. The figures here are food and labour only —
            they are not profit. Enter costs under Settings › Overhead.
          </p>
        </div>
      )}

      {/* Group KPI Cards */}
      {g && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className={KPI_CARD}>
            <p className={KPI_LABEL}>全社売上</p>
            <p className={KPI_NUM}>{fmtJpy(g.revenue)}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Manila + Dubai</p>
          </div>
          <div className={KPI_CARD}>
            <p className={KPI_LABEL}>食材費</p>
            <div className="flex items-center gap-2">
              <p className={`${KPI_NUM} ${foodRateCls(g.food_cost_rate)}`}>{fmtJpy(g.food_cost)}</p>
              {(summary?.dubai.native.food_source === "manual_excel" || summary?.manila.native.food_source === "manual_excel") && (
                <span className="text-xs bg-violet-500/20 text-violet-300 border border-violet-500/30 rounded px-1.5 py-0.5">Excel</span>
              )}
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">Rate: {fmtRate(g.food_cost_rate)}</p>
          </div>
          <div className={KPI_CARD}>
            <p className={KPI_LABEL}>人件費</p>
            <div className="flex items-center gap-2">
              <p className={KPI_NUM}>{fmtJpy(g.labor_cost)}</p>
              {(summary?.dubai.native.labor_source === "estimated_shifts" || summary?.manila.native.labor_source === "estimated_shifts") && (
                <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded px-1.5 py-0.5">推定</span>
              )}
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">Rate: {fmtRate(g.labor_cost_rate)}</p>
          </div>
          <div className={KPI_CARD}>
            <p className={KPI_LABEL}>プライム計</p>
            <p className={`${KPI_NUM} ${primeRateCls(g.prime_cost_rate)}`}>{fmtJpy(g.prime_cost)}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Rate: {fmtRate(g.prime_cost_rate)}</p>
          </div>
          {/* Without these two the page stopped at prime cost, and 81% prime
              read as 19% profit — the months shown here are losses. */}
          <div className={KPI_CARD}>
            <p className={KPI_LABEL}>経費</p>
            <p className={KPI_NUM}>{fmtJpy(g.overhead_total)}</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {summary?.dubai.overhead_carried_from || summary?.manila.overhead_carried_from
                ? `${summary?.dubai.overhead_carried_from ?? summary?.manila.overhead_carried_from} から引き継ぎ`
                : `Rate: ${fmtRate(g.revenue > 0 ? (g.overhead_total / g.revenue) * 100 : null)}`}
            </p>
          </div>
          <div className={KPI_CARD}>
            <p className={KPI_LABEL}>営業利益</p>
            {/* A loss computed from revenue we know is missing is not a loss,
                it is a guess. Better to say so than to print a number. */}
            {summary && (summary.dubai.revenue_incomplete || summary.manila.revenue_incomplete) ? (
              <>
                <p className={`${KPI_NUM} text-zinc-500`}>算出不可</p>
                <p className="text-xs text-rose-300/80 mt-0.5">売上データが不足しています</p>
              </>
            ) : (
              <>
                <p className={`${KPI_NUM} ${g.revenue - g.total_cost >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {fmtJpy(g.revenue - g.total_cost)}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {g.revenue > 0 ? `${(((g.revenue - g.total_cost) / g.revenue) * 100).toFixed(1)}% 利益率` : "—"}
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* City Breakdown */}
      {summary && (
        <div className={`${GLASS_CARD} p-4`}>
          <h2 className={`${T_SECTION} mb-3`}>都市別内訳</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-500 text-xs uppercase border-b border-zinc-800">
                  <th className="text-left py-2 pr-4">都市</th>
                  <th className="text-right py-2 pr-4">売上</th>
                  <th className="text-right py-2 pr-4">食材費</th>
                  <th className="text-right py-2 pr-4">食材費率</th>
                  <th className="text-right py-2 pr-4">人件費</th>
                  <th className="text-right py-2 pr-4">経費</th>
                  <th className="text-right py-2 pr-4">営業利益</th>
                  {/* Prime is food + labour — a subtotal. Sitting between labour
                      and overhead it read as a running total that overhead then
                      added to. Moved past the profit line, as the indicator it is. */}
                  <th className="text-right py-2 pr-4 text-zinc-600">プライム率<span className="block text-[9px] normal-case">食材+人件費</span></th>
                  <th className="text-right py-2">売上の出所</th>
                </tr>
              </thead>
              <tbody>
                {([
                  { label: "ドバイ",  flag: "🇦🇪", data: summary.dubai },
                  { label: "マニラ", flag: "🇵🇭", data: summary.manila },
                ] as const).map(({ label, flag, data }) => (
                  <tr key={label} className="border-b border-zinc-800/50">
                    <td className="py-2.5 pr-4 font-medium">{flag} {label}</td>
                    <td className="text-right py-2.5 pr-4">
                      <div className="font-mono">{fmtJpy(data.revenue)}</div>
                      <div className="text-xs text-zinc-500">{fmtNat(data.native.revenue, data.native.currency)}</div>
                    </td>
                    <td className="text-right py-2.5 pr-4">
                      <div className="font-mono inline-flex items-center gap-1">
                        {fmtJpy(data.food_cost)}
                        {data.native.food_source === "manual_excel" && (
                          <span className="text-xs bg-violet-500/20 text-violet-300 border border-violet-500/30 rounded px-1 py-0">Excel</span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-500">{fmtNat(data.native.food_cost, data.native.currency)}</div>
                    </td>
                    <td className={`text-right py-2.5 pr-4 font-semibold ${foodRateCls(data.food_cost_rate)}`}>
                      {fmtRate(data.food_cost_rate)}
                    </td>
                    <td className="text-right py-2.5 pr-4">
                      <div className="font-mono inline-flex items-center gap-1">
                        {fmtJpy(data.labor_cost)}
                        {data.native.labor_source === "estimated_shifts" && (
                          <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded px-1 py-0">推定</span>
                        )}
                      </div>
                    </td>
                    <td className="text-right py-2.5 pr-4 font-mono">{fmtJpy(data.overhead_total)}</td>
                    {data.revenue_incomplete ? (
                      <td className="text-right py-2.5 pr-4 text-zinc-500 text-xs">算出不可</td>
                    ) : (
                      <td className={`text-right py-2.5 pr-4 font-mono font-semibold ${
                        data.revenue - data.total_cost >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        <div>{fmtJpy(data.revenue - data.total_cost)}</div>
                        <div className="text-xs font-normal opacity-70">
                          {data.revenue > 0
                            ? `${(((data.revenue - data.total_cost) / data.revenue) * 100).toFixed(1)}%`
                            : "—"}
                        </div>
                      </td>
                    )}
                    <td className={`text-right py-2.5 pr-4 ${primeRateCls(data.prime_cost_rate)}`}>
                      {fmtRate(data.prime_cost_rate)}
                    </td>
                    <td className="text-right py-2.5">
                      {data.native.revenue_source === "ar_payouts"
                        ? <span className={BADGE_SUCCESS} style={{ fontSize: "9px", padding: "1px 6px" }}>入金データ</span>
                        : data.native.revenue_source === "manual"
                          ? <span className={BADGE_INFO} style={{ fontSize: "9px", padding: "1px 6px" }}>手入力</span>
                          : (data.native.revenue_source as string) === "sales_data_input"
                            ? <span className={BADGE_SUCCESS} style={{ fontSize: "9px", padding: "1px 6px" }}>日次売上入力</span>
                            : <span className={BADGE_WARNING} style={{ fontSize: "9px", padding: "1px 6px" }}>未設定</span>}
                    </td>
                  </tr>
                ))}
                {g && (
                  <tr className="bg-zinc-800/30 font-semibold">
                    <td className="py-2.5 pr-4">🌐 全社合計</td>
                    <td className="text-right py-2.5 pr-4 font-mono">{fmtJpy(g.revenue)}</td>
                    <td className="text-right py-2.5 pr-4 font-mono">{fmtJpy(g.food_cost)}</td>
                    <td className={`text-right py-2.5 pr-4 ${foodRateCls(g.food_cost_rate)}`}>{fmtRate(g.food_cost_rate)}</td>
                    <td className="text-right py-2.5 pr-4 font-mono">{fmtJpy(g.labor_cost)}</td>
                    <td className="text-right py-2.5 pr-4 font-mono">{fmtJpy(g.overhead_total)}</td>
                    {summary && (summary.dubai.revenue_incomplete || summary.manila.revenue_incomplete) ? (
                      <td className="text-right py-2.5 pr-4 text-zinc-500 text-xs">算出不可</td>
                    ) : (
                      <td className={`text-right py-2.5 pr-4 font-mono ${
                        g.revenue - g.total_cost >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        <div>{fmtJpy(g.revenue - g.total_cost)}</div>
                        <div className="text-xs font-normal opacity-70">
                          {g.revenue > 0 ? `${(((g.revenue - g.total_cost) / g.revenue) * 100).toFixed(1)}%` : "—"}
                        </div>
                      </td>
                    )}
                    <td className={`text-right py-2.5 pr-4 ${primeRateCls(g.prime_cost_rate)}`}>{fmtRate(g.prime_cost_rate)}</td>
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Store Ranking */}
      {ranking && ranking.stores.length > 0 && (
        <div className={`${GLASS_CARD} p-4`}>
          <h2 className={`${T_SECTION} mb-1`}>店舗別 食材費ランキング</h2>
          <p className="text-xs text-zinc-500 mb-3">食材費の高い順</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-500 text-xs uppercase border-b border-zinc-800">
                  <th className="text-left py-2 w-8">#</th>
                  <th className="text-left py-2 pr-4">店舗</th>
                  <th className="text-left py-2 pr-4">都市</th>
                  <th className="text-right py-2 pr-4">食材費</th>
                  <th className="text-right py-2 pr-4">売上</th>
                  <th className="text-right py-2 pr-4">食材費率</th>
                  <th className="text-right py-2">売上の出所</th>
                </tr>
              </thead>
              <tbody>
                {ranking.stores.map((s, i) => (
                  <tr key={`${s.city}-${s.store_code}`} className="border-b border-zinc-800/40 hover:bg-zinc-800/20">
                    <td className="py-2 text-zinc-600 text-xs">{i + 1}</td>
                    <td className="py-2 pr-4 font-semibold">{s.store_code}</td>
                    <td className="py-2 pr-4 text-xs text-zinc-400">
                      {s.city === "dubai" ? "🇦🇪 ドバイ" : "🇵🇭 マニラ"}
                    </td>
                    <td className="text-right py-2 pr-4 font-mono">
                      {s.currency} {Math.round(s.food_cost).toLocaleString("en")}
                    </td>
                    <td className="text-right py-2 pr-4 font-mono text-zinc-400">
                      {s.revenue > 0 ? `${s.currency} ${Math.round(s.revenue).toLocaleString("en")}` : "—"}
                    </td>
                    <td className={`text-right py-2 pr-4 font-semibold ${foodRateCls(s.food_cost_rate)}`}>
                      {fmtRate(s.food_cost_rate)}
                    </td>
                    <td className="text-right py-2">
                      {s.revenue_source === "ar_payouts"
                        ? <span className={BADGE_SUCCESS} style={{ fontSize: "9px", padding: "1px 6px" }}>AR</span>
                        : s.revenue_source === "manual"
                          ? <span className={BADGE_INFO} style={{ fontSize: "9px", padding: "1px 6px" }}>手入力</span>
                          : <span className="text-zinc-600 text-xs">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Trend Predictions */}
      {(dubaiPred?.predictions || manilaPred?.predictions) && (
        <div className={`${GLASS_CARD} p-4`}>
          <h2 className={`${T_SECTION} mb-1`}>トレンド予測</h2>
          <p className="text-xs text-zinc-500 mb-3">Linear regression on last 6 months. Revenue forecast requires manual entries.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {([
              { label: "ドバイ",  flag: "🇦🇪", pred: dubaiPred,  cur: "AED" },
              { label: "マニラ", flag: "🇵🇭", pred: manilaPred, cur: "PHP" },
            ] as const).map(({ label, flag, pred, cur }) => (
              <div key={label} className="rounded-xl border border-zinc-700/50 bg-zinc-800/30 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span>{flag}</span>
                  <span className="text-sm font-semibold text-zinc-300">{label}</span>
                  {pred?.next_month && (
                    <span className="text-xs text-zinc-500 ml-auto">Forecast: {pred.next_month}</span>
                  )}
                </div>
                {pred?.predictions ? (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-zinc-500">食材費（翌月）</span>
                      <span className={`text-sm font-mono font-semibold ${
                        pred.predictions.food_cost_trend === "up" ? "text-rose-400"
                          : pred.predictions.food_cost_trend === "down" ? "text-emerald-400"
                          : "text-zinc-300"
                      }`}>
                        {cur} {pred.predictions.food_cost != null
                          ? Math.round(pred.predictions.food_cost).toLocaleString("en")
                          : "—"}
                        {" "}{pred.predictions.food_cost_trend === "up" ? "↑" : pred.predictions.food_cost_trend === "down" ? "↓" : "→"}
                      </span>
                    </div>
                    {pred.predictions.revenue != null && pred.predictions.revenue > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-zinc-500">売上（翌月）</span>
                        <span className="text-sm font-mono text-zinc-400">
                          {cur} {Math.round(pred.predictions.revenue).toLocaleString("en")}
                        </span>
                      </div>
                    )}
                    <div className="text-xs text-zinc-600 pt-1">Based on {pred.based_on_months} months of data</div>
                  </div>
                ) : (
                  <div className="text-xs text-zinc-500">{pred?.error || "Insufficient data for prediction"}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Group Budget Targets */}
      {summary && (
        <div className={`${GLASS_CARD} p-4`}>
          <h2 className={`${T_SECTION} mb-1`}>全社目標</h2>
          <p className="text-xs text-zinc-500 mb-4">
            Food cost rate targets per city for <span className="text-zinc-300">{yearMonth}</span>.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            {([
              {
                label: "ドバイ", flag: "🇦🇪", target: dubaiTarget,
                actual: summary.dubai.food_cost_rate, primeActual: summary.dubai.prime_cost_rate,
                foodVal: dubaiFoodTarget, primeVal: dubaiPrimeTarget,
                setFood: setDubaiFoodTarget, setPrime: setDubaiPrimeTarget,
              },
              {
                label: "マニラ", flag: "🇵🇭", target: manilaTarget,
                actual: summary.manila.food_cost_rate, primeActual: summary.manila.prime_cost_rate,
                foodVal: manilaFoodTarget, primeVal: manilaPrimeTarget,
                setFood: setManilaFoodTarget, setPrime: setManilaPrimeTarget,
              },
            ]).map(({ label, flag, target, actual, primeActual, foodVal, primeVal, setFood, setPrime }) => {
              const foodVar = actual != null && target?.food_cost_rate_target != null ? actual - target.food_cost_rate_target : null;
              const primeVar = primeActual != null && target?.prime_cost_rate_target != null ? primeActual - target.prime_cost_rate_target : null;
              const vCls = (v: number | null) => v == null ? "text-zinc-500" : v > 5 ? "text-rose-400" : v > 0 ? "text-amber-400" : "text-emerald-400";
              return (
                <div key={label} className="rounded-xl border border-zinc-700/50 bg-zinc-800/30 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span>{flag}</span>
                    <span className="text-sm font-semibold text-zinc-300">{label}</span>
                  </div>
                  <div className="space-y-2 mb-3 text-xs">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Food Cost — Actual</span>
                      <span className="font-mono text-zinc-300">{actual != null ? `${actual.toFixed(1)}%` : "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Food Cost — Target</span>
                      <span className="font-mono text-zinc-400">{target?.food_cost_rate_target != null ? `${target.food_cost_rate_target.toFixed(1)}%` : "—"}</span>
                    </div>
                    {foodVar != null && (
                      <div className="flex justify-between">
                        <span className="text-zinc-500">差異</span>
                        <span className={`font-mono font-semibold ${vCls(foodVar)}`}>
                          {foodVar > 0 ? "+" : ""}{foodVar.toFixed(1)}%
                        </span>
                      </div>
                    )}
                    {primeVar != null && (
                      <div className="flex justify-between">
                        <span className="text-zinc-500">プライムコスト差異</span>
                        <span className={`font-mono font-semibold ${vCls(primeVar)}`}>
                          {primeVar > 0 ? "+" : ""}{primeVar.toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <div>
                      <label className="text-xs text-zinc-500 block mb-1">食材費率 目標</label>
                      <input type="number" step="0.1" min="0" max="100" value={foodVal}
                        onChange={e => setFood(e.target.value)} placeholder="e.g. 28"
                        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100 w-20 tabular-nums" />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 block mb-1">プライム率 目標</label>
                      <input type="number" step="0.1" min="0" max="100" value={primeVal}
                        onChange={e => setPrime(e.target.value)} placeholder="e.g. 60"
                        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100 w-20 tabular-nums" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={saveTargets} disabled={savingTargets} className={PRIMARY_BUTTON}>
              {savingTargets ? "Saving…" : "Save Targets"}
            </button>
            {targetMsg && (
              <span className={targetMsg === "Saved" ? "text-xs text-emerald-400" : "text-xs text-rose-400"}>
                {targetMsg}
              </span>
            )}
          </div>
        </div>
      )}

      {/* FX Rate Settings */}
      <div className={`${GLASS_CARD} p-4`}>
        <h2 className={`${T_SECTION} mb-1`}>為替レート設定</h2>
        <p className="text-xs text-zinc-500 mb-4">
          Monthly FX rates for JPY consolidation. Applies to <span className="text-zinc-300">{yearMonth}</span> only.
        </p>
        <div className="flex flex-wrap gap-6 items-end">
          <div>
            <label className="text-xs text-zinc-400 block mb-1.5">1 AED → JPY</label>
            <input type="number" step="0.01" value={aedJpy} onChange={e => setAedJpy(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-100 w-28 tabular-nums" />
          </div>
          <div>
            <label className="text-xs text-zinc-400 block mb-1.5">1 PHP → JPY</label>
            <input type="number" step="0.01" value={phpJpy} onChange={e => setPhpJpy(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-100 w-28 tabular-nums" />
          </div>
          <button onClick={saveFxRates} disabled={savingFx} className={PRIMARY_BUTTON}>
            {savingFx ? "Saving…" : "Save & Recalculate"}
          </button>
          {fxMsg && (
            <span className={fxMsg === "Saved" ? "text-xs text-emerald-400" : "text-xs text-rose-400"}>
              {fxMsg}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Monthly Report ──────────────────────────────────────────────────────

function MonthlyReportTab({ yearMonth }: { yearMonth: string }) {
  const [report, setReport] = useState<ExecReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchReport = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/admin/mgmt/executive-report?year_month=${yearMonth}`, { headers: getHeaders() });
      if (!res.ok) throw new Error(`${res.status}`);
      setReport(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [yearMonth]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const g = report?.group?.group;
  const now = report
    ? new Date(report.generated_at).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })
    : "";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={fetchReport} disabled={loading} className={SMALL_BUTTON}>
          {loading ? "Loading…" : "Refresh"}
        </button>
        <button onClick={() => window.print()} className={PRIMARY_BUTTON} disabled={!report}>
          Print / Save PDF
        </button>
      </div>

      {error && <div className="text-rose-400 text-sm">{error}</div>}
      {loading && !report && <div className="text-zinc-500 text-sm">Loading executive report…</div>}

      {report && (
        <>
          {/* Report Header */}
          <div className="border-b border-zinc-700 pb-4">
            <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">SUSHI ZEN WORKFORCE OS</p>
            <p className="text-sm text-zinc-400">
              Period: <strong className="text-zinc-200">{report.year_month}</strong>
              {" · "}Generated: <span className="text-zinc-300">{now}</span>
              {" · "}FX: <span className="text-zinc-300">1 AED = ¥{report.group.fx_rates.AED_JPY.toFixed(2)} · 1 PHP = ¥{report.group.fx_rates.PHP_JPY.toFixed(2)}</span>
            </p>
          </div>

          {/* KPI Alerts */}
          {report.alerts.alert_count > 0 && (
            <div className={`${GLASS_CARD} p-4`}>
              <h2 className={`${T_SECTION} mb-3`}>
                KPI Alerts
                <span className={`ml-2 text-xs font-normal px-2 py-0.5 rounded-full ${
                  report.alerts.alerts.some(a => a.severity === "critical")
                    ? "bg-rose-500/20 text-rose-400"
                    : "bg-amber-500/20 text-amber-400"
                }`}>
                  {report.alerts.alert_count} {report.alerts.alert_count === 1 ? "alert" : "alerts"}
                </span>
              </h2>
              <div className="flex flex-col gap-2">
                {report.alerts.alerts.map((a, i) => (
                  <div key={i} className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
                    a.severity === "critical"
                      ? "border-rose-500/30 bg-rose-500/10"
                      : "border-amber-500/30 bg-amber-500/10"
                  }`}>
                    <span className="text-sm">{a.severity === "critical" ? "🔴" : "🟠"}</span>
                    <div>
                      <div className={`font-semibold text-sm ${a.severity === "critical" ? "text-rose-300" : "text-amber-300"}`}>
                        {a.title}
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">{a.message}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Group P&L Summary */}
          {g && (
            <div className={`${GLASS_CARD} p-4`}>
              <h2 className={`${T_SECTION} mb-3`}>Group P&L Summary — {report.year_month}</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                {[
                  { label: "Group Revenue", value: fmtJpy(g.revenue), sub: "", cls: "" },
                  { label: "Food Cost",     value: fmtJpy(g.food_cost),  sub: `Rate: ${fmtRate(g.food_cost_rate)}`,  cls: foodRateCls(g.food_cost_rate) },
                  { label: "Labor Cost",    value: fmtJpy(g.labor_cost), sub: `Rate: ${fmtRate(g.labor_cost_rate)}`, cls: "" },
                  { label: "Prime Cost",    value: fmtJpy(g.prime_cost), sub: `Rate: ${fmtRate(g.prime_cost_rate)}`, cls: primeRateCls(g.prime_cost_rate) },
                ].map(({ label, value, sub, cls }) => (
                  <div key={label} className="rounded-lg bg-zinc-800/50 p-3">
                    <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1">{label}</div>
                    <div className={`text-lg font-bold font-mono ${cls || "text-zinc-100"}`}>{value}</div>
                    {sub && <div className="text-xs text-zinc-500 mt-0.5">{sub}</div>}
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-zinc-500 text-xs uppercase border-b border-zinc-800">
                      <th className="text-left py-2 pr-4">都市</th>
                      <th className="text-right py-2 pr-4">売上</th>
                      <th className="text-right py-2 pr-4">食材費</th>
                      <th className="text-right py-2 pr-4">食材費率</th>
                      <th className="text-right py-2 pr-4">人件費</th>
                      <th className="text-right py-2 pr-4">プライム計</th>
                      <th className="text-right py-2">プライム率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      { label: "ドバイ",  flag: "🇦🇪", d: report.group.dubai  },
                      { label: "マニラ", flag: "🇵🇭", d: report.group.manila },
                    ] as const).map(({ label, flag, d }) => (
                      <tr key={label} className="border-b border-zinc-800/50">
                        <td className="py-2.5 pr-4 font-medium">
                          {flag} {label}
                          <div className="text-xs text-zinc-500">{fmtNat(d.native.revenue, d.native.currency)}</div>
                        </td>
                        <td className="text-right py-2.5 pr-4 font-mono">{fmtJpy(d.revenue)}</td>
                        <td className="text-right py-2.5 pr-4 font-mono">{fmtJpy(d.food_cost)}</td>
                        <td className={`text-right py-2.5 pr-4 font-semibold ${foodRateCls(d.food_cost_rate)}`}>{fmtRate(d.food_cost_rate)}</td>
                        <td className="text-right py-2.5 pr-4 font-mono">{fmtJpy(d.labor_cost)}</td>
                        <td className="text-right py-2.5 pr-4 font-mono">{fmtJpy(d.prime_cost)}</td>
                        <td className={`text-right py-2.5 font-semibold ${primeRateCls(d.prime_cost_rate)}`}>{fmtRate(d.prime_cost_rate)}</td>
                      </tr>
                    ))}
                    <tr className="bg-zinc-800/30 font-semibold">
                      <td className="py-2.5 pr-4">🌐 Group Total</td>
                      <td className="text-right py-2.5 pr-4 font-mono">{fmtJpy(g.revenue)}</td>
                      <td className="text-right py-2.5 pr-4 font-mono">{fmtJpy(g.food_cost)}</td>
                      <td className={`text-right py-2.5 pr-4 ${foodRateCls(g.food_cost_rate)}`}>{fmtRate(g.food_cost_rate)}</td>
                      <td className="text-right py-2.5 pr-4 font-mono">{fmtJpy(g.labor_cost)}</td>
                      <td className="text-right py-2.5 pr-4 font-mono">{fmtJpy(g.prime_cost)}</td>
                      <td className={`text-right py-2.5 ${primeRateCls(g.prime_cost_rate)}`}>{fmtRate(g.prime_cost_rate)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Store Ranking */}
          {report.store_ranking.stores.length > 0 && (
            <div className={`${GLASS_CARD} p-4`}>
              <h2 className={`${T_SECTION} mb-1`}>店舗別 食材費ランキング</h2>
              <p className="text-xs text-zinc-500 mb-3">食材費の高い順</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-zinc-500 text-xs uppercase border-b border-zinc-800">
                      <th className="text-left py-2 w-8">#</th>
                      <th className="text-left py-2 pr-4">店舗</th>
                      <th className="text-left py-2 pr-4">都市</th>
                      <th className="text-right py-2 pr-4">食材費</th>
                      <th className="text-right py-2 pr-4">売上</th>
                      <th className="text-right py-2">食材費率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.store_ranking.stores.map((s, i) => (
                      <tr key={`${s.city}-${s.store_code}`} className="border-b border-zinc-800/40">
                        <td className="py-2 text-zinc-600 text-xs">{i + 1}</td>
                        <td className="py-2 pr-4 font-semibold">{s.store_code}</td>
                        <td className="py-2 pr-4 text-xs text-zinc-400">
                          {s.city === "dubai" ? "🇦🇪 ドバイ" : "🇵🇭 マニラ"}
                        </td>
                        <td className="text-right py-2 pr-4 font-mono">
                          {s.currency} {Math.round(s.food_cost).toLocaleString("en")}
                        </td>
                        <td className="text-right py-2 pr-4 font-mono text-zinc-400">
                          {s.revenue > 0 ? `${s.currency} ${Math.round(s.revenue).toLocaleString("en")}` : "—"}
                        </td>
                        <td className={`text-right py-2 font-semibold ${foodRateCls(s.food_cost_rate)}`}>
                          {fmtRate(s.food_cost_rate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Trend Predictions */}
          {(report.predictions.dubai.predictions || report.predictions.manila.predictions) && (
            <div className={`${GLASS_CARD} p-4`}>
              <h2 className={`${T_SECTION} mb-1`}>トレンド予測</h2>
              <p className="text-xs text-zinc-500 mb-3">Linear regression based on last 6 months of data</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {([
                  { label: "ドバイ",  flag: "🇦🇪", pred: report.predictions.dubai,  cur: "AED" },
                  { label: "マニラ", flag: "🇵🇭", pred: report.predictions.manila, cur: "PHP" },
                ] as const).map(({ label, flag, pred, cur }) => (
                  <div key={label} className="rounded-xl border border-zinc-700/50 bg-zinc-800/30 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span>{flag}</span>
                      <span className="text-sm font-semibold text-zinc-300">{label}</span>
                      {pred.next_month && (
                        <span className="text-xs text-zinc-500 ml-auto">Forecast: {pred.next_month}</span>
                      )}
                    </div>
                    {pred.predictions ? (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-zinc-500">食材費（翌月）</span>
                          <span className={`text-sm font-mono font-semibold ${
                            pred.predictions.food_cost_trend === "up" ? "text-rose-400"
                              : pred.predictions.food_cost_trend === "down" ? "text-emerald-400"
                              : "text-zinc-300"
                          }`}>
                            {cur} {pred.predictions.food_cost != null
                              ? Math.round(pred.predictions.food_cost).toLocaleString("en")
                              : "—"}
                            {" "}{pred.predictions.food_cost_trend === "up" ? "↑" : pred.predictions.food_cost_trend === "down" ? "↓" : "→"}
                          </span>
                        </div>
                        {pred.predictions.revenue != null && pred.predictions.revenue > 0 && (
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-zinc-500">売上（翌月）</span>
                            <span className="text-sm font-mono text-zinc-400">
                              {cur} {Math.round(pred.predictions.revenue).toLocaleString("en")}
                            </span>
                          </div>
                        )}
                        <div className="text-xs text-zinc-600 pt-1">Based on {pred.based_on_months} months</div>
                      </div>
                    ) : (
                      <div className="text-xs text-zinc-500">{pred.error || "Insufficient data"}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-zinc-800 text-xs text-zinc-600 flex justify-between">
            <span>Sushi ZEN Workforce OS — Management Accounting</span>
            <span>Generated {now}</span>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = "group" | "cost" | "report";

// Six figures in a row at KPI_VALUE's size wrap mid-number — ¥26,521,9 / 28 —
// and overflow the card. Same weight, sized to fit the column it lives in.
const KPI_NUM = "mt-1 text-lg xl:text-xl font-bold tracking-tight text-white tabular-nums whitespace-nowrap";

const MONTH_OPTIONS = prevMonths(12);

export default function MgmtAccountingPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("group");
  const [yearMonth, setYearMonth] = useState(thisMonth());

  // Arriving from the Daily P&L tab bar carries the view you were on. Read from
  // the URL directly rather than useSearchParams, which forces the whole page
  // into a Suspense boundary and fails the prerender without one.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "group" || t === "cost" || t === "report") setTab(t);
  }, []);

  useEffect(() => {
    const auth = getAuth();
    if (!auth || !["HQ", "ADMIN"].includes(String(auth.role).toUpperCase())) {
      router.push("/");
    }
  }, [router]);

  return (
    <div className="min-h-screen p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-400">Management Accounting</p>
          <DashboardLink />
        </div>
        <h1 className={T_PAGE_TITLE}>管理会計</h1>
        <p className="text-sm text-zinc-500 mt-1">コスト分析 ・ 全社損益 ・ 月次レポート</p>
      </div>

      {/* Tab bar + Month selector */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <MgmtTabBar active={tab} onSelect={(k) => setTab(k as Tab)} />
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-500 uppercase tracking-widest">対象月</label>
          <select value={yearMonth} onChange={e => setYearMonth(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100">
            {MONTH_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* Tab Content */}
      {tab === "group"  && <GroupManagementTab   yearMonth={yearMonth} />}
      {tab === "cost"   && <CostIntelligenceTab  yearMonth={yearMonth} />}
      {tab === "report" && <MonthlyReportTab      yearMonth={yearMonth} />}
    </div>
  );
}
