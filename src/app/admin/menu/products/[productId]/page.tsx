"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessMenuAdmin, getAuth, refreshAuthFromApi, type City } from "@/lib/auth";
import { menuGet, menuPatch, menuPost } from "@/lib/menuClient";

type MenuCategoryRow = {
  id: string;
  name: string;
};

type ModifierGroupRow = {
  id: string;
  name: string;
  status: string;
  option_count: number;
};

type ProductModifierRow = {
  id: string;
  product_id: string;
  modifier_group_id: string;
  modifier_group_name: string;
  modifier_group_name_localized: string;
  minimum_options: number;
  maximum_options: number;
  free_options: number;
  sort_order: number;
  status: string;
  option_count: number;
};

type TagOption = {
  id: string;
  name: string;
  status: string;
  color: string;
};

type ProductTagRow = {
  id: string;
  product_id: string;
  tag_id: string;
  name: string;
  name_localized: string;
  color: string;
  status: string;
};

type BranchOption = {
  code: string;
  label: string;
};

type CustomPriceRow = {
  id: string;
  city: string;
  product_id: string;
  branch_code: string;
  branch_label: string;
  price: number;
  currency_code: string;
  effective_from: string;
  effective_to: string;
  status: string;
  is_current?: boolean;
};

type PricingSummary = {
  base_price: number;
  currency_code: string;
  custom_price_count: number;
  branches_with_custom_price: string[];
};

type IngredientOption = {
  id: string;
  name: string;
  sku: string;
  storage_unit: string;
  ingredient_unit: string;
  cost: number;
};

type CostSummary = {
  costing_method: string;
  ingredients_cost: number;
  fixed_cost: number;
  effective_cost: number;
  cost_percentage: number;
};

type IngredientRow = {
  id: string;
  product_id: string;
  ingredient_item_id: string;
  ingredient_name: string;
  sku: string;
  quantity: number;
  ingredient_unit: string;
  unit_cost: number;
  total_cost: number;
  storage_unit: string;
  item_ingredient_unit: string;
};

type ProductRow = {
  id: string;
  city: string;
  category_id: string;
  category_name: string;
  name: string;
  name_localized: string;
  sku: string;
  barcode: string;
  image_url: string;
  description: string;
  price: number;
  pricing_method: string;
  selling_method: string;
  costing_method: string;
  fixed_cost: number;
  tax_group_id: string;
  preparation_time: number;
  walk_time: number;
  calories: number;
  high_salt_content: boolean;
  status: string;
  cost_summary?: CostSummary;
  ingredients?: IngredientRow[];
  modifiers?: ProductModifierRow[];
  tags?: ProductTagRow[];
  custom_prices?: CustomPriceRow[];
  pricing_summary?: PricingSummary;
};

