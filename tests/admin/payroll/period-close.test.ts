/**
 * Closing a Manila fortnight needs a control, and the control needs to say
 * what it freezes.
 *
 * Until 2026-09-30 no screen called PATCH /periods/{id}/status, so a period
 * only ever reached `paid` by script — and `paid` is what stops it being
 * recomputed after people have the money. A guard keyed on a state the
 * product cannot reach protects one fortnight and nothing after it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(__dirname, "..", "..", "..", "src/app/admin/payroll/manila/[periodId]/page.tsx"), "utf8");

describe("closing a fortnight", () => {
  it("has a control that calls the endpoint", () => {
    expect(SRC).toContain("/periods/${periodId}/status");
    expect(SRC).toContain('status: "paid"');
    expect(SRC).toContain("Mark as paid");
  });

  it("names what closing costs before it happens", () => {
    const confirm = SRC.split("const closePeriod")[1].split("apiFetch")[0];
    for (const said of ["freezes", "recompute", "still open"]) {
      expect(confirm, `the confirmation never mentions ${said}`).toContain(said);
    }
    // Unpublished payslips carrying money are the thing you cannot undo after.
    expect(confirm).toContain("unpublished");
  });

  it("is offered only to the three roles the server accepts", () => {
    expect(SRC).toContain('const CAN_CLOSE = new Set(["ADMIN", "HQ", "HR_MANAGER"])');
    expect(SRC).toContain("mayClose");
  });

  it("says so, rather than offering the button again, once it is closed", () => {
    expect(SRC).toContain('period.status === "paid"');
    expect(SRC).toContain("this fortnight is closed");
  });
});
