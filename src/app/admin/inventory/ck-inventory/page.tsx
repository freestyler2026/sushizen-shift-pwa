"use client";

import { useEffect, useMemo, useState } from "react";
import InventoryTabs from "@/components/InventoryTabs";
import { canAccessInventoryWorkspace, getAuth, refreshAuthFromApi } from "@/lib/auth";
import type { City } from "@/lib/branches";
import { inventoryGet } from "@/lib/inventoryClient";

type CkStockRow = {
  id: string;
  city: string;
  name: string;
  name_localized: string;
  sku: string;
  category_name: string;
  item_type: string;
  storage_unit: string;
  cost: number;
  minimum_level: number;
  par_level: number;
  maximum_level: number;
  item_status: string;
  on_hand_qty: number;
  on_hand_value: number;
  last_ledger_date: string | null;
  stock_status: "OK" | "LOW" | "CRITICAL" | "OUT";
};

type StatusFilter = "ALL" | "OK" | "LOW" | "CRITICAL" | "OUT";

const STATUS_LABEL: Record<CkStockRow["stock_status"], string> = {
  OK: "OK",
  LOW: "Low",
  CRITICAL: "Critical",
  OUT: "Out of Stock",
};

const STATUS_CLASSES: Record<CkStockRow["stock_status"], string> = {
  OK: "bg-emerald-900/40 text-emerald-300 border-emerald-800/40",
  LOW: "bg-amber-900/40 text-amber-300 border-amber-800/40",
  CRITICAL: "bg-rose-900/40 text-rose-300 border-rose-800/40",
  OUT: "bg-neutral-800/60 text-neutral-400 border-neutral-700/40",
};

const STATUS_ROW_CLASSES: Record<CkStockRow["stock_status"], string> = {
  OK: "",
  LOW: "bg-amber-950/10",
  CRITICAL: "bg-rose-950/15",
  OUT: "bg-neutral-900/50",
};

function number3(v: number | null | undefined): string {
  return Number(v ?? 0).toFixed(3);
}

