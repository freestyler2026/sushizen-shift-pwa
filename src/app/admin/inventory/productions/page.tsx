"use client";

import { useEffect, useMemo, useState } from "react";
import InventoryTabs from "@/components/InventoryTabs";
import InventoryRegistrationHelp from "@/components/InventoryRegistrationHelp";
import { canAccessInventoryAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { BRANCHES, labelOf, type City } from "@/lib/branches";
import { inventoryGet, inventoryPost } from "@/lib/inventoryClient";

type ProductOption = {
  id: string;
  name: string;
  sku: string;
  cost: number;
  storage_unit: string;
  status: string;
};

type IngredientOption = {
  id: string;
  name: string;
  sku: string;
  storage_unit: string;
  status: string;
};

type StaffNameDirectory = {
  names?: string[];
};

type DraftOutputItem = {
  item_id: string;
  item_name: string;
  sku: string;
  quantity: number;
  unit_cost: number;
  storage_unit: string;
};

type PreviewConsumptionItem = {
  item_id: string;
  item_name: string;
  sku: string;
  storage_unit: string;
  quantity: number;
  available_quantity: number;
  unit_cost: number;
  total_cost: number;
  entry_type: string;
  sort_order: number;
  source_product_item_id?: string;
  source_product_name?: string;
};

type ProductionRow = {
  id: string;
  production_no: string;
  consumption_no: string;
  branch_code: string;
  business_date: string;
  total_cost: number;
  status: string;
  creator_name: string;
  notes: string;
  created_at: string;
  updated_at: string;
  closed_by?: string;
};

type ProductionItem = {
  id: string;
  item_id: string;
  item_name: string;
  sku: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  entry_type: string;
};

type ProductionDetail = ProductionRow & {
  items?: ProductionItem[];
};

type ProductionRecipeRow = {
  id?: string;
  product_item_id: string;
  product_item_name?: string;
  ingredient_item_id: string;
  ingredient_item_name: string;
  sku: string;
  ingredient_qty: number;
  ingredient_unit: string;
  yield_factor: number;
  waste_factor: number;
  active: boolean;
};

function monthNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function defaultBranch(city: City) {
  return BRANCHES[city].find((branch) => branch.code === "CK")?.code || BRANCHES[city][0]?.code || "";
}

function number3(value: number) {
  return Number(value || 0).toFixed(3);
}

export default function InventoryProductionsPage() {
  const auth = useMemo(() => getAuth(), []);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState<City>((auth?.city || "manila") as City);
  const [branchCode, setBranchCode] = useState(defaultBranch((auth?.city || "manila") as City));
  const [businessDate, setBusinessDate] = useState(todayIso());
  const [creatorName, setCreatorName] = useState(auth?.staffName || "");
  const [notes, setNotes] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedQty, setSelectedQty] = useState(1);
  const [historyMonth, setHistoryMonth] = useState(monthNow());
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [ingredientOptions, setIngredientOptions] = useState<IngredientOption[]>([]);
  const [staffOptions, setStaffOptions] = useState<string[]>([]);
  const [draftOutputs, setDraftOutputs] = useState<DraftOutputItem[]>([]);
  const [previewRows, setPreviewRows] = useState<PreviewConsumptionItem[]>([]);
  const [historyRows, setHistoryRows] = useState<ProductionRow[]>([]);
  const [selectedProductionId, setSelectedProductionId] = useState("");
  const [selectedProduction, setSelectedProduction] = useState<ProductionDetail | null>(null);
  const [recipeProductId, setRecipeProductId] = useState("");
  const [recipeIngredientId, setRecipeIngredientId] = useState("");
  const [recipeQty, setRecipeQty] = useState(1);
  const [recipeRows, setRecipeRows] = useState<ProductionRecipeRow[]>([]);
  const [recipeLoading, setRecipeLoading] = useState(false);
  const [recipeSaving, setRecipeSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const resolved = await refreshAuthFromApi(auth);
      if (cancelled) return;
      const nextCity = (resolved?.city || auth?.city || "manila") as City;
      setAllowed(canAccessInventoryAdmin(resolved));
      setCity(nextCity);
      setBranchCode(defaultBranch(nextCity));
      setCreatorName(resolved?.staffName || auth?.staffName || "");
      setReady(true);
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [auth]);

  useEffect(() => {
    setBranchCode(defaultBranch(city));
    setSelectedProductionId("");
    setSelectedProduction(null);
    setDraftOutputs([]);
    setPreviewRows([]);
    setRecipeProductId("");
    setRecipeIngredientId("");
    setRecipeRows([]);
  }, [city]);

  async function loadHistory(nextCity: City, nextBranch: string, nextMonth: string) {
    const historyRes = await inventoryGet<{ rows: ProductionRow[] }>(
      `/api/admin/inventory/productions?city=${encodeURIComponent(nextCity)}&branch_code=${encodeURIComponent(nextBranch)}&month=${encodeURIComponent(nextMonth)}&limit=500`,
    );
    setHistoryRows(historyRes.rows || []);
  }

  useEffect(() => {
    if (!ready || !allowed) return;
    let cancelled = false;
    async function loadBasics() {
      setLoading(true);
      setError("");
      try {
        const [productsRes, ingredientsRes, staffRes] = await Promise.all([
          inventoryGet<{ rows: ProductOption[] }>(
            `/api/admin/inventory/items?city=${encodeURIComponent(city)}&tab=PRODUCTS&limit=500`,
          ),
          inventoryGet<{ rows: IngredientOption[] }>(
            `/api/admin/inventory/items?city=${encodeURIComponent(city)}&tab=ITEMS&limit=500`,
          ),
          fetch(`/api/admin/staff_master/names?city=${encodeURIComponent(city)}&status=ACTIVE&limit=5000`, {
            cache: "no-store",
          }).then(async (res) => {
            const text = await res.text();
            if (!res.ok) throw new Error(text || "staff names failed");
            return text ? (JSON.parse(text) as StaffNameDirectory) : {};
          }),
        ]);
        if (cancelled) return;
        const nextProducts = (productsRes.rows || []).filter((item) => item.status !== "DELETED");
        setProductOptions(nextProducts);
        setIngredientOptions((ingredientsRes.rows || []).filter((item) => item.status !== "DELETED"));
        setStaffOptions(Array.isArray(staffRes.names) ? staffRes.names : []);
        setRecipeProductId((current) => current || nextProducts[0]?.id || "");
        await loadHistory(city, branchCode, historyMonth);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadBasics();
    return () => {
      cancelled = true;
    };
  }, [allowed, branchCode, city, historyMonth, ready]);

  useEffect(() => {
    if (!ready || !allowed || !recipeProductId) {
      setRecipeRows([]);
      return;
    }
    let cancelled = false;
    async function loadRecipe() {
      setRecipeLoading(true);
      try {
        const res = await inventoryGet<{ rows: ProductionRecipeRow[] }>(
          `/api/admin/inventory/production-recipes?city=${encodeURIComponent(city)}&product_item_id=${encodeURIComponent(recipeProductId)}&limit=200`,
        );
        if (!cancelled) setRecipeRows(res.rows || []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setRecipeLoading(false);
      }
    }
    void loadRecipe();
    return () => {
      cancelled = true;
    };
  }, [allowed, city, ready, recipeProductId]);

  useEffect(() => {
    if (!selectedProductionId || !allowed) {
      setSelectedProduction(null);
      return;
    }
    let cancelled = false;
    async function loadDetail() {
      try {
        const res = await inventoryGet<{ row: ProductionDetail }>(
          `/api/admin/inventory/productions/${encodeURIComponent(selectedProductionId)}?city=${encodeURIComponent(city)}`,
        );
        if (!cancelled) setSelectedProduction(res.row || null);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      }
    }
    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [allowed, city, selectedProductionId]);

  useEffect(() => {
    if (!ready || !allowed) return;
    if (draftOutputs.length === 0) {
      setPreviewRows([]);
      return;
    }
    let cancelled = false;
    async function loadPreview() {
      setPreviewLoading(true);
      try {
        const res = await inventoryPost<{ rows: PreviewConsumptionItem[] }>(
          `/api/admin/inventory/productions/preview?branch_code=${encodeURIComponent(branchCode)}`,
          {
            city,
            items: draftOutputs.map((item, index) => ({
              item_id: item.item_id,
              item_name: item.item_name,
              sku: item.sku,
              quantity: item.quantity,
              unit_cost: item.unit_cost,
              total_cost: item.quantity * item.unit_cost,
              entry_type: "OUTPUT",
              sort_order: index,
            })),
          },
        );
        if (!cancelled) setPreviewRows(res.rows || []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }
    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [allowed, branchCode, city, draftOutputs, ready]);

  const selectedProduct = useMemo(
    () => productOptions.find((item) => item.id === selectedProductId) || null,
    [productOptions, selectedProductId],
  );
  const selectedRecipeIngredient = useMemo(
    () => ingredientOptions.find((item) => item.id === recipeIngredientId) || null,
    [ingredientOptions, recipeIngredientId],
  );

  const outputTotalCost = useMemo(
    () => draftOutputs.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0),
    [draftOutputs],
  );
  const consumptionTotalCost = useMemo(
    () => previewRows.reduce((sum, item) => sum + Number(item.total_cost || item.quantity * item.unit_cost), 0),
    [previewRows],
  );
  const selectedOutputItems = useMemo(
    () => (selectedProduction?.items || []).filter((item) => item.entry_type === "OUTPUT"),
    [selectedProduction],
  );
  const selectedConsumptionItems = useMemo(
    () => (selectedProduction?.items || []).filter((item) => item.entry_type !== "OUTPUT"),
    [selectedProduction],
  );

  function addDraftOutput() {
    if (!selectedProduct) return;
    const qty = Math.max(0.001, Number(selectedQty || 0));
    setDraftOutputs((prev) => {
      const existing = prev.find((item) => item.item_id === selectedProduct.id);
      if (existing) {
        return prev.map((item) =>
          item.item_id === selectedProduct.id ? { ...item, quantity: Number((item.quantity + qty).toFixed(3)) } : item,
        );
      }
      return [
        ...prev,
        {
          item_id: selectedProduct.id,
          item_name: selectedProduct.name,
          sku: selectedProduct.sku,
          quantity: Number(qty.toFixed(3)),
          unit_cost: Number(selectedProduct.cost || 0),
          storage_unit: selectedProduct.storage_unit || "",
        },
      ];
    });
    setSelectedProductId("");
    setSelectedQty(1);
  }

  function removeDraftOutput(itemId: string) {
    setDraftOutputs((prev) => prev.filter((item) => item.item_id !== itemId));
  }

  function addRecipeLine() {
    if (!recipeProductId || !selectedRecipeIngredient) return;
    const qty = Math.max(0.001, Number(recipeQty || 0));
    setRecipeRows((prev) => {
      const existing = prev.find((row) => row.ingredient_item_id === selectedRecipeIngredient.id);
      if (existing) {
        return prev.map((row) =>
          row.ingredient_item_id === selectedRecipeIngredient.id
            ? { ...row, ingredient_qty: Number((row.ingredient_qty + qty).toFixed(3)) }
            : row,
        );
      }
      return [
        ...prev,
        {
          product_item_id: recipeProductId,
          ingredient_item_id: selectedRecipeIngredient.id,
          ingredient_item_name: selectedRecipeIngredient.name,
          sku: selectedRecipeIngredient.sku,
          ingredient_qty: Number(qty.toFixed(3)),
          ingredient_unit: selectedRecipeIngredient.storage_unit || "",
          yield_factor: 1,
          waste_factor: 0,
          active: true,
        },
      ];
    });
    setRecipeIngredientId("");
    setRecipeQty(1);
  }

  function removeRecipeLine(ingredientItemId: string) {
    setRecipeRows((prev) => prev.filter((row) => row.ingredient_item_id !== ingredientItemId));
  }

  async function saveRecipe() {
    if (!recipeProductId) {
      setError("Please select a recipe product.");
      return;
    }
    setRecipeSaving(true);
    setError("");
    setSuccess("");
    try {
      await inventoryPost("/api/admin/inventory/production-recipes/upsert", {
        city,
        product_item_id: recipeProductId,
        rows: recipeRows.map((row) => ({
          ingredient_item_id: row.ingredient_item_id,
          ingredient_qty: row.ingredient_qty,
          ingredient_unit: row.ingredient_unit,
          yield_factor: row.yield_factor,
          waste_factor: row.waste_factor,
          active: row.active,
        })),
      });
      setSuccess("Production BOM saved.");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setRecipeSaving(false);
    }
  }

  async function createProduction() {
    if (!creatorName.trim()) {
      setError("Please select a responsible staff member.");
      return;
    }
    if (!branchCode) {
      setError("Please select a branch.");
      return;
    }
    if (draftOutputs.length === 0) {
      setError("Please add at least one product.");
      return;
    }
    if (previewRows.length === 0) {
      setError("Production BOM is not registered yet. Please register the product recipe first.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const created = await inventoryPost<{ row: ProductionRow }>("/api/admin/inventory/productions", {
        city,
        branch_code: branchCode,
        business_date: businessDate,
        creator_name: creatorName.trim(),
        notes,
      });
      const productionId = String(created?.row?.id || "");
      await inventoryPost(`/api/admin/inventory/productions/${encodeURIComponent(productionId)}/items`, {
        city,
        items: [
          ...draftOutputs.map((item, index) => ({
            item_id: item.item_id,
            item_name: item.item_name,
            sku: item.sku,
            quantity: item.quantity,
            unit_cost: item.unit_cost,
            total_cost: item.quantity * item.unit_cost,
            entry_type: "OUTPUT",
            sort_order: index,
          })),
          ...previewRows.map((item, index) => ({
            item_id: item.item_id,
            item_name: item.item_name,
            sku: item.sku,
            storage_unit: item.storage_unit,
            quantity: item.quantity,
            available_quantity: item.available_quantity,
            unit_cost: item.unit_cost,
            total_cost: item.total_cost,
            entry_type: "INPUT",
            sort_order: draftOutputs.length + index,
          })),
        ],
      });
      await loadHistory(city, branchCode, historyMonth);
      setDraftOutputs([]);
      setPreviewRows([]);
      setNotes("");
      setSuccess("Production draft created. Close it from detail when ready.");
      setSelectedProductionId(productionId);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function closeSelectedProduction() {
    if (!selectedProductionId) return;
    setActionLoading(true);
    setError("");
    setSuccess("");
    try {
      await inventoryPost(`/api/admin/inventory/productions/${encodeURIComponent(selectedProductionId)}/close`, { city });
      await loadHistory(city, branchCode, historyMonth);
      const res = await inventoryGet<{ row: ProductionDetail }>(
        `/api/admin/inventory/productions/${encodeURIComponent(selectedProductionId)}?city=${encodeURIComponent(city)}`,
      );
      setSelectedProduction(res.row || null);
      setSuccess("Production closed. Product intake and ingredient consumption were posted to ledger.");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setActionLoading(false);
    }
  }

  async function duplicateSelectedProduction() {
    if (!selectedProductionId) return;
    setActionLoading(true);
    setError("");
    setSuccess("");
    try {
      const duplicated = await inventoryPost<{ row: ProductionRow }>(
        `/api/admin/inventory/productions/${encodeURIComponent(selectedProductionId)}/duplicate`,
        { city },
      );
      await loadHistory(city, branchCode, historyMonth);
      setSelectedProductionId(String(duplicated?.row?.id || ""));
      setSuccess("Selected production duplicated.");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setActionLoading(false);
    }
  }

  if (!ready) return <div className="text-sm text-neutral-500">Loading productions...</div>;
  if (!allowed) return <div className="text-sm text-neutral-500">You do not have permission to open inventory.</div>;

  return (
    <div className="space-y-6">
      <InventoryTabs />

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-neutral-100">CK Production</div>
            <div className="mt-1 text-sm text-neutral-400">
              Register CK production products and ingredient consumption recipes.
            </div>
          </div>
          <div className="text-xs text-neutral-500">{city.toUpperCase()} production workflow</div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-5">
          <select
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            value={city}
            onChange={(e) => setCity(e.target.value as City)}
          >
            <option value="dubai">Dubai</option>
            <option value="manila">Manila</option>
          </select>
          <select
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            value={branchCode}
            onChange={(e) => setBranchCode(e.target.value)}
          >
            {BRANCHES[city].map((branch) => (
              <option key={branch.code} value={branch.code}>
                {branch.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={businessDate}
            onChange={(e) => setBusinessDate(e.target.value)}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
          />
          <input
            list="inventory-production-staff-list"
            value={creatorName}
            onChange={(e) => setCreatorName(e.target.value)}
            placeholder="Select responsible staff"
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
          />
          <input
            type="month"
            value={historyMonth}
            onChange={(e) => setHistoryMonth(e.target.value)}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
          />
        </div>
        <datalist id="inventory-production-staff-list">
          {staffOptions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>

        <div className="mt-3">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes / production note"
            className="min-h-24 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">Products in Draft</div>
            <div className="mt-1 text-lg font-semibold text-neutral-100">{draftOutputs.length}</div>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">Ingredient Lines</div>
            <div className="mt-1 text-lg font-semibold text-neutral-100">{previewRows.length}</div>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">Output Cost</div>
            <div className="mt-1 text-lg font-semibold text-neutral-100">{outputTotalCost.toFixed(2)}</div>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/30 p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">Consumption Cost</div>
            <div className="mt-1 text-lg font-semibold text-neutral-100">{consumptionTotalCost.toFixed(2)}</div>
          </div>
        </div>

        {error ? <div className="mt-3 text-sm text-rose-300">{error}</div> : null}
        {success ? <div className="mt-3 text-sm text-emerald-300">{success}</div> : null}
      </section>

      <InventoryRegistrationHelp />

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-neutral-100">Add Products</div>
          <div className="text-xs text-neutral-500">{productOptions.length} registered production products</div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_160px_140px]">
          <select
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
          >
            <option value="">Select a product</option>
            {productOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} {item.sku ? `(${item.sku})` : ""}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0.001}
            step={0.001}
            value={selectedQty}
            onChange={(e) => setSelectedQty(Number(e.target.value || 0))}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={addDraftOutput}
            disabled={!selectedProduct}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900 disabled:opacity-60"
          >
            Add Product
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Quantity</th>
                <th className="px-3 py-2">Unit Cost</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {draftOutputs.map((item) => (
                <tr key={item.item_id} className="border-t border-neutral-800 text-neutral-200">
                  <td className="px-3 py-2">{item.item_name}</td>
                  <td className="px-3 py-2">{item.sku || "-"}</td>
                  <td className="px-3 py-2">{number3(item.quantity)}</td>
                  <td className="px-3 py-2">{Number(item.unit_cost || 0).toFixed(2)}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => removeDraftOutput(item.item_id)}
                      className="rounded-lg border border-rose-800/70 bg-rose-950/20 px-2 py-1 text-xs text-rose-200"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {draftOutputs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-neutral-500">
                    No products have been added yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-neutral-100">CK Product -&gt; Ingredients</div>
            <div className="mt-1 text-xs text-neutral-500">Register ingredient BOM per product here.</div>
          </div>
          <div className="text-xs text-neutral-500">{recipeLoading ? "Loading recipe..." : `${recipeRows.length} recipe rows`}</div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px_140px]">
          <select
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            value={recipeProductId}
            onChange={(e) => setRecipeProductId(e.target.value)}
          >
            <option value="">Select a recipe product</option>
            {productOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} {item.sku ? `(${item.sku})` : ""}
              </option>
            ))}
          </select>
          <select
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            value={recipeIngredientId}
            onChange={(e) => setRecipeIngredientId(e.target.value)}
          >
            <option value="">Select an ingredient</option>
            {ingredientOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} {item.sku ? `(${item.sku})` : ""}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0.001}
            step={0.001}
            value={recipeQty}
            onChange={(e) => setRecipeQty(Number(e.target.value || 0))}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={addRecipeLine}
            disabled={!recipeProductId || !selectedRecipeIngredient}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900 disabled:opacity-60"
          >
            Add Ingredient
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2">Ingredient Item</th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2">Qty / 1 Output</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {recipeRows.map((row) => (
                <tr key={row.ingredient_item_id} className="border-t border-neutral-800 text-neutral-200">
                  <td className="px-3 py-2">{row.ingredient_item_name}</td>
                  <td className="px-3 py-2">{row.sku || "-"}</td>
                  <td className="px-3 py-2">{row.ingredient_unit || "-"}</td>
                  <td className="px-3 py-2">{number3(row.ingredient_qty)}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => removeRecipeLine(row.ingredient_item_id)}
                      className="rounded-lg border border-rose-800/70 bg-rose-950/20 px-2 py-1 text-xs text-rose-200"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {!recipeLoading && recipeRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-neutral-500">
                    No recipe lines registered yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={saveRecipe}
            disabled={!recipeProductId || recipeSaving}
            className="rounded-xl border border-sky-800 bg-sky-950/30 px-4 py-2 text-sm text-sky-200 hover:bg-sky-900/30 disabled:opacity-60"
          >
            {recipeSaving ? "Saving..." : "Save Production BOM"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-neutral-100">Ingredient Preview</div>
          <div className="text-xs text-neutral-500">{previewLoading ? "Preview loading..." : `${previewRows.length} ingredient rows`}</div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2">Ingredient</th>
                <th className="px-3 py-2">From Product</th>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2">Need</th>
                <th className="px-3 py-2">Available</th>
                <th className="px-3 py-2">Cost</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.map((item, index) => {
                const shortage = Number(item.available_quantity || 0) < Number(item.quantity || 0);
                return (
                  <tr key={`${item.item_id}-${index}`} className="border-t border-neutral-800 text-neutral-200">
                    <td className="px-3 py-2">
                      <div>{item.item_name}</div>
                      <div className="mt-1 text-xs text-neutral-500">{item.sku || "-"}</div>
                    </td>
                    <td className="px-3 py-2">{item.source_product_name || "-"}</td>
                    <td className="px-3 py-2">{item.storage_unit || "-"}</td>
                    <td className="px-3 py-2">{number3(item.quantity)}</td>
                    <td className={["px-3 py-2", shortage ? "text-amber-300" : ""].join(" ")}>{number3(item.available_quantity)}</td>
                    <td className="px-3 py-2">{Number(item.total_cost || 0).toFixed(2)}</td>
                  </tr>
                );
              })}
              {!previewLoading && previewRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-neutral-500">
                    Add products to draft to display ingredient preview.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={createProduction}
            disabled={saving || draftOutputs.length === 0 || previewRows.length === 0}
            className="rounded-xl border border-emerald-800 bg-emerald-950/30 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-900/30 disabled:opacity-60"
          >
            {saving ? "Creating..." : "Create Production Draft"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-neutral-100">History</div>
            <div className="mt-1 text-xs text-neutral-500">Review production history by month.</div>
          </div>
          <div className="text-xs text-neutral-500">{loading ? "Loading..." : `${historyRows.length} production rows`}</div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-3 py-2">Production</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Branch</th>
                  <th className="px-3 py-2">Person</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((row) => (
                  <tr
                    key={row.id}
                    className={[
                      "border-t border-neutral-800 text-neutral-200 transition",
                      selectedProductionId === row.id ? "bg-emerald-950/20" : "",
                    ].join(" ")}
                  >
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => setSelectedProductionId(row.id)} className="text-left hover:text-white">
                        <div>{row.production_no}</div>
                        <div className="mt-1 text-xs text-neutral-500">{row.consumption_no || "-"}</div>
                      </button>
                    </td>
                    <td className="px-3 py-2">{String(row.business_date || "").slice(0, 10)}</td>
                    <td className="px-3 py-2">{labelOf(city, row.branch_code)}</td>
                    <td className="px-3 py-2">{row.creator_name || "-"}</td>
                    <td className="px-3 py-2">{row.status || "-"}</td>
                  </tr>
                ))}
                {!loading && historyRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-neutral-500">
                      No production history for this month.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-neutral-100">Selected Production</div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={duplicateSelectedProduction}
                  disabled={!selectedProductionId || actionLoading}
                  className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 disabled:opacity-50"
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  onClick={closeSelectedProduction}
                  disabled={!selectedProductionId || actionLoading || selectedProduction?.status === "CLOSED"}
                  className="rounded-lg border border-emerald-800 bg-emerald-950/30 px-3 py-1.5 text-xs text-emerald-200 disabled:opacity-50"
                >
                  {actionLoading ? "Processing..." : selectedProduction?.status === "CLOSED" ? "Closed" : "Close"}
                </button>
              </div>
            </div>

            {!selectedProduction ? (
              <div className="mt-3 text-sm text-neutral-500">Select a production record from the history list on the left.</div>
            ) : (
              <div className="mt-3 space-y-4 text-sm text-neutral-200">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <div className="text-xs text-neutral-500">Production No.</div>
                    <div>{selectedProduction.production_no}</div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500">Consumption No.</div>
                    <div>{selectedProduction.consumption_no || "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500">Business Date</div>
                    <div>{String(selectedProduction.business_date || "").slice(0, 10)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500">Branch</div>
                    <div>{labelOf(city, selectedProduction.branch_code)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500">Person in Charge</div>
                    <div>{selectedProduction.creator_name || "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500">Status</div>
                    <div>{selectedProduction.status || "-"}</div>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-neutral-500">Notes</div>
                  <div className="whitespace-pre-wrap text-neutral-300">{selectedProduction.notes || "-"}</div>
                </div>

                <div>
                  <div className="mb-2 text-xs text-neutral-500">Output Products</div>
                  <div className="space-y-2">
                    {selectedOutputItems.map((item) => (
                      <div key={item.id} className="rounded-xl border border-neutral-800 bg-neutral-900/30 px-3 py-2">
                        <div>{item.item_name}</div>
                        <div className="mt-1 text-xs text-neutral-500">
                          {item.sku || "-"} • Qty {number3(item.quantity)} • Cost {Number(item.total_cost || 0).toFixed(2)}
                        </div>
                      </div>
                    ))}
                    {selectedOutputItems.length === 0 ? <div className="text-xs text-neutral-500">No output products linked.</div> : null}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs text-neutral-500">Consumed Ingredients</div>
                  <div className="space-y-2">
                    {selectedConsumptionItems.map((item) => (
                      <div key={item.id} className="rounded-xl border border-neutral-800 bg-neutral-900/30 px-3 py-2">
                        <div>{item.item_name}</div>
                        <div className="mt-1 text-xs text-neutral-500">
                          {item.sku || "-"} • Qty {number3(item.quantity)} • Cost {Number(item.total_cost || 0).toFixed(2)}
                        </div>
                      </div>
                    ))}
                    {selectedConsumptionItems.length === 0 ? (
                      <div className="text-xs text-neutral-500">No ingredient consumption lines linked.</div>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
