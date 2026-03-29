"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MenuImportFailures from "@/components/menu/MenuImportFailures";
import MenuPaginationControls from "@/components/menu/MenuPaginationControls";
import { canAccessMenuAdmin, getAuth, refreshAuthFromApi, type City } from "@/lib/auth";
import { menuGet, menuGetText, menuPatch, menuPost } from "@/lib/menuClient";

type MenuCategoryRow = { id: string; name: string; status?: string };
type CostSummary = { ingredients_cost: number; fixed_cost: number; effective_cost: number; cost_percentage: number };
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

const EMPTY_FORM = {
  category_id: "",
  name: "",
  name_localized: "",
  sku: "",
  barcode: "",
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

export default function MenuProductsPage() {
  const auth = useMemo(() => getAuth(), []);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState<City>((auth?.city || "manila") as City);
  const [tab, setTab] = useState("ALL");
  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [rows, setRows] = useState<MenuProductRow[]>([]);
  const [categories, setCategories] = useState<MenuCategoryRow[]>([]);
  const [importFailures, setImportFailures] = useState<ImportFailure[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState("DEACTIVATE");
  const [sortDrafts, setSortDrafts] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState("");
  const [suggestedSku, setSuggestedSku] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const loadAll = useCallback(async (nextCity = city, nextTab = tab, nextQ = q, nextCategory = categoryFilter, nextPage = page, nextPageSize = pageSize) => {
    setLoading(true);
    setError("");
    try {
      const [productsRes, categoriesRes] = await Promise.all([
        menuGet<PaginatedResponse<MenuProductRow>>(
          `/api/admin/menu/products?city=${encodeURIComponent(nextCity)}&tab=${encodeURIComponent(nextTab)}&q=${encodeURIComponent(nextQ)}&category_id=${encodeURIComponent(nextCategory)}&page=${encodeURIComponent(String(nextPage))}&page_size=${encodeURIComponent(String(nextPageSize))}&sort_by=sort_order&sort_dir=ASC`,
        ),
        menuGet<{ rows: MenuCategoryRow[] }>(
          `/api/admin/menu/categories?city=${encodeURIComponent(nextCity)}&tab=ALL&page=1&page_size=200&sort_by=sort_order&sort_dir=ASC`,
        ),
      ]);
      const activeCategories = (categoriesRes.rows || []).filter((row) => row.status !== "DELETED");
      setRows(productsRes.rows || []);
      setCategories(activeCategories);
      setTotal(Number(productsRes.total || 0));
      setPage(Number(productsRes.page || nextPage));
      setPageSize(Number(productsRes.page_size || nextPageSize));
      setHasNext(Boolean(productsRes.has_next));
      setHasPrev(Boolean(productsRes.has_prev));
      setSelectedIds([]);
      setSortDrafts(Object.fromEntries((productsRes.rows || []).map((row) => [row.id, String(row.sort_order ?? 0)])));
      setForm((current) => ({ ...current, category_id: current.category_id || activeCategories[0]?.id || "" }));
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, city, page, pageSize, q, tab]);

  useEffect(() => {
    if (!ready || !allowed) return;
    void loadAll();
  }, [allowed, loadAll, ready]);

  useEffect(() => {
    if (!ready || !allowed) return;
    let cancelled = false;
    async function loadSuggestedSku() {
      try {
        const res = await menuGet<{ sku?: string }>(`/api/admin/menu/sku/next?city=${encodeURIComponent(city)}`);
        if (!cancelled) {
          const nextSku = res.sku || "";
          setSuggestedSku(nextSku);
          if (!editingId) setForm((current) => ({ ...current, sku: current.sku || nextSku }));
        }
      } catch {
        if (!cancelled) setSuggestedSku("");
      }
    }
    void loadSuggestedSku();
    return () => {
      cancelled = true;
    };
  }, [allowed, city, editingId, ready]);

  function resetForm() {
    setEditingId("");
    setForm({ ...EMPTY_FORM, category_id: categories[0]?.id || "", sku: suggestedSku });
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
        city,
        category_id: form.category_id,
        name: form.name,
        barcode: form.barcode,
        price: Number(form.price || 0),
        pricing_method: form.pricing_method,
        selling_method: form.selling_method,
        costing_method: form.costing_method,
        fixed_cost: Number(form.fixed_cost || 0),
        preparation_time: Number(form.preparation_time || 0),
        walk_time: Number(form.walk_time || 0),
        calories: Number(form.calories || 0),
        description: form.description,
        sort_order: Number(form.sort_order || 0),
        high_salt_content: form.high_salt_content,
      };
      if (editingId) {
        const res = await menuPatch<{ row?: MenuProductRow }>(`/api/admin/menu/products/${encodeURIComponent(editingId)}?city=${encodeURIComponent(city)}`, payload);
        setSuccess(`Product updated. SKU: ${res.row?.sku || form.sku || "-"}.`);
        resetForm();
      } else {
        const res = await menuPost<{ row?: MenuProductRow }>("/api/admin/menu/products", payload);
        setSuccess(`Product created. SKU: ${res.row?.sku || "-"}.`);
        const nextSkuRes = await menuGet<{ sku?: string }>(`/api/admin/menu/sku/next?city=${encodeURIComponent(city)}`);
        const nextSku = nextSkuRes.sku || "";
        setSuggestedSku(nextSku);
        setEditingId("");
        setForm({ ...EMPTY_FORM, category_id: categories[0]?.id || "", sku: nextSku });
      }
      await loadAll(city, tab, q, categoryFilter, page, pageSize);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(productId: string, status: "ACTIVE" | "INACTIVE") {
    setError("");
    setSuccess("");
    try {
      await menuPost(`/api/admin/menu/products/${encodeURIComponent(productId)}/status`, { city, status });
      setSuccess(`Product marked ${status.toLowerCase()}.`);
      await loadAll(city, tab, q, categoryFilter, page, pageSize);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  async function deleteProduct(productId: string) {
    setError("");
    setSuccess("");
    try {
      await menuPost(`/api/admin/menu/products/${encodeURIComponent(productId)}/delete?city=${encodeURIComponent(city)}`, {});
      if (editingId === productId) resetForm();
      setSuccess("Product deleted.");
      await loadAll(city, tab, q, categoryFilter, page, pageSize);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  function toggleRow(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
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
      link.href = url;
      link.download = `menu-products-${city}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setWorking(false);
    }
  }

  async function importRows(file: File) {
    setWorking(true);
    setError("");
    setSuccess("");
    setImportFailures([]);
    try {
      const res = await menuPost<{ success_count: number; failed_count: number; failures?: ImportFailure[] }>(`/api/admin/menu/products/import?city=${encodeURIComponent(city)}`, { csv_text: await file.text() });
      setSuccess(`Import finished. Success: ${res.success_count || 0}, Failed: ${res.failed_count || 0}.`);
      setImportFailures(res.failures || []);
      await loadAll(city, tab, q, categoryFilter, 1, pageSize);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setWorking(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function applyBulkAction() {
    if (!selectedIds.length) return;
    setWorking(true);
    setError("");
    setSuccess("");
    setImportFailures([]);
    try {
      const values = bulkAction === "UPDATE_SORT" ? Object.fromEntries(selectedIds.map((id) => [id, Number(sortDrafts[id] || 0)])) : {};
      const res = await menuPost<{ success_count: number; failed_count: number }>(`/api/admin/menu/admin-tools/products/bulk?city=${encodeURIComponent(city)}`, { action: bulkAction, ids: selectedIds, values });
      setSuccess(`Bulk action finished. Success: ${res.success_count || 0}, Failed: ${res.failed_count || 0}.`);
      await loadAll(city, tab, q, categoryFilter, page, pageSize);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setWorking(false);
    }
  }

  if (!ready) return <div className="text-sm text-neutral-500">Loading products...</div>;
  if (!allowed) return <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5 text-sm text-neutral-400">You do not have permission to open Menu Builder.</div>;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[120px,minmax(220px,1fr),220px,auto,auto,auto,auto]">
          <label className="text-sm text-neutral-300">
            <div className="mb-1 text-xs text-neutral-500">City</div>
            <select value={city} onChange={(e) => setCity(e.target.value as City)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm">
              <option value="manila">Manila</option>
              <option value="dubai">Dubai</option>
            </select>
          </label>
          <label className="text-sm text-neutral-300">
            <div className="mb-1 text-xs text-neutral-500">Search</div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Product, SKU, barcode" className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm text-neutral-300">
            <div className="mb-1 text-xs text-neutral-500">Category Filter</div>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm">
              <option value="">All Categories</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap items-end gap-2">
            {["ALL", "ACTIVE", "INACTIVE", "DELETED"].map((value) => (
              <button key={value} type="button" onClick={() => setTab(value)} className={["rounded-xl border px-3 py-2 text-xs", tab === value ? "border-amber-500 bg-amber-950/25 text-amber-200" : "border-neutral-700 bg-neutral-950/40 text-neutral-300"].join(" ")}>{value}</button>
            ))}
          </div>
          <button type="button" onClick={() => void exportRows()} disabled={working} className="rounded-xl border border-neutral-700 px-3 py-2 text-xs text-neutral-200 disabled:opacity-50">Export CSV</button>
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={working} className="rounded-xl border border-neutral-700 px-3 py-2 text-xs text-neutral-200 disabled:opacity-50">Import CSV</button>
          <div className="flex gap-2">
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void importRows(file); }} />
            <select value={bulkAction} onChange={(e) => setBulkAction(e.target.value)} className="rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-xs text-neutral-200">
              <option value="DEACTIVATE">Bulk Deactivate</option>
              <option value="ACTIVATE">Bulk Activate</option>
              <option value="DELETE">Bulk Delete</option>
              <option value="RESTORE">Bulk Restore</option>
              <option value="UPDATE_SORT">Bulk Update Sort</option>
            </select>
            <button type="button" onClick={() => void applyBulkAction()} disabled={working || !selectedIds.length} className="rounded-xl border border-amber-700 bg-amber-950/30 px-3 py-2 text-xs text-amber-100 disabled:opacity-50">Apply ({selectedIds.length})</button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[380px,1fr]">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-neutral-100">{editingId ? "Edit Product" : "Create Product"}</div>
              <div className="mt-1 text-xs text-neutral-400">Products now support sort order, CSV import/export, and bulk actions.</div>
            </div>
            {editingId ? <button type="button" onClick={resetForm} className="rounded-xl border border-neutral-700 px-3 py-2 text-xs text-neutral-300">New</button> : null}
          </div>
          <div className="mt-4 space-y-3">
            <label className="block text-sm text-neutral-300">
              <div className="mb-1 text-xs text-neutral-500">Category *</div>
              <select value={form.category_id} onChange={(e) => setForm((current) => ({ ...current, category_id: e.target.value }))} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm">
                <option value="">Select category</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label className="block text-sm text-neutral-300"><div className="mb-1 text-xs text-neutral-500">Name *</div><input value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm text-neutral-300">
                <div className="mb-1 text-xs text-neutral-500">SKU</div>
                <input value={form.sku} onChange={(e) => setForm((current) => ({ ...current, sku: e.target.value.toUpperCase() }))} placeholder={suggestedSku || "Auto suggested SKU"} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
              </label>
              <label className="block text-sm text-neutral-300"><div className="mb-1 text-xs text-neutral-500">Barcode</div><input value={form.barcode} onChange={(e) => setForm((current) => ({ ...current, barcode: e.target.value }))} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" /></label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm text-neutral-300"><div className="mb-1 text-xs text-neutral-500">Price</div><input value={form.price} onChange={(e) => setForm((current) => ({ ...current, price: e.target.value }))} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" /></label>
              <label className="block text-sm text-neutral-300"><div className="mb-1 text-xs text-neutral-500">Fixed Cost</div><input value={form.fixed_cost} onChange={(e) => setForm((current) => ({ ...current, fixed_cost: e.target.value }))} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" /></label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm text-neutral-300"><div className="mb-1 text-xs text-neutral-500">Pricing Method</div><select value={form.pricing_method} onChange={(e) => setForm((current) => ({ ...current, pricing_method: e.target.value }))} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm"><option value="FIXED_PRICE">Fixed Price</option><option value="OPEN_PRICE">Open Price</option></select></label>
              <label className="block text-sm text-neutral-300"><div className="mb-1 text-xs text-neutral-500">Costing Method</div><select value={form.costing_method} onChange={(e) => setForm((current) => ({ ...current, costing_method: e.target.value }))} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm"><option value="FROM_INGREDIENTS">From Ingredients</option><option value="FIXED_COST">Fixed Cost</option></select></label>
            </div>
            <label className="block text-sm text-neutral-300"><div className="mb-1 text-xs text-neutral-500">Description</div><textarea value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} className="min-h-24 w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" /></label>
            <label className="block text-sm text-neutral-300"><div className="mb-1 text-xs text-neutral-500">Sort Order</div><input value={form.sort_order} onChange={(e) => setForm((current) => ({ ...current, sort_order: e.target.value }))} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" /></label>
          </div>
          {error ? <div className="mt-3 text-xs text-rose-300">{error}</div> : null}
          {success ? <div className="mt-3 text-xs text-emerald-300">{success}</div> : null}
          <MenuImportFailures failures={importFailures} />
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => void saveProduct()} disabled={saving} className="rounded-xl border border-amber-700 bg-amber-950/30 px-4 py-2 text-sm text-amber-100 disabled:opacity-50">{saving ? "Saving..." : editingId ? "Save Changes" : "Create Product"}</button>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-neutral-100">Products</div>
            <div className="text-xs text-neutral-500">{total} total</div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs text-neutral-500">
                <tr>
                  <th className="pb-2 pr-4"><input type="checkbox" checked={rows.length > 0 && selectedIds.length === rows.length} onChange={toggleAll} /></th>
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4">SKU</th>
                  <th className="pb-2 pr-4">Category</th>
                  <th className="pb-2 pr-4">Sort</th>
                  <th className="pb-2 pr-4">Price</th>
                  <th className="pb-2 pr-4">Cost %</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td className="py-4 text-neutral-500" colSpan={9}>Loading products...</td></tr> : rows.length ? rows.map((row) => (
                  <tr key={row.id} className="border-t border-neutral-800/80 align-top">
                    <td className="py-3 pr-4"><input type="checkbox" checked={selectedIds.includes(row.id)} onChange={() => toggleRow(row.id)} /></td>
                    <td className="py-3 pr-4"><Link href={`/admin/menu/products/${encodeURIComponent(row.id)}`} className="font-medium text-amber-200 hover:text-amber-100">{row.name}</Link>{row.name_localized ? <div className="mt-1 text-xs text-neutral-500">{row.name_localized}</div> : null}</td>
                    <td className="py-3 pr-4 text-neutral-300">{row.sku}</td>
                    <td className="py-3 pr-4 text-neutral-300">{row.category_name}</td>
                    <td className="py-3 pr-4"><input value={sortDrafts[row.id] ?? String(row.sort_order ?? 0)} onChange={(e) => setSortDrafts((current) => ({ ...current, [row.id]: e.target.value }))} className="w-20 rounded-lg border border-neutral-700 bg-neutral-950/50 px-2 py-1 text-xs text-neutral-200" /></td>
                    <td className="py-3 pr-4 text-neutral-300">{Number(row.price || 0).toFixed(2)}</td>
                    <td className="py-3 pr-4 text-neutral-300">{Number(row.cost_summary?.cost_percentage || 0).toFixed(1)}%</td>
                    <td className="py-3 pr-4"><span className="rounded-full border border-neutral-700 px-2 py-1 text-[10px] text-neutral-300">{row.status}</span></td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => { setEditingId(row.id); setForm({ category_id: row.category_id || "", name: row.name || "", name_localized: row.name_localized || "", sku: row.sku || "", barcode: row.barcode || "", image_url: row.image_url || "", description: row.description || "", price: String(row.price ?? 0), pricing_method: row.pricing_method || "FIXED_PRICE", selling_method: row.selling_method || "UNIT", costing_method: row.costing_method || "FROM_INGREDIENTS", fixed_cost: String(row.fixed_cost ?? 0), preparation_time: String(row.preparation_time ?? 0), walk_time: String(row.walk_time ?? 0), calories: String(row.calories ?? 0), sort_order: String(row.sort_order ?? 0), high_salt_content: Boolean(row.high_salt_content) }); }} className="rounded-xl border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200">Edit</button>
                        {row.status === "ACTIVE" ? <button type="button" onClick={() => void updateStatus(row.id, "INACTIVE")} className="rounded-xl border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200">Inactivate</button> : row.status === "INACTIVE" ? <button type="button" onClick={() => void updateStatus(row.id, "ACTIVE")} className="rounded-xl border border-emerald-700/80 px-3 py-1.5 text-xs text-emerald-200">Activate</button> : null}
                        {row.status !== "DELETED" ? <button type="button" onClick={() => void deleteProduct(row.id)} className="rounded-xl border border-rose-800/80 px-3 py-1.5 text-xs text-rose-200">Delete</button> : null}
                      </div>
                    </td>
                  </tr>
                )) : <tr><td className="py-4 text-neutral-500" colSpan={9}>No products found.</td></tr>}
              </tbody>
            </table>
          </div>
          <MenuPaginationControls page={page} pageSize={pageSize} total={total} hasPrev={hasPrev} hasNext={hasNext} onPrev={() => void loadAll(city, tab, q, categoryFilter, page - 1, pageSize)} onNext={() => void loadAll(city, tab, q, categoryFilter, page + 1, pageSize)} onPageSizeChange={(value) => void loadAll(city, tab, q, categoryFilter, 1, value)} />
        </div>
      </section>
    </div>
  );
}
