"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAuth, refreshAuthFromApi } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";
import { formatRelativeAge, getRecentBadgeMaxAgeMs, isOlderThan, parseIsoTimeMs, useRelativeAgeNow } from "@/lib/timeAgo";

type RequestRow = {
  id: string;
  request_no: string;
  store_code: string;
  request_date: string;
  total_amount: number;
  status: string;
  current_approval_level: number;
};

type RecentActivityItem = {
  kind: "request" | "receiving" | "claim";
  id: string;
  label: string;
  at: string;
  requestId?: string;
  caseId?: string;
};

type TimelineAction = {
  label: string;
  href: string;
};

type CatalogItem = {
  source_row_id: string;
  item_name: string;
  category: string;
  unit: string;
  suggested_unit_price: number;
};

type CatalogCategory = {
  category: string;
  items: CatalogItem[];
};

type SupplierCatalog = {
  supplier: string;
  item_count: number;
  categories: CatalogCategory[];
};

type CatalogResponse = {
  suppliers?: SupplierCatalog[];
  categories?: string[];
};

const DUBAI_CURATED_STORES = ["ALL", "Al Barsha", "Al Mina", "B Bay", "JLT", "M City"];
const DUBAI_CURATED_CATEGORIES = ["Kitchen Ingredients", "Warehouse", "Central Kitchen"];

