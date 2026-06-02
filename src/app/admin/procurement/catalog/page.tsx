"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessProcurementAdmin, getAuth } from "@/lib/auth";
import { defaultProcurementName, defaultProcurementPin, procurementJson } from "@/lib/procurementClient";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  T_PAGE_TITLE,
  T_CARD_TITLE,
  T_LABEL,
  T_CAPTION,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_INFO,
} from "@/lib/ui-tokens";
import { RefreshCw, AlertCircle, CheckCircle, Search, Zap, Package, Plus } from "lucide-react";
import { useRouter } from "next/navigation";

type CatalogRow = {
  id: string;
  city: string;
  catalog_category: string;
  store_scope: string;
  supplier_name: string;
  sku: string;
  item_name: string;
  unit: string;
  unit_price: number;
  currency_code: string;
  sort_order: number;
  active: boolean;
  section: string;
  order_type: string;
  min_stock_qty: string;
  package_spec: string;
  fast_running: boolean;
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  CK: "Store → CK",
  WH: "Store → WH",
  Supplier: "Store → Supplier",
  CK_WH_to_supplier: "CK/WH → Supplier",
  "": "—",
};

const ORDER_TYPE_BADGE: Record<string, string> = {
  CK: "bg-blue-500/20 text-blue-300",
  WH: "bg-amber-500/20 text-amber-300",
  Supplier: "bg-violet-500/20 text-violet-300",
  CK_WH_to_supplier: "bg-emerald-500/20 text-emerald-300",
};

