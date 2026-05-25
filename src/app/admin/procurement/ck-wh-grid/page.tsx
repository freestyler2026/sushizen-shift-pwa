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
  min_stock_qty: string;
  package_spec: string;
  section: string;
  fast_running: boolean;
};

type HistoryEntry = { qty: number; unit: string; request_date: string };
type HistoryMap = Record<string, HistoryEntry[]>;

type QtyMap = Record<string, string>;

const ORIGINS = [
  { value: "CK", label: "Central Kitchen (CK)" },
  { value: "WH", label: "Warehouse (WH)" },
];

function today() { return new Date().toISOString().slice(0, 10); }
function fmt(n: number) {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
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
export default function CkWhGridPage() {
  const router = useRouter();

  const [origin, setOrigin]     = useState("CK");
  const [orderDate, setOrderDate] = useState(today());
  const [search, setSearch]     = useState("");

  const [catalog, setCatalog]   = useState<CatalogRow[]>([]);
  const [history, setHistory]   = useState<HistoryMap>({});
  const [loading, setLoading]   = useState(false);
  const [loadErr, setLoadErr]   = useState("");

  const [qty, setQty] = useState<QtyMap>({});

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
        city: "manila", order_type: "CK_WH_to_supplier",
        active_only: "true", limit: "5000",
      });
      const histParams = new URLSearchParams({
        city: "manila", store_code: origin, days: "90",
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
  }, [origin]);

  useEffect(() => { void loadCatalog(); }, [loadCatalog]);

  // ── Filter + group
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? catalog.filter(
          (r) =>
            r.item_name.toLowerCase().includes(q) ||
            r.supplier_name.toLowerCase().includes(q) ||
            r.catalog_category.toLowerCase().includes(q),
        )
      : catalog;
  }, [catalog, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, CatalogRow[]>>();
    for (const row of filtered) {
      const supplier = row.supplier_name || "—";
      const category = row.catalog_category || row.section || "Other";
      if (!map.has(supplier)) map.set(supplier, new Map());
      const catMap = map.get(supplier)!;
      if (!catMap.has(category)) catMap.set(category, []);
      catMap.get(category)!.push(row);
    }
    return map;
  }, [filtered]);

  const orderedItems = useMemo(
    () => catalog.filter((r) => parseFloat(qty[r.id] || "0") > 0),
    [catalog, qty],
  );

  const grandTotal = useMemo(
    () => orderedItems.reduce((s, r) => s + parseFloat(qty[r.id] || "0") * r.unit_price, 0),
    [orderedItems, qty],
  );

  // ── Submit
  const handleSubmit = useCallback(async () => {
    if (orderedItems.length === 0) return;
    setSubmitting(true);
    setSubmitErr("");
    setSubmitted([]);
    try {
      const auth = authRef.current || getAuth();
      const items = orderedItems.map((r) => ({
        catalog_item_id: r.id,
        supplier_name: r.supplier_name,
        item_name: r.item_name,
        category: r.catalog_category || r.section || "",
        unit: r.unit,
        unit_price: r.unit_price,
        qty: parseFloat(qty[r.id] || "0"),
        min_stock_qty: r.min_stock_qty,
        package_spec: r.package_spec,
        section: r.section,
      }));
      const res = await fetch("/api/admin/procurement/order-grid/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth?.accessToken || ""}`,
        },
        body: JSON.stringify({
          city: "manila",
          store_code: origin,        // "CK" or "WH"
          order_type: "CK_WH_to_supplier",
          order_date: orderDate,
          requested_by: auth?.staffName || "",
          items,
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
  }, [orderedItems, qty, origin, orderDate]);

  const setItemQty = useCallback((id: string, val: string) => {
    setQty((prev) => ({ ...prev, [id]: val }));
    setSubmitted([]);
  }, []);

  const clearAll = useCallback(() => {
    setQty({});
    setSubmitted([]);
    setSubmitErr("");
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen space-y-5 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className={T_PAGE_TITLE}>CK / WH Order Grid</h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            Central Kitchen &amp; Warehouse → External Supplier orders
          </p>
        </div>
        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
          CK_WH → Supplier
        </span>
      </div>

      {/* Controls */}
      <div className={`${GLASS_CARD} p-4`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Origin</label>
            <select
              className={SELECT_CLASS}
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
            >
              {ORIGINS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={`${T_LABEL} mb-1.5 block`}>Order Date</label>
            <input
              type="date"
              className={INPUT_CLASS}
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
            />
          </div>
          <div className="col-span-2">
            <label className={`${T_LABEL} mb-1.5 block`}>Search</label>
            <input
              type="text"
              className={INPUT_CLASS}
              placeholder="Item, supplier, or category…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {loadErr && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {loadErr}
        </div>
      )}

      {/* Success */}
      {submitted.length > 0 && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          <p className="font-semibold">
            ✓ {submitted.length} procurement request{submitted.length > 1 ? "s" : ""} created
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            {submitted.map((r) => (
              <a key={r.id} href="/admin/procurement" className="underline hover:text-emerald-200">
                {r.request_number || r.id.slice(0, 8)}
              </a>
            ))}
          </div>
        </div>
      )}

      {submitErr && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {submitErr}
        </div>
      )}

      {/* Summary strip when items selected */}
      {orderedItems.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Array.from(
            orderedItems.reduce((m, r) => {
              m.set(r.supplier_name, (m.get(r.supplier_name) || 0) + 1);
              return m;
            }, new Map<string, number>()),
          ).map(([supplier, count]) => (
            <span
              key={supplier}
              className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-0.5 text-[11px] text-violet-300"
            >
              {supplier} ×{count}
            </span>
          ))}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="py-16 text-center text-sm text-zinc-500">Loading catalog…</div>
      ) : catalog.length === 0 ? (
        <div className="py-16 text-center text-sm text-zinc-500">
          No CK/WH → Supplier catalog items found. Add items in Order Catalog first.
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-10 text-center text-sm text-zinc-500">No items match &ldquo;{search}&rdquo;</div>
      ) : (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([supplier, catMap]) => {
            const supplierTotal = Array.from(catMap.values())
              .flat()
              .reduce((s, r) => s + parseFloat(qty[r.id] || "0") * r.unit_price, 0);
            const supplierQtyCount = Array.from(catMap.values())
              .flat()
              .filter((r) => parseFloat(qty[r.id] || "0") > 0).length;

            return (
              <div key={supplier} className={`${GLASS_CARD} overflow-hidden`}>
                {/* Supplier header */}
                <div className="flex items-center gap-3 border-b border-white/8 bg-amber-900/15 px-4 py-2.5">
                  <span className="text-sm font-semibold text-amber-200">{supplier}</span>
                  {supplierQtyCount > 0 && (
                    <>
                      <span className="text-xs text-zinc-500">{supplierQtyCount} item{supplierQtyCount > 1 ? "s" : ""} selected</span>
                      <span className="ml-auto text-sm font-bold tabular-nums text-amber-300">
                        ₱{fmt(supplierTotal)}
                      </span>
                    </>
                  )}
                  {supplierQtyCount === 0 && (
                    <span className="ml-auto text-xs text-zinc-600">
                      {Array.from(catMap.values()).flat().length} items
                    </span>
                  )}
                </div>

                {Array.from(catMap.entries()).map(([category, rows]) => (
                  <div key={category}>
                    <div className="border-b border-white/5 bg-white/3 px-4 py-1.5">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                        {category}
                      </span>
                    </div>
                    <table className="w-full">
                      <tbody>
                        {rows.map((row) => {
                          const qtyVal    = qty[row.id] || "";
                          const qtyNum    = parseFloat(qtyVal || "0");
                          const lineTotal = qtyNum * row.unit_price;
                          const hasQty    = qtyNum > 0;
                          const minQty    = parseMinQty(row.min_stock_qty);
                          const belowMin  = hasQty && minQty !== null && qtyNum < minQty;
                          const itemHist  = history[row.item_name.trim().toLowerCase()] || [];

                          return (
                            <tr
                              key={row.id}
                              className={[
                                "border-b border-white/5 transition-colors",
                                hasQty ? "bg-amber-500/8" : "hover:bg-white/3",
                              ].join(" ")}
                            >
                              {/* Item name + history */}
                              <td className="px-4 py-2.5">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-sm text-zinc-200">{row.item_name}</span>
                                  {row.fast_running && (
                                    <span className={BADGE_WARNING} style={{ fontSize: 9 }}>Fast</span>
                                  )}
                                </div>
                                {(row.package_spec || row.min_stock_qty) && (
                                  <div className="mt-0.5 text-[11px] text-zinc-600">
                                    {[row.package_spec, row.min_stock_qty && `min: ${row.min_stock_qty}`].filter(Boolean).join(" · ")}
                                  </div>
                                )}
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
                              <td className="w-16 px-2 py-2.5 text-center text-xs text-zinc-500">{row.unit}</td>

                              {/* Unit price */}
                              <td className="w-28 px-2 py-2.5 text-right text-xs tabular-nums text-zinc-400">₱{fmt(row.unit_price)}</td>

                              {/* Qty + warning */}
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
                                        : "border-white/10 bg-white/6 focus:border-amber-500/60 focus:ring-amber-500/30",
                                    ].join(" ")}
                                  />
                                  {belowMin && (
                                    <div className="text-center text-[9px] font-medium text-amber-400">⚠ min {row.min_stock_qty}</div>
                                  )}
                                </div>
                              </td>

                              {/* Line total */}
                              <td className="w-28 px-4 py-2.5 text-right text-xs tabular-nums">
                                {hasQty
                                  ? <span className="font-semibold text-amber-300">₱{fmt(lineTotal)}</span>
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
            );
          })}
        </div>
      )}

      {/* Sticky footer */}
      {catalog.length > 0 && (
        <div className="sticky bottom-4 z-20">
          <div className={`${GLASS_CARD} flex flex-wrap items-center gap-4 px-5 py-3.5`}>
            <div className="flex items-center gap-3">
              <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-300">
                {origin}
              </span>
              <div>
                <span className="text-xs text-zinc-500">
                  {orderedItems.length === 0
                    ? "Enter quantities to create orders"
                    : `${orderedItems.length} item${orderedItems.length > 1 ? "s" : ""} · ${new Set(orderedItems.map((r) => r.supplier_name)).size} supplier${new Set(orderedItems.map((r) => r.supplier_name)).size > 1 ? "s" : ""}`}
                </span>
                {orderedItems.length > 0 && (
                  <div className="text-lg font-bold text-white tabular-nums">
                    ₱{fmt(grandTotal)}
                  </div>
                )}
              </div>
            </div>
            <div className="ml-auto flex gap-2">
              {orderedItems.length > 0 && (
                <button className={`${SECONDARY_BUTTON} text-sm`} onClick={clearAll}>
                  Clear
                </button>
              )}
              <button
                className={`${PRIMARY_BUTTON} text-sm`}
                style={{ background: "linear-gradient(to right, #d97706, #b45309)" }}
                disabled={orderedItems.length === 0 || submitting || !orderDate}
                onClick={handleSubmit}
              >
                {submitting
                  ? "Submitting…"
                  : orderedItems.length === 0
                  ? "No items selected"
                  : `Submit ${orderedItems.length} item${orderedItems.length > 1 ? "s" : ""} →`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
