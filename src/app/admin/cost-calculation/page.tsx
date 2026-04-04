"use client";

import { Calculator, Clock, Database, History, Loader2, Plus, Save, Search, Upload, User, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canAccessCostAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { costJson, costUpload } from "@/lib/costClient";

type SheetKey =
  | "食材マスタ"
  | "base_roll"
  | "signature_roll"
  | "fusion_roll"
  | "sushi_box"
  | "握り刺身"
  | "hot_menu"
  | "original_sauce";

type Align = "left" | "right" | "center";
type ColumnType = "text" | "number" | "autocomplete" | "formula" | "subtotal";

type SpreadsheetColumn = {
  key: string;
  label: string;
  width: number;
  frozen?: boolean;
  editable?: boolean;
  type?: ColumnType;
  align?: Align;
  formulaColor?: string;
};

type IngredientRow = {
  id: string;
  category: string;
  name: string;
  unit: string;
  unit_price: number;
  yield_rate: number;
  notes: string;
  city: string;
  _new?: boolean;
  _dirty?: boolean;
};

type RecipeRow = {
  id: string;
  menu_item_id?: string;
  city: string;
  sheet_key: SheetKey | string;
  menu_name: string;
  ingredient_id: string;
  ingredient: string;
  quantity: number;
  unit: string;
  unit_price: number;
  selling_price: number;
  yield_rate: number;
  _new?: boolean;
  _dirty?: boolean;
};

type PriceHistoryEntry = {
  id: number;
  unit_price: number;
  changed_at: string;
  changed_by: string;
  notes: string;
  previous_price?: number | null;
};

type MenuItemRow = {
  id: string;
  name: string;
  category: string;
  city: string;
  selling_price: number;
  total_cost: number;
  cost_ratio: number | null;
};

type SelectedCell = {
  row: number;
  col: string;
};

type SheetMeta = {
  key: SheetKey;
  name: string;
};

const SHEETS: SheetMeta[] = [
  { key: "食材マスタ", name: "食材マスタ" },
  { key: "base_roll", name: "Base Roll" },
  { key: "signature_roll", name: "Signature Roll" },
  { key: "fusion_roll", name: "Fusion Roll" },
  { key: "sushi_box", name: "Sushi Box" },
  { key: "握り刺身", name: "握り・刺身" },
  { key: "hot_menu", name: "Hot Menu" },
  { key: "original_sauce", name: "Original Sauce" },
];

const INGREDIENT_COLUMNS: SpreadsheetColumn[] = [
  { key: "row_num", label: "", width: 44, frozen: true, editable: false },
  { key: "category", label: "Category", width: 130, editable: true },
  { key: "name", label: "Name", width: 200, editable: true },
  { key: "unit", label: "Unit", width: 70, editable: true },
  { key: "unit_price", label: "Unit Price (AED)", width: 110, editable: true, type: "number", align: "right" },
  { key: "yield_rate", label: "Yield Rate", width: 90, editable: true, type: "number", align: "right" },
  { key: "notes", label: "Notes", width: 220, editable: true },
];

const RECIPE_COLUMNS: SpreadsheetColumn[] = [
  { key: "row_num", label: "", width: 44, frozen: true, editable: false },
  { key: "menu_name", label: "メニュー名", width: 160, editable: true },
  { key: "ingredient", label: "食材名", width: 180, editable: true, type: "autocomplete" },
  { key: "quantity", label: "使用量", width: 80, editable: true, type: "number", align: "right" },
  { key: "unit", label: "単位", width: 60, editable: false },
  { key: "unit_price", label: "単価", width: 90, editable: false, type: "number", align: "right" },
  { key: "cost", label: "商品原価", width: 90, type: "formula", align: "right", formulaColor: "text-blue-300" },
  { key: "cost_115", label: "原価×115%", width: 90, type: "formula", align: "right", formulaColor: "text-blue-300" },
  { key: "selling_price", label: "売値", width: 90, editable: true, type: "number", align: "right" },
  { key: "total_cost", label: "合計原価", width: 90, type: "subtotal", align: "right", formulaColor: "text-emerald-300" },
  { key: "cost_ratio", label: "合計原価率", width: 90, type: "subtotal", align: "right" },
];

const RECIPE_TAB_CATEGORY_MAP: Record<Exclude<SheetKey, "食材マスタ">, string> = {
  base_roll: "Base Roll",
  signature_roll: "Signature Roll",
  fusion_roll: "Fusion Roll",
  sushi_box: "Sushi Box",
  握り刺身: "握り・刺身",
  hot_menu: "Hot Menu",
  original_sauce: "Original Sauce",
};

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

function sheetName(key: SheetKey) {
  return SHEETS.find((sheet) => sheet.key === key)?.name || key;
}

function normalizeNumber(value: string | number) {
  const text = String(value ?? "").replace(/,/g, "").trim();
  if (!text) return 0;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCellNumber(value: unknown, decimals = 2) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num.toFixed(decimals) : "";
}

function formulaText(columnKey: string) {
  if (columnKey === "cost") return "数量 × 単価";
  if (columnKey === "cost_115") return "商品原価 × 1.15";
  if (columnKey === "total_cost") return "同一メニューの 商品原価 合計";
  if (columnKey === "cost_ratio") return "合計原価 ÷ 売値";
  return "";
}

function highlightMatch(text: string, query: string) {
  if (!query) return <span>{text}</span>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <span>{text}</span>;
  return (
    <>
      <span>{text.slice(0, idx)}</span>
      <span className="font-semibold text-violet-300">{text.slice(idx, idx + query.length)}</span>
      <span>{text.slice(idx + query.length)}</span>
    </>
  );
}

function SheetTab({
  name,
  active,
  onClick,
}: {
  name: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "whitespace-nowrap rounded-t border-x border-t px-4 py-1.5 text-xs font-medium transition-all duration-150",
        active
          ? "z-10 -mb-px border-violet-500/40 bg-[#0f0f1a] text-violet-300 shadow-lg"
          : "border-white/10 bg-white/3 text-zinc-500 hover:bg-white/6 hover:text-zinc-300",
      )}
    >
      {name}
    </button>
  );
}

