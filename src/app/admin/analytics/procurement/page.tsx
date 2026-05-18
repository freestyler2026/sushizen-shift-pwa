"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart2, RefreshCw } from "lucide-react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi, type City } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";
import { fmtNum } from "@/lib/formatters";
import {
  GLASS_CARD,
  STATUS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  KPI_CARD,
  T_PAGE_TITLE,
  T_BODY,
  BADGE_ERROR,
  BADGE_INFO,
  BADGE_SUCCESS,
  BADGE_WARNING,
} from "@/lib/ui-tokens";
import ItemSearchInput, { type ProcurementItemSearchRow } from "@/components/procurement/ItemSearchInput";
import SupplierSearchInput from "@/components/procurement/SupplierSearchInput";
import DateRangePicker from "@/components/DateRangePicker";
import { cardVariants, pageVariants, staggerContainerVariants, tabContentTransition } from "@/lib/motion-tokens";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { FlashValue } from "@/components/ui/FlashValue";

const PAGE_SHELL = "min-h-screen text-white";
const PAGE_CONTAINER = "mx-auto flex min-h-screen max-w-7xl flex-col justify-center px-6 py-10";
const PAGE_CARD = GLASS_CARD + " rounded-3xl p-8";

type SyncJob = {
  id: string;
  market: string;
  source_name: string;
  source_file_id: string;
  source_file_hash: string;
  requested_by: string;
  status: string;
  result_json?: Record<string, any>;
  error_message?: string;
  started_at?: string;
  finished_at?: string;
  created_at?: string;
  updated_at?: string;
};

type OverviewPayload = {
  ok: boolean;
  market: string;
  summary: {
    invoice_count: number;
    line_count: number;
    supplier_count: number;
    grand_total: number;
    vat_total: number;
    excise_total: number;
    latest_invoice_date: string;
  };
  supplier_rows: Array<{
    supplier_name: string;
    invoice_count: number;
    spend_total: number;
    latest_invoice_date: string;
  }>;
  item_rows: Array<{
    item_description: string;
    invoice_count: number;
    quantity_total: number;
    spend_total: number;
    currency: string;
    latest_invoice_date: string;
  }>;
  monthly_rows: Array<{
    month_key: string;
    spend_total: number;
    vat_total: number;
    excise_total: number;
    invoice_count: number;
  }>;
  price_change_rows: Array<{
    supplier_name: string;
    item_description: string;
    invoice_date: string;
    unit_price: number;
    prev_unit_price: number;
    pct_change: number;
    unit: string;
    currency: string;
  }>;
  benchmark_rows: Array<{
    supplier_name: string;
    item_description: string;
    unit_price: number;
    unit: string;
    currency: string;
    invoice_date: string;
  }>;
  recent_invoices: Array<{
    invoice_no: string;
    invoice_date: string;
    due_date: string;
    supplier_name: string;
    grand_total: number;
    currency: string;
    po_number: string;
  }>;
};

type ItemHistoryPayload = {
  ok: boolean;
  market: string;
  item_description: string;
  supplier_name: string;
  summary: {
    point_count: number;
    latest_unit_price: number;
    previous_unit_price: number;
    delta_unit_price: number;
    pct_change: number;
    latest_invoice_date: string;
    latest_invoice_no: string;
    currency: string;
    unit: string;
    suppliers: string[];
  };
  rows: Array<{
    market: string;
    item_description: string;
    supplier_name: string;
    invoice_date: string;
    unit_price: number;
    prev_unit_price: number;
    pct_change: number;
    unit: string;
    currency: string;
    invoice_no: string;
  }>;
};

type InvoiceDetailPayload = {
  ok: boolean;
  market: string;
  invoice_no: string;
  summary: {
    market: string;
    invoice_no: string;
    invoice_date: string;
    due_date: string;
    supplier_name: string;
    supplier_code: string;
    tin: string;
    excise_trn: string;
    payment_terms: string;
    currency: string;
    net_amount: number;
    vat_amount: number;
    excise_amount: number;
    other_charges: number;
    discount: number;
    grand_total: number;
    po_number: string;
    delivery_date: string;
    prepared_by: string;
    approved_by: string;
    notes: string;
    updated_at: string;
  };
  line_items: Array<{
    invoice_no: string;
    line_no: number;
    item_description: string;
    item_code: string;
    quantity: number;
    unit: string;
    unit_price: number;
    amount: number;
    currency: string;
    supplier_name: string;
  }>;
};

type AnalyticsPoRow = {
  id: string;
  request_id: string;
  po_no: string;
  vendor_name: string;
  amount: number;
  status: string;
  market: string;
  store_code: string;
  request_date: string;
  delivery_date: string;
  created_at: string;
};

type PoComparePayload = {
  ok: boolean;
  market: string;
  po_no: string;
  po: {
    po_no: string;
    vendor_name: string;
    amount: number;
    delivery_date: string;
    status: string;
    store_code: string;
    request_date: string;
    line_items_json: Array<Record<string, any>>;
  };
  invoice_summaries: Array<{
    invoice_no: string;
    invoice_date: string;
    due_date: string;
    supplier_name: string;
    currency: string;
    grand_total: number;
  }>;
  comparison_rows: Array<{
    row_no: number;
    item_name: string;
    category: string;
    po_qty: number;
    po_unit: string;
    po_unit_price: number;
    po_line_total: number;
    invoice_qty: number;
    invoice_unit: string;
    invoice_unit_price: number | null;
    invoice_amount: number;
    qty_delta: number;
    amount_delta: number;
    matched_invoice_numbers: string[];
    matched_suppliers: string[];
  }>;
  unmatched_invoice_rows: Array<{
    invoice_no: string;
    item_description: string;
    quantity: number;
    unit: string;
    unit_price: number;
    amount: number;
    currency: string;
  }>;
};

function fmtAmount(value: number, currency: string) {
  return `${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency || ""}`.trim();
}

