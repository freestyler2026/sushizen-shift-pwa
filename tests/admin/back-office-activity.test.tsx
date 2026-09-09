// tests/admin/back-office-activity.test.tsx
//
// This page reports on people, so the two things worth testing are who can open
// it and whether it can say somebody did nothing when nobody was watching.
import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));

const mockGetAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  getAuth: () => mockGetAuth(),
  getAuthHeaders: () => ({}),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function row(over: Record<string, unknown> = {}) {
  return {
    staff_name: "Test Person", city: "manila", branch_code: "BO", role: "STAFF",
    signed_in: true, sessions: 1,
    login_at: "2026-09-10T01:00:00+00:00", first_action_at: "2026-09-10T01:05:00+00:00",
    last_action_at: "2026-09-10T09:00:00+00:00",
    span_minutes: 480, active_minutes: 30, idle_minutes: 450,
    longest_idle_minutes: 200, events: 40, screens: 10, reads: 30, writes: 0,
    distinct_screens: 4, buckets: new Array(48).fill(0), busiest_slot_share: 0.2,
    partial: false, observed_from: null, shift: null, clock_in: null, clock_out: null,
    flags: ["LONG_IDLE", "MOSTLY_IDLE", "NO_DECISIONS"], ...over,
  };
}

function report(rows: unknown[], over: Record<string, unknown> = {}) {
  return {
    date: "2026-09-10", idle_gap_minutes: 10,
    rules: {
      LONG_IDLE: { minutes: 120, says: "Two hours or more with no action." },
      MOSTLY_IDLE: { says: "Engaged for under a quarter of it." },
      NO_DECISIONS: { says: "Opened twenty or more things and changed none." },
    },
    coverage: {
      log_from: "2026-09-09T14:31:00+00:00", log_to: "2026-09-10T09:00:00+00:00",
      log_rows: 5000, partial_rows: 0,
      shift_reference: { manila: true, dubai: false },
      clock_reference: { manila: true, dubai: false },
    },
    rows, ...over,
  };
}

function ok(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
}

beforeEach(() => {
  mockGetAuth.mockReset();
  mockFetch.mockReset();
  mockFetch.mockImplementation(() => ok(report([row()])));
});
afterEach(() => vi.resetModules());

async function renderPage() {
  const Page = (await import("@/app/admin/back-office-activity/page")).default;
  render(<Page />);
}

describe("who may open the back-office report", () => {
  it("opens for the two named accounts", async () => {
    mockGetAuth.mockReturnValue({ staffName: "Yukihiro Nishimura", role: "HQ" });
    await renderPage();
    expect(await screen.findByText("Back office — the shape of the day")).toBeTruthy();

    mockGetAuth.mockReturnValue({ staffName: "Ayako Nishimura", role: "HQ" });
    vi.resetModules();
    await renderPage();
    expect(await screen.findAllByText("Back office — the shape of the day")).toBeTruthy();
  });

  it("refuses another HQ account", async () => {
    // The point of the page: HQ is not the door. Two names are.
    mockGetAuth.mockReturnValue({ staffName: "Yuri Yamada", role: "HQ" });
    await renderPage();
    expect(await screen.findByText("Not available")).toBeTruthy();
    expect(screen.queryByText("Back office — the shape of the day")).toBeNull();
    // and it does not even ask the server
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("refuses an ADMIN account", async () => {
    mockGetAuth.mockReturnValue({ staffName: "Ruby Rosa Rongcales", role: "ADMIN" });
    await renderPage();
    expect(await screen.findByText("Not available")).toBeTruthy();
  });

  it("says so when the server refuses, rather than showing an empty table", async () => {
    mockGetAuth.mockReturnValue({ staffName: "Yukihiro Nishimura", role: "HQ" });
    mockFetch.mockImplementation(() =>
      Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) } as Response));
    await renderPage();
    expect(await screen.findByText(/not available to your account/i)).toBeTruthy();
  });
});

describe("what the page refuses to claim", () => {
  beforeEach(() => mockGetAuth.mockReturnValue({ staffName: "Yukihiro Nishimura", role: "HQ" }));

  it("puts the limits above the table, not in a footnote", async () => {
    await renderPage();
    expect(await screen.findByText(/Read this before acting on a row/)).toBeTruthy();
    expect(screen.getByText(/a quiet row is/)).toBeTruthy();
    expect(screen.getByText(/Dubai HQ has/)).toBeTruthy();
  });

  it("marks a row as partial instead of calling the unwatched hours idle", async () => {
    mockFetch.mockImplementation(() => ok(report([
      row({ staff_name: "Early Riser", partial: true, flags: [],
            observed_from: "2026-09-10T06:00:00+00:00" }),
    ])));
    await renderPage();
    expect(await screen.findByText(/their day began before recording did/)).toBeTruthy();
    // No flag is asserted about a window nobody was watching. Scoped to the
    // person's own row: the legend at the foot of the page lists every flag by
    // design, and asserting on the whole document would match that instead.
    const cell = screen.getByText("Early Riser").closest("td")!;
    expect(within(cell).queryByText("long idle")).toBeNull();
    expect(within(cell).queryByText("mostly idle")).toBeNull();
    expect(within(cell).queryByText("no decisions")).toBeNull();
  });

  it("prints the rule behind every flag it shows", async () => {
    await renderPage();
    expect(await screen.findByText("What each flag means")).toBeTruthy();
    expect(screen.getByText("Two hours or more with no action.")).toBeTruthy();
    expect(screen.getByText("Opened twenty or more things and changed none.")).toBeTruthy();
  });

  it("counts the people it could only partly watch", async () => {
    mockFetch.mockImplementation(() => ok(report([
      row({ staff_name: "A", partial: true, flags: [] }),
      row({ staff_name: "B", partial: true, flags: [] }),
      row({ staff_name: "C" }),
    ])));
    await renderPage();
    await screen.findByText("Only partly watched");
    const card = screen.getByText("Only partly watched").parentElement!;
    expect(card.textContent).toContain("2");
  });
});
