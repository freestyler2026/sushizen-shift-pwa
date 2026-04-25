"use client";

import { Package, Plus, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canAccessCostAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { costJson } from "@/lib/costClient";

type SupplierRow = {
  id: string;
  name: string;
};

type IngredientRow = {
  id: string;
  city: string;
  category: string;
  name: string;
  unit: string;
  unit_price: number;
  yield_rate: number;
  supplier_id?: string;
  supplier_name?: string;
  notes?: string;
  updated_at?: string;
  _new?: boolean;
  _dirty?: boolean;
};

type IngredientDetail = IngredientRow & {
  price_history: Array<{
    id: string;
    unit_price: number;
    changed_at: string;
    changed_by: string;
    notes: string;
  }>;
  supplier_prices: Array<{
    id: string;
    supplier_id: string;
    supplier_name: string;
    purchase_unit: string;
    purchase_qty: number;
    purchase_price: number;
    unit_price: number;
    updated_by: string;
    updated_at: string;
  }>;
};

type Column = {
  key: string;
  label: string;
  width: number;
  editable?: boolean;
  align?: "left" | "right";
};

const COLUMNS: Column[] = [
  { key: "row_num", label: "", width: 44 },
  { key: "category", label: "Category", width: 130, editable: true },
  { key: "name", label: "Name", width: 220, editable: true },
  { key: "unit", label: "Unit", width: 70, editable: true },
  { key: "unit_price", label: "Unit Price", width: 110, editable: true, align: "right" },
  { key: "notes", label: "Source / Notes", width: 220, editable: true },
];

const CATEGORY_OPTIONS = [
  "鮮魚",
  "野菜",
  "米・麺・皮",
  "肉類",
  "加工肉・卵",
  "調味料",
  "乾物・他",
  "CKソース",
  "CK加工品",
  "Kitchen加工品",
  "包材",
  "Imported",
  "Uncategorized",
];

// Display labels for categories (values stay in Japanese to match DB)
const CATEGORY_LABEL: Record<string, string> = {
  "鮮魚": "Fresh Fish",
  "野菜": "Vegetables",
  "米・麺・皮": "Rice / Noodles / Wrappers",
  "肉類": "Meat",
  "加工肉・卵": "Processed Meat / Eggs",
  "調味料": "Seasonings",
  "乾物・他": "Dry Goods / Other",
  "CKソース": "CK Sauce",
  "CK加工品": "CK Processed",
  "Kitchen加工品": "Kitchen Processed",
  "包材": "Packaging",
};
function displayCategory(cat: string): string {
  return CATEGORY_LABEL[cat] || cat;
}

const INGREDIENT_LIST_PAGE_SIZE = 500;

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function columnLetter(index: number) {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const mod = (n - 1) % 26;
    out = String.fromCharCode(65 + mod) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function normalizeNumber(value: string | number) {
  const parsed = Number(String(value || "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function ProcurementIngredientsPage() {
  const auth = useMemo(() => getAuth(), []);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState<"dubai" | "manila">(String(auth?.city || "dubai").toLowerCase() === "manila" ? "manila" : "dubai");
  const [searchText, setSearchText] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [rows, setRows] = useState<IngredientRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [selectedRowId, setSelectedRowId] = useState("");
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: string } | null>(null);
  const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [dirtyRows, setDirtyRows] = useState<Set<number>>(new Set());
  const [detail, setDetail] = useState<IngredientDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [supplierForm, setSupplierForm] = useState({
    supplier_id: "",
    purchase_unit: "",
    purchase_qty: "1",
    purchase_price: "0",
    unit_price: "0",
    apply_to_master: true,
  });

  const loadSuppliers = useCallback(async () => {
    const res = await costJson<{ items: SupplierRow[] }>(`/api/cost/suppliers?city=${encodeURIComponent(city)}`);
    setSuppliers(Array.isArray(res?.items) ? res.items : []);
  }, [city]);

  const loadRows = useCallback(async () => {
    const seen = new Set<string>();
    const merged: IngredientRow[] = [];
    let offset = 0;
    for (let page = 0; page < 400; page += 1) {
      const qs = new URLSearchParams({
        city,
        limit: String(INGREDIENT_LIST_PAGE_SIZE),
        offset: String(offset),
      });
      if (searchText.trim()) qs.set("q", searchText.trim());
      if (categoryFilter) qs.set("category", categoryFilter);
      const res = await costJson<{ items: IngredientRow[] }>(`/api/cost/ingredients?${qs.toString()}`);
      const batch = Array.isArray(res?.items) ? res.items : [];
      let added = 0;
      for (const row of batch) {
        const id = String(row.id || "");
        if (!id || seen.has(id)) continue;
        seen.add(id);
        merged.push(row);
        added += 1;
      }
      if (batch.length < INGREDIENT_LIST_PAGE_SIZE || added === 0) break;
      offset += INGREDIENT_LIST_PAGE_SIZE;
    }
    setRows(merged);
  }, [categoryFilter, city, searchText]);

  const loadDetail = useCallback(async (ingredientId: string) => {
    const res = await costJson<{ item: IngredientDetail }>(`/api/cost/ingredients/${ingredientId}`);
    const item = res?.item || null;
    setDetail(item);
    setSelectedRowId(ingredientId);
    if (item) {
      setSupplierForm((prev) => ({
        ...prev,
        supplier_id: item.supplier_id || prev.supplier_id || "",
        unit_price: String(item.unit_price || 0),
      }));
    }
  }, []);

  useEffect(() => {
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      setAllowed(canAccessCostAdmin(refreshed || auth));
    }
    void init();
  }, [auth]);

  useEffect(() => {
    if (!allowed) return;
    void loadSuppliers();
    void loadRows();
    setSelectedRowId("");
    setDetail(null);
    setDirtyRows(new Set());
  }, [allowed, city, loadRows, loadSuppliers]);

  const filteredRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return rows.filter((row) => {
      if (categoryFilter && row.category !== categoryFilter) return false;
      if (!q) return true;
      return [row.category, row.name, row.unit, row.notes].some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [categoryFilter, rows, searchText]);

  const dirtyCount = useMemo(() => rows.filter((row) => row._dirty || row._new).length, [rows]);

  const currentCellValue = useMemo(() => {
    if (!selectedCell) return "";
    const row = filteredRows[selectedCell.row] as any;
    if (!row) return "";
    return selectedCell.col === "row_num" ? selectedCell.row + 1 : row[selectedCell.col] ?? "";
  }, [filteredRows, selectedCell]);

  const startEdit = (rowIndex: number, colKey: string, seed?: string) => {
    const column = COLUMNS.find((item) => item.key === colKey);
    if (!column?.editable) return;
    setEditingCell({ row: rowIndex, col: colKey });
    const row = filteredRows[rowIndex] as any;
    setEditValue(seed ?? String(row?.[colKey] ?? ""));
    setSelectedCell({ row: rowIndex, col: colKey });
  };

  const commitEdit = (value: string) => {
    if (!editingCell) return;
    const row = filteredRows[editingCell.row];
    if (!row) {
      setEditingCell(null);
      return;
    }
    setRows((prev) =>
      prev.map((item) => {
        if (item.id !== row.id) return item;
        const next = { ...item, _dirty: true } as any;
        next[editingCell.col] = editingCell.col === "unit_price" ? normalizeNumber(value) : value;
        return next;
      }),
    );
    setDirtyRows((prev) => new Set([...prev, editingCell.row]));
    setEditingCell(null);
    setEditValue("");
  };

  const saveGrid = async () => {
    setBusy(true);
    setError("");
    try {
      const dirty = rows.filter((row) => row._dirty || row._new);
      for (const row of dirty) {
        const payload = {
          category: row.category,
          name: row.name,
          unit: row.unit,
          unit_price: Number(row.unit_price || 0),
          notes: row.notes || "",
        };
        if (row._new) {
          await costJson("/api/cost/ingredients", {
            method: "POST",
            body: JSON.stringify({ city, yield_rate: 1.15, ...payload }),
          });
        } else {
          await costJson(`/api/cost/ingredients/${row.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          });
        }
      }
      await loadRows();
      if (selectedRowId) await loadDetail(selectedRowId);
      setDirtyRows(new Set());
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: `new-ingredient-${Date.now()}`,
        city,
        category: categoryFilter || "野菜",
        name: "",
        unit: "",
        unit_price: 0,
        yield_rate: 1.15,
        notes: "",
        _new: true,
        _dirty: true,
      },
    ]);
  };

  const handleSupplierSave = async () => {
    if (!detail || !supplierForm.supplier_id) return;
    setBusy(true);
    setError("");
    try {
      await costJson(`/api/cost/suppliers/${supplierForm.supplier_id}/ingredient-price`, {
        method: "PUT",
        body: JSON.stringify({
          city,
          ingredient_id: Number(detail.id),
          purchase_unit: supplierForm.purchase_unit,
          purchase_qty: Number(supplierForm.purchase_qty || 0),
          purchase_price: Number(supplierForm.purchase_price || 0),
          unit_price: Number(supplierForm.unit_price || 0),
          apply_to_master: supplierForm.apply_to_master,
        }),
      });
      await loadRows();
      await loadDetail(detail.id);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const onGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (editingCell) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void saveGrid();
      return;
    }
    if (!selectedCell) return;
    const keys = COLUMNS.map((column) => column.key);
    const colIndex = keys.indexOf(selectedCell.col);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedCell({ row: Math.min(filteredRows.length - 1, selectedCell.row + 1), col: selectedCell.col });
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedCell({ row: Math.max(0, selectedCell.row - 1), col: selectedCell.col });
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      setSelectedCell({ row: selectedCell.row, col: keys[Math.max(0, colIndex - 1)] });
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setSelectedCell({ row: selectedCell.row, col: keys[Math.min(keys.length - 1, colIndex + 1)] });
    } else if (event.key === "F2") {
      event.preventDefault();
      startEdit(selectedCell.row, selectedCell.col);
    } else if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.length === 1) {
      event.preventDefault();
      startEdit(selectedCell.row, selectedCell.col, event.key);
    }
  };

  if (!allowed) {
    return <div className="text-sm text-red-300">Ingredient master is available only to authorized admin roles.</div>;
  }

  return (
    <div className="h-[calc(100vh-3.5rem)] bg-[#0a0b14]">
      <div className="flex h-full flex-col bg-[#0a0b14]">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-white/10 bg-white/3 px-4 text-xs">
          <div className="inline-flex items-center gap-2 text-emerald-300">
            <Package className="h-4 w-4" />
            <span>Ingredient Master</span>
          </div>
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search ingredients..."
            className="rounded border border-white/15 bg-white/5 px-2 py-1 text-xs text-white outline-none placeholder:text-zinc-500"
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded border border-white/15 bg-white/5 px-2 py-1 text-xs text-zinc-300 outline-none"
          >
            <option value="">All Categories</option>
            {CATEGORY_OPTIONS.map((option) => <option key={option} value={option}>{displayCategory(option)}</option>)}
          </select>
          <button className="inline-flex items-center gap-1 rounded border border-violet-500/30 bg-violet-500/20 px-3 py-1 text-violet-300" type="button" onClick={addRow}>
            <Plus className="h-3.5 w-3.5" />
            Add Row
          </button>
          <button className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/20 px-3 py-1 text-emerald-300" type="button" onClick={() => void saveGrid()}>
            <Save className="h-3.5 w-3.5" />
            Save ({dirtyCount})
          </button>
          <div className="ml-auto flex items-center gap-2">
            <select
              value={city}
              onChange={(e) => setCity(e.target.value === "manila" ? "manila" : "dubai")}
              className="rounded border border-white/15 bg-white/5 px-2 py-1 text-xs text-zinc-300 outline-none"
            >
              <option value="dubai">Dubai</option>
              <option value="manila">Manila</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 border-b border-white/8 bg-white/2 px-3 py-1 text-xs">
          <div className="w-20 rounded border border-white/15 bg-white/5 px-2 py-0.5 text-center text-zinc-400">
            {selectedCell ? `${columnLetter(Math.max(0, COLUMNS.findIndex((column) => column.key === selectedCell.col) - 1))}${selectedCell.row + 2}` : ""}
          </div>
          <div className="h-4 w-px bg-white/15" />
          <div className="flex-1 rounded border border-white/10 bg-white/3 px-2 py-0.5 text-zinc-300">
            {String(currentCellValue ?? "")}
          </div>
        </div>

        {error ? <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-200">{error}</div> : null}

        <div className="grid flex-1 grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)] overflow-hidden">
          <div
            ref={gridRef}
            tabIndex={0}
            onKeyDown={onGridKeyDown}
            className="overflow-auto border-r border-white/10 outline-none"
          >
            <table className="min-w-max border-separate border-spacing-0">
              <colgroup>
                {COLUMNS.map((column) => <col key={column.key} style={{ width: column.width }} />)}
              </colgroup>
              <thead>
                <tr>
                  {COLUMNS.map((column, index) => (
                    <th
                      key={`${column.key}-letter`}
                      style={{ left: column.key === "row_num" ? 0 : undefined }}
                      className={cx(
                        "sticky top-0 z-20 h-5 border-b border-r border-white/5 bg-[#13131f] px-2 text-[10px] font-medium text-zinc-600",
                        column.key === "row_num" && "left-0 z-30",
                      )}
                    >
                      {column.key === "row_num" ? "" : columnLetter(index - 1)}
                    </th>
                  ))}
                </tr>
                <tr>
                  {COLUMNS.map((column) => (
                    <th
                      key={column.key}
                      style={{ left: column.key === "row_num" ? 0 : undefined, top: 20 }}
                      className={cx(
                        "sticky z-20 h-8 border-b border-r border-white/5 bg-[#1a1a2e] px-2 text-left text-[11px] font-medium text-zinc-400",
                        column.key === "row_num" && "left-0 z-30 text-right",
                      )}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, rowIndex) => {
                  const groupStart = rowIndex > 0 && filteredRows[rowIndex - 1]?.category !== row.category;
                  return (
                    <tr
                      key={`${row.id}-${rowIndex}`}
                      className={cx(
                        rowIndex % 2 === 0 ? "bg-white/[0.02]" : "bg-transparent",
                        "hover:bg-violet-500/5",
                        groupStart && "border-t-2 border-violet-500/20",
                      )}
                    >
                      {COLUMNS.map((column) => {
                        const isSelected = selectedCell?.row === rowIndex && selectedCell?.col === column.key;
                        const isEditing = editingCell?.row === rowIndex && editingCell?.col === column.key;
                        const value = column.key === "row_num" ? rowIndex + 1 : (row as any)[column.key] ?? "";
                        if (isEditing) {
                          return (
                            <td key={column.key} className={cx("relative border-r border-white/5 bg-violet-500/10 p-0", column.key === "row_num" && "sticky left-0 z-10 bg-white/3")}>
                              <input
                                autoFocus
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => commitEdit(editValue)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === "Tab") {
                                    e.preventDefault();
                                    commitEdit(editValue);
                                  }
                                  if (e.key === "Escape") {
                                    e.preventDefault();
                                    setEditingCell(null);
                                    setEditValue("");
                                  }
                                }}
                                className={cx("h-full w-full bg-transparent px-2 py-1.5 text-xs text-white outline-none", column.align === "right" && "text-right")}
                              />
                            </td>
                          );
                        }
                        return (
                          <td
                            key={column.key}
                            style={{ textAlign: column.align || "left", left: column.key === "row_num" ? 0 : undefined }}
                            className={cx(
                              "cursor-cell select-none overflow-hidden border-r border-white/5 px-2 py-1.5 text-xs whitespace-nowrap text-ellipsis",
                              isSelected && "bg-violet-500/8 outline outline-1 outline-violet-400 outline-offset-[-1px]",
                              column.key === "category" && "font-semibold text-violet-300",
                              column.key === "row_num" && "sticky left-0 z-10 bg-white/3 pr-2 text-right text-zinc-600",
                            )}
                            onClick={() => {
                              setSelectedCell({ row: rowIndex, col: column.key });
                              setSelectedRowId(row.id);
                              void loadDetail(row.id);
                              gridRef.current?.focus();
                            }}
                            onDoubleClick={() => startEdit(rowIndex, column.key)}
                          >
                            {column.key === "row_num" ? (
                              <div className="flex items-center justify-end gap-1">
                                {dirtyRows.has(rowIndex) ? <span className="h-1.5 w-1.5 rounded-full bg-sky-400" /> : null}
                                <span>{rowIndex + 1}</span>
                              </div>
                            ) : column.key === "unit_price" ? (
                              normalizeNumber(value).toFixed(2)
                            ) : column.key === "category" ? (
                              displayCategory(String(value ?? ""))
                            ) : (
                              String(value ?? "")
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="overflow-auto bg-white/[0.02] p-4">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-white">{detail?.name || "Supplier Prices"}</h2>
              <p className="mt-1 text-xs text-zinc-500">{detail ? `${displayCategory(detail.category)} · ${detail.unit}` : "Select an ingredient from the list on the left."}</p>
            </div>

            {detail ? (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500">Unit Price</div>
                    <div className="mt-1 text-lg font-semibold text-white">{Number(detail.unit_price || 0).toFixed(4)}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500">Yield Rate</div>
                    <div className="mt-1 text-lg font-semibold text-white">{(Number(detail.yield_rate || 1.15) * 100).toFixed(0)}%</div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="text-xs font-medium text-zinc-300">Supplier Prices</div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead>
                        <tr className="text-left text-[10px] uppercase tracking-[0.15em] text-zinc-500">
                          <th className="pb-2">Supplier</th>
                          <th className="pb-2">Purchase Unit</th>
                          <th className="pb-2">Qty</th>
                          <th className="pb-2">Purchase Price</th>
                          <th className="pb-2">Unit Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(detail.supplier_prices || []).map((row) => (
                          <tr key={row.id} className="border-t border-white/5 text-sm text-zinc-300">
                            <td className="py-2">{row.supplier_name}</td>
                            <td className="py-2">{row.purchase_unit || "-"}</td>
                            <td className="py-2">{row.purchase_qty || "-"}</td>
                            <td className="py-2">{row.purchase_price || "-"}</td>
                            <td className="py-2 text-white">{Number(row.unit_price || 0).toFixed(4)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs font-medium text-zinc-300">New Supplier Price</div>
                  <select
                    value={supplierForm.supplier_id}
                    onChange={(e) => setSupplierForm((prev) => ({ ...prev, supplier_id: e.target.value }))}
                    className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-300 outline-none"
                  >
                    <option value="">Supplier</option>
                    {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                  </select>
                  <div className="grid grid-cols-2 gap-3">
                    <input className="rounded border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none" placeholder="Purchase Unit" value={supplierForm.purchase_unit} onChange={(e) => setSupplierForm((prev) => ({ ...prev, purchase_unit: e.target.value }))} />
                    <input className="rounded border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none" type="number" placeholder="Qty" value={supplierForm.purchase_qty} onChange={(e) => setSupplierForm((prev) => ({ ...prev, purchase_qty: e.target.value }))} />
                    <input className="rounded border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none" type="number" placeholder="Purchase Price" value={supplierForm.purchase_price} onChange={(e) => setSupplierForm((prev) => ({ ...prev, purchase_price: e.target.value }))} />
                    <input className="rounded border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none" type="number" step="0.0001" placeholder="Unit Price" value={supplierForm.unit_price} onChange={(e) => setSupplierForm((prev) => ({ ...prev, unit_price: e.target.value }))} />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-zinc-300">
                    <input type="checkbox" checked={supplierForm.apply_to_master} onChange={(e) => setSupplierForm((prev) => ({ ...prev, apply_to_master: e.target.checked }))} />
                    Apply to Ingredient Master
                  </label>
                  <button className="rounded border border-emerald-500/30 bg-emerald-500/20 px-3 py-2 text-sm text-emerald-300" type="button" onClick={() => void handleSupplierSave()} disabled={busy || !supplierForm.supplier_id}>
                    Save
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-medium text-zinc-300">Price History</div>
                  {(detail.price_history || []).slice(0, 10).map((row) => (
                    <div key={row.id} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-zinc-300">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-white">{Number(row.unit_price || 0).toFixed(4)}</span>
                        <span className="text-xs text-zinc-500">{String(row.changed_at || "").slice(0, 19).replace("T", " ")}</span>
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">{row.changed_by || "-"} · {row.notes || "-"}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-400">
                Select an ingredient from the grid on the left to view and edit supplier prices here.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
