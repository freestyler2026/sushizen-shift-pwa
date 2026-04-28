import { BRANCHES, type City } from "@/lib/branches";

export type InventoryItemLookup = {
  id: string;
  name: string;
  sku: string;
  category_name: string;
  item_type: string;
  supplier_name: string;
  storage_unit: string;
  cost: number;
  status: string;
};

export type InventoryCountLine = {
  id?: string | number;
  item_id: string;
  category: string;
  supplier_name: string;
  item_name: string;
  invoice_name: string;
  sku: string;
  storage_unit: string;
  unit_price: number;
  theoretical_qty: number;
  counted_qty: number;
  variance_qty: number;
  asset_value: number;
  memo: string;
  foodics_data: string;
  order_difference: string;
  sort_order: number;
  matched?: boolean;
};

export function monthNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function defaultBranch(city: City) {
  return BRANCHES[city][0]?.code || "";
}

export function number3(value: number) {
  return Number(value || 0).toFixed(3);
}

export function lineAssetValue(line: InventoryCountLine) {
  const explicit = Number(line.asset_value || 0);
  if (explicit) return explicit;
  return Number(line.counted_qty || 0) * Number(line.unit_price || 0);
}

export function withVariance(line: InventoryCountLine): InventoryCountLine {
  const theoretical = Number(line.theoretical_qty || 0);
  const counted = Number(line.counted_qty || 0);
  return {
    ...line,
    theoretical_qty: theoretical,
    counted_qty: counted,
    variance_qty: Number((counted - theoretical).toFixed(3)),
    asset_value: Number(lineAssetValue({ ...line, theoretical_qty: theoretical, counted_qty: counted, variance_qty: line.variance_qty }).toFixed(3)),
  };
}

export function emptyCountLine(sortOrder = 0): InventoryCountLine {
  return {
    item_id: "",
    category: "",
    supplier_name: "",
    item_name: "",
    invoice_name: "",
    sku: "",
    storage_unit: "",
    unit_price: 0,
    theoretical_qty: 0,
    counted_qty: 0,
    variance_qty: 0,
    asset_value: 0,
    memo: "",
    foodics_data: "",
    order_difference: "",
    sort_order: sortOrder,
  };
}

export function lineFromItem(item: InventoryItemLookup, sortOrder = 0): InventoryCountLine {
  return {
    item_id: item.id,
    category: item.category_name || "",
    supplier_name: item.supplier_name || "",
    item_name: item.name,
    invoice_name: item.name,
    sku: item.sku || "",
    storage_unit: item.storage_unit || "",
    unit_price: Number(item.cost || 0),
    theoretical_qty: 0,
    counted_qty: 0,
    variance_qty: 0,
    asset_value: 0,
    memo: "",
    foodics_data: "",
    order_difference: "",
    sort_order: sortOrder,
  };
}

export function groupBySupplier(lines: InventoryCountLine[]) {
  const groups = new Map<string, InventoryCountLine[]>();
  for (const line of [...lines].sort((a, b) => {
    const supplierCmp = String(a.supplier_name || "").localeCompare(String(b.supplier_name || ""));
    if (supplierCmp !== 0) return supplierCmp;
    const sortCmp = Number(a.sort_order || 0) - Number(b.sort_order || 0);
    if (sortCmp !== 0) return sortCmp;
    return String(a.item_name || "").localeCompare(String(b.item_name || ""));
  })) {
    const supplier = String(line.supplier_name || "").trim() || "Unknown supplier";
    const existing = groups.get(supplier) || [];
    existing.push(line);
    groups.set(supplier, existing);
  }
  return Array.from(groups.entries()).map(([supplier, rows]) => ({ supplier, rows }));
}
