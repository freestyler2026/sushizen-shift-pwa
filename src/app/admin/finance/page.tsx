"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  canAccessFinancePage,
  clearStepUpAuth,
  getAuth,
  getAuthHeaders,
  refreshAuthFromApi,
  setStepUpAuth,
  stepUpSatisfies,
  tryRefreshAccessToken,
} from "@/lib/auth";
import { startPasskeyAuthentication } from "@/lib/webauthn";
import DateRangePicker from "@/components/DateRangePicker";
import MonthPicker from "@/components/MonthPicker";
import { fmtNum, fmtNumTitle } from "@/lib/formatters";
import { FlashValue } from "@/components/ui/FlashValue";
import { Spinner } from "@/components/ui/Spinner";
import {
  GLASS_CARD, KPI_CARD, PRIMARY_BUTTON, SECONDARY_BUTTON,
  TAB_CONTAINER, TAB_ACTIVE, TAB_INACTIVE,
  INPUT_CLASS, SELECT_CLASS,
  TABLE_HEADER, TABLE_ROW, TABLE_CELL,
} from "@/lib/ui-tokens";

// ─── API helpers ─────────────────────────────────────────────────────────────

function getApiBase() {
  if (process.env.NODE_ENV !== "production") return "http://127.0.0.1:8000";
  return "";
}

function parseApiErrorDetail(text: string) {
  try {
    const parsed = JSON.parse(text);
    return typeof parsed?.detail === "string" ? parsed.detail : "";
  } catch {
    return "";
  }
}

function normalizeApiErrorMessage(raw: string, fallback: string) {
  const text = String(raw || "").trim();
  const lower = text.toLowerCase();
  if (!text) return fallback;
  if (text.includes("<!DOCTYPE html") || lower.includes("<html") || lower.includes("application error")) {
    return "Server timed out. Please retry.";
  }
  if (lower.includes("h12") || lower.includes("request timeout") || lower.includes("503")) {
    return "Server timed out. Please retry.";
  }
  return text;
}

