"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import InventoryTabs from "@/components/InventoryTabs";
import { canAccessInventoryWorkspace, getAuth, refreshAuthFromApi } from "@/lib/auth";
import type { City } from "@/lib/branches";
import { inventoryGet, inventoryPost } from "@/lib/inventoryClient";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MasterItem = {
  id: string;
  item_source: string;
  name: string;
  category: string;
  unit: string;
  cost: number;
};

type StockViewRow = {
  id: string;
  item_source: string;
  name: string;
  category: string;
  unit: string;
  theoretical_qty: number;
  last_count_qty: number;
  last_count_date: string | null;
  adj_qty_total: number;
};

type HistoryRow = {
  count_date: string;
  created_by: string;
  item_count: number;
  shortage_count: number;
  surplus_count: number;
  total_abs_gap: number;
};

type GapDetailRow = {
  item_source: string;
  item_id: number;
  item_name: string;
  category: string;
  unit: string;
  count_qty: number;
  theoretical_qty: number;
  gap_qty: number;
};

type Tab = "stock" | "count" | "history";

type CountDraft = Record<string, string>; // key: `${item_source}:${id}` -> qty string

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt3(v: number | null | undefined): string {
  return Number(v ?? 0).toFixed(3);
}

function stockColor(theoretical: number): string {
  if (theoretical <= 0) return "text-rose-400";
  if (theoretical < 1) return "text-amber-300";
  return "text-emerald-300";
}

function stockBadge(theoretical: number): { label: string; cls: string } {
  if (theoretical <= 0) return { label: "OUT", cls: "bg-rose-900/40 text-rose-300 border-rose-800/50" };
  if (theoretical < 1) return { label: "LOW", cls: "bg-amber-900/40 text-amber-300 border-amber-800/50" };
  return { label: "OK", cls: "bg-emerald-900/40 text-emerald-300 border-emerald-800/50" };
}

function gapColorClass(gap: number, theoretical: number): string {
  if (theoretical === 0) return "text-neutral-500";
  if (gap < 0) return "text-rose-400";
  if (gap > 0) return "text-emerald-400";
  return "text-neutral-500";
}

