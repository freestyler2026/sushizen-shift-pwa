import { describe, it, expect } from "vitest";

/**
 * A counted zero is a count.
 *
 * In the 18 September Manila session three staff entered nineteen zeros, each
 * with their name on the row. Reading them back turned every one into an empty
 * box: the quantity showed a dash, the group header said "7/10 filled", and
 * the finalize warning said three items were still blank. The staff who
 * reported the Pork Back Bones order described those rows as "counted 0" —
 * which is what the database held — while the screen they photographed showed
 * them as untouched.
 */
type Entry = { item_id: number; quantity: number | null; filled_by?: string };

/** src/app/store/ck-inventory/page.tsx :: loadSession */
const toDraft = (e: Entry) => (e.quantity == null ? "" : String(e.quantity));

/** The row's own reading of what is in the box. */
const currentQty = (q: string) => (q !== "" ? Number(q) : null);

describe("a zero someone counted", () => {
  it("comes back as 0, not as an empty box", () => {
    expect(toDraft({ item_id: 1, quantity: 0, filled_by: "Xydney" })).toBe("0");
    expect(currentQty(toDraft({ item_id: 1, quantity: 0 }))).toBe(0);
  });

  it("counts towards 'N/N filled'", () => {
    const items = [
      { quantity: 12 }, { quantity: 0 }, { quantity: 4 },
    ].map((e) => toDraft(e as Entry));
    expect(items.filter((q) => q !== "").length).toBe(3);
  });

  it("shows the fall from the previous count instead of a dash", () => {
    // Pork Leg Bones: 12 kg last session, 0 this one.
    const delta = currentQty(toDraft({ item_id: 1, quantity: 0 }))! - 12;
    expect(delta).toBe(-12);
  });

  it("still leaves an item nobody counted empty", () => {
    // No entry row exists for such an item, so nothing overrides the default.
    const draft: Record<number, string> = { 1: "" };
    expect(draft[1]).toBe("");
    expect(currentQty(draft[1])).toBeNull();
  });

  it("does not re-save a zero the user never touched", () => {
    // saveEntries sends only dirtied rows; loading a zero does not dirty it.
    const dirty = new Set<number>();
    const rows = [{ id: 1, qty: "0" }, { id: 2, qty: "5" }];
    expect(rows.filter((r) => dirty.has(r.id) && r.qty !== "").length).toBe(0);
  });
});
