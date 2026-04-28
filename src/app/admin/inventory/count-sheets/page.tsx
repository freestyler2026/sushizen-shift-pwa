"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import InventoryTabs from "@/components/InventoryTabs";
import InventoryRegistrationHelp from "@/components/InventoryRegistrationHelp";
import { canAccessCountTemplatesAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { BRANCHES, labelOf, type City } from "@/lib/branches";
import { emptyCountLine, lineFromItem, monthNow, withVariance, type InventoryCountLine, type InventoryItemLookup } from "@/lib/inventoryCountUtils";
import { inventoryGet, inventoryPatch, inventoryPost } from "@/lib/inventoryClient";
import { formatDraftNumber, getInventoryCostStep, getInventoryQuantityStep, parseDraftNumber, stepDraftNumber } from "@/lib/quantityInput";

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

type CountSheetVersionRow = {
  id: string;
  count_sheet_id: string;
  city: string;
  version_no: number;
  name: string;
  reference: string;
  branch_code: string;
  cycle: string;
  source_sheet_name: string;
  status_before_change: string;
  snapshot_reason: string;
  changed_by: string;
  changed_at: string;
  created_at: string;
  updated_at: string;
};

type CountSheetVersionDetail = CountSheetVersionRow & { items?: InventoryCountLine[] };

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

  const [draftLines, setDraftLines] = useState<InventoryCountLine[]>([]);
  const [draftCellInputs, setDraftCellInputs] = useState<Record<string, string>>({});
  const [itemOptions, setItemOptions] = useState<InventoryItemLookup[]>([]);
  const [historyRows, setHistoryRows] = useState<CountSheetRow[]>([]);
  const [selectedSheetId, setSelectedSheetId] = useState("");
  const [selectedSheet, setSelectedSheet] = useState<CountSheetDetail | null>(null);
  const [editingSheetId, setEditingSheetId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [versionRows, setVersionRows] = useState<CountSheetVersionRow[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [selectedVersion, setSelectedVersion] = useState<CountSheetVersionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [registerBusy, setRegisterBusy] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemSku, setNewItemSku] = useState("");
  const [newItemUnit, setNewItemUnit] = useState("");
  const [newItemCost, setNewItemCost] = useState("0");
  const [newItemCategory, setNewItemCategory] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const cellRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const resolved = await refreshAuthFromApi(auth);
      if (cancelled) return;
      const nextCity = (resolved?.city || auth?.city || "manila") as City;
      setAllowed(canAccessCountTemplatesAdmin(resolved));
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
    setEditingSheetId("");
    setTemplateName("");
    setVersionRows([]);
    setSelectedVersionId("");
    setSelectedVersion(null);
    setDraftLines([]);
    setDraftCellInputs({});
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
          inventoryGet<{ rows: CountSheetRow[] }>(`/api/admin/inventory/count-sheets?city=${encodeURIComponent(city)}&tab=ACTIVE&limit=500`),
        ]);
        if (cancelled) return;
        setItemOptions((itemsRes.rows || []).filter((item) => item.status !== "DELETED"));
        setHistoryRows((sheetsRes.rows || []).filter((row) => row.status !== "DELETED"));
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
      setVersionRows([]);
      setSelectedVersionId("");
      setSelectedVersion(null);
      return;
    }
    let cancelled = false;
    async function loadDetail() {
      try {
        const [sheetRes, versionsRes] = await Promise.all([
          inventoryGet<{ row: CountSheetDetail }>(`/api/admin/inventory/count-sheets/${encodeURIComponent(selectedSheetId)}?city=${encodeURIComponent(city)}`),
          inventoryGet<{ rows: CountSheetVersionRow[] }>(`/api/admin/inventory/count-sheets/${encodeURIComponent(selectedSheetId)}/versions?city=${encodeURIComponent(city)}`),
        ]);
        if (cancelled) return;
        setSelectedSheet(sheetRes.row || null);
        setVersionRows(versionsRes.rows || []);
        setSelectedVersionId((prev) => {
          if (prev && (versionsRes.rows || []).some((row) => row.id === prev)) return prev;
          return String((versionsRes.rows || [])[0]?.id || "");
        });
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      }
    }
    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [allowed, city, selectedSheetId]);

  useEffect(() => {
    if (!selectedVersionId || !allowed) {
      setSelectedVersion(null);
      return;
    }
    let cancelled = false;
    async function loadVersion() {
      try {
        const res = await inventoryGet<{ row: CountSheetVersionDetail }>(`/api/admin/inventory/count-sheets/versions/${encodeURIComponent(selectedVersionId)}?city=${encodeURIComponent(city)}`);
        if (!cancelled) setSelectedVersion(res.row || null);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      }
    }
    void loadVersion();
    return () => {
      cancelled = true;
    };
  }, [allowed, city, selectedVersionId]);

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

  const selectableItems = itemOptions;
  // Set of inventory item IDs currently in the draft (for Add/Remove toggle)
  const draftItemIdSet = useMemo(() => new Set(draftLines.map((l) => String(l.item_id || "")).filter(Boolean)), [draftLines]);

  function removeItemFromDraft(itemId: string) {
    const nextLines = draftLines
      .filter((l) => String(l.item_id || "") !== itemId)
      .map((line, idx) => ({ ...line, sort_order: idx + 1 }));
    setDraftLines(nextLines);
    rebuildDraftCellInputs(nextLines);
  }

  const filteredSelectableItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return selectableItems;
    return selectableItems.filter((item) => `${item.supplier_name || ""} ${item.name || ""} ${item.sku || ""}`.toLowerCase().includes(q));
  }, [itemSearch, selectableItems]);
  const groupedSelectableItems = useMemo(() => {
    const groups = new Map<string, InventoryItemLookup[]>();
    filteredSelectableItems.forEach((item) => {
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
  }, [filteredSelectableItems]);

  function cycleLabel(value: string) {
    return cycleOptions().find((opt) => opt.value === value)?.label || value;
  }

  function autoTemplateName() {
    const branchLabel = labelOf(city, branchCode) || branchCode || city.toUpperCase();
    const today = new Date().toISOString().slice(0, 10);
    return `${branchLabel} ${cycleLabel(cycle)} ${today}`;
  }

  function draftTemplateName() {
    return templateName.trim() || autoTemplateName();
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
    if (col === "unit_price" || col === "counted_qty") {
      commitNumericCell(rowIndex, col);
    }
    moveDown(rowIndex, col);
  }

  function updateDraftLine(index: number, patch: Partial<InventoryCountLine>) {
    setDraftLines((prev) => prev.map((line, idx) => (idx === index ? { ...line, ...patch } : line)));
  }

  function rebuildDraftCellInputs(lines: InventoryCountLine[]) {
    const nextInputs: Record<string, string> = {};
    lines.forEach((line, index) => {
      nextInputs[keyOf(index, "unit_price")] = formatDraftNumber(line.unit_price, "0");
      nextInputs[keyOf(index, "counted_qty")] = formatDraftNumber(line.counted_qty, "0");
    });
    setDraftCellInputs(nextInputs);
  }

  function numericCellValue(index: number, col: "unit_price" | "counted_qty", fallback: number) {
    return draftCellInputs[keyOf(index, col)] ?? formatDraftNumber(fallback, "0");
  }

  function commitNumericCell(index: number, col: "unit_price" | "counted_qty") {
    const line = draftLines[index];
    if (!line) return;
    const parsed = parseDraftNumber(numericCellValue(index, col, line[col]));
    const nextValue = parsed === null || parsed < 0 ? 0 : parsed;
    setDraftCellInputs((prev) => ({ ...prev, [keyOf(index, col)]: formatDraftNumber(nextValue, "0") }));
    if (col === "counted_qty") {
      updateDraftLine(index, withVariance({ ...line, counted_qty: nextValue }));
      return;
    }
    updateDraftLine(index, { unit_price: nextValue });
  }

  function syncedDraftLines() {
    return draftLines.map((line, index) => {
      const unitPrice = parseDraftNumber(numericCellValue(index, "unit_price", line.unit_price));
      const countedQty = parseDraftNumber(numericCellValue(index, "counted_qty", line.counted_qty));
      return withVariance({
        ...line,
        unit_price: unitPrice === null || unitPrice < 0 ? 0 : unitPrice,
        counted_qty: countedQty === null || countedQty < 0 ? 0 : countedQty,
      });
    });
  }

  function buildDraftLine(item: InventoryItemLookup, countedQty: number, sortOrder: number) {
    const normalizedQty = Number.isFinite(countedQty) ? countedQty : 0;
    if (item.id.startsWith("excel-")) {
      return withVariance({
        item_id: "",
        category: item.category_name || "",
        supplier_name: item.supplier_name || "",
        item_name: item.name || "",
        invoice_name: item.name || "",
        sku: item.sku || "",
        storage_unit: item.storage_unit || "",
        unit_price: Number(item.cost || 0),
        theoretical_qty: 0,
        counted_qty: normalizedQty,
        variance_qty: 0,
        asset_value: 0,
        memo: "",
        foodics_data: "",
        order_difference: "",
        sort_order: sortOrder,
      });
    }
    return withVariance({ ...lineFromItem(item, sortOrder), counted_qty: normalizedQty });
  }

  function appendItemToDraft(item: InventoryItemLookup, countedQty = 0) {
    if (!item) return;
    const nextLines = [...draftLines, buildDraftLine(item, countedQty, draftLines.length + 1)];
    setDraftLines(nextLines);
    rebuildDraftCellInputs(nextLines);
  }

  function addRow() {
    const nextLines = [...draftLines, emptyCountLine(draftLines.length + 1)];
    setDraftLines(nextLines);
    rebuildDraftCellInputs(nextLines);
  }

  function removeDraftLine(index: number) {
    const nextLines = draftLines.filter((_, idx) => idx !== index).map((line, idx) => ({ ...line, sort_order: idx + 1 }));
    setDraftLines(nextLines);
    rebuildDraftCellInputs(nextLines);
  }

  async function refreshItemOptions() {
    const itemsRes = await inventoryGet<{ rows: InventoryItemLookup[] }>(`/api/admin/inventory/items?city=${encodeURIComponent(city)}&tab=ALL&limit=5000`);
    setItemOptions((itemsRes.rows || []).filter((item) => item.status !== "DELETED"));
  }

  async function createQuickItem() {
    const name = newItemName.trim();
    const parsedCost = parseDraftNumber(newItemCost);
    if (!name) {
      setError("Enter item name to register.");
      return;
    }
    if (parsedCost === null || parsedCost < 0) {
      setError("Enter a valid item cost.");
      return;
    }
    setRegisterBusy(true);
    setError("");
    setSuccess("");
    try {
      await inventoryPost<{ row?: { id?: string } }>("/api/admin/inventory/items", {
        city,
        name,
        sku: newItemSku.trim(),
        category_name: newItemCategory.trim(),
        storage_unit: newItemUnit.trim(),
        ingredient_unit: newItemUnit.trim(),
        storage_to_ingredient: 1,
        costing_method: "FIXED",
        cost: parsedCost,
        minimum_level: 0,
        par_level: 0,
        maximum_level: 0,
        item_type: "ITEM",
        tags: [],
        suppliers: [],
        custom_levels: [],
      });
      await refreshItemOptions();
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

  function loadSelectedSheetIntoDraft() {
    if (!selectedSheet) return;
    const nextLines = (selectedSheet.items || []).map((row, idx) => ({ ...row, sort_order: idx + 1 }));
    setDraftLines(nextLines);
    rebuildDraftCellInputs(nextLines);
    setEditingSheetId(selectedSheet.id);
    setTemplateName(selectedSheet.name || "");
    setReference(selectedSheet.reference || "");
    if (selectedSheet.branch_code) setBranchCode(selectedSheet.branch_code);
    if (selectedSheet.cycle) setCycle(selectedSheet.cycle);
    setSuccess("Loaded selected count template into edit mode.");
  }

  function resetTemplateEditor() {
    setEditingSheetId("");
    setTemplateName("");
    setReference("");
    setSelectedSheetId("");
    setSelectedSheet(null);
    setVersionRows([]);
    setSelectedVersionId("");
    setSelectedVersion(null);
    setDraftLines([]);
    setDraftCellInputs({});
    setSuccess("Started a new count template draft.");
  }

  function handleBranchChange(nextBranchCode: string) {
    setBranchCode(nextBranchCode);
    // Reset editor when branch changes to prevent saving a different branch's template by mistake
    setEditingSheetId("");
    setTemplateName("");
    setSelectedSheetId("");
    setSelectedSheet(null);
    setVersionRows([]);
    setSelectedVersionId("");
    setSelectedVersion(null);
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
      const nextDraftLines = syncedDraftLines();
      const payload = {
        city,
        name: draftTemplateName(),
        reference: reference.trim(),
        branch_code: branchCode,
        cycle,
        source_sheet_name: editingSheetId ? selectedSheet?.source_sheet_name || "" : "",
        items: nextDraftLines.map((line, idx) => ({ ...line, sort_order: idx + 1 })),
      };
      let countSheetId = editingSheetId;
      if (editingSheetId) {
        const updated = await inventoryPatch<{ row: CountSheetDetail }>(`/api/admin/inventory/count-sheets/${encodeURIComponent(editingSheetId)}?city=${encodeURIComponent(city)}`, payload);
        countSheetId = String(updated?.row?.id || editingSheetId);
        setSelectedSheet(updated.row || null);
      } else {
        const created = await inventoryPost<{ row: CountSheetRow }>("/api/admin/inventory/count-sheets", {
          city,
          name: draftTemplateName(),
          reference: reference.trim(),
          branch_code: branchCode,
          cycle,
          source_sheet_name: "",
        });
        countSheetId = String(created?.row?.id || "");
        await inventoryPost(`/api/admin/inventory/count-sheets/${encodeURIComponent(countSheetId)}/items`, {
          city,
          items: nextDraftLines.map((line, idx) => ({ ...line, sort_order: idx + 1 })),
        });
        setEditingSheetId(countSheetId);
        setTemplateName(String(created?.row?.name || payload.name));
      }
      setDraftLines(nextDraftLines);
      rebuildDraftCellInputs(nextDraftLines);
      const historyRes = await inventoryGet<{ rows: CountSheetRow[] }>(`/api/admin/inventory/count-sheets?city=${encodeURIComponent(city)}&tab=ACTIVE&limit=500`);
      setHistoryRows((historyRes.rows || []).filter((row) => row.status !== "DELETED"));
      setSelectedSheetId(countSheetId);
      setSuccess(editingSheetId ? "Count template updated. Previous version saved to history." : "Count template saved.");
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
      const historyRes = await inventoryGet<{ rows: CountSheetRow[] }>(`/api/admin/inventory/count-sheets?city=${encodeURIComponent(city)}&tab=ACTIVE&limit=500`);
      setHistoryRows((historyRes.rows || []).filter((row) => row.status !== "DELETED"));
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
      const historyRes = await inventoryGet<{ rows: CountSheetRow[] }>(`/api/admin/inventory/count-sheets?city=${encodeURIComponent(city)}&tab=ACTIVE&limit=500`);
      setHistoryRows((historyRes.rows || []).filter((row) => row.status !== "DELETED"));
      const versionsRes = await inventoryGet<{ rows: CountSheetVersionRow[] }>(`/api/admin/inventory/count-sheets/${encodeURIComponent(selectedSheetId)}/versions?city=${encodeURIComponent(city)}`);
      setVersionRows(versionsRes.rows || []);
      setSelectedVersionId(String((versionsRes.rows || [])[0]?.id || ""));
      setSelectedSheet((prev) => (prev ? { ...prev, status: "DELETED" } : prev));
      setEditingSheetId("");
      setSuccess("Selected count template deleted. Previous version saved to history.");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setActionBusy(false);
    }
  }

  if (!ready) return <div className="text-sm text-neutral-500">Loading count sheets...</div>;
  if (!allowed) return <div className="text-sm text-neutral-500">Only HQ or Admin can open Count Templates.</div>;

  return (
    <div className="space-y-6">
      <InventoryTabs />
      <InventoryRegistrationHelp />

      {/* ─── Header & Settings ─── */}
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold text-neutral-100">Count Templates</div>
            <div className="mt-1 text-sm text-neutral-400">Build a reusable count sheet by picking items, then save as a template.</div>
          </div>
          {/* City toggle */}
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
            <button
              type="button"
              onClick={() => setCity("manila")}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-all ${city === "manila" ? "bg-violet-600 text-white shadow" : "text-neutral-400 hover:text-white"}`}
            >
              🇵🇭 Manila
            </button>
            <button
              type="button"
              onClick={() => setCity("dubai")}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-all ${city === "dubai" ? "bg-violet-600 text-white shadow" : "text-neutral-400 hover:text-white"}`}
            >
              🇦🇪 Dubai
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" value={branchCode} onChange={(e) => handleBranchChange(e.target.value)}>
            {BRANCHES[city].map((branch) => (
              <option key={branch.code} value={branch.code}>{branch.name}</option>
            ))}
          </select>
          <select className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" value={cycle} onChange={(e) => setCycle(e.target.value)}>
            {cycleOptions().map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <input value={draftTemplateName()} readOnly placeholder="Template name (auto)" className="rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-2 text-sm text-neutral-400" />
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference (optional)" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={resetTemplateEditor} className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800">
            + New Template
          </button>
          {editingSheetId
            ? <span className="rounded-lg bg-amber-900/30 px-2 py-1 text-xs text-amber-300">Editing existing template</span>
            : <span className="text-xs text-neutral-600">New template</span>}
        </div>

        {error ? <div className="mt-3 text-sm text-rose-300">{error}</div> : null}
        {success ? <div className="mt-3 text-sm text-emerald-300">{success}</div> : null}
      </section>

      {/* ─── Main Workspace ─── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_1fr]">

        {/* LEFT: Item Library */}
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-neutral-100">Item Library</div>
            <span className="text-xs text-neutral-500">{filteredSelectableItems.length} items</span>
          </div>

          <div className="mt-3">
            <input
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              placeholder="Search by name, SKU, supplier…"
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
            />
          </div>

          {!selectableItems.length ? (
            <div className="mt-3 rounded-xl border border-amber-900/70 bg-amber-950/20 px-3 py-3 text-sm text-amber-200">
              <div>No items registered yet.</div>
              <Link href="/admin/inventory/items" className="mt-1 inline-block text-xs text-amber-100 underline">Go to Ingredients / Products →</Link>
            </div>
          ) : (
            <div className="mt-3 max-h-[560px] space-y-3 overflow-y-auto pr-1">
              {groupedSelectableItems.map((group) => (
                <div key={group.supplier}>
                  <div className="mb-1 px-1 text-xs font-semibold text-amber-400/80">{group.supplier}</div>
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
                            title="Remove from count sheet"
                          >✕</button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => appendItemToDraft(item)}
                            className="shrink-0 rounded-lg border border-emerald-700/60 bg-emerald-950/20 px-2 py-0.5 text-xs font-medium text-emerald-300 hover:bg-emerald-900/40"
                            title="Add to count sheet"
                          >+</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
              {groupedSelectableItems.length === 0 ? (
                <div className="py-6 text-center text-xs text-neutral-500">No items matched your search.</div>
              ) : null}
            </div>
          )}

          {/* Quick item registration */}
          <div className="mt-4 border-t border-neutral-800 pt-3">
            <button
              type="button"
              onClick={() => setShowAdvanced((prev) => !prev)}
              className="text-xs text-neutral-500 hover:text-neutral-300"
            >
              {showAdvanced ? "▾ Hide item registration" : "▸ Register new item"}
            </button>
            {showAdvanced ? (
              <div className="mt-3 space-y-2">
                <input value={newItemName} onChange={(e) => setNewItemName(e.target.value)} placeholder="Item name *" className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" />
                <div className="grid grid-cols-2 gap-2">
                  <input value={newItemSku} onChange={(e) => setNewItemSku(e.target.value)} placeholder="SKU" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" />
                  <input value={newItemUnit} onChange={(e) => setNewItemUnit(e.target.value)} placeholder="Unit" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" inputMode="decimal" value={newItemCost} onChange={(e) => setNewItemCost(e.target.value)} onKeyDown={(e) => {
                    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                    e.preventDefault();
                    setNewItemCost((current) => stepDraftNumber(current, getInventoryCostStep(), e.key === "ArrowUp" ? 1 : -1));
                  }} placeholder="Cost" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" />
                  <input value={newItemCategory} onChange={(e) => setNewItemCategory(e.target.value)} placeholder="Category" className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" />
                </div>
                <button type="button" onClick={() => void createQuickItem()} disabled={registerBusy} className="w-full rounded-xl border border-sky-800 bg-sky-950/30 py-2 text-sm text-sky-200 hover:bg-sky-900/30 disabled:opacity-60">
                  {registerBusy ? "Registering..." : "Register Item"}
                </button>
              </div>
            ) : null}
          </div>
        </section>

        {/* RIGHT: Counting Grid */}
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-neutral-100">Counting Grid</div>
                {editingSheetId
                  ? <span className="rounded-md bg-amber-900/30 px-2 py-0.5 text-xs text-amber-300">Updating existing template</span>
                  : <span className="rounded-md bg-sky-900/30 px-2 py-0.5 text-xs text-sky-400">New template</span>}
              </div>
              <div className="mt-0.5 text-xs text-neutral-500">
                {draftLines.length === 0
                  ? "Add items from the library on the left."
                  : `${draftLines.length} item${draftLines.length !== 1 ? "s" : ""} · Tab across cells, Enter to move down`}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={addRow} className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800">
                + Blank Row
              </button>
              <button
                type="button"
                onClick={saveCountSheet}
                disabled={saving || draftLines.length === 0}
                className="rounded-xl border border-emerald-800 bg-emerald-950/30 px-4 py-1.5 text-sm font-medium text-emerald-200 hover:bg-emerald-900/30 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save Count Sheet"}
              </button>
            </div>
          </div>

          {draftLines.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-neutral-800 bg-neutral-950/30 py-14 text-center">
              <div className="text-3xl">📋</div>
              <div className="mt-2 text-sm text-neutral-500">Pick items from the library to build your count sheet</div>
              <div className="mt-1 text-xs text-neutral-600">Or use &quot;+ Blank Row&quot; to add a row manually</div>
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
                          <th className="px-3 py-2 text-left font-medium">Item / Invoice Name</th>
                          <th className="px-3 py-2 text-left font-medium w-20">Unit</th>
                          <th className="px-3 py-2 text-right font-medium w-28 text-emerald-400">Counted Qty</th>
                          <th className="px-3 py-2 text-left font-medium">Memo</th>
                          <th className="px-3 py-2 w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map(({ index, line }) => (
                          <tr key={`${line.sku}-${index}-${line.item_name}`} className="border-t border-neutral-800/60 hover:bg-white/[0.02]">
                            <td className="px-3 py-2">
                              <input
                                ref={(el) => { cellRefs.current[`${index}:item_name`] = el; }}
                                value={line.item_name}
                                onChange={(e) => updateDraftLine(index, { item_name: e.target.value })}
                                onKeyDown={(e) => handleEnter(e, index, "item_name")}
                                className="w-44 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm text-neutral-200 hover:border-neutral-700 focus:border-neutral-600 focus:bg-neutral-950 focus:outline-none"
                              />
                              <div className="mt-0.5 flex items-center gap-2">
                                <input
                                  ref={(el) => { cellRefs.current[`${index}:invoice_name`] = el; }}
                                  value={line.invoice_name}
                                  onChange={(e) => updateDraftLine(index, { invoice_name: e.target.value })}
                                  onKeyDown={(e) => handleEnter(e, index, "invoice_name")}
                                  placeholder="Invoice name…"
                                  className="w-36 rounded border border-transparent bg-transparent px-1 py-0.5 text-[10px] text-neutral-500 placeholder-neutral-700 hover:border-neutral-700 focus:border-neutral-600 focus:bg-neutral-950 focus:outline-none"
                                />
                                {line.sku ? <span className="text-[10px] text-neutral-700">{line.sku}</span> : null}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                ref={(el) => { cellRefs.current[`${index}:storage_unit`] = el; }}
                                value={line.storage_unit}
                                onChange={(e) => updateDraftLine(index, { storage_unit: e.target.value })}
                                onKeyDown={(e) => handleEnter(e, index, "storage_unit")}
                                className="w-16 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-neutral-400 hover:border-neutral-700 focus:border-neutral-600 focus:bg-neutral-950 focus:outline-none"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                ref={(el) => { cellRefs.current[`${index}:counted_qty`] = el; }}
                                type="text"
                                inputMode="decimal"
                                value={numericCellValue(index, "counted_qty", line.counted_qty)}
                                onChange={(e) => setDraftCellInputs((prev) => ({ ...prev, [keyOf(index, "counted_qty")]: e.target.value }))}
                                onBlur={() => commitNumericCell(index, "counted_qty")}
                                onKeyDown={(e) => {
                                  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                                    e.preventDefault();
                                    setDraftCellInputs((prev) => ({ ...prev, [keyOf(index, "counted_qty")]: stepDraftNumber(numericCellValue(index, "counted_qty", line.counted_qty), getInventoryQuantityStep(line.storage_unit), e.key === "ArrowUp" ? 1 : -1) }));
                                    return;
                                  }
                                  handleEnter(e, index, "counted_qty");
                                }}
                                className="w-24 rounded-lg border border-emerald-800 bg-emerald-950/20 px-2 py-1.5 text-right text-sm font-medium text-emerald-100 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                ref={(el) => { cellRefs.current[`${index}:memo`] = el; }}
                                value={line.memo}
                                onChange={(e) => updateDraftLine(index, { memo: e.target.value })}
                                onKeyDown={(e) => handleEnter(e, index, "memo")}
                                placeholder="—"
                                className="w-28 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-neutral-500 placeholder-neutral-700 hover:border-neutral-700 focus:border-neutral-600 focus:bg-neutral-950 focus:outline-none"
                              />
                            </td>
                            <td className="px-2 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => removeDraftLine(index)}
                                className="rounded px-1.5 py-1 text-neutral-600 transition hover:text-rose-400"
                                title="Remove row"
                              >×</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ─── Saved Templates History ─── */}
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-neutral-100">Saved Templates</div>
            <div className="mt-0.5 text-xs text-neutral-500">Select a saved template to load it into the grid, duplicate, or delete.</div>
          </div>
          <input type="month" lang="en" value={historyMonth} onChange={(e) => setHistoryMonth(e.target.value)} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Branch</th>
                  <th className="px-3 py-2">Cycle</th>
                  <th className="px-3 py-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelectedSheetId(row.id)}
                    className={["border-t border-neutral-800 text-neutral-200 transition cursor-pointer", selectedSheetId === row.id ? "bg-emerald-950/20" : "hover:bg-white/5"].join(" ")}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.name}</div>
                      {row.reference ? <div className="text-xs text-neutral-500">{row.reference}</div> : null}
                    </td>
                    <td className="px-3 py-2 text-neutral-400">{labelOf(city, row.branch_code)}</td>
                    <td className="px-3 py-2 text-neutral-400">{row.cycle || "-"}</td>
                    <td className="px-3 py-2 text-neutral-500">{String(row.updated_at || row.created_at || "").slice(0, 10)}</td>
                  </tr>
                ))}
                {!loading && filteredHistory.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-neutral-500">No saved templates for this period.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/20 p-4">
            {!selectedSheet ? (
              <div className="text-sm text-neutral-500">← Select a template to see its details</div>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-neutral-100">{selectedSheet.name}</div>
                    <div className="mt-0.5 text-xs text-neutral-500">
                      {labelOf(city, selectedSheet.branch_code)} · {selectedSheet.cycle || "-"} · {(selectedSheet.items || []).length} items
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={loadSelectedSheetIntoDraft} disabled={!selectedSheet || actionBusy} className="rounded-lg border border-violet-700/70 bg-violet-950/30 px-3 py-1.5 text-xs font-medium text-violet-200 hover:bg-violet-900/30 disabled:opacity-50">
                      Load to Grid ↑
                    </button>
                    <button type="button" onClick={duplicateSelectedSheet} disabled={!selectedSheetId || actionBusy || selectedSheet?.status === "DELETED"} className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 disabled:opacity-50">
                      Duplicate
                    </button>
                    <button type="button" onClick={deleteSelectedSheet} disabled={!selectedSheetId || actionBusy || selectedSheet?.status === "DELETED"} className="rounded-lg border border-rose-800/70 bg-rose-950/20 px-3 py-1.5 text-xs text-rose-200 disabled:opacity-50">
                      Delete
                    </button>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-900/30 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Version History</div>
                  <div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
                    {(versionRows || []).length ? versionRows.map((version) => (
                      <button
                        key={version.id}
                        type="button"
                        onClick={() => setSelectedVersionId(version.id)}
                        className={["w-full rounded-lg border px-3 py-2 text-left text-xs transition", selectedVersionId === version.id ? "border-emerald-700/70 bg-emerald-950/20 text-emerald-100" : "border-neutral-800 bg-neutral-950/40 text-neutral-300 hover:bg-neutral-900/40"].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">v{version.version_no}</span>
                          <span className="text-neutral-500">{String(version.changed_at || version.created_at || "").slice(0, 16).replace("T", " ")}</span>
                        </div>
                        <div className="mt-0.5 text-neutral-500">{version.snapshot_reason} · {version.changed_by || "-"}</div>
                      </button>
                    )) : (
                      <div className="text-xs text-neutral-500">No saved versions yet.</div>
                    )}
                  </div>
                </div>

                {selectedVersion ? (
                  <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-900/30 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">v{selectedVersion.version_no} — {selectedVersion.snapshot_reason}</div>
                    <div className="mt-1 text-xs text-neutral-600">{selectedVersion.changed_by} · {String(selectedVersion.changed_at || "").slice(0, 16).replace("T", " ")}</div>
                    <div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
                      {(selectedVersion.items || []).map((item, i) => (
                        <div key={`${selectedVersion.id}-${i}`} className="rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-1.5 text-xs">
                          <span className="text-neutral-300">{item.item_name || "-"}</span>
                          <span className="ml-2 text-neutral-500">{item.sku || ""} · {item.storage_unit || ""} · {Number(item.counted_qty || 0).toFixed(3)}</span>
                        </div>
                      ))}
                      {!(selectedVersion.items || []).length && <div className="text-neutral-500 text-xs">No items.</div>}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
