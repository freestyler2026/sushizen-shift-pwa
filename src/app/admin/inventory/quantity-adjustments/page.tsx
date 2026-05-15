"use client";

import { useEffect, useMemo, useState } from "react";
import InventoryTabs from "@/components/InventoryTabs";
import { canAccessInventoryAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { BRANCHES, labelOf, type City } from "@/lib/branches";
import { inventoryGet, inventoryPost } from "@/lib/inventoryClient";
import { getInventoryQuantityStep, parseDraftNumber, stepDraftNumber } from "@/lib/quantityInput";

type InventoryItemOption = {
  id: string;
  name: string;
  sku: string;
  cost: number;
  storage_unit: string;
  category?: string;
  supplier_name?: string;
  status: string;
};

type DraftItem = {
  item_id: string;
  item_name: string;
  sku: string;
  quantity: number;
  unit_cost: number;
  action_type: string;
  storage_unit: string;
  draftQtyText: string;
};

type QuantityAdjustmentRow = {
  id: string;
  adjustment_no: string;
  branch_code: string;
  reason: string;
  business_date: string;
  status: string;
  created_by: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

type QuantityAdjustmentDetail = QuantityAdjustmentRow & {
  items?: Array<{
    id: string;
    item_id: string;
    item_name: string;
    sku: string;
    quantity: number;
    unit_cost: number;
    action_type: string;
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

function number3(value: number) {
  return Number(value || 0).toFixed(3);
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

const REASON_LABELS: Record<string, string> = {
  WASTE: "Waste",
  EXPIRED: "Expired",
  LOSS: "Loss",
  DAMAGE: "Damage",
  MANUAL_FIX: "Manual Fix",
};

export default function InventoryQuantityAdjustmentsPage() {
  const auth = useMemo(() => getAuth(), []);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState<City>((auth?.city || "manila") as City);
  const [branchCode, setBranchCode] = useState(defaultBranch((auth?.city || "manila") as City));
  const [businessDate, setBusinessDate] = useState(todayIso());
  const [reason, setReason] = useState("WASTE");
  const [notes, setNotes] = useState("");
  const [historyMonth, setHistoryMonth] = useState(monthNow());
  const [itemSearch, setItemSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [itemOptions, setItemOptions] = useState<InventoryItemOption[]>([]);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [historyRows, setHistoryRows] = useState<QuantityAdjustmentRow[]>([]);
  const [selectedAdjustmentId, setSelectedAdjustmentId] = useState("");
  const [draftAdjustmentId, setDraftAdjustmentId] = useState("");
  const [selectedAdjustment, setSelectedAdjustment] = useState<QuantityAdjustmentDetail | null>(null);

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
          inventoryGet<{ rows: QuantityAdjustmentRow[] }>(
            `/api/admin/inventory/quantity-adjustments?city=${encodeURIComponent(city)}&branch_code=${encodeURIComponent(branchCode)}&limit=500`,
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
        const res = await inventoryGet<{ row: QuantityAdjustmentDetail }>(
          `/api/admin/inventory/quantity-adjustments/${encodeURIComponent(selectedAdjustmentId)}?city=${encodeURIComponent(city)}`,
        );
        if (!cancelled) setSelectedAdjustment(res.row || null);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      }
    }
    void loadDetail();
    return () => { cancelled = true; };
  }, [allowed, city, selectedAdjustmentId]);

  const filteredHistory = useMemo(
    () => historyRows.filter((row) => String(row.business_date || "").slice(0, 7) === historyMonth),
    [historyMonth, historyRows],
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
    setDraftItems((prev) => [
      ...prev,
      {
        item_id: item.id,
        item_name: item.name,
        sku: item.sku,
        quantity: 1,
        unit_cost: Number(item.cost || 0),
        action_type: "DECREASE",
        storage_unit: item.storage_unit || "",
        draftQtyText: "1",
      },
    ]);
  }

  function removeDraftItem(index: number) {
    setDraftItems((prev) => prev.filter((_, idx) => idx !== index));
  }

  function toggleActionType(index: number) {
    setDraftItems((prev) =>
      prev.map((item, idx) =>
        idx === index
          ? { ...item, action_type: item.action_type === "DECREASE" ? "INCREASE" : "DECREASE" }
          : item,
      ),
    );
  }

  function commitDraftQty(index: number, item: DraftItem) {
    const parsed = parseDraftNumber(item.draftQtyText);
    const qty = parsed === null ? NaN : parsed;
    if (!Number.isFinite(qty) || qty <= 0) {
      setDraftItems((prev) =>
        prev.map((it, idx) => (idx === index ? { ...it, draftQtyText: number3(it.quantity) } : it)),
      );
      return;
    }
    setDraftItems((prev) =>
      prev.map((it, idx) =>
        idx === index ? { ...it, quantity: Number(qty.toFixed(3)), draftQtyText: String(qty) } : it,
      ),
    );
  }

  async function refreshHistoryAndDetail(nextSelectedId = selectedAdjustmentId) {
    const historyRes = await inventoryGet<{ rows: QuantityAdjustmentRow[] }>(
      `/api/admin/inventory/quantity-adjustments?city=${encodeURIComponent(city)}&branch_code=${encodeURIComponent(branchCode)}&limit=500`,
    );
    setHistoryRows(historyRes.rows || []);
    if (nextSelectedId) {
      const detailRes = await inventoryGet<{ row: QuantityAdjustmentDetail }>(
        `/api/admin/inventory/quantity-adjustments/${encodeURIComponent(nextSelectedId)}?city=${encodeURIComponent(city)}`,
      );
      setSelectedAdjustment(detailRes.row || null);
    }
  }

  async function createAdjustment() {
    if (!branchCode) { setError("Please select a branch."); return; }
    if (!reason.trim()) { setError("Please select a reason."); return; }
    if (draftItems.length === 0) { setError("Please add at least one item."); return; }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const created = await inventoryPost<{ row: QuantityAdjustmentRow }>(
        "/api/admin/inventory/quantity-adjustments",
        { city, branch_code: branchCode, business_date: businessDate, reason, notes },
      );
      const adjustmentId = String(created?.row?.id || "");
      await inventoryPost(
        `/api/admin/inventory/quantity-adjustments/${encodeURIComponent(adjustmentId)}/items`,
        {
          city,
          items: draftItems.map((item) => ({
            item_id: item.item_id,
            item_name: item.item_name,
            sku: item.sku,
            quantity: item.quantity,
            unit_cost: item.unit_cost,
            action_type: item.action_type,
          })),
        },
      );
      await refreshHistoryAndDetail(adjustmentId);
      setDraftItems([]);
      setNotes("");
      setSuccess("Quantity adjustment draft saved.");
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
        `/api/admin/inventory/quantity-adjustments/${encodeURIComponent(selectedAdjustmentId)}/close`,
        { city },
      );
      await refreshHistoryAndDetail(selectedAdjustmentId);
      setSuccess("Quantity adjustment closed and posted to ledger.");
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
      const duplicated = await inventoryPost<{ row: QuantityAdjustmentRow }>(
        `/api/admin/inventory/quantity-adjustments/${encodeURIComponent(selectedAdjustmentId)}/duplicate`,
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
    if (!filteredHistory.length) return;
    const rows = filteredHistory.map((row) => ({
      adjustment_no: row.adjustment_no || "",
      city,
      branch_code: row.branch_code || "",
      branch_name: labelOf(city, row.branch_code),
      business_date: row.business_date || "",
      reason: row.reason || "",
      status: row.status || "",
      created_by: row.created_by || "",
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
    link.download = `quantity-adjustments-${city}-${historyMonth || monthNow()}.csv`;
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
        {/* City pill toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3">
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
              <span className="rounded-full bg-amber-500/15 px-3 py-1 text-amber-300">
                ✏️ Editing draft
              </span>
            ) : (
              <span className="rounded-full bg-sky-500/15 px-3 py-1 text-sky-300">
                ＋ New adjustment
              </span>
            )}
          </div>
        </div>

        {/* Settings fields */}
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Branch</label>
            <select
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={branchCode}
              onChange={(e) => setBranchCode(e.target.value)}
            >
              {BRANCHES[city].map((branch) => (
                <option key={branch.code} value={branch.code}>{branch.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Date</label>
            <input
              type="date"
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Reason</label>
            <select
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              <option value="WASTE">Waste</option>
              <option value="EXPIRED">Expired</option>
              <option value="LOSS">Loss</option>
              <option value="DAMAGE">Damage</option>
              <option value="MANUAL_FIX">Manual Fix</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
            />
          </div>
        </div>

        {error ? <div className="mt-3 rounded-xl bg-rose-950/30 px-3 py-2 text-sm text-rose-300">{error}</div> : null}
        {success ? <div className="mt-3 rounded-xl bg-emerald-950/30 px-3 py-2 text-sm text-emerald-300">{success}</div> : null}
      </section>

      {/* ── Item Library + Adjustment Lines ── */}
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
                    <div className="truncate text-xs text-neutral-500">
                      {item.sku || "—"}
                      {item.category ? ` · ${item.category}` : ""}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-lg bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">+</span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right: Adjustment Lines */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-neutral-100">Adjustment Lines</span>
            <span className="text-xs text-neutral-500">{draftItems.length} line{draftItems.length !== 1 ? "s" : ""}</span>
          </div>

          {draftItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-2 text-3xl">📋</div>
              <div className="text-sm text-neutral-400">No lines yet</div>
              <div className="mt-1 text-xs text-neutral-600">Tap + on an item from the library</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-neutral-500">
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2 text-center">Action</th>
                    <th className="px-3 py-2 text-center">Qty</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {draftItems.map((item, index) => {
                    const isDecrease = item.action_type === "DECREASE";
                    const step = getInventoryQuantityStep(item.storage_unit);
                    return (
                      <tr key={`${item.item_id}-${index}`} className="border-t border-neutral-800">
                        <td className="px-3 py-2">
                          <div className="text-neutral-100">{item.item_name}</div>
                          <div className="text-xs text-neutral-500">{item.sku || "—"}</div>
                        </td>

                        {/* Action type toggle pill */}
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => toggleActionType(index)}
                            className={[
                              "rounded-full px-3 py-1 text-xs font-semibold transition",
                              isDecrease
                                ? "bg-rose-500/15 text-rose-300 hover:bg-rose-500/25"
                                : "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25",
                            ].join(" ")}
                          >
                            {isDecrease ? "▼ Decrease" : "▲ Increase"}
                          </button>
                        </td>

                        {/* Qty input */}
                        <td className="px-3 py-2 text-center">
                          <input
                            type="text"
                            inputMode="decimal"
                            data-qty-input
                            value={item.draftQtyText}
                            onChange={(e) =>
                              setDraftItems((prev) =>
                                prev.map((it, idx) =>
                                  idx === index ? { ...it, draftQtyText: e.target.value } : it,
                                ),
                              )
                            }
                            onBlur={() => commitDraftQty(index, item)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                commitDraftQty(index, item);
                                const inputs = document.querySelectorAll<HTMLInputElement>("[data-qty-input]");
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
                                    const next = stepDraftNumber(it.draftQtyText, step, e.key === "ArrowUp" ? 1 : -1);
                                    return { ...it, draftQtyText: next };
                                  }),
                                );
                              }
                            }}
                            className={[
                              "w-20 rounded-xl border px-2 py-1.5 text-center text-sm font-semibold",
                              isDecrease
                                ? "border-rose-800/50 bg-rose-950/20 text-rose-200 focus:border-rose-600 focus:outline-none"
                                : "border-emerald-800/50 bg-emerald-950/20 text-emerald-200 focus:border-emerald-600 focus:outline-none",
                            ].join(" ")}
                          />
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

          {/* Save button */}
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
              disabled={!filteredHistory.length}
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
                  <th className="px-3 py-2">Reason</th>
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
                      <td className="px-3 py-2">
                        <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">
                          {REASON_LABELS[row.reason] || row.reason || "—"}
                        </span>
                      </td>
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
                    <div className="text-neutral-200 tabular-nums">{String(selectedAdjustment.business_date || "").slice(0, 10)}</div>
                  </div>
                  <div>
                    <div className="text-neutral-500">Reason</div>
                    <div className="text-neutral-200">{REASON_LABELS[selectedAdjustment.reason] || selectedAdjustment.reason || "—"}</div>
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
                      const isDecrease = item.action_type === "DECREASE";
                      return (
                        <div key={item.id} className="rounded-xl border border-neutral-800 bg-neutral-900/30 px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm text-neutral-200">{item.item_name}</div>
                              <div className="text-xs text-neutral-500">{item.sku || "—"}</div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className={[
                                "text-sm font-semibold",
                                isDecrease ? "text-rose-300" : "text-emerald-300",
                              ].join(" ")}>
                                {isDecrease ? "▼" : "▲"} {number3(item.quantity)}
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

                {/* Actions */}
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
      </section>
    </div>
  );
}
