// tests/store/ck-delivery-note-qty.test.tsx
//
// Yusuke, 2026-10-16: TAFT's Gyoza Wrapper went onto delivery note #202 as
// 510 pkt (meant 10), and the note only let him change the price. The note now
// corrects the quantity while it is not confirmed, with a reason.
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "202" }) }));
vi.mock("@/lib/auth", () => ({
  getAuthHeaders: () => ({}),
  getAuth: () => ({ staffName: "Yusuke Uejima", role: "HQ", city: "manila", permissions: [] }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import NotePage from "@/app/store/ck-delivery/[id]/note/page";

function delivery(status: string) {
  return {
    delivery: {
      id: 202, city: "manila", delivery_date: "2026-10-15", to_branch: "Taft", status,
      created_by: "Yusuke Uejima", proc_request_no: "MAN-PR-202610-0168", notes: "",
      items: [{ id: 6571, item_name: "Gyoza Wrapper (50pcs / pkt)", category: "Frozen", qty: 510,
                unit: "pkt", unit_price: 60, notes: "", source: "auto" }],
    },
  };
}

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

beforeEach(() => mockFetch.mockReset());

describe("CK delivery note — correcting a quantity", () => {
  it("sends the corrected quantity with the reason, and refuses without one", async () => {
    const calls: { url: string; body: any }[] = [];
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === "PATCH") {
        calls.push({ url: String(url), body: JSON.parse(String(opts.body)) });
        return json({ ok: true, changed: true, order_line_updated: true });
      }
      return json(delivery("DISPATCHED"));
    });
    render(<NotePage />);
    fireEvent.click(await screen.findByRole("button", { name: /Edit Qty \/ Prices/i }));
    const qty = screen.getByLabelText(/Quantity for Gyoza Wrapper/i);
    fireEvent.change(qty, { target: { value: "10" } });

    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
    expect(await screen.findByText(/Say why the quantity is being corrected/i)).toBeInTheDocument();
    expect(calls).toHaveLength(0);

    fireEvent.change(screen.getByPlaceholderText(/Typed 510 instead of 10/i), { target: { value: "Typed 510 for 10" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url).toBe("/api/store/ck-delivery/deliveries/202/items/6571/qty");
    expect(calls[0].body).toEqual({ qty: 10, reason: "Typed 510 for 10" });
  });

  it("a confirmed note offers prices only", async () => {
    mockFetch.mockImplementation(() => json(delivery("CONFIRMED")));
    render(<NotePage />);
    fireEvent.click(await screen.findByRole("button", { name: /^Edit Prices$/i }));
    expect(screen.queryByLabelText(/Quantity for Gyoza Wrapper/i)).toBeNull();
    expect(screen.getByText(/this delivery is confirmed/i)).toBeInTheDocument();
  });
});
