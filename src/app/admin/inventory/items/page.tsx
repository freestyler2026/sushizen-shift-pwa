"use client";

import { useEffect, useMemo, useState } from "react";
import InventoryTabs from "@/components/InventoryTabs";
import InventoryRegistrationHelp from "@/components/InventoryRegistrationHelp";
import { canAccessInventoryAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { inventoryGet, inventoryPost } from "@/lib/inventoryClient";
import { parseDraftNumber, stepDraftNumber } from "@/lib/quantityInput";

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
  const createCostStep = 0.1;
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
  const [createBusy, setCreateBusy] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createSku, setCreateSku] = useState("");
  const [createCategoryId, setCreateCategoryId] = useState("");
  const [createCategoryName, setCreateCategoryName] = useState("");
  const [createUnit, setCreateUnit] = useState("");
  const [createCost, setCreateCost] = useState("0");
  const [createType, setCreateType] = useState("ITEM");
  const [createSuccess, setCreateSuccess] = useState("");
  const [createCategoryBusy, setCreateCategoryBusy] = useState(false);

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
    async function loadNextSku() {
      try {
        const res = await inventoryGet<{ sku?: string }>(`/api/admin/inventory/sku/next?city=${encodeURIComponent(city)}`);
        if (!cancelled) setCreateSku(res.sku || "");
      } catch {
        if (!cancelled) setCreateSku("");
      }
    }
    void loadNextSku();
    return () => {
      cancelled = true;
    };
  }, [allowed, city, ready]);

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

  async function createItem() {
    const name = createName.trim();
    if (!name) {
      setError("Please enter item name.");
      return;
    }
    const parsedCost = parseDraftNumber(createCost);
    if (parsedCost === null || parsedCost < 0) {
      setError("Please enter a valid cost.");
      return;
    }
    setCreateBusy(true);
    setError("");
    setCreateSuccess("");
    try {
      const pickedCategory = categories.find((row) => row.id === createCategoryId) || null;
      let resolvedCategoryId = createCategoryId || "";
      let resolvedCategoryName = (pickedCategory?.name || createCategoryName || "").trim();
      if (!resolvedCategoryId && resolvedCategoryName) {
        const existing = categories.find((row) => row.name.trim().toLowerCase() === resolvedCategoryName.toLowerCase());
        if (existing) {
          resolvedCategoryId = existing.id;
          resolvedCategoryName = existing.name;
        } else {
          const created = await inventoryPost<{ row?: InventoryCategoryRow }>("/api/admin/inventory/categories", {
            city,
            name: resolvedCategoryName,
            reference: "",
          });
          const createdRow = created?.row;
          if (createdRow?.id) {
            resolvedCategoryId = createdRow.id;
            resolvedCategoryName = createdRow.name || resolvedCategoryName;
          }
        }
      }
      const created = await inventoryPost<{ row?: InventoryItemRow }>("/api/admin/inventory/items", {
        city,
        name,
        sku: createSku.trim(),
        category_id: resolvedCategoryId,
        category_name: resolvedCategoryName,
        storage_unit: createUnit.trim(),
        ingredient_unit: createUnit.trim(),
        storage_to_ingredient: 1,
        costing_method: "FIXED",
        cost: parsedCost,
        minimum_level: 0,
        par_level: 0,
        maximum_level: 0,
        item_type: createType,
        tags: [],
        suppliers: [],
        custom_levels: [],
      });
      const [itemsRes, categoriesRes, suppliersRes] = await Promise.all([
        inventoryGet<{ rows: InventoryItemRow[] }>(`/api/admin/inventory/items?city=${encodeURIComponent(city)}&tab=${encodeURIComponent(tab)}&q=${encodeURIComponent(q)}&limit=200`),
        inventoryGet<{ rows: InventoryCategoryRow[] }>(`/api/admin/inventory/categories?city=${encodeURIComponent(city)}&tab=ALL&limit=200`),
        inventoryGet<{ rows: InventorySupplierRow[] }>(`/api/admin/inventory/suppliers?city=${encodeURIComponent(city)}&tab=ALL&limit=200`),
      ]);
      setItems(itemsRes.rows || []);
      setCategories(categoriesRes.rows || []);
      setSuppliers(suppliersRes.rows || []);
      setCreateName("");
      setCreateSku("");
      setCreateCategoryId("");
      setCreateCategoryName("");
      setCreateUnit("");
      setCreateCost("0");
      setCreateType("ITEM");
      setCreateSuccess(`Item created successfully. SKU: ${created?.row?.sku || "-"}.`);
      try {
        const nextSkuRes = await inventoryGet<{ sku?: string }>(`/api/admin/inventory/sku/next?city=${encodeURIComponent(city)}`);
        setCreateSku(nextSkuRes.sku || "");
      } catch {
        setCreateSku("");
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setCreateBusy(false);
    }
  }

  async function createCategoryOnly() {
    const name = createCategoryName.trim();
    if (!name) {
      setError("Please enter category name first.");
      return;
    }
    setCreateCategoryBusy(true);
    setError("");
    try {
      const created = await inventoryPost<{ row?: InventoryCategoryRow }>("/api/admin/inventory/categories", {
        city,
        name,
        reference: "",
      });
      const row = created?.row;
      const categoriesRes = await inventoryGet<{ rows: InventoryCategoryRow[] }>(`/api/admin/inventory/categories?city=${encodeURIComponent(city)}&tab=ALL&limit=200`);
      const updated = categoriesRes.rows || [];
      setCategories(updated);
      if (row?.id) {
        setCreateCategoryId(row.id);
        setCreateCategoryName(row.name || name);
      } else {
        const hit = updated.find((x) => x.name.trim().toLowerCase() === name.toLowerCase());
        if (hit) {
          setCreateCategoryId(hit.id);
          setCreateCategoryName(hit.name);
        }
      }
      setCreateSuccess("Category created and selected.");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setCreateCategoryBusy(false);
    }
  }

  if (!ready) return <div className="text-sm text-neutral-500">Loading inventory items...</div>;
  if (!allowed) return <div className="text-sm text-neutral-500">You do not have permission to open inventory.</div>;

  return (
    <div className="space-y-6">
      <InventoryTabs />

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-neutral-100">Ingredients / Products</div>
            <div className="mt-1 text-sm text-neutral-400">Register all stock masters here. Use Items for raw ingredients and Products for CK-made items.</div>
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

        <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/20 p-4">
          <div className="text-sm font-semibold text-neutral-100">Register Ingredient / Product</div>
          <div className="mt-1 text-xs text-neutral-400">Create stock masters directly here. Use `ITEM` for ingredients and `PRODUCT` for CK-made items.</div>
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-4">
            <input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="Item name"
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            />
            <input
              value={createSku}
              onChange={(e) => setCreateSku(e.target.value.toUpperCase())}
              placeholder="Auto suggested SKU or Foodics SKU"
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            />
            <select
              value={createCategoryId}
              onChange={(e) => {
                const id = e.target.value;
                setCreateCategoryId(id);
                if (id) {
                  const hit = categories.find((row) => row.id === id);
                  setCreateCategoryName(hit?.name || "");
                }
              }}
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            >
              <option value="">{categories.length === 0 ? "No categories yet - create below" : "Select category (optional)"}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <input
              value={createCategoryName}
              onChange={(e) => setCreateCategoryName(e.target.value)}
              placeholder="Category name (optional)"
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void createCategoryOnly()}
              disabled={createCategoryBusy}
              className="rounded-xl border border-sky-800 bg-sky-950/30 px-4 py-2 text-sm text-sky-200 hover:bg-sky-900/30 disabled:opacity-60"
            >
              {createCategoryBusy ? "Creating category..." : "Create Category"}
            </button>
            <input
              value={createUnit}
              onChange={(e) => setCreateUnit(e.target.value)}
              placeholder="Storage unit (e.g., kg, pcs)"
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            />
            <input
              type="text"
              inputMode="decimal"
              value={createCost}
              onChange={(e) => setCreateCost(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                e.preventDefault();
                setCreateCost((current) => stepDraftNumber(current, createCostStep, e.key === "ArrowUp" ? 1 : -1));
              }}
              placeholder="Cost"
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            />
            <select
              value={createType}
              onChange={(e) => setCreateType(e.target.value)}
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            >
              <option value="ITEM">ITEM (Raw ingredient)</option>
              <option value="PRODUCT">PRODUCT (CK product)</option>
            </select>
            <button
              type="button"
              onClick={() => void createItem()}
              disabled={createBusy}
              className="rounded-xl border border-emerald-800 bg-emerald-950/30 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-900/30 disabled:opacity-60"
            >
              {createBusy ? "Creating..." : "Create Item"}
            </button>
          </div>
          {createSuccess ? <div className="mt-3 text-sm text-emerald-300">{createSuccess}</div> : null}
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
            <option value="ITEMS">Raw Ingredients</option>
            <option value="PRODUCTS">CK Products / Semi-finished</option>
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

      <InventoryRegistrationHelp />

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
