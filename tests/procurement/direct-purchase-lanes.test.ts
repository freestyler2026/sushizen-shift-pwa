import { describe, it, expect } from "vitest";
import {
  LANES, STALE_DAYS, laneOf, stageAlert, stageOf,
  type DirectPurchaseRow,
} from "@/lib/direct-purchase-stage";

/**
 * Which lane a CK->Supplier order lands in, and when it gets called out.
 *
 * The real functions are imported rather than mirrored here: the bug this
 * whole change exists to fix is the same fact recorded twice and drifting
 * (receiving_status and receipt_confirmed_at disagree on 263 live orders), so a
 * second copy of the lane rules in a test file would be the same mistake.
 *
 * They live in src/lib rather than in the page because a Next.js page may only
 * export a fixed set of fields; exporting them from page.tsx builds clean under
 * tsc and then fails next build.
 *
 * The stage itself is decided in SQL (PROC_STAGE_SQL) and covered by the
 * backend's tests/test_procurement_pipeline.py; what is checked here is what
 * the screen does with it.
 */

const row = (o: Partial<DirectPurchaseRow> = {}): DirectPurchaseRow => ({
  id: "r1", request_no: "MAN-PR-1", parent_case_no: "", city: "manila",
  requested_by: "Mariano Espenida Jr.", store_code: "CK", request_date: "2026-09-20",
  total_amount: 1000, status: "APPROVED", receipt_url: "", new_vendor_flag: false,
  data_verified_at: null, data_verified_by: "", created_at: "2026-09-20T00:00:00Z",
  items: [], ...o,
});

describe("lanes", () => {
  it("puts each stage in exactly one lane", () => {
    const stages = ["DRAFT", "SUBMITTED", "IN_REVIEW", "APPROVED_NO_PO",
                    "PO_ISSUED", "DELIVERED", "RECEIVED", "REJECTED", "CANCELLED"];
    for (const stage of stages) {
      const hits = LANES.filter(l => l.stages.includes(stage));
      expect(hits.length, `${stage} is in ${hits.length} lanes`).toBe(1);
    }
  });

  it("routes an unknown stage somewhere rather than dropping the row", () => {
    // A row that belongs to no lane is a row that cannot be reached from the
    // screen at all -- the same failure as limit:200 hiding the oldest orders.
    expect(laneOf(row({ stage: "IN_PRODUCTION" }))).toBeTruthy();
    expect(LANES.some(l => l.key === laneOf(row({ stage: "IN_PRODUCTION" })))).toBe(true);
  });

  it("keeps approved-without-a-PO in its own lane, not with in-review", () => {
    // Yusuke listed it separately because it is a different action: raise a PO,
    // not approve something.
    expect(laneOf(row({ stage: "APPROVED_NO_PO" }))).toBe("APPROVED_NO_PO");
    expect(laneOf(row({ stage: "IN_REVIEW", status: "IN_REVIEW" }))).toBe("IN_REVIEW");
  });

  it("treats delivered as still incoming, because the kitchen has not taken it", () => {
    expect(laneOf(row({ stage: "DELIVERED" }))).toBe("PO_ISSUED");
    expect(laneOf(row({ stage: "PO_ISSUED" }))).toBe("PO_ISSUED");
  });

  it("every lane states its rule on screen", () => {
    // Pattern 9: an unexplained threshold is an untrusted one.
    for (const l of LANES) expect(l.hint.length).toBeGreaterThan(20);
  });
});

describe("what gets flagged", () => {
  it("flags an order sitting in review past the stated threshold", () => {
    expect(stageAlert(row({ stage: "IN_REVIEW", days_in_stage: STALE_DAYS.IN_REVIEW + 1 }))).toContain("days");
    expect(stageAlert(row({ stage: "IN_REVIEW", days_in_stage: STALE_DAYS.IN_REVIEW }))).toBe("");
  });

  it("judges an ordered item against its delivery date, not its age", () => {
    // A PO placed 30 days ago for a delivery due next week is not late. Using
    // age here would flag every long-lead order.
    expect(stageAlert(row({ stage: "PO_ISSUED", days_in_stage: 30, days_past_delivery_date: -5 }))).toBe("");
    expect(stageAlert(row({ stage: "PO_ISSUED", days_in_stage: 1, days_past_delivery_date: 3 }))).toContain("past");
  });

  it("says so when a PO carries no expected date at all", () => {
    // Silence would read as "on time". 201 of 770 direct purchases have no PO
    // and some POs carry no date, so this is the common case, not an edge one.
    expect(stageAlert(row({ stage: "PO_ISSUED", days_past_delivery_date: null }))).toContain("No expected delivery date");
  });

  it("never flags a received order", () => {
    // 441 orders are received. Flagging any of them would bury the 58 that are
    // actually open -- the exact shape of the overdue queue this replaces,
    // where 264 of 389 rows were noise.
    expect(stageAlert(row({ stage: "RECEIVED", days_in_stage: 400 }))).toBe("");
    expect(stageAlert(row({ stage: "REJECTED", days_in_stage: 400 }))).toBe("");
    expect(stageAlert(row({ stage: "RECEIVED", days_past_delivery_date: 99 }))).toBe("");
  });

  it("does not flag a short delivery as undelivered", () => {
    // has_shortage keeps a PO on the overdue list for chasing the supplier,
    // which is right there and wrong here: 67 POs are received-and-short and
    // would otherwise come back as work for the kitchen.
    expect(stageAlert(row({ stage: "RECEIVED", has_shortage: true, days_past_delivery_date: 40 }))).toBe("");
  });
});

describe("stageOf", () => {
  it("falls back to the request status when the API has not sent a stage", () => {
    // An older cached response, or a deploy in flight.
    expect(stageOf(row({ stage: null, status: "APPROVED" }))).toBe("APPROVED");
    expect(stageOf(row({ stage: "PO_ISSUED", status: "APPROVED" }))).toBe("PO_ISSUED");
  });
});
