"use client";

import { AlertCircle, AlertTriangle, ChevronDown, ChevronRight, Database, Download, ExternalLink, RefreshCw, Save, ShieldAlert, SquarePen, Upload, X } from "lucide-react";
import { TAB_ACTIVE, TAB_INACTIVE, TAB_CONTAINER } from "@/lib/ui-tokens";
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson, procurementTokenHeaders } from "@/lib/procurementClient";
import DatePicker from "@/components/DatePicker";

type InvoiceRow = {
  id: string;
  market: string;
  invoice_no: string;
  invoice_date: string;
  due_date: string;
  supplier_name: string;
  supplier_code: string;
  currency: string;
  invoice_amount: number;
  net_amount: number;
  vat_amount: number;
  excise_amount: number;
  other_charges: number;
  discount: number;
  po_number: string;
  delivery_date: string;
  payment_terms: string;
  prepared_by: string;
  approved_by: string;
  branch: string;
  notes: string;
  line_count: number;
  quantity_total: number;
  updated_at: string;
  created_at: string;
};

type InvoiceSummary = Partial<InvoiceRow> & {
  tin?: string;
  excise_trn?: string;
};

type InvoiceLineItem = {
  line_no: number;
  invoice_date?: string;
  branch?: string;
  supplier_name?: string;
  supplier_code?: string;
  item_description: string;
  item_code?: string;
  quantity: number | null;
  unit: string;
  unit_price: number | null;
  amount: number | null;
  tax_category?: string;
  vatable_sales?: number | null;
  vat_amount?: number | null;
  excise_amount?: number | null;
  total_incl_vat: number | null;
  currency: string;
  po_number?: string;
  notes?: string;
};

type InvoiceDetail = {
  market: string;
  invoice_no: string;
  summary: InvoiceSummary;
  line_items: InvoiceLineItem[];
};

type SyncJob = {
  id: string;
  status: string;
  error_message?: string;
  result_json?: {
    reason?: string;
    skipped?: boolean;
    invoice_summary_count?: number;
    line_item_count?: number;
    cleanup?: {
      deleted_stale_line_items?: number;
      deleted_stale_invoice_summary?: number;
      deleted_header_line_items?: number;
      deleted_header_invoice_summary?: number;
      deleted_header_suppliers?: number;
      stale_cleanup_skipped?: number;
    };
    data_quality?: {
      flagged_invoice_count?: number;
      flagged_line_count?: number;
    };
  };
};

type QualityRow = {
  id: string;
  market: string;
  invoice_no: string;
  invoice_date: string;
  supplier_name: string;
  supplier_code: string;
  currency: string;
  invoice_amount: number | null;
  line_count: number;
  blank_financial_line_count: number;
  quantity_total: number;
  updated_at: string;
  reason: string;
};

type QualitySummary = {
  flagged_invoice_count: number;
  flagged_line_count: number;
};

type ProblemReportRow = {
  priority: number;
  invoice_no: string;
  invoice_date: string;
  supplier_name: string;
  line_count: number;
  quantity_total: number;
  blank_source_cells: number;
  sample_items: string[];
  has_any_source_financial_value: boolean;
};

type ProblemSupplierSummaryRow = {
  supplier_name: string;
  invoice_count: number;
};

type ProblemReportSummary = {
  flagged_invoice_count: number;
  flagged_line_count: number;
  supplier_count: number;
};

type IntegrityAlert = {
  alert_type: string;
  severity: "critical" | "warning" | "info";
  invoice_no: string;
  supplier_name: string;
  invoice_date: string;
  detail: string;
  amount: number | null;
  currency: string;
};

type IntegrityAlertCounts = { critical: number; warning: number; info: number; total: number };

const ALERT_TYPE_META: Record<string, { label: string; description: string }> = {
  DUPLICATE_CONTENT:   { label: "Duplicate Billing",      description: "Same amount billed twice with different invoice numbers" },
  DUPLICATE_INVOICE_NO:{ label: "Orphan Invoice Data",    description: "Line items exist with no matching summary record" },
  NO_PO_NUMBER:        { label: "No PO Number",           description: "Invoices not linked to an approved purchase order" },
  FUTURE_DATE:         { label: "Future Invoice Date",    description: "Invoice date is set in the future" },
  STALE_DATE:          { label: "Old Invoice (6+ months)","description": "Invoice date is more than 6 months ago — possible late submission" },
};

type FieldConfig = {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "textarea";
  className?: string;
};

type DraftLineItem = {
  line_no: number;
  updates: Record<string, string>;
};

type ProblemDraft = {
  market: string;
  invoice_no: string;
  summary: Record<string, string>;
  line_items: DraftLineItem[];
};

type CorrectionResponse = {
  ok?: boolean;
  market?: string;
  invoice_no?: string;
  detail?: InvoiceDetail;
  still_flagged?: boolean;
  quality?: {
    line_count?: number;
    blank_financial_line_count?: number;
    is_flagged?: boolean;
  };
  sheet_result?: {
    updated_cell_count?: number;
    ignored_summary_fields?: string[];
    ignored_line_fields?: Record<string, string[]>;
  };
};

type UploadResponse = {
  ok?: boolean;
  upload?: {
    market?: string;
    invoice_date?: string;
    placement?: string;
    path?: string;
    file_name?: string;
    branch_folder_name?: string;
    web_view_link?: string;
  };
};

const SUPPLIER_SPREADSHEET_URLS: Record<"dubai" | "manila", string> = {
  dubai: "https://docs.google.com/spreadsheets/d/1w3xuCORU26MWqYk5okxA5xnyVlU291y-XA_rBCyA_YU/edit?gid=953422773#gid=953422773",
  manila: "https://docs.google.com/spreadsheets/d/1kFdSqLMtr1Clr2IT6cELXhQPlIsthtFjQ4G-lFzhreE/edit?gid=1190036959#gid=1190036959",
};

// ── Phase 2: Price alert types ───────────────────────────────────────────────
type PriceAlert = {
  alert_type: "PRICE_SPIKE" | "ALL_TIME_HIGH" | "CROSS_SUPPLIER_GAP" | "RISING_TREND";
  severity: "critical" | "warning" | "info";
  invoice_no: string;
  supplier_name: string;
  item_description: string;
  invoice_date: string;
  current_price: number;
  reference_price: number | null;
  pct_diff: number | null;
  currency: string;
  unit: string;
  detail: string;
};

type PriceAlertCounts = { critical: number; warning: number; info: number; total: number };

const PRICE_ALERT_TYPE_META: Record<string, { label: string; description: string; opportunity?: boolean }> = {
  PRICE_SPIKE:        { label: "Price Spikes",            description: "Items priced significantly above their 90-day average" },
  ALL_TIME_HIGH:      { label: "All-Time High Prices",    description: "Items at their highest recorded price" },
  CROSS_SUPPLIER_GAP: { label: "Price Opportunities",     description: "Same item purchased at different prices across suppliers — possible savings", opportunity: true },
  RISING_TREND:       { label: "Rising Price Trends",     description: "Items whose price has increased 3 months in a row" },
};

// ── Phase 3: Payment due alert types ─────────────────────────────────────────
type PaymentDueRow = {
  invoice_no: string;
  supplier_name: string;
  invoice_date: string;
  due_date: string | null;
  expected_due_date?: string | null;
  amount: number;
  currency: string;
  payment_terms: string;
  days_remaining: number | null;
  days_overdue?: number;
};

type PaymentDueData = {
  overdue: PaymentDueRow[];
  due_soon: PaymentDueRow[];
  due_week: PaymentDueRow[];
  no_due_date: PaymentDueRow[];
  counts: { overdue: number; due_soon: number; due_week: number; no_due_date: number; total: number };
  amounts: { overdue: number; due_soon: number; due_week: number };
};

const EMPTY_PAYMENT_DATA: PaymentDueData = {
  overdue: [], due_soon: [], due_week: [], no_due_date: [],
  counts: { overdue: 0, due_soon: 0, due_week: 0, no_due_date: 0, total: 0 },
  amounts: { overdue: 0, due_soon: 0, due_week: 0 },
};

// ── Phase 5: New vendor / item alert types ────────────────────────────────────
type NewSupplierAlert = {
  supplier_name: string;
  first_invoice_date: string;
  invoice_no: string;
  amount: number;
  currency: string;
};

type NewItemAlert = {
  item_description: string;
  supplier_name: string;
  first_invoice_date: string;
  unit_price: number | null;
  unit: string;
  currency: string;
};

type ReappearedSupplier = {
  supplier_name: string;
  last_seen_before: string;
  latest_invoice_date: string;
  invoice_no: string;
};

type VendorAlertData = {
  new_suppliers: NewSupplierAlert[];
  new_items: NewItemAlert[];
  reappeared_suppliers: ReappearedSupplier[];
  counts: { new_suppliers: number; new_items: number; reappeared_suppliers: number; total: number };
  week_digest: { new_suppliers_this_week: NewSupplierAlert[]; new_items_this_week: NewItemAlert[] };
};

const EMPTY_VENDOR_DATA: VendorAlertData = {
  new_suppliers: [],
  new_items: [],
  reappeared_suppliers: [],
  counts: { new_suppliers: 0, new_items: 0, reappeared_suppliers: 0, total: 0 },
  week_digest: { new_suppliers_this_week: [], new_items_this_week: [] },
};

const DUBAI_BRANCH_OPTIONS = ["Al Barsha", "Al Mina", "B Bay", "JLT", "M City"];
const UNKNOWN_BRANCH_OPTION = "branch name unknown";

const SUMMARY_EDIT_FIELDS: FieldConfig[] = [
  { key: "invoice_date", label: "Invoice Date", type: "date" },
  { key: "due_date", label: "Due Date", type: "date" },
  { key: "supplier_name", label: "Supplier Name", type: "text" },
  { key: "supplier_code", label: "Supplier Code", type: "text" },
  { key: "tin", label: "TIN / TRN", type: "text" },
  { key: "excise_trn", label: "Excise TRN", type: "text" },
  { key: "payment_terms", label: "Payment Terms", type: "text" },
  { key: "currency", label: "Currency", type: "text" },
  { key: "net_amount", label: "Net Amount", type: "number" },
  { key: "vat_amount", label: "VAT Amount", type: "number" },
  { key: "excise_amount", label: "Excise Amount", type: "number" },
  { key: "other_charges", label: "Other Charges", type: "number" },
  { key: "discount", label: "Discount", type: "number" },
  { key: "grand_total", label: "Grand Total", type: "number" },
  { key: "po_number", label: "PO Number", type: "text" },
  { key: "delivery_date", label: "Delivery Date", type: "date" },
  { key: "prepared_by", label: "Prepared By", type: "text" },
  { key: "approved_by", label: "Approved By", type: "text" },
  { key: "notes", label: "Notes", type: "textarea", className: "md:col-span-2 xl:col-span-4" },
];

