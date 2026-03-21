"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getAuth } from "@/lib/auth";

// Use same-origin requests; Next rewrites proxy /api/* to backend.
const API_BASE = "";
const LOGO_SRC = "/logo.png";

async function apiGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
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

async function apiPost<T = any>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    try {
      const j = JSON.parse(text);
      throw new Error(j?.detail || text || `POST ${path} failed`);
    } catch {
      throw new Error(text || `POST ${path} failed`);
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

type PosSalesDailyRow = {
  work_date: string;
  city: string;
  order_count_total: number;
  order_count_non_cancelled: number;
  order_count_completed: number;
  gross_revenue: number;
  net_revenue: number;
  discounts: number;
  charges: number;
  taxes: number;
  subtotal_amount: number;
  source_file_name: string;
};

type PosSalesDailyResp = { ok: boolean; items: PosSalesDailyRow[] };

type PosMenuRankingRow = {
  item_name: string;
  order_line_count: number;
  quantity_total: number;
  net_sales_total: number;
};

type PosMenuRankingResp = { ok: boolean; items: PosMenuRankingRow[] };

type PosBranchOrderRow = {
  branch_name: string;
  order_count_non_cancelled: number;
  gross_revenue: number;
  net_revenue: number;
};

type PosBranchOrderResp = { ok: boolean; items: PosBranchOrderRow[] };

type ComparisonItem = {
  work_date: string;
  city?: string | null;
  scheduled_branch_code?: string | null;
  attendance_branch_code?: string | null;
  staff_name?: string | null;
  employee_name_raw?: string | null;
  scheduled_minutes?: number | null;
  actual_minutes?: number | null;
  late_minutes?: number | null;
  early_leave_minutes?: number | null;
  overtime_minutes?: number | null;
  no_show?: boolean | null;
  missing_check_in?: boolean | null;
  missing_check_out?: boolean | null;
  branch_mismatch?: boolean | null;
  unscheduled_attendance?: boolean | null;
  has_planned_row?: boolean | null;
  has_work_shift?: boolean | null;
  has_absence_row?: boolean | null;
  absence_type?: string | null;
  effective_status_raw?: string | null;
};

type ComparisonResp = {
  ok?: boolean;
  count?: number;
  items?: ComparisonItem[];
};

type AnalyticsViewMode =
  | "perfect_attendance"
  | "top_late"
  | "top_absence"
  | "top_compliance"
  | "worst_compliance"
  | "branch_late"
  | "branch_absence"
  | "branch_compliance"
  | "bayzat_missing_punch";

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
    { value: "MC", label: "Motor City" },
  ],
  manila: [
    { value: "", label: "All Branches" },
    { value: "PAR", label: "Parañaque" },
    { value: "TAFT", label: "Taft" },
    { value: "CUBAO", label: "Cubao" },
    { value: "CK", label: "Central Kitchen (PH)" },
    { value: "MC", label: "MC" },
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
  if (b === "MC") return "border-orange-900/40 bg-orange-950/10 text-orange-200";
  if (b === "PAR") return "border-sky-900/40 bg-sky-950/10 text-sky-200";
  if (b === "TAFT") return "border-emerald-900/40 bg-emerald-950/10 text-emerald-200";
  if (b === "CUBAO") return "border-fuchsia-900/40 bg-fuchsia-950/10 text-fuchsia-200";
  return "border-neutral-800 bg-neutral-950/40 text-neutral-200";
}

