// tests/store/inbox-price-alert.test.tsx
//
// Yusuke, 2026-10-16: a "Po Price Variance" card showed a title and buttons and
// nothing to act on. It now shows the template's title, the message (supplier,
// PO, store, invoice) and a link to the invoice check.
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/auth", () => ({
  getAuthHeaders: () => ({}),
  getAuth: () => ({ staffName: "Yusuke Uejima", role: "HQ", city: "manila" }),
}));

const TASK = {
  id: 2009, city: "manila", branch: "ALL", type: "po_price_variance", severity: "red", status: "sent",
  manager_name: "Yusuke Uejima", sent_at: "2026-10-16T03:12:47Z", created_at: "2026-10-16T03:12:47Z",
  sent_message: "Richcath's · PO-MAN-2026-0911 · TAFT\nWhite Cabbage was ordered at 60.00 per kg and invoiced at 100.00 per kg (+67%) on invoice 0001049.",
  context: { date: "2026-10-16", item: "White Cabbage", link: "/admin/procurement/po-match?tab=records&check=c-42&city=manila" },
};
const TEMPLATE = {
  exception_type: "po_price_variance", title_en: "Invoice Price Differs From PO", message_en: "",
  response_label: "Select Result",
  response_options: [{ key: "still_checking", type: "cannot", label_en: "Still Checking With Supplier" }],
  action_options: [],
};

global.fetch = vi.fn((url: string) => {
  const u = String(url);
  const body = u.includes("/templates") ? { templates: [TEMPLATE] }
    : u.includes("/api/store/management/tasks?") ? { tasks: [TASK], viewer: "Yusuke Uejima" }
    : {};
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
}) as unknown as typeof fetch;

import InboxPage from "@/app/store/management/inbox/page";

describe("Manager Inbox — PO price alert", () => {
  it("shows the title, the PO and supplier, and links to the invoice check", async () => {
    render(<InboxPage />);
    expect(await screen.findByText("Invoice Price Differs From PO")).toBeInTheDocument();
    expect(screen.getByText(/Richcath's · PO-MAN-2026-0911 · TAFT/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Open the invoice check/i });
    expect(link.getAttribute("href")).toBe("/admin/procurement/po-match?tab=records&check=c-42&city=manila");
  });
});