function gapLabel(gap: number, theoretical: number): string {
  if (theoretical === 0) return "—";
  if (gap > 0) return `+${fmt3(gap)}`;
  if (gap < 0) return `${fmt3(gap)}`;
  return "0.000";
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CkInventoryPage() {
  const auth = useMemo(() => getAuth(), []);

  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [staffName, setStaffName] = useState("");
  const [city, setCity] = useState<City>("dubai");

  const [tab, setTab] = useState<Tab>("stock");

  // Tab 1 — Current Stock
  const [stockRows, setStockRows] = useState<StockViewRow[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState("");
  const [stockQ, setStockQ] = useState("");

  // Tab 2 — New Count
  const [masterItems, setMasterItems] = useState<MasterItem[]>([]);
  const [masterLoading, setMasterLoading] = useState(false);
  const [masterError, setMasterError] = useState("");
  const [stockView, setStockView] = useState<StockViewRow[]>([]);
  const [stockViewLoading, setStockViewLoading] = useState(false);
  const [countQ, setCountQ] = useState("");
  const [countDate, setCountDate] = useState(todayIso());
  const [countDraft, setCountDraft] = useState<CountDraft>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  // Tab 3 — History
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [selectedHistory, setSelectedHistory] = useState<{ count_date: string; rows: GapDetailRow[] } | null>(null);
  const [gapDetailLoading, setGapDetailLoading] = useState(false);
  const [gapDetailError, setGapDetailError] = useState("");

  // ---------------------------------------------------------------------------
  // Derived: theoretical lookup for count tab
  // ---------------------------------------------------------------------------

  const theoreticalLookup = useMemo(() => {
    const map: Record<string, number> = {};
    for (const sv of stockView) {
      const key = `${sv.item_source}:${sv.id}`;
      map[key] = sv.theoretical_qty;
    }
    return map;
  }, [stockView]);

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const resolved = await refreshAuthFromApi(auth);
      if (cancelled) return;
      const nextCity = ((resolved?.city || auth?.city || "dubai") as City);
      setAllowed(canAccessInventoryWorkspace(resolved));
      setCity(nextCity);
      setStaffName(resolved?.staffName || auth?.staffName || "");
      setReady(true);
    }
    void init();
    return () => { cancelled = true; };
  }, [auth]);

  // ---------------------------------------------------------------------------
  // Data loaders
  // ---------------------------------------------------------------------------

  const loadStock = useCallback(async (c: City) => {
    setStockLoading(true);
    setStockError("");
    try {
      const res = await inventoryGet<{ rows: StockViewRow[] }>(
        `/api/admin/inventory/ck-stock?city=${encodeURIComponent(c)}`,
      );
      setStockRows(res.rows || []);
    } catch (e: unknown) {
      setStockError(e instanceof Error ? e.message : String(e));
    } finally {
      setStockLoading(false);
    }
  }, []);

  const loadMaster = useCallback(async (c: City) => {
    setMasterLoading(true);
    setMasterError("");
    try {
      const res = await inventoryGet<{ rows: MasterItem[] }>(
        `/api/admin/inventory/ck-stock/master?city=${encodeURIComponent(c)}`,
      );
      setMasterItems(res.rows || []);
    } catch (e: unknown) {
      setMasterError(e instanceof Error ? e.message : String(e));
    } finally {
      setMasterLoading(false);
    }
  }, []);

  const loadStockView = useCallback(async (c: City) => {
    setStockViewLoading(true);
    try {
      const res = await inventoryGet<{ rows: StockViewRow[] }>(
        `/api/admin/inventory/ck-stock?city=${encodeURIComponent(c)}`,
      );
      setStockView(res.rows || []);
    } catch {
      // non-fatal: theoretical values will just show as 0
    } finally {
      setStockViewLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async (c: City) => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const res = await inventoryGet<{ rows: HistoryRow[] }>(
        `/api/admin/inventory/ck-stock/history?city=${encodeURIComponent(c)}`,
      );
      setHistoryRows(res.rows || []);
    } catch (e: unknown) {
      setHistoryError(e instanceof Error ? e.message : String(e));
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadGapDetail = useCallback(async (c: City, countDateStr: string) => {
    setGapDetailLoading(true);
    setGapDetailError("");
    try {
      const res = await inventoryGet<{ rows: GapDetailRow[] }>(
        `/api/admin/inventory/ck-stock/gap-detail?city=${encodeURIComponent(c)}&count_date=${encodeURIComponent(countDateStr)}`,
      );
      setSelectedHistory({ count_date: countDateStr, rows: res.rows || [] });
    } catch (e: unknown) {
      setGapDetailError(e instanceof Error ? e.message : String(e));
    } finally {
      setGapDetailLoading(false);
    }
  }, []);

  // Load when ready + city changes
  useEffect(() => {
    if (!ready || !allowed) return;
    void loadStock(city);
  }, [ready, allowed, city, loadStock]);

  // Load master/history on tab switch
  useEffect(() => {
    if (!ready || !allowed) return;
    if (tab === "count" && masterItems.length === 0) {
      void loadMaster(city);
      void loadStockView(city);
    }
    if (tab === "history") void loadHistory(city);
  }, [ready, allowed, tab, city, masterItems.length, loadMaster, loadStockView, loadHistory]);

  // Reload master on city change if on count tab
  useEffect(() => {
    if (!ready || !allowed) return;
    if (tab === "count") {
      setMasterItems([]);
      setCountDraft({});
      setStockView([]);
      void loadMaster(city);
      void loadStockView(city);
    }
    if (tab === "history") {
      setSelectedHistory(null);
      void loadHistory(city);
    }
    if (tab === "stock") void loadStock(city);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const filteredStock = useMemo(() => {
    if (!stockQ.trim()) return stockRows;
    const lq = stockQ.trim().toLowerCase();
    return stockRows.filter(
      (r) =>
        r.name.toLowerCase().includes(lq) ||
        r.category.toLowerCase().includes(lq) ||
        r.item_source.toLowerCase().includes(lq),
    );
  }, [stockRows, stockQ]);

  const stockCategories = useMemo(
    () => Array.from(new Set(stockRows.map((r) => r.category))).sort(),
    [stockRows],
  );

  const filteredMaster = useMemo(() => {
    if (!countQ.trim()) return masterItems;
    const lq = countQ.trim().toLowerCase();
    return masterItems.filter(
      (r) =>
        r.name.toLowerCase().includes(lq) ||
        r.category.toLowerCase().includes(lq),
    );
  }, [masterItems, countQ]);

  // ---------------------------------------------------------------------------
  // Save count
  // ---------------------------------------------------------------------------

  async function handleSaveCount() {
    setSaveError("");
    setSaveSuccess("");
    const items = masterItems
      .map((item) => {
        const key = `${item.item_source}:${item.id}`;
        const raw = countDraft[key] ?? "0";
        const count_qty = parseFloat(raw) || 0;
        return {
          item_source: item.item_source,
          item_id: parseInt(item.id, 10),
          item_name: item.name,
          category: item.category,
          unit: item.unit,
          count_qty,
        };
      })
      .filter((it) => it.item_id > 0);

    if (items.length === 0) {
      setSaveError("No items to save.");
      return;
    }
    if (!countDate) {
      setSaveError("Please select a count date.");
      return;
    }

    setSaving(true);
    try {
      const res = await inventoryPost<{ ok: boolean; count: number }>(
        "/api/admin/inventory/ck-stock/count",
        {
          city,
          count_date: countDate,
          created_by: staffName,
          items,
        },
      );
      setSaveSuccess(`Saved ${res.count} items. Switching to Current Stock...`);
      setCountDraft({});
      // Reload stock and switch tab after brief delay
      setTimeout(() => {
        setSaveSuccess("");
        setTab("stock");
        void loadStock(city);
      }, 1800);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Guard
  // ---------------------------------------------------------------------------

  if (!ready) return <div className="py-8 text-center text-sm text-neutral-500">Loading...</div>;
  if (!allowed) return <div className="py-8 text-center text-sm text-rose-400">You do not have permission to access inventory.</div>;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      <InventoryTabs />

      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-neutral-100">CK Stocktaking</h1>
          <p className="mt-0.5 text-sm text-neutral-400">
            Physical stock counts for CK ingredients and processed goods.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={city}
            onChange={(e) => setCity(e.target.value as City)}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200"
          >
            <option value="dubai">Dubai</option>
            <option value="manila">Manila</option>
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-neutral-800 bg-neutral-900/30 p-1">
        {(
          [
            { id: "stock", label: "Current Stock" },
            { id: "count", label: "New Count" },
            { id: "history", label: "History" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={[
              "flex-1 rounded-lg px-4 py-2 text-sm font-medium transition",
              tab === t.id
                ? "bg-violet-700 text-white shadow"
                : "text-neutral-400 hover:text-neutral-200",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Tab 1: Current Stock                                                */}
      {/* ------------------------------------------------------------------ */}
      {tab === "stock" && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={stockQ}
              onChange={(e) => setStockQ(e.target.value)}
              placeholder="Search by name or category..."
              className="flex-1 rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm text-neutral-100 placeholder:text-neutral-600"
            />
            <button
              type="button"
              disabled={stockLoading}
              onClick={() => loadStock(city)}
              className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm text-neutral-200 disabled:opacity-50"
            >
              {stockLoading ? "Loading..." : "Refresh"}
            </button>
          </div>

          {stockError && (
            <div className="rounded-xl border border-rose-800/50 bg-rose-900/20 px-4 py-3 text-sm text-rose-300">
              {stockError}
            </div>
          )}

          {/* Category chips */}
          {stockCategories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {stockCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setStockQ(stockQ === cat ? "" : cat)}
                  className={[
                    "rounded-full border px-3 py-1 text-xs transition",
                    stockQ === cat
                      ? "border-violet-600/50 bg-violet-900/20 text-violet-200"
                      : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:text-neutral-200",
                  ].join(" ")}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          <div className="overflow-x-auto rounded-2xl border border-neutral-800">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-neutral-800 bg-neutral-900/60 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-2.5">Item Name</th>
                  <th className="px-4 py-2.5">Source</th>
                  <th className="px-4 py-2.5">Category</th>
                  <th className="px-4 py-2.5 text-right">Last Count</th>
                  <th className="px-4 py-2.5 text-right">Adjustments</th>
                  <th className="px-4 py-2.5 text-right">Theoretical</th>
                  <th className="px-4 py-2.5">Last Count Date</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredStock.map((row) => {
                  const badge = stockBadge(row.theoretical_qty);
                  return (
                    <tr
                      key={`${row.item_source}:${row.id}`}
                      className="border-t border-neutral-800 text-neutral-200 transition hover:bg-neutral-900/30"
                    >
                      <td className="px-4 py-2.5 font-medium">{row.name}</td>
                      <td className="px-4 py-2.5 text-xs text-neutral-500">
                        {row.item_source === "ingredient_master" ? "Ingredient" : "Processed"}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-neutral-400">{row.category || "—"}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-neutral-300">
                        {fmt3(row.last_count_qty)}
                        <span className="ml-1 text-neutral-600">{row.unit}</span>
                      </td>
                      <td className={[
                        "px-4 py-2.5 text-right font-mono text-xs",
                        row.adj_qty_total < 0 ? "text-rose-300" : row.adj_qty_total > 0 ? "text-emerald-300" : "text-neutral-600",
                      ].join(" ")}>
                        {row.adj_qty_total >= 0 ? "+" : ""}{fmt3(row.adj_qty_total)}
                      </td>
                      <td className={["px-4 py-2.5 text-right font-mono text-sm font-semibold", stockColor(row.theoretical_qty)].join(" ")}>
                        {fmt3(row.theoretical_qty)}
                        <span className="ml-1 text-xs font-normal text-neutral-500">{row.unit}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-neutral-500">
                        {row.last_count_date ? String(row.last_count_date).slice(0, 10) : "Never"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={["rounded-full border px-2.5 py-0.5 text-xs font-medium", badge.cls].join(" ")}>
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {!stockLoading && filteredStock.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-neutral-500">
                      {stockRows.length === 0
                        ? "No items found. Make sure ingredient_master and menu_item_master have active items for this city."
                        : "No items match the search."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="text-right text-xs text-neutral-600">{filteredStock.length} items shown</div>
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Tab 2: New Count                                                    */}
      {/* ------------------------------------------------------------------ */}
      {tab === "count" && (
        <section className="space-y-4">
          {/* Count header controls */}
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-500">Count Date</label>
              <input
                type="date"
                value={countDate}
                onChange={(e) => setCountDate(e.target.value)}
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-500">Staff</label>
              <input
                type="text"
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                placeholder="Your name"
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-500">Search Items</label>
              <input
                type="text"
                value={countQ}
                onChange={(e) => setCountQ(e.target.value)}
                placeholder="Filter by name or category..."
                className="w-56 rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600"
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-neutral-500">
                {masterItems.length} items{stockViewLoading ? " · loading theoretical..." : ""} · {Object.keys(countDraft).filter((k) => parseFloat(countDraft[k] || "0") !== 0).length} entered
              </span>
              <button
                type="button"
                disabled={masterLoading}
                onClick={() => {
                  setMasterItems([]);
                  setCountDraft({});
                  setStockView([]);
                  void loadMaster(city);
                  void loadStockView(city);
                }}
                className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-300 disabled:opacity-50"
              >
                Reload
              </button>
            </div>
          </div>

          {masterError && (
            <div className="rounded-xl border border-rose-800/50 bg-rose-900/20 px-4 py-3 text-sm text-rose-300">
              {masterError}
            </div>
          )}

          {/* Items table */}
          <div className="overflow-x-auto rounded-2xl border border-neutral-800">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-neutral-800 bg-neutral-900/60 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-2.5">Item Name</th>
                  <th className="px-4 py-2.5">Source</th>
                  <th className="px-4 py-2.5">Category</th>
                  <th className="px-4 py-2.5">Unit</th>
                  <th className="px-4 py-2.5 text-right">Theoretical</th>
                  <th className="px-4 py-2.5 text-right">Count Qty</th>
                  <th className="px-4 py-2.5 text-right">Gap</th>
                </tr>
              </thead>
              <tbody>
                {filteredMaster.map((item) => {
                  const key = `${item.item_source}:${item.id}`;
                  const val = countDraft[key] ?? "";
                  const numVal = parseFloat(val || "0");
                  const theoretical = theoreticalLookup[key] ?? 0;
                  const gap = numVal - theoretical;
                  return (
                    <tr
                      key={key}
                      className={[
                        "border-t border-neutral-800 transition",
                        numVal > 0 ? "bg-violet-950/10" : "hover:bg-neutral-900/20",
                      ].join(" ")}
                    >
                      <td className="px-4 py-2 font-medium text-neutral-100">{item.name}</td>
                      <td className="px-4 py-2 text-xs text-neutral-500">
                        {item.item_source === "ingredient_master" ? "Ingredient" : "Processed"}
                      </td>
                      <td className="px-4 py-2 text-xs text-neutral-400">{item.category || "—"}</td>
                      <td className="px-4 py-2 text-xs text-neutral-400">{item.unit || "—"}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-neutral-500">
                        {stockViewLoading ? "..." : fmt3(theoretical)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          value={val}
                          onChange={(e) =>
                            setCountDraft((prev) => ({ ...prev, [key]: e.target.value }))
                          }
                          placeholder="0"
                          className="w-28 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-right text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-violet-600 focus:outline-none"
                        />
                      </td>
                      <td className={["px-4 py-2 text-right font-mono text-xs font-semibold", gapColorClass(gap, val !== "" ? theoretical : 0)].join(" ")}>
                        {val !== "" ? gapLabel(gap, theoretical) : "—"}
                      </td>
                    </tr>
                  );
                })}
                {!masterLoading && filteredMaster.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
                      {masterItems.length === 0
                        ? "No master items loaded. Click Reload to fetch items."
                        : "No items match the search."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Save controls */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4">
            {saveError && (
              <div className="w-full rounded-xl border border-rose-800/50 bg-rose-900/20 px-4 py-3 text-sm text-rose-300">
                {saveError}
              </div>
            )}
            {saveSuccess && (
              <div className="w-full rounded-xl border border-emerald-800/50 bg-emerald-900/20 px-4 py-3 text-sm text-emerald-300">
                {saveSuccess}
              </div>
            )}
            <div className="ml-auto">
              <button
                type="button"
                disabled={saving || masterItems.length === 0}
                onClick={handleSaveCount}
                className="rounded-xl bg-violet-700 px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-violet-600 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Count"}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Tab 3: History                                                      */}
      {/* ------------------------------------------------------------------ */}
      {tab === "history" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-neutral-200">Count Sessions</div>
            <button
              type="button"
              disabled={historyLoading}
              onClick={() => {
                setSelectedHistory(null);
                void loadHistory(city);
              }}
              className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm text-neutral-300 disabled:opacity-50"
            >
              {historyLoading ? "Loading..." : "Refresh"}
            </button>
          </div>

          {historyError && (
            <div className="rounded-xl border border-rose-800/50 bg-rose-900/20 px-4 py-3 text-sm text-rose-300">
              {historyError}
            </div>
          )}

          <div className="overflow-x-auto rounded-2xl border border-neutral-800">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-neutral-800 bg-neutral-900/60 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Recorded By</th>
                  <th className="px-4 py-2.5 text-right">Items</th>
                  <th className="px-4 py-2.5 text-right">Shortages</th>
                  <th className="px-4 py-2.5 text-right">Surpluses</th>
                  <th className="px-4 py-2.5 text-right">Total Gap</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((row, i) => {
                  const dateStr = String(row.count_date).slice(0, 10);
                  const isSelected = selectedHistory?.count_date === dateStr;
                  return (
                    <tr
                      key={`${dateStr}-${i}`}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedHistory(null);
                        } else {
                          void loadGapDetail(city, dateStr);
                        }
                      }}
                      className={[
                        "cursor-pointer border-t border-neutral-800 text-neutral-200 transition",
                        isSelected ? "bg-violet-950/20" : "hover:bg-neutral-900/30",
                      ].join(" ")}
                    >
                      <td className="px-4 py-3 font-mono text-sm">{dateStr}</td>
                      <td className="px-4 py-3 text-neutral-300">{row.created_by || "—"}</td>
                      <td className="px-4 py-3 text-right font-semibold text-neutral-100">{row.item_count}</td>
                      <td className="px-4 py-3 text-right">
                        {row.shortage_count > 0 ? (
                          <span className="font-semibold text-rose-400">{row.shortage_count}</span>
                        ) : (
                          <span className="text-neutral-600">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {row.surplus_count > 0 ? (
                          <span className="font-semibold text-emerald-400">{row.surplus_count}</span>
                        ) : (
                          <span className="text-neutral-600">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-neutral-300">
                        {Number(row.total_abs_gap ?? 0).toFixed(3)}
                      </td>
                    </tr>
                  );
                })}
                {!historyLoading && historyRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                      No count sessions recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Gap detail panel */}
          {gapDetailError && (
            <div className="rounded-xl border border-rose-800/50 bg-rose-900/20 px-4 py-3 text-sm text-rose-300">
              {gapDetailError}
            </div>
          )}

          {gapDetailLoading && (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/30 px-4 py-6 text-center text-sm text-neutral-500">
              Loading gap detail...
            </div>
          )}

          {selectedHistory && !gapDetailLoading && (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20">
              <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
                <div className="text-sm font-semibold text-neutral-200">
                  Gap Detail — {selectedHistory.count_date}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedHistory(null)}
                  className="rounded-lg border border-neutral-700 px-3 py-1 text-xs text-neutral-400 hover:text-neutral-200"
                >
                  Close
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-neutral-800 bg-neutral-900/60 text-xs uppercase tracking-wide text-neutral-500">
                    <tr>
                      <th className="px-4 py-2.5">Item</th>
                      <th className="px-4 py-2.5">Category</th>
                      <th className="px-4 py-2.5">Unit</th>
                      <th className="px-4 py-2.5 text-right">Counted</th>
                      <th className="px-4 py-2.5 text-right">Theoretical</th>
                      <th className="px-4 py-2.5 text-right">Gap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedHistory.rows.map((r, i) => (
                      <tr
                        key={`${r.item_source}-${r.item_id}-${i}`}
                        className="border-t border-neutral-800 text-neutral-200 transition hover:bg-neutral-900/30"
                      >
                        <td className="px-4 py-2 font-medium">{r.item_name}</td>
                        <td className="px-4 py-2 text-xs text-neutral-400">{r.category || "—"}</td>
                        <td className="px-4 py-2 text-xs text-neutral-400">{r.unit || "—"}</td>
                        <td className="px-4 py-2 text-right font-mono text-xs text-neutral-300">
                          {fmt3(r.count_qty)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-xs text-neutral-500">
                          {fmt3(r.theoretical_qty)}
                        </td>
                        <td className={["px-4 py-2 text-right font-mono text-xs font-semibold", gapColorClass(r.gap_qty, r.theoretical_qty)].join(" ")}>
                          {gapLabel(r.gap_qty, r.theoretical_qty)}
                        </td>
                      </tr>
                    ))}
                    {selectedHistory.rows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                          No items found for this count session.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
