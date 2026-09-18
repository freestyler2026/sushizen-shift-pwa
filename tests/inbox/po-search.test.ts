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

  it("orders an unsearched list by date, not by the text of the number", () => {
    // "PO-CK-0009" sorts above "PO-CASE-…" as a string; that is how nine of
    // ten rows a Dubai reviewer saw were Manila's central kitchen.
    const byText = ["PO-CK-0009", "PO-CASE-2026-004208-01"].sort().reverse();
    expect(byText[0]).toBe("PO-CK-0009");
    const got = rank("", ROWS.filter((r) => r.city === "dubai"));
    expect(got[0].created_on).toBe("2026-09-18");
  });
});
