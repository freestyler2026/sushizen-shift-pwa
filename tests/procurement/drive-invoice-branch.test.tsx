// tests/procurement/drive-invoice-branch.test.tsx
//
// Dubai reported a Chef Middle East invoice for JLT that arrived labelled
// Arjan, and the Branch / Location field would not change. It was read-only,
// on the reasoning that it comes from the capture folder rather than the OCR —
// but the capture folder is the Discord channel the photo was posted in, and
// that is wrong whenever one branch's invoice is photographed into another
// branch's channel. It reaches invoice_line_items.branch on approval, so the
// wrong one files the cost against the wrong store.

import React from "react";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import DriveInvoiceModal from "@/components/DriveInvoiceModal";

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function invoice(over: Record<string, unknown> = {}) {
  return {
    id: 2607,
    drive_file_id: "f1",
    drive_file_name: "20260919_161955.jpg",
    drive_web_url: "",
    store_name: "Arjan",
    city: "dubai",
    uploaded_at: "2026-09-19T12:19:55Z",
    ocr_status: "done",
    vendor_name: "Chef Middle East LLC",
    invoice_number: "DC00293",
    invoice_date: "2026-09-19",
    due_date: null,
    total_amount: 262.5,
    currency: "AED",
    line_items: [],
    confidence_notes: [],
    review_status: "pending_review",
    reviewed_by: "",
    reviewed_at: null,
    notes: "",
    ...over,
  } as never;
}

function serve(stores: string[]) {
  mockFetch.mockImplementation((url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes("/drive-invoices/stores")) {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, stores }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
  });
}

const DUBAI = ["Al Barsha", "Al Mina", "Arjan", "Business Bay", "Central Kitchen", "JLT", "Warehouse"];

describe("Drive invoice — the branch is correctable", () => {
  beforeEach(() => { vi.clearAllMocks(); serve(DUBAI); });
  afterEach(() => cleanup());

  it("offers the city's branches, and sends the one the reviewer picks", async () => {
    render(
      <DriveInvoiceModal
        invoice={invoice()}
        authHeaders={{}}
        onClose={() => {}}
        onUpdated={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByText("Branch / Location")).toBeInTheDocument());

    const select = (await screen.findByDisplayValue("Arjan")) as HTMLSelectElement;
    await waitFor(() => expect(select.options.length).toBe(DUBAI.length));

    fireEvent.change(select, { target: { value: "JLT" } });
    expect(screen.getByText(/changed from Arjan/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Save Draft"));
    await waitFor(() => {
      const put = mockFetch.mock.calls.find(
        (c: unknown[]) =>
          String(c[0]).includes("/api/admin/drive-invoices/2607")
          && (c[1] as { method?: string } | undefined)?.method === "PUT",
      );
      expect(put).toBeTruthy();
      const body = JSON.parse((put as [string, { body: string }])[1].body);
      expect(body.store_name).toBe("JLT");
    });
  });

  it("keeps a branch the list no longer carries rather than silently moving it", async () => {
    serve(["Al Barsha", "JLT"]);
    render(
      <DriveInvoiceModal
        invoice={invoice({ store_name: "Old Site" })}
        authHeaders={{}}
        onClose={() => {}}
        onUpdated={() => {}}
      />,
    );
    const select = (await screen.findByDisplayValue("Old Site")) as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toContain("Old Site");
  });
});