export default function CkInventoryPage() {
  const auth = useMemo(() => getAuth(), []);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState<City>((auth?.city || "manila") as City);
  const [rows, setRows] = useState<CkStockRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const resolved = await refreshAuthFromApi(auth);
      if (cancelled) return;
      const nextCity = (resolved?.city || auth?.city || "manila") as City;
      setAllowed(canAccessInventoryWorkspace(resolved));
      setCity(nextCity);
      setReady(true);
    }
    void init();
    return () => { cancelled = true; };
  }, [auth]);

  useEffect(() => {
    if (!ready || !allowed) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await inventoryGet<{ rows: CkStockRow[] }>(
          `/api/admin/inventory/ck-inventory?city=${encodeURIComponent(city)}`,
        );
        if (!cancelled) setRows(res.rows || []);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [allowed, city, ready]);

  const kpi = useMemo(() => {
    const total = rows.length;
    const ok = rows.filter((r) => r.stock_status === "OK").length;
    const low = rows.filter((r) => r.stock_status === "LOW").length;
    const critical = rows.filter((r) => r.stock_status === "CRITICAL").length;
    const out = rows.filter((r) => r.stock_status === "OUT").length;
    return { total, ok, low, critical, out };
  }, [rows]);

  const filtered = useMemo(() => {
    let result = rows;
    if (statusFilter !== "ALL") result = result.filter((r) => r.stock_status === statusFilter);
    if (q.trim()) {
      const lq = q.trim().toLowerCase();
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(lq) ||
          r.sku.toLowerCase().includes(lq) ||
          r.category_name.toLowerCase().includes(lq),
      );
    }
    return result;
  }, [rows, statusFilter, q]);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(rows.map((r) => r.category_name))).sort();
    return cats;
  }, [rows]);

  if (!ready) return <div className="text-sm text-neutral-500">Loading...</div>;
  if (!allowed) return <div className="text-sm text-neutral-500">You do not have permission to open inventory.</div>;

  return (
    <div className="space-y-6">
      <InventoryTabs />

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-neutral-100">CK Inventory Snapshot</div>
            <div className="mt-1 text-sm text-neutral-400">
              Current stock of Central Kitchen products and sauces. Latest balances calculated from the stock ledger.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={city}
              onChange={(e) => setCity(e.target.value as City)}
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            >
              <option value="dubai">Dubai</option>
              <option value="manila">Manila</option>
            </select>
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setLoading(true);
                inventoryGet<{ rows: CkStockRow[] }>(
                  `/api/admin/inventory/ck-inventory?city=${encodeURIComponent(city)}`,
                )
                  .then((res) => setRows(res.rows || []))
                  .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
                  .finally(() => setLoading(false));
              }}
              className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm text-neutral-200 disabled:opacity-50"
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <button
            type="button"
            onClick={() => setStatusFilter("ALL")}
            className={[
              "rounded-2xl border p-4 text-left transition",
              statusFilter === "ALL"
                ? "border-violet-600/50 bg-violet-900/20"
                : "border-neutral-800 bg-neutral-950/30 hover:border-neutral-700",
            ].join(" ")}
          >
            <div className="text-xs uppercase tracking-wide text-neutral-500">All Items</div>
            <div className="mt-1 text-2xl font-bold text-neutral-100">{kpi.total}</div>
          </button>
          {(["OK", "LOW", "CRITICAL", "OUT"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s === statusFilter ? "ALL" : s)}
              className={[
                "rounded-2xl border p-4 text-left transition",
                statusFilter === s
                  ? STATUS_CLASSES[s] + " opacity-100"
                  : "border-neutral-800 bg-neutral-950/30 hover:border-neutral-700",
              ].join(" ")}
            >
              <div className="text-xs uppercase tracking-wide text-neutral-500">{STATUS_LABEL[s]}</div>
              <div className={[
                "mt-1 text-2xl font-bold",
                statusFilter === s ? "" : s === "OK" ? "text-emerald-400" : s === "LOW" ? "text-amber-400" : s === "CRITICAL" ? "text-rose-400" : "text-neutral-500",
              ].join(" ")}>
                {kpi[s.toLowerCase() as keyof typeof kpi]}
              </div>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="mt-4">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by item name, SKU or category"
            className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm text-neutral-100 placeholder:text-neutral-600"
          />
        </div>

        {error ? <div className="mt-3 text-sm text-rose-300">{error}</div> : null}

        {/* Category breakdown chips */}
        {categories.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {categories.map((cat) => {
              const catRows = rows.filter((r) => r.category_name === cat);
              const alerts = catRows.filter((r) => r.stock_status === "CRITICAL" || r.stock_status === "OUT").length;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setQ(cat === q ? "" : cat)}
                  className={[
                    "rounded-full border px-3 py-1 text-xs transition",
                    q === cat
                      ? "border-violet-600/50 bg-violet-900/20 text-violet-200"
                      : alerts > 0
                      ? "border-rose-800/40 bg-rose-950/20 text-rose-300"
                      : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-500",
                  ].join(" ")}
                >
                  {cat} ({catRows.length})
                  {alerts > 0 ? <span className="ml-1 text-rose-400">⚠ {alerts}</span> : null}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Stock Table */}
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-neutral-100">
            Stock List
            {statusFilter !== "ALL" ? (
              <span className="ml-2 text-xs font-normal text-neutral-400">
                — {STATUS_LABEL[statusFilter]} filter active
              </span>
            ) : null}
          </div>
          <div className="text-xs text-neutral-500">{filtered.length} items</div>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2">Item Name</th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2 text-right">On Hand</th>
                <th className="px-3 py-2 text-right">Stock Value</th>
                <th className="px-3 py-2 text-right">Min Level</th>
                <th className="px-3 py-2 text-right">Par Level</th>
                <th className="px-3 py-2 text-right">Max Level</th>
                <th className="px-3 py-2">Last Updated</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.id}
                  className={[
                    "border-t border-neutral-800 text-neutral-200 transition",
                    STATUS_ROW_CLASSES[row.stock_status],
                  ].join(" ")}
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">{row.name}</div>
                    {row.name_localized ? (
                      <div className="text-xs text-neutral-500">{row.name_localized}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-neutral-400">{row.sku || "—"}</td>
                  <td className="px-3 py-2 text-xs text-neutral-400">{row.category_name || "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={row.stock_status === "OUT" ? "text-neutral-500" : row.stock_status === "CRITICAL" ? "text-rose-300" : "text-neutral-100"}>
                      {number3(row.on_hand_qty)}
                    </span>
                    <span className="ml-1 text-xs text-neutral-500">{row.storage_unit}</span>
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-neutral-400">
                    {Number(row.on_hand_value || 0).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-neutral-500">
                    {row.minimum_level > 0 ? number3(row.minimum_level) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-neutral-500">
                    {row.par_level > 0 ? number3(row.par_level) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-neutral-500">
                    {row.maximum_level > 0 ? number3(row.maximum_level) : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-500">
                    {row.last_ledger_date ? String(row.last_ledger_date).slice(0, 10) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span className={[
                      "rounded-full border px-2.5 py-0.5 text-xs font-medium",
                      STATUS_CLASSES[row.stock_status],
                    ].join(" ")}>
                      {STATUS_LABEL[row.stock_status]}
                    </span>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-neutral-500">
                    {rows.length === 0
                      ? "No CK items registered in inventory (categories: CK加工品, CKソース, Kitchen加工品 or CK*)."
                      : "No items match the current filter."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* Stock summary by category */}
        {rows.length > 0 && (
          <div className="mt-6 border-t border-neutral-800 pt-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Summary by Category</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((cat) => {
                const catRows = rows.filter((r) => r.category_name === cat);
                const totalValue = catRows.reduce((s, r) => s + Number(r.on_hand_value || 0), 0);
                const byStatus = {
                  OK: catRows.filter((r) => r.stock_status === "OK").length,
                  LOW: catRows.filter((r) => r.stock_status === "LOW").length,
                  CRITICAL: catRows.filter((r) => r.stock_status === "CRITICAL").length,
                  OUT: catRows.filter((r) => r.stock_status === "OUT").length,
                };
                return (
                  <div key={cat} className="rounded-xl border border-neutral-800 bg-neutral-950/30 px-4 py-3">
                    <div className="text-xs font-semibold text-neutral-200">{cat}</div>
                    <div className="mt-1 text-xs text-neutral-500">{catRows.length} items · Stock value {totalValue.toFixed(2)}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(["OK", "LOW", "CRITICAL", "OUT"] as const).map((s) =>
                        byStatus[s] > 0 ? (
                          <span key={s} className={["rounded-full border px-2 py-0.5 text-xs", STATUS_CLASSES[s]].join(" ")}>
                            {STATUS_LABEL[s]} {byStatus[s]}
                          </span>
                        ) : null,
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
