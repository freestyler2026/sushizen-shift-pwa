import { describe, it, expect } from "vitest";
import {
  countDayOffConflicts,
  describeDayOffConflict,
  hhmm,
  type DayOffConflict,
} from "@/lib/day-off-conflicts";

describe("hhmm", () => {
  it("reads hours counted from midnight of the work date", () => {
    expect(hhmm(9)).toBe("09:00");
    expect(hhmm(15.5)).toBe("15:30");
    expect(hhmm(0)).toBe("00:00");
  });

  it("wraps an overnight tail into the next day's clock", () => {
    // A shift 15:30–24:30 ends at 00:30, not at 24:30.
    expect(hhmm(24.5)).toBe("00:30");
    expect(hhmm(26)).toBe("02:00");
  });

  it("does not throw on a missing hour", () => {
    expect(hhmm(null)).toBe("00:00");
    expect(hhmm(undefined)).toBe("00:00");
  });
});

describe("describeDayOffConflict", () => {
  const base: DayOffConflict = {
    staff_name: "Abegail A. Dalida",
    work_date: "2026-09-06",
    request_type: "day_off",
    start_hour: 9,
    end_hour: 18,
    branch_code: "CUB",
  };

  it("matches the sentence the backend writes", () => {
    expect(describeDayOffConflict(base)).toBe(
      "Abegail A. Dalida — 2026-09-06 is an approved day off, but this puts them on 09:00-18:00 at CUB",
    );
  });

  it("leaves the branch out when the row has none", () => {
    expect(describeDayOffConflict({ ...base, branch_code: null })).toBe(
      "Abegail A. Dalida — 2026-09-06 is an approved day off, but this puts them on 09:00-18:00",
    );
  });

  it("spells a multi-word request type the way a person would read it", () => {
    expect(describeDayOffConflict({ ...base, request_type: "paid_leave" })).toContain(
      "is an approved paid leave",
    );
  });
});

describe("countDayOffConflicts", () => {
  const c = (staff_name: string, work_date: string): DayOffConflict => ({ staff_name, work_date });

  it("counts one row as one person, one day", () => {
    expect(countDayOffConflicts([c("Mary Jane Tegerero", "2026-08-21")])).toBe("1 person, 1 day");
  });

  it("counts two people on two days without saying 'across'", () => {
    expect(
      countDayOffConflicts([c("Mary Jane Tegerero", "2026-08-21"), c("Abegail A. Dalida", "2026-09-06")]),
    ).toBe("2 people, 2 days");
  });

  it("says 'across' when one person has several days", () => {
    expect(
      countDayOffConflicts([
        c("Rachelle Ann Caubat", "2026-08-30"),
        c("Rachelle Ann Caubat", "2026-09-20"),
      ]),
    ).toBe("1 person across 2 days");
  });

  it("matches a name case-insensitively so it is not counted twice", () => {
    expect(
      countDayOffConflicts([c("Rachelle Ann Caubat", "2026-08-30"), c("rachelle ann caubat", "2026-09-20")]),
    ).toBe("1 person across 2 days");
  });
});
