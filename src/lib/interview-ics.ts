/** A calendar entry the interviewer can keep.
 *
 *  Nothing about a booking reaches anybody on its own: no message, no push. The
 *  OS cannot write into somebody's Google or phone calendar without an
 *  integration to build and maintain, but a .ics is that same result without
 *  any of it — one tap and it is in whatever calendar they already use.
 *
 *  It lives here rather than in a component because both the Interviews list
 *  and the calendar grid offer it, and two copies of a date format drift.
 */

export type IcsInterview = {
  id: string;
  full_name: string;
  phone?: string | null;
  position_applied?: string | null;
  starts_at: string;
  ends_at?: string | null;
  /** How the interviewer reaches them: "Office phone", "Viber on the PC", … */
  reach_with?: string | null;
  /** Where the interviewer sits that day: "BO" or "Cubao". */
  location?: string | null;
  interviewer?: string | null;
};

const stamp = (d: Date) =>
  d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

const esc = (t: string) =>
  String(t || "").replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");

export function icsFor(row: IcsInterview): string {
  const start = new Date(row.starts_at);
  // The booking's own end, not a repeated 45. HR_INTERVIEW_MINUTES is a server
  // setting; copying its value here would make every entry wrong the day it
  // changes, and nobody would connect the two.
  const end = row.ends_at
    ? new Date(row.ends_at)
    : new Date(start.getTime() + 45 * 60000);
  // LOCATION is where the interviewer has to be. It used to carry the reach
  // label, so an entry saved to a phone said "Office phone" and lost the only
  // thing the calendar is asked for — BO or Cubao.
  const reach = row.reach_with || "";
  const where = row.location || "";
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sushi ZEN//Workforce OS//EN",
    "BEGIN:VEVENT",
    `UID:interview-${row.id}@sushizen`,
    `DTSTAMP:${stamp(new Date())}`,
    // UTC, so the phone converts it. A local time written without a VTIMEZONE
    // block is the one thing every calendar app reads differently.
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(`Interview — ${row.full_name}`)}`,
    `DESCRIPTION:${esc(
      [
        `${row.full_name}${row.position_applied ? ` — ${row.position_applied}` : ""}`,
        row.phone ? `Phone: ${row.phone}` : "",
        reach ? `Reach them with: ${reach}` : "",
        where ? `At: ${where}` : "",
        row.interviewer ? `Interviewer: ${row.interviewer}` : "",
      ].filter(Boolean).join("\n"),
    )}`,
    where ? `LOCATION:${esc(where)}` : "",
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Interview in 15 minutes",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}

export function downloadIcs(row: IcsInterview): void {
  const blob = new Blob([icsFor(row)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `interview-${row.full_name.replace(/[^\w]+/g, "-").toLowerCase()}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
