import { describe, expect, it } from "vitest";
import { changeFromPayload, readableHours, requestedChangeText } from "@/lib/requested-change";

describe("requestedChangeText", () => {
  it("shows the hours of a time change", () => {
    expect(requestedChangeText("time_change", { from: "9-16", to: "10-18" })).toBe("9-16 → 10-18");
    expect(requestedChangeText("time_change", { to: "12-00" })).toBe("? → 12-00");
  });
  it("shows both new shifts of a swap", () => {
    expect(requestedChangeText("swap", { with_staff: "Amar BK", my_to: "9-18", their_to: "15-24" }))
      .toBe("With Amar BK · mine → 9-18 · theirs → 15-24");
  });
  it("is empty when there is nothing to show", () => {
    expect(requestedChangeText("time_change", null)).toBe("");
    expect(requestedChangeText("time_change", {})).toBe("");
    expect(requestedChangeText("day_off", { from: "9-16", to: "10-18" })).toBe("");
  });
});

describe("approved at other hours", () => {
  it("says what was asked and what was approved", () => {
    expect(requestedChangeText("time_change", { from: "9-16", to: "12-00", approved_to: "11-23" }))
      .toBe("9-16 → 12-00 · approved at 11-23");
  });
  it("reads hours like the schedule does", () => {
    for (const ok of ["11-23", "11:00-23:00", "17-1", "9 - 18", "17-25"]) expect(readableHours(ok)).toBe(true);
    for (const bad of ["12-00", "11-11", "2-23", "abc", "", "1 hour", "11:30-20:00", "24-6"]) expect(readableHours(bad)).toBe(false);
  });
});

describe("changeFromPayload", () => {
  it("reads an adjusted payload as asked + approved", () => {
    expect(changeFromPayload({ from: "9-16", to: "11-23", requested_to: "12-00" }))
      .toMatchObject({ to: "12-00", approved_to: "11-23" });
    expect(changeFromPayload({ from: "9-16", to: "12-00" })).toEqual({ from: "9-16", to: "12-00" });
  });
});
