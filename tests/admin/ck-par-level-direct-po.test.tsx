// tests/admin/ck-par-level-direct-po.test.tsx
//
// The Direct Purchase Orders modal. It used to render par − stock straight from
// the rows with no way to change anything, and with fifty lines it grew past the
// bottom of the screen and took the PIN field and both buttons with it — the
// only way through was to zoom the browser out.
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

const ROWS = [
  { id: "a", city: "manila", item_type: "supplier", item_name: "OYSTER SAUCE",
    unit: "BTL", par_level: 4, current_stock: 1, category: "Dry Goods",
    supplier: "CHGL Store", notes: null, updated_at: "2026-09-07",
    catalog_unit_price: 185, price_source: "supplier" },
  { id: "b", city: "manila", item_type: "supplier", item_name: "LIGHT SOY SAUCE",
    unit: "BTL", par_level: 3, current_stock: 1, category: "Dry Goods",
    supplier: "CHGL Store", notes: null, updated_at: "2026-09-07",
    catalog_unit_price: 92, price_source: "supplier" },
  { id: "c", city: "manila", item_type: "supplier", item_name: "CHICKEN SKIN",
    unit: "KG", par_level: 6, current_stock: 0, category: "Meat",
    supplier: "JWE Meat Dealer", notes: null, updated_at: "2026-09-07",
    catalog_unit_price: null, price_source: "not_in_catalog" },
];

function jsonOk(body: unknown) {
  return Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);
}

// Every POST that reaches the direct-purchase endpoint, so a test can assert on
// what was actually sent rather than on what the screen said.
const posted: { vendor: string; items: any[] }[] = [];

beforeEach(() => {
  posted.length = 0;
  mockFetch.mockReset();
  mockFetch.mockImplementation((url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/api/admin/ck/par-levels/vendors")) return jsonOk({ vendors: [] });
    if (u.includes("/api/admin/ck/par-levels")) {
      return jsonOk({ rows: u.includes("item_type=supplier") ? ROWS : [], stock_date: "2026-09-07" });
    }
    if (u.includes("/api/admin/procurement/direct-purchase")) {
      const fd = init!.body as FormData;
      posted.push({
        vendor: String(fd.get("vendor_name")),
        items: JSON.parse(String(fd.get("items_json"))),
      });
      return jsonOk({ ok: true });
    }
    return jsonOk({});
  });
});

async function openModal() {
  const Page = (await import("@/app/admin/ck/par-levels/page")).default;
  render(<Page />);
  fireEvent.click(await screen.findByText(/Supplier Orders/));
  const open = await screen.findByText(/Create Direct Purchase Orders \(2 suppliers\)/);
  fireEvent.click(open);
  return await screen.findByText("Your PIN (required to create orders)");
}

function qtyField(item: string) {
  return screen.getByLabelText(`Quantity for ${item}`) as HTMLInputElement;
}
function createButton() {
  return screen.getByRole("button", { name: /^Create \d+ Order/ });
}

