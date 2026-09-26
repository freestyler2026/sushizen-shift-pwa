import { describe, it, expect } from "vitest";
import {
  LANES, STAGE_LABEL, STORE_STAGES, storeStageOf, stageOf,
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

  it("leaves no stage unreachable on the store screen except the terminal ones", () => {
    const covered = new Set(STORE_STAGES.flatMap(l => l.stages));
    const uncovered = Object.keys(STAGE_LABEL).filter(st => !covered.has(st));
    expect(uncovered.sort()).toEqual(["CANCELLED", "REJECTED"]);
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
  const REFINES = ["APPROVED_NO_PO", "PO_ISSUED", "DELIVERED", "RECEIVED"];
  const ALREADY_ON_THE_ROW = ["DRAFT", "SUBMITTED", "IN_REVIEW", "REJECTED", "CANCELLED"];

  it("covers every stage that APPROVED would otherwise hide", () => {
    const afterApproval = Object.keys(STAGE_LABEL)
      .filter(st => !ALREADY_ON_THE_ROW.includes(st));
    expect(afterApproval.sort()).toEqual([...REFINES].sort());
  });

  it("does not repeat a status the row already shows", () => {
    for (const st of ALREADY_ON_THE_ROW) {
      expect(REFINES).not.toContain(st);
    }
  });
});
