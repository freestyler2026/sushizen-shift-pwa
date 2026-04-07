"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  CalendarDays,
  BarChart2,
  CheckCircle2,
  CloudDownload,
  Copy,
  DollarSign,
  Fingerprint,
  Info,
  InboxIcon,
  KeyRound,
  LayoutDashboard,
  Lock,
  Download,
  RefreshCw,
  Receipt,
  Search,
  ShieldCheck,
  ShieldOff,
  ShoppingBag,
  Smartphone,
  Table2,
  TrendingUp,
} from "lucide-react";
import {
  canViewManagementPl,
  canViewSalesAnalytics,
  clearStepUpAuth,
  getAuth,
  getAuthHeaders,
  refreshAuthFromApi,
  setStepUpAuth,
  stepUpSatisfies,
  type City,
} from "@/lib/auth";
import { startPasskeyAuthentication, startPasskeyRegistration } from "@/lib/webauthn";
import { normalizeCalendarDateInput } from "@/lib/dateInput";
import DateRangePicker from "@/components/DateRangePicker";
import MonthPicker from "@/components/MonthPicker";
import { ManilaSalesSection } from "@/components/analytics/ManilaSalesSection";
import ProcurementAnalyticsSection from "@/app/admin/analytics/procurement/page";
import { fmtNum, fmtNumTitle } from "@/lib/formatters";
import {
  GLASS_CARD,
  HIGHLIGHT_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SMALL_BUTTON,
  DANGER_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  TAB_CONTAINER,
  TAB_ACTIVE,
  TAB_INACTIVE,
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
  TABLE_HEADER,
  TABLE_ROW,
  TABLE_CELL,
  T_PAGE_TITLE,
  T_SECTION,
  T_CARD_TITLE,
  T_LABEL,
  T_BODY,
  T_CAPTION,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_INFO,
  DIVIDER,
} from "@/lib/ui-tokens";
import { cardVariants, staggerContainerVariants, tabContentTransition } from "@/lib/motion-tokens";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { FlashValue } from "@/components/ui/FlashValue";

// Resolve API base at runtime so local dev always talks to FastAPI directly,
// even when the page is opened via a LAN IP or a custom local hostname.
function getApiBase() {
  if (process.env.NODE_ENV !== "production") return "http://127.0.0.1:8000";
  return "";
}

function normalizeApiErrorMessage(raw: string, fallback: string) {
  const text = String(raw || "").trim();
  const lower = text.toLowerCase();
  if (!text) return fallback;
  if (text.includes("<!DOCTYPE html") || lower.includes("<html") || lower.includes("application error")) {
    return "Server timed out while loading analytics. Please narrow the date range or retry.";
  }
  if (lower.includes("h12") || lower.includes("request timeout") || lower.includes("503")) {
    return "Server timed out while loading analytics. Please narrow the date range or retry.";
  }
  return text;
}

function parseApiErrorDetail(text: string) {
  try {
    const parsed = JSON.parse(text);
    return typeof parsed?.detail === "string" ? parsed.detail : "";
  } catch {
    return "";
  }
}

