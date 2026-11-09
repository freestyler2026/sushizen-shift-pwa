"use client";

// Dubai year-on-year by store (owner, 2026-11-09): orders and sales per month
// against the same month a year earlier. Both years come from UrbanPiper
// (pos_revenue_location_daily); 2025 was read back from Atlas on 2026-11-09.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarRange, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";
import {
  GLASS_CARD,
  SMALL_BUTTON,
  TAB_ACTIVE,
  TAB_CONTAINER,
  TAB_INACTIVE,
  TABLE_HEADER,
  T_CAPTION,
  T_SECTION,
} from "@/lib/ui-tokens";
import { Spinner } from "@/components/ui/Spinner";

type Cell = { orders: number; gross: number; net: number; net_flag: boolean };
type Pair = { cur: Cell; prev: Cell };
type Block = {
  stores: Record<string, Pair>;
  total: Pair;
  like_for_like: Pair;
};
type MonthBlock = Block & {
  month: number;
  key: string;
  has_current: boolean;
  has_previous: boolean;
  cutoff_day: number | null;
};
type YoYResp = {
  ok: boolean;
  year: number;
  previous_year: number;
  brand: string;
  brands: string[];
  latest_date: string;
  history_from: string;
  series_from?: string;
  stores: { code: string; name: string; closed: boolean }[];
  months: MonthBlock[];
  ytd: Block & { through_month: number; cutoff_day: number | null };
  series?: {
    latest_date: string;
    months: { key: string; stores: Record<string, Cell>; total: Cell; partial: boolean; through_day: number | null }[];
  };
};

const STORE_COLORS: Record<string, string> = {
  BB: "#a78bfa",
  JLT: "#38bdf8",
  ARJ: "#f97316",
  AM: "#22c55e",
  AB: "#f472b6",
  DSO: "#71717a",
  MIR: "#a1a1aa",
};
const TOTAL_COLOR = "#e4e4e7";
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (key: string) => `${MONTH_SHORT[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`;
const kFmt = (v: number) => (Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)));
const TOOLTIP_STYLE = {
  background: "#1e2433",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "8px",
  color: "#fff",
  fontSize: 12,
};

// Phone width: twelve month pairs side by side do not fit, so the chart turns on
// its side (months down the left, the change at the end of this year's bar).
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}

