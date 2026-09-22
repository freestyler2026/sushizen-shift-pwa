// tests/admin/ck-par-level-stock-units.test.tsx
//
// The Stock column holds a number somebody counted. The Par Level column holds
// a number somebody set. They are not always in the same unit.
//
// Until 2026-09-22 the screen subtracted one from the other regardless: the CK
// counted 12 BTL of Coke Mismo, the par was 3 CASE, and the row reported a
// surplus of nine on an item the kitchen was two cases short of. Twenty-two of
// Manila's 183 active rows compared two different units that way — Cayenne
// Pepper read "OK" with 1.59 grams on the shelf.
//
// These tests pin the three states the Stock column can now be in, and that a
// row it cannot read is named rather than dropped.
import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getAuth: () => ({ staffName: "Tester", role: "HQ", permissions: [], city: "manila" }),
    getAuthHeaders: () => ({ "Content-Type": "application/json" }),
    getUploadHeaders: () => ({}),
  };
});

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function row(extra: Record<string, unknown>) {
  return {
    id: "r", city: "manila", item_type: "supplier", item_name: "Item",
    unit: "KG", par_level: 3, current_stock: 1, category: "Dry Goods",
    supplier: "CHGL Store", notes: null, updated_at: "2026-09-21",
    catalog_unit_price: 0, catalog_unit: null,
    qty_convertible: false, qty_factor: null,
    unit_size: null, unit_size_uom: null, price_source: "not_in_catalog",
    stock_status: "ok", counted_qty: 1, counted_unit: "KG", ...extra,
  };
}

// Manila's real shape on 2026-09-21.
const COKE = row({
  id: "coke", item_name: "Coke Mismo (290ml) 12pcs/case", unit: "CASE",
  par_level: 3, current_stock: null, supplier: "Restaurant Depot",
  stock_status: "unit_mismatch", counted_qty: 12, counted_unit: "BTL",
});
const NUTMEG = row({
  id: "nutmeg", item_name: "NUTMEG POWDER", unit: "KG",
  par_level: 0.3, current_stock: 1, supplier: "CHGL Store",
  stock_status: "converted", counted_qty: 1000, counted_unit: "g",
});
const SOY = row({
  id: "soy", item_name: "LIGHT SOY SAUCE", unit: "BTL",
  par_level: 3, current_stock: 1, supplier: "CHGL Store",
  catalog_unit_price: 92, catalog_unit: "BTL", qty_convertible: true, qty_factor: 1,
  price_source: "supplier", stock_status: "ok", counted_qty: 1, counted_unit: "BTL",
});
const MISSING = row({
  id: "missing", item_name: "PORK BACK BONE", unit: "KG",
  par_level: 4, current_stock: null, supplier: "JWE Meat Dealer",
  stock_status: "not_counted", counted_qty: null, counted_unit: "",
});

let ROWS: Record<string, unknown>[] = [];

function jsonOk(body: unknown) {
  return Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);
}

beforeEach(() => {
  ROWS = [COKE, NUTMEG, SOY, MISSING];
  mockFetch.mockReset();
  mockFetch.mockImplementation((url: string) => {
    const u = String(url);
    if (u.includes("/api/admin/ck/par-levels/catalog-items")) {
      return jsonOk({ ok: true, items: [], excluded_by_type: 0, inactive_items: [] });
    }
    if (u.includes("/api/admin/ck/par-levels/vendors")) return jsonOk({ vendors: [] });
    if (u.includes("/api/admin/ck/par-levels")) {
      return jsonOk({
        rows: u.includes("item_type=supplier") ? ROWS : [],
        stock_date: "2026-09-21",
      });
    }
    return jsonOk({});
  });
});

async function openSupplierTab() {
  const Page = (await import("@/app/admin/ck/par-levels/page")).default;
  render(<Page />);
  fireEvent.click(await screen.findByText(/Supplier Orders/));
  await screen.findByText("LIGHT SOY SAUCE");
}

function rowOf(name: string) {
  return screen.getByText(name).closest("tr")!;
}

describe("CK par levels — the count's unit", () => {
  it("shows what was counted instead of a subtraction it cannot do", async () => {
    await openSupplierTab();
    const tr = rowOf("Coke Mismo (290ml) 12pcs/case");
    // The old screen printed −9 here and coloured it as "OK".
    expect(within(tr).getByText(/12 BTL/)).toBeTruthy();
    expect(within(tr).getByText(/unit ≠ CASE/)).toBeTruthy();
  });

  it("asks for the one fact that would fix it, in the row itself", async () => {
    await openSupplierTab();
    const tr = rowOf("Coke Mismo (290ml) 12pcs/case");
    expect(within(tr).getByText("+ how many BTL in 1 CASE?")).toBeTruthy();
  });

  it("converts where a conversion exists, and says where the number came from", async () => {
    await openSupplierTab();
    const tr = rowOf("NUTMEG POWDER");
    // par 0.3 KG against 1000 g used to render as −999.7; now it reads 1,
    // with the figure the CK actually wrote kept beside it.
    expect(tr.textContent).toContain("← 1,000 g");
    expect(tr.textContent).not.toContain("999.7");
  });

  it("leaves a row it cannot read out of the order, and names it there", async () => {
    await openSupplierTab();
    fireEvent.click(await screen.findByText(/Create Direct Purchase Orders/));
    await screen.findByText("Your PIN (required to create orders)");
    expect(screen.getByText(/counted .* in a\s+different unit from the par level/s)).toBeTruthy();
    fireEvent.click(screen.getByRole("button",
      { name: "Which items were counted in another unit?" }));
    await waitFor(() =>
      expect(screen.getByText(/Coke Mismo .* counted 12 BTL,\s*par set in CASE/s)).toBeTruthy());
  });

  it("does not put the unreadable row on the order", async () => {
    await openSupplierTab();
    fireEvent.click(await screen.findByText(/Create Direct Purchase Orders/));
    await screen.findByText("Your PIN (required to create orders)");
    expect(screen.queryByLabelText("Quantity for Coke Mismo (290ml) 12pcs/case")).toBeNull();
    // ...while a row that does compare is still there
    expect(screen.getByLabelText("Quantity for LIGHT SOY SAUCE")).toBeTruthy();
  });

  it("keeps 'not counted' a separate thing from 'counted in another unit'", async () => {
    // One is a name that does not appear on the count sheet; the other is a
    // number that cannot be read. They need different fixes and must not be
    // shown as one problem.
    await openSupplierTab();
    expect(within(rowOf("PORK BACK BONE")).getByText("not counted")).toBeTruthy();
    expect(within(rowOf("Coke Mismo (290ml) 12pcs/case")).queryByText("not counted")).toBeNull();
  });

  it("says nothing about units when every row compares", async () => {
    ROWS = [SOY];
    await openSupplierTab();
    fireEvent.click(await screen.findByText(/Create Direct Purchase Orders/));
    await screen.findByText("Your PIN (required to create orders)");
    expect(screen.queryByText(/different unit from the par level/)).toBeNull();
  });
});
