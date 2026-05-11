// tests/admin/inventory/utils.test.ts
// Unit tests for src/lib/inventoryCountUtils.ts — pure functions, no DOM needed.

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  monthNow,
  todayIso,
  defaultBranch,
  number3,
  lineAssetValue,
  withVariance,
  emptyCountLine,
  lineFromItem,
  groupBySupplier,
  type InventoryCountLine,
  type InventoryItemLookup,
} from "@/lib/inventoryCountUtils";

// ── monthNow ─────────────────────────────────────────────────────────────────
describe("monthNow()", () => {
  it("returns YYYY-MM formatted string", () => {
    const result = monthNow();
    expect(result).toMatch(/^\d{4}-\d{2}$/);
  });

  it("month is padded to 2 digits", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15"));
    expect(monthNow()).toBe("2026-01");
    vi.useRealTimers();
  });

  it("returns correct year and month for december", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-12-31"));
    expect(monthNow()).toBe("2025-12");
    vi.useRealTimers();
  });
});

// ── todayIso ──────────────────────────────────────────────────────────────────
describe("todayIso()", () => {
  it("returns YYYY-MM-DD formatted string", () => {
    const result = todayIso();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns correct date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-10T12:00:00Z"));
    expect(todayIso()).toBe("2026-05-10");
    vi.useRealTimers();
  });
});