const LINE_EDIT_FIELDS: FieldConfig[] = [
  { key: "invoice_date", label: "Invoice Date", type: "date" },
  { key: "branch", label: "Branch", type: "text" },
  { key: "supplier_name", label: "Supplier", type: "text" },
  { key: "supplier_code", label: "Supplier Code", type: "text" },
  { key: "item_description", label: "Item Description", type: "text" },
  { key: "item_code", label: "Item Code", type: "text" },
  { key: "quantity", label: "Qty", type: "number" },
  { key: "unit", label: "Unit", type: "text" },
  { key: "unit_price", label: "Unit Price", type: "number" },
  { key: "amount", label: "Amount", type: "number" },
  { key: "vatable_sales", label: "Vatable Sales", type: "number" },
  { key: "vat_amount", label: "VAT", type: "number" },
  { key: "excise_amount", label: "Excise", type: "number" },
  { key: "total_incl_vat", label: "Total Incl. VAT", type: "number" },
  { key: "tax_category", label: "Tax Category", type: "text" },
  { key: "currency", label: "Currency", type: "text" },
  { key: "po_number", label: "PO Number", type: "text" },
  { key: "notes", label: "Notes", type: "text" },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDate(value: string | null | undefined): string {
  return value ? String(value).slice(0, 10) : "-";
}

function formatDateTime(value: string): string {
  return value ? String(value).slice(0, 16).replace("T", " ") : "-";
}

function formatMoney(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined) return "-";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  return `${currency || "PHP"} ${amount.toFixed(2)}`;
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function toDraftValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (key.endsWith("_date") || key === "invoice_date") return String(value).slice(0, 10);
  return String(value);
}

function buildProblemDraft(detail: InvoiceDetail): ProblemDraft {
  return {
    market: String(detail.market || ""),
    invoice_no: String(detail.invoice_no || ""),
    summary: Object.fromEntries(SUMMARY_EDIT_FIELDS.map((field) => [field.key, toDraftValue(field.key, detail.summary?.[field.key as keyof InvoiceSummary])])),
    line_items: (detail.line_items || []).map((line) => ({
      line_no: Number(line.line_no || 0),
      updates: Object.fromEntries(LINE_EDIT_FIELDS.map((field) => [field.key, toDraftValue(field.key, line[field.key as keyof InvoiceLineItem])])),
    })),
  };
}

function countIgnoredLineFields(value: Record<string, string[]> | undefined): number {
  return Object.values(value || {}).reduce((sum, items) => sum + (Array.isArray(items) ? items.length : 0), 0);
}

