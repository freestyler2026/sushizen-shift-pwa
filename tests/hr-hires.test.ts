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
  toRegister, toCheckFirst, daysBetween, waitedLabel,
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


/** The five hires with no staff record on 2026-10-04, as production returned
 *  them. Two of them are already on the roster under a different spelling —
 *  which is the whole reason the list is in two parts. */
const UNREGISTERED: HiredRow[] = [
  hire({ id: "r1", full_name: "RONIDEL S. SANCIANGCO", position_applied: "Manager",
         assigned_branch: "Cubao", applied_date: "2026-09-22", hired_on: "2026-09-28",
         hired_date_is_recorded: true, on_roster: false, roster_candidates: [] }),
  hire({ id: "r2", full_name: "Nhazarhethe Pinpin ", position_applied: "head chef",
         assigned_branch: "Paranaque", applied_date: "2026-09-09", hired_on: "2026-09-25",
         hired_date_is_recorded: true, on_roster: false, roster_candidates: [] }),
  hire({ id: "r3", full_name: "Jeofferson Sibug Sucia ", position_applied: "line cook",
         assigned_branch: null, applied_date: "2026-08-06", hired_on: "2026-08-17",
         hired_date_is_recorded: false, on_roster: false,
         roster_candidates: [{ staff_name: "Joefferson Sucia", status: "ACTIVE",
                               branch_code: "TAFT", score: 0.8 }] }),
  hire({ id: "r4", full_name: "Renz erespe ", position_applied: "PIC new QC store",
         assigned_branch: "will start on July 04", applied_date: "2026-07-27",
         hired_on: "2026-08-03", hired_date_is_recorded: false, on_roster: false,
         roster_candidates: [] }),
  hire({ id: "r5", full_name: "ceddie mamauag", position_applied: "L1 junior cook",
         assigned_branch: null, applied_date: "2026-07-22", hired_on: "2026-07-22",
         hired_date_is_recorded: false, on_roster: false,
         roster_candidates: [{ staff_name: "Cedie Mamauag", status: "SEPARATED",
                               branch_code: "CUB", score: 0.96 }] }),
];

describe("splitting the unregistered hires", () => {
  it("separates registration work from names to look up first", () => {
    // Telling somebody to register a person who is already on the roster
    // creates a duplicate staff record, which splits their shifts and pay.
    expect(toRegister(UNREGISTERED).map((r) => r.id)).toEqual(["r4", "r2", "r1"]);
    expect(toCheckFirst(UNREGISTERED).map((r) => r.id)).toEqual(["r5", "r3"]);
  });

  it("puts the longest wait first in both groups", () => {
    // Being able to name the person waiting since July without reading the list.
    expect(toRegister(UNREGISTERED)[0].full_name).toBe("Renz erespe ");
    expect(toCheckFirst(UNREGISTERED)[0].full_name).toBe("ceddie mamauag");
  });

  it("leaves registered hires out of both", () => {
    const rows = [...UNREGISTERED, hire({ id: "ok", on_roster: true })];
    expect(toRegister(rows).some((r) => r.id === "ok")).toBe(false);
    expect(toCheckFirst(rows).some((r) => r.id === "ok")).toBe(false);
  });

  it("treats a missing candidates field as no candidates", () => {
    // The field is new; a cached response without it must not make a row vanish
    // from both groups.
    const r = hire({ id: "old", on_roster: false });
    delete (r as { roster_candidates?: unknown }).roster_candidates;
    expect(toRegister([r]).map((x) => x.id)).toEqual(["old"]);
    expect(toCheckFirst([r])).toEqual([]);
  });
});

describe("daysBetween", () => {
  it("counts calendar days", () => {
    expect(daysBetween("2026-09-28", "2026-10-04")).toBe(6);
    expect(daysBetween("2026-07-22", "2026-10-04")).toBe(74);
    expect(daysBetween("2026-10-04", "2026-10-04")).toBe(0);
  });
  it("does not let a timezone into a count of days", () => {
    // Both sides go through Date.UTC, so the answer is the same whatever the
    // reader's clock is doing.
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
  });
  it("says nothing when a date is missing or malformed", () => {
    expect(daysBetween(null, "2026-10-04")).toBeNull();
    expect(daysBetween("", "2026-10-04")).toBeNull();
    expect(daysBetween("2026-10", "2026-10-04")).toBeNull();
  });
});

describe("waitedLabel", () => {
  it("is exact when the hire date is in the log", () => {
    expect(waitedLabel(UNREGISTERED[0], "2026-10-04")).toBe("6 days ago");
  });
  it("says 'at least' when the date is only the day the record was touched", () => {
    // The hire happened on or before that day, so the wait is at least that
    // long. Printing it as exact would state a date the record does not hold.
    expect(waitedLabel(UNREGISTERED[4], "2026-10-04")).toBe("at least 74 days ago");
  });
  it("gets the singular right", () => {
    expect(waitedLabel(hire({ hired_on: "2026-10-03" }), "2026-10-04")).toBe("1 day ago");
  });
  it("says nothing rather than a negative wait", () => {
    expect(waitedLabel(hire({ hired_on: "2026-10-09" }), "2026-10-04")).toBeNull();
    expect(waitedLabel(hire({ hired_on: null }), "2026-10-04")).toBeNull();
  });
});
