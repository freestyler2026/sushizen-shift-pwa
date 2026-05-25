"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth, refreshAuthFromApi } from "@/lib/auth";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  T_PAGE_TITLE,
  T_LABEL,
  BADGE_WARNING,
} from "@/lib/ui-tokens";

// ─── Types ────────────────────────────────────────────────────────────────────
type CatalogRow = {
  id: string;
  item_name: string;
  catalog_category: string;
  supplier_name: string;
  unit: string;
  unit_price: number;
  currency_code: string;
  min_stock_qty: string;
  package_spec: string;
  section: string;
  order_type: string;
  store_scope: string;
  fast_running: boolean;
};

type HistoryEntry = { qty: number; unit: string; request_date: string };
type HistoryMap = Record<string, HistoryEntry[]>; // item_name.lower() → entries
type QtyMap = Record<string, string>;

const STORES = ["Paranaque", "Taft", "Cubao"];
const ORDER_TYPES = [
  { value: "Supplier",          label: "Supplier (Store → Vendor)" },
  { value: "WH",                label: "WH (Store → Warehouse)" },
  { value: "CK",                label: "CK (Store → Central Kitchen)" },
  { value: "CK_WH_to_supplier", label: "CK/WH → Supplier" },
];

function today(): string { return new Date().toISOString().slice(0, 10); }
function fmt(n: number) {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/** Parse "2KG" → 2, "10PC" → 10, "5" → 5, "1PKT" → 1. Returns null if unparseable. */
function parseMinQty(s: string): number | null {
  if (!s) return null;
  const m = s.match(/^(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return isNaN(n) ? null : n;
}
function formatDate(d: string) {
  if (!d) return "";
  const parts = d.slice(0, 10).split("-");
  return `${parts[1]}/${parts[2]}`;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function OrderGridPage() {
  const router = useRouter();

  const [store, setStore]         = useState(STORES[0]);
  const [orderType, setOrderType] = useState("Supplier");
  const [orderDate, setOrderDate] = useState(today());

  const [catalog, setCatalog]     = useState<CatalogRow[]>([]);
  const [history, setHistory]     = useState<HistoryMap>({});
  const [loading, setLoading]     = useState(false);
  const [loadErr, setLoadErr]     = useState("");

  const [qty, setQty]             = useState<QtyMap>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr]   = useState("");
  const [submitted, setSubmitted]   = useState<{ id: string; request_number: string }[]>([]);

  const authRef = useRef<ReturnType<typeof getAuth>>(null);

  useEffect(() => {
    const auth = getAuth();
    if (!auth?.accessToken) { router.replace("/login"); return; }
    authRef.current = auth;
  }, [router]);

  // ── Load catalog + history in parallel
  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setLoadErr("");
    setCatalog([]);
    setHistory({});
    setQty({});
    setSubmitted([]);
    setSubmitErr("");
    try {
      let auth = getAuth();
      const refreshed = await refreshAuthFromApi(auth);
      auth = refreshed || auth;
      authRef.current = auth;
      const headers = { Authorization: `Bearer ${auth?.accessToken || ""}` };

      const catParams = new URLSearchParams({
        city: "manila", store_scope: store, order_type: orderType,
        active_only: "true", limit: "5000",
      });
      const histParams = new URLSearchParams({
        city: "manila", store_code: store, days: "90",
      });

      const [catRes, histRes] = await Promise.all([
        fetch(`/api/admin/procurement/catalog/curated?${catParams}`, { headers }),
        fetch(`/api/admin/procurement/order-grid/item-history?${histParams}`, { headers }),
      ]);

      if (!catRes.ok) throw new Error(await catRes.text());
      const catJson = await catRes.json();
      setCatalog((catJson.rows || []) as CatalogRow[]);

      if (histRes.ok) {
        const histJson = await histRes.json();
        setHistory((histJson.history || {}) as HistoryMap);
      }
    } catch (e: unknown) {
      setLoadErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [store, orderType]);

  useEffect(() => { void loadCatalog(); }, [loadCatalog]);

  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, CatalogRow[]>>();
    for (const row of catalog) {
      const supplier = row.supplier_name || "—";
      const category = row.catalog_category || row.section || "Other";
      if (!map.has(supplier)) map.set(supplier, new Map());
      const catMap = map.get(supplier)!;
      if (!catMap.has(category)) catMap.set(category, []);
      catMap.get(category)!.push(row);
    }
    return map;
  }, [catalog]);

  const orderedItems = useMemo(
    () => catalog.filter((r) => parseFloat(qty[r.id] || "0") > 0),
    [catalog, qty],
  );
  const grandTotal = useMemo(
    () => orderedItems.reduce((s, r) => s + parseFloat(qty[r.id] || "0") * r.unit_price, 0),
    [orderedItems, qty],
  );

  const handleSubmit = useCallback(async () => {
    if (orderedItems.length === 0) return;
    setSubmitting(true);
    setSubmitErr("");
    setSubmitted([]);
    try {
      const auth = authRef.current || getAuth();
      const res = await fetch("/api/admin/procurement/order-grid/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth?.accessToken || ""}` },
        body: JSON.stringify({
          city: "manila", store_code: store, order_type: orderType,
          order_date: orderDate, requested_by: auth?.staffName || "",
          items: orderedItems.map((r) => ({
            catalog_item_id: r.id, supplier_name: r.supplier_name,
            item_name: r.item_name, category: r.catalog_category || r.section || "",
            unit: r.unit, unit_price: r.unit_price,
            qty: parseFloat(qty[r.id] || "0"),
            min_stock_qty: r.min_stock_qty, package_spec: r.package_spec, section: r.section,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail || JSON.stringify(json));
      setSubmitted(json.requests || []);
      setQty({});
    } catch (e: unknown) {
      setSubmitErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }, [orderedItems, qty, store, orderType, orderDate]);

  const setItemQty = useCallback((id: string, val: string) => {
    setQty((prev) => ({ ...prev, [id]: val }));
    setSubmitted([]);
  }, []);

  const clearAll = useCallback(() => { setQty({}); setSubmitted([]); setSubmitErr(""); }, []);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className={T_PAGE_TITLE}>Order Grid</h1>
        <span className="text-xs text-zinc-500">Manila — Store ordering via catalog</span>
      </div>

      {/* Controls */}
      <div className={`${GLASS_CARD} p-4`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Store</label>
            <select className={SELECT_CLASS} value={store} onChange={(e) => setStore(e.target.value)}>
              {STORES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Order Type</label>
            <select className={SELECT_CLASS} value={orderType} onChange={(e) => setOrderType(e.target.value)}>
              {ORDER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Order Date</label>
            <input type="date" className={INPUT_CLASS} value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
          </div>
          <div className="flex items-end">
            <button className={`${SECONDARY_BUTTON} w-full text-sm`} onClick={loadCatalog} disabled={loading}>
              {loading ? "Loading…" : "↺ Reload"}
            </button>
          </div>
        </div>
      </div>

      {loadErr && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{loadErr}</div>}

      {submitted.length > 0 && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          <p className="font-semibold">✓ {submitted.length} procurement request{submitted.length > 1 ? "s" : ""} created</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {submitted.map((r) => (
              <a key={r.id} href="/admin/procurement" className="underline hover:text-emerald-200">
                {r.request_number || r.id.slice(0, 8)}
              </a>
            ))}
          </div>
        </div>
      )}

      {submitErr && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{submitErr}</div>}

      {/* Grid */}
      {loading ? (
        <div className="py-16 text-center text-sm text-zinc-500">Loading catalog…</div>
      ) : catalog.length === 0 ? (
        <div className="py-16 text-center text-sm text-zinc-500">No catalog items found for {store} / {orderType}</div>
      ) : (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([supplier, catMap]) => (
            <div key={supplier} className={`${GLASS_CARD} overflow-hidden`}>
              <div className="flex items-center gap-2 border-b border-white/8 bg-violet-900/20 px-4 py-2.5">
                <span className="text-sm font-semibold text-violet-200">{supplier}</span>
                <span className="ml-auto text-xs text-zinc-500">{Array.from(catMap.values()).flat().length} items</span>
              </div>

              {Array.from(catMap.entries()).map(([category, rows]) => (
                <div key={category}>
                  <div className="border-b border-white/5 bg-white/3 px-4 py-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{category}</span>
                  </div>
                  <table className="w-full">
                    <tbody>
                      {rows.map((row) => {
                        const qtyVal   = qty[row.id] || "";
                        const qtyNum   = parseFloat(qtyVal || "0");
                        const hasQty   = qtyNum > 0;
                        const lineTotal = qtyNum * row.unit_price;
                        const minQty   = parseMinQty(row.min_stock_qty);
                        const belowMin = hasQty && minQty !== null && qtyNum < minQty;
                        const itemHist = history[row.item_name.trim().toLowerCase()] || [];

                        return (
                          <tr key={row.id} className={["border-b border-white/5 transition-colors", hasQty ? "bg-violet-500/8" : "hover:bg-white/3"].join(" ")}>
                            {/* Item name + history + badges */}
                            <td className="px-4 py-2.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-sm text-zinc-200">{row.item_name}</span>
                                {row.fast_running && (
                                  <span className={BADGE_WARNING} style={{ fontSize: 9 }}>Fast</span>
                                )}
                              </div>
                              {/* Spec / min qty */}
                              {(row.package_spec || row.min_stock_qty) && (
                                <div className="mt-0.5 text-[11px] text-zinc-600">
                                  {[row.package_spec, row.min_stock_qty && `min: ${row.min_stock_qty}`].filter(Boolean).join(" · ")}
                                </div>
                              )}
                              {/* Order history */}
                              {itemHist.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1.5">
                                  {itemHist.slice(0, 3).map((h, i) => (
                                    <span key={i} className="rounded border border-white/8 bg-white/5 px-1.5 py-0.5 text-[10px] tabular-nums text-zinc-500">
                                      {h.qty}{h.unit ? ` ${h.unit}` : ""} <span className="text-zinc-700">{formatDate(h.request_date)}</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>

                            {/* Unit */}
                            <td className="w-14 px-2 py-2.5 text-center text-xs text-zinc-500">{row.unit}</td>

                            {/* Unit price */}
                            <td className="w-28 px-2 py-2.5 text-right text-xs tabular-nums text-zinc-400">₱{fmt(row.unit_price)}</td>

                            {/* Qty input */}
                            <td className="w-24 px-2 py-1.5">
                              <div className="space-y-0.5">
                                <input
                                  type="number" min="0" step="0.5" placeholder="0"
                                  value={qtyVal}
                                  onChange={(e) => setItemQty(row.id, e.target.value)}
                                  className={[
                                    "w-full rounded-lg border px-2 py-1.5 text-center text-sm text-white outline-none transition focus:ring-1",
                                    belowMin
                                      ? "border-amber-500/60 bg-amber-900/20 focus:border-amber-400 focus:ring-amber-500/30"
                                      : "border-white/10 bg-white/6 focus:border-violet-500/60 focus:ring-violet-500/30",
                                  ].join(" ")}
                                />
                                {belowMin && (
                                  <div className="text-center text-[9px] font-medium text-amber-400">
                                    ⚠ min {row.min_stock_qty}
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Line total */}
                            <td className="w-28 px-4 py-2.5 text-right text-xs tabular-nums">
                              {hasQty
                                ? <span className="font-semibold text-violet-300">₱{fmt(lineTotal)}</span>
                                : <span className="text-zinc-700">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Sticky footer */}
      {catalog.length > 0 && (
        <div className="sticky bottom-4 z-20">
          <div className={`${GLASS_CARD} flex flex-wrap items-center gap-4 px-5 py-3.5`}>
            <div className="flex-1">
              <span className="text-xs text-zinc-500">
                {orderedItems.length === 0 ? "Enter quantities above to create orders" : `${orderedItems.length} item${orderedItems.length > 1 ? "s" : ""} selected`}
              </span>
              {orderedItems.length > 0 && <div className="text-lg font-bold text-white tabular-nums">₱{fmt(grandTotal)}</div>}
            </div>
            <div className="flex gap-2">
              {orderedItems.length > 0 && <button className={`${SECONDARY_BUTTON} text-sm`} onClick={clearAll}>Clear</button>}
              <button
                className={`${PRIMARY_BUTTON} text-sm`}
                disabled={orderedItems.length === 0 || submitting || !orderDate}
                onClick={handleSubmit}
              >
                {submitting ? "Submitting…" : orderedItems.length === 0 ? "No items selected" : `Submit ${orderedItems.length} item${orderedItems.length > 1 ? "s" : ""} →`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