function absenceBadgeClass(t: string) {
  const x = (t || "").trim().toUpperCase();
  if (x === "DAY_OFF") return "border-amber-900/40 bg-amber-950/10 text-amber-200";
  if (x === "VACATION_LEAVE") return "border-sky-900/40 bg-sky-950/10 text-sky-200";
  if (x === "MEDICAL_LEAVE" || x === "SICK_LEAVE" || x === "HOSPITAL" || x === "INJURY") {
    return "border-rose-900/40 bg-rose-950/10 text-rose-200";
  }
  if (x === "ABSENT") return "border-fuchsia-900/40 bg-fuchsia-950/10 text-fuchsia-200";
  if (x === "MATERNITY_LEAVE") return "border-emerald-900/40 bg-emerald-950/10 text-emerald-200";
  if (x === "BEREAVEMENT_LEAVE") return "border-indigo-900/40 bg-indigo-950/10 text-indigo-200";
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

function safeStaffName(row: ComparisonItem) {
  return (row.staff_name || row.employee_name_raw || "").trim();
}

function effectiveLateMinutes(row: ComparisonItem) {
  const late = Number(row.late_minutes ?? 0);
  return late <= 15 ? 0 : late;
}

function isWorkedAttendance(row: ComparisonItem) {
  return !!row.has_work_shift && Number(row.actual_minutes ?? 0) > 0;
}

function isLateAttendanceCandidate(row: ComparisonItem) {
  return Number(effectiveLateMinutes(row)) > 0 || Number(row.actual_minutes ?? 0) > 0;
}

function isStrictLateAttendance(row: ComparisonItem) {
  const status = String(row.effective_status_raw || "").trim().toUpperCase();
  return effectiveLateMinutes(row) > 0 && !row.missing_check_in && status === "PRESENT";
}

function isProblemAbsence(row: ComparisonItem) {
  const t = String(row.absence_type || "").trim().toUpperCase();

  if (row.no_show) return true;
  if (!t) return false;

  if (
    t === "DAY_OFF" ||
    t === "VACATION_LEAVE" ||
    t === "MATERNITY_LEAVE" ||
    t === "BEREAVEMENT_LEAVE"
  ) {
    return false;
  }

  return (
    t === "ABSENT" ||
    t === "MEDICAL_LEAVE" ||
    t === "SICK_LEAVE" ||
    t === "HOSPITAL" ||
    t === "INJURY"
  );
}

function uniqueStaffCount(rows: ComparisonItem[], predicate: (row: ComparisonItem) => boolean) {
  const s = new Set<string>();
  for (const row of rows) {
    if (!predicate(row)) continue;
    const name = safeStaffName(row);
    if (name) s.add(name);
  }
  return s.size;
}

function calculateComplianceRate(row: ComparisonItem) {
  const scheduled = Number(row.scheduled_minutes ?? 0);
  const actual = Number(row.actual_minutes ?? 0);

  if (scheduled <= 0) return null;
  if (row.no_show) return 0;

  const missingPenalty =
    (row.missing_check_in ? 0.15 : 0) +
    (row.missing_check_out ? 0.15 : 0) +
    (row.branch_mismatch ? 0.1 : 0);

  const latePenalty = Math.min(effectiveLateMinutes(row) / Math.max(scheduled, 1), 1);
  const earlyPenalty = Math.min(Number(row.early_leave_minutes ?? 0) / Math.max(scheduled, 1), 1);

  const actualRatio = Math.min(actual / scheduled, 1);
  const raw = actualRatio - latePenalty - earlyPenalty - missingPenalty;

  return Math.max(0, Math.min(1, raw));
}

export default function AdminAnalyticsPage() {
  const auth = getAuth();

  const [city, setCity] = useState<string>((auth?.city || "dubai").toLowerCase());
  const [dateFrom, setDateFrom] = useState("2025-11-01");
  const [dateTo, setDateTo] = useState("2026-03-31");
  const [summaryDateFrom, setSummaryDateFrom] = useState("2025-11-01");
  const [summaryDateTo, setSummaryDateTo] = useState("2026-03-31");
  const [branchCode, setBranchCode] = useState("");
  const [summaryBranchCode, setSummaryBranchCode] = useState("");
  const [staffLimit, setStaffLimit] = useState(20);

  const [approverName, setApproverName] = useState(auth?.staffName || "");
  const [pin, setPin] = useState(auth?.pin || "");

  const [branchDailyRows, setBranchDailyRows] = useState<BranchDailyRow[]>([]);
  const [branchWeekdayRows, setBranchWeekdayRows] = useState<BranchWeekdayRow[]>([]);
  const [staffSummaryRows, setStaffSummaryRows] = useState<StaffSummaryRow[]>([]);
  const [absenceSummaryRows, setAbsenceSummaryRows] = useState<AbsenceSummaryRow[]>([]);
  const [dubaiSummary, setDubaiSummary] = useState<CitySummaryResp | null>(null);
  const [manilaSummary, setManilaSummary] = useState<CitySummaryResp | null>(null);
  const [posSalesRows, setPosSalesRows] = useState<PosSalesDailyRow[]>([]);
  const [posMenuRankingRows, setPosMenuRankingRows] = useState<PosMenuRankingRow[]>([]);
  const [posBranchOrderRows, setPosBranchOrderRows] = useState<PosBranchOrderRow[]>([]);
  const [salesSyncing, setSalesSyncing] = useState(false);
  const [salesSyncMessage, setSalesSyncMessage] = useState("");

  const [comparisonRows, setComparisonRows] = useState<ComparisonItem[]>([]);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState("");
  const [comparisonNotice, setComparisonNotice] = useState("");
  const [comparisonLoadedOnce, setComparisonLoadedOnce] = useState(false);
  const [comparisonLimit, setComparisonLimit] = useState("5000");

  const [viewMode, setViewMode] = useState<AnalyticsViewMode>("perfect_attendance");
  const [analyticsTab, setAnalyticsTab] = useState<"staff" | "sales">("staff");
  const [staffSearch, setStaffSearch] = useState("");

  const [staffSortBy, setStaffSortBy] = useState<"hours" | "days" | "segments" | "name">("hours");
  const [branchSortBy, setBranchSortBy] = useState<"totalHours" | "avgHoursPerDay" | "maxStaff" | "branch">("totalHours");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function resetComparisonState() {
    setComparisonRows([]);
    setComparisonError("");
    setComparisonNotice("");
    setComparisonLoadedOnce(false);
  }

  useEffect(() => {
    const r = CITY_DEFAULT_RANGE[city] || { from: "2025-11-01", to: "2026-03-31" };
    const baseTo = new Date(r.to || todayIso());
    setDateTo(baseTo.toISOString().slice(0, 10));
    setDateFrom(addDaysIso(baseTo, -29));
    setSummaryDateFrom(r.from);
    setSummaryDateTo(r.to);
    setBranchCode("");
    setSummaryBranchCode("");
    resetComparisonState();
  }, [city]);

  async function loadAll() {
    setLoading(true);
    setError("");

    try {
      const common = new URLSearchParams({
        city,
        date_from: summaryDateFrom,
        date_to: summaryDateTo,
        branch_code: summaryBranchCode,
        approver_name: approverName.trim(),
        pin: pin.trim(),
      });

      const staffQs = new URLSearchParams({
        city,
        date_from: summaryDateFrom,
        date_to: summaryDateTo,
        branch_code: summaryBranchCode,
        limit: String(staffLimit),
        approver_name: approverName.trim(),
        pin: pin.trim(),
      });

      const absenceQs = new URLSearchParams({
        city,
        date_from: summaryDateFrom,
        date_to: summaryDateTo,
        approver_name: approverName.trim(),
        pin: pin.trim(),
      });

      const posDailyQs = new URLSearchParams({
        city,
        date_from: summaryDateFrom,
        date_to: summaryDateTo,
        limit: "120",
        approver_name: approverName.trim(),
        pin: pin.trim(),
      });

      const posRankingQs = new URLSearchParams({
        city,
        date_from: summaryDateFrom,
        date_to: summaryDateTo,
        limit: "50",
        approver_name: approverName.trim(),
        pin: pin.trim(),
      });

      const [daily, weekday, staff, absence, dubaiCity, manilaCity, posDaily, posRanking, posBranches] = await Promise.all([
        apiGet<BranchDailyResp>(`/api/admin/analytics/branch_daily_hours?${common.toString()}`),
        apiGet<BranchWeekdayResp>(`/api/admin/analytics/branch_weekday_avg_hours?${common.toString()}`),
        apiGet<StaffSummaryResp>(`/api/admin/analytics/staff_work_summary?${staffQs.toString()}`),
        apiGet<AbsenceSummaryResp>(`/api/admin/analytics/absence_summary?${absenceQs.toString()}`),
        apiGet<CitySummaryResp>(
          `/api/admin/analytics/city_summary?city=dubai&date_from=${encodeURIComponent(summaryDateFrom)}&date_to=${encodeURIComponent(summaryDateTo)}&approver_name=${encodeURIComponent(approverName.trim())}&pin=${encodeURIComponent(pin.trim())}`
        ),
        apiGet<CitySummaryResp>(
          `/api/admin/analytics/city_summary?city=manila&date_from=${encodeURIComponent(summaryDateFrom)}&date_to=${encodeURIComponent(summaryDateTo)}&approver_name=${encodeURIComponent(approverName.trim())}&pin=${encodeURIComponent(pin.trim())}`
        ),
        apiGet<PosSalesDailyResp>(`/api/admin/pos/sales/daily?${posDailyQs.toString()}`),
        apiGet<PosMenuRankingResp>(`/api/admin/pos/items/ranking?${posRankingQs.toString()}`),
        apiGet<PosBranchOrderResp>(`/api/admin/pos/branches/orders?${posRankingQs.toString()}`),
      ]);

      setBranchDailyRows(daily.rows || []);
      setBranchWeekdayRows(weekday.rows || []);
      setStaffSummaryRows(staff.rows || []);
      setAbsenceSummaryRows(absence.rows || []);
      setDubaiSummary(dubaiCity);
      setManilaSummary(manilaCity);
      setPosSalesRows(posDaily.items || []);
      setPosMenuRankingRows(posRanking.items || []);
      setPosBranchOrderRows(posBranches.items || []);
    } catch (e: any) {
      setError(String(e?.message || e || "Failed to load summary analytics"));
      setBranchDailyRows([]);
      setBranchWeekdayRows([]);
      setStaffSummaryRows([]);
      setAbsenceSummaryRows([]);
      setDubaiSummary(null);
      setManilaSummary(null);
      setPosSalesRows([]);
      setPosMenuRankingRows([]);
      setPosBranchOrderRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function syncSalesNow() {
    if (!approverName.trim() || !pin.trim()) return;
    setSalesSyncing(true);
    setSalesSyncMessage("");
    try {
      const res = await apiPost<{ ok?: boolean; duplicate?: boolean; message?: string }>(
        "/api/admin/pos/sales/drive/sync",
        {
          approver_name: approverName.trim(),
          pin: pin.trim(),
          city_hint: city,
        }
      );
      if (res?.duplicate) {
        setSalesSyncMessage("Already synced latest POS file. Reloaded data.");
      } else {
        setSalesSyncMessage("POS sync completed. Reloaded data.");
      }
      await loadAll();
    } catch (e: any) {
      setSalesSyncMessage(String(e?.message || e || "POS sync failed"));
    } finally {
      setSalesSyncing(false);
    }
  }

  async function loadComparison() {
    if (!approverName.trim()) {
      setComparisonError("Approver Name is required.");
      return;
    }
    if (!pin.trim()) {
      setComparisonError("PIN is required.");
      return;
    }
    if (!dateFrom || !dateTo) {
      setComparisonError("Date range is required.");
      return;
    }

    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    const diffDays =
      Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    if (diffDays > 60) {
      setComparisonNotice("Compliance analytics supports up to 60 days at a time.");
      setComparisonLoadedOnce(true);
      return;
    }

    setComparisonLoading(true);
    setComparisonError("");
    setComparisonNotice("");

    try {
      const qs = new URLSearchParams({
        city: city === "dubai" ? "Dubai" : "Manila",
        date_from: dateFrom,
        date_to: dateTo,
        limit: comparisonLimit,
        approver_name: approverName.trim(),
        pin: pin.trim(),
      });

      if (branchCode) qs.set("branch", branchCode);

      const res = await apiGet<ComparisonResp>(
        `/api/admin/attendance/comparison?${qs.toString()}`
      );

      setComparisonRows(Array.isArray(res?.items) ? res.items : []);
    } catch (e: any) {
      setComparisonRows([]);
      setComparisonError(e?.message || String(e));
    } finally {
      setComparisonLoadedOnce(true);
      setComparisonLoading(false);
    }
  }

  useEffect(() => {
    if (!approverName.trim() || !pin.trim()) return;
    loadComparison();
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!approverName.trim() || !pin.trim()) return;
    if (!dateFrom || !dateTo) return;
    loadComparison();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, branchCode, dateFrom, dateTo, approverName, pin]);

  const complianceWorkedRows = useMemo(
    () => comparisonRows.filter((row) => isWorkedAttendance(row)),
    [comparisonRows]
  );

  const comparisonSummary = useMemo(() => {
    const problemAbsenceRows = comparisonRows.filter((row) => isProblemAbsence(row));
    const lateRows = comparisonRows.filter(
      (row) => isLateAttendanceCandidate(row) && effectiveLateMinutes(row) > 0
    );
    const strictLateRows = comparisonRows.filter((row) => isStrictLateAttendance(row));

    const lateMinutes = lateRows.reduce(
      (sum, row) => sum + effectiveLateMinutes(row),
      0
    );
    const strictLateMinutes = strictLateRows.reduce(
      (sum, row) => sum + effectiveLateMinutes(row),
      0
    );

    const overtimeMinutes = complianceWorkedRows.reduce(
      (sum, row) => sum + Number(row.overtime_minutes ?? 0),
      0
    );

    const lateStaffSet = new Set(
      lateRows
        .map((row) => safeStaffName(row))
        .filter(Boolean)
    );

    const lateEventCount = lateRows.length;
    const strictLateEventCount = strictLateRows.length;
    const strictLateStaffSet = new Set(
      strictLateRows
        .map((row) => safeStaffName(row))
        .filter(Boolean)
    );

    const problemAbsentStaffSet = new Set(
      problemAbsenceRows.map((row) => safeStaffName(row)).filter(Boolean)
    );

    return {
      lateStaffCount: lateStaffSet.size,
      lateEventCount,
      lateMinutes,
      strictLateStaffCount: strictLateStaffSet.size,
      strictLateEventCount,
      strictLateMinutes,
      problemAbsentStaffCount: problemAbsentStaffSet.size,
      overtimeMinutes,
      missingInCount: complianceWorkedRows.filter((row) => row.missing_check_in).length,
      missingOutCount: complianceWorkedRows.filter((row) => row.missing_check_out).length,
    };
  }, [comparisonRows, complianceWorkedRows]);

  const comparisonByStaff = useMemo(() => {
    const m = new Map<
      string,
      {
        staff_name: string;
        scheduled_days: number;
        perfect_days: number;
        no_show_days: number;
        late_count: number;
        late_minutes: number;
        absence_days: number;
        problem_absence_days: number;
        missing_punch_count: number;
        missing_in_count: number;
        missing_out_count: number;
        overtime_minutes: number;
        compliance_total: number;
        compliance_days: number;
      }
    >();

    for (const row of comparisonRows) {
      const name = safeStaffName(row);
      if (!name) continue;

      const cur = m.get(name) || {
        staff_name: name,
        scheduled_days: 0,
        perfect_days: 0,
        no_show_days: 0,
        late_count: 0,
        late_minutes: 0,
        absence_days: 0,
        problem_absence_days: 0,
        missing_punch_count: 0,
        missing_in_count: 0,
        missing_out_count: 0,
        overtime_minutes: 0,
        compliance_total: 0,
        compliance_days: 0,
      };

      const scheduled = Number(row.scheduled_minutes ?? 0);
      const actual = Number(row.actual_minutes ?? 0);
      const lateMinutes = effectiveLateMinutes(row);
      const worked = isWorkedAttendance(row);

      if (scheduled > 0) cur.scheduled_days += 1;

      if (isLateAttendanceCandidate(row) && lateMinutes > 0) {
        cur.late_count += 1;
        cur.late_minutes += lateMinutes;
      }

      if (row.no_show) cur.no_show_days += 1;
      if (row.has_absence_row || (row.absence_type || "").trim()) cur.absence_days += 1;
      if (isProblemAbsence(row)) cur.problem_absence_days += 1;

      if (worked && row.missing_check_in) {
        cur.missing_punch_count += 1;
        cur.missing_in_count += 1;
      }
      if (worked && row.missing_check_out) {
        cur.missing_punch_count += 1;
        cur.missing_out_count += 1;
      }

      if (worked) {
        cur.overtime_minutes += Number(row.overtime_minutes ?? 0);
      }

      const comp = calculateComplianceRate(row);
      if (comp != null) {
        cur.compliance_total += comp;
        cur.compliance_days += 1;
      }

      const isPerfect =
        scheduled > 0 &&
        actual >= scheduled &&
        !row.no_show &&
        !row.missing_check_in &&
        !row.missing_check_out &&
        !row.branch_mismatch &&
        effectiveLateMinutes(row) === 0 &&
        Number(row.early_leave_minutes ?? 0) === 0;

      if (isPerfect) cur.perfect_days += 1;

      m.set(name, cur);
    }

    return Array.from(m.values()).map((r) => ({
      ...r,
      compliance_rate:
        r.compliance_days > 0 ? (r.compliance_total / r.compliance_days) * 100 : 0,
    }));
  }, [comparisonRows]);

  const comparisonByBranch = useMemo(() => {
    const m = new Map<
      string,
      {
        branch_code: string;
        late_minutes: number;
        absence_days: number;
        problem_absence_days: number;
        compliance_total: number;
        compliance_days: number;
      }
    >();

    for (const row of comparisonRows) {
      const branch = (
        row.scheduled_branch_code ||
        row.attendance_branch_code ||
        "-"
      ).trim();

      const cur = m.get(branch) || {
        branch_code: branch,
        late_minutes: 0,
        absence_days: 0,
        problem_absence_days: 0,
        compliance_total: 0,
        compliance_days: 0,
      };

      if (isWorkedAttendance(row)) {
        cur.late_minutes += effectiveLateMinutes(row);
      }
      if (row.has_absence_row || (row.absence_type || "").trim()) cur.absence_days += 1;
      if (isProblemAbsence(row)) cur.problem_absence_days += 1;

      const comp = calculateComplianceRate(row);
      if (comp != null) {
        cur.compliance_total += comp;
        cur.compliance_days += 1;
      }

      m.set(branch, cur);
    }

    return Array.from(m.values()).map((r) => ({
      ...r,
      compliance_rate:
        r.compliance_days > 0 ? (r.compliance_total / r.compliance_days) * 100 : 0,
    }));
  }, [comparisonRows]);

  const perfectAttendanceRows = useMemo(
    () =>
      comparisonByStaff
        .filter((r) => r.perfect_days > 0)
        .sort((a, b) => b.perfect_days - a.perfect_days || a.staff_name.localeCompare(b.staff_name))
        .slice(0, 10),
    [comparisonByStaff]
  );

  const topLateRows = useMemo(
    () =>
      comparisonByStaff
        .filter((r) => r.late_count > 0)
        .sort((a, b) => b.late_count - a.late_count || b.late_minutes - a.late_minutes)
        .slice(0, 10),
    [comparisonByStaff]
  );

  const topAbsenceRows = useMemo(
    () =>
      comparisonByStaff
        .filter((r) => r.problem_absence_days > 0)
        .sort((a, b) => b.problem_absence_days - a.problem_absence_days || a.staff_name.localeCompare(b.staff_name))
        .slice(0, 10),
    [comparisonByStaff]
  );

  const topComplianceRows = useMemo(
    () =>
      comparisonByStaff
        .filter((r) => r.compliance_days > 0)
        .sort((a, b) => b.compliance_rate - a.compliance_rate || b.perfect_days - a.perfect_days)
        .slice(0, 10),
    [comparisonByStaff]
  );

  const worstComplianceRows = useMemo(
    () =>
      comparisonByStaff
        .filter((r) => r.compliance_days > 0)
        .sort((a, b) => a.compliance_rate - b.compliance_rate || b.no_show_days - a.no_show_days)
        .slice(0, 10),
    [comparisonByStaff]
  );

  const branchLateRows = useMemo(
    () =>
      comparisonByBranch
        .filter((r) => r.late_minutes > 0)
        .sort((a, b) => b.late_minutes - a.late_minutes)
        .slice(0, 10),
    [comparisonByBranch]
  );

  const branchAbsenceRows = useMemo(
    () =>
      comparisonByBranch
        .filter((r) => r.problem_absence_days > 0)
        .sort((a, b) => b.problem_absence_days - a.problem_absence_days)
        .slice(0, 10),
    [comparisonByBranch]
  );

  const branchComplianceRows = useMemo(
    () =>
      comparisonByBranch
        .filter((r) => r.compliance_days > 0)
        .sort((a, b) => b.compliance_rate - a.compliance_rate)
        .slice(0, 10),
    [comparisonByBranch]
  );

  const bayzatMissingPunchRows = useMemo(
    () =>
      comparisonByStaff
        .filter((r) => r.missing_punch_count > 0)
        .sort((a, b) => b.missing_punch_count - a.missing_punch_count || a.staff_name.localeCompare(b.staff_name))
        .slice(0, 10),
    [comparisonByStaff]
  );

  const filteredStaffAnalyticsRows = useMemo(() => {
    const selected = staffSearch.trim();
    if (!selected) return [];
    return comparisonByStaff
      .filter((row) => row.staff_name === selected)
      .sort((a, b) => a.staff_name.localeCompare(b.staff_name));
  }, [comparisonByStaff, staffSearch]);

  const staffSelectOptions = useMemo(
    () => comparisonByStaff.map((row) => row.staff_name).sort((a, b) => a.localeCompare(b)),
    [comparisonByStaff]
  );

  const currentAnalysisTitle = useMemo(() => {
    switch (viewMode) {
      case "perfect_attendance":
        return "Perfect Attendance";
      case "top_late":
        return "Top 10 Late";
      case "top_absence":
        return "Top 10 Problem Absence";
      case "top_compliance":
        return "Top 10 Compliance";
      case "worst_compliance":
        return "Worst 10 Compliance";
      case "branch_late":
        return "Branch Late Ranking";
      case "branch_absence":
        return "Branch Problem Absence Ranking";
      case "branch_compliance":
        return "Branch Compliance Ranking";
      case "bayzat_missing_punch":
        return "Bayzat Missing Punch Ranking";
      default:
        return "Analytics";
    }
  }, [viewMode]);

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

  const posSalesSummary = useMemo(() => {
    const totalNetSales = posSalesRows.reduce((sum, row) => sum + Number(row.net_revenue || 0), 0);
    const totalGrossSales = posSalesRows.reduce((sum, row) => sum + Number(row.gross_revenue || 0), 0);
    const totalOrders = posSalesRows.reduce(
      (sum, row) => sum + Number(row.order_count_non_cancelled || 0),
      0
    );
    const avgNetPerOrder = totalOrders > 0 ? totalNetSales / totalOrders : 0;
    return {
      totalNetSales,
      totalGrossSales,
      totalOrders,
      avgNetPerOrder,
      dayCount: posSalesRows.length,
    };
  }, [posSalesRows]);

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

  const exportBaseName = `${city}_${summaryDateFrom}_to_${summaryDateTo}${summaryBranchCode ? `_${summaryBranchCode}` : ""}`;

  const branchDailyExportRows = useMemo(
    () =>
      branchDailyRows.map((r) => ({
        work_date: r.work_date,
        branch_code: r.branch_code,
        total_hours: Number(r.total_hours || 0).toFixed(1),
        staff_count: r.staff_count,
        segment_count: r.segment_count,
      })),
    [branchDailyRows]
  );

  const branchWeekdayExportRows = useMemo(
    () =>
      branchWeekdayRows.map((r) => ({
        branch_code: r.branch_code,
        weekday: weekdayLabel(r.weekday),
        avg_hours: Number(r.avg_hours || 0).toFixed(1),
        avg_staff_count: Number(r.avg_staff_count || 0).toFixed(2),
        day_count: r.day_count,
      })),
    [branchWeekdayRows]
  );

  const staffSummaryExportRows = useMemo(
    () =>
      sortedStaffSummaryRows.map((r) => ({
        staff_name: r.staff_name,
        total_hours: Number(r.total_hours || 0).toFixed(1),
        worked_days: r.worked_days,
        segment_count: r.segment_count,
      })),
    [sortedStaffSummaryRows]
  );

  const absenceSummaryExportRows = useMemo(
    () =>
      absenceSummaryRows.map((r) => ({
        absence_type: r.absence_type,
        row_count: r.row_count,
        staff_count: r.staff_count,
        day_count: r.day_count,
      })),
    [absenceSummaryRows]
  );

  const cityComparisonExportRows = useMemo(
    () =>
      [dubaiSummary, manilaSummary]
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
    () =>
      cityDiff
        ? [
            { metric: "total_hours_diff", value: cityDiff.totalHoursDiff.toFixed(1) },
            { metric: "avg_hours_per_day_diff", value: cityDiff.avgHoursPerDayDiff.toFixed(1) },
            { metric: "day_count_diff", value: cityDiff.dayCountDiff },
            { metric: "branch_count_diff", value: cityDiff.branchCountDiff },
          ]
        : [],
    [cityDiff]
  );
  const posSalesExportRows = useMemo(
    () =>
      posSalesRows.map((r) => ({
        work_date: r.work_date,
        city: r.city,
        order_count_total: r.order_count_total,
        order_count_non_cancelled: r.order_count_non_cancelled,
        order_count_completed: r.order_count_completed,
        gross_revenue: Number(r.gross_revenue || 0).toFixed(2),
        net_revenue: Number(r.net_revenue || 0).toFixed(2),
        discounts: Number(r.discounts || 0).toFixed(2),
        charges: Number(r.charges || 0).toFixed(2),
        taxes: Number(r.taxes || 0).toFixed(2),
        subtotal_amount: Number(r.subtotal_amount || 0).toFixed(2),
        source_file_name: r.source_file_name || "",
      })),
    [posSalesRows]
  );

  const posMenuRankingExportRows = useMemo(
    () =>
      posMenuRankingRows.map((r) => ({
        item_name: r.item_name,
        quantity_total: Number(r.quantity_total || 0).toFixed(2),
        order_line_count: r.order_line_count,
        net_sales_total: Number(r.net_sales_total || 0).toFixed(2),
      })),
    [posMenuRankingRows]
  );
  const hasComparisonRows = comparisonRows.length > 0;

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col justify-center px-6 py-10">
        <div className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-8 shadow-2xl">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-neutral-800 bg-black">
              <img src={LOGO_SRC} alt="Sushi ZEN logo" className="h-full w-full object-contain" />
            </div>
            <h1 className="mt-5 text-3xl font-bold">
              {analyticsTab === "staff" ? "Staff Analytics" : "Sales Analytics"}
            </h1>
            <p className="mt-2 text-sm text-neutral-400">
              HQ / ADMIN analysis for historical shift, absence, and attendance data
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setAnalyticsTab("staff")}
                className={[
                  "rounded-xl border px-4 py-2 text-sm font-semibold transition",
                  analyticsTab === "staff"
                    ? "border-amber-500 bg-amber-950/25 text-amber-200"
                    : "border-neutral-700 bg-neutral-950/40 text-neutral-200 hover:bg-neutral-900 hover:text-white",
                ].join(" ")}
              >
                Staff Analytics
              </button>
              <button
                type="button"
                onClick={() => setAnalyticsTab("sales")}
                className={[
                  "rounded-xl border px-4 py-2 text-sm font-semibold transition",
                  analyticsTab === "sales"
                    ? "border-emerald-500 bg-emerald-950/25 text-emerald-200"
                    : "border-neutral-700 bg-neutral-950/40 text-neutral-200 hover:bg-neutral-900 hover:text-white",
                ].join(" ")}
              >
                Sales Analytics
              </button>
            </div>
          </div>

          {analyticsTab === "staff" ? (
          <div className="mt-8 rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-sm font-semibold">Compliance Analytics Period</div>
                <div className="mt-1 text-xs text-neutral-500">
                  Period for late, problem absence, overtime, missing punch, rankings, and individual staff analytics.
                </div>
                <div className="mt-1 text-[11px] text-neutral-500">
                  This period affects only the Compliance section.
                </div>
              </div>

              <button
                type="button"
                onClick={loadComparison}
                disabled={comparisonLoading || !approverName.trim() || !pin.trim()}
                className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-60"
              >
                {comparisonLoading ? "Loading..." : "Refresh Compliance"}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
              <div>
                <div className="mb-1 text-xs text-neutral-400">City</div>
                <select
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
                >
                  <option value="dubai">Dubai</option>
                  <option value="manila">Manila</option>
                </select>
              </div>

              <div>
                <div className="mb-1 text-xs text-neutral-400">Date From</div>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
                />
              </div>

              <div>
                <div className="mb-1 text-xs text-neutral-400">Date To</div>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
                />
              </div>

              <div>
                <div className="mb-1 text-xs text-neutral-400">Compliance Branch</div>
                <select
                  value={branchCode}
                  onChange={(e) => setBranchCode(e.target.value)}
                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
                >
                  {(BRANCH_OPTIONS[city] || [{ value: "", label: "All Branches" }]).map((opt) => (
                    <option key={opt.value || "ALL"} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="mb-1 text-xs text-neutral-400">Comparison Limit</div>
                <input
                  value={comparisonLimit}
                  onChange={(e) => setComparisonLimit(e.target.value)}
                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  setDateTo(todayIso());
                  setDateFrom(addDaysIso(now, -29));
                }}
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-900"
              >
                Last 30 Days
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  const first = new Date(now.getFullYear(), now.getMonth(), 1);
                  setDateFrom(first.toISOString().slice(0, 10));
                  setDateTo(todayIso());
                }}
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-900"
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => setBranchCode("")}
                className="rounded-xl border border-neutral-700 bg-neutral-950/40 px-3 py-2 text-xs font-semibold text-neutral-200 hover:bg-neutral-900"
              >
                Clear Compliance Branch
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs text-neutral-400">Approver Name</div>
                <input
                  value={approverName}
                  onChange={(e) => setApproverName(e.target.value)}
                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-neutral-400">PIN</div>
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
                />
              </div>
            </div>

            {comparisonError ? (
              <div className="mt-4 rounded-2xl border border-rose-900/50 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">
                {comparisonError}
              </div>
            ) : null}
            {!comparisonError && comparisonNotice ? (
              <div className="mt-4 rounded-2xl border border-amber-800/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">
                {comparisonNotice}
              </div>
            ) : null}

            <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-6">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs text-neutral-500">Late Staff</div>
                <div className="mt-1 text-2xl font-bold">
                  {!comparisonLoadedOnce ? "-" : comparisonError ? "Failed" : comparisonSummary.lateStaffCount}
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs text-neutral-500">Late Count</div>
                <div className="mt-1 text-2xl font-bold">
                  {!comparisonLoadedOnce ? "-" : comparisonError ? "Failed" : comparisonSummary.lateEventCount}
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs text-neutral-500">Total Late Minutes</div>
                <div className="mt-1 text-2xl font-bold">
                  {!comparisonLoadedOnce ? "-" : comparisonError ? "Failed" : fmtMinutes(comparisonSummary.lateMinutes)}
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs text-neutral-500">Problem Absence Staff</div>
                <div className="mt-1 text-2xl font-bold">
                  {!comparisonLoadedOnce ? "-" : comparisonError ? "Failed" : comparisonSummary.problemAbsentStaffCount}
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs text-neutral-500">Total OT</div>
                <div className="mt-1 text-2xl font-bold">
                  {!comparisonLoadedOnce ? "-" : comparisonError ? "Failed" : fmtMinutes(comparisonSummary.overtimeMinutes)}
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs text-neutral-500">Missing IN / OUT</div>
                <div className="mt-1 text-lg font-bold">
                  {!comparisonLoadedOnce ? "-" : comparisonError ? "Failed" : `${comparisonSummary.missingInCount} / ${comparisonSummary.missingOutCount}`}
                </div>
              </div>
            </div>
            <div className="mt-2 text-xs text-neutral-400">
              Strict Late (PRESENT + Check In): Staff{" "}
              <span className="text-neutral-200">
                {!comparisonLoadedOnce ? "-" : comparisonError ? "Failed" : comparisonSummary.strictLateStaffCount}
              </span>
              {" / "}Count{" "}
              <span className="text-neutral-200">
                {!comparisonLoadedOnce ? "-" : comparisonError ? "Failed" : comparisonSummary.strictLateEventCount}
              </span>
              {" / "}Minutes{" "}
              <span className="text-neutral-200">
                {!comparisonLoadedOnce ? "-" : comparisonError ? "Failed" : fmtMinutes(comparisonSummary.strictLateMinutes)}
              </span>
            </div>
            {comparisonLoadedOnce && !comparisonError && !comparisonNotice && !hasComparisonRows ? (
              <div className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-950/30 px-4 py-3 text-xs text-neutral-400">
                No comparison rows for this compliance period/filter. Try another branch or date range.
              </div>
            ) : null}

            <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
              <div className="mb-3 text-sm font-semibold">Individual Search</div>
              <select
                value={staffSearch}
                onChange={(e) => setStaffSearch(e.target.value)}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
              >
                <option value="">Select staff</option>
                {staffSelectOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>

              {staffSearch.trim() ? (
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                      <tr>
                        <th className="px-3 py-2">Staff</th>
                        <th className="px-3 py-2">Late Count</th>
                        <th className="px-3 py-2">Late Minutes</th>
                        <th className="px-3 py-2">Problem Absence Days</th>
                        <th className="px-3 py-2">Total OT</th>
                        <th className="px-3 py-2">Missing IN</th>
                        <th className="px-3 py-2">Missing OUT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStaffAnalyticsRows.length ? (
                        filteredStaffAnalyticsRows.map((row) => (
                          <tr key={row.staff_name} className="border-b border-neutral-800/70">
                            <td className="px-3 py-2">{row.staff_name}</td>
                            <td className="px-3 py-2">{row.late_count}</td>
                            <td className="px-3 py-2">{fmtMinutes(row.late_minutes)}</td>
                            <td className="px-3 py-2">{row.problem_absence_days}</td>
                            <td className="px-3 py-2">{fmtMinutes(row.overtime_minutes)}</td>
                            <td className="px-3 py-2">{row.missing_in_count}</td>
                            <td className="px-3 py-2">{row.missing_out_count}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="px-3 py-6 text-center text-neutral-500">
                            No matching staff
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {[
                ["perfect_attendance", "Perfect Attendance"],
                ["top_late", "Top 10 Late"],
                ["top_absence", "Top 10 Problem Absence"],
                ["top_compliance", "Top 10 Compliance"],
                ["worst_compliance", "Worst 10 Compliance"],
                ["branch_late", "Branch Late Ranking"],
                ["branch_absence", "Branch Problem Absence Ranking"],
                ["branch_compliance", "Branch Compliance Ranking"],
                ["bayzat_missing_punch", "Bayzat Missing Punch Ranking"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setViewMode(key as AnalyticsViewMode)}
                  className={[
                    "rounded-xl border px-4 py-2 text-sm transition",
                    viewMode === key
                      ? "border-amber-500 bg-amber-950/25 text-amber-200"
                      : "border-neutral-800 bg-neutral-950/30 text-neutral-200 hover:bg-neutral-900/40 hover:text-white",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
              <div className="mb-3 text-sm font-semibold">{currentAnalysisTitle}</div>

              <div className="overflow-x-auto">
                {viewMode === "perfect_attendance" ? (
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                      <tr>
                        <th className="px-3 py-2">Rank</th>
                        <th className="px-3 py-2">Staff</th>
                        <th className="px-3 py-2">Perfect Days</th>
                        <th className="px-3 py-2">Scheduled Days</th>
                        <th className="px-3 py-2">Compliance %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {perfectAttendanceRows.length ? (
                        perfectAttendanceRows.map((row, idx) => (
                          <tr key={`${row.staff_name}-${idx}`} className="border-b border-neutral-800/70">
                            <td className="px-3 py-2">{idx + 1}</td>
                            <td className="px-3 py-2">{row.staff_name}</td>
                            <td className="px-3 py-2">{row.perfect_days}</td>
                            <td className="px-3 py-2">{row.scheduled_days}</td>
                            <td className="px-3 py-2">{row.compliance_rate.toFixed(1)}%</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-3 py-6 text-center text-neutral-500">
                            No perfect attendance data
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : null}

                {viewMode === "top_late" ? (
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                      <tr>
                        <th className="px-3 py-2">Rank</th>
                        <th className="px-3 py-2">Staff</th>
                        <th className="px-3 py-2">Late Count</th>
                        <th className="px-3 py-2">Late Minutes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topLateRows.length ? (
                        topLateRows.map((row, idx) => (
                          <tr key={`${row.staff_name}-${idx}`} className="border-b border-neutral-800/70">
                            <td className="px-3 py-2">{idx + 1}</td>
                            <td className="px-3 py-2">{row.staff_name}</td>
                            <td className="px-3 py-2">{row.late_count}</td>
                            <td className="px-3 py-2">{fmtMinutes(row.late_minutes)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="px-3 py-6 text-center text-neutral-500">
                            No late data
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : null}

                {viewMode === "top_absence" ? (
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                      <tr>
                        <th className="px-3 py-2">Rank</th>
                        <th className="px-3 py-2">Staff</th>
                        <th className="px-3 py-2">Problem Absence Days</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topAbsenceRows.length ? (
                        topAbsenceRows.map((row, idx) => (
                          <tr key={`${row.staff_name}-${idx}`} className="border-b border-neutral-800/70">
                            <td className="px-3 py-2">{idx + 1}</td>
                            <td className="px-3 py-2">{row.staff_name}</td>
                            <td className="px-3 py-2">{row.problem_absence_days}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} className="px-3 py-6 text-center text-neutral-500">
                            No absence data
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : null}

                {viewMode === "top_compliance" ? (
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                      <tr>
                        <th className="px-3 py-2">Rank</th>
                        <th className="px-3 py-2">Staff</th>
                        <th className="px-3 py-2">Compliance %</th>
                        <th className="px-3 py-2">Scheduled Days</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topComplianceRows.length ? (
                        topComplianceRows.map((row, idx) => (
                          <tr key={`${row.staff_name}-${idx}`} className="border-b border-neutral-800/70">
                            <td className="px-3 py-2">{idx + 1}</td>
                            <td className="px-3 py-2">{row.staff_name}</td>
                            <td className="px-3 py-2">{row.compliance_rate.toFixed(1)}%</td>
                            <td className="px-3 py-2">{row.scheduled_days}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="px-3 py-6 text-center text-neutral-500">
                            No compliance data
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : null}

                {viewMode === "worst_compliance" ? (
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                      <tr>
                        <th className="px-3 py-2">Rank</th>
                        <th className="px-3 py-2">Staff</th>
                        <th className="px-3 py-2">Compliance %</th>
                        <th className="px-3 py-2">No-show Days</th>
                      </tr>
                    </thead>
                    <tbody>
                      {worstComplianceRows.length ? (
                        worstComplianceRows.map((row, idx) => (
                          <tr key={`${row.staff_name}-${idx}`} className="border-b border-neutral-800/70">
                            <td className="px-3 py-2">{idx + 1}</td>
                            <td className="px-3 py-2">{row.staff_name}</td>
                            <td className="px-3 py-2">{row.compliance_rate.toFixed(1)}%</td>
                            <td className="px-3 py-2">{row.no_show_days}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="px-3 py-6 text-center text-neutral-500">
                            No compliance data
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : null}

                {viewMode === "branch_late" ? (
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                      <tr>
                        <th className="px-3 py-2">Rank</th>
                        <th className="px-3 py-2">Branch</th>
                        <th className="px-3 py-2">Late Minutes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {branchLateRows.length ? (
                        branchLateRows.map((row, idx) => (
                          <tr key={`${row.branch_code}-${idx}`} className="border-b border-neutral-800/70">
                            <td className="px-3 py-2">{idx + 1}</td>
                            <td className="px-3 py-2">{row.branch_code}</td>
                            <td className="px-3 py-2">{fmtMinutes(row.late_minutes)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} className="px-3 py-6 text-center text-neutral-500">
                            No branch late data
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : null}

                {viewMode === "branch_absence" ? (
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                      <tr>
                        <th className="px-3 py-2">Rank</th>
                        <th className="px-3 py-2">Branch</th>
                        <th className="px-3 py-2">Problem Absence Days</th>
                      </tr>
                    </thead>
                    <tbody>
                      {branchAbsenceRows.length ? (
                        branchAbsenceRows.map((row, idx) => (
                          <tr key={`${row.branch_code}-${idx}`} className="border-b border-neutral-800/70">
                            <td className="px-3 py-2">{idx + 1}</td>
                            <td className="px-3 py-2">{row.branch_code}</td>
                            <td className="px-3 py-2">{row.problem_absence_days}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} className="px-3 py-6 text-center text-neutral-500">
                            No branch absence data
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : null}

                {viewMode === "branch_compliance" ? (
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                      <tr>
                        <th className="px-3 py-2">Rank</th>
                        <th className="px-3 py-2">Branch</th>
                        <th className="px-3 py-2">Compliance %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {branchComplianceRows.length ? (
                        branchComplianceRows.map((row, idx) => (
                          <tr key={`${row.branch_code}-${idx}`} className="border-b border-neutral-800/70">
                            <td className="px-3 py-2">{idx + 1}</td>
                            <td className="px-3 py-2">{row.branch_code}</td>
                            <td className="px-3 py-2">{row.compliance_rate.toFixed(1)}%</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} className="px-3 py-6 text-center text-neutral-500">
                            No branch compliance data
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : null}

                {viewMode === "bayzat_missing_punch" ? (
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                      <tr>
                        <th className="px-3 py-2">Rank</th>
                        <th className="px-3 py-2">Staff</th>
                        <th className="px-3 py-2">Missing Punch Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bayzatMissingPunchRows.length ? (
                        bayzatMissingPunchRows.map((row, idx) => (
                          <tr key={`${row.staff_name}-${idx}`} className="border-b border-neutral-800/70">
                            <td className="px-3 py-2">{idx + 1}</td>
                            <td className="px-3 py-2">{row.staff_name}</td>
                            <td className="px-3 py-2">{row.missing_punch_count}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} className="px-3 py-6 text-center text-neutral-500">
                            No missing punch data
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : null}
              </div>
            </div>
          </div>
          ) : (
          <div className="mt-8 space-y-4">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-sm font-semibold">Sales Analytics Period</div>
                  <div className="mt-1 text-xs text-neutral-500">
                    Net sales, gross revenue, order count, and menu ranking from POS files.
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => loadAll()}
                    disabled={loading || !approverName.trim() || !pin.trim()}
                    className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-60"
                  >
                    {loading ? "Loading..." : "Refresh Sales"}
                  </button>
                  <button
                    type="button"
                    onClick={syncSalesNow}
                    disabled={salesSyncing || !approverName.trim() || !pin.trim()}
                    className="rounded-2xl border border-emerald-700 bg-emerald-950/30 px-4 py-3 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-900/40 disabled:opacity-60"
                  >
                    {salesSyncing ? "Syncing..." : "Sync Latest POS"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div>
                  <div className="mb-1 text-xs text-neutral-400">City</div>
                  <select
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
                  >
                    <option value="dubai">Dubai</option>
                    <option value="manila">Manila</option>
                  </select>
                </div>
                <div>
                  <div className="mb-1 text-xs text-neutral-400">Summary Date From</div>
                  <input
                    type="date"
                    value={summaryDateFrom}
                    onChange={(e) => setSummaryDateFrom(e.target.value)}
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs text-neutral-400">Summary Date To</div>
                  <input
                    type="date"
                    value={summaryDateTo}
                    onChange={(e) => setSummaryDateTo(e.target.value)}
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs text-neutral-400">Summary Branch</div>
                  <select
                    value={summaryBranchCode}
                    onChange={(e) => setSummaryBranchCode(e.target.value)}
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
                  >
                    {(BRANCH_OPTIONS[city] || [{ value: "", label: "All Branches" }]).map((opt) => (
                      <option key={opt.value || "ALL"} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs text-neutral-400">Approver Name</div>
                  <input
                    value={approverName}
                    onChange={(e) => setApproverName(e.target.value)}
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs text-neutral-400">PIN</div>
                  <input
                    type="password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
                  />
                </div>
              </div>
              {salesSyncMessage ? (
                <div className="mt-3 rounded-xl border border-neutral-700 bg-neutral-950/40 px-3 py-2 text-xs text-neutral-300">
                  {salesSyncMessage}
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs text-neutral-500">Net Sales Volume</div>
                <div className="mt-1 text-2xl font-bold">{posSalesSummary.totalNetSales.toFixed(2)}</div>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs text-neutral-500">Gross Revenue</div>
                <div className="mt-1 text-2xl font-bold">{posSalesSummary.totalGrossSales.toFixed(2)}</div>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs text-neutral-500">Order Count</div>
                <div className="mt-1 text-2xl font-bold">{posSalesSummary.totalOrders}</div>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs text-neutral-500">Avg Net / Order</div>
                <div className="mt-1 text-2xl font-bold">{posSalesSummary.avgNetPerOrder.toFixed(2)}</div>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs text-neutral-500">POS Days</div>
                <div className="mt-1 text-2xl font-bold">{posSalesSummary.dayCount}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">Top Menu Ranking (By Quantity)</div>
                <button
                  type="button"
                  onClick={() => downloadCsv(`${exportBaseName}_pos_menu_ranking.csv`, posMenuRankingExportRows)}
                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-900"
                >
                  Export Ranking CSV
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                    <tr>
                      <th className="px-3 py-2">Rank</th>
                      <th className="px-3 py-2">Item</th>
                      <th className="px-3 py-2">Quantity</th>
                      <th className="px-3 py-2">Order Lines</th>
                      <th className="px-3 py-2">Net Sales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {posMenuRankingRows.slice(0, 50).map((row, idx) => (
                      <tr key={`${row.item_name}-${idx}`} className="border-b border-neutral-800/70">
                        <td className="px-3 py-2">{idx + 1}</td>
                        <td className="px-3 py-2">{row.item_name}</td>
                        <td className="px-3 py-2">{Number(row.quantity_total || 0).toFixed(2)}</td>
                        <td className="px-3 py-2">{row.order_line_count}</td>
                        <td className="px-3 py-2">{Number(row.net_sales_total || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                    {!posMenuRankingRows.length ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-neutral-500">
                          No menu ranking data
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">Store Order Ranking</div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                    <tr>
                      <th className="px-3 py-2">Rank</th>
                      <th className="px-3 py-2">Store</th>
                      <th className="px-3 py-2">Orders</th>
                      <th className="px-3 py-2">Net Sales</th>
                      <th className="px-3 py-2">Gross Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {posBranchOrderRows.slice(0, 30).map((row, idx) => (
                      <tr key={`${row.branch_name}-${idx}`} className="border-b border-neutral-800/70">
                        <td className="px-3 py-2">{idx + 1}</td>
                        <td className="px-3 py-2">{row.branch_name}</td>
                        <td className="px-3 py-2">{row.order_count_non_cancelled}</td>
                        <td className="px-3 py-2">{Number(row.net_revenue || 0).toFixed(2)}</td>
                        <td className="px-3 py-2">{Number(row.gross_revenue || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                    {!posBranchOrderRows.length ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-neutral-500">
                          No store order data
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">Sales Daily Details</div>
                <button
                  type="button"
                  onClick={() => downloadCsv(`${exportBaseName}_pos_sales_daily.csv`, posSalesExportRows)}
                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-900"
                >
                  Export Sales CSV
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Orders</th>
                      <th className="px-3 py-2">Gross</th>
                      <th className="px-3 py-2">Net</th>
                      <th className="px-3 py-2">Discounts</th>
                      <th className="px-3 py-2">Charges</th>
                    </tr>
                  </thead>
                  <tbody>
                    {posSalesRows.map((row) => (
                      <tr key={`${row.city}-${row.work_date}`} className="border-b border-neutral-800/70">
                        <td className="px-3 py-2">{row.work_date}</td>
                        <td className="px-3 py-2">{row.order_count_non_cancelled}</td>
                        <td className="px-3 py-2">{Number(row.gross_revenue || 0).toFixed(2)}</td>
                        <td className="px-3 py-2">{Number(row.net_revenue || 0).toFixed(2)}</td>
                        <td className="px-3 py-2">{Number(row.discounts || 0).toFixed(2)}</td>
                        <td className="px-3 py-2">{Number(row.charges || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                    {!posSalesRows.length ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-neutral-500">
                          No sales data
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          )}

          <div className="mt-8 rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-sm font-semibold">Summary Analytics Period</div>
                <div className="mt-1 text-xs text-neutral-500">
                  Period for total hours, top staff, city comparison, branch totals, and summary tables.
                </div>
                <div className="mt-1 text-[11px] text-neutral-500">
                  This period affects only the Summary section.
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  loadAll();
                }}
                disabled={loading || !approverName.trim() || !pin.trim()}
                className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-60"
              >
                {loading ? "Loading..." : "Refresh Summary"}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div>
                <div className="mb-1 text-xs text-neutral-400">Summary Date From</div>
                <input
                  type="date"
                  value={summaryDateFrom}
                  onChange={(e) => setSummaryDateFrom(e.target.value)}
                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
                />
              </div>

              <div>
                <div className="mb-1 text-xs text-neutral-400">Summary Date To</div>
                <input
                  type="date"
                  value={summaryDateTo}
                  onChange={(e) => setSummaryDateTo(e.target.value)}
                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
                />
              </div>
              
              <div>
                <div className="mb-1 text-xs text-neutral-400">Summary Branch</div>
                <select
                  value={summaryBranchCode}
                  onChange={(e) => setSummaryBranchCode(e.target.value)}
                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
                >
                  {(BRANCH_OPTIONS[city] || [{ value: "", label: "All Branches" }]).map((opt) => (
                    <option key={opt.value || "ALL"} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => {
                    const r = CITY_DEFAULT_RANGE[city] || { from: "2025-11-01", to: "2026-03-31" };
                    setSummaryDateFrom(r.from);
                    setSummaryDateTo(r.to);
                  }}
                  className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm font-semibold text-white hover:bg-neutral-900"
                >
                  Reset Summary Period
                </button>
              </div>
            </div>
          </div>

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
                <span
                  className={[
                    "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                    absenceBadgeClass(summary.topAbsenceType),
                  ].join(" ")}
                >
                  {summary.topAbsenceType}
                </span>
              </div>
              <div className="mt-2 text-sm text-neutral-400">{summary.topAbsenceRows} rows</div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-5">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
              <div className="text-xs text-neutral-500">Net Sales Volume</div>
              <div className="mt-1 text-2xl font-bold">{posSalesSummary.totalNetSales.toFixed(2)}</div>
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
              <div className="text-xs text-neutral-500">Gross Revenue</div>
              <div className="mt-1 text-2xl font-bold">{posSalesSummary.totalGrossSales.toFixed(2)}</div>
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
              <div className="text-xs text-neutral-500">Order Count (Non-Cancelled)</div>
              <div className="mt-1 text-2xl font-bold">{posSalesSummary.totalOrders}</div>
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
              <div className="text-xs text-neutral-500">Avg Net / Order</div>
              <div className="mt-1 text-2xl font-bold">{posSalesSummary.avgNetPerOrder.toFixed(2)}</div>
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
              <div className="text-xs text-neutral-500">POS Days Loaded</div>
              <div className="mt-1 text-2xl font-bold">{posSalesSummary.dayCount}</div>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold">City Comparison</div>
              <button
                type="button"
                onClick={() => downloadCsv(`${exportBaseName}_city_comparison.csv`, cityComparisonExportRows)}
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-900"
              >
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
                          <div className="mt-1 text-xs text-neutral-500">
                            {s.date_from} → {s.date_to}
                          </div>
                        </div>
                        <span
                          className={[
                            "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                            s.city === "dubai"
                              ? "border-sky-900/40 bg-sky-950/10 text-sky-200"
                              : "border-emerald-900/40 bg-emerald-950/10 text-emerald-200",
                          ].join(" ")}
                        >
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
                            <span
                              className={[
                                "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                                branchBadgeClass(s.top_branch),
                              ].join(" ")}
                            >
                              {s.top_branch || "-"}
                            </span>
                          </div>
                          <div className="mt-2 text-sm text-neutral-300">
                            {Number(s.top_branch_hours || 0).toFixed(1)} hrs
                          </div>
                        </div>

                        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
                          <div className="text-[11px] text-neutral-500">Top Absence</div>
                          <div className="mt-2">
                            <span
                              className={[
                                "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                                absenceBadgeClass(s.top_absence_type),
                              ].join(" ")}
                            >
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
              <button
                type="button"
                onClick={() => downloadCsv(`${exportBaseName}_city_difference.csv`, cityDiffExportRows)}
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-900"
              >
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
              <select
                value={branchSortBy}
                onChange={(e) =>
                  setBranchSortBy(e.target.value as "totalHours" | "avgHoursPerDay" | "maxStaff" | "branch")
                }
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold text-white"
              >
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
                    <span
                      className={[
                        "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                        branchBadgeClass(b.branch),
                      ].join(" ")}
                    >
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
                  <div className="mt-1 text-xs text-neutral-500">
                    Daily total hours, staff count, and segment count by branch.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => downloadCsv(`${exportBaseName}_branch_daily_hours.csv`, branchDailyExportRows)}
                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-900"
                >
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
                          <span
                            className={[
                              "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                              branchBadgeClass(row.branch_code),
                            ].join(" ")}
                          >
                            {row.branch_code || "-"}
                          </span>
                        </td>
                        <td className="px-3 py-2">{Number(row.total_hours || 0).toFixed(1)}</td>
                        <td className="px-3 py-2">{row.staff_count}</td>
                        <td className="px-3 py-2">{row.segment_count}</td>
                      </tr>
                    ))}
                    {!branchDailyRows.length ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-neutral-500">
                          No data
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Top Menu Ranking (By Quantity)</div>
                  <div className="mt-1 text-xs text-neutral-500">
                    Items-wise order transactions ranking for selected city and summary period.
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => downloadCsv(`${exportBaseName}_pos_sales_daily.csv`, posSalesExportRows)}
                    className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-900"
                  >
                    Export Sales CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadCsv(`${exportBaseName}_pos_menu_ranking.csv`, posMenuRankingExportRows)}
                    className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-900"
                  >
                    Export Ranking CSV
                  </button>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                    <tr>
                      <th className="px-3 py-2">Rank</th>
                      <th className="px-3 py-2">Item</th>
                      <th className="px-3 py-2">Quantity</th>
                      <th className="px-3 py-2">Order Lines</th>
                      <th className="px-3 py-2">Net Sales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {posMenuRankingRows.slice(0, 30).map((row, idx) => (
                      <tr key={`${row.item_name}-${idx}`} className="border-b border-neutral-800/70">
                        <td className="px-3 py-2">{idx + 1}</td>
                        <td className="px-3 py-2">{row.item_name}</td>
                        <td className="px-3 py-2">{Number(row.quantity_total || 0).toFixed(2)}</td>
                        <td className="px-3 py-2">{row.order_line_count}</td>
                        <td className="px-3 py-2">{Number(row.net_sales_total || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                    {!posMenuRankingRows.length ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-neutral-500">
                          No menu ranking data
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Branch Weekday Averages</div>
                  <div className="mt-1 text-xs text-neutral-500">
                    Average hours and average staff count by weekday.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    downloadCsv(`${exportBaseName}_branch_weekday_averages.csv`, branchWeekdayExportRows)
                  }
                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-900"
                >
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
                          <span
                            className={[
                              "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                              branchBadgeClass(row.branch_code),
                            ].join(" ")}
                          >
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
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-neutral-500">
                          No data
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Staff Work Summary</div>
                  <div className="mt-1 text-xs text-neutral-500">
                    Top staff by total hours in the selected period.
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={staffSortBy}
                    onChange={(e) => setStaffSortBy(e.target.value as "hours" | "days" | "segments" | "name")}
                    className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold text-white"
                  >
                    <option value="hours">Sort: Hours</option>
                    <option value="days">Sort: Days</option>
                    <option value="segments">Sort: Segments</option>
                    <option value="name">Sort: Name</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => downloadCsv(`${exportBaseName}_staff_work_summary.csv`, staffSummaryExportRows)}
                    className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-900"
                  >
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
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-neutral-500">
                          No data
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Absence Summary</div>
                  <div className="mt-1 text-xs text-neutral-500">
                    Absence totals by type for the selected period.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => downloadCsv(`${exportBaseName}_absence_summary.csv`, absenceSummaryExportRows)}
                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-900"
                >
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
                          <span
                            className={[
                              "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                              absenceBadgeClass(row.absence_type),
                            ].join(" ")}
                          >
                            {row.absence_type}
                          </span>
                        </td>
                        <td className="px-3 py-2">{row.row_count}</td>
                        <td className="px-3 py-2">{row.staff_count}</td>
                        <td className="px-3 py-2">{row.day_count}</td>
                      </tr>
                    ))}
                    {!absenceSummaryRows.length ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-neutral-500">
                          No data
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-col items-center gap-3 text-sm text-neutral-400 sm:flex-row sm:justify-between">
            <Link href="/admin" className="hover:text-white">← Back to Admin Dashboard</Link>
            <div className="flex flex-wrap gap-3">
              <Link href="/admin/attendance" className="hover:text-white">Attendance Admin</Link>
              <Link href="/admin/staff" className="hover:text-white">Staff Master</Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}