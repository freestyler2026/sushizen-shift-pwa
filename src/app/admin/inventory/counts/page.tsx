"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import InventoryTabs from "@/components/InventoryTabs";
import { canAccessInventoryWorkspace, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { BRANCHES, labelOf, type City } from "@/lib/branches";
import { defaultBranch, groupBySupplier, lineFromItem, monthNow, number3, todayIso, withVariance, type InventoryCountLine, type InventoryItemLookup } from "@/lib/inventoryCountUtils";
import { inventoryGet, inventoryPatch, inventoryPost } from "@/lib/inventoryClient";
import { formatDraftNumber, getInventoryQuantityStep, parseDraftNumber, stepDraftNumber } from "@/lib/quantityInput";

type CountSheetRow = {
  id: string;
  name: string;
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
  // Inline item editing state
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemUnit, setEditItemUnit] = useState("");
  const [editItemPrice, setEditItemPrice] = useState("");
  const [editItemSupplier, setEditItemSupplier] = useState("");
  const [editItemMemo, setEditItemMemo] = useState("");
  const [editItemSaving, setEditItemSaving] = useState(false);

  const refreshLineWithBalance = useCallback((line: InventoryCountLine, balanceLookup: Record<string, number> = balancesMap): InventoryCountLine => {
    return withVariance({
      ...line,
      theoretical_qty: Number(balanceLookup[line.item_id] || line.theoretical_qty || 0),
    });
  }, [balancesMap]);

  const applySheetToDraft = useCallback((sheet: CountSheetDetail | null, balanceLookup: Record<string, number> = balancesMap) => {
    if (!sheet) return;
    setDraftLines((sheet.items || []).map((line, index) => refreshLineWithBalance({ ...line, counted_qty: 0, variance_qty: 0, sort_order: index + 1 }, balanceLookup)));
  }, [balancesMap, refreshLineWithBalance]);

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
          inventoryGet<{ rows: InventoryItemLookup[] }>(`/api/admin/inventory/items?city=${encodeURIComponent(city)}&tab=ITEMS&limit=5000`),
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
          setSelectedCountSheetId(String(currentRes.row.id || ""));
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

  function removeDraftLine(index: number) {
    setDraftLines((prev) => prev.filter((_, idx) => idx !== index).map((line, idx) => ({ ...line, sort_order: idx + 1 })));
  }

  function loadSelectedCountToDraft() {
    if (!selectedCount) return;
    setDraftLines((selectedCount.items || []).map((line, index) => refreshLineWithBalance({ ...line, sort_order: index + 1 })));
    setNotes(selectedCount.notes || "");
    setCycle(selectedCount.cycle || cycle);
    setPicName(selectedCount.pic_name || "");
    setApproverName(selectedCount.approver_name || "");
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

  async function reopenSelectedCount() {
    if (!selectedCountId) return;
    if (!confirm("このカウントをDRAFTに戻して編集可能にしますか？")) return;
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
    setEditingItemId(item.id || null);
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
          <select className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" value={city} onChange={(e) => setCity(e.target.value as City)}>
            <option value="dubai">Dubai</option>
            <option value="manila">Manila</option>
          </select>
          <select className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" value={branchCode} onChange={(e) => setBranchCode(e.target.value)}>
            {BRANCHES[city].map((branch) => (
              <option key={branch.code} value={branch.code}>
                {branch.name}
              </option>
            ))}
          </select>
          <input type="date" value={businessDate} onChange={(e) => setBusinessDate(e.target.value)} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" />
          <select className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" value={cycle} onChange={(e) => setCycle(e.target.value)}>
            <option value="15TH">15th</option>
            <option value="MONTH_END">Month End</option>
          </select>
          <input value={picName} onChange={(e) => setPicName(e.target.value)} placeholder="PIC" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" />
          <input value={approverName} onChange={(e) => setApproverName(e.target.value)} placeholder="Approver" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" />
        </div>


        <div className="mt-3">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" className="min-h-24 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" />
        </div>

        {error ? <div className="mt-3 text-sm text-rose-300">{error}</div> : null}
        {success ? <div className="mt-3 text-sm text-emerald-300">{success}</div> : null}
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-neutral-100">Draft Count</div>
          <div className="text-xs text-neutral-500">{draftLines.length} rows</div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_140px]">
          <select className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" value={selectedItemId} onChange={(e) => setSelectedItemId(e.target.value)}>
            <option value="">Add inventory item</option>
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

        <div className="mt-3 text-xs text-neutral-400">Excel-like view: rows are grouped by supplier. Enter `Counted` directly; `Variance` is calculated automatically.</div>

        <div className="mt-4 space-y-4">
          {groupedDraft.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-800 bg-neutral-950/30 px-3 py-6 text-center text-xs text-neutral-500">
              Load a count template or add items manually.
            </div>
          ) : null}
          {groupedDraft.map((group) => (
            <section key={group.supplier} className="rounded-xl border border-neutral-800 bg-neutral-950/20">
              <div className="border-b border-neutral-800 px-4 py-3">
                <div className="text-sm font-medium text-amber-300">{group.supplier}</div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="sticky top-0 bg-neutral-950/95 text-neutral-300">
                    <tr>
                      <th className="px-3 py-2 text-left">Category</th>
                      <th className="px-3 py-2 text-left">SKU</th>
                      <th className="px-3 py-2 text-left">Supplier</th>
                      <th className="px-3 py-2 text-left">Item Name</th>
                      <th className="px-3 py-2 text-left">Invoice Name</th>
                      <th className="px-3 py-2 text-left">Unit</th>
                      <th className="px-3 py-2 text-right">Unit Price</th>
                      <th className="px-3 py-2 text-right">Theoretical</th>
                      <th className="px-3 py-2 text-right">Counted</th>
                      <th className="px-3 py-2 text-right">Variance</th>
                      <th className="px-3 py-2 text-right">Assets</th>
                      <th className="px-3 py-2 text-left">Memo</th>
                      <th className="px-3 py-2 text-left">Foodics</th>
                      <th className="px-3 py-2 text-left">Order Diff</th>
                      <th className="px-3 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((line) => {
                      const index = draftLines.indexOf(line);
                      return (
                        <tr key={`${line.sku}-${index}-${line.item_name}`} className="border-t border-neutral-800 bg-neutral-950/30">
                          <td className="px-3 py-2 text-neutral-300">{line.category || "-"}</td>
                          <td className="px-3 py-2 text-neutral-100">{line.sku || "-"}</td>
                          <td className="px-3 py-2 text-neutral-300">{line.supplier_name || "-"}</td>
                          <td className="px-3 py-2 text-neutral-100">{line.item_name || "-"}</td>
                          <td className="px-3 py-2 text-neutral-400">{line.invoice_name || "-"}</td>
                          <td className="px-3 py-2 text-neutral-300">{line.storage_unit || "-"}</td>
                          <td className="px-3 py-2 text-right text-neutral-300">{Number(line.unit_price || 0).toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-neutral-300">{number3(line.theoretical_qty)}</td>
                          <td className="px-3 py-2">
                            <input type="text" inputMode="decimal" value={draftQtyValue(index, line)} onChange={(e) => setDraftQtyInputs((prev) => ({ ...prev, [String(index)]: e.target.value }))} onBlur={() => commitDraftQty(index, line)} onKeyDown={(e) => {
                              if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                              e.preventDefault();
                              const step = getInventoryQuantityStep(line.storage_unit);
                              setDraftQtyInputs((prev) => ({ ...prev, [String(index)]: stepDraftNumber(draftQtyValue(index, line), step, e.key === "ArrowUp" ? 1 : -1) }));
                            }} className="w-24 rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-right text-xs text-neutral-100" />
                          </td>
                          <td className={["px-3 py-2 text-right", Number(line.variance_qty || 0) === 0 ? "text-neutral-300" : Number(line.variance_qty || 0) > 0 ? "text-emerald-300" : "text-amber-300"].join(" ")}>
                            {number3(line.variance_qty)}
                          </td>
                          <td className="px-3 py-2 text-right text-neutral-300">{Number(line.asset_value || 0).toFixed(2)}</td>
                          <td className="px-3 py-2">
                            <input value={line.memo} onChange={(e) => updateDraftLine(index, { memo: e.target.value })} className="w-28 rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-100" />
                          </td>
                          <td className="px-3 py-2">
                            <input value={line.foodics_data} onChange={(e) => updateDraftLine(index, { foodics_data: e.target.value })} className="w-24 rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-100" />
                          </td>
                          <td className="px-3 py-2">
                            <input value={line.order_difference} onChange={(e) => updateDraftLine(index, { order_difference: e.target.value })} className="w-24 rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-100" />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button type="button" onClick={() => removeDraftLine(index)} className="rounded-lg border border-rose-800/70 bg-rose-950/20 px-2 py-1 text-xs text-rose-200">
                              Remove
                            </button>
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

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={saveDraft} disabled={saving || draftLines.length === 0} className="rounded-xl border border-emerald-800 bg-emerald-950/30 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-900/30 disabled:opacity-60">
            {saving ? "Saving..." : "Save Draft"}
          </button>
        </div>
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
                <button type="button" onClick={reopenSelectedCount} disabled={!selectedCountId || actionLoading || selectedCount?.status !== "SUBMITTED"} className="rounded-lg border border-amber-700 bg-amber-950/30 px-3 py-1.5 text-xs text-amber-200 disabled:opacity-50" title="SUBMITTED → DRAFTに戻して修正可能にする">
                  {actionLoading ? "..." : "Reopen"}
                </button>
                <button type="button" onClick={closeSelectedCount} disabled={!selectedCountId || actionLoading || selectedCount?.status === "CLOSED"} className="rounded-lg border border-emerald-800 bg-emerald-950/30 px-3 py-1.5 text-xs text-emerald-200 disabled:opacity-50">
                  {actionLoading ? "Processing..." : selectedCount?.status === "CLOSED" ? "Closed" : "Close"}
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
                        const isEditing = editingItemId === item.id;
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
    </div>
  );
}
