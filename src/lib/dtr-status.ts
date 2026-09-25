/** What a Dubai DTR row is, in words.
 *
 *  One definition, because there were two. The screen's Status column read the
 *  annual-leave flag first, and the CSV export did not read it at all: it
 *  checked absence, then fell through to the day type. So 140 approved paid
 *  leave days in the 2026-09 period — twenty-seven of them consecutive for one
 *  person — came out of the export as "Ordinary", with no clock-in and no
 *  hours. On screen they said "Annual Leave". Anybody reading the exported DTR
 *  afterwards, an accountant or an auditor or the next person to run payroll,
 *  had no way to tell approved leave from an unexplained absence.
 *
 *  Leave and absence are facts about the day that the day type cannot carry:
 *  `day_type` only ever holds ordinary/rest/holiday, and Dubai stores leave in
 *  a separate flag. So anything rendering a row has to consult both, and the
 *  order they are consulted in is the thing that was inconsistent. It is
 *  written once here.
 */
export type DtrRowFacts = {
  day_type: string;
  is_worked?: boolean;
  is_scheduled_rest_day?: boolean;
  absent_without_pay?: boolean;
  annual_leave_flag?: boolean;
  absence_type?: string | null;
  approval_status?: string | null;
};

export const DAY_TYPE_LABELS: Record<string, string> = {
  ordinary_day: "Ordinary",
  rest_day: "Rest Day",
  public_holiday: "Public Holiday",
  public_holiday_and_rest_day: "Holiday + Rest",
};

/** The day type, with the two facts that override it.
 *
 *  For the export's Type column. Paid leave first, then unpaid absence, then
 *  what kind of day it was -- the same order the screen uses, so the two can
 *  no longer drift.
 */
export function dtrDayTypeLabel(row: DtrRowFacts): string {
  if (row.annual_leave_flag) return "Annual Leave";
  if (row.absent_without_pay) return "AWP";
  return DAY_TYPE_LABELS[row.day_type] ?? row.day_type;
}

/** The fuller status for the screen, which has more states to show than the
 *  export does. Shares the opening two rules above. */
export function dtrRowStatus(row: DtrRowFacts): string {
  if (row.annual_leave_flag) return "Annual Leave";
  if (row.absent_without_pay) return "Absent (AWP)";
  if (row.absence_type) return `Absent (${row.absence_type})`;
  if (row.approval_status === "no_clockin") return "No Clock-in";
  if (row.is_scheduled_rest_day) return "Day Off";
  return row.is_worked ? "Worked" : (DAY_TYPE_LABELS[row.day_type] ?? row.day_type);
}
