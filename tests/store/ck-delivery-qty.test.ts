import { describe, it, expect } from "vitest";

/** Mirrors fmtQty in src/app/store/ck-delivery/page.tsx. */
function fmtQty(q: number) {
  if (!Number.isFinite(q)) return "0";
  return String(Math.round(q * 100) / 100);
}

/** What it used to do, and why the branch and the screen disagreed. */
function fmtQtyOneDecimal(q: number) {
  return q % 1 === 0 ? String(q) : q.toFixed(1);
}

describe("CK delivery quantities", () => {
  it("keeps the second decimal the branch actually received", () => {
    // The row that prompted this: a note saying "We received 0.250kg only"
    // next to a figure reading 0.3.
    expect(fmtQtyOneDecimal(0.25)).toBe("0.3");
    expect(fmtQty(0.25)).toBe("0.25");
    expect(fmtQty(0.125)).toBe("0.13");
    expect(fmtQty(1.05)).toBe("1.05");
  });

  it("does not add decimals that were never there", () => {
    expect(fmtQty(8)).toBe("8");
    expect(fmtQty(1)).toBe("1");
    expect(fmtQty(0.3)).toBe("0.3");
    expect(fmtQty(1.5)).toBe("1.5");
    expect(fmtQty(0)).toBe("0");
  });

  it("survives a missing quantity", () => {
    expect(fmtQty(NaN)).toBe("0");
    expect(fmtQty(Number.POSITIVE_INFINITY)).toBe("0");
  });
});
