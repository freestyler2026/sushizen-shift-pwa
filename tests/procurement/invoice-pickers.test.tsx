// tests/procurement/invoice-pickers.test.tsx
//
// The reviewer was reading the vendor and every line off the photo and typing
// them back in. That is where 108 spellings of 66 Dubai companies came from,
// and it is the part of the check OCR helps with least: when the reading is
// blank there is nothing to correct, only something to type.
//
// What these guard:
//   - the vendor list is offered, and picking one sets the field
//   - a name matching none of them is still accepted, and says so
//   - the item list is fetched for the vendor on screen, not a stale one
//   - a pick fills description and unit and leaves the price EMPTY — the same
//     item has been read at 2.00 and at 130.00 on these invoices
//   - the picker stays open after a pick, because an invoice has a dozen lines
import React from "react";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));
vi.mock("@/components/PhotoLoupe", () => ({ default: () => <div data-testid="loupe" /> }));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import DriveInvoiceModal from "@/components/DriveInvoiceModal";
import type { DriveInvoice } from "@/components/DriveInvoiceInbox";

const VENDORS = [
  { name: "SAWHNEY FOODSTUFF TR. CO. LLC SP", invoice_count: 325, last_invoice_date: "2026-09-24", is_internal: false },
  { name: "Sushi ZEN Central Kitchen", invoice_count: 83, last_invoice_date: "2026-09-22", is_internal: true },
  { name: "MIY FOODSTUFFS TRADING LLC", invoice_count: 68, last_invoice_date: "2026-09-20", is_internal: false },
];

const ITEMS = [
  { description: "CORN STARCH 24 X 400 GM", unit: "PKT", last_unit_price: 24, last_seen: "2026-09-07", times_seen: 48 },
  { description: "SUGAR 6 X 2 KG-SUPERCHEF", unit: "CTN", last_unit_price: 39, last_seen: "2026-09-06", times_seen: 42 },
];

const INVOICE: DriveInvoice = {
  id: 1, drive_file_id: "f1", drive_file_name: "IMG_1.jpg", drive_web_url: "",
  store_name: "Business Bay", city: "dubai", uploaded_at: "2026-09-24T06:00:00Z",
  ocr_status: "done", vendor_name: "SAWHNEY FOODSTUFF TR. CO. LLC SP",
  invoice_number: "S-1", invoice_date: "2026-09-24", due_date: null,
  total_amount: 100, currency: "AED", line_items: [],
  confidence_notes: [], review_status: "pending_review", reviewed_by: "", reviewed_at: null,
  notes: "", matched_po_id: null, match_confidence: null, match_method: "",
  matched_by: "", matched_at: null, matched_po_no: null, matched_po_vendor: null,
  matched_po_amount: null,
};

function route(url: string) {
  if (url.includes("/vendor-items")) return { ok: true, json: async () => ({ ok: true, items: ITEMS }) };
  if (url.includes("/vendors")) return { ok: true, json: async () => ({ ok: true, vendors: VENDORS }) };
  if (url.includes("/stores")) return { ok: true, json: async () => ({ stores: ["Business Bay"] }) };
  if (url.includes("/file")) return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
  return { ok: true, json: async () => ({ ok: true }) };
}

function mount(overrides: Partial<DriveInvoice> = {}) {
  return render(
    <DriveInvoiceModal
      invoice={{ ...INVOICE, ...overrides }}
      authHeaders={{}}
      onClose={() => {}}
      onUpdated={() => {}}
    />,
  );
}

async function openItemPicker() {
  fireEvent.click(await screen.findByRole("button", { name: /Pick item/ }));
  return await screen.findByPlaceholderText(/Search .* items/);
}

