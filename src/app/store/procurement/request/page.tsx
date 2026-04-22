"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";
import { formatRelativeAge, getRecentBadgeMaxAgeMs, isOlderThan, useRelativeAgeNow } from "@/lib/timeAgo";

type ReqItem = {
  row_key?: string;
  item_name: string;
  category: string;
  spec: string;
  qty: number;
  unit: string;
  unit_price: number;
  vendor_name: string;
  needed_by_date: string;
};

type ReqRow = {
  id: string;
  request_no: string;
  requested_by: string;
  store_code: string;
  request_date: string;
  total_amount: number;
  urgent_flag: boolean;
  status: string;
  current_approval_level: number;
};

type CatalogItem = {
  source_row_id: string;
  item_name: string;
  category: string;
  section: string;
  unit: string;
  suggested_unit_price: number;
  suggested_qty: number;
  line_total: number;
  store: string;
  order_date: string;
  order_type: string;
  source_sheet: string;
};

type CatalogCategory = {
  category: string;
  items: CatalogItem[];
};

type SupplierCatalog = {
  supplier: string;
  category_count: number;
  item_count: number;
  categories: CatalogCategory[];
};

type CatalogResponse = {
  suppliers?: SupplierCatalog[];
  categories?: string[];
};

const DUBAI_CURATED_STORES = ["ALL", "Al Barsha", "Al Mina", "B Bay", "JLT", "M City"];
const DUBAI_CURATED_CATEGORIES = ["Kitchen Ingredients", "Warehouse", "Central Kitchen"];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toCatalogRowKey(supplier: string, item: CatalogItem, fallbackIndex: number): string {
  const base = String(item.source_row_id || "").trim();
  if (base) return `${supplier}::${base}`;
  return `${supplier}::${item.item_name}::${item.category}::${item.unit}::${fallbackIndex}`;
}

function toSupplierAnchor(supplier: string): string {
  return `supplier-${supplier.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown"}`;
}

const PAGE_BG = "min-h-screen text-white";
const GLASS_PANEL = "rounded-2xl border border-white/8 bg-violet-950/30 backdrop-blur-xl";
const SUB_PANEL = "rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/18 to-purple-500/10";
const FIELD_CLASS =
  "rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20";
const PRIMARY_BUTTON =
  "rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 px-4 py-2 text-sm font-semibold text-white transition-all duration-200 shadow-lg shadow-violet-500/25 hover:scale-[1.02] hover:from-violet-400 hover:to-purple-400 hover:shadow-violet-500/40 active:scale-[0.98] disabled:opacity-60";
const SECONDARY_BUTTON =
  "rounded-xl border border-violet-400/15 bg-violet-950/30 px-4 py-2 text-sm text-white transition-all duration-200 hover:border-violet-500/25 hover:bg-violet-950/45 disabled:opacity-60";
const SMALL_LINK =
  "rounded-xl border border-violet-400/15 bg-violet-950/30 px-3 py-2 text-xs text-white transition-all duration-200 hover:border-violet-500/25 hover:bg-violet-950/45";

