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
  cost: number;
  status: string;
};

type DraftItem = {
  item_id: string;
  item_name: string;
  sku: string;
  previous_cost: number;
  new_cost: number;
};

type CostAdjustmentRow = {
  id: string;
  adjustment_no: string;
  branch_code: string;
  business_date: string;
  status: string;
  created_by: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

type CostAdjustmentDetail = CostAdjustmentRow & {
  items?: Array<{
    id: string;
    item_id: string;
    item_name: string;
    sku: string;
    previous_cost: number;
    new_cost: number;
  }>;
};

function monthNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function defaultBranch(city: City) {
  return BRANCHES[city][0]?.code || "";
}

export default function InventoryCostAdjustmentsPage() {
  const auth = useMemo(() => getAuth(), []);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState<City>((auth?.city || "manila") as City);
  const [branchCode, setBranchCode] = useState(defaultBranch((auth?.city || "manila") as City));
  const [businessDate, setBusinessDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedNewCost, setSelectedNewCost] = useState(0);
  const [historyMonth, setHistoryMonth] = useState(monthNow());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [itemOptions, setItemOptions] = useState<InventoryItemOption[]>([]);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [historyRows, setHistoryRows] = useState<CostAdjustmentRow[]>([]);
  const [selectedAdjustmentId, setSelectedAdjustmentId] = useState("");
  const [selectedAdjustment, setSelectedAdjustment] = useState<CostAdjustmentDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const resolved = await refreshAuthFromApi(auth);
      if (cancelled) return;
      const nextCity = (resolved?.city || auth?.city || "manila") as City;
      setAllowed(canAccessInventoryAdmin(resolved));
      setCity(nextCity);
      setBranchCode(defaultBranch(nextCity));
      setReady(true);
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [auth]);

  useEffect(() => {
    setBranchCode(defaultBranch(city));
    setSelectedAdjustmentId("");
    setSelectedAdjustment(null);
  }, [city]);

  useEffect(() => {
    if (!ready || !allowed) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [itemsRes, historyRes] = await Promise.all([
          inventoryGet<{ rows: InventoryItemOption[] }>(
            `/api/admin/inventory/items?city=${encodeURIComponent(city)}&tab=ITEMS&limit=500`,
          ),
          inventoryGet<{ rows: CostAdjustmentRow[] }>(
            `/api/admin/inventory/cost-adjustments?city=${encodeURIComponent(city)}&branch_code=${encodeURIComponent(branchCode)}&limit=500`,
          ),
        ]);
        if (cancelled) return;
        setItemOptions((itemsRes.rows || []).filter((item) => item.status !== "DELETED"));
        setHistoryRows(historyRes.rows || []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [allowed, branchCode, city, ready]);

  useEffect(() => {
    if (!selectedAdjustmentId || !allowed) {
      setSelectedAdjustment(null);
      return;
    }
    let cancelled = false;
    async function loadDetail() {
      try {
        const res = await inventoryGet<{ row: CostAdjustmentDetail }>(
          `/api/admin/inventory/cost-adjustments/${encodeURIComponent(selectedAdjustmentId)}?city=${encodeURIComponent(city)}`,
        );
        if (!cancelled) setSelectedAdjustment(res.row || null);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      }
    }
    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [allowed, city, selectedAdjustmentId]);

  const filteredHistory = useMemo(
    () => historyRows.filter((row) => String(row.business_date || "").slice(0, 7) === historyMonth),
    [historyMonth, historyRows],
  );

  const selectedItem = useMemo(
    () => itemOptions.find((item) => item.id === selectedItemId) || null,
    [itemOptions, selectedItemId],
  );

  function addDraftItem() {
    if (!selectedItem) return;
    setDraftItems((prev) => [
      ...prev,
      {
        item_id: selectedItem.id,
        item_name: selectedItem.name,
        sku: selectedItem.sku,
        previous_cost: Number(selectedItem.cost || 0),
        new_cost: Number(selectedNewCost || 0),
      },
    ]);
    setSelectedItemId("");
    setSelectedNewCost(0);
  }

  function removeDraftItem(index: number) {
    setDraftItems((prev) => prev.filter((_, idx) => idx !== index));
  }

  async function refreshHistoryAndDetail(nextSelectedId = selectedAdjustmentId) {
    const historyRes = await inventoryGet<{ rows: CostAdjustmentRow[] }>(
      `/api/admin/inventory/cost-adjustments?city=${encodeURIComponent(city)}&branch_code=${encodeURIComponent(branchCode)}&limit=500`,
    );
    setHistoryRows(historyRes.rows || []);
    if (nextSelectedId) {
      const detailRes = await inventoryGet<{ row: CostAdjustmentDetail }>(
        `/api/admin/inventory/cost-adjustments/${encodeURIComponent(nextSelectedId)}?city=${encodeURIComponent(city)}`,
      );
      setSelectedAdjustment(detailRes.row || null);
    }
  }

  async function createAdjustment() {
    if (!branchCode) {
      setError("Please select a branch.");
      return;
    }
    if (draftItems.length === 0) {
      setError("Please add at least one item.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const created = await inventoryPost<{ row: CostAdjustmentRow }>("/api/admin/inventory/cost-adjustments", {
        city,
        branch_code: branchCode,
        business_date: businessDate,
        notes,
      });
      const adjustmentId = String(created?.row?.id || "");
      await inventoryPost(`/api/admin/inventory/cost-adjustments/${encodeURIComponent(adjustmentId)}/items`, {
        city,
        items: draftItems.map((item) => ({
          item_id: item.item_id,
          item_name: item.item_name,
          sku: item.sku,
          previous_cost: item.previous_cost,
          new_cost: item.new_cost,
        })),
      });
      await refreshHistoryAndDetail(adjustmentId);
      setDraftItems([]);
      setNotes("");
      setSuccess("Cost adjustment draft created.");
      setSelectedAdjustmentId(adjustmentId);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function closeSelectedAdjustment() {
    if (!selectedAdjustmentId) return;
    setActionLoading(true);
    setError("");
    setSuccess("");
    try {
      await inventoryPost(`/api/admin/inventory/cost-adjustments/${encodeURIComponent(selectedAdjustmentId)}/close`, { city });
      await refreshHistoryAndDetail(selectedAdjustmentId);
      setSuccess("Cost adjustment closed and item costs plus ledger were updated.");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setActionLoading(false);
    }
  }

  async function duplicateSelectedAdjustment() {
    if (!selectedAdjustmentId) return;
    setActionLoading(true);
    setError("");
    setSuccess("");
    try {
      const duplicated = await inventoryPost<{ row: CostAdjustmentRow }>(
        `/api/admin/inventory/cost-adjustments/${encodeURIComponent(selectedAdjustmentId)}/duplicate`,
        { city },
      );
      const nextId = String(duplicated?.row?.id || "");
      await refreshHistoryAndDetail(nextId);
      setSelectedAdjustmentId(nextId);
      setSuccess("Selected cost adjustment duplicated.");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setActionLoading(false);
    }
  }

  if (!ready) return <div className="text-sm text-neutral-500">Loading cost adjustments...</div>;
  if (!allowed) return <div className="text-sm text-neutral-500">You do not have permission to open inventory.</div>;

  return (
    <div className="space-y-6">
      <InventoryTabs />

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-neutral-100">Cost Adjustments</div>
            <div className="mt-1 text-sm text-neutral-400">
              Cost adjustment page for updating to a new cost while reviewing current cost.
            </div>
          </div>
          <div className="text-xs text-neutral-500">{city.toUpperCase()} cost workflow</div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <select className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" value={city} onChange={(e) => setCity(e.target.value as City)}>
            <option value="dubai">Dubai</option>
            <option value="manila">Manila</option>
          </select>
          <select className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" value={branchCode} onChange={(e) => setBranchCode(e.target.value)}>
            {BRANCHES[city].map((branch) => (
              <option key={branch.code} value={branch.code}>
                {branch.name}
              </option>
            ))}
          </select>
          <input type="date" value={businessDate} onChange={(e) => setBusinessDate(e.target.value)} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
          <input type="month" value={historyMonth} onChange={(e) => setHistoryMonth(e.target.value)} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        </div>

        <div className="mt-3">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes / cost adjustment note"
            className="min-h-24 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
          />
        </div>

        {error ? <div className="mt-3 text-sm text-rose-300">{error}</div> : null}
        {success ? <div className="mt-3 text-sm text-emerald-300">{success}</div> : null}
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-neutral-100">Add Cost Lines</div>
          <div className="text-xs text-neutral-500">{itemOptions.length} registered items</div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_180px_140px]">
          <select className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" value={selectedItemId} onChange={(e) => setSelectedItemId(e.target.value)}>
            <option value="">Select an item</option>
            {itemOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} {item.sku ? `(${item.sku})` : ""} {`[${Number(item.cost || 0).toFixed(2)}]`}
              </option>
            ))}
          </select>
          <input type="number" min={0} step={0.01} value={selectedNewCost} onChange={(e) => setSelectedNewCost(Number(e.target.value || 0))} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
          <button type="button" onClick={addDraftItem} disabled={!selectedItem} className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900 disabled:opacity-60">
            Add Item
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Previous Cost</th>
                <th className="px-3 py-2">New Cost</th>
                <th className="px-3 py-2">Delta</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {draftItems.map((item, index) => (
                <tr key={`${item.item_id}-${index}`} className="border-t border-neutral-800 text-neutral-200">
                  <td className="px-3 py-2">
                    <div>{item.item_name}</div>
                    <div className="mt-1 text-xs text-neutral-500">{item.sku || "-"}</div>
                  </td>
                  <td className="px-3 py-2">{item.previous_cost.toFixed(2)}</td>
                  <td className="px-3 py-2">{item.new_cost.toFixed(2)}</td>
                  <td className="px-3 py-2">{(item.new_cost - item.previous_cost).toFixed(2)}</td>
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => removeDraftItem(index)} className="rounded-lg border border-rose-800/70 bg-rose-950/20 px-2 py-1 text-xs text-rose-200">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {draftItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-neutral-500">
                    No cost lines yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={createAdjustment} disabled={saving || draftItems.length === 0} className="rounded-xl border border-emerald-800 bg-emerald-950/30 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-900/30 disabled:opacity-60">
            {saving ? "Creating..." : "Create Cost Adjustment"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-neutral-100">History</div>
            <div className="mt-1 text-xs text-neutral-500">Review cost adjustment history by month.</div>
          </div>
          <div className="text-xs text-neutral-500">{loading ? "Loading..." : `${filteredHistory.length} rows`}</div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-3 py-2">No.</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Branch</th>
                  <th className="px-3 py-2">Created By</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((row) => (
                  <tr key={row.id} className={["border-t border-neutral-800 text-neutral-200 transition", selectedAdjustmentId === row.id ? "bg-emerald-950/20" : ""].join(" ")}>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => setSelectedAdjustmentId(row.id)} className="text-left hover:text-white">
                        {row.adjustment_no}
                      </button>
                    </td>
                    <td className="px-3 py-2">{String(row.business_date || "").slice(0, 10)}</td>
                    <td className="px-3 py-2">{labelOf(city, row.branch_code)}</td>
                    <td className="px-3 py-2">{row.created_by || "-"}</td>
                    <td className="px-3 py-2">{row.status || "-"}</td>
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-neutral-100">Selected Adjustment</div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={duplicateSelectedAdjustment} disabled={!selectedAdjustmentId || actionLoading} className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 disabled:opacity-50">
                  Duplicate
                </button>
                <button type="button" onClick={closeSelectedAdjustment} disabled={!selectedAdjustmentId || actionLoading || selectedAdjustment?.status === "CLOSED"} className="rounded-lg border border-emerald-800 bg-emerald-950/30 px-3 py-1.5 text-xs text-emerald-200 disabled:opacity-50">
                  {actionLoading ? "Processing..." : selectedAdjustment?.status === "CLOSED" ? "Closed" : "Close"}
                </button>
              </div>
            </div>

            {!selectedAdjustment ? (
              <div className="mt-3 text-sm text-neutral-500">Select an adjustment from the history list on the left.</div>
            ) : (
              <div className="mt-3 space-y-3 text-sm text-neutral-200">
                <div>
                  <div className="text-xs text-neutral-500">Adjustment No.</div>
                  <div>{selectedAdjustment.adjustment_no}</div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500">Branch</div>
                  <div>{labelOf(city, selectedAdjustment.branch_code)}</div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500">Created By</div>
                  <div>{selectedAdjustment.created_by || "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500">Notes</div>
                  <div className="whitespace-pre-wrap text-neutral-300">{selectedAdjustment.notes || "-"}</div>
                </div>
                <div>
                  <div className="mb-2 text-xs text-neutral-500">Items</div>
                  <div className="space-y-2">
                    {(selectedAdjustment.items || []).map((item) => (
                      <div key={item.id} className="rounded-xl border border-neutral-800 bg-neutral-900/30 px-3 py-2">
                        <div>{item.item_name}</div>
                        <div className="mt-1 text-xs text-neutral-500">
                          {item.sku || "-"} • {Number(item.previous_cost || 0).toFixed(2)} → {Number(item.new_cost || 0).toFixed(2)}
                        </div>
                      </div>
                    ))}
                    {!(selectedAdjustment.items || []).length ? <div className="text-xs text-neutral-500">No items linked.</div> : null}
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
