"use client";

import { useEffect, useMemo, useState } from "react";
import InventoryTabs from "@/components/InventoryTabs";
import InventoryRegistrationHelp from "@/components/InventoryRegistrationHelp";
import { canAccessInventoryAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { BRANCHES, labelOf, type City } from "@/lib/branches";
import { groupBySupplier, lineFromItem, monthNow, type InventoryCountLine, type InventoryItemLookup } from "@/lib/inventoryCountUtils";
import { inventoryFormPost, inventoryGet, inventoryPost } from "@/lib/inventoryClient";

type CountSheetRow = {
  id: string;
  city: string;
  name: string;
  reference: string;
  branch_code: string;
  cycle: string;
  source_sheet_name: string;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type CountSheetDetail = CountSheetRow & {
  items?: InventoryCountLine[];
};

type PreviewSheet = {
  sheet_name: string;
  branch_guess: string;
  cycle_guess: string;
  header_row_index: number;
  row_count: number;
};

type SelectedPreview = PreviewSheet & {
  matched_count: number;
  unmatched_count: number;
  rows: InventoryCountLine[];
};

function cycleOptions() {
  return [
    { value: "15TH", label: "15th" },
    { value: "MONTH_END", label: "Month End" },
  ];
}

export default function InventoryCountSheetsPage() {
  const auth = useMemo(() => getAuth(), []);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState<City>((auth?.city || "manila") as City);
  const [branchCode, setBranchCode] = useState(BRANCHES[(auth?.city || "manila") as City][0]?.code || "");
  const [cycle, setCycle] = useState("15TH");
  const [templateName, setTemplateName] = useState("");
  const [reference, setReference] = useState("");
  const [historyMonth, setHistoryMonth] = useState(monthNow());
  const [selectedItemId, setSelectedItemId] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [previewSheets, setPreviewSheets] = useState<PreviewSheet[]>([]);
  const [selectedPreviewSheetName, setSelectedPreviewSheetName] = useState("");
  const [selectedPreview, setSelectedPreview] = useState<SelectedPreview | null>(null);
  const [draftLines, setDraftLines] = useState<InventoryCountLine[]>([]);
  const [itemOptions, setItemOptions] = useState<InventoryItemLookup[]>([]);
  const [historyRows, setHistoryRows] = useState<CountSheetRow[]>([]);
  const [selectedSheetId, setSelectedSheetId] = useState("");
  const [selectedSheet, setSelectedSheet] = useState<CountSheetDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
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
      setBranchCode(BRANCHES[nextCity][0]?.code || "");
      setReady(true);
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [auth]);

  useEffect(() => {
    setBranchCode(BRANCHES[city][0]?.code || "");
    setSelectedSheetId("");
    setSelectedSheet(null);
    setPreviewSheets([]);
    setSelectedPreview(null);
    setSelectedPreviewSheetName("");
    setDraftLines([]);
  }, [city]);

  useEffect(() => {
    if (!ready || !allowed) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [itemsRes, sheetsRes] = await Promise.all([
          inventoryGet<{ rows: InventoryItemLookup[] }>(`/api/admin/inventory/items?city=${encodeURIComponent(city)}&tab=ITEMS&limit=5000`),
          inventoryGet<{ rows: CountSheetRow[] }>(`/api/admin/inventory/count-sheets?city=${encodeURIComponent(city)}&tab=ALL&limit=500`),
        ]);
        if (cancelled) return;
        setItemOptions((itemsRes.rows || []).filter((item) => item.status !== "DELETED"));
        setHistoryRows(sheetsRes.rows || []);
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
  }, [allowed, city, ready]);

  useEffect(() => {
    if (!selectedSheetId || !allowed) {
      setSelectedSheet(null);
      return;
    }
    let cancelled = false;
    async function loadDetail() {
      try {
        const res = await inventoryGet<{ row: CountSheetDetail }>(
          `/api/admin/inventory/count-sheets/${encodeURIComponent(selectedSheetId)}?city=${encodeURIComponent(city)}`,
        );
        if (!cancelled) setSelectedSheet(res.row || null);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      }
    }
    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [allowed, city, selectedSheetId]);

  const selectedItem = useMemo(
    () => itemOptions.find((item) => item.id === selectedItemId) || null,
    [itemOptions, selectedItemId],
  );

  const filteredHistory = useMemo(
    () =>
      historyRows.filter((row) => {
        const monthOkay = String(row.updated_at || row.created_at || "").slice(0, 7) === historyMonth;
        const branchOkay = !branchCode || row.branch_code === branchCode;
        const cycleOkay = !cycle || !row.cycle || row.cycle === cycle;
        return monthOkay && branchOkay && cycleOkay;
      }),
    [branchCode, cycle, historyMonth, historyRows],
  );

  const groupedDraft = useMemo(() => groupBySupplier(draftLines), [draftLines]);

  function updateDraftLine(index: number, patch: Partial<InventoryCountLine>) {
    setDraftLines((prev) => prev.map((line, idx) => (idx === index ? { ...line, ...patch } : line)));
  }

  function addManualItem() {
    if (!selectedItem) return;
    setDraftLines((prev) => [...prev, lineFromItem(selectedItem, prev.length + 1)]);
    setSelectedItemId("");
  }

  function removeDraftLine(index: number) {
    setDraftLines((prev) => prev.filter((_, idx) => idx !== index).map((line, idx) => ({ ...line, sort_order: idx + 1 })));
  }

  async function previewWorkbook(withSelectedSheet = false) {
    if (!uploadFile) {
      setError("Please select an Excel file.");
      return;
    }
    setPreviewBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("city", city);
      if (withSelectedSheet && selectedPreviewSheetName) form.set("source_sheet_name", selectedPreviewSheetName);
      form.set("file", uploadFile);
      const res = await inventoryFormPost<{ sheets?: PreviewSheet[]; selected_sheet?: SelectedPreview }>(
        "/api/admin/inventory/count-sheets/import-preview",
        form,
      );
      setPreviewSheets(Array.isArray(res.sheets) ? res.sheets : []);
      setSelectedPreview((res.selected_sheet as SelectedPreview) || null);
      if (!withSelectedSheet) {
        const first = Array.isArray(res.sheets) && res.sheets.length ? res.sheets[0].sheet_name : "";
        setSelectedPreviewSheetName((current) => current || first);
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setPreviewBusy(false);
    }
  }

  function loadPreviewIntoDraft() {
    if (!selectedPreview) return;
    setDraftLines((selectedPreview.rows || []).map((row, index) => ({ ...row, counted_qty: 0, theoretical_qty: 0, variance_qty: 0, sort_order: index + 1 })));
    if (!templateName.trim()) setTemplateName(selectedPreview.sheet_name || "");
    if (!branchCode && selectedPreview.branch_guess) setBranchCode(selectedPreview.branch_guess);
    if (selectedPreview.cycle_guess) setCycle(selectedPreview.cycle_guess);
    setSuccess("Loaded selected Excel sheet into draft. Add or edit items if needed, then save.");
  }

  function loadSelectedSheetIntoDraft() {
    if (!selectedSheet) return;
    setDraftLines((selectedSheet.items || []).map((row, index) => ({ ...row, sort_order: index + 1 })));
    setTemplateName(selectedSheet.name || "");
    setReference(selectedSheet.reference || "");
    if (selectedSheet.branch_code) setBranchCode(selectedSheet.branch_code);
    if (selectedSheet.cycle) setCycle(selectedSheet.cycle);
    setSuccess("Loaded selected count template into draft.");
  }

  async function saveCountSheet() {
    if (!templateName.trim()) {
      setError("Please enter a template name.");
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
      const created = await inventoryPost<{ row: CountSheetRow }>("/api/admin/inventory/count-sheets", {
        city,
        name: templateName.trim(),
        reference: reference.trim(),
        branch_code: branchCode,
        cycle,
        source_sheet_name: selectedPreview?.sheet_name || selectedSheet?.source_sheet_name || "",
      });
      const countSheetId = String(created?.row?.id || "");
      await inventoryPost(`/api/admin/inventory/count-sheets/${encodeURIComponent(countSheetId)}/items`, {
        city,
        items: draftLines.map((line, index) => ({
          ...line,
          sort_order: index + 1,
        })),
      });
      const historyRes = await inventoryGet<{ rows: CountSheetRow[] }>(`/api/admin/inventory/count-sheets?city=${encodeURIComponent(city)}&tab=ALL&limit=500`);
      setHistoryRows(historyRes.rows || []);
      setSelectedSheetId(countSheetId);
      setSuccess("Count template saved.");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function duplicateSelectedSheet() {
    if (!selectedSheetId) return;
    setActionBusy(true);
    setError("");
    setSuccess("");
    try {
      const res = await inventoryPost<{ row: CountSheetRow }>(`/api/admin/inventory/count-sheets/${encodeURIComponent(selectedSheetId)}/duplicate`, { city });
      const nextId = String(res?.row?.id || "");
      const historyRes = await inventoryGet<{ rows: CountSheetRow[] }>(`/api/admin/inventory/count-sheets?city=${encodeURIComponent(city)}&tab=ALL&limit=500`);
      setHistoryRows(historyRes.rows || []);
      setSelectedSheetId(nextId);
      setSuccess("Selected count template duplicated.");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setActionBusy(false);
    }
  }

  async function deleteSelectedSheet() {
    if (!selectedSheetId) return;
    setActionBusy(true);
    setError("");
    setSuccess("");
    try {
      await inventoryPost(`/api/admin/inventory/count-sheets/${encodeURIComponent(selectedSheetId)}/delete?city=${encodeURIComponent(city)}`, {});
      const historyRes = await inventoryGet<{ rows: CountSheetRow[] }>(`/api/admin/inventory/count-sheets?city=${encodeURIComponent(city)}&tab=ALL&limit=500`);
      setHistoryRows(historyRes.rows || []);
      setSelectedSheetId("");
      setSelectedSheet(null);
      setSuccess("Selected count template deleted.");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setActionBusy(false);
    }
  }

  if (!ready) return <div className="text-sm text-neutral-500">Loading count sheets...</div>;
  if (!allowed) return <div className="text-sm text-neutral-500">You do not have permission to open inventory.</div>;

  return (
    <div className="space-y-6">
      <InventoryTabs />
      <InventoryRegistrationHelp />

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-neutral-100">Count Templates</div>
            <div className="mt-1 text-sm text-neutral-400">Create Excel-like supplier-grouped templates for routine store inventory counting.</div>
          </div>
          <div className="text-xs text-neutral-500">{city.toUpperCase()} template workspace</div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-5">
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
          <select className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" value={cycle} onChange={(e) => setCycle(e.target.value)}>
            {cycleOptions().map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Template name" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference (optional)" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        </div>

        {error ? <div className="mt-3 text-sm text-rose-300">{error}</div> : null}
        {success ? <div className="mt-3 text-sm text-emerald-300">{success}</div> : null}
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-neutral-100">Import From Excel</div>
            <div className="mt-1 text-xs text-neutral-500">Preview supplier and item rows from `Inventory Dubai 2026.xlsx` and load them into draft.</div>
          </div>
          <div className="text-xs text-neutral-500">{previewSheets.length} sheets detected</div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_220px_160px_160px]">
          <input type="file" accept=".xlsx,.xls" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
          <select className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" value={selectedPreviewSheetName} onChange={(e) => setSelectedPreviewSheetName(e.target.value)}>
            <option value="">Select sheet</option>
            {previewSheets.map((sheet) => (
              <option key={sheet.sheet_name} value={sheet.sheet_name}>
                {sheet.sheet_name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void previewWorkbook(false)} disabled={previewBusy || !uploadFile} className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900 disabled:opacity-60">
            {previewBusy ? "Loading..." : "Preview Workbook"}
          </button>
          <button type="button" onClick={() => void previewWorkbook(true)} disabled={previewBusy || !uploadFile || !selectedPreviewSheetName} className="rounded-xl border border-sky-800 bg-sky-950/30 px-4 py-2 text-sm text-sky-200 hover:bg-sky-900/30 disabled:opacity-60">
            {previewBusy ? "Loading..." : "Load Sheet Preview"}
          </button>
        </div>

        {previewSheets.length ? (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {previewSheets.map((sheet) => (
              <div key={sheet.sheet_name} className="rounded-full border border-neutral-800 bg-neutral-950/40 px-3 py-1 text-neutral-300">
                {sheet.sheet_name} • {sheet.branch_guess || "-"} • {sheet.cycle_guess || "-"} • {sheet.row_count} rows
              </div>
            ))}
          </div>
        ) : null}

        {selectedPreview ? (
          <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-neutral-100">{selectedPreview.sheet_name}</div>
                <div className="mt-1 text-xs text-neutral-500">
                  Branch guess: {selectedPreview.branch_guess || "-"} • Cycle guess: {selectedPreview.cycle_guess || "-"} • Matched {selectedPreview.matched_count} / Unmatched {selectedPreview.unmatched_count}
                </div>
              </div>
              <button type="button" onClick={loadPreviewIntoDraft} className="rounded-xl border border-emerald-800 bg-emerald-950/30 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-900/30">
                Load Into Draft
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-neutral-100">Draft Template</div>
          <div className="text-xs text-neutral-500">{draftLines.length} rows</div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
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

        <div className="mt-3 text-xs text-neutral-400">Excel-like view: rows are grouped by supplier, and you can directly edit `SKU / Supplier / Item Name / Invoice Name / Unit / Unit Price / Memo`.</div>

        <div className="mt-4 space-y-4">
          {groupedDraft.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-800 bg-neutral-950/30 px-3 py-6 text-center text-xs text-neutral-500">
              Preview an Excel import or add items manually.
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
                      <th className="px-3 py-2 text-left">Memo</th>
                      <th className="px-3 py-2 text-left">Foodics Data</th>
                      <th className="px-3 py-2 text-left">Order Diff</th>
                      <th className="px-3 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((line) => {
                      const index = draftLines.indexOf(line);
                      return (
                        <tr key={`${line.sku}-${index}-${line.item_name}`} className="border-t border-neutral-800 bg-neutral-950/30">
                          <td className="px-3 py-2">
                            <input value={line.category} onChange={(e) => updateDraftLine(index, { category: e.target.value })} className="w-28 rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs" />
                          </td>
                          <td className="px-3 py-2 text-neutral-100">{line.sku || "-"}</td>
                          <td className="px-3 py-2">
                            <input value={line.supplier_name} onChange={(e) => updateDraftLine(index, { supplier_name: e.target.value })} className="w-32 rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs" />
                          </td>
                          <td className="px-3 py-2">
                            <input value={line.item_name} onChange={(e) => updateDraftLine(index, { item_name: e.target.value })} className="w-40 rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs" />
                          </td>
                          <td className="px-3 py-2">
                            <input value={line.invoice_name} onChange={(e) => updateDraftLine(index, { invoice_name: e.target.value })} className="w-40 rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs" />
                          </td>
                          <td className="px-3 py-2">
                            <input value={line.storage_unit} onChange={(e) => updateDraftLine(index, { storage_unit: e.target.value })} className="w-20 rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs" />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" min="0" step="0.01" value={line.unit_price} onChange={(e) => updateDraftLine(index, { unit_price: Number(e.target.value || 0) })} className="w-24 rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-right text-xs" />
                          </td>
                          <td className="px-3 py-2">
                            <input value={line.memo} onChange={(e) => updateDraftLine(index, { memo: e.target.value })} className="w-32 rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs" />
                          </td>
                          <td className="px-3 py-2">
                            <input value={line.foodics_data} onChange={(e) => updateDraftLine(index, { foodics_data: e.target.value })} className="w-28 rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs" />
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
          <button type="button" onClick={saveCountSheet} disabled={saving || draftLines.length === 0} className="rounded-xl border border-emerald-800 bg-emerald-950/30 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-900/30 disabled:opacity-60">
            {saving ? "Saving..." : "Save Count Sheet"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-neutral-100">History</div>
            <div className="mt-1 text-xs text-neutral-500">Review saved count template history and details.</div>
          </div>
          <input type="month" value={historyMonth} onChange={(e) => setHistoryMonth(e.target.value)} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Branch</th>
                  <th className="px-3 py-2">Cycle</th>
                  <th className="px-3 py-2">Sheet</th>
                  <th className="px-3 py-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((row) => (
                  <tr key={row.id} className={["border-t border-neutral-800 text-neutral-200 transition", selectedSheetId === row.id ? "bg-emerald-950/20" : ""].join(" ")}>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => setSelectedSheetId(row.id)} className="text-left hover:text-white">
                        <div>{row.name}</div>
                        <div className="mt-1 text-xs text-neutral-500">{row.reference || "-"}</div>
                      </button>
                    </td>
                    <td className="px-3 py-2">{labelOf(city, row.branch_code)}</td>
                    <td className="px-3 py-2">{row.cycle || "-"}</td>
                    <td className="px-3 py-2">{row.source_sheet_name || "-"}</td>
                    <td className="px-3 py-2">{String(row.updated_at || row.created_at || "").slice(0, 10)}</td>
                  </tr>
                ))}
                {!loading && filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-neutral-500">
                      No count templates found for this filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-neutral-100">Selected Template</div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={loadSelectedSheetIntoDraft} disabled={!selectedSheet || actionBusy} className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 disabled:opacity-50">
                  Load to Draft
                </button>
                <button type="button" onClick={duplicateSelectedSheet} disabled={!selectedSheetId || actionBusy} className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 disabled:opacity-50">
                  Duplicate
                </button>
                <button type="button" onClick={deleteSelectedSheet} disabled={!selectedSheetId || actionBusy} className="rounded-lg border border-rose-800/70 bg-rose-950/20 px-3 py-1.5 text-xs text-rose-200 disabled:opacity-50">
                  Delete
                </button>
              </div>
            </div>

            {!selectedSheet ? (
              <div className="mt-3 text-sm text-neutral-500">Select a count template from the history list on the left.</div>
            ) : (
              <div className="mt-3 space-y-3 text-sm text-neutral-200">
                <div>
                  <div className="text-xs text-neutral-500">Template</div>
                  <div>{selectedSheet.name}</div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500">Branch / Cycle</div>
                  <div>{labelOf(city, selectedSheet.branch_code)} • {selectedSheet.cycle || "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500">Source Sheet</div>
                  <div>{selectedSheet.source_sheet_name || "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500">Items</div>
                  <div>{(selectedSheet.items || []).length}</div>
                </div>
                <div className="max-h-96 space-y-2 overflow-y-auto">
                  {(selectedSheet.items || []).map((item, index) => (
                    <div key={`${item.sku}-${index}`} className="rounded-xl border border-neutral-800 bg-neutral-900/30 px-3 py-2">
                      <div>{item.supplier_name || "Unknown supplier"} / {item.item_name}</div>
                      <div className="mt-1 text-xs text-neutral-500">
                        {item.sku || "-"} • {item.storage_unit || "-"} • {Number(item.unit_price || 0).toFixed(2)}
                      </div>
                    </div>
                  ))}
                  {!(selectedSheet.items || []).length ? <div className="text-xs text-neutral-500">No rows linked.</div> : null}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
