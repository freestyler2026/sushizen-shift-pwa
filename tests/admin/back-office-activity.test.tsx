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
    partial: false, unrecorded: false, observed_from: null, shift: null, rostered: true, day_complete: true, by_name: false,
    clock_in: null, clock_out: null,
    flags: ["LONG_IDLE", "MOSTLY_IDLE", "NO_DECISIONS"], ...over,
  };
}

function report(rows: unknown[], over: Record<string, unknown> = {}) {
  return {
    date: "2026-09-10", idle_gap_minutes: 10,
    rules: {
      LONG_IDLE: { minutes: 120, says: "2時間以上まったく操作がない空白があります。" },
      MOSTLY_IDLE: { says: "実際に手を動かしていたのはその1/4未満です。" },
      NO_DECISIONS: { says: "20件以上を開いて、1件も変更していません。" },
    },
    selection: {
      roles: ["HR_MANAGER", "ADMIN", "INVENTORY_PURCHASING"],
      city: "manila", individuals: ["Yuri Yamada"],
    },
    coverage: {
      log_from: "2026-09-09T14:31:00+00:00", log_to: "2026-09-10T09:00:00+00:00",
      log_rows: 5000, partial_rows: 0, people: 27, day_in_progress: 0, date_recorded: "full" as const,
      with_shift_reference: 24, without_shift_reference: 3,
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
    expect(await screen.findByText("バックオフィス — 1日のかたち")).toBeTruthy();

    mockGetAuth.mockReturnValue({ staffName: "Ayako Nishimura", role: "HQ" });
    vi.resetModules();
    await renderPage();
    expect(await screen.findAllByText("バックオフィス — 1日のかたち")).toBeTruthy();
  });

  it("refuses another HQ account", async () => {
    // The point of the page: HQ is not the door. Two names are.
    mockGetAuth.mockReturnValue({ staffName: "Yuri Yamada", role: "HQ" });
    await renderPage();
    expect(await screen.findByText("このページは表示できません")).toBeTruthy();
    expect(screen.queryByText("バックオフィス — 1日のかたち")).toBeNull();
    // and it does not even ask the server
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("refuses an ADMIN account", async () => {
    mockGetAuth.mockReturnValue({ staffName: "Ruby Rosa Rongcales", role: "ADMIN" });
    await renderPage();
    expect(await screen.findByText("このページは表示できません")).toBeTruthy();
  });

  it("says so when the server refuses, rather than showing an empty table", async () => {
    mockGetAuth.mockReturnValue({ staffName: "Yukihiro Nishimura", role: "HQ" });
    mockFetch.mockImplementation(() =>
      Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) } as Response));
    await renderPage();
    expect(await screen.findByText(/このアカウントではこのページを開けません/)).toBeTruthy();
  });
});

