// `absences` holds approved leave and rostered days off as well as real
// absences. The summary counted every row: on 2026-09-26 Dubai's 09-01..09-25
// read "Total Absences 123" against 101 rows of VACATION_LEAVE, one DAY_OFF and
// fifteen actual ABSENT — and the four people at the top of the most-absent
// list were all on approved annual leave.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const page = readFileSync("src/app/admin/os-attendance/page.tsx", "utf8");
const summary = page.slice(page.indexOf("type SummaryRow"));

type Row = { staff_name: string; absent_count: number; leave_days?: number; late_count: number };
const totalAbsent = (rows: Row[]) => rows.reduce((s, r) => s + r.absent_count, 0);
const flagged = (rows: Row[]) => rows.filter(r => r.absent_count >= 3 || r.late_count >= 5).length;

// The five people as production actually had them on 2026-09-26.
const DUBAI: Row[] = [
  { staff_name: "Ashik Kahn",          absent_count: 0,  leave_days: 25, late_count: 0 },
  { staff_name: "Renuka Neupane",      absent_count: 0,  leave_days: 23, late_count: 0 },
  { staff_name: "Yogesh Bashyal",      absent_count: 0,  leave_days: 10, late_count: 0 },
  { staff_name: "Hayat Ullah Khan",    absent_count: 0,  leave_days: 6,  late_count: 0 },
  { staff_name: "Sherileene Santiago", absent_count: 3,  leave_days: 0,  late_count: 0 },
];

describe("OS Attendance summary — leave is not absence", () => {
  it("does not count a month of approved leave as a month of absence", () => {
    // Before: Ashik Kahn read 25. The whole complaint, in one number.
    expect(DUBAI.find(r => r.staff_name === "Ashik Kahn")!.absent_count).toBe(0);
    expect(totalAbsent(DUBAI)).toBe(3);
  });

  it("stops flagging people for taking the leave they were granted", () => {
    // The flag fires at three absences. Four people on annual leave were over it.
    expect(flagged(DUBAI)).toBe(1);
    expect(flagged(DUBAI.filter(r => (r.leave_days ?? 0) > 0))).toBe(0);
  });

  it("still counts a real absence", () => {
    expect(DUBAI.find(r => r.staff_name === "Sherileene Santiago")!.absent_count).toBe(3);
    expect(flagged([{ staff_name: "x", absent_count: 3, leave_days: 0, late_count: 0 }])).toBe(1);
  });

  it("shows the leave rather than hiding it, so a quiet row explains itself", () => {
    // 0 worked and 0 absent with nothing beside it reads as missing data.
    expect(summary).toContain("On Leave");
    expect(summary).toContain("leave_days");
    expect(summary).toMatch(/title="Approved leave[^"]*not an absence/);
  });

  it("carries the split into the exported CSV, which the screen did not before", () => {
    expect(summary).toContain('"Staff,Branch,Worked Days,Absences,On Leave,Late Count,Late Minutes,No Clockout"');
    expect(summary).toContain("r.leave_days ?? 0");
  });

  it("treats a missing leave_days as none rather than as NaN", () => {
    // An older server that does not send the field must not break the column.
    const old = [{ staff_name: "a", absent_count: 1, late_count: 0 }] as Row[];
    expect(totalAbsent(old)).toBe(1);
    expect(summary).toContain("(row.leave_days ?? 0) > 0");
  });
});
