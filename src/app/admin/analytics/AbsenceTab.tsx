"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ChevronDown, ChevronRight, AlertTriangle,
  Users, Building2, Search, CalendarX, Calendar, CalendarDays,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { apiGet, qs } from "@/lib/api";
import DateRangePicker from "@/components/DateRangePicker";
import SelectDark from "@/components/SelectDark";
import {
  GLASS_CARD, KPI_CARD, KPI_LABEL, KPI_VALUE,
  TABLE_HEADER, TABLE_ROW, TABLE_CELL,
  TAB_CONTAINER, TAB_ACTIVE, TAB_INACTIVE,
} from "@/lib/ui-tokens";

// ─── Types ────────────────────────────────────────────────────────────────────
type AbsenceBranchRow  = { branch_code: string; incidents: number; staff_count: number; absent_days: number };
type AbsenceStaffRow   = { staff_name: string; branch_code: string; absent_days: number; absence_types: string[] };
type AbsenceDetailRow  = { date: string; absence_type: string; note: string; branch_code: string };

type DayRow = {
  branch_code: string; staff_name: string; role: string;
  start_hour: number; status: string; late_minutes: number | null; check_in_at: string | null;
};
type DaySummary = { on_time: number; late: number; no_show: number; not_checked_in: number; pending: number };
type DayResult = { ok: boolean; date: string; city: string; summary: DaySummary; rows: DayRow[] };