// ── defaultBranch ─────────────────────────────────────────────────────────────
describe("defaultBranch()", () => {
  it("returns a non-empty string for manila", () => {
    const result = defaultBranch("manila");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns a non-empty string for dubai", () => {
    const result = defaultBranch("dubai");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── number3 ───────────────────────────────────────────────────────────────────
describe("number3()", () => {
  it("formats number to 3 decimal places", () => {
    expect(number3(1.5)).toBe("1.500");
    expect(number3(100)).toBe("100.000");
    expect(number3(0.1234)).toBe("0.123");
  });

  it("handles 0", () => {
    expect(number3(0)).toBe("0.000");
  });

  it("handles falsy value (null-ish) as 0", () => {
    expect(number3(0)).toBe("0.000");
    expect(number3(null as unknown as number)).toBe("0.000");
    expect(number3(undefined as unknown as number)).toBe("0.000");
  });
});

// ── lineAssetValue ────────────────────────────────────────────────────────────
describe("lineAssetValue()", () => {
  const baseLine: InventoryCountLine = {
    item_id: "item1",
    category: "Protein",
    supplier_name: "Supplier A",
    item_name: "Salmon",
    invoice_name: "Salmon",
    sku: "SKU-001",
    storage_unit: "kg",
    unit_price: 100,
    theoretical_qty: 5,
    counted_qty: 4,
    variance_qty: -1,
    asset_value: 0,
    memo: "",
    foodics_data: "",
    order_difference: "",
    sort_order: 1,
  };

  it("returns counted_qty * unit_price when asset_value is 0", () => {
    expect(lineAssetValue(baseLine)).toBe(400); // 4 * 100
  });

  it("returns explicit asset_value if set (non-zero)", () => {
    expect(lineAssetValue({ ...baseLine, asset_value: 350 })).toBe(350);
  });

  it("returns 0 when counted_qty and unit_price are both 0", () => {
    expect(lineAssetValue({ ...baseLine, counted_qty: 0, unit_price: 0 })).toBe(0);
  });

  it("handles fractional quantities correctly", () => {
    expect(lineAssetValue({ ...baseLine, counted_qty: 2.5, unit_price: 40, asset_value: 0 })).toBe(100);
  });
});

// ── withVariance ──────────────────────────────────────────────────────────────
describe("withVariance()", () => {
  const baseLine: InventoryCountLine = {
    item_id: "item1",
    category: "Protein",
    supplier_name: "Supplier A",
    item_name: "Salmon",
    invoice_name: "Salmon",
    sku: "SKU-001",
    storage_unit: "kg",
    unit_price: 100,
    theoretical_qty: 5,
    counted_qty: 4,
    variance_qty: 0,
    asset_value: 0,
    memo: "",
    foodics_data: "",
    order_difference: "",
    sort_order: 1,
  };

  it("computes variance_qty = counted - theoretical", () => {
    const result = withVariance(baseLine);
    expect(result.variance_qty).toBe(-1);
  });

  it("rounds variance to 3 decimal places", () => {
    const line = { ...baseLine, counted_qty: 1.1234, theoretical_qty: 1 };
    const result = withVariance(line);
    expect(result.variance_qty).toBe(0.123);
  });

  it("computes asset_value as counted_qty * unit_price when asset_value is 0", () => {
    const result = withVariance(baseLine);
    expect(result.asset_value).toBe(400); // 4 * 100
  });

  it("does not modify other fields", () => {
    const result = withVariance(baseLine);
    expect(result.item_id).toBe(baseLine.item_id);
    expect(result.item_name).toBe(baseLine.item_name);
    expect(result.sku).toBe(baseLine.sku);
  });

  it("handles zero theoretical_qty (all counted is positive variance)", () => {
    const result = withVariance({ ...baseLine, theoretical_qty: 0, counted_qty: 3 });
    expect(result.variance_qty).toBe(3);
  });

  it("preserves original line — returns a new object", () => {
    const result = withVariance(baseLine);
    expect(result).not.toBe(baseLine);
  });
});

// ── emptyCountLine ─────────────────────────────────────────────────────────────
describe("emptyCountLine()", () => {
  it("returns a count line with all zero/empty values", () => {
    const line = emptyCountLine();
    expect(line.item_id).toBe("");
    expect(line.counted_qty).toBe(0);
    expect(line.theoretical_qty).toBe(0);
    expect(line.variance_qty).toBe(0);
    expect(line.asset_value).toBe(0);
    expect(line.unit_price).toBe(0);
    expect(line.sort_order).toBe(0);
  });

  it("accepts a sort_order argument", () => {
    const line = emptyCountLine(5);
    expect(line.sort_order).toBe(5);
  });
});

// ── lineFromItem ──────────────────────────────────────────────────────────────
describe("lineFromItem()", () => {
  const sampleItem: InventoryItemLookup = {
    id: "item-abc",
    name: "Tuna",
    sku: "TNA-001",
    category_name: "Fish",
    item_type: "ingredient",
    supplier_name: "Fish Supplier",
    storage_unit: "kg",
    cost: 200,
    status: "ACTIVE",
  };

  it("maps item fields to count line correctly", () => {
    const line = lineFromItem(sampleItem, 3);
    expect(line.item_id).toBe("item-abc");
    expect(line.item_name).toBe("Tuna");
    expect(line.sku).toBe("TNA-001");
    expect(line.category).toBe("Fish");
    expect(line.supplier_name).toBe("Fish Supplier");
    expect(line.storage_unit).toBe("kg");
    expect(line.unit_price).toBe(200);
    expect(line.sort_order).toBe(3);
  });

  it("initializes count fields to 0", () => {
    const line = lineFromItem(sampleItem);
    expect(line.counted_qty).toBe(0);
    expect(line.theoretical_qty).toBe(0);
    expect(line.variance_qty).toBe(0);
    expect(line.asset_value).toBe(0);
  });

  it("sets invoice_name same as item name", () => {
    const line = lineFromItem(sampleItem);
    expect(line.invoice_name).toBe(sampleItem.name);
  });

  it("defaults sort_order to 0 when not provided", () => {
    const line = lineFromItem(sampleItem);
    expect(line.sort_order).toBe(0);
  });

  it("handles missing optional fields gracefully", () => {
    const minimal: InventoryItemLookup = {
      id: "x",
      name: "Item",
      sku: "",
      category_name: "",
      item_type: "ingredient",
      supplier_name: "",
      storage_unit: "",
      cost: 0,
      status: "ACTIVE",
    };
    const line = lineFromItem(minimal);
    expect(line.sku).toBe("");
    expect(line.category).toBe("");
    expect(line.supplier_name).toBe("");
    expect(line.storage_unit).toBe("");
    expect(line.unit_price).toBe(0);
  });
});

// ── groupBySupplier ───────────────────────────────────────────────────────────
describe("groupBySupplier()", () => {
  function makeLine(overrides: Partial<InventoryCountLine>): InventoryCountLine {
    return {
      item_id: "x",
      category: "",
      supplier_name: "",
      item_name: "Item",
      invoice_name: "Item",
      sku: "",
      storage_unit: "kg",
      unit_price: 0,
      theoretical_qty: 0,
      counted_qty: 0,
      variance_qty: 0,
      asset_value: 0,
      memo: "",
      foodics_data: "",
      order_difference: "",
      sort_order: 0,
      ...overrides,
    };
  }

  it("groups lines by supplier_name", () => {
    const lines = [
      makeLine({ supplier_name: "Alpha", item_name: "A1" }),
      makeLine({ supplier_name: "Beta", item_name: "B1" }),
      makeLine({ supplier_name: "Alpha", item_name: "A2" }),
    ];
    const result = groupBySupplier(lines);
    expect(result).toHaveLength(2);
    const alpha = result.find((g) => g.supplier === "Alpha")!;
    expect(alpha.rows).toHaveLength(2);
    const beta = result.find((g) => g.supplier === "Beta")!;
    expect(beta.rows).toHaveLength(1);
  });

  it("uses 'Unknown supplier' for empty supplier_name", () => {
    const lines = [makeLine({ supplier_name: "", item_name: "Mystery Item" })];
    const result = groupBySupplier(lines);
    expect(result[0].supplier).toBe("Unknown supplier");
  });

  it("sorts groups alphabetically by supplier", () => {
    const lines = [
      makeLine({ supplier_name: "Zeta" }),
      makeLine({ supplier_name: "Alpha" }),
      makeLine({ supplier_name: "Mango" }),
    ];
    const result = groupBySupplier(lines);
    expect(result[0].supplier).toBe("Alpha");
    expect(result[1].supplier).toBe("Mango");
    expect(result[2].supplier).toBe("Zeta");
  });

  it("sorts rows within a group by sort_order then item_name", () => {
    const lines = [
      makeLine({ supplier_name: "S1", item_name: "Zebra", sort_order: 2 }),
      makeLine({ supplier_name: "S1", item_name: "Apple", sort_order: 1 }),
      makeLine({ supplier_name: "S1", item_name: "Mango", sort_order: 1 }),
    ];
    const result = groupBySupplier(lines);
    const rows = result[0].rows;
    expect(rows[0].item_name).toBe("Apple");  // sort_order 1, Apple < Mango
    expect(rows[1].item_name).toBe("Mango");  // sort_order 1, Mango
    expect(rows[2].item_name).toBe("Zebra");  // sort_order 2
  });

  it("returns empty array for empty input", () => {
    expect(groupBySupplier([])).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const lines = [
      makeLine({ supplier_name: "B", sort_order: 2 }),
      makeLine({ supplier_name: "A", sort_order: 1 }),
    ];
    const original = [...lines];
    groupBySupplier(lines);
    expect(lines[0].supplier_name).toBe(original[0].supplier_name);
    expect(lines[1].supplier_name).toBe(original[1].supplier_name);
  });
});
