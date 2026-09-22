import { describe, it, expect } from "vitest";
import { reasonLabel, isNoShow, reasonsFor, outcomeLabel, LAPSE_REASONS } from "@/lib/hr-outcome";

describe("reasonLabel", () => {
  it("puts the stored keys into words", () => {
    expect(reasonLabel("no_show")).toBe("No-show");
    expect(reasonLabel("experience_short")).toBe("Not enough experience");
    expect(reasonLabel("better_candidate")).toBe("Took someone else");
  });

  it("covers every reason the server can store for a lapse", () => {
    for (const k of LAPSE_REASONS) {
      expect(reasonLabel(k), k).not.toBe(k);
    }
  });

  it("degrades to readable text for a key it has never seen", () => {
    expect(reasonLabel("some_new_reason")).toBe("some new reason");
  });

  it("says nothing when there is nothing stored", () => {
    expect(reasonLabel("")).toBe("");
    expect(reasonLabel(null)).toBe("");
    expect(reasonLabel(undefined)).toBe("");
  });
});

describe("isNoShow", () => {
  it("is true only for the no-show key", () => {
    expect(isNoShow("no_show")).toBe(true);
    expect(isNoShow("unreachable")).toBe(false);
    expect(isNoShow("experience_short")).toBe(false);
    expect(isNoShow("")).toBe(false);
    expect(isNoShow(null)).toBe(false);
  });

  it("tolerates whitespace, because the value is typed in places", () => {
    expect(isNoShow(" no_show ")).toBe(true);
  });
});

describe("reasonsFor still separates the two kinds", () => {
  const all = [
    { key: "no_show" }, { key: "unreachable" }, { key: "lapsed" },
    { key: "experience_short" }, { key: "salary_gap" },
  ];

  it("a lapse may only take lapse reasons", () => {
    expect(reasonsFor(all, "lapse").map((r) => r.key))
      .toEqual(["no_show", "unreachable", "lapsed"]);
  });

  it("a pass may not borrow the two that mean nobody assessed them", () => {
    const keys = reasonsFor(all, "pass").map((r) => r.key);
    expect(keys).not.toContain("unreachable");
    expect(keys).not.toContain("lapsed");
    expect(keys).toContain("experience_short");
  });
});

describe("outcomeLabel", () => {
  it("says what the button said, not what the column stores", () => {
    expect(outcomeLabel("hire")).toBe("Move to offer");
    expect(outcomeLabel("consider")).toBe("Hold — decide later");
    expect(outcomeLabel("no_hire")).toBe("Not for this role");
  });

  it("separates a no-show from any other lapse", () => {
    expect(outcomeLabel("not_assessed", "no_show")).toBe("Did not turn up");
    expect(outcomeLabel("not_assessed", "lapsed")).toBe("Closed without a decision");
    expect(outcomeLabel("not_assessed", "")).toBe("Closed without a decision");
  });

  it("carries the four rows that still say reject", () => {
    expect(outcomeLabel("reject")).toBe("Not for this role");
  });

  it("is blank when nothing was recorded, and never shows a raw key", () => {
    expect(outcomeLabel("")).toBe("");
    expect(outcomeLabel(null)).toBe("");
    expect(outcomeLabel("some_future_key")).toBe("some future key");
  });
});
