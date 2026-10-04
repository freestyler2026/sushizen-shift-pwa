/** The hires, and what became of each month's applicants.
 *
 *  The board answers "where is everybody now". That is a different question
 *  from "of the people who applied in September, how many did we hire", and
 *  the second one cannot be read off the first: a column holds whoever is
 *  sitting in it today, so every finished cohort reads zero.
 *
 *  Shapes mirror `GET /api/admin/hr/recruitment/outcomes` (app/hr_outcomes.py).
 */

export type HiredRow = {
  id: string;
  full_name: string;
  position_applied: string | null;
  position_group: string | null;
  assigned_branch: string | null;
  source: string | null;
  referrer_name: string | null;
  applied_date: string | null;
  /** The day they were hired -- or, when the log has no hired event for them,
   *  the day their row was last touched. `hired_date_is_recorded` says which,
   *  and the screen has to show the difference rather than print both as a
   *  hire date. */
  hired_on: string | null;
  hired_date_is_recorded: boolean;
  days_to_hire: number | null;
  on_roster: boolean;
  phone?: string | null;
  email?: string | null;
};

export type Cohort = {
  month: string;
  applied: number;
  hired: number;
  rejected: number;
  still_open: number;
  hire_rate: number;
  settled: number;
  complete: boolean;
};

export type SourceRow = {
  source: string;
  applied: number;
  hired: number;
  hire_rate: number;
};

export type Outcomes = {
  hired: HiredRow[];
  cohorts: Cohort[];
  sources: SourceRow[];
  /** When the event log starts. Everything that depends on it is blind before
   *  this date, and the screen says so instead of drawing a shape out of
   *  nothing. */
  events_from: string | null;
  days_to_hire: {
    counted: number;
    of: number;
    median: number | null;
    fastest: number | null;
    slowest: number | null;
  };
};

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-09" -> "Sep 2026". Anything else is returned as it came, because a
 *  month that cannot be parsed is still a real group of people. */
export function monthLabel(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ""));
  if (!m) return String(ym || "—");
  const i = Number(m[2]) - 1;
  if (i < 0 || i > 11) return ym;
  return `${MONTH_NAMES[i]} ${m[1]}`;
}

/** "2026-09-28" -> "28 Sep". The year is on the cohort row above, and a hire
 *  list that repeats it four times a line reads as noise. */
export function dayLabel(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return "—";
  const i = Number(m[2]) - 1;
  if (i < 0 || i > 11) return String(iso);
  return `${Number(m[3])} ${MONTH_NAMES[i]}`;
}

/** The hires nobody has put on the staff roster.
 *
 *  Being hired and being on the roster are two separate acts, and the second
 *  is the one that makes a shift, a payslip and a login exist. A hire missing
 *  from it is not a reporting defect -- it is somebody who was told they have
 *  the job and has no record anywhere that pays them.
 */
export function notOnRoster(rows: HiredRow[]): HiredRow[] {
  return rows.filter((r) => !r.on_roster);
}

/** How long it took, in one sentence, with how much of it is actually known.
 *
 *  Returns null when the log knows none of them -- a median over nothing is
 *  the kind of number that gets quoted later. */
export function daysToHireLine(s: Outcomes["days_to_hire"]): string | null {
  if (!s || !s.counted || s.median == null) return null;
  const range = s.fastest != null && s.slowest != null
    ? ` (fastest ${s.fastest}, slowest ${s.slowest})`
    : "";
  return `Median ${s.median} days from application to hire${range}`
    + ` — measured on the ${s.counted} of ${s.of} hires whose hire date is in the log`;
}

/** Applications and hires across every month returned, so the heading counts
 *  the same people the table below it lists. */
export function cohortTotals(cohorts: Cohort[]): {
  applied: number; hired: number; rejected: number; still_open: number; hire_rate: number;
} {
  const t = cohorts.reduce(
    (acc, c) => ({
      applied: acc.applied + c.applied,
      hired: acc.hired + c.hired,
      rejected: acc.rejected + c.rejected,
      still_open: acc.still_open + c.still_open,
    }),
    { applied: 0, hired: 0, rejected: 0, still_open: 0 });
  return { ...t, hire_rate: t.applied ? Math.round((1000 * t.hired) / t.applied) / 10 : 0 };
}
