// tests/procurement/ot-window.test.ts
//
// The overtime form filled work_date with the calendar date at the moment of
// submission, so a closing shift that ran past midnight was filed on the next
// day. Jheymar Fabros worked 15:00–24:00 on 2026-09-17, clocked out at 01:30
// and filed 00:00–01:30 against the 18th — a day on which he stayed 50 minutes
// over, which then read as 140 minutes of overtime. Twelve other requests
// since July are shaped the same way, and one of them (Jennyleen Valera
// Pepelar, 2026-08-25) reached the DTR as half an hour of overtime on a
// rest day she did not work, and had to be moved by hand four days later.

import { describe, it, expect } from "vitest";
import { otWindow } from "@/lib/ot-window";

/** Mirrors storeBusinessDay in the request form. */
function storeBusinessDay(city: string, nowUtcMs: number): string {
  const tzOff = city.toLowerCase() === "manila" ? 8 : 4;
  const local = new Date(nowUtcMs + tzOff * 3600_000);
  if (local.getUTCHours() < 5) local.setUTCDate(local.getUTCDate() - 1);
  return local.toISOString().slice(0, 10);
}

describe("overtime window — hours from midnight of the work date", () => {
  it("leaves an ordinary evening window alone", () => {
    expect(otWindow(21, 23)).toEqual([21, 23]);
  });

  it("carries the end past midnight when it is before the start", () => {
    expect(otWindow(23, 1.5)).toEqual([23, 25.5]);
  });

  it("carries both past midnight for the tail of a closing shift", () => {
    // 00:00–01:30, filed against the day the shift started.
    expect(otWindow(0, 1.5)).toEqual([24, 25.5]);
  });

  it("leaves an early-morning pre-shift claim alone", () => {
    // 06:00–07:00 before a morning roster is not an overnight tail.
    expect(otWindow(6, 7)).toEqual([6, 7]);
  });

  it("keeps the minutes the same either way", () => {
    const [s1, e1] = otWindow(23, 1.5);
    const [s2, e2] = otWindow(0, 1.5);
    expect(Math.round((e1 - s1) * 60)).toBe(150);
    expect(Math.round((e2 - s2) * 60)).toBe(90);
  });
});

describe("overtime form — the work date it opens on", () => {
  // Jheymar clocked out 01:30 Dubai and filed at 02:03 Dubai on 2026-09-18.
  const filedAt = Date.parse("2026-09-17T22:03:00Z"); // 02:03 Dubai on the 18th

  it("offers the shift that is ending, not the calendar date", () => {
    expect(storeBusinessDay("dubai", filedAt)).toBe("2026-09-17");
  });

  it("offers today once the morning has started", () => {
    const morning = Date.parse("2026-09-18T05:30:00Z"); // 09:30 Dubai
    expect(storeBusinessDay("dubai", morning)).toBe("2026-09-18");
  });

  it("uses the store's clock, not the device's", () => {
    // 20:30 UTC is 00:30 Manila on the 18th — still the 17th's business day.
    expect(storeBusinessDay("manila", Date.parse("2026-09-17T16:30:00Z"))).toBe("2026-09-17");
  });
});
