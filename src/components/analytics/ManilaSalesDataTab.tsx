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
  const [data, setData] = useState<DailySalesRow[]>([]);
  const [meta, setMeta] = useState<{ grandOrders: number; grandAmount: number } | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>("all");

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
      setData(res.items || []);
      setMeta({
        grandOrders: Number(res.grand_total_orders || 0),
        grandAmount: Number(res.grand_total_amount || 0),
      });
    } catch (e) {
      setData([]);
      setMeta(null);
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [approverName, pin, canLoad, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const fmt = (n: number | null) =>
    n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("en-PH", { maximumFractionDigits: 0 });
  const fmtMoney = (n: number | null) =>
    n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmtPct = (n: number | null) =>
    n == null || !Number.isFinite(n) ? "—" : `${(n * 100).toFixed(1)}%`;

  const branchOrder = useMemo(() => {
    const seen = new Set<string>();
    const extras: string[] = [];
    for (const r of data) {
      const b = String(r.branch || "").trim();
      if (!b || seen.has(b)) continue;
      seen.add(b);
      if (!KNOWN_BRANCHES.includes(b as (typeof KNOWN_BRANCHES)[number])) extras.push(b);
    }
    extras.sort();
    return [...KNOWN_BRANCHES, ...extras];
  }, [data]);

  const storeTotals = useMemo(() => {
    return branchOrder.map((b) => {
      const rows = data.filter((r) => r.branch === b);
      return {
        branch: b,
        dine_in_orders: rows.reduce((s, r) => s + (r.dine_in_orders ?? 0), 0),
        grabfood_orders: rows.reduce((s, r) => s + (r.grabfood_orders ?? 0), 0),
        foodpanda_orders: rows.reduce((s, r) => s + (r.foodpanda_orders ?? 0), 0),
        total_orders: rows.reduce((s, r) => s + (r.total_orders ?? 0), 0),
        total_amount: rows.reduce((s, r) => s + (r.total_amount ?? 0), 0),
      };
    });
  }, [branchOrder, data]);

  const filtered = selectedBranch === "all" ? data : data.filter((r) => r.branch === selectedBranch);
  const visibleTotals = storeTotals.filter((s) => s.total_orders > 0 || data.some((r) => r.branch === s.branch));

  return (
    <div className={GLASS_CARD}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3">
        <div>
          <h2 className={T_SECTION}>Sales Data (Manila)</h2>
          <p className={T_CAPTION}>
            Dine in / GrabFood / Foodpanda daily counts and PHP amounts (imported into{" "}
            <code className="text-neutral-400">manila_daily_sales</code>). Not the same source as synced POS channel
            analytics.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || !canLoad} className={SECONDARY_BUTTON}>
          {loading ? <Spinner size="sm" /> : "Refresh"}
        </button>
      </div>

      <div className="p-4">
        {!canLoad ? (
          <p className={T_BODY}>Complete Security (MFA) and enter approver + PIN to load.</p>
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : loading && !data.length ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : !data.length ? (
          <p className={T_BODY}>
            No rows for this range. Import{" "}
            <code className="text-neutral-400">Manila_Daily_Data_DB_Ready.xlsx</code> (Sales_Data sheet) via{" "}
            <code className="text-neutral-400">POST /api/admin/analytics/manila/daily-sales/import</code> or run{" "}
            <code className="text-neutral-400">scripts/import_manila_daily_excel.py</code>.
          </p>
        ) : (
          <div className="space-y-6">
            {meta ? (
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-4 py-3 text-sm text-neutral-300">
                <span className="text-neutral-500">Period total (all rows):</span>{" "}
                <span className="font-semibold text-white">{fmt(meta.grandOrders)}</span> orders · PHP{" "}
                <span className="font-semibold text-white">{fmtMoney(meta.grandAmount)}</span>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {visibleTotals.map((s) => (
                <div key={s.branch} className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-4">
                  <div className="mb-2 text-xs font-semibold text-neutral-400">{s.branch}</div>
                  <div className="text-xl font-bold text-white">{fmt(s.total_orders)} orders</div>
                  <div className="text-sm text-neutral-300">PHP {fmtMoney(s.total_amount)}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-neutral-500">
                    <span>Dine in: {fmt(s.dine_in_orders)}</span>
                    <span>Grab: {fmt(s.grabfood_orders)}</span>
                    <span>FP: {fmt(s.foodpanda_orders)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedBranch("all")}
                className={`rounded-lg px-3 py-1 text-xs ${
                  selectedBranch === "all" ? "bg-sky-600 text-white" : "bg-neutral-800 text-neutral-300"
                }`}
              >
                All branches
              </button>
              {branchOrder.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setSelectedBranch(b)}
                  className={`rounded-lg px-3 py-1 text-xs ${
                    selectedBranch === b ? "bg-sky-600 text-white" : "bg-neutral-800 text-neutral-300"
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto rounded-xl border border-neutral-800">
              <table className="w-full min-w-[900px] text-xs">
                <thead>
                  <tr className="border-b border-neutral-800 bg-neutral-950/80 text-left text-neutral-400">
                    <th className="px-2 py-2">Date</th>
                    <th className="px-2 py-2">Branch</th>
                    <th className="px-2 py-2 text-right">Dine in #</th>
                    <th className="px-2 py-2 text-right">Dine In PHP</th>
                    <th className="px-2 py-2 text-right">Grab #</th>
                    <th className="px-2 py-2 text-right">Grab PHP</th>
                    <th className="px-2 py-2 text-right">FP #</th>
                    <th className="px-2 py-2 text-right">FP PHP</th>
                    <th className="px-2 py-2 text-right font-semibold text-white">Total #</th>
                    <th className="px-2 py-2 text-right font-semibold text-white">Total PHP</th>
                    <th className="px-2 py-2 text-right">WoW</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, i) => (
                    <tr key={`${row.sale_date}-${row.branch}-${i}`} className={i % 2 === 0 ? "bg-neutral-950/30" : ""}>
                      <td className="px-2 py-1.5 text-neutral-300">{row.sale_date}</td>
                      <td className="px-2 py-1.5 text-neutral-300">{row.branch}</td>
                      <td className="px-2 py-1.5 text-right">{fmt(row.dine_in_orders)}</td>
                      <td className="px-2 py-1.5 text-right">{fmtMoney(row.dine_in_amount)}</td>
                      <td className="px-2 py-1.5 text-right">{fmt(row.grabfood_orders)}</td>
                      <td className="px-2 py-1.5 text-right">{fmtMoney(row.grabfood_amount)}</td>
                      <td className="px-2 py-1.5 text-right">{fmt(row.foodpanda_orders)}</td>
                      <td className="px-2 py-1.5 text-right">{fmtMoney(row.foodpanda_amount)}</td>
                      <td className="px-2 py-1.5 text-right font-medium text-white">{fmt(row.total_orders)}</td>
                      <td className="px-2 py-1.5 text-right font-medium text-white">{fmtMoney(row.total_amount)}</td>
                      <td
                        className={`px-2 py-1.5 text-right ${
                          row.ratio_to_prev_week == null
                            ? "text-neutral-600"
                            : row.ratio_to_prev_week >= 0
                              ? "text-emerald-400"
                              : "text-rose-400"
                        }`}
                      >
                        {fmtPct(row.ratio_to_prev_week)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
