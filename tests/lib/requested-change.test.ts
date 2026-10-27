import { describe, expect, it } from "vitest";
import { requestedChangeText } from "@/lib/requested-change";

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
