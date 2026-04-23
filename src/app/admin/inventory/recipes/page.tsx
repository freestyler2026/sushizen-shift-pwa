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

export default function InventoryRecipesPage() {
  const auth = useMemo(() => getAuth(), []);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState((auth?.city || "manila") as "manila" | "dubai");
  const [menuItemName, setMenuItemName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<RecipeRow[]>([]);

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
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
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
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncResult, setSyncResult] = useState<{ synced_menu_item_count?: number; inserted_recipe_rows?: number; deleted_recipe_rows?: number } | null>(null);
  const [syncError, setSyncError] = useState("");

  async function previewSync() {
    setSyncBusy(true); setSyncError(""); setSyncResult(null);
    try {
      const res = await inventoryPost<any>("/api/admin/inventory/recipes/menu-bom/preview", { city });
      const s = res?.apply_summary || res?.summary || res || {};
      setSyncResult(s);
    } catch (e: any) { setSyncError(e?.message || String(e)); }
    finally { setSyncBusy(false); }
  }

  async function applySync() {
    setSyncBusy(true); setSyncError(""); setSyncResult(null);
    try {
      const res = await inventoryPost<any>("/api/admin/inventory/recipes/menu-bom/apply", { city });
      const s = res?.apply_summary || res?.summary || res || {};
      setSyncResult(s);
      // Reload recipes
      const updated = await inventoryGet<{ rows: RecipeRow[] }>(
        `/api/admin/inventory/recipes?city=${encodeURIComponent(city)}&menu_item_name=&limit=500`,
      );
      setRows(updated.rows || []);
    } catch (e: any) { setSyncError(e?.message || String(e)); }
    finally { setSyncBusy(false); }
  }

  if (!ready) return <div className="text-sm text-neutral-500">Loading BOM...</div>;
  if (!allowed) return <div className="text-sm text-neutral-500">You do not have permission to open inventory.</div>;

  return (
    <div className="space-y-6">
      <InventoryTabs />

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-neutral-100">Sales Menu BOM</div>
            <div className="mt-1 text-sm text-neutral-400">Define which ingredients are consumed when each sales menu item is sold.</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-neutral-500">{city.toUpperCase()} · {rows.length} lines · {groupedCount} items</div>
            <button
              type="button"
              onClick={() => void previewSync()}
              disabled={syncBusy}
              className="rounded-xl border border-violet-600/40 bg-violet-950/30 px-3 py-1.5 text-xs text-violet-300 transition hover:bg-violet-900/40 disabled:opacity-60"
            >
              {syncBusy ? "Checking..." : "Preview Sync"}
            </button>
            <button
              type="button"
              onClick={() => void applySync()}
              disabled={syncBusy}
              className="rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:from-violet-500 hover:to-purple-500 disabled:opacity-60"
            >
              {syncBusy ? "Syncing..." : "🔄 Sync from Menu Builder"}
            </button>
          </div>
        </div>

        {/* Sync result */}
        {syncError ? (
          <div className="mt-3 rounded-xl border border-red-900/40 bg-red-950/20 px-3 py-2 text-sm text-red-300">❌ {syncError}</div>
        ) : syncResult ? (
          <div className="mt-3 rounded-xl border border-emerald-700/40 bg-emerald-900/15 px-4 py-3 text-sm text-emerald-300">
            ✅ Sync complete — <span className="font-bold">{syncResult.synced_menu_item_count ?? "?"}</span> menu items,{" "}
            <span className="font-bold">{syncResult.inserted_recipe_rows ?? "?"}</span> recipe lines inserted
            {syncResult.deleted_recipe_rows ? `, ${syncResult.deleted_recipe_rows} old lines removed` : ""}.
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
                <th className="px-3 py-2">Sales Menu -&gt; Ingredients</th>
                <th className="px-3 py-2">Ingredient Item</th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Qty</th>
                <th className="px-3 py-2">Yield</th>
                <th className="px-3 py-2">Waste</th>
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
                    No BOM rows found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <InventoryRegistrationHelp />
    </div>
  );
}
