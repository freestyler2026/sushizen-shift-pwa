/**
 * A report is matched against its OWN city's item list.
 *
 * The page loads the item master once at mount for the viewer's own city.
 * Yusuke is HQ registered to Dubai, so a Paranaque report was matched against
 * Dubai's 337 items — of which exactly 0 share an item_code with its 127
 * entries. The tabs read "Supplier 22 · Central Kitchen 0 · Warehouse 0": the
 * 22 were Manila supplier items the form view had merged in, and the 105
 * Central Kitchen lines he had recorded were not in the list being matched
 * against at all. A Manila account saw everything, which made it look like a
 * permissions problem.
 *
 * Measured on production 2026-10-04 (report 43053, PARANAQUE, 4 Oct PM):
 *   against Manila's master  127 of 127 match  (ck 105, supplier 22)
 *   against Dubai's master     0 of 127
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(process.cwd(), "src/components/admin/AdminDailyInventoryTab.tsx"), "utf8");

/** The body of ReportDetailView, which is where the matching happens. */
function detailView(): string {
  const i = SRC.indexOf("function ReportDetailView(");
  expect(i, "ReportDetailView is gone").toBeGreaterThan(-1);
  const j = SRC.indexOf("\nfunction ", i + 10);
  return SRC.slice(i, j > 0 ? j : undefined);
}

describe("the report detail matches against its own city", () => {
  it("reads the item list for the report's city rather than trusting the prop", () => {
    const body = detailView();
    expect(body).toContain("cityFromBranch(detail.branch)");
    expect(body).toMatch(/withCity\("\/api\/daily-inventory\/items[^"]*",\s*city\)/);
  });

  it("re-reads when the report changes, not only on mount", () => {
    const body = detailView();
    // A mount-only effect is what put the wrong city's list on screen in the
    // first place; opening a second report must not reuse the first's.
    expect(body).toMatch(/\}, \[city, detail\.id\]\)/);
  });

  it("counts a tab from items that the report actually has an entry for", () => {
    // This is why the symptom was a zero rather than an empty table: the badge
    // counts the intersection, so a missing master list reads as "nothing was
    // counted" rather than "nothing is loaded".
    const body = detailView();
    expect(body).toContain("entryMap[i.item_code] !== undefined");
  });

  it("asks for inactive items too, so a retired line still shows its count", () => {
    expect(detailView()).toContain("active_only=false");
  });
});
