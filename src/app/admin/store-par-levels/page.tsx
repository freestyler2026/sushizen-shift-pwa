"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Pencil, Trash2, RefreshCw, Search } from "lucide-react";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  DANGER_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  T_PAGE_TITLE,
  TAB_ACTIVE,
  TAB_INACTIVE,
  BADGE_INFO,
} from "@/lib/ui-tokens";
import { getAuthHeaders } from "@/lib/auth";
import { API_BASE } from "@/lib/api";

const STORES = ["PAR", "CUB", "TAFT"] as const;
type Store = (typeof STORES)[number];

const STORE_LABELS: Record<Store, string> = {
  PAR: "Paranaque",
  CUB: "Cubao",
  TAFT: "Taft",
};

interface CatalogItem {
  id: number;
  store: Store;
  item_code: string;
  item_name: string;
  category: string;
  unit: string;
  par_level: number;
  supplier_name: string;
  is_active: boolean;
  notes: string | null;
}

const EMPTY_FORM = {
  item_code: "",
  item_name: "",
  category: "VEGETABLES",
  unit: "kg",
  par_level: 0,
  supplier_name: "",
  is_active: true,
  notes: "",
};

const CATEGORIES = ["VEGETABLES", "SEAFOOD", "MEAT", "DAIRY", "DRY GOODS", "GENERAL"];
const UNITS = ["kg", "g", "pcs", "pack", "box", "bundle", "tray", "bag", "bottle", "can"];

