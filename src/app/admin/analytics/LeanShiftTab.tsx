"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  AlertTriangle,
  TrendingDown,
  Download,
  Building2,
  RefreshCw,
  Info,
} from "lucide-react";
import { apiGet, qs } from "@/lib/api";
import DateRangePicker from "@/components/DateRangePicker";
import {
  GLASS_CARD,
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
  TABLE_HEADER,
  TABLE_CELL,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  INPUT_CLASS,
} from "@/lib/ui-tokens";
import { Spinner } from "@/components/ui/Spinner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type LeanShiftRow = {
  branch_code: string;
  dow: number;
  day_name: string;
  shift_count: number;
  avg_checkout_hour: number;
  avg_checkin_hour: number;
  lean_start_hour: number;
  avg_hours_worked: number;
  avg_ot_minutes: number;
  avg_scheduled_hours: number;
  reducible_ot_per_shift: number;
};

type LeanShiftSummary = {
  total_reducible_ot_minutes: number;
  branches_with_builtin_ot: number;
  total_branches: number;
};

type LeanShiftData = {
  ok: boolean;
  rows: LeanShiftRow[];
  summary: LeanShiftSummary;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtHour(h: number): string {
  if (!isFinite(h) || h < 0) return "-";
  const hh = Math.floor(h) % 24;
  const mm = Math.round((h - Math.floor(h)) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function fmtMins(mins: number): string {
  if (!isFinite(mins) || mins <= 0) return "-";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function fmtHoursDecimal(h: number): string {
  if (!isFinite(h)) return "-";
  return `${h.toFixed(1)}h`;
}

const DOW_ORDER = [0, 1, 2, 3, 4, 5, 6]; // Sun=0 … Sat=6

// ---------------------------------------------------------------------------
// OT Budget Warning state (per-branch threshold in minutes/week)
// ---------------------------------------------------------------------------
const DEFAULT_BUDGET_MINS = 120; // 2h/week default

// ---------------------------------------------------------------------------
// CSV Export
// ---------------------------------------------------------------------------
function exportCsv(rows: LeanShiftRow[], dateFrom: string, dateTo: string, city: string) {
  const headers = [
    "Branch",
    "Day",
    "Shifts",
    "Avg Checkout",
    "Lean Start (Checkout-9h)",
    "Avg Check-in (Current)",
    "Avg Hours Worked",
    "Avg OT (min)",
    "Reducible OT/Shift (min)",
    "Reducible OT/Shift (h)",
  ];
  const csvRows = rows.map((r) => [
    r.branch_code,
    r.day_name,
    r.shift_count,
    fmtHour(r.avg_checkout_hour),
    fmtHour(r.lean_start_hour),
    fmtHour(r.avg_checkin_hour),
    r.avg_hours_worked.toFixed(2),
    r.avg_ot_minutes.toFixed(1),
    r.reducible_ot_per_shift.toFixed(1),
    (r.reducible_ot_per_shift / 60).toFixed(2),
  ]);

  const lines = [
    `# Lean Shift Report | ${city.toUpperCase()} | ${dateFrom} to ${dateTo}`,
    `# Formula: Lean Start = Avg Checkout - 9h | Reducible OT = MAX(0, Lean Start - Avg Check-in) × 60`,
    headers.join(","),
    ...csvRows.map((row) => row.join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lean_shift_${city}_${dateFrom}_${dateTo}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
type Props = {
  city: string;
  dateFrom: string;
  dateTo: string;
  approverName: string;
  pin: string;
};

export default function LeanShiftTab({ city, dateFrom: initDateFrom, dateTo: initDateTo, approverName, pin }: Props) {
  const [dateFrom, setDateFrom] = useState(initDateFrom);
  const [dateTo, setDateTo] = useState(initDateTo);
  const [data, setData] = useState<LeanShiftData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ② OT Budget Warning — global threshold (minutes per week)
  const [budgetMins, setBudgetMins] = useState<number>(DEFAULT_BUDGET_MINS);

  // Selected branch filter
  const [filterBranch, setFilterBranch] = useState("all");

  const load = useCallback(async () => {
    if (!city || !dateFrom || !dateTo) return;
    setLoading(true);
    setError("");
    try {
      const result = await apiGet<LeanShiftData>(
        `/api/admin/analytics/lean_shift/by_branch${qs({
          city,
          date_from: dateFrom,
          date_to: dateTo,
          approver_name: approverName,
          pin,
        })}`
      );
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load lean shift data");
    } finally {
      setLoading(false);
    }
  }, [city, dateFrom, dateTo, approverName, pin]);

  useEffect(() => {
    void load();
  }, [load]);

  // Branches list for filter
  const branches = useMemo(() => {
    if (!data?.rows) return [];
    return Array.from(new Set(data.rows.map((r) => r.branch_code))).sort();
  }, [data]);

  // Filtered + sorted rows
  const rows = useMemo(() => {
    if (!data?.rows) return [];
    const filtered = filterBranch === "all" ? data.rows : data.rows.filter((r) => r.branch_code === filterBranch);
    return [...filtered].sort((a, b) => {
      const bc = a.branch_code.localeCompare(b.branch_code);
      if (bc !== 0) return bc;
      return DOW_ORDER.indexOf(a.dow) - DOW_ORDER.indexOf(b.dow);
    });
  }, [data, filterBranch]);

  // ② Per-branch weekly reducible OT (sum across all days × shift_count)
  const branchWeeklyOt = useMemo(() => {
    if (!data?.rows) return {} as Record<string, number>;
    const map: Record<string, number> = {};
    for (const r of data.rows) {
      map[r.branch_code] = (map[r.branch_code] ?? 0) + r.reducible_ot_per_shift * r.shift_count;
    }
    return map;
  }, [data]);

  const budgetWarningBranches = useMemo(() => {
    return Object.entries(branchWeeklyOt)
      .filter(([, mins]) => mins > budgetMins)
      .map(([branch]) => branch);
  }, [branchWeeklyOt, budgetMins]);

  const summary = data?.summary;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-amber-400" />
            Lean Shift Calculator
          </h2>
          <p className="mt-0.5 text-xs text-zinc-400">
            Lean Start = Avg Checkout − 9h &nbsp;|&nbsp; Reducible OT = MAX(0, Lean Start − Avg Check-in) × 60
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`${SECONDARY_BUTTON} flex items-center gap-1.5 text-xs`}
            onClick={load}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          {data?.rows?.length ? (
            <button
              type="button"
              className={`${PRIMARY_BUTTON} flex items-center gap-1.5 text-xs`}
              onClick={() => exportCsv(data.rows, dateFrom, dateTo, city)}
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          ) : null}
        </div>
      </div>

      {/* Date range picker */}
      <div className={`${GLASS_CARD} p-4`}>
        <div className="flex flex-wrap items-end gap-4">
          <DateRangePicker
            value={{ from: dateFrom, to: dateTo }}
            onChange={(r) => {
              setDateFrom(r.from);
              setDateTo(r.to);
            }}
          />
          {/* Branch filter */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Branch</span>
            <select
              value={filterBranch}
              onChange={(e) => setFilterBranch(e.target.value)}
              className="h-8 rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-white"
            >
              <option value="all">All branches</option>
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          {/* ② OT Budget threshold */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              OT Budget / Branch / Week (min)
            </span>
            <input
              type="number"
              min={0}
              step={15}
              value={budgetMins}
              onChange={(e) => setBudgetMins(Number(e.target.value))}
              className={`h-8 w-24 ${INPUT_CLASS}`}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}

      {!loading && data && (
        <>
          {/* ① KPI Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className={KPI_CARD}>
              <p className={KPI_LABEL}>Total Reducible OT</p>
              <p className={`${KPI_VALUE} text-amber-400`}>
                {fmtMins(summary?.total_reducible_ot_minutes ?? 0)}
              </p>
              <p className="mt-1 text-[10px] text-zinc-500">across all branches × shifts in period</p>
            </div>
            <div className={KPI_CARD}>
              <p className={KPI_LABEL}>Branches with Built-in OT</p>
              <p className={`${KPI_VALUE} ${(summary?.branches_with_builtin_ot ?? 0) > 0 ? "text-red-400" : "text-emerald-400"}`}>
                {summary?.branches_with_builtin_ot ?? 0} / {summary?.total_branches ?? 0}
              </p>
              <p className="mt-1 text-[10px] text-zinc-500">where lean start is later than avg check-in</p>
            </div>
            <div className={KPI_CARD}>
              <p className={KPI_LABEL}>Avg Reducible OT / Shift</p>
              <p className={`${KPI_VALUE} text-orange-400`}>
                {rows.length > 0
                  ? fmtMins(rows.reduce((s, r) => s + r.reducible_ot_per_shift, 0) / rows.length)
                  : "-"}
              </p>
              <p className="mt-1 text-[10px] text-zinc-500">across filtered rows</p>
            </div>
          </div>

          {/* ② OT Budget Warning banner */}
          {budgetWarningBranches.length > 0 && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
                <div>
                  <p className="text-sm font-semibold text-red-300">OT Budget Exceeded</p>
                  <p className="mt-0.5 text-xs text-red-200/80">
                    The following branches exceed the {fmtMins(budgetMins)}/week reducible OT budget:
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {budgetWarningBranches.map((b) => (
                      <span
                        key={b}
                        className="rounded-full border border-red-500/30 bg-red-500/20 px-2.5 py-0.5 text-xs font-semibold text-red-300"
                      >
                        {b} — {fmtMins(branchWeeklyOt[b] ?? 0)} reducible OT
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Formula explainer */}
          <div className={`${GLASS_CARD} flex items-start gap-2 p-3`}>
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-sky-400" />
            <p className="text-[11px] text-zinc-400">
              <span className="font-semibold text-sky-300">How to read this table:</span> &ldquo;Lean Start&rdquo; is
              when staff <em>should</em> clock in if checkout time stays the same and total work is exactly
              9 hours. &ldquo;Reducible OT / Shift&rdquo; shows the minutes saved per shift by shifting the start time
              forward to the lean start time. Zero means no built-in OT for that day/branch.
            </p>
          </div>

          {/* ① Main Table */}
          {rows.length === 0 ? (
            <div className={`${GLASS_CARD} py-10 text-center text-sm text-zinc-500`}>
              No attendance data found for the selected period and filters.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#141428]">
              <table className="min-w-full border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-[#1a1a2e]">
                  <tr>
                    <th className={TABLE_HEADER}>Branch</th>
                    <th className={TABLE_HEADER}>Day</th>
                    <th className={TABLE_HEADER}>Shifts</th>
                    <th className={TABLE_HEADER}>Avg Checkout</th>
                    <th className={TABLE_HEADER}>Lean Start</th>
                    <th className={TABLE_HEADER}>Avg Check-in (Now)</th>
                    <th className={TABLE_HEADER}>Avg Hours</th>
                    <th className={TABLE_HEADER}>Avg OT</th>
                    <th className={`${TABLE_HEADER} text-amber-400`}>Reducible OT / Shift</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const hasBuiltinOt = row.reducible_ot_per_shift > 0;
                    return (
                      <tr
                        key={`${row.branch_code}-${row.dow}`}
                        className={
                          (i % 2 === 0 ? "bg-white/[0.02]" : "") +
                          (hasBuiltinOt ? " border-l-2 border-l-amber-500/60" : "")
                        }
                      >
                        <td className={`${TABLE_CELL} font-medium text-white`}>
                          <div className="flex items-center gap-1.5">
                            <Building2 className="h-3 w-3 flex-shrink-0 text-zinc-500" />
                            {row.branch_code}
                          </div>
                        </td>
                        <td className={`${TABLE_CELL} text-zinc-300`}>{row.day_name}</td>
                        <td className={`${TABLE_CELL} tabular-nums text-zinc-400`}>{row.shift_count}</td>
                        <td className={`${TABLE_CELL} tabular-nums text-zinc-200`}>{fmtHour(row.avg_checkout_hour)}</td>
                        <td className={`${TABLE_CELL} tabular-nums font-semibold text-sky-300`}>
                          {fmtHour(row.lean_start_hour)}
                        </td>
                        <td className={`${TABLE_CELL} tabular-nums ${hasBuiltinOt ? "text-amber-300" : "text-zinc-200"}`}>
                          {fmtHour(row.avg_checkin_hour)}
                        </td>
                        <td className={`${TABLE_CELL} tabular-nums text-zinc-400`}>
                          {fmtHoursDecimal(row.avg_hours_worked)}
                        </td>
                        <td className={`${TABLE_CELL} tabular-nums text-zinc-400`}>
                          {row.avg_ot_minutes > 0 ? fmtMins(row.avg_ot_minutes) : "-"}
                        </td>
                        <td className={`${TABLE_CELL} tabular-nums font-semibold ${hasBuiltinOt ? "text-amber-400" : "text-zinc-600"}`}>
                          {hasBuiltinOt ? fmtMins(row.reducible_ot_per_shift) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Per-branch weekly summary (grouped) */}
          {branches.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Weekly Reducible OT by Branch
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {branches.map((b) => {
                  const weeklyOt = branchWeeklyOt[b] ?? 0;
                  const overBudget = weeklyOt > budgetMins;
                  return (
                    <div
                      key={b}
                      className={`rounded-xl border p-3 ${
                        overBudget
                          ? "border-red-500/30 bg-red-500/10"
                          : weeklyOt > 0
                          ? "border-amber-500/20 bg-amber-500/5"
                          : "border-white/8 bg-white/[0.03]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-[11px] font-semibold text-white">{b}</p>
                        {overBudget && (
                          <AlertTriangle className="h-3 w-3 flex-shrink-0 text-red-400" />
                        )}
                      </div>
                      <p className={`mt-1 text-sm font-bold tabular-nums ${overBudget ? "text-red-400" : weeklyOt > 0 ? "text-amber-400" : "text-zinc-500"}`}>
                        {weeklyOt > 0 ? fmtMins(weeklyOt) : "—"}
                      </p>
                      <p className="mt-0.5 text-[10px] text-zinc-600">reducible / period</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
