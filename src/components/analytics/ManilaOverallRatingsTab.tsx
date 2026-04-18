"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RefreshCw, Star } from "lucide-react";

import { getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";
import { GLASS_CARD, SECONDARY_BUTTON, T_SECTION, T_CAPTION } from "@/lib/ui-tokens";
import { Spinner } from "@/components/ui/Spinner";

function getApiBase() {
  if (process.env.NODE_ENV !== "production") return "http://127.0.0.1:8000";
  return "";
}

async function apiGet<T>(path: string): Promise<T> {
  const request = async () =>
    fetch(`${getApiBase()}${path}`, { cache: "no-store", headers: getAuthHeaders() });
  let res = await request();
  let text = await res.text();
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

type BrandSummary = {
  brand: string;
  by_aggregator: Record<string, { avg_rating: number | null; row_count: number } | null>;
  overall_avg: number | null;
  overall_row_count: number;
};

type SnapshotRow = {
  record_date: string;
  brand: string;
  aggregator: string;
  branch: string;
  rating_score: number | null;
  review_count?: string | null;
};

type TrendRow = {
  record_date: string;
  brand: string;
  aggregator: string;
  avg_rating: number | null;
};

type ManilaRatingsAnalyticsResp = {
  ok?: boolean;
  aggregators: string[];
  brands: BrandSummary[];
  distinct_day_count: number;
  latest_record_date: string;
  latest_snapshot_rows: SnapshotRow[];
  trend?: TrendRow[];
};

const DATE_PRESETS = [
  { label: "7D" as const, days: 7 },
  { label: "30D" as const, days: 30 },
  { label: "90D" as const, days: 90 },
  { label: "All" as const, days: null },
];

const AGG_COLOR: Record<string, string> = {
  grab: "#22c55e",
  foodpanda: "#ec4899",
  default: "#94a3b8",
};

const AGG_LINE_COLOR: Record<string, string> = {
  grab: "#22c55e",
  foodpanda: "#ec4899",
  default: "#94a3b8",
};

function ratingColor(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return "text-gray-600";
  if (score >= 4.5) return "text-emerald-400";
  if (score >= 4.0) return "text-amber-400";
  return "text-red-400";
}

function ratingBg(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return "";
  if (score >= 4.5) return "bg-emerald-500/10";
  if (score >= 4.0) return "bg-amber-500/10";
  return "bg-red-500/10";
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function ManilaOverallRatingsTab({
  dateFrom: externalDateFrom,
  dateTo: externalDateTo,
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
  const [dateFrom, setDateFrom] = useState(externalDateFrom || "");
  const [dateTo, setDateTo] = useState(externalDateTo || "");
  const [activePreset, setActivePreset] = useState<(typeof DATE_PRESETS)[number]["label"] | null>(null);
  const [data, setData] = useState<ManilaRatingsAnalyticsResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canLoad = !!approverName.trim() && !!pin.trim() && stepUpReady;

  const fetchData = useCallback(
    async (override?: { from?: string; to?: string }) => {
      if (!canLoad) return;
      const df = override?.from !== undefined ? override.from : dateFrom;
      const dt = override?.to !== undefined ? override.to : dateTo;
      setLoading(true);
      setError("");
      try {
        const qs = new URLSearchParams({
          approver_name: approverName.trim(),
          pin: pin.trim(),
        });
        if (df) qs.set("date_from", df);
        if (dt) qs.set("date_to", dt);
        const json = await apiGet<ManilaRatingsAnalyticsResp>(
          `/api/admin/analytics/manila/aggregator-ratings?${qs}`,
        );
        setData(json);
      } catch (e: unknown) {
        setData(null);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [approverName, pin, canLoad, dateFrom, dateTo],
  );

  useEffect(() => {
    if (!canLoad) return;
    void fetchData();
  }, [fetchData, canLoad]);

  function applyPreset(days: number | null) {
    const label = DATE_PRESETS.find((p) => p.days === days)?.label ?? null;
    setActivePreset(label);
    if (days == null) {
      setDateFrom("");
      setDateTo("");
      void fetchData({ from: "", to: "" });
      return;
    }
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - (days - 1));
    const fs = from.toISOString().slice(0, 10);
    const ts = to.toISOString().slice(0, 10);
    setDateFrom(fs);
    setDateTo(ts);
    void fetchData({ from: fs, to: ts });
  }

  // Build trend chart data from latest snapshot rows grouped by date & aggregator
  const trendAggregators = useMemo(() => data?.aggregators ?? [], [data]);

  const trendChartData = useMemo(() => {
    if (!data?.trend?.length) return [];
    // Group by date
    const byDate: Record<string, Record<string, number[]>> = {};
    for (const row of data.trend) {
      const d = row.record_date;
      if (!byDate[d]) byDate[d] = {};
      const agg = row.aggregator?.toLowerCase() || "";
      if (!byDate[d][agg]) byDate[d][agg] = [];
      if (row.avg_rating != null && Number.isFinite(row.avg_rating)) {
        byDate[d][agg].push(row.avg_rating);
      }
    }
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, aggMap]) => {
        const row: Record<string, string | number | null> = { date };
        for (const agg of trendAggregators) {
          const vals = aggMap[agg.toLowerCase()] ?? [];
          row[agg] = vals.length > 0
            ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100
            : null;
        }
        return row;
      });
  }, [data, trendAggregators]);

  if (!stepUpReady) {
    return (
      <div className={`${GLASS_CARD} p-6`}>
        <p className="text-sm text-neutral-400">
          Complete Security verification (MFA / PIN step-up) above to load Manila overall ratings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="sales-manila-overall-ratings">
      {/* Header & controls */}
      <div className={`${GLASS_CARD} p-5`}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-400" />
              <h2 className={T_SECTION}>Overall Rating (Manila)</h2>
            </div>
            <p className={T_CAPTION}>
              Average aggregator store rating scores by brand. Data is imported via the Ratings Entry admin panel.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void fetchData()}
            disabled={loading || !canLoad}
            className={SECONDARY_BUTTON + " inline-flex items-center gap-2 text-sm"}
          >
            {loading ? <Spinner size="sm" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </button>
        </div>

        {/* Date presets */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-neutral-500">Period:</span>
          {DATE_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p.days)}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                activePreset === p.label
                  ? "bg-violet-600 text-white"
                  : "border border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
              }`}
            >
              {p.label}
            </button>
          ))}
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setActivePreset(null); }}
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
          />
          <span className="text-xs text-neutral-500">→</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setActivePreset(null); }}
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
          />
          <button
            type="button"
            onClick={() => void fetchData()}
            disabled={loading || !canLoad}
            className="rounded-lg border border-violet-600/50 bg-violet-600/20 px-3 py-1 text-xs font-medium text-violet-300 hover:bg-violet-600/30 disabled:opacity-50"
          >
            Apply
          </button>
        </div>

        {data?.distinct_day_count != null && (
          <p className="mt-2 text-xs text-neutral-500">
            {data.distinct_day_count} record day{data.distinct_day_count !== 1 ? "s" : ""} in period
            {data.latest_record_date ? ` · Latest: ${data.latest_record_date}` : ""}
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-800 bg-rose-950/30 px-4 py-3 text-sm text-rose-300">{error}</div>
      )}

      {loading && (
        <div className="flex justify-center py-8"><Spinner /></div>
      )}

      {/* Brand × Aggregator summary matrix */}
      {!loading && data && data.brands.length > 0 && (
        <div className={`${GLASS_CARD} p-4`}>
          <h3 className={`${T_SECTION} mb-3`}>Brand × Aggregator Average Ratings</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800">
                  <th className="pb-2 pr-6 text-left text-xs font-medium text-neutral-500">Brand</th>
                  {data.aggregators.map((agg) => (
                    <th key={agg} className="px-4 pb-2 text-center text-xs font-medium text-neutral-500">
                      {capitalize(agg)}
                    </th>
                  ))}
                  <th className="px-4 pb-2 text-center text-xs font-medium text-neutral-400">Overall</th>
                </tr>
              </thead>
              <tbody>
                {data.brands.map((brand) => (
                  <tr key={brand.brand} className="border-t border-neutral-800/40">
                    <td className="py-3 pr-6 font-medium text-white">{brand.brand}</td>
                    {data.aggregators.map((agg) => {
                      const cell = brand.by_aggregator?.[agg];
                      const score = cell?.avg_rating ?? null;
                      return (
                        <td key={agg} className="px-4 py-3 text-center">
                          {score != null ? (
                            <span className={`rounded-lg px-3 py-1 text-sm font-bold ${ratingColor(score)} ${ratingBg(score)}`}>
                              {score.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-neutral-700">—</span>
                          )}
                          {cell?.row_count ? (
                            <div className="mt-1 text-[10px] text-neutral-600">{cell.row_count} records</div>
                          ) : null}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-center">
                      {brand.overall_avg != null ? (
                        <span className={`rounded-lg px-3 py-1 text-sm font-bold ${ratingColor(brand.overall_avg)} ${ratingBg(brand.overall_avg)}`}>
                          {brand.overall_avg.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-neutral-700">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-4 text-xs text-neutral-500">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400 inline-block" /> ≥ 4.5</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400 inline-block" /> 4.0 – 4.49</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400 inline-block" /> &lt; 4.0</span>
          </div>
        </div>
      )}

      {/* Trend chart */}
      {!loading && trendChartData.length > 0 && (
        <div className={`${GLASS_CARD} p-4`}>
          <h3 className={`${T_SECTION} mb-3`}>Rating Trend by Aggregator</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis dataKey="date" stroke="#a3a3a3" tick={{ fontSize: 11 }} />
                <YAxis domain={[3.5, 5]} stroke="#a3a3a3" tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <ReferenceLine y={4.5} stroke="#22c55e" strokeDasharray="4 4" strokeOpacity={0.4} />
                <ReferenceLine y={4.0} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.4} />
                {trendAggregators.map((agg) => (
                  <Line
                    key={agg}
                    type="monotone"
                    dataKey={agg}
                    name={capitalize(agg)}
                    stroke={AGG_LINE_COLOR[agg.toLowerCase()] ?? AGG_LINE_COLOR.default}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className={`${T_CAPTION} mt-2`}>
            Dashed lines: 4.5 (green) and 4.0 (amber) thresholds.
          </p>
        </div>
      )}

      {/* Latest snapshot */}
      {!loading && (data?.latest_snapshot_rows?.length ?? 0) > 0 && (
        <div className={`${GLASS_CARD} p-4`}>
          <h3 className={`${T_SECTION} mb-3`}>
            Latest Snapshot
            {data?.latest_record_date ? <span className="ml-2 text-sm font-normal text-neutral-500">({data.latest_record_date})</span> : null}
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-neutral-800">
                  {["Brand", "Aggregator", "Branch", "Rating", "Reviews"].map((h) => (
                    <th key={h} className="pb-2 pr-4 text-left text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.latest_snapshot_rows ?? []).map((row, i) => (
                  <tr key={i} className="border-t border-neutral-800/40">
                    <td className="py-2 pr-4 font-medium text-white">{row.brand}</td>
                    <td className="py-2 pr-4">
                      <span style={{ color: AGG_COLOR[row.aggregator?.toLowerCase()] ?? AGG_COLOR.default }}>
                        {capitalize(row.aggregator || "")}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-neutral-300">{row.branch || "—"}</td>
                    <td className="py-2 pr-4">
                      <span className={`font-bold ${ratingColor(row.rating_score)}`}>
                        {row.rating_score != null ? row.rating_score.toFixed(2) : "—"}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-neutral-400">{row.review_count || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && !error && (!data || (data.brands.length === 0 && data.latest_snapshot_rows.length === 0)) && (
        <div className={`${GLASS_CARD} p-6 text-center text-sm text-neutral-500`}>
          No rating data found for this period. Import ratings via the Ratings Entry admin panel.
        </div>
      )}
    </div>
  );
}
