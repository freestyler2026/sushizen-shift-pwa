/**
 * Every Daily Inventory request from this screen says which city it is about.
 *
 * The backend falls back to the caller's token when no city is given. All four
 * HQ accounts -- the owner, Yusuke, Yuri and Ayako -- are registered in Dubai,
 * so a call that forgets the parameter serves them Dubai's empty list. Replace
 * mode is worse than empty: it deactivates every active item not in the file,
 * and without a city it would pick the wrong city's items to switch off.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

import { EVERY_CITY, asInventoryCity, withCity, worksInEveryCity } from "@/lib/daily-inventory-city";

const SOURCE = readFileSync(
  join(__dirname, "..", "src", "components", "admin", "AdminDailyInventoryTab.tsx"),
  "utf8",
);

/** Lines holding a request, minus the helper's own definition. */
function requestLines(): string[] {
  const helperStart = SOURCE.indexOf("function withCity");
  const helperEnd = SOURCE.indexOf("\n}", helperStart);
  const body = SOURCE.slice(0, helperStart) + SOURCE.slice(helperEnd);
  return body
    .split("\n")
    .filter((l) => /\b(apiFetch|fetch)\s*\(/.test(l) && l.includes("/api/daily-inventory"));
}

describe("the Daily Inventory screen names its city", () => {
  it("has requests to check", () => {
    // A pass earned by the calls having moved elsewhere would be worthless.
    expect(requestLines().length).toBeGreaterThanOrEqual(40);
  });

  it("routes every request through withCity", () => {
    const bare = requestLines().filter((l) => !l.includes("withCity"));
    expect(bare, `requests without a city:\n${bare.join("\n")}`).toEqual([]);
  });

  it("wraps the one request that builds its URL in a variable", () => {
    // Replace mode. The literal is on an earlier line than the call, so a check
    // that only reads the call line would miss exactly the dangerous one.
    expect(SOURCE).toContain("fetch(withCity(url, city)");
  });

  it("appends to a path that already has a query", () => {
    expect(withCity("/api/daily-inventory/items", "manila")).toBe("/api/daily-inventory/items?city=manila");
    expect(withCity("/api/daily-inventory/items?source_type=ck", "dubai")).toBe(
      "/api/daily-inventory/items?source_type=ck&city=dubai",
    );
  });

  it("leaves a path that already names a city alone", () => {
    expect(withCity("/api/daily-inventory/items?city=dubai", "manila")).toBe(
      "/api/daily-inventory/items?city=dubai",
    );
  });

  it("does not touch paths that are not ours", () => {
    expect(withCity("/api/admin/overview", "dubai")).toBe("/api/admin/overview");
    expect(withCity("/api/store/procurement/request", "dubai")).toBe("/api/store/procurement/request");
  });

  it("reads a city off the signed-in user, defaulting to manila", () => {
    expect(asInventoryCity("dubai")).toBe("dubai");
    expect(asInventoryCity("Dubai")).toBe("dubai");
    expect(asInventoryCity("manila")).toBe("manila");
    expect(asInventoryCity(null)).toBe("manila");
    expect(asInventoryCity("")).toBe("manila");
  });

  it("every request passes a city it was given, never a constant", () => {
    // The constant was the bug: a Dubai branch was selected on screen and every
    // request still said manila, so the screen showed Manila's items.
    // The constant is gone from the code; the only place the name may still
    // appear is a comment explaining why (lesson 139), so this looks for a use
    // rather than for the word.
    expect(SOURCE).not.toMatch(/INVENTORY_CITY[^/\n]*[),;]/);
    const bare = requestLines().filter((l) => /withCity\([^)]*\)[^,]/.test(l) && !l.includes(", city"));
    expect(bare, `withCity without a city:\n${bare.join("\n")}`).toEqual([]);
  });
});

describe("a person who works in both cities", () => {
  it("is HQ and ADMIN, matching the server's cities_for()", () => {
    expect(worksInEveryCity("HQ")).toBe(true);
    expect(worksInEveryCity("admin")).toBe(true);
    expect(worksInEveryCity("DUBAI_MANAGEMENT")).toBe(false);
    expect(worksInEveryCity("MANILA_MANAGEMENT")).toBe(false);
    expect(worksInEveryCity("STAFF")).toBe(false);
    expect(worksInEveryCity(null)).toBe(false);
  });

  it("can ask for every city, and the parameter survives withCity", () => {
    expect(withCity("/api/daily-inventory/items", EVERY_CITY))
      .toBe("/api/daily-inventory/items?city=all");
  });

  it("still cannot overwrite a city the caller already named", () => {
    // A branch names the city; "all" must not override what was decided.
    expect(withCity("/api/daily-inventory/items?city=manila", EVERY_CITY))
      .toBe("/api/daily-inventory/items?city=manila");
  });
});
