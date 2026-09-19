/** The claimed window in hours from midnight of the WORK DATE, so a closing
 *  shift that ran to 01:30 is 23:00–25:30 and not 23:00–01:30.
 *
 *  This is what gets stored, and it is what says which shift the hours belong
 *  to. Jheymar Fabros worked 15:00–24:00 on 2026-09-17, clocked out at 01:30
 *  and filed 00:00–01:30 — on the 18th, because the form filled in the date at
 *  the moment he pressed submit. The hours were right and the day was not, so
 *  the 18th, on which he stayed fifty minutes over, read as 140 minutes of
 *  overtime. Twelve other requests since July are shaped the same way.
 *
 *  Two ways a window reaches past midnight:
 *    end before start — 23:00 → 01:30. The end is the next day.
 *    both before dawn — 00:00 → 01:30, the tail of a shift that ended at
 *      midnight. Both are the next day. Nobody claims overtime between
 *      midnight and 06:00 at the FRONT of a work date; a pre-shift claim is
 *      against a morning roster and starts at 06:00 or later.
 */
export function otWindow(start: number, end: number): [number, number] {
  if (end <= start) return [start, end + 24];
  if (start < 6 && end <= 6) return [start + 24, end + 24];
  return [start, end];
}
