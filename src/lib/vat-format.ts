/** Shared formatting for the VAT Ledger (one copy, not one per component). */

/** Philippine pesos, minus sign for a negative. */
export function peso(v: string | number | null | undefined): string {
  const n = Number(v || 0);
  const s = `₱${Math.abs(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return n < 0 ? `−${s}` : s;
}

function parse(at: string): Date | null {
  // Postgres gives "2026-12-31 01:00:00.5+00"; make it ISO before Date reads it.
  const iso = at.trim().replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** A UTC timestamp from the server, on Manila's clock (where the filing happens). */
export function manilaTime(at: string | null | undefined): string {
  if (!at) return "";
  const d = parse(at);
  if (!d) return at.slice(0, 16);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false }).format(d).replace(",", "") + " Manila";
}

/** The Manila calendar day of a UTC timestamp (a save at 07:00 Manila is that day, not UTC's previous one). */
export function manilaDate(at: string | null | undefined): string {
  if (!at) return "";
  const d = parse(at);
  return d ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(d) : at.slice(0, 10);
}
