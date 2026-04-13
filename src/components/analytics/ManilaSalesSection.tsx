"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart2, CheckCircle2, CircleDot, RefreshCw } from "lucide-react";

import { getAuth, getAuthHeaders, refreshAuthFromApi, type City } from "@/lib/auth";
import { fmtNum, fmtNumTitle, formatSeconds } from "@/lib/formatters";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
  T_PAGE_TITLE,
  T_SECTION,
  T_LABEL,
  T_BODY,
  T_CAPTION,
  BADGE_ERROR,
  BADGE_SUCCESS,
  BADGE_WARNING,
} from "@/lib/ui-tokens";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { FlashValue } from "@/components/ui/FlashValue";

function getApiBase() {
  if (process.env.NODE_ENV !== "production") return "http://127.0.0.1:8000";
  return "";
}

function parseApiErrorDetail(text: string) {
  try {
    const payload = JSON.parse(text);
    return typeof payload?.detail === "string" ? payload.detail : "";
  } catch {
    return "";
  }
}

async function apiGet<T = unknown>(path: string): Promise<T> {
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
    throw new Error(detail || text || "Request failed");
  }
  return JSON.parse(text) as T;
}

async function apiPost<T = unknown>(path: string, body: unknown): Promise<T> {
  const request = async () =>
    fetch(`${getApiBase()}${path}`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify(body),
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
    throw new Error(detail || text || "Request failed");
  }
  return JSON.parse(text) as T;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function formatMoney(value: number) {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCount(value: number) {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US");
}

function formatPct(value: number) {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(2)}%`;
}

type DatasetAvailability = {
  has_data: boolean;
  import_count: number;
  supported_in_scope?: boolean;
  source_limited?: boolean;
  note?: string;
};

type ProductRow = {
  product_name: string;
  product_category: string;
  aggregator?: string;
  sku_id?: string;
  total_items_sold: number;
  total_sales: number;
  item_net_sales: number;
  gross_profit: number;
  gross_profit_pct: number;
};

type ChannelRow = {
  transaction_channel: string;
  total_sales: number;
  total_transactions: number;
  net_sales: number;
  gross_profit: number;
  gross_profit_pct: number;
};

type CategoryRow = {
  product_category: string;
  total_items_sold: number;
  total_sales: number;
  item_net_sales: number;
  gross_profit: number;
  gross_profit_pct: number;
};

type PaymentMethodRow = {
  payment_method: string;
  total_sales: number;
  total_transactions: number;
  total_sales_returned: number;
  total_items_returned: number;
  preorder_deposits: number;
  preorder_transactions: number;
  net_sales: number;
};

type DailyTrendRow = {
  sale_date: string;
  total_sales: number;
  total_net_sales: number;
  total_gross_profit: number;
};

type HourlyRow = {
  hour_of_day: number;
  order_count: number;
};

type ProductTrendRow = {
  sale_date: string;
  total_items_sold: number;
  total_sales: number;
  item_net_sales: number;
  gross_profit: number;
  gross_profit_pct: number;
};

type OverviewResp = {
  ok: boolean;
  period: { from: string; to: string };
  stores?: string[];
  active_source_systems?: string[];
  summary: {
    total_sales: number;
    total_net_sales: number;
    total_gross_profit: number;
    avg_gross_profit_pct: number;
    total_transactions: number;
  };
  top_products: ProductRow[];
  channel_breakdown: ChannelRow[];
  category_breakdown: CategoryRow[];
  payment_method_breakdown: PaymentMethodRow[];
  hourly_breakdown: HourlyRow[];
  daily_trend: DailyTrendRow[];
  dataset_availability: Record<string, DatasetAvailability>;
};

type ListResp<T> = { ok: boolean; items: T[] };

type GrabOfflineRow = {
  sale_date: string;
  store_name: string;
  grab_service: string;
  offline_minutes: number;
  scheduled_open_minutes: number;
  offline_rate_pct: number | null;
};

type GrabPeakDailyRow = {
  sale_date: string;
  hours: number[];
};

type FoodpandaOpsRow = {
  sale_date: string;
  store_name: string;
  restaurant_name?: string;
  restaurant_id?: string;
  unavailable_time?: number;
  order_rejection_rate?: number;
  orders_with_avoidable_wait_time?: number;
  average_preparation_time?: number;
  orders_with_customer_complaints?: number;
  food_is_ready?: number;
};

type SyncJobStep = {
  step: string;
  status: string;
  processed_count: number;
  duplicate_count: number;
  failed_count: number;
  message?: string;
};

type SyncJob = {
  id: string;
  status: string;
  current_step?: string;
  result?: {
    steps?: SyncJobStep[];
  };
  error_message?: string;
};

type SyncJobResp = {
  ok: boolean;
  job: SyncJob;
  message?: string;
  reused?: boolean;
};

type DiscountSummaryResp = {
  ok: boolean;
  totals: {
    total_transactions: number;
    total_sales: number;
    total_net_sales: number;
    senior_transaction_count: number;
    senior_discount_total: number;
    senior_discount_sales_pct: number;
    pwd_transaction_count: number;
    pwd_discount_total: number;
    vat_exempt_sales_total: number;
    vat_exempt_pct: number;
    employee_discount_total: number;
    total_discounts: number;
  };
};

type SeniorAnalysisResp = {
  ok: boolean;
  total_senior_transactions: number;
  total_senior_discount_amount: number;
  senior_transaction_pct: number;
  senior_discount_sales_pct: number;
  avg_senior_ticket: number;
  daily_trend: Array<{
    sale_date: string;
    senior_transaction_count: number;
    senior_discount_total: number;
    senior_sales_total: number;
  }>;
};

type PosRow = {
  sale_date: string;
  store_name?: string;
  source_system?: string;
  or_no: string;
  transaction_channel?: string;
  payment_method?: string;
  total_sales: number;
  vat_12pct: number;
  senior_discount: number;
  pwd_discount: number;
  employee_discount: number;
  vat_exempt_sales: number;
  net_sales: number;
};

type PosRowDetail = PosRow & {
  external_id?: string;
  short_id?: string;
  trx_no?: string;
  provider?: string;
  order_type?: string;
  payment_channel?: string;
  status?: string;
  delivered_at?: string;
  buyer_id_no?: string;
  buyer_name?: string;
  buyer_address?: string;
  buyer_tin?: string;
  vatable_sales?: number;
  zero_rated_sales?: number;
  athletes_coaches_discount?: number;
  medal_of_valor_discount?: number;
  source_file?: string;
};

function KpiCard({ title, value, hint, unit }: { title: string; value: number | string; hint: string; unit?: string }) {
  const isNumber = typeof value === "number" && Number.isFinite(value);
  const text = isNumber ? fmtNum(value, unit) : String(value ?? "-");
  const tooltip = isNumber ? fmtNumTitle(value, unit) : String(value ?? "-");
  return (
    <div className={KPI_CARD + " overflow-visible"}>
      <div className={KPI_LABEL + " mb-1 min-h-[32px]"}>{title}</div>
      <FlashValue value={text} className={"min-w-0 " + KPI_VALUE + " leading-none"} title={tooltip} />
      <div className={T_CAPTION + " mt-2"}>{hint}</div>
    </div>
  );
}

const MANILA_DATASET_OVERVIEW_ID = "manila-sales-dataset-overview";

const MANILA_SECTION_ID_BY_CARD_KEY: Record<string, string> = {
  product: "manila-section-product",
  channel: "manila-section-channel",
  hourly: "manila-section-hourly",
  grab_offline: "manila-section-grab-offline",
  grab_peak_hour: "manila-section-grab-peak",
  foodpanda_ops: "manila-section-panda-ops",
  category: "manila-section-category",
  payment_method: "manila-section-payment",
  pos_daily: "manila-section-pos",
};

function scrollToManilaElementId(id: string) {
  if (typeof document === "undefined") return;
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function ManilaDatasetBackButton() {
  return (
    <div className="mt-4 flex justify-end border-t border-white/5 pt-3">
      <button
        type="button"
        onClick={() => scrollToManilaElementId(MANILA_DATASET_OVERVIEW_ID)}
        className="rounded-lg px-2 py-1 text-xs font-medium text-violet-300 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60"
      >
        Back to dataset cards
      </button>
    </div>
  );
}

export function ManilaSalesSection({
  city,
  dateFrom,
  dateTo,
  approverName,
  pin,
  stepUpReady,
  active,
}: {
  city: City;
  dateFrom: string;
  dateTo: string;
  approverName: string;
  pin: string;
  stepUpReady: boolean;
  active: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [searchingPos, setSearchingPos] = useState(false);
  const [transactionLoading, setTransactionLoading] = useState(false);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState<OverviewResp | null>(null);
  const [productRows, setProductRows] = useState<ProductRow[]>([]);
  const [channelRows, setChannelRows] = useState<ChannelRow[]>([]);
  const [categoryRows, setCategoryRows] = useState<CategoryRow[]>([]);
  const [paymentMethodRows, setPaymentMethodRows] = useState<PaymentMethodRow[]>([]);
  const [discountSummary, setDiscountSummary] = useState<DiscountSummaryResp | null>(null);
  const [seniorAnalysis, setSeniorAnalysis] = useState<SeniorAnalysisResp | null>(null);
  const [grabOfflineRows, setGrabOfflineRows] = useState<GrabOfflineRow[]>([]);
  const [grabPeakDailyRows, setGrabPeakDailyRows] = useState<GrabPeakDailyRow[]>([]);
  const [foodpandaOpsRows, setFoodpandaOpsRows] = useState<FoodpandaOpsRow[]>([]);
  const [productTrendRows, setProductTrendRows] = useState<ProductTrendRow[]>([]);
  const [posRows, setPosRows] = useState<PosRow[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<PosRowDetail | null>(null);
  const [productInput, setProductInput] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [orQuery, setOrQuery] = useState("");
  const [orDate, setOrDate] = useState("");
  const [hasSeniorOnly, setHasSeniorOnly] = useState(false);

  const canLoad = active && city === "manila" && !!approverName.trim() && stepUpReady;

  const productSuggestions = useMemo(() => {
    const names = new Set<string>();
    for (const item of overview?.top_products || []) names.add(item.product_name);
    for (const item of productRows) names.add(item.product_name);
    const query = productInput.trim().toLowerCase();
    return Array.from(names)
      .filter((name) => (!query ? true : name.toLowerCase().includes(query)))
      .slice(0, 8);
  }, [overview, productRows, productInput]);

  const storeOptions = useMemo(() => {
    const items = new Set<string>(["Taft", "Paranaque", "QC"]);
    for (const name of overview?.stores || []) {
      if (name?.trim()) items.add(name.trim());
    }
    return Array.from(items);
  }, [overview]);

  const datasetCards = useMemo(
    () => [
      { key: "product", label: "Menu sales" },
      { key: "channel", label: "Transaction channels" },
      { key: "hourly", label: "Peak hour data" },
      { key: "grab_peak_hour", label: "Grab Food Peak Hour" },
      { key: "grab_offline", label: "Grab Food Offline Hours" },
      { key: "foodpanda_ops", label: "Panda Food · Ops" },
      { key: "category", label: "Categories" },
      { key: "payment_method", label: "Payment methods" },
      { key: "pos_daily", label: "POS Daily Report" },
    ],
    [],
  );

  const activeSourceSystems = overview?.active_source_systems || [];
  const isGrabOnlyScope = activeSourceSystems.length > 0 && activeSourceSystems.every((item) => item === "grab_export");
  const categoryDataset = overview?.dataset_availability?.category;
  const paymentDataset = overview?.dataset_availability?.payment_method;
  const posDataset = overview?.dataset_availability?.pos_daily;
  const hourlyDataset = overview?.dataset_availability?.hourly;
  const foodpandaOpsDataset = overview?.dataset_availability?.foodpanda_ops;

  const hasAnyDataset = useMemo(
    () => Object.values(overview?.dataset_availability || {}).some((item) => Boolean(item?.has_data)),
    [overview],
  );

  const loadAll = useCallback(async () => {
    if (!canLoad) return;
    setLoading(true);
    setError("");
    try {
      const base = new URLSearchParams({
        approver_name: approverName.trim(),
        pin: pin.trim(),
        date_from: dateFrom,
        date_to: dateTo,
      });
      if (storeFilter) base.set("store", storeFilter);
      const overviewQs = new URLSearchParams(base);
      if (channelFilter) overviewQs.set("channel", channelFilter);
      if (categoryFilter) overviewQs.set("category", categoryFilter);
      const productQs = new URLSearchParams(base);
      if (categoryFilter) productQs.set("category", categoryFilter);
      productQs.set("limit", "200");
      const grabPeakQs = new URLSearchParams(base);
      if (channelFilter) grabPeakQs.set("channel", channelFilter);
      const [
        overviewRes,
        productRes,
        channelRes,
        categoryRes,
        paymentMethodRes,
        discountRes,
        seniorRes,
        grabOfflineRes,
        grabPeakRes,
        foodpandaOpsRes,
      ] = await Promise.all([
        apiGet<OverviewResp>(`/api/admin/analytics/manila/sales/overview?${overviewQs.toString()}`),
        apiGet<ListResp<ProductRow>>(`/api/admin/analytics/manila/sales/by-product?${productQs.toString()}`),
        apiGet<ListResp<ChannelRow>>(`/api/admin/analytics/manila/sales/by-channel?${base.toString()}`),
        apiGet<ListResp<CategoryRow>>(`/api/admin/analytics/manila/sales/by-category?${base.toString()}`),
        apiGet<ListResp<PaymentMethodRow>>(`/api/admin/analytics/manila/sales/by-payment-method?${base.toString()}`),
        apiGet<DiscountSummaryResp>(`/api/admin/analytics/manila/pos/discount-summary?${base.toString()}`),
        apiGet<SeniorAnalysisResp>(`/api/admin/analytics/manila/pos/senior-analysis?${base.toString()}`),
        apiGet<ListResp<GrabOfflineRow>>(`/api/admin/analytics/manila/sales/grab-offline-hours?${base.toString()}`),
        apiGet<ListResp<GrabPeakDailyRow>>(`/api/admin/analytics/manila/sales/grab-peak-hour-daily?${grabPeakQs.toString()}`),
        apiGet<ListResp<FoodpandaOpsRow>>(`/api/admin/analytics/manila/sales/foodpanda-ops?${base.toString()}`),
      ]);
      setOverview(overviewRes);
      setProductRows(productRes.items || []);
      setChannelRows(channelRes.items || []);
      setCategoryRows(categoryRes.items || []);
      setPaymentMethodRows(paymentMethodRes.items || []);
      setDiscountSummary(discountRes);
      setSeniorAnalysis(seniorRes);
      setGrabOfflineRows(grabOfflineRes.items || []);
      setGrabPeakDailyRows(grabPeakRes.items || []);
      setFoodpandaOpsRows(foodpandaOpsRes.items || []);
    } catch (e) {
      setError(String((e as Error)?.message || e || "Failed to load Manila sales analytics"));
    } finally {
      setLoading(false);
    }
  }, [approverName, canLoad, categoryFilter, channelFilter, dateFrom, dateTo, pin, storeFilter]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const productName = selectedProduct.trim();
    if (!canLoad || !productName) {
      setProductTrendRows([]);
      return;
    }
    const qs = new URLSearchParams({
      approver_name: approverName.trim(),
      pin: pin.trim(),
      date_from: dateFrom,
      date_to: dateTo,
      product_name: productName,
    });
    if (storeFilter) qs.set("store", storeFilter);
    void apiGet<ListResp<ProductTrendRow>>(`/api/admin/analytics/manila/sales/product-trend?${qs.toString()}`)
      .then((res) => setProductTrendRows(res.items || []))
      .catch(() => setProductTrendRows([]));
  }, [approverName, canLoad, dateFrom, dateTo, pin, selectedProduct, storeFilter]);

  useEffect(() => {
    if (categoryDataset?.supported_in_scope === false && categoryFilter) {
      setCategoryFilter("");
    }
  }, [categoryDataset?.supported_in_scope, categoryFilter]);

  useEffect(() => {
    if (posDataset?.supported_in_scope === false) {
      setPosRows([]);
      setSelectedTransaction(null);
    }
  }, [posDataset?.supported_in_scope]);

  const formatSyncJobMessage = useCallback((job?: SyncJob | null, fallback = "") => {
    if (!job?.id) return fallback;
    const steps = Array.isArray(job.result?.steps) ? job.result?.steps : [];
    const activeStep = steps.find((step) => step.status === "running") || steps[steps.length - 1];
    const label = activeStep?.step === "manila_sales" ? "Manila sales" : (activeStep?.step || "sync");
    if (job.status === "QUEUED") return "Sync queued. The worker will start shortly.";
    if (job.status === "RUNNING") return `Sync in progress: ${label}.`;
    if (job.status === "COMPLETED_WITH_WARNINGS") return job.error_message || "Sync completed with some warnings.";
    if (job.status === "COMPLETED") return "Sync completed successfully.";
    if (job.status === "FAILED") return job.error_message || "Sync failed.";
    return fallback;
  }, []);

  const waitForSyncJob = useCallback(async (jobId: string) => {
    for (let attempt = 0; attempt < 240; attempt += 1) {
      const qs = new URLSearchParams({
        city: "manila",
      });
      try {
        const res = await apiGet<SyncJobResp>(`/api/admin/pos/sync-jobs/${encodeURIComponent(jobId)}?${qs.toString()}`);
        const job = res.job;
        setSyncMessage(formatSyncJobMessage(job));
        if (job.status === "COMPLETED" || job.status === "COMPLETED_WITH_WARNINGS" || job.status === "FAILED") {
          return job;
        }
      } catch {
        setSyncMessage("Sync is still running in the background. Waiting for the next status check...");
      }
      await sleep(5000);
    }
    throw new Error("Sync is still running in the background. Please wait a bit, then refresh.");
  }, [formatSyncJobMessage]);

  const runSync = async () => {
    if (!approverName.trim() || !pin.trim()) return;
    setSyncing(true);
    setError("");
    setSyncMessage("");
    try {
      const queued = await apiPost<SyncJobResp>("/api/admin/analytics/manila/sales/sync", {
        approver_name: approverName.trim(),
        pin: pin.trim(),
        force: false,
      });
      if (!queued.job?.id) {
        throw new Error("Sync job could not be started.");
      }
      setSyncMessage(queued.message || formatSyncJobMessage(queued.job, "Sync queued."));
      const finished = await waitForSyncJob(queued.job.id);
      if (finished.status === "FAILED") {
        throw new Error(finished.error_message || "Sync failed.");
      }
      if (finished.status === "COMPLETED_WITH_WARNINGS") {
        setSyncMessage(finished.error_message || "Sync completed with some warnings.");
      } else {
        setSyncMessage("Manila sales sync completed.");
      }
      await loadAll();
    } catch (e) {
      setError(String((e as Error)?.message || e || "Sync failed"));
    } finally {
      setSyncing(false);
    }
  };

  const searchPos = async () => {
    if (!canLoad) return;
    setSearchingPos(true);
    setError("");
    try {
      const qs = new URLSearchParams({
        approver_name: approverName.trim(),
        pin: pin.trim(),
        date_from: dateFrom,
        date_to: dateTo,
        limit: "50",
      });
      if (storeFilter) qs.set("store", storeFilter);
      if (orQuery.trim()) qs.set("or_no", orQuery.trim());
      if (orDate.trim()) qs.set("date", orDate.trim());
      if (hasSeniorOnly) qs.set("has_senior", "true");
      const res = await apiGet<ListResp<PosRow>>(`/api/admin/analytics/manila/pos/search?${qs.toString()}`);
      setPosRows(res.items || []);
    } catch (e) {
      setError(String((e as Error)?.message || e || "POS search failed"));
      setPosRows([]);
    } finally {
      setSearchingPos(false);
    }
  };

  const openTransaction = async (row: PosRow) => {
    const orNo = row.or_no;
    if (!canLoad || !orNo) return;
    setTransactionLoading(true);
    try {
      const qs = new URLSearchParams({
        approver_name: approverName.trim(),
        pin: pin.trim(),
      });
      if (row.store_name) qs.set("store", row.store_name);
      const res = await apiGet<{ ok: boolean; item: PosRowDetail }>(
        `/api/admin/analytics/manila/pos/transaction/${encodeURIComponent(orNo)}?${qs.toString()}`,
      );
      setSelectedTransaction(res.item || null);
    } catch (e) {
      setError(String((e as Error)?.message || e || "Transaction detail failed"));
    } finally {
      setTransactionLoading(false);
    }
  };

  if (!active) return null;

  if (city !== "manila") {
    return (
      <div id="sales-manila-sales" className={GLASS_CARD + " p-5"}>
        <div className="mb-2 flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-violet-400" />
          <h2 className={T_SECTION}>Manila Sales</h2>
        </div>
        <div className={T_BODY}>Switch City to Manila to view the Manila-specific POS dashboard.</div>
      </div>
    );
  }

  return (
    <div id="sales-manila-sales" className={GLASS_CARD + " space-y-4 p-5"}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-violet-400" />
            <h2 className={T_PAGE_TITLE}>Manila Sales Dashboard</h2>
          </div>
          <div className={T_BODY}>
            This Manila tab is intentionally separate from Dubai. StoreHub-backed stores can show richer POS datasets,
            while Grab export stores show only the datasets actually available from Grab: menu sales, channel sales, and
            peak-hour order counts.
          </div>
          <div className={T_CAPTION + " mt-2"}>
            Active store scope: {storeFilter || "All stores"}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className={T_CAPTION}>
            <div className={T_LABEL + " mb-1"}>Store</div>
            <select
              value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="">All stores</option>
              {storeOptions.map((store) => (
                <option key={store} value={store}>
                  {store}
                </option>
              ))}
            </select>
          </label>
          <label className={T_CAPTION}>
            <div className={T_LABEL + " mb-1"}>Channel</div>
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="">All</option>
              {channelRows.map((row) => (
                <option key={row.transaction_channel} value={row.transaction_channel}>
                  {row.transaction_channel}
                </option>
              ))}
            </select>
          </label>
          <label className={T_CAPTION}>
            <div className={T_LABEL + " mb-1"}>Category</div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              disabled={categoryDataset?.supported_in_scope === false}
              className={SELECT_CLASS}
            >
              <option value="">All</option>
              {categoryRows.map((row) => (
                <option key={row.product_category} value={row.product_category}>
                  {row.product_category}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void loadAll()}
            disabled={loading || !canLoad}
            className={PRIMARY_BUTTON + " flex items-center gap-2 text-sm"}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {loading ? <span className="inline-flex items-center gap-2"><Spinner size="sm" /> Loading...</span> : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => void runSync()}
            disabled={syncing || !approverName.trim() || !pin.trim()}
            className={SECONDARY_BUTTON + " text-sm"}
          >
            {syncing ? <span className="inline-flex items-center gap-2"><Spinner size="sm" /> Syncing...</span> : "Sync Manila Sales"}
          </button>
        </div>
      </div>

      {!approverName.trim() ? (
        <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-purple-500/5 px-4 py-3 text-sm text-violet-100">
          Enter `Approver Name` above to load Manila sales.
        </div>
      ) : null}
      {approverName.trim() && !stepUpReady ? (
        <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-purple-500/5 px-4 py-3 text-sm text-violet-100">
          Complete security verification first, then refresh Manila sales.
        </div>
      ) : null}
      {syncMessage ? <div className="rounded-xl border border-violet-500/20 bg-violet-500/10 px-3 py-2 text-sm text-violet-100">{syncMessage}</div> : null}
      {error ? <div className="rounded-xl border border-rose-900/50 bg-rose-950/20 px-3 py-2 text-sm text-rose-200">{error}</div> : null}
      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-8 shadow-xl shadow-black/20 backdrop-blur-sm">
          <div className="flex justify-center"><Spinner /></div>
        </div>
      ) : null}

      <div id={MANILA_DATASET_OVERVIEW_ID} className="scroll-mt-24">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4">
          {datasetCards.map((card) => {
            const item = overview?.dataset_availability?.[card.key];
            const statusLabel =
              item?.supported_in_scope === false ? "Not available from this source" : item?.has_data ? "Available" : "Not imported yet";
            const statusClass =
              item?.supported_in_scope === false
                ? BADGE_WARNING
                : item?.has_data
                  ? BADGE_SUCCESS
                  : BADGE_ERROR;
            const sectionId = MANILA_SECTION_ID_BY_CARD_KEY[card.key];
            return (
              <button
                key={card.key}
                type="button"
                onClick={() => sectionId && scrollToManilaElementId(sectionId)}
                aria-label={`Scroll to ${card.label} section`}
                className="w-full rounded-2xl border border-white/10 bg-gradient-to-br from-white/8 to-white/3 p-4 text-left shadow-lg shadow-black/30 backdrop-blur-sm transition hover:border-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50"
              >
                <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">{card.label}</div>
                <div className={`mt-2 ${statusClass}`}>
                  {item?.has_data && item?.supported_in_scope !== false ? <CheckCircle2 className="h-3 w-3" /> : <CircleDot className="h-3 w-3" />}
                  <span>{statusLabel}</span>
                </div>
                <div className="mt-2 text-xs text-zinc-500">Imported files: {formatCount(Number(item?.import_count || 0))}</div>
                {item?.note ? <div className="mt-2 text-xs text-zinc-500">{item.note}</div> : null}
              </button>
            );
          })}
        </div>
      </div>

      {!loading && canLoad && !hasAnyDataset ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-1 shadow-xl shadow-black/20 backdrop-blur-sm">
          <EmptyState message="No Manila datasets are imported for this period yet. Sync the Manila files first." />
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <KpiCard title="Total Sales" value={Number(overview?.summary.total_sales || 0)} hint="Gross sales across the selected Manila store scope." />
        <KpiCard title="Net Sales" value={Number(overview?.summary.total_net_sales || 0)} hint="Net sales currently available from Manila files." />
        <KpiCard
          title="Gross Profit"
          value={isGrabOnlyScope ? "—" : Number(overview?.summary.total_gross_profit || 0)}
          hint={isGrabOnlyScope ? "Not available from Grab export." : "Derived from the imported Manila sales datasets."}
        />
        <KpiCard
          title="Gross Profit %"
          value={isGrabOnlyScope ? "—" : formatPct(Number(overview?.summary.avg_gross_profit_pct || 0))}
          hint={isGrabOnlyScope ? "Not available from Grab export." : "Average gross-profit ratio across the selected range."}
        />
        <KpiCard title="Transactions" value={Number(overview?.summary.total_transactions || 0)} hint="Transaction count from the Manila channel exports." />
      </div>

      <div className="my-8 border-t border-white/5" />

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-black/20 backdrop-blur-sm">
          <div className="mb-3 text-base font-semibold text-white">Daily Trend</div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={overview?.daily_trend || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis dataKey="sale_date" stroke="#a3a3a3" />
                <YAxis stroke="#a3a3a3" />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="total_sales" stroke="#38bdf8" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="total_net_sales" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-black/20 backdrop-blur-sm">
          <div className="text-base font-semibold text-white">Imported Coverage</div>
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/8 to-white/3 px-3 py-3 shadow-lg shadow-black/30 backdrop-blur-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">Coverage</div>
            <div className="mt-1 text-base font-semibold text-white">
              {(overview?.period.from || "—")} to {(overview?.period.to || "—")}
            </div>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">Channel filter</div>
            <div className="mt-1 text-base font-semibold text-white">{channelFilter || "All channels"}</div>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">Category filter</div>
            <div className="mt-1 text-base font-semibold text-white">{categoryFilter || "All categories"}</div>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">Manila-specific note</div>
            <div className="mt-1 text-sm leading-relaxed text-zinc-400">
              Manila mixes multiple source systems. Grab export currently supports menu sales, channel sales, and peak-hour
              counts. StoreHub-only datasets are labeled when they are unavailable for the selected scope.
            </div>
          </div>
        </div>
      </div>

      <div className="my-8 border-t border-white/5" />

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div id="manila-section-hourly" className="scroll-mt-24 rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
          <div className="mb-3 text-base font-semibold text-white">Peak Hour Data</div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={overview?.hourly_breakdown || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis dataKey="hour_of_day" stroke="#a3a3a3" />
                <YAxis stroke="#a3a3a3" />
                <Tooltip />
                <Legend />
                <Bar dataKey="order_count" fill="#38bdf8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {hourlyDataset?.note ? <div className="mt-3 text-sm leading-relaxed text-zinc-400">{hourlyDataset.note}</div> : null}
          {!overview?.hourly_breakdown?.some((row) => Number(row.order_count || 0) > 0) ? (
            <div className="mt-3 text-sm leading-relaxed text-zinc-400">
              {hourlyDataset?.supported_in_scope === false ? "Not available from this data source." : "Peak-hour rows will appear here after Grab exports are imported."}
            </div>
          ) : null}
          <ManilaDatasetBackButton />
        </div>
        <div id="manila-section-channel" className="scroll-mt-24 rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
          <div className="mb-3 text-base font-semibold text-white">Channel Comparison</div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-white/5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Channel</th>
                  <th className="px-3 py-2">Transactions</th>
                  <th className="px-3 py-2">Sales</th>
                  <th className="px-3 py-2">Net</th>
                </tr>
              </thead>
              <tbody>
                {channelRows.map((row) => (
                  <tr key={row.transaction_channel} className="border-t border-white/5 transition-colors duration-150 hover:bg-white/4">
                    <td className="px-3 py-2 text-sm font-semibold text-white">{row.transaction_channel}</td>
                    <td className="px-3 py-2 text-sm text-zinc-200 tabular-nums">{formatCount(Number(row.total_transactions || 0))}</td>
                    <td className="px-3 py-2 text-sm text-zinc-200 tabular-nums">{formatMoney(Number(row.total_sales || 0))}</td>
                    <td className="px-3 py-2 text-sm text-zinc-200 tabular-nums">{formatMoney(Number(row.net_sales || 0))}</td>
                  </tr>
                ))}
                {!channelRows.length ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-2">
                      <EmptyState message="No channel data yet." />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <ManilaDatasetBackButton />
        </div>
      </div>

      <div className="my-8 border-t border-white/5" />

      <div className="grid gap-4">
        <div id="manila-section-grab-offline" className="scroll-mt-24 rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
          <div className="mb-3 text-base font-semibold text-white">Grab Food Offline Hours</div>
          <div className="mb-2 text-xs text-zinc-500">
            Store offline minutes and scheduled open time from GrabFood exports (sync files containing &quot;store offline hours&quot; in the filename).
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-white/5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Store</th>
                  <th className="px-2 py-2">Service</th>
                  <th className="px-2 py-2 text-right">Offline (min)</th>
                  <th className="px-2 py-2 text-right">Scheduled open (min)</th>
                  <th className="px-2 py-2 text-right">Offline rate</th>
                </tr>
              </thead>
              <tbody>
                {grabOfflineRows.map((row) => (
                  <tr
                    key={`${row.sale_date}-${row.store_name}-${row.grab_service}`}
                    className="border-t border-white/5 transition-colors duration-150 hover:bg-white/4"
                  >
                    <td className="px-2 py-2 font-medium text-white">{row.sale_date}</td>
                    <td className="px-2 py-2 text-zinc-200">{row.store_name}</td>
                    <td className="px-2 py-2 text-zinc-200">{row.grab_service}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-zinc-200">{formatCount(Number(row.offline_minutes || 0))}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-zinc-200">{formatCount(Number(row.scheduled_open_minutes || 0))}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-zinc-200">
                      {row.offline_rate_pct != null && Number.isFinite(Number(row.offline_rate_pct))
                        ? formatPct(Number(row.offline_rate_pct))
                        : "—"}
                    </td>
                  </tr>
                ))}
                {!grabOfflineRows.length ? (
                  <tr>
                    <td colSpan={6} className="px-2 py-4">
                      <EmptyState message="No offline-hours rows for this period. Upload Grab CSVs to Drive and run Sync Manila Sales." />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <ManilaDatasetBackButton />
        </div>

        <div id="manila-section-grab-peak" className="scroll-mt-24 rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
          <div className="mb-3 text-base font-semibold text-white">Grab Food Peak Hour</div>
          <div className="mb-2 text-xs text-zinc-500">
            Daily order counts by hour (0–23) from Grab peak-hour exports. Respects the Channel filter when it matches a Grab aggregator (e.g. GrabFood).
          </div>
          <div className="max-h-[480px] overflow-auto">
            <table className="min-w-max text-left text-xs">
              <thead className="sticky top-0 z-10 border-b border-white/10 bg-neutral-950/95 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="sticky left-0 z-20 bg-neutral-950/95 px-2 py-2">Date</th>
                  {Array.from({ length: 24 }, (_, h) => (
                    <th key={h} className="px-1 py-2 text-center tabular-nums">
                      {String(h).padStart(2, "0")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grabPeakDailyRows.map((row) => {
                  const hrs = Array.isArray(row.hours) && row.hours.length === 24 ? row.hours : Array.from({ length: 24 }, (_, i) => row.hours?.[i] ?? 0);
                  return (
                    <tr key={row.sale_date} className="border-t border-white/5 transition-colors duration-150 hover:bg-white/4">
                      <td className="sticky left-0 z-10 bg-neutral-950/90 px-2 py-1.5 font-medium text-white">{row.sale_date}</td>
                      {hrs.map((c, hi) => (
                        <td key={hi} className="px-1 py-1.5 text-center tabular-nums text-zinc-200">
                          {formatCount(Number(c || 0))}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                {!grabPeakDailyRows.length ? (
                  <tr>
                    <td colSpan={25} className="px-2 py-4">
                      <EmptyState message="No peak-hour daily rows for this period. Import Grab peak hour CSVs via Drive sync." />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <ManilaDatasetBackButton />
        </div>

        <div id="manila-section-panda-ops" className="scroll-mt-24 rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
          <div className="mb-3 text-base font-semibold text-white">Panda Food · Ops summary</div>
          <div className="mb-2 text-xs text-zinc-500">
            Daily operations metrics from Foodpanda exports (<code className="rounded bg-white/10 px-1">opsSummary</code> CSV, optionally prefixed with a store slug e.g.{" "}
            <code className="rounded bg-white/10 px-1">paranaque_opsSummary_…</code>). Sync via Drive — same Manila sales job as other CSVs.
          </div>
          {foodpandaOpsDataset?.note ? <div className="mb-3 text-sm leading-relaxed text-zinc-400">{foodpandaOpsDataset.note}</div> : null}
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-white/5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Store</th>
                  <th className="px-2 py-2">Restaurant</th>
                  <th className="px-2 py-2 text-right">Unavailable time (min / h)</th>
                  <th className="px-2 py-2 text-right">Reject rate</th>
                  <th className="px-2 py-2 text-right">Avoidable wait %</th>
                  <th className="px-2 py-2 text-right">Avg prep time (min / h)</th>
                  <th className="px-2 py-2 text-right">Complaints %</th>
                  <th className="px-2 py-2 text-right">Food ready %</th>
                </tr>
              </thead>
              <tbody>
                {foodpandaOpsRows.map((row) => (
                  <tr
                    key={`${row.sale_date}-${row.store_name}-${row.restaurant_id || ""}`}
                    className="border-t border-white/5 transition-colors duration-150 hover:bg-white/4"
                  >
                    <td className="px-2 py-2 font-medium text-white">{row.sale_date}</td>
                    <td className="px-2 py-2 text-zinc-200">{row.store_name}</td>
                    <td className="px-2 py-2 text-zinc-200">{row.restaurant_name || "—"}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-zinc-200">{formatSeconds(row.unavailable_time)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-zinc-200">
                      {row.order_rejection_rate != null && Number.isFinite(row.order_rejection_rate) ? formatPct(row.order_rejection_rate) : "—"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-zinc-200">
                      {row.orders_with_avoidable_wait_time != null && Number.isFinite(row.orders_with_avoidable_wait_time)
                        ? formatPct(row.orders_with_avoidable_wait_time)
                        : "—"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-zinc-200">{formatSeconds(row.average_preparation_time)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-zinc-200">
                      {row.orders_with_customer_complaints != null && Number.isFinite(row.orders_with_customer_complaints)
                        ? formatPct(row.orders_with_customer_complaints)
                        : "—"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-zinc-200">
                      {row.food_is_ready != null && Number.isFinite(row.food_is_ready) ? formatPct(row.food_is_ready) : "—"}
                    </td>
                  </tr>
                ))}
                {!foodpandaOpsRows.length ? (
                  <tr>
                    <td colSpan={9} className="px-2 py-4">
                      <EmptyState
                        message={
                          foodpandaOpsDataset?.supported_in_scope === false
                            ? "Panda Food ops metrics are not available from the selected data source for this scope."
                            : "No Panda Food ops rows for this period. Upload opsSummary CSVs to Drive and run Sync Manila Sales."
                        }
                      />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <ManilaDatasetBackButton />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <div id="manila-section-product" className="scroll-mt-24 rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
          <div className="mb-3 text-sm font-semibold">Top Menu Sales</div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-neutral-800 text-xs text-neutral-400">
                <tr>
                  <th className="px-3 py-2">Menu Item</th>
                  <th className="px-3 py-2">Qty</th>
                  <th className="px-3 py-2">Sales</th>
                  <th className="px-3 py-2">Net</th>
                  <th className="px-3 py-2">GP %</th>
                </tr>
              </thead>
              <tbody>
                {productRows.slice(0, 30).map((row) => (
                  <tr key={row.product_name} className="border-b border-neutral-800/70">
                    <td className="px-3 py-2">
                      <div className="font-medium text-white">{row.product_name}</div>
                      <div className="text-xs text-neutral-500">{row.product_category || "Uncategorized"}</div>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{formatCount(Number(row.total_items_sold || 0))}</td>
                    <td className="px-3 py-2 tabular-nums">{formatMoney(Number(row.total_sales || 0))}</td>
                    <td className="px-3 py-2 tabular-nums">{isGrabOnlyScope ? "—" : formatMoney(Number(row.item_net_sales || 0))}</td>
                    <td className="px-3 py-2 tabular-nums">{isGrabOnlyScope ? "—" : formatPct(Number(row.gross_profit_pct || 0))}</td>
                  </tr>
                ))}
                {!productRows.length ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-neutral-500">
                      Product data will appear after Manila sales files are synced.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <ManilaDatasetBackButton />
        </div>
        <div id="manila-section-category" className="scroll-mt-24 rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
          <div className="mb-3 text-sm font-semibold">Category Breakdown</div>
          {categoryDataset?.note ? <div className="mb-3 text-sm text-neutral-500">{categoryDataset.note}</div> : null}
          <div className="space-y-2">
            {categoryRows.slice(0, 12).map((row) => (
              <div key={row.product_category} className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-white">{row.product_category}</div>
                  <div className="text-sm font-medium tabular-nums">{formatMoney(Number(row.total_sales || 0))}</div>
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  Qty {formatCount(Number(row.total_items_sold || 0))} · Net {formatMoney(Number(row.item_net_sales || 0))} · GP{" "}
                  {formatPct(Number(row.gross_profit_pct || 0))}
                </div>
              </div>
            ))}
            {!categoryRows.length ? (
              <div className="text-sm text-neutral-500">
                {categoryDataset?.supported_in_scope === false ? "Not available from this data source." : "No category data yet."}
              </div>
            ) : null}
          </div>
          <ManilaDatasetBackButton />
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-black/20 backdrop-blur-sm">
        <div className="mb-3 text-sm font-semibold">Product Trend</div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="relative max-w-xl flex-1">
            <label className="mb-1 block text-xs text-neutral-400">Product search</label>
            <input
              value={productInput}
              onChange={(e) => setProductInput(e.target.value)}
              placeholder="Type a menu item"
              className={`w-full ${INPUT_CLASS}`}
            />
            {productInput.trim() && productSuggestions.length ? (
              <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-2xl border border-white/10 bg-neutral-950/95 shadow-2xl shadow-black/40 backdrop-blur-sm">
                {productSuggestions.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      setProductInput(name);
                      setSelectedProduct(name);
                    }}
                    className="block w-full border-b border-white/5 px-4 py-3 text-left text-sm text-neutral-200 transition-colors duration-150 hover:bg-white/4"
                  >
                    {name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setSelectedProduct(productInput.trim())}
            disabled={!productInput.trim()}
            className="rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 px-5 py-2.5 text-sm font-semibold text-black shadow-lg shadow-violet-500/25 transition-all duration-200 hover:scale-[1.02] hover:from-violet-400 hover:to-purple-400 hover:shadow-violet-500/40 active:scale-[0.98] disabled:opacity-50"
          >
            Load Product Trend
          </button>
        </div>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={productTrendRows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
              <XAxis dataKey="sale_date" stroke="#a3a3a3" />
              <YAxis stroke="#a3a3a3" />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="total_sales" stroke="#f59e0b" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="total_items_sold" stroke="#22c55e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div id="manila-section-payment" className="scroll-mt-24 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-black/20 backdrop-blur-sm">
        <div className="mb-3 text-sm font-semibold">Payment Method Table</div>
        {paymentDataset?.note ? <div className="mb-3 text-sm text-neutral-500">{paymentDataset.note}</div> : null}
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-wider text-zinc-400">
              <tr>
                <th className="px-3 py-2">Payment Method</th>
                <th className="px-3 py-2">Transactions</th>
                <th className="px-3 py-2">Sales</th>
                <th className="px-3 py-2">Returned Sales</th>
                <th className="px-3 py-2">Preorder Deposits</th>
                <th className="px-3 py-2">Net Sales</th>
              </tr>
            </thead>
            <tbody>
              {paymentMethodRows.map((row) => (
                <tr key={row.payment_method} className="cursor-default border-t border-white/5 transition-colors duration-150 hover:bg-white/6">
                  <td className="px-3 py-2">{row.payment_method}</td>
                  <td className="px-3 py-2 tabular-nums">{formatCount(Number(row.total_transactions || 0))}</td>
                  <td className="px-3 py-2 tabular-nums">{formatMoney(Number(row.total_sales || 0))}</td>
                  <td className="px-3 py-2 tabular-nums">{formatMoney(Number(row.total_sales_returned || 0))}</td>
                  <td className="px-3 py-2 tabular-nums">{formatMoney(Number(row.preorder_deposits || 0))}</td>
                  <td className="px-3 py-2 tabular-nums">{formatMoney(Number(row.net_sales || 0))}</td>
                </tr>
              ))}
              {!paymentMethodRows.length ? (
                <tr>
                  <td colSpan={6} className="px-3 py-2">
                    <EmptyState message={paymentDataset?.supported_in_scope === false ? "Not available from this data source." : "No payment-method rows imported yet."} />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <ManilaDatasetBackButton />
      </div>

      <section id="manila-section-pos" className="scroll-mt-24 space-y-4">
        <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-black/20 backdrop-blur-sm">
          <div className="mb-3 text-sm font-semibold">OR Search</div>
          {posDataset?.note ? <div className="mb-3 text-sm text-neutral-500">{posDataset.note}</div> : null}
          <div className="grid gap-3 md:grid-cols-4">
            <input
              value={orQuery}
              onChange={(e) => setOrQuery(e.target.value)}
              placeholder="OR No"
              disabled={posDataset?.supported_in_scope === false}
              className={INPUT_CLASS}
            />
            <input
              type="date"
              value={orDate}
              onChange={(e) => setOrDate(e.target.value)}
              disabled={posDataset?.supported_in_scope === false}
              className={INPUT_CLASS}
            />
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/6 px-4 py-2.5 text-sm text-neutral-200">
              <input type="checkbox" checked={hasSeniorOnly} onChange={(e) => setHasSeniorOnly(e.target.checked)} disabled={posDataset?.supported_in_scope === false} />
              Senior only
            </label>
            <button
              type="button"
              onClick={() => void searchPos()}
              disabled={searchingPos || !canLoad || posDataset?.supported_in_scope === false}
              className="rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 px-5 py-2.5 text-sm font-semibold text-black shadow-lg shadow-violet-500/25 transition-all duration-200 hover:scale-[1.02] hover:from-violet-400 hover:to-purple-400 hover:shadow-violet-500/40 active:scale-[0.98] disabled:opacity-50"
            >
              {searchingPos ? <span className="inline-flex items-center gap-2"><Spinner size="sm" /> Searching...</span> : "Search"}
            </button>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-white/5 text-xs uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Store</th>
                  <th className="px-3 py-2">OR No</th>
                  <th className="px-3 py-2">Sales</th>
                  <th className="px-3 py-2">VAT</th>
                  <th className="px-3 py-2">Discounts</th>
                  <th className="px-3 py-2">Net</th>
                </tr>
              </thead>
              <tbody>
                {posRows.map((row) => {
                  const hasBenefit = Number(row.senior_discount || 0) > 0 || Number(row.pwd_discount || 0) > 0;
                  return (
                    <tr
                      key={`${row.sale_date}-${row.or_no}`}
                      onClick={() => void openTransaction(row)}
                      className={
                        hasBenefit
                          ? "cursor-pointer border-t border-white/5 bg-emerald-950/10 transition-colors duration-150 hover:bg-white/6"
                          : "cursor-pointer border-t border-white/5 transition-colors duration-150 hover:bg-white/6"
                      }
                    >
                      <td className="px-3 py-2">{row.sale_date}</td>
                      <td className="px-3 py-2">{row.store_name || "—"}</td>
                      <td className="px-3 py-2 font-medium text-white">{row.or_no}</td>
                      <td className="px-3 py-2 tabular-nums">{formatMoney(Number(row.total_sales || 0))}</td>
                      <td className="px-3 py-2 tabular-nums">{formatMoney(Number(row.vat_12pct || 0))}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {formatMoney(Number(row.senior_discount || 0) + Number(row.pwd_discount || 0) + Number(row.employee_discount || 0))}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{formatMoney(Number(row.net_sales || 0))}</td>
                    </tr>
                  );
                })}
                {!posRows.length ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-2">
                      <EmptyState
                        message={
                          posDataset?.supported_in_scope === false
                            ? "Not available from this data source."
                            : "Search results will appear after POS Daily Report files are imported."
                        }
                      />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-black/20 backdrop-blur-sm">
          <div className="mb-3 text-sm font-semibold">Senior / PWD / Tax Exemption</div>
          {posDataset?.note ? <div className="mb-3 text-sm text-neutral-500">{posDataset.note}</div> : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/8 to-white/3 p-3 shadow-lg shadow-black/30 backdrop-blur-sm">
              <div className="text-xs text-neutral-500">Senior Discount</div>
              <div className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(Number(discountSummary?.totals.senior_discount_total || 0))}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/8 to-white/3 p-3 shadow-lg shadow-black/30 backdrop-blur-sm">
              <div className="text-xs text-neutral-500">PWD Discount</div>
              <div className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(Number(discountSummary?.totals.pwd_discount_total || 0))}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/8 to-white/3 p-3 shadow-lg shadow-black/30 backdrop-blur-sm">
              <div className="text-xs text-neutral-500">VAT Exempt</div>
              <div className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(Number(discountSummary?.totals.vat_exempt_sales_total || 0))}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/8 to-white/3 p-3 shadow-lg shadow-black/30 backdrop-blur-sm">
              <div className="text-xs text-neutral-500">Total Discounts</div>
              <div className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(Number(discountSummary?.totals.total_discounts || 0))}</div>
            </div>
          </div>
          <div className="mt-3 rounded-2xl border border-white/10 bg-gradient-to-br from-white/8 to-white/3 p-3 text-sm text-neutral-300 shadow-lg shadow-black/30 backdrop-blur-sm">
            {posDataset?.supported_in_scope === false
              ? "Tax exemption and senior analysis are not available from Grab export."
              : `Senior transactions ${formatCount(Number(seniorAnalysis?.total_senior_transactions || 0))} · Avg ticket ${formatMoney(
                  Number(seniorAnalysis?.avg_senior_ticket || 0),
                )}`}
          </div>
        </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-black/20 backdrop-blur-sm">
          <div className="mb-3 text-sm font-semibold">Senior Daily Trend</div>
          {posDataset?.supported_in_scope === false ? (
            <div className="flex h-72 items-center justify-center text-sm text-neutral-500">Not available from this data source.</div>
          ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={seniorAnalysis?.daily_trend || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis dataKey="sale_date" stroke="#a3a3a3" />
                <YAxis stroke="#a3a3a3" />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="senior_discount_total" stroke="#34d399" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="senior_transaction_count" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          )}
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-black/20 backdrop-blur-sm">
          <div className="mb-3 text-sm font-semibold">Discount Summary Table</div>
          {posDataset?.supported_in_scope === false ? (
            <div className="flex h-72 items-center justify-center text-sm text-neutral-500">Not available from this data source.</div>
          ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-wider text-zinc-400">
              <tr>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Count</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Sales %</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-white/5 transition-colors duration-150 hover:bg-white/4">
                <td className="px-3 py-2">Senior</td>
                <td className="px-3 py-2">{formatCount(Number(discountSummary?.totals.senior_transaction_count || 0))}</td>
                <td className="px-3 py-2">{formatMoney(Number(discountSummary?.totals.senior_discount_total || 0))}</td>
                <td className="px-3 py-2">{formatPct(Number(discountSummary?.totals.senior_discount_sales_pct || 0))}</td>
              </tr>
              <tr className="border-t border-white/5 transition-colors duration-150 hover:bg-white/4">
                <td className="px-3 py-2">PWD</td>
                <td className="px-3 py-2">{formatCount(Number(discountSummary?.totals.pwd_transaction_count || 0))}</td>
                <td className="px-3 py-2">{formatMoney(Number(discountSummary?.totals.pwd_discount_total || 0))}</td>
                <td className="px-3 py-2">—</td>
              </tr>
              <tr className="border-t border-white/5 transition-colors duration-150 hover:bg-white/4">
                <td className="px-3 py-2">Employee</td>
                <td className="px-3 py-2">—</td>
                <td className="px-3 py-2">{formatMoney(Number(discountSummary?.totals.employee_discount_total || 0))}</td>
                <td className="px-3 py-2">—</td>
              </tr>
              <tr className="border-t border-white/5 transition-colors duration-150 hover:bg-white/4">
                <td className="px-3 py-2">VAT Exempt</td>
                <td className="px-3 py-2">—</td>
                <td className="px-3 py-2">{formatMoney(Number(discountSummary?.totals.vat_exempt_sales_total || 0))}</td>
                <td className="px-3 py-2">{formatPct(Number(discountSummary?.totals.vat_exempt_pct || 0))}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-medium text-white">Total</td>
                <td className="px-3 py-2">{formatCount(Number(discountSummary?.totals.total_transactions || 0))}</td>
                <td className="px-3 py-2">{formatMoney(Number(discountSummary?.totals.total_discounts || 0))}</td>
                <td className="px-3 py-2">—</td>
              </tr>
            </tbody>
          </table>
          )}
        </div>
        </div>
        <ManilaDatasetBackButton />
      </section>

      {(selectedTransaction || transactionLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-neutral-950/95 p-5 shadow-2xl shadow-black/40 backdrop-blur-sm">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-white">OR Detail</div>
                <div className="text-sm text-neutral-400">{selectedTransaction?.or_no || "-"}</div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTransaction(null)}
                className="rounded-xl border border-white/15 bg-white/8 px-5 py-2.5 text-sm text-white transition-all duration-200 hover:border-white/25 hover:bg-white/15"
              >
                Close
              </button>
            </div>
            {transactionLoading ? (
              <div className="flex justify-center py-4"><Spinner /></div>
            ) : selectedTransaction ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {Object.entries(selectedTransaction).map(([key, value]) => (
                  <div key={key} className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/8 to-white/3 px-3 py-2 shadow-lg shadow-black/30 backdrop-blur-sm">
                    <div className="text-xs uppercase tracking-wide text-neutral-500">{key}</div>
                    <div className="mt-1 break-all text-sm text-white">{String(value ?? "—")}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
