"use client";

import { useEffect, useMemo, useState } from "react";
import InventoryTabs from "@/components/InventoryTabs";
import { canAccessInventoryAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { BRANCHES, labelOf, type City } from "@/lib/branches";
import { inventoryGet, inventoryPost } from "@/lib/inventoryClient";

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
  }>;
};

type StaffNameDirectory = {
  names?: string[];
};

type DraftItem = {
  item_id: string;
  item_name: string;
  sku: string;
  quantity: number;
};

function monthKeyOf(value: string) {
  const s = String(value || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : "";
}

function monthNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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

  const [fromBranch, setFromBranch] = useState<string>(BRANCHES[(auth?.city || "manila") as City][0]?.code || "BB");
  const [toBranch, setToBranch] = useState<string>(BRANCHES[(auth?.city || "manila") as City][1]?.code || BRANCHES[(auth?.city || "manila") as City][0]?.code || "BB");
  const [requestedBy, setRequestedBy] = useState(auth?.staffName || "");
  const [notes, setNotes] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedQty, setSelectedQty] = useState(1);

  const [staffOptions, setStaffOptions] = useState<string[]>([]);
  const [itemOptions, setItemOptions] = useState<InventoryItemOption[]>([]);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [historyMonth, setHistoryMonth] = useState(monthNow());
  const [historyRows, setHistoryRows] = useState<TransferOrderRow[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<TransferOrderDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const resolved = await refreshAuthFromApi(auth);
      if (cancelled) return;
      const nextCity = (resolved?.city || auth?.city || "manila") as City;
      setAllowed(canAccessInventoryAdmin(resolved));
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
        setItemOptions((itemsRes.rows || []).filter((item) => item.status !== "DELETED"));
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

  function addDraftItem() {
    if (!selectedItem) return;
    const qty = Math.max(0.001, Number(selectedQty || 0));
    setDraftItems((prev) => {
      const existing = prev.find((item) => item.item_id === selectedItem.id);
      if (existing) {
        return prev.map((item) =>
          item.item_id === selectedItem.id ? { ...item, quantity: Number((item.quantity + qty).toFixed(3)) } : item,
        );
      }
      return [
        ...prev,
        {
          item_id: selectedItem.id,
          item_name: selectedItem.name,
          sku: selectedItem.sku,
          quantity: Number(qty.toFixed(3)),
        },
      ];
    });
    setSelectedItemId("");
    setSelectedQty(1);
  }

  function removeDraftItem(itemId: string) {
    setDraftItems((prev) => prev.filter((item) => item.item_id !== itemId));
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
            onChange={(e) => setCity(e.target.value as City)}
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

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_180px_140px]">
          <select
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            value={selectedItemId}
            onChange={(e) => setSelectedItemId(e.target.value)}
          >
            <option value="">Select an ingredient item</option>
            {itemOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} {item.sku ? `(${item.sku})` : ""}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0.001}
            step={0.001}
            value={selectedQty}
            onChange={(e) => setSelectedQty(Number(e.target.value || 0))}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
          />
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
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {draftItems.map((item) => (
                <tr key={item.item_id} className="border-t border-neutral-800 text-neutral-200">
                  <td className="px-3 py-2">{item.item_name}</td>
                  <td className="px-3 py-2">{item.sku || "-"}</td>
                  <td className="px-3 py-2">{Number(item.quantity || 0).toFixed(3)}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => removeDraftItem(item.item_id)}
                      className="rounded-lg border border-rose-800/70 bg-rose-950/20 px-2 py-1 text-xs text-rose-200"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {draftItems.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-neutral-500">
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
          <input
            type="month"
            value={historyMonth}
            onChange={(e) => setHistoryMonth(e.target.value)}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
          />
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
                  <div>{selectedOrder.status || "-"}</div>
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
                          {item.sku || "-"} • Qty {Number(item.quantity || 0).toFixed(3)}
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
    </div>
  );
}
