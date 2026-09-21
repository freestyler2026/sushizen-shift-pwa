// tests/admin/disposal/disposal-report-date.test.tsx
//
// Which day a disposal entry belongs to.
//
// The logbook operation enters the whole day at closing, and closing runs past
// midnight — the measured median submission is 00:16. With the phone's calendar
// date as the default, the night is filed against the day that has only just
// started, and the day that was actually worked stays "missing" for ever. No
// deadline fixes that: the date is wrong, not late.
//
// Five reports in the last 60 days already carry that shape (PAR 9/20 and 9/22,
// TAFT 9/16 and 9/19, CUB 9/14, all filed 00:07–01:03 under their own filing
// date). Under the logbook it would have become most nights.
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { routerMock } from "../../setup";

vi.mock("next/navigation", () => routerMock());
vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));
vi.mock("@/lib/api", () => ({ API_BASE: "" }));
vi.mock("@/lib/auth", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...real,
    getAuth: () => ({ staffName: "Jay Nishimura", city: "manila", role: "ADMIN",
                      accessToken: "tok" }),
    getAuthHeaders: () => ({ "Content-Type": "application/json" }),
    getUploadHeaders: () => ({}),
  };
});

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;
global.confirm = vi.fn(() => false);
global.alert = vi.fn();

function ok(body: unknown) {
  return Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);
}

beforeEach(() => {
  try { localStorage.clear(); } catch { /* jsdom without storage */ }
  mockFetch.mockReset();
  mockFetch.mockImplementation(() => ok({ reports: [], items: [], rows: [], stats: {} }));
});
afterEach(() => vi.useRealTimers());

/** The date box, whatever it is labelled. */
async function dateBox(): Promise<HTMLInputElement> {
  const Page = (await import("@/app/admin/disposal/page")).default;
  render(<Page />);
  return await waitFor(() => {
    const el = document.querySelector('input[type="date"]') as HTMLInputElement | null;
    if (!el) throw new Error("no date input yet");
    return el;
  });
}

describe("Disposal Report — the day an entry belongs to", () => {
  it("files the night under the day that was worked, not the one that just started", async () => {
    // 00:42 local, which is when PAR actually filed on 22 September.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 8, 22, 0, 42, 0));
    expect((await dateBox()).value).toBe("2026-09-21");
  });

  it("says why the box disagrees with the phone's clock", async () => {
    // A box that shows yesterday without explaining is a box people "correct"
    // back to the wrong day.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 8, 22, 0, 42, 0));
    await dateBox();
    expect(screen.getByText(/past midnight, so this is filed under the day the shift belongs to/i))
      .toBeTruthy();
  });

  it("changes nothing during the day", async () => {
    // The 05:00 boundary sits five hours before the earliest ordinary daytime
    // entry, so nobody filing in the morning sees a different date.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 8, 22, 8, 15, 0));
    expect((await dateBox()).value).toBe("2026-09-22");
    expect(screen.queryByText(/past midnight/i)).toBeNull();
  });

  it("holds at the boundary itself", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 8, 22, 4, 59, 0));
    expect((await dateBox()).value).toBe("2026-09-21");
  });

  it("is the calendar day again from 05:00", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 8, 22, 5, 0, 0));
    expect((await dateBox()).value).toBe("2026-09-22");
  });

  it("crosses a month end without inventing a day", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 9, 1, 0, 30, 0));   // 1 October 00:30
    expect((await dateBox()).value).toBe("2026-09-30");
  });
});
