"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getAuth, getAuthHeaders, refreshAuthFromApi, tryRefreshAccessToken } from "@/lib/auth";
import { GLASS_CARD, T_CAPTION } from "@/lib/ui-tokens";
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

interface Summary {
  ok?: boolean;
  total: number;
  total_php: number;
  ticket_sent_pct: number;
  by_platform: Record<string, { count: number; php: number }>;
  by_branch: Record<string, { count: number; php: number }>;
  by_category: Record<string, number>;
  by_month: { month: string; count: number; php: number; grab: number; panda: number }[];
  top_reasons: { reason: string; count: number }[];
}

interface CancellationRecord {
  id: number;
  platform: string;
  incident_date: string;
  branch: string;
  category: string | null;
  order_no: string | null;
  ordered_items: string | null;
  paid_price: number | null;
  cancellation_reason: string | null;
  kitchen_photo_provided: boolean | null;
  ticket_status: string | null;
  recorded_by: string | null;
  refund_status: string | null;
}

const BRANCH_COLORS: Record<string, string> = {
  Paranaque: "#6366f1",
  Taft: "#10b981",
  Cubao: "#f59e0b",
};
const PLATFORM_COLORS: Record<string, string> = {
  GrabFood: "#00b14f",
  FoodPanda: "#d70f64",
};
const PERIOD_OPTIONS = [
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "180D", days: 180 },
  { label: "All", days: 0 },
] as const;

