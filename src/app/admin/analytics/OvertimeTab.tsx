"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ChevronDown, ChevronRight, Clock, AlertTriangle, Users, Building2, Search } from "lucide-react";
import { apiGet, qs } from "@/lib/api";
import DateRangePicker from "@/components/DateRangePicker";
import {
  GLASS_CARD,
  KPI_CARD,
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
type OvertimeSummary = {
  ok: boolean;
  total_incidents: number;
  total_staff: number;
  total_overtime_minutes: number;
  avg_overtime_minutes: number;
  max_overtime_minutes: number;
};

type OvertimeBranchRow = {
  branch_code: string;
  incidents: number;
  staff_count: number;
  total_overtime_minutes: number;
  avg_overtime_minutes: number;
};

type OvertimeStaffRow = {
  staff_name: string;
  branch_code: string;
  ot_days: number;
  total_overtime_minutes: number;
  avg_overtime_minutes: number;
  max_overtime_minutes: number;
};

type OvertimeDetailRow = {
  date: string;
  check_in: string;
  check_out: string;
  hours_worked_minutes: number;
  overtime_minutes: number;
  overtime_start: string;
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

function fmtHoursWorked(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function isoFirstOfMonth(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function isoLastOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className={KPI_CARD}>
      <div className={KPI_LABEL}>{label}</div>
      <div className={KPI_VALUE + " text-xl"}>{value}</div>
      {sub && <div className="mt-1 text-[11px] text-zinc-500">{sub}</div>}
    </div>
  );
}

function OtBadge({ minutes }: { minutes: number }) {
  const color =
    minutes >= 120
      ? "bg-red-500/20 text-red-300 border-red-500/30"
      : minutes >= 60
      ? "bg-orange-500/20 text-orange-300 border-orange-500/30"
      : "bg-amber-500/20 text-amber-300 border-amber-500/30";
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-semibold ${color}`}>
      <Clock className="h-3 w-3" />
      +{fmtMins(minutes)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function OvertimeTab({
  city,
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

  // draft = what user is selecting in picker; applied = what's been fetched
  const [draftRange, setDraftRange] = useState({ from: initFrom, to: initTo });
  const [appliedFrom, setAppliedFrom] = useState(initFrom);
  const [appliedTo, setAppliedTo] = useState(initTo);

  const [view, setView] = useState<"summary" | "branch" | "staff">("summary");

  const [summary, setSummary] = useState<OvertimeSummary | null>(null);
  const [branchRows, setBranchRows] = useState<OvertimeBranchRow[]>([]);
  const [staffRows, setStaffRows] = useState<OvertimeStaffRow[]>([]);
  const [staffSearch, setStaffSearch] = useState("");

  const [expandedStaff, setExpandedStaff] = useState<string | null>(null);
  const [staffDetail, setStaffDetail] = useState<Record<string, OvertimeDetailRow[]>>({});
  const [detailLoading, setDetailLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // baseParams only changes when applied dates change (not on every picker interaction)
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

  const loadSummary = useCallback(async (params: typeof baseParams) => {
    setLoading(true);
    setError("");
    try {
      const res = await apiGet<OvertimeSummary>(`/api/admin/analytics/overtime/summary${qs(params)}`);
      setSummary(res);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBranch = useCallback(async (params: typeof baseParams) => {
    setLoading(true);
    setError("");
    try {
      const res = await apiGet<{ ok: boolean; rows: OvertimeBranchRow[] }>(
        `/api/admin/analytics/overtime/by_branch${qs(params)}`
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
      const res = await apiGet<{ ok: boolean; rows: OvertimeStaffRow[] }>(
        `/api/admin/analytics/overtime/by_staff${qs(params)}`
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

  // Re-fetch when applied period or view changes
  useEffect(() => {
    if (view === "summary") void loadSummary(baseParams);
    if (view === "branch") void loadBranch(baseParams);
    if (view === "staff") void loadStaff(baseParams);
  }, [baseParams, view, loadSummary, loadBranch, loadStaff]);

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
      const res = await apiGet<{ ok: boolean; rows: OvertimeDetailRow[] }>(
        `/api/admin/analytics/overtime/staff_detail${qs({ ...baseParams, staff_name: staffName })}`
      );
      setStaffDetail((prev) => ({ ...prev, [staffName]: res.rows || [] }));
    } catch {
      // silently keep expanded
    } finally {
      setDetailLoading(false);
    }
  }

  // Filter out Back Office in all views
  const filteredBranch = branchRows.filter((r) => !isBackOffice(r.branch_code));
  const filteredStaff = staffRows
    .filter((r) => !isBackOffice(r.branch_code))
    .filter(
      (r) =>
        !staffSearch ||
        r.staff_name.toLowerCase().includes(staffSearch.toLowerCase()) ||
        r.branch_code.toLowerCase().includes(staffSearch.toLowerCase())
    );

  const subTabs: Array<{ key: typeof view; label: string; icon: React.ReactNode }> = [
    { key: "summary", label: "Summary", icon: <Clock className="h-3.5 w-3.5" /> },
    { key: "branch", label: "By Branch", icon: <Building2 className="h-3.5 w-3.5" /> },
    { key: "staff", label: "By Staff", icon: <Users className="h-3.5 w-3.5" /> },
  ];

  const rangeChanged = draftRange.from !== appliedFrom || draftRange.to !== appliedTo;

  return (
    <div className="space-y-4">
      {/* ── Period selector ── */}
      <div className={GLASS_CARD + " p-4 space-y-3"}>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-amber-400 shrink-0" />
          <span className="text-sm font-semibold text-white">Overtime Analysis</span>
          <span className="text-xs text-zinc-500">Daily work &gt; 9h = overtime · min 15 min qualifying · Back Office excluded</span>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[260px] flex-1">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Period</div>
            <DateRangePicker
              value={draftRange}
              onChange={(r) => setDraftRange(r)}
            />
          </div>
          <button
            type="button"
            onClick={applyRange}
            disabled={loading || !draftRange.from || !draftRange.to}
            className={`flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
              rangeChanged
                ? "border-amber-400/40 bg-amber-400/20 text-amber-300 hover:bg-amber-400/30"
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
          Showing: <span className="text-zinc-400 font-medium">{appliedFrom}</span> → <span className="text-zinc-400 font-medium">{appliedTo}</span>
        </div>
      </div>

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
      </div>

      {loading && (
        <div className="py-6 text-center text-sm text-zinc-500">Loading…</div>
      )}

      {/* ── SUMMARY ── */}
      {!loading && view === "summary" && summary && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <KpiCard label="OT Incidents" value={summary.total_incidents} sub="qualifying days" />
            <KpiCard label="Staff with OT" value={summary.total_staff} />
            <KpiCard label="Total OT" value={fmtMins(summary.total_overtime_minutes)} sub="all staff combined" />
            <KpiCard label="Avg OT / Day" value={fmtMins(Math.round(summary.avg_overtime_minutes))} />
            <KpiCard label="Max Single Day" value={fmtMins(summary.max_overtime_minutes)} />
          </div>
          {summary.total_incidents === 0 && (
            <div className={GLASS_CARD + " p-4 text-center text-sm text-zinc-500"}>
              No overtime recorded in this period.
            </div>
          )}
        </div>
      )}

      {/* ── BY BRANCH ── */}
      {!loading && view === "branch" && (
        <div className={GLASS_CARD + " overflow-x-auto p-0"}>
          {filteredBranch.length === 0 ? (
            <div className="p-6 text-center text-sm text-zinc-500">No overtime data by branch.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/8">
                  <th className={`${TABLE_HEADER} px-4 py-3 text-left`}>Branch</th>
                  <th className={`${TABLE_HEADER} px-4 py-3 text-right`}>Incidents</th>
                  <th className={`${TABLE_HEADER} px-4 py-3 text-right`}>Staff</th>
                  <th className={`${TABLE_HEADER} px-4 py-3 text-right`}>Total OT</th>
                  <th className={`${TABLE_HEADER} px-4 py-3 text-right`}>Avg OT / Day</th>
                </tr>
              </thead>
              <tbody>
                {filteredBranch.map((r) => (
                  <tr key={r.branch_code} className={TABLE_ROW}>
                    <td className={`${TABLE_CELL} px-4 font-medium`}>{r.branch_code || "—"}</td>
                    <td className={`${TABLE_CELL} px-4 text-right tabular-nums`}>{r.incidents}</td>
                    <td className={`${TABLE_CELL} px-4 text-right tabular-nums`}>{r.staff_count}</td>
                    <td className={`${TABLE_CELL} px-4 text-right`}>
                      <OtBadge minutes={r.total_overtime_minutes} />
                    </td>
                    <td className={`${TABLE_CELL} px-4 text-right text-zinc-400`}>
                      {fmtMins(Math.round(r.avg_overtime_minutes))}
                    </td>
                  </tr>
                ))}
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
                className="w-full rounded-xl border border-neutral-700 bg-neutral-900 py-2 pl-9 pr-3 text-sm text-white placeholder-zinc-600 focus:border-amber-500/40 focus:outline-none focus:ring-1 focus:ring-amber-500/20"
              />
            </div>
          )}

          {filteredStaff.length === 0 && (
            <div className={GLASS_CARD + " p-6 text-center text-sm text-zinc-500"}>
              {staffRows.length === 0 ? "No overtime data for this period." : "No matches found."}
            </div>
          )}

          {filteredStaff.map((r, idx) => {
            const isExpanded = expandedStaff === r.staff_name;
            const detail = staffDetail[r.staff_name] || [];
            return (
              <div
                key={`${r.staff_name}-${idx}`}
                className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] transition-colors hover:border-amber-500/20"
              >
                <button
                  type="button"
                  onClick={() => toggleStaffDetail(r.staff_name)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <span className="text-zinc-500 shrink-0">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-white">{r.staff_name}</div>
                    <div className="text-[11px] text-zinc-500">{r.branch_code || "—"}</div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    <OtBadge minutes={r.total_overtime_minutes} />
                    <span className="text-[11px] text-zinc-500">
                      {r.ot_days} day{r.ot_days !== 1 ? "s" : ""} · avg {fmtMins(Math.round(r.avg_overtime_minutes))}
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
                              <th className={`${TABLE_HEADER} px-4 py-2 text-center`}>Check-in</th>
                              <th className={`${TABLE_HEADER} px-4 py-2 text-center`}>OT Start</th>
                              <th className={`${TABLE_HEADER} px-4 py-2 text-center`}>Check-out</th>
                              <th className={`${TABLE_HEADER} px-4 py-2 text-right`}>Worked</th>
                              <th className={`${TABLE_HEADER} px-4 py-2 text-right`}>OT</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.map((d) => (
                              <tr key={d.date} className="border-t border-white/5 hover:bg-white/5">
                                <td className="px-4 py-2.5 text-xs font-medium text-zinc-300">{d.date}</td>
                                <td className="px-4 py-2.5 text-center text-xs tabular-nums text-zinc-300">
                                  {d.check_in || "—"}
                                </td>
                                <td className="px-4 py-2.5 text-center text-xs tabular-nums text-amber-300 font-semibold">
                                  {d.overtime_start || "—"}
                                </td>
                                <td className="px-4 py-2.5 text-center text-xs tabular-nums text-zinc-300">
                                  {d.check_out || "—"}
                                </td>
                                <td className="px-4 py-2.5 text-right text-xs tabular-nums text-zinc-400">
                                  {fmtHoursWorked(d.hours_worked_minutes)}
                                </td>
                                <td className="px-4 py-2.5 text-right">
                                  <OtBadge minutes={d.overtime_minutes} />
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
          })}
        </div>
      )}
    </div>
  );
}
