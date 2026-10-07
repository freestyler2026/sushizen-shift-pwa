// tests/hr/clearance-dubai-fields.test.ts
//
// The Dubai final-settlement form carried a "Prorated 13th Month" box. The
// 13th month is PD 851 — Philippine law — so the box printed 0.00 on every UAE
// settlement and invited somebody to put a number in it. Owner's instruction,
// 2026-10-07: take it off the Dubai form.
//
// The backend has the same rule for the printed PDF
// (tests/test_settlement_earning_lines.py). The two label sets genuinely
// differ — a screen box and a printed line are not the same wording — so what
// is shared, and what both sides are checked against, is only the choice of
// which rows exist.
import { describe, it, expect } from "vitest";
import { earningFields, showsThirteenthMonth } from "@/lib/clearance-fields";

const labels = (city: string, thirteenth: number | null = 0) =>
  earningFields(city, thirteenth).map((f) => f.label);

describe("final pay — which earnings boxes a case shows", () => {
  it("Manila still has the 13th month", () => {
    expect(labels("manila")).toContain("Prorated 13th Month");
    expect(labels("manila")).toContain("Separation Pay");
  });

  it("Dubai does not", () => {
    expect(labels("dubai")).not.toContain("Prorated 13th Month");
  });

  it("Dubai names the gratuity box after Article 51", () => {
    // The instruction to HR is "put the gratuity in that box". The box has to
    // say so, or the instruction lives only in a message nobody keeps.
    expect(labels("dubai")).toContain("End of Service Gratuity");
    expect(labels("dubai")).not.toContain("Separation Pay");
  });

  it("a Dubai case that already carries a 13th month still shows it", () => {
    // Hiding the box would take the amount off the screen while leaving it
    // inside the total. Money in the total is money on the page.
    expect(labels("dubai", 1234.5)).toContain("Prorated 13th Month");
  });

  it("zero and null are both 'nothing to show'", () => {
    expect(labels("dubai", 0)).not.toContain("Prorated 13th Month");
    expect(labels("dubai", null)).not.toContain("Prorated 13th Month");
    expect(labels("dubai", undefined)).not.toContain("Prorated 13th Month");
  });

  it("the spelling of the city does not decide it", () => {
    for (const spelling of ["Dubai", " DUBAI ", "dubai"]) {
      expect(labels(spelling), spelling).not.toContain("Prorated 13th Month");
    }
  });

  it("an unknown or missing city keeps the Manila form", () => {
    // The safe direction: an extra box somebody ignores, never a missing one.
    for (const city of ["", "jakarta"]) {
      expect(labels(city), city).toContain("Prorated 13th Month");
    }
  });

  it("no amount column disappears from the form", () => {
    // These keys are what the earnings total is built from. Dropping one here
    // would quietly take it off the screen while it still counts in the total.
    const keys = earningFields("dubai", 0).map((f) => f.k);
    expect(keys).toEqual([
      "fp_basic_pay", "fp_leave_conversion", "fp_separation_pay", "fp_allowance",
    ]);
    expect(earningFields("manila", 0).map((f) => f.k)).toContain("fp_prorated_13th");
  });

  it("the salary-history panel drops the ÷12 working on Dubai only", () => {
    expect(showsThirteenthMonth("dubai")).toBe(false);
    expect(showsThirteenthMonth("Dubai")).toBe(false);
    expect(showsThirteenthMonth("manila")).toBe(true);
    expect(showsThirteenthMonth("")).toBe(true);
  });
});