export default function StoreProcurementHomePage() {
  const LAST_CREATED_REQUEST_KEY = "store_procurement_last_created_request";
  const LAST_CREATED_RECEIVING_KEY = "store_procurement_last_created_receiving";
  const LAST_CREATED_CLAIM_KEY = "store_procurement_last_created_claim";
  const RECENT_ACTIVITY_EXPANDED_KEY = "store_procurement_recent_activity_expanded";
  const RECENT_ACTIVITY_ACTIONS_EXPANDED_KEY = "store_procurement_recent_activity_actions_expanded";
  const LAST_CREATED_MAX_AGE_MS = getRecentBadgeMaxAgeMs();
  const relativeNowMs = useRelativeAgeNow();
  const auth = useMemo(() => getAuth(), []);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [city, setCity] = useState((auth?.city || "manila").toLowerCase());
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [lastCreatedRequestId, setLastCreatedRequestId] = useState("");
  const [lastCreatedRequestNo, setLastCreatedRequestNo] = useState("");
  const [lastCreatedRequestAt, setLastCreatedRequestAt] = useState("");
  const [lastCreatedReceivingId, setLastCreatedReceivingId] = useState("");
  const [lastCreatedReceivingNo, setLastCreatedReceivingNo] = useState("");
  const [lastCreatedReceivingRequestId, setLastCreatedReceivingRequestId] = useState("");
  const [lastCreatedReceivingAt, setLastCreatedReceivingAt] = useState("");
  const [lastCreatedClaimId, setLastCreatedClaimId] = useState("");
  const [lastCreatedClaimNo, setLastCreatedClaimNo] = useState("");
  const [lastCreatedClaimCaseId, setLastCreatedClaimCaseId] = useState("");
  const [lastCreatedClaimRequestId, setLastCreatedClaimRequestId] = useState("");
  const [lastCreatedClaimAt, setLastCreatedClaimAt] = useState("");
  const [showAllRecentActivities, setShowAllRecentActivities] = useState(false);
  const [expandedActionsByItem, setExpandedActionsByItem] = useState<Record<string, boolean>>({});
  const [catalogStores, setCatalogStores] = useState<string[]>([]);
  const [catalogCategories, setCatalogCategories] = useState<string[]>([]);
  const [selectedCatalogCategory, setSelectedCatalogCategory] = useState("Kitchen Ingredients");
  const [selectedStore, setSelectedStore] = useState("");
  const [catalogSuppliers, setCatalogSuppliers] = useState<SupplierCatalog[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [selectedCatalogItemId, setSelectedCatalogItemId] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const initRef = useRef(false);
  const cityLabel = city === "dubai" ? "Dubai" : "Manila";
  const currencyCode = city === "dubai" ? "AED" : "PHP";

  const loadMyRequests = useCallback(async (cityOverride?: string) => {
    setLoading(true);
    setError("");
    try {
      const activeCity = String(cityOverride || city || "manila").trim().toLowerCase() || "manila";
      const qs = new URLSearchParams({
        city: activeCity,
        requested_by: requestedBy.trim(),
        limit: "200",
      });
      const data = await procurementJson<{ rows: RequestRow[] }>(
        `/api/admin/procurement/requests?${qs.toString()}`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [city, pin, requestedBy]);

  const loadCatalogStores = useCallback(async (cityOverride?: string) => {
    try {
      const activeCity = String(cityOverride || city || "manila").trim().toLowerCase() || "manila";
      if (activeCity === "dubai") {
        setCatalogStores(DUBAI_CURATED_STORES);
        setCatalogCategories(DUBAI_CURATED_CATEGORIES);
        const preferredStore = "ALL";
        if (!DUBAI_CURATED_STORES.includes(selectedStore)) {
          setSelectedStore(preferredStore);
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
      const preferredStore = stores.find((store) => String(store || "").trim().toUpperCase() === "ALL") || stores[0] || "";
      if (!stores.includes(selectedStore)) {
        setSelectedStore(preferredStore);
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }, [city, pin, requestedBy, selectedCatalogCategory, selectedStore]);

  const loadItemCatalog = useCallback(async (storeOverride?: string) => {
    const activeStore = String(storeOverride || selectedStore || "").trim();
    if (!activeStore) {
      setCatalogSuppliers([]);
      setSelectedSupplier("");
      setSelectedCatalogItemId("");
      return;
    }
    setCatalogLoading(true);
    try {
      let data: CatalogResponse;
      if (city === "dubai") {
        const qs = new URLSearchParams({
          city,
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
          city,
          store: activeStore,
          limit: "2000",
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
      if (city === "dubai") {
        setCatalogCategories(categories.length ? categories : DUBAI_CURATED_CATEGORIES);
      }
      setCatalogSuppliers(suppliers);
      const nextSupplier = suppliers[0]?.supplier || "";
      setSelectedSupplier(nextSupplier);
      const firstItem = suppliers[0]?.categories?.[0]?.items?.[0];
      setSelectedCatalogItemId(firstItem?.source_row_id || "");
    } catch (e: any) {
      setError(e?.message || String(e));
      setCatalogSuppliers([]);
      setSelectedSupplier("");
      setSelectedCatalogItemId("");
    } finally {
      setCatalogLoading(false);
    }
  }, [city, pin, requestedBy, selectedCatalogCategory, selectedStore]);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      let queryCity = "";
      if (typeof window !== "undefined") {
        queryCity = String(new URLSearchParams(window.location.search).get("city") || "").toLowerCase();
      }
      const initialCity = queryCity || city || String(refreshed?.city || auth?.city || "manila").toLowerCase() || "manila";
      setCity(initialCity);
      if ((refreshed?.staffName || "").trim() && !requestedBy.trim()) {
        setRequestedBy(String(refreshed?.staffName || "").trim());
      }
      await loadCatalogStores(initialCity);
      await loadMyRequests(initialCity);
    }
    void init();
  }, [auth, city, loadCatalogStores, loadMyRequests, requestedBy]);

  useEffect(() => {
    if (!selectedStore.trim()) {
      setCatalogSuppliers([]);
      setSelectedSupplier("");
      setSelectedCatalogItemId("");
      return;
    }
    void loadItemCatalog();
  }, [loadItemCatalog, selectedCatalogCategory, selectedStore]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const sp = new URLSearchParams(window.location.search);
      const timelineFromQuery = String(sp.get("timeline") || "").toLowerCase();
      if (timelineFromQuery === "open") {
        setShowAllRecentActivities(true);
        return;
      }
      if (timelineFromQuery === "closed") {
        setShowAllRecentActivities(false);
        return;
      }
      const saved = window.localStorage.getItem(RECENT_ACTIVITY_EXPANDED_KEY);
      if (!saved) return;
      setShowAllRecentActivities(saved === "1");
    } catch {}
  }, [RECENT_ACTIVITY_EXPANDED_KEY]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(RECENT_ACTIVITY_EXPANDED_KEY, showAllRecentActivities ? "1" : "0");
    } catch {}
  }, [RECENT_ACTIVITY_EXPANDED_KEY, showAllRecentActivities]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      if (showAllRecentActivities) {
        url.searchParams.set("timeline", "open");
      } else if (String(url.searchParams.get("timeline") || "").toLowerCase() === "open") {
        url.searchParams.delete("timeline");
      }
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    } catch {}
  }, [showAllRecentActivities]);

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
        return;
      }
      if (id) {
        setLastCreatedRequestId(id);
        setLastCreatedRequestNo(requestNo);
        setLastCreatedRequestAt(at);
      }
    } catch {}
  }, [LAST_CREATED_MAX_AGE_MS, LAST_CREATED_REQUEST_KEY, relativeNowMs]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(LAST_CREATED_RECEIVING_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { id?: string; receiving_no?: string; request_id?: string; at?: string };
      const id = String(parsed?.id || "").trim();
      const receivingNo = String(parsed?.receiving_no || "").trim();
      const requestId = String(parsed?.request_id || "").trim();
      const at = String(parsed?.at || "").trim();
      if (at && isOlderThan(at, LAST_CREATED_MAX_AGE_MS, relativeNowMs)) {
        window.localStorage.removeItem(LAST_CREATED_RECEIVING_KEY);
        return;
      }
      if (id) {
        setLastCreatedReceivingId(id);
        setLastCreatedReceivingNo(receivingNo);
        setLastCreatedReceivingRequestId(requestId);
        setLastCreatedReceivingAt(at);
      }
    } catch {}
  }, [LAST_CREATED_MAX_AGE_MS, LAST_CREATED_RECEIVING_KEY, relativeNowMs]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(LAST_CREATED_CLAIM_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { id?: string; claim_no?: string; case_id?: string; request_id?: string; at?: string };
      const id = String(parsed?.id || "").trim();
      const claimNo = String(parsed?.claim_no || "").trim();
      const caseId = String(parsed?.case_id || "").trim();
      const requestId = String(parsed?.request_id || "").trim();
      const at = String(parsed?.at || "").trim();
      if (at && isOlderThan(at, LAST_CREATED_MAX_AGE_MS, relativeNowMs)) {
        window.localStorage.removeItem(LAST_CREATED_CLAIM_KEY);
        return;
      }
      if (id) {
        setLastCreatedClaimId(id);
        setLastCreatedClaimNo(claimNo);
        setLastCreatedClaimCaseId(caseId);
        setLastCreatedClaimRequestId(requestId);
        setLastCreatedClaimAt(at);
      }
    } catch {}
  }, [LAST_CREATED_CLAIM_KEY, LAST_CREATED_MAX_AGE_MS, relativeNowMs]);

  const counts = useMemo(() => {
    const out = {
      total: rows.length,
      draft: 0,
      inReview: 0,
      approved: 0,
      returned: 0,
    };
    for (const row of rows) {
      const st = String(row.status || "").toUpperCase();
      if (st === "DRAFT") out.draft += 1;
      else if (st === "IN_REVIEW" || st === "SUBMITTED") out.inReview += 1;
      else if (st === "APPROVED") out.approved += 1;
      else if (st === "RETURNED") out.returned += 1;
    }
    return out;
  }, [rows]);

  const recentActivities = useMemo<RecentActivityItem[]>(() => {
    const items: RecentActivityItem[] = [];
    if (lastCreatedRequestId) {
      items.push({
        kind: "request",
        id: lastCreatedRequestId,
        label: lastCreatedRequestNo || lastCreatedRequestId,
        at: lastCreatedRequestAt,
        requestId: lastCreatedRequestId,
      });
    }
    if (lastCreatedReceivingId) {
      items.push({
        kind: "receiving",
        id: lastCreatedReceivingId,
        label: lastCreatedReceivingNo || lastCreatedReceivingId,
        at: lastCreatedReceivingAt,
        requestId: lastCreatedReceivingRequestId,
      });
    }
    if (lastCreatedClaimId) {
      items.push({
        kind: "claim",
        id: lastCreatedClaimId,
        label: lastCreatedClaimNo || lastCreatedClaimId,
        at: lastCreatedClaimAt,
        requestId: lastCreatedClaimRequestId,
        caseId: lastCreatedClaimCaseId,
      });
    }
    return items.sort((a, b) => (parseIsoTimeMs(b.at) || 0) - (parseIsoTimeMs(a.at) || 0));
  }, [
    lastCreatedClaimAt,
    lastCreatedClaimCaseId,
    lastCreatedClaimId,
    lastCreatedClaimNo,
    lastCreatedClaimRequestId,
    lastCreatedReceivingAt,
    lastCreatedReceivingId,
    lastCreatedReceivingNo,
    lastCreatedReceivingRequestId,
    lastCreatedRequestAt,
    lastCreatedRequestId,
    lastCreatedRequestNo,
  ]);
  const visibleRecentActivities = useMemo(
    () => (showAllRecentActivities ? recentActivities : recentActivities.slice(0, 3)),
    [recentActivities, showAllRecentActivities],
  );
  const selectedSupplierCatalog = useMemo(
    () => catalogSuppliers.find((row) => row.supplier === selectedSupplier) || null,
    [catalogSuppliers, selectedSupplier],
  );
  const supplierItems = useMemo(
    () =>
      (selectedSupplierCatalog?.categories || []).flatMap((cat) =>
        (cat.items || []).map((item) => ({
          ...item,
          category_name: cat.category,
        })),
      ),
    [selectedSupplierCatalog],
  );
  const selectedCatalogItem = useMemo(
    () => supplierItems.find((row) => row.source_row_id === selectedCatalogItemId) || null,
    [selectedCatalogItemId, supplierItems],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem(RECENT_ACTIVITY_ACTIONS_EXPANDED_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as Record<string, boolean>;
      if (parsed && typeof parsed === "object") {
        setExpandedActionsByItem(parsed);
      }
    } catch {}
  }, [RECENT_ACTIVITY_ACTIONS_EXPANDED_KEY]);

  useEffect(() => {
    const activeKeys = new Set(recentActivities.map((item) => `${item.kind}:${item.id}`));
    setExpandedActionsByItem((prev) => {
      const next: Record<string, boolean> = {};
      for (const [key, value] of Object.entries(prev)) {
        if (activeKeys.has(key)) next[key] = Boolean(value);
      }
      return next;
    });
  }, [recentActivities]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        RECENT_ACTIVITY_ACTIONS_EXPANDED_KEY,
        JSON.stringify(expandedActionsByItem),
      );
    } catch {}
  }, [RECENT_ACTIVITY_ACTIONS_EXPANDED_KEY, expandedActionsByItem]);

  return (
    <div className="space-y-4">
      {error ? <div className="text-sm text-red-300">{error}</div> : null}
      {recentActivities.length ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/20 px-3 py-2 text-xs text-neutral-200">
          <div className="mb-2 text-xs font-medium text-neutral-300">Recent activity timeline</div>
          {recentActivities.length > 3 ? (
            <div className="mb-2">
              <button
                type="button"
                onClick={() => setShowAllRecentActivities((prev) => !prev)}
                className="rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-[11px] text-neutral-300 hover:bg-neutral-900"
              >
                {showAllRecentActivities ? "Show less" : `View all (${recentActivities.length})`}
              </button>
            </div>
          ) : null}
          <div className="space-y-2">
            {visibleRecentActivities.map((item) => (
              <div key={`${item.kind}:${item.id}`} className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] ${
                      item.kind === "request"
                        ? "border-emerald-700/60 bg-emerald-900/30 text-emerald-200"
                        : item.kind === "receiving"
                          ? "border-cyan-700/60 bg-cyan-900/30 text-cyan-200"
                          : "border-violet-700/60 bg-violet-900/30 text-violet-200"
                    }`}
                  >
                    {item.kind === "request" ? "Request" : item.kind === "receiving" ? "Receiving" : "Claim"}
                  </span>
                  <span className="font-mono">{item.label}</span>
                  {item.at ? <span className="text-[11px] text-neutral-400">({formatRelativeAge(item.at, relativeNowMs)})</span> : null}
                </div>
                {(() => {
                  const activityKey = `${item.kind}:${item.id}`;
                  const isExpanded = Boolean(expandedActionsByItem[activityKey]);
                  const actions: TimelineAction[] =
                    item.kind === "request" && item.requestId
                      ? [
                          {
                            label: "Continue to Receiving",
                            href: `/store/procurement/receiving?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(item.requestId)}`,
                          },
                          {
                            label: "Continue to Claim",
                            href: `/store/procurement/claim?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(item.requestId)}`,
                          },
                        ]
                      : item.kind === "receiving" && item.requestId
                        ? [
                            {
                              label: "Open Receiving",
                              href: `/store/procurement/receiving?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(item.requestId)}`,
                            },
                            {
                              label: "Continue to Claim",
                              href: `/store/procurement/claim?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(item.requestId)}&receiving_id=${encodeURIComponent(item.id)}`,
                            },
                          ]
                        : item.kind === "claim" && item.requestId
                          ? [
                              {
                                label: "Open Claim",
                                href: `/store/procurement/claim?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(item.requestId)}`,
                              },
                              ...(item.caseId
                                ? [
                                    {
                                      label: "Open Case",
                                      href: `/admin/procurement/cases/${item.caseId}`,
                                    } satisfies TimelineAction,
                                  ]
                                : []),
                            ]
                          : [];
                  const hasMoreActions = actions.length > 2;
                  const visibleActions = isExpanded ? actions : actions.slice(0, 2);
                  return (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {visibleActions.map((action) => (
                        <Link
                          key={`${action.label}:${action.href}`}
                          href={action.href}
                          className="rounded-xl border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-[11px] hover:bg-neutral-900"
                        >
                          {action.label}
                        </Link>
                      ))}
                      {hasMoreActions ? (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedActionsByItem((prev) => ({
                              ...prev,
                              [activityKey]: !isExpanded,
                            }))
                          }
                          className="rounded-xl border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-[11px] text-neutral-300 hover:bg-neutral-900"
                        >
                          {isExpanded ? "Less" : `More (${actions.length - 2})`}
                        </button>
                      ) : null}
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
        <div className="text-sm font-medium">Store Procurement Home</div>
        <div className="mt-1 text-xs text-neutral-500">Central entry point for store request, receiving, and claim operations.</div>
        <div className="mt-2 text-xs text-amber-200">Current city: {cityLabel}</div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
        <div className="text-sm font-medium">Request Starter (Store + Supplier + Item)</div>
        <div className="mt-1 text-xs text-neutral-500">
          Pick store and ingredient list here, then open Request Builder with the same city/store.
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-5">
          <select
            value={selectedStore}
            onChange={(e) => setSelectedStore(String(e.target.value || ""))}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
          >
            <option value="">Select store</option>
            {catalogStores.map((store) => (
              <option key={store} value={store}>
                {store}
              </option>
            ))}
          </select>
          {city === "dubai" ? (
            <select
              value={selectedCatalogCategory}
              onChange={(e) => setSelectedCatalogCategory(String(e.target.value || "Kitchen Ingredients"))}
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            >
              {catalogCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          ) : null}
          <select
            value={selectedSupplier}
            onChange={(e) => {
              const next = String(e.target.value || "");
              setSelectedSupplier(next);
              const firstItem =
                (catalogSuppliers.find((row) => row.supplier === next)?.categories || [])[0]?.items?.[0];
              setSelectedCatalogItemId(firstItem?.source_row_id || "");
            }}
            disabled={!selectedStore || catalogLoading}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm disabled:opacity-60"
          >
            <option value="">{catalogLoading ? "Loading suppliers..." : "Select supplier"}</option>
            {catalogSuppliers.map((supplier) => (
              <option key={supplier.supplier} value={supplier.supplier}>
                {supplier.supplier} ({supplier.item_count})
              </option>
            ))}
          </select>
          <select
            value={selectedCatalogItemId}
            onChange={(e) => setSelectedCatalogItemId(String(e.target.value || ""))}
            disabled={!selectedSupplier || catalogLoading}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm disabled:opacity-60"
          >
            <option value="">{catalogLoading ? "Loading items..." : "Select ingredient"}</option>
            {supplierItems.map((item) => (
              <option key={item.source_row_id || `${item.item_name}-${item.category_name}`} value={item.source_row_id}>
                {item.item_name} | {item.category_name} | {Number(item.suggested_unit_price || 0).toFixed(2)} {currencyCode}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <Link
              href={`/store/procurement/request?city=${encodeURIComponent(city || "manila")}${selectedStore ? `&store=${encodeURIComponent(selectedStore)}` : ""}${city === "dubai" ? `&catalog_category=${encodeURIComponent(selectedCatalogCategory)}` : ""}`}
              className="rounded-xl border border-emerald-700/60 bg-emerald-900/20 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-800/30"
            >
              Open Request Builder
            </Link>
          </div>
        </div>
        {selectedCatalogItem ? (
          <div className="mt-2 text-xs text-neutral-300">
            Selected: {selectedCatalogItem.item_name} ({selectedCatalogItem.category_name}) / {selectedCatalogItem.unit || "-"} / {Number(selectedCatalogItem.suggested_unit_price || 0).toFixed(2)} {currencyCode}
          </div>
        ) : null}
        {!catalogStores.length ? (
          <div className="mt-2 text-xs text-amber-300">
            {city === "dubai"
              ? `No curated catalog found for ${cityLabel}.`
              : `No item list found for ${cityLabel}. Please sync the ${cityLabel} workbook in Admin Procurement Imports first.`}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/20 p-3 md:grid-cols-5">
        <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Requested by" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        <select
          value={city}
          onChange={(e) => {
            const nextCity = String(e.target.value || "manila").toLowerCase();
            setCity(nextCity);
            setSelectedStore(nextCity === "dubai" ? "ALL" : "");
            setCatalogCategories(nextCity === "dubai" ? DUBAI_CURATED_CATEGORIES : []);
            setSelectedCatalogCategory("Kitchen Ingredients");
            setCatalogSuppliers([]);
            setSelectedSupplier("");
            setSelectedCatalogItemId("");
            void loadCatalogStores(nextCity);
            void loadMyRequests(nextCity);
          }}
          className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
        >
          <option value="manila">Manila</option>
          <option value="dubai">Dubai</option>
        </select>
        <button type="button" onClick={() => void loadMyRequests()} disabled={loading} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm hover:bg-neutral-900 disabled:opacity-60">
          {loading ? "Loading..." : "Refresh My Requests"}
        </button>
        <div className="text-xs text-neutral-500 self-center">Total requests ({cityLabel}): {counts.total}</div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="text-xs text-neutral-400">Draft</div>
          <div className="mt-2 text-2xl font-semibold text-neutral-100">{counts.draft}</div>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="text-xs text-neutral-400">In Review</div>
          <div className="mt-2 text-2xl font-semibold text-sky-200">{counts.inReview}</div>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="text-xs text-neutral-400">Approved</div>
          <div className="mt-2 text-2xl font-semibold text-emerald-200">{counts.approved}</div>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="text-xs text-neutral-400">Returned</div>
          <div className="mt-2 text-2xl font-semibold text-amber-200">{counts.returned}</div>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="text-xs text-neutral-400">Quick Actions</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href={`/store/procurement/request?city=${encodeURIComponent(city || "manila")}`} className="rounded-xl border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-xs hover:bg-neutral-900">
              Request
            </Link>
            <Link href={`/store/procurement/history?city=${encodeURIComponent(city || "manila")}`} className="rounded-xl border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-xs hover:bg-neutral-900">
              History
            </Link>
            <Link href={`/store/procurement/receiving?city=${encodeURIComponent(city || "manila")}`} className="rounded-xl border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-xs hover:bg-neutral-900">
              Receiving
            </Link>
            <Link href={`/store/procurement/claim?city=${encodeURIComponent(city || "manila")}`} className="rounded-xl border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-xs hover:bg-neutral-900">
              Claim
            </Link>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
        <div className="text-sm font-medium">My Recent Requests ({cityLabel})</div>
        <div className="mt-3 space-y-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className={`rounded-xl border p-3 ${
                row.id === lastCreatedRequestId
                  ? "border-emerald-700/60 bg-emerald-900/20"
                  : "border-neutral-800 bg-neutral-950/40"
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
                  <Link href={`/store/procurement/receiving?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(row.id)}`} className="rounded-xl border border-neutral-800 bg-neutral-950 px-2 py-1 text-[11px] hover:bg-neutral-900">
                    Receiving
                  </Link>
                  <Link href={`/store/procurement/claim?city=${encodeURIComponent(city || "manila")}&request_id=${encodeURIComponent(row.id)}`} className="rounded-xl border border-neutral-800 bg-neutral-950 px-2 py-1 text-[11px] hover:bg-neutral-900">
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
  );
}
