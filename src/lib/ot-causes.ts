/**
 * Why an overtime request says it happened.
 *
 * Mirrors OT_CAUSES in app/db.py, which validates what is posted and silently
 * drops anything it does not know. That last part is why this lives in one
 * file: a code added to a picker and not to the server becomes a chip you can
 * press that records nothing, and a code the server keeps but no screen names
 * becomes a row that reads as blank. There were three copies of this list —
 * the staff picker, the admin picker and the admin chip labels — before
 * 2026-09-30.
 *
 * Two labels per code on purpose. `prompt` is the sentence somebody picks from
 * while filing, `label` is the word the same cause wears in a dense list.
 */
export type OtCause = {
  code: string;
  /** Long form, for the person choosing. */
  prompt: string;
  /** Short form, for a chip in a table. */
  label: string;
};

export const OT_CAUSES: OtCause[] = [
  { code: "orders",          prompt: "More orders than expected",              label: "More orders" },
  { code: "short_staffed",   prompt: "Someone was absent or we were short",    label: "Short-staffed" },
  { code: "equipment",       prompt: "Equipment or system problem",            label: "Equipment" },
  { code: "delivery",        prompt: "A delivery, stock count or transfer",    label: "Delivery / stock" },
  { code: "closing",         prompt: "Closing or cleaning ran long",           label: "Closing ran long" },
  { code: "deadline",        prompt: "A deadline — payroll, orders, reports",  label: "A deadline" },
  { code: "prep_unfinished", prompt: "The prep was not finished in time",      label: "Prep not finished" },
  { code: "carry_over",      prompt: "Finishing what the earlier shift left",  label: "Earlier shift's work" },
];

/** code → short label, for lists. */
export const OT_CAUSE_LABELS: Record<string, string> =
  Object.fromEntries(OT_CAUSES.map((c) => [c.code, c.label]));

/**
 * The two that point at how the shift was run rather than at what happened to
 * it. Marked so the pattern is visible; it decides nothing by itself.
 */
export const AVOIDABLE_CAUSES = new Set(["prep_unfinished", "carry_over"]);