function fmtDate(value: string) {
  return value ? String(value).slice(0, 10) : "-";
}

function fmtPct(value: number) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function MetricValue({
  value,
  className,
}: {
  value: string | number;
  className: string;
}) {
  const text = typeof value === "number" && Number.isFinite(value) ? fmtNum(value) : String(value ?? "-");
  return <FlashValue value={text} className={className} title={text} />;
}

function syncJobBadgeClass(status: string) {
  const normalized = String(status || "").trim().toUpperCase();
  if (normalized === "COMPLETED" || normalized === "COMPLETED_WITH_WARNINGS") return BADGE_SUCCESS;
  if (normalized === "FAILED") return BADGE_ERROR;
  if (normalized === "RUNNING" || normalized === "SYNCING" || normalized === "LOADING") return BADGE_INFO;
  return BADGE_WARNING;
}

function deltaColorClass(value: number) {
  if (value > 0) return "text-emerald-400";
  if (value < 0) return "text-red-400";
  return "text-zinc-500";
}

function jobStatus(job: SyncJob) {
  return String(job.status || "").trim().toUpperCase();
}

function jobSortTime(job: SyncJob) {
  const raw = job.updated_at || job.finished_at || job.created_at || "";
  const millis = Date.parse(String(raw || ""));
  return Number.isFinite(millis) ? millis : 0;
}

function effectiveSyncJobs(rows: SyncJob[]) {
  const sorted = [...rows].sort((a, b) => jobSortTime(b) - jobSortTime(a));
  return sorted.filter((job, index) => {
    if (jobStatus(job) !== "FAILED") return true;
    const newerRecovery = sorted.slice(0, index).some((candidate) => {
      const status = jobStatus(candidate);
      if (status !== "COMPLETED" && status !== "COMPLETED_WITH_WARNINGS") return false;
      if (candidate.market !== job.market) return false;
      return true;
    });
    return !newerRecovery;
  });
}

function normalizeProcurementAnalyticsError(raw: string) {
  const text = String(raw || "").trim();
  const lower = text.toLowerCase();
  if (!text) return "Unable to load procurement analytics.";
  if (lower.includes("accessnotconfigured") || lower.includes("google sheets api has not been used")) {
    return "Supplier invoice sync is blocked because the Google Sheets API is not enabled for the configured service account project. Please enable the Sheets API for that Google Cloud project, then retry.";
  }
  if (lower.includes("google drive api has not been used")) {
    return "Supplier invoice sync is blocked because the configured service account project is trying to read spreadsheet data through Google Drive instead of Sheets. The backend is being updated to use the spreadsheet API directly.";
  }
  if (lower.includes("403 when requesting") || lower.includes("googleapiclient.errors.httperror 403")) {
    return "Supplier invoice sync was rejected by the Google spreadsheet service account integration. Please check the project permissions and API enablement, then retry.";
  }
  return text;
}

const KPI_VALUE_CLASS = "mt-1 text-2xl font-bold leading-tight tracking-tight text-white tabular-nums break-words";
const SUB_KPI_VALUE_CLASS = "mt-2 text-xl font-bold leading-tight tracking-tight text-white tabular-nums break-words";

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function isoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultLast30DaysRange() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const from = new Date(today);
  from.setDate(from.getDate() - 29);
  return { from: isoDate(from), to: isoDate(today) };
}

