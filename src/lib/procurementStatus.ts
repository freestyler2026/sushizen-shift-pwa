// Pure helpers for Store Procurement request bucketing & visibility.
// Extracted so the logic has a single source of truth and is unit-testable.

export type ProcurementStatusRow = {
  status?: string | null;
  receiving_status?: string | null;
};

const TERMINAL_STATUSES = ["CLOSED", "RECEIVED", "CANCELLED", "REJECTED", "PURCHASED"];
const DONE_RECEIVING_STATUSES = ["CONFIRMED", "CLAIM_REVIEW"];

/**
 * "Active" = the request still needs store attention. Excludes terminal statuses
 * (incl. REJECTED — surfaced separately) and requests whose receiving/claim is done.
 */
export function isActiveRequest(row: ProcurementStatusRow): boolean {
  const s = String(row.status || "").toUpperCase();
  const rs = String(row.receiving_status || "").toUpperCase();
  if (TERMINAL_STATUSES.includes(s)) return false;
  if (DONE_RECEIVING_STATUSES.includes(rs)) return false;
  return true;
}

export function isRejectedRequest(row: ProcurementStatusRow): boolean {
  return String(row.status || "").toUpperCase() === "REJECTED";
}

/**
 * Whether a row matches a KPI status-filter bucket. "IN_REVIEW" also matches the
 * legacy "SUBMITTED" status (same UI bucket).
 */
export function matchesStatusFilter(row: ProcurementStatusRow, filter: string): boolean {
  const s = String(row.status || "").toUpperCase();
  const f = String(filter || "").toUpperCase();
  if (f === "IN_REVIEW") return s === "IN_REVIEW" || s === "SUBMITTED";
  return s === f;
}

/**
 * Rows shown in the Requests list, given the active set, the rejected set, and the
 * selected KPI filter (null = no filter). REJECTED is drawn from its own bucket
 * because it is excluded from the active set.
 */
export function selectDisplayedRequests<T extends ProcurementStatusRow>(
  activeRows: T[],
  rejectedRows: T[],
  statusFilter: string | null,
): T[] {
  if (statusFilter === "REJECTED") return rejectedRows;
  if (!statusFilter) return activeRows;
  return activeRows.filter((row) => matchesStatusFilter(row, statusFilter));
}

/** CK Dispatch is a Manila-only facility — never shown for Dubai. */
export function isCkDispatchVisible(city: string | null | undefined): boolean {
  return String(city || "").toLowerCase() !== "dubai";
}

// ── Receiving (Step 2) ────────────────────────────────────────────────────────

export type ReceivingStatusRow = { status?: string | null; request_id?: string | null };

/**
 * Receiving records that belong to a specific request. `rows` may briefly hold a
 * global (unfiltered) load, so the receiving UI must scope to the selected request.
 */
export function receivingsForRequest<T extends { request_id?: string | null }>(
  rows: T[],
  requestId: string,
): T[] {
  return rows.filter((r) => String(r.request_id ?? "") === String(requestId ?? ""));
}

export type ReceivingStep = "confirmed" | "review" | "form";

/**
 * Which Step-2 panel to show, based ONLY on the selected request's receiving
 * records: all confirmed → "confirmed"; has a draft → "review" (review qty +
 * confirm); otherwise → "form" (enter delivered quantities). `showNewForm` forces
 * the entry form (record an additional delivery).
 */
export function receivingStepState(
  requestReceivings: ReceivingStatusRow[],
  showNewForm: boolean,
): ReceivingStep {
  if (showNewForm) return "form";
  if (requestReceivings.length === 0) return "form";
  const norm = (s: unknown) => String(s || "").toUpperCase();
  if (requestReceivings.every((r) => norm(r.status) === "CONFIRMED")) return "confirmed";
  if (requestReceivings.some((r) => norm(r.status) === "DRAFT")) return "review";
  return "form";
}
