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
  canViewManagementPl,
  canViewSalesAnalytics,
  clearStepUpAuth,
  getAuth,
  getAuthHeaders,
  refreshAuthFromApi,
  setStepUpAuth,
  stepUpSatisfies,
  tryRefreshAccessToken,
  type City,
} from "@/lib/auth";
import { startPasskeyAuthentication, startPasskeyRegistration } from "@/lib/webauthn";
import { normalizeCalendarDateInput } from "@/lib/dateInput";
import DateRangePicker from "@/components/DateRangePicker";
import MonthPicker from "@/components/MonthPicker";
import { ManilaSalesSection } from "@/components/analytics/ManilaSalesSection";
import { SalesDataCheckTable, type DataCheckCell, type DataCheckColumn } from "@/components/analytics/SalesDataCheckTable";
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
} from "@/lib/ui-tokens";
import { cardVariants, staggerContainerVariants, tabContentTransition } from "@/lib/motion-tokens";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { FlashValue } from "@/components/ui/FlashValue";
import AggregatorRatingsTab from "@/components/analytics/dubai/AggregatorRatingsTab";
import { ManilaRatingsTab } from "@/components/analytics/ManilaRatingsTab";
import ManilaAggregatorRatingsTab from "@/components/analytics/ManilaAggregatorRatingsTab";
import { ManilaGrabOfflineTab } from "@/components/analytics/ManilaGrabOfflineTab";
import { ManilaOverallRatingsTab } from "@/components/analytics/ManilaOverallRatingsTab";
import NumberOfOrdersTab from "@/components/analytics/dubai/NumberOfOrdersTab";
import { ManilaOrderCountsTab } from "@/components/analytics/ManilaOrderCountsTab";
import { ManilaSalesDataTab } from "@/components/analytics/ManilaSalesDataTab";
import { ManilaCashierEvaluationTab } from "@/components/analytics/ManilaCashierEvaluationTab";
import { ManilaCancellationsTab } from "@/components/analytics/ManilaCancellationsTab";
import { DubaiCancellationsTab } from "@/components/analytics/DubaiCancellationsTab";
import OvertimeTab from "./OvertimeTab";
import LateTab from "./LateTab";
import AbsenceTab from "./AbsenceTab";
import AdherenceTab from "./AdherenceTab";
import LeanShiftTab from "./LeanShiftTab";

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

function formatDateTimeLabel(value?: string | null) {
  const text = String(value || "").trim();
  if (!text) return "-";
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toLocaleString();
}

function normalizeAttendanceSyncMessage(raw: string, fallback: string) {
  const text = String(raw || "").trim();
  const lower = text.toLowerCase();
  if (!text) return fallback;
  if (lower.includes("invalid pin")) return "PINが正しくありません。";
  if (lower.includes("forbidden") || lower.includes("permission")) return "同期権限がありません（HQ/ADMIN のPIN確認が必要です）。";
  if (lower.includes("attendance drive source not found")) return "同期元設定が見つかりません。";
  if (lower.includes("no attendance files found")) return "Driveフォルダに対象ファイルがありません。";
  if (lower.includes("already imported") || lower.includes("duplicate")) return "最新ファイルは既に取り込み済みです。";
  return text;
}

async function apiGet<T = any>(path: string): Promise<T> {
  const request = async () =>
    fetch(`${getApiBase()}${path}`, {
      cache: "no-store",
      headers: getAuthHeaders(),
    });
  let res = await request();
  let text = await res.text();

  if (res.status === 401) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) {
      res = await request();
      text = await res.text();
    }
  }

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

  if (res.status === 401) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) {
      res = await request();
      text = await res.text();
    }
  }

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
  schedule_type?: "STANDARD" | "FLEXIBLE" | "DRIVER";
  schedule_reason?: string;
};

type ComplianceExemptStaff = {
  name: string;
  schedule_type: "FLEXIBLE" | "DRIVER";
  reason?: string;
};

type AttendancePolicyMeta = {
  exclude_flexible_applied?: boolean;
  excluded_staff_count?: number;
  excluded_schedule_types?: string[];
  policy_version?: string;
  compliance_exempt_staff?: ComplianceExemptStaff[];
};

type AbsenceSummaryRow = {
  absence_type: string;
  row_count: number;
  staff_count: number;
  day_count: number;
};

type BranchDailyResp = { ok: boolean; rows: BranchDailyRow[] };
type BranchWeekdayResp = { ok: boolean; rows: BranchWeekdayRow[] };
type StaffSummaryResp = { ok: boolean; rows: StaffSummaryRow[]; policy_meta?: AttendancePolicyMeta };
type AbsenceSummaryResp = { ok: boolean; rows: AbsenceSummaryRow[]; policy_meta?: AttendancePolicyMeta };

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  saved?: boolean;
  snapshotId?: string;
  streaming?: boolean;
};

type AiConsultResp = {
  ok: boolean;
  answer: string;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
};

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
  policy_meta?: AttendancePolicyMeta;
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

/** Manila Sales Data tab — manila_daily_sales (Dine-in / GrabFood / FoodPanda). */
type ManilaDailySalesItem = {
  sale_date: string;
  branch: string;
  dine_in_orders?: number | null;
  dine_in_amount?: number | null;
  grabfood_orders?: number | null;
  grabfood_amount?: number | null;
  foodpanda_orders?: number | null;
  foodpanda_amount?: number | null;
  total_orders?: number | null;
  total_amount?: number | null;
};

type ManilaDailySalesApiResp = {
  ok: boolean;
  items: ManilaDailySalesItem[];
  grand_total_orders?: number;
  grand_total_amount?: number;
  branches?: string[];
};

/** When exactly one Manila revenue branch is implied, narrow daily-sales API (matches UI branch filter). */
function inferManilaDailySalesBranchFromQuestion(question: string): string | null {
  const q = question.replace(/\u3000/g, " ").trim();
  const lower = q.toLowerCase();
  const par = /paranaque|parañaque|para\u00f1aque/i.test(lower) || /パラニャ/.test(q);
  const taft = /taft|タフト/i.test(lower);
  const cubao = /cubao|quezon|クバオ/i.test(lower) || /\bqc\b/i.test(lower);
  if ([par, taft, cubao].filter(Boolean).length !== 1) return null;
  if (par) return "Paranaque";
  if (taft) return "Taft";
  return "Cubao";
}

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

type PosAnalyticsLatestCoverageResp = {
  ok: boolean;
  city: string;
  sales_daily_latest_work_date: string;
  menu_item_latest_work_date: string;
  branch_daily_latest_work_date: string;
  channel_daily_latest_work_date: string;
  revenue_latest_work_date: string;
  cancel_order_type_latest_work_date: string;
  cancel_breakdown_latest_work_date: string;
  hourly_latest_month_key: string;
  hourly_latest_work_date: string;
  operation_time_latest_work_date: string;
  product_mix_latest_coverage_to: string;
};

type AttendanceLatestCoverageResp = {
  ok: boolean;
  city: string;
  date_from: string;
  date_to: string;
  last_synced_at: string;
  last_sync_status: string;
  last_seen_file_name: string;
  source_name: string;
  drive_modified_time: string;
  last_synced_import_job_id?: string;
};

type AttendanceAutoSyncStatusResp = {
  ok: boolean;
  enabled: boolean;
  hours_utc: number[];
  source_id: string;
  folder_id: string;
  city_hint: string;
  configured: boolean;
};

type PosDataCheckRow = {
  work_date: string;
  sales_daily: DataCheckCell;
  revenue_daily: DataCheckCell;
  branch_daily: DataCheckCell;
  channel_daily: DataCheckCell;
  hourly_daily: DataCheckCell;
  operation_time: DataCheckCell;
  cancel_order_type: DataCheckCell;
  cancel_breakdown: DataCheckCell;
  product_mix: DataCheckCell;
  missing_metrics: string[];
  overall_status: string;
  reimportable?: boolean;
};

type PosDataCheckResp = {
  ok: boolean;
  city: string;
  date_from: string;
  date_to: string;
  rows: PosDataCheckRow[];
  summary: {
    total_dates: number;
    ok_dates: number;
    partial_dates: number;
    missing_dates: number;
  };
};

type ManilaSalesDataCheckRow = {
  work_date: string;
  source_systems: string[];
  product: DataCheckCell;
  channel: DataCheckCell;
  category: DataCheckCell;
  payment_method: DataCheckCell;
  pos_daily: DataCheckCell;
  hourly: DataCheckCell;
  missing_metrics: string[];
  overall_status: string;
  reimportable?: boolean;
};

type ManilaSalesDataCheckResp = {
  ok: boolean;
  date_from: string;
  date_to: string;
  store_name?: string;
  rows: ManilaSalesDataCheckRow[];
  summary: {
    total_dates: number;
    ok_dates: number;
    partial_dates: number;
    missing_dates: number;
  };
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

/** Dubai Cancel Orders tab — chart colors (Careem / Talabat / Keeta). */
const CANCEL_ORDERS_PLATFORM_META: Record<string, { color: string; bg: string; ring: string; dot: string }> = {
  Careem: { color: "#10b981", bg: "bg-emerald-500/10", ring: "ring-emerald-500/30", dot: "bg-emerald-400" },
  Talabat: { color: "#ef4444", bg: "bg-red-500/10", ring: "ring-red-500/30", dot: "bg-red-400" },
  Keeta: { color: "#f97316", bg: "bg-orange-500/10", ring: "ring-orange-500/30", dot: "bg-orange-400" },
};

const CANCEL_ORDERS_ORDER_TYPE_COLORS = ["#ef4444", "#f97316"] as const;

function cancelOrdersInferPlatformFromSource(source: string): string | null {
  const x = source || "";
  if (/\bCareem\b/i.test(x)) return "Careem";
  if (/\bKeeta\b/i.test(x)) return "Keeta";
  if (/\bTalabat\b/i.test(x)) return "Talabat";
  return null;
}

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
  schedule_type?: "STANDARD" | "FLEXIBLE" | "DRIVER";
  schedule_reason?: string | null;
};

type ComparisonResp = {
  ok?: boolean;
  count?: number;
  items?: ComparisonItem[];
  policy_meta?: AttendancePolicyMeta;
};

type AttendanceSchedulePolicyItem = {
  id: string;
  city: string;
  canonical_staff_name: string;
  schedule_type: "STANDARD" | "FLEXIBLE" | "DRIVER";
  reason?: string;
  effective_from?: string | null;
  effective_to?: string | null;
  is_active?: boolean;
};

type AttendanceSchedulePolicyResp = {
  ok: boolean;
  items: AttendanceSchedulePolicyItem[];
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
  { value: "orderCounts", label: "Number of Orders", id: "sales-order-counts" },
  { value: "hourly", label: "Hourly", id: "sales-hourly" },
  { value: "operationTime", label: "Op Time", id: "sales-operation-time" },
  { value: "manilaOverallRatings", label: "Overall Rating", id: "sales-manila-overall-ratings" },
  { value: "dubaiCancellations", label: "Cancellations", id: "sales-dubai-cancellations" },
  { value: "aggregatorRatings", label: "Ratings", id: "sales-aggregator-ratings" },
  { value: "brands", label: "Brands", id: "sales-brands" },
  { value: "menu", label: "Menu", id: "sales-menu" },
  { value: "stores", label: "Stores", id: "sales-stores" },
  { value: "daily", label: "Daily", id: "sales-daily" },
  { value: "productMix", label: "Product Mix", id: "sales-product-mix" },
  { value: "cancelOrders", label: "Cancel Orders", id: "sales-cancel-orders" },
  { value: "dataCheck", label: "Data Check", id: "sales-data-check" },
  { value: "manilaSales", label: "Manila Sales", id: "sales-manila-sales" },
  { value: "manilaLowRatings", label: "Low Rating", id: "sales-manila-low-ratings" },
  { value: "manilaAggregatorRatings", label: "Ratings", id: "sales-manila-aggregator-ratings" },
  { value: "manilaSalesData", label: "Sales Data", id: "sales-manila-daily" },
  { value: "manilaCancellations", label: "Cancellations", id: "sales-manila-cancellations" },
  { value: "manilaCashierEval", label: "Cashier Evaluation", id: "sales-manila-cashier-eval" },
  { value: "manilaGrabOffline", label: "Grab Offline", id: "sales-manila-grab-offline" },
] as const;
const DUBAI_SALES_SECTION_OPTIONS = SALES_SECTION_OPTIONS.filter(
  (section) =>
    section.value !== "manilaSales" &&
    section.value !== "manilaLowRatings" &&
    section.value !== "manilaAggregatorRatings" &&
    section.value !== "manilaSalesData" &&
    section.value !== "manilaCashierEval" &&
    section.value !== "manilaCancellations" &&
    section.value !== "manilaGrabOffline",
);
const MANILA_SALES_SECTION_OPTIONS = [
  "orderCounts",
  "manilaSalesData",
  "manilaSales",
  "manilaAggregatorRatings",
  "manilaLowRatings",
  "manilaGrabOffline",
  "manilaCancellations",
  "manilaCashierEval",
  "dataCheck",
].map((v) => SALES_SECTION_OPTIONS.find((s) => s.value === v)!);

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

// ── Aggregator colour palette ────────────────────────────────────────────────
const AGGREGATOR_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  keeta:     { bg: "bg-blue-500/15",   text: "text-blue-300",   bar: "bg-blue-500" },
  careem:    { bg: "bg-emerald-500/15",text: "text-emerald-300",bar: "bg-emerald-500" },
  noon:      { bg: "bg-amber-500/15",  text: "text-amber-300",  bar: "bg-amber-500" },
  talabat:   { bg: "bg-orange-500/15", text: "text-orange-300", bar: "bg-orange-500" },
  smiles:    { bg: "bg-purple-500/15", text: "text-purple-300", bar: "bg-purple-500" },
  eateasy:   { bg: "bg-pink-500/15",   text: "text-pink-300",   bar: "bg-pink-500" },
  deliveroo: { bg: "bg-teal-500/15",   text: "text-teal-300",   bar: "bg-teal-500" },
  unknown:   { bg: "bg-neutral-700/30",text: "text-neutral-400",bar: "bg-neutral-500" },
};
function aggColor(name: string) {
  return AGGREGATOR_COLORS[(name || "").toLowerCase()] ?? AGGREGATOR_COLORS.unknown;
}

