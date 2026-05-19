"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import InventoryTabs from "@/components/InventoryTabs";
import { canAccessInventoryWorkspace, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { BRANCHES, labelOf, type City } from "@/lib/branches";
import { inventoryGet, inventoryPost } from "@/lib/inventoryClient";
import { getInventoryQuantityStep, parseDraftNumber, stepDraftNumber } from "@/lib/quantityInput";

type InventoryItemOption = {
  id: string;
  name: string;
  sku: string;
  storage_unit: string;
  status: string;
};

type TransferOrderRow = {
  id: string;
  transfer_order_no: string;
  warehouse_branch_code: string;
  destination_branch_code: string;
  requested_by: string;
  status: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

type TransferOrderDetail = TransferOrderRow & {
  items?: Array<{
    id: string;
    item_id: string;
    item_name: string;
    sku: string;
    quantity: number;
    unit: string;
  }>;
};

type StaffNameDirectory = {
  names?: string[];
};

type DraftItem = {
  key: string;
  item_id: string;
  item_name: string;
  sku: string;
  quantity: number;
  unit: string;
};

const TRANSFER_ORDER_UNITS = ["kg", "g", "pcs", "pkt", "box", "ml", "L"] as const;

function normalizeTransferUnit(value: string) {
  const unit = String(value || "").trim();
  return TRANSFER_ORDER_UNITS.includes(unit as (typeof TRANSFER_ORDER_UNITS)[number]) ? unit : "pcs";
}

function draftItemKey(itemId: string, unit: string) {
  return `${itemId}::${unit}`;
}

function monthKeyOf(value: string) {
  const s = String(value || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : "";
}

function monthNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function csvEscape(value: unknown) {
  const s = String(value ?? "");
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export default function InventoryTransferOrdersPage() {
  const auth = useMemo(() => getAuth(), []);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState<City>((auth?.city || "manila") as City);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => void } | null>(null);

  const [fromBranch, setFromBranch] = useState<string>(BRANCHES[(auth?.city || "manila") as City][0]?.code || "BB");
  const [toBranch, setToBranch] = useState<string>(BRANCHES[(auth?.city || "manila") as City][1]?.code || BRANCHES[(auth?.city || "manila") as City][0]?.code || "BB");
  const [requestedBy, setRequestedBy] = useState(auth?.staffName || "");
  const [notes, setNotes] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedQty, setSelectedQty] = useState("1");
  const [selectedUnit, setSelectedUnit] = useState<string>("pcs");
  // Ingredient searchable combobox
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [ingredientOpen, setIngredientOpen] = useState(false);
  const ingredientRef = useRef<HTMLDivElement>(null);

  const [staffOptions, setStaffOptions] = useState<string[]>([]);
  const [itemOptions, setItemOptions] = useState<InventoryItemOption[]>([]);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [historyMonth, setHistoryMonth] = useState(monthNow());
  const [historyRows, setHistoryRows] = useState<TransferOrderRow[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<TransferOrderDetail | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const resolved = await refreshAuthFromApi(auth);
      if (cancelled) return;
      const nextCity = (resolved?.city || auth?.city || "manila") as City;
      setAllowed(canAccessInventoryWorkspace(resolved));
      setCity(nextCity);
      setFromBranch(BRANCHES[nextCity][0]?.code || "");
      setToBranch(BRANCHES[nextCity][1]?.code || BRANCHES[nextCity][0]?.code || "");
      setRequestedBy(resolved?.staffName || auth?.staffName || "");
      setReady(true);
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [auth]);

  useEffect(() => {
    const first = BRANCHES[city][0]?.code || "";
    const second = BRANCHES[city][1]?.code || first;
    setFromBranch(first);
    setToBranch(second);
    setSelectedOrderId("");
    setSelectedOrder(null);
  }, [city]);

  useEffect(() => {
    if (!ready || !allowed) return;
    let cancelled = false;
    async function loadBasics() {
      setLoading(true);
      setError("");
      try {
        const [itemsRes, historyRes, staffRes] = await Promise.all([
          inventoryGet<{ rows: InventoryItemOption[] }>(`/api/admin/inventory/items?city=${encodeURIComponent(city)}&tab=ITEMS&limit=500`),
          inventoryGet<{ rows: TransferOrderRow[] }>(`/api/admin/inventory/transfer-orders?city=${encodeURIComponent(city)}&limit=500`),
          fetch(`/api/admin/staff_master/names?city=${encodeURIComponent(city)}&status=ACTIVE&limit=5000`, { cache: "no-store" }).then(async (res) => {
            const text = await res.text();
            if (!res.ok) throw new Error(text || "staff names failed");
            return text ? (JSON.parse(text) as StaffNameDirectory) : {};
          }),
        ]);
        if (cancelled) return;
        setItemOptions(
          (itemsRes.rows || [])
            .filter((item) => item.status !== "DELETED")
            .sort((a, b) => a.name.localeCompare(b.name))
        );
        setHistoryRows(historyRes.rows || []);
        setStaffOptions(Array.isArray(staffRes.names) ? staffRes.names : []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadBasics();
    return () => {
      cancelled = true;
    };
  }, [allowed, city, ready]);

  useEffect(() => {
    if (!selectedOrderId || !allowed) {
      setSelectedOrder(null);
      return;
    }
    let cancelled = false;
    async function loadDetail() {
      try {
        const res = await inventoryGet<{ row: TransferOrderDetail }>(
          `/api/admin/inventory/transfer-orders/${encodeURIComponent(selectedOrderId)}?city=${encodeURIComponent(city)}`,
        );
        if (!cancelled) setSelectedOrder(res.row || null);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      }
    }
    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [allowed, city, selectedOrderId]);

  const filteredHistory = useMemo(() => {
    return historyRows.filter((row) => monthKeyOf(row.created_at) === historyMonth);
  }, [historyMonth, historyRows]);

  const selectedItem = useMemo(
    () => itemOptions.find((item) => item.id === selectedItemId) || null,
    [itemOptions, selectedItemId],
  );

  useEffect(() => {
    if (!selectedItem) return;
    setSelectedUnit(normalizeTransferUnit(selectedItem.storage_unit));
  }, [selectedItem]);

  // Filtered ingredient list for combobox (max 100 to keep dropdown snappy)
  const filteredIngredients = useMemo(() => {
    const q = ingredientSearch.trim().toLowerCase();
    if (!q) return itemOptions.slice(0, 100);
    return itemOptions.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.sku || "").toLowerCase().includes(q)
    ).slice(0, 100);
  }, [itemOptions, ingredientSearch]);

  // Close ingredient dropdown on outside click
  useEffect(() => {
    if (!ingredientOpen) return;
    function handleOutside(e: MouseEvent) {
      if (ingredientRef.current && !ingredientRef.current.contains(e.target as Node)) {
        setIngredientOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [ingredientOpen]);

  const selectedQtyStep = getInventoryQuantityStep(selectedUnit);

  function addDraftItem() {
    if (!selectedItem) return;
    const parsedQty = parseDraftNumber(selectedQty);
    const qty = parsedQty === null ? NaN : parsedQty;
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Please enter a valid quantity.");
      return;
    }
    const unit = normalizeTransferUnit(selectedUnit);
    const key = draftItemKey(selectedItem.id, unit);
    setError("");
    setDraftItems((prev) => {
      const existing = prev.find((item) => item.key === key);
      if (existing) {
        return prev.map((item) =>
          item.key === key ? { ...item, quantity: Number((item.quantity + qty).toFixed(3)) } : item,
        );
      }
      return [
        ...prev,
        {
          key,
          item_id: selectedItem.id,
          item_name: selectedItem.name,
          sku: selectedItem.sku,
          quantity: Number(qty.toFixed(3)),
          unit,
        },
      ];
    });
    setSelectedItemId("");
    setIngredientSearch("");
    setSelectedQty("1");
    setSelectedUnit("pcs");
  }

  function removeDraftItem(key: string) {
    setDraftItems((prev) => prev.filter((item) => item.key !== key));
  }

  function exportHistoryCsv() {
    if (!filteredHistory.length) return;
    const rows = filteredHistory.map((row) => ({
      transfer_order_no: row.transfer_order_no || "",
      city,
      warehouse_branch_code: row.warehouse_branch_code || "",
      warehouse_branch_name: labelOf(city, row.warehouse_branch_code),
      destination_branch_code: row.destination_branch_code || "",
      destination_branch_name: labelOf(city, row.destination_branch_code),
      requested_by: row.requested_by || "",
      status: row.status || "",
      notes: row.notes || "",
      created_at: row.created_at || "",
      updated_at: row.updated_at || "",
    }));
    const headers = Object.keys(rows[0]);
    const lines = [
      headers.map(csvEscape).join(","),
      ...rows.map((row) => headers.map((header) => csvEscape(row[header as keyof typeof row])).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `transfer-orders-history-${city}-${historyMonth || monthNow()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function createTransferOrder() {
    if (!requestedBy.trim()) {
      setError("Please select a responsible staff member.");
      return;
    }
    if (!fromBranch || !toBranch || fromBranch === toBranch) {
      setError("Please select valid source and destination branches.");
      return;
    }
    if (draftItems.length === 0) {
      setError("Please add at least one ingredient item.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const created = await inventoryPost<{ row: TransferOrderRow }>("/api/admin/inventory/transfer-orders", {
        city,
        warehouse_branch_code: fromBranch,
        destination_branch_code: toBranch,
        requested_by: requestedBy.trim(),
        notes,
      });
      const transferOrderId = String(created?.row?.id || "");
      await inventoryPost(`/api/admin/inventory/transfer-orders/${encodeURIComponent(transferOrderId)}/items`, {
        city,
        items: draftItems.map((item) => ({
          item_id: item.item_id,
          item_name: item.item_name,
          sku: item.sku,
          quantity: item.quantity,
          unit: item.unit,
        })),
      });
      await inventoryPost(`/api/admin/inventory/transfer-orders/${encodeURIComponent(transferOrderId)}/status`, {
        city,
        status: "PENDING",
      });
      const historyRes = await inventoryGet<{ rows: TransferOrderRow[] }>(
        `/api/admin/inventory/transfer-orders?city=${encodeURIComponent(city)}&limit=500`,
      );
      setHistoryRows(historyRes.rows || []);
      setDraftItems([]);
      setNotes("");
      setSuccess("Transfer order created and moved to Pending.");
      setSelectedOrderId(transferOrderId);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function updateOrderStatus(orderId: string, newStatus: string) {
    setStatusUpdating(true);
    setError("");
    try {
      await inventoryPost(`/api/admin/inventory/transfer-orders/${encodeURIComponent(orderId)}/status`, {
        city,
        status: newStatus,
      });
      const historyRes = await inventoryGet<{ rows: TransferOrderRow[] }>(
        `/api/admin/inventory/transfer-orders?city=${encodeURIComponent(city)}&limit=500`,
      );
      setHistoryRows(historyRes.rows || []);
      if (selectedOrderId === orderId) {
        const detailRes = await inventoryGet<{ row: TransferOrderDetail }>(
          `/api/admin/inventory/transfer-orders/${encodeURIComponent(orderId)}?city=${encodeURIComponent(city)}`,
        );
        setSelectedOrder(detailRes.row || null);
      }
      setSuccess(`Transfer order marked as ${newStatus.charAt(0) + newStatus.slice(1).toLowerCase()}.`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStatusUpdating(false);
    }
  }

  if (!ready) return <div className="text-sm text-neutral-500">Loading transfer orders...</div>;
  if (!allowed) return <div className="text-sm text-neutral-500">You do not have permission to open inventory.</div>;

  return (
    <div className="space-y-6">
      <InventoryTabs />

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-neutral-100">Transfer Orders</div>
            <div className="mt-1 text-sm text-neutral-400">
              Request page for inter-branch ingredient transfers to reduce inventory mismatches.
            </div>
          </div>
          <div className="text-xs text-neutral-500">{city.toUpperCase()} transfer workflow</div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <select
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            value={city}
            onChange={(e) => {
              const next = e.target.value as City;
              if (next === city) return;
              if (draftItems.length > 0) {
                setConfirmModal({
                  title: `Switch to ${next.charAt(0).toUpperCase() + next.slice(1)}?`,
                  message: `Your current draft (${draftItems.length} item${draftItems.length !== 1 ? "s" : ""}) will be cleared.`,
                  confirmLabel: "Switch & Clear Draft",
                  danger: true,
                  onConfirm: () => { setConfirmModal(null); setCity(next); },
                });
                return;
              }
              setCity(next);
            }}
          >
            <option value="dubai">Dubai</option>
            <option value="manila">Manila</option>
          </select>
          <select
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            value={fromBranch}
            onChange={(e) => setFromBranch(e.target.value)}
          >
            {BRANCHES[city].map((branch) => (
              <option key={branch.code} value={branch.code}>
                From: {branch.name}
              </option>
            ))}
          </select>
          <select
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            value={toBranch}
            onChange={(e) => setToBranch(e.target.value)}
          >
            {BRANCHES[city].map((branch) => (
              <option key={branch.code} value={branch.code}>
                To: {branch.name}
              </option>
            ))}
          </select>
          <input
            list="inventory-transfer-staff-list"
            value={requestedBy}
            onChange={(e) => setRequestedBy(e.target.value)}
            placeholder="Select responsible staff"
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
          />
        </div>
        <datalist id="inventory-transfer-staff-list">
          {staffOptions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>

        <div className="mt-3">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes / reason"
            className="min-h-24 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
          />
        </div>

        {error ? <div className="mt-3 text-sm text-rose-300">{error}</div> : null}
        {success ? <div className="mt-3 text-sm text-emerald-300">{success}</div> : null}
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-neutral-100">Add Ingredients</div>
          <div className="text-xs text-neutral-500">{itemOptions.length} registered ingredients</div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_140px_140px_140px]">
          {/* ── Searchable ingredient combobox ── */}
          <div ref={ingredientRef} className="relative">
            <input
              type="text"
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-600"
              placeholder={selectedItem ? `${selectedItem.name}${selectedItem.sku ? ` (${selectedItem.sku})` : ""}` : "Search ingredient…"}
              value={ingredientSearch}
              onChange={(e) => {
                setIngredientSearch(e.target.value);
                setIngredientOpen(true);
                if (!e.target.value) setSelectedItemId("");
              }}
              onFocus={() => setIngredientOpen(true)}
              autoComplete="off"
            />
            {/* Clear button when an item is selected */}
            {selectedItem && (
              <button
                type="button"
                onClick={() => { setSelectedItemId(""); setIngredientSearch(""); setIngredientOpen(false); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-200"
                tabIndex={-1}
                title="Clear selection"
              >
                ✕
              </button>
            )}
            {/* Dropdown */}
            {ingredientOpen && (
              <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 shadow-xl">
                {filteredIngredients.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-neutral-500">No matches</div>
                ) : (
                  filteredIngredients.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault(); // prevent blur before click registers
                        setSelectedItemId(item.id);
                        setIngredientSearch("");
                        setIngredientOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-neutral-800 ${
                        item.id === selectedItemId ? "bg-neutral-800 text-emerald-300" : "text-neutral-200"
                      }`}
                    >
                      <span className="font-medium">{item.name}</span>
                      {item.sku && <span className="ml-1.5 text-xs text-neutral-500">({item.sku})</span>}
                    </button>
                  ))
                )}
                {itemOptions.length > 100 && filteredIngredients.length === 100 && (
                  <div className="border-t border-neutral-800 px-3 py-1.5 text-xs text-neutral-500">
                    Type to narrow down ({itemOptions.length} total)
                  </div>
                )}
              </div>
            )}
          </div>
          <input
            type="text"
            inputMode="decimal"
            value={selectedQty}
            onChange={(e) => setSelectedQty(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
              e.preventDefault();
              setSelectedQty((current) => stepDraftNumber(current, selectedQtyStep, e.key === "ArrowUp" ? 1 : -1));
            }}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
          />
          <select
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            value={selectedUnit}
            onChange={(e) => setSelectedUnit(e.target.value)}
          >
            {TRANSFER_ORDER_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addDraftItem}
            disabled={!selectedItem}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900 disabled:opacity-60"
          >
            Add Item
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Quantity</th>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {draftItems.map((item) => (
                <tr key={item.key} className="border-t border-neutral-800 text-neutral-200">
                  <td className="px-3 py-2">{item.item_name}</td>
                  <td className="px-3 py-2">{item.sku || "-"}</td>
                  <td className="px-3 py-2">{Number(item.quantity || 0).toFixed(3)}</td>
                  <td className="px-3 py-2">{item.unit || "-"}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => removeDraftItem(item.key)}
                      className="rounded-lg border border-rose-800/70 bg-rose-950/20 px-2 py-1 text-xs text-rose-200"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {draftItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-neutral-500">
                    No ingredient items have been added yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={createTransferOrder}
            disabled={saving || draftItems.length === 0}
            className="rounded-xl border border-emerald-800 bg-emerald-950/30 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-900/30 disabled:opacity-60"
          >
            {saving ? "Creating..." : "Create Transfer Order"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-neutral-100">History</div>
            <div className="mt-1 text-xs text-neutral-500">Review transfer order history by month.</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="month"
              value={historyMonth}
              onChange={(e) => setHistoryMonth(e.target.value)}
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={exportHistoryCsv}
              disabled={!filteredHistory.length}
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900 disabled:opacity-60"
            >
              Export CSV
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-3 py-2">No.</th>
                  <th className="px-3 py-2">Route</th>
                  <th className="px-3 py-2">Person</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((row) => (
                  <tr
                    key={row.id}
                    className={[
                      "border-t border-neutral-800 text-neutral-200 transition",
                      selectedOrderId === row.id ? "bg-emerald-950/20" : "",
                    ].join(" ")}
                  >
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => setSelectedOrderId(row.id)} className="text-left hover:text-white">
                        {row.transfer_order_no}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      {labelOf(city, row.warehouse_branch_code)} → {labelOf(city, row.destination_branch_code)}
                    </td>
                    <td className="px-3 py-2">{row.requested_by || "-"}</td>
                    <td className="px-3 py-2">{row.status || "-"}</td>
                    <td className="px-3 py-2">{String(row.created_at || "").slice(0, 10)}</td>
                  </tr>
                ))}
                {!loading && filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-neutral-500">
                      No history for this month.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/20 p-4">
            <div className="text-sm font-semibold text-neutral-100">Selected Order</div>
            {!selectedOrder ? (
              <div className="mt-3 text-sm text-neutral-500">Select a transfer order from the history list on the left.</div>
            ) : (
              <div className="mt-3 space-y-3 text-sm text-neutral-200">
                <div>
                  <div className="text-xs text-neutral-500">Transfer Order No.</div>
                  <div>{selectedOrder.transfer_order_no}</div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500">Route</div>
                  <div>
                    {labelOf(city, selectedOrder.warehouse_branch_code)} → {labelOf(city, selectedOrder.destination_branch_code)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500">Person in Charge</div>
                  <div>{selectedOrder.requested_by || "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500">Status</div>
                  <div className="flex items-center gap-3">
                    <span className={[
                      "rounded-md px-2 py-0.5 text-xs font-medium",
                      selectedOrder.status === "RECEIVED" ? "bg-emerald-900/40 text-emerald-300" :
                      selectedOrder.status === "COMPLETED" ? "bg-sky-900/40 text-sky-300" :
                      selectedOrder.status === "CANCELLED" ? "bg-neutral-800 text-neutral-500" :
                      "bg-amber-900/30 text-amber-300",
                    ].join(" ")}>
                      {selectedOrder.status || "-"}
                    </span>
                    {selectedOrder.status === "PENDING" && (
                      <button
                        type="button"
                        onClick={() => void updateOrderStatus(selectedOrderId, "RECEIVED")}
                        disabled={statusUpdating}
                        className="rounded-lg border border-emerald-800 bg-emerald-950/30 px-3 py-1 text-xs text-emerald-300 hover:bg-emerald-900/30 disabled:opacity-50"
                      >
                        {statusUpdating ? "Updating..." : "✓ Mark as Received"}
                      </button>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-neutral-600">PENDING → RECEIVED → COMPLETED</div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500">Notes</div>
                  <div className="whitespace-pre-wrap text-neutral-300">{selectedOrder.notes || "-"}</div>
                </div>
                <div>
                  <div className="mb-2 text-xs text-neutral-500">Items</div>
                  <div className="space-y-2">
                    {(selectedOrder.items || []).map((item) => (
                      <div key={item.id} className="rounded-xl border border-neutral-800 bg-neutral-900/30 px-3 py-2">
                        <div>{item.item_name}</div>
                        <div className="mt-1 text-xs text-neutral-500">
                          {item.sku || "-"} • Qty {Number(item.quantity || 0).toFixed(3)} {item.unit || ""}
                        </div>
                      </div>
                    ))}
                    {!(selectedOrder.items || []).length ? (
                      <div className="text-xs text-neutral-500">No items linked.</div>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-neutral-700 bg-slate-900/95 p-6 shadow-2xl">
            <div className="mb-2 text-base font-semibold text-neutral-100">{confirmModal.title}</div>
            <div className="mb-5 text-sm text-neutral-400">{confirmModal.message}</div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setConfirmModal(null)} className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-700">
                Cancel
              </button>
              <button type="button" onClick={confirmModal.onConfirm} className={`rounded-xl px-4 py-2 text-sm font-semibold text-white ${confirmModal.danger ? "bg-rose-600 hover:bg-rose-500" : "bg-sky-600 hover:bg-sky-500"}`}>
                {confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
