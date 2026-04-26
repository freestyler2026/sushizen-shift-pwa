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
  yield_rate: number;
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

type CostSection = "ingredient" | "processed" | "product" | "draft" | "invoice";

type MasterComponentType = "ingredient" | "processed_item";

type MasterItemSummary = {
  id: string;
  city: string;
  category: string;
  name: string;
  description: string;
  selling_price: number;
  item_type: "processed" | "product" | "draft";
  source_type: string;
  status: string;
  display_order: number;
  output_unit: string;
  output_qty: number;
  buffer_rate: number;
  yield_rate: number | null;
  yield_configured: boolean;
  cost_unit_price: number;
  cost_unit_price_formula: string;
  cost_unit_price_formula_note: string;
  computed_unit_cost?: number;
  raw_cost: number;
  yield_adjusted_total: number;
  total_cost: number;
  unit_cost: number;
  cost_ratio: number | null;
  component_count: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

type MasterComponentDetail = {
  id: string;
  component_type: MasterComponentType;
  ingredient_id: string;
  component_menu_item_id: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  unit_cost: number;
  cost: number;
  sort_order: number;
  unit_price_formula?: string;
  unit_price_formula_note?: string;
  ingredient_detail_loaded?: boolean;
};

type MasterItemDetail = MasterItemSummary & {
  components: MasterComponentDetail[];
  price_history: MenuPriceHistoryEntry[];
};

type ComponentOption = {
  component_type: MasterComponentType;
  id: string;
  name: string;
  category: string;
  unit: string;
  unit_cost: number;
  item_type?: "processed" | "product" | "draft";
};

type MasterEditorDraft = {
  id: string;
  city: string;
  category: string;
  name: string;
  description: string;
  item_type: "processed" | "product" | "draft";
  source_type: string;
  status: string;
  display_order: number;
  output_unit: string;
  output_qty: number;
  buffer_rate: number;
  yield_rate: number | null;
  yield_configured: boolean;
  cost_unit_price: number;
  cost_unit_price_formula: string;
  cost_unit_price_formula_note: string;
  selling_price: number;
  components: MasterComponentDetail[];
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
  key: string;
  name: string;
  item_count: number;
  is_system?: boolean;
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

function conversionRuleHint(invoiceUnit: string): string {
  const u = (invoiceUnit || "").trim().toLowerCase();
  const hints: Record<string, string> = {
    tin: "e.g. 1 TIN = 17000 ml  →  17000 ml/TIN",
    ltr: "e.g. 1 LTR = 1000 ml  →  1000 ml/LTR",
    l: "e.g. 1 L = 1000 ml  →  1000 ml/L",
    kg: "e.g. 1 KG = 1000 g  →  1000 g/KG",
    pkt: "e.g. 1 PKT = X g  →  enter weight per packet",
    box: "e.g. 1 BOX = X units  →  enter count per box",
    ctn: "e.g. 1 CTN = X g  →  enter weight per carton",
    bag: "e.g. 1 BAG = X g  →  enter weight per bag",
    btl: "e.g. 1 BTL = X ml  →  enter ml per bottle",
    can: "e.g. 1 CAN = X g  →  enter weight per can",
    jar: "e.g. 1 JAR = X g  →  enter weight per jar",
    pcs: "e.g. 1 PCS = 1 pc",
    pc: "e.g. 1 PC = 1 pc",
    tray: "e.g. 1 TRAY = 30 pc  →  enter count per tray",
  };
  return hints[u] || "";
}

/** Parse "1 TRAY = 30 pc" → { fromUnit: "tray", multiplier: 30, toUnit: "pc" } */
function parseConversionRule(rule: string): { fromUnit: string; multiplier: number; toUnit: string } | null {
  if (!rule || !rule.trim()) return null;
  const cleaned = rule.split(/[→>]/)[0].trim();
  const m = cleaned.match(/(?:1\s+)?(\w+)\s*=\s*([0-9]+(?:\.[0-9]+)?)\s*(\w+)/i);
  if (!m) return null;
  const multiplier = parseFloat(m[2]);
  if (!multiplier || multiplier <= 0) return null;
  return { fromUnit: m[1].toUpperCase(), multiplier, toUnit: m[3].toLowerCase() };
}

interface ConversionPreviewProps {
  rule: string;
  invoiceUnit: string;
  ingredientUnit: string;
  invoiceUnitPrice: number;
  ingredientUnitPrice: number;
  currency: string;
}
function ConversionPreview({ rule, invoiceUnit, ingredientUnit, invoiceUnitPrice, ingredientUnitPrice, currency }: ConversionPreviewProps) {
  // Implied count from existing prices: trayPrice / pcPrice = pcs per tray
  const impliedCount =
    invoiceUnitPrice > 0 && ingredientUnitPrice > 0
      ? invoiceUnitPrice / ingredientUnitPrice
      : null;

  const parsed = parseConversionRule(rule);

  const showImplied = impliedCount !== null && !parsed;
  const pricePerUnit = parsed && invoiceUnitPrice > 0 ? invoiceUnitPrice / parsed.multiplier : null;

  if (!parsed && impliedCount === null) return null;

  return (
    <div className="mt-1.5 rounded-lg border border-sky-900/40 bg-sky-950/20 px-3 py-2 text-xs space-y-1">
      {/* Implied count from price data */}
      {showImplied && (
        <div>
          <div className="text-zinc-400 mb-0.5">現在の価格データから逆算：</div>
          <div className="flex items-center gap-1.5 text-sky-300">
            <span>{currency} {invoiceUnitPrice.toFixed(3)} / {invoiceUnit.toUpperCase()}</span>
            <span className="text-zinc-500">÷</span>
            <span>{currency} {ingredientUnitPrice.toFixed(4)} / {ingredientUnit}</span>
            <span className="text-zinc-500">=</span>
            <span className="font-semibold text-amber-300">
              約 {Math.round(impliedCount)} {ingredientUnit} / {invoiceUnit.toUpperCase()}
            </span>
          </div>
          <div className="mt-1 text-zinc-500">
            → 変換ルール例: <span className="text-sky-400">1 {invoiceUnit.toUpperCase()} = {Math.round(impliedCount)} {ingredientUnit}</span>
          </div>
        </div>
      )}
      {/* Rule parse result */}
      {parsed && (
        <div>
          <div className="flex items-center gap-1.5 text-sky-300">
            <span>1 {parsed.fromUnit}</span>
            <span className="text-zinc-500">=</span>
            <span className="font-semibold">{parsed.multiplier} {parsed.toUnit}</span>
          </div>
          {pricePerUnit !== null && (
            <div className="mt-0.5 text-zinc-300">
              <span className="text-zinc-500">1 {parsed.toUnit} あたり = </span>
              <span className="font-semibold text-emerald-300">{currency} {pricePerUnit.toFixed(4)}</span>
              <span className="ml-2 text-zinc-500">({currency} {invoiceUnitPrice.toFixed(3)} ÷ {parsed.multiplier})</span>
            </div>
          )}
          {impliedCount !== null && (
            <div className="mt-0.5 text-zinc-500">
              価格データからの推計: 約 {impliedCount.toFixed(1)} {ingredientUnit} / {invoiceUnit.toUpperCase()}
              {Math.abs(impliedCount - parsed.multiplier) > 1 && (
                <span className="ml-1 text-amber-400">⚠ 入力値 ({parsed.multiplier}) と差があります</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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

function normalizeMenuBufferRate(value: unknown) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 1.15;
}

function quantityToGrams(quantity: number, unit: string) {
  const normalizedUnit = String(unit || "").trim().toLowerCase();
  if (!Number.isFinite(quantity)) return 0;
  if (["g", "gram", "grams"].includes(normalizedUnit)) return quantity;
  if (["kg", "kilogram", "kilograms"].includes(normalizedUnit)) return quantity * 1000;
  return 0;
}

function formatGramTotal(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 g";
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)} g`;
}

function computeMenuTotals(ingredients: Array<{ quantity: number; unit_price: number }>, sellingPrice: number, bufferRate: number = 1.15) {
  const rawTotal = ingredients.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0);
  const totalCost = rawTotal * normalizeMenuBufferRate(bufferRate);
  return {
    raw_cost: rawTotal,
    total_cost: totalCost,
    cost_ratio: sellingPrice > 0 ? totalCost / sellingPrice : null,
  };
}

function computeMasterTotalsLocal(
  components: Array<{ quantity: number; unit_cost: number }>,
  {
    sellingPrice,
    bufferRate,
    yieldRate,
    outputQty,
  }: {
    sellingPrice: number;
    bufferRate: number;
    yieldRate: number | null;
    outputQty: number;
  },
) {
  const rawCost = components.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_cost || 0), 0);
  const normalizedYield = normalizeRateValue(yieldRate);
  const normalizedBuffer = normalizeMenuBufferRate(bufferRate);
  const normalizedOutputQty = Number(outputQty || 0) > 0 ? Number(outputQty) : 1;
  const yieldAdjustedTotal = normalizedYield ? rawCost / normalizedYield : rawCost;
  const totalCost = yieldAdjustedTotal * normalizedBuffer;
  const unitCost = totalCost / normalizedOutputQty;
  return {
    raw_cost: rawCost,
    yield_adjusted_total: yieldAdjustedTotal,
    total_cost: totalCost,
    unit_cost: unitCost,
    cost_ratio: sellingPrice > 0 ? totalCost / sellingPrice : null,
  };
}

const COST_FORMULA_ALLOWED_RE = /^[0-9+\-*/().\s]+$/;

function evaluateCostFormulaExpression(formula: string): number | null {
  const text = String(formula || "").trim();
  if (!text) return null;
  if (!COST_FORMULA_ALLOWED_RE.test(text)) return null;
  try {
    const result = Function(`"use strict"; return (${text});`)();
    const numeric = Number(result);
    if (!Number.isFinite(numeric)) return null;
    return numeric;
  } catch {
    return null;
  }
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
  const yieldRate = normalizeMenuBufferRate(raw?.yield_rate);
  const totals = computeMenuTotals(ingredients, sellingPrice, yieldRate);
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
    yield_rate: yieldRate,
    raw_cost: Number(raw?.raw_cost ?? totals.raw_cost),
    total_cost: Number(raw?.total_cost ?? totals.total_cost),
    cost_ratio: sellingPrice > 0 ? Number(raw?.cost_ratio ?? totals.cost_ratio ?? 0) : null,
    ingredient_count: Number(raw?.ingredient_count || ingredients.length),
    ingredients,
    price_history: priceHistory,
  };
}

function mapMasterComponent(raw: any): MasterComponentDetail {
  return {
    id: String(raw?.id || ""),
    component_type: String(raw?.component_type || "ingredient") === "processed_item" ? "processed_item" : "ingredient",
    ingredient_id: String(raw?.ingredient_id || ""),
    component_menu_item_id: String(raw?.component_menu_item_id || ""),
    name: String(raw?.name || raw?.component_name || ""),
    category: String(raw?.category || raw?.component_category || ""),
    unit: String(raw?.unit || ""),
    quantity: Number(raw?.quantity || 0),
    unit_cost: Number(raw?.unit_cost || 0),
    cost: Number(raw?.cost || 0),
    sort_order: Number(raw?.sort_order || 0),
    unit_price_formula: "",
    unit_price_formula_note: "",
    ingredient_detail_loaded: false,
  };
}

function mapMasterItemDetail(raw: any): MasterItemDetail {
  const components = Array.isArray(raw?.components) ? raw.components.map(mapMasterComponent) : [];
  const sellingPrice = Number(raw?.selling_price || 0);
  const bufferRate = normalizeMenuBufferRate(raw?.buffer_rate);
  const yieldRate = normalizeRateValue(raw?.yield_rate);
  const outputQty = Number(raw?.output_qty || 1) > 0 ? Number(raw.output_qty) : 1;
  const totals = computeMasterTotalsLocal(
    components.map((component) => ({ quantity: component.quantity, unit_cost: component.unit_cost })),
    { sellingPrice, bufferRate, yieldRate, outputQty },
  );
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
    city: String(raw?.city || ""),
    category: String(raw?.category || ""),
    name: String(raw?.name || ""),
    description: String(raw?.description || ""),
    selling_price: sellingPrice,
    item_type: (String(raw?.item_type || "product") as MasterItemSummary["item_type"]),
    source_type: String(raw?.source_type || "manual"),
    status: String(raw?.status || "active"),
    display_order: Number(raw?.display_order || 0),
    output_unit: String(raw?.output_unit || ""),
    output_qty: outputQty,
    buffer_rate: bufferRate,
    yield_rate: yieldRate,
    yield_configured: Boolean(raw?.yield_configured ?? false),
    cost_unit_price: Number(raw?.cost_unit_price ?? totals.unit_cost),
    cost_unit_price_formula: String(raw?.cost_unit_price_formula || ""),
    cost_unit_price_formula_note: String(raw?.cost_unit_price_formula_note || ""),
    computed_unit_cost: Number(raw?.computed_unit_cost ?? totals.unit_cost),
    raw_cost: Number(raw?.raw_cost ?? totals.raw_cost),
    yield_adjusted_total: Number(raw?.yield_adjusted_total ?? totals.yield_adjusted_total),
    total_cost: Number(raw?.total_cost ?? totals.total_cost),
    unit_cost: Number(raw?.unit_cost ?? totals.unit_cost),
    cost_ratio: sellingPrice > 0 ? Number(raw?.cost_ratio ?? totals.cost_ratio ?? 0) : null,
    component_count: Number(raw?.component_count || components.length),
    is_active: Boolean(raw?.is_active ?? true),
    created_at: String(raw?.created_at || ""),
    updated_at: String(raw?.updated_at || ""),
    components,
    price_history: priceHistory,
  };
}

function createEmptyMasterEditor(itemType: "processed" | "product" | "draft", city: "dubai" | "manila"): MasterEditorDraft {
  return {
    id: "",
    city,
    category: itemType === "processed" ? "加工品マスタ" : itemType === "draft" ? "新商品" : "商品マスタ",
    name: "",
    description: "",
    item_type: itemType,
    source_type: "manual",
    status: itemType === "draft" ? "draft" : "active",
    display_order: 0,
    output_unit: itemType === "processed" ? "pc" : "",
    output_qty: 1,
    buffer_rate: 1.15,
    yield_rate: null,
    yield_configured: false,
    cost_unit_price: 0,
    cost_unit_price_formula: "",
    cost_unit_price_formula_note: "",
    selling_price: 0,
    components: [],
  };
}

function masterItemTypeLabel(itemType: MasterEditorDraft["item_type"]) {
  if (itemType === "processed") return "加工品";
  if (itemType === "draft") return "新商品";
  return "商品";
}

function masterComponentOptionLabel(itemType: MasterEditorDraft["item_type"]) {
  return itemType === "processed" ? "Processed" : "Master Item";
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
  const [activeSection, setActiveSection] = useState<CostSection>("ingredient");
  const [showLegacyProductSheets, setShowLegacyProductSheets] = useState(false);
  const [activeSheet, setActiveSheet] = useState<SheetKey>(INGREDIENT_SHEET);
  const [searchText, setSearchText] = useState("");
  const [ingredientCategoryFilter, setIngredientCategoryFilter] = useState("all");
  const [menuCategories, setMenuCategories] = useState<CategoryItem[]>([]);
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [recipes, setRecipes] = useState<Record<string, RecipeRow[]>>({});
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
  const [recipeMenuItemsBySheet, setRecipeMenuItemsBySheet] = useState<Record<string, MenuItemRow[]>>({});
  const [recipeLoading, setRecipeLoading] = useState(false);
  const [masterItemsByType, setMasterItemsByType] = useState<Record<"processed" | "product" | "draft", MasterItemSummary[]>>({
    processed: [],
    product: [],
    draft: [],
  });
  const [masterItemsLoading, setMasterItemsLoading] = useState(false);
  const [componentOptions, setComponentOptions] = useState<ComponentOption[]>([]);
  const [componentOptionsLoading, setComponentOptionsLoading] = useState(false);
  const [activeMasterComponentLookupId, setActiveMasterComponentLookupId] = useState<string | null>(null);
  const [selectedMasterItemId, setSelectedMasterItemId] = useState<string | null>(null);
  const [masterEditor, setMasterEditor] = useState<MasterEditorDraft | null>(null);
  const [masterDetailLoadingId, setMasterDetailLoadingId] = useState<string | null>(null);
  const [masterDetailSaving, setMasterDetailSaving] = useState(false);
  const [masterActionBusy, setMasterActionBusy] = useState(false);
  const [ingredientPromotionKey, setIngredientPromotionKey] = useState<string | null>(null);
  const [activeIngredientActionMenuId, setActiveIngredientActionMenuId] = useState<string | null>(null);
  const [categoryActionBusy, setCategoryActionBusy] = useState(false);
  const [showAddItemForm, setShowAddItemForm] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [newItemBuffer, setNewItemBuffer] = useState("115");
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
  const [unmatchedItemSearch, setUnmatchedItemSearch] = useState("");
  const [unmatchedSupplierFilter, setUnmatchedSupplierFilter] = useState("");
  const [invoiceMappings, setInvoiceMappings] = useState<InvoiceItemMappingRow[]>([]);
  const [invoiceMappingLoading, setInvoiceMappingLoading] = useState(false);
  const [invoiceMappingSaving, setInvoiceMappingSaving] = useState(false);
  const [invoiceSyncBusy, setInvoiceSyncBusy] = useState(false);
  const [invoiceSyncResult, setInvoiceSyncResult] = useState<any>(null);
  const [invoiceSyncError, setInvoiceSyncError] = useState("");
  const [selectedUnmatchedItemKey, setSelectedUnmatchedItemKey] = useState("");
  const [skippedUnmatchedInvoiceKeys, setSkippedUnmatchedInvoiceKeys] = useState<string[]>([]);
  const [editingInvoiceMappingId, setEditingInvoiceMappingId] = useState<string | null>(null);
  const [mappingMode, setMappingMode] = useState<"create" | "edit">("create");
  const [mappingSourceSupplierName, setMappingSourceSupplierName] = useState("");
  const [mappingSourceItemDescription, setMappingSourceItemDescription] = useState("");
  const [mappingSourceInvoiceUnit, setMappingSourceInvoiceUnit] = useState("");
  const [mappingIngredientSearch, setMappingIngredientSearch] = useState("");
  const [showMappingIngredientDropdown, setShowMappingIngredientDropdown] = useState(false);
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
  const activeMasterType = activeSection === "processed" ? "processed" : activeSection === "draft" ? "draft" : "product";
  const isIngredientSection = activeSection === "ingredient";
  const isInvoiceSection = activeSection === "invoice";
  const isMasterSection = activeSection === "processed" || activeSection === "draft" || activeSection === "product";
  const showLegacyRecipeSection = activeSection === "product" && showLegacyProductSheets;
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
      const target = event.target as HTMLElement | null;
      if (!target?.closest?.("[data-ingredient-action-menu]")) {
        setActiveIngredientActionMenuId(null);
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
      // Preserve any locally-added rows that haven't been saved yet so that
      // focus/visibility-triggered refreshes don't wipe out in-progress edits.
      setIngredients((prev) => {
        const newRows = prev.filter((row) => row._new);
        return newRows.length ? [...newRows, ...merged] : merged;
      });
      setAllIngredientOptions(merged);
    } catch (e) {
      console.error("Failed to load ingredients:", e);
      setIngredients((prev) => prev.filter((row) => row._new)); // keep new rows on error
      setAllIngredientOptions([]);
    } finally {
      setLoading(false);
    }
  }, [city]);

  const loadMenuCategories = useCallback(async () => {
    try {
      const res = await costJson<{ items?: CategoryItem[] }>(`/api/cost/recipe-sheets?city=${encodeURIComponent(city)}`);
      const items = Array.isArray(res?.items)
        ? res.items
          .map((item) => ({
            key: String(item.key || item.name || "").trim(),
            name: String(item.name || item.key || "").trim(),
            item_count: Number(item.item_count || 0),
            is_system: Boolean((item as any).is_system),
          }))
          .filter((item) => item.key && item.name)
        : [];
      setMenuCategories(items);
      setNewItemCategory((current) => (current || items[0]?.name || ""));
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

  const runInvoiceSync = useCallback(async (dryRun: boolean) => {
    setInvoiceSyncBusy(true);
    setInvoiceSyncError("");
    setInvoiceSyncResult(null);
    try {
      const res = await costJson<any>(
        `/api/admin/cost/sync-invoice-prices?city=${encodeURIComponent(city)}&dry_run=${dryRun}`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setInvoiceSyncResult(res);
      if (!dryRun) void loadInvoiceMappingData();
    } catch (e: any) {
      setInvoiceSyncError(e?.message || String(e));
    } finally {
      setInvoiceSyncBusy(false);
    }
  }, [city, loadInvoiceMappingData]);

  const loadRecipeSheet = useCallback(async (sheet: SheetKey) => {
    if (sheet === INGREDIENT_SHEET) return;
    setRecipeLoading(true);
    try {
      const res = await costJson<{ items: MenuItemRow[] }>(
        `/api/cost/menu-items?city=${encodeURIComponent(city)}&sheet=${encodeURIComponent(sheet)}`,
      );
      const items = Array.isArray(res?.items)
        ? res.items.map((item) => ({
            ...item,
            selling_price: Number(item.selling_price || 0),
            yield_rate: normalizeMenuBufferRate((item as any).yield_rate),
            total_cost: Number(item.total_cost || 0),
            cost_ratio: item.cost_ratio == null ? null : Number(item.cost_ratio),
          }))
        : [];
      setRecipeMenuItemsBySheet((prev) => ({ ...prev, [sheet]: items }));
    } catch (e: any) {
      setError(e?.message || String(e));
      setRecipeMenuItemsBySheet((prev) => ({ ...prev, [sheet]: [] }));
    } finally {
      setRecipeLoading(false);
    }
  }, [city]);

  const loadMasterItems = useCallback(async (itemType: "processed" | "product" | "draft") => {
    setMasterItemsLoading(true);
    try {
      const res = await costJson<{ items?: any[] }>(
        `/api/cost/master-items?city=${encodeURIComponent(city)}&type=${encodeURIComponent(itemType)}`,
      );
      const items = Array.isArray(res?.items)
        ? res.items.map((item) => {
            const detail = mapMasterItemDetail(item);
            return {
              id: detail.id,
              city: detail.city,
              category: detail.category,
              name: detail.name,
              description: detail.description,
              selling_price: detail.selling_price,
              item_type: detail.item_type,
              source_type: detail.source_type,
              status: detail.status,
              display_order: detail.display_order,
              output_unit: detail.output_unit,
              output_qty: detail.output_qty,
              buffer_rate: detail.buffer_rate,
              yield_rate: detail.yield_rate,
              yield_configured: detail.yield_configured,
              cost_unit_price: detail.cost_unit_price,
              cost_unit_price_formula: detail.cost_unit_price_formula,
              cost_unit_price_formula_note: detail.cost_unit_price_formula_note,
              computed_unit_cost: detail.computed_unit_cost,
              raw_cost: detail.raw_cost,
              yield_adjusted_total: detail.yield_adjusted_total,
              total_cost: detail.total_cost,
              unit_cost: detail.unit_cost,
              cost_ratio: detail.cost_ratio,
              component_count: detail.component_count,
              is_active: detail.is_active,
              created_at: detail.created_at,
              updated_at: detail.updated_at,
            } satisfies MasterItemSummary;
          })
        : [];
      setMasterItemsByType((prev) => ({ ...prev, [itemType]: items }));
    } catch (e: any) {
      setError(e?.message || String(e));
      setMasterItemsByType((prev) => ({ ...prev, [itemType]: [] }));
    } finally {
      setMasterItemsLoading(false);
    }
  }, [city]);

  const loadComponentOptions = useCallback(async () => {
    setComponentOptionsLoading(true);
    try {
      const res = await costJson<{ items?: ComponentOption[] }>(
        `/api/cost/component-options?city=${encodeURIComponent(city)}`,
      );
      const items = Array.isArray(res?.items)
        ? res.items.map((item) => ({
            component_type: (String(item.component_type || "ingredient") === "processed_item" ? "processed_item" : "ingredient") as MasterComponentType,
            id: String(item.id || ""),
            name: String(item.name || ""),
            category: String(item.category || ""),
            unit: String(item.unit || ""),
            unit_cost: Number(item.unit_cost || 0),
          }))
        : [];
      setComponentOptions(items);
    } catch (e: any) {
      setError(e?.message || String(e));
      setComponentOptions([]);
    } finally {
      setComponentOptionsLoading(false);
    }
  }, [city]);

  const loadMasterDetail = useCallback(async (id: string) => {
    if (!id) return;
    setMasterDetailLoadingId(id);
    try {
      const res = await costJson<{ item?: any }>(`/api/cost/master-items/${id}`);
      if (res?.item) {
        const detail = mapMasterItemDetail(res.item);
        setSelectedMasterItemId(detail.id);
        setMasterEditor({
          id: detail.id,
          city: detail.city || city,
          category: detail.category,
          name: detail.name,
          description: detail.description,
          item_type: detail.item_type,
          source_type: detail.source_type,
          status: detail.status,
          display_order: detail.display_order,
          output_unit: detail.output_unit,
          output_qty: detail.output_qty,
          buffer_rate: detail.buffer_rate,
          yield_rate: detail.yield_rate,
          yield_configured: detail.yield_configured,
          cost_unit_price: detail.cost_unit_price,
          cost_unit_price_formula: detail.cost_unit_price_formula,
          cost_unit_price_formula_note: detail.cost_unit_price_formula_note,
          selling_price: detail.selling_price,
          components: detail.components,
        });
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setMasterDetailLoadingId((current) => (current === id ? null : current));
    }
  }, [city]);

  const applyMasterDetailToEditor = useCallback((detail: MasterItemDetail) => {
    setSelectedMasterItemId(detail.id);
    setMasterEditor({
      id: detail.id,
      city: detail.city || city,
      category: detail.category,
      name: detail.name,
      description: detail.description,
      item_type: detail.item_type,
      source_type: detail.source_type,
      status: detail.status,
      display_order: detail.display_order,
      output_unit: detail.output_unit,
      output_qty: detail.output_qty,
      buffer_rate: detail.buffer_rate,
      yield_rate: detail.yield_rate,
      yield_configured: detail.yield_configured,
      cost_unit_price: detail.cost_unit_price,
      cost_unit_price_formula: detail.cost_unit_price_formula,
      cost_unit_price_formula_note: detail.cost_unit_price_formula_note,
      selling_price: detail.selling_price,
      components: detail.components,
    });
  }, [city]);

  const updateMasterEditor = useCallback((updater: (current: MasterEditorDraft) => MasterEditorDraft) => {
    setMasterEditor((current) => (current ? updater(current) : current));
  }, []);

  const createNewMasterEditor = useCallback((itemType: "processed" | "product" | "draft") => {
    setSelectedMasterItemId(null);
    setMasterEditor(createEmptyMasterEditor(itemType, city));
  }, [city]);

  const addMasterComponentRow = useCallback((componentType: MasterComponentType = "ingredient") => {
    updateMasterEditor((current) => ({
      ...current,
      components: [
        ...current.components,
        {
          id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          component_type: componentType,
          ingredient_id: "",
          component_menu_item_id: "",
          name: "",
          category: "",
          unit: "",
          quantity: 0,
          unit_cost: 0,
          cost: 0,
          sort_order: current.components.length,
          unit_price_formula: "",
          unit_price_formula_note: "",
          ingredient_detail_loaded: false,
        },
      ],
    }));
  }, [updateMasterEditor]);

  const removeMasterComponentRow = useCallback((id: string) => {
    updateMasterEditor((current) => ({
      ...current,
      components: current.components
        .filter((component) => component.id !== id)
        .map((component, index) => ({ ...component, sort_order: index })),
    }));
  }, [updateMasterEditor]);

  const updateMasterComponentRow = useCallback((id: string, updater: (component: MasterComponentDetail) => MasterComponentDetail) => {
    updateMasterEditor((current) => ({
      ...current,
      components: current.components.map((component) => (
        component.id === id ? updater(component) : component
      )),
    }));
  }, [updateMasterEditor]);

  const saveMasterEditor = useCallback(async () => {
    if (!masterEditor) return;
    const name = masterEditor.name.trim();
    const category = masterEditor.category.trim();
    if (!name || !category) {
      setError("Name and category are required.");
      return;
    }
    const payload = {
      city,
      category,
      name,
      item_type: masterEditor.item_type,
      description: masterEditor.description,
      selling_price: Number(masterEditor.selling_price || 0),
      buffer_rate: normalizeMenuBufferRate(masterEditor.buffer_rate),
      yield_rate: normalizeRateValue(masterEditor.yield_rate),
      output_unit: masterEditor.output_unit,
      output_qty: Number(masterEditor.output_qty || 1),
      cost_unit_price: masterEditor.item_type !== "draft" ? Number(masterEditor.cost_unit_price || 0) : null,
      cost_unit_price_formula: masterEditor.item_type !== "draft" ? masterEditor.cost_unit_price_formula : "",
      cost_unit_price_formula_note: masterEditor.item_type === "processed" ? masterEditor.cost_unit_price_formula_note : "",
      display_order: Number(masterEditor.display_order || 0),
      source_type: masterEditor.source_type || "manual",
      status: masterEditor.status || (masterEditor.item_type === "draft" ? "draft" : "active"),
      components: masterEditor.components
        .filter((component) => (
          component.quantity > 0
          && (
            (component.component_type === "ingredient" && Number(component.ingredient_id || 0) > 0)
            || (component.component_type === "processed_item" && Number(component.component_menu_item_id || 0) > 0)
          )
        ))
        .map((component, index) => ({
          component_type: component.component_type,
          ingredient_id: component.component_type === "ingredient" ? Number(component.ingredient_id || 0) : null,
          component_menu_item_id: component.component_type === "processed_item" ? Number(component.component_menu_item_id || 0) : null,
          quantity: Number(component.quantity || 0),
          unit: component.unit,
          sort_order: index,
        })),
    };
    if (!payload.components.length) {
      setError("At least one component is required.");
      return;
    }
    try {
      setMasterDetailSaving(true);
      const endpoint = masterEditor.id
        ? (masterEditor.item_type === "draft" ? `/api/cost/product-drafts/${masterEditor.id}` : `/api/cost/master-items/${masterEditor.id}`)
        : (masterEditor.item_type === "draft" ? "/api/cost/product-drafts" : "/api/cost/master-items");
      const method = masterEditor.id ? "PATCH" : "POST";
      const res = await costJson<{ item?: any }>(endpoint, {
        method,
        body: JSON.stringify(payload),
      });
      if (res?.item) {
        const detail = mapMasterItemDetail(res.item);
        setMasterEditor({
          id: detail.id,
          city: detail.city || city,
          category: detail.category,
          name: detail.name,
          description: detail.description,
          item_type: detail.item_type,
          source_type: detail.source_type,
          status: detail.status,
          display_order: detail.display_order,
          output_unit: detail.output_unit,
          output_qty: detail.output_qty,
          buffer_rate: detail.buffer_rate,
          yield_rate: detail.yield_rate,
          yield_configured: detail.yield_configured,
          cost_unit_price: detail.cost_unit_price,
          cost_unit_price_formula: detail.cost_unit_price_formula,
          cost_unit_price_formula_note: detail.cost_unit_price_formula_note,
          selling_price: detail.selling_price,
          components: detail.components,
        });
        setSelectedMasterItemId(detail.id);
        await loadMasterItems(detail.item_type);
        await loadComponentOptions();
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setMasterDetailSaving(false);
    }
  }, [city, loadComponentOptions, loadMasterItems, masterEditor]);

  const archiveSelectedMasterItem = useCallback(async () => {
    if (!masterEditor?.id) return;
    const confirmed = window.confirm(`Archive "${masterEditor.name}"?`);
    if (!confirmed) return;
    try {
      setMasterActionBusy(true);
      await costJson(`/api/cost/master-items/${masterEditor.id}`, { method: "DELETE" });
      await loadMasterItems(masterEditor.item_type);
      await loadComponentOptions();
      setSelectedMasterItemId(null);
      setMasterEditor(null);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setMasterActionBusy(false);
    }
  }, [loadComponentOptions, loadMasterItems, masterEditor]);

  const moveMasterItemToProcessed = useCallback(async () => {
    if (!masterEditor?.id || masterEditor.item_type !== "product") return;
    const confirmed = window.confirm(`"${masterEditor.name}" を 加工品マスタ へ移動しますか？`);
    if (!confirmed) return;
    try {
      setMasterActionBusy(true);
      setError("");
      const res = await costJson<{ item?: any }>(`/api/cost/master-items/${masterEditor.id}/move`, {
        method: "POST",
        body: JSON.stringify({ target_type: "processed" }),
      });
      if (!res?.item) return;
      const detail = mapMasterItemDetail(res.item);
      await loadMasterItems("product");
      await loadMasterItems("processed");
      await loadComponentOptions();
      setActiveSection("processed");
      applyMasterDetailToEditor(detail);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setMasterActionBusy(false);
    }
  }, [applyMasterDetailToEditor, loadComponentOptions, loadMasterItems, masterEditor]);

  const promoteIngredientToMaster = useCallback(async (ingredient: IngredientRow, targetType: "processed" | "product") => {
    const ingredientId = String(ingredient?.id || "");
    if (!ingredientId || ingredientId.startsWith("new-")) return;
    const targetLabel = targetType === "processed" ? "加工品マスタ" : "商品マスタ";
    const confirmed = window.confirm(`"${ingredient.name}" を ${targetLabel} へ移動しますか？`);
    if (!confirmed) return;
    const promotionKey = `${targetType}:${ingredientId}`;
    try {
      setIngredientPromotionKey(promotionKey);
      setError("");
      const res = await costJson<{ item?: any }>(`/api/cost/ingredients/${ingredientId}/promote`, {
        method: "POST",
        body: JSON.stringify({ target_type: targetType }),
      });
      if (!res?.item) return;
      const detail = mapMasterItemDetail(res.item);
      await loadIngredients();
      await loadMasterItems(targetType);
      await loadComponentOptions();
      setSelectedIngredientDetail((current) => (String(current?.id || "") === ingredientId ? null : current));
      setHighlightedIngredientId(null);
      setActiveSection(targetType);
      if (targetType === "product") {
        setShowLegacyProductSheets(false);
      }
      applyMasterDetailToEditor(detail);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setIngredientPromotionKey((current) => (current === promotionKey ? null : current));
    }
  }, [applyMasterDetailToEditor, loadComponentOptions, loadIngredients, loadMasterItems]);

  const publishSelectedDraft = useCallback(async () => {
    if (!masterEditor?.id || masterEditor.item_type !== "draft") return;
    try {
      setMasterActionBusy(true);
      const res = await costJson<{ item?: any }>(`/api/cost/product-drafts/${masterEditor.id}/publish`, {
        method: "POST",
        body: JSON.stringify({ category: masterEditor.category }),
      });
      if (res?.item) {
        const detail = mapMasterItemDetail(res.item);
        await loadMasterItems("draft");
        await loadMasterItems("product");
        await loadComponentOptions();
        setActiveSection("product");
        setShowLegacyProductSheets(false);
        setSelectedMasterItemId(detail.id);
        setMasterEditor({
          id: detail.id,
          city: detail.city || city,
          category: detail.category,
          name: detail.name,
          description: detail.description,
          item_type: detail.item_type,
          source_type: detail.source_type,
          status: detail.status,
          display_order: detail.display_order,
          output_unit: detail.output_unit,
          output_qty: detail.output_qty,
          buffer_rate: detail.buffer_rate,
          yield_rate: detail.yield_rate,
          yield_configured: detail.yield_configured,
          cost_unit_price: detail.cost_unit_price,
          cost_unit_price_formula: detail.cost_unit_price_formula,
          cost_unit_price_formula_note: detail.cost_unit_price_formula_note,
          selling_price: detail.selling_price,
          components: detail.components,
        });
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setMasterActionBusy(false);
    }
  }, [city, loadComponentOptions, loadMasterItems, masterEditor]);

  useEffect(() => {
    if (!allowed) return;
    void loadIngredients();
    void loadMenuCategories();
    void loadInvoiceMappingData();
  }, [activeSheet, allowed, city, loadIngredients, loadMenuCategories, loadInvoiceMappingData]);

  useEffect(() => {
    if (!allowed || activeSection !== "invoice") return;
    void loadInvoiceMappingData();
  }, [activeSection, allowed, loadInvoiceMappingData]);

  // Refetch data whenever the tab/window regains focus — prevents stale data
  // after navigating away and back without a hard reload.
  useEffect(() => {
    if (!allowed) return;
    let lastRefresh = Date.now();
    function refresh() {
      // Throttle: at most once every 10 seconds to avoid hammering the API.
      if (Date.now() - lastRefresh < 10_000) return;
      lastRefresh = Date.now();
      void loadInvoiceMappingData();
      void loadIngredients();
    }
    function onVisibility() {
      if (document.visibilityState === "visible") refresh();
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", refresh);
    };
  }, [allowed, loadInvoiceMappingData, loadIngredients]);

  useEffect(() => {
    if (!allowed) return;
    setRecipes({});
    setRecipeMenuItemsBySheet({});
    setMenuDetails({});
    setExpandedMenuItemId(null);
    setMenuDraftLine({});
    setShowAddItemForm(false);
    setUnmatchedInvoiceItems([]);
    setUnmatchedItemSearch("");
    setUnmatchedSupplierFilter("");
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
    setMasterItemsByType({ processed: [], product: [], draft: [] });
    setComponentOptions([]);
    setSelectedMasterItemId(null);
    setMasterEditor(null);
  }, [allowed, city]);

  useEffect(() => {
    if (!allowed) return;
    if (activeSheet !== INGREDIENT_SHEET) {
      void loadRecipeSheet(activeSheet);
    }
    setDirtyRows(new Set());
    setSelectedCell(null);
    setEditingCell(null);
  }, [activeSheet, allowed, loadRecipeSheet]);

  useEffect(() => {
    if (!allowed) return;
    if (!isMasterSection) return;
    if (activeSection === "product" && showLegacyProductSheets) return;
    void loadMasterItems(activeMasterType);
    void loadComponentOptions();
  }, [activeMasterType, activeSection, allowed, isMasterSection, loadComponentOptions, loadMasterItems, showLegacyProductSheets]);

  useEffect(() => {
    if (!isMasterSection || showLegacyRecipeSection) return;
    if (masterEditor && masterEditor.item_type !== activeMasterType) {
      setSelectedMasterItemId(null);
      setMasterEditor(null);
    }
  }, [activeMasterType, isMasterSection, masterEditor, showLegacyRecipeSection]);

  useEffect(() => {
    gridRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [activeSection, showLegacyProductSheets]);

  const filteredIngredientRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return ingredients.filter((row) => {
      if (ingredientCategoryFilter !== "all" && row.category !== ingredientCategoryFilter) return false;
      if (!q) return true;
      return [row.category, row.name, row.unit, row.notes].some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [ingredientCategoryFilter, ingredients, searchText]);

  const visibleMasterItems = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const rows = masterItemsByType[activeMasterType] || [];
    if (!q) return rows;
    return rows.filter((row) =>
      [row.name, row.category, row.description].some((value) => String(value || "").toLowerCase().includes(q)),
    );
  }, [activeMasterType, masterItemsByType, searchText]);

  const processedComponentOptions = useMemo(
    () => componentOptions.filter((option) => option.component_type === "processed_item"),
    [componentOptions],
  );

  const masterComponentSummary = useMemo(() => {
    if (!masterEditor) {
      return {
        totalAmount: 0,
        totalGrams: 0,
      };
    }
    return masterEditor.components.reduce(
      (summary, component) => ({
        totalAmount: summary.totalAmount + Number(component.quantity || 0) * Number(component.unit_cost || 0),
        totalGrams: summary.totalGrams + quantityToGrams(Number(component.quantity || 0), component.unit || ""),
      }),
      { totalAmount: 0, totalGrams: 0 },
    );
  }, [masterEditor]);

  const masterEditorPreview = useMemo(() => {
    if (!masterEditor) return null;
    const preview = computeMasterTotalsLocal(
      masterEditor.components.map((component) => ({
        quantity: Number(component.quantity || 0),
        unit_cost: Number(component.unit_cost || 0),
      })),
      {
        sellingPrice: Number(masterEditor.selling_price || 0),
        bufferRate: masterEditor.buffer_rate,
        yieldRate: masterEditor.yield_rate,
        outputQty: masterEditor.output_qty,
      },
    );
    const overrideUnitCost = Number(masterEditor.cost_unit_price || 0);
    if (masterEditor.item_type !== "draft" && overrideUnitCost > 0) {
      const outputQty = Number(masterEditor.output_qty || 0) > 0 ? Number(masterEditor.output_qty) : 1;
      const totalCost = overrideUnitCost * outputQty;
      return {
        ...preview,
        total_cost: totalCost,
        unit_cost: overrideUnitCost,
        cost_ratio: Number(masterEditor.selling_price || 0) > 0 ? totalCost / Number(masterEditor.selling_price || 0) : null,
      };
    }
    return preview;
  }, [masterEditor]);

  const masterFormulaResult = useMemo(() => {
    if (!masterEditor || masterEditor.item_type === "draft") return null;
    return evaluateCostFormulaExpression(masterEditor.cost_unit_price_formula);
  }, [masterEditor]);

  const getMasterComponentSuggestions = useCallback((component: MasterComponentDetail) => {
    const query = String(component.name || "").trim().toLowerCase();
    if (!query) return [];

    // Name-first matching: items whose name contains the query come before
    // category-only matches so results feel intuitive when typing a name.
    function scoreAndFilter<T extends { name: string; category: string; unit: string }>(
      list: T[],
      limit: number,
    ): T[] {
      const nameMatches = list.filter((o) => String(o.name || "").toLowerCase().includes(query));
      const catMatches = list.filter(
        (o) =>
          !String(o.name || "").toLowerCase().includes(query) &&
          String(o.category || "").toLowerCase().includes(query),
      );
      return [...nameMatches, ...catMatches].slice(0, limit);
    }

    if (component.component_type === "ingredient") {
      const ingredientPool = allIngredientOptions.map((option) => ({
        component_type: "ingredient" as const,
        id: String(option.id || ""),
        name: String(option.name || ""),
        category: String(option.category || ""),
        unit: String(option.unit || ""),
        unit_cost: Number(option.unit_price || 0),
      }));
      const ingredientMatches = scoreAndFilter(ingredientPool, 12);
      const processedMatches = scoreAndFilter(processedComponentOptions, Math.max(0, 12 - ingredientMatches.length));
      return [...ingredientMatches, ...processedMatches];
    }
    return scoreAndFilter(processedComponentOptions, 12);
  }, [allIngredientOptions, masterEditor?.item_type, processedComponentOptions]);

  const selectMasterComponentOption = useCallback((componentId: string, option: ComponentOption) => {
    updateMasterComponentRow(componentId, (current) => ({
      ...current,
      component_type: option.component_type,
      ingredient_id: option.component_type === "ingredient" ? option.id : "",
      component_menu_item_id: option.component_type === "processed_item" ? option.id : "",
      name: option.name,
      category: option.category,
      unit: option.unit,
      unit_cost: Number(option.unit_cost || 0),
      unit_price_formula: "",
      unit_price_formula_note: "",
      ingredient_detail_loaded: option.component_type !== "ingredient",
    }));
    setActiveMasterComponentLookupId(null);
  }, [updateMasterComponentRow]);

  const ingredientCategories = useMemo(() => {
    const cats = [...new Set(ingredients.map((item) => item.category).filter(Boolean))];
    return cats.sort((a, b) => a.localeCompare(b, "ja"));
  }, [ingredients]);

  const legacySheets = useMemo<SheetMeta[]>(
    () => menuCategories.map((item) => ({ key: item.key, name: item.name })),
    [menuCategories],
  );

  useEffect(() => {
    if (activeSheet === INGREDIENT_SHEET) return;
    if (!menuCategories.some((item) => item.key === activeSheet)) {
      setActiveSheet(INGREDIENT_SHEET);
    }
  }, [activeSheet, menuCategories]);

  const activeCategoryMeta = useMemo(
    () => menuCategories.find((item) => item.key === activeSheet) || null,
    [activeSheet, menuCategories],
  );
  const activeRecipeMenuItems = useMemo(
    () => (activeSheet === INGREDIENT_SHEET ? [] : (recipeMenuItemsBySheet[activeSheet] || [])),
    [activeSheet, recipeMenuItemsBySheet],
  );

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
    if (!q) return activeRecipeMenuItems;
    return activeRecipeMenuItems.filter((item) =>
      [item.name, item.category].some((value) => String(value || "").toLowerCase().includes(q)),
    );
  }, [activeRecipeMenuItems, activeSheet, searchText]);

  const skippedUnmatchedSet = useMemo(() => new Set(skippedUnmatchedInvoiceKeys), [skippedUnmatchedInvoiceKeys]);
  const unmatchedSupplierOptions = useMemo(
    () => Array.from(new Set(unmatchedInvoiceItems.map((item) => item.supplier_name).filter(Boolean))).sort(),
    [unmatchedInvoiceItems],
  );
  const visibleUnmatchedInvoiceItems = useMemo(() => {
    const q = unmatchedItemSearch.trim().toLowerCase();
    const sup = unmatchedSupplierFilter.trim().toLowerCase();
    return unmatchedInvoiceItems.filter((item) => {
      if (skippedUnmatchedSet.has(unmatchedInvoiceItemKey(item))) return false;
      if (sup && (item.supplier_name || "").toLowerCase() !== sup) return false;
      if (q && !(item.item_description || "").toLowerCase().includes(q) && !(item.supplier_name || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [unmatchedInvoiceItems, skippedUnmatchedSet, unmatchedItemSearch, unmatchedSupplierFilter]);
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
    const values = activeRecipeMenuItems
      .map((item) => Number(item.cost_ratio))
      .filter((value) => Number.isFinite(value) && value >= 0);
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }, [activeRecipeMenuItems]);

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

  const loadMasterComponentIngredientDetail = useCallback(async (componentId: string, ingredientId: string) => {
    const normalizedId = String(ingredientId || "").trim();
    if (!normalizedId) return;
    const fallback = allIngredientOptionsRef.current.find((item) => String(item.id) === normalizedId) || null;
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
          }
        : fallback;
      if (!detail) return;
      applyIngredientDetailToLocalState(detail);
      updateMasterComponentRow(componentId, (current) => (
        current.component_type === "ingredient" && String(current.ingredient_id) === normalizedId
          ? {
              ...current,
              unit_cost: Number(detail.unit_price || current.unit_cost || 0),
              unit_price_formula: String(detail.unit_price_formula || ""),
              unit_price_formula_note: String(detail.unit_price_formula_note || ""),
              ingredient_detail_loaded: true,
            }
          : current
      ));
    } catch {
      updateMasterComponentRow(componentId, (current) => ({ ...current, ingredient_detail_loaded: true }));
    }
  }, [applyIngredientDetailToLocalState, city, updateMasterComponentRow]);

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
    const bufferRate = normalizeMenuBufferRate(normalizeNumber(newItemBuffer) / 100);
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
    return computeMenuTotals(lines, sellingPrice, bufferRate);
  }, [allIngredientOptions, newItemBuffer, newItemIngredients, newItemPrice]);

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

  const removeLocalIngredientRow = useCallback((ingredientId: string) => {
    const normalizedId = String(ingredientId || "").trim();
    if (!normalizedId) return;
    setIngredients((prev) => prev.filter((item) => String(item.id) !== normalizedId));
    setAllIngredientOptions((prev) => prev.filter((item) => String(item.id) !== normalizedId));
    setSelectedIngredientDetail((current) => (String(current?.id || "") === normalizedId ? null : current));
    if (String(selectedMappingIngredientId || "") === normalizedId) {
      setSelectedMappingIngredientId("");
      setMappingIngredientSearch("");
      setMappingIngredientUnit("");
      setSelectedMappingIngredientDetail(null);
      setMappingCostPriceInput("");
      setMappingCostFormulaInput("");
      setMappingCostFormulaNoteInput("");
      setMappingCostSaveError("");
    }
    setPriceHistory((current) => (String(selectedIngredientDetailRef.current?.id || "") === normalizedId ? [] : current));
  }, [selectedMappingIngredientId]);

  const deleteSelectedIngredient = useCallback(async () => {
    if (!selectedIngredientDetail) return;
    const ingredientId = String(selectedIngredientDetail.id || "").trim();
    if (!ingredientId) return;
    const ingredientName = selectedIngredientDetail.name || "this ingredient";
    const confirmed = window.confirm(`Permanently delete "${ingredientName}"? This cannot be undone.`);
    if (!confirmed) return;
    if (ingredientId.startsWith("new-")) {
      removeLocalIngredientRow(ingredientId);
      return;
    }
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
  }, [loadIngredients, removeLocalIngredientRow, selectedIngredientDetail, selectedMappingIngredientId]);

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
      const totals = computeMenuTotals(next.ingredients, next.selling_price, next.yield_rate);
      return {
        ...prev,
        [menuItemId]: {
          ...next,
          total_cost: totals.total_cost,
          raw_cost: totals.raw_cost,
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

  const saveRecipeMenuItemBuffer = useCallback(async (id: string, value: string) => {
    const nextValue = normalizeMenuBufferRate(normalizeNumber(value) / 100);
    try {
      setMenuDetailSavingId(id);
      await costJson(`/api/cost/menu-items/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ yield_rate: nextValue }),
      });
      await refreshActiveRecipeTab();
      await refreshMenuDetail(id);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setMenuDetailSavingId((current) => (current === id ? null : current));
    }
  }, [refreshActiveRecipeTab, refreshMenuDetail]);

  const deleteRecipeMenuItem = useCallback(async (id: string, name: string) => {
    const confirmed = window.confirm(`Delete item "${name}"?`);
    if (!confirmed) return;
    try {
      setMenuDetailSavingId(id);
      await costJson(`/api/cost/menu-items/${id}`, {
        method: "DELETE",
      });
      setExpandedMenuItemId((current) => (current === id ? null : current));
      setMenuDetails((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setMenuDraftLine((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await loadMenuCategories();
      await refreshActiveRecipeTab();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setMenuDetailSavingId((current) => (current === id ? null : current));
    }
  }, [loadMenuCategories, refreshActiveRecipeTab]);

  const saveMenuCategory = useCallback(async (menuItemId: string, nextCategory: string) => {
    const category = String(nextCategory || "").trim();
    if (!category) return;
    const sourceCategory = String(activeSheet || "").trim();
    try {
      setMenuDetailSavingId(menuItemId);
      await costJson(`/api/cost/menu-items/${menuItemId}`, {
        method: "PATCH",
        body: JSON.stringify({ category, description: `Imported from ${category}` }),
      });
      await loadMenuCategories();
      setRecipeMenuItemsBySheet((prev) => {
        const next = { ...prev };
        delete next[sourceCategory];
        delete next[category];
        return next;
      });
      setExpandedMenuItemId((current) => (current === menuItemId ? null : current));
      setActiveSheet(category);
      await loadRecipeSheet(category);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setMenuDetailSavingId((current) => (current === menuItemId ? null : current));
    }
  }, [activeSheet, loadMenuCategories, loadRecipeSheet]);

  const createMenuCategory = useCallback(async () => {
    const name = window.prompt("New category name");
    const categoryName = String(name || "").trim();
    if (!categoryName) return;
    try {
      setCategoryActionBusy(true);
      await costJson("/api/cost/categories", {
        method: "POST",
        body: JSON.stringify({ city, name: categoryName }),
      });
      await loadMenuCategories();
      setNewItemCategory(categoryName);
      setActiveSheet(categoryName);
      await loadRecipeSheet(categoryName);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setCategoryActionBusy(false);
    }
  }, [city, loadMenuCategories, loadRecipeSheet]);

  const renameActiveCategory = useCallback(async () => {
    if (activeSheet === INGREDIENT_SHEET || !activeCategoryMeta || activeCategoryMeta.is_system) return;
    const nextName = window.prompt("Rename category", activeCategoryMeta.name);
    const categoryName = String(nextName || "").trim();
    if (!categoryName || categoryName === activeCategoryMeta.name) return;
    try {
      setCategoryActionBusy(true);
      await costJson(`/api/cost/categories/${encodeURIComponent(activeCategoryMeta.name)}`, {
        method: "PATCH",
        body: JSON.stringify({ city, name: categoryName }),
      });
      await loadMenuCategories();
      setExpandedMenuItemId(null);
      setActiveSheet(categoryName);
      await loadRecipeSheet(categoryName);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setCategoryActionBusy(false);
    }
  }, [activeCategoryMeta, activeSheet, city, loadMenuCategories, loadRecipeSheet]);

  const deleteActiveCategory = useCallback(async () => {
    if (activeSheet === INGREDIENT_SHEET || !activeCategoryMeta) return;
    const itemCount = activeRecipeMenuItems.length;
    let moveTo = "";
    if (itemCount > 0) {
      const candidates = menuCategories
        .map((item) => item.name)
        .filter((name) => name !== activeCategoryMeta.name);
      const target = window.prompt(
        `Move ${itemCount} item(s) to category before deleting "${activeCategoryMeta.name}".\nAvailable: ${candidates.join(", ")}`,
        candidates[0] || "",
      );
      moveTo = String(target || "").trim();
      if (!moveTo) return;
    } else {
      const confirmed = window.confirm(`Delete category "${activeCategoryMeta.name}"?`);
      if (!confirmed) return;
    }
    try {
      setCategoryActionBusy(true);
      const qs = new URLSearchParams({ city });
      if (moveTo) qs.set("move_to", moveTo);
      await costJson(`/api/cost/categories/${encodeURIComponent(activeCategoryMeta.name)}?${qs.toString()}`, {
        method: "DELETE",
      });
      await loadMenuCategories();
      setRecipeMenuItemsBySheet((prev) => {
        const next = { ...prev };
        delete next[activeCategoryMeta.name];
        if (moveTo) delete next[moveTo];
        return next;
      });
      setExpandedMenuItemId(null);
      setActiveSheet(moveTo || INGREDIENT_SHEET);
      if (moveTo) await loadRecipeSheet(moveTo);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setCategoryActionBusy(false);
    }
  }, [activeCategoryMeta, activeRecipeMenuItems.length, activeSheet, city, loadMenuCategories, loadRecipeSheet, menuCategories]);

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
          description: `Imported from ${activeSheet}`,
          selling_price: normalizeNumber(newItemPrice),
          yield_rate: normalizeMenuBufferRate(normalizeNumber(newItemBuffer) / 100),
          ingredients: ingredientsPayload,
        }),
      });
      setShowAddItemForm(false);
      setNewItemName("");
      setNewItemPrice("");
      setNewItemBuffer("115");
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
  }, [activeSheet, city, newItemBuffer, newItemCategory, newItemIngredients, newItemName, newItemPrice, refreshActiveRecipeTab]);

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
    setShowMappingIngredientDropdown(false);
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
      const nextIndex = currentRows.length;
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
      setDirtyRowIndex(nextIndex);
      setSelectedCell({ row: nextIndex, col: "name" });
      setEditingCell({ row: nextIndex, col: "name" });
      setEditValue("");
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

        <div className="border-b border-white/10 bg-black/10 px-6 pt-3">
          <div className="flex items-end gap-1 overflow-x-auto">
            {[
              { key: "ingredient" as CostSection, label: "食材マスタ" },
              { key: "processed" as CostSection, label: "加工品マスタ" },
              { key: "product" as CostSection, label: "商品マスタ" },
              { key: "draft" as CostSection, label: "新商品用コスト計算" },
              { key: "invoice" as CostSection, label: "仕入連動" },
            ].map((section) => (
              <button
                key={section.key}
                type="button"
                onClick={() => {
                  setActiveSection(section.key);
                  if (section.key === "ingredient") {
                    setActiveSheet(INGREDIENT_SHEET);
                    setShowLegacyProductSheets(false);
                  }
                }}
                className={cx(
                  "rounded-t-xl border border-b-0 px-4 py-2.5 text-sm font-medium transition",
                  activeSection === section.key
                    ? "border-white/15 bg-[#111827] text-white"
                    : "border-transparent bg-transparent text-zinc-500 hover:text-zinc-300",
                )}
              >
                {section.label}
              </button>
            ))}
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
                  placeholder={isIngredientSection ? "Search ingredients..." : "Search items or components..."}
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
              {showSuggestions && isIngredientSection && suggestions.length > 0 ? (
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
              {isIngredientSection ? (
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
              {isIngredientSection ? (
                <>
                  <button
                    className="inline-flex items-center gap-2 rounded-md border border-sky-500/30 bg-sky-500/15 px-3.5 py-2.5 text-sm font-medium text-sky-200 transition hover:bg-sky-500/25"
                    onClick={addRow}
                    type="button"
                  >
                    <Plus className="h-4 w-4" />
                    食材を追加
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
              {activeSection === "product" ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowLegacyProductSheets((prev) => {
                      const next = !prev;
                      if (next && activeSheet === INGREDIENT_SHEET && legacySheets[0]) {
                        setActiveSheet(legacySheets[0].key);
                      }
                      return next;
                    });
                  }}
                  className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.08]"
                >
                  <LayoutGrid className="h-4 w-4" />
                  {showLegacyProductSheets ? "商品マスタを表示" : "既存カテゴリを表示"}
                </button>
              ) : null}
              {isMasterSection && (!showLegacyRecipeSection || activeSection !== "product") ? (
                <button
                  type="button"
                  onClick={() => createNewMasterEditor(activeMasterType)}
                  className="inline-flex items-center gap-2 rounded-md border border-violet-500/30 bg-violet-500/15 px-3.5 py-2.5 text-sm font-medium text-violet-200 transition hover:bg-violet-500/25"
                >
                  <Plus className="h-4 w-4" />
                  {activeSection === "processed" ? "加工品を追加" : activeSection === "draft" ? "Draft を追加" : "商品を追加"}
                </button>
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

        {showLegacyRecipeSection ? (
          <div className="border-b border-white/10 bg-black/10 px-6 pt-2">
            <div className="flex items-end gap-1 overflow-x-auto border-b border-white/10">
              {legacySheets.map((sheet) => (
                <SheetTab
                  key={sheet.key}
                  name={sheet.name}
                  active={sheet.key === activeSheet}
                  onClick={() => setActiveSheet(sheet.key)}
                />
              ))}
            </div>
          </div>
        ) : null}

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
          {isMasterSection && !showLegacyRecipeSection ? (
            <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
              <div className="rounded-2xl border border-white/10 bg-[#0a101c] p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-white">
                      {activeSection === "processed" ? "加工品マスタ" : activeSection === "draft" ? "新商品用コスト計算" : "商品マスタ"}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {activeSection === "processed"
                        ? "食材と他の加工品を組み合わせた中間品を管理します。"
                        : activeSection === "draft"
                          ? "新商品の試算ドラフトを保存し、商品マスタへ publish できます。"
                          : "食材と加工品を使う販売商品を管理します。"}
                    </div>
                  </div>
                  {masterItemsLoading ? <Loader2 className="h-4 w-4 animate-spin text-violet-300" /> : null}
                </div>
                <div className="space-y-2">
                  {visibleMasterItems.length === 0 ? (
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-zinc-500">
                      No items found.
                    </div>
                  ) : visibleMasterItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => void loadMasterDetail(item.id)}
                      className={cx(
                        "w-full rounded-xl border px-4 py-3 text-left transition",
                        selectedMasterItemId === item.id || masterEditor?.id === item.id
                          ? "border-violet-500/30 bg-violet-500/10"
                          : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="truncate font-medium text-white">{item.name}</div>
                            {item.item_type !== "draft" && !item.yield_configured ? (
                              <span className="inline-flex shrink-0 rounded-full border border-red-500/30 bg-red-500/12 px-2 py-0.5 text-[10px] font-semibold text-red-300">
                                歩留未設定
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 text-xs text-zinc-500">{item.category || "—"}</div>
                        </div>
                        <div className="text-right text-xs">
                          <div className="font-mono text-zinc-300">{currencyCode} {Number(item.total_cost || 0).toFixed(2)}</div>
                          <div className="mt-1 text-zinc-500">{item.component_count} comps</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#0a101c] p-4">
                {masterDetailLoadingId ? (
                  <div className="flex items-center gap-2 text-sm text-zinc-500">
                    <Loader2 className="h-4 w-4 animate-spin text-violet-300" />
                    Loading item detail...
                  </div>
                ) : masterEditor ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-lg font-semibold text-white">
                            {masterEditor.id ? masterEditor.name || "Unnamed item" : "New item"}
                          </div>
                          {masterEditor.item_type !== "draft" && !masterEditor.yield_configured ? (
                            <span className="inline-flex rounded-full border border-red-500/30 bg-red-500/12 px-2 py-0.5 text-[10px] font-semibold text-red-300">
                              歩留未設定
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">
                          {masterEditor.item_type === "processed" ? "Processed master" : masterEditor.item_type === "draft" ? "Draft" : "Product master"}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void saveMasterEditor()}
                          disabled={masterDetailSaving}
                          className="inline-flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Save className="h-4 w-4" />
                          Save
                        </button>
                        {masterEditor.id && masterEditor.item_type === "product" ? (
                          <button
                            type="button"
                            onClick={() => void moveMasterItemToProcessed()}
                            disabled={masterActionBusy}
                            className="inline-flex items-center gap-2 rounded-md border border-violet-500/30 bg-violet-500/15 px-3 py-2 text-sm font-medium text-violet-200 hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <SkipForward className="h-4 w-4" />
                            加工品へ移動
                          </button>
                        ) : null}
                        {masterEditor.id ? (
                          <button
                            type="button"
                            onClick={() => void archiveSelectedMasterItem()}
                            disabled={masterActionBusy}
                            className="inline-flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-200 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <Trash2 className="h-4 w-4" />
                            Archive
                          </button>
                        ) : null}
                        {masterEditor.id && masterEditor.item_type === "draft" ? (
                          <button
                            type="button"
                            onClick={() => void publishSelectedDraft()}
                            disabled={masterActionBusy}
                            className="inline-flex items-center gap-2 rounded-md border border-sky-500/30 bg-sky-500/15 px-3 py-2 text-sm font-medium text-sky-200 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <ExternalLink className="h-4 w-4" />
                            Publish
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Name</div>
                        <input value={masterEditor.name} onChange={(e) => updateMasterEditor((current) => ({ ...current, name: e.target.value }))} className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-violet-500/50" />
                      </div>
                      <div>
                        <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Category</div>
                        <input value={masterEditor.category} onChange={(e) => updateMasterEditor((current) => ({ ...current, category: e.target.value }))} className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-violet-500/50" />
                      </div>
                      <div>
                        <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">{`Selling Price (${currencyCode})`}</div>
                        <input type="number" value={masterEditor.selling_price} onChange={(e) => updateMasterEditor((current) => ({ ...current, selling_price: normalizeNumber(e.target.value) }))} className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm font-mono text-white outline-none focus:border-violet-500/50" />
                      </div>
                      <div>
                        <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Buffer (%)</div>
                        <input type="number" value={Math.round(normalizeMenuBufferRate(masterEditor.buffer_rate) * 100)} onChange={(e) => updateMasterEditor((current) => ({ ...current, buffer_rate: normalizeMenuBufferRate(normalizeNumber(e.target.value) / 100) }))} className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm font-mono text-white outline-none focus:border-violet-500/50" />
                      </div>
                      <div>
                        <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">{masterItemTypeLabel(masterEditor.item_type)} Yield (%)</div>
                        <input type="number" value={masterEditor.yield_rate == null ? "" : Math.round(masterEditor.yield_rate * 100)} onChange={(e) => updateMasterEditor((current) => ({ ...current, yield_rate: e.target.value.trim() ? normalizeNumber(e.target.value) / 100 : null }))} className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm font-mono text-white outline-none focus:border-violet-500/50" />
                        <div className="mt-1 text-[11px] text-zinc-500">
                          {masterItemTypeLabel(masterEditor.item_type)}全体の歩留率です。各食材ごとに歩留やバッファー計算は入れず、食材マスタの単価を使って上部の歩留率とバッファーを{masterItemTypeLabel(masterEditor.item_type)}全体へ適用します。
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Output Qty</div>
                        <input type="number" value={masterEditor.output_qty} onChange={(e) => updateMasterEditor((current) => ({ ...current, output_qty: Math.max(1, normalizeNumber(e.target.value)) }))} className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm font-mono text-white outline-none focus:border-violet-500/50" />
                      </div>
                      <div>
                        <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Output Unit</div>
                        <input value={masterEditor.output_unit} onChange={(e) => updateMasterEditor((current) => ({ ...current, output_unit: e.target.value }))} className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-violet-500/50" />
                      </div>
                      <div>
                        <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Description</div>
                        <input value={masterEditor.description} onChange={(e) => updateMasterEditor((current) => ({ ...current, description: e.target.value }))} className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-violet-500/50" />
                      </div>
                    </div>

                    {masterEditor.item_type !== "draft" ? (
                      <div className={`grid gap-3 ${masterEditor.item_type === "processed" ? "md:grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)]" : "md:grid-cols-[180px_minmax(0,1fr)]"}`}>
                        <div>
                          <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Cost Unit Price</div>
                          <input
                            type="number"
                            value={masterEditor.cost_unit_price}
                            onChange={(e) => updateMasterEditor((current) => ({ ...current, cost_unit_price: normalizeNumber(e.target.value) }))}
                            className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm font-mono text-white outline-none focus:border-sky-500/50"
                          />
                          <div className="mt-1 text-[11px] text-zinc-500">
                            空欄または 0 の場合は、下の材料原価から自動計算します。
                          </div>
                        </div>
                        <div>
                          <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Formula</div>
                          <input
                            value={masterEditor.cost_unit_price_formula}
                            onChange={(e) => updateMasterEditor((current) => {
                              const nextFormula = e.target.value;
                              const evaluated = evaluateCostFormulaExpression(nextFormula);
                              return {
                                ...current,
                                cost_unit_price_formula: nextFormula,
                                cost_unit_price: evaluated != null ? evaluated : current.cost_unit_price,
                              };
                            })}
                            placeholder="(raw total / yield) * buffer / output qty"
                            className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-sky-500/50"
                          />
                          {masterEditor.cost_unit_price_formula.trim() ? (
                            <div className={`mt-1 text-[11px] ${masterFormulaResult != null ? "text-emerald-300" : "text-rose-300"}`}>
                              {masterFormulaResult != null
                                ? `Formula result: ${currencyCode} ${masterFormulaResult.toFixed(6)}`
                                : "Formula を計算できません"}
                            </div>
                          ) : null}
                        </div>
                        {masterEditor.item_type === "processed" ? (
                          <div>
                            <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Formula Note</div>
                            <input
                              value={masterEditor.cost_unit_price_formula_note}
                              onChange={(e) => updateMasterEditor((current) => ({ ...current, cost_unit_price_formula_note: e.target.value }))}
                              placeholder="加工品自体の単価メモ"
                              className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-sky-500/50"
                            />
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                        <div className="text-[10px] uppercase tracking-wide text-zinc-500">合計金額</div>
                        <div className="mt-2 font-mono text-lg text-white">{currencyCode} {masterComponentSummary.totalAmount.toFixed(2)}</div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                        <div className="text-[10px] uppercase tracking-wide text-zinc-500">合計グラム数</div>
                        <div className="mt-2 font-mono text-lg text-white">{formatGramTotal(masterComponentSummary.totalGrams)}</div>
                      </div>
                    </div>

                    <div className="overflow-visible rounded-xl border border-white/10">
                      <div className="grid grid-cols-[110px_minmax(0,1fr)_120px_100px_100px_40px] gap-2 border-b border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                        <div>Type</div>
                        <div>Component</div>
                        <div className="text-right">Qty</div>
                        <div>Unit</div>
                        <div className="text-right">Cost</div>
                        <div />
                      </div>
                      <div className="border-b border-white/5 bg-sky-500/5 px-3 py-2 text-xs text-sky-100/80">
                        この画面では各構成食材ごとの歩留率やバッファー計算は設定しません。食材マスタの単価と、必要に応じて他の加工品マスタや商品マスタを使い、上部の {masterItemTypeLabel(masterEditor.item_type)} 用 Buffer / Yield を {masterItemTypeLabel(masterEditor.item_type)} 全体に適用します。
                      </div>
                      {masterEditor.components.map((component) => {
                        const suggestions = getMasterComponentSuggestions(component);
                        const selectedOption = component.component_type === "ingredient"
                          ? allIngredientOptions.find((option) => String(option.id) === String(component.ingredient_id))
                          : processedComponentOptions.find((option) => String(option.id) === String(component.component_menu_item_id));
                        return (
                          <div key={component.id} className="border-b border-white/5 px-3 py-3 last:border-b-0">
                            <div className="grid grid-cols-[110px_minmax(0,1fr)_120px_100px_100px_40px] items-center gap-2 text-sm">
                              <select
                                value={component.component_type}
                                onChange={(e) => updateMasterComponentRow(component.id, (current) => ({
                                  ...current,
                                  component_type: e.target.value === "processed_item" ? "processed_item" : "ingredient",
                                  ingredient_id: "",
                                  component_menu_item_id: "",
                                  name: "",
                                  category: "",
                                  unit: "",
                                  unit_cost: 0,
                                  unit_price_formula: "",
                                  unit_price_formula_note: "",
                                  ingredient_detail_loaded: false,
                                }))}
                                className="rounded border border-white/15 bg-white/5 px-2 py-2 text-sm text-white outline-none focus:border-violet-500/50"
                              >
                                <option value="ingredient">Ingredient</option>
                                <option value="processed_item">{masterComponentOptionLabel(masterEditor.item_type)}</option>
                              </select>
                              <div className="relative">
                                <input
                                  value={component.name}
                                  onFocus={() => {
                                    setActiveMasterComponentLookupId(component.id);
                                    if (
                                      component.component_type === "ingredient"
                                      && component.ingredient_id
                                      && !component.ingredient_detail_loaded
                                    ) {
                                      void loadMasterComponentIngredientDetail(component.id, component.ingredient_id);
                                    }
                                  }}
                                  onBlur={() => {
                                    window.setTimeout(() => {
                                      setActiveMasterComponentLookupId((current) => (current === component.id ? null : current));
                                    }, 120);
                                  }}
                                  onChange={(e) => updateMasterComponentRow(component.id, (current) => ({
                                    ...current,
                                    ingredient_id: "",
                                    component_menu_item_id: "",
                                    name: e.target.value,
                                    category: "",
                                    unit: "",
                                    unit_cost: 0,
                                    unit_price_formula: "",
                                    unit_price_formula_note: "",
                                    ingredient_detail_loaded: false,
                                  }))}
                                  placeholder={component.component_type === "ingredient" ? "Type ingredient name" : `Type ${masterComponentOptionLabel(masterEditor.item_type).toLowerCase()} name`}
                                  className="w-full rounded border border-white/15 bg-white/5 px-2 py-2 text-sm text-white outline-none focus:border-violet-500/50"
                                />
                                {activeMasterComponentLookupId === component.id && component.name.trim().length > 0 ? (
                                  <div className="absolute left-0 top-full z-50 mt-1 max-h-64 min-w-[420px] overflow-y-auto rounded-lg border border-white/10 bg-[#111827] shadow-2xl shadow-black/40">
                                    {componentOptionsLoading && component.component_type === "processed_item" ? (
                                      <div className="px-3 py-2 text-xs text-zinc-500">Loading...</div>
                                    ) : suggestions.length > 0 ? (
                                      suggestions.map((option) => (
                                        <button
                                          key={`${component.id}-${option.component_type}-${option.id}`}
                                          type="button"
                                          onMouseDown={(event) => {
                                            event.preventDefault();
                                            selectMasterComponentOption(component.id, option);
                                            if (option.component_type === "ingredient") {
                                              void loadMasterComponentIngredientDetail(component.id, option.id);
                                            }
                                          }}
                                          className="flex w-full items-center justify-between gap-3 border-b border-white/5 px-3 py-2 text-left text-sm text-zinc-200 transition last:border-b-0 hover:bg-white/[0.06]"
                                        >
                                          <span className="flex-1">{option.name}</span>
                                          <span className="shrink-0 text-xs text-zinc-500">{option.category} · {option.unit || "—"}</span>
                                        </button>
                                      ))
                                    ) : (
                                      <div className="px-3 py-2 text-xs text-zinc-500">
                                        {component.component_type === "ingredient" ? "No ingredient matches." : "No master-item matches."}
                                      </div>
                                    )}
                                  </div>
                                ) : null}
                                {selectedOption ? (
                                  <div className="mt-1 text-[11px] text-zinc-500">
                                    {selectedOption.category} · {selectedOption.unit || "—"}
                                  </div>
                                ) : component.name.trim() ? (
                                  <div className="mt-1 text-[11px] text-amber-300">候補から選択してください</div>
                                ) : null}
                              </div>
                              <input
                                type="number"
                                value={component.quantity}
                                onChange={(e) => updateMasterComponentRow(component.id, (current) => ({ ...current, quantity: normalizeNumber(e.target.value) }))}
                                className="rounded border border-white/15 bg-white/5 px-2 py-2 text-right text-sm font-mono text-white outline-none focus:border-violet-500/50"
                              />
                              <div className="text-zinc-300">{component.unit || selectedOption?.unit || "—"}</div>
                              <div className="text-right font-mono text-zinc-300">{currencyCode} {(Number(component.quantity || 0) * Number(component.unit_cost || 0)).toFixed(2)}</div>
                              <button type="button" onClick={() => removeMasterComponentRow(component.id)} className="flex h-8 w-8 items-center justify-center rounded border border-white/10 bg-white/5 text-zinc-500 hover:bg-white/10 hover:text-white">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>

                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => addMasterComponentRow("ingredient")} className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-200 hover:bg-white/[0.08]">
                        <Plus className="mr-1 inline h-3.5 w-3.5" />
                        Add Ingredient
                      </button>
                      <button type="button" onClick={() => addMasterComponentRow("processed_item")} className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-200 hover:bg-white/[0.08]">
                        <Plus className="mr-1 inline h-3.5 w-3.5" />
                        {masterEditor.item_type === "processed" ? "Add Processed Item" : "Add Master Item"}
                      </button>
                    </div>

                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                        <div className="text-[10px] uppercase tracking-wide text-zinc-500">Raw Cost</div>
                        <div className="mt-2 font-mono text-lg text-white">{currencyCode} {Number(masterEditorPreview?.raw_cost || 0).toFixed(2)}</div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                        <div className="text-[10px] uppercase tracking-wide text-zinc-500">Total Cost</div>
                        <div className="mt-2 font-mono text-lg text-white">{currencyCode} {Number(masterEditorPreview?.total_cost || 0).toFixed(2)}</div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                        <div className="text-[10px] uppercase tracking-wide text-zinc-500">Unit Cost</div>
                        <div className="mt-2 font-mono text-lg text-white">{currencyCode} {Number(masterEditorPreview?.unit_cost || 0).toFixed(2)}</div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                        <div className="text-[10px] uppercase tracking-wide text-zinc-500">Cost Ratio</div>
                        <div className="mt-2 font-mono text-lg text-white">
                          {masterEditorPreview?.cost_ratio == null ? "—" : `${(masterEditorPreview.cost_ratio * 100).toFixed(1)}%`}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-10 text-sm text-zinc-500">
                    Select an item from the list or create a new one.
                  </div>
                )}
              </div>
            </div>
          ) : isInvoiceSection ? (
            <div className="space-y-4">
              {/* Sync control card */}
              <div className="rounded-2xl border border-white/10 bg-[#0a101c] p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">仕入価格 → Cost Calculation 同期</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      Google Sheetsの請求書データをもとに食材マスタの計算単価を自動更新します。<br />
                      マッピングが登録済みの食材のみ更新されます。新規マッピングは「食材マスタ」タブで登録してください。
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {invoiceSyncBusy ? <Loader2 className="h-4 w-4 animate-spin text-violet-300" /> : null}
                    <button
                      type="button"
                      onClick={() => void runInvoiceSync(true)}
                      disabled={invoiceSyncBusy}
                      className="rounded-xl border border-violet-600/40 bg-violet-950/30 px-4 py-2 text-xs text-violet-300 transition hover:bg-violet-900/40 disabled:opacity-60"
                    >
                      プレビュー
                    </button>
                    <button
                      type="button"
                      onClick={() => void runInvoiceSync(false)}
                      disabled={invoiceSyncBusy}
                      className="rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-2 text-xs font-semibold text-white transition hover:from-violet-500 hover:to-purple-500 disabled:opacity-60"
                    >
                      <RotateCcw className="mr-1.5 inline h-3.5 w-3.5" />
                      同期実行
                    </button>
                  </div>
                </div>

                {invoiceSyncError ? (
                  <div className="rounded-xl border border-red-900/40 bg-red-950/20 px-4 py-3 text-sm text-red-300">
                    <AlertTriangle className="mr-1.5 inline h-4 w-4" />
                    {invoiceSyncError}
                  </div>
                ) : invoiceSyncResult ? (
                  <div className="space-y-3">
                    {invoiceSyncResult.dry_run ? (
                      <div className="rounded-xl border border-amber-700/40 bg-amber-900/15 px-4 py-3 text-sm text-amber-300">
                        ⚠️ プレビュー結果（実際の変更はまだ行われていません）
                      </div>
                    ) : (
                      <div className="rounded-xl border border-emerald-700/40 bg-emerald-900/15 px-4 py-3 text-sm text-emerald-300">
                        ✅ 同期完了 — <span className="font-bold">{invoiceSyncResult.updated ?? "?"}</span> 件の食材単価を更新しました
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                      {[
                        { label: "請求書行数", value: invoiceSyncResult.total_rows ?? "—" },
                        { label: "マッチ", value: invoiceSyncResult.matched ?? "—" },
                        { label: "更新", value: invoiceSyncResult.updated ?? "—" },
                        { label: "スキップ", value: (invoiceSyncResult.skipped_unmatched ?? 0) + (invoiceSyncResult.skipped_unit_conversion ?? 0) + (invoiceSyncResult.skipped_matched_but_unmapped ?? 0) },
                      ].map((kpi) => (
                        <div key={kpi.label} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3">
                          <div className="text-[10px] uppercase tracking-wide text-zinc-500">{kpi.label}</div>
                          <div className="mt-1 font-mono text-xl text-white">{kpi.value}</div>
                        </div>
                      ))}
                    </div>
                    {Array.isArray(invoiceSyncResult.updates) && invoiceSyncResult.updates.length > 0 ? (
                      <div className="overflow-hidden rounded-xl border border-white/10">
                        <div className="grid grid-cols-[minmax(0,1fr)_90px_90px] bg-white/[0.04] px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                          <div>食材</div>
                          <div className="text-right">更新前</div>
                          <div className="text-right">更新後</div>
                        </div>
                        {invoiceSyncResult.updates.map((u: any, i: number) => (
                          <div key={i} className="grid grid-cols-[minmax(0,1fr)_90px_90px] border-t border-white/5 px-3 py-2 text-sm">
                            <div className="truncate text-white">{u.ingredient_name}</div>
                            <div className="text-right font-mono text-zinc-400">{Number(u.previous_unit_price || 0).toFixed(4)}</div>
                            <div className="text-right font-mono text-emerald-300">{Number(u.next_unit_price || 0).toFixed(4)}</div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {Array.isArray(invoiceSyncResult.skipped_items) && invoiceSyncResult.skipped_items.length > 0 ? (
                      <details className="rounded-xl border border-white/10">
                        <summary className="cursor-pointer px-4 py-2.5 text-xs text-zinc-500 hover:text-zinc-300">
                          スキップ詳細 ({invoiceSyncResult.skipped_items.length} 件)
                        </summary>
                        <div className="max-h-40 overflow-y-auto border-t border-white/5">
                          {invoiceSyncResult.skipped_items.map((item: any, i: number) => (
                            <div key={i} className="border-b border-white/5 px-4 py-2 text-xs last:border-b-0">
                              <span className="text-zinc-300">{item.item_description || "—"}</span>
                              <span className="ml-2 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">{item.reason}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {/* Mapping list + edit panel */}
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                {/* Left: mapping list */}
                <div className="rounded-2xl border border-white/10 bg-[#0a101c] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white">登録済みマッピング</div>
                      <div className="mt-1 text-xs text-zinc-500">これらの品目が同期対象になります。</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {(invoiceMappingLoading || invoiceMappingSaving) ? <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-300" /> : null}
                      <div className="text-xs font-mono text-zinc-500">{invoiceMappings.length} 件</div>
                    </div>
                  </div>
                  <div className="max-h-[28rem] overflow-y-auto rounded-xl border border-white/10">
                    {invoiceMappingLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
                      </div>
                    ) : invoiceMappings.length === 0 ? (
                      <div className="px-4 py-6 text-sm text-zinc-500">マッピングなし。</div>
                    ) : invoiceMappings.map((m) => (
                      <div
                        key={m.id}
                        className={cx(
                          "border-b border-white/5 px-3 py-3 last:border-b-0",
                          editingInvoiceMappingId === m.id ? "bg-amber-500/8" : "",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-medium text-white">{m.invoice_item_description}</div>
                            <div className="mt-0.5 text-[10px] text-zinc-500">
                              {m.supplier_name || "—"} · {m.invoice_unit || "—"} → {m.ingredient_name_snapshot || "—"} ({m.ingredient_unit || "—"})
                            </div>
                            {m.conversion_rule ? (
                              <div className="mt-0.5 font-mono text-[10px] text-zinc-600">{m.conversion_rule}</div>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              onClick={() => startEditingInvoiceMapping(m)}
                              disabled={invoiceMappingSaving}
                              className="inline-flex items-center gap-1 rounded border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[10px] text-sky-300 hover:bg-sky-500/20 disabled:opacity-60"
                            >
                              <Pencil className="h-3 w-3" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void disableInvoiceItemMapping(m.id)}
                              disabled={invoiceMappingSaving}
                              className="inline-flex items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] text-red-300 hover:bg-red-500/20 disabled:opacity-60"
                            >
                              <Trash2 className="h-3 w-3" />
                              Off
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right: edit/create panel or unmatched summary */}
                {(editingInvoiceMappingId || selectedUnmatchedItemKey) ? (
                  <div className={cx("rounded-2xl border bg-[#0a101c] p-4", editingInvoiceMappingId ? "border-amber-500/20" : "border-sky-500/20")}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-white">
                        {editingInvoiceMappingId ? "マッピング編集" : "新規マッピング作成"}
                      </div>
                      <button
                        type="button"
                        onClick={() => { setEditingInvoiceMappingId(null); setSelectedUnmatchedItemKey(""); setMappingMode("create"); setMappingSaveError(""); }}
                        className="text-zinc-500 hover:text-zinc-200"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Source item info */}
                    <div className="mb-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs">
                      <div className="font-medium text-white">{mappingSourceItemDescription}</div>
                      <div className="mt-0.5 text-zinc-500">{mappingSourceSupplierName || "—"} · {mappingSourceInvoiceUnit || "—"}</div>
                    </div>

                    <div className="space-y-3">
                      {/* Ingredient autocomplete */}
                      <div>
                        <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">食材検索</div>
                        <div className="relative">
                          {/* Show selected ingredient as chip if confirmed */}
                          {selectedMappingIngredientId && !showMappingIngredientDropdown ? (
                            <div className="flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2">
                              <span className="flex-1 text-sm text-sky-200">
                                {allIngredientOptions.find((o) => String(o.id) === selectedMappingIngredientId)?.name || mappingIngredientSearch}
                                <span className="ml-1.5 text-xs text-sky-400/60">
                                  ({allIngredientOptions.find((o) => String(o.id) === selectedMappingIngredientId)?.unit || ""})
                                </span>
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedMappingIngredientId("");
                                  setMappingIngredientSearch("");
                                  setMappingIngredientUnit("");
                                  setShowMappingIngredientDropdown(true);
                                }}
                                className="text-sky-400/60 hover:text-sky-200"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <input
                              value={mappingIngredientSearch}
                              onChange={(e) => {
                                setMappingIngredientSearch(e.target.value);
                                setSelectedMappingIngredientId("");
                                setShowMappingIngredientDropdown(true);
                              }}
                              onFocus={() => setShowMappingIngredientDropdown(true)}
                              onBlur={() => setTimeout(() => setShowMappingIngredientDropdown(false), 150)}
                              placeholder="食材名を入力..."
                              autoComplete="off"
                              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-sky-500/50"
                            />
                          )}
                          {/* Dropdown candidates */}
                          {showMappingIngredientDropdown && mappingIngredientOptions.length > 0 && (
                            <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border border-white/15 bg-[#0d1520] shadow-xl">
                              {mappingIngredientOptions.map((o) => (
                                <button
                                  key={o.id}
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault(); // prevent onBlur firing first
                                    setSelectedMappingIngredientId(String(o.id));
                                    setMappingIngredientSearch(o.name);
                                    setMappingIngredientUnit(o.unit || "");
                                    setShowMappingIngredientDropdown(false);
                                  }}
                                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-white/[0.06]"
                                >
                                  <span className="text-white">{o.name}</span>
                                  <span className="ml-2 shrink-0 text-xs text-zinc-500">{o.unit}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Units row */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">請求書単位</div>
                          <input
                            value={mappingSourceInvoiceUnit}
                            onChange={(e) => setMappingSourceInvoiceUnit(e.target.value)}
                            placeholder="e.g. TIN"
                            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-sky-500/50"
                          />
                        </div>
                        <div>
                          <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">食材単位</div>
                          <input
                            value={mappingIngredientUnit}
                            onChange={(e) => setMappingIngredientUnit(e.target.value)}
                            placeholder="e.g. ml"
                            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-sky-500/50"
                          />
                        </div>
                      </div>
                      {/* Conversion rule */}
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <div className="text-[10px] uppercase tracking-wide text-zinc-500">変換ルール</div>
                          {mappingSourceInvoiceUnit ? (
                            <div className="text-[10px] text-sky-400/70">{(() => { const h = conversionRuleHint(mappingSourceInvoiceUnit); return h || null; })()}</div>
                          ) : null}
                        </div>
                        <input
                          value={mappingConversionRule}
                          onChange={(e) => setMappingConversionRule(e.target.value)}
                          placeholder="e.g. 1 TRAY = 30 pc"
                          className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-sky-500/50"
                        />
                        <ConversionPreview
                          rule={mappingConversionRule}
                          invoiceUnit={mappingSourceInvoiceUnit}
                          ingredientUnit={mappingIngredientUnit}
                          invoiceUnitPrice={activeMappingSelectionMeta.latestUnitPrice}
                          ingredientUnitPrice={Number(allIngredientOptions.find((o) => String(o.id) === String(selectedMappingIngredientId))?.unit_price || 0)}
                          currency={currencyCode}
                        />
                      </div>
                      {/* Notes */}
                      <div>
                        <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">メモ</div>
                        <input
                          value={mappingNotes}
                          onChange={(e) => setMappingNotes(e.target.value)}
                          className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-sky-500/50"
                        />
                      </div>
                      {mappingSaveError ? (
                        <div className="rounded-lg border border-red-900/40 bg-red-950/20 px-3 py-2 text-xs text-red-300">{mappingSaveError}</div>
                      ) : null}
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => void saveInvoiceItemMapping()}
                          disabled={invoiceMappingSaving || !selectedMappingIngredientId}
                          className="flex-1 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 py-2 text-xs font-semibold text-white disabled:opacity-60"
                        >
                          {invoiceMappingSaving ? "保存中..." : "保存"}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditingInvoiceMappingId(null); setSelectedUnmatchedItemKey(""); setMappingMode("create"); }}
                          className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-zinc-300 hover:bg-white/[0.08]"
                        >
                          キャンセル
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-[#0a101c] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-white">未マッピング品目</div>
                        <div className="mt-1 text-xs text-zinc-500">同期対象外。マッピング登録が必要です。</div>
                      </div>
                      <div className="text-xs font-mono text-zinc-500">{unmatchedInvoiceItems.length} 件</div>
                    </div>
                    <div className="max-h-[28rem] overflow-y-auto rounded-xl border border-white/10">
                      {invoiceMappingLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
                        </div>
                      ) : unmatchedInvoiceItems.length === 0 ? (
                        <div className="px-4 py-6 text-sm text-zinc-500">未マッピング品目なし。</div>
                      ) : unmatchedInvoiceItems.map((item, i) => {
                        const itemKey = unmatchedInvoiceItemKey(item);
                        const isSelected = selectedUnmatchedItemKey === itemKey;
                        return (
                          <div
                            key={i}
                            onClick={() => {
                              setEditingInvoiceMappingId(null);
                              setMappingMode("create");
                              setSelectedUnmatchedItemKey(itemKey);
                              setMappingSourceItemDescription(item.item_description || "");
                              setMappingSourceSupplierName(item.supplier_name || "");
                              setMappingSourceInvoiceUnit(item.unit || "");
                              setSelectedMappingIngredientId("");
                              setMappingIngredientSearch("");
                              setMappingIngredientUnit("");
                              setMappingConversionRule("");
                              setMappingNotes("");
                              setMappingSaveError("");
                            }}
                            className={cx(
                              "cursor-pointer border-b border-white/5 px-3 py-2.5 last:border-b-0 transition hover:bg-white/[0.04]",
                              isSelected ? "bg-sky-500/10 border-l-2 border-l-sky-500" : "",
                            )}
                          >
                            <div className={cx("text-xs font-medium", isSelected ? "text-sky-200" : "text-white")}>{item.item_description}</div>
                            <div className="mt-0.5 text-[10px] text-zinc-500">
                              {item.supplier_name || "—"} · {item.unit || "—"} · {currencyCode} {Number(item.latest_unit_price || 0).toFixed(2)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <div className={cx((isMasterSection && !showLegacyRecipeSection || isInvoiceSection) && "hidden")}>
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
          ) : showLegacyRecipeSection ? (
            <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-white">{sheetName(activeSheet)}</div>
                  <div className="mt-1 text-sm text-zinc-500">
                    {activeCategoryMeta?.is_system
                      ? "Excel sheet tab. You can move items out, then delete this tab if you no longer need it."
                      : "Click a menu name to open and edit its recipe."}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => void createMenuCategory()}
                    disabled={categoryActionBusy}
                    className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Plus className="h-4 w-4" />
                    Add Category
                  </button>
                  {activeCategoryMeta ? (
                    <>
                      {!activeCategoryMeta?.is_system ? (
                      <button
                        type="button"
                        onClick={() => void renameActiveCategory()}
                        disabled={categoryActionBusy}
                        className="inline-flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-200 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Pencil className="h-4 w-4" />
                        Rename Category
                      </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void deleteActiveCategory()}
                        disabled={categoryActionBusy}
                        className="inline-flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-200 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete Category
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setShowAddItemForm((prev) => !prev)}
                    className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-white/[0.08]"
                  >
                    <Plus className="h-4 w-4" />
                    + Add Item
                  </button>
                </div>
              </div>

              {showAddItemForm ? (
                <div className="mb-5 rounded-2xl border border-white/10 bg-[#0c1322] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                  <div className="mb-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_180px_140px]">
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
                          <option key={item.key} value={item.name}>
                            {item.name}
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
                    <div>
                      <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Buffer (%)</div>
                      <input
                        type="number"
                        value={newItemBuffer}
                        onChange={(e) => setNewItemBuffer(e.target.value)}
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
                        setNewItemBuffer("115");
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
                                      <div className="flex flex-wrap items-center justify-end gap-2">
                                        <button
                                          type="button"
                                          onClick={() => void deleteRecipeMenuItem(item.id, item.name)}
                                          disabled={menuDetailSavingId === item.id}
                                          className="inline-flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-200 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                          Delete Item
                                        </button>
                                      </div>
                                      <div className="grid gap-3 md:grid-cols-[220px_220px_160px_220px_1fr]">
                                        <div>
                                          <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Category</div>
                                          <select
                                            value={detail.category}
                                            onChange={(e) => updateMenuDetailLocal(item.id, (current) => ({ ...current, category: e.target.value }))}
                                            onBlur={() => void saveMenuCategory(item.id, menuDetails[item.id]?.category ?? detail.category)}
                                            className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-violet-500/50"
                                          >
                                            {[detail.category, ...menuCategories.map((categoryItem) => categoryItem.name)]
                                              .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index)
                                              .map((categoryName) => (
                                              <option key={categoryName} value={categoryName}>
                                                {categoryName}
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
                                        <div>
                                          <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Buffer (%)</div>
                                          <div className="flex gap-2">
                                            <input
                                              type="number"
                                              value={Math.round(normalizeMenuBufferRate(detail.yield_rate) * 100)}
                                              onChange={(e) => updateMenuDetailLocal(item.id, (current) => ({ ...current, yield_rate: normalizeMenuBufferRate(normalizeNumber(e.target.value) / 100) }))}
                                              className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm font-mono text-white outline-none focus:border-violet-500/50"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => void saveRecipeMenuItemBuffer(item.id, String(Math.round(normalizeMenuBufferRate(menuDetails[item.id]?.yield_rate ?? detail.yield_rate) * 100)))}
                                              disabled={menuDetailSavingId === item.id}
                                              className="inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/15 px-3 py-2 text-xs font-medium text-sky-200 transition-colors hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                              <Percent className="h-3.5 w-3.5" />
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
              {activeSheet === INGREDIENT_SHEET ? <col style={{ width: 96 }} /> : null}
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
                              <div className="absolute left-0 top-full z-50 mt-1 max-h-48 min-w-[320px] overflow-y-auto rounded border border-white/10 bg-[#111521] shadow-xl">
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
                            if (activeSheet === INGREDIENT_SHEET && ingredientRow._new) {
                              selectCell(rowIndex, column.key);
                              if (column.key !== "row_num") {
                                startEdit(rowIndex, column.key);
                              }
                              return;
                            }
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
                      <td
                        className={cx(
                          "sticky right-0 w-[96px] min-w-[96px] border-l border-white/10 px-2 py-2 overflow-visible",
                          activeIngredientActionMenuId === String(ingredientRow.id) ? "z-40" : "z-20",
                          activeSheet === INGREDIENT_SHEET && highlightedIngredientId === String(ingredientRow.id)
                            ? "bg-[#172033]"
                            : rowIndex % 2 === 0
                              ? "bg-[#0f1625]"
                              : "bg-[#0c1322]",
                        )}
                      >
                        <div className="relative flex items-center justify-end gap-1" data-ingredient-action-menu>
                          <button
                            type="button"
                            onClick={() => setActiveIngredientActionMenuId((current) => current === ingredientRow.id ? null : String(ingredientRow.id))}
                            disabled={ingredientPromotionKey != null}
                            className="inline-flex items-center rounded border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[11px] text-violet-200 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            移動
                          </button>
                          <button
                            type="button"
                            onClick={() => void openIngredientDetail(ingredientRow)}
                            title="詳細を見る"
                            className="inline-flex h-7 w-7 items-center justify-center rounded border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-sky-300"
                          >
                            <History className="h-3.5 w-3.5" />
                          </button>
                          {activeIngredientActionMenuId === String(ingredientRow.id) ? (
                            <div className="absolute right-0 top-full z-[70] mt-1 w-36 rounded-lg border border-white/10 bg-[#111827] p-1 shadow-2xl shadow-black/40">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveIngredientActionMenuId(null);
                                  void promoteIngredientToMaster(ingredientRow, "processed");
                                }}
                                disabled={ingredientPromotionKey != null}
                                className="flex w-full items-center justify-center gap-1 rounded px-2 py-2 text-[11px] text-violet-200 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {ingredientPromotionKey === `processed:${ingredientRow.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                                加工品へ移動
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveIngredientActionMenuId(null);
                                  void promoteIngredientToMaster(ingredientRow, "product");
                                }}
                                disabled={ingredientPromotionKey != null}
                                className="flex w-full items-center justify-center gap-1 rounded px-2 py-2 text-[11px] text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {ingredientPromotionKey === `product:${ingredientRow.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                                商品へ移動
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
          )}
          </div>
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
