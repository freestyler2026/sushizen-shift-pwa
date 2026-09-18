import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DriveInvoiceModal from "@/components/DriveInvoiceModal";
import type { DriveInvoice } from "@/components/DriveInvoiceInbox";

/**
 * The invoice reported twice from Dubai: Chef Middle East DINV-4762996.
 *
 * The paper prints two lines, 8 x 12.000 = 96.00 and 3 x 22.500 = 67.50,
 * a net of 163.50, VAT of 8.18 and a total of 171.68. The reading returned
 * 127.56 and 45.00 for the amounts, so the panel showed an invoice that did
 * not add up and there was no quick way to make it.
 */
const INVOICE = {
  id: 880,
  drive_file_id: "x",
  drive_file_name: "20260918_143707.jpg",
  drive_web_url: "",
  store_name: "Arjan",
  city: "dubai",
  uploaded_at: "2026-09-18T10:37:00Z",
  ocr_status: "done",
  vendor_name: "Chef Middle East LLC",
  invoice_number: "DINV-4762996",
  invoice_date: "2026-09-18",
  due_date: null,
  total_amount: 171.68,
  amount_excl_tax: 163.5,
  tax_amount: 8.18,
  tax_rate_pct: 5,
  currency: "AED",
  line_items: [
    { description: "EDAMAME WHOLE GREEN SOYBEANS", qty: 8, unit: "CA", unit_price: 12, amount: 127.56 },
    { description: "FROZEN SHRIMPS PD MEDIUM", qty: 3, unit: "KG", unit_price: 22.5, amount: 45 },
  ],
  confidence_notes: [],
  review_status: "pending_review",
  reviewed_by: "",
  reviewed_at: null,
  notes: "",
  matched_po_id: null,
  match_confidence: null,
  match_method: "",
  matched_by: "",
  matched_at: null,
  matched_po_no: null,
  matched_po_vendor: null,
  matched_po_amount: null,
} as unknown as DriveInvoice;

const amountInputs = () =>
  (screen.getAllByRole("row") as HTMLElement[])
    .flatMap((r) => Array.from(r.querySelectorAll('input[type="number"]')) as HTMLInputElement[]);

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
});

describe("an invoice that does not add up", () => {
  it("says by how much, against the net", () => {
    render(<DriveInvoiceModal invoice={INVOICE} authHeaders={{}} onClose={() => {}} onUpdated={() => {}} />);
    expect(screen.getByText(/Lines are out by 9.06 against the net 163.5/)).toBeTruthy();
  });

  it("checks the header: net plus VAT is the total", () => {
    render(<DriveInvoiceModal invoice={INVOICE} authHeaders={{}} onClose={() => {}} onUpdated={() => {}} />);
    expect(screen.getByText(/163\.5 \+ 8\.18 = 171\.68/)).toBeTruthy();
  });

  it("offers qty x price, and pressing it makes the lines add up", async () => {
    render(<DriveInvoiceModal invoice={INVOICE} authHeaders={{}} onClose={() => {}} onUpdated={() => {}} />);
    const fix = screen.getByRole("button", { name: /Use qty × price on 2 lines → 163\.5/ });
    fireEvent.click(fix);
    await waitFor(() => {
      expect(screen.getByText(/Lines add up to the net/)).toBeTruthy();
    });
    const vals = amountInputs().map((i) => i.value);
    expect(vals).toContain("96");
    expect(vals).toContain("67.5");
  });

  it("carries the amount when the quantity is corrected", async () => {
    // The reading had 12 x 10.63; the person types the 8 and the 12 that are
    // printed. The amount has to follow, or the invoice still does not add up
    // and they are left to work out a third figure the first two determine.
    const misread = {
      ...INVOICE,
      line_items: [
        { description: "EDAMAME WHOLE GREEN SOYBEANS", qty: 12, unit: "CA", unit_price: 10.63, amount: 127.56 },
        { description: "FROZEN SHRIMPS PD MEDIUM", qty: 2, unit: "KG", unit_price: 22.5, amount: 45 },
      ],
    } as unknown as DriveInvoice;
    render(<DriveInvoiceModal invoice={misread} authHeaders={{}} onClose={() => {}} onUpdated={() => {}} />);

    const nums = amountInputs();
    // row 1: qty, price, amount — row 2: qty, price, amount
    fireEvent.change(nums[0], { target: { value: "8" } });
    fireEvent.change(nums[1], { target: { value: "12" } });
    fireEvent.change(nums[3], { target: { value: "3" } });

    await waitFor(() => {
      const vals = amountInputs().map((i) => i.value);
      expect(vals).toContain("96");
      expect(vals).toContain("67.5");
    });
    expect(screen.getByText(/Lines add up to the net/)).toBeTruthy();
  });
});