async function apiGet<T = any>(path: string): Promise<T> {
  const request = async () =>
    fetch(`${getApiBase()}${path}`, { cache: "no-store", headers: getAuthHeaders() });
  let res = await request();
  let text = await res.text();
  if (res.status === 401) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) { res = await request(); text = await res.text(); }
  }
  if (!res.ok && res.status === 401) {
    const detail = parseApiErrorDetail(text);
    const current = getAuth();
    if (current?.pin && (detail.includes("Invalid access token") || detail.includes("Authentication is required") || !current.accessToken)) {
      await refreshAuthFromApi(current, { includeMfa: true });
      res = await request();
      text = await res.text();
    }
  }
  if (!res.ok) {
    const detail = parseApiErrorDetail(text);
    throw new Error(normalizeApiErrorMessage(detail || text, `GET ${path} failed`));
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function apiPost<T = any>(path: string, body: Record<string, unknown>): Promise<T> {
  const request = async () =>
    fetch(`${getApiBase()}${path}`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
      cache: "no-store",
    });
  let res = await request();
  let text = await res.text();
  if (res.status === 401) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) { res = await request(); text = await res.text(); }
  }
  if (!res.ok) {
    const detail = parseApiErrorDetail(text);
    throw new Error(normalizeApiErrorMessage(detail || text, `POST ${path} failed`));
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

// ─── Types ────────────────────────────────────────────────────────────────────

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
  implied_costs_at_target_pct?: { food: number; rent: number; other: number; labor_target_abs: number };
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

type BreakEvenSummary = {
  sales: number;
  orders: number;
  avg_sales_per_order: number | null;
  food_cost: number;
  labor_cost: number;
  rent_cost: number;
  other_cost: number;
  fixed_cost: number;
  variable_cost: number;
  variable_cost_ratio: number | null;
  contribution_margin_ratio: number | null;
  operating_profit: number;
  profit_per_order: number | null;
  break_even_sales_period: number | null;
  break_even_sales_per_day: number | null;
  break_even_orders_per_day: number | null;
  margin_of_safety_amount: number | null;
  margin_of_safety_pct: number | null;
  days_to_break_even: number | null;
};

type BreakEvenStoreRow = BreakEvenSummary & {
  store_name: string;
  branch_code?: string;
  basis_mode: "rolling_30d" | "previous_month_fallback" | "imported_pl_month";
};

type BreakEvenMissingPosStoreDetail = {
  store_name: string;
  branch_code?: string | null;
  missing_dates: string[];
};

type BreakEvenResp = {
  ok: boolean;
  city: string;
  scope: "company" | "store";
  store_name?: string;
  basis?: {
    mode: "rolling_30d" | "previous_month_fallback" | "imported_pl_month";
    month_key?: string;
    date_from: string;
    date_to: string;
    as_of_date: string;
    fallback_reason?: string;
    source_months: string[];
  };
  completeness?: {
    pos_days_expected: number;
    pos_days_present: number;
    missing_pos_dates?: string[];
    missing_pos_store_details?: BreakEvenMissingPosStoreDetail[];
    pl_months_expected: string[];
    pl_months_present: string[];
    missing_pl_months?: string[];
    used_fallback: boolean;
    rolling_reasons?: string[];
    selected_reasons?: string[];
    rolling_missing_pos_dates?: string[];
    rolling_missing_pos_store_details?: BreakEvenMissingPosStoreDetail[];
    rolling_missing_pl_months?: string[];
  };
  detail?: string;
  summary?: BreakEvenSummary | null;
  stores?: BreakEvenStoreRow[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const FINANCE_SECTION_OPTIONS = [
  { value: "summary", label: "Summary", id: "finance-summary" },
  { value: "breakEven", label: "Break-even", id: "finance-break-even" },
  { value: "plDetails", label: "P&L Details", id: "finance-pl-details" },
  { value: "payroll", label: "Payroll", id: "finance-payroll" },
] as const;

const NUMERIC_FINANCE_KPI_VALUE = "mt-2 min-h-[40px] text-xl font-bold leading-tight tracking-tight text-white tabular-nums whitespace-nowrap overflow-hidden";
const NUMERIC_BLOCK_VALUE = "mt-2 min-h-[40px] text-2xl font-bold leading-tight tracking-tight text-white tabular-nums break-words";
const NUMERIC_SMALL_BLOCK_VALUE = "mt-1 text-lg font-bold leading-tight tracking-tight text-white tabular-nums break-words";

// ─── Formatters ───────────────────────────────────────────────────────────────

const moneyFormatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const integerFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

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
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function formatPct(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}
function formatBreakEvenBasis(mode?: "rolling_30d" | "previous_month_fallback" | "imported_pl_month") {
  if (mode === "previous_month_fallback") return "Previous month fallback";
  if (mode === "imported_pl_month") return "Imported P&L month";
  return "Rolling 30 days";
}
function formatBreakEvenFallbackReason(reason?: string) {
  if (!reason) return "";
  if (reason === "missing_pos_days") return "Data was incomplete because one or more POS days were missing.";
  if (reason === "missing_pl_month_import") return "The synced monthly P&L import for this period is not available yet.";
  if (reason === "missing_store_scope_in_pl") return "One or more store columns are missing in the P&L import.";
  if (reason === "missing_multiple_sources") return "Multiple required P&L fields are missing for this view.";
  return reason;
}
function formatBreakEvenReasonLabel(reason?: string) {
  if (!reason) return "";
  if (reason === "missing_pos_days") return "POS daily data is missing for one or more dates.";
  if (reason === "missing_pl_month_import") return "Monthly P&L import data is missing for this month.";
  if (reason === "missing_store_scope_in_pl") return "One or more store columns are missing in the P&L import.";
  return reason;
}
function formatBreakEvenMissingDates(dates?: string[]) {
  const items = (dates || []).filter(Boolean);
  if (!items.length) return "";
  if (items.length <= 6) return items.join(", ");
  return `${items.slice(0, 6).join(", ")} (+${items.length - 6} more)`;
}
function formatBreakEvenDays(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${formatDecimal(Number(value), 1)} days`;
}

function previousCalendarMonthRangeIso(): { from: string; to: string } {
  const now = new Date();
  const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
  const firstDayPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  const from = `${firstDayPrevMonth.getFullYear()}-${pad(firstDayPrevMonth.getMonth() + 1)}-${pad(firstDayPrevMonth.getDate())}`;
  const to = `${lastDayPrevMonth.getFullYear()}-${pad(lastDayPrevMonth.getMonth() + 1)}-${pad(lastDayPrevMonth.getDate())}`;
  return { from, to };
}

function monthRangeFromMonthKey(monthKey: string): { from: string; to: string } | null {
  const m = String(monthKey || "").trim().match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  const last = new Date(year, month, 0).getDate();
  return { from: `${m[1]}-${m[2]}-01`, to: `${m[1]}-${m[2]}-${String(last).padStart(2, "0")}` };
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

// ─── MetricValue ─────────────────────────────────────────────────────────────

function MetricValue({
  value,
  unit,
  className = NUMERIC_FINANCE_KPI_VALUE,
}: {
  value: number | string | null | undefined;
  unit?: string;
  className?: string;
}) {
  const isNumber = typeof value === "number" && Number.isFinite(value);
  const text = isNumber ? fmtNum(value, unit) : String(value ?? "-");
  const title = isNumber ? fmtNumTitle(value, unit) : String(value ?? "-");
  return <FlashValue value={text} className={className} title={title} />;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FinancePage() {
  const router = useRouter();

  // ── Auth state ──────────────────────────────────────────────────────────────
  const [authReady, setAuthReady] = useState(false);
  const [approverName, setApproverName] = useState("");
  const [pin, setPin] = useState("");
  const [stepUpVerifiedThisVisit, setStepUpVerifiedThisVisit] = useState(false);
  const [securityBusy, setSecurityBusy] = useState(false);
  const [securityError, setSecurityError] = useState("");
  const [securityMessage, setSecurityMessage] = useState("");

  // ── Finance state ──────────────────────────────────────────────────────────
  const [city, setCity] = useState("dubai");
  const [summaryDateFrom, setSummaryDateFrom] = useState(() => previousCalendarMonthRangeIso().from);
  const [summaryDateTo, setSummaryDateTo] = useState(() => previousCalendarMonthRangeIso().to);
  const [summaryMonthKey, setSummaryMonthKey] = useState(() => previousCalendarMonthRangeIso().from.slice(0, 7));
  const [financeSectionView, setFinanceSectionView] = useState<"summary" | "breakEven" | "plDetails" | "payroll" | "all">("summary");
  const [plStoreName, setPlStoreName] = useState("");
  const [payrollStaffName, setPayrollStaffName] = useState("");

  const [financeRatio, setFinanceRatio] = useState<FinanceLaborRatioResp | null>(null);
  const [plVsTarget, setPlVsTarget] = useState<PlVsTargetResp | null>(null);
  const [breakEven, setBreakEven] = useState<BreakEvenResp | null>(null);
  const [payrollRows, setPayrollRows] = useState<PayrollStaffRow[]>([]);

  const [loading, setLoading] = useState(false);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [plSyncing, setPlSyncing] = useState(false);
  const [plSyncMessage, setPlSyncMessage] = useState("");
  const [payrollSyncing, setPayrollSyncing] = useState(false);
  const [payrollSyncMessage, setPayrollSyncMessage] = useState("");

  const loadGenRef = useRef(0);

  // ── Auth guard + init ───────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const next = await refreshAuthFromApi(getAuth(), { includeMfa: true });
      if (!canAccessFinancePage(next)) {
        router.replace("/admin/analytics");
        return;
      }
      const keepStepUp = stepUpSatisfies("aal2", next);
      setStepUpVerifiedThisVisit(keepStepUp);
      if (!keepStepUp) clearStepUpAuth();
      if (next?.staffName) setApproverName(next.staffName);
      if (next?.pin) setPin(next.pin || "");
      setAuthReady(true);
    })();
  }, [router]);

  const financeStepUpReady = stepUpSatisfies("aal2", getAuth()) && stepUpVerifiedThisVisit;

  // ── Security functions ──────────────────────────────────────────────────────
  async function runPasskeyStepUp() {
    setSecurityBusy(true);
    setSecurityError("");
    setSecurityMessage("");
    try {
      const start = await apiPost<{ options: any; state_token: string }>("/api/auth/webauthn/auth/options", {});
      const credential = await startPasskeyAuthentication(start.options);
      const res = await apiPost<{ step_up_token: string; mfa_level: "phishing_resistant"; method: string }>("/api/auth/webauthn/auth/verify", {
        state_token: start.state_token,
        credential,
      });
      setStepUpAuth({ stepUpToken: res.step_up_token, stepUpLevel: res.mfa_level, stepUpMethod: res.method });
      setStepUpVerifiedThisVisit(true);
      setSecurityMessage("Passkey verification complete.");
    } catch (e: any) {
      setSecurityError(String(e?.message || e || "Passkey verification failed"));
    } finally {
      setSecurityBusy(false);
    }
  }

  async function runPinStepUp() {
    if (!pin.trim()) { setSecurityError("Enter your PIN first."); return; }
    setSecurityBusy(true);
    setSecurityError("");
    setSecurityMessage("");
    try {
      const res = await apiPost<{ step_up_token: string; mfa_level: "aal2"; method: string }>("/api/auth/step-up/pin", { pin: pin.trim() });
      setStepUpAuth({ stepUpToken: res.step_up_token, stepUpLevel: res.mfa_level, stepUpMethod: res.method || "pin_reauth" });
      setStepUpVerifiedThisVisit(true);
      setSecurityMessage("PIN verification complete.");
    } catch (e: any) {
      setSecurityError(String(e?.message || e || "PIN verification failed"));
    } finally {
      setSecurityBusy(false);
    }
  }

  // ── Computed ────────────────────────────────────────────────────────────────
  const financeBreakdown = useMemo(() => {
    const fr = financeRatio;
    if (!fr) return null;
    const s = Number(fr.sales_total || 0);
    const targets = fr.target_lines || { food: 0, labor: 0, rent: 0, other: 0 };
    const f = s * Number(targets.food || 0);
    const l = s * Number(targets.labor || 0);
    const r = s * Number(targets.rent || 0);
    const o = s * Number(targets.other || 0);
    return { food: f, labor: l, rent: r, other: o, totalModeledCost: f + l + r + o };
  }, [financeRatio]);

  const plHeadline = useMemo(() => {
    const p = plVsTarget;
    if (!p?.ok || !p.rollup) return null;
    if (plStoreName.trim() && p.scope !== "store") return null;
    const revenue = Number(p.rollup.revenue_pl || p.analysis_sales || 0);
    const opex = Number(p.rollup.total_opex_modeled || 0);
    const profit = Number(p.rollup.profit_pl || 0);
    const flrCost = Number(p.rollup.flr_cost_total || 0);
    const laborPl = Number(p.rollup.labor_pl || 0);
    const otherExpenses = opex - Number(p.rollup.food || 0) - laborPl - Number(p.rollup.rent || 0);
    const laborRatioPct = revenue > 0 ? (laborPl / revenue) * 100 : 0;
    return { revenue, opex, profit, flrCost, otherExpenses, laborRatioPct };
  }, [plVsTarget, plStoreName]);

  const isStoreScopedView = plStoreName.trim().length > 0;

  const laborDisplay = useMemo(() => {
    if (!plVsTarget?.ok) return null;
    const labor = plVsTarget.buckets?.labor;
    if (!labor) return null;
    const usePlOnly = plVsTarget.scope === "store";
    const actualAmount = usePlOnly ? Number(labor.actual_pl_lines || 0) : Number(labor.actual_payroll_bayzat || 0);
    const actualPct = usePlOnly ? Number(labor.actual_pct_of_net_sales_pos_pl || 0) : Number(labor.actual_pct_of_net_sales_pos_payroll || 0);
    const varianceAmount = actualAmount - Number(labor.target_amount || 0);
    return {
      usePlOnly, actualAmount, actualPct,
      targetPct: Number(labor.target_pct || 0) * 100,
      targetAmount: Number(labor.target_amount || 0),
      plAmount: Number(labor.actual_pl_lines || 0),
      payrollAmount: Number(labor.actual_payroll_bayzat || 0),
      varianceAmount,
      variancePlVsPayroll: Number(labor.variance_pl_vs_payroll || 0),
    };
  }, [plVsTarget]);

  const plStoreOptions = useMemo(() => {
    const fromPl = (plVsTarget?.available_stores || []).map((s) => String(s || "").trim()).filter(Boolean);
    return fromPl.map((s) => ({ label: s, value: s }));
  }, [plVsTarget?.available_stores]);

  const payrollRowsInRange = useMemo(() => {
    const months = new Set(monthKeysBetween(summaryDateFrom, summaryDateTo));
    if (!months.size) return payrollRows;
    return payrollRows.filter((r) => months.has(String(r.month_key || "")));
  }, [payrollRows, summaryDateFrom, summaryDateTo]);

  const payrollStaffOptions = useMemo(() => {
    return Array.from(new Set(payrollRowsInRange.map((r) => String(r.staff_name || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
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
    return {
      totalNetPay, grossPay, basicSalary, accommodation, foodAllowance, otherAllowance,
      transportation, netAdditions, netDeductions, arrearsAddition, arrearsDeduction,
      staffCount: new Set(payrollRowsFiltered.map((r) => r.staff_name).filter(Boolean)).size,
      rowCount: payrollRowsFiltered.length,
    };
  }, [payrollRowsFiltered]);

  // ── Month picker handler ────────────────────────────────────────────────────
  const handleSummaryMonthChange = (monthKey: string) => {
    setSummaryMonthKey(monthKey);
    const range = monthRangeFromMonthKey(monthKey);
    if (!range) return;
    setSummaryDateFrom(range.from);
    setSummaryDateTo(range.to);
  };

  // ── Load data ───────────────────────────────────────────────────────────────
  const loadData = async () => {
    if (!approverName.trim() || !financeStepUpReady) return;
    const gen = ++loadGenRef.current;
    setLoading(true);
    setLoadErrors([]);
    const errors: string[] = [];

    const payrollQs = new URLSearchParams({ city, approver_name: approverName.trim(), pin: pin.trim(), limit: "5000" });
    const baseQs = new URLSearchParams({ city, date_from: summaryDateFrom, date_to: summaryDateTo, approver_name: approverName.trim(), pin: pin.trim() });

    await Promise.all([
      (async () => {
        try {
          const res = await apiGet<PayrollStaffResp>(`/api/admin/payroll/staff?${payrollQs.toString()}`);
          if (gen === loadGenRef.current) setPayrollRows(res.items || []);
        } catch (e: any) {
          errors.push(`Payroll: ${String(e?.message || e)}`);
          if (gen === loadGenRef.current) setPayrollRows([]);
        }
      })(),
      (async () => {
        try {
          const res = await apiGet<FinanceLaborRatioResp>(`/api/admin/finance/labor-ratio?${baseQs.toString()}`);
          if (gen === loadGenRef.current) setFinanceRatio(res || null);
        } catch (e: any) {
          errors.push(`Management P&L: ${String(e?.message || e)}`);
          if (gen === loadGenRef.current) setFinanceRatio(null);
        }
      })(),
      (async () => {
        try {
          const plQs = new URLSearchParams(baseQs);
          if (plStoreName.trim()) plQs.set("store_name", plStoreName.trim());
          const res = await apiGet<PlVsTargetResp>(`/api/admin/finance/pl-vs-target?${plQs.toString()}`);
          if (gen === loadGenRef.current) setPlVsTarget(res || null);
        } catch {
          if (gen === loadGenRef.current) setPlVsTarget(null);
        }
      })(),
      (async () => {
        try {
          const beQs = new URLSearchParams(baseQs);
          if (plStoreName.trim()) beQs.set("store_name", plStoreName.trim());
          const res = await apiGet<BreakEvenResp>(`/api/admin/finance/break-even?${beQs.toString()}`);
          if (gen === loadGenRef.current) setBreakEven(res || null);
        } catch (e: any) {
          errors.push(`Break-even: ${String(e?.message || e)}`);
          if (gen === loadGenRef.current) setBreakEven(null);
        }
      })(),
    ]);

    if (gen === loadGenRef.current) {
      setLoadErrors(errors);
      setLoading(false);
    }
  };

  async function syncPlFromGoogle() {
    if (!approverName.trim() || !financeStepUpReady) return;
    setPlSyncing(true);
    setPlSyncMessage("");
    try {
      const res = await apiPost<{ ok?: boolean; results?: Array<{ city?: string; months_synced?: number; months?: Array<{ month_key?: string; line_count?: number }> }> }>(
        "/api/admin/pl/sync/from-google",
        { approver_name: approverName.trim(), pin: pin.trim(), city }
      );
      const cityResult = (res?.results || [])[0];
      const monthItems = Array.isArray(cityResult?.months) ? cityResult!.months : [];
      const monthsSynced = Number(cityResult?.months_synced || monthItems.length || 0);
      const monthKeys = monthItems.map((m) => String(m?.month_key || "").trim()).filter(Boolean);
      const monthLabel = monthKeys.length ? `${monthKeys[0]} - ${monthKeys[monthKeys.length - 1]}` : "months";
      setPlSyncMessage(`Synced ${monthsSynced} month tabs (${monthLabel}). Refreshing...`);
      await loadData();
      setPlSyncMessage(`Synced ${monthsSynced} month tabs (${monthLabel}). Updated.`);
    } catch (e: any) {
      setPlSyncMessage(String(e?.message || e || "P&L sync failed"));
    } finally {
      setPlSyncing(false);
    }
  }

  async function syncPayrollNow() {
    if (!approverName.trim() || !financeStepUpReady) return;
    setPayrollSyncing(true);
    setPayrollSyncMessage("");
    try {
      const res = await apiPost<{ ok?: boolean; duplicate?: boolean; message?: string; resolved_folder_url?: string }>(
        "/api/admin/payroll/drive/sync",
        { approver_name: approverName.trim(), pin: pin.trim(), city }
      );
      const msg = String(res?.message || "").trim();
      const folderNote = res?.resolved_folder_url ? ` (${res.resolved_folder_url})` : "";
      setPayrollSyncMessage(msg || (res?.duplicate ? "Already imported." : "Sync completed.") + folderNote);
      await loadData();
    } catch (e: any) {
      setPayrollSyncMessage(String(e?.message || e || "Payroll sync failed"));
    } finally {
      setPayrollSyncing(false);
    }
  }

  // Auto-load when step-up is ready
  useEffect(() => {
    if (!financeStepUpReady || !approverName.trim()) return;
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [financeStepUpReady, city, summaryDateFrom, summaryDateTo, plStoreName]);

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">
        <Spinner size="lg" />
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-neutral-950 px-4 pb-20 pt-6 text-white">
      <div className="mx-auto max-w-7xl">

        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <Link href="/admin/analytics" className="text-xs text-neutral-400 hover:text-white transition-colors">
            ← Analytics
          </Link>
          <span className="text-neutral-700">/</span>
          <h1 className="text-xl font-bold text-white">Management P&amp;L</h1>
          <span className="ml-2 rounded-full border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-violet-300">HQ Only</span>
        </div>

        {/* Security verification */}
        {!financeStepUpReady && (
          <div className="mb-6 rounded-2xl border border-amber-800/50 bg-amber-950/20 p-5">
            <div className="mb-3 font-semibold text-amber-100">Verify your identity to access Management P&amp;L</div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void runPasskeyStepUp()}
                disabled={securityBusy}
                className="rounded-xl border border-violet-500/60 bg-violet-500/15 px-4 py-2 text-sm font-semibold text-violet-200 transition hover:bg-violet-500/25 disabled:opacity-60"
              >
                {securityBusy ? <span className="inline-flex items-center gap-1"><Spinner size="sm" /> Verifying…</span> : "Verify With Passkey"}
              </button>
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  placeholder="Session PIN"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="w-36 rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
                />
                <button
                  type="button"
                  onClick={() => void runPinStepUp()}
                  disabled={securityBusy || !pin.trim()}
                  className="rounded-xl border border-neutral-600 bg-neutral-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-60"
                >
                  Verify With PIN
                </button>
              </div>
            </div>
            {securityError && <p className="mt-2 text-sm text-rose-300">{securityError}</p>}
            {securityMessage && <p className="mt-2 text-sm text-emerald-300">{securityMessage}</p>}
          </div>
        )}

        {/* Verified badge */}
        {financeStepUpReady && (
          <div className="mb-4 flex items-center gap-2">
            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
              ✓ Identity verified
            </span>
            <button
              type="button"
              onClick={() => { clearStepUpAuth(); setStepUpVerifiedThisVisit(false); setSecurityMessage(""); }}
              className="text-xs text-neutral-500 hover:text-white transition-colors"
            >
              Revoke
            </button>
          </div>
        )}

        {/* Controls */}
        <div className={`mb-4 ${GLASS_CARD} p-5`}>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1 text-sm font-semibold">Management P&amp;L (Target-based)</div>
            <div className="w-full sm:w-auto">
              <div className="mb-1 text-xs text-neutral-400">City</div>
              <select value={city} onChange={(e) => setCity(e.target.value)} className={`${SELECT_CLASS} min-w-[180px]`}>
                <option value="dubai">Dubai</option>
                <option value="manila">Manila</option>
              </select>
            </div>
            <div className="w-full sm:w-auto">
              <div className="mb-1 text-xs text-neutral-400">Approver Name</div>
              <input
                type="text"
                value={approverName}
                onChange={(e) => setApproverName(e.target.value)}
                className={`${INPUT_CLASS} min-w-[180px]`}
                placeholder="Your name"
              />
            </div>
            <div className="grid w-full gap-2 sm:w-auto sm:min-w-[360px]">
              <label className="text-xs text-neutral-400">
                Summary Range
                <DateRangePicker value={{ from: summaryDateFrom, to: summaryDateTo }} onChange={(range) => { setSummaryDateFrom(range.from); setSummaryDateTo(range.to); }} className="mt-1" />
              </label>
              <label className="text-xs text-neutral-400">
                Month Quick Select
                <MonthPicker value={summaryMonthKey} onChange={handleSummaryMonthChange} className="mt-1" />
              </label>
              <label className="text-xs text-neutral-400">
                Store scope (P&amp;L)
                <select value={plStoreName} onChange={(e) => setPlStoreName(e.target.value)} className={`mt-1 ${SELECT_CLASS}`}>
                  <option value="">Company total</option>
                  {plStoreOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </label>
            </div>
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={loading || !approverName.trim() || !financeStepUpReady}
              className={`ml-auto ${PRIMARY_BUTTON}`}
            >
              {loading ? <span className="inline-flex items-center gap-2"><Spinner size="sm" /> Loading...</span> : "Refresh P&L"}
            </button>
          </div>
          <div className="mt-3 text-xs text-neutral-500">
            Top KPI cards prioritize imported <span className="text-neutral-300">P&amp;L revenue / opex / profit</span> when available. POS metrics remain for operations. HQ only.
          </div>

          {/* Section navigation */}
          <div className={`mt-4 ${TAB_CONTAINER}`}>
            <div className="flex flex-wrap gap-1">
              {(["all", ...FINANCE_SECTION_OPTIONS.map(s => s.value)] as const).map((v) => (
                <button key={v} type="button" onClick={() => setFinanceSectionView(v === "all" ? "all" : v)}
                  aria-pressed={financeSectionView === v}
                  className={financeSectionView === v ? TAB_ACTIVE : TAB_INACTIVE}
                >
                  {v === "all" ? "All" : FINANCE_SECTION_OPTIONS.find(s => s.value === v)?.label ?? v}
                </button>
              ))}
            </div>
          </div>

          {/* Sync from Google */}
          <div className="mt-3 flex flex-wrap items-start gap-4 border-t border-neutral-800 pt-3">
            <div className="min-w-[240px] flex-1 text-xs text-neutral-400">
              <span className="font-semibold text-neutral-300">Sync monthly P&amp;L (Google)</span>
              <p className="mt-1 max-w-xl leading-relaxed">Reads all month tabs from the PL Google Sheet for the selected city and upserts them to the app DB.</p>
              <button type="button" onClick={() => void syncPlFromGoogle()} disabled={plSyncing || !approverName.trim() || !financeStepUpReady}
                className={`mt-2 ${SECONDARY_BUTTON} text-xs py-2 px-3`}>
                {plSyncing ? "Syncing..." : "Sync P&L from Google"}
              </button>
              {plSyncMessage && <span className="mt-1 block text-xs text-amber-200/90">{plSyncMessage}</span>}
            </div>
          </div>
        </div>

        {/* Load errors */}
        {loadErrors.length > 0 && (
          <div className="mb-4 rounded-2xl border border-rose-800/50 bg-rose-950/20 p-3 text-xs text-rose-200">
            {loadErrors.map((e, i) => <div key={i}>{e}</div>)}
          </div>
        )}

        {/* Content — locked state */}
        {!financeStepUpReady ? (
          <div className="mt-4 rounded-2xl border border-amber-800/50 bg-amber-950/20 p-5 text-sm text-amber-100">
            <div className="font-semibold">Management P&amp;L is locked</div>
            <div className="mt-1 text-xs text-amber-100/90">This page requires recent MFA verification. Use passkey or PIN above.</div>
          </div>
        ) : (
          <div className="space-y-4">

            {/* ── Summary ── */}
            {(financeSectionView === "all" || financeSectionView === "summary") && (
              <div id="finance-summary">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                  <div className={`flex min-h-[120px] flex-col ${KPI_CARD}`}>
                    <div className="min-h-[32px] text-xs leading-4 text-neutral-500">Revenue (P&amp;L imported)</div>
                    <MetricValue className={NUMERIC_FINANCE_KPI_VALUE} value={plHeadline ? plHeadline.revenue : isStoreScopedView ? "—" : Number(financeRatio?.sales_total ?? 0)} />
                    {plHeadline && plHeadline.revenue > 0 && <div className="mt-1 text-[10px] text-neutral-500">100% of revenue</div>}
                  </div>
                  <div className={`flex min-h-[120px] flex-col ${KPI_CARD}`}>
                    <div className="min-h-[32px] text-xs leading-4 text-neutral-500">Opex (P&amp;L rollup)</div>
                    <MetricValue className={NUMERIC_FINANCE_KPI_VALUE} value={plHeadline ? plHeadline.opex : isStoreScopedView ? "—" : financeBreakdown ? financeBreakdown.totalModeledCost : "—"} />
                    {plHeadline && plHeadline.revenue > 0 && <div className="mt-1 text-[10px] text-neutral-500">{formatPct((plHeadline.opex / plHeadline.revenue) * 100)} of revenue</div>}
                  </div>
                  <div className={`flex min-h-[120px] flex-col ${KPI_CARD}`}>
                    <div className="min-h-[32px] text-xs leading-4 text-neutral-500">Operating profit (P&amp;L)</div>
                    <MetricValue
                      className={plHeadline ? (plHeadline.profit >= 0 ? `${NUMERIC_FINANCE_KPI_VALUE} text-emerald-400` : `${NUMERIC_FINANCE_KPI_VALUE} text-rose-400`) : NUMERIC_FINANCE_KPI_VALUE}
                      value={plHeadline ? plHeadline.profit : isStoreScopedView ? "—" : Number(financeRatio?.estimated_profit_using_targets ?? 0)}
                    />
                    {plHeadline && plHeadline.revenue > 0 && <div className="mt-1 text-[10px] text-neutral-500">{formatPct((plHeadline.profit / plHeadline.revenue) * 100)} margin</div>}
                  </div>
                  <div className={`flex min-h-[120px] flex-col ${KPI_CARD}`}>
                    <div className="min-h-[32px] text-xs leading-4 text-neutral-500">FLR cost total</div>
                    <MetricValue className={NUMERIC_FINANCE_KPI_VALUE} value={plHeadline ? plHeadline.flrCost : "—"} />
                    {plHeadline && plHeadline.revenue > 0 && <div className="mt-1 text-[10px] text-neutral-500">{formatPct((plHeadline.flrCost / plHeadline.revenue) * 100)} of revenue</div>}
                  </div>
                  <div className={`flex min-h-[120px] flex-col ${KPI_CARD}`}>
                    <div className="min-h-[32px] text-xs leading-4 text-neutral-500">Other expenses total</div>
                    <MetricValue className={NUMERIC_FINANCE_KPI_VALUE} value={plHeadline ? plHeadline.otherExpenses : "—"} />
                    {plHeadline && plHeadline.revenue > 0 && <div className="mt-1 text-[10px] text-neutral-500">{formatPct((plHeadline.otherExpenses / plHeadline.revenue) * 100)} of revenue</div>}
                  </div>
                  <div className={`flex min-h-[120px] flex-col ${KPI_CARD}`}>
                    <div className="min-h-[32px] text-xs leading-4 text-neutral-500">Labor ratio (P&amp;L labor ÷ revenue)</div>
                    <div className={NUMERIC_FINANCE_KPI_VALUE}>
                      {plHeadline ? formatPct(plHeadline.laborRatioPct) : isStoreScopedView ? "—" : formatPct(Number(financeRatio?.labor_ratio || 0) * 100)}
                    </div>
                  </div>
                </div>
                {plHeadline && plHeadline.revenue > 0 && (() => {
                  const rev = plHeadline.revenue;
                  const food = Number(plVsTarget?.rollup?.food ?? 0);
                  const labor = Number(plVsTarget?.rollup?.labor_pl ?? 0);
                  const rent = Number(plVsTarget?.rollup?.rent ?? 0);
                  const other = Number(plVsTarget?.rollup?.other ?? 0);
                  const profit = plHeadline.profit;
                  const segments = [
                    { label: "Food", value: food, color: "bg-amber-600" },
                    { label: "Labor", value: labor, color: "bg-blue-600" },
                    { label: "Rent", value: rent, color: "bg-violet-600" },
                    { label: "Other", value: other, color: "bg-neutral-600" },
                    { label: profit >= 0 ? "Profit" : "Loss", value: Math.abs(profit), color: profit >= 0 ? "bg-emerald-600" : "bg-rose-700" },
                  ].filter(s => s.value > 0);
                  return (
                    <div className="mt-3">
                      <div className="mb-1 text-[10px] text-neutral-500">Revenue breakdown</div>
                      <div className="flex h-7 w-full overflow-hidden rounded-xl">
                        {segments.map(seg => {
                          const pct = (seg.value / rev) * 100;
                          return (
                            <div key={seg.label} className={`${seg.color} flex items-center justify-center overflow-hidden text-[10px] font-medium text-white`} style={{ width: `${pct}%` }} title={`${seg.label}: ${formatMoney(seg.value)} (${pct.toFixed(1)}%)`}>
                              {pct > 8 ? `${pct.toFixed(0)}%` : ""}
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-neutral-400">
                        {segments.map(seg => (
                          <span key={seg.label} className="flex items-center gap-1">
                            <span className={`inline-block h-2 w-2 rounded-sm ${seg.color}`} />
                            {seg.label} {((seg.value / rev) * 100).toFixed(1)}%
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── Break-even ── */}
            {(financeSectionView === "all" || financeSectionView === "breakEven") && (
              <div id="finance-break-even" className="rounded-2xl border border-emerald-900/40 bg-emerald-950/10 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-sm font-semibold text-emerald-100">Break-even guidance</div>
                  {breakEven?.basis && (
                    <div className="text-[11px] text-neutral-500">
                      Basis: {formatBreakEvenBasis(breakEven.basis.mode)}
                      {breakEven.basis.mode === "previous_month_fallback" ? " (auto fallback)" : ""}
                      {breakEven.basis.month_key && <span className="text-neutral-500"> · Month {breakEven.basis.month_key}</span>}
                    </div>
                  )}
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  {breakEven?.basis?.mode === "imported_pl_month"
                    ? "Reflects one full calendar month from the synced Management P&L."
                    : "Uses rolling 30 days when all required data is available; otherwise falls back to the previous full month."}
                </div>
                {breakEven?.basis && (
                  <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-neutral-400 md:grid-cols-3">
                    <div>Range: <span className="text-neutral-200">{breakEven.basis.date_from} to {breakEven.basis.date_to}</span></div>
                    <div>
                      {breakEven.basis.mode === "imported_pl_month"
                        ? <>Days in period: <span className="text-neutral-200">{formatCount(Number(breakEven.completeness?.pos_days_expected || 0))} calendar days</span></>
                        : <>POS coverage: <span className="text-neutral-200">{formatCount(Number(breakEven.completeness?.pos_days_present || 0))}/{formatCount(Number(breakEven.completeness?.pos_days_expected || 0))} days</span></>}
                    </div>
                    <div>P&amp;L months: <span className="text-neutral-200">{formatCount(Number(breakEven.completeness?.pl_months_present?.length || 0))}/{formatCount(Number(breakEven.completeness?.pl_months_expected?.length || 0))}</span></div>
                  </div>
                )}
                {breakEven?.basis?.fallback_reason && (
                  <div className="mt-2 rounded-xl border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-100">
                    {formatBreakEvenFallbackReason(breakEven.basis.fallback_reason)}
                    {(breakEven.completeness?.rolling_reasons || []).length > 0 && (
                      <div className="mt-2 space-y-1 text-[11px] text-amber-100/90">
                        <div className="font-semibold text-amber-50">Prior window was missing:</div>
                        {(breakEven.completeness?.rolling_reasons || []).map((r) => <div key={`rolling-${r}`}>- {formatBreakEvenReasonLabel(r)}</div>)}
                        {(breakEven.completeness?.rolling_missing_pl_months || []).length > 0 && <div>Missing P&amp;L months: {formatBreakEvenMissingDates(breakEven.completeness?.rolling_missing_pl_months)}</div>}
                        {(breakEven.completeness?.rolling_missing_pos_dates || []).length > 0 && <div>Missing POS dates: {formatBreakEvenMissingDates(breakEven.completeness?.rolling_missing_pos_dates)}</div>}
                      </div>
                    )}
                  </div>
                )}
                {(breakEven?.completeness?.selected_reasons || []).length > 0 && (
                  <div className="mt-2 rounded-xl border border-rose-900/40 bg-rose-950/20 px-3 py-2 text-xs text-rose-100">
                    <div className="font-semibold text-rose-50">
                      {breakEven.basis?.mode === "imported_pl_month" ? "Imported P&L month is incomplete:"
                        : breakEven.basis?.mode === "previous_month_fallback" ? "Fallback month is still missing:"
                        : "Current window is still missing:"}
                    </div>
                    <div className="mt-2 space-y-1 text-[11px] text-rose-100/90">
                      {(breakEven.completeness?.selected_reasons || []).map((r) => <div key={`sel-${r}`}>- {formatBreakEvenReasonLabel(r)}</div>)}
                      {(breakEven.completeness?.missing_pl_months || []).length > 0 && <div>Missing P&amp;L months: {formatBreakEvenMissingDates(breakEven.completeness?.missing_pl_months)}</div>}
                    </div>
                  </div>
                )}
                {breakEven?.ok && breakEven.summary ? (
                  <>
                    <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                      {[
                        { label: "Break-even sales / day", value: breakEven.summary.break_even_sales_per_day != null ? formatMoney(Number(breakEven.summary.break_even_sales_per_day || 0)) : "—" },
                        { label: "Break-even orders / day", value: breakEven.summary.break_even_orders_per_day != null ? formatDecimal(Number(breakEven.summary.break_even_orders_per_day || 0), 1) : "—" },
                        { label: "Safety margin", value: breakEven.summary.margin_of_safety_pct != null ? formatPct(Number(breakEven.summary.margin_of_safety_pct || 0) * 100) : "—" },
                        { label: "Days to break-even", value: formatBreakEvenDays(breakEven.summary.days_to_break_even) },
                      ].map(({ label, value }) => (
                        <div key={label} className={KPI_CARD}>
                          <div className="min-h-[32px] text-xs leading-4 text-neutral-500">{label}</div>
                          <div className={NUMERIC_BLOCK_VALUE}>{value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
                      {[
                        { label: "Average sales / order", value: breakEven.summary.avg_sales_per_order != null ? formatMoney(Number(breakEven.summary.avg_sales_per_order || 0)) : "—" },
                        { label: "Operating profit / order", value: breakEven.summary.profit_per_order != null ? formatMoney(Number(breakEven.summary.profit_per_order || 0)) : "—" },
                        { label: "Contribution margin %", value: breakEven.summary.contribution_margin_ratio != null ? formatPct(Number(breakEven.summary.contribution_margin_ratio || 0) * 100) : "—" },
                        { label: "Orders in period", value: formatCount(Number(breakEven.summary.orders || 0)) },
                      ].map(({ label, value }) => (
                        <div key={label} className={KPI_CARD}>
                          <div className="min-h-[32px] text-xs leading-4 text-neutral-500">{label}</div>
                          <div className={NUMERIC_SMALL_BLOCK_VALUE}>{value}</div>
                        </div>
                      ))}
                    </div>
                    {breakEven.summary.margin_of_safety_pct != null && (() => {
                      const pct = Number(breakEven.summary.margin_of_safety_pct) * 100;
                      const isAbove = pct >= 0;
                      const fillPct = Math.min(Math.abs(pct), 100);
                      return (
                        <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                          <div className="mb-2 flex items-center justify-between">
                            <div className="text-xs font-medium text-neutral-300">Safety margin gauge</div>
                            <div className={`text-sm font-bold ${isAbove ? "text-emerald-400" : "text-rose-400"}`}>{isAbove ? "+" : ""}{formatPct(pct)}</div>
                          </div>
                          <div className="relative h-4 w-full overflow-hidden rounded-full bg-neutral-800">
                            <div className={`h-full rounded-full transition-all ${isAbove ? "bg-emerald-600" : "bg-rose-600"}`} style={{ width: `${fillPct}%` }} />
                          </div>
                          <div className="mt-1 flex justify-between text-[10px] text-neutral-500">
                            <span>0 (break-even)</span>
                            <span>{isAbove ? "Above break-even ✓" : "Below break-even ✗"}</span>
                          </div>
                        </div>
                      );
                    })()}
                    {(() => {
                      const s = breakEven.summary;
                      const sales = Number(s.sales || 0);
                      if (sales <= 0) return null;
                      const foodPct = (Number(s.food_cost || 0) / sales) * 100;
                      const laborPct = (Number(s.labor_cost || 0) / sales) * 100;
                      const rentPct = (Number(s.rent_cost || 0) / sales) * 100;
                      const otherPct = (Number(s.other_cost || 0) / sales) * 100;
                      const flrPct = foodPct + laborPct + rentPct;
                      type FlrZone = "green" | "normal" | "yellow" | "red";
                      const getZone = (metric: string, v: number): FlrZone => {
                        if (metric === "F") return v <= 36 ? "green" : v <= 39 ? "normal" : v <= 42 ? "yellow" : "red";
                        if (metric === "L") return v <= 22 ? "green" : v <= 24 ? "normal" : v <= 26 ? "yellow" : "red";
                        if (metric === "R") return v <= 7 ? "green" : v <= 9 ? "normal" : v <= 12 ? "yellow" : "red";
                        return v <= 62 ? "green" : v <= 66 ? "normal" : v <= 70 ? "yellow" : "red";
                      };
                      const ZONE_META: Record<FlrZone, { badge: string; text: string; label: string }> = {
                        green:  { badge: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30", text: "text-emerald-400", label: "Good" },
                        normal: { badge: "bg-sky-500/15 text-sky-300 border border-sky-500/30",             text: "text-sky-400",    label: "Normal" },
                        yellow: { badge: "bg-amber-500/15 text-amber-300 border border-amber-500/30",       text: "text-amber-400",  label: "Caution" },
                        red:    { badge: "bg-rose-500/15 text-rose-300 border border-rose-500/30",           text: "text-rose-400",   label: "High" },
                      };
                      const METRIC_CONFIG = [
                        { key: "F",   label: "Food",      sublabel: "Food Cost",  value: foodPct,  maxVal: 55, segs: [{ c: "bg-emerald-700", w: 36 }, { c: "bg-sky-700", w: 3 }, { c: "bg-amber-700", w: 3 }, { c: "bg-rose-700", w: 13 }] },
                        { key: "L",   label: "Labor",     sublabel: "Labor Cost", value: laborPct, maxVal: 35, segs: [{ c: "bg-emerald-700", w: 22 }, { c: "bg-sky-700", w: 2 }, { c: "bg-amber-700", w: 2 }, { c: "bg-rose-700", w: 9  }] },
                        { key: "R",   label: "Rent",      sublabel: "Rent Cost",  value: rentPct,  maxVal: 18, segs: [{ c: "bg-emerald-700", w: 7  }, { c: "bg-sky-700", w: 2 }, { c: "bg-amber-700", w: 3 }, { c: "bg-rose-700", w: 6  }] },
                        { key: "FLR", label: "FLR Total", sublabel: "FLR Total",  value: flrPct,   maxVal: 85, segs: [{ c: "bg-emerald-700", w: 62 }, { c: "bg-sky-700", w: 4 }, { c: "bg-amber-700", w: 4 }, { c: "bg-rose-700", w: 15 }] },
                      ];
                      return (
                        <div className="mt-4">
                          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">FLR Cost Ratios</div>
                          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                            {METRIC_CONFIG.map(({ key, label, sublabel, value, maxVal, segs }) => {
                              const zone = getZone(key, value);
                              const meta = ZONE_META[zone];
                              const cursorPos = Math.min((value / maxVal) * 100, 100);
                              return (
                                <div key={key} className={KPI_CARD}>
                                  <div className="mb-1 flex items-center justify-between">
                                    <div className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">{label}</div>
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.badge}`}>{meta.label}</span>
                                  </div>
                                  <div className={`text-2xl font-bold tabular-nums ${meta.text}`}>{value.toFixed(1)}%</div>
                                  <div className="text-[10px] text-neutral-600">{sublabel}</div>
                                  <div className="relative mt-3">
                                    <div className="flex h-2 w-full overflow-hidden rounded-full">
                                      {segs.map((seg, i) => <div key={i} className={seg.c} style={{ width: `${(seg.w / maxVal) * 100}%` }} />)}
                                    </div>
                                    <div className="absolute -top-0.5 h-3 w-0.5 rounded-full bg-white shadow" style={{ left: `${cursorPos}%`, transform: "translateX(-50%)" }} />
                                  </div>
                                  <div className="mt-1.5 flex justify-between text-[9px] text-neutral-600"><span>0%</span><span>{maxVal}%+</span></div>
                                </div>
                              );
                            })}
                          </div>
                          {otherPct > 0 && <div className="mt-2 text-[11px] text-neutral-500">Other expenses: <span className="text-neutral-400">{otherPct.toFixed(1)}%</span> of sales.</div>}
                        </div>
                      );
                    })()}
                    {breakEven.scope === "company" && (breakEven.stores || []).length > 0 && (
                      <div className="mt-4 overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-950/30">
                        <table className="min-w-full text-left text-sm">
                          <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                            <tr>
                              {["Store","Sales","Orders","Avg sales/order","Operating profit","Profit/order","BE sales/day","BE orders/day","Safety margin %","Days to BE","Basis"].map(h => (
                                <th key={h} className={TABLE_HEADER + " px-3 py-3 text-left"}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(breakEven.stores || []).map((row) => (
                              <tr key={row.store_name} className={TABLE_ROW}>
                                <td className={TABLE_CELL + " px-3"}>{row.store_name}</td>
                                <td className={TABLE_CELL + " px-3 tabular-nums"}>{formatMoney(Number(row.sales || 0))}</td>
                                <td className={TABLE_CELL + " px-3 tabular-nums"}>{formatCount(Number(row.orders || 0))}</td>
                                <td className={TABLE_CELL + " px-3 tabular-nums"}>{row.avg_sales_per_order != null ? formatMoney(Number(row.avg_sales_per_order || 0)) : "—"}</td>
                                <td className={TABLE_CELL + " px-3 tabular-nums"}>{formatMoney(Number(row.operating_profit || 0))}</td>
                                <td className={TABLE_CELL + " px-3 tabular-nums"}>{row.profit_per_order != null ? formatMoney(Number(row.profit_per_order || 0)) : "—"}</td>
                                <td className={TABLE_CELL + " px-3 tabular-nums"}>{row.break_even_sales_per_day != null ? formatMoney(Number(row.break_even_sales_per_day || 0)) : "—"}</td>
                                <td className={TABLE_CELL + " px-3 tabular-nums"}>{row.break_even_orders_per_day != null ? formatDecimal(Number(row.break_even_orders_per_day || 0), 1) : "—"}</td>
                                <td className={TABLE_CELL + " px-3 tabular-nums"}>{row.margin_of_safety_pct != null ? formatPct(Number(row.margin_of_safety_pct || 0) * 100) : "—"}</td>
                                <td className={TABLE_CELL + " px-3 tabular-nums"}>{formatBreakEvenDays(row.days_to_break_even)}</td>
                                <td className={TABLE_CELL + " px-3"}>{formatBreakEvenBasis(row.basis_mode)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {breakEven.scope === "company" && (breakEven.stores || []).length > 1 && (() => {
                      const chartData = (breakEven.stores || []).map(s => ({ name: s.store_name, margin: s.margin_of_safety_pct != null ? Number(s.margin_of_safety_pct) * 100 : 0 }));
                      return (
                        <div className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                          <div className="mb-2 text-xs font-medium text-neutral-300">Store safety margins (%)</div>
                          <ResponsiveContainer width="100%" height={120}>
                            <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 40, left: 60, bottom: 0 }}>
                              <XAxis type="number" domain={["auto","auto"]} tick={{ fontSize: 10, fill: "#737373" }} tickFormatter={(v) => `${v.toFixed(0)}%`} />
                              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#a3a3a3" }} width={55} />
                              <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                              <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, "Safety margin"]} contentStyle={{ background: "#0a0a0a", border: "1px solid #262626", borderRadius: 8 }} />
                              <Bar dataKey="margin" radius={[0, 4, 4, 0]}>
                                {chartData.map((entry, i) => <Cell key={i} fill={entry.margin >= 0 ? "#059669" : "#e11d48"} />)}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-3 text-sm text-neutral-300">
                    {breakEven?.detail || "Break-even data will appear after the next refresh."}
                  </div>
                )}
              </div>
            )}

            {/* ── P&L Details ── */}
            {(financeSectionView === "all" || financeSectionView === "plDetails") && (
              plVsTarget?.ok ? (
                <div id="finance-pl-details" className="rounded-2xl border border-violet-900/40 bg-violet-950/10 p-4 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="font-semibold text-violet-100">
                      Imported P&amp;L vs target lines ({plVsTarget.month_key}{plVsTarget.scope === "store" && plVsTarget.store_name ? ` · ${plVsTarget.store_name}` : ""})
                    </div>
                    {plVsTarget.pl_import?.sheet_name && (
                      <div className="text-[11px] text-neutral-500">Sheet: {plVsTarget.pl_import.sheet_name}{plVsTarget.pl_import.imported_at ? ` · ${plVsTarget.pl_import.imported_at}` : ""}</div>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-neutral-400">Target amounts use analysis sales basis. Food / rent / other actuals are rolled up from imported P&amp;L labels.</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-neutral-500 md:grid-cols-4">
                    <div>Analysis sales: <span className="font-mono text-neutral-200">{formatMoney(Number(plVsTarget.analysis_sales ?? plVsTarget.revenue_pl ?? 0))}</span></div>
                    <div>Revenue (P&amp;L): <span className="font-mono text-neutral-200">{formatMoney(Number(plVsTarget.revenue_pl || 0))}</span></div>
                    <div>POS reference: <span className="font-mono text-neutral-200">{formatMoney(Number(plVsTarget.net_sales_pos || 0))}</span></div>
                    <div>Rollup check (|residual|): <span className={(plVsTarget.checks?.rollup_residual_abs ?? 0) <= 1 ? "text-emerald-400" : "text-amber-400"}>{plVsTarget.rollup?.rollup_residual != null ? Math.abs(plVsTarget.rollup.rollup_residual).toFixed(4) : "—"}</span></div>
                  </div>
                  {plVsTarget.ok && (() => {
                    const rev = Number(plVsTarget.analysis_sales ?? plVsTarget.revenue_pl ?? 0);
                    if (rev <= 0) return null;
                    const bkts = plVsTarget.buckets;
                    const chartData = [
                      { name: "Food",  actual: bkts?.food  ? Number(bkts.food.actual_pct_of_net_sales_pos)  : 0, target: bkts?.food  ? Number(bkts.food.target_pct) * 100  : 0 },
                      { name: "Labor", actual: laborDisplay ? laborDisplay.actualPct : 0, target: laborDisplay ? laborDisplay.targetPct : 0 },
                      { name: "Rent",  actual: bkts?.rent  ? Number(bkts.rent.actual_pct_of_net_sales_pos)  : 0, target: bkts?.rent  ? Number(bkts.rent.target_pct) * 100  : 0 },
                      { name: "Other", actual: bkts?.other ? Number(bkts.other.actual_pct_of_net_sales_pos) : 0, target: bkts?.other ? Number(bkts.other.target_pct) * 100 : 0 },
                    ];
                    return (
                      <div className={`mb-3 ${GLASS_CARD} p-3`}>
                        <div className="mb-1 text-[10px] text-neutral-500">Cost buckets: Actual vs Target (% of revenue)</div>
                        <ResponsiveContainer width="100%" height={110}>
                          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#a3a3a3" }} />
                            <YAxis tick={{ fontSize: 10, fill: "#737373" }} tickFormatter={(v) => `${v.toFixed(0)}%`} />
                            <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} contentStyle={{ background: "#0a0a0a", border: "1px solid #262626", borderRadius: 8 }} />
                            <Bar dataKey="target" name="Target" fill="#525252" radius={[2,2,0,0]} barSize={14} />
                            <Bar dataKey="actual" name="Actual" radius={[2,2,0,0]} barSize={14}>
                              {chartData.map((entry, i) => <Cell key={i} fill={entry.actual <= entry.target ? "#059669" : "#e11d48"} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    );
                  })()}
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[720px] border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-violet-900/50 text-neutral-500">
                          {["Bucket","Target %","Target amt","Actual (import)","Actual % / analysis sales","Δ vs target $","Δ vs target pp","Progress vs target"].map(h => (
                            <th key={h} className="py-2 pr-2">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="text-neutral-200">
                        {(["food", "rent", "other"] as const).map((k) => {
                          const b = plVsTarget.buckets![k];
                          return (
                            <tr key={k} className="border-b border-neutral-800/80">
                              <td className="py-2 pr-2 capitalize">{k}</td>
                              <td className="py-2 pr-2">{formatPct(b.target_pct * 100)}</td>
                              <td className="py-2 pr-2 font-mono">{formatMoney(b.target_amount)}</td>
                              <td className="py-2 pr-2 font-mono">{formatMoney(b.actual_amount)}</td>
                              <td className="py-2 pr-2">{formatPct(b.actual_pct_of_net_sales_pos)}</td>
                              <td className="py-2 pr-2 font-mono">{formatMoney(b.variance_amount)}</td>
                              <td className="py-2 pr-2">{b.variance_pct_points.toFixed(2)}</td>
                              <td className="py-2 pl-2">
                                <div className="relative h-3 w-32 overflow-hidden rounded-full bg-neutral-800">
                                  <div className={`h-full rounded-full ${b.actual_pct_of_net_sales_pos <= b.target_pct * 100 ? "bg-emerald-600" : "bg-rose-600"}`} style={{ width: `${Math.min((b.actual_pct_of_net_sales_pos / Math.max(b.target_pct * 100, 0.01)) * 100, 150)}%`, maxWidth: "100%" }} />
                                  <div className="absolute left-[66.6%] top-0 h-full w-px bg-white/20" />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="border-b border-neutral-800/80 bg-violet-950/20">
                          <td className="py-2 pr-2">Labor</td>
                          <td className="py-2 pr-2">{formatPct(laborDisplay?.targetPct ?? 0)}</td>
                          <td className="py-2 pr-2 font-mono">{formatMoney(laborDisplay?.targetAmount ?? 0)}</td>
                          <td className="py-2 pr-2">
                            {laborDisplay?.usePlOnly
                              ? <div className="font-mono">P&amp;L lines {formatMoney(laborDisplay.plAmount)}</div>
                              : <><div className="font-mono">Payroll {formatMoney(laborDisplay?.payrollAmount ?? 0)}</div><div className="text-[10px] text-neutral-500">P&amp;L lines {formatMoney(laborDisplay?.plAmount ?? 0)}</div></>
                            }
                          </td>
                          <td className="py-2 pr-2">
                            {laborDisplay?.usePlOnly
                              ? <div>{formatPct(laborDisplay.actualPct)} P&amp;L</div>
                              : <><div>{formatPct(laborDisplay?.actualPct ?? 0)} payroll</div><div className="text-[10px] text-neutral-500">{formatPct(plVsTarget.buckets!.labor.actual_pct_of_net_sales_pos_pl)} P&amp;L</div></>
                            }
                          </td>
                          <td className="py-2 pr-2 font-mono">{formatMoney(laborDisplay?.varianceAmount ?? 0)}</td>
                          <td className="py-2 pr-2 text-[10px] text-neutral-400">{laborDisplay?.usePlOnly ? "Store scope uses P&L labor lines" : `PL vs payroll Δ ${formatMoney(laborDisplay?.variancePlVsPayroll ?? 0)}`}</td>
                          <td className="py-2 pl-2">
                            {laborDisplay && laborDisplay.targetPct > 0 && (
                              <div className="relative h-3 w-32 overflow-hidden rounded-full bg-neutral-800">
                                <div className={`h-full rounded-full ${laborDisplay.actualPct <= laborDisplay.targetPct ? "bg-emerald-600" : "bg-rose-600"}`} style={{ width: `${Math.min((laborDisplay.actualPct / Math.max(laborDisplay.targetPct, 0.01)) * 100, 150)}%`, maxWidth: "100%" }} />
                                <div className="absolute left-[66.6%] top-0 h-full w-px bg-white/20" />
                              </div>
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {plVsTarget.checks?.note && <p className="mt-2 text-[11px] text-neutral-500">{plVsTarget.checks.note}</p>}
                </div>
              ) : plVsTarget?.missing_store ? (
                <div className="rounded-2xl border border-amber-800/70 bg-amber-950/20 p-4 text-xs text-amber-100/90">
                  <span className="font-medium">Store scope not found.</span> {plVsTarget.detail || "Select another store or re-sync monthly P&L."}
                </div>
              ) : (
                <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4 text-xs text-neutral-500">
                  <span className="font-medium text-neutral-400">Imported P&amp;L vs targets</span> — No row for this city/month. Upload the monthly Excel (or sync from Google), then set Summary From/To to that month and refresh.
                </div>
              )
            )}

            {/* ── Payroll ── */}
            {(financeSectionView === "all" || financeSectionView === "payroll") && (
              <div id="finance-payroll" className="rounded-2xl border border-sky-900/40 bg-sky-950/10 p-4">
                <div className="mb-4 flex flex-wrap items-end gap-3">
                  <div className="min-w-[200px] flex-1 sm:min-w-[240px]">
                    <div className="text-sm font-semibold">Payroll Channel (HQ only)</div>
                    <div className="mt-1 text-xs text-neutral-500">Uses the same Summary From/To as Management P&amp;L.</div>
                  </div>
                  <div className="w-full sm:w-auto sm:min-w-[240px]">
                    <label className="text-xs text-neutral-400">
                      Staff
                      <select value={payrollStaffName} onChange={(e) => setPayrollStaffName(e.target.value)} className={`mt-1 ${SELECT_CLASS}`}>
                        <option value="">All Staff</option>
                        {payrollStaffOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="ml-auto flex gap-2">
                    <button type="button" onClick={() => void loadData()} disabled={loading || !approverName.trim() || !financeStepUpReady} className={PRIMARY_BUTTON}>
                      {loading ? <span className="inline-flex items-center gap-2"><Spinner size="sm" /> Loading...</span> : "Refresh Payroll"}
                    </button>
                    <button type="button" onClick={() => void syncPayrollNow()} disabled={payrollSyncing || !approverName.trim() || !financeStepUpReady} className={SECONDARY_BUTTON}>
                      {payrollSyncing ? "Syncing..." : "Sync Payroll Folder"}
                    </button>
                  </div>
                </div>
                {payrollSyncMessage && <div className="mt-3 rounded-xl border border-neutral-700 bg-neutral-950/40 px-3 py-2 text-xs text-neutral-300">{payrollSyncMessage}</div>}
                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
                  {[
                    { label: "Payroll Total (Net Pay)", value: payrollSummary.totalNetPay },
                    { label: "Basic Salary",            value: payrollSummary.basicSalary },
                    { label: "Accommodation",           value: payrollSummary.accommodation },
                    { label: "Transportation",          value: payrollSummary.transportation },
                    { label: "Staff Rows",              value: payrollSummary.rowCount },
                  ].map(({ label, value }) => (
                    <div key={label} className={KPI_CARD}>
                      <div className="text-xs text-neutral-500">{label}</div>
                      <MetricValue className={NUMERIC_BLOCK_VALUE} value={value} />
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-6">
                  {[
                    { label: "Gross Pay (total)",  value: payrollSummary.grossPay },
                    { label: "Food allowance",     value: payrollSummary.foodAllowance },
                    { label: "Other allowance",    value: payrollSummary.otherAllowance },
                    { label: "Net additions",      value: payrollSummary.netAdditions },
                    { label: "Net deductions",     value: payrollSummary.netDeductions },
                  ].map(({ label, value }) => (
                    <div key={label} className={KPI_CARD}>
                      <div className="text-xs text-neutral-500">{label}</div>
                      <MetricValue className={NUMERIC_SMALL_BLOCK_VALUE} value={value} />
                    </div>
                  ))}
                  <div className={KPI_CARD}>
                    <div className="text-xs text-neutral-500">Arrears + / -</div>
                    <div className="mt-1 text-xl font-bold tabular-nums">{formatMoney(payrollSummary.arrearsAddition - payrollSummary.arrearsDeduction)}</div>
                  </div>
                </div>
                {payrollSummary.grossPay > 0 && (() => {
                  const pieData = [
                    { name: "Basic",     value: payrollSummary.basicSalary,    fill: "#3b82f6" },
                    { name: "Housing",   value: payrollSummary.accommodation,  fill: "#8b5cf6" },
                    { name: "Food",      value: payrollSummary.foodAllowance,  fill: "#f59e0b" },
                    { name: "Transport", value: payrollSummary.transportation, fill: "#10b981" },
                    { name: "Other",     value: payrollSummary.otherAllowance, fill: "#6b7280" },
                  ].filter(d => d.value > 0);
                  const deptMap: Record<string, number> = {};
                  payrollRowsFiltered.forEach(r => { const d = r.department || "Other"; deptMap[d] = (deptMap[d] || 0) + Number(r.total_net_pay || 0); });
                  const deptData = Object.entries(deptMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
                  return (
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className={KPI_CARD}>
                        <div className="mb-2 text-xs font-medium text-neutral-300">Salary composition (gross)</div>
                        <div className="flex items-center gap-4">
                          <PieChart width={120} height={120}>
                            <Pie data={pieData} cx={55} cy={55} innerRadius={30} outerRadius={55} paddingAngle={2} dataKey="value">
                              {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                            </Pie>
                            <Tooltip formatter={(v: number) => formatMoney(v)} contentStyle={{ background: "#0a0a0a", border: "1px solid #262626", borderRadius: 8 }} />
                          </PieChart>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
                            {pieData.map(d => (
                              <div key={d.name} className="flex items-center gap-1 text-neutral-400">
                                <span className="inline-block h-2 w-2 rounded-sm" style={{ background: d.fill }} />
                                {d.name}: {formatMoney(d.value)}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      {deptData.length > 0 && (
                        <div className={KPI_CARD}>
                          <div className="mb-2 text-xs font-medium text-neutral-300">Net pay by department</div>
                          <ResponsiveContainer width="100%" height={120}>
                            <BarChart data={deptData} layout="vertical" margin={{ top: 0, right: 40, left: 70, bottom: 0 }}>
                              <XAxis type="number" tick={{ fontSize: 9, fill: "#737373" }} tickFormatter={(v) => formatMoney(v)} />
                              <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: "#a3a3a3" }} width={65} />
                              <Tooltip formatter={(v: number) => formatMoney(v)} contentStyle={{ background: "#0a0a0a", border: "1px solid #262626", borderRadius: 8 }} />
                              <Bar dataKey="value" fill="#0ea5e9" radius={[0, 4, 4, 0]} name="Net Pay" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>
                  );
                })()}
                <div className={`mt-3 ${GLASS_CARD} p-4`}>
                  <div className="mb-2 text-sm font-semibold">Payroll Staff Details</div>
                  <div className="overflow-x-auto">
                    <table className="min-w-[900px] text-left text-sm">
                      <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                        <tr>
                          {["Month","Staff","Dept","Basic","Housing","Food","Other","Transp.","Gross","Net +/-","Net pay"].map(h => (
                            <th key={h} className="px-3 py-2 sticky first:left-0 first:z-10 first:bg-neutral-900 [&:nth-child(2)]:sticky [&:nth-child(2)]:left-14 [&:nth-child(2)]:z-10 [&:nth-child(2)]:bg-neutral-900">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {payrollRowsFiltered.slice(0, 300).map((row, idx) => (
                          <tr key={`${row.month_key}-${row.staff_name}-${idx}`} className="border-b border-neutral-800/70">
                            <td className="sticky left-0 bg-neutral-950/95 px-3 py-2">{row.month_key}</td>
                            <td className="sticky left-14 max-w-[200px] truncate bg-neutral-950/95 px-3 py-2">{row.staff_name}</td>
                            <td className="px-3 py-2">{row.department || "-"}</td>
                            <td className="px-3 py-2 tabular-nums">{formatMoney(Number(row.basic_salary || 0))}</td>
                            <td className="px-3 py-2 tabular-nums">{formatMoney(Number(row.accommodation || 0))}</td>
                            <td className="px-3 py-2 tabular-nums">{formatMoney(Number(row.food_allowance || 0))}</td>
                            <td className="px-3 py-2 tabular-nums">{formatMoney(Number(row.other_allowance || 0))}</td>
                            <td className="px-3 py-2 tabular-nums">{formatMoney(Number(row.transportation || 0))}</td>
                            <td className="px-3 py-2 tabular-nums">{formatMoney(Number(row.gross_pay || 0))}</td>
                            <td className="px-3 py-2 tabular-nums">{formatMoney(Number(row.net_additions || 0) - Number(row.net_deductions || 0))}</td>
                            <td className="px-3 py-2 font-medium tabular-nums text-sky-200">{formatMoney(Number(row.total_net_pay || 0))}</td>
                          </tr>
                        ))}
                        {!payrollRowsFiltered.length && (
                          <tr>
                            <td colSpan={11} className="px-3 py-6 text-center text-neutral-500">
                              {payrollRows.length ? "No payroll data for selected period/staff" : "No payroll data imported yet (try Sync Payroll Folder)"}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
