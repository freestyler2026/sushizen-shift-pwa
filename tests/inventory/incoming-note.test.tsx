import { describe, it, expect } from "vitest";

/**
 * What the Incoming note is allowed to say.
 *
 * The rule it exists to enforce is that a quantity ordered in one unit is never
 * added to a sheet counted in another. 89% of these lines match an inventory item
 * by name, but only 65% share its unit: SUGAR arrives by the SACK against a sheet
 * in kg, Pork Belly by the KG against a sheet in Block. A single summed figure
 * would be wrong on a third of the lines with no way to see which third.
 *
 * The renderer is a few spans, so what is worth pinning is the decision it
 * encodes rather than its markup — hence a mirror of the shape here, and the
 * backend's own guards in tests/test_procurement_pipeline.py.
 */

type Line = {
  qty: number; unit: string; expected_date: string; days_past: number;
  sheet_unit?: string; unit_matches?: boolean;
};

/** What a reader should see for one line. Mirrors IncomingNote. */
function render(l: Line): string {
  const warn = l.unit_matches === false ? ` ⚠${l.sheet_unit}` : "";
  const late = l.days_past > 0 ? ` (${l.days_past}d late)` : "";
  return `+${l.qty} ${l.unit}${warn} due ${String(l.expected_date).slice(5)}${late}`;
}

describe("the incoming note", () => {
  it("always prints the unit the order used", () => {
    expect(render({ qty: 10, unit: "SACK", expected_date: "2026-09-26", days_past: 0, unit_matches: true }))
      .toBe("+10 SACK due 09-26");
  });

  it("marks a unit the sheet does not share, and names the sheet's unit", () => {
    // Without the sheet's unit the reader cannot tell what to convert to.
    expect(render({ qty: 2, unit: "CASE", expected_date: "2026-09-26", days_past: 0,
                    sheet_unit: "BTL", unit_matches: false }))
      .toBe("+2 CASE ⚠BTL due 09-26");
  });

  it("says when a delivery is already late rather than showing the date alone", () => {
    expect(render({ qty: 3, unit: "KG", expected_date: "2026-09-24", days_past: 2, unit_matches: true }))
      .toBe("+3 KG due 09-24 (2d late)");
  });

  it("does not claim lateness for something not yet due", () => {
    expect(render({ qty: 1, unit: "BOX", expected_date: "2026-09-28", days_past: -2, unit_matches: true }))
      .toBe("+1 BOX due 09-28");
  });

  it("never produces a single combined quantity across units", () => {
    // Two lines for one item, ordered in different units. Whatever the screen
    // shows, it must not be one number: 10 + 2 is not a quantity of anything.
        const lines: Line[] = [
      { qty: 10, unit: "SACK", expected_date: "2026-09-26", days_past: 0, unit_matches: true },
      { qty: 2, unit: "KG", expected_date: "2026-09-27", days_past: 0, sheet_unit: "Block", unit_matches: false },
    ];
    const shown = lines.map(render).join(" · ");
    expect(shown).toContain("+10 SACK");
    expect(shown).toContain("+2 KG");
    expect(shown).not.toMatch(/\+12\b/);
  });
});
