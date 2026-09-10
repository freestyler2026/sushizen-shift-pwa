// tests/admin/ck-par-level-unit-size.test.tsx
//
// Counting in Block, buying in KG.
//
// CK counts Beef Short Plate in Block and the supplier sells it by the kilo —
// one block is 5kg, a box is five blocks. BLOCK is neither a mass nor a volume,
// so nothing bridged it and this item alone came into the order modal with an
// empty quantity that somebody had to work out by hand every time.
//
// A row can now say how big its counting unit is. These tests pin the two
// halves of that: the quantity converts when the row says so, and it stays
// blank when it does not — a silent 1:1 would order one kilo where five
// blocks were wanted.
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

/** Beef, counted in Block and bought in KG. `qty_factor` is what the server
 *  works out from the declaration; `null` is a row that has not declared. */
function beef(extra: Record<string, unknown> = {}) {
  return {
    id: "beef", city: "manila", item_type: "supplier",
    item_name: "Beef Short Plate (Imported)",
    unit: "BLOCK", par_level: 5, current_stock: 3, category: "Meat",
    supplier: "Happy Meat", notes: null, updated_at: "2026-09-10",
    catalog_unit_price: 515, catalog_unit: "KG",
    qty_convertible: false, qty_factor: null,
    unit_size: null, unit_size_uom: null,
    price_source: "supplier", ...extra,
  };
}
/** A second supplier, so the modal opens (it needs more than one line to be
 *  worth opening and the button names the count). */
const SOY = {
  id: "soy", city: "manila", item_type: "supplier", item_name: "LIGHT SOY SAUCE",
  unit: "BTL", par_level: 3, current_stock: 1, category: "Dry Goods",
  supplier: "CHGL Store", notes: null, updated_at: "2026-09-10",
  catalog_unit_price: 92, catalog_unit: "BTL", qty_convertible: true, qty_factor: 1,
  unit_size: null, unit_size_uom: null, price_source: "supplier",
};

let ROWS: Record<string, unknown>[] = [];
const puts: { url: string; body: unknown }[] = [];

function jsonOk(body: unknown) {
  return Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);
}

beforeEach(() => {
  puts.length = 0;
  ROWS = [beef(), SOY];
  mockFetch.mockReset();
  mockFetch.mockImplementation((url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/api/admin/ck/par-levels/vendors")) return jsonOk({ vendors: [] });
    if (init?.method === "PUT" && u.includes("/api/admin/ck/par-levels/")) {
      puts.push({ url: u, body: JSON.parse(String(init.body)) });
      return jsonOk({ ok: true, row: {} });
    }
    if (u.includes("/api/admin/ck/par-levels")) {
      return jsonOk({ rows: u.includes("item_type=supplier") ? ROWS : [], stock_date: "2026-09-09" });
    }
    return jsonOk({});
  });
});

async function openSupplierTab() {
  const Page = (await import("@/app/admin/ck/par-levels/page")).default;
  render(<Page />);
  fireEvent.click(await screen.findByText(/Supplier Orders/));
  await screen.findByText("Beef Short Plate (Imported)");
}

async function openModal() {
  await openSupplierTab();
  fireEvent.click(await screen.findByText(/Create Direct Purchase Orders/));
  await screen.findByText("Your PIN (required to create orders)");
}

function qtyField(item: string) {
  return screen.getByLabelText(`Quantity for ${item}`) as HTMLInputElement;
}

describe("how big is one Block", () => {
  it("asks, on the row, only where saying so would change something", async () => {
    await openSupplierTab();
    // Beef: counted in BLOCK, bought in KG, nothing bridges them.
    expect(screen.getByText(/how many KG in 1 BLOCK\?/)).toBeTruthy();
    // Soy sauce is counted and bought in BTL, so there is nothing to ask.
    expect(screen.queryByText(/in 1 BTL\?/)).toBeNull();
  });

  it("shows the declaration once it is there, instead of the question", async () => {
    ROWS = [beef({ unit_size: 5, unit_size_uom: "KG", qty_convertible: true, qty_factor: 5 }), SOY];
    await openSupplierTab();
    expect(screen.getByText("1 BLOCK = 5 KG")).toBeTruthy();
    expect(screen.queryByText(/how many KG in 1 BLOCK\?/)).toBeNull();
  });

  it("sends the size and the measure together", async () => {
    await openSupplierTab();
    fireEvent.click(screen.getByText(/how many KG in 1 BLOCK\?/));
    fireEvent.change(screen.getByLabelText(/How many measures make one BLOCK/), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Measure"), { target: { value: "kg" } });
    fireEvent.click(screen.getByText("✓"));
    await waitFor(() => expect(puts.length).toBe(1));
    expect(puts[0].body).toEqual({ unit_size: 5, unit_size_uom: "KG" });
  });

  it("leaves the quantity blank while nobody has said how big a Block is", async () => {
    // The important half. par − stock is 2 BLOCK; the supplier sells KG. Two
    // is not two kilos, so the field must not be filled with 2.
    await openModal();
    expect(qtyField("Beef Short Plate (Imported)").value).toBe("");
    expect(screen.getByText(/need 2 BLOCK — enter KG/)).toBeTruthy();
  });

  it("fills it in, and shows the arithmetic, once the row has declared", async () => {
    ROWS = [beef({ unit_size: 5, unit_size_uom: "KG", qty_convertible: true, qty_factor: 5 }), SOY];
    await openModal();
    // par 5 − stock 3 = 2 BLOCK = 10 KG
    expect(qtyField("Beef Short Plate (Imported)").value).toBe("10");
    // and says where 10 came from, because 10 on its own cannot be checked
    expect(screen.getByText(/2 BLOCK × 5/)).toBeTruthy();
  });

  it("does not touch a row that already converted", async () => {
    ROWS = [beef({ unit_size: 5, unit_size_uom: "KG", qty_convertible: true, qty_factor: 5 }), SOY];
    await openModal();
    expect(qtyField("LIGHT SOY SAUCE").value).toBe("2");   // par 3 − stock 1
  });
});
