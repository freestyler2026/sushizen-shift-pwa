import { describe, it, expect } from "vitest";
import { BRANCHES } from "@/lib/branches";
import { money, currencyOf } from "@/lib/currency";

/**
 * The CK delivery module has offered a Dubai/Manila switch all along, but
 * carried its own branch list: Dubai's held "AL BARSHA" and "M CITY" while the
 * city runs five restaurants, so Business Bay, Al Mina, Arjan and JLT could not
 * be chosen as a destination at all. Dubai has recorded three CK deliveries
 * ever, all in June; Manila has 134.
 */
const DESTINATIONS = (city: "dubai" | "manila") =>
  BRANCHES[city].filter((b) => !["CK", "WH", "BO", "HQ", "DRIVER"].includes(b.code)).map((b) => b.name);

describe("where a CK delivery can be sent", () => {
  it("offers every Dubai restaurant", () => {
    expect(DESTINATIONS("dubai")).toEqual([
      "Business Bay", "JLT", "Arjan", "Al Mina", "Al Barsha",
    ]);
  });

  it("offers every Manila restaurant, and no kitchen or office", () => {
    expect(DESTINATIONS("manila")).toEqual(["Paranaque", "Cubao", "Taft"]);
  });
});

describe("the currency on a delivery note", () => {
  it("is the currency of the city that signs it", () => {
    expect(currencyOf("dubai").code).toBe("AED");
    expect(currencyOf("manila").code).toBe("PHP");
    expect(money("dubai", 116.54)).toBe("AED 116.54");
    expect(money("manila", 1234)).toBe("₱ 1,234.00");
  });

  it("falls back to Manila when the city is missing, as the data does", () => {
    expect(currencyOf(undefined).code).toBe("PHP");
    expect(currencyOf("").code).toBe("PHP");
  });
});
