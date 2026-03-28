"use client";

import { useEffect, useMemo, useState } from "react";
import InventoryTabs from "@/components/InventoryTabs";
import { canAccessInventoryAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { inventoryGet } from "@/lib/inventoryClient";

type InventoryItemRow = {
  id: string;
  name: string;
  sku: string;
  category_name: string;
  item_type: string;
  storage_unit: string;
  cost: number;
  status: string;
  tags?: string[];
};

type InventoryCategoryRow = {
  id: string;
  name: string;
  reference: string;
};

type InventorySupplierRow = {
  id: string;
  name: string;
  supplier_code: string;
};

export default function InventoryItemsPage() {
  const auth = useMemo(() => getAuth(), []);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState((auth?.city || "manila") as "manila" | "dubai");
  const [tab, setTab] = useState("ALL");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<InventoryItemRow[]>([]);
  const [categories, setCategories] = useState<InventoryCategoryRow[]>([]);
  const [suppliers, setSuppliers] = useState<InventorySupplierRow[]>([]);

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
        const [itemsRes, categoriesRes, suppliersRes] = await Promise.all([
          inventoryGet<{ rows: InventoryItemRow[] }>(`/api/admin/inventory/items?city=${encodeURIComponent(city)}&tab=${encodeURIComponent(tab)}&q=${encodeURIComponent(q)}&limit=200`),
          inventoryGet<{ rows: InventoryCategoryRow[] }>(`/api/admin/inventory/categories?city=${encodeURIComponent(city)}&tab=ALL&limit=200`),
          inventoryGet<{ rows: InventorySupplierRow[] }>(`/api/admin/inventory/suppliers?city=${encodeURIComponent(city)}&tab=ALL&limit=200`),
        ]);
        if (cancelled) return;
        setItems(itemsRes.rows || []);
        setCategories(categoriesRes.rows || []);
        setSuppliers(suppliersRes.rows || []);
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
  }, [allowed, city, q, ready, tab]);

  if (!ready) return <div className="text-sm text-neutral-500">Loading inventory items...</div>;
  if (!allowed) return <div className="text-sm text-neutral-500">You do not have permission to open inventory.</div>;

  return (
    <div className="space-y-6">
      <InventoryTabs />

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-neutral-100">Items</div>
            <div className="mt-1 text-sm text-neutral-400">Inventory masters, suppliers, and category references.</div>
          </div>
          <div className="text-xs text-neutral-500">{city.toUpperCase()} inventory</div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">Items</div>
            <div className="mt-1 text-lg font-semibold text-neutral-100">{items.length}</div>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">Categories</div>
            <div className="mt-1 text-lg font-semibold text-neutral-100">{categories.length}</div>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">Suppliers</div>
            <div className="mt-1 text-lg font-semibold text-neutral-100">{suppliers.length}</div>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">Deleted</div>
            <div className="mt-1 text-lg font-semibold text-neutral-100">{items.filter((item) => item.status === "DELETED").length}</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <select
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            value={city}
            onChange={(e) => setCity(e.target.value as "manila" | "dubai")}
          >
            <option value="manila">Manila</option>
            <option value="dubai">Dubai</option>
          </select>
          <select
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            value={tab}
            onChange={(e) => setTab(e.target.value)}
          >
            <option value="ALL">All</option>
            <option value="ITEMS">Items</option>
            <option value="PRODUCTS">Products</option>
            <option value="DELETED">Deleted</option>
          </select>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search item / SKU / barcode"
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
          />
        </div>

        {error ? <div className="mt-3 text-sm text-rose-300">{error}</div> : null}
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="mb-3 text-sm font-semibold text-neutral-100">{loading ? "Loading..." : "Item List"}</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2">Cost</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-neutral-800 text-neutral-200">
                  <td className="px-3 py-2">
                    <div>{item.name}</div>
                    {item.tags?.length ? <div className="mt-1 text-xs text-neutral-500">{item.tags.join(", ")}</div> : null}
                  </td>
                  <td className="px-3 py-2">{item.sku || "-"}</td>
                  <td className="px-3 py-2">{item.category_name || "-"}</td>
                  <td className="px-3 py-2">{item.item_type || "-"}</td>
                  <td className="px-3 py-2">{item.storage_unit || "-"}</td>
                  <td className="px-3 py-2">{Number(item.cost || 0).toFixed(2)}</td>
                  <td className="px-3 py-2">{item.status || "-"}</td>
                </tr>
              ))}
              {!loading && items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-neutral-500">
                    No inventory items found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
