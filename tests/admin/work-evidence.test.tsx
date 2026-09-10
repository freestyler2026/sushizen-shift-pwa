// tests/admin/work-evidence.test.tsx
//
// This page decides what the OS says about a person, so the tests are about
// the claims it is allowed to make: who can open it, that presence is never
// counted as output, and that no finding appears without the group it was
// measured against.
import React from "react";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));

const mockGetAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  getAuth: () => mockGetAuth(),
  getAuthHeaders: () => ({}),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import WorkEvidencePage from "@/app/admin/work-evidence/page";

function person(over: Record<string, unknown> = {}) {
  return {
    staff_name: "Test Person", role: "ADMIN", city: "manila",
    views: 21, reads: 57, outputs: 0, presence_writes: 1, failed_writes: 0,
    days_seen: 2, days_punched: 2, days_punched_no_output: 2,
    days_punched_unobserved: 1,
    punch_minutes: 1434, punch_minutes_observed: 960, os_minutes: 44,
    output_areas: [], viewed_areas: [{ screen: "/admin/os-attendance", views: 3 }],
    days: [
      { date: "2026-09-09", outputs: 0, views: 9, os_minutes: 12, punch_minutes: 474,
        first_at: null, last_at: null, punch_in: "2026-09-09T01:00:00+00:00",
        punch_out: "2026-09-09T09:00:00+00:00", observed: false },
      { date: "2026-09-10", outputs: 0, views: 12, os_minutes: 32, punch_minutes: 960,
        first_at: null, last_at: null, punch_in: "2026-09-10T01:00:00+00:00",
        punch_out: "2026-09-10T17:00:00+00:00", observed: true },
    ],
    ...over,
  };
}

function report(over: Record<string, unknown> = {}) {
  return {
    start: "2026-09-09", end: "2026-09-11", city: "manila", timezone: "Asia/Manila",
    log_started_at: "2026-09-09 14:31:18+00:00", unobserved_shifts: 84,
    thresholds: {
      punched_hours_for_no_output: 5, peer_output_per_day: 1,
      peer_group_min_people: 3, views_without_output: 8,
      views_to_call_it_their_screen: 3, edge_minutes: 20,
      outside_shift_grace_minutes: 30, outside_shift_share: 0.5,
      outside_shift_min_outputs: 3,
    },
    totals: { people: 2, outputs: 147, views: 300, areas: 5 },
    people: [person({ staff_name: "Peter Villafuerte", role: "HR_MANAGER", outputs: 147,
      output_areas: [{ screen: "/admin/hr/recruitment", outputs: 147 }],
      days_punched_no_output: 0 }), person()],
    areas: [{
      screen: "/admin/hr/recruitment", outputs: 147, people: 1,
      sole_owner: "Peter Villafuerte", top_share: 1,
      contributors: [{ staff_name: "Peter Villafuerte", outputs: 147, share: 1 }],
    }],
    flags: [{
      flag: "NO_OUTPUT", staff_name: "Test Person", role: "ADMIN",
      says: "Punched 16.0 h over 1 fully watched day(s), opened /admin/os-attendance 3 times, and changed nothing anywhere.",
      compared_with: "4 other people on /admin/os-attendance, median 2.5 changes a day",
      evidence: { punch_minutes: 960, os_minutes: 44, views: 21, outputs: 0 },
    }],
    ...over,
  };
}

const backlog = {
  city: "manila", held_total: 3, unowned_total: 617,
  unowned: [
    { role: "MANAGER", items: 548, median_days: 66.3, oldest_days: 116.5 },
    { role: "HR_MANAGER", items: 53, median_days: 56.2, oldest_days: 97.5 },
  ],
  held: [{ staff_name: "Yuri Yamada", items: 3, median_days: 3.5, oldest_days: 86.2, by_kind: { approval: 1, management: 2 } }],
  unowned_oldest: [],
};

const speed = {
  days: 180, decisions: 2973,
  people: [
    { staff_name: "Cyrine Fernandez", role: "ADMIN", decisions: 1159, approved: 1100, rejected: 19, returned: 40, median_hours: 0.8, p90_hours: 1.5, last_at: "2026-09-09T10:00:00+00:00" },
    { staff_name: "Yuri Yamada", role: "HQ", decisions: 393, approved: 359, rejected: 28, returned: 6, median_hours: 3.5, p90_hours: 440.1, last_at: "2026-09-10T10:00:00+00:00" },
  ],
};

