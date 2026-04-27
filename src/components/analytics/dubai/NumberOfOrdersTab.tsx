"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MapPin, Package, RefreshCw, ShoppingBag, TrendingUp, Trophy } from "lucide-react";

import { getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";
import { BADGE_INFO, SECONDARY_BUTTON } from "@/lib/ui-tokens";
import { Spinner } from "@/components/ui/Spinner";

const BRANDS = ["Sushi Zen", "Ramen Zen", "All Veggie Sushi", "J-Deli"] as const;
const ALL_BRAND_TABS = ["Overall", ...BRANDS] as const;
const BRANCHES = ["Business Bay", "JLT", "Arjan", "Al Hudaiba", "Al Barsha"] as const;
const DISPLAY_AGGS = ["Careem", "NOON", "Talabat", "Keeta", "Deliveroo", "Smiles"] as const;
const CHART_AGG_KEYS = ["Careem", "NOON", "Talabat", "Keeta", "Deliveroo", "Smiles", "Dine-in"] as const;

type BrandTab = (typeof ALL_BRAND_TABS)[number];

const BRAND_CONFIG: Record<
  BrandTab,
  { color: string; bg: string; border: string; text: string }
> = {
  Overall: {
    color: "#e2e8f0",
    bg: "bg-white/10",
    border: "border-white/40",
    text: "text-white",
  },
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

const AGG_CHART_COLORS: Record<string, string> = {
  Careem: "#f97316",
  NOON: "#6366f1",
  Talabat: "#ef4444",
  Keeta: "#22c55e",
  Deliveroo: "#3b82f6",
  Smiles: "#a855f7",
  "Dine-in": "#64748b",
};

const AGG_COL_STYLE: Record<string, string> = {
  Careem: "text-orange-400",
  NOON: "text-indigo-400",
  Talabat: "text-red-400",
  Keeta: "text-emerald-400",
  Deliveroo: "text-blue-400",
  Smiles: "text-purple-400",
  Others: "text-gray-400",
};

const DATE_PRESETS = [
  { label: "7D" as const, days: 7 },
  { label: "30D" as const, days: 30 },
  { label: "90D" as const, days: 90 },
  { label: "All" as const, days: null },
];

const PAGE_SIZE = 30;

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
    throw new Error(detail || `GET ${path} failed`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export type DubaiOrderCountsResp = {
  ok?: boolean;
  daily: Array<{
    order_date: string;
    total_orders: number;
    by_aggregator: Record<string, number>;
    by_branch: Record<string, number>;
  }>;
  raw: Array<{
    order_date: string;
    brand: string;
    aggregator: string;
    branch: string;
    order_count: number;
  }>;
  summary: {
    total_orders: number;
    by_aggregator: Record<string, number>;
    by_branch: Record<string, number>;
    date_from: string;
    date_to: string;
    brand: string;
  };
};

// Maps analytics page branch codes → order-counts branch names (as stored in DB)
const BRANCH_CODE_TO_ORDER_NAME: Record<string, string> = {
  BB: "Business Bay",
  JLT: "JLT",
  ARJ: "Arjan",
  AM: "Al Hudaiba",
  AB: "Al Barsha",
};

type RawRow = DubaiOrderCountsResp["raw"][number];

function buildFromRaw(raw: RawRow[], brand: string): DubaiOrderCountsResp {
  const dailyMap = new Map<
    string,
    { order_date: string; total_orders: number; by_aggregator: Record<string, number>; by_branch: Record<string, number> }
  >();
  const summaryAgg: Record<string, number> = {};
  const summaryBranch: Record<string, number> = {};
  let summaryTotal = 0;
  let dateFrom = "";
  let dateTo = "";

  for (const r of raw) {
    const cnt = r.order_count || 0;
    const existing = dailyMap.get(r.order_date) ?? {
      order_date: r.order_date,
      total_orders: 0,
      by_aggregator: {},
      by_branch: {},
    };
    existing.total_orders += cnt;
    existing.by_aggregator[r.aggregator] = (existing.by_aggregator[r.aggregator] ?? 0) + cnt;
    existing.by_branch[r.branch] = (existing.by_branch[r.branch] ?? 0) + cnt;
    dailyMap.set(r.order_date, existing);

    summaryTotal += cnt;
    summaryAgg[r.aggregator] = (summaryAgg[r.aggregator] ?? 0) + cnt;
    summaryBranch[r.branch] = (summaryBranch[r.branch] ?? 0) + cnt;
    if (!dateFrom || r.order_date < dateFrom) dateFrom = r.order_date;
    if (!dateTo || r.order_date > dateTo) dateTo = r.order_date;
  }

  return {
    ok: true,
    daily: Array.from(dailyMap.values()),
    raw,
    summary: {
      total_orders: summaryTotal,
      by_aggregator: summaryAgg,
      by_branch: summaryBranch,
      date_from: dateFrom,
      date_to: dateTo,
      brand,
    },
  };
}

type Props = {
  approverName: string;
  pin: string;
  stepUpReady: boolean;
  externalDateFrom?: string;
  externalDateTo?: string;
  externalBranchCode?: string;
};

function mergeOrderCountsResponses(responses: DubaiOrderCountsResp[]): DubaiOrderCountsResp {
  const dailyMap = new Map<string, {
    order_date: string;
    total_orders: number;
    by_aggregator: Record<string, number>;
    by_branch: Record<string, number>;
  }>();

  for (const r of responses) {
    for (const day of r.daily || []) {
      const existing = dailyMap.get(day.order_date) ?? {
        order_date: day.order_date,
        total_orders: 0,
        by_aggregator: {},
        by_branch: {},
      };
      existing.total_orders += day.total_orders;
      for (const [k, v] of Object.entries(day.by_aggregator || {})) {
        existing.by_aggregator[k] = (existing.by_aggregator[k] ?? 0) + v;
      }
      for (const [k, v] of Object.entries(day.by_branch || {})) {
        existing.by_branch[k] = (existing.by_branch[k] ?? 0) + v;
      }
      dailyMap.set(day.order_date, existing);
    }
  }

  const raw = responses.flatMap((r) => r.raw || []);

  const summaryAgg: Record<string, number> = {};
  const summaryBranch: Record<string, number> = {};
  let summaryTotal = 0;
  let dateFrom = "";
  let dateTo = "";

  for (const r of responses) {
    const s = r.summary;
    if (!s) continue;
    summaryTotal += s.total_orders;
    for (const [k, v] of Object.entries(s.by_aggregator || {})) {
      summaryAgg[k] = (summaryAgg[k] ?? 0) + v;
    }
    for (const [k, v] of Object.entries(s.by_branch || {})) {
      summaryBranch[k] = (summaryBranch[k] ?? 0) + v;
    }
    if (!dateFrom || s.date_from < dateFrom) dateFrom = s.date_from;
    if (!dateTo || s.date_to > dateTo) dateTo = s.date_to;
  }

  return {
    ok: true,
    daily: Array.from(dailyMap.values()),
    raw,
    summary: {
      total_orders: summaryTotal,
      by_aggregator: summaryAgg,
      by_branch: summaryBranch,
      date_from: dateFrom,
      date_to: dateTo,
      brand: "Overall",
    },
  };
}

function defaultWideRange() {
  const to = new Date();
  return { from: "2025-10-01", to: to.toISOString().slice(0, 10) };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function heatmapBg(value: number, max: number, brandHex: string): CSSProperties {
  if (!value || max <= 0) return {};
  const intensity = Math.min(value / max, 1);
  const alpha = 0.05 + intensity * 0.3;
  const { r, g, b } = hexToRgb(brandHex);
  return { backgroundColor: `rgba(${r},${g},${b},${alpha})` };
}

export default function NumberOfOrdersTab({ approverName, pin, stepUpReady, externalDateFrom, externalDateTo, externalBranchCode }: Props) {
  const [brand, setBrand] = useState<BrandTab>("Sushi Zen");
  const [dateFrom, setDateFrom] = useState(() => externalDateFrom || defaultWideRange().from);
  const [dateTo, setDateTo] = useState(() => externalDateTo || defaultWideRange().to);
  const [activePreset, setActivePreset] = useState<(typeof DATE_PRESETS)[number]["label"] | null>(null);
  const [chartMode, setChartMode] = useState<"Total" | "By Aggregator">("Total");
  const [data, setData] = useState<DubaiOrderCountsResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);

  const dateFromRef = useRef(dateFrom);
  const dateToRef = useRef(dateTo);
  dateFromRef.current = dateFrom;
  dateToRef.current = dateTo;

  // Sync when the analytics page-level date range changes
  useEffect(() => {
    if (externalDateFrom && externalDateFrom !== dateFromRef.current) {
      setDateFrom(externalDateFrom);
      setActivePreset(null);
    }
  }, [externalDateFrom]);

  useEffect(() => {
    if (externalDateTo && externalDateTo !== dateToRef.current) {
      setDateTo(externalDateTo);
      setActivePreset(null);
    }
  }, [externalDateTo]);

  const canLoad = !!approverName.trim() && !!pin.trim() && stepUpReady;

  const fetchData = useCallback(
    async (override?: { from?: string; to?: string }) => {
      if (!canLoad) return;
      const df = override?.from !== undefined ? override.from : dateFromRef.current;
      const dt = override?.to !== undefined ? override.to : dateToRef.current;
      setLoading(true);
      setError("");
      try {
        if (brand === "Overall") {
          const results = await Promise.all(
            BRANDS.map(async (b) => {
              const qs = new URLSearchParams({
                brand: b,
                approver_name: approverName.trim(),
                pin: pin.trim(),
              });
              if (df) qs.set("date_from", df);
              if (dt) qs.set("date_to", dt);
              return apiGet<DubaiOrderCountsResp>(`/api/admin/analytics/dubai/order-counts?${qs}`);
            }),
          );
          setData(mergeOrderCountsResponses(results));
        } else {
          const qs = new URLSearchParams({
            brand,
            approver_name: approverName.trim(),
            pin: pin.trim(),
          });
          if (df) qs.set("date_from", df);
          if (dt) qs.set("date_to", dt);
          const json = await apiGet<DubaiOrderCountsResp>(`/api/admin/analytics/dubai/order-counts?${qs}`);
          setData(json);
        }
        setPage(0);
      } catch (e: unknown) {
        setData(null);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [approverName, pin, brand, canLoad],
  );

  useEffect(() => {
    if (!canLoad) return;
    void fetchData();
  }, [brand, fetchData, canLoad]);

  // Filter fetched data by the page-level Store selection
  const displayData = useMemo(() => {
    if (!data) return null;
    const branchName = externalBranchCode ? (BRANCH_CODE_TO_ORDER_NAME[externalBranchCode] ?? null) : null;
    if (!branchName) return data;
    const filteredRaw = data.raw.filter((r) => r.branch === branchName);
    return buildFromRaw(filteredRaw, data.summary?.brand ?? brand);
  }, [data, externalBranchCode, brand]);

  const dailySorted = useMemo(() => {
    const d = displayData?.daily || [];
    return [...d].sort((a, b) => b.order_date.localeCompare(a.order_date));
  }, [displayData?.daily]);

  const dailyAsc = useMemo(() => {
    const d = displayData?.daily || [];
    return [...d].sort((a, b) => a.order_date.localeCompare(b.order_date));
  }, [displayData?.daily]);

  const chartRows = useMemo(() => {
    return dailyAsc.map((row) => {
      const o: Record<string, string | number> = {
        dateFull: row.order_date,
        date: row.order_date.slice(5),
        total: row.total_orders,
      };
      for (const k of CHART_AGG_KEYS) {
        o[k] = row.by_aggregator?.[k] ?? 0;
      }
      return o;
    });
  }, [dailyAsc]);

  const paginatedDaily = useMemo(() => {
    const start = page * PAGE_SIZE;
    return dailySorted.slice(start, start + PAGE_SIZE);
  }, [dailySorted, page]);

  const summary = displayData?.summary;
  const rawCount = displayData?.raw?.length ?? 0;
  const hasNoImportedRows = !loading && !error && canLoad && displayData && rawCount === 0;

  const topAgg = useMemo(() => {
    const m = summary?.by_aggregator || {};
    let best = "";
    let n = -1;
    for (const [k, v] of Object.entries(m)) {
      if (!k) continue;
      if (v > n) {
        n = v;
        best = k;
      }
    }
    const tot = summary?.total_orders ?? 0;
    const pct = tot > 0 && n >= 0 ? Math.round((n / tot) * 1000) / 10 : 0;
    return best && n >= 0 ? { name: best, count: n, pct } : { name: "—", count: 0, pct: 0 };
  }, [summary]);

  const topBranch = useMemo(() => {
    const m = summary?.by_branch || {};
    let best = "";
    let n = -1;
    for (const [k, v] of Object.entries(m)) {
      if (!k) continue;
      if (v > n) {
        n = v;
        best = k;
      }
    }
    const tot = summary?.total_orders ?? 0;
    const pct = tot > 0 && n >= 0 ? Math.round((n / tot) * 1000) / 10 : 0;
    return best && n >= 0 ? { name: best, count: n, pct } : { name: "—", count: 0, pct: 0 };
  }, [summary]);

  const crossTab = useMemo(() => {
    const raw = displayData?.raw || [];
    const out: Record<string, Record<string, number>> = {};
    for (const r of raw) {
      const br = r.branch || "";
      const ag = r.aggregator || "";
      if (!out[br]) out[br] = {};
      out[br][ag] = (out[br][ag] ?? 0) + (r.order_count || 0);
    }
    return out;
  }, [data?.raw]);

  const maxCellValue = useMemo(() => {
    let m = 0;
    for (const row of Object.values(crossTab)) {
      for (const v of Object.values(row)) {
        if (v > m) m = v;
      }
    }
    return m;
  }, [crossTab]);

  const othersTotal = useMemo(() => {
    if (!summary) return 0;
    let s = 0;
    for (const a of DISPLAY_AGGS) s += summary.by_aggregator?.[a] ?? 0;
    return Math.max(0, summary.total_orders - s);
  }, [summary]);

  const applyPreset = (p: (typeof DATE_PRESETS)[number]) => {
    setActivePreset(p.label);
    if (p.days === null) {
      setDateFrom("");
      setDateTo("");
      void fetchData({ from: "", to: "" });
      return;
    }
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - (p.days - 1));
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);
    setDateFrom(fromStr);
    setDateTo(toStr);
    void fetchData({ from: fromStr, to: toStr });
  };

  const brandCfg = BRAND_CONFIG[brand] ?? BRAND_CONFIG["Sushi Zen"];

  const kpiCards = useMemo(() => {
    if (!summary) return [];
    const dlen = dailyAsc.length;
    const avg =
      dlen > 0 ? Math.round(summary.total_orders / dlen).toLocaleString() : "—";
    return [
      {
        label: "TOTAL ORDERS",
        value: summary.total_orders.toLocaleString(),
        sub: `${dlen} days`,
        Icon: Package,
        accent: "from-indigo-500/20 to-indigo-500/5",
        border: "border-indigo-500/30",
      },
      {
        label: "AVG DAILY ORDERS",
        value: avg,
        sub: "per day",
        Icon: TrendingUp,
        accent: "from-blue-500/20 to-blue-500/5",
        border: "border-blue-500/30",
      },
      {
        label: "TOP AGGREGATOR",
        value: topAgg.name,
        sub:
          topAgg.name !== "—"
            ? `${topAgg.count.toLocaleString()} orders (${topAgg.pct}%)`
            : "—",
        Icon: Trophy,
        accent: "from-amber-500/20 to-amber-500/5",
        border: "border-amber-500/30",
      },
      {
        label: "TOP BRANCH",
        value: topBranch.name,
        sub:
          topBranch.name !== "—"
            ? `${topBranch.count.toLocaleString()} orders (${topBranch.pct}%)`
            : "—",
        Icon: MapPin,
        accent: "from-emerald-500/20 to-emerald-500/5",
        border: "border-emerald-500/30",
      },
    ];
  }, [summary, dailyAsc.length, topAgg, topBranch]);

  return (
    <div className="space-y-5 px-1">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-violet-400" />
              <h2 className="text-lg font-semibold text-white">Number of Orders (Dubai)</h2>
            </div>
            <p className="text-xs text-neutral-500">
              Manual aggregator × branch counts (imported from HQ spreadsheets). Dubai data only.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void fetchData()}
            disabled={loading || !canLoad}
            className={
              SECONDARY_BUTTON + " inline-flex items-center gap-2 text-sm"
            }
          >
            {loading ? <Spinner size="sm" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </button>
        </div>

        <div className="mb-1 flex flex-wrap gap-2">
          {ALL_BRAND_TABS.map((b) => {
            const cfg = BRAND_CONFIG[b];
            const isActive = brand === b;
            const isOverall = b === "Overall";
            return (
              <button
                key={b}
                type="button"
                onClick={() => setBrand(b)}
                className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                  isActive
                    ? `${cfg.bg} ${cfg.border} border-b-2 ${cfg.text}`
                    : "border-transparent text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
                } `}
              >
                {isOverall ? (
                  <span className="flex gap-0.5">
                    {(["#6366f1","#f97316","#22c55e","#a855f7"] as const).map((c, i) => (
                      <span key={i} className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: c, opacity: isActive ? 1 : 0.4 }} />
                    ))}
                  </span>
                ) : (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: cfg.color, opacity: isActive ? 1 : 0.4 }}
                  />
                )}
                {b}
              </button>
            );
          })}
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <p className="text-[11px] text-neutral-600">
            ※ Date range syncs from Summary Range above. Brand filter N/A. Overall = all 4 brands combined.
          </p>
          {externalBranchCode && BRANCH_CODE_TO_ORDER_NAME[externalBranchCode] ? (
            <span className="rounded-full border border-indigo-500/40 bg-indigo-500/10 px-2.5 py-0.5 text-[11px] text-indigo-300">
              📍 {BRANCH_CODE_TO_ORDER_NAME[externalBranchCode]} only
            </span>
          ) : externalBranchCode && !BRANCH_CODE_TO_ORDER_NAME[externalBranchCode] ? (
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-[11px] text-amber-300">
              ⚠ {externalBranchCode} — no order count data for this branch
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-lg bg-white/5 p-1">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                disabled={!canLoad || loading}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                  activePreset === p.label
                    ? "bg-indigo-600 text-white"
                    : "text-neutral-400 hover:text-neutral-200"
                } `}
              >
                {p.label}
              </button>
            ))}
          </div>
          <span className="text-neutral-600">|</span>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="text-[10px] uppercase tracking-wide text-neutral-500">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setActivePreset(null);
              }}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-neutral-200 transition-colors focus:border-indigo-500 focus:outline-none"
            />
            <label className="text-[10px] uppercase tracking-wide text-neutral-500">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setActivePreset(null);
              }}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-neutral-200 transition-colors focus:border-indigo-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void fetchData()}
              disabled={!canLoad || loading}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        </div>

        {!canLoad ? (
          <p className="mt-3 text-xs text-neutral-500">
            Enter approver name and PIN above (sales analytics header) to load.
          </p>
        ) : null}
        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
        {hasNoImportedRows ? (
          <div className={`${BADGE_INFO} mt-4 space-y-2 px-4 py-3 text-left text-xs leading-relaxed text-neutral-200`}>
            <p className="font-semibold text-neutral-100">この期間・ブランドにデータがありません（すべて 0）</p>
            <p>
              手動インポート（Excel → Postgres）をまだ実行していない場合、サーバの{" "}
              <code className="text-violet-300">dubai_order_counts</code> テーブルは空です。
            </p>
            <p className="text-neutral-400">
              既に取り込み済みの場合は期間を広げるか、別ブランドを試してください。1 日だけに絞ると、その日の行が無いと 0 のままです。
            </p>
            <button
              type="button"
              className={
                SECONDARY_BUTTON + " mt-1 text-xs"
              }
              onClick={() => {
                const r = defaultWideRange();
                setDateFrom(r.from);
                setDateTo(r.to);
                setActivePreset(null);
                void fetchData({ from: r.from, to: r.to });
              }}
            >
              期間を 2025-10-01 〜 今日に戻す
            </button>
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 rounded-xl border border-white/10 py-16 text-neutral-400">
          <Spinner size="md" />
          <span>Loading…</span>
        </div>
      ) : null}

      {!loading && displayData ? (
        <>
          {displayData.daily.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] py-16 text-center text-neutral-500">
              <p className="mb-3 text-4xl">📭</p>
              <p className="font-medium text-neutral-300">No data for this period</p>
              <p className="mt-1 text-sm">Try expanding the date range or switching brand.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {kpiCards.map((card) => (
                  <div
                    key={card.label}
                    className={`relative overflow-hidden rounded-xl border ${card.border} bg-gradient-to-br ${card.accent} p-4 backdrop-blur-sm`}
                  >
                    <div className="absolute right-3 top-3 opacity-40">
                      <card.Icon className="h-7 w-7 text-white" strokeWidth={1.5} />
                    </div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                      {card.label}
                    </p>
                    <p className="mb-1 truncate text-2xl font-bold text-white">{card.value}</p>
                    <p className="text-xs text-neutral-500">{card.sub}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Daily Order Trend</h3>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {brand} · {dailyAsc.length} days · by aggregator
                    </p>
                  </div>
                  <div className="flex gap-1 rounded-lg bg-white/5 p-1">
                    {(["Total", "By Aggregator"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setChartMode(mode)}
                        className={`rounded px-3 py-1 text-xs transition-colors ${
                          chartMode === mode ? "bg-white/10 text-white" : "text-neutral-500 hover:text-neutral-300"
                        } `}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartRows} margin={{ top: 4, right: 12, bottom: 4, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: "#6b7280", fontSize: 11 }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fill: "#6b7280", fontSize: 11 }}
                        width={44}
                        tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#1e2433",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "8px",
                          color: "#fff",
                          fontSize: 12,
                        }}
                        formatter={(value: number | string, name: string) => [
                          typeof value === "number" ? value.toLocaleString() : value,
                          name,
                        ]}
                        labelFormatter={(_, payload) => {
                          const p = payload?.[0]?.payload as { dateFull?: string } | undefined;
                          return p?.dateFull ? `📅 ${p.dateFull}` : "";
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                      {chartMode === "Total" ? (
                        <Line
                          type="monotone"
                          dataKey="total"
                          name="Total"
                          stroke={brandCfg.color}
                          strokeWidth={2}
                          dot={dailyAsc.length <= 14}
                          activeDot={{ r: 5 }}
                        />
                      ) : (
                        CHART_AGG_KEYS.map((agg) => (
                          <Line
                            key={agg}
                            type="monotone"
                            dataKey={agg}
                            name={agg}
                            stroke={AGG_CHART_COLORS[agg] ?? "#9ca3af"}
                            strokeWidth={1.5}
                            dot={false}
                            activeDot={{ r: 4 }}
                          />
                        ))
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Daily Breakdown</h3>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      Newest first · {dailySorted.length} days
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-neutral-500">
                    <button
                      type="button"
                      className="rounded bg-white/5 px-2 py-1 hover:bg-white/10 disabled:opacity-30"
                      disabled={page === 0}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                    >
                      ‹ Prev
                    </button>
                    <span>
                      {dailySorted.length === 0
                        ? "0"
                        : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, dailySorted.length)}`}{" "}
                      / {dailySorted.length}
                    </span>
                    <button
                      type="button"
                      className="rounded bg-white/5 px-2 py-1 hover:bg-white/10 disabled:opacity-30"
                      disabled={(page + 1) * PAGE_SIZE >= dailySorted.length}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next ›
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-neutral-500">
                          Date
                        </th>
                        <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-neutral-500">
                          Total
                        </th>
                        {DISPLAY_AGGS.map((agg) => (
                          <th
                            key={agg}
                            className={`px-4 py-3 text-right text-[11px] font-medium uppercase tracking-widest ${AGG_COL_STYLE[agg] ?? "text-neutral-500"}`}
                          >
                            {agg}
                          </th>
                        ))}
                        <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-neutral-500">
                          Others
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedDaily.map((row, idx) => {
                        const by = row.by_aggregator || {};
                        const dispSum = DISPLAY_AGGS.reduce((s, a) => s + (by[a] ?? 0), 0);
                        const others = Math.max(0, row.total_orders - dispSum);
                        return (
                          <tr
                            key={row.order_date}
                            className={`border-b border-white/5 transition-colors hover:bg-white/[0.04] ${idx % 2 === 1 ? "bg-white/[0.02]" : ""}`}
                          >
                            <td className="px-5 py-3 font-mono text-xs text-neutral-300">{row.order_date}</td>
                            <td className="px-4 py-3 text-right font-bold text-white tabular-nums">
                              {row.total_orders.toLocaleString()}
                            </td>
                            {DISPLAY_AGGS.map((agg) => {
                              const v = by[agg] ?? 0;
                              return (
                                <td
                                  key={agg}
                                  className={`px-4 py-3 text-right tabular-nums ${
                                    v > 0 ? AGG_COL_STYLE[agg] ?? "text-neutral-300" : "text-neutral-600"
                                  }`}
                                >
                                  {v > 0 ? v.toLocaleString() : "—"}
                                </td>
                              );
                            })}
                            <td className="px-4 py-3 text-right tabular-nums text-neutral-500">
                              {others > 0 ? others.toLocaleString() : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {summary ? (
                      <tfoot>
                        <tr className="border-t border-white/20 bg-white/[0.04]">
                          <td className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                            Period Total
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-white tabular-nums">
                            {summary.total_orders.toLocaleString()}
                          </td>
                          {DISPLAY_AGGS.map((agg) => {
                            const v = summary.by_aggregator?.[agg] ?? 0;
                            return (
                              <td
                                key={agg}
                                className={`px-4 py-3 text-right font-semibold tabular-nums ${AGG_COL_STYLE[agg] ?? "text-neutral-300"}`}
                              >
                                {v > 0 ? v.toLocaleString() : "—"}
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-right font-semibold text-neutral-400 tabular-nums">
                            {othersTotal > 0 ? othersTotal.toLocaleString() : "—"}
                          </td>
                        </tr>
                      </tfoot>
                    ) : null}
                  </table>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                <div className="border-b border-white/10 px-5 py-4">
                  <h3 className="text-sm font-semibold text-white">Branch × Aggregator</h3>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    Period total · color intensity = order volume ({brand})
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="w-40 px-5 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-neutral-500">
                          Branch
                        </th>
                        {DISPLAY_AGGS.map((agg) => (
                          <th
                            key={agg}
                            className={`px-4 py-3 text-right text-[11px] font-medium uppercase tracking-widest ${AGG_COL_STYLE[agg]}`}
                          >
                            {agg}
                          </th>
                        ))}
                        <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-white">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {BRANCHES.map((branch, bIdx) => {
                        const rowTotal = DISPLAY_AGGS.reduce(
                          (s, agg) => s + (crossTab[branch]?.[agg] ?? 0),
                          0,
                        );
                        if (rowTotal === 0) return null;
                        return (
                          <tr
                            key={branch}
                            className={`border-b border-white/5 transition-colors hover:bg-white/[0.04] ${bIdx % 2 === 1 ? "bg-white/[0.02]" : ""}`}
                          >
                            <td className="px-5 py-3 font-medium text-neutral-200">{branch}</td>
                            {DISPLAY_AGGS.map((agg) => {
                              const v = crossTab[branch]?.[agg] ?? 0;
                              return (
                                <td
                                  key={agg}
                                  className="px-4 py-3 text-right text-neutral-200 transition-all tabular-nums"
                                  style={heatmapBg(v, maxCellValue, brandCfg.color)}
                                >
                                  {v > 0 ? v.toLocaleString() : <span className="text-neutral-700">—</span>}
                                </td>
                              );
                            })}
                            <td className="px-4 py-3 text-right font-bold text-white tabular-nums">
                              {rowTotal.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {summary ? (
                      <tfoot>
                        <tr className="border-t border-white/20 bg-white/[0.04]">
                          <td className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                            Total
                          </td>
                          {DISPLAY_AGGS.map((agg) => {
                            const v = summary.by_aggregator?.[agg] ?? 0;
                            return (
                              <td
                                key={agg}
                                className={`px-4 py-3 text-right font-semibold tabular-nums ${AGG_COL_STYLE[agg] ?? "text-neutral-300"}`}
                              >
                                {v > 0 ? v.toLocaleString() : "—"}
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-right font-bold text-white tabular-nums">
                            {summary.total_orders.toLocaleString()}
                          </td>
                        </tr>
                      </tfoot>
                    ) : null}
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
