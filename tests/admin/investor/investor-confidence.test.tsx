/**
 * HQ, 2026-11-27: after meeting the investors in Japan, a minimum and maximum
 * besides the planned amount, and a confidence (A / B / C / not investing)
 * with the amounts totalled for each.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { confidenceTotals } from "@/lib/investor-confidence";

vi.mock("@/lib/auth", () => ({ getAuth: () => ({ role: "HQ" }), getAuthHeaders: () => ({}) }));

const step = { status: "pending", done_on: null, memo: "", updated_by: "", updated_at: null };
const steps = { guide_email: step, fu_email: step, fu_call_1: step, fu_call_2: step, received: step };
function inv(id: number, name: string, planned: number, conf: string, min: number | null = null, max: number | null = null, hold = "") {
  return {
    id, name, planned_amount: planned, min_amount: min, max_amount: max, confidence: conf, currency: "JPY",
    method: "BANK_TRANSFER", method_note: "", project: "", email: "", phone: "", notes: "", hold,
    received_amount: null, received_currency: "", received_account: "", received_ref: "", received_diff: null,
    status: hold || "NOT_STARTED", next_action: null, steps, created_by: "HQ", created_at: null, updated_at: null,
  };
}
const CASES = [
  inv(1, "Utsumi", 1_000_000, "A"),
  inv(2, "Takagi", 5_000_000, "A", 3_000_000, 5_000_000),
  inv(3, "Tokunaga", 10_000_000, "B", 5_000_000, 20_000_000),
  inv(4, "Yamamoto", 2_000_000, ""),
  inv(5, "Gone", 9_000_000, "C", null, null, "WITHDRAWN"),
  inv(6, "Not this time", 1_000_000, "NONE"),
];

describe("confidenceTotals", () => {
  it("adds up each confidence, using the planned amount where there is no range", () => {
    const rows = Object.fromEntries(confidenceTotals(CASES).map((r) => [r.key, r]));
    expect(rows.A.people).toBe(2);
    expect(rows.A.byCur.JPY).toEqual({ min: 4_000_000, planned: 6_000_000, max: 6_000_000 });
    expect(rows.B.byCur.JPY).toEqual({ min: 5_000_000, planned: 10_000_000, max: 20_000_000 });
    expect(rows.C.people).toBe(0);                                  // the withdrawn one is not counted
    expect(rows.ABC.byCur.JPY).toEqual({ min: 9_000_000, planned: 16_000_000, max: 26_000_000 });
    expect(rows.NONE.people).toBe(1);
    expect(rows[""].byCur.JPY.planned).toBe(2_000_000);
    expect(confidenceTotals(CASES).map((r) => r.label)).toEqual(["A", "B", "C", "A + B + C", "No investment", "Not set"]);
  });
});

describe("Investor Funding page", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  function serve() {
    const calls: { url: string; method: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method || "GET").toUpperCase();
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : {} });
      const body = method === "POST" ? { case: inv(9, "New", 3_000_000, "B", 1_000_000, 5_000_000) }
        : { cases: CASES, settings: { fu_email: 3, fu_call_1: 7, fu_call_2: 10 } };
      return { ok: true, status: 200, json: async () => body };
    }));
    return calls;
  }

  it("shows the totals by confidence and filters the list by a row", async () => {
    serve();
    const { default: Page } = await import("@/app/admin/investor-funding/page");
    render(<Page />);
    const table = await screen.findByTestId("by-confidence");
    await waitFor(() => expect(table.textContent).toContain("¥16,000,000"));
    const abc = within(table).getByText("A + B + C").closest("tr")!;
    expect(abc.textContent).toContain("¥9,000,000");
    expect(abc.textContent).toContain("¥26,000,000");
    // Takagi's range shows under the planned amount.
    expect(screen.getByText("¥3,000,000 – ¥5,000,000")).toBeTruthy();
    // Clicking B leaves only Tokunaga in the list.
    fireEvent.click(within(table).getAllByText("B")[0].closest("tr")!);
    await waitFor(() => expect(screen.queryByText("Utsumi")).toBeNull());
    expect(screen.getByText("Tokunaga")).toBeTruthy();
  });

  it("sends the minimum, maximum and confidence when adding an investor", async () => {
    const calls = serve();
    const { default: Page } = await import("@/app/admin/investor-funding/page");
    render(<Page />);
    await screen.findByText("Utsumi");
    fireEvent.click(screen.getByText("Add investor"));
    const form = screen.getAllByText("Add investor").find((b) => b.getAttribute("type") === "submit")!.closest("form")!;
    const field = (label: RegExp) => within(form).getByText(label).querySelector("input") as HTMLInputElement;
    fireEvent.change(field(/^Name/), { target: { value: "New" } });
    fireEvent.change(within(form).getByPlaceholderText("21000000"), { target: { value: "3000000" } });
    fireEvent.change(field(/^Minimum amount/), { target: { value: "1000000" } });
    fireEvent.change(field(/^Maximum amount/), { target: { value: "5000000" } });
    fireEvent.submit(form);
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.body).toMatchObject({ planned_amount: "3000000", min_amount: "1000000", max_amount: "5000000", confidence: "" });
  });
});
