/** VAT Ledger times are Manila's (2026-10-22 ultra review: two showed the server's UTC). */
import { describe, expect, it } from "vitest";
import { manilaDate, manilaTime, peso } from "@/lib/vat-format";

describe("vat-format", () => {
  it("shows a save made at 07:00 Manila on that Manila day, not UTC's previous one", () => {
    expect(manilaDate("2026-10-22 23:00:00+00")).toBe("2026-10-23");
    expect(manilaDate("2026-10-22T05:00:00+00:00")).toBe("2026-10-22");
  });
  it("puts a close time on Manila's clock and says so", () => {
    expect(manilaTime("2026-10-23T02:00:00+00:00")).toBe("2026-10-23 10:00 Manila");
    expect(manilaTime(null)).toBe("");
  });
  it("writes pesos with a minus sign for a negative", () => {
    expect(peso("-54.41")).toBe("−₱54.41");
    expect(peso(1811262.24)).toBe("₱1,811,262.24");
  });
});
