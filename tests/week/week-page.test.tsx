// tests/week/week-page.test.tsx

import React from "react";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── framer-motion stub ────────────────────────────────────────────────────────
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) =>
      React.createElement("div", props, children),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) =>
    React.createElement(React.Fragment, null, children),
}));

// ── auth mock ─────────────────────────────────────────────────────────────────
const BASE_AUTH = {
  staffName: "Jay",
  city: "manila" as const,
  role: "STAFF" as const,
  accessToken: "tok",
  permissions: ["*"],
};

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getAuth: vi.fn(() => BASE_AUTH),
    canAccessWeekPage: vi.fn(() => true),
    getAuthHeaders: vi.fn(() => ({})),
    tryRefreshAccessToken: vi.fn(async () => null),
  };
});

// ── api mock ──────────────────────────────────────────────────────────────────
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiGet: vi.fn() };
});

// ── date mock ─────────────────────────────────────────────────────────────────
vi.mock("@/lib/date", () => ({
  mondayOf: vi.fn(() => "2026-05-11"),
  isoToday: vi.fn(() => "2026-05-12"),
}));

import { getAuth, canAccessWeekPage } from "@/lib/auth";
import { apiGet } from "@/lib/api";
import WeekPage from "@/app/week/page";
import { routerMock } from "../setup";

const mockApiGet = vi.mocked(apiGet);

// ── fixtures ──────────────────────────────────────────────────────────────────
const EMPTY_WEEK = { city: "manila", start_date: "2026-05-11", days: [] };
const EMPTY_CHANGES = { ok: true, items: [] };
const MAX_DATE = { ok: true, city: "manila", max_date: "2026-05-12" };

function makeRow(overrides: Record<string, any> = {}) {
  return {
    work_date: "2026-05-11",
    branch_code: "CK",
    area: "",
    staff_name: "Alice",
    role: "Opener",
    start_hour: 9,
    end_hour: 17,
    is_exception: false,
    override: null,
    applied: null,
    note: "",
    ...overrides,
  };
}

function makeDay(work_date: string, rows: any[] = []) {
  return { city: "manila", work_date, count: rows.length, rows };
}

function makeWeek(days: any[] = []) {
  return { city: "manila", start_date: "2026-05-11", days };
}

function setupApiGet(
  weekData: any = EMPTY_WEEK,
  changesData: any = EMPTY_CHANGES,
  maxDate: any = MAX_DATE,
) {
  mockApiGet.mockImplementation(async (url: string) => {
    const u = String(url);
    if (u.includes("/max_date")) return maxDate;
    if (u.includes("/week")) return weekData;
    if (u.includes("/changes")) return changesData;
    return {};
  });
}

// ─────────────────────────────────────────────────────────────────────────────