function recipeGroupStats(rows: RecipeRow[]) {
  const totals = new Map<string, { totalCost: number; costRatio: number; start: number; end: number }>();
  rows.forEach((row, index) => {
    const key = row.menu_name || `row-${index}`;
    const prev = totals.get(key) || { totalCost: 0, costRatio: 0, start: index, end: index };
    prev.totalCost += row.quantity * row.unit_price;
    prev.end = index;
    if (index < prev.start) prev.start = index;
    const sellingPrice = Number(row.selling_price || 0);
    prev.costRatio = sellingPrice > 0 ? prev.totalCost / sellingPrice : 0;
    totals.set(key, prev);
  });
  return totals;
}

export default function CostCalculationPage() {
  const auth = useMemo(() => getAuth(), []);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);

  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState<"dubai" | "manila">(String(auth?.city || "dubai").toLowerCase() === "manila" ? "manila" : "dubai");
  const [activeSheet, setActiveSheet] = useState<SheetKey>("食材マスタ");
  const [searchText, setSearchText] = useState("");
  const [ingredientCategoryFilter, setIngredientCategoryFilter] = useState("all");
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [recipes, setRecipes] = useState<Record<string, RecipeRow[]>>({});
  const [loadedRecipeSheets, setLoadedRecipeSheets] = useState<Record<string, boolean>>({});
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [editingCell, setEditingCell] = useState<SelectedCell | null>(null);
  const [editValue, setEditValue] = useState("");
  const [dirtyRows, setDirtyRows] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [allIngredientOptions, setAllIngredientOptions] = useState<IngredientRow[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIngredientId, setHighlightedIngredientId] = useState<string | null>(null);
  const [historyIngredient, setHistoryIngredient] = useState<IngredientRow | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [recipeMenuItems, setRecipeMenuItems] = useState<MenuItemRow[]>([]);
  const [recipeLoading, setRecipeLoading] = useState(false);
  const [showAddItemForm, setShowAddItemForm] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [editingMenuItemId, setEditingMenuItemId] = useState<string | null>(null);
  const [editingMenuPrice, setEditingMenuPrice] = useState("");

  useEffect(() => {
    async function init() {
      const refreshed = await refreshAuthFromApi(auth);
      setAllowed(canAccessCostAdmin(refreshed || auth));
    }
    void init();
  }, [auth]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const loadIngredients = useCallback(async () => {
    setLoading(true);
    try {
      const res = await costJson<{ items?: IngredientRow[]; ingredients?: IngredientRow[] }>(
        `/api/cost/ingredients?city=${encodeURIComponent(city)}&limit=500`,
      );
      const source = Array.isArray(res?.items) ? res.items : Array.isArray(res?.ingredients) ? res.ingredients : [];
      const next = source.map((row) => ({
        ...row,
        notes: String((row as any).notes || ""),
        unit_price: Number(row.unit_price || 0),
        yield_rate: Number((row as any).yield_rate || 0),
      }));
      setIngredients(next);
      setAllIngredientOptions(next);
    } catch (e) {
      console.error("Failed to load ingredients:", e);
      setIngredients([]);
      setAllIngredientOptions([]);
    } finally {
      setLoading(false);
    }
  }, [city]);

  const loadRecipeSheet = useCallback(async (sheet: SheetKey) => {
    if (sheet === "食材マスタ") return;
    const category = RECIPE_TAB_CATEGORY_MAP[sheet as Exclude<SheetKey, "食材マスタ">];
    if (!category) return;
    setRecipeLoading(true);
    try {
      const res = await costJson<{ items: MenuItemRow[] }>(
        `/api/cost/menu-items?city=${encodeURIComponent(city)}&category=${encodeURIComponent(category)}`,
      );
      const items = Array.isArray(res?.items)
        ? res.items.map((item) => ({
            ...item,
            selling_price: Number(item.selling_price || 0),
            total_cost: Number(item.total_cost || 0),
            cost_ratio: item.cost_ratio == null ? null : Number(item.cost_ratio),
          }))
        : [];
      setRecipeMenuItems(items);
      setLoadedRecipeSheets((prev) => ({ ...prev, [sheet]: true }));
    } catch (e: any) {
      setError(e?.message || String(e));
      setRecipeMenuItems([]);
    } finally {
      setRecipeLoading(false);
    }
  }, [city]);

  useEffect(() => {
    if (!allowed) return;
    void loadIngredients();
  }, [activeSheet, allowed, city, loadIngredients]);

  useEffect(() => {
    if (!allowed) return;
    setLoadedRecipeSheets({});
    setRecipes({});
    setDirtyRows(new Set());
    setSelectedCell(null);
    setEditingCell(null);
  }, [allowed, city]);

  useEffect(() => {
    if (!allowed) return;
    if (activeSheet !== "食材マスタ" && !loadedRecipeSheets[activeSheet]) {
      void loadRecipeSheet(activeSheet);
    }
    setDirtyRows(new Set());
    setSelectedCell(null);
    setEditingCell(null);
  }, [activeSheet, allowed, loadedRecipeSheets, loadRecipeSheet]);

  const filteredIngredientRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return ingredients.filter((row) => {
      if (ingredientCategoryFilter !== "all" && row.category !== ingredientCategoryFilter) return false;
      if (!q) return true;
      return [row.category, row.name, row.unit, row.notes].some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [ingredientCategoryFilter, ingredients, searchText]);

  const ingredientCategories = useMemo(() => {
    const cats = [...new Set(ingredients.map((item) => item.category).filter(Boolean))];
    return cats.sort((a, b) => a.localeCompare(b, "ja"));
  }, [ingredients]);

  const suggestions = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (q.length < 2) return [];
    return ingredients
      .filter((item) => item.name?.toLowerCase().includes(q))
      .slice(0, 8)
      .map((item) => ({
        id: String(item.id),
        name: item.name,
        category: item.category,
        unit_price: item.unit_price,
      }));
  }, [ingredients, searchText]);

  const filteredRecipeRows = useMemo(() => {
    const rows = recipes[activeSheet] || [];
    const q = searchText.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.menu_name, row.ingredient, row.unit].some((value) => String(value || "").toLowerCase().includes(q)),
    );
  }, [activeSheet, recipes, searchText]);

  const visibleRecipeMenuItems = useMemo(() => {
    if (activeSheet === "食材マスタ") return [];
    const q = searchText.trim().toLowerCase();
    if (!q) return recipeMenuItems;
    return recipeMenuItems.filter((item) =>
      [item.name, item.category].some((value) => String(value || "").toLowerCase().includes(q)),
    );
  }, [activeSheet, recipeMenuItems, searchText]);

  const currentColumns = activeSheet === "食材マスタ" ? INGREDIENT_COLUMNS : RECIPE_COLUMNS;
  const currentRows = activeSheet === "食材マスタ" ? filteredIngredientRows : filteredRecipeRows;
  const recipeStats = useMemo(() => recipeGroupStats(filteredRecipeRows), [filteredRecipeRows]);

  const dirtyCount = useMemo(() => {
    if (activeSheet === "食材マスタ") return ingredients.filter((row) => row._dirty || row._new).length;
    return (recipes[activeSheet] || []).filter((row) => row._dirty || row._new).length;
  }, [activeSheet, ingredients, recipes]);

  const getCellValue = useCallback((rowIndex: number, colKey: string) => {
    const row = currentRows[rowIndex] as any;
    if (!row) return "";
    if (colKey === "row_num") return rowIndex + 1;
    if (activeSheet === "食材マスタ") {
      return row[colKey] ?? "";
    }
    const recipeRow = row as RecipeRow;
    const group = recipeStats.get(recipeRow.menu_name || `row-${rowIndex}`);
    if (colKey === "cost") return recipeRow.quantity * recipeRow.unit_price;
    if (colKey === "cost_115") return recipeRow.quantity * recipeRow.unit_price * 1.15;
    if (colKey === "total_cost") return group && group.end === rowIndex ? group.totalCost : "";
    if (colKey === "cost_ratio") return group && group.end === rowIndex ? group.costRatio : "";
    if (colKey === "menu_name") {
      const previous = filteredRecipeRows[rowIndex - 1];
      return previous?.menu_name === recipeRow.menu_name ? "" : recipeRow.menu_name;
    }
    return (recipeRow as any)[colKey] ?? "";
  }, [activeSheet, currentRows, filteredRecipeRows, recipeStats]);

  const currentCellMeta = useMemo(() => {
    if (!selectedCell) return null;
    const columnIndex = currentColumns.findIndex((column) => column.key === selectedCell.col);
    const value = getCellValue(selectedCell.row, selectedCell.col);
    const column = currentColumns[columnIndex];
    return {
      value,
      column,
      address:
        selectedCell.col === "row_num"
          ? ""
          : `${columnLetter(Math.max(0, columnIndex - 1))}${selectedCell.row + 2}`,
    };
  }, [currentColumns, getCellValue, selectedCell]);

  const visibleIngredientSuggestions = useMemo(() => {
    if (!editingCell || activeSheet === "食材マスタ" || editingCell.col !== "ingredient") return [];
    const q = editValue.trim().toLowerCase();
    if (!q) return allIngredientOptions.slice(0, 8);
    return allIngredientOptions
      .filter((item) => [item.name, item.category, item.notes].some((value) => String(value || "").toLowerCase().includes(q)))
      .slice(0, 8);
  }, [activeSheet, allIngredientOptions, editValue, editingCell]);

  const openHistory = useCallback(async (ingredient: IngredientRow) => {
    setHistoryIngredient(ingredient);
    setHistoryLoading(true);
    try {
      const res = await costJson<{ history?: PriceHistoryEntry[]; items?: PriceHistoryEntry[] }>(
        `/api/cost/ingredients/${ingredient.id}/history`,
      );
      setPriceHistory(Array.isArray(res?.history) ? res.history : Array.isArray(res?.items) ? res.items : []);
    } catch {
      setPriceHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const refreshActiveRecipeTab = useCallback(async () => {
    if (activeSheet === "食材マスタ") return;
    await loadRecipeSheet(activeSheet);
  }, [activeSheet, loadRecipeSheet]);

  const saveRecipeMenuItemPrice = useCallback(async (id: string, value: string) => {
    const nextValue = normalizeNumber(value);
    try {
      await costJson(`/api/cost/menu-items/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ selling_price: nextValue }),
      });
      await refreshActiveRecipeTab();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setEditingMenuItemId(null);
      setEditingMenuPrice("");
    }
  }, [refreshActiveRecipeTab]);

  const createRecipeMenuItem = useCallback(async () => {
    if (activeSheet === "食材マスタ") return;
    const name = newItemName.trim();
    if (!name) return;
    try {
      await costJson("/api/cost/menu-items", {
        method: "POST",
        body: JSON.stringify({
          city,
          name,
          category: RECIPE_TAB_CATEGORY_MAP[activeSheet as Exclude<SheetKey, "食材マスタ">],
          selling_price: normalizeNumber(newItemPrice),
        }),
      });
      setShowAddItemForm(false);
      setNewItemName("");
      setNewItemPrice("");
      await refreshActiveRecipeTab();
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }, [activeSheet, city, newItemName, newItemPrice, refreshActiveRecipeTab]);

  useEffect(() => {
    if (activeSheet !== "食材マスタ" || !highlightedIngredientId) return;
    const rowIndex = filteredIngredientRows.findIndex((row) => String(row.id) === highlightedIngredientId);
    if (rowIndex === -1) return;
    setSelectedCell({ row: rowIndex, col: "name" });
    requestAnimationFrame(() => {
      const node = document.querySelector(`[data-ingredient-id="${highlightedIngredientId}"]`);
      if (node instanceof HTMLElement) {
        node.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    });
  }, [activeSheet, filteredIngredientRows, highlightedIngredientId]);

  const setDirtyRowIndex = (rowIndex: number) => {
    setDirtyRows((prev) => new Set([...prev, rowIndex]));
  };

  const selectCell = (rowIndex: number, colKey: string) => {
    setSelectedCell({ row: rowIndex, col: colKey });
    if (gridRef.current) gridRef.current.focus();
  };

  const startEdit = (rowIndex: number, colKey: string, seed?: string) => {
    const column = currentColumns.find((item) => item.key === colKey);
    if (!column?.editable) return;
    setEditingCell({ row: rowIndex, col: colKey });
    setEditValue(seed ?? String(getCellValue(rowIndex, colKey) ?? ""));
    setSelectedCell({ row: rowIndex, col: colKey });
  };

  const applyIngredientCell = (targetName: string) => {
    if (!editingCell || activeSheet === "食材マスタ") return;
    const target = allIngredientOptions.find((item) => item.name === targetName)
      || allIngredientOptions.find((item) => item.name.toLowerCase() === targetName.toLowerCase());
    const row = filteredRecipeRows[editingCell.row];
    if (!row) return;
    setRecipes((prev) => ({
      ...prev,
      [activeSheet]: (prev[activeSheet] || []).map((item) => {
        if (item.id !== row.id) return item;
        return {
          ...item,
          ingredient: target?.name || targetName,
          ingredient_id: target?.id || "",
          unit: target?.unit || item.unit,
          unit_price: target ? Number(target.unit_price || 0) : item.unit_price,
          _dirty: true,
        };
      }),
    }));
    setDirtyRowIndex(editingCell.row);
    setEditingCell(null);
    setEditValue("");
  };

  const commitEdit = async (nextRawValue: string, direction?: "enter" | "tab") => {
    if (!editingCell) return;
    const { row, col } = editingCell;
    const visibleRow = currentRows[row] as any;
    if (!visibleRow) {
      setEditingCell(null);
      return;
    }

    if (activeSheet === "食材マスタ") {
      const rowId = String(visibleRow.id);
      const nextYieldRate = col === "yield_rate" ? Math.max(0.01, Math.min(1, normalizeNumber(nextRawValue) / 100)) : undefined;
      setIngredients((prev) =>
        prev.map((item) => {
          if (String(item.id) !== rowId) return item;
          const next: IngredientRow = { ...item, _dirty: true };
          if (col === "unit_price") next.unit_price = normalizeNumber(nextRawValue);
          else if (col === "yield_rate") next.yield_rate = nextYieldRate || item.yield_rate;
          else (next as any)[col] = nextRawValue;
          return next;
        }),
      );
      if (col === "yield_rate" && !rowId.startsWith("new-")) {
        try {
          await costJson(`/api/cost/ingredients/${rowId}`, {
            method: "PATCH",
            body: JSON.stringify({ yield_rate: nextYieldRate }),
          });
        } catch (e: any) {
          setError(e?.message || String(e));
          await loadIngredients();
        }
      }
    } else {
      if (col === "ingredient") {
        applyIngredientCell(nextRawValue);
      } else {
        const rowId = String(visibleRow.id);
        setRecipes((prev) => ({
          ...prev,
          [activeSheet]: (prev[activeSheet] || []).map((item) => {
            if (String(item.id) !== rowId) return item;
            const next: RecipeRow = { ...item, _dirty: true };
            if (col === "quantity" || col === "selling_price") {
              (next as any)[col] = normalizeNumber(nextRawValue);
            } else {
              (next as any)[col] = nextRawValue;
            }
            return next;
          }),
        }));
      }
    }

    setDirtyRowIndex(row);
    setEditingCell(null);
    setEditValue("");

    if (direction && selectedCell) {
      const editableColumns = currentColumns.filter((column) => column.editable).map((column) => column.key);
      const currentIndex = editableColumns.indexOf(selectedCell.col);
      if (direction === "enter") {
        const nextRow = Math.min(row + 1, Math.max(0, currentRows.length - 1));
        const targetCol = selectedCell.col;
        setSelectedCell({ row: nextRow, col: targetCol });
      }
      if (direction === "tab") {
        const nextColumn = editableColumns[(currentIndex + 1) % editableColumns.length];
        const wraps = currentIndex === editableColumns.length - 1;
        setSelectedCell({
          row: wraps ? Math.min(row + 1, Math.max(0, currentRows.length - 1)) : row,
          col: nextColumn,
        });
      }
    }
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue("");
  };

  const updateSelectedCellValue = (value: string) => {
    if (!selectedCell) return;
    startEdit(selectedCell.row, selectedCell.col);
    setEditValue(value);
  };

  const addRow = () => {
    if (activeSheet === "食材マスタ") {
      setIngredients((prev) => [
        ...prev,
        {
          id: `new-ingredient-${Date.now()}`,
          category: ingredientCategoryFilter !== "all" ? ingredientCategoryFilter : "野菜",
          name: "",
          unit: "",
          unit_price: 0,
          yield_rate: 1.15,
          notes: "",
          city,
          _new: true,
          _dirty: true,
        },
      ]);
      const nextIndex = currentRows.length;
      setDirtyRowIndex(nextIndex);
      setSelectedCell({ row: nextIndex, col: "category" });
    } else {
      setRecipes((prev) => ({
        ...prev,
        [activeSheet]: [
          ...(prev[activeSheet] || []),
          {
            id: `new-recipe-${Date.now()}`,
            city,
            sheet_key: activeSheet,
            menu_name: "",
            ingredient_id: "",
            ingredient: "",
            quantity: 0,
            unit: "",
            unit_price: 0,
            selling_price: 0,
            yield_rate: 1.15,
            _new: true,
            _dirty: true,
          },
        ],
      }));
      const nextIndex = currentRows.length;
      setDirtyRowIndex(nextIndex);
      setSelectedCell({ row: nextIndex, col: "menu_name" });
    }
  };

  const saveActiveSheet = async () => {
    setBusy(true);
    setError("");
    setImportMessage("");
    try {
      if (activeSheet === "食材マスタ") {
        const dirty = ingredients.filter((row) => row._dirty || row._new);
        for (const row of dirty) {
          const payload = {
            category: row.category,
            name: row.name,
            unit: row.unit,
            unit_price: Number(row.unit_price || 0),
            yield_rate: Number(row.yield_rate || 0),
            notes: row.notes,
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
        await loadIngredients();
      } else {
        const dirty = (recipes[activeSheet] || []).filter((row) => row._dirty || row._new);
        for (const row of dirty) {
          const payload = {
            city,
            sheet: activeSheet,
            menu_name: row.menu_name,
            ingredient_id: Number(row.ingredient_id || 0),
            quantity: Number(row.quantity || 0),
            selling_price: Number(row.selling_price || 0),
          };
          if (row._new) {
            await costJson("/api/cost/recipes", {
              method: "POST",
              body: JSON.stringify(payload),
            });
          } else {
            await costJson(`/api/cost/recipes/${row.id}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            });
          }
        }
        await loadRecipeSheet(activeSheet);
        await loadIngredients();
      }
      setDirtyRows(new Set());
      setImportMessage(`${sheetName(activeSheet)} を保存しました。`);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async (file: File) => {
    setBusy(true);
    setError("");
    setImportMessage("");
    try {
      const formData = new FormData();
      formData.set("city", city);
      formData.set("file", file);
      const res = await costUpload<{
        imported_ingredients: number;
        imported_menu_items: number;
        imported_recipe_rows: number;
      }>("/api/admin/cost/import-excel", formData);
      setImportMessage(
        `Imported ${res.imported_ingredients} ingredients / ${res.imported_menu_items} menu items / ${res.imported_recipe_rows} recipe rows`,
      );
      await loadIngredients();
      setLoadedRecipeSheets({});
      setRecipes({});
      if (activeSheet !== "食材マスタ") await loadRecipeSheet(activeSheet);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleImportExcel = () => {
    fileInputRef.current?.click();
  };

  const moveSelection = useCallback((nextRow: number, nextCol: string) => {
    const clampedRow = Math.max(0, Math.min(nextRow, Math.max(0, currentRows.length - 1)));
    setSelectedCell({ row: clampedRow, col: nextCol });
  }, [currentRows.length]);

  const handleGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (editingCell) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void saveActiveSheet();
      return;
    }
    if (!selectedCell) return;
    const columnKeys = currentColumns.map((column) => column.key);
    const editableKeys = currentColumns.filter((column) => column.editable).map((column) => column.key);
    const colIndex = columnKeys.indexOf(selectedCell.col);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection(selectedCell.row + 1, selectedCell.col);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(selectedCell.row - 1, selectedCell.col);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveSelection(selectedCell.row, columnKeys[Math.max(0, colIndex - 1)]);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveSelection(selectedCell.row, columnKeys[Math.min(columnKeys.length - 1, colIndex + 1)]);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      moveSelection(selectedCell.row + 1, selectedCell.col);
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      const next = (colIndex + 1) % columnKeys.length;
      const wraps = next === 0;
      moveSelection(selectedCell.row + (wraps ? 1 : 0), columnKeys[next]);
      return;
    }
    if (event.key === "F2") {
      event.preventDefault();
      startEdit(selectedCell.row, selectedCell.col);
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      if (editableKeys.includes(selectedCell.col)) updateSelectedCellValue("");
      return;
    }
    if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.length === 1) {
      event.preventDefault();
      startEdit(selectedCell.row, selectedCell.col, event.key);
    }
  };

  if (!allowed) {
    return <div className="text-sm text-red-300">Cost calculation is available only to authorized admin roles.</div>;
  }

  return (
    <div className="h-[calc(100vh-3.5rem)] bg-[#0a0b14]">
      <div className="flex h-full flex-col bg-[#0a0b14]">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-white/10 bg-white/3 px-4">
          <div className="flex items-center gap-2 text-xs">
            <div ref={searchRef} className="relative">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                <input
                  value={searchText}
                  onChange={(e) => {
                    setSearchText(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setSearchText("");
                      setShowSuggestions(false);
                    }
                  }}
                  placeholder={activeSheet === "食材マスタ" ? "食材を検索..." : "メニュー / 食材を検索..."}
                  className="w-48 rounded border border-white/15 bg-white/5 py-1 pl-7 pr-7 text-xs text-white outline-none placeholder:text-zinc-500 focus:border-violet-500/50"
                />
                {searchText ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchText("");
                      setShowSuggestions(false);
                      setHighlightedIngredientId(null);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
              {showSuggestions && activeSheet === "食材マスタ" && suggestions.length > 0 ? (
                <div className="absolute left-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-lg border border-violet-500/20 bg-[#1a1a2e] shadow-2xl shadow-black/50">
                  <div className="border-b border-white/5 px-3 py-1.5 text-[10px] text-zinc-500">
                    {suggestions.length}件の候補
                  </div>
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      className="group flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-violet-500/10"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        setActiveSheet("食材マスタ");
                        setSearchText(suggestion.name);
                        setShowSuggestions(false);
                        setHighlightedIngredientId(suggestion.id);
                      }}
                    >
                      <div className="flex flex-col">
                        <span className="text-xs text-white group-hover:text-violet-200">
                          {highlightMatch(suggestion.name, searchText)}
                        </span>
                        <span className="text-[10px] text-zinc-500">{suggestion.category}</span>
                      </div>
                      <span className="text-xs font-mono text-violet-300">
                        {city === "dubai" ? "AED" : "PHP"} {Number(suggestion.unit_price).toFixed(4)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {activeSheet === "食材マスタ" ? (
              <select
                value={ingredientCategoryFilter}
                onChange={(e) => setIngredientCategoryFilter(e.target.value)}
                className="cursor-pointer rounded border border-white/15 bg-white/5 px-2 py-1 text-xs text-zinc-300 outline-none focus:border-violet-500/50"
              >
                <option value="all">全カテゴリ ({ingredients.length})</option>
                {ingredientCategories.map((option) => (
                  <option key={option} value={option}>
                    {option} ({ingredients.filter((item) => item.category === option).length})
                  </option>
                ))}
              </select>
            ) : null}
            <button
              className="inline-flex items-center gap-1 rounded border border-violet-500/30 bg-violet-500/20 px-3 py-1 text-violet-300 hover:bg-violet-500/30"
              onClick={addRow}
              type="button"
            >
              <Plus className="h-3.5 w-3.5" />
              行を追加
            </button>
            <button
              className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/20 px-3 py-1 text-emerald-300 hover:bg-emerald-500/30"
              onClick={() => void saveActiveSheet()}
              type="button"
              disabled={busy}
            >
              <Save className="h-3.5 w-3.5" />
              保存 ({dirtyCount})
            </button>
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs text-zinc-400">
            <Calculator className="h-3.5 w-3.5 text-violet-400" />
            <span>{city === "dubai" ? "Dubai / AED" : "Manila / PHP"}</span>
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
            {currentCellMeta?.address || ""}
          </div>
          <div className="h-4 w-px bg-white/15" />
          <div className="flex-1 rounded border border-white/10 bg-white/3 px-2 py-0.5 text-zinc-300">
            {currentCellMeta?.column?.type === "formula" || currentCellMeta?.column?.type === "subtotal"
              ? `= ${formulaText(currentCellMeta.column.key)}`
              : String(currentCellMeta?.value ?? "")}
          </div>
        </div>

        {error ? <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-200">{error}</div> : null}
        {importMessage ? <div className="border-b border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-200">{importMessage}</div> : null}

        <div
          ref={gridRef}
          tabIndex={0}
          onKeyDown={handleGridKeyDown}
          className="flex-1 overflow-auto outline-none"
        >
          {activeSheet === "食材マスタ" && loading ? (
            <div className="flex h-48 items-center justify-center gap-2 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
              データを読み込み中...
            </div>
          ) : activeSheet === "食材マスタ" && filteredIngredientRows.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-3 text-sm text-zinc-500">
              <Database className="h-8 w-8 text-zinc-700" />
              <p>食材データがありません</p>
              <button
                onClick={handleImportExcel}
                className="rounded border border-violet-500/30 bg-violet-500/20 px-3 py-1.5 text-xs text-violet-300 hover:bg-violet-500/30"
                type="button"
              >
                Excelから取込
              </button>
            </div>
          ) : activeSheet !== "食材マスタ" ? (
            <div className="flex h-full flex-col p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-medium text-zinc-300">{sheetName(activeSheet)}</div>
                <button
                  type="button"
                  onClick={() => setShowAddItemForm((prev) => !prev)}
                  className="inline-flex items-center gap-1 rounded border border-violet-500/30 bg-violet-500/20 px-3 py-1 text-xs text-violet-300 hover:bg-violet-500/30"
                >
                  <Plus className="h-3.5 w-3.5" />
                  + Add Item
                </button>
              </div>

              {showAddItemForm ? (
                <div className="mb-3 flex items-end gap-2 rounded border border-white/10 bg-white/5 p-3">
                  <div className="flex-1">
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Item Name</div>
                    <input
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      className="w-full rounded border border-white/15 bg-white/5 px-2 py-1.5 text-sm text-white outline-none focus:border-violet-500/50"
                    />
                  </div>
                  <div className="w-40">
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Selling Price (AED)</div>
                    <input
                      type="number"
                      value={newItemPrice}
                      onChange={(e) => setNewItemPrice(e.target.value)}
                      className="w-full rounded border border-white/15 bg-white/5 px-2 py-1.5 text-sm text-white outline-none focus:border-violet-500/50"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void createRecipeMenuItem()}
                    className="rounded border border-emerald-500/30 bg-emerald-500/20 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/30"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddItemForm(false);
                      setNewItemName("");
                      setNewItemPrice("");
                    }}
                    className="rounded border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-zinc-400 hover:bg-white/8"
                  >
                    Cancel
                  </button>
                </div>
              ) : null}

              {recipeLoading ? (
                <div className="flex h-40 items-center justify-center gap-2 text-sm text-zinc-500">
                  <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
                  メニューを読み込み中...
                </div>
              ) : (
                <div className="overflow-auto rounded border border-white/10">
                  <table className="min-w-full border-separate border-spacing-0 text-xs">
                    <thead>
                      <tr className="bg-[#1a1a2e]">
                        <th className="border-b border-r border-white/5 px-3 py-2 text-left font-medium text-zinc-400">Item Name</th>
                        <th className="border-b border-r border-white/5 px-3 py-2 text-right font-medium text-zinc-400">Selling Price (AED)</th>
                        <th className="border-b border-r border-white/5 px-3 py-2 text-right font-medium text-zinc-400">Total Cost (AED)</th>
                        <th className="border-b border-white/5 px-3 py-2 text-center font-medium text-zinc-400">Cost Ratio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRecipeMenuItems.map((item, index) => (
                        <tr
                          key={item.id}
                          className={cx(index % 2 === 0 ? "bg-white/[0.02]" : "bg-transparent", "hover:bg-violet-500/5")}
                        >
                          <td className="border-r border-white/5 px-3 py-2 text-white">{item.name}</td>
                          <td className="border-r border-white/5 px-3 py-2 text-right">
                            {editingMenuItemId === item.id ? (
                              <input
                                autoFocus
                                type="number"
                                value={editingMenuPrice}
                                onChange={(e) => setEditingMenuPrice(e.target.value)}
                                onBlur={() => void saveRecipeMenuItemPrice(item.id, editingMenuPrice)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    void saveRecipeMenuItemPrice(item.id, editingMenuPrice);
                                  }
                                  if (e.key === "Escape") {
                                    setEditingMenuItemId(null);
                                    setEditingMenuPrice("");
                                  }
                                }}
                                className="w-28 rounded border border-violet-500/40 bg-violet-500/10 px-2 py-1 text-right text-xs text-white outline-none"
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingMenuItemId(item.id);
                                  setEditingMenuPrice(String(item.selling_price || 0));
                                }}
                                className="font-mono text-white hover:text-violet-300"
                              >
                                {Number(item.selling_price || 0).toFixed(2)}
                              </button>
                            )}
                          </td>
                          <td className="border-r border-white/5 px-3 py-2 text-right font-mono text-zinc-300">
                            AED {Number(item.total_cost || 0).toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {item.selling_price ? (
                              <span
                                className={cx(
                                  "font-bold",
                                  Number(item.cost_ratio || 0) < 0.3
                                    ? "text-green-600"
                                    : Number(item.cost_ratio || 0) <= 0.4
                                      ? "text-amber-500"
                                      : "text-red-600",
                                )}
                              >
                                {(Number(item.cost_ratio || 0) * 100).toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-zinc-500">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {visibleRecipeMenuItems.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-8 text-center text-zinc-500">
                            No items found.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
          <table className="min-w-max border-separate border-spacing-0">
            <colgroup>
              {currentColumns.map((column) => (
                <col key={column.key} style={{ width: column.width }} />
              ))}
              {activeSheet === "食材マスタ" ? <col style={{ width: 36 }} /> : null}
            </colgroup>
            <thead>
              <tr>
                {currentColumns.map((column, index) => (
                  <th
                    key={`${column.key}-letter`}
                    style={{
                      width: column.width,
                      left: column.key === "row_num" ? 0 : undefined,
                    }}
                    className={cx(
                      "sticky z-30 h-5 border-b border-r border-white/5 bg-[#13131f] px-2 text-[10px] font-medium text-zinc-600",
                      column.key === "row_num" && "left-0 z-40 bg-[#13131f]",
                    )}
                  >
                    {column.key === "row_num" ? "" : columnLetter(index - 1)}
                  </th>
                ))}
                {activeSheet === "食材マスタ" ? (
                  <th className="sticky right-0 z-30 h-5 border-b border-l border-white/5 bg-[#13131f]" />
                ) : null}
              </tr>
              <tr>
                {currentColumns.map((column) => (
                  <th
                    key={column.key}
                    style={{
                      width: column.width,
                      left: column.key === "row_num" ? 0 : undefined,
                      top: 20,
                    }}
                    className={cx(
                      "sticky z-20 h-8 border-b border-r border-white/5 bg-[#1a1a2e] px-2 text-left text-[11px] font-medium text-zinc-400",
                      column.key === "row_num" && "left-0 z-30 bg-[#1a1a2e] text-right",
                    )}
                  >
                    {column.label}
                  </th>
                ))}
                {activeSheet === "食材マスタ" ? (
                  <th className="sticky right-0 z-20 h-8 border-b border-l border-white/5 bg-[#1a1a2e] px-2 text-left text-[11px] font-medium text-zinc-400">
                    Actions
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {currentRows.map((row: any, rowIndex) => {
                const ingredientRow = row as IngredientRow;
                const recipeRow = row as RecipeRow;
                const ingredientGroupStart =
                  activeSheet === "食材マスタ"
                    && rowIndex > 0
                    && filteredIngredientRows[rowIndex - 1]?.category !== ingredientRow.category;
                const recipeGroup = activeSheet === "食材マスタ" ? null : recipeStats.get(recipeRow.menu_name || `row-${rowIndex}`);
                const recipeGroupStart =
                  activeSheet !== "食材マスタ"
                    && rowIndex > 0
                    && filteredRecipeRows[rowIndex - 1]?.menu_name !== recipeRow.menu_name;
                const recipeGroupEnd =
                  activeSheet !== "食材マスタ"
                    && recipeGroup?.end === rowIndex;

                return (
                  <tr
                    key={`${row.id}-${rowIndex}`}
                    data-ingredient-id={activeSheet === "食材マスタ" ? String(ingredientRow.id) : undefined}
                    className={cx(
                      "group",
                      rowIndex % 2 === 0 ? "bg-white/[0.02]" : "bg-transparent",
                      "hover:bg-violet-500/5",
                      activeSheet === "食材マスタ" && highlightedIngredientId === String(ingredientRow.id) && "bg-violet-500/10",
                      ingredientGroupStart && "border-t-2 border-violet-500/20",
                      recipeGroupStart && "border-t-2 border-violet-500/15 bg-white/3",
                    )}
                  >
                    {currentColumns.map((column) => {
                      const isSelected = selectedCell?.row === rowIndex && selectedCell?.col === column.key;
                      const isEditing = editingCell?.row === rowIndex && editingCell?.col === column.key;
                      const value = getCellValue(rowIndex, column.key);
                      const isFormula = column.type === "formula" || column.type === "subtotal";
                      const dirtyIndicator = dirtyRows.has(rowIndex) && column.key === "row_num";
                      const formulaColor =
                        column.key === "cost_ratio"
                          ? Number(value || 0) > 0.4
                            ? "text-red-300"
                            : Number(value || 0) >= 0.3
                              ? "text-amber-300"
                              : "text-emerald-300"
                          : column.formulaColor;

                      if (isEditing) {
                        return (
                          <td
                            key={column.key}
                            style={{ width: column.width, left: column.key === "row_num" ? 0 : undefined }}
                            className={cx(
                              "relative border-r border-white/5 bg-violet-500/10 p-0",
                              column.key === "row_num" && "sticky left-0 z-10 bg-white/3",
                            )}
                          >
                            <input
                              autoFocus
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => void commitEdit(editValue)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  void commitEdit(editValue, "enter");
                                }
                                if (e.key === "Tab") {
                                  e.preventDefault();
                                  void commitEdit(editValue, "tab");
                                }
                                if (e.key === "Escape") {
                                  e.preventDefault();
                                  cancelEdit();
                                }
                              }}
                              className={cx(
                                "h-full w-full bg-transparent px-2 py-1.5 text-xs text-white outline-none",
                                column.align === "right" && "text-right",
                              )}
                            />
                            {column.key === "ingredient" && visibleIngredientSuggestions.length ? (
                              <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded border border-white/10 bg-[#111521] shadow-xl">
                                {visibleIngredientSuggestions.map((option) => (
                                  <button
                                    key={option.id}
                                    type="button"
                                    className="block w-full border-b border-white/5 px-3 py-2 text-left text-xs text-white hover:bg-white/6 last:border-b-0"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => applyIngredientCell(option.name)}
                                  >
                                    <div>{option.name}</div>
                                    <div className="mt-0.5 text-[10px] text-zinc-500">
                                      {option.category} · {option.unit} · {formatCellNumber(option.unit_price)}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </td>
                        );
                      }

                      return (
                        <td
                          key={column.key}
                          style={{
                            width: column.width,
                            textAlign: column.align || "left",
                            left: column.key === "row_num" ? 0 : undefined,
                          }}
                          className={cx(
                            "cursor-cell select-none overflow-hidden border-r border-white/5 px-2 py-1.5 text-xs whitespace-nowrap text-ellipsis",
                            isSelected && "bg-violet-500/8 outline outline-1 outline-violet-400 outline-offset-[-1px]",
                            column.key === "category" && "font-semibold text-violet-300",
                            column.key === "row_num" && "sticky left-0 z-10 bg-white/3 pr-2 text-right text-zinc-600",
                            isFormula && formulaColor,
                            column.key === "total_cost" && recipeGroupEnd && "font-semibold",
                            column.key === "cost_ratio" && recipeGroupEnd && "font-semibold",
                          )}
                          onClick={() => {
                            if (activeSheet === "食材マスタ" && column.key === "yield_rate") {
                              startEdit(
                                rowIndex,
                                column.key,
                                String(Math.round(Number((ingredientRow as any).yield_rate || 0) * 100)),
                              );
                              return;
                            }
                            selectCell(rowIndex, column.key);
                            if (activeSheet === "食材マスタ" && column.key === "unit_price") {
                              void openHistory(ingredientRow);
                            }
                          }}
                          onDoubleClick={() => startEdit(rowIndex, column.key)}
                        >
                          {column.key === "row_num" ? (
                            <div className="flex items-center justify-end gap-1">
                              {dirtyIndicator ? <span className="h-1.5 w-1.5 rounded-full bg-sky-400" /> : null}
                              <span>{rowIndex + 1}</span>
                            </div>
                          ) : activeSheet === "食材マスタ" && column.key === "yield_rate" ? (
                            `${(Number((ingredientRow as any).yield_rate || 0) * 100).toFixed(0)}%`
                          ) : column.key === "cost_ratio" && value !== "" ? (
                            `${(Number(value || 0) * 100).toFixed(1)}%`
                          ) : column.type === "number" || column.type === "formula" || column.type === "subtotal" ? (
                            value === "" ? "" : formatCellNumber(value)
                          ) : (
                            String(value ?? "")
                          )}
                        </td>
                      );
                    })}
                    {activeSheet === "食材マスタ" ? (
                      <td className="sticky right-0 w-8 border-l border-white/5 bg-inherit opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => void openHistory(ingredientRow)}
                          title="価格履歴を見る"
                          className="flex h-full w-full items-center justify-center text-zinc-500 hover:text-violet-400"
                        >
                          <History className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
          )}
        </div>

        <div className="flex h-9 shrink-0 items-end gap-0 overflow-x-auto border-t border-white/10 bg-white/2 px-2">
          {SHEETS.map((sheet) => (
            <SheetTab
              key={sheet.key}
              name={sheet.name}
              active={sheet.key === activeSheet}
              onClick={() => setActiveSheet(sheet.key)}
            />
          ))}
        </div>

        {historyIngredient ? (
          <div className="fixed inset-0 z-40" onClick={() => setHistoryIngredient(null)}>
            <div
              className="absolute right-0 top-0 flex h-full w-96 flex-col overflow-hidden border-l border-violet-500/20 bg-[#0f0f1e] shadow-2xl"
              onClick={(event) => event.stopPropagation()}
              style={{ animation: "slideInRight 0.2s ease-out" }}
            >
              <div className="flex items-center justify-between border-b border-white/8 bg-[#13103d] p-4">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500">価格履歴</p>
                  <p className="mt-0.5 text-sm font-semibold text-white">{historyIngredient.name}</p>
                  <p className="text-xs text-zinc-400">{historyIngredient.category} · {historyIngredient.unit}</p>
                </div>
                <button onClick={() => setHistoryIngredient(null)} className="text-zinc-500 hover:text-white" type="button">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="border-b border-white/5 p-4">
                <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">現在の単価</p>
                <p className="text-2xl font-bold font-mono text-violet-300">
                  {city === "dubai" ? "AED" : "PHP"} {Number(historyIngredient.unit_price).toFixed(4)}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <p className="mb-3 text-[10px] uppercase tracking-wider text-zinc-500">変更履歴</p>
                {historyLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
                  </div>
                ) : priceHistory.length === 0 ? (
                  <p className="py-8 text-center text-xs text-zinc-600">履歴がありません</p>
                ) : (
                  <div className="space-y-2">
                    {priceHistory.map((entry) => {
                      const hasPrevious = entry.previous_price !== null && entry.previous_price !== undefined;
                      const isIncrease = hasPrevious && entry.unit_price > Number(entry.previous_price);
                      const changePct = hasPrevious && Number(entry.previous_price)
                        ? ((entry.unit_price - Number(entry.previous_price)) / Number(entry.previous_price) * 100).toFixed(1)
                        : null;
                      return (
                        <div key={entry.id} className="rounded-lg border border-white/6 bg-white/3 p-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-sm font-semibold font-mono text-white">
                                {city === "dubai" ? "AED" : "PHP"} {Number(entry.unit_price).toFixed(4)}
                              </p>
                              {hasPrevious ? (
                                <p className="mt-0.5 text-[10px] text-zinc-500">
                                  前回: {city === "dubai" ? "AED" : "PHP"} {Number(entry.previous_price).toFixed(4)}
                                </p>
                              ) : null}
                            </div>
                            {changePct ? (
                              <span className={cx(
                                "rounded-full px-2 py-0.5 text-xs font-semibold",
                                isIncrease ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-400",
                              )}>
                                {isIncrease ? "▲" : "▼"} {Math.abs(Number(changePct))}%
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-2 flex items-center gap-2 text-[10px] text-zinc-500">
                            <Clock className="h-3 w-3" />
                            <span>{entry.changed_at ? new Date(entry.changed_at).toLocaleString("ja-JP") : "-"}</span>
                            {entry.changed_by ? (
                              <>
                                <span>·</span>
                                <User className="h-3 w-3" />
                                <span>{entry.changed_by}</span>
                              </>
                            ) : null}
                          </div>
                          {entry.notes ? (
                            <p className="mt-1.5 rounded bg-white/3 px-2 py-1 text-[10px] text-zinc-400">
                              {entry.notes}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="border-t border-white/8 p-4">
                <p className="mb-2 text-[10px] text-zinc-500">単価を更新</p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.0001"
                    defaultValue={historyIngredient.unit_price}
                    className="flex-1 rounded border border-white/15 bg-white/5 px-2 py-1.5 text-sm font-mono text-white focus:border-violet-500/50 focus:outline-none"
                    id="history-panel-price-input"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const input = document.getElementById("history-panel-price-input") as HTMLInputElement | null;
                      const newPrice = Number(input?.value);
                      if (!historyIngredient || !Number.isFinite(newPrice)) return;
                      await costJson(`/api/cost/ingredients/${historyIngredient.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ unit_price: newPrice, notes: "価格更新" }),
                      });
                      await loadIngredients();
                      const nextIngredient = { ...historyIngredient, unit_price: newPrice };
                      setHistoryIngredient(nextIngredient);
                      void openHistory(nextIngredient);
                    }}
                    className="rounded border border-violet-500/30 bg-violet-500/20 px-3 py-1.5 text-xs text-violet-300 transition-colors hover:bg-violet-500/30"
                  >
                    更新
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <style jsx>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
