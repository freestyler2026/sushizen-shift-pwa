"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, Users, Building2, Search, AlarmClock, TrendingUp, Clock } from "lucide-react";
import { apiGet, qs } from "@/lib/api";
import DateRangePicker from "@/components/DateRangePicker";
import {
  GLASS_CARD,
  KPI_LABEL,
  KPI_VALUE,
  TABLE_HEADER,
  TABLE_ROW,
  TABLE_CELL,
  TAB_CONTAINER,
  TAB_ACTIVE,
  TAB_INACTIVE,
} from "@/lib/ui-tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type LateBranchRow = {
  branch_code: string;
  incidents: number;
  staff_count: number;
  total_late_minutes: number;
  avg_late_minutes: number;
  max_late_minutes: number;
};

type LateStaffRow = {
  staff_name: string;
  branch_code: string;
  late_days: number;
  total_late_minutes: number;
  avg_late_minutes: number;
  max_late_minutes: number;
};

type LateDetailRow = {
  date: string;
  late_minutes: number;
  branch_code: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isBackOffice(name: string): boolean {
  const lower = (name || "").toLowerCase().replace(/[\s_-]/g, "");
  return lower.includes("backoffice") || lower.includes("back office");
}

function fmtMins(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function isoFirstOfMonth(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function isoLastOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

// Severity color based on total late minutes
function severityColor(mins: number, max: number): { bar: string; text: string; bg: string; border: string } {
  const pct = max > 0 ? mins / max : 0;
  if (pct >= 0.75)
    return { bar: "bg-red-500", text: "text-red-300", bg: "bg-red-500/10", border: "border-red-500/20" };
  if (pct >= 0.45)
    return { bar: "bg-orange-500", text: "text-orange-300", bg: "bg-orange-500/10", border: "border-orange-500/20" };
  if (pct >= 0.2)
    return { bar: "bg-yellow-500", text: "text-yellow-300", bg: "bg-yellow-500/10", border: "border-yellow-500/20" };
  return { bar: "bg-emerald-500", text: "text-emerald-300", bg: "bg-emerald-500/10", border: "border-emerald-500/20" };
}

function avgSeverityColor(avgMins: number): { text: string; bg: string } {
  if (avgMins >= 60) return { text: "text-red-300", bg: "bg-red-500/15" };
  if (avgMins >= 30) return { text: "text-orange-300", bg: "bg-orange-500/15" };
  if (avgMins >= 15) return { text: "text-yellow-300", bg: "bg-yellow-500/15" };
  return { text: "text-emerald-300", bg: "bg-emerald-500/15" };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function LateBadge({ minutes }: { minutes: number }) {
  const color =
    minutes >= 60
      ? "bg-red-500/20 text-red-300 border-red-500/30"
      : minutes >= 30
      ? "bg-orange-500/20 text-orange-300 border-orange-500/30"
      : "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-semibold ${color}`}>
      <AlarmClock className="h-3 w-3" />
      {fmtMins(minutes)}
    </span>
  );
}

// Horizontal mini bar chart for branch comparison
function BranchBarChart({ rows, maxMins }: { rows: LateBranchRow[]; maxMins: number }) {
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const pct = maxMins > 0 ? Math.round((r.total_late_minutes / maxMins) * 100) : 0;
        const col = severityColor(r.total_late_minutes, maxMins);
        return (
          <div key={r.branch_code} className="flex items-center gap-3">
            <div className="w-24 shrink-0 text-right text-xs font-medium text-zinc-300">{r.branch_code}</div>
            <div className="flex-1 relative h-6 rounded-lg bg-white/5 overflow-hidden">
              <div
                className={`h-full rounded-lg transition-all duration-500 ${col.bar} opacity-70`}
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
              <div className="absolute inset-0 flex items-center px-2">
                <span className={`text-[11px] font-semibold ${col.text}`}>{fmtMins(r.total_late_minutes)}</span>
              </div>
            </div>
            <div className="w-12 shrink-0 text-right text-[11px] text-zinc-500">{pct}%</div>
          </div>
        );
      })}
    </div>
  );
}