describe("invoice inbox — vendor and item pickers", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockImplementation((url: string) => Promise.resolve(route(String(url)) as unknown as Response));
  });

  it("offers the city's vendors, marking the ones that are ours", async () => {
    mount();
    const field = await screen.findByPlaceholderText(/Type, or pick from the list/);
    fireEvent.focus(field);
    expect(await screen.findByText("MIY FOODSTUFFS TRADING LLC")).toBeTruthy();
    expect(screen.getByText("Sushi ZEN Central Kitchen")).toBeTruthy();
    // 325 invoices, so the list says how well known the vendor is.
    expect(screen.getByText("325 inv")).toBeTruthy();
    expect(screen.getAllByText("ours").length).toBe(1);
  });

  it("picking a vendor puts that exact spelling in the field", async () => {
    mount();
    const field = await screen.findByPlaceholderText(/Type, or pick from the list/);
    fireEvent.focus(field);
    fireEvent.click(await screen.findByText("MIY FOODSTUFFS TRADING LLC"));
    await waitFor(() =>
      expect((field as HTMLInputElement).value).toBe("MIY FOODSTUFFS TRADING LLC"),
    );
  });

  it("filters the list as the reviewer types, and keeps free text", async () => {
    mount();
    const field = await screen.findByPlaceholderText(/Type, or pick from the list/);
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: "sushi" } });
    expect(await screen.findByText("Sushi ZEN Central Kitchen")).toBeTruthy();
    expect(screen.queryByText("MIY FOODSTUFFS TRADING LLC")).toBeNull();
    // The typed value is kept — the first invoice from a new supplier arrives
    // before anybody adds it to a master.
    expect((field as HTMLInputElement).value).toBe("sushi");
  });

  it("says so when the name matches no vendor we have invoiced", async () => {
    mount();
    const field = await screen.findByPlaceholderText(/Type, or pick from the list/);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    fireEvent.change(field, { target: { value: "BRAND NEW TRADING LLC" } });
    expect(
      await screen.findByText(/not a vendor we have invoiced before/i),
    ).toBeTruthy();
  });

  it("does not cry 'new vendor' about a vendor that is on the list", async () => {
    mount();
    await screen.findByPlaceholderText(/Type, or pick from the list/);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByText(/not a vendor we have invoiced before/i)).toBeNull(),
    );
  });

  it("asks for the items of the vendor currently on screen", async () => {
    mount();
    const field = await screen.findByPlaceholderText(/Type, or pick from the list/);
    fireEvent.focus(field);
    fireEvent.click(await screen.findByText("MIY FOODSTUFFS TRADING LLC"));
    await openItemPicker();
    await waitFor(() => {
      const called = mockFetch.mock.calls.map((c) => String(c[0]));
      expect(
        called.some((u) => u.includes("/vendor-items") && u.includes("MIY%20FOODSTUFFS")),
      ).toBe(true);
    });
  });

  it("fills description and unit from a pick, and leaves the price empty", async () => {
    mount();
    await openItemPicker();
    fireEvent.click(await screen.findByText("CORN STARCH 24 X 400 GM"));

    const rows = await screen.findAllByDisplayValue("CORN STARCH 24 X 400 GM");
    expect(rows.length).toBe(1);
    expect(screen.getAllByDisplayValue("PKT").length).toBe(1);
    // The last price is printed beside the item, never written into the field.
    expect(screen.queryByDisplayValue("24")).toBeNull();
    expect(screen.getByText(/last AED 24/)).toBeTruthy();
  });

  it("stays open so a dozen-line invoice is not a dozen open/close cycles", async () => {
    mount();
    await openItemPicker();
    fireEvent.click(await screen.findByText("CORN STARCH 24 X 400 GM"));
    fireEvent.click(await screen.findByText("SUGAR 6 X 2 KG-SUPERCHEF"));
    expect(screen.getByPlaceholderText(/Search .* items/)).toBeTruthy();
    expect(screen.getAllByDisplayValue("CORN STARCH 24 X 400 GM").length).toBe(1);
    expect(screen.getAllByDisplayValue("SUGAR 6 X 2 KG-SUPERCHEF").length).toBe(1);
  });

  it("replaces one line rather than appending when asked from that row", async () => {
    mount({ line_items: [{ description: "CRN STRCH 4OO", qty: 2, unit: "?", unit_price: null, amount: null }] });
    const replace = await screen.findByTitle(/Replace from this vendor/);
    fireEvent.click(replace);
    expect(await screen.findByText(/Picking will replace line 1/)).toBeTruthy();
    fireEvent.click(await screen.findByText("CORN STARCH 24 X 400 GM"));
    await waitFor(() =>
      expect(screen.getAllByDisplayValue("CORN STARCH 24 X 400 GM").length).toBe(1),
    );
    // Replaced, not added, and the qty the reviewer already read stays.
    expect(screen.queryByDisplayValue("CRN STRCH 4OO")).toBeNull();
    expect(screen.getByDisplayValue("2")).toBeTruthy();
  });

  it("says what to do when the vendor has no history instead of showing nothing", async () => {
    mockFetch.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes("/vendor-items")) return Promise.resolve({ ok: true, json: async () => ({ ok: true, items: [] }) } as unknown as Response);
      return Promise.resolve(route(u) as unknown as Response);
    });
    mount();
    await openItemPicker();
    expect(await screen.findByText(/first invoice has to be typed/i)).toBeTruthy();
  });

  it("reports a failed item load instead of an empty list", async () => {
    mockFetch.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes("/vendor-items")) return Promise.resolve({ ok: false, status: 500, json: async () => ({}) } as unknown as Response);
      return Promise.resolve(route(u) as unknown as Response);
    });
    mount();
    await openItemPicker();
    expect(await screen.findByText(/Could not load this vendor's items/i)).toBeTruthy();
  });
});

