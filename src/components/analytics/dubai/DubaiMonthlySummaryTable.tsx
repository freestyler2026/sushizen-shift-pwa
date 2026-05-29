"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";
import { Spinner } from "@/components/ui/Spinner";
import { AlertTriangle, CalendarDays, RefreshCw } from "lucide-react";
import { SECONDARY_BUTTON } from "@/lib/ui-tokens";

// Dubai-specific threshold: avg net revenue per order below this is a data quality signal.
// Correct months run ~75–85 AED/order; anything below 50 is likely incomplete or mis-mapped data.
const AVG_NET_ANOMALY_THRESHOLD = 50;

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
      res = await request();
      text = await res.text();
    }
  }
  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text);
      if (typeof j?.detail === "string") detail = j.detail;
    } catch { /* ignore */ }
    throw new Error(detail || `GET ${path} failed`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

type DailyRow = {
  work_date: string;
  net_revenue: number;
  gross_revenue: number;
  order_count_non_cancelled: number;
};

type DailyResp = { ok: boolean; items: DailyRow[] };

type MonthRow = {
  monthKey: string;
  label: string;
  net: number;
  gross: number;
  orders: number;
  days: number;
  avgNet: number;
  suspicious: boolean; // true when avg net/order looks like incomplete data
};

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function monthLabel(mk: string): string {
  const [y, m] = mk.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function lastCompleteMonthKey(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildFetchRange(): { from: string; to: string } {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  return {
    to: localIso(new Date(y, m, 0)),        // last day of previous month
    from: localIso(new Date(y, m - 12, 1)), // first day of 12 months ago
  };
}

function fmtNum(n: number): string {
  if (n === 0) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function pctChange(current: number, previous: number): string | null {
  if (previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

type Props = {
  approverName: string;
  pin: string;
  stepUpReady: boolean;
  branchCode?: string;
  brandName?: string;
};

export default function DubaiMonthlySummaryTable({
  approverName, pin, stepUpReady, branchCode = "", brandName = "",
}: Props) {
  const [rows, setRows] = useState<MonthRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fetchRange] = useState(() => buildFetchRange());

  const canLoad = !!approverName.trim() && !!pin.trim() && stepUpReady;

  const load = useCallback(async () => {
    if (!canLoad) return;
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({
        city: "dubai",
        date_from: fetchRange.from,
        date_to: fetchRange.to,
        branch_code: branchCode,
        brand_name: brandName,
        limit: "1000",
        approver_name: approverName.trim(),
        pin: pin.trim(),
      });
      const resp = await apiGet<DailyResp>(`/api/admin/pos/sales/daily?${qs.toString()}`);
      const items = resp.items || [];

      // Aggregate by YYYY-MM
      const map = new Map<string, { net: number; gross: number; orders: number; days: number }>();
      for (const row of items) {
        const mk = String(row.work_date || "").slice(0, 7);
        if (!mk || mk.length !== 7) continue;
        const cur = map.get(mk) ?? { net: 0, gross: 0, orders: 0, days: 0 };
        cur.net += Number(row.net_revenue || 0);
        cur.gross += Number(row.gross_revenue || 0);
        cur.orders += Number(row.order_count_non_cancelled || 0);
        cur.days += 1;
        map.set(mk, cur);
      }

      // Build rows — complete months only, newest first, max 12
      const lastMk = lastCompleteMonthKey();
      const monthRows: MonthRow[] = Array.from(map.entries())
        .filter(([mk]) => mk <= lastMk)
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, 12)
        .map(([mk, v]) => {
          const avgNet = v.orders > 0 ? v.net / v.orders : 0;
          return {
            monthKey: mk,
            label: monthLabel(mk),
            net: v.net,
            gross: v.gross,
            orders: v.orders,
            days: v.days,
            avgNet,
            // Flag: avg net/order below threshold with at least some orders present
            suspicious: v.orders > 0 && avgNet < AVG_NET_ANOMALY_THRESHOLD,
          };
        });

      setRows(monthRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load monthly history");
    } finally {
      setLoading(false);
    }
  }, [canLoad, approverName, pin, branchCode, brandName, fetchRange]);

  useEffect(() => { void load(); }, [load]);

  // Only use non-suspicious rows for bar scaling and averages
  const goodRows = useMemo(() => (rows || []).filter((r) => !r.suspicious), [rows]);
  const maxNet = useMemo(() => Math.max(...goodRows.map((r) => r.net), 1), [goodRows]);
  const suspiciousCount = useMemo(() => (rows || []).filter((r) => r.suspicious).length, [rows]);

  // Never return null — always render the section so it's visible in the DOM.
  // If auth isn't ready, show a waiting state instead of hiding entirely.

  return (
    <div className="mt-6 border-t border-white/8 pt-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-violet-400" />
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-neutral-300">
              Monthly History — Last 12 Complete Months
            </h4>
            <p className="mt-0.5 text-[11px] text-neutral-600">
              {fetchRange.from} → {fetchRange.to} · Dubai
              {branchCode ? ` · ${branchCode}` : ""}
              {brandName ? ` · ${brandName}` : ""}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className={SECONDARY_BUTTON + " flex items-center gap-1.5 text-xs"}
        >
          {loading ? <Spinner size="sm" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </button>
      </div>

      {!canLoad ? (
        <p className="text-sm text-neutral-500">Complete Security (MFA) and enter approver + PIN to load.</p>
      ) : loading && !rows ? (
        <div className="flex items-center justify-center gap-3 py-10 text-neutral-500">
          <Spinner size="md" />
          <span className="text-sm">Loading monthly data…</span>
        </div>
      ) : error ? (
        <p className="text-sm text-rose-400">{error}</p>
      ) : rows && rows.length === 0 ? (
        <p className="text-sm text-neutral-500">No data found for the past 12 months.</p>
      ) : rows ? (
        <>
          {/* Data quality warning banner */}
          {suspiciousCount > 0 && (
            <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-300/80">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
              <span>
                <span className="font-semibold text-amber-300">
                  {suspiciousCount} month{suspiciousCount > 1 ? "s" : ""} flagged
                </span>{" "}
                with avg net/order below {AVG_NET_ANOMALY_THRESHOLD} AED — likely incomplete revenue import in{" "}
                <code className="text-amber-200">pos_revenue_location_daily</code>. Flagged rows are grayed out and excluded from averages. Run{" "}
                <code className="text-amber-200">heroku pg:psql</code> to inspect or re-import those months.
              </span>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-white/8">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 bg-white/3">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-neutral-500">Month</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-neutral-500">Net Sales</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-neutral-500">MoM</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-neutral-500">Gross Rev</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-neutral-500">Orders</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-neutral-500">Avg Net/Order</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-neutral-500">Days</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-neutral-500">Bar</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const prevRow = rows[i + 1];
                  // Only show MoM when BOTH months have clean data
                  const mom = prevRow && !row.suspicious && !prevRow.suspicious
                    ? pctChange(row.net, prevRow.net)
                    : null;
                  const momPos = mom && mom.startsWith("+");
                  const momNeg = mom && mom.startsWith("-");
                  // Bar uses non-suspicious max so suspicious rows appear proportional to zero
                  const barPct = row.suspicious ? 0 : (maxNet > 0 ? (row.net / maxNet) * 100 : 0);

                  if (row.suspicious) {
                    // Grayed-out suspicious row
                    return (
                      <tr
                        key={row.monthKey}
                        className="border-b border-white/5 opacity-40"
                        title={`Avg net/order ${row.avgNet.toFixed(1)} AED — below ${AVG_NET_ANOMALY_THRESHOLD} AED threshold. Data likely incomplete.`}
                      >
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-1.5 font-medium text-neutral-500">
                            <AlertTriangle className="h-3 w-3 text-amber-500" />
                            {row.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-neutral-600">{fmtNum(row.net)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-[10px] text-amber-600/70">incomplete</span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-neutral-600">{fmtNum(row.gross)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-neutral-600">{fmtNum(row.orders)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-amber-600/70">
                          {row.avgNet > 0 ? row.avgNet.toLocaleString("en-US", { maximumFractionDigits: 1 }) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-neutral-600">{row.days}</td>
                        <td className="px-4 py-3 w-32">
                          <div className="h-1.5 w-full rounded-full bg-white/5" />
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr
                      key={row.monthKey}
                      className={`border-b border-white/5 transition-colors hover:bg-white/[0.03] ${i % 2 === 1 ? "bg-white/[0.015]" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium text-neutral-200">{row.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold tabular-nums text-white">{fmtNum(row.net)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {mom ? (
                          <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            momPos ? "bg-emerald-500/15 text-emerald-300" :
                            momNeg ? "bg-rose-500/15 text-rose-300" :
                            "bg-neutral-700/20 text-neutral-500"
                          }`}>
                            {momPos ? "↑" : momNeg ? "↓" : ""}{mom}
                          </span>
                        ) : (
                          <span className="text-neutral-700">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-emerald-400/80">{fmtNum(row.gross)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-neutral-300">{fmtNum(row.orders)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-violet-300/80">
                        {row.avgNet > 0 ? row.avgNet.toLocaleString("en-US", { maximumFractionDigits: 1 }) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-neutral-500">{row.days}</td>
                      <td className="px-4 py-3 w-32">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                          <div
                            className="h-full rounded-full bg-violet-500/60 transition-all"
                            style={{ width: `${barPct.toFixed(1)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Footer: averages excluding suspicious rows */}
              {goodRows.length > 1 && (
                <tfoot>
                  <tr className="border-t border-white/10 bg-white/[0.04]">
                    <td className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                      Avg / month{suspiciousCount > 0 ? <span className="ml-1 font-normal text-neutral-600">(excl. flagged)</span> : null}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-white">
                      {fmtNum(Math.round(goodRows.reduce((s, r) => s + r.net, 0) / goodRows.length))}
                    </td>
                    <td />
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-400/80">
                      {fmtNum(Math.round(goodRows.reduce((s, r) => s + r.gross, 0) / goodRows.length))}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-300">
                      {fmtNum(Math.round(goodRows.reduce((s, r) => s + r.orders, 0) / goodRows.length))}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-violet-300/80">
                      {(() => {
                        const totalOrders = goodRows.reduce((s, r) => s + r.orders, 0);
                        const totalNet = goodRows.reduce((s, r) => s + r.net, 0);
                        return totalOrders > 0
                          ? (totalNet / totalOrders).toLocaleString("en-US", { maximumFractionDigits: 1 })
                          : "—";
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-500">
                      {Math.round(goodRows.reduce((s, r) => s + r.days, 0) / goodRows.length)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