// Staff rank badge
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-sm">🥇</span>;
  if (rank === 2) return <span className="text-sm">🥈</span>;
  if (rank === 3) return <span className="text-sm">🥉</span>;
  return <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-zinc-400">{rank}</span>;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function LateTab({
  city: defaultCity,
  dateFrom: defaultFrom,
  dateTo: defaultTo,
  approverName,
  pin,
}: {
  city: string;
  dateFrom: string;
  dateTo: string;
  approverName: string;
  pin: string;
}) {
  const now = new Date();
  const initFrom = defaultFrom || isoFirstOfMonth(now);
  const initTo = defaultTo || isoLastOfMonth(now);

  const [city, setCity] = useState(defaultCity || "dubai");
  const [draftRange, setDraftRange] = useState({ from: initFrom, to: initTo });
  const [appliedFrom, setAppliedFrom] = useState(initFrom);
  const [appliedTo, setAppliedTo] = useState(initTo);

  const [view, setView] = useState<"branch" | "staff">("branch");

  const [branchRows, setBranchRows] = useState<LateBranchRow[]>([]);
  const [staffRows, setStaffRows] = useState<LateStaffRow[]>([]);
  const [staffSearch, setStaffSearch] = useState("");

  const [expandedStaff, setExpandedStaff] = useState<string | null>(null);
  const [staffDetail, setStaffDetail] = useState<Record<string, LateDetailRow[]>>({});
  const [detailLoading, setDetailLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Toggle between chart and table view for branch
  const [branchDisplay, setBranchDisplay] = useState<"chart" | "table">("chart");

  const baseParams = useMemo(
    () => ({
      city,
      date_from: appliedFrom,
      date_to: appliedTo,
      approver_name: approverName,
      pin,
    }),
    [city, appliedFrom, appliedTo, approverName, pin]
  );

  const loadBranch = useCallback(async (params: typeof baseParams) => {
    setLoading(true);
    setError("");
    try {
      const res = await apiGet<{ ok: boolean; rows: LateBranchRow[] }>(
        `/api/admin/analytics/late/by_branch${qs(params)}`
      );
      setBranchRows(res.rows || []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStaff = useCallback(async (params: typeof baseParams) => {
    setLoading(true);
    setError("");
    try {
      const res = await apiGet<{ ok: boolean; rows: LateStaffRow[] }>(
        `/api/admin/analytics/late/by_staff${qs(params)}`
      );
      setStaffRows(res.rows || []);
      setExpandedStaff(null);
      setStaffDetail({});
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === "branch") void loadBranch(baseParams);
    if (view === "staff") void loadStaff(baseParams);
  }, [baseParams, view, loadBranch, loadStaff]);

  function applyRange() {
    if (!draftRange.from || !draftRange.to) return;
    setAppliedFrom(draftRange.from);
    setAppliedTo(draftRange.to);
  }

  async function toggleStaffDetail(staffName: string) {
    if (expandedStaff === staffName) {
      setExpandedStaff(null);
      return;
    }
    setExpandedStaff(staffName);
    if (staffDetail[staffName]) return;

    setDetailLoading(true);
    try {
      const res = await apiGet<{ ok: boolean; rows: LateDetailRow[] }>(
        `/api/admin/analytics/late/staff_detail${qs({ ...baseParams, staff_name: staffName })}`
      );
      setStaffDetail((prev) => ({ ...prev, [staffName]: res.rows || [] }));
    } catch {
      // silently keep expanded
    } finally {
      setDetailLoading(false);
    }
  }

  const filteredBranch = branchRows
    .filter((r) => !isBackOffice(r.branch_code))
    .sort((a, b) => b.total_late_minutes - a.total_late_minutes);

  const filteredStaff = staffRows
    .filter((r) => !isBackOffice(r.branch_code))
    .filter(
      (r) =>
        !staffSearch ||
        r.staff_name.toLowerCase().includes(staffSearch.toLowerCase()) ||
        r.branch_code.toLowerCase().includes(staffSearch.toLowerCase())
    );

  const subTabs: Array<{ key: typeof view; label: string; icon: React.ReactNode }> = [
    { key: "branch", label: "By Branch", icon: <Building2 className="h-3.5 w-3.5" /> },
    { key: "staff", label: "By Staff", icon: <Users className="h-3.5 w-3.5" /> },
  ];

  const rangeChanged = draftRange.from !== appliedFrom || draftRange.to !== appliedTo;

  const totalIncidents = filteredBranch.reduce((s, r) => s + r.incidents, 0);
  const totalStaff = filteredBranch.reduce((s, r) => s + r.staff_count, 0);
  const totalLateMin = filteredBranch.reduce((s, r) => s + r.total_late_minutes, 0);
  const maxBranchMins = filteredBranch.length > 0 ? filteredBranch[0].total_late_minutes : 0;
  const avgLatePerIncident = totalIncidents > 0 ? Math.round(totalLateMin / totalIncidents) : 0;

  // Worst branch
  const worstBranch = filteredBranch[0];

  return (
    <div className="space-y-4">
      {/* ── Header / controls ── */}
      <div className={GLASS_CARD + " p-4 space-y-3"}>
        <div className="flex items-center gap-2">
          <AlarmClock className="h-4 w-4 text-yellow-400 shrink-0" />
          <span className="text-sm font-semibold text-white">Late Analysis</span>
          <span className="text-xs text-zinc-500">Min 10 min threshold · Back Office excluded</span>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {/* City selector */}
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">City</div>
            <div className="flex rounded-xl border border-white/10 overflow-hidden">
              {(["dubai", "manila"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCity(c)}
                  className={`px-4 py-2 text-sm font-medium capitalize transition ${
                    city === c
                      ? "bg-yellow-400/20 text-yellow-300 border-r border-white/10"
                      : "text-zinc-400 hover:text-white border-r border-white/10 last:border-r-0"
                  }`}
                >
                  {c === "dubai" ? "Dubai" : "Manila"}
                </button>
              ))}
            </div>
          </div>

          {/* Period picker */}
          <div className="min-w-[260px] flex-1">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Period</div>
            <DateRangePicker value={draftRange} onChange={(r) => setDraftRange(r)} />
          </div>

          <button
            type="button"
            onClick={applyRange}
            disabled={loading || !draftRange.from || !draftRange.to}
            className={`flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
              rangeChanged
                ? "border-yellow-400/40 bg-yellow-400/20 text-yellow-300 hover:bg-yellow-400/30"
                : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/20 hover:text-white"
            } disabled:opacity-50`}
          >
            {loading ? (
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : null}
            {rangeChanged ? "Apply" : "Reload"}
          </button>
        </div>

        <div className="text-[11px] text-zinc-600">
          Showing:{" "}
          <span className="text-zinc-400 font-medium">{appliedFrom}</span> →{" "}
          <span className="text-zinc-400 font-medium">{appliedTo}</span>
          <span className="ml-2 capitalize text-zinc-500">· {city}</span>
        </div>
      </div>

      {/* ── KPI Summary row ── */}
      {!loading && filteredBranch.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* Total Late */}
          <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.07] p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-red-400" />
              <div className={KPI_LABEL}>Total Late</div>
            </div>
            <div className={KPI_VALUE + " text-red-300"}>{fmtMins(totalLateMin)}</div>
            <div className="mt-1 text-[11px] text-zinc-500">all staff combined</div>
          </div>

          {/* Incidents */}
          <div className="rounded-2xl border border-orange-500/20 bg-orange-500/[0.07] p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlarmClock className="h-4 w-4 text-orange-400" />
              <div className={KPI_LABEL}>Incidents</div>
            </div>
            <div className={KPI_VALUE + " text-orange-300"}>{totalIncidents}</div>
            <div className="mt-1 text-[11px] text-zinc-500">qualifying days</div>
          </div>

          {/* Staff affected */}
          <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/[0.07] p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-yellow-400" />
              <div className={KPI_LABEL}>Staff Affected</div>
            </div>
            <div className={KPI_VALUE + " text-yellow-300"}>{totalStaff}</div>
            <div className="mt-1 text-[11px] text-zinc-500">unique staff</div>
          </div>

          {/* Avg per incident */}
          <div className="rounded-2xl border border-purple-500/20 bg-purple-500/[0.07] p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-purple-400" />
              <div className={KPI_LABEL}>Avg / Incident</div>
            </div>
            <div className={KPI_VALUE + " text-purple-300"}>{fmtMins(avgLatePerIncident)}</div>
            <div className="mt-1 text-[11px] text-zinc-500">per late event</div>
          </div>
        </div>
      )}

      {/* ── Worst branch highlight ── */}
      {!loading && worstBranch && (
        <div className="rounded-2xl border border-red-500/25 bg-gradient-to-r from-red-500/10 to-transparent p-4 flex items-center gap-4">
          <div className="text-2xl">🚨</div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-red-400/70 mb-0.5">Highest Late Branch</div>
            <div className="text-base font-bold text-white">{worstBranch.branch_code}</div>
            <div className="text-[11px] text-zinc-400 mt-0.5">
              {worstBranch.incidents} incidents · {worstBranch.staff_count} staff · avg {fmtMins(worstBranch.avg_late_minutes)}/incident
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-xl font-bold text-red-300">{fmtMins(worstBranch.total_late_minutes)}</div>
            <div className="text-[10px] text-zinc-500">total late</div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Sub-tabs */}
      <div className={TAB_CONTAINER}>
        {subTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setView(t.key)}
            className={`${view === t.key ? TAB_ACTIVE : TAB_INACTIVE} flex items-center gap-1.5`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}

        {/* Chart / Table toggle (branch only) */}
        {view === "branch" && !loading && filteredBranch.length > 0 && (
          <div className="ml-auto flex rounded-xl border border-white/10 overflow-hidden text-xs">
            {(["chart", "table"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setBranchDisplay(d)}
                className={`px-3 py-1.5 capitalize transition ${
                  branchDisplay === d
                    ? "bg-white/10 text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {d === "chart" ? "📊 Chart" : "📋 Table"}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <div className="py-6 text-center text-sm text-zinc-500">Loading…</div>
      )}

      {/* ── BY BRANCH — Chart view ── */}
      {!loading && view === "branch" && branchDisplay === "chart" && (
        <div className={GLASS_CARD + " p-5"}>
          {filteredBranch.length === 0 ? (
            <div className="py-4 text-center text-sm text-zinc-500">No late incidents recorded in this period.</div>
          ) : (
            <div className="space-y-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-3">
                Total Late by Branch (sorted by severity)
              </div>
              <BranchBarChart rows={filteredBranch} maxMins={maxBranchMins} />

              {/* Legend */}
              <div className="flex flex-wrap gap-3 pt-3 border-t border-white/5">
                {[
                  { color: "bg-red-500", label: "Critical (≥75% of max)" },
                  { color: "bg-orange-500", label: "High (≥45%)" },
                  { color: "bg-yellow-500", label: "Medium (≥20%)" },
                  { color: "bg-emerald-500", label: "Low (<20%)" },
                ].map((l) => (
                  <div key={l.label} className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                    <div className={`h-2.5 w-2.5 rounded-sm ${l.color} opacity-70`} />
                    {l.label}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── BY BRANCH — Table view ── */}
      {!loading && view === "branch" && branchDisplay === "table" && (
        <div className={GLASS_CARD + " overflow-x-auto p-0"}>
          {filteredBranch.length === 0 ? (
            <div className="p-6 text-center text-sm text-zinc-500">No late incidents recorded in this period.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/8">
                  <th className={`${TABLE_HEADER} px-4 py-3 text-left`}>#</th>
                  <th className={`${TABLE_HEADER} px-4 py-3 text-left`}>Branch</th>
                  <th className={`${TABLE_HEADER} px-4 py-3 text-right`}>Incidents</th>
                  <th className={`${TABLE_HEADER} px-4 py-3 text-right`}>Staff</th>
                  <th className={`${TABLE_HEADER} px-4 py-3`} style={{ minWidth: 180 }}>Total Late</th>
                  <th className={`${TABLE_HEADER} px-4 py-3 text-right`}>Avg</th>
                  <th className={`${TABLE_HEADER} px-4 py-3 text-right`}>Max</th>
                </tr>
              </thead>
              <tbody>
                {filteredBranch.map((r, idx) => {
                  const col = severityColor(r.total_late_minutes, maxBranchMins);
                  const avgCol = avgSeverityColor(r.avg_late_minutes);
                  const barPct = maxBranchMins > 0 ? Math.round((r.total_late_minutes / maxBranchMins) * 100) : 0;
                  return (
                    <tr key={r.branch_code} className={`${TABLE_ROW} ${col.bg}`}>
                      <td className={`${TABLE_CELL} px-4 w-8`}>
                        <span className="text-xs text-zinc-500 font-medium">{idx + 1}</span>
                      </td>
                      <td className={`${TABLE_CELL} px-4 font-semibold ${col.text}`}>{r.branch_code || "—"}</td>
                      <td className={`${TABLE_CELL} px-4 text-right tabular-nums text-zinc-300`}>{r.incidents}</td>
                      <td className={`${TABLE_CELL} px-4 text-right tabular-nums text-zinc-400`}>{r.staff_count}</td>
                      <td className={`${TABLE_CELL} px-4`}>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 relative h-5 rounded bg-white/5 overflow-hidden" style={{ minWidth: 80 }}>
                            <div
                              className={`h-full rounded transition-all duration-500 ${col.bar} opacity-60`}
                              style={{ width: `${Math.max(barPct, 2)}%` }}
                            />
                          </div>
                          <span className={`text-xs font-semibold ${col.text} tabular-nums shrink-0`}>
                            {fmtMins(r.total_late_minutes)}
                          </span>
                        </div>
                      </td>
                      <td className={`${TABLE_CELL} px-4 text-right`}>
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${avgCol.bg} ${avgCol.text}`}>
                          {fmtMins(r.avg_late_minutes)}
                        </span>
                      </td>
                      <td className={`${TABLE_CELL} px-4 text-right text-zinc-500 tabular-nums text-xs`}>
                        {fmtMins(r.max_late_minutes)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── BY STAFF ── */}
      {!loading && view === "staff" && (
        <div className="space-y-2">
          {staffRows.filter((r) => !isBackOffice(r.branch_code)).length > 0 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search staff or branch…"
                value={staffSearch}
                onChange={(e) => setStaffSearch(e.target.value)}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-900 py-2 pl-9 pr-3 text-sm text-white placeholder-zinc-600 focus:border-yellow-500/40 focus:outline-none focus:ring-1 focus:ring-yellow-500/20"
              />
            </div>
          )}

          {filteredStaff.length === 0 && (
            <div className={GLASS_CARD + " p-6 text-center text-sm text-zinc-500"}>
              {staffRows.length === 0 ? "No late incidents for this period." : "No matches found."}
            </div>
          )}

          {/* Staff list — sorted by total_late_minutes descending */}
          {(() => {
            const sorted = [...filteredStaff].sort((a, b) => b.total_late_minutes - a.total_late_minutes);
            const maxStaffMins = sorted.length > 0 ? sorted[0].total_late_minutes : 0;

            return sorted.map((r, idx) => {
              const isExpanded = expandedStaff === r.staff_name;
              const detail = staffDetail[r.staff_name] || [];
              const col = severityColor(r.total_late_minutes, maxStaffMins);
              const barPct = maxStaffMins > 0 ? Math.round((r.total_late_minutes / maxStaffMins) * 100) : 0;

              return (
                <div
                  key={`${r.staff_name}-${idx}`}
                  className={`overflow-hidden rounded-2xl border transition-colors ${col.border} ${col.bg} hover:border-yellow-500/30`}
                >
                  <button
                    type="button"
                    onClick={() => toggleStaffDetail(r.staff_name)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    {/* Rank */}
                    <div className="shrink-0 flex items-center justify-center w-6">
                      <RankBadge rank={idx + 1} />
                    </div>

                    {/* Name + branch */}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-white">{r.staff_name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-zinc-500">{r.branch_code || "—"}</span>
                        <span className="text-[10px] text-zinc-600">·</span>
                        <span className="text-[11px] text-zinc-500">
                          {r.late_days} day{r.late_days !== 1 ? "s" : ""}
                        </span>
                      </div>
                      {/* Inline progress bar */}
                      <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden" style={{ maxWidth: 160 }}>
                        <div
                          className={`h-full rounded-full ${col.bar} opacity-70 transition-all duration-500`}
                          style={{ width: `${Math.max(barPct, 3)}%` }}
                        />
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="text-right">
                        <div className={`text-sm font-bold ${col.text}`}>{fmtMins(r.total_late_minutes)}</div>
                        <div className="text-[10px] text-zinc-500">avg {fmtMins(r.avg_late_minutes)}</div>
                      </div>
                      <span className="text-zinc-600">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-white/8 bg-black/20">
                      {detailLoading && !detail.length ? (
                        <div className="p-4 text-xs text-zinc-500">Loading…</div>
                      ) : detail.length === 0 ? (
                        <div className="p-4 text-xs text-zinc-500">No detail available.</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-white/5">
                                <th className={`${TABLE_HEADER} px-4 py-2 text-left`}>Date</th>
                                <th className={`${TABLE_HEADER} px-4 py-2 text-left`}>Branch</th>
                                <th className={`${TABLE_HEADER} px-4 py-2 text-right`}>Late</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detail.map((d) => (
                                <tr key={d.date} className="border-t border-white/5 hover:bg-white/5">
                                  <td className="px-4 py-2.5 text-xs font-medium text-zinc-300">{d.date}</td>
                                  <td className="px-4 py-2.5 text-xs text-zinc-500">{d.branch_code || "—"}</td>
                                  <td className="px-4 py-2.5 text-right">
                                    <LateBadge minutes={d.late_minutes} />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      )}
    </div>
  );
}
