/**
 * What a request asks for, in one line: the hours of a time change, the two
 * new shifts of a swap. The approver saw only the reason and the date, so a
 * time change could not be judged (Dubai, 2026-10-27: Rafael Jonas Lagahit
 * 9-16 → 10-18).
 */
export type RequestedChange = {
  from?: string;
  to?: string;
  with_staff?: string;
  my_to?: string;
  their_to?: string;
} | null | undefined;

export function requestedChangeText(type: string | null | undefined, c: RequestedChange): string {
  if (!c) return "";
  const t = String(type || "").toLowerCase();
  const v = (s?: string) => String(s || "").trim() || "?";
  if (t === "time_change" && (c.from || c.to)) return `${v(c.from)} → ${v(c.to)}`;
  if (t === "swap" && (c.with_staff || c.my_to || c.their_to)) {
    return `With ${v(c.with_staff)} · mine → ${v(c.my_to)} · theirs → ${v(c.their_to)}`;
  }
  return "";
}
