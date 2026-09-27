/**
 * Where a CK->Supplier order stands, and when to call it out.
 *
 * This lives in lib, not in the page, for two reasons. A Next.js App Router
 * page may only export a fixed set of fields, so exporting these helpers from
 * page.tsx fails `next build` with "not a valid Page export field" -- and
 * `tsc --noEmit` passes, so the only place that shows up is the build. And the
 * tests need the real functions: a second copy of these rules in a test file
 * would be the same defect this whole change exists to fix, where the same fact
 * kept in two places drifted until receiving_status and receipt_confirmed_at
 * disagreed on 263 live orders.
 *
 * The stage itself is decided in SQL (PROC_STAGE_SQL in app/db.py) so that the
 * list, the lane counts and any alert sweep read one expression. What is here
 * is only what the screen does with it.
 */

export type DirectPurchaseItem = {
  id: string;
  item_name: string;
  category: string;
  qty: number;
  unit: string;
  unit_price: number;
  line_total: number;
  vendor_name: string;
};

export type DirectPurchaseRow = {
  id: string;
  request_no: string;
  parent_case_no: string;
  city: string;
  requested_by: string;
  store_code: string;
  request_date: string;
  total_amount: number;
  status: string;
  receipt_url: string;
  new_vendor_flag: boolean;
  data_verified_at: string | null;
  data_verified_by: string;
  created_at: string;
  items: DirectPurchaseItem[];
  // The pipeline. All of this was already stored and already accurate; the
  // Direct Purchase screen just never asked for it, which is why "has a PO been
  // issued for this order?" had to be answered by copying an ID into the PO
  // page.
  po_status?: string | null;
  receiving_status?: string | null;
  po_no?: string | null;
  po_id?: string | null;
  po_count?: number;
  delivery_date?: string | null;
  delivery_date_original?: string | null;
  delivery_date_revised_at?: string | null;
  delivery_date_revised_by?: string | null;
  delivery_date_revision_reason?: string | null;
  receipt_confirmed_at?: string | null;
  delivered_confirmed_at?: string | null;
  delivered_confirmed_by?: string | null;
  has_shortage?: boolean | null;
  stage?: string | null;
  days_in_stage?: number | null;
  days_past_delivery_date?: number | null;
};

/**
 * How long a stage may sit before the row is called out. Shown on screen
 * (pattern 9: a threshold nobody can see is a threshold nobody trusts) and
 * deliberately different per stage -- review is meant to happen next day, while
 * a PO that has not been raised a week after approval is a different problem.
 */
export const STALE_DAYS: Record<string, number> = {
  IN_REVIEW: 2,
  APPROVED_NO_PO: 3,
  PO_ISSUED: 0, // judged against its own delivery date, not a fixed age
};

/**
 * The five stages the kitchen asked for, plus the one Yusuke named separately
 * ("approved but no PO yet") and the terminal states.
 */
export const STAGE_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  IN_REVIEW: "In Review",
  APPROVED_NO_PO: "Approved · no PO",
  PO_ISSUED: "PO issued · awaiting delivery",
  DELIVERED: "Dispatch confirmed · awaiting kitchen",
  RECEIVED: "Received",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  // PROC_STAGE_SQL falls through to r.status for anything its CASE does not
  // name, so these are stages too. Measured on production 2026-09-26:
  // Manila RETURNED 2 / IN_PRODUCTION 27 / PURCHASED 3, Dubai RETURNED 19.
  // They were missing here, which made 121 orders belong to no group at all
  // -- and the test that was supposed to catch that compared this list
  // against itself instead of against the data.
  // Bought, and the receipt was never recorded. Not RECEIVED: saying so would
  // need a receipt date nobody has. 165 Manila direct purchases from June to
  // August are in this state, confirmed as real purchases on 2026-09-28.
  PURCHASED_NO_RECEIPT: "Purchased · receipt not recorded",
  RETURNED: "Returned to requester",
  IN_PRODUCTION: "In production (CK)",
  PURCHASED: "Purchased",
};

export type Lane = { key: string; label: string; stages: string[]; hint: string };

/**
 * In Review first and selected by default: it is the only lane where somebody
 * is waiting on a decision from this screen. The rest stay reachable -- a stage
 * that belongs to no lane is a row nobody can get to, which is how limit:200
 * hid every order older than a few weeks.
 */
export const LANES: Lane[] = [
  { key: "IN_REVIEW", label: "In Review", stages: ["IN_REVIEW", "SUBMITTED"],
    hint: "Waiting for approval. Flagged after 2 days." },
  { key: "APPROVED_NO_PO", label: "Needs PO", stages: ["APPROVED_NO_PO"],
    hint: "Approved, but no purchase order has been raised yet. Flagged after 3 days." },
  { key: "PO_ISSUED", label: "Incoming", stages: ["PO_ISSUED", "DELIVERED"],
    hint: "Ordered and not yet received by the kitchen. Flagged once the expected delivery date has passed." },
  { key: "RECEIVED", label: "Received", stages: ["RECEIVED"],
    hint: "Closed — the kitchen confirmed receipt." },
  { key: "CLOSED", label: "Rejected / Draft", stages: ["REJECTED", "CANCELLED", "DRAFT"],
    hint: "Not going ahead, or never submitted." },
  // Its own lane, not folded into the one above: these were bought. Putting
  // them under "Rejected / Draft" would say the purchase never happened.
  { key: "NO_RECEIPT", label: "No receipt recorded", stages: ["PURCHASED_NO_RECEIPT"],
    hint: "Purchased, but nobody recorded the receipt here. Closed — kept so the order is still findable." },
];

