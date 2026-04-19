"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  TrendingDown,
  Download,
  Building2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";
import { apiGet, qs } from "@/lib/api";
import DateRangePicker from "@/components/DateRangePicker";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  INPUT_CLASS,
  TABLE_HEADER,
  TABLE_CELL,
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
  if (!isFinite(h) || h < 0) return "—";
  const hh = Math.floor(h) % 24;
  const mm = Math.round((h - Math.floor(h)) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function fmtMins(mins: number): string {
  if (!isFinite(mins) || mins <= 0) return "—";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

// ---------------------------------------------------------------------------
// Shift Timeline Bar
// Visualises: [===RED: early start===][===BLUE: lean 9h===]
//             ↑ Avg Check-in          ↑ Lean Start         ↑ Avg Checkout
// ---------------------------------------------------------------------------
function ShiftTimeline({ checkin, leanStart, checkout }: {
  checkin: number;
  leanStart: number;
  checkout: number;
}) {
  const validCheckout = isFinite(checkout) && checkout > 0;
  const validCheckin  = isFinite(checkin) && checkin >= 0;
  if (!validCheckout || !validCheckin) return null;

  // Hours the shift actually spans
  const totalH = checkout - checkin;
  if (totalH <= 0) return null;

  // "Wasted" portion = checkin → lean_start (if lean_start > checkin)
  const wastedH = Math.max(0, leanStart - checkin);
  const leanH   = Math.max(0, checkout - Math.max(leanStart, checkin));
  const wastedPct = (wastedH / totalH) * 100;
  const leanPct   = (leanH   / totalH) * 100;

  return (
    <div className="w-full">
      {/* Bar */}
      <div className="flex h-5 w-full overflow-hidden rounded-full border border-white/10">
        {wastedPct > 0.5 && (
          <div
            className="flex h-full items-center justify-center bg-red-500/50"
            style={{ width: `${wastedPct}%` }}
            title={`Reducible: ${fmtMins(wastedH * 60)}`}
          >
            {wastedPct > 12 && (
              <span className="text-[9px] font-bold text-red-200">
                -{Math.round(wastedH * 60)}m
              </span>
            )}
          </div>
        )}
        <div
          className="flex h-full items-center justify-center bg-sky-500/40"
          style={{ width: `${leanPct}%` }}
        >
          {leanPct > 20 && (
            <span className="text-[9px] font-semibold text-sky-200">9h lean</span>
          )}
        </div>
      </div>
      {/* Time labels */}
      <div className="mt-0.5 flex justify-between text-[9px] text-zinc-500">
        <span className={wastedH > 0 ? "text-amber-400/80" : "text-zinc-500"}>
          ↑ {fmtHour(checkin)}
        </span>
        {wastedH > 0.08 && (
          <span className="text-sky-400">↑ {fmtHour(leanStart)} lean</span>
        )}
        <span className="text-zinc-400">↑ {fmtHour(checkout)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day-of-week mini grid  (Sun–Sat coloured by OT level)
// ---------------------------------------------------------------------------
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function DowGrid({ rows }: { rows: LeanShiftRow[] }) {
  const byDow = new Map(rows.map((r) => [r.dow, r]));
  return (
    <div className="flex gap-1">
      {[0, 1, 2, 3, 4, 5, 6].map((dow) => {
        const row = byDow.get(dow);
        const ot  = row?.reducible_ot_per_shift ?? -1;
        const colorCls =
          ot < 0   ? "bg-white/5 text-zinc-600" :
          ot === 0 ? "bg-emerald-500/20 text-emerald-300" :
          ot < 30  ? "bg-amber-500/25 text-amber-300" :
                     "bg-red-500/25 text-red-300";
        return (
          <div key={dow} className="flex flex-col items-center gap-0.5">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-lg text-[9px] font-bold ${colorCls}`}
              title={row ? `${DAY_LABELS[dow]}: reducible ${fmtMins(ot)} / shift` : `${DAY_LABELS[dow]}: no data`}
            >
              {ot > 0 ? `${Math.round(ot)}m` : ot === 0 ? "✓" : "—"}
            </div>
            <span className="text-[8px] text-zinc-600">{DAY_LABELS[dow]}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Branch Card
// ---------------------------------------------------------------------------
function BranchCard({
  branch,
  rows,
  budgetMins,
}: {
  branch: string;
  rows: LeanShiftRow[];
  budgetMins: number;
}) {
  const [expanded, setExpanded] = useState(false);

  // Branch-level aggregates (weighted average across days with OT)
  const totalReducibleOt = rows.reduce(
    (s, r) => s + r.reducible_ot_per_shift * r.shift_count, 0
  );
  const otRows  = rows.filter((r) => r.reducible_ot_per_shift > 0);
  const allRows = rows;

  // For the timeline: use the weekly average weighted by shift_count
  const totalShifts     = allRows.reduce((s, r) => s + r.shift_count, 0);
  const wavgCheckin     = totalShifts > 0
    ? allRows.reduce((s, r) => s + r.avg_checkin_hour * r.shift_count, 0) / totalShifts : 0;
  const wavgCheckout    = totalShifts > 0
    ? allRows.reduce((s, r) => s + r.avg_checkout_hour * r.shift_count, 0) / totalShifts : 0;
  const wavgLeanStart   = wavgCheckout - 9;

  // Worst day
  const worstRow = otRows.length > 0
    ? otRows.reduce((a, b) => a.reducible_ot_per_shift > b.reducible_ot_per_shift ? a : b)
    : null;

  const overBudget  = totalReducibleOt > budgetMins;
  const hasBuiltinOt = totalReducibleOt > 0;

  const statusBadge = overBudget
    ? { cls: "bg-red-500/20 border-red-500/40 text-red-300",   icon: "🔴", text: "OT予算超過" }
    : hasBuiltinOt
    ? { cls: "bg-amber-500/20 border-amber-500/40 text-amber-300", icon: "⚠️", text: "削減余地あり" }
    : { cls: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300", icon: "✅", text: "問題なし" };

  const borderCls = overBudget
    ? "border-red-500/30 hover:border-red-500/50"
    : hasBuiltinOt
    ? "border-amber-500/25 hover:border-amber-500/40"
    : "border-white/10 hover:border-white/20";

  return (
    <div className={`rounded-2xl border bg-white/[0.03] transition-all duration-200 ${borderCls}`}>
      {/* Card header */}
      <div className="p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 flex-shrink-0 text-zinc-400" />
            <span className="text-sm font-semibold text-white">{branch}</span>
          </div>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusBadge.cls}`}>
            {statusBadge.icon} {statusBadge.text}
          </span>
        </div>

        {/* Shift timeline bar */}
        {wavgCheckout > 0 && (
          <div className="mb-3">
            <ShiftTimeline
              checkin={wavgCheckin}
              leanStart={wavgLeanStart}
              checkout={wavgCheckout}
            />
          </div>
        )}

        {/* Key numbers */}
        <div className="mb-3 flex flex-wrap items-start gap-4">
          {hasBuiltinOt ? (
            <>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">削減可能OT合計</p>
                <p className={`text-xl font-bold tabular-nums ${overBudget ? "text-red-400" : "text-amber-400"}`}>
                  {fmtMins(totalReducibleOt)}
                </p>
                <p className="text-[10px] text-zinc-600">対象期間内 全シフト合計</p>
              </div>
              {worstRow && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">最もOTが多い日</p>
                  <p className="text-base font-bold text-white">{worstRow.day_name}</p>
                  <p className="text-[10px] text-zinc-500">{fmtMins(worstRow.reducible_ot_per_shift)} / シフト</p>
                </div>
              )}
              <div>
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">推奨スタート時刻</p>
                <p className="text-base font-bold text-sky-300">{fmtHour(wavgLeanStart)}</p>
                <p className="text-[10px] text-zinc-500">現在: {fmtHour(wavgCheckin)}</p>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <p className="text-sm text-emerald-300">
                スタート時刻は最適 — 削減可能なOTはありません
              </p>
            </div>
          )}
        </div>

        {/* Action proposal box */}
        {hasBuiltinOt && worstRow && (
          <div className="mb-3 rounded-xl border border-sky-500/20 bg-sky-500/8 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-400">📋 改善提案</p>
            <p className="mt-1 text-xs text-zinc-200">
              <span className="font-semibold text-white">{branch}</span> のシフト開始時刻を
              {worstRow ? ` ${worstRow.day_name}` : ""}を中心に{" "}
              <span className="font-semibold text-amber-300">{fmtHour(wavgCheckin)}</span> →{" "}
              <span className="font-semibold text-sky-300">{fmtHour(wavgLeanStart)}</span> に変更することで、
              週間約 <span className="font-bold text-emerald-300">{fmtMins(totalReducibleOt)}</span> の
              不要OTを解消できます。
            </p>
          </div>
        )}

        {/* DOW grid */}
        <DowGrid rows={rows} />

        {/* Expand toggle */}
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-3 flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300"
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {expanded ? "詳細を隠す" : "曜日別データを表示"}
        </button>
      </div>

      {/* Expanded detail table */}
      {expanded && (
        <div className="border-t border-white/8 overflow-x-auto">
          <table className="min-w-full border-collapse text-xs">
            <thead className="bg-white/[0.03]">
              <tr>
                <th className={TABLE_HEADER}>曜日</th>
                <th className={TABLE_HEADER}>シフト数</th>
                <th className={TABLE_HEADER}>平均退勤</th>
                <th className={TABLE_HEADER}>推奨出勤 (Lean)</th>
                <th className={TABLE_HEADER}>現在の出勤</th>
                <th className={TABLE_HEADER}>平均実働</th>
                <th className={TABLE_HEADER}>削減可能OT/シフト</th>
              </tr>
            </thead>
            <tbody>
              {[...rows]
                .sort((a, b) => a.dow - b.dow)
                .map((row) => {
                  const hasOt = row.reducible_ot_per_shift > 0;
                  return (
                    <tr
                      key={row.dow}
                      className={hasOt ? "bg-amber-500/5" : ""}
                    >
                      <td className={`${TABLE_CELL} font-medium text-zinc-200`}>{row.day_name}</td>
                      <td className={`${TABLE_CELL} tabular-nums text-zinc-400`}>{row.shift_count}</td>
                      <td className={`${TABLE_CELL} tabular-nums text-zinc-300`}>{fmtHour(row.avg_checkout_hour)}</td>
                      <td className={`${TABLE_CELL} tabular-nums font-semibold text-sky-300`}>
                        {row.lean_start_hour >= 0 ? fmtHour(row.lean_start_hour) : "—"}
                      </td>
                      <td className={`${TABLE_CELL} tabular-nums ${hasOt ? "text-amber-300" : "text-zinc-300"}`}>
                        {fmtHour(row.avg_checkin_hour)}
                      </td>
                      <td className={`${TABLE_CELL} tabular-nums text-zinc-400`}>
                        {row.avg_hours_worked.toFixed(1)}h
                      </td>
                      <td className={`${TABLE_CELL} tabular-nums font-bold ${hasOt ? "text-amber-400" : "text-zinc-600"}`}>
                        {hasOt ? fmtMins(row.reducible_ot_per_shift) : "—"}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CSV Export
// ---------------------------------------------------------------------------
function exportCsv(rows: LeanShiftRow[], dateFrom: string, dateTo: string, city: string) {
  const headers = [
    "Branch", "Day", "Shifts", "Avg Checkout", "Lean Start",
    "Avg Check-in (Now)", "Avg Hours", "Avg OT (min)", "Reducible OT/Shift (min)",
  ];
  const csvRows = rows.map((r) => [
    r.branch_code, r.day_name, r.shift_count,
    fmtHour(r.avg_checkout_hour), fmtHour(r.lean_start_hour),
    fmtHour(r.avg_checkin_hour), r.avg_hours_worked.toFixed(2),
    r.avg_ot_minutes.toFixed(1), r.reducible_ot_per_shift.toFixed(1),
  ]);
  const lines = [
    `# Lean Shift Report | ${city.toUpperCase()} | ${dateFrom} to ${dateTo}`,
    `# Formula: Lean Start = Avg Checkout - 9h | Reducible OT = MAX(0, Lean Start - Avg Check-in) x 60`,
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
// Main component
// ---------------------------------------------------------------------------
type Props = {
  city: string;
  dateFrom: string;
  dateTo: string;
  approverName: string;
  pin: string;
};

export default function LeanShiftTab({
  city,
  dateFrom: initDateFrom,
  dateTo: initDateTo,
  approverName,
  pin,
}: Props) {
  const [dateFrom, setDateFrom]   = useState(initDateFrom);
  const [dateTo,   setDateTo]     = useState(initDateTo);
  const [data,     setData]       = useState<LeanShiftData | null>(null);
  const [loading,  setLoading]    = useState(false);
  const [error,    setError]      = useState("");
  const [budgetMins, setBudgetMins] = useState<number>(120);
  const [sortBy, setSortBy]       = useState<"ot_desc" | "name">("ot_desc");

  const load = useCallback(async () => {
    if (!city || !dateFrom || !dateTo) return;
    setLoading(true);
    setError("");
    try {
      const result = await apiGet<LeanShiftData>(
        `/api/admin/analytics/lean_shift/by_branch${qs({
          city, date_from: dateFrom, date_to: dateTo,
          approver_name: approverName, pin,
        })}`
      );
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [city, dateFrom, dateTo, approverName, pin]);

  useEffect(() => { void load(); }, [load]);

  // Group rows by branch
  const branchGroups = useMemo(() => {
    if (!data?.rows) return [];
    const map = new Map<string, LeanShiftRow[]>();
    for (const r of data.rows) {
      if (!map.has(r.branch_code)) map.set(r.branch_code, []);
      map.get(r.branch_code)!.push(r);
    }
    // Compute total reducible OT per branch for sorting
    const entries = Array.from(map.entries()).map(([branch, rows]) => ({
      branch,
      rows,
      totalOt: rows.reduce((s, r) => s + r.reducible_ot_per_shift * r.shift_count, 0),
    }));
    if (sortBy === "ot_desc") entries.sort((a, b) => b.totalOt - a.totalOt);
    else entries.sort((a, b) => a.branch.localeCompare(b.branch));
    return entries;
  }, [data, sortBy]);

  const summary = data?.summary;
  const totalReducible = summary?.total_reducible_ot_minutes ?? 0;
  const branchesWithOt = summary?.branches_with_builtin_ot ?? 0;

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-white">
            <TrendingDown className="h-4 w-4 text-amber-400" />
            Lean Shift Calculator
          </h2>
          <p className="mt-0.5 text-xs text-zinc-400">
            不要なOTを含むシフトを検出し、最適な出勤時刻を提案します
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className={`${SECONDARY_BUTTON} flex items-center gap-1.5 text-xs`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            更新
          </button>
          {data?.rows?.length ? (
            <button
              type="button"
              onClick={() => exportCsv(data.rows, dateFrom, dateTo, city)}
              className={`${PRIMARY_BUTTON} flex items-center gap-1.5 text-xs`}
            >
              <Download className="h-3.5 w-3.5" />
              CSV出力
            </button>
          ) : null}
        </div>
      </div>

      {/* Filters */}
      <div className={`${GLASS_CARD} p-4`}>
        <div className="flex flex-wrap items-end gap-5">
          <DateRangePicker
            value={{ from: dateFrom, to: dateTo }}
            onChange={(r) => { setDateFrom(r.from); setDateTo(r.to); }}
          />
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              OT予算 / ブランチ / 期間 (分)
            </span>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                step={30}
                value={budgetMins}
                onChange={(e) => setBudgetMins(Number(e.target.value))}
                className={`h-8 w-24 ${INPUT_CLASS}`}
              />
              <span className="text-[10px] text-zinc-500">= {Math.round(budgetMins / 60)}h/期間</span>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">並び順</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "ot_desc" | "name")}
              className="h-8 rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-white"
            >
              <option value="ot_desc">削減OT多い順</option>
              <option value="name">ブランチ名順</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      )}

      {!loading && data && (
        <>
          {/* Summary strip */}
          <div className="grid grid-cols-3 gap-3">
            <div className={`${GLASS_CARD} p-3 text-center`}>
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">削減可能OT合計</p>
              <p className={`mt-1 text-2xl font-bold tabular-nums ${totalReducible > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                {totalReducible > 0 ? fmtMins(totalReducible) : "0"}
              </p>
              <p className="mt-0.5 text-[10px] text-zinc-600">全ブランチ × 全シフト合計</p>
            </div>
            <div className={`${GLASS_CARD} p-3 text-center`}>
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">OT削減対象ブランチ</p>
              <p className={`mt-1 text-2xl font-bold tabular-nums ${branchesWithOt > 0 ? "text-red-400" : "text-emerald-400"}`}>
                {branchesWithOt} <span className="text-base text-zinc-500">/ {summary?.total_branches ?? 0}</span>
              </p>
              <p className="mt-0.5 text-[10px] text-zinc-600">built-in OT が検出されたブランチ</p>
            </div>
            <div className={`${GLASS_CARD} p-3 text-center`}>
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">公式</p>
              <p className="mt-1 text-xs font-mono text-sky-300">
                Lean Start<br />= Avg Checkout − 9h
              </p>
              <p className="mt-0.5 text-[10px] text-zinc-600">退勤時刻 - 9時間 = 理想の出勤時刻</p>
            </div>
          </div>

          {/* Branch cards */}
          {branchGroups.length === 0 ? (
            <div className={`${GLASS_CARD} py-10 text-center text-sm text-zinc-500`}>
              選択期間内にデータが見つかりませんでした
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {branchGroups.map(({ branch, rows: bRows }) => (
                <BranchCard
                  key={branch}
                  branch={branch}
                  rows={bRows}
                  budgetMins={budgetMins}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
