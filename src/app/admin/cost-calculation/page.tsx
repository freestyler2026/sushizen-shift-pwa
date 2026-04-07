"use client";

import { AlertTriangle, Calculator, ChevronDown, ChevronRight, Clock, Database, ExternalLink, History, LayoutGrid, Loader2, Percent, Pencil, Plus, RotateCcw, Save, Search, SkipForward, Trash2, User, X } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canAccessCostAdmin, getAuth, refreshAuthFromApi } from "@/lib/auth";
import { costJson } from "@/lib/costClient";

type SheetKey = string;

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
  unit_price_formula?: string;
  unit_price_formula_note?: string;
  buffer_rate: number;
  yield_rate: number | null;
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
  old_price?: number | null;
  unit_price: number;
  old_formula?: string;
  unit_price_formula?: string;
  unit_price_formula_note?: string;
  changed_at: string;
  changed_by: string;
  notes: string;
  previous_price?: number | null;
};

type SupplierPriceEntry = {
  id: string;
  supplier_id: string;
  supplier_name: string;
  purchase_unit: string;
  purchase_qty: number;
  purchase_price: number;
  unit_price: number;
  updated_by: string;
  updated_at: string;
};

type IngredientDetail = IngredientRow & {
  supplier_id?: string;
  supplier_name?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  price_history?: PriceHistoryEntry[];
  supplier_prices?: SupplierPriceEntry[];
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

type MenuPriceHistoryEntry = {
  id: string;
  menu_item_id: string;
  selling_price: number;
  changed_at: string;
  changed_by: string;
  notes: string;
  previous_price?: number | null;
};

type MenuIngredientDetail = {
  id: string;
  ingredient_id: string;
  ingredient_name: string;
  ingredient_category: string;
  quantity: number;
  unit: string;
  unit_price: number;
  raw_cost: number;
  cost: number;
};

type MenuItemDetail = MenuItemRow & {
  description: string;
  ingredient_count: number;
  raw_cost: number;
  ingredients: MenuIngredientDetail[];
  price_history: MenuPriceHistoryEntry[];
};

type RecipeIngredientDraft = {
  key: string;
  ingredient_id: string;
  quantity: string;
};

type SelectedCell = {
  row: number;
  col: string;
};

type SheetMeta = {
  key: SheetKey;
  name: string;
};

type CategoryItem = {
  category: string;
  item_count: number;
};

type UnmatchedInvoiceItemRow = {
  market: string;
  supplier_name: string;
  item_description: string;
  unit: string;
  latest_invoice_date: string;
  latest_unit_price: number;
  invoice_count: number;
  line_count: number;
};

type InvoiceItemMappingRow = {
  id: string;
  market: string;
  supplier_name: string;
  invoice_item_description: string;
  ingredient_id: string;
  ingredient_name_snapshot: string;
  invoice_unit: string;
  ingredient_unit: string;
  conversion_rule: string;
  notes: string;
  is_active: boolean;
};

const INGREDIENT_SHEET = "食材マスタ";
/** 500 matches legacy API `le=500`; we page with `offset` so all rows load after backend supports OFFSET. */
const INGREDIENT_LIST_PAGE_SIZE = 500;

function unmatchedInvoiceItemKey(item: Pick<UnmatchedInvoiceItemRow, "supplier_name" | "item_description">) {
  return `${item.supplier_name}::${item.item_description}`;
}

function skippedUnmatchedStorageKey(city: string) {
  return `cost-invoice-unmatched-skipped:${city}`;
}
const SPREADSHEET_URLS: Record<"dubai" | "manila", string> = {
  dubai: "https://docs.google.com/spreadsheets/d/1NHfPN7bqTjRoqEVPbhJqv_H7ZbwjY9wJVF9D7Ls0n1M/edit",
  manila: "https://docs.google.com/spreadsheets/d/1xD-YKHkOpEqXO8xJqo10M771PWyTgnouBz3leveRfB0/edit",
};

const RECIPE_COLUMNS: SpreadsheetColumn[] = [
  { key: "row_num", label: "", width: 44, frozen: true, editable: false },
  { key: "menu_name", label: "メニュー名", width: 160, editable: true },
  { key: "ingredient", label: "食材名", width: 180, editable: true, type: "autocomplete" },
  { key: "quantity", label: "使用量", width: 80, editable: true, type: "number", align: "right" },
  { key: "unit", label: "単位", width: 60, editable: false },
  { key: "unit_price", label: "単価", width: 90, editable: false, type: "number", align: "right" },
  { key: "cost", label: "商品原価", width: 90, type: "formula", align: "right", formulaColor: "text-blue-300" },
  { key: "selling_price", label: "売値", width: 90, editable: true, type: "number", align: "right" },
  { key: "total_cost", label: "合計原価", width: 90, type: "subtotal", align: "right", formulaColor: "text-emerald-300" },
  { key: "cost_ratio", label: "合計原価率", width: 90, type: "subtotal", align: "right" },
];

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function sheetName(key: SheetKey) {
  return key;
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

function normalizeRateValue(value: unknown) {
  if (value == null || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function formatRatePercent(value: number | null, fallback = "—") {
  return value == null ? fallback : `${(value * 100).toFixed(0)}%`;
}

function hasYieldRate(value: unknown) {
  return normalizeRateValue(value) != null;
}

function createRecipeIngredientDraft(): RecipeIngredientDraft {
  return {
    key: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ingredient_id: "",
    quantity: "",
  };
}

function computeMenuTotals(ingredients: Array<{ quantity: number; unit_price: number }>, sellingPrice: number) {
  const totalCost = ingredients.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0);
  return {
    total_cost: totalCost,
    cost_ratio: sellingPrice > 0 ? totalCost / sellingPrice : null,
  };
}

function attachPreviousMenuPrices(rows: MenuPriceHistoryEntry[]) {
  return rows.map((entry, index) => ({
    ...entry,
    previous_price: index + 1 < rows.length ? rows[index + 1]?.selling_price ?? null : null,
  }));
}

function attachPreviousIngredientPrices(rows: PriceHistoryEntry[]) {
  return rows.map((entry, index) => ({
    ...entry,
    previous_price: entry.previous_price ?? entry.old_price ?? (index + 1 < rows.length ? rows[index + 1]?.unit_price ?? null : null),
  }));
}

function normalizeIngredientNameForMatch(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function mapMenuItemDetail(raw: any): MenuItemDetail {
  const ingredients: MenuIngredientDetail[] = Array.isArray(raw?.ingredients)
    ? raw.ingredients.map((row: any) => ({
        id: String(row.id || ""),
        ingredient_id: String(row.ingredient_id || ""),
        ingredient_name: String(row.ingredient_name || ""),
        ingredient_category: String(row.ingredient_category || ""),
        quantity: Number(row.quantity || 0),
        unit: String(row.unit || ""),
        unit_price: Number(row.unit_price || 0),
        raw_cost: Number(row.raw_cost || 0),
        cost: Number(row.cost || 0),
      }))
    : [];
  const sellingPrice = Number(raw?.selling_price || 0);
  const totals = computeMenuTotals(ingredients, sellingPrice);
  const priceHistory = attachPreviousMenuPrices(
    Array.isArray(raw?.price_history)
      ? raw.price_history.map((entry: any) => ({
          id: String(entry.id || ""),
          menu_item_id: String(entry.menu_item_id || raw?.id || ""),
          selling_price: Number(entry.selling_price || 0),
          changed_at: String(entry.changed_at || ""),
          changed_by: String(entry.changed_by || ""),
          notes: String(entry.notes || ""),
        }))
      : [],
  );
  return {
    id: String(raw?.id || ""),
    name: String(raw?.name || ""),
    category: String(raw?.category || ""),
    city: String(raw?.city || ""),
    description: String(raw?.description || ""),
    selling_price: sellingPrice,
    raw_cost: Number(raw?.raw_cost ?? totals.total_cost),
    total_cost: Number(raw?.total_cost ?? totals.total_cost),
    cost_ratio: sellingPrice > 0 ? Number(raw?.cost_ratio ?? totals.cost_ratio ?? 0) : null,
    ingredient_count: Number(raw?.ingredient_count || ingredients.length),
    ingredients,
    price_history: priceHistory,
  };
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

function bufferBadgeClass(value: number) {
  if (value > 1.15) return "border-amber-500/30 bg-amber-500/12 text-amber-300";
  if (value < 1.15) return "border-sky-500/30 bg-sky-500/12 text-sky-300";
  return "border-white/10 bg-white/5 text-zinc-300";
}

function yieldBadgeClass(value: number | null) {
  if (value == null) return "border-red-500/30 bg-red-500/12 text-red-300";
  if (value >= 0.9) return "border-emerald-500/30 bg-emerald-500/12 text-emerald-300";
  if (value >= 0.75) return "border-amber-500/30 bg-amber-500/12 text-amber-300";
  return "border-red-500/30 bg-red-500/12 text-red-300";
}

function costRatioBadgeClass(value: number | null) {
  if (value == null) return "border-white/10 bg-white/5 text-zinc-400";
  if (value < 0.3) return "border-emerald-500/30 bg-emerald-500/12 text-emerald-300";
  if (value <= 0.4) return "border-amber-500/30 bg-amber-500/12 text-amber-300";
  return "border-red-500/30 bg-red-500/12 text-red-300";
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
        "whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-all duration-150",
        active
          ? "border-white text-white"
          : "border-transparent text-zinc-500 hover:border-white/20 hover:text-zinc-200",
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
  const searchRef = useRef<HTMLDivElement | null>(null);

  const [allowed, setAllowed] = useState(false);
  const [city, setCity] = useState<"dubai" | "manila">(String(auth?.city || "dubai").toLowerCase() === "manila" ? "manila" : "dubai");
  const [activeSheet, setActiveSheet] = useState<SheetKey>(INGREDIENT_SHEET);
  const [searchText, setSearchText] = useState("");
  const [ingredientCategoryFilter, setIngredientCategoryFilter] = useState("all");
  const [menuCategories, setMenuCategories] = useState<CategoryItem[]>([]);
  const [showAddCategoryForm, setShowAddCategoryForm] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
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
  const [selectedIngredientDetail, setSelectedIngredientDetail] = useState<IngredientDetail | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [recipeMenuItems, setRecipeMenuItems] = useState<MenuItemRow[]>([]);
  const [recipeLoading, setRecipeLoading] = useState(false);
  const [showAddItemForm, setShowAddItemForm] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [newItemIngredients, setNewItemIngredients] = useState<RecipeIngredientDraft[]>([createRecipeIngredientDraft()]);
  const [editingMenuItemId, setEditingMenuItemId] = useState<string | null>(null);
  const [editingMenuPrice, setEditingMenuPrice] = useState("");
  const [ingredientDetailPriceInput, setIngredientDetailPriceInput] = useState("");
  const [ingredientDetailBufferInput, setIngredientDetailBufferInput] = useState("");
  const [ingredientDetailYieldInput, setIngredientDetailYieldInput] = useState("");
  const [ingredientDetailFormulaInput, setIngredientDetailFormulaInput] = useState("");
  const [ingredientDetailFormulaNoteInput, setIngredientDetailFormulaNoteInput] = useState("");
  const [ingredientDetailSaveError, setIngredientDetailSaveError] = useState("");
  const [ingredientDetailSaving, setIngredientDetailSaving] = useState(false);
  const [ingredientDetailDeleting, setIngredientDetailDeleting] = useState(false);
  const [expandedMenuItemId, setExpandedMenuItemId] = useState<string | null>(null);
  const [menuDetails, setMenuDetails] = useState<Record<string, MenuItemDetail>>({});
  const [menuDetailLoadingId, setMenuDetailLoadingId] = useState<string | null>(null);
  const [menuDetailSavingId, setMenuDetailSavingId] = useState<string | null>(null);
  const [menuDraftLine, setMenuDraftLine] = useState<Record<string, RecipeIngredientDraft>>({});
  const [unmatchedInvoiceItems, setUnmatchedInvoiceItems] = useState<UnmatchedInvoiceItemRow[]>([]);
  const [invoiceMappings, setInvoiceMappings] = useState<InvoiceItemMappingRow[]>([]);
  const [invoiceMappingLoading, setInvoiceMappingLoading] = useState(false);
  const [invoiceMappingSaving, setInvoiceMappingSaving] = useState(false);
  const [selectedUnmatchedItemKey, setSelectedUnmatchedItemKey] = useState("");
  const [skippedUnmatchedInvoiceKeys, setSkippedUnmatchedInvoiceKeys] = useState<string[]>([]);
  const [editingInvoiceMappingId, setEditingInvoiceMappingId] = useState<string | null>(null);
  const [mappingMode, setMappingMode] = useState<"create" | "edit">("create");
  const [mappingSourceSupplierName, setMappingSourceSupplierName] = useState("");
  const [mappingSourceItemDescription, setMappingSourceItemDescription] = useState("");
  const [mappingSourceInvoiceUnit, setMappingSourceInvoiceUnit] = useState("");
  const [mappingIngredientSearch, setMappingIngredientSearch] = useState("");
  const [selectedMappingIngredientId, setSelectedMappingIngredientId] = useState("");
  const [mappingIngredientUnit, setMappingIngredientUnit] = useState("");
  const [mappingConversionRule, setMappingConversionRule] = useState("");
  const [mappingNotes, setMappingNotes] = useState("");
  const [mappingSaveError, setMappingSaveError] = useState("");
  const [mappingNewIngredientName, setMappingNewIngredientName] = useState("");
  const [mappingNewIngredientCategory, setMappingNewIngredientCategory] = useState("");
  const [mappingNewIngredientUnit, setMappingNewIngredientUnit] = useState("");
  const [mappingCreateIngredientError, setMappingCreateIngredientError] = useState("");
  const [mappingCreateIngredientSaving, setMappingCreateIngredientSaving] = useState(false);
  const [selectedMappingIngredientDetail, setSelectedMappingIngredientDetail] = useState<IngredientDetail | null>(null);
  const [mappingCostPriceInput, setMappingCostPriceInput] = useState("");
  const [mappingCostFormulaInput, setMappingCostFormulaInput] = useState("");
  const [mappingCostFormulaNoteInput, setMappingCostFormulaNoteInput] = useState("");
  const [mappingCostSaveError, setMappingCostSaveError] = useState("");
  const [mappingDetailLoading, setMappingDetailLoading] = useState(false);
  const [mappingCostSaving, setMappingCostSaving] = useState(false);
  const mappingCostInputsDirtyRef = useRef(false);
  const allIngredientOptionsRef = useRef(allIngredientOptions);
  const selectedIngredientDetailRef = useRef<IngredientDetail | null>(null);
  const activeSpreadsheetUrl = SPREADSHEET_URLS[city];
  const currencyCode = city === "dubai" ? "AED" : "PHP";
  const cityLabel = city === "dubai" ? "Dubai / AED" : "Manila / PHP";
  const ingredientColumns = useMemo<SpreadsheetColumn[]>(
    () => [
      { key: "row_num", label: "", width: 44, frozen: true, editable: false },
      { key: "category", label: "Category", width: 130, editable: true },
      { key: "name", label: "Name", width: 200, editable: true },
      { key: "unit", label: "Unit", width: 70, editable: true },
      { key: "unit_price", label: `計算単価 (${currencyCode})`, width: 110, editable: true, type: "number", align: "right" },
      { key: "buffer_rate", label: "Buffer", width: 92, editable: true, type: "number", align: "right" },
      { key: "yield_rate", label: "Yield", width: 92, editable: true, type: "number", align: "right" },
      { key: "notes", label: "Notes", width: 220, editable: true },
    ],
    [currencyCode],
  );

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

  useEffect(() => {
    try {
      const raw = localStorage.getItem(skippedUnmatchedStorageKey(city));
      const parsed = raw ? JSON.parse(raw) : [];
      setSkippedUnmatchedInvoiceKeys(Array.isArray(parsed) ? parsed : []);
    } catch {
      setSkippedUnmatchedInvoiceKeys([]);
    }
  }, [city]);

  const loadIngredients = useCallback(async () => {
    setLoading(true);
    try {
      const mapRow = (row: IngredientRow) => ({
        ...row,
        notes: String((row as any).notes || ""),
        unit_price: Number(row.unit_price || 0),
        unit_price_formula: String((row as any).unit_price_formula || ""),
        unit_price_formula_note: String((row as any).unit_price_formula_note || ""),
        buffer_rate: Number((row as any).buffer_rate || 1.15),
        yield_rate: normalizeRateValue((row as any).yield_rate),
      });

      const seen = new Set<string>();
      const merged: IngredientRow[] = [];
      let offset = 0;
      for (let page = 0; page < 400; page += 1) {
        const res = await costJson<{ items?: IngredientRow[]; ingredients?: IngredientRow[] }>(
          `/api/cost/ingredients?city=${encodeURIComponent(city)}&limit=${INGREDIENT_LIST_PAGE_SIZE}&offset=${offset}`,
        );
        const source = Array.isArray(res?.items) ? res.items : Array.isArray(res?.ingredients) ? res.ingredients : [];
        let added = 0;
        for (const row of source) {
          const id = String((row as IngredientRow).id || "");
          if (!id || seen.has(id)) continue;
          seen.add(id);
          merged.push(mapRow(row as IngredientRow));
          added += 1;
        }
        if (source.length < INGREDIENT_LIST_PAGE_SIZE || added === 0) break;
        offset += INGREDIENT_LIST_PAGE_SIZE;
      }
      setIngredients(merged);
      setAllIngredientOptions(merged);
    } catch (e) {
      console.error("Failed to load ingredients:", e);
      setIngredients([]);
      setAllIngredientOptions([]);
    } finally {
      setLoading(false);
    }
  }, [city]);

  const loadMenuCategories = useCallback(async () => {
    try {
      const res = await costJson<{ items?: CategoryItem[] }>(`/api/cost/categories?city=${encodeURIComponent(city)}`);
      const items = Array.isArray(res?.items)
        ? res.items
          .map((item) => ({
            category: String(item.category || "").trim(),
            item_count: Number(item.item_count || 0),
          }))
          .filter((item) => item.category)
        : [];
      setMenuCategories(items);
      setNewItemCategory((current) => (current || items[0]?.category || ""));
    } catch (e: any) {
      setError(e?.message || String(e));
      setMenuCategories([]);
    }
  }, [city]);

  const loadInvoiceMappingData = useCallback(async () => {
    setInvoiceMappingLoading(true);
    try {
      const [unmatchedResult, mappingsResult] = await Promise.allSettled([
        costJson<{ items?: UnmatchedInvoiceItemRow[] }>(
          `/api/admin/cost/invoice-item-mappings/unmatched?city=${encodeURIComponent(city)}&limit=100`,
        ),
        costJson<{ items?: InvoiceItemMappingRow[] }>(
          `/api/admin/cost/invoice-item-mappings?city=${encodeURIComponent(city)}&limit=200&is_active=true`,
        ),
      ]);
      const nextUnmatched = unmatchedResult.status === "fulfilled" && Array.isArray(unmatchedResult.value?.items)
        ? unmatchedResult.value.items.map((item) => ({
            ...item,
            latest_unit_price: Number(item.latest_unit_price || 0),
            invoice_count: Number(item.invoice_count || 0),
            line_count: Number(item.line_count || 0),
          }))
        : [];
      const nextMappings = mappingsResult.status === "fulfilled" && Array.isArray(mappingsResult.value?.items)
        ? mappingsResult.value.items.map((item) => ({
            ...item,
            id: String(item.id || ""),
            ingredient_id: String(item.ingredient_id || ""),
            ingredient_name_snapshot: String(item.ingredient_name_snapshot || ""),
            invoice_unit: String(item.invoice_unit || ""),
            ingredient_unit: String(item.ingredient_unit || ""),
            conversion_rule: String(item.conversion_rule || ""),
            notes: String(item.notes || ""),
          }))
        : [];
      setInvoiceMappings(nextMappings);
      if (unmatchedResult.status === "fulfilled") {
        setUnmatchedInvoiceItems(nextUnmatched);
        setSelectedUnmatchedItemKey((current) => {
          let skippedForSelect: string[] = [];
          try {
            const raw = localStorage.getItem(skippedUnmatchedStorageKey(city));
            const parsed = raw ? JSON.parse(raw) : [];
            skippedForSelect = Array.isArray(parsed) ? parsed : [];
          } catch {
            skippedForSelect = [];
          }
          const skippedSet = new Set(skippedForSelect);
          const visible = nextUnmatched.filter((item) => !skippedSet.has(unmatchedInvoiceItemKey(item)));
          if (current && visible.some((item) => unmatchedInvoiceItemKey(item) === current)) {
            return current;
          }
          return visible[0] ? unmatchedInvoiceItemKey(visible[0]) : "";
        });
      }
      if (unmatchedResult.status === "fulfilled" && mappingsResult.status === "fulfilled") {
        setError("");
      } else if (unmatchedResult.status === "rejected" && mappingsResult.status === "rejected") {
        setError("Invoice mapping data could not be loaded. Please retry in a few seconds.");
        setUnmatchedInvoiceItems([]);
        setInvoiceMappings([]);
      } else if (unmatchedResult.status === "rejected") {
        setError("Unmatched invoice items timed out. Existing mappings are still shown below.");
      } else if (mappingsResult.status === "rejected") {
        setError("Existing mappings could not be loaded. Unmatched invoice items are still available.");
      }
    } catch (e: any) {
      setError(e?.message || String(e));
      setUnmatchedInvoiceItems([]);
      setInvoiceMappings([]);
    } finally {
      setInvoiceMappingLoading(false);
    }
  }, [city]);

  const loadRecipeSheet = useCallback(async (sheet: SheetKey) => {
    if (sheet === INGREDIENT_SHEET) return;
    setRecipeLoading(true);
    try {
      const res = await costJson<{ items: MenuItemRow[] }>(
        `/api/cost/menu-items?city=${encodeURIComponent(city)}&category=${encodeURIComponent(sheet)}`,
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
    void loadMenuCategories();
    void loadInvoiceMappingData();
  }, [activeSheet, allowed, city, loadIngredients, loadMenuCategories, loadInvoiceMappingData]);

  useEffect(() => {
    if (!allowed) return;
    setLoadedRecipeSheets({});
    setRecipes({});
    setRecipeMenuItems([]);
    setMenuDetails({});
    setExpandedMenuItemId(null);
    setMenuDraftLine({});
    setShowAddItemForm(false);
    setShowAddCategoryForm(false);
    setNewCategoryName("");
    setUnmatchedInvoiceItems([]);
    setInvoiceMappings([]);
    setSelectedUnmatchedItemKey("");
    setEditingInvoiceMappingId(null);
    setMappingMode("create");
    setMappingSourceSupplierName("");
    setMappingSourceItemDescription("");
    setMappingSourceInvoiceUnit("");
    setMappingIngredientSearch("");
    setSelectedMappingIngredientId("");
    setMappingIngredientUnit("");
    setMappingConversionRule("");
    setMappingNotes("");
    setMappingSaveError("");
    setMappingNewIngredientName("");
    setMappingNewIngredientCategory("");
    setMappingNewIngredientUnit("");
    setMappingCreateIngredientError("");
    setSelectedMappingIngredientDetail(null);
    setMappingCostPriceInput("");
    setMappingCostFormulaInput("");
    setMappingCostFormulaNoteInput("");
    setMappingCostSaveError("");
    setDirtyRows(new Set());
    setSelectedCell(null);
    setEditingCell(null);
  }, [allowed, city]);

  useEffect(() => {
    if (!allowed) return;
    if (activeSheet !== INGREDIENT_SHEET && !loadedRecipeSheets[activeSheet]) {
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

  const sheets = useMemo<SheetMeta[]>(
    () => [
      { key: INGREDIENT_SHEET, name: INGREDIENT_SHEET },
      ...menuCategories.map((item) => ({ key: item.category, name: item.category })),
    ],
    [menuCategories],
  );

  useEffect(() => {
    if (activeSheet === INGREDIENT_SHEET) return;
    if (!menuCategories.some((item) => item.category === activeSheet)) {
      setActiveSheet(INGREDIENT_SHEET);
    }
  }, [activeSheet, menuCategories]);

  useEffect(() => {
    if (activeSheet !== INGREDIENT_SHEET) {
      setNewItemCategory(activeSheet);
    }
  }, [activeSheet]);

  useEffect(() => {
    if (mappingNewIngredientCategory) return;
    if (!ingredientCategories.length) return;
    setMappingNewIngredientCategory(ingredientCategories[0]);
  }, [ingredientCategories, mappingNewIngredientCategory]);

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
    if (activeSheet === INGREDIENT_SHEET) return [];
    const q = searchText.trim().toLowerCase();
    if (!q) return recipeMenuItems;
    return recipeMenuItems.filter((item) =>
      [item.name, item.category].some((value) => String(value || "").toLowerCase().includes(q)),
    );
  }, [activeSheet, recipeMenuItems, searchText]);

  const skippedUnmatchedSet = useMemo(() => new Set(skippedUnmatchedInvoiceKeys), [skippedUnmatchedInvoiceKeys]);
  const visibleUnmatchedInvoiceItems = useMemo(
    () => unmatchedInvoiceItems.filter((item) => !skippedUnmatchedSet.has(unmatchedInvoiceItemKey(item))),
    [unmatchedInvoiceItems, skippedUnmatchedSet],
  );
  const selectedUnmatchedItem = useMemo(() => {
    if (!selectedUnmatchedItemKey || skippedUnmatchedSet.has(selectedUnmatchedItemKey)) return null;
    return unmatchedInvoiceItems.find((item) => unmatchedInvoiceItemKey(item) === selectedUnmatchedItemKey) || null;
  }, [selectedUnmatchedItemKey, skippedUnmatchedSet, unmatchedInvoiceItems]);
  const activeCreateUnmatchedItem = useMemo(() => {
    if (selectedUnmatchedItem) return selectedUnmatchedItem;
    if (mappingMode !== "create" || !mappingSourceItemDescription.trim()) return null;
    return visibleUnmatchedInvoiceItems.find((item) => (
      String(item.supplier_name || "") === mappingSourceSupplierName
      && String(item.item_description || "") === mappingSourceItemDescription
      && String(item.unit || "") === mappingSourceInvoiceUnit
    )) || null;
  }, [
    mappingMode,
    mappingSourceInvoiceUnit,
    mappingSourceItemDescription,
    mappingSourceSupplierName,
    selectedUnmatchedItem,
    visibleUnmatchedInvoiceItems,
  ]);
  const activeCreateUnmatchedItemKey = useMemo(
    () => (activeCreateUnmatchedItem ? unmatchedInvoiceItemKey(activeCreateUnmatchedItem) : ""),
    [activeCreateUnmatchedItem],
  );
  const hasActiveMappingSelection = mappingMode === "create"
    ? Boolean(activeCreateUnmatchedItem)
    : Boolean(mappingSourceItemDescription.trim());
  const activeMappingSelectionMeta = useMemo(() => {
    if (mappingMode === "create" && activeCreateUnmatchedItem) {
      return {
        supplierName: activeCreateUnmatchedItem.supplier_name || "",
        itemDescription: activeCreateUnmatchedItem.item_description || "",
        invoiceUnit: activeCreateUnmatchedItem.unit || "",
        latestUnitPrice: Number(activeCreateUnmatchedItem.latest_unit_price || 0),
        invoiceCount: Number(activeCreateUnmatchedItem.invoice_count || 0),
        lineCount: Number(activeCreateUnmatchedItem.line_count || 0),
      };
    }
    return {
      supplierName: mappingSourceSupplierName,
      itemDescription: mappingSourceItemDescription,
      invoiceUnit: mappingSourceInvoiceUnit,
      latestUnitPrice: 0,
      invoiceCount: 0,
      lineCount: 0,
    };
  }, [activeCreateUnmatchedItem, mappingMode, mappingSourceInvoiceUnit, mappingSourceItemDescription, mappingSourceSupplierName]);

  const mappingIngredientOptions = useMemo(() => {
    const q = mappingIngredientSearch.trim().toLowerCase();
    if (!q) return allIngredientOptions.slice(0, 25);
    return allIngredientOptions
      .filter((item) => [item.name, item.category, item.notes].some((value) => String(value || "").toLowerCase().includes(q)))
      .slice(0, 25);
  }, [allIngredientOptions, mappingIngredientSearch]);
  const mappingNewIngredientSuggestions = useMemo(() => {
    const q = normalizeIngredientNameForMatch(mappingNewIngredientName);
    if (!q) return [];
    return allIngredientOptions
      .filter((item) => {
        const normalizedName = normalizeIngredientNameForMatch(item.name);
        return normalizedName.includes(q) || q.includes(normalizedName);
      })
      .slice(0, 5);
  }, [allIngredientOptions, mappingNewIngredientName]);
  const mappingNewIngredientExactMatch = useMemo(
    () => allIngredientOptions.find((item) => normalizeIngredientNameForMatch(item.name) === normalizeIngredientNameForMatch(mappingNewIngredientName)) || null,
    [allIngredientOptions, mappingNewIngredientName],
  );

  const currentColumns = activeSheet === INGREDIENT_SHEET ? ingredientColumns : RECIPE_COLUMNS;
  const currentRows = activeSheet === INGREDIENT_SHEET ? filteredIngredientRows : filteredRecipeRows;
  const recipeStats = useMemo(() => recipeGroupStats(filteredRecipeRows), [filteredRecipeRows]);
  const averageCostRatio = useMemo(() => {
    const values = recipeMenuItems
      .map((item) => Number(item.cost_ratio))
      .filter((value) => Number.isFinite(value) && value >= 0);
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }, [recipeMenuItems]);

  const dirtyCount = useMemo(() => {
    if (activeSheet === INGREDIENT_SHEET) return ingredients.filter((row) => row._dirty || row._new).length;
    return (recipes[activeSheet] || []).filter((row) => row._dirty || row._new).length;
  }, [activeSheet, ingredients, recipes]);

  const getCellValue = useCallback((rowIndex: number, colKey: string) => {
    const row = currentRows[rowIndex] as any;
    if (!row) return "";
    if (colKey === "row_num") return rowIndex + 1;
    if (activeSheet === INGREDIENT_SHEET) {
      return row[colKey] ?? "";
    }
    const recipeRow = row as RecipeRow;
    const group = recipeStats.get(recipeRow.menu_name || `row-${rowIndex}`);
    if (colKey === "cost") return recipeRow.quantity * recipeRow.unit_price;
    if (colKey === "cost_115") return recipeRow.quantity * recipeRow.unit_price;
    if (colKey === "total_cost") return group && group.end === rowIndex ? group.totalCost : "";
    if (colKey === "cost_ratio") return group && group.end === rowIndex ? group.costRatio : "";
    if (colKey === "menu_name") {
      const previous = filteredRecipeRows[rowIndex - 1];
      return previous?.menu_name === recipeRow.menu_name ? "" : recipeRow.menu_name;
    }
    return (recipeRow as any)[colKey] ?? "";
  }, [activeSheet, currentRows, filteredRecipeRows, recipeStats]);

  const applyIngredientDetailToLocalState = useCallback((detail: IngredientDetail) => {
    const normalizedUnitPrice = Number(detail.unit_price || 0);
    const normalizedFormula = String(detail.unit_price_formula || "");
    const normalizedFormulaNote = String(detail.unit_price_formula_note || "");
    const normalizedBufferRate = Number(detail.buffer_rate || 1.15);
    const normalizedYieldRate = normalizeRateValue(detail.yield_rate);
    setIngredients((prev) => prev.map((item) => (
      String(item.id) === String(detail.id)
        ? {
            ...item,
            unit_price: normalizedUnitPrice,
            unit_price_formula: normalizedFormula,
            unit_price_formula_note: normalizedFormulaNote,
            buffer_rate: normalizedBufferRate,
            yield_rate: normalizedYieldRate,
          }
        : item
    )));
    setAllIngredientOptions((prev) => prev.map((item) => (
      String(item.id) === String(detail.id)
        ? {
            ...item,
            unit_price: normalizedUnitPrice,
            unit_price_formula: normalizedFormula,
            unit_price_formula_note: normalizedFormulaNote,
            buffer_rate: normalizedBufferRate,
            yield_rate: normalizedYieldRate,
          }
        : item
    )));
    if (selectedIngredientDetailRef.current && String(selectedIngredientDetailRef.current.id) === String(detail.id)) {
      setSelectedIngredientDetail((prev) => prev ? { ...prev, ...detail } : prev);
      setIngredientDetailPriceInput(String(normalizedUnitPrice));
      setIngredientDetailBufferInput(String((normalizedBufferRate * 100).toFixed(0)));
      setIngredientDetailYieldInput(normalizedYieldRate == null ? "" : String((normalizedYieldRate * 100).toFixed(0)));
      setIngredientDetailFormulaInput(normalizedFormula);
      setIngredientDetailFormulaNoteInput(normalizedFormulaNote);
    }
  }, []);

  useEffect(() => {
    allIngredientOptionsRef.current = allIngredientOptions;
  }, [allIngredientOptions]);

  useEffect(() => {
    selectedIngredientDetailRef.current = selectedIngredientDetail;
  }, [selectedIngredientDetail]);

  const loadMappingIngredientDetail = useCallback(async (ingredientId: string) => {
    const normalizedId = String(ingredientId || "").trim();
    if (!normalizedId) {
      setSelectedMappingIngredientDetail(null);
      setMappingCostPriceInput("");
      setMappingCostFormulaInput("");
      setMappingCostFormulaNoteInput("");
      setMappingCostSaveError("");
      return;
    }
    const fallback = allIngredientOptionsRef.current.find((item) => String(item.id) === normalizedId) || null;
    setMappingDetailLoading(true);
    setMappingCostSaveError("");
    try {
      const res = await costJson<{ item?: IngredientDetail }>(`/api/cost/ingredients/${normalizedId}`);
      const detail = res?.item
        ? {
            ...(fallback || {}),
            ...res.item,
            id: String(res.item.id || normalizedId),
            category: String(res.item.category || fallback?.category || ""),
            name: String(res.item.name || fallback?.name || ""),
            unit: String(res.item.unit || fallback?.unit || ""),
            unit_price: Number(res.item.unit_price || fallback?.unit_price || 0),
            unit_price_formula: String(res.item.unit_price_formula || fallback?.unit_price_formula || ""),
            unit_price_formula_note: String(res.item.unit_price_formula_note || fallback?.unit_price_formula_note || ""),
            buffer_rate: Number(res.item.buffer_rate || fallback?.buffer_rate || 1.15),
            yield_rate: normalizeRateValue(res.item.yield_rate ?? fallback?.yield_rate),
            notes: String(res.item.notes || fallback?.notes || ""),
            city: String(res.item.city || fallback?.city || city),
            supplier_prices: Array.isArray(res.item.supplier_prices)
              ? res.item.supplier_prices.map((row) => ({
                  id: String(row.id || ""),
                  supplier_id: String(row.supplier_id || ""),
                  supplier_name: String(row.supplier_name || ""),
                  purchase_unit: String(row.purchase_unit || ""),
                  purchase_qty: Number(row.purchase_qty || 0),
                  purchase_price: Number(row.purchase_price || 0),
                  unit_price: Number(row.unit_price || 0),
                  updated_by: String(row.updated_by || ""),
                  updated_at: String(row.updated_at || ""),
                }))
              : [],
          }
        : fallback;
      if (!detail) return;
      setSelectedMappingIngredientDetail(detail);
      if (!mappingCostInputsDirtyRef.current) {
        setMappingCostPriceInput(String(Number(detail.unit_price || 0)));
        setMappingCostFormulaInput(String(detail.unit_price_formula || ""));
        setMappingCostFormulaNoteInput(String(detail.unit_price_formula_note || ""));
      }
      applyIngredientDetailToLocalState(detail);
    } catch (e: any) {
      setMappingCostSaveError(e?.message || String(e));
      if (fallback) {
        setSelectedMappingIngredientDetail(fallback);
        if (!mappingCostInputsDirtyRef.current) {
          setMappingCostPriceInput(String(Number(fallback.unit_price || 0)));
          setMappingCostFormulaInput(String(fallback.unit_price_formula || ""));
          setMappingCostFormulaNoteInput(String(fallback.unit_price_formula_note || ""));
        }
      } else {
        setSelectedMappingIngredientDetail(null);
      }
    } finally {
      setMappingDetailLoading(false);
    }
  }, [applyIngredientDetailToLocalState, city]);

  const visibleIngredientSuggestions = useMemo(() => {
    if (!editingCell || activeSheet === INGREDIENT_SHEET || editingCell.col !== "ingredient") return [];
    const q = editValue.trim().toLowerCase();
    if (!q) return allIngredientOptions.slice(0, 8);
    return allIngredientOptions
      .filter((item) => [item.name, item.category, item.notes].some((value) => String(value || "").toLowerCase().includes(q)))
      .slice(0, 8);
  }, [activeSheet, allIngredientOptions, editValue, editingCell]);

  const newItemPreview = useMemo(() => {
    const sellingPrice = normalizeNumber(newItemPrice);
    const lines = newItemIngredients
      .map((row) => {
        const ingredient = allIngredientOptions.find((item) => String(item.id) === String(row.ingredient_id));
        const quantity = normalizeNumber(row.quantity);
        return ingredient
          ? {
              quantity,
              unit_price: Number(ingredient.unit_price || 0),
            }
          : null;
      })
      .filter((row): row is { quantity: number; unit_price: number } => Boolean(row) && row.quantity > 0);
    return computeMenuTotals(lines, sellingPrice);
  }, [allIngredientOptions, newItemIngredients, newItemPrice]);

  const openIngredientDetail = useCallback(async (ingredient: IngredientRow) => {
    setHistoryLoading(true);
    setIngredientDetailSaveError("");
    try {
      const res = await costJson<{ item?: IngredientDetail }>(
        `/api/cost/ingredients/${ingredient.id}`,
      );
      const detail = res?.item
        ? {
            ...ingredient,
            ...res.item,
            unit_price: Number(res.item.unit_price || ingredient.unit_price || 0),
            unit_price_formula: String(res.item.unit_price_formula || ingredient.unit_price_formula || ""),
            unit_price_formula_note: String(res.item.unit_price_formula_note || ingredient.unit_price_formula_note || ""),
            buffer_rate: Number(res.item.buffer_rate || ingredient.buffer_rate || 1.15),
            yield_rate: normalizeRateValue(res.item.yield_rate ?? ingredient.yield_rate),
            notes: String(res.item.notes || ingredient.notes || ""),
            supplier_prices: Array.isArray(res.item.supplier_prices)
              ? res.item.supplier_prices.map((row) => ({
                  id: String(row.id || ""),
                  supplier_id: String(row.supplier_id || ""),
                  supplier_name: String(row.supplier_name || ""),
                  purchase_unit: String(row.purchase_unit || ""),
                  purchase_qty: Number(row.purchase_qty || 0),
                  purchase_price: Number(row.purchase_price || 0),
                  unit_price: Number(row.unit_price || 0),
                  updated_by: String(row.updated_by || ""),
                  updated_at: String(row.updated_at || ""),
                }))
              : [],
          }
        : { ...ingredient };
      setSelectedIngredientDetail(detail);
      setIngredientDetailPriceInput(String(Number(detail.unit_price || 0)));
      setIngredientDetailBufferInput(String((Number(detail.buffer_rate || 1.15) * 100).toFixed(0)));
      setIngredientDetailYieldInput(detail.yield_rate == null ? "" : String((Number(detail.yield_rate || 0) * 100).toFixed(0)));
      setIngredientDetailFormulaInput(String(detail.unit_price_formula || ""));
      setIngredientDetailFormulaNoteInput(String(detail.unit_price_formula_note || ""));
      setPriceHistory(
        attachPreviousIngredientPrices(
          Array.isArray(res?.item?.price_history)
            ? res.item.price_history.map((entry: any) => ({
                id: Number(entry.id || 0),
                old_price: entry.old_price == null ? null : Number(entry.old_price),
                unit_price: Number(entry.unit_price || 0),
                old_formula: String(entry.old_formula || ""),
                unit_price_formula: String(entry.unit_price_formula || ""),
                unit_price_formula_note: String(entry.unit_price_formula_note || ""),
                changed_at: String(entry.changed_at || ""),
                changed_by: String(entry.changed_by || ""),
                notes: String(entry.notes || ""),
                previous_price: entry.previous_price == null ? null : Number(entry.previous_price),
              }))
            : [],
        ),
      );
    } catch {
      setSelectedIngredientDetail({ ...ingredient });
      setIngredientDetailPriceInput(String(Number(ingredient.unit_price || 0)));
      setIngredientDetailBufferInput(String((Number(ingredient.buffer_rate || 1.15) * 100).toFixed(0)));
      setIngredientDetailYieldInput(ingredient.yield_rate == null ? "" : String((Number(ingredient.yield_rate || 0) * 100).toFixed(0)));
      setIngredientDetailFormulaInput(String(ingredient.unit_price_formula || ""));
      setIngredientDetailFormulaNoteInput(String(ingredient.unit_price_formula_note || ""));
      setPriceHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const deleteSelectedIngredient = useCallback(async () => {
    if (!selectedIngredientDetail) return;
    const ingredientId = String(selectedIngredientDetail.id || "").trim();
    if (!ingredientId) return;
    const ingredientName = selectedIngredientDetail.name || "this ingredient";
    const confirmed = window.confirm(`Delete "${ingredientName}" from Cost Calculation?`);
    if (!confirmed) return;
    setIngredientDetailDeleting(true);
    setIngredientDetailSaveError("");
    try {
      await costJson(`/api/cost/ingredients/${ingredientId}`, {
        method: "DELETE",
      });
      setIngredients((prev) => prev.filter((item) => String(item.id) !== ingredientId));
      setAllIngredientOptions((prev) => prev.filter((item) => String(item.id) !== ingredientId));
      if (selectedMappingIngredientId === ingredientId) {
        setSelectedMappingIngredientId("");
        setMappingIngredientSearch("");
        setMappingIngredientUnit("");
        setSelectedMappingIngredientDetail(null);
        setMappingCostPriceInput("");
        setMappingCostFormulaInput("");
        setMappingCostFormulaNoteInput("");
        setMappingCostSaveError("");
      }
      setSelectedIngredientDetail(null);
      setPriceHistory([]);
      await loadIngredients();
    } catch (e: any) {
      setIngredientDetailSaveError(e?.message || String(e));
    } finally {
      setIngredientDetailDeleting(false);
    }
  }, [loadIngredients, selectedIngredientDetail, selectedMappingIngredientId]);

  useEffect(() => {
    if (mappingMode !== "create") return;
    if (mappingSourceItemDescription.trim()) return;
    if (!selectedUnmatchedItem) return;
    setMappingSourceSupplierName(selectedUnmatchedItem.supplier_name || "");
    setMappingSourceItemDescription(selectedUnmatchedItem.item_description || "");
    setMappingSourceInvoiceUnit(selectedUnmatchedItem.unit || "");
  }, [mappingMode, mappingSourceItemDescription, selectedUnmatchedItem]);

  useEffect(() => {
    if (activeSheet !== INGREDIENT_SHEET) return;
    if (!selectedMappingIngredientId) {
      setSelectedMappingIngredientDetail(null);
      setMappingCostPriceInput("");
      setMappingCostFormulaInput("");
      setMappingCostFormulaNoteInput("");
      setMappingCostSaveError("");
      mappingCostInputsDirtyRef.current = false;
      return;
    }
    mappingCostInputsDirtyRef.current = false;
    void loadMappingIngredientDetail(selectedMappingIngredientId);
  }, [activeSheet, loadMappingIngredientDetail, selectedMappingIngredientId]);

  const refreshActiveRecipeTab = useCallback(async () => {
    if (activeSheet === INGREDIENT_SHEET) return;
    await loadRecipeSheet(activeSheet);
  }, [activeSheet, loadRecipeSheet]);

  const refreshMenuDetail = useCallback(async (menuItemId: string) => {
    setMenuDetailLoadingId(menuItemId);
    try {
      const res = await costJson<{ item?: MenuItemDetail }>(`/api/cost/menu-items/${menuItemId}`);
      if (res?.item) {
        setMenuDetails((prev) => ({ ...prev, [menuItemId]: mapMenuItemDetail(res.item) }));
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setMenuDetailLoadingId((current) => (current === menuItemId ? null : current));
    }
  }, []);

  const toggleMenuDetail = useCallback(async (menuItemId: string) => {
    setExpandedMenuItemId((current) => (current === menuItemId ? null : menuItemId));
    if (!menuDetails[menuItemId]) {
      await refreshMenuDetail(menuItemId);
    }
    setMenuDraftLine((prev) => (prev[menuItemId] ? prev : { ...prev, [menuItemId]: createRecipeIngredientDraft() }));
  }, [menuDetails, refreshMenuDetail]);

  const updateMenuDetailLocal = useCallback((menuItemId: string, updater: (current: MenuItemDetail) => MenuItemDetail) => {
    setMenuDetails((prev) => {
      const current = prev[menuItemId];
      if (!current) return prev;
      const next = updater(current);
      const totals = computeMenuTotals(next.ingredients, next.selling_price);
      return {
        ...prev,
        [menuItemId]: {
          ...next,
          total_cost: totals.total_cost,
          raw_cost: totals.total_cost,
          cost_ratio: totals.cost_ratio,
          ingredient_count: next.ingredients.length,
        },
      };
    });
  }, []);

  const saveRecipeMenuItemPrice = useCallback(async (id: string, value: string) => {
    const nextValue = normalizeNumber(value);
    try {
      setMenuDetailSavingId(id);
      await costJson(`/api/cost/menu-items/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ selling_price: nextValue }),
      });
      await refreshActiveRecipeTab();
      if (expandedMenuItemId === id) {
        await refreshMenuDetail(id);
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setMenuDetailSavingId((current) => (current === id ? null : current));
      setEditingMenuItemId(null);
      setEditingMenuPrice("");
    }
  }, [expandedMenuItemId, refreshActiveRecipeTab, refreshMenuDetail]);

  const saveMenuCategory = useCallback(async (menuItemId: string, nextCategory: string) => {
    const category = String(nextCategory || "").trim();
    if (!category) return;
    try {
      setMenuDetailSavingId(menuItemId);
      await costJson(`/api/cost/menu-items/${menuItemId}`, {
        method: "PATCH",
        body: JSON.stringify({ category }),
      });
      await loadMenuCategories();
      setExpandedMenuItemId((current) => (current === menuItemId ? null : current));
      setActiveSheet(category);
      await loadRecipeSheet(category);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setMenuDetailSavingId((current) => (current === menuItemId ? null : current));
    }
  }, [loadMenuCategories, loadRecipeSheet]);

  const persistMenuIngredients = useCallback(async (menuItemId: string, ingredients: MenuIngredientDetail[]) => {
    try {
      setMenuDetailSavingId(menuItemId);
      await costJson(`/api/cost/menu-items/${menuItemId}`, {
        method: "PATCH",
        body: JSON.stringify({
          ingredients: ingredients
            .filter((row) => Number(row.quantity || 0) > 0 && Number(row.ingredient_id || 0) > 0)
            .map((row) => ({
              ingredient_id: Number(row.ingredient_id || 0),
              quantity: Number(row.quantity || 0),
              unit: row.unit,
            })),
        }),
      });
      await refreshActiveRecipeTab();
      await refreshMenuDetail(menuItemId);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setMenuDetailSavingId((current) => (current === menuItemId ? null : current));
    }
  }, [refreshActiveRecipeTab, refreshMenuDetail]);

  const saveMenuIngredients = useCallback(async (menuItemId: string) => {
    const detail = menuDetails[menuItemId];
    if (!detail) return;
    await persistMenuIngredients(menuItemId, detail.ingredients);
  }, [menuDetails, persistMenuIngredients]);

  const addIngredientToMenu = useCallback(async (menuItemId: string) => {
    const detail = menuDetails[menuItemId];
    const draft = menuDraftLine[menuItemId];
    if (!detail || !draft) return;
    const ingredientId = Number(draft.ingredient_id || 0);
    const quantity = normalizeNumber(draft.quantity);
    if (!ingredientId || quantity <= 0) return;
    const ingredient = allIngredientOptions.find((item) => String(item.id) === String(ingredientId));
    if (!ingredient) return;
    const existing = detail.ingredients.find((row) => String(row.ingredient_id) === String(ingredientId));
    const nextIngredients = existing
      ? detail.ingredients.map((row) => (
          String(row.ingredient_id) === String(ingredientId)
            ? { ...row, quantity: Number(row.quantity || 0) + quantity }
            : row
        ))
      : [
          ...detail.ingredients,
          {
            id: `draft-${ingredientId}`,
            ingredient_id: String(ingredient.id),
            ingredient_name: ingredient.name,
            ingredient_category: ingredient.category,
            quantity,
            unit: ingredient.unit,
            unit_price: Number(ingredient.unit_price || 0),
            raw_cost: quantity * Number(ingredient.unit_price || 0),
            cost: quantity * Number(ingredient.unit_price || 0),
          },
        ];
    try {
      setMenuDetailSavingId(menuItemId);
      updateMenuDetailLocal(menuItemId, (current) => ({ ...current, ingredients: nextIngredients }));
      setMenuDraftLine((prev) => ({ ...prev, [menuItemId]: createRecipeIngredientDraft() }));
      await persistMenuIngredients(menuItemId, nextIngredients);
    } catch (e: any) {
      setError(e?.message || String(e));
      await refreshMenuDetail(menuItemId);
    }
  }, [allIngredientOptions, menuDetails, menuDraftLine, persistMenuIngredients, refreshMenuDetail, updateMenuDetailLocal]);

  const removeIngredientFromMenu = useCallback(async (menuItemId: string, ingredientId: string) => {
    const detail = menuDetails[menuItemId];
    if (!detail) return;
    const nextIngredients = detail.ingredients.filter((row) => String(row.ingredient_id) !== String(ingredientId));
    updateMenuDetailLocal(menuItemId, (current) => ({ ...current, ingredients: nextIngredients }));
    try {
      await persistMenuIngredients(menuItemId, nextIngredients);
    } catch (e: any) {
      setError(e?.message || String(e));
      await refreshMenuDetail(menuItemId);
    }
  }, [menuDetails, persistMenuIngredients, refreshMenuDetail, updateMenuDetailLocal]);

  const createRecipeMenuItem = useCallback(async () => {
    if (activeSheet === INGREDIENT_SHEET) return;
    const name = newItemName.trim();
    if (!name) return;
    const category = String(newItemCategory || activeSheet).trim();
    const ingredientsPayload = newItemIngredients
      .map((row) => ({
        ingredient_id: Number(row.ingredient_id || 0),
        quantity: normalizeNumber(row.quantity),
      }))
      .filter((row) => row.ingredient_id > 0 && row.quantity > 0);
    if (!category) return;
    if (ingredientsPayload.length === 0) {
      setError("At least one ingredient with quantity is required.");
      return;
    }
    try {
      const res = await costJson<{ item?: MenuItemDetail }>("/api/cost/menu-items", {
        method: "POST",
        body: JSON.stringify({
          city,
          name,
          category,
          selling_price: normalizeNumber(newItemPrice),
          ingredients: ingredientsPayload,
        }),
      });
      setShowAddItemForm(false);
      setNewItemName("");
      setNewItemPrice("");
      setNewItemIngredients([createRecipeIngredientDraft()]);
      await refreshActiveRecipeTab();
      if (res?.item?.id) {
        const detail = mapMenuItemDetail(res.item);
        setMenuDetails((prev) => ({ ...prev, [detail.id]: detail }));
        setExpandedMenuItemId(detail.id);
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }, [activeSheet, city, newItemCategory, newItemIngredients, newItemName, newItemPrice, refreshActiveRecipeTab]);

  const createMenuCategory = useCallback(async () => {
    const name = String(newCategoryName || "").trim();
    if (!name) return;
    try {
      await costJson("/api/cost/categories", {
        method: "POST",
        body: JSON.stringify({ city, name }),
      });
      await loadMenuCategories();
      setShowAddCategoryForm(false);
      setNewCategoryName("");
      setNewItemCategory(name);
      setActiveSheet(name);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }, [city, loadMenuCategories, newCategoryName]);

  const selectUnmatchedInvoiceItem = useCallback((itemKey: string) => {
    const item = unmatchedInvoiceItems.find((entry) => unmatchedInvoiceItemKey(entry) === itemKey);
    setSelectedUnmatchedItemKey(itemKey);
    setEditingInvoiceMappingId(null);
    setMappingMode("create");
    setMappingSourceSupplierName(item?.supplier_name || "");
    setMappingSourceItemDescription(item?.item_description || "");
    setMappingSourceInvoiceUnit(item?.unit || "");
    setMappingIngredientSearch("");
    setSelectedMappingIngredientId("");
    setMappingIngredientUnit("");
    setMappingConversionRule("");
    setMappingNotes("");
    setMappingSaveError("");
    setMappingNewIngredientName(String(item?.item_description || ""));
    setMappingNewIngredientCategory("");
    setMappingNewIngredientUnit(String(item?.unit || ""));
    setMappingCreateIngredientError("");
    setSelectedMappingIngredientDetail(null);
    setMappingCostPriceInput("");
    setMappingCostFormulaInput("");
    setMappingCostFormulaNoteInput("");
    setMappingCostSaveError("");
  }, [unmatchedInvoiceItems]);

  const skipCurrentUnmatchedInvoiceItem = useCallback(() => {
    if (mappingMode !== "create" || !activeCreateUnmatchedItemKey) return;
    const key = activeCreateUnmatchedItemKey;
    if (skippedUnmatchedInvoiceKeys.includes(key)) return;
    const nextSkipped = [...skippedUnmatchedInvoiceKeys, key];
    try {
      localStorage.setItem(skippedUnmatchedStorageKey(city), JSON.stringify(nextSkipped));
    } catch {
      /* ignore quota / private mode */
    }
    setSkippedUnmatchedInvoiceKeys(nextSkipped);
    const skippedSet = new Set(nextSkipped);
    const idx = unmatchedInvoiceItems.findIndex((item) => unmatchedInvoiceItemKey(item) === key);
    let nextKey = "";
    for (let i = idx + 1; i < unmatchedInvoiceItems.length; i++) {
      const k = unmatchedInvoiceItemKey(unmatchedInvoiceItems[i]);
      if (!skippedSet.has(k)) {
        nextKey = k;
        break;
      }
    }
    if (!nextKey) {
      for (let i = 0; i < idx; i++) {
        const k = unmatchedInvoiceItemKey(unmatchedInvoiceItems[i]);
        if (!skippedSet.has(k)) {
          nextKey = k;
          break;
        }
      }
    }
    if (nextKey) {
      selectUnmatchedInvoiceItem(nextKey);
    } else {
      setEditingInvoiceMappingId(null);
      setMappingMode("create");
      setSelectedUnmatchedItemKey("");
      setMappingSourceSupplierName("");
      setMappingSourceItemDescription("");
      setMappingSourceInvoiceUnit("");
      setMappingIngredientSearch("");
      setSelectedMappingIngredientId("");
      setMappingIngredientUnit("");
      setMappingConversionRule("");
      setMappingNotes("");
      setMappingSaveError("");
      setMappingNewIngredientName("");
      setMappingNewIngredientCategory("");
      setMappingNewIngredientUnit("");
      setMappingCreateIngredientError("");
      setSelectedMappingIngredientDetail(null);
      setMappingCostPriceInput("");
      setMappingCostFormulaInput("");
      setMappingCostFormulaNoteInput("");
      setMappingCostSaveError("");
    }
  }, [
    activeCreateUnmatchedItemKey,
    city,
    mappingMode,
    selectUnmatchedInvoiceItem,
    skippedUnmatchedInvoiceKeys,
    unmatchedInvoiceItems,
  ]);

  const clearSkippedUnmatchedInvoiceItems = useCallback(() => {
    try {
      localStorage.removeItem(skippedUnmatchedStorageKey(city));
    } catch {
      /* ignore */
    }
    setSkippedUnmatchedInvoiceKeys([]);
  }, [city]);

  const startEditingInvoiceMapping = useCallback((mapping: InvoiceItemMappingRow) => {
    setSelectedUnmatchedItemKey("");
    setEditingInvoiceMappingId(mapping.id);
    setMappingMode("edit");
    setMappingSourceSupplierName(mapping.supplier_name || "");
    setMappingSourceItemDescription(mapping.invoice_item_description || "");
    setMappingSourceInvoiceUnit(mapping.invoice_unit || "");
    setSelectedMappingIngredientId(String(mapping.ingredient_id || ""));
    setMappingIngredientSearch(String(mapping.ingredient_name_snapshot || ""));
    setMappingIngredientUnit(mapping.ingredient_unit || "");
    setMappingConversionRule(mapping.conversion_rule || "");
    setMappingNotes(mapping.notes || "");
    setMappingSaveError("");
    setMappingNewIngredientName("");
    setMappingNewIngredientCategory("");
    setMappingNewIngredientUnit("");
    setMappingCreateIngredientError("");
    setSelectedMappingIngredientDetail(null);
    setMappingCostPriceInput("");
    setMappingCostFormulaInput("");
    setMappingCostFormulaNoteInput("");
    setMappingCostSaveError("");
  }, []);

  const saveInvoiceItemMapping = useCallback(async () => {
    if (!mappingSourceItemDescription.trim() || !selectedMappingIngredientId) return;
    const selectedIngredient = allIngredientOptions.find((item) => String(item.id) === String(selectedMappingIngredientId));
    try {
      setInvoiceMappingSaving(true);
      setMappingSaveError("");
      await costJson("/api/admin/cost/invoice-item-mappings", {
        method: "POST",
        body: JSON.stringify({
          city,
          supplier_name: mappingSourceSupplierName,
          invoice_item_description: mappingSourceItemDescription,
          invoice_unit: mappingSourceInvoiceUnit,
          ingredient_id: Number(selectedMappingIngredientId),
          ingredient_unit: mappingIngredientUnit || selectedIngredient?.unit || "",
          conversion_rule: mappingConversionRule,
          notes: mappingNotes,
        }),
      });
      if (mappingMode === "create") {
        setMappingSourceSupplierName("");
        setMappingSourceItemDescription("");
        setMappingSourceInvoiceUnit("");
        setMappingIngredientSearch("");
        setSelectedMappingIngredientId("");
        setMappingIngredientUnit("");
        setMappingConversionRule("");
        setMappingNotes("");
        setMappingSaveError("");
        setSelectedMappingIngredientDetail(null);
        setMappingCostPriceInput("");
        setMappingCostFormulaInput("");
        setMappingCostFormulaNoteInput("");
        setMappingCostSaveError("");
      }
      await loadInvoiceMappingData();
    } catch (e: any) {
      setMappingSaveError(e?.message || String(e));
      setError(e?.message || String(e));
    } finally {
      setInvoiceMappingSaving(false);
    }
  }, [
    allIngredientOptions,
    city,
    loadInvoiceMappingData,
    mappingConversionRule,
    mappingIngredientUnit,
    mappingNotes,
    mappingMode,
    mappingSourceInvoiceUnit,
    mappingSourceItemDescription,
    mappingSourceSupplierName,
    selectedMappingIngredientId,
  ]);

  const saveMappingIngredientCost = useCallback(async () => {
    const ingredientId = String(selectedMappingIngredientId || "").trim();
    if (!ingredientId) return;
    const trimmedFormula = mappingCostFormulaInput.trim();
    const trimmedPriceInput = mappingCostPriceInput.trim();
    const numericPrice = trimmedPriceInput === "" ? null : Number(trimmedPriceInput);
    if (!trimmedFormula && (numericPrice == null || !Number.isFinite(numericPrice))) {
      setMappingCostSaveError("数値単価を入れるか、計算式を入力してください。");
      return;
    }
    try {
      setMappingCostSaving(true);
      setMappingCostSaveError("");
      const payload: Record<string, unknown> = {
        notes_for_history: "Updated from invoice item mapping panel",
      };
      if (trimmedFormula) {
        payload.unit_price_formula = trimmedFormula;
        payload.unit_price_formula_note = mappingCostFormulaNoteInput.trim();
        if (numericPrice != null && Number.isFinite(numericPrice)) payload.unit_price = numericPrice;
      } else {
        payload.unit_price = numericPrice;
        payload.unit_price_formula = "";
        payload.unit_price_formula_note = "";
      }
      const res = await costJson<{ item?: IngredientDetail }>(`/api/cost/ingredients/${ingredientId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      const nextDetail = res?.item
        ? {
            ...res.item,
            id: String(res.item.id || ingredientId),
            category: String(res.item.category || ""),
            name: String(res.item.name || ""),
            unit: String(res.item.unit || ""),
            unit_price: Number(res.item.unit_price || 0),
            unit_price_formula: String(res.item.unit_price_formula || ""),
            unit_price_formula_note: String(res.item.unit_price_formula_note || ""),
            buffer_rate: Number(res.item.buffer_rate || 1.15),
            yield_rate: normalizeRateValue(res.item.yield_rate),
            notes: String(res.item.notes || ""),
            city: String(res.item.city || city),
            supplier_prices: Array.isArray(res.item.supplier_prices)
              ? res.item.supplier_prices.map((row) => ({
                  id: String(row.id || ""),
                  supplier_id: String(row.supplier_id || ""),
                  supplier_name: String(row.supplier_name || ""),
                  purchase_unit: String(row.purchase_unit || ""),
                  purchase_qty: Number(row.purchase_qty || 0),
                  purchase_price: Number(row.purchase_price || 0),
                  unit_price: Number(row.unit_price || 0),
                  updated_by: String(row.updated_by || ""),
                  updated_at: String(row.updated_at || ""),
                }))
              : [],
          }
        : null;
      if (nextDetail) {
        setSelectedMappingIngredientDetail(nextDetail);
        setMappingCostPriceInput(String(Number(nextDetail.unit_price || 0)));
        setMappingCostFormulaInput(String(nextDetail.unit_price_formula || ""));
        setMappingCostFormulaNoteInput(String(nextDetail.unit_price_formula_note || ""));
        mappingCostInputsDirtyRef.current = false;
        applyIngredientDetailToLocalState(nextDetail);
      } else {
        await loadMappingIngredientDetail(ingredientId);
      }
    } catch (e: any) {
      setMappingCostSaveError(e?.message || String(e));
    } finally {
      setMappingCostSaving(false);
    }
  }, [
    applyIngredientDetailToLocalState,
    city,
    loadMappingIngredientDetail,
    mappingCostFormulaInput,
    mappingCostFormulaNoteInput,
    mappingCostPriceInput,
    selectedMappingIngredientId,
  ]);

  const selectMappingIngredientOption = useCallback(async (ingredient: IngredientRow) => {
    const nextId = String(ingredient.id || "");
    if (!nextId) return;
    setSelectedMappingIngredientId(nextId);
    setMappingIngredientSearch(String(ingredient.name || ""));
    setMappingIngredientUnit(String(ingredient.unit || ""));
    setMappingCreateIngredientError("");
    setSelectedMappingIngredientDetail(null);
    setMappingCostPriceInput("");
    setMappingCostFormulaInput("");
    setMappingCostFormulaNoteInput("");
    setMappingCostSaveError("");
    mappingCostInputsDirtyRef.current = false;
    await loadMappingIngredientDetail(nextId);
  }, [loadMappingIngredientDetail]);

  const createMappingIngredient = useCallback(async () => {
    const name = mappingNewIngredientName.trim();
    const category = mappingNewIngredientCategory.trim();
    const unit = mappingNewIngredientUnit.trim();
    if (!name || !category || !unit) {
      setMappingCreateIngredientError("Name / Category / Unit を入力してください。");
      return;
    }
    if (mappingNewIngredientExactMatch) {
      setMappingCreateIngredientError("同じ名前の食材が既にあります。下の候補から選択してください。");
      await selectMappingIngredientOption(mappingNewIngredientExactMatch);
      return;
    }
    try {
      setMappingCreateIngredientSaving(true);
      setMappingCreateIngredientError("");
      const res = await costJson<{ item?: IngredientRow }>("/api/cost/ingredients", {
        method: "POST",
        body: JSON.stringify({
          city,
          category,
          name,
          unit,
          unit_price: 0,
          unit_price_formula: "",
          unit_price_formula_note: "",
          buffer_rate: 1.15,
          yield_rate: null,
          notes: "Created from invoice item mapping panel",
        }),
      });
      await loadIngredients();
      const nextId = String(res?.item?.id || "");
      setSelectedMappingIngredientId(nextId);
      setMappingIngredientSearch(name);
      setMappingIngredientUnit(unit);
      setMappingNewIngredientName("");
      setMappingNewIngredientUnit(unit);
      if (nextId) {
        await loadMappingIngredientDetail(nextId);
      }
    } catch (e: any) {
      setMappingCreateIngredientError(e?.message || String(e));
    } finally {
      setMappingCreateIngredientSaving(false);
    }
  }, [
    city,
    loadIngredients,
    loadMappingIngredientDetail,
    mappingNewIngredientExactMatch,
    mappingNewIngredientCategory,
    mappingNewIngredientName,
    mappingNewIngredientUnit,
    selectMappingIngredientOption,
  ]);

  const disableInvoiceItemMapping = useCallback(async (mappingId: string) => {
    try {
      setInvoiceMappingSaving(true);
      await costJson(`/api/admin/cost/invoice-item-mappings/${mappingId}/disable`, {
        method: "PATCH",
      });
      await loadInvoiceMappingData();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setInvoiceMappingSaving(false);
    }
  }, [loadInvoiceMappingData]);

  useEffect(() => {
    if (activeSheet !== INGREDIENT_SHEET || !highlightedIngredientId) return;
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

  const updateNewItemIngredient = (key: string, field: "ingredient_id" | "quantity", value: string) => {
    setNewItemIngredients((prev) => prev.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
  };

  const removeNewItemIngredient = (key: string) => {
    setNewItemIngredients((prev) => {
      const next = prev.filter((row) => row.key !== key);
      return next.length ? next : [createRecipeIngredientDraft()];
    });
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
    if (!editingCell || activeSheet === INGREDIENT_SHEET) return;
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

    if (activeSheet === INGREDIENT_SHEET) {
      const rowId = String(visibleRow.id);
      const nextBufferRate = col === "buffer_rate" ? Math.max(0.01, Math.min(9.99, normalizeNumber(nextRawValue) / 100)) : undefined;
      const nextYieldRate = col === "yield_rate"
        ? (nextRawValue.trim() ? Math.max(0.01, Math.min(9.99, normalizeNumber(nextRawValue) / 100)) : null)
        : undefined;
      setIngredients((prev) =>
        prev.map((item) => {
          if (String(item.id) !== rowId) return item;
          const next: IngredientRow = { ...item, _dirty: true };
          if (col === "unit_price") next.unit_price = normalizeNumber(nextRawValue);
          else if (col === "buffer_rate") next.buffer_rate = nextBufferRate || item.buffer_rate;
          else if (col === "yield_rate") next.yield_rate = nextYieldRate ?? null;
          else (next as any)[col] = nextRawValue;
          return next;
        }),
      );
      if ((col === "buffer_rate" || col === "yield_rate") && !rowId.startsWith("new-")) {
        try {
          await costJson(`/api/cost/ingredients/${rowId}`, {
            method: "PATCH",
            body: JSON.stringify({
              ...(col === "buffer_rate" ? { buffer_rate: nextBufferRate } : {}),
              ...(col === "yield_rate" ? { yield_rate: nextYieldRate } : {}),
            }),
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
    if (activeSheet === INGREDIENT_SHEET) {
      setIngredients((prev) => [
        ...prev,
        {
          id: `new-ingredient-${Date.now()}`,
          category: ingredientCategoryFilter !== "all" ? ingredientCategoryFilter : "野菜",
          name: "",
          unit: "",
          unit_price: 0,
          unit_price_formula: "",
          unit_price_formula_note: "",
          buffer_rate: 1.15,
          yield_rate: null,
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
    if (activeSheet !== INGREDIENT_SHEET) return;
    setBusy(true);
    setError("");
    setImportMessage("");
    try {
      const dirty = ingredients.filter((row) => row._dirty || row._new);
      for (const row of dirty) {
        const payload = {
          category: row.category,
          name: row.name,
          unit: row.unit,
          unit_price: Number(row.unit_price || 0),
          unit_price_formula: String(row.unit_price_formula || ""),
          unit_price_formula_note: String(row.unit_price_formula_note || ""),
          buffer_rate: Number(row.buffer_rate || 1.15),
          yield_rate: row.yield_rate == null ? null : Number(row.yield_rate || 0),
          notes: row.notes,
        };
        if (row._new) {
          await costJson("/api/cost/ingredients", {
            method: "POST",
            body: JSON.stringify({ city, ...payload }),
          });
        } else {
          await costJson(`/api/cost/ingredients/${row.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          });
        }
      }
      await loadIngredients();
      setDirtyRows(new Set());
      setImportMessage(`${sheetName(activeSheet)} を保存しました。`);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const moveSelection = useCallback((nextRow: number, nextCol: string) => {
    const clampedRow = Math.max(0, Math.min(nextRow, Math.max(0, currentRows.length - 1)));
    setSelectedCell({ row: clampedRow, col: nextCol });
  }, [currentRows.length]);

  const handleGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const eventTarget = event.target as HTMLElement | null;
    if (
      eventTarget
      && (
        eventTarget.tagName === "INPUT"
        || eventTarget.tagName === "TEXTAREA"
        || eventTarget.tagName === "SELECT"
        || eventTarget.tagName === "BUTTON"
        || eventTarget.isContentEditable
      )
    ) {
      return;
    }
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
    <div className="h-[calc(100vh-3.5rem)] bg-[#070b14] text-zinc-100">
      <div className="flex h-full flex-col bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.08),_transparent_28%),linear-gradient(180deg,_#0a0f1c_0%,_#070b14_100%)]">
        <div className="border-b border-white/10 px-6 py-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.24em] text-sky-300/80">Admin Finance</div>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">Cost Calculation</h1>
              <p className="mt-2 text-sm text-zinc-400">Monitor ingredient costs, menu pricing, and category performance with a restaurant-grade control panel.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  <Database className="h-3.5 w-3.5 text-sky-300" />
                  Total Items
                </div>
                <div className="mt-3 text-2xl font-bold text-white">{ingredients.length}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  <LayoutGrid className="h-3.5 w-3.5 text-violet-300" />
                  Categories
                </div>
                <div className="mt-3 text-2xl font-bold text-white">{menuCategories.length}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  <Percent className="h-3.5 w-3.5 text-emerald-300" />
                  Avg Cost Ratio
                </div>
                <div className="mt-3 text-2xl font-bold text-white">{averageCostRatio == null ? "—" : `${(averageCostRatio * 100).toFixed(1)}%`}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-b border-white/10 bg-black/10 px-6 py-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div ref={searchRef} className="relative min-w-0 flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
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
                  placeholder={activeSheet === INGREDIENT_SHEET ? "Search ingredients..." : "Search menu items or ingredients..."}
                  className="w-full rounded-md border border-white/10 bg-white/[0.04] py-2.5 pl-10 pr-10 text-sm text-white outline-none transition focus:border-sky-500/50 focus:bg-white/[0.06]"
                />
                {searchText ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchText("");
                      setShowSuggestions(false);
                      setHighlightedIngredientId(null);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              {showSuggestions && activeSheet === INGREDIENT_SHEET && suggestions.length > 0 ? (
                <div className="absolute left-0 top-full z-50 mt-2 w-full max-w-md overflow-hidden rounded-xl border border-white/10 bg-[#111827] shadow-2xl shadow-black/40">
                  <div className="border-b border-white/5 px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    {suggestions.length} suggestions
                  </div>
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      className="group flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/[0.04]"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        setActiveSheet(INGREDIENT_SHEET);
                        setSearchText(suggestion.name);
                        setShowSuggestions(false);
                        setHighlightedIngredientId(suggestion.id);
                      }}
                    >
                      <div className="flex flex-col">
                        <span className="text-sm text-white group-hover:text-sky-200">
                          {highlightMatch(suggestion.name, searchText)}
                        </span>
                        <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{suggestion.category}</span>
                      </div>
                      <span className="text-sm font-mono text-sky-300">
                        {currencyCode} {Number(suggestion.unit_price).toFixed(4)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {activeSheet === INGREDIENT_SHEET ? (
                <select
                  value={ingredientCategoryFilter}
                  onChange={(e) => setIngredientCategoryFilter(e.target.value)}
                  className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-zinc-300 outline-none transition focus:border-sky-500/50"
                >
                  <option value="all">All Categories ({ingredients.length})</option>
                  {ingredientCategories.map((option) => (
                    <option key={option} value={option}>
                      {option} ({ingredients.filter((item) => item.category === option).length})
                    </option>
                  ))}
                </select>
              ) : null}
              {activeSheet === INGREDIENT_SHEET ? (
                <>
                  <button
                    className="inline-flex items-center gap-2 rounded-md border border-sky-500/30 bg-sky-500/15 px-3.5 py-2.5 text-sm font-medium text-sky-200 transition hover:bg-sky-500/25"
                    onClick={addRow}
                    type="button"
                  >
                    <Plus className="h-4 w-4" />
                    + 行を追加
                  </button>
                  <button
                    className="inline-flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/15 px-3.5 py-2.5 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => void saveActiveSheet()}
                    type="button"
                    disabled={busy}
                  >
                    <Save className="h-4 w-4" />
                    保存
                    <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs font-mono text-emerald-100">
                      {dirtyCount}
                    </span>
                  </button>
                </>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  if (!activeSpreadsheetUrl) return;
                  window.open(activeSpreadsheetUrl, "_blank", "noopener,noreferrer");
                }}
                disabled={!activeSpreadsheetUrl}
                className={cx(
                  "inline-flex items-center gap-2 rounded-md border px-3.5 py-2.5 text-sm font-medium transition",
                  activeSpreadsheetUrl
                    ? "border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08]"
                    : "cursor-not-allowed border-white/10 bg-white/[0.03] text-zinc-500",
                )}
              >
                <ExternalLink className="h-4 w-4" />
                Spreadsheet
              </button>
              <div className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-300">
                <Calculator className="h-4 w-4 text-violet-300" />
                <span>{cityLabel}</span>
                <select
                  value={city}
                  onChange={(e) => setCity(e.target.value === "manila" ? "manila" : "dubai")}
                  className="rounded-md border border-white/10 bg-[#0c1322] px-2 py-1 text-sm text-zinc-200 outline-none"
                >
                  <option value="dubai">Dubai</option>
                  <option value="manila">Manila</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="border-b border-white/10 bg-black/10 px-6 pt-2">
          <div className="flex items-end gap-1 overflow-x-auto border-b border-white/10">
            {sheets.map((sheet) => (
              <SheetTab
                key={sheet.key}
                name={sheet.name}
                active={sheet.key === activeSheet}
                onClick={() => setActiveSheet(sheet.key)}
              />
            ))}
            {showAddCategoryForm ? (
              <div className="mb-0.5 flex items-center gap-2 rounded-t-md border border-white/10 border-b-transparent bg-white/[0.04] px-3 py-2">
                <input
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void createMenuCategory();
                    }
                    if (e.key === "Escape") {
                      setShowAddCategoryForm(false);
                      setNewCategoryName("");
                    }
                  }}
                  placeholder="New category"
                  className="w-36 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
                />
                <button
                  type="button"
                  onClick={() => void createMenuCategory()}
                  className="rounded-md border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-200"
                >
                  Save
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddCategoryForm(true)}
                className="mb-0.5 inline-flex items-center gap-2 rounded-t-md border border-dashed border-white/10 border-b-transparent bg-white/[0.03] px-3 py-2 text-sm text-zinc-300 hover:bg-white/[0.05]"
              >
                <Plus className="h-4 w-4" />
                Add Category
              </button>
            )}
          </div>
        </div>

        {error ? (
          <div className="mx-6 mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
              <div>{error}</div>
            </div>
          </div>
        ) : null}
        {importMessage ? <div className="mx-6 mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{importMessage}</div> : null}

        <div
          ref={gridRef}
          tabIndex={0}
          onKeyDown={handleGridKeyDown}
          className="flex-1 overflow-auto px-6 py-4 outline-none"
        >
          {activeSheet === INGREDIENT_SHEET ? (
            <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <div className="rounded-2xl border border-white/10 bg-[#0a101c] p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">Invoice Item Mapping</div>
                    <div className="mt-1 text-xs text-zinc-500">Map unmatched invoice item names to ingredient master entries.</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {skippedUnmatchedInvoiceKeys.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => clearSkippedUnmatchedInvoiceItems()}
                        className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-xs text-zinc-200 transition hover:bg-white/[0.1]"
                        title="Show all skipped rows again in the list"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Restore skipped ({skippedUnmatchedInvoiceKeys.length})
                      </button>
                    ) : null}
                    {(invoiceMappingLoading || invoiceMappingSaving) ? <Loader2 className="h-4 w-4 animate-spin text-violet-300" /> : null}
                  </div>
                </div>
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="overflow-hidden rounded-xl border border-white/10">
                    <div className="grid grid-cols-[140px_minmax(0,1fr)_80px_110px] border-b border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                      <div>Supplier</div>
                      <div>Invoice Item</div>
                      <div>Unit</div>
                      <div className="text-right">Latest Price</div>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {unmatchedInvoiceItems.length === 0 ? (
                        <div className="px-3 py-6 text-sm text-zinc-500">No unmatched invoice items.</div>
                      ) : visibleUnmatchedInvoiceItems.length === 0 ? (
                        <div className="px-3 py-6 text-sm text-zinc-500">
                          All unmatched rows are hidden (skipped). Use &quot;Restore skipped&quot; above to show them again.
                        </div>
                      ) : visibleUnmatchedInvoiceItems.map((item, index) => {
                        const itemKey = unmatchedInvoiceItemKey(item);
                        const selected = itemKey === selectedUnmatchedItemKey;
                        return (
                          <button
                            key={`${itemKey}-${index}`}
                            type="button"
                            onClick={() => selectUnmatchedInvoiceItem(itemKey)}
                            className={cx(
                              "grid w-full grid-cols-[140px_minmax(0,1fr)_80px_110px] items-center gap-3 border-b border-white/5 px-3 py-3 text-left text-sm last:border-b-0",
                              selected ? "bg-sky-500/10" : "hover:bg-white/[0.04]",
                            )}
                          >
                            <div className="truncate text-zinc-300">{item.supplier_name || "—"}</div>
                            <div className="min-w-0">
                              <div className="truncate text-white">{item.item_description}</div>
                              <div className="mt-1 text-[10px] text-zinc-500">{item.line_count} lines · {item.invoice_count} invoices</div>
                            </div>
                            <div className="font-mono text-zinc-400">{item.unit || "—"}</div>
                            <div className="text-right font-mono text-zinc-200">{currencyCode} {Number(item.latest_unit_price || 0).toFixed(2)}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Selected Invoice Item</div>
                      <div className={cx(
                        "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]",
                        mappingMode === "edit" ? "border-amber-500/30 bg-amber-500/10 text-amber-200" : "border-sky-500/30 bg-sky-500/10 text-sky-200",
                      )}>
                        {mappingMode === "edit" ? "Edit Mode" : "Create Mode"}
                      </div>
                    </div>
                    {hasActiveMappingSelection ? (
                      <div className="space-y-3">
                        <div className="rounded-lg border border-white/10 bg-black/10 p-3 text-sm">
                          <div className="text-white">{activeMappingSelectionMeta.itemDescription}</div>
                          <div className="mt-1 text-xs text-zinc-500">
                            {activeMappingSelectionMeta.supplierName || "Unknown supplier"} · {activeMappingSelectionMeta.invoiceUnit || "—"}
                            {mappingMode === "create" ? ` · ${currencyCode} ${Number(activeMappingSelectionMeta.latestUnitPrice || 0).toFixed(2)}` : ""}
                          </div>
                          {mappingMode === "create" && (activeMappingSelectionMeta.lineCount > 0 || activeMappingSelectionMeta.invoiceCount > 0) ? (
                            <div className="mt-1 text-[10px] text-zinc-600">
                              {activeMappingSelectionMeta.lineCount} lines · {activeMappingSelectionMeta.invoiceCount} invoices
                            </div>
                          ) : null}
                        </div>

                        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                          <div className="mb-3 text-[10px] uppercase tracking-[0.16em] text-zinc-500">Mapping</div>
                          <div>
                            <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Ingredient Search</div>
                            <input
                              value={mappingIngredientSearch}
                              onChange={(e) => setMappingIngredientSearch(e.target.value)}
                              placeholder="Search ingredient"
                              className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-sky-500/50"
                            />
                          </div>
                          <div className="mt-3">
                            <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Ingredient</div>
                            <select
                              value={selectedMappingIngredientId}
                              onChange={(e) => {
                                const nextId = e.target.value;
                                const selectedIngredient = allIngredientOptions.find((option) => String(option.id) === String(nextId));
                                setSelectedMappingIngredientId(nextId);
                                setMappingIngredientUnit(selectedIngredient?.unit || "");
                                setSelectedMappingIngredientDetail(null);
                                setMappingCostPriceInput("");
                                setMappingCostFormulaInput("");
                                setMappingCostFormulaNoteInput("");
                                setMappingCostSaveError("");
                                mappingCostInputsDirtyRef.current = false;
                                if (selectedIngredient) {
                                  setMappingIngredientSearch(selectedIngredient.name || "");
                                }
                              }}
                              className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-200 outline-none focus:border-sky-500/50"
                            >
                              <option value="">Select ingredient</option>
                              {mappingIngredientOptions.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.name} ({option.category})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <div>
                              <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Ingredient Unit</div>
                              <input
                                value={mappingIngredientUnit}
                                onChange={(e) => setMappingIngredientUnit(e.target.value)}
                                className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-sky-500/50"
                              />
                            </div>
                            <div>
                              <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Conversion Rule</div>
                              <input
                                value={mappingConversionRule}
                                onChange={(e) => setMappingConversionRule(e.target.value)}
                                placeholder="e.g. KG->g / 1000"
                                className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-sky-500/50"
                              />
                            </div>
                          </div>
                          <div className="mt-3">
                            <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Notes</div>
                            <input
                              value={mappingNotes}
                              onChange={(e) => setMappingNotes(e.target.value)}
                              className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-sky-500/50"
                            />
                          </div>
                          {mappingSaveError ? (
                            <div className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                              {mappingSaveError}
                            </div>
                          ) : null}
                          <div className="mt-4 rounded-md border border-white/10 bg-black/10 p-3">
                            <div className="mb-3 text-[10px] uppercase tracking-[0.16em] text-zinc-500">Quick Create Ingredient</div>
                            <div className="grid gap-3">
                              <div>
                                <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Name</div>
                                <input
                                  value={mappingNewIngredientName}
                                  onChange={(e) => setMappingNewIngredientName(e.target.value)}
                                  placeholder="New ingredient name"
                                  className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-sky-500/50"
                                />
                              </div>
                              {mappingNewIngredientSuggestions.length ? (
                                <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-3">
                                  <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-amber-200">
                                    Existing Candidates
                                  </div>
                                  <div className="space-y-2">
                                    {mappingNewIngredientSuggestions.map((option) => {
                                      const isExact = String(option.id) === String(mappingNewIngredientExactMatch?.id || "");
                                      return (
                                        <button
                                          key={option.id}
                                          type="button"
                                          onClick={() => void selectMappingIngredientOption(option)}
                                          className={cx(
                                            "flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition",
                                            isExact
                                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15"
                                              : "border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08]",
                                          )}
                                        >
                                          <span>{option.name}</span>
                                          <span className="text-xs text-zinc-400">{option.category} · {option.unit}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                  {mappingNewIngredientExactMatch ? (
                                    <div className="mt-2 text-xs text-amber-200">
                                      同じ名前の食材が既にあるため、新規作成ではなく既存食材を選択してください。
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                              <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                  <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Category</div>
                                  <select
                                    value={mappingNewIngredientCategory}
                                    onChange={(e) => setMappingNewIngredientCategory(e.target.value)}
                                    className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-200 outline-none focus:border-sky-500/50"
                                  >
                                    <option value="">Select category</option>
                                    {ingredientCategories.map((option) => (
                                      <option key={option} value={option}>
                                        {option}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Unit</div>
                                  <input
                                    value={mappingNewIngredientUnit}
                                    onChange={(e) => setMappingNewIngredientUnit(e.target.value)}
                                    placeholder="g / pc / ml"
                                    className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-sky-500/50"
                                  />
                                </div>
                              </div>
                              {mappingCreateIngredientError ? (
                                <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                                  {mappingCreateIngredientError}
                                </div>
                              ) : null}
                              <div className="flex justify-start">
                                <button
                                  type="button"
                                  onClick={() => void createMappingIngredient()}
                                  disabled={mappingCreateIngredientSaving || Boolean(mappingNewIngredientExactMatch)}
                                  className="inline-flex items-center justify-center gap-2 rounded-md border border-violet-500/30 bg-violet-500/15 px-3 py-2 text-sm font-medium text-violet-200 transition hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  <Plus className="h-4 w-4" />
                                  Create Ingredient
                                </button>
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void saveInvoiceItemMapping()}
                              disabled={!selectedMappingIngredientId || invoiceMappingSaving}
                              className="inline-flex items-center justify-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <Save className="h-4 w-4" />
                              Save Mapping
                            </button>
                            {mappingMode === "create" && activeCreateUnmatchedItemKey ? (
                              <button
                                type="button"
                                onClick={() => skipCurrentUnmatchedInvoiceItem()}
                                disabled={invoiceMappingSaving}
                                className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-500/30 bg-zinc-500/10 px-3 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                                title="Hide this row from the list (stored in this browser only)"
                              >
                                <SkipForward className="h-4 w-4" />
                                Skip
                              </button>
                            ) : null}
                            {mappingMode === "edit" ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const firstItem = visibleUnmatchedInvoiceItems[0];
                                  if (firstItem) {
                                    selectUnmatchedInvoiceItem(unmatchedInvoiceItemKey(firstItem));
                                  } else {
                                    setEditingInvoiceMappingId(null);
                                    setMappingMode("create");
                                    setMappingSourceSupplierName("");
                                    setMappingSourceItemDescription("");
                                    setMappingSourceInvoiceUnit("");
                                    setMappingIngredientSearch("");
                                    setSelectedMappingIngredientId("");
                                    setMappingIngredientUnit("");
                                    setMappingConversionRule("");
                                    setMappingNotes("");
                                    setMappingSaveError("");
                                    setSelectedMappingIngredientDetail(null);
                                    setMappingCostPriceInput("");
                                    setMappingCostFormulaInput("");
                                    setMappingCostFormulaNoteInput("");
                                    setMappingCostSaveError("");
                                  }
                                }}
                                className="inline-flex items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/[0.08]"
                              >
                                Reset To New
                              </button>
                            ) : null}
                          </div>
                        </div>

                        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Ingredient Cost</div>
                            {mappingDetailLoading ? <Loader2 className="h-4 w-4 animate-spin text-violet-300" /> : null}
                          </div>
                          {selectedMappingIngredientId ? (
                            <div className="space-y-3">
                              <div className="grid gap-3 sm:grid-cols-2">
                                <div className="rounded-md border border-white/10 bg-black/10 px-3 py-2">
                                  <div className="text-[10px] uppercase tracking-wide text-zinc-500">Current Unit Price</div>
                                  <div className="mt-1 font-mono text-sm text-white">
                                    {currencyCode} {Number(selectedMappingIngredientDetail?.unit_price || 0).toFixed(5)}
                                  </div>
                                </div>
                                <div className="rounded-md border border-white/10 bg-black/10 px-3 py-2">
                                  <div className="text-[10px] uppercase tracking-wide text-zinc-500">Latest Updated</div>
                                  <div className="mt-1 text-sm text-zinc-300">
                                    {selectedMappingIngredientDetail?.updated_at
                                      ? new Date(selectedMappingIngredientDetail.updated_at).toLocaleString("ja-JP")
                                      : "—"}
                                  </div>
                                </div>
                              </div>
                              <div className="rounded-md border border-white/10 bg-black/10 px-3 py-2">
                                <div className="text-[10px] uppercase tracking-wide text-zinc-500">Saved Formula</div>
                                <div className="mt-1 text-sm text-zinc-200">
                                  {selectedMappingIngredientDetail?.unit_price_formula || "—"}
                                </div>
                                {selectedMappingIngredientDetail?.unit_price_formula_note ? (
                                  <div className="mt-1 text-xs text-zinc-500">{selectedMappingIngredientDetail.unit_price_formula_note}</div>
                                ) : null}
                              </div>
                              <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                  <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Direct Unit Price</div>
                                  <input
                                    value={mappingCostPriceInput}
                                    onChange={(e) => {
                                      setMappingCostPriceInput(e.target.value);
                                      mappingCostInputsDirtyRef.current = true;
                                    }}
                                    placeholder="0.07475"
                                    className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-sky-500/50"
                                  />
                                </div>
                                <div>
                                  <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Cost Formula</div>
                                  <input
                                    value={mappingCostFormulaInput}
                                    onChange={(e) => {
                                      setMappingCostFormulaInput(e.target.value);
                                      mappingCostInputsDirtyRef.current = true;
                                    }}
                                    placeholder="65 / 1000 * 1.15"
                                    className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-sky-500/50"
                                  />
                                </div>
                              </div>
                              <div>
                                <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Formula Note / Calculation Basis</div>
                                <input
                                  value={mappingCostFormulaNoteInput}
                                  onChange={(e) => {
                                    setMappingCostFormulaNoteInput(e.target.value);
                                    mappingCostInputsDirtyRef.current = true;
                                  }}
                                  placeholder="65 AED/kg with 15% buffer"
                                  className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-sky-500/50"
                                />
                              </div>
                              {mappingCostSaveError ? (
                                <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                                  {mappingCostSaveError}
                                </div>
                              ) : null}
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => void saveMappingIngredientCost()}
                                  disabled={mappingCostSaving || mappingDetailLoading}
                                  className="inline-flex items-center justify-center gap-2 rounded-md border border-sky-500/30 bg-sky-500/15 px-3 py-2 text-sm font-medium text-sky-200 transition hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  <Save className="h-4 w-4" />
                                  Save Ingredient Cost
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMappingCostPriceInput(String(Number(selectedMappingIngredientDetail?.unit_price || 0)));
                                    setMappingCostFormulaInput(String(selectedMappingIngredientDetail?.unit_price_formula || ""));
                                    setMappingCostFormulaNoteInput(String(selectedMappingIngredientDetail?.unit_price_formula_note || ""));
                                    setMappingCostSaveError("");
                                    mappingCostInputsDirtyRef.current = false;
                                  }}
                                  disabled={!selectedMappingIngredientDetail}
                                  className="inline-flex items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Reset Cost
                                </button>
                              </div>
                              <div className="rounded-md border border-white/10 bg-black/10">
                                <div className="border-b border-white/10 px-3 py-2 text-[10px] uppercase tracking-wide text-zinc-500">
                                  Supplier Reference Prices
                                </div>
                                {selectedMappingIngredientDetail?.supplier_prices?.length ? (
                                  <div className="max-h-48 overflow-y-auto">
                                    {selectedMappingIngredientDetail.supplier_prices.map((price) => (
                                      <div key={price.id} className="border-b border-white/5 px-3 py-2 text-xs last:border-b-0">
                                        <div className="text-zinc-200">{price.supplier_name || "Unknown supplier"}</div>
                                        <div className="mt-1 text-zinc-500">
                                          {Number(price.purchase_qty || 0).toFixed(2)} {price.purchase_unit || "—"} · {currencyCode} {Number(price.purchase_price || 0).toFixed(2)}
                                        </div>
                                        <div className="mt-1 font-mono text-zinc-400">
                                          Converted: {currencyCode} {Number(price.unit_price || 0).toFixed(5)}
                                        </div>
                                        <div className="mt-1 text-zinc-600">
                                          {price.updated_at ? new Date(price.updated_at).toLocaleString("ja-JP") : "—"}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="px-3 py-3 text-sm text-zinc-500">No supplier reference prices.</div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-md border border-white/10 bg-black/10 px-3 py-4 text-sm text-zinc-500">
                              Select an ingredient to edit its unit cost in this panel.
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-6 text-sm text-zinc-500">
                        Select an unmatched invoice item to create a mapping.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#0a101c] p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">Existing Mappings</div>
                    <div className="mt-1 text-xs text-zinc-500">Active manual mappings for this city.</div>
                  </div>
                  <div className="text-xs font-mono text-zinc-500">{invoiceMappings.length}</div>
                </div>
                <div className="max-h-[26rem] overflow-y-auto rounded-xl border border-white/10">
                  {invoiceMappings.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-zinc-500">No mappings yet.</div>
                  ) : invoiceMappings.map((mapping) => (
                    <div
                      key={mapping.id}
                      className={cx(
                        "border-b border-white/5 px-4 py-3 last:border-b-0",
                        editingInvoiceMappingId === mapping.id ? "bg-sky-500/10" : "",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm text-white">{mapping.invoice_item_description}</div>
                          <div className="mt-1 text-xs text-zinc-500">
                            {mapping.supplier_name || "Unknown supplier"} · {mapping.invoice_unit || "—"} -&gt; {mapping.ingredient_name_snapshot || "—"} ({mapping.ingredient_unit || "—"})
                          </div>
                          {mapping.conversion_rule || mapping.notes ? (
                            <div className="mt-1 text-[11px] text-zinc-400">
                              {[mapping.conversion_rule, mapping.notes].filter(Boolean).join(" · ")}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => startEditingInvoiceMapping(mapping)}
                            disabled={invoiceMappingSaving || mappingCostSaving}
                            className="inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-xs text-sky-200 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void disableInvoiceItemMapping(mapping.id)}
                            disabled={invoiceMappingSaving}
                            className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs text-red-200 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Disable
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {activeSheet === INGREDIENT_SHEET && loading ? (
            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-6 animate-pulse">
              <div className="h-10 rounded-lg bg-white/[0.05]" />
              <div className="h-12 rounded-lg bg-white/[0.04]" />
              <div className="h-12 rounded-lg bg-white/[0.03]" />
              <div className="h-12 rounded-lg bg-white/[0.04]" />
            </div>
          ) : activeSheet === INGREDIENT_SHEET && filteredIngredientRows.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] text-sm text-zinc-500">
              <Database className="h-8 w-8 text-zinc-700" />
              <p>食材データがありません</p>
            </div>
          ) : activeSheet !== INGREDIENT_SHEET ? (
            <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-white">{sheetName(activeSheet)}</div>
                  <div className="mt-1 text-sm text-zinc-500">Click a menu name to open and edit its recipe.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddItemForm((prev) => !prev)}
                  className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-white/[0.08]"
                >
                  <Plus className="h-4 w-4" />
                  + Add Item
                </button>
              </div>

              {showAddItemForm ? (
                <div className="mb-5 rounded-2xl border border-white/10 bg-[#0c1322] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                  <div className="mb-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_180px]">
                    <div>
                      <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Item Name</div>
                      <input
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                        className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none focus:border-sky-500/50"
                      />
                    </div>
                    <div>
                      <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Category</div>
                      <select
                        value={newItemCategory}
                        onChange={(e) => setNewItemCategory(e.target.value)}
                        className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-zinc-300 outline-none focus:border-sky-500/50"
                      >
                        <option value="">Select category</option>
                        {menuCategories.map((item) => (
                          <option key={item.category} value={item.category}>
                            {item.category}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">{`Selling Price (${currencyCode})`}</div>
                      <input
                        type="number"
                        value={newItemPrice}
                        onChange={(e) => setNewItemPrice(e.target.value)}
                        className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm font-mono text-white outline-none focus:border-sky-500/50"
                      />
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0a101c]">
                    <div className="grid grid-cols-[minmax(0,1fr)_120px_100px_40px] border-b border-white/10 bg-white/[0.03] px-4 py-3 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
                      <div>Ingredient</div>
                      <div className="text-right">Quantity</div>
                      <div className="text-right">Unit Cost</div>
                      <div />
                    </div>
                    {newItemIngredients.map((row) => {
                      const ingredient = allIngredientOptions.find((item) => String(item.id) === String(row.ingredient_id));
                      return (
                        <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_120px_100px_40px] items-center gap-3 border-b border-white/5 px-4 py-3 last:border-b-0 odd:bg-white/[0.01]">
                          <select
                            value={row.ingredient_id}
                            onChange={(e) => updateNewItemIngredient(row.key, "ingredient_id", e.target.value)}
                            className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-sky-500/50"
                          >
                            <option value="">Select ingredient</option>
                            {allIngredientOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name} ({option.category})
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            value={row.quantity}
                            onChange={(e) => updateNewItemIngredient(row.key, "quantity", e.target.value)}
                            className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-right text-sm font-mono text-white outline-none focus:border-sky-500/50"
                            placeholder="g / pc"
                          />
                          <div className="text-right font-mono text-sm text-zinc-300">
                            {ingredient ? Number(ingredient.unit_price || 0).toFixed(4) : "—"}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeNewItemIngredient(row.key)}
                            className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08] hover:text-white"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setNewItemIngredients((prev) => [...prev, createRecipeIngredientDraft()])}
                      className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-200 hover:bg-white/[0.08]"
                    >
                      <Plus className="mr-1 inline h-3.5 w-3.5" />
                      Add Ingredient
                    </button>
                    <div className="ml-auto flex flex-wrap items-center gap-4 text-sm">
                      <div className="text-zinc-400">
                        Total Cost: <span className="font-mono text-white">{currencyCode} {newItemPreview.total_cost.toFixed(2)}</span>
                      </div>
                      <div className="text-zinc-400">
                        Cost Ratio:{" "}
                        <span className={cx(
                          "rounded-full border px-2.5 py-1 font-mono",
                          newItemPreview.cost_ratio == null
                            ? "border-white/10 bg-white/[0.04] text-zinc-500"
                            : newItemPreview.cost_ratio < 0.3
                              ? "border-emerald-500/30 bg-emerald-500/12 text-emerald-300"
                              : newItemPreview.cost_ratio <= 0.4
                                ? "border-amber-500/30 bg-amber-500/12 text-amber-300"
                                : "border-red-500/30 bg-red-500/12 text-red-300",
                        )}>
                          {newItemPreview.cost_ratio == null ? "—" : `${(newItemPreview.cost_ratio * 100).toFixed(1)}%`}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => void createRecipeMenuItem()}
                      className="rounded-md border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-500/25"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddItemForm(false);
                        setNewItemName("");
                        setNewItemPrice("");
                        setNewItemIngredients([createRecipeIngredientDraft()]);
                      }}
                      className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-300 hover:bg-white/[0.08]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}

              {recipeLoading ? (
                <div className="space-y-3 rounded-2xl border border-white/10 bg-[#0c1322] p-5 animate-pulse">
                  <div className="h-12 rounded-xl bg-white/[0.05]" />
                  <div className="h-12 rounded-xl bg-white/[0.04]" />
                  <div className="h-12 rounded-xl bg-white/[0.03]" />
                </div>
              ) : (
                <div className="overflow-auto rounded-2xl border border-white/10 bg-[#0a101c]">
                  <table className="min-w-full border-separate border-spacing-0 text-sm">
                    <thead>
                      <tr className="bg-white/[0.04]">
                        <th className="border-b border-r border-white/10 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Item Name</th>
                        <th className="border-b border-r border-white/10 px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{`Selling Price (${currencyCode})`}</th>
                        <th className="border-b border-r border-white/10 px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{`Total Cost (${currencyCode})`}</th>
                        <th className="border-b border-white/10 px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Cost Ratio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRecipeMenuItems.map((item, index) => {
                        const isExpanded = expandedMenuItemId === item.id;
                        const detail = menuDetails[item.id];
                        const rowTotal = detail ? detail.total_cost : item.total_cost;
                        const rowRatio = detail ? detail.cost_ratio : item.cost_ratio;
                        const rowPrice = detail ? detail.selling_price : item.selling_price;
                        const draft = menuDraftLine[item.id] || createRecipeIngredientDraft();
                        return (
                          <Fragment key={item.id}>
                            <tr
                              key={`summary-${item.id}`}
                              className={cx(index % 2 === 0 ? "bg-white/[0.02]" : "bg-transparent", "transition-colors hover:bg-white/[0.05]")}
                            >
                              <td className="border-r border-white/10 px-4 py-3 text-white">
                                <button
                                  type="button"
                                  onClick={() => void toggleMenuDetail(item.id)}
                                  className="inline-flex items-center gap-2 text-left font-medium text-white hover:text-sky-300"
                                >
                                  {isExpanded ? <ChevronDown className="h-4 w-4 text-violet-300" /> : <ChevronRight className="h-4 w-4 text-zinc-500" />}
                                  <span>{item.name}</span>
                                </button>
                              </td>
                              <td className="border-r border-white/10 px-4 py-3 text-right">
                                {editingMenuItemId === item.id ? (
                                  <div className="flex flex-col items-end gap-2">
                                    <input
                                      autoFocus
                                      type="number"
                                      value={editingMenuPrice}
                                      onChange={(e) => setEditingMenuPrice(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Escape") {
                                          setEditingMenuItemId(null);
                                          setEditingMenuPrice("");
                                        }
                                      }}
                                      className="w-28 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-right text-sm font-mono text-white outline-none"
                                    />
                                    <div className="flex justify-end gap-2">
                                      <button
                                        type="button"
                                        onClick={() => void saveRecipeMenuItemPrice(item.id, editingMenuPrice)}
                                        className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-200 hover:bg-emerald-500/25"
                                      >
                                        <Save className="h-3.5 w-3.5" />
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingMenuItemId(null);
                                          setEditingMenuPrice("");
                                        }}
                                        className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-zinc-300 hover:bg-white/[0.08]"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingMenuItemId(item.id);
                                      setEditingMenuPrice(String(rowPrice || 0));
                                    }}
                                    className="font-mono text-base font-semibold text-white hover:text-sky-300"
                                  >
                                    {currencyCode} {Number(rowPrice || 0).toFixed(2)}
                                  </button>
                                )}
                              </td>
                              <td className="border-r border-white/10 px-4 py-3 text-right font-mono text-zinc-200">
                                {currencyCode} {Number(rowTotal || 0).toFixed(2)}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={cx("inline-flex min-w-[84px] items-center justify-center rounded-full border px-3 py-1 font-mono text-xs font-semibold", costRatioBadgeClass(rowPrice ? Number(rowRatio || 0) : null))}>
                                  {rowPrice ? `${(Number(rowRatio || 0) * 100).toFixed(1)}%` : "—"}
                                </span>
                              </td>
                            </tr>
                            {isExpanded ? (
                              <tr key={`detail-${item.id}`} className="bg-[#0d101b]">
                                <td colSpan={4} className="border-t border-white/5 px-4 py-4">
                                  {menuDetailLoadingId === item.id && !detail ? (
                                    <div className="flex items-center gap-2 text-sm text-zinc-500">
                                      <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
                                      Recipe details loading...
                                    </div>
                                  ) : detail ? (
                                    <div className="space-y-4">
                                      <div className="grid gap-3 md:grid-cols-[220px_220px_220px_1fr]">
                                        <div>
                                          <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Category</div>
                                          <select
                                            value={detail.category}
                                            onChange={(e) => updateMenuDetailLocal(item.id, (current) => ({ ...current, category: e.target.value }))}
                                            onBlur={() => void saveMenuCategory(item.id, menuDetails[item.id]?.category ?? detail.category)}
                                            className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-violet-500/50"
                                          >
                                            {menuCategories.map((categoryItem) => (
                                              <option key={categoryItem.category} value={categoryItem.category}>
                                                {categoryItem.category}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                        <div>
                                          <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Selling Price</div>
                                          <div className="flex gap-2">
                                            <input
                                              type="number"
                                              value={detail.selling_price}
                                              onChange={(e) => updateMenuDetailLocal(item.id, (current) => ({ ...current, selling_price: normalizeNumber(e.target.value) }))}
                                              className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm font-mono text-white outline-none focus:border-violet-500/50"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => void saveRecipeMenuItemPrice(item.id, String(menuDetails[item.id]?.selling_price ?? detail.selling_price))}
                                              disabled={menuDetailSavingId === item.id}
                                              className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-xs font-medium text-emerald-200 transition-colors hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                              <Save className="h-3.5 w-3.5" />
                                              Save
                                            </button>
                                          </div>
                                        </div>
                                        <div className="rounded border border-white/10 bg-white/5 px-3 py-2">
                                          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Total Cost</div>
                                          <div className="mt-1 font-mono text-lg text-white">{currencyCode} {detail.total_cost.toFixed(2)}</div>
                                        </div>
                                        <div className="rounded border border-white/10 bg-white/5 px-3 py-2">
                                          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Cost Ratio</div>
                                          <div className={cx(
                                            "mt-1 font-mono text-lg",
                                            detail.cost_ratio == null
                                              ? "text-zinc-500"
                                              : detail.cost_ratio < 0.3
                                                ? "text-green-600"
                                                : detail.cost_ratio <= 0.4
                                                  ? "text-amber-500"
                                                  : "text-red-600",
                                          )}>
                                            {detail.cost_ratio == null ? "—" : `${(detail.cost_ratio * 100).toFixed(1)}%`}
                                          </div>
                                        </div>
                                      </div>

                                      <div className="overflow-hidden rounded border border-white/10">
                                        <div className="grid grid-cols-[minmax(0,1fr)_110px_90px_110px_44px] border-b border-white/5 bg-[#14182a] px-3 py-2 text-[10px] uppercase tracking-wide text-zinc-500">
                                          <div>Ingredient</div>
                                          <div className="text-right">Quantity</div>
                                          <div className="text-right">Unit</div>
                                          <div className="text-right">Line Cost</div>
                                          <div />
                                        </div>
                                        {detail.ingredients.map((ingredient) => (
                                          <div key={ingredient.id} className="grid grid-cols-[minmax(0,1fr)_110px_90px_110px_44px] items-center gap-2 border-b border-white/5 px-3 py-2 text-sm text-white last:border-b-0">
                                            <div>
                                              <div>{ingredient.ingredient_name}</div>
                                              <div className="text-[10px] text-zinc-500">
                                                {ingredient.ingredient_category} · Unit {ingredient.unit_price.toFixed(4)}
                                              </div>
                                            </div>
                                            <input
                                              type="number"
                                              value={ingredient.quantity}
                                              onChange={(e) => {
                                                const nextQuantity = normalizeNumber(e.target.value);
                                                updateMenuDetailLocal(item.id, (current) => ({
                                                  ...current,
                                                  ingredients: current.ingredients.map((row) => (
                                                    row.id === ingredient.id
                                                      ? { ...row, quantity: nextQuantity, raw_cost: nextQuantity * row.unit_price, cost: nextQuantity * row.unit_price }
                                                      : row
                                                  )),
                                                }));
                                              }}
                                              onBlur={() => void saveMenuIngredients(item.id)}
                                              onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                  e.preventDefault();
                                                  void saveMenuIngredients(item.id);
                                                }
                                              }}
                                              className="rounded border border-white/15 bg-white/5 px-2 py-1.5 text-right text-sm text-white outline-none focus:border-violet-500/50"
                                            />
                                            <div className="text-right font-mono text-zinc-400">{ingredient.unit}</div>
                                            <div className="text-right font-mono text-zinc-300">
                                              {currencyCode} {(ingredient.quantity * ingredient.unit_price).toFixed(2)}
                                            </div>
                                            <button
                                              type="button"
                                              onClick={() => void removeIngredientFromMenu(item.id, ingredient.ingredient_id)}
                                              className="flex h-8 w-8 items-center justify-center rounded border border-white/10 bg-white/5 text-zinc-500 hover:bg-white/10 hover:text-white"
                                            >
                                              <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                          </div>
                                        ))}
                                        <div className="grid grid-cols-[minmax(0,1fr)_110px_90px_110px_44px] items-center gap-2 bg-white/[0.03] px-3 py-3">
                                          <select
                                            value={draft.ingredient_id}
                                            onChange={(e) => setMenuDraftLine((prev) => ({ ...prev, [item.id]: { ...draft, ingredient_id: e.target.value } }))}
                                            className="rounded border border-white/15 bg-white/5 px-2 py-1.5 text-sm text-white outline-none focus:border-violet-500/50"
                                          >
                                            <option value="">Select ingredient</option>
                                            {allIngredientOptions.map((option) => (
                                              <option key={option.id} value={option.id}>
                                                {option.name} ({option.category})
                                              </option>
                                            ))}
                                          </select>
                                          <input
                                            type="number"
                                            value={draft.quantity}
                                            onChange={(e) => setMenuDraftLine((prev) => ({ ...prev, [item.id]: { ...draft, quantity: e.target.value } }))}
                                            className="rounded border border-white/15 bg-white/5 px-2 py-1.5 text-right text-sm text-white outline-none focus:border-violet-500/50"
                                            placeholder="g / pc"
                                          />
                                          <div className="text-right text-xs text-zinc-500">ingredient master</div>
                                          <div className="text-right text-xs text-zinc-500">
                                            {menuDetailSavingId === item.id ? "Saving..." : ""}
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => void addIngredientToMenu(item.id)}
                                            className="flex h-8 w-8 items-center justify-center rounded border border-violet-500/30 bg-violet-500/20 text-violet-300 hover:bg-violet-500/30"
                                          >
                                            <Plus className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      </div>

                                      <div className="rounded border border-white/10 bg-white/5 p-3">
                                        <div className="mb-2 flex items-center gap-2 text-sm text-zinc-300">
                                          <History className="h-4 w-4 text-violet-300" />
                                          Selling Price History
                                        </div>
                                        {detail.price_history.length === 0 ? (
                                          <div className="text-xs text-zinc-500">No history yet.</div>
                                        ) : (
                                          <div className="space-y-2">
                                            {detail.price_history.map((entry) => (
                                              <div key={entry.id} className="rounded border border-white/8 bg-black/10 px-3 py-2 text-xs">
                                                <div className="flex items-center justify-between gap-3">
                                                  <div className="font-mono text-white">{currencyCode} {entry.selling_price.toFixed(2)}</div>
                                                  {entry.previous_price != null ? (
                                                    <div className="font-mono text-zinc-500">Prev {currencyCode} {entry.previous_price.toFixed(2)}</div>
                                                  ) : null}
                                                </div>
                                                <div className="mt-1 text-zinc-500">
                                                  {entry.changed_at ? new Date(entry.changed_at).toLocaleString("ja-JP") : "-"}
                                                  {entry.changed_by ? ` · ${entry.changed_by}` : ""}
                                                </div>
                                                {entry.notes ? <div className="mt-1 text-zinc-400">{entry.notes}</div> : null}
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ) : null}
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })}
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
          <table className="min-w-max border-separate border-spacing-0 rounded-2xl border border-white/10 bg-[#0a101c]">
            <colgroup>
              {currentColumns.map((column) => (
                <col key={column.key} style={{ width: column.width }} />
              ))}
              {activeSheet === INGREDIENT_SHEET ? <col style={{ width: 36 }} /> : null}
            </colgroup>
            <thead className="sticky top-0 z-40 bg-[#131a2a] shadow-[0_1px_0_rgba(255,255,255,0.05)]">
              <tr>
                {currentColumns.map((column) => (
                  <th
                    key={column.key}
                    style={{
                      width: column.width,
                      left: column.key === "row_num" ? 0 : undefined,
                    }}
                    className={cx(
                      "h-12 border-b border-r border-white/10 bg-[#131a2a] px-4 align-middle text-left text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-300",
                      column.key === "row_num" && "sticky left-0 z-50 bg-[#131a2a] text-right",
                    )}
                  >
                    <span className="block leading-tight">{column.label}</span>
                  </th>
                ))}
                {activeSheet === INGREDIENT_SHEET ? (
                  <th className="sticky right-0 z-50 h-12 border-b border-l border-white/10 bg-[#131a2a] px-4 align-middle text-left text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-300">
                    <span className="block leading-tight">Actions</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {currentRows.map((row: any, rowIndex) => {
                const ingredientRow = row as IngredientRow;
                const recipeRow = row as RecipeRow;
                const ingredientGroupStart =
                  activeSheet === INGREDIENT_SHEET
                    && rowIndex > 0
                    && filteredIngredientRows[rowIndex - 1]?.category !== ingredientRow.category;
                const recipeGroup = activeSheet === INGREDIENT_SHEET ? null : recipeStats.get(recipeRow.menu_name || `row-${rowIndex}`);
                const recipeGroupStart =
                  activeSheet !== INGREDIENT_SHEET
                    && rowIndex > 0
                    && filteredRecipeRows[rowIndex - 1]?.menu_name !== recipeRow.menu_name;
                const recipeGroupEnd =
                  activeSheet !== INGREDIENT_SHEET
                    && recipeGroup?.end === rowIndex;

                return (
                  <tr
                    key={`${row.id}-${rowIndex}`}
                    data-ingredient-id={activeSheet === INGREDIENT_SHEET ? String(ingredientRow.id) : undefined}
                    className={cx(
                      "group transition-colors",
                      rowIndex % 2 === 0 ? "bg-white/[0.02]" : "bg-transparent",
                      "hover:bg-white/[0.05]",
                      activeSheet === INGREDIENT_SHEET && highlightedIngredientId === String(ingredientRow.id) && "bg-violet-500/10",
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
                              "relative border-r border-white/10 bg-sky-500/10 p-0",
                              column.key === "row_num" && "sticky left-0 z-10 bg-[#101726]",
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
                                "px-4 py-3 text-sm",
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
                            "cursor-cell select-none overflow-hidden border-r border-white/10 px-4 py-3 text-sm whitespace-nowrap text-ellipsis",
                            isSelected && "bg-sky-500/8 outline outline-1 outline-sky-400 outline-offset-[-1px]",
                            column.key === "row_num" && "sticky left-0 z-10 bg-[#101726] pr-4 text-right text-zinc-600",
                            isFormula && formulaColor,
                            column.key === "total_cost" && recipeGroupEnd && "font-semibold",
                            column.key === "cost_ratio" && recipeGroupEnd && "font-semibold",
                          )}
                          onClick={() => {
                            if (activeSheet === INGREDIENT_SHEET && (column.key === "buffer_rate" || column.key === "yield_rate")) {
                              startEdit(
                                rowIndex,
                                column.key,
                                column.key === "buffer_rate"
                                  ? String(Math.round(Number((ingredientRow as any).buffer_rate || 1.15) * 100))
                                  : (ingredientRow as any).yield_rate == null
                                    ? ""
                                    : String(Math.round(Number((ingredientRow as any).yield_rate || 0) * 100)),
                              );
                              return;
                            }
                            selectCell(rowIndex, column.key);
                            if (activeSheet === INGREDIENT_SHEET && (column.key === "unit_price" || column.key === "name")) {
                              void openIngredientDetail(ingredientRow);
                            }
                          }}
                          onDoubleClick={() => startEdit(rowIndex, column.key)}
                        >
                          {column.key === "row_num" ? (
                            <div className="flex items-center justify-end gap-1">
                              {dirtyIndicator ? <span className="h-1.5 w-1.5 rounded-full bg-sky-400" /> : null}
                              <span>{rowIndex + 1}</span>
                            </div>
                          ) : activeSheet === INGREDIENT_SHEET && column.key === "category" ? (
                            <span className="inline-flex rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-200">
                              {String(value ?? "")}
                            </span>
                          ) : activeSheet === INGREDIENT_SHEET && column.key === "name" ? (
                            <div className="flex items-center gap-2">
                              <span>{String(value ?? "")}</span>
                              {!hasYieldRate((ingredientRow as any).yield_rate) ? (
                                <span className="inline-flex rounded-full border border-red-500/30 bg-red-500/12 px-2 py-0.5 text-[10px] font-semibold text-red-300">
                                  歩留未設定
                                </span>
                              ) : null}
                            </div>
                          ) : activeSheet === INGREDIENT_SHEET && column.key === "buffer_rate" ? (
                            <span className={cx("inline-flex rounded-full border px-2.5 py-1 text-xs font-mono font-semibold", bufferBadgeClass(Number((ingredientRow as any).buffer_rate || 1.15)))}>
                              {formatRatePercent(Number((ingredientRow as any).buffer_rate || 1.15))}
                            </span>
                          ) : activeSheet === INGREDIENT_SHEET && column.key === "yield_rate" ? (
                            <span className={cx("inline-flex rounded-full border px-2.5 py-1 text-xs font-mono font-semibold", yieldBadgeClass(normalizeRateValue((ingredientRow as any).yield_rate)))}>
                              {formatRatePercent(normalizeRateValue((ingredientRow as any).yield_rate), "未設定")}
                            </span>
                          ) : column.key === "cost_ratio" && value !== "" ? (
                            <span className={cx("inline-flex rounded-full border px-2.5 py-1 text-xs font-mono font-semibold", costRatioBadgeClass(Number(value || 0)))}>
                              {(Number(value || 0) * 100).toFixed(1)}%
                            </span>
                          ) : activeSheet !== INGREDIENT_SHEET && column.key === "selling_price" ? (
                            <span className="font-mono font-semibold text-white">
                              {value === "" ? "—" : `${currencyCode} ${formatCellNumber(value)}`}
                            </span>
                          ) : column.type === "number" || column.type === "formula" || column.type === "subtotal" ? (
                            value === "" ? "" : formatCellNumber(value)
                          ) : (
                            String(value ?? "")
                          )}
                        </td>
                      );
                    })}
                    {activeSheet === INGREDIENT_SHEET ? (
                      <td className="sticky right-0 w-8 border-l border-white/10 bg-inherit opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => void openIngredientDetail(ingredientRow)}
                          title="詳細を見る"
                          className="flex h-full w-full items-center justify-center text-zinc-500 hover:text-sky-300"
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

        {selectedIngredientDetail ? (
          <div className="fixed inset-0 z-40" onClick={() => setSelectedIngredientDetail(null)}>
            <div
              className="absolute right-0 top-0 flex h-full w-[28rem] flex-col overflow-hidden border-l border-violet-500/20 bg-[#0f0f1e] shadow-2xl"
              onClick={(event) => event.stopPropagation()}
              style={{ animation: "slideInRight 0.2s ease-out" }}
            >
              <div className="flex items-center justify-between border-b border-white/8 bg-[#13103d] p-4">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500">Ingredient Detail</p>
                  <p className="mt-0.5 text-sm font-semibold text-white">{selectedIngredientDetail.name}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="text-xs text-zinc-400">{selectedIngredientDetail.category} · {selectedIngredientDetail.unit}</p>
                    {!hasYieldRate(selectedIngredientDetail.yield_rate) ? (
                      <span className="inline-flex rounded-full border border-red-500/30 bg-red-500/12 px-2 py-0.5 text-[10px] font-semibold text-red-300">
                        歩留未設定
                      </span>
                    ) : null}
                  </div>
                </div>
                <button onClick={() => setSelectedIngredientDetail(null)} className="text-zinc-500 hover:text-white" type="button">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 border-b border-white/5 p-4">
                <div className="rounded border border-white/8 bg-white/4 p-3">
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Cost Unit Price</p>
                  <p className="text-xl font-bold font-mono text-violet-300">
                    {currencyCode} {Number(selectedIngredientDetail.unit_price).toFixed(4)}
                  </p>
                </div>
                <div className="rounded border border-white/8 bg-white/4 p-3">
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Buffer</p>
                  <p className="text-xl font-bold font-mono text-white">
                    {formatRatePercent(Number(selectedIngredientDetail.buffer_rate || 1.15))}
                  </p>
                </div>
                <div className="rounded border border-white/8 bg-white/4 p-3">
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Yield</p>
                  <p className="text-xl font-bold font-mono text-white">
                    {formatRatePercent(normalizeRateValue(selectedIngredientDetail.yield_rate), "未設定")}
                  </p>
                </div>
                <div className="rounded border border-white/8 bg-white/4 p-3">
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Supplier</p>
                  <p className="text-sm text-white">{selectedIngredientDetail.supplier_name || "-"}</p>
                </div>
                <div className="rounded border border-white/8 bg-white/4 p-3">
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Updated</p>
                  <p className="text-sm text-white">
                    {selectedIngredientDetail.updated_at ? new Date(selectedIngredientDetail.updated_at).toLocaleString("ja-JP") : "-"}
                  </p>
                </div>
                <div className="col-span-2 rounded border border-white/8 bg-white/4 p-3">
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Notes</p>
                  <p className="text-sm text-zinc-300">{selectedIngredientDetail.notes || "-"}</p>
                </div>
                <div className="col-span-2 rounded border border-white/8 bg-white/4 p-3">
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Saved Cost Formula</p>
                  <p className="font-mono text-sm text-white">{selectedIngredientDetail.unit_price_formula || "-"}</p>
                  {selectedIngredientDetail.unit_price_formula_note ? (
                    <p className="mt-1 text-xs text-zinc-400">{selectedIngredientDetail.unit_price_formula_note}</p>
                  ) : null}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <div className="mb-4">
                  <p className="mb-3 text-[10px] uppercase tracking-wider text-zinc-500">Supplier Prices</p>
                  {!selectedIngredientDetail.supplier_prices?.length ? (
                    <p className="rounded border border-white/6 bg-white/3 px-3 py-3 text-xs text-zinc-500">仕入先単価はありません</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedIngredientDetail.supplier_prices.map((entry) => (
                        <div key={entry.id} className="rounded-lg border border-white/6 bg-white/3 p-3 text-xs">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-white">{entry.supplier_name || "-"}</p>
                              <p className="mt-0.5 text-zinc-500">
                                {entry.purchase_qty} {entry.purchase_unit || "-"} / {currencyCode} {entry.purchase_price.toFixed(2)}
                              </p>
                            </div>
                            <div className="text-right font-mono text-violet-300">
                              {currencyCode} {entry.unit_price.toFixed(4)}
                            </div>
                          </div>
                          <div className="mt-2 text-[10px] text-zinc-500">
                            {entry.updated_at ? new Date(entry.updated_at).toLocaleString("ja-JP") : "-"}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

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
                                {currencyCode} {Number(entry.unit_price).toFixed(4)}
                              </p>
                              {hasPrevious ? (
                                <p className="mt-0.5 text-[10px] text-zinc-500">
                                  前回: {currencyCode} {Number(entry.previous_price).toFixed(4)}
                                </p>
                              ) : null}
                              {entry.unit_price_formula ? (
                                <p className="mt-1 break-all rounded bg-white/3 px-2 py-1 text-[10px] font-mono text-zinc-400">
                                  Formula: {entry.unit_price_formula}
                                </p>
                              ) : null}
                              {entry.unit_price_formula_note ? (
                                <p className="mt-1 text-[10px] text-zinc-500">{entry.unit_price_formula_note}</p>
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
                <p className="mb-2 text-[10px] text-zinc-500">計算単価を更新</p>
                <div className="space-y-3">
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Direct Unit Price</p>
                    <input
                      type="number"
                      step="0.0001"
                      value={ingredientDetailPriceInput}
                      onChange={(e) => setIngredientDetailPriceInput(e.target.value)}
                      className="w-full rounded border border-white/15 bg-white/5 px-2 py-1.5 text-sm font-mono text-white focus:border-violet-500/50 focus:outline-none"
                      id="history-panel-price-input"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Buffer (%)</p>
                      <input
                        type="number"
                        step="0.01"
                        value={ingredientDetailBufferInput}
                        onChange={(e) => setIngredientDetailBufferInput(e.target.value)}
                        className="w-full rounded border border-white/15 bg-white/5 px-2 py-1.5 text-sm font-mono text-white focus:border-violet-500/50 focus:outline-none"
                      />
                    </div>
                    <div>
                      <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Yield (%)</p>
                      <input
                        type="number"
                        step="0.01"
                        value={ingredientDetailYieldInput}
                        onChange={(e) => setIngredientDetailYieldInput(e.target.value)}
                        placeholder="未設定"
                        className="w-full rounded border border-white/15 bg-white/5 px-2 py-1.5 text-sm font-mono text-white focus:border-violet-500/50 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Cost Formula</p>
                    <input
                      type="text"
                      value={ingredientDetailFormulaInput}
                      onChange={(e) => setIngredientDetailFormulaInput(e.target.value)}
                      placeholder="65 / 1000 * 1.15"
                      className="w-full rounded border border-white/15 bg-white/5 px-2 py-1.5 text-sm font-mono text-white focus:border-violet-500/50 focus:outline-none"
                    />
                    <p className="mt-1 text-[10px] text-zinc-500">四則演算と括弧のみ使えます。数式がある場合は、その計算結果を計算単価として保存します。</p>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Calculation Basis</p>
                    <input
                      type="text"
                      value={ingredientDetailFormulaNoteInput}
                      onChange={(e) => setIngredientDetailFormulaNoteInput(e.target.value)}
                      placeholder="67 AED/kg with 1.15 buffer"
                      className="w-full rounded border border-white/15 bg-white/5 px-2 py-1.5 text-sm text-white focus:border-violet-500/50 focus:outline-none"
                    />
                  </div>
                  {ingredientDetailSaveError ? (
                    <p className="rounded border border-red-500/20 bg-red-500/10 px-2 py-2 text-xs text-red-300">{ingredientDetailSaveError}</p>
                  ) : null}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!selectedIngredientDetail) return;
                        const trimmedFormula = ingredientDetailFormulaInput.trim();
                        const numericPrice = Number(ingredientDetailPriceInput);
                        const trimmedBuffer = ingredientDetailBufferInput.trim();
                        const trimmedYield = ingredientDetailYieldInput.trim();
                        const numericBuffer = Number(trimmedBuffer);
                        const numericYield = trimmedYield === "" ? null : Number(trimmedYield);
                        if (!trimmedFormula && !Number.isFinite(numericPrice)) {
                          setIngredientDetailSaveError("数値単価を入れるか、計算式を入力してください。");
                          return;
                        }
                        if (!Number.isFinite(numericBuffer) || numericBuffer <= 0) {
                          setIngredientDetailSaveError("Buffer は 0 より大きい数値で入力してください。");
                          return;
                        }
                        if (trimmedYield !== "" && (!Number.isFinite(numericYield) || Number(numericYield) <= 0)) {
                          setIngredientDetailSaveError("Yield を入れる場合は 0 より大きい数値で入力してください。");
                          return;
                        }
                        setIngredientDetailSaving(true);
                        setIngredientDetailSaveError("");
                        try {
                          const payload: Record<string, unknown> = {
                            notes_for_history: trimmedFormula ? "Ingredient cost formula updated from cost admin" : "Ingredient price updated from cost admin",
                            buffer_rate: numericBuffer / 100,
                            yield_rate: numericYield == null ? null : Number(numericYield) / 100,
                          };
                          if (trimmedFormula) {
                            payload.unit_price_formula = trimmedFormula;
                            payload.unit_price_formula_note = ingredientDetailFormulaNoteInput.trim();
                            if (Number.isFinite(numericPrice)) payload.unit_price = numericPrice;
                          } else {
                            payload.unit_price = numericPrice;
                            payload.unit_price_formula = "";
                            payload.unit_price_formula_note = "";
                          }
                          await costJson(`/api/cost/ingredients/${selectedIngredientDetail.id}`, {
                            method: "PATCH",
                            body: JSON.stringify(payload),
                          });
                          await loadIngredients();
                          void openIngredientDetail(selectedIngredientDetail);
                        } catch (e: any) {
                          setIngredientDetailSaveError(e?.message || String(e));
                        } finally {
                          setIngredientDetailSaving(false);
                        }
                      }}
                      disabled={ingredientDetailSaving || ingredientDetailDeleting}
                      className="rounded border border-violet-500/30 bg-violet-500/20 px-3 py-1.5 text-xs text-violet-300 transition-colors hover:bg-violet-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {ingredientDetailSaving ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIngredientDetailPriceInput(String(Number(selectedIngredientDetail.unit_price || 0)));
                        setIngredientDetailBufferInput(String((Number(selectedIngredientDetail.buffer_rate || 1.15) * 100).toFixed(0)));
                        setIngredientDetailYieldInput(selectedIngredientDetail.yield_rate == null ? "" : String((Number(selectedIngredientDetail.yield_rate || 0) * 100).toFixed(0)));
                        setIngredientDetailFormulaInput(String(selectedIngredientDetail.unit_price_formula || ""));
                        setIngredientDetailFormulaNoteInput(String(selectedIngredientDetail.unit_price_formula_note || ""));
                        setIngredientDetailSaveError("");
                      }}
                      disabled={ingredientDetailSaving || ingredientDetailDeleting}
                      className="rounded border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-white/10"
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteSelectedIngredient()}
                      disabled={ingredientDetailSaving || ingredientDetailDeleting}
                      className="ml-auto inline-flex items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {ingredientDetailDeleting ? "Deleting..." : "Delete"}
                    </button>
                  </div>
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
