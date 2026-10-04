/** The hires tab's arithmetic and labels.
 *
 *  Figures are production, Manila, 2026-10-04: 1,200 non-merged applicants,
 *  every one with an application date, 29 hired. The cohort table therefore
 *  covers the whole population, which is why the heading divides by its total
 *  rather than by a separately-counted "all applicants".
 */
import { describe, it, expect } from "vitest";
import {
  monthLabel, dayLabel, notOnRoster, daysToHireLine, cohortTotals,
  type Cohort, type HiredRow,
} from "@/lib/hr-hires";

const PROD_COHORTS: Cohort[] = [
  { month: "2026-06", applied: 8,    hired: 1,  rejected: 7,   still_open: 0,   hire_rate: 12.5, settled: 8,   complete: true },
  { month: "2026-07", applied: 44,   hired: 7,  rejected: 37,  still_open: 0,   hire_rate: 15.9, settled: 44,  complete: true },
  { month: "2026-08", applied: 80,   hired: 6,  rejected: 74,  still_open: 0,   hire_rate: 7.5,  settled: 80,  complete: true },
  { month: "2026-09", applied: 1028, hired: 15, rejected: 893, still_open: 120, hire_rate: 1.5,  settled: 908, complete: false },
  { month: "2026-10", applied: 40,   hired: 0,  rejected: 21,  still_open: 19,  hire_rate: 0.0,  settled: 21,  complete: false },
];

function hire(over: Partial<HiredRow> = {}): HiredRow {
  return {
    id: "1", full_name: "A B", position_applied: null, position_group: null,
    assigned_branch: null, source: null, referrer_name: null,
    applied_date: "2026-09-28", hired_on: "2026-09-30",
    hired_date_is_recorded: true, days_to_hire: 2, on_roster: true, ...over,
  };
}

describe("monthLabel", () => {
  it("names the month", () => {
    expect(monthLabel("2026-09")).toBe("Sep 2026");
    expect(monthLabel("2026-01")).toBe("Jan 2026");
    expect(monthLabel("2026-12")).toBe("Dec 2026");
  });
  it("hands back anything it cannot parse", () => {
    // A month that cannot be parsed is still a real group of people, so the
    // row has to appear rather than be dropped or rendered blank.
    expect(monthLabel("whenever")).toBe("whenever");
    expect(monthLabel("2026-13")).toBe("2026-13");
    expect(monthLabel("")).toBe("—");
  });
});

describe("dayLabel", () => {
  it("drops the year and the leading zero", () => {
    expect(dayLabel("2026-09-28")).toBe("28 Sep");
    expect(dayLabel("2026-10-04")).toBe("4 Oct");
  });
  it("says nothing rather than something wrong", () => {
    expect(dayLabel(null)).toBe("—");
    expect(dayLabel("")).toBe("—");
  });
});

describe("notOnRoster", () => {
  it("is the hires nobody has registered", () => {
    const rows = [hire({ id: "1" }), hire({ id: "2", on_roster: false })];
    expect(notOnRoster(rows).map((r) => r.id)).toEqual(["2"]);
  });
  it("is empty when everybody is registered", () => {
    expect(notOnRoster([hire(), hire({ id: "2" })])).toEqual([]);
  });
});

describe("daysToHireLine", () => {
  it("reports how much of it is actually known", () => {
    const line = daysToHireLine(
      { counted: 12, of: 29, median: 5, fastest: 1, slowest: 16 });
    expect(line).toContain("Median 5 days");
    expect(line).toContain("fastest 1, slowest 16");
    // The sentence has to carry its own denominator. 12 of 29 is the honest
    // basis, and a median quoted without it gets repeated as "5 days" for
    // everybody.
    expect(line).toContain("12 of 29");
  });
  it("says nothing when the log knows none of them", () => {
    // A median over nothing is the kind of number that gets quoted later.
    expect(daysToHireLine(
      { counted: 0, of: 29, median: null, fastest: null, slowest: null })).toBeNull();
  });
});

describe("cohortTotals", () => {
  it("counts the same people the table lists", () => {
    const t = cohortTotals(PROD_COHORTS);
    expect(t.applied).toBe(1200);
    expect(t.hired).toBe(29);
    expect(t.rejected).toBe(1032);
    expect(t.still_open).toBe(139);
    // Every applicant is accounted for exactly once.
    expect(t.hired + t.rejected + t.still_open).toBe(t.applied);
  });
  it("gives the rate one decimal", () => {
    expect(cohortTotals(PROD_COHORTS).hire_rate).toBe(2.4);
    expect(cohortTotals([]).hire_rate).toBe(0);
  });
  it("does not divide by zero on an empty month", () => {
    const t = cohortTotals([
      { month: "2026-11", applied: 0, hired: 0, rejected: 0, still_open: 0,
        hire_rate: 0, settled: 0, complete: true }]);
    expect(t.hire_rate).toBe(0);
  });
});
