"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MenuImportFailures from "@/components/menu/MenuImportFailures";
import MenuPaginationControls from "@/components/menu/MenuPaginationControls";
import { canAccessMenuAdmin, getAuth, refreshAuthFromApi, type City } from "@/lib/auth";
import { menuGet, menuGetText, menuPatch, menuPost } from "@/lib/menuClient";

type ComboCostSummary = { effective_cost: number; cost_percentage: number };
type MenuComboRow = {
  id: string;
  city: string;
  name: string;
  name_localized: string;
  sku: string;
  barcode: string;
  image_url: string;
  description: string;
  price: number;
  pricing_method: string;
  costing_method: string;
  fixed_cost: number;
  status: string;
  sort_order: number;
  product_count: number;
  cost_summary?: ComboCostSummary;
};
type PaginatedResponse<T> = { rows: T[]; total: number; page: number; page_size: number; has_next: boolean; has_prev: boolean };
type ImportFailure = { row_number?: number; reason?: string };

const EMPTY_FORM = { name: "", name_localized: "", sku: "", barcode: "", image_url: "", description: "", price: "0", pricing_method: "FIXED_PRICE", costing_method: "FROM_INGREDIENTS", fixed_cost: "0", sort_order: "0" };

export default function MenuCombosPage() {
  const auth = useMemo(() => getAuth(), []);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState<City>((auth?.city || "manila") as City);
  const [tab, setTab] = useState("ALL");
  const [q, setQ] = useState("");
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
  const [rows, setRows] = useState<MenuComboRow[]>([]);
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
    return () => { cancelled = true; };
  }, [auth]);

  const loadRows = useCallback(async (nextCity = city, nextTab = tab, nextQ = q, nextPage = page, nextPageSize = pageSize) => {
    setLoading(true);
    setError("");
    try {
      const res = await menuGet<PaginatedResponse<MenuComboRow>>(`/api/admin/menu/combos?city=${encodeURIComponent(nextCity)}&tab=${encodeURIComponent(nextTab)}&q=${encodeURIComponent(nextQ)}&page=${encodeURIComponent(String(nextPage))}&page_size=${encodeURIComponent(String(nextPageSize))}&sort_by=sort_order&sort_dir=ASC`);
      setRows(res.rows || []);
      setTotal(Number(res.total || 0));
      setPage(Number(res.page || nextPage));
      setPageSize(Number(res.page_size || nextPageSize));
      setHasNext(Boolean(res.has_next));
      setHasPrev(Boolean(res.has_prev));
      setSelectedIds([]);
      setSortDrafts(Object.fromEntries((res.rows || []).map((row) => [row.id, String(row.sort_order ?? 0)])));
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [city, page, pageSize, q, tab]);

  useEffect(() => {
    if (!ready || !allowed) return;
    void loadRows();
  }, [allowed, loadRows, ready]);

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
    setForm({ ...EMPTY_FORM, sku: suggestedSku });
  }

  async function saveCombo() {
    if (!form.name.trim()) return setError("Please enter combo name.");
    setSaving(true);
    setError("");
    setSuccess("");
    setImportFailures([]);
    try {
      const payload = { city, name: form.name, barcode: form.barcode, description: form.description, sku: form.sku, price: Number(form.price || 0), pricing_method: form.pricing_method, costing_method: form.costing_method, fixed_cost: Number(form.fixed_cost || 0), sort_order: Number(form.sort_order || 0) };
      if (editingId) {
        const res = await menuPatch<{ row?: MenuComboRow }>(`/api/admin/menu/combos/${encodeURIComponent(editingId)}?city=${encodeURIComponent(city)}`, payload);
        setSuccess(`Combo updated. SKU: ${res.row?.sku || form.sku || "-"}.`);
        resetForm();
      } else {
        const res = await menuPost<{ row?: MenuComboRow }>("/api/admin/menu/combos", payload);
        setSuccess(`Combo created. SKU: ${res.row?.sku || "-"}.`);
        const nextSkuRes = await menuGet<{ sku?: string }>(`/api/admin/menu/sku/next?city=${encodeURIComponent(city)}`);
        const nextSku = nextSkuRes.sku || "";
        setSuggestedSku(nextSku);
        setEditingId("");
        setForm({ ...EMPTY_FORM, sku: nextSku });
      }
      await loadRows(city, tab, q, page, pageSize);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(comboId: string, status: "ACTIVE" | "INACTIVE") {
    setError("");
    setSuccess("");
    try {
      await menuPost(`/api/admin/menu/combos/${encodeURIComponent(comboId)}/status`, { city, status });
      setSuccess(`Combo marked ${status.toLowerCase()}.`);
      await loadRows(city, tab, q, page, pageSize);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  async function deleteCombo(comboId: string) {
    setError("");
    setSuccess("");
    try {
      await menuPost(`/api/admin/menu/combos/${encodeURIComponent(comboId)}/delete?city=${encodeURIComponent(city)}`, {});
      if (editingId === comboId) resetForm();
      setSuccess("Combo deleted.");
      await loadRows(city, tab, q, page, pageSize);
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
      const text = await menuGetText(`/api/admin/menu/combos/export?city=${encodeURIComponent(city)}&tab=${encodeURIComponent(tab)}&q=${encodeURIComponent(q)}&sort_by=sort_order&sort_dir=ASC`);
      const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `menu-combos-${city}.csv`;
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
      const res = await menuPost<{ success_count: number; failed_count: number; failures?: ImportFailure[] }>(`/api/admin/menu/combos/import?city=${encodeURIComponent(city)}`, { csv_text: await file.text() });
      setSuccess(`Import finished. Success: ${res.success_count || 0}, Failed: ${res.failed_count || 0}.`);
      setImportFailures(res.failures || []);
      await loadRows(city, tab, q, 1, pageSize);
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
      const res = await menuPost<{ success_count: number; failed_count: number }>(`/api/admin/menu/admin-tools/combos/bulk?city=${encodeURIComponent(city)}`, { action: bulkAction, ids: selectedIds, values });
      setSuccess(`Bulk action finished. Success: ${res.success_count || 0}, Failed: ${res.failed_count || 0}.`);
      await loadRows(city, tab, q, page, pageSize);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setWorking(false);
    }
  }

  if (!ready) return <div className="text-sm text-neutral-500">Loading combos...</div>;
  if (!allowed) return <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5 text-sm text-neutral-400">You do not have permission to open Menu Builder.</div>;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[140px,minmax(220px,1fr),auto,auto,auto,auto]">
          <label className="text-sm text-neutral-300">
            <div className="mb-1 text-xs text-neutral-500">City</div>
            <select value={city} onChange={(e) => setCity(e.target.value as City)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm">
              <option value="manila">Manila</option>
              <option value="dubai">Dubai</option>
            </select>
          </label>
          <label className="text-sm text-neutral-300">
            <div className="mb-1 text-xs text-neutral-500">Search</div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Combo name, SKU, barcode" className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
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
              <div className="text-sm font-semibold text-neutral-100">{editingId ? "Edit Combo" : "Create Combo"}</div>
              <div className="mt-1 text-xs text-neutral-400">Combos now support sort order, CSV import/export, and bulk actions.</div>
            </div>
            {editingId ? <button type="button" onClick={resetForm} className="rounded-xl border border-neutral-700 px-3 py-2 text-xs text-neutral-300">New</button> : null}
          </div>
          <div className="mt-4 space-y-3">
            {[
              ["Name *", "name"],
              ["Barcode", "barcode"],
            ].map(([label, key]) => (
              <label key={key} className="block text-sm text-neutral-300">
                <div className="mb-1 text-xs text-neutral-500">{label}</div>
                <input value={(form as Record<string, string>)[key]} onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
              </label>
            ))}
            <label className="block text-sm text-neutral-300">
              <div className="mb-1 text-xs text-neutral-500">SKU</div>
              <input value={form.sku} onChange={(e) => setForm((current) => ({ ...current, sku: e.target.value.toUpperCase() }))} placeholder={suggestedSku || "Auto suggested SKU"} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
            </label>
            <label className="block text-sm text-neutral-300"><div className="mb-1 text-xs text-neutral-500">Description</div><textarea value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} rows={3} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm text-neutral-300"><div className="mb-1 text-xs text-neutral-500">Price</div><input value={form.price} onChange={(e) => setForm((current) => ({ ...current, price: e.target.value }))} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" /></label>
              <label className="block text-sm text-neutral-300"><div className="mb-1 text-xs text-neutral-500">Fixed Cost</div><input value={form.fixed_cost} onChange={(e) => setForm((current) => ({ ...current, fixed_cost: e.target.value }))} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" /></label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm text-neutral-300"><div className="mb-1 text-xs text-neutral-500">Pricing Method</div><select value={form.pricing_method} onChange={(e) => setForm((current) => ({ ...current, pricing_method: e.target.value }))} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm"><option value="FIXED_PRICE">Fixed Price</option></select></label>
              <label className="block text-sm text-neutral-300"><div className="mb-1 text-xs text-neutral-500">Costing Method</div><select value={form.costing_method} onChange={(e) => setForm((current) => ({ ...current, costing_method: e.target.value }))} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm"><option value="FROM_INGREDIENTS">From Products</option><option value="FIXED_COST">Fixed Cost</option></select></label>
            </div>
            <label className="block text-sm text-neutral-300"><div className="mb-1 text-xs text-neutral-500">Sort Order</div><input value={form.sort_order} onChange={(e) => setForm((current) => ({ ...current, sort_order: e.target.value }))} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" /></label>
          </div>
          {error ? <div className="mt-3 text-xs text-rose-300">{error}</div> : null}
          {success ? <div className="mt-3 text-xs text-emerald-300">{success}</div> : null}
          <MenuImportFailures failures={importFailures} />
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => void saveCombo()} disabled={saving} className="rounded-xl border border-amber-700 bg-amber-950/30 px-4 py-2 text-sm text-amber-100 disabled:opacity-50">{saving ? "Saving..." : editingId ? "Save Changes" : "Create Combo"}</button>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-neutral-100">Combos</div>
            <div className="text-xs text-neutral-500">{total} total</div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs text-neutral-500">
                <tr>
                  <th className="pb-2 pr-4"><input type="checkbox" checked={rows.length > 0 && selectedIds.length === rows.length} onChange={toggleAll} /></th>
                  <th className="pb-2 pr-4">Combo</th>
                  <th className="pb-2 pr-4">Sort</th>
                  <th className="pb-2 pr-4">Price</th>
                  <th className="pb-2 pr-4">Products</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td className="py-4 text-neutral-500" colSpan={7}>Loading combos...</td></tr> : rows.length ? rows.map((row) => (
                  <tr key={row.id} className="border-t border-neutral-800/80 align-top">
                    <td className="py-3 pr-4"><input type="checkbox" checked={selectedIds.includes(row.id)} onChange={() => toggleRow(row.id)} /></td>
                    <td className="py-3 pr-4"><Link href={`/admin/menu/combos/${encodeURIComponent(row.id)}`} className="font-medium text-amber-200 hover:text-amber-100">{row.name}</Link><div className="mt-1 text-xs text-neutral-500">{row.sku || "-"}</div></td>
                    <td className="py-3 pr-4"><input value={sortDrafts[row.id] ?? String(row.sort_order ?? 0)} onChange={(e) => setSortDrafts((current) => ({ ...current, [row.id]: e.target.value }))} className="w-20 rounded-lg border border-neutral-700 bg-neutral-950/50 px-2 py-1 text-xs text-neutral-200" /></td>
                    <td className="py-3 pr-4 text-neutral-300"><div>{Number(row.price || 0).toFixed(2)}</div><div className="mt-1 text-xs text-neutral-500">Cost {Number(row.cost_summary?.effective_cost || 0).toFixed(2)}</div></td>
                    <td className="py-3 pr-4 text-neutral-300">{Number(row.product_count || 0)}</td>
                    <td className="py-3 pr-4"><span className="rounded-full border border-neutral-700 px-2 py-1 text-[10px] text-neutral-300">{row.status}</span></td>
                    <td className="py-3"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => { setEditingId(row.id); setForm({ name: row.name || "", name_localized: row.name_localized || "", sku: row.sku || "", barcode: row.barcode || "", image_url: row.image_url || "", description: row.description || "", price: String(row.price ?? 0), pricing_method: row.pricing_method || "FIXED_PRICE", costing_method: row.costing_method || "FROM_INGREDIENTS", fixed_cost: String(row.fixed_cost ?? 0), sort_order: String(row.sort_order ?? 0) }); }} className="rounded-lg border border-neutral-700 px-2 py-1 text-xs text-neutral-200">Edit</button>{row.status === "ACTIVE" ? <button type="button" onClick={() => void updateStatus(row.id, "INACTIVE")} className="rounded-lg border border-neutral-700 px-2 py-1 text-xs text-neutral-200">Inactivate</button> : row.status === "INACTIVE" ? <button type="button" onClick={() => void updateStatus(row.id, "ACTIVE")} className="rounded-lg border border-neutral-700 px-2 py-1 text-xs text-neutral-200">Activate</button> : null}{row.status !== "DELETED" ? <button type="button" onClick={() => void deleteCombo(row.id)} className="rounded-lg border border-rose-900/80 px-2 py-1 text-xs text-rose-200">Delete</button> : null}</div></td>
                  </tr>
                )) : <tr><td className="py-4 text-neutral-500" colSpan={7}>No combos found.</td></tr>}
              </tbody>
            </table>
          </div>
          <MenuPaginationControls page={page} pageSize={pageSize} total={total} hasPrev={hasPrev} hasNext={hasNext} onPrev={() => void loadRows(city, tab, q, page - 1, pageSize)} onNext={() => void loadRows(city, tab, q, page + 1, pageSize)} onPageSizeChange={(value) => void loadRows(city, tab, q, 1, value)} />
        </div>
      </section>
    </div>
  );
}
