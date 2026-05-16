"use client";

import { useEffect, useMemo, useState } from "react";
import InventoryTabs from "@/components/InventoryTabs";
import InventoryRegistrationHelp from "@/components/InventoryRegistrationHelp";
import { canAccessInventoryAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { inventoryGet, inventoryPost } from "@/lib/inventoryClient";

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

type SyncPreview = {
  synced_menu_item_count?: number;
  inserted_recipe_row_count?: number;
  deleted_recipe_row_count?: number;
  active_inv_menu_recipe_row_count_after?: number;
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
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncPreview | null>(null);
  const [syncError, setSyncError] = useState("");
  const [previewResult, setPreviewResult] = useState<SyncPreview | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);

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
    return () => {
      cancelled = true;
    };
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
    return () => {
      cancelled = true;
    };
  }, [allowed, city, menuItemName, ready]);

  const groupedCount = useMemo(() => new Set(rows.map((row) => row.menu_item_name)).size, [rows]);

  async function previewSync() {
    setSyncBusy(true);
    setSyncError("");
    setSyncResult(null);
    setPreviewResult(null);
    setConfirmApply(false);
    try {
      const res = await inventoryPost<{ apply_summary?: SyncPreview; summary?: SyncPreview }>("/api/admin/inventory/recipes/menu-bom/preview", { city });
      const s = res?.apply_summary || res?.summary || {};
      setPreviewResult(s);
    } catch (e: unknown) {
      setSyncError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncBusy(false);
    }
  }

  async function applySync() {
    setConfirmApply(false);
    setSyncBusy(true);
    setSyncError("");
    setSyncResult(null);
    setPreviewResult(null);
    try {
      const res = await inventoryPost<{ apply_summary?: SyncPreview; summary?: SyncPreview }>("/api/admin/inventory/recipes/menu-bom/apply", { city });
      const s = res?.apply_summary || res?.summary || {};
      setSyncResult(s);
      const updated = await inventoryGet<{ rows: RecipeRow[] }>(
        `/api/admin/inventory/recipes?city=${encodeURIComponent(city)}&menu_item_name=&limit=500`,
      );
      setRows(updated.rows || []);
    } catch (e: unknown) {
      setSyncError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncBusy(false);
    }
  }

  if (!ready) return <div className="text-sm text-neutral-500">Loading recipes...</div>;
  if (!allowed) return <div className="text-sm text-neutral-500">You do not have permission to open inventory.</div>;

  return (
    <div className="space-y-6">
      <InventoryTabs />

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-neutral-100">Menu Ingredient Recipes</div>
            <div className="mt-1 text-sm text-neutral-400">
              Shows which ingredients are consumed when a menu item is sold. Used to calculate cost of goods sold.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-neutral-500">{city.toUpperCase()} · {rows.length} lines · {groupedCount} items</div>
            <button
              type="button"
              onClick={() => void previewSync()}
              disabled={syncBusy}
              className="rounded-xl border border-violet-600/40 bg-violet-950/30 px-3 py-1.5 text-xs text-violet-300 transition hover:bg-violet-900/40 disabled:opacity-60"
            >
              {syncBusy && !confirmApply ? "Checking..." : "Preview Changes"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmApply(true)}
              disabled={syncBusy}
              className="rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:from-violet-500 hover:to-purple-500 disabled:opacity-60"
            >
              {syncBusy && confirmApply ? "Syncing..." : "🔄 Sync from Menu Builder"}
            </button>
          </div>
        </div>

        {/* Preview result */}
        {previewResult ? (
          <div className="mt-3 rounded-xl border border-violet-700/40 bg-violet-900/15 px-4 py-3 text-sm text-violet-200">
            <div className="font-semibold mb-1">Preview: changes that will be applied</div>
            <div className="space-y-0.5 text-xs text-violet-300">
              <div>Menu items affected: <span className="font-bold text-white">{previewResult.synced_menu_item_count ?? "?"}</span></div>
              <div>Recipe lines to add: <span className="font-bold text-emerald-300">{previewResult.inserted_recipe_row_count ?? "?"}</span></div>
              {(previewResult.deleted_recipe_row_count ?? 0) > 0 ? (
                <div>Old recipe lines to remove: <span className="font-bold text-rose-300">{previewResult.deleted_recipe_row_count}</span></div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setConfirmApply(true)}
              className="mt-3 rounded-lg bg-violet-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-violet-600"
            >
              Apply these changes
            </button>
          </div>
        ) : null}

        {/* Sync result */}
        {syncError ? (
          <div className="mt-3 rounded-xl border border-red-900/40 bg-red-950/20 px-3 py-2 text-sm text-red-300">❌ {syncError}</div>
        ) : syncResult ? (
          <div className="mt-3 rounded-xl border border-emerald-700/40 bg-emerald-900/15 px-4 py-3 text-sm text-emerald-300">
            ✅ Sync complete — <span className="font-bold">{syncResult.synced_menu_item_count ?? "?"}</span> menu items,{" "}
            <span className="font-bold">{syncResult.inserted_recipe_row_count ?? syncResult.active_inv_menu_recipe_row_count_after ?? "?"}</span> recipe lines
            {syncResult.deleted_recipe_row_count ? ` (${syncResult.deleted_recipe_row_count} old lines removed)` : ""}.
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">Recipe Lines</div>
            <div className="mt-1 text-lg font-semibold text-neutral-100">{rows.length}</div>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">Menu Items</div>
            <div className="mt-1 text-lg font-semibold text-neutral-100">{groupedCount}</div>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">Active Lines</div>
            <div className="mt-1 text-lg font-semibold text-neutral-100">{rows.filter((row) => row.active).length}</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <select
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            value={city}
            onChange={(e) => setCity(e.target.value as "manila" | "dubai")}
          >
            <option value="manila">Manila</option>
            <option value="dubai">Dubai</option>
          </select>
          <input
            value={menuItemName}
            onChange={(e) => setMenuItemName(e.target.value)}
            placeholder="Search menu item"
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
          />
        </div>

        {error ? <div className="mt-3 text-sm text-rose-300">{error}</div> : null}
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="mb-3 text-sm font-semibold text-neutral-100">{loading ? "Loading..." : "Recipe Lines"}</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2">Sales Menu → Ingredients</th>
                <th className="px-3 py-2">Ingredient Item</th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Qty</th>
                <th className="px-3 py-2" title="Yield: the usable portion kept after processing (e.g. 0.85 = 85% kept)">
                  Yield <span className="text-neutral-600">ⓘ</span>
                </th>
                <th className="px-3 py-2" title="Waste: expected loss percentage during preparation (e.g. 0.05 = 5% wasted)">
                  Waste % <span className="text-neutral-600">ⓘ</span>
                </th>
                <th className="px-3 py-2">Active</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-neutral-800 text-neutral-200">
                  <td className="px-3 py-2">{row.menu_item_name}</td>
                  <td className="px-3 py-2">
                    {row.ingredient_item_name}
                    {row.ingredient_unit ? <div className="mt-1 text-xs text-neutral-500">{row.ingredient_unit}</div> : null}
                  </td>
                  <td className="px-3 py-2">{row.sku || "-"}</td>
                  <td className="px-3 py-2">{Number(row.ingredient_qty || 0).toFixed(3)}</td>
                  <td className="px-3 py-2">{Number(row.yield_factor || 0).toFixed(2)}</td>
                  <td className="px-3 py-2">{Number(row.waste_factor || 0).toFixed(2)}</td>
                  <td className="px-3 py-2">{row.active ? "Yes" : "No"}</td>
                </tr>
              ))}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-neutral-500">
                    No recipe lines found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <InventoryRegistrationHelp />

      {/* Sync confirmation modal */}
      {confirmApply && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 p-6 shadow-xl">
            <h3 className="mb-2 text-base font-semibold text-white">Sync recipes from Menu Builder?</h3>
            <p className="mb-2 text-sm text-neutral-300">
              This will update recipe lines for all menu items in {city.toUpperCase()} based on the current Menu Builder data.
            </p>
            {previewResult && (previewResult.deleted_recipe_row_count ?? 0) > 0 ? (
              <p className="mb-4 text-sm text-rose-300">
                ⚠️ {previewResult.deleted_recipe_row_count} old recipe line{(previewResult.deleted_recipe_row_count ?? 0) !== 1 ? "s" : ""} will be removed. This cannot be undone.
              </p>
            ) : (
              <p className="mb-4 text-sm text-neutral-400">Existing recipe lines not in the Menu Builder will be removed. This cannot be undone.</p>
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmApply(false)}
                className="rounded-lg border border-neutral-600 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void applySync()}
                className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-600"
              >
                Sync Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
