"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAuth, getAuthHeaders, refreshAuthFromApi, tryRefreshAccessToken } from "@/lib/auth";
import { GLASS_CARD, SECONDARY_BUTTON, T_CAPTION, T_SECTION } from "@/lib/ui-tokens";
import { Spinner } from "@/components/ui/Spinner";
import { ShoppingBag } from "lucide-react";

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

type OrderRow = {
  store_name: string;
  transaction_channel: string;
  total_transactions: number;
  total_sales?: number;
  net_sales?: number;
};

type ApiResp = {
  ok: boolean;
  items: OrderRow[];
  store_totals?: { store_name: string; total_transactions: number }[];
  grand_total_transactions?: number;
  notes?: string[];
  date_from?: string;
  date_to?: string;
};

// Channel color config
const CHANNEL_CONFIG: Record<string, { bar: string; badge: string; dot: string }> = {
  grabfood:  { bar: "bg-emerald-500", badge: "bg-emerald-500/15 text-emerald-300", dot: "bg-emerald-400" },
  foodpanda: { bar: "bg-pink-500",    badge: "bg-pink-500/15 text-pink-300",       dot: "bg-pink-400" },
  "dine-in": { bar: "bg-blue-500",    badge: "bg-blue-500/15 text-blue-300",       dot: "bg-blue-400" },
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<ApiResp | null>(null);

  const canLoad = Boolean(approverName.trim() && pin.trim() && stepUpReady);

  const load = useCallback(async () => {
    if (!canLoad) { setError("Enter approver name, PIN, and complete Security (MFA) for Manila analytics."); return; }
    setLoading(true); setError("");
    try {
      const qs = new URLSearchParams({ approver_name: approverName.trim(), pin: pin.trim(), date_from: dateFrom, date_to: dateTo });
      const res = await apiGet<ApiResp>(`/api/admin/analytics/manila/order-counts?${qs.toString()}`);
      setData(res);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Failed to load order counts");
    } finally {
      setLoading(false);
    }
  }, [approverName, pin, canLoad, dateFrom, dateTo]);

  useEffect(() => { void load(); }, [load]);

  // Group items by store
  const storeGroups = useMemo(() => {
    const items = data?.items || [];
    const map = new Map<string, OrderRow[]>();
    for (const row of items) {
      const label = formatStoreLabel(row.store_name);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(row);
    }
    // Sort channels within each store by orders desc
    for (const rows of map.values()) {
      rows.sort((a, b) => (b.total_transactions || 0) - (a.total_transactions || 0));
    }
    // Sort stores
    return Array.from(map.entries()).sort(([a], [b]) => {
      const ai = STORE_ORDER.indexOf(a);
      const bi = STORE_ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [data?.items]);

  const grandTotal = data?.grand_total_transactions ?? 0;
  const maxStoreTotal = useMemo(() => {
    const totals = (data?.store_totals || []).map((s) => s.total_transactions);
    return Math.max(...totals, 1);
  }, [data?.store_totals]);

  // Build store total lookup
  const storeTotalMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const st of data?.store_totals || []) {
      const label = formatStoreLabel(st.store_name);
      m.set(label, (m.get(label) ?? 0) + st.total_transactions);
    }
    return m;
  }, [data?.store_totals]);

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
              <div className="mt-1 text-4xl font-bold text-white">{formatInt(grandTotal)}</div>
              <div className="mt-0.5 text-xs text-neutral-500">transactions across all stores</div>
            </div>

            {/* Store breakdown cards */}
            <div className="grid gap-3 sm:grid-cols-3">
              {storeGroups.map(([storeName, rows]) => {
                const storeTotal = storeTotalMap.get(storeName) ?? rows.reduce((s, r) => s + r.total_transactions, 0);
                const pct = grandTotal > 0 ? (storeTotal / grandTotal) * 100 : 0;
                const barPct = maxStoreTotal > 0 ? (storeTotal / maxStoreTotal) * 100 : 0;

                return (
                  <div key={storeName} className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">{storeName}</div>
                    <div className="flex items-end gap-2">
                      <div className="text-2xl font-bold text-white">{formatInt(storeTotal)}</div>
                      <div className="mb-0.5 text-xs text-neutral-500">{pct.toFixed(1)}%</div>
                    </div>
                    {/* Store share bar */}
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
                      <div className="h-full rounded-full bg-violet-500" style={{ width: `${barPct}%` }} />
                    </div>
                    {/* Channel breakdown */}
                    <div className="mt-3 space-y-1.5">
                      {rows.map((row) => {
                        const cfg = channelConfig(row.transaction_channel);
                        const chPct = storeTotal > 0 ? (row.total_transactions / storeTotal) * 100 : 0;
                        return (
                          <div key={row.transaction_channel}>
                            <div className="mb-0.5 flex items-center justify-between text-xs">
                              <span className={`flex items-center gap-1.5`}>
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
                      const cfg = channelConfig(row.transaction_channel);
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
    </div>
  );
}
