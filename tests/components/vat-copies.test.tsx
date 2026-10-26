/**
 * Copies on the VAT Ledger (2026-10-26, Aliana's report): pairs that look like one
 * invoice photographed twice are pointed out, and a person leaves one out or says
 * they are two purchases; any row can be marked a copy of another by hand.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lucideMock } from "../lucide-mock";

vi.mock("lucide-react", () => lucideMock());
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/components/vat/Form2550Q", () => ({ default: () => null }));
vi.mock("@/components/vat/Slsp", () => ({ default: () => null }));
vi.mock("@/lib/auth", () => ({ getAuth: () => ({ role: "HQ" }), getAuthHeaders: () => ({}), hasRouteAccess: () => true }));

const side = (over: Record<string, unknown>) => ({
  source: "drive_invoices", source_id: "6507", bucket: "deductible", vendor: "LESALE COMMODITY", invoice_number: "07486280",
  invoice_date: "2026-10-22", total: "10963.25", vat: "1174.63", seller_tin: "000150640000", copies: 3, ...over });
const row = (over: Record<string, unknown>) => ({
  bucket: "not_deductible", reasons: ["buyer_tin_not_ours"], checks: [], review_fields: [], source: "drive_invoices",
  source_id: "6461", review_status: "approved", vendor: "CASH & CARRY", invoice_number: "728663",
  invoice_date: "2026-10-22", total: "10963.25", vat: "1174.63", buyer_tin: null, buyer_name: null, buyer_decision: null, ...over });

function summary(input: Record<string, unknown>) {
  return {
    year: 2026, quarter: 4, from: "2026-10-01", to: "2026-12-31", due: "2027-01-25", days_to_due: 90, quarter_ended: false,
    output_vat: "0", input_vat: "0", payable: "0", needs_review: 0, days_not_settled: 0, can_manage: true, awaiting_invoice: null,
    output: { stores: [], vat_inclusive_sales: "0", vatable_sales: "0", output_vat: "0", vat_exempt_sales: "0",
      rounding_difference: "0", through: "2026-10-26", scpwd: { transactions: 0, exempt_sales: "0", vat_billed_to_senior: [] },
      platform_adjustments: { applied: "0", vat: "0", lines: [] }, days_not_settled: [], days_without_sales: [], not_in_storehub_before: [] },
    input: { deductible: { documents: 1, input_vat: "1174.63" }, needs_review: { documents: 0, vat_printed: "0" },
      not_deductible: { documents: 1, vat_printed: "1174.63" }, excluded_not_a_purchase: 0, rows: [], ...input },
    withholding: { withheld: "0", received_2307: "0", awaiting: 0, lines: [] },
  };
}

afterEach(() => { vi.unstubAllGlobals(); });

async function open(body: unknown, confirm = true) {
  const f = vi.fn(async (url: string, init?: RequestInit) => ({
    ok: true, status: 200, json: async () => (String(url).includes("/api/admin/vat/summary") ? body : { ok: true, init }) }));
  vi.stubGlobal("fetch", f);
  vi.stubGlobal("confirm", vi.fn(() => confirm));
  const Page = (await import("@/app/admin/finance/vat/page")).default;
  render(<Page />);
  await screen.findAllByText(/CASH & CARRY|LESALE COMMODITY/);
  return f;
}
const posted = (f: ReturnType<typeof vi.fn>, path: string) =>
  f.mock.calls.filter((c) => String(c[0]) === path).map((c) => JSON.parse(String((c[1] as RequestInit).body)));

describe("VAT copies", () => {
  const pair = { a: side({}), b: side({ source_id: "6461", bucket: "not_deductible", vendor: "CASH & CARRY", invoice_number: "728663", copies: 3 }), why: "same_date" };

  it("leaves out every photo counted as that document, not only the one shown", async () => {
    // bc2e was read with another total: maybe another invoice under a misread number, so it stays.
    const withMembers = { ...pair, b: { ...pair.b, members: [{ source: "drive_invoices", source_id: "6461", total: "10963.25" },
      { source: "proc_receivings", source_id: "3466", total: "10963.25" }, { source: "proc_po_invoice_checks", source_id: "bc2e", total: "999.00" }] } };
    const f = await open(summary({ possible_copies: [withMembers] }));
    fireEvent.click(screen.getAllByRole("button", { name: "Leave this one out" })[1]);
    await waitFor(() => expect(posted(f, "/api/admin/vat/same-invoice")).toEqual([
      { source: "drive_invoices", source_id: "6461", same_as_source: "drive_invoices", same_as_id: "6507",
        also: [{ source: "proc_receivings", source_id: "3466" }] }]));
  });

  it("asks before Not a copy, and lists the answer with an Undo", async () => {
    const f = await open(summary({ possible_copies: [pair], not_copies: [{ ...pair, a: side({ source_id: "A1" }) }] }), false);
    fireEvent.click(screen.getByRole("button", { name: /Not a copy/ }));
    await new Promise((r) => setTimeout(r, 30));
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(posted(f, "/api/admin/vat/not-same-invoice")).toEqual([]);
    expect(screen.getByText("Marked as two purchases")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(posted(f, "/api/admin/vat/not-same-invoice/undo")).toEqual([
      { a: [{ source: "drive_invoices", source_id: "A1" }], b: [{ source: "drive_invoices", source_id: "6461" }] }]));
  });

  it("points out a pair and leaves the chosen one out as a copy of the other", async () => {
    const f = await open(summary({ possible_copies: [pair] }));
    expect(screen.getByText(/Possible copies/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Leave this one out" })[1]);   // the refused 6461
    await waitFor(() => expect(posted(f, "/api/admin/vat/same-invoice")).toEqual([
      { source: "drive_invoices", source_id: "6461", same_as_source: "drive_invoices", same_as_id: "6507", also: [] }]));
  });

  it("asks before leaving out the one counted as deductible, and sends nothing on No", async () => {
    const f = await open(summary({ possible_copies: [pair] }), false);
    fireEvent.click(screen.getAllByRole("button", { name: "Leave this one out" })[0]);   // 6507, deductible
    await new Promise((r) => setTimeout(r, 30));
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(posted(f, "/api/admin/vat/same-invoice")).toEqual([]);
  });

  it("also asks before leaving out one still to check when the one kept is refused", async () => {
    const review = { ...pair, a: side({ bucket: "needs_review" }) };
    const f = await open(summary({ possible_copies: [review] }), false);
    fireEvent.click(screen.getAllByRole("button", { name: "Leave this one out" })[0]);
    await new Promise((r) => setTimeout(r, 30));
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(posted(f, "/api/admin/vat/same-invoice")).toEqual([]);
  });

  it("offers neither a photo nor Leave out on a foodpanda invoice", async () => {
    await open(summary({ possible_copies: [{ ...pair, b: side({ source: "fp_sales_invoices", source_id: "S1", vendor: "CASH & CARRY" }) }] }));
    expect(screen.getAllByRole("button", { name: "Leave this one out" })).toHaveLength(1);
  });

  it("Not a copy records the pair", async () => {
    const f = await open(summary({ possible_copies: [pair] }));
    fireEvent.click(screen.getByRole("button", { name: /Not a copy/ }));
    await waitFor(() => expect(posted(f, "/api/admin/vat/not-same-invoice")).toEqual([
      { source: "drive_invoices", source_id: "6507", other_source: "drive_invoices", other_id: "6461" }]));
  });

  it("marks a row a copy of a document with the same total, chosen from a list of the same seller's", async () => {
    const counted = row({ bucket: "deductible", reasons: [], source_id: "6507", vendor: "LESALE COMMODITY", invoice_number: "07486280",
      seller_tin: "000-150-640-000" });
    const otherSeller = row({ source_id: "9999", vendor: "SOMEONE ELSE", invoice_number: "5", seller_tin: "111-111-111-000" });
    const farAway = row({ source_id: "8888", vendor: "LESALE COMMODITY", invoice_number: "6", invoice_date: "2026-12-30" });
    const f = await open(summary({ rows: [row({ seller_tin: "000150640000" }), counted, otherSeller, farAway] }));
    fireEvent.click(screen.getAllByRole("button", { name: /Copy of another invoice/ })[0]);
    // Only 6507: not another seller's, not one two months away.
    expect(await screen.findAllByRole("button", { name: "Copy of this one" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Copy of this one" }));
    await waitFor(() => expect(posted(f, "/api/admin/vat/same-invoice")).toEqual([
      { source: "drive_invoices", source_id: "6461", same_as_source: "drive_invoices", same_as_id: "6507", also: [] }]));
  });

  it("lists every photo left out, each with its own Undo", async () => {
    const copy = { source: "drive_invoices", source_id: "6461", vendor: "CASH & CARRY", invoice_number: "728663", invoice_date: "2026-10-22",
      total: "10963.25", vat: "1174.63", same_as_source: "drive_invoices", same_as_id: "6507", decided_by: "Yukihiro Nishimura", decided_at: "" };
    await open(summary({ left_out_as_copy: [copy, { ...copy, source: "proc_receivings", source_id: "3466" }] }));
    expect(screen.getAllByRole("button", { name: "Undo" })).toHaveLength(2);
  });

  it("shows no write control to someone without VAT management", async () => {
    const body = summary({ possible_copies: [pair], rows: [row({})] });
    await open({ ...body, can_manage: false });
    expect(screen.queryByRole("button", { name: "Leave this one out" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Not a copy/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Copy of another invoice/ })).toBeNull();
  });

  it("Undo of Our TIN reaches the photo it is stored on when another photo stands", async () => {
    const decided = row({ bucket: "deductible", reasons: [], checks: ["buyer_tin_check"], source: "proc_po_invoice_checks", source_id: "a1",
      buyer_decision: { decision: "ours", decided_by: "Y", decided_at: "2026-10-06", on: { source: "proc_receivings", source_id: "z9" } } });
    const f = await open(summary({ rows: [decided] }));
    fireEvent.click(screen.getAllByRole("button", { name: "Undo" })[0]);
    await waitFor(() => expect(f.mock.calls.some((c) => String(c[0]) === "/api/admin/vat/buyer-decision?source=proc_receivings&source_id=z9"
      && (c[1] as RequestInit)?.method === "DELETE")).toBe(true));
  });
});
