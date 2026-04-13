export function fmtNum(val: number | null | undefined, unit?: string): string {
  if (val == null || Number.isNaN(val)) return "-";
  const suffix = unit ? ` ${unit}` : "";
  if (Number.isInteger(val)) return `${val.toLocaleString("en-US")}${suffix}`;
  return `${val.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${suffix}`;
}

export function fmtNumTitle(val: number | null | undefined, unit?: string): string {
  if (val == null || Number.isNaN(val)) return "-";
  const suffix = unit ? ` ${unit}` : "";
  return `${val.toLocaleString("en-US")}${suffix}`;
}

/**
 * Seconds → "X min / Xh Ym" (total minutes floored; hours and remainder minutes).
 * null/undefined/non-finite → "—"
 */
export function formatSeconds(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const n = Number(seconds);
  if (!Number.isFinite(n)) return "—";
  const s = Math.floor(n);
  const totalMin = Math.floor(s / 60);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return `${totalMin} min / ${hours}h ${mins}m`;
}
