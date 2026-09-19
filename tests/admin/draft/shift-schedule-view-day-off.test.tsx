// The Draft grid's day-off chips.
//
// Approving a day off and editing the roster are two separate acts. The publish
// paths now refuse, but a refusal at Apply time is late: the draft is built
// weeks earlier, and Abegail A. Dalida's 2026-09-06 sat on the schedule from
// 2026-08-07 until the morning she was marked ABSENT. These are what says so
// while somebody is still looking at the rows.

import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock());

import ShiftScheduleView, { type DraftRow } from "@/app/admin/draft/ShiftScheduleView";
import { dayOffIndex } from "@/lib/day-off-conflicts";

const MONTH = "2026-09";

function row(over: Partial<DraftRow> & { id: string }): DraftRow {
  return {
    work_date: "2026-09-01", staff_name: "Abegail A. Dalida", role: "Prep Cook",
    start_hour: 9, end_hour: 18, ...over,
  };
}

function renderGrid(rows: DraftRow[], days: Parameters<typeof dayOffIndex>[0] = []) {
  render(
    <ShiftScheduleView
      rows={rows}
      month={MONTH}
      versionId="v1"
      onUpdateRow={vi.fn()}
      onDeleteRow={vi.fn()}
      onAddRow={vi.fn()}
      dayOffByStaffDate={dayOffIndex(days)}
    />,
  );
}

const APPROVED = [{ staff_name: "Abegail A. Dalida", work_date: "2026-09-01", stage: "approved" as const }];
const ASKED = [{ staff_name: "Abegail A. Dalida", work_date: "2026-09-01", stage: "asked" as const }];

describe("Draft grid — the chip on the row", () => {
  it("marks a row that works a day already approved off", () => {
    renderGrid([row({ id: "r1" })], APPROVED);
    expect(screen.getByText("off approved")).toBeInTheDocument();
  });

  it("says approving does not move the shift, and what happens at Apply", () => {
    renderGrid([row({ id: "r1" })], APPROVED);
    expect(screen.getByText("off approved")).toHaveAttribute(
      "title",
      "Abegail A. Dalida — 2026-09-01 is an approved day off, but this puts them on 09:00-18:00."
      + " Applying this draft will be refused until the row says Day Off.",
    );
  });

  it("keeps an unanswered request amber, because rostering them is still correct", () => {
    renderGrid([row({ id: "r1" })], ASKED);
    expect(screen.getByText("off asked")).toBeInTheDocument();
    expect(screen.queryByText("off approved")).toBeNull();
    expect(screen.getByText("off asked").getAttribute("title")).toMatch(/still correct/);
  });

  it("drops the chip once the row says Day Off — the day off is being applied", () => {
    renderGrid([row({ id: "r1", role: "DAY_OFF", start_hour: 0, end_hour: 0 })], APPROVED);
    expect(screen.queryByText("off approved")).toBeNull();
    expect(screen.queryByText(/Already given off/)).toBeNull();
  });

  it("drops the chip on a zero-length row even when the role is not a marker", () => {
    renderGrid([row({ id: "r1", start_hour: 9, end_hour: 9 })], APPROVED);
    expect(screen.queryByText("off approved")).toBeNull();
  });

  it("leaves rows alone when nobody filed anything", () => {
    renderGrid([row({ id: "r1" })], []);
    expect(screen.queryByText("off approved")).toBeNull();
    expect(screen.queryByText("off asked")).toBeNull();
  });

  it("marks only the person who filed, not everyone on that day", () => {
    renderGrid([row({ id: "r1" }), row({ id: "r2", staff_name: "Mary Jane Tegerero" })], APPROVED);
    expect(screen.getAllByText("off approved")).toHaveLength(1);
  });

  it("marks only the day that was filed, not the person's whole month", () => {
    renderGrid([row({ id: "r1" }), row({ id: "r2", work_date: "2026-09-02" })], APPROVED);
    expect(screen.getAllByText("off approved")).toHaveLength(1);
  });

  it("matches the name however it was capitalised on the request", () => {
    renderGrid([row({ id: "r1" })], [
      { staff_name: "abegail a. dalida", work_date: "2026-09-01", stage: "approved" },
    ]);
    expect(screen.getByText("off approved")).toBeInTheDocument();
  });
});

describe("Draft grid — the summary above the weeks", () => {
  // One week is on screen at a time and Apply refuses on the whole month, so a
  // chip four weeks out is a chip nobody sees until the refusal.
  const FAR = [{ staff_name: "Abegail A. Dalida", work_date: "2026-09-24", stage: "approved" as const }];

  it("names a conflict in a week that is not the one being shown", () => {
    renderGrid([row({ id: "r1", work_date: "2026-09-24" })], FAR);
    expect(screen.getByText(/Already given off — 1 person, 1 day in this draft/)).toBeInTheDocument();
    expect(
      screen.getByText(/Abegail A\. Dalida — 2026-09-24 is an approved day off/),
    ).toBeInTheDocument();
    // …and the row itself is not on screen, which is the reason the summary exists.
    expect(screen.queryByText("off approved")).toBeNull();
  });

  it("jumps to the week when the line is clicked", () => {
    renderGrid([row({ id: "r1", work_date: "2026-09-24" })], FAR);
    fireEvent.click(screen.getByText(/Abegail A\. Dalida — 2026-09-24/));
    expect(screen.getByText("off approved")).toBeInTheDocument();
  });

  it("puts a dot on the week buttons that hold one", () => {
    renderGrid([row({ id: "r1", work_date: "2026-09-24" })], FAR);
    const marked = screen.getAllByRole("button", { name: /^Week \d/ })
      .filter((b) => within(b).queryByTitle(/rostered on a day they were given off/));
    expect(marked).toHaveLength(1);
    expect(marked[0]).toHaveTextContent("Week 4");
  });

  it("says nothing when the draft rosters nobody on a day they were given off", () => {
    renderGrid([row({ id: "r1", work_date: "2026-09-24" })], []);
    expect(screen.queryByText(/Already given off/)).toBeNull();
    expect(screen.queryByTitle(/rostered on a day they were given off/)).toBeNull();
  });

  it("does not count an unanswered request — nothing is refused for those", () => {
    renderGrid([row({ id: "r1", work_date: "2026-09-24" })], [
      { staff_name: "Abegail A. Dalida", work_date: "2026-09-24", stage: "asked" },
    ]);
    expect(screen.queryByText(/Already given off/)).toBeNull();
  });

  it("counts people and days the way the refusal does", () => {
    renderGrid(
      [row({ id: "r1", work_date: "2026-09-01" }), row({ id: "r2", work_date: "2026-09-08" })],
      [
        { staff_name: "Abegail A. Dalida", work_date: "2026-09-01", stage: "approved" },
        { staff_name: "Abegail A. Dalida", work_date: "2026-09-08", stage: "approved" },
      ],
    );
    expect(screen.getByText(/1 person across 2 days in this draft/)).toBeInTheDocument();
  });
});

describe("dayOffIndex — two live requests for one day", () => {
  it("lets the answered one win, whichever order they arrive in", () => {
    const asked = { staff_name: "R", work_date: "2026-09-20", stage: "asked" as const };
    const approved = { staff_name: "R", work_date: "2026-09-20", stage: "approved" as const };
    expect(dayOffIndex([asked, approved]).get("r|2026-09-20")).toBe("approved");
    expect(dayOffIndex([approved, asked]).get("r|2026-09-20")).toBe("approved");
  });
});
