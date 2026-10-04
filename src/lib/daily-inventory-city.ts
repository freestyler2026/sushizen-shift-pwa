/**
 * Which city a Daily Inventory request is about.
 *
 * The backend falls back to the caller's token when a request names no city, and
 * all four HQ accounts -- the owner, Yusuke, Yuri and Ayako -- are registered in
 * Dubai (staff_master, measured 2026-10-03). So a request that forgets to say
 * serves them the wrong city's list, and replace-mode import would pick the
 * wrong city's items to switch off.
 *
 * `city` has no default. It had one -- the constant "manila" -- for as long as
 * Dubai had no items, and that constant then sat on top of a city picker the
 * screen already had: a Dubai branch was selected, every request still said
 * manila, and the screen showed Manila's items. That is the complaint this work
 * started from. A required argument cannot do that quietly.
 */

export type InventoryCity = "manila" | "dubai";

export const INVENTORY_CITIES: InventoryCity[] = ["manila", "dubai"];

export function asInventoryCity(value: string | null | undefined): InventoryCity {
  return String(value || "").toLowerCase() === "dubai" ? "dubai" : "manila";
}

/** Append the city to a /api/daily-inventory path, wherever its query starts. */
/**
 * Every city, for a screen that must cover both.
 *
 * HQ work across Manila and Dubai and every HQ account is registered in Dubai,
 * so "the viewer's city" scoped them to one — a Manila report matched against
 * Dubai's item master, 0 of its 127 lines matched, and the Central Kitchen tab
 * read 0. A registered city is a payroll fact, not a statement about what
 * somebody looks at.
 *
 * Only reads may ask for this. Writing needs one city, and the branch names it.
 */
export const EVERY_CITY = "all" as const;
export type CityParam = InventoryCity | typeof EVERY_CITY;

/** Does this person's work span more than one city? Mirrors cities_for() on the server. */
export function worksInEveryCity(role: string | null | undefined): boolean {
  return ["HQ", "ADMIN"].includes(String(role || "").trim().toUpperCase());
}

export function withCity(path: string, city: CityParam): string {
  if (!path.includes("/api/daily-inventory")) return path;
  if (/[?&]city=/.test(path)) return path;   // already said; do not say it twice
  return path + (path.includes("?") ? "&" : "?") + "city=" + encodeURIComponent(city);
}
