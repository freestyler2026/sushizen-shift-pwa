// The export said "Ordinary" for 140 approved paid leave days in 2026-09 —
// twenty-seven consecutive for Kapil Bahadur — because the CSV builder read
// the absence flag and never the leave flag, while the screen read both.
import { describe, it, expect } from "vitest";
import { dtrDayTypeLabel, dtrRowStatus, DAY_TYPE_LABELS } from "@/lib/dtr-status";

const leave = { day_type: "ordinary_day", is_worked: false, annual_leave_flag: true };
const awp   = { day_type: "ordinary_day", is_worked: false, absent_without_pay: true };
const plain = { day_type: "ordinary_day", is_worked: true };

describe("a Dubai DTR row, in words", () => {
  it("does not let approved leave leave the building as an ordinary day", () => {
    // The whole bug, in one assertion.
    expect(dtrDayTypeLabel(leave)).toBe("Annual Leave");
    expect(dtrDayTypeLabel(leave)).not.toBe("Ordinary");
  });

  it("says the same word on the screen and in the export", () => {
    // They disagreed for as long as both existed, which is why this is one file.
    expect(dtrRowStatus(leave)).toBe(dtrDayTypeLabel(leave));
  });

  it("keeps paid leave and unpaid absence apart", () => {
    expect(dtrDayTypeLabel(awp)).toBe("AWP");
    expect(dtrRowStatus(awp)).toBe("Absent (AWP)");
    // A row is never both, but if one ever arrives that way, paid wins — the
    // deduction is what has to be justified, not the pay.
    expect(dtrDayTypeLabel({ ...awp, annual_leave_flag: true })).toBe("Annual Leave");
  });

  it("still reports the day type when nothing overrides it", () => {
    expect(dtrDayTypeLabel(plain)).toBe("Ordinary");
    expect(dtrDayTypeLabel({ day_type: "rest_day" })).toBe("Rest Day");
    expect(dtrDayTypeLabel({ day_type: "public_holiday" })).toBe("Public Holiday");
    // An unknown value is passed through rather than swallowed.
    expect(dtrDayTypeLabel({ day_type: "sandstorm" })).toBe("sandstorm");
  });

  it("shows the screen's extra states, which the export has no column for", () => {
    expect(dtrRowStatus({ day_type: "ordinary_day", absence_type: "sick" })).toBe("Absent (sick)");
    expect(dtrRowStatus({ day_type: "ordinary_day", approval_status: "no_clockin" })).toBe("No Clock-in");
    expect(dtrRowStatus({ day_type: "ordinary_day", is_scheduled_rest_day: true })).toBe("Day Off");
    expect(dtrRowStatus(plain)).toBe("Worked");
  });

  it("carries the four day types the DTR upload accepts", () => {
    expect(Object.keys(DAY_TYPE_LABELS).sort()).toEqual(
      ["ordinary_day", "public_holiday", "public_holiday_and_rest_day", "rest_day"]);
  });

  it("labels the real 2026-09 leave rows, not an invented shape", () => {
    // The exact row the production API returns for a leave day: an ordinary
    // day type, no clock-in, the flag set. This is what was coming out wrong.
    const production = {
      day_type: "ordinary_day", is_worked: false, is_scheduled_rest_day: false,
      absent_without_pay: false, annual_leave_flag: true,
      absence_type: null, approval_status: "pending",
    };
    expect(dtrDayTypeLabel(production)).toBe("Annual Leave");
    expect(dtrRowStatus(production)).toBe("Annual Leave");
  });
});
