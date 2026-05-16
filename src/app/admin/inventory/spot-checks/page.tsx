"use client";

import { useEffect, useMemo, useState } from "react";
import InventoryTabs from "@/components/InventoryTabs";
import InventoryRegistrationHelp from "@/components/InventoryRegistrationHelp";
import { canAccessInventoryWorkspace, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { BRANCHES, labelOf, type City } from "@/lib/branches";
import { defaultBranch, groupBySupplier, lineFromItem, monthNow, number3, todayIso, withVariance, type InventoryCountLine, type InventoryItemLookup } from "@/lib/inventoryCountUtils";
import { inventoryGet, inventoryPatch, inventoryPost } from "@/lib/inventoryClient";
import { formatDraftNumber, getInventoryQuantityStep, parseDraftNumber, stepDraftNumber } from "@/lib/quantityInput";

type BalanceRow = {
  item_id: string;
  on_hand_qty: number;
};

type SpotCheckRow = {
  id: string;
  spot_check_no: string;
  branch_code: string;
  business_date: string;
  pic_name: string;
  status: string;
  creator_name: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

type SpotCheckDetail = SpotCheckRow & {
  items?: InventoryCountLine[];
};

export default function InventorySpotChecksPage() {
  const auth = useMemo(() => getAuth(), []);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState<City>((auth?.city || "manila") as City);
  const [branchCode, setBranchCode] = useState(defaultBranch((auth?.city || "manila") as City));
  const [businessDate, setBusinessDate] = useState(todayIso());
  const [picName, setPicName] = useState(auth?.staffName || "");
  const [notes, setNotes] = useState("");
  const [historyMonth, setHistoryMonth] = useState(monthNow());
  const [itemSearch, setItemSearch] = useState("");
  const [itemOptions, setItemOptions] = useState<InventoryItemLookup[]>([]);
  const [balancesMap, setBalancesMap] = useState<Record<string, number>>({});
  const [draftLines, setDraftLines] = useState<InventoryCountLine[]>([]);
  const [draftQtyInputs, setDraftQtyInputs] = useState<Record<string, string>>({});
  const [historyRows, setHistoryRows] = useState<SpotCheckRow[]>([]);
  const [selectedSpotCheckId, setSelectedSpotCheckId] = useState("");
  const [draftSpotCheckId, setDraftSpotCheckId] = useState("");
  const [selectedSpotCheck, setSelectedSpotCheck] = useState<SpotCheckDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => void } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const resolved = await refreshAuthFromApi(auth);
      if (cancelled) return;
      const nextCity = (resolved?.city || auth?.city || "manila") as City;
      setAllowed(canAccessInventoryWorkspace(resolved));
      setCity(nextCity);
      setBranchCode(defaultBranch(nextCity));
      setPicName(resolved?.staffName || auth?.staffName || "");
      setReady(true);
    }
    void init();
    return () => { cancelled = true; };
  }, [auth]);

  useEffect(() => {
    setBranchCode(defaultBranch(city));
    setSelectedSpotCheckId("");
    setDraftSpotCheckId("");
    setSelectedSpotCheck(null);
    setDraftLines([]);
  }, [city]);

  useEffect(() => {
    if (!ready || !allowed) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [itemsRes, spotRes, balancesRes] = await Promise.all([
          inventoryGet<{ rows: InventoryItemLookup[] }>(`/api/admin/inventory/items?city=${encodeURIComponent(city)}&tab=ITEMS&limit=5000`),
          inventoryGet<{ rows: SpotCheckRow[] }>(`/api/admin/inventory/spot-checks?city=${encodeURIComponent(city)}&branch_code=${encodeURIComponent(branchCode)}&limit=500`),
          inventoryGet<{ rows: BalanceRow[] }>(`/api/admin/inventory/balances?city=${encodeURIComponent(city)}&branch_code=${encodeURIComponent(branchCode)}&business_date=${encodeURIComponent(businessDate)}&limit=1000`),
        ]);
        if (cancelled) return;
        setItemOptions((itemsRes.rows || []).filter((item) => item.status !== "DELETED"));
        setHistoryRows(spotRes.rows || []);
        const balanceMap: Record<string, number> = {};
        for (const row of balancesRes.rows || []) balanceMap[String(row.item_id || "")] = Number(row.on_hand_qty || 0);
        setBalancesMap(balanceMap);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [allowed, branchCode, businessDate, city, ready]);

  useEffect(() => {
    if (!selectedSpotCheckId || !allowed) {
      setSelectedSpotCheck(null);
      return;
    }
    let cancelled = false;
    async function loadDetail() {
      try {
        const res = await inventoryGet<{ row: SpotCheckDetail }>(
          `/api/admin/inventory/spot-checks/${encodeURIComponent(selectedSpotCheckId)}?city=${encodeURIComponent(city)}`,
        );
        if (!cancelled) setSelectedSpotCheck(res.row || null);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      }
    }
    void loadDetail();
    return () => { cancelled = true; };
  }, [allowed, city, selectedSpotCheckId]);

  const filteredHistory = useMemo(
    () => historyRows.filter((row) => String(row.business_date || "").slice(0, 7) === historyMonth),
    [historyMonth, historyRows],
  );

  const groupedDraft = useMemo(() => groupBySupplier(draftLines), [draftLines]);
  const editingExistingDraft = Boolean(draftSpotCheckId);
  const selectedSpotCheckIsDraft = selectedSpotCheck?.status === "DRAFT";

  // Item library — filtered + grouped
  const draftItemIdSet = useMemo(() => new Set(draftLines.map((l) => String(l.item_id || "")).filter(Boolean)), [draftLines]);

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return itemOptions;
    return itemOptions.filter((item) =>
      `${item.supplier_name || ""} ${item.name || ""} ${item.sku || ""}`.toLowerCase().includes(q),
    );
  }, [itemOptions, itemSearch]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, InventoryItemLookup[]>();
    filteredItems.forEach((item) => {
      const supplier = String(item.supplier_name || "").trim() || "Unknown supplier";
      const rows = groups.get(supplier) || [];
      rows.push(item);
      groups.set(supplier, rows);
    });
    return Array.from(groups.entries())
      .map(([supplier, rows]) => ({
        supplier,
        rows: [...rows].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))),
      }))
      .sort((a, b) => a.supplier.localeCompare(b.supplier));
  }, [filteredItems]);

  function refreshLineWithBalance(line: InventoryCountLine): InventoryCountLine {
    return withVariance({
      ...line,
      theoretical_qty: Number(balancesMap[line.item_id] ?? line.theoretical_qty ?? 0),
    });
  }

  useEffect(() => {
    if (!draftLines.length) return;
    setDraftLines((prev) =>
      prev.map((line) => withVariance({ ...line, theoretical_qty: Number(balancesMap[line.item_id] ?? 0) })),
    );
  }, [balancesMap, draftLines.length]);

  useEffect(() => {
    const nextInputs: Record<string, string> = {};
    draftLines.forEach((line, index) => {
      nextInputs[String(index)] = formatDraftNumber(line.counted_qty, "0");
    });
    setDraftQtyInputs(nextInputs);
  }, [draftLines]);

  function updateDraftLine(index: number, patch: Partial<InventoryCountLine>) {
    setDraftLines((prev) => prev.map((line, idx) => (idx === index ? withVariance({ ...line, ...patch }) : line)));
  }

  function draftQtyValue(index: number, line: InventoryCountLine) {
    return draftQtyInputs[String(index)] ?? formatDraftNumber(line.counted_qty, "0");
  }

  function commitDraftQty(index: number, line: InventoryCountLine) {
    const parsedQty = parseDraftNumber(draftQtyValue(index, line));
    const nextQty = parsedQty === null || parsedQty < 0 ? 0 : parsedQty;
    updateDraftLine(index, { counted_qty: nextQty });
  }

  function syncedDraftLines() {
    return draftLines.map((line, index) => {
      const parsedQty = parseDraftNumber(draftQtyValue(index, line));
      return withVariance({ ...line, counted_qty: parsedQty === null || parsedQty < 0 ? 0 : parsedQty });
    });
  }

  function appendItemToDraft(item: InventoryItemLookup) {
    if (draftLines.some((line) => line.item_id === item.id)) return;
    setError("");
    setDraftLines((prev) => [...prev, refreshLineWithBalance(lineFromItem(item, prev.length + 1))]);
  }

  function removeItemFromDraft(itemId: string) {
    setDraftLines((prev) =>
      prev.filter((l) => String(l.item_id || "") !== itemId).map((line, idx) => ({ ...line, sort_order: idx + 1 })),
    );
  }

  function removeDraftLine(index: number) {
    setDraftLines((prev) =>
      prev.filter((_, idx) => idx !== index).map((line, idx) => ({ ...line, sort_order: idx + 1 })),
    );
  }

  function loadSelectedSpotCheckToDraft() {
    if (!selectedSpotCheck) return;
    const nextBusinessDate = String(selectedSpotCheck.business_date || "").slice(0, 10) || todayIso();
    const nextBranchCode = selectedSpotCheck.branch_code || defaultBranch(city);
    setBusinessDate(nextBusinessDate);
    setBranchCode(nextBranchCode);
    setDraftLines((selectedSpotCheck.items || []).map((line, index) => refreshLineWithBalance({ ...line, sort_order: index + 1 })));
    setNotes(selectedSpotCheck.notes || "");
    setPicName(selectedSpotCheck.pic_name || "");
    setDraftSpotCheckId(selectedSpotCheck.status === "DRAFT" ? selectedSpotCheck.id : "");
    setError("");
    setSuccess(selectedSpotCheck.status === "DRAFT" ? "Loaded selected DRAFT for editing." : "Loaded selected spot check as a new draft.");
  }

  function resetDraft() {
    setDraftSpotCheckId("");
    setDraftLines([]);
    setBusinessDate(todayIso());
    setNotes("");
    setPicName(auth?.staffName || "");
    setError("");
    setSuccess("Started a new spot check draft.");
  }

  async function refreshHistoryAndDetail(nextSelectedId = selectedSpotCheckId) {
    const historyRes = await inventoryGet<{ rows: SpotCheckRow[] }>(`/api/admin/inventory/spot-checks?city=${encodeURIComponent(city)}&branch_code=${encodeURIComponent(branchCode)}&limit=500`);
    setHistoryRows(historyRes.rows || []);
    if (nextSelectedId) {
      const detailRes = await inventoryGet<{ row: SpotCheckDetail }>(`/api/admin/inventory/spot-checks/${encodeURIComponent(nextSelectedId)}?city=${encodeURIComponent(city)}`);
      setSelectedSpotCheck(detailRes.row || null);
    }
  }

  async function saveDraft() {
    if (!branchCode) { setError("Please select a branch."); return; }
    if (!draftLines.length) { setError("Please add at least one item."); return; }
    const nextDraftLines = syncedDraftLines();
    const uniqueItemIds = new Set(nextDraftLines.map((line) => line.item_id).filter(Boolean));
    if (uniqueItemIds.size !== nextDraftLines.length) {
      setError("Duplicate items are not allowed in one spot check.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      let spotCheckId = draftSpotCheckId;
      if (spotCheckId) {
        await inventoryPatch(`/api/admin/inventory/spot-checks/${encodeURIComponent(spotCheckId)}`, {
          city, branch_code: branchCode, business_date: businessDate, pic_name: picName, notes,
        });
      } else {
        const created = await inventoryPost<{ row: SpotCheckRow }>("/api/admin/inventory/spot-checks", {
          city, branch_code: branchCode, business_date: businessDate, pic_name: picName, notes,
        });
        spotCheckId = String(created?.row?.id || "");
      }
      await inventoryPost(`/api/admin/inventory/spot-checks/${encodeURIComponent(spotCheckId)}/items`, {
        city,
        items: nextDraftLines.map((line, index) => ({ ...line, sort_order: index + 1 })),
      });
      setDraftLines(nextDraftLines);
      await refreshHistoryAndDetail(spotCheckId);
      setSelectedSpotCheckId(spotCheckId);
      setDraftSpotCheckId(spotCheckId);
      setSuccess(editingExistingDraft ? "Spot check draft updated." : "Spot check draft saved.");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  function confirmCloseSpotCheck() {
    if (!selectedSpotCheckId) return;
    const itemCount = (selectedSpotCheck?.items || []).length;
    setConfirmModal({
      title: "Close spot check and post to ledger?",
      message: `Spot check ${selectedSpotCheck?.spot_check_no || ""} (${itemCount} item${itemCount !== 1 ? "s" : ""}) will be closed and variances posted to the inventory ledger. This cannot be undone.`,
      confirmLabel: "Close & Post",
      danger: true,
      onConfirm: () => { setConfirmModal(null); void closeSelectedSpotCheck(); },
    });
  }

  async function closeSelectedSpotCheck() {
    if (!selectedSpotCheckId) return;
    setActionLoading(true);
    setError("");
    setSuccess("");
    try {
      await inventoryPost(`/api/admin/inventory/spot-checks/${encodeURIComponent(selectedSpotCheckId)}/close`, { city });
      await refreshHistoryAndDetail(selectedSpotCheckId);
      if (draftSpotCheckId === selectedSpotCheckId) setDraftSpotCheckId("");
      setSuccess("Spot check closed. Variances posted to ledger.");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setActionLoading(false);
    }
  }

  if (!ready) return <div className="text-sm text-neutral-500">Loading spot checks...</div>;
  if (!allowed) return <div className="text-sm text-neutral-500">You do not have permission to open inventory.</div>;

  return (
    <div className="space-y-6">
      <InventoryTabs />
      <InventoryRegistrationHelp />

      {/* ── Header & Settings ── */}
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold text-neutral-100">Quick Spot Check</div>
            <div className="mt-1 text-sm text-neutral-400">Count selected items at any time, independent of the monthly Full Count cycle. Pick items from the library, enter quantities, save a draft, then close to post variances.</div>
          </div>
          {/* City toggle */}
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
            {(["manila", "dubai"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  if (c === city) return;
                  if (draftLines.length > 0) {
                    setConfirmModal({
                      title: `Switch to ${c.charAt(0).toUpperCase() + c.slice(1)}?`,
                      message: `Your current draft (${draftLines.length} item${draftLines.length !== 1 ? "s" : ""}) will be cleared.`,
                      confirmLabel: "Switch & Clear Draft",
                      danger: true,
                      onConfirm: () => { setConfirmModal(null); setCity(c); },
                    });
                    return;
                  }
                  setCity(c);
                }}
                className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-all ${city === c ? "bg-violet-600 text-white shadow" : "text-neutral-400 hover:text-white"}`}
              >
                {c === "manila" ? "🇵🇭 Manila" : "🇦🇪 Dubai"}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Branch</label>
            <select
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
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
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">PIC</label>
            <input
              value={picName}
              onChange={(e) => setPicName(e.target.value)}
              placeholder="Name"
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Notes</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
            />
          </div>
        </div>

        {error ? <div className="mt-3 rounded-lg bg-rose-950/30 px-3 py-2 text-sm text-rose-300">{error}</div> : null}
        {success ? <div className="mt-3 rounded-lg bg-emerald-950/30 px-3 py-2 text-sm text-emerald-300">{success}</div> : null}
      </section>

      {/* ── Main Workspace ── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[340px_1fr]">

        {/* LEFT: Item Library */}
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-neutral-100">Item Library</div>
            <span className="text-xs text-neutral-500">{filteredItems.length} items</span>
          </div>

          <div className="mt-3">
            <input
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              placeholder="Search by name, SKU, supplier…"
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
            />
          </div>

          {!itemOptions.length ? (
            <div className="mt-3 rounded-xl border border-amber-900/70 bg-amber-950/20 px-3 py-3 text-sm text-amber-200">
              No items registered yet.
            </div>
          ) : (
            <div className="mt-3 max-h-[540px] space-y-3 overflow-y-auto pr-1">
              {groupedItems.map((group) => {
                const allInDraft = group.rows.every((item) => draftItemIdSet.has(String(item.id)));
                const anyNotInDraft = group.rows.some((item) => !draftItemIdSet.has(String(item.id)));
                return (
                <div key={group.supplier}>
                  <div className="mb-1 flex items-center justify-between px-1">
                    <span className="text-xs font-semibold text-amber-400/80">{group.supplier}</span>
                    {anyNotInDraft && (
                      <button
                        type="button"
                        onClick={() => group.rows.forEach((item) => appendItemToDraft(item))}
                        className="rounded px-2 py-0.5 text-[10px] font-medium text-emerald-400 hover:bg-emerald-950/30"
                        title={`Add all items from ${group.supplier}`}
                      >
                        Add All ({group.rows.filter((item) => !draftItemIdSet.has(String(item.id))).length})
                      </button>
                    )}
                    {allInDraft && (
                      <span className="text-[10px] text-emerald-600">✓ All added</span>
                    )}
                  </div>
                  {group.rows.map((item) => {
                    const inDraft = draftItemIdSet.has(String(item.id));
                    return (
                      <div
                        key={item.id}
                        className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition ${inDraft ? "bg-emerald-950/20" : "hover:bg-white/5"}`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className={`truncate text-sm ${inDraft ? "text-emerald-200" : "text-neutral-200"}`}>{item.name}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            {item.category_name && <span className="text-[10px] text-neutral-500">{item.category_name}</span>}
                            {item.sku && <span className="text-[10px] text-neutral-600">{item.sku}</span>}
                            {item.item_type && item.item_type !== "ITEM" && (
                              <span className="rounded px-1 py-px text-[9px] font-semibold bg-violet-900/50 text-violet-300">{item.item_type}</span>
                            )}
                          </div>
                        </div>
                        <span className="shrink-0 text-xs text-neutral-500">{item.storage_unit || ""}</span>
                        {inDraft ? (
                          <button
                            type="button"
                            onClick={() => removeItemFromDraft(String(item.id))}
                            className="shrink-0 rounded-lg border border-rose-700/60 bg-rose-950/30 px-2 py-0.5 text-xs font-medium text-rose-300 hover:bg-rose-900/40"
                            title="Remove from spot check"
                          >✕</button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => appendItemToDraft(item)}
                            className="shrink-0 rounded-lg border border-emerald-700/60 bg-emerald-950/20 px-2 py-0.5 text-xs font-medium text-emerald-300 hover:bg-emerald-900/40"
                            title="Add to spot check"
                          >+</button>
                        )}
                      </div>
                    );
                  })}
                </div>
                );
              })}
              {groupedItems.length === 0 && (
                <div className="py-6 text-center text-xs text-neutral-500">No items matched your search.</div>
              )}
            </div>
          )}
        </section>

        {/* RIGHT: Spot Check Grid */}
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-neutral-100">Spot Check Grid</div>
                {editingExistingDraft
                  ? <span className="rounded-md bg-amber-900/30 px-2 py-0.5 text-xs text-amber-300">
                      Editing {selectedSpotCheck?.spot_check_no || "draft"}
                    </span>
                  : <span className="rounded-md bg-sky-900/30 px-2 py-0.5 text-xs text-sky-400">New draft</span>}
              </div>
              <div className="mt-0.5 text-xs text-neutral-500">
                {draftLines.length === 0
                  ? "Pick items from the library on the left."
                  : `${draftLines.length} item${draftLines.length !== 1 ? "s" : ""} · Enter to move down · ↑↓ to adjust qty`}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={resetDraft}
                className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
              >
                + New Draft
              </button>
              <button
                type="button"
                onClick={saveDraft}
                disabled={saving || draftLines.length === 0}
                className="rounded-xl border border-emerald-800 bg-emerald-950/30 px-4 py-1.5 text-sm font-medium text-emerald-200 hover:bg-emerald-900/30 disabled:opacity-50"
              >
                {saving ? "Saving…" : editingExistingDraft ? "Update Draft" : "Save Draft"}
              </button>
            </div>
          </div>

          {draftLines.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-neutral-800 bg-neutral-950/30 py-14 text-center">
              <div className="text-3xl">🔍</div>
              <div className="mt-2 text-sm text-neutral-500">Add items from the library to start your spot check</div>
              <div className="mt-1 text-xs text-neutral-600">Items are grouped by supplier for easier counting</div>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {groupedDraft.map((group) => (
                <section key={group.supplier} className="rounded-xl border border-neutral-800 bg-neutral-950/20">
                  <div className="border-b border-neutral-800 px-3 py-2 text-xs font-semibold text-amber-400/80">{group.supplier}</div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead className="border-b border-neutral-800 text-neutral-500">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Item</th>
                          <th className="px-3 py-2 text-left font-medium w-16">Unit</th>
                          <th className="px-3 py-2 text-right font-medium w-24 text-neutral-400">Theoretical</th>
                          <th className="px-3 py-2 text-right font-medium w-28 text-emerald-400">Counted</th>
                          <th className="px-3 py-2 text-right font-medium w-24">Variance</th>
                          <th className="px-3 py-2 text-left font-medium">Memo</th>
                          <th className="px-3 py-2 w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((line) => {
                          const index = draftLines.indexOf(line);
                          const variance = Number(line.variance_qty || 0);
                          const varianceClass =
                            variance === 0
                              ? "text-neutral-500"
                              : variance > 0
                              ? "text-emerald-300 font-medium"
                              : "text-rose-300 font-medium";
                          return (
                            <tr
                              key={`${line.sku}-${index}-${line.item_name}`}
                              className="border-t border-neutral-800/60 hover:bg-white/[0.02]"
                            >
                              {/* Item name + supplier sub-text */}
                              <td className="px-3 py-2">
                                <div className="text-sm text-neutral-200">{line.item_name || "-"}</div>
                                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-neutral-600">
                                  {line.sku && <span>{line.sku}</span>}
                                  {line.category && <span>{line.category}</span>}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-neutral-400">{line.storage_unit || "-"}</td>
                              {/* Theoretical — read-only, from balances */}
                              <td className="px-3 py-2 text-right text-neutral-500">{number3(line.theoretical_qty)}</td>
                              {/* Counted qty — primary input */}
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={draftQtyValue(index, line)}
                                  onChange={(e) => setDraftQtyInputs((prev) => ({ ...prev, [String(index)]: e.target.value }))}
                                  onBlur={() => commitDraftQty(index, line)}
                                  onKeyDown={(e) => {
                                    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                                      e.preventDefault();
                                      const step = getInventoryQuantityStep(line.storage_unit);
                                      setDraftQtyInputs((prev) => ({
                                        ...prev,
                                        [String(index)]: stepDraftNumber(draftQtyValue(index, line), step, e.key === "ArrowUp" ? 1 : -1),
                                      }));
                                      return;
                                    }
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      commitDraftQty(index, line);
                                      // Move focus to next row
                                      const inputs = document.querySelectorAll<HTMLInputElement>("[data-qty-input]");
                                      const current = e.currentTarget as HTMLInputElement;
                                      const currentIdx = Array.from(inputs).indexOf(current);
                                      if (currentIdx >= 0 && inputs[currentIdx + 1]) inputs[currentIdx + 1].focus();
                                    }
                                  }}
                                  data-qty-input
                                  className="w-24 rounded-lg border border-emerald-800 bg-emerald-950/20 px-2 py-1.5 text-right text-sm font-medium text-emerald-100 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                                />
                              </td>
                              {/* Variance */}
                              <td className={`px-3 py-2 text-right text-sm ${varianceClass}`}>
                                {variance === 0 ? "—" : (variance > 0 ? "+" : "") + number3(variance)}
                              </td>
                              {/* Memo */}
                              <td className="px-3 py-2">
                                <input
                                  value={line.memo}
                                  onChange={(e) => updateDraftLine(index, { memo: e.target.value })}
                                  placeholder="—"
                                  className="w-28 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-neutral-500 placeholder-neutral-700 hover:border-neutral-700 focus:border-neutral-600 focus:bg-neutral-950 focus:outline-none"
                                />
                              </td>
                              {/* Remove */}
                              <td className="px-2 py-2 text-right">
                                <button
                                  type="button"
                                  onClick={() => removeDraftLine(index)}
                                  className="rounded px-1.5 py-1 text-neutral-600 transition hover:text-rose-400"
                                  title="Remove row"
                                >×</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── History ── */}
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-neutral-100">History</div>
            <div className="mt-0.5 text-xs text-neutral-500">Select a spot check to view details, load for editing, or close it.</div>
          </div>
          <input
            type="month"
            lang="en"
            value={historyMonth}
            onChange={(e) => setHistoryMonth(e.target.value)}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
          {/* History table */}
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-3 py-2">No.</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Branch</th>
                  <th className="px-3 py-2">PIC</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((row) => {
                  const isClosed = row.status === "CLOSED";
                  return (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedSpotCheckId(row.id)}
                      className={[
                        "border-t border-neutral-800 text-neutral-200 cursor-pointer transition",
                        selectedSpotCheckId === row.id ? "bg-emerald-950/20" : "hover:bg-white/5",
                      ].join(" ")}
                    >
                      <td className="px-3 py-2 font-medium">{row.spot_check_no}</td>
                      <td className="px-3 py-2 text-neutral-400">{String(row.business_date || "").slice(0, 10)}</td>
                      <td className="px-3 py-2 text-neutral-400">{labelOf(city, row.branch_code)}</td>
                      <td className="px-3 py-2 text-neutral-400">{row.pic_name || row.creator_name || "-"}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${isClosed ? "bg-neutral-800 text-neutral-400" : "bg-amber-900/30 text-amber-300"}`}>
                          {row.status || "-"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {!loading && filteredHistory.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-neutral-500">No spot check history for this period.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Detail panel */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/20 p-4">
            {!selectedSpotCheck ? (
              <div className="text-sm text-neutral-500">← Select a spot check to see its details</div>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-neutral-100">{selectedSpotCheck.spot_check_no}</div>
                    <div className="mt-0.5 text-xs text-neutral-500">
                      {labelOf(city, selectedSpotCheck.branch_code)} · {selectedSpotCheck.pic_name || selectedSpotCheck.creator_name || "-"}
                    </div>
                    {selectedSpotCheck.notes ? (
                      <div className="mt-1 text-xs text-neutral-400">{selectedSpotCheck.notes}</div>
                    ) : null}
                  </div>
                  <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${selectedSpotCheck.status === "CLOSED" ? "bg-neutral-800 text-neutral-400" : "bg-amber-900/30 text-amber-300"}`}>
                    {selectedSpotCheck.status}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={loadSelectedSpotCheckToDraft}
                      disabled={!selectedSpotCheck || actionLoading}
                      className="rounded-lg border border-violet-700/70 bg-violet-950/30 px-3 py-1.5 text-xs font-medium text-violet-200 hover:bg-violet-900/30 disabled:opacity-50"
                    >
                      {selectedSpotCheckIsDraft ? "Edit Draft ↑" : "Copy as New Draft ↑"}
                    </button>
                    <span className="mt-1 text-[10px] text-neutral-600">
                      {selectedSpotCheckIsDraft ? "Continue editing this draft" : "Replaces current draft with these items"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={confirmCloseSpotCheck}
                    disabled={!selectedSpotCheckId || actionLoading || selectedSpotCheck?.status === "CLOSED"}
                    className="rounded-lg border border-emerald-800 bg-emerald-950/30 px-3 py-1.5 text-xs text-emerald-200 disabled:opacity-50"
                  >
                    {actionLoading ? "Processing…" : selectedSpotCheck?.status === "CLOSED" ? "Closed" : "Close & Post"}
                  </button>
                </div>

                <div className="mt-4 max-h-72 space-y-1.5 overflow-y-auto">
                  {(selectedSpotCheck.items || []).map((item, i) => {
                    const variance = Number(item.variance_qty || 0);
                    const varClass = variance === 0 ? "text-neutral-500" : variance > 0 ? "text-emerald-400" : "text-rose-400";
                    return (
                      <div key={`${item.sku}-${i}`} className="rounded-lg border border-neutral-800 bg-neutral-900/30 px-3 py-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-neutral-200">{item.item_name}</span>
                          <span className={`font-medium ${varClass}`}>
                            {variance === 0 ? "±0" : (variance > 0 ? "+" : "") + number3(variance)}
                          </span>
                        </div>
                        <div className="mt-0.5 text-neutral-500">
                          {item.storage_unit || ""} · Theo {number3(item.theoretical_qty)} · Count {number3(item.counted_qty)}
                        </div>
                      </div>
                    );
                  })}
                  {!(selectedSpotCheck.items || []).length && (
                    <div className="text-xs text-neutral-500">No rows linked.</div>
                  )}
                </div>
              </>
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
