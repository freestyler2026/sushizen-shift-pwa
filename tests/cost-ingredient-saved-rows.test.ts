import { describe, expect, it } from "vitest";
import { withoutSavedNewRows } from "@/lib/costIngredientRows";

// Staff report, 2026-11-01: a new ingredient saved and then edited came back as a second item,
// and "Proceed" renamed the first one "[old]".
describe("withoutSavedNewRows", () => {
  const server = { id: 501, name: "Plastic Bag (Cutlery)" };
  const saved = { id: "new-ingredient-1", name: "Plastic Bag (Cutlery)", _new: true };
  const unsaved = { id: "new-ingredient-2", name: "Chopsticks", _new: true };

  it("drops a new row the server now has, so the reload does not show it twice", () => {
    const rows = withoutSavedNewRows([server, saved, unsaved], new Set(["new-ingredient-1"]));
    expect(rows.map((r) => r.id)).toEqual([501, "new-ingredient-2"]);
  });

  it("keeps rows not yet saved, and never drops a server row", () => {
    expect(withoutSavedNewRows([server, saved, unsaved], new Set())).toHaveLength(3);
    expect(withoutSavedNewRows([server], new Set(["501"]))).toEqual([server]);
  });
});
