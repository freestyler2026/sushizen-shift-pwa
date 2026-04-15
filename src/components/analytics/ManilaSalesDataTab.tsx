"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getAuth, getAuthHeaders, refreshAuthFromApi, tryRefreshAccessToken } from "@/lib/auth";
import { GLASS_CARD, SECONDARY_BUTTON, T_BODY, T_CAPTION, T_SECTION } from "@/lib/ui-tokens";
import { Spinner } from "@/components/ui/Spinner";

function getApiBase() {
  if (process.env.NODE_ENV !== "production") return "http://127.0.0.1:8000";
  return "";
}

function parseApiErrorDetail(text: string) {
  try {
    const payload = JSON.parse(text);
    return typeof payload?.detail === "string" ? payload.detail : "";
  } catch {
    return "";
  }
}

async function apiGet<T = unknown>(path: string): Promise<T> {
  const request = async () =>
    fetch(`${getApiBase()}${path}`, {
      cache: "no-store",
      headers: getAuthHeaders(),
    });
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
    const detail = parseApiErrorDetail(text);
    const current = getAuth();
    if (
      current?.pin &&
      (detail.includes("Invalid access token") ||
        detail.includes("Authentication is required") ||
        !current.accessToken)
    ) {
      await refreshAuthFromApi(current, { includeMfa: true });
      res = await request();
      text = await res.text();
    }
  }
  if (!res.ok) {
    const detail = parseApiErrorDetail(text);
    throw new Error(detail || text || `HTTP ${res.status}`);
  }
  return JSON.parse(text) as T;
}

/** Normalized row for charts / table (API uses sale_date + nullable numbers). */
type SalesRow = {
  date: string;
  branch: string;
  dine_in_orders: number;
  dine_in_amount: number;
  grabfood_orders: number;
  grabfood_amount: number;
  foodpanda_orders: number;
  foodpanda_amount: number;
  total_orders: number;
  total_amount: number;
  ratio_to_prev_week: number | null;
};

type DailySalesRow = {
  sale_date: string;
  branch: string;
  dine_in_orders: number | null;
  dine_in_amount: number | null;
  grabfood_orders: number | null;
  grabfood_amount: number | null;
  foodpanda_orders: number | null;
  foodpanda_amount: number | null;
  total_orders: number | null;
  total_amount: number | null;
  ratio_to_prev_week: number | null;
};

type ApiResp = {
  ok: boolean;
  items: DailySalesRow[];
  grand_total_orders?: number;
  grand_total_amount?: number;
  branches?: string[];
};

const BRANCH_COLORS: Record<string, string> = {
  Paranaque: "#6366f1",
  Taft: "#10b981",
  Cubao: "#f59e0b",
};

const CHANNEL_COLORS = {
  "Dine-in": "#818cf8",
  GrabFood: "#34d399",
  FoodPanda: "#fbbf24",
} as const;

const PERIOD_OPTIONS = [
  { label: "7D", days: 7 },
  { label: "14D", days: 14 },
  { label: "30D", days: 30 },
  { label: "All", days: 0 },
] as const;

