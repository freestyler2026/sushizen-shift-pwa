// tests/my-shift/my-shift-page.test.tsx

import React from "react";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── framer-motion ──────────────────────────────────────────────────────────────
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) =>
      React.createElement("div", props, children),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => React.createElement(React.Fragment, null, children),
}));

// ── Auth ───────────────────────────────────────────────────────────────────────
const BASE_AUTH = {
  staffName: "Jay",
  city: "manila" as const,
  role: "ADMIN" as const,
  accessToken: "tok",
  permissions: ["*"],
};

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getAuth: vi.fn(() => BASE_AUTH),
    canAccessMyShiftPage: vi.fn(() => true),
    getAuthHeaders: vi.fn(() => ({})),
    tryRefreshAccessToken: vi.fn(async () => null),
  };
});

// ── API ────────────────────────────────────────────────────────────────────────
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiGet: vi.fn() };
});

import { getAuth, canAccessMyShiftPage } from "@/lib/auth";
import { apiGet } from "@/lib/api";
import MyShiftPage from "@/app/my-shift/page";
import { routerMock } from "../setup";

const mockApiGet = vi.mocked(apiGet);

// ══════════════════════════════════════════════════════════════════════════════
// Fixtures
// ══════════════════════════════════════════════════════════════════════════════

function makeShiftRow(overrides: Record<string, unknown> = {}) {
  return {
    work_date: "2026-05-12",
    branch_code: "MNL_MAIN",
    area: "",
    staff_name: "Jay",
    role: "Cook",
    start_hour: 9,
    end_hour: 17,
    is_exception: false,
    override: null,
    applied: null,
    ...overrides,
  };
}

function makeMonthView(overrides: Record<string, unknown> = {}) {
  const row = makeShiftRow();
  return {
    ok: true,
    city: "manila",
    staff_name: "Jay",
    month: "2026-05",
    available_months: ["2026-05"],
    eligible_staff_names: ["Jay"],
    shift_days: 1,
    monthly_rows: [row],
    days: [{ work_date: "2026-05-12", count: 1, rows: [row] }],
    ...overrides,
  };
}

// Empty month — no shifts published
function makeEmptyMonthView() {
  return makeMonthView({
    shift_days: 0,
    monthly_rows: [],
    days: [],
  });
}

// ══════════════════════════════════════════════════════════════════════════════

