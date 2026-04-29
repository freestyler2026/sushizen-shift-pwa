"use client";

import { useEffect, useMemo, useState } from "react";
import InventoryTabs from "@/components/InventoryTabs";
import { canAccessInventoryAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { BRANCHES, labelOf, type City } from "@/lib/branches";
import { inventoryGet, inventoryPost } from "@/lib/inventoryClient";
import { getInventoryCostStep, parseDraftNumber, stepDraftNumber } from "@/lib/quantityInput";

type InventoryItemOption = {
  id: string;
  name: string;
  sku: string;
  cost: number;
  category?: string;
  status: string;
};

type DraftItem = {
  item_id: string;
  item_name: string;
  sku: string;
  previous_cost: number;
  new_cost: number;
  draftNewCostText: string;
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

type CostAdjustmentItemHistoryRow = {
  adjustment_id: string;
  adjustment_no: string;
  branch_code: string;
  business_date: string;
  status: string;
  created_by: string;
  notes: string;
  created_at: string;
  updated_at: string;
  item_id: string;
  item_name: string;
  sku: string;
  previous_cost: number;
  new_cost: number;
  delta: number;
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

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function deltaColor(delta: number) {
  if (delta > 0) return "text-emerald-300";
  if (delta < 0) return "text-rose-300";
  return "text-neutral-400";
}

function deltaPrefix(delta: number) {
  if (delta > 0) return "+";
  return "";
}

const COST_STEP = getInventoryCostStep();

export default function InventoryCostAdjustmentsPage() {
  const auth = useMemo(() => getAuth(), []);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState<City>((auth?.city || "manila") as City);
  const [branchCode, setBranchCode] = useState(defaultBranch((auth?.city || "manila") as City));
  const [businessDate, setBusinessDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [historyMonth, setHistoryMonth] = useState(monthNow());
  const [historyItemId, setHistoryItemId] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [historyItemLoading, setHistoryItemLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [itemOptions, setItemOptions] = useState<InventoryItemOption[]>([]);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [historyRows, setHistoryRows] = useState<CostAdjustmentRow[]>([]);
  const [historyDetailCache, setHistoryDetailCache] = useState<Record<string, CostAdjustmentDetail>>({});
  const [selectedAdjustmentId, setSelectedAdjustmentId] = useState("");
  const [draftAdjustmentId, setDraftAdjustmentId] = useState("");
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
    return () => { cancelled = true; };
  }, [auth]);

  useEffect(() => {
    setBranchCode(defaultBranch(city));
    setHistoryItemId("");
    setSelectedAdjustmentId("");
    setDraftAdjustmentId("");
    setSelectedAdjustment(null);
    setDraftItems([]);
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
    return () => { cancelled = true; };
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
        if (!cancelled) {
          setSelectedAdjustment(res.row || null);
          if (res.row?.id) {
            setHistoryDetailCache((prev) => ({ ...prev, [res.row.id]: res.row }));
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      }
    }
    void loadDetail();
    return () => { cancelled = true; };
  }, [allowed, city, selectedAdjustmentId]);

  // Load details for item price history
  const filteredHistory = useMemo(
    () => historyRows.filter((row) => String(row.business_date || "").slice(0, 7) === historyMonth),
    [historyMonth, historyRows],
  );

  useEffect(() => {
    if (!allowed || !historyItemId || filteredHistory.length === 0) return;
    const missingIds = filteredHistory.map((r) => r.id).filter((id) => !historyDetailCache[id]);
    if (missingIds.length === 0) return;
    let cancelled = false;
    async function loadHistoryDetails() {
      setHistoryItemLoading(true);
      try {
        const rows = await Promise.all(
          missingIds.map(async (id) => {
            const res = await inventoryGet<{ row: CostAdjustmentDetail }>(
              `/api/admin/inventory/cost-adjustments/${encodeURIComponent(id)}?city=${encodeURIComponent(city)}`,
            );
            return res.row || null;
          }),
        );
        if (cancelled) return;
        setHistoryDetailCache((prev) => {
          const next = { ...prev };
          rows.forEach((row) => { if (row?.id) next[row.id] = row; });
          return next;
        });
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setHistoryItemLoading(false);
      }
    }
    void loadHistoryDetails();
    return () => { cancelled = true; };
  }, [allowed, city, filteredHistory, historyDetailCache, historyItemId]);

  const selectedHistoryItem = useMemo(
    () => itemOptions.find((item) => item.id === historyItemId) || null,
    [historyItemId, itemOptions],
  );

  const itemHistoryRows = useMemo<CostAdjustmentItemHistoryRow[]>(
    () =>
      filteredHistory.flatMap((row) => {
        const detail = historyDetailCache[row.id];
        if (!detail || !historyItemId) return [];
        return (detail.items || [])
          .filter((item) => item.item_id === historyItemId)
          .map((item) => ({
            adjustment_id: row.id,
            adjustment_no: row.adjustment_no || "",
            branch_code: row.branch_code || "",
            business_date: row.business_date || "",
            status: row.status || "",
            created_by: row.created_by || "",
            notes: row.notes || "",
            created_at: row.created_at || "",
            updated_at: row.updated_at || "",
            item_id: item.item_id,
            item_name: item.item_name || "",
            sku: item.sku || "",
            previous_cost: Number(item.previous_cost || 0),
            new_cost: Number(item.new_cost || 0),
            delta: Number(item.new_cost || 0) - Number(item.previous_cost || 0),
          }));
      }),
    [filteredHistory, historyDetailCache, historyItemId],
  );

  const filteredItems = useMemo(() => {
    const q = itemSearch.toLowerCase().trim();
    if (!q) return itemOptions;
    return itemOptions.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.sku || "").toLowerCase().includes(q) ||
        (item.category || "").toLowerCase().includes(q),
    );
  }, [itemOptions, itemSearch]);

  function addItem(item: InventoryItemOption) {
    setError("");
    const prev = Number(item.cost || 0);
    setDraftItems((items) => [
      ...items,
      {
        item_id: item.id,
        item_name: item.name,
        sku: item.sku,
        previous_cost: prev,
        new_cost: prev,
        draftNewCostText: prev.toFixed(2),
      },
    ]);
  }

  function removeDraftItem(index: number) {
    setDraftItems((prev) => prev.filter((_, idx) => idx !== index));
  }

  function commitDraftItemCost(index: number) {
    setDraftItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const parsed = parseDraftNumber(item.draftNewCostText);
        const cost = parsed === null || parsed < 0 ? item.new_cost : parsed;
        return { ...item, new_cost: cost, draftNewCostText: cost.toFixed(2) };
      }),
    );
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
      if (detailRes.row?.id) {
        setHistoryDetailCache((prev) => ({ ...prev, [detailRes.row.id]: detailRes.row }));
      }
    }
  }

  async function createAdjustment() {
    if (!branchCode) { setError("Please select a branch."); return; }
    if (draftItems.length === 0) { setError("Please add at least one item."); return; }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const created = await inventoryPost<{ row: CostAdjustmentRow }>(
        "/api/admin/inventory/cost-adjustments",
        { city, branch_code: branchCode, business_date: businessDate, notes },
      );
      const adjustmentId = String(created?.row?.id || "");
      await inventoryPost(
        `/api/admin/inventory/cost-adjustments/${encodeURIComponent(adjustmentId)}/items`,
        {
          city,
          items: draftItems.map((item) => ({
            item_id: item.item_id,
            item_name: item.item_name,
            sku: item.sku,
            previous_cost: item.previous_cost,
            new_cost: item.new_cost,
          })),
        },
      );
      await refreshHistoryAndDetail(adjustmentId);
      setDraftItems([]);
      setNotes("");
      setSuccess("Cost adjustment draft saved.");
      setDraftAdjustmentId(adjustmentId);
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
      await inventoryPost(
        `/api/admin/inventory/cost-adjustments/${encodeURIComponent(selectedAdjustmentId)}/close`,
        { city },
      );
      await refreshHistoryAndDetail(selectedAdjustmentId);
      setSuccess("Cost adjustment closed. Item costs and ledger updated.");
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
      setSuccess("Adjustment duplicated as new draft.");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setActionLoading(false);
    }
  }

  function exportHistoryCsv() {
    const rows = historyItemId
      ? itemHistoryRows.map((row) => ({
          adjustment_no: row.adjustment_no,
          city,
          branch_code: row.branch_code,
          branch_name: labelOf(city, row.branch_code),
          business_date: row.business_date,
          item_name: row.item_name,
          sku: row.sku,
          previous_cost: row.previous_cost.toFixed(2),
          new_cost: row.new_cost.toFixed(2),
          delta: row.delta.toFixed(2),
          status: row.status,
          created_by: row.created_by,
          notes: row.notes,
        }))
      : filteredHistory.map((row) => ({
          adjustment_no: row.adjustment_no || "",
          city,
          branch_code: row.branch_code || "",
          branch_name: labelOf(city, row.branch_code),
          business_date: row.business_date || "",
          status: row.status || "",
          created_by: row.created_by || "",
          notes: row.notes || "",
        }));
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const lines = [
      headers.map(csvEscape).join(","),
      ...rows.map((row) => headers.map((h) => csvEscape(row[h as keyof typeof row])).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = historyItemId
      ? `cost-adj-item-${city}-${selectedHistoryItem?.sku || historyItemId}-${historyMonth}.csv`
      : `cost-adjustments-${city}-${historyMonth}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  if (!ready) return <div className="text-sm text-neutral-500">Loading...</div>;
  if (!allowed) return <div className="text-sm text-neutral-500">You do not have permission to open inventory.</div>;

  const isDraft = draftAdjustmentId !== "";

  return (
    <div className="space-y-5">
      <InventoryTabs />

      {/* ── Settings row ── */}
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* City pill toggle */}
          <div className="flex gap-1 rounded-xl border border-neutral-700 bg-neutral-950 p-1">
            {(["manila", "dubai"] as City[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCity(c)}
                className={[
                  "rounded-lg px-4 py-1.5 text-sm font-medium transition",
                  city === c
                    ? "bg-violet-700 text-white shadow"
                    : "text-neutral-400 hover:text-neutral-200",
                ].join(" ")}
              >
                {c === "manila" ? "🇵🇭 Manila" : "🇦🇪 Dubai"}
              </button>
            ))}
          </div>

          <div className="text-xs font-semibold tracking-wide">
            {isDraft ? (
              <span className="rounded-full bg-amber-500/15 px-3 py-1 text-amber-300">✏️ Editing draft</span>
            ) : (
              <span className="rounded-full bg-sky-500/15 px-3 py-1 text-sky-300">＋ New adjustment</span>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            value={branchCode}
            onChange={(e) => setBranchCode(e.target.value)}
          >
            {BRANCHES[city].map((branch) => (
              <option key={branch.code} value={branch.code}>{branch.name}</option>
            ))}
          </select>

          <input
            type="date"
            value={businessDate}
            onChange={(e) => setBusinessDate(e.target.value)}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
          />

          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="min-w-[220px] flex-1 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
          />
        </div>

        {error ? <div className="mt-3 rounded-xl bg-rose-950/30 px-3 py-2 text-sm text-rose-300">{error}</div> : null}
        {success ? <div className="mt-3 rounded-xl bg-emerald-950/30 px-3 py-2 text-sm text-emerald-300">{success}</div> : null}
      </section>

      {/* ── Item Library + Cost Lines ── */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">

        {/* Left: Item Library */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-neutral-100">Item Library</span>
            <span className="text-xs text-neutral-500">{itemOptions.length} items</span>
          </div>
          <input
            type="text"
            placeholder="Search items..."
            value={itemSearch}
            onChange={(e) => setItemSearch(e.target.value)}
            className="mb-3 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm placeholder-neutral-600"
          />
          <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
            {filteredItems.length === 0 ? (
              <div className="py-6 text-center text-xs text-neutral-600">No items found</div>
            ) : (
              filteredItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => addItem(item)}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-transparent px-3 py-2 text-left hover:border-neutral-700 hover:bg-neutral-800/50"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-neutral-200">{item.name}</div>
                    <div className="flex items-center gap-2 text-xs text-neutral-500">
                      <span>{item.sku || "—"}</span>
                      <span className="text-neutral-600">·</span>
                      <span className="tabular-nums text-neutral-400">{Number(item.cost || 0).toFixed(2)}</span>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-lg bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">+</span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right: Cost Lines */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-neutral-100">Cost Lines</span>
            <span className="text-xs text-neutral-500">{draftItems.length} line{draftItems.length !== 1 ? "s" : ""}</span>
          </div>

          {draftItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-2 text-3xl">💴</div>
              <div className="text-sm text-neutral-400">No lines yet</div>
              <div className="mt-1 text-xs text-neutral-600">Tap + on an item to set a new cost</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-neutral-500">
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2 text-center">Current</th>
                    <th className="px-3 py-2 text-center">New Cost</th>
                    <th className="px-3 py-2 text-center">Δ Delta</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {draftItems.map((item, index) => {
                    const parsedNew = parseDraftNumber(item.draftNewCostText);
                    const previewNew = parsedNew !== null && parsedNew >= 0 ? parsedNew : item.new_cost;
                    const delta = previewNew - item.previous_cost;
                    return (
                      <tr key={`${item.item_id}-${index}`} className="border-t border-neutral-800">
                        <td className="px-3 py-2">
                          <div className="text-neutral-100">{item.item_name}</div>
                          <div className="text-xs text-neutral-500">{item.sku || "—"}</div>
                        </td>

                        {/* Current cost */}
                        <td className="px-3 py-2 text-center">
                          <span className="tabular-nums text-neutral-400">{item.previous_cost.toFixed(2)}</span>
                        </td>

                        {/* New cost input */}
                        <td className="px-3 py-2 text-center">
                          <input
                            type="text"
                            inputMode="decimal"
                            data-cost-input
                            value={item.draftNewCostText}
                            onChange={(e) =>
                              setDraftItems((prev) =>
                                prev.map((it, idx) =>
                                  idx === index ? { ...it, draftNewCostText: e.target.value } : it,
                                ),
                              )
                            }
                            onBlur={() => commitDraftItemCost(index)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                commitDraftItemCost(index);
                                const inputs = document.querySelectorAll<HTMLInputElement>("[data-cost-input]");
                                const current = e.currentTarget as HTMLInputElement;
                                const currentIdx = Array.from(inputs).indexOf(current);
                                if (currentIdx >= 0 && inputs[currentIdx + 1]) {
                                  inputs[currentIdx + 1].focus();
                                }
                              }
                              if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                                e.preventDefault();
                                setDraftItems((prev) =>
                                  prev.map((it, idx) => {
                                    if (idx !== index) return it;
                                    const next = stepDraftNumber(it.draftNewCostText, COST_STEP, e.key === "ArrowUp" ? 1 : -1);
                                    return { ...it, draftNewCostText: next };
                                  }),
                                );
                              }
                            }}
                            className="w-24 rounded-xl border border-violet-800/50 bg-violet-950/20 px-2 py-1.5 text-center text-sm font-semibold text-violet-200 tabular-nums focus:border-violet-500 focus:outline-none"
                          />
                        </td>

                        {/* Delta */}
                        <td className="px-3 py-2 text-center">
                          <span className={["tabular-nums text-sm font-semibold", deltaColor(delta)].join(" ")}>
                            {deltaPrefix(delta)}{delta.toFixed(2)}
                          </span>
                        </td>

                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => removeDraftItem(index)}
                            className="rounded-lg px-2 py-1 text-xs text-neutral-500 hover:bg-rose-950/30 hover:text-rose-300"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={createAdjustment}
              disabled={saving || draftItems.length === 0}
              className="rounded-xl bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-40"
            >
              {saving ? "Saving..." : "Save Adjustment Draft"}
            </button>
          </div>
        </div>
      </section>

      {/* ── History ── */}
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-neutral-100">History</div>
            <div className="mt-0.5 text-xs text-neutral-500">
              {loading ? "Loading..." : `${filteredHistory.length} adjustment${filteredHistory.length !== 1 ? "s" : ""}`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={historyMonth}
              onChange={(e) => setHistoryMonth(e.target.value)}
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={exportHistoryCsv}
              disabled={historyItemId ? !itemHistoryRows.length || historyItemLoading : !filteredHistory.length}
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-900 disabled:opacity-40"
            >
              Export CSV
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">

          {/* History table */}
          <div className="overflow-x-auto rounded-xl border border-neutral-800">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-neutral-800 bg-neutral-900/40">
                <tr className="text-xs uppercase tracking-wide text-neutral-500">
                  <th className="px-3 py-2">No.</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Branch</th>
                  <th className="px-3 py-2">Created By</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((row) => {
                  const isSelected = selectedAdjustmentId === row.id;
                  const isClosed = row.status === "CLOSED";
                  return (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedAdjustmentId(row.id)}
                      className={[
                        "cursor-pointer border-t border-neutral-800 text-neutral-200 transition",
                        isSelected ? "bg-violet-950/30" : "hover:bg-neutral-800/30",
                      ].join(" ")}
                    >
                      <td className="px-3 py-2 font-mono text-xs text-neutral-300">{row.adjustment_no}</td>
                      <td className="px-3 py-2 tabular-nums">{String(row.business_date || "").slice(0, 10)}</td>
                      <td className="px-3 py-2">{labelOf(city, row.branch_code)}</td>
                      <td className="px-3 py-2 text-neutral-400">{row.created_by || "—"}</td>
                      <td className="px-3 py-2">
                        <span className={[
                          "rounded-full px-2 py-0.5 text-xs font-semibold",
                          isClosed
                            ? "bg-neutral-700/40 text-neutral-400"
                            : "bg-amber-500/15 text-amber-300",
                        ].join(" ")}>
                          {isClosed ? "Closed" : "Draft"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {!loading && filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-neutral-500">
                      No adjustments for this month.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {/* Detail panel */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/20 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-neutral-100">
                {selectedAdjustment ? selectedAdjustment.adjustment_no : "Details"}
              </span>
              {selectedAdjustment ? (
                <span className={[
                  "rounded-full px-2 py-0.5 text-xs font-semibold",
                  selectedAdjustment.status === "CLOSED"
                    ? "bg-neutral-700/40 text-neutral-400"
                    : "bg-amber-500/15 text-amber-300",
                ].join(" ")}>
                  {selectedAdjustment.status === "CLOSED" ? "Closed" : "Draft"}
                </span>
              ) : null}
            </div>

            {!selectedAdjustment ? (
              <div className="py-8 text-center text-sm text-neutral-500">
                Select a row to view details
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-neutral-500">Branch</div>
                    <div className="text-neutral-200">{labelOf(city, selectedAdjustment.branch_code)}</div>
                  </div>
                  <div>
                    <div className="text-neutral-500">Date</div>
                    <div className="tabular-nums text-neutral-200">{String(selectedAdjustment.business_date || "").slice(0, 10)}</div>
                  </div>
                  <div>
                    <div className="text-neutral-500">Created By</div>
                    <div className="text-neutral-200">{selectedAdjustment.created_by || "—"}</div>
                  </div>
                </div>

                {selectedAdjustment.notes ? (
                  <div className="rounded-xl bg-neutral-900/40 px-3 py-2 text-xs text-neutral-300">
                    {selectedAdjustment.notes}
                  </div>
                ) : null}

                <div>
                  <div className="mb-2 text-xs text-neutral-500">Items ({(selectedAdjustment.items || []).length})</div>
                  <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
                    {(selectedAdjustment.items || []).map((item) => {
                      const delta = Number(item.new_cost || 0) - Number(item.previous_cost || 0);
                      return (
                        <div key={item.id} className="rounded-xl border border-neutral-800 bg-neutral-900/30 px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm text-neutral-200">{item.item_name}</div>
                              <div className="text-xs text-neutral-500">{item.sku || "—"}</div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="tabular-nums text-xs text-neutral-300">
                                {Number(item.previous_cost || 0).toFixed(2)} → {Number(item.new_cost || 0).toFixed(2)}
                              </div>
                              <div className={["tabular-nums text-xs font-semibold", deltaColor(delta)].join(" ")}>
                                {deltaPrefix(delta)}{delta.toFixed(2)}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {!(selectedAdjustment.items || []).length ? (
                      <div className="text-xs text-neutral-500">No items linked.</div>
                    ) : null}
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={duplicateSelectedAdjustment}
                    disabled={actionLoading}
                    className="flex-1 rounded-xl border border-neutral-700 bg-neutral-900 py-2 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={closeSelectedAdjustment}
                    disabled={actionLoading || selectedAdjustment.status === "CLOSED"}
                    className={[
                      "flex-1 rounded-xl py-2 text-xs font-semibold transition disabled:opacity-50",
                      selectedAdjustment.status === "CLOSED"
                        ? "border border-neutral-700 bg-neutral-900 text-neutral-500"
                        : "bg-emerald-700 text-white hover:bg-emerald-600",
                    ].join(" ")}
                  >
                    {actionLoading ? "Processing..." : selectedAdjustment.status === "CLOSED" ? "Posted" : "Close & Post"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Item Price History ── */}
        <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/20 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-neutral-100">Item Price History</div>
              <div className="mt-0.5 text-xs text-neutral-500">
                {selectedHistoryItem
                  ? `${selectedHistoryItem.name}${selectedHistoryItem.sku ? ` · ${selectedHistoryItem.sku}` : ""}  —  Current cost: ${Number(selectedHistoryItem.cost || 0).toFixed(2)}`
                  : "Select an item to view cost change history"}
              </div>
            </div>
            <select
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-sm"
              value={historyItemId}
              onChange={(e) => setHistoryItemId(e.target.value)}
            >
              <option value="">— Select item —</option>
              {itemOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}{item.sku ? ` (${item.sku})` : ""}
                </option>
              ))}
            </select>
          </div>

          {!historyItemId ? (
            <div className="py-6 text-center text-sm text-neutral-600">
              Choose an item above to see its price change history for the selected month
            </div>
          ) : historyItemLoading ? (
            <div className="py-6 text-center text-sm text-neutral-500">Loading...</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-neutral-800">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-neutral-800 bg-neutral-900/40">
                  <tr className="text-xs uppercase tracking-wide text-neutral-500">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">No.</th>
                    <th className="px-3 py-2">Branch</th>
                    <th className="px-3 py-2 text-right">Previous</th>
                    <th className="px-3 py-2 text-right">New</th>
                    <th className="px-3 py-2 text-right">Δ</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">By</th>
                  </tr>
                </thead>
                <tbody>
                  {itemHistoryRows.map((row) => (
                    <tr
                      key={`${row.adjustment_id}:${row.item_id}`}
                      onClick={() => setSelectedAdjustmentId(row.adjustment_id)}
                      className={[
                        "cursor-pointer border-t border-neutral-800 text-neutral-200 transition",
                        selectedAdjustmentId === row.adjustment_id ? "bg-violet-950/30" : "hover:bg-neutral-800/30",
                      ].join(" ")}
                    >
                      <td className="px-3 py-2 tabular-nums">{String(row.business_date || "").slice(0, 10)}</td>
                      <td className="px-3 py-2 font-mono text-xs text-neutral-400">{row.adjustment_no}</td>
                      <td className="px-3 py-2">{labelOf(city, row.branch_code)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-neutral-400">{row.previous_cost.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-neutral-200">{row.new_cost.toFixed(2)}</td>
                      <td className={["px-3 py-2 text-right tabular-nums font-semibold", deltaColor(row.delta)].join(" ")}>
                        {deltaPrefix(row.delta)}{row.delta.toFixed(2)}
                      </td>
                      <td className="px-3 py-2">
                        <span className={[
                          "rounded-full px-2 py-0.5 text-xs font-semibold",
                          row.status === "CLOSED"
                            ? "bg-neutral-700/40 text-neutral-400"
                            : "bg-amber-500/15 text-amber-300",
                        ].join(" ")}>
                          {row.status === "CLOSED" ? "Closed" : "Draft"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-neutral-400">{row.created_by || "—"}</td>
                    </tr>
                  ))}
                  {itemHistoryRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-neutral-500">
                        No cost changes found for this item in the selected month.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