function num(v: number | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toSalesRow(r: DailySalesRow): SalesRow {
  return {
    date: String(r.sale_date || "").slice(0, 10),
    branch: String(r.branch || "").trim(),
    dine_in_orders: num(r.dine_in_orders),
    dine_in_amount: num(r.dine_in_amount),
    grabfood_orders: num(r.grabfood_orders),
    grabfood_amount: num(r.grabfood_amount),
    foodpanda_orders: num(r.foodpanda_orders),
    foodpanda_amount: num(r.foodpanda_amount),
    total_orders: num(r.total_orders),
    total_amount: num(r.total_amount),
    ratio_to_prev_week:
      r.ratio_to_prev_week == null || !Number.isFinite(Number(r.ratio_to_prev_week))
        ? null
        : Number(r.ratio_to_prev_week),
  };
}

function parseIsoDate(s: string): Date {
  const [y, m, d] = s.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return new Date(NaN);
  return new Date(y, m - 1, d);
}

function fmtPHP(n: number) {
  if (!Number.isFinite(n) || n === 0) return "₱0";
  if (n >= 1_000_000) return `₱${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₱${(n / 1_000).toFixed(0)}K`;
  return `₱${n.toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
}

function fmtDate(d: string) {
  const dt = parseIsoDate(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

/** WoW display: treat DB value as ratio vs prior week (1.08 = +8% when using ratio-1). */
function wowDeltaPct(ratio: number | null): { pct: number; positive: boolean } | null {
  if (ratio == null || !Number.isFinite(ratio)) return null;
  if (ratio > 0 && ratio < 5) {
    const pct = (ratio - 1) * 100;
    return { pct, positive: pct >= 0 };
  }
  const pct = ratio * 100;
  return { pct, positive: pct >= 0 };
}

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      className="flex flex-col gap-1 rounded-2xl border border-white/10 bg-white/5 px-5 py-4"
      style={{ borderLeft: accent ? `3px solid ${accent}` : undefined }}
    >
      <span className="text-xs uppercase tracking-widest text-white/50">{label}</span>
      <span className="text-2xl font-bold text-white">{value}</span>
      {sub ? <span className="text-xs text-white/40">{sub}</span> : null}
    </div>
  );
}

type TooltipPayload = { name?: string; value?: number; color?: string };

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-neutral-950 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 text-white/60">{label ? fmtDate(String(label)) : ""}</p>
      {payload.map((p) => (
        <p key={String(p.name)} style={{ color: p.color }}>
          {p.name}:{" "}
          <strong>
            {typeof p.value === "number" && String(p.name || "").toLowerCase().includes("revenue")
              ? fmtPHP(p.value)
              : typeof p.value === "number"
                ? p.value.toLocaleString("en-PH")
                : "—"}
          </strong>
        </p>
      ))}
    </div>
  );
}

const KNOWN_BRANCHES = ["Paranaque", "Taft", "Cubao"] as const;

export function ManilaSalesDataTab({
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rawItems, setRawItems] = useState<DailySalesRow[]>([]);
  const [meta, setMeta] = useState<{ grandOrders: number; grandAmount: number } | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>("All");
  const [periodDays, setPeriodDays] = useState<number>(0);
  const [sortCol, setSortCol] = useState<keyof SalesRow>("date");
  const [sortAsc, setSortAsc] = useState(false);

  const canLoad = Boolean(approverName.trim() && pin.trim() && stepUpReady);

  const load = useCallback(async () => {
    if (!canLoad) {
      setError("Enter approver name, PIN, and complete Security (MFA) for Manila analytics.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({
        approver_name: approverName.trim(),
        pin: pin.trim(),
        date_from: dateFrom,
        date_to: dateTo,
      });
      const res = await apiGet<ApiResp>(`/api/admin/analytics/manila/daily-sales?${qs.toString()}`);
      setRawItems(Array.isArray(res?.items) ? res.items : []);
      setMeta({
        grandOrders: Number(res.grand_total_orders || 0),
        grandAmount: Number(res.grand_total_amount || 0),
      });
    } catch (e) {
      setRawItems([]);
      setMeta(null);
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [approverName, pin, canLoad, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => rawItems.map(toSalesRow), [rawItems]);

  const filteredByPeriod = useMemo(() => {
    if (periodDays === 0) return rows;
    const end = parseIsoDate(dateTo);
    const rangeStart = parseIsoDate(dateFrom);
    if (Number.isNaN(end.getTime())) return rows;
    const cut = new Date(end);
    cut.setDate(cut.getDate() - (periodDays - 1));
    const effFrom = cut < rangeStart ? rangeStart : cut;
    return rows.filter((r) => {
      const rd = parseIsoDate(r.date);
      return !Number.isNaN(rd.getTime()) && rd >= effFrom && rd <= end;
    });
  }, [rows, periodDays, dateFrom, dateTo]);

  const filteredRows = useMemo(() => {
    return selectedBranch === "All" ? filteredByPeriod : filteredByPeriod.filter((r) => r.branch === selectedBranch);
  }, [filteredByPeriod, selectedBranch]);

  const branches = useMemo(() => {
    const seen = new Set<string>();
    const extras: string[] = [];
    for (const r of rows) {
      if (!r.branch || seen.has(r.branch)) continue;
      seen.add(r.branch);
      if (!KNOWN_BRANCHES.includes(r.branch as (typeof KNOWN_BRANCHES)[number])) extras.push(r.branch);
    }
    extras.sort();
    const ordered = [...KNOWN_BRANCHES.filter((b) => seen.has(b)), ...extras];
    return ["All", ...ordered];
  }, [rows]);

  const kpi = useMemo(() => {
    const totalOrders = filteredRows.reduce((s, r) => s + r.total_orders, 0);
    const totalRevenue = filteredRows.reduce((s, r) => s + r.total_amount, 0);
    const dates = Array.from(new Set(filteredRows.map((r) => r.date))).sort();
    const avgDailyOrders = dates.length > 0 ? totalOrders / dates.length : 0;
    const bestDay = filteredRows.reduce(
      (best, r) => (r.total_orders > (best?.total_orders ?? -1) ? r : best),
      null as SalesRow | null,
    );
    return { totalOrders, totalRevenue, avgDailyOrders, bestDay, dayCount: dates.length };
  }, [filteredRows]);

  const trendData = useMemo(() => {
    const map = new Map<string, { date: string; orders: number; revenue: number }>();
    filteredByPeriod
      .filter((r) => selectedBranch === "All" || r.branch === selectedBranch)
      .forEach((r) => {
        const prev = map.get(r.date) ?? { date: r.date, orders: 0, revenue: 0 };
        map.set(r.date, {
          date: r.date,
          orders: prev.orders + r.total_orders,
          revenue: prev.revenue + r.total_amount,
        });
      });
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredByPeriod, selectedBranch]);

  const channelData = useMemo(() => {
    if (selectedBranch !== "All") {
      const b = selectedBranch;
      const bRows = filteredByPeriod.filter((r) => r.branch === b);
      return [
        {
          branch: b,
          "Dine-in": bRows.reduce((s, r) => s + r.dine_in_orders, 0),
          GrabFood: bRows.reduce((s, r) => s + r.grabfood_orders, 0),
          FoodPanda: bRows.reduce((s, r) => s + r.foodpanda_orders, 0),
        },
      ];
    }
    const uniq = [...new Set(filteredByPeriod.map((r) => r.branch).filter(Boolean))];
    uniq.sort((a, b) => {
      const ia = KNOWN_BRANCHES.indexOf(a as (typeof KNOWN_BRANCHES)[number]);
      const ib = KNOWN_BRANCHES.indexOf(b as (typeof KNOWN_BRANCHES)[number]);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return a.localeCompare(b);
    });
    return uniq.map((b) => {
      const bRows = filteredByPeriod.filter((r) => r.branch === b);
      return {
        branch: b,
        "Dine-in": bRows.reduce((s, r) => s + r.dine_in_orders, 0),
        GrabFood: bRows.reduce((s, r) => s + r.grabfood_orders, 0),
        FoodPanda: bRows.reduce((s, r) => s + r.foodpanda_orders, 0),
      };
    });
  }, [filteredByPeriod, selectedBranch]);

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      let cmp = 0;
      if (typeof av === "string" && typeof bv === "string") cmp = av.localeCompare(bv);
      else if (typeof av === "number" && typeof bv === "number") cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });
  }, [filteredRows, sortCol, sortAsc]);

  const handleSort = (col: keyof SalesRow) => {
    if (sortCol === col) setSortAsc((p) => !p);
    else {
      setSortCol(col);
      setSortAsc(false);
    }
  };

  const tableColumns: { key: keyof SalesRow; label: string }[] = [
    { key: "date", label: "Date" },
    { key: "branch", label: "Branch" },
    { key: "dine_in_orders", label: "Dine-in #" },
    { key: "dine_in_amount", label: "Dine-in PHP" },
    { key: "grabfood_orders", label: "Grab #" },
    { key: "grabfood_amount", label: "Grab PHP" },
    { key: "foodpanda_orders", label: "FP #" },
    { key: "foodpanda_amount", label: "FP PHP" },
    { key: "total_orders", label: "Total #" },
    { key: "total_amount", label: "Total PHP" },
    { key: "ratio_to_prev_week", label: "WoW" },
  ];

  return (
    <div className={GLASS_CARD}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3">
        <div>
          <h2 className={T_SECTION}>Sales Data (Manila)</h2>
          <p className={T_CAPTION}>
            Dine in / GrabFood / Foodpanda daily counts and PHP amounts (<code className="text-neutral-400">manila_daily_sales</code>). Charts reflect the Summary Range below, plus optional last-N-day filter.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || !canLoad} className={SECONDARY_BUTTON}>
          {loading ? <Spinner size="sm" /> : "Refresh"}
        </button>
      </div>

      <div className="space-y-6 p-4 pb-8">
        {!canLoad ? (
          <p className={T_BODY}>Complete Security (MFA) and enter approver + PIN to load.</p>
        ) : error ? (
          <p className="text-sm text-red-400">
            {error}{" "}
            <button type="button" className="ml-2 underline" onClick={() => void load()}>
              Retry
            </button>
          </p>
        ) : loading && !rows.length ? (
          <div className="flex h-48 items-center justify-center">
            <Spinner />
          </div>
        ) : !rows.length ? (
          <p className={T_BODY}>
            No rows for this Summary Range on Heroku <code className="text-neutral-400">manila_daily_sales</code>. Try a wider range or Refresh after import (
            <code className="text-neutral-400">scripts/import_manila_daily_excel.py</code>).
          </p>
        ) : (
          <>
            {meta && periodDays === 0 ? (
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-4 py-2 text-xs text-neutral-400">
                API range total:{" "}
                <span className="font-semibold text-neutral-200">{meta.grandOrders.toLocaleString("en-PH")}</span>{" "}
                orders · PHP{" "}
                <span className="font-semibold text-neutral-200">{meta.grandAmount.toLocaleString("en-PH")}</span>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex overflow-hidden rounded-lg border border-white/10 bg-white/5">
                {PERIOD_OPTIONS.map(({ label, days }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setPeriodDays(days)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      periodDays === days ? "bg-indigo-600 text-white" : "text-white/50 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-white/35">
                Range: {dateFrom} → {dateTo}
                {periodDays > 0 ? ` · showing last ${periodDays}d within range` : ""}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {branches.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setSelectedBranch(b)}
                  className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-all ${
                    selectedBranch === b
                      ? "border-transparent text-white"
                      : "border-white/10 bg-transparent text-white/50 hover:border-white/20 hover:text-white"
                  }`}
                  style={
                    selectedBranch === b
                      ? { backgroundColor: b === "All" ? "#6366f1" : (BRANCH_COLORS[b] ?? "#6366f1") }
                      : {}
                  }
                >
                  {b}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiCard
                label="Total Orders"
                value={kpi.totalOrders.toLocaleString("en-PH")}
                sub={`${kpi.dayCount} day(s) in view`}
                accent="#6366f1"
              />
              <KpiCard
                label="Total Revenue"
                value={fmtPHP(kpi.totalRevenue)}
                sub={`Avg ${fmtPHP(kpi.totalRevenue / Math.max(kpi.dayCount, 1))}/day`}
                accent="#10b981"
              />
              <KpiCard
                label="Avg Daily Orders"
                value={Math.round(kpi.avgDailyOrders).toLocaleString("en-PH")}
                sub="per calendar day in view"
                accent="#f59e0b"
              />
              <KpiCard
                label="Best Day"
                value={kpi.bestDay ? kpi.bestDay.total_orders.toLocaleString("en-PH") : "—"}
                sub={kpi.bestDay ? `${fmtDate(kpi.bestDay.date)} · ${kpi.bestDay.branch}` : ""}
                accent="#ec4899"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h3 className="mb-4 text-sm font-medium text-white/70">Daily Orders Trend</h3>
                <div className="h-[220px] w-full min-h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={fmtDate}
                        tick={{ fontSize: 10, fill: "rgba(255,255,255,0.35)" }}
                        interval="preserveStartEnd"
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        yAxisId="orders"
                        tick={{ fontSize: 10, fill: "rgba(255,255,255,0.35)" }}
                        axisLine={false}
                        tickLine={false}
                        width={36}
                      />
                      <YAxis
                        yAxisId="revenue"
                        orientation="right"
                        tickFormatter={(v) => fmtPHP(Number(v))}
                        tick={{ fontSize: 10, fill: "rgba(255,255,255,0.25)" }}
                        axisLine={false}
                        tickLine={false}
                        width={52}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend
                        wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}
                        iconType="circle"
                        iconSize={8}
                      />
                      <Line
                        yAxisId="orders"
                        type="monotone"
                        dataKey="orders"
                        name="Orders"
                        stroke="#818cf8"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                      <Line
                        yAxisId="revenue"
                        type="monotone"
                        dataKey="revenue"
                        name="Revenue PHP"
                        stroke="#34d399"
                        strokeWidth={2}
                        strokeDasharray="4 2"
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h3 className="mb-4 text-sm font-medium text-white/70">Channel Breakdown by Branch</h3>
                <div className="h-[220px] w-full min-h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={channelData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis
                        dataKey="branch"
                        tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "rgba(255,255,255,0.35)" }}
                        axisLine={false}
                        tickLine={false}
                        width={36}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend
                        wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}
                        iconType="circle"
                        iconSize={8}
                      />
                      <Bar dataKey="Dine-in" stackId="a" fill={CHANNEL_COLORS["Dine-in"]} />
                      <Bar dataKey="GrabFood" stackId="a" fill={CHANNEL_COLORS.GrabFood} />
                      <Bar dataKey="FoodPanda" stackId="a" fill={CHANNEL_COLORS.FoodPanda} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
                <span className="text-sm font-medium text-white/70">
                  Daily Detail
                  <span className="ml-2 text-xs text-white/30">({sortedRows.length} rows)</span>
                </span>
                <span className="text-xs text-white/30">Click column header to sort</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/10">
                      {tableColumns.map(({ key, label }) => (
                        <th
                          key={key}
                          scope="col"
                          onClick={() => handleSort(key)}
                          className="cursor-pointer select-none whitespace-nowrap px-4 py-2.5 text-left font-medium text-white/40 transition-colors hover:text-white/70"
                        >
                          {label}
                          {sortCol === key ? <span className="ml-1 opacity-60">{sortAsc ? "↑" : "↓"}</span> : null}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((row, i) => {
                      const wowData = wowDeltaPct(row.ratio_to_prev_week);
                      const branchColor = BRANCH_COLORS[row.branch];
                      return (
                        <tr
                          key={`${row.date}-${row.branch}-${i}`}
                          className="border-b border-white/5 transition-colors hover:bg-white/5"
                        >
                          <td className="whitespace-nowrap px-4 py-2.5 text-white/70">{fmtDate(row.date)}</td>
                          <td className="whitespace-nowrap px-4 py-2.5">
                            <span
                              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                              style={{
                                backgroundColor: branchColor ? `${branchColor}33` : "rgba(255,255,255,0.07)",
                                color: branchColor ?? "rgba(255,255,255,0.7)",
                              }}
                            >
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ backgroundColor: branchColor ?? "rgba(255,255,255,0.5)" }}
                              />
                              {row.branch}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-white/60">
                            {row.dine_in_orders > 0 ? row.dine_in_orders : <span className="text-white/20">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right text-white/50">
                            {row.dine_in_amount > 0 ? fmtPHP(row.dine_in_amount) : <span className="text-white/20">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right text-white/60">
                            {row.grabfood_orders > 0 ? row.grabfood_orders : <span className="text-white/20">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right text-white/50">
                            {row.grabfood_amount > 0 ? fmtPHP(row.grabfood_amount) : <span className="text-white/20">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right text-white/60">
                            {row.foodpanda_orders > 0 ? row.foodpanda_orders : <span className="text-white/20">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right text-white/50">
                            {row.foodpanda_amount > 0 ? fmtPHP(row.foodpanda_amount) : <span className="text-white/20">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold text-white">
                            {row.total_orders > 0 ? row.total_orders : <span className="text-white/20">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold text-white">
                            {row.total_amount > 0 ? fmtPHP(row.total_amount) : <span className="text-white/20">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {wowData ? (
                              <span className="font-medium" style={{ color: wowData.positive ? "#34d399" : "#f87171" }}>
                                {wowData.positive ? "+" : ""}
                                {wowData.pct.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-white/20">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {sortedRows.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="px-4 py-8 text-center text-white/30">
                          No data for selected filter
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
