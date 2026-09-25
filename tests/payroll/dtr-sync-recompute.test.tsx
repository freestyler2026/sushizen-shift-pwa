// tests/payroll/dtr-sync-recompute.test.tsx
//
// Correcting the DTR did not change anybody's pay — compute_payroll_run was
// only reachable from the payroll screen, so a shift fixed in the morning left
// the pay slip, and the SSS basis read off it, on yesterday's figures. The sync
// rebuilds it now. This is the half that makes it visible: a rebuild nobody can
// see is the same failure in a different place (lessons 55, 58).
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import RecomputeSummary from "@/components/payroll/RecomputeSummary";

describe("DTR sync — what it did to pay", () => {
  it("names the people whose pay moved, and by how much", () => {
    render(<RecomputeSummary result={{
      summary: { recomputed: 2, changed: 1, held_back: 0, no_run: 0 },
      recomputed: [
        { staff_name: "Lynde B. Ore", period: "2026-09-1H", gross_delta: 250.5, net_delta: 231.4 },
        { staff_name: "Mona Medrano", period: "2026-09-1H", gross_delta: 0, net_delta: 0 },
      ],
      held_back: [], no_run: [],
    }} />);
    expect(screen.getByText(/1 of 2 pay slips changed/i)).toBeTruthy();
    expect(screen.getByText(/Lynde B\. Ore · 2026-09-1H/)).toBeTruthy();
    expect(screen.getByText(/net \+231\.40/)).toBeTruthy();
    // a slip that did not move is not listed as though it had
    expect(screen.queryByText(/Mona Medrano/)).toBeNull();
  });

  it("shows a fall in pay as a fall, not as a gain", () => {
    render(<RecomputeSummary result={{
      summary: { recomputed: 1, changed: 1, held_back: 0, no_run: 0 },
      recomputed: [{ staff_name: "Gessa Gregorio", period: "2026-09-1H", gross_delta: -110, net_delta: -98.25 }],
    }} />);
    const el = screen.getByText(/net -98\.25/);
    expect(el.className).toContain("amber");
  });

  it("says which months were left alone, and why", () => {
    render(<RecomputeSummary result={{
      summary: { recomputed: 0, changed: 0, held_back: 1, no_run: 0 },
      recomputed: [], no_run: [],
      held_back: [{ staff_name: "Rhemar Guerrero", period: "2026-08-2H",
                    reason: "this month closed before the one being paid now" }],
    }} />);
    expect(screen.getByText(/need a deliberate Recompute/i)).toBeTruthy();
    expect(screen.getByText(/Rhemar Guerrero · 2026-08-2H/)).toBeTruthy();
    expect(screen.getByText(/closed before the one being paid now/)).toBeTruthy();
  });

  it("does not report a failed rebuild as a successful one", () => {
    render(<RecomputeSummary result={{ error: "connection lost" }} />);
    expect(screen.getByText(/was/)).toBeTruthy();
    expect(screen.getByText(/not/)).toBeTruthy();
    expect(screen.queryByText(/pay slips changed/i)).toBeNull();
  });

  it("explains an empty rebuild instead of showing nothing", () => {
    render(<RecomputeSummary result={{
      summary: { recomputed: 0, changed: 0, held_back: 0, no_run: 3 },
      recomputed: [], held_back: [],
      no_run: [1, 2, 3].map((i) => ({ staff_name: `P${i}`, reason: "no run exists yet" })),
    }} />);
    expect(screen.getByText(/have no pay run yet/i)).toBeTruthy();
  });

  it("shows nothing at all when the sync reported nothing", () => {
    const { container } = render(<RecomputeSummary result={null} />);
    expect(container.textContent).toBe("");
  });
});