describe("invoice inbox — the vendor field does not storm the server", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockImplementation((url: string) => Promise.resolve(route(String(url)) as unknown as Response));
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => vi.useRealTimers());

  it("asks once for a vendor typed letter by letter, not once per letter", async () => {
    mount();
    const field = await screen.findByPlaceholderText(/Type, or pick from the list/);
    fireEvent.click(await screen.findByRole("button", { name: /Pick item/ }));
    await waitFor(() =>
      expect(mockFetch.mock.calls.filter((c) => String(c[0]).includes("/vendor-items")).length).toBe(1),
    );

    // Measured on production before this guard existed: five keystrokes with
    // the picker open fired five requests, each one a scan.
    for (const v of ["S", "SA", "SAW", "SAWH", "SAWHN"]) {
      fireEvent.change(field, { target: { value: v } });
    }
    await act(async () => { vi.advanceTimersByTime(500); });

    await waitFor(() => {
      const items = mockFetch.mock.calls.map((c) => String(c[0])).filter((u) => u.includes("/vendor-items"));
      // one for the vendor the invoice arrived with, one for what they typed
      expect(items.length).toBe(2);
      expect(items[1]).toContain("SAWHN");
    });
  });
});

describe("invoice inbox — what the audit found", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockImplementation((url: string) => Promise.resolve(route(String(url)) as unknown as Response));
  });

  it("a vendor list that failed to load is not reported as 'every vendor is new'", async () => {
    mockFetch.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes("/vendors")) return Promise.resolve({ ok: false, status: 403, json: async () => ({}) } as unknown as Response);
      return Promise.resolve(route(u) as unknown as Response);
    });
    mount();
    expect(await screen.findByText(/could not load the vendor list/i)).toBeTruthy();
    // The amber warning would otherwise fire on every single invoice, which is
    // how a warning stops being read.
    expect(screen.queryByText(/not a vendor we have invoiced before/i)).toBeNull();
  });

  it("does not show the previous vendor's items when the vendor changed first", async () => {
    mount();
    const field = await screen.findByPlaceholderText(/Type, or pick from the list/);
    // change the vendor while the picker is CLOSED, then open it
    fireEvent.focus(field);
    fireEvent.click(await screen.findByText("MIY FOODSTUFFS TRADING LLC"));
    await waitFor(() => expect((field as HTMLInputElement).value).toBe("MIY FOODSTUFFS TRADING LLC"));
    await openItemPicker();
    await waitFor(() => {
      const items = mockFetch.mock.calls.map((c) => String(c[0])).filter((u) => u.includes("/vendor-items"));
      expect(items.length).toBeGreaterThan(0);
      // never asks for the vendor the invoice arrived with
      expect(items.some((u) => u.includes("SAWHNEY"))).toBe(false);
      expect(items[items.length - 1]).toContain("MIY%20FOODSTUFFS");
    });
    expect(screen.getByPlaceholderText(/Search MIY FOODSTUFFS TRADING LLC's items/)).toBeTruthy();
  });

  it("is a combobox a keyboard can drive", async () => {
    mount();
    const field = await screen.findByRole("combobox", { name: /Vendor Name/ });
    expect(field.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByLabelText(/Vendor Name/)).toBe(field);
    fireEvent.focus(field);
    await waitFor(() => expect(field.getAttribute("aria-expanded")).toBe("true"));
    fireEvent.keyDown(field, { key: "ArrowDown" });
    fireEvent.keyDown(field, { key: "ArrowDown" });
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() =>
      expect((field as HTMLInputElement).value).toBe("Sushi ZEN Central Kitchen"),
    );
    // Escape closes the list, not the invoice
    fireEvent.focus(field);
    await waitFor(() => expect(field.getAttribute("aria-expanded")).toBe("true"));
    fireEvent.keyDown(field, { key: "Escape" });
    await waitFor(() => expect(field.getAttribute("aria-expanded")).toBe("false"));
  });

  it("prints the remembered price as money, not a bare number", async () => {
    mount();
    await openItemPicker();
    expect(await screen.findByText(/last AED 24\.00/)).toBeTruthy();
  });
});
