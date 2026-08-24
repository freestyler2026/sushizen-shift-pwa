/**
 * Per-staff compensation is masked on the server for every role except HQ — the
 * payroll/HR APIs return `null` in place of each amount (see the
 * salary_masking_guard middleware in the backend). These helpers render that
 * null as a visible "hidden" marker instead of crashing on `.toFixed()` or
 * printing NaN.
 *
 * Presentation only. The security boundary is the backend middleware: never
 * rely on these to keep an amount secret.
 */

export const SALARY_HIDDEN = "••••";

/** True when the API masked this amount because the viewer is not HQ. */
export function isSalaryHidden(v: unknown): boolean {
  return v === null || v === undefined;
}

/**
 * Format a possibly-masked money value. Returns SALARY_HIDDEN for null,
 * undefined, "" and anything non-numeric, so a masked payload can never throw.
 */
export function fmtMoney(
  v: number | string | null | undefined,
  opts: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  locale = "en-US",
): string {
  if (v === null || v === undefined || v === "") return SALARY_HIDDEN;
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (!Number.isFinite(n)) return SALARY_HIDDEN;
  return n.toLocaleString(locale, opts);
}

/** fmtMoney with a currency prefix, e.g. money(v, "₱") → "₱65,000.00". */
export function money(
  v: number | string | null | undefined,
  prefix = "",
  opts?: Intl.NumberFormatOptions,
  locale = "en-US",
): string {
  const body = fmtMoney(v, opts, locale);
  return body === SALARY_HIDDEN ? body : `${prefix}${body}`;
}
