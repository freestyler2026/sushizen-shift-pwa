// Late / absent / undertime on a Manila payslip, totalled on one line (Peter
// Villafuerte, HR, 2026-11-17; owner 2026-11-18). HR takes this figure off the
// basic for the 13th month, the way the old payslip's "Undertime/Late/Absent"
// line was used.
//
// These are the engine's unpaid-time codes -- _UNPAID_TIME_CODES in
// sushizen_shift_app_clean/app/manila_payroll_engine.py, the same set its 13th
// month accrual and the 13th Month report take off the basic. Unpaid leave and
// unpaid holidays are in it on the owner's decision (2026-11-18). Change the two
// together or the payslip and the report stop agreeing.
export const LATE_ABSENT_CODES: ReadonlySet<string> = new Set([
  "ABSENT_DEDUCTION",
  "LATE_DEDUCTION",
  "UNDERTIME_DEDUCTION",
  "UNPAID_LEAVE_DEDUCTION",
  "SPECIAL_HOLIDAY_NWNP",
  "REGULAR_HOLIDAY_UNQUALIFIED",
]);

export const LATE_ABSENT_LABEL = "Late / Absent / Undertime";

/** Splits a payslip's deduction lines into the late / absent group and the rest.
 *  `total` is positive (amounts are stored negative); null when any line in the
 *  group is masked, so a hidden figure is never shown as a partial sum. */
export function splitLateAbsent<T extends { item_code: string; amount: number | null }>(deductions: T[]) {
  const lines = deductions.filter((d) => LATE_ABSENT_CODES.has(d.item_code));
  const other = deductions.filter((d) => !LATE_ABSENT_CODES.has(d.item_code));
  const masked = lines.some((d) => d.amount == null);
  const total = masked ? null : lines.reduce((s, d) => s + Math.abs(d.amount ?? 0), 0);
  return { lines, other, total };
}