export default function ProcurementInvoicesPage() {
  const defaultAuth = getAuth();
  const defaultCity: "dubai" | "manila" = String(defaultAuth?.city || "").toLowerCase() === "dubai" ? "dubai" : "manila";
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [allowed, setAllowed] = useState(false);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [city, setCity] = useState<"dubai" | "manila">(defaultCity);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [qualityRows, setQualityRows] = useState<QualityRow[]>([]);
  const [qualitySummary, setQualitySummary] = useState<QualitySummary>({ flagged_invoice_count: 0, flagged_line_count: 0 });
  const [problemReportRows, setProblemReportRows] = useState<ProblemReportRow[]>([]);
  const [problemSupplierSummary, setProblemSupplierSummary] = useState<ProblemSupplierSummaryRow[]>([]);
  const [problemReportSummary, setProblemReportSummary] = useState<ProblemReportSummary>({ flagged_invoice_count: 0, flagged_line_count: 0, supplier_count: 0 });
  const [detailsByInvoiceNo, setDetailsByInvoiceNo] = useState<Record<string, InvoiceDetail>>({});
  const [expandedInvoiceNo, setExpandedInvoiceNo] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"valid" | "problems">("valid");
  const [selectedProblemInvoiceNo, setSelectedProblemInvoiceNo] = useState<string | null>(null);
  const [problemDraft, setProblemDraft] = useState<ProblemDraft | null>(null);
  const [problemBaseDraft, setProblemBaseDraft] = useState<ProblemDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [detailBusy, setDetailBusy] = useState("");
  const [problemBusy, setProblemBusy] = useState("");
  const [problemSaveBusy, setProblemSaveBusy] = useState(false);
  const [branchOptions, setBranchOptions] = useState<string[]>([UNKNOWN_BRANCH_OPTION]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadInvoiceDate, setUploadInvoiceDate] = useState("");
  const [uploadBranchName, setUploadBranchName] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [integrityAlerts, setIntegrityAlerts] = useState<IntegrityAlert[]>([]);
  const [integrityAlertCounts, setIntegrityAlertCounts] = useState<IntegrityAlertCounts>({ critical: 0, warning: 0, info: 0, total: 0 });
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([]);
  const [priceAlertCounts, setPriceAlertCounts] = useState<PriceAlertCounts>({ critical: 0, warning: 0, info: 0, total: 0 });
  const [paymentData, setPaymentData] = useState<PaymentDueData>(EMPTY_PAYMENT_DATA);
  const [paymentTrackerOpen, setPaymentTrackerOpen] = useState(false);
  const [paymentBucketOpen, setPaymentBucketOpen] = useState<Record<string, boolean>>({});
  const [vendorAlertData, setVendorAlertData] = useState<VendorAlertData>(EMPTY_VENDOR_DATA);
  const [alertBannerOpen, setAlertBannerOpen] = useState(true);
  const [alertSectionOpen, setAlertSectionOpen] = useState<Record<string, boolean>>({});
  const [expandedAlertKeys, setExpandedAlertKeys] = useState<Record<string, boolean>>({});
  const [alertComments, setAlertComments] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("procAlertComments") || "{}"); } catch { return {}; }
  });
  const saveAlertComment = useCallback((key: string, text: string) => {
    setAlertComments((prev) => {
      const next = { ...prev, [key]: text };
      try { localStorage.setItem("procAlertComments", JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);
  const detailKeyFor = useCallback((market: string, value: string) => `${market}:${value}`, []);
  const normalizedBranchOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const value of [...branchOptions, UNKNOWN_BRANCH_OPTION]) {
      const text = String(value || "").trim();
      if (!text || text.toUpperCase() === "ALL") continue;
      unique.add(text);
    }
    return Array.from(unique);
  }, [branchOptions]);

  const resetUploadDraft = useCallback(() => {
    setUploadFile(null);
    setUploadInvoiceDate("");
    setUploadBranchName("");
    if (uploadInputRef.current) {
      uploadInputRef.current.value = "";
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const invoiceQs = new URLSearchParams();
      invoiceQs.set("city", city);
      invoiceQs.set("limit", "1000");
      if (invoiceNo.trim()) invoiceQs.set("invoice_no", invoiceNo.trim());
      if (vendorName.trim()) invoiceQs.set("vendor_name", vendorName.trim());
      if (dateFrom) invoiceQs.set("date_from", dateFrom);
      if (dateTo) invoiceQs.set("date_to", dateTo);

      const qualityQs = new URLSearchParams();
      qualityQs.set("market", city);
      qualityQs.set("limit", "500");
      if (invoiceNo.trim()) qualityQs.set("invoice_no", invoiceNo.trim());
      if (vendorName.trim()) qualityQs.set("supplier_name", vendorName.trim());
      if (dateFrom) qualityQs.set("date_from", dateFrom);
      if (dateTo) qualityQs.set("date_to", dateTo);

      const alertQs = new URLSearchParams();
      alertQs.set("market", city);
      if (dateFrom) alertQs.set("date_from", dateFrom);
      if (dateTo) alertQs.set("date_to", dateTo);

      const priceQs = new URLSearchParams();
      priceQs.set("market", city);
      if (dateFrom) priceQs.set("date_from", dateFrom);
      if (dateTo) priceQs.set("date_to", dateTo);

      const paymentQs = new URLSearchParams();
      paymentQs.set("market", city);

      const vendorQs = new URLSearchParams();
      vendorQs.set("market", city);

      const [data, qualityData, reportData, alertData, priceAlertData, paymentAlertData, vendorAlertRaw] = await Promise.all([
        procurementJson<{ rows?: InvoiceRow[] }>(
          `/api/admin/procurement/invoices?${invoiceQs.toString()}`,
          { method: "GET" },
          requestedBy,
          pin,
        ),
        procurementJson<{ rows?: QualityRow[]; summary?: Partial<QualitySummary> }>(
          `/api/admin/procurement/analytics/supplier-invoices/data-quality?${qualityQs.toString()}`,
          { method: "GET" },
          requestedBy,
          pin,
        ),
        procurementJson<{
          rows?: ProblemReportRow[];
          supplier_summary?: ProblemSupplierSummaryRow[];
          summary?: Partial<ProblemReportSummary>;
        }>(
          `/api/admin/procurement/analytics/supplier-invoices/problem-report?${qualityQs.toString()}`,
          { method: "GET" },
          requestedBy,
          pin,
        ),
        procurementJson<{ alerts?: IntegrityAlert[]; counts?: IntegrityAlertCounts; total?: number }>(
          `/api/admin/procurement/analytics/supplier-invoices/integrity-alerts?${alertQs.toString()}`,
          { method: "GET" },
          requestedBy,
          pin,
        ).catch(() => ({ alerts: [] as IntegrityAlert[], counts: undefined, total: 0 })),
        procurementJson<{ alerts?: PriceAlert[]; counts?: PriceAlertCounts; total?: number }>(
          `/api/admin/procurement/analytics/supplier-invoices/price-alerts?${priceQs.toString()}`,
          { method: "GET" },
          requestedBy,
          pin,
        ).catch(() => ({ alerts: [] as PriceAlert[], counts: undefined, total: 0 })),
        procurementJson<Partial<PaymentDueData> & { ok?: boolean }>(
          `/api/admin/procurement/analytics/supplier-invoices/payment-alerts?${paymentQs.toString()}`,
          { method: "GET" },
          requestedBy,
          pin,
        ).catch(() => ({ ...EMPTY_PAYMENT_DATA })),
        procurementJson<Partial<VendorAlertData> & { ok?: boolean }>(
          `/api/admin/procurement/analytics/supplier-invoices/new-vendor-alerts?${vendorQs.toString()}`,
          { method: "GET" },
          requestedBy,
          pin,
        ).catch(() => ({ ...EMPTY_VENDOR_DATA })),
      ]);
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setQualityRows(Array.isArray(qualityData?.rows) ? qualityData.rows : []);
      setQualitySummary({
        flagged_invoice_count: Number(qualityData?.summary?.flagged_invoice_count || 0),
        flagged_line_count: Number(qualityData?.summary?.flagged_line_count || 0),
      });
      setProblemReportRows(Array.isArray(reportData?.rows) ? reportData.rows : []);
      setProblemSupplierSummary(Array.isArray(reportData?.supplier_summary) ? reportData.supplier_summary : []);
      setProblemReportSummary({
        flagged_invoice_count: Number(reportData?.summary?.flagged_invoice_count || 0),
        flagged_line_count: Number(reportData?.summary?.flagged_line_count || 0),
        supplier_count: Number(reportData?.summary?.supplier_count || 0),
      });
      setIntegrityAlerts(Array.isArray(alertData?.alerts) ? alertData.alerts : []);
      setIntegrityAlertCounts({
        critical: Number(alertData?.counts?.critical || 0),
        warning: Number(alertData?.counts?.warning || 0),
        info: Number(alertData?.counts?.info || 0),
        total: Number(alertData?.total || 0),
      });
      setPriceAlerts(Array.isArray(priceAlertData?.alerts) ? priceAlertData.alerts : []);
      setPriceAlertCounts({
        critical: Number(priceAlertData?.counts?.critical || 0),
        warning: Number(priceAlertData?.counts?.warning || 0),
        info: Number(priceAlertData?.counts?.info || 0),
        total: Number(priceAlertData?.total || 0),
      });
      setPaymentData({
        overdue:     Array.isArray(paymentAlertData?.overdue)     ? paymentAlertData.overdue     : [],
        due_soon:    Array.isArray(paymentAlertData?.due_soon)    ? paymentAlertData.due_soon    : [],
        due_week:    Array.isArray(paymentAlertData?.due_week)    ? paymentAlertData.due_week    : [],
        no_due_date: Array.isArray(paymentAlertData?.no_due_date) ? paymentAlertData.no_due_date : [],
        counts: {
          overdue:     Number(paymentAlertData?.counts?.overdue     || 0),
          due_soon:    Number(paymentAlertData?.counts?.due_soon    || 0),
          due_week:    Number(paymentAlertData?.counts?.due_week    || 0),
          no_due_date: Number(paymentAlertData?.counts?.no_due_date || 0),
          total:       Number(paymentAlertData?.counts?.total       || 0),
        },
        amounts: {
          overdue:  Number(paymentAlertData?.amounts?.overdue  || 0),
          due_soon: Number(paymentAlertData?.amounts?.due_soon || 0),
          due_week: Number(paymentAlertData?.amounts?.due_week || 0),
        },
      });
      setVendorAlertData({
        new_suppliers:       Array.isArray(vendorAlertRaw?.new_suppliers)       ? (vendorAlertRaw.new_suppliers as NewSupplierAlert[])       : [],
        new_items:           Array.isArray(vendorAlertRaw?.new_items)           ? (vendorAlertRaw.new_items as NewItemAlert[])               : [],
        reappeared_suppliers:Array.isArray(vendorAlertRaw?.reappeared_suppliers)? (vendorAlertRaw.reappeared_suppliers as ReappearedSupplier[]): [],
        counts: {
          new_suppliers:        Number(vendorAlertRaw?.counts?.new_suppliers        || 0),
          new_items:            Number(vendorAlertRaw?.counts?.new_items            || 0),
          reappeared_suppliers: Number(vendorAlertRaw?.counts?.reappeared_suppliers || 0),
          total:                Number(vendorAlertRaw?.counts?.total                || 0),
        },
        week_digest: {
          new_suppliers_this_week: Array.isArray(vendorAlertRaw?.week_digest?.new_suppliers_this_week) ? (vendorAlertRaw.week_digest.new_suppliers_this_week as NewSupplierAlert[]) : [],
          new_items_this_week:     Array.isArray(vendorAlertRaw?.week_digest?.new_items_this_week)     ? (vendorAlertRaw.week_digest.new_items_this_week     as NewItemAlert[])     : [],
        },
      });
    } catch (e: any) {
      setRows([]);
      setQualityRows([]);
      setQualitySummary({ flagged_invoice_count: 0, flagged_line_count: 0 });
      setProblemReportRows([]);
      setProblemSupplierSummary([]);
      setProblemReportSummary({ flagged_invoice_count: 0, flagged_line_count: 0, supplier_count: 0 });
      setIntegrityAlerts([]);
      setIntegrityAlertCounts({ critical: 0, warning: 0, info: 0, total: 0 });
      setPriceAlerts([]);
      setPriceAlertCounts({ critical: 0, warning: 0, info: 0, total: 0 });
      setPaymentData(EMPTY_PAYMENT_DATA);
      setVendorAlertData(EMPTY_VENDOR_DATA);
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [city, dateFrom, dateTo, invoiceNo, pin, requestedBy, vendorName]);

  const loadBranchOptions = useCallback(async () => {
    try {
      if (city === "dubai") {
        setBranchOptions([...DUBAI_BRANCH_OPTIONS, UNKNOWN_BRANCH_OPTION]);
        setUploadBranchName((current) => (current && [...DUBAI_BRANCH_OPTIONS, UNKNOWN_BRANCH_OPTION].includes(current) ? current : ""));
        return;
      }
      const qs = new URLSearchParams({
        city,
        limit: "300",
      });
      const data = await procurementJson<{ stores?: string[] }>(
        `/api/admin/procurement/requests/catalog-stores?${qs.toString()}`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      const stores = Array.isArray(data?.stores)
        ? data.stores
            .map((value) => String(value || "").trim())
            .filter((value) => value && value.toUpperCase() !== "ALL")
        : [];
      const nextOptions = Array.from(new Set([...stores, UNKNOWN_BRANCH_OPTION]));
      setBranchOptions(nextOptions.length ? nextOptions : [UNKNOWN_BRANCH_OPTION]);
      setUploadBranchName((current) => (current && nextOptions.includes(current) ? current : ""));
    } catch (e: any) {
      setBranchOptions([UNKNOWN_BRANCH_OPTION]);
      setUploadBranchName((current) => (current === UNKNOWN_BRANCH_OPTION ? current : ""));
      setError(e?.message || String(e));
    }
  }, [city, pin, requestedBy]);

  const openUploadPicker = useCallback(() => {
    setError("");
    setNotice("");
    uploadInputRef.current?.click();
  }, []);

  const handleUploadFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] || null;
    setUploadFile(nextFile);
    setError("");
    setNotice("");
  }, []);

  const submitDriveUpload = useCallback(async () => {
    if (!uploadFile) {
      setError("Please choose an invoice file.");
      return;
    }
    if (!uploadInvoiceDate) {
      setError("Invoice date is required.");
      return;
    }
    if (!uploadBranchName.trim()) {
      setError("Branch name is required.");
      return;
    }
    setUploadBusy(true);
    setError("");
    setNotice("");
    try {
      const headers = await procurementTokenHeaders(requestedBy, pin);
      const formData = new FormData();
      formData.set("market", city);
      formData.set("approver_name", requestedBy.trim());
      formData.set("pin", pin.trim());
      formData.set("invoice_date", uploadInvoiceDate);
      formData.set("branch_name", uploadBranchName.trim());
      formData.set("file", uploadFile);
      const res = await fetch("/api/admin/procurement/analytics/supplier-invoices/upload-drive", {
        method: "POST",
        headers,
        body: formData,
        cache: "no-store",
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(text || `Upload failed (${res.status})`);
      }
      const data = JSON.parse(text || "{}") as UploadResponse;
      const path = String(data?.upload?.path || "").trim();
      const placement = String(data?.upload?.placement || "branch");
      setNotice(
        placement === "exception"
          ? `Invoice uploaded to Exception folder: ${path || String(data?.upload?.file_name || uploadFile.name)}`
          : `Invoice uploaded to Drive: ${path || String(data?.upload?.file_name || uploadFile.name)}`,
      );
      resetUploadDraft();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setUploadBusy(false);
    }
  }, [city, pin, requestedBy, resetUploadDraft, uploadBranchName, uploadFile, uploadInvoiceDate]);

  const syncSpreadsheet = useCallback(async () => {
    setSyncBusy(true);
    setNotice("");
    setError("");
    try {
      const data = await procurementJson<{ job?: { id?: string } }>(
        "/api/admin/procurement/analytics/supplier-invoices/sync",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            market: city,
            approver_name: requestedBy,
            pin,
          }),
        },
        requestedBy,
        pin,
      );
      const jobId = String(data?.job?.id || "").trim();
      if (!jobId) {
        throw new Error("Sync job ID was not returned.");
      }
      setNotice(`Spreadsheet sync started for ${city}. Waiting for completion...`);
      let completedJob: SyncJob | null = null;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await sleep(2000);
        const jobResp = await procurementJson<{ job?: SyncJob }>(
          `/api/admin/procurement/analytics/supplier-invoices/sync-jobs/${encodeURIComponent(jobId)}`,
          { method: "GET" },
          requestedBy,
          pin,
        );
        const job = jobResp?.job || null;
        const status = String(job?.status || "").toUpperCase();
        if (status && !["QUEUED", "RUNNING"].includes(status)) {
          completedJob = job;
          break;
        }
      }
      if (!completedJob) {
        throw new Error("Sync is still running. Please refresh in a moment.");
      }
      const finalStatus = String(completedJob.status || "").toUpperCase();
      if (!["COMPLETED", "COMPLETED_WITH_WARNINGS"].includes(finalStatus)) {
        throw new Error(
          completedJob.error_message ||
            completedJob.result_json?.reason ||
            `Sync failed with status ${finalStatus || "UNKNOWN"}.`,
        );
      }
      const cleanup = completedJob.result_json?.cleanup || {};
      const quality = completedJob.result_json?.data_quality || {};
      setNotice(
        completedJob.result_json?.skipped
          ? `Spreadsheet sync finished: ${completedJob.result_json?.reason || "no new changes"}`
          : `Spreadsheet sync finished. Invoices: ${Number(completedJob.result_json?.invoice_summary_count || 0)} / Lines: ${Number(completedJob.result_json?.line_item_count || 0)} / Cleaned rows: ${Number(cleanup.deleted_stale_line_items || 0) + Number(cleanup.deleted_stale_invoice_summary || 0) + Number(cleanup.deleted_header_line_items || 0) + Number(cleanup.deleted_header_invoice_summary || 0)} / Flagged invoices: ${Number(quality.flagged_invoice_count || 0)}`,
      );
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSyncBusy(false);
    }
  }, [city, load, pin, requestedBy]);

  const loadInvoiceDetail = useCallback(async (invoiceToken: string) => {
    const detailKey = detailKeyFor(city, invoiceToken);
    if (detailsByInvoiceNo[detailKey]) return detailsByInvoiceNo[detailKey];
    const data = await procurementJson<InvoiceDetail & { ok?: boolean }>(
      `/api/admin/procurement/analytics/supplier-invoices/invoice-detail?invoice_no=${encodeURIComponent(invoiceToken)}&market=${encodeURIComponent(city)}`,
      { method: "GET" },
      requestedBy,
      pin,
    );
    const detail: InvoiceDetail = {
      market: String(data?.market || city),
      invoice_no: String(data?.invoice_no || invoiceToken),
      summary: (data?.summary || {}) as InvoiceSummary,
      line_items: Array.isArray(data?.line_items) ? data.line_items : [],
    };
    setDetailsByInvoiceNo((prev) => ({ ...prev, [detailKey]: detail }));
    return detail;
  }, [city, detailKeyFor, detailsByInvoiceNo, pin, requestedBy]);

  const toggleDetail = useCallback(async (row: InvoiceRow) => {
    const nextInvoiceNo = row.invoice_no;
    if (expandedInvoiceNo === nextInvoiceNo) {
      setExpandedInvoiceNo(null);
      return;
    }
    setExpandedInvoiceNo(nextInvoiceNo);
    setDetailBusy(nextInvoiceNo);
    try {
      await loadInvoiceDetail(nextInvoiceNo);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setDetailBusy("");
    }
  }, [expandedInvoiceNo, loadInvoiceDetail]);

  const openProblemEditor = useCallback(async (row: QualityRow) => {
    setProblemBusy(row.invoice_no);
    setError("");
    try {
      const detail = await loadInvoiceDetail(row.invoice_no);
      const nextDraft = buildProblemDraft(detail);
      setSelectedProblemInvoiceNo(row.invoice_no);
      setProblemDraft(nextDraft);
      setProblemBaseDraft(nextDraft);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setProblemBusy("");
    }
  }, [loadInvoiceDetail]);

  const exportQualityCsv = useCallback(() => {
    if (!qualityRows.length) return;
    const headers = [
      "market",
      "invoice_no",
      "invoice_date",
      "supplier_name",
      "supplier_code",
      "currency",
      "invoice_amount",
      "line_count",
      "blank_financial_line_count",
      "quantity_total",
      "updated_at",
      "reason",
    ];
    const lines = [headers.map(csvCell).join(",")];
    for (const row of qualityRows) {
      lines.push(
        [
          row.market,
          row.invoice_no,
          row.invoice_date,
          row.supplier_name,
          row.supplier_code,
          row.currency,
          row.invoice_amount ?? "",
          row.line_count,
          row.blank_financial_line_count,
          row.quantity_total,
          row.updated_at,
          row.reason,
        ].map(csvCell).join(","),
      );
    }
    const csvText = `\uFEFF${lines.join("\n")}`;
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `supplier_invoice_data_quality_${city}_${dateFrom || "all"}_${dateTo || "all"}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [city, dateFrom, dateTo, qualityRows]);

  const updateProblemSummaryField = useCallback((field: string, value: string) => {
    setProblemDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        summary: {
          ...prev.summary,
          [field]: value,
        },
      };
    });
  }, []);

  const updateProblemLineField = useCallback((lineNo: number, field: string, value: string) => {
    setProblemDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        line_items: prev.line_items.map((line) => (
          line.line_no === lineNo
            ? {
                ...line,
                updates: {
                  ...line.updates,
                  [field]: value,
                },
              }
            : line
        )),
      };
    });
  }, []);

  const saveProblemEdits = useCallback(async () => {
    if (!problemDraft) return;
    setProblemSaveBusy(true);
    setNotice("");
    setError("");
    try {
      const data = await procurementJson<CorrectionResponse>(
        "/api/admin/procurement/analytics/supplier-invoices/correct",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            market: city,
            approver_name: requestedBy,
            pin,
            invoice_no: problemDraft.invoice_no,
            summary: problemDraft.summary,
            line_items: problemDraft.line_items.map((line) => ({
              line_no: line.line_no,
              updates: line.updates,
            })),
          }),
        },
        requestedBy,
        pin,
      );
      const nextDetail = data?.detail;
      if (nextDetail) {
        const detailKey = detailKeyFor(city, problemDraft.invoice_no);
        setDetailsByInvoiceNo((prev) => ({ ...prev, [detailKey]: nextDetail }));
        const nextDraft = buildProblemDraft(nextDetail);
        setProblemDraft(nextDraft);
        setProblemBaseDraft(nextDraft);
      }
      const ignoredSummaryCount = Array.isArray(data?.sheet_result?.ignored_summary_fields) ? data.sheet_result?.ignored_summary_fields.length : 0;
      const ignoredLineCount = countIgnoredLineFields(data?.sheet_result?.ignored_line_fields);
      const ignoredText = ignoredSummaryCount || ignoredLineCount
        ? ` Ignored source-only unsupported fields: ${ignoredSummaryCount + ignoredLineCount}.`
        : "";
      await load();
      if (data?.still_flagged) {
        setNotice(`Invoice ${problemDraft.invoice_no} saved, but it is still flagged in Problem Data.${ignoredText}`);
      } else {
        setActiveTab("valid");
        setSelectedProblemInvoiceNo(null);
        setExpandedInvoiceNo(problemDraft.invoice_no);
        setNotice(`Invoice ${problemDraft.invoice_no} corrected and moved to Valid Data.${ignoredText}`);
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setProblemSaveBusy(false);
    }
  }, [city, detailKeyFor, load, pin, problemDraft, requestedBy]);

  useEffect(() => {
    setExpandedInvoiceNo(null);
    setDetailsByInvoiceNo({});
    setSelectedProblemInvoiceNo(null);
    setProblemDraft(null);
    setProblemBaseDraft(null);
  }, [city, dateFrom, dateTo, invoiceNo, vendorName]);

  useEffect(() => {
    resetUploadDraft();
    setBranchOptions([UNKNOWN_BRANCH_OPTION]);
  }, [city, resetUploadDraft]);

  useEffect(() => {
    async function init() {
      const currentAuth = getAuth();
      const refreshed = await refreshAuthFromApi(currentAuth);
      const nextCity: "dubai" | "manila" = String((refreshed || currentAuth)?.city || "").toLowerCase() === "dubai" ? "dubai" : "manila";
      const can = canAccessProcurementAdmin(
        String((refreshed || currentAuth)?.role || ""),
        nextCity,
      );
      setAllowed(can);
      if (can) {
        setCity(nextCity);
      }
    }
    void init();
  }, []);

  useEffect(() => {
    if (!allowed) return;
    void load();
  }, [allowed, load]);

  useEffect(() => {
    if (!allowed) return;
    void loadBranchOptions();
  }, [allowed, loadBranchOptions]);

  const validRows = useMemo(() => {
    const flagged = new Set(qualityRows.map((row) => `${row.market}:${row.invoice_no}`));
    return rows.filter((row) => !flagged.has(`${row.market}:${row.invoice_no}`));
  }, [qualityRows, rows]);

  const validSummary = useMemo(() => {
    const totalAmount = validRows.reduce((sum, row) => sum + Number(row.invoice_amount || 0), 0);
    const totalLines = validRows.reduce((sum, row) => sum + Number(row.line_count || 0), 0);
    return {
      invoiceCount: validRows.length,
      totalAmount,
      totalLines,
    };
  }, [validRows]);

  const problemDirty = useMemo(() => {
    if (!problemDraft || !problemBaseDraft) return false;
    return JSON.stringify(problemDraft) !== JSON.stringify(problemBaseDraft);
  }, [problemBaseDraft, problemDraft]);

  // Set of invoice_nos that have a price spike (critical or warning) for row badges
  const spikeInvoiceNos = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    for (const a of priceAlerts) {
      if ((a.alert_type === "PRICE_SPIKE" || a.alert_type === "ALL_TIME_HIGH") && a.invoice_no) {
        set.add(a.invoice_no);
      }
    }
    return set;
  }, [priceAlerts]);

  // Set of supplier_names that are new (for row badges)
  const newSupplierNames = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    for (const s of vendorAlertData.new_suppliers) {
      if (s.supplier_name) set.add(s.supplier_name);
    }
    return set;
  }, [vendorAlertData.new_suppliers]);

  if (!allowed) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Invoice Hub is only available to authorized procurement admin roles.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <div className="rounded-2xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-900/50 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">{notice}</div> : null}

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-2xl border border-violet-500/20 bg-violet-500/10 text-violet-200">
                  <Database className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xl font-semibold tracking-tight text-white">Supplier Invoice Hub</div>
                  <div className="mt-1 text-sm text-zinc-400">Spreadsheet-backed invoice sync, quality review, and correction for Dubai and Manila.</div>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <span className="rounded-full border border-white/10 bg-white/6/80 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                Source Tabs
              </span>
              <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-200">
                line_items
              </span>
              <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-200">
                invoice_summary
              </span>
              <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-200">
                supplier_master
              </span>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/6/80 p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
            <div className="flex flex-wrap items-end gap-3 xl:flex-nowrap">
              <div className="min-w-[168px] flex-1 xl:w-52 xl:flex-none">
                <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Approver</div>
                <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Approver name" className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none transition focus:border-violet-500/50 focus:bg-white/5/90" />
              </div>
              <div className="min-w-[132px] xl:w-36 xl:flex-none">
                <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">PIN</div>
                <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none transition focus:border-violet-500/50 focus:bg-white/5/90" />
              </div>
              <div className="min-w-[124px] xl:w-32 xl:flex-none">
                <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Market</div>
                <select value={city} onChange={(e) => setCity(e.target.value === "dubai" ? "dubai" : "manila")} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none transition focus:border-violet-500/50 focus:bg-white/5/90">
                  <option value="manila">Manila</option>
                  <option value="dubai">Dubai</option>
                </select>
              </div>
              <div className="flex flex-wrap gap-2 xl:ml-2 xl:justify-end">
                <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-w-[110px] items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm hover:bg-white/5 disabled:opacity-60">
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                  Refresh
                </button>
                <a
                  href={SUPPLIER_SPREADSHEET_URLS[city]}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-w-[124px] items-center justify-center gap-2 rounded-xl border border-sky-700/60 bg-sky-900/20 px-3 py-2 text-sm text-sky-200 hover:bg-sky-800/30"
                >
                  <ExternalLink className="h-4 w-4" />
                  Spreadsheet
                </a>
                <button
                  type="button"
                  onClick={openUploadPicker}
                  disabled={uploadBusy}
                  className="inline-flex min-w-[132px] items-center justify-center gap-2 rounded-xl border border-amber-700/60 bg-amber-900/20 px-3 py-2 text-sm text-amber-100 hover:bg-amber-800/30 disabled:opacity-60"
                >
                  <Upload className="h-4 w-4" />
                  {uploadBusy ? "Uploading..." : "Upload Invoice"}
                </button>
                <button type="button" onClick={() => void syncSpreadsheet()} disabled={syncBusy} className="inline-flex min-w-[142px] items-center justify-center gap-2 rounded-xl border border-emerald-700/60 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-800/30 disabled:opacity-60">
                  <RefreshCw className={`h-4 w-4 ${syncBusy ? "animate-spin" : ""}`} />
                  {syncBusy ? "Syncing..." : "Sync Spreadsheet"}
                </button>
              </div>
            </div>
            <input
              ref={uploadInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv"
              className="hidden"
              onChange={handleUploadFileChange}
            />
            {uploadFile ? (
              <div className="mt-3 rounded-2xl border border-amber-700/30 bg-amber-950/20 p-3">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Selected File</div>
                    <div className="rounded-xl border border-white/10 bg-white/6 px-3 py-2.5 text-sm text-white">
                      {uploadFile.name}
                    </div>
                  </div>
                  <div className="min-w-[160px] xl:w-44 xl:flex-none">
                    <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Invoice Date</div>
                    <DatePicker value={uploadInvoiceDate} onChange={setUploadInvoiceDate} />
                  </div>
                  <div className="min-w-[180px] xl:w-52 xl:flex-none">
                    <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Branch Name</div>
                    <select
                      value={uploadBranchName}
                      onChange={(e) => setUploadBranchName(String(e.target.value || ""))}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none transition focus:border-amber-500/50 focus:bg-white/5/90"
                    >
                      <option value="">Select branch</option>
                      {normalizedBranchOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-2 xl:justify-end">
                    <button
                      type="button"
                      onClick={resetUploadDraft}
                      disabled={uploadBusy}
                      className="inline-flex min-w-[96px] items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5 disabled:opacity-60"
                    >
                      <X className="h-4 w-4" />
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void submitDriveUpload()}
                      disabled={uploadBusy || !uploadInvoiceDate || !uploadBranchName.trim()}
                      className="inline-flex min-w-[110px] items-center justify-center gap-2 rounded-xl border border-amber-700/60 bg-amber-900/30 px-3 py-2 text-sm font-medium text-amber-50 hover:bg-amber-800/40 disabled:opacity-60"
                    >
                      <Upload className="h-4 w-4" />
                      {uploadBusy ? "Uploading..." : "Upload"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 md:grid-cols-4">
        <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="Invoice no" className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm" />
        <input value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="Vendor name" className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm" />
        <DatePicker value={dateFrom} onChange={setDateFrom} />
        <DatePicker value={dateTo} onChange={setDateTo} />
      </div>

      {/* ── Payment Tracker ──────────────────────────────────────────────── */}
      {(() => {
        const { counts, amounts } = paymentData;
        const hasSomething = counts.overdue > 0 || counts.due_soon > 0 || counts.due_week > 0 || counts.no_due_date > 0;
        if (!hasSomething) return null;
        const currency = city === "dubai" ? "AED" : "PHP";
        const buckets = [
          {
            key: "overdue",
            label: "Overdue",
            count: counts.overdue,
            amount: amounts.overdue,
            rows: paymentData.overdue,
            color: { border: "border-rose-700/50", bg: "bg-rose-900/15", badge: "border-rose-700/60 bg-rose-900/30 text-rose-300", header: "text-rose-300", amt: "text-rose-400" },
            dayLabel: (r: PaymentDueRow) => r.days_overdue !== undefined ? `${r.days_overdue}d overdue` : "",
            dayColor: "text-rose-400",
          },
          {
            key: "due_soon",
            label: "Due within 3 days",
            count: counts.due_soon,
            amount: amounts.due_soon,
            rows: paymentData.due_soon,
            color: { border: "border-orange-700/50", bg: "bg-orange-900/15", badge: "border-orange-700/60 bg-orange-900/30 text-orange-300", header: "text-orange-300", amt: "text-orange-400" },
            dayLabel: (r: PaymentDueRow) => r.days_remaining !== null && r.days_remaining !== undefined ? (r.days_remaining === 0 ? "today" : `${r.days_remaining}d left`) : "",
            dayColor: "text-orange-400",
          },
          {
            key: "due_week",
            label: "Due this week",
            count: counts.due_week,
            amount: amounts.due_week,
            rows: paymentData.due_week,
            color: { border: "border-amber-700/50", bg: "bg-amber-900/15", badge: "border-amber-700/60 bg-amber-900/30 text-amber-300", header: "text-amber-300", amt: "text-amber-400" },
            dayLabel: (r: PaymentDueRow) => r.days_remaining !== null && r.days_remaining !== undefined ? `${r.days_remaining}d left` : "",
            dayColor: "text-amber-400",
          },
          {
            key: "no_due_date",
            label: "No due date set",
            count: counts.no_due_date,
            amount: 0,
            rows: paymentData.no_due_date,
            color: { border: "border-sky-700/50", bg: "bg-sky-900/15", badge: "border-sky-700/60 bg-sky-900/30 text-sky-300", header: "text-sky-300", amt: "text-sky-400" },
            dayLabel: (r: PaymentDueRow) => r.expected_due_date ? `est. ${r.expected_due_date}` : "",
            dayColor: "text-sky-500",
          },
        ].filter((b) => b.count > 0);

        return (
          <div className={`rounded-2xl border ${counts.overdue > 0 ? "border-rose-700/40 bg-rose-900/8" : "border-amber-700/30 bg-amber-900/8"}`}>
            <button
              type="button"
              onClick={() => setPaymentTrackerOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <AlertCircle className={`h-4 w-4 ${counts.overdue > 0 ? "text-rose-400" : "text-amber-400"}`} />
                <span className={`text-sm font-semibold ${counts.overdue > 0 ? "text-rose-300" : "text-amber-300"}`}>Payment Tracker</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {counts.overdue > 0 && (
                    <span className="rounded-full border border-rose-700/60 bg-rose-900/30 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                      {counts.overdue} overdue
                    </span>
                  )}
                  {counts.due_soon > 0 && (
                    <span className="rounded-full border border-orange-700/60 bg-orange-900/30 px-2 py-0.5 text-[10px] font-bold text-orange-300">
                      {counts.due_soon} due soon
                    </span>
                  )}
                  {counts.due_week > 0 && (
                    <span className="rounded-full border border-amber-700/60 bg-amber-900/30 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                      {counts.due_week} this week
                    </span>
                  )}
                </div>
              </div>
              <ChevronDown className={`h-4 w-4 transition-transform ${counts.overdue > 0 ? "text-rose-500" : "text-amber-500"} ${paymentTrackerOpen ? "rotate-180" : ""}`} />
            </button>

            {paymentTrackerOpen && (
              <div className="border-t border-white/10 px-4 pb-4 pt-3 space-y-3">
                {buckets.map((bucket) => {
                  const isOpen = paymentBucketOpen[bucket.key] !== false;
                  return (
                    <div key={bucket.key} className={`rounded-xl border ${bucket.color.border} ${bucket.color.bg}`}>
                      <button
                        type="button"
                        onClick={() => setPaymentBucketOpen((prev) => ({ ...prev, [bucket.key]: !isOpen }))}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-semibold ${bucket.color.header}`}>{bucket.label}</span>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${bucket.color.badge}`}>{bucket.count}</span>
                          {bucket.amount > 0 && (
                            <span className={`text-[11px] font-medium ${bucket.color.amt}`}>
                              {currency} {bucket.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} at risk
                            </span>
                          )}
                        </div>
                        <ChevronDown className={`h-3.5 w-3.5 text-zinc-500 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </button>
                      {isOpen && (
                        <div className="border-t border-white/5 overflow-x-auto">
                          <table className="w-full text-[11px]">
                            <thead>
                              <tr className="border-b border-white/5 text-zinc-500">
                                <th className="px-3 py-1.5 text-left font-normal">Invoice</th>
                                <th className="px-3 py-1.5 text-left font-normal">Supplier</th>
                                <th className="px-3 py-1.5 text-left font-normal">Inv. Date</th>
                                <th className="px-3 py-1.5 text-left font-normal">Due Date</th>
                                <th className="px-3 py-1.5 text-right font-normal">Amount</th>
                                <th className="px-3 py-1.5 text-right font-normal">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {bucket.rows.map((r, idx) => (
                                <tr key={idx} className="border-b border-white/5 hover:bg-white/3">
                                  <td className="px-3 py-1.5 font-medium text-white">{r.invoice_no || "-"}</td>
                                  <td className="px-3 py-1.5 text-zinc-400 max-w-[180px] truncate">{r.supplier_name || "-"}</td>
                                  <td className="px-3 py-1.5 text-zinc-500">{r.invoice_date?.slice(0, 10) || "-"}</td>
                                  <td className="px-3 py-1.5 text-zinc-400">
                                    {r.due_date?.slice(0, 10) || (r.expected_due_date ? `~${r.expected_due_date}` : "-")}
                                  </td>
                                  <td className="px-3 py-1.5 text-right text-zinc-300">
                                    {r.amount > 0 ? `${r.currency || currency} ${Number(r.amount).toFixed(2)}` : "-"}
                                  </td>
                                  <td className={`px-3 py-1.5 text-right font-semibold ${bucket.dayColor}`}>
                                    {bucket.dayLabel(r) || "-"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Procurement Alert Banner (Integrity + Price + New Vendors) ─────── */}
      {(integrityAlertCounts.total > 0 || priceAlertCounts.total > 0 || vendorAlertData.counts.total > 0) && (
        <div className="rounded-2xl border border-amber-700/40 bg-amber-900/10">
          {/* Banner header */}
          <button
            type="button"
            onClick={() => setAlertBannerOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <ShieldAlert className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-semibold text-amber-300">Procurement Alerts</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {(integrityAlertCounts.critical + priceAlertCounts.critical) > 0 && (
                  <span className="rounded-full border border-rose-700/60 bg-rose-900/30 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                    {integrityAlertCounts.critical + priceAlertCounts.critical} critical
                  </span>
                )}
                {(integrityAlertCounts.warning + priceAlertCounts.warning) > 0 && (
                  <span className="rounded-full border border-amber-700/60 bg-amber-900/30 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                    {integrityAlertCounts.warning + priceAlertCounts.warning} warning
                  </span>
                )}
                {(integrityAlertCounts.info + priceAlertCounts.info) > 0 && (
                  <span className="rounded-full border border-sky-700/60 bg-sky-900/30 px-2 py-0.5 text-[10px] font-bold text-sky-300">
                    {integrityAlertCounts.info + priceAlertCounts.info} info
                  </span>
                )}
                {vendorAlertData.counts.total > 0 && (
                  <span className="rounded-full border border-violet-700/60 bg-violet-900/30 px-2 py-0.5 text-[10px] font-bold text-violet-300">
                    {vendorAlertData.counts.total} new vendors/items
                  </span>
                )}
              </div>
            </div>
            <ChevronDown className={`h-4 w-4 text-amber-500 transition-transform ${alertBannerOpen ? "rotate-180" : ""}`} />
          </button>

          {/* Banner body */}
          {alertBannerOpen && (
            <div className="border-t border-amber-700/20 px-4 pb-4 pt-2 space-y-4">

              {/* ── Section: Data Integrity ─────────────────────────────── */}
              {integrityAlertCounts.total > 0 && (() => {
                const grouped: Record<string, IntegrityAlert[]> = {};
                for (const a of integrityAlerts) {
                  if (!grouped[a.alert_type]) grouped[a.alert_type] = [];
                  grouped[a.alert_type].push(a);
                }
                const sectionKey = "__integrity_section__";
                const sectionOpen = alertSectionOpen[sectionKey] !== false;
                return (
                  <div>
                    <button
                      type="button"
                      onClick={() => setAlertSectionOpen((prev) => ({ ...prev, [sectionKey]: !sectionOpen }))}
                      className="flex w-full items-center justify-between gap-2 mb-2"
                    >
                      <span className="text-xs font-semibold uppercase tracking-wide text-amber-400">Data Integrity ({integrityAlertCounts.total})</span>
                      <ChevronDown className={`h-3.5 w-3.5 text-zinc-500 transition-transform ${sectionOpen ? "rotate-180" : ""}`} />
                    </button>
                    {sectionOpen && (
                      <div className="space-y-2">
                        {Object.entries(grouped).map(([alertType, items]) => {
                          const meta = ALERT_TYPE_META[alertType] ?? { label: alertType, description: "" };
                          const isOpen = alertSectionOpen[alertType] !== false;
                          const sev = items[0]?.severity ?? "info";
                          const headerCls = sev === "critical" ? "text-rose-300" : sev === "warning" ? "text-amber-300" : "text-sky-300";
                          const iconCls = sev === "critical" ? "text-rose-400" : sev === "warning" ? "text-amber-400" : "text-sky-400";
                          const rowBorderCls = sev === "critical" ? "border-rose-900/30 bg-rose-950/20" : sev === "warning" ? "border-amber-900/30 bg-amber-950/20" : "border-sky-900/30 bg-sky-950/20";
                          return (
                            <div key={alertType} className={`rounded-xl border ${rowBorderCls}`}>
                              <button
                                type="button"
                                onClick={() => setAlertSectionOpen((prev) => ({ ...prev, [alertType]: !isOpen }))}
                                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                              >
                                <div className="flex items-center gap-2">
                                  {sev === "critical" ? <AlertCircle className={`h-3.5 w-3.5 ${iconCls}`} /> : <AlertTriangle className={`h-3.5 w-3.5 ${iconCls}`} />}
                                  <span className={`text-xs font-semibold ${headerCls}`}>{meta.label}</span>
                                  <span className="text-xs text-zinc-500">({items.length})</span>
                                </div>
                                <ChevronDown className={`h-3.5 w-3.5 text-zinc-500 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                              </button>
                              {isOpen && (
                                <div className="border-t border-white/5 px-3 pb-3 pt-1 space-y-1">
                                  <p className="text-[11px] text-zinc-500 mb-2">{meta.description}</p>
                                  {items.map((alert, idx) => {
                                    const itemKey = `integrity_${alertType}_${alert.invoice_no || idx}`;
                                    const isItemOpen = expandedAlertKeys[itemKey] === true;
                                    const comment = alertComments[itemKey] || "";
                                    return (
                                      <div key={idx} className={`rounded-lg border ${isItemOpen ? "border-white/15 bg-black/30" : "border-white/5 bg-black/20"}`}>
                                        {/* Always-visible row */}
                                        <div className="flex items-start gap-2 px-3 py-2">
                                          <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                              {alert.invoice_no && <span className="text-xs font-semibold text-white">{alert.invoice_no}</span>}
                                              {alert.supplier_name && <span className="text-xs text-zinc-300">{alert.supplier_name}</span>}
                                              {alert.invoice_date && <span className="text-[11px] text-zinc-500">{alert.invoice_date.slice(0, 10)}</span>}
                                              {alert.amount !== null && alert.amount !== undefined && alert.amount > 0 && (
                                                <span className="text-[11px] font-medium text-zinc-300">{alert.currency} {Number(alert.amount).toFixed(2)}</span>
                                              )}
                                              {comment && <span className="rounded border border-emerald-700/50 bg-emerald-900/20 px-1.5 py-0.5 text-[9px] text-emerald-300">✓ noted</span>}
                                            </div>
                                            {/* Problem description — always visible */}
                                            <p className="mt-1 text-[11px] leading-relaxed text-amber-100/75">{alert.detail}</p>
                                            {/* User note preview (when collapsed) */}
                                            {!isItemOpen && comment && (
                                              <p className="mt-0.5 text-[11px] text-emerald-400/80 italic">{'"'}{comment}{'"'}</p>
                                            )}
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => setExpandedAlertKeys((prev) => ({ ...prev, [itemKey]: !isItemOpen }))}
                                            className={`shrink-0 rounded-lg border px-2 py-1 text-[10px] font-medium transition ${isItemOpen ? "border-violet-600/50 bg-violet-900/30 text-violet-300" : "border-white/10 bg-white/5 text-zinc-500 hover:text-zinc-300"}`}
                                          >
                                            {isItemOpen ? "▲ close" : "✎ note"}
                                          </button>
                                        </div>
                                        {/* Expandable note */}
                                        {isItemOpen && (
                                          <div className="border-t border-white/5 px-3 pb-3 pt-2">
                                            <div className="mb-1 text-[10px] uppercase tracking-[0.15em] text-zinc-500">Note / Action taken</div>
                                            <textarea
                                              value={comment}
                                              onChange={(e) => saveAlertComment(itemKey, e.target.value)}
                                              placeholder="e.g. Confirmed duplicate — same PO split into 2 deliveries. No action needed."
                                              rows={2}
                                              className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none placeholder:text-zinc-600 focus:border-violet-500/50"
                                            />
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── Section: New Vendors & Items ────────────────────────── */}
              {vendorAlertData.counts.total > 0 && (() => {
                const sectionKey = "__vendor_section__";
                const sectionOpen = alertSectionOpen[sectionKey] !== false;
                const { new_suppliers, new_items, reappeared_suppliers, counts } = vendorAlertData;
                return (
                  <div>
                    <button
                      type="button"
                      onClick={() => setAlertSectionOpen((prev) => ({ ...prev, [sectionKey]: !sectionOpen }))}
                      className="flex w-full items-center justify-between gap-2 mb-2"
                    >
                      <span className="text-xs font-semibold uppercase tracking-wide text-violet-400">New Vendors &amp; Items ({counts.total})</span>
                      <ChevronDown className={`h-3.5 w-3.5 text-zinc-500 transition-transform ${sectionOpen ? "rotate-180" : ""}`} />
                    </button>
                    {sectionOpen && (
                      <div className="space-y-2">
                        {/* New Suppliers */}
                        {new_suppliers.length > 0 && (() => {
                          const key = "__new_suppliers__";
                          const isOpen = alertSectionOpen[key] !== false;
                          return (
                            <div className="rounded-xl border border-violet-900/40 bg-violet-950/20">
                              <button
                                type="button"
                                onClick={() => setAlertSectionOpen((prev) => ({ ...prev, [key]: !isOpen }))}
                                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                              >
                                <div className="flex items-center gap-2">
                                  <AlertCircle className="h-3.5 w-3.5 text-violet-400" />
                                  <span className="text-xs font-semibold text-violet-300">New Suppliers</span>
                                  <span className="text-xs text-zinc-500">({new_suppliers.length})</span>
                                </div>
                                <ChevronDown className={`h-3.5 w-3.5 text-zinc-500 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                              </button>
                              {isOpen && (
                                <div className="border-t border-white/5 px-3 pb-3 pt-1 space-y-1">
                                  <p className="text-[11px] text-zinc-500 mb-2">Suppliers invoicing for the first time in the last 30 days</p>
                                  {new_suppliers.map((s, idx) => (
                                    <div key={idx} className="flex items-start gap-2 rounded-lg border border-white/5 bg-black/20 px-3 py-2">
                                      <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                        <span className="text-xs font-medium text-white">{s.supplier_name}</span>
                                        <span className="text-[11px] text-zinc-500">#{s.invoice_no}</span>
                                        <span className="text-[11px] text-zinc-600">{s.first_invoice_date?.slice(0, 10)}</span>
                                        {s.amount > 0 && <span className="text-[11px] text-zinc-400">{s.currency} {Number(s.amount).toFixed(2)}</span>}
                                        <span className="rounded-full border border-violet-700/60 bg-violet-900/30 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-300">NEW SUPPLIER</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* New Items */}
                        {new_items.length > 0 && (() => {
                          const key = "__new_items__";
                          const isOpen = alertSectionOpen[key] !== false;
                          return (
                            <div className="rounded-xl border border-indigo-900/40 bg-indigo-950/20">
                              <button
                                type="button"
                                onClick={() => setAlertSectionOpen((prev) => ({ ...prev, [key]: !isOpen }))}
                                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                              >
                                <div className="flex items-center gap-2">
                                  <AlertTriangle className="h-3.5 w-3.5 text-indigo-400" />
                                  <span className="text-xs font-semibold text-indigo-300">New Items from Existing Suppliers</span>
                                  <span className="text-xs text-zinc-500">({new_items.length})</span>
                                </div>
                                <ChevronDown className={`h-3.5 w-3.5 text-zinc-500 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                              </button>
                              {isOpen && (
                                <div className="border-t border-white/5 px-3 pb-3 pt-1 space-y-1">
                                  <p className="text-[11px] text-zinc-500 mb-2">Items not seen from this supplier in the prior 90 days</p>
                                  {new_items.map((item, idx) => (
                                    <div key={idx} className="flex items-start gap-2 rounded-lg border border-white/5 bg-black/20 px-3 py-2">
                                      <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                        <span className="text-xs font-medium text-white">{item.item_description}</span>
                                        <span className="text-[11px] text-zinc-400">{item.supplier_name}</span>
                                        <span className="text-[11px] text-zinc-600">{item.first_invoice_date?.slice(0, 10)}</span>
                                        {item.unit_price !== null && item.unit_price !== undefined && (
                                          <span className="text-[11px] text-zinc-400">{item.currency} {Number(item.unit_price).toFixed(2)}/{item.unit || "unit"}</span>
                                        )}
                                        <span className="rounded-full border border-indigo-700/60 bg-indigo-900/30 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-indigo-300">NEW ITEM</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* Reappeared Suppliers */}
                        {reappeared_suppliers.length > 0 && (() => {
                          const key = "__reappeared__";
                          const isOpen = alertSectionOpen[key] !== false;
                          return (
                            <div className="rounded-xl border border-sky-900/40 bg-sky-950/20">
                              <button
                                type="button"
                                onClick={() => setAlertSectionOpen((prev) => ({ ...prev, [key]: !isOpen }))}
                                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                              >
                                <div className="flex items-center gap-2">
                                  <AlertTriangle className="h-3.5 w-3.5 text-sky-400" />
                                  <span className="text-xs font-semibold text-sky-300">Reappeared Suppliers</span>
                                  <span className="text-xs text-zinc-500">({reappeared_suppliers.length})</span>
                                </div>
                                <ChevronDown className={`h-3.5 w-3.5 text-zinc-500 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                              </button>
                              {isOpen && (
                                <div className="border-t border-white/5 px-3 pb-3 pt-1 space-y-1">
                                  <p className="text-[11px] text-zinc-500 mb-2">Suppliers absent for an extended period, now billing again</p>
                                  {reappeared_suppliers.map((s, idx) => (
                                    <div key={idx} className="flex items-start gap-2 rounded-lg border border-white/5 bg-black/20 px-3 py-2">
                                      <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                        <span className="text-xs font-medium text-white">{s.supplier_name}</span>
                                        <span className="text-[11px] text-zinc-500">#{s.invoice_no}</span>
                                        <span className="text-[11px] text-zinc-600">last seen {s.last_seen_before?.slice(0, 10)}</span>
                                        <span className="text-[11px] text-zinc-600">back {s.latest_invoice_date?.slice(0, 10)}</span>
                                        <span className="rounded-full border border-sky-700/60 bg-sky-900/30 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-300">REAPPEARED</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── Section: Price Alerts ───────────────────────────────── */}
              {priceAlertCounts.total > 0 && (() => {
                const grouped: Record<string, PriceAlert[]> = {};
                for (const a of priceAlerts) {
                  if (!grouped[a.alert_type]) grouped[a.alert_type] = [];
                  grouped[a.alert_type].push(a);
                }
                const sectionKey = "__price_section__";
                const sectionOpen = alertSectionOpen[sectionKey] !== false;
                return (
                  <div>
                    <button
                      type="button"
                      onClick={() => setAlertSectionOpen((prev) => ({ ...prev, [sectionKey]: !sectionOpen }))}
                      className="flex w-full items-center justify-between gap-2 mb-2"
                    >
                      <span className="text-xs font-semibold uppercase tracking-wide text-orange-400">Price Intelligence ({priceAlertCounts.total})</span>
                      <ChevronDown className={`h-3.5 w-3.5 text-zinc-500 transition-transform ${sectionOpen ? "rotate-180" : ""}`} />
                    </button>
                    {sectionOpen && (
                      <div className="space-y-2">
                        {Object.entries(grouped).map(([alertType, items]) => {
                          const meta = PRICE_ALERT_TYPE_META[alertType] ?? { label: alertType, description: "" };
                          const isOpen = alertSectionOpen[`price_${alertType}`] !== false;
                          const isOpportunity = meta.opportunity === true;
                          const sev = isOpportunity ? "opportunity" : (items[0]?.severity ?? "info");
                          const headerCls = isOpportunity ? "text-emerald-300" : sev === "critical" ? "text-rose-300" : sev === "warning" ? "text-amber-300" : "text-sky-300";
                          const iconCls = isOpportunity ? "text-emerald-400" : sev === "critical" ? "text-rose-400" : sev === "warning" ? "text-amber-400" : "text-sky-400";
                          const rowBorderCls = isOpportunity ? "border-emerald-900/30 bg-emerald-950/20" : sev === "critical" ? "border-rose-900/30 bg-rose-950/20" : sev === "warning" ? "border-amber-900/30 bg-amber-950/20" : "border-sky-900/30 bg-sky-950/20";
                          return (
                            <div key={alertType} className={`rounded-xl border ${rowBorderCls}`}>
                              <button
                                type="button"
                                onClick={() => setAlertSectionOpen((prev) => ({ ...prev, [`price_${alertType}`]: !isOpen }))}
                                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                              >
                                <div className="flex items-center gap-2">
                                  {isOpportunity ? <AlertTriangle className={`h-3.5 w-3.5 ${iconCls}`} /> : sev === "critical" ? <AlertCircle className={`h-3.5 w-3.5 ${iconCls}`} /> : <AlertTriangle className={`h-3.5 w-3.5 ${iconCls}`} />}
                                  <span className={`text-xs font-semibold ${headerCls}`}>{meta.label}</span>
                                  <span className="text-xs text-zinc-500">({items.length})</span>
                                </div>
                                <ChevronDown className={`h-3.5 w-3.5 text-zinc-500 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                              </button>
                              {isOpen && (
                                <div className="border-t border-white/5 px-3 pb-3 pt-1 space-y-1">
                                  <p className="text-[11px] text-zinc-500 mb-2">{meta.description}</p>
                                  {items.map((alert, idx) => {
                                    const itemKey = `price_${alertType}_${alert.invoice_no || ""}_${idx}`;
                                    const isItemOpen = expandedAlertKeys[itemKey] === true;
                                    const comment = alertComments[itemKey] || "";
                                    return (
                                      <div key={idx} className={`rounded-lg border ${isItemOpen ? "border-white/15 bg-black/30" : "border-white/5 bg-black/20"}`}>
                                        {/* Always-visible row */}
                                        <div className="flex items-start gap-2 px-3 py-2">
                                          <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                              {alert.item_description && <span className="text-xs font-semibold text-white">{alert.item_description}</span>}
                                              {alert.supplier_name && <span className="text-xs text-zinc-300">{alert.supplier_name}</span>}
                                              {alert.invoice_no && <span className="text-[11px] text-zinc-500">#{alert.invoice_no}</span>}
                                              {alert.invoice_date && <span className="text-[11px] text-zinc-500">{alert.invoice_date.slice(0, 10)}</span>}
                                              {alert.current_price > 0 && (
                                                <span className="text-[11px] font-semibold text-white">{alert.currency} {Number(alert.current_price).toFixed(2)}/{alert.unit || "unit"}</span>
                                              )}
                                              {alert.pct_diff !== null && alert.pct_diff !== undefined && (
                                                <span className={`text-[11px] font-bold ${isOpportunity ? "text-emerald-400" : alert.pct_diff > 0 ? "text-rose-400" : "text-sky-400"}`}>
                                                  {alert.pct_diff > 0 ? "+" : ""}{Number(alert.pct_diff).toFixed(1)}%
                                                </span>
                                              )}
                                              {comment && <span className="rounded border border-emerald-700/50 bg-emerald-900/20 px-1.5 py-0.5 text-[9px] text-emerald-300">✓ noted</span>}
                                            </div>
                                            {/* Problem description — always visible */}
                                            <p className="mt-1 text-[11px] leading-relaxed text-amber-100/75">{alert.detail}</p>
                                            {/* User note preview when collapsed */}
                                            {!isItemOpen && comment && (
                                              <p className="mt-0.5 text-[11px] text-emerald-400/80 italic">{'"'}{comment}{'"'}</p>
                                            )}
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => setExpandedAlertKeys((prev) => ({ ...prev, [itemKey]: !isItemOpen }))}
                                            className={`shrink-0 rounded-lg border px-2 py-1 text-[10px] font-medium transition ${isItemOpen ? "border-violet-600/50 bg-violet-900/30 text-violet-300" : "border-white/10 bg-white/5 text-zinc-500 hover:text-zinc-300"}`}
                                          >
                                            {isItemOpen ? "▲ close" : "✎ note"}
                                          </button>
                                        </div>
                                        {/* Expandable note */}
                                        {isItemOpen && (
                                          <div className="border-t border-white/5 px-3 pb-3 pt-2">
                                            <div className="mb-1 text-[10px] uppercase tracking-[0.15em] text-zinc-500">Note / Action taken</div>
                                            <textarea
                                              value={comment}
                                              onChange={(e) => saveAlertComment(itemKey, e.target.value)}
                                              placeholder="e.g. Price spike confirmed — emergency sourcing. Approved by manager."
                                              rows={2}
                                              className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none placeholder:text-zinc-600 focus:border-violet-500/50"
                                            />
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Valid Invoices</div>
          <div className="mt-2 text-2xl font-semibold text-white">{validSummary.invoiceCount}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Valid Amount</div>
          <div className="mt-2 text-2xl font-semibold text-white">{formatMoney(validSummary.totalAmount, city === "dubai" ? "AED" : "PHP")}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Problem Invoices</div>
          <div className="mt-2 text-2xl font-semibold text-amber-100">{qualitySummary.flagged_invoice_count}</div>
        </div>
      </div>

      <div className={TAB_CONTAINER}>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("valid")}
            className={activeTab === "valid" ? TAB_ACTIVE : TAB_INACTIVE}
          >
            Valid Data ({validRows.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("problems")}
            className={activeTab === "problems" ? `${TAB_ACTIVE} !border-amber-500/30 !bg-amber-500/20 !text-amber-300` : TAB_INACTIVE}
          >
            Problem Data ({qualitySummary.flagged_invoice_count})
          </button>
        </div>
      </div>

      {activeTab === "valid" ? (
        <div className="space-y-3">
          {validRows.map((row) => {
            const isExpanded = expandedInvoiceNo === row.invoice_no;
            const detail = detailsByInvoiceNo[detailKeyFor(city, row.invoice_no)];
            return (
              <div key={row.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <button
                  type="button"
                  onClick={() => void toggleDetail(row)}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-white">
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-violet-300" /> : <ChevronRight className="h-4 w-4 text-zinc-500" />}
                      <span>{row.invoice_no}</span>
                      <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-violet-200">{row.market}</span>
                      {spikeInvoiceNos.has(row.invoice_no) && (
                        <span className="rounded-full border border-rose-700/60 bg-rose-900/20 px-2 py-0.5 text-[10px] font-bold text-rose-300">↑ price alert</span>
                      )}
                      {newSupplierNames.has(row.supplier_name) && (
                        <span className="rounded-full border border-violet-700/60 bg-violet-900/20 px-2 py-0.5 text-[10px] font-bold text-violet-300">✦ new supplier</span>
                      )}
                    </div>
                    <div className="mt-2 text-xs text-zinc-400">
                      {row.supplier_name || "-"} | Invoice {formatDate(row.invoice_date)} | Due {formatDate(row.due_date)} | Branch {row.branch || "-"} | PO {row.po_number || "-"}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {formatMoney(row.invoice_amount, row.currency)} | {row.line_count} lines | Qty {Number(row.quantity_total || 0).toFixed(2)} | Updated {formatDateTime(row.updated_at)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs uppercase tracking-wide text-zinc-500">Grand Total</div>
                    <div className="mt-1 font-mono text-base font-semibold text-white">{formatMoney(row.invoice_amount, row.currency)}</div>
                  </div>
                </button>

                {isExpanded ? (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/6/60 p-4">
                    {detailBusy === row.invoice_no && !detail ? (
                      <div className="text-sm text-zinc-500">Loading invoice detail...</div>
                    ) : detail ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                            <div className="text-[10px] uppercase tracking-wide text-zinc-500">Supplier</div>
                            <div className="mt-1 text-sm text-white">{String(detail.summary.supplier_name || "-")}</div>
                          </div>
                          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                            <div className="text-[10px] uppercase tracking-wide text-zinc-500">Branch</div>
                            <div className="mt-1 text-sm text-white">{String(detail.line_items.find((line) => String(line.branch || "").trim())?.branch || row.branch || "-")}</div>
                          </div>
                          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                            <div className="text-[10px] uppercase tracking-wide text-zinc-500">Payment Terms</div>
                            <div className="mt-1 text-sm text-white">{String(detail.summary.payment_terms || "-")}</div>
                          </div>
                          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                            <div className="text-[10px] uppercase tracking-wide text-zinc-500">Prepared By</div>
                            <div className="mt-1 text-sm text-white">{String(detail.summary.prepared_by || "-")}</div>
                          </div>
                          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                            <div className="text-[10px] uppercase tracking-wide text-zinc-500">Approved By</div>
                            <div className="mt-1 text-sm text-white">{String(detail.summary.approved_by || "-")}</div>
                          </div>
                        </div>

                        {detail.summary.notes ? (
                          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-zinc-300">
                            {String(detail.summary.notes)}
                          </div>
                        ) : null}

                        <div className="overflow-hidden rounded-xl border border-white/10">
                          <div className="grid grid-cols-[56px_120px_minmax(0,1fr)_100px_80px_120px_120px] gap-3 border-b border-white/10 bg-white/5 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                            <div>Line</div>
                            <div>Branch</div>
                            <div>Item</div>
                            <div className="text-right">Qty</div>
                            <div>Unit</div>
                            <div className="text-right">Unit Price</div>
                            <div className="text-right">Amount</div>
                          </div>
                          <div className="divide-y divide-neutral-800">
                            {detail.line_items.map((line) => (
                              <div key={`${row.invoice_no}-${line.line_no}`} className="grid grid-cols-[56px_120px_minmax(0,1fr)_100px_80px_120px_120px] gap-3 px-3 py-2 text-sm">
                                <div className="text-zinc-500">{line.line_no}</div>
                                <div className="text-zinc-300">{line.branch || "-"}</div>
                                <div className="text-white">{line.item_description || "-"}</div>
                                <div className="text-right font-mono text-zinc-200">{Number(line.quantity || 0).toFixed(2)}</div>
                                <div className="text-zinc-400">{line.unit || "-"}</div>
                                <div className="text-right font-mono text-zinc-200">{formatMoney(line.unit_price, line.currency)}</div>
                                <div className="text-right font-mono text-white">{formatMoney(line.total_incl_vat || line.amount, line.currency)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-zinc-500">No detail available.</div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
          {!validRows.length && !loading ? <div className="text-sm text-zinc-500">No valid supplier invoices found for the current filters.</div> : null}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-800/40 bg-amber-950/20 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-100">
                  <AlertTriangle className="h-4 w-4" />
                  Problem Data
                </div>
                <div className="mt-1 text-sm text-amber-200/80">
                  Edit flagged invoices here. Save writes back to the source spreadsheet first, then updates DB and refreshes the valid/problem split.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="rounded-xl border border-amber-700/40 bg-white/6/60 px-3 py-2 text-sm text-amber-100">
                  Flagged invoices: <span className="font-semibold">{qualitySummary.flagged_invoice_count}</span>
                </div>
                <div className="rounded-xl border border-amber-700/40 bg-white/6/60 px-3 py-2 text-sm text-amber-100">
                  Affected lines: <span className="font-semibold">{qualitySummary.flagged_line_count}</span>
                </div>
                <button
                  type="button"
                  onClick={exportQualityCsv}
                  disabled={!qualityRows.length}
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-700/50 bg-amber-900/20 px-3 py-2 text-sm text-amber-100 hover:bg-amber-900/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </button>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-amber-900/30">
              <div className="grid grid-cols-[160px_120px_minmax(0,1fr)_120px_140px_170px_120px] gap-3 border-b border-amber-900/30 bg-white/6/70 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-amber-200/70">
                <div>Invoice</div>
                <div>Date</div>
                <div>Supplier</div>
                <div className="text-right">Blank Lines</div>
                <div className="text-right">Invoice Amount</div>
                <div>Reason</div>
                <div className="text-right">Action</div>
              </div>
              <div className="divide-y divide-amber-900/20 bg-white/4">
                {qualityRows.map((row) => {
                  const selected = selectedProblemInvoiceNo === row.invoice_no;
                  return (
                    <div key={row.id} className={`grid grid-cols-[160px_120px_minmax(0,1fr)_120px_140px_170px_120px] gap-3 px-3 py-2 text-sm ${selected ? "bg-amber-900/10" : ""}`}>
                      <div className="font-medium text-amber-50">{row.invoice_no}</div>
                      <div className="text-zinc-300">{formatDate(row.invoice_date)}</div>
                      <div className="truncate text-zinc-200">{row.supplier_name || "-"}</div>
                      <div className="text-right font-mono text-amber-100">
                        {row.blank_financial_line_count}/{row.line_count}
                      </div>
                      <div className="text-right font-mono text-zinc-200">{formatMoney(row.invoice_amount, row.currency)}</div>
                      <div className="text-xs text-amber-200/80">{row.reason}</div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => void openProblemEditor(row)}
                          disabled={problemBusy === row.invoice_no}
                          className="inline-flex items-center gap-2 rounded-lg border border-amber-700/50 bg-amber-900/20 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-900/30 disabled:opacity-60"
                        >
                          <SquarePen className="h-3.5 w-3.5" />
                          {problemBusy === row.invoice_no ? "Loading..." : selected ? "Editing" : "Edit"}
                        </button>
                      </div>
                    </div>
                  );
                })}
                {!qualityRows.length ? (
                  <div className="px-3 py-4 text-sm text-amber-100/70">
                    No blank-financial invoices found for the current filters.
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-sm font-semibold text-white">Manager Priority Report</div>
                <div className="mt-1 text-sm text-zinc-400">
                  Same report shape as the manual review summary: supplier counts, priority order, line volume, and sample items for the invoices still missing source financial values.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="rounded-xl border border-white/10 bg-white/6/70 px-3 py-2 text-sm text-zinc-200">
                  Suppliers: <span className="font-semibold">{problemReportSummary.supplier_count}</span>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/6/70 px-3 py-2 text-sm text-zinc-200">
                  Report rows: <span className="font-semibold">{problemReportRows.length}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-[320px_minmax(0,1fr)]">
              <div className="rounded-xl border border-white/10 bg-white/6/50 p-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Supplier Summary</div>
                <div className="mt-3 space-y-2">
                  {problemSupplierSummary.map((row) => (
                    <div key={row.supplier_name} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/4 px-3 py-2 text-sm">
                      <div className="truncate pr-3 text-zinc-200">{row.supplier_name}</div>
                      <div className="font-mono text-white">{row.invoice_count}</div>
                    </div>
                  ))}
                  {!problemSupplierSummary.length ? (
                    <div className="text-sm text-zinc-500">No supplier summary for the current filters.</div>
                  ) : null}
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-white/10">
                <div className="grid grid-cols-[70px_150px_110px_minmax(0,1fr)_70px_110px_120px] gap-3 border-b border-white/10 bg-white/4 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  <div>Priority</div>
                  <div>Invoice</div>
                  <div>Date</div>
                  <div>Supplier / Items</div>
                  <div className="text-right">Lines</div>
                  <div className="text-right">Qty</div>
                  <div className="text-right">Blank Cells</div>
                </div>
                <div className="divide-y divide-neutral-800 bg-white/4">
                  {problemReportRows.map((row) => (
                    <div key={`report-${row.invoice_no}`} className="grid grid-cols-[70px_150px_110px_minmax(0,1fr)_70px_110px_120px] gap-3 px-3 py-3 text-sm">
                      <div className="font-mono text-zinc-300">{row.priority}</div>
                      <div className="font-medium text-white">{row.invoice_no}</div>
                      <div className="text-zinc-300">{formatDate(row.invoice_date)}</div>
                      <div className="min-w-0">
                        <div className="truncate text-zinc-200">{row.supplier_name || "-"}</div>
                        <div className="mt-1 truncate text-xs text-zinc-500">{row.sample_items.join(" | ") || "-"}</div>
                      </div>
                      <div className="text-right font-mono text-zinc-200">{row.line_count}</div>
                      <div className="text-right font-mono text-zinc-200">{Number(row.quantity_total || 0).toFixed(2)}</div>
                      <div className="text-right font-mono text-amber-200">{row.blank_source_cells}</div>
                    </div>
                  ))}
                  {!problemReportRows.length ? (
                    <div className="px-3 py-4 text-sm text-zinc-500">
                      No manager report rows for the current filters.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {problemDraft ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">Problem Invoice Editor</div>
                  <div className="mt-1 text-sm text-zinc-400">
                    Invoice <span className="font-medium text-white">{problemDraft.invoice_no}</span>. Fields not present in the source tab structure are ignored automatically on save.
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setProblemDraft(null);
                      setProblemBaseDraft(null);
                      setSelectedProblemInvoiceNo(null);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/8 bg-white/6 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5"
                  >
                    <X className="h-4 w-4" />
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => setProblemDraft(problemBaseDraft)}
                    disabled={!problemDirty || problemSaveBusy}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/8 bg-white/6 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5 disabled:opacity-50"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Cancel Changes
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveProblemEdits()}
                    disabled={!problemDirty || problemSaveBusy}
                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-700/60 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-900/30 disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" />
                    {problemSaveBusy ? "Saving..." : "Save Correction"}
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                {SUMMARY_EDIT_FIELDS.map((field) => (
                  <label key={field.key} className={`block ${field.className || ""}`}>
                    <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">{field.label}</div>
                    {field.type === "textarea" ? (
                      <textarea
                        value={problemDraft.summary[field.key] || ""}
                        onChange={(e) => updateProblemSummaryField(field.key, e.target.value)}
                        rows={3}
                        className="w-full rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white outline-none transition focus:border-violet-500/50"
                      />
                    ) : (
                      <input
                        type={field.type}
                        step={field.type === "number" ? "0.01" : undefined}
                        value={problemDraft.summary[field.key] || ""}
                        onChange={(e) => updateProblemSummaryField(field.key, e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white outline-none transition focus:border-violet-500/50"
                      />
                    )}
                  </label>
                ))}
              </div>

              <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
                <table className="min-w-[1700px] w-full text-sm">
                  <thead className="bg-white/4">
                    <tr className="text-left text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                      <th className="px-3 py-2">Line</th>
                      {LINE_EDIT_FIELDS.map((field) => (
                        <th key={field.key} className="px-3 py-2">{field.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {problemDraft.line_items.map((line) => (
                      <tr key={`${problemDraft.invoice_no}-${line.line_no}`} className="align-top">
                        <td className="px-3 py-2 font-mono text-zinc-500">{line.line_no}</td>
                        {LINE_EDIT_FIELDS.map((field) => (
                          <td key={`${line.line_no}-${field.key}`} className="px-3 py-2">
                            <input
                              type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
                              step={field.type === "number" ? "0.01" : undefined}
                              value={line.updates[field.key] || ""}
                              onChange={(e) => updateProblemLineField(line.line_no, field.key, e.target.value)}
                              className="w-full min-w-[120px] rounded-lg border border-white/10 bg-white/6 px-2.5 py-2 text-sm text-white outline-none transition focus:border-violet-500/50"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
