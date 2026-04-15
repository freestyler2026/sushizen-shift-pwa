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
  total_aed: number;
  refund_aed: number;
  compensation_aed: number;
  ticket_sent_pct: number;
  by_platform: Record<string, { count: number; aed: number }>;
  by_branch: Record<string, { count: number; aed: number }>;
  by_brand: Record<string, number>;
  by_category: Record<string, number>;
  by_month: {
    month: string;
    count: number;
    aed: number;
    careem: number;
    keeta: number;
    talabat: number;
    other?: number;
  }[];
  top_reasons: { reason: string; count: number }[];
}

export type DubaiCancelRow = {
  id: number;
  platform: string;
  incident_date: string;
  branch: string;
  brand: string | null;
  category: string | null;
  order_id: string | null;
  ordered_items: string | null;
  total_amount: number | null;
  refund_amount: number | null;
  cancellation_reason: string | null;
  encoded_by: string | null;
  email_status: string | null;
  refund_status: string | null;
};

const BRANCH_COLORS: Record<string, string> = {
  "Business Bay": "#6366f1",
  Arjan: "#10b981",
  "Al Barsha": "#f59e0b",
  "Al Hudaiba": "#ec4899",
  JLT: "#8b5cf6",
};
const PLATFORM_COLORS: Record<string, string> = {
  Careem: "#00c896",
  Keeta: "#ff6b35",
  Talabat: "#ff2d55",
};

function fmtAED(n: number) {
  if (!Number.isFinite(n)) return "AED 0";
  if (n >= 1_000_000) return `AED ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `AED ${(n / 1000).toFixed(0)}K`;
  return `AED ${Math.round(n).toLocaleString("en-AE")}`;
}

function fmtMonth(m: string) {
  const d = new Date(`${m}-01T12:00:00`);
  if (Number.isNaN(d.getTime())) return m;
  return d.toLocaleDateString("en-AE", { month: "short", year: "2-digit" });
}

function fmtDate(d: string) {
  const x = new Date(`${d}T12:00:00`);
  if (Number.isNaN(x.getTime())) return d;
  return x.toLocaleDateString("en-AE", { month: "short", day: "numeric" });
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

const BRANCHES_FULL = ["Business Bay", "Arjan", "Al Barsha", "Al Hudaiba", "JLT"] as const;

export function DubaiCancellationsTab({
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
  const [summary, setSummary] = useState<Summary | null>(null);
  const [records, setRecords] = useState<DubaiCancelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterBranch, setFilterBranch] = useState("All");
  const [filterPlatform, setFilterPlatform] = useState("All");
  const [filterCategory, setFilterCategory] = useState("All");
  const [filterBrand, setFilterBrand] = useState("All");
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<keyof DubaiCancelRow>("incident_date");
  const [sortAsc, setSortAsc] = useState(false);

  const canLoad = Boolean(approverName.trim() && pin.trim() && stepUpReady);

  const fetchAll = useCallback(async () => {
    if (!canLoad) {
      setError("Enter approver name, PIN, and complete Security (MFA) for Dubai analytics.");
      setLoading(false);
      setSummary(null);
      setRecords([]);
      return;
    }
    setLoading(true);
    setError(null);
    const df = (dateFrom || "").trim().slice(0, 10);
    const dt = (dateTo || "").trim().slice(0, 10);
    const qsBase = new URLSearchParams({
      approver_name: approverName.trim(),
      pin: pin.trim(),
    });
    if (df) qsBase.set("date_from", df);
    if (dt) qsBase.set("date_to", dt);
    const qs = qsBase.toString();
    try {
      const [sumRes, recRes] = await Promise.all([
        apiGet<Summary>(`/api/admin/analytics/dubai/cancellations/summary?${qs}`),
        apiGet<{ ok?: boolean; items?: DubaiCancelRow[] }>(`/api/admin/analytics/dubai/cancellations?${qs}`),
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
  }, [approverName, pin, dateFrom, dateTo, canLoad]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (filterBranch !== "All" && r.branch !== filterBranch) return false;
      if (filterPlatform !== "All" && r.platform !== filterPlatform) return false;
      if (filterCategory !== "All" && (r.category || "") !== filterCategory) return false;
      if (filterBrand !== "All" && (r.brand || "") !== filterBrand) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          (r.order_id ?? "").toLowerCase().includes(q) ||
          (r.ordered_items ?? "").toLowerCase().includes(q) ||
          (r.cancellation_reason ?? "").toLowerCase().includes(q) ||
          (r.encoded_by ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [records, filterBranch, filterPlatform, filterCategory, filterBrand, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (sortCol === "total_amount" || sortCol === "refund_amount" || sortCol === "id") {
        const na = Number(av);
        const nb = Number(bv);
        const cmp = na < nb ? -1 : na > nb ? 1 : 0;
        return sortAsc ? cmp : -cmp;
      }
      const cmp = String(av) < String(bv) ? -1 : String(av) > String(bv) ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });
  }, [filtered, sortCol, sortAsc]);

  const handleSort = (col: keyof DubaiCancelRow) => {
    if (sortCol === col) setSortAsc((p) => !p);
    else {
      setSortCol(col);
      setSortAsc(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-sm text-white/30">
        <Spinner size="sm" /> Loading Dubai cancellation data…
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

  const branches = ["All", ...BRANCHES_FULL];
  const platforms = ["All", "Careem", "Keeta", "Talabat"];
  const categories = ["All", "Cancellation", "Refund/Complaint"];
  const brands = ["All", "Sushi ZEN", "Ramen ZEN"];

  const piePlatformData = Object.entries(summary.by_platform || {}).map(([name, v]) => ({
    name,
    value: v.count,
    color: PLATFORM_COLORS[name] ?? "#888",
  }));

  const branchBarData = BRANCHES_FULL.map((br) => ({
    branch: br === "Business Bay" ? "Biz Bay" : br === "Al Hudaiba" ? "Hudaiba" : br === "Al Barsha" ? "AB" : br,
    Careem: records.filter((r) => r.branch === br && r.platform === "Careem").length,
    Keeta: records.filter((r) => r.branch === br && r.platform === "Keeta").length,
    Talabat: records.filter((r) => r.branch === br && r.platform === "Talabat").length,
  }));

  const cancelN = summary.by_category?.["Cancellation"] ?? 0;
  const refundCatN = summary.by_category?.["Refund/Complaint"] ?? 0;

  return (
    <div className={GLASS_CARD}>
      <div className="space-y-6 p-4 pb-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Dubai Cancellations &amp; Refunds</h2>
            <p className={`${T_CAPTION} mt-1`}>
              Careem · Keeta · Talabat — cancellation and refund incidents. Range follows{" "}
              <strong className="text-white/50">Summary Range</strong> above.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void fetchAll()}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/50 transition-colors hover:text-white"
          >
            ↻ Refresh
          </button>
        </div>

        {summary.total === 0 ? (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs text-amber-100/90">
            No Dubai cancellation records in this date range. Widen <strong>Summary Range</strong>, or import historical
            data (Excel / Admin → Dubai Cancellation).
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard
            label="Total Incidents"
            value={summary.total.toLocaleString()}
            sub={`${cancelN} cancellations · ${refundCatN} refunds / complaints`}
            accent="#ef4444"
            icon="⚠️"
          />
          <KpiCard
            label="Amount at Risk (Total)"
            value={fmtAED(summary.total_aed)}
            sub={`Refund ${summary.refund_aed.toFixed(0)} AED · Comp ${summary.compensation_aed.toFixed(0)} AED`}
            accent="#f59e0b"
            icon="💰"
          />
          <KpiCard
            label="Careem / Keeta / Talabat"
            value={`${summary.by_platform?.Careem?.count ?? 0} / ${summary.by_platform?.Keeta?.count ?? 0} / ${summary.by_platform?.Talabat?.count ?? 0}`}
            sub={`AED ${Math.round(summary.by_platform?.Careem?.aed ?? 0).toLocaleString()} / ${Math.round(summary.by_platform?.Keeta?.aed ?? 0).toLocaleString()} / ${Math.round(summary.by_platform?.Talabat?.aed ?? 0).toLocaleString()}`}
            accent="#00c896"
            icon="📊"
          />
          <KpiCard
            label="Ticket / Email"
            value={`${summary.ticket_sent_pct}%`}
            sub="Flagged from email / ticket status"
            accent="#6366f1"
            icon="🎫"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 lg:col-span-2">
            <h3 className="mb-4 text-sm font-medium text-white/60">Monthly Trend by Platform</h3>
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
                <Line type="monotone" dataKey="careem" name="Careem" stroke="#00c896" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="keeta" name="Keeta" stroke="#ff6b35" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="talabat" name="Talabat" stroke="#ff2d55" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
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
                <XAxis dataKey="branch" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.5)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.35)" }} axisLine={false} tickLine={false} width={28} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }} iconSize={8} />
                <Bar dataKey="Careem" stackId="a" fill="#00c896" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Keeta" stackId="a" fill="#ff6b35" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Talabat" stackId="a" fill="#ff2d55" radius={[4, 4, 0, 0]} />
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
            {platforms.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setFilterPlatform(p)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  filterPlatform === p ? "text-white" : "text-white/40 hover:text-white/70"
                }`}
                style={filterPlatform === p ? { backgroundColor: p === "All" ? "#6366f1" : PLATFORM_COLORS[p] } : undefined}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-lg border border-white/10 bg-white/5">
            {branches.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setFilterBranch(b)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  filterBranch === b ? "text-white" : "text-white/40 hover:text-white/70"
                }`}
                style={filterBranch === b ? { backgroundColor: b === "All" ? "#6366f1" : BRANCH_COLORS[b] } : undefined}
              >
                {b === "Business Bay" ? "Biz Bay" : b === "Al Hudaiba" ? "Hudaiba" : b}
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
                {c === "Refund/Complaint" ? "Refund" : c}
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-lg border border-white/10 bg-white/5">
            {brands.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setFilterBrand(b)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  filterBrand === b ? "bg-indigo-600 text-white" : "text-white/40 hover:text-white/70"
                }`}
              >
                {b}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order, reason…"
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
                      { key: "brand" as const, label: "Brand" },
                      { key: "category" as const, label: "Category" },
                      { key: "order_id" as const, label: "Order ID" },
                      { key: "total_amount" as const, label: "AED" },
                      { key: "refund_amount" as const, label: "Refund" },
                      { key: "cancellation_reason" as const, label: "Reason" },
                      { key: "email_status" as const, label: "Ticket" },
                      { key: "encoded_by" as const, label: "Encoded By" },
                    ] as { key: keyof DubaiCancelRow; label: string }[]
                  ).map(({ key, label }) => (
                    <th
                      key={key}
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
                  const em = (r.email_status ?? "").toLowerCase();
                  const ticketColor = em.includes("sent") || em.includes("email") ? "text-emerald-400" : em.includes("no need") ? "text-white/30" : "text-amber-400";
                  const isCancel = r.category === "Cancellation";
                  return (
                    <tr key={r.id ?? i} className="border-b border-white/5 transition-colors hover:bg-white/5">
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
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: BRANCH_COLORS[r.branch] ?? "#888" }} />
                          <span className="text-xs" style={{ color: BRANCH_COLORS[r.branch] ?? "#ccc" }}>
                            {r.branch}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-white/50">{r.brand ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            isCancel ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"
                          }`}
                        >
                          {r.category ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-white/40">{r.order_id}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold text-white">
                        {r.total_amount != null ? `AED ${Number(r.total_amount).toLocaleString("en-AE")}` : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-amber-400">
                        {r.refund_amount != null && Number(r.refund_amount) > 0
                          ? `AED ${Number(r.refund_amount).toLocaleString("en-AE")}`
                          : "—"}
                      </td>
                      <td className="max-w-[180px] truncate px-4 py-2.5 text-white/50" title={r.cancellation_reason ?? ""}>
                        {r.cancellation_reason ?? "—"}
                      </td>
                      <td className={`max-w-[140px] truncate px-4 py-2.5 text-xs ${ticketColor}`} title={r.email_status ?? ""}>
                        {r.email_status ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-white/40">{r.encoded_by ?? "—"}</td>
                    </tr>
                  );
                })}
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-white/25">
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
