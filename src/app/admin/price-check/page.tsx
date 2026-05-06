"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  Tag,
  TrendingDown,
  TrendingUp,
  PencilLine,
  Clock,
  Zap,
  Building2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { getAuth, refreshAuthFromApi } from "@/lib/auth";
import { dispatchBadgeRefresh } from "@/lib/badgeEvents";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SMALL_BUTTON,
  T_PAGE_TITLE,
  T_SECTION,
  T_BODY,
  T_CAPTION,
  T_LABEL,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_ERROR,
  INPUT_CLASS,
  TABLE_HEADER,
  TABLE_ROW,
  TABLE_CELL,
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
  TAB_CONTAINER,
  TAB_ACTIVE,
  TAB_INACTIVE,
} from "@/lib/ui-tokens";

// ─── Types ──────────────────────────────────────────────────────────────────

type PriceCheckResult = {
  id: number;
  store_code: string;
  product_id: string;
  product_name: string;
  category: string;
  baseline_price: number | null;
  current_price: number | null;
  discount_rate: number | null;
  status: "ok" | "changed" | "confirmed" | "pending_manual";
  confirmed_by: string | null;
  confirmed_at: string | null;
  memo: string;
  last_seen: string | null;
  checked_at: string;
  source: string;
};

type LastRun = {
  run_at: string | null;
  items_checked: number;
  items_flagged: number;
  status: string;
  error_msg: string | null;
};

type DubaiItem = {
  item_name: string;
  qty_sold: number;
  net_sales: number;
  actual_unit_price: number | null;
  baseline_price: number | null;
  expected_price: number | null;
  variance_pct: number | null;
  status: "within" | "outside" | "no_baseline" | "no_sales";
};

type DubaiConfirmation = {
  discount_rate_ok: boolean;
  menu_ok: boolean;
  confirmed_by: string | null;
  confirmed_at: string | null;
  memo: string;
};

type DubaiSummary = {
  total_items: number;
  within_5pct: number;
  outside_5pct: number;
  no_baseline: number;
};

type DubaiBaseline = {
  product_name: string;
  baseline_price: number;
};

type DubaiStatus = {
  check_date: string;
  discount_rate: number;
  items: DubaiItem[];
  confirmation: DubaiConfirmation;
  baselines: DubaiBaseline[];
  summary: DubaiSummary;
};

type Tab = "TAFT" | "PAR" | "DUBAI";

