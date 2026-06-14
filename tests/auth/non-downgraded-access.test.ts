import { describe, it, expect } from "vitest";
import { nonDowngradedAccess, type Auth } from "@/lib/auth";

const auth = (role: string, permissions: string[]): Auth =>
  ({ staffName: "Test", city: "dubai", role, permissions } as Auth);

describe("nonDowngradedAccess", () => {
  it("does NOT downgrade a privileged session to STAFF on a transient response", () => {
    const out = nonDowngradedAccess(auth("HQ", ["*"]), "STAFF", []);
    expect(out.role).toBe("HQ");
    expect(out.permissions).toEqual(["*"]);
  });

  it("does NOT drop role/permissions when the response is empty", () => {
    const out = nonDowngradedAccess(auth("HQ", ["*"]), undefined, []);
    expect(out.role).toBe("HQ");
    expect(out.permissions).toEqual(["*"]);
  });

  it("keeps the '*' permission if the incoming set lost it", () => {
    const out = nonDowngradedAccess(auth("HQ", ["*"]), "HQ", ["channel.admin.dashboard.view"]);
    expect(out.permissions).toEqual(["*"]);
  });

  it("keeps current permissions if incoming is empty but current had some", () => {
    const out = nonDowngradedAccess(auth("HR_MANAGER", ["channel.admin.staff.view"]), "HR_MANAGER", []);
    expect(out.permissions).toEqual(["channel.admin.staff.view"]);
  });

  it("ALLOWS an upgrade from STAFF to a privileged role", () => {
    const out = nonDowngradedAccess(auth("STAFF", []), "HQ", ["*"]);
    expect(out.role).toBe("HQ");
    expect(out.permissions).toEqual(["*"]);
  });

  it("accepts a legitimate non-reducing permission change", () => {
    const out = nonDowngradedAccess(
      auth("HR_MANAGER", ["a"]),
      "HR_MANAGER",
      ["a", "b"],
    );
    expect(out.permissions).toEqual(["a", "b"]);
  });

  it("falls back to STAFF when both current and incoming are unset", () => {
    const out = nonDowngradedAccess({ staffName: "X", city: "dubai" } as Auth, undefined, []);
    expect(out.role).toBe("STAFF");
    expect(out.permissions).toEqual([]);
  });
});
