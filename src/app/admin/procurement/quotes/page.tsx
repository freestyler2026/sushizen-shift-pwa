"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";
import {
  GLASS_CARD,
  SECONDARY_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  T_PAGE_TITLE,
  T_SECTION,
  T_CAPTION,
  T_LABEL,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_ERROR,
  BADGE_INFO,
} from "@/lib/ui-tokens";
import { RefreshCw, AlertCircle, TrendingUp, Building2 } from "lucide-react";

type RequestListRow = {
  id: string;
  request_no: string;
  requested_by: string;
  store_code: string;
  status: string;
  total_amount: number;
};

type RequestItem = {
  item_name: string;
  category: string;
  qty: number;
  unit: string;
  unit_price: number;
  vendor_name: string;
  line_total: number;
};

type RequestDetail = {
  request?: {
    id: string;
    request_no: string;
    requested_by: string;
    store_code: string;
    status: string;
    items?: RequestItem[];
  };
};

type VendorRow = {
  vendor_code: string;
  registered_name: string;
  trade_name: string;
  risk_level: string;
  status: string;
};

type ItemBenchmarkRow = {
  item_code: string;
  item_name: string;
  benchmark_unit_price: number;
  tolerance_pct: number;
  preferred_vendor_code: string;
  high_risk_flag: boolean;
  active: boolean;
};

type ParsedQuote = {
  vendor: string;
  unit_price: number;
};

function normalizeKey(raw: string): string {
  return String(raw || "").trim().toUpperCase();
}

function parseQuotes(raw: string): ParsedQuote[] {
  return String(raw || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [vendor, price] = part.split(":");
      return {
        vendor: String(vendor || "").trim(),
        unit_price: Number(String(price || "").trim()),
      };
    })
    .filter((row) => row.vendor && Number.isFinite(row.unit_price) && row.unit_price > 0);
}

function formatPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function deviationBadge(band: string, pct: number, benchmarkPrice: number) {
  if (band === "NO_BENCHMARK") return <span className={BADGE_INFO}>No benchmark</span>;
  if (band === "RED") return <span className={BADGE_ERROR}>{formatPct(pct)}</span>;
  if (band === "YELLOW") return <span className={BADGE_WARNING}>{formatPct(pct)}</span>;
  return <span className={BADGE_SUCCESS}>{benchmarkPrice > 0 ? formatPct(pct) : "-"}</span>;
}

