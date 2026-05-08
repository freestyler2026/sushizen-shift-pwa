"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import IngredientItemSearch, { type IngredientItemOption } from "@/components/menu/IngredientItemSearch";
import MenuImportFailures from "@/components/menu/MenuImportFailures";
import MenuPaginationControls from "@/components/menu/MenuPaginationControls";
import { canAccessMenuAdmin, getAuth, refreshAuthFromApi, type City } from "@/lib/auth";
import { menuGet, menuGetText, menuPatch, menuPost } from "@/lib/menuClient";

type MenuCategoryRow = { id: string; name: string; status?: string };
type CostSummary = { ingredients_cost: number; fixed_cost: number; effective_cost: number; cost_percentage: number };
type DraftIngredient = {
  ingredient_item_id: string;
  ingredient_name: string;
  sku: string;
  quantity: string;
  ingredient_unit: string;
  item_type?: string;
};
type MenuProductRow = {
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
  sort_order: number;
  status: string;
  cost_summary?: CostSummary;
};
type PaginatedResponse<T> = { rows: T[]; total: number; page: number; page_size: number; has_next: boolean; has_prev: boolean };
type ImportFailure = { row_number?: number; reason?: string };
const BASE_INGREDIENT_UNITS = ["kg", "g", "pcs", "pkt", "ml"];

const EMPTY_FORM = {
  category_id: "",
  name: "",
  name_localized: "",
  sku: "",
  barcode: "",
  tax_group_id: "",
  price: "0",
  pricing_method: "FIXED_PRICE",
  selling_method: "UNIT",
  costing_method: "FROM_INGREDIENTS",
  fixed_cost: "0",
  preparation_time: "0",
  walk_time: "0",
  calories: "0",
  description: "",
  image_url: "",
  sort_order: "0",
  high_salt_content: false,
};

// ── Design helpers ─────────────────────────────────────────────────────────────
const CARD = "rounded-2xl border border-white/10 bg-white/5 shadow-xl shadow-black/20 backdrop-blur-sm";
const INPUT = "w-full rounded-xl border border-white/10 bg-white/6 px-3.5 py-2 text-sm text-white placeholder:text-zinc-500 outline-none transition-all duration-200 focus:border-violet-500/50 focus:bg-white/10 focus:ring-2 focus:ring-violet-500/20";
const SELECT = "w-full appearance-none cursor-pointer rounded-xl border border-white/10 bg-white/6 px-3.5 py-2 text-sm text-white outline-none transition-all duration-200 focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20";
const LABEL = "text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 mb-1.5 block";
const SECTION_TITLE = "text-[11px] font-semibold uppercase tracking-[0.15em] text-violet-400 mb-3 flex items-center gap-2";

function statusBadge(status: string) {
  const map: Record<string, string> = {
    ACTIVE:   "bg-emerald-500/15 border-emerald-500/30 text-emerald-400",
    INACTIVE: "bg-amber-500/15 border-amber-500/30 text-amber-400",
    DELETED:  "bg-red-500/15 border-red-500/30 text-red-400",
  };
  return `inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${map[status] ?? "bg-zinc-800 border-zinc-700 text-zinc-400"}`;
}

function costColor(pct: number) {
  if (pct <= 30) return "text-emerald-400";
  if (pct <= 50) return "text-amber-400";
  return "text-red-400";
}

function costBarColor(pct: number) {
  if (pct <= 30) return "bg-emerald-500";
  if (pct <= 50) return "bg-amber-500";
  return "bg-red-500";
}

function FormSection({ title, dot, children }: { title: string; dot?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/6 bg-white/3 p-4">
      <div className={SECTION_TITLE}>
        <span className={`h-1.5 w-1.5 rounded-full ${dot ?? "bg-violet-400"}`} />
        {title}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className={LABEL}>{label}</div>
      {children}
    </div>
  );
}

function MenuProductsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const auth = useMemo(() => getAuth(), []);
  const queryCity = (searchParams.get("city") || "").toLowerCase();
  const queryCategoryId = searchParams.get("category_id") || "";
  const queryTab = (searchParams.get("tab") || "").toUpperCase();
  const queryQ = searchParams.get("q") || "";
  const queryPage = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
  const queryPageSize = Math.max(1, Number.parseInt(searchParams.get("page_size") || "50", 10) || 50);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState<City>(((queryCity === "manila" || queryCity === "dubai" ? queryCity : (auth?.city || "manila")) as City));
  const [tab, setTab] = useState(["ALL", "ACTIVE", "INACTIVE", "DELETED"].includes(queryTab) ? queryTab : "ALL");
  const [q, setQ] = useState(queryQ);
  const [categoryFilter, setCategoryFilter] = useState(queryCategoryId);
  const [page, setPage] = useState(queryPage);
  const [pageSize, setPageSize] = useState(queryPageSize);
  const [total, setTotal] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [rows, setRows] = useState<MenuProductRow[]>([]);
  const [productFilterOptions, setProductFilterOptions] = useState<MenuProductRow[]>([]);
  const [categories, setCategories] = useState<MenuCategoryRow[]>([]);
  const [importFailures, setImportFailures] = useState<ImportFailure[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState("DEACTIVATE");
  const [sortDrafts, setSortDrafts] = useState<Record<string, string>>({});
  const [suggestedSku, setSuggestedSku] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedIngredient, setSelectedIngredient] = useState<IngredientItemOption | null>(null);
  const [ingredientQty, setIngredientQty] = useState("1");
  const [ingredientUnit, setIngredientUnit] = useState("kg");
  const [draftIngredients, setDraftIngredients] = useState<DraftIngredient[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const resolved = await refreshAuthFromApi(auth);
      if (cancelled) return;
      setAllowed(canAccessMenuAdmin(resolved));
      setCity((queryCity === "manila" || queryCity === "dubai" ? queryCity : (resolved?.city || auth?.city || "manila")) as City);
      setReady(true);
    }
    void init();
    return () => { cancelled = true; };
  }, [auth, queryCity]);

  useEffect(() => { setCategoryFilter(queryCategoryId); }, [queryCategoryId]);

  useEffect(() => {
    const qs = new URLSearchParams();
    qs.set("city", city);
    if (tab !== "ALL") qs.set("tab", tab);
    if (q) qs.set("q", q);
    if (categoryFilter) qs.set("category_id", categoryFilter);
    if (page > 1) qs.set("page", String(page));
    if (pageSize !== 50) qs.set("page_size", String(pageSize));
    router.replace(`${pathname}${qs.toString() ? `?${qs.toString()}` : ""}`, { scroll: false });
  }, [categoryFilter, city, page, pageSize, pathname, q, router, tab]);

  const loadCategoryOptions = useCallback(async (nextCity = city) => {
    try {
      const res = await menuGet<PaginatedResponse<MenuCategoryRow>>(
        `/api/admin/menu/categories?city=${encodeURIComponent(nextCity)}&tab=ALL&page=1&page_size=500&sort_by=sort_order&sort_dir=ASC`,
      );
      const activeCategories = (res.rows || []).filter((row) => row.status !== "DELETED");
      setCategories(activeCategories);
      setCategoryFilter((current) => (current && !activeCategories.some((row) => row.id === current) ? "" : current));
      setForm((current) => ({
        ...current,
        category_id: current.category_id && activeCategories.some((row) => row.id === current.category_id)
          ? current.category_id
          : activeCategories[0]?.id || "",
      }));
    } catch (e: any) { setError(e?.message || String(e)); }
  }, [city]);

  const loadAll = useCallback(async (nextCity = city, nextTab = tab, nextQ = q, nextCategory = categoryFilter, nextPage = page, nextPageSize = pageSize) => {
    setLoading(true);
    setError("");
    try {
      const productsRes = await menuGet<PaginatedResponse<MenuProductRow>>(
        `/api/admin/menu/products?city=${encodeURIComponent(nextCity)}&tab=${encodeURIComponent(nextTab)}&q=${encodeURIComponent(nextQ)}&category_id=${encodeURIComponent(nextCategory)}&page=${encodeURIComponent(String(nextPage))}&page_size=${encodeURIComponent(String(nextPageSize))}&sort_by=sort_order&sort_dir=ASC`,
      );
      setRows(productsRes.rows || []);
      setTotal(Number(productsRes.total || 0));
      setPage(Number(productsRes.page || nextPage));
      setPageSize(Number(productsRes.page_size || nextPageSize));
      setHasNext(Boolean(productsRes.has_next));
      setHasPrev(Boolean(productsRes.has_prev));
      setSelectedIds([]);
      setSortDrafts(Object.fromEntries((productsRes.rows || []).map((row) => [row.id, String(row.sort_order ?? 0)])));
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  }, [categoryFilter, city, page, pageSize, q, tab]);

  useEffect(() => { if (!ready || !allowed) return; void loadAll(); }, [allowed, loadAll, ready]);
  useEffect(() => { if (!ready || !allowed) return; void loadCategoryOptions(); }, [allowed, loadCategoryOptions, ready]);

  useEffect(() => {
    if (!ready || !allowed) return;
    let cancelled = false;
    async function loadProductFilterOptions() {
      try {
        const res = await menuGet<PaginatedResponse<MenuProductRow>>(
          `/api/admin/menu/products?city=${encodeURIComponent(city)}&tab=ALL&q=&category_id=&page=1&page_size=500&sort_by=sort_order&sort_dir=ASC`,
        );
        if (!cancelled) setProductFilterOptions(res.rows || []);
      } catch (e: any) { if (!cancelled) setError(e?.message || String(e)); }
    }
    void loadProductFilterOptions();
    return () => { cancelled = true; };
  }, [allowed, city, ready]);

  const visibleProductFilterOptions = useMemo(
    () => productFilterOptions.filter((row) => !categoryFilter || row.category_id === categoryFilter),
    [categoryFilter, productFilterOptions],
  );

  useEffect(() => {
    if (!ready || !allowed) return;
    let cancelled = false;
    async function loadSuggestedSku() {
      try {
        const res = await menuGet<{ sku?: string }>(`/api/admin/menu/sku/next?city=${encodeURIComponent(city)}`);
        if (!cancelled) {
          const nextSku = res.sku || "";
          setSuggestedSku(nextSku);
          setForm((current) => ({ ...current, sku: current.sku || nextSku }));
        }
      } catch { if (!cancelled) setSuggestedSku(""); }
    }
    void loadSuggestedSku();
    return () => { cancelled = true; };
  }, [allowed, city, ready]);

  const ingredientUnitOptions = Array.from(
    new Set([selectedIngredient?.ingredient_unit || "", selectedIngredient?.storage_unit || "", ingredientUnit || "", ...BASE_INGREDIENT_UNITS].map((v) => v.trim()).filter(Boolean)),
  );

  useEffect(() => {
    if (!selectedIngredient) return;
    setIngredientUnit(selectedIngredient.ingredient_unit || selectedIngredient.storage_unit || BASE_INGREDIENT_UNITS[0]);
  }, [selectedIngredient]);

  function addDraftIngredient() {
    if (!selectedIngredient) return setError("Please select ingredient item.");
    const quantity = Number(ingredientQty || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) return setError("Please enter ingredient quantity.");
    if (!ingredientUnit.trim()) return setError("Please select ingredient unit.");
    setError("");
    setDraftIngredients((current) => [
      ...current.filter((row) => row.ingredient_item_id !== selectedIngredient.id),
      { ingredient_item_id: selectedIngredient.id, ingredient_name: selectedIngredient.name, sku: selectedIngredient.sku, quantity: String(quantity), ingredient_unit: ingredientUnit, item_type: selectedIngredient.item_type },
    ]);
    setIngredientQty("1");
  }

  function removeDraftIngredient(ingredientItemId: string) {
    setDraftIngredients((current) => current.filter((row) => row.ingredient_item_id !== ingredientItemId));
  }

  function resetForm() {
    setForm({ ...EMPTY_FORM, category_id: categories[0]?.id || "", sku: suggestedSku });
    setSelectedIngredient(null);
    setIngredientQty("1");
    setIngredientUnit(BASE_INGREDIENT_UNITS[0]);
    setDraftIngredients([]);
  }

  async function saveProduct() {
    if (!form.name.trim()) return setError("Please enter product name.");
    if (!form.category_id) return setError("Please select category.");
    setSaving(true);
    setError("");
    setSuccess("");
    setImportFailures([]);
    try {
      const payload = {
        city, category_id: form.category_id, name: form.name, name_localized: form.name_localized,
        sku: form.sku, barcode: form.barcode, image_url: form.image_url, tax_group_id: form.tax_group_id,
        price: Number(form.price || 0), pricing_method: form.pricing_method, selling_method: form.selling_method,
        costing_method: form.costing_method, fixed_cost: Number(form.fixed_cost || 0),
        preparation_time: Number(form.preparation_time || 0), walk_time: Number(form.walk_time || 0),
        calories: Number(form.calories || 0), description: form.description,
        sort_order: Number(form.sort_order || 0), high_salt_content: form.high_salt_content,
      };
      const res = await menuPost<{ row?: MenuProductRow }>("/api/admin/menu/products", payload);
      const createdId = String(res.row?.id || "");
      for (const line of draftIngredients) {
        await menuPost(`/api/admin/menu/products/${encodeURIComponent(createdId)}/ingredients?city=${encodeURIComponent(city)}`, {
          ingredient_item_id: line.ingredient_item_id, quantity: Number(line.quantity || 0), ingredient_unit: line.ingredient_unit,
        });
      }
      setSuccess(`Product created. SKU: ${res.row?.sku || "-"}.`);
      const nextSkuRes = await menuGet<{ sku?: string }>(`/api/admin/menu/sku/next?city=${encodeURIComponent(city)}`);
      const nextSku = nextSkuRes.sku || "";
      setSuggestedSku(nextSku);
      setForm({ ...EMPTY_FORM, category_id: categories[0]?.id || "", sku: nextSku });
      setSelectedIngredient(null);
      setIngredientQty("1");
      setIngredientUnit(BASE_INGREDIENT_UNITS[0]);
      setDraftIngredients([]);
      await loadAll(city, tab, q, categoryFilter, page, pageSize);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setSaving(false); }
  }

  async function updateStatus(productId: string, status: "ACTIVE" | "INACTIVE") {
    setError(""); setSuccess("");
    try {
      await menuPost(`/api/admin/menu/products/${encodeURIComponent(productId)}/status`, { city, status });
      setSuccess(`Product marked ${status.toLowerCase()}.`);
      await loadAll(city, tab, q, categoryFilter, page, pageSize);
    } catch (e: any) { setError(e?.message || String(e)); }
  }

  async function deleteProduct(productId: string) {
    if (!window.confirm("Delete this product?")) return;
    setError(""); setSuccess("");
    try {
      await menuPost(`/api/admin/menu/products/${encodeURIComponent(productId)}/delete?city=${encodeURIComponent(city)}`, {});
      setSuccess("Product deleted.");
      await loadAll(city, tab, q, categoryFilter, page, pageSize);
    } catch (e: any) { setError(e?.message || String(e)); }
  }

  function toggleRow(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((v) => v !== id) : [...current, id]);
  }

  function toggleAll() {
    setSelectedIds((current) => current.length === rows.length ? [] : rows.map((row) => row.id));
  }

  async function exportRows() {
    setWorking(true);
    try {
      const text = await menuGetText(`/api/admin/menu/products/export?city=${encodeURIComponent(city)}&tab=${encodeURIComponent(tab)}&q=${encodeURIComponent(q)}&category_id=${encodeURIComponent(categoryFilter)}&sort_by=sort_order&sort_dir=ASC`);
      const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = `menu-products-${city}.csv`; link.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setWorking(false); }
  }

  async function importRows(file: File) {
    setWorking(true); setError(""); setSuccess(""); setImportFailures([]);
    try {
      const res = await menuPost<{ success_count: number; failed_count: number; failures?: ImportFailure[] }>(`/api/admin/menu/products/import?city=${encodeURIComponent(city)}`, { csv_text: await file.text() });
      setSuccess(`Import finished. Success: ${res.success_count || 0}, Failed: ${res.failed_count || 0}.`);
      setImportFailures(res.failures || []);
      await loadAll(city, tab, q, categoryFilter, 1, pageSize);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setWorking(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  }

  async function applyBulkAction() {
    if (!selectedIds.length) return;
    setWorking(true); setError(""); setSuccess(""); setImportFailures([]);
    try {
      const values = bulkAction === "UPDATE_SORT" ? Object.fromEntries(selectedIds.map((id) => [id, Number(sortDrafts[id] || 0)])) : {};
      const res = await menuPost<{ success_count: number; failed_count: number }>(`/api/admin/menu/admin-tools/products/bulk?city=${encodeURIComponent(city)}`, { action: bulkAction, ids: selectedIds, values });
      setSuccess(`Bulk action finished. Success: ${res.success_count || 0}, Failed: ${res.failed_count || 0}.`);
      await loadAll(city, tab, q, categoryFilter, page, pageSize);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setWorking(false); }
  }

  if (!ready) return (
    <div className="flex items-center gap-3 text-sm text-zinc-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
      Loading products...
    </div>
  );
  if (!allowed) return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-400">
      You do not have permission to open Menu Builder.
    </div>
  );

  const activeCount = rows.filter((r) => r.status === "ACTIVE").length;

  return (
    <div className="space-y-5">

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Products</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            Manage menu items for{" "}
            <span className="font-medium text-violet-300">{city === "dubai" ? "Dubai" : "Manila"}</span>
          </p>
        </div>

        {/* City switcher */}
        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          {(["manila", "dubai"] as City[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCity(c)}
              className={[
                "rounded-lg px-4 py-1.5 text-sm font-medium capitalize transition-all duration-200",
                city === c
                  ? "bg-violet-500/25 text-violet-200 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200",
              ].join(" ")}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* ── Stats strip ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total Products", value: total, color: "text-white" },
          { label: "Showing (page)", value: rows.length, color: "text-zinc-300" },
          { label: "Active", value: activeCount, color: "text-emerald-400" },
          { label: "Selected", value: selectedIds.length, color: selectedIds.length ? "text-violet-300" : "text-zinc-600" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-white/8 bg-white/5 px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</div>
            <div className={`mt-1 text-xl font-bold tabular-nums ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── Filter / toolbar ─────────────────────────────────────────────────── */}
      <div className={`${CARD} p-4`}>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr,1fr,auto]">
          {/* Row 1: search + category */}
          <div>
            <div className={LABEL}>Search product</div>
            <select value={q} onChange={(e) => setQ(e.target.value)} className={SELECT}>
              <option value="">All products</option>
              {visibleProductFilterOptions.map((row) => (
                <option key={row.id} value={row.sku || row.barcode || row.name || ""}>
                  {row.name}{row.sku ? ` (${row.sku})` : row.barcode ? ` (${row.barcode})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className={LABEL}>Category</div>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={SELECT}>
              <option value="">All categories</option>
              {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
            </select>
          </div>

          {/* Row 1: CSV tools */}
          <div className="flex flex-col justify-end gap-2">
            <div className={LABEL}>Data tools</div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void exportRows()}
                disabled={working}
                className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:border-violet-500/30 hover:bg-violet-500/10 hover:text-violet-200 disabled:opacity-50"
              >
                ↑ Export
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={working}
                className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:border-violet-500/30 hover:bg-violet-500/10 hover:text-violet-200 disabled:opacity-50"
              >
                ↓ Import
              </button>
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importRows(f); }} />
            </div>
          </div>
        </div>

        {/* Status tabs + bulk row */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/6 pt-3">
          {/* Status tabs */}
          <div className="flex items-center gap-1 rounded-xl border border-white/8 bg-white/4 p-1">
            {["ALL", "ACTIVE", "INACTIVE", "DELETED"].map((value) => {
              const colors: Record<string, string> = {
                ALL:      tab === value ? "bg-zinc-700/60 text-white" : "text-zinc-400 hover:text-zinc-200",
                ACTIVE:   tab === value ? "bg-emerald-500/20 text-emerald-300" : "text-zinc-400 hover:text-emerald-300",
                INACTIVE: tab === value ? "bg-amber-500/20 text-amber-300" : "text-zinc-400 hover:text-amber-300",
                DELETED:  tab === value ? "bg-red-500/20 text-red-300" : "text-zinc-400 hover:text-red-300",
              };
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTab(value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 ${colors[value]}`}
                >
                  {value}
                </button>
              );
            })}
          </div>

          {/* Bulk action */}
          <div className="flex items-center gap-2">
            <select
              value={bulkAction}
              onChange={(e) => setBulkAction(e.target.value)}
              className="rounded-xl border border-white/10 bg-white/6 px-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-violet-500/50"
            >
              <option value="DEACTIVATE">Bulk Deactivate</option>
              <option value="ACTIVATE">Bulk Activate</option>
              <option value="DELETE">Bulk Delete</option>
              <option value="RESTORE">Bulk Restore</option>
              <option value="UPDATE_SORT">Bulk Update Sort</option>
            </select>
            <button
              type="button"
              onClick={() => void applyBulkAction()}
              disabled={working || !selectedIds.length}
              className="rounded-xl border border-violet-500/30 bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-200 transition hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Apply ({selectedIds.length})
            </button>
          </div>
        </div>
      </div>

      {/* ── Main: form + table ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[360px,1fr]">

        {/* ── Create / Edit form ─────────────────────────────────────────────── */}
        <div className={`${CARD} p-5`}>
          {/* Form header */}
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-violet-400" />
                <h2 className="text-sm font-semibold text-white">New Product</h2>
              </div>
              <p className="mt-0.5 text-xs text-zinc-500">Fill in the fields below</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Basic info */}
            <FormSection title="Basic Info" dot="bg-violet-400">
              <Field label="Category *">
                <select value={form.category_id} onChange={(e) => setForm((c) => ({ ...c, category_id: e.target.value }))} className={SELECT}>
                  <option value="">Select category</option>
                  {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
              </Field>
              <Field label="Name *">
                <input value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} className={INPUT} placeholder="Product name" />
              </Field>
              <Field label="Localized Name">
                <input value={form.name_localized} onChange={(e) => setForm((c) => ({ ...c, name_localized: e.target.value }))} className={INPUT} placeholder="e.g. ローカル名" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="SKU">
                  <input value={form.sku} onChange={(e) => setForm((c) => ({ ...c, sku: e.target.value.toUpperCase() }))} placeholder={suggestedSku || "Auto"} className={INPUT} />
                </Field>
                <Field label="Barcode">
                  <input value={form.barcode} onChange={(e) => setForm((c) => ({ ...c, barcode: e.target.value }))} className={INPUT} />
                </Field>
              </div>
            </FormSection>

            {/* Ingredients */}
            <FormSection title="Ingredients" dot="bg-emerald-400">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr,80px,90px]">
                  <Field label="Ingredient Item">
                    <IngredientItemSearch
                      city={city}
                      selectedOption={selectedIngredient}
                      onSelect={(option) => {
                        setSelectedIngredient(option);
                        if (option) setIngredientUnit(option.ingredient_unit || option.storage_unit || BASE_INGREDIENT_UNITS[0]);
                      }}
                    />
                  </Field>
                  <Field label="Qty">
                    <input value={ingredientQty} onChange={(e) => setIngredientQty(e.target.value)} className={INPUT} />
                  </Field>
                  <Field label="Unit">
                    <select value={ingredientUnit} onChange={(e) => setIngredientUnit(e.target.value)} className={SELECT}>
                      {ingredientUnitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </Field>
                </div>
                <button
                  type="button"
                  onClick={addDraftIngredient}
                  className="w-full rounded-xl border border-emerald-600/30 bg-emerald-500/10 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
                >
                  + Add Ingredient
                </button>
                {draftIngredients.length > 0 && (
                  <div className="mt-1 space-y-1.5">
                    {draftIngredients.map((line) => (
                      <div key={line.ingredient_item_id} className="flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-white/4 px-3 py-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-xs font-medium text-white">{line.ingredient_name}</span>
                            <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${String(line.item_type || "").toUpperCase() === "PRODUCT" ? "border-violet-500/30 bg-violet-500/15 text-violet-300" : "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"}`}>
                              {String(line.item_type || "").toUpperCase() === "PRODUCT" ? "CK" : "ING"}
                            </span>
                          </div>
                          <div className="text-[10px] text-zinc-500">{line.sku} · {line.quantity} {line.ingredient_unit}</div>
                        </div>
                        <button type="button" onClick={() => removeDraftIngredient(line.ingredient_item_id)} className="shrink-0 rounded-lg border border-red-500/25 px-2 py-1 text-[10px] text-red-400 transition hover:bg-red-500/15">✕</button>
                      </div>
                    ))}
                  </div>
                )}
                {!draftIngredients.length && <p className="text-xs text-zinc-600">No ingredients added yet.</p>}
              </FormSection>

            {/* Pricing */}
            <FormSection title="Pricing & Costing" dot="bg-amber-400">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Price">
                  <input value={form.price} onChange={(e) => setForm((c) => ({ ...c, price: e.target.value }))} className={INPUT} />
                </Field>
                <Field label="Fixed Cost">
                  <input value={form.fixed_cost} onChange={(e) => setForm((c) => ({ ...c, fixed_cost: e.target.value }))} className={INPUT} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Pricing Method">
                  <select value={form.pricing_method} onChange={(e) => setForm((c) => ({ ...c, pricing_method: e.target.value }))} className={SELECT}>
                    <option value="FIXED_PRICE">Fixed Price</option>
                    <option value="OPEN_PRICE">Open Price</option>
                  </select>
                </Field>
                <Field label="Costing Method">
                  <select value={form.costing_method} onChange={(e) => setForm((c) => ({ ...c, costing_method: e.target.value }))} className={SELECT}>
                    <option value="FROM_INGREDIENTS">From Ingredients</option>
                    <option value="FIXED_COST">Fixed Cost</option>
                  </select>
                </Field>
              </div>
            </FormSection>

            {/* Details */}
            <FormSection title="Details" dot="bg-sky-400">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Image URL">
                  <input value={form.image_url} onChange={(e) => setForm((c) => ({ ...c, image_url: e.target.value }))} className={INPUT} placeholder="https://..." />
                </Field>
                <Field label="Tax Group ID">
                  <input value={form.tax_group_id} onChange={(e) => setForm((c) => ({ ...c, tax_group_id: e.target.value }))} className={INPUT} />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Prep Time (min)">
                  <input value={form.preparation_time} onChange={(e) => setForm((c) => ({ ...c, preparation_time: e.target.value }))} className={INPUT} />
                </Field>
                <Field label="Walk Time">
                  <input value={form.walk_time} onChange={(e) => setForm((c) => ({ ...c, walk_time: e.target.value }))} className={INPUT} />
                </Field>
                <Field label="Calories">
                  <input value={form.calories} onChange={(e) => setForm((c) => ({ ...c, calories: e.target.value }))} className={INPUT} />
                </Field>
              </div>
              <Field label="Description">
                <textarea value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} rows={3} className="w-full rounded-xl border border-white/10 bg-white/6 px-3.5 py-2 text-sm text-white placeholder:text-zinc-500 outline-none transition focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 resize-none" />
              </Field>
              <Field label="Sort Order">
                <input value={form.sort_order} onChange={(e) => setForm((c) => ({ ...c, sort_order: e.target.value }))} className={INPUT} />
              </Field>
            </FormSection>
          </div>

          {/* Messages */}
          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-xs text-red-300">
              <span className="mt-px shrink-0">⚠</span>{error}
            </div>
          )}
          {success && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-300">
              <span className="mt-px shrink-0">✓</span>{success}
            </div>
          )}
          <MenuImportFailures failures={importFailures} />

          <div className="mt-4">
            <button
              type="button"
              onClick={() => void saveProduct()}
              disabled={saving}
              className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:from-violet-400 hover:to-purple-400 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Create Product"}
            </button>
          </div>
        </div>

        {/* ── Product table ──────────────────────────────────────────────────── */}
        <div className={`${CARD} p-5`}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-white">
              Products
              <span className="ml-2 rounded-full bg-white/8 px-2 py-0.5 text-xs text-zinc-400">{total}</span>
            </h2>
            {loading && (
              <span className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
                Loading…
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-white/8">
                  <th className="pb-2.5 pr-3 text-left">
                    <input
                      type="checkbox"
                      checked={rows.length > 0 && selectedIds.length === rows.length}
                      onChange={toggleAll}
                      className="rounded border-white/20 bg-white/10 accent-violet-500"
                    />
                  </th>
                  {["Name", "SKU", "Category", "Sort", "Price", "Cost %", "Status", "Actions"].map((h) => (
                    <th key={h} className="pb-2.5 pr-4 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500 last:pr-0">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && !rows.length ? (
                  <tr><td colSpan={9} className="py-8 text-center text-sm text-zinc-500">Loading products…</td></tr>
                ) : !rows.length ? (
                  <tr><td colSpan={9} className="py-8 text-center text-sm text-zinc-500">No products found.</td></tr>
                ) : rows.map((row) => {
                  const costPct = Number(row.cost_summary?.cost_percentage || 0);
                  const isSelected = selectedIds.includes(row.id);
                  return (
                    <tr
                      key={row.id}
                      className={[
                        "border-b border-white/5 align-middle transition-colors duration-100",
                        isSelected ? "bg-violet-500/8" : "hover:bg-white/4",
                      ].join(" ")}
                    >
                      <td className="py-3 pr-3">
                        <input type="checkbox" checked={isSelected} onChange={() => toggleRow(row.id)} className="rounded border-white/20 bg-white/10 accent-violet-500" />
                      </td>

                      {/* Name + thumbnail */}
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2.5">
                          {row.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={row.image_url} alt={row.name} className="h-8 w-8 shrink-0 rounded-lg object-cover ring-1 ring-white/10" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/6 text-xs text-zinc-600">
                              {row.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <Link
                              href={`/admin/menu/products/${encodeURIComponent(row.id)}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`}
                              className="block truncate text-sm font-medium text-violet-300 hover:text-violet-100"
                            >
                              {row.name}
                            </Link>
                            {row.name_localized && (
                              <div className="truncate text-[10px] text-zinc-500">{row.name_localized}</div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3 pr-4">
                        <span className="rounded-lg bg-white/6 px-2 py-1 text-xs font-mono text-zinc-300">{row.sku || "—"}</span>
                      </td>

                      <td className="py-3 pr-4">
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-300">{row.category_name}</span>
                      </td>

                      <td className="py-3 pr-4">
                        <input
                          value={sortDrafts[row.id] ?? String(row.sort_order ?? 0)}
                          onChange={(e) => setSortDrafts((c) => ({ ...c, [row.id]: e.target.value }))}
                          className="w-14 rounded-lg border border-white/10 bg-white/6 px-2 py-1 text-center text-xs text-zinc-200 outline-none focus:border-violet-500/50"
                        />
                      </td>

                      <td className="py-3 pr-4">
                        <span className="text-sm font-semibold tabular-nums text-white">
                          {Number(row.price || 0).toFixed(2)}
                        </span>
                      </td>

                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-semibold tabular-nums ${costColor(costPct)}`}>
                            {costPct.toFixed(1)}%
                          </span>
                          <div className="h-1.5 w-12 overflow-hidden rounded-full bg-white/8">
                            <div
                              className={`h-full rounded-full ${costBarColor(costPct)} transition-all`}
                              style={{ width: `${Math.min(costPct, 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      <td className="py-3 pr-4">
                        <span className={statusBadge(row.status)}>{row.status}</span>
                      </td>

                      <td className="py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => router.push(`/admin/menu/products/${encodeURIComponent(row.id)}?city=${encodeURIComponent(city)}`)}
                            className="rounded-lg border border-white/10 bg-white/6 px-2.5 py-1 text-xs font-medium text-zinc-200 transition hover:border-violet-500/30 hover:bg-violet-500/10 hover:text-violet-200"
                          >
                            Edit
                          </button>
                          {row.status === "ACTIVE" && (
                            <button type="button" onClick={() => void updateStatus(row.id, "INACTIVE")} className="rounded-lg border border-amber-500/25 bg-amber-500/8 px-2.5 py-1 text-xs font-medium text-amber-300 transition hover:bg-amber-500/18">Off</button>
                          )}
                          {row.status === "INACTIVE" && (
                            <button type="button" onClick={() => void updateStatus(row.id, "ACTIVE")} className="rounded-lg border border-emerald-500/25 bg-emerald-500/8 px-2.5 py-1 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/18">On</button>
                          )}
                          {row.status !== "DELETED" && (
                            <button type="button" onClick={() => void deleteProduct(row.id)} className="rounded-lg border border-red-500/20 bg-red-500/8 px-2.5 py-1 text-xs font-medium text-red-400 transition hover:bg-red-500/18">✕</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 border-t border-white/6 pt-3">
            <MenuPaginationControls
              page={page}
              pageSize={pageSize}
              total={total}
              hasPrev={hasPrev}
              hasNext={hasNext}
              onPrev={() => void loadAll(city, tab, q, categoryFilter, page - 1, pageSize)}
              onNext={() => void loadAll(city, tab, q, categoryFilter, page + 1, pageSize)}
              onPageSizeChange={(value) => void loadAll(city, tab, q, categoryFilter, 1, value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MenuProductsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center gap-3 text-sm text-zinc-500">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
        Loading products...
      </div>
    }>
      <MenuProductsPageInner />
    </Suspense>
  );
}
