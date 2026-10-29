import { describe, expect, it } from "vitest";
import { canonicalBranch, sameBranch } from "@/lib/dubai-branch";

describe("the Dubai branch with two names", () => {
  it("folds Al Hudaiba into Al Mina, the name the rest of the OS uses", () => {
    expect(canonicalBranch("Al Hudaiba")).toBe("Al Mina");
    expect(canonicalBranch("Al Mina")).toBe("Al Mina");
    expect(canonicalBranch("al hudaiba")).toBe("Al Mina");
  });

  it("leaves every other branch alone", () => {
    for (const b of ["JLT", "Arjan", "Al Barsha", "Business Bay", "CK", "Delivery"]) {
      expect(canonicalBranch(b)).toBe(b);
    }
  });

  it("matches a row to the branch the person picked, under either spelling", () => {
    // This is the whole point: picking one name used to return 177 rows and hide
    // 615, with no selection that reached them.
    expect(sameBranch("Al Mina", "Al Hudaiba")).toBe(true);
    expect(sameBranch("Al Hudaiba", "Al Mina")).toBe(true);
    expect(sameBranch("Al Mina", "Al Mina")).toBe(true);
  });

  it("does not match different branches", () => {
    expect(sameBranch("Al Mina", "JLT")).toBe(false);
    expect(sameBranch("Arjan", "Al Barsha")).toBe(false);
  });

  it("survives null and blank", () => {
    expect(canonicalBranch(null)).toBe("");
    expect(canonicalBranch(undefined)).toBe("");
    expect(sameBranch(null, null)).toBe(true);
    expect(sameBranch("Al Mina", null)).toBe(false);
  });
});