function fmtPHP(n: number) {
  if (!Number.isFinite(n)) return "₱0";
  if (n >= 1_000_000) return `₱${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `₱${(n / 1000).toFixed(0)}K`;
  return `₱${Math.round(n).toLocaleString("en-PH")}`;
}

function fmtMonth(m: string) {
  const d = new Date(`${m}-01T12:00:00`);
  if (Number.isNaN(d.getTime())) return m;
  return d.toLocaleDateString("en-PH", { month: "short", year: "2-digit" });
}

function fmtDate(d: string) {
  const x = new Date(`${d}T12:00:00`);
  if (Number.isNaN(x.getTime())) return d;
  return x.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

function cutoffDate(days: number) {
  if (days === 0) return "";
  const dt = new Date();
  dt.setDate(dt.getDate() - days);
  return dt.toISOString().slice(0, 10);
}

function KpiCard({
  label,
  value,
  sub,
  accent,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  icon?: string;
}) {
  return (
    <div
      className="flex flex-col gap-1 rounded-2xl border border-white/10 bg-white/5 px-5 py-4"
      style={{ borderLeft: accent ? `3px solid ${accent}` : undefined }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-white/40">{label}</span>
        {icon ? <span className="text-lg">{icon}</span> : null}
      </div>
      <span className="text-2xl font-bold text-white">{value}</span>
      {sub ? <span className="text-xs text-white/30">{sub}</span> : null}
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-gray-900 px-3 py-2 text-xs shadow-xl">
      {label ? <p className="mb-1 text-white/50">{label}</p> : null}
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <strong>{p.value.toLocaleString()}</strong>
        </p>
      ))}
    </div>
  );
}

export function ManilaCancellationsTab({
  approverName,
  pin,
  stepUpReady,
}: {
  approverName: string;
  pin: string;
  stepUpReady: boolean;
}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [records, setRecords] = useState<CancellationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodDays, setPeriodDays] = useState<number>(180);
  const [filterBranch, setFilterBranch] = useState("All");
  const [filterPlatform, setFilterPlatform] = useState("All");
  const [filterCategory, setFilterCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<keyof CancellationRecord>("incident_date");
  const [sortAsc, setSortAsc] = useState(false);

  const canLoad = Boolean(approverName.trim() && pin.trim() && stepUpReady);

  const fetchAll = useCallback(async () => {
    if (!canLoad) {
      setError("Enter approver name, PIN, and complete Security (MFA) for Manila analytics.");
      setLoading(false);
      setSummary(null);
      setRecords([]);
      return;
    }
    setLoading(true);
    setError(null);
    const from = cutoffDate(periodDays);
    const qsBase = new URLSearchParams({
      approver_name: approverName.trim(),
      pin: pin.trim(),
    });
    if (from) qsBase.set("date_from", from);
    const qs = qsBase.toString();
    try {
      const [sumRes, recRes] = await Promise.all([
        apiGet<Summary>(`/api/admin/analytics/manila/cancellations/summary?${qs}`),
        apiGet<{ ok?: boolean; items?: CancellationRecord[] }>(`/api/admin/analytics/manila/cancellations?${qs}`),
      ]);
      setSummary(sumRes);
      setRecords(Array.isArray(recRes?.items) ? recRes.items : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch");
      setSummary(null);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [approverName, pin, periodDays, canLoad]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (filterBranch !== "All" && r.branch !== filterBranch) return false;
      if (filterPlatform !== "All" && r.platform !== filterPlatform) return false;
      if (filterCategory !== "All" && (r.category || "") !== filterCategory) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          (r.order_no ?? "").toLowerCase().includes(q) ||
          (r.ordered_items ?? "").toLowerCase().includes(q) ||
          (r.cancellation_reason ?? "").toLowerCase().includes(q) ||
          (r.recorded_by ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [records, filterBranch, filterPlatform, filterCategory, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (sortCol === "paid_price") {
        const na = Number(av);
        const nb = Number(bv);
        const cmp = na < nb ? -1 : na > nb ? 1 : 0;
        return sortAsc ? cmp : -cmp;
      }
      if (sortCol === "id") {
        const cmp = Number(av) < Number(bv) ? -1 : Number(av) > Number(bv) ? 1 : 0;
        return sortAsc ? cmp : -cmp;
      }
      const cmp = String(av) < String(bv) ? -1 : String(av) > String(bv) ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });
  }, [filtered, sortCol, sortAsc]);

  const handleSort = (col: keyof CancellationRecord) => {
    if (sortCol === col) setSortAsc((p) => !p);
    else {
      setSortCol(col);
      setSortAsc(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-sm text-white/30">
        <Spinner size="sm" /> Loading cancellation data…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-64 items-center justify-center gap-3 text-sm text-red-400">
        {error}
        <button type="button" className="underline" onClick={() => void fetchAll()}>
          Retry
        </button>
      </div>
    );
  }
  if (!summary) return null;

  const branches = ["All", "Paranaque", "Taft", "Cubao"];
  const platforms = ["All", "GrabFood", "FoodPanda"];
  const categories = ["All", "Cancellation", "Incident/Refund"];

  const piePlatformData = Object.entries(summary.by_platform || {}).map(([name, v]) => ({
    name,
    value: v.count,
    color: PLATFORM_COLORS[name] ?? "#888",
  }));

  const branchBarData = ["Paranaque", "Taft", "Cubao"].map((b) => ({
    branch: b,
    GrabFood: records.filter((r) => r.branch === b && r.platform === "GrabFood").length,
    FoodPanda: records.filter((r) => r.branch === b && r.platform === "FoodPanda").length,
  }));

  const cancelN = summary.by_category?.["Cancellation"] ?? 0;
  const incidentN = summary.by_category?.["Incident/Refund"] ?? 0;

  return (
    <div className={GLASS_CARD}>
      <div className="space-y-6 p-4 pb-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Cancellations &amp; Incidents</h2>
            <p className={`${T_CAPTION} mt-1`}>GrabFood &amp; FoodPanda cancellations and incident / refund records.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-white/10 bg-white/5">
              {PERIOD_OPTIONS.map(({ label, days }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setPeriodDays(days)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    periodDays === days ? "bg-indigo-600 text-white" : "text-white/40 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void fetchAll()}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/50 transition-colors hover:text-white"
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard
            label="Total Incidents"
            value={summary.total.toLocaleString()}
            sub={`${cancelN} cancellations · ${incidentN} incidents`}
            accent="#ef4444"
            icon="⚠️"
          />
          <KpiCard
            label="Amount at Risk"
            value={fmtPHP(summary.total_php)}
            sub={`Avg ${fmtPHP(summary.total_php / Math.max(summary.total, 1))}/case`}
            accent="#f59e0b"
            icon="₱"
          />
          <KpiCard
            label="Ticket Sent Rate"
            value={`${summary.ticket_sent_pct}%`}
            sub="Disputes formally filed"
            accent="#6366f1"
            icon="🎫"
          />
          <KpiCard
            label="GrabFood / FoodPanda"
            value={`${summary.by_platform?.GrabFood?.count ?? 0} / ${summary.by_platform?.FoodPanda?.count ?? 0}`}
            sub={`₱${Math.round(summary.by_platform?.GrabFood?.php ?? 0).toLocaleString("en-PH")} / ₱${Math.round(
              summary.by_platform?.FoodPanda?.php ?? 0,
            ).toLocaleString("en-PH")}`}
            accent="#10b981"
            icon="📊"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 lg:col-span-2">
            <h3 className="mb-4 text-sm font-medium text-white/60">Monthly Trend</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={summary.by_month} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="month"
                  tickFormatter={fmtMonth}
                  tick={{ fontSize: 10, fill: "rgba(255,255,255,0.35)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.35)" }} axisLine={false} tickLine={false} width={28} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }} iconSize={8} />
                <Line type="monotone" dataKey="grab" name="GrabFood" stroke="#00b14f" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="panda" name="FoodPanda" stroke="#d70f64" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h3 className="mb-4 text-sm font-medium text-white/60">Platform Split</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={piePlatformData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  dataKey="value"
                  nameKey="name"
                  paddingAngle={3}
                >
                  {piePlatformData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number | string, name: string) => [`${v} cases`, name]} />
                <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }} iconSize={8} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h3 className="mb-4 text-sm font-medium text-white/60">Incidents by Branch</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={branchBarData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="branch" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.35)" }} axisLine={false} tickLine={false} width={28} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }} iconSize={8} />
                <Bar dataKey="GrabFood" stackId="a" fill="#00b14f" radius={[0, 0, 0, 0]} />
                <Bar dataKey="FoodPanda" stackId="a" fill="#d70f64" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h3 className="mb-3 text-sm font-medium text-white/60">Top Cancellation Reasons</h3>
            <div className="max-h-[220px] space-y-2 overflow-y-auto pr-1">
              {(summary.top_reasons || []).slice(0, 8).map((item, i) => {
                const maxCount = summary.top_reasons[0]?.count ?? 1;
                return (
                  <div key={`${item.reason}-${i}`}>
                    <div className="mb-0.5 flex justify-between text-xs">
                      <span className="max-w-[75%] truncate text-white/60">{item.reason || "Unknown"}</span>
                      <span className="text-white/40">{item.count}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                      <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(item.count / maxCount) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-white/10 bg-white/5">
            {branches.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setFilterBranch(b)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  filterBranch === b ? "text-white" : "text-white/40 hover:text-white/70"
                }`}
                style={
                  filterBranch === b ? { backgroundColor: b === "All" ? "#6366f1" : BRANCH_COLORS[b] } : undefined
                }
              >
                {b}
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-lg border border-white/10 bg-white/5">
            {platforms.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setFilterPlatform(p)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  filterPlatform === p ? "text-white" : "text-white/40 hover:text-white/70"
                }`}
                style={
                  filterPlatform === p ? { backgroundColor: p === "All" ? "#6366f1" : PLATFORM_COLORS[p] } : undefined
                }
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-lg border border-white/10 bg-white/5">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setFilterCategory(c)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  filterCategory === c ? "bg-indigo-600 text-white" : "text-white/40 hover:text-white/70"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order, items, reason…"
            className="ml-auto w-52 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white transition-colors placeholder:text-white/25 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
            <span className="text-sm font-medium text-white/60">
              Records
              <span className="ml-2 text-xs text-white/25">({sorted.length} shown)</span>
            </span>
            <span className="text-xs text-white/25">Click column to sort</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10">
                  {(
                    [
                      { key: "incident_date" as const, label: "Date" },
                      { key: "platform" as const, label: "Platform" },
                      { key: "branch" as const, label: "Branch" },
                      { key: "category" as const, label: "Category" },
                      { key: "order_no" as const, label: "Order No" },
                      { key: "paid_price" as const, label: "PHP" },
                      { key: "cancellation_reason" as const, label: "Reason" },
                      { key: "ticket_status" as const, label: "Ticket" },
                      { key: "recorded_by" as const, label: "Recorded By" },
                    ] as const
                  ).map(({ key, label }) => (
                    <th
                      key={key}
                      scope="col"
                      onClick={() => handleSort(key)}
                      className="cursor-pointer select-none whitespace-nowrap px-4 py-2.5 text-left font-medium text-white/35 transition-colors hover:text-white/60"
                    >
                      {label}
                      {sortCol === key ? <span className="ml-1 opacity-50">{sortAsc ? "↑" : "↓"}</span> : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => {
                  const ticketLower = (r.ticket_status ?? "").toLowerCase();
                  const ticketColor = ticketLower.includes("ticket sent")
                    ? "text-emerald-400"
                    : ticketLower.includes("no need")
                      ? "text-white/40"
                      : "text-amber-400";
                  const isCancellation = r.category === "Cancellation";
                  return (
                    <tr key={r.id ?? `row-${i}`} className="border-b border-white/5 transition-colors hover:bg-white/5">
                      <td className="whitespace-nowrap px-4 py-2.5 text-white/60">{fmtDate(r.incident_date)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{
                            backgroundColor: `${PLATFORM_COLORS[r.platform] ?? "#888"}20`,
                            color: PLATFORM_COLORS[r.platform] ?? "#aaa",
                          }}
                        >
                          {r.platform}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <span className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: BRANCH_COLORS[r.branch] }} />
                          <span style={{ color: BRANCH_COLORS[r.branch] ?? "#fff" }}>{r.branch}</span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            isCancellation ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"
                          }`}
                        >
                          {r.category ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-white/50">{r.order_no ?? "—"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold text-white">
                        {r.paid_price != null ? `₱${Number(r.paid_price).toLocaleString("en-PH")}` : "—"}
                      </td>
                      <td className="max-w-[180px] truncate px-4 py-2.5 text-white/50" title={r.cancellation_reason ?? ""}>
                        {r.cancellation_reason ?? "—"}
                      </td>
                      <td className={`max-w-[160px] truncate px-4 py-2.5 ${ticketColor}`} title={r.ticket_status ?? ""}>
                        {r.ticket_status ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-white/40">{r.recorded_by ?? "—"}</td>
                    </tr>
                  );
                })}
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-white/25">
                      No records match the current filter
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
