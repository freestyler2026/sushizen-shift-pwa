"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ChevronDown, ChevronRight, AlertTriangle, Users, Building2,
  Search, CheckCircle2, XCircle, AlertCircle, ShieldCheck,
} from "lucide-react";
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
type AdherenceBranchRow = {
  branch_code: string;
  scheduled_shifts: number;
  attended_shifts: number;
  no_show_count: number;
  staff_count: number;
  adherence_rate: number;
  total_scheduled_minutes: number;
  total_actual_minutes: number;
};

type AdherenceStaffRow = {
  staff_name: string;
  branch_code: string;
  scheduled_shifts: number;
  attended_shifts: number;
  no_show_count: number;
  adherence_rate: number;
  total_scheduled_minutes: number;
  total_actual_minutes: number;
};

type AdherenceDetailRow = {
  date: string;
  scheduled_minutes: number;
  actual_minutes: number;
  no_show: boolean;
  missing_check_in: boolean;
  missing_check_out: boolean;
  status: "attended" | "no_show" | "partial" | "no_data";
  branch_code: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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

function adherenceColor(rate: number): string {
  if (rate >= 90) return "text-emerald-400";
  if (rate >= 75) return "text-amber-400";
  return "text-red-400";
}

function adherenceBg(rate: number): string {
  if (rate >= 90) return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
  if (rate >= 75) return "bg-amber-500/20 text-amber-300 border-amber-500/30";
  return "bg-red-500/20 text-red-300 border-red-500/30";
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

function AdherenceBadge({ rate }: { rate: number }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-bold ${adherenceBg(rate)}`}>
      <ShieldCheck className="h-3 w-3" />
      {rate.toFixed(1)}%
    </span>
  );
}

function AdherenceBar({ rate }: { rate: number }) {
  const color = rate >= 90 ? "bg-emerald-500" : rate >= 75 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(rate, 100)}%` }} />
      </div>
      <span className={`text-xs font-semibold tabular-nums ${adherenceColor(rate)}`}>
        {rate.toFixed(1)}%
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: AdherenceDetailRow["status"] }) {
  const map = {
    attended: { label: "Attended", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", icon: <CheckCircle2 className="h-3 w-3" /> },
    no_show:  { label: "No Show",  cls: "bg-red-500/20 text-red-300 border-red-500/30",           icon: <XCircle className="h-3 w-3" /> },
    partial:  { label: "Partial",  cls: "bg-amber-500/20 text-amber-300 border-amber-500/30",     icon: <AlertCircle className="h-3 w-3" /> },
    no_data:  { label: "No Data",  cls: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",        icon: <AlertCircle className="h-3 w-3" /> },
  };
  const { label, cls, icon } = map[status] || map.no_data;
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {icon}{label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function AdherenceTab({
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
  const [branchRows, setBranchRows] = useState<AdherenceBranchRow[]>([]);
  const [staffRows, setStaffRows] = useState<AdherenceStaffRow[]>([]);
  const [staffSearch, setStaffSearch] = useState("");

  const [expandedStaff, setExpandedStaff] = useState<string | null>(null);
  const [staffDetail, setStaffDetail] = useState<Record<string, AdherenceDetailRow[]>>({});
  const [detailLoading, setDetailLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const baseParams = useMemo(
    () => ({ city, date_from: appliedFrom, date_to: appliedTo, approver_name: approverName, pin }),
    [city, appliedFrom, appliedTo, approverName, pin]
  );

  const loadBranch = useCallback(async (params: typeof baseParams) => {
    setLoading(true); setError("");
    try {
      const res = await apiGet<{ ok: boolean; rows: AdherenceBranchRow[] }>(
        `/api/admin/analytics/adherence/by_branch${qs(params)}`
      );
      setBranchRows(res.rows || []);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  }, []);

  const loadStaff = useCallback(async (params: typeof baseParams) => {
    setLoading(true); setError("");
    try {
      const res = await apiGet<{ ok: boolean; rows: AdherenceStaffRow[] }>(
        `/api/admin/analytics/adherence/by_staff${qs(params)}`
      );
      setStaffRows(res.rows || []);
      setExpandedStaff(null);
      setStaffDetail({});
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
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
    if (expandedStaff === staffName) { setExpandedStaff(null); return; }
    setExpandedStaff(staffName);
    if (staffDetail[staffName]) return;
    setDetailLoading(true);
    try {
      const res = await apiGet<{ ok: boolean; rows: AdherenceDetailRow[] }>(
        `/api/admin/analytics/adherence/staff_detail${qs({ ...baseParams, staff_name: staffName })}`
      );
      setStaffDetail((prev) => ({ ...prev, [staffName]: res.rows || [] }));
    } catch { /* silently keep expanded */ }
    finally { setDetailLoading(false); }
  }

  const filteredStaff = staffRows.filter(
    (r) =>
      !staffSearch ||
      r.staff_name.toLowerCase().includes(staffSearch.toLowerCase()) ||
      r.branch_code.toLowerCase().includes(staffSearch.toLowerCase())
  );

  const rangeChanged = draftRange.from !== appliedFrom || draftRange.to !== appliedTo;

  // Overall KPIs
  const totalScheduled = branchRows.reduce((s, r) => s + r.scheduled_shifts, 0);
  const totalAttended  = branchRows.reduce((s, r) => s + r.attended_shifts, 0);
  const totalNoShow    = branchRows.reduce((s, r) => s + r.no_show_count, 0);
  const overallRate    = totalScheduled > 0 ? (totalAttended / totalScheduled) * 100 : 0;

  const subTabs: Array<{ key: typeof view; label: string; icon: React.ReactNode }> = [
    { key: "branch", label: "By Branch", icon: <Building2 className="h-3.5 w-3.5" /> },
    { key: "staff",  label: "By Staff",  icon: <Users className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="space-y-4">
      {/* ── Header / controls ── */}
      <div className={GLASS_CARD + " p-4 space-y-3"}>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
          <span className="text-sm font-semibold text-white">Shift Adherence</span>
          <span className="text-xs text-zinc-500">Scheduled shifts actually attended · ≥90% green · ≥75% amber · &lt;75% red</span>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {/* City selector */}
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">City</div>
            <div className="flex overflow-hidden rounded-xl border border-white/10">
              {(["dubai", "manila"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCity(c)}
                  className={`border-r border-white/10 px-4 py-2 text-sm font-medium capitalize transition last:border-r-0 ${
                    city === c
                      ? "bg-emerald-400/20 text-emerald-300"
                      : "text-zinc-400 hover:text-white"
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
                ? "border-emerald-400/40 bg-emerald-400/20 text-emerald-300 hover:bg-emerald-400/30"
                : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/20 hover:text-white"
            } disabled:opacity-50`}
          >
            {loading && <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className={KPI_CARD + " col-span-1"}>
            <div className={KPI_LABEL}>Overall Adherence</div>
            <div className={`text-2xl font-bold ${adherenceColor(overallRate)}`}>
              {overallRate.toFixed(1)}%
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-all ${overallRate >= 90 ? "bg-emerald-500" : overallRate >= 75 ? "bg-amber-500" : "bg-red-500"}`}
                style={{ width: `${Math.min(overallRate, 100)}%` }}
              />
            </div>
          </div>
          <KpiCard label="Scheduled Shifts" value={totalScheduled} />
          <KpiCard label="Attended" value={totalAttended} sub={`${((totalAttended/Math.max(totalScheduled,1))*100).toFixed(1)}%`} />
          <KpiCard label="No Shows" value={totalNoShow} sub={`${((totalNoShow/Math.max(totalScheduled,1))*100).toFixed(1)}%`} />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {/* Sub-tabs */}
      <div className={TAB_CONTAINER}>
        {subTabs.map((t) => (
          <button key={t.key} type="button" onClick={() => setView(t.key)}
            className={`${view === t.key ? TAB_ACTIVE : TAB_INACTIVE} flex items-center gap-1.5`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {loading && <div className="py-6 text-center text-sm text-zinc-500">Loading…</div>}

      {/* ── BY BRANCH ── */}
      {!loading && view === "branch" && (
        <div className={GLASS_CARD + " overflow-x-auto p-0"}>
          {branchRows.length === 0 ? (
            <div className="p-6 text-center text-sm text-zinc-500">No scheduled shift data in this period.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/8">
                  <th className={`${TABLE_HEADER} px-4 py-3 text-left`}>Branch</th>
                  <th className={`${TABLE_HEADER} px-4 py-3 text-right`}>Staff</th>
                  <th className={`${TABLE_HEADER} px-4 py-3 text-right`}>Scheduled</th>
                  <th className={`${TABLE_HEADER} px-4 py-3 text-right`}>Attended</th>
                  <th className={`${TABLE_HEADER} px-4 py-3 text-right`}>No Shows</th>
                  <th className={`${TABLE_HEADER} px-4 py-3 text-left`}>Adherence</th>
                </tr>
              </thead>
              <tbody>
                {branchRows.map((r) => (
                  <tr key={r.branch_code} className={TABLE_ROW}>
                    <td className={`${TABLE_CELL} px-4 font-medium`}>{r.branch_code || "—"}</td>
                    <td className={`${TABLE_CELL} px-4 text-right tabular-nums`}>{r.staff_count}</td>
                    <td className={`${TABLE_CELL} px-4 text-right tabular-nums`}>{r.scheduled_shifts}</td>
                    <td className={`${TABLE_CELL} px-4 text-right tabular-nums text-emerald-400`}>{r.attended_shifts}</td>
                    <td className={`${TABLE_CELL} px-4 text-right tabular-nums ${r.no_show_count > 0 ? "text-red-400" : "text-zinc-500"}`}>
                      {r.no_show_count}
                    </td>
                    <td className={`${TABLE_CELL} px-4`}>
                      <AdherenceBar rate={r.adherence_rate} />
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
          {staffRows.length > 0 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search staff or branch…"
                value={staffSearch}
                onChange={(e) => setStaffSearch(e.target.value)}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-900 py-2 pl-9 pr-3 text-sm text-white placeholder-zinc-600 focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
              />
            </div>
          )}

          {filteredStaff.length === 0 && (
            <div className={GLASS_CARD + " p-6 text-center text-sm text-zinc-500"}>
              {staffRows.length === 0 ? "No scheduled shift data for this period." : "No matches found."}
            </div>
          )}

          {filteredStaff.map((r, idx) => {
            const isExpanded = expandedStaff === r.staff_name;
            const detail = staffDetail[r.staff_name] || [];
            return (
              <div
                key={`${r.staff_name}-${idx}`}
                className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] transition-colors hover:border-emerald-500/20"
              >
                <button
                  type="button"
                  onClick={() => toggleStaffDetail(r.staff_name)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <span className="shrink-0 text-zinc-500">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-white">{r.staff_name}</div>
                    <div className="text-[11px] text-zinc-500">{r.branch_code || "—"}</div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
                    <AdherenceBadge rate={r.adherence_rate} />
                    <span className="text-[11px] text-zinc-500">
                      {r.attended_shifts}/{r.scheduled_shifts} shifts
                      {r.no_show_count > 0 && (
                        <span className="ml-1 text-red-400">· {r.no_show_count} no-show</span>
                      )}
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
                              <th className={`${TABLE_HEADER} px-4 py-2 text-left`}>Status</th>
                              <th className={`${TABLE_HEADER} px-4 py-2 text-right`}>Scheduled</th>
                              <th className={`${TABLE_HEADER} px-4 py-2 text-right`}>Actual</th>
                              <th className={`${TABLE_HEADER} px-4 py-2 text-left`}>Branch</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.map((d) => (
                              <tr key={d.date} className="border-t border-white/5 hover:bg-white/5">
                                <td className="px-4 py-2.5 text-xs font-medium text-zinc-300">{d.date}</td>
                                <td className="px-4 py-2.5">
                                  <StatusBadge status={d.status} />
                                  {d.missing_check_in && (
                                    <span className="ml-1 text-[10px] text-amber-500">no check-in</span>
                                  )}
                                  {d.missing_check_out && (
                                    <span className="ml-1 text-[10px] text-amber-500">no check-out</span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-right text-xs tabular-nums text-zinc-400">
                                  {d.scheduled_minutes > 0 ? fmtMins(d.scheduled_minutes) : "—"}
                                </td>
                                <td className={`px-4 py-2.5 text-right text-xs tabular-nums ${d.actual_minutes > 0 ? "text-emerald-400" : "text-zinc-600"}`}>
                                  {d.actual_minutes > 0 ? fmtMins(d.actual_minutes) : "—"}
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
