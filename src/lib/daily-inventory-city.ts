/**
 * Which city a Daily Inventory request is about.
 *
 * The backend falls back to the caller's token when a request names no city,
 * and all four HQ accounts -- the owner, Yusuke, Yuri and Ayako -- are
 * registered in Dubai (staff_master, measured 2026-10-03). Without this
 * parameter the people most likely to open the screen would get Dubai's empty
 * list, and replace-mode import would pick the wrong city's items to switch off.
 *
 * It lives here rather than inside the component so the test can call the real
 * function instead of re-implementing the rule beside it.
 */

/**
 * The city the admin screen shows.
 *
 * A constant rather than a picker: Dubai has no items yet, so a toggle would be
 * a control whose only other setting shows an empty screen. Phase 2 loads them
 * and this becomes state.
 */
export const INVENTORY_CITY = "manila";

/** Append the city to a /api/daily-inventory path, wherever its query starts. */
export function withCity(path: string, city: string = INVENTORY_CITY): string {
  if (!path.includes("/api/daily-inventory")) return path;
  if (/[?&]city=/.test(path)) return path;   // already said; do not say it twice
  return path + (path.includes("?") ? "&" : "?") + "city=" + encodeURIComponent(city);
}
