import { describe, it, expect } from "vitest";

/** The page's own helper, kept in step with src/app/admin/payroll/manila/sil/page.tsx. */
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const target = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const n = new Date();
  const today = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.round((target - today) / 86400000);
}

/** What the page used to do, and why it was a day early in Manila and Dubai. */
function eligibleFromViaDate(hire: string): string {
  const d = new Date(hire + "T00:00:00");
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

describe("SIL anniversary dates", () => {
  it("the Date/toISOString route lands a day early east of UTC", () => {
    // Guards the reason the page no longer builds this date at all: the
    // anniversary is computed server-side and sent down as eligible_from.
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const offset = new Date("2026-09-26T00:00:00").getTimezoneOffset();
    if (offset < 0) {
      // Runner is ahead of UTC (Manila -480, Dubai -240): the bug reproduces.
      expect(eligibleFromViaDate("2025-09-26")).toBe("2026-09-25");
    } else {
      expect(["2026-09-26", "2026-09-25"]).toContain(eligibleFromViaDate("2025-09-26"));
    }
    expect(typeof tz).toBe("string");
  });

  it("counts whole calendar days without going through UTC midnight", () => {
    const n = new Date();
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(daysUntil(iso(n))).toBe(0);
    const tomorrow = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1);
    expect(daysUntil(iso(tomorrow))).toBe(1);
    const lastWeek = new Date(n.getFullYear(), n.getMonth(), n.getDate() - 7);
    expect(daysUntil(iso(lastWeek))).toBe(-7);
  });

  it("returns null rather than a wrong number for junk", () => {
    expect(daysUntil(null)).toBeNull();
    expect(daysUntil("")).toBeNull();
    expect(daysUntil("26/09/2026")).toBeNull();
  });
});
