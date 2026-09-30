// tests/admin/overtime-late-entry.test.tsx
//
// Two things this page could not do until 2026-09-30, both reported from
// Manila on the same day.
//
// 1. Record overtime after the 48-hour window. The endpoint has existed since
//    2026-09-26 and nothing on any screen called it, so when the closing PIC
//    confirmed two nights that nobody had filed, the honest answer to "how do
//    we file this" was "you cannot".
// 2. Let the one person Role Management actually gave overtime to in. The
//    guard tested role names only; channel.admin.overtime.manage is held by a
//    single HR Staff account whose role is not on the list, and the server
//    accepts her.
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));

const mockGetAuth = vi.fn();
vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    getAuth: () => mockGetAuth(),
    refreshAuthFromApi: async () => mockGetAuth(),
  };
});

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import Page from "@/app/admin/overtime/page";

/** Camilla: HR_STAFF by role, granted the overtime channel in Role Management. */
const HR_STAFF = {
  staffName: "Camilla Gadingan", role: "HR_STAFF", city: "manila",
  accessToken: "t", hasSession: true,
  permissions: ["channel.admin.overtime.view", "channel.admin.overtime.manage"],
};

const NO_ACCESS = {
  staffName: "Someone Else", role: "STAFF", city: "manila",
  accessToken: "t", hasSession: true, permissions: [],
};

function respond(url: string) {
  if (url.includes("/overtime/list")) return { requests: [] };
  if (url.includes("staff_master/names")) return { ok: true, names: ["Reymar Contillo"] };
  if (url.includes("manila-payroll/periods")) {
    return [
      { id: 8, period_label: "2026-09-2H", start_date: "2026-09-11", end_date: "2026-09-25", status: "draft" },
      { id: 7, period_label: "2026-09-1H", start_date: "2026-08-26", end_date: "2026-09-10", status: "paid" },
    ];
  }
  return { ok: true };
}

beforeEach(() => {
  // waitFor polls on timers, so the clock has to keep moving while it is held.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-30T04:00:00Z")); // 12:00 in Manila
  mockGetAuth.mockReturnValue(HR_STAFF);
  mockFetch.mockImplementation((url: string) =>
    Promise.resolve({ ok: true, status: 200, json: async () => respond(String(url)) }));
});
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

async function openTheForm() {
  render(<Page />);
  await waitFor(() => expect(screen.getByText("Record late OT")).toBeTruthy());
  fireEvent.click(screen.getByText("Record late OT"));
  await waitFor(() => expect(screen.getByText("Record late overtime")).toBeTruthy());
}

describe("recording overtime the window has closed on", () => {
  it("lets the permission holder in, not only the role list", async () => {
    render(<Page />);
    await waitFor(() => expect(screen.queryByText(/Access denied/)).toBeNull());
  });

  it("still refuses someone with neither the role nor the permission", async () => {
    mockGetAuth.mockReturnValue(NO_ACCESS);
    render(<Page />);
    await waitFor(() => expect(screen.getByText(/Access denied/)).toBeTruthy());
  });

  it("sends the hours as a window on the work date, past midnight and all", async () => {
    await openTheForm();
    fireEvent.change(screen.getByLabelText("Who worked the hours"), { target: { value: "Reymar Contillo" } });
    fireEvent.change(screen.getByLabelText("Date worked"), { target: { value: "2026-09-16" } });
    // A closing shift that ran to 01:00 belongs to the 16th, not the 17th.
    fireEvent.change(screen.getByLabelText("Overtime started"), { target: { value: "23:00" } });
    fireEvent.change(screen.getByLabelText("Overtime ended"), { target: { value: "01:00" } });
    fireEvent.change(screen.getByLabelText("What the overtime was for"),
      { target: { value: "Closing ran long — confirmed by the closing PIC." } });
    fireEvent.change(screen.getByLabelText("Why it is being entered now"),
      { target: { value: "No manager on duty that night; raised with HR afterwards." } });
    const { chooseValue } = await import("#tests/select-dark");
    chooseValue("— Select —", "TAFT");

    fireEvent.click(screen.getByText("Record as pending"));
    await waitFor(() => {
      const call = mockFetch.mock.calls.find((c) => String(c[0]).includes("/overtime/late-entry"));
      expect(call, "nothing was posted").toBeTruthy();
      const body = JSON.parse(String((call![1] as RequestInit).body));
      expect(body.work_date).toBe("2026-09-16");
      expect(body.ot_start_hour).toBe(23);
      expect(body.ot_end_hour).toBe(25);   // 01:00 the next morning
      expect(body.city).toBe("manila");
      expect(body.late_entry_reason.length).toBeGreaterThanOrEqual(10);
    });
  });

  it("does not post a date the staff member can still file themselves", async () => {
    await openTheForm();
    fireEvent.change(screen.getByLabelText("Who worked the hours"), { target: { value: "Reymar Contillo" } });
    fireEvent.change(screen.getByLabelText("Date worked"), { target: { value: "2026-09-29" } });
    fireEvent.change(screen.getByLabelText("What the overtime was for"), { target: { value: "Closing ran long." } });
    fireEvent.change(screen.getByLabelText("Why it is being entered now"), { target: { value: "Testing the window." } });
    const { chooseValue } = await import("#tests/select-dark");
    chooseValue("— Select —", "TAFT");
    fireEvent.click(screen.getByText("Record as pending"));
    // Two places say it: the warning beside the date and the refusal on submit.
    await waitFor(() => expect(screen.getAllByText(/still inside the 48-hour window/).length).toBeGreaterThan(0));
    expect(mockFetch.mock.calls.some((c) => String(c[0]).includes("late-entry"))).toBe(false);
  });

  it("says a paid period cannot take the hours before they are typed", async () => {
    await openTheForm();
    fireEvent.change(screen.getByLabelText("Date worked"), { target: { value: "2026-09-05" } });
    await waitFor(() => expect(screen.getByText(/2026-09-1H has already been paid/)).toBeTruthy());
  });
});