const STORE_LABELS: Record<Tab, string> = {
  TAFT: "Taft",
  PAR: "Parañaque",
  DUBAI: "Dubai",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function fmtPrice(v: number | null | undefined): string {
  if (v == null) return "—";
  return `₱${Number(v).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtAED(v: number | null | undefined): string {
  if (v == null) return "—";
  return `AED ${Number(v).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtRate(v: number | null | undefined): string {
  if (v == null) return "—";
  const pct = Number(v) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

function fmtDatetime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-PH", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function statusBadge(status: PriceCheckResult["status"]) {
  switch (status) {
    case "changed":
      return (
        <span className={BADGE_ERROR}>
          <AlertTriangle className="h-3 w-3" />
          Changed
        </span>
      );
    case "confirmed":
      return (
        <span className={BADGE_SUCCESS}>
          <ShieldCheck className="h-3 w-3" />
          Confirmed
        </span>
      );
    case "pending_manual":
      return (
        <span className={BADGE_WARNING}>
          <PencilLine className="h-3 w-3" />
          Pending
        </span>
      );
    default:
      return (
        <span className={BADGE_SUCCESS}>
          <CheckCircle2 className="h-3 w-3" />
          OK
        </span>
      );
  }
}


// ─── Dubai Tab Component ─────────────────────────────────────────────────────

function DubaiTab({ apiBase, tokenHeaders }: { apiBase: string; tokenHeaders: () => Promise<Record<string, string>> }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [checkDate, setCheckDate] = useState(yesterday());
  const [dubaiData, setDubaiData] = useState<DubaiStatus | null>(null);

  // Overall confirmation state
  const [discountRateOk, setDiscountRateOk] = useState(false);
  const [menuOk, setMenuOk] = useState(false);
  const [confirmMemo, setConfirmMemo] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);

  const loadDubai = useCallback(async (date: string) => {
    setLoading(true);
    setError("");
    try {
      const headers = await tokenHeaders();
      const res = await fetch(
        `${apiBase}/api/admin/price-check/dubai/status?date=${date}`,
        { headers, cache: "no-store" }
      );
      const text = await res.text();
      if (!res.ok) throw new Error(text || `Failed (${res.status})`);
      const j: DubaiStatus = JSON.parse(text);
      setDubaiData(j);
      setDiscountRateOk(j.confirmation.discount_rate_ok);
      setMenuOk(j.confirmation.menu_ok);
      setConfirmMemo(j.confirmation.memo || "");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [apiBase, tokenHeaders]);

  useEffect(() => {
    void loadDubai(checkDate);
  }, [loadDubai, checkDate]);

  const saveConfirmation = async () => {
    setConfirmBusy(true);
    setError("");
    setSuccess("");
    try {
      const headers = await tokenHeaders();
      const res = await fetch(`${apiBase}/api/admin/price-check/dubai/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          check_date: checkDate,
          discount_rate_ok: discountRateOk,
          menu_ok: menuOk,
          memo: confirmMemo,
        }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `Failed (${res.status})`);
      setSuccess("Dubai confirmation saved.");
      await loadDubai(checkDate);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConfirmBusy(false);
    }
  };

  const summary = dubaiData?.summary;
  const conf = dubaiData?.confirmation;

  // Totals for KPI
  const totalNetSales = dubaiData?.items.reduce((s, i) => s + i.net_sales, 0) ?? 0;

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Menu Items</div>
          <div className={KPI_VALUE}>{summary?.total_items ?? "—"}</div>
        </div>
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Total Net Sales</div>
          <div className="mt-1 text-sm font-semibold text-white">
            {totalNetSales > 0 ? fmtAED(totalNetSales) : "—"}
          </div>
        </div>
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Discount Rate</div>
          <div className={`${KPI_VALUE} text-violet-300`}>50%</div>
        </div>
        <div className={KPI_CARD}>
          <div className={KPI_LABEL}>Confirmed</div>
          <div className="mt-1 flex items-center gap-1.5">
            {conf?.confirmed_by ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span className="text-xs text-zinc-300">{conf.confirmed_by}</span>
              </>
            ) : (
              <span className="text-sm text-zinc-500">Not yet</span>
            )}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className={`${GLASS_CARD} p-4`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className={T_SECTION}>Dubai — Controls</div>
          <div className="flex items-center gap-2">
            <label className={T_LABEL}>Date</label>
            <input
              type="date"
              value={checkDate}
              onChange={(e) => setCheckDate(e.target.value)}
              className={INPUT_CLASS}
              style={{ width: "160px" }}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => loadDubai(checkDate)}
          disabled={loading}
          className={SECONDARY_BUTTON}
        >
          <span className="flex items-center gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </span>
        </button>
        <p className={`mt-2 ${T_CAPTION}`}>
          Dubai sells at a fixed 50% discount. Prices are derived from Atlas/Foodics POS data.
        </p>

        {error && (
          <div className="mt-3 rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-2 text-sm text-red-300">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-4 py-2 text-sm text-emerald-300">
            {success}
          </div>
        )}
      </div>

      {/* Yesterday's prices — read-only table from POS */}
      {dubaiData && dubaiData.items.length > 0 && (
        <div className={`${GLASS_CARD} p-4`}>
          <div className="mb-3">
            <div className={T_SECTION}>Menu &amp; Prices — {checkDate} (Atlas/Foodics)</div>
            <p className={T_CAPTION}>
              Actual selling prices from POS. Dubai discount: 50% off standard price.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px]">
              <thead>
                <tr>
                  <th className={`${TABLE_HEADER} text-left`}>Item</th>
                  <th className={`${TABLE_HEADER} text-right`}>Qty Sold</th>
                  <th className={`${TABLE_HEADER} text-right`}>Net Sales</th>
                  <th className={`${TABLE_HEADER} text-right`}>Avg Unit Price</th>
                </tr>
              </thead>
              <tbody>
                {dubaiData.items.map((item) => (
                  <tr key={item.item_name} className={TABLE_ROW}>
                    <td className={TABLE_CELL}>
                      <div className="font-medium text-white">{item.item_name}</div>
                    </td>
                    <td className={`${TABLE_CELL} text-right tabular-nums text-zinc-300`}>
                      {item.qty_sold > 0 ? item.qty_sold.toFixed(0) : "—"}
                    </td>
                    <td className={`${TABLE_CELL} text-right tabular-nums text-zinc-300`}>
                      {fmtAED(item.net_sales)}
                    </td>
                    <td className={`${TABLE_CELL} text-right tabular-nums font-medium text-white`}>
                      {fmtAED(item.actual_unit_price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && dubaiData && dubaiData.items.length === 0 && (
        <div className={`${GLASS_CARD} flex flex-col items-center gap-3 py-10`}>
          <Building2 className="h-8 w-8 text-zinc-600" />
          <p className={T_CAPTION}>
            No POS data found for {checkDate}. Data is sourced from pos_menu_item_daily (Dubai).
          </p>
        </div>
      )}

      {/* Overall Confirmation — two checkboxes */}
      <div className={`${GLASS_CARD} p-4`}>
        <div className="mb-3">
          <div className={T_SECTION}>Daily Confirmation — {checkDate}</div>
          {conf?.confirmed_by && (
            <p className={T_CAPTION}>
              Last confirmed by {conf.confirmed_by} at {fmtDatetime(conf.confirmed_at)}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-8">
          {/* Discount Rate checkmark */}
          <label className="flex cursor-pointer items-start gap-3">
            <div
              onClick={() => setDiscountRateOk((v) => !v)}
              className={`mt-0.5 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-2 transition-colors ${
                discountRateOk
                  ? "border-emerald-500 bg-emerald-500"
                  : "border-zinc-600 bg-transparent"
              }`}
            >
              {discountRateOk && <CheckCircle2 className="h-4 w-4 text-white" />}
            </div>
            <div>
              <div className="font-semibold text-white">Discount Rate OK</div>
              <div className={T_CAPTION}>
                Selling prices confirmed at 50% discount
              </div>
            </div>
          </label>

          {/* Menu checkmark */}
          <label className="flex cursor-pointer items-start gap-3">
            <div
              onClick={() => setMenuOk((v) => !v)}
              className={`mt-0.5 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-2 transition-colors ${
                menuOk
                  ? "border-emerald-500 bg-emerald-500"
                  : "border-zinc-600 bg-transparent"
              }`}
            >
              {menuOk && <CheckCircle2 className="h-4 w-4 text-white" />}
            </div>
            <div>
              <div className="font-semibold text-white">Menu OK</div>
              <div className={T_CAPTION}>
                Menu items confirmed — no unauthorized changes
              </div>
            </div>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            type="text"
            className={INPUT_CLASS}
            placeholder="Memo (optional)"
            value={confirmMemo}
            onChange={(e) => setConfirmMemo(e.target.value)}
            style={{ maxWidth: "300px" }}
          />
          <button
            type="button"
            onClick={saveConfirmation}
            disabled={confirmBusy}
            className={PRIMARY_BUTTON}
          >
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              {confirmBusy ? "Saving..." : "Save Confirmation"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function PriceCheckPage() {
  const router = useRouter();
  const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");
  const auth = useMemo(() => getAuth(), []);

  const [activeTab, setActiveTab] = useState<Tab>("TAFT");
  const [loading, setLoading] = useState(false);
  const [runBusy, setRunBusy] = useState(false);
  const [baselineBusy, setBaselineBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [results, setResults] = useState<PriceCheckResult[]>([]);
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const [flaggedCount, setFlaggedCount] = useState(0);

  // Confirm busy per row id
  const [confirmingIds, setConfirmingIds] = useState<number[]>([]);
  const [confirmMemos, setConfirmMemos] = useState<Record<number, string>>({});

  // Manual entry state (Parañaque)
  const [manualProductId, setManualProductId] = useState("");
  const [manualProductName, setManualProductName] = useState("");
  const [manualCategory, setManualCategory] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [manualMemo, setManualMemo] = useState("");
  const [manualBusy, setManualBusy] = useState(false);

  const tokenHeaders = useCallback(async () => {
    const refreshed = await refreshAuthFromApi(auth);
    const accessToken = refreshed?.accessToken || auth?.accessToken;
    if (!accessToken) throw new Error("Please log in again.");
    return {
      Authorization: `Bearer ${accessToken}`,
      ...(refreshed?.stepUpToken ? { "X-Step-Up-Token": refreshed.stepUpToken } : {}),
    };
  }, [auth]);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await tokenHeaders();
      const res = await fetch(
        `${apiBase}/api/admin/price-check/status?store_code=${activeTab}`,
        { headers, cache: "no-store" }
      );
      const text = await res.text();
      if (!res.ok) throw new Error(text || `Failed (${res.status})`);
      const j = JSON.parse(text);
      setResults(j.results || []);
      setLastRun(j.last_run || null);
      setFlaggedCount(Number(j.flagged_count || 0));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [apiBase, tokenHeaders, activeTab]);

  const runCheck = async () => {
    setRunBusy(true);
    setError("");
    setSuccess("");
    try {
      const headers = await tokenHeaders();
      const res = await fetch(`${apiBase}/api/admin/price-check/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ store_code: activeTab, store_id: "" }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `Failed (${res.status})`);
      const j = JSON.parse(text);
      setSuccess(`Check complete — ${j.items_checked} item${j.items_checked !== 1 ? "s" : ""} checked, ${j.items_flagged} flagged`);
      dispatchBadgeRefresh("priceCheck");
      await loadStatus();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunBusy(false);
    }
  };

  const initBaseline = async () => {
    if (!window.confirm("This will overwrite the baseline with current StoreHub prices. Are you sure?")) return;
    setBaselineBusy(true);
    setError("");
    setSuccess("");
    try {
      const headers = await tokenHeaders();
      const res = await fetch(`${apiBase}/api/admin/price-check/init-baseline`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ store_code: activeTab, store_id: "" }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `Failed (${res.status})`);
      const j = JSON.parse(text);
      setSuccess(`Baseline updated — ${j.products_snapshotted} product${j.products_snapshotted !== 1 ? "s" : ""} snapshotted`);
      await loadStatus();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBaselineBusy(false);
    }
  };

  const confirmItem = async (row: PriceCheckResult) => {
    setConfirmingIds((ids) => [...ids, row.id]);
    setError("");
    setSuccess("");
    try {
      const headers = await tokenHeaders();
      const res = await fetch(`${apiBase}/api/admin/price-check/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          store_code: row.store_code,
          product_id: row.product_id,
          memo: confirmMemos[row.id] || "",
        }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `Failed (${res.status})`);
      setSuccess(`"${row.product_name}" marked as confirmed`);
      dispatchBadgeRefresh("priceCheck");
      await loadStatus();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConfirmingIds((ids) => ids.filter((x) => x !== row.id));
    }
  };

  const submitManualEntry = async () => {
    if (!manualProductId.trim()) { setError("Product ID is required"); return; }
    const price = parseFloat(manualPrice);
    if (isNaN(price) || price <= 0) { setError("Please enter a valid price"); return; }
    setManualBusy(true);
    setError("");
    setSuccess("");
    try {
      const headers = await tokenHeaders();
      const res = await fetch(`${apiBase}/api/admin/price-check/manual-entry`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          store_code: activeTab,
          product_id: manualProductId.trim(),
          product_name: manualProductName.trim() || manualProductId.trim(),
          category: manualCategory.trim(),
          current_price: price,
          memo: manualMemo.trim(),
        }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `Failed (${res.status})`);
      const j = JSON.parse(text);
      setSuccess(
        j.status === "changed"
          ? `⚠️ Price change detected: baseline ${fmtPrice(j.baseline_price)} → current ${fmtPrice(j.current_price)}`
          : `"${manualProductId}" saved (no price change)`
      );
      setManualProductId("");
      setManualProductName("");
      setManualCategory("");
      setManualPrice("");
      setManualMemo("");
      await loadStatus();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setManualBusy(false);
    }
  };

  // Auth guard
  useEffect(() => {
    if (!auth?.staffName || !auth?.accessToken) {
      router.replace("/login?next=%2Fadmin%2Fprice-check");
      return;
    }
    const role = auth.role || "";
    if (!["HQ", "ADMIN", "MANILA_MANAGEMENT"].includes(role)) {
      router.replace("/admin");
      return;
    }
  }, [auth, router]);

  useEffect(() => {
    if (activeTab !== "DUBAI") void loadStatus();
  }, [loadStatus, activeTab]);

  // Grouped
  const flaggedRows = useMemo(() => results.filter((r) => r.status === "changed"), [results]);
  const confirmedRows = useMemo(() => results.filter((r) => r.status === "confirmed"), [results]);
  const okRows = useMemo(() => results.filter((r) => r.status === "ok"), [results]);

  const isParanaque = activeTab === "PAR";
  const isDubai = activeTab === "DUBAI";

  return (
    <div className="min-h-screen text-white">
      <motion.div
        className="mx-auto max-w-6xl space-y-5 px-4 py-8"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className={T_PAGE_TITLE}>Price Check</h1>
            <p className={T_BODY}>
              Monitor selling prices and verify discount compliance across all locations.
            </p>
          </div>
          {!isDubai && (
            <div className="flex items-center gap-2">
              {flaggedCount > 0 ? (
                <span className={BADGE_ERROR}>
                  <AlertTriangle className="h-3 w-3" />
                  {flaggedCount} change{flaggedCount !== 1 ? "s" : ""} detected
                </span>
              ) : (
                <span className={BADGE_SUCCESS}>
                  <CheckCircle2 className="h-3 w-3" />
                  All OK
                </span>
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className={TAB_CONTAINER}>
          {(["TAFT", "PAR", "DUBAI"] as Tab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={activeTab === tab ? TAB_ACTIVE : TAB_INACTIVE}
            >
              {STORE_LABELS[tab]}
              {tab === "PAR" && (
                <span className="ml-1.5 text-[10px] text-zinc-500">(manual)</span>
              )}
            </button>
          ))}
        </div>

        {/* Dubai tab renders its own component */}
        {isDubai && (
          <DubaiTab apiBase={apiBase} tokenHeaders={tokenHeaders} />
        )}

        {/* Manila tabs */}
        {!isDubai && (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className={KPI_CARD}>
                <div className={KPI_LABEL}>Flagged</div>
                <div className={`${KPI_VALUE} ${flaggedCount > 0 ? "text-red-400" : "text-emerald-400"}`}>
                  {flaggedCount}
                </div>
              </div>
              <div className={KPI_CARD}>
                <div className={KPI_LABEL}>Confirmed</div>
                <div className={KPI_VALUE}>{confirmedRows.length}</div>
              </div>
              <div className={KPI_CARD}>
                <div className={KPI_LABEL}>Monitored Items</div>
                <div className={KPI_VALUE}>{results.length}</div>
              </div>
              <div className={KPI_CARD}>
                <div className={KPI_LABEL}>Last Check</div>
                <div className="mt-1 text-sm font-semibold text-white">
                  {lastRun?.run_at ? fmtDatetime(lastRun.run_at) : "Never run"}
                </div>
              </div>
            </div>

            {/* Control panel */}
            <div className={`${GLASS_CARD} p-4`}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className={T_SECTION}>{STORE_LABELS[activeTab]} — Controls</div>
                {lastRun && (
                  <div className={`${T_CAPTION} flex items-center gap-1`}>
                    <Clock className="h-3 w-3" />
                    Last run: {fmtDatetime(lastRun.run_at)}
                    {lastRun.error_msg && (
                      <span className="ml-2 text-red-400">({lastRun.error_msg})</span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {!isParanaque && (
                  <>
                    <button
                      type="button"
                      onClick={runCheck}
                      disabled={runBusy || loading}
                      className={PRIMARY_BUTTON}
                    >
                      {runBusy ? (
                        <span className="flex items-center gap-2">
                          <RefreshCw className="h-4 w-4 animate-spin" /> Checking...
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <Zap className="h-4 w-4" /> Run Check Now
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={initBaseline}
                      disabled={baselineBusy || loading}
                      className={SECONDARY_BUTTON}
                    >
                      {baselineBusy ? "Updating..." : "Reset Baseline to Current Prices"}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={loadStatus}
                  disabled={loading}
                  className={SECONDARY_BUTTON}
                >
                  <span className="flex items-center gap-2">
                    <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    Refresh
                  </span>
                </button>
              </div>

              {!isParanaque && (
                <p className={`mt-2 ${T_CAPTION}`}>
                  Auto-check runs daily at 12:00 PM (Philippine time). Use &ldquo;Run Check Now&rdquo; to trigger a manual run.
                </p>
              )}
              {isParanaque && (
                <p className={`mt-2 ${T_CAPTION}`}>
                  Parañaque is not connected to StoreHub API. Enter prices manually below.
                </p>
              )}

              {error && (
                <div className="mt-3 rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-2 text-sm text-red-300">
                  {error}
                </div>
              )}
              {success && (
                <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-4 py-2 text-sm text-emerald-300">
                  {success}
                </div>
              )}
            </div>

            {/* Manual entry (Parañaque) */}
            {isParanaque && (
              <div className={`${GLASS_CARD} p-4`}>
                <div className="mb-3">
                  <div className={T_SECTION}>Manual Price Entry</div>
                  <p className={T_BODY}>Enter the product ID and current selling price to record.</p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="block">
                    <div className={`${T_LABEL} mb-1.5`}>Product ID *</div>
                    <input
                      className={INPUT_CLASS}
                      value={manualProductId}
                      onChange={(e) => setManualProductId(e.target.value)}
                      placeholder="e.g. PROD-001"
                    />
                  </label>
                  <label className="block">
                    <div className={`${T_LABEL} mb-1.5`}>Product Name</div>
                    <input
                      className={INPUT_CLASS}
                      value={manualProductName}
                      onChange={(e) => setManualProductName(e.target.value)}
                      placeholder="e.g. Salmon Bowl"
                    />
                  </label>
                  <label className="block">
                    <div className={`${T_LABEL} mb-1.5`}>Category</div>
                    <input
                      className={INPUT_CLASS}
                      value={manualCategory}
                      onChange={(e) => setManualCategory(e.target.value)}
                      placeholder="e.g. Main"
                    />
                  </label>
                  <label className="block">
                    <div className={`${T_LABEL} mb-1.5`}>Current Selling Price (₱) *</div>
                    <input
                      className={INPUT_CLASS}
                      type="number"
                      min="0"
                      step="0.01"
                      value={manualPrice}
                      onChange={(e) => setManualPrice(e.target.value)}
                      placeholder="e.g. 350.00"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <div className={`${T_LABEL} mb-1.5`}>Memo</div>
                    <input
                      className={INPUT_CLASS}
                      value={manualMemo}
                      onChange={(e) => setManualMemo(e.target.value)}
                      placeholder="Optional note"
                    />
                  </label>
                </div>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={submitManualEntry}
                    disabled={manualBusy}
                    className={PRIMARY_BUTTON}
                  >
                    {manualBusy ? "Saving..." : "Save & Check Price"}
                  </button>
                </div>
              </div>
            )}

            {/* Flagged items */}
            {flaggedRows.length > 0 && (
              <div className={`${GLASS_CARD} border-red-500/20 p-4`}>
                <div className="mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                  <div className={T_SECTION}>Price Changes Detected ({flaggedRows.length})</div>
                </div>
                <PriceTable
                  rows={flaggedRows}
                  confirmingIds={confirmingIds}
                  confirmMemos={confirmMemos}
                  setConfirmMemos={setConfirmMemos}
                  onConfirm={confirmItem}
                  showConfirm
                />
              </div>
            )}

            {/* OK / Confirmed items */}
            {(okRows.length > 0 || confirmedRows.length > 0) && (
              <div className={`${GLASS_CARD} p-4`}>
                <div className="mb-3">
                  <div className={T_SECTION}>
                    Monitored Items ({okRows.length + confirmedRows.length})
                  </div>
                </div>
                <PriceTable
                  rows={[...confirmedRows, ...okRows]}
                  confirmingIds={confirmingIds}
                  confirmMemos={confirmMemos}
                  setConfirmMemos={setConfirmMemos}
                  onConfirm={confirmItem}
                  showConfirm={false}
                />
              </div>
            )}

            {!loading && results.length === 0 && (
              <div className={`${GLASS_CARD} flex flex-col items-center gap-3 py-10`}>
                <Tag className="h-8 w-8 text-zinc-600" />
                <p className={T_CAPTION}>
                  {isParanaque
                    ? "No prices recorded yet. Use the form above to enter prices manually."
                    : "No price data yet. Run a check to populate this list."}
                </p>
                {!isParanaque && (
                  <button
                    type="button"
                    onClick={runCheck}
                    disabled={runBusy}
                    className={PRIMARY_BUTTON}
                  >
                    <span className="flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      Run Check Now
                    </span>
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}

// ─── Price Table sub-component ───────────────────────────────────────────────

function PriceTable({
  rows,
  confirmingIds,
  confirmMemos,
  setConfirmMemos,
  onConfirm,
  showConfirm,
}: {
  rows: PriceCheckResult[];
  confirmingIds: number[];
  confirmMemos: Record<number, string>;
  setConfirmMemos: Dispatch<SetStateAction<Record<number, string>>>;
  onConfirm: (row: PriceCheckResult) => void;
  showConfirm: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead>
          <tr>
            <th className={`${TABLE_HEADER} text-left`}>Product</th>
            <th className={`${TABLE_HEADER} text-left hidden sm:table-cell`}>Category</th>
            <th className={`${TABLE_HEADER} text-right`}>Baseline</th>
            <th className={`${TABLE_HEADER} text-right`}>Current</th>
            <th className={`${TABLE_HEADER} text-right`}>Change</th>
            <th className={`${TABLE_HEADER} text-center`}>Status</th>
            <th className={`${TABLE_HEADER} text-left hidden md:table-cell`}>Last Confirmed</th>
            {showConfirm && <th className={`${TABLE_HEADER} text-left`}>Confirm</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const rate = row.discount_rate;
            const rateClass =
              rate == null
                ? "text-zinc-500"
                : rate < -0.001
                ? "text-red-400 font-semibold"
                : rate > 0.001
                ? "text-amber-400 font-semibold"
                : "text-emerald-400";

            return (
              <tr key={`${row.store_code}-${row.product_id}`} className={TABLE_ROW}>
                <td className={TABLE_CELL}>
                  <div className="font-medium text-white">{row.product_name}</div>
                  <div className={`${TABLE_HEADER} mt-0.5`}>{row.product_id}</div>
                </td>
                <td className={`${TABLE_CELL} hidden sm:table-cell text-zinc-400`}>
                  {row.category || "—"}
                </td>
                <td className={`${TABLE_CELL} text-right tabular-nums`}>
                  {fmtPrice(row.baseline_price)}
                </td>
                <td className={`${TABLE_CELL} text-right tabular-nums font-medium`}>
                  {fmtPrice(row.current_price)}
                </td>
                <td className={`${TABLE_CELL} text-right tabular-nums ${rateClass}`}>
                  <span className="flex items-center justify-end gap-1">
                    {rate != null && rate < -0.001 && <TrendingDown className="h-3 w-3" />}
                    {rate != null && rate > 0.001 && <TrendingUp className="h-3 w-3" />}
                    {fmtRate(row.discount_rate)}
                  </span>
                </td>
                <td className={`${TABLE_CELL} text-center`}>{statusBadge(row.status)}</td>
                <td className={`${TABLE_CELL} hidden md:table-cell`}>
                  {row.confirmed_by ? (
                    <div>
                      <div className="text-xs text-zinc-300">{row.confirmed_by}</div>
                      <div className={TABLE_HEADER}>{fmtDatetime(row.confirmed_at)}</div>
                    </div>
                  ) : row.checked_at ? (
                    <div className={TABLE_HEADER}>{fmtDatetime(row.checked_at)}</div>
                  ) : (
                    <span className="text-zinc-600">—</span>
                  )}
                </td>
                {showConfirm && (
                  <td className={TABLE_CELL}>
                    <div className="flex items-center gap-2">
                      <input
                        className="w-28 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white placeholder:text-zinc-600 outline-none focus:border-violet-500/50"
                        placeholder="Note"
                        value={confirmMemos[row.id] || ""}
                        onChange={(e) =>
                          setConfirmMemos((m) => ({ ...m, [row.id]: e.target.value }))
                        }
                      />
                      <button
                        type="button"
                        onClick={() => onConfirm(row)}
                        disabled={confirmingIds.includes(row.id)}
                        className={SMALL_BUTTON}
                      >
                        {confirmingIds.includes(row.id) ? (
                          "..."
                        ) : (
                          <span className="flex items-center gap-1">
                            <ShieldCheck className="h-3 w-3" />
                            Confirm
                          </span>
                        )}
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
