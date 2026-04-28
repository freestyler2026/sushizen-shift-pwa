"use client";

import { useEffect, useMemo, useState } from "react";
import InventoryTabs from "@/components/InventoryTabs";
import InventoryRegistrationHelp from "@/components/InventoryRegistrationHelp";
import { canAccessInventoryAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { inventoryGet, inventoryPatch, inventoryPost } from "@/lib/inventoryClient";
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
  // Cost Calc sync
  type CostCalcRow = { source: string; source_id: number; name: string; category: string; unit: string; cost: number; item_type: string };
  const [syncPreview, setSyncPreview] = useState<{ missing_count: number; ingredient_master_missing: number; menu_item_master_missing: number; rows: CostCalcRow[] } | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncResult, setSyncResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
  const [syncSelected, setSyncSelected] = useState<Set<string>>(new Set());
  const [syncExpanded, setSyncExpanded] = useState(false);
  const [syncError, setSyncError] = useState("");
  // Edit Item modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editId, setEditId] = useState("");
  const [editName, setEditName] = useState("");
  const [editCategoryName, setEditCategoryName] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [editCost, setEditCost] = useState("");
  const [editType, setEditType] = useState("ITEM");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState("");
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleteDeleting, setDeleteDeleting] = useState(false);

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
          inventoryGet<{ rows: InventoryItemRow[] }>(`/api/admin/inventory/items?city=${encodeURIComponent(city)}&tab=${encodeURIComponent(tab)}&q=${encodeURIComponent(q)}&limit=2000`),
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
        inventoryGet<{ rows: InventoryItemRow[] }>(`/api/admin/inventory/items?city=${encodeURIComponent(city)}&tab=${encodeURIComponent(tab)}&q=${encodeURIComponent(q)}&limit=2000`),
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

  async function loadSyncPreview() {
    setSyncBusy(true); setSyncResult(null); setSyncPreview(null); setSyncError("");
    try {
      const data = await inventoryGet<any>(`/api/admin/inventory/cost-calc/preview?city=${encodeURIComponent(city)}`);
      setSyncPreview(data);
      setSyncSelected(new Set((data.rows as CostCalcRow[]).map((r) => `${r.source}:${r.source_id}`)));
      setSyncExpanded(true);
    } catch (e: any) {
      setSyncError(e?.message || String(e));
    } finally {
      setSyncBusy(false);
    }
  }

  async function runImport(all: boolean) {
    if (!syncPreview) return;
    setSyncBusy(true); setSyncResult(null); setError("");
    try {
      const rows = all ? syncPreview.rows : syncPreview.rows.filter((r) => syncSelected.has(`${r.source}:${r.source_id}`));
      const selected_ids = all ? undefined : rows.map((r) => ({ source: r.source, source_id: r.source_id }));
      const res = await inventoryPost<any>("/api/admin/inventory/cost-calc/import", { city, selected_ids });
      setSyncResult(res);
      setSyncPreview(null); setSyncSelected(new Set());
      // Reload items list
      const updated = await inventoryGet<{ rows: InventoryItemRow[] }>(`/api/admin/inventory/items?city=${encodeURIComponent(city)}&tab=${encodeURIComponent(tab)}&q=${encodeURIComponent(q)}&limit=2000`);
      setItems(Array.isArray(updated?.rows) ? updated.rows : []);
    } catch (e: any) { setSyncError(e?.message || String(e)); }
    finally { setSyncBusy(false); }
  }

  function openEditModal(item: InventoryItemRow) {
    setEditId(item.id);
    setEditName(item.name);
    setEditCategoryName(item.category_name || "");
    setEditUnit(item.storage_unit || "");
    setEditCost(String(item.cost ?? ""));
    setEditType(item.item_type || "ITEM");
    setEditError("");
    setShowEditModal(true);
  }

  async function handleEditItem() {
    if (!editName.trim()) { setEditError("Item name is required."); return; }
    setEditSaving(true); setEditError("");
    try {
      await inventoryPatch(`/api/admin/inventory/items/${editId}`, {
        name: editName.trim(),
        category_name: editCategoryName.trim(),
        storage_unit: editUnit.trim(),
        cost: parseFloat(editCost) || 0,
        item_type: editType,
        city,
      });
      setShowEditModal(false);
      const updated = await inventoryGet<{ rows: InventoryItemRow[] }>(`/api/admin/inventory/items?city=${encodeURIComponent(city)}&tab=${encodeURIComponent(tab)}&q=${encodeURIComponent(q)}&limit=2000`);
      setItems(updated.rows || []);
    } catch (e: unknown) { setEditError(e instanceof Error ? e.message : String(e)); }
    finally { setEditSaving(false); }
  }

  async function handleDeleteItem() {
    if (!deleteConfirmId) return;
    setDeleteDeleting(true);
    try {
      await inventoryPost(`/api/admin/inventory/items/${deleteConfirmId}/delete`, { city });
      setDeleteConfirmId(""); setDeleteConfirmName("");
      const updated = await inventoryGet<{ rows: InventoryItemRow[] }>(`/api/admin/inventory/items?city=${encodeURIComponent(city)}&tab=${encodeURIComponent(tab)}&q=${encodeURIComponent(q)}&limit=2000`);
      setItems(updated.rows || []);
    } catch (e: unknown) { alert(e instanceof Error ? e.message : String(e)); }
    finally { setDeleteDeleting(false); }
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
          {/* City switcher — prominent toggle buttons */}
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
            <button
              type="button"
              onClick={() => setCity("manila")}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-all ${city === "manila" ? "bg-violet-600 text-white shadow" : "text-neutral-400 hover:text-white"}`}
            >
              🇵🇭 Manila
            </button>
            <button
              type="button"
              onClick={() => setCity("dubai")}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-all ${city === "dubai" ? "bg-violet-600 text-white shadow" : "text-neutral-400 hover:text-white"}`}
            >
              🇦🇪 Dubai
            </button>
          </div>
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

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <select
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            value={tab}
            onChange={(e) => setTab(e.target.value)}
          >
            <option value="ALL">All Types</option>
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
                <th className="px-3 py-2"></th>
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
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(item)}
                        className="rounded-lg border border-sky-800 bg-sky-950/30 px-2.5 py-1 text-xs text-sky-300 hover:bg-sky-900/40"
                      >
                        Edit
                      </button>
                      {item.status !== "DELETED" && (
                        <button
                          type="button"
                          onClick={() => { setDeleteConfirmId(item.id); setDeleteConfirmName(item.name); }}
                          className="rounded-lg border border-rose-800 bg-rose-950/30 px-2.5 py-1 text-xs text-rose-300 hover:bg-rose-900/40"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-neutral-500">
                    No inventory items found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Sync from Cost Calculation ──────────────────────────────────── */}
      <section className="rounded-2xl border border-violet-900/40 bg-violet-950/10 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-violet-200">Sync from Cost Calculation</div>
            <div className="mt-0.5 text-xs text-neutral-400">
              Find items in 食材マスタ / 加工品マスタ / 商品マスタ not yet registered here. Auto-assign SKUs on import.
            </div>
          </div>
          <div className="flex items-center gap-2">
            {syncPreview && (
              <button type="button" onClick={() => setSyncExpanded((v) => !v)} className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800">
                {syncExpanded ? "Collapse" : "Expand"} preview
              </button>
            )}
            <button
              type="button"
              onClick={() => void loadSyncPreview()}
              disabled={syncBusy}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:from-violet-500 hover:to-purple-500 disabled:opacity-60"
            >
              {syncBusy && (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3V4a8 8 0 00-8 8z" />
                </svg>
              )}
              {syncBusy ? "Checking..." : "Check Missing Items"}
            </button>
          </div>
        </div>

        {/* Error banner */}
        {syncError ? (
          <div className="mt-3 rounded-xl border border-red-900/40 bg-red-950/20 px-4 py-3 text-sm text-red-300">
            ❌ {syncError}
          </div>
        ) : null}

        {/* Zero missing */}
        {syncPreview && syncPreview.missing_count === 0 ? (
          <div className="mt-3 rounded-xl border border-emerald-700/40 bg-emerald-900/15 px-4 py-3 text-sm text-emerald-300">
            ✅ All Cost Calculation items are already registered in Ingredients / Products. No imports needed.
          </div>
        ) : null}

        {/* Result banner */}
        {syncResult ? (
          <div className="mt-3 rounded-xl border border-emerald-700/40 bg-emerald-900/15 px-4 py-3 text-sm text-emerald-300">
            ✅ Imported <span className="font-bold">{syncResult.imported}</span> items.
            {syncResult.skipped > 0 && <span className="ml-2 text-amber-300">⚠ {syncResult.skipped} skipped.</span>}
            {syncResult.errors?.length > 0 && (
              <div className="mt-2 space-y-0.5 text-xs text-rose-300">
                {syncResult.errors.slice(0, 5).map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}
          </div>
        ) : null}

        {/* Preview panel */}
        {syncPreview && syncExpanded ? (
          <div className="mt-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-neutral-300">
                <span className="font-bold text-violet-300">{syncPreview.missing_count}</span> missing items —{" "}
                <span className="text-neutral-400">{syncPreview.ingredient_master_missing} ingredients, {syncPreview.menu_item_master_missing} processed/products</span>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setSyncSelected(new Set(syncPreview.rows.map((r) => `${r.source}:${r.source_id}`)))} className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800">Select All</button>
                <button type="button" onClick={() => setSyncSelected(new Set())} className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800">Deselect All</button>
                <button
                  type="button"
                  disabled={syncBusy || syncSelected.size === 0}
                  onClick={() => void runImport(false)}
                  className="rounded-xl border border-violet-600 bg-violet-900/40 px-4 py-1.5 text-sm font-semibold text-violet-100 hover:bg-violet-800/50 disabled:opacity-50"
                >
                  {syncBusy ? "Importing..." : `Import Selected (${syncSelected.size})`}
                </button>
                <button
                  type="button"
                  disabled={syncBusy}
                  onClick={() => void runImport(true)}
                  className="rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-1.5 text-sm font-semibold text-white hover:from-violet-500 hover:to-purple-500 disabled:opacity-50"
                >
                  {syncBusy ? "Importing..." : `Import All (${syncPreview.missing_count})`}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-neutral-800">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-neutral-500 bg-black/20">
                  <tr>
                    <th className="px-3 py-2 w-8">
                      <input type="checkbox" checked={syncSelected.size === syncPreview.rows.length} onChange={(e) => setSyncSelected(e.target.checked ? new Set(syncPreview.rows.map((r) => `${r.source}:${r.source_id}`)) : new Set())} className="rounded" />
                    </th>
                    <th className="px-3 py-2">Item Name</th>
                    <th className="px-3 py-2">Source</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2">Unit</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {syncPreview.rows.map((row) => {
                    const key = `${row.source}:${row.source_id}`;
                    const checked = syncSelected.has(key);
                    return (
                      <tr key={key} className={["border-t border-neutral-800 text-neutral-200 transition-colors", checked ? "bg-violet-950/15" : ""].join(" ")}>
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={checked} onChange={(e) => {
                            setSyncSelected((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) { next.add(key); } else { next.delete(key); }
                              return next;
                            });
                          }} className="rounded" />
                        </td>
                        <td className="px-3 py-2 font-medium">{row.name}</td>
                        <td className="px-3 py-2 text-xs text-neutral-400">{row.source === "ingredient_master" ? "Ingredient" : "Processed/Product"}</td>
                        <td className="px-3 py-2 text-neutral-400">{row.category || "-"}</td>
                        <td className="px-3 py-2">{row.unit || "-"}</td>
                        <td className="px-3 py-2">
                          <span className={["rounded px-1.5 py-0.5 text-xs", row.item_type === "PRODUCT" ? "bg-purple-900/40 text-purple-300" : "bg-sky-900/40 text-sky-300"].join(" ")}>
                            {row.item_type}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">{Number(row.cost || 0).toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : syncPreview && !syncExpanded ? (
          <div className="mt-3 text-sm text-violet-300">
            {syncPreview.missing_count} items to import — expand to review and import.
          </div>
        ) : null}
      </section>

      {/* ── Edit Item Modal ───────────────────────────────────────────────── */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl">
            <div className="mb-4 text-base font-semibold text-neutral-100">Edit Item</div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-neutral-400">Name</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-neutral-400">Category</label>
                <input
                  value={editCategoryName}
                  onChange={(e) => setEditCategoryName(e.target.value)}
                  placeholder="Category name"
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-neutral-400">Unit</label>
                <input
                  value={editUnit}
                  onChange={(e) => setEditUnit(e.target.value)}
                  placeholder="e.g. kg, pcs"
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-neutral-400">Cost</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editCost}
                  onChange={(e) => setEditCost(e.target.value)}
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-neutral-400">Type</label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value)}
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
                >
                  <option value="ITEM">ITEM (Raw ingredient)</option>
                  <option value="PRODUCT">PRODUCT (CK product)</option>
                </select>
              </div>
            </div>
            {editError ? <div className="mt-3 text-sm text-rose-300">{editError}</div> : null}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleEditItem()}
                disabled={editSaving}
                className="rounded-xl border border-sky-700 bg-sky-900/40 px-4 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-800/50 disabled:opacity-60"
              >
                {editSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation ───────────────────────────────────────────── */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl">
            <div className="mb-2 text-base font-semibold text-neutral-100">Delete Item</div>
            <p className="text-sm text-neutral-300">
              Are you sure you want to delete <span className="font-semibold text-neutral-100">{deleteConfirmName}</span>?
            </p>
            <p className="mt-1 text-xs text-neutral-500">This is a soft delete and can be reversed by support if needed.</p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setDeleteConfirmId(""); setDeleteConfirmName(""); }}
                className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteItem()}
                disabled={deleteDeleting}
                className="rounded-xl border border-rose-700 bg-rose-900/40 px-4 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-800/50 disabled:opacity-60"
              >
                {deleteDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
