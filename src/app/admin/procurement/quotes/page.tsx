"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessProcurementAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";

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

export default function ProcurementQuotesPage() {
  const auth = getAuth();
  const [allowed, setAllowed] = useState(false);
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
      "/api/admin/procurement/requests?city=manila&limit=200",
      { method: "GET" },
      requestedBy,
      pin,
    );
    setRequests(Array.isArray(reqRes?.rows) ? reqRes.rows : []);
  }, [pin, requestedBy]);

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
    try {
      await Promise.all([loadMasters(), loadRequests()]);
      if (requestId.trim()) await loadDetail(requestId.trim());
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
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
      const can = canAccessProcurementAdmin(
        String((refreshed || auth)?.role || ""),
        String((refreshed || auth)?.city || "").toLowerCase() === "dubai" ? "dubai" : "manila",
      );
      setAllowed(can);
      if (can) await loadAll();
    }
    void init();
  }, [auth, loadAll]);

  const requestItems = Array.isArray(detail?.request?.items) ? detail.request.items : [];

  if (!allowed) {
    return <div className="text-sm text-red-300">Procurement page is available only to authorized Manila admin roles.</div>;
  }

  return (
    <div className="space-y-4">
      {error ? <div className="text-sm text-red-300">{error}</div> : null}

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/20 p-3 md:grid-cols-5">
        <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Approver name" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input value={requestId} onChange={(e) => setRequestId(e.target.value)} placeholder="Request ID" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <button type="button" onClick={() => void loadDetail(requestId)} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm hover:bg-neutral-900">
          Load Request
        </button>
        <button type="button" onClick={() => void loadAll()} disabled={loading} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm hover:bg-neutral-900 disabled:opacity-60">
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
        <div className="text-sm font-medium">Request Selector</div>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {requests.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => {
                setRequestId(row.id);
                void loadDetail(row.id);
              }}
              className={[
                "rounded-xl border p-3 text-left",
                requestId === row.id ? "border-amber-500 bg-amber-950/20" : "border-neutral-800 bg-neutral-950/30 hover:bg-neutral-900/40",
              ].join(" ")}
            >
              <div className="text-sm text-neutral-100">{row.request_no}</div>
              <div className="mt-1 text-xs text-neutral-400">
                {row.requested_by} | {row.store_code || "-"} | {row.status}
              </div>
              <div className="mt-1 text-xs text-neutral-500">{Number(row.total_amount || 0).toFixed(2)} PHP</div>
            </button>
          ))}
          {!requests.length ? <div className="text-sm text-neutral-500">No requests found.</div> : null}
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
        <div className="text-sm font-medium">Quote Comparison</div>
        <div className="mt-1 text-xs text-neutral-500">
          Spec-aligned view: benchmark comparison, vendor validation, and lowest-vendor indicator per item.
        </div>
        <div className="mt-3 space-y-3">
          {requestItems.map((item, idx) => {
            const benchmark = benchmarkByName.get(normalizeKey(item.item_name)) || null;
            const vendor = vendorByAnyKey.get(normalizeKey(item.vendor_name)) || null;
            const benchmarkPrice = Number(benchmark?.benchmark_unit_price || 0);
            const actualPrice = Number(item.unit_price || 0);
            const deviationPct = benchmarkPrice > 0 ? ((actualPrice - benchmarkPrice) / benchmarkPrice) * 100 : 0;
            const deviationBand = benchmarkPrice <= 0 ? "NO_BENCHMARK" : deviationPct > 8 ? "RED" : deviationPct > 3 ? "YELLOW" : "GREEN";
            const quoteText = quoteInputByItem[idx] || "";
            const parsedQuotes = parseQuotes(quoteText);
            const lowestQuote = parsedQuotes.length
              ? parsedQuotes.reduce((acc, row) => (row.unit_price < acc.unit_price ? row : acc), parsedQuotes[0])
              : null;

            return (
              <div key={`${item.item_name}:${idx}`} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="text-sm text-neutral-100">
                    {item.item_name || "(no item name)"} | Qty {Number(item.qty || 0).toFixed(2)} {item.unit || ""}
                  </div>
                  <div className="text-xs text-neutral-400">
                    Requested vendor: {item.vendor_name || "-"} | Unit {actualPrice.toFixed(2)} PHP
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                  <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-300">
                    Benchmark: {benchmarkPrice > 0 ? `${benchmarkPrice.toFixed(2)} PHP` : "N/A"}
                  </div>
                  <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-300">
                    Deviation: {benchmarkPrice > 0 ? formatPct(deviationPct) : "-"} ({deviationBand})
                  </div>
                  <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-300">
                    Vendor status: {vendor ? `${vendor.status} / Risk ${vendor.risk_level}` : "NOT_IN_MASTER"}
                  </div>
                </div>

                <div className="mt-2">
                  <input
                    value={quoteText}
                    onChange={(e) => setQuoteInputByItem((prev) => ({ ...prev, [idx]: e.target.value }))}
                    placeholder="Manual quotes (e.g. VENDORA:98, VENDORB:95)"
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                  />
                </div>

                {parsedQuotes.length ? (
                  <div className="mt-2 rounded-lg border border-neutral-800 bg-neutral-950 p-2 text-xs">
                    <div className="text-neutral-400">Lowest vendor indicator:</div>
                    <div className="mt-1 text-emerald-200">
                      {lowestQuote?.vendor} @ {Number(lowestQuote?.unit_price || 0).toFixed(2)} PHP
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
          {!requestItems.length ? <div className="text-sm text-neutral-500">Select a request to start quote comparison.</div> : null}
        </div>
      </div>
    </div>
  );
}
