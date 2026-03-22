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

type PosSalesDailyTotals = {
  net_revenue: number;
  gross_revenue: number;
  order_count_non_cancelled: number;
  day_count: number;
};

type PosSalesDailyResp = { ok: boolean; items: PosSalesDailyRow[]; totals?: PosSalesDailyTotals };

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

type PosBrandOrderRow = {
  brand_name: string;
  order_count_non_cancelled: number;
  gross_revenue: number;
  net_revenue: number;
};
type PosBrandOrderResp = { ok: boolean; items: PosBrandOrderRow[] };

type PosBranchDailyRow = {
  work_date: string;
  city: string;
  branch_name: string;
  order_count_non_cancelled: number;
  gross_revenue: number;
  net_revenue: number;
};

type PosBranchDailyResp = { ok: boolean; items: PosBranchDailyRow[] };

type HourlySalesAnalyticsRow = {
  hour_of_day: number;
  hour_label: string;
  net_sales: number;
  order_count_non_cancelled: number;
  labor_hours_total: number;
  avg_staff_count: number;
  peak_staff_count: number;
  staffed_instances: number;
  staffed_day_count: number;
  orders_per_labor_hour: number;
  orders_per_staff: number;
  avg_orders_per_day: number;
};

type HourlySalesAnalyticsResp = {
  ok: boolean;
  city: string;
  date_from: string;
  date_to: string;
  scope: "company" | "store";
  store_name?: string;
  branch_code?: string;
  available_stores?: string[];
  rows: HourlySalesAnalyticsRow[];
  totals?: {
    net_sales: number;
    order_count_non_cancelled: number;
    labor_hours_total: number;
    orders_per_labor_hour: number;
    orders_per_staff: number;
    hour_count: number;
    month_count: number;
    day_count: number;
  };
  peak_hour?: HourlySalesAnalyticsRow | null;
};

type PayrollStaffRow = {
  month_key: string;
  city: string;
  staff_name: string;
  employee_id: string;
  department: string;
  office: string;
  currency: string;
  basic_salary: number;
  accommodation: number;
  food_allowance: number;
  other_allowance: number;
  transportation: number;
  gross_pay: number;
  work_expenses: number;
  net_additions: number;
  net_deductions: number;
  arrears_addition: number;
  arrears_deduction: number;
  total_net_pay: number;
  pending: number;
  unpaid: number;
  processed: number;
  payment_method: string;
};
type PayrollStaffResp = { ok: boolean; items: PayrollStaffRow[] };

type FinanceLaborRatioResp = {
  ok: boolean;
  city: string;
  date_from: string;
  date_to: string;
  sales_total: number;
  sales_total_pos_reference?: number;
  payroll_total: number;
  sales_basis?: string;
  payroll_basis?: string;
  fallback_note?: string;
  labor_ratio: number;
  target_lines: { food: number; labor: number; rent: number; other: number };
  break_even_sales: number;
  estimated_profit_using_targets: number;
  period_days?: number;
  avg_daily_sales?: number;
  avg_daily_estimated_profit?: number;
  implied_costs_at_target_pct?: {
    food: number;
    rent: number;
    other: number;
    labor_target_abs: number;
  };
  cost_model_note?: string;
};

type PlVsTargetBucketStd = {
  key: string;
  target_pct: number;
  target_amount: number;
  actual_amount: number;
  actual_pct_of_net_sales_pos: number;
  target_pct_display: number;
  variance_amount: number;
  variance_pct_points: number;
  basis: string;
};

type PlVsTargetBucketLabor = {
  key: string;
  target_pct: number;
  target_amount: number;
  actual_payroll_bayzat: number;
  actual_pl_lines: number;
  actual_pct_of_net_sales_pos_payroll: number;
  actual_pct_of_net_sales_pos_pl: number;
  variance_amount_vs_target: number;
  variance_pl_vs_payroll: number;
  basis: string;
};

type PlVsTargetResp = {
  ok: boolean;
  month_key?: string;
  city?: string;
  scope?: "company" | "store";
  store_name?: string;
  available_stores?: string[];
  missing_store?: boolean;
  detail?: string;
  net_sales_pos?: number;
  analysis_sales?: number;
  analysis_sales_basis?: string;
  revenue_pl?: number;
  revenue_pl_minus_pos?: number | null;
  rollup?: {
    rollup_residual: number;
    revenue_pl?: number;
    food?: number;
    labor_pl?: number;
    rent?: number;
    other?: number;
    flr_cost_total?: number;
    profit_pl?: number;
    total_opex_modeled?: number;
  };
  targets?: { food: number; labor: number; rent: number; other: number };
  buckets?: {
    food: PlVsTargetBucketStd;
    rent: PlVsTargetBucketStd;
    other: PlVsTargetBucketStd;
    labor: PlVsTargetBucketLabor;
  };
  checks?: { rollup_residual_abs: number; note?: string };
  pl_import?: { imported_at?: string; sheet_name?: string; source?: string };
};

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

const DUBAI_PL_SCOPE_CODES = ["BB", "JLT", "MC", "AM", "AB"] as const;
const DUBAI_PL_SCOPE_LABELS: Record<(typeof DUBAI_PL_SCOPE_CODES)[number], string> = {
  BB: "Business Bay",
  JLT: "JLT",
  MC: "Motor City",
  AM: "Al Mina",
  AB: "Al Barsha",
};

const moneyFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const integerFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

function formatMoney(value: number) {
  if (!Number.isFinite(value)) return "—";
  return moneyFormatter.format(value);
}

function formatCount(value: number) {
  if (!Number.isFinite(value)) return "—";
  return integerFormatter.format(value);
}

