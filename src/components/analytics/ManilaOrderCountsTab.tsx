"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAuth, getAuthHeaders, refreshAuthFromApi, tryRefreshAccessToken } from "@/lib/auth";
import { GLASS_CARD, SECONDARY_BUTTON, T_CAPTION, T_SECTION } from "@/lib/ui-tokens";
import { Spinner } from "@/components/ui/Spinner";
import { ShoppingBag } from "lucide-react";
import MonthPicker from "@/components/MonthPicker";

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
    fetch(`${getApiBase()}${path}`, { cache: "no-store", headers: getAuthHeaders() });
  let res = await request();
  let text = await res.text();
  if (res.status === 401) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) { res = await request(); text = await res.text(); }
  }
  if (!res.ok && res.status === 401) {
    const detail = parseApiErrorDetail(text);
    const current = getAuth();
    if (current?.pin && (detail.includes("Invalid access token") || detail.includes("Authentication is required") || !current.accessToken)) {
      await refreshAuthFromApi(current, { includeMfa: true });
      res = await request(); text = await res.text();
    }
  }
  if (!res.ok) {
    const detail = parseApiErrorDetail(text);
    throw new Error(detail || text || `HTTP ${res.status}`);
  }
  return JSON.parse(text) as T;
}

function formatStoreLabel(storeName: string): string {
  const s = String(storeName || "").trim();
  if (s === "QC" || s === "QC (Quezon City)") return "Cubao";
  if (!s) return "—";
  return s;
}

function formatInt(n: number): string {
  return new Intl.NumberFormat("en-PH").format(Math.round(n));
}

function formatPhp(n: number): string {
  return new Intl.NumberFormat("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n));
}

function formatPhpM(n: number): string {
  if (n >= 1_000_000) return `₱${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `₱${(n / 1_000).toFixed(1)}K`;
  return `₱${formatPhp(n)}`;
}

const MONTH_NAMES_DISP = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function monthDisplayLabel(mk: string): string {
  const parts = mk.split("-").map(Number);
  const y = parts[0]; const m = parts[1];
  if (!y || !m) return mk;
  return `${MONTH_NAMES_DISP[m - 1]} ${y}`;
}

function monthToRange(mk: string): { from: string; to: string } {
  const parts = mk.split("-").map(Number);
  const y = parts[0]; const m = parts[1];
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

function shiftMonthKey(mk: string, delta: number): string {
  const parts = mk.split("-").map(Number);
  const d = new Date(parts[0], parts[1] - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Shift an ISO date string by `days` days */
function shiftDate(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Compute the "same-length window immediately before" a given [from, to] range */
function previousPeriod(from: string, to: string): { from: string; to: string; label: string } {
  const msPerDay = 86400000;
  const days = Math.round((new Date(to).getTime() - new Date(from).getTime()) / msPerDay) + 1;
  const prevTo   = shiftDate(from, -1);
  const prevFrom = shiftDate(prevTo, -(days - 1));
  // Build a human-readable label
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${MONTH_NAMES_DISP[d.getMonth()]} ${d.getDate()}`;
  };
  const label = `${fmt(prevFrom)} – ${fmt(prevTo)}`;
  return { from: prevFrom, to: prevTo, label };
}

const DATE_PRESETS = [
  { label: "7D",  days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
] as const;

function ComparisonCard({
  label,
  currentOrders, prevOrders,
  currentSales, prevSales,
  prevLabel,
}: {
  label: string;
  currentOrders: number; prevOrders: number;
  currentSales: number;  prevSales: number;
  prevLabel: string;
}) {
  const ordDiff  = prevOrders  > 0 ? ((currentOrders  - prevOrders)  / prevOrders)  * 100 : null;
  const salesDiff = prevSales  > 0 ? ((currentSales   - prevSales)   / prevSales)   * 100 : null;

  const pct = (diff: number | null) =>
    diff !== null
      ? <span className={`text-xl font-bold ${diff > 0 ? "text-emerald-400" : diff < 0 ? "text-red-400" : "text-neutral-300"}`}>
          {diff > 0 ? "+" : ""}{diff.toFixed(1)}%
        </span>
      : <span className="text-xl font-bold text-neutral-500">—</span>;

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">{label}</p>
      <div className="grid grid-cols-2 gap-3">
        {/* Orders */}
        <div>
          <p className="text-[10px] text-neutral-600 mb-0.5">Orders</p>
          {pct(ordDiff)}
          <p className="text-xs text-neutral-600 mt-0.5">
            {formatInt(currentOrders)} vs {formatInt(prevOrders)}
          </p>
        </div>
        {/* Net Sales */}
        <div>
          <p className="text-[10px] text-neutral-600 mb-0.5">Net Sales</p>
          {pct(salesDiff)}
          <p className="text-xs text-neutral-600 mt-0.5">
            {formatPhpM(currentSales)} vs {formatPhpM(prevSales)}
          </p>
        </div>
      </div>
      <p className="text-[10px] text-neutral-700">vs {prevLabel}</p>
    </div>
  );
}

type OrderRow = {
  store_name: string;
  transaction_channel: string;
  total_transactions: number;
  total_sales?: number;
  net_sales?: number;
};

type MonthHistoryRow = {
  month_key: string;
  label: string;
  orders: number;
  net_sales: number;
  days: number;
  avg_net_per_order: number;
  mom_orders: number | null;
  mom_net_sales: number | null;
};

type ApiResp = {
  ok: boolean;
  items: OrderRow[];
  store_totals?: { store_name: string; total_transactions: number }[];
  grand_total_transactions?: number;
  grand_total_net_sales?: number;
  notes?: string[];
  date_from?: string;
  date_to?: string;
};

// Channel color config
const CHANNEL_CONFIG: Record<string, { bar: string; badge: string; dot: string }> = {
  grabfood:     { bar: "bg-emerald-500", badge: "bg-emerald-500/15 text-emerald-300", dot: "bg-emerald-400" },
  foodpanda:    { bar: "bg-pink-500",    badge: "bg-pink-500/15 text-pink-300",       dot: "bg-pink-400" },
  "dine-in":    { bar: "bg-blue-500",    badge: "bg-blue-500/15 text-blue-300",       dot: "bg-blue-400" },
  beepdelivery: { bar: "bg-neutral-400", badge: "bg-neutral-700/40 text-neutral-400", dot: "bg-neutral-400" },
};

function channelKey(ch: string) { return ch.toLowerCase().replace(/\s/g, ""); }
function channelConfig(ch: string) { return CHANNEL_CONFIG[channelKey(ch)] ?? { bar: "bg-neutral-500", badge: "bg-neutral-700/40 text-neutral-400", dot: "bg-neutral-500" }; }

const STORE_ORDER = ["Taft", "Paranaque", "Cubao"];

export function ManilaOrderCountsTab({
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
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [data, setData]         = useState<ApiResp | null>(null);
  const [prevData, setPrevData] = useState<ApiResp | null>(null);
  const [prevLabel, setPrevLabel] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>("");

  const [historyRows, setHistoryRows] = useState<MonthHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Local date inputs
  const [localFrom, setLocalFrom] = useState(dateFrom);
  const [localTo, setLocalTo]     = useState(dateTo);
  const [activePreset, setActivePreset] = useState<string | null>("30D");

  // Sync when parent changes (city switch)
  useEffect(() => {
    setLocalFrom(dateFrom);
    setLocalTo(dateTo);
    setSelectedMonth("");
    setActivePreset("30D");
  }, [dateFrom, dateTo]);

  const effectiveDateFrom = selectedMonth ? monthToRange(selectedMonth).from : localFrom;
  const effectiveDateTo   = selectedMonth ? monthToRange(selectedMonth).to   : localTo;

  const canLoad = Boolean(approverName.trim() && pin.trim() && stepUpReady);

  const fetchRange = useCallback(async (from: string, to: string): Promise<ApiResp> => {
    const qs = new URLSearchParams({ approver_name: approverName.trim(), pin: pin.trim(), date_from: from, date_to: to });
    return apiGet<ApiResp>(`/api/admin/analytics/manila/order-counts?${qs.toString()}`);
  }, [approverName, pin]);

  const load = useCallback(async (from?: string, to?: string) => {
    if (!canLoad) { setError("Enter approver name, PIN, and complete Security (MFA) for Manila analytics."); return; }
    const df = from ?? effectiveDateFrom;
    const dt = to   ?? effectiveDateTo;
    setLoading(true); setError("");
    try {
      const [current, prev] = await Promise.all([
        fetchRange(df, dt),
        fetchRange(previousPeriod(df, dt).from, previousPeriod(df, dt).to),
      ]);
      setData(current);
      setPrevData(prev);
      setPrevLabel(previousPeriod(df, dt).label);
    } catch (e) {
      setData(null);
      setPrevData(null);
      setError(e instanceof Error ? e.message : "Failed to load order counts");
    } finally {
      setLoading(false);
    }
  }, [canLoad, effectiveDateFrom, effectiveDateTo, fetchRange]);

  useEffect(() => { void load(); }, [load]);

  const loadHistory = useCallback(async () => {
    if (!canLoad) return;
    setHistoryLoading(true);
    try {
      const qs = new URLSearchParams({ approver_name: approverName.trim(), pin: pin.trim(), months: "12" });
      const resp = await apiGet<{ ok: boolean; months: MonthHistoryRow[] }>(
        `/api/admin/analytics/manila/monthly-history?${qs.toString()}`
      );
      setHistoryRows(resp.months || []);
    } catch {
      setHistoryRows([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [canLoad, approverName, pin]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const handleMonthSelect = useCallback((mk: string) => {
    const range = monthToRange(mk);
    setSelectedMonth(mk);
    setActivePreset(null);
    setLocalFrom(range.from);
    setLocalTo(range.to);
    // For month selection, prev label is the previous month name
    const prevMk = shiftMonthKey(mk, -1);
    setPrevLabel(monthDisplayLabel(prevMk));
    void load(range.from, range.to);
  }, [load]);

  const applyPreset = useCallback((label: string, days: number) => {
    const to = new Date();
    to.setDate(to.getDate() - 2); // 前々日
    const from = new Date(to);
    from.setDate(from.getDate() - (days - 1));
    const toStr   = to.toISOString().slice(0, 10);
    const fromStr = from.toISOString().slice(0, 10);
    setLocalFrom(fromStr);
    setLocalTo(toStr);
    setSelectedMonth("");
    setActivePreset(label);
    void load(fromStr, toStr);
  }, [load]);

  const applyCustomRange = useCallback(() => {
    if (!localFrom || !localTo) return;
    setSelectedMonth("");
    setActivePreset(null);
    void load(localFrom, localTo);
  }, [localFrom, localTo, load]);

  const clearMonth = useCallback(() => {
    setSelectedMonth("");
    applyPreset("30D", 30);
  }, [applyPreset]);

  // Group items by store
  const storeGroups = useMemo(() => {
    const items = data?.items || [];
    const map = new Map<string, OrderRow[]>();
    for (const row of items) {
      const label = formatStoreLabel(row.store_name);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(row);
    }
    for (const rows of map.values()) {
      rows.sort((a, b) => (b.total_transactions || 0) - (a.total_transactions || 0));
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      const ai = STORE_ORDER.indexOf(a), bi = STORE_ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [data?.items]);

  const grandTotal     = data?.grand_total_transactions ?? 0;
  const grandNetSales  = data?.grand_total_net_sales ?? (data?.items || []).reduce((s, r) => s + (Number(r.net_sales) || 0), 0);
  const prevTotal      = prevData?.grand_total_transactions ?? 0;
  const prevNetSales   = prevData?.grand_total_net_sales ?? (prevData?.items || []).reduce((s, r) => s + (Number(r.net_sales) || 0), 0);

  const maxStoreTotal = useMemo(() => {
    const totals = (data?.store_totals || []).map((s) => s.total_transactions);
    return Math.max(...totals, 1);
  }, [data?.store_totals]);

  const storeTotalMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const st of data?.store_totals || []) {
      const label = formatStoreLabel(st.store_name);
      m.set(label, (m.get(label) ?? 0) + st.total_transactions);
    }
    return m;
  }, [data?.store_totals]);

  const displayDays = useMemo(() => {
    if (!effectiveDateFrom || !effectiveDateTo) return null;
    const ms = new Date(effectiveDateTo).getTime() - new Date(effectiveDateFrom).getTime();
    return Math.round(ms / 86400000) + 1;
  }, [effectiveDateFrom, effectiveDateTo]);

  const showComparison = Boolean(data && (prevTotal > 0 || prevNetSales > 0));

  return (
    <div id="sales-order-counts" className={GLASS_CARD}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 px-5 py-4">
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-4 w-4 text-violet-400" />
          <div>
            <h2 className={T_SECTION}>Number of Orders (Manila)</h2>
            <p className={T_CAPTION}>Channel × store transaction counts from manila_daily_sales.</p>
          </div>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || !canLoad} className={SECONDARY_BUTTON}>
          {loading ? <Spinner size="sm" /> : "Refresh"}
        </button>
      </div>

      {/* Date controls */}
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 px-5 py-3">
        <div className="flex items-center gap-1">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p.label, p.days)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                activePreset === p.label
                  ? "bg-violet-600 text-white"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <span className="text-neutral-700">|</span>
        <span className="text-xs font-medium text-neutral-500">FROM</span>
        <input
          type="date"
          value={localFrom}
          max={localTo || undefined}
          onChange={(e) => { setLocalFrom(e.target.value); setActivePreset(null); setSelectedMonth(""); }}
          className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 focus:border-violet-500 focus:outline-none"
        />
        <span className="text-xs font-medium text-neutral-500">TO</span>
        <input
          type="date"
          value={localTo}
          min={localFrom || undefined}
          onChange={(e) => { setLocalTo(e.target.value); setActivePreset(null); setSelectedMonth(""); }}
          className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 focus:border-violet-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={applyCustomRange}
          disabled={!localFrom || !localTo}
          className="rounded bg-violet-600 px-3 py-1 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-40 transition-colors"
        >
          Apply
        </button>
        <span className="text-neutral-700">|</span>
        <div className="w-44">
          <MonthPicker value={selectedMonth} onChange={handleMonthSelect} />
        </div>
        {selectedMonth ? (
          <button type="button" onClick={clearMonth} className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors">
            Clear
          </button>
        ) : null}
      </div>

      <div className="p-5">
        {!canLoad ? (
          <p className="text-sm text-neutral-500">Complete Security (MFA) and enter approver + PIN to load.</p>
        ) : loading && !data ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : error ? (
          <p className="text-sm text-rose-400">{error}</p>
        ) : !storeGroups.length ? (
          <p className="text-sm text-neutral-500">No data for this period. Run a Manila sales sync or widen the date range.</p>
        ) : (
          <div className="space-y-5">
            {/* Grand total hero */}
            <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 px-5 py-4">
              <div className="text-xs font-semibold uppercase tracking-[0.15em] text-violet-400">Grand Total</div>
              <div className="flex flex-wrap items-end gap-6 mt-1">
                <div>
                  <div className="text-4xl font-bold text-white">{formatInt(grandTotal)}</div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    orders{displayDays ? ` · ${displayDays} days` : ""}
                  </div>
                </div>
                {grandNetSales > 0 ? (
                  <div>
                    <div className="text-2xl font-semibold text-emerald-300">{formatPhpM(grandNetSales)}</div>
                    <div className="mt-0.5 text-xs text-neutral-500">net sales</div>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Period comparison — always shown when prev data available */}
            {showComparison ? (
              <ComparisonCard
                label={`vs Previous Period (${prevLabel})`}
                currentOrders={grandTotal}
                prevOrders={prevTotal}
                currentSales={grandNetSales}
                prevSales={prevNetSales}
                prevLabel={prevLabel}
              />
            ) : null}

            {/* Store breakdown cards */}
            <div className="grid gap-3 sm:grid-cols-3">
              {storeGroups.map(([storeName, rows]) => {
                const storeTotal = storeTotalMap.get(storeName) ?? rows.reduce((s, r) => s + r.total_transactions, 0);
                const storeNetSales = rows.reduce((s, r) => s + (Number(r.net_sales) || 0), 0);
                const pct    = grandTotal > 0 ? (storeTotal / grandTotal) * 100 : 0;
                const barPct = maxStoreTotal > 0 ? (storeTotal / maxStoreTotal) * 100 : 0;

                return (
                  <div key={storeName} className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">{storeName}</div>
                    <div className="flex items-end gap-2">
                      <div className="text-2xl font-bold text-white">{formatInt(storeTotal)}</div>
                      <div className="mb-0.5 text-xs text-neutral-500">{pct.toFixed(1)}%</div>
                    </div>
                    {storeNetSales > 0 ? (
                      <div className="text-xs text-emerald-400/80 mt-0.5">{formatPhpM(storeNetSales)}</div>
                    ) : null}
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
                      <div className="h-full rounded-full bg-violet-500" style={{ width: `${barPct}%` }} />
                    </div>
                    <div className="mt-3 space-y-1.5">
                      {rows.map((row) => {
                        const cfg   = channelConfig(row.transaction_channel);
                        const chPct = storeTotal > 0 ? (row.total_transactions / storeTotal) * 100 : 0;
                        return (
                          <div key={row.transaction_channel}>
                            <div className="mb-0.5 flex items-center justify-between text-xs">
                              <span className="flex items-center gap-1.5">
                                <span className={`inline-block h-2 w-2 rounded-full ${cfg.dot}`} />
                                <span className="text-neutral-400">{row.transaction_channel}</span>
                              </span>
                              <span className="font-medium text-neutral-300">{formatInt(row.total_transactions)}</span>
                            </div>
                            <div className="h-1 w-full overflow-hidden rounded-full bg-neutral-800">
                              <div className={`h-full rounded-full ${cfg.bar}`} style={{ width: `${chPct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Detail table */}
            <div className="overflow-x-auto rounded-xl border border-neutral-800">
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-900/80">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Store</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Channel</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Orders</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">% of store</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Net Sales (PHP)</th>
                  </tr>
                </thead>
                <tbody>
                  {storeGroups.map(([storeName, rows]) => {
                    const storeTotal = storeTotalMap.get(storeName) ?? rows.reduce((s, r) => s + r.total_transactions, 0);
                    return rows.map((row, ri) => {
                      const cfg   = channelConfig(row.transaction_channel);
                      const chPct = storeTotal > 0 ? (row.total_transactions / storeTotal) * 100 : 0;
                      return (
                        <tr key={`${storeName}-${row.transaction_channel}`} className={`border-t border-neutral-800/60 ${ri === 0 ? "bg-neutral-800/20" : ""}`}>
                          <td className="px-4 py-2.5 font-medium text-neutral-200">
                            {ri === 0 ? storeName : <span className="text-neutral-700">↳</span>}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.badge}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                              {row.transaction_channel}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-neutral-100">
                            {formatInt(row.total_transactions)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-neutral-400">
                            {chPct.toFixed(1)}%
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-neutral-300">
                            {row.net_sales != null ? formatPhp(Number(row.net_sales)) : "—"}
                          </td>
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>

            {(data?.notes || []).length ? (
              <ul className="list-inside list-disc text-xs text-neutral-600">
                {(data?.notes || []).map((n) => <li key={n}>{n}</li>)}
              </ul>
            ) : null}
          </div>
        )}
      </div>

      {/* Monthly History — always shown when auth ready */}
      {canLoad ? (
        <div className="border-t border-neutral-800 px-5 pb-6 pt-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-400">Monthly History — Last 12 Complete Months</p>
              <p className="text-[10px] text-neutral-600 mt-0.5">Orders + net sales from manila_daily_sales · complete months only</p>
            </div>
            {historyLoading ? <Spinner size="sm" /> : null}
          </div>
          {historyRows.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-neutral-800">
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-900/80">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Month</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Net Sales (PHP)</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">MoM</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Orders</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">MoM (orders)</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Avg/Order</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Days</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500 w-24">Bar</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const maxSales = Math.max(...historyRows.map(r => r.net_sales), 1);
                    return historyRows.map((row) => {
                      const barW = Math.round((row.net_sales / maxSales) * 100);
                      const momSales = row.mom_net_sales;
                      const momOrd   = row.mom_orders;
                      const momCell = (v: number | null) => {
                        if (v === null) return <span className="text-neutral-600">—</span>;
                        const cls = v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-neutral-400";
                        return (
                          <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
                            v > 0 ? "bg-emerald-500/10" : v < 0 ? "bg-red-500/10" : "bg-neutral-800"
                          } ${cls}`}>
                            {v > 0 ? "↑" : v < 0 ? "↓" : ""}{v > 0 ? "+" : ""}{v.toFixed(1)}%
                          </span>
                        );
                      };
                      return (
                        <tr key={row.month_key} className="border-t border-neutral-800/60 hover:bg-neutral-800/20 transition-colors">
                          <td className="px-4 py-2.5 font-medium text-neutral-200">{row.label}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-neutral-100 font-semibold">
                            {formatPhp(row.net_sales)}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {momCell(momSales)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-neutral-300">
                            {formatInt(row.orders)}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {momCell(momOrd)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-neutral-400">
                            {formatPhp(row.avg_net_per_order)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-neutral-500">{row.days}</td>
                          <td className="px-4 py-2.5">
                            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
                              <div className="h-full rounded-full bg-violet-500" style={{ width: `${barW}%` }} />
                            </div>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          ) : historyLoading ? null : (
            <p className="text-xs text-neutral-600">No complete-month data found.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
