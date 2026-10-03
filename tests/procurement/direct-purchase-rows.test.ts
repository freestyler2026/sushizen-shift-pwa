/**
 * One row per supplier, and chips that count every row rather than the page.
 *
 * Both are what lets Dubai open this screen at all: its orders are 3,074 rows
 * at this grain against a window of 1,000, and the request id repeats whenever
 * an order went to two suppliers.
 */
import { describe, expect, it } from "vitest";
import {
  LANES,
  OUTSIDE_THE_FIVE,
  STAGE_LABEL,
  boardTotals,
  laneCount,
  laneOf,
  laneOldest,
  rowKey,
  stageAlert,
  storeStageOf,
  type DirectPurchaseRow,
  type StageSummary,
} from "@/lib/direct-purchase-stage";

const row = (p: Partial<DirectPurchaseRow>): DirectPurchaseRow =>
  ({ id: "r1", request_no: "DUB-PR-1", parent_case_no: "", city: "dubai",
     requested_by: "", store_code: "", request_date: "", total_amount: 0,
     status: "APPROVED", receipt_url: "", new_vendor_flag: false,
     data_verified_at: null, data_verified_by: "", created_at: "", items: [],
     ...p }) as DirectPurchaseRow;

const summary: StageSummary = {
  PO_ISSUED:  { n: 598, unverified: 598, oldest_days_in_stage: 128, oldest_days_past_delivery: 154 },
  DELIVERED:  { n: 0,   unverified: 0,   oldest_days_in_stage: 0,   oldest_days_past_delivery: 0 },
  RECEIVED:   { n: 2021, unverified: 2021, oldest_days_in_stage: 127, oldest_days_past_delivery: 154 },
  DRAFT:      { n: 264, unverified: 264, oldest_days_in_stage: 123, oldest_days_past_delivery: 0 },
  REJECTED:   { n: 77,  unverified: 70,  oldest_days_in_stage: 123, oldest_days_past_delivery: 131 },
  CANCELLED:  { n: 34,  unverified: 34,  oldest_days_in_stage: 105, oldest_days_past_delivery: 0 },
};

describe("which row is which", () => {
  it("keys on the supplier row, because the request id repeats", () => {
    const a = row({ id: "r1", row_key: "r1:po-a" });
    const b = row({ id: "r1", row_key: "r1:po-b" });
    expect(rowKey(a)).not.toBe(rowKey(b));
  });

  it("falls back to the request id when the server sends no key", () => {
    expect(rowKey(row({ id: "r9" }))).toBe("r9");
  });
});

describe("lane chips", () => {
  it("counts every row at the lane's stages, not the ones fetched", () => {
    const incoming = LANES.find((l) => l.key === "PO_ISSUED")!;
    expect(laneCount(summary, incoming)).toBe(598);          // PO_ISSUED + DELIVERED
    const closed = LANES.find((l) => l.key === "CLOSED")!;
    expect(laneCount(summary, closed)).toBe(77 + 34 + 264);  // REJECTED + CANCELLED + DRAFT
  });

  it("reads the clock that lane is judged by", () => {
    // Incoming is late against its own delivery date; everything else by age.
    expect(laneOldest(summary, LANES.find((l) => l.key === "PO_ISSUED")!)).toBe(154);
    expect(laneOldest(summary, LANES.find((l) => l.key === "RECEIVED")!)).toBe(127);
  });

  it("shows nothing rather than a guess before the summary arrives", () => {
    expect(laneCount(null, LANES[0])).toBe(0);
    expect(laneOldest(null, LANES[0])).toBe(0);
  });

  it("treats a stage the server did not mention as empty", () => {
    const needsPo = LANES.find((l) => l.key === "APPROVED_NO_PO")!;
    expect(laneCount(summary, needsPo)).toBe(0);
  });

  it("covers every lane, so no stage count is unreachable", () => {
    const inALane = new Set(LANES.flatMap((l) => l.stages));
    for (const stage of Object.keys(summary)) expect(inALane.has(stage)).toBe(true);
  });
});

describe("the supplier's acknowledgement is not a receipt", () => {
  const acked = row({ stage: "SUPPLIER_ACKED", days_past_delivery_date: 3 });

  it("is a lane the kitchen is still waiting on, not a closed one", () => {
    expect(laneOf(acked)).toBe("PO_ISSUED");          // the Incoming lane
    expect(laneOf(row({ stage: "RECEIVED" }))).toBe("RECEIVED");
  });

  it("belongs to the store screen's five, so it is not an orphan stage", () => {
    expect(storeStageOf(acked)).toBe("PO_ISSUED");
  });

  it("is named for what happened", () => {
    expect(STAGE_LABEL.SUPPLIER_ACKED).toMatch(/supplier/i);
    expect(STAGE_LABEL.SUPPLIER_ACKED).not.toMatch(/^Received/);
  });

  it("is judged late against the delivery date, like the rest of Incoming", () => {
    expect(stageAlert(acked)).toMatch(/past the expected delivery date/);
    expect(stageAlert(row({ stage: "SUPPLIER_ACKED", days_past_delivery_date: null })))
      .toMatch(/No expected delivery date/);
  });

  it("every stage the server can return belongs to a lane and has a label", () => {
    // A stage in neither is a row nobody can reach. 121 orders were in that
    // state once, and the test that was meant to catch it compared the label
    // list against itself.
    const serverStages = [
      "DRAFT", "SUBMITTED", "IN_REVIEW", "APPROVED_NO_PO", "PO_ISSUED", "DELIVERED",
      "SUPPLIER_ACKED", "RECEIVED", "REJECTED", "CANCELLED", "PURCHASED_NO_RECEIPT",
      "RETURNED", "IN_PRODUCTION", "PURCHASED",
    ];
    const inALane = new Set(LANES.flatMap((l) => l.stages));
    for (const st of serverStages) {
      expect(STAGE_LABEL[st], `${st} has no label`).toBeTruthy();
      expect(inALane.has(st) || st in OUTSIDE_THE_FIVE || laneOf(row({ stage: st })) === "CLOSED",
        `${st} belongs to no lane`).toBe(true);
    }
  });
});

describe("the header counts the board", () => {
  it("adds up every stage, not the rows on screen", () => {
    // Dubai is 3,074 rows against a 1,000 window; the page's size is not a
    // fact about the work.
    expect(boardTotals(summary).total).toBe(598 + 0 + 2021 + 264 + 77 + 34);
    expect(boardTotals(summary).unverified).toBe(598 + 0 + 2021 + 264 + 70 + 34);
  });

  it("is zero before the summary arrives, not a guess", () => {
    expect(boardTotals(null)).toEqual({ total: 0, unverified: 0 });
  });
});
