"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
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
import { RefreshCw, Star, AlertTriangle } from "lucide-react";

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
      res = await request(); text = await res.text();
    }
  }
  if (!res.ok) {
    let detail = text;
    try { const j = JSON.parse(text); if (typeof j?.detail === "string") detail = j.detail; } catch { /* ignore */ }
    throw new Error(detail || `GET ${path} failed`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

// ── Dubai types ──────────────────────────────────────────────────────────────
type BrandSummary = {
  brand: string;
  by_aggregator: Record<string, { avg_rating: number | null; row_count: number } | null>;
  overall_avg: number | null;
  overall_row_count: number;
};
type SnapshotRow = { record_date: string; brand: string; aggregator: string; branch: string; rating_score: number | null; review_count?: string | null };
type DubaiTrendRow = { record_date: string; brand: string; aggregator: string; avg_rating: number | null };
type DubaiResp = { ok?: boolean; aggregators: string[]; brands: BrandSummary[]; distinct_day_count: number; latest_record_date: string; latest_snapshot_rows: SnapshotRow[]; trend?: DubaiTrendRow[] };

// ── Manila low-ratings types ─────────────────────────────────────────────────
// summary: { aggregator: { branch: { "1": count, "2": count, "3": count } } }
type ManilaSummaryResp = { ok: boolean; summary: Record<string, Record<string, Record<string, number>>> };
type ManilaTrendRow = { month: string; aggregator: string; branch: string; count: number };
type ManilaTrendResp = { ok: boolean; rows: ManilaTrendRow[] };

// ── Shared ────────────────────────────────────────────────────────────────────
const DATE_PRESETS = [
  { label: "7D" as const, days: 7 },
  { label: "30D" as const, days: 30 },
  { label: "90D" as const, days: 90 },
  { label: "All" as const, days: null },
];

const AGG_COLOR: Record<string, string> = {
  grab: "#22c55e", grabfood: "#22c55e", foodpanda: "#ec4899",
  careem: "#f97316", noon: "#6366f1", talabat: "#ef4444", keeta: "#22c55e", deliveroo: "#3b82f6", smiles: "#a855f7",
  default: "#94a3b8",
};
const AGG_LINE_COLOR: Record<string, string> = { ...AGG_COLOR };

const MANILA_AGG_CONFIG: Record<string, { bar: string; badge: string; dot: string }> = {
  foodpanda: { bar: "bg-pink-500",    badge: "bg-pink-500/15 text-pink-300",       dot: "bg-pink-400" },
  grab:      { bar: "bg-emerald-500", badge: "bg-emerald-500/15 text-emerald-300", dot: "bg-emerald-400" },
};
function manilaAggConfig(agg: string) {
  return MANILA_AGG_CONFIG[agg.toLowerCase()] ?? { bar: "bg-neutral-500", badge: "bg-neutral-700/40 text-neutral-400", dot: "bg-neutral-500" };
}

function aggDisplayName(agg: string): string {
  const lower = agg.toLowerCase();
  if (lower === "grabfood" || lower === "grab") return "GrabFood";
  if (lower === "foodpanda") return "FoodPanda";
  return agg.charAt(0).toUpperCase() + agg.slice(1);
}
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

const BRAND_ORDER = ["Sushi Zen", "Ramen Zen", "All Veggie Sushi", "J-Deli"];
function sortBrands(brands: BrandSummary[]): BrandSummary[] {
  return [...brands].sort((a, b) => {
    const ai = BRAND_ORDER.indexOf(a.brand), bi = BRAND_ORDER.indexOf(b.brand);
    if (ai === -1 && bi === -1) return a.brand.localeCompare(b.brand);
    if (ai === -1) return 1; if (bi === -1) return -1; return ai - bi;
  });
}

// ── Dubai sub-component ───────────────────────────────────────────────────────
function DubaiOverallRatings({ dateFrom: extFrom, dateTo: extTo, approverName, pin, canLoad }: {
  dateFrom: string; dateTo: string; approverName: string; pin: string; canLoad: boolean;
}) {
  const [dateFrom, setDateFrom] = useState(extFrom || "");
  const [dateTo, setDateTo] = useState(extTo || "");
  const [activePreset, setActivePreset] = useState<(typeof DATE_PRESETS)[number]["label"] | null>(null);
  const [data, setData] = useState<DubaiResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchData = useCallback(async (override?: { from?: string; to?: string }) => {
    if (!canLoad) return;
    const df = override?.from !== undefined ? override.from : dateFrom;
    const dt = override?.to !== undefined ? override.to : dateTo;
    setLoading(true); setError("");
    try {
      const qs = new URLSearchParams({ approver_name: approverName.trim(), pin: pin.trim() });
      if (df) qs.set("date_from", df); if (dt) qs.set("date_to", dt);
      const json = await apiGet<DubaiResp>(`/api/admin/analytics/dubai/aggregator-ratings?${qs}`);
      setData(json);
    } catch (e: unknown) {
      setData(null); setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, [approverName, pin, canLoad, dateFrom, dateTo]);

  useEffect(() => { if (canLoad) void fetchData(); }, [fetchData, canLoad]);

  function applyPreset(days: number | null) {
    const label = DATE_PRESETS.find((p) => p.days === days)?.label ?? null;
    setActivePreset(label);
    if (days == null) { setDateFrom(""); setDateTo(""); void fetchData({ from: "", to: "" }); return; }
    const to = new Date(), from = new Date(to);
    from.setDate(from.getDate() - (days - 1));
    const fs = from.toISOString().slice(0, 10), ts = to.toISOString().slice(0, 10);
    setDateFrom(fs); setDateTo(ts); void fetchData({ from: fs, to: ts });
  }

  const trendAggregators = useMemo(() => data?.aggregators ?? [], [data]);
  const trendChartData = useMemo(() => {
    if (!data?.trend?.length) return [];
    const byDate: Record<string, Record<string, number[]>> = {};
    for (const row of data.trend) {
      const d = row.record_date; if (!byDate[d]) byDate[d] = {};
      const agg = row.aggregator?.toLowerCase() || "";
      if (!byDate[d][agg]) byDate[d][agg] = [];
      if (row.avg_rating != null && Number.isFinite(row.avg_rating)) byDate[d][agg].push(row.avg_rating);
    }
    return Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, aggMap]) => {
      const row: Record<string, string | number | null> = { date };
      for (const agg of trendAggregators) {
        const vals = aggMap[agg.toLowerCase()] ?? [];
        row[agg] = vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
      }
      return row;
    });
  }, [data, trendAggregators]);

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className={`${GLASS_CARD} p-5`}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-400" />
              <h2 className={T_SECTION}>Overall Rating (Dubai)</h2>
            </div>
            <p className={T_CAPTION}>Average aggregator store rating scores by brand. Data imported via Ratings Entry.</p>
          </div>
          <button type="button" onClick={() => void fetchData()} disabled={loading || !canLoad} className={SECONDARY_BUTTON + " inline-flex items-center gap-2 text-sm"}>
            {loading ? <Spinner size="sm" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-neutral-500">Period:</span>
          {DATE_PRESETS.map((p) => (
            <button key={p.label} type="button" onClick={() => applyPreset(p.days)}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${activePreset === p.label ? "bg-violet-600 text-white" : "border border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"}`}>
              {p.label}
            </button>
          ))}
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setActivePreset(null); }}
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200" />
          <span className="text-xs text-neutral-500">→</span>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setActivePreset(null); }}
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200" />
          <button type="button" onClick={() => void fetchData()} disabled={loading || !canLoad}
            className="rounded-lg border border-violet-600/50 bg-violet-600/20 px-3 py-1 text-xs font-medium text-violet-300 hover:bg-violet-600/30 disabled:opacity-50">
            Apply
          </button>
        </div>
        {data?.distinct_day_count != null && (
          <p className="mt-2 text-xs text-neutral-500">{data.distinct_day_count} record day{data.distinct_day_count !== 1 ? "s" : ""} in period{data.latest_record_date ? ` · Latest: ${data.latest_record_date}` : ""}</p>
        )}
      </div>

      {error && <div className="rounded-xl border border-rose-800 bg-rose-950/30 px-4 py-3 text-sm text-rose-300">{error}</div>}
      {loading && <div className="flex justify-center py-8"><Spinner /></div>}

      {!loading && data && data.brands.length > 0 && (
        <div className={`${GLASS_CARD} p-4`}>
          <h3 className={`${T_SECTION} mb-3`}>Brand × Aggregator Average Ratings</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800">
                  <th className="pb-2 pr-6 text-left text-xs font-medium text-neutral-500">Brand</th>
                  {data.aggregators.map((agg) => <th key={agg} className="px-4 pb-2 text-center text-xs font-medium text-neutral-500">{aggDisplayName(agg)}</th>)}
                  <th className="px-4 pb-2 text-center text-xs font-medium text-neutral-400">Overall</th>
                </tr>
              </thead>
              <tbody>
                {sortBrands(data.brands).map((brand) => (
                  <tr key={brand.brand} className="border-t border-neutral-800/40">
                    <td className="py-3 pr-6 font-medium text-white">{brand.brand}</td>
                    {data.aggregators.map((agg) => {
                      const cell = brand.by_aggregator?.[agg], score = cell?.avg_rating ?? null;
                      return (
                        <td key={agg} className="px-4 py-3 text-center">
                          {score != null ? <span className={`rounded-lg px-3 py-1 text-sm font-bold ${ratingColor(score)} ${ratingBg(score)}`}>{score.toFixed(2)}</span> : <span className="text-neutral-700">—</span>}
                          {cell?.row_count ? <div className="mt-1 text-[10px] text-neutral-600">{cell.row_count} records</div> : null}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-center">
                      {brand.overall_avg != null ? <span className={`rounded-lg px-3 py-1 text-sm font-bold ${ratingColor(brand.overall_avg)} ${ratingBg(brand.overall_avg)}`}>{brand.overall_avg.toFixed(2)}</span> : <span className="text-neutral-700">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-4 text-xs text-neutral-500">
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-400" /> ≥ 4.5</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-400" /> 4.0 – 4.49</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-400" /> &lt; 4.0</span>
          </div>
        </div>
      )}

      {!loading && trendChartData.length > 0 && (
        <div className={`${GLASS_CARD} p-4`}>
          <h3 className={`${T_SECTION} mb-3`}>Rating Trend by Aggregator</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis dataKey="date" stroke="#a3a3a3" tick={{ fontSize: 11 }} />
                <YAxis domain={[3.5, 5]} stroke="#a3a3a3" tick={{ fontSize: 11 }} />
                <Tooltip /><Legend />
                <ReferenceLine y={4.5} stroke="#22c55e" strokeDasharray="4 4" strokeOpacity={0.4} />
                <ReferenceLine y={4.0} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.4} />
                {trendAggregators.map((agg) => (
                  <Line key={agg} type="monotone" dataKey={agg} name={aggDisplayName(agg)} stroke={AGG_LINE_COLOR[agg.toLowerCase()] ?? AGG_LINE_COLOR.default} strokeWidth={2} dot={false} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {!loading && (data?.latest_snapshot_rows?.length ?? 0) > 0 && (
        <div className={`${GLASS_CARD} p-4`}>
          <h3 className={`${T_SECTION} mb-3`}>Latest Snapshot{data?.latest_record_date ? <span className="ml-2 text-sm font-normal text-neutral-500">({data.latest_record_date})</span> : null}</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-neutral-800">
                  {["Brand", "Aggregator", "Branch", "Rating", "Reviews"].map((h) => <th key={h} className="pb-2 pr-4 text-left text-[11px] font-medium uppercase tracking-wider text-neutral-500">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {[...(data?.latest_snapshot_rows ?? [])].sort((a, b) => {
                  const ai = BRAND_ORDER.indexOf(a.brand), bi = BRAND_ORDER.indexOf(b.brand);
                  if (ai !== bi) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
                  return 0;
                }).map((row, i) => (
                  <tr key={i} className="border-t border-neutral-800/40">
                    <td className="py-2 pr-4 font-medium text-white">{row.brand}</td>
                    <td className="py-2 pr-4"><span style={{ color: AGG_COLOR[row.aggregator?.toLowerCase()] ?? AGG_COLOR.default }}>{aggDisplayName(row.aggregator || "")}</span></td>
                    <td className="py-2 pr-4 text-neutral-300">{row.branch || "—"}</td>
                    <td className="py-2 pr-4"><span className={`font-bold ${ratingColor(row.rating_score)}`}>{row.rating_score != null ? row.rating_score.toFixed(2) : "—"}</span></td>
                    <td className="py-2 pr-4 text-neutral-400">{row.review_count || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && !error && (!data || (data.brands.length === 0 && data.latest_snapshot_rows.length === 0)) && (
        <div className={`${GLASS_CARD} p-6 text-center text-sm text-neutral-500`}>No rating data found for this period. Import ratings via the Ratings Entry admin panel.</div>
      )}
    </div>
  );
}

// ── Manila sub-component ──────────────────────────────────────────────────────
function ManilaRatingOverview({ dateFrom: extFrom, dateTo: extTo, approverName, pin, canLoad }: {
  dateFrom: string; dateTo: string; approverName: string; pin: string; canLoad: boolean;
}) {
  const [dateFrom, setDateFrom] = useState(extFrom || "");
  const [dateTo, setDateTo] = useState(extTo || "");
  const [activePreset, setActivePreset] = useState<(typeof DATE_PRESETS)[number]["label"] | null>(null);
  const [summary, setSummary] = useState<ManilaSummaryResp | null>(null);
  const [trend, setTrend] = useState<ManilaTrendResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchData = useCallback(async (override?: { from?: string; to?: string }) => {
    if (!canLoad) return;
    const df = override?.from !== undefined ? override.from : dateFrom;
    const dt = override?.to !== undefined ? override.to : dateTo;
    setLoading(true); setError("");
    try {
      const qs = new URLSearchParams({ approver_name: approverName.trim(), pin: pin.trim() });
      if (df) qs.set("date_from", df); if (dt) qs.set("date_to", dt);
      const [s, t] = await Promise.all([
        apiGet<ManilaSummaryResp>(`/api/admin/analytics/manila/low-ratings/summary?${qs}`),
        apiGet<ManilaTrendResp>(`/api/admin/analytics/manila/low-ratings/trend?${qs}`),
      ]);
      setSummary(s); setTrend(t);
    } catch (e: unknown) {
      setSummary(null); setTrend(null); setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, [approverName, pin, canLoad, dateFrom, dateTo]);

  useEffect(() => { if (canLoad) void fetchData(); }, [fetchData, canLoad]);

  function applyPreset(days: number | null) {
    const label = DATE_PRESETS.find((p) => p.days === days)?.label ?? null;
    setActivePreset(label);
    if (days == null) { setDateFrom(""); setDateTo(""); void fetchData({ from: "", to: "" }); return; }
    const to = new Date(), from = new Date(to); from.setDate(from.getDate() - (days - 1));
    const fs = from.toISOString().slice(0, 10), ts = to.toISOString().slice(0, 10);
    setDateFrom(fs); setDateTo(ts); void fetchData({ from: fs, to: ts });
  }

  // Derived stats
  const aggStats = useMemo(() => {
    if (!summary?.summary) return [];
    return Object.entries(summary.summary).map(([agg, branches]) => {
      let total = 0, s1 = 0, s2 = 0, s3 = 0;
      for (const ratingMap of Object.values(branches)) {
        s1 += ratingMap["1"] ?? 0; s2 += ratingMap["2"] ?? 0; s3 += ratingMap["3"] ?? 0;
        total += (ratingMap["1"] ?? 0) + (ratingMap["2"] ?? 0) + (ratingMap["3"] ?? 0);
      }
      return { agg, total, s1, s2, s3 };
    }).sort((a, b) => b.total - a.total);
  }, [summary]);

  const branchStats = useMemo(() => {
    if (!summary?.summary) return [];
    const map: Record<string, { total: number; s1: number; s2: number; s3: number }> = {};
    for (const branches of Object.values(summary.summary)) {
      for (const [branch, ratingMap] of Object.entries(branches)) {
        if (!map[branch]) map[branch] = { total: 0, s1: 0, s2: 0, s3: 0 };
        map[branch].s1 += ratingMap["1"] ?? 0; map[branch].s2 += ratingMap["2"] ?? 0; map[branch].s3 += ratingMap["3"] ?? 0;
        map[branch].total += (ratingMap["1"] ?? 0) + (ratingMap["2"] ?? 0) + (ratingMap["3"] ?? 0);
      }
    }
    return Object.entries(map).sort(([, a], [, b]) => b.total - a.total).map(([branch, s]) => ({ branch, ...s }));
  }, [summary]);

  const grandTotal = aggStats.reduce((s, r) => s + r.total, 0);
  const maxAgg = Math.max(...aggStats.map((a) => a.total), 1);
  const maxBranch = Math.max(...branchStats.map((b) => b.total), 1);

  // Trend chart: group by month
  const trendChartData = useMemo(() => {
    const rows = trend?.rows ?? [];
    const byMonth: Record<string, { foodpanda: number; grab: number }> = {};
    for (const r of rows) {
      const m = (r.month || "").slice(0, 7);
      if (!byMonth[m]) byMonth[m] = { foodpanda: 0, grab: 0 };
      const k = (r.aggregator || "").toLowerCase();
      if (k === "foodpanda") byMonth[m].foodpanda += r.count ?? 0;
      else if (k === "grab" || k === "grabfood") byMonth[m].grab += r.count ?? 0;
    }
    return Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([month, vals]) => ({ month, ...vals }));
  }, [trend]);

  const hasData = grandTotal > 0;

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className={`${GLASS_CARD} p-5`}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <h2 className={T_SECTION}>Ratings Overview (Manila)</h2>
            </div>
            <p className={T_CAPTION}>Low-rating count summary by aggregator and branch. Registered via Ratings Entry.</p>
          </div>
          <button type="button" onClick={() => void fetchData()} disabled={loading || !canLoad} className={SECONDARY_BUTTON + " inline-flex items-center gap-2 text-sm"}>
            {loading ? <Spinner size="sm" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-neutral-500">Period:</span>
          {DATE_PRESETS.map((p) => (
            <button key={p.label} type="button" onClick={() => applyPreset(p.days)}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${activePreset === p.label ? "bg-violet-600 text-white" : "border border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"}`}>
              {p.label}
            </button>
          ))}
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setActivePreset(null); }} className="rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200" />
          <span className="text-xs text-neutral-500">→</span>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setActivePreset(null); }} className="rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200" />
          <button type="button" onClick={() => void fetchData()} disabled={loading || !canLoad}
            className="rounded-lg border border-violet-600/50 bg-violet-600/20 px-3 py-1 text-xs font-medium text-violet-300 hover:bg-violet-600/30 disabled:opacity-50">
            Apply
          </button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-rose-800 bg-rose-950/30 px-4 py-3 text-sm text-rose-300">{error}</div>}
      {loading && <div className="flex justify-center py-8"><Spinner /></div>}

      {!loading && hasData && (
        <>
          {/* Grand total hero */}
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-5 py-4">
            <div className="text-xs font-semibold uppercase tracking-[0.15em] text-amber-400">Total Low Ratings</div>
            <div className="mt-1 text-4xl font-bold text-white">{grandTotal.toLocaleString()}</div>
            <div className="mt-0.5 text-xs text-neutral-500">across all aggregators in selected period</div>
          </div>

          {/* Aggregator breakdown */}
          <div className={`${GLASS_CARD} p-5`}>
            <h3 className={`${T_SECTION} mb-4`}>By Aggregator</h3>
            <div className="space-y-4">
              {aggStats.map(({ agg, total, s1, s2, s3 }) => {
                const cfg = manilaAggConfig(agg);
                const barPct = (total / maxAgg) * 100;
                return (
                  <div key={agg}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block h-2.5 w-2.5 rounded-full ${cfg.dot}`} />
                        <span className="font-medium text-neutral-200">{aggDisplayName(agg)}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-rose-400 font-semibold">{s1}×⭐</span>
                        <span className="text-amber-400 font-semibold">{s2}×⭐⭐</span>
                        <span className="text-yellow-300 font-semibold">{s3}×⭐⭐⭐</span>
                        <span className="font-bold text-neutral-100">{total}</span>
                      </div>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
                      <div className={`h-full rounded-full ${cfg.bar}`} style={{ width: `${barPct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Branch breakdown */}
          <div className={`${GLASS_CARD} p-5`}>
            <h3 className={`${T_SECTION} mb-4`}>By Branch</h3>
            <div className="space-y-3">
              {branchStats.map(({ branch, total, s1, s2, s3 }) => {
                const barPct = (total / maxBranch) * 100;
                const pct = grandTotal > 0 ? ((total / grandTotal) * 100).toFixed(1) : "0";
                return (
                  <div key={branch}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-neutral-200">{branch}</span>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-rose-400">{s1}×⭐</span>
                        <span className="text-amber-400">{s2}×⭐⭐</span>
                        <span className="text-yellow-300">{s3}×⭐⭐⭐</span>
                        <span className="font-bold text-neutral-100">{total}</span>
                        <span className="text-neutral-500">{pct}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
                      <div className="h-full rounded-full bg-violet-500" style={{ width: `${barPct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Monthly trend chart */}
          {trendChartData.length > 0 && (
            <div className={`${GLASS_CARD} p-5`}>
              <h3 className={`${T_SECTION} mb-3`}>Monthly Low Rating Trend</h3>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendChartData} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                    <XAxis dataKey="month" stroke="#a3a3a3" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#a3a3a3" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="foodpanda" name="FoodPanda" fill="#ec4899" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="grab" name="GrabFood" fill="#22c55e" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className={`${T_CAPTION} mt-2`}>Stacked monthly count of low ratings (1–3 ⭐) by aggregator.</p>
            </div>
          )}
        </>
      )}

      {!loading && !error && !hasData && (
        <div className={`${GLASS_CARD} p-6 text-center text-sm text-neutral-500`}>
          No low rating data found for this period. Register ratings via the Ratings Entry admin panel.
        </div>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function ManilaOverallRatingsTab({
  dateFrom,
  dateTo,
  approverName,
  pin,
  stepUpReady,
  city = "manila",
}: {
  dateFrom: string;
  dateTo: string;
  approverName: string;
  pin: string;
  stepUpReady: boolean;
  city?: "dubai" | "manila";
}) {
  const canLoad = !!approverName.trim() && !!pin.trim() && stepUpReady;

  if (!stepUpReady) {
    return (
      <div className={`${GLASS_CARD} p-6`}>
        <p className="text-sm text-neutral-400">
          Complete Security verification (MFA / PIN step-up) above to load {city === "dubai" ? "Dubai" : "Manila"} overall ratings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="sales-manila-overall-ratings">
      {city === "dubai" ? (
        <DubaiOverallRatings dateFrom={dateFrom} dateTo={dateTo} approverName={approverName} pin={pin} canLoad={canLoad} />
      ) : (
        <ManilaRatingOverview dateFrom={dateFrom} dateTo={dateTo} approverName={approverName} pin={pin} canLoad={canLoad} />
      )}
    </div>
  );
}
