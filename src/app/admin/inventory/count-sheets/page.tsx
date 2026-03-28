"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import InventoryTabs from "@/components/InventoryTabs";
import InventoryRegistrationHelp from "@/components/InventoryRegistrationHelp";
import { canAccessInventoryAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { BRANCHES, labelOf, type City } from "@/lib/branches";
import { emptyCountLine, lineFromItem, monthNow, type InventoryCountLine, type InventoryItemLookup } from "@/lib/inventoryCountUtils";
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

type CountSheetDetail = CountSheetRow & { items?: InventoryCountLine[] };
type PreviewSheet = { sheet_name: string; branch_guess: string; cycle_guess: string; header_row_index: number; row_count: number };
type SelectedPreview = PreviewSheet & { matched_count: number; unmatched_count: number; rows: InventoryCountLine[] };

type EditableColumn = "sku" | "supplier_name" | "item_name" | "invoice_name" | "storage_unit" | "unit_price" | "counted_qty" | "memo";

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
  const [reference, setReference] = useState("");
  const [historyMonth, setHistoryMonth] = useState(monthNow());
  const [itemSearch, setItemSearch] = useState("");
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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showExcelImport, setShowExcelImport] = useState(false);
  const [importingPreviewItems, setImportingPreviewItems] = useState(false);
  const [registerBusy, setRegisterBusy] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemSku, setNewItemSku] = useState("");
  const [newItemUnit, setNewItemUnit] = useState("");
  const [newItemCost, setNewItemCost] = useState("0");
  const [newItemCategory, setNewItemCategory] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cellRefs = useRef<Record<string, HTMLInputElement | null>>({});

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
          inventoryGet<{ rows: InventoryItemLookup[] }>(`/api/admin/inventory/items?city=${encodeURIComponent(city)}&tab=ALL&limit=5000`),
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
        const res = await inventoryGet<{ row: CountSheetDetail }>(`/api/admin/inventory/count-sheets/${encodeURIComponent(selectedSheetId)}?city=${encodeURIComponent(city)}`);
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

  const groupedDraft = useMemo(() => {
    const groups = new Map<string, Array<{ index: number; line: InventoryCountLine }>>();
    draftLines.forEach((line, index) => {
      const supplier = String(line.supplier_name || "").trim() || "Unknown supplier";
      const rows = groups.get(supplier) || [];
      rows.push({ index, line });
      groups.set(supplier, rows);
    });
    return Array.from(groups.entries()).map(([supplier, rows]) => ({ supplier, rows }));
  }, [draftLines]);

  const excelDerivedItemOptions = useMemo<InventoryItemLookup[]>(
    () =>
      (selectedPreview?.rows || []).map((row, idx) => ({
        id: `excel-${idx}`,
        name: row.item_name || row.invoice_name || `Excel Item ${idx + 1}`,
        sku: row.sku || "",
        category_name: row.category || "",
        supplier_name: row.supplier_name || "",
        storage_unit: row.storage_unit || "",
        cost: Number(row.unit_price || 0),
        status: "ACTIVE",
      })),
    [selectedPreview],
  );
  const selectableItems = itemOptions.length ? itemOptions : excelDerivedItemOptions;
  const filteredSelectableItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return selectableItems.slice(0, 300);
    return selectableItems.filter((item) => `${item.supplier_name || ""} ${item.name || ""} ${item.sku || ""}`.toLowerCase().includes(q)).slice(0, 300);
  }, [itemSearch, selectableItems]);
  const selectedItem = useMemo(() => selectableItems.find((item) => item.id === selectedItemId) || null, [selectableItems, selectedItemId]);

  function cycleLabel(value: string) {
    return cycleOptions().find((opt) => opt.value === value)?.label || value;
  }

  function autoTemplateName(sourceSheetName = "") {
    const branchLabel = labelOf(city, branchCode) || branchCode || city.toUpperCase();
    const today = new Date().toISOString().slice(0, 10);
    return sourceSheetName ? `${branchLabel} ${cycleLabel(cycle)} ${sourceSheetName}`.trim() : `${branchLabel} ${cycleLabel(cycle)} ${today}`;
  }

  function keyOf(rowIndex: number, col: EditableColumn) {
    return `${rowIndex}:${col}`;
  }

  function moveDown(rowIndex: number, col: EditableColumn) {
    const key = keyOf(rowIndex + 1, col);
    const target = cellRefs.current[key];
    if (!target) return;
    target.focus();
    target.select();
  }

  function handleEnter(event: KeyboardEvent<HTMLInputElement>, rowIndex: number, col: EditableColumn) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    moveDown(rowIndex, col);
  }

  function updateDraftLine(index: number, patch: Partial<InventoryCountLine>) {
    setDraftLines((prev) => prev.map((line, idx) => (idx === index ? { ...line, ...patch } : line)));
  }

  function addManualItem() {
    if (!selectedItem) return;
    if (selectedItem.id.startsWith("excel-")) {
      setDraftLines((prev) => [
        ...prev,
        {
          item_id: "",
          category: selectedItem.category_name || "",
          supplier_name: selectedItem.supplier_name || "",
          item_name: selectedItem.name || "",
          invoice_name: selectedItem.name || "",
          sku: selectedItem.sku || "",
          storage_unit: selectedItem.storage_unit || "",
          unit_price: Number(selectedItem.cost || 0),
          theoretical_qty: 0,
          counted_qty: 0,
          variance_qty: 0,
          asset_value: 0,
          memo: "",
          foodics_data: "",
          order_difference: "",
          sort_order: prev.length + 1,
        },
      ]);
    } else {
      setDraftLines((prev) => [...prev, lineFromItem(selectedItem, prev.length + 1)]);
    }
    setSelectedItemId("");
  }

  function addRow() {
    setDraftLines((prev) => [...prev, emptyCountLine(prev.length + 1)]);
  }

  function removeDraftLine(index: number) {
    setDraftLines((prev) => prev.filter((_, idx) => idx !== index).map((line, idx) => ({ ...line, sort_order: idx + 1 })));
  }

  async function refreshItemOptions() {
    const itemsRes = await inventoryGet<{ rows: InventoryItemLookup[] }>(`/api/admin/inventory/items?city=${encodeURIComponent(city)}&tab=ALL&limit=5000`);
    setItemOptions((itemsRes.rows || []).filter((item) => item.status !== "DELETED"));
  }

  async function registerPreviewItemsToMaster() {
    if (!selectedPreview?.rows?.length) {
      setError("Load a sheet preview first.");
      return;
    }
    setImportingPreviewItems(true);
    setError("");
    setSuccess("");
    try {
      const dedupe = new Map<string, any>();
      for (const row of selectedPreview.rows) {
        const name = String(row.item_name || row.invoice_name || "").trim();
        if (!name) continue;
        const sku = String(row.sku || "").trim();
        const key = sku ? `sku:${sku.toUpperCase()}` : `name:${name.toLowerCase()}|unit:${String(row.storage_unit || "").toLowerCase()}`;
        if (dedupe.has(key)) continue;
        dedupe.set(key, {
          name,
          sku,
          category_name: String(row.category || "").trim(),
          storage_unit: String(row.storage_unit || "").trim(),
          ingredient_unit: String(row.storage_unit || "").trim(),
          costing_method: "FIXED",
          cost: Number(row.unit_price || 0),
          item_type: "ITEM",
          tags: [],
          suppliers: [],
          custom_levels: [],
        });
      }
      const rows = Array.from(dedupe.values());
      if (!rows.length) {
        setError("No valid rows to register from this sheet.");
        return;
      }
      const imported = await inventoryPost<{ count?: number }>("/api/admin/inventory/items/import", { city, rows });
      await refreshItemOptions();
      setSuccess(`Registered ${Number(imported?.count || rows.length)} items to inventory master.`);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setImportingPreviewItems(false);
    }
  }

  async function createQuickItem() {
    const name = newItemName.trim();
    if (!name) {
      setError("Enter item name to register.");
      return;
    }
    setRegisterBusy(true);
    setError("");
    setSuccess("");
    try {
      const created = await inventoryPost<{ row?: { id?: string } }>("/api/admin/inventory/items", {
        city,
        name,
        sku: newItemSku.trim(),
        category_name: newItemCategory.trim(),
        storage_unit: newItemUnit.trim(),
        ingredient_unit: newItemUnit.trim(),
        storage_to_ingredient: 1,
        costing_method: "FIXED",
        cost: Number(newItemCost || 0),
        minimum_level: 0,
        par_level: 0,
        maximum_level: 0,
        item_type: "ITEM",
        tags: [],
        suppliers: [],
        custom_levels: [],
      });
      await refreshItemOptions();
      const createdId = String(created?.row?.id || "");
      if (createdId) setSelectedItemId(createdId);
      setNewItemName("");
      setNewItemSku("");
      setNewItemUnit("");
      setNewItemCost("0");
      setNewItemCategory("");
      setSuccess("New item registered and added to selectable list.");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setRegisterBusy(false);
    }
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
      const res = await inventoryFormPost<{ sheets?: PreviewSheet[]; selected_sheet?: SelectedPreview }>("/api/admin/inventory/count-sheets/import-preview", form);
      setPreviewSheets(Array.isArray(res.sheets) ? res.sheets : []);
      setSelectedPreview((res.selected_sheet as SelectedPreview) || null);
      if (!withSelectedSheet) {
        const first = Array.isArray(res.sheets) && res.sheets.length ? res.sheets[0].sheet_name : "";
        setSelectedPreviewSheetName((current) => current || first);
      }
      if (withSelectedSheet && res.selected_sheet) {
        const picked = res.selected_sheet as SelectedPreview;
        setDraftLines((picked.rows || []).map((row, idx) => ({ ...row, counted_qty: 0, theoretical_qty: 0, variance_qty: 0, sort_order: idx + 1 })));
        if (!branchCode && picked.branch_guess) setBranchCode(picked.branch_guess);
        if (picked.cycle_guess) setCycle(picked.cycle_guess);
        setSuccess("Loaded selected Excel sheet into grid.");
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setPreviewBusy(false);
    }
  }

  function loadPreviewIntoDraft() {
    if (!selectedPreview) return;
    setDraftLines((selectedPreview.rows || []).map((row, idx) => ({ ...row, counted_qty: 0, theoretical_qty: 0, variance_qty: 0, sort_order: idx + 1 })));
    if (!branchCode && selectedPreview.branch_guess) setBranchCode(selectedPreview.branch_guess);
    if (selectedPreview.cycle_guess) setCycle(selectedPreview.cycle_guess);
    setSuccess("Loaded selected Excel sheet into grid.");
  }

  function loadSelectedSheetIntoDraft() {
    if (!selectedSheet) return;
    setDraftLines((selectedSheet.items || []).map((row, idx) => ({ ...row, sort_order: idx + 1 })));
    setReference(selectedSheet.reference || "");
    if (selectedSheet.branch_code) setBranchCode(selectedSheet.branch_code);
    if (selectedSheet.cycle) setCycle(selectedSheet.cycle);
    setSuccess("Loaded selected count template into grid.");
  }

  async function saveCountSheet() {
    if (!draftLines.length) {
      setError("Please add at least one item.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const sourceSheetName = selectedPreview?.sheet_name || selectedSheet?.source_sheet_name || "";
      const created = await inventoryPost<{ row: CountSheetRow }>("/api/admin/inventory/count-sheets", {
        city,
        name: autoTemplateName(sourceSheetName),
        reference: reference.trim(),
        branch_code: branchCode,
        cycle,
        source_sheet_name: sourceSheetName,
      });
      const countSheetId = String(created?.row?.id || "");
      await inventoryPost(`/api/admin/inventory/count-sheets/${encodeURIComponent(countSheetId)}/items`, {
        city,
        items: draftLines.map((line, idx) => ({ ...line, sort_order: idx + 1 })),
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
            <div className="mt-1 text-sm text-neutral-400">Start counting with an Excel-like grid. Add items and enter counted quantities directly.</div>
          </div>
          <div className="text-xs text-neutral-500">{city.toUpperCase()} template workspace</div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
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
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowAdvanced((prev) => !prev)} className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200">
            {showAdvanced ? "Hide Advanced" : "Show Advanced"}
          </button>
          <button type="button" onClick={() => setShowExcelImport((prev) => !prev)} className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200">
            {showExcelImport ? "Hide Import from Excel (optional)" : "Import from Excel (optional)"}
          </button>
        </div>

        {showAdvanced ? (
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference (optional)" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
          </div>
        ) : null}

        {error ? <div className="mt-3 text-sm text-rose-300">{error}</div> : null}
        {success ? <div className="mt-3 text-sm text-emerald-300">{success}</div> : null}
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-neutral-100">Counting Grid</div>
            <div className="mt-1 text-xs text-neutral-400">Start counting by adding items below. `Counted Qty` is the most important column.</div>
          </div>
          <div className="text-xs text-neutral-500">{draftLines.length} rows</div>
        </div>

        {!selectableItems.length ? (
          <div className="mt-4 rounded-xl border border-amber-900/70 bg-amber-950/20 px-3 py-3 text-sm text-amber-200">
            <div>No inventory items registered. Please register in Ingredients / Products first.</div>
            <Link href="/admin/inventory/items" className="mt-2 inline-block text-xs text-amber-100 underline">
              Go to Ingredients / Products
            </Link>
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px_140px]">
          <input value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} placeholder="Search by supplier / item / SKU" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
          <select className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" value={selectedItemId} onChange={(e) => setSelectedItemId(e.target.value)}>
            <option value="">{filteredSelectableItems.length ? "Add inventory item" : "No matched items"}</option>
            {filteredSelectableItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.supplier_name ? `${item.supplier_name} / ` : ""}{item.name} {item.sku ? `(${item.sku})` : ""}
              </option>
            ))}
          </select>
          <button type="button" onClick={addManualItem} disabled={!selectedItem} className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900 disabled:opacity-60">
            Add Item
          </button>
          <button type="button" onClick={addRow} className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900">
            Add Row
          </button>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1.3fr)_140px_120px_120px_100px_160px]">
          <input value={newItemName} onChange={(e) => setNewItemName(e.target.value)} placeholder="New item name" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
          <input value={newItemSku} onChange={(e) => setNewItemSku(e.target.value)} placeholder="SKU (optional)" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
          <input value={newItemUnit} onChange={(e) => setNewItemUnit(e.target.value)} placeholder="Unit" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
          <input type="number" min="0" step="0.01" value={newItemCost} onChange={(e) => setNewItemCost(e.target.value)} placeholder="Cost" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
          <input value={newItemCategory} onChange={(e) => setNewItemCategory(e.target.value)} placeholder="Category" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
          <button type="button" onClick={() => void createQuickItem()} disabled={registerBusy} className="rounded-xl border border-sky-800 bg-sky-950/30 px-4 py-2 text-sm text-sky-200 hover:bg-sky-900/30 disabled:opacity-60">
            {registerBusy ? "Registering..." : "Register Item"}
          </button>
        </div>

        <div className="mt-3 text-xs text-neutral-400">Excel-like behavior: use `Tab` to move across cells and `Enter` to move down in the same column.</div>

        <div className="mt-4 space-y-4">
          {groupedDraft.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-800 bg-neutral-950/30 px-3 py-6 text-center text-xs text-neutral-500">
              Add items and enter counted quantities to start counting.
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
                      <th className="px-3 py-2 text-left">SKU</th>
                      <th className="px-3 py-2 text-left">Supplier</th>
                      <th className="px-3 py-2 text-left">Item Name</th>
                      <th className="px-3 py-2 text-left">Invoice Name</th>
                      <th className="px-3 py-2 text-left">Unit</th>
                      <th className="px-3 py-2 text-right">Unit Price</th>
                      <th className="px-3 py-2 text-right text-emerald-300">Counted Qty</th>
                      <th className="px-3 py-2 text-left">Memo</th>
                      <th className="px-3 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map(({ index, line }) => (
                      <tr key={`${line.sku}-${index}-${line.item_name}`} className="border-t border-neutral-800 bg-neutral-950/30">
                        <td className="px-3 py-2">
                          <input ref={(el) => { cellRefs.current[`${index}:sku`] = el; }} value={line.sku} onChange={(e) => updateDraftLine(index, { sku: e.target.value })} onKeyDown={(e) => handleEnter(e, index, "sku")} className="w-24 rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs" />
                        </td>
                        <td className="px-3 py-2">
                          <input ref={(el) => { cellRefs.current[`${index}:supplier_name`] = el; }} value={line.supplier_name} onChange={(e) => updateDraftLine(index, { supplier_name: e.target.value })} onKeyDown={(e) => handleEnter(e, index, "supplier_name")} className="w-32 rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs" />
                        </td>
                        <td className="px-3 py-2">
                          <input ref={(el) => { cellRefs.current[`${index}:item_name`] = el; }} value={line.item_name} onChange={(e) => updateDraftLine(index, { item_name: e.target.value })} onKeyDown={(e) => handleEnter(e, index, "item_name")} className="w-40 rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs" />
                        </td>
                        <td className="px-3 py-2">
                          <input ref={(el) => { cellRefs.current[`${index}:invoice_name`] = el; }} value={line.invoice_name} onChange={(e) => updateDraftLine(index, { invoice_name: e.target.value })} onKeyDown={(e) => handleEnter(e, index, "invoice_name")} className="w-40 rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs" />
                        </td>
                        <td className="px-3 py-2">
                          <input ref={(el) => { cellRefs.current[`${index}:storage_unit`] = el; }} value={line.storage_unit} onChange={(e) => updateDraftLine(index, { storage_unit: e.target.value })} onKeyDown={(e) => handleEnter(e, index, "storage_unit")} className="w-20 rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs" />
                        </td>
                        <td className="px-3 py-2">
                          <input ref={(el) => { cellRefs.current[`${index}:unit_price`] = el; }} type="number" min="0" step="0.01" value={line.unit_price} onChange={(e) => updateDraftLine(index, { unit_price: Number(e.target.value || 0) })} onKeyDown={(e) => handleEnter(e, index, "unit_price")} className="w-24 rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-right text-xs" />
                        </td>
                        <td className="px-3 py-2">
                          <input ref={(el) => { cellRefs.current[`${index}:counted_qty`] = el; }} type="number" step="0.001" value={line.counted_qty} onChange={(e) => updateDraftLine(index, { counted_qty: Number(e.target.value || 0) })} onKeyDown={(e) => handleEnter(e, index, "counted_qty")} className="w-24 rounded-lg border border-emerald-800 bg-emerald-950/20 px-2 py-1.5 text-right text-xs text-emerald-100" />
                        </td>
                        <td className="px-3 py-2">
                          <input ref={(el) => { cellRefs.current[`${index}:memo`] = el; }} value={line.memo} onChange={(e) => updateDraftLine(index, { memo: e.target.value })} onKeyDown={(e) => handleEnter(e, index, "memo")} className="w-32 rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs" />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button type="button" onClick={() => removeDraftLine(index)} className="rounded-lg border border-rose-800/70 bg-rose-950/20 px-2 py-1 text-xs text-rose-200">
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
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

      {showExcelImport ? (
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-neutral-100">Import from Excel (optional)</div>
              <div className="mt-1 text-xs text-neutral-500">Use this only when loading rows from `Inventory Dubai 2026.xlsx`.</div>
            </div>
            <div className="text-xs text-neutral-500">{previewSheets.length} sheets detected</div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_220px_160px_160px]">
            <div className="flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setUploadFile(file);
                  setPreviewSheets([]);
                  setSelectedPreview(null);
                  setSelectedPreviewSheetName("");
                }}
                className="hidden"
              />
              <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-100">
                Select Excel File
              </button>
              <div className="truncate text-xs text-neutral-400">{uploadFile?.name || "No file selected"}</div>
            </div>
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
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={loadPreviewIntoDraft} className="rounded-xl border border-emerald-800 bg-emerald-950/30 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-900/30">
                    Load Into Grid
                  </button>
                  <button type="button" onClick={() => void registerPreviewItemsToMaster()} disabled={importingPreviewItems} className="rounded-xl border border-sky-800 bg-sky-950/30 px-4 py-2 text-sm text-sky-200 hover:bg-sky-900/30 disabled:opacity-60">
                    {importingPreviewItems ? "Registering..." : "Register Items to Master"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-neutral-100">History</div>
            <div className="mt-1 text-xs text-neutral-500">Review saved count template history and details.</div>
          </div>
          <input type="month" lang="en" value={historyMonth} onChange={(e) => setHistoryMonth(e.target.value)} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" />
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
                  Load to Grid
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
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