export default function ProcurementCatalogPage() {
  const router = useRouter();
  const auth = useMemo(() => getAuth(), []);
  const [allowed, setAllowed] = useState(false);
  const [requestedBy, setRequestedBy] = useState(defaultProcurementName());
  const [pin, setPin] = useState(defaultProcurementPin());
  const [city, setCity] = useState("manila");

  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Filters
  const [filterOrderType, setFilterOrderType] = useState("");
  const [filterStore, setFilterStore] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterFastRunning, setFilterFastRunning] = useState(false);
  const [activeOnly, setActiveOnly] = useState(true);

  // Edit modal
  const [editRow, setEditRow] = useState<CatalogRow | null>(null);
  const [editForm, setEditForm] = useState<Partial<CatalogRow>>({});
  const [saving, setSaving] = useState(false);

  // Supplier management tab
  const [suppliersTab, setSuppliersTab] = useState(false);
  const [suppliers, setSuppliers] = useState<{ supplier_name: string; active_count: number; inactive_count: number }[]>([]);
  const [suppliersBusy, setSuppliersBusy] = useState(false);
  const [renameModal, setRenameModal] = useState<{ old: string } | null>(null);
  const [renameTo, setRenameTo] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [deactivateConfirm, setDeactivateConfirm] = useState<string | null>(null);

  useEffect(() => {
    const role = auth?.role || "";
    if (canAccessProcurementAdmin(auth, "manila") || canAccessProcurementAdmin(auth, "dubai") || role === "HQ" || role === "ADMIN") {
      setAllowed(true);
    } else {
      router.replace("/week");
    }
  }, [auth, router]);

  const load = useCallback(async () => {
    if (!requestedBy || !pin) return;
    setBusy(true);
    setError("");
    try {
      const qs = new URLSearchParams({ city, active_only: activeOnly ? "true" : "false", limit: "5000" });
      const data = await procurementJson<{ rows: CatalogRow[]; categories: string[] }>(
        `/api/admin/procurement/catalog/curated?${qs}`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setCategories(Array.isArray(data?.categories) ? data.categories : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [requestedBy, pin, city, activeOnly]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  const filtered = useMemo(() => {
    const q = filterSearch.toLowerCase();
    return rows.filter((r) => {
      if (filterOrderType && r.order_type !== filterOrderType) return false;
      if (filterStore && r.store_scope !== filterStore && filterStore !== "ALL") return false;
      if (filterFastRunning && !r.fast_running) return false;
      if (!activeOnly && false) return false;
      if (q && !r.item_name.toLowerCase().includes(q) && !r.supplier_name.toLowerCase().includes(q) && !r.section.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, filterOrderType, filterStore, filterFastRunning, filterSearch, activeOnly]);

  const stores = useMemo(() => {
    const s = new Set(rows.map((r) => r.store_scope));
    return Array.from(s).sort();
  }, [rows]);

  const orderTypes = useMemo(() => {
    const s = new Set(rows.map((r) => r.order_type).filter(Boolean));
    return Array.from(s).sort();
  }, [rows]);

  const grouped = useMemo(() => {
    const map = new Map<string, CatalogRow[]>();
    for (const r of filtered) {
      const key = `${r.order_type}__${r.store_scope}__${r.catalog_category || r.section || "(Other)"}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const loadSuppliers = useCallback(async () => {
    if (!requestedBy || !pin) return;
    setSuppliersBusy(true);
    setError("");
    try {
      const qs = new URLSearchParams({ approver_name: requestedBy, pin, city });
      const data = await procurementJson<{ suppliers: { supplier_name: string; active_count: number; inactive_count: number }[] }>(
        `/api/admin/procurement/catalog/suppliers?${qs}`,
        { method: "GET" },
        requestedBy,
        pin,
      );
      setSuppliers(Array.isArray(data?.suppliers) ? data.suppliers : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSuppliersBusy(false);
    }
  }, [requestedBy, pin, city]);

  async function renameSupplier() {
    if (!renameModal || !renameTo.trim()) return;
    setRenameBusy(true);
    setError("");
    try {
      await procurementJson(
        "/api/admin/procurement/catalog/supplier/rename-global",
        {
          method: "POST",
          body: JSON.stringify({
            approver_name: requestedBy,
            pin,
            city,
            old_supplier_name: renameModal.old,
            new_supplier_name: renameTo.trim(),
          }),
        },
        requestedBy,
        pin,
      );
      setSuccessMsg(`Renamed "${renameModal.old}" → "${renameTo.trim()}"`);
      setRenameModal(null);
      setRenameTo("");
      await loadSuppliers();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRenameBusy(false);
    }
  }

  async function deactivateSupplier(supplierName: string) {
    setError("");
    try {
      await procurementJson(
        "/api/admin/procurement/catalog/supplier/deactivate",
        {
          method: "POST",
          body: JSON.stringify({ approver_name: requestedBy, pin, city, supplier_name: supplierName }),
        },
        requestedBy,
        pin,
      );
      setSuccessMsg(`All items from "${supplierName}" deactivated.`);
      setDeactivateConfirm(null);
      await loadSuppliers();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function openEdit(row: CatalogRow) {
    setEditRow(row);
    setEditForm({ ...row });
    setSuccessMsg("");
    setError("");
  }

  function openAddNew() {
    const blank: Partial<CatalogRow> = {
      id: "",
      city,
      catalog_category: "",
      store_scope: "ALL",
      supplier_name: "",
      sku: "",
      item_name: "",
      unit: "",
      unit_price: 0,
      currency_code: city === "dubai" ? "AED" : "PHP",
      sort_order: 0,
      active: true,
      section: "",
      order_type: "Supplier",
      min_stock_qty: "",
      package_spec: "",
      fast_running: false,
    };
    setEditRow({} as CatalogRow); // non-null sentinel to open modal
    setEditForm(blank);
    setSuccessMsg("");
    setError("");
  }

  async function saveEdit() {
    if (!editRow || !editForm.item_name) return;
    setSaving(true);
    setError("");
    try {
      await procurementJson(
        "/api/admin/procurement/catalog/curated/upsert",
        {
          method: "POST",
          body: JSON.stringify({
            approver_name: requestedBy,
            pin,
            rows: [{ ...editForm, city }],
          }),
        },
        requestedBy,
        pin,
      );
      setSuccessMsg(`"${editForm.item_name}" updated.`);
      setEditRow(null);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!allowed) return null;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={T_PAGE_TITLE}>Order Catalog</h1>
          <p className={T_CAPTION}>
            Master catalog of all items across store order types (CK, WH, Supplier, CK/WH→Supplier).
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={openAddNew} className={PRIMARY_BUTTON}>
            <Plus className="h-4 w-4" />
            Add Item
          </button>
          <button onClick={() => void load()} disabled={busy} className={SECONDARY_BUTTON}>
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Auth row */}
      <div className={`${GLASS_CARD} p-4`}>
        <div className="flex flex-wrap gap-3">
          <div>
            <label className={`${T_LABEL} mb-1 block`}>City</label>
            <select className={SELECT_CLASS} value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="manila">Manila</option>
              <option value="dubai">Dubai</option>
            </select>
          </div>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>Approver Name</label>
            <input className={INPUT_CLASS} value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Name" />
          </div>
          <div>
            <label className={`${T_LABEL} mb-1 block`}>PIN</label>
            <input className={INPUT_CLASS} type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" />
          </div>
          <div className="flex items-end">
            <button onClick={() => void load()} disabled={busy} className={PRIMARY_BUTTON}>
              {busy ? "Loading…" : "Load Catalog"}
            </button>
          </div>
        </div>
      </div>

      {/* Tab switcher */}
      {rows.length > 0 && (
        <div className="flex gap-1 border-b border-white/10 -mb-2">
          <button
            onClick={() => setSuppliersTab(false)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${!suppliersTab ? "border-violet-400 text-white" : "border-transparent text-zinc-400 hover:text-zinc-200"}`}
          >
            Catalog Items
          </button>
          <button
            onClick={() => { setSuppliersTab(true); void loadSuppliers(); }}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${suppliersTab ? "border-violet-400 text-white" : "border-transparent text-zinc-400 hover:text-zinc-200"}`}
          >
            Supplier Management
          </button>
        </div>
      )}

      {/* Stats */}
      {rows.length > 0 && !suppliersTab && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total Items", value: rows.length, icon: Package },
            { label: "Showing", value: filtered.length, icon: Search },
            { label: "Fast Running", value: rows.filter((r) => r.fast_running).length, icon: Zap },
            { label: "Categories", value: categories.length, icon: RefreshCw },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className={`${GLASS_CARD} flex items-center gap-3 p-4`}>
              <Icon className="h-5 w-5 text-violet-400 shrink-0" />
              <div>
                <p className="text-xl font-bold text-white">{value}</p>
                <p className={T_CAPTION}>{label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      {rows.length > 0 && !suppliersTab && (
        <div className={`${GLASS_CARD} p-4`}>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Order Type</label>
              <select className={SELECT_CLASS} value={filterOrderType} onChange={(e) => setFilterOrderType(e.target.value)}>
                <option value="">All types</option>
                {orderTypes.map((t) => (
                  <option key={t} value={t}>{ORDER_TYPE_LABELS[t] ?? t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={`${T_LABEL} mb-1 block`}>Store</label>
              <select className={SELECT_CLASS} value={filterStore} onChange={(e) => setFilterStore(e.target.value)}>
                <option value="">All stores</option>
                {stores.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-40">
              <label className={`${T_LABEL} mb-1 block`}>Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <input
                  className={`${INPUT_CLASS} pl-9`}
                  placeholder="Item name, supplier, section…"
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 pb-0.5">
              <input
                id="fr-filter"
                type="checkbox"
                checked={filterFastRunning}
                onChange={(e) => setFilterFastRunning(e.target.checked)}
                className="accent-violet-500"
              />
              <label htmlFor="fr-filter" className={`${T_LABEL} cursor-pointer`}>
                Fast Running only
              </label>
            </div>
            <div className="flex items-center gap-2 pb-0.5">
              <input
                id="active-filter"
                type="checkbox"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
                className="accent-violet-500"
              />
              <label htmlFor="active-filter" className={`${T_LABEL} cursor-pointer`}>
                Active only
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-500/10 px-4 py-3 text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl bg-green-500/10 px-4 py-3 text-green-300">
          <CheckCircle className="h-4 w-4 shrink-0" />
          {successMsg}
        </div>
      )}

      {/* ── Supplier Management panel ── */}
      {suppliersTab && (
        <div className={GLASS_CARD}>
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">Suppliers — {city === "dubai" ? "Dubai" : "Manila"}</h2>
            <button onClick={() => void loadSuppliers()} disabled={suppliersBusy} className={SECONDARY_BUTTON}>
              <RefreshCw className={`h-4 w-4 ${suppliersBusy ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
          {suppliersBusy ? (
            <p className="p-6 text-center text-zinc-400">Loading…</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left text-xs text-zinc-500">
                  <th className="px-4 py-2">Supplier Name</th>
                  <th className="px-3 py-2 text-right">Active Items</th>
                  <th className="px-3 py-2 text-right">Inactive</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.supplier_name} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-white">
                      {s.supplier_name === "(blank)" ? <span className="text-zinc-500 italic">(no supplier name)</span> : s.supplier_name}
                    </td>
                    <td className="px-3 py-2.5 text-right text-green-400">{s.active_count}</td>
                    <td className="px-3 py-2.5 text-right text-zinc-500">{s.inactive_count}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => { setRenameModal({ old: s.supplier_name }); setRenameTo(s.supplier_name); }}
                          className="rounded px-2 py-1 text-xs text-violet-400 hover:bg-violet-500/10 transition-colors"
                        >
                          Rename
                        </button>
                        {s.active_count > 0 && s.supplier_name !== "(blank)" && (
                          <button
                            onClick={() => setDeactivateConfirm(s.supplier_name)}
                            className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            Deactivate All
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className={`px-4 py-2 ${BADGE_INFO} text-xs rounded-none rounded-b-xl`}>
            💡 Rename merges the old name into the new one (all active + inactive items updated). Deactivate hides all items from order forms.
          </p>
        </div>
      )}

      {/* Catalog table grouped */}
      {!suppliersTab && grouped.length > 0 && grouped.map(([groupKey, groupRows]) => {
        const [orderType, storeScope, category] = groupKey.split("__");
        return (
          <div key={groupKey} className={GLASS_CARD}>
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${ORDER_TYPE_BADGE[orderType] ?? "bg-zinc-700 text-zinc-300"}`}>
                {ORDER_TYPE_LABELS[orderType] ?? orderType}
              </span>
              <span className="text-sm font-semibold text-white">{storeScope}</span>
              <span className="text-zinc-400">·</span>
              <span className="text-sm text-zinc-300">{category}</span>
              <span className={`ml-auto ${T_CAPTION}`}>{groupRows.length} items</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-left text-xs text-zinc-500">
                    <th className="px-4 py-2">Item Name</th>
                    <th className="px-3 py-2">Supplier</th>
                    <th className="px-3 py-2">Unit</th>
                    <th className="px-3 py-2">Unit Price</th>
                    <th className="px-3 py-2">Min Stock</th>
                    <th className="px-3 py-2">Pkg</th>
                    <th className="px-3 py-2">FR</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {groupRows.map((r) => (
                    <tr key={r.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                      <td className="px-4 py-2 font-medium text-white">
                        {r.item_name}
                      </td>
                      <td className="px-3 py-2 text-zinc-300">{r.supplier_name || "—"}</td>
                      <td className="px-3 py-2 text-zinc-400">{r.unit || "—"}</td>
                      <td className="px-3 py-2 text-zinc-300">
                        {r.unit_price > 0 ? `${city === "dubai" ? "AED" : "₱"}${r.unit_price.toLocaleString()}` : "—"}
                      </td>
                      <td className="px-3 py-2 text-zinc-400">{r.min_stock_qty || "—"}</td>
                      <td className="px-3 py-2 text-zinc-400">{r.package_spec || "—"}</td>
                      <td className="px-3 py-2">
                        {r.fast_running ? (
                          <span className={BADGE_WARNING}>⚡ FR</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        {r.active ? (
                          <span className={BADGE_SUCCESS}>Active</span>
                        ) : (
                          <span className="rounded-full bg-zinc-700/60 px-2 py-0.5 text-xs text-zinc-400">Inactive</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => openEdit(r)}
                          className="rounded px-2 py-1 text-xs text-violet-400 hover:bg-violet-500/10 transition-colors"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {!suppliersTab && rows.length === 0 && !busy && (
        <div className={`${GLASS_CARD} p-8 text-center`}>
          <Package className="mx-auto mb-3 h-8 w-8 text-zinc-600" />
          <p className="text-zinc-400">No catalog items found. Enter credentials and click Load Catalog.</p>
        </div>
      )}

      {/* Rename Supplier Modal */}
      {renameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-white/10 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-white">Rename Supplier</h2>
            <p className={T_CAPTION}>Current name: <span className="text-white font-medium">{renameModal.old}</span></p>
            <div>
              <label className={`${T_LABEL} mb-1 block`}>New Name</label>
              <input
                className={INPUT_CLASS}
                value={renameTo}
                onChange={(e) => setRenameTo(e.target.value)}
                placeholder="Enter new supplier name…"
                autoFocus
              />
            </div>
            <p className={`${T_CAPTION} text-amber-400/80`}>
              ⚠️ This renames all items (active + inactive) from this supplier across all categories.
            </p>
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => { setRenameModal(null); setRenameTo(""); }} className={SECONDARY_BUTTON}>Cancel</button>
              <button
                onClick={() => void renameSupplier()}
                disabled={renameBusy || !renameTo.trim() || renameTo.trim() === renameModal.old}
                className={PRIMARY_BUTTON}
              >
                {renameBusy ? "Saving…" : "Rename"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deactivate Confirm */}
      {deactivateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-white/10 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-red-400">Deactivate Supplier Items</h2>
            <p className="text-sm text-zinc-300">
              This will hide ALL items from <span className="text-white font-medium">{deactivateConfirm}</span> from all order forms. Items remain in the database and can be reactivated.
            </p>
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setDeactivateConfirm(null)} className={SECONDARY_BUTTON}>Cancel</button>
              <button
                onClick={() => void deactivateSupplier(deactivateConfirm)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-950/50 transition-colors"
              >
                Deactivate All Items
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit / Add Modal */}
      {editRow !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-zinc-900 border border-white/10 p-6 space-y-4">
            <h2 className={T_CARD_TITLE}>{editForm.id ? "Edit Catalog Item" : "Add New Catalog Item"}</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={`${T_LABEL} mb-1 block`}>Item Name</label>
                <input className={INPUT_CLASS} value={editForm.item_name ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, item_name: e.target.value }))} />
              </div>
              <div>
                <label className={`${T_LABEL} mb-1 block`}>Supplier</label>
                <input className={INPUT_CLASS} value={editForm.supplier_name ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, supplier_name: e.target.value }))} />
              </div>
              <div>
                <label className={`${T_LABEL} mb-1 block`}>Category</label>
                <input className={INPUT_CLASS} value={editForm.catalog_category ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, catalog_category: e.target.value }))} />
              </div>
              <div>
                <label className={`${T_LABEL} mb-1 block`}>Section</label>
                <input className={INPUT_CLASS} value={editForm.section ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, section: e.target.value }))} />
              </div>
              <div>
                <label className={`${T_LABEL} mb-1 block`}>Unit</label>
                <input className={INPUT_CLASS} value={editForm.unit ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, unit: e.target.value }))} />
              </div>
              <div>
                <label className={`${T_LABEL} mb-1 block`}>Unit Price ({city === "dubai" ? "AED" : "₱"})</label>
                <input className={INPUT_CLASS} type="number" value={editForm.unit_price ?? 0} onChange={(e) => setEditForm((f) => ({ ...f, unit_price: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div>
                <label className={`${T_LABEL} mb-1 block`}>Min Stock Qty</label>
                <input className={INPUT_CLASS} value={editForm.min_stock_qty ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, min_stock_qty: e.target.value }))} />
              </div>
              <div>
                <label className={`${T_LABEL} mb-1 block`}>Package Spec</label>
                <input className={INPUT_CLASS} value={editForm.package_spec ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, package_spec: e.target.value }))} />
              </div>
              <div>
                <label className={`${T_LABEL} mb-1 block`}>Order Type</label>
                <select className={SELECT_CLASS} value={editForm.order_type ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, order_type: e.target.value }))}>
                  <option value="CK">Store → CK</option>
                  <option value="WH">Store → WH</option>
                  <option value="Supplier">Store → Supplier</option>
                  <option value="CK_WH_to_supplier">CK/WH → Supplier</option>
                </select>
              </div>
              <div>
                <label className={`${T_LABEL} mb-1 block`}>Store Scope</label>
                <select className={SELECT_CLASS} value={editForm.store_scope ?? "ALL"} onChange={(e) => setEditForm((f) => ({ ...f, store_scope: e.target.value }))}>
                  <option value="ALL">ALL</option>
                  {city === "dubai" ? (
                    <>
                      <option value="B Bay">Business Bay</option>
                      <option value="JLT">JLT</option>
                      <option value="Arjan">Arjan</option>
                      <option value="Al Mina">Al Mina</option>
                      <option value="Al Barsha">Al Barsha</option>
                      <option value="Central Kitchen">Central Kitchen</option>
                      <option value="Warehouse">Warehouse</option>
                    </>
                  ) : (
                    <>
                      <option value="Paranaque">Paranaque</option>
                      <option value="Taft">Taft</option>
                      <option value="Cubao">Cubao</option>
                      <option value="Central Kitchen">Central Kitchen</option>
                    </>
                  )}
                </select>
              </div>
              <div className="col-span-2 flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editForm.fast_running ?? false} onChange={(e) => setEditForm((f) => ({ ...f, fast_running: e.target.checked }))} className="accent-violet-500" />
                  <span className={T_LABEL}>Fast Running</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editForm.active ?? true} onChange={(e) => setEditForm((f) => ({ ...f, active: e.target.checked }))} className="accent-violet-500" />
                  <span className={T_LABEL}>Active</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setEditRow(null)} className={SECONDARY_BUTTON}>Cancel</button>
              <button onClick={() => void saveEdit()} disabled={saving} className={PRIMARY_BUTTON}>
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