describe("CK par levels — direct purchase orders", () => {
  it("opens with par minus stock, and lets every quantity be changed", async () => {
    await openModal();
    expect(qtyField("OYSTER SAUCE").value).toBe("3");   // par 4 − stock 1
    expect(qtyField("CHICKEN SKIN").value).toBe("6");
    fireEvent.change(qtyField("OYSTER SAUCE"), { target: { value: "12" } });
    expect(qtyField("OYSTER SAUCE").value).toBe("12");
    // and it says what the suggestion was, so an edit is visible as an edit
    expect(screen.getByText(/par − stock: 3/)).toBeTruthy();
  });

  it("sends the edited quantity, not par minus stock", async () => {
    // The whole point. The modal used to be a preview of a number computed
    // again at submit time, so anything typed into it went nowhere.
    await openModal();
    fireEvent.change(qtyField("CHICKEN SKIN"), { target: { value: "2.5" } });
    fireEvent.change(screen.getByPlaceholderText("Enter PIN"), { target: { value: "1234" } });
    fireEvent.click(createButton());
    await waitFor(() => expect(posted.length).toBe(2));
    const meat = posted.find((p) => p.vendor === "JWE Meat Dealer")!;
    expect(meat.items).toEqual([
      { item_name: "CHICKEN SKIN", category: "Meat", qty: 2.5, unit: "KG", unit_price: 0 },
    ]);
  });

  it("keeps a removed line on screen with an Undo beside it", async () => {
    // A row that vanishes takes its own undo button with it.
    await openModal();
    const row = qtyField("LIGHT SOY SAUCE").closest("tr")!;
    fireEvent.click(within(row).getByRole("button", { name: "Remove" }));
    expect(within(row).getByText("LIGHT SOY SAUCE")).toBeTruthy();
    fireEvent.click(within(row).getByRole("button", { name: "Undo" }));
    expect(within(row).getByRole("button", { name: "Remove" })).toBeTruthy();
  });

  it("does not send a removed line, and drops a supplier that has none left", async () => {
    await openModal();
    for (const item of ["OYSTER SAUCE", "LIGHT SOY SAUCE"]) {
      const row = qtyField(item).closest("tr")!;
      fireEvent.click(within(row).getByRole("button", { name: "Remove" }));
    }
    expect(createButton().textContent).toContain("Create 1 Order (1 item)");
    fireEvent.change(screen.getByPlaceholderText("Enter PIN"), { target: { value: "1234" } });
    fireEvent.click(createButton());
    await waitFor(() => expect(posted.length).toBe(1));
    expect(posted[0].vendor).toBe("JWE Meat Dealer");
  });

  it("treats a quantity of zero as not ordered", async () => {
    await openModal();
    fireEvent.change(qtyField("CHICKEN SKIN"), { target: { value: "0" } });
    expect(createButton().textContent).toContain("Create 1 Order (2 items)");
  });

  it("sends the catalogue price, and 0 only where there is none", async () => {
    // The generated lines used to be posted with unit_price 0 every time, while
    // the same catalogue filled in prices for anything added by hand on the
    // Direct Purchase form.
    await openModal();
    fireEvent.change(screen.getByPlaceholderText("Enter PIN"), { target: { value: "1234" } });
    fireEvent.click(createButton());
    await waitFor(() => expect(posted.length).toBe(2));
    const chgl = posted.find((p) => p.vendor === "CHGL Store")!;
    expect(chgl.items.find((i: any) => i.item_name === "OYSTER SAUCE").unit_price).toBe(185);
    const meat = posted.find((p) => p.vendor === "JWE Meat Dealer")!;
    expect(meat.items[0].unit_price).toBe(0);
  });

  it("says how many lines will be created without a price", async () => {
    // A line at 0 is easy to approve without noticing, so the count is on the
    // screen before the order is created rather than after.
    await openModal();
    expect(screen.getByText(/1 of 3 lines have\s+no price on file/)).toBeTruthy();
  });

  it("cannot be submitted when nothing is left to order", async () => {
    await openModal();
    for (const item of ["OYSTER SAUCE", "LIGHT SOY SAUCE", "CHICKEN SKIN"]) {
      const row = qtyField(item).closest("tr")!;
      fireEvent.click(within(row).getByRole("button", { name: "Remove" }));
    }
    fireEvent.change(screen.getByPlaceholderText("Enter PIN"), { target: { value: "1234" } });
    expect((createButton() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Every line is removed or set to zero/)).toBeTruthy();
  });

  it("starts over when the modal is reopened", async () => {
    await openModal();
    fireEvent.change(qtyField("CHICKEN SKIN"), { target: { value: "99" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(await screen.findByText(/Create Direct Purchase Orders \(2 suppliers\)/));
    await screen.findByText("Your PIN (required to create orders)");
    expect(qtyField("CHICKEN SKIN").value).toBe("6");
  });
});
