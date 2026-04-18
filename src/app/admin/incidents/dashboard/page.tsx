"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Clock,
  Filter,
  Loader2,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
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
import { getAuth, getAuthHeaders } from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import {
  GLASS_CARD,
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
  SELECT_CLASS,
  SMALL_BUTTON,
  T_CAPTION,
  T_LABEL,
  T_PAGE_TITLE,
  T_SECTION,
} from "@/lib/ui-tokens";

// ── Colour palette (consistent with design system) ───────────────────
const STATUS_COLORS: Record<string, string> = {
  new: "#f43f5e",        // rose
  acknowledged: "#f59e0b", // amber
  in_progress: "#8b5cf6",  // violet
  resolved: "#10b981",     // emerald
};

const STATUS_JP: Record<string, string> = {
  new: "New",
  acknowledged: "Acknowledged",
  in_progress: "In Progress",
  resolved: "Resolved",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#f43f5e",
  high: "#f97316",
  medium: "#f59e0b",
  low: "#10b981",
};

const SEVERITY_JP: Record<string, string> = {
  critical: "Critical 🔴",
  high: "High 🟠",
  medium: "Medium 🟡",
  low: "Low 🟢",
};

const CATEGORY_COLOR = "#8b5cf6";
const BRANCH_COLOR = "#06b6d4";

type StatsData = {
  status_counts: Record<string, number>;
  category_counts: { category: string; count: number }[];
  severity_counts: { severity: string; count: number }[];
  daily_trend: { date: string; count: number }[];
  avg_resolution_hours: number;
  open_by_branch: { branch: string; count: number }[];
};

const EMPTY_STATS: StatsData = {
  status_counts: {},
  category_counts: [],
  severity_counts: [],
  daily_trend: [],
  avg_resolution_hours: 0,
  open_by_branch: [],
};

const CustomTooltipBase = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/95 px-3 py-2 text-xs shadow-xl">
      {label && <p className="mb-1 font-semibold text-zinc-300">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || p.fill || "#fff" }}>
          {p.name ? `${p.name}: ` : ""}{p.value}
        </p>
      ))}
    </div>
  );
};

