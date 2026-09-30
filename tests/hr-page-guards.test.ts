/**
 * A page guard that tests role names only makes Role Management a lie.
 *
 * 2026-09-30: HR Onboarding checked ALLOWED_ROLES and nothing else. Camilla
 * Gadingan resolves to HR_STAFF, which is not on that list, and holds
 * channel.admin.hr_onboarding.view — granted through Role Management. She was
 * refused, and because the refusal path never set accessToken or hasSession,
 * the Access Denied screen did not render either: the page drew an empty list
 * and told her "No records found" while 20 records sat in the table.
 *
 * Three sibling pages already paired the list with hasRouteAccess. Only this
 * one was missed, which is why the report named one page.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const PAGES: Array<[string, string]> = [
  ["src/app/admin/hr/onboarding/page.tsx", "/admin/hr/onboarding"],
  ["src/app/admin/hr/recruitment/page.tsx", "/admin/hr/recruitment"],
  ["src/app/admin/hr/performance/page.tsx", "/admin/hr/performance"],
  ["src/app/admin/hr/separation/page.tsx", "/admin/hr/separation"],
];

describe("HR page guards", () => {
  it.each(PAGES)("%s pairs its role list with the route permission", (file, route) => {
    const src = readFileSync(join(ROOT, file), "utf8");
    expect(src).toContain("ALLOWED_ROLES");
    expect(src, `${file} must accept the Role Management permission for ${route}`)
      .toContain(`hasRouteAccess("${route}"`);
    // The permission is an extra way in, never the only check.
    expect(src).toMatch(/ALLOWED_ROLES\.includes\(role\)\s*&&\s*!hasRouteAccess/);
  });

  it("onboarding shows the refusal instead of an empty list", () => {
    const src = readFileSync(join(ROOT, PAGES[0][0]), "utf8");
    const denial = src.split("!hasRouteAccess(\"/admin/hr/onboarding\", a)")[1].split("return;")[0];
    // Access Denied renders only when one of these is set. Leaving them unset
    // is what turned a refusal into "No records found".
    expect(denial).toContain("setAccessToken");
    expect(denial).toContain("setHasSession");
  });
});