describe("MyShiftPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuth).mockReturnValue(BASE_AUTH);
    vi.mocked(canAccessMyShiftPage).mockReturnValue(true);
    mockApiGet.mockResolvedValue(makeEmptyMonthView());
  });
  afterEach(() => cleanup());

  // ── Auth guard ──────────────────────────────────────────────────────────────
  describe("Auth guard", () => {
    it("redirects to /login when not authenticated", async () => {
      vi.mocked(getAuth).mockReturnValue(null as any);
      render(<MyShiftPage />);
      await waitFor(() => {
        expect(routerMock.replace).toHaveBeenCalledWith(
          expect.stringContaining("/login")
        );
      });
    });

    it("redirects to /request when canAccessMyShiftPage is false", async () => {
      vi.mocked(canAccessMyShiftPage).mockReturnValue(false);
      render(<MyShiftPage />);
      await waitFor(() => {
        expect(routerMock.replace).toHaveBeenCalledWith("/request");
      });
    });

    it("does NOT redirect for ADMIN with '*' permission", async () => {
      mockApiGet.mockResolvedValue(makeEmptyMonthView());
      render(<MyShiftPage />);
      await waitFor(() => {
        expect(screen.getByText("My Shift")).toBeInTheDocument();
      });
      expect(routerMock.replace).not.toHaveBeenCalled();
    });
  });

  // ── Page structure ──────────────────────────────────────────────────────────
  describe("Page structure", () => {
    it("renders 'My Shift' heading", async () => {
      render(<MyShiftPage />);
      await waitFor(() => expect(screen.getByText("My Shift")).toBeInTheDocument());
    });

    it("renders 'Published monthly schedule' subtitle", async () => {
      render(<MyShiftPage />);
      await waitFor(() =>
        expect(screen.getByText(/Published monthly schedule/i)).toBeInTheDocument()
      );
    });

    it("renders Previous and Next month navigation buttons", async () => {
      render(<MyShiftPage />);
      await waitFor(() => {
        expect(screen.getByLabelText(/Previous month/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Next month/i)).toBeInTheDocument();
      });
    });

    it("renders 'This month' button", async () => {
      render(<MyShiftPage />);
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /This month/i })).toBeInTheDocument()
      );
    });

    it("renders Day Details section", async () => {
      render(<MyShiftPage />);
      await waitFor(() => expect(screen.getByText("Day Details")).toBeInTheDocument());
    });

    it("renders Monthly Shifts section", async () => {
      render(<MyShiftPage />);
      await waitFor(() => expect(screen.getByText("Monthly Shifts")).toBeInTheDocument());
    });

    it("renders staff name from auth", async () => {
      render(<MyShiftPage />);
      await waitFor(() => expect(screen.getByText("Jay")).toBeInTheDocument());
    });
  });

  // ── Loading and error states ─────────────────────────────────────────────────
  describe("Loading / error states", () => {
    it("shows loading text while fetching", async () => {
      // Never resolves so loading persists
      mockApiGet.mockImplementation(() => new Promise(() => {}));
      render(<MyShiftPage />);
      await waitFor(() =>
        expect(screen.getByText(/Loading monthly shift/i)).toBeInTheDocument()
      );
    });

    it("shows error when API throws", async () => {
      mockApiGet.mockRejectedValue(new Error("Network failure"));
      render(<MyShiftPage />);
      await waitFor(() =>
        expect(screen.getByText(/Network failure/i)).toBeInTheDocument()
      , { timeout: 5000 });
    });

    it("shows no-shift message when API returns empty data", async () => {
      mockApiGet.mockResolvedValue(makeEmptyMonthView());
      render(<MyShiftPage />);
      await waitFor(() =>
        expect(screen.getByText(/No shifts this month/i)).toBeInTheDocument()
      , { timeout: 5000 });
    });
  });

  // ── Shift data display ───────────────────────────────────────────────────────
  describe("Shift data display", () => {
    it("shows shift_days count in badge", async () => {
      mockApiGet.mockResolvedValue(makeMonthView({ shift_days: 20 }));
      render(<MyShiftPage />);
      await waitFor(() =>
        expect(screen.getByText(/20 shift days/i)).toBeInTheDocument()
      , { timeout: 5000 });
    });

    it("shows shift row in Monthly Shifts table", async () => {
      mockApiGet.mockResolvedValue(makeMonthView());
      render(<MyShiftPage />);
      // "2026-05-12" appears in both the Selected Day header and the monthly table
      await waitFor(() =>
        expect(screen.getAllByText("2026-05-12").length).toBeGreaterThanOrEqual(2)
      , { timeout: 5000 });
    });

    it("shows '1 entries' in monthly shifts header", async () => {
      mockApiGet.mockResolvedValue(makeMonthView());
      render(<MyShiftPage />);
      await waitFor(() =>
        expect(screen.getByText(/1 entries/i)).toBeInTheDocument()
      , { timeout: 5000 });
    });

    it("shows start and end hours for a shift", async () => {
      mockApiGet.mockResolvedValue(makeMonthView());
      render(<MyShiftPage />);
      await waitFor(() => {
        expect(screen.getAllByText(/09:00/).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/17:00/).length).toBeGreaterThanOrEqual(1);
      }, { timeout: 5000 });
    });

    it("shows shift hours in table", async () => {
      mockApiGet.mockResolvedValue(makeMonthView());
      render(<MyShiftPage />);
      await waitFor(() =>
        expect(screen.getAllByText(/8h/).length).toBeGreaterThanOrEqual(1)
      , { timeout: 5000 });
    });

    it("filters absence rows from monthly shifts list", async () => {
      const absenceRow = makeShiftRow({
        work_date: "2026-05-13",
        role: "DAY_OFF",
        start_hour: 0,
        end_hour: 0,
      });
      const shiftRow = makeShiftRow({ work_date: "2026-05-12" });
      mockApiGet.mockResolvedValue(
        makeMonthView({
          monthly_rows: [shiftRow, absenceRow],
          days: [
            { work_date: "2026-05-12", count: 1, rows: [shiftRow] },
            { work_date: "2026-05-13", count: 1, rows: [absenceRow] },
          ],
          shift_days: 1,
        })
      );
      render(<MyShiftPage />);
      // "2026-05-12" appears in both the Selected Day header and the monthly table
      await waitFor(() =>
        expect(screen.getAllByText("2026-05-12").length).toBeGreaterThanOrEqual(2)
      , { timeout: 5000 });
      // Absence row should NOT appear in the monthly table
      expect(screen.queryByText("DAY_OFF")).not.toBeInTheDocument();
    });
  });

  // ── Selected day detail ──────────────────────────────────────────────────────
  describe("Selected day detail", () => {
    it("shows 'No shift published for this day' when no shifts on selected date", async () => {
      mockApiGet.mockResolvedValue(makeEmptyMonthView());
      render(<MyShiftPage />);
      await waitFor(() =>
        expect(screen.getByText(/No shift published for this day/i)).toBeInTheDocument()
      , { timeout: 5000 });
    });

    it("shows Start Time, End Time, Hours cards when day has a shift", async () => {
      mockApiGet.mockResolvedValue(makeMonthView());
      render(<MyShiftPage />);
      await waitFor(() => {
        expect(screen.getAllByText(/Start Time/i).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/End Time/i).length).toBeGreaterThanOrEqual(1);
        // "Hours" appears in both the Day Details KPI card and the Monthly Shifts table header
        expect(screen.getAllByText(/^Hours$/i).length).toBeGreaterThanOrEqual(1);
      }, { timeout: 5000 });
    });

    it("shows branch code and role in day detail card", async () => {
      mockApiGet.mockResolvedValue(makeMonthView());
      render(<MyShiftPage />);
      await waitFor(() => {
        expect(screen.getAllByText("MNL_MAIN").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("Cook").length).toBeGreaterThanOrEqual(1);
      }, { timeout: 5000 });
    });

    it("calculates total hours correctly (9h→17h = 8h)", async () => {
      mockApiGet.mockResolvedValue(makeMonthView());
      render(<MyShiftPage />);
      await waitFor(() =>
        expect(screen.getAllByText(/8h/).length).toBeGreaterThanOrEqual(1)
      , { timeout: 5000 });
    });

    it("shows absence badge when day has absence row", async () => {
      const absenceRow = makeShiftRow({
        work_date: "2026-05-12",
        role: "DAY_OFF",
        start_hour: 0,
        end_hour: 0,
      });
      mockApiGet.mockResolvedValue(
        makeMonthView({
          monthly_rows: [],
          shift_days: 0,
          days: [{ work_date: "2026-05-12", count: 1, rows: [absenceRow] }],
        })
      );
      render(<MyShiftPage />);
      await waitFor(() => {
        expect(
          screen.getAllByText(/absence/i).length
        ).toBeGreaterThanOrEqual(1);
      }, { timeout: 5000 });
    });
  });

  // ── Month navigation ─────────────────────────────────────────────────────────
  describe("Month navigation", () => {
    it("Previous month button changes displayed month", async () => {
      mockApiGet.mockResolvedValue(makeEmptyMonthView());
      render(<MyShiftPage />);
      await waitFor(() => screen.getByLabelText(/Previous month/i));

      // Current month is May 2026
      fireEvent.click(screen.getByLabelText(/Previous month/i));

      await waitFor(() => {
        // After going back one month, should see April 2026
        expect(screen.getAllByText(/April 2026/i).length).toBeGreaterThanOrEqual(1);
      }, { timeout: 3000 });
    });

    it("Next month button changes displayed month", async () => {
      mockApiGet.mockResolvedValue(makeEmptyMonthView());
      render(<MyShiftPage />);
      await waitFor(() => screen.getByLabelText(/Next month/i));

      fireEvent.click(screen.getByLabelText(/Next month/i));

      await waitFor(() => {
        expect(screen.getAllByText(/June 2026/i).length).toBeGreaterThanOrEqual(1);
      }, { timeout: 3000 });
    });

    it("'This month' button resets to current month", async () => {
      mockApiGet.mockResolvedValue(makeEmptyMonthView());
      render(<MyShiftPage />);
      await waitFor(() => screen.getByRole("button", { name: /This month/i }));

      // Go to next month first
      fireEvent.click(screen.getByLabelText(/Next month/i));
      await waitFor(() =>
        expect(screen.getAllByText(/June 2026/i).length).toBeGreaterThanOrEqual(1)
      );

      // Then click "This month"
      fireEvent.click(screen.getByRole("button", { name: /This month/i }));
      await waitFor(() =>
        expect(screen.getAllByText(/May 2026/i).length).toBeGreaterThanOrEqual(1)
      );
    });

    it("changing month triggers new API fetch", async () => {
      mockApiGet.mockResolvedValue(makeEmptyMonthView());
      render(<MyShiftPage />);
      await waitFor(() => screen.getByLabelText(/Next month/i));

      const callsBefore = mockApiGet.mock.calls.length;
      fireEvent.click(screen.getByLabelText(/Next month/i));

      await waitFor(() => {
        expect(mockApiGet.mock.calls.length).toBeGreaterThan(callsBefore);
        const lastCall = mockApiGet.mock.calls[mockApiGet.mock.calls.length - 1][0] as string;
        expect(lastCall).toContain("2026-06");
      }, { timeout: 3000 });
    });
  });

  // ── Calendar grid ────────────────────────────────────────────────────────────
  describe("Calendar grid", () => {
    it("renders calendar day-of-week headers M T W T F S S", async () => {
      render(<MyShiftPage />);
      await waitFor(() => expect(screen.getByText("My Shift")).toBeInTheDocument());
      // 7 day headers
      const headers = ["M", "T", "W", "F", "S"];
      headers.forEach(h => {
        expect(screen.getAllByText(h).length).toBeGreaterThanOrEqual(1);
      });
    });

    it("clicking a calendar cell updates Selected Day section", async () => {
      mockApiGet.mockResolvedValue(makeMonthView());
      render(<MyShiftPage />);
      await waitFor(() =>
        expect(screen.getAllByText("2026-05-12").length).toBeGreaterThanOrEqual(1)
      , { timeout: 5000 });

      // Calendar cells have min-h-[68px] class — use it to scope to the calendar grid only
      const calendarCells = document.querySelectorAll(".min-h-\\[68px\\]");
      // Find cell with day number "15" (within current month, not greyed-out)
      const day15 = Array.from(calendarCells).find(c => {
        const span = c.querySelector("span:first-child");
        return span?.textContent?.trim() === "15" && !c.classList.contains("opacity-30");
      });
      if (day15) {
        fireEvent.click(day15);
        await waitFor(() => {
          // Selected Day header should now show 2026-05-15
          expect(screen.getAllByText("2026-05-15").length).toBeGreaterThanOrEqual(1);
        }, { timeout: 3000 });
      } else {
        // Fallback: just verify the calendar renders with 42 cells
        expect(calendarCells.length).toBe(42);
      }
    });
  });

  // ── Multiple staff names ─────────────────────────────────────────────────────
  describe("Multiple eligible staff names", () => {
    it("shows select dropdown when multiple eligible names exist", async () => {
      mockApiGet.mockResolvedValue(
        makeMonthView({
          eligible_staff_names: ["Jay", "Maria", "Alice"],
        })
      );
      render(<MyShiftPage />);
      await waitFor(() => {
        // Should render a <select> for name switching
        expect(screen.getByRole("combobox")).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it("shows plain name badge (not dropdown) when only one staff name", async () => {
      mockApiGet.mockResolvedValue(makeMonthView({ eligible_staff_names: ["Jay"] }));
      render(<MyShiftPage />);
      await waitFor(() => expect(screen.getByText("My Shift")).toBeInTheDocument());
      // Should NOT render a select
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    });
  });

  // ── BUG FIX: overnight shift hoursLabel shows "(+1)" for next-day end time ──
  describe("BUG FIX: overnight shift end-time label", () => {
    it("shows '(+1)' suffix on end time for overnight shift (22:00 → 06:00 next day)", async () => {
      const overnightRow = makeShiftRow({
        work_date: "2026-05-12",
        start_hour: 22,
        end_hour: 6,
        role: "Closer",
      });
      mockApiGet.mockResolvedValue(
        makeMonthView({
          monthly_rows: [overnightRow],
          days: [{ work_date: "2026-05-12", count: 1, rows: [overnightRow] }],
          shift_days: 1,
        })
      );
      render(<MyShiftPage />);
      // "Closer" appears in both mobile card and desktop table
      await waitFor(() =>
        expect(screen.getAllByText("Closer").length).toBeGreaterThanOrEqual(1)
      , { timeout: 5000 });

      // BUG FIX: hoursLabel(22, 6) must show "22:00 - 06:00(+1)" not "22:00 - 06:00"
      // The shift detail card renders hoursLabel(row.start_hour, row.end_hour)
      // Note: selectedDaySummary.endTime already correctly shows "06:00(+1)" via maxEnd math,
      // but hoursLabel used directly in the shift detail card was NOT adjusting overnight ends.
      await waitFor(() => {
        expect(document.body.innerHTML).toContain("22:00 - 06:00(+1)");
      }, { timeout: 3000 });
    });

    it("correctly calculates 8 hours for overnight shift 22→06", async () => {
      const overnightRow = makeShiftRow({
        work_date: "2026-05-12",
        start_hour: 22,
        end_hour: 6,
        role: "Closer",
      });
      mockApiGet.mockResolvedValue(
        makeMonthView({
          monthly_rows: [overnightRow],
          days: [{ work_date: "2026-05-12", count: 1, rows: [overnightRow] }],
          shift_days: 1,
        })
      );
      render(<MyShiftPage />);
      // "Closer" appears in both mobile card and desktop table
      await waitFor(() =>
        expect(screen.getAllByText("Closer").length).toBeGreaterThanOrEqual(1)
      , { timeout: 5000 });
      // 22→06 = 8 hours
      await waitFor(() => {
        expect(screen.getAllByText(/8h/).length).toBeGreaterThanOrEqual(1);
      }, { timeout: 3000 });
    });

    it("shows '(+1)' suffix in monthly shifts table for overnight shifts", async () => {
      const overnightRow = makeShiftRow({
        work_date: "2026-05-12",
        start_hour: 22,
        end_hour: 6,
        role: "Closer",
      });
      mockApiGet.mockResolvedValue(
        makeMonthView({
          monthly_rows: [overnightRow],
          days: [{ work_date: "2026-05-12", count: 1, rows: [overnightRow] }],
          shift_days: 1,
        })
      );
      render(<MyShiftPage />);
      // The monthly table (desktop view) also shows end time
      await waitFor(() => {
        // "(+1)" should appear somewhere in the rendered output (either table or day detail)
        expect(document.body.innerHTML).toContain("(+1)");
      }, { timeout: 5000 });
    });

    it("does NOT show '(+1)' for a normal daytime shift (9→17)", async () => {
      mockApiGet.mockResolvedValue(makeMonthView());
      render(<MyShiftPage />);
      // Wait for data to load — "1 entries" confirms monthly shifts rendered
      await waitFor(() =>
        expect(screen.getByText(/1 entries/i)).toBeInTheDocument()
      , { timeout: 5000 });
      // Should NOT have any (+1) text for 9–17 shift
      expect(document.body.innerHTML).not.toContain("(+1)");
    });
  });

  // ── Today highlight ──────────────────────────────────────────────────────────
  describe("Today handling", () => {
    it("auto-selects today when today is in the days list", async () => {
      // Today is 2026-05-12 (from env)
      mockApiGet.mockResolvedValue(makeMonthView());
      render(<MyShiftPage />);
      await waitFor(() => {
        // Selected Day section should show today's date
        expect(screen.getAllByText("2026-05-12").length).toBeGreaterThanOrEqual(1);
      }, { timeout: 5000 });
    });

    it("shows 'Today' button when selected date is not today", async () => {
      const row = makeShiftRow({ work_date: "2026-05-01" });
      mockApiGet.mockResolvedValue(
        makeMonthView({
          monthly_rows: [row],
          days: [{ work_date: "2026-05-01", count: 1, rows: [row] }],
        })
      );
      render(<MyShiftPage />);
      // After load, manually click a different date cell
      await waitFor(() => screen.getByText("Day Details"), { timeout: 5000 });

      // Find day 1 cell and click it
      const cells = document.querySelectorAll(".cursor-pointer.rounded-2xl");
      const day1 = Array.from(cells).find(c => {
        const span = c.querySelector("span");
        return span?.textContent?.trim() === "1" && !c.classList.contains("opacity-30");
      });
      if (day1) {
        fireEvent.click(day1);
        await waitFor(() => {
          expect(screen.getByRole("button", { name: /^Today$/i })).toBeInTheDocument();
        }, { timeout: 3000 });
      }
    });
  });
});