export default function StoreProcurementRequestPage() {
  const LAST_CREATED_REQUEST_KEY = "store_procurement_last_created_request";
  const LAST_CREATED_REQUEST_ITEMS_KEY = "store_procurement_last_created_request_items";
  const LAST_CREATED_MAX_AGE_MS = getRecentBadgeMaxAgeMs();
  const relativeNowMs = useRelativeAgeNow();
  const auth = useMemo(() => getAuth(), []);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [storeCode, setStoreCode] = useState("");
  const [requestDate, setRequestDate] = useState(todayIso());
  const [urgentFlag, setUrgentFlag] = useState(false);
  const [newVendorFlag, setNewVendorFlag] = useState(false);
  const [items, setItems] = useState<ReqItem[]>([]);
  const [rows, setRows] = useState<ReqRow[]>([]);
  const [lastCreatedRequestId, setLastCreatedRequestId] = useState("");
  const [lastCreatedRequestNo, setLastCreatedRequestNo] = useState("");
  const [lastCreatedRequestAt, setLastCreatedRequestAt] = useState("");
  const [lastCreatedItems, setLastCreatedItems] = useState<ReqItem[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [city, setCity] = useState((auth?.city || "manila").toLowerCase());
  const [showSubmitReview, setShowSubmitReview] = useState(false);
  const [reviewMode, setReviewMode] = useState<"draft" | "submit" | "">("");
  const [submitChecked, setSubmitChecked] = useState(false);
  const [catalogStores, setCatalogStores] = useState<string[]>([]);
  const [catalogCategories, setCatalogCategories] = useState<string[]>([]);
  const [selectedCatalogCategory, setSelectedCatalogCategory] = useState("Kitchen Ingredients");
  const [catalogSuppliers, setCatalogSuppliers] = useState<SupplierCatalog[]>([]);
  const [catalogBusy, setCatalogBusy] = useState(false);
  const initRef = useRef(false);
  const cityLabel = city === "dubai" ? "Dubai" : "Manila";
  const currencyCode = city === "dubai" ? "AED" : "PHP";

  const loadMyRequests = useCallback(async (cityOverride?: string) => {
    setError("");
    try {
      const activeCity = String(cityOverride || city || "manila").trim().toLowerCase() || "manila";
      const qs = new URLSearchParams({
        city: activeCity,
        requested_by: requestedBy.trim(),
        limit: "200",
      });
      const data = await procurementJson<{ rows: ReqRow[] }>(
        `/api/admin/procurement/requests?${qs.toString()}`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }, [city, pin, requestedBy]);

  const updateItem = (rowKey: string, patch: Partial<ReqItem>) => {
    setShowSubmitReview(false);
    setSubmitChecked(false);
    setItems((prev) => prev.map((item) => (item.row_key === rowKey ? { ...item, ...patch } : item)));
  };

  const validItems = useMemo(
    () =>
      items
        .map((item) => ({
          ...item,
          item_name: String(item.item_name || "").trim(),
          category: String(item.category || "").trim(),
          spec: String(item.spec || "").trim(),
          unit: String(item.unit || "").trim(),
          vendor_name: String(item.vendor_name || "").trim(),
          needed_by_date: String(item.needed_by_date || "").trim(),
        }))
        .filter((item) => item.item_name && Number(item.qty || 0) > 0),
    [items],
  );

  // Group validItems by supplier for PO preview
  const validItemsBySupplier = useMemo(() => {
    const map = new Map<string, ReqItem[]>();
    for (const item of validItems) {
      const s = item.vendor_name || "Unknown";
      map.set(s, [...(map.get(s) || []), item]);
    }
    return Array.from(map.entries()).map(([supplier, rows]) => ({ supplier, rows }));
  }, [validItems]);

  const validItemsTotal = useMemo(
    () => validItems.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unit_price || 0), 0),
    [validItems],
  );

  const lastCreatedItemsTotal = useMemo(
    () => lastCreatedItems.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unit_price || 0), 0),
    [lastCreatedItems],
  );

  const catalogGridItems = useMemo(
    () =>
      catalogSuppliers.flatMap((supplier) =>
        supplier.categories.flatMap((category) =>
          category.items.map((item, index) => ({
            row_key: toCatalogRowKey(supplier.supplier, item, index),
            item_name: item.item_name,
            category: item.category || category.category || "",
            spec: [item.section, item.order_type].filter(Boolean).join(" | "),
            qty: 0,
            unit: item.unit || "",
            unit_price: Number(item.suggested_unit_price || 0),
            vendor_name: supplier.supplier,
            needed_by_date: requestDate,
          })),
        ),
      ),
    [catalogSuppliers, requestDate],
  );

  const supplierSections = useMemo(() => {
    const groups = new Map<string, ReqItem[]>();
    for (const item of items) {
      const supplier = String(item.vendor_name || "").trim() || "Unknown supplier";
      const existing = groups.get(supplier) || [];
      existing.push(item);
      groups.set(supplier, existing);
    }
    return Array.from(groups.entries()).map(([supplier, rows]) => ({
      supplier,
      anchor: toSupplierAnchor(supplier),
      rows,
      enteredCount: rows.filter((row) => Number(row.qty || 0) > 0).length,
    }));
  }, [items]);

  const loadCatalogStores = useCallback(
    async (cityOverride?: string) => {
      try {
        const activeCity = String(cityOverride || city || "manila").trim().toLowerCase() || "manila";
        if (activeCity === "dubai") {
          setCatalogStores(DUBAI_CURATED_STORES);
          setCatalogCategories(DUBAI_CURATED_CATEGORIES);
          if (!DUBAI_CURATED_STORES.includes(storeCode)) {
            setStoreCode("ALL");
          }
          if (!DUBAI_CURATED_CATEGORIES.includes(selectedCatalogCategory)) {
            setSelectedCatalogCategory(DUBAI_CURATED_CATEGORIES[0]);
          }
          return;
        }
        const qs = new URLSearchParams({
          city: activeCity,
          limit: "300",
        });
        const data = await procurementJson<{ stores?: string[] }>(
          `/api/admin/procurement/requests/catalog-stores?${qs.toString()}`,
          { method: "GET" },
          requestedBy,
          pin,
        );
        const stores = Array.isArray(data?.stores) ? data.stores : [];
        setCatalogStores(stores);
        setCatalogCategories([]);
        if (!storeCode.trim()) {
          const preferredStore = stores.find((store) => String(store || "").trim().toUpperCase() === "ALL") || "";
          if (preferredStore) setStoreCode(preferredStore);
        }
      } catch (e: any) {
        setError(e?.message || String(e));
      }
    },
    [city, pin, requestedBy, selectedCatalogCategory, storeCode],
  );

  const loadItemCatalog = useCallback(
    async (opts?: { cityOverride?: string; storeOverride?: string }) => {
      const activeCity = String(opts?.cityOverride || city || "manila").trim().toLowerCase() || "manila";
      const activeStore = String(opts?.storeOverride || storeCode || "").trim();
      if (!activeStore) {
        setCatalogSuppliers([]);
        return;
      }
      setCatalogBusy(true);
      try {
        let data: CatalogResponse;
        if (activeCity === "dubai") {
          const qs = new URLSearchParams({
            city: activeCity,
            category: selectedCatalogCategory,
            store: activeStore,
            limit: "5000",
          });
          data = await procurementJson<CatalogResponse>(
            `/api/admin/procurement/requests/curated-catalog?${qs.toString()}`,
            { method: "GET" },
            requestedBy,
            pin,
          );
        } else {
          const qs = new URLSearchParams({
            city: activeCity,
            store: activeStore,
            date_to: requestDate.trim(),
            limit: "3000",
          });
          data = await procurementJson<CatalogResponse>(
            `/api/admin/procurement/requests/item-catalog?${qs.toString()}`,
            { method: "GET" },
            requestedBy,
            pin,
          );
        }
        const suppliers = Array.isArray(data?.suppliers) ? data.suppliers : [];
        const categories = Array.isArray(data?.categories) ? data.categories.filter(Boolean) : [];
        if (activeCity === "dubai") {
          setCatalogCategories(categories.length ? categories : DUBAI_CURATED_CATEGORIES);
        }
        setCatalogSuppliers(suppliers);
      } catch (e: any) {
        setCatalogSuppliers([]);
        setError(e?.message || String(e));
      } finally {
        setCatalogBusy(false);
      }
    },
    [city, pin, requestDate, requestedBy, selectedCatalogCategory, storeCode],
  );

  const createRequest = async (submitNow: boolean) => {
    if (!requestedBy.trim()) {
      setError("Requested by is required.");
      return;
    }
    if (!requestDate.trim()) {
      setError("Request date is required.");
      return;
    }
    if (!storeCode.trim()) {
      setError("Store selection is required.");
      return;
    }
    if (!validItems.length) {
      setError("At least one valid item is required.");
      return;
    }
    if (reviewMode && !submitChecked) {
      setError("Please confirm you checked for missing items and mistakes before continuing.");
      return;
    }

    setBusy(submitNow ? "submit" : "create");
    setError("");
    setInfo("");
    try {
      const createdItemsSnapshot = validItems.map((item) => ({ ...item }));
      const created = await procurementJson<{ request?: { id: string; request_no: string } }>(
        "/api/admin/procurement/requests",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            city,
            requested_by: requestedBy.trim(),
            store_code: storeCode.trim(),
            request_date: requestDate.trim(),
            urgent_flag: urgentFlag,
            new_vendor_flag: newVendorFlag,
            items: validItems.map((item) => ({
              item_name: item.item_name,
              category: item.category,
              spec: item.spec,
              qty: Number(item.qty || 0),
              unit: item.unit,
              unit_price: Number(item.unit_price || 0),
              vendor_name: item.vendor_name,
              needed_by_date: item.needed_by_date || "",
            })),
          }),
        },
        requestedBy,
        pin,
      );
      const requestId = String(created?.request?.id || "").trim();
      const requestNo = String(created?.request?.request_no || "").trim();
      const createdAt = new Date().toISOString();
      if (!requestId) throw new Error("Request ID was not returned.");
      setLastCreatedRequestId(requestId);
      setLastCreatedRequestNo(requestNo);
      setLastCreatedRequestAt(createdAt);
      setLastCreatedItems(createdItemsSnapshot);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(
            LAST_CREATED_REQUEST_KEY,
            JSON.stringify({
              id: requestId,
              request_no: requestNo,
              at: createdAt,
            }),
          );
          window.localStorage.setItem(LAST_CREATED_REQUEST_ITEMS_KEY, JSON.stringify(createdItemsSnapshot));
        } catch {}
      }

      if (submitNow) {
        await procurementJson(
          "/api/admin/procurement/requests/submit",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              request_id: requestId,
              approver_name: requestedBy.trim(),
              pin: pin.trim(),
            }),
          },
          requestedBy,
          pin,
        );
        setInfo(`Request submitted: ${requestNo || requestId}`);
      } else {
        setInfo(`Request created as draft: ${requestNo || requestId}`);
      }
      setShowSubmitReview(false);
      setReviewMode("");
      setSubmitChecked(false);
      await loadMyRequests();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy("");
    }
  };

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      let queryCity = "";
      let queryCategory = "";
      if (typeof window !== "undefined") {
        const sp = new URLSearchParams(window.location.search);
        queryCity = String(sp.get("city") || "").toLowerCase();
        const queryStore = String(sp.get("store") || "").trim();
        if (queryStore) setStoreCode(queryStore);
        queryCategory = String(sp.get("catalog_category") || "").trim();
      }
      const initialCity = queryCity || city || String(refreshed?.city || auth?.city || "manila").toLowerCase() || "manila";
      setCity(initialCity);
      if (initialCity === "dubai") {
        setCatalogCategories(DUBAI_CURATED_CATEGORIES);
        setSelectedCatalogCategory(queryCategory || DUBAI_CURATED_CATEGORIES[0]);
        if (typeof window !== "undefined") {
          const sp = new URLSearchParams(window.location.search);
          if (!String(sp.get("store") || "").trim()) {
            setStoreCode("ALL");
          }
        }
      }
      if ((refreshed?.staffName || "").trim() && !requestedBy.trim()) {
        setRequestedBy(String(refreshed?.staffName || "").trim());
      }
      await loadCatalogStores(initialCity);
      await loadMyRequests(initialCity);
    }
    void init();
  }, [auth, city, loadCatalogStores, loadMyRequests, requestedBy]);

  useEffect(() => {
    if (!storeCode.trim()) {
      setCatalogSuppliers([]);
      return;
    }
    void loadItemCatalog();
  }, [loadItemCatalog, requestDate, selectedCatalogCategory, storeCode]);

  useEffect(() => {
    setItems((prev) => {
      const prevMap = new Map(prev.map((item) => [String(item.row_key || ""), item]));
      return catalogGridItems.map((item) => {
        const existing = prevMap.get(String(item.row_key || ""));
        if (!existing) return item;
        return {
          ...item,
          qty: Number(existing.qty || 0),
          unit: existing.unit || item.unit,
          unit_price: Number(existing.unit_price || 0),
          needed_by_date: existing.needed_by_date || item.needed_by_date,
        };
      });
    });
    setShowSubmitReview(false);
    setReviewMode("");
    setSubmitChecked(false);
  }, [catalogGridItems]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(LAST_CREATED_REQUEST_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { id?: string; request_no?: string; at?: string };
      const id = String(parsed?.id || "").trim();
      const requestNo = String(parsed?.request_no || "").trim();
      const at = String(parsed?.at || "").trim();
      if (at && isOlderThan(at, LAST_CREATED_MAX_AGE_MS, relativeNowMs)) {
        window.localStorage.removeItem(LAST_CREATED_REQUEST_KEY);
        window.localStorage.removeItem(LAST_CREATED_REQUEST_ITEMS_KEY);
        return;
      }
      if (id) {
        setLastCreatedRequestId(id);
        setLastCreatedRequestNo(requestNo);
        setLastCreatedRequestAt(at);
        try {
          const rawItems = window.localStorage.getItem(LAST_CREATED_REQUEST_ITEMS_KEY);
          const parsedItems = rawItems ? JSON.parse(rawItems) : [];
          setLastCreatedItems(Array.isArray(parsedItems) ? parsedItems : []);
        } catch {
          setLastCreatedItems([]);
        }
      }
    } catch {}
  }, [LAST_CREATED_MAX_AGE_MS, LAST_CREATED_REQUEST_ITEMS_KEY, LAST_CREATED_REQUEST_KEY, relativeNowMs]);

  return (
    <div className={PAGE_BG}>
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-8">
      {error ? <div className="rounded-xl border border-red-900/40 bg-red-950/20 px-3 py-2 text-sm text-red-300">{error}</div> : null}
      {info ? <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-300">{info}</div> : null}
      {lastCreatedRequestId ? (
        <div className="rounded-xl border border-emerald-700/60 bg-emerald-900/20 px-3 py-2 text-xs text-emerald-200">
          Last created request: <span className="font-mono">{lastCreatedRequestNo || lastCreatedRequestId}</span>
          {lastCreatedRequestAt ? <span className="ml-2 text-[11px] text-emerald-300/90">({formatRelativeAge(lastCreatedRequestAt, relativeNowMs)})</span> : null}
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href={`/store/procurement/receiving?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(lastCreatedRequestId)}`} className={SMALL_LINK}>
              Continue to Receiving
            </Link>
            <Link href={`/store/procurement/claim?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(lastCreatedRequestId)}`} className={SMALL_LINK}>
              Continue to Claim
            </Link>
          </div>
          {lastCreatedItems.length ? (
            <div className="mt-3 overflow-x-auto rounded-xl border border-emerald-700/40">
              <table className="min-w-full text-[11px]">
                <thead className="bg-emerald-950/40 text-emerald-100">
                  <tr>
                    <th className="px-2 py-2 text-left">Item</th>
                    <th className="px-2 py-2 text-left">Category</th>
                    <th className="px-2 py-2 text-left">Vendor</th>
                    <th className="px-2 py-2 text-right">Qty</th>
                    <th className="px-2 py-2 text-left">Unit</th>
                    <th className="px-2 py-2 text-right">Unit Price ({currencyCode})</th>
                    <th className="px-2 py-2 text-right">Line Total ({currencyCode})</th>
                  </tr>
                </thead>
                <tbody>
                  {lastCreatedItems.map((item, idx) => (
                    <tr key={`${item.item_name}-${idx}`} className="border-t border-emerald-800/30 bg-neutral-950/20">
                      <td className="px-2 py-2">{item.item_name}</td>
                      <td className="px-2 py-2">{item.category || "-"}</td>
                      <td className="px-2 py-2">{item.vendor_name || "-"}</td>
                      <td className="px-2 py-2 text-right">{Number(item.qty || 0)}</td>
                      <td className="px-2 py-2">{item.unit || "-"}</td>
                      <td className="px-2 py-2 text-right">{Number(item.unit_price || 0).toFixed(2)}</td>
                      <td className="px-2 py-2 text-right">{(Number(item.qty || 0) * Number(item.unit_price || 0)).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-emerald-800/30 px-2 py-2 text-right text-[11px] text-emerald-100">
                Selected item total: {lastCreatedItemsTotal.toFixed(2)} {currencyCode}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={`${GLASS_PANEL} p-4`}>
        <div className="text-sm font-medium">Store Procurement Request</div>
        <div className="mt-1 text-xs text-neutral-500">Create a store-side purchase request and optionally submit to approval workflow.</div>
        <div className="mt-2 text-xs text-violet-200">Current city: {cityLabel}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/store/procurement" className={SMALL_LINK}>
            Home
          </Link>
          <Link href={`/store/procurement/history?city=${encodeURIComponent(city || "manila")}`} className={SMALL_LINK}>
            Go to History
          </Link>
          <Link href={`/store/procurement/receiving?city=${encodeURIComponent(city || "manila")}`} className={SMALL_LINK}>
            Go to Receiving
          </Link>
          <Link href={`/store/procurement/claim?city=${encodeURIComponent(city || "manila")}`} className={SMALL_LINK}>
            Go to Claim
          </Link>
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-3 p-3 md:grid-cols-6 ${GLASS_PANEL}`}>
        <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Requested by" className={FIELD_CLASS} />
        <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" className={FIELD_CLASS} />
        <select
          value={city}
          onChange={(e) => {
            const nextCity = String(e.target.value || "manila").toLowerCase();
            setCity(nextCity);
            setStoreCode(nextCity === "dubai" ? "ALL" : "");
            setCatalogCategories(nextCity === "dubai" ? DUBAI_CURATED_CATEGORIES : []);
            setSelectedCatalogCategory("Kitchen Ingredients");
            setCatalogSuppliers([]);
            setItems([]);
            void loadCatalogStores(nextCity);
            void loadMyRequests(nextCity);
          }}
          className={FIELD_CLASS}
        >
          <option value="manila">Manila</option>
          <option value="dubai">Dubai</option>
        </select>
        <select value={storeCode} onChange={(e) => setStoreCode(String(e.target.value || ""))} className={FIELD_CLASS}>
          <option value="">Select store (required)</option>
          {catalogStores.map((store) => (
            <option key={store} value={store}>
              {store}
            </option>
          ))}
        </select>
        <input type="date" value={requestDate} onChange={(e) => setRequestDate(e.target.value)} className={FIELD_CLASS} />
        <button type="button" onClick={() => void loadMyRequests()} className={SECONDARY_BUTTON}>
          Refresh My Requests
        </button>
        <label className="inline-flex items-center gap-2 text-xs text-neutral-300">
          <input type="checkbox" checked={urgentFlag} onChange={(e) => setUrgentFlag(e.target.checked)} />
          Urgent
        </label>
        <label className="inline-flex items-center gap-2 text-xs text-neutral-300">
          <input type="checkbox" checked={newVendorFlag} onChange={(e) => setNewVendorFlag(e.target.checked)} />
          New vendor
        </label>
      </div>

      {/* print-only styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #po-print-area, #po-print-area * { visibility: visible; }
          #po-print-area { position: fixed; top: 0; left: 0; width: 100%; padding: 24px; background: white; color: black; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-start">
      <div className="space-y-4 lg:col-span-2">
      <div className={`${GLASS_PANEL} p-4`}>
        <div className="text-sm font-medium">{city === "dubai" ? "Supplier Item List (curated catalog)" : "Supplier Item List (from Excel imports)"}</div>
        <div className="mt-1 text-xs text-neutral-400">
          {city === "dubai"
            ? "Excel-like view: every supplier section shows the full curated item list. Enter only the rows you want to request."
            : "Excel-like view: every supplier section shows the full imported item list for this store. Rows with qty 0 will be ignored."}
        </div>
        {!catalogStores.length ? (
          <div className="mt-2 text-xs text-amber-300">
            {city === "dubai"
              ? `No curated catalog found for ${cityLabel}.`
              : `No store catalog found for ${cityLabel}. Please sync the city workbook in Procurement Imports first.`}
          </div>
        ) : null}
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
          {city === "dubai" ? (
            <select
              value={selectedCatalogCategory}
              onChange={(e) => setSelectedCatalogCategory(String(e.target.value || "Kitchen Ingredients"))}
              className={FIELD_CLASS}
            >
              {catalogCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          ) : null}
          <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-neutral-300">
            {catalogBusy ? "Loading supplier list..." : `Suppliers: ${catalogSuppliers.length}`}
          </div>
          <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-neutral-300">
            {catalogBusy ? "Loading item rows..." : `Rows: ${items.length}`}
          </div>
          <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-neutral-300">
            Selected rows: {validItems.length}
          </div>
        </div>
        {supplierSections.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {supplierSections.map((section) => (
              <a
                key={section.anchor}
                href={`#${section.anchor}`}
                className="rounded-full border border-violet-500/25 bg-violet-500/12 px-3 py-1 text-[11px] text-violet-200 hover:bg-violet-500/18"
              >
                {section.supplier} ({section.enteredCount}/{section.rows.length})
              </a>
            ))}
          </div>
        ) : null}
      </div>

      <div className={`${GLASS_PANEL} p-4`}>
        <div className="mb-2 text-sm font-medium">Items</div>
        <div className="text-xs text-neutral-400">
          All items are shown per supplier. Rows with Qty 0 are excluded from the draft and submission.
        </div>
        <div className="mt-3 space-y-4">
          {catalogBusy ? <div className="text-xs text-neutral-400">Loading catalog...</div> : null}
          {!catalogBusy && !supplierSections.length ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-black/15 px-3 py-6 text-center text-xs text-neutral-500">
              {storeCode
                ? `No items found for "${selectedCatalogCategory}". Items must be registered in the inventory system first.`
                : "Select a store to load the supplier item list."}
            </div>
          ) : null}
          {supplierSections.map((section) => (
            <section key={section.anchor} id={section.anchor} className={`${SUB_PANEL}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/8 px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-violet-200">{section.supplier}</div>
                  <div className="text-[11px] text-neutral-400">
                    {section.enteredCount} / {section.rows.length} rows selected
                  </div>
                </div>
                <div className="text-[11px] text-neutral-400">Editable: Qty / Unit / Unit Price</div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="sticky top-0 bg-[#0c1024]/95 text-neutral-300">
                    <tr>
                      <th className="px-3 py-2 text-left">Item</th>
                      <th className="px-3 py-2 text-left">Category</th>
                      <th className="px-3 py-2 text-left">Spec</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-left">Unit</th>
                      <th className="px-3 py-2 text-right">Unit Price ({currencyCode})</th>
                      <th className="px-3 py-2 text-right">Line Total ({currencyCode})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.map((item) => (
                      <tr key={item.row_key || `${section.supplier}-${item.item_name}`} className="border-t border-white/8 bg-black/15">
                        <td className="px-3 py-2 text-neutral-100">{item.item_name}</td>
                        <td className="px-3 py-2 text-neutral-300">{item.category || "-"}</td>
                        <td className="px-3 py-2 text-neutral-400">{item.spec || "-"}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={item.qty}
                            onChange={(e) => updateItem(String(item.row_key || ""), { qty: Number(e.target.value || 0) })}
                            className="w-24 rounded-lg border border-white/8 bg-black/20 px-2 py-1.5 text-right text-xs text-white focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={item.unit}
                            onChange={(e) => updateItem(String(item.row_key || ""), { unit: e.target.value })}
                            className="w-24 rounded-lg border border-white/8 bg-black/20 px-2 py-1.5 text-xs text-white focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unit_price}
                            onChange={(e) => updateItem(String(item.row_key || ""), { unit_price: Number(e.target.value || 0) })}
                            className="w-28 rounded-lg border border-white/8 bg-black/20 px-2 py-1.5 text-right text-xs text-white focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
                          />
                        </td>
                        <td className="px-3 py-2 text-right text-neutral-300">
                          {(Number(item.qty || 0) * Number(item.unit_price || 0)).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              if (!storeCode.trim()) {
                setError("Store selection is required.");
                return;
              }
              if (!validItems.length) {
                setError("At least one valid item is required.");
                return;
              }
              setError("");
              setReviewMode("draft");
              setShowSubmitReview(true);
            }}
            disabled={busy !== ""}
            className={SECONDARY_BUTTON}
          >
            Review Before Create Draft
          </button>
          <button
            type="button"
            onClick={() => {
              if (!storeCode.trim()) {
                setError("Store selection is required.");
                return;
              }
              if (!validItems.length) {
                setError("At least one valid item is required.");
                return;
              }
              setError("");
              setReviewMode("submit");
              setShowSubmitReview(true);
            }}
            disabled={busy !== ""}
            className={PRIMARY_BUTTON}
          >
            Review Before Submit
          </button>
        </div>
      </div>
      </div>{/* end left column */}

      {/* ── PO Preview Panel (right) ── */}
      <div className="lg:col-span-1">
        <div className={`sticky top-4 ${GLASS_PANEL} p-4`} id="po-print-area">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-violet-200">Purchase Order</div>
            {validItems.length > 0 ? (
              <button
                type="button"
                onClick={() => window.print()}
                className="no-print rounded-lg border border-violet-400/20 bg-violet-900/30 px-3 py-1 text-xs text-violet-200 hover:bg-violet-900/50"
              >
                🖨 Print
              </button>
            ) : null}
          </div>

          {validItems.length === 0 ? (
            <div className="mt-4 text-center text-xs text-neutral-500">
              Enter a Qty to preview<br />the purchase order
            </div>
          ) : (
            <div className="mt-3 space-y-3 text-xs">
              {/* Header info */}
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl border border-white/8 bg-black/20 px-3 py-2">
                <span className="text-neutral-400">Supplier</span>
                <span className="text-white">{validItemsBySupplier.map(s => s.supplier).join(", ") || "-"}</span>
                <span className="text-neutral-400">Requested By</span>
                <span className="text-white">{requestedBy || "-"}</span>
                <span className="text-neutral-400">Store</span>
                <span className="text-white">{storeCode || "-"}</span>
                <span className="text-neutral-400">Date</span>
                <span className="text-white">{requestDate}</span>
                <span className="text-neutral-400">City</span>
                <span className="text-white">{cityLabel}</span>
              </div>

              {/* Items by supplier */}
              <div className="space-y-2">
                {validItemsBySupplier.map(({ supplier, rows }) => (
                  <div key={supplier} className="rounded-xl border border-violet-500/20 bg-violet-950/20">
                    <div className="border-b border-white/8 px-3 py-1.5 text-[11px] font-semibold text-violet-300">
                      {supplier}
                    </div>
                    <div className="divide-y divide-white/5">
                      {rows.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-2 px-3 py-1.5">
                          <span className="flex-1 text-neutral-200">{item.item_name}</span>
                          <span className="shrink-0 font-mono text-violet-200">
                            {Number(item.qty)} {item.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="flex items-center justify-between rounded-xl border border-violet-500/30 bg-violet-950/30 px-3 py-2 font-semibold">
                <span className="text-neutral-300">Total ({currencyCode})</span>
                <span className="text-white">{validItemsTotal.toFixed(2)}</span>
              </div>

              <div className="text-center text-[10px] text-neutral-500">
                After submission, you can view the order in your request history.
              </div>
            </div>
          )}
        </div>
      </div>
      </div>{/* end lg:grid */}

      {showSubmitReview ? (
        <div className={`${SUB_PANEL} p-4`}>
          <div className="text-sm font-medium text-emerald-100">
            {reviewMode === "draft" ? "Step 2: Review Draft Items" : "Step 2: Review Selected Ingredients"}
          </div>
          <div className="mt-1 text-xs text-emerald-200/90">
            {reviewMode === "draft"
              ? "Please review the draft contents carefully before creating the request."
              : "Please review your selected ingredients before sending the request."}
          </div>
          <div className="mt-3 overflow-x-auto rounded-xl border border-white/8">
            <table className="min-w-full text-xs">
              <thead className="bg-[#0c1024]/70 text-neutral-300">
                <tr>
                  <th className="px-2 py-2 text-left">Item</th>
                  <th className="px-2 py-2 text-left">Category</th>
                  <th className="px-2 py-2 text-left">Vendor</th>
                  <th className="px-2 py-2 text-right">Qty</th>
                  <th className="px-2 py-2 text-left">Unit</th>
                  <th className="px-2 py-2 text-right">Unit Price ({currencyCode})</th>
                  <th className="px-2 py-2 text-right">Line Total ({currencyCode})</th>
                </tr>
              </thead>
              <tbody>
                {validItems.map((item, idx) => (
                  <tr key={`${item.item_name}-${idx}`} className="border-t border-white/8 bg-black/15">
                    <td className="px-2 py-2">{item.item_name}</td>
                    <td className="px-2 py-2">{item.category || "-"}</td>
                    <td className="px-2 py-2">{item.vendor_name || "-"}</td>
                    <td className="px-2 py-2 text-right">{Number(item.qty || 0)}</td>
                    <td className="px-2 py-2">{item.unit || "-"}</td>
                    <td className="px-2 py-2 text-right">{Number(item.unit_price || 0).toFixed(2)}</td>
                    <td className="px-2 py-2 text-right">{(Number(item.qty || 0) * Number(item.unit_price || 0)).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-right text-xs text-neutral-300">Total: {validItemsTotal.toFixed(2)} {currencyCode}</div>
          <label className="mt-3 inline-flex items-start gap-2 text-xs text-amber-100">
            <input
              type="checkbox"
              checked={submitChecked}
              onChange={(e) => setSubmitChecked(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              {reviewMode === "draft"
                ? "I checked this draft for missing items and mistakes."
                : "I checked this submission for missing items and mistakes."}
            </span>
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void createRequest(reviewMode !== "draft")}
              disabled={busy !== "" || !submitChecked}
              className={PRIMARY_BUTTON}
            >
              {reviewMode === "draft"
                ? busy === "create"
                  ? "Creating..."
                  : "Confirm and Create Draft"
                : busy === "submit"
                  ? "Submitting..."
                  : "Confirm and Submit Request"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowSubmitReview(false);
                setReviewMode("");
                setSubmitChecked(false);
              }}
              disabled={busy !== ""}
              className={SECONDARY_BUTTON}
            >
              Back to Edit
            </button>
          </div>
        </div>
      ) : null}

      <div className={`${GLASS_PANEL} p-4`}>
        <div className="text-sm font-medium">My Recent Requests ({cityLabel})</div>
        <div className="mt-3 space-y-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className={`rounded-xl border p-3 ${
                row.id === lastCreatedRequestId
                  ? "border-emerald-700/60 bg-emerald-900/20"
                  : "border-white/8 bg-black/15"
              }`}
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2 text-sm text-neutral-100">
                  <span>{row.request_no}</span>
                  {row.id === lastCreatedRequestId ? (
                    <span className="rounded-full border border-emerald-700/60 bg-emerald-900/30 px-2 py-0.5 text-[10px] text-emerald-200">
                      Just created
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-xs text-neutral-400">{row.status} | Level {row.current_approval_level || 0}</div>
                  <Link href={`/store/procurement/receiving?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(row.id)}`} className={SMALL_LINK}>
                    Receiving
                  </Link>
                  <Link href={`/store/procurement/claim?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(row.id)}`} className={SMALL_LINK}>
                    Claim
                  </Link>
                </div>
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                {row.store_code || "-"} | {row.request_date || "-"} | {Number(row.total_amount || 0).toFixed(2)} {currencyCode}
              </div>
            </div>
          ))}
          {!rows.length ? <div className="text-sm text-neutral-500">No requests yet.</div> : null}
        </div>
      </div>
      </div>
    </div>
  );
}