async function apiGet<T = any>(path: string): Promise<T> {
  const request = async () =>
    fetch(`${getApiBase()}${path}`, {
      cache: "no-store",
      headers: getAuthHeaders(),
    });
  let res = await request();
  let text = await res.text();

  if (!res.ok && res.status === 401) {
    const detail = parseApiErrorDetail(text);
    const current = getAuth();
    if (
      current?.pin &&
      (
        detail.includes("Invalid access token") ||
        detail.includes("Authentication is required") ||
        !current.accessToken
      )
    ) {
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

  if (!res.ok && res.status === 401) {
    const detail = parseApiErrorDetail(text);
    const current = getAuth();
    if (
      current?.pin &&
      (
        detail.includes("Invalid access token") ||
        detail.includes("Authentication is required") ||
        !current.accessToken
      )
    ) {
      await refreshAuthFromApi(current, { includeMfa: true });
      res = await request();
      text = await res.text();
    }
  }

  if (!res.ok) {
    const detail = parseApiErrorDetail(text);
    throw new Error(normalizeApiErrorMessage(detail || text, `POST ${path} failed`));
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

const POS_SYNC_STEP_LABELS: Record<string, string> = {
  sales: "POS",
  hourly: "Hourly Sales",
  operation_time: "Operation Time",
  product_mix: "Product Mix",
};

const PAGE_TITLE = T_PAGE_TITLE;
const SECTION_TITLE = T_SECTION;
const CARD_TITLE = T_CARD_TITLE;
const BODY_TEXT = T_BODY;
const SUBTEXT = T_CAPTION;
const LABEL_TEXT = T_LABEL;
const NUMERIC_BLOCK_VALUE = "mt-2 min-h-[40px] text-2xl font-bold leading-tight tracking-tight text-white tabular-nums break-words";
const NUMERIC_SMALL_BLOCK_VALUE = "mt-1 text-lg font-bold leading-tight tracking-tight text-white tabular-nums break-words";
const SALES_NUMERIC_VALUE = "mt-1 min-h-[40px] text-2xl font-bold leading-tight tracking-tight text-white tabular-nums break-words";
function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function getPosSyncJobStepItems(job?: PosSyncJob | null): PosSyncJobStep[] {
  if (!job) return [];
  if (Array.isArray(job.result?.steps) && job.result?.steps.length) {
    return job.result.steps;
  }
  const order = Array.isArray(job.progress?.order) ? job.progress?.order : [];
  const steps = job.progress?.steps || {};
  return order.map((step) => {
    const state = steps[step] || {};
    return {
      step,
      status: String(state.status || "pending"),
      processed_count: Number(state.processed_count || 0),
      duplicate_count: Number(state.duplicate_count || 0),
      failed_count: Number(state.failed_count || 0),
      message: String(state.last_message || ""),
    };
  });
}

function formatPosSyncJobMessage(job?: PosSyncJob | null, prefix = ""): string {
  if (!job) return prefix || "";
  const lines: string[] = [];
  const currentLabel = POS_SYNC_STEP_LABELS[job.current_step || ""] || "queue";
  const status = String(job.status || "").toUpperCase();
  const header = prefix.trim();
  if (header && header !== "POS sync job queued" && header !== "POS sync job already in progress") {
    lines.push(header);
  }
  if (status === "QUEUED") {
    lines.push("Sync queued. The worker will start shortly.");
  } else if (status === "RUNNING") {
    lines.push(`Sync in progress. Current step: ${currentLabel}.`);
  } else if (status === "COMPLETED") {
    lines.push("Sync completed successfully.");
  } else if (status === "COMPLETED_WITH_WARNINGS") {
    lines.push("Sync completed with some warnings.");
  } else if (status === "FAILED") {
    lines.push(`Sync failed${job.error_message ? `: ${job.error_message}` : "."}`);
  }

  for (const step of getPosSyncJobStepItems(job)) {
    const label = POS_SYNC_STEP_LABELS[step.step] || step.step;
    const summaryParts: string[] = [];
    if (step.processed_count > 0) summaryParts.push(`${step.processed_count} new`);
    if (step.duplicate_count > 0) summaryParts.push(`${step.duplicate_count} already synced`);
    if (step.failed_count > 0) summaryParts.push(`${step.failed_count} warning`);
    const fallbackStatus =
      step.status === "pending"
        ? "waiting"
        : step.status === "running"
          ? "running"
          : step.status === "completed"
            ? "done"
            : step.status === "completed_with_warnings"
              ? "done with warnings"
              : step.status;
    const summary = summaryParts.length ? summaryParts.join(", ") : step.message || fallbackStatus;
    lines.push(`${label}: ${summary}`);
  }

  return lines.filter(Boolean).join("\n");
}

function normalizePasskeyUiError(raw: string): string {
  const text = String(raw || "").trim();
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const isLocal = host === "localhost" || host === "127.0.0.1";
  if (
    /relying party id is not a registrable domain suffix|well-known\/webauthn|rp id/i.test(text) &&
    isLocal
  ) {
    return "Passkeys are not available from this local preview URL. Use Verify With PIN locally, or use the deployed app for passkey verification.";
  }
  if (
    /no passkeys are registered for this account|credential not found|passkey verification was cancelled|notallowederror|timed out or was not allowed/i.test(text) &&
    isLocal
  ) {
    return "No local passkey is available for this localhost session. Use Verify With PIN locally.";
  }
  return text;
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

type ProductMixRankingRow = {
  product_a_name: string;
  product_b_name: string;
  major_orders: number;
  mix_orders: number;
  ratio: number;
};

type ProductMixRankingResp = {
  ok: boolean;
  coverage_from?: string | null;
  coverage_to?: string | null;
  source_file_name?: string;
  items: ProductMixRankingRow[];
};

type PosSyncJobStep = {
  step: string;
  status: string;
  processed_count: number;
  duplicate_count: number;
  failed_count: number;
  message?: string;
};

type PosSyncJob = {
  id: string;
  job_kind: string;
  city: string;
  status: string;
  current_step: string;
  progress?: {
    order?: string[];
    steps?: Record<
      string,
      {
        status?: string;
        processed_count?: number;
        duplicate_count?: number;
        failed_count?: number;
        last_message?: string;
      }
    >;
  };
  result?: {
    steps?: PosSyncJobStep[];
  };
  error_message?: string;
};

type PosSyncJobResp = {
  ok?: boolean;
  message?: string;
  reused?: boolean;
  job?: PosSyncJob;
};

type PosAggregatorMetric = {
  aggregator_name: string;
  order_count_non_cancelled: number;
  gross_revenue: number;
  net_revenue: number;
};

type PosBranchOrderRow = {
  branch_name: string;
  order_count_non_cancelled: number;
  gross_revenue: number;
  net_revenue: number;
  aggregators?: PosAggregatorMetric[];
};

type PosBranchOrderResp = { ok: boolean; items: PosBranchOrderRow[] };

type PosBrandOrderRow = {
  brand_name: string;
  order_count_non_cancelled: number;
  gross_revenue: number;
  net_revenue: number;
  aggregators?: PosAggregatorMetric[];
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

type PosCancelOrderTypeRow = {
  order_type: string;
  lost_order_count: number;
  lost_revenue: number;
};

type PosCancelPlatformRow = {
  platform_name: string;
  lost_order_count: number;
  platform_pre_ack: number;
  platform_post_ack: number;
  merchant_pre_ack: number;
  merchant_post_ack: number;
};

type PosCancelDailyRow = {
  work_date: string;
  brand_name: string;
  lost_order_count: number;
  lost_revenue: number;
  source_file_name: string;
};

type PosCancelOrdersResp = {
  ok: boolean;
  city: string;
  date_from: string;
  date_to: string;
  brand_name?: string;
  summary?: {
    lost_order_count: number;
    lost_revenue: number;
    day_count: number;
    order_type_count: number;
    platform_count: number;
  };
  order_type_rows: PosCancelOrderTypeRow[];
  platform_rows: PosCancelPlatformRow[];
  daily_rows: PosCancelDailyRow[];
};

type EvaluationSection = {
  section_key: string;
  section_label: string;
  status: string;
  description: string;
  display_order: number;
};

type EvaluationRule = {
  metric_key: string;
  category_key: string;
  metric_label: string;
  config_json: Record<string, unknown>;
  is_active: boolean;
  updated_by?: string;
  created_at?: string | null;
  updated_at?: string | null;
};

type EvaluationSummaryData = {
  store_count: number;
  overall_avg_score: number | null;
  attendance_avg_score: number | null;
  operation_avg_score: number | null;
  food_cost_avg_score: number | null;
  operation_time_avg_minutes: number | null;
  warning_count: number;
};

type EvaluationStoreRow = {
  branch_code: string;
  branch_name: string;
  attendance: {
    late_count: number;
    absence_count: number;
    shift_change_request_count: number;
    shift_preserve_rate: number | null;
    scheduled_minutes: number;
    actual_minutes: number;
    scores: {
      late_score: number | null;
      absence_score: number | null;
      shift_change_score: number | null;
      shift_preserve_score: number | null;
    };
    total_score: number;
    max_score: number;
  };
  operation: {
    operation_time_minutes: number | null;
    qc_grade_avg: number | null;
    image_upload_rate: number | null;
    total_photos: number;
    order_count: number;
    order_day_count: number;
    waste_report_day_count: number;
    waste_report_coverage: number | null;
    waste_report_row_count?: number;
    waste_report_quantity_total?: number;
    waste_report_rows_per_day?: number;
    waste_report_quantity_per_100_orders?: number | null;
    waste_target_low_per_100_orders?: number;
    waste_target_high_per_100_orders?: number;
    prep_report_day_count: number;
    prep_report_coverage: number | null;
    prep_report_row_count?: number;
    prep_report_quantity_total?: number;
    prep_report_rows_per_day?: number;
    prep_expected_rows_per_day?: number;
    prep_rows_ratio?: number;
    prep_report_quantity_per_100_orders?: number | null;
    prep_target_low_per_100_orders?: number;
    prep_target_high_per_100_orders?: number;
    scores: {
      operation_time_score: number | null;
      qc_score: number | null;
      image_upload_score: number | null;
      waste_score: number | null;
      prep_score: number | null;
    };
    total_score: number;
    max_score: number;
    source_scope: string;
  };
  food_cost: {
    food_cost_pct: number | null;
    target_pct: number | null;
    score: number | null;
    max_score: number;
  };
  purchasing: {
    status: string;
    label: string;
  };
  inventory_accuracy: {
    status: string;
    label: string;
  };
  overall_score: number;
  overall_max_score: number;
};

type EvaluationStoresResp = {
  ok: boolean;
  city: string;
  date_from: string;
  date_to: string;
  summary: EvaluationSummaryData;
  stores: EvaluationStoreRow[];
  sections: EvaluationSection[];
  warnings: string[];
};

type EvaluationTimelineStore = {
  branch_code: string;
  branch_name: string;
};

type EvaluationTimelineDay = {
  date: string;
  store_count: number;
  company_total_score: number;
  company_total_max_score: number;
  company_avg_score: number | null;
  stores: {
    branch_code: string;
    branch_name: string;
    overall_score: number | null;
    overall_max_score: number;
    attendance_score: number | null;
    operation_score: number | null;
    food_cost_score: number | null;
  }[];
};

type EvaluationTimelineResp = {
  ok: boolean;
  city: string;
  date_from: string;
  date_to: string;
  stores: EvaluationTimelineStore[];
  days: EvaluationTimelineDay[];
  warnings: string[];
};

type EvaluationReportDetailEntry = {
  submitted_at: string;
  store_raw: string;
  reporter: string;
  detail: string;
  quantity_total: number;
};

type EvaluationDayDetailStore = {
  branch_code: string;
  branch_name: string;
  overall_score: number | null;
  overall_max_score: number;
  attendance_score: number | null;
  operation_score: number | null;
  food_cost_score: number | null;
  order_count?: number;
  backup_quantity_total?: number;
  backup_quantity_per_100_orders?: number | null;
  disposal_reports: EvaluationReportDetailEntry[];
  backup_reports: EvaluationReportDetailEntry[];
};

type EvaluationDayDetailsResp = {
  ok: boolean;
  city: string;
  target_date: string;
  stores: EvaluationDayDetailStore[];
  warnings: string[];
};

type EvaluationRulesResp = {
  ok: boolean;
  rules: EvaluationRule[];
  sections: EvaluationSection[];
  settings?: Record<string, { value_json?: Record<string, unknown> }>;
};

type EvaluationSettingsResp = {
  ok: boolean;
  settings?: Record<string, { value_json?: Record<string, unknown> }>;
  setting?: { value_json?: Record<string, unknown> };
};

function getEvaluationStrictnessLevel(settings?: Record<string, { value_json?: Record<string, unknown> }>) {
  const raw = Number(settings?.scoring_profile?.value_json?.strictness_level ?? 5);
  if (!Number.isFinite(raw)) return 5;
  return Math.max(1, Math.min(10, Math.round(raw)));
}

function formatEvaluationWarning(message: string) {
  const text = String(message || "").trim();
  const lower = text.toLowerCase();
  const grantAccessMatch = text.match(/grant access to\s+([^\s]+)/i);
  const shareTarget = grantAccessMatch?.[1] || "";
  const isQuotaError =
    lower.includes("rate_limit_exceeded") ||
    lower.includes("quota") ||
    lower.includes("429");
  const hasPermissionError =
    lower.includes("403") ||
    lower.includes("permission") ||
    lower.includes("caller does not have permission") ||
    lower.includes("grant access to");

  if (lower.includes("qc history folder unavailable")) {
    return "";
  }

  if (lower.includes("qc sheet unavailable")) {
    return hasPermissionError
      ? shareTarget
        ? `QC sheet is connected, but access is still missing. Share it with ${shareTarget}.`
        : "QC sheet is connected, but the production service account does not have access."
      : "QC sheet is temporarily unavailable."
  }

  if (
    lower.includes("form sheet unavailable") ||
    lower.includes("form detail unavailable") ||
    lower.includes("disposal sheet unavailable") ||
    lower.includes("prep sheet unavailable")
  ) {
    if (isQuotaError) {
      return "Google Sheets API rate limit was reached. Please wait 1-2 minutes and retry.";
    }
    return hasPermissionError
      ? shareTarget
        ? `Some disposal or prep sheets still need to be shared with ${shareTarget}.`
        : "Some disposal or prep sheets are connected, but the production service account does not have access."
      : "Some disposal or prep sheets are temporarily unavailable."
  }

  if (hasPermissionError) {
    return "Some evaluation source sheets cannot be read by the production service account."
  }

  return text;
}

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

type OperationTimeRow = {
  work_date: string;
  overall_completion_minutes: number | null;
  overall_change_pct: number | null;
  acknowledging_seconds: number | null;
  acknowledging_change_pct: number | null;
  preparing_minutes: number | null;
  preparing_change_pct: number | null;
  dispatching_minutes: number | null;
  dispatching_change_pct: number | null;
  delivering_minutes: number | null;
  delivering_change_pct: number | null;
  source_file_name: string;
};

type OperationTimeResp = {
  ok: boolean;
  city: string;
  date_from: string;
  date_to: string;
  items: OperationTimeRow[];
  summary?: {
    day_count: number;
    avg_overall_completion_minutes?: number | null;
    avg_acknowledging_seconds?: number | null;
    avg_preparing_minutes?: number | null;
    avg_dispatching_minutes?: number | null;
    avg_delivering_minutes?: number | null;
  };
  latest?: OperationTimeRow | null;
};

type CctvScoreSummaryRow = {
  city: string;
  branch_code: string;
  station_code: string;
  work_date: string;
  shift_key: string;
  metric_key: string;
  metric_value: number;
  sample_count: number;
  version_tag: string;
};

type CctvScoreSummaryResp = {
  ok: boolean;
  city: string;
  date_from: string;
  date_to: string;
  rows: CctvScoreSummaryRow[];
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
  basis_mode: "rolling_30d" | "previous_month_fallback";
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
    mode: "rolling_30d" | "previous_month_fallback";
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

function scrollToSection(id: string) {
  if (typeof document === "undefined") return;
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

const SALES_SECTION_OPTIONS = [
  { value: "summary", label: "Summary", id: "sales-summary" },
  { value: "hourly", label: "Hourly", id: "sales-hourly" },
  { value: "operationTime", label: "Op Time", id: "sales-operation-time" },
  { value: "brands", label: "Brands", id: "sales-brands" },
  { value: "cancelOrders", label: "Cancel Orders", id: "sales-cancel-orders" },
  { value: "productMix", label: "Product Mix", id: "sales-product-mix" },
  { value: "menu", label: "Menu", id: "sales-menu" },
  { value: "stores", label: "Stores", id: "sales-stores" },
  { value: "daily", label: "Daily", id: "sales-daily" },
  { value: "manilaSales", label: "Manila Sales", id: "sales-manila-sales" },
] as const;
const DUBAI_SALES_SECTION_OPTIONS = SALES_SECTION_OPTIONS.filter((section) => section.value !== "manilaSales");
const MANILA_SALES_SECTION_OPTIONS = SALES_SECTION_OPTIONS.filter((section) => section.value === "manilaSales");

const FINANCE_SECTION_OPTIONS = [
  { value: "summary", label: "Summary", id: "finance-summary" },
  { value: "breakEven", label: "Break-even", id: "finance-break-even" },
  { value: "plDetails", label: "P&L Details", id: "finance-pl-details" },
  { value: "payroll", label: "Payroll", id: "finance-payroll" },
] as const;

const EVALUATION_SECTION_OPTIONS = [
  { value: "summary", label: "Summary", id: "evaluation-summary" },
  { value: "attendance", label: "Attendance", id: "evaluation-attendance" },
  { value: "operation", label: "Operation", id: "evaluation-operation" },
  { value: "disposal", label: "Disposal", id: "evaluation-disposal" },
  { value: "backup", label: "Backup", id: "evaluation-backup" },
  { value: "foodCost", label: "Food Cost", id: "evaluation-food-cost" },
  { value: "purchasing", label: "Purchasing", id: "evaluation-purchasing" },
  { value: "inventoryAccuracy", label: "Inventory Accuracy", id: "evaluation-inventory-accuracy" },
] as const;

function formatPct(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

function formatScore(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatDecimal(Number(value), digits);
}

function formatBreakEvenBasis(mode?: "rolling_30d" | "previous_month_fallback") {
  return mode === "previous_month_fallback" ? "Previous month fallback" : "Rolling 30 days";
}

function formatBreakEvenFallbackReason(reason?: string) {
  if (!reason) return "";
  if (reason === "missing_pos_days") return "Rolling 30d data was incomplete because one or more POS days were missing.";
  if (reason === "missing_pl_month_import") return "Rolling 30d data was incomplete because monthly P&L import data was missing.";
  if (reason === "missing_store_scope_in_pl") return "Rolling 30d data was incomplete because one or more store columns were missing in P&L.";
  if (reason === "missing_multiple_sources") return "Rolling 30d data was incomplete because multiple source datasets were missing.";
  return reason;
}

function formatBreakEvenReasonLabel(reason?: string) {
  if (!reason) return "";
  if (reason === "missing_pos_days") return "POS daily data is missing for one or more dates.";
  if (reason === "missing_pl_month_import") return "Monthly P&L import data is missing for one or more months.";
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

function AggregatorBreakdown({ items, dense = false }: { items?: PosAggregatorMetric[]; dense?: boolean }) {
  const rows = (items || []).filter(
    (row) => String(row.aggregator_name || "").trim() || Number(row.order_count_non_cancelled || 0) || Number(row.net_revenue || 0),
  );
  if (!rows.length) {
    return <div className="text-[11px] text-neutral-500">No aggregator breakdown</div>;
  }
  return (
    <div className={dense ? "space-y-1" : "space-y-2"}>
      {rows.map((row) => (
        <div
          key={`${row.aggregator_name}-${row.order_count_non_cancelled}-${row.net_revenue}`}
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-neutral-800/80 bg-neutral-950/50 px-2 py-1.5"
        >
          <div className="text-xs text-neutral-300">{row.aggregator_name || "Unknown"}</div>
          <div className="text-[11px] text-neutral-500 tabular-nums">
            {formatCount(Number(row.order_count_non_cancelled || 0))} orders · Net {formatMoney(Number(row.net_revenue || 0))}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatMinutes(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${formatDecimal(Number(value), digits)} min`;
}

function EvaluationKpiCard({
  title,
  value,
  hint,
  guide,
  scaleNote,
  targetLine,
  targetStatus,
  targetStatusClassName = "text-neutral-300",
}: {
  title: string;
  value: string;
  hint: string;
  guide: string;
  scaleNote?: string;
  targetLine?: string;
  targetStatus?: string;
  targetStatusClassName?: string;
}) {
  return (
    <div className="flex h-full min-w-0 flex-col rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
      <div className="h-[64px] overflow-hidden text-xs leading-5 text-neutral-500">{title}</div>
      <div className="mt-1 flex h-[42px] items-end">
        <span className="ml-auto block w-full whitespace-nowrap text-right text-xl font-bold leading-none tabular-nums sm:text-2xl">
          {value}
        </span>
      </div>
      {targetLine ? (
        <div className="mt-2 rounded-xl border border-sky-900/40 bg-sky-950/30 px-2.5 py-2 text-[11px] leading-5 text-sky-100">
          <div>Target line: {targetLine}</div>
          {targetStatus ? <div className={`mt-1 ${targetStatusClassName}`}>{targetStatus}</div> : null}
        </div>
      ) : null}
      <div className="mt-2 min-h-[80px] text-[11px] leading-5 text-neutral-400">{hint}</div>
      {scaleNote ? (
        <div className="mt-2 text-[11px] leading-5 text-sky-300">{scaleNote}</div>
      ) : null}
      <div className="mt-2 rounded-xl border border-neutral-800/80 bg-neutral-950/70 px-2.5 py-2 text-[11px] leading-5 text-neutral-500">
        {guide}
      </div>
    </div>
  );
}

function EvaluationMetricCell({
  actual,
  score,
  maxScore = 10,
  emphasize = false,
}: {
  actual: string;
  score: number | null | undefined;
  maxScore?: number | null | undefined;
  emphasize?: boolean;
}) {
  return (
    <div className="min-w-[108px]">
      <div className="tabular-nums text-sm text-white">{actual}</div>
      <div className={emphasize ? "mt-1 text-[11px] font-semibold tabular-nums text-sky-200" : "mt-1 text-[11px] tabular-nums text-neutral-500"}>
        Score {formatScore(score)} / {formatCount(Number(maxScore || 0))} pts
      </div>
    </div>
  );
}

function formatSeconds(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${formatDecimal(Number(value), digits)} sec`;
}

function describeHigherIsBetter(actual: number | null | undefined, target: number, unit: "pts" | "stores" = "pts") {
  if (actual == null || !Number.isFinite(actual)) {
    return { text: "Status: No data", className: "text-neutral-300" };
  }
  const diff = Number(actual) - target;
  if (diff >= 0) {
    return {
      text: `Status: On target (+${formatDecimal(diff, 1)} ${unit})`,
      className: "text-emerald-300",
    };
  }
  return {
    text: `Status: Below target (${formatDecimal(diff, 1)} ${unit})`,
    className: "text-amber-300",
  };
}

function describeLowerIsBetter(actual: number | null | undefined, target: number, unit = "min") {
  if (actual == null || !Number.isFinite(actual)) {
    return { text: "Status: No data", className: "text-neutral-300" };
  }
  const diff = target - Number(actual);
  if (diff >= 0) {
    return {
      text: `Status: On target (+${formatDecimal(diff, 1)} ${unit} faster)`,
      className: "text-emerald-300",
    };
  }
  return {
    text: `Status: Above target (${formatDecimal(Math.abs(diff), 1)} ${unit} slower)`,
    className: "text-amber-300",
  };
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
  const compact = x.replace(/[^a-z0-9]/g, "");
  if (compact === "bb") return "BB";
  if (compact === "jlt") return "JLT";
  if (compact === "arj" || compact === "arjan") return "ARJ";
  if (compact === "ab") return "AB";
  if (compact === "am") return "AM";
  if (compact === "mc") return "MC";
  if (compact === "par") return "PAR";
  if (compact === "taft") return "TAFT";
  if (compact === "cubao") return "CUBAO";
  if (compact === "ck") return "CK";
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

function storeIdentityKey(raw: string) {
  const code = mapStoreToBranchCode(raw);
  if (code) return `code:${code}`;
  return `name:${String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()}`;
}

function isStoreInCity(storeName: string, city: string) {
  const code = mapStoreToBranchCode(storeName);
  if (!code) return true;
  const allowedCodes = new Set(
    (BRANCH_OPTIONS[city] || [])
      .map((opt) => String(opt.value || "").trim())
      .filter(Boolean),
  );
  return allowedCodes.has(code);
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

function monthRangeFromMonthKey(monthKey: string): { from: string; to: string } | null {
  const m = String(monthKey || "").trim().match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  const last = new Date(year, month, 0).getDate();
  return {
    from: `${m[1]}-${m[2]}-01`,
    to: `${m[1]}-${m[2]}-${String(last).padStart(2, "0")}`,
  };
}

function splitDateRangeIntoChunks(dateFrom: string, dateTo: string, chunkSize = 7) {
  const out: Array<{ from: string; to: string }> = [];
  if (!dateFrom || !dateTo) return out;
  const start = new Date(`${dateFrom}T00:00:00`);
  const end = new Date(`${dateTo}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return out;
  const cursor = new Date(start);
  while (cursor <= end) {
    const chunkStart = new Date(cursor);
    const chunkEnd = new Date(cursor);
    chunkEnd.setDate(chunkEnd.getDate() + chunkSize - 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    out.push({
      from: chunkStart.toISOString().slice(0, 10),
      to: chunkEnd.toISOString().slice(0, 10),
    });
    cursor.setDate(cursor.getDate() + chunkSize);
  }
  return out;
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

function MetricValue({
  value,
  unit,
  className = KPI_VALUE,
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
  const stripStepUpForFreshVisit = (value: ReturnType<typeof getAuth>) => {
    if (!value) return value;
    if (stepUpSatisfies("aal2", value)) return value;
    return {
      ...value,
      stepUpToken: "",
      stepUpLevel: "aal1" as const,
      stepUpMethod: "",
      stepUpVerifiedAt: "",
    };
  };

  const [authState, setAuthState] = useState(() => stripStepUpForFreshVisit(getAuth()));
  const auth = authState;
  const previousMonth = previousCalendarMonthRangeIso();

  const [city, setCity] = useState<string>((auth?.city || "dubai").toLowerCase());
  const [dateFrom, setDateFrom] = useState(previousMonth.from);
  const [dateTo, setDateTo] = useState(previousMonth.to);
  const [summaryDateFrom, setSummaryDateFrom] = useState(previousMonth.from);
  const [summaryDateTo, setSummaryDateTo] = useState(previousMonth.to);
  const [complianceMonthKey, setComplianceMonthKey] = useState(previousMonth.from.slice(0, 7));
  const [summaryMonthKey, setSummaryMonthKey] = useState(previousMonth.from.slice(0, 7));
  const [payrollStaffName, setPayrollStaffName] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [summaryBranchCode, setSummaryBranchCode] = useState("");
  const [summaryBrandName, setSummaryBrandName] = useState("");
  const [salesSectionView, setSalesSectionView] = useState<"summary" | "hourly" | "operationTime" | "brands" | "cancelOrders" | "productMix" | "menu" | "stores" | "daily" | "manilaSales" | "all">(
    "summary",
  );
  const [financeSectionView, setFinanceSectionView] = useState<"summary" | "breakEven" | "plDetails" | "payroll" | "all">("summary");
  const [evaluationSectionView, setEvaluationSectionView] = useState<"summary" | "attendance" | "operation" | "disposal" | "backup" | "foodCost" | "purchasing" | "inventoryAccuracy" | "all">(
    "summary",
  );
  const [staffLimit] = useState(20);

  const [approverName, setApproverName] = useState(auth?.staffName || "");
  const [pin, setPin] = useState(auth?.pin || "");
  const [securityBusy, setSecurityBusy] = useState(false);
  const [securityError, setSecurityError] = useState("");
  const [securityMessage, setSecurityMessage] = useState("");
  const [stepUpVerifiedThisVisit, setStepUpVerifiedThisVisit] = useState(() => stepUpSatisfies("aal2", getAuth()));
  const stepUpVerifiedRef = useRef(stepUpSatisfies("aal2", getAuth()));
  const [totpCode, setTotpCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [totpEnrollment, setTotpEnrollment] = useState<null | { enrollmentToken: string; secret: string; otpauthUri: string }>(null);
  const [totpEnrollmentCode, setTotpEnrollmentCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  const [branchDailyRows, setBranchDailyRows] = useState<BranchDailyRow[]>([]);
  const [branchWeekdayRows, setBranchWeekdayRows] = useState<BranchWeekdayRow[]>([]);
  const [staffSummaryRows, setStaffSummaryRows] = useState<StaffSummaryRow[]>([]);
  const [absenceSummaryRows, setAbsenceSummaryRows] = useState<AbsenceSummaryRow[]>([]);
  const [dubaiSummary, setDubaiSummary] = useState<CitySummaryResp | null>(null);
  const [manilaSummary, setManilaSummary] = useState<CitySummaryResp | null>(null);
  const [posSalesRows, setPosSalesRows] = useState<PosSalesDailyRow[]>([]);
  const [posSalesRangeTotals, setPosSalesRangeTotals] = useState<PosSalesDailyTotals | null>(null);
  const [posMenuRankingRows, setPosMenuRankingRows] = useState<PosMenuRankingRow[]>([]);
  const [productMixRankingRows, setProductMixRankingRows] = useState<ProductMixRankingRow[]>([]);
  const [productMixCoverage, setProductMixCoverage] = useState<{ from?: string | null; to?: string | null; source?: string }>({});
  const [posBranchOrderRows, setPosBranchOrderRows] = useState<PosBranchOrderRow[]>([]);
  const [posBrandOrderRows, setPosBrandOrderRows] = useState<PosBrandOrderRow[]>([]);
  const [, setPosBranchDailyRows] = useState<PosBranchDailyRow[]>([]);
  const [cancelOrdersAnalytics, setCancelOrdersAnalytics] = useState<PosCancelOrdersResp | null>(null);
  const [hourlySalesAnalytics, setHourlySalesAnalytics] = useState<HourlySalesAnalyticsResp | null>(null);
  const [hourlyLoadError, setHourlyLoadError] = useState("");
  const [operationTimeAnalytics, setOperationTimeAnalytics] = useState<OperationTimeResp | null>(null);
  const [operationTimeLoadError, setOperationTimeLoadError] = useState("");
  const [cctvScoreRows, setCctvScoreRows] = useState<CctvScoreSummaryRow[]>([]);
  const [cctvScoreLoadError, setCctvScoreLoadError] = useState("");
  const [hourlyStoreName, setHourlyStoreName] = useState("");
  const [, setSalesComparisonRows] = useState<ComparisonItem[]>([]);
  const [payrollRows, setPayrollRows] = useState<PayrollStaffRow[]>([]);
  const [financeRatio, setFinanceRatio] = useState<FinanceLaborRatioResp | null>(null);
  const [plVsTarget, setPlVsTarget] = useState<PlVsTargetResp | null>(null);
  const [breakEven, setBreakEven] = useState<BreakEvenResp | null>(null);
  const [salesPlSummary, setSalesPlSummary] = useState<PlVsTargetResp | null>(null);
  const [evaluationSummary, setEvaluationSummary] = useState<EvaluationSummaryData | null>(null);
  const [evaluationStores, setEvaluationStores] = useState<EvaluationStoreRow[]>([]);
  const [evaluationSections, setEvaluationSections] = useState<EvaluationSection[]>([]);
  const [evaluationWarnings, setEvaluationWarnings] = useState<string[]>([]);
  const [evaluationRules, setEvaluationRules] = useState<EvaluationRule[]>([]);
  const [evaluationTimeline, setEvaluationTimeline] = useState<EvaluationTimelineResp | null>(null);
  const [evaluationDetailDate, setEvaluationDetailDate] = useState(() => previousCalendarMonthRangeIso().to);
  const [evaluationDayDetails, setEvaluationDayDetails] = useState<EvaluationDayDetailsResp | null>(null);
  const [evaluationStrictnessLevel, setEvaluationStrictnessLevel] = useState(5);
  const [evaluationRuleMessage, setEvaluationRuleMessage] = useState("");
  const [evaluationSavingRules, setEvaluationSavingRules] = useState(false);
  const [plSyncing, setPlSyncing] = useState(false);
  const [plSyncMessage, setPlSyncMessage] = useState("");
  const [plStoreName, setPlStoreName] = useState("");

  const handleDateFromChange = (raw: string) => {
    const next = normalizeCalendarDateInput(raw);
    if (!next) return;
    setDateFrom(next);
    if (dateTo && next > dateTo) setDateTo(next);
  };

  const handleDateToChange = (raw: string) => {
    const next = normalizeCalendarDateInput(raw);
    if (!next) return;
    setDateTo(next);
    if (dateFrom && next < dateFrom) setDateFrom(next);
  };

  const handleSummaryDateFromChange = (raw: string) => {
    const next = normalizeCalendarDateInput(raw);
    if (!next) return;
    setSummaryDateFrom(next);
    if (summaryDateTo && next > summaryDateTo) setSummaryDateTo(next);
  };

  const handleSummaryDateToChange = (raw: string) => {
    const next = normalizeCalendarDateInput(raw);
    if (!next) return;
    setSummaryDateTo(next);
    if (summaryDateFrom && next < summaryDateFrom) setSummaryDateFrom(next);
  };

  const handleEvaluationDetailDateChange = (raw: string) => {
    const next = normalizeCalendarDateInput(raw);
    if (!next) return;
    setEvaluationDetailDate(next);
  };

  const handleComplianceMonthChange = (monthKey: string) => {
    setComplianceMonthKey(monthKey);
    const range = monthRangeFromMonthKey(monthKey);
    if (!range) return;
    setDateFrom(range.from);
    setDateTo(range.to);
  };

  const handleSummaryMonthChange = (monthKey: string) => {
    setSummaryMonthKey(monthKey);
    const range = monthRangeFromMonthKey(monthKey);
    if (!range) return;
    setSummaryDateFrom(range.from);
    setSummaryDateTo(range.to);
  };

  useEffect(() => {
    if (dateTo.slice(0, 7)) {
      setComplianceMonthKey(dateTo.slice(0, 7));
      return;
    }
    if (dateFrom.slice(0, 7)) {
      setComplianceMonthKey(dateFrom.slice(0, 7));
      return;
    }
    setComplianceMonthKey("");
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (summaryDateFrom.slice(0, 7) === summaryDateTo.slice(0, 7)) {
      setSummaryMonthKey(summaryDateFrom.slice(0, 7));
      return;
    }
    setSummaryMonthKey("");
  }, [summaryDateFrom, summaryDateTo]);

  const evaluationScoreScale = useMemo(() => {
    const maxOf = (values: number[], fallback: number) => {
      const valid = values.filter((v) => Number.isFinite(v) && v > 0);
      if (!valid.length) return fallback;
      return Math.max(...valid);
    };
    const round1 = (v: number) => Math.round(v * 10) / 10;
    const passFromMax = (max: number) => round1(max * 0.7);

    const overallMax = maxOf(evaluationStores.map((row) => Number(row.overall_max_score || 0)), 100);
    const attendanceMax = maxOf(evaluationStores.map((row) => Number(row.attendance.max_score || 0)), 40);
    const operationMax = maxOf(evaluationStores.map((row) => Number(row.operation.max_score || 0)), 50);
    const foodCostMax = maxOf(evaluationStores.map((row) => Number(row.food_cost.max_score || 0)), 10);
    const disposalMax = 10;
    const backupMax = 10;

    return {
      overallMax,
      overallPass: passFromMax(overallMax),
      attendanceMax,
      attendancePass: passFromMax(attendanceMax),
      operationMax,
      operationPass: passFromMax(operationMax),
      foodCostMax,
      foodCostPass: passFromMax(foodCostMax),
      disposalMax,
      disposalPass: passFromMax(disposalMax),
      backupMax,
      backupPass: passFromMax(backupMax),
    };
  }, [evaluationStores]);

  const disposalAvgScore = useMemo(() => {
    const vals = evaluationStores
      .map((row) => Number(row.operation?.scores?.waste_score))
      .filter((v) => Number.isFinite(v));
    if (!vals.length) return null;
    return vals.reduce((sum, v) => sum + v, 0) / vals.length;
  }, [evaluationStores]);

  const backupAvgScore = useMemo(() => {
    const vals = evaluationStores
      .map((row) => Number(row.operation?.scores?.prep_score))
      .filter((v) => Number.isFinite(v));
    if (!vals.length) return null;
    return vals.reduce((sum, v) => sum + v, 0) / vals.length;
  }, [evaluationStores]);

  const evaluationTargetLines = useMemo(() => {
    // "Good operations" targets shown in the summary KPI cards.
    // Score targets use stable thresholds so users can evaluate at a glance.
    const overallTarget = 70;
    const attendanceTarget = 28;
    const operationTarget = 35;
    const foodCostTarget = 7;
    const disposalTarget = 7;
    const backupTarget = 7;
    const opTimeTargetMinutes = 18;
    const storeCoverageTarget = city === "dubai" ? 5 : 3;
    return {
      overallTarget,
      attendanceTarget,
      operationTarget,
      foodCostTarget,
      disposalTarget,
      backupTarget,
      opTimeTargetMinutes,
      storeCoverageTarget,
    };
  }, [city]);

  const evaluationTimelineDays = useMemo(() => {
    return evaluationTimeline?.days || [];
  }, [evaluationTimeline]);

  const evaluationDayDetailsByBranch = useMemo(() => {
    const map = new Map<string, EvaluationDayDetailStore>();
    for (const row of evaluationDayDetails?.stores || []) {
      map.set(String(row.branch_code || "").toUpperCase(), row);
    }
    return map;
  }, [evaluationDayDetails]);

  const cctvMetricSnapshot = useMemo(() => {
    const latestByMetric = new Map<string, CctvScoreSummaryRow>();
    for (const row of cctvScoreRows || []) {
      const key = `${String(row.branch_code || "").toUpperCase()}|${String(row.station_code || "").toLowerCase()}|${String(row.metric_key || "").toLowerCase()}`;
      if (!latestByMetric.has(key)) latestByMetric.set(key, row);
    }
    const grouped = new Map<string, Record<string, number>>();
    latestByMetric.forEach((row) => {
      const key = `${String(row.branch_code || "").toUpperCase()}|${String(row.station_code || "").toLowerCase()}`;
      const cur = grouped.get(key) || {};
      cur[String(row.metric_key || "").toLowerCase()] = Number(row.metric_value || 0);
      grouped.set(key, cur);
    });
    return Array.from(grouped.entries()).map(([key, metrics]) => {
      const [branchCode, stationCode] = key.split("|");
      return { branchCode, stationCode, metrics };
    });
  }, [cctvScoreRows]);

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

  const [salesSyncing, setSalesSyncing] = useState(false);
  const [payrollSyncing, setPayrollSyncing] = useState(false);
  const [salesSyncMessage, setSalesSyncMessage] = useState("");
  const [payrollSyncMessage, setPayrollSyncMessage] = useState("");

  const [comparisonRows, setComparisonRows] = useState<ComparisonItem[]>([]);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState("");
  const [comparisonNotice, setComparisonNotice] = useState("");
  const [comparisonLoadedOnce, setComparisonLoadedOnce] = useState(false);
  const [comparisonLimit, setComparisonLimit] = useState("5000");

  const [viewMode, setViewMode] = useState<AnalyticsViewMode>("perfect_attendance");
  const [analyticsTab, setAnalyticsTab] = useState<"staff" | "dubaiSales" | "manilaSales" | "evaluation" | "finance" | "procurement">("staff");
  const [staffSearch, setStaffSearch] = useState("");

  const roleUpper = String(auth?.role || "STAFF").toUpperCase();
  const isHQOrAdmin = roleUpper === "HQ" || roleUpper === "ADMIN";
  const canViewStaffChannel = isHQOrAdmin;
  const canViewDubaiSalesChannel = canViewSalesAnalytics(auth, "dubai");
  const canViewManilaSalesChannel = canViewSalesAnalytics(auth, "manila");
  const canViewSalesChannel = canViewDubaiSalesChannel || canViewManilaSalesChannel;
  const canViewProcurementChannel = canViewSalesChannel;
  const canViewFinanceChannels = canViewSalesChannel;
  const canViewEvaluationChannel = canViewSalesChannel;
  const canViewManagementPlChannel = canViewManagementPl(auth);
  const hasVisibleAnalyticsChannel = canViewStaffChannel || canViewFinanceChannels || canViewManagementPlChannel;
  const isSalesAnalyticsTab = analyticsTab === "dubaiSales" || analyticsTab === "manilaSales";
  const salesCity: City = analyticsTab === "manilaSales" ? "manila" : "dubai";
  const isManilaSalesCity = analyticsTab === "manilaSales";
  const visibleSalesSectionOptions = isManilaSalesCity ? MANILA_SALES_SECTION_OPTIONS : DUBAI_SALES_SECTION_OPTIONS;
  const salesStepUpReady = stepUpSatisfies("aal2", auth) && stepUpVerifiedThisVisit;
  const financeStepUpReady = stepUpSatisfies("aal2", auth) && stepUpVerifiedThisVisit;
  const activeSecurityRequirement =
    analyticsTab === "finance"
      ? "MFA (Passkey, TOTP, Backup code, or PIN step-up)"
      : isSalesAnalyticsTab || analyticsTab === "evaluation" || analyticsTab === "staff"
        ? "MFA (Passkey, TOTP, Backup code, or PIN step-up)"
        : "Login";
  const activeSecuritySatisfied =
    analyticsTab === "finance" ? financeStepUpReady : isSalesAnalyticsTab || analyticsTab === "evaluation" || analyticsTab === "staff" ? salesStepUpReady : true;

  const [staffSortBy, setStaffSortBy] = useState<"hours" | "days" | "segments" | "name">("hours");
  const [branchSortBy, setBranchSortBy] = useState<"totalHours" | "avgHoursPerDay" | "maxStaff" | "branch">("totalHours");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    stepUpVerifiedRef.current = stepUpVerifiedThisVisit;
  }, [stepUpVerifiedThisVisit]);

  async function refreshSecurityState(options?: { allowStepUp?: boolean }) {
    const next = await refreshAuthFromApi(getAuth(), { includeMfa: true });
    const keepStepUp = Boolean(options?.allowStepUp) || stepUpVerifiedRef.current || stepUpSatisfies("aal2", next);
    setStepUpVerifiedThisVisit(keepStepUp);
    setAuthState(keepStepUp ? next : stripStepUpForFreshVisit(next));
    return next;
  }

  async function withSecurityTask(task: () => Promise<void>) {
    setSecurityBusy(true);
    setSecurityError("");
    setSecurityMessage("");
    try {
      await task();
    } catch (e: any) {
      const raw = String(e?.message || e || "");
      if (raw.includes("approver_name is required")) {
        setSecurityError("Session expired. Please Logout and login again, then retry Passkey setup.");
      } else {
        setSecurityError(normalizePasskeyUiError(raw));
      }
    } finally {
      setSecurityBusy(false);
    }
  }

  async function enrollPasskey() {
    await withSecurityTask(async () => {
      const start = await apiPost<{ options: any; state_token: string }>("/api/auth/webauthn/register/options", {
        friendly_name: "Current device",
      });
      const credential = await startPasskeyRegistration(start.options);
      await apiPost("/api/auth/webauthn/register/verify", {
        state_token: start.state_token,
        friendly_name: "Current device",
        credential,
      });
      await refreshSecurityState();
      setSecurityMessage("Passkey enrolled.");
    });
  }

  async function beginTotpEnrollment() {
    await withSecurityTask(async () => {
      const res = await apiPost<{ enrollment_token: string; secret: string; otpauth_uri: string }>("/api/auth/totp/enroll/start", {});
      setTotpEnrollment({
        enrollmentToken: res.enrollment_token,
        secret: res.secret,
        otpauthUri: res.otpauth_uri,
      });
      setSecurityMessage("Scan the TOTP secret, then verify it below.");
    });
  }

  async function verifyTotpEnrollment() {
    if (!totpEnrollment?.enrollmentToken) return;
    await withSecurityTask(async () => {
      await apiPost("/api/auth/totp/enroll/verify", {
        enrollment_token: totpEnrollment.enrollmentToken,
        code: totpEnrollmentCode.trim(),
      });
      setTotpEnrollment(null);
      setTotpEnrollmentCode("");
      await refreshSecurityState();
      setSecurityMessage("TOTP enrolled.");
    });
  }

  async function regenerateBackupCodes() {
    await withSecurityTask(async () => {
      const res = await apiPost<{ codes: string[] }>("/api/auth/backup-codes/regenerate", {});
      setBackupCodes(Array.isArray(res.codes) ? res.codes : []);
      await refreshSecurityState();
      setSecurityMessage("Backup codes regenerated.");
    });
  }

  async function runPasskeyStepUp() {
    await withSecurityTask(async () => {
      try {
        const start = await apiPost<{ options: any; state_token: string }>("/api/auth/webauthn/auth/options", {});
        const credential = await startPasskeyAuthentication(start.options);
        const res = await apiPost<{ step_up_token: string; mfa_level: "phishing_resistant"; method: string }>("/api/auth/webauthn/auth/verify", {
          state_token: start.state_token,
          credential,
        });
        setStepUpAuth({
          stepUpToken: res.step_up_token,
          stepUpLevel: res.mfa_level,
          stepUpMethod: res.method,
        });
        setStepUpVerifiedThisVisit(true);
        await refreshSecurityState({ allowStepUp: true });
        setSecurityMessage("Passkey verification complete.");
      } catch (e: any) {
        const msg = String(e?.message || e || "");
        if (/method not allowed|not found|404|405/i.test(msg)) {
          throw new Error("Passkey endpoint is unavailable on this server. Use PIN/TOTP/Backup code verification.");
        }
        throw e;
      }
    });
  }

  async function runPinStepUp() {
    await withSecurityTask(async () => {
      if (!pin.trim()) throw new Error("Enter Session PIN first.");
      const pinStep = await apiPost<{ step_up_token: string; mfa_level: "aal2"; method: string }>("/api/auth/step-up/pin", {
        pin: pin.trim(),
      });
      setStepUpAuth({
        stepUpToken: pinStep.step_up_token,
        stepUpLevel: pinStep.mfa_level,
        stepUpMethod: pinStep.method || "pin_reauth",
      });
      setStepUpVerifiedThisVisit(true);
      await refreshSecurityState({ allowStepUp: true });
      setSecurityMessage("PIN verification complete.");
    });
  }

  async function runTotpStepUp() {
    await withSecurityTask(async () => {
      const res = await apiPost<{ step_up_token: string; mfa_level: "aal2"; method: string }>("/api/auth/totp/step-up", {
        code: totpCode.trim(),
      });
      setStepUpAuth({
        stepUpToken: res.step_up_token,
        stepUpLevel: res.mfa_level,
        stepUpMethod: res.method,
      });
      setStepUpVerifiedThisVisit(true);
      setTotpCode("");
      await refreshSecurityState({ allowStepUp: true });
      setSecurityMessage("TOTP verification complete.");
    });
  }

  async function runBackupCodeStepUp() {
    await withSecurityTask(async () => {
      const res = await apiPost<{ step_up_token: string; mfa_level: "aal2"; method: string }>("/api/auth/backup-codes/step-up", {
        code: backupCode.trim(),
      });
      setStepUpAuth({
        stepUpToken: res.step_up_token,
        stepUpLevel: res.mfa_level,
        stepUpMethod: res.method,
      });
      setStepUpVerifiedThisVisit(true);
      setBackupCode("");
      await refreshSecurityState({ allowStepUp: true });
      setSecurityMessage("Backup code verification complete.");
    });
  }

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const next = await refreshAuthFromApi(getAuth(), { includeMfa: true });
      if (!cancelled) {
        const keepStepUp = stepUpSatisfies("aal2", next);
        setStepUpVerifiedThisVisit(keepStepUp);
        setAuthState(keepStepUp ? next : stripStepUpForFreshVisit(next));
        if (next?.staffName) setApproverName(next.staffName);
        if (next?.pin) setPin((current) => current || next.pin || "");
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  // Do not force-clear on window focus/visibility changes.
  // Native passkey dialogs can trigger focus events and cause repeated prompts.

  useEffect(() => {
    const id = window.setInterval(() => {
      void refreshSecurityState();
    }, 60_000);
    return () => {
      window.clearInterval(id);
    };
    // refreshSecurityState intentionally not in deps (stable polling behavior).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (analyticsTab === "staff" && !canViewStaffChannel) {
      if (canViewDubaiSalesChannel) setAnalyticsTab("dubaiSales");
      else if (canViewManilaSalesChannel) setAnalyticsTab("manilaSales");
      else if (canViewManagementPlChannel) setAnalyticsTab("finance");
      else if (canViewProcurementChannel) setAnalyticsTab("procurement");
    }
  }, [analyticsTab, canViewDubaiSalesChannel, canViewManagementPlChannel, canViewManilaSalesChannel, canViewProcurementChannel, canViewStaffChannel]);

  useEffect(() => {
    if (analyticsTab === "dubaiSales" && !canViewDubaiSalesChannel) {
      if (canViewManilaSalesChannel) setAnalyticsTab("manilaSales");
      else if (canViewStaffChannel) setAnalyticsTab("staff");
      else if (canViewManagementPlChannel) setAnalyticsTab("finance");
    }
    if (analyticsTab === "manilaSales" && !canViewManilaSalesChannel) {
      if (canViewDubaiSalesChannel) setAnalyticsTab("dubaiSales");
      else if (canViewStaffChannel) setAnalyticsTab("staff");
      else if (canViewManagementPlChannel) setAnalyticsTab("finance");
    }
    if (analyticsTab === "procurement" && !canViewProcurementChannel) {
      if (canViewDubaiSalesChannel) setAnalyticsTab("dubaiSales");
      else if (canViewManilaSalesChannel) setAnalyticsTab("manilaSales");
      else if (canViewStaffChannel) setAnalyticsTab("staff");
      else if (canViewManagementPlChannel) setAnalyticsTab("finance");
    }
  }, [analyticsTab, canViewDubaiSalesChannel, canViewManagementPlChannel, canViewManilaSalesChannel, canViewProcurementChannel, canViewStaffChannel]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const requestedTab = String(new URLSearchParams(window.location.search).get("tab") || "").trim();
    if (!requestedTab) return;
    if (requestedTab === "staff" && canViewStaffChannel) {
      setAnalyticsTab("staff");
      return;
    }
    if (requestedTab === "dubaiSales" && canViewDubaiSalesChannel) {
      setAnalyticsTab("dubaiSales");
      return;
    }
    if (requestedTab === "manilaSales" && canViewManilaSalesChannel) {
      setAnalyticsTab("manilaSales");
      return;
    }
    if (requestedTab === "evaluation" && canViewEvaluationChannel) {
      setAnalyticsTab("evaluation");
      return;
    }
    if (requestedTab === "finance" && canViewManagementPlChannel) {
      setAnalyticsTab("finance");
      return;
    }
    if (requestedTab === "procurement" && canViewProcurementChannel) {
      setAnalyticsTab("procurement");
    }
  }, [
    canViewDubaiSalesChannel,
    canViewEvaluationChannel,
    canViewManagementPlChannel,
    canViewManilaSalesChannel,
    canViewProcurementChannel,
    canViewStaffChannel,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.pathname !== "/admin/analytics") return;
    if (url.searchParams.get("tab") === analyticsTab) return;
    url.searchParams.set("tab", analyticsTab);
    window.history.replaceState({}, "", `${url.pathname}?${url.searchParams.toString()}`);
  }, [analyticsTab]);

  useEffect(() => {
    if (!isSalesAnalyticsTab || salesSectionView === "all" || typeof window === "undefined") return;
    const section = visibleSalesSectionOptions.find((item) => item.value === salesSectionView);
    if (!section) return;
    window.requestAnimationFrame(() => scrollToSection(section.id));
  }, [isSalesAnalyticsTab, salesSectionView, visibleSalesSectionOptions]);

  useEffect(() => {
    setSalesSectionView((current) => {
      if (isManilaSalesCity) return current === "manilaSales" ? current : "manilaSales";
      return current === "manilaSales" ? "summary" : current;
    });
  }, [isManilaSalesCity]);

  useEffect(() => {
    if (analyticsTab !== "finance" || financeSectionView === "all" || typeof window === "undefined") return;
    const section = FINANCE_SECTION_OPTIONS.find((item) => item.value === financeSectionView);
    if (!section) return;
    window.requestAnimationFrame(() => scrollToSection(section.id));
  }, [analyticsTab, financeSectionView]);

  useEffect(() => {
    if (analyticsTab !== "evaluation" || evaluationSectionView === "all" || typeof window === "undefined") return;
    const section = EVALUATION_SECTION_OPTIONS.find((item) => item.value === evaluationSectionView);
    if (!section) return;
    window.requestAnimationFrame(() => scrollToSection(section.id));
  }, [analyticsTab, evaluationSectionView]);

  useEffect(() => {
    if (analyticsTab !== "evaluation") return;
    if (!approverName.trim() || !salesStepUpReady) return;
    if (summaryDateFrom !== summaryDateTo) return;
    if (city === "manila") return;
    const normalized = summaryDateFrom;
    setEvaluationDetailDate(normalized);
    const qs = new URLSearchParams({
      city,
      target_date: normalized,
      approver_name: approverName.trim(),
      pin: pin.trim(),
    });
    void apiGet<EvaluationDayDetailsResp>(`/api/admin/evaluation/day-details?${qs.toString()}`)
      .then((res) => {
        setEvaluationDayDetails(res || null);
        if (res?.warnings?.length) {
          setEvaluationWarnings((prev) => Array.from(new Set([...(prev || []), ...res.warnings])));
        }
      })
      .catch(() => {
        setEvaluationDayDetails(null);
      });
  }, [analyticsTab, summaryDateFrom, summaryDateTo, city, approverName, pin, salesStepUpReady]);

  useEffect(() => {
    if (!isHQOrAdmin && financeSectionView === "payroll") {
      setFinanceSectionView("summary");
    }
  }, [isHQOrAdmin, financeSectionView]);

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
    if (!approverName.trim() || !financeStepUpReady) return;
    void loadAll("finance");
    // `loadAll()` is intentionally triggered by tab, scope, and credentials changes.
    // It is recreated on render, so we avoid depending on its function identity here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyticsTab, plStoreName, approverName, financeStepUpReady]);

  useEffect(() => {
    if (!isSalesAnalyticsTab) return;
    if (isManilaSalesCity) return;
    if (!approverName.trim() || !salesStepUpReady) return;
    void loadAll("sales");
    // `loadAll()` is intentionally triggered by tab, scope, and credentials changes.
    // It is recreated on render, so we avoid depending on its function identity here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSalesAnalyticsTab, isManilaSalesCity, hourlyStoreName, summaryBranchCode, summaryBrandName, approverName, salesStepUpReady, analyticsTab]);

  useEffect(() => {
    if (analyticsTab !== "evaluation") return;
    if (!approverName.trim() || !salesStepUpReady) return;
    void loadAll("evaluation");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyticsTab, city, summaryDateFrom, summaryDateTo, approverName, salesStepUpReady]);

  async function loadAll(scope: "all" | "sales" | "staff" | "evaluation" | "finance" = "all"): Promise<string[]> {
    setLoading(true);
    setError("");
    const loadErrors: string[] = [];
    const addLoadError = (label: string, e: unknown) => {
      const msg = String((e as any)?.message || e || "Request failed");
      loadErrors.push(`${label}: ${msg}`);
    };
    const shouldLoadPos = scope === "all" || scope === "sales" || scope === "finance";
    const shouldLoadStaff = scope === "all" || scope === "staff" || scope === "finance";
    const shouldLoadEvaluation = scope === "all" || scope === "evaluation";
    const shouldLoadFinance = scope === "all" || scope === "finance";
    const posCity: City = scope === "sales" ? salesCity : ((city as City) || "dubai");

    try {
      const posDailyQs = new URLSearchParams({
        city: posCity,
        date_from: summaryDateFrom,
        date_to: summaryDateTo,
        branch_code: summaryBranchCode,
        brand_name: summaryBrandName,
        limit: "1000",
        approver_name: approverName.trim(),
        pin: pin.trim(),
      });

      const posRankingQs = new URLSearchParams({
        city: posCity,
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
            city: posCity,
            date_from: summaryDateFrom,
            date_to: summaryDateTo,
            approver_name: approverName.trim(),
            pin: pin.trim(),
          });
          if (hourlyStoreName.trim()) hourlyQs.set("store_name", hourlyStoreName.trim());
          const salesPlQs = new URLSearchParams({
            city: posCity,
            date_from: summaryDateFrom,
            date_to: summaryDateTo,
            approver_name: approverName.trim(),
            pin: pin.trim(),
          });
          const cancelOrdersQs = new URLSearchParams({
            city: posCity,
            date_from: summaryDateFrom,
            date_to: summaryDateTo,
            brand_name: summaryBrandName,
            limit_daily: "365",
            approver_name: approverName.trim(),
            pin: pin.trim(),
          });
          const operationTimeQs = new URLSearchParams({
            city: posCity,
            date_from: summaryDateFrom,
            date_to: summaryDateTo,
            limit: "400",
            approver_name: approverName.trim(),
            pin: pin.trim(),
          });

          const loadSalesDataset = async <T,>(
            label: string,
            request: () => Promise<T>,
            onOk: (value: T) => void,
            onFail: () => void
          ) => {
            try {
              onOk(await request());
            } catch (e) {
              addLoadError(label, e);
              onFail();
            }
          };

          await Promise.all([
            loadSalesDataset(
              "Sales daily",
              () => apiGet<PosSalesDailyResp>(`/api/admin/pos/sales/daily?${posDailyQs.toString()}`),
              (posDaily) => {
                setPosSalesRows(posDaily.items || []);
                setPosSalesRangeTotals(posDaily.totals ?? null);
              },
              () => {
                setPosSalesRows([]);
                setPosSalesRangeTotals(null);
              }
            ),
            loadSalesDataset(
              "Menu ranking",
              () => apiGet<PosMenuRankingResp>(`/api/admin/pos/items/ranking?${posRankingQs.toString()}`),
              (posRanking) => setPosMenuRankingRows(posRanking.items || []),
              () => setPosMenuRankingRows([])
            ),
            loadSalesDataset(
              "Product mix",
              () => apiGet<ProductMixRankingResp>(`/api/admin/pos/product-mix?${posRankingQs.toString()}`),
              (productMix) => {
                setProductMixRankingRows(productMix.items || []);
                setProductMixCoverage({
                  from: productMix.coverage_from ?? null,
                  to: productMix.coverage_to ?? null,
                  source: productMix.source_file_name || "",
                });
              },
              () => {
                setProductMixRankingRows([]);
                setProductMixCoverage({});
              }
            ),
            loadSalesDataset(
              "Branch ranking",
              () => apiGet<PosBranchOrderResp>(`/api/admin/pos/branches/orders?${posRankingQs.toString()}`),
              (posBranches) => setPosBranchOrderRows(posBranches.items || []),
              () => setPosBranchOrderRows([])
            ),
            loadSalesDataset(
              "Brand ranking",
              () => apiGet<PosBrandOrderResp>(`/api/admin/pos/brands/orders?${posRankingQs.toString()}`),
              (posBrands) => setPosBrandOrderRows(posBrands.items || []),
              () => setPosBrandOrderRows([])
            ),
            loadSalesDataset(
              "Branch daily",
              () => apiGet<PosBranchDailyResp>(`/api/admin/pos/branches/daily?${posDailyQs.toString()}`),
              (posBranchesDaily) => setPosBranchDailyRows(posBranchesDaily.items || []),
              () => setPosBranchDailyRows([])
            ),
            loadSalesDataset(
              "Cancel orders",
              () => apiGet<PosCancelOrdersResp>(`/api/admin/pos/cancel-orders?${cancelOrdersQs.toString()}`),
              (cancelOrders) => setCancelOrdersAnalytics(cancelOrders ?? null),
              () => setCancelOrdersAnalytics(null)
            ),
          ]);
          if (canViewFinanceChannels && financeStepUpReady) {
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
          try {
            const operationTime = await apiGet<OperationTimeResp>(`/api/admin/pos/operation-time?${operationTimeQs.toString()}`);
            setOperationTimeAnalytics(operationTime ?? null);
            setOperationTimeLoadError("");
          } catch (e) {
            setOperationTimeAnalytics(null);
            setOperationTimeLoadError(String((e as any)?.message || e || "Operation time unavailable"));
          }
        } catch (e) {
          addLoadError("Sales analytics", e);
          setPosSalesRows([]);
          setPosSalesRangeTotals(null);
          setPosMenuRankingRows([]);
          setProductMixRankingRows([]);
          setProductMixCoverage({});
          setPosBranchOrderRows([]);
          setPosBrandOrderRows([]);
          setPosBranchDailyRows([]);
          setCancelOrdersAnalytics(null);
          setOperationTimeAnalytics(null);
          setOperationTimeLoadError("");
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
        if (!canViewFinanceChannels || !financeStepUpReady) {
          setPayrollRows([]);
          setFinanceRatio(null);
          setPlVsTarget(null);
          setBreakEven(null);
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
            if (!isHQOrAdmin) {
              setPayrollRows([]);
              return;
            }
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
          (async () => {
            try {
              const breakEvenQs = new URLSearchParams({
                city,
                approver_name: approverName.trim(),
                pin: pin.trim(),
              });
              if (plStoreName.trim()) breakEvenQs.set("store_name", plStoreName.trim());
              const breakEvenRes = await apiGet<BreakEvenResp>(`/api/admin/finance/break-even?${breakEvenQs.toString()}`);
              setBreakEven(breakEvenRes || null);
            } catch (e) {
              addLoadError("Management P&L (Break-even)", e);
              setBreakEven(null);
            }
          })(),
        ]);
      })();

      const evaluationLoad = (async () => {
        if (!shouldLoadEvaluation) return;
        if (!canViewEvaluationChannel) {
          setEvaluationSummary(null);
          setEvaluationStores([]);
          setEvaluationSections([]);
          setEvaluationWarnings([]);
          setEvaluationRules([]);
          setEvaluationTimeline(null);
          setEvaluationDayDetails(null);
          setEvaluationStrictnessLevel(5);
          setCctvScoreRows([]);
          setCctvScoreLoadError("");
          return;
        }
        const cctvQs = new URLSearchParams({
          city,
          date_from: summaryDateFrom,
          date_to: summaryDateTo,
        });
        try {
          const cctvRes = await apiGet<CctvScoreSummaryResp>(`/api/admin/cctv/score_summary?${cctvQs.toString()}`);
          setCctvScoreRows(cctvRes.rows || []);
          setCctvScoreLoadError("");
        } catch (e) {
          setCctvScoreRows([]);
          setCctvScoreLoadError(String((e as any)?.message || e || "CCTV score unavailable"));
        }
        if (city === "manila") {
          const underConstructionSections: EvaluationSection[] = [
            { section_key: "attendance", section_label: "Attendance Score", status: "under_construction", description: "Dubai only for now.", display_order: 10 },
            { section_key: "operation", section_label: "Operation Score", status: "under_construction", description: "Dubai only for now.", display_order: 20 },
            { section_key: "disposal", section_label: "Disposal", status: "under_construction", description: "Dubai only for now.", display_order: 25 },
            { section_key: "backup", section_label: "Backup", status: "under_construction", description: "Dubai only for now.", display_order: 27 },
            { section_key: "food_cost", section_label: "Food Cost", status: "under_construction", description: "Dubai only for now.", display_order: 30 },
            { section_key: "purchasing", section_label: "Purchasing", status: "under_construction", description: "Data source will be connected later.", display_order: 40 },
            { section_key: "inventory_accuracy", section_label: "Inventory Accuracy", status: "under_construction", description: "Theory vs actual inventory will be added later.", display_order: 50 },
          ];
          setEvaluationSummary({
            store_count: 0,
            overall_avg_score: null,
            attendance_avg_score: null,
            operation_avg_score: null,
            food_cost_avg_score: null,
            operation_time_avg_minutes: null,
            warning_count: 1,
          });
          setEvaluationStores([]);
          setEvaluationSections(underConstructionSections);
          setEvaluationWarnings(["Manila evaluation is under construction. Evaluation data is available for Dubai only at this stage."]);
          setEvaluationRules([]);
          setEvaluationTimeline(null);
          setEvaluationDayDetails(null);
          setEvaluationStrictnessLevel(5);
          setEvaluationRuleMessage("");
          return;
        }
        try {
          const evaluationQs = new URLSearchParams({
            city,
            date_from: summaryDateFrom,
            date_to: summaryDateTo,
            approver_name: approverName.trim(),
            pin: pin.trim(),
          });
          const [evaluationStoresRes, evaluationRulesRes] = await Promise.all([
            apiGet<EvaluationStoresResp>(`/api/admin/evaluation/stores?${evaluationQs.toString()}`),
            apiGet<EvaluationRulesResp>(`/api/admin/evaluation/rules?${evaluationQs.toString()}`),
          ]);
          setEvaluationSummary(evaluationStoresRes.summary ?? null);
          setEvaluationStores(evaluationStoresRes.stores || []);
          setEvaluationSections(evaluationStoresRes.sections || evaluationRulesRes.sections || []);
          setEvaluationWarnings(Array.from(new Set(evaluationStoresRes.warnings || [])));
          setEvaluationRules(evaluationRulesRes.rules || []);
          setEvaluationTimeline(null);
          setEvaluationDayDetails(null);
          setEvaluationDetailDate(summaryDateTo);
          setEvaluationStrictnessLevel(getEvaluationStrictnessLevel(evaluationRulesRes.settings));
          setEvaluationRuleMessage("");
          if (summaryDateFrom === summaryDateTo) {
            await refreshEvaluationDayDetails(summaryDateTo);
          }
        } catch (e) {
          addLoadError("Evaluation", e);
          setEvaluationSummary(null);
          setEvaluationStores([]);
          setEvaluationSections([]);
          setEvaluationWarnings([]);
          setEvaluationRules([]);
          setEvaluationTimeline(null);
          setEvaluationDayDetails(null);
          setEvaluationStrictnessLevel(5);
        }
      })();

      await Promise.all([posLoad, staffLoad, evaluationLoad, financeLoad]);
      setError(loadErrors.join(" | "));
      return loadErrors;
    } catch (e: any) {
      const msg = String(e?.message || e || "Failed to load analytics");
      setError(msg);
      return [msg];
    } finally {
      setLoading(false);
    }
  }

  async function saveEvaluationRules() {
    if (!isHQOrAdmin || !approverName.trim() || !salesStepUpReady) return;
    setEvaluationSavingRules(true);
    setEvaluationRuleMessage("");
    try {
      const res = await apiPost<EvaluationSettingsResp>(
        "/api/admin/evaluation/settings",
        {
          approver_name: approverName.trim(),
          pin: pin.trim(),
          strictness_level: evaluationStrictnessLevel,
        },
      );
      setEvaluationStrictnessLevel(getEvaluationStrictnessLevel(res.settings));
      setEvaluationRuleMessage(`Saved strictness level ${getEvaluationStrictnessLevel(res.settings)}.`);
      await loadAll("evaluation");
    } catch (e) {
      setEvaluationRuleMessage(String((e as Error)?.message || e || "Failed to save rules"));
    } finally {
      setEvaluationSavingRules(false);
    }
  }

  async function refreshEvaluationDayDetails(targetDate: string) {
    if (!approverName.trim() || !salesStepUpReady) return;
    const normalized = (targetDate || "").trim() || summaryDateTo;
    setEvaluationDetailDate(normalized);
    try {
      const qs = new URLSearchParams({
        city,
        target_date: normalized,
        approver_name: approverName.trim(),
        pin: pin.trim(),
      });
      const res = await apiGet<EvaluationDayDetailsResp>(`/api/admin/evaluation/day-details?${qs.toString()}`);
      setEvaluationDayDetails(res || null);
      if (res?.warnings?.length) {
        setEvaluationWarnings((prev) => Array.from(new Set([...(prev || []), ...res.warnings])));
      }
    } catch (e) {
      setError(String((e as Error)?.message || e || "Failed to load daily report details"));
      setEvaluationDayDetails(null);
    }
  }

  async function refreshEvaluationTimeline() {
    if (!approverName.trim() || !salesStepUpReady) return;
    const chunks = splitDateRangeIntoChunks(summaryDateFrom, summaryDateTo, 3);
    if (!chunks.length) {
      setEvaluationTimeline(null);
      return;
    }
    try {
      const mergedDays: EvaluationTimelineDay[] = [];
      const mergedStoreMap = new Map<string, string>();
      const warnings: string[] = [];
      for (const chunk of chunks) {
        const qs = new URLSearchParams({
          city,
          date_from: chunk.from,
          date_to: chunk.to,
          approver_name: approverName.trim(),
          pin: pin.trim(),
        });
        const res = await apiGet<EvaluationTimelineResp>(`/api/admin/evaluation/timeline?${qs.toString()}`);
        for (const store of res.stores || []) mergedStoreMap.set(store.branch_code, store.branch_name);
        mergedDays.push(...(res.days || []));
        warnings.push(...(res.warnings || []));
      }
      const uniqDays = Array.from(
        new Map(mergedDays.map((d) => [d.date, d])).values()
      ).sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const stores = Array.from(mergedStoreMap.entries())
        .map(([branch_code, branch_name]) => ({ branch_code, branch_name }))
        .sort((a, b) => a.branch_name.localeCompare(b.branch_name));
      setEvaluationTimeline({
        ok: true,
        city,
        date_from: summaryDateFrom,
        date_to: summaryDateTo,
        stores,
        days: uniqDays,
        warnings: Array.from(new Set(warnings)),
      });
      if (warnings.length) {
        setEvaluationWarnings((prev) => Array.from(new Set([...(prev || []), ...warnings])));
      }
    } catch (e) {
      setError(String((e as Error)?.message || e || "Failed to load daily timeline"));
      setEvaluationTimeline(null);
    }
  }

  async function syncPlFromGoogle() {
    if (!approverName.trim() || !financeStepUpReady) return;
    setPlSyncing(true);
    setPlSyncMessage("");
    try {
      const res = await apiPost<{
        ok?: boolean;
        results?: Array<{
          city?: string;
          months_synced?: number;
          months?: Array<{ month_key?: string; line_count?: number }>;
        }>;
      }>("/api/admin/pl/sync/from-google", {
        approver_name: approverName.trim(),
        pin: pin.trim(),
        city,
      });

      const cityResult = (res?.results || [])[0];
      const monthItems = Array.isArray(cityResult?.months) ? cityResult!.months : [];
      const monthsSynced = Number(cityResult?.months_synced || monthItems.length || 0);
      const monthKeys = monthItems.map((m) => String(m?.month_key || "").trim()).filter(Boolean);
      const monthLabel = monthKeys.length ? `${monthKeys[0]} - ${monthKeys[monthKeys.length - 1]}` : "months";
      setPlSyncMessage(`Synced ${monthsSynced} month tabs (${monthLabel}). Refreshing...`);
      const refreshResult = await Promise.race<"done" | "timeout">([
        loadAll("finance").then(() => "done"),
        new Promise<"timeout">((resolve) => {
          window.setTimeout(() => resolve("timeout"), 15000);
        }),
      ]);
      if (refreshResult === "done") {
        setPlSyncMessage(`Synced ${monthsSynced} month tabs (${monthLabel}). Updated.`);
      } else {
        setPlSyncMessage(
          `Synced ${monthsSynced} month tabs (${monthLabel}). Data refresh is taking longer than usual; please press Refresh P&L once.`
        );
      }
    } catch (e) {
      setPlSyncMessage(String((e as Error)?.message || e || "P&L sync failed"));
    } finally {
      setPlSyncing(false);
    }
  }

  async function reloadSalesAfterSync(baseMessage: string): Promise<string> {
    const loadErrors = await loadAll("sales");
    if (loadErrors.length) {
      return `${baseMessage} Refresh warning: ${loadErrors[0]}`;
    }
    return `${baseMessage} Reloaded data.`;
  }

  async function waitForSalesSyncJob(jobId: string, baseMessage: string): Promise<PosSyncJob> {
    let lastError = "";
    for (let attempt = 0; attempt < 240; attempt += 1) {
      try {
        const qs = new URLSearchParams({
          approver_name: approverName.trim(),
          pin: pin.trim(),
          city: salesCity,
        });
        const res = await apiGet<{ ok?: boolean; job?: PosSyncJob }>(
          `/api/admin/pos/sync-jobs/${encodeURIComponent(jobId)}?${qs.toString()}`
        );
        const job = res?.job;
        if (!job?.id) throw new Error("POS sync job status is unavailable.");
        setSalesSyncMessage(formatPosSyncJobMessage(job, baseMessage));
        const status = String(job.status || "").toUpperCase();
        if (status === "COMPLETED" || status === "COMPLETED_WITH_WARNINGS" || status === "FAILED") {
          return job;
        }
        lastError = "";
      } catch (e: any) {
        lastError = String(e?.message || e || "Polling failed");
        setSalesSyncMessage(`${baseMessage}\nPolling warning: ${lastError}`);
      }
      await sleep(3000);
    }
    throw new Error(lastError || "Sales sync is still running. Please check again shortly.");
  }

  async function syncSalesNow() {
    if (!approverName.trim() || !salesStepUpReady) return;
    setSalesSyncing(true);
    setSalesSyncMessage("");
    try {
      const payload = {
        approver_name: approverName.trim(),
        pin: pin.trim(),
        city_hint: salesCity,
      };
      const start = await apiPost<PosSyncJobResp>("/api/admin/pos/sync/start", payload);
      const job = start?.job;
      if (!job?.id) {
        throw new Error(String(start?.message || "POS sync job could not be started"));
      }
      const baseMessage = String(start?.message || "").trim();
      setSalesSyncMessage(formatPosSyncJobMessage(job, baseMessage));
      const finalJob = await waitForSalesSyncJob(job.id, baseMessage);
      const finalStatus = String(finalJob.status || "").toUpperCase();
      const finalMessage = formatPosSyncJobMessage(finalJob, baseMessage);
      if (finalStatus === "COMPLETED" || finalStatus === "COMPLETED_WITH_WARNINGS") {
        setSalesSyncMessage(await reloadSalesAfterSync(finalMessage));
      } else {
        setSalesSyncMessage(finalMessage);
      }
    } catch (e: any) {
      setSalesSyncMessage(String(e?.message || e || "POS sync failed"));
    } finally {
      setSalesSyncing(false);
    }
  }

  async function syncPayrollNow() {
    if (!approverName.trim() || !financeStepUpReady) return;
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
    if (!salesStepUpReady) {
      setComparisonError("Security verification is required.");
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

    if (diffDays > 45) {
      setComparisonNotice("Compliance analytics supports up to 45 days at a time.");
      setComparisonLoadedOnce(true);
      return;
    }

    setComparisonLoading(true);
    setComparisonError("");
    setComparisonNotice("");

    try {
      const requestedLimit = Number.parseInt(String(comparisonLimit || ""), 10);
      const safeLimit = Number.isFinite(requestedLimit) ? Math.max(100, Math.min(1500, requestedLimit)) : 1000;
      const chunks = splitDateRangeIntoChunks(dateFrom, dateTo, 7);
      const allItems: ComparisonItem[] = [];
      let maybeTruncated = false;

      for (const chunk of chunks) {
        const qs = new URLSearchParams({
          city: city === "dubai" ? "Dubai" : "Manila",
          date_from: chunk.from,
          date_to: chunk.to,
          limit: String(safeLimit),
          approver_name: approverName.trim(),
          pin: pin.trim(),
        });
        if (branchCode) qs.set("branch", branchCode);
        const res = await apiGet<ComparisonResp>(`/api/admin/attendance/comparison?${qs.toString()}`);
        const items = Array.isArray(res?.items) ? res.items : [];
        if (items.length >= safeLimit) maybeTruncated = true;
        allItems.push(...items);
      }

      const dedupedMap = new Map<string, ComparisonItem>();
      for (const row of allItems) {
        const key = [
          row.work_date || "",
          row.staff_name || row.employee_name_raw || "",
          row.scheduled_branch_code || "",
          row.attendance_branch_code || "",
          row.effective_status_raw || "",
          row.absence_type || "",
        ].join("|");
        if (!dedupedMap.has(key)) dedupedMap.set(key, row);
      }
      setComparisonRows(Array.from(dedupedMap.values()));
      if (maybeTruncated) {
        setComparisonNotice("Some rows were truncated by server-side limits. Narrow the date range for full accuracy.");
      }
    } catch (e: any) {
      setComparisonRows([]);
      setComparisonError(e?.message || String(e));
    } finally {
      setComparisonLoadedOnce(true);
      setComparisonLoading(false);
    }
  }

  useEffect(() => {
    if (!approverName.trim() || !salesStepUpReady) return;
    if (canViewStaffChannel) loadComparison();
    // Management roles cannot call staff analytics APIs (HQ/ADMIN only) — avoid 403/500 noise on load.
    if (canViewStaffChannel) void loadAll("staff");
    else void loadAll("sales");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewStaffChannel, approverName, salesStepUpReady]);

  // Keep compliance reload manual to avoid repeated heavy calls while editing dates/month.

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
      aggregators: (row.aggregators || []).map((aggregator) => ({
        aggregator_name: String(aggregator.aggregator_name || "").trim() || "Unknown",
        order_count_non_cancelled: Number(aggregator.order_count_non_cancelled || 0),
        gross_revenue: Number(aggregator.gross_revenue || 0),
        net_revenue: Number(aggregator.net_revenue || 0),
      })),
    }));
  }, [posBrandOrderRows]);

  const salesBrandOptions = useMemo(() => {
    const fixedDubaiBrands = [
      { value: "", label: "Company total" },
      { value: "SushiZEN", label: "SushiZEN" },
      { value: "RamenZEN", label: "RamenZEN" },
      { value: "All Veggie Sushi", label: "All Veggie Sushi" },
    ];
    if (salesCity === "dubai") return fixedDubaiBrands;
    const fromApi = posBrandOrderRows
      .map((row) => String(row.brand_name || "").trim())
      .filter(Boolean);
    return [{ value: "", label: "Company total" }].concat(
      Array.from(new Set(fromApi))
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ value: name, label: name })),
    );
  }, [salesCity, posBrandOrderRows]);

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

    const merged = [...fromPl, ...fromPos, ...fromBranchConfig].filter((name) => isStoreInCity(name, city));
    const deduped = new Map<string, string>();
    for (const name of merged) {
      const key = storeIdentityKey(name);
      if (deduped.has(key)) continue;
      const code = mapStoreToBranchCode(name);
      deduped.set(key, code ? branchLabelFromCode(code, city) : name);
    }
    return Array.from(deduped.values())
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name }));
  }, [city, plVsTarget?.available_stores, posBranchOrderRows]);

  const hourlyStoreOptions = useMemo(() => {
    const fromApi = (hourlySalesAnalytics?.available_stores || []).map((s) => String(s || "").trim()).filter(Boolean);
    const fromPos = posBranchOrderRows.map((r) => String(r.branch_name || "").trim()).filter(Boolean);
    const fromBranchConfig = (BRANCH_OPTIONS[salesCity] || [])
      .filter((opt) => opt.value)
      .map((opt) => opt.label);
    if (salesCity === "dubai") {
      return DUBAI_PL_SCOPE_CODES.map((code) => ({
        value: branchLabelFromCode(code, salesCity),
        label: branchLabelFromCode(code, salesCity),
      }));
    }
    return Array.from(new Set([...fromApi, ...fromPos, ...fromBranchConfig].filter((name) => isStoreInCity(name, salesCity))))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name }));
  }, [salesCity, hourlySalesAnalytics?.available_stores, posBranchOrderRows]);

  const hourlySummary = useMemo(() => {
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

  const operationTimeSummary = useMemo(() => {
    const summary = operationTimeAnalytics?.summary;
    const latest = operationTimeAnalytics?.latest || null;
    return {
      dayCount: Number(summary?.day_count || 0),
      avgOverallMinutes: summary?.avg_overall_completion_minutes ?? null,
      avgAcknowledgingSeconds: summary?.avg_acknowledging_seconds ?? null,
      avgPreparingMinutes: summary?.avg_preparing_minutes ?? null,
      avgDispatchingMinutes: summary?.avg_dispatching_minutes ?? null,
      avgDeliveringMinutes: summary?.avg_delivering_minutes ?? null,
      latest,
    };
  }, [operationTimeAnalytics]);

  const cancelOrderSummary = useMemo(() => {
    const summary = cancelOrdersAnalytics?.summary;
    return {
      lostOrderCount: Number(summary?.lost_order_count || 0),
      lostRevenue: Number(summary?.lost_revenue || 0),
      dayCount: Number(summary?.day_count || 0),
      orderTypeCount: Number(summary?.order_type_count || 0),
      platformCount: Number(summary?.platform_count || 0),
    };
  }, [cancelOrdersAnalytics]);

  const hourlyTrendMaxOrders = useMemo(() => {
    return Math.max(...(hourlySalesAnalytics?.rows || []).map((row) => Number(row.order_count_non_cancelled || 0)), 1);
  }, [hourlySalesAnalytics?.rows]);

  /** Same calendar months as `/api/admin/finance/labor-ratio` + Payroll tab totals (Summary From/To). */
  const payrollRowsInRange = useMemo(() => {
    const months = new Set(monthKeysBetween(summaryDateFrom, summaryDateTo));
    if (!months.size) return payrollRows;
    return payrollRows.filter((r) => months.has(String(r.month_key || "")));
  }, [payrollRows, summaryDateFrom, summaryDateTo]);

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

  const exportBaseName = `${isSalesAnalyticsTab ? salesCity : city}_${summaryDateFrom}_to_${summaryDateTo}${summaryBrandName ? `_${summaryBrandName.replace(/\s+/g, "_")}` : ""}${summaryBranchCode ? `_${summaryBranchCode}` : ""}`;

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
  const pageTitle =
    analyticsTab === "staff"
      ? "Analytics"
      : analyticsTab === "dubaiSales"
        ? "Dubai Sales Analytics"
        : analyticsTab === "manilaSales"
          ? "Manila Sales Analytics"
          : analyticsTab === "procurement"
            ? "Procurement Analytics"
            : analyticsTab === "evaluation"
              ? "Evaluation Channel"
              : "Management P&L Channel";
  const analyticsTabs: Array<{
    key: "staff" | "dubaiSales" | "manilaSales" | "evaluation" | "finance" | "procurement";
    label: string;
    visible: boolean;
  }> = [
    { key: "staff", label: "Analytics", visible: canViewStaffChannel },
    { key: "dubaiSales", label: "Dubai Sales Analytics", visible: canViewDubaiSalesChannel && canViewFinanceChannels },
    { key: "manilaSales", label: "Manila Sales Analytics", visible: canViewManilaSalesChannel && canViewFinanceChannels },
    { key: "evaluation", label: "Evaluation", visible: canViewEvaluationChannel && canViewFinanceChannels },
    { key: "finance", label: "Management P&L", visible: canViewManagementPlChannel },
    { key: "procurement", label: "Procurement Analytics", visible: canViewFinanceChannels },
  ];
  const passkeyCount = Number(auth?.mfa?.passkeyCount || 0);
  const totpStatus = auth?.mfa?.totpEnabled ? "Enabled" : "Not set";
  const backupCount = Number(auth?.mfa?.backupCodesRemaining || 0);
  const mfaRequired = !activeSecuritySatisfied && activeSecurityRequirement !== "Login";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="mx-auto max-w-5xl space-y-6 px-4 py-8"
    >
        <motion.div
          key={analyticsTab}
          className="space-y-6"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={tabContentTransition}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/20 to-purple-500/10">
              <BarChart2 className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <h1 className={PAGE_TITLE}>{pageTitle}</h1>
              <p className={SUBTEXT}>
                Unified operations analytics across attendance, sales, evaluation, payroll, and management finance.
              </p>
            </div>
          </div>

          <div className={TAB_CONTAINER}>
            {analyticsTabs.filter((tab) => tab.visible).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setError("");
                  setAnalyticsTab(tab.key);
                }}
                className={analyticsTab === tab.key ? TAB_ACTIVE : TAB_INACTIVE}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {error ? (
            <div className={`${HIGHLIGHT_CARD} px-4 py-3 text-sm text-amber-100`}>
              {error}
            </div>
          ) : null}

          {!hasVisibleAnalyticsChannel ? (
            <div className={`${HIGHLIGHT_CARD} px-4 py-3 text-sm text-amber-100`}>
              No analytics channels are available for your current role. If you need access, please contact HQ or ADMIN.
            </div>
          ) : null}

          {canViewSalesChannel || canViewManagementPlChannel ? (
            <div className={GLASS_CARD + " p-5"}>
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-violet-400" />
                <h2 className={SECTION_TITLE}>Security</h2>
              </div>
              <p className={BODY_TEXT + " mb-1"}>
                Passkeys are recommended. Sales, Evaluation, and Management P&amp;L require recent MFA.
              </p>
              <p className={SUBTEXT + " mb-1"}>
                Passkeys: {passkeyCount} | TOTP: {totpStatus} | Backup codes: {backupCount}
              </p>
              <p className={SUBTEXT + " mb-3"}>
                Current verification: {auth?.stepUpLevel || "aal1"}
                {auth?.stepUpMethod ? ` via ${auth.stepUpMethod}` : ""}
                {auth?.stepUpVerifiedAt ? ` at ${auth.stepUpVerifiedAt}` : ""}
              </p>

              {mfaRequired ? (
                <div className={BADGE_WARNING + " mb-4 px-3 py-1.5 text-xs"}>
                  <AlertTriangle className="h-3.5 w-3.5" />
                  This tab needs MFA (Passkey, TOTP, Backup code, or PIN step-up).
                </div>
              ) : (
                <div className={BADGE_SUCCESS + " mb-4 px-3 py-1.5 text-xs"}>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Access ready for {pageTitle}.
                </div>
              )}

              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void enrollPasskey()}
                  disabled={securityBusy}
                  className={SECONDARY_BUTTON + " flex items-center gap-2 text-sm"}
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  Enroll Passkey
                </button>
                <button
                  type="button"
                  onClick={() => void beginTotpEnrollment()}
                  disabled={securityBusy}
                  className={SECONDARY_BUTTON + " flex items-center gap-2 text-sm"}
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  Enroll TOTP
                </button>
                <button
                  type="button"
                  onClick={() => void regenerateBackupCodes()}
                  disabled={securityBusy}
                  className={SECONDARY_BUTTON + " flex items-center gap-2 text-sm"}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Backup Codes
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearStepUpAuth();
                    setStepUpVerifiedThisVisit(false);
                    setAuthState(getAuth());
                    setSecurityMessage("Security verification cleared.");
                  }}
                  disabled={securityBusy}
                  className={DANGER_BUTTON + " flex items-center gap-2 text-sm"}
                >
                  <ShieldOff className="h-3.5 w-3.5" />
                  Clear Verification
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void runPasskeyStepUp()}
                  disabled={securityBusy}
                  className={PRIMARY_BUTTON + " flex items-center gap-2 text-sm"}
                >
                  <Fingerprint className="h-4 w-4" />
                  Verify With Passkey
                </button>
                <button
                  type="button"
                  onClick={() => void runPinStepUp()}
                  disabled={securityBusy}
                  className={SECONDARY_BUTTON + " flex items-center gap-2 text-sm"}
                >
                  <Lock className="h-4 w-4" />
                  Verify With PIN
                </button>
                <input
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="TOTP code"
                  className={INPUT_CLASS + " max-w-[140px]"}
                />
                <button
                  type="button"
                  onClick={() => void runTotpStepUp()}
                  disabled={securityBusy}
                  className={SMALL_BUTTON}
                >
                  Verify
                </button>
                <input
                  value={backupCode}
                  onChange={(e) => setBackupCode(e.target.value)}
                  placeholder="Backup code"
                  className={INPUT_CLASS + " max-w-[140px]"}
                />
                <button
                  type="button"
                  onClick={() => void runBackupCodeStepUp()}
                  disabled={securityBusy}
                  className={SMALL_BUTTON}
                >
                  Use
                </button>
              </div>

              {totpEnrollment ? (
                <div className={`mt-4 p-3 ${GLASS_CARD}`}>
                  <div className={CARD_TITLE}>TOTP Enrollment</div>
                  <div className={`mt-1 break-all ${BODY_TEXT}`}>Secret: {totpEnrollment.secret}</div>
                  <div className={`mt-1 break-all ${SUBTEXT}`}>{totpEnrollment.otpauthUri}</div>
                  <div className="mt-3 flex gap-2">
                    <input
                      value={totpEnrollmentCode}
                      onChange={(e) => setTotpEnrollmentCode(e.target.value)}
                      placeholder="Enter code from authenticator"
                      className={INPUT_CLASS}
                    />
                    <button
                      type="button"
                      onClick={() => void verifyTotpEnrollment()}
                      disabled={securityBusy}
                      className={SMALL_BUTTON}
                    >
                      Confirm
                    </button>
                  </div>
                </div>
              ) : null}

              {backupCodes.length ? (
                <div className={`mt-4 p-3 ${GLASS_CARD}`}>
                  <div className={CARD_TITLE}>Backup Codes</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {backupCodes.map((code) => (
                      <span key={code} className="rounded-lg border border-white/10 bg-white/6 px-2 py-1 font-mono text-xs text-neutral-200">
                        {code}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {securityError ? <div className="mt-3 text-sm text-red-300">{securityError}</div> : null}
              {securityMessage ? <div className="mt-3 text-sm text-emerald-300">{securityMessage}</div> : null}
            </div>
          ) : null}

          {analyticsTab === "staff" && canViewStaffChannel ? (
          <div className={GLASS_CARD + " p-5"}>
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-400" />
                  <h2 className={SECTION_TITLE}>Compliance Analytics Period</h2>
                </div>
                <div className={BODY_TEXT}>
                  Period for late, problem absence, overtime, missing punch, rankings, and individual staff analytics.
                </div>
                <div className={SUBTEXT + " mt-1"}>
                  This period affects only the Compliance section.
                </div>
              </div>

              <button
                type="button"
                onClick={loadComparison}
                disabled={comparisonLoading || !approverName.trim() || !salesStepUpReady}
                className={PRIMARY_BUTTON + " flex items-center gap-2 text-sm whitespace-nowrap"}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {comparisonLoading ? <span className="inline-flex items-center gap-2"><Spinner size="sm" /> Loading...</span> : "Refresh Compliance"}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <div className={LABEL_TEXT + " mb-1.5 block"}>City</div>
                <select
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="dubai">Dubai</option>
                  <option value="manila">Manila</option>
                </select>
              </div>

              <div>
                <div className={LABEL_TEXT + " mb-1.5 block"}>Compliance Range</div>
                <DateRangePicker
                  value={{ from: dateFrom, to: dateTo }}
                  onChange={(range) => {
                    handleDateFromChange(range.from);
                    handleDateToChange(range.to);
                  }}
                />
              </div>

              <div>
                <div className={LABEL_TEXT + " mb-1.5 block"}>Month Quick Select</div>
                <MonthPicker
                  value={complianceMonthKey}
                  onChange={handleComplianceMonthChange}
                />
              </div>

              <div>
                <div className={LABEL_TEXT + " mb-1.5 block"}>Compliance Branch</div>
                <select
                  value={branchCode}
                  onChange={(e) => setBranchCode(e.target.value)}
                  className={SELECT_CLASS}
                >
                  {(BRANCH_OPTIONS[city] || [{ value: "", label: "All Branches" }]).map((opt) => (
                    <option key={opt.value || "ALL"} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
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
                className={SMALL_BUTTON}
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
                className={SMALL_BUTTON}
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => setBranchCode("")}
                className={SMALL_BUTTON}
              >
                Clear Compliance Branch
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <div className={LABEL_TEXT + " mb-1.5 block"}>Approver Name</div>
                <input
                  value={approverName}
                  onChange={(e) => setApproverName(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <div className={LABEL_TEXT + " mb-1.5 block"}>Session PIN</div>
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Enter your PIN"
                  className={INPUT_CLASS}
                />
              </div>
            </div>
            <div className="mt-4">
              <label className={LABEL_TEXT + " block mb-1.5"}>Comparison Limit</label>
              <input
                value={comparisonLimit}
                onChange={(e) => setComparisonLimit(e.target.value)}
                className={INPUT_CLASS + " max-w-[120px]"}
              />
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

            <motion.div
              className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-6"
              variants={staggerContainerVariants}
              initial="hidden"
              animate="visible"
            >
              <motion.div className={KPI_CARD} variants={cardVariants}>
                <div className={KPI_LABEL}>Late Staff</div>
                <MetricValue value={!comparisonLoadedOnce ? "-" : comparisonError ? "Failed" : comparisonSummary.lateStaffCount} />
              </motion.div>

              <motion.div className={KPI_CARD} variants={cardVariants}>
                <div className={KPI_LABEL}>Late Count</div>
                <MetricValue value={!comparisonLoadedOnce ? "-" : comparisonError ? "Failed" : comparisonSummary.lateEventCount} />
              </motion.div>

              <motion.div className={KPI_CARD} variants={cardVariants}>
                <div className={KPI_LABEL}>Total Late Minutes</div>
                <MetricValue value={!comparisonLoadedOnce ? "-" : comparisonError ? "Failed" : comparisonSummary.lateMinutes} unit="min" />
              </motion.div>

              <motion.div className={KPI_CARD} variants={cardVariants}>
                <div className={KPI_LABEL}>Problem Absence Staff</div>
                <MetricValue value={!comparisonLoadedOnce ? "-" : comparisonError ? "Failed" : comparisonSummary.problemAbsentStaffCount} />
              </motion.div>

              <motion.div className={KPI_CARD} variants={cardVariants}>
                <div className={KPI_LABEL}>Total OT</div>
                <MetricValue value={!comparisonLoadedOnce ? "-" : comparisonError ? "Failed" : comparisonSummary.overtimeMinutes} unit="min" />
              </motion.div>

              <motion.div className={KPI_CARD} variants={cardVariants}>
                <div className={KPI_LABEL}>Missing IN / OUT</div>
                <div className="mt-1 text-xl font-bold text-white">
                  {!comparisonLoadedOnce ? "-" : comparisonError ? "Failed" : `${comparisonSummary.missingInCount} / ${comparisonSummary.missingOutCount}`}
                </div>
              </motion.div>
            </motion.div>
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
              <div className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-950/30 px-4 py-1">
                <EmptyState message="No comparison rows for this compliance period/filter. Try another branch or date range." />
              </div>
            ) : null}

            <div className={GLASS_CARD + " mt-6 p-5"}>
              <div className="mb-4 flex items-center gap-2">
                <Search className="h-4 w-4 text-violet-400" />
                <h2 className={SECTION_TITLE}>Individual Search</h2>
              </div>
              <select
                value={staffSearch}
                onChange={(e) => setStaffSearch(e.target.value)}
                className={SELECT_CLASS + " mb-4"}
              >
                <option value="">Select staff</option>
                {staffSelectOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>

              {staffSearch.trim() ? (
                <div className="overflow-hidden rounded-xl border border-white/8">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-white/3">
                      <tr>
                        <th className={TABLE_HEADER + " px-3 py-3 text-left"}>Staff</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-left"}>Late Count</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-left"}>Late Minutes</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-left"}>Problem Absence Days</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-left"}>Total OT</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-left"}>Missing IN</th>
                        <th className={TABLE_HEADER + " px-3 py-3 text-left"}>Missing OUT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStaffAnalyticsRows.length ? (
                        filteredStaffAnalyticsRows.map((row) => (
                          <tr key={row.staff_name} className={TABLE_ROW}>
                            <td className={TABLE_CELL + " px-3"}>{row.staff_name}</td>
                            <td className={TABLE_CELL + " px-3"}>{row.late_count}</td>
                            <td className={TABLE_CELL + " px-3"}>{fmtMinutes(row.late_minutes)}</td>
                            <td className={TABLE_CELL + " px-3"}>{row.problem_absence_days}</td>
                            <td className={TABLE_CELL + " px-3"}>{fmtMinutes(row.overtime_minutes)}</td>
                            <td className={TABLE_CELL + " px-3"}>{row.missing_in_count}</td>
                            <td className={TABLE_CELL + " px-3"}>{row.missing_out_count}</td>
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

            <div className={TAB_CONTAINER + " mt-6"}>
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
                  className={viewMode === key ? TAB_ACTIVE : TAB_INACTIVE}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className={GLASS_CARD + " mt-6 p-5"}>
              <div className={CARD_TITLE + " mb-3"}>{currentAnalysisTitle}</div>

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
                          <td colSpan={5} className="px-3 py-2">
                            <EmptyState message="No perfect attendance data" />
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
                          <td colSpan={4} className="px-3 py-2">
                            <EmptyState message="No late data" />
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
                          <td colSpan={3} className="px-3 py-2">
                            <EmptyState message="No absence data" />
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
          ) : isSalesAnalyticsTab ? (
          <div className="mt-8 space-y-6">
            <div className={GLASS_CARD + " p-5"}>
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-violet-400" />
                    <h2 className={SECTION_TITLE}>{isManilaSalesCity ? "Manila Sales Analytics Period" : "Dubai Sales Analytics Period"}</h2>
                  </div>
                  <div className={BODY_TEXT + " max-w-2xl"}>
                    {isManilaSalesCity
                      ? "Menu sales, channel sales, category sales, payment method, and POS daily report analytics from Manila-specific synced exports."
                      : "Net sales, gross revenue, order count, hourly sales, operation time, and product mix analytics from synced sales exports. Summary cards use the full selected date range; Days w/ sales data is the count of days with POS rows (not the calendar span)."}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {!isManilaSalesCity ? (
                    <>
                      <button
                        type="button"
                        onClick={() => loadAll("sales")}
                        disabled={loading || !approverName.trim() || !salesStepUpReady}
                        className={SECONDARY_BUTTON + " flex items-center gap-2 text-sm whitespace-nowrap"}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        {loading ? <span className="inline-flex items-center gap-2"><Spinner size="sm" /> Loading...</span> : "Refresh Sales"}
                      </button>
                      <button
                        type="button"
                        onClick={syncSalesNow}
                        disabled={salesSyncing || !approverName.trim() || !salesStepUpReady}
                        className={PRIMARY_BUTTON + " flex items-center gap-2 text-sm whitespace-nowrap"}
                      >
                        <CloudDownload className="h-3.5 w-3.5" />
                        {salesSyncing ? "Syncing..." : "Sync Sales Data"}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              {!salesStepUpReady ? (
                <div className="mb-5 rounded-xl border border-violet-500/20 bg-violet-500/8 px-4 py-3">
                  <div className="flex items-start gap-2">
                    <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-violet-400" />
                    <div>
                      <p className="mb-1 text-sm font-semibold text-violet-300">How to unlock {isManilaSalesCity ? "Manila" : "Dubai"} Sales Analytics</p>
                      <ol className="space-y-0.5">
                        <li className="flex items-start gap-2 text-sm text-zinc-300">
                          <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-[10px] font-bold text-violet-400">1</span>
                          Open the Security section above.
                        </li>
                        <li className="flex items-start gap-2 text-sm text-zinc-300">
                          <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-[10px] font-bold text-violet-400">2</span>
                          Click <strong className="text-violet-200">Verify With Passkey</strong> (recommended), or enter TOTP / Backup code.
                        </li>
                        <li className="flex items-start gap-2 text-sm text-zinc-300">
                          <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-[10px] font-bold text-violet-400">3</span>
                          After verification succeeds, click <strong className="text-violet-200">Refresh Sales</strong>.
                        </li>
                      </ol>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className={isManilaSalesCity ? "grid grid-cols-1 gap-3 md:grid-cols-3" : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"}>
                <div>
                  <div className={LABEL_TEXT + " mb-1.5 block"}>Summary Range</div>
                  <DateRangePicker
                    value={{ from: summaryDateFrom, to: summaryDateTo }}
                    onChange={(range) => {
                      handleSummaryDateFromChange(range.from);
                      handleSummaryDateToChange(range.to);
                    }}
                  />
                </div>
                <div>
                  <div className={LABEL_TEXT + " mb-1.5 block"}>Month Quick Select</div>
                  <MonthPicker
                    value={summaryMonthKey}
                    onChange={handleSummaryMonthChange}
                  />
                </div>
                {!isManilaSalesCity ? (
                  <>
                    <div>
                      <div className={LABEL_TEXT + " mb-1.5 block"}>Brand</div>
                      <select
                        value={summaryBrandName}
                        onChange={(e) => setSummaryBrandName(e.target.value)}
                        className={SELECT_CLASS}
                      >
                        {salesBrandOptions.map((opt) => (
                          <option key={opt.value || "ALL"} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div className={LABEL_TEXT + " mb-1.5 block"}>Store</div>
                      <select
                        value={summaryBranchCode}
                        onChange={(e) => setSummaryBranchCode(e.target.value)}
                        className={SELECT_CLASS}
                      >
                        {(BRANCH_OPTIONS[salesCity] || [{ value: "", label: "All Branches" }]).map((opt) => (
                          <option key={opt.value || "ALL"} value={opt.value}>
                            {opt.value ? opt.label : "Company total"}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div className={LABEL_TEXT + " mb-1.5 block"}>Hourly Store Scope</div>
                      <select
                        value={hourlyStoreName}
                        onChange={(e) => setHourlyStoreName(e.target.value)}
                        className={SELECT_CLASS}
                      >
                        <option value="">Company total</option>
                        {hourlyStoreOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                ) : null}
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <div className={LABEL_TEXT + " mb-1.5 block"}>Approver Name</div>
                  <input
                    value={approverName}
                    onChange={(e) => setApproverName(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <div className={LABEL_TEXT + " mb-1.5 block"}>Session PIN</div>
                  <input
                    type="password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="Enter your PIN"
                    className={INPUT_CLASS}
                  />
                </div>
              </div>
              {salesSyncMessage ? (
                <div className={BADGE_INFO + " mt-3 whitespace-pre-wrap px-3 py-2 text-xs"}>
                  {salesSyncMessage}
                </div>
              ) : null}
              {hourlyLoadError ? (
                <div className={BADGE_WARNING + " mt-3 px-3 py-2 text-xs"}>
                  Hourly analytics: {hourlyLoadError}
                </div>
              ) : null}
              {operationTimeLoadError ? (
                <div className={BADGE_WARNING + " mt-3 px-3 py-2 text-xs"}>
                  Operation time: {operationTimeLoadError}
                </div>
              ) : null}
              {!isManilaSalesCity ? (
                <div className={TAB_CONTAINER + " mt-5"}>
                  <button
                    type="button"
                    onClick={() => setSalesSectionView("all")}
                    className={salesSectionView === "all" ? TAB_ACTIVE : TAB_INACTIVE}
                  >
                    All
                  </button>
                  {visibleSalesSectionOptions.map((section) => (
                    <button
                      key={section.value}
                      type="button"
                      onClick={() => setSalesSectionView(section.value)}
                      className={salesSectionView === section.value ? TAB_ACTIVE : TAB_INACTIVE}
                    >
                      {section.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {!isManilaSalesCity ? (
              <>
            {salesSectionView === "all" || salesSectionView === "summary" ? (
            <div id="sales-summary" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {[
                { label: "Net Sales Volume", value: posSalesSummary.revenuePrimary, color: "text-violet-300", icon: DollarSign },
                { label: "Gross Revenue", value: posSalesSummary.hasProfit ? posSalesSummary.operatingProfitPl : posSalesSummary.totalGrossSales, color: "text-emerald-400", icon: TrendingUp },
                { label: "Order Count", value: posSalesSummary.totalOrders, color: "text-white", icon: ShoppingBag },
                { label: "Avg Net / Order", value: posSalesSummary.avgRevenuePerOrder, color: "text-violet-300", icon: Receipt },
                { label: "Days w/ Sales Data", value: posSalesSummary.dayCount, color: "text-zinc-300", icon: CalendarDays },
              ].map(({ label, value, color, icon: Icon }, i) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.05 }}
                  className={KPI_CARD}
                >
                  <div className="mb-2 flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 text-zinc-600" />
                    <p className={KPI_LABEL}>{label}</p>
                  </div>
                  <p className={`text-2xl font-bold tabular-nums break-words ${color}`}>
                    {fmtNum(value)}
                  </p>
                </motion.div>
              ))}
            </div>
            ) : null}

            {salesSectionView === "all" || salesSectionView === "hourly" ? (
            <div id="sales-hourly" className={GLASS_CARD + " p-5"}>
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <Table2 className="h-4 w-4 text-violet-400" />
                    <h2 className={SECTION_TITLE}>Hourly Sales Analytics</h2>
                  </div>
                  <div className={T_CAPTION}>
                    Monthly hourly workbook totals are merged for the selected period. Staffing uses overlapping shift
                    hours for the same city/store scope.
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className={T_CAPTION}>
                    Scope: <span className="text-zinc-300">{hourlyStoreName || "Company total"}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      downloadCsv(
                        `${exportBaseName}_hourly_sales.csv`,
                        (hourlySalesAnalytics?.rows || []).map((row) => ({
                          hour: row.hour_label,
                          net_sales: Number(row.net_sales || 0),
                          orders: Number(row.order_count_non_cancelled || 0),
                          labor_hours: Number(row.labor_hours_total || 0),
                          avg_staff: Number(row.avg_staff_count || 0),
                          orders_per_labor_hour: Number(row.orders_per_labor_hour || 0),
                          orders_per_staff: Number(row.orders_per_staff || 0),
                        })),
                      )
                    }
                    className={SECONDARY_BUTTON + " flex items-center gap-2 text-sm"}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export CSV
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                <div className="min-w-0 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="min-h-[32px] text-xs text-neutral-500">Hourly net sales</div>
                  <MetricValue className={SALES_NUMERIC_VALUE} value={hourlySummary.totalNetSales} />
                </div>
                <div className="min-w-0 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="min-h-[32px] text-xs text-neutral-500">Hourly order count</div>
                  <MetricValue className={SALES_NUMERIC_VALUE} value={hourlySummary.totalOrders} />
                </div>
                <div className="min-w-0 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="min-h-[32px] text-xs text-neutral-500">Orders / labor hour</div>
                  <MetricValue className={SALES_NUMERIC_VALUE} value={hourlySummary.ordersPerLaborHour} />
                </div>
                <div className="min-w-0 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="min-h-[32px] text-xs text-neutral-500">Orders / staff</div>
                  <MetricValue className={SALES_NUMERIC_VALUE} value={hourlySummary.ordersPerStaff} />
                </div>
                <div className="min-w-0 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="min-h-[32px] text-xs text-neutral-500">Peak hour</div>
                  <div className={SALES_NUMERIC_VALUE} title={hourlySummary.peak?.hour_label || "—"}>
                    {hourlySummary.peak?.hour_label || "—"}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {hourlySummary.peak ? `${formatCount(Number(hourlySummary.peak.order_count_non_cancelled || 0))} orders` : "No hourly data"}
                  </div>
                </div>
                <div className="min-w-0 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="min-h-[32px] text-xs text-neutral-500">Imported months / hours</div>
                  <div className={SALES_NUMERIC_VALUE} title={`${fmtNumTitle(hourlySummary.monthCount)} / ${fmtNumTitle(hourlySummary.hourCount)}`}>
                    {fmtNum(hourlySummary.monthCount)}/{fmtNum(hourlySummary.hourCount)}
                  </div>
                  <div className="text-xs text-neutral-500">{formatCount(hourlySummary.dayCount)} calendar days</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr]">
                <div className={GLASS_CARD + " p-5"}>
                  <div className="mb-3 flex items-center gap-2">
                    <BarChart2 className="h-4 w-4 text-violet-400" />
                    <h2 className={SECTION_TITLE}>Hourly order trend</h2>
                  </div>
                  <div className="space-y-2">
                    {(hourlySalesAnalytics?.rows || []).map((row) => {
                      const widthPct = (Number(row.order_count_non_cancelled || 0) / hourlyTrendMaxOrders) * 100;
                      return (
                        <div key={row.hour_of_day} className="grid grid-cols-[60px_1fr_80px] items-center gap-3">
                          <div className="text-xs tabular-nums text-zinc-400">{row.hour_label}</div>
                          <div className="h-3 overflow-hidden rounded-full bg-zinc-900">
                            <div className="h-full rounded-full bg-violet-400" style={{ width: `${Math.max(widthPct, 2)}%` }} />
                          </div>
                          <div className="text-right text-xs tabular-nums text-zinc-300">
                            {formatCount(Number(row.order_count_non_cancelled || 0))}
                          </div>
                        </div>
                      );
                    })}
                    {!hourlySalesAnalytics?.rows?.length ? (
                      <div className="flex flex-col items-center gap-2 px-3 py-6 text-center">
                        <InboxIcon className="h-8 w-8 text-zinc-700" />
                        <p className={T_CAPTION}>No hourly sales data in this period yet.</p>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className={GLASS_CARD + " p-5"}>
                  <div className="mb-3 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-violet-400" />
                    <h2 className={SECTION_TITLE}>Peak-hour order density</h2>
                  </div>
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
                    <div className="rounded-xl border border-white/8 bg-white/5 px-3 py-6 text-center text-sm text-zinc-500">
                      Peak-hour density will appear after hourly files are synced.
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-white/8">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-white/3">
                    <tr>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Hour</th>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Net Sales</th>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Orders</th>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Labor Hours</th>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Avg Staff</th>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Orders / Labor Hour</th>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Orders / Staff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(hourlySalesAnalytics?.rows || []).map((row) => (
                      <tr key={row.hour_of_day} className={TABLE_ROW}>
                        <td className={TABLE_CELL + " px-4 tabular-nums"}>{row.hour_label}</td>
                        <td className={TABLE_CELL + " px-4 tabular-nums"}>{formatMoney(Number(row.net_sales || 0))}</td>
                        <td className={TABLE_CELL + " px-4 tabular-nums"}>
                          {formatCount(Number(row.order_count_non_cancelled || 0))}
                        </td>
                        <td className={TABLE_CELL + " px-4 tabular-nums"}>
                          {formatDecimal(Number(row.labor_hours_total || 0))}
                        </td>
                        <td className={TABLE_CELL + " px-4 tabular-nums"}>
                          {formatDecimal(Number(row.avg_staff_count || 0))}
                        </td>
                        <td className={TABLE_CELL + " px-4 tabular-nums"}>
                          {formatDecimal(Number(row.orders_per_labor_hour || 0))}
                        </td>
                        <td className={TABLE_CELL + " px-4 tabular-nums"}>
                          {formatDecimal(Number(row.orders_per_staff || 0))}
                        </td>
                      </tr>
                    ))}
                    {!hourlySalesAnalytics?.rows?.length ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center">
                          No hourly analytics data
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
            ) : null}

            {salesSectionView === "all" || salesSectionView === "operationTime" ? (
            <div id="sales-operation-time" className={GLASS_CARD + " p-5"}>
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <Table2 className="h-4 w-4 text-violet-400" />
                    <h2 className={SECTION_TITLE}>Operation Time</h2>
                  </div>
                  <div className={T_CAPTION}>
                    Daily UrbanPiper screenshots are OCR-parsed with a fixed template. This section is currently city-wide only.
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className={T_CAPTION}>
                    Scope: <span className="text-zinc-300">Company total</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      downloadCsv(
                        `${exportBaseName}_operation_time.csv`,
                        (operationTimeAnalytics?.items || []).map((row) => ({
                          date: row.work_date,
                          completion: row.overall_completion_minutes,
                          completion_delta_pct: row.overall_change_pct,
                          acknowledging_seconds: row.acknowledging_seconds,
                          preparing_minutes: row.preparing_minutes,
                          dispatching_minutes: row.dispatching_minutes,
                          delivering_minutes: row.delivering_minutes,
                        })),
                      )
                    }
                    className={SECONDARY_BUTTON + " flex items-center gap-2 text-sm"}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export CSV
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                <div className="min-w-0 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="min-h-[32px] text-xs text-neutral-500">Imported days</div>
                  <MetricValue className={SALES_NUMERIC_VALUE} value={operationTimeSummary.dayCount} />
                </div>
                <div className="min-w-0 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="min-h-[32px] text-xs text-neutral-500">Avg completion</div>
                  <MetricValue className={SALES_NUMERIC_VALUE} value={operationTimeSummary.avgOverallMinutes} unit="min" />
                </div>
                <div className="min-w-0 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="min-h-[32px] text-xs text-neutral-500">Latest completion</div>
                  <MetricValue className={SALES_NUMERIC_VALUE} value={operationTimeSummary.latest?.overall_completion_minutes} unit="min" />
                  <div className="text-xs text-neutral-500">
                    {operationTimeSummary.latest?.work_date || "No data"}
                  </div>
                </div>
                <div className="min-w-0 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="min-h-[32px] text-xs text-neutral-500">Latest delta</div>
                  <div className={SALES_NUMERIC_VALUE} title={operationTimeSummary.latest?.overall_change_pct == null ? "—" : formatPct(Number(operationTimeSummary.latest.overall_change_pct), 1)}>
                    {operationTimeSummary.latest?.overall_change_pct == null
                      ? "—"
                      : formatPct(Number(operationTimeSummary.latest.overall_change_pct), 1)}
                  </div>
                </div>
                <div className="min-w-0 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="min-h-[32px] text-xs text-neutral-500">Avg preparing</div>
                  <MetricValue className={SALES_NUMERIC_VALUE} value={operationTimeSummary.avgPreparingMinutes} unit="min" />
                </div>
                <div className="min-w-0 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="min-h-[32px] text-xs text-neutral-500">Avg delivering</div>
                  <MetricValue className={SALES_NUMERIC_VALUE} value={operationTimeSummary.avgDeliveringMinutes} unit="min" />
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-white/8">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-white/3">
                    <tr>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Date</th>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Completion</th>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Completion Δ</th>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Acknowledging</th>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Preparing</th>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Dispatching</th>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Delivering</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(operationTimeAnalytics?.items || []).map((row) => (
                      <tr key={row.work_date} className={TABLE_ROW}>
                        <td className={TABLE_CELL + " px-4 tabular-nums"}>{row.work_date}</td>
                        <td className={TABLE_CELL + " px-4 tabular-nums"}>{formatMinutes(row.overall_completion_minutes)}</td>
                        <td className={TABLE_CELL + " px-4 tabular-nums"}>
                          {row.overall_change_pct == null ? "—" : formatPct(Number(row.overall_change_pct), 1)}
                        </td>
                        <td className={TABLE_CELL + " px-4 tabular-nums"}>
                          {formatSeconds(row.acknowledging_seconds)}
                          {row.acknowledging_change_pct == null ? "" : ` (${formatPct(Number(row.acknowledging_change_pct), 1)})`}
                        </td>
                        <td className={TABLE_CELL + " px-4 tabular-nums"}>
                          {formatMinutes(row.preparing_minutes)}
                          {row.preparing_change_pct == null ? "" : ` (${formatPct(Number(row.preparing_change_pct), 1)})`}
                        </td>
                        <td className={TABLE_CELL + " px-4 tabular-nums"}>
                          {formatMinutes(row.dispatching_minutes)}
                          {row.dispatching_change_pct == null ? "" : ` (${formatPct(Number(row.dispatching_change_pct), 1)})`}
                        </td>
                        <td className={TABLE_CELL + " px-4 tabular-nums"}>
                          {formatMinutes(row.delivering_minutes)}
                          {row.delivering_change_pct == null ? "" : ` (${formatPct(Number(row.delivering_change_pct), 1)})`}
                        </td>
                      </tr>
                    ))}
                    {!operationTimeAnalytics?.items?.length ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center">
                          No operation time screenshots imported yet
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
            ) : null}

            {(salesSectionView === "all" || salesSectionView === "summary") && salesCity === "dubai" && !summaryBrandName ? (
              <p className={T_CAPTION}>
                Summary totals above are <span className="text-neutral-300">city-wide net sales and orders</span>{" "}
                (SushiZEN + RamenZEN + All Veggie Sushi, one kitchen). Management P&amp;L labor ratio uses the same
                combined sales denominator.
              </p>
            ) : null}
            {!isManilaSalesCity ? <div className={DIVIDER} /> : null}

            {salesSectionView === "all" || salesSectionView === "brands" ? (
              <>
            {salesCity === "dubai" && brandOrderRanking.length ? (
              <div id="sales-brands" className={GLASS_CARD + " p-5"}>
                <div className="mb-3 flex items-center gap-2">
                  <Table2 className="h-4 w-4 text-violet-400" />
                  <h2 className={SECTION_TITLE}>Dubai — orders &amp; net sales by brand and aggregator</h2>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {brandOrderRanking.map((row) => (
                    <div key={row.brand} className={KPI_CARD}>
                      <div className="text-xs font-medium text-zinc-400">{row.brand}</div>
                      <div className="mt-2 text-2xl font-bold text-white tabular-nums">{formatCount(row.orders)}</div>
                      <div className="text-[11px] text-zinc-500">orders (non-cancelled)</div>
                      <div className="mt-2 text-sm text-zinc-200">Net {formatMoney(row.netSales)}</div>
                      <div className="text-[11px] text-zinc-500">Gross {formatMoney(row.grossSales)}</div>
                      <div className="mt-3">
                        <div className="mb-2 text-[11px] uppercase tracking-wide text-zinc-500">Aggregator mix</div>
                        <AggregatorBreakdown items={row.aggregators} dense />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className={GLASS_CARD + " overflow-hidden"}>
              <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
                <div className="flex items-center gap-2">
                  <Table2 className="h-4 w-4 text-violet-400" />
                  <h2 className={SECTION_TITLE}>{salesCity === "dubai" ? "Brand ranking with aggregator breakdown" : "Brand order ranking"}</h2>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-white/3">
                    <tr>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Rank</th>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Brand</th>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Orders</th>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Net Sales</th>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Gross Sales</th>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Aggregator Breakdown</th>
                    </tr>
                  </thead>
                  <tbody>
                    {brandOrderRanking.map((row, idx) => (
                      <tr key={`${row.brand}-${idx}`} className={TABLE_ROW}>
                        <td className={TABLE_CELL + " px-4"}>{idx + 1}</td>
                        <td className={TABLE_CELL + " px-4"}>{row.brand}</td>
                        <td className={TABLE_CELL + " px-4 tabular-nums"}>{formatCount(row.orders)}</td>
                        <td className={TABLE_CELL + " px-4 tabular-nums"}>{formatMoney(row.netSales)}</td>
                        <td className={TABLE_CELL + " px-4 tabular-nums"}>{formatMoney(row.grossSales)}</td>
                        <td className={TABLE_CELL + " px-4"}>
                          <AggregatorBreakdown items={row.aggregators} dense />
                        </td>
                      </tr>
                    ))}
                    {!brandOrderRanking.length ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center">
                          <EmptyState message="No brand-level order data" />
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
              </>
            ) : null}

            {salesSectionView === "all" || salesSectionView === "productMix" ? (
            <div id="sales-product-mix" className={GLASS_CARD + " p-5"}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <Table2 className="h-4 w-4 text-violet-400" />
                    <h2 className={SECTION_TITLE}>Product Mix Ranking</h2>
                  </div>
                  <div className={T_CAPTION}>
                    {productMixCoverage.from && productMixCoverage.to
                      ? `Imported coverage: ${productMixCoverage.from} -> ${productMixCoverage.to}`
                      : "No Product Mix import found yet."}
                  </div>
                </div>
                <div className={T_CAPTION}>
                  Scope:{" "}
                  <span className="text-zinc-300">
                    {summaryBranchCode
                      ? (BRANCH_OPTIONS[salesCity] || []).find((opt) => opt.value === summaryBranchCode)?.label || summaryBranchCode
                      : "Company total"}
                  </span>
                </div>
              </div>
              {summaryBrandName && summaryBrandName !== "SushiZEN" ? (
                <div className="rounded-xl border border-white/8 bg-white/5 px-3 py-6 text-center text-sm text-zinc-500">
                  Product Mix is currently available for SushiZEN only.
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-white/8">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-white/3">
                      <tr>
                        <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Rank</th>
                        <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Product A</th>
                        <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Product B</th>
                        <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Major Orders</th>
                        <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Mix Orders</th>
                        <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Ratio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productMixRankingRows.slice(0, 50).map((row, idx) => (
                        <tr key={`${row.product_a_name}-${row.product_b_name}-${idx}`} className={TABLE_ROW}>
                          <td className={TABLE_CELL + " px-4"}>{idx + 1}</td>
                          <td className={TABLE_CELL + " px-4"}>{row.product_a_name}</td>
                          <td className={TABLE_CELL + " px-4"}>{row.product_b_name}</td>
                          <td className={TABLE_CELL + " px-4 tabular-nums"}>{formatCount(row.major_orders)}</td>
                          <td className={TABLE_CELL + " px-4 tabular-nums"}>{formatCount(row.mix_orders)}</td>
                          <td className={TABLE_CELL + " px-4 tabular-nums"}>{formatDecimal(Number(row.ratio || 0) * 100, 2)}%</td>
                        </tr>
                      ))}
                      {!productMixRankingRows.length ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-12 text-center">
                            <EmptyState message="No Product Mix ranking data" />
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            ) : null}

            {salesSectionView === "all" || salesSectionView === "menu" ? (
            <div id="sales-menu" className={GLASS_CARD + " overflow-hidden"}>
              <div className="flex items-center justify-between gap-3 border-b border-white/5 px-5 py-4">
                <div className="flex items-center gap-2">
                  <Table2 className="h-4 w-4 text-violet-400" />
                  <h2 className={SECTION_TITLE}>Top Menu Ranking (By Quantity)</h2>
                </div>
                <button
                  type="button"
                  onClick={() => downloadCsv(`${exportBaseName}_pos_menu_ranking.csv`, posMenuRankingExportRows)}
                  className={SECONDARY_BUTTON + " flex items-center gap-2 text-sm"}
                >
                  <Download className="h-3.5 w-3.5" />
                  Export Ranking CSV
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-white/3">
                    <tr>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Rank</th>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Item</th>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Quantity</th>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Order Lines</th>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Net Sales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {posMenuRankingRows.slice(0, 50).map((row, idx) => (
                      <tr key={`${row.item_name}-${idx}`} className={TABLE_ROW}>
                        <td className={TABLE_CELL + " px-4"}>{idx + 1}</td>
                        <td className={TABLE_CELL + " px-4"}>{row.item_name}</td>
                        <td className={TABLE_CELL + " px-4"}>{Number(row.quantity_total || 0).toFixed(2)}</td>
                        <td className={TABLE_CELL + " px-4"}>{row.order_line_count}</td>
                        <td className={TABLE_CELL + " px-4"}>{Number(row.net_sales_total || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                    {!posMenuRankingRows.length ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-12 text-center">
                          <EmptyState message="No menu ranking data" />
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
            ) : null}

            {salesSectionView === "all" || salesSectionView === "stores" ? (
            <div id="sales-stores" className={GLASS_CARD + " overflow-hidden"}>
              <div className="flex items-center justify-between gap-3 border-b border-white/5 px-5 py-4">
                <div className="flex items-center gap-2">
                  <Table2 className="h-4 w-4 text-violet-400" />
                  <h2 className={SECTION_TITLE}>Store Order Ranking with Aggregator Breakdown</h2>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-white/3">
                    <tr>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Rank</th>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Store</th>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Orders</th>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Net Sales</th>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Gross Revenue</th>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Aggregator Breakdown</th>
                    </tr>
                  </thead>
                  <tbody>
                    {posBranchOrderRows.slice(0, 30).map((row, idx) => (
                      <tr key={`${row.branch_name}-${idx}`} className={TABLE_ROW}>
                        <td className={TABLE_CELL + " px-4"}>{idx + 1}</td>
                        <td className={TABLE_CELL + " px-4"}>{row.branch_name}</td>
                        <td className={TABLE_CELL + " px-4 tabular-nums"}>{formatCount(row.order_count_non_cancelled)}</td>
                        <td className={TABLE_CELL + " px-4 tabular-nums"}>{formatMoney(Number(row.net_revenue || 0))}</td>
                        <td className={TABLE_CELL + " px-4 tabular-nums"}>{formatMoney(Number(row.gross_revenue || 0))}</td>
                        <td className={TABLE_CELL + " px-4"}>
                          <AggregatorBreakdown items={row.aggregators} dense />
                        </td>
                      </tr>
                    ))}
                    {!posBranchOrderRows.length ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center">
                          <EmptyState message="No store order data" />
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
            ) : null}

            {salesSectionView === "all" || salesSectionView === "cancelOrders" ? (
            <div id="sales-cancel-orders" className={GLASS_CARD + " p-5"}>
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <Table2 className="h-4 w-4 text-violet-400" />
                    <h2 className={SECTION_TITLE}>Cancel Orders</h2>
                  </div>
                  <div className={T_CAPTION}>
                    Daily UrbanPiper lost-order CSVs are auto-synced from the POS folder and aggregated for this period.
                  </div>
                </div>
                <div className={T_CAPTION}>
                  Scope: <span className="text-zinc-300">{summaryBrandName || "All Brands"}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <div className="min-w-0 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="min-h-[32px] text-xs text-neutral-500">Lost Orders</div>
                  <MetricValue className={SALES_NUMERIC_VALUE} value={cancelOrderSummary.lostOrderCount} />
                </div>
                <div className="min-w-0 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="min-h-[32px] text-xs text-neutral-500">Lost Revenue</div>
                  <MetricValue className={SALES_NUMERIC_VALUE} value={cancelOrderSummary.lostRevenue} />
                </div>
                <div className="min-w-0 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="min-h-[32px] text-xs text-neutral-500">Days w/ data</div>
                  <MetricValue className={SALES_NUMERIC_VALUE} value={cancelOrderSummary.dayCount} />
                </div>
                <div className="min-w-0 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="min-h-[32px] text-xs text-neutral-500">Cancel types</div>
                  <MetricValue className={SALES_NUMERIC_VALUE} value={cancelOrderSummary.orderTypeCount} />
                </div>
                <div className="min-w-0 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="min-h-[32px] text-xs text-neutral-500">Platforms</div>
                  <MetricValue className={SALES_NUMERIC_VALUE} value={cancelOrderSummary.platformCount} />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="overflow-hidden rounded-2xl border border-white/8 bg-white/5 p-3">
                  <div className="mb-2 text-sm font-semibold text-white">Order Type Summary</div>
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-white/3">
                      <tr>
                        <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Type</th>
                        <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Lost Orders</th>
                        <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Lost Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(cancelOrdersAnalytics?.order_type_rows || []).map((row, idx) => (
                        <tr key={`${row.order_type}-${idx}`} className={TABLE_ROW}>
                          <td className={TABLE_CELL + " px-4"}>{row.order_type}</td>
                          <td className={TABLE_CELL + " px-4 tabular-nums"}>{formatCount(Number(row.lost_order_count || 0))}</td>
                          <td className={TABLE_CELL + " px-4 tabular-nums"}>{formatMoney(Number(row.lost_revenue || 0))}</td>
                        </tr>
                      ))}
                      {!cancelOrdersAnalytics?.order_type_rows?.length ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-12 text-center">
                            No cancel-order type data
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>

                <div className="overflow-hidden rounded-2xl border border-white/8 bg-white/5 p-3">
                  <div className="mb-2 text-sm font-semibold text-white">Platform Breakdown</div>
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-white/3">
                      <tr>
                        <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Platform</th>
                        <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Lost Orders</th>
                        <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Platform pre</th>
                        <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Platform post</th>
                        <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Merchant pre</th>
                        <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Merchant post</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(cancelOrdersAnalytics?.platform_rows || []).map((row, idx) => (
                        <tr key={`${row.platform_name}-${idx}`} className={TABLE_ROW}>
                          <td className={TABLE_CELL + " px-4"}>{row.platform_name || "Unknown"}</td>
                          <td className={TABLE_CELL + " px-4 tabular-nums"}>{formatCount(Number(row.lost_order_count || 0))}</td>
                          <td className={TABLE_CELL + " px-4 tabular-nums"}>{formatCount(Number(row.platform_pre_ack || 0))}</td>
                          <td className={TABLE_CELL + " px-4 tabular-nums"}>{formatCount(Number(row.platform_post_ack || 0))}</td>
                          <td className={TABLE_CELL + " px-4 tabular-nums"}>{formatCount(Number(row.merchant_pre_ack || 0))}</td>
                          <td className={TABLE_CELL + " px-4 tabular-nums"}>{formatCount(Number(row.merchant_post_ack || 0))}</td>
                        </tr>
                      ))}
                      {!cancelOrdersAnalytics?.platform_rows?.length ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-12 text-center">
                            No platform breakdown data
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-white/8">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-white/3">
                    <tr>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Date</th>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Brand</th>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Lost Orders</th>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Lost Revenue</th>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Source File</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(cancelOrdersAnalytics?.daily_rows || []).map((row, idx) => (
                      <tr key={`${row.work_date}-${row.brand_name}-${idx}`} className={TABLE_ROW}>
                        <td className={TABLE_CELL + " px-4 tabular-nums"}>{row.work_date}</td>
                        <td className={TABLE_CELL + " px-4"}>{row.brand_name}</td>
                        <td className={TABLE_CELL + " px-4 tabular-nums"}>{formatCount(Number(row.lost_order_count || 0))}</td>
                        <td className={TABLE_CELL + " px-4 tabular-nums"}>{formatMoney(Number(row.lost_revenue || 0))}</td>
                        <td className={TABLE_CELL + " max-w-[320px] truncate px-4 text-xs text-zinc-400"}>{row.source_file_name || "—"}</td>
                      </tr>
                    ))}
                    {!cancelOrdersAnalytics?.daily_rows?.length ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-12 text-center">
                          No cancel-order daily data
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
            ) : null}

            {salesSectionView === "all" || salesSectionView === "daily" ? (
            <div id="sales-daily" className={GLASS_CARD + " overflow-hidden"}>
              <div className="flex items-center justify-between gap-3 border-b border-white/5 px-5 py-4">
                <div className="flex items-center gap-2">
                  <Table2 className="h-4 w-4 text-violet-400" />
                  <h2 className={SECTION_TITLE}>Sales Daily Details</h2>
                </div>
                <button
                  type="button"
                  onClick={() => downloadCsv(`${exportBaseName}_pos_sales_daily.csv`, posSalesExportRows)}
                  className={SECONDARY_BUTTON + " flex items-center gap-2 text-sm"}
                >
                  <Download className="h-3.5 w-3.5" />
                  Export Sales CSV
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-white/3">
                    <tr>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Date</th>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Orders</th>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Gross</th>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Net</th>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Discounts</th>
                      <th className={TABLE_HEADER + " px-4 py-3 text-left"}>Charges</th>
                    </tr>
                  </thead>
                  <tbody>
                    {posSalesRows.map((row) => (
                      <tr key={`${row.city}-${row.work_date}`} className={TABLE_ROW}>
                        <td className={TABLE_CELL + " px-4"}>{row.work_date}</td>
                        <td className={TABLE_CELL + " px-4 tabular-nums"}>{formatCount(row.order_count_non_cancelled)}</td>
                        <td className={TABLE_CELL + " px-4 tabular-nums"}>{formatMoney(Number(row.gross_revenue || 0))}</td>
                        <td className={TABLE_CELL + " px-4 tabular-nums"}>{formatMoney(Number(row.net_revenue || 0))}</td>
                        <td className={TABLE_CELL + " px-4 tabular-nums"}>{formatMoney(Number(row.discounts || 0))}</td>
                        <td className={TABLE_CELL + " px-4 tabular-nums"}>{formatMoney(Number(row.charges || 0))}</td>
                      </tr>
                    ))}
                    {!posSalesRows.length ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center">
                          <EmptyState message="No sales data" />
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
            ) : null}
              </>
            ) : null}

            {isManilaSalesCity ? (
              <ManilaSalesSection
                city="manila"
                dateFrom={summaryDateFrom}
                dateTo={summaryDateTo}
                approverName={approverName}
                pin={pin}
                stepUpReady={salesStepUpReady}
                active={analyticsTab === "manilaSales"}
              />
            ) : null}
          </div>
          ) : analyticsTab === "evaluation" ? (
          <div className="mt-8 space-y-4">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
              <div className="mb-3 flex flex-wrap items-end gap-3">
                <div className="min-w-[220px] flex-1 text-sm font-semibold">Store Evaluation Dashboard</div>
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
                <div className="grid w-full gap-2 sm:w-auto sm:min-w-[360px]">
                  <label className="text-xs text-neutral-400">
                    Summary Range
                    <DateRangePicker
                      value={{ from: summaryDateFrom, to: summaryDateTo }}
                      onChange={(range) => {
                        handleSummaryDateFromChange(range.from);
                        handleSummaryDateToChange(range.to);
                      }}
                      className="mt-1"
                    />
                  </label>
                  <label className="text-xs text-neutral-400">
                    Month Quick Select
                    <MonthPicker value={summaryMonthKey} onChange={handleSummaryMonthChange} className="mt-1" />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => loadAll("evaluation")}
                  disabled={loading || !approverName.trim() || !salesStepUpReady}
                  className="ml-auto rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-60"
                >
                  {loading ? <span className="inline-flex items-center gap-2"><Spinner size="sm" /> Loading...</span> : "Refresh Evaluation"}
                </button>
              </div>
              <div className="text-xs text-neutral-500">
                This channel scores attendance, operations, and food cost. In general, higher scores are better, and the
                goal is to quickly identify which category is pulling a store down.
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-sky-200">What The Score Means</div>
                  <div className="mt-2 text-xs leading-5 text-neutral-400">
                    Each category is scored out of 10 points. A store&apos;s total score is the sum of the category scores,
                    so a higher total usually means healthier performance for the selected period.
                  </div>
                </div>
                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-sky-200">How To Read Each Cell</div>
                  <div className="mt-2 text-xs leading-5 text-neutral-400">
                    In each metric cell, the top line shows the actual result and the second line shows the score earned
                    from that result. This helps explain why a store scored high or low.
                  </div>
                </div>
                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-sky-200">How To Evaluate</div>
                  <div className="mt-2 text-xs leading-5 text-neutral-400">
                    Start with the actual results to find the problem area, then use the scores to prioritize action. For
                    example, stores with poor lateness results or high food cost can be identified first.
                  </div>
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
                  <div className="mb-1 text-xs text-neutral-400">Session</div>
                  <input
                    type="password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="Enter your PIN"
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm"
                  />
                </div>
              </div>
              {Array.from(new Set(evaluationWarnings.map(formatEvaluationWarning).filter((v) => String(v || "").trim().length > 0))).length ? (
                <div className="mt-4 rounded-2xl border border-amber-900/50 bg-amber-950/20 px-4 py-3 text-xs text-amber-200">
                  {Array.from(new Set(evaluationWarnings.map(formatEvaluationWarning).filter((v) => String(v || "").trim().length > 0))).join(" | ")}
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setEvaluationSectionView("all")}
                  className={
                    evaluationSectionView === "all"
                      ? "rounded-full border border-sky-500/70 bg-sky-500/15 px-3 py-1 text-[11px] font-semibold text-sky-100"
                      : "rounded-full border border-neutral-700 bg-neutral-950/40 px-3 py-1 text-[11px] font-medium text-neutral-200 transition hover:bg-neutral-900 hover:text-white"
                  }
                >
                  All
                </button>
                {EVALUATION_SECTION_OPTIONS.map((section) => {
                  const sectionKey =
                    section.value === "foodCost"
                      ? "food_cost"
                      : section.value === "inventoryAccuracy"
                        ? "inventory_accuracy"
                        : section.value;
                  const matched = evaluationSections.find((item) => item.section_key === sectionKey);
                  const isConstruction = matched?.status === "under_construction";
                  return (
                    <button
                      key={section.value}
                      type="button"
                      onClick={() => setEvaluationSectionView(section.value)}
                      className={
                        evaluationSectionView === section.value
                          ? "rounded-full border border-sky-500/70 bg-sky-500/15 px-3 py-1 text-[11px] font-semibold text-sky-100"
                          : "rounded-full border border-neutral-700 bg-neutral-950/40 px-3 py-1 text-[11px] font-medium text-neutral-200 transition hover:bg-neutral-900 hover:text-white"
                      }
                    >
                      {section.label}
                      {isConstruction ? " (Under construction)" : ""}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
              <div className="mb-2 text-xs font-semibold tracking-wide text-neutral-300">CCTV Operational Behavior (MVP)</div>
              {cctvScoreLoadError ? (
                <div className="text-xs text-amber-300">{cctvScoreLoadError}</div>
              ) : cctvMetricSnapshot.length ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-xs">
                    <thead className="border-b border-neutral-800 text-neutral-400">
                      <tr>
                        <th className="px-2 py-1">Branch</th>
                        <th className="px-2 py-1">Station</th>
                        <th className="px-2 py-1">Presence</th>
                        <th className="px-2 py-1">Peak Absence</th>
                        <th className="px-2 py-1">Idle Ratio</th>
                        <th className="px-2 py-1">Hygiene</th>
                        <th className="px-2 py-1">Unsafe Count</th>
                        <th className="px-2 py-1">Response Delay</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cctvMetricSnapshot.slice(0, 60).map((row) => (
                        <tr key={`cctv-${row.branchCode}-${row.stationCode}`} className="border-b border-neutral-900/80">
                          <td className="px-2 py-1 tabular-nums text-neutral-200">{row.branchCode || "—"}</td>
                          <td className="px-2 py-1 text-neutral-200">{row.stationCode || "—"}</td>
                          <td className="px-2 py-1 tabular-nums">{formatDecimal(Number(row.metrics.station_presence_rate || 0), 3)}</td>
                          <td className="px-2 py-1 tabular-nums">{formatDecimal(Number(row.metrics.peak_time_absence_events || 0), 1)}</td>
                          <td className="px-2 py-1 tabular-nums">{formatDecimal(Number(row.metrics.idle_time_ratio || 0), 3)}</td>
                          <td className="px-2 py-1 tabular-nums">{formatDecimal(Number(row.metrics.hygiene_action_completion || 0), 3)}</td>
                          <td className="px-2 py-1 tabular-nums">{formatDecimal(Number(row.metrics.unsafe_behavior_count || 0), 1)}</td>
                          <td className="px-2 py-1 tabular-nums">{formatDecimal(Number(row.metrics.response_delay_to_workload_spike || 0), 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-xs text-neutral-500">CCTV rollup is empty for this range. Ingest events first, then reload analytics.</div>
              )}
            </div>

            {evaluationSectionView === "all" || evaluationSectionView === "summary" ? (
            <div id="evaluation-summary" className="space-y-4">
              <div className="rounded-2xl border border-sky-900/40 bg-sky-950/20 p-4">
                <div className="text-sm font-semibold text-sky-100">Operational Target Lines (Good Operation Baseline)</div>
                <div className="mt-2 text-xs leading-6 text-neutral-300">
                  Overall score: <span className="font-semibold text-white">{"\u2265"} {formatScore(evaluationTargetLines.overallTarget)} pts</span> |
                  Attendance: <span className="font-semibold text-white">{"\u2265"} {formatScore(evaluationTargetLines.attendanceTarget)} pts</span> |
                  Operation: <span className="font-semibold text-white">{"\u2265"} {formatScore(evaluationTargetLines.operationTarget)} pts</span> |
                  Food cost: <span className="font-semibold text-white">{"\u2265"} {formatScore(evaluationTargetLines.foodCostTarget)} pts</span> |
                  Disposal: <span className="font-semibold text-white">{"\u2265"} {formatScore(evaluationTargetLines.disposalTarget)} pts</span> |
                  Backup: <span className="font-semibold text-white">{"\u2265"} {formatScore(evaluationTargetLines.backupTarget)} pts</span> |
                  City op time: <span className="font-semibold text-white">{"\u2264"} {formatMinutes(evaluationTargetLines.opTimeTargetMinutes)}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 2xl:grid-cols-8">
                {(() => {
                  const s = describeHigherIsBetter(evaluationSummary?.overall_avg_score, evaluationTargetLines.overallTarget, "pts");
                  return (
                <EvaluationKpiCard
                  title="Overall Average Score"
                  value={formatScore(evaluationSummary?.overall_avg_score)}
                  hint="Average total score across all stores. Use this as the top-level health check for the selected period."
                  scaleNote={`Max ${formatScore(evaluationScoreScale.overallMax)} pts | Pass line ${formatScore(evaluationScoreScale.overallPass)}+ pts`}
                  targetLine={`>= ${formatScore(evaluationTargetLines.overallTarget)} pts`}
                  targetStatus={s.text}
                  targetStatusClassName={s.className}
                  guide="How to use it: Higher is better. Start here to judge overall performance, then drill into the weaker categories."
                />
                  );
                })()}
                {(() => {
                  const s = describeHigherIsBetter(evaluationSummary?.attendance_avg_score, evaluationTargetLines.attendanceTarget, "pts");
                  return (
                <EvaluationKpiCard
                  title="Attendance Average"
                  value={formatScore(evaluationSummary?.attendance_avg_score)}
                  hint="Average attendance score based on lateness, absences, shift-change requests, and shift preservation."
                  scaleNote={`Max ${formatScore(evaluationScoreScale.attendanceMax)} pts | Pass line ${formatScore(evaluationScoreScale.attendancePass)}+ pts`}
                  targetLine={`>= ${formatScore(evaluationTargetLines.attendanceTarget)} pts`}
                  targetStatus={s.text}
                  targetStatusClassName={s.className}
                  guide="How to use it: Higher is better. Lower scores usually point to staffing discipline or schedule-control issues."
                />
                  );
                })()}
                {(() => {
                  const s = describeHigherIsBetter(evaluationSummary?.operation_avg_score, evaluationTargetLines.operationTarget, "pts");
                  return (
                <EvaluationKpiCard
                  title="Operation Average"
                  value={formatScore(evaluationSummary?.operation_avg_score)}
                  hint="Average operations score based on speed, QC grade, image upload rate, waste reporting, and prep reporting."
                  scaleNote={`Max ${formatScore(evaluationScoreScale.operationMax)} pts | Pass line ${formatScore(evaluationScoreScale.operationPass)}+ pts`}
                  targetLine={`>= ${formatScore(evaluationTargetLines.operationTarget)} pts`}
                  targetStatus={s.text}
                  targetStatusClassName={s.className}
                  guide="How to use it: Higher is better. Lower scores usually mean weaknesses in speed, quality, or reporting discipline."
                />
                  );
                })()}
                {(() => {
                  const s = describeHigherIsBetter(evaluationSummary?.food_cost_avg_score, evaluationTargetLines.foodCostTarget, "pts");
                  return (
                <EvaluationKpiCard
                  title="Food Cost Average"
                  value={formatScore(evaluationSummary?.food_cost_avg_score)}
                  hint="Average score for how well each store keeps actual food cost near or below target."
                  scaleNote={`Max ${formatScore(evaluationScoreScale.foodCostMax)} pts | Pass line ${formatScore(evaluationScoreScale.foodCostPass)}+ pts`}
                  targetLine={`>= ${formatScore(evaluationTargetLines.foodCostTarget)} pts`}
                  targetStatus={s.text}
                  targetStatusClassName={s.className}
                  guide="How to use it: Higher is better. Lower scores suggest food cost is running above target and may be hurting margin."
                />
                  );
                })()}
                {(() => {
                  const s = describeHigherIsBetter(disposalAvgScore, evaluationTargetLines.disposalTarget, "pts");
                  return (
                <EvaluationKpiCard
                  title="Disposal Reporting Average"
                  value={formatScore(disposalAvgScore)}
                  hint="Average disposal reporting score based on submission consistency and plausibility vs sales volume."
                  scaleNote={`Max ${formatScore(evaluationScoreScale.disposalMax)} pts | Pass line ${formatScore(evaluationScoreScale.disposalPass)}+ pts`}
                  targetLine={`>= ${formatScore(evaluationTargetLines.disposalTarget)} pts`}
                  targetStatus={s.text}
                  targetStatusClassName={s.className}
                  guide="How to use it: Higher is better. Very low disposal volume against high sales lowers this score to flag likely under-reporting."
                />
                  );
                })()}
                {(() => {
                  const s = describeHigherIsBetter(backupAvgScore, evaluationTargetLines.backupTarget, "pts");
                  return (
                <EvaluationKpiCard
                  title="Backup Reporting Average"
                  value={formatScore(backupAvgScore)}
                  hint="Average prep/backup reporting score based on coverage and expected prep activity level."
                  scaleNote={`Max ${formatScore(evaluationScoreScale.backupMax)} pts | Pass line ${formatScore(evaluationScoreScale.backupPass)}+ pts`}
                  targetLine={`>= ${formatScore(evaluationTargetLines.backupTarget)} pts`}
                  targetStatus={s.text}
                  targetStatusClassName={s.className}
                  guide="How to use it: Around 7+ means stores are reporting prep at a healthy operational level."
                />
                  );
                })()}
                {(() => {
                  const s = describeHigherIsBetter(evaluationSummary?.store_count, evaluationTargetLines.storeCoverageTarget, "stores");
                  return (
                <EvaluationKpiCard
                  title="Store Count"
                  value={formatCount(Number(evaluationSummary?.store_count || 0))}
                  hint="Number of stores included in the current city and date range."
                  scaleNote="Coverage metric: this is not a score, but it indicates whether your sample size is healthy."
                  targetLine={`>= ${formatCount(evaluationTargetLines.storeCoverageTarget)} stores`}
                  targetStatus={s.text}
                  targetStatusClassName={s.className}
                  guide="How to use it: This is the sample size. When fewer stores are included, average values can move more sharply."
                />
                  );
                })()}
                {(() => {
                  const s = describeLowerIsBetter(
                    evaluationSummary?.operation_time_avg_minutes,
                    evaluationTargetLines.opTimeTargetMinutes,
                    "min"
                  );
                  return (
                <EvaluationKpiCard
                  title="City Operation Time Average"
                  value={formatMinutes(evaluationSummary?.operation_time_avg_minutes)}
                  hint="Average completion time across the selected city for the selected period."
                  scaleNote="Speed metric: lower is better."
                  targetLine={`<= ${formatMinutes(evaluationTargetLines.opTimeTargetMinutes)}`}
                  targetStatus={s.text}
                  targetStatusClassName={s.className}
                  guide="How to use it: Lower is better. A higher number means slower order completion for customers."
                />
                  );
                })()}
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
                <div className="mb-2 text-sm font-semibold">Store Score Summary</div>
                <div className="mb-3 text-xs text-neutral-500">
                  This compares category scores by store. Use it to spot which store is weak in which category, then check
                  the detailed tables below for the cause.
                </div>
                {evaluationStores.length ? (
                  <>
                    <div className="space-y-3 md:hidden">
                      {evaluationStores.map((row) => (
                        <div
                          key={`summary-mobile-${row.branch_code}`}
                          className="rounded-xl border border-neutral-800/80 bg-neutral-950/50 p-3"
                        >
                          <div className="mb-2 text-sm font-semibold">{row.branch_name}</div>
                          <div className="grid grid-cols-1 gap-2">
                            <EvaluationMetricCell actual="Attendance total" score={row.attendance.total_score} maxScore={row.attendance.max_score} />
                            <EvaluationMetricCell actual="Operation total" score={row.operation.total_score} maxScore={row.operation.max_score} />
                            <EvaluationMetricCell actual="Food cost total" score={row.food_cost.score} maxScore={row.food_cost.max_score} />
                            <EvaluationMetricCell actual="Disposal score" score={row.operation.scores.waste_score} maxScore={10} />
                            <EvaluationMetricCell actual="Backup score" score={row.operation.scores.prep_score} maxScore={10} />
                            <EvaluationMetricCell actual="Overall total" score={row.overall_score} maxScore={row.overall_max_score} emphasize />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="hidden overflow-x-auto md:block">
                      <table className="min-w-full text-left text-sm">
                        <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                          <tr>
                            <th className="px-3 py-2">Store</th>
                            <th className="px-3 py-2">Attendance</th>
                            <th className="px-3 py-2">Operation</th>
                            <th className="px-3 py-2">Food Cost</th>
                            <th className="px-3 py-2">Disposal</th>
                            <th className="px-3 py-2">Backup</th>
                            <th className="px-3 py-2">Overall</th>
                          </tr>
                        </thead>
                        <tbody>
                          {evaluationStores.map((row) => (
                            <tr key={row.branch_code} className="border-b border-neutral-800/70">
                              <td className="px-3 py-2">{row.branch_name}</td>
                              <td className="px-3 py-2 tabular-nums">
                                <EvaluationMetricCell actual="Attendance total" score={row.attendance.total_score} maxScore={row.attendance.max_score} />
                              </td>
                              <td className="px-3 py-2 tabular-nums">
                                <EvaluationMetricCell actual="Operation total" score={row.operation.total_score} maxScore={row.operation.max_score} />
                              </td>
                              <td className="px-3 py-2 tabular-nums">
                                <EvaluationMetricCell actual="Food cost total" score={row.food_cost.score} maxScore={row.food_cost.max_score} />
                              </td>
                              <td className="px-3 py-2 tabular-nums">
                                <EvaluationMetricCell actual="Disposal score" score={row.operation.scores.waste_score} maxScore={10} />
                              </td>
                              <td className="px-3 py-2 tabular-nums">
                                <EvaluationMetricCell actual="Backup score" score={row.operation.scores.prep_score} maxScore={10} />
                              </td>
                              <td className="px-3 py-2 tabular-nums font-semibold">
                                <EvaluationMetricCell actual="Overall total" score={row.overall_score} maxScore={row.overall_max_score} emphasize />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="px-3 py-2"><EmptyState message="No evaluation data" /></div>
                )}
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
                <div className="mb-2 flex flex-wrap items-end gap-3">
                  <div className="text-sm font-semibold">Daily Evaluation Scores (Selected Period)</div>
                  <button
                    type="button"
                    onClick={refreshEvaluationTimeline}
                    disabled={loading || !approverName.trim() || !salesStepUpReady}
                    className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-60"
                  >
                    Load Daily Scores
                  </button>
                </div>
                <div className="mb-3 text-xs text-neutral-500">
                  Shows daily scores from the selected period. `Company` is the city total, and each store column shows that day&apos;s store score.
                </div>
                {evaluationTimelineDays.length ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                        <tr>
                          <th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2">Company Avg</th>
                          <th className="px-3 py-2">Company Total</th>
                          {(evaluationTimeline?.stores || []).map((store) => (
                            <th key={`timeline-head-${store.branch_code}`} className="px-3 py-2">
                              {store.branch_name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {evaluationTimelineDays.map((day) => (
                          <tr key={`timeline-row-${day.date}`} className="border-b border-neutral-800/70">
                            <td className="px-3 py-2 tabular-nums">{day.date}</td>
                            <td className="px-3 py-2 tabular-nums font-semibold">{formatScore(day.company_avg_score)}</td>
                            <td className="px-3 py-2 tabular-nums">
                              {formatScore(day.company_total_score)} / {formatScore(day.company_total_max_score)}
                            </td>
                            {(evaluationTimeline?.stores || []).map((store) => {
                              const item = (day.stores || []).find((s) => s.branch_code === store.branch_code);
                              return (
                                <td key={`timeline-cell-${day.date}-${store.branch_code}`} className="px-3 py-2 tabular-nums">
                                  {item ? `${formatScore(item.overall_score)} / ${formatScore(item.overall_max_score)}` : "—"}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="px-3 py-2"><EmptyState message="No daily timeline data" /></div>
                )}
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
                <div className="mb-2 flex flex-wrap items-end gap-3">
                  <div className="text-sm font-semibold">Daily Report Details (Disposal / Backup)</div>
                  <label className="text-xs text-neutral-400">
                    Target Date
                    <input
                      type="date"
                      value={evaluationDetailDate}
                      onChange={(e) => handleEvaluationDetailDateChange(e.target.value)}
                      className="mt-1 w-full min-w-[180px] rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => refreshEvaluationDayDetails(evaluationDetailDate)}
                    disabled={loading || !approverName.trim() || !salesStepUpReady}
                    className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-60"
                  >
                    Load Daily Reports
                  </button>
                </div>
                <div className="mb-3 text-xs text-neutral-500">
                  For a specific date, this table shows each store&apos;s submitted disposal and backup report contents.
                </div>
                {(evaluationDayDetails?.stores || []).length ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                        <tr>
                          <th className="px-3 py-2">Store</th>
                          <th className="px-3 py-2">Score</th>
                          <th className="px-3 py-2">Orders</th>
                          <th className="px-3 py-2">Backup Qty / 100</th>
                          <th className="px-3 py-2">Disposal Reports</th>
                          <th className="px-3 py-2">Backup Reports</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(evaluationDayDetails?.stores || []).map((store) => (
                          <tr key={`daily-detail-${store.branch_code}`} className="border-b border-neutral-800/70 align-top">
                            <td className="px-3 py-2">{store.branch_name}</td>
                            <td className="px-3 py-2 tabular-nums">
                              {formatScore(store.overall_score)} / {formatScore(store.overall_max_score)}
                            </td>
                            <td className="px-3 py-2 tabular-nums">{formatCount(Number(store.order_count || 0))}</td>
                            <td className="px-3 py-2 tabular-nums">
                              {store.backup_quantity_per_100_orders == null ? "—" : formatDecimal(Number(store.backup_quantity_per_100_orders), 2)}
                            </td>
                            <td className="px-3 py-2">
                              {store.disposal_reports?.length ? (
                                <div className="space-y-1">
                                  {store.disposal_reports.slice(0, 8).map((r, idx) => (
                                    <div key={`disp-${store.branch_code}-${idx}`} className="rounded-lg border border-neutral-800 bg-neutral-950/50 px-2 py-1 text-xs">
                                      <div className="text-neutral-400">
                                        {r.submitted_at || "—"} {r.reporter ? `· ${r.reporter}` : ""}
                                      </div>
                                      <div className="mt-0.5 text-neutral-200">{r.detail || "—"}</div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-neutral-500">No disposal report</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {store.backup_reports?.length ? (
                                <div className="space-y-1">
                                  {store.backup_reports.slice(0, 8).map((r, idx) => (
                                    <div key={`prep-${store.branch_code}-${idx}`} className="rounded-lg border border-neutral-800 bg-neutral-950/50 px-2 py-1 text-xs">
                                      <div className="text-neutral-400">
                                        {r.submitted_at || "—"} {r.reporter ? `· ${r.reporter}` : ""}
                                      </div>
                                      <div className="mt-0.5 text-neutral-200">{r.detail || "—"}</div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-neutral-500">No backup report</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="px-3 py-6 text-center text-sm text-neutral-500">No daily report details</div>
                )}
              </div>

              {isHQOrAdmin ? (
                <div className="rounded-2xl border border-sky-900/40 bg-sky-950/10 p-4">
                  <div className="mb-2 text-sm font-semibold">Scoring Strictness</div>
                  <div className="mb-3 text-xs text-neutral-500">
                    Move the bar toward `Strict` to make deductions harsher, or toward `Lenient` to make scoring easier.
                    `5` is the neutral baseline. Loaded {formatCount(evaluationRules.length)} active rules.
                  </div>
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 px-4 py-4">
                    <div className="mb-3 flex items-center justify-between text-xs text-neutral-400">
                      <span>Lenient</span>
                      <span className="rounded-full border border-sky-700/50 bg-sky-500/10 px-3 py-1 text-sm font-semibold text-sky-200">
                        Level {evaluationStrictnessLevel}
                      </span>
                      <span>Strict</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      step={1}
                      value={evaluationStrictnessLevel}
                      onChange={(e) => setEvaluationStrictnessLevel(Number(e.target.value))}
                      className="w-full accent-sky-400"
                    />
                    <div className="mt-3 flex items-center justify-between text-[11px] text-neutral-500">
                      <span>1</span>
                      <span>5 = neutral</span>
                      <span>10</span>
                    </div>
                    <div className="mt-3 text-xs text-neutral-400">
                      Example:
                      {evaluationStrictnessLevel > 5
                        ? " level 6 narrows pass bands and makes the same results score a bit lower."
                        : evaluationStrictnessLevel < 5
                          ? " level 4 widens pass bands and makes the same results score a bit easier."
                          : " level 5 keeps the default balanced thresholds."}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={saveEvaluationRules}
                      disabled={evaluationSavingRules || !approverName.trim() || !salesStepUpReady}
                      className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-60"
                    >
                      {evaluationSavingRules ? "Saving..." : "Save Strictness"}
                    </button>
                    {evaluationRuleMessage ? <div className="text-xs text-amber-200">{evaluationRuleMessage}</div> : null}
                  </div>
                </div>
              ) : null}
            </div>
            ) : null}

            {evaluationSectionView === "all" || evaluationSectionView === "attendance" ? (
            <div id="evaluation-attendance" className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
              <div className="mb-2 text-sm font-semibold">Attendance Score</div>
              <div className="mb-3 text-xs text-neutral-500">
                This category looks at lateness, absences, shift-change requests, and shift preservation. Fewer late
                arrivals, fewer absences, and fewer requests score better. A higher shift preservation rate also scores better.
              </div>
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                  <tr>
                    <th className="px-3 py-2">Store</th>
                    <th className="px-3 py-2">Late Count</th>
                    <th className="px-3 py-2">Absence Count</th>
                    <th className="px-3 py-2">Shift Requests</th>
                    <th className="px-3 py-2">Shift Preserve</th>
                    <th className="px-3 py-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluationStores.map((row) => (
                    <tr key={`attendance-${row.branch_code}`} className="border-b border-neutral-800/70">
                      <td className="px-3 py-2">{row.branch_name}</td>
                      <td className="px-3 py-2 tabular-nums">
                        <EvaluationMetricCell actual={`${formatCount(row.attendance.late_count)} late`} score={row.attendance.scores.late_score} />
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        <EvaluationMetricCell actual={`${formatCount(row.attendance.absence_count)} absences`} score={row.attendance.scores.absence_score} />
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        <EvaluationMetricCell actual={`${formatCount(row.attendance.shift_change_request_count)} requests`} score={row.attendance.scores.shift_change_score} />
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        <EvaluationMetricCell actual={`${formatPct(Number(row.attendance.shift_preserve_rate || 0) * 100)} kept`} score={row.attendance.scores.shift_preserve_score} />
                      </td>
                      <td className="px-3 py-2 tabular-nums font-semibold">
                        <EvaluationMetricCell actual="Attendance total" score={row.attendance.total_score} maxScore={row.attendance.max_score} emphasize />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 rounded-xl border border-neutral-800/80 bg-neutral-950/40 p-3">
                <div className="mb-2 flex flex-wrap items-end gap-3">
                  <div className="text-xs font-semibold text-neutral-200">Selected Day Backup Report Details</div>
                  <label className="text-xs text-neutral-400">
                    Date
                    <input
                      type="date"
                      value={evaluationDetailDate}
                      onChange={(e) => handleEvaluationDetailDateChange(e.target.value)}
                      className="mt-1 rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-white"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => refreshEvaluationDayDetails(evaluationDetailDate)}
                    disabled={loading || !approverName.trim() || !salesStepUpReady}
                    className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-60"
                  >
                    Load Backup Details
                  </button>
                </div>
                {(evaluationDayDetails?.stores || []).length ? (
                  <div className="space-y-2">
                    {(evaluationDayDetails?.stores || []).map((store) => (
                      <div key={`backup-daily-${store.branch_code}`} className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-2">
                        <div className="text-xs font-semibold text-neutral-200">
                          {store.branch_name} · Orders {formatCount(Number(store.order_count || 0))} · Backup qty/100{" "}
                          {store.backup_quantity_per_100_orders == null ? "—" : formatDecimal(Number(store.backup_quantity_per_100_orders), 2)}
                        </div>
                        {store.backup_reports?.length ? (
                          <div className="mt-1 space-y-1">
                            {store.backup_reports.slice(0, 6).map((r, idx) => (
                              <div key={`backup-daily-item-${store.branch_code}-${idx}`} className="text-xs text-neutral-300">
                                {r.submitted_at || "—"} {r.reporter ? `· ${r.reporter}` : ""} · {r.detail || "—"}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-1 text-xs text-neutral-500">No backup report for this date</div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-neutral-500">
                    {summaryDateFrom === summaryDateTo
                      ? "No backup details loaded yet. Click Load Backup Details."
                      : "Select one date and click Load Backup Details to review that day’s backup content."}
                  </div>
                )}
              </div>
            </div>
            ) : null}

            {evaluationSectionView === "all" || evaluationSectionView === "operation" ? (
            <div id="evaluation-operation" className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
              <div className="mb-2 text-sm font-semibold">Operation Score</div>
              <div className="mb-3 text-xs text-neutral-500">
                This category looks at completion speed, product quality, image upload rate, waste reporting, and prep
                reporting. Waste now scores by both submission consistency and plausibility vs sales volume, and prep scores
                by both submission consistency and required prep volume. Operation time currently uses the city-level average
                for the selected period.
              </div>
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                  <tr>
                    <th className="px-3 py-2">Store</th>
                    <th className="px-3 py-2">Op Time</th>
                    <th className="px-3 py-2">QC Grade</th>
                    <th className="px-3 py-2">Quality Point</th>
                    <th className="px-3 py-2">Image Upload</th>
                    <th className="px-3 py-2">Image Count</th>
                    <th className="px-3 py-2">Waste Reporting</th>
                    <th className="px-3 py-2">Prep Reporting</th>
                    <th className="px-3 py-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluationStores.map((row) => (
                    <tr key={`operation-${row.branch_code}`} className="border-b border-neutral-800/70">
                      <td className="px-3 py-2">{row.branch_name}</td>
                      <td className="px-3 py-2 tabular-nums">
                        <EvaluationMetricCell actual={`Op time ${formatMinutes(row.operation.operation_time_minutes)}`} score={row.operation.scores.operation_time_score} />
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        <EvaluationMetricCell actual={`QC ${formatScore(row.operation.qc_grade_avg)} / 10`} score={null} />
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        <EvaluationMetricCell actual="QC metric score" score={row.operation.scores.qc_score} />
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        <EvaluationMetricCell actual={`${formatPct(Number(row.operation.image_upload_rate || 0) * 100)} uploaded`} score={row.operation.scores.image_upload_score} />
                      </td>
                      <td className="px-3 py-2 tabular-nums text-sm text-neutral-200">
                        {formatCount(Number(row.operation.total_photos || 0))} photos
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        <EvaluationMetricCell
                          actual={`${formatPct(Number(row.operation.waste_report_coverage || 0) * 100)} cov · ${row.operation.waste_report_quantity_per_100_orders == null ? "—" : formatDecimal(Number(row.operation.waste_report_quantity_per_100_orders), 2)} qty/100`}
                          score={row.operation.scores.waste_score}
                        />
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        <EvaluationMetricCell
                          actual={`${formatPct(Number(row.operation.prep_report_coverage || 0) * 100)} cov · ${formatDecimal(Number(row.operation.prep_report_rows_per_day || 0), 1)}/${formatDecimal(Number(row.operation.prep_expected_rows_per_day || 0), 1)} rows/day · ${row.operation.prep_report_quantity_per_100_orders == null ? "—" : formatDecimal(Number(row.operation.prep_report_quantity_per_100_orders), 2)} qty/100`}
                          score={row.operation.scores.prep_score}
                        />
                      </td>
                      <td className="px-3 py-2 tabular-nums font-semibold">
                        <EvaluationMetricCell actual="Operation total" score={row.operation.total_score} maxScore={row.operation.max_score} emphasize />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            ) : null}

            {evaluationSectionView === "all" || evaluationSectionView === "disposal" ? (
            <div id="evaluation-disposal" className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
              <div className="mb-2 text-sm font-semibold">Disposal Reporting</div>
              <div className="mb-3 text-xs text-neutral-500">
                Disposal score uses both reporting coverage and realism against sales volume. Very low disposal quantity with high sales is penalized to reduce under-reporting.
              </div>
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                  <tr>
                    <th className="px-3 py-2">Store</th>
                    <th className="px-3 py-2">Coverage</th>
                    <th className="px-3 py-2">Rows/Day</th>
                    <th className="px-3 py-2">Qty per 100 Orders</th>
                    <th className="px-3 py-2">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluationStores.map((row) => (
                    <tr key={`disposal-${row.branch_code}`} className="border-b border-neutral-800/70">
                      <td className="px-3 py-2">{row.branch_name}</td>
                      <td className="px-3 py-2 tabular-nums">{formatPct(Number(row.operation.waste_report_coverage || 0) * 100)}</td>
                      <td className="px-3 py-2 tabular-nums">{formatDecimal(Number(row.operation.waste_report_rows_per_day || 0), 2)}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {row.operation.waste_report_quantity_per_100_orders == null ? "—" : formatDecimal(Number(row.operation.waste_report_quantity_per_100_orders), 2)}
                      </td>
                      <td className="px-3 py-2 tabular-nums font-semibold">
                        <EvaluationMetricCell actual="Disposal score" score={row.operation.scores.waste_score} maxScore={10} emphasize />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            ) : null}

            {evaluationSectionView === "all" || evaluationSectionView === "backup" ? (
            <div id="evaluation-backup" className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
              <div className="mb-2 text-sm font-semibold">Backup Reporting</div>
              <div className="mb-3 text-xs text-neutral-500">
                Backup score checks submission coverage and whether reported prep volume is enough for the observed order volume.
              </div>
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                  <tr>
                    <th className="px-3 py-2">Store</th>
                    <th className="px-3 py-2">Coverage</th>
                    <th className="px-3 py-2">Rows/Day</th>
                    <th className="px-3 py-2">Expected Rows/Day</th>
                    <th className="px-3 py-2">Backup Qty / 100 Orders</th>
                    <th className="px-3 py-2">Target Range</th>
                    <th className="px-3 py-2">Score</th>
                    <th className="px-3 py-2">Report Content (Selected Date)</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluationStores.map((row) => (
                    <tr key={`backup-${row.branch_code}`} className="border-b border-neutral-800/70">
                      <td className="px-3 py-2">{row.branch_name}</td>
                      <td className="px-3 py-2 tabular-nums">{formatPct(Number(row.operation.prep_report_coverage || 0) * 100)}</td>
                      <td className="px-3 py-2 tabular-nums">{formatDecimal(Number(row.operation.prep_report_rows_per_day || 0), 2)}</td>
                      <td className="px-3 py-2 tabular-nums">{formatDecimal(Number(row.operation.prep_expected_rows_per_day || 0), 2)}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {row.operation.prep_report_quantity_per_100_orders == null
                          ? "—"
                          : formatDecimal(Number(row.operation.prep_report_quantity_per_100_orders), 2)}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {row.operation.prep_target_low_per_100_orders == null || row.operation.prep_target_high_per_100_orders == null
                          ? "—"
                          : `${formatDecimal(Number(row.operation.prep_target_low_per_100_orders), 1)} - ${formatDecimal(Number(row.operation.prep_target_high_per_100_orders), 1)}`}
                      </td>
                      <td className="px-3 py-2 tabular-nums font-semibold">
                        <EvaluationMetricCell actual="Backup score" score={row.operation.scores.prep_score} maxScore={10} emphasize />
                      </td>
                      <td className="px-3 py-2">
                        {(() => {
                          const detail = evaluationDayDetailsByBranch.get(String(row.branch_code || "").toUpperCase());
                          const reports = detail?.backup_reports || [];
                          if (!reports.length) {
                            return <span className="text-xs text-neutral-500">No backup report for selected date</span>;
                          }
                          return (
                            <div className="space-y-1">
                              {reports.slice(0, 3).map((r, idx) => (
                                <div key={`backup-inline-${row.branch_code}-${idx}`} className="text-xs text-neutral-300">
                                  {r.submitted_at || "—"} {r.reporter ? `· ${r.reporter}` : ""} · {r.detail || "—"}
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            ) : null}

            {evaluationSectionView === "all" || evaluationSectionView === "foodCost" ? (
            <div id="evaluation-food-cost" className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
              <div className="mb-2 text-sm font-semibold">Food Cost Score</div>
              <div className="mb-3 text-xs text-neutral-500">
                This category compares actual food cost percentage against the target percentage. Staying at or below target
                scores better, while going above target reduces the score.
              </div>
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                  <tr>
                    <th className="px-3 py-2">Store</th>
                    <th className="px-3 py-2">Actual Food Cost %</th>
                    <th className="px-3 py-2">Target %</th>
                    <th className="px-3 py-2">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluationStores.map((row) => (
                    <tr key={`food-${row.branch_code}`} className="border-b border-neutral-800/70">
                      <td className="px-3 py-2">{row.branch_name}</td>
                      <td className="px-3 py-2 tabular-nums">{formatPct(Number(row.food_cost.food_cost_pct || 0))}</td>
                      <td className="px-3 py-2 tabular-nums">{formatPct(Number(row.food_cost.target_pct || 0))}</td>
                      <td className="px-3 py-2 tabular-nums font-semibold">
                        <EvaluationMetricCell actual="Food cost result" score={row.food_cost.score} maxScore={row.food_cost.max_score} emphasize />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            ) : null}

            {evaluationSectionView === "all" || evaluationSectionView === "purchasing" ? (
            <div id="evaluation-purchasing" className="rounded-2xl border border-amber-900/40 bg-amber-950/10 p-4">
              <div className="text-sm font-semibold">Purchasing</div>
              <div className="mt-2 text-sm text-neutral-300">Under construction</div>
              <div className="mt-1 text-xs text-neutral-500">Store procurement data source will be connected in a later phase.</div>
            </div>
            ) : null}

            {evaluationSectionView === "all" || evaluationSectionView === "inventoryAccuracy" ? (
            <div id="evaluation-inventory-accuracy" className="rounded-2xl border border-amber-900/40 bg-amber-950/10 p-4">
              <div className="text-sm font-semibold">Inventory Accuracy</div>
              <div className="mt-2 text-sm text-neutral-300">Under construction</div>
              <div className="mt-1 text-xs text-neutral-500">Theory vs actual inventory data is not ready yet, so this channel is reserved for future rollout.</div>
            </div>
            ) : null}
          </div>
          ) : analyticsTab === "procurement" ? (
          <ProcurementAnalyticsSection />
          ) : analyticsTab === "finance" ? (
          financeStepUpReady ? (
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
                <div className="grid w-full gap-2 sm:w-auto sm:min-w-[360px]">
                  <label className="text-xs text-neutral-400">
                    Summary Range (same as Sales Summary)
                    <DateRangePicker
                      value={{ from: summaryDateFrom, to: summaryDateTo }}
                      onChange={(range) => {
                        handleSummaryDateFromChange(range.from);
                        handleSummaryDateToChange(range.to);
                      }}
                      className="mt-1"
                    />
                  </label>
                  <label className="text-xs text-neutral-400">
                    Month Quick Select
                    <MonthPicker value={summaryMonthKey} onChange={handleSummaryMonthChange} className="mt-1" />
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
                  disabled={loading || !approverName.trim() || !financeStepUpReady}
                  className="ml-auto rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-60"
                >
                  {loading ? <span className="inline-flex items-center gap-2"><Spinner size="sm" /> Loading...</span> : "Refresh P&L"}
                </button>
              </div>
              <div className="text-xs text-neutral-500">
                The period matches <span className="text-neutral-300">Sales Analytics → Summary From/To</span>. Top KPI
                cards prioritize imported <span className="text-neutral-300">P&amp;L revenue / opex / profit</span> when
                available (to align with workbook totals). POS metrics remain for operations (orders/menu/store ranking).
                HQ/Admin and city management only.
              </div>
              <div className="mt-4 rounded-2xl border border-neutral-800/80 bg-neutral-950/50 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setFinanceSectionView("all")}
                    aria-pressed={financeSectionView === "all"}
                    className={
                      financeSectionView === "all"
                        ? "inline-flex min-h-11 items-center justify-center rounded-xl border border-violet-400/70 bg-gradient-to-r from-violet-500/25 to-fuchsia-500/20 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(139,92,246,0.18)] transition"
                        : "inline-flex min-h-11 items-center justify-center rounded-xl border border-transparent bg-neutral-900/70 px-4 py-2.5 text-sm font-medium text-neutral-300 transition hover:border-neutral-700 hover:bg-neutral-800 hover:text-white"
                    }
                  >
                    All
                  </button>
                  {FINANCE_SECTION_OPTIONS.filter((section) => (section.value === "payroll" ? isHQOrAdmin : true)).map((section) => (
                    <button
                      key={section.value}
                      type="button"
                      onClick={() => setFinanceSectionView(section.value)}
                      aria-pressed={financeSectionView === section.value}
                      className={
                        financeSectionView === section.value
                          ? "inline-flex min-h-11 items-center justify-center rounded-xl border border-violet-400/70 bg-gradient-to-r from-violet-500/25 to-fuchsia-500/20 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(139,92,246,0.18)] transition"
                          : "inline-flex min-h-11 items-center justify-center rounded-xl border border-transparent bg-neutral-900/70 px-4 py-2.5 text-sm font-medium text-neutral-300 transition hover:border-neutral-700 hover:bg-neutral-800 hover:text-white"
                      }
                    >
                      {section.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-start gap-4 border-t border-neutral-800 pt-3">
                <div className="min-w-[240px] flex-1 text-xs text-neutral-400">
                  <span className="font-semibold text-neutral-300">Sync monthly P&amp;L (Google)</span>
                  <p className="mt-1 max-w-xl leading-relaxed">
                    Reads all month tabs from the PL Google Sheet for the selected city and upserts them to the app DB.
                    Use <span className="text-neutral-300">Summary From/To</span> to choose which month to analyze after
                    syncing.
                  </p>
                  <button
                    type="button"
                    onClick={() => void syncPlFromGoogle()}
                    disabled={plSyncing || !approverName.trim() || !financeStepUpReady}
                    className="mt-2 rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-neutral-900 disabled:opacity-60"
                  >
                    {plSyncing ? "Syncing..." : "Sync P&L from Google"}
                  </button>
                  {plSyncMessage ? (
                    <span className="mt-1 block text-xs text-amber-200/90">{plSyncMessage}</span>
                  ) : null}
                </div>
              </div>
            </div>

            {financeSectionView === "all" || financeSectionView === "summary" ? (
            <div id="finance-summary" className="grid grid-cols-2 gap-3 lg:grid-cols-6">
              <div className="flex min-h-[120px] flex-col rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="min-h-[32px] text-xs leading-4 text-neutral-500">Revenue (P&amp;L imported)</div>
                <MetricValue
                  className={NUMERIC_BLOCK_VALUE}
                  value={plHeadline ? plHeadline.revenue : isStoreScopedView ? "—" : Number(financeRatio?.sales_total ?? 0)}
                />
              </div>
              <div className="flex min-h-[120px] flex-col rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="min-h-[32px] text-xs leading-4 text-neutral-500">Opex (P&amp;L rollup)</div>
                <MetricValue
                  className={NUMERIC_BLOCK_VALUE}
                  value={plHeadline ? plHeadline.opex : isStoreScopedView ? "—" : financeBreakdown ? financeBreakdown.totalModeledCost : "—"}
                />
              </div>
              <div className="flex min-h-[120px] flex-col rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="min-h-[32px] text-xs leading-4 text-neutral-500">Operating profit (P&amp;L)</div>
                <MetricValue
                  className={NUMERIC_BLOCK_VALUE}
                  value={plHeadline ? plHeadline.profit : isStoreScopedView ? "—" : Number(financeRatio?.estimated_profit_using_targets ?? 0)}
                />
              </div>
              <div className="flex min-h-[120px] flex-col rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="min-h-[32px] text-xs leading-4 text-neutral-500">FLR cost total</div>
                <MetricValue className={NUMERIC_BLOCK_VALUE} value={plHeadline ? plHeadline.flrCost : "—"} />
              </div>
              <div className="flex min-h-[120px] flex-col rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="min-h-[32px] text-xs leading-4 text-neutral-500">Other expenses total</div>
                <MetricValue className={NUMERIC_BLOCK_VALUE} value={plHeadline ? plHeadline.otherExpenses : "—"} />
              </div>
              <div className="flex min-h-[120px] flex-col rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="min-h-[32px] text-xs leading-4 text-neutral-500">Labor ratio (P&amp;L labor ÷ revenue)</div>
                <div className={NUMERIC_BLOCK_VALUE}>
                  {plHeadline
                    ? formatPct(plHeadline.laborRatioPct)
                    : isStoreScopedView
                    ? "—"
                    : formatPct(Number(financeRatio?.labor_ratio || 0) * 100)}
                </div>
              </div>
            </div>
            ) : null}

            {financeSectionView === "all" || financeSectionView === "breakEven" ? (
            <div id="finance-break-even" className="rounded-2xl border border-emerald-900/40 bg-emerald-950/10 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-sm font-semibold text-emerald-100">Break-even guidance</div>
                {breakEven?.basis ? (
                  <div className="text-[11px] text-neutral-500">
                    Basis: {formatBreakEvenBasis(breakEven.basis.mode)}
                    {breakEven.basis.mode === "previous_month_fallback" ? " (auto fallback)" : ""}
                  </div>
                ) : null}
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                Uses rolling 30 days when all required data is available; otherwise falls back to the previous full month.
              </div>
              {breakEven?.basis ? (
                <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-neutral-400 md:grid-cols-3">
                  <div>
                    Range: <span className="text-neutral-200">{breakEven.basis.date_from} to {breakEven.basis.date_to}</span>
                  </div>
                  <div>
                    POS coverage:{" "}
                    <span className="text-neutral-200">
                      {formatCount(Number(breakEven.completeness?.pos_days_present || 0))}/{formatCount(Number(breakEven.completeness?.pos_days_expected || 0))} days
                    </span>
                  </div>
                  <div>
                    P&amp;L months:{" "}
                    <span className="text-neutral-200">
                      {formatCount(Number(breakEven.completeness?.pl_months_present?.length || 0))}/{formatCount(Number(breakEven.completeness?.pl_months_expected?.length || 0))}
                    </span>
                  </div>
                </div>
              ) : null}
              {breakEven?.basis?.fallback_reason ? (
                <div className="mt-2 rounded-xl border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-100">
                  {formatBreakEvenFallbackReason(breakEven.basis.fallback_reason)}
                  {(breakEven.completeness?.rolling_reasons || []).length ? (
                    <div className="mt-2 space-y-1 text-[11px] text-amber-100/90">
                      <div className="font-semibold text-amber-50">Rolling 30d was missing:</div>
                      {(breakEven.completeness?.rolling_reasons || []).map((reason) => (
                        <div key={`rolling-${reason}`}>- {formatBreakEvenReasonLabel(reason)}</div>
                      ))}
                      {(breakEven.completeness?.rolling_missing_pl_months || []).length ? (
                        <div>Missing P&amp;L months: {formatBreakEvenMissingDates(breakEven.completeness?.rolling_missing_pl_months)}</div>
                      ) : null}
                      {(breakEven.completeness?.rolling_missing_pos_dates || []).length ? (
                        <div>Missing POS dates: {formatBreakEvenMissingDates(breakEven.completeness?.rolling_missing_pos_dates)}</div>
                      ) : null}
                      {(breakEven.completeness?.rolling_missing_pos_store_details || []).slice(0, 8).map((item) => (
                        <div key={`rolling-store-${item.store_name}`}>
                          {item.store_name}: {formatBreakEvenMissingDates(item.missing_dates)}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {(breakEven?.completeness?.selected_reasons || []).length ? (
                <div className="mt-2 rounded-xl border border-rose-900/40 bg-rose-950/20 px-3 py-2 text-xs text-rose-100">
                  <div className="font-semibold text-rose-50">
                    {breakEven.basis?.mode === "previous_month_fallback" ? "Fallback month is still missing:" : "Current window is still missing:"}
                  </div>
                  <div className="mt-2 space-y-1 text-[11px] text-rose-100/90">
                    {(breakEven.completeness?.selected_reasons || []).map((reason) => (
                      <div key={`selected-${reason}`}>- {formatBreakEvenReasonLabel(reason)}</div>
                    ))}
                    {(breakEven.completeness?.missing_pl_months || []).length ? (
                      <div>Missing P&amp;L months: {formatBreakEvenMissingDates(breakEven.completeness?.missing_pl_months)}</div>
                    ) : null}
                    {(breakEven.completeness?.missing_pos_dates || []).length ? (
                      <div>Missing POS dates: {formatBreakEvenMissingDates(breakEven.completeness?.missing_pos_dates)}</div>
                    ) : null}
                    {(breakEven.completeness?.missing_pos_store_details || []).slice(0, 8).map((item) => (
                      <div key={`selected-store-${item.store_name}`}>
                        {item.store_name}: {formatBreakEvenMissingDates(item.missing_dates)}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {breakEven?.ok && breakEven.summary ? (
                <>
                  <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                      <div className="min-h-[32px] text-xs leading-4 text-neutral-500">Break-even sales / day</div>
                      <div className={NUMERIC_BLOCK_VALUE}>
                        {breakEven.summary.break_even_sales_per_day != null ? formatMoney(Number(breakEven.summary.break_even_sales_per_day || 0)) : "—"}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                      <div className="min-h-[32px] text-xs leading-4 text-neutral-500">Break-even orders / day</div>
                      <div className={NUMERIC_BLOCK_VALUE}>
                        {breakEven.summary.break_even_orders_per_day != null ? formatDecimal(Number(breakEven.summary.break_even_orders_per_day || 0), 1) : "—"}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                      <div className="min-h-[32px] text-xs leading-4 text-neutral-500">Safety margin</div>
                      <div className={NUMERIC_BLOCK_VALUE}>
                        {breakEven.summary.margin_of_safety_pct != null ? formatPct(Number(breakEven.summary.margin_of_safety_pct || 0) * 100) : "—"}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                      <div className="min-h-[32px] text-xs leading-4 text-neutral-500">Days to break-even</div>
                      <div className={NUMERIC_BLOCK_VALUE}>{formatBreakEvenDays(breakEven.summary.days_to_break_even)}</div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                      <div className="min-h-[32px] text-xs leading-4 text-neutral-500">Average sales / order</div>
                      <div className={NUMERIC_SMALL_BLOCK_VALUE}>
                        {breakEven.summary.avg_sales_per_order != null ? formatMoney(Number(breakEven.summary.avg_sales_per_order || 0)) : "—"}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                      <div className="min-h-[32px] text-xs leading-4 text-neutral-500">Operating profit / order</div>
                      <div className={NUMERIC_SMALL_BLOCK_VALUE}>
                        {breakEven.summary.profit_per_order != null ? formatMoney(Number(breakEven.summary.profit_per_order || 0)) : "—"}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                      <div className="min-h-[32px] text-xs leading-4 text-neutral-500">Contribution margin %</div>
                      <div className={NUMERIC_SMALL_BLOCK_VALUE}>
                        {breakEven.summary.contribution_margin_ratio != null ? formatPct(Number(breakEven.summary.contribution_margin_ratio || 0) * 100) : "—"}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                      <div className="min-h-[32px] text-xs leading-4 text-neutral-500">Orders in period</div>
                      <div className={NUMERIC_SMALL_BLOCK_VALUE}>{formatCount(Number(breakEven.summary.orders || 0))}</div>
                    </div>
                  </div>
                  {breakEven.scope === "company" && (breakEven.stores || []).length ? (
                    <div className="mt-4 overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-950/30">
                      <table className="min-w-full text-left text-sm">
                        <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                          <tr>
                            <th className={TABLE_HEADER + " px-3 py-3 text-left"}>Store</th>
                            <th className={TABLE_HEADER + " px-3 py-3 text-left"}>Sales</th>
                            <th className={TABLE_HEADER + " px-3 py-3 text-left"}>Orders</th>
                            <th className={TABLE_HEADER + " px-3 py-3 text-left"}>Avg sales / order</th>
                            <th className={TABLE_HEADER + " px-3 py-3 text-left"}>Operating profit</th>
                            <th className={TABLE_HEADER + " px-3 py-3 text-left"}>Profit / order</th>
                            <th className={TABLE_HEADER + " px-3 py-3 text-left"}>BE sales / day</th>
                            <th className={TABLE_HEADER + " px-3 py-3 text-left"}>BE orders / day</th>
                            <th className={TABLE_HEADER + " px-3 py-3 text-left"}>Safety margin %</th>
                            <th className={TABLE_HEADER + " px-3 py-3 text-left"}>Days to break-even</th>
                            <th className={TABLE_HEADER + " px-3 py-3 text-left"}>Basis</th>
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
                              <td className={TABLE_CELL + " px-3 tabular-nums"}>
                                {row.margin_of_safety_pct != null ? formatPct(Number(row.margin_of_safety_pct || 0) * 100) : "—"}
                              </td>
                              <td className={TABLE_CELL + " px-3 tabular-nums"}>{formatBreakEvenDays(row.days_to_break_even)}</td>
                              <td className={TABLE_CELL + " px-3"}>{formatBreakEvenBasis(row.basis_mode)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-3 text-sm text-neutral-300">
                  {breakEven?.detail || "Break-even data will appear after the next refresh."}
                </div>
              )}
            </div>
            ) : null}

            {financeSectionView === "all" || financeSectionView === "plDetails" ? (
              plVsTarget?.ok ? (
              <div id="finance-pl-details" className="rounded-2xl border border-violet-900/40 bg-violet-950/10 p-4 text-sm">
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
            )
            ) : null}

            {(financeSectionView === "all" || financeSectionView === "payroll") && isHQOrAdmin ? (
              <div id="finance-payroll" className="rounded-2xl border border-sky-900/40 bg-sky-950/10 p-4">
                <div className="mb-4 flex flex-wrap items-end gap-3">
                  <div className="min-w-[200px] flex-1 sm:min-w-[240px]">
                    <div className="text-sm font-semibold">Payroll Channel (HQ only)</div>
                    <div className="mt-1 text-xs text-neutral-500">
                      Uses the same <span className="text-neutral-300">Summary From/To</span> as Management P&amp;L.
                      Bayzat exports are synced from <code className="text-neutral-400">PAYROLL_FOLDER_ID</code>.
                    </div>
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
                      onClick={() => loadAll("finance")}
                      disabled={loading || !approverName.trim() || !financeStepUpReady}
                      className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-60"
                    >
                      {loading ? <span className="inline-flex items-center gap-2"><Spinner size="sm" /> Loading...</span> : "Refresh Payroll"}
                    </button>
                    <button
                      type="button"
                      onClick={syncPayrollNow}
                      disabled={payrollSyncing || !approverName.trim() || !financeStepUpReady}
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

                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    <div className="text-xs text-neutral-500">Payroll Total (Net Pay)</div>
                    <MetricValue className={NUMERIC_BLOCK_VALUE} value={payrollSummary.totalNetPay} />
                  </div>
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    <div className="text-xs text-neutral-500">Basic Salary</div>
                    <MetricValue className={NUMERIC_BLOCK_VALUE} value={payrollSummary.basicSalary} />
                  </div>
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    <div className="text-xs text-neutral-500">Accommodation</div>
                    <MetricValue className={NUMERIC_BLOCK_VALUE} value={payrollSummary.accommodation} />
                  </div>
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    <div className="text-xs text-neutral-500">Transportation</div>
                    <MetricValue className={NUMERIC_BLOCK_VALUE} value={payrollSummary.transportation} />
                  </div>
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    <div className="text-xs text-neutral-500">Staff Rows</div>
                    <MetricValue className={NUMERIC_BLOCK_VALUE} value={payrollSummary.rowCount} />
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-6">
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    <div className="text-xs text-neutral-500">Gross Pay (total)</div>
                    <MetricValue className={NUMERIC_SMALL_BLOCK_VALUE} value={payrollSummary.grossPay} />
                  </div>
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    <div className="text-xs text-neutral-500">Food allowance</div>
                    <MetricValue className={NUMERIC_SMALL_BLOCK_VALUE} value={payrollSummary.foodAllowance} />
                  </div>
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    <div className="text-xs text-neutral-500">Other allowance</div>
                    <MetricValue className={NUMERIC_SMALL_BLOCK_VALUE} value={payrollSummary.otherAllowance} />
                  </div>
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    <div className="text-xs text-neutral-500">Net additions</div>
                    <MetricValue className={NUMERIC_SMALL_BLOCK_VALUE} value={payrollSummary.netAdditions} />
                  </div>
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    <div className="text-xs text-neutral-500">Net deductions</div>
                    <MetricValue className={NUMERIC_SMALL_BLOCK_VALUE} value={payrollSummary.netDeductions} />
                  </div>
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    <div className="text-xs text-neutral-500">Arrears + / -</div>
                    <div className="mt-1 text-xl font-bold tabular-nums">
                      {formatMoney(payrollSummary.arrearsAddition - payrollSummary.arrearsDeduction)}
                    </div>
                  </div>
                </div>

                <div className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
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
                            <td className="px-3 py-2 tabular-nums">{formatMoney(Number(row.basic_salary || 0))}</td>
                            <td className="px-3 py-2 tabular-nums">{formatMoney(Number(row.accommodation || 0))}</td>
                            <td className="px-3 py-2 tabular-nums">{formatMoney(Number(row.food_allowance || 0))}</td>
                            <td className="px-3 py-2 tabular-nums">{formatMoney(Number(row.other_allowance || 0))}</td>
                            <td className="px-3 py-2 tabular-nums">{formatMoney(Number(row.transportation || 0))}</td>
                            <td className="px-3 py-2 tabular-nums">{formatMoney(Number(row.gross_pay || 0))}</td>
                            <td className="px-3 py-2 tabular-nums">
                              {formatMoney(Number(row.net_additions || 0) - Number(row.net_deductions || 0))}
                            </td>
                            <td className="px-3 py-2 font-medium tabular-nums text-sky-200">
                              {formatMoney(Number(row.total_net_pay || 0))}
                            </td>
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
            ) : null}

          </div>
          ) : (
          <div className="mt-8 rounded-2xl border border-amber-800/50 bg-amber-950/20 p-5 text-sm text-amber-100">
            <div className="font-semibold">Management P&amp;L is locked</div>
            <div className="mt-1 text-xs text-amber-100/90">
              This page requires recent MFA verification.
            </div>
            <div className="mt-2 text-xs text-amber-100/80">
              Access steps:
              <span className="block mt-1">1) Click <span className="font-semibold">Verify With Passkey</span> in the Security section.</span>
              <span className="block">2) If Passkey is unavailable, enter your Session PIN and retry to use PIN step-up.</span>
              <span className="block">3) After verification, reload this tab.</span>
            </div>
          </div>
          )
          ) : (
          <div className={`mt-8 p-6 ${GLASS_CARD} ${BODY_TEXT}`}>
            This channel is not available for your current role/city.
          </div>
          )}

          {analyticsTab === "staff" && canViewStaffChannel ? (
          <div className={GLASS_CARD + " mt-8 p-5"}>
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <LayoutDashboard className="h-4 w-4 text-violet-400" />
                  <h2 className={SECTION_TITLE}>Summary Analytics Period</h2>
                </div>
                <div className={BODY_TEXT}>
                  Period for total hours, top staff, city comparison, branch totals, and summary tables.
                </div>
                <div className={SUBTEXT + " mt-1"}>
                  This period affects only the Summary section.
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const pm = previousCalendarMonthRangeIso();
                    setSummaryDateFrom(pm.from);
                    setSummaryDateTo(pm.to);
                  }}
                  className={SECONDARY_BUTTON + " text-sm"}
                >
                  Reset to previous month
                </button>
                <button
                  type="button"
                  onClick={() => {
                    loadAll("staff");
                  }}
                  disabled={loading || !approverName.trim() || !financeStepUpReady}
                  className={PRIMARY_BUTTON + " flex items-center gap-2 text-sm"}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {loading ? "Loading..." : "Refresh Summary"}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <div className={LABEL_TEXT + " mb-1.5 block"}>Summary Range</div>
                <DateRangePicker
                  value={{ from: summaryDateFrom, to: summaryDateTo }}
                  onChange={(range) => {
                    handleSummaryDateFromChange(range.from);
                    handleSummaryDateToChange(range.to);
                  }}
                />
              </div>

              <div>
                <div className={LABEL_TEXT + " mb-1.5 block"}>Month Quick Select</div>
                <MonthPicker
                  value={summaryMonthKey}
                  onChange={handleSummaryMonthChange}
                />
              </div>
              
              <div>
                <div className={LABEL_TEXT + " mb-1.5 block"}>Summary Branch</div>
                <select
                  value={summaryBranchCode}
                  onChange={(e) => setSummaryBranchCode(e.target.value)}
                  className={SELECT_CLASS}
                >
                  {(BRANCH_OPTIONS[city] || [{ value: "", label: "All Branches" }]).map((opt) => (
                    <option key={opt.value || "ALL"} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          ) : null}

          <div className="my-8 border-t border-white/5" />

          {analyticsTab === "staff" && canViewStaffChannel ? (
          <motion.div
            className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5"
            variants={staggerContainerVariants}
            initial="hidden"
            animate="visible"
          >
            <motion.div className={KPI_CARD} variants={cardVariants}>
              <div className={KPI_LABEL}>Total Hours</div>
              <MetricValue className="mt-1 text-2xl font-bold tabular-nums break-words text-violet-300" value={summary.totalHours} />
            </motion.div>
            <motion.div className={KPI_CARD} variants={cardVariants}>
              <div className={KPI_LABEL}>Days</div>
              <MetricValue className={KPI_VALUE} value={summary.uniqueDays} />
            </motion.div>
            <motion.div className={KPI_CARD} variants={cardVariants}>
              <div className={KPI_LABEL}>Branches</div>
              <MetricValue className={KPI_VALUE} value={summary.uniqueBranches} />
            </motion.div>
            <motion.div className={`${KPI_CARD} md:col-span-2`} variants={cardVariants}>
              <div className={KPI_LABEL}>Top Staff</div>
              <div className="mt-1 text-base font-semibold text-emerald-400">{summary.topStaffName}</div>
              <div className={BODY_TEXT}>{summary.topStaffHours.toFixed(1)} hrs</div>
            </motion.div>
            <motion.div className={KPI_CARD} variants={cardVariants}>
              <div className={KPI_LABEL}>Top Absence</div>
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
              <div className={BODY_TEXT}>{summary.topAbsenceRows} rows</div>
            </motion.div>
          </motion.div>
          ) : null}

          {analyticsTab === "staff" ? (
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            <div className={KPI_CARD}>
              <div className={KPI_LABEL}>Net Sales Volume</div>
              <MetricValue className={KPI_VALUE} value={posSalesSummary.totalNetSales} />
            </div>
            <div className={KPI_CARD}>
              <div className={KPI_LABEL}>Gross Revenue</div>
              <MetricValue className={KPI_VALUE} value={posSalesSummary.totalGrossSales} />
            </div>
            <div className={KPI_CARD}>
              <div className={KPI_LABEL}>Order Count</div>
              <MetricValue className={KPI_VALUE} value={posSalesSummary.totalOrders} />
            </div>
            <div className={KPI_CARD}>
              <div className={KPI_LABEL}>Avg Net / Order</div>
              <MetricValue className={KPI_VALUE} value={posSalesSummary.avgRevenuePerOrder} />
            </div>
            <div className={KPI_CARD}>
              <div className={KPI_LABEL}>Days w/ Sales Data</div>
              <MetricValue className={KPI_VALUE} value={posSalesSummary.dayCount} />
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
                          <MetricValue className={NUMERIC_SMALL_BLOCK_VALUE} value={Number(s.total_hours || 0)} />
                        </div>
                        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
                          <div className="text-[11px] text-neutral-500">Avg / Day</div>
                          <MetricValue className={NUMERIC_SMALL_BLOCK_VALUE} value={Number(s.avg_hours_per_day || 0)} />
                        </div>
                        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
                          <div className="text-[11px] text-neutral-500">Days</div>
                          <MetricValue className={NUMERIC_SMALL_BLOCK_VALUE} value={s.day_count} />
                        </div>
                        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
                          <div className="text-[11px] text-neutral-500">Branches</div>
                          <MetricValue className={NUMERIC_SMALL_BLOCK_VALUE} value={s.branch_count} />
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
        </motion.div>
    </motion.div>
  );
}