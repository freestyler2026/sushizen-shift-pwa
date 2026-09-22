// tests/admin/ck-par-level-picker-inactive.test.tsx
//
// "Add item" in the Direct Purchase modal, when the thing being looked for is
// in the catalogue but switched off.
//
// 2026-09-18, one click deactivated Manila's supplier `SUY Sing (Drink)`. Its
// nine rows were every soft drink's only supplier-facing catalogue entry, so
// from that day searching "Summit" or "Coke Mismo" returned nothing at all —
// and the empty state told the kitchen to go and register the item, which
// would have created a second copy of a row that already exists. The CK could
// see the drinks on the Catalog page, so an empty box read as a broken search.
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

const ROWS = [
  { id: "a", city: "manila", item_type: "supplier", item_name: "OYSTER SAUCE",
    unit: "BTL", par_level: 4, current_stock: 1, category: "Dry Goods",
    supplier: "CHGL Store", notes: null, updated_at: "2026-09-07",
    catalog_unit_price: 185, catalog_unit: "BTL", qty_convertible: true, qty_factor: 1,
    price_source: "supplier" },
];

// Shaped after the real Manila catalogue on 2026-09-22.
const ACTIVE = [
  { item_name: "Absolute Water 6L", unit: "PC", unit_price: 73.6,
    supplier_name: "Cash & Carry", category: "", on_par: false },
  { item_name: "Lemon Juice", unit: "BTL", unit_price: 232.5,
    supplier_name: "Cash & Carry Supermarket", category: "", on_par: false },
];
const INACTIVE = [
  { item_name: "Coke Mismo (290ml) 12pcs/case", unit: "CASE", unit_price: 199.95,
    supplier_name: "SUY Sing (Drink)", category: "Ingredients", on_par: true },
  { item_name: "Water Summit (500ml) 24pcs/case", unit: "CASE", unit_price: 270.3,
    supplier_name: "SUY Sing (Drink)", category: "Ingredients", on_par: true },
];

function jsonOk(body: unknown) {
  return Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);
}

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockImplementation((url: string) => {
    const u = String(url);
    // Before the generic par-levels branch: this path is a prefix match away
    // from it, and answering it with the par-level payload is how the picker
    // ends up silently empty in a test that then proves nothing.
    if (u.includes("/api/admin/ck/par-levels/catalog-items")) {
      return jsonOk({ ok: true, city: "manila", items: ACTIVE,
                      excluded_by_type: 404, inactive_items: INACTIVE });
    }
    if (u.includes("/api/admin/ck/par-levels/vendors")) return jsonOk({ vendors: [] });
    if (u.includes("/api/admin/ck/par-levels")) {
      return jsonOk({ rows: u.includes("item_type=supplier") ? ROWS : [], stock_date: "2026-09-07" });
    }
    return jsonOk({});
  });
});

async function openPicker() {
  const Page = (await import("@/app/admin/ck/par-levels/page")).default;
  render(<Page />);
  fireEvent.click(await screen.findByText(/Supplier Orders/));
  fireEvent.click(await screen.findByText(/Create Direct Purchase Orders \(1 supplier\)/));
  await screen.findByText("Your PIN (required to create orders)");
  fireEvent.click(screen.getByRole("button", { name: "+ Add item" }));
  return await screen.findByLabelText("Search the Procurement catalogue");
}

function type(box: HTMLElement, q: string) {
  fireEvent.change(box, { target: { value: q } });
}

describe("CK par levels — Add item, deactivated catalogue rows", () => {
  it("names the switched-off row instead of reporting no match", async () => {
    const box = await openPicker();
    await waitFor(() => expect(screen.getByText(/switched off/)).toBeTruthy());
    type(box, "Summit");
    await waitFor(() =>
      expect(screen.getByText("Water Summit (500ml) 24pcs/case")).toBeTruthy());
    expect(screen.getByText("SUY Sing (Drink)")).toBeTruthy();
    // and it does not claim the catalogue has never heard of it
    expect(screen.queryByText(/Nothing in the catalogue matches/)).toBeNull();
  });

  it("does not send someone to register an item that is already registered", async () => {
    // The old empty state's only exit was "Register it in Cost Calculation",
    // which for these nine rows would have made a duplicate.
    const box = await openPicker();
    await waitFor(() => expect(screen.getByText(/switched off/)).toBeTruthy());
    type(box, "Coke Mismo");
    await waitFor(() =>
      expect(screen.getByText("Coke Mismo (290ml) 12pcs/case")).toBeTruthy());
    expect(screen.queryByText(/Register it in Cost Calculation/)).toBeNull();
    expect(screen.getByText(/Do not register these again/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open the Procurement catalogue/ })).toBeTruthy();
  });

  it("will not let a switched-off row be added to the order", async () => {
    const box = await openPicker();
    await waitFor(() => expect(screen.getByText(/switched off/)).toBeTruthy());
    type(box, "Summit");
    const row = await screen.findByText("Water Summit (500ml) 24pcs/case");
    // A deactivated supplier is a Procurement decision. Picking one from
    // inside an order would quietly overrule it.
    expect(row.closest("button")).toBeNull();
  });

  it("still reports a genuinely unknown name as unknown", async () => {
    const box = await openPicker();
    await waitFor(() => expect(screen.getByText(/switched off/)).toBeTruthy());
    type(box, "zzzz nothing like this");
    await waitFor(() =>
      expect(screen.getByText(/Nothing in the catalogue matches/)).toBeTruthy());
    expect(screen.getByText(/Register it in Cost Calculation/)).toBeTruthy();
  });

  it("keeps the switched-off list out of the way until something is typed", async () => {
    // 235 of Manila's supplier-facing rows are switched off. Listing them by
    // default would bury the 274 that are on offer.
    const box = await openPicker();
    await waitFor(() => expect(screen.getByText("Lemon Juice")).toBeTruthy());
    expect(screen.queryByText("Coke Mismo (290ml) 12pcs/case")).toBeNull();
    type(box, "Coke");
    await waitFor(() =>
      expect(screen.getByText("Coke Mismo (290ml) 12pcs/case")).toBeTruthy());
  });
});
