import { describe, it, expect } from "vitest";
import {
  LANES, STAGE_LABEL, STORE_STAGES, OUTSIDE_THE_FIVE, SERVER_FETCHED_STAGES, storeStageOf, stageOf, stageAddsInformation,
  type DirectPurchaseRow,
} from "@/lib/direct-purchase-stage";

const row = (stage: string): DirectPurchaseRow =>
  ({ id: "x", stage } as unknown as DirectPurchaseRow);

describe("the Store Procurement five stages (Yusuke's 4)", () => {
  it("is the five he named, in his order", () => {
    expect(STORE_STAGES.map(s => s.label))
      .toEqual(["Request", "Approval", "PO Issued", "Delivered", "Received"]);
  });

  it("separates 'supplier has not sent it' from 'here but not received'", () => {
    // The Direct Purchase screen merges these into Incoming; the back office
    // cannot, because they are different people's problems.
    expect(storeStageOf(row("PO_ISSUED"))).toBe("PO_ISSUED");
    expect(storeStageOf(row("DELIVERED"))).toBe("DELIVERED");
    expect(storeStageOf(row("PO_ISSUED"))).not.toBe(storeStageOf(row("DELIVERED")));
  });

  it("keeps 'approved but no PO' reachable — it is one of the five he listed", () => {
    expect(storeStageOf(row("APPROVED_NO_PO"))).toBe("PO_ISSUED");
  });

  it("answers each question he asked the screen to answer", () => {
    expect(storeStageOf(row("IN_REVIEW"))).toBe("APPROVAL");      // not approved yet
    expect(storeStageOf(row("APPROVED_NO_PO"))).toBe("PO_ISSUED"); // approved, no PO
    expect(storeStageOf(row("PO_ISSUED"))).toBe("PO_ISSUED");      // PO out, not delivered
    expect(storeStageOf(row("DELIVERED"))).toBe("DELIVERED");      // delivered, not received
    expect(storeStageOf(row("RECEIVED"))).toBe("RECEIVED");        // done
  });

  it("puts rejected and cancelled outside the five rather than inventing a stage", () => {
    expect(storeStageOf(row("REJECTED"))).toBe("");
    expect(storeStageOf(row("CANCELLED"))).toBe("");
  });

  it("draws both screens' groupings from one stage vocabulary", () => {
    const known = new Set(Object.keys(STAGE_LABEL));
    for (const l of [...LANES, ...STORE_STAGES]) {
      for (const st of l.stages) {
        expect(known.has(st), `${st} is not a known stage`).toBe(true);
      }
    }
  });

  // Every stage value production actually produces, counted on 2026-09-26
  // across both cities. PROC_STAGE_SQL falls through to r.status for anything
  // its CASE does not name, so this is the real vocabulary — not the one I
  // wrote. The previous version of this test compared STAGE_LABEL against
  // STORE_STAGES, i.e. my list against my list, and passed while 121 orders
  // (RETURNED 90, IN_PRODUCTION 28, PURCHASED 3) belonged to no group at all.
  const STAGES_IN_PRODUCTION = [
    "APPROVED_NO_PO", "CANCELLED", "DELIVERED", "DRAFT", "IN_PRODUCTION",
    "IN_REVIEW", "PO_ISSUED", "PURCHASED", "RECEIVED", "REJECTED",
    "RETURNED", "SUBMITTED",
  ];

  it("has a name for every stage the data actually produces", () => {
    const missing = STAGES_IN_PRODUCTION.filter(st => !STAGE_LABEL[st]);
    expect(missing).toEqual([]);
  });

  it("accounts for every stage: in the five, or deliberately outside with a reason", () => {
    const inFive = new Set(STORE_STAGES.flatMap(l => l.stages));
    const unaccounted = STAGES_IN_PRODUCTION
      .filter(st => !inFive.has(st) && !OUTSIDE_THE_FIVE[st]);
    expect(unaccounted).toEqual([]);
  });

  it("does not quietly count an outside stage as one of the five", () => {
    const inFive = new Set(STORE_STAGES.flatMap(l => l.stages));
    for (const st of Object.keys(OUTSIDE_THE_FIVE)) {
      expect(inFive.has(st), `${st} is both inside and outside`).toBe(false);
    }
  });

  it("falls back to the row's status when the API sends no stage", () => {
    const legacy = { id: "x", status: "approved" } as unknown as DirectPurchaseRow;
    expect(stageOf(legacy)).toBe("APPROVED");
  });
});

describe("the row badge only says what the status badge does not", () => {
  // The store row already shows DRAFT / IN REVIEW / APPROVED / RETURNED /
  // REJECTED. Repeating those as a stage taught nobody anything and collided
  // with the KPI labels; what "APPROVED" hides is the whole point of (4).
  // The chip has branches for DRAFT / APPROVED / RETURNED / REJECTED /
  // IN REVIEW only.
  const CHIP_SHOWS = ["DRAFT", "SUBMITTED", "IN_REVIEW", "RETURNED", "REJECTED"];

  it("says nothing twice", () => {
    for (const st of CHIP_SHOWS) expect(stageAddsInformation(st)).toBe(false);
  });

  it("speaks for every stage the chip is silent about", () => {
    // The four APPROVED hides, plus the ones with no chip branch at all —
    // 31 orders on production showed no state whatsoever before this.
    for (const st of ["APPROVED_NO_PO", "PO_ISSUED", "DELIVERED", "RECEIVED",
                      "IN_PRODUCTION", "PURCHASED", "CANCELLED"]) {
      expect(stageAddsInformation(st), `${st} would render blank`).toBe(true);
    }
  });
});

describe("the strip's caption", () => {
  it("does not report a server-fetched chip as short of rows", () => {
    // "Request shows 0 of 261" about a chip that loads all 261 when pressed
    // is the screen calling itself broken.
    expect(SERVER_FETCHED_STAGES.has("REQUEST")).toBe(true);
    expect(SERVER_FETCHED_STAGES.has("APPROVAL")).toBe(true);
    expect(SERVER_FETCHED_STAGES.has("PO_ISSUED")).toBe(false);
  });

  it("gives every outside stage its own reason", () => {
    for (const k of Object.keys(OUTSIDE_THE_FIVE)) {
      expect(OUTSIDE_THE_FIVE[k].length).toBeGreaterThan(0);
      expect(OUTSIDE_THE_FIVE[k]).not.toContain(";");  // joined text must stay readable
    }
  });
});
