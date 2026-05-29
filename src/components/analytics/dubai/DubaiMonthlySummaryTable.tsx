"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAuth, getAuthHeaders, refreshAuthFromApi } from "@/lib/auth";
import { Spinner } from "@/components/ui/Spinner";
import { CalendarDays, RefreshCw } from "lucide-react";
import { SECONDARY_BUTTON } from "@/lib/ui-tokens";

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
  monthKey: string;   // "YYYY-MM"
  label: string;      // "Apr 2026"
  net: number;
  gross: number;
  orders: number;
  days: number;
  avgNet: number;
};

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function monthLabel(mk: string): string {
  const [y, m] = mk.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** Returns the last complete month key (previous calendar month). */
function lastCompleteMonthKey(): string {
  const d = new Date();
  d.setDate(1);            // go to 1st of current month
  d.setMonth(d.getMonth() - 1);  // previous month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Returns date range covering the 12 complete months ending at lastCompleteMonthKey. */
function buildFetchRange(): { from: string; to: string } {
  const d = new Date();
  // End = last day of previous month
  const endD = new Date(d.getFullYear(), d.getMonth(), 0);
  const to = endD.toISOString().slice(0, 10);
  // Start = first day of (current month - 12 months)
  const startD = new Date(d.getFullYear(), d.getMonth() - 12, 1);
  const from = startD.toISOString().slice(0, 10);
  return { from, to };
}

function fmtNum(n: number): string {
  if (n === 0) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function pctChange(current: number, previous: number): string | null {
  if (previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

type Props = {
  approverName: string;
  pin: string;
  stepUpReady: boolean;
  branchCode?: string;
  brandName?: string;
};

export default function DubaiMonthlySummaryTable({ approverName, pin, stepUpReady, branchCode = "", brandName = "" }: Props) {
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
        limit: "2000",
        approver_name: approverName.trim(),
        pin: pin.trim(),
      });
      const resp = await apiGet<DailyResp>(`/api/admin/pos/sales/daily?${qs.toString()}`);
      const items = resp.items || [];

      // Aggregate by month
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

      // Build sorted rows (newest first), only complete months
      const lastMk = lastCompleteMonthKey();
      const monthRows: MonthRow[] = Array.from(map.entries())
        .filter(([mk]) => mk <= lastMk)
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, 12)
        .map(([mk, v]) => ({
          monthKey: mk,
          label: monthLabel(mk),
          net: v.net,
          gross: v.gross,
          orders: v.orders,
          days: v.days,
          avgNet: v.orders > 0 ? v.net / v.orders : 0,
        }));

      setRows(monthRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load monthly history");
    } finally {
      setLoading(false);
    }
  }, [canLoad, approverName, pin, branchCode, brandName, fetchRange]);

  useEffect(() => { void load(); }, [load]);

  const maxNet = useMemo(() => Math.max(...(rows || []).map((r) => r.net), 1), [rows]);

  if (!canLoad) return null;

  return (
    <div className="mt-6 border-t border-white/8 pt-6">
      {/* Section header */}
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

      {loading && !rows ? (
        <div className="flex items-center justify-center gap-3 py-10 text-neutral-500">
          <Spinner size="md" />
          <span className="text-sm">Loading monthly data…</span>
        </div>
      ) : error ? (
        <p className="text-sm text-rose-400">{error}</p>
      ) : rows && rows.length === 0 ? (
        <p className="text-sm text-neutral-500">No data found for the past 12 months.</p>
      ) : rows ? (
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
                const mom = prevRow ? pctChange(row.net, prevRow.net) : null;
                const momPos = mom && mom.startsWith("+");
                const momNeg = mom && mom.startsWith("-");
                const barPct = maxNet > 0 ? (row.net / maxNet) * 100 : 0;
                return (
                  <tr
                    key={row.monthKey}
                    className={`border-b border-white/5 transition-colors hover:bg-white/[0.03] ${i % 2 === 1 ? "bg-white/[0.015]" : ""}`}
                  >
                    {/* Month */}
                    <td className="px-4 py-3">
                      <span className="font-medium text-neutral-200">{row.label}</span>
                    </td>
                    {/* Net Sales */}
                    <td className="px-4 py-3 text-right">
                      <span className="font-semibold tabular-nums text-white">{fmtNum(row.net)}</span>
                    </td>
                    {/* MoM */}
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
                    {/* Gross Revenue */}
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-400/80">
                      {fmtNum(row.gross)}
                    </td>
                    {/* Orders */}
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-300">
                      {fmtNum(row.orders)}
                    </td>
                    {/* Avg Net / Order */}
                    <td className="px-4 py-3 text-right tabular-nums text-violet-300/80">
                      {row.avgNet > 0 ? row.avgNet.toLocaleString("en-US", { maximumFractionDigits: 1 }) : "—"}
                    </td>
                    {/* Days */}
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-500">
                      {row.days}
                    </td>
                    {/* Bar */}
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
            {rows.length > 1 && (
              <tfoot>
                <tr className="border-t border-white/10 bg-white/[0.04]">
                  <td className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                    Avg / month
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-white">
                    {fmtNum(Math.round(rows.reduce((s, r) => s + r.net, 0) / rows.length))}
                  </td>
                  <td />
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-400/80">
                    {fmtNum(Math.round(rows.reduce((s, r) => s + r.gross, 0) / rows.length))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-300">
                    {fmtNum(Math.round(rows.reduce((s, r) => s + r.orders, 0) / rows.length))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-violet-300/80">
                    {(() => {
                      const totalOrders = rows.reduce((s, r) => s + r.orders, 0);
                      const totalNet = rows.reduce((s, r) => s + r.net, 0);
                      return totalOrders > 0 ? (totalNet / totalOrders).toLocaleString("en-US", { maximumFractionDigits: 1 }) : "—";
                    })()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-500">
                    {Math.round(rows.reduce((s, r) => s + r.days, 0) / rows.length)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      ) : null}
    </div>
  );
}
