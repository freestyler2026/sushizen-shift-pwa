import { describe, expect, it } from "vitest";
import { dayCount, lastDay, MAX_DAYS, spanLabel, spanWords } from "@/lib/leave-span";

describe("leave span", () => {
  it("covers consecutive days from the first, half days rounded up", () => {
    expect(lastDay("2026-12-06", 2)).toBe("2026-12-07");
    expect(lastDay("2026-12-06", 1.5)).toBe("2026-12-07");
    expect(lastDay("2026-12-06", 0.5)).toBe("2026-12-06");
    expect(lastDay("2026-12-06", null)).toBe("2026-12-06");
    expect(lastDay("2026-12-31", 2)).toBe("2027-01-01");
  });
  it("labels the way the backend does", () => {
    expect(spanLabel("2026-12-06", 2)).toBe("2026-12-06 → 2026-12-07 (2 days)");
    expect(spanLabel("2026-12-06", 1.5)).toBe("2026-12-06 → 2026-12-07 (1.5 days)");
    expect(spanLabel("2026-12-06", 1)).toBe("2026-12-06");
    expect(spanLabel("2026-12-06T00:00:00", 2)).toBe("2026-12-06 → 2026-12-07 (2 days)");
    expect(spanLabel("", 2)).toBe("");
  });
  it("caps a typo", () => {
    expect(dayCount(999)).toBe(MAX_DAYS);
    expect(dayCount("x")).toBe(1);
    expect(dayCount(-2)).toBe(1);
  });
  it("says the days in words for the form", () => {
    expect(spanWords("2026-12-06", 2)).toBe("Sun 6 Dec → Mon 7 Dec");
    expect(spanWords("2026-12-06", 1)).toBe("Sun 6 Dec");
  });
});

describe("spanDates", () => {
  it("is the dates alone", async () => {
    const { spanDates } = await import("@/lib/leave-span");
    expect(spanDates("2026-12-06", 2)).toBe("2026-12-06 → 2026-12-07");
    expect(spanDates("2026-12-06", 0)).toBe("2026-12-06");
  });
});
