import { describe, it, expect } from "vitest";
import { countsInWholeThings } from "@/lib/order-step";

describe("countsInWholeThings", () => {
  it("flags the units that produced the nonsense quantities", () => {
    // Taft, 2026-09-03: 29.998 PKT, 49.997 pcs, 4.998 BNDL
    expect(countsInWholeThings("PKT")).toBe(true);
    expect(countsInWholeThings("pcs")).toBe(true);
    expect(countsInWholeThings("BNDL")).toBe(true);
  });

  it("covers the other countable units the catalog uses", () => {
    for (const u of ["PC", "CASE", "BOX", "BTL", "Bottle", "CAN", "TRAY", "ROLL", "SET", "tub", "jar"]) {
      expect(countsInWholeThings(u), u).toBe(true);
    }
  });

  it("leaves weight alone — 0.3 kg of mint is a real order", () => {
    expect(countsInWholeThings("kg")).toBe(false);
    expect(countsInWholeThings("KG")).toBe(false);
    expect(countsInWholeThings("g")).toBe(false);
    expect(countsInWholeThings("L")).toBe(false);
  });

  it("is case and whitespace insensitive", () => {
    expect(countsInWholeThings("  Pkt ")).toBe(true);
    expect(countsInWholeThings("BoTtLe")).toBe(true);
  });

  it("treats a missing unit as not countable, so it raises no flag", () => {
    expect(countsInWholeThings("")).toBe(false);
    expect(countsInWholeThings(null)).toBe(false);
    expect(countsInWholeThings(undefined)).toBe(false);
  });

  it("does not flag units it has never seen", () => {
    expect(countsInWholeThings("Batch")).toBe(false);
    expect(countsInWholeThings("Portion")).toBe(false);
  });
});
