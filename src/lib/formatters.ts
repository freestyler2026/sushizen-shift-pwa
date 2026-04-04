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
