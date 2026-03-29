"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MenuImportFailures from "@/components/menu/MenuImportFailures";
import MenuPaginationControls from "@/components/menu/MenuPaginationControls";
import { canAccessMenuAdmin, getAuth, refreshAuthFromApi, type City } from "@/lib/auth";
import { menuGet, menuGetText, menuPatch, menuPost } from "@/lib/menuClient";

type ModifierGroupRow = { id: string; name: string; status: string };
type ModifierOptionRow = {
  id: string;
  city: string;
  modifier_group_id: string;
  modifier_group_name: string;
  name: string;
  name_localized: string;
  sku: string;
  barcode: string;
  image_url: string;
  description: string;
  price_delta: number;
  costing_method: string;
  fixed_cost: number;
  tax_group_id: string;
  calories: number;
  status: string;
  sort_order: number;
};
type PaginatedResponse<T> = { rows: T[]; total: number; page: number; page_size: number; has_next: boolean; has_prev: boolean };
type ImportFailure = { row_number?: number; reason?: string };

const EMPTY_FORM = { modifier_group_id: "", name: "", name_localized: "", sku: "", barcode: "", image_url: "", description: "", price_delta: "0", costing_method: "FIXED_COST", fixed_cost: "0", tax_group_id: "", calories: "0", sort_order: "0" };

