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
  laneIsWork,
  laneOldest,
  laneSplit,
  openRemovals,
  removalReason,
  rowKey,
  stageAlert,
  storeStageOf,
  type DirectPurchaseRow,
  type ItemRemoval,
  type StageSummary,
} from "@/lib/direct-purchase-stage";

const row = (p: Partial<DirectPurchaseRow>): DirectPurchaseRow =>
  ({ id: "r1", request_no: "DUB-PR-1", parent_case_no: "", city: "dubai",
     requested_by: "", store_code: "", request_date: "", total_amount: 0,
     status: "APPROVED", receipt_url: "", new_vendor_flag: false,
     data_verified_at: null, data_verified_by: "", created_at: "", items: [],
     ...p }) as DirectPurchaseRow;

const summary: StageSummary = {
  PO_ISSUED:      { n: 599, recent: 63, unverified: 599, oldest_days_in_stage: 128, oldest_days_past_delivery: 154 },
  DELIVERED:      { n: 0,   recent: 0,  unverified: 0,   oldest_days_in_stage: 0,   oldest_days_past_delivery: 0 },
  SUPPLIER_ACKED: { n: 430, recent: 17, unverified: 430, oldest_days_in_stage: 120, oldest_days_past_delivery: 150 },
  RECEIVED:   { n: 2021, recent: 650, unverified: 2021, oldest_days_in_stage: 127, oldest_days_past_delivery: 154 },
  DRAFT:      { n: 264, recent: 6,  unverified: 264, oldest_days_in_stage: 123, oldest_days_past_delivery: 0 },
  REJECTED:   { n: 77,  recent: 1,  unverified: 70,  oldest_days_in_stage: 123, oldest_days_past_delivery: 131 },
  CANCELLED:  { n: 34,  recent: 24, unverified: 34,  oldest_days_in_stage: 105, oldest_days_past_delivery: 0 },
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
    expect(laneCount(summary, incoming)).toBe(599 + 0 + 430);   // PO_ISSUED + DELIVERED + SUPPLIER_ACKED
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
    expect(boardTotals(summary).total).toBe(599 + 0 + 430 + 2021 + 264 + 77 + 34);
    expect(boardTotals(summary).unverified).toBe(599 + 0 + 430 + 2021 + 264 + 70 + 34);
  });

  it("is zero before the summary arrives, not a guess", () => {
    expect(boardTotals(null)).toEqual({ total: 0, unverified: 0 });
  });
});

describe("a line taken off an order", () => {
  const kept = (p: Partial<ItemRemoval>): ItemRemoval =>
    ({ id: "x", request_id: "r1", item_name: "1oz Cup", qty: 1, unit: "box",
       unit_price: 1820, line_total: 1820, ...p }) as ItemRemoval;

  it("is open until somebody acknowledges it", () => {
    const list = [kept({ id: "a" }), kept({ id: "b", ack_status: "acknowledged" })];
    expect(openRemovals(list).map((r) => r.id)).toEqual(["a"]);
  });

  it("treats a missing status as open, not as seen", () => {
    expect(openRemovals([kept({ ack_status: null })])).toHaveLength(1);
  });

  it("reads the reason in the words the screen shows", () => {
    const labels = { out_of_stock: "Supplier cannot deliver it", other: "Something else" };
    expect(removalReason(kept({ reason_code: "out_of_stock" }), labels))
      .toBe("Supplier cannot deliver it");
    expect(removalReason(kept({ reason_code: "other", reason_note: "shop shut" }), labels))
      .toBe("Something else — shop shut");
  });

  it("does not call a record from before the reason existed 'no reason given'", () => {
    // The backfilled rows had nowhere to put one. Saying the remover gave no
    // reason would be an accusation about somebody nothing even names.
    expect(removalReason(kept({ reconstructed: true }), {}))
      .toBe("Recorded before a reason was asked for");
    expect(removalReason(kept({}), {})).toBe("No reason given");
  });

  it("falls back to the stored code when the screen has no wording for it", () => {
    expect(removalReason(kept({ reason_code: "brand_new" }), {})).toBe("brand_new");
  });
});

describe("today's work and the pile behind it", () => {
  const incoming = LANES.find((l) => l.key === "PO_ISSUED")!;

  it("splits a lane into what is actionable now and what is backlog", () => {
    // Dubai: 1,029 orders in Incoming, 80 of them inside the threshold.
    expect(laneSplit(summary, incoming)).toEqual({ recent: 63 + 17, older: 599 + 430 - 80 });
  });

  it("never reports a negative pile when the counts disagree", () => {
    const odd: StageSummary = {
      PO_ISSUED: { n: 2, recent: 9, unverified: 0, oldest_days_in_stage: 0, oldest_days_past_delivery: 0 },
    };
    expect(laneSplit(odd, incoming).older).toBe(0);
  });

  it("is zero on both sides before the summary arrives", () => {
    expect(laneSplit(null, incoming)).toEqual({ recent: 0, older: 0 });
  });

  it("applies only where age means something — a closed order is not late", () => {
    expect(laneIsWork(incoming)).toBe(true);
    expect(laneIsWork(LANES.find((l) => l.key === "RECEIVED")!)).toBe(false);
    expect(laneIsWork(LANES.find((l) => l.key === "CLOSED")!)).toBe(false);
    expect(laneIsWork(LANES.find((l) => l.key === "NO_RECEIPT")!)).toBe(false);
  });
});
