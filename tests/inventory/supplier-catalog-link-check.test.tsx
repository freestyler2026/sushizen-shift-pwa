// Purchasing, 2026-11-24: TAFT's order said "not counted" for Peeled Garlic,
// White Onion and White Cabbage although the store had counted them. The
// catalog linked them to the CK lines (CKVG…) and the store counts the supplier
// lines (SUP-…). The catalog now says so on the row, and one click relinks it
// without clearing the price (saving a link used to clear it).
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));
vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ staffName: "Yuri Yamada", role: "HQ", city: "manila" }),
  getAuthHeaders: () => ({ "Content-Type": "application/json" }),
  getUploadHeaders: () => ({}),
}));

type Call = { url: string; method: string; body: Record<string, unknown> };
let calls: Call[] = [];

const GARLIC = {
  id: 1, store: "PAR", item_code: "VEG-010", item_name: "Peeled Garlic", category: "VEGETABLE", unit: "kg",
  par_level: 0.3, par_level_weekday: 0.3, par_level_weekend: 0.3, supplier_name: "Three-S", is_active: true,
  notes: null, daily_inv_item_code: "CKVG007", unit_price: 180,
  link_check: { ok: false, days: 14, suggest_code: "SUP-014", suggest_name: "Peeled Garlic" },
};
const MANGO = { ...GARLIC, id: 2, item_code: "VEG-019", item_name: "Mango", daily_inv_item_code: "SUP-013",
  unit_price: 280, link_check: { ok: true, counted_code: "SUP-013" } };

beforeEach(() => {
  calls = [];
  global.fetch = vi.fn((u: string | URL | Request, init?: RequestInit) => {
    const url = String(u);
    const method = (init?.method || "GET").toUpperCase();
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : {} });
    let json: unknown = {};
    if (/\/catalog\/PAR$/.test(url) && method === "GET") json = { ok: true, items: [GARLIC, MANGO] };
    else if (/\/catalog\/PAR$/.test(url)) json = { ok: true, item: GARLIC };
    else if (/daily-inv-items/.test(url)) json = { items: [] };
    return Promise.resolve(new Response(JSON.stringify(json), { status: 200, headers: { "Content-Type": "application/json" } }));
  }) as unknown as typeof fetch;
});

describe("Store supplier catalog: links that find no count", () => {
  it("names the line the store counts and relinks it, keeping the price", async () => {
    const { default: Page } = await import("@/app/admin/store-supplier-orders/page");
    render(<Page />);
    fireEvent.click(await screen.findByText("Catalog"));
    expect(await screen.findByTestId("link-summary")).toBeTruthy();
    expect(screen.getByTestId("link-summary").textContent).toMatch(/^1 item\(s\)/);
    const warn = screen.getByTestId("link-warning");
    expect(warn.textContent).toMatch(/Paranaque has not counted this line in 14 days/);
    expect(warn.textContent).toMatch(/counts it as SUP-014/);
    expect(screen.getAllByTestId("link-warning")).toHaveLength(1);      // Mango's link is fine
    fireEvent.click(screen.getByText("Link to SUP-014"));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.body.daily_inv_item_code).toBe("SUP-014");
    expect(post.body.unit_price).toBe(180);
  });
});
