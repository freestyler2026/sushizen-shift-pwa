"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MenuImportFailures from "@/components/menu/MenuImportFailures";
import MenuPaginationControls from "@/components/menu/MenuPaginationControls";
import { canAccessMenuAdmin, getAuth, refreshAuthFromApi, type City } from "@/lib/auth";
import { menuGet, menuGetText, menuPatch, menuPost } from "@/lib/menuClient";

type MenuTagRow = {
  id: string;
  city: string;
  name: string;
  name_localized: string;
  reference: string;
  color: string;
  status: string;
  sort_order: number;
  usage_count: number;
};

type PaginatedResponse<T> = {
  rows: T[];
  total: number;
  page: number;
  page_size: number;
  has_next: boolean;
  has_prev: boolean;
};

type ImportFailure = { row_number?: number; reason?: string };

const EMPTY_FORM = {
  name: "",
  name_localized: "",
  reference: "",
  color: "#A16207",
  sort_order: "0",
};

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

export default function MenuTagsPage() {
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
  const [rows, setRows] = useState<MenuTagRow[]>([]);
  const [tagFilterOptions, setTagFilterOptions] = useState<MenuTagRow[]>([]);
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
    return () => {
      cancelled = true;
    };
  }, [auth]);

  const loadRows = useCallback(async (nextCity = city, nextTab = tab, nextQ = q, nextPage = page, nextPageSize = pageSize) => {
    setLoading(true);
    setError("");
    try {
      const res = await menuGet<PaginatedResponse<MenuTagRow>>(
        `/api/admin/menu/tags?city=${encodeURIComponent(nextCity)}&tab=${encodeURIComponent(nextTab)}&q=${encodeURIComponent(nextQ)}&page=${encodeURIComponent(String(nextPage))}&page_size=${encodeURIComponent(String(nextPageSize))}&sort_by=sort_order&sort_dir=ASC`,
      );
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
    async function loadTagFilterOptions() {
      try {
        const res = await menuGet<PaginatedResponse<MenuTagRow>>(
          `/api/admin/menu/tags?city=${encodeURIComponent(city)}&tab=ALL&q=&page=1&page_size=500&sort_by=sort_order&sort_dir=ASC`,
        );
        if (!cancelled) setTagFilterOptions(res.rows || []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      }
    }
    void loadTagFilterOptions();
    return () => {
      cancelled = true;
    };
  }, [allowed, city, ready]);

  function resetForm() {
    setEditingId("");
    setForm(EMPTY_FORM);
  }

  async function saveTag() {
    if (!form.name.trim()) return setError("Please enter tag name.");
    setSaving(true);
    setError("");
    setSuccess("");
    setImportFailures([]);
    try {
      const payload = { name: form.name, name_localized: form.name_localized, reference: form.reference, color: form.color, sort_order: Number(form.sort_order || 0) };
      if (editingId) {
        await menuPatch(`/api/admin/menu/tags/${encodeURIComponent(editingId)}?city=${encodeURIComponent(city)}`, payload);
        setSuccess("Tag updated.");
      } else {
        await menuPost("/api/admin/menu/tags", { city, ...payload });
        setSuccess("Tag created.");
      }
      resetForm();
      await loadRows(city, tab, q, page, pageSize);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(tagId: string, status: "ACTIVE" | "INACTIVE") {
    setError("");
    setSuccess("");
    try {
      await menuPost(`/api/admin/menu/tags/${encodeURIComponent(tagId)}/status`, { city, status });
      setSuccess(`Tag marked ${status.toLowerCase()}.`);
      await loadRows(city, tab, q, page, pageSize);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  async function deleteTag(tagId: string) {
    if (!window.confirm("Delete this tag?")) return;
    setError("");
    setSuccess("");
    try {
      await menuPost(`/api/admin/menu/tags/${encodeURIComponent(tagId)}/delete?city=${encodeURIComponent(city)}`, {});
      if (editingId === tagId) resetForm();
      setSuccess("Tag deleted.");
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
      const text = await menuGetText(`/api/admin/menu/tags/export?city=${encodeURIComponent(city)}&tab=${encodeURIComponent(tab)}&q=${encodeURIComponent(q)}&sort_by=sort_order&sort_dir=ASC`);
      const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `menu-tags-${city}.csv`;
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
      const res = await menuPost<{ success_count: number; failed_count: number; failures?: ImportFailure[] }>(`/api/admin/menu/tags/import?city=${encodeURIComponent(city)}`, { csv_text: await file.text() });
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
      const res = await menuPost<{ success_count: number; failed_count: number }>(`/api/admin/menu/admin-tools/tags/bulk?city=${encodeURIComponent(city)}`, { action: bulkAction, ids: selectedIds, values });
      setSuccess(`Bulk action finished. Success: ${res.success_count || 0}, Failed: ${res.failed_count || 0}.`);
      await loadRows(city, tab, q, page, pageSize);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setWorking(false);
    }
  }

  if (!ready) return (
    <div className="flex items-center gap-3 text-sm text-zinc-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
      Loading tags...
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
          <h1 className="text-2xl font-semibold tracking-tight text-white">Tags</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            Manage menu tags for{" "}
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
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr,auto]">
          <div>
            <div className={LABEL}>Search</div>
            <select value={q} onChange={(e) => setQ(e.target.value)} className={SELECT}>
              <option value="">All tags</option>
              {tagFilterOptions.map((row) => (
                <option key={row.id} value={row.reference || row.name || ""}>
                  {row.name}{row.reference ? ` (${row.reference})` : ""}
                </option>
              ))}
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
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[380px,1fr]">

        {/* Form panel */}
        <div className={`${CARD} p-5`}>
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${editingId ? "bg-amber-400" : "bg-violet-400"}`} />
                <h2 className="text-sm font-semibold text-white">{editingId ? "Edit Tag" : "New Tag"}</h2>
              </div>
              <p className="mt-0.5 text-xs text-zinc-500">
                {editingId ? "Editing existing tag" : "Fill in the fields below"}
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
                  <div className={LABEL}>Name *</div>
                  <input value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} className={INPUT} />
                </div>
                <div>
                  <div className={LABEL}>Reference</div>
                  <input value={form.reference} onChange={(e) => setForm((current) => ({ ...current, reference: e.target.value }))} className={INPUT} />
                </div>
              </div>
            </div>

            {/* Appearance */}
            <div className="rounded-xl border border-white/6 bg-white/3 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-violet-400 mb-3 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-pink-400" />
                Appearance
              </div>
              <div className="space-y-3">
                <div>
                  <div className={LABEL}>Color</div>
                  <div className="flex items-center gap-2">
                    <input value={form.color} onChange={(e) => setForm((current) => ({ ...current, color: e.target.value }))} className={INPUT} />
                    <span style={{ backgroundColor: form.color }} className="h-6 w-6 rounded-full border border-white/20 inline-block flex-shrink-0" />
                  </div>
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
            onClick={() => void saveTag()}
            disabled={saving}
            className="mt-4 w-full rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving..." : editingId ? "Save Changes" : "Create Tag"}
          </button>
        </div>

        {/* Table panel */}
        <div className={`${CARD} p-5`}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-white">Tags</h2>
            <span className="text-xs text-zinc-500">{total} total</span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-white/8">
                  <th className="pb-2.5 pr-4 text-left"><input type="checkbox" checked={rows.length > 0 && selectedIds.length === rows.length} onChange={toggleAll} className="accent-violet-500" /></th>
                  <th className="pb-2.5 pr-4 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Tag</th>
                  <th className="pb-2.5 pr-4 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Color</th>
                  <th className="pb-2.5 pr-4 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Sort</th>
                  <th className="pb-2.5 pr-4 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Usage</th>
                  <th className="pb-2.5 pr-4 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Status</th>
                  <th className="pb-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td className="py-6 text-sm text-zinc-500" colSpan={7}>Loading tags...</td></tr>
                ) : rows.length ? rows.map((row) => (
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
                      <div className="mt-0.5 text-xs text-zinc-500">{row.name_localized || row.reference || "-"}</div>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-2.5 py-1 text-xs text-zinc-200">
                        <span className="inline-block h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: row.color || "#A16207" }} />
                        {row.color || "#A16207"}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <input
                        value={sortDrafts[row.id] ?? String(row.sort_order ?? 0)}
                        onChange={(e) => setSortDrafts((current) => ({ ...current, [row.id]: e.target.value }))}
                        className="w-14 rounded-lg border border-white/10 bg-white/6 px-2 py-1 text-center text-xs text-zinc-200"
                      />
                    </td>
                    <td className="py-3 pr-4 text-zinc-300">{Number(row.usage_count || 0)}</td>
                    <td className="py-3 pr-4"><span className={statusBadge(row.status)}>{row.status}</span></td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => { setEditingId(row.id); setForm({ name: row.name || "", name_localized: row.name_localized || "", reference: row.reference || "", color: row.color || "#A16207", sort_order: String(row.sort_order ?? 0) }); }}
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
                            onClick={() => void deleteTag(row.id)}
                            className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-300 hover:bg-red-500/20"
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )) : <tr><td className="py-6 text-sm text-zinc-500" colSpan={7}>No tags found.</td></tr>}
              </tbody>
            </table>
          </div>

          <MenuPaginationControls page={page} pageSize={pageSize} total={total} hasPrev={hasPrev} hasNext={hasNext} onPrev={() => void loadRows(city, tab, q, page - 1, pageSize)} onNext={() => void loadRows(city, tab, q, page + 1, pageSize)} onPageSizeChange={(value) => void loadRows(city, tab, q, 1, value)} />
        </div>
      </div>
    </div>
  );
}
