"use client";

import { AlertTriangle, ChevronDown, ChevronRight, Database, Download, ExternalLink, RefreshCw, Save, SquarePen, Upload, X } from "lucide-react";
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

const DUBAI_BRANCH_OPTIONS = ["Al Barsha", "Al Mina", "B Bay", "JLT", "M City"];
const UNKNOWN_BRANCH_OPTION = "branch name不明";

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

      const [data, qualityData, reportData] = await Promise.all([
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
    } catch (e: any) {
      setRows([]);
      setQualityRows([]);
      setQualitySummary({ flagged_invoice_count: 0, flagged_line_count: 0 });
      setProblemReportRows([]);
      setProblemSupplierSummary([]);
      setProblemReportSummary({ flagged_invoice_count: 0, flagged_line_count: 0, supplier_count: 0 });
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

  if (!allowed) {
    return <div className="text-sm text-red-300">Procurement page is available only to authorized procurement admin roles.</div>;
  }

  return (
    <div className="space-y-4">
      {error ? <div className="rounded-2xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-900/50 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">{notice}</div> : null}

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-2xl border border-violet-500/20 bg-violet-500/10 text-violet-200">
                  <Database className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xl font-semibold tracking-tight text-neutral-100">Supplier Invoice Hub</div>
                  <div className="mt-1 text-sm text-neutral-400">Spreadsheet-backed invoice sync, quality review, and correction for Dubai and Manila.</div>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <span className="rounded-full border border-neutral-800 bg-neutral-950/80 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-neutral-400">
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
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
            <div className="flex flex-wrap items-end gap-3 xl:flex-nowrap">
              <div className="min-w-[168px] flex-1 xl:w-52 xl:flex-none">
                <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-neutral-500">Approver</div>
                <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Approver name" className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-sm text-neutral-100 outline-none transition focus:border-violet-500/50 focus:bg-neutral-900/90" />
              </div>
              <div className="min-w-[132px] xl:w-36 xl:flex-none">
                <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-neutral-500">PIN</div>
                <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-sm text-neutral-100 outline-none transition focus:border-violet-500/50 focus:bg-neutral-900/90" />
              </div>
              <div className="min-w-[124px] xl:w-32 xl:flex-none">
                <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-neutral-500">Market</div>
                <select value={city} onChange={(e) => setCity(e.target.value === "dubai" ? "dubai" : "manila")} className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-sm text-neutral-100 outline-none transition focus:border-violet-500/50 focus:bg-neutral-900/90">
                  <option value="manila">Manila</option>
                  <option value="dubai">Dubai</option>
                </select>
              </div>
              <div className="flex flex-wrap gap-2 xl:ml-2 xl:justify-end">
                <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-w-[110px] items-center justify-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm hover:bg-neutral-900 disabled:opacity-60">
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
                    <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-neutral-500">Selected File</div>
                    <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100">
                      {uploadFile.name}
                    </div>
                  </div>
                  <div className="min-w-[160px] xl:w-44 xl:flex-none">
                    <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-neutral-500">Invoice Date</div>
                    <DatePicker value={uploadInvoiceDate} onChange={setUploadInvoiceDate} />
                  </div>
                  <div className="min-w-[180px] xl:w-52 xl:flex-none">
                    <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-neutral-500">Branch Name</div>
                    <select
                      value={uploadBranchName}
                      onChange={(e) => setUploadBranchName(String(e.target.value || ""))}
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-sm text-neutral-100 outline-none transition focus:border-amber-500/50 focus:bg-neutral-900/90"
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
                      className="inline-flex min-w-[96px] items-center justify-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900 disabled:opacity-60"
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

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4 md:grid-cols-4">
        <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="Invoice no" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="Vendor name" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <DatePicker value={dateFrom} onChange={setDateFrom} />
        <DatePicker value={dateTo} onChange={setDateTo} />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">Valid Invoices</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-100">{validSummary.invoiceCount}</div>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">Valid Amount</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-100">{formatMoney(validSummary.totalAmount, city === "dubai" ? "AED" : "PHP")}</div>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">Problem Invoices</div>
          <div className="mt-2 text-2xl font-semibold text-amber-100">{qualitySummary.flagged_invoice_count}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("valid")}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${activeTab === "valid" ? "bg-neutral-100 text-neutral-950" : "bg-neutral-950 text-neutral-300 hover:bg-neutral-900"}`}
          >
            Valid Data ({validRows.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("problems")}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${activeTab === "problems" ? "bg-amber-200 text-amber-950" : "bg-neutral-950 text-neutral-300 hover:bg-neutral-900"}`}
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
              <div key={row.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
                <button
                  type="button"
                  onClick={() => void toggleDetail(row)}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-neutral-100">
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-violet-300" /> : <ChevronRight className="h-4 w-4 text-neutral-500" />}
                      <span>{row.invoice_no}</span>
                      <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-violet-200">{row.market}</span>
                    </div>
                    <div className="mt-2 text-xs text-neutral-400">
                      {row.supplier_name || "-"} | Invoice {formatDate(row.invoice_date)} | Due {formatDate(row.due_date)} | Branch {row.branch || "-"} | PO {row.po_number || "-"}
                    </div>
                    <div className="mt-1 text-xs text-neutral-500">
                      {formatMoney(row.invoice_amount, row.currency)} | {row.line_count} lines | Qty {Number(row.quantity_total || 0).toFixed(2)} | Updated {formatDateTime(row.updated_at)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs uppercase tracking-wide text-neutral-500">Grand Total</div>
                    <div className="mt-1 font-mono text-base font-semibold text-neutral-100">{formatMoney(row.invoice_amount, row.currency)}</div>
                  </div>
                </button>

                {isExpanded ? (
                  <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
                    {detailBusy === row.invoice_no && !detail ? (
                      <div className="text-sm text-neutral-500">Loading invoice detail...</div>
                    ) : detail ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-3">
                            <div className="text-[10px] uppercase tracking-wide text-neutral-500">Supplier</div>
                            <div className="mt-1 text-sm text-neutral-100">{String(detail.summary.supplier_name || "-")}</div>
                          </div>
                          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-3">
                            <div className="text-[10px] uppercase tracking-wide text-neutral-500">Branch</div>
                            <div className="mt-1 text-sm text-neutral-100">{String(detail.line_items.find((line) => String(line.branch || "").trim())?.branch || row.branch || "-")}</div>
                          </div>
                          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-3">
                            <div className="text-[10px] uppercase tracking-wide text-neutral-500">Payment Terms</div>
                            <div className="mt-1 text-sm text-neutral-100">{String(detail.summary.payment_terms || "-")}</div>
                          </div>
                          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-3">
                            <div className="text-[10px] uppercase tracking-wide text-neutral-500">Prepared By</div>
                            <div className="mt-1 text-sm text-neutral-100">{String(detail.summary.prepared_by || "-")}</div>
                          </div>
                          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-3">
                            <div className="text-[10px] uppercase tracking-wide text-neutral-500">Approved By</div>
                            <div className="mt-1 text-sm text-neutral-100">{String(detail.summary.approved_by || "-")}</div>
                          </div>
                        </div>

                        {detail.summary.notes ? (
                          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-3 text-sm text-neutral-300">
                            {String(detail.summary.notes)}
                          </div>
                        ) : null}

                        <div className="overflow-hidden rounded-xl border border-neutral-800">
                          <div className="grid grid-cols-[56px_120px_minmax(0,1fr)_100px_80px_120px_120px] gap-3 border-b border-neutral-800 bg-neutral-900/40 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-neutral-500">
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
                                <div className="text-neutral-500">{line.line_no}</div>
                                <div className="text-neutral-300">{line.branch || "-"}</div>
                                <div className="text-neutral-100">{line.item_description || "-"}</div>
                                <div className="text-right font-mono text-neutral-200">{Number(line.quantity || 0).toFixed(2)}</div>
                                <div className="text-neutral-400">{line.unit || "-"}</div>
                                <div className="text-right font-mono text-neutral-200">{formatMoney(line.unit_price, line.currency)}</div>
                                <div className="text-right font-mono text-neutral-100">{formatMoney(line.total_incl_vat || line.amount, line.currency)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-neutral-500">No detail available.</div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
          {!validRows.length && !loading ? <div className="text-sm text-neutral-500">No valid supplier invoices found for the current filters.</div> : null}
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
                <div className="rounded-xl border border-amber-700/40 bg-neutral-950/60 px-3 py-2 text-sm text-amber-100">
                  Flagged invoices: <span className="font-semibold">{qualitySummary.flagged_invoice_count}</span>
                </div>
                <div className="rounded-xl border border-amber-700/40 bg-neutral-950/60 px-3 py-2 text-sm text-amber-100">
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
              <div className="grid grid-cols-[160px_120px_minmax(0,1fr)_120px_140px_170px_120px] gap-3 border-b border-amber-900/30 bg-neutral-950/70 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-amber-200/70">
                <div>Invoice</div>
                <div>Date</div>
                <div>Supplier</div>
                <div className="text-right">Blank Lines</div>
                <div className="text-right">Invoice Amount</div>
                <div>Reason</div>
                <div className="text-right">Action</div>
              </div>
              <div className="divide-y divide-amber-900/20 bg-neutral-950/40">
                {qualityRows.map((row) => {
                  const selected = selectedProblemInvoiceNo === row.invoice_no;
                  return (
                    <div key={row.id} className={`grid grid-cols-[160px_120px_minmax(0,1fr)_120px_140px_170px_120px] gap-3 px-3 py-2 text-sm ${selected ? "bg-amber-900/10" : ""}`}>
                      <div className="font-medium text-amber-50">{row.invoice_no}</div>
                      <div className="text-neutral-300">{formatDate(row.invoice_date)}</div>
                      <div className="truncate text-neutral-200">{row.supplier_name || "-"}</div>
                      <div className="text-right font-mono text-amber-100">
                        {row.blank_financial_line_count}/{row.line_count}
                      </div>
                      <div className="text-right font-mono text-neutral-200">{formatMoney(row.invoice_amount, row.currency)}</div>
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

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-sm font-semibold text-neutral-100">Manager Priority Report</div>
                <div className="mt-1 text-sm text-neutral-400">
                  Same report shape as the manual review summary: supplier counts, priority order, line volume, and sample items for the invoices still missing source financial values.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 px-3 py-2 text-sm text-neutral-200">
                  Suppliers: <span className="font-semibold">{problemReportSummary.supplier_count}</span>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 px-3 py-2 text-sm text-neutral-200">
                  Report rows: <span className="font-semibold">{problemReportRows.length}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-[320px_minmax(0,1fr)]">
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Supplier Summary</div>
                <div className="mt-3 space-y-2">
                  {problemSupplierSummary.map((row) => (
                    <div key={row.supplier_name} className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2 text-sm">
                      <div className="truncate pr-3 text-neutral-200">{row.supplier_name}</div>
                      <div className="font-mono text-neutral-100">{row.invoice_count}</div>
                    </div>
                  ))}
                  {!problemSupplierSummary.length ? (
                    <div className="text-sm text-neutral-500">No supplier summary for the current filters.</div>
                  ) : null}
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-neutral-800">
                <div className="grid grid-cols-[70px_150px_110px_minmax(0,1fr)_70px_110px_120px] gap-3 border-b border-neutral-800 bg-neutral-900/50 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                  <div>Priority</div>
                  <div>Invoice</div>
                  <div>Date</div>
                  <div>Supplier / Items</div>
                  <div className="text-right">Lines</div>
                  <div className="text-right">Qty</div>
                  <div className="text-right">Blank Cells</div>
                </div>
                <div className="divide-y divide-neutral-800 bg-neutral-950/30">
                  {problemReportRows.map((row) => (
                    <div key={`report-${row.invoice_no}`} className="grid grid-cols-[70px_150px_110px_minmax(0,1fr)_70px_110px_120px] gap-3 px-3 py-3 text-sm">
                      <div className="font-mono text-neutral-300">{row.priority}</div>
                      <div className="font-medium text-neutral-100">{row.invoice_no}</div>
                      <div className="text-neutral-300">{formatDate(row.invoice_date)}</div>
                      <div className="min-w-0">
                        <div className="truncate text-neutral-200">{row.supplier_name || "-"}</div>
                        <div className="mt-1 truncate text-xs text-neutral-500">{row.sample_items.join(" | ") || "-"}</div>
                      </div>
                      <div className="text-right font-mono text-neutral-200">{row.line_count}</div>
                      <div className="text-right font-mono text-neutral-200">{Number(row.quantity_total || 0).toFixed(2)}</div>
                      <div className="text-right font-mono text-amber-200">{row.blank_source_cells}</div>
                    </div>
                  ))}
                  {!problemReportRows.length ? (
                    <div className="px-3 py-4 text-sm text-neutral-500">
                      No manager report rows for the current filters.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {problemDraft ? (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-sm font-semibold text-neutral-100">Problem Invoice Editor</div>
                  <div className="mt-1 text-sm text-neutral-400">
                    Invoice <span className="font-medium text-neutral-100">{problemDraft.invoice_no}</span>. Fields not present in the source tab structure are ignored automatically on save.
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
                    className="inline-flex items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
                  >
                    <X className="h-4 w-4" />
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => setProblemDraft(problemBaseDraft)}
                    disabled={!problemDirty || problemSaveBusy}
                    className="inline-flex items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900 disabled:opacity-50"
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
                    <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-neutral-500">{field.label}</div>
                    {field.type === "textarea" ? (
                      <textarea
                        value={problemDraft.summary[field.key] || ""}
                        onChange={(e) => updateProblemSummaryField(field.key, e.target.value)}
                        rows={3}
                        className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none transition focus:border-violet-500/50"
                      />
                    ) : (
                      <input
                        type={field.type}
                        step={field.type === "number" ? "0.01" : undefined}
                        value={problemDraft.summary[field.key] || ""}
                        onChange={(e) => updateProblemSummaryField(field.key, e.target.value)}
                        className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none transition focus:border-violet-500/50"
                      />
                    )}
                  </label>
                ))}
              </div>

              <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-800">
                <table className="min-w-[1700px] w-full text-sm">
                  <thead className="bg-neutral-900/50">
                    <tr className="text-left text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                      <th className="px-3 py-2">Line</th>
                      {LINE_EDIT_FIELDS.map((field) => (
                        <th key={field.key} className="px-3 py-2">{field.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {problemDraft.line_items.map((line) => (
                      <tr key={`${problemDraft.invoice_no}-${line.line_no}`} className="align-top">
                        <td className="px-3 py-2 font-mono text-neutral-500">{line.line_no}</td>
                        {LINE_EDIT_FIELDS.map((field) => (
                          <td key={`${line.line_no}-${field.key}`} className="px-3 py-2">
                            <input
                              type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
                              step={field.type === "number" ? "0.01" : undefined}
                              value={line.updates[field.key] || ""}
                              onChange={(e) => updateProblemLineField(line.line_no, field.key, e.target.value)}
                              className="w-full min-w-[120px] rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-2 text-sm text-neutral-100 outline-none transition focus:border-violet-500/50"
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
