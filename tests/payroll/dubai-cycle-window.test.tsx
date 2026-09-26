/**
 * Tests for the cycle card on /admin/payroll/dubai/page.tsx.
 *
 * Dubai pays the 26th to the 25th, so "September 2026" is a label and not a
 * date range. The card has to say which days the cycle actually pays for, or
 * nobody can check a figure against the DTR — and it must not assert a range
 * for the older cycles, which recorded none and were not one single span
 * (August paid the monthly staff to 08-25 and the hourly staff to 08-31).
 */
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { setAdminAuth } from "../setup";
import { buildFetchMock } from "../helpers/fetch-mock";

const CYCLES = "/api/admin/payroll/cycles";
const PERIODS = "/api/admin/dubai-payroll/periods";

/** 2026-09: the one cycle that carries two windows. */
const SEPTEMBER = {
  id: 41, city: "dubai", year: 2026, month: 9, status: "open",
  closed_at: null, created_at: "2026-09-01T00:00:00Z",
  period_start: "2026-08-26", period_end: "2026-09-25",
  hourly_period_start: "2026-09-01", hourly_period_end: "2026-09-25",
};

/** 2026-10 onward: one window for everybody, hourly columns back to null. */
const OCTOBER = {
  ...SEPTEMBER, id: 42, month: 10,
  period_start: "2026-09-26", period_end: "2026-10-25",
  hourly_period_start: null, hourly_period_end: null,
};

/** Opened before the window existed; its real span is not recoverable. */
const LEGACY = {
  ...SEPTEMBER, id: 38, month: 8, status: "closed",
  period_start: null, period_end: null,
  hourly_period_start: null, hourly_period_end: null,
};

function mount(cycles: unknown[]) {
  vi.stubGlobal("fetch", buildFetchMock([
    { match: CYCLES, body: { cycles } },
    { match: PERIODS, body: { periods: [] } },
  ]));
  return import("../../src/app/admin/payroll/dubai/page");
}

describe("Dubai payroll — the days a cycle pays for", () => {
  beforeEach(() => setAdminAuth("dubai"));

  it("names the days, not just the month", async () => {
    const { default: Page } = await mount([SEPTEMBER]);
    render(<Page />);
    await waitFor(() => {
      expect(screen.getByText(/Pays for 2026-08-26/)).toBeTruthy();
    });
    // Both windows end on 2026-09-25, so the date appears twice — once for
    // the cycle and once for the hourly staff. October starts on 09-26 for
    // everybody, which is the property that keeps the seam clean.
    expect(screen.getAllByText(/2026-09-25/)).toHaveLength(2);
  });

  it("shows the hourly staff's separate window when the cycle has one", async () => {
    const { default: Page } = await mount([SEPTEMBER]);
    render(<Page />);
    await waitFor(() => {
      expect(screen.getByText(/hourly staff 2026-09-01/)).toBeTruthy();
    });
  });

  it("says nothing about an hourly window when both groups share one", async () => {
    // From October the hourly columns are null, meaning "same as the cycle".
    // Printing a second range there would invent a distinction.
    const { default: Page } = await mount([OCTOBER]);
    render(<Page />);
    await waitFor(() => expect(screen.getByText(/Pays for 2026-09-26/)).toBeTruthy());
    expect(screen.queryByText(/hourly staff/)).toBeNull();
  });

  it("does not assert a range for a cycle that recorded none", async () => {
    // The old behaviour would compute 2026-08-01 – 2026-08-31 from the name,
    // which is not what August paid the monthly staff.
    const { default: Page } = await mount([LEGACY]);
    render(<Page />);
    await waitFor(() => expect(screen.getByText(/Period not recorded/)).toBeTruthy());
    expect(screen.queryByText(/Pays for/)).toBeNull();
    expect(screen.queryByText(/2026-08-01/)).toBeNull();
  });

  it("keeps each cycle's window on its own card", async () => {
    const { default: Page } = await mount([SEPTEMBER, OCTOBER, LEGACY]);
    render(<Page />);
    await waitFor(() => {
      expect(screen.getByText(/Pays for 2026-08-26/)).toBeTruthy();
      expect(screen.getByText(/Pays for 2026-09-26/)).toBeTruthy();
      expect(screen.getByText(/Period not recorded/)).toBeTruthy();
    });
  });
});