// Each month, last year's bar beside this year's, the change above this year's.
function YoYBarChart({
  title,
  rows,
  year,
  previousYear,
  money,
}: {
  title: string;
  rows: { label: string; prev: number | null; cur: number | null; chg: string }[];
  year: number;
  previousYear: number;
  money: boolean;
}) {
  const narrow = useNarrow();
  const tooltip = (
    <Tooltip
      cursor={{ fill: "rgba(255,255,255,0.04)" }}
      contentStyle={TOOLTIP_STYLE}
      formatter={(value: number | string, name: string) => [
        typeof value === "number" ? `${money ? "AED " : ""}${Math.round(value).toLocaleString("en-US")}` : value,
        name,
      ]}
    />
  );
  if (narrow) {
    return (
      <div className="min-w-0 rounded-xl border border-white/8 bg-white/[0.02] p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">{title}</p>
        <div style={{ height: rows.length * 38 + 40 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }} barGap={1} barCategoryGap="18%">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 10 }} tickFormatter={(v: number) => kFmt(v)} />
              <YAxis type="category" dataKey="label" tick={{ fill: "#9ca3af", fontSize: 11 }} width={58} interval={0} />
              {tooltip}
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="prev" name={String(previousYear)} fill="#52525b" isAnimationActive={false} radius={[0, 3, 3, 0]} />
              <Bar dataKey="cur" name={String(year)} fill="#8b5cf6" isAnimationActive={false} radius={[0, 3, 3, 0]}>
                <LabelList dataKey="chg" position="right" style={{ fill: "#d4d4d8", fontSize: 10 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }
  return (
    <div className="min-w-0 rounded-xl border border-white/8 bg-white/[0.02] p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">{title}</p>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 18, right: 8, bottom: 4, left: 4 }} barGap={2} barCategoryGap="22%">
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 11 }} interval={0} />
            <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} width={48} tickFormatter={(v: number) => kFmt(v)} />
            {tooltip}
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
            <Bar dataKey="prev" name={String(previousYear)} fill="#52525b" isAnimationActive={false} radius={[3, 3, 0, 0]} />
            <Bar dataKey="cur" name={String(year)} fill="#8b5cf6" isAnimationActive={false} radius={[3, 3, 0, 0]}>
              <LabelList dataKey="chg" position="top" style={{ fill: "#d4d4d8", fontSize: 10 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TrendChart({
  title,
  rows,
  lines,
  money,
}: {
  title: string;
  rows: Record<string, number | string | null>[];
  lines: { key: string; name: string; color: string; width: number }[];
  money: boolean;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-white/8 bg-white/[0.02] p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">{title}</p>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} width={48} tickFormatter={(v: number) => kFmt(v)} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value: number | string, name: string) => [
                typeof value === "number" ? `${money ? "AED " : ""}${Math.round(value).toLocaleString("en-US")}` : value,
                name,
              ]}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
            {lines.map((l) => (
              <Line key={l.key} isAnimationActive={false} type="monotone" dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={l.width} dot={{ r: 2 }} activeDot={{ r: 4 }} connectNulls={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

type Metric = "orders" | "gross" | "net";
const METRICS: { key: Metric; label: string }[] = [
  { key: "orders", label: "Orders" },
  { key: "gross", label: "Sales (gross)" },
  { key: "net", label: "Sales (net)" },
];
const BRAND_TABS: { value: string; label: string }[] = [
  { value: "", label: "All brands" },
  { value: "SushiZEN", label: "Sushi ZEN" },
  { value: "RamenZEN", label: "Ramen ZEN" },
  { value: "All Veggie Sushi", label: "All Veggie Sushi" },
];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");

function change(cur: number, prev: number): number | null {
  if (!prev) return null;
  return cur / prev - 1;
}

function fmtChange(cur: number, prev: number): string {
  if (!prev && !cur) return "—";
  if (!prev) return "new";
  const c = cur / prev - 1;
  if (Math.abs(c) < 0.0005) return "±0.0%";
  return `${c > 0 ? "+" : ""}${(c * 100).toFixed(1)}%`;
}

function changeClass(cur: number, prev: number): string {
  const c = change(cur, prev);
  if (c === null) return "text-zinc-500";
  if (c >= 0.0005) return "text-emerald-400";
  if (c <= -0.0005) return "text-red-400";
  return "text-zinc-300";
}

// Grid cell tint by size of the change, so the year reads at a glance.
function tint(cur: number, prev: number): string {
  const c = change(cur, prev);
  if (c === null || !cur) return "";
  const a = Math.abs(c);
  if (c > 0) return a >= 0.2 ? "bg-emerald-500/25" : a >= 0.1 ? "bg-emerald-500/15" : a >= 0.0005 ? "bg-emerald-500/8" : "";
  return a >= 0.2 ? "bg-red-500/25" : a >= 0.1 ? "bg-red-500/15" : a >= 0.0005 ? "bg-red-500/8" : "";
}

function val(cell: Cell, m: Metric): number {
  return m === "orders" ? cell.orders : m === "gross" ? cell.gross : cell.net;
}

async function apiGet<T>(path: string): Promise<T> {
  const request = () => fetch(path, { cache: "no-store", headers: getAuthHeaders() });
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
      detail = typeof j?.detail === "string" ? j.detail : text;
    } catch {
      /* plain text */
    }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return JSON.parse(text) as T;
}

export default function DubaiYoYTab({
  approverName,
  pin,
  stepUpReady,
}: {
  approverName: string;
  pin: string;
  stepUpReady: boolean;
}) {
  const thisYear = useMemo(() => new Date().getFullYear(), []);
  const [year, setYear] = useState<number>(thisYear);
  const [brand, setBrand] = useState<string>("");
  const [metric, setMetric] = useState<Metric>("orders");
  const [month, setMonth] = useState<number>(0); // 0 = latest month with data
  const [trendView, setTrendView] = useState<"total" | "stores">("total");
  const [trendSales, setTrendSales] = useState<"gross" | "net">("gross");
  const [chartMode, setChartMode] = useState<"bars" | "line">("bars");
  const [barStore, setBarStore] = useState<string>(""); // "" = all stores
  const [data, setData] = useState<YoYResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canLoad = !!approverName.trim() && !!pin.trim() && stepUpReady;

  // The page settles its sign-in in a few steps after it opens, and every step
  // used to fetch again and hand the charts a new object -- the bars re-animated
  // and the change labels blinked each time. A fetch now happens when the year
  // or brand changes (or on Refresh), and an identical answer keeps the old object.
  const lastBody = useRef("");
  const loadedKey = useRef("");
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!canLoad) return;
    const mine = ++seq.current;
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ year: String(year), approver_name: approverName.trim(), pin: pin.trim() });
      if (brand) qs.set("brand", brand);
      const next = await apiGet<YoYResp>(`/api/admin/analytics/dubai/yoy?${qs}`);
      if (mine !== seq.current) return; // a newer request is on its way
      const body = JSON.stringify(next);
      if (body !== lastBody.current) {
        lastBody.current = body;
        setData(next);
      }
    } catch (e: unknown) {
      if (mine !== seq.current) return;
      lastBody.current = "";
      loadedKey.current = ""; // try again once the sign-in settles
      setData(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [approverName, pin, year, brand, canLoad]);

  useEffect(() => {
    if (!canLoad) return;
    const key = `${year}|${brand}`;
    if (loadedKey.current === key) return;
    loadedKey.current = key;
    void load();
  }, [canLoad, year, brand, load]);

  const years = useMemo(() => {
    const ys: number[] = [];
    for (let y = thisYear; y >= 2025; y--) ys.push(y);
    return ys;
  }, [thisYear]);

  const latestMonth = useMemo(() => {
    if (!data) return 0;
    const withData = data.months.filter((m) => m.has_current).map((m) => m.month);
    return withData.length ? Math.max(...withData) : 0;
  }, [data]);
  const shownMonth = month || latestMonth;
  const monthBlock = data && shownMonth ? data.months[shownMonth - 1] : null;
  const anyPrevious = !!data && data.months.some((m) => m.has_previous);
  const netFlagged = (p: Pair) => p.cur.net_flag || p.prev.net_flag;

  const rowsFor = (b: Block) => [
    ...(data?.stores ?? []).map((s) => ({
      key: s.code,
      label: s.name,
      closed: s.closed,
      pair: b.stores[s.code],
      kind: "store" as const,
    })),
    { key: "__total", label: "Total (all stores)", closed: false, pair: b.total, kind: "total" as const },
    { key: "__lfl", label: "Like-for-like", closed: false, pair: b.like_for_like, kind: "lfl" as const },
  ];

  // Trend: every month OS has, one point per month. The running month is left
  // off the lines -- a part month would read as a fall.
  const trend = useMemo(() => {
    const months = (data?.series?.months ?? []).filter((m) => !m.partial);
    const partial = (data?.series?.months ?? []).find((m) => m.partial) ?? null;
    const codes = (data?.stores ?? []).map((s) => s.code);
    const build = (pick: (c: Cell) => number) =>
      months.map((m) => {
        const row: Record<string, number | string | null> = { label: monthLabel(m.key), total: pick(m.total) };
        for (const c of codes) row[c] = m.stores[c] ? pick(m.stores[c]) : null;
        return row;
      });
    const lines =
      trendView === "total"
        ? [{ key: "total", name: "All stores", color: TOTAL_COLOR, width: 2.5 }]
        : (data?.stores ?? [])
            .filter((s) => months.some((m) => (m.stores[s.code]?.orders ?? 0) > 0))
            .map((s) => ({ key: s.code, name: s.closed ? `${s.name} (closed)` : s.name, color: STORE_COLORS[s.code] ?? "#94a3b8", width: 2 }));

    return {
      orders: build((c) => c.orders),
      sales: build((c) => (trendSales === "gross" ? c.gross : c.net)),
      lines,
      partial,
      netFlagged: months.some((m) => m.total.net_flag),
    };
  }, [data, trendView, trendSales]);

  // Bars: the selected year's months against the same months a year earlier
  // (the running month over the same days, as in the tables below).
  const bars = useMemo(() => {
    if (!data) return { orders: [], sales: [] };
    const build = (pick: (c: Cell) => number) =>
      data.months.map((m) => {
        const pair = barStore ? m.stores[barStore] : m.total;
        const prev = pair && m.has_previous ? pick(pair.prev) : null;
        const cur = pair && m.has_current ? pick(pair.cur) : null;
        const chg = cur !== null && prev ? fmtChange(cur, prev) : "";
        return { label: m.cutoff_day ? `${MONTHS[m.month - 1]} 1–${m.cutoff_day}` : MONTHS[m.month - 1], prev, cur, chg };
      });
    return { orders: build((c) => c.orders), sales: build((c) => (trendSales === "gross" ? c.gross : c.net)) };
  }, [data, barStore, trendSales]);

  const periodLabel = (m: MonthBlock | null) => {
    if (!m) return "";
    return m.cutoff_day ? `${MONTHS[m.month - 1]} 1–${m.cutoff_day}` : MONTHS[m.month - 1];
  };

  return (
    <div id="sales-yoy" className={GLASS_CARD + " p-5"}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className={`${T_SECTION} flex items-center gap-2`}>
            <CalendarRange className="h-4 w-4 text-violet-400" />
            Year on Year by Store
          </h2>
          <p className={`${T_CAPTION} mt-1 max-w-3xl`}>
            Each month against the same month a year earlier, per store. Both years are UrbanPiper&apos;s own figures
            (2025 read back from UrbanPiper; available from {data?.history_from || "2025-01-01"}). The month still
            running is compared over the same days last year.
          </p>
        </div>
        <button type="button" className={SMALL_BUTTON + " flex items-center gap-1.5 self-start"} onClick={() => void load()} disabled={loading || !canLoad}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select
          aria-label="Year"
          value={year}
          onChange={(e) => {
            setYear(Number(e.target.value));
            setMonth(0);
          }}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus:border-violet-500/50"
        >
          {years.map((y) => (
            <option key={y} value={y} className="bg-zinc-900">
              {y} vs {y - 1}
            </option>
          ))}
        </select>
        <div className={TAB_CONTAINER}>
          {BRAND_TABS.map((b) => (
            <button key={b.value || "all"} type="button" onClick={() => setBrand(b.value)} className={brand === b.value ? TAB_ACTIVE : TAB_INACTIVE}>
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {!canLoad ? <p className={`${T_CAPTION} mt-4`}>Sign in with your name and PIN above to load.</p> : null}
      {error ? <p className="mt-4 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}
      {loading && !data ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : null}

      {data && !anyPrevious ? (
        <p className="mt-4 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          No {data.previous_year} figures to compare with: OS has UrbanPiper sales from {data.history_from}.
        </p>
      ) : null}

      {data && trend.orders.length ? (
        <div className="mt-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className={TAB_CONTAINER}>
              <button type="button" onClick={() => setChartMode("bars")} className={chartMode === "bars" ? TAB_ACTIVE : TAB_INACTIVE}>
                {data.year} vs {data.previous_year}
              </button>
              <button type="button" onClick={() => setChartMode("line")} className={chartMode === "line" ? TAB_ACTIVE : TAB_INACTIVE}>
                Trend
              </button>
            </div>
            {chartMode === "bars" ? (
              <select
                aria-label="Store"
                value={barStore}
                onChange={(e) => setBarStore(e.target.value)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus:border-violet-500/50"
              >
                <option value="" className="bg-zinc-900">All stores</option>
                {data.stores.filter((st) => !st.closed).map((st) => (
                  <option key={st.code} value={st.code} className="bg-zinc-900">{st.name}</option>
                ))}
              </select>
            ) : (
              <div className={TAB_CONTAINER}>
                <button type="button" onClick={() => setTrendView("total")} className={trendView === "total" ? TAB_ACTIVE : TAB_INACTIVE}>
                  All stores
                </button>
                <button type="button" onClick={() => setTrendView("stores")} className={trendView === "stores" ? TAB_ACTIVE : TAB_INACTIVE}>
                  By store
                </button>
              </div>
            )}
            <div className={TAB_CONTAINER}>
              <button type="button" onClick={() => setTrendSales("gross")} className={trendSales === "gross" ? TAB_ACTIVE : TAB_INACTIVE}>
                Sales gross
              </button>
              <button type="button" onClick={() => setTrendSales("net")} className={trendSales === "net" ? TAB_ACTIVE : TAB_INACTIVE}>
                Sales net
              </button>
            </div>
          </div>
          {chartMode === "bars" ? (
            <div className="mt-3 grid gap-3 xl:grid-cols-2">
              <YoYBarChart title="Orders" rows={bars.orders} year={data.year} previousYear={data.previous_year} money={false} />
              <YoYBarChart
                title={trendSales === "gross" ? "Sales gross (AED)" : "Sales net (AED)"}
                rows={bars.sales}
                year={data.year}
                previousYear={data.previous_year}
                money
              />
            </div>
          ) : (
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <TrendChart title="Orders" rows={trend.orders} lines={trend.lines} money={false} />
              <TrendChart title={trendSales === "gross" ? "Sales gross (AED)" : "Sales net (AED)"} rows={trend.sales} lines={trend.lines} money />
            </div>
          )}
          <p className={`${T_CAPTION} mt-2`}>
            {chartMode === "bars" ? (
              <>The figure above each {data.year} bar is the change against {data.previous_year}. The running month is compared over the same days.</>
            ) : (
              <>
                Whole months only, from {(data.series_from || data.history_from).slice(0, 7)}
                {trend.partial ? ` — ${monthLabel(trend.partial.key)} is plotted once the month ends (data through day ${trend.partial.through_day})` : ""}.
              </>
            )}
            {trendSales === "net" && trend.netFlagged ? (
              <span className="text-amber-400"> Net reads high from Oct 2025 to May 2026 (discounts missing in UrbanPiper); gross shows the real movement.</span>
            ) : null}
          </p>

        </div>
      ) : null}

      {data && monthBlock ? (
        <>
          {/* Month detail: every store, all three measures */}
          <div className="mt-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-white">
                {periodLabel(monthBlock)} {data.year} vs {data.previous_year}
              </span>
              <div className="flex flex-wrap gap-1">
                {data.months.map((m) => (
                  <button
                    key={m.month}
                    type="button"
                    disabled={!m.has_current}
                    onClick={() => setMonth(m.month)}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                      m.month === shownMonth
                        ? "bg-violet-500/30 text-violet-100"
                        : m.has_current
                          ? "text-zinc-300 hover:bg-white/10"
                          : "cursor-default text-zinc-600"
                    }`}
                  >
                    {MONTHS[m.month - 1]}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm text-zinc-200">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className={TABLE_HEADER + " px-3 text-left"} rowSpan={2}>Store</th>
                    <th className={TABLE_HEADER + " px-3 text-center"} colSpan={3}>Orders</th>
                    <th className={TABLE_HEADER + " px-3 text-center"} colSpan={3}>Sales gross (AED)</th>
                    <th className={TABLE_HEADER + " px-3 text-center"} colSpan={3}>Sales net (AED)</th>
                  </tr>
                  <tr className="border-b border-white/10">
                    {[0, 1, 2].flatMap((i) => [
                      <th key={`${i}c`} className={TABLE_HEADER + " px-3 text-right"}>{data.year}</th>,
                      <th key={`${i}p`} className={TABLE_HEADER + " px-3 text-right"}>{data.previous_year}</th>,
                      <th key={`${i}d`} className={TABLE_HEADER + " px-3 text-right"}>Change</th>,
                    ])}
                  </tr>
                </thead>
                <tbody>
                  {rowsFor(monthBlock).map((r) => {
                    if (!r.pair) return null;
                    const { cur, prev } = r.pair;
                    if (r.closed && !cur.orders && !prev.orders) return null;
                    const strong = r.kind !== "store";
                    return (
                      <tr key={r.key} className={`border-t border-white/5 ${strong ? "bg-white/[0.03] font-semibold" : ""}`}>
                        <td className="whitespace-nowrap px-3 py-2">
                          {r.label}
                          {r.closed ? <span className="ml-1.5 text-[10px] font-normal uppercase text-zinc-500">closed</span> : null}
                        </td>
                        {(["orders", "gross", "net"] as Metric[]).map((m) => {
                          const flag = m === "net" && netFlagged(r.pair);
                          return [
                            <td key={`${m}c`} className="px-3 py-2 text-right tabular-nums">{fmtInt(val(cur, m))}</td>,
                            <td key={`${m}p`} className="px-3 py-2 text-right tabular-nums text-zinc-400">{fmtInt(val(prev, m))}</td>,
                            r.closed ? (
                              <td key={`${m}d`} className="px-3 py-2 text-right text-zinc-600">closed</td>
                            ) : (
                              <td
                                key={`${m}d`}
                                className={`px-3 py-2 text-right tabular-nums ${flag ? "text-amber-400" : changeClass(val(cur, m), val(prev, m))}`}
                              >
                                {fmtChange(val(cur, m), val(prev, m))}
                                {flag ? "†" : ""}
                              </td>
                            ),
                          ];
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* The year: change per store and month for one measure */}
          <div className="mt-8">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-white">
                {data.year} by month — change vs {data.previous_year}
              </span>
              <div className={TAB_CONTAINER}>
                {METRICS.map((m) => (
                  <button key={m.key} type="button" onClick={() => setMetric(m.key)} className={metric === m.key ? TAB_ACTIVE : TAB_INACTIVE}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-xs text-zinc-200">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className={TABLE_HEADER + " sticky left-0 bg-zinc-950/80 px-3 text-left"}>Store</th>
                    {data.months.map((m) => (
                      <th key={m.month} className={TABLE_HEADER + " px-2 text-right"}>
                        {MONTHS[m.month - 1]}
                        {m.cutoff_day ? <span className="block font-normal normal-case text-zinc-600">1–{m.cutoff_day}</span> : null}
                      </th>
                    ))}
                    <th className={TABLE_HEADER + " px-3 text-right"}>
                      YTD
                      {data.ytd.through_month ? (
                        <span className="block font-normal normal-case text-zinc-600">
                          Jan–{MONTHS[data.ytd.through_month - 1]}
                          {data.ytd.cutoff_day ? ` ${data.ytd.cutoff_day}` : ""}
                        </span>
                      ) : null}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rowsFor(data.ytd).map((r) => {
                    const yearPair = r.pair;
                    if (r.closed && yearPair && !yearPair.cur.orders && !data.months.some((m) => m.stores[r.key]?.prev.orders)) return null;
                    const strong = r.kind !== "store";
                    const pairOf = (m: MonthBlock): Pair | undefined =>
                      r.kind === "total" ? m.total : r.kind === "lfl" ? m.like_for_like : m.stores[r.key];
                    const cellFor = (p: Pair | undefined, current: boolean) => {
                      if (!p) return <span className="text-zinc-700">—</span>;
                      if (r.closed) current = false;
                      const c = val(p.cur, metric);
                      const pv = val(p.prev, metric);
                      const flag = metric === "net" && netFlagged(p);
                      const title = `${fmtInt(c)} vs ${fmtInt(pv)}`;
                      if (!current) {
                        return pv ? (
                          <span className="text-zinc-600" title={`${data.previous_year}: ${fmtInt(pv)}`}>
                            LY {fmtInt(pv)}
                          </span>
                        ) : (
                          <span className="text-zinc-700">—</span>
                        );
                      }
                      return (
                        <span title={title} className={flag ? "text-amber-400" : changeClass(c, pv)}>
                          {fmtChange(c, pv)}
                          {flag ? "†" : ""}
                          <span className="block text-[10px] text-zinc-500">{fmtInt(c)}</span>
                        </span>
                      );
                    };
                    return (
                      <tr key={r.key} className={`border-t border-white/5 ${strong ? "font-semibold" : ""}`}>
                        <td className="sticky left-0 whitespace-nowrap bg-zinc-950/80 px-3 py-2 text-sm">
                          {r.label}
                          {r.closed ? <span className="ml-1.5 text-[10px] font-normal uppercase text-zinc-500">closed</span> : null}
                        </td>
                        {data.months.map((m) => {
                          const p = pairOf(m);
                          const metricFlag = metric === "net" && p && netFlagged(p);
                          return (
                            <td
                              key={m.month}
                              className={`px-2 py-2 text-right tabular-nums ${m.has_current && p && !metricFlag && !r.closed ? tint(val(p.cur, metric), val(p.prev, metric)) : ""}`}
                            >
                              {cellFor(p, m.has_current)}
                            </td>
                          );
                        })}
                        <td className={`px-3 py-2 text-right tabular-nums ${yearPair && !r.closed && !(metric === "net" && netFlagged(yearPair)) ? tint(val(yearPair.cur, metric), val(yearPair.prev, metric)) : ""}`}>
                          {cellFor(yearPair, data.ytd.through_month > 0)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className={`${T_CAPTION} mt-5 space-y-1`}>
            <p>
              <span className="text-zinc-300">Orders</span>: orders received. <span className="text-zinc-300">Gross</span>: before
              discounts. <span className="text-zinc-300">Net</span>: after discounts. <span className="text-zinc-300">Like-for-like</span>:
              only stores open in both months. Closed stores (Dubai Silicon Oasis, Mirdif) count in the total only.
            </p>
            <p>
              <span className="text-amber-400">†</span> Net not comparable: UrbanPiper left part of the discounts out in this month
              (Oct 2025 to 12 May 2026), so its net reads high. The discount rate did not change, so read the change from gross.
            </p>
            <p>The orders here are UrbanPiper&apos;s own count; Number of Orders (by platform) may differ by a few orders a day.</p>
          </div>
        </>
      ) : null}

      {data && !monthBlock && !loading ? (
        <p className={`${T_CAPTION} mt-4`}>No {data.year} figures yet.</p>
      ) : null}
    </div>
  );
}
