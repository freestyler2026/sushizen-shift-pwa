export function normalizeCalendarDateInput(raw: string): string {
  const s = String(raw || "").trim();
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!m) return "";

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return "";
  if (month < 1 || month > 12) return "";

  const maxDay = new Date(year, month, 0).getDate();
  const clampedDay = Math.max(1, Math.min(day, maxDay));
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
}
