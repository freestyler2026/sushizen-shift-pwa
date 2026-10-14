// A publish that would put somebody at work at two branches at the same time.
// The server refuses it (app/db_cross_branch.py) and names each clash; this is
// the shape it sends and the one line the screen prints for each.

export type CrossBranchOverlap = {
  staff_name: string;
  work_date: string;
  start_hour: number;
  end_hour: number;
  other_branch: string;
  // The sheet the other row is on, and whether it names the same place as
  // this one (one shift written on two sheets, not a move). Older responses
  // did not send them.
  other_sheet?: string;
  same_place?: boolean;
  other_start_hour: number;
  other_end_hour: number;
};

function hhmm(h: number): string {
  const m = Math.round(Number(h) * 60);
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function describeCrossBranchOverlap(o: CrossBranchOverlap): string {
  const head = `${o.staff_name} — ${o.work_date}: ${hhmm(o.start_hour)}–${hhmm(o.end_hour)} here, `;
  const hours = `${hhmm(o.other_start_hour)}–${hhmm(o.other_end_hour)}`;
  const sheet = o.other_sheet || o.other_branch;
  if (o.same_place) return head + `and the same shift is already on the ${sheet} sheet (${hours}) — a duplicate`;
  const where = sheet === o.other_branch ? o.other_branch : `${o.other_branch} (on the ${sheet} sheet)`;
  return head + `but already published at ${where} ${hours}`;
}

export function crossBranchOverlapsFrom(detail: unknown): CrossBranchOverlap[] {
  if (!detail || typeof detail !== "object") return [];
  const d = detail as { code?: unknown; cross_branch_overlaps?: unknown };
  if (d.code !== "cross_branch_overlap" || !Array.isArray(d.cross_branch_overlaps)) return [];
  return d.cross_branch_overlaps as CrossBranchOverlap[];
}