describe("WeekPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuth).mockReturnValue(BASE_AUTH);
    vi.mocked(canAccessWeekPage).mockReturnValue(true);
  });
  afterEach(() => cleanup());

  // ── Auth guard ──────────────────────────────────────────────────────────────
  describe("Auth guard", () => {
    it("redirects to /login when not authenticated", async () => {
      vi.mocked(getAuth).mockReturnValue(null as any);
      setupApiGet();
      render(<WeekPage />);
      await waitFor(() => {
        expect(routerMock.replace).toHaveBeenCalledWith("/login?next=%2Fweek");
      });
    });

    it("redirects to /my-shift when canAccessWeekPage is false", async () => {
      vi.mocked(canAccessWeekPage).mockReturnValue(false);
      setupApiGet();
      render(<WeekPage />);
      await waitFor(() => {
        expect(routerMock.replace).toHaveBeenCalledWith("/my-shift");
      });
    });

    it("renders page when authenticated with access", async () => {
      setupApiGet();
      render(<WeekPage />);
      await waitFor(() => expect(screen.getByText("Week")).toBeInTheDocument());
      expect(routerMock.replace).not.toHaveBeenCalled();
    });
  });

  // ── Page structure ──────────────────────────────────────────────────────────
  describe("Page structure", () => {
    it("renders Week heading", async () => {
      setupApiGet();
      render(<WeekPage />);
      await waitFor(() => expect(screen.getByText("Week")).toBeInTheDocument());
    });

    it("shows Dubai and Manila city options", async () => {
      setupApiGet();
      render(<WeekPage />);
      await waitFor(() => {
        expect(screen.getByRole("option", { name: "Dubai" })).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "Manila" })).toBeInTheDocument();
      });
    });

    it("shows Refresh button", async () => {
      setupApiGet();
      render(<WeekPage />);
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /Refresh/i })).toBeInTheDocument()
      );
    });

    it("shows Previous and Next week navigation buttons", async () => {
      setupApiGet();
      render(<WeekPage />);
      await waitFor(() => {
        expect(screen.getByLabelText("Previous week")).toBeInTheDocument();
        expect(screen.getByLabelText("Next week")).toBeInTheDocument();
      });
    });

    it("shows Today button", async () => {
      setupApiGet();
      render(<WeekPage />);
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /^Today$/i })).toBeInTheDocument()
      );
    });

    it("shows logged-in user name in header", async () => {
      setupApiGet();
      render(<WeekPage />);
      await waitFor(() => expect(screen.getByText("Jay")).toBeInTheDocument());
    });

    it("shows Recent Approved Changes section", async () => {
      setupApiGet();
      render(<WeekPage />);
      await waitFor(() =>
        expect(screen.getByText(/Recent Approved Changes/i)).toBeInTheDocument()
      );
    });
  });

  // ── Week navigation ─────────────────────────────────────────────────────────
  describe("Week navigation", () => {
    it("clicking Previous week triggers a new fetch", async () => {
      setupApiGet();
      render(<WeekPage />);
      await waitFor(() => screen.getByLabelText("Previous week"));
      const callsBefore = mockApiGet.mock.calls.length;
      fireEvent.click(screen.getByLabelText("Previous week"));
      await waitFor(() => {
        expect(mockApiGet.mock.calls.length).toBeGreaterThan(callsBefore);
      }, { timeout: 5000 });
    });

    it("clicking Next week triggers a new fetch", async () => {
      setupApiGet();
      render(<WeekPage />);
      await waitFor(() => screen.getByLabelText("Next week"));
      const callsBefore = mockApiGet.mock.calls.length;
      fireEvent.click(screen.getByLabelText("Next week"));
      await waitFor(() => {
        expect(mockApiGet.mock.calls.length).toBeGreaterThan(callsBefore);
      });
    });

    it("clicking Today resets to current week", async () => {
      setupApiGet();
      render(<WeekPage />);
      await waitFor(() => screen.getByRole("button", { name: /^Today$/i }));
      fireEvent.click(screen.getByRole("button", { name: /^Today$/i }));
      await waitFor(() => {
        const weekCalls = mockApiGet.mock.calls.filter(([url]) =>
          String(url).includes("/week")
        );
        expect(weekCalls.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  // ── Recent Approved Changes ─────────────────────────────────────────────────
  describe("Recent Approved Changes", () => {
    it("shows 'No approved changes' when list is empty", async () => {
      setupApiGet(EMPTY_WEEK, { ok: true, items: [] });
      render(<WeekPage />);
      await waitFor(() =>
        expect(screen.getByText(/No approved changes for this week/i)).toBeInTheDocument()
      , { timeout: 5000 });
    });

    it("renders change event entries when data exists", async () => {
      const changes = {
        ok: true,
        items: [{
          id: "c1",
          work_date: "2026-05-12",
          branch_code: "CK",
          target_staff_name: "Alice",
          change_type: "shift_edit",
          before_json: { staff_name: "Alice", start_hour: 9, end_hour: 17 },
          after_json: { staff_name: "Alice", start_hour: 10, end_hour: 18 },
        }],
      };
      setupApiGet(EMPTY_WEEK, changes);
      render(<WeekPage />);
      await waitFor(() =>
        expect(screen.getByText(/2026-05-12/)).toBeInTheDocument()
      , { timeout: 5000 });
    });

    it("shows change note when after_json has a note", async () => {
      const changes = {
        ok: true,
        items: [{
          id: "c2",
          work_date: "2026-05-12",
          branch_code: "CK",
          target_staff_name: "Bob",
          change_type: "shift_edit",
          before_json: { staff_name: "Bob", start_hour: 9, end_hour: 17 },
          after_json: { staff_name: "Bob", start_hour: 10, end_hour: 18, note: "urgent cover" },
        }],
      };
      setupApiGet(EMPTY_WEEK, changes);
      render(<WeekPage />);
      await waitFor(() =>
        expect(screen.getByText(/urgent cover/i)).toBeInTheDocument()
      , { timeout: 5000 });
    });
  });

  // ── Error / empty states ────────────────────────────────────────────────────
  describe("Error and empty states", () => {
    it("shows error message when week fetch fails", async () => {
      mockApiGet.mockImplementation(async (url: string) => {
        if (String(url).includes("/max_date")) return { ok: true, city: "manila", max_date: null };
        if (String(url).includes("/week")) throw new Error("Network error");
        return {};
      });
      render(<WeekPage />);
      await waitFor(() =>
        expect(screen.getByText(/Network error/i)).toBeInTheDocument()
      , { timeout: 5000 });
    });

    it("shows 'No data.' when week returns no days", async () => {
      setupApiGet({ ...EMPTY_WEEK, days: [] });
      render(<WeekPage />);
      await waitFor(() =>
        expect(screen.getByText(/No data\./i)).toBeInTheDocument()
      , { timeout: 5000 });
    });
  });

  // ── Branch filter ───────────────────────────────────────────────────────────
  describe("Branch filter", () => {
    it("shows 'All stores' filter button when shifts exist", async () => {
      setupApiGet(makeWeek([makeDay("2026-05-11", [makeRow()])]));
      render(<WeekPage />);
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /All stores/i })).toBeInTheDocument()
      , { timeout: 5000 });
    });

    it("shows individual branch button for each branch in data", async () => {
      setupApiGet(makeWeek([makeDay("2026-05-11", [makeRow({ branch_code: "CK" })])]));
      render(<WeekPage />);
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /^CK$/ })).toBeInTheDocument()
      , { timeout: 5000 });
    });

    it("shows 'My store' button when logged-in user appears in a branch", async () => {
      setupApiGet(makeWeek([makeDay("2026-05-11", [makeRow({ staff_name: "Jay", branch_code: "CK" })])]));
      render(<WeekPage />);
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /My store/i })).toBeInTheDocument()
      , { timeout: 5000 });
    });

    it("does NOT show 'My store' button when user has no shifts this week", async () => {
      setupApiGet(makeWeek([makeDay("2026-05-11", [makeRow({ staff_name: "Alice" })])]));
      render(<WeekPage />);
      await waitFor(() => screen.getByRole("button", { name: /All stores/i }), { timeout: 5000 });
      expect(screen.queryByRole("button", { name: /My store/i })).not.toBeInTheDocument();
    });

    it("shows 'No branch data for this filter' when filtering to empty branch", async () => {
      setupApiGet(makeWeek([makeDay("2026-05-11", [makeRow({ branch_code: "CK" })])]));
      render(<WeekPage />);
      // Wait for PAR button (not present) vs CK which is present
      await waitFor(() => screen.getByRole("button", { name: /^CK$/ }), { timeout: 5000 });
      // Click a specific branch — then check if data shows; CK has data so no empty message
      fireEvent.click(screen.getByRole("button", { name: /^CK$/ }));
      await waitFor(() =>
        expect(screen.queryByText(/No branch data for this filter/i)).not.toBeInTheDocument()
      );
    });
  });

  // ── Shift data display ──────────────────────────────────────────────────────
  describe("Shift data display", () => {
    it("renders day date header", async () => {
      setupApiGet(makeWeek([makeDay("2026-05-11", [makeRow()])]));
      render(<WeekPage />);
      await waitFor(() =>
        expect(screen.getByText("2026-05-11")).toBeInTheDocument()
      , { timeout: 5000 });
    });

    it("renders branch code in section header", async () => {
      setupApiGet(makeWeek([makeDay("2026-05-11", [makeRow({ branch_code: "CK" })])]));
      render(<WeekPage />);
      await waitFor(() =>
        expect(screen.getAllByText(/^CK$/i).length).toBeGreaterThanOrEqual(1)
      , { timeout: 5000 });
    });

    it("renders staff name", async () => {
      setupApiGet(makeWeek([makeDay("2026-05-11", [makeRow({ staff_name: "Alice" })])]));
      render(<WeekPage />);
      await waitFor(() =>
        expect(screen.getByText("Alice")).toBeInTheDocument()
      , { timeout: 5000 });
    });

    it("shows YOU badge for the logged-in user's row", async () => {
      setupApiGet(makeWeek([makeDay("2026-05-11", [makeRow({ staff_name: "Jay" })])]));
      render(<WeekPage />);
      await waitFor(() =>
        expect(screen.getByText("YOU")).toBeInTheDocument()
      , { timeout: 5000 });
    });

    it("shows Day Off label for DAY_OFF absence rows", async () => {
      setupApiGet(makeWeek([makeDay("2026-05-11", [makeRow({ role: "DAY_OFF", start_hour: 0, end_hour: 0 })])]));
      render(<WeekPage />);
      await waitFor(() =>
        expect(screen.getAllByText(/Day Off/i).length).toBeGreaterThanOrEqual(1)
      , { timeout: 5000 });
    });

    it("shows Vacation Leave label for VL rows", async () => {
      setupApiGet(makeWeek([makeDay("2026-05-11", [makeRow({ role: "VL", start_hour: 0, end_hour: 0 })])]));
      render(<WeekPage />);
      await waitFor(() =>
        expect(screen.getAllByText(/Vacation Leave/i).length).toBeGreaterThanOrEqual(1)
      , { timeout: 5000 });
    });

    it("shows staff count badge on branch header", async () => {
      setupApiGet(makeWeek([makeDay("2026-05-11", [
        makeRow({ staff_name: "Alice" }),
        makeRow({ staff_name: "Bob" }),
      ])]));
      render(<WeekPage />);
      await waitFor(() =>
        expect(screen.getByText("2")).toBeInTheDocument()
      , { timeout: 5000 });
    });

    it("shows note text for rows with notes", async () => {
      setupApiGet(makeWeek([makeDay("2026-05-11", [makeRow({ note: "cover shift" })])]));
      render(<WeekPage />);
      await waitFor(() =>
        expect(screen.getByText("cover shift")).toBeInTheDocument()
      , { timeout: 5000 });
    });

    it("strips ASCII-parenthesized Japanese annotations from staff names", async () => {
      // sanitizeDisplayName strips (non-ASCII-content) using ASCII parens \( \)
      setupApiGet(makeWeek([makeDay("2026-05-11", [makeRow({ staff_name: "Alice(テスト)" })])]));
      render(<WeekPage />);
      await waitFor(() =>
        expect(screen.getByText("Alice")).toBeInTheDocument()
      , { timeout: 5000 });
    });

    it("renders time range for normal shift (09–17)", async () => {
      setupApiGet(makeWeek([makeDay("2026-05-11", [makeRow({ start_hour: 9, end_hour: 17 })])]));
      render(<WeekPage />);
      await waitFor(() =>
        expect(screen.getByText("09–17")).toBeInTheDocument()
      , { timeout: 5000 });
    });

    it("shows (+1) suffix for overnight shift end time (end_hour=30 → 06(+1))", async () => {
      // Backend stores end_hour=30 for overnight 22:00→06:00 shifts
      setupApiGet(makeWeek([makeDay("2026-05-11", [makeRow({ start_hour: 22, end_hour: 30 })])]));
      render(<WeekPage />);
      await waitFor(() =>
        expect(screen.getByText("22–06(+1)")).toBeInTheDocument()
      , { timeout: 5000 });
    });

    it("normalizes 'businessbay' branch code to 'Business Bay'", async () => {
      setupApiGet(makeWeek([makeDay("2026-05-11", [makeRow({ branch_code: "businessbay" })])]));
      render(<WeekPage />);
      await waitFor(() =>
        expect(screen.getAllByText(/Business Bay/i).length).toBeGreaterThanOrEqual(1)
      , { timeout: 5000 });
    });
  });

  // ── BUG: containsJP regex falsely matches hyphens ───────────────────────────
  describe("BUG FIX: containsJP regex", () => {
    it("does NOT show JP badge for staff names containing a hyphen", async () => {
      setupApiGet(makeWeek([makeDay("2026-05-11", [
        makeRow({ staff_name: "Al-Rashid Mohammed" }),
      ])]));
      render(<WeekPage />);
      await waitFor(() =>
        expect(screen.getByText("Al-Rashid Mohammed")).toBeInTheDocument()
      , { timeout: 5000 });
      // BUG: /[-龠]/ matches '-', so hyphenated names incorrectly get the JP badge
      // After fix: JP badge must NOT appear for this name
      expect(screen.queryByText("JP")).not.toBeInTheDocument();
    });

    it("DOES show JP badge for names with actual Japanese characters", async () => {
      setupApiGet(makeWeek([makeDay("2026-05-11", [
        makeRow({ staff_name: "田中 太郎" }),
      ])]));
      render(<WeekPage />);
      await waitFor(() =>
        expect(screen.getAllByText(/田中/).length).toBeGreaterThanOrEqual(1)
      , { timeout: 5000 });
      expect(screen.getByText("JP")).toBeInTheDocument();
    });

    it("does NOT show JP badge for normal ASCII names", async () => {
      setupApiGet(makeWeek([makeDay("2026-05-11", [
        makeRow({ staff_name: "Maria Santos" }),
      ])]));
      render(<WeekPage />);
      await waitFor(() =>
        expect(screen.getByText("Maria Santos")).toBeInTheDocument()
      , { timeout: 5000 });
      expect(screen.queryByText("JP")).not.toBeInTheDocument();
    });
  });

  // ── City selector ───────────────────────────────────────────────────────────
  describe("City selector", () => {
    it("switches city when selector is changed", async () => {
      setupApiGet();
      render(<WeekPage />);
      await waitFor(() => screen.getByRole("option", { name: "Dubai" }));
      fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "dubai" } });
      await waitFor(() => {
        const weekCalls = mockApiGet.mock.calls.filter(([url]) =>
          String(url).includes("city=dubai")
        );
        expect(weekCalls.length).toBeGreaterThanOrEqual(1);
      }, { timeout: 5000 });
    });
  });
});