/**
 * The Store Procurement channel's five, which are Yusuke's (4) verbatim:
 * Request -> Approval -> PO Issued -> Delivered -> Received.
 *
 * Deliberately NOT the same grouping as LANES above, and deliberately from the
 * same stage vocabulary. The back office needs PO Issued and Delivered apart —
 * "the supplier has not sent it" and "the supplier sent it but the kitchen has
 * not received it" are different people's problems — while the Direct Purchase
 * screen merges them into Incoming, because there the question is only
 * "has it arrived". One set of stages, two readings of it; a second set of
 * stage names is how two screens start disagreeing about the same order.
 */
export const STORE_STAGES: Lane[] = [
  { key: "REQUEST", label: "Request", stages: ["DRAFT", "SUBMITTED"],
    hint: "Raised, not yet submitted for approval." },
  { key: "APPROVAL", label: "Approval", stages: ["IN_REVIEW"],
    hint: "Waiting for approval." },
  { key: "PO_ISSUED", label: "PO Issued", stages: ["APPROVED_NO_PO", "PO_ISSUED"],
    hint: "Approved and ordered, with no dispatch confirmed yet — this is where an order stuck at the supplier sits." },
  { key: "DELIVERED", label: "Dispatch Confirmed", stages: ["DELIVERED"],
    hint: "Back office has confirmed the supplier arranged the delivery; the kitchen has not received it yet." },
  { key: "RECEIVED", label: "Received", stages: ["RECEIVED"],
    hint: "The kitchen confirmed receipt." },
];

/**
 * Stages deliberately left outside the five, with the reason. Anything not
 * here and not in STORE_STAGES is an omission, not a decision, and the screen
 * says how many orders it affects rather than quietly dropping them.
 */
export const OUTSIDE_THE_FIVE: Record<string, string> = {
  PURCHASED_NO_RECEIPT: "bought, with no receipt recorded here — closed, and outside the five",
  REJECTED: "under the cards below",
  CANCELLED: "under the cards below",
  RETURNED: "under the cards below, waiting on the requester",
  IN_PRODUCTION: "the kitchen is making it, not a supplier order",
  PURCHASED: "bought directly, no delivery to track",
};

/** Stage keys whose chip fetches from the server rather than filtering the page. */
export const SERVER_FETCHED_STAGES = new Set(["REQUEST", "APPROVAL"]);

/**
 * Stage words the Store Procurement row already prints as its status chip
 * (DRAFT / RETURNED / REJECTED / IN REVIEW). A stage badge repeating one of
 * these says nothing and collides with the KPI labels above.
 *
 * Everything else earns a badge — including IN_PRODUCTION, PURCHASED,
 * CANCELLED and the four stages "APPROVED" hides. The chip has no branch for
 * those, so without the badge 31 orders showed no state at all.
 */
const STATUS_CHIP_ALREADY_SHOWS = new Set([
  "DRAFT", "SUBMITTED", "IN_REVIEW", "RETURNED", "REJECTED",
]);

/** Does the stage say something the row's own status chip does not? */
export function stageAddsInformation(stage: string): boolean {
  return !STATUS_CHIP_ALREADY_SHOWS.has(stage);
}

/** Which of the five a row belongs to, or "" for anything outside them. */
export function storeStageOf(row: DirectPurchaseRow): string {
  const st = stageOf(row);
  const lane = STORE_STAGES.find(l => l.stages.includes(st));
  return lane ? lane.key : "";
}

export function stageOf(row: DirectPurchaseRow): string {
  return String(row.stage || (row.status || "").toUpperCase() || "UNKNOWN");
}

export function laneOf(row: DirectPurchaseRow): string {
  const st = stageOf(row);
  const lane = LANES.find(l => l.stages.includes(st));
  return lane ? lane.key : "CLOSED";
}

/** Why this row is overdue for its stage, or "" if it is not. */
export function stageAlert(row: DirectPurchaseRow): string {
  const st = stageOf(row);
  const days = Number(row.days_in_stage || 0);
  if (st === "PO_ISSUED" || st === "DELIVERED") {
    // Against its own delivery date, not its age: a PO placed 30 days ago for a
    // delivery due next week is not late, and using age would flag every
    // long-lead order.
    const past = row.days_past_delivery_date;
    if (past === null || past === undefined) return "No expected delivery date on the PO";
    if (Number(past) > 0) return `${past} day${Number(past) === 1 ? "" : "s"} past the expected delivery date`;
    return "";
  }
  const limit = STALE_DAYS[st];
  if (limit && days > limit) return `${days} days in ${STAGE_LABEL[st] || st}`;
  return "";
}

/** Badge colour role. Kept as data so no JSX lives in lib. */
export function stageTone(row: DirectPurchaseRow): "success" | "error" | "warn" | "info" {
  const st = stageOf(row);
  if (st === "RECEIVED") return "success";
  if (st === "REJECTED" || st === "CANCELLED") return "error";
  if (st === "APPROVED_NO_PO" || st === "IN_REVIEW") return "warn";
  return "info";
}
