// The overtime approval screen now says whether the person arrived late that
// day. Dubai asked whether a claim had been made to offset a late arrival, and
// the screen could not answer it: the claim and the punch are recorded in
// different places and only the claim was on the row.
//
// It is a fact, not a verdict. Of 235 requests since 2026-07-01, four have a
// claim close enough to the lateness to look like a trade — a rule firing on
// four would refuse honest overtime more often than it caught anything.

import { describe, it, expect } from "vitest";

/** Mirrors LateThatDay in src/app/admin/overtime/page.tsx. */
function chipFor(r: { late_that_day?: boolean; late_minutes_that_day?: number | null; ot_minutes: number }) {
  if (!r.late_that_day || r.late_minutes_that_day == null) return null;
  return {
    minutes: r.late_minutes_that_day,
    claimCoversIt: r.ot_minutes >= r.late_minutes_that_day,
  };
}

describe("overtime — was the person late that day", () => {
  it("says nothing when they were on time", () => {
    expect(chipFor({ late_that_day: false, late_minutes_that_day: -6, ot_minutes: 50 })).toBeNull();
  });

  it("says nothing when the day has no roster or no punch", () => {
    expect(chipFor({ late_that_day: false, late_minutes_that_day: null, ot_minutes: 50 })).toBeNull();
  });

  // Jheymar Fabros, 2026-09-18: 14:00 shift, in at 14:32, claimed 50 minutes.
  it("shows the lateness, and notes when the claim covers it", () => {
    expect(chipFor({ late_that_day: true, late_minutes_that_day: 32, ot_minutes: 50 }))
      .toEqual({ minutes: 32, claimCoversIt: true });
  });

  // Udaya Gurung, 2026-09-05: 80 minutes late, claimed 60. Not a trade.
  it("does not claim it covers the lateness when it does not", () => {
    expect(chipFor({ late_that_day: true, late_minutes_that_day: 80, ot_minutes: 60 }))
      .toEqual({ minutes: 80, claimCoversIt: false });
  });
});

// The meal allowance is a Manila benefit. The attendance banner told everyone
// "Meal allowance may not apply today" after a late clock-in, so a Dubai staff
// member on a monthly salary — which carries no late deduction either — was
// told a loss that cannot happen to them.
function lateBannerText(startLabel: string, lateCostsMealAllowance: boolean | undefined) {
  return `Shift started at ${startLabel}.${lateCostsMealAllowance ? " Meal allowance may not apply today." : ""}`;
}

describe("attendance — the late banner names a real consequence", () => {
  it("mentions the allowance in Manila", () => {
    expect(lateBannerText("9:00 AM", true)).toContain("Meal allowance");
  });
  it("does not mention it in Dubai", () => {
    expect(lateBannerText("2:00 PM", false)).toBe("Shift started at 2:00 PM.");
  });
  it("does not mention it when the server did not say", () => {
    expect(lateBannerText("2:00 PM", undefined)).toBe("Shift started at 2:00 PM.");
  });
});
