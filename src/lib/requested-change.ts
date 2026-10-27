/**
 * What a request asks for, in one line: the hours of a time change, the two
 * new shifts of a swap. The approver saw only the reason and the date, so a
 * time change could not be judged (Dubai, 2026-10-27: Rafael Jonas Lagahit
 * 9-16 → 10-18).
 */
export type RequestedChange = {
  from?: string;
  to?: string;
  /** Approved at other hours than asked; `to` stays what was asked. */
  approved_to?: string;
  with_staff?: string;
  my_to?: string;
  their_to?: string;
} | null | undefined;

export function requestedChangeText(type: string | null | undefined, c: RequestedChange): string {
  if (!c) return "";
  const t = String(type || "").toLowerCase();
  const v = (s?: string) => String(s || "").trim() || "?";
  if (t === "time_change" && (c.from || c.to)) {
    const base = `${v(c.from)} → ${v(c.to)}`;
    return c.approved_to ? `${base} · approved at ${c.approved_to}` : base;
  }
  if (t === "swap" && (c.with_staff || c.my_to || c.their_to)) {
    return `With ${v(c.with_staff)} · mine → ${v(c.my_to)} · theirs → ${v(c.their_to)}`;
  }
  return "";
}

/**
 * Whether the schedule can read these hours, by the backend's rule
 * (_clean_approved_hours): whole hours "start-end", crossing midnight only from
 * 13:00 on, at most 16 hours. "12-00" is not readable (it ends before it starts).
 */
export function readableHours(s: string | null | undefined): boolean {
  const t = String(s || "").trim().replace(/[–—]/g, "-").replace(/\s+/g, "");
  // Whole hours only: the schedule drops minutes, so 11:30 would be stored as
  // one shift and shown as another.
  const m = /^(\d{1,2})(?::(\d{2}))?-(\d{1,2})(?::(\d{2}))?$/.exec(t);
  if (!m || (m[2] ?? "00") !== "00" || (m[4] ?? "00") !== "00") return false;
  const st = Number(m[1]);
  let en = Number(m[3]);
  if (st >= 24) return false;
  if (en <= 6 && st >= 13) en += 24;
  if (en === 0 && st >= 13) en = 24;
  if (en <= st && st >= 13) en += 24;
  return st >= 0 && st < en && en <= 48 && en - st <= 16;
}

/** A request's stored payload as a RequestedChange: once approved at other
 * hours, payload.to is the approved hours and payload.requested_to what was asked. */
export function changeFromPayload(p: RequestedChange & { requested_to?: string }): RequestedChange {
  if (!p) return p;
  const asked = String(p.requested_to || "").trim();
  if (asked && asked !== String(p.to || "").trim()) return { ...p, to: asked, approved_to: p.to };
  return p;
}