function AggregatorBreakdown({ items, dense = false }: { items?: PosAggregatorMetric[]; dense?: boolean }) {
  const rows = (items || []).filter(
    (row) => String(row.aggregator_name || "").trim() || Number(row.order_count_non_cancelled || 0) || Number(row.net_revenue || 0),
  );
  if (!rows.length) {
    return <div className="text-[11px] text-neutral-500">No aggregator breakdown</div>;
  }
  const totalOrders = rows.reduce((s, r) => s + Number(r.order_count_non_cancelled || 0), 0);
  return (
    <div className={dense ? "space-y-1.5" : "space-y-2"}>
      {rows.map((row) => {
        const cnt = Number(row.order_count_non_cancelled || 0);
        const pct = totalOrders > 0 ? (cnt / totalOrders) * 100 : 0;
        const col = aggColor(row.aggregator_name || "");
        return (
          <div key={`${row.aggregator_name}-${cnt}-${row.net_revenue}`}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ${col.bg} ${col.text}`}>
                {row.aggregator_name || "Unknown"}
              </span>
              <span className="text-[11px] tabular-nums text-neutral-400">
                {formatCount(cnt)} <span className="text-neutral-600">·</span> {formatMoney(Number(row.net_revenue || 0))}
              </span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/5">
              <div className={`h-full rounded-full ${col.bar}`} style={{ width: `${pct.toFixed(1)}%` }} />
            </div>
          </div>
        );
      })}
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

/**
 * Default analytics range: current calendar month from the 1st through today (local).
 * Avoids the trap where "previous month" during March still points at February while ops talks about March P&L.
 */
function currentCalendarMonthRangeThroughTodayIso(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDom = new Date(y, m + 1, 0).getDate();
  const dom = Math.min(now.getDate(), lastDom);
  const from = `${y}-${pad(m + 1)}-01`;
  const to = `${y}-${pad(m + 1)}-${pad(dom)}`;
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
  if (compact === "qc") return "CUBAO";
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
  if (x.includes("quezon")) return "CUBAO";
  if (/\bqc\b/.test(x)) return "CUBAO";
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

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Calendar shift (e.g. Apr 15 → Mar 15); clamps day to prior month length. */
function shiftCalendarDateByMonths(isoDate: string, deltaMonths: number): string | null {
  const m = String(isoDate || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const targetMonth = new Date(y, mo - 1 + deltaMonths, 1);
  const lastDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate();
  const day = Math.min(d, lastDay);
  const out = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), day);
  return ymdLocal(out);
}

/** Same day-of-month span in the previous calendar month (for MoM). */
function priorMonthSameCalendarDayRange(dateFrom: string, dateTo: string): { from: string; to: string } | null {
  const pf = shiftCalendarDateByMonths(dateFrom, -1);
  const pt = shiftCalendarDateByMonths(dateTo, -1);
  if (!pf || !pt) return null;
  if (pf > pt) return null;
  return { from: pf, to: pt };
}

function formatSummaryPctChange(current: number, previous: number): string {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return "—";
  if (previous === 0 && current === 0) return "0%";
  if (previous === 0) return "—";
  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.round(pct * 10) / 10;
  if (Math.abs(rounded) < 0.05) return "0%";
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}%`;
}

/** Store-row MoM: drop absurd % when prior period had no/low baseline (e.g. new store). */
function formatStoreMomPct(current: number, previous: number): string {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return "—";
  if (previous === 0 && current === 0) return "0%";
  if (previous === 0) return "—";
  const pct = ((current - previous) / previous) * 100;
  if (!Number.isFinite(pct)) return "—";
  if (Math.abs(pct) > 400) return "—";
  const rounded = Math.round(pct * 10) / 10;
  if (Math.abs(rounded) < 0.05) return "0%";
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}%`;
}

function summaryPctToneClass(pctLabel: string): string {
  if (pctLabel === "—" || pctLabel === "0%") return "text-neutral-500";
  if (pctLabel.startsWith("-")) return "text-rose-300";
  return "text-emerald-300";
}

/**
 * 質問文から言及されている年月を抽出する。
 * 見つからない場合は先月（直近の完結した月）を返す。
 */
function detectPeriodFromQuestion(question: string): { dateFrom: string; dateTo: string; detected: boolean } {
  const q = question
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30))
    .replace(/[Ａ-Ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff21 + 0x41))
    .replace(/[ａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff41 + 0x61));

  const now = new Date();
  const currentYear = now.getFullYear();

  if (/先々月|さ先月|2\s*months?\s*ago/i.test(q)) {
    const d = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const from = ymdLocal(new Date(d.getFullYear(), d.getMonth(), 1));
    const to = ymdLocal(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    return { dateFrom: from, dateTo: to, detected: true };
  }

  if (/先月|last\s*month/i.test(q)) {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const from = ymdLocal(new Date(d.getFullYear(), d.getMonth(), 1));
    const to = ymdLocal(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    return { dateFrom: from, dateTo: to, detected: true };
  }

  if (/今月|this\s*month/i.test(q)) {
    const from = ymdLocal(new Date(now.getFullYear(), now.getMonth(), 1));
    const to = ymdLocal(now);
    return { dateFrom: from, dateTo: to, detected: true };
  }

  const yearMonthMatch = q.match(/(\d{4})[年\-/](\d{1,2})月?/);
  if (yearMonthMatch) {
    const y = parseInt(yearMonthMatch[1], 10);
    const mo = parseInt(yearMonthMatch[2], 10) - 1;
    if (mo >= 0 && mo <= 11) {
      const from = ymdLocal(new Date(y, mo, 1));
      const to = ymdLocal(new Date(y, mo + 1, 0));
      return { dateFrom: from, dateTo: to, detected: true };
    }
  }

  const MONTH_NAMES_EN = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const monthJaMatch = q.match(/(\d{1,2})月/);
  if (monthJaMatch) {
    const mo = parseInt(monthJaMatch[1], 10) - 1;
    if (mo >= 0 && mo <= 11) {
      const y = mo > now.getMonth() ? currentYear - 1 : currentYear;
      const from = ymdLocal(new Date(y, mo, 1));
      const to = ymdLocal(new Date(y, mo + 1, 0));
      return { dateFrom: from, dateTo: to, detected: true };
    }
  }
  const monthEnMatch = q.toLowerCase().match(new RegExp(`(${MONTH_NAMES_EN.join("|")})`, "i"));
  if (monthEnMatch) {
    const mo = MONTH_NAMES_EN.indexOf(monthEnMatch[1].toLowerCase());
    if (mo >= 0) {
      const y = mo > now.getMonth() ? currentYear - 1 : currentYear;
      const from = ymdLocal(new Date(y, mo, 1));
      const to = ymdLocal(new Date(y, mo + 1, 0));
      return { dateFrom: from, dateTo: to, detected: true };
    }
  }

  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const from = ymdLocal(new Date(d.getFullYear(), d.getMonth(), 1));
  const to = ymdLocal(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  return { dateFrom: from, dateTo: to, detected: false };
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
    // Always strip step-up on fresh page load — require Verify Passkey every session.
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
  const defaultAnalyticsRange = currentCalendarMonthRangeThroughTodayIso();

  const [city, setCity] = useState<string>((auth?.city || "dubai").toLowerCase());
  const [dateFrom, setDateFrom] = useState(defaultAnalyticsRange.from);
  const [dateTo, setDateTo] = useState(defaultAnalyticsRange.to);
  /** Sales Summary / Management P&L: imported monthly P&L lags; default to last closed calendar month. */
  const [summaryDateFrom, setSummaryDateFrom] = useState(() => previousCalendarMonthRangeIso().from);
  const [summaryDateTo, setSummaryDateTo] = useState(() => previousCalendarMonthRangeIso().to);
  const [complianceMonthKey, setComplianceMonthKey] = useState(defaultAnalyticsRange.from.slice(0, 7));
  const [summaryMonthKey, setSummaryMonthKey] = useState(() => previousCalendarMonthRangeIso().from.slice(0, 7));
  const [payrollStaffName, setPayrollStaffName] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [summaryBranchCode, setSummaryBranchCode] = useState("");
  const [summaryBrandName, setSummaryBrandName] = useState("");
  const [salesSectionView, setSalesSectionView] = useState<
    | "summary"
    | "hourly"
    | "operationTime"
    | "brands"
    | "cancelOrders"
    | "productMix"
    | "menu"
    | "stores"
    | "daily"
    | "dataCheck"
    | "orderCounts"
    | "aggregatorRatings"
    | "dubaiCancellations"
    | "manilaSales"
    | "manilaLowRatings"
    | "manilaAggregatorRatings"
    | "manilaOverallRatings"
    | "manilaSalesData"
    | "manilaCashierEval"
    | "manilaCancellations"
    | "manilaGrabOffline"
    | "all"
  >(
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
  const [stepUpVerifiedThisVisit, setStepUpVerifiedThisVisit] = useState(false);
  const stepUpVerifiedRef = useRef(false);
  const [totpCode, setTotpCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [totpEnrollment, setTotpEnrollment] = useState<null | { enrollmentToken: string; secret: string; otpauthUri: string }>(null);
  const [totpEnrollmentCode, setTotpEnrollmentCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [aiMessages, setAiMessages] = useState<ChatMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiDataCache, setAiDataCache] = useState<{
    dateFrom: string;
    dateTo: string;
    cities: Record<string, { metrics: any; data_quality: any; city: string }>;
  } | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

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
  const [posBranchDailyRows, setPosBranchDailyRows] = useState<PosBranchDailyRow[]>([]);
  const [posSalesPriorTotals, setPosSalesPriorTotals] = useState<PosSalesDailyTotals | null>(null);
  const [posBranchDailyPriorRows, setPosBranchDailyPriorRows] = useState<PosBranchDailyRow[]>([]);
  const [cancelOrdersAnalytics, setCancelOrdersAnalytics] = useState<PosCancelOrdersResp | null>(null);
  const [cancelOrdersLoadError, setCancelOrdersLoadError] = useState("");
  const [cancelOrdersPeriod, setCancelOrdersPeriod] = useState<"7D" | "14D" | "30D" | "ALL">("ALL");
  const [cancelOrdersTableBrandFilter, setCancelOrdersTableBrandFilter] = useState<"ALL" | string>("ALL");
  const [cancelOrdersTablePlatformFilter, setCancelOrdersTablePlatformFilter] = useState<"ALL" | string>("ALL");
  const [cancelOrdersTableSortCol, setCancelOrdersTableSortCol] = useState<"date" | "brand" | "lostOrders" | "lostRevenue">(
    "date",
  );
  const [cancelOrdersTableSortDir, setCancelOrdersTableSortDir] = useState<"asc" | "desc">("desc");
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
  const [evaluationDetailDate, setEvaluationDetailDate] = useState(() => currentCalendarMonthRangeThroughTodayIso().to);
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
  const [attendanceSyncing, setAttendanceSyncing] = useState(false);
  const [salesSyncMessage, setSalesSyncMessage] = useState("");
  const [payrollSyncMessage, setPayrollSyncMessage] = useState("");
  const [attendanceSyncMessage, setAttendanceSyncMessage] = useState("");
  const [posLatestCoverage, setPosLatestCoverage] = useState<PosAnalyticsLatestCoverageResp | null>(null);
  const [posLatestCoverageError, setPosLatestCoverageError] = useState("");
  const [attendanceLatestCoverage, setAttendanceLatestCoverage] = useState<AttendanceLatestCoverageResp | null>(null);
  const [attendanceLatestCoverageError, setAttendanceLatestCoverageError] = useState("");
  const [attendanceAutoSyncStatus, setAttendanceAutoSyncStatus] = useState<AttendanceAutoSyncStatusResp | null>(null);
  const [attendanceAutoSyncStatusError, setAttendanceAutoSyncStatusError] = useState("");
  const [posDataCheck, setPosDataCheck] = useState<PosDataCheckResp | null>(null);
  const [posDataCheckError, setPosDataCheckError] = useState("");
  const [posDataCheckSelectedDates, setPosDataCheckSelectedDates] = useState<string[]>([]);
  const [manilaDataCheck, setManilaDataCheck] = useState<ManilaSalesDataCheckResp | null>(null);
  const [manilaDataCheckError, setManilaDataCheckError] = useState("");
  const [manilaDataCheckLoading, setManilaDataCheckLoading] = useState(false);
  const [manilaDataCheckSelectedDates, setManilaDataCheckSelectedDates] = useState<string[]>([]);

  const [comparisonRows, setComparisonRows] = useState<ComparisonItem[]>([]);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState("");
  const [comparisonNotice, setComparisonNotice] = useState("");
  const [comparisonLoadedOnce, setComparisonLoadedOnce] = useState(false);
  const [comparisonLimit, setComparisonLimit] = useState("5000");

  const [viewMode, setViewMode] = useState<AnalyticsViewMode>("perfect_attendance");
  const [analyticsTab, setAnalyticsTab] = useState<"staff" | "dubaiSales" | "manilaSales" | "evaluation" | "finance" | "procurement" | "ai" | "overtime" | "late" | "absence" | "adherence" | "lean_shift">("staff");
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
  const dubaiDataCheckColumns = useMemo<Array<DataCheckColumn<PosDataCheckRow>>>(
    () => [
      { key: "sales_daily", label: "Sales Daily", getCell: (row) => row.sales_daily },
      { key: "revenue_daily", label: "Revenue Daily", getCell: (row) => row.revenue_daily },
      { key: "branch_daily", label: "Branch Daily", getCell: (row) => row.branch_daily },
      { key: "channel_daily", label: "Channel Daily", getCell: (row) => row.channel_daily },
      { key: "hourly_daily", label: "Hourly", getCell: (row) => row.hourly_daily },
      { key: "operation_time", label: "Op Time", getCell: (row) => row.operation_time },
      { key: "cancel_order_type", label: "Cancel Type", getCell: (row) => row.cancel_order_type },
      { key: "cancel_breakdown", label: "Cancel Breakdown", getCell: (row) => row.cancel_breakdown },
      { key: "product_mix", label: "Product Mix", getCell: (row) => row.product_mix },
    ],
    [],
  );
  const manilaDataCheckColumns = useMemo<Array<DataCheckColumn<ManilaSalesDataCheckRow>>>(
    () => [
      { key: "product", label: "Product", getCell: (row) => row.product },
      { key: "channel", label: "Channel", getCell: (row) => row.channel },
      { key: "category", label: "Category", getCell: (row) => row.category },
      { key: "payment_method", label: "Payment", getCell: (row) => row.payment_method },
      { key: "pos_daily", label: "POS Daily", getCell: (row) => row.pos_daily },
      { key: "hourly", label: "Hourly", getCell: (row) => row.hourly },
    ],
    [],
  );
  const salesStepUpReady = stepUpSatisfies("aal2", auth) && stepUpVerifiedThisVisit;
  const financeStepUpReady = stepUpSatisfies("aal2", auth) && stepUpVerifiedThisVisit;
  const activeSecurityRequirement =
    analyticsTab === "finance"
      ? "MFA (Passkey, TOTP, Backup code, or PIN step-up)"
      : isSalesAnalyticsTab || analyticsTab === "evaluation" || analyticsTab === "staff" || analyticsTab === "ai" || analyticsTab === "overtime" || analyticsTab === "late" || analyticsTab === "absence" || analyticsTab === "adherence" || analyticsTab === "lean_shift"
        ? "MFA (Passkey, TOTP, Backup code, or PIN step-up)"
        : "Login";
  const activeSecuritySatisfied =
    analyticsTab === "finance" ? financeStepUpReady : isSalesAnalyticsTab || analyticsTab === "evaluation" || analyticsTab === "staff" || analyticsTab === "ai" || analyticsTab === "overtime" || analyticsTab === "late" || analyticsTab === "absence" || analyticsTab === "adherence" ? salesStepUpReady : true;

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
    if (analyticsTab === "ai" && !hasVisibleAnalyticsChannel) {
      if (canViewStaffChannel) setAnalyticsTab("staff");
      else if (canViewDubaiSalesChannel) setAnalyticsTab("dubaiSales");
      else if (canViewManilaSalesChannel) setAnalyticsTab("manilaSales");
      else if (canViewManagementPlChannel) setAnalyticsTab("finance");
    }
  }, [analyticsTab, canViewDubaiSalesChannel, canViewManagementPlChannel, canViewManilaSalesChannel, canViewProcurementChannel, canViewStaffChannel, hasVisibleAnalyticsChannel]);

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
      return;
    }
    if (requestedTab === "ai" && hasVisibleAnalyticsChannel) {
      setAnalyticsTab("ai");
    }
  }, [
    canViewDubaiSalesChannel,
    canViewEvaluationChannel,
    hasVisibleAnalyticsChannel,
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
    const manilaSectionKeys = new Set<string>(MANILA_SALES_SECTION_OPTIONS.map((s) => s.value));
    setSalesSectionView((current) => {
      if (isManilaSalesCity) {
        if (current === "all") return "all";
        if (manilaSectionKeys.has(current as string)) return current;
        return "manilaSales";
      }
      if (manilaSectionKeys.has(current as string)) return "summary";
      return current;
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
    const dr = previousCalendarMonthRangeIso();
    setSummaryDateFrom(dr.from);
    setSummaryDateTo(dr.to);
    setPayrollStaffName("");
    setBranchCode("");
    setSummaryBranchCode("");
    setSummaryBrandName("");
    setPlStoreName("");
    setHourlyStoreName("");
    resetComparisonState();
  }, [city]);

  // Management P&L is month-lagged: never keep "this month (1st → today)" while on this tab.
  useEffect(() => {
    if (analyticsTab !== "finance") return;
    if (!financeStepUpReady) return;
    const cur = currentCalendarMonthRangeThroughTodayIso();
    if (summaryDateFrom === cur.from && summaryDateTo === cur.to) {
      const pm = previousCalendarMonthRangeIso();
      setSummaryDateFrom(pm.from);
      setSummaryDateTo(pm.to);
    }
  }, [analyticsTab, financeStepUpReady, summaryDateFrom, summaryDateTo]);

  useEffect(() => {
    if (analyticsTab !== "finance") return;
    if (!approverName.trim() || !financeStepUpReady) return;
    void loadAll("finance");
    // `loadAll()` is intentionally triggered by tab, scope, and credentials changes.
    // It is recreated on render, so we avoid depending on its function identity here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    analyticsTab,
    plStoreName,
    approverName,
    financeStepUpReady,
    summaryDateFrom,
    summaryDateTo,
    summaryBranchCode,
    summaryBrandName,
    city,
    pin,
  ]);

  useEffect(() => {
    if (!isSalesAnalyticsTab) return;
    if (isManilaSalesCity) return;
    if (!approverName.trim() || !salesStepUpReady) return;
    void loadAll("sales");
    // `loadAll()` is intentionally triggered by tab, scope, and credentials changes.
    // It is recreated on render, so we avoid depending on its function identity here.
    // Include summary dates so Cancel Orders / POS blocks refetch when Summary Range or month picker changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isSalesAnalyticsTab,
    isManilaSalesCity,
    hourlyStoreName,
    summaryBranchCode,
    summaryBrandName,
    summaryDateFrom,
    summaryDateTo,
    approverName,
    pin,
    salesStepUpReady,
    analyticsTab,
  ]);

  useEffect(() => {
    setPosDataCheckSelectedDates([]);
    setManilaDataCheckSelectedDates([]);
  }, [summaryDateFrom, summaryDateTo, analyticsTab]);

  useEffect(() => {
    if (analyticsTab !== "manilaSales") return;
    if (!approverName.trim() || !salesStepUpReady) return;
    void loadManilaDataCheckNow();
    // `loadManilaDataCheckNow()` is intentionally triggered by tab, range, and credentials changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyticsTab, approverName, pin, salesStepUpReady, summaryDateFrom, summaryDateTo]);

  useEffect(() => {
    if (analyticsTab !== "evaluation") return;
    if (!approverName.trim() || !salesStepUpReady) return;
    void loadAll("evaluation");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyticsTab, city, summaryDateFrom, summaryDateTo, approverName, salesStepUpReady]);

  useEffect(() => {
    if (analyticsTab !== "ai") return;
    if (!approverName.trim() || !salesStepUpReady) return;
    void loadAll("ai");
    if (canViewStaffChannel) void loadComparison();
    setError("");
    setAiDataCache(null);
    // `loadAll()` and `loadComparison()` are intentionally triggered by tab, range, and credentials changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyticsTab, city, summaryDateFrom, summaryDateTo, approverName, salesStepUpReady, canViewStaffChannel]);

  async function loadAll(scope: "all" | "sales" | "staff" | "evaluation" | "finance" | "ai" = "all"): Promise<string[]> {
    setLoading(true);
    setError("");
    const loadErrors: string[] = [];
    const addLoadError = (label: string, e: unknown) => {
      const msg = String((e as any)?.message || e || "Request failed");
      loadErrors.push(`${label}: ${msg}`);
    };
    const shouldLoadPos = scope === "all" || scope === "sales" || scope === "finance" || scope === "ai";
    const shouldLoadStaff = scope === "all" || scope === "staff" || scope === "finance" || scope === "ai";
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
        limit: "500",
        approver_name: approverName.trim(),
        pin: pin.trim(),
      });

      const salesComparisonQs = new URLSearchParams({
        city: city === "dubai" ? "Dubai" : "Manila",
        date_from: summaryDateFrom,
        date_to: summaryDateTo,
        limit: "5000",
        exclude_flexible: "true",
        approver_name: approverName.trim(),
        pin: pin.trim(),
      });

      const posLoad = (async () => {
        if (!shouldLoadPos) return;
        try {
          setCancelOrdersLoadError("");
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
          const coverageQs = new URLSearchParams({
            city: posCity,
            approver_name: approverName.trim(),
            pin: pin.trim(),
          });

          const loadSalesDataset = async <T,>(
            label: string,
            request: () => Promise<T>,
            onOk: (value: T) => void,
            onFail: () => void,
            onFailCapture?: (e: unknown) => void,
          ) => {
            try {
              onOk(await request());
            } catch (e) {
              addLoadError(label, e);
              onFailCapture?.(e);
              onFail();
            }
          };

          const salesSummaryPriorRange =
            analyticsTab !== "manilaSales" ? priorMonthSameCalendarDayRange(summaryDateFrom, summaryDateTo) : null;
          const posPriorQs = salesSummaryPriorRange
            ? new URLSearchParams({
                city: posCity,
                date_from: salesSummaryPriorRange.from,
                date_to: salesSummaryPriorRange.to,
                branch_code: summaryBranchCode,
                brand_name: summaryBrandName,
                limit: "1000",
                approver_name: approverName.trim(),
                pin: pin.trim(),
              })
            : null;
          if (!posPriorQs) {
            setPosSalesPriorTotals(null);
            setPosBranchDailyPriorRows([]);
          }

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
              (cancelOrders) => {
                setCancelOrdersLoadError("");
                setCancelOrdersAnalytics(cancelOrders ?? null);
              },
              () => setCancelOrdersAnalytics(null),
              (e) => setCancelOrdersLoadError(String((e as Error)?.message || e || "Cancel orders request failed")),
            ),
            loadSalesDataset(
              "Sales latest coverage",
              () => apiGet<PosAnalyticsLatestCoverageResp>(`/api/admin/pos/analytics/latest-coverage?${coverageQs.toString()}`),
              (coverage) => {
                setPosLatestCoverage(coverage);
                setPosLatestCoverageError("");
              },
              () => {
                setPosLatestCoverage(null);
                setPosLatestCoverageError("Latest import coverage unavailable");
              }
            ),
            loadSalesDataset(
              "Sales data check",
              () => apiGet<PosDataCheckResp>(`/api/admin/pos/analytics/data-check?${posDailyQs.toString()}`),
              (dataCheck) => {
                setPosDataCheck(dataCheck);
                setPosDataCheckError("");
              },
              () => {
                setPosDataCheck(null);
                setPosDataCheckError("Data check unavailable");
              }
            ),
            ...(posPriorQs
              ? [
                  loadSalesDataset(
                    "Sales daily (prior month)",
                    () => apiGet<PosSalesDailyResp>(`/api/admin/pos/sales/daily?${posPriorQs.toString()}`),
                    (posDailyPrior) => setPosSalesPriorTotals(posDailyPrior.totals ?? null),
                    () => setPosSalesPriorTotals(null),
                  ),
                  loadSalesDataset(
                    "Branch daily (prior month)",
                    () => apiGet<PosBranchDailyResp>(`/api/admin/pos/branches/daily?${posPriorQs.toString()}`),
                    (rowsPrior) => setPosBranchDailyPriorRows(rowsPrior.items || []),
                    () => setPosBranchDailyPriorRows([]),
                  ),
                ]
              : []),
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
          setPosSalesPriorTotals(null);
          setPosBranchDailyPriorRows([]);
          setCancelOrdersAnalytics(null);
          setOperationTimeAnalytics(null);
          setOperationTimeLoadError("");
          setSalesPlSummary(null);
          setHourlySalesAnalytics(null);
          setHourlyLoadError("");
          setPosLatestCoverage(null);
          setPosLatestCoverageError("");
          setPosDataCheck(null);
          setPosDataCheckError("");
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
          setAttendanceLatestCoverage(null);
          setAttendanceLatestCoverageError("");
          setAttendanceAutoSyncStatus(null);
          setAttendanceAutoSyncStatusError("");
          setAttendanceSyncMessage("");
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
          exclude_flexible: "true",
          approver_name: approverName.trim(),
          pin: pin.trim(),
        });
        const absenceQs = new URLSearchParams({
          city,
          date_from: summaryDateFrom,
          date_to: summaryDateTo,
          exclude_flexible: "true",
          approver_name: approverName.trim(),
          pin: pin.trim(),
        });
        const attendanceCoverageQs = new URLSearchParams({
          city,
          approver_name: approverName.trim(),
          pin: pin.trim(),
        });
        const attendanceAutoSyncQs = new URLSearchParams({
          city,
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

        // Limit concurrent DB requests to 3 to avoid exhausting the connection pool
        const runLimited = async (tasks: Array<() => Promise<void>>, concurrency = 3) => {
          const queue = [...tasks];
          const worker = async () => { while (queue.length > 0) { const t = queue.shift(); if (t) await t(); } };
          await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
        };

        await runLimited([
          () => run("Staff analytics (branch daily hours)", () => apiGet<BranchDailyResp>(`/api/admin/analytics/branch_daily_hours?${common.toString()}`), (daily) => setBranchDailyRows(daily.rows || []), () => setBranchDailyRows([])),
          () => run("Staff analytics (branch weekday hours)", () => apiGet<BranchWeekdayResp>(`/api/admin/analytics/branch_weekday_avg_hours?${common.toString()}`), (weekday) => setBranchWeekdayRows(weekday.rows || []), () => setBranchWeekdayRows([])),
          () => run("Staff analytics (work summary)", () => apiGet<StaffSummaryResp>(`/api/admin/analytics/staff_work_summary?${staffQs.toString()}`), (staff) => setStaffSummaryRows(staff.rows || []), () => setStaffSummaryRows([])),
          () => run("Staff analytics (absence summary)", () => apiGet<AbsenceSummaryResp>(`/api/admin/analytics/absence_summary?${absenceQs.toString()}`), (absence) => setAbsenceSummaryRows(absence.rows || []), () => setAbsenceSummaryRows([])),
          run(
            "Staff analytics (Dubai city summary)",
            () =>
              apiGet<CitySummaryResp>(
                `/api/admin/analytics/city_summary?city=dubai&date_from=${encodeURIComponent(summaryDateFrom)}&date_to=${encodeURIComponent(summaryDateTo)}&approver_name=${encodeURIComponent(approverName.trim())}&pin=${encodeURIComponent(pin.trim())}`
                  + `&exclude_flexible=true`
              ),
            (dubaiCity) => setDubaiSummary(dubaiCity),
            () => setDubaiSummary(null)
          ),
          () => run(
            "Staff analytics (Manila city summary)",
            () =>
              apiGet<CitySummaryResp>(
                `/api/admin/analytics/city_summary?city=manila&date_from=${encodeURIComponent(summaryDateFrom)}&date_to=${encodeURIComponent(summaryDateTo)}&approver_name=${encodeURIComponent(approverName.trim())}&pin=${encodeURIComponent(pin.trim())}`
                  + `&exclude_flexible=true`
              ),
            (manilaCity) => setManilaSummary(manilaCity),
            () => setManilaSummary(null)
          ),
          () => run(
            "Staff analytics (attendance comparison)",
            () => apiGet<ComparisonResp>(`/api/admin/attendance/comparison?${salesComparisonQs.toString()}`),
            (salesComparison) => setSalesComparisonRows(Array.isArray(salesComparison?.items) ? salesComparison.items : []),
            () => setSalesComparisonRows([])
          ),
          () => run(
            "Staff analytics (latest Bayzat coverage)",
            () => apiGet<AttendanceLatestCoverageResp>(`/api/admin/attendance/latest-coverage?${attendanceCoverageQs.toString()}`),
            (coverage) => {
              setAttendanceLatestCoverage(coverage);
              setAttendanceLatestCoverageError("");
            },
            () => {
              setAttendanceLatestCoverage(null);
              setAttendanceLatestCoverageError("Latest Bayzat import coverage unavailable");
            }
          ),
          async () => {
            try {
              const statusResp = await apiGet<AttendanceAutoSyncStatusResp>(`/api/admin/attendance/auto-sync/status?${attendanceAutoSyncQs.toString()}`);
              setAttendanceAutoSyncStatus(statusResp);
              setAttendanceAutoSyncStatusError("");
            } catch {
              setAttendanceAutoSyncStatus(null);
              setAttendanceAutoSyncStatusError("Auto sync status unavailable");
            }
          },
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
                date_from: summaryDateFrom,
                date_to: summaryDateTo,
                approver_name: approverName.trim(),
                pin: pin.trim(),
              });
              if (plStoreName.trim()) breakEvenQs.set("store_name", plStoreName.trim());
              if (city === "dubai") {
                if (summaryBranchCode.trim()) breakEvenQs.set("sales_branch_code", summaryBranchCode.trim());
                if (summaryBrandName.trim()) breakEvenQs.set("sales_brand_name", summaryBrandName.trim());
              }
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

  async function loadManilaDataCheckNow() {
    if (!approverName.trim() || !salesStepUpReady) return;
    setManilaDataCheckLoading(true);
    setManilaDataCheckError("");
    try {
      const res = await apiGet<ManilaSalesDataCheckResp>(
        `/api/admin/analytics/manila/sales/data-check?${new URLSearchParams({
          approver_name: approverName.trim(),
          pin: pin.trim(),
          date_from: summaryDateFrom,
          date_to: summaryDateTo,
        }).toString()}`
      );
      setManilaDataCheck(res);
    } catch (e) {
      setManilaDataCheck(null);
      setManilaDataCheckError(String((e as Error)?.message || e || "Failed to load Manila data check"));
    } finally {
      setManilaDataCheckLoading(false);
    }
  }

  function toggleDateSelection(workDate: string, selected: string[], setSelected: (value: string[] | ((prev: string[]) => string[])) => void) {
    setSelected((current) => (current.includes(workDate) ? current.filter((item) => item !== workDate) : [...current, workDate].sort()));
  }

  function selectProblemDates<Row extends { work_date: string; overall_status?: string; reimportable?: boolean }>(
    rows: Row[],
    setSelected: (value: string[]) => void,
  ) {
    setSelected(
      rows
        .filter((row) => row.reimportable !== false && String(row.overall_status || "") !== "ok")
        .map((row) => row.work_date)
        .sort()
    );
  }

  async function reimportSalesDates(cityKind: "dubai" | "manila") {
    const targetDates = cityKind === "dubai" ? posDataCheckSelectedDates : manilaDataCheckSelectedDates;
    if (!targetDates.length || !approverName.trim() || !salesStepUpReady) return;
    setSalesSyncing(true);
    setSalesSyncMessage("");
    try {
      const start =
        cityKind === "dubai"
          ? await apiPost<PosSyncJobResp>("/api/admin/pos/sync/reimport-dates", {
              approver_name: approverName.trim(),
              pin: pin.trim(),
              city_hint: "dubai",
              target_dates: targetDates,
              force_reimport: true,
            })
          : await apiPost<PosSyncJobResp>("/api/admin/analytics/manila/sales/sync", {
              approver_name: approverName.trim(),
              pin: pin.trim(),
              force: true,
              target_dates: targetDates,
            });
      const job = start?.job;
      if (!job?.id) {
        throw new Error(String(start?.message || "Re-import job could not be started"));
      }
      const baseMessage = String(start?.message || "").trim() || `Queued ${targetDates.length} dates for re-import.`;
      setSalesSyncMessage(formatPosSyncJobMessage(job, baseMessage));
      const finalJob = await waitForSalesSyncJob(job.id, baseMessage);
      const finalStatus = String(finalJob.status || "").toUpperCase();
      const finalMessage = formatPosSyncJobMessage(finalJob, baseMessage);
      if (finalStatus === "COMPLETED" || finalStatus === "COMPLETED_WITH_WARNINGS") {
        if (cityKind === "dubai") {
          setPosDataCheckSelectedDates([]);
          setSalesSyncMessage(await reloadSalesAfterSync(finalMessage));
        } else {
          setManilaDataCheckSelectedDates([]);
          await loadManilaDataCheckNow();
          setSalesSyncMessage(`${finalMessage} Reloaded data check.`);
        }
      } else {
        setSalesSyncMessage(finalMessage);
      }
    } catch (e: any) {
      setSalesSyncMessage(String(e?.message || e || "Re-import failed"));
    } finally {
      setSalesSyncing(false);
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

  async function syncAttendanceNow() {
    if (!approverName.trim() || !salesStepUpReady) return;
    setAttendanceSyncing(true);
    setAttendanceSyncMessage("");
    try {
      const res = await apiPost<{
        ok?: boolean;
        duplicate?: boolean;
        message?: string;
        date_from?: string;
        date_to?: string;
      }>("/api/admin/attendance/drive/sync", {
        approver_name: approverName.trim(),
        pin: pin.trim(),
        city_hint: city,
      });
      const rawMsg = String(res?.message || "").trim();
      if (res?.duplicate) {
        setAttendanceSyncMessage("最新ファイルは既に取り込み済みです。");
      } else if (rawMsg) {
        setAttendanceSyncMessage(normalizeAttendanceSyncMessage(rawMsg, "Bayzat同期が完了しました。"));
      } else {
        setAttendanceSyncMessage("Bayzat同期が完了しました。");
      }
      await loadAll("staff");
    } catch (e: any) {
      setAttendanceSyncMessage(normalizeAttendanceSyncMessage(String(e?.message || e || ""), "Bayzat同期に失敗しました。"));
    } finally {
      setAttendanceSyncing(false);
    }
  }

  async function syncPayrollNow() {
    if (!approverName.trim() || !financeStepUpReady) return;
    setPayrollSyncing(true);
    setPayrollSyncMessage("");
    try {
      const res = await apiPost<{ ok?: boolean; duplicate?: boolean; message?: string; items?: unknown[]; resolved_folder_url?: string }>(
        "/api/admin/payroll/drive/sync",
        {
        approver_name: approverName.trim(),
        pin: pin.trim(),
        city,
        }
      );
      const msg = String(res?.message || "").trim();
      const folderNote = res?.resolved_folder_url ? ` (フォルダ: ${res.resolved_folder_url})` : "";
      if (msg) {
        setPayrollSyncMessage(msg + folderNote);
      } else if (res?.duplicate) {
        setPayrollSyncMessage("Payroll files were already imported. Reloaded data." + folderNote);
      } else {
        setPayrollSyncMessage("Payroll folder sync completed. Reloaded data." + folderNote);
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
      let maybeTruncated = false;

      const chunkResponses = await Promise.all(
        chunks.map((chunk) => {
          const qs = new URLSearchParams({
            city: city === "dubai" ? "Dubai" : "Manila",
            date_from: chunk.from,
            date_to: chunk.to,
            limit: String(safeLimit),
            exclude_flexible: "true",
            approver_name: approverName.trim(),
            pin: pin.trim(),
          });
          if (branchCode) qs.set("branch", branchCode);
          return apiGet<ComparisonResp>(`/api/admin/attendance/comparison?${qs.toString()}`);
        })
      );
      const allItems: ComparisonItem[] = [];
      for (const res of chunkResponses) {
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
    if (analyticsTab === "ai") return;
    // Manila Sales loads its own APIs in ManilaSalesSection. Running staff/compliance fan-out here
    // competes for the same Heroku dyno/DB and triggers H12 (30s) timeouts — users see raw HTML errors.
    if (analyticsTab === "manilaSales") {
      if (!canViewStaffChannel) void loadAll("sales");
      return;
    }
    if (canViewStaffChannel) loadComparison();
    // Management roles cannot call staff analytics APIs (HQ/ADMIN only) — avoid 403/500 noise on load.
    if (canViewStaffChannel) void loadAll("staff");
    else void loadAll("sales");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyticsTab, canViewStaffChannel, approverName, salesStepUpReady]);

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

  const salesSummaryPriorRangeMemo = useMemo(
    () => priorMonthSameCalendarDayRange(summaryDateFrom, summaryDateTo),
    [summaryDateFrom, summaryDateTo],
  );

  const summaryStoreRollup = useMemo(() => {
    const m = new Map<string, { net: number; gross: number; orders: number }>();
    for (const row of posBranchDailyRows) {
      const k = String(row.branch_name || "").trim() || "—";
      const cur = m.get(k) ?? { net: 0, gross: 0, orders: 0 };
      cur.net += Number(row.net_revenue || 0);
      cur.gross += Number(row.gross_revenue || 0);
      cur.orders += Number(row.order_count_non_cancelled || 0);
      m.set(k, cur);
    }
    return Array.from(m.entries())
      .map(([branch_name, v]) => ({
        branch_name,
        net_revenue: v.net,
        gross_revenue: v.gross,
        order_count: v.orders,
        avg_net_per_order: v.orders > 0 ? v.net / v.orders : 0,
      }))
      .sort((a, b) => b.net_revenue - a.net_revenue);
  }, [posBranchDailyRows]);

  const summaryStorePriorByBranch = useMemo(() => {
    const m = new Map<string, { net: number; orders: number }>();
    for (const row of posBranchDailyPriorRows) {
      const k = String(row.branch_name || "").trim() || "—";
      const cur = m.get(k) ?? { net: 0, orders: 0 };
      cur.net += Number(row.net_revenue || 0);
      cur.orders += Number(row.order_count_non_cancelled || 0);
      m.set(k, cur);
    }
    return m;
  }, [posBranchDailyPriorRows]);

  const summaryStoreTableRows = useMemo(() => {
    const prior = summaryStorePriorByBranch;
    return summaryStoreRollup.map((row) => {
      const p = prior.get(row.branch_name) ?? { net: 0, orders: 0 };
      return {
        ...row,
        netPct: formatStoreMomPct(row.net_revenue, p.net),
        ordersPct: formatStoreMomPct(row.order_count, p.orders),
      };
    });
  }, [summaryStoreRollup, summaryStorePriorByBranch]);

  const summaryKpiMom = useMemo(() => {
    const cur = posSalesRangeTotals;
    const prev = posSalesPriorTotals;
    if (!cur || !prev) return null;
    const cNet = Number(cur.net_revenue || 0);
    const pNet = Number(prev.net_revenue || 0);
    const cGross = Number(cur.gross_revenue || 0);
    const pGross = Number(prev.gross_revenue || 0);
    const cOrd = Number(cur.order_count_non_cancelled || 0);
    const pOrd = Number(prev.order_count_non_cancelled || 0);
    const cDays = Number(cur.day_count || 0);
    const pDays = Number(prev.day_count || 0);
    const cAvg = cOrd > 0 ? cNet / cOrd : 0;
    const pAvg = pOrd > 0 ? pNet / pOrd : 0;
    return {
      net: formatSummaryPctChange(cNet, pNet),
      gross: formatSummaryPctChange(cGross, pGross),
      orders: formatSummaryPctChange(cOrd, pOrd),
      avg: formatSummaryPctChange(cAvg, pAvg),
      days: formatSummaryPctChange(cDays, pDays),
    };
  }, [posSalesRangeTotals, posSalesPriorTotals]);

  async function sendToAi(question: string) {
    const trimmedQ = String(question || "").trim();
    if (!trimmedQ) return;

    const { dateFrom: aiPeriodFrom, dateTo: aiPeriodTo } = detectPeriodFromQuestion(trimmedQ);

    type AiCityKey = "dubai" | "manila";
    const cityLabels: Record<AiCityKey, string> = {
      dubai: "Dubai",
      manila: "Manila",
    };
    const questionLower = trimmedQ.toLowerCase();
    const asksDubai = questionLower.includes("dubai") || questionLower.includes("ドバイ");
    const asksManila = questionLower.includes("manila") || questionLower.includes("マニラ");
    const asksBoth = asksDubai && asksManila;
    const asksComparison = /比較|compare|vs|両|both/.test(questionLower);
    // Manila branch names (store codes) — 都市名ではなくブランチ名で Manila と判定
    const asksManilaByBranch = /cubao|quezon|taft|paran[aã]que|paranaque|\bpar\b|central kitchen ph/i.test(
      trimmedQ,
    );
    // Dubai branch names
    const asksDubaiByBranch = /al barsha|\balb\b|difc|\bjbr\b|jebel ali|\bjba\b|time square|\btsc\b/i.test(trimmedQ);
    const effectiveAsksManila = asksManila || asksManilaByBranch;
    const effectiveAsksDubai = asksDubai || asksDubaiByBranch;
    const targetCities: AiCityKey[] =
      asksBoth || asksComparison
        ? ["dubai", "manila"]
        : effectiveAsksDubai && !effectiveAsksManila
          ? ["dubai"]
          : effectiveAsksManila && !effectiveAsksDubai
            ? ["manila"]
            : ["dubai", "manila"];
    // 単一都市に絞った質問では UI の city ではなく取得対象と payload.city を一致させる（Cubao 等で Manila のみ取得時に dubai が送られないように）
    const consultCity = targetCities.length === 1 ? targetCities[0] : city;

    const loadAiCityDataset = async (cityKey: AiCityKey) => {
      const missingSources: Array<{ source: string; reason: string }> = [];
      const rowCounts: Record<string, number> = {};
      const dateFrom = aiPeriodFrom;
      const dateTo = aiPeriodTo;
      const approver = approverName.trim();
      const pinValue = pin.trim();
      const comparisonLimit = 1000;
      let truncated = false;

      const noteMissing = (source: string, e: unknown) => {
        const reason = String((e as any)?.message || e || "request_failed");
        missingSources.push({ source, reason });
      };
      const tryFetch = async <T,>(source: string, fn: () => Promise<T>): Promise<T | null> => {
        try {
          return await fn();
        } catch (e) {
          noteMissing(source, e);
          return null;
        }
      };

      const cityParam = cityKey === "dubai" ? "Dubai" : "Manila";
      const lowercaseCity = cityKey;
      const comparisonChunks = splitDateRangeIntoChunks(dateFrom, dateTo, 7);
      const chunkResults = await Promise.all(
        comparisonChunks.map((chunk) => {
          const qs = new URLSearchParams({
            city: cityParam,
            date_from: chunk.from,
            date_to: chunk.to,
            limit: String(comparisonLimit),
            exclude_flexible: "false",
            include_schedule_type: "true",
            approver_name: approver,
            pin: pinValue,
          });
          return tryFetch<ComparisonResp>("attendance_comparison", () =>
            apiGet<ComparisonResp>(`/api/admin/attendance/comparison?${qs.toString()}`)
          );
        })
      );
      const comparisonRowsRaw: ComparisonItem[] = [];
      for (const res of chunkResults) {
        if (!res) continue;
        const items = Array.isArray(res.items) ? res.items : [];
        if (items.length >= comparisonLimit) truncated = true;
        comparisonRowsRaw.push(...items);
      }
      rowCounts.attendance_comparison = comparisonRowsRaw.length;

      const commonQs = new URLSearchParams({
        city: lowercaseCity,
        date_from: dateFrom,
        date_to: dateTo,
        approver_name: approver,
        pin: pinValue,
      });
      const staffQs = new URLSearchParams({
        city: lowercaseCity,
        date_from: dateFrom,
        date_to: dateTo,
        limit: "200",
        exclude_flexible: "true",
        approver_name: approver,
        pin: pinValue,
      });

      const manilaDailyQs = new URLSearchParams({
        approver_name: approver,
        pin: pinValue,
        date_from: dateFrom,
        date_to: dateTo,
      });
      const manilaDailyBranchHint = inferManilaDailySalesBranchFromQuestion(trimmedQ);
      if (manilaDailyBranchHint) manilaDailyQs.set("branch", manilaDailyBranchHint);

      const [branchDailyRes, staffSummaryRes, absenceSummaryRes, citySummaryRes, posDailyRes, schedulePolicyRes, posBranchRes, manilaDailyRes] =
        await Promise.all([
          tryFetch<BranchDailyResp>("branch_daily_hours", () => apiGet<BranchDailyResp>(`/api/admin/analytics/branch_daily_hours?${commonQs.toString()}`)),
          tryFetch<StaffSummaryResp>("staff_work_summary", () => apiGet<StaffSummaryResp>(`/api/admin/analytics/staff_work_summary?${staffQs.toString()}`)),
          tryFetch<AbsenceSummaryResp>("absence_summary", () => apiGet<AbsenceSummaryResp>(`/api/admin/analytics/absence_summary?${commonQs.toString()}&exclude_flexible=true`)),
          tryFetch<CitySummaryResp>("city_summary", () =>
            apiGet<CitySummaryResp>(
              `/api/admin/analytics/city_summary?city=${encodeURIComponent(lowercaseCity)}&date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}&exclude_flexible=true&approver_name=${encodeURIComponent(approver)}&pin=${encodeURIComponent(pinValue)}`
            )
          ),
          tryFetch<PosSalesDailyResp>("pos_sales_daily", () => apiGet<PosSalesDailyResp>(`/api/admin/pos/sales/daily?${commonQs.toString()}`)),
          tryFetch<AttendanceSchedulePolicyResp>("schedule_policy", () =>
            apiGet<AttendanceSchedulePolicyResp>(
              `/api/admin/attendance/schedule-policy?city=${encodeURIComponent(lowercaseCity)}&active_only=true&approver_name=${encodeURIComponent(approver)}&pin=${encodeURIComponent(pinValue)}`
            )
          ),
          // pos_branch_ranking is optional enrichment data — silently ignore errors so missingSources stays clean
          apiGet<{ ok: boolean; items: { branch_name: string; net_revenue: number; order_count_non_cancelled: number }[] }>(
            `/api/admin/pos/branches/orders?${commonQs.toString()}&limit=20`
          ).catch(() => null),
          cityKey === "manila"
            ? tryFetch<ManilaDailySalesApiResp>("manila_daily_sales", () =>
                apiGet<ManilaDailySalesApiResp>(`/api/admin/analytics/manila/daily-sales?${manilaDailyQs.toString()}`)
              )
            : Promise.resolve(null),
        ]);

      const branchDailyRows = branchDailyRes?.rows || [];
      const staffRows = staffSummaryRes?.rows || [];
      const absenceRows = absenceSummaryRes?.rows || [];
      const posRows = posDailyRes?.items || [];
      rowCounts.branch_daily_hours = branchDailyRows.length;
      rowCounts.staff_work_summary = staffRows.length;
      rowCounts.absence_summary = absenceRows.length;
      rowCounts.pos_sales_daily = posRows.length;
      if (cityKey === "manila") {
        const mct = manilaDailyRes?.items;
        rowCounts.manila_daily_sales = Array.isArray(mct) ? mct.length : 0;
      }
      rowCounts.city_summary = citySummaryRes ? 1 : 0;
      rowCounts.schedule_policy = Array.isArray(schedulePolicyRes?.items) ? schedulePolicyRes.items.length : 0;

      const exemptPolicyRows = (schedulePolicyRes?.items || []).filter(
        (item) => item?.schedule_type === "FLEXIBLE" || item?.schedule_type === "DRIVER"
      );
      const operationalComparisonRows = comparisonRowsRaw.filter(
        (row) => row.schedule_type !== "FLEXIBLE" && row.schedule_type !== "DRIVER"
      );

      const staffAgg = new Map<string, { late_count: number; late_minutes: number; overtime_minutes: number; missing_punch_count: number; problem_absence_days: number; compliance_total: number; compliance_days: number }>();
      const rawStaffAgg = new Map<string, { late_count: number; late_minutes: number }>();
      const comparisonDateSet = new Set<string>();
      const comparisonDateSetRaw = new Set<string>();
      const comparisonBranchSet = new Set<string>();
      const comparisonBranchSetRaw = new Set<string>();
      let totalActualMinutes = 0;
      let totalActualMinutesRaw = 0;
      for (const row of comparisonRowsRaw) {
        const rawWorkDate = String((row as any)?.work_date || "").trim();
        if (rawWorkDate) comparisonDateSetRaw.add(rawWorkDate);
        const rawScheduledBranch = String((row as any)?.scheduled_branch_code || "").trim();
        const rawAttendanceBranch = String((row as any)?.attendance_branch_code || "").trim();
        const rawBranchCode = rawScheduledBranch || rawAttendanceBranch;
        if (rawBranchCode && rawBranchCode !== "-") comparisonBranchSetRaw.add(rawBranchCode);
        totalActualMinutesRaw += Number((row as any)?.actual_minutes || 0);
        const rawName = safeStaffName(row);
        if (rawName) {
          const rawCur = rawStaffAgg.get(rawName) || { late_count: 0, late_minutes: 0 };
          const rawLateMinutes = effectiveLateMinutes(row);
          if (isLateAttendanceCandidate(row) && rawLateMinutes > 0) {
            rawCur.late_count += 1;
            rawCur.late_minutes += rawLateMinutes;
          }
          rawStaffAgg.set(rawName, rawCur);
        }
      }
      for (const row of operationalComparisonRows) {
        const workDate = String((row as any)?.work_date || "").trim();
        if (workDate) comparisonDateSet.add(workDate);
        const scheduledBranch = String((row as any)?.scheduled_branch_code || "").trim();
        const attendanceBranch = String((row as any)?.attendance_branch_code || "").trim();
        const branchCode = scheduledBranch || attendanceBranch;
        if (branchCode && branchCode !== "-") comparisonBranchSet.add(branchCode);
        totalActualMinutes += Number((row as any)?.actual_minutes || 0);

        const name = safeStaffName(row);
        if (!name) continue;
        const cur = staffAgg.get(name) || {
          late_count: 0,
          late_minutes: 0,
          overtime_minutes: 0,
          missing_punch_count: 0,
          problem_absence_days: 0,
          compliance_total: 0,
          compliance_days: 0,
        };
        const lateMinutes = effectiveLateMinutes(row);
        if (isLateAttendanceCandidate(row) && lateMinutes > 0) {
          cur.late_count += 1;
          cur.late_minutes += lateMinutes;
        }
        if (isWorkedAttendance(row)) {
          cur.overtime_minutes += Number(row.overtime_minutes ?? 0);
          if (row.missing_check_in) cur.missing_punch_count += 1;
          if (row.missing_check_out) cur.missing_punch_count += 1;
        }
        if (isProblemAbsence(row)) cur.problem_absence_days += 1;
        const comp = calculateComplianceRate(row);
        if (comp != null) {
          cur.compliance_total += comp;
          cur.compliance_days += 1;
        }
        staffAgg.set(name, cur);
      }
      const staffEntries = Array.from(staffAgg.entries()).map(([name, v]) => ({
        staff_name: name,
        late_count: v.late_count,
        late_minutes: v.late_minutes,
        overtime_minutes: v.overtime_minutes,
        missing_punch_count: v.missing_punch_count,
        problem_absence_days: v.problem_absence_days,
        compliance_rate: v.compliance_days > 0 ? (v.compliance_total / v.compliance_days) * 100 : 0,
      }));
      const rawStaffEntries = Array.from(rawStaffAgg.entries()).map(([name, v]) => ({
        staff_name: name,
        late_count: v.late_count,
        late_minutes: v.late_minutes,
      }));
      const lateRanking = staffEntries
        .filter((r) => r.late_count > 0)
        .sort((a, b) => b.late_count - a.late_count || b.late_minutes - a.late_minutes)
        .slice(0, 5)
        .map((r) => ({ staff_name: r.staff_name, late_count: r.late_count, late_minutes: r.late_minutes }));
      const worstCompliance = staffEntries
        .filter((r) => Number.isFinite(r.compliance_rate))
        .sort((a, b) => a.compliance_rate - b.compliance_rate)
        .slice(0, 5)
        .map((r) => ({ staff_name: r.staff_name, score: Number(r.compliance_rate).toFixed(1) }));

      const branchTotalsMap = new Map<string, { totalHours: number; days: Set<string> }>();
      for (const row of operationalComparisonRows) {
        const scheduledBranch = String(row.scheduled_branch_code || "").trim();
        const attendanceBranch = String(row.attendance_branch_code || "").trim();
        const key = scheduledBranch || attendanceBranch || "-";
        const cur = branchTotalsMap.get(key) || { totalHours: 0, days: new Set<string>() };
        cur.totalHours += Number(row.actual_minutes || 0) / 60;
        if (row.work_date) cur.days.add(String(row.work_date));
        branchTotalsMap.set(key, cur);
      }
      const branchTotals = Array.from(branchTotalsMap.entries())
        .map(([branch, v]) => ({
          branch,
          total_hours: Number(v.totalHours.toFixed(1)),
          avg_hours_per_day: Number((v.days.size > 0 ? v.totalHours / v.days.size : 0).toFixed(1)),
        }))
        .sort((a, b) => b.total_hours - a.total_hours)
        .slice(0, 10);

      const posTotals = posDailyRes?.totals || null;
      const posNetSales = posTotals ? Number(posTotals.net_revenue || 0) : posRows.reduce((sum, row) => sum + Number(row.net_revenue || 0), 0);
      const posOrderCount = posTotals
        ? Number(posTotals.order_count_non_cancelled || 0)
        : posRows.reduce((sum, row) => sum + Number(row.order_count_non_cancelled || 0), 0);

      const manilaDailyItems =
        cityKey === "manila" && manilaDailyRes?.ok && Array.isArray(manilaDailyRes.items) ? manilaDailyRes.items : [];
      const manilaChannelRollup = manilaDailyItems.reduce(
        (acc, r) => ({
          dine_in_orders: acc.dine_in_orders + (Number(r.dine_in_orders) || 0),
          dine_in_amount: acc.dine_in_amount + (Number(r.dine_in_amount) || 0),
          grabfood_orders: acc.grabfood_orders + (Number(r.grabfood_orders) || 0),
          grabfood_amount: acc.grabfood_amount + (Number(r.grabfood_amount) || 0),
          foodpanda_orders: acc.foodpanda_orders + (Number(r.foodpanda_orders) || 0),
          foodpanda_amount: acc.foodpanda_amount + (Number(r.foodpanda_amount) || 0),
          total_orders: acc.total_orders + (Number(r.total_orders) || 0),
          total_amount: acc.total_amount + (Number(r.total_amount) || 0),
        }),
        {
          dine_in_orders: 0,
          dine_in_amount: 0,
          grabfood_orders: 0,
          grabfood_amount: 0,
          foodpanda_orders: 0,
          foodpanda_amount: 0,
          total_orders: 0,
          total_amount: 0,
        }
      );
      const byBranchAgg = new Map<
        string,
        {
          dine_in_orders: number;
          dine_in_amount: number;
          grabfood_orders: number;
          grabfood_amount: number;
          foodpanda_orders: number;
          foodpanda_amount: number;
          total_orders: number;
          total_amount: number;
        }
      >();
      for (const r of manilaDailyItems) {
        const br = String(r.branch || "").trim() || "Unknown";
        const cur = byBranchAgg.get(br) || {
          dine_in_orders: 0,
          dine_in_amount: 0,
          grabfood_orders: 0,
          grabfood_amount: 0,
          foodpanda_orders: 0,
          foodpanda_amount: 0,
          total_orders: 0,
          total_amount: 0,
        };
        cur.dine_in_orders += Number(r.dine_in_orders) || 0;
        cur.dine_in_amount += Number(r.dine_in_amount) || 0;
        cur.grabfood_orders += Number(r.grabfood_orders) || 0;
        cur.grabfood_amount += Number(r.grabfood_amount) || 0;
        cur.foodpanda_orders += Number(r.foodpanda_orders) || 0;
        cur.foodpanda_amount += Number(r.foodpanda_amount) || 0;
        cur.total_orders += Number(r.total_orders) || 0;
        cur.total_amount += Number(r.total_amount) || 0;
        byBranchAgg.set(br, cur);
      }
      const manila_daily_sales_by_branch = Array.from(byBranchAgg.entries())
        .map(([branch, v]) => ({ branch, ...v }))
        .sort((a, b) => b.total_amount - a.total_amount);

      const grandOrders =
        manilaDailyRes?.grand_total_orders != null && !Number.isNaN(Number(manilaDailyRes.grand_total_orders))
          ? Number(manilaDailyRes.grand_total_orders)
          : manilaChannelRollup.total_orders;
      const grandAmount =
        manilaDailyRes?.grand_total_amount != null && !Number.isNaN(Number(manilaDailyRes.grand_total_amount))
          ? Number(manilaDailyRes.grand_total_amount)
          : manilaChannelRollup.total_amount;

      const hasManilaDailySalesContext =
        cityKey === "manila" && manilaDailyRes != null && manilaDailyRes.ok === true;
      const primaryNetSales = hasManilaDailySalesContext ? grandAmount : posNetSales;
      const primaryOrderCount = hasManilaDailySalesContext ? grandOrders : posOrderCount;
      const avgPerOrder = primaryOrderCount > 0 ? primaryNetSales / primaryOrderCount : null;
      const hasPrimarySalesMetrics = hasManilaDailySalesContext || !!posDailyRes;

      // Pre-compute branch-level sales efficiency using server-side accurate join
      // (replaces client-side fuzzy matching which was unreliable).
      // Fetched from /api/admin/analytics/branch_efficiency which joins
      // pos_revenue_location_daily + actual_attendance via branch_pos_map.
      const branchEffRes = await apiGet<{
        ok: boolean;
        items: {
          branch: string;
          pos_branch_name: string;
          attendance_code: string;
          net_revenue: number;
          orders: number;
          labor_hours: number | null;
          sales_per_labor_hour: number | null;
          is_revenue_branch: boolean;
        }[];
      }>(`/api/admin/analytics/branch_efficiency?city=${lowercaseCity}&date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}`).catch(() => null);

      const branchEfficiency = (branchEffRes?.items || []).map((r) => ({
        branch: r.branch,
        net_revenue: String(r.net_revenue),
        orders: r.orders,
        labor_hours: r.labor_hours,
        sales_per_labor_hour: r.sales_per_labor_hour,
      }));

      const coreSourceKeys = ["attendance_comparison", "branch_daily_hours", "staff_work_summary", "absence_summary"];
      const coreMissingCount = missingSources.filter((m) => coreSourceKeys.includes(m.source)).length;
      const hasCoreData = coreMissingCount < coreSourceKeys.length;

      return {
        city: cityKey,
        metrics: {
          city: cityKey,
          summary_range: `${dateFrom} to ${dateTo}`,
          source_date_from: dateFrom,
          source_date_to: dateTo,
          late_staff_count: staffEntries.filter((r) => r.late_count > 0).length,
          late_count: staffEntries.reduce((sum, r) => sum + Number(r.late_count || 0), 0),
          total_late_minutes: staffEntries.reduce((sum, r) => sum + Number(r.late_minutes || 0), 0),
          late_count_raw: rawStaffEntries.reduce((sum, r) => sum + Number(r.late_count || 0), 0),
          total_late_minutes_raw: rawStaffEntries.reduce((sum, r) => sum + Number(r.late_minutes || 0), 0),
          problem_absence_staff: staffEntries.filter((r) => r.problem_absence_days > 0).length,
          total_ot_minutes: staffEntries.reduce((sum, r) => sum + Number(r.overtime_minutes || 0), 0),
          missing_punch: staffEntries.reduce((sum, r) => sum + Number(r.missing_punch_count || 0), 0),
          late_ranking: lateRanking,
          worst_compliance: worstCompliance,
          // Primary KPIs should follow Bayzat-backed comparison rows.
          total_hours: Number((totalActualMinutes / 60).toFixed(1)),
          total_days: comparisonDateSet.size,
          staffed_branch_count: comparisonBranchSet.size,
          total_hours_raw: Number((totalActualMinutesRaw / 60).toFixed(1)),
          total_days_raw: comparisonDateSetRaw.size,
          branch_count_raw: comparisonBranchSetRaw.size,
          top_staff_hours: staffRows.length
            ? `${staffRows[0].staff_name} (${Number(staffRows[0].total_hours || 0).toFixed(1)}h)`
            : null,
          branch_totals: branchTotals,
          // Manila: primary = manila_daily_sales (same API as Sales Data Manila tab). Dubai: POS daily.
          net_sales: hasPrimarySalesMetrics ? Number(primaryNetSales || 0).toFixed(2) : null,
          order_count: hasPrimarySalesMetrics ? primaryOrderCount : null,
          avg_per_order: hasPrimarySalesMetrics && avgPerOrder != null ? Number(avgPerOrder).toFixed(2) : null,
          ...(cityKey === "manila"
            ? {
                manila_daily_sales_api: "/api/admin/analytics/manila/daily-sales",
                manila_daily_sales_focus_branch: manilaDailyBranchHint || "all_branches",
                manila_daily_sales_orders: hasManilaDailySalesContext ? grandOrders : null,
                manila_daily_sales_amount_php: hasManilaDailySalesContext ? Number(grandAmount.toFixed(2)) : null,
                manila_channel_dine_in_orders: hasManilaDailySalesContext ? manilaChannelRollup.dine_in_orders : null,
                manila_channel_dine_in_amount_php: hasManilaDailySalesContext ? Number(manilaChannelRollup.dine_in_amount.toFixed(2)) : null,
                manila_channel_grabfood_orders: hasManilaDailySalesContext ? manilaChannelRollup.grabfood_orders : null,
                manila_channel_grabfood_amount_php: hasManilaDailySalesContext ? Number(manilaChannelRollup.grabfood_amount.toFixed(2)) : null,
                manila_channel_foodpanda_orders: hasManilaDailySalesContext ? manilaChannelRollup.foodpanda_orders : null,
                manila_channel_foodpanda_amount_php: hasManilaDailySalesContext ? Number(manilaChannelRollup.foodpanda_amount.toFixed(2)) : null,
                manila_daily_sales_by_branch:
                  hasManilaDailySalesContext && manila_daily_sales_by_branch.length > 0 ? manila_daily_sales_by_branch : null,
                pos_sales_daily_manila_rollup: posDailyRes
                  ? {
                      net_revenue_php: Number(posNetSales).toFixed(2),
                      order_count: posOrderCount,
                      note: "Manila POS daily rollup (/api/admin/pos/sales/daily); not used for Dine-in/GrabFood/FoodPanda channel KPIs. Prefer manila_daily_sales_* and net_sales/order_count above when manila_daily_sales loaded.",
                    }
                  : null,
                sales_kpi_basis: hasManilaDailySalesContext
                  ? "manila_daily_sales (GET /api/admin/analytics/manila/daily-sales; same as Sales Data Manila tab)"
                  : posDailyRes
                    ? "pos_sales_daily (fallback; manila_daily_sales missing)"
                    : null,
                branch_efficiency_numerator_note:
                  "branch_efficiency uses POS/location net revenue ÷ attendance hours; may differ from manila_daily_sales channel totals — explain separately when both appear.",
              }
            : {}),
          pos_revenue_branch_count: branchEfficiency.length > 0 ? branchEfficiency.length : (posBranchRes?.items ? posBranchRes.items.filter((r) => Number(r.net_revenue) > 0).length : null),
          pos_branch_ranking: posBranchRes?.items
            ? posBranchRes.items
                .filter((r) => Number(r.net_revenue) > 0)
                .map((r) => ({
                  branch: r.branch_name,
                  net_revenue: Number(r.net_revenue).toFixed(0),
                  orders: r.order_count_non_cancelled,
                }))
            : null,
          branch_efficiency: branchEfficiency.length > 0 ? branchEfficiency : null,
          absence_summary: absenceRows.slice(0, 5).map((row) => ({
            type: row.absence_type,
            rows: row.row_count,
            staff: row.staff_count,
            days: row.day_count,
          })),
          visa_alerts: "See /admin/renewals",
          insurance_alerts: "See /admin/renewals",
          city_summary_reference: citySummaryRes
            ? {
                total_hours: Number(citySummaryRes.total_hours || 0),
                day_count: Number(citySummaryRes.day_count || 0),
                branch_count: Number(citySummaryRes.branch_count || 0),
                avg_hours_per_day: Number(citySummaryRes.avg_hours_per_day || 0),
              }
            : null,
          compliance_policy: {
            policy_version: "attendance_policy_v1",
            metrics_scope: "operational",
            excluded_schedule_types: ["DRIVER", "FLEXIBLE"],
            excluded_staff_count: exemptPolicyRows.length,
          },
          compliance_exempt_staff: exemptPolicyRows.map((item) => ({
            name: item.canonical_staff_name,
            schedule_type: item.schedule_type,
            reason: item.reason || "",
          })),
          metrics_scope: {
            operational: "exclude DRIVER/FLEXIBLE schedule policy staff",
            raw: "includes all attendance rows before schedule policy exclusion",
          },
        },
        data_quality: {
          city: cityKey,
          fetched_at: new Date().toISOString(),
          date_from: dateFrom,
          date_to: dateTo,
          missing_sources: missingSources,
          truncated,
          row_counts: rowCounts,
          has_core_data: hasCoreData,
          ...(cityKey === "manila"
            ? {
                kpi_lineage: {
                  channel_orders_revenue_primary: "manila_daily_sales → GET /api/admin/analytics/manila/daily-sales",
                  pos_daily_rollup_supplementary: posDailyRes
                    ? "pos_sales_daily (Manila POS rollup; not channel KPI source)"
                    : "pos_sales_daily not loaded",
                  per_labor_hour_efficiency: "branch_efficiency API (POS/location net ÷ labor hours)",
                  server_enrichment_sell_thru: "manila_sales_summary (get_manila_sales_overview) in formatted context — distinct from manila_daily_sales",
                },
              }
            : {}),
        },
      };
    };

    const trimmed = trimmedQ;

    const userMsg: ChatMessage = {
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
    };

    setAiMessages((prev) => [...prev, userMsg]);
    setAiInput("");
    setAiLoading(true);
    setAiError("");

    try {
      if (!approverName.trim() || !salesStepUpReady) {
        throw new Error("Security verification and approver are required.");
      }

      let cityResults: Awaited<ReturnType<typeof loadAiCityDataset>>[];
      const isCacheValid =
        aiDataCache &&
        aiDataCache.dateFrom === aiPeriodFrom &&
        aiDataCache.dateTo === aiPeriodTo &&
        targetCities.every((c) => aiDataCache.cities[c]);

      if (isCacheValid && aiDataCache) {
        cityResults = targetCities.map((c) => aiDataCache.cities[c] as any);
      } else {
        cityResults = await Promise.all(targetCities.map((targetCity) => loadAiCityDataset(targetCity)));
        const newCities: Record<string, any> = { ...(aiDataCache?.cities || {}) };
        for (const r of cityResults) newCities[r.city] = r;
        setAiDataCache({ dateFrom: aiPeriodFrom, dateTo: aiPeriodTo, cities: newCities });
      }
      const hasAnyCoreData = cityResults.some((r) => r.data_quality.has_core_data);
      if (!hasAnyCoreData) {
        const reasons = cityResults
          .flatMap((r) => (r.data_quality.missing_sources || []).map((m: any) => `${cityLabels[r.city as AiCityKey]}:${m.source}`))
          .join(", ");
        throw new Error(`分析に必要なデータが取得できませんでした。${reasons ? ` (${reasons})` : ""}`);
      }
      const citiesPayload = cityResults.reduce<Record<string, any>>((acc, r) => {
        acc[r.city] = r.metrics;
        return acc;
      }, {});
      const missingSourcesAll = cityResults.flatMap((r) =>
        (r.data_quality.missing_sources || []).map((m: any) => ({
          city: r.city,
          source: m.source,
          reason: m.reason,
        }))
      );
      const truncatedAny = cityResults.some((r) => !!r.data_quality.truncated);
      const rowCountsByCity = cityResults.reduce<Record<string, Record<string, number>>>((acc, r) => {
        acc[r.city] = r.data_quality.row_counts || {};
        return acc;
      }, {});
      const kpiLineageByCity = cityResults.reduce<Record<string, unknown>>((acc, r) => {
        const kl = (r.data_quality as { kpi_lineage?: unknown }).kpi_lineage;
        if (kl && typeof kl === "object") acc[r.city] = kl;
        return acc;
      }, {});
      const primaryCityContext = cityResults[0]?.metrics || {};
      const contextPayload = {
        ...primaryCityContext,
        version: "ai_context_v2",
        summary_range: `${aiPeriodFrom} to ${aiPeriodTo}`,
        source_date_from: aiPeriodFrom,
        source_date_to: aiPeriodTo,
        city_scope: targetCities.length > 1 ? "both" : targetCities[0],
        cities: citiesPayload,
        data_quality: {
          fetched_at: new Date().toISOString(),
          date_from: aiPeriodFrom,
          date_to: aiPeriodTo,
          city_scope: targetCities,
          missing_sources: missingSourcesAll,
          truncated: truncatedAny,
          row_counts: rowCountsByCity,
          ...(Object.keys(kpiLineageByCity).length > 0 ? { kpi_lineage_by_city: kpiLineageByCity } : {}),
        },
      };
      const currentAuth = getAuth();
      // Bypass Next.js rewrite proxy for SSE streaming — Vercel's proxy buffers
      // text/event-stream responses which breaks real-time streaming.
      // CORS on the backend allows *.vercel.app so direct requests are fine.
      const apiDirectBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim().replace(/\/+$/, "");
      const streamUrl = apiDirectBase
        ? `${apiDirectBase}/api/ai/analytics/consult`
        : `${getApiBase()}/api/ai/analytics/consult`;
      const streamHeaders = {
        ...getAuthHeaders(),
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      };
      const streamBody = JSON.stringify({
        approver_name: currentAuth?.staffName || approverName,
        pin: currentAuth?.pin || pin,
        question: trimmed,
        context_data: contextPayload,
        city: consultCity,
        language: "ja",
        history: aiMessages.slice(-10).map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });

      // Add placeholder assistant message immediately so user sees streaming
      const assistantTimestamp = Date.now();
      setAiMessages((prev) => [
        ...prev,
        {
          role: "assistant" as const,
          content: "",
          timestamp: assistantTimestamp,
          saved: false,
          streaming: true,
        } as ChatMessage & Record<string, unknown>,
      ]);

      let streamRes = await fetch(streamUrl, {
        method: "POST",
        headers: streamHeaders,
        body: streamBody,
        cache: "no-store",
      });

      // Handle 401 with token refresh (same as apiPost)
      if (!streamRes.ok && streamRes.status === 401) {
        const errText = await streamRes.text();
        const detail = parseApiErrorDetail(errText);
        const current = getAuth();
        if (
          current?.pin &&
          (detail.includes("Invalid access token") || detail.includes("Authentication is required") || !current.accessToken)
        ) {
          await refreshAuthFromApi(current, { includeMfa: true });
          streamRes = await fetch(streamUrl, {
            method: "POST",
            headers: { ...getAuthHeaders(), "Content-Type": "application/json", Accept: "text/event-stream" },
            body: streamBody,
            cache: "no-store",
          });
        }
      }

      if (!streamRes.ok) {
        const errText = await streamRes.text();
        const detail = parseApiErrorDetail(errText);
        throw new Error(normalizeApiErrorMessage(detail || errText, "AI との通信に失敗しました"));
      }

      const reader = streamRes.body?.getReader();
      if (!reader) throw new Error("Stream not supported");
      const decoder = new TextDecoder();
      let sseBuffer = "";
      let streamedModel = "";
      let streamedInputTokens = 0;
      let streamedOutputTokens = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let event: any;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }
          if (event.type === "text_delta" && typeof event.text === "string") {
            setAiMessages((prev) =>
              prev.map((m) =>
                m.timestamp === assistantTimestamp
                  ? { ...m, content: m.content + event.text }
                  : m
              )
            );
          } else if (event.type === "done") {
            streamedModel = event.model || "";
            streamedInputTokens = event.input_tokens || 0;
            streamedOutputTokens = event.output_tokens || 0;
          } else if (event.type === "error") {
            throw new Error(event.message || "AI streaming error");
          }
        }
      }

      // Finalize the streamed message with metadata
      setAiMessages((prev) =>
        prev.map((m) =>
          m.timestamp === assistantTimestamp
            ? ({
                ...m,
                streaming: false,
                _question: trimmed,
                _model: streamedModel,
                _inputTokens: streamedInputTokens,
                _outputTokens: streamedOutputTokens,
                _dateFrom: aiPeriodFrom,
                _dateTo: aiPeriodTo,
                _cityScope: targetCities.length > 1 ? "both" : targetCities[0],
              } as ChatMessage & Record<string, unknown>)
            : m
        )
      );
    } catch (e: any) {
      setAiError(e?.message || "AI との通信に失敗しました");
    } finally {
      setAiLoading(false);
      window.setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }

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

  const salesCoverageBehind = useMemo(() => {
    const latestSalesDate = String(posLatestCoverage?.sales_daily_latest_work_date || "").trim();
    const selectedDateTo = String(summaryDateTo || "").trim();
    return Boolean(latestSalesDate && selectedDateTo && latestSalesDate < selectedDateTo);
  }, [posLatestCoverage?.sales_daily_latest_work_date, summaryDateTo]);

  const attendanceCoverageBehind = useMemo(() => {
    const latestAttendanceDate = String(attendanceLatestCoverage?.date_to || "").trim();
    const selectedDateTo = String(summaryDateTo || "").trim();
    return Boolean(latestAttendanceDate && selectedDateTo && latestAttendanceDate < selectedDateTo);
  }, [attendanceLatestCoverage?.date_to, summaryDateTo]);

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

  const cancelOrdersKpi = useMemo(
    () => ({
      lostOrders: cancelOrderSummary.lostOrderCount,
      lostRevenue: cancelOrderSummary.lostRevenue,
      daysWithData: cancelOrderSummary.dayCount,
      cancelTypes: cancelOrderSummary.orderTypeCount,
      platforms: cancelOrderSummary.platformCount,
    }),
    [cancelOrderSummary],
  );

  const cancelOrdersUiPlatforms = useMemo(() => {
    return (cancelOrdersAnalytics?.platform_rows || []).map((p) => ({
      platform: p.platform_name || "Unknown",
      lostOrders: Number(p.lost_order_count || 0),
      platformPre: Number(p.platform_pre_ack || 0),
      platformPost: Number(p.platform_post_ack || 0),
      merchantPre: Number(p.merchant_pre_ack || 0),
      merchantPost: Number(p.merchant_post_ack || 0),
    }));
  }, [cancelOrdersAnalytics?.platform_rows]);

  const cancelOrdersUiOrderTypes = useMemo(() => {
    return (cancelOrdersAnalytics?.order_type_rows || []).map((t) => ({
      type: t.order_type || "Unknown",
      lostOrders: Number(t.lost_order_count || 0),
      lostRevenue: Number(t.lost_revenue || 0),
    }));
  }, [cancelOrdersAnalytics?.order_type_rows]);

  const cancelOrdersUiTableBaseRows = useMemo(() => {
    return (cancelOrdersAnalytics?.daily_rows || []).map((r) => ({
      date: String(r.work_date || "").slice(0, 10),
      brand: String(r.brand_name || "").trim() || "—",
      lostOrders: Number(r.lost_order_count || 0),
      lostRevenue: Number(r.lost_revenue || 0),
      sourceFile: String(r.source_file_name || ""),
    }));
  }, [cancelOrdersAnalytics?.daily_rows]);

  const cancelOrdersPeriodCutoffIso = useMemo(() => {
    if (cancelOrdersPeriod === "ALL") return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    const days = cancelOrdersPeriod === "7D" ? 7 : cancelOrdersPeriod === "14D" ? 14 : 30;
    const d = new Date();
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    t.setDate(t.getDate() - (days - 1));
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  }, [cancelOrdersPeriod]);

  const cancelOrdersBrandOptions = useMemo(() => {
    return Array.from(new Set(cancelOrdersUiTableBaseRows.map((r) => r.brand))).sort();
  }, [cancelOrdersUiTableBaseRows]);

  const cancelOrdersPlatformChartData = useMemo(() => {
    return cancelOrdersUiPlatforms.map((p) => ({
      name: p.platform,
      lostOrders: p.lostOrders,
      platformPre: p.platformPre,
      platformPost: p.platformPost,
      merchantPre: p.merchantPre,
      fill: CANCEL_ORDERS_PLATFORM_META[p.platform]?.color ?? "#6366f1",
    }));
  }, [cancelOrdersUiPlatforms]);

  const cancelOrdersOrderTypePieData = useMemo(() => {
    return cancelOrdersUiOrderTypes.map((t, i) => ({
      name: t.type,
      value: t.lostOrders,
      revenue: t.lostRevenue,
      fill: CANCEL_ORDERS_ORDER_TYPE_COLORS[i % CANCEL_ORDERS_ORDER_TYPE_COLORS.length] ?? "#8b5cf6",
    }));
  }, [cancelOrdersUiOrderTypes]);

  const cancelOrdersFilteredTableRows = useMemo(() => {
    let rows = [...cancelOrdersUiTableBaseRows];
    if (cancelOrdersPeriodCutoffIso) {
      rows = rows.filter((r) => r.date >= cancelOrdersPeriodCutoffIso);
    }
    if (cancelOrdersTableBrandFilter !== "ALL") {
      rows = rows.filter((r) => r.brand === cancelOrdersTableBrandFilter);
    }
    if (cancelOrdersTablePlatformFilter !== "ALL") {
      rows = rows.filter((r) => cancelOrdersInferPlatformFromSource(r.sourceFile) === cancelOrdersTablePlatformFilter);
    }
    const dir = cancelOrdersTableSortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      if (cancelOrdersTableSortCol === "date") return dir * a.date.localeCompare(b.date);
      if (cancelOrdersTableSortCol === "brand") return dir * a.brand.localeCompare(b.brand);
      if (cancelOrdersTableSortCol === "lostOrders") return dir * (a.lostOrders - b.lostOrders);
      return dir * (a.lostRevenue - b.lostRevenue);
    });
    return rows;
  }, [
    cancelOrdersUiTableBaseRows,
    cancelOrdersPeriodCutoffIso,
    cancelOrdersTableBrandFilter,
    cancelOrdersTablePlatformFilter,
    cancelOrdersTableSortCol,
    cancelOrdersTableSortDir,
  ]);

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
        schedule_type: r.schedule_type || "STANDARD",
        schedule_reason: r.schedule_reason || "",
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
        : analyticsTab === "ai"
          ? "AI Analytics Consultant"
          : analyticsTab === "procurement"
            ? "Procurement Analytics"
            : analyticsTab === "evaluation"
              ? "Evaluation Channel"
              : analyticsTab === "overtime"
                ? "Overtime Analytics"
                : analyticsTab === "late"
                  ? "Late Analytics"
                  : analyticsTab === "absence"
                    ? "Absence Analytics"
                    : analyticsTab === "adherence"
                      ? "Shift Adherence"
                      : analyticsTab === "lean_shift"
                        ? "Lean Shift Calculator"
                        : "Management P&L Channel";
  const analyticsTabs: Array<{
    key: "staff" | "dubaiSales" | "manilaSales" | "evaluation" | "finance" | "procurement" | "ai" | "overtime" | "late" | "absence" | "adherence" | "lean_shift";
    label: string;
    visible: boolean;
  }> = [
    { key: "staff", label: "Analytics", visible: canViewStaffChannel },
    { key: "dubaiSales", label: "Dubai Sales Analytics", visible: canViewDubaiSalesChannel && canViewFinanceChannels },
    { key: "manilaSales", label: "Manila Sales Analytics", visible: canViewManilaSalesChannel && canViewFinanceChannels },
    { key: "evaluation", label: "Evaluation", visible: canViewEvaluationChannel && canViewFinanceChannels },
    { key: "finance", label: "Management P&L", visible: canViewManagementPlChannel },
    { key: "procurement", label: "Procurement Analytics", visible: canViewFinanceChannels },
    { key: "overtime", label: "Overtime", visible: canViewStaffChannel },
    { key: "late", label: "Late", visible: canViewStaffChannel },
    { key: "absence", label: "Absence", visible: canViewStaffChannel },
    { key: "adherence", label: "Shift Adherence", visible: canViewStaffChannel },
    { key: "lean_shift", label: "Lean Shift", visible: canViewStaffChannel },
    { key: "ai", label: "AI Analyst", visible: false },
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

          {canViewStaffChannel && analyticsTab !== "staff" ? (
            <div className={`${GLASS_CARD} mt-3 flex flex-wrap items-center justify-between gap-3 p-3`}>
              <div className="text-xs text-neutral-400">
                Bayzat attendance sync
                <span className="ml-2 text-neutral-500">Summary coverage details are shown in the Analytics tab.</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setAnalyticsTab("staff")}
                  className={`${SECONDARY_BUTTON} text-xs`}
                >
                  Open Analytics Tab
                </button>
                <button
                  type="button"
                  onClick={syncAttendanceNow}
                  disabled={attendanceSyncing || !approverName.trim() || !salesStepUpReady}
                  className={`${SECONDARY_BUTTON} flex items-center gap-2 text-xs disabled:opacity-60`}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {attendanceSyncing ? "Syncing..." : "Sync Latest Bayzat Data"}
                </button>
              </div>
            </div>
          ) : null}

          {error && analyticsTab !== "ai" ? (
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

          {analyticsTab === "ai" ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-violet-700/30 bg-violet-950/10 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-700/30 text-xl">
                  🤖
                </div>
                <div>
                  <div className="text-base font-bold text-neutral-100">AI Analytics Consultant</div>
                  <div className="text-xs text-neutral-500">
                    現在表示中のアナリティクスデータを基に、Claude AI が分析・提言を行います。
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  "今月の勤怠状況を総括して",
                  "遅刻・欠勤の多いスタッフへの対策を提案して",
                  "ブランチ別のパフォーマンスを比較分析して",
                  "売上と労働時間の関係を分析して",
                  "来月のシフト計画で注意すべき点は？",
                  "コスト削減のために改善できる点を教えて",
                ].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void sendToAi(q)}
                    disabled={aiLoading || !salesStepUpReady}
                    className="rounded-xl border border-violet-700/40 bg-violet-950/20 px-3 py-1.5 text-xs text-violet-300 transition hover:bg-violet-950/40 disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {salesStepUpReady ? (
              <div className="space-y-2 rounded-xl border border-neutral-700/50 bg-neutral-900/50 p-3">
                <p className="text-xs text-neutral-500">
                  ✨ 質問に月を含めると自動で期間を検出します（例:「3月の」「先月の」）。
                  指定がない場合は先月のデータを使用します。
                </p>
              </div>
            ) : null}

            <div className="max-h-[500px] min-h-[300px] space-y-4 overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4">
              {aiMessages.length === 0 ? (
                <div className="flex h-full items-center justify-center py-12 text-sm text-neutral-600">
                  上のボタンを押すか、質問を入力してください
                </div>
              ) : null}

              {aiMessages.map((msg, i) => (
                <div
                  key={`${msg.role}-${msg.timestamp}-${i}`}
                  className={msg.role === "user" ? "flex justify-end" : "flex justify-start"}
                >
                  <div
                    className={[
                      "max-w-[85%] rounded-2xl border px-4 py-3 text-sm leading-relaxed",
                      msg.role === "user"
                        ? "border-violet-600/40 bg-violet-600/30 text-violet-100"
                        : "border-neutral-700/40 bg-neutral-800/60 text-neutral-200",
                    ].join(" ")}
                  >
                    <div className="whitespace-pre-wrap">
                      {msg.content}
                      {(msg as any).streaming && (
                        <span className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-neutral-400 align-text-bottom" />
                      )}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="text-[10px] text-neutral-600">
                        {new Date(msg.timestamp).toLocaleTimeString("ja-JP", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                      {msg.role === "assistant" && !(msg as any).streaming && (
                        msg.saved ? (
                          <span className="text-[11px] text-emerald-500">✅ 保存済み</span>
                        ) : (
                          <button
                            type="button"
                            onClick={async () => {
                              const m = msg as ChatMessage & Record<string, unknown>;
                              const id = crypto.randomUUID();
                              try {
                                const currentAuth = getAuth();
                                await apiPost("/api/ai/analytics/snapshots", {
                                  id,
                                  city: (m._cityScope as string) || city,
                                  date_from: (m._dateFrom as string) || summaryDateFrom,
                                  date_to: (m._dateTo as string) || summaryDateTo,
                                  question: (m._question as string) || "",
                                  answer: msg.content,
                                  model: (m._model as string) || "",
                                  input_tokens: (m._inputTokens as number) || 0,
                                  output_tokens: (m._outputTokens as number) || 0,
                                  approver_name: currentAuth?.staffName || approverName,
                                  pin: currentAuth?.pin || pin,
                                });
                                setAiMessages((prev) =>
                                  prev.map((pm, pi) =>
                                    pi === i ? { ...pm, saved: true, snapshotId: id } : pm
                                  )
                                );
                              } catch {
                                alert("保存に失敗しました。");
                              }
                            }}
                            className="rounded-lg border border-neutral-600/40 bg-neutral-700/40 px-2 py-0.5 text-[11px] text-neutral-300 transition hover:bg-neutral-600/60"
                          >
                            💾 保存
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {aiLoading ? (
                <div className="flex justify-start">
                  <div className="rounded-2xl border border-neutral-700/40 bg-neutral-800/60 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-neutral-400">
                      <Spinner size="sm" />
                      分析中...
                    </div>
                  </div>
                </div>
              ) : null}

              {aiError ? (
                <div className="rounded-xl border border-rose-700/40 bg-rose-950/20 px-4 py-2 text-xs text-rose-300">
                  ❌ {aiError}
                </div>
              ) : null}

              <div ref={chatBottomRef} />
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                placeholder="質問を入力（例：Business Bay の遅刻率が高い原因は？）"
                disabled={aiLoading || !salesStepUpReady}
                className="flex-1 rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-3 text-sm text-neutral-200 placeholder:text-neutral-600 transition focus:border-violet-500/60 focus:outline-none disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => void sendToAi(aiInput)}
                disabled={aiLoading || !aiInput.trim() || !salesStepUpReady}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
              >
                送信
              </button>
              {aiMessages.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setAiMessages([]);
                    setAiError("");
                  }}
                  className="rounded-xl border border-neutral-800 px-4 py-3 text-xs text-neutral-400 transition hover:bg-neutral-900/40"
                >
                  クリア
                </button>
              ) : null}
            </div>

            {!salesStepUpReady ? (
              <div className="text-[10px] text-neutral-600">
                Security セクションで MFA / PIN step-up を完了すると AI Analyst を利用できます。
              </div>
            ) : (
              <div className="flex items-center justify-between text-[10px] text-neutral-600">
                <span>Powered by Claude (Anthropic) • 回答はデータに基づく参考情報です</span>
                <a
                  href="/admin/analytics/ai-history"
                  className="text-violet-400 hover:text-violet-300 hover:underline"
                >
                  過去の分析履歴 →
                </a>
              </div>
            )}
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

              {!isManilaSalesCity && posLatestCoverage ? (
                <div className="mb-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">
                    Latest import coverage
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    If your selected date is newer than these dates, zero values may simply mean data has not been imported yet.
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <div className={BADGE_INFO}>Sales daily: {posLatestCoverage.sales_daily_latest_work_date || "-"}</div>
                    <div className={BADGE_INFO}>Revenue daily: {posLatestCoverage.revenue_latest_work_date || "-"}</div>
                    <div className={BADGE_INFO}>
                      Hourly:{" "}
                      {posLatestCoverage.hourly_latest_work_date ||
                        posLatestCoverage.hourly_latest_month_key ||
                        "-"}
                    </div>
                    <div className={BADGE_INFO}>Operation time: {posLatestCoverage.operation_time_latest_work_date || "-"}</div>
                    <div className={BADGE_INFO}>Product mix: {posLatestCoverage.product_mix_latest_coverage_to || "-"}</div>
                    <div className={BADGE_INFO}>Cancel orders: {posLatestCoverage.cancel_order_type_latest_work_date || "-"}</div>
                  </div>
                  {salesCoverageBehind ? (
                    <div className={BADGE_WARNING + " mt-3 px-3 py-2 text-xs"}>
                      Latest sales import is {posLatestCoverage.sales_daily_latest_work_date || "-"}. Selected range includes newer dates, so some metrics may be zero.
                    </div>
                  ) : null}
                </div>
              ) : null}
              {!isManilaSalesCity && posLatestCoverageError ? (
                <div className={BADGE_WARNING + " mb-5 px-3 py-2 text-xs"}>
                  {posLatestCoverageError}
                </div>
              ) : null}

              <div className={isManilaSalesCity ? "grid grid-cols-1 gap-3 md:grid-cols-3" : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"}>
                <div>
                  <div className={LABEL_TEXT + " mb-1.5 block"}>Summary Range</div>
                  <DateRangePicker
                    value={{ from: summaryDateFrom, to: summaryDateTo }}
                    onChange={(range) => {
                      setSummaryDateFrom(range.from);
                      setSummaryDateTo(range.to);
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
              <div
                className={
                  TAB_CONTAINER.replace("flex-wrap", "flex-nowrap") +
                  " mt-5 max-w-full min-w-0 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                }
              >
                <button
                  type="button"
                  onClick={() => setSalesSectionView("all")}
                  className={(salesSectionView === "all" ? TAB_ACTIVE : TAB_INACTIVE) + " shrink-0"}
                >
                  All
                </button>
                {visibleSalesSectionOptions.map((section) => (
                  <button
                    key={section.value}
                    type="button"
                    onClick={() => setSalesSectionView(section.value)}
                    className={
                      (salesSectionView === section.value ? TAB_ACTIVE : TAB_INACTIVE) + " shrink-0 whitespace-nowrap"
                    }
                  >
                    {section.label}
                  </button>
                ))}
              </div>
            </div>

            {!isManilaSalesCity ? (
              <>
            {salesSectionView === "all" || salesSectionView === "summary" ? (
              <>
                <div id="sales-summary" className={GLASS_CARD + " p-5"}>
                  {/* Header */}
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <div>
                      <h3 className={SECTION_TITLE}>Period Summary</h3>
                      {salesSummaryPriorRangeMemo && (
                        <p className="mt-0.5 text-[11px] text-neutral-500">
                          MoM vs {salesSummaryPriorRangeMemo.from} → {salesSummaryPriorRangeMemo.to}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* KPI grid — Net Sales prominent, rest compact */}
                  <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                    {/* Net Sales — hero card */}
                    {(() => {
                      const mom = summaryKpiMom?.net ?? null;
                      const isPos = mom && !mom.startsWith("-") && mom !== "—" && mom !== "0%";
                      const isNeg = mom && mom.startsWith("-");
                      return (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
                          className="col-span-2 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4 sm:col-span-2"
                        >
                          <div className="mb-1 flex items-center gap-1.5">
                            <DollarSign className="h-3.5 w-3.5 text-violet-400" />
                            <span className="text-[11px] font-semibold uppercase tracking-widest text-violet-400">Net Sales</span>
                          </div>
                          <p className="text-4xl font-bold tabular-nums text-white">{fmtNum(posSalesSummary.revenuePrimary)}</p>
                          {mom && salesSummaryPriorRangeMemo && (
                            <div className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${isPos ? "bg-emerald-500/15 text-emerald-300" : isNeg ? "bg-rose-500/15 text-rose-300" : "bg-neutral-700/30 text-neutral-400"}`}>
                              {isPos ? "↑" : isNeg ? "↓" : ""} {mom} MoM
                            </div>
                          )}
                        </motion.div>
                      );
                    })()}

                    {/* Compact KPI cards */}
                    {[
                      { label: "Gross Revenue", value: posSalesSummary.totalGrossSales, icon: TrendingUp, mom: summaryKpiMom?.gross ?? null, accent: "text-emerald-400" },
                      { label: "Order Count",   value: posSalesSummary.totalOrders,     icon: ShoppingBag, mom: summaryKpiMom?.orders ?? null, accent: "text-white" },
                      { label: "Avg Net / Order", value: posSalesSummary.avgRevenuePerOrder, icon: Receipt, mom: summaryKpiMom?.avg ?? null, accent: "text-violet-300" },
                      { label: "Days w/ Data",  value: posSalesSummary.dayCount,        icon: CalendarDays, mom: summaryKpiMom?.days ?? null, accent: "text-neutral-300" },
                    ].map(({ label, value, icon: Icon, mom, accent }, i) => {
                      const isPos = mom && !mom.startsWith("-") && mom !== "—" && mom !== "0%";
                      const isNeg = mom && mom.startsWith("-");
                      return (
                        <motion.div
                          key={label}
                          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: (i + 1) * 0.05 }}
                          className="rounded-2xl border border-white/8 bg-white/3 p-4"
                        >
                          <div className="mb-2 flex items-center gap-1.5">
                            <Icon className="h-3 w-3 text-neutral-600" />
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">{label}</span>
                          </div>
                          <p className={`text-xl font-bold tabular-nums ${accent}`}>{fmtNum(value)}</p>
                          {mom && salesSummaryPriorRangeMemo && (
                            <span className={`mt-1.5 inline-flex items-center gap-0.5 text-[11px] font-semibold ${isPos ? "text-emerald-400" : isNeg ? "text-rose-400" : "text-neutral-500"}`}>
                              {isPos ? "↑" : isNeg ? "↓" : ""} {mom}
                            </span>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* Store breakdown — visual bars */}
                  <div className="border-t border-white/8 pt-5">
                    <div className="mb-4 flex items-center justify-between">
                      <h4 className="text-xs font-semibold uppercase tracking-widest text-neutral-400">Store Breakdown</h4>
                      {salesSummaryPriorRangeMemo && (
                        <span className="text-[10px] text-neutral-600">MoM vs prev period</span>
                      )}
                    </div>

                    {summaryStoreTableRows.length === 0 ? (
                      <p className="text-sm text-neutral-500">No branch-level rows for this period.</p>
                    ) : (() => {
                      const maxNet = Math.max(...summaryStoreTableRows.map((r) => Number(r.net_revenue || 0)));
                      return (
                        <div className="space-y-2">
                          {summaryStoreTableRows.map((row, idx) => {
                            const net = Number(row.net_revenue || 0);
                            const barPct = maxNet > 0 ? (net / maxNet) * 100 : 0;
                            const netMomPos = row.netPct && !row.netPct.startsWith("-") && row.netPct !== "—" && row.netPct !== "0%";
                            const netMomNeg = row.netPct && row.netPct.startsWith("-");
                            const ordMomPos = row.ordersPct && !row.ordersPct.startsWith("-") && row.ordersPct !== "—" && row.ordersPct !== "0%";
                            const ordMomNeg = row.ordersPct && row.ordersPct.startsWith("-");
                            return (
                              <div key={row.branch_name} className="group rounded-xl border border-white/5 bg-white/2 px-4 py-3 transition-colors hover:bg-white/4">
                                <div className="mb-2 flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2">
                                    <span className="w-4 flex-shrink-0 text-[11px] font-semibold tabular-nums text-neutral-600">#{idx + 1}</span>
                                    <span className="text-sm font-medium text-neutral-200">{row.branch_name}</span>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    {/* Avg net/order */}
                                    <span className="hidden text-[11px] tabular-nums text-neutral-500 sm:inline">
                                      ⌀ {fmtNum(row.avg_net_per_order)}
                                    </span>
                                    {/* Orders */}
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs tabular-nums text-neutral-400">{fmtNum(row.order_count)} orders</span>
                                      {salesSummaryPriorRangeMemo && row.ordersPct && row.ordersPct !== "—" && (
                                        <span className={`text-[10px] font-semibold ${ordMomPos ? "text-emerald-400" : ordMomNeg ? "text-rose-400" : "text-neutral-500"}`}>
                                          {ordMomPos ? "↑" : ordMomNeg ? "↓" : ""}{row.ordersPct}
                                        </span>
                                      )}
                                    </div>
                                    {/* Net MoM badge */}
                                    {salesSummaryPriorRangeMemo && row.netPct && row.netPct !== "—" && (
                                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${netMomPos ? "bg-emerald-500/15 text-emerald-300" : netMomNeg ? "bg-rose-500/15 text-rose-300" : "bg-neutral-700/20 text-neutral-500"}`}>
                                        {netMomPos ? "↑" : netMomNeg ? "↓" : ""}{row.netPct}
                                      </span>
                                    )}
                                    {/* Net sales */}
                                    <span className="w-24 text-right text-sm font-semibold tabular-nums text-white">{fmtNum(net)}</span>
                                  </div>
                                </div>
                                {/* Bar */}
                                <div className="h-1 w-full overflow-hidden rounded-full bg-white/5">
                                  <div className="h-full rounded-full bg-violet-500/60 transition-all" style={{ width: `${barPct.toFixed(1)}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </>
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
                    Hour-of-day totals use <span className="text-zinc-300">pos_sales_hourly_daily</span> when daily
                    exports are synced (filename includes YYYY-MM-DD); otherwise monthly workbooks roll up to{" "}
                    <span className="text-zinc-300">pos_sales_hourly_monthly</span>. Staffing uses overlapping shift hours
                    for the same city/store scope.
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

            {salesSectionView === "all" || salesSectionView === "operationTime" ? (() => {
              const OP_TARGET = 18; // minutes
              // color helper: for time, LOWER = BETTER
              function opTimeColor(min: number | null | undefined): string {
                if (min == null) return "text-neutral-400";
                if (min <= 17) return "text-emerald-400";
                if (min <= 18) return "text-blue-400";
                if (min <= 20) return "text-amber-400";
                return "text-rose-400";
              }
              function opTimeBg(min: number | null | undefined): string {
                if (min == null) return "bg-neutral-500";
                if (min <= 17) return "bg-emerald-500";
                if (min <= 18) return "bg-blue-500";
                if (min <= 20) return "bg-amber-500";
                return "bg-rose-500";
              }
              // For Δ: negative = got FASTER = good (green); positive = got SLOWER = bad (red)
              function deltaTone(pct: number | null | undefined) {
                if (pct == null) return { cls: "text-neutral-500 bg-neutral-700/20", arrow: "" };
                if (pct < -1) return { cls: "text-emerald-300 bg-emerald-500/15", arrow: "↓" };
                if (pct > 1)  return { cls: "text-rose-300 bg-rose-500/15",     arrow: "↑" };
                return { cls: "text-neutral-400 bg-neutral-700/20", arrow: "→" };
              }
              const items = operationTimeAnalytics?.items || [];
              const maxMin = Math.max(OP_TARGET + 4, ...items.map(r => Number(r.overall_completion_minutes || 0)));
              const avgMin = operationTimeSummary.avgOverallMinutes;
              const avgColor = opTimeColor(Number(avgMin));
              const avgBg = opTimeBg(Number(avgMin));
              return (
              <div id="sales-operation-time" className={GLASS_CARD + " p-5"}>
                {/* Header */}
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Table2 className="h-4 w-4 text-violet-400" />
                    <h2 className={SECTION_TITLE}>Operation Time</h2>
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-neutral-500">Target ≤ {OP_TARGET} min</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadCsv(`${exportBaseName}_operation_time.csv`,
                      items.map((row) => ({ date: row.work_date, completion: row.overall_completion_minutes, completion_delta_pct: row.overall_change_pct, acknowledging_seconds: row.acknowledging_seconds, preparing_minutes: row.preparing_minutes, dispatching_minutes: row.dispatching_minutes, delivering_minutes: row.delivering_minutes })))}
                    className={SECONDARY_BUTTON + " flex items-center gap-2 text-sm"}
                  >
                    <Download className="h-3.5 w-3.5" />
                    CSV
                  </button>
                </div>

                {/* KPI row */}
                <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {/* Avg completion — hero */}
                  <div className="col-span-2 rounded-2xl border border-white/10 bg-white/3 p-4 sm:col-span-2">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Avg Completion</div>
                    <div className={`text-4xl font-bold tabular-nums ${avgColor}`}>
                      {avgMin != null ? `${formatDecimal(Number(avgMin), 1)}` : "—"}
                      <span className="ml-1 text-lg font-normal text-neutral-500">min</span>
                    </div>
                    {/* Target gauge */}
                    <div className="mt-3">
                      <div className="mb-1 flex justify-between text-[10px] text-neutral-600">
                        <span>0</span><span className="text-neutral-500">target {OP_TARGET}</span><span>{maxMin}</span>
                      </div>
                      <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/5">
                        {/* target marker */}
                        <div className="absolute top-0 h-full w-0.5 bg-white/20" style={{ left: `${(OP_TARGET / maxMin) * 100}%` }} />
                        {avgMin != null && (
                          <div className={`h-full rounded-full ${avgBg}`} style={{ width: `${Math.min((Number(avgMin) / maxMin) * 100, 100)}%` }} />
                        )}
                      </div>
                    </div>
                    <div className="mt-2 text-[11px] text-neutral-600">{operationTimeSummary.dayCount} days imported</div>
                  </div>

                  {/* Compact cards */}
                  {[
                    { label: "Avg Preparing",   val: operationTimeSummary.avgPreparingMinutes,   unit: "min" },
                    { label: "Avg Delivering",  val: operationTimeSummary.avgDeliveringMinutes,  unit: "min" },
                    { label: "Latest Completion", val: operationTimeSummary.latest?.overall_completion_minutes, unit: "min", sub: operationTimeSummary.latest?.work_date },
                    { label: "Latest Δ", val: null, raw: operationTimeSummary.latest?.overall_change_pct == null ? "—" : formatPct(Number(operationTimeSummary.latest.overall_change_pct), 1) },
                  ].map(({ label, val, unit, sub, raw }) => (
                    <div key={label} className="rounded-2xl border border-white/8 bg-white/2 p-4">
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">{label}</div>
                      <div className={`text-2xl font-bold tabular-nums ${val != null ? opTimeColor(Number(val)) : "text-neutral-300"}`}>
                        {raw ?? (val != null ? `${formatDecimal(Number(val), 1)}` : "—")}
                        {!raw && val != null && <span className="ml-0.5 text-sm font-normal text-neutral-500">{unit}</span>}
                      </div>
                      {sub && <div className="mt-1 text-[10px] text-neutral-600">{sub}</div>}
                    </div>
                  ))}
                </div>

                {/* Daily rows — visual */}
                {!items.length ? (
                  <div className="rounded-xl border border-white/5 py-10 text-center text-sm text-neutral-500">
                    No operation time screenshots imported yet
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {/* Column headers */}
                    <div className="grid grid-cols-[90px_1fr_70px_70px_70px_70px] gap-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-neutral-600">
                      <span>Date</span>
                      <span>Completion</span>
                      <span className="text-right">Δ</span>
                      <span className="text-right">Prep</span>
                      <span className="text-right">Dispatch</span>
                      <span className="text-right">Deliver</span>
                    </div>
                    {items.map((row) => {
                      const min = Number(row.overall_completion_minutes ?? 0);
                      const barW = maxMin > 0 ? Math.min((min / maxMin) * 100, 100) : 0;
                      const targetW = maxMin > 0 ? Math.min((OP_TARGET / maxMin) * 100, 100) : 0;
                      const delta = deltaTone(row.overall_change_pct == null ? null : Number(row.overall_change_pct));
                      return (
                        <div key={row.work_date} className="grid grid-cols-[90px_1fr_70px_70px_70px_70px] items-center gap-2 rounded-xl border border-white/5 bg-white/2 px-3 py-2.5 transition-colors hover:bg-white/4">
                          <span className="text-xs tabular-nums text-neutral-400">{(row.work_date || "").slice(5)}</span>

                          {/* Bar + value */}
                          <div className="flex items-center gap-2">
                            <span className={`w-12 text-sm font-bold tabular-nums ${opTimeColor(min)}`}>
                              {row.overall_completion_minutes != null ? `${formatDecimal(min, 1)}` : "—"}
                              <span className="text-[10px] font-normal text-neutral-500"> min</span>
                            </span>
                            <div className="relative flex-1 h-2 overflow-hidden rounded-full bg-white/5">
                              <div className="absolute top-0 h-full w-px bg-white/20" style={{ left: `${targetW}%` }} />
                              <div className={`h-full rounded-full ${opTimeBg(min)}`} style={{ width: `${barW}%` }} />
                            </div>
                          </div>

                          {/* Δ badge */}
                          <div className="text-right">
                            {row.overall_change_pct == null ? (
                              <span className="text-[11px] text-neutral-600">—</span>
                            ) : (
                              <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${delta.cls}`}>
                                {delta.arrow}{formatPct(Number(row.overall_change_pct), 1)}
                              </span>
                            )}
                          </div>

                          {/* Prep */}
                          <div className="text-right">
                            <span className={`text-xs tabular-nums ${opTimeColor(row.preparing_minutes)}`}>
                              {row.preparing_minutes != null ? `${formatDecimal(Number(row.preparing_minutes), 1)}m` : "—"}
                            </span>
                          </div>

                          {/* Dispatch */}
                          <div className="text-right">
                            <span className="text-xs tabular-nums text-neutral-400">
                              {row.dispatching_minutes != null ? `${formatDecimal(Number(row.dispatching_minutes), 1)}m` : "—"}
                            </span>
                          </div>

                          {/* Deliver */}
                          <div className="text-right">
                            <span className="text-xs tabular-nums text-neutral-400">
                              {row.delivering_minutes != null ? `${formatDecimal(Number(row.delivering_minutes), 1)}m` : "—"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              );
            })() : null}

            {(salesSectionView === "all" || salesSectionView === "summary") && salesCity === "dubai" && !summaryBrandName ? (
              <p className={T_CAPTION}>
                <span className="text-neutral-300">Net sales and gross revenue</span> use only{" "}
                <span className="text-neutral-300">pos_revenue_location_daily</span> (UrbanPiper{" "}
                <span className="text-neutral-300">export_revenue_by_location</span> CSVs). Dates without a Revenue import
                have no daily row and do not add to the period total. Foodics{" "}
                <span className="text-neutral-300">pos_sales_daily</span> is not mixed into these figures.{" "}
                <span className="text-neutral-300">Order count and days w/ sales data</span> also come only from those Revenue
                rows (no <span className="text-neutral-300">dubai_order_counts</span> override).{" "}
                <span className="text-neutral-300">Avg Net / Order</span> divides Summary net by that order count. Management
                P&amp;L labor ratio uses the same combined sales denominator.
              </p>
            ) : null}

            {salesSectionView === "all" || salesSectionView === "brands" ? (
              <>
            {salesCity === "dubai" && brandOrderRanking.length ? (() => {
              const totalOrders = brandOrderRanking.reduce((s, r) => s + r.orders, 0);
              const totalNet    = brandOrderRanking.reduce((s, r) => s + r.netSales, 0);
              const BRAND_ACCENTS: Record<string, { ring: string; glow: string; dot: string }> = {
                "SushiZEN":       { ring: "border-violet-500/30", glow: "bg-violet-500/6",  dot: "bg-violet-400" },
                "RamenZEN":       { ring: "border-amber-500/30",  glow: "bg-amber-500/6",   dot: "bg-amber-400" },
                "All Veggie Sushi":{ ring: "border-emerald-500/30",glow:"bg-emerald-500/6", dot: "bg-emerald-400" },
              };
              return (
              <div id="sales-brands" className={GLASS_CARD + " p-5"}>
                <div className="mb-4 flex items-center gap-2">
                  <Table2 className="h-4 w-4 text-violet-400" />
                  <h2 className={SECTION_TITLE}>Brand &amp; Aggregator Breakdown</h2>
                  <span className="ml-auto text-[11px] text-neutral-500">
                    Total {formatCount(totalOrders)} orders · Net {formatMoney(totalNet)}
                  </span>
                </div>

                {/* Brand share bar */}
                <div className="mb-5">
                  <div className="mb-1.5 flex h-3 w-full overflow-hidden rounded-full">
                    {brandOrderRanking.map((row) => {
                      const pct = totalOrders > 0 ? (row.orders / totalOrders) * 100 : 0;
                      const accent = BRAND_ACCENTS[row.brand] ?? { dot: "bg-neutral-500" };
                      return (
                        <div key={row.brand} title={`${row.brand}: ${pct.toFixed(1)}%`}
                          className={`h-full transition-all ${accent.dot}`}
                          style={{ width: `${pct.toFixed(2)}%` }} />
                      );
                    })}
                  </div>
                  <div className="flex gap-4">
                    {brandOrderRanking.map((row) => {
                      const pct = totalOrders > 0 ? (row.orders / totalOrders) * 100 : 0;
                      const accent = BRAND_ACCENTS[row.brand] ?? { dot: "bg-neutral-500" };
                      return (
                        <div key={row.brand} className="flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-full flex-shrink-0 ${accent.dot}`} />
                          <span className="text-[11px] text-neutral-400">{row.brand}</span>
                          <span className="text-[11px] font-semibold text-neutral-200">{pct.toFixed(1)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Brand cards */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {brandOrderRanking.map((row) => {
                    const pct = totalOrders > 0 ? (row.orders / totalOrders) * 100 : 0;
                    const netPct = totalNet > 0 ? (row.netSales / totalNet) * 100 : 0;
                    const accent = BRAND_ACCENTS[row.brand] ?? { ring: "border-neutral-700/50", glow: "", dot: "bg-neutral-500" };
                    return (
                      <div key={row.brand} className={`rounded-2xl border p-4 ${accent.ring} ${accent.glow}`}>
                        {/* Header */}
                        <div className="mb-3 flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${accent.dot}`} />
                          <span className="text-sm font-semibold text-white">{row.brand}</span>
                        </div>

                        {/* Orders KPI */}
                        <div className="mb-1">
                          <div className="flex items-end justify-between gap-2">
                            <span className="text-3xl font-bold tabular-nums text-white">{formatCount(row.orders)}</span>
                            <span className="mb-1 text-xs font-semibold text-neutral-300">{pct.toFixed(1)}%</span>
                          </div>
                          <div className="text-[11px] text-neutral-500">orders (non-cancelled)</div>
                          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/5">
                            <div className={`h-full rounded-full ${accent.dot}`} style={{ width: `${pct.toFixed(2)}%` }} />
                          </div>
                        </div>

                        {/* Revenue */}
                        <div className="mt-3 rounded-xl border border-white/5 bg-white/3 px-3 py-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-neutral-500">Net sales</span>
                            <span className="text-xs font-semibold tabular-nums text-neutral-200">{formatMoney(row.netSales)}</span>
                          </div>
                          <div className="mt-0.5 h-0.5 w-full overflow-hidden rounded-full bg-white/5">
                            <div className={`h-full rounded-full ${accent.dot} opacity-60`} style={{ width: `${netPct.toFixed(2)}%` }} />
                          </div>
                          <div className="mt-1 flex items-center justify-between">
                            <span className="text-[11px] text-neutral-600">Gross</span>
                            <span className="text-[11px] tabular-nums text-neutral-500">{formatMoney(row.grossSales)}</span>
                          </div>
                        </div>

                        {/* Aggregator breakdown */}
                        <div className="mt-3">
                          <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-600">Aggregator mix</div>
                          <AggregatorBreakdown items={row.aggregators} dense />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              );
            })() : null}

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

            {salesSectionView === "all" || salesSectionView === "productMix" ? (() => {
              // Group rows by Product A
              const pmRows = productMixRankingRows;
              const groupMap = new Map<string, { majorOrders: number; companions: typeof pmRows }>();
              pmRows.forEach((row) => {
                const key = String(row.product_a_name || "").trim();
                if (!groupMap.has(key)) groupMap.set(key, { majorOrders: Number(row.major_orders || 0), companions: [] });
                groupMap.get(key)!.companions.push(row);
              });
              const groups = Array.from(groupMap.entries());
              const maxRatio = Math.max(...pmRows.map((r) => Number(r.ratio || 0)));

              function ratioBarColor(ratio: number): string {
                const pct = ratio * 100;
                if (pct >= 12) return "bg-violet-500";
                if (pct >= 8)  return "bg-blue-500";
                if (pct >= 4)  return "bg-emerald-500";
                return "bg-neutral-500";
              }
              function ratioBadgeColor(ratio: number): string {
                const pct = ratio * 100;
                if (pct >= 12) return "bg-violet-500/20 text-violet-300";
                if (pct >= 8)  return "bg-blue-500/20 text-blue-300";
                if (pct >= 4)  return "bg-emerald-500/20 text-emerald-300";
                return "bg-neutral-700/30 text-neutral-400";
              }

              return (
              <div id="sales-product-mix" className={GLASS_CARD + " p-5"}>
                {/* Header */}
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Table2 className="h-4 w-4 text-violet-400" />
                      <h2 className={SECTION_TITLE}>Product Mix Ranking</h2>
                    </div>
                    <p className="mt-0.5 text-[11px] text-neutral-500">
                      {productMixCoverage.from && productMixCoverage.to
                        ? `Coverage: ${productMixCoverage.from} → ${productMixCoverage.to}`
                        : "No Product Mix import found yet."}
                      {summaryBranchCode && ` · ${(BRANCH_OPTIONS[salesCity] || []).find((opt) => opt.value === summaryBranchCode)?.label || summaryBranchCode}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-neutral-600">
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-violet-500" />≥12%</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-blue-500" />≥8%</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500" />≥4%</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-neutral-500" />&lt;4%</span>
                  </div>
                </div>

                {summaryBrandName && summaryBrandName !== "SushiZEN" ? (
                  <div className="rounded-xl border border-white/8 bg-white/5 px-3 py-6 text-center text-sm text-zinc-500">
                    Product Mix is currently available for SushiZEN only.
                  </div>
                ) : !pmRows.length ? (
                  <div className="rounded-xl border border-white/8 py-12 text-center text-sm text-neutral-500">No Product Mix ranking data</div>
                ) : (
                  <div className="space-y-4">
                    {groups.map(([productA, { majorOrders, companions }], gIdx) => (
                      <div key={productA} className="rounded-2xl border border-white/8 bg-white/2 overflow-hidden">
                        {/* Product A header */}
                        <div className="flex items-center gap-3 border-b border-white/5 bg-white/3 px-4 py-3">
                          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-[11px] font-bold text-violet-300">
                            {gIdx + 1}
                          </span>
                          <span className="flex-1 text-sm font-semibold text-white">{productA}</span>
                          <span className="text-[11px] text-neutral-400 tabular-nums">{formatCount(majorOrders)} orders</span>
                        </div>

                        {/* Companion products */}
                        <div className="divide-y divide-white/4">
                          {companions.map((row, cIdx) => {
                            const ratio = Number(row.ratio || 0);
                            const barW = maxRatio > 0 ? (ratio / maxRatio) * 100 : 0;
                            const ratioPct = ratio * 100;
                            return (
                              <div key={`${row.product_b_name}-${cIdx}`} className="flex items-center gap-3 px-4 py-2.5">
                                {/* Rank within group */}
                                <span className="w-4 flex-shrink-0 text-[10px] text-neutral-600">#{cIdx + 1}</span>

                                {/* Product B name */}
                                <span className="w-40 flex-shrink-0 truncate text-xs text-neutral-300" title={String(row.product_b_name || "")}>
                                  {row.product_b_name || "—"}
                                </span>

                                {/* Bar */}
                                <div className="flex flex-1 items-center gap-2">
                                  <div className="flex-1 h-2 overflow-hidden rounded-full bg-white/5">
                                    <div className={`h-full rounded-full ${ratioBarColor(ratio)}`} style={{ width: `${barW.toFixed(1)}%` }} />
                                  </div>
                                  <span className={`w-16 rounded px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums ${ratioBadgeColor(ratio)}`}>
                                    {formatDecimal(ratioPct, 2)}%
                                  </span>
                                </div>

                                {/* Mix orders */}
                                <span className="w-20 text-right text-[11px] tabular-nums text-neutral-500">
                                  {formatCount(Number(row.mix_orders || 0))} / {formatCount(majorOrders)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              );
            })() : null}

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
              <div className="space-y-6 p-0.5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="flex items-center gap-2 text-xl font-semibold text-white">
                      <span className="text-2xl" aria-hidden>
                        🚫
                      </span>
                      Cancel Orders
                    </h2>
                    <p className={`${T_CAPTION} mt-0.5`}>
                      UrbanPiper lost-order CSVs (POS sync) plus Dubai aggregator cancellations (Careem / Keeta / Talabat).
                      KPIs follow <strong className="text-zinc-300">Summary Range</strong> above; table can narrow by period.
                    </p>
                    <p className={`${T_CAPTION} mt-1`}>
                      API scope — Brand: <span className="text-zinc-300">{summaryBrandName || "All Brands"}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <span className={`${T_CAPTION} mr-1 hidden sm:inline`}>Table period</span>
                    <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
                      {(["7D", "14D", "30D", "ALL"] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setCancelOrdersPeriod(p)}
                          className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                            cancelOrdersPeriod === p
                              ? "bg-red-500/80 text-white shadow"
                              : "text-white/50 hover:text-white/80"
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {cancelOrdersLoadError ? (
                  <div className={`${BADGE_WARNING} px-3 py-2 text-xs whitespace-pre-wrap`}>
                    Cancel orders API: {cancelOrdersLoadError}
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {[
                    {
                      label: "Lost Orders",
                      value: formatCount(cancelOrdersKpi.lostOrders),
                      icon: "🚫",
                      accent: "text-red-400",
                      sub: "total",
                    },
                    {
                      label: "Lost Revenue",
                      value: `AED ${formatDecimal(cancelOrdersKpi.lostRevenue)}`,
                      icon: "💸",
                      accent: "text-orange-400",
                      sub: "at risk",
                    },
                    {
                      label: "Days w/ Data",
                      value: formatCount(cancelOrdersKpi.daysWithData),
                      icon: "📅",
                      accent: "text-sky-400",
                      sub: "tracked",
                    },
                    {
                      label: "Cancel Types",
                      value: formatCount(cancelOrdersKpi.cancelTypes),
                      icon: "🏷️",
                      accent: "text-violet-400",
                      sub: "categories",
                    },
                    {
                      label: "Platforms",
                      value: formatCount(cancelOrdersKpi.platforms),
                      icon: "📱",
                      accent: "text-emerald-400",
                      sub: "active",
                    },
                  ].map(({ label, value, icon, accent, sub }) => (
                    <div
                      key={label}
                      className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/5 p-4 transition-colors hover:bg-white/[0.08]"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs uppercase tracking-wider text-white/40">{label}</span>
                        <span className="text-lg" aria-hidden>
                          {icon}
                        </span>
                      </div>
                      <p className={`text-2xl font-bold tabular-nums ${accent}`}>{value}</p>
                      <p className="text-xs text-white/30">{sub}</p>
                    </div>
                  ))}
                </div>

                {salesCity === "dubai" &&
                !cancelOrderSummary.lostOrderCount &&
                !cancelOrderSummary.lostRevenue ? (
                  <p
                    className={`${T_CAPTION} rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-amber-100/95`}
                  >
                    No cancel rows for{" "}
                    <strong className="text-zinc-100">
                      {summaryDateFrom} → {summaryDateTo}
                    </strong>
                    . Widen <strong className="text-zinc-200">Summary Range</strong>, or import under{" "}
                    <strong className="text-zinc-200">Admin → Dubai Cancellation</strong>.
                  </p>
                ) : null}

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-5 lg:col-span-3">
                    <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/70">Platform Breakdown</h3>
                    {cancelOrdersPlatformChartData.length ? (
                      <>
                        <div className="mb-5 flex flex-wrap gap-3">
                          {cancelOrdersPlatformChartData.map((p) => {
                            const meta = CANCEL_ORDERS_PLATFORM_META[p.name];
                            return (
                              <div
                                key={p.name}
                                className={`min-w-[100px] flex-1 rounded-lg p-3 ring-1 ${meta?.bg ?? "bg-white/5"} ${meta?.ring ?? "ring-white/15"}`}
                              >
                                <div className="mb-2 flex items-center gap-1.5">
                                  <span className={`h-2 w-2 rounded-full ${meta?.dot ?? "bg-zinc-400"}`} />
                                  <span className="text-xs font-medium text-white/80">{p.name}</span>
                                </div>
                                <p className="text-2xl font-bold text-white tabular-nums">{formatCount(p.lostOrders)}</p>
                                <p className="mt-0.5 text-xs text-white/40">lost orders</p>
                              </div>
                            );
                          })}
                        </div>
                        <div className="h-44 w-full min-w-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={cancelOrdersPlatformChartData}
                              layout="vertical"
                              margin={{ top: 0, right: 16, bottom: 0, left: 8 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                              <XAxis
                                type="number"
                                tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <YAxis
                                type="category"
                                dataKey="name"
                                tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 12 }}
                                axisLine={false}
                                tickLine={false}
                                width={72}
                              />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: "#1e293b",
                                  border: "1px solid rgba(255,255,255,0.1)",
                                  borderRadius: 8,
                                  color: "#fff",
                                  fontSize: 12,
                                }}
                                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                              />
                              <Bar dataKey="lostOrders" name="Lost orders" radius={[0, 4, 4, 0]}>
                                {cancelOrdersPlatformChartData.map((entry) => (
                                  <Cell key={entry.name} fill={entry.fill} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="mt-4 overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-white/10">
                                {["Platform", "Platform Pre", "Platform Post", "Merchant Pre"].map((h) => (
                                  <th key={h} className="pb-2 pr-4 text-left font-medium text-white/40">
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {cancelOrdersUiPlatforms.map((p) => {
                                const meta = CANCEL_ORDERS_PLATFORM_META[p.platform];
                                return (
                                  <tr key={p.platform} className="border-b border-white/5 hover:bg-white/5">
                                    <td className="py-2 pr-4">
                                      <span className="inline-flex items-center gap-1.5 font-medium text-white/80">
                                        <span className={`h-2 w-2 rounded-full ${meta?.dot ?? "bg-zinc-400"}`} />
                                        {p.platform}
                                      </span>
                                    </td>
                                    <td className="py-2 pr-4 text-white/60 tabular-nums">{formatCount(p.platformPre)}</td>
                                    <td className="py-2 pr-4 text-white/60 tabular-nums">{formatCount(p.platformPost)}</td>
                                    <td className="py-2 pr-4 text-white/60 tabular-nums">{formatCount(p.merchantPre)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : (
                      <p className="py-8 text-center text-sm text-white/35">No platform breakdown data</p>
                    )}
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/5 p-5 lg:col-span-2">
                    <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/70">Order Types</h3>
                    {cancelOrdersOrderTypePieData.length ? (
                      <>
                        <div className="h-44 w-full min-w-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={cancelOrdersOrderTypePieData}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                innerRadius={48}
                                outerRadius={72}
                                paddingAngle={3}
                              >
                                {cancelOrdersOrderTypePieData.map((entry) => (
                                  <Cell key={entry.name} fill={entry.fill} />
                                ))}
                              </Pie>
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: "#1e293b",
                                  border: "1px solid rgba(255,255,255,0.1)",
                                  borderRadius: 8,
                                  color: "#fff",
                                  fontSize: 12,
                                }}
                                formatter={(val, _name, item) => {
                                  const payload = item?.payload as { revenue?: number; name?: string } | undefined;
                                  const rev = Number(payload?.revenue || 0);
                                  return [`${val} orders (AED ${formatDecimal(rev)})`, String(payload?.name ?? "")];
                                }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="mt-4 space-y-3">
                          {cancelOrdersUiOrderTypes.map((t, i) => (
                            <div
                              key={t.type}
                              className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-3"
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className="h-3 w-3 flex-shrink-0 rounded-full"
                                  style={{
                                    backgroundColor:
                                      CANCEL_ORDERS_ORDER_TYPE_COLORS[i % CANCEL_ORDERS_ORDER_TYPE_COLORS.length] ?? "#8b5cf6",
                                  }}
                                />
                                <span className="text-sm font-medium text-white/80">{t.type}</span>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-bold text-white tabular-nums">{formatCount(t.lostOrders)}</p>
                                <p className="text-xs text-white/40">AED {formatDecimal(t.lostRevenue)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-center">
                          <p className="mb-0.5 text-xs text-red-400/80">Total Revenue at Risk</p>
                          <p className="text-lg font-bold text-red-400 tabular-nums">
                            AED {formatDecimal(cancelOrdersKpi.lostRevenue)}
                          </p>
                        </div>
                      </>
                    ) : (
                      <p className="py-8 text-center text-sm text-white/35">No cancel-order type data</p>
                    )}
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
                  <div className="flex flex-col gap-3 border-b border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-white/70">
                      Daily Records
                      <span className="ml-2 text-xs font-normal normal-case text-white/30">
                        ({cancelOrdersFilteredTableRows.length} entries)
                      </span>
                    </h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={cancelOrdersTableBrandFilter}
                        onChange={(e) => setCancelOrdersTableBrandFilter(e.target.value)}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 focus:outline-none focus:ring-1 focus:ring-white/20"
                      >
                        <option value="ALL">All Brands</option>
                        {cancelOrdersBrandOptions.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>
                      <select
                        value={cancelOrdersTablePlatformFilter}
                        onChange={(e) => setCancelOrdersTablePlatformFilter(e.target.value)}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 focus:outline-none focus:ring-1 focus:ring-white/20"
                      >
                        <option value="ALL">All Platforms</option>
                        {Object.keys(CANCEL_ORDERS_PLATFORM_META).map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <p className={`${T_CAPTION} border-b border-white/5 px-4 py-2 text-white/35`}>
                    Platform filter matches rows whose source text names Careem, Keeta, or Talabat; aggregated rows may
                    hide when a specific platform is selected.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-sm">
                      <thead>
                        <tr className="border-b border-white/10 bg-white/[0.03]">
                          {(
                            [
                              { key: "date" as const, label: "DATE" },
                              { key: "brand" as const, label: "BRAND" },
                              { key: "lostOrders" as const, label: "LOST ORDERS" },
                              { key: "lostRevenue" as const, label: "LOST REVENUE" },
                            ] as const
                          ).map(({ key, label }) => (
                            <th
                              key={key}
                              className="cursor-pointer select-none px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white/40 hover:text-white/70"
                              onClick={() => {
                                if (cancelOrdersTableSortCol === key) {
                                  setCancelOrdersTableSortDir((d) => (d === "asc" ? "desc" : "asc"));
                                } else {
                                  setCancelOrdersTableSortCol(key);
                                  setCancelOrdersTableSortDir("desc");
                                }
                              }}
                            >
                              {label}
                              {cancelOrdersTableSortCol === key ? (
                                <span className="ml-1 text-white/60">{cancelOrdersTableSortDir === "asc" ? "↑" : "↓"}</span>
                              ) : null}
                            </th>
                          ))}
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white/40">
                            SOURCE
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {cancelOrdersFilteredTableRows.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-12 text-center text-sm text-white/30">
                              No records found
                            </td>
                          </tr>
                        ) : (
                          cancelOrdersFilteredTableRows.map((row, idx) => (
                            <tr key={`${row.date}-${row.brand}-${idx}`} className="border-b border-white/5 hover:bg-white/5">
                              <td className="px-4 py-3 font-mono text-xs text-white/70">{row.date}</td>
                              <td className="px-4 py-3">
                                <span className="inline-block rounded border border-indigo-500/20 bg-indigo-500/15 px-2 py-0.5 text-xs font-medium text-indigo-300">
                                  {row.brand}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`font-bold tabular-nums ${row.lostOrders >= 5 ? "text-red-400" : "text-orange-400"}`}
                                >
                                  {formatCount(row.lostOrders)}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-medium tabular-nums text-white/80">
                                AED {formatDecimal(row.lostRevenue)}
                              </td>
                              <td className="max-w-xs truncate px-4 py-3 text-xs text-white/30" title={row.sourceFile}>
                                {row.sourceFile || "—"}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
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

            {salesSectionView === "all" || salesSectionView === "dataCheck" ? (
              <div id="sales-data-check">
                <SalesDataCheckTable
                  title="Dubai Sales Data Check"
                  caption="Per-day source coverage for the tables backing Dubai sales analytics. Monthly-only hourly coverage means hourly totals exist for the month, but not as day-grain imports."
                  rows={posDataCheck?.rows || []}
                  columns={dubaiDataCheckColumns}
                  selectedDates={posDataCheckSelectedDates}
                  onToggleDate={(workDate) => toggleDateSelection(workDate, posDataCheckSelectedDates, setPosDataCheckSelectedDates)}
                  onSelectMissing={() => selectProblemDates(posDataCheck?.rows || [], setPosDataCheckSelectedDates)}
                  onClearSelection={() => setPosDataCheckSelectedDates([])}
                  onRefresh={() => void loadAll("sales")}
                  onReimport={() => void reimportSalesDates("dubai")}
                  refreshBusy={loading}
                  reimportBusy={salesSyncing}
                  message={salesSyncMessage}
                  error={posDataCheckError}
                />
              </div>
            ) : null}

            {salesSectionView === "all" || salesSectionView === "orderCounts" ? (
              <div id="sales-order-counts">
                <NumberOfOrdersTab approverName={approverName} pin={pin} stepUpReady={salesStepUpReady} />
              </div>
            ) : null}
            {salesSectionView === "all" || salesSectionView === "manilaOverallRatings" ? (
              <div id="sales-manila-overall-ratings">
                <ManilaOverallRatingsTab
                  dateFrom={summaryDateFrom}
                  dateTo={summaryDateTo}
                  approverName={approverName}
                  pin={pin}
                  stepUpReady={salesStepUpReady}
                  city="dubai"
                />
              </div>
            ) : null}
            {salesSectionView === "all" || salesSectionView === "aggregatorRatings" ? (
              <div id="sales-aggregator-ratings">
                <AggregatorRatingsTab approverName={approverName} pin={pin} stepUpReady={salesStepUpReady} />
              </div>
            ) : null}
            {salesSectionView === "all" || salesSectionView === "dubaiCancellations" ? (
              <div id="sales-dubai-cancellations">
                <DubaiCancellationsTab
                  dateFrom={summaryDateFrom}
                  dateTo={summaryDateTo}
                  approverName={approverName}
                  pin={pin}
                  stepUpReady={salesStepUpReady}
                />
              </div>
            ) : null}
              </>
            ) : null}

            {isManilaSalesCity ? (
              <>
                {salesSectionView === "all" || salesSectionView === "manilaSales" ? (
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
                {salesSectionView === "all" || salesSectionView === "dataCheck" ? (
                  <div id="sales-data-check">
                    <SalesDataCheckTable
                      title="Manila Sales Data Check"
                      caption="Per-day coverage across Manila sales datasets. `N/A` means the active source systems for that day do not support that dataset."
                      rows={manilaDataCheck?.rows || []}
                      columns={manilaDataCheckColumns}
                      selectedDates={manilaDataCheckSelectedDates}
                      onToggleDate={(workDate) => toggleDateSelection(workDate, manilaDataCheckSelectedDates, setManilaDataCheckSelectedDates)}
                      onSelectMissing={() => selectProblemDates(manilaDataCheck?.rows || [], setManilaDataCheckSelectedDates)}
                      onClearSelection={() => setManilaDataCheckSelectedDates([])}
                      onRefresh={() => void loadManilaDataCheckNow()}
                      onReimport={() => void reimportSalesDates("manila")}
                      refreshBusy={manilaDataCheckLoading}
                      reimportBusy={salesSyncing}
                      message={salesSyncMessage}
                      error={manilaDataCheckError}
                      selectMissingLabel="Select problem days"
                    />
                  </div>
                ) : null}
                {salesSectionView === "all" || salesSectionView === "orderCounts" ? (
                  <ManilaOrderCountsTab
                    dateFrom={summaryDateFrom}
                    dateTo={summaryDateTo}
                    approverName={approverName}
                    pin={pin}
                    stepUpReady={salesStepUpReady}
                  />
                ) : null}
                {salesSectionView === "all" || salesSectionView === "manilaLowRatings" ? (
                  <ManilaRatingsTab
                    dateFrom={summaryDateFrom}
                    dateTo={summaryDateTo}
                    approverName={approverName}
                    pin={pin}
                    stepUpReady={salesStepUpReady}
                  />
                ) : null}
                {salesSectionView === "all" || salesSectionView === "manilaAggregatorRatings" ? (
                  <div id="sales-manila-aggregator-ratings">
                    <ManilaAggregatorRatingsTab approverName={approverName} pin={pin} stepUpReady={salesStepUpReady} />
                  </div>
                ) : null}
                {salesSectionView === "all" || salesSectionView === "manilaOverallRatings" ? (
                  <div id="sales-manila-overall-ratings">
                    <ManilaOverallRatingsTab
                      dateFrom={summaryDateFrom}
                      dateTo={summaryDateTo}
                      approverName={approverName}
                      pin={pin}
                      stepUpReady={salesStepUpReady}
                    />
                  </div>
                ) : null}
                {salesSectionView === "all" || salesSectionView === "manilaSalesData" ? (
                  <div id="sales-manila-daily">
                    <ManilaSalesDataTab
                      dateFrom={summaryDateFrom}
                      dateTo={summaryDateTo}
                      approverName={approverName}
                      pin={pin}
                      stepUpReady={salesStepUpReady}
                    />
                  </div>
                ) : null}
                {salesSectionView === "all" || salesSectionView === "manilaCashierEval" ? (
                  <div id="sales-manila-cashier-eval">
                    <ManilaCashierEvaluationTab
                      dateFrom={summaryDateFrom}
                      dateTo={summaryDateTo}
                      approverName={approverName}
                      pin={pin}
                      stepUpReady={salesStepUpReady}
                    />
                  </div>
                ) : null}
                {salesSectionView === "all" || salesSectionView === "manilaCancellations" ? (
                  <div id="sales-manila-cancellations">
                    <ManilaCancellationsTab
                      dateFrom={summaryDateFrom}
                      dateTo={summaryDateTo}
                      approverName={approverName}
                      pin={pin}
                      stepUpReady={salesStepUpReady}
                    />
                  </div>
                ) : null}
                {salesSectionView === "all" || salesSectionView === "manilaGrabOffline" ? (
                  <ManilaGrabOfflineTab
                    dateFrom={summaryDateFrom}
                    dateTo={summaryDateTo}
                    approverName={approverName}
                    pin={pin}
                    stepUpReady={salesStepUpReady}
                  />
                ) : null}
              </>
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
                        setSummaryDateFrom(range.from);
                        setSummaryDateTo(range.to);
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
                        setSummaryDateFrom(range.from);
                        setSummaryDateTo(range.to);
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
            <div id="finance-summary">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
              <div className="flex min-h-[120px] flex-col rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="min-h-[32px] text-xs leading-4 text-neutral-500">Revenue (P&amp;L imported)</div>
                <MetricValue
                  className={NUMERIC_BLOCK_VALUE}
                  value={plHeadline ? plHeadline.revenue : isStoreScopedView ? "—" : Number(financeRatio?.sales_total ?? 0)}
                />
                {plHeadline && plHeadline.revenue > 0 && <div className="mt-1 text-[10px] text-neutral-500">100% of revenue</div>}
              </div>
              <div className="flex min-h-[120px] flex-col rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="min-h-[32px] text-xs leading-4 text-neutral-500">Opex (P&amp;L rollup)</div>
                <MetricValue
                  className={NUMERIC_BLOCK_VALUE}
                  value={plHeadline ? plHeadline.opex : isStoreScopedView ? "—" : financeBreakdown ? financeBreakdown.totalModeledCost : "—"}
                />
                {plHeadline && plHeadline.revenue > 0 && <div className="mt-1 text-[10px] text-neutral-500">{formatPct((plHeadline.opex / plHeadline.revenue) * 100)} of revenue</div>}
              </div>
              <div className="flex min-h-[120px] flex-col rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="min-h-[32px] text-xs leading-4 text-neutral-500">Operating profit (P&amp;L)</div>
                <MetricValue
                  className={plHeadline ? (plHeadline.profit >= 0 ? `${NUMERIC_BLOCK_VALUE} text-emerald-400` : `${NUMERIC_BLOCK_VALUE} text-rose-400`) : NUMERIC_BLOCK_VALUE}
                  value={plHeadline ? plHeadline.profit : isStoreScopedView ? "—" : Number(financeRatio?.estimated_profit_using_targets ?? 0)}
                />
                {plHeadline && plHeadline.revenue > 0 && <div className="mt-1 text-[10px] text-neutral-500">{formatPct((plHeadline.profit / plHeadline.revenue) * 100)} margin</div>}
              </div>
              <div className="flex min-h-[120px] flex-col rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="min-h-[32px] text-xs leading-4 text-neutral-500">FLR cost total</div>
                <MetricValue className={NUMERIC_BLOCK_VALUE} value={plHeadline ? plHeadline.flrCost : "—"} />
                {plHeadline && plHeadline.revenue > 0 && <div className="mt-1 text-[10px] text-neutral-500">{formatPct((plHeadline.flrCost / plHeadline.revenue) * 100)} of revenue</div>}
              </div>
              <div className="flex min-h-[120px] flex-col rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <div className="min-h-[32px] text-xs leading-4 text-neutral-500">Other expenses total</div>
                <MetricValue className={NUMERIC_BLOCK_VALUE} value={plHeadline ? plHeadline.otherExpenses : "—"} />
                {plHeadline && plHeadline.revenue > 0 && <div className="mt-1 text-[10px] text-neutral-500">{formatPct((plHeadline.otherExpenses / plHeadline.revenue) * 100)} of revenue</div>}
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
                          {seg.label} {((seg.value/rev)*100).toFixed(1)}%
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}
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
                    {breakEven.basis.month_key ? (
                      <span className="text-neutral-500"> · Month {breakEven.basis.month_key}</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                {breakEven?.basis?.mode === "imported_pl_month"
                  ? "Reflects one full calendar month from the synced Management P&L (the most recent closed month available in the import)."
                  : "Uses rolling 30 days when all required data is available; otherwise falls back to the previous full month."}
              </div>
              {breakEven?.basis ? (
                <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-neutral-400 md:grid-cols-3">
                  <div>
                    Range: <span className="text-neutral-200">{breakEven.basis.date_from} to {breakEven.basis.date_to}</span>
                  </div>
                  <div>
                    {breakEven.basis.mode === "imported_pl_month" ? (
                      <>
                        Days in period:{" "}
                        <span className="text-neutral-200">
                          {formatCount(Number(breakEven.completeness?.pos_days_expected || 0))} calendar days
                        </span>
                      </>
                    ) : (
                      <>
                        POS coverage:{" "}
                        <span className="text-neutral-200">
                          {formatCount(Number(breakEven.completeness?.pos_days_present || 0))}/{formatCount(Number(breakEven.completeness?.pos_days_expected || 0))} days
                        </span>
                      </>
                    )}
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
                      <div className="font-semibold text-amber-50">Prior window was missing:</div>
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
                    {breakEven.basis?.mode === "imported_pl_month"
                      ? "Imported P&L month is incomplete:"
                      : breakEven.basis?.mode === "previous_month_fallback"
                      ? "Fallback month is still missing:"
                      : "Current window is still missing:"}
                  </div>
                  <div className="mt-2 space-y-1 text-[11px] text-rose-100/90">
                    {(breakEven.completeness?.selected_reasons || []).map((reason) => (
                      <div key={`selected-${reason}`}>- {formatBreakEvenReasonLabel(reason)}</div>
                    ))}
                    {(breakEven.completeness?.missing_pl_months || []).length ? (
                      <div>Missing P&amp;L months: {formatBreakEvenMissingDates(breakEven.completeness?.missing_pl_months)}</div>
                    ) : null}
                    {breakEven.basis?.mode !== "imported_pl_month" && (breakEven.completeness?.missing_pos_dates || []).length ? (
                      <div>Missing POS dates: {formatBreakEvenMissingDates(breakEven.completeness?.missing_pos_dates)}</div>
                    ) : null}
                    {breakEven.basis?.mode !== "imported_pl_month"
                      ? (breakEven.completeness?.missing_pos_store_details || []).slice(0, 8).map((item) => (
                          <div key={`selected-store-${item.store_name}`}>
                            {item.store_name}: {formatBreakEvenMissingDates(item.missing_dates)}
                          </div>
                        ))
                      : null}
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
                  {/* Safety margin gauge */}
                  {breakEven?.summary?.margin_of_safety_pct != null && (() => {
                    const pct = Number(breakEven.summary.margin_of_safety_pct) * 100;
                    const isAbove = pct >= 0;
                    const fillPct = Math.min(Math.abs(pct), 100);
                    return (
                      <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                        <div className="mb-2 flex items-center justify-between">
                          <div className="text-xs font-medium text-neutral-300">Safety margin gauge</div>
                          <div className={`text-sm font-bold ${isAbove ? "text-emerald-400" : "text-rose-400"}`}>
                            {isAbove ? "+" : ""}{formatPct(pct)}
                          </div>
                        </div>
                        <div className="relative h-4 w-full overflow-hidden rounded-full bg-neutral-800">
                          <div
                            className={`h-full rounded-full transition-all ${isAbove ? "bg-emerald-600" : "bg-rose-600"}`}
                            style={{ width: `${fillPct}%` }}
                          />
                          <div className="absolute inset-0 flex items-center px-2">
                            <div className="w-full border-l-2 border-white/40" style={{ marginLeft: "0%" }} />
                          </div>
                        </div>
                        <div className="mt-1 flex justify-between text-[10px] text-neutral-500">
                          <span>0 (break-even)</span>
                          <span>{isAbove ? "Above break-even ✓" : "Below break-even ✗"}</span>
                        </div>
                      </div>
                    );
                  })()}
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
                  {breakEven.scope === "company" && (breakEven.stores || []).length > 1 && (() => {
                    const chartData = (breakEven.stores || []).map(s => ({
                      name: s.store_name,
                      margin: s.margin_of_safety_pct != null ? Number(s.margin_of_safety_pct) * 100 : 0,
                    }));
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
                              {chartData.map((entry, i) => (
                                <Cell key={i} fill={entry.margin >= 0 ? "#059669" : "#e11d48"} />
                              ))}
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
                {plVsTarget?.ok && (() => {
                  const rev = Number(plVsTarget.analysis_sales ?? plVsTarget.revenue_pl ?? 0);
                  if (rev <= 0) return null;
                  const bkts = plVsTarget.buckets;
                  const chartData = [
                    { name: "Food", actual: bkts.food ? Number(bkts.food.actual_pct_of_net_sales_pos) : 0, target: bkts.food ? Number(bkts.food.target_pct)*100 : 0 },
                    { name: "Labor", actual: laborDisplay ? laborDisplay.actualPct : 0, target: laborDisplay ? laborDisplay.targetPct : 0 },
                    { name: "Rent", actual: bkts.rent ? Number(bkts.rent.actual_pct_of_net_sales_pos) : 0, target: bkts.rent ? Number(bkts.rent.target_pct)*100 : 0 },
                    { name: "Other", actual: bkts.other ? Number(bkts.other.actual_pct_of_net_sales_pos) : 0, target: bkts.other ? Number(bkts.other.target_pct)*100 : 0 },
                  ];
                  return (
                    <div className="mb-3 rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                      <div className="mb-1 text-[10px] text-neutral-500">Cost buckets: Actual vs Target (% of revenue)</div>
                      <ResponsiveContainer width="100%" height={110}>
                        <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#a3a3a3" }} />
                          <YAxis tick={{ fontSize: 10, fill: "#737373" }} tickFormatter={(v) => `${v.toFixed(0)}%`} />
                          <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} contentStyle={{ background: "#0a0a0a", border: "1px solid #262626", borderRadius: 8 }} />
                          <Bar dataKey="target" name="Target" fill="#525252" radius={[2,2,0,0]} barSize={14} />
                          <Bar dataKey="actual" name="Actual" radius={[2,2,0,0]} barSize={14}>
                            {chartData.map((entry, i) => (
                              <Cell key={i} fill={entry.actual <= entry.target ? "#059669" : "#e11d48"} />
                            ))}
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
                        <th className="py-2 pr-2">Bucket</th>
                        <th className="py-2 pr-2">Target %</th>
                        <th className="py-2 pr-2">Target amt</th>
                        <th className="py-2 pr-2">Actual (import)</th>
                        <th className="py-2 pr-2">Actual % / analysis sales</th>
                        <th className="py-2 pr-2">Δ vs target $</th>
                        <th className="py-2 pr-2">Δ vs target pp</th>
                        <th className="py-2">Progress vs target</th>
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
                            <td className="py-2 pr-2">{b.variance_pct_points.toFixed(2)}</td>
                            <td className="py-2 pl-2">
                              <div className="relative h-3 w-32 overflow-hidden rounded-full bg-neutral-800">
                                <div
                                  className={`h-full rounded-full ${b.actual_pct_of_net_sales_pos <= b.target_pct * 100 ? "bg-emerald-600" : "bg-rose-600"}`}
                                  style={{ width: `${Math.min((b.actual_pct_of_net_sales_pos / Math.max(b.target_pct * 100, 0.01)) * 100, 150)}%`, maxWidth: "100%" }}
                                  title={`Actual: ${formatPct(b.actual_pct_of_net_sales_pos)} vs Target: ${formatPct(b.target_pct * 100)}`}
                                />
                                <div className="absolute left-[66.6%] top-0 h-full w-px bg-white/20" />
                              </div>
                            </td>
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
                        <td className="py-2 pr-2 text-[10px] text-neutral-400">
                          {laborDisplay?.usePlOnly
                            ? "Store scope uses P&L labor lines"
                            : `PL vs payroll Δ ${formatMoney(laborDisplay?.variancePlVsPayroll ?? 0)}`}
                        </td>
                        <td className="py-2 pl-2">
                          {laborDisplay && laborDisplay.targetPct > 0 && (
                            <div className="relative h-3 w-32 overflow-hidden rounded-full bg-neutral-800">
                              <div
                                className={`h-full rounded-full ${(laborDisplay.actualPct) <= laborDisplay.targetPct ? "bg-emerald-600" : "bg-rose-600"}`}
                                style={{ width: `${Math.min((laborDisplay.actualPct / Math.max(laborDisplay.targetPct, 0.01)) * 100, 150)}%`, maxWidth: "100%" }}
                                title={`Actual: ${formatPct(laborDisplay.actualPct)} vs Target: ${formatPct(laborDisplay.targetPct)}`}
                              />
                              <div className="absolute left-[66.6%] top-0 h-full w-px bg-white/20" />
                            </div>
                          )}
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

                {payrollSummary.grossPay > 0 && (() => {
                  const pieData = [
                    { name: "Basic", value: payrollSummary.basicSalary, fill: "#3b82f6" },
                    { name: "Housing", value: payrollSummary.accommodation, fill: "#8b5cf6" },
                    { name: "Food", value: payrollSummary.foodAllowance, fill: "#f59e0b" },
                    { name: "Transport", value: payrollSummary.transportation, fill: "#10b981" },
                    { name: "Other", value: payrollSummary.otherAllowance, fill: "#6b7280" },
                  ].filter(d => d.value > 0);
                  // Department breakdown
                  const deptMap: Record<string, number> = {};
                  payrollRowsFiltered.forEach(r => {
                    const d = r.department || "Other";
                    deptMap[d] = (deptMap[d] || 0) + Number(r.total_net_pay || 0);
                  });
                  const deptData = Object.entries(deptMap).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value).slice(0, 8);
                  return (
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
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
                        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
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
          ) : analyticsTab === "overtime" ? null : analyticsTab === "late" ? null : analyticsTab === "absence" ? null : analyticsTab === "adherence" ? null : analyticsTab === "lean_shift" ? null : analyticsTab === "ai" ? null : (
          <div className={`mt-8 p-6 ${GLASS_CARD} ${BODY_TEXT}`}>
            This channel is not available for your current role/city.
          </div>
          )}

          {analyticsTab === "overtime" && canViewStaffChannel && (
          <div className="mt-8">
            <OvertimeTab
              city={city}
              dateFrom={dateFrom}
              dateTo={dateTo}
              approverName={approverName}
              pin={pin}
            />
          </div>
          )}

          {analyticsTab === "late" && canViewStaffChannel && (
          <div className="mt-8">
            <LateTab
              city={city}
              dateFrom={dateFrom}
              dateTo={dateTo}
              approverName={approverName}
              pin={pin}
            />
          </div>
          )}

          {analyticsTab === "absence" && canViewStaffChannel && (
          <div className="mt-8">
            <AbsenceTab
              city={city}
              dateFrom={dateFrom}
              dateTo={dateTo}
              approverName={approverName}
              pin={pin}
            />
          </div>
          )}

          {analyticsTab === "adherence" && canViewStaffChannel && (
          <div className="mt-8">
            <AdherenceTab
              city={city}
              dateFrom={dateFrom}
              dateTo={dateTo}
              approverName={approverName}
              pin={pin}
            />
          </div>
          )}

          {analyticsTab === "lean_shift" && canViewStaffChannel && (
          <div className="mt-8">
            <LeanShiftTab
              city={city}
              dateFrom={dateFrom}
              dateTo={dateTo}
              approverName={approverName}
              pin={pin}
            />
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

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const cur = currentCalendarMonthRangeThroughTodayIso();
                    setSummaryDateFrom(cur.from);
                    setSummaryDateTo(cur.to);
                  }}
                  className={SECONDARY_BUTTON + " text-sm"}
                >
                  今月（月初〜今日）
                </button>
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
                    setSummaryDateFrom(range.from);
                    setSummaryDateTo(range.to);
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

            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">
                    Latest Bayzat import coverage
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    This reflects the latest attendance import available for staff summary analytics.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={syncAttendanceNow}
                  disabled={attendanceSyncing || !approverName.trim() || !salesStepUpReady}
                  className={`${SECONDARY_BUTTON} flex items-center gap-2 text-xs disabled:opacity-60`}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {attendanceSyncing ? "Syncing..." : "Sync Latest Bayzat Data"}
                </button>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className={BADGE_INFO}>Coverage: {attendanceLatestCoverage?.date_from || "-"} -&gt; {attendanceLatestCoverage?.date_to || "-"}</div>
                <div className={BADGE_INFO}>Last synced: {formatDateTimeLabel(attendanceLatestCoverage?.last_synced_at)}</div>
                <div className={BADGE_INFO}>File: {attendanceLatestCoverage?.last_seen_file_name || "-"}</div>
                <div className={BADGE_INFO}>Source: {attendanceLatestCoverage?.source_name || "-"}</div>
              </div>
              {attendanceLatestCoverage?.drive_modified_time ? (
                <div className="mt-2 text-xs text-neutral-500">
                  Drive modified: {formatDateTimeLabel(attendanceLatestCoverage.drive_modified_time)}
                </div>
              ) : null}
              <div className="mt-2 text-xs text-neutral-500">
                Auto sync:{" "}
                {attendanceAutoSyncStatus?.enabled
                  ? `ON (UTC ${(attendanceAutoSyncStatus.hours_utc || []).map((h) => String(h).padStart(2, "0") + ":00").join(", ") || "-"})`
                  : "OFF"}
              </div>
              {attendanceAutoSyncStatus ? (
                <div className="mt-1 text-xs text-neutral-500">
                  Source:{" "}
                  {attendanceAutoSyncStatus.source_id
                    ? `source_id=${attendanceAutoSyncStatus.source_id}`
                    : attendanceAutoSyncStatus.folder_id
                      ? `folder_id=${attendanceAutoSyncStatus.folder_id}`
                      : "-"}
                </div>
              ) : null}
              {attendanceAutoSyncStatus?.enabled && !attendanceAutoSyncStatus.configured ? (
                <div className={BADGE_WARNING + " mt-3 px-3 py-2 text-xs"}>
                  Auto sync is enabled but source/folder is not configured.
                </div>
              ) : null}
              {attendanceCoverageBehind ? (
                <div className={BADGE_WARNING + " mt-3 px-3 py-2 text-xs"}>
                  Latest Bayzat import is through {attendanceLatestCoverage?.date_to || "-"}. Selected range includes newer dates, so attendance metrics may be incomplete.
                </div>
              ) : null}
              {attendanceSyncMessage ? (
                <div className={`${attendanceSyncMessage.includes("既に取り込み済み") ? BADGE_INFO : BADGE_SUCCESS} mt-3 px-3 py-2 text-xs`}>
                  {attendanceSyncMessage}
                </div>
              ) : null}
            </div>
            {attendanceLatestCoverageError ? (
              <div className={BADGE_WARNING + " mt-4 px-3 py-2 text-xs"}>
                {attendanceLatestCoverageError}
              </div>
            ) : null}
            {attendanceAutoSyncStatusError ? (
              <div className={BADGE_WARNING + " mt-2 px-3 py-2 text-xs"}>
                {attendanceAutoSyncStatusError}
              </div>
            ) : null}
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