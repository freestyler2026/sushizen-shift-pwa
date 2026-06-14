import { describe, it, expect } from "vitest";
import {
  isActiveRequest,
  isRejectedRequest,
  matchesStatusFilter,
  selectDisplayedRequests,
  isCkDispatchVisible,
  type ProcurementStatusRow,
} from "@/lib/procurementStatus";

const row = (status: string, receiving_status = ""): ProcurementStatusRow => ({ status, receiving_status });

describe("isActiveRequest", () => {
  it("keeps in-progress statuses", () => {
    for (const s of ["DRAFT", "IN_REVIEW", "SUBMITTED", "APPROVED", "RETURNED"]) {
      expect(isActiveRequest(row(s))).toBe(true);
    }
  });
  it("excludes terminal statuses (incl. REJECTED)", () => {
    for (const s of ["CLOSED", "RECEIVED", "CANCELLED", "REJECTED", "PURCHASED"]) {
      expect(isActiveRequest(row(s))).toBe(false);
    }
  });
  it("excludes rows whose receiving/claim is done", () => {
    expect(isActiveRequest(row("APPROVED", "CONFIRMED"))).toBe(false);
    expect(isActiveRequest(row("APPROVED", "CLAIM_REVIEW"))).toBe(false);
  });
  it("is case-insensitive", () => {
    expect(isActiveRequest(row("rejected"))).toBe(false);
    expect(isActiveRequest(row("draft"))).toBe(true);
  });
});

describe("isRejectedRequest", () => {
  it("detects REJECTED only (case-insensitive)", () => {
    expect(isRejectedRequest(row("REJECTED"))).toBe(true);
    expect(isRejectedRequest(row("rejected"))).toBe(true);
    expect(isRejectedRequest(row("RETURNED"))).toBe(false);
    expect(isRejectedRequest(row("APPROVED"))).toBe(false);
  });
});

describe("matchesStatusFilter", () => {
  it("treats IN_REVIEW and SUBMITTED as the same bucket", () => {
    expect(matchesStatusFilter(row("IN_REVIEW"), "IN_REVIEW")).toBe(true);
    expect(matchesStatusFilter(row("SUBMITTED"), "IN_REVIEW")).toBe(true);
    expect(matchesStatusFilter(row("APPROVED"), "IN_REVIEW")).toBe(false);
  });
  it("matches exact status for other buckets", () => {
    expect(matchesStatusFilter(row("APPROVED"), "APPROVED")).toBe(true);
    expect(matchesStatusFilter(row("DRAFT"), "APPROVED")).toBe(false);
  });
});

describe("selectDisplayedRequests", () => {
  const active = [row("DRAFT"), row("IN_REVIEW"), row("SUBMITTED"), row("APPROVED"), row("RETURNED")];
  const rejected = [row("REJECTED"), row("REJECTED")];

  it("returns the rejected bucket when filter = REJECTED", () => {
    expect(selectDisplayedRequests(active, rejected, "REJECTED")).toBe(rejected);
  });
  it("returns all active rows when no filter", () => {
    expect(selectDisplayedRequests(active, rejected, null)).toBe(active);
  });
  it("filters active rows by bucket (IN_REVIEW includes SUBMITTED)", () => {
    const out = selectDisplayedRequests(active, rejected, "IN_REVIEW");
    expect(out).toHaveLength(2);
  });
  it("does not leak rejected rows into a non-rejected filter", () => {
    const out = selectDisplayedRequests(active, rejected, "APPROVED");
    expect(out.every((r) => String(r.status).toUpperCase() === "APPROVED")).toBe(true);
  });
});

describe("isCkDispatchVisible", () => {
  it("hides CK Dispatch for Dubai (case-insensitive)", () => {
    expect(isCkDispatchVisible("dubai")).toBe(false);
    expect(isCkDispatchVisible("Dubai")).toBe(false);
  });
  it("shows CK Dispatch for Manila / unknown", () => {
    expect(isCkDispatchVisible("manila")).toBe(true);
    expect(isCkDispatchVisible("")).toBe(true);
    expect(isCkDispatchVisible(null)).toBe(true);
  });
});