export default function ProcurementAnalyticsSection() {
  const auth = useMemo(() => getAuth(), []);
  const router = useRouter();
  const pathname = usePathname();
  const defaultRange = useMemo(() => defaultLast30DaysRange(), []);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [authRole, setAuthRole] = useState(String(auth?.role || ""));
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [market, setMarket] = useState<City>((auth?.city || "manila").toLowerCase() === "dubai" ? "dubai" : "manila");
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);
  const [supplierName, setSupplierName] = useState("");
  const [itemQuery, setItemQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<ProcurementItemSearchRow | null>(null);
  const [poDateFrom, setPoDateFrom] = useState("");
  const [poDateTo, setPoDateTo] = useState("");
  const [selectedPoNo, setSelectedPoNo] = useState("");
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [poRows, setPoRows] = useState<AnalyticsPoRow[]>([]);
  const [itemHistory, setItemHistory] = useState<ItemHistoryPayload | null>(null);
  const [invoiceDetail, setInvoiceDetail] = useState<InvoiceDetailPayload | null>(null);
  const [poCompare, setPoCompare] = useState<PoComparePayload | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [poLoading, setPoLoading] = useState(false);
  const [invoiceLoading, setInvoiceLoading] = useState("");
  const [poCompareLoading, setPoCompareLoading] = useState(false);
  const [error, setError] = useState("");

  const currency = market === "dubai" ? "AED" : "PHP";
  const marketAllowed = canAccessProcurementAdmin(authRole, market);
  const isLegacyStandaloneRoute = pathname === "/admin/analytics/procurement";

  const load = useCallback(async () => {
    if (!marketAllowed) {
      setOverview(null);
      setJobs([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ market, limit: "30" });
      if (dateFrom.trim()) qs.set("date_from", dateFrom.trim());
      if (dateTo.trim()) qs.set("date_to", dateTo.trim());
      if (supplierName.trim()) qs.set("supplier_name", supplierName.trim());
      const [overviewRes, jobsRes] = await Promise.all([
        procurementJson<OverviewPayload>(
          `/api/admin/procurement/analytics/supplier-invoices/overview?${qs.toString()}`,
          { method: "GET" },
          requestedBy,
          pin,
        ),
        procurementJson<{ ok: boolean; rows: SyncJob[] }>(
          `/api/admin/procurement/analytics/supplier-invoices/sync-jobs?market=${encodeURIComponent(market)}&limit=10`,
          { method: "GET" },
          requestedBy,
          pin,
        ),
      ]);
      setOverview(overviewRes ?? null);
      setJobs(Array.isArray(jobsRes?.rows) ? jobsRes.rows : []);
    } catch (e: any) {
      setError(normalizeProcurementAnalyticsError(e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, market, marketAllowed, pin, requestedBy, supplierName]);

  const loadPoRows = useCallback(async () => {
    if (!marketAllowed) {
      setPoRows([]);
      return;
    }
    setPoLoading(true);
    try {
      const qs = new URLSearchParams({ market, limit: "50" });
      if (poDateFrom.trim()) qs.set("date_from", poDateFrom.trim());
      if (poDateTo.trim()) qs.set("date_to", poDateTo.trim());
      const res = await procurementJson<{ ok: boolean; rows: AnalyticsPoRow[] }>(
        `/api/admin/procurement/analytics/supplier-invoices/po-list?${qs.toString()}`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      setPoRows(Array.isArray(res?.rows) ? res.rows : []);
    } catch (e: any) {
      setError(normalizeProcurementAnalyticsError(e?.message || String(e)));
      setPoRows([]);
    } finally {
      setPoLoading(false);
    }
  }, [market, marketAllowed, pin, poDateFrom, poDateTo, requestedBy]);

  const loadInvoiceDetail = useCallback(
    async (invoiceNo: string) => {
      const target = String(invoiceNo || "").trim();
      if (!target) return;
      if (!marketAllowed) {
        setInvoiceDetail(null);
        return;
      }
      setInvoiceLoading(target);
      try {
        const res = await procurementJson<InvoiceDetailPayload>(
          `/api/admin/procurement/analytics/supplier-invoices/invoices/${encodeURIComponent(target)}?market=${encodeURIComponent(market)}`,
          { method: "GET" },
          requestedBy,
          pin,
        );
        setInvoiceDetail(res ?? null);
      } catch (e: any) {
        setError(normalizeProcurementAnalyticsError(e?.message || String(e)));
      } finally {
        setInvoiceLoading("");
      }
    },
    [market, marketAllowed, pin, requestedBy],
  );

  const loadPoCompare = useCallback(
    async (poNo: string) => {
      const target = String(poNo || "").trim();
      if (!target) {
        setPoCompare(null);
        return;
      }
      if (!marketAllowed) {
        setPoCompare(null);
        return;
      }
      setPoCompareLoading(true);
      try {
        const res = await procurementJson<PoComparePayload>(
          `/api/admin/procurement/analytics/supplier-invoices/po-compare/${encodeURIComponent(target)}?market=${encodeURIComponent(market)}`,
          { method: "GET" },
          requestedBy,
          pin,
        );
        setPoCompare(res ?? null);
      } catch (e: any) {
        setError(normalizeProcurementAnalyticsError(e?.message || String(e)));
        setPoCompare(null);
      } finally {
        setPoCompareLoading(false);
      }
    },
    [market, marketAllowed, pin, requestedBy],
  );

  const startSync = useCallback(async () => {
    if (!marketAllowed) {
      setError("You do not have permission to access this data.");
      return;
    }
    setSyncing(true);
    setError("");
    try {
      const queued = await procurementJson<{ ok: boolean; job: SyncJob }>(
        `/api/admin/procurement/analytics/supplier-invoices/sync`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            market,
            approver_name: requestedBy,
            pin,
          }),
        },
        requestedBy,
        pin,
      );
      const jobId = String(queued?.job?.id || "");
      if (!jobId) throw new Error("Sync job was not created.");
      for (let i = 0; i < 30; i += 1) {
        await sleep(2000);
        const polled = await procurementJson<{ ok: boolean; job: SyncJob }>(
          `/api/admin/procurement/analytics/supplier-invoices/sync-jobs/${encodeURIComponent(jobId)}`,
          { method: "GET" },
          requestedBy,
          pin,
        );
        const nextJob = polled?.job || null;
        if (nextJob) {
          setJobs((prev) => [nextJob, ...prev.filter((row) => row.id !== nextJob.id)].slice(0, 10));
          const status = String(nextJob.status || "").toUpperCase();
          if (status === "COMPLETED" || status === "COMPLETED_WITH_WARNINGS") break;
          if (status === "FAILED") throw new Error(normalizeProcurementAnalyticsError(nextJob.error_message || "Sync failed."));
        }
      }
      await Promise.all([load(), loadPoRows()]);
    } catch (e: any) {
      setError(normalizeProcurementAnalyticsError(e?.message || String(e)));
    } finally {
      setSyncing(false);
    }
  }, [load, loadPoRows, market, marketAllowed, pin, requestedBy]);

  useEffect(() => {
    if (isLegacyStandaloneRoute) {
      router.replace("/admin/analytics?tab=procurement");
    }
  }, [isLegacyStandaloneRoute, router]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      if (cancelled) return;
      const role = String((refreshed || auth)?.role || "");
      setAuthRole(role);
      const canAny = canAccessProcurementAdmin(role, "manila") || canAccessProcurementAdmin(role, "dubai");
      setAllowed(canAny);
      setReady(true);
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [auth]);

  useEffect(() => {
    if (!allowed || !marketAllowed) {
      setOverview(null);
      setJobs([]);
      setPoRows([]);
      setItemHistory(null);
      setInvoiceDetail(null);
      setPoCompare(null);
      return;
    }
    void load();
    void loadPoRows();
  }, [allowed, load, loadPoRows, marketAllowed]);

  useEffect(() => {
    const targetItem = selectedItem?.item_description || itemQuery.trim();
    if (!targetItem) {
      setItemHistory(null);
      return;
    }
    if (!marketAllowed) {
      setItemHistory(null);
      return;
    }
    let cancelled = false;
    async function run() {
      setHistoryLoading(true);
      try {
        const qs = new URLSearchParams({
          market,
          item_description: targetItem,
          limit: "120",
        });
        if (dateFrom.trim()) qs.set("date_from", dateFrom.trim());
        if (dateTo.trim()) qs.set("date_to", dateTo.trim());
        if (supplierName.trim()) qs.set("supplier_name", supplierName.trim());
        const res = await procurementJson<ItemHistoryPayload>(
          `/api/admin/procurement/analytics/supplier-invoices/item-history?${qs.toString()}`,
          { method: "GET" },
          requestedBy,
          pin,
        );
        if (!cancelled) setItemHistory(res ?? null);
      } catch (e: any) {
        if (!cancelled) {
          setError(normalizeProcurementAnalyticsError(e?.message || String(e)));
          setItemHistory(null);
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [dateFrom, dateTo, itemQuery, market, marketAllowed, pin, requestedBy, selectedItem, supplierName]);

  useEffect(() => {
    if (!selectedPoNo.trim()) {
      setPoCompare(null);
      return;
    }
    void loadPoCompare(selectedPoNo);
  }, [loadPoCompare, selectedPoNo]);

  useEffect(() => {
    if (selectedPoNo && !poRows.some((row) => row.po_no === selectedPoNo)) {
      setSelectedPoNo("");
      setPoCompare(null);
    }
  }, [poRows, selectedPoNo]);

  const visibleJobs = useMemo(() => effectiveSyncJobs(jobs), [jobs]);

  if (!ready) {
    return (
      <main className={PAGE_SHELL}>
        <div className={PAGE_CONTAINER}>
          <div className={PAGE_CARD}>
            <div className="flex justify-center py-8"><Spinner /></div>
          </div>
        </div>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className={PAGE_SHELL}>
        <div className={PAGE_CONTAINER}>
          <div className={PAGE_CARD}>
            <div className="py-8 text-center text-sm text-red-300">Procurement analytics are available only to authorized procurement admin roles.</div>
          </div>
        </div>
      </main>
    );
  }

  if (!marketAllowed) {
    return (
      <main className={PAGE_SHELL}>
        <div className={PAGE_CONTAINER}>
          <div className={PAGE_CARD}>
            <div className="py-8 text-center text-sm text-red-300">You do not have permission to access this data.</div>
          </div>
        </div>
      </main>
    );
  }

  const summary = overview?.summary;
  const itemSummary = itemHistory?.summary;
  const chartRows = (itemHistory?.rows || []).map((row) => ({
    date: fmtDate(row.invoice_date),
    unit_price: Number(row.unit_price || 0),
    supplier_name: row.supplier_name || "-",
    currency: row.currency || currency,
  }));

  if (isLegacyStandaloneRoute) {
    return (
      <main className={PAGE_SHELL}>
        <div className={PAGE_CONTAINER}>
          <div className={PAGE_CARD}>
            <div className="flex justify-center py-8"><Spinner /></div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <motion.div
      className="mt-8 space-y-4"
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      key={market}
    >
      <motion.div
        className={GLASS_CARD + " p-5"}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={tabContentTransition}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-violet-400" />
              <h2 className={T_PAGE_TITLE}>Procurement Analytics</h2>
            </div>
            <div className={T_BODY}>Supplier invoice ingestion, price movement tracking, supplier spend visibility, invoice drill-down, and PO comparison inside the Analytics channel.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <motion.button
              type="button"
              onClick={() => void startSync()}
              disabled={syncing}
              className={PRIMARY_BUTTON + " flex items-center gap-2 text-xs"}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.15 }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {syncing ? "Syncing..." : "Sync Supplier Invoices"}
            </motion.button>
          </div>
        </div>
        {error ? (
          <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/15 px-5 py-2.5 text-sm text-red-400">
            {error}
          </div>
        ) : null}
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Approver name" className={INPUT_CLASS} />
          <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" className={INPUT_CLASS} />
          <select value={market} onChange={(e) => setMarket(String(e.target.value || "manila").toLowerCase() === "dubai" ? "dubai" : "manila")} className={SELECT_CLASS}>
            <option value="manila">Manila</option>
            <option value="dubai">Dubai</option>
          </select>
          <DateRangePicker
            value={{ from: dateFrom, to: dateTo }}
            onChange={(range) => {
              setDateFrom(range.from);
              setDateTo(range.to);
            }}
            className="md:col-span-2"
          />
          <SupplierSearchInput
            market={market}
            requestedBy={requestedBy}
            pin={pin}
            value={supplierName}
            onValueChange={(value) => setSupplierName(value)}
            onSelect={(supplier) => setSupplierName(supplier.supplier_name || "")}
            placeholder="Supplier filter"
          />
          <div className="flex gap-2">
            <motion.button
              type="button"
              onClick={() => void Promise.all([load(), loadPoRows()])}
              disabled={loading || poLoading}
              className={PRIMARY_BUTTON + " flex flex-1 items-center justify-center gap-2 text-sm"}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.15 }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {loading || poLoading ? <span className="inline-flex items-center gap-2"><Spinner size="sm" /> Loading...</span> : "Refresh"}
            </motion.button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <ItemSearchInput
            market={market}
            requestedBy={requestedBy}
            pin={pin}
            value={itemQuery}
            onValueChange={(value) => {
              setItemQuery(value);
              if (!value.trim()) setSelectedItem(null);
            }}
            onSelect={(item) => {
              setSelectedItem(item);
              setItemQuery(item.item_description || "");
            }}
            placeholder="Search item for price history"
          />
          <motion.button
            type="button"
            onClick={() => {
              setItemQuery("");
              setSelectedItem(null);
              setItemHistory(null);
            }}
            className={SECONDARY_BUTTON + " text-sm"}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.15 }}
          >
            Clear Item
          </motion.button>
        </div>
      </motion.div>

      <div className="my-8 border-t border-white/5" />

      <motion.div
        className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6"
        variants={staggerContainerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div className={KPI_CARD} variants={cardVariants}>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">Total Spend</div>
          <MetricValue className={KPI_VALUE_CLASS} value={fmtAmount(summary?.grand_total || 0, currency)} />
        </motion.div>
        <motion.div className={KPI_CARD} variants={cardVariants}>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">Invoices</div>
          <MetricValue className={KPI_VALUE_CLASS} value={Number(summary?.invoice_count || 0)} />
        </motion.div>
        <motion.div className={KPI_CARD} variants={cardVariants}>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">Line Items</div>
          <MetricValue className={KPI_VALUE_CLASS} value={Number(summary?.line_count || 0)} />
        </motion.div>
        <motion.div className={KPI_CARD} variants={cardVariants}>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">Suppliers</div>
          <MetricValue className={KPI_VALUE_CLASS} value={Number(summary?.supplier_count || 0)} />
        </motion.div>
        <motion.div className={KPI_CARD} variants={cardVariants}>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">VAT</div>
          <MetricValue className={KPI_VALUE_CLASS} value={fmtAmount(summary?.vat_total || 0, currency)} />
        </motion.div>
        <motion.div className={KPI_CARD} variants={cardVariants}>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">Excise</div>
          <MetricValue className={KPI_VALUE_CLASS} value={fmtAmount(summary?.excise_total || 0, currency)} />
        </motion.div>
      </motion.div>

      <div className="my-8 border-t border-white/5" />

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-black/20 backdrop-blur-sm">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-base font-semibold text-white">Item Price Trend</div>
            <div className="mt-1 text-sm leading-relaxed text-zinc-400">{selectedItem?.item_description || itemQuery.trim() || "Search and select an item to load price history."}</div>
          </div>
          {historyLoading ? <div className={BADGE_INFO}><Spinner size="sm" /> Loading history...</div> : null}
        </div>
        <motion.div
          className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5"
          variants={staggerContainerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div className={STATUS_CARD} variants={cardVariants}>
            <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">Latest Price</div>
            <MetricValue className={SUB_KPI_VALUE_CLASS} value={fmtAmount(itemSummary?.latest_unit_price || 0, itemSummary?.currency || currency)} />
          </motion.div>
          <motion.div className={STATUS_CARD} variants={cardVariants}>
            <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">Previous Price</div>
            <MetricValue className={SUB_KPI_VALUE_CLASS} value={fmtAmount(itemSummary?.previous_unit_price || 0, itemSummary?.currency || currency)} />
          </motion.div>
          <motion.div className={STATUS_CARD} variants={cardVariants}>
            <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">Delta</div>
            <div className={`mt-2 text-sm font-medium ${deltaColorClass(Number(itemSummary?.delta_unit_price || 0))}`}>
              {fmtAmount(itemSummary?.delta_unit_price || 0, itemSummary?.currency || currency)}
            </div>
          </motion.div>
          <motion.div className={STATUS_CARD} variants={cardVariants}>
            <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">% Change</div>
            <div className={`mt-2 text-sm font-medium ${deltaColorClass(Number(itemSummary?.pct_change || 0))}`}>{fmtPct(itemSummary?.pct_change || 0)}</div>
          </motion.div>
          <motion.div className={STATUS_CARD} variants={cardVariants}>
            <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">Latest Invoice</div>
            <div className="mt-2 text-base font-semibold text-white">{itemSummary?.latest_invoice_no || "-"}</div>
            <div className="mt-1 text-xs text-zinc-500">{fmtDate(itemSummary?.latest_invoice_date || "")}</div>
          </motion.div>
        </motion.div>
        <div className="mt-4 h-72 rounded-2xl border border-white/10 bg-gradient-to-br from-white/8 to-white/3 p-3 shadow-lg shadow-black/30 backdrop-blur-sm">
          {chartRows.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartRows}>
                <CartesianGrid stroke="#262626" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="#a3a3a3" tick={{ fontSize: 12 }} />
                <YAxis stroke="#a3a3a3" tick={{ fontSize: 12 }} width={80} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0a0a0a",
                    border: "1px solid #262626",
                    borderRadius: "0.75rem",
                    color: "#fafafa",
                  }}
                />
                <Line type="monotone" dataKey="unit_price" stroke="#34d399" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-neutral-500">Select an imported item to see price history.</div>
          )}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-white/5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Supplier</th>
                <th className="px-2 py-2">Price</th>
                <th className="px-2 py-2">Prev</th>
                <th className="px-2 py-2">% Change</th>
                <th className="px-2 py-2">Invoice</th>
              </tr>
            </thead>
            <tbody>
              {(itemHistory?.rows || []).map((row, idx) => (
                <tr key={`${row.invoice_no}-${idx}`} className="cursor-default border-t border-white/5 transition-colors duration-150 hover:bg-white/6">
                  <td className="px-2 py-2">{fmtDate(row.invoice_date)}</td>
                  <td className="px-2 py-2">{row.supplier_name || "-"}</td>
                  <td className="px-2 py-2">{fmtAmount(row.unit_price || 0, row.currency || currency)}</td>
                  <td className="px-2 py-2">{fmtAmount(row.prev_unit_price || 0, row.currency || currency)}</td>
                  <td className={`px-2 py-2 ${deltaColorClass(Number(row.pct_change || 0))}`}>{fmtPct(row.pct_change || 0)}</td>
                  <td className="px-2 py-2">
                    <button type="button" onClick={() => void loadInvoiceDetail(row.invoice_no)} className="text-cyan-200 hover:text-white">
                      {row.invoice_no || "-"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!itemHistory?.rows?.length ? <EmptyState message="No item price history rows yet." /> : null}
        </div>
      </div>

      <div className="my-8 border-t border-white/5" />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-black/20 backdrop-blur-sm">
          <div className="text-base font-semibold text-white">Recent Sync Jobs</div>
          <div className="mt-3 space-y-2 text-sm">
            {visibleJobs.map((job) => (
              <div key={job.id} className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/8 to-white/3 p-3 shadow-lg shadow-black/30 backdrop-blur-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className={syncJobBadgeClass(job.status)}>{job.market.toUpperCase()} · {job.status}</div>
                  <div className="text-xs text-neutral-500">{fmtDate(job.created_at || "")}</div>
                </div>
                <div className="mt-1 text-xs text-neutral-400">{job.source_name || "-"}</div>
                {job.result_json?.skipped ? <div className={`mt-1 ${BADGE_WARNING}`}>Skipped: {String(job.result_json.reason || "duplicate content was already synced.")}</div> : null}
                {job.error_message ? <div className={`mt-1 ${BADGE_ERROR}`}>{normalizeProcurementAnalyticsError(job.error_message)}</div> : null}
              </div>
            ))}
            {!visibleJobs.length ? <EmptyState message="No sync jobs yet." /> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-black/20 backdrop-blur-sm">
          <div className="text-base font-semibold text-white">Monthly Spend</div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-white/5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-2 py-2">Month</th>
                  <th className="px-2 py-2">Invoices</th>
                  <th className="px-2 py-2">Spend</th>
                  <th className="px-2 py-2">VAT</th>
                  <th className="px-2 py-2">Excise</th>
                </tr>
              </thead>
              <tbody>
                {(overview?.monthly_rows || []).map((row) => (
                  <tr key={row.month_key} className="cursor-default border-t border-white/5 transition-colors duration-150 hover:bg-white/6">
                    <td className="px-2 py-2">{row.month_key || "-"}</td>
                    <td className="px-2 py-2">{Number(row.invoice_count || 0).toLocaleString()}</td>
                    <td className="px-2 py-2">{fmtAmount(row.spend_total || 0, currency)}</td>
                    <td className="px-2 py-2">{fmtAmount(row.vat_total || 0, currency)}</td>
                    <td className="px-2 py-2">{fmtAmount(row.excise_total || 0, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!overview?.monthly_rows?.length ? <EmptyState message="No monthly spend rows." /> : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-black/20 backdrop-blur-sm">
          <div className="text-base font-semibold text-white">Top 30 Items By Spend</div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-white/5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-2 py-2">Rank</th>
                  <th className="px-2 py-2">Item</th>
                  <th className="px-2 py-2">Invoices</th>
                  <th className="px-2 py-2">Qty</th>
                  <th className="px-2 py-2">Spend</th>
                  <th className="px-2 py-2">Latest</th>
                </tr>
              </thead>
              <tbody>
                {(overview?.item_rows || []).map((row, idx) => (
                  <tr key={`${row.item_description}-${idx}`} className="cursor-default border-t border-white/5 transition-colors duration-150 hover:bg-white/6">
                    <td className="px-2 py-2">{idx + 1}</td>
                    <td className="px-2 py-2">{row.item_description || "-"}</td>
                    <td className="px-2 py-2">{Number(row.invoice_count || 0).toLocaleString()}</td>
                    <td className="px-2 py-2">{Number(row.quantity_total || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    <td className="px-2 py-2">{fmtAmount(row.spend_total || 0, row.currency || currency)}</td>
                    <td className="px-2 py-2">{fmtDate(row.latest_invoice_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!overview?.item_rows?.length ? <EmptyState message="No item spend rows." /> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-black/20 backdrop-blur-sm">
          <div className="text-base font-semibold text-white">Supplier Purchase Ranking</div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-white/5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-2 py-2">Rank</th>
                  <th className="px-2 py-2">Supplier</th>
                  <th className="px-2 py-2">Invoices</th>
                  <th className="px-2 py-2">Spend</th>
                  <th className="px-2 py-2">Latest</th>
                </tr>
              </thead>
              <tbody>
                {(overview?.supplier_rows || []).map((row, idx) => (
                  <tr key={`${row.supplier_name}-${idx}`} className="cursor-default border-t border-white/5 transition-colors duration-150 hover:bg-white/6">
                    <td className="px-2 py-2">{idx + 1}</td>
                    <td className="px-2 py-2">{row.supplier_name || "-"}</td>
                    <td className="px-2 py-2">{Number(row.invoice_count || 0).toLocaleString()}</td>
                    <td className="px-2 py-2">{fmtAmount(row.spend_total || 0, currency)}</td>
                    <td className="px-2 py-2">{fmtDate(row.latest_invoice_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!overview?.supplier_rows?.length ? <EmptyState message="No supplier spend rows." /> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-black/20 backdrop-blur-sm">
          <div className="text-sm font-medium">Recent Price Changes</div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-white/5 text-xs uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="px-2 py-2">Item</th>
                  <th className="px-2 py-2">Supplier</th>
                  <th className="px-2 py-2">Now</th>
                  <th className="px-2 py-2">Prev</th>
                  <th className="px-2 py-2">% Change</th>
                </tr>
              </thead>
              <tbody>
                {(overview?.price_change_rows || []).map((row, idx) => (
                  <tr key={`${row.item_description}-${idx}`} className="cursor-default border-t border-white/5 transition-colors duration-150 hover:bg-white/6">
                    <td className="px-2 py-2">{row.item_description || "-"}</td>
                    <td className="px-2 py-2">{row.supplier_name || "-"}</td>
                    <td className="px-2 py-2">{fmtAmount(row.unit_price || 0, row.currency || currency)}</td>
                    <td className="px-2 py-2">{fmtAmount(row.prev_unit_price || 0, row.currency || currency)}</td>
                    <td className={`px-2 py-2 ${Number(row.pct_change || 0) >= 0 ? "text-rose-300" : "text-emerald-300"}`}>{fmtPct(row.pct_change || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!overview?.price_change_rows?.length ? <EmptyState message="No price change rows." /> : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-black/20 backdrop-blur-sm">
          <div className="text-sm font-medium">Benchmark Cheapest Supplier</div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-white/5 text-xs uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="px-2 py-2">Item</th>
                  <th className="px-2 py-2">Supplier</th>
                  <th className="px-2 py-2">Price</th>
                  <th className="px-2 py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {(overview?.benchmark_rows || []).map((row, idx) => (
                  <tr key={`${row.item_description}-${idx}`} className="cursor-default border-t border-white/5 transition-colors duration-150 hover:bg-white/6">
                    <td className="px-2 py-2">{row.item_description || "-"}</td>
                    <td className="px-2 py-2">{row.supplier_name || "-"}</td>
                    <td className="px-2 py-2">{fmtAmount(row.unit_price || 0, row.currency || currency)}</td>
                    <td className="px-2 py-2">{fmtDate(row.invoice_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!overview?.benchmark_rows?.length ? <EmptyState message="No benchmark rows." /> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-black/20 backdrop-blur-sm">
          <div className="text-sm font-medium">Recent Invoices</div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-white/5 text-xs uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="px-2 py-2">Invoice</th>
                  <th className="px-2 py-2">Supplier</th>
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Due</th>
                  <th className="px-2 py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {(overview?.recent_invoices || []).map((row, idx) => (
                  <tr key={`${row.invoice_no}-${idx}`} className="cursor-default border-t border-white/5 transition-colors duration-150 hover:bg-white/6">
                    <td className="px-2 py-2">
                      <button type="button" onClick={() => void loadInvoiceDetail(row.invoice_no)} className="text-cyan-200 hover:text-white">
                        {invoiceLoading === row.invoice_no ? "Loading..." : row.invoice_no || "-"}
                      </button>
                    </td>
                    <td className="px-2 py-2">{row.supplier_name || "-"}</td>
                    <td className="px-2 py-2">{fmtDate(row.invoice_date)}</td>
                    <td className="px-2 py-2">{fmtDate(row.due_date)}</td>
                    <td className="px-2 py-2">{fmtAmount(row.grand_total || 0, row.currency || currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!overview?.recent_invoices?.length ? <EmptyState message="No recent invoices." /> : null}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-black/20 backdrop-blur-sm">
        <div className="text-sm font-medium">Invoice Detail</div>
        {!invoiceDetail ? (
          <EmptyState message="Select an invoice from Recent Invoices or Item Price Trend to inspect its contents." />
        ) : (
          <div className="mt-3 space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/8 to-white/3 p-3 shadow-lg shadow-black/30 backdrop-blur-sm">
                <div className="text-xs text-neutral-400">Invoice</div>
                <div className="mt-2 text-sm font-semibold">{invoiceDetail.summary?.invoice_no || invoiceDetail.invoice_no}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/8 to-white/3 p-3 shadow-lg shadow-black/30 backdrop-blur-sm">
                <div className="text-xs text-neutral-400">Supplier</div>
                <div className="mt-2 text-sm font-semibold">{invoiceDetail.summary?.supplier_name || "-"}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/8 to-white/3 p-3 shadow-lg shadow-black/30 backdrop-blur-sm">
                <div className="text-xs text-neutral-400">Date</div>
                <div className="mt-2 text-sm font-semibold">{fmtDate(invoiceDetail.summary?.invoice_date || "")}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/8 to-white/3 p-3 shadow-lg shadow-black/30 backdrop-blur-sm">
                <div className="text-xs text-neutral-400">Grand Total</div>
                <div className="mt-2 text-sm font-semibold">{fmtAmount(invoiceDetail.summary?.grand_total || 0, invoiceDetail.summary?.currency || currency)}</div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-white/5 text-xs uppercase tracking-wider text-zinc-400">
                  <tr>
                    <th className="px-2 py-2">Line</th>
                    <th className="px-2 py-2">Item</th>
                    <th className="px-2 py-2">Qty</th>
                    <th className="px-2 py-2">Unit</th>
                    <th className="px-2 py-2">Unit Price</th>
                    <th className="px-2 py-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(invoiceDetail.line_items || []).map((row, idx) => (
                    <tr key={`${row.invoice_no}-${row.line_no}-${idx}`} className="cursor-default border-t border-white/5 transition-colors duration-150 hover:bg-white/6">
                      <td className="px-2 py-2">{row.line_no || idx + 1}</td>
                      <td className="px-2 py-2">{row.item_description || "-"}</td>
                      <td className="px-2 py-2">{Number(row.quantity || 0).toLocaleString()}</td>
                      <td className="px-2 py-2">{row.unit || "-"}</td>
                      <td className="px-2 py-2">{fmtAmount(row.unit_price || 0, row.currency || currency)}</td>
                      <td className="px-2 py-2">{fmtAmount(row.amount || 0, row.currency || currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-black/20 backdrop-blur-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-sm font-medium">PO vs Invoice Comparison</div>
            <div className="mt-1 text-xs text-neutral-400">Filter procurement POs by date, then compare a selected PO against imported invoice lines.</div>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <DateRangePicker
              value={{ from: poDateFrom, to: poDateTo }}
              onChange={(range) => {
                setPoDateFrom(range.from);
                setPoDateTo(range.to);
              }}
              className="md:col-span-2"
            />
            <button type="button" onClick={() => void loadPoRows()} className="rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 px-5 py-2.5 text-sm font-semibold text-black shadow-lg shadow-violet-500/25 transition-all duration-200 hover:scale-[1.02] hover:from-violet-400 hover:to-purple-400 hover:shadow-violet-500/40 active:scale-[0.98]">
              {poLoading ? <span className="inline-flex items-center gap-2"><Spinner size="sm" /> Loading...</span> : "Load POs"}
            </button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-2">
            <select value={selectedPoNo} onChange={(e) => setSelectedPoNo(e.target.value)} className={`w-full ${SELECT_CLASS}`}>
              <option value="">Select PO</option>
              {poRows.map((row) => (
                <option key={row.id} value={row.po_no}>
                  {row.po_no} · {row.vendor_name || "-"} · {fmtDate(row.delivery_date || row.created_at || "")}
                </option>
              ))}
            </select>
            <div className="max-h-72 overflow-y-auto rounded-2xl border border-white/10 bg-gradient-to-br from-white/8 to-white/3 shadow-lg shadow-black/30 backdrop-blur-sm">
              {poRows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedPoNo(row.po_no)}
                  className={`block w-full cursor-default border-b border-white/5 px-4 py-3 text-left last:border-b-0 transition-colors duration-150 ${selectedPoNo === row.po_no ? "bg-white/8" : "hover:bg-white/6"}`}
                >
                  <div className="text-sm font-semibold">{row.po_no}</div>
                  <div className="mt-1 text-xs text-neutral-400">{[row.vendor_name || "-", fmtDate(row.delivery_date || row.created_at || ""), row.status || "-"].join(" · ")}</div>
                </button>
              ))}
              {!poRows.length ? <EmptyState message="No purchase orders found for the selected date range." /> : null}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/8 to-white/3 p-3 shadow-lg shadow-black/30 backdrop-blur-sm">
            {!selectedPoNo ? (
              <EmptyState message="Select a PO to compare it against imported invoices." />
            ) : poCompareLoading ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : !poCompare ? (
              <EmptyState message="No PO comparison data yet." />
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3 shadow-lg shadow-black/20 backdrop-blur-sm">
                    <div className="text-xs text-neutral-400">PO</div>
                    <div className="mt-2 text-sm font-semibold">{poCompare.po?.po_no || "-"}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3 shadow-lg shadow-black/20 backdrop-blur-sm">
                    <div className="text-xs text-neutral-400">Vendor</div>
                    <div className="mt-2 text-sm font-semibold">{poCompare.po?.vendor_name || "-"}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3 shadow-lg shadow-black/20 backdrop-blur-sm">
                    <div className="text-xs text-neutral-400">Delivery Date</div>
                    <div className="mt-2 text-sm font-semibold">{fmtDate(poCompare.po?.delivery_date || "")}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3 shadow-lg shadow-black/20 backdrop-blur-sm">
                    <div className="text-xs text-neutral-400">PO Amount</div>
                    <div className="mt-2 text-sm font-semibold">{fmtAmount(poCompare.po?.amount || 0, currency)}</div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <div className="mb-2 text-sm font-medium">Matched Invoices</div>
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-white/5 text-xs uppercase tracking-wider text-zinc-400">
                      <tr>
                        <th className="px-2 py-2">Invoice</th>
                        <th className="px-2 py-2">Supplier</th>
                        <th className="px-2 py-2">Date</th>
                        <th className="px-2 py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(poCompare.invoice_summaries || []).map((row, idx) => (
                        <tr key={`${row.invoice_no}-${idx}`} className="cursor-default border-t border-white/5 transition-colors duration-150 hover:bg-white/6">
                          <td className="px-2 py-2">
                            <button type="button" onClick={() => void loadInvoiceDetail(row.invoice_no)} className="text-cyan-200 hover:text-white">
                              {row.invoice_no || "-"}
                            </button>
                          </td>
                          <td className="px-2 py-2">{row.supplier_name || "-"}</td>
                          <td className="px-2 py-2">{fmtDate(row.invoice_date)}</td>
                          <td className="px-2 py-2">{fmtAmount(row.grand_total || 0, row.currency || currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!poCompare.invoice_summaries?.length ? <div className="mt-3 py-8 text-center text-sm text-zinc-500">No invoices matched this PO number yet.</div> : null}
                </div>
                <div className="overflow-x-auto">
                  <div className="mb-2 text-sm font-medium">Line Comparison</div>
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-white/5 text-xs uppercase tracking-wider text-zinc-400">
                      <tr>
                        <th className="px-2 py-2">Item</th>
                        <th className="px-2 py-2">PO Qty</th>
                        <th className="px-2 py-2">Invoice Qty</th>
                        <th className="px-2 py-2">Qty Delta</th>
                        <th className="px-2 py-2">PO Amount</th>
                        <th className="px-2 py-2">Invoice Amount</th>
                        <th className="px-2 py-2">Amount Delta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(poCompare.comparison_rows || []).map((row) => (
                        <tr key={`${row.row_no}-${row.item_name}`} className="cursor-default border-t border-white/5 transition-colors duration-150 hover:bg-white/6">
                          <td className="px-2 py-2">{row.item_name || "-"}</td>
                          <td className="px-2 py-2">{Number(row.po_qty || 0).toLocaleString()} {row.po_unit || ""}</td>
                          <td className="px-2 py-2">{Number(row.invoice_qty || 0).toLocaleString()} {row.invoice_unit || ""}</td>
                          <td className={`px-2 py-2 ${Number(row.qty_delta || 0) !== 0 ? "text-amber-200" : "text-neutral-200"}`}>{Number(row.qty_delta || 0).toLocaleString()}</td>
                          <td className="px-2 py-2">{fmtAmount(row.po_line_total || 0, currency)}</td>
                          <td className="px-2 py-2">{fmtAmount(row.invoice_amount || 0, currency)}</td>
                          <td className={`px-2 py-2 ${Number(row.amount_delta || 0) !== 0 ? "text-amber-200" : "text-neutral-200"}`}>{fmtAmount(row.amount_delta || 0, currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {poCompare.unmatched_invoice_rows?.length ? (
                  <div className="overflow-x-auto">
                    <div className="mb-2 text-sm font-medium">Unmatched Invoice Lines</div>
                    <table className="min-w-full text-left text-xs">
                      <thead className="bg-white/5 text-xs uppercase tracking-wider text-zinc-400">
                        <tr>
                          <th className="px-2 py-2">Invoice</th>
                          <th className="px-2 py-2">Item</th>
                          <th className="px-2 py-2">Qty</th>
                          <th className="px-2 py-2">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {poCompare.unmatched_invoice_rows.map((row, idx) => (
                          <tr key={`${row.invoice_no}-${idx}`} className="cursor-default border-t border-white/5 transition-colors duration-150 hover:bg-white/6">
                            <td className="px-2 py-2">{row.invoice_no || "-"}</td>
                            <td className="px-2 py-2">{row.item_description || "-"}</td>
                            <td className="px-2 py-2">{Number(row.quantity || 0).toLocaleString()} {row.unit || ""}</td>
                            <td className="px-2 py-2">{fmtAmount(row.amount || 0, row.currency || currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