const redistribution = {
  start: "2026-09-09", end: "2026-09-11", city: "manila", thresholds: {},
  sole_owner: [{ screen: "/admin/hr/recruitment", outputs: 147, staff_name: "Peter Villafuerte", punch_minutes: 1200 }],
  concentrated: [{ screen: "/store/procurement/request", outputs: 66, people: 3, top_share: 0.88, staff_name: "Caila Macararanga" }],
  scattered: [{ screen: "/admin/backup", outputs: 7, people: 7, contributors: [{ staff_name: "A", share: 0.14 }] }],
  load: [], totals: { people: 2, outputs: 147, views: 300, areas: 5 },
};

function serve(rep: unknown = report(), over: Record<string, unknown> = {}) {
  mockFetch.mockImplementation((url: string) => {
    const u = String(url);
    const body = u.includes("redistribution") ? (over.red ?? redistribution)
      : u.includes("/backlog") ? (over.bl ?? backlog)
      : u.includes("/speed") ? (over.sp ?? speed)
      : rep;
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
  });
}

/** The page opens on the backlog; every other tab needs a click. */
async function openTab(label: string) {
  fireEvent.click(await screen.findByText(new RegExp(label)));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAuth.mockReturnValue({ staffName: "Yukihiro Nishimura", role: "HQ" });
  serve();
});

