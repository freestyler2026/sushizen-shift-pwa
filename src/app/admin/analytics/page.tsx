// src/app/admin/analytics/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getAuth } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";
const LOGO_SRC = "/logo.png";

async function apiGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  const text = await res.text();

  if (!res.ok) {
    try {
      const j = JSON.parse(text);
      throw new Error(j?.detail || text || `GET ${path} failed`);
    } catch {
      throw new Error(text || `GET ${path} failed`);
    }
  }

  return text ? (JSON.parse(text) as T) : ({} as T);
}

type BranchDailyRow = {
  work_date: string;
  branch_code: string;
  total_hours: number;
  staff_count: number;
  segment_count: number;
};

type BranchWeekdayRow = {
  branch_code: string;
  weekday: number;
  avg_hours: number;
  avg_staff_count: number;
  day_count: number;
};

type StaffSummaryRow = {
  staff_name: string;
  total_hours: number;
  worked_days: number;
  segment_count: number;
};

type AbsenceSummaryRow = {
  absence_type: string;
  row_count: number;
  staff_count: number;
  day_count: number;
};

type BranchDailyResp = { ok: boolean; rows: BranchDailyRow[] };
type BranchWeekdayResp = { ok: boolean; rows: BranchWeekdayRow[] };
type StaffSummaryResp = { ok: boolean; rows: StaffSummaryRow[] };
type AbsenceSummaryResp = { ok: boolean; rows: AbsenceSummaryRow[] };

type CitySummaryResp = {
  ok: boolean;
  city: string;
  date_from: string;
  date_to: string;
  total_hours: number;
  day_count: number;
  branch_count: number;
  avg_hours_per_day: number;
  top_branch: string;
  top_branch_hours: number;
  top_absence_type: string;
  top_absence_rows: number;
};

type AttendanceOverview = {
  scheduled_minutes?: number;
  actual_minutes?: number;
  late_minutes?: number;
  early_leave_minutes?: number;
  overtime_minutes?: number;
  no_show_count?: number;
  missing_check_in_count?: number;
  missing_check_out_count?: number;
  branch_mismatch_count?: number;
};

type AttendanceBranchSummary = {
  branch_code?: string | null;
  scheduled_minutes?: number | null;
  actual_minutes?: number | null;
  late_minutes?: number | null;
  overtime_minutes?: number | null;
  issue_count?: number | null;
};

type AttendanceStaffIssue = {
  staff_name?: string | null;
  city?: string | null;
  late_minutes?: number | null;
  early_leave_minutes?: number | null;
  overtime_minutes?: number | null;
  issue_count?: number | null;
};

type AttendanceAnalyticsResp = {
  overview?: AttendanceOverview;
  branch_summary?: AttendanceBranchSummary[];
  staff_issues?: AttendanceStaffIssue[];
};

const BRANCH_OPTIONS: Record<string, { value: string; label: string }[]> = {
  dubai: [
    { value: "", label: "All Branches" },
    { value: "BB", label: "Business Bay" },
    { value: "JLT", label: "JLT" },
    { value: "ARJ", label: "Arjan" },
    { value: "AM", label: "Al Mina" },
    { value: "AB", label: "Al Barsha" },
    { value: "CK", label: "Central Kitchen" },
    { value: "DRIVER", label: "Driver" },
    { value: "SH", label: "Sharjah / SH" },
  ],
  manila: [
    { value: "", label: "All Branches" },
    { value: "PAR", label: "Paranaque" },
    { value: "CUBAO", label: "Cubao" },
    { value: "TAFT", label: "Taft" },
    { value: "CK", label: "Central Kitchen" },
  ],
};

const CITY_DEFAULT_RANGE: Record<string, { from: string; to: string }> = {
  dubai: { from: "2025-11-01", to: "2026-03-31" },
  manila: { from: "2025-11-01", to: "2026-03-31" },
};

function weekdayLabel(n: number) {
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][n] || String(n);
}

function branchBadgeClass(branch: string) {
  const b = (branch || "").trim().toUpperCase();

  if (b === "BB" || b === "BUSINESS BAY") return "border-sky-900/40 bg-sky-950/10 text-sky-200";
  if (b === "JLT") return "border-cyan-900/40 bg-cyan-950/10 text-cyan-200";
  if (b === "ARJ" || b === "ARJAN") return "border-emerald-900/40 bg-emerald-950/10 text-emerald-200";
  if (b === "AM" || b === "AL MINA") return "border-rose-900/40 bg-rose-950/10 text-rose-200";
  if (b === "AB" || b === "AL BARSHA") return "border-amber-900/40 bg-amber-950/10 text-amber-200";
  if (b === "CK") return "border-violet-900/40 bg-violet-950/10 text-violet-200";
  if (b === "DRIVER") return "border-neutral-700 bg-neutral-900/60 text-neutral-200";

  return "border-neutral-800 bg-neutral-950/40 text-neutral-200";
}

