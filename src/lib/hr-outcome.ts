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
