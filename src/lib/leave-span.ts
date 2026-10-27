/**
 * Which days a day-off or leave request covers: consecutive calendar days from
 * the first, rounding a half day up. The same rule as app/leave_span.py, so the
 * screen and the checks that keep the person off the roster agree.
 *
 * Every screen printed only the first date beside "2 day(s)": Joven Bermejo
 * Jr.'s 2026-12-06, 2 days, was refused for not saying which dates.
 */
export const MAX_DAYS = 366;

export function dayCount(leaveDays: unknown): number {
  const n = Math.ceil(Number(leaveDays));
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(n, 1), MAX_DAYS);
}

function parse(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
}

export function lastDay(first: string, leaveDays: unknown): string {
  const d = parse(first);
  if (!d) return String(first || "");
  d.setUTCDate(d.getUTCDate() + dayCount(leaveDays) - 1);
  return d.toISOString().slice(0, 10);
}

/** "2026-12-06" or "2026-12-06 → 2026-12-07": the dates alone. */
export function spanDates(first: string, leaveDays: unknown): string {
  const start = String(first || "").slice(0, 10);
  if (!parse(start) || dayCount(leaveDays) <= 1) return start;
  return `${start} → ${lastDay(start, leaveDays)}`;
}

/** "2026-12-06" or "2026-12-06 → 2026-12-07 (2 days)". */
export function spanLabel(first: string, leaveDays: unknown): string {
  const start = String(first || "").slice(0, 10);
  if (!parse(start) || dayCount(leaveDays) <= 1) return start;
  return `${start} → ${lastDay(start, leaveDays)} (${Number(leaveDays)} days)`;
}

/** "Sat 6 Dec → Sun 7 Dec", for the form to show what is being asked. */
export function spanWords(first: string, leaveDays: unknown): string {
  const a = parse(first);
  if (!a) return "";
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  if (dayCount(leaveDays) <= 1) return fmt(a);
  return `${fmt(a)} → ${fmt(parse(lastDay(first, leaveDays))!)}`;
}
