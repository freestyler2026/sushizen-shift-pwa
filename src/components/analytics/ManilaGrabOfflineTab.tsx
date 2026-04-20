"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RefreshCw, WifiOff, RotateCcw } from "lucide-react";
import { getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";
import { GLASS_CARD, SECONDARY_BUTTON, T_CAPTION, T_SECTION } from "@/lib/ui-tokens";
import { Spinner } from "@/components/ui/Spinner";

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
      res = await request(); text = await res.text();
    }
  }
  if (!res.ok) {
    let detail = text;
    try { const j = JSON.parse(text); if (typeof j?.detail === "string") detail = j.detail; } catch { /* ignore */ }
    throw new Error(detail || `GET ${path} failed`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function apiPost<T>(path: string): Promise<T> {
  const request = async () =>
    fetch(`${getApiBase()}${path}`, { method: "POST", cache: "no-store", headers: getAuthHeaders() });
  let res = await request();
  let text = await res.text();
  if (!res.ok && res.status === 401) {
    const current = getAuth();
    if (current?.pin && (text.includes("Invalid access token") || !current.accessToken)) {
      await refreshAuthFromApi(current, { includeMfa: true });
      res = await request(); text = await res.text();
    }
  }
  if (!res.ok) {
    let detail = text;
    try { const j = JSON.parse(text); if (typeof j?.detail === "string") detail = j.detail; } catch { /* ignore */ }
    throw new Error(detail || `POST ${path} failed`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

type OfflineRow = {
  sale_date: string;
  store_name: string;
  grab_service: string;
  offline_minutes: number;
  scheduled_open_minutes: number;
  offline_rate_pct: number | null;
};

type ApiResp = { ok: boolean; items: OfflineRow[] };
type SyncResp = { ok: boolean; offline: number; skipped: number; rows: { offline: number }; errors: string[] };

const STORE_ORDER = ["Taft", "Paranaque", "QC", "Cubao"];

function fmtMin(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min}m`;
  return `${h}h ${min}m`;
}

function offlineRateColor(rate: number | null): string {
  if (rate == null) return "text-neutral-500";
  if (rate <= 5) return "text-emerald-400";
  if (rate <= 10) return "text-amber-400";
  return "text-red-400";
}

function offlineRateBg(rate: number | null): string {
  if (rate == null) return "";
  if (rate <= 5) return "bg-emerald-500/10";
  if (rate <= 10) return "bg-amber-500/10";
  return "bg-red-500/10";
}

function offlineBarColor(rate: number | null): string {
  if (rate == null) return "bg-neutral-600";
  if (rate <= 5) return "bg-emerald-500";
  if (rate <= 10) return "bg-amber-500";
  return "bg-red-500";
}

export function ManilaGrabOfflineTab({
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
  const [data, setData] = useState<OfflineRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [storeFilter, setStoreFilter] = useState("All");

  const canLoad = !!approverName.trim() && !!pin.trim() && stepUpReady;

  const load = useCallback(async () => {
    if (!canLoad) return;
    setLoading(true); setError("");
    try {
      const qs = new URLSearchParams({ approver_name: approverName.trim(), pin: pin.trim() });
      if (dateFrom) qs.set("date_from", dateFrom);
      if (dateTo) qs.set("date_to", dateTo);
      const res = await apiGet<ApiResp>(`/api/admin/analytics/manila/sales/grab-offline-hours?${qs}`);
      setData(res.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [approverName, pin, canLoad, dateFrom, dateTo]);

  useEffect(() => { void load(); }, [load]);

  const handleSync = async () => {
    if (!canLoad || syncing) return;
    setSyncing(true); setSyncMsg("");
    try {
      const qs = new URLSearchParams({ approver_name: approverName.trim(), pin: pin.trim() });
      const res = await apiPost<SyncResp>(`/api/admin/analytics/manila/grab-offline/sync?${qs}`);
      const imported = res.rows?.offline ?? 0;
      const skipped = res.skipped ?? 0;
      const errs = res.errors?.length ?? 0;
      setSyncMsg(`Synced: ${res.offline} file(s), ${imported} rows imported, ${skipped} skipped${errs > 0 ? `, ${errs} error(s)` : ""}`);
      await load();
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  // Filtered rows
  const filteredRows = useMemo(() => {
    if (!data) return [];
    if (storeFilter === "All") return data;
    return data.filter((r) => r.store_name === storeFilter);
  }, [data, storeFilter]);

  // All stores
  const allStores = useMemo(() => {
    const s = new Set((data ?? []).map((r) => r.store_name));
    return ["All", ...Array.from(s).sort((a, b) => {
      const ai = STORE_ORDER.indexOf(a), bi = STORE_ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1; if (bi === -1) return -1;
      return ai - bi;
    })];
  }, [data]);

  // Per-store aggregated stats
  const storeStats = useMemo(() => {
    if (!data?.length) return [];
    const map = new Map<string, { totalOffline: number; totalScheduled: number; days: Set<string> }>();
    for (const r of data) {
      if (!map.has(r.store_name)) map.set(r.store_name, { totalOffline: 0, totalScheduled: 0, days: new Set() });
      const s = map.get(r.store_name)!;
      s.totalOffline += r.offline_minutes;
      s.totalScheduled += r.scheduled_open_minutes;
      s.days.add(r.sale_date);
    }
    return Array.from(map.entries())
      .map(([store, s]) => ({
        store,
        totalOffline: s.totalOffline,
        totalScheduled: s.totalScheduled,
        days: s.days.size,
        rate: s.totalScheduled > 0 ? (s.totalOffline / s.totalScheduled) * 100 : null,
      }))
      .sort((a, b) => {
        const ai = STORE_ORDER.indexOf(a.store), bi = STORE_ORDER.indexOf(b.store);
        if (ai === -1 && bi === -1) return a.store.localeCompare(b.store);
        if (ai === -1) return 1; if (bi === -1) return -1;
        return ai - bi;
      });
  }, [data]);

  // Daily chart data (filtered by store)
  const chartData = useMemo(() => {
    const byDate = new Map<string, { date: string; offline_minutes: number; scheduled_open_minutes: number }>();
    for (const r of filteredRows) {
      if (!byDate.has(r.sale_date)) byDate.set(r.sale_date, { date: r.sale_date, offline_minutes: 0, scheduled_open_minutes: 0 });
      const d = byDate.get(r.sale_date)!;
      d.offline_minutes += r.offline_minutes;
      d.scheduled_open_minutes += r.scheduled_open_minutes;
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredRows]);

  const grandTotalOffline = storeStats.reduce((s, r) => s + r.totalOffline, 0);
  const grandTotalScheduled = storeStats.reduce((s, r) => s + r.totalScheduled, 0);
  const grandRate = grandTotalScheduled > 0 ? (grandTotalOffline / grandTotalScheduled) * 100 : null;
  const maxStoreOffline = Math.max(...storeStats.map((s) => s.totalOffline), 1);

  return (
    <div id="sales-manila-grab-offline" className={GLASS_CARD}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-800 px-5 py-4">
        <div className="flex items-center gap-2">
          <WifiOff className="h-4 w-4 text-orange-400" />
          <div>
            <h2 className={T_SECTION}>GrabFood Offline Hours (Manila)</h2>
            <p className={T_CAPTION}>Store offline minutes and scheduled open time from GrabFood exports.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleSync()}
            disabled={syncing || !canLoad}
            className="inline-flex items-center gap-1.5 rounded-lg border border-orange-600/40 bg-orange-600/15 px-3 py-1.5 text-xs font-medium text-orange-300 transition hover:bg-orange-600/25 disabled:opacity-50"
          >
            {syncing ? <Spinner size="sm" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Sync from Drive
          </button>
          <button type="button" onClick={() => void load()} disabled={loading || !canLoad} className={SECONDARY_BUTTON + " inline-flex items-center gap-1.5 text-sm"}>
            {loading ? <Spinner size="sm" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </button>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {syncMsg && (
          <div className={`rounded-xl px-4 py-2.5 text-xs ${syncMsg.includes("error") ? "border border-rose-800 bg-rose-950/30 text-rose-300" : "border border-emerald-800/40 bg-emerald-950/30 text-emerald-300"}`}>
            {syncMsg}
          </div>
        )}

        {!canLoad ? (
          <p className="text-sm text-neutral-500">Complete Security (MFA) and enter approver + PIN to load.</p>
        ) : loading && !data ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : error ? (
          <p className="text-sm text-rose-400">{error}</p>
        ) : !data?.length ? (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 px-4 py-8 text-center text-sm text-neutral-500">
            No data for this period. Click <strong className="text-neutral-300">Sync from Drive</strong> to import GrabFood offline CSVs.
          </div>
        ) : (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-orange-400">Total Offline</div>
                <div className="mt-1 text-2xl font-bold text-white">{fmtMin(grandTotalOffline)}</div>
              </div>
              <div className={`rounded-2xl border px-4 py-3 ${grandRate != null ? `${offlineRateBg(grandRate)} border-neutral-700` : "border-neutral-800 bg-neutral-900/30"}`}>
                <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500">Avg Offline Rate</div>
                <div className={`mt-1 text-2xl font-bold ${offlineRateColor(grandRate)}`}>
                  {grandRate != null ? `${grandRate.toFixed(1)}%` : "—"}
                </div>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/30 px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500">Scheduled Open</div>
                <div className="mt-1 text-2xl font-bold text-neutral-200">{fmtMin(grandTotalScheduled)}</div>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/30 px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500">Days of Data</div>
                <div className="mt-1 text-2xl font-bold text-neutral-200">
                  {new Set(data.map((r) => r.sale_date)).size}
                </div>
              </div>
            </div>

            {/* Per-store breakdown */}
            <div className={`${GLASS_CARD} p-5`}>
              <h3 className={`${T_SECTION} mb-4`}>By Store</h3>
              <div className="space-y-4">
                {storeStats.map((s) => {
                  const barPct = (s.totalOffline / maxStoreOffline) * 100;
                  const rateLabel = s.rate != null ? `${s.rate.toFixed(1)}%` : "—";
                  return (
                    <div key={s.store}>
                      <div className="mb-1.5 flex items-center justify-between text-sm">
                        <span className="font-medium text-neutral-200">{s.store}</span>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-neutral-500">{s.days} day{s.days !== 1 ? "s" : ""}</span>
                          <span className="text-neutral-400">{fmtMin(s.totalOffline)} offline</span>
                          <span className={`rounded-md px-2 py-0.5 font-bold ${offlineRateColor(s.rate)} ${offlineRateBg(s.rate)}`}>
                            {rateLabel}
                          </span>
                        </div>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
                        <div className={`h-full rounded-full transition-all ${offlineBarColor(s.rate)}`} style={{ width: `${barPct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center gap-4 text-[10px] text-neutral-600">
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> ≤ 5%</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-500" /> 5–10%</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-500" /> &gt; 10%</span>
              </div>
            </div>

            {/* Daily trend chart */}
            {chartData.length > 1 && (
              <div className={`${GLASS_CARD} p-5`}>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className={T_SECTION}>Daily Offline Minutes</h3>
                  {/* Store filter */}
                  <div className="flex flex-wrap gap-1.5">
                    {allStores.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setStoreFilter(s)}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                          storeFilter === s
                            ? "bg-violet-600 text-white"
                            : "border border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} barCategoryGap="25%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                      <XAxis dataKey="date" stroke="#a3a3a3" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                      <YAxis stroke="#a3a3a3" tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip
                        formatter={(v: number, name: string) => [
                          fmtMin(v),
                          name === "offline_minutes" ? "Offline" : "Scheduled",
                        ]}
                      />
                      <Bar dataKey="scheduled_open_minutes" name="Scheduled" fill="#404040" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="offline_minutes" name="Offline" fill="#f97316" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Detail table */}
            <div className={`${GLASS_CARD} overflow-hidden`}>
              <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
                <h3 className={T_SECTION}>Detail</h3>
                <span className="text-xs text-neutral-500">{filteredRows.length} rows</span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-neutral-900/60">
                    <tr>
                      {["Date", "Store", "Service", "Offline", "Scheduled", "Rate"].map((h) => (
                        <th key={h} className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-neutral-500 ${h === "Offline" || h === "Scheduled" || h === "Rate" ? "text-right" : "text-left"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => (
                      <tr key={`${row.sale_date}-${row.store_name}-${row.grab_service}`} className="border-t border-neutral-800/60 hover:bg-neutral-800/20">
                        <td className="px-4 py-2.5 font-medium tabular-nums text-neutral-200">{row.sale_date}</td>
                        <td className="px-4 py-2.5 text-neutral-300">{row.store_name}</td>
                        <td className="px-4 py-2.5 text-neutral-400">{row.grab_service}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-neutral-300">{fmtMin(row.offline_minutes)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-neutral-400">{fmtMin(row.scheduled_open_minutes)}</td>
                        <td className="px-4 py-2.5 text-right">
                          {row.offline_rate_pct != null ? (
                            <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${offlineRateColor(row.offline_rate_pct)} ${offlineRateBg(row.offline_rate_pct)}`}>
                              {row.offline_rate_pct.toFixed(1)}%
                            </span>
                          ) : "—"}
                        </td>
                      </tr>
                    ))}
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
