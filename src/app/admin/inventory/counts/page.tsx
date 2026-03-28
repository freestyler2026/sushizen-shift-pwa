"use client";

import { useEffect, useMemo, useState } from "react";
import InventoryTabs from "@/components/InventoryTabs";
import InventoryRegistrationHelp from "@/components/InventoryRegistrationHelp";
import { canAccessInventoryAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { BRANCHES, labelOf, type City } from "@/lib/branches";
import { defaultBranch, groupBySupplier, lineFromItem, monthNow, number3, todayIso, withVariance, type InventoryCountLine, type InventoryItemLookup } from "@/lib/inventoryCountUtils";
import { inventoryGet, inventoryPost } from "@/lib/inventoryClient";

type CountSheetRow = {
  id: string;
  name: string;
  branch_code: string;
  cycle: string;
  source_sheet_name: string;
};

type CountSheetDetail = CountSheetRow & {
  items?: InventoryCountLine[];
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
  const [historyRows, setHistoryRows] = useState<CountRow[]>([]);
  const [selectedCountId, setSelectedCountId] = useState("");
  const [selectedCount, setSelectedCount] = useState<CountDetail | null>(null);
  const [balancesMap, setBalancesMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const resolved = await refreshAuthFromApi(auth);
      if (cancelled) return;
      const nextCity = (resolved?.city || auth?.city || "manila") as City;
      setAllowed(canAccessInventoryAdmin(resolved));
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
        const [itemsRes, sheetsRes, countsRes, balancesRes] = await Promise.all([
          inventoryGet<{ rows: InventoryItemLookup[] }>(`/api/admin/inventory/items?city=${encodeURIComponent(city)}&tab=ITEMS&limit=5000`),
          inventoryGet<{ rows: CountSheetRow[] }>(`/api/admin/inventory/count-sheets?city=${encodeURIComponent(city)}&tab=ALL&limit=500`),
          inventoryGet<{ rows: CountRow[] }>(`/api/admin/inventory/counts?city=${encodeURIComponent(city)}&branch_code=${encodeURIComponent(branchCode)}&limit=500`),
          inventoryGet<{ rows: BalanceRow[] }>(`/api/admin/inventory/balances?city=${encodeURIComponent(city)}&branch_code=${encodeURIComponent(branchCode)}&limit=1000`),
        ]);
        if (cancelled) return;
        setItemOptions((itemsRes.rows || []).filter((item) => item.status !== "DELETED"));
        setCountSheetOptions((sheetsRes.rows || []).filter((row) => row.branch_code === branchCode && (!row.cycle || row.cycle === cycle)));
        setHistoryRows(countsRes.rows || []);
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
    return () => {
      cancelled = true;
    };
  }, [allowed, branchCode, city, cycle, ready]);

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

  const selectedItem = useMemo(
    () => itemOptions.find((item) => item.id === selectedItemId) || null,
    [itemOptions, selectedItemId],
  );

  const filteredHistory = useMemo(
    () => historyRows.filter((row) => String(row.business_date || "").slice(0, 7) === historyMonth),
    [historyMonth, historyRows],
  );

  const groupedDraft = useMemo(() => groupBySupplier(draftLines), [draftLines]);

  function refreshLineWithBalance(line: InventoryCountLine): InventoryCountLine {
    return withVariance({
      ...line,
      theoretical_qty: Number(balancesMap[line.item_id] || line.theoretical_qty || 0),
    });
  }

  function updateDraftLine(index: number, patch: Partial<InventoryCountLine>) {
    setDraftLines((prev) =>
      prev.map((line, idx) => (idx === index ? withVariance({ ...line, ...patch }) : line)),
    );
  }

  async function loadSheetIntoDraft() {
    if (!selectedCountSheetId) {
      setError("Please select a count template.");
      return;
    }
    setError("");
    const res = await inventoryGet<{ row: CountSheetDetail }>(
      `/api/admin/inventory/count-sheets/${encodeURIComponent(selectedCountSheetId)}?city=${encodeURIComponent(city)}`,
    );
    const sheet = res.row || null;
    if (!sheet) return;
    setDraftLines((sheet.items || []).map((line, index) => refreshLineWithBalance({ ...line, counted_qty: 0, variance_qty: 0, sort_order: index + 1 })));
    setSuccess("Loaded count template into draft.");
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
        items: draftLines.map((line, index) => ({
          ...withVariance(line),
          sort_order: index + 1,
        })),
      });
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

  if (!ready) return <div className="text-sm text-neutral-500">Loading counts...</div>;
  if (!allowed) return <div className="text-sm text-neutral-500">You do not have permission to open inventory.</div>;

  return (
    <div className="space-y-6">
      <InventoryTabs />
      <InventoryRegistrationHelp />

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-neutral-100">Full Inventory Count</div>
            <div className="mt-1 text-sm text-neutral-400">Use for formal 15th and month-end inventory counts.</div>
          </div>
          <div className="text-xs text-neutral-500">{city.toUpperCase()} count workflow</div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-6">
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
          <select className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" value={cycle} onChange={(e) => setCycle(e.target.value)}>
            <option value="15TH">15th</option>
            <option value="MONTH_END">Month End</option>
          </select>
          <input value={picName} onChange={(e) => setPicName(e.target.value)} placeholder="PIC" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
          <input value={approverName} onChange={(e) => setApproverName(e.target.value)} placeholder="Approver" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
          <select className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" value={selectedCountSheetId} onChange={(e) => setSelectedCountSheetId(e.target.value)}>
            <option value="">Load Count Sheet</option>
            {countSheetOptions.map((sheet) => (
              <option key={sheet.id} value={sheet.id}>
                {sheet.name} {sheet.source_sheet_name ? `(${sheet.source_sheet_name})` : ""}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void loadSheetIntoDraft()} disabled={!selectedCountSheetId} className="rounded-xl border border-sky-800 bg-sky-950/30 px-4 py-2 text-sm text-sky-200 hover:bg-sky-900/30 disabled:opacity-60">
            Load Sheet
          </button>
        </div>

        <div className="mt-3">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" className="min-h-24 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
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
          <select className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" value={selectedItemId} onChange={(e) => setSelectedItemId(e.target.value)}>
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
                            <input type="number" min="0" step="0.001" value={line.counted_qty} onChange={(e) => updateDraftLine(index, { counted_qty: Number(e.target.value || 0) })} className="w-24 rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-right text-xs" />
                          </td>
                          <td className={["px-3 py-2 text-right", Number(line.variance_qty || 0) === 0 ? "text-neutral-300" : Number(line.variance_qty || 0) > 0 ? "text-emerald-300" : "text-amber-300"].join(" ")}>
                            {number3(line.variance_qty)}
                          </td>
                          <td className="px-3 py-2 text-right text-neutral-300">{Number(line.asset_value || 0).toFixed(2)}</td>
                          <td className="px-3 py-2">
                            <input value={line.memo} onChange={(e) => updateDraftLine(index, { memo: e.target.value })} className="w-28 rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs" />
                          </td>
                          <td className="px-3 py-2">
                            <input value={line.foodics_data} onChange={(e) => updateDraftLine(index, { foodics_data: e.target.value })} className="w-24 rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs" />
                          </td>
                          <td className="px-3 py-2">
                            <input value={line.order_difference} onChange={(e) => updateDraftLine(index, { order_difference: e.target.value })} className="w-24 rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs" />
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
          <input type="month" value={historyMonth} onChange={(e) => setHistoryMonth(e.target.value)} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
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
                  <tr key={row.id} className={["border-t border-neutral-800 text-neutral-200 transition", selectedCountId === row.id ? "bg-emerald-950/20" : ""].join(" ")}>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => setSelectedCountId(row.id)} className="text-left hover:text-white">
                        <div>{row.count_no}</div>
                        <div className="mt-1 text-xs text-neutral-500">{labelOf(city, row.branch_code)}</div>
                      </button>
                    </td>
                    <td className="px-3 py-2">{String(row.business_date || "").slice(0, 10)}</td>
                    <td className="px-3 py-2">{row.cycle || "-"}</td>
                    <td className="px-3 py-2">{row.count_sheet_name || "-"}</td>
                    <td className="px-3 py-2">{row.status || "-"}</td>
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
                <button type="button" onClick={closeSelectedCount} disabled={!selectedCountId || actionLoading || selectedCount?.status === "CLOSED"} className="rounded-lg border border-emerald-800 bg-emerald-950/30 px-3 py-1.5 text-xs text-emerald-200 disabled:opacity-50">
                  {actionLoading ? "Processing..." : selectedCount?.status === "CLOSED" ? "Closed" : "Close"}
                </button>
              </div>
            </div>

            {!selectedCount ? (
              <div className="mt-3 text-sm text-neutral-500">Select a count from the history list on the left.</div>
            ) : (
              <div className="mt-3 space-y-3 text-sm text-neutral-200">
                <div>
                  <div className="text-xs text-neutral-500">Count No.</div>
                  <div>{selectedCount.count_no}</div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500">Branch / Cycle</div>
                  <div>{labelOf(city, selectedCount.branch_code)} • {selectedCount.cycle || "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500">PIC / Approver</div>
                  <div>{selectedCount.pic_name || "-"} / {selectedCount.approver_name || "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500">Sheet / Status</div>
                  <div>{selectedCount.count_sheet_name || "-"} • {selectedCount.status || "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500">Notes</div>
                  <div className="whitespace-pre-wrap text-neutral-300">{selectedCount.notes || "-"}</div>
                </div>
                <div className="max-h-96 space-y-2 overflow-y-auto">
                  {(selectedCount.items || []).map((item, index) => (
                    <div key={`${item.sku}-${index}`} className="rounded-xl border border-neutral-800 bg-neutral-900/30 px-3 py-2">
                      <div>{item.supplier_name || "Unknown supplier"} / {item.item_name}</div>
                      <div className="mt-1 text-xs text-neutral-500">
                        {item.sku || "-"} • Theo {number3(item.theoretical_qty)} • Counted {number3(item.counted_qty)} • Var {number3(item.variance_qty)}
                      </div>
                    </div>
                  ))}
                  {!(selectedCount.items || []).length ? <div className="text-xs text-neutral-500">No rows linked.</div> : null}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
