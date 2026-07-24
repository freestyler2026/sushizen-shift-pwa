"use client";

import { useEffect, useMemo, useState } from "react";
import InventoryTabs from "@/components/InventoryTabs";
import InventoryRegistrationHelp from "@/components/InventoryRegistrationHelp";
import { canAccessInventoryAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { inventoryGet, inventoryPost } from "@/lib/inventoryClient";
import SelectDark from "@/components/SelectDark";

type RecipeRow = {
  id: string;
  menu_item_name: string;
  ingredient_item_name: string;
  sku: string;
  ingredient_qty: number;
  ingredient_unit: string;
  yield_factor: number;
  waste_factor: number;
  active: boolean;
};

type CostCalcPreview = {
  source_menu_item_count?: number;
  source_component_count?: number;
  existing_recipe_row_count?: number;
  existing_menu_item_count?: number;
  items_preview?: { name: string; category: string; components: number }[];
};

type CostCalcResult = {
  synced_menu_item_count?: number;
  inserted_recipe_row_count?: number;
  deleted_recipe_row_count?: number;
  active_recipe_row_count_after?: number;
  active_menu_item_count_after?: number;
  errors?: string[];
};

type DedupeGroup = {
  key: string;
  variants: string[];
  total_rows: number;
};

type DedupePreview = {
  duplicate_groups: number;
  groups: DedupeGroup[];
};

type DedupeResult = {
  groups_merged: number;
  rows_renamed: number;
  rows_deleted: number;
  canonical_names: string[];
};

export default function InventoryRecipesPage() {
  const auth = useMemo(() => getAuth(), []);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState((auth?.city || "manila") as "manila" | "dubai");
  const [menuItemName, setMenuItemName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<RecipeRow[]>([]);

  const [ccBusy, setCcBusy] = useState(false);
  const [ccPreview, setCcPreview] = useState<CostCalcPreview | null>(null);
  const [ccResult, setCcResult] = useState<CostCalcResult | null>(null);
  const [ccError, setCcError] = useState("");
  const [confirmCc, setConfirmCc] = useState(false);

  const [dedupeBusy, setDedupeBusy] = useState(false);
  const [dedupePreview, setDedupePreview] = useState<DedupePreview | null>(null);
  const [dedupeResult, setDedupeResult] = useState<DedupeResult | null>(null);
  const [dedupeError, setDedupeError] = useState("");
  const [confirmDedupe, setConfirmDedupe] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const resolved = await refreshAuthFromApi(auth);
      if (cancelled) return;
      setAllowed(canAccessInventoryAdmin(resolved));
      setCity((resolved?.city || auth?.city || "manila") as "manila" | "dubai");
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
        const res = await inventoryGet<{ rows: RecipeRow[] }>(
          `/api/admin/inventory/recipes?city=${encodeURIComponent(city)}&menu_item_name=${encodeURIComponent(menuItemName)}&limit=500`,
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
  }, [allowed, city, menuItemName, ready]);

  const groupedCount = useMemo(() => new Set(rows.map((row) => row.menu_item_name)).size, [rows]);

  async function previewCostCalcSync() {
    setCcBusy(true);
    setCcError("");
    setCcPreview(null);
    setCcResult(null);
    setConfirmCc(false);
    try {
      const res = await inventoryPost<CostCalcPreview & { ok: boolean }>("/api/admin/inventory/recipes/cost-calc/preview", { city });
      setCcPreview(res);
    } catch (e: unknown) {
      setCcError(e instanceof Error ? e.message : String(e));
    } finally {
      setCcBusy(false);
    }
  }

  async function applyCostCalcSync() {
    setConfirmCc(false);
    setCcBusy(true);
    setCcError("");
    setCcPreview(null);
    setCcResult(null);
    try {
      const res = await inventoryPost<CostCalcResult & { ok: boolean }>("/api/admin/inventory/recipes/cost-calc/apply", { city });
      setCcResult(res);
      const updated = await inventoryGet<{ rows: RecipeRow[] }>(
        `/api/admin/inventory/recipes?city=${encodeURIComponent(city)}&menu_item_name=&limit=500`,
      );
      setRows(updated.rows || []);
    } catch (e: unknown) {
      setCcError(e instanceof Error ? e.message : String(e));
    } finally {
      setCcBusy(false);
    }
  }

  async function previewDedupe() {
    setDedupeBusy(true);
    setDedupeError("");
    setDedupePreview(null);
    setDedupeResult(null);
    setConfirmDedupe(false);
    try {
      const res = await inventoryPost<DedupePreview>("/api/admin/inventory/recipes/deduplicate/preview", { city });
      setDedupePreview(res);
    } catch (e: unknown) {
      setDedupeError(e instanceof Error ? e.message : String(e));
    } finally {
      setDedupeBusy(false);
    }
  }

  async function applyDedupe() {
    setConfirmDedupe(false);
    setDedupeBusy(true);
    setDedupeError("");
    setDedupePreview(null);
    setDedupeResult(null);
    try {
      const res = await inventoryPost<DedupeResult>("/api/admin/inventory/recipes/deduplicate/apply", { city });
      setDedupeResult(res);
      const updated = await inventoryGet<{ rows: RecipeRow[] }>(
        `/api/admin/inventory/recipes?city=${encodeURIComponent(city)}&menu_item_name=&limit=500`,
      );
      setRows(updated.rows || []);
    } catch (e: unknown) {
      setDedupeError(e instanceof Error ? e.message : String(e));
    } finally {
      setDedupeBusy(false);
    }
  }

  if (!ready) return <div className="text-sm text-neutral-500">Loading recipes...</div>;
  if (!allowed) return <div className="text-sm text-neutral-500">You do not have permission to open inventory.</div>;

  return (
    <div className="space-y-6">
      <InventoryTabs />

      {/* Sync from Cost Calculation */}
      <section className="rounded-2xl border border-emerald-800/40 bg-emerald-950/20 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold text-emerald-200">Sync from Cost Calculation</div>
            <div className="mt-1 text-sm text-neutral-400 max-w-xl">
              Imports all product recipes from Cost Calculation (menu_item_master + menu_item_components) into Sales BOM.
              Each time Cost Calculation is updated, run this sync to keep Sales BOM current.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void previewCostCalcSync()}
              disabled={ccBusy || dedupeBusy}
              className="rounded-xl border border-emerald-700/50 bg-emerald-900/30 px-4 py-2 text-sm text-emerald-300 transition hover:bg-emerald-900/50 disabled:opacity-60"
            >
              {ccBusy && !confirmCc ? "Checking..." : "Preview"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmCc(true)}
              disabled={ccBusy || dedupeBusy}
              className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
            >
              {ccBusy && confirmCc ? "Syncing..." : "⟳ Sync from Cost Calc"}
            </button>
          </div>
        </div>

        {ccPreview && !ccResult && (
          <div className="mt-4 rounded-xl border border-emerald-700/40 bg-emerald-900/15 px-4 py-3 text-sm">
            <div className="font-semibold text-emerald-200 mb-2">Preview — {city.toUpperCase()}</div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs text-emerald-300">
              <div>Products with recipes: <span className="font-bold text-white">{ccPreview.source_menu_item_count ?? "?"}</span></div>
              <div>Total ingredient lines: <span className="font-bold text-white">{ccPreview.source_component_count ?? "?"}</span></div>
              <div>Current BOM rows: <span className="font-bold text-neutral-300">{ccPreview.existing_recipe_row_count ?? "?"}</span></div>
              <div>Current BOM products: <span className="font-bold text-neutral-300">{ccPreview.existing_menu_item_count ?? "?"}</span></div>
            </div>
            {(ccPreview.items_preview?.length ?? 0) > 0 && (
              <div className="mt-3">
                <div className="text-xs text-neutral-500 mb-1">Items to sync (first 50):</div>
                <div className="flex flex-wrap gap-1">
                  {ccPreview.items_preview?.map((item) => (
                    <span key={item.name} className="rounded-md bg-emerald-900/40 px-2 py-0.5 text-xs text-emerald-300">
                      {item.name} <span className="text-neutral-500">({item.components})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => setConfirmCc(true)}
              className="mt-3 rounded-lg bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600"
            >
              Apply sync now
            </button>
          </div>
        )}

        {ccError && (
          <div className="mt-3 rounded-xl border border-red-900/40 bg-red-950/20 px-3 py-2 text-sm text-red-300">❌ {ccError}</div>
        )}

        {ccResult && (
          <div className="mt-3 rounded-xl border border-emerald-700/40 bg-emerald-900/15 px-4 py-3 text-sm text-emerald-200">
            <div className="font-semibold mb-1">✅ Sync complete — {city.toUpperCase()}</div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-0.5 text-xs text-emerald-300">
              <div>Products synced: <span className="font-bold text-white">{ccResult.synced_menu_item_count ?? "?"}</span></div>
              <div>Recipe lines added: <span className="font-bold text-white">{ccResult.inserted_recipe_row_count ?? "?"}</span></div>
              <div>Old lines removed: <span className="font-bold text-rose-300">{ccResult.deleted_recipe_row_count ?? 0}</span></div>
              <div>Total BOM rows: <span className="font-bold text-white">{ccResult.active_recipe_row_count_after ?? "?"}</span></div>
            </div>
            {(ccResult.errors?.length ?? 0) > 0 && (
              <div className="mt-2 text-xs text-rose-300">
                Errors: {ccResult.errors?.join(" | ")}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Recipe list */}
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-neutral-100">Sales BOM — Recipe Lines</div>
            <div className="mt-1 text-sm text-neutral-400">
              {city.toUpperCase()} · {rows.length} lines · {groupedCount} products
            </div>
          </div>
          <button
            type="button"
            onClick={() => void previewDedupe()}
            disabled={dedupeBusy || ccBusy}
            className="rounded-xl border border-amber-600/40 bg-amber-950/20 px-3 py-1.5 text-xs text-amber-300 transition hover:bg-amber-900/30 disabled:opacity-60"
          >
            {dedupeBusy && !confirmDedupe ? "Scanning..." : "🔧 Deduplicate Names"}
          </button>
        </div>

        {dedupePreview && (
          <div className="mt-3 rounded-xl border border-amber-700/40 bg-amber-900/10 px-4 py-3 text-sm text-amber-200">
            {dedupePreview.duplicate_groups === 0 ? (
              <div className="font-semibold text-emerald-300">✅ No duplicate names found.</div>
            ) : (
              <>
                <div className="font-semibold mb-2">
                  Found {dedupePreview.duplicate_groups} group{dedupePreview.duplicate_groups !== 1 ? "s" : ""} of duplicate names:
                </div>
                <ul className="mb-3 space-y-1 text-xs text-amber-300">
                  {dedupePreview.groups.map((g) => (
                    <li key={g.key}>
                      <span className="text-neutral-400">{g.key}</span>{" → "}
                      {g.variants.map((v, i) => (
                        <span key={v}>
                          <span className={i === g.variants.length - 1 ? "font-bold text-white" : "line-through text-neutral-500"}>{v}</span>
                          {i < g.variants.length - 1 && <span className="text-neutral-500">, </span>}
                        </span>
                      ))}
                      <span className="ml-1 text-neutral-500">({g.total_rows} rows)</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => setConfirmDedupe(true)}
                  className="rounded-lg bg-amber-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-600"
                >
                  Merge duplicates
                </button>
              </>
            )}
          </div>
        )}
        {dedupeError && (
          <div className="mt-3 rounded-xl border border-red-900/40 bg-red-950/20 px-3 py-2 text-sm text-red-300">❌ {dedupeError}</div>
        )}
        {dedupeResult && (
          <div className="mt-3 rounded-xl border border-emerald-700/40 bg-emerald-900/15 px-4 py-3 text-sm text-emerald-300">
            ✅ Deduplication complete — {dedupeResult.groups_merged} group{dedupeResult.groups_merged !== 1 ? "s" : ""} merged,{" "}
            {dedupeResult.rows_renamed} rows renamed, {dedupeResult.rows_deleted} duplicate rows removed.
          </div>
        )}

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">Recipe Lines</div>
            <div className="mt-1 text-lg font-semibold text-neutral-100">{rows.length}</div>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">Products</div>
            <div className="mt-1 text-lg font-semibold text-neutral-100">{groupedCount}</div>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">Active Lines</div>
            <div className="mt-1 text-lg font-semibold text-neutral-100">{rows.filter((r) => r.active).length}</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <SelectDark
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            value={city}
            onChange={v => setCity(v as "manila" | "dubai")}
            options={[
              { value: "manila", label: "Manila" },
              { value: "dubai", label: "Dubai" },
            ]}
          />
          <input
            value={menuItemName}
            onChange={(e) => setMenuItemName(e.target.value)}
            placeholder="Search product name"
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
          />
        </div>

        {error && <div className="mt-3 text-sm text-rose-300">{error}</div>}

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2">Product (Cost Calc)</th>
                <th className="px-3 py-2">Ingredient</th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Qty</th>
                <th className="px-3 py-2">Yield</th>
                <th className="px-3 py-2">Waste %</th>
                <th className="px-3 py-2">Active</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-neutral-800 text-neutral-200">
                  <td className="px-3 py-2">{row.menu_item_name}</td>
                  <td className="px-3 py-2">
                    {row.ingredient_item_name}
                    {row.ingredient_unit && <div className="mt-0.5 text-xs text-neutral-500">{row.ingredient_unit}</div>}
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-400">{row.sku || "—"}</td>
                  <td className="px-3 py-2">{Number(row.ingredient_qty || 0).toFixed(3)}</td>
                  <td className="px-3 py-2">{Number(row.yield_factor || 0).toFixed(2)}</td>
                  <td className="px-3 py-2">{Number(row.waste_factor || 0).toFixed(2)}</td>
                  <td className="px-3 py-2">{row.active ? "Yes" : "No"}</td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-neutral-500">
                    No recipe lines. Click &ldquo;Sync from Cost Calc&rdquo; above to populate.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <InventoryRegistrationHelp />

      {/* Cost Calc sync confirmation modal */}
      {confirmCc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-emerald-700 bg-neutral-900 p-6 shadow-xl">
            <h3 className="mb-2 text-base font-semibold text-white">Sync Sales BOM from Cost Calculation?</h3>
            <p className="mb-4 text-sm text-neutral-300">
              All active products in Cost Calculation for <strong>{city.toUpperCase()}</strong> that have ingredient recipes will be synced into Sales BOM.
              Existing recipe lines for those products will be replaced. This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmCc(false)}
                className="rounded-lg border border-neutral-600 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void applyCostCalcSync()}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
              >
                Sync Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deduplicate confirmation modal */}
      {confirmDedupe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-amber-700 bg-neutral-900 p-6 shadow-xl">
            <h3 className="mb-2 text-base font-semibold text-white">Merge duplicate recipe names?</h3>
            <p className="mb-4 text-sm text-neutral-300">
              Duplicate name variants will be consolidated into a single canonical name. Conflicting ingredient rows will be removed. This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDedupe(false)}
                className="rounded-lg border border-neutral-600 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void applyDedupe()}
                className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
              >
                Merge Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
