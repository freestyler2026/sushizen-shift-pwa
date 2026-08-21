"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  GLASS_CARD, KPI_CARD, KPI_LABEL, KPI_VALUE,
  T_PAGE_TITLE, T_SECTION, SMALL_BUTTON, PRIMARY_BUTTON,
  BADGE_SUCCESS, BADGE_INFO, BADGE_WARNING,
} from "@/lib/ui-tokens";
import { getAuth } from "@/lib/auth";

// ─── Types ───────────────────────────────────────────────────────────────────

interface NativeCity {
  currency: string;
  revenue: number;
  food_cost: number;
  labor_cost: number;
  prime_cost: number;
  revenue_source: "manual" | "ar_payouts" | "none";
}

interface CityData {
  revenue: number;
  food_cost: number;
  labor_cost: number;
  overhead_total: number;
  prime_cost: number;
  total_cost: number;
  food_cost_rate: number | null;
  prime_cost_rate: number | null;
  native: NativeCity;
}

interface GroupData {
  revenue: number;
  food_cost: number;
  labor_cost: number;
  overhead_total: number;
  prime_cost: number;
  total_cost: number;
  food_cost_rate: number | null;
  labor_cost_rate: number | null;
  prime_cost_rate: number | null;
  total_cost_rate: number | null;
}

interface GroupSummary {
  year_month: string;
  fx_rates: { AED_JPY: number; PHP_JPY: number };
  dubai: CityData;
  manila: CityData;
  group: GroupData;
}

interface StoreRow {
  city: string;
  store_code: string;
  currency: string;
  revenue: number;
  food_cost: number;
  food_cost_rate: number | null;
  revenue_source: "manual" | "ar_payouts" | "none";
}

interface StoreRanking {
  year_month: string;
  stores: StoreRow[];
}

interface KpiAlert {
  city: string;
  severity: "warning" | "critical";
  type: string;
  title: string;
  message: string;
}

interface AlertData {
  year_month: string;
  alerts: KpiAlert[];
  alert_count: number;
}

interface GroupTarget {
  year_month: string;
  city: string;
  food_cost_rate_target: number | null;
  prime_cost_rate_target: number | null;
  notes: string;
}

