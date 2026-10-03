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

import { INVENTORY_CITY, withCity } from "@/lib/daily-inventory-city";

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
    expect(SOURCE).toContain("fetch(withCity(url)");
  });

  it("appends to a path that already has a query", () => {
    expect(withCity("/api/daily-inventory/items")).toBe("/api/daily-inventory/items?city=manila");
    expect(withCity("/api/daily-inventory/items?source_type=ck")).toBe(
      "/api/daily-inventory/items?source_type=ck&city=manila",
    );
  });

  it("leaves a path that already names a city alone", () => {
    expect(withCity("/api/daily-inventory/items?city=dubai")).toBe(
      "/api/daily-inventory/items?city=dubai",
    );
  });

  it("does not touch paths that are not ours", () => {
    expect(withCity("/api/admin/overview")).toBe("/api/admin/overview");
    expect(withCity("/api/store/procurement/request")).toBe("/api/store/procurement/request");
  });

  it("is manila until phase 2 loads Dubai's items", () => {
    expect(INVENTORY_CITY).toBe("manila");
  });
});
