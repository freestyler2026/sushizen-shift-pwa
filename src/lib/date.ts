/** A Date as `YYYY-MM-DD` on the wall clock of the device, not UTC.
 *
 * `toISOString().slice(0, 10)` converts to UTC first, so in Manila (+8) and
 * Dubai (+4) it returns yesterday for every moment before 08:00 / 04:00 local
 * — and for any date built as `new Date(iso + "T00:00:00")` it is always the
 * day before. Both stores are ahead of UTC, so the error only ever goes one
 * way: a day that has not happened yet, or one that already ended.
 */
export function isoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Today on the device's own clock. See {@link isoDate}. */
export function isoToday(): string {
  return isoDate(new Date());
}

export function mondayOf(dateIso: string): string {
  const d = new Date(dateIso + "T00:00:00");
  const day = d.getDay(); // 0 Sun .. 6 Sat
  const diff = (day === 0 ? -6 : 1) - day; // Monday start
  d.setDate(d.getDate() + diff);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}