"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { BADGE_INFO, SECONDARY_BUTTON } from "@/lib/ui-tokens";
import { Spinner } from "@/components/ui/Spinner";

const BRANDS = ["Sushi Zen", "Ramen Zen", "All Veggie Sushi", "J-Deli"] as const;
type Brand = (typeof BRANDS)[number];

const BRAND_CONFIG: Record<Brand, { color: string; bg: string; border: string; text: string }> = {
  "Sushi Zen": {
    color: "#6366f1",
    bg: "bg-indigo-500/20",
    border: "border-indigo-500",
    text: "text-indigo-400",
  },
  "Ramen Zen": {
    color: "#f97316",
    bg: "bg-orange-500/20",
    border: "border-orange-500",
    text: "text-orange-400",
  },
  "All Veggie Sushi": {
    color: "#22c55e",
    bg: "bg-green-500/20",
    border: "border-green-500",
    text: "text-green-400",
  },
  "J-Deli": {
    color: "#a855f7",
    bg: "bg-purple-500/20",
    border: "border-purple-500",
    text: "text-purple-400",
  },
};

const AGG_COLOR: Record<string, string> = {
  Careem: "text-orange-400",
  NOON: "text-indigo-400",
  Talabat: "text-red-400",
  Keeta: "text-emerald-400",
  Deliveroo: "text-blue-400",
  Smiles: "text-purple-400",
};

const AGG_LINE_COLOR: Record<string, string> = {
  Careem: "#f97316",
  NOON: "#6366f1",
  Talabat: "#ef4444",
  Keeta: "#22c55e",
  Deliveroo: "#3b82f6",
  Smiles: "#a855f7",
};

const DATE_PRESETS = [
  { label: "7D" as const, days: 7 },
  { label: "30D" as const, days: 30 },
  { label: "90D" as const, days: 90 },
  { label: "All" as const, days: null },
];

export type DubaiAggregatorRatingsByBrandResp = {
  ok?: boolean;
  date_from: string;
  date_to: string;
  brand: string;
  branches: string[];
  aggregators: string[];
  matrix: Record<string, Record<string, { avg: number | null; latest: number | null; count: number } | undefined>>;
  trend: Array<{
    record_date: string;
    by_branch_agg: Record<string, Record<string, number>>;
  }>;
  distinct_days: number;
  date_range: { min: string; max: string };
};