export default function IncidentDashboardPage() {
  const auth = getAuth();
  const defaultCity = String(auth?.city || "").toLowerCase() === "dubai" ? "dubai" : "manila";

  const [filterCity, setFilterCity] = useState(defaultCity);
  const [stats, setStats] = useState<StatsData>(EMPTY_STATS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchStats = useCallback(async () => {
    const a = getAuth();
    if (!a) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filterCity) params.set("city", filterCity);
      const res = await fetch(`${API_BASE}/api/admin/incidents/stats?${params}`, {
        cache: "no-store",
        headers: getAuthHeaders(a),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setStats({
        status_counts: data.status_counts || {},
        category_counts: data.category_counts || [],
        severity_counts: data.severity_counts || [],
        daily_trend: data.daily_trend || [],
        avg_resolution_hours: data.avg_resolution_hours || 0,
        open_by_branch: data.open_by_branch || [],
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [filterCity]);

  useEffect(() => { void fetchStats(); }, [fetchStats]);

  // ── derived data ──────────────────────────────────────────────────
  const statusPieData = Object.entries(stats.status_counts).map(([k, v]) => ({
    name: STATUS_JP[k] ?? k,
    value: v,
    fill: STATUS_COLORS[k] ?? "#8b5cf6",
  }));

  const severityPieData = stats.severity_counts.map((r) => ({
    name: SEVERITY_JP[r.severity] ?? r.severity,
    value: r.count,
    fill: SEVERITY_COLORS[r.severity] ?? "#8b5cf6",
  }));

  const totalIncidents = Object.values(stats.status_counts).reduce((a, b) => a + b, 0);
  const openIncidents = (stats.status_counts["new"] ?? 0)
    + (stats.status_counts["acknowledged"] ?? 0)
    + (stats.status_counts["in_progress"] ?? 0);

  // Shorten daily trend dates to MM/DD
  const trendData = stats.daily_trend.map((d) => ({
    ...d,
    date: d.date.slice(5), // "2026-04-15" → "04-15"
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/incidents" className={`${SMALL_BUTTON} flex items-center gap-1.5`}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to List
        </Link>
        <TrendingUp className="h-6 w-6 text-violet-400" />
        <div>
          <h1 className={T_PAGE_TITLE}>Incident Dashboard</h1>
          <p className={`mt-0.5 ${T_CAPTION}`}>Incident report analytics</p>
        </div>

        {/* City filter */}
        <div className="ml-auto flex items-center gap-2">
          <Filter className="h-4 w-4 text-zinc-400" />
          <select
            className={`${SELECT_CLASS} w-auto min-w-[130px]`}
            value={filterCity}
            onChange={(e) => setFilterCity(e.target.value)}
          >
            <option value="">All Cities</option>
            <option value="dubai">Dubai 🇦🇪</option>
            <option value="manila">Manila 🇵🇭</option>
          </select>
          <button
            className={`${SMALL_BUTTON} flex items-center gap-1`}
            onClick={() => fetchStats()}
            disabled={loading}
          >
            {loading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />
            }
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>Total</p>
          <p className={KPI_VALUE}>{totalIncidents}</p>
        </div>
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>Unresolved</p>
          <p className={`${KPI_VALUE} text-amber-400`}>{openIncidents}</p>
        </div>
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>Resolved</p>
          <p className={`${KPI_VALUE} text-emerald-400`}>{stats.status_counts["resolved"] ?? 0}</p>
        </div>
        <div className={KPI_CARD}>
          <p className={KPI_LABEL}>Avg. Resolution</p>
          <p className={`${KPI_VALUE} text-violet-300`}>
            {stats.avg_resolution_hours > 0 ? `${stats.avg_resolution_hours}h` : "—"}
          </p>
        </div>
      </div>

      {/* Row 1: Status pie + Severity pie */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className={`${GLASS_CARD} p-5`}>
          <p className={T_SECTION}>By Status</p>
          {statusPieData.length === 0 ? (
            <p className="mt-6 text-center text-sm text-zinc-500">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={statusPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {statusPieData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltipBase />} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(v) => <span className="text-xs text-zinc-300">{v}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className={`${GLASS_CARD} p-5`}>
          <p className={T_SECTION}>By Severity</p>
          {severityPieData.length === 0 ? (
            <p className="mt-6 text-center text-sm text-zinc-500">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={severityPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {severityPieData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltipBase />} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(v) => <span className="text-xs text-zinc-300">{v}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Row 2: Daily trend */}
      <div className={`${GLASS_CARD} p-5`}>
        <p className={T_SECTION}>Daily Incidents (Last 30 Days)</p>
        {trendData.length === 0 ? (
          <p className="mt-6 text-center text-sm text-zinc-500">No data</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="date"
                tick={{ fill: "#71717a", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: "#71717a", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltipBase />} />
              <Line
                type="monotone"
                dataKey="count"
                name="Count"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={{ r: 3, fill: "#8b5cf6" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Row 3: Category bar + Open by branch bar */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className={`${GLASS_CARD} p-5`}>
          <p className={T_SECTION}>Incidents by Category</p>
          {stats.category_counts.length === 0 ? (
            <p className="mt-6 text-center text-sm text-zinc-500">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={stats.category_counts}
                layout="vertical"
                margin={{ top: 0, right: 10, left: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: "#71717a", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="category"
                  width={90}
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<CustomTooltipBase />} />
                <Bar dataKey="count" name="Count" fill={CATEGORY_COLOR} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className={`${GLASS_CARD} p-5`}>
          <p className={T_SECTION}>Open Incidents by Branch</p>
          {stats.open_by_branch.length === 0 ? (
            <p className="mt-6 text-center text-sm text-zinc-500">No open incidents</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={stats.open_by_branch}
                layout="vertical"
                margin={{ top: 0, right: 10, left: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: "#71717a", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="branch"
                  width={80}
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<CustomTooltipBase />} />
                <Bar dataKey="count" name="Unresolved" fill={BRANCH_COLOR} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
