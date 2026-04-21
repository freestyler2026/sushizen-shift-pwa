"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Clock, RefreshCw, ShoppingBag, WifiOff, XCircle } from "lucide-react";
import { getAuth, getAuthHeaders, refreshAuthFromApi, tryRefreshAccessToken } from "@/lib/auth";
import {
  GLASS_CARD,
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
  SECONDARY_BUTTON,
  T_CAPTION,
  T_SECTION,
  T_LABEL,
} from "@/lib/ui-tokens";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { FlashValue } from "@/components/ui/FlashValue";
import { fmtNum, fmtNumTitle } from "@/lib/formatters";

function getApiBase() {
  if (process.env.NODE_ENV !== "production") return "http://127.0.0.1:8000";
  return "";
}

async function apiGet<T>(path: string): Promise<T> {
  const request = async () =>
    fetch(`${getApiBase()}${path}`, { cache: "no-store", headers: getAuthHeaders() });
  let res = await request();
  let text = await res.text();
  if (res.status === 401) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) {
      res = await request();
      text = await res.text();
    }
  }
  if (!res.ok && res.status === 401) {
    const current = getAuth();
    if (current?.pin && (text.includes("Invalid access token") || !current.accessToken)) {
      await refreshAuthFromApi(current, { includeMfa: true });
      res = await request();
      text = await res.text();
    }
  }
  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text);
      if (typeof j?.detail === "string") detail = j.detail;
    } catch { /* ignore */ }
    throw new Error(detail || `GET ${path} failed`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

type OpsRow = {
  sale_date: string;
  store_name: string;
  restaurant_name?: string;
  restaurant_id?: string;
  unavailable_time?: number;
  order_rejection_rate?: number;
  orders_with_avoidable_wait_time?: number;
  average_preparation_time?: number;
  orders_with_customer_complaints?: number;
  food_is_ready?: number;
};

type OfflineMonthlyRow = {
  store_name: string;
  month: string;
  offline_reason: string;
  offline_minutes?: number;
  scheduled_minutes?: number;
  offline_rate_pct?: number;
  restaurant_name?: string;
};

type OpsResp = { ok: boolean; items: OpsRow[] };
type OfflineMonthlyResp = { ok: boolean; items: OfflineMonthlyRow[] };

function fmtSec(sec?: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

function fmtPct(v?: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(1)}%`;
}

function fmtMin(v?: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const h = Math.floor(v / 60);
  const m = Math.round(v % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function prepSecToMin(sec?: number | null): number | null {
  if (sec == null || !Number.isFinite(sec)) return null;
  return Math.round(sec / 60);
}

function rateColor(v: number | null | undefined): string {
  if (v == null) return "text-neutral-400";
  if (v <= 5) return "text-emerald-400";
  if (v <= 15) return "text-amber-400";
  return "text-rose-400";
}

function prepColor(minVal: number | null | undefined): string {
  if (minVal == null) return "text-neutral-400";
  if (minVal <= 25) return "text-emerald-400";
  if (minVal <= 35) return "text-amber-400";
  return "text-rose-400";
}

export function ManilaFoodPandaTab({
  dateFrom,
  dateTo,
  approverName,
  pin,
  stepUpReady,
}: {
  dateFrom: string;
  dateTo: string;
  approverName: string;
  pin: string;
  stepUpReady: boolean;
}) {
  const [loadingOps, setLoadingOps] = useState(false);
  const [loadingOffline, setLoadingOffline] = useState(false);
  const [opsRows, setOpsRows] = useState<OpsRow[]>([]);
  const [offlineRows, setOfflineRows] = useState<OfflineMonthlyRow[]>([]);
  const [error, setError] = useState("");
  const [storeFilter, setStoreFilter] = useState("");

  const canLoad = !!approverName.trim() && stepUpReady;

  const loadData = useCallback(async () => {
    if (!canLoad) return;
    setError("");
    setLoadingOps(true);
    setLoadingOffline(true);

    const qs = new URLSearchParams({
      approver_name: approverName.trim(),
      pin: pin.trim(),
      date_from: dateFrom,
      date_to: dateTo,
    });
    if (storeFilter) qs.set("store", storeFilter);

    // Monthly offline data: load all available months regardless of the ops date range,
    // since offline CSVs cover multi-month spans (e.g. Oct 2025 – Mar 2026).
    const mqsBase = new URLSearchParams({
      approver_name: approverName.trim(),
      pin: pin.trim(),
    });
    if (storeFilter) mqsBase.set("store", storeFilter);

    apiGet<OpsResp>(`/api/admin/analytics/manila/sales/foodpanda-ops?${qs}`)
      .then((r) => setOpsRows(r.items || []))
      .catch((e) => setError(String(e?.message || e || "Failed to load Foodpanda ops")))
      .finally(() => setLoadingOps(false));

    apiGet<OfflineMonthlyResp>(
      `/api/admin/analytics/manila/sales/foodpanda-offline-monthly?${mqsBase}`
    )
      .then((r) => setOfflineRows(r.items || []))
      .catch(() => {
        /* monthly data may not be imported yet — don't block the page */
      })
      .finally(() => setLoadingOffline(false));
  }, [approverName, canLoad, dateFrom, dateTo, pin, storeFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // --- KPI aggregates from ops rows ---
  const opsWithPrep = opsRows.filter((r) => r.average_preparation_time != null);
  const avgPrepSec =
    opsWithPrep.length > 0
      ? opsWithPrep.reduce((s, r) => s + (r.average_preparation_time ?? 0), 0) / opsWithPrep.length
      : null;

  const opsWithRej = opsRows.filter((r) => r.order_rejection_rate != null);
  const avgRejRate =
    opsWithRej.length > 0
      ? opsWithRej.reduce((s, r) => s + (r.order_rejection_rate ?? 0), 0) / opsWithRej.length
      : null;

  const opsWithReady = opsRows.filter((r) => r.food_is_ready != null);
  const avgFoodReady =
    opsWithReady.length > 0
      ? opsWithReady.reduce((s, r) => s + (r.food_is_ready ?? 0), 0) / opsWithReady.length
      : null;

  const opsWithUnavail = opsRows.filter((r) => r.unavailable_time != null);
  const totalUnavailSec =
    opsWithUnavail.reduce((s, r) => s + (r.unavailable_time ?? 0), 0);

  // --- Prep time chart data (per date, per store) ---
  const prepChartData = opsRows
    .filter((r) => r.average_preparation_time != null)
    .map((r) => ({
      date: r.sale_date,
      store: r.store_name,
      prep_min: prepSecToMin(r.average_preparation_time),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Deduplicate by date (avg across stores if multiple)
  const prepByDate: Record<string, number[]> = {};
  for (const row of prepChartData) {
    if (!prepByDate[row.date]) prepByDate[row.date] = [];
    if (row.prep_min != null) prepByDate[row.date].push(row.prep_min);
  }
  const prepTrend = Object.entries(prepByDate)
    .map(([date, vals]) => ({
      date,
      avg_prep_min: vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // --- Monthly offline aggregated by store+month ---
  type MonthlyAgg = { month: string; store_name: string; total_offline_min: number; scheduled_min: number; rate_pct: number | null };
  const monthlyAggMap: Record<string, MonthlyAgg> = {};
  for (const row of offlineRows) {
    const key = `${row.month}|${row.store_name}`;
    if (!monthlyAggMap[key]) {
      monthlyAggMap[key] = {
        month: row.month,
        store_name: row.store_name,
        total_offline_min: 0,
        scheduled_min: row.scheduled_minutes ?? 0,
        rate_pct: null,
      };
    }
    monthlyAggMap[key].total_offline_min += row.offline_minutes ?? 0;
    if (row.scheduled_minutes) monthlyAggMap[key].scheduled_min = row.scheduled_minutes;
  }
  const monthlyAgg = Object.values(monthlyAggMap)
    .map((r) => ({
      ...r,
      rate_pct: r.scheduled_min > 0 ? Math.round((r.total_offline_min / r.scheduled_min) * 1000) / 10 : null,
    }))
    .sort((a, b) => a.month.localeCompare(b.month) || a.store_name.localeCompare(b.store_name));

  const storeOptions = Array.from(new Set(opsRows.map((r) => r.store_name).filter(Boolean)));

  const avgPrepMin = avgPrepSec != null ? prepSecToMin(avgPrepSec) : null;
  const isLoading = loadingOps || loadingOffline;

  return (
    <div id="sales-manila-foodpanda" className={GLASS_CARD + " space-y-5 p-5"}>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-orange-400" />
            <h2 className={T_SECTION}>Foodpanda Analytics</h2>
          </div>
          <div className={T_CAPTION}>
            Ops summary, daily prep time trend, and monthly offline duration from Foodpanda exports.
            Upload CSVs to Google Drive and run &quot;Sync Manila Sales&quot; to import.
          </div>
        </div>
        <div className="flex items-end gap-2">
          {storeOptions.length > 0 && (
            <div>
              <div className={T_LABEL + " mb-1"}>Store</div>
              <select
                value={storeFilter}
                onChange={(e) => setStoreFilter(e.target.value)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none"
              >
                <option value="">All stores</option>
                {storeOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={isLoading || !canLoad}
            className={SECONDARY_BUTTON + " flex items-center gap-2 text-sm"}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {isLoading ? <span className="inline-flex items-center gap-2"><Spinner size="sm" /> Loading…</span> : "Refresh"}
          </button>
        </div>
      </div>

      {!approverName.trim() && (
        <div className="rounded-xl border border-orange-500/20 bg-orange-500/10 px-4 py-3 text-sm text-orange-200">
          Enter Approver Name above to load Foodpanda data.
        </div>
      )}
      {approverName.trim() && !stepUpReady && (
        <div className="rounded-xl border border-orange-500/20 bg-orange-500/10 px-4 py-3 text-sm text-orange-200">
          Complete security verification first.
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-900/50 bg-rose-950/20 px-3 py-2 text-sm text-rose-200">{error}</div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className={KPI_CARD}>
          <div className={KPI_LABEL + " mb-1"}>Avg Prep Time</div>
          <div className={`${KPI_VALUE} leading-none ${prepColor(avgPrepMin)}`}>
            {avgPrepMin != null ? `${avgPrepMin}m` : "—"}
          </div>
          <div className={T_CAPTION + " mt-2"}>Mean across selected period</div>
        </div>
        <div className={KPI_CARD}>
          <div className={KPI_LABEL + " mb-1"}>Avg Rejection Rate</div>
          <div className={`${KPI_VALUE} leading-none ${rateColor(avgRejRate)}`}>
            {fmtPct(avgRejRate)}
          </div>
          <div className={T_CAPTION + " mt-2"}>Order rejection rate</div>
        </div>
        <div className={KPI_CARD}>
          <div className={KPI_LABEL + " mb-1"}>Food Ready Rate</div>
          <div className={KPI_VALUE + " leading-none"}>
            {fmtPct(avgFoodReady)}
          </div>
          <div className={T_CAPTION + " mt-2"}>% orders food is ready</div>
        </div>
        <div className={KPI_CARD}>
          <div className={KPI_LABEL + " mb-1"}>Total Unavailable</div>
          <div className={KPI_VALUE + " leading-none"}>
            {fmtSec(totalUnavailSec || null)}
          </div>
          <div className={T_CAPTION + " mt-2"}>Cumulative downtime in period</div>
        </div>
      </div>

      {/* Prep Time Trend Chart */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
          <Clock className="h-4 w-4 text-orange-400" />
          Prep Time Trend (daily avg, minutes)
        </div>
        {loadingOps ? (
          <div className="flex h-48 items-center justify-center"><Spinner /></div>
        ) : prepTrend.length === 0 ? (
          <EmptyState message="No prep time data for this period. Import preparationTimePerDay or opsSummary CSVs via Sync Manila Sales." />
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={prepTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis dataKey="date" stroke="#a3a3a3" tick={{ fontSize: 11 }} />
                <YAxis stroke="#a3a3a3" unit="m" domain={["auto", "auto"]} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v: number) => [`${v}m`, "Avg Prep"]}
                  contentStyle={{ backgroundColor: "#0d1117", border: "1px solid #262626", borderRadius: 12 }}
                />
                <Line
                  type="monotone"
                  dataKey="avg_prep_min"
                  stroke="#fb923c"
                  strokeWidth={2}
                  dot={false}
                  name="Avg Prep Time"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Monthly Offline Duration */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
          <WifiOff className="h-4 w-4 text-rose-400" />
          Monthly Offline Duration
        </div>
        {loadingOffline ? (
          <div className="flex h-48 items-center justify-center"><Spinner /></div>
        ) : monthlyAgg.length === 0 ? (
          <EmptyState message="No monthly offline data. Import offlineDurationPerMonth CSVs via Sync Manila Sales." />
        ) : (
          <>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyAgg}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                  <XAxis dataKey="month" stroke="#a3a3a3" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#a3a3a3" unit="m" tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v: number, name: string) => [
                      name === "total_offline_min" ? fmtMin(v) : `${v}%`,
                      name === "total_offline_min" ? "Offline Time" : "Offline Rate",
                    ]}
                    contentStyle={{ backgroundColor: "#0d1117", border: "1px solid #262626", borderRadius: 12 }}
                  />
                  <Legend />
                  <Bar dataKey="total_offline_min" name="Offline (min)" fill="#f87171" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-white/5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="px-2 py-2">Month</th>
                    <th className="px-2 py-2">Store</th>
                    <th className="px-2 py-2 text-right">Offline</th>
                    <th className="px-2 py-2 text-right">Scheduled</th>
                    <th className="px-2 py-2 text-right">Offline Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyAgg.map((row) => (
                    <tr
                      key={`${row.month}-${row.store_name}`}
                      className="border-t border-white/5 transition-colors hover:bg-white/4"
                    >
                      <td className="px-2 py-2 font-medium text-white">{row.month}</td>
                      <td className="px-2 py-2 text-zinc-200">{row.store_name}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-zinc-200">{fmtMin(row.total_offline_min)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-zinc-200">{fmtMin(row.scheduled_min)}</td>
                      <td className={`px-2 py-2 text-right tabular-nums font-medium ${rateColor(row.rate_pct)}`}>
                        {fmtPct(row.rate_pct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Ops Detail Table */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
          <XCircle className="h-4 w-4 text-amber-400" />
          Daily Ops Detail
        </div>
        {loadingOps ? (
          <div className="flex h-32 items-center justify-center"><Spinner /></div>
        ) : opsRows.length === 0 ? (
          <EmptyState message="No ops data for this period. Upload opsSummary or Taft per-metric CSVs and run Sync Manila Sales." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-white/5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Store</th>
                  <th className="px-2 py-2 text-right">Prep Time</th>
                  <th className="px-2 py-2 text-right">Rejection</th>
                  <th className="px-2 py-2 text-right">AWT</th>
                  <th className="px-2 py-2 text-right">Unavailable</th>
                  <th className="px-2 py-2 text-right">Food Ready</th>
                </tr>
              </thead>
              <tbody>
                {opsRows.map((row) => {
                  const prepMin = prepSecToMin(row.average_preparation_time);
                  return (
                    <tr
                      key={`${row.sale_date}-${row.store_name}-${row.restaurant_id ?? ""}`}
                      className="border-t border-white/5 transition-colors hover:bg-white/4"
                    >
                      <td className="px-2 py-2 font-medium text-white">{row.sale_date}</td>
                      <td className="px-2 py-2 text-zinc-200">{row.store_name}</td>
                      <td className={`px-2 py-2 text-right tabular-nums font-medium ${prepColor(prepMin)}`}>
                        {prepMin != null ? `${prepMin}m` : "—"}
                      </td>
                      <td className={`px-2 py-2 text-right tabular-nums ${rateColor(row.order_rejection_rate)}`}>
                        {fmtPct(row.order_rejection_rate)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-zinc-300">
                        {row.orders_with_avoidable_wait_time != null
                          ? Number.isFinite(row.orders_with_avoidable_wait_time) && row.orders_with_avoidable_wait_time > 1
                            ? Math.round(row.orders_with_avoidable_wait_time).toString()
                            : fmtPct(row.orders_with_avoidable_wait_time)
                          : "—"}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-zinc-300">
                        {fmtSec(row.unavailable_time)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-zinc-300">
                        {fmtPct(row.food_is_ready)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detailed offline breakdown by reason */}
      {offlineRows.length > 0 && (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
          <div className="mb-3 text-sm font-semibold text-white">Offline Reason Breakdown</div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-white/5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-2 py-2">Month</th>
                  <th className="px-2 py-2">Store</th>
                  <th className="px-2 py-2">Reason</th>
                  <th className="px-2 py-2 text-right">Offline (min)</th>
                  <th className="px-2 py-2 text-right">Scheduled (min)</th>
                  <th className="px-2 py-2 text-right">Rate</th>
                </tr>
              </thead>
              <tbody>
                {offlineRows.map((row, i) => (
                  <tr
                    key={`${row.month}-${row.store_name}-${row.offline_reason}-${i}`}
                    className="border-t border-white/5 transition-colors hover:bg-white/4"
                  >
                    <td className="px-2 py-2 font-medium text-white">{row.month}</td>
                    <td className="px-2 py-2 text-zinc-200">{row.store_name}</td>
                    <td className="px-2 py-2 text-zinc-400">{row.offline_reason || "—"}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-zinc-200">
                      {row.offline_minutes != null ? Math.round(row.offline_minutes) : "—"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-zinc-200">
                      {row.scheduled_minutes != null ? Math.round(row.scheduled_minutes) : "—"}
                    </td>
                    <td className={`px-2 py-2 text-right tabular-nums font-medium ${rateColor(row.offline_rate_pct)}`}>
                      {fmtPct(row.offline_rate_pct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
