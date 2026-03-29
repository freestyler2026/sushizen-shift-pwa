"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MenuImportFailures from "@/components/menu/MenuImportFailures";
import MenuPaginationControls from "@/components/menu/MenuPaginationControls";
import { canAccessMenuAdmin, getAuth, refreshAuthFromApi, type City } from "@/lib/auth";
import { menuGet, menuGetText, menuPatch, menuPost } from "@/lib/menuClient";

type GroupContentSummary = { product_count: number; combo_count: number };
type MenuGroupRow = {
  id: string; city: string; name: string; name_localized: string; reference: string; description: string;
  status: string; sort_order: number; product_count: number; combo_count: number; content_summary?: GroupContentSummary;
};
type PaginatedResponse<T> = { rows: T[]; total: number; page: number; page_size: number; has_next: boolean; has_prev: boolean };
type ImportFailure = { row_number?: number; reason?: string };

const EMPTY_FORM = { name: "", name_localized: "", reference: "", description: "", sort_order: "0" };

export default function MenuGroupsPage() {
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
  const [rows, setRows] = useState<MenuGroupRow[]>([]);
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

  const loadRows = useCallback(async (nextCity = city, nextTab = tab, nextQ = q, nextPage = page, nextPageSize = pageSize) => {
    setLoading(true);
    setError("");
    try {
      const res = await menuGet<PaginatedResponse<MenuGroupRow>>(`/api/admin/menu/groups?city=${encodeURIComponent(nextCity)}&tab=${encodeURIComponent(nextTab)}&q=${encodeURIComponent(nextQ)}&page=${encodeURIComponent(String(nextPage))}&page_size=${encodeURIComponent(String(nextPageSize))}&sort_by=sort_order&sort_dir=ASC`);
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

  function resetForm() {
    setEditingId("");
    setForm(EMPTY_FORM);
  }

  async function saveGroup() {
    if (!form.name.trim()) return setError("Please enter group name.");
    setSaving(true);
    setError("");
    setSuccess("");
    setImportFailures([]);
    try {
      const payload = { city, name: form.name, name_localized: form.name_localized, reference: form.reference, description: form.description, sort_order: Number(form.sort_order || 0) };
      if (editingId) {
        await menuPatch(`/api/admin/menu/groups/${encodeURIComponent(editingId)}?city=${encodeURIComponent(city)}`, payload);
        setSuccess("Group updated.");
      } else {
        await menuPost("/api/admin/menu/groups", payload);
        setSuccess("Group created.");
      }
      resetForm();
      await loadRows(city, tab, q, page, pageSize);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(groupId: string, status: "ACTIVE" | "INACTIVE") {
    setError("");
    setSuccess("");
    try {
      await menuPost(`/api/admin/menu/groups/${encodeURIComponent(groupId)}/status`, { city, status });
      setSuccess(`Group marked ${status.toLowerCase()}.`);
      await loadRows(city, tab, q, page, pageSize);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  async function deleteGroup(groupId: string) {
    setError("");
    setSuccess("");
    try {
      await menuPost(`/api/admin/menu/groups/${encodeURIComponent(groupId)}/delete?city=${encodeURIComponent(city)}`, {});
      if (editingId === groupId) resetForm();
      setSuccess("Group deleted.");
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
      const text = await menuGetText(`/api/admin/menu/groups/export?city=${encodeURIComponent(city)}&tab=${encodeURIComponent(tab)}&q=${encodeURIComponent(q)}&sort_by=sort_order&sort_dir=ASC`);
      const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `menu-groups-${city}.csv`;
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
      const res = await menuPost<{ success_count: number; failed_count: number; failures?: ImportFailure[] }>(`/api/admin/menu/groups/import?city=${encodeURIComponent(city)}`, { csv_text: await file.text() });
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
      const res = await menuPost<{ success_count: number; failed_count: number }>(`/api/admin/menu/admin-tools/groups/bulk?city=${encodeURIComponent(city)}`, { action: bulkAction, ids: selectedIds, values });
      setSuccess(`Bulk action finished. Success: ${res.success_count || 0}, Failed: ${res.failed_count || 0}.`);
      await loadRows(city, tab, q, page, pageSize);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setWorking(false);
    }
  }

  if (!ready) return <div className="text-sm text-neutral-500">Loading groups...</div>;
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
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Group name or reference" className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
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
              <div className="text-sm font-semibold text-neutral-100">{editingId ? "Edit Group" : "Create Group"}</div>
              <div className="mt-1 text-xs text-neutral-400">Groups now support sort order, CSV import/export, and bulk actions.</div>
            </div>
            {editingId ? <button type="button" onClick={resetForm} className="rounded-xl border border-neutral-700 px-3 py-2 text-xs text-neutral-300">New</button> : null}
          </div>
          <div className="mt-4 space-y-3">
            {[
              ["Name *", "name"],
              ["Name Localized", "name_localized"],
              ["Reference", "reference"],
            ].map(([label, key]) => (
              <label key={key} className="block text-sm text-neutral-300">
                <div className="mb-1 text-xs text-neutral-500">{label}</div>
                <input value={(form as Record<string, string>)[key]} onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" />
              </label>
            ))}
            <label className="block text-sm text-neutral-300"><div className="mb-1 text-xs text-neutral-500">Description</div><textarea value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} rows={3} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" /></label>
            <label className="block text-sm text-neutral-300"><div className="mb-1 text-xs text-neutral-500">Sort Order</div><input value={form.sort_order} onChange={(e) => setForm((current) => ({ ...current, sort_order: e.target.value }))} className="w-full rounded-xl border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm" /></label>
          </div>
          {error ? <div className="mt-3 text-xs text-rose-300">{error}</div> : null}
          {success ? <div className="mt-3 text-xs text-emerald-300">{success}</div> : null}
          <MenuImportFailures failures={importFailures} />
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => void saveGroup()} disabled={saving} className="rounded-xl border border-amber-700 bg-amber-950/30 px-4 py-2 text-sm text-amber-100 disabled:opacity-50">{saving ? "Saving..." : editingId ? "Save Changes" : "Create Group"}</button>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-neutral-100">Groups</div>
            <div className="text-xs text-neutral-500">{total} total</div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs text-neutral-500">
                <tr>
                  <th className="pb-2 pr-4"><input type="checkbox" checked={rows.length > 0 && selectedIds.length === rows.length} onChange={toggleAll} /></th>
                  <th className="pb-2 pr-4">Group</th>
                  <th className="pb-2 pr-4">Sort</th>
                  <th className="pb-2 pr-4">Contents</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td className="py-4 text-neutral-500" colSpan={6}>Loading groups...</td></tr> : rows.length ? rows.map((row) => (
                  <tr key={row.id} className="border-t border-neutral-800/80 align-top">
                    <td className="py-3 pr-4"><input type="checkbox" checked={selectedIds.includes(row.id)} onChange={() => toggleRow(row.id)} /></td>
                    <td className="py-3 pr-4"><Link href={`/admin/menu/groups/${encodeURIComponent(row.id)}`} className="font-medium text-amber-200 hover:text-amber-100">{row.name}</Link><div className="mt-1 text-xs text-neutral-500">{row.name_localized || row.reference || "-"}</div></td>
                    <td className="py-3 pr-4"><input value={sortDrafts[row.id] ?? String(row.sort_order ?? 0)} onChange={(e) => setSortDrafts((current) => ({ ...current, [row.id]: e.target.value }))} className="w-20 rounded-lg border border-neutral-700 bg-neutral-950/50 px-2 py-1 text-xs text-neutral-200" /></td>
                    <td className="py-3 pr-4 text-neutral-300"><div>{Number(row.content_summary?.product_count ?? row.product_count ?? 0)} products</div><div className="mt-1 text-xs text-neutral-500">{Number(row.content_summary?.combo_count ?? row.combo_count ?? 0)} combos</div></td>
                    <td className="py-3 pr-4"><span className="rounded-full border border-neutral-700 px-2 py-1 text-[10px] text-neutral-300">{row.status}</span></td>
                    <td className="py-3"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => { setEditingId(row.id); setForm({ name: row.name || "", name_localized: row.name_localized || "", reference: row.reference || "", description: row.description || "", sort_order: String(row.sort_order ?? 0) }); }} className="rounded-lg border border-neutral-700 px-2 py-1 text-xs text-neutral-200">Edit</button>{row.status === "ACTIVE" ? <button type="button" onClick={() => void updateStatus(row.id, "INACTIVE")} className="rounded-lg border border-neutral-700 px-2 py-1 text-xs text-neutral-200">Inactivate</button> : row.status === "INACTIVE" ? <button type="button" onClick={() => void updateStatus(row.id, "ACTIVE")} className="rounded-lg border border-neutral-700 px-2 py-1 text-xs text-neutral-200">Activate</button> : null}{row.status !== "DELETED" ? <button type="button" onClick={() => void deleteGroup(row.id)} className="rounded-lg border border-rose-900/80 px-2 py-1 text-xs text-rose-200">Delete</button> : null}</div></td>
                  </tr>
                )) : <tr><td className="py-4 text-neutral-500" colSpan={6}>No groups found.</td></tr>}
              </tbody>
            </table>
          </div>
          <MenuPaginationControls page={page} pageSize={pageSize} total={total} hasPrev={hasPrev} hasNext={hasNext} onPrev={() => void loadRows(city, tab, q, page - 1, pageSize)} onNext={() => void loadRows(city, tab, q, page + 1, pageSize)} onPageSizeChange={(value) => void loadRows(city, tab, q, 1, value)} />
        </div>
      </section>
    </div>
  );
}