function absenceBadgeClass(t: string) {
  const x = (t || "").trim().toUpperCase();

  if (x === "DAY_OFF") return "border-amber-900/40 bg-amber-950/10 text-amber-200";
  if (x === "VACATION_LEAVE") return "border-sky-900/40 bg-sky-950/10 text-sky-200";
  if (x === "MEDICAL_LEAVE" || x === "HOSPITAL" || x === "INJURY") return "border-rose-900/40 bg-rose-950/10 text-rose-200";
  if (x === "ABSENT") return "border-fuchsia-900/40 bg-fuchsia-950/10 text-fuchsia-200";
  if (x === "MATERNITY_LEAVE") return "border-emerald-900/40 bg-emerald-950/10 text-emerald-200";

  return "border-neutral-800 bg-neutral-950/40 text-neutral-200";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function csvEscape(value: unknown) {
  const s = String(value ?? "");
  if (s.includes('"') || s.includes(",") || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((h) => csvEscape(row[h])).join(",")),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function fmtMinutes(v?: number | null) {
  if (v == null) return "-";
  return `${v} min`;
}

export default function AdminAnalyticsPage() {
  const auth = getAuth();

  const [city, setCity] = useState<string>((auth?.city || "dubai").toLowerCase());
  const [dateFrom, setDateFrom] = useState("2025-11-01");
  const [dateTo, setDateTo] = useState("2026-03-31");
  const [branchCode, setBranchCode] = useState("");
  const [staffLimit, setStaffLimit] = useState(20);

  const [approverName, setApproverName] = useState(auth?.staffName || "");
  const [pin, setPin] = useState(auth?.pin || "");

  const [branchDailyRows, setBranchDailyRows] = useState<BranchDailyRow[]>([]);
  const [branchWeekdayRows, setBranchWeekdayRows] = useState<BranchWeekdayRow[]>([]);
  const [staffSummaryRows, setStaffSummaryRows] = useState<StaffSummaryRow[]>([]);
  const [absenceSummaryRows, setAbsenceSummaryRows] = useState<AbsenceSummaryRow[]>([]);

  const [dubaiSummary, setDubaiSummary] = useState<CitySummaryResp | null>(null);
  const [manilaSummary, setManilaSummary] = useState<CitySummaryResp | null>(null);

  const [attendanceOverview, setAttendanceOverview] = useState<AttendanceOverview>({});
  const [attendanceBranchSummary, setAttendanceBranchSummary] = useState<AttendanceBranchSummary[]>([]);
  const [attendanceStaffIssues, setAttendanceStaffIssues] = useState<AttendanceStaffIssue[]>([]);

  const [staffSortBy, setStaffSortBy] = useState<"hours" | "days" | "segments" | "name">("hours");
  const [branchSortBy, setBranchSortBy] = useState<"totalHours" | "avgHoursPerDay" | "maxStaff" | "branch">("totalHours");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const summary = useMemo(() => {
    const totalHours = branchDailyRows.reduce((sum, row) => sum + Number(row.total_hours || 0), 0);
    const uniqueDays = new Set(branchDailyRows.map((row) => row.work_date)).size;
    const uniqueBranches = new Set(branchDailyRows.map((row) => row.branch_code)).size;
    const topStaff = staffSummaryRows[0];
    const topAbsence = absenceSummaryRows[0];

    return {
      totalHours,
      uniqueDays,
      uniqueBranches,
      topStaffName: topStaff?.staff_name || "-",
      topStaffHours: Number(topStaff?.total_hours || 0),
      topAbsenceType: topAbsence?.absence_type || "-",
      topAbsenceRows: Number(topAbsence?.row_count || 0),
    };
  }, [branchDailyRows, staffSummaryRows, absenceSummaryRows]);

  const branchTotals = useMemo(() => {
    const m = new Map<string, { totalHours: number; staffMax: number; days: Set<string> }>();

    for (const row of branchDailyRows) {
      const key = row.branch_code || "-";
      const cur = m.get(key) || { totalHours: 0, staffMax: 0, days: new Set<string>() };
      cur.totalHours += Number(row.total_hours || 0);
      cur.staffMax = Math.max(cur.staffMax, Number(row.staff_count || 0));
      cur.days.add(row.work_date);
      m.set(key, cur);
    }

    return Array.from(m.entries())
      .map(([branch, v]) => ({
        branch,
        totalHours: v.totalHours,
        maxStaff: v.staffMax,
        days: v.days.size,
        avgHoursPerDay: v.days.size ? v.totalHours / v.days.size : 0,
      }))
      .sort((a, b) => b.totalHours - a.totalHours);
  }, [branchDailyRows]);

  const cityDiff = useMemo(() => {
    if (!dubaiSummary || !manilaSummary) return null;

    return {
      totalHoursDiff: Number(dubaiSummary.total_hours || 0) - Number(manilaSummary.total_hours || 0),
      avgHoursPerDayDiff: Number(dubaiSummary.avg_hours_per_day || 0) - Number(manilaSummary.avg_hours_per_day || 0),
      dayCountDiff: Number(dubaiSummary.day_count || 0) - Number(manilaSummary.day_count || 0),
      branchCountDiff: Number(dubaiSummary.branch_count || 0) - Number(manilaSummary.branch_count || 0),
    };
  }, [dubaiSummary, manilaSummary]);

  const sortedBranchTotals = useMemo(() => {
    const rows = [...branchTotals];
    rows.sort((a, b) => {
      if (branchSortBy === "branch") return a.branch.localeCompare(b.branch);
      if (branchSortBy === "avgHoursPerDay") return b.avgHoursPerDay - a.avgHoursPerDay;
      if (branchSortBy === "maxStaff") return b.maxStaff - a.maxStaff;
      return b.totalHours - a.totalHours;
    });
    return rows;
  }, [branchTotals, branchSortBy]);

  const sortedStaffSummaryRows = useMemo(() => {
    const rows = [...staffSummaryRows];
    rows.sort((a, b) => {
      if (staffSortBy === "name") return a.staff_name.localeCompare(b.staff_name);
      if (staffSortBy === "days") return b.worked_days - a.worked_days;
      if (staffSortBy === "segments") return b.segment_count - a.segment_count;
      return b.total_hours - a.total_hours;
    });
    return rows;
  }, [staffSummaryRows, staffSortBy]);

  const exportBaseName = `${city}_${dateFrom}_to_${dateTo}${branchCode ? `_${branchCode}` : ""}`;

  const branchDailyExportRows = useMemo(
    () => branchDailyRows.map((r) => ({
      work_date: r.work_date,
      branch_code: r.branch_code,
      total_hours: Number(r.total_hours || 0).toFixed(1),
      staff_count: r.staff_count,
      segment_count: r.segment_count,
    })),
    [branchDailyRows]
  );

  const branchWeekdayExportRows = useMemo(
    () => branchWeekdayRows.map((r) => ({
      branch_code: r.branch_code,
      weekday: weekdayLabel(r.weekday),
      avg_hours: Number(r.avg_hours || 0).toFixed(1),
      avg_staff_count: Number(r.avg_staff_count || 0).toFixed(2),
      day_count: r.day_count,
    })),
    [branchWeekdayRows]
  );

  const staffSummaryExportRows = useMemo(
    () => sortedStaffSummaryRows.map((r) => ({
      staff_name: r.staff_name,
      total_hours: Number(r.total_hours || 0).toFixed(1),
      worked_days: r.worked_days,
      segment_count: r.segment_count,
    })),
    [sortedStaffSummaryRows]
  );

  const absenceSummaryExportRows = useMemo(
    () => absenceSummaryRows.map((r) => ({
      absence_type: r.absence_type,
      row_count: r.row_count,
      staff_count: r.staff_count,
      day_count: r.day_count,
    })),
    [absenceSummaryRows]
  );

  const cityComparisonExportRows = useMemo(
    () => [dubaiSummary, manilaSummary]
      .filter((s): s is CitySummaryResp => Boolean(s))
      .map((s) => ({
        city: s.city,
        date_from: s.date_from,
        date_to: s.date_to,
        total_hours: Number(s.total_hours || 0).toFixed(1),
        day_count: s.day_count,
        branch_count: s.branch_count,
        avg_hours_per_day: Number(s.avg_hours_per_day || 0).toFixed(1),
        top_branch: s.top_branch || "-",
        top_branch_hours: Number(s.top_branch_hours || 0).toFixed(1),
        top_absence_type: s.top_absence_type || "-",
        top_absence_rows: s.top_absence_rows,
      })),
    [dubaiSummary, manilaSummary]
  );

  const cityDiffExportRows = useMemo(
    () => cityDiff ? [
      { metric: "total_hours_diff", value: cityDiff.totalHoursDiff.toFixed(1) },
      { metric: "avg_hours_per_day_diff", value: cityDiff.avgHoursPerDayDiff.toFixed(1) },
      { metric: "day_count_diff", value: cityDiff.dayCountDiff },
      { metric: "branch_count_diff", value: cityDiff.branchCountDiff },
    ] : [],
    [cityDiff]
  );

  async function loadAll() {
    setLoading(true);
    setError("");

    try {
      const common = new URLSearchParams({
        city,
        date_from: dateFrom,
        date_to: dateTo,
        branch_code: branchCode,
        approver_name: approverName.trim(),
        pin: pin.trim(),
      });

      const staffQs = new URLSearchParams({
        city,
        date_from: dateFrom,
        date_to: dateTo,
        branch_code: branchCode,
        limit: String(staffLimit),
        approver_name: approverName.trim(),
        pin: pin.trim(),
      });

      const absenceQs = new URLSearchParams({
        city,
        date_from: dateFrom,
        date_to: dateTo,
        approver_name: approverName.trim(),
        pin: pin.trim(),
      });

      const attendanceQs = new URLSearchParams({
        city: city === "dubai" ? "Dubai" : "Manila",
        date_from: dateFrom,
        date_to: dateTo,
        branch: branchCode,
      });

      const [daily, weekday, staff, absence, dubaiCity, manilaCity, attendance] = await Promise.all([
        apiGet<BranchDailyResp>(`/api/admin/analytics/branch_daily_hours?${common.toString()}`),
        apiGet<BranchWeekdayResp>(`/api/admin/analytics/branch_weekday_avg_hours?${common.toString()}`),
        apiGet<StaffSummaryResp>(`/api/admin/analytics/staff_work_summary?${staffQs.toString()}`),
        apiGet<AbsenceSummaryResp>(`/api/admin/analytics/absence_summary?${absenceQs.toString()}`),
        apiGet<CitySummaryResp>(`/api/admin/analytics/city_summary?city=dubai&date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}&approver_name=${encodeURIComponent(approverName.trim())}&pin=${encodeURIComponent(pin.trim())}`),
        apiGet<CitySummaryResp>(`/api/admin/analytics/city_summary?city=manila&date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}&approver_name=${encodeURIComponent(approverName.trim())}&pin=${encodeURIComponent(pin.trim())}`),
        apiGet<AttendanceAnalyticsResp>(`/api/admin/attendance/analytics?${attendanceQs.toString()}`),
      ]);

      setBranchDailyRows(daily.rows || []);
      setBranchWeekdayRows(weekday.rows || []);
      setStaffSummaryRows(staff.rows || []);
      setAbsenceSummaryRows(absence.rows || []);
      setDubaiSummary(dubaiCity);
      setManilaSummary(manilaCity);

      setAttendanceOverview(attendance?.overview || {});
      setAttendanceBranchSummary(Array.isArray(attendance?.branch_summary) ? attendance.branch_summary : []);
      setAttendanceStaffIssues(Array.isArray(attendance?.staff_issues) ? attendance.staff_issues : []);
    } catch (e: any) {
      setError(String(e?.message || e || "Failed to load analytics"));
      setBranchDailyRows([]);
      setBranchWeekdayRows([]);
      setStaffSummaryRows([]);
      setAbsenceSummaryRows([]);
      setDubaiSummary(null);
      setManilaSummary(null);
      setAttendanceOverview({});
      setAttendanceBranchSummary([]);
      setAttendanceStaffIssues([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setBranchCode("");
    const r = CITY_DEFAULT_RANGE[city] || { from: "2025-11-01", to: "2026-03-31" };
    setDateFrom(r.from);
    setDateTo(r.to);
  }, [city]);

  useEffect(() => {
    if (approverName.trim() && pin.trim()) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col justify-center px-6 py-10">
        <div className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-8 shadow-2xl">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-neutral-800 bg-black">
              <img src={LOGO_SRC} alt="Sushi ZEN logo" className="h-full w-full object-contain" />
            </div>
            <h1 className="mt-5 text-3xl font-bold">Staff Analytics</h1>
            <p className="mt-2 text-sm text-neutral-400">
              HQ / ADMIN analysis for historical shift, absence, and attendance data
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-6">
            <div>
              <div className="mb-1 text-xs text-neutral-400">City</div>
              <select value={city} onChange={(e) => setCity(e.target.value)} className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm">
                <option value="dubai">Dubai</option>
                <option value="manila">Manila</option>
              </select>
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">Date From</div>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm" />
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">Date To</div>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm" />
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">Branch</div>
              <select value={branchCode} onChange={(e) => setBranchCode(e.target.value)} className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm">
                {(BRANCH_OPTIONS[city] || [{ value: "", label: "All Branches" }]).map((opt) => (
                  <option key={opt.value || "ALL"} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-400">Top Staff Limit</div>
              <input type="number" min={1} max={200} value={staffLimit} onChange={(e) => setStaffLimit(Number(e.target.value))} className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm" />
            </div>

            <div className="flex items-end">
              <button type="button" onClick={loadAll} disabled={loading || !approverName.trim() || !pin.trim()} className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-60">
                {loading ? "Loading..." : "Refresh Analytics"}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => { setDateFrom("2025-11-01"); setDateTo("2026-03-31"); }} className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-900">
              Nov 2025 – Mar 2026
            </button>
            <button type="button" onClick={() => { const now = new Date(); setDateTo(todayIso()); setDateFrom(addDaysIso(now, -29)); }} className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-900">
              Last 30 Days
            </button>
            <button type="button" onClick={() => { const now = new Date(); const first = new Date(now.getFullYear(), now.getMonth(), 1); setDateFrom(first.toISOString().slice(0, 10)); setDateTo(todayIso()); }} className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-900">
              This Month
            </button>
            <button type="button" onClick={() => setBranchCode("")} className="rounded-xl border border-neutral-700 bg-neutral-950/40 px-3 py-2 text-xs font-semibold text-neutral-200 hover:bg-neutral-900">
              Clear Branch
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <div className="mb-1 text-xs text-neutral-400">Approver Name</div>
              <input value={approverName} onChange={(e) => setApproverName(e.target.value)} className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm" />
            </div>
            <div>
              <div className="mb-1 text-xs text-neutral-400">PIN</div>
              <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm" />
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-900/50 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-6">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
              <div className="text-xs text-neutral-500">Total Hours</div>
              <div className="mt-1 text-2xl font-bold">{summary.totalHours.toFixed(1)}</div>
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
              <div className="text-xs text-neutral-500">Days</div>
              <div className="mt-1 text-2xl font-bold">{summary.uniqueDays}</div>
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
              <div className="text-xs text-neutral-500">Branches</div>
              <div className="mt-1 text-2xl font-bold">{summary.uniqueBranches}</div>
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 md:col-span-2">
              <div className="text-xs text-neutral-500">Top Staff</div>
              <div className="mt-1 text-lg font-bold">{summary.topStaffName}</div>
              <div className="text-sm text-neutral-400">{summary.topStaffHours.toFixed(1)} hrs</div>
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
              <div className="text-xs text-neutral-500">Top Absence</div>
              <div className="mt-1">
                <span className={["inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold", absenceBadgeClass(summary.topAbsenceType)].join(" ")}>
                  {summary.topAbsenceType}
                </span>
              </div>
              <div className="mt-2 text-sm text-neutral-400">{summary.topAbsenceRows} rows</div>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold">City Comparison</div>
              <button type="button" onClick={() => downloadCsv(`${exportBaseName}_city_comparison.csv`, cityComparisonExportRows)} className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-900">
                Export CSV
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {[dubaiSummary, manilaSummary].map((s, idx) => (
                <div key={s?.city || `empty-${idx}`} className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-5">
                  {!s ? (
                    <div className="text-sm text-neutral-500">No data</div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-lg font-semibold capitalize">{s.city}</div>
                          <div className="mt-1 text-xs text-neutral-500">{s.date_from} → {s.date_to}</div>
                        </div>
                        <span className={["inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold", s.city === "dubai" ? "border-sky-900/40 bg-sky-950/10 text-sky-200" : "border-emerald-900/40 bg-emerald-950/10 text-emerald-200"].join(" ")}>
                          {s.city.toUpperCase()}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
                          <div className="text-[11px] text-neutral-500">Total Hours</div>
                          <div className="mt-1 text-xl font-bold">{Number(s.total_hours || 0).toFixed(1)}</div>
                        </div>
                        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
                          <div className="text-[11px] text-neutral-500">Avg / Day</div>
                          <div className="mt-1 text-xl font-bold">{Number(s.avg_hours_per_day || 0).toFixed(1)}</div>
                        </div>
                        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
                          <div className="text-[11px] text-neutral-500">Days</div>
                          <div className="mt-1 text-xl font-bold">{s.day_count}</div>
                        </div>
                        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
                          <div className="text-[11px] text-neutral-500">Branches</div>
                          <div className="mt-1 text-xl font-bold">{s.branch_count}</div>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
                          <div className="text-[11px] text-neutral-500">Top Branch</div>
                          <div className="mt-2">
                            <span className={["inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold", branchBadgeClass(s.top_branch)].join(" ")}>
                              {s.top_branch || "-"}
                            </span>
                          </div>
                          <div className="mt-2 text-sm text-neutral-300">{Number(s.top_branch_hours || 0).toFixed(1)} hrs</div>
                        </div>

                        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
                          <div className="text-[11px] text-neutral-500">Top Absence</div>
                          <div className="mt-2">
                            <span className={["inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold", absenceBadgeClass(s.top_absence_type)].join(" ")}>
                              {s.top_absence_type || "-"}
                            </span>
                          </div>
                          <div className="mt-2 text-sm text-neutral-300">{s.top_absence_rows} rows</div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold">City Difference (Dubai − Manila)</div>
              <button type="button" onClick={() => downloadCsv(`${exportBaseName}_city_difference.csv`, cityDiffExportRows)} className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-900">
                Export CSV
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs text-neutral-500">Total Hours Diff</div>
                <div className="mt-1 text-2xl font-bold">{cityDiff ? cityDiff.totalHoursDiff.toFixed(1) : "-"}</div>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs text-neutral-500">Avg / Day Diff</div>
                <div className="mt-1 text-2xl font-bold">{cityDiff ? cityDiff.avgHoursPerDayDiff.toFixed(1) : "-"}</div>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs text-neutral-500">Day Count Diff</div>
                <div className="mt-1 text-2xl font-bold">{cityDiff ? cityDiff.dayCountDiff : "-"}</div>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs text-neutral-500">Branch Count Diff</div>
                <div className="mt-1 text-2xl font-bold">{cityDiff ? cityDiff.branchCountDiff : "-"}</div>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold">Branch Totals</div>
              <select value={branchSortBy} onChange={(e) => setBranchSortBy(e.target.value as "totalHours" | "avgHoursPerDay" | "maxStaff" | "branch")} className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold text-white">
                <option value="totalHours">Sort: Total Hours</option>
                <option value="avgHoursPerDay">Sort: Avg / Day</option>
                <option value="maxStaff">Sort: Max Staff</option>
                <option value="branch">Sort: Branch</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
              {sortedBranchTotals.map((b) => (
                <div key={b.branch} className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div>
                    <span className={["inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold", branchBadgeClass(b.branch)].join(" ")}>
                      {b.branch}
                    </span>
                  </div>
                  <div className="mt-3 text-2xl font-bold">{b.totalHours.toFixed(1)}</div>
                  <div className="text-xs text-neutral-500">total hours</div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-neutral-400">
                    <div>
                      <div className="text-neutral-500">Avg/Day</div>
                      <div className="mt-1 text-sm text-neutral-200">{b.avgHoursPerDay.toFixed(1)}</div>
                    </div>
                    <div>
                      <div className="text-neutral-500">Max Staff</div>
                      <div className="mt-1 text-sm text-neutral-200">{b.maxStaff}</div>
                    </div>
                  </div>
                </div>
              ))}
              {!sortedBranchTotals.length ? (
                <div className="col-span-full rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 text-sm text-neutral-500">
                  No branch totals.
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Branch Daily Hours</div>
                  <div className="mt-1 text-xs text-neutral-500">Daily total hours, staff count, and segment count by branch.</div>
                </div>
                <button type="button" onClick={() => downloadCsv(`${exportBaseName}_branch_daily_hours.csv`, branchDailyExportRows)} className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-900">
                  Export CSV
                </button>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Branch</th>
                      <th className="px-3 py-2">Hours</th>
                      <th className="px-3 py-2">Staff</th>
                      <th className="px-3 py-2">Segments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branchDailyRows.slice(0, 120).map((row) => (
                      <tr key={`${row.work_date}-${row.branch_code}`} className="border-b border-neutral-800/70">
                        <td className="px-3 py-2">{row.work_date}</td>
                        <td className="px-3 py-2">
                          <span className={["inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold", branchBadgeClass(row.branch_code)].join(" ")}>
                            {row.branch_code || "-"}
                          </span>
                        </td>
                        <td className="px-3 py-2">{Number(row.total_hours || 0).toFixed(1)}</td>
                        <td className="px-3 py-2">{row.staff_count}</td>
                        <td className="px-3 py-2">{row.segment_count}</td>
                      </tr>
                    ))}
                    {!branchDailyRows.length ? (
                      <tr><td colSpan={5} className="px-3 py-6 text-center text-neutral-500">No data</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Branch Weekday Averages</div>
                  <div className="mt-1 text-xs text-neutral-500">Average hours and average staff count by weekday.</div>
                </div>
                <button type="button" onClick={() => downloadCsv(`${exportBaseName}_branch_weekday_averages.csv`, branchWeekdayExportRows)} className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-900">
                  Export CSV
                </button>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                    <tr>
                      <th className="px-3 py-2">Branch</th>
                      <th className="px-3 py-2">Weekday</th>
                      <th className="px-3 py-2">Avg Hours</th>
                      <th className="px-3 py-2">Avg Staff</th>
                      <th className="px-3 py-2">Days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branchWeekdayRows.map((row) => (
                      <tr key={`${row.branch_code}-${row.weekday}`} className="border-b border-neutral-800/70">
                        <td className="px-3 py-2">
                          <span className={["inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold", branchBadgeClass(row.branch_code)].join(" ")}>
                            {row.branch_code || "-"}
                          </span>
                        </td>
                        <td className="px-3 py-2">{weekdayLabel(row.weekday)}</td>
                        <td className="px-3 py-2">{Number(row.avg_hours || 0).toFixed(1)}</td>
                        <td className="px-3 py-2">{Number(row.avg_staff_count || 0).toFixed(2)}</td>
                        <td className="px-3 py-2">{row.day_count}</td>
                      </tr>
                    ))}
                    {!branchWeekdayRows.length ? (
                      <tr><td colSpan={5} className="px-3 py-6 text-center text-neutral-500">No data</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Staff Work Summary</div>
                  <div className="mt-1 text-xs text-neutral-500">Top staff by total hours in the selected period.</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select value={staffSortBy} onChange={(e) => setStaffSortBy(e.target.value as "hours" | "days" | "segments" | "name")} className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold text-white">
                    <option value="hours">Sort: Hours</option>
                    <option value="days">Sort: Days</option>
                    <option value="segments">Sort: Segments</option>
                    <option value="name">Sort: Name</option>
                  </select>
                  <button type="button" onClick={() => downloadCsv(`${exportBaseName}_staff_work_summary.csv`, staffSummaryExportRows)} className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-900">
                    Export CSV
                  </button>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                    <tr>
                      <th className="px-3 py-2">Staff</th>
                      <th className="px-3 py-2">Hours</th>
                      <th className="px-3 py-2">Days</th>
                      <th className="px-3 py-2">Segments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedStaffSummaryRows.map((row) => (
                      <tr key={row.staff_name} className="border-b border-neutral-800/70">
                        <td className="px-3 py-2">{row.staff_name}</td>
                        <td className="px-3 py-2">{Number(row.total_hours || 0).toFixed(1)}</td>
                        <td className="px-3 py-2">{row.worked_days}</td>
                        <td className="px-3 py-2">{row.segment_count}</td>
                      </tr>
                    ))}
                    {!sortedStaffSummaryRows.length ? (
                      <tr><td colSpan={4} className="px-3 py-6 text-center text-neutral-500">No data</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Absence Summary</div>
                  <div className="mt-1 text-xs text-neutral-500">Absence totals by type for the selected period.</div>
                </div>
                <button type="button" onClick={() => downloadCsv(`${exportBaseName}_absence_summary.csv`, absenceSummaryExportRows)} className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-900">
                  Export CSV
                </button>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                    <tr>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Rows</th>
                      <th className="px-3 py-2">Staff</th>
                      <th className="px-3 py-2">Days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {absenceSummaryRows.map((row) => (
                      <tr key={row.absence_type} className="border-b border-neutral-800/70">
                        <td className="px-3 py-2">
                          <span className={["inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold", absenceBadgeClass(row.absence_type)].join(" ")}>
                            {row.absence_type}
                          </span>
                        </td>
                        <td className="px-3 py-2">{row.row_count}</td>
                        <td className="px-3 py-2">{row.staff_count}</td>
                        <td className="px-3 py-2">{row.day_count}</td>
                      </tr>
                    ))}
                    {!absenceSummaryRows.length ? (
                      <tr><td colSpan={4} className="px-3 py-6 text-center text-neutral-500">No data</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <section className="mt-8 rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold">Attendance Summary</div>
                <div className="mt-1 text-xs text-neutral-500">
                  Bayzat import based scheduled vs actual attendance overview.
                </div>
              </div>
              <Link
                href="/admin/attendance"
                className="inline-flex items-center rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-900"
              >
                Open Attendance Admin
              </Link>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs text-neutral-500">Scheduled</div>
                <div className="mt-1 text-2xl font-bold">{fmtMinutes(attendanceOverview.scheduled_minutes)}</div>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs text-neutral-500">Actual</div>
                <div className="mt-1 text-2xl font-bold">{fmtMinutes(attendanceOverview.actual_minutes)}</div>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs text-neutral-500">Late / Early / OT</div>
                <div className="mt-2 space-y-1 text-sm text-neutral-300">
                  <div>Late: {fmtMinutes(attendanceOverview.late_minutes)}</div>
                  <div>Early: {fmtMinutes(attendanceOverview.early_leave_minutes)}</div>
                  <div>OT: {fmtMinutes(attendanceOverview.overtime_minutes)}</div>
                </div>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs text-neutral-500">Issues</div>
                <div className="mt-2 space-y-1 text-sm text-neutral-300">
                  <div>No-show: {attendanceOverview.no_show_count ?? 0}</div>
                  <div>Missing IN: {attendanceOverview.missing_check_in_count ?? 0}</div>
                  <div>Missing OUT: {attendanceOverview.missing_check_out_count ?? 0}</div>
                  <div>Branch mismatch: {attendanceOverview.branch_mismatch_count ?? 0}</div>
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
                <div className="mb-3 text-sm font-semibold">Attendance Branch Summary</div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                      <tr>
                        <th className="px-3 py-2">Branch</th>
                        <th className="px-3 py-2">Scheduled</th>
                        <th className="px-3 py-2">Actual</th>
                        <th className="px-3 py-2">Late</th>
                        <th className="px-3 py-2">OT</th>
                        <th className="px-3 py-2">Issues</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendanceBranchSummary.map((row, idx) => (
                        <tr key={`${row.branch_code || "branch"}-${idx}`} className="border-b border-neutral-800/70">
                          <td className="px-3 py-2">{row.branch_code || "-"}</td>
                          <td className="px-3 py-2">{fmtMinutes(row.scheduled_minutes)}</td>
                          <td className="px-3 py-2">{fmtMinutes(row.actual_minutes)}</td>
                          <td className="px-3 py-2">{fmtMinutes(row.late_minutes)}</td>
                          <td className="px-3 py-2">{fmtMinutes(row.overtime_minutes)}</td>
                          <td className="px-3 py-2">{row.issue_count ?? 0}</td>
                        </tr>
                      ))}
                      {!attendanceBranchSummary.length ? (
                        <tr><td colSpan={6} className="px-3 py-6 text-center text-neutral-500">No attendance branch data</td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
                <div className="mb-3 text-sm font-semibold">Top Attendance Staff Issues</div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                      <tr>
                        <th className="px-3 py-2">Staff</th>
                        <th className="px-3 py-2">City</th>
                        <th className="px-3 py-2">Late</th>
                        <th className="px-3 py-2">Early</th>
                        <th className="px-3 py-2">OT</th>
                        <th className="px-3 py-2">Issues</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendanceStaffIssues.map((row, idx) => (
                        <tr key={`${row.staff_name || "staff"}-${idx}`} className="border-b border-neutral-800/70">
                          <td className="px-3 py-2">{row.staff_name || "-"}</td>
                          <td className="px-3 py-2">{row.city || "-"}</td>
                          <td className="px-3 py-2">{fmtMinutes(row.late_minutes)}</td>
                          <td className="px-3 py-2">{fmtMinutes(row.early_leave_minutes)}</td>
                          <td className="px-3 py-2">{fmtMinutes(row.overtime_minutes)}</td>
                          <td className="px-3 py-2">{row.issue_count ?? 0}</td>
                        </tr>
                      ))}
                      {!attendanceStaffIssues.length ? (
                        <tr><td colSpan={6} className="px-3 py-6 text-center text-neutral-500">No attendance staff issue data</td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>

          <div className="mt-8 flex flex-col items-center gap-3 text-sm text-neutral-400 sm:flex-row sm:justify-between">
            <Link href="/admin/staff" className="hover:text-white">← Back to Staff Master</Link>
            <div className="flex flex-wrap gap-3">
              <Link href="/admin/staff/onboarding" className="hover:text-white">Onboarding Dashboard</Link>
              <Link href="/admin/staff/audit" className="hover:text-white">Audit Logs</Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
