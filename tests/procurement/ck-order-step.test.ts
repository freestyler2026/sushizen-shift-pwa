import { describe, it, expect } from "vitest";

/**
 * How much to make, when the kitchen makes things in batches.
 *
 * Asked for from the CK: the same step the kitchen's own orders to CK already
 * round to. par − stock says 1.47 kg of sauce is missing; nobody can cook
 * 1.47 kg. The sauce is made in quarter-kilo pouches, so the plan says 1.5.
 */

/** app/ck_par_level_api.py :: _round_to_step */
const roundToStep = (qty: number, step: number | null | undefined): number => {
  const q = Number(qty || 0);
  const st = step == null ? 0 : Number(step);
  if (!(q > 0) || !(st > 0)) return q;
  return Number((Math.ceil(Number((q / st).toFixed(9))) * st).toFixed(6));
};

describe("rounding a shortfall to what the kitchen makes", () => {
  it("rounds up to the next whole batch", () => {
    expect(roundToStep(1.47, 0.25)).toBe(1.5);
    expect(roundToStep(0.7, 0.5)).toBe(1.0);
    expect(roundToStep(4.1, 2)).toBe(6);
  });

  it("leaves an exact multiple alone", () => {
    expect(roundToStep(1.5, 0.25)).toBe(1.5);
    expect(roundToStep(4, 2)).toBe(4);
  });

  it("does not overshoot on a float that is already a multiple", () => {
    // 0.1 + 0.2 is 0.30000000000000004, so 0.3 / 0.1 comes to 3.0000000000000004
    // and a bare ceil gives 4 — a third more sauce than anyone asked for.
    expect(roundToStep(0.1 + 0.2, 0.1)).toBe(0.3);
    expect(roundToStep(0.3, 0.1)).toBe(0.3);
  });

  it("does nothing at all until somebody sets a step", () => {
    // Every one of Manila's 58 CK rows is like this on the day it ships.
    expect(roundToStep(1.47, null)).toBe(1.47);
    expect(roundToStep(1.47, undefined)).toBe(1.47);
    expect(roundToStep(1.47, 0)).toBe(1.47);
  });

  it("never turns nothing into something", () => {
    // Stock at or above par must stay off the plan, step or no step.
    expect(roundToStep(0, 0.5)).toBe(0);
    expect(roundToStep(-1, 0.5)).toBe(-1);
  });

  it("only offers the catalogue's step when the units agree", () => {
    // Shoyu Ramen Soup is counted in g on the par list and KG in the
    // catalogue; 0.5 of the wrong one is a thousandfold error.
    const offer = (parUnit: string, catUnit: string, step: number) =>
      !catUnit || catUnit.toLowerCase() === parUnit.toLowerCase() ? step : null;
    expect(offer("KG", "KG", 0.5)).toBe(0.5);
    expect(offer("KG", "", 0.5)).toBe(0.5); // blank is a gap, not a contradiction
    expect(offer("g", "KG", 0.5)).toBeNull();
  });
});
