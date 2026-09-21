/** What a decision about a candidate is allowed to say.
 *
 *  The server requires a reason for hold, pass and lapse, and refuses a reason
 *  that belongs to the other kind. Two screens record this decision — the board
 *  and the interview list — and the rules lived in only one of them, so the
 *  other sent no reason at all and every hold and every pass came back 400
 *  (2026-09-16, reported twice from Manila).
 */

/** Reasons that describe running out of time rather than judging anybody. */
export const LAPSE_REASONS = new Set([
  "unreachable", "lapsed", "no_show", "withdrew", "other",
]);

/** ...and the two that can ONLY mean that. A pass cannot borrow them: they say
 *  nobody assessed the candidate, which is not a verdict on the candidate. */
export const LAPSE_ONLY = new Set(["unreachable", "lapsed"]);

export type OutcomeKey = "proceed" | "hold" | "pass" | "lapse";

/** Does the server demand a reason for this outcome? */
export function reasonRequired(outcome: string): boolean {
  return outcome === "hold" || outcome === "pass" || outcome === "lapse";
}

/** The reasons that fit what was chosen. Offering all of them and then refusing
 *  the save is how people learn to distrust the chips. */
export function reasonsFor<T extends { key: string }>(
  all: T[], outcome: string,
): T[] {
  return all.filter((r) =>
    outcome === "lapse" ? LAPSE_REASONS.has(r.key) : !LAPSE_ONLY.has(r.key));
}

/** What a stored reason key says in words.
 *
 *  The keys are written by the server and read by people. `no_show` sat on two
 *  applicants for a week and appeared on no screen: the column existed, the
 *  value was correct, and nothing rendered it -- so "did they turn up?" had no
 *  answer anywhere even though it had been recorded.
 */
const REASON_LABELS: Record<string, string> = {
  no_show: "No-show",
  unreachable: "Could not reach them",
  lapsed: "We let it lapse",
  withdrew: "They withdrew",
  experience_short: "Not enough experience",
  salary_gap: "Pay expectations",
  better_candidate: "Took someone else",
  availability: "Availability",
  not_answered: "Never answered",
  other: "Other",
};

export function reasonLabel(key?: string | null): string {
  const k = String(key ?? "").trim();
  if (!k) return "";
  return REASON_LABELS[k] || k.replace(/_/g, " ");
}

/** A no-show closes the applicant as rejected like any other close, but it is
 *  not a verdict on them. Worth marking differently wherever it is shown. */
export function isNoShow(key?: string | null): boolean {
  return String(key ?? "").trim() === "no_show";
}

/** What a stored evaluation says, in the words the buttons use.
 *
 *  The database keeps the decision as a `recommendation`, which is not what
 *  anybody pressed: "Not for this role" is stored as `no_hire`, and
 *  "Did not turn up" as `not_assessed` with the reason `no_show`. Showing
 *  somebody their own past decision in the column's vocabulary makes them
 *  check whether it is the same thing they chose.
 *
 *  `reject` is not one of the four the code writes today -- it is older, and
 *  four rows still carry it. An unmapped value falling through as a raw key
 *  is how a real recorded outcome comes back looking like a bug.
 */
const OUTCOME_LABELS: Record<string, string> = {
  hire: "Move to offer",
  consider: "Hold — decide later",
  no_hire: "Not for this role",
  reject: "Not for this role",
  not_assessed: "Closed without a decision",
};

export function outcomeLabel(recommendation?: string | null,
                             reason?: string | null): string {
  const k = String(recommendation ?? "").trim();
  // A lapse is the only one whose reason changes what happened: everything
  // else in that bucket is "we ran out of time", and this one is "they did
  // not come", which is the distinction the no-show mark exists for.
  if (k === "not_assessed" && isNoShow(reason)) return "Did not turn up";
  if (!k) return "";
  return OUTCOME_LABELS[k] || k.replace(/_/g, " ");
}