describe("what the page refuses to claim", () => {
  beforeEach(() => mockGetAuth.mockReturnValue({ staffName: "Yukihiro Nishimura", role: "HQ" }));

  it("puts the limits above the table, not in a footnote", async () => {
    await renderPage();
    expect(await screen.findByText(/行を根拠にする前に読んでください/)).toBeTruthy();
    expect(screen.getByText(/静かな行は、静かな1日の証拠ではありません/)).toBeTruthy();
    // the store-based purchasing caveat, and the one figure a person could inflate
    expect(screen.getByText(/は店舗勤務です/)).toBeTruthy();
    expect(screen.getByText(/ブラウザからの申告/)).toBeTruthy();
  });

  it("says how many people it cannot judge for a missing roster", async () => {
    await renderPage();
    expect(await screen.findByText(/公開シフトが/)).toBeTruthy();
  });

  it("names who is on the report and why", async () => {
    await renderPage();
    expect(await screen.findByText(/Inventory & Purchasing/)).toBeTruthy();
    expect(screen.getByText("Yuri Yamada")).toBeTruthy();
  });

  it("marks a rest day rather than counting it against anyone", async () => {
    mockFetch.mockImplementation(() => ok(report([
      row({ staff_name: "Day Off", signed_in: false, rostered: false, events: 0, flags: [] }),
    ])));
    await renderPage();
    expect(await screen.findByText("この日はシフトなし")).toBeTruthy();
    const cell = screen.getByText("Day Off").closest("td")!;
    expect(within(cell).queryByText("未ログイン")).toBeNull();
  });

  it("marks a row as partial instead of calling the unwatched hours idle", async () => {
    mockFetch.mockImplementation(() => ok(report([
      row({ staff_name: "Early Riser", partial: true, flags: [],
            observed_from: "2026-09-10T06:00:00+00:00" }),
    ])));
    await renderPage();
    expect(await screen.findByText(/この日は途中からしか見ていません/)).toBeTruthy();
    // No flag is asserted about a window nobody was watching. Scoped to the
    // person's own row: the legend at the foot of the page lists every flag by
    // design, and asserting on the whole document would match that instead.
    const cell = screen.getByText("Early Riser").closest("td")!;
    expect(within(cell).queryByText("長時間の空白")).toBeNull();
    expect(within(cell).queryByText("ほぼ無操作")).toBeNull();
    expect(within(cell).queryByText("変更ゼロ")).toBeNull();
  });

  it("prints the rule behind every flag it shows", async () => {
    await renderPage();
    expect(await screen.findByText("フラグの意味")).toBeTruthy();
    expect(screen.getByText("2時間以上まったく操作がない空白があります。")).toBeTruthy();
    expect(screen.getByText("20件以上を開いて、1件も変更していません。")).toBeTruthy();
  });

  it("counts the people whose day has not finished", async () => {
    mockFetch.mockImplementation(() => ok(report(
      [row({ staff_name: "A" }), row({ staff_name: "B" })],
      { coverage: { log_from: "2026-09-09T14:31:00+00:00", log_to: null, log_rows: 1,
                    partial_rows: 0, people: 2, day_in_progress: 2, date_recorded: "full" as const,
                    with_shift_reference: 2, without_shift_reference: 0 } })));
    await renderPage();
    await screen.findByText("まだ勤務中");
    const card = screen.getByText("まだ勤務中").parentElement!;
    expect(card.textContent).toContain("2");
  });

  it("says a day is unfinished on the row rather than showing an empty verdict", async () => {
    mockFetch.mockImplementation(() => ok(report([
      row({ staff_name: "Mid Shift", day_complete: false, flags: [] }),
    ])));
    await renderPage();
    expect(await screen.findByText(/勤務中 — まだ何も判定していません/)).toBeTruthy();
  });

  it("marks a person who is on the list by name, not by their role", async () => {
    // Yuri Yamada's role is HQ and HQ is not a selector. Without this the row
    // reads as though it were.
    mockFetch.mockImplementation(() => ok(report([
      row({ staff_name: "Yuri Yamada", role: "HQ", city: "dubai",
            branch_code: "HQ", by_name: true, flags: [] }),
    ])));
    await renderPage();
    expect(await screen.findByText("人名で追加")).toBeTruthy();
  });

  it("shows a dash, not a zero, for a date nothing was recording", async () => {
    // 2026-09-08 opened like this: real sign-in times beside 0m engaged, 0
    // screens, 0 changes. Sessions go back further than the activity log, so
    // it read as a floor of people who did nothing.
    mockFetch.mockImplementation(() => ok(report(
      [row({ staff_name: "Before The Log", unrecorded: true, partial: true,
             span_minutes: 0, active_minutes: 0, longest_idle_minutes: 0,
             screens: 0, reads: 0, writes: 0, events: 0, flags: [] })],
      { coverage: { log_from: "2026-09-09T14:31:00+00:00", log_to: null, log_rows: 1,
                    partial_rows: 1, people: 1, day_in_progress: 0,
                    date_recorded: "none" as const,
                    with_shift_reference: 1, without_shift_reference: 0 } })));
    await renderPage();
    // Scoped to the row: the banner above the table carries the same sentence,
    // and asserting on the document would pass with the row note still wrong.
    const tr = (await screen.findByText("Before The Log")).closest("tr")!;
    expect(within(tr).getByText("この日はまだ記録していません")).toBeTruthy();
    expect(within(tr).queryByText("この日は途中からしか見ていません")).toBeNull();
    expect(within(tr).queryByText("0m")).toBeNull();
    expect(within(tr).queryByText("0")).toBeNull();
    expect(within(tr).getAllByText("—").length).toBeGreaterThan(3);
  });

  it("says plainly that only the sign-in is knowable for such a date", async () => {
    mockFetch.mockImplementation(() => ok(report(
      [row({ staff_name: "X", unrecorded: true, flags: [] })],
      { coverage: { log_from: "2026-09-09T14:31:00+00:00", log_to: null, log_rows: 1,
                    partial_rows: 1, people: 1, day_in_progress: 0,
                    date_recorded: "none" as const,
                    with_shift_reference: 1, without_shift_reference: 0 } })));
    await renderPage();
    expect(await screen.findByText(/ログインの有無だけ/)).toBeTruthy();
    expect(screen.getByText(/0ではありません/)).toBeTruthy();
  });

  it("explains why a morning is not full of absences", async () => {
    await renderPage();
    expect(await screen.findByText(/その人の1日が終わるまで、フラグは1つも出しません/)).toBeTruthy();
  });
  it("warns that the three HQ rows run on a different clock", async () => {
    // They joined the roster on 2026-09-10. Their day is measured on the Dubai
    // clock, so a verdict arrives four hours after everyone else's, and a gap
    // of hours is their ordinary shape rather than a finding. A reader who
    // takes "long idle" on their row to mean what it means on an office row
    // has been misled by the page.
    await renderPage();
    const panel = await screen.findByText(/行を根拠にする前に読んでください/);
    const box = panel.parentElement!;
    expect(box.textContent).toMatch(/ドバイ時間で働いています/);
    expect(box.textContent).toMatch(/判定が出るのも4時間遅れます/);
    expect(box.textContent).toMatch(/数時間の空白は彼らの通常です/);
  });
  it("marks a login time that is really the first action of a carried-over session", async () => {
    // Sessions outlive the date they start on, so anybody whose shift ends
    // after midnight has no sign-in on the next date. The row still shows a
    // time in the login column -- the first thing they did -- and saying
    // "logged in then" about it would be a small lie in the column a reader
    // treats as arrival.
    mockGetAuth.mockReturnValue({ staffName: "Yukihiro Nishimura", role: "HQ" });
    mockFetch.mockImplementation(() => ok(report([
      row({ staff_name: "Night Shift", login_at: "2026-09-10T16:03:00+00:00",
            login_carried_over: true, events: 136, signed_in: true, flags: [] }),
    ])));
    await renderPage();
    expect(await screen.findByText("Night Shift")).toBeTruthy();
    expect(screen.getByText("継続")).toBeTruthy();
  });
});
