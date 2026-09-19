/**
 * Somebody rostered on a day they have already been given off.
 *
 * The backend refuses the write (409) and hands back this list; both the Excel
 * import preview and the Manual Shift publish show it. The sentence is the same
 * one describe_conflicts() writes in app/db_approved_day_off.py — the person
 * reading the screen and the person reading the error should see one wording.
 */
export type DayOffConflict = {
  staff_name: string;
  work_date: string;
  request_type?: string;
  request_id?: string;
  approved_by?: string;
  role?: string;
  branch_code?: string | null;
  start_hour?: number | null;
  end_hour?: number | null;
};

/** Hours counted from midnight of the work date, so 24.5 is 00:30 the next day. */
export function hhmm(hour: number | null | undefined): string {
  const mins = Math.round(Number(hour || 0) * 60);
  const h = Math.floor(mins / 60) % 24;
  const m = ((mins % 60) + 60) % 60;
  return `${String((h + 24) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function describeDayOffConflict(c: DayOffConflict): string {
  const kind = String(c.request_type || "day off").replace(/_/g, " ");
  const at = c.branch_code ? ` at ${c.branch_code}` : "";
  return `${c.staff_name} — ${c.work_date} is an approved ${kind}, but this puts them on ${hhmm(
    c.start_hour,
  )}-${hhmm(c.end_hour)}${at}`;
}

/** "3 people" / "1 person" — for the heading above the list. */
export function countDayOffConflicts(conflicts: DayOffConflict[]): string {
  const people = new Set(conflicts.map((c) => c.staff_name.toLowerCase())).size;
  const days = conflicts.length;
  const p = `${people} ${people === 1 ? "person" : "people"}`;
  const d = `${days} ${days === 1 ? "day" : "days"}`;
  return people === days ? `${p}, ${d}` : `${p} across ${d}`;
}