export default function MenuModifierOptionsPage() {
  const auth = useMemo(() => getAuth(), []);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState<City>((auth?.city || "manila") as City);
  const [tab, setTab] = useState("ALL");
  const [q, setQ] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
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
  const [rows, setRows] = useState<ModifierOptionRow[]>([]);
  const [groups, setGroups] = useState<ModifierGroupRow[]>([]);
  const [importFailures, setImportFailures] = useState<ImportFailure[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState("DEACTIVATE");
  const [sortDrafts, setSortDrafts] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState("");
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

  const loadAll = useCallback(async (nextCity = city, nextTab = tab, nextQ = q, nextGroup = groupFilter, nextPage = page, nextPageSize = pageSize) => {
    setLoading(true);
    setError("");
    try {
      const [optionsRes, groupsRes] = await Promise.all([
        menuGet<PaginatedResponse<ModifierOptionRow>>(`/api/admin/menu/modifier-options?city=${encodeURIComponent(nextCity)}&tab=${encodeURIComponent(nextTab)}&q=${encodeURIComponent(nextQ)}&modifier_group_id=${encodeURIComponent(nextGroup)}&page=${encodeURIComponent(String(nextPage))}&page_size=${encodeURIComponent(String(nextPageSize))}&sort_by=sort_order&sort_dir=ASC`),
        menuGet<{ rows: ModifierGroupRow[] }>(`/api/admin/menu/modifier-groups?city=${encodeURIComponent(nextCity)}&tab=ALL&page=1&page_size=200&sort_by=sort_order&sort_dir=ASC`),
      ]);
      const nextGroups = (groupsRes.rows || []).filter((row) => row.status !== "DELETED");
      setRows(optionsRes.rows || []);
      setTotal(Number(optionsRes.total || 0));
      setPage(Number(optionsRes.page || nextPage));
      setPageSize(Number(optionsRes.page_size || nextPageSize));
      setHasNext(Boolean(optionsRes.has_next));
      setHasPrev(Boolean(optionsRes.has_prev));
      setSelectedIds([]);
      setSortDrafts(Object.fromEntries((optionsRes.rows || []).map((row) => [row.id, String(row.sort_order ?? 0)])));
      setGroups(nextGroups);
      setForm((current) => ({ ...current, modifier_group_id: current.modifier_group_id || nextGroups[0]?.id || "" }));
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [city, groupFilter, page, pageSize, q, tab]);

  useEffect(() => {
    if (!ready || !allowed) return;
    void loadAll();
  }, [allowed, loadAll, ready]);

  function resetForm() {
    setEditingId("");
    setForm({ ...EMPTY_FORM, modifier_group_id: groups[0]?.id || "" });
  }

  async function saveOption() {
    if (!form.modifier_group_id) return setError("Please select modifier group.");
    if (!form.name.trim()) return setError("Please enter modifier option name.");
    setSaving(true);
    setError("");
    setSuccess("");
    setImportFailures([]);
    try {
      const payload = { city, modifier_group_id: form.modifier_group_id, name: form.name, name_localized: form.name_localized, barcode: form.barcode, image_url: form.image_url, description: form.description, price_delta: Number(form.price_delta || 0), costing_method: form.costing_method, fixed_cost: Number(form.fixed_cost || 0), tax_group_id: form.tax_group_id, calories: Number(form.calories || 0), sort_order: Number(form.sort_order || 0) };
      if (editingId) {
        const res = await menuPatch<{ row?: ModifierOptionRow }>(`/api/admin/menu/modifier-options/${encodeURIComponent(editingId)}?city=${encodeURIComponent(city)}`, payload);
        setSuccess(`Modifier option updated. SKU: ${res.row?.sku || form.sku || "-"}.`);
      } else {
        const res = await menuPost<{ row?: ModifierOptionRow }>("/api/admin/menu/modifier-options", payload);
        setSuccess(`Modifier option created. SKU: ${res.row?.sku || "-"}.`);
      }
      resetForm();
      await loadAll(city, tab, q, groupFilter, page, pageSize);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(optionId: string, status: "ACTIVE" | "INACTIVE") {
    setError("");
    setSuccess("");
    try {
      await menuPost(`/api/admin/menu/modifier-options/${encodeURIComponent(optionId)}/status`, { city, status });
      setSuccess(`Modifier option marked ${status.toLowerCase()}.`);
      await loadAll(city, tab, q, groupFilter, page, pageSize);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  async function deleteOption(optionId: string) {
    setError("");
    setSuccess("");
    try {
      await menuPost(`/api/admin/menu/modifier-options/${encodeURIComponent(optionId)}/delete?city=${encodeURIComponent(city)}`, {});
      if (editingId === optionId) resetForm();
      setSuccess("Modifier option deleted.");
      await loadAll(city, tab, q, groupFilter, page, pageSize);
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
      const text = await menuGetText(`/api/admin/menu/modifier-options/export?city=${encodeURIComponent(city)}&tab=${encodeURIComponent(tab)}&q=${encodeURIComponent(q)}&modifier_group_id=${encodeURIComponent(groupFilter)}&sort_by=sort_order&sort_dir=ASC`);
      const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `menu-modifier-options-${city}.csv`;
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
      const res = await menuPost<{ success_count: number; failed_count: number; failures?: ImportFailure[] }>(`/api/admin/menu/modifier-options/import?city=${encodeURIComponent(city)}`, { csv_text: await file.text() });
      setSuccess(`Import finished. Success: ${res.success_count || 0}, Failed: ${res.failed_count || 0}.`);
      setImportFailures(res.failures || []);
      await loadAll(city, tab, q, groupFilter, 1, pageSize);
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
      const res = await menuPost<{ success_count: number; failed_count: number }>(`/api/admin/menu/admin-tools/modifier-options/bulk?city=${encodeURIComponent(city)}`, { action: bulkAction, ids: selectedIds, values });
      setSuccess(`Bulk action finished. Success: ${res.success_count || 0}, Failed: ${res.failed_count || 0}.`);
      await loadAll(city, tab, q, groupFilter, page, pageSize);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setWorking(false);
    }
  }

  if (!ready) return <div className="text-sm text-neutral-500">Loading modifier options...</div>;
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
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Option, SKU, or group" className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm text-neutral-300">
            <div className="mb-1 text-xs text-neutral-500">Group Filter</div>
            <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm">
              <option value="">All Groups</option>
              {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
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

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[420px,1fr]">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-neutral-100">{editingId ? "Edit Modifier Option" : "Create Modifier Option"}</div>
              <div className="mt-1 text-xs text-neutral-400">Modifier options now support CSV import/export, bulk actions, and sort updates.</div>
            </div>
            {editingId ? <button type="button" onClick={resetForm} className="rounded-xl border border-neutral-700 px-3 py-2 text-xs text-neutral-300">New</button> : null}
          </div>

          <div className="mt-4 space-y-3">
            <label className="block text-sm text-neutral-300"><div className="mb-1 text-xs text-neutral-500">Modifier Group *</div><select value={form.modifier_group_id} onChange={(e) => setForm((current) => ({ ...current, modifier_group_id: e.target.value }))} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm"><option value="">Select group</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
            <label className="block text-sm text-neutral-300"><div className="mb-1 text-xs text-neutral-500">Name *</div><input value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" /></label>
            <label className="block text-sm text-neutral-300"><div className="mb-1 text-xs text-neutral-500">Name Localized</div><input value={form.name_localized} onChange={(e) => setForm((current) => ({ ...current, name_localized: e.target.value }))} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm text-neutral-300">
                <div className="mb-1 text-xs text-neutral-500">SKU</div>
                <input value={editingId ? form.sku : "Auto assigned after save"} readOnly className="w-full rounded-xl border border-neutral-700 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-400" />
              </label>
              <label className="block text-sm text-neutral-300"><div className="mb-1 text-xs text-neutral-500">Barcode</div><input value={form.barcode} onChange={(e) => setForm((current) => ({ ...current, barcode: e.target.value }))} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" /></label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm text-neutral-300"><div className="mb-1 text-xs text-neutral-500">Price Delta</div><input value={form.price_delta} onChange={(e) => setForm((current) => ({ ...current, price_delta: e.target.value }))} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" /></label>
              <label className="block text-sm text-neutral-300"><div className="mb-1 text-xs text-neutral-500">Fixed Cost</div><input value={form.fixed_cost} onChange={(e) => setForm((current) => ({ ...current, fixed_cost: e.target.value }))} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" /></label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm text-neutral-300"><div className="mb-1 text-xs text-neutral-500">Costing Method</div><select value={form.costing_method} onChange={(e) => setForm((current) => ({ ...current, costing_method: e.target.value }))} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm"><option value="FIXED_COST">Fixed Cost</option><option value="FROM_INGREDIENTS">From Ingredients</option></select></label>
              <label className="block text-sm text-neutral-300"><div className="mb-1 text-xs text-neutral-500">Sort Order</div><input value={form.sort_order} onChange={(e) => setForm((current) => ({ ...current, sort_order: e.target.value }))} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" /></label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm text-neutral-300"><div className="mb-1 text-xs text-neutral-500">Calories</div><input value={form.calories} onChange={(e) => setForm((current) => ({ ...current, calories: e.target.value }))} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" /></label>
              <label className="block text-sm text-neutral-300"><div className="mb-1 text-xs text-neutral-500">Tax Group ID</div><input value={form.tax_group_id} onChange={(e) => setForm((current) => ({ ...current, tax_group_id: e.target.value }))} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" /></label>
            </div>
            <label className="block text-sm text-neutral-300"><div className="mb-1 text-xs text-neutral-500">Image URL</div><input value={form.image_url} onChange={(e) => setForm((current) => ({ ...current, image_url: e.target.value }))} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" /></label>
            <label className="block text-sm text-neutral-300"><div className="mb-1 text-xs text-neutral-500">Description</div><textarea value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} className="min-h-28 w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" /></label>
          </div>

          {error ? <div className="mt-3 text-xs text-rose-300">{error}</div> : null}
          {success ? <div className="mt-3 text-xs text-emerald-300">{success}</div> : null}
          <MenuImportFailures failures={importFailures} />

          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => void saveOption()} disabled={saving} className="rounded-xl border border-amber-700 bg-amber-950/30 px-4 py-2 text-sm text-amber-100 disabled:opacity-50">{saving ? "Saving..." : editingId ? "Save Changes" : "Create Option"}</button>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-neutral-100">Modifier Options</div>
            <div className="text-xs text-neutral-500">{total} total</div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs text-neutral-500">
                <tr>
                  <th className="pb-2 pr-4"><input type="checkbox" checked={rows.length > 0 && selectedIds.length === rows.length} onChange={toggleAll} /></th>
                  <th className="pb-2 pr-4">Option</th>
                  <th className="pb-2 pr-4">Group</th>
                  <th className="pb-2 pr-4">Sort</th>
                  <th className="pb-2 pr-4">Price Delta</th>
                  <th className="pb-2 pr-4">Fixed Cost</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td className="py-4 text-neutral-500" colSpan={8}>Loading modifier options...</td></tr> : rows.length ? rows.map((row) => (
                  <tr key={row.id} className="border-t border-neutral-800/80 align-top">
                    <td className="py-3 pr-4"><input type="checkbox" checked={selectedIds.includes(row.id)} onChange={() => toggleRow(row.id)} /></td>
                    <td className="py-3 pr-4"><div className="font-medium text-neutral-100">{row.name}</div><div className="mt-1 text-xs text-neutral-500">{row.sku || "-"}{row.name_localized ? ` • ${row.name_localized}` : ""}</div></td>
                    <td className="py-3 pr-4 text-neutral-300">{row.modifier_group_name}</td>
                    <td className="py-3 pr-4"><input value={sortDrafts[row.id] ?? String(row.sort_order ?? 0)} onChange={(e) => setSortDrafts((current) => ({ ...current, [row.id]: e.target.value }))} className="w-20 rounded-lg border border-neutral-700 bg-neutral-950/50 px-2 py-1 text-xs text-neutral-200" /></td>
                    <td className="py-3 pr-4 text-neutral-300">{Number(row.price_delta || 0).toFixed(2)}</td>
                    <td className="py-3 pr-4 text-neutral-300">{Number(row.fixed_cost || 0).toFixed(3)}</td>
                    <td className="py-3 pr-4"><span className="rounded-full border border-neutral-700 px-2 py-1 text-[10px] text-neutral-300">{row.status}</span></td>
                    <td className="py-3"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => { setEditingId(row.id); setForm({ modifier_group_id: row.modifier_group_id || "", name: row.name || "", name_localized: row.name_localized || "", sku: row.sku || "", barcode: row.barcode || "", image_url: row.image_url || "", description: row.description || "", price_delta: String(row.price_delta ?? 0), costing_method: row.costing_method || "FIXED_COST", fixed_cost: String(row.fixed_cost ?? 0), tax_group_id: row.tax_group_id || "", calories: String(row.calories ?? 0), sort_order: String(row.sort_order ?? 0) }); }} className="rounded-xl border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200">Edit</button>{row.status === "ACTIVE" ? <button type="button" onClick={() => void updateStatus(row.id, "INACTIVE")} className="rounded-xl border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200">Inactivate</button> : row.status === "INACTIVE" ? <button type="button" onClick={() => void updateStatus(row.id, "ACTIVE")} className="rounded-xl border border-emerald-700/80 px-3 py-1.5 text-xs text-emerald-200">Activate</button> : null}{row.status !== "DELETED" ? <button type="button" onClick={() => void deleteOption(row.id)} className="rounded-xl border border-rose-800/80 px-3 py-1.5 text-xs text-rose-200">Delete</button> : null}</div></td>
                  </tr>
                )) : <tr><td className="py-4 text-neutral-500" colSpan={8}>No modifier options found.</td></tr>}
              </tbody>
            </table>
          </div>
          <MenuPaginationControls page={page} pageSize={pageSize} total={total} hasPrev={hasPrev} hasNext={hasNext} onPrev={() => void loadAll(city, tab, q, groupFilter, page - 1, pageSize)} onNext={() => void loadAll(city, tab, q, groupFilter, page + 1, pageSize)} onPageSizeChange={(value) => void loadAll(city, tab, q, groupFilter, 1, value)} />
        </div>
      </section>
    </div>
  );
}
