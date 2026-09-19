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

/** One day somebody has off, with no roster attached — /api/admin/day-off-days. */
export type DayOffDay = {
  staff_name: string;
  work_date: string;
  request_type?: string;
  stage: "approved" | "asked";
};

/**
 * Roles that already say "not at work". The same set app/db_approved_day_off.py
 * refuses on, so the chip on a cell and the refusal on publish agree about what
 * counts as rostering somebody.
 */
const NOT_WORKING_ROLES = new Set([
  "DAY_OFF", "OFF", "REST", "RESTDAY", "REST_DAY",
  "VL", "SL", "EL", "LEAVE", "ABSENT", "AWOL", "SUSPENDED",
]);

/** Does this cell put the person at work? A Day Off cell, or a zero-length one,
 *  is the day off being applied — the opposite of a conflict. */
export function isWorkCell(
  role: unknown,
  startHour: number | null | undefined,
  endHour: number | null | undefined,
): boolean {
  const r = String(role ?? "").trim().toUpperCase().replace(/\s+/g, "_");
  if (NOT_WORKING_ROLES.has(r)) return false;
  return Number(endHour || 0) > Number(startHour || 0);
}

/** `${name}|${date}` → stage, approved winning over asked when both are filed.
 *  Names are lowercased, the way the backend matches them. */
export function dayOffIndex(days: DayOffDay[]): Map<string, "approved" | "asked"> {
  const m = new Map<string, "approved" | "asked">();
  for (const d of days || []) {
    const key = `${String(d.staff_name || "").trim().toLowerCase()}|${d.work_date}`;
    // Two live requests for one day: the answered one is the one that matters.
    if (d.stage === "approved" || !m.has(key)) m.set(key, d.stage);
  }
  return m;
}

export function dayOffKey(staffName: string, workDate: string): string {
  return `${String(staffName || "").trim().toLowerCase()}|${workDate}`;
}
