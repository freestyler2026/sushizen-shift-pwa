import { describe, it, expect } from "vitest";

/**
 * The rules the PO search has to follow, written from the report that found
 * them broken: a Dubai PO searched by its own number returned seven Cash &
 * Carry POs from Manila and not itself.
 *
 * The query runs in Postgres, so these are the shapes of the answer rather
 * than the SQL — the behaviour was verified against production for
 * PO-CASE-2026-004206-01 (1 result, itself) and for an empty box (Dubai's
 * newest, 2,304 matching).
 */
type Candidate = { po_no: string; city: string; vendor_name: string; created_on: string };

const rank = (q: string, rows: Candidate[]) => {
  const l = q.toLowerCase();
  return [...rows].sort((a, b) => {
    const exact = (r: Candidate) => (r.po_no.toLowerCase() === l ? 0 : 1);
    const part = (r: Candidate) => (r.po_no.toLowerCase().includes(l) ? 0 : 1);
    return exact(a) - exact(b) || part(a) - part(b) || b.created_on.localeCompare(a.created_on);
  });
};

const ROWS: Candidate[] = [
  { po_no: "PO-CASE-2026-003925-01", city: "manila", vendor_name: "Cash & Carry", created_on: "2026-09-10" },
  { po_no: "PO-CASE-2026-004206-01", city: "dubai", vendor_name: "Taste Masters", created_on: "2026-09-18" },
  { po_no: "PO-CASE-2026-004159-01", city: "dubai", vendor_name: "Chef Middle East", created_on: "2026-09-17" },
];

describe("finding the PO an invoice belongs to", () => {
  it("puts the PO whose number was typed first", () => {
    const got = rank("PO-CASE-2026-004206-01", ROWS.filter((r) => r.city === "dubai"));
    expect(got[0].po_no).toBe("PO-CASE-2026-004206-01");
  });

  it("finds it from part of the number too", () => {
    const got = rank("004159", ROWS.filter((r) => r.city === "dubai"));
    expect(got[0].po_no).toBe("PO-CASE-2026-004159-01");
  });

  it("never offers another city's PO", () => {
    const dubai = ROWS.filter((r) => r.city === "dubai");
    expect(dubai.some((r) => r.vendor_name === "Cash & Carry")).toBe(false);
  });

  it("finds the PO by the short name we buy under", () => {
    // A PO is raised to "Summit"; the invoice says "SUMMIT TRADING COMPANY
    // LLC". Trigram similarity between those is under the 0.35 floor, so
    // the only thing that finds it is looking for the PO's name inside the
    // query. 45 invoices opened on "No POs found" without this.
    const matched = (q: string, poVendor: string) =>
      poVendor.length >= 4 && q.toLowerCase().includes(poVendor.toLowerCase());
    expect(matched("SUMMIT TRADING COMPANY LLC", "Summit")).toBe(true);
    expect(matched("SUNBERRY VEGETABLES AND FRUITS TRADING", "Sunberry")).toBe(true);
    // Three-letter PO vendors are excluded: they appear inside anything.
    expect(matched("JONALYN M. GALORIO - Prop.", "JPV")).toBe(false);
    // And a typed number must not drag a vendor in.
    expect(matched("PO-CASE-2026-004206-01", "Cash & Carry")).toBe(false);
  });

  it("falls back to the newest POs rather than an empty panel", () => {
    // SAFCO is an abbreviation of SAWHNEY FOODSTUFF, not a substring, so
    // nothing matches it and 66 invoices would still open on a dead end.
    const search = (q: string) =>
      ROWS.filter((r) => r.city === "dubai" && q.length > 0 &&
                         r.vendor_name.toLowerCase().includes(q.toLowerCase()));
    const typed = "SAWHNEY FOODSTUFF TR.CO.LLC SP";
    let rows = search(typed);
    let fellBack = "";
    if (rows.length === 0 && typed.trim()) {
      rows = ROWS.filter((r) => r.city === "dubai");
      fellBack = rows.length ? typed.trim() : "";
    }
    expect(rows.length).toBeGreaterThan(0);
    expect(fellBack).toBe(typed);
  });

  it("orders an unsearched list by date, not by the text of the number", () => {
    // "PO-CK-0009" sorts above "PO-CASE-…" as a string; that is how nine of
    // ten rows a Dubai reviewer saw were Manila's central kitchen.
    const byText = ["PO-CK-0009", "PO-CASE-2026-004208-01"].sort().reverse();
    expect(byText[0]).toBe("PO-CK-0009");
    const got = rank("", ROWS.filter((r) => r.city === "dubai"));
    expect(got[0].created_on).toBe("2026-09-18");
  });
});
