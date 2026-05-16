"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import InventoryTabs from "@/components/InventoryTabs";
import { canAccessInventoryWorkspace, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { BRANCHES, labelOf, type City } from "@/lib/branches";
import { defaultBranch, groupBySupplier, lineFromItem, monthNow, number3, todayIso, withVariance, type InventoryCountLine, type InventoryItemLookup } from "@/lib/inventoryCountUtils";
import { inventoryGet, inventoryPatch, inventoryPost } from "@/lib/inventoryClient";
import { formatDraftNumber, getInventoryQuantityStep, parseDraftNumber, stepDraftNumber } from "@/lib/quantityInput";

type CountSheetRow = {
  id: string;
  name: string;
  reference?: string;
  branch_code: string;
  cycle: string;
  source_sheet_name: string;
  status: string;
};

type CountSheetDetail = CountSheetRow & {
  items?: InventoryCountLine[];
};

type CurrentCountSheetResponse = {
  row?: CountSheetDetail | null;
  match_count?: number;
};

type BalanceRow = {
  item_id: string;
  on_hand_qty: number;
};

type CountRow = {
  id: string;
  count_no: string;
  branch_code: string;
  business_date: string;
  cycle: string;
  count_sheet_name: string;
  pic_name: string;
  approver_name: string;
  status: string;
  creator_name: string;
  notes: string;
  submitted_by?: string;
  submitted_at?: string;
  closed_by?: string;
  closed_at?: string;
  created_at: string;
  updated_at: string;
};

type CountDetail = CountRow & {
  items?: InventoryCountLine[];
};

export default function InventoryCountsPage() {
  const auth = useMemo(() => getAuth(), []);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState<City>((auth?.city || "manila") as City);
  const [branchCode, setBranchCode] = useState(defaultBranch((auth?.city || "manila") as City));
  const [businessDate, setBusinessDate] = useState(todayIso());
  const [cycle, setCycle] = useState("15TH");
  const [picName, setPicName] = useState(auth?.staffName || "");
  const [approverName, setApproverName] = useState("");
  const [notes, setNotes] = useState("");
  const [historyMonth, setHistoryMonth] = useState(monthNow());
  const [selectedCountSheetId, setSelectedCountSheetId] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [itemOptions, setItemOptions] = useState<InventoryItemLookup[]>([]);
  const [countSheetOptions, setCountSheetOptions] = useState<CountSheetRow[]>([]);
  const [draftLines, setDraftLines] = useState<InventoryCountLine[]>([]);
  const [draftQtyInputs, setDraftQtyInputs] = useState<Record<string, string>>({});
  const [historyRows, setHistoryRows] = useState<CountRow[]>([]);
  const [selectedCountId, setSelectedCountId] = useState("");
  const [selectedCount, setSelectedCount] = useState<CountDetail | null>(null);
  const [balancesMap, setBalancesMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  // Draft UX state
  const [draftSearch, setDraftSearch] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [showDetailColumns, setShowDetailColumns] = useState(false);
  // Template picker — auto-loads on select
  const [templatePickerId, setTemplatePickerId] = useState("");
  // Inline item editing state
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemUnit, setEditItemUnit] = useState("");
  const [editItemPrice, setEditItemPrice] = useState("");
  const [editItemSupplier, setEditItemSupplier] = useState("");
  const [editItemMemo, setEditItemMemo] = useState("");
  const [editItemSaving, setEditItemSaving] = useState(false);
  // Generic confirm modal
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => void } | null>(null);

  const refreshLineWithBalance = useCallback((line: InventoryCountLine, balanceLookup: Record<string, number> = balancesMap): InventoryCountLine => {
    return withVariance({
      ...line,
      theoretical_qty: Number(balanceLookup[line.item_id] || line.theoretical_qty || 0),
    });
  }, [balancesMap]);

  // Build item_id → master lookup (moved up so applySheetToDraft can use it)
  const itemMasterById = useMemo(() => {
    const map: Record<string, typeof itemOptions[number]> = {};
    for (const item of itemOptions) map[item.id] = item;
    return map;
  }, [itemOptions]);

  const applySheetToDraft = useCallback((sheet: CountSheetDetail | null, balanceLookup: Record<string, number> = balancesMap) => {
    if (!sheet) return;
    setDraftLines((sheet.items || []).map((line, index) => {
      // Always apply current master data (unit, price, supplier) so stale template values are overwritten
      const master = itemMasterById[line.item_id];
      const merged: InventoryCountLine = master ? {
        ...line,
        storage_unit: master.storage_unit || line.storage_unit,
        unit_price: Number(master.cost ?? line.unit_price),
        supplier_name: master.supplier_name || line.supplier_name,
        category: master.category_name || line.category,
        sort_order: index + 1,
        counted_qty: 0,
        variance_qty: 0,
      } : { ...line, counted_qty: 0, variance_qty: 0, sort_order: index + 1 };
      return refreshLineWithBalance(merged, balanceLookup);
    }));
  }, [balancesMap, itemMasterById, refreshLineWithBalance]);

  // Stable ref so useEffects below don't re-fire every time balancesMap changes
  const applySheetToDraftRef = useRef(applySheetToDraft);
  useEffect(() => { applySheetToDraftRef.current = applySheetToDraft; });

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
    return () => {
      cancelled = true;
    };
  }, [auth]);

  useEffect(() => {
    setBranchCode(defaultBranch(city));
    setSelectedCountId("");
    setSelectedCount(null);
    setSelectedCountSheetId("");
    setTemplatePickerId("");
    setDraftLines([]);
  }, [city]);

  useEffect(() => {
    if (!ready || !allowed) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [itemsRes, sheetsRes, currentRes, countsRes, balancesRes] = await Promise.all([
          inventoryGet<{ rows: InventoryItemLookup[] }>(`/api/admin/inventory/items?city=${encodeURIComponent(city)}&tab=ITEMS&limit=5000&slim=1`),
          inventoryGet<{ rows: CountSheetRow[] }>(`/api/admin/inventory/count-sheets?city=${encodeURIComponent(city)}&tab=ACTIVE&limit=500`),
          inventoryGet<CurrentCountSheetResponse>(`/api/admin/inventory/count-sheets/current?city=${encodeURIComponent(city)}&branch_code=${encodeURIComponent(branchCode)}&cycle=${encodeURIComponent(cycle)}`),
          inventoryGet<{ rows: CountRow[] }>(`/api/admin/inventory/counts?city=${encodeURIComponent(city)}&branch_code=${encodeURIComponent(branchCode)}&limit=500`),
          inventoryGet<{ rows: BalanceRow[] }>(`/api/admin/inventory/balances?city=${encodeURIComponent(city)}&branch_code=${encodeURIComponent(branchCode)}&limit=1000`),
        ]);
        if (cancelled) return;
        setItemOptions((itemsRes.rows || []).filter((item) => item.status !== "DELETED"));
        const activeSheets = (sheetsRes.rows || []).filter((row) => row.status !== "DELETED" && row.branch_code === branchCode && (!row.cycle || row.cycle === cycle));
        setCountSheetOptions(activeSheets);
        setHistoryRows(countsRes.rows || []);
        const balanceMap: Record<string, number> = {};
        for (const row of balancesRes.rows || []) balanceMap[String(row.item_id || "")] = Number(row.on_hand_qty || 0);
        setBalancesMap(balanceMap);
        const matchCount = Number(currentRes?.match_count || 0);
        if (matchCount === 1 && currentRes?.row) {
          const autoId = String(currentRes.row.id || "");
          setSelectedCountSheetId(autoId);
          setTemplatePickerId(autoId);
          applySheetToDraftRef.current(currentRes.row, balanceMap);
        } else if (!activeSheets.some((row) => row.id === selectedCountSheetId)) {
          setSelectedCountSheetId("");
        }
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
  }, [allowed, branchCode, city, cycle, ready, selectedCountSheetId]);

  useEffect(() => {
    if (!selectedCountId || !allowed) {
      setSelectedCount(null);
      return;
    }
    let cancelled = false;
    async function loadDetail() {
      try {
        const res = await inventoryGet<{ row: CountDetail }>(`/api/admin/inventory/counts/${encodeURIComponent(selectedCountId)}?city=${encodeURIComponent(city)}`);
        if (!cancelled) setSelectedCount(res.row || null);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      }
    }
    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [allowed, city, selectedCountId]);

  useEffect(() => {
    if (!selectedCountSheetId || !allowed) return;
    let cancelled = false;
    async function loadSelectedSheet() {
      try {
        const res = await inventoryGet<{ row: CountSheetDetail }>(`/api/admin/inventory/count-sheets/${encodeURIComponent(selectedCountSheetId)}?city=${encodeURIComponent(city)}`);
        if (!cancelled) applySheetToDraftRef.current(res.row || null);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      }
    }
    void loadSelectedSheet();
    return () => {
      cancelled = true;
    };
  }, [allowed, city, selectedCountSheetId]);

  const selectedItem = useMemo(
    () => itemOptions.find((item) => item.id === selectedItemId) || null,
    [itemOptions, selectedItemId],
  );

  const filteredHistory = useMemo(
    () => historyRows.filter((row) => String(row.business_date || "").slice(0, 7) === historyMonth),
    [historyMonth, historyRows],
  );

  const groupedDraft = useMemo(() => groupBySupplier(draftLines), [draftLines]);

  const countedLineCount = useMemo(
    () => draftLines.filter((l) => Number(l.counted_qty) > 0).length,
    [draftLines],
  );

  const filteredGroupedDraft = useMemo(() => {
    const q = draftSearch.toLowerCase().trim();
    if (!q) return groupedDraft;
    return groupedDraft
      .map((g) => ({
        ...g,
        rows: g.rows.filter(
          (l) =>
            l.item_name.toLowerCase().includes(q) ||
            (l.sku || "").toLowerCase().includes(q) ||
            (l.category || "").toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.rows.length > 0);
  }, [groupedDraft, draftSearch]);

  function toggleGroup(supplier: string) {
    setCollapsedGroups((prev) => ({ ...prev, [supplier]: !prev[supplier] }));
  }

  useEffect(() => {
    const nextInputs: Record<string, string> = {};
    draftLines.forEach((line, index) => {
      nextInputs[String(index)] = formatDraftNumber(line.counted_qty, "0");
    });
    setDraftQtyInputs(nextInputs);
  }, [draftLines]);

  function updateDraftLine(index: number, patch: Partial<InventoryCountLine>) {
    setDraftLines((prev) =>
      prev.map((line, idx) => (idx === index ? withVariance({ ...line, ...patch }) : line)),
    );
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
      return withVariance({
        ...line,
        counted_qty: parsedQty === null || parsedQty < 0 ? 0 : parsedQty,
      });
    });
  }



  function addManualItem() {
    if (!selectedItem) return;
    setDraftLines((prev) => [...prev, refreshLineWithBalance(lineFromItem(selectedItem, prev.length + 1))]);
    setSelectedItemId("");
  }

  function handleLoadTemplate() {
    if (!templatePickerId) return;
    if (draftLines.length > 0) {
      setConfirmModal({
        title: "Replace current draft?",
        message: `Your current draft (${draftLines.length} item${draftLines.length !== 1 ? "s" : ""}) will be replaced by the selected template. This cannot be undone.`,
        confirmLabel: "Replace Draft",
        danger: true,
        onConfirm: () => { setConfirmModal(null); setSelectedCountSheetId(templatePickerId); },
      });
      return;
    }
    setSelectedCountSheetId(templatePickerId);
    // The useEffect watching selectedCountSheetId will auto-fetch & applySheetToDraft
  }

  function removeDraftLine(index: number) {
    setDraftLines((prev) => prev.filter((_, idx) => idx !== index).map((line, idx) => ({ ...line, sort_order: idx + 1 })));
  }

  // Merge current item master data (unit, price, supplier, category) into a saved line.
  // Counted qty and memo are preserved from the saved line.
  function mergeWithMaster(line: InventoryCountLine, index: number): InventoryCountLine {
    const master = itemMasterById[line.item_id];
    if (!master) return { ...line, sort_order: index + 1 };
    return {
      ...line,
      storage_unit: master.storage_unit || line.storage_unit,
      unit_price: Number(master.cost ?? line.unit_price),
      supplier_name: master.supplier_name || line.supplier_name,
      category: master.category_name || line.category,
      sort_order: index + 1,
    };
  }

  function loadSelectedCountToDraft() {
    if (!selectedCount) return;
    setDraftLines(
      (selectedCount.items || []).map((line, index) =>
        refreshLineWithBalance(mergeWithMaster(line, index)),
      ),
    );
    setNotes(selectedCount.notes || "");
    setCycle(selectedCount.cycle || cycle);
    setPicName(selectedCount.pic_name || "");
    setApproverName(selectedCount.approver_name || "");
    setSuccess("Loaded to draft — item master data (unit, price, supplier) refreshed from current master.");
  }

  async function syncDraftWithMaster() {
    if (!draftLines.length) return;
    // Re-fetch the latest item master before syncing so any unit/price/supplier
    // changes made after the page was loaded are picked up immediately.
    try {
      const freshItems = await inventoryGet<{ rows: InventoryItemLookup[] }>(
        `/api/admin/inventory/items?city=${encodeURIComponent(city)}&tab=ITEMS&limit=5000&slim=1`,
      );
      const rows = (freshItems.rows || []).filter((item) => item.status !== "DELETED");
      setItemOptions(rows);
      // Build fresh lookup inline so the setDraftLines below uses it immediately
      // (state update from setItemOptions is async and won't be visible yet).
      const freshMap: Record<string, InventoryItemLookup> = {};
      for (const item of rows) freshMap[item.id] = item;
      setDraftLines((prev) =>
        prev.map((line, index) => {
          const master = freshMap[line.item_id];
          const merged: InventoryCountLine = master ? {
            ...line,
            storage_unit: master.storage_unit || line.storage_unit,
            unit_price: Number(master.cost ?? line.unit_price),
            supplier_name: master.supplier_name || line.supplier_name,
            category: master.category_name || line.category,
            sort_order: index + 1,
          } : { ...line, sort_order: index + 1 };
          return refreshLineWithBalance(merged);
        }),
      );
      setSuccess("Draft lines synced with current item master data.");
    } catch {
      // Fallback: sync with cached data if fetch fails
      setDraftLines((prev) =>
        prev.map((line, index) => refreshLineWithBalance(mergeWithMaster(line, index))),
      );
      setSuccess("Draft lines synced (using cached master data).");
    }
  }

  async function refreshHistoryAndDetail(nextSelectedId = selectedCountId) {
    const historyRes = await inventoryGet<{ rows: CountRow[] }>(`/api/admin/inventory/counts?city=${encodeURIComponent(city)}&branch_code=${encodeURIComponent(branchCode)}&limit=500`);
    setHistoryRows(historyRes.rows || []);
    if (nextSelectedId) {
      const detailRes = await inventoryGet<{ row: CountDetail }>(`/api/admin/inventory/counts/${encodeURIComponent(nextSelectedId)}?city=${encodeURIComponent(city)}`);
      setSelectedCount(detailRes.row || null);
    }
  }

  async function saveDraft() {
    if (!branchCode) {
      setError("Please select a branch.");
      return;
    }
    if (!draftLines.length) {
      setError("Please add at least one item.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const nextDraftLines = syncedDraftLines();
      const selectedSheet = countSheetOptions.find((row) => row.id === selectedCountSheetId) || null;
      const created = await inventoryPost<{ row: CountRow }>("/api/admin/inventory/counts", {
        city,
        branch_code: branchCode,
        business_date: businessDate,
        cycle,
        count_sheet_id: selectedSheet?.id || "",
        count_sheet_name: selectedSheet?.name || "",
        pic_name: picName,
        approver_name: approverName,
        notes,
      });
      const countId = String(created?.row?.id || "");
      await inventoryPost(`/api/admin/inventory/counts/${encodeURIComponent(countId)}/items`, {
        city,
        items: nextDraftLines.map((line, index) => ({
          ...line,
          sort_order: index + 1,
        })),
      });
      setDraftLines(nextDraftLines);
      await refreshHistoryAndDetail(countId);
      setSelectedCountId(countId);
      setSuccess("Count draft saved.");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function submitSelectedCount() {
    if (!selectedCountId) return;
    setActionLoading(true);
    setError("");
    setSuccess("");
    try {
      await inventoryPost(`/api/admin/inventory/counts/${encodeURIComponent(selectedCountId)}/submit`, { city });
      await refreshHistoryAndDetail(selectedCountId);
      setSuccess("Selected count submitted. Recalculating variances.");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setActionLoading(false);
    }
  }

  function confirmCloseCount() {
    if (!selectedCountId) return;
    const itemCount = (selectedCount?.items || []).length;
    setConfirmModal({
      title: "Close count and post to ledger?",
      message: `Count ${selectedCount?.count_no || ""} (${itemCount} item${itemCount !== 1 ? "s" : ""}) will be closed and variances posted to the inventory ledger. This cannot be undone.`,
      confirmLabel: "Close & Post",
      danger: true,
      onConfirm: () => { setConfirmModal(null); void closeSelectedCount(); },
    });
  }

  async function closeSelectedCount() {
    if (!selectedCountId) return;
    setActionLoading(true);
    setError("");
    setSuccess("");
    try {
      await inventoryPost(`/api/admin/inventory/counts/${encodeURIComponent(selectedCountId)}/close`, { city });
      await refreshHistoryAndDetail(selectedCountId);
      setSuccess("Selected count closed and variances posted to ledger.");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setActionLoading(false);
    }
  }

  function confirmReopenCount() {
    if (!selectedCountId) return;
    setConfirmModal({
      title: "Reopen this count?",
      message: "The count will be moved back to DRAFT status and become editable again.",
      confirmLabel: "Reopen",
      onConfirm: () => { setConfirmModal(null); void reopenSelectedCount(); },
    });
  }

  async function reopenSelectedCount() {
    if (!selectedCountId) return;
    setActionLoading(true);
    setError("");
    setSuccess("");
    try {
      await inventoryPost(`/api/admin/inventory/counts/${encodeURIComponent(selectedCountId)}/reopen`, { city });
      await refreshHistoryAndDetail(selectedCountId);
      setSuccess("Count reopened to DRAFT. You can now edit items.");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setActionLoading(false);
    }
  }

  function startEditItem(item: InventoryCountLine) {
    setEditingItemId(item.id != null ? String(item.id) : null);
    setEditItemUnit(item.storage_unit || "");
    setEditItemPrice(String(item.unit_price ?? ""));
    setEditItemSupplier(item.supplier_name || "");
    setEditItemMemo(item.memo || "");
  }

  async function saveEditItem() {
    if (!editingItemId || !selectedCountId) return;
    setEditItemSaving(true);
    setError("");
    try {
      const price = parseFloat(editItemPrice);
      await inventoryPatch(
        `/api/admin/inventory/counts/${encodeURIComponent(selectedCountId)}/items/${encodeURIComponent(editingItemId)}`,
        {
          city,
          ...(editItemUnit ? { storage_unit: editItemUnit } : {}),
          ...(!isNaN(price) ? { unit_price: price } : {}),
          ...(editItemSupplier ? { supplier_name: editItemSupplier } : {}),
          memo: editItemMemo,
        },
      );
      setEditingItemId(null);
      await refreshHistoryAndDetail(selectedCountId);
      setSuccess("Item updated.");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setEditItemSaving(false);
    }
  }

  if (!ready) return <div className="text-sm text-neutral-500">Loading counts...</div>;
  if (!allowed) return <div className="text-sm text-neutral-500">You do not have permission to open inventory.</div>;

  return (
    <div className="space-y-6">
      <InventoryTabs />

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-neutral-100">Full Inventory Count</div>
            <div className="mt-1 text-sm text-neutral-400">Use for formal 15th and month-end inventory counts.</div>
          </div>
          <div className="text-xs text-neutral-500">{city.toUpperCase()} count workflow</div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-6">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">City</label>
            <select
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
              value={city}
              onChange={(e) => {
                const next = e.target.value as City;
                if (next === city) return;
                if (draftLines.length > 0) {
                  setConfirmModal({
                    title: `Switch to ${next.charAt(0).toUpperCase() + next.slice(1)}?`,
                    message: `Your current draft (${draftLines.length} item${draftLines.length !== 1 ? "s" : ""}) will be cleared.`,
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
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Branch</label>
            <select className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" value={branchCode} onChange={(e) => setBranchCode(e.target.value)}>
              {BRANCHES[city].map((branch) => (
                <option key={branch.code} value={branch.code}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Date</label>
            <input type="date" value={businessDate} onChange={(e) => setBusinessDate(e.target.value)} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Cycle</label>
            <select className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" value={cycle} onChange={(e) => setCycle(e.target.value)}>
              <option value="15TH">15th</option>
              <option value="MONTH_END">Month End</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">PIC</label>
            <input value={picName} onChange={(e) => setPicName(e.target.value)} placeholder="Name" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Approver</label>
            <input value={approverName} onChange={(e) => setApproverName(e.target.value)} placeholder="Name" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" />
          </div>
        </div>

        <div className="mt-3">
          <label className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes for this count session" rows={2} className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" />
        </div>

        {error ? <div className="mt-3 rounded-xl bg-rose-950/30 px-3 py-2 text-sm text-rose-300">{error}</div> : null}
        {success ? <div className="mt-3 rounded-xl bg-emerald-950/30 px-3 py-2 text-sm text-emerald-300">{success}</div> : null}
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        {/* ── Header row ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-neutral-100">Draft Count</div>
            {draftLines.length > 0 && (
              <div className="mt-0.5 flex items-center gap-2">
                <div className="text-xs text-neutral-500">{draftLines.length} items</div>
                <div className={["text-xs font-semibold", countedLineCount === draftLines.length ? "text-emerald-400" : countedLineCount > 0 ? "text-amber-400" : "text-neutral-500"].join(" ")}>
                  {countedLineCount} / {draftLines.length} counted
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {draftLines.length > 0 && (
              <div className="h-2 w-40 overflow-hidden rounded-full bg-neutral-800">
                <div
                  className={["h-full rounded-full transition-all", countedLineCount === draftLines.length ? "bg-emerald-500" : "bg-amber-500"].join(" ")}
                  style={{ width: `${draftLines.length ? (countedLineCount / draftLines.length) * 100 : 0}%` }}
                />
              </div>
            )}
            {draftLines.length > 0 && (
              <button
                type="button"
                onClick={() => setShowDetailColumns((v) => !v)}
                className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
              >
                {showDetailColumns ? "Hide Details" : "Show Details"}
              </button>
            )}
          </div>
        </div>

        {/* ── Template loader ── */}
        <div className="mt-4 rounded-xl border border-violet-900/40 bg-violet-950/10 p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-semibold text-violet-300">Load Count Template</span>
            {selectedCountSheetId && (
              <span className="rounded-md bg-emerald-900/40 px-2 py-0.5 text-xs text-emerald-300">
                ✓ {countSheetOptions.find((s) => s.id === selectedCountSheetId)?.name || "Template loaded"}
              </span>
            )}
          </div>
          {countSheetOptions.length > 0 ? (
            <select
              value={templatePickerId}
              onChange={(e) => {
                const newId = e.target.value;
                setTemplatePickerId(newId);
                if (!newId) return;
                if (draftLines.length > 0) {
                  setConfirmModal({
                    title: "Replace current draft?",
                    message: `Your current draft (${draftLines.length} item${draftLines.length !== 1 ? "s" : ""}) will be replaced by the selected template.`,
                    confirmLabel: "Replace Draft",
                    danger: true,
                    onConfirm: () => { setConfirmModal(null); setSelectedCountSheetId(newId); },
                  });
                  return;
                }
                setSelectedCountSheetId(newId);
              }}
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
            >
              <option value="">— Select a template to load —</option>
              {countSheetOptions.map((sheet) => (
                <option key={sheet.id} value={sheet.id}>
                  {sheet.name}{sheet.reference ? ` · ${sheet.reference}` : ""}
                </option>
              ))}
            </select>
          ) : (
            <div className="text-xs text-neutral-500">
              No templates available for this branch / cycle.{" "}
              <Link href="/admin/inventory/count-sheets" className="text-violet-400 underline hover:text-violet-300">
                Create a template →
              </Link>
            </div>
          )}
          <p className="mt-1.5 text-[11px] text-neutral-600">
            Template items are loaded with counted qty = 0. Branch and cycle must match.
          </p>
        </div>

        {/* ── Add item row ── */}
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_140px]">
          <select className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" value={selectedItemId} onChange={(e) => setSelectedItemId(e.target.value)}>
            <option value="">Add inventory item manually</option>
            {itemOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.supplier_name ? `${item.supplier_name} / ` : ""}{item.name} {item.sku ? `(${item.sku})` : ""}
              </option>
            ))}
          </select>
          <button type="button" onClick={addManualItem} disabled={!selectedItem} className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900 disabled:opacity-60">
            Add Item
          </button>
        </div>

        {/* ── Search bar ── */}
        {draftLines.length > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <input
              type="text"
              placeholder="Search items by name, SKU, or category…"
              value={draftSearch}
              onChange={(e) => setDraftSearch(e.target.value)}
              className="flex-1 rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-violet-500 focus:outline-none"
            />
            {draftSearch && (
              <button type="button" onClick={() => setDraftSearch("")} className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-neutral-400 hover:text-neutral-200">
                ✕ Clear
              </button>
            )}
          </div>
        )}

        {/* ── Item groups ── */}
        <div className="mt-4 space-y-3">
          {filteredGroupedDraft.length === 0 && draftLines.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-800 bg-neutral-950/30 px-3 py-8 text-center text-sm text-neutral-500">
              Select a template above to auto-load items, or add items manually one by one.
            </div>
          ) : filteredGroupedDraft.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-800 bg-neutral-950/30 px-3 py-6 text-center text-xs text-neutral-500">
              No items match &ldquo;{draftSearch}&rdquo;.
            </div>
          ) : null}

          {filteredGroupedDraft.map((group) => {
            const groupCounted = group.rows.filter((l) => Number(l.counted_qty) > 0).length;
            const groupTotal = group.rows.length;
            const allDone = groupCounted === groupTotal;
            const isCollapsed = collapsedGroups[group.supplier];

            return (
              <section key={group.supplier} className={["rounded-xl border bg-neutral-950/20 transition-colors", allDone ? "border-emerald-900/40" : "border-neutral-800"].join(" ")}>
                {/* Group header — click to collapse/expand */}
                <button
                  type="button"
                  onClick={() => toggleGroup(group.supplier)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className={["text-sm font-medium", allDone ? "text-emerald-400" : "text-amber-300"].join(" ")}>
                      {group.supplier}
                    </span>
                    {allDone && <span className="text-xs text-emerald-500">✓ Done</span>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={["text-xs font-semibold", allDone ? "text-emerald-400" : groupCounted > 0 ? "text-amber-400" : "text-neutral-500"].join(" ")}>
                      {groupCounted}/{groupTotal}
                    </span>
                    <span className="text-xs text-neutral-600">{isCollapsed ? "▶" : "▼"}</span>
                  </div>
                </button>

                {!isCollapsed && (
                  <div className="overflow-x-auto border-t border-neutral-800">
                    <table className="min-w-full text-xs">
                      <thead className="bg-neutral-950/80 text-neutral-400">
                        <tr>
                          <th className="px-3 py-2 text-left">Item</th>
                          <th className="px-3 py-2 text-left">Unit</th>
                          <th className="px-3 py-2 text-right">Theo.</th>
                          <th className="px-3 py-2 text-right font-semibold text-neutral-200">Counted</th>
                          <th className="px-3 py-2 text-right">Variance</th>
                          <th className="px-3 py-2 text-right">Assets</th>
                          <th className="px-3 py-2 text-left">Memo</th>
                          {showDetailColumns && <th className="px-3 py-2 text-right">Price</th>}
                          {showDetailColumns && <th className="px-3 py-2 text-left">Foodics</th>}
                          {showDetailColumns && <th className="px-3 py-2 text-left">Order Diff</th>}
                          <th className="px-3 py-2 text-right"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((line) => {
                          const index = draftLines.indexOf(line);
                          const isCounted = Number(line.counted_qty) > 0;
                          return (
                            <tr
                              key={`${line.sku}-${index}-${line.item_name}`}
                              className={[
                                "border-t border-neutral-800 transition-colors",
                                isCounted ? "bg-emerald-950/10" : "opacity-70 hover:opacity-100",
                              ].join(" ")}
                            >
                              <td className="px-3 py-2">
                                <div className={["font-medium", isCounted ? "text-neutral-100" : "text-neutral-400"].join(" ")}>
                                  {line.item_name || "-"}
                                </div>
                                <div className="text-neutral-500">{line.sku || "-"}</div>
                              </td>
                              <td className="px-3 py-2 text-neutral-300">{line.storage_unit || "-"}</td>
                              <td className="px-3 py-2 text-right text-neutral-500">{number3(line.theoretical_qty)}</td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  data-qty-input
                                  value={draftQtyValue(index, line)}
                                  onChange={(e) => setDraftQtyInputs((prev) => ({ ...prev, [String(index)]: e.target.value }))}
                                  onFocus={(e) => e.currentTarget.select()}
                                  onBlur={() => commitDraftQty(index, line)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      commitDraftQty(index, line);
                                      const all = document.querySelectorAll<HTMLInputElement>("[data-qty-input]");
                                      const cur = Array.from(all).indexOf(e.currentTarget as HTMLInputElement);
                                      if (cur >= 0 && all[cur + 1]) { all[cur + 1].focus(); all[cur + 1].select(); }
                                    }
                                    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                                    e.preventDefault();
                                    const step = getInventoryQuantityStep(line.storage_unit);
                                    setDraftQtyInputs((prev) => ({ ...prev, [String(index)]: stepDraftNumber(draftQtyValue(index, line), step, e.key === "ArrowUp" ? 1 : -1) }));
                                  }}
                                  className={[
                                    "w-24 rounded-lg border px-2 py-2 text-right text-sm font-semibold focus:outline-none focus:ring-1",
                                    isCounted
                                      ? "border-emerald-700/60 bg-emerald-950/30 text-emerald-200 focus:ring-emerald-600"
                                      : "border-neutral-700 bg-neutral-950 text-neutral-300 focus:border-violet-600 focus:ring-violet-700",
                                  ].join(" ")}
                                />
                              </td>
                              <td className={["px-3 py-2 text-right font-semibold", Number(line.variance_qty || 0) === 0 ? "text-neutral-500" : Number(line.variance_qty || 0) > 0 ? "text-emerald-300" : "text-amber-300"].join(" ")}>
                                {number3(line.variance_qty)}
                              </td>
                              <td className="px-3 py-2 text-right text-neutral-400">{Number(line.asset_value || 0).toFixed(2)}</td>
                              <td className="px-3 py-2">
                                <input value={line.memo} onChange={(e) => updateDraftLine(index, { memo: e.target.value })} placeholder="—" className="w-28 rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-xs text-neutral-500 placeholder-neutral-700 hover:border-neutral-700 focus:border-neutral-600 focus:bg-neutral-950 focus:outline-none" />
                              </td>
                              {showDetailColumns && <td className="px-3 py-2 text-right text-neutral-500">{Number(line.unit_price || 0).toFixed(2)}</td>}
                              {showDetailColumns && (
                                <td className="px-3 py-2">
                                  <input value={line.foodics_data} onChange={(e) => updateDraftLine(index, { foodics_data: e.target.value })} className="w-24 rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-100" />
                                </td>
                              )}
                              {showDetailColumns && (
                                <td className="px-3 py-2">
                                  <input value={line.order_difference} onChange={(e) => updateDraftLine(index, { order_difference: e.target.value })} className="w-24 rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-100" />
                                </td>
                              )}
                              <td className="px-3 py-2 text-right">
                                <button type="button" onClick={() => removeDraftLine(index)} className="rounded-lg border border-rose-800/60 bg-rose-950/10 px-2 py-1 text-xs text-rose-400 hover:bg-rose-950/30">
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
              </section>
            );
          })}
        </div>

        {/* ── Sticky action bar ── */}
        {draftLines.length > 0 && (
          <div className="sticky bottom-4 z-10 mt-5">
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-neutral-700 bg-neutral-900/95 px-4 py-3 shadow-xl backdrop-blur-sm">
              <button
                type="button"
                onClick={saveDraft}
                disabled={saving || draftLines.length === 0}
                className="rounded-xl bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save Draft"}
              </button>
              <button
                type="button"
                onClick={syncDraftWithMaster}
                className="rounded-xl border border-sky-800 bg-sky-950/20 px-4 py-2 text-sm text-sky-300 hover:bg-sky-900/20"
                title="Updates Unit / Price / Supplier from current item master. Counted quantities are preserved."
              >
                ↻ Sync Master
              </button>
              <div className="ml-auto text-right">
                <div className={["text-sm font-semibold", countedLineCount === draftLines.length ? "text-emerald-400" : "text-amber-400"].join(" ")}>
                  {countedLineCount} / {draftLines.length}
                </div>
                <div className="text-xs text-neutral-500">items counted</div>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-neutral-100">History</div>
            <div className="mt-1 text-xs text-neutral-500">Review formal inventory count history for the 15th and month-end.</div>
          </div>
          <input type="month" value={historyMonth} onChange={(e) => setHistoryMonth(e.target.value)} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-3 py-2">No.</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Cycle</th>
                  <th className="px-3 py-2">Sheet</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => { setSelectedCountId(row.id); setEditingItemId(null); }}
                    className={["cursor-pointer border-t border-neutral-800 text-neutral-200 transition hover:bg-neutral-800/30", selectedCountId === row.id ? "bg-emerald-950/20" : ""].join(" ")}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.count_no}</div>
                      <div className="mt-0.5 text-xs text-neutral-500">{labelOf(city, row.branch_code)}</div>
                    </td>
                    <td className="px-3 py-2">{String(row.business_date || "").slice(0, 10)}</td>
                    <td className="px-3 py-2">{row.cycle || "-"}</td>
                    <td className="px-3 py-2 text-xs">{row.count_sheet_name || "-"}</td>
                    <td className="px-3 py-2">
                      <span className={["rounded px-2 py-0.5 text-xs font-medium",
                        row.status === "CLOSED" ? "bg-neutral-700 text-neutral-300" :
                        row.status === "SUBMITTED" ? "bg-sky-900/60 text-sky-300" :
                        "bg-amber-900/40 text-amber-300"].join(" ")}>
                        {row.status || "-"}
                      </span>
                    </td>
                  </tr>
                ))}
                {!loading && filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-neutral-500">
                      No count history for this month.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-neutral-100">Selected Count</div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={loadSelectedCountToDraft} disabled={!selectedCount || actionLoading} className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 disabled:opacity-50">
                  Load to Draft
                </button>
                <button type="button" onClick={submitSelectedCount} disabled={!selectedCountId || actionLoading || selectedCount?.status !== "DRAFT"} className="rounded-lg border border-sky-800 bg-sky-950/30 px-3 py-1.5 text-xs text-sky-200 disabled:opacity-50">
                  Submit
                </button>
                <button type="button" onClick={confirmReopenCount} disabled={!selectedCountId || actionLoading || selectedCount?.status !== "SUBMITTED"} className="rounded-lg border border-amber-700 bg-amber-950/30 px-3 py-1.5 text-xs text-amber-200 disabled:opacity-50">
                  {actionLoading ? "..." : "Reopen"}
                </button>
                <button type="button" onClick={confirmCloseCount} disabled={!selectedCountId || actionLoading || selectedCount?.status === "CLOSED"} className="rounded-lg border border-emerald-800 bg-emerald-950/30 px-3 py-1.5 text-xs text-emerald-200 disabled:opacity-50">
                  {actionLoading ? "Processing..." : selectedCount?.status === "CLOSED" ? "Closed" : "Close & Post"}
                </button>
              </div>
            </div>

            {!selectedCount ? (
              <div className="mt-3 text-sm text-neutral-500">Select a count from the history list on the left.</div>
            ) : (
              <div className="mt-3 space-y-3 text-sm text-neutral-200">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-neutral-500">No. </span>{selectedCount.count_no}</div>
                  <div><span className="text-neutral-500">Status </span>
                    <span className={["rounded px-1.5 py-0.5 font-medium",
                      selectedCount.status === "CLOSED" ? "bg-neutral-700 text-neutral-300" :
                      selectedCount.status === "SUBMITTED" ? "bg-sky-900/60 text-sky-300" :
                      "bg-amber-900/40 text-amber-300"].join(" ")}>
                      {selectedCount.status}
                    </span>
                  </div>
                  <div><span className="text-neutral-500">Branch </span>{labelOf(city, selectedCount.branch_code)}</div>
                  <div><span className="text-neutral-500">Cycle </span>{selectedCount.cycle || "-"}</div>
                  <div><span className="text-neutral-500">PIC </span>{selectedCount.pic_name || "-"}</div>
                  <div><span className="text-neutral-500">Approver </span>{selectedCount.approver_name || "-"}</div>
                  <div><span className="text-neutral-500">Date </span>{selectedCount.business_date || "-"}</div>
                  <div><span className="text-neutral-500">Items </span>{(selectedCount.items || []).length}</div>
                  {selectedCount.submitted_by && (
                    <div className="col-span-2 border-t border-neutral-800 pt-1.5">
                      <span className="text-neutral-500">Submitted by </span>{selectedCount.submitted_by}
                      {selectedCount.submitted_at && <span className="ml-2 text-neutral-500">{new Date(selectedCount.submitted_at).toLocaleString()}</span>}
                    </div>
                  )}
                  {(selectedCount.items || []).length > 0 && (
                    <div className="col-span-2 border-t border-neutral-800 pt-1.5">
                      <span className="text-neutral-500">Total Asset Value </span>
                      <span className="font-semibold text-emerald-300">
                        {(selectedCount.items || []).reduce((sum, item) => sum + Number(item.asset_value || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                </div>
                {selectedCount.notes ? <div className="text-xs text-neutral-400 whitespace-pre-wrap">{selectedCount.notes}</div> : null}

                {/* Item detail table with inline editing */}
                <div className="overflow-x-auto rounded-xl border border-neutral-800">
                  <table className="min-w-full text-xs">
                    <thead className="bg-neutral-900/60 text-neutral-400">
                      <tr>
                        <th className="px-2 py-2 text-left">Item</th>
                        <th className="px-2 py-2 text-left">Supplier</th>
                        <th className="px-2 py-2 text-left">Unit</th>
                        <th className="px-2 py-2 text-right">Price</th>
                        <th className="px-2 py-2 text-right">Theo</th>
                        <th className="px-2 py-2 text-right">Counted</th>
                        <th className="px-2 py-2 text-right">Var</th>
                        <th className="px-2 py-2 text-left">Memo</th>
                        <th className="px-2 py-2 text-right">Edit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedCount.items || []).map((item, index) => {
                        const isEditing = editingItemId != null && editingItemId === String(item.id ?? "");
                        return (
                          <tr key={`${item.sku}-${index}`} className={["border-t border-neutral-800", isEditing ? "bg-amber-950/20" : ""].join(" ")}>
                            <td className="px-2 py-2">
                              <div className="text-neutral-100">{item.item_name}</div>
                              <div className="text-neutral-500">{item.sku || "-"}</div>
                            </td>
                            <td className="px-2 py-2">
                              {isEditing
                                ? <input value={editItemSupplier} onChange={(e) => setEditItemSupplier(e.target.value)} className="w-28 rounded border border-amber-700/50 bg-neutral-950 px-1.5 py-1 text-xs text-neutral-100" />
                                : <span className="text-neutral-300">{item.supplier_name || "-"}</span>
                              }
                            </td>
                            <td className="px-2 py-2">
                              {isEditing
                                ? <input value={editItemUnit} onChange={(e) => setEditItemUnit(e.target.value)} className="w-16 rounded border border-amber-700/50 bg-neutral-950 px-1.5 py-1 text-xs text-neutral-100" />
                                : <span className="text-neutral-300">{item.storage_unit || "-"}</span>
                              }
                            </td>
                            <td className="px-2 py-2 text-right">
                              {isEditing
                                ? <input type="number" step="any" value={editItemPrice} onChange={(e) => setEditItemPrice(e.target.value)} className="w-20 rounded border border-amber-700/50 bg-neutral-950 px-1.5 py-1 text-right text-xs text-neutral-100" />
                                : <span className="text-neutral-300">{Number(item.unit_price || 0).toFixed(4)}</span>
                              }
                            </td>
                            <td className="px-2 py-2 text-right text-neutral-400">{number3(item.theoretical_qty)}</td>
                            <td className="px-2 py-2 text-right text-neutral-100">{number3(item.counted_qty)}</td>
                            <td className={["px-2 py-2 text-right font-medium", Number(item.variance_qty) === 0 ? "text-neutral-400" : Number(item.variance_qty) > 0 ? "text-emerald-300" : "text-amber-300"].join(" ")}>
                              {number3(item.variance_qty)}
                            </td>
                            <td className="px-2 py-2">
                              {isEditing
                                ? <input value={editItemMemo} onChange={(e) => setEditItemMemo(e.target.value)} className="w-24 rounded border border-amber-700/50 bg-neutral-950 px-1.5 py-1 text-xs text-neutral-100" />
                                : <span className="text-neutral-400">{item.memo || "-"}</span>
                              }
                            </td>
                            <td className="px-2 py-2 text-right">
                              {isEditing ? (
                                <div className="flex justify-end gap-1">
                                  <button type="button" onClick={saveEditItem} disabled={editItemSaving} className="rounded border border-emerald-700 bg-emerald-950/40 px-2 py-0.5 text-xs text-emerald-200 disabled:opacity-50">
                                    {editItemSaving ? "…" : "Save"}
                                  </button>
                                  <button type="button" onClick={() => setEditingItemId(null)} className="rounded border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-xs text-neutral-300">
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                selectedCount.status !== "CLOSED" ? (
                                  <button type="button" onClick={() => startEditItem(item)} className="rounded border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-xs text-neutral-300 hover:bg-neutral-800">
                                    Edit
                                  </button>
                                ) : null
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {!(selectedCount.items || []).length ? (
                        <tr><td colSpan={9} className="px-3 py-4 text-center text-neutral-500">No rows linked.</td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Generic Confirm Modal ───────────────────────────────────────── */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-neutral-700 bg-slate-900/95 p-6 shadow-2xl">
            <div className="mb-2 text-base font-semibold text-neutral-100">{confirmModal.title}</div>
            <div className="mb-5 text-sm text-neutral-400">{confirmModal.message}</div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                className={`rounded-xl px-4 py-2 text-sm font-semibold text-white ${confirmModal.danger ? "bg-rose-600 hover:bg-rose-500" : "bg-sky-600 hover:bg-sky-500"}`}
              >
                {confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