type Props = {
  approverName: string;
  pin: string;
  stepUpReady: boolean;
};

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
    } catch {
      /* ignore */
    }
    if (res.status === 405 || /method not allowed/i.test(detail)) {
      throw new Error(
        "API may not be deployed or is outdated (405). Please deploy the FastAPI containing aggregator-ratings / by-brand.",
      );
    }
    throw new Error(detail || `GET ${path} failed`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

function defaultWideRange() {
  const to = new Date();
  return { from: "2025-10-01", to: to.toISOString().slice(0, 10) };
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

export default function AggregatorRatingsTab({ approverName, pin, stepUpReady }: Props) {
  const [selectedBrand, setSelectedBrand] = useState<Brand>("Sushi Zen");
  const [dateFrom, setDateFrom] = useState(() => defaultWideRange().from);
  const [dateTo, setDateTo] = useState(() => defaultWideRange().to);
  const [activePreset, setActivePreset] = useState<(typeof DATE_PRESETS)[number]["label"] | null>(null);
  const [data, setData] = useState<DubaiAggregatorRatingsByBrandResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);

  const dateFromRef = useRef(dateFrom);
  const dateToRef = useRef(dateTo);
  dateFromRef.current = dateFrom;
  dateToRef.current = dateTo;

  const canLoad = !!approverName.trim() && !!pin.trim() && stepUpReady;

  const fetchData = useCallback(
    async (override?: { from?: string; to?: string }) => {
      if (!canLoad) return;
      const df = override?.from !== undefined ? override.from : dateFromRef.current;
      const dt = override?.to !== undefined ? override.to : dateToRef.current;
      setLoading(true);
      setError("");
      try {
        const qs = new URLSearchParams({
          brand: selectedBrand,
          approver_name: approverName.trim(),
          pin: pin.trim(),
        });
        if (df) qs.set("date_from", df);
        if (dt) qs.set("date_to", dt);
        const json = await apiGet<DubaiAggregatorRatingsByBrandResp>(
          `/api/admin/analytics/dubai/aggregator-ratings/by-brand?${qs}`,
        );
        setData(json);
        setSelectedBranch(null);
      } catch (e: unknown) {
        setData(null);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [approverName, pin, canLoad, selectedBrand],
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

  const trendChartData = useMemo(() => {
    if (!data?.trend?.length) return [];
    return data.trend.map((t) => {
      const row: Record<string, string | number | null> = { date: t.record_date };
      if (selectedBranch) {
        data.aggregators.forEach((agg) => {
          row[agg] = t.by_branch_agg?.[selectedBranch]?.[agg] ?? null;
        });
      } else {
        data.aggregators.forEach((agg) => {
          const scores = data.branches
            .map((br) => t.by_branch_agg?.[br]?.[agg])
            .filter((v): v is number => v != null && Number.isFinite(v));
          row[agg] =
            scores.length > 0
              ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
              : null;
        });
      }
      return row;
    });
  }, [data, selectedBranch]);

  const hasMatrix = (data?.branches?.length ?? 0) > 0 && (data?.aggregators?.length ?? 0) > 0;

  return (
    <div className="space-y-5 px-1">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-400" />
              <h2 className="text-lg font-semibold text-white">Aggregator Ratings (Dubai)</h2>
            </div>
            <p className="text-xs text-neutral-500">
              Branch × aggregator averages for the selected brand. Click a branch row to focus the trend chart.
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

        <div className="mb-4 flex flex-wrap gap-2">
          {BRANDS.map((brand) => {
            const cfg = BRAND_CONFIG[brand];
            const isActive = selectedBrand === brand;
            return (
              <button
                key={brand}
                type="button"
                onClick={() => setSelectedBrand(brand)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  isActive
                    ? `${cfg.bg} border ${cfg.border} ${cfg.text}`
                    : "border border-transparent text-gray-400 hover:bg-white/5 hover:text-gray-200"
                }`}
              >
                <span
                  className="h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: cfg.color, opacity: isActive ? 1 : 0.4 }}
                />
                {brand}
              </button>
            );
          })}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-lg bg-white/5 p-1">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p.days)}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                  activePreset === p.label ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-gray-200"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <span className="text-gray-600">|</span>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="text-xs uppercase tracking-wide text-gray-500">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setActivePreset(null);
              }}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-gray-200 transition-colors focus:border-indigo-500 focus:outline-none"
            />
            <label className="text-xs uppercase tracking-wide text-gray-500">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setActivePreset(null);
              }}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-gray-200 transition-colors focus:border-indigo-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void fetchData()}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
            >
              Apply
            </button>
          </div>
          {data ? (
            <span className="ml-auto text-xs text-gray-500">
              {data.distinct_days} day(s) · {data.date_range?.min || "—"} → {data.date_range?.max || "—"}
            </span>
          ) : null}
        </div>

        {error ? (
          <div className={BADGE_INFO + " mb-4 px-3 py-2 text-xs whitespace-pre-wrap"}>{error}</div>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <div className="mr-3 h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            Loading…
          </div>
        ) : null}

        {!loading && data && !hasMatrix ? (
          <div className="py-16 text-center text-gray-500">
            <p className="mb-3 text-4xl">📭</p>
            <p className="font-medium text-gray-300">No rating data for this brand and period</p>
            <p className="mt-1 text-sm">Try another brand or widen the date range.</p>
          </div>
        ) : null}

        {!loading && data && hasMatrix ? (
          <div className="space-y-5">
            <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: BRAND_CONFIG[selectedBrand].color }}
                    />
                    {selectedBrand} — Branch × Aggregator Rating
                  </h3>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Average over {data.distinct_days} day(s)
                    <span className="ml-1 text-emerald-400">●</span> ≥4.5
                    <span className="ml-1 text-amber-400">●</span> ≥4.0
                    <span className="ml-1 text-red-400">●</span> under 4.0
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="sticky left-0 z-10 w-44 bg-[#0f1117] px-5 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-gray-500">
                        Branch
                      </th>
                      {data.aggregators.map((agg) => (
                        <th
                          key={agg}
                          className={`px-5 py-3 text-center text-[11px] font-medium uppercase tracking-widest ${
                            AGG_COLOR[agg] ?? "text-gray-400"
                          }`}
                        >
                          {agg}
                        </th>
                      ))}
                      <th className="px-5 py-3 text-center text-[11px] font-semibold uppercase tracking-widest text-white">
                        Avg
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.branches.map((branch, bIdx) => {
                      const branchScores = data.aggregators
                        .map((agg) => data.matrix[branch]?.[agg]?.avg)
                        .filter((v): v is number => v != null && Number.isFinite(v));
                      const branchAvg =
                        branchScores.length > 0
                          ? branchScores.reduce((a, b) => a + b, 0) / branchScores.length
                          : null;

                      return (
                        <tr
                          key={branch}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedBranch(selectedBranch === branch ? null : branch)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ")
                              setSelectedBranch(selectedBranch === branch ? null : branch);
                          }}
                          className={`cursor-pointer border-b border-white/5 transition-all hover:bg-white/[0.04] ${
                            bIdx % 2 ? "bg-white/[0.02]" : ""
                          } ${selectedBranch === branch ? "bg-white/[0.06] ring-1 ring-inset ring-white/20" : ""}`}
                        >
                          <td className="sticky left-0 z-10 bg-[#0f1117] px-5 py-4 font-medium text-gray-200">
                            <span className="flex items-center gap-2">
                              {selectedBranch === branch ? (
                                <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-indigo-400" />
                              ) : null}
                              {branch}
                            </span>
                          </td>
                          {data.aggregators.map((agg) => {
                            const cell = data.matrix[branch]?.[agg];
                            const avg = cell?.avg ?? null;
                            const latest = cell?.latest ?? null;
                            const showLatest =
                              latest != null &&
                              avg != null &&
                              Number.isFinite(latest) &&
                              Number.isFinite(avg) &&
                              Math.abs(latest - avg) > 0.01;
                            return (
                              <td key={agg} className={`px-5 py-4 text-center ${ratingBg(avg)}`}>
                                {avg != null && Number.isFinite(avg) ? (
                                  <div className="flex flex-col items-center gap-0.5">
                                    <span className={`text-base font-bold ${ratingColor(avg)}`}>
                                      {avg.toFixed(2)}
                                    </span>
                                    {showLatest ? (
                                      <span className={`text-[10px] ${ratingColor(latest)}`}>
                                        latest {latest.toFixed(1)}
                                      </span>
                                    ) : null}
                                  </div>
                                ) : (
                                  <span className="text-xs text-gray-700">—</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-5 py-4 text-center">
                            {branchAvg != null ? (
                              <span className={`text-base font-bold ${ratingColor(branchAvg)}`}>
                                {branchAvg.toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-gray-700">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-white/20 bg-white/[0.04]">
                      <td className="sticky left-0 z-10 bg-[#141720] px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                        All Branches
                      </td>
                      {data.aggregators.map((agg) => {
                        const scores = data.branches
                          .map((br) => data.matrix[br]?.[agg]?.avg)
                          .filter((v): v is number => v != null && Number.isFinite(v));
                        const aggAvg =
                          scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
                        return (
                          <td key={agg} className="px-5 py-3 text-center">
                            {aggAvg != null ? (
                              <span className={`font-bold ${ratingColor(aggAvg)}`}>{aggAvg.toFixed(2)}</span>
                            ) : (
                              "—"
                            )}
                          </td>
                        );
                      })}
                      <td className="px-5 py-3 text-center">
                        {(() => {
                          const all = data.branches.flatMap((br) =>
                            data.aggregators
                              .map((ag) => data.matrix[br]?.[ag]?.avg)
                              .filter((v): v is number => v != null && Number.isFinite(v)),
                          );
                          const overall =
                            all.length > 0 ? all.reduce((a, b) => a + b, 0) / all.length : null;
                          return overall != null ? (
                            <span className={`font-bold ${ratingColor(overall)}`}>{overall.toFixed(2)}</span>
                          ) : (
                            "—"
                          );
                        })()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {trendChartData.length > 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      Rating Trend
                      {selectedBranch ? (
                        <span className="ml-2 font-normal text-indigo-400">— {selectedBranch}</span>
                      ) : null}
                    </h3>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {selectedBranch
                        ? `${selectedBranch} · click row again to clear`
                        : "All branches average · click a branch row to focus"}
                    </p>
                  </div>
                  {selectedBranch ? (
                    <button
                      type="button"
                      onClick={() => setSelectedBranch(null)}
                      className="rounded bg-white/5 px-2 py-1 text-xs text-gray-500 transition-colors hover:bg-white/10 hover:text-gray-300"
                    >
                      Clear selection
                    </button>
                  ) : null}
                </div>

                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={trendChartData} margin={{ top: 4, right: 12, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "#6b7280", fontSize: 10 }}
                      tickFormatter={(d) => (typeof d === "string" ? d.slice(5) : String(d))}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      domain={[3.5, 5.0]}
                      tick={{ fill: "#6b7280", fontSize: 10 }}
                      tickFormatter={(v) => Number(v).toFixed(1)}
                      width={36}
                    />
                    <ReferenceLine y={4.5} stroke="rgba(34,197,94,0.25)" strokeDasharray="4 4" />
                    <ReferenceLine y={4.0} stroke="rgba(245,158,11,0.25)" strokeDasharray="4 4" />
                    <Tooltip
                      contentStyle={{
                        background: "#1e2433",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "8px",
                        fontSize: 12,
                        color: "#fff",
                      }}
                      formatter={(value: number | string, name: string) => [
                        value != null && Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "—",
                        name,
                      ]}
                      labelFormatter={(l) => `📅 ${l}`}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {data.aggregators.map((agg) => (
                      <Line
                        key={agg}
                        dataKey={agg}
                        name={agg}
                        stroke={AGG_LINE_COLOR[agg] ?? "#9ca3af"}
                        strokeWidth={1.5}
                        dot={false}
                        activeDot={{ r: 4 }}
                        connectNulls={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>

                <div className="mt-2 flex justify-end gap-4">
                  <span className="flex items-center gap-1 text-[10px] text-emerald-400/60">
                    <span className="h-px w-4 border-t border-dashed border-emerald-400/40" /> 4.5 target
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-amber-400/60">
                    <span className="h-px w-4 border-t border-dashed border-amber-400/40" /> 4.0 min
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