function formatDecimal(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatPct(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

/** Previous calendar month (local date), e.g. in March 2026 → Feb 1–28, 2026 */
function previousCalendarMonthRangeIso(): { from: string; to: string } {
  const now = new Date();
  const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
  const firstDayPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  const from = `${firstDayPrevMonth.getFullYear()}-${pad(firstDayPrevMonth.getMonth() + 1)}-${pad(firstDayPrevMonth.getDate())}`;
  const to = `${lastDayPrevMonth.getFullYear()}-${pad(lastDayPrevMonth.getMonth() + 1)}-${pad(lastDayPrevMonth.getDate())}`;
  return { from, to };
}

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

function mapStoreToBranchCode(raw: string) {
  const x = (raw || "").toLowerCase();
  if (x.includes("business bay")) return "BB";
  if (x.includes("jlt")) return "JLT";
  if (x.includes("arjan")) return "ARJ";
  if (x.includes("barsha")) return "AB";
  if (x.includes("motor city")) return "MC";
  if (x.includes("mina") || x.includes("hudaiba") || x.includes("wasl")) return "AM";
  if (x.includes("sharjah")) return "SH";
  if (x.includes("paranaque") || x.includes("parañaque")) return "PAR";
  if (x.includes("taft")) return "TAFT";
  if (x.includes("cubao")) return "CUBAO";
  if (x.includes("central kitchen")) return "CK";
  return "";
}

function branchLabelFromCode(code: string, city: string) {
  const match = (BRANCH_OPTIONS[city] || []).find((opt) => opt.value === code);
  return match?.label || code;
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

function median(nums: number[]) {
  if (!nums.length) return 0;
  const arr = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(arr.length / 2);
  if (arr.length % 2 === 0) return (arr[mid - 1] + arr[mid]) / 2;
  return arr[mid];
}

function monthKeysBetween(dateFrom: string, dateTo: string): string[] {
  if (!dateFrom || !dateTo) return [];
  const start = new Date(`${dateFrom}T00:00:00`);
  const end = new Date(`${dateTo}T00:00:00`);
  const keys: string[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    keys.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
    cur.setMonth(cur.getMonth() + 1);
  }
  return keys;
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
  const [summaryDateFrom, setSummaryDateFrom] = useState(() => previousCalendarMonthRangeIso().from);
  const [summaryDateTo, setSummaryDateTo] = useState(() => previousCalendarMonthRangeIso().to);
  const [payrollStaffName, setPayrollStaffName] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [summaryBranchCode, setSummaryBranchCode] = useState("");
  const [summaryBrandName, setSummaryBrandName] = useState("");
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
  const [posSalesRangeTotals, setPosSalesRangeTotals] = useState<PosSalesDailyTotals | null>(null);
  const [posMenuRankingRows, setPosMenuRankingRows] = useState<PosMenuRankingRow[]>([]);
  const [posBranchOrderRows, setPosBranchOrderRows] = useState<PosBranchOrderRow[]>([]);
  const [posBrandOrderRows, setPosBrandOrderRows] = useState<PosBrandOrderRow[]>([]);
  const [posBranchDailyRows, setPosBranchDailyRows] = useState<PosBranchDailyRow[]>([]);
  const [hourlySalesAnalytics, setHourlySalesAnalytics] = useState<HourlySalesAnalyticsResp | null>(null);
  const [hourlyLoadError, setHourlyLoadError] = useState("");
  const [hourlyStoreName, setHourlyStoreName] = useState("");
  const [salesComparisonRows, setSalesComparisonRows] = useState<ComparisonItem[]>([]);
  const [payrollRows, setPayrollRows] = useState<PayrollStaffRow[]>([]);
  const [financeRatio, setFinanceRatio] = useState<FinanceLaborRatioResp | null>(null);
  const [plVsTarget, setPlVsTarget] = useState<PlVsTargetResp | null>(null);
  const [salesPlSummary, setSalesPlSummary] = useState<PlVsTargetResp | null>(null);
  const [plUploading, setPlUploading] = useState(false);
  const [plUploadMessage, setPlUploadMessage] = useState("");
  const [plStoreName, setPlStoreName] = useState("");

  /** Aligns UI with backend: profit = net_sales − payroll − food@target − rent@target − other@target */
  const financeBreakdown = useMemo(() => {
    const fr = financeRatio;
    if (!fr?.ok) return null;
    const sales = Number(fr.sales_total || 0);
    const payroll = Number(fr.payroll_total || 0);
    const ic = fr.implied_costs_at_target_pct;
    const food = Number(ic?.food ?? 0);
    const rent = Number(ic?.rent ?? 0);
    const other = Number(ic?.other ?? 0);
    const laborTargetAbs = Number(ic?.labor_target_abs ?? 0);
    const totalModeledCost = food + rent + other + payroll;
    const profitFromApi = Number(fr.estimated_profit_using_targets || 0);
    const profitCheck = sales - totalModeledCost;
    const tgt = fr.target_lines;
    const pct = (num: number) => (sales > 0 ? (num / sales) * 100 : 0);
    return {
      sales,
      payroll,
      food,
      rent,
      other,
      laborTargetAbs,
      totalModeledCost,
      profitFromApi,
      profitCheck,
      laborVsTargetDiff: payroll - laborTargetAbs,
      tgt,
      pctFood: pct(food),
      pctRent: pct(rent),
      pctOther: pct(other),
      pctLaborActual: pct(payroll),
      pctLaborTarget: (tgt?.labor ?? 0) * 100,
    };
  }, [financeRatio]);

  // Prefer imported P&L for top KPI cards when available,
  // so the headline numbers align with workbook totals.
  const plHeadline = useMemo(() => {
    const p = plVsTarget;
    if (!p?.ok) return null;
    if (plStoreName.trim() && p.scope !== "store") return null;
    const revenue = Number(p.revenue_pl || 0);
    const opex = Number(p.rollup?.total_opex_modeled ?? 0);
    const laborPl = Number(p.rollup?.labor_pl ?? 0);
    const flrCost = Number(
      p.rollup?.flr_cost_total ?? (Number(p.rollup?.food ?? 0) + laborPl + Number(p.rollup?.rent ?? 0))
    );
    const otherExpenses = Number(p.rollup?.other ?? 0);
    const profit = Number(p.rollup?.profit_pl ?? revenue - opex);
    const laborRatioPct = revenue > 0 ? (laborPl / revenue) * 100 : 0;
    return {
      revenue,
      opex,
      profit,
      flrCost,
      otherExpenses,
      laborRatioPct,
    };
  }, [plVsTarget, plStoreName]);

  const isStoreScopedView = plStoreName.trim().length > 0;
  const financeScopeBranchCode = isStoreScopedView ? mapStoreToBranchCode(plStoreName) : "";

  const laborDisplay = useMemo(() => {
    if (!plVsTarget?.ok) return null;
    const labor = plVsTarget.buckets?.labor;
    if (!labor) return null;
    const usePlOnly = plVsTarget.scope === "store";
    const actualAmount = usePlOnly ? Number(labor.actual_pl_lines || 0) : Number(labor.actual_payroll_bayzat || 0);
    const actualPct = usePlOnly
      ? Number(labor.actual_pct_of_net_sales_pos_pl || 0)
      : Number(labor.actual_pct_of_net_sales_pos_payroll || 0);
    const varianceAmount = actualAmount - Number(labor.target_amount || 0);
    return {
      usePlOnly,
      actualAmount,
      actualPct,
      targetPct: Number(labor.target_pct || 0) * 100,
      targetAmount: Number(labor.target_amount || 0),
      plAmount: Number(labor.actual_pl_lines || 0),
      payrollAmount: Number(labor.actual_payroll_bayzat || 0),
      varianceAmount,
      variancePlVsPayroll: Number(labor.variance_pl_vs_payroll || 0),
    };
  }, [plVsTarget]);

  const grossProfitMetrics = useMemo(() => {
    if (!plVsTarget?.ok || !plHeadline) return null;

    const grossProfitAmount = Number(plVsTarget.revenue_pl || 0) - Number(plVsTarget.buckets?.food.actual_amount || 0);
    const grossProfitRate = Number(plVsTarget.revenue_pl || 0) > 0 ? (grossProfitAmount / Number(plVsTarget.revenue_pl || 0)) * 100 : 0;

    const scopedBranchDailyRows = financeScopeBranchCode
      ? branchDailyRows.filter((row) => String(row.branch_code || "").toUpperCase() === financeScopeBranchCode)
      : branchDailyRows;
    const laborHours = scopedBranchDailyRows.reduce((sum, row) => sum + Number(row.total_hours || 0), 0);
    const attendanceCount = scopedBranchDailyRows.reduce((sum, row) => sum + Number(row.staff_count || 0), 0);

    const orderCount = financeScopeBranchCode
      ? posBranchDailyRows
          .filter((row) => mapStoreToBranchCode(row.branch_name || "") === financeScopeBranchCode)
          .reduce((sum, row) => sum + Number(row.order_count_non_cancelled || 0), 0)
      : Number(posSalesRangeTotals?.order_count_non_cancelled || 0);

    return {
      grossProfitAmount,
      grossProfitRate,
      grossProfitPerLaborHour: laborHours > 0 ? grossProfitAmount / laborHours : null,
      grossProfitPerAttendance: attendanceCount > 0 ? grossProfitAmount / attendanceCount : null,
      grossProfitPerOrder: orderCount > 0 ? grossProfitAmount / orderCount : null,
      laborHours,
      attendanceCount,
      orderCount,
    };
  }, [plVsTarget, plHeadline, financeScopeBranchCode, branchDailyRows, posBranchDailyRows, posSalesRangeTotals]);

  const [salesSyncing, setSalesSyncing] = useState(false);
  const [hourlySyncing, setHourlySyncing] = useState(false);
  const [payrollSyncing, setPayrollSyncing] = useState(false);
  const [salesSyncMessage, setSalesSyncMessage] = useState("");
  const [hourlySyncMessage, setHourlySyncMessage] = useState("");
  const [payrollSyncMessage, setPayrollSyncMessage] = useState("");

  const [comparisonRows, setComparisonRows] = useState<ComparisonItem[]>([]);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState("");
  const [comparisonNotice, setComparisonNotice] = useState("");
  const [comparisonLoadedOnce, setComparisonLoadedOnce] = useState(false);
  const [comparisonLimit, setComparisonLimit] = useState("5000");

  const [viewMode, setViewMode] = useState<AnalyticsViewMode>("perfect_attendance");
  const [analyticsTab, setAnalyticsTab] = useState<"staff" | "sales" | "payroll" | "finance">("staff");
  const [staffSearch, setStaffSearch] = useState("");

  const roleUpper = String(auth?.role || "STAFF").toUpperCase();
  const isHQOrAdmin = roleUpper === "HQ" || roleUpper === "ADMIN";
  const canViewStaffChannel = isHQOrAdmin;
  /** HQ/ADMIN: all cities. Dubai management: Dubai only. Manila management: Manila only. */
  const canViewFinanceChannels =
    isHQOrAdmin ||
    (roleUpper === "DUBAI_MANAGEMENT" && city === "dubai") ||
    (roleUpper === "MANILA_MANAGEMENT" && city === "manila");
  const canViewPayrollChannel = canViewFinanceChannels;
  const canViewManagementPlChannel = canViewFinanceChannels;

  const [staffSortBy, setStaffSortBy] = useState<"hours" | "days" | "segments" | "name">("hours");
  const [branchSortBy, setBranchSortBy] = useState<"totalHours" | "avgHoursPerDay" | "maxStaff" | "branch">("totalHours");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (analyticsTab === "staff" && !canViewStaffChannel) {
      setAnalyticsTab(canViewFinanceChannels ? "sales" : "staff");
    }
  }, [analyticsTab, canViewStaffChannel, canViewFinanceChannels]);

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
    const pm = previousCalendarMonthRangeIso();
    setSummaryDateFrom(pm.from);
    setSummaryDateTo(pm.to);
    setPayrollStaffName("");
    setBranchCode("");
    setSummaryBranchCode("");
    setSummaryBrandName("");
    setPlStoreName("");
    setHourlyStoreName("");
    resetComparisonState();
  }, [city]);

  useEffect(() => {
    if (analyticsTab !== "finance") return;
    if (!approverName.trim() || !pin.trim()) return;
    void loadAll("finance");
  }, [analyticsTab, plStoreName]);

  useEffect(() => {
    if (analyticsTab !== "sales") return;
    if (!approverName.trim() || !pin.trim()) return;
    void loadAll("sales");
  }, [analyticsTab, hourlyStoreName, summaryBranchCode, summaryBrandName]);

  async function loadAll(scope: "all" | "sales" | "staff" | "payroll" | "finance" = "all") {
    setLoading(true);
    setError("");
    const loadErrors: string[] = [];
    const addLoadError = (label: string, e: unknown) => {
      const msg = String((e as any)?.message || e || "Request failed");
      loadErrors.push(`${label}: ${msg}`);
    };
    const shouldLoadPos = scope === "all" || scope === "sales" || scope === "finance";
    const shouldLoadStaff = scope === "all" || scope === "sales" || scope === "staff" || scope === "finance";
    const shouldLoadFinance = scope === "all" || scope === "payroll" || scope === "finance";

    try {
      const posDailyQs = new URLSearchParams({
        city,
        date_from: summaryDateFrom,
        date_to: summaryDateTo,
        branch_code: summaryBranchCode,
        brand_name: summaryBrandName,
        limit: "1000",
        approver_name: approverName.trim(),
        pin: pin.trim(),
      });

      const posRankingQs = new URLSearchParams({
        city,
        date_from: summaryDateFrom,
        date_to: summaryDateTo,
        branch_code: summaryBranchCode,
        brand_name: summaryBrandName,
        limit: "50",
        approver_name: approverName.trim(),
        pin: pin.trim(),
      });

      const salesComparisonQs = new URLSearchParams({
        city: city === "dubai" ? "Dubai" : "Manila",
        date_from: summaryDateFrom,
        date_to: summaryDateTo,
        limit: "5000",
        approver_name: approverName.trim(),
        pin: pin.trim(),
      });

      const posLoad = (async () => {
        if (!shouldLoadPos) return;
        try {
          const hourlyQs = new URLSearchParams({
            city,
            date_from: summaryDateFrom,
            date_to: summaryDateTo,
            approver_name: approverName.trim(),
            pin: pin.trim(),
          });
          if (hourlyStoreName.trim()) hourlyQs.set("store_name", hourlyStoreName.trim());
          const salesPlQs = new URLSearchParams({
            city,
            date_from: summaryDateFrom,
            date_to: summaryDateTo,
            approver_name: approverName.trim(),
            pin: pin.trim(),
          });

          const [posDaily, posRanking, posBranches, posBrands, posBranchesDaily] = await Promise.all([
            apiGet<PosSalesDailyResp>(`/api/admin/pos/sales/daily?${posDailyQs.toString()}`),
            apiGet<PosMenuRankingResp>(`/api/admin/pos/items/ranking?${posRankingQs.toString()}`),
            apiGet<PosBranchOrderResp>(`/api/admin/pos/branches/orders?${posRankingQs.toString()}`),
            apiGet<PosBrandOrderResp>(`/api/admin/pos/brands/orders?${posRankingQs.toString()}`),
            apiGet<PosBranchDailyResp>(`/api/admin/pos/branches/daily?${posDailyQs.toString()}`),
          ]);

          setPosSalesRows(posDaily.items || []);
          setPosSalesRangeTotals(posDaily.totals ?? null);
          setPosMenuRankingRows(posRanking.items || []);
          setPosBranchOrderRows(posBranches.items || []);
          setPosBrandOrderRows(posBrands.items || []);
          setPosBranchDailyRows(posBranchesDaily.items || []);
          if (canViewFinanceChannels) {
            try {
              const salesPl = await apiGet<PlVsTargetResp>(`/api/admin/finance/pl-vs-target?${salesPlQs.toString()}`);
              setSalesPlSummary(salesPl || null);
            } catch {
              setSalesPlSummary(null);
            }
          } else {
            setSalesPlSummary(null);
          }
          try {
            const hourlyAnalytics = await apiGet<HourlySalesAnalyticsResp>(`/api/admin/pos/hourly/analytics?${hourlyQs.toString()}`);
            setHourlySalesAnalytics(hourlyAnalytics ?? null);
            setHourlyLoadError("");
          } catch (e) {
            setHourlySalesAnalytics(null);
            setHourlyLoadError(String((e as any)?.message || e || "Hourly analytics unavailable"));
          }
        } catch (e) {
          addLoadError("Sales analytics", e);
          setPosSalesRows([]);
          setPosSalesRangeTotals(null);
          setPosMenuRankingRows([]);
          setPosBranchOrderRows([]);
          setPosBrandOrderRows([]);
          setPosBranchDailyRows([]);
          setSalesPlSummary(null);
          setHourlySalesAnalytics(null);
          setHourlyLoadError("");
        }
      })();

      const staffLoad = (async () => {
        if (!shouldLoadStaff) return;
        if (!canViewStaffChannel) {
          setBranchDailyRows([]);
          setBranchWeekdayRows([]);
          setStaffSummaryRows([]);
          setAbsenceSummaryRows([]);
          setDubaiSummary(null);
          setManilaSummary(null);
          setSalesComparisonRows([]);
          return;
        }

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

        const run = async <T,>(label: string, fn: () => Promise<T>, onOk: (v: T) => void, onFail: () => void) => {
          try {
            const v = await fn();
            onOk(v);
          } catch (e) {
            addLoadError(label, e);
            onFail();
          }
        };

        await Promise.all([
          run("Staff analytics (branch daily hours)", () => apiGet<BranchDailyResp>(`/api/admin/analytics/branch_daily_hours?${common.toString()}`), (daily) => setBranchDailyRows(daily.rows || []), () => setBranchDailyRows([])),
          run("Staff analytics (branch weekday hours)", () => apiGet<BranchWeekdayResp>(`/api/admin/analytics/branch_weekday_avg_hours?${common.toString()}`), (weekday) => setBranchWeekdayRows(weekday.rows || []), () => setBranchWeekdayRows([])),
          run("Staff analytics (work summary)", () => apiGet<StaffSummaryResp>(`/api/admin/analytics/staff_work_summary?${staffQs.toString()}`), (staff) => setStaffSummaryRows(staff.rows || []), () => setStaffSummaryRows([])),
          run("Staff analytics (absence summary)", () => apiGet<AbsenceSummaryResp>(`/api/admin/analytics/absence_summary?${absenceQs.toString()}`), (absence) => setAbsenceSummaryRows(absence.rows || []), () => setAbsenceSummaryRows([])),
          run(
            "Staff analytics (Dubai city summary)",
            () =>
              apiGet<CitySummaryResp>(
                `/api/admin/analytics/city_summary?city=dubai&date_from=${encodeURIComponent(summaryDateFrom)}&date_to=${encodeURIComponent(summaryDateTo)}&approver_name=${encodeURIComponent(approverName.trim())}&pin=${encodeURIComponent(pin.trim())}`
              ),
            (dubaiCity) => setDubaiSummary(dubaiCity),
            () => setDubaiSummary(null)
          ),
          run(
            "Staff analytics (Manila city summary)",
            () =>
              apiGet<CitySummaryResp>(
                `/api/admin/analytics/city_summary?city=manila&date_from=${encodeURIComponent(summaryDateFrom)}&date_to=${encodeURIComponent(summaryDateTo)}&approver_name=${encodeURIComponent(approverName.trim())}&pin=${encodeURIComponent(pin.trim())}`
              ),
            (manilaCity) => setManilaSummary(manilaCity),
            () => setManilaSummary(null)
          ),
          run(
            "Staff analytics (attendance comparison)",
            () => apiGet<ComparisonResp>(`/api/admin/attendance/comparison?${salesComparisonQs.toString()}`),
            (salesComparison) => setSalesComparisonRows(Array.isArray(salesComparison?.items) ? salesComparison.items : []),
            () => setSalesComparisonRows([])
          ),
        ]);
      })();

      const financeLoad = (async () => {
        if (!shouldLoadFinance) return;
        if (!canViewFinanceChannels) {
          setPayrollRows([]);
          setFinanceRatio(null);
          setPlVsTarget(null);
          return;
        }

        const payrollQs = new URLSearchParams({
          city,
          approver_name: approverName.trim(),
          pin: pin.trim(),
          limit: "5000",
        });
        const financeQs = new URLSearchParams({
          city,
          date_from: summaryDateFrom,
          date_to: summaryDateTo,
          approver_name: approverName.trim(),
          pin: pin.trim(),
        });

        await Promise.all([
          (async () => {
            try {
              const payrollRes = await apiGet<PayrollStaffResp>(`/api/admin/payroll/staff?${payrollQs.toString()}`);
              setPayrollRows(payrollRes.items || []);
            } catch (e) {
              addLoadError("Payroll", e);
              setPayrollRows([]);
            }
          })(),
          (async () => {
            try {
              const financeRes = await apiGet<FinanceLaborRatioResp>(`/api/admin/finance/labor-ratio?${financeQs.toString()}`);
              setFinanceRatio(financeRes || null);
            } catch (e) {
              addLoadError("Management P&L", e);
              setFinanceRatio(null);
            }
          })(),
          (async () => {
            try {
              const plQs = new URLSearchParams({
                city,
                date_from: summaryDateFrom,
                date_to: summaryDateTo,
                approver_name: approverName.trim(),
                pin: pin.trim(),
              });
              if (plStoreName.trim()) plQs.set("store_name", plStoreName.trim());
              const plVs = await apiGet<PlVsTargetResp>(`/api/admin/finance/pl-vs-target?${plQs.toString()}`);
              setPlVsTarget(plVs || null);
            } catch {
              setPlVsTarget(null);
            }
          })(),
        ]);
      })();

      await Promise.all([posLoad, staffLoad, financeLoad]);
      setError(loadErrors.join(" | "));
    } catch (e: any) {
      setError(String(e?.message || e || "Failed to load analytics"));
    } finally {
      setLoading(false);
    }
  }

  async function uploadPlExcel(file: File | null) {
    if (!file || !approverName.trim() || !pin.trim()) return;
    setPlUploading(true);
    setPlUploadMessage("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("approver_name", approverName.trim());
      fd.append("pin", pin.trim());
      fd.append("city", city);
      const res = await fetch(`${API_BASE}/api/admin/pl/import/excel`, {
        method: "POST",
        body: fd,
      });
      const text = await res.text();
      if (!res.ok) {
        try {
          const j = JSON.parse(text);
          throw new Error(typeof j?.detail === "string" ? j.detail : text || "Upload failed");
        } catch (e) {
          if (e instanceof Error && e.message !== "Upload failed") throw e;
          throw new Error(text || "Upload failed");
        }
      }
      const j = text ? (JSON.parse(text) as { month_key?: string; line_count?: number }) : {};
      setPlUploadMessage(
        `Imported P&L ${j.month_key ?? ""} (${j.line_count ?? 0} lines). Refreshing…`
      );
      await loadAll("finance");
    } catch (e) {
      setPlUploadMessage(String((e as Error)?.message || e || "Upload failed"));
    } finally {
      setPlUploading(false);
    }
  }

  async function syncSalesNow() {
    if (!approverName.trim() || !pin.trim()) return;
    setSalesSyncing(true);
    setSalesSyncMessage("");
    try {
      const res = await apiPost<{ ok?: boolean; duplicate?: boolean; message?: string; processed_count?: number }>(
        "/api/admin/pos/sales/drive/sync",
        {
          approver_name: approverName.trim(),
          pin: pin.trim(),
          city_hint: city,
          max_files: 3,
        }
      );
      if (res?.duplicate) {
        setSalesSyncMessage("POS files were already synced. Recomputed and reloaded data.");
      } else {
        const cnt = Number(res?.processed_count || 0);
        setSalesSyncMessage(
          cnt > 0 ? `POS sync completed (${cnt} files processed). Reloaded data.` : "POS sync completed. Reloaded data."
        );
      }
      await loadAll();
    } catch (e: any) {
      setSalesSyncMessage(String(e?.message || e || "POS sync failed"));
    } finally {
      setSalesSyncing(false);
    }
  }

  async function syncHourlySalesNow() {
    if (!approverName.trim() || !pin.trim()) return;
    setHourlySyncing(true);
    setHourlySyncMessage("");
    try {
      const res = await apiPost<{ ok?: boolean; duplicate?: boolean; processed_count?: number; month_keys?: string[] }>(
        "/api/admin/pos/hourly/drive/sync",
        {
          approver_name: approverName.trim(),
          pin: pin.trim(),
          city_hint: city,
          max_files: 12,
        }
      );
      const cnt = Number(res?.processed_count || 0);
      const months = Array.isArray(res?.month_keys) ? res.month_keys.filter(Boolean).join(", ") : "";
      if (res?.duplicate) {
        setHourlySyncMessage(months ? `Hourly files already synced (${months}). Reloaded data.` : "Hourly files already synced. Reloaded data.");
      } else {
        setHourlySyncMessage(
          cnt > 0
            ? `Hourly sync completed (${cnt} files${months ? `, ${months}` : ""}). Reloaded data.`
            : "Hourly sync completed. Reloaded data."
        );
      }
      await loadAll("sales");
    } catch (e: any) {
      setHourlySyncMessage(String(e?.message || e || "Hourly sync failed"));
    } finally {
      setHourlySyncing(false);
    }
  }

  async function syncPayrollNow() {
    if (!approverName.trim() || !pin.trim()) return;
    setPayrollSyncing(true);
    setPayrollSyncMessage("");
    try {
      const res = await apiPost<{ ok?: boolean; duplicate?: boolean; message?: string; items?: unknown[] }>(
        "/api/admin/payroll/drive/sync",
        {
        approver_name: approverName.trim(),
        pin: pin.trim(),
        city,
        }
      );
      const msg = String(res?.message || "").trim();
      if (msg) {
        setPayrollSyncMessage(msg);
      } else if (res?.duplicate) {
        setPayrollSyncMessage("Payroll files were already imported. Reloaded data.");
      } else {
        setPayrollSyncMessage("Payroll folder sync completed. Reloaded data.");
      }
      await loadAll();
    } catch (e: any) {
      setPayrollSyncMessage(String(e?.message || e || "Payroll sync failed"));
    } finally {
      setPayrollSyncing(false);
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
    if (canViewStaffChannel) loadComparison();
    // Management roles cannot call staff analytics APIs (HQ/ADMIN only) — avoid 403/500 noise on load.
    if (canViewStaffChannel) void loadAll();
    else void loadAll("finance");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewStaffChannel]);

  useEffect(() => {
    if (!canViewStaffChannel) return;
    if (!approverName.trim() || !pin.trim()) return;
    if (!dateFrom || !dateTo) return;
    loadComparison();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, branchCode, dateFrom, dateTo, approverName, pin, canViewStaffChannel]);

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
    const posNetSales = posSalesRangeTotals
      ? Number(posSalesRangeTotals.net_revenue || 0)
      : posSalesRows.reduce((sum, row) => sum + Number(row.net_revenue || 0), 0);
    const posGrossSales = posSalesRangeTotals
      ? Number(posSalesRangeTotals.gross_revenue || 0)
      : posSalesRows.reduce((sum, row) => sum + Number(row.gross_revenue || 0), 0);
    const totalOrders = posSalesRangeTotals
      ? Number(posSalesRangeTotals.order_count_non_cancelled || 0)
      : posSalesRows.reduce((sum, row) => sum + Number(row.order_count_non_cancelled || 0), 0);
    const dayCount = posSalesRangeTotals ? Number(posSalesRangeTotals.day_count || 0) : posSalesRows.length;

    const revenuePl = Number(salesPlSummary?.revenue_pl || 0);
    const operatingProfitPl = summaryBranchCode || summaryBrandName ? 0 : Number(salesPlSummary?.rollup?.profit_pl || 0);
    const revenuePrimary = posNetSales > 0 ? posNetSales : revenuePl;
    const avgRevenuePerOrder = totalOrders > 0 ? revenuePrimary / totalOrders : 0;
    const revenueBasis = posNetSales > 0 ? "revenue" : revenuePl > 0 ? "pl" : "pos";

    return {
      totalNetSales: posNetSales,
      totalGrossSales: posGrossSales,
      totalOrders,
      dayCount,
      revenuePrimary,
      operatingProfitPl,
      avgRevenuePerOrder,
      revenueBasis,
      hasProfit: !summaryBranchCode && !summaryBrandName && !!salesPlSummary?.ok,
    };
  }, [posSalesRows, posSalesRangeTotals, salesPlSummary, summaryBranchCode, summaryBrandName]);

  const brandOrderRanking = useMemo(() => {
    return posBrandOrderRows.map((row) => ({
      brand: row.brand_name || "-",
      orders: Number(row.order_count_non_cancelled || 0),
      netSales: Number(row.net_revenue || 0),
      grossSales: Number(row.gross_revenue || 0),
    }));
  }, [posBrandOrderRows]);

  const salesBrandOptions = useMemo(() => {
    const fixedDubaiBrands = [
      { value: "", label: "Company total" },
      { value: "SushiZEN", label: "SushiZEN" },
      { value: "RamenZEN", label: "RamenZEN" },
      { value: "All Veggie Sushi", label: "All Veggie Sushi" },
    ];
    if (city === "dubai") return fixedDubaiBrands;
    const fromApi = posBrandOrderRows
      .map((row) => String(row.brand_name || "").trim())
      .filter(Boolean);
    return [{ value: "", label: "Company total" }].concat(
      Array.from(new Set(fromApi))
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ value: name, label: name })),
    );
  }, [city, posBrandOrderRows]);

  const plStoreOptions = useMemo(() => {
    const fromPl = (plVsTarget?.available_stores || []).map((s) => String(s || "").trim()).filter(Boolean);
    const fromPos = posBranchOrderRows.map((r) => String(r.branch_name || "").trim()).filter(Boolean);
    const fromBranchConfig = (BRANCH_OPTIONS[city] || [])
      .map((opt) => String(opt.label || "").trim())
      .filter((label) => label && label !== "All Branches");

    if (city === "dubai") {
      const candidates = [...fromPl, ...fromPos, ...fromBranchConfig];
      return DUBAI_PL_SCOPE_CODES.map((code) => {
        const value =
          candidates.find((name) => mapStoreToBranchCode(name) === code) || DUBAI_PL_SCOPE_LABELS[code];
        return { value, label: DUBAI_PL_SCOPE_LABELS[code] };
      });
    }

    return Array.from(new Set([...fromPl, ...fromPos, ...fromBranchConfig]))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name }));
  }, [city, plVsTarget?.available_stores, posBranchOrderRows]);

  const hourlyStoreOptions = useMemo(() => {
    const fromApi = (hourlySalesAnalytics?.available_stores || []).map((s) => String(s || "").trim()).filter(Boolean);
    const fromPos = posBranchOrderRows.map((r) => String(r.branch_name || "").trim()).filter(Boolean);
    const fromBranchConfig = (BRANCH_OPTIONS[city] || [])
      .filter((opt) => opt.value)
      .map((opt) => opt.label);
    if (city === "dubai") {
      return DUBAI_PL_SCOPE_CODES.map((code) => ({
        value: branchLabelFromCode(code, city),
        label: branchLabelFromCode(code, city),
      }));
    }
    return Array.from(new Set([...fromApi, ...fromPos, ...fromBranchConfig]))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name }));
  }, [city, hourlySalesAnalytics?.available_stores, posBranchOrderRows]);

  const hourlySummary = useMemo(() => {
    const rows = hourlySalesAnalytics?.rows || [];
    const totals = hourlySalesAnalytics?.totals;
    const peak = hourlySalesAnalytics?.peak_hour || null;
    return {
      totalNetSales: Number(totals?.net_sales || 0),
      totalOrders: Number(totals?.order_count_non_cancelled || 0),
      totalLaborHours: Number(totals?.labor_hours_total || 0),
      ordersPerLaborHour: Number(totals?.orders_per_labor_hour || 0),
      ordersPerStaff: Number(totals?.orders_per_staff || 0),
      monthCount: Number(totals?.month_count || 0),
      hourCount: Number(totals?.hour_count || 0),
      dayCount: Number(totals?.day_count || 0),
      peak,
    };
  }, [hourlySalesAnalytics]);

  const hourlyTrendMaxOrders = useMemo(() => {
    return Math.max(...(hourlySalesAnalytics?.rows || []).map((row) => Number(row.order_count_non_cancelled || 0)), 1);
  }, [hourlySalesAnalytics?.rows]);

  /** Same calendar months as `/api/admin/finance/labor-ratio` + Payroll tab totals (Summary From/To). */
  const payrollRowsInRange = useMemo(() => {
    const months = new Set(monthKeysBetween(summaryDateFrom, summaryDateTo));
    if (!months.size) return payrollRows;
    return payrollRows.filter((r) => months.has(String(r.month_key || "")));
  }, [payrollRows, summaryDateFrom, summaryDateTo]);

  const payrollNetPaySumForSummaryRange = useMemo(() => {
    return payrollRowsInRange.reduce((sum, r) => sum + Number(r.total_net_pay || 0), 0);
  }, [payrollRowsInRange]);

  const payrollStaffOptions = useMemo(() => {
    return Array.from(new Set(payrollRowsInRange.map((r) => String(r.staff_name || "").trim()).filter(Boolean))).sort(
      (a, b) => a.localeCompare(b)
    );
  }, [payrollRowsInRange]);

  const payrollRowsFiltered = useMemo(() => {
    if (!payrollStaffName) return payrollRowsInRange;
    return payrollRowsInRange.filter((r) => String(r.staff_name || "").trim() === payrollStaffName);
  }, [payrollRowsInRange, payrollStaffName]);

  const payrollSummary = useMemo(() => {
    const totalNetPay = payrollRowsFiltered.reduce((sum, r) => sum + Number(r.total_net_pay || 0), 0);
    const grossPay = payrollRowsFiltered.reduce((sum, r) => sum + Number(r.gross_pay || 0), 0);
    const basicSalary = payrollRowsFiltered.reduce((sum, r) => sum + Number(r.basic_salary || 0), 0);
    const accommodation = payrollRowsFiltered.reduce((sum, r) => sum + Number(r.accommodation || 0), 0);
    const foodAllowance = payrollRowsFiltered.reduce((sum, r) => sum + Number(r.food_allowance || 0), 0);
    const otherAllowance = payrollRowsFiltered.reduce((sum, r) => sum + Number(r.other_allowance || 0), 0);
    const transportation = payrollRowsFiltered.reduce((sum, r) => sum + Number(r.transportation || 0), 0);
    const netAdditions = payrollRowsFiltered.reduce((sum, r) => sum + Number(r.net_additions || 0), 0);
    const netDeductions = payrollRowsFiltered.reduce((sum, r) => sum + Number(r.net_deductions || 0), 0);
    const arrearsAddition = payrollRowsFiltered.reduce((sum, r) => sum + Number(r.arrears_addition || 0), 0);
    const arrearsDeduction = payrollRowsFiltered.reduce((sum, r) => sum + Number(r.arrears_deduction || 0), 0);
    const workExpenses = payrollRowsFiltered.reduce((sum, r) => sum + Number(r.work_expenses || 0), 0);
    return {
      totalNetPay,
      grossPay,
      basicSalary,
      accommodation,
      foodAllowance,
      otherAllowance,
      transportation,
      netAdditions,
      netDeductions,
      arrearsAddition,
      arrearsDeduction,
      workExpenses,
      staffCount: new Set(payrollRowsFiltered.map((r) => r.staff_name).filter(Boolean)).size,
      rowCount: payrollRowsFiltered.length,
    };
  }, [payrollRowsFiltered]);

  const salesOpsInsights = useMemo(() => {
    const laborByDayBranch = new Map<string, { hours: number; staff: number }>();
    for (const r of branchDailyRows) {
      const code = (r.branch_code || "").toUpperCase();
      if (!code || !r.work_date) continue;
      laborByDayBranch.set(`${r.work_date}|${code}`, {
        hours: Number(r.total_hours || 0),
        staff: Number(r.staff_count || 0),
      });
    }

    const byBranch = new Map<
      string,
      { net: number; gross: number; orders: number; labor: number; staff: number; days: Set<string> }
    >();
    const dailyJoined: Array<{ branch: string; work_date: string; splh: number }> = [];

    for (const r of posBranchDailyRows) {
      const code = mapStoreToBranchCode(r.branch_name || "");
      if (!code || !r.work_date) continue;
      const labor = laborByDayBranch.get(`${r.work_date}|${code}`);
      const cur = byBranch.get(code) || {
        net: 0,
        gross: 0,
        orders: 0,
        labor: 0,
        staff: 0,
        days: new Set<string>(),
      };
      cur.net += Number(r.net_revenue || 0);
      cur.gross += Number(r.gross_revenue || 0);
      cur.orders += Number(r.order_count_non_cancelled || 0);
      if (labor) {
        cur.labor += Number(labor.hours || 0);
        cur.staff += Number(labor.staff || 0);
        if (labor.hours > 0) {
          dailyJoined.push({
            branch: code,
            work_date: r.work_date,
            splh: Number(r.net_revenue || 0) / Number(labor.hours || 1),
          });
        }
      }
      cur.days.add(r.work_date);
      byBranch.set(code, cur);
    }

    const branchRows = Array.from(byBranch.entries()).map(([branch, v]) => ({
      branch,
      net: v.net,
      gross: v.gross,
      orders: v.orders,
      labor: v.labor,
      avgStaff: v.days.size ? v.staff / v.days.size : 0,
      salesPerLabor: v.labor > 0 ? v.net / v.labor : 0,
    }));

    const insights: Array<{ en: string }> = [];
    if (!branchRows.length) return insights;

    const netSorted = [...branchRows].sort((a, b) => b.net - a.net);
    const splhMedian = median(branchRows.map((x) => x.salesPerLabor));
    const topNet = netSorted[0];
    if (topNet && topNet.salesPerLabor > 0 && topNet.salesPerLabor < splhMedian) {
      insights.push({
        en: `${topNet.branch} delivers strong revenue volume; however, sales per labor hour remain below the portfolio median.`,
      });
    }

    const staffMedian = median(branchRows.map((x) => x.avgStaff));
    const lowNetThreshold = median(branchRows.map((x) => x.net));
    const understaffed = branchRows
      .filter((x) => x.net >= lowNetThreshold && x.avgStaff > 0 && x.avgStaff < staffMedian)
      .sort((a, b) => b.net - a.net)[0];
    if (understaffed) {
      insights.push({
        en: `${understaffed.branch} records robust sales with comparatively lean average staffing, indicating a potential understaffing risk.`,
      });
    }

    const overstaffed = branchRows
      .filter((x) => x.net < lowNetThreshold && x.avgStaff > staffMedian)
      .sort((a, b) => a.net - b.net)[0];
    if (overstaffed) {
      insights.push({
        en: `${overstaffed.branch} operates with relatively high staffing during a lower-sales period, suggesting possible overstaffing.`,
      });
    }

    const lateByDayBranch = new Map<string, number>();
    for (const r of salesComparisonRows) {
      const code = (r.scheduled_branch_code || r.attendance_branch_code || "").toUpperCase();
      if (!code || !r.work_date) continue;
      if (effectiveLateMinutes(r) <= 0) continue;
      const key = `${r.work_date}|${code}`;
      lateByDayBranch.set(key, (lateByDayBranch.get(key) || 0) + 1);
    }

    let worstLateBranch = "";
    let worstLateDrop = 0;
    for (const branch of new Set(dailyJoined.map((x) => x.branch))) {
      const lateDays: number[] = [];
      const normalDays: number[] = [];
      for (const d of dailyJoined.filter((x) => x.branch === branch)) {
        const lateCount = lateByDayBranch.get(`${d.work_date}|${branch}`) || 0;
        if (lateCount > 0) lateDays.push(d.splh);
        else normalDays.push(d.splh);
      }
      if (!lateDays.length || !normalDays.length) continue;
      const lateAvg = lateDays.reduce((a, b) => a + b, 0) / lateDays.length;
      const normalAvg = normalDays.reduce((a, b) => a + b, 0) / normalDays.length;
      if (normalAvg <= 0) continue;
      const dropPct = ((normalAvg - lateAvg) / normalAvg) * 100;
      if (dropPct > worstLateDrop) {
        worstLateDrop = dropPct;
        worstLateBranch = branch;
      }
    }
    if (worstLateBranch && worstLateDrop > 0) {
      insights.push({
        en: `${worstLateBranch} shows an approximately ${worstLateDrop.toFixed(1)}% decline in sales efficiency on late-attendance days versus baseline days.`,
      });
    }

    const noShowDates = new Set(
      salesComparisonRows.filter((x) => x.no_show).map((x) => x.work_date).filter(Boolean)
    );
    if (noShowDates.size > 0 && posSalesRows.length > 0) {
      const withNoShow = posSalesRows
        .filter((x) => noShowDates.has(x.work_date))
        .map((x) => Number(x.net_revenue || 0));
      const withoutNoShow = posSalesRows
        .filter((x) => !noShowDates.has(x.work_date))
        .map((x) => Number(x.net_revenue || 0));
      if (withNoShow.length > 0 && withoutNoShow.length > 0) {
        const a = withNoShow.reduce((s, v) => s + v, 0) / withNoShow.length;
        const b = withoutNoShow.reduce((s, v) => s + v, 0) / withoutNoShow.length;
        if (b > 0) {
          const drop = ((b - a) / b) * 100;
          insights.push({
            en: `Average sales on no-show days vary by approximately ${drop.toFixed(1)}% relative to non-no-show days.`,
          });
        }
      }
    }

    return insights;
  }, [branchDailyRows, posBranchDailyRows, salesComparisonRows, posSalesRows]);

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

  const exportBaseName = `${city}_${summaryDateFrom}_to_${summaryDateTo}${summaryBrandName ? `_${summaryBrandName.replace(/\s+/g, "_")}` : ""}${summaryBranchCode ? `_${summaryBranchCode}` : ""}`;

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
              {analyticsTab === "staff"
                ? "Staff Analytics"
                : analyticsTab === "sales"
                  ? "Sales Analytics"
                  : analyticsTab === "payroll"
                    ? "Payroll Channel"
                    : "Management P&L Channel"}
            </h1>
            <p className="mt-2 text-sm text-neutral-400">
              Unified operations analytics across attendance, sales, payroll, and management finance.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {canViewStaffChannel ? (
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
              ) : null}
              {canViewFinanceChannels ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setError("");
                      setAnalyticsTab("sales");
                    }}
                    className={[
                      "rounded-xl border px-4 py-2 text-sm font-semibold transition",
                      analyticsTab === "sales"
                        ? "border-emerald-500 bg-emerald-950/25 text-emerald-200"
                        : "border-neutral-700 bg-neutral-950/40 text-neutral-200 hover:bg-neutral-900 hover:text-white",
                    ].join(" ")}
                  >
                    Sales Analytics
                  </button>
                  {canViewPayrollChannel ? (
                  <button
                    type="button"
                    onClick={() => {
                      setError("");
                      setAnalyticsTab("payroll");
                    }}
                    className={[
                      "rounded-xl border px-4 py-2 text-sm font-semibold transition",
                      analyticsTab === "payroll"
                        ? "border-sky-500 bg-sky-950/25 text-sky-200"
                        : "border-neutral-700 bg-neutral-950/40 text-neutral-200 hover:bg-neutral-900 hover:text-white",
                    ].join(" ")}
                  >
                    Payroll Channel
                  </button>
                  ) : null}
                  {canViewManagementPlChannel ? (
                  <button
                    type="button"
                    onClick={() => {
                      setError("");
                      setAnalyticsTab("finance");
                    }}
                    className={[
                      "rounded-xl border px-4 py-2 text-sm font-semibold transition",
                      analyticsTab === "finance"
                        ? "border-violet-500 bg-violet-950/25 text-violet-200"
                        : "border-neutral-700 bg-neutral-950/40 text-neutral-200 hover:bg-neutral-900 hover:text-white",
                    ].join(" ")}
                  >
                    Management P&L
                  </button>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>

          {error ? (
            <div className="mt-6 rounded-2xl border border-amber-800/70 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
              {error}
            </div>
          ) : null}

          {analyticsTab === "staff" && canViewStaffChannel ? (
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
          ) : analyticsTab === "sales" ? (
          <div className="mt-8 space-y-4">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-sm font-semibold">Sales Analytics Period</div>
                  <div className="mt-1 text-xs text-neutral-500">
                    Net sales, gross revenue, order count, menu ranking, and hourly sales analytics from synced POS
                    files. Summary cards use the full selected date range; Days w/ sales data is the count of days with
                    POS rows (not the calendar span).
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => loadAll("sales")}
                    disabled={loading || !approverName.trim() || !pin.trim()}
                    className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-60"
                  >
                    {loading ? "Loading..." : "Refresh Sales"}
                  </button>
                  <button
                    type="button"
                    onClick={syncSalesNow}
                    disabled={salesSyncing || !approverName.trim() || !pin.trim()}
                    className="rounded-xl border border-emerald-700 bg-emerald-950/30 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-900/40 disabled:opacity-60"
                  >
                    {salesSyncing ? "Syncing..." : "Sync POS from Drive"}
                  </button>
                  <button
                    type="button"
                    onClick={syncHourlySalesNow}
                    disabled={hourlySyncing || !approverName.trim() || !pin.trim()}
                    className="rounded-xl border border-sky-700 bg-sky-950/30 px-3 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-900/40 disabled:opacity-60"
                  >
                    {hourlySyncing ? "Syncing..." : "Sync Hourly Sales"}
                  </button>
                </div>
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
                  <div className="mb-1 text-xs text-neutral-400">Brand</div>
                  <select
                    value={summaryBrandName}
                    onChange={(e) => setSummaryBrandName(e.target.value)}
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
                  >
                    {salesBrandOptions.map((opt) => (
                      <option key={opt.value || "ALL"} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="mb-1 text-xs text-neutral-400">Store</div>
                  <select
                    value={summaryBranchCode}
                    onChange={(e) => setSummaryBranchCode(e.target.value)}
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
                  >
                    {(BRANCH_OPTIONS[city] || [{ value: "", label: "All Branches" }]).map((opt) => (
                      <option key={opt.value || "ALL"} value={opt.value}>
                        {opt.value ? opt.label : "Company total"}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="mb-1 text-xs text-neutral-400">Hourly Store Scope</div>
                  <select
                    value={hourlyStoreName}
                    onChange={(e) => setHourlyStoreName(e.target.value)}
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
                  >
                    <option value="">Company total</option>
                    {hourlyStoreOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
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
              {hourlySyncMessage ? (
                <div className="mt-3 rounded-xl border border-sky-900/40 bg-sky-950/20 px-3 py-2 text-xs text-sky-100">
                  {hourlySyncMessage}
                </div>
              ) : null}
              {hourlyLoadError ? (
                <div className="mt-3 rounded-xl border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-100">
                  Hourly analytics: {hourlyLoadError}
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="min-h-[32px] text-xs text-neutral-500">
                  {posSalesSummary.revenueBasis === "revenue"
                    ? "Net Revenue (UrbanPiper)"
                    : posSalesSummary.revenueBasis === "pl"
                      ? "Revenue (P&L imported)"
                      : "Net Sales Volume"}
                </div>
                <div className="mt-1 min-h-[40px] min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-lg font-bold leading-tight tabular-nums sm:text-xl md:text-2xl">
                  {formatMoney(posSalesSummary.revenuePrimary)}
                </div>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="min-h-[32px] text-xs text-neutral-500">
                  {posSalesSummary.hasProfit ? "Operating Profit (P&L)" : "Gross Revenue"}
                </div>
                <div className="mt-1 min-h-[40px] min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-lg font-bold leading-tight tabular-nums sm:text-xl md:text-2xl">
                  {posSalesSummary.hasProfit
                    ? formatMoney(posSalesSummary.operatingProfitPl)
                    : formatMoney(posSalesSummary.totalGrossSales)}
                </div>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="min-h-[32px] text-xs text-neutral-500">Order Count</div>
                <div className="mt-1 min-h-[40px] min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-lg font-bold leading-tight tabular-nums sm:text-xl md:text-2xl">
                  {formatCount(posSalesSummary.totalOrders)}
                </div>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="min-h-[32px] text-xs text-neutral-500">
                  {posSalesSummary.revenueBasis === "revenue" || posSalesSummary.revenueBasis === "pl"
                    ? "Avg Revenue / Order"
                    : "Avg Net / Order"}
                </div>
                <div className="mt-1 min-h-[40px] min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-lg font-bold leading-tight tabular-nums sm:text-xl md:text-2xl">
                  {formatMoney(posSalesSummary.avgRevenuePerOrder)}
                </div>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="min-h-[32px] text-xs text-neutral-500">Days w/ sales data</div>
                <div className="mt-1 min-h-[40px] min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-lg font-bold leading-tight tabular-nums sm:text-xl md:text-2xl">
                  {formatCount(posSalesSummary.dayCount)}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-sm font-semibold">Hourly Sales Analytics</div>
                  <div className="mt-1 text-xs text-neutral-500">
                    Monthly hourly workbook totals are merged for the selected period. Staffing uses overlapping shift
                    hours for the same city/store scope.
                  </div>
                </div>
                <div className="text-xs text-neutral-500">
                  Scope: <span className="text-neutral-300">{hourlyStoreName || "Company total"}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="min-h-[32px] text-xs text-neutral-500">Hourly net sales</div>
                  <div className="mt-1 min-h-[40px] text-2xl font-bold tabular-nums">
                    {formatMoney(hourlySummary.totalNetSales)}
                  </div>
                </div>
                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="min-h-[32px] text-xs text-neutral-500">Hourly order count</div>
                  <div className="mt-1 min-h-[40px] text-2xl font-bold tabular-nums">
                    {formatCount(hourlySummary.totalOrders)}
                  </div>
                </div>
                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="min-h-[32px] text-xs text-neutral-500">Orders / labor hour</div>
                  <div className="mt-1 min-h-[40px] text-2xl font-bold tabular-nums">
                    {formatDecimal(hourlySummary.ordersPerLaborHour)}
                  </div>
                </div>
                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="min-h-[32px] text-xs text-neutral-500">Orders / staff</div>
                  <div className="mt-1 min-h-[40px] text-2xl font-bold tabular-nums">
                    {formatDecimal(hourlySummary.ordersPerStaff)}
                  </div>
                </div>
                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="min-h-[32px] text-xs text-neutral-500">Peak hour</div>
                  <div className="mt-1 min-h-[40px] text-2xl font-bold tabular-nums">
                    {hourlySummary.peak?.hour_label || "—"}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {hourlySummary.peak ? `${formatCount(Number(hourlySummary.peak.order_count_non_cancelled || 0))} orders` : "No hourly data"}
                  </div>
                </div>
                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="min-h-[32px] text-xs text-neutral-500">Imported months / hours</div>
                  <div className="mt-1 min-h-[40px] text-2xl font-bold tabular-nums">
                    {formatCount(hourlySummary.monthCount)}/{formatCount(hourlySummary.hourCount)}
                  </div>
                  <div className="text-xs text-neutral-500">{formatCount(hourlySummary.dayCount)} calendar days</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr]">
                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
                  <div className="mb-3 text-sm font-semibold">Hourly order trend</div>
                  <div className="space-y-2">
                    {(hourlySalesAnalytics?.rows || []).map((row) => {
                      const widthPct = (Number(row.order_count_non_cancelled || 0) / hourlyTrendMaxOrders) * 100;
                      return (
                        <div key={row.hour_of_day} className="grid grid-cols-[60px_1fr_80px] items-center gap-3">
                          <div className="text-xs text-neutral-400 tabular-nums">{row.hour_label}</div>
                          <div className="h-3 overflow-hidden rounded-full bg-neutral-900">
                            <div className="h-full rounded-full bg-sky-500/80" style={{ width: `${Math.max(widthPct, 2)}%` }} />
                          </div>
                          <div className="text-right text-xs text-neutral-300 tabular-nums">
                            {formatCount(Number(row.order_count_non_cancelled || 0))}
                          </div>
                        </div>
                      );
                    })}
                    {!hourlySalesAnalytics?.rows?.length ? (
                      <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-6 text-center text-sm text-neutral-500">
                        No hourly sales data in this period yet.
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
                  <div className="mb-3 text-sm font-semibold">Peak-hour order density</div>
                  {hourlySummary.peak ? (
                    <div className="space-y-2 text-sm">
                      <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 px-3 py-3">
                        <div className="text-xs text-neutral-500">Peak hour</div>
                        <div className="mt-1 text-xl font-bold tabular-nums">{hourlySummary.peak.hour_label}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 px-3 py-3">
                          <div className="text-xs text-neutral-500">Orders</div>
                          <div className="mt-1 text-lg font-semibold tabular-nums">
                            {formatCount(Number(hourlySummary.peak.order_count_non_cancelled || 0))}
                          </div>
                        </div>
                        <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 px-3 py-3">
                          <div className="text-xs text-neutral-500">Net sales</div>
                          <div className="mt-1 text-lg font-semibold tabular-nums">
                            {formatMoney(Number(hourlySummary.peak.net_sales || 0))}
                          </div>
                        </div>
                        <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 px-3 py-3">
                          <div className="text-xs text-neutral-500">Orders / labor hour</div>
                          <div className="mt-1 text-lg font-semibold tabular-nums">
                            {formatDecimal(Number(hourlySummary.peak.orders_per_labor_hour || 0))}
                          </div>
                        </div>
                        <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 px-3 py-3">
                          <div className="text-xs text-neutral-500">Orders / staff</div>
                          <div className="mt-1 text-lg font-semibold tabular-nums">
                            {formatDecimal(Number(hourlySummary.peak.orders_per_staff || 0))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-6 text-center text-sm text-neutral-500">
                      Peak-hour density will appear after hourly files are synced.
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                    <tr>
                      <th className="px-3 py-2">Hour</th>
                      <th className="px-3 py-2">Net Sales</th>
                      <th className="px-3 py-2">Orders</th>
                      <th className="px-3 py-2">Labor Hours</th>
                      <th className="px-3 py-2">Avg Staff</th>
                      <th className="px-3 py-2">Orders / Labor Hour</th>
                      <th className="px-3 py-2">Orders / Staff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(hourlySalesAnalytics?.rows || []).map((row) => (
                      <tr key={row.hour_of_day} className="border-b border-neutral-800/70">
                        <td className="px-3 py-2 tabular-nums">{row.hour_label}</td>
                        <td className="px-3 py-2 tabular-nums">{formatMoney(Number(row.net_sales || 0))}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatCount(Number(row.order_count_non_cancelled || 0))}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatDecimal(Number(row.labor_hours_total || 0))}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatDecimal(Number(row.avg_staff_count || 0))}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatDecimal(Number(row.orders_per_labor_hour || 0))}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatDecimal(Number(row.orders_per_staff || 0))}
                        </td>
                      </tr>
                    ))}
                    {!hourlySalesAnalytics?.rows?.length ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-center text-neutral-500">
                          No hourly analytics data
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            {city === "dubai" && !summaryBrandName ? (
              <p className="text-xs text-neutral-500">
                Summary totals above are <span className="text-neutral-300">city-wide net sales and orders</span>{" "}
                (SushiZEN + RamenZEN + All Veggie Sushi, one kitchen). Management P&amp;L labor ratio uses the same
                combined sales denominator.
              </p>
            ) : null}

            {city === "dubai" && brandOrderRanking.length ? (
              <div className="rounded-2xl border border-emerald-900/40 bg-emerald-950/15 p-4">
                <div className="mb-3 text-sm font-semibold text-emerald-100">Dubai — orders &amp; net sales by brand</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {brandOrderRanking.map((row) => (
                    <div key={row.brand} className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
                      <div className="text-xs font-medium text-neutral-400">{row.brand}</div>
                      <div className="mt-2 text-2xl font-bold text-white tabular-nums">{formatCount(row.orders)}</div>
                      <div className="text-[11px] text-neutral-500">orders (non-cancelled)</div>
                      <div className="mt-2 text-sm text-neutral-200">Net {formatMoney(row.netSales)}</div>
                      <div className="text-[11px] text-neutral-500">Gross {formatMoney(row.grossSales)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
              <div className="mb-2 text-sm font-semibold">
                {city === "dubai" ? "Brand ranking (all POS files in Drive folder)" : "Brand order ranking"}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                    <tr>
                      <th className="px-3 py-2">Rank</th>
                      <th className="px-3 py-2">Brand</th>
                      <th className="px-3 py-2">Orders</th>
                      <th className="px-3 py-2">Net Sales</th>
                      <th className="px-3 py-2">Gross Sales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {brandOrderRanking.map((row, idx) => (
                      <tr key={`${row.brand}-${idx}`} className="border-b border-neutral-800/70">
                        <td className="px-3 py-2">{idx + 1}</td>
                        <td className="px-3 py-2">{row.brand}</td>
                        <td className="px-3 py-2 tabular-nums">{formatCount(row.orders)}</td>
                        <td className="px-3 py-2 tabular-nums">{formatMoney(row.netSales)}</td>
                        <td className="px-3 py-2 tabular-nums">{formatMoney(row.grossSales)}</td>
                      </tr>
                    ))}
                    {!brandOrderRanking.length ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-neutral-500">
                          No brand-level order data
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
              <div className="text-sm font-semibold">Sales x Attendance Operational Insights</div>
              <div className="mt-1 text-xs text-neutral-500">
                Sales period and attendance period are aligned to the same Summary range.
              </div>
              <div className="mt-3 space-y-2">
                {salesOpsInsights.length ? (
                  salesOpsInsights.map((msg, idx) => (
                    <div
                      key={`${idx}-${msg.en}`}
                      className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-sm text-neutral-200"
                    >
                      <div>- {msg.en}</div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-3 text-sm text-neutral-500">
                    Not enough joined data yet for operational insights.
                  </div>
                )}
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
                        <td className="px-3 py-2 tabular-nums">{formatCount(row.order_count_non_cancelled)}</td>
                        <td className="px-3 py-2 tabular-nums">{formatMoney(Number(row.net_revenue || 0))}</td>
                        <td className="px-3 py-2 tabular-nums">{formatMoney(Number(row.gross_revenue || 0))}</td>
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
                        <td className="px-3 py-2 tabular-nums">{formatCount(row.order_count_non_cancelled)}</td>
                        <td className="px-3 py-2 tabular-nums">{formatMoney(Number(row.gross_revenue || 0))}</td>
                        <td className="px-3 py-2 tabular-nums">{formatMoney(Number(row.net_revenue || 0))}</td>
                        <td className="px-3 py-2 tabular-nums">{formatMoney(Number(row.discounts || 0))}</td>
                        <td className="px-3 py-2 tabular-nums">{formatMoney(Number(row.charges || 0))}</td>
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
          ) : analyticsTab === "payroll" ? (
          <div className="mt-8 space-y-4">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
              <div className="mb-4 flex flex-wrap items-end gap-3">
                <div className="min-w-[200px] flex-1 sm:min-w-[240px]">
                  <div className="text-sm font-semibold">Payroll Period (Month-based)</div>
                  <div className="mt-1 text-xs text-neutral-500">
                    Uses the same <span className="text-neutral-300">Summary From/To</span> as Staff Analytics, Sales
                    Summary, and Management P&amp;L so totals match. Bayzat exports in{" "}
                    <code className="text-neutral-400">PAYROLL_FOLDER_ID</code>. Visible to HQ/Admin and city management.
                  </div>
                </div>
                <div className="w-full sm:w-auto">
                  <div className="mb-1 text-xs text-neutral-400">City</div>
                  <select
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full min-w-[180px] rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
                  >
                    <option value="dubai">Dubai</option>
                    <option value="manila">Manila</option>
                  </select>
                </div>
                <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:min-w-[320px]">
                  <label className="text-xs text-neutral-400">
                    From (Summary period)
                    <input
                      type="date"
                      value={summaryDateFrom}
                      onChange={(e) => setSummaryDateFrom(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="text-xs text-neutral-400">
                    To (Summary period)
                    <input
                      type="date"
                      value={summaryDateTo}
                      onChange={(e) => setSummaryDateTo(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
                    />
                  </label>
                </div>
                <div className="w-full sm:w-auto sm:min-w-[240px]">
                  <label className="text-xs text-neutral-400">
                    Staff
                    <select
                      value={payrollStaffName}
                      onChange={(e) => setPayrollStaffName(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
                    >
                      <option value="">All Staff</option>
                      {payrollStaffOptions.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="ml-auto flex gap-2">
                  <button
                    type="button"
                    onClick={() => loadAll("payroll")}
                    disabled={loading || !approverName.trim() || !pin.trim()}
                    className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-60"
                  >
                    {loading ? "Loading..." : "Refresh Payroll"}
                  </button>
                  <button
                    type="button"
                    onClick={syncPayrollNow}
                    disabled={payrollSyncing || !approverName.trim() || !pin.trim()}
                    className="rounded-2xl border border-sky-700 bg-sky-950/30 px-4 py-3 text-sm font-semibold text-sky-200 transition hover:bg-sky-900/40 disabled:opacity-60"
                  >
                    {payrollSyncing ? "Syncing..." : "Sync Payroll Folder"}
                  </button>
                </div>
              </div>
              {payrollSyncMessage ? (
                <div className="mt-3 rounded-xl border border-neutral-700 bg-neutral-950/40 px-3 py-2 text-xs text-neutral-300">
                  {payrollSyncMessage}
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs text-neutral-500">Payroll Total (Net Pay)</div>
                <div className="mt-1 text-2xl font-bold">{payrollSummary.totalNetPay.toFixed(2)}</div>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs text-neutral-500">Basic Salary</div>
                <div className="mt-1 text-2xl font-bold">{payrollSummary.basicSalary.toFixed(2)}</div>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs text-neutral-500">Accommodation</div>
                <div className="mt-1 text-2xl font-bold">{payrollSummary.accommodation.toFixed(2)}</div>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs text-neutral-500">Transportation</div>
                <div className="mt-1 text-2xl font-bold">{payrollSummary.transportation.toFixed(2)}</div>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs text-neutral-500">Staff Rows</div>
                <div className="mt-1 text-2xl font-bold">{payrollSummary.rowCount}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs text-neutral-500">Gross Pay (total)</div>
                <div className="mt-1 text-xl font-bold">{payrollSummary.grossPay.toFixed(2)}</div>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs text-neutral-500">Food allowance</div>
                <div className="mt-1 text-xl font-bold">{payrollSummary.foodAllowance.toFixed(2)}</div>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs text-neutral-500">Other allowance</div>
                <div className="mt-1 text-xl font-bold">{payrollSummary.otherAllowance.toFixed(2)}</div>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs text-neutral-500">Net additions</div>
                <div className="mt-1 text-xl font-bold">{payrollSummary.netAdditions.toFixed(2)}</div>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs text-neutral-500">Net deductions</div>
                <div className="mt-1 text-xl font-bold">{payrollSummary.netDeductions.toFixed(2)}</div>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="text-xs text-neutral-500">Arrears + / −</div>
                <div className="mt-1 text-xl font-bold">
                  {(payrollSummary.arrearsAddition - payrollSummary.arrearsDeduction).toFixed(2)}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
              <div className="mb-2 text-sm font-semibold">Payroll Staff Details</div>
              <div className="overflow-x-auto">
                <table className="min-w-[900px] text-left text-sm">
                  <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                    <tr>
                      <th className="sticky left-0 z-10 bg-neutral-900 px-3 py-2">Month</th>
                      <th className="sticky left-14 z-10 bg-neutral-900 px-3 py-2">Staff</th>
                      <th className="px-3 py-2">Dept</th>
                      <th className="px-3 py-2">Basic</th>
                      <th className="px-3 py-2">Housing</th>
                      <th className="px-3 py-2">Food</th>
                      <th className="px-3 py-2">Other</th>
                      <th className="px-3 py-2">Transp.</th>
                      <th className="px-3 py-2">Gross</th>
                      <th className="px-3 py-2">Net +/-</th>
                      <th className="px-3 py-2">Net pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payrollRowsFiltered.slice(0, 300).map((row, idx) => (
                      <tr key={`${row.month_key}-${row.staff_name}-${idx}`} className="border-b border-neutral-800/70">
                        <td className="sticky left-0 bg-neutral-950/95 px-3 py-2">{row.month_key}</td>
                        <td className="sticky left-14 max-w-[200px] truncate bg-neutral-950/95 px-3 py-2">{row.staff_name}</td>
                        <td className="px-3 py-2">{row.department || "-"}</td>
                        <td className="px-3 py-2">{Number(row.basic_salary || 0).toFixed(2)}</td>
                        <td className="px-3 py-2">{Number(row.accommodation || 0).toFixed(2)}</td>
                        <td className="px-3 py-2">{Number(row.food_allowance || 0).toFixed(2)}</td>
                        <td className="px-3 py-2">{Number(row.other_allowance || 0).toFixed(2)}</td>
                        <td className="px-3 py-2">{Number(row.transportation || 0).toFixed(2)}</td>
                        <td className="px-3 py-2">{Number(row.gross_pay || 0).toFixed(2)}</td>
                        <td className="px-3 py-2">
                          {(Number(row.net_additions || 0) - Number(row.net_deductions || 0)).toFixed(2)}
                        </td>
                        <td className="px-3 py-2 font-medium text-sky-200">{Number(row.total_net_pay || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                    {!payrollRowsFiltered.length ? (
                      <tr>
                        <td colSpan={11} className="px-3 py-6 text-center text-neutral-500">
                          {payrollRows.length
                            ? "No payroll data for selected period/staff"
                            : "No payroll data imported yet (try Sync Payroll Folder)"}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          ) : analyticsTab === "finance" ? (
          <div className="mt-8 space-y-4">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
              <div className="mb-3 flex flex-wrap items-end gap-3">
                <div className="min-w-[200px] flex-1 text-sm font-semibold">Management P&amp;L (Target-based)</div>
                <div className="w-full sm:w-auto">
                  <div className="mb-1 text-xs text-neutral-400">City</div>
                  <select
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full min-w-[180px] rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
                  >
                    <option value="dubai">Dubai</option>
                    <option value="manila">Manila</option>
                  </select>
                </div>
                <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:min-w-[320px]">
                  <label className="text-xs text-neutral-400">
                    From (same as Sales Summary)
                    <input
                      type="date"
                      value={summaryDateFrom}
                      onChange={(e) => setSummaryDateFrom(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="text-xs text-neutral-400">
                    To (same as Sales Summary)
                    <input
                      type="date"
                      value={summaryDateTo}
                      onChange={(e) => setSummaryDateTo(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="text-xs text-neutral-400">
                    Store scope (P&amp;L)
                    <select
                      value={plStoreName}
                      onChange={(e) => setPlStoreName(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
                    >
                      <option value="">Company total</option>
                      {plStoreOptions.map((opt) => (
                        <option key={opt.label} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => loadAll("finance")}
                  disabled={loading || !approverName.trim() || !pin.trim()}
                  className="ml-auto rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-60"
                >
                  {loading ? "Loading..." : "Refresh P&L"}
                </button>
              </div>
              <div className="text-xs text-neutral-500">
                The period matches <span className="text-neutral-300">Sales Analytics → Summary From/To</span>. Top KPI
                cards prioritize imported <span className="text-neutral-300">P&amp;L revenue / opex / profit</span> when
                available (to align with workbook totals). POS metrics remain for operations (orders/menu/store ranking).
                HQ/Admin and city management only.
              </div>
              <div className="mt-3 flex flex-wrap items-start gap-4 border-t border-neutral-800 pt-3">
                <div className="min-w-[240px] flex-1 text-xs text-neutral-400">
                  <span className="font-semibold text-neutral-300">Import monthly P&amp;L (Excel)</span>
                  <p className="mt-1 max-w-xl leading-relaxed">
                    Same layout as Google sync (label column C; Dubai total column K; Manila total column G). The import
                    month comes from the tab name (e.g. <span className="text-neutral-500">202602 …</span>). Set Summary
                    From/To to <span className="text-neutral-300">one calendar month</span> to load the comparison
                    below.
                  </p>
                  <input
                    type="file"
                    accept=".xlsx,.xlsm"
                    className="mt-2 block w-full max-w-sm text-xs text-neutral-300 file:mr-2 file:rounded-lg file:border-0 file:bg-neutral-700 file:px-2 file:py-1"
                    disabled={plUploading || !approverName.trim() || !pin.trim()}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      void uploadPlExcel(f ?? null);
                      e.target.value = "";
                    }}
                  />
                  {plUploading ? <span className="mt-1 block text-xs text-neutral-500">Importing…</span> : null}
                  {plUploadMessage ? (
                    <span className="mt-1 block text-xs text-amber-200/90">{plUploadMessage}</span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
              <div className="flex min-h-[120px] flex-col rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="min-h-[32px] text-xs leading-4 text-neutral-500">Revenue (P&amp;L imported)</div>
                <div className="mt-2 min-h-[40px] text-2xl font-bold tabular-nums">
                  {plHeadline
                    ? formatMoney(plHeadline.revenue)
                    : isStoreScopedView
                    ? "—"
                    : formatMoney(Number(financeRatio?.sales_total ?? 0))}
                </div>
              </div>
              <div className="flex min-h-[120px] flex-col rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="min-h-[32px] text-xs leading-4 text-neutral-500">Opex (P&amp;L rollup)</div>
                <div className="mt-2 min-h-[40px] text-2xl font-bold tabular-nums">
                  {plHeadline
                    ? formatMoney(plHeadline.opex)
                    : isStoreScopedView
                    ? "—"
                    : financeBreakdown
                    ? formatMoney(financeBreakdown.totalModeledCost)
                    : "—"}
                </div>
              </div>
              <div className="flex min-h-[120px] flex-col rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="min-h-[32px] text-xs leading-4 text-neutral-500">Operating profit (P&amp;L)</div>
                <div className="mt-2 min-h-[40px] text-2xl font-bold tabular-nums">
                  {plHeadline
                    ? formatMoney(plHeadline.profit)
                    : isStoreScopedView
                    ? "—"
                    : formatMoney(Number(financeRatio?.estimated_profit_using_targets ?? 0))}
                </div>
              </div>
              <div className="flex min-h-[120px] flex-col rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="min-h-[32px] text-xs leading-4 text-neutral-500">FLR cost total</div>
                <div className="mt-2 min-h-[40px] text-2xl font-bold tabular-nums">
                  {plHeadline ? formatMoney(plHeadline.flrCost) : "—"}
                </div>
              </div>
              <div className="flex min-h-[120px] flex-col rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="min-h-[32px] text-xs leading-4 text-neutral-500">Other expenses total</div>
                <div className="mt-2 min-h-[40px] text-2xl font-bold tabular-nums">
                  {plHeadline ? formatMoney(plHeadline.otherExpenses) : "—"}
                </div>
              </div>
              <div className="flex min-h-[120px] flex-col rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="min-h-[32px] text-xs leading-4 text-neutral-500">Labor ratio (P&amp;L labor ÷ revenue)</div>
                <div className="mt-2 min-h-[40px] text-2xl font-bold tabular-nums">
                  {plHeadline
                    ? formatPct(plHeadline.laborRatioPct)
                    : isStoreScopedView
                    ? "—"
                    : formatPct(Number(financeRatio?.labor_ratio || 0) * 100)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <div className="flex min-h-[120px] flex-col rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="min-h-[32px] text-xs leading-4 text-neutral-500">Gross profit amount</div>
                <div className="mt-2 min-h-[40px] text-2xl font-bold tabular-nums">
                  {grossProfitMetrics ? formatMoney(grossProfitMetrics.grossProfitAmount) : "—"}
                </div>
              </div>
              <div className="flex min-h-[120px] flex-col rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="min-h-[32px] text-xs leading-4 text-neutral-500">Gross profit rate</div>
                <div className="mt-2 min-h-[40px] text-2xl font-bold tabular-nums">
                  {grossProfitMetrics ? formatPct(grossProfitMetrics.grossProfitRate) : "—"}
                </div>
              </div>
              <div className="flex min-h-[120px] flex-col rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="min-h-[32px] text-xs leading-4 text-neutral-500">Gross profit / labor hour</div>
                <div className="mt-2 min-h-[40px] text-2xl font-bold tabular-nums">
                  {grossProfitMetrics?.grossProfitPerLaborHour != null
                    ? formatMoney(grossProfitMetrics.grossProfitPerLaborHour)
                    : "—"}
                </div>
              </div>
              <div className="flex min-h-[120px] flex-col rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="min-h-[32px] text-xs leading-4 text-neutral-500">Gross profit / attendance</div>
                <div className="mt-2 min-h-[40px] text-2xl font-bold tabular-nums">
                  {grossProfitMetrics?.grossProfitPerAttendance != null
                    ? formatMoney(grossProfitMetrics.grossProfitPerAttendance)
                    : "—"}
                </div>
              </div>
              <div className="flex min-h-[120px] flex-col rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="min-h-[32px] text-xs leading-4 text-neutral-500">Gross profit / order</div>
                <div className="mt-2 min-h-[40px] text-2xl font-bold tabular-nums">
                  {grossProfitMetrics?.grossProfitPerOrder != null
                    ? formatMoney(grossProfitMetrics.grossProfitPerOrder)
                    : "—"}
                </div>
              </div>
            </div>

            {plVsTarget?.ok ? (
              <div className="rounded-2xl border border-violet-900/40 bg-violet-950/10 p-4 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="font-semibold text-violet-100">
                    Imported P&amp;L vs target lines ({plVsTarget.month_key}
                    {plVsTarget.scope === "store" && plVsTarget.store_name ? ` · ${plVsTarget.store_name}` : ""})
                  </div>
                  {plVsTarget.pl_import?.sheet_name ? (
                    <div className="text-[11px] text-neutral-500">
                      Sheet: {plVsTarget.pl_import.sheet_name}
                      {plVsTarget.pl_import.imported_at ? ` · ${plVsTarget.pl_import.imported_at}` : ""}
                    </div>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-neutral-400">
                  Target amounts use <span className="text-neutral-200">analysis sales basis</span> (P&amp;L revenue
                  primary; POS fallback only if monthly PL is missing). Food / rent / other actuals are rolled up from
                  imported P&amp;L labels; labor shows Bayzat payroll vs P&amp;L labor lines for cross-check.
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-neutral-500 md:grid-cols-4">
                  <div>
                    Analysis sales:{" "}
                    <span className="font-mono text-neutral-200">
                      {formatMoney(Number(plVsTarget.analysis_sales ?? plVsTarget.revenue_pl ?? 0))}
                    </span>
                  </div>
                  <div>
                    Revenue (P&amp;L):{" "}
                    <span className="font-mono text-neutral-200">{formatMoney(Number(plVsTarget.revenue_pl || 0))}</span>
                  </div>
                  <div>
                    POS reference:{" "}
                    <span className="font-mono text-neutral-200">
                      {formatMoney(Number(plVsTarget.net_sales_pos || 0))}
                    </span>
                  </div>
                  <div>
                    Rollup check (|residual|):{" "}
                    <span
                      className={
                        (plVsTarget.checks?.rollup_residual_abs ?? 0) <= 1
                          ? "text-emerald-400"
                          : "text-amber-400"
                      }
                    >
                      {plVsTarget.rollup?.rollup_residual != null
                        ? Math.abs(plVsTarget.rollup.rollup_residual).toFixed(4)
                        : "—"}
                    </span>
                  </div>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-violet-900/50 text-neutral-500">
                        <th className="py-2 pr-2">Bucket</th>
                        <th className="py-2 pr-2">Target %</th>
                        <th className="py-2 pr-2">Target amt</th>
                        <th className="py-2 pr-2">Actual (import)</th>
                        <th className="py-2 pr-2">Actual % / analysis sales</th>
                        <th className="py-2 pr-2">Δ vs target $</th>
                        <th className="py-2">Δ vs target pp</th>
                      </tr>
                    </thead>
                    <tbody className="text-neutral-200">
                      {(["food", "rent", "other"] as const).map((k) => {
                        const b = plVsTarget.buckets[k];
                        return (
                          <tr key={k} className="border-b border-neutral-800/80">
                            <td className="py-2 pr-2 capitalize">{k}</td>
                            <td className="py-2 pr-2">{formatPct(b.target_pct * 100)}</td>
                            <td className="py-2 pr-2 font-mono">{formatMoney(b.target_amount)}</td>
                            <td className="py-2 pr-2 font-mono">{formatMoney(b.actual_amount)}</td>
                            <td className="py-2 pr-2">{formatPct(b.actual_pct_of_net_sales_pos)}</td>
                            <td className="py-2 pr-2 font-mono">{formatMoney(b.variance_amount)}</td>
                            <td className="py-2">{b.variance_pct_points.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                      <tr className="border-b border-neutral-800/80 bg-violet-950/20">
                        <td className="py-2 pr-2">Labor</td>
                        <td className="py-2 pr-2">{formatPct(laborDisplay?.targetPct ?? 0)}</td>
                        <td className="py-2 pr-2 font-mono">
                          {formatMoney(laborDisplay?.targetAmount ?? 0)}
                        </td>
                        <td className="py-2 pr-2">
                          {laborDisplay?.usePlOnly ? (
                            <div className="font-mono">P&amp;L lines {formatMoney(laborDisplay.plAmount)}</div>
                          ) : (
                            <>
                              <div className="font-mono">Payroll {formatMoney(laborDisplay?.payrollAmount ?? 0)}</div>
                              <div className="text-[10px] text-neutral-500">
                                P&amp;L lines {formatMoney(laborDisplay?.plAmount ?? 0)}
                              </div>
                            </>
                          )}
                        </td>
                        <td className="py-2 pr-2">
                          {laborDisplay?.usePlOnly ? (
                            <div>{formatPct(laborDisplay.actualPct)} P&amp;L</div>
                          ) : (
                            <>
                              <div>{formatPct(laborDisplay?.actualPct ?? 0)} payroll</div>
                              <div className="text-[10px] text-neutral-500">
                                {formatPct(plVsTarget.buckets.labor.actual_pct_of_net_sales_pos_pl)} P&amp;L
                              </div>
                            </>
                          )}
                        </td>
                        <td className="py-2 pr-2 font-mono">
                          {formatMoney(laborDisplay?.varianceAmount ?? 0)}
                        </td>
                        <td className="py-2 text-[10px] text-neutral-400">
                          {laborDisplay?.usePlOnly
                            ? "Store scope uses P&L labor lines"
                            : `PL vs payroll Δ ${formatMoney(laborDisplay?.variancePlVsPayroll ?? 0)}`}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {plVsTarget.checks?.note ? (
                  <p className="mt-2 text-[11px] text-neutral-500">{plVsTarget.checks.note}</p>
                ) : null}
              </div>
            ) : plVsTarget?.missing_store ? (
              <div className="rounded-2xl border border-amber-800/70 bg-amber-950/20 p-4 text-xs text-amber-100/90">
                <span className="font-medium">Store scope not found.</span>{" "}
                {plVsTarget.detail || "Select another store or re-sync monthly P&L to include store columns."}
              </div>
            ) : (
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4 text-xs text-neutral-500">
                <span className="font-medium text-neutral-400">Imported P&amp;L vs targets</span> — No row in the
                database for this city/month. Upload the monthly Excel (or sync from Google), then set Summary From/To
                to that month and refresh.
              </div>
            )}

            
          </div>
          ) : (
          <div className="mt-8 rounded-2xl border border-neutral-800 bg-neutral-900/20 p-6 text-sm text-neutral-400">
            This channel is not available for your current role/city.
          </div>
          )}

          {analyticsTab === "staff" && canViewStaffChannel ? (
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
                  loadAll("staff");
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
                    const pm = previousCalendarMonthRangeIso();
                    setSummaryDateFrom(pm.from);
                    setSummaryDateTo(pm.to);
                  }}
                  className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm font-semibold text-white hover:bg-neutral-900"
                >
                  Reset to previous month
                </button>
              </div>
            </div>
          </div>
          ) : null}

          {analyticsTab === "staff" && canViewStaffChannel ? (
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
          ) : null}

          {analyticsTab === "staff" ? (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-5">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
              <div className="min-h-[32px] text-xs text-neutral-500">Net Sales Volume</div>
              <div className="mt-1 min-h-[40px] min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-lg font-bold leading-tight tabular-nums sm:text-xl md:text-2xl">
                {formatMoney(posSalesSummary.totalNetSales)}
              </div>
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
              <div className="min-h-[32px] text-xs text-neutral-500">Gross Revenue</div>
              <div className="mt-1 min-h-[40px] min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-lg font-bold leading-tight tabular-nums sm:text-xl md:text-2xl">
                {formatMoney(posSalesSummary.totalGrossSales)}
              </div>
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
              <div className="min-h-[32px] text-xs text-neutral-500">Order Count (Non-Cancelled)</div>
              <div className="mt-1 min-h-[40px] min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-lg font-bold leading-tight tabular-nums sm:text-xl md:text-2xl">
                {formatCount(posSalesSummary.totalOrders)}
              </div>
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
              <div className="min-h-[32px] text-xs text-neutral-500">Avg Net / Order</div>
              <div className="mt-1 min-h-[40px] min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-lg font-bold leading-tight tabular-nums sm:text-xl md:text-2xl">
                {formatMoney(posSalesSummary.avgRevenuePerOrder)}
              </div>
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
              <div className="min-h-[32px] text-xs text-neutral-500">Days w/ sales data</div>
              <div className="mt-1 min-h-[40px] min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-lg font-bold leading-tight tabular-nums sm:text-xl md:text-2xl">
                {formatCount(posSalesSummary.dayCount)}
              </div>
            </div>
          </div>
          ) : null}

          {analyticsTab === "staff" ? (
          <>
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
          </>
          ) : null}

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