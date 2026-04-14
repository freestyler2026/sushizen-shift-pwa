"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

function formatStoreLabel(storeName: string): string {
  const s = String(storeName || "").trim();
  if (s === "QC") return "Cubao (QC)";
  if (!s) return "—";
  return s;
}

function formatInt(n: number): string {
  return new Intl.NumberFormat("en-PH").format(Math.round(n));
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
      const res = await apiGet<ApiResp>(`/api/admin/analytics/manila/order-counts?${qs.toString()}`);
      setData(res);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Failed to load order counts");
    } finally {
      setLoading(false);
    }
  }, [approverName, pin, canLoad, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedItems = useMemo(() => {
    const items = data?.items || [];
    return [...items].sort((a, b) => {
      const sa = formatStoreLabel(a.store_name).localeCompare(formatStoreLabel(b.store_name));
      if (sa !== 0) return sa;
      return (b.total_transactions || 0) - (a.total_transactions || 0);
    });
  }, [data?.items]);

  return (
    <div id="sales-order-counts" className={GLASS_CARD}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3">
        <div>
          <h2 className={T_SECTION}>Number of Orders (Manila)</h2>
          <p className={T_CAPTION}>
            Channel × store transaction counts from synced sales (priority sources — same as Manila Sales by channel).
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || !canLoad}
          className={SECONDARY_BUTTON}
        >
          {loading ? <Spinner size="sm" /> : "Refresh"}
        </button>
      </div>

      <div className="p-4">
        {!canLoad ? (
          <p className={T_BODY}>Complete Security (MFA) and enter approver + PIN to load.</p>
        ) : loading && !data ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : error ? (
          <p className="text-sm text-rose-400">{error}</p>
        ) : !sortedItems.length ? (
          <p className={T_BODY}>
            期間内にデータがありません（同期未実施の可能性があります）。Manila sales の同期を実行するか、日付範囲を広げてください。
          </p>
        ) : (
          <>
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-4 py-3">
                <div className="text-xs text-neutral-500">Grand total (transactions)</div>
                <div className="text-xl font-semibold text-white">
                  {formatInt(data?.grand_total_transactions ?? 0)}
                </div>
              </div>
              {(data?.store_totals || []).map((st) => (
                <div
                  key={st.store_name}
                  className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-4 py-3"
                >
                  <div className="text-xs text-neutral-500">{formatStoreLabel(st.store_name)}</div>
                  <div className="text-lg font-semibold text-white">{formatInt(st.total_transactions)}</div>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto rounded-xl border border-neutral-800">
              <table className="min-w-full text-left text-sm text-neutral-200">
                <thead className="bg-neutral-900/80 text-xs uppercase text-neutral-500">
                  <tr>
                    <th className="px-3 py-2">Store</th>
                    <th className="px-3 py-2">Channel</th>
                    <th className="px-3 py-2 text-right">Orders</th>
                    <th className="hidden px-3 py-2 text-right sm:table-cell">Net sales (PHP)</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map((row, i) => (
                    <tr key={`${row.store_name}-${row.transaction_channel}-${i}`} className="border-t border-neutral-800/80">
                      <td className="px-3 py-2">{formatStoreLabel(row.store_name)}</td>
                      <td className="px-3 py-2">{row.transaction_channel || "—"}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {formatInt(row.total_transactions || 0)}
                      </td>
                      <td className="hidden px-3 py-2 text-right tabular-nums text-neutral-400 sm:table-cell">
                        {row.net_sales != null ? formatInt(Number(row.net_sales)) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(data?.notes || []).length ? (
              <ul className="mt-3 list-inside list-disc text-xs text-neutral-500">
                {(data?.notes || []).map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