export default function ProcurementQuotesPage() {
  const auth = useMemo(() => getAuth(), []);
  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState<"manila" | "dubai">(
    String(auth?.city || "manila").toLowerCase() === "dubai" ? "dubai" : "manila",
  );
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [requests, setRequests] = useState<RequestListRow[]>([]);
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [benchmarks, setBenchmarks] = useState<ItemBenchmarkRow[]>([]);
  const [requestId, setRequestId] = useState("");
  const [detail, setDetail] = useState<RequestDetail>({});
  const [quoteInputByItem, setQuoteInputByItem] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const currency = city === "dubai" ? "AED" : "PHP";

  const vendorByAnyKey = useMemo(() => {
    const map = new Map<string, VendorRow>();
    for (const row of vendors) {
      for (const key of [row.vendor_code, row.registered_name, row.trade_name]) {
        const normalized = normalizeKey(key);
        if (normalized && !map.has(normalized)) map.set(normalized, row);
      }
    }
    return map;
  }, [vendors]);

  const benchmarkByName = useMemo(() => {
    const map = new Map<string, ItemBenchmarkRow>();
    for (const row of benchmarks) {
      const keyByName = normalizeKey(row.item_name);
      const keyByCode = normalizeKey(row.item_code);
      if (keyByName && !map.has(keyByName)) map.set(keyByName, row);
      if (keyByCode && !map.has(keyByCode)) map.set(keyByCode, row);
    }
    return map;
  }, [benchmarks]);

  const loadMasters = useCallback(async () => {
    const [vendorRes, itemRes] = await Promise.all([
      procurementJson<{ rows: VendorRow[] }>(
        "/api/admin/procurement/vendors?status=ACTIVE&limit=1000",
        { method: "GET" },
        requestedBy,
        pin,
      ),
      procurementJson<{ rows: ItemBenchmarkRow[] }>(
        "/api/admin/procurement/items?active_only=true&limit=2000",
        { method: "GET" },
        requestedBy,
        pin,
      ),
    ]);
    setVendors(Array.isArray(vendorRes?.rows) ? vendorRes.rows : []);
    setBenchmarks(Array.isArray(itemRes?.rows) ? itemRes.rows : []);
  }, [pin, requestedBy]);

  const loadRequests = useCallback(async () => {
    const reqRes = await procurementJson<{ rows: RequestListRow[] }>(
      `/api/admin/procurement/requests?city=${encodeURIComponent(city)}&limit=200`,
      { method: "GET" },
      requestedBy,
      pin,
    );
    setRequests(Array.isArray(reqRes?.rows) ? reqRes.rows : []);
  }, [city, pin, requestedBy]);

  const loadDetail = useCallback(
    async (rid: string) => {
      if (!rid.trim()) return;
      const detailRes = await procurementJson<RequestDetail>(
        `/api/admin/procurement/requests/${encodeURIComponent(rid.trim())}`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      setDetail(detailRes || {});
    },
    [pin, requestedBy],
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    const [mastersResult, requestsResult] = await Promise.allSettled([loadMasters(), loadRequests()]);
    if (mastersResult.status === "rejected") {
      console.warn("Failed to load vendor/benchmark data:", mastersResult.reason);
    }
    if (requestsResult.status === "rejected") {
      setError((requestsResult.reason as Error)?.message || String(requestsResult.reason));
    }
    try {
      if (requestId.trim()) await loadDetail(requestId.trim());
    } catch (e: any) {
      setError(e?.message || String(e));
    }
    setLoading(false);
  }, [loadDetail, loadMasters, loadRequests, requestId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const initialRequestId = sp.get("request_id") || "";
    if (initialRequestId) setRequestId((prev) => prev || initialRequestId);
  }, []);

  useEffect(() => {
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      const resolvedCity: "manila" | "dubai" =
        String((refreshed || auth)?.city || "").toLowerCase() === "dubai" ? "dubai" : "manila";
      setCity(resolvedCity);
      const can = canAccessProcurementAdmin(
        String((refreshed || auth)?.role || ""),
        resolvedCity,
      );
      setAllowed(can);
      if (can) await loadAll();
    }
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload when city changes (user switches city in the selector)
  useEffect(() => {
    if (allowed) void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);

  const requestItems = Array.isArray(detail?.request?.items) ? detail.request.items : [];

  if (!allowed) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Procurement quotes is only available to authorized admin roles.
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className={T_PAGE_TITLE}>Quote Comparison</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Benchmark comparison, vendor validation, and lowest-vendor indicator per item.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/25 bg-violet-500/15 px-2.5 py-0.5 text-xs font-medium text-violet-400">
          <TrendingUp className="h-3 w-3" />{currency}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/15 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {/* Session / Filter bar */}
      <div className={`${GLASS_CARD} p-4`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Approver Name</label>
            <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Name" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>PIN</label>
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••••••" className={INPUT_CLASS} />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 flex items-center gap-1.5`}><Building2 className="h-3 w-3" />City</label>
            <select value={city} onChange={(e) => setCity(e.target.value as "manila" | "dubai")} className={SELECT_CLASS}>
              <option value="manila">Manila</option>
              <option value="dubai">Dubai</option>
            </select>
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Request ID</label>
            <input value={requestId} onChange={(e) => setRequestId(e.target.value)} placeholder="Request ID" className={INPUT_CLASS} />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void loadDetail(requestId)}
              disabled={loading}
              className={`${SECONDARY_BUTTON} w-full flex items-center justify-center gap-2`}
            >
              Load Request
            </button>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void loadAll()}
              disabled={loading}
              className={`${SECONDARY_BUTTON} w-full flex items-center justify-center gap-2`}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>
      </div>

      {/* Request selector */}
      <div className={`${GLASS_CARD} p-4`}>
        <p className={`${T_SECTION} mb-3`}>Request Selector</p>
        {loading && !requests.length ? (
          <div className="flex items-center gap-3 py-6 text-zinc-500">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading requests…</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {requests.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => {
                  setRequestId(row.id);
                  void loadDetail(row.id);
                }}
                className={[
                  "rounded-xl border p-3 text-left transition-colors",
                  requestId === row.id
                    ? "border-amber-500/40 bg-amber-500/10"
                    : "border-white/8 bg-white/4 hover:bg-white/6",
                ].join(" ")}
              >
                <div className="text-sm font-medium text-white">{row.request_no}</div>
                <div className={`mt-1 ${T_CAPTION}`}>
                  {row.requested_by} | {row.store_code || "-"} | {row.status}
                </div>
                <div className={`mt-1 ${T_CAPTION}`}>
                  {Number(row.total_amount || 0).toFixed(2)} {currency}
                </div>
              </button>
            ))}
            {!requests.length && (
              <p className={T_CAPTION}>No requests found.</p>
            )}
          </div>
        )}
      </div>

      {/* Quote comparison */}
      <div className={`${GLASS_CARD} p-4`}>
        <p className={`${T_SECTION} mb-1`}>Quote Comparison</p>
        <p className={`${T_CAPTION} mb-4`}>Spec-aligned view: benchmark comparison, vendor validation, and lowest-vendor indicator per item.</p>

        <div className="space-y-3">
          {requestItems.map((item, idx) => {
            const benchmark = benchmarkByName.get(normalizeKey(item.item_name)) || null;
            const vendor = vendorByAnyKey.get(normalizeKey(item.vendor_name)) || null;
            const benchmarkPrice = Number(benchmark?.benchmark_unit_price || 0);
            const actualPrice = Number(item.unit_price || 0);
            const deviationPct = benchmarkPrice > 0 ? ((actualPrice - benchmarkPrice) / benchmarkPrice) * 100 : 0;
            const band = benchmarkPrice <= 0 ? "NO_BENCHMARK" : deviationPct > 8 ? "RED" : deviationPct > 3 ? "YELLOW" : "GREEN";
            const quoteText = quoteInputByItem[idx] || "";
            const parsedQuotes = parseQuotes(quoteText);
            const lowestQuote = parsedQuotes.length
              ? parsedQuotes.reduce((acc, row) => (row.unit_price < acc.unit_price ? row : acc), parsedQuotes[0])
              : null;

            return (
              <div key={`${item.item_name}:${idx}`} className="rounded-2xl border border-white/8 bg-white/4 p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="text-sm font-medium text-white">
                    {item.item_name || "(no item name)"} &mdash; Qty {Number(item.qty || 0).toFixed(2)} {item.unit || ""}
                  </div>
                  <div className={T_CAPTION}>
                    Vendor: {item.vendor_name || "-"} | Unit {actualPrice.toFixed(2)} {currency}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/8 bg-white/3 px-3 py-2 text-xs text-zinc-300">
                    <span className="text-zinc-500">Benchmark: </span>
                    {benchmarkPrice > 0 ? `${benchmarkPrice.toFixed(2)} ${currency}` : "N/A"}
                  </div>
                  <div className="rounded-xl border border-white/8 bg-white/3 px-3 py-2 text-xs text-zinc-300 flex items-center gap-2">
                    <span className="text-zinc-500">Deviation: </span>
                    {deviationBadge(band, deviationPct, benchmarkPrice)}
                  </div>
                  <div className="rounded-xl border border-white/8 bg-white/3 px-3 py-2 text-xs text-zinc-300">
                    <span className="text-zinc-500">Vendor status: </span>
                    {vendor ? `${vendor.status} / Risk ${vendor.risk_level}` : "NOT IN MASTER"}
                  </div>
                </div>

                <div className="mt-3">
                  <input
                    value={quoteText}
                    onChange={(e) => setQuoteInputByItem((prev) => ({ ...prev, [idx]: e.target.value }))}
                    placeholder="Manual quotes (e.g. VENDORA:98, VENDORB:95)"
                    className={INPUT_CLASS}
                  />
                </div>

                {parsedQuotes.length > 0 && (
                  <div className="mt-2 rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-3 py-2 text-xs">
                    <span className="text-zinc-400">Lowest vendor: </span>
                    <span className="font-medium text-emerald-300">
                      {lowestQuote?.vendor} @ {Number(lowestQuote?.unit_price || 0).toFixed(2)} {currency}
                    </span>
                    {parsedQuotes.length > 1 && (
                      <span className={`ml-2 ${T_CAPTION}`}>({parsedQuotes.length} quotes compared)</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {!requestItems.length && (
            <div className="flex items-center justify-center py-10">
              <p className={T_CAPTION}>Select a request to start quote comparison.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