interface Prediction {
  city: string;
  next_month: string | null;
  based_on_months: number;
  predictions: {
    food_cost: number | null;
    revenue: number | null;
    food_cost_trend: "up" | "down" | "flat";
  } | null;
  error: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtJpy(v: number) {
  return `¥${Math.round(v).toLocaleString("en")}`;
}
function fmtRate(v: number | null) {
  return v != null ? `${v.toFixed(1)}%` : "—";
}
function fmtNative(v: number, cur: string) {
  return `${cur} ${Math.round(v).toLocaleString("en")}`;
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

// ─── Component ───────────────────────────────────────────────────────────────

export default function GroupManagementPage() {
  const router = useRouter();
  const [yearMonth, setYearMonth] = useState(thisMonth());
  const [summary, setSummary] = useState<GroupSummary | null>(null);
  const [ranking, setRanking] = useState<StoreRanking | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [aedJpy, setAedJpy] = useState("40.50");
  const [phpJpy, setPhpJpy] = useState("2.55");
  const [savingFx, setSavingFx] = useState(false);
  const [fxMsg, setFxMsg] = useState("");
  const [alerts, setAlerts] = useState<AlertData | null>(null);
  const [dubaiPred, setDubaiPred] = useState<Prediction | null>(null);
  const [manilaPred, setManilaPred] = useState<Prediction | null>(null);
  const [dubaiTarget, setDubaiTarget] = useState<GroupTarget | null>(null);
  const [manilaTarget, setManilaTarget] = useState<GroupTarget | null>(null);
  const [dubaiFoodTarget, setDubaiFoodTarget] = useState("");
  const [dubaiPrimeTarget, setDubaiPrimeTarget] = useState("");
  const [manilaFoodTarget, setManilaFoodTarget] = useState("");
  const [manilaPrimeTarget, setManilaPrimeTarget] = useState("");
  const [savingTargets, setSavingTargets] = useState(false);
  const [targetMsg, setTargetMsg] = useState("");
  const [pushingAlerts, setPushingAlerts] = useState(false);
  const [pushMsg, setPushMsg] = useState("");

  const months = prevMonths(12);

  const authHeaders = useCallback(() => {
    const auth = getAuth();
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (auth?.accessToken) h.Authorization = `Bearer ${auth.accessToken}`;
    return h;
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const h = authHeaders();
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
  }, [yearMonth, authHeaders]);

  useEffect(() => {
    const auth = getAuth();
    if (!auth) { router.push("/"); return; }
    if (!["HQ", "ADMIN"].includes(auth.role)) { router.push("/"); return; }
    fetchData();
  }, [fetchData, router]);

  async function saveFxRates() {
    setSavingFx(true);
    setFxMsg("");
    try {
      const h = authHeaders();
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
    setSavingTargets(true);
    setTargetMsg("");
    try {
      const h = authHeaders();
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
    setPushingAlerts(true);
    setPushMsg("");
    try {
      const h = authHeaders();
      const res = await fetch("/api/admin/mgmt/push-kpi-alerts", {
        method: "POST", headers: h,
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
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 max-w-5xl mx-auto">

      {/* Header */}
      <div className="mb-4">
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">MANAGEMENT ACCOUNTING</p>
        <h1 className={T_PAGE_TITLE}>Group Management</h1>
        <p className="text-zinc-400 text-sm mt-1">Consolidated P&L · Store Ranking · All figures in JPY</p>
      </div>

      {/* Controls */}
      <div className={`${GLASS_CARD} flex flex-wrap items-center gap-3 mb-4 p-3`}>
        <label className="text-xs text-zinc-400 uppercase tracking-widest">Month</label>
        <select
          value={yearMonth}
          onChange={(e) => setYearMonth(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100"
        >
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <button onClick={fetchData} disabled={loading} className={PRIMARY_BUTTON}>
          {loading ? "Loading…" : "Refresh"}
        </button>
        <div className="ml-auto flex gap-2">
          <button onClick={() => router.push("/admin/mgmt-accounting")} className={SMALL_BUTTON}>
            Dashboard
          </button>
          <button onClick={() => router.push("/admin/mgmt-accounting/settings")} className={SMALL_BUTTON}>
            Settings
          </button>
          <button onClick={() => router.push("/admin/mgmt-accounting/report")} className={SMALL_BUTTON}>
            Monthly Report
          </button>
        </div>
      </div>

      {error && <div className="text-rose-400 text-sm mb-4 px-1">{error}</div>}

      {/* KPI Alerts */}
      {alerts && alerts.alert_count > 0 && (
        <div className="mb-4">
          <div className="flex flex-col gap-2">
            {alerts.alerts.map((a, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
                  a.severity === "critical"
                    ? "border-rose-500/30 bg-rose-500/10"
                    : "border-amber-500/30 bg-amber-500/10"
                }`}
              >
                <span className="text-base mt-0.5">{a.severity === "critical" ? "🔴" : "🟠"}</span>
                <div className="flex-1">
                  <div className={`font-semibold text-sm ${a.severity === "critical" ? "text-rose-300" : "text-amber-300"}`}>
                    {a.title}
                  </div>
                  <div className="text-xs text-zinc-400 mt-0.5">{a.message}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-2 px-1">
            <button
              onClick={pushAlerts}
              disabled={pushingAlerts}
              className="text-xs px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors disabled:opacity-50"
            >
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

      {/* Group KPI cards */}
      {g && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className={KPI_CARD}>
            <p className={KPI_LABEL}>Group Revenue</p>
            <p className={KPI_VALUE}>{fmtJpy(g.revenue)}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Manila + Dubai</p>
          </div>
          <div className={KPI_CARD}>
            <p className={KPI_LABEL}>Food Cost</p>
            <p className={`${KPI_VALUE} ${foodRateCls(g.food_cost_rate)}`}>{fmtJpy(g.food_cost)}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Rate: {fmtRate(g.food_cost_rate)}</p>
          </div>
          <div className={KPI_CARD}>
            <p className={KPI_LABEL}>Labor Cost</p>
            <p className={KPI_VALUE}>{fmtJpy(g.labor_cost)}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Rate: {fmtRate(g.labor_cost_rate)}</p>
          </div>
          <div className={KPI_CARD}>
            <p className={KPI_LABEL}>Prime Cost</p>
            <p className={`${KPI_VALUE} ${primeRateCls(g.prime_cost_rate)}`}>{fmtJpy(g.prime_cost)}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Rate: {fmtRate(g.prime_cost_rate)}</p>
          </div>
        </div>
      )}

      {/* City breakdown */}
      {summary && (
        <div className={`${GLASS_CARD} mb-4`}>
          <h2 className={`${T_SECTION} mb-3`}>City Breakdown</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-500 text-xs uppercase border-b border-zinc-800">
                  <th className="text-left py-2 pr-4">City</th>
                  <th className="text-right py-2 pr-4">Revenue</th>
                  <th className="text-right py-2 pr-4">Food Cost</th>
                  <th className="text-right py-2 pr-4">Food %</th>
                  <th className="text-right py-2 pr-4">Labor</th>
                  <th className="text-right py-2 pr-4">Prime Cost</th>
                  <th className="text-right py-2 pr-4">Prime %</th>
                  <th className="text-right py-2">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {([
                  { label: "Dubai", flag: "🇦🇪", data: summary.dubai },
                  { label: "Manila", flag: "🇵🇭", data: summary.manila },
                ] as const).map(({ label, flag, data }) => (
                  <tr key={label} className="border-b border-zinc-800/50">
                    <td className="py-2.5 pr-4 font-medium">{flag} {label}</td>
                    <td className="text-right py-2.5 pr-4">
                      <div className="font-mono">{fmtJpy(data.revenue)}</div>
                      <div className="text-xs text-zinc-500">{fmtNative(data.native.revenue, data.native.currency)}</div>
                    </td>
                    <td className="text-right py-2.5 pr-4">
                      <div className="font-mono">{fmtJpy(data.food_cost)}</div>
                      <div className="text-xs text-zinc-500">{fmtNative(data.native.food_cost, data.native.currency)}</div>
                    </td>
                    <td className={`text-right py-2.5 pr-4 font-semibold ${foodRateCls(data.food_cost_rate)}`}>
                      {fmtRate(data.food_cost_rate)}
                    </td>
                    <td className="text-right py-2.5 pr-4 font-mono">{fmtJpy(data.labor_cost)}</td>
                    <td className="text-right py-2.5 pr-4 font-mono">{fmtJpy(data.prime_cost)}</td>
                    <td className={`text-right py-2.5 pr-4 font-semibold ${primeRateCls(data.prime_cost_rate)}`}>
                      {fmtRate(data.prime_cost_rate)}
                    </td>
                    <td className="text-right py-2.5">
                      {data.native.revenue_source === "ar_payouts"
                        ? <span className={BADGE_SUCCESS} style={{ fontSize: "9px", padding: "1px 6px" }}>AR Payouts</span>
                        : data.native.revenue_source === "manual"
                          ? <span className={BADGE_INFO} style={{ fontSize: "9px", padding: "1px 6px" }}>Manual</span>
                          : <span className={BADGE_WARNING} style={{ fontSize: "9px", padding: "1px 6px" }}>Not set</span>}
                    </td>
                  </tr>
                ))}
                {/* Group total row */}
                {g && (
                  <tr className="bg-zinc-800/30 font-semibold">
                    <td className="py-2.5 pr-4">🌐 Group Total</td>
                    <td className="text-right py-2.5 pr-4 font-mono">{fmtJpy(g.revenue)}</td>
                    <td className="text-right py-2.5 pr-4 font-mono">{fmtJpy(g.food_cost)}</td>
                    <td className={`text-right py-2.5 pr-4 ${foodRateCls(g.food_cost_rate)}`}>{fmtRate(g.food_cost_rate)}</td>
                    <td className="text-right py-2.5 pr-4 font-mono">{fmtJpy(g.labor_cost)}</td>
                    <td className="text-right py-2.5 pr-4 font-mono">{fmtJpy(g.prime_cost)}</td>
                    <td className={`text-right py-2.5 pr-4 ${primeRateCls(g.prime_cost_rate)}`}>{fmtRate(g.prime_cost_rate)}</td>
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Store food cost ranking */}
      {ranking && ranking.stores.length > 0 && (
        <div className={`${GLASS_CARD} mb-4`}>
          <h2 className={`${T_SECTION} mb-1`}>Store Food Cost Ranking</h2>
          <p className="text-xs text-zinc-500 mb-3">Sorted by food cost (highest first). Food % shown only where revenue is set.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-500 text-xs uppercase border-b border-zinc-800">
                  <th className="text-left py-2 w-8">#</th>
                  <th className="text-left py-2 pr-4">Store</th>
                  <th className="text-left py-2 pr-4">City</th>
                  <th className="text-right py-2 pr-4">Food Cost</th>
                  <th className="text-right py-2 pr-4">Revenue</th>
                  <th className="text-right py-2 pr-4">Food %</th>
                  <th className="text-right py-2">Rev. Source</th>
                </tr>
              </thead>
              <tbody>
                {ranking.stores.map((s, i) => (
                  <tr key={`${s.city}-${s.store_code}`} className="border-b border-zinc-800/40 hover:bg-zinc-800/20">
                    <td className="py-2 text-zinc-600 text-xs">{i + 1}</td>
                    <td className="py-2 pr-4 font-semibold">{s.store_code}</td>
                    <td className="py-2 pr-4 text-xs text-zinc-400">
                      {s.city === "dubai" ? "🇦🇪" : "🇵🇭"} {s.city}
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
                          ? <span className={BADGE_INFO} style={{ fontSize: "9px", padding: "1px 6px" }}>Manual</span>
                          : <span className="text-zinc-600 text-xs">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {ranking && ranking.stores.length === 0 && !loading && (
        <div className={`${GLASS_CARD} mb-4 text-center py-8 text-zinc-500 text-sm`}>
          No store data found for {yearMonth}
        </div>
      )}

      {/* Trend Predictions */}
      {(dubaiPred?.predictions || manilaPred?.predictions) && (
        <div className={`${GLASS_CARD} mb-4`}>
          <h2 className={`${T_SECTION} mb-1`}>Trend Predictions</h2>
          <p className="text-xs text-zinc-500 mb-3">
            Linear regression on last 6 months of procurement data. Revenue forecast requires manual revenue entries.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {([
              { label: "Dubai",  flag: "🇦🇪", pred: dubaiPred,  cur: "AED" },
              { label: "Manila", flag: "🇵🇭", pred: manilaPred, cur: "PHP" },
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
                      <span className="text-xs text-zinc-500">Food Cost (next mo.)</span>
                      <span className={`text-sm font-mono font-semibold ${
                        pred.predictions.food_cost_trend === "up"   ? "text-rose-400"
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
                        <span className="text-xs text-zinc-500">Revenue (next mo.)</span>
                        <span className="text-sm font-mono text-zinc-400">
                          {cur} {Math.round(pred.predictions.revenue).toLocaleString("en")}
                        </span>
                      </div>
                    )}
                    <div className="text-xs text-zinc-600 pt-1">
                      Based on {pred.based_on_months} months of data
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-zinc-500">
                    {pred?.error || "Insufficient data for prediction"}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Group Budget Targets */}
      {summary && (
        <div className={`${GLASS_CARD} mb-4`}>
          <h2 className={`${T_SECTION} mb-1`}>Group Budget Targets</h2>
          <p className="text-xs text-zinc-500 mb-4">
            Set food cost rate targets per city for <span className="text-zinc-300">{yearMonth}</span>. Actual vs. target shown below.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            {([
              { label: "Dubai", flag: "🇦🇪", target: dubaiTarget, actual: summary.dubai.food_cost_rate, primeActual: summary.dubai.prime_cost_rate, foodVal: dubaiFoodTarget, primeVal: dubaiPrimeTarget, setFood: setDubaiFoodTarget, setPrime: setDubaiPrimeTarget },
              { label: "Manila", flag: "🇵🇭", target: manilaTarget, actual: summary.manila.food_cost_rate, primeActual: summary.manila.prime_cost_rate, foodVal: manilaFoodTarget, primeVal: manilaPrimeTarget, setFood: setManilaFoodTarget, setPrime: setManilaPrimeTarget },
            ]).map(({ label, flag, target, actual, primeActual, foodVal, primeVal, setFood, setPrime }) => {
              const foodVariance = actual != null && target?.food_cost_rate_target != null ? actual - target.food_cost_rate_target : null;
              const primeVariance = primeActual != null && target?.prime_cost_rate_target != null ? primeActual - target.prime_cost_rate_target : null;
              const varianceCls = (v: number | null) => v == null ? "text-zinc-500" : v > 5 ? "text-rose-400" : v > 0 ? "text-amber-400" : "text-emerald-400";
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
                    {foodVariance != null && (
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Variance</span>
                        <span className={`font-mono font-semibold ${varianceCls(foodVariance)}`}>
                          {foodVariance > 0 ? "+" : ""}{foodVariance.toFixed(1)}%
                        </span>
                      </div>
                    )}
                    {primeVariance != null && (
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Prime Cost Variance</span>
                        <span className={`font-mono font-semibold ${varianceCls(primeVariance)}`}>
                          {primeVariance > 0 ? "+" : ""}{primeVariance.toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <div>
                      <label className="text-xs text-zinc-500 block mb-1">Food % Target</label>
                      <input
                        type="number" step="0.1" min="0" max="100"
                        value={foodVal}
                        onChange={e => setFood(e.target.value)}
                        placeholder="e.g. 28"
                        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100 w-20 tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 block mb-1">Prime % Target</label>
                      <input
                        type="number" step="0.1" min="0" max="100"
                        value={primeVal}
                        onChange={e => setPrime(e.target.value)}
                        placeholder="e.g. 60"
                        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100 w-20 tabular-nums"
                      />
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

      {/* FX Rate settings */}
      <div className={`${GLASS_CARD} mb-4`}>
        <h2 className={`${T_SECTION} mb-1`}>Exchange Rate Settings</h2>
        <p className="text-xs text-zinc-500 mb-4">
          Monthly FX rates for JPY consolidation. Applies to <span className="text-zinc-300">{yearMonth}</span> only.
          Default: AED = ¥40.50, PHP = ¥2.55.
        </p>
        <div className="flex flex-wrap gap-6 items-end">
          <div>
            <label className="text-xs text-zinc-400 block mb-1.5">1 AED → JPY</label>
            <input
              type="number" step="0.01" value={aedJpy}
              onChange={(e) => setAedJpy(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-100 w-28 tabular-nums"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400 block mb-1.5">1 PHP → JPY</label>
            <input
              type="number" step="0.01" value={phpJpy}
              onChange={(e) => setPhpJpy(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-100 w-28 tabular-nums"
            />
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
