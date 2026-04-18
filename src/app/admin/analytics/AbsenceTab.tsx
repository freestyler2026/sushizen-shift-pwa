"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, Users, Building2, Search, CalendarX } from "lucide-react";
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
type AbsenceBranchRow = {
  branch_code: string;
  incidents: number;
  staff_count: number;
  absent_days: number;
};

type AbsenceStaffRow = {
  staff_name: string;
  branch_code: string;
  absent_days: number;
  absence_types: string[];
};

type AbsenceDetailRow = {
  date: string;
  absence_type: string;
  note: string;
  branch_code: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isoFirstOfMonth(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function isoLastOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

function absenceTypeColor(type: string): string {
  const t = (type || "").toLowerCase();
  if (t.includes("sick") || t.includes("medical") || t.includes("ill")) {
    return "bg-blue-500/20 text-blue-300 border-blue-500/30";
  }
  if (t.includes("unpaid") || t.includes("unexcused") || t.includes("no show")) {
    return "bg-red-500/20 text-red-300 border-red-500/30";
  }
  if (t.includes("annual") || t.includes("vacation") || t.includes("leave")) {
    return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
  }
  return "bg-zinc-500/20 text-zinc-300 border-zinc-500/30";
}

function AbsenceTypeBadge({ type }: { type: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${absenceTypeColor(type)}`}
    >
      {type || "—"}
    </span>
  );
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

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function AbsenceTab({
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

  // City selector
  const [city, setCity] = useState(defaultCity || "dubai");

  // draft = what user is selecting in picker; applied = what's been fetched
  const [draftRange, setDraftRange] = useState({ from: initFrom, to: initTo });
  const [appliedFrom, setAppliedFrom] = useState(initFrom);
  const [appliedTo, setAppliedTo] = useState(initTo);

  const [view, setView] = useState<"branch" | "staff">("branch");

  const [branchRows, setBranchRows] = useState<AbsenceBranchRow[]>([]);
  const [staffRows, setStaffRows] = useState<AbsenceStaffRow[]>([]);
  const [staffSearch, setStaffSearch] = useState("");

  const [expandedStaff, setExpandedStaff] = useState<string | null>(null);
  const [staffDetail, setStaffDetail] = useState<Record<string, AbsenceDetailRow[]>>({});
  const [detailLoading, setDetailLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
      const res = await apiGet<{ ok: boolean; rows: AbsenceBranchRow[] }>(
        `/api/admin/analytics/absence/by_branch${qs(params)}`
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
      const res = await apiGet<{ ok: boolean; rows: AbsenceStaffRow[] }>(
        `/api/admin/analytics/absence/by_staff${qs(params)}`
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
      const res = await apiGet<{ ok: boolean; rows: AbsenceDetailRow[] }>(
        `/api/admin/analytics/absence/staff_detail${qs({ ...baseParams, staff_name: staffName })}`
      );
      setStaffDetail((prev) => ({ ...prev, [staffName]: res.rows || [] }));
    } catch {
      // silently keep expanded
    } finally {
      setDetailLoading(false);
    }
  }

  const filteredStaff = staffRows.filter(
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

  // Summary stats
  const totalIncidents = branchRows.reduce((s, r) => s + r.incidents, 0);
  const totalStaff = branchRows.reduce((s, r) => s + r.staff_count, 0);
  const totalAbsentDays = branchRows.reduce((s, r) => s + r.absent_days, 0);

  return (
    <div className="space-y-4">
      {/* ── Header / controls ── */}
      <div className={GLASS_CARD + " p-4 space-y-3"}>
        <div className="flex items-center gap-2">
          <CalendarX className="h-4 w-4 text-rose-400 shrink-0" />
          <span className="text-sm font-semibold text-white">Absence Analysis</span>
          <span className="text-xs text-zinc-500">Absences recorded in Bayzat · all types included</span>
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
                      ? "bg-rose-400/20 text-rose-300 border-r border-white/10"
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
                ? "border-rose-400/40 bg-rose-400/20 text-rose-300 hover:bg-rose-400/30"
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
          <span className="ml-2 capitalize text-zinc-500">· {city}</span>
        </div>
      </div>

      {/* KPI Summary */}
      {!loading && branchRows.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <KpiCard label="Total Absences" value={totalIncidents} sub="all records" />
          <KpiCard label="Staff Affected" value={totalStaff} />
          <KpiCard label="Absent Days" value={totalAbsentDays} sub="unique dates" />
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
      </div>

      {loading && (
        <div className="py-6 text-center text-sm text-zinc-500">Loading…</div>
      )}

      {/* ── BY BRANCH ── */}
      {!loading && view === "branch" && (
        <div className={GLASS_CARD + " overflow-x-auto p-0"}>
          {branchRows.length === 0 ? (
            <div className="p-6 text-center text-sm text-zinc-500">No absence records in this period.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/8">
                  <th className={`${TABLE_HEADER} px-4 py-3 text-left`}>Branch</th>
                  <th className={`${TABLE_HEADER} px-4 py-3 text-right`}>Records</th>
                  <th className={`${TABLE_HEADER} px-4 py-3 text-right`}>Staff</th>
                  <th className={`${TABLE_HEADER} px-4 py-3 text-right`}>Absent Days</th>
                </tr>
              </thead>
              <tbody>
                {branchRows.map((r) => (
                  <tr key={r.branch_code} className={TABLE_ROW}>
                    <td className={`${TABLE_CELL} px-4 font-medium`}>{r.branch_code || "—"}</td>
                    <td className={`${TABLE_CELL} px-4 text-right tabular-nums`}>{r.incidents}</td>
                    <td className={`${TABLE_CELL} px-4 text-right tabular-nums`}>{r.staff_count}</td>
                    <td className={`${TABLE_CELL} px-4 text-right tabular-nums text-rose-300`}>{r.absent_days}</td>
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
          {staffRows.length > 0 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search staff or branch…"
                value={staffSearch}
                onChange={(e) => setStaffSearch(e.target.value)}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-900 py-2 pl-9 pr-3 text-sm text-white placeholder-zinc-600 focus:border-rose-500/40 focus:outline-none focus:ring-1 focus:ring-rose-500/20"
              />
            </div>
          )}

          {filteredStaff.length === 0 && (
            <div className={GLASS_CARD + " p-6 text-center text-sm text-zinc-500"}>
              {staffRows.length === 0 ? "No absence records for this period." : "No matches found."}
            </div>
          )}

          {filteredStaff.map((r, idx) => {
            const isExpanded = expandedStaff === r.staff_name;
            const detail = staffDetail[r.staff_name] || [];
            return (
              <div
                key={`${r.staff_name}-${idx}`}
                className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] transition-colors hover:border-rose-500/20"
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
                    <span className="rounded-lg border border-rose-500/30 bg-rose-500/20 px-2 py-0.5 text-xs font-semibold text-rose-300">
                      {r.absent_days} day{r.absent_days !== 1 ? "s" : ""}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {(r.absence_types || []).slice(0, 2).map((t) => (
                        <AbsenceTypeBadge key={t} type={t} />
                      ))}
                      {(r.absence_types || []).length > 2 && (
                        <span className="text-[11px] text-zinc-500">+{r.absence_types.length - 2}</span>
                      )}
                    </div>
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
                              <th className={`${TABLE_HEADER} px-4 py-2 text-left`}>Type</th>
                              <th className={`${TABLE_HEADER} px-4 py-2 text-left`}>Note</th>
                              <th className={`${TABLE_HEADER} px-4 py-2 text-left`}>Branch</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.map((d, di) => (
                              <tr key={`${d.date}-${di}`} className="border-t border-white/5 hover:bg-white/5">
                                <td className="px-4 py-2.5 text-xs font-medium text-zinc-300">{d.date}</td>
                                <td className="px-4 py-2.5">
                                  <AbsenceTypeBadge type={d.absence_type} />
                                </td>
                                <td className="px-4 py-2.5 text-xs text-zinc-500 max-w-[200px] truncate">
                                  {d.note || "—"}
                                </td>
                                <td className="px-4 py-2.5 text-xs text-zinc-500">{d.branch_code || "—"}</td>
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
