import { describe, it, expect } from "vitest";

/**
 * How a CK par row finds its stock, written from the report that found it
 * broken: Pork Back Bones was counted at 0 and no order was ever raised for
 * it, while Pork Leg Bones beside it ordered 20 every time.
 *
 * The par row is raised as PORK BACK BONE; the inventory sheet reads Pork
 * Back Bones. Stock was looked up on the par row's own name only, so it came
 * back blank — and the ordering screen drops any row whose stock is unknown.
 */
type ParRow = {
  item_name: string;
  catalog_item_name?: string | null;
  par_level: number | null;
  supplier?: string | null;
  current_stock?: number | null;
};

/** app/ck_par_level_api.py :: _stock_for */
const stockFor = (row: ParRow, stock: Record<string, number>): number | null => {
  for (const name of [row.item_name, row.catalog_item_name]) {
    const key = (name || "").trim().toLowerCase();
    if (key && key in stock) return stock[key];
  }
  return null;
};

/** The ordering screen's filter. */
const orderable = (r: ParRow) => {
  const sup = (r.supplier || "").trim();
  if (!sup || sup === "—" || sup === "-" || r.par_level == null || r.current_stock == null)
    return false;
  return Math.max(0, r.par_level - r.current_stock) > 0;
};

// What the 2026-09-18 Manila count actually held for these two.
const COUNT = { "pork leg bones": 0, "pork back bones": 0 };

describe("matching a CK par row to the stock that was counted", () => {
  it("finds the stock under the catalogue's name when the par row's own name differs", () => {
    const backBones: ParRow = {
      item_name: "PORK BACK BONE",
      catalog_item_name: "Pork Back Bones",
      par_level: 5,
      supplier: "JWE Meat Dealer",
    };
    expect(stockFor(backBones, COUNT)).toBe(0);
    backBones.current_stock = stockFor(backBones, COUNT);
    expect(orderable(backBones)).toBe(true);
  });

  it("is what made that row invisible: no fallback meant no order at all", () => {
    const withoutFallback: ParRow = {
      item_name: "PORK BACK BONE",
      catalog_item_name: null,
      par_level: 5,
      supplier: "JWE Meat Dealer",
    };
    withoutFallback.current_stock = stockFor(withoutFallback, COUNT);
    expect(withoutFallback.current_stock).toBeNull();
    expect(orderable(withoutFallback)).toBe(false);
  });

  it("still orders the row whose name matched all along", () => {
    const legBones: ParRow = {
      item_name: "PORK LEG BONES",
      par_level: 20,
      supplier: "JWE Meat Dealer",
    };
    legBones.current_stock = stockFor(legBones, COUNT);
    expect(legBones.current_stock).toBe(0);
    expect(orderable(legBones)).toBe(true);
    expect(Math.max(0, legBones.par_level! - legBones.current_stock!)).toBe(20);
  });

  it("invents nothing for an item the count does not cover", () => {
    // 14 of Manila's 122 supplier rows are like this — vegetables and gas the
    // CK count has no line for. They stay out of the order; the screen now
    // says so instead of showing an unexplained dash.
    const lemon: ParRow = { item_name: "LEMON", catalog_item_name: null, par_level: 3, supplier: "Richcath's" };
    expect(stockFor(lemon, COUNT)).toBeNull();
    lemon.current_stock = stockFor(lemon, COUNT);
    expect(orderable(lemon)).toBe(false);
  });

  it("does not let a blank name match a blank key", () => {
    const empty: ParRow = { item_name: "", catalog_item_name: "", par_level: 1, supplier: "X" };
    expect(stockFor(empty, { ...COUNT, "": 99 })).toBeNull();
  });
});