export default function MenuProductDetailPage() {
  const params = useParams<{ productId: string }>();
  const productId = String(params?.productId || "");
  const auth = useMemo(() => getAuth(), []);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState<City>((auth?.city || "manila") as City);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ingredientSaving, setIngredientSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [product, setProduct] = useState<ProductRow | null>(null);
  const [categories, setCategories] = useState<MenuCategoryRow[]>([]);
  const [ingredientOptions, setIngredientOptions] = useState<IngredientOption[]>([]);
  const [modifierGroups, setModifierGroups] = useState<ModifierGroupRow[]>([]);
  const [tagOptions, setTagOptions] = useState<TagOption[]>([]);
  const [branchOptions, setBranchOptions] = useState<BranchOption[]>([]);
  const [selectedIngredientId, setSelectedIngredientId] = useState("");
  const [ingredientQty, setIngredientQty] = useState("1");
  const [ingredientUnit, setIngredientUnit] = useState("");
  const [editingIngredientId, setEditingIngredientId] = useState("");
  const [modifierSaving, setModifierSaving] = useState(false);
  const [selectedModifierGroupId, setSelectedModifierGroupId] = useState("");
  const [modifierMin, setModifierMin] = useState("0");
  const [modifierMax, setModifierMax] = useState("1");
  const [modifierFree, setModifierFree] = useState("0");
  const [editingModifierId, setEditingModifierId] = useState("");
  const [tagSaving, setTagSaving] = useState(false);
  const [selectedTagId, setSelectedTagId] = useState("");
  const [priceSaving, setPriceSaving] = useState(false);
  const [editingPriceId, setEditingPriceId] = useState("");
  const [priceBranchCode, setPriceBranchCode] = useState("");
  const [priceValue, setPriceValue] = useState("");
  const [priceCurrency, setPriceCurrency] = useState("");
  const [priceEffectiveFrom, setPriceEffectiveFrom] = useState("");
  const [priceEffectiveTo, setPriceEffectiveTo] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const resolved = await refreshAuthFromApi(auth);
      if (cancelled) return;
      setAllowed(canAccessMenuAdmin(resolved));
      setCity((resolved?.city || auth?.city || "manila") as City);
      setReady(true);
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [auth]);

  const loadDetail = useCallback(async (nextCity = city) => {
    setLoading(true);
    setError("");
    try {
      const [productRes, categoriesRes, ingredientsRes, modifierGroupsRes, tagsRes, branchesRes] = await Promise.all([
        menuGet<{ row: ProductRow }>(`/api/admin/menu/products/${encodeURIComponent(productId)}?city=${encodeURIComponent(nextCity)}`),
        menuGet<{ rows: MenuCategoryRow[] }>(`/api/admin/menu/categories?city=${encodeURIComponent(nextCity)}&tab=ALL&limit=200`),
        menuGet<{ rows: IngredientOption[] }>(`/api/admin/menu/ingredient-items?city=${encodeURIComponent(nextCity)}&limit=500`),
        menuGet<{ rows: ModifierGroupRow[] }>(`/api/admin/menu/modifier-groups?city=${encodeURIComponent(nextCity)}&tab=ALL&limit=200`),
        menuGet<{ rows: TagOption[] }>(`/api/admin/menu/tags?city=${encodeURIComponent(nextCity)}&tab=ALL&limit=200`),
        menuGet<{ rows: BranchOption[] }>(`/api/admin/menu/branches?city=${encodeURIComponent(nextCity)}`),
      ]);
      const nextProduct = productRes.row || null;
      setProduct(nextProduct);
      setCategories(categoriesRes.rows || []);
      setIngredientOptions(ingredientsRes.rows || []);
      const nextModifierGroups = (modifierGroupsRes.rows || []).filter((row) => row.status !== "DELETED");
      setModifierGroups(nextModifierGroups);
      const nextTagOptions = (tagsRes.rows || []).filter((row) => row.status !== "DELETED");
      setTagOptions(nextTagOptions);
      setBranchOptions(branchesRes.rows || []);
      if (nextProduct) {
        setCity((nextProduct.city || nextCity) as City);
      }
      setSelectedIngredientId((current) => current || ingredientsRes.rows?.[0]?.id || "");
      setIngredientUnit((current) => current || ingredientsRes.rows?.[0]?.ingredient_unit || ingredientsRes.rows?.[0]?.storage_unit || "");
      setSelectedModifierGroupId((current) => current || nextModifierGroups[0]?.id || "");
      setSelectedTagId((current) => current || nextTagOptions[0]?.id || "");
      setPriceBranchCode((current) => current || branchesRes.rows?.[0]?.code || "");
      setPriceCurrency((current) => current || (nextCity === "dubai" ? "AED" : "PHP"));
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [city, productId]);

  useEffect(() => {
    if (!ready || !allowed || !productId) return;
    void loadDetail();
  }, [allowed, loadDetail, productId, ready]);

  const selectedIngredient = ingredientOptions.find((option) => option.id === selectedIngredientId) || null;

  useEffect(() => {
    if (selectedIngredient && !editingIngredientId) {
      setIngredientUnit(selectedIngredient.ingredient_unit || selectedIngredient.storage_unit || "");
    }
  }, [editingIngredientId, selectedIngredient]);

  async function saveBasicInfo() {
    if (!product) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await menuPatch<{ row: ProductRow }>(
        `/api/admin/menu/products/${encodeURIComponent(product.id)}?city=${encodeURIComponent(city)}`,
        {
          city,
          category_id: product.category_id,
          name: product.name,
          sku: product.sku,
          barcode: product.barcode,
          description: product.description,
          price: Number(product.price || 0),
          pricing_method: product.pricing_method,
          selling_method: product.selling_method,
          costing_method: product.costing_method,
          fixed_cost: Number(product.fixed_cost || 0),
          tax_group_id: product.tax_group_id,
          preparation_time: Number(product.preparation_time || 0),
          walk_time: Number(product.walk_time || 0),
          calories: Number(product.calories || 0),
          high_salt_content: Boolean(product.high_salt_content),
        },
      );
      setProduct((current) => (current ? { ...current, ...(res.row || {}) } : res.row || null));
      setSuccess("Product detail updated.");
      await loadDetail(city);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function addOrUpdateIngredient() {
    if (!product) return;
    if (!selectedIngredientId) {
      setError("Please select ingredient item.");
      return;
    }
    setIngredientSaving(true);
    setError("");
    setSuccess("");
    try {
      if (editingIngredientId) {
        await menuPatch(`/api/admin/menu/products/${encodeURIComponent(product.id)}/ingredients?city=${encodeURIComponent(city)}`, {
          ingredient_line_id: editingIngredientId,
          ingredient_item_id: selectedIngredientId,
          quantity: Number(ingredientQty || 0),
          ingredient_unit: ingredientUnit,
          applies_on: [],
        });
        setSuccess("Ingredient updated.");
      } else {
        await menuPost(`/api/admin/menu/products/${encodeURIComponent(product.id)}/ingredients?city=${encodeURIComponent(city)}`, {
          ingredient_item_id: selectedIngredientId,
          quantity: Number(ingredientQty || 0),
          ingredient_unit: ingredientUnit,
          applies_on: [],
        });
        setSuccess("Ingredient added.");
      }
      setEditingIngredientId("");
      setIngredientQty("1");
      setSelectedIngredientId(ingredientOptions[0]?.id || "");
      setIngredientUnit(ingredientOptions[0]?.ingredient_unit || ingredientOptions[0]?.storage_unit || "");
      await loadDetail(city);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setIngredientSaving(false);
    }
  }

  async function deleteIngredient(lineId: string) {
    if (!product) return;
    setError("");
    setSuccess("");
    try {
      await menuPost(`/api/admin/menu/products/${encodeURIComponent(product.id)}/ingredients/delete?city=${encodeURIComponent(city)}`, {
        ingredient_line_id: lineId,
      });
      if (editingIngredientId === lineId) {
        setEditingIngredientId("");
        setIngredientQty("1");
      }
      setSuccess("Ingredient removed.");
      await loadDetail(city);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  async function addOrUpdateModifier() {
    if (!product) return;
    if (!selectedModifierGroupId) {
      setError("Please select modifier group.");
      return;
    }
    setModifierSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        modifier_group_id: selectedModifierGroupId,
        minimum_options: Number(modifierMin || 0),
        maximum_options: Number(modifierMax || 0),
        free_options: Number(modifierFree || 0),
        sort_order: 0,
      };
      if (editingModifierId) {
        await menuPatch(`/api/admin/menu/products/${encodeURIComponent(product.id)}/modifiers?city=${encodeURIComponent(city)}`, {
          link_id: editingModifierId,
          ...payload,
        });
        setSuccess("Modifier link updated.");
      } else {
        await menuPost(`/api/admin/menu/products/${encodeURIComponent(product.id)}/modifiers?city=${encodeURIComponent(city)}`, payload);
        setSuccess("Modifier group linked.");
      }
      setEditingModifierId("");
      setModifierMin("0");
      setModifierMax("1");
      setModifierFree("0");
      setSelectedModifierGroupId(modifierGroups.find((row) => row.status !== "DELETED")?.id || "");
      await loadDetail(city);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setModifierSaving(false);
    }
  }

  async function deleteModifier(linkId: string) {
    if (!product) return;
    setError("");
    setSuccess("");
    try {
      await menuPost(`/api/admin/menu/products/${encodeURIComponent(product.id)}/modifiers/delete?city=${encodeURIComponent(city)}`, {
        link_id: linkId,
      });
      if (editingModifierId === linkId) {
        setEditingModifierId("");
        setModifierMin("0");
        setModifierMax("1");
        setModifierFree("0");
      }
      setSuccess("Modifier link removed.");
      await loadDetail(city);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  async function addTag() {
    if (!product) return;
    if (!selectedTagId) {
      setError("Please select tag.");
      return;
    }
    setTagSaving(true);
    setError("");
    setSuccess("");
    try {
      await menuPost(`/api/admin/menu/products/${encodeURIComponent(product.id)}/tags?city=${encodeURIComponent(city)}`, {
        tag_id: selectedTagId,
      });
      setSuccess("Tag linked.");
      setSelectedTagId(tagOptions[0]?.id || "");
      await loadDetail(city);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setTagSaving(false);
    }
  }

  async function removeTag(tagId: string) {
    if (!product) return;
    setError("");
    setSuccess("");
    try {
      await menuPost(`/api/admin/menu/products/${encodeURIComponent(product.id)}/tags/${encodeURIComponent(tagId)}/delete?city=${encodeURIComponent(city)}`, {});
      setSuccess("Tag removed.");
      await loadDetail(city);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  async function addOrUpdateCustomPrice() {
    if (!product) return;
    if (!priceBranchCode) {
      setError("Please select branch.");
      return;
    }
    if (!priceValue) {
      setError("Please enter price.");
      return;
    }
    setPriceSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        branch_code: priceBranchCode,
        price: Number(priceValue || 0),
        currency_code: priceCurrency,
        effective_from: priceEffectiveFrom,
        effective_to: priceEffectiveTo,
      };
      if (editingPriceId) {
        await menuPatch(
          `/api/admin/menu/products/${encodeURIComponent(product.id)}/custom-prices/${encodeURIComponent(editingPriceId)}?city=${encodeURIComponent(city)}`,
          payload,
        );
        setSuccess("Custom price updated.");
      } else {
        await menuPost(`/api/admin/menu/products/${encodeURIComponent(product.id)}/custom-prices?city=${encodeURIComponent(city)}`, payload);
        setSuccess("Custom price added.");
      }
      setEditingPriceId("");
      setPriceBranchCode(branchOptions[0]?.code || "");
      setPriceValue("");
      setPriceCurrency(city === "dubai" ? "AED" : "PHP");
      setPriceEffectiveFrom("");
      setPriceEffectiveTo("");
      await loadDetail(city);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setPriceSaving(false);
    }
  }

  async function deleteCustomPrice(priceId: string) {
    if (!product) return;
    setError("");
    setSuccess("");
    try {
      await menuPost(`/api/admin/menu/products/${encodeURIComponent(product.id)}/custom-prices/${encodeURIComponent(priceId)}/delete?city=${encodeURIComponent(city)}`, {});
      if (editingPriceId === priceId) {
        setEditingPriceId("");
        setPriceBranchCode(branchOptions[0]?.code || "");
        setPriceValue("");
        setPriceCurrency(city === "dubai" ? "AED" : "PHP");
        setPriceEffectiveFrom("");
        setPriceEffectiveTo("");
      }
      setSuccess("Custom price deleted.");
      await loadDetail(city);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  async function updateStatus(status: "ACTIVE" | "INACTIVE" | "DELETED") {
    if (!product) return;
    setError("");
    setSuccess("");
    try {
      if (status === "DELETED") {
        await menuPost(`/api/admin/menu/products/${encodeURIComponent(product.id)}/delete?city=${encodeURIComponent(city)}`, {});
      } else {
        await menuPost(`/api/admin/menu/products/${encodeURIComponent(product.id)}/status`, { city, status });
      }
      setSuccess(status === "DELETED" ? "Product deleted." : `Product marked ${status.toLowerCase()}.`);
      await loadDetail(city);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  if (!ready) {
    return <div className="text-sm text-neutral-500">Loading product detail...</div>;
  }

  if (!allowed) {
    return <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5 text-sm text-neutral-400">You do not have permission to open Menu Builder.</div>;
  }

  if (loading && !product) {
    return <div className="text-sm text-neutral-500">Loading product detail...</div>;
  }

  if (!product) {
    return <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5 text-sm text-neutral-400">Product was not found.</div>;
  }

  const ingredients = product.ingredients || [];
  const modifiers = product.modifiers || [];
  const tags = product.tags || [];
  const customPrices = product.custom_prices || [];
  const modifierGroupChoices = modifierGroups.filter((row) => row.status !== "DELETED");
  const availableTagOptions = tagOptions.filter((row) => row.status !== "DELETED" && !tags.some((tag) => tag.tag_id === row.id));
  const costSummary = product.cost_summary || {
    costing_method: product.costing_method,
    ingredients_cost: 0,
    fixed_cost: Number(product.fixed_cost || 0),
    effective_cost: Number(product.fixed_cost || 0),
    cost_percentage: 0,
  };
  const ingredientUnitOptions = Array.from(
    new Set(
      [
        selectedIngredient?.ingredient_unit || "",
        selectedIngredient?.storage_unit || "",
        ingredientUnit || "",
        "kg",
        "g",
        "pcs",
      ]
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
  const pricingSummary = product.pricing_summary || {
    base_price: Number(product.price || 0),
    currency_code: city === "dubai" ? "AED" : "PHP",
    custom_price_count: customPrices.length,
    branches_with_custom_price: customPrices.map((row) => row.branch_code),
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/menu/products" className="text-xs text-amber-200 hover:text-amber-100">
            Back to Products
          </Link>
          <div className="mt-1 text-xl font-semibold text-neutral-100">{product.name}</div>
          <div className="mt-1 text-xs text-neutral-400">{product.category_name} • {product.sku} • {product.status}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {product.status === "ACTIVE" ? (
            <button type="button" onClick={() => void updateStatus("INACTIVE")} className="rounded-xl border border-neutral-700 px-3 py-2 text-xs text-neutral-200">Inactivate</button>
          ) : product.status === "INACTIVE" ? (
            <button type="button" onClick={() => void updateStatus("ACTIVE")} className="rounded-xl border border-emerald-700/80 px-3 py-2 text-xs text-emerald-200">Activate</button>
          ) : null}
          {product.status !== "DELETED" ? (
            <button type="button" onClick={() => void updateStatus("DELETED")} className="rounded-xl border border-rose-800/80 px-3 py-2 text-xs text-rose-200">Delete</button>
          ) : null}
        </div>
      </div>

      {error ? <div className="rounded-xl border border-rose-900/60 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-200">{success}</div> : null}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr,0.8fr]">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
          <div className="text-sm font-semibold text-neutral-100">Basic Info</div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-sm text-neutral-300">
              <div className="mb-1 text-xs text-neutral-500">City</div>
              <select value={city} onChange={(e) => setCity(e.target.value as City)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm">
                <option value="manila">Manila</option>
                <option value="dubai">Dubai</option>
              </select>
            </label>
            <label className="text-sm text-neutral-300">
              <div className="mb-1 text-xs text-neutral-500">Category</div>
              <select value={product.category_id} onChange={(e) => setProduct((current) => current ? { ...current, category_id: e.target.value, category_name: categories.find((row) => row.id === e.target.value)?.name || current.category_name } : current)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm">
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm text-neutral-300">
              <div className="mb-1 text-xs text-neutral-500">Name</div>
              <input value={product.name} onChange={(e) => setProduct((current) => current ? { ...current, name: e.target.value } : current)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm text-neutral-300">
              <div className="mb-1 text-xs text-neutral-500">SKU</div>
              <input value={product.sku} onChange={(e) => setProduct((current) => current ? { ...current, sku: e.target.value.toUpperCase() } : current)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm text-neutral-300">
              <div className="mb-1 text-xs text-neutral-500">Barcode</div>
              <input value={product.barcode} onChange={(e) => setProduct((current) => current ? { ...current, barcode: e.target.value } : current)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm text-neutral-300">
              <div className="mb-1 text-xs text-neutral-500">Price</div>
              <input value={String(product.price ?? 0)} onChange={(e) => setProduct((current) => current ? { ...current, price: Number(e.target.value || 0) } : current)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm text-neutral-300">
              <div className="mb-1 text-xs text-neutral-500">Fixed Cost</div>
              <input value={String(product.fixed_cost ?? 0)} onChange={(e) => setProduct((current) => current ? { ...current, fixed_cost: Number(e.target.value || 0) } : current)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm text-neutral-300">
              <div className="mb-1 text-xs text-neutral-500">Pricing Method</div>
              <select value={product.pricing_method} onChange={(e) => setProduct((current) => current ? { ...current, pricing_method: e.target.value } : current)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm">
                <option value="FIXED_PRICE">Fixed Price</option>
                <option value="OPEN_PRICE">Open Price</option>
              </select>
            </label>
            <label className="text-sm text-neutral-300">
              <div className="mb-1 text-xs text-neutral-500">Costing Method</div>
              <select value={product.costing_method} onChange={(e) => setProduct((current) => current ? { ...current, costing_method: e.target.value } : current)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm">
                <option value="FROM_INGREDIENTS">From Ingredients</option>
                <option value="FIXED_COST">Fixed Cost</option>
              </select>
            </label>
            <label className="text-sm text-neutral-300">
              <div className="mb-1 text-xs text-neutral-500">Selling Method</div>
              <select value={product.selling_method} onChange={(e) => setProduct((current) => current ? { ...current, selling_method: e.target.value } : current)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm">
                <option value="UNIT">Unit</option>
                <option value="WEIGHT">Weight</option>
              </select>
            </label>
            <label className="text-sm text-neutral-300">
              <div className="mb-1 text-xs text-neutral-500">Preparation Time</div>
              <input value={String(product.preparation_time ?? 0)} onChange={(e) => setProduct((current) => current ? { ...current, preparation_time: Number(e.target.value || 0) } : current)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm text-neutral-300">
              <div className="mb-1 text-xs text-neutral-500">Walk Time</div>
              <input value={String(product.walk_time ?? 0)} onChange={(e) => setProduct((current) => current ? { ...current, walk_time: Number(e.target.value || 0) } : current)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm text-neutral-300">
              <div className="mb-1 text-xs text-neutral-500">Calories</div>
              <input value={String(product.calories ?? 0)} onChange={(e) => setProduct((current) => current ? { ...current, calories: Number(e.target.value || 0) } : current)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950/30 px-3 py-3 text-sm text-neutral-300">
              <input type="checkbox" checked={Boolean(product.high_salt_content)} onChange={(e) => setProduct((current) => current ? { ...current, high_salt_content: e.target.checked } : current)} />
              High salt content
            </label>
          </div>

          <label className="mt-3 block text-sm text-neutral-300">
            <div className="mb-1 text-xs text-neutral-500">Description</div>
            <textarea value={product.description} onChange={(e) => setProduct((current) => current ? { ...current, description: e.target.value } : current)} className="min-h-24 w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
          </label>

          <div className="mt-4">
            <button type="button" onClick={() => void saveBasicInfo()} disabled={saving} className="rounded-xl border border-amber-700 bg-amber-950/30 px-4 py-2 text-sm text-amber-100 disabled:opacity-50">
              {saving ? "Saving..." : "Save Product"}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
            <div className="text-sm font-semibold text-neutral-100">Cost Summary</div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                <div className="text-xs text-neutral-500">Product Price</div>
                <div className="mt-1 text-neutral-100">{Number(product.price || 0).toFixed(2)}</div>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                <div className="text-xs text-neutral-500">Costing Method</div>
                <div className="mt-1 text-neutral-100">{product.costing_method}</div>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                <div className="text-xs text-neutral-500">Ingredients Cost</div>
                <div className="mt-1 text-neutral-100">{Number(costSummary.ingredients_cost || 0).toFixed(3)}</div>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                <div className="text-xs text-neutral-500">Effective Cost</div>
                <div className="mt-1 text-neutral-100">{Number(costSummary.effective_cost || 0).toFixed(3)}</div>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3 col-span-2">
                <div className="text-xs text-neutral-500">Cost Percentage</div>
                <div className="mt-1 text-neutral-100">{Number(costSummary.cost_percentage || 0).toFixed(2)}%</div>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                <div className="text-xs text-neutral-500">Price Currency</div>
                <div className="mt-1 text-neutral-100">{pricingSummary.currency_code}</div>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                <div className="text-xs text-neutral-500">Custom Prices</div>
                <div className="mt-1 text-neutral-100">{Number(pricingSummary.custom_price_count || 0)}</div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
            <div className="text-sm font-semibold text-neutral-100">Add Ingredient</div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <label className="md:col-span-2 text-sm text-neutral-300">
                <div className="mb-1 text-xs text-neutral-500">Ingredient Item</div>
                <select value={selectedIngredientId} onChange={(e) => setSelectedIngredientId(e.target.value)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm">
                  {ingredientOptions.map((item) => (
                    <option key={item.id} value={item.id}>{item.name} ({item.sku})</option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-neutral-300">
                <div className="mb-1 text-xs text-neutral-500">Quantity</div>
                <input value={ingredientQty} onChange={(e) => setIngredientQty(e.target.value)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
              </label>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[200px,auto]">
              <label className="text-sm text-neutral-300">
                <div className="mb-1 text-xs text-neutral-500">Unit</div>
                <select value={ingredientUnit} onChange={(e) => setIngredientUnit(e.target.value)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm">
                  {ingredientUnitOptions.map((unit) => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                </select>
              </label>
              <div className="flex items-end gap-2">
                <button type="button" onClick={() => void addOrUpdateIngredient()} disabled={ingredientSaving} className="rounded-xl border border-amber-700 bg-amber-950/30 px-4 py-2 text-sm text-amber-100 disabled:opacity-50">
                  {ingredientSaving ? "Saving..." : editingIngredientId ? "Save Ingredient" : "Add Ingredient"}
                </button>
                {editingIngredientId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingIngredientId("");
                      setIngredientQty("1");
                      setIngredientUnit(selectedIngredient?.ingredient_unit || selectedIngredient?.storage_unit || "");
                    }}
                    className="rounded-xl border border-neutral-700 px-4 py-2 text-sm text-neutral-200"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
            <div className="text-sm font-semibold text-neutral-100">{editingModifierId ? "Edit Modifier Link" : "Add Modifier Group"}</div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr),90px,90px,90px]">
              <label className="text-sm text-neutral-300">
                <div className="mb-1 text-xs text-neutral-500">Modifier Group</div>
                <select value={selectedModifierGroupId} onChange={(e) => setSelectedModifierGroupId(e.target.value)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm">
                  <option value="">Select modifier group</option>
                  {modifierGroupChoices.map((group) => (
                    <option key={group.id} value={group.id}>{group.name} ({Number(group.option_count || 0)} options)</option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-neutral-300">
                <div className="mb-1 text-xs text-neutral-500">Min</div>
                <input value={modifierMin} onChange={(e) => setModifierMin(e.target.value)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
              </label>
              <label className="text-sm text-neutral-300">
                <div className="mb-1 text-xs text-neutral-500">Max</div>
                <input value={modifierMax} onChange={(e) => setModifierMax(e.target.value)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
              </label>
              <label className="text-sm text-neutral-300">
                <div className="mb-1 text-xs text-neutral-500">Free</div>
                <input value={modifierFree} onChange={(e) => setModifierFree(e.target.value)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void addOrUpdateModifier()} disabled={modifierSaving} className="rounded-xl border border-amber-700 bg-amber-950/30 px-4 py-2 text-sm text-amber-100 disabled:opacity-50">
                {modifierSaving ? "Saving..." : editingModifierId ? "Save Modifier Link" : "Add Modifier Group"}
              </button>
              {editingModifierId ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditingModifierId("");
                    setSelectedModifierGroupId(modifierGroupChoices[0]?.id || "");
                    setModifierMin("0");
                    setModifierMax("1");
                    setModifierFree("0");
                  }}
                  className="rounded-xl border border-neutral-700 px-4 py-2 text-sm text-neutral-200"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
            <div className="text-sm font-semibold text-neutral-100">Add Tag</div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr),auto]">
              <label className="text-sm text-neutral-300">
                <div className="mb-1 text-xs text-neutral-500">Tag</div>
                <select value={selectedTagId} onChange={(e) => setSelectedTagId(e.target.value)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm">
                  <option value="">Select tag</option>
                  {availableTagOptions.map((tag) => (
                    <option key={tag.id} value={tag.id}>{tag.name}</option>
                  ))}
                </select>
              </label>
              <div className="flex items-end">
                <button type="button" onClick={() => void addTag()} disabled={tagSaving} className="rounded-xl border border-amber-700 bg-amber-950/30 px-4 py-2 text-sm text-amber-100 disabled:opacity-50">
                  {tagSaving ? "Saving..." : "Add Tag"}
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
            <div className="text-sm font-semibold text-neutral-100">{editingPriceId ? "Edit Custom Price" : "Add Custom Price"}</div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="text-sm text-neutral-300">
                <div className="mb-1 text-xs text-neutral-500">Branch</div>
                <select value={priceBranchCode} onChange={(e) => setPriceBranchCode(e.target.value)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm">
                  <option value="">Select branch</option>
                  {branchOptions.map((branch) => (
                    <option key={branch.code} value={branch.code}>{branch.label} ({branch.code})</option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-neutral-300">
                <div className="mb-1 text-xs text-neutral-500">Price</div>
                <input value={priceValue} onChange={(e) => setPriceValue(e.target.value)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
              </label>
              <label className="text-sm text-neutral-300">
                <div className="mb-1 text-xs text-neutral-500">Currency</div>
                <input value={priceCurrency} onChange={(e) => setPriceCurrency(e.target.value.toUpperCase())} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
              </label>
              <label className="text-sm text-neutral-300">
                <div className="mb-1 text-xs text-neutral-500">Effective From</div>
                <input type="date" value={priceEffectiveFrom} onChange={(e) => setPriceEffectiveFrom(e.target.value)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
              </label>
              <label className="text-sm text-neutral-300">
                <div className="mb-1 text-xs text-neutral-500">Effective To</div>
                <input type="date" value={priceEffectiveTo} onChange={(e) => setPriceEffectiveTo(e.target.value)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void addOrUpdateCustomPrice()} disabled={priceSaving} className="rounded-xl border border-amber-700 bg-amber-950/30 px-4 py-2 text-sm text-amber-100 disabled:opacity-50">
                {priceSaving ? "Saving..." : editingPriceId ? "Save Custom Price" : "Add Custom Price"}
              </button>
              {editingPriceId ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditingPriceId("");
                    setPriceBranchCode(branchOptions[0]?.code || "");
                    setPriceValue("");
                    setPriceCurrency(city === "dubai" ? "AED" : "PHP");
                    setPriceEffectiveFrom("");
                    setPriceEffectiveTo("");
                  }}
                  className="rounded-xl border border-neutral-700 px-4 py-2 text-sm text-neutral-200"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </section>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-neutral-100">Modifiers</div>
          <div className="text-xs text-neutral-500">{modifiers.length} link(s)</div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs text-neutral-500">
              <tr>
                <th className="pb-2 pr-4">Group</th>
                <th className="pb-2 pr-4">Options</th>
                <th className="pb-2 pr-4">Min / Max / Free</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {modifiers.length ? modifiers.map((row) => (
                <tr key={row.id} className="border-t border-neutral-800/80 align-top">
                  <td className="py-3 pr-4">
                    <div className="font-medium text-neutral-100">{row.modifier_group_name}</div>
                    {row.modifier_group_name_localized ? <div className="mt-1 text-xs text-neutral-500">{row.modifier_group_name_localized}</div> : null}
                  </td>
                  <td className="py-3 pr-4 text-neutral-300">{Number(row.option_count || 0)}</td>
                  <td className="py-3 pr-4 text-neutral-300">
                    {Number(row.minimum_options || 0)} / {Number(row.maximum_options || 0)} / {Number(row.free_options || 0)}
                  </td>
                  <td className="py-3 pr-4"><span className="rounded-full border border-neutral-700 px-2 py-1 text-[10px] text-neutral-300">{row.status}</span></td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingModifierId(row.id);
                          setSelectedModifierGroupId(row.modifier_group_id);
                          setModifierMin(String(row.minimum_options ?? 0));
                          setModifierMax(String(row.maximum_options ?? 1));
                          setModifierFree(String(row.free_options ?? 0));
                        }}
                        className="rounded-xl border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteModifier(row.id)}
                        className="rounded-xl border border-rose-800/80 px-3 py-1.5 text-xs text-rose-200"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td className="py-4 text-neutral-500" colSpan={5}>No modifier groups linked yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-neutral-100">Tags</div>
          <div className="text-xs text-neutral-500">{tags.length} tag(s)</div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {tags.length ? tags.map((tag) => (
            <div key={tag.id} className="inline-flex items-center gap-2 rounded-full border border-neutral-700 bg-neutral-950/30 px-3 py-2 text-sm text-neutral-200">
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: tag.color || "#A16207" }} />
              <span>{tag.name}</span>
              <button type="button" onClick={() => void removeTag(tag.tag_id)} className="text-xs text-rose-300 hover:text-rose-200">
                Remove
              </button>
            </div>
          )) : <div className="text-sm text-neutral-500">No tags linked yet.</div>}
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-neutral-100">Custom Prices</div>
            <div className="mt-1 text-xs text-neutral-500">Base price: {Number(pricingSummary.base_price || 0).toFixed(2)} {pricingSummary.currency_code}</div>
          </div>
          <div className="text-xs text-neutral-500">{customPrices.length} custom price(s)</div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs text-neutral-500">
              <tr>
                <th className="pb-2 pr-4">Branch</th>
                <th className="pb-2 pr-4">Price</th>
                <th className="pb-2 pr-4">Period</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {customPrices.length ? customPrices.map((row) => (
                <tr key={row.id} className="border-t border-neutral-800/80 align-top">
                  <td className="py-3 pr-4">
                    <div className="font-medium text-neutral-100">{row.branch_label || row.branch_code}</div>
                    <div className="mt-1 text-xs text-neutral-500">{row.branch_code}</div>
                  </td>
                  <td className="py-3 pr-4 text-neutral-300">
                    {Number(row.price || 0).toFixed(2)} {row.currency_code}
                    {row.is_current ? <div className="mt-1 text-xs text-emerald-300">Current active price</div> : null}
                  </td>
                  <td className="py-3 pr-4 text-neutral-300">
                    {(row.effective_from || "-")} to {(row.effective_to || "-")}
                  </td>
                  <td className="py-3 pr-4"><span className="rounded-full border border-neutral-700 px-2 py-1 text-[10px] text-neutral-300">{row.status}</span></td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPriceId(row.id);
                          setPriceBranchCode(row.branch_code || "");
                          setPriceValue(String(row.price ?? ""));
                          setPriceCurrency(row.currency_code || "");
                          setPriceEffectiveFrom(row.effective_from || "");
                          setPriceEffectiveTo(row.effective_to || "");
                        }}
                        className="rounded-xl border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteCustomPrice(row.id)}
                        className="rounded-xl border border-rose-800/80 px-3 py-1.5 text-xs text-rose-200"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td className="py-4 text-neutral-500" colSpan={5}>No custom prices yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-neutral-100">Ingredients</div>
          <div className="text-xs text-neutral-500">{ingredients.length} row(s)</div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs text-neutral-500">
              <tr>
                <th className="pb-2 pr-4">Ingredient</th>
                <th className="pb-2 pr-4">SKU</th>
                <th className="pb-2 pr-4">Quantity</th>
                <th className="pb-2 pr-4">Unit Cost</th>
                <th className="pb-2 pr-4">Total Cost</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {ingredients.length ? ingredients.map((row) => (
                <tr key={row.id} className="border-t border-neutral-800/80 align-top">
                  <td className="py-3 pr-4">
                    <div className="font-medium text-neutral-100">{row.ingredient_name}</div>
                    <div className="mt-1 text-xs text-neutral-500">{row.ingredient_unit || row.item_ingredient_unit || row.storage_unit}</div>
                  </td>
                  <td className="py-3 pr-4 text-neutral-300">{row.sku}</td>
                  <td className="py-3 pr-4 text-neutral-300">{Number(row.quantity || 0).toFixed(3)} {row.ingredient_unit || row.item_ingredient_unit || row.storage_unit}</td>
                  <td className="py-3 pr-4 text-neutral-300">{Number(row.unit_cost || 0).toFixed(3)}</td>
                  <td className="py-3 pr-4 text-neutral-300">{Number(row.total_cost || 0).toFixed(3)}</td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingIngredientId(row.id);
                          setSelectedIngredientId(row.ingredient_item_id);
                          setIngredientQty(String(row.quantity ?? 0));
                          setIngredientUnit(row.ingredient_unit || row.item_ingredient_unit || row.storage_unit || "");
                        }}
                        className="rounded-xl border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteIngredient(row.id)}
                        className="rounded-xl border border-rose-800/80 px-3 py-1.5 text-xs text-rose-200"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td className="py-4 text-neutral-500" colSpan={6}>No ingredient lines yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
