/** What a receipt was spent on.
 *
 *  One list. The staff form and the admin filter each had their own copy, so
 *  adding a department to the form would have made receipts filed under it
 *  unreachable from the screen that reviews them — the filter would simply not
 *  offer it (lesson 95).
 *
 *  These are functions, not job titles: a receipt is filed against the work it
 *  belongs to, and the person who bought it is already recorded as the
 *  submitter.
 */
export const RECEIPT_DEPARTMENTS = [
  "Kitchen",
  "Operations",
  "Admin",
  "HR",
  "Maintenance",
  "Logistics",
  "Other",
] as const;
