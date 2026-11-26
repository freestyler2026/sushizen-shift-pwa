/**
 * HQ, 2026-11-26: the red list in the inbox showed November only and nothing
 * of December, and HQ wants to see who else is off in a month before answering
 * a request. Days off by month lists every day asked off, approved or waiting,
 * and moves a month at a time.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lucideMock } from "../lucide-mock";

vi.mock("lucide-react", () => lucideMock());
vi.mock("@/lib/auth", () => ({ getAuthHeaders: () => ({}) }));
vi.mock("@/lib/date", () => ({ isoToday: () => "2026-11-26" }));

const NOV = [
  { request_id: "a", staff_name: "Maryson S. Galvez", branch: "TAFT", request_type: "day_off",
    work_date: "2026-11-22", request_span: "2026-11-05 → 2026-11-22 (18 days)", days: 18,
    state: "approved", manager_status: "APPROVED", hq_status: "APPROVED", requested_on: "2026-11-05",
    still_rostered: true },
  { request_id: "b", staff_name: "Victoria Lim", branch: "", request_type: "day_off",
    work_date: "2026-11-22", request_span: "2026-11-22", days: 1,
    state: "pending", manager_status: "APPROVED", hq_status: "PENDING", requested_on: "2026-11-01",
    still_rostered: false },
];

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("DayOffMonth", () => {
  it("lists the month's days off and moves to the next month", async () => {
    const f = vi.fn(async (url: string) => ({
      ok: true, status: 200,
      json: async () => ({ items: url.includes("month=2026-11") ? NOV : [] }),
    }));
    vi.stubGlobal("fetch", f);
    const DayOffMonth = (await import("@/components/request/DayOffMonth")).default;
    render(<DayOffMonth city="manila" />);
    await screen.findByText("Maryson S. Galvez");
    const box = screen.getByTestId("day-off-month");
    expect(screen.getByTestId("day-off-month-label").textContent).toBe("November 2026");
    expect(box.textContent).toMatch(/Sun 22/);
    expect(box.textContent).toMatch(/approved · 18 days · still rostered/);
    expect(box.textContent).toMatch(/Victoria Lim · waiting: HQ/);
    expect(box.textContent).toMatch(/1 approved · 1 waiting/);
    fireEvent.click(screen.getByLabelText("Next month"));
    await waitFor(() => expect(screen.getByTestId("day-off-month-label").textContent).toBe("December 2026"));
    expect(f.mock.calls.at(-1)![0]).toContain("city=manila&month=2026-12");
    await screen.findByText(/Nobody has asked for a day off in December 2026/);
  });

  it("says so when the month cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) })));
    const DayOffMonth = (await import("@/components/request/DayOffMonth")).default;
    render(<DayOffMonth city="manila" />);
    await screen.findByText(/Could not load this month/);
  });

  it("crosses the year", async () => {
    const { shiftMonth } = await import("@/components/request/DayOffMonth");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
  });
});
