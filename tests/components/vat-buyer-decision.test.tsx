/**
 * Our TIN / Not ours on the VAT Ledger: the decision is a VAT act, offered only
 * to VAT managers, and it can be undone from the same page.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lucideMock } from "../lucide-mock";

vi.mock("lucide-react", () => lucideMock());
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/components/vat/Form2550Q", () => ({ default: () => null }));
vi.mock("@/components/vat/Slsp", () => ({ default: () => null }));
vi.mock("@/lib/auth", () => ({ getAuth: () => ({ role: "HQ" }), getAuthHeaders: () => ({}), hasRouteAccess: () => true }));

const row = (over: Record<string, unknown>) => ({
  bucket: "needs_review", reasons: [], checks: ["buyer_tin_check"], review_fields: [], source: "drive_invoices",
  source_id: "842", review_status: "approved", vendor: "MIKANA ASIA CORPORATION", invoice_number: "1001",
  invoice_date: "2026-09-19", total: "7306.31", vat: "782.89", buyer_tin: "417-994-035-00000",
  buyer_name: "SUSHIZEN", buyer_decision: null, ...over });

function summary(rows: unknown[], canManage = true) {
  return {
    year: 2026, quarter: 3, from: "2026-07-01", to: "2026-09-30", due: "2026-10-25", days_to_due: 3, quarter_ended: true,
    output_vat: "0", input_vat: "0", payable: "0", needs_review: 1, days_not_settled: 0, can_manage: canManage,
    awaiting_invoice: null,
    output: { stores: [], vat_inclusive_sales: "0", vatable_sales: "0", output_vat: "0", vat_exempt_sales: "0",
      rounding_difference: "0", through: "2026-09-30", scpwd: { transactions: 0, exempt_sales: "0", vat_billed_to_senior: [] },
      platform_adjustments: { applied: "0", vat: "0", lines: [] }, days_not_settled: [], days_without_sales: [], not_in_storehub_before: [] },
    input: { deductible: { documents: 0, input_vat: "0" }, needs_review: { documents: 1, vat_printed: "782.89" },
      not_deductible: { documents: 0, vat_printed: "0" }, excluded_not_a_purchase: 0, rows },
    withholding: { withheld: "0", received_2307: "0", awaiting: 0, lines: [] },
  };
}

afterEach(() => { vi.unstubAllGlobals(); });

async function open(body: unknown) {
  const f = vi.fn(async (url: string, init?: RequestInit) => ({
    ok: true, status: 200, json: async () => (String(url).includes("buyer-decision") ? { ok: true, init } : body) }));
  vi.stubGlobal("fetch", f);
  const Page = (await import("@/app/admin/finance/vat/page")).default;
  render(<Page />);
  await screen.findByText("MIKANA ASIA CORPORATION");
  return f;
}

describe("VAT buyer decision", () => {
  it("shows what was read and records Our TIN for the document", async () => {
    const f = await open(summary([row({})]));
    expect(screen.getByText(/Read: TIN 417-994-035-00000/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Our TIN" }));
    await waitFor(() => expect(f.mock.calls.some((c) => String(c[0]) === "/api/admin/vat/buyer-decision")).toBe(true));
    const call = f.mock.calls.find((c) => String(c[0]) === "/api/admin/vat/buyer-decision")!;
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({ source: "drive_invoices", source_id: "842", decision: "ours" });
  });

  it("offers no decision to someone without VAT management", async () => {
    await open(summary([row({})], false));
    expect(screen.queryByRole("button", { name: "Our TIN" })).toBeNull();
  });

  it("keeps a counted decision reachable to undo", async () => {
    await open(summary([row({ bucket: "deductible", checks: [],
      buyer_decision: { decision: "ours", decided_by: "Yukihiro Nishimura", decided_at: "2026-10-22" } })]));
    expect(screen.getByText("Counted by a VAT decision")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();
  });
});