type RangeDailyRow = { date: string; on_time: number; late: number; no_show: number; not_checked_in: number; pending: number; total: number };
type RangeStaffRow = { staff_name: string; branch_code: string; on_time: number; late: number; no_show: number; not_checked_in: number; total_days: number; late_minutes_total: number };
type RangeResult = { ok: boolean; date_from: string; date_to: string; city: string; daily: RangeDailyRow[]; by_staff: RangeStaffRow[] };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isoFirstOfMonth(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function isoLastOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}
function isoWeekStart(d: Date) {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d); mon.setDate(d.getDate() + diff);
  return mon.toISOString().slice(0, 10);
}
function isoWeekEnd(weekStart: string) {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}
function isoYesterday() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
function fmtShortDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function fmtShiftHour(h: number) {
  const base = Math.floor(h) % 24;
  const mins = Math.round((h % 1) * 60);
  const period = base >= 12 ? "PM" : "AM";
  const disp = Math.floor(base) % 12 || 12;
  return `${disp}:${String(mins).padStart(2, "0")} ${period}`;
}
function absenceStyle(type: string): { badge: string; bar: string } {
  const t = (type || "").toLowerCase();
  if (t.includes("sick") || t.includes("medical") || t.includes("ill"))
    return { badge: "bg-blue-500/20 text-blue-300 border-blue-500/30", bar: "#60a5fa" };
  if (t.includes("unpaid") || t.includes("unexcused") || t.includes("no show"))
    return { badge: "bg-red-500/20 text-red-300 border-red-500/30", bar: "#f87171" };
  if (t.includes("annual") || t.includes("vacation") || t.includes("leave"))
    return { badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", bar: "#34d399" };
  return { badge: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30", bar: "#a1a1aa" };
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  ON_TIME:        { label: "On Time",         cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  LATE:           { label: "Late",             cls: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  NO_SHOW:        { label: "No Show",          cls: "bg-red-500/20 text-red-300 border-red-500/30" },
  NOT_CHECKED_IN: { label: "Not Checked In",   cls: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30" },
  PENDING:        { label: "Pending",          cls: "bg-zinc-600/20 text-zinc-400 border-zinc-600/30" },
};

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] || { label: status, cls: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30" };
  return <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${m.cls}`}>{m.label}</span>;
}

function AbsenceTypeBadge({ type }: { type: string }) {
  const { badge } = absenceStyle(type);
  return <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${badge}`}>{type || "—"}</span>;
}

function KpiCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className={`${KPI_CARD} relative overflow-hidden`}>
      {accent && <div className={`absolute inset-x-0 top-0 h-0.5 ${accent}`} />}
      <div className={KPI_LABEL}>{label}</div>
      <div className={`${KPI_VALUE} text-xl mt-2`}>{value}</div>
      {sub && <div className="mt-1 text-[11px] text-zinc-500">{sub}</div>}
    </div>
  );
}

function InlineBar({ value, max, color = "#f87171" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-20 rounded-full bg-white/8 overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: {value:number;name:string;fill:string}[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/95 px-3 py-2 text-xs shadow-2xl">
      <p className="text-zinc-300 font-medium mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="font-semibold" style={{ color: p.fill }}>{p.name}: {p.value}</p>
      ))}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AbsenceTab({
  city: defaultCity, dateFrom: defaultFrom, dateTo: defaultTo, approverName, pin,
}: { city: string; dateFrom: string; dateTo: string; approverName: string; pin: string }) {
  const now = new Date();
  const [city, setCity]               = useState(defaultCity || "dubai");
  const [draftRange, setDraftRange]   = useState({ from: defaultFrom || isoFirstOfMonth(now), to: defaultTo || isoLastOfMonth(now) });
  const [appliedFrom, setAppliedFrom] = useState(defaultFrom || isoFirstOfMonth(now));
  const [appliedTo, setAppliedTo]     = useState(defaultTo || isoLastOfMonth(now));
  const [view, setView]               = useState<"branch" | "staff" | "day" | "week" | "month">("branch");

  // Branch / Staff view state
  const [branchRows, setBranchRows]   = useState<AbsenceBranchRow[]>([]);
  const [staffRows, setStaffRows]     = useState<AbsenceStaffRow[]>([]);
  const [staffSearch, setStaffSearch] = useState("");
  const [expandedStaff, setExpandedStaff] = useState<string | null>(null);
  const [staffDetail, setStaffDetail] = useState<Record<string, AbsenceDetailRow[]>>({});
  const [detailLoading, setDetailLoading] = useState(false);

  // Day view state
  const [dayDate, setDayDate]         = useState(isoYesterday());
  const [dayResult, setDayResult]     = useState<DayResult | null>(null);
  const [dayFilter, setDayFilter]     = useState<"all" | "issues">("issues");
  const [daySearch, setDaySearch]     = useState("");

  // Week / Month view state
  const [weekStart, setWeekStart]     = useState(isoWeekStart(now));
  const [monthYear, setMonthYear]     = useState(now.getFullYear());
  const [monthMonth, setMonthMonth]   = useState(now.getMonth() + 1);
  const [rangeResult, setRangeResult] = useState<RangeResult | null>(null);
  const [staffRangeSearch, setStaffRangeSearch] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const baseParams = useMemo(() => ({ city, date_from: appliedFrom, date_to: appliedTo, approver_name: approverName, pin }), [city, appliedFrom, appliedTo, approverName, pin]);

  const loadBranch = useCallback(async (p: typeof baseParams) => {
    setLoading(true); setError("");
    try { const r = await apiGet<{ok:boolean;rows:AbsenceBranchRow[]}>(`/api/admin/analytics/absence/by_branch${qs(p)}`); setBranchRows(r.rows || []); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);

  const loadStaff = useCallback(async (p: typeof baseParams) => {
    setLoading(true); setError("");
    try {
      const r = await apiGet<{ok:boolean;rows:AbsenceStaffRow[]}>(`/api/admin/analytics/absence/by_staff${qs(p)}`);
      setStaffRows(r.rows || []); setExpandedStaff(null); setStaffDetail({});
    }
    catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);

  const loadDay = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await apiGet<DayResult>(`/api/admin/analytics/absence/by_day${qs({ city, work_date: dayDate, approver_name: approverName, pin })}`);
      setDayResult(r);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [city, dayDate, approverName, pin]);

  const loadWeek = useCallback(async () => {
    setLoading(true); setError(""); setRangeResult(null); setStaffRangeSearch("");
    try {
      const wEnd = isoWeekEnd(weekStart);
      const r = await apiGet<RangeResult>(`/api/admin/analytics/absence/by_range${qs({ city, date_from: weekStart, date_to: wEnd, approver_name: approverName, pin })}`);
      setRangeResult(r);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [city, weekStart, approverName, pin]);

  const loadMonth = useCallback(async () => {
    setLoading(true); setError(""); setRangeResult(null); setStaffRangeSearch("");
    try {
      const mFrom = `${monthYear}-${String(monthMonth).padStart(2, "0")}-01`;
      const mTo   = new Date(monthYear, monthMonth, 0).toISOString().slice(0, 10);
      const r = await apiGet<RangeResult>(`/api/admin/analytics/absence/by_range${qs({ city, date_from: mFrom, date_to: mTo, approver_name: approverName, pin })}`);
      setRangeResult(r);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [city, monthYear, monthMonth, approverName, pin]);

  useEffect(() => {
    if (view === "branch") void loadBranch(baseParams);
    if (view === "staff")  void loadStaff(baseParams);
    if (view === "day")    void loadDay();
    if (view === "week")   void loadWeek();
    if (view === "month")  void loadMonth();
  }, [view, baseParams, loadBranch, loadStaff, loadDay, loadWeek, loadMonth]);

  function applyRange() {
    if (!draftRange.from || !draftRange.to) return;
    setAppliedFrom(draftRange.from); setAppliedTo(draftRange.to);
  }

  async function toggleStaffDetail(name: string) {
    if (expandedStaff === name) { setExpandedStaff(null); return; }
    setExpandedStaff(name);
    if (staffDetail[name]) return;
    setDetailLoading(true);
    try {
      const r = await apiGet<{ok:boolean;rows:AbsenceDetailRow[]}>(`/api/admin/analytics/absence/staff_detail${qs({ ...baseParams, staff_name: name })}`);
      setStaffDetail((prev) => ({ ...prev, [name]: r.rows || [] }));
    } catch { /* ignore */ } finally { setDetailLoading(false); }
  }

  const filteredStaff = staffRows.filter((r) => !staffSearch || r.staff_name.toLowerCase().includes(staffSearch.toLowerCase()) || r.branch_code.toLowerCase().includes(staffSearch.toLowerCase()));
  const rangeChanged  = draftRange.from !== appliedFrom || draftRange.to !== appliedTo;

  const totalIncidents  = branchRows.reduce((s, r) => s + r.incidents, 0);
  const totalStaff      = branchRows.reduce((s, r) => s + r.staff_count, 0);
  const totalAbsentDays = branchRows.reduce((s, r) => s + r.absent_days, 0);

  const branchChartData = branchRows
    .sort((a, b) => b.absent_days - a.absent_days)
    .slice(0, 8)
    .map((r) => ({ name: r.branch_code, days: r.absent_days }));

  const maxBranchDays = Math.max(...branchRows.map((r) => r.absent_days), 1);
  const maxStaffDays  = Math.max(...staffRows.map((r) => r.absent_days), 1);

  const isOsView = view === "day" || view === "week" || view === "month";

  const filteredDayRows = (dayResult?.rows || []).filter((r) => {
    const matchFilter = dayFilter === "all" || r.status === "LATE" || r.status === "NO_SHOW" || r.status === "NOT_CHECKED_IN";
    const matchSearch = !daySearch || r.staff_name.toLowerCase().includes(daySearch.toLowerCase()) || r.branch_code.toLowerCase().includes(daySearch.toLowerCase());
    return matchFilter && matchSearch;
  });

  const rangeChartData = (rangeResult?.daily || []).map((d) => ({
    name: fmtShortDate(d.date).replace(/^[A-Z][a-z]+, /, ""),
    late: d.late,
    no_show: d.no_show,
  }));

  const filteredRangeStaff = (rangeResult?.by_staff || []).filter((r) =>
    (r.late > 0 || r.no_show > 0 || r.not_checked_in > 0) &&
    (!staffRangeSearch || r.staff_name.toLowerCase().includes(staffRangeSearch.toLowerCase()) || r.branch_code.toLowerCase().includes(staffRangeSearch.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className={`${GLASS_CARD} p-4 space-y-3`}>
        <div className="flex items-center gap-2">
          <CalendarX className="h-4 w-4 text-rose-400 shrink-0" />
          <span className="text-sm font-semibold text-white">Absence Analysis</span>
          <span className="text-xs text-zinc-500">
            {isOsView ? "OS attendance clock-in data" : "Absences recorded in Bayzat · all types included"}
          </span>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {/* City toggle */}
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">City</div>
            <div className="flex rounded-xl border border-white/10 overflow-hidden">
              {(["dubai", "manila"] as const).map((c) => (
                <button key={c} type="button" onClick={() => setCity(c)}
                  className={`px-4 py-2 text-sm font-medium capitalize transition border-r border-white/10 last:border-r-0 ${city === c ? "bg-rose-400/20 text-rose-300" : "text-zinc-400 hover:text-white"}`}>
                  {c === "dubai" ? "Dubai" : "Manila"}
                </button>
              ))}
            </div>
          </div>

          {/* Date range for branch/staff views */}
          {!isOsView && (
            <>
              <div className="min-w-[260px] flex-1">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Period</div>
                <DateRangePicker value={draftRange} onChange={setDraftRange} />
              </div>
              <button type="button" onClick={applyRange} disabled={loading || !draftRange.from || !draftRange.to}
                className={`flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${rangeChanged ? "border-rose-400/40 bg-rose-400/20 text-rose-300 hover:bg-rose-400/30" : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/20 hover:text-white"} disabled:opacity-50`}>
                {loading && <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
                {rangeChanged ? "Apply" : "Reload"}
              </button>
            </>
          )}

          {/* Day picker */}
          {view === "day" && (
            <>
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Date</div>
                <input type="date" value={dayDate} onChange={(e) => setDayDate(e.target.value)}
                  className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-rose-500/40 focus:outline-none" />
              </div>
              <button type="button" onClick={loadDay} disabled={loading}
                className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-400 hover:border-white/20 hover:text-white transition disabled:opacity-50 self-end">
                {loading && <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
                Load
              </button>
            </>
          )}

          {/* Week picker */}
          {view === "week" && (
            <>
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Week Starting (Mon)</div>
                <input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)}
                  className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-rose-500/40 focus:outline-none" />
              </div>
              <button type="button" onClick={loadWeek} disabled={loading}
                className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-400 hover:border-white/20 hover:text-white transition disabled:opacity-50 self-end">
                {loading && <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
                Load
              </button>
            </>
          )}

          {/* Month picker */}
          {view === "month" && (
            <>
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Month</div>
                <div className="flex gap-2">
                  <SelectDark
                    value={String(monthYear)}
                    onChange={v => setMonthYear(Number(v))}
                    className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-rose-500/40 focus:outline-none"
                    options={[now.getFullYear() - 1, now.getFullYear()].map((y) => ({ value: String(y), label: String(y) }))}
                  />
                  <SelectDark
                    value={String(monthMonth)}
                    onChange={v => setMonthMonth(Number(v))}
                    className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-rose-500/40 focus:outline-none"
                    options={["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => ({ value: String(i + 1), label: m }))}
                  />
                </div>
              </div>
              <button type="button" onClick={loadMonth} disabled={loading}
                className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-400 hover:border-white/20 hover:text-white transition disabled:opacity-50 self-end">
                {loading && <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
                Load
              </button>
            </>
          )}
        </div>

        {!isOsView && (
          <div className="text-[11px] text-zinc-600">
            Showing: <span className="text-zinc-400 font-medium">{appliedFrom}</span> → <span className="text-zinc-400 font-medium">{appliedTo}</span>
            <span className="ml-2 capitalize text-zinc-500">· {city}</span>
          </div>
        )}
      </div>

      {/* KPI cards for branch view */}
      {!loading && view === "branch" && branchRows.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <KpiCard label="Total Absences" value={totalIncidents} sub="all records" accent="bg-rose-500" />
          <KpiCard label="Staff Affected" value={totalStaff} accent="bg-orange-500" />
          <KpiCard label="Absent Days" value={totalAbsentDays} sub="unique dates" accent="bg-red-600" />
        </div>
      )}

      {/* KPI cards for day view */}
      {!loading && view === "day" && dayResult && (
        <div className="grid grid-cols-5 gap-3">
          <KpiCard label="On Time"         value={dayResult.summary.on_time}         accent="bg-emerald-500" />
          <KpiCard label="Late"            value={dayResult.summary.late}            accent="bg-amber-500" />
          <KpiCard label="No Show"         value={dayResult.summary.no_show}         accent="bg-red-500" />
          <KpiCard label="Not Checked In"  value={dayResult.summary.not_checked_in}  accent="bg-zinc-500" />
          <KpiCard label="Total Scheduled" value={(dayResult.rows || []).length}     sub="published shifts" />
        </div>
      )}

      {/* KPI cards for range views */}
      {!loading && (view === "week" || view === "month") && rangeResult && (() => {
        const totLate    = rangeResult.daily.reduce((s, d) => s + d.late, 0);
        const totNoShow  = rangeResult.daily.reduce((s, d) => s + d.no_show, 0);
        const totSched   = rangeResult.daily.reduce((s, d) => s + d.total, 0);
        const issueStaff = rangeResult.by_staff.filter((s) => s.late > 0 || s.no_show > 0).length;
        return (
          <div className="grid grid-cols-4 gap-3">
            <KpiCard label="Total Scheduled" value={totSched}   sub="scheduled shifts" />
            <KpiCard label="Late"            value={totLate}    accent="bg-amber-500" />
            <KpiCard label="No Show"         value={totNoShow}  accent="bg-red-500" />
            <KpiCard label="Staff w/ Issues" value={issueStaff} accent="bg-rose-500" />
          </div>
        );
      })()}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {/* Sub-tabs */}
      <div className={TAB_CONTAINER}>
        {([
          { key: "branch" as const, label: "By Branch", icon: <Building2 className="h-3.5 w-3.5" /> },
          { key: "staff"  as const, label: "By Staff",  icon: <Users className="h-3.5 w-3.5" /> },
          { key: "day"    as const, label: "By Day",    icon: <CalendarX className="h-3.5 w-3.5" /> },
          { key: "week"   as const, label: "By Week",   icon: <Calendar className="h-3.5 w-3.5" /> },
          { key: "month"  as const, label: "By Month",  icon: <CalendarDays className="h-3.5 w-3.5" /> },
        ]).map((t) => (
          <button key={t.key} type="button" onClick={() => setView(t.key)}
            className={`${view === t.key ? TAB_ACTIVE : TAB_INACTIVE} flex items-center gap-1.5`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {loading && <div className="py-8 text-center text-sm text-zinc-500">Loading…</div>}

      {/* ── BY BRANCH ── */}
      {!loading && view === "branch" && (
        <div className="space-y-4">
          {branchChartData.length > 0 && (
            <div className={`${GLASS_CARD} p-4`}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Absent Days by Branch</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={branchChartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} width={32} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="days" radius={[4, 4, 0, 0]} fill="#f87171" fillOpacity={0.8} name="Absent Days" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className={`${GLASS_CARD} overflow-x-auto p-0`}>
            {branchRows.length === 0 ? (
              <div className="p-6 text-center text-sm text-zinc-500">No absence records in this period.</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/8">
                    <th className={`${TABLE_HEADER} px-4 py-3 text-left`}>Branch</th>
                    <th className={`${TABLE_HEADER} px-4 py-3 text-right`}>Records</th>
                    <th className={`${TABLE_HEADER} px-4 py-3 text-right`}>Staff</th>
                    <th className={`${TABLE_HEADER} px-4 py-3 text-left`}>Absent Days</th>
                  </tr>
                </thead>
                <tbody>
                  {branchRows.sort((a, b) => b.absent_days - a.absent_days).map((r) => (
                    <tr key={r.branch_code} className={TABLE_ROW}>
                      <td className={`${TABLE_CELL} px-4 font-medium`}>{r.branch_code || "—"}</td>
                      <td className={`${TABLE_CELL} px-4 text-right tabular-nums`}>{r.incidents}</td>
                      <td className={`${TABLE_CELL} px-4 text-right tabular-nums`}>{r.staff_count}</td>
                      <td className={`${TABLE_CELL} px-4`}>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold tabular-nums text-rose-300 w-6">{r.absent_days}</span>
                          <InlineBar value={r.absent_days} max={maxBranchDays} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── BY STAFF ── */}
      {!loading && view === "staff" && (
        <div className="space-y-2">
          {staffRows.length > 0 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <input type="text" placeholder="Search staff or branch…" value={staffSearch} onChange={(e) => setStaffSearch(e.target.value)}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-900 py-2 pl-9 pr-3 text-sm text-white placeholder-zinc-600 focus:border-rose-500/40 focus:outline-none focus:ring-1 focus:ring-rose-500/20" />
            </div>
          )}
          {filteredStaff.length === 0 && (
            <div className={`${GLASS_CARD} p-6 text-center text-sm text-zinc-500`}>
              {staffRows.length === 0 ? "No absence records for this period." : "No matches found."}
            </div>
          )}
          {filteredStaff.sort((a, b) => b.absent_days - a.absent_days).map((r, idx) => {
            const isExpanded = expandedStaff === r.staff_name;
            const detail = staffDetail[r.staff_name] || [];
            const dominantType = (r.absence_types || [])[0] || "";
            const { bar } = absenceStyle(dominantType);
            return (
              <div key={`${r.staff_name}-${idx}`}
                className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] transition-colors hover:border-rose-500/20">
                <button type="button" onClick={() => toggleStaffDetail(r.staff_name)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left">
                  <span className="shrink-0 w-6 text-center text-[11px] font-bold tabular-nums text-zinc-600">
                    {idx < 3 ? ["🥇","🥈","🥉"][idx] : `#${idx + 1}`}
                  </span>
                  <span className="text-zinc-500 shrink-0">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-white">{r.staff_name}</div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="text-[11px] text-zinc-500">{r.branch_code || "—"}</span>
                      <InlineBar value={r.absent_days} max={maxStaffDays} color={bar} />
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    <span className="rounded-lg border border-rose-500/30 bg-rose-500/20 px-2.5 py-0.5 text-xs font-bold text-rose-300">
                      {r.absent_days}d
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {(r.absence_types || []).slice(0, 2).map((t) => <AbsenceTypeBadge key={t} type={t} />)}
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
                              {["Date","Type","Note","Branch"].map((h) => (
                                <th key={h} className={`${TABLE_HEADER} px-4 py-2 text-left`}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {detail.map((d, di) => (
                              <tr key={`${d.date}-${di}`} className="border-t border-white/5 hover:bg-white/5">
                                <td className="px-4 py-2.5 text-xs font-medium text-zinc-300 whitespace-nowrap">{d.date}</td>
                                <td className="px-4 py-2.5"><AbsenceTypeBadge type={d.absence_type} /></td>
                                <td className="px-4 py-2.5 text-xs text-zinc-500 max-w-[200px] truncate">{d.note || "—"}</td>
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

      {/* ── BY DAY ── */}
      {!loading && view === "day" && (
        <div className="space-y-3">
          {dayResult ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex rounded-xl border border-white/10 overflow-hidden">
                  {([
                    { key: "issues" as const, label: "Issues Only" },
                    { key: "all"    as const, label: "All Staff" },
                  ]).map((f) => (
                    <button key={f.key} type="button" onClick={() => setDayFilter(f.key)}
                      className={`px-4 py-2 text-sm font-medium transition border-r border-white/10 last:border-r-0 ${dayFilter === f.key ? "bg-rose-400/20 text-rose-300" : "text-zinc-400 hover:text-white"}`}>
                      {f.label}
                    </button>
                  ))}
                </div>
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                  <input type="text" placeholder="Search staff or branch…" value={daySearch} onChange={(e) => setDaySearch(e.target.value)}
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-900 py-2 pl-9 pr-3 text-sm text-white placeholder-zinc-600 focus:border-rose-500/40 focus:outline-none" />
                </div>
                <span className="text-xs text-zinc-500">{filteredDayRows.length} shown</span>
              </div>

              <div className={`${GLASS_CARD} overflow-x-auto p-0`}>
                {filteredDayRows.length === 0 ? (
                  <div className="p-6 text-center text-sm text-zinc-500">No records for this date.</div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/8">
                        <th className={`${TABLE_HEADER} px-4 py-3 text-left`}>Branch</th>
                        <th className={`${TABLE_HEADER} px-4 py-3 text-left`}>Staff</th>
                        <th className={`${TABLE_HEADER} px-4 py-3 text-left`}>Shift Start</th>
                        <th className={`${TABLE_HEADER} px-4 py-3 text-left`}>Status</th>
                        <th className={`${TABLE_HEADER} px-4 py-3 text-right`}>Late By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDayRows
                        .sort((a, b) => {
                          const ord: Record<string,number> = { NO_SHOW: 0, LATE: 1, NOT_CHECKED_IN: 2, ON_TIME: 3, PENDING: 4 };
                          return (ord[a.status] ?? 5) - (ord[b.status] ?? 5);
                        })
                        .map((r, i) => (
                          <tr key={`${r.staff_name}-${i}`} className={TABLE_ROW}>
                            <td className={`${TABLE_CELL} px-4 text-zinc-400`}>{r.branch_code || "—"}</td>
                            <td className={`${TABLE_CELL} px-4 font-medium text-white`}>{r.staff_name}</td>
                            <td className={`${TABLE_CELL} px-4 tabular-nums text-zinc-400`}>{fmtShiftHour(r.start_hour)}</td>
                            <td className={`${TABLE_CELL} px-4`}><StatusBadge status={r.status} /></td>
                            <td className={`${TABLE_CELL} px-4 text-right tabular-nums`}>
                              {r.late_minutes != null && r.late_minutes > 0
                                ? <span className="text-amber-300 font-semibold">+{r.late_minutes}m</span>
                                : <span className="text-zinc-600">—</span>
                              }
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : (
            <div className={`${GLASS_CARD} p-6 text-center text-sm text-zinc-500`}>Select a date and click Load.</div>
          )}
        </div>
      )}

      {/* ── BY WEEK / BY MONTH ── */}
      {!loading && (view === "week" || view === "month") && (
        <div className="space-y-4">
          {rangeResult ? (
            <>
              {rangeChartData.length > 0 && (
                <div className={`${GLASS_CARD} p-4`}>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Late &amp; No Show — {view === "week" ? "Daily Breakdown" : "Daily Trend"}
                  </p>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={rangeChartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                      <XAxis dataKey="name" tick={{ fill: "#71717a", fontSize: view === "month" ? 9 : 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="late"    stackId="a" fill="#fbbf24" fillOpacity={0.8} name="Late" />
                      <Bar dataKey="no_show" stackId="a" radius={[4, 4, 0, 0]} fill="#f87171" fillOpacity={0.8} name="No Show" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className={`${GLASS_CARD} overflow-x-auto p-0`}>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/8">
                      <th className={`${TABLE_HEADER} px-4 py-3 text-left`}>Date</th>
                      <th className={`${TABLE_HEADER} px-4 py-3 text-right`}>Scheduled</th>
                      <th className={`${TABLE_HEADER} px-4 py-3 text-right`}>On Time</th>
                      <th className={`${TABLE_HEADER} px-4 py-3 text-right`}>Late</th>
                      <th className={`${TABLE_HEADER} px-4 py-3 text-right`}>No Show</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rangeResult.daily.map((d) => (
                      <tr key={d.date} className={TABLE_ROW}>
                        <td className={`${TABLE_CELL} px-4 font-medium`}>{fmtShortDate(d.date)}</td>
                        <td className={`${TABLE_CELL} px-4 text-right tabular-nums text-zinc-400`}>{d.total}</td>
                        <td className={`${TABLE_CELL} px-4 text-right tabular-nums text-emerald-400`}>{d.on_time}</td>
                        <td className={`${TABLE_CELL} px-4 text-right tabular-nums`}>
                          {d.late > 0
                            ? <span className="font-semibold text-amber-300">{d.late}</span>
                            : <span className="text-zinc-600">0</span>}
                        </td>
                        <td className={`${TABLE_CELL} px-4 text-right tabular-nums`}>
                          {d.no_show > 0
                            ? <span className="font-semibold text-rose-300">{d.no_show}</span>
                            : <span className="text-zinc-600">0</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Staff with Issues</p>
                  <div className="relative flex-1 max-w-[300px]">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                    <input type="text" placeholder="Search staff…" value={staffRangeSearch} onChange={(e) => setStaffRangeSearch(e.target.value)}
                      className="w-full rounded-xl border border-neutral-700 bg-neutral-900 py-1.5 pl-9 pr-3 text-sm text-white placeholder-zinc-600 focus:border-rose-500/40 focus:outline-none" />
                  </div>
                </div>
                {filteredRangeStaff.length === 0 ? (
                  <div className={`${GLASS_CARD} p-6 text-center text-sm text-zinc-500`}>No issues found for this period.</div>
                ) : (
                  <div className={`${GLASS_CARD} overflow-x-auto p-0`}>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/8">
                          <th className={`${TABLE_HEADER} px-4 py-3 text-left`}>#</th>
                          <th className={`${TABLE_HEADER} px-4 py-3 text-left`}>Staff</th>
                          <th className={`${TABLE_HEADER} px-4 py-3 text-left`}>Branch</th>
                          <th className={`${TABLE_HEADER} px-4 py-3 text-right`}>Late</th>
                          <th className={`${TABLE_HEADER} px-4 py-3 text-right`}>No Show</th>
                          <th className={`${TABLE_HEADER} px-4 py-3 text-right`}>Scheduled</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRangeStaff.map((r, idx) => (
                          <tr key={r.staff_name} className={TABLE_ROW}>
                            <td className={`${TABLE_CELL} px-4 text-zinc-600 text-xs tabular-nums`}>#{idx + 1}</td>
                            <td className={`${TABLE_CELL} px-4 font-medium text-white`}>{r.staff_name}</td>
                            <td className={`${TABLE_CELL} px-4 text-zinc-400 text-sm`}>{r.branch_code || "—"}</td>
                            <td className={`${TABLE_CELL} px-4 text-right tabular-nums`}>
                              {r.late > 0
                                ? <span className="font-semibold text-amber-300">{r.late}</span>
                                : <span className="text-zinc-600">0</span>}
                            </td>
                            <td className={`${TABLE_CELL} px-4 text-right tabular-nums`}>
                              {r.no_show > 0
                                ? <span className="font-semibold text-rose-300">{r.no_show}</span>
                                : <span className="text-zinc-600">0</span>}
                            </td>
                            <td className={`${TABLE_CELL} px-4 text-right tabular-nums text-zinc-500`}>{r.total_days}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className={`${GLASS_CARD} p-6 text-center text-sm text-zinc-500`}>
              Select a {view === "week" ? "week" : "month"} and click Load.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
