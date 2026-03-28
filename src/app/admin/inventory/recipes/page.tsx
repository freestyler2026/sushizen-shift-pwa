"use client";

import { useEffect, useMemo, useState } from "react";
import InventoryTabs from "@/components/InventoryTabs";
import InventoryRegistrationHelp from "@/components/InventoryRegistrationHelp";
import { canAccessInventoryAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { inventoryGet } from "@/lib/inventoryClient";

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
          <div className="text-xs text-neutral-500">{city.toUpperCase()} recipes</div>
        </div>

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
