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

const CARD = "rounded-2xl border border-white/10 bg-white/5 shadow-xl shadow-black/20 backdrop-blur-sm";
const INPUT = "w-full rounded-xl border border-white/10 bg-white/6 px-3.5 py-2 text-sm text-white placeholder:text-zinc-500 outline-none transition-all duration-200 focus:border-violet-500/50 focus:bg-white/10 focus:ring-2 focus:ring-violet-500/20";
const SELECT = "w-full appearance-none cursor-pointer rounded-xl border border-white/10 bg-white/6 px-3.5 py-2 text-sm text-white outline-none transition-all duration-200 focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20";
const LABEL = "text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 mb-1.5 block";

function statusBadge(status: string) {
  const map: Record<string, string> = {
    ACTIVE: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400",
    INACTIVE: "bg-amber-500/15 border-amber-500/30 text-amber-400",
    DELETED: "bg-red-500/15 border-red-500/30 text-red-400",
  };
  return `inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${map[status] ?? "bg-zinc-800 border-zinc-700 text-zinc-400"}`;
}

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
  const [optionFilterOptions, setOptionFilterOptions] = useState<ModifierOptionRow[]>([]);
  const [groups, setGroups] = useState<ModifierGroupRow[]>([]);
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

  useEffect(() => {
    if (!ready || !allowed) return;
    let cancelled = false;
    async function loadOptionFilterOptions() {
      try {
        const res = await menuGet<PaginatedResponse<ModifierOptionRow>>(
          `/api/admin/menu/modifier-options?city=${encodeURIComponent(city)}&tab=ALL&q=&modifier_group_id=&page=1&page_size=500&sort_by=sort_order&sort_dir=ASC`,
        );
        if (!cancelled) setOptionFilterOptions(res.rows || []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      }
    }
    void loadOptionFilterOptions();
    return () => {
      cancelled = true;
    };
  }, [allowed, city, ready]);

  const visibleOptionFilterOptions = useMemo(
    () => optionFilterOptions.filter((row) => !groupFilter || row.modifier_group_id === groupFilter),
    [groupFilter, optionFilterOptions],
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
    setForm({ ...EMPTY_FORM, modifier_group_id: groups[0]?.id || "", sku: suggestedSku });
  }

  async function saveOption() {
    if (!form.modifier_group_id) return setError("Please select modifier group.");
    if (!form.name.trim()) return setError("Please enter modifier option name.");
    setSaving(true);
    setError("");
    setSuccess("");
    setImportFailures([]);
    try {
      const payload = { city, modifier_group_id: form.modifier_group_id, name: form.name, barcode: form.barcode, sku: form.sku, description: form.description, price_delta: Number(form.price_delta || 0), costing_method: form.costing_method, fixed_cost: Number(form.fixed_cost || 0), tax_group_id: form.tax_group_id, calories: Number(form.calories || 0), sort_order: Number(form.sort_order || 0) };
      if (editingId) {
        const res = await menuPatch<{ row?: ModifierOptionRow }>(`/api/admin/menu/modifier-options/${encodeURIComponent(editingId)}?city=${encodeURIComponent(city)}`, payload);
        setSuccess(`Modifier option updated. SKU: ${res.row?.sku || form.sku || "-"}.`);
        resetForm();
      } else {
        const res = await menuPost<{ row?: ModifierOptionRow }>("/api/admin/menu/modifier-options", payload);
        setSuccess(`Modifier option created. SKU: ${res.row?.sku || "-"}.`);
        const nextSkuRes = await menuGet<{ sku?: string }>(`/api/admin/menu/sku/next?city=${encodeURIComponent(city)}`);
        const nextSku = nextSkuRes.sku || "";
        setSuggestedSku(nextSku);
        setEditingId("");
        setForm({ ...EMPTY_FORM, modifier_group_id: groups[0]?.id || "", sku: nextSku });
      }
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
    if (!window.confirm("Delete this modifier option?")) return;
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

  if (!ready) return (
    <div className="flex items-center gap-3 text-sm text-zinc-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
      Loading modifier options...
    </div>
  );
  if (!allowed) return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-400">
      You do not have permission to open Menu Builder.
    </div>
  );

  return (
    <div className="space-y-5">

      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Modifier Options</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            Manage modifier options for{" "}
            <span className="font-medium text-violet-300">{city === "dubai" ? "Dubai" : "Manila"}</span>
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          {(["manila", "dubai"] as City[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCity(c)}
              className={[
                "rounded-lg px-4 py-1.5 text-sm font-medium capitalize transition-all duration-200",
                city === c ? "bg-violet-500/25 text-violet-200 shadow-sm" : "text-zinc-400 hover:text-zinc-200",
              ].join(" ")}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total", value: total, color: "text-white" },
          { label: "Showing", value: rows.length, color: "text-zinc-300" },
          { label: "Selected", value: selectedIds.length, color: selectedIds.length ? "text-violet-300" : "text-zinc-600" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-white/8 bg-white/5 px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</div>
            <div className={`mt-1 text-xl font-bold tabular-nums ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Filter toolbar */}
      <div className={`${CARD} p-4`}>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr,1fr,auto]">
          <div>
            <div className={LABEL}>Search</div>
            <select value={q} onChange={(e) => setQ(e.target.value)} className={SELECT}>
              <option value="">All options</option>
              {visibleOptionFilterOptions.map((row) => (
                <option key={row.id} value={row.sku || row.barcode || row.name || ""}>
                  {row.name}
                  {row.sku ? ` (${row.sku})` : row.barcode ? ` (${row.barcode})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className={LABEL}>Group Filter</div>
            <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className={SELECT}>
              <option value="">All Groups</option>
              {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </div>
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
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void importRows(file); }} />
            </div>
          </div>
        </div>

        {/* Status tabs + bulk */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/6 pt-3">
          <div className="flex items-center gap-1 rounded-xl border border-white/8 bg-white/4 p-1">
            {["ALL", "ACTIVE", "INACTIVE", "DELETED"].map((value) => {
              const colors: Record<string, string> = {
                ALL: tab === value ? "bg-zinc-700/60 text-white" : "text-zinc-400 hover:text-zinc-200",
                ACTIVE: tab === value ? "bg-emerald-500/20 text-emerald-300" : "text-zinc-400 hover:text-emerald-300",
                INACTIVE: tab === value ? "bg-amber-500/20 text-amber-300" : "text-zinc-400 hover:text-amber-300",
                DELETED: tab === value ? "bg-red-500/20 text-red-300" : "text-zinc-400 hover:text-red-300",
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

      {/* Main: form + table */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[420px,1fr]">

        {/* Form panel */}
        <div className={`${CARD} p-5`}>
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${editingId ? "bg-amber-400" : "bg-violet-400"}`} />
                <h2 className="text-sm font-semibold text-white">{editingId ? "Edit Modifier Option" : "New Modifier Option"}</h2>
              </div>
              <p className="mt-0.5 text-xs text-zinc-500">
                {editingId ? "Editing existing option" : "Fill in the fields below"}
              </p>
            </div>
            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-white/10 bg-white/6 px-3 py-1.5 text-xs text-zinc-300 hover:border-violet-500/30"
              >
                + New
              </button>
            ) : null}
          </div>

          <div className="space-y-4">
            {/* Basic Info */}
            <div className="rounded-xl border border-white/6 bg-white/3 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-violet-400 mb-3 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
                Basic Info
              </div>
              <div className="space-y-3">
                <div>
                  <div className={LABEL}>Modifier Group *</div>
                  <select value={form.modifier_group_id} onChange={(e) => setForm((current) => ({ ...current, modifier_group_id: e.target.value }))} className={SELECT}>
                    <option value="">Select group</option>
                    {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                  </select>
                </div>
                <div>
                  <div className={LABEL}>Name *</div>
                  <input value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} className={INPUT} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className={LABEL}>SKU</div>
                    <input value={form.sku} onChange={(e) => setForm((current) => ({ ...current, sku: e.target.value.toUpperCase() }))} placeholder={suggestedSku || "Auto suggested SKU"} className={INPUT} />
                  </div>
                  <div>
                    <div className={LABEL}>Barcode</div>
                    <input value={form.barcode} onChange={(e) => setForm((current) => ({ ...current, barcode: e.target.value }))} className={INPUT} />
                  </div>
                </div>
              </div>
            </div>

            {/* Pricing */}
            <div className="rounded-xl border border-white/6 bg-white/3 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-violet-400 mb-3 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Pricing
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className={LABEL}>Price Delta</div>
                    <input value={form.price_delta} onChange={(e) => setForm((current) => ({ ...current, price_delta: e.target.value }))} className={INPUT} />
                  </div>
                  <div>
                    <div className={LABEL}>Fixed Cost</div>
                    <input value={form.fixed_cost} onChange={(e) => setForm((current) => ({ ...current, fixed_cost: e.target.value }))} className={INPUT} />
                  </div>
                </div>
                <div>
                  <div className={LABEL}>Costing Method</div>
                  <select value={form.costing_method} onChange={(e) => setForm((current) => ({ ...current, costing_method: e.target.value }))} className={SELECT}>
                    <option value="FIXED_COST">Fixed Cost</option>
                    <option value="FROM_INGREDIENTS">From Ingredients</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Details */}
            <div className="rounded-xl border border-white/6 bg-white/3 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-violet-400 mb-3 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                Details
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className={LABEL}>Calories</div>
                    <input value={form.calories} onChange={(e) => setForm((current) => ({ ...current, calories: e.target.value }))} className={INPUT} />
                  </div>
                  <div>
                    <div className={LABEL}>Tax Group ID</div>
                    <input value={form.tax_group_id} onChange={(e) => setForm((current) => ({ ...current, tax_group_id: e.target.value }))} className={INPUT} />
                  </div>
                </div>
                <div>
                  <div className={LABEL}>Description</div>
                  <textarea value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} rows={3} className={INPUT} />
                </div>
                <div>
                  <div className={LABEL}>Sort Order</div>
                  <input value={form.sort_order} onChange={(e) => setForm((current) => ({ ...current, sort_order: e.target.value }))} className={INPUT} />
                </div>
              </div>
            </div>
          </div>

          {error ? <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-xs text-red-300">{error}</div> : null}
          {success ? <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-300">{success}</div> : null}
          <MenuImportFailures failures={importFailures} />

          <button
            type="button"
            onClick={() => void saveOption()}
            disabled={saving}
            className="mt-4 w-full rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving..." : editingId ? "Save Changes" : "Create Modifier Option"}
          </button>
        </div>

        {/* Table panel */}
        <div className={`${CARD} p-5`}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-white">Modifier Options</h2>
            <span className="text-xs text-zinc-500">{total} total</span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-white/8">
                  <th className="pb-2.5 pr-4 text-left"><input type="checkbox" checked={rows.length > 0 && selectedIds.length === rows.length} onChange={toggleAll} className="accent-violet-500" /></th>
                  <th className="pb-2.5 pr-4 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Option</th>
                  <th className="pb-2.5 pr-4 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Group</th>
                  <th className="pb-2.5 pr-4 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Sort</th>
                  <th className="pb-2.5 pr-4 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Price Delta</th>
                  <th className="pb-2.5 pr-4 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Fixed Cost</th>
                  <th className="pb-2.5 pr-4 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Status</th>
                  <th className="pb-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td className="py-6 text-sm text-zinc-500" colSpan={8}>Loading modifier options...</td></tr>
                ) : rows.length ? rows.map((row) => {
                  const delta = Number(row.price_delta || 0);
                  const deltaPositive = delta >= 0;
                  return (
                    <tr
                      key={row.id}
                      className={[
                        "border-b border-white/5 align-top transition-colors hover:bg-white/4",
                        selectedIds.includes(row.id) ? "bg-violet-500/8" : "",
                      ].join(" ")}
                    >
                      <td className="py-3 pr-4"><input type="checkbox" checked={selectedIds.includes(row.id)} onChange={() => toggleRow(row.id)} className="accent-violet-500" /></td>
                      <td className="py-3 pr-4">
                        <div className="font-medium text-white">{row.name}</div>
                        <div className="mt-0.5 text-xs text-zinc-500">{row.sku || "-"}</div>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/6 px-2 py-0.5 text-xs text-zinc-300">
                          {row.modifier_group_name}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <input
                          value={sortDrafts[row.id] ?? String(row.sort_order ?? 0)}
                          onChange={(e) => setSortDrafts((current) => ({ ...current, [row.id]: e.target.value }))}
                          className="w-14 rounded-lg border border-white/10 bg-white/6 px-2 py-1 text-center text-xs text-zinc-200"
                        />
                      </td>
                      <td className="py-3 pr-4">
                        <span className={deltaPositive ? "text-emerald-400" : "text-amber-400"}>
                          {deltaPositive ? "+" : ""}{delta.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-zinc-400">{Number(row.fixed_cost || 0).toFixed(3)}</td>
                      <td className="py-3 pr-4"><span className={statusBadge(row.status)}>{row.status}</span></td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => { setEditingId(row.id); setForm({ modifier_group_id: row.modifier_group_id || "", name: row.name || "", name_localized: row.name_localized || "", sku: row.sku || "", barcode: row.barcode || "", image_url: row.image_url || "", description: row.description || "", price_delta: String(row.price_delta ?? 0), costing_method: row.costing_method || "FIXED_COST", fixed_cost: String(row.fixed_cost ?? 0), tax_group_id: row.tax_group_id || "", calories: String(row.calories ?? 0), sort_order: String(row.sort_order ?? 0) }); }}
                            className="rounded-lg border border-white/10 bg-white/6 px-2.5 py-1 text-xs font-medium text-zinc-200 hover:border-violet-500/30 hover:bg-violet-500/10"
                          >
                            Edit
                          </button>
                          {row.status === "ACTIVE" ? (
                            <button
                              type="button"
                              onClick={() => void updateStatus(row.id, "INACTIVE")}
                              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/20"
                            >
                              Off
                            </button>
                          ) : row.status === "INACTIVE" ? (
                            <button
                              type="button"
                              onClick={() => void updateStatus(row.id, "ACTIVE")}
                              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20"
                            >
                              On
                            </button>
                          ) : null}
                          {row.status !== "DELETED" ? (
                            <button
                              type="button"
                              onClick={() => void deleteOption(row.id)}
                              className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-300 hover:bg-red-500/20"
                            >
                              Delete
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                }) : <tr><td className="py-6 text-sm text-zinc-500" colSpan={8}>No modifier options found.</td></tr>}
              </tbody>
            </table>
          </div>
          <MenuPaginationControls page={page} pageSize={pageSize} total={total} hasPrev={hasPrev} hasNext={hasNext} onPrev={() => void loadAll(city, tab, q, groupFilter, page - 1, pageSize)} onNext={() => void loadAll(city, tab, q, groupFilter, page + 1, pageSize)} onPageSizeChange={(value) => void loadAll(city, tab, q, groupFilter, 1, value)} />
        </div>
      </div>
    </div>
  );
}