describe("who can open it", () => {
  it("shows nothing to somebody who is not one of the two names", async () => {
    mockGetAuth.mockReturnValue({ staffName: "Somebody Else", role: "HQ" });
    render(<WorkEvidencePage />);
    expect(await screen.findByText("この画面は公開されていません。")).toBeTruthy();
  });

  it("does not call the API for them either", async () => {
    mockGetAuth.mockReturnValue({ staffName: "Somebody Else", role: "ADMIN" });
    render(<WorkEvidencePage />);
    await screen.findByText("この画面は公開されていません。");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("being HQ is not enough on its own", async () => {
    mockGetAuth.mockReturnValue({ staffName: "Yuri Yamada", role: "HQ" });
    render(<WorkEvidencePage />);
    expect(await screen.findByText("この画面は公開されていません。")).toBeTruthy();
  });

  it("opens for a named viewer", async () => {
    render(<WorkEvidencePage />);
    expect(await screen.findByText(/仕事の証拠/)).toBeTruthy();
  });
});

describe("what it refuses to claim", () => {
  it("says when the watching started", async () => {
    render(<WorkEvidencePage />);
    await openTab("確認が要る人");
    expect(await screen.findByText(/2026-09-09 14:31/)).toBeTruthy();
  });

  it("says how many shifts it will not judge", async () => {
    render(<WorkEvidencePage />);
    await openTab("確認が要る人");
    expect(await screen.findByText(/84件/)).toBeTruthy();
  });

  it("warns that work outside the OS is invisible before showing any number", async () => {
    render(<WorkEvidencePage />);
    await openTab("確認が要る人");
    expect(await screen.findByText(/OSの外の仕事はこの画面から見えません/)).toBeTruthy();
  });

  it("prints every finding with the group it was measured against", async () => {
    render(<WorkEvidencePage />);
    await openTab("確認が要る人");
    expect(await screen.findByText(/4 other people on \/admin\/os-attendance/)).toBeTruthy();
  });

  it("prints the thresholds that produced the findings", async () => {
    render(<WorkEvidencePage />);
    await openTab("確認が要る人");
    expect(await screen.findByText(/heroku config:set/)).toBeTruthy();
  });

  it("an empty finding list says 'none matched', not 'nobody was checked'", async () => {
    serve(report({ flags: [] }));
    render(<WorkEvidencePage />);
    await openTab("確認が要る人");
    expect(await screen.findByText(/説明のつかない人はいませんでした/)).toBeTruthy();
    expect(screen.getByText(/「該当なし」であって「調べていない」ではありません/)).toBeTruthy();
  });
});

describe("output is not presence", () => {
  it("a person with only a QR confirmation shows no output", async () => {
    render(<WorkEvidencePage />);
    await openTab("人ごと");
    const row = (await screen.findAllByText("Test Person"))[0].closest("tr")!;
    expect(within(row).getAllByText("—").length).toBeGreaterThan(0);
  });

  it("says out loud that the clock-in was not counted", async () => {
    render(<WorkEvidencePage />);
    await openTab("人ごと");
    fireEvent.click((await screen.findAllByText("Test Person"))[0]);
    expect(await screen.findByText(/これは「居た」という記録なので成果には入れていません/)).toBeTruthy();
  });

  it("marks a day that began before the log as out of scope, not as idle", async () => {
    render(<WorkEvidencePage />);
    await openTab("人ごと");
    fireEvent.click((await screen.findAllByText("Test Person"))[0]);
    expect(await screen.findByText("記録開始前に出勤 — 判定対象外")).toBeTruthy();
  });
});

describe("redistribution", () => {
  it("names the work only one person does", async () => {
    render(<WorkEvidencePage />);
    await openTab("業務の分担");
    const card = (await screen.findByText("その人しかやっていない業務")).closest("div")!;
    expect(within(card).getByText(/Peter Villafuerte/)).toBeTruthy();
  });

  it("frames it as handover, not as a verdict on the person", async () => {
    render(<WorkEvidencePage />);
    await openTab("業務の分担");
    expect(await screen.findByText(/評価ではなく、引き継ぎ先を決めるための一覧/)).toBeTruthy();
  });

  it("shows the work nobody owns", async () => {
    render(<WorkEvidencePage />);
    await openTab("業務の分担");
    expect(await screen.findByText("誰も主担当でない業務")).toBeTruthy();
  });

  it("counts changes, not page opens, and says so", async () => {
    render(<WorkEvidencePage />);
    await openTab("業務の分担");
    expect(await screen.findByText(/件数は成果の数で、開いた回数ではありません/)).toBeTruthy();
  });
});

describe("what is in whose hands", () => {
  it("opens on the backlog, not on the findings", async () => {
    render(<WorkEvidencePage />);
    expect(await screen.findByText(/誰の手元にもないまま止まっているもの/)).toBeTruthy();
  });

  it("puts the unowned pile first and says nobody was asked", async () => {
    render(<WorkEvidencePage />);
    expect(await screen.findByText(/617件/)).toBeTruthy();
    expect(screen.getByText(/誰も遅れていません。誰も頼まれていないからです。/)).toBeTruthy();
  });

  it("shows the age of the unowned work, not just its size", async () => {
    render(<WorkEvidencePage />);
    const row = (await screen.findByText("MANAGER")).closest("tr")!;
    expect(within(row).getByText("548")).toBeTruthy();
    expect(within(row).getByText("116.5日")).toBeTruthy();
  });

  it("reports how long each person keeps a decision", async () => {
    render(<WorkEvidencePage />);
    const row = (await screen.findAllByText("Cyrine Fernandez"))[0].closest("tr")!;
    expect(within(row).getByText("1159")).toBeTruthy();
    expect(within(row).getByText("0.8h")).toBeTruthy();
  });

  it("shows a long p90 in days, so a hidden pile is readable", async () => {
    render(<WorkEvidencePage />);
    const row = (await screen.findAllByText("Yuri Yamada"))[1].closest("tr")!;
    expect(within(row).getByText("18日")).toBeTruthy();
  });

  it("refuses to call speed quality", async () => {
    render(<WorkEvidencePage />);
    expect(await screen.findByText(/速さは正しさではありません/)).toBeTruthy();
  });

  it("says which queues it does not cover rather than implying it has them all", async () => {
    render(<WorkEvidencePage />);
    expect(await screen.findByText(/Waiting for Someone/)).toBeTruthy();
  });

  it("an empty backlog does not crash the tab", async () => {
    serve(report(), { bl: { ...backlog, unowned: [], held: [], unowned_total: 0, held_total: 0 } });
    render(<WorkEvidencePage />);
    expect(await screen.findByText(/名前のついた手元/)).toBeTruthy();
    expect(screen.getByText("該当なし")).toBeTruthy();
  });
});

describe("failures", () => {
  it("a 403 says the screen is closed rather than showing an empty table", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403, json: () => Promise.resolve({}) });
    render(<WorkEvidencePage />);
    await waitFor(() => expect(screen.getByText("この画面は公開されていません。")).toBeTruthy());
  });

  it("a server error is shown, not swallowed", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });
    render(<WorkEvidencePage />);
    expect(await screen.findByText(/読み込みに失敗しました \(500\)/)).toBeTruthy();
  });
});