export default function StoreParLevelsPage() {
  const [store, setStore] = useState<Store>("PAR");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterSupplier, setFilterSupplier] = useState("all");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/store-supplier/catalog/${store}`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      setError("Failed to load catalog.");
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => {
    load();
    setSearch("");
    setFilterSupplier("all");
  }, [load]);

  const suppliers = [...new Set(items.map((i) => i.supplier_name))].sort();

  const filtered = items.filter((i) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      i.item_name.toLowerCase().includes(q) ||
      i.item_code.toLowerCase().includes(q) ||
      i.supplier_name.toLowerCase().includes(q);
    const matchSupplier = filterSupplier === "all" || i.supplier_name === filterSupplier;
    return matchSearch && matchSupplier;
  });

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
    setError(null);
  }

  function openEdit(item: CatalogItem) {
    setEditingId(item.id);
    setForm({
      item_code: item.item_code,
      item_name: item.item_name,
      category: item.category,
      unit: item.unit,
      par_level: item.par_level,
      supplier_name: item.supplier_name,
      is_active: item.is_active,
      notes: item.notes ?? "",
    });
    setShowForm(true);
    setError(null);
  }

  async function handleSave() {
    if (!form.item_code.trim() || !form.item_name.trim() || !form.supplier_name.trim()) {
      setError("Item Code, Item Name, and Supplier are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/store-supplier/catalog/${store}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ ...form, par_level: Number(form.par_level) }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? "Save failed");
      }
      setShowForm(false);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await fetch(`${API_BASE}/api/admin/store-supplier/catalog/${store}/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      setDeleteConfirm(null);
      await load();
    } catch {
      setError("Delete failed.");
    }
  }

  const grouped: Record<string, CatalogItem[]> = {};
  for (const item of filtered) {
    (grouped[item.supplier_name] ??= []).push(item);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-violet-950/20 p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className={T_PAGE_TITLE}>Store Par Levels</h1>
          <button onClick={openCreate} className={PRIMARY_BUTTON + " flex items-center gap-2"}>
            <Plus className="h-4 w-4" /> Add Item
          </button>
        </div>

        {/* Store tabs */}
        <div className="flex gap-2 flex-wrap">
          {STORES.map((s) => (
            <button
              key={s}
              onClick={() => setStore(s)}
              className={store === s ? TAB_ACTIVE : TAB_INACTIVE}
            >
              {STORE_LABELS[s]}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className={GLASS_CARD + " p-4 flex flex-wrap gap-3 items-center"}>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input
              className={INPUT_CLASS + " pl-9"}
              placeholder="Search items…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className={SELECT_CLASS + " max-w-[200px]"}
            value={filterSupplier}
            onChange={(e) => setFilterSupplier(e.target.value)}
          >
            <option value="all">All Suppliers</option>
            {suppliers.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button onClick={load} className={SECONDARY_BUTTON + " flex items-center gap-2"} title="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <span className={BADGE_INFO}>{filtered.length} item{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
        )}

        {/* Item list grouped by supplier */}
        {loading ? (
          <div className="py-12 text-center text-zinc-500">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-zinc-500">
            No catalog items for {STORE_LABELS[store]}.{" "}
            <button onClick={openCreate} className="text-violet-400 hover:underline">Add the first item</button>.
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).sort().map(([supplier, supplierItems]) => (
              <div key={supplier} className={GLASS_CARD + " overflow-hidden"}>
                <div className="px-4 py-3 border-b border-white/5 bg-white/3">
                  <span className="font-semibold text-violet-300">{supplier}</span>
                  <span className="ml-2 text-xs text-zinc-500">{supplierItems.length} item{supplierItems.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/5">
                        <th className="px-4 py-2 text-left text-xs text-zinc-500 font-medium">Code</th>
                        <th className="px-4 py-2 text-left text-xs text-zinc-500 font-medium">Item Name</th>
                        <th className="px-4 py-2 text-left text-xs text-zinc-500 font-medium">Category</th>
                        <th className="px-4 py-2 text-right text-xs text-zinc-500 font-medium">Par Level</th>
                        <th className="px-4 py-2 text-left text-xs text-zinc-500 font-medium">Unit</th>
                        <th className="px-4 py-2 text-center text-xs text-zinc-500 font-medium">Active</th>
                        <th className="px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {supplierItems.map((item) => (
                        <tr key={item.id} className="border-b border-white/5 last:border-0 hover:bg-white/3 transition-colors">
                          <td className="px-4 py-2.5 text-xs text-zinc-400 font-mono">{item.item_code}</td>
                          <td className="px-4 py-2.5 text-white">{item.item_name}</td>
                          <td className="px-4 py-2.5 text-xs text-zinc-400">{item.category}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-amber-400 font-semibold tabular-nums">{item.par_level}</td>
                          <td className="px-4 py-2.5 text-xs text-zinc-400">{item.unit}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={item.is_active ? "text-emerald-400 text-xs" : "text-zinc-500 text-xs"}>
                              {item.is_active ? "Yes" : "No"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                onClick={() => openEdit(item)}
                                className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              {deleteConfirm === item.id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleDelete(item.id)}
                                    className="rounded-lg px-2 py-1 text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    onClick={() => setDeleteConfirm(null)}
                                    className="rounded-lg px-2 py-1 text-xs text-zinc-500 hover:text-white"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setDeleteConfirm(item.id)}
                                  className="rounded-lg p-1.5 text-zinc-600 hover:bg-red-500/15 hover:text-red-400 transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className={GLASS_CARD + " w-full max-w-lg space-y-4 p-6"}>
            <h2 className="text-lg font-semibold text-white">
              {editingId ? "Edit Catalog Item" : "Add Catalog Item"} — {STORE_LABELS[store]}
            </h2>

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Item Code *</label>
                <input
                  className={INPUT_CLASS}
                  placeholder="e.g. VEG-001"
                  value={form.item_code}
                  onChange={(e) => setForm((f) => ({ ...f, item_code: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Category</label>
                <select
                  className={SELECT_CLASS}
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                >
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs text-zinc-400">Item Name *</label>
                <input
                  className={INPUT_CLASS}
                  placeholder="e.g. Romaine Lettuce"
                  value={form.item_name}
                  onChange={(e) => setForm((f) => ({ ...f, item_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Par Level</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  className={INPUT_CLASS}
                  value={form.par_level}
                  onChange={(e) => setForm((f) => ({ ...f, par_level: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Unit</label>
                <select
                  className={SELECT_CLASS}
                  value={form.unit}
                  onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                >
                  {UNITS.map((u) => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs text-zinc-400">Supplier *</label>
                <input
                  className={INPUT_CLASS}
                  placeholder="e.g. Three-S"
                  value={form.supplier_name}
                  onChange={(e) => setForm((f) => ({ ...f, supplier_name: e.target.value }))}
                />
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs text-zinc-400">Notes</label>
                <input
                  className={INPUT_CLASS}
                  placeholder="Optional"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <div className="col-span-2 flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                  className="h-4 w-4 accent-violet-500"
                />
                <label htmlFor="is_active" className="text-sm text-zinc-300 cursor-pointer">Active (included in auto-generation)</label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowForm(false)} className={SECONDARY_BUTTON}>Cancel</button>
              <button onClick={handleSave} disabled={saving} className={PRIMARY_BUTTON}>
                {saving ? "Saving…" : "Save Item"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
