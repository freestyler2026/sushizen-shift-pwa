// src/app/admin/baseroll-prep/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  INPUT_CLASS,
  TAB_ACTIVE,
  TAB_INACTIVE,
  T_PAGE_TITLE,
} from "@/lib/ui-tokens";

// ─── Types ────────────────────────────────────────────────────────────────────

type RollQty = { roll: string; qty_raw: number; qty_prep: number };
type MatchedProduct = { name: string; daily_qty: number };
type StoreResult = {
  store: string;
  reference_date: string;
  total_orders: number;
  lunch_orders: number;
  lunch_ratio: number;
  dinner_orders: number;
  dinner_ratio: number;
  matched_products: MatchedProduct[];
  lunch: RollQty[];
  dinner: RollQty[];
};
type ApiResult = {
  ok: boolean;
  prep_date: string;
  reference_date: string;
  stores: StoreResult[];
};

type MapRow = {
  id: number;
  product_name: string;
  base_roll_name: string;
  coefficient: number;
  is_active: boolean;
  notes: string;
  updated_at: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(s: string, n: number) {
  const d = new Date(s + "T00:00:00");
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

function fmtDate(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const auth = getAuth();
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(getAuthHeaders(auth) ?? {}),
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Roll colour map ──────────────────────────────────────────────────────────

const ROLL_COLORS: Record<string, string> = {
  "California Base Roll":                   "bg-yellow-500/20 text-yellow-200 border-yellow-500/30",
  "Cucumber Crabstick Mayo Roll":           "bg-emerald-500/20 text-emerald-200 border-emerald-500/30",
  "Spicy Tuna & Quezo Base Roll":           "bg-rose-500/20 text-rose-200 border-rose-500/30",
  "Cucumber Crabstick & Mango Base Roll":   "bg-orange-500/20 text-orange-200 border-orange-500/30",
  "Shrimp Tempura Base Roll":               "bg-amber-500/20 text-amber-200 border-amber-500/30",
  "Crunchy Fish Base Roll":                 "bg-sky-500/20 text-sky-200 border-sky-500/30",
  "Crunchy Salmon Base Roll":               "bg-violet-500/20 text-violet-200 border-violet-500/30",
  "Crabstick Upo Base Roll":                "bg-teal-500/20 text-teal-200 border-teal-500/30",
  "Philadelphia Base Roll":                 "bg-indigo-500/20 text-indigo-200 border-indigo-500/30",
};

const BASE_ROLL_OPTIONS = [
  "California Base Roll",
  "Cucumber Crabstick Mayo Roll",
  "Spicy Tuna & Quezo Base Roll",
  "Cucumber Crabstick & Mango Base Roll",
  "Shrimp Tempura Base Roll",
  "Crunchy Fish Base Roll",
  "Crunchy Salmon Base Roll",
  "Crabstick Upo Base Roll",
  "Philadelphia Base Roll",
];

function rollColor(name: string) {
  return ROLL_COLORS[name] ?? "bg-neutral-500/20 text-neutral-200 border-neutral-500/30";
}

// ─── Sub-components: Prep Tab ─────────────────────────────────────────────────

function SessionTable({ label, emoji, rows }: { label: string; emoji: string; rows: RollQty[] }) {
  if (rows.length === 0) return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 text-xs text-neutral-500">
      {emoji} {label} — No data
    </div>
  );
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/8 bg-white/[0.04] px-4 py-2.5">
        <span className="text-sm font-semibold text-white">{emoji} {label}</span>
        <span className="ml-auto text-xs text-neutral-500">{rows.length} rolls</span>
      </div>
      <div className="divide-y divide-white/5">
        {rows.map((r) => (
          <div key={r.roll} className="flex items-center justify-between px-4 py-2.5">
            <span className={`inline-flex items-center rounded-lg border px-2.5 py-0.5 text-xs font-medium ${rollColor(r.roll)}`}>
              {r.roll}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-neutral-500">{r.qty_raw} × 0.9 =</span>
              <span className="min-w-[2.5rem] rounded-lg bg-violet-600 px-3 py-1 text-center text-sm font-bold text-white tabular-nums">
                {r.qty_prep}
              </span>
              <span className="text-xs text-neutral-400">pcs</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StoreCard({ s }: { s: StoreResult }) {
  const [open, setOpen] = useState(true);
  const lunchPct = Math.round(s.lunch_ratio * 100);
  const dinnerPct = Math.round(s.dinner_ratio * 100);

  return (
    <div className={`${GLASS_CARD} overflow-hidden p-0`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 border-b border-white/10 bg-white/[0.04] px-5 py-3.5 text-left hover:bg-white/[0.07] transition"
      >
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-violet-500/20 px-3 py-0.5 text-sm font-bold text-violet-200">
            🏪 {s.store}
          </span>
          <span className="text-xs text-neutral-400">Ref: {fmtDate(s.reference_date)}</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-neutral-400">
          <span>🕐 Lunch {lunchPct}%</span>
          <span>🌙 Dinner {dinnerPct}%</span>
          <span className="text-neutral-600">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div className="space-y-4 p-4">
          {/* Order distribution bar */}
          <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3">
            <p className="mb-2 text-xs font-semibold text-neutral-400">Order time distribution (same day last week)</p>
            <div className="flex h-3 overflow-hidden rounded-full bg-white/10">
              <div className="bg-sky-500/70" style={{ width: `${lunchPct}%` }} title={`Lunch ${lunchPct}%`} />
              <div className="bg-violet-500/70" style={{ width: `${dinnerPct}%` }} title={`Dinner ${dinnerPct}%`} />
            </div>
            <div className="mt-1.5 flex gap-4 text-[10px] text-neutral-500">
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-sky-500/70" />Lunch 11–14h: {s.lunch_orders} orders ({lunchPct}%)</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-violet-500/70" />Dinner 17–22h: {s.dinner_orders} orders ({dinnerPct}%)</span>
              <span className="ml-auto">Total: {s.total_orders} orders</span>
            </div>
          </div>

          {/* Lunch / Dinner base roll tables */}
          <div className="grid gap-4 lg:grid-cols-2">
            <SessionTable label="Lunch Prep (×0.9)" emoji="🕐" rows={s.lunch} />
            <SessionTable label="Dinner Prep (×0.9)" emoji="🌙" rows={s.dinner} />
          </div>

          {/* Matched products detail (collapsible) */}
          {s.matched_products.length > 0 && (
            <details className="rounded-xl border border-white/8 bg-white/[0.02]">
              <summary className="cursor-pointer px-4 py-2.5 text-xs text-neutral-500 hover:text-neutral-300">
                📋 Products used in calculation ({s.matched_products.length} items)
              </summary>
              <div className="divide-y divide-white/5 px-4 pb-3">
                {s.matched_products.map((p) => (
                  <div key={p.name} className="flex items-center justify-between py-1.5 text-xs">
                    <span className="text-neutral-300">{p.name}</span>
                    <span className="text-neutral-500">{p.daily_qty} pcs</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components: Settings Tab ─────────────────────────────────────────────

const EMPTY_FORM = { product_name: "", base_roll_name: BASE_ROLL_OPTIONS[0], coefficient: "1.0", notes: "" };

function MappingSettings() {
  const [rows, setRows] = useState<MapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<number | "new" | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_FORM);
  const [addError, setAddError] = useState("");

  const [edits, setEdits] = useState<Record<number, { coefficient: string; notes: string }>>({});

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<{ ok: boolean; items: MapRow[] }>(
        "/api/admin/analytics/manila/baseroll-map"
      );
      setRows(data.items);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load mappings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadRows(); }, [loadRows]);

  const grouped = useMemo(() => {
    const map: Record<string, MapRow[]> = {};
    for (const r of rows) {
      if (!map[r.product_name]) map[r.product_name] = [];
      map[r.product_name].push(r);
    }
    return map;
  }, [rows]);

  const handleToggle = async (row: MapRow) => {
    setSaving(row.id);
    try {
      await apiFetch(`/api/admin/analytics/manila/baseroll-map/${row.id}/toggle?is_active=${!row.is_active}`, {
        method: "PATCH",
      });
      setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, is_active: !r.is_active } : r));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (row: MapRow) => {
    if (!confirm(`Delete mapping: "${row.product_name}" → "${row.base_roll_name}"?`)) return;
    setSaving(row.id);
    try {
      await apiFetch(`/api/admin/analytics/manila/baseroll-map/${row.id}`, { method: "DELETE" });
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setSaving(null);
    }
  };

  const handleSaveEdit = async (row: MapRow) => {
    const edit = edits[row.id];
    if (!edit) return;
    const coeff = parseFloat(edit.coefficient);
    if (isNaN(coeff) || coeff < 0) { setError("Coefficient must be a number ≥ 0"); return; }
    setSaving(row.id);
    try {
      const data = await apiFetch<{ ok: boolean; item: MapRow }>(
        "/api/admin/analytics/manila/baseroll-map",
        {
          method: "POST",
          body: JSON.stringify({
            product_name: row.product_name,
            base_roll_name: row.base_roll_name,
            coefficient: coeff,
            is_active: row.is_active,
            notes: edit.notes,
          }),
        }
      );
      setRows((prev) => prev.map((r) => r.id === row.id ? data.item : r));
      setEdits((prev) => { const n = { ...prev }; delete n[row.id]; return n; });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(null);
    }
  };

  const handleAdd = async () => {
    setAddError("");
    const coeff = parseFloat(addForm.coefficient);
    if (!addForm.product_name.trim()) { setAddError("Product name is required"); return; }
    if (isNaN(coeff) || coeff < 0) { setAddError("Coefficient must be a number ≥ 0"); return; }
    setSaving("new");
    try {
      const data = await apiFetch<{ ok: boolean; item: MapRow }>(
        "/api/admin/analytics/manila/baseroll-map",
        {
          method: "POST",
          body: JSON.stringify({
            product_name: addForm.product_name.trim(),
            base_roll_name: addForm.base_roll_name,
            coefficient: coeff,
            is_active: true,
            notes: addForm.notes.trim(),
          }),
        }
      );
      setRows((prev) => {
        const idx = prev.findIndex(
          (r) => r.product_name === data.item.product_name && r.base_roll_name === data.item.base_roll_name
        );
        if (idx >= 0) {
          const n = [...prev];
          n[idx] = data.item;
          return n;
        }
        return [...prev, data.item];
      });
      setAddForm(EMPTY_FORM);
      setShowAdd(false);
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(null);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-neutral-500">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
        <p className="text-sm">Loading mappings…</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-400">
          Manage product → base roll coefficient mappings. Changes take effect on the next prep calculation.
        </p>
        <button
          type="button"
          onClick={() => { setShowAdd(true); setAddError(""); }}
          className={`${PRIMARY_BUTTON} text-sm`}
        >
          + Add
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-sm text-rose-300">
          ⚠️ {error}
          <button type="button" className="ml-3 text-xs underline" onClick={() => setError("")}>Dismiss</button>
        </div>
      )}

      {showAdd && (
        <div className={`${GLASS_CARD} space-y-3`}>
          <p className="text-sm font-semibold text-white">Add New Mapping</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-neutral-400">Product Name</label>
              <input
                className={INPUT_CLASS}
                placeholder="e.g. California Roll (8pcs)"
                value={addForm.product_name}
                onChange={(e) => setAddForm((f) => ({ ...f, product_name: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-neutral-400">Base Roll</label>
              <select
                className={INPUT_CLASS}
                value={addForm.base_roll_name}
                onChange={(e) => setAddForm((f) => ({ ...f, base_roll_name: e.target.value }))}
              >
                {BASE_ROLL_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-neutral-400">Coefficient (rolls per unit sold)</label>
              <input
                className={INPUT_CLASS}
                type="number"
                step="0.5"
                min="0"
                value={addForm.coefficient}
                onChange={(e) => setAddForm((f) => ({ ...f, coefficient: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-neutral-400">Notes (optional)</label>
              <input
                className={INPUT_CLASS}
                placeholder="Notes"
                value={addForm.notes}
                onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          {addError && <p className="text-xs text-rose-400">{addError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving === "new"}
              className={`${PRIMARY_BUTTON} text-sm`}
            >
              {saving === "new" ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => { setShowAdd(false); setAddForm(EMPTY_FORM); setAddError(""); }}
              className={`${SECONDARY_BUTTON} text-sm`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {Object.keys(grouped).length === 0 ? (
        <div className={`${GLASS_CARD} py-12 text-center text-sm text-neutral-500`}>
          No mappings found
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped).map(([product, pRows]) => (
            <div key={product} className={`${GLASS_CARD} overflow-hidden p-0`}>
              <div className="border-b border-white/10 bg-white/[0.04] px-4 py-2.5">
                <span className="text-sm font-semibold text-white">{product}</span>
                <span className="ml-2 text-xs text-neutral-500">{pRows.length} roll{pRows.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="divide-y divide-white/5">
                {pRows.map((row) => {
                  const isEditing = row.id in edits;
                  const editVal = edits[row.id];
                  const isBusy = saving === row.id;
                  return (
                    <div key={row.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${!row.is_active ? "opacity-50" : ""}`}>
                      <span className={`inline-flex items-center rounded-lg border px-2.5 py-0.5 text-xs font-medium ${rollColor(row.base_roll_name)}`}>
                        {row.base_roll_name}
                      </span>

                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-neutral-500">Coeff:</span>
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            className="w-20 rounded-lg border border-violet-500/40 bg-white/8 px-2 py-0.5 text-sm text-white outline-none focus:border-violet-500"
                            value={editVal.coefficient}
                            onChange={(e) => setEdits((prev) => ({ ...prev, [row.id]: { ...prev[row.id], coefficient: e.target.value } }))}
                          />
                        ) : (
                          <span
                            className="cursor-pointer rounded-lg bg-white/8 px-2.5 py-0.5 text-sm font-mono text-white hover:bg-white/12"
                            onClick={() => setEdits((prev) => ({ ...prev, [row.id]: { coefficient: String(row.coefficient), notes: row.notes } }))}
                            title="Click to edit"
                          >
                            {row.coefficient}
                          </span>
                        )}
                      </div>

                      {isEditing ? (
                        <input
                          className="flex-1 min-w-[120px] rounded-lg border border-white/10 bg-white/6 px-2 py-0.5 text-xs text-white outline-none focus:border-violet-500/50"
                          placeholder="Notes"
                          value={editVal.notes}
                          onChange={(e) => setEdits((prev) => ({ ...prev, [row.id]: { ...prev[row.id], notes: e.target.value } }))}
                        />
                      ) : (
                        row.notes && <span className="text-xs text-neutral-500 italic">{row.notes}</span>
                      )}

                      <div className="ml-auto flex items-center gap-2">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleSaveEdit(row)}
                              className="rounded-lg bg-violet-600 px-3 py-1 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                            >
                              {isBusy ? "…" : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEdits((prev) => { const n = { ...prev }; delete n[row.id]; return n; })}
                              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-400 hover:bg-white/10"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setEdits((prev) => ({ ...prev, [row.id]: { coefficient: String(row.coefficient), notes: row.notes } }))}
                            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-400 hover:bg-white/10 disabled:opacity-50"
                          >
                            Edit
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleToggle(row)}
                          className={`rounded-lg border px-3 py-1 text-xs disabled:opacity-50 transition ${
                            row.is_active
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                              : "border-neutral-500/30 bg-neutral-500/10 text-neutral-500 hover:bg-neutral-500/20"
                          }`}
                        >
                          {row.is_active ? "Active" : "Inactive"}
                        </button>

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDelete(row)}
                          className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-2 py-1 text-xs text-rose-400 hover:bg-rose-500/20 disabled:opacity-50"
                          title="Delete"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3 text-xs text-neutral-500">
        💡 Coefficient = number of base rolls used per unit sold. Example: coefficient 0.5 means 2 units sold = 1 roll used.
      </div>
    </div>
  );
}

// ─── Other Items Backup Reference ────────────────────────────────────────────

type OtherItem = { name: string; unit: string; standard: string };
type OtherSection = { label: string; emoji: string; items: OtherItem[] };

const OTHER_ITEMS_SECTIONS: OtherSection[] = [
  {
    label: "Condiments & Supplies", emoji: "🧴",
    items: [
      { name: "Soy Sauce",                    unit: "PC",  standard: "150+" },
      { name: "Wasabi",                        unit: "PC",  standard: "150+" },
      { name: "Ginger",                        unit: "PC",  standard: "150+" },
      { name: "Soy Sauce, Wasabi, Ginger Set", unit: "SET", standard: "30+" },
      { name: "Miso Soup",                     unit: "PC",  standard: "10+" },
      { name: "Sweet Sauce",                   unit: "PC",  standard: "10+" },
      { name: "Dumpling Sauce",                unit: "PC",  standard: "10+" },
    ],
  },
  {
    label: "Packaging", emoji: "📦",
    items: [
      { name: "Ice Pack",  unit: "PC", standard: "100+" },
      { name: "Box12 Set", unit: "PC", standard: "30+" },
      { name: "Box16 Set", unit: "PC", standard: "30+" },
      { name: "Box24 Set", unit: "PC", standard: "30+" },
    ],
  },
  {
    label: "Prepared Ingredients", emoji: "🥒",
    items: [
      { name: "Quezo Cheese Cut",          unit: "Container", standard: "50% of Container" },
      { name: "Crabstick Cut",             unit: "KG",        standard: "500G" },
      { name: "Cucumber Cut",              unit: "KG",        standard: "3KG" },
      { name: "Seasoned Upo",             unit: "Container", standard: "50% of Container" },
      { name: "Crabstick Mayo",            unit: "Container", standard: "75% of Container" },
      { name: "Spicy Tuna Chunk",          unit: "Container", standard: "75% of Container" },
      { name: "Mango Cut (For Base Roll)", unit: "Container", standard: "50% of Container" },
      { name: "Pickled Papaya",            unit: "Container", standard: "75% of Container" },
      { name: "Salmon Skin Mix",           unit: "Container", standard: "75% of Container" },
    ],
  },
  {
    label: "Toppings & Flakes", emoji: "🌿",
    items: [
      { name: "Spring Onion",               unit: "Container", standard: "75% of Container" },
      { name: "Crabstick Mayo for Topping", unit: "Container", standard: "50% of Container" },
      { name: "Salmon Skin Mix for Topping",unit: "Container", standard: "50% of Container" },
      { name: "Cheese Dice Cut",            unit: "Container", standard: "25% of Container" },
      { name: "Mango Cube",                 unit: "Container", standard: "25% of Container" },
      { name: "Spicy Tuna Mix",             unit: "Container", standard: "25% of Container" },
      { name: "Red Chili Cut",              unit: "Container", standard: "25% of Container" },
      { name: "Mint Leaves",                unit: "Container", standard: "25% of Container" },
      { name: "Onion Leeks",                unit: "Container", standard: "25% of Container" },
      { name: "Tempura Flakes White",       unit: "Container", standard: "75% of Container" },
      { name: "Tempura Flakes Orange",      unit: "Container", standard: "75% of Container" },
      { name: "Tempura Flakes Red",         unit: "Container", standard: "75% of Container" },
      { name: "Tempura Flakes Yellow",      unit: "Container", standard: "50% of Container" },
      { name: "Tempura Flakes Pink",        unit: "Container", standard: "50% of Container" },
      { name: "Fried Dumplings",            unit: "Container", standard: "75% of Container" },
      { name: "Shichimi Powder",            unit: "Container", standard: "50% of Container" },
      { name: "All Sauces",                 unit: "Container", standard: "75% of Squeeze Bottle" },
    ],
  },
  {
    label: "Hot Section", emoji: "🔥",
    items: [
      { name: "Spring Onion",              unit: "Container",       standard: "50% of Container" },
      { name: "Seasoned Egg",              unit: "PC",              standard: "10 PC" },
      { name: "Kikurage",                  unit: "Container",       standard: "50% of Container" },
      { name: "Fried Camote",              unit: "Container",       standard: "50% of Container" },
      { name: "Boiled Cabbage",            unit: "Container",       standard: "50% of Container" },
      { name: "Boiled Beansprout",         unit: "Container",       standard: "50% of Container" },
      { name: "Boiled Carrot",             unit: "Container",       standard: "50% of Container" },
      { name: "Sliced Onion",              unit: "Container",       standard: "50% of Container" },
      { name: "Bok Choy",                  unit: "Container",       standard: "50% of Container" },
      { name: "Bamboo Shoot",              unit: "Container",       standard: "50% of Container" },
      { name: "Sweet Corn",                unit: "Container",       standard: "50% of Container" },
      { name: "Kurodama (Black Mince)",    unit: "Container",       standard: "50% of Container" },
      { name: "Akadama (Red Mince)",       unit: "Container",       standard: "50% of Container" },
      { name: "Shredded Cabbage for Bento",unit: "Container",       standard: "75% of Container" },
      { name: "Chopped Leeks",             unit: "Container",       standard: "25% of Container" },
      { name: "Baguio Beans",              unit: "Container",       standard: "25% of Container" },
      { name: "Benishoga (Red Ginger)",    unit: "Container",       standard: "25% of Container" },
      { name: "Fried Garlic",              unit: "Small Container", standard: "25% of Container" },
      { name: "Wakame",                    unit: "Container",       standard: "Small Container Half" },
    ],
  },
];

function OtherItemsSectionCard({ section }: { section: OtherSection }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
      >
        <span className="text-sm font-semibold text-white">
          {section.emoji} {section.label}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-neutral-500">{section.items.length} items</span>
          <span className="text-neutral-600 text-xs">{open ? "▲" : "▼"}</span>
        </div>
      </button>
      {open && (
        <div className="border-t border-white/8 px-4 py-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
            {section.items.map((item) => (
              <div key={item.name} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5">
                <span className="text-xs text-neutral-300 truncate flex-1" title={item.name}>{item.name}</span>
                <span className="shrink-0 rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-300 tabular-nums">
                  {item.standard}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OtherItemsChecklist() {
  const [open, setOpen] = useState(true);
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3"
      >
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-white">📋 Other Items Backup</h2>
          <span className="text-xs text-neutral-500">— minimum standards reference</span>
        </div>
        <span className="text-xs text-neutral-500">{open ? "Collapse ▲" : "Expand ▼"}</span>
      </button>
      {open && (
        <div className="space-y-2">
          {OTHER_ITEMS_SECTIONS.map((sec) => (
            <OtherItemsSectionCard key={sec.label} section={sec} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BaserollPrepPage() {
  const [tab, setTab] = useState<"prep" | "settings">("prep");
  const [prepDate, setPrepDate] = useState(localDateStr(new Date()));
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refDate = useMemo(() => addDays(prepDate, -7), [prepDate]);

  const fetchPrep = useCallback(async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await apiFetch<ApiResult>(
        `/api/admin/analytics/manila/baseroll-prep?prep_date=${prepDate}`
      );
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [prepDate]);

  // Auto-load prep on mount
  useEffect(() => { void fetchPrep(); }, [fetchPrep]);

  const hasData = result && result.stores.length > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className={T_PAGE_TITLE}>🍣 Base Roll Prep Instructions</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Automatically calculates base roll prep quantities for lunch and dinner based on the previous week&apos;s same-day sales
          </p>
        </div>
        <Link href="/admin" className="text-xs text-neutral-500 hover:text-neutral-300">
          ← Admin
        </Link>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-2">
        <button type="button" onClick={() => setTab("prep")} className={tab === "prep" ? TAB_ACTIVE : TAB_INACTIVE}>
          🍱 Prep Calculator
        </button>
        <button type="button" onClick={() => setTab("settings")} className={tab === "settings" ? TAB_ACTIVE : TAB_INACTIVE}>
          ⚙️ Mapping Settings
        </button>
      </div>

      {/* ── Prep Tab ── */}
      {tab === "prep" && (
        <div className="space-y-6">
          <div className={`${GLASS_CARD} flex flex-wrap items-end gap-4`}>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-neutral-400">Prep Date</label>
              <input
                type="date"
                value={prepDate}
                onChange={(e) => setPrepDate(e.target.value)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-neutral-500">Reference Date (same day last week)</span>
              <span className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-neutral-300">
                {fmtDate(refDate)}
              </span>
            </div>
            <button
              type="button"
              onClick={fetchPrep}
              disabled={loading}
              className={`${PRIMARY_BUTTON} min-w-[140px]`}
            >
              {loading ? "Calculating…" : "🔄 Calculate"}
            </button>
          </div>

          <div className="rounded-xl border border-sky-500/20 bg-sky-950/20 px-4 py-3 text-xs text-sky-300">
            💡 Formula: previous week same-day product sales × session order ratio × 0.9 (rounded)<br />
            <span className="text-sky-400/70">Lunch = orders 11–14h / total orders &nbsp;·&nbsp; Dinner = orders 17–22h / total orders</span>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-sm text-rose-300">
              ⚠️ {error}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-16 text-neutral-500">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
                <p className="text-sm">Fetching data…</p>
              </div>
            </div>
          )}

          {!loading && result && !hasData && (
            <div className={`${GLASS_CARD} flex flex-col items-center py-16 text-center`}>
              <div className="mb-3 text-4xl">📭</div>
              <p className="text-sm font-medium text-neutral-300">
                No Manila sales data found for {fmtDate(refDate)}
              </p>
              <p className="mt-1 text-xs text-neutral-500">Please select a different date</p>
            </div>
          )}

          {!loading && hasData && (
            <div className="space-y-4">
              {result!.stores.map((s) => (
                <StoreCard key={s.store} s={s} />
              ))}
            </div>
          )}

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-white/8" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-600">Other Items</span>
            <div className="h-px flex-1 bg-white/8" />
          </div>

          <OtherItemsChecklist />
        </div>
      )}

      {/* ── Settings Tab ── */}
      {tab === "settings" && <MappingSettings />}
    </div>
  );
}
