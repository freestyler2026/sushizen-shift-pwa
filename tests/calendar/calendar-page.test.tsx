// tests/calendar/calendar-page.test.tsx
import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { routerMock } from "../setup";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock("lucide-react", () => ({
  CalendarDays: () => <span data-testid="icon-calendar" />,
  RefreshCcw: () => <span data-testid="icon-refresh" />,
}));

vi.mock("@/components/MonthPicker", () => ({
  default: ({ value }: { value: string }) => (
    <input data-testid="month-picker" value={value} readOnly />
  ),
}));

vi.mock("@/components/DateRangePicker", () => ({
  default: ({
    value,
    onChange,
  }: {
    value: { from: string; to: string };
    onChange: (r: { from: string; to: string }) => void;
  }) => (
    <div data-testid="date-range-picker">
      <input
        data-testid="range-from"
        value={value.from}
        onChange={(e) => onChange({ from: e.target.value, to: value.to })}
      />
      <input
        data-testid="range-to"
        value={value.to}
        onChange={(e) => onChange({ from: value.from, to: e.target.value })}
      />
    </div>
  ),
}));

// Auth mock
let mockAuth: Record<string, unknown> | null = null;
let mockCanAccessCalendar = true;

vi.mock("@/lib/auth", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...real,
    getAuth: () => mockAuth,
    canAccessCalendarPage: () => mockCanAccessCalendar,
  };
});

// apiGet mock
const mockApiGet = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...real,
    apiGet: (...args: unknown[]) => mockApiGet(...args),
  };
});

// ── Fixtures ───────────────────────────────────────────────────────────────────

function makeShiftRow(overrides: Partial<{
  branch_code: string; staff_name: string; role: string;
  start_hour: number; end_hour: number; work_date: string;
}> = {}) {
  return {
    work_date: "2026-05-12",
    branch_code: "BB",
    area: "kitchen",
    staff_name: "Alice Smith",
    role: "CHEF",
    start_hour: 9,
    end_hour: 17,
    is_exception: false,
    override: null,
    applied: null,
    ...overrides,
  };
}

function makeAbsenceRow(role = "DAY_OFF") {
  return makeShiftRow({ role, start_hour: 0, end_hour: 0 });
}

const EMPTY_DAY_VIEW = { city: "dubai", work_date: "2026-05-12", count: 0, rows: [] };
const EMPTY_RANGE_VIEW = {
  ok: true, city: "dubai",
  date_from: "2026-05-12", date_to: "2026-05-12",
  branch_code: "", days: [],
};

function staffAuth(overrides: Record<string, unknown> = {}) {
  return {
    staffName: "Test Admin", city: "dubai", role: "ADMIN",
    accessToken: "tok", permissions: ["*"], ...overrides,
  };
}

async function renderPage() {
  const { default: CalendarPage } = await import("@/app/calendar/page");
  return render(<CalendarPage />);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("/calendar — auth guard", () => {
  beforeEach(() => {
    mockCanAccessCalendar = true;
    mockApiGet.mockResolvedValue(EMPTY_DAY_VIEW);
  });

  it("redirects to /login when no auth", async () => {
    mockAuth = null;
    await renderPage();
    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith("/login?next=%2Fcalendar")
    );
  });

  it("redirects to /request when canAccessCalendarPage is false", async () => {
    mockAuth = staffAuth();
    mockCanAccessCalendar = false;
    await renderPage();
    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith("/request")
    );
  });

  it("shows page when auth and access granted", async () => {
    mockAuth = staffAuth();
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Calendar")).toBeInTheDocument()
    );
  });

  it("shows 'Loading...' before auth resolves", async () => {
    mockAuth = null;
    const { container } = await renderPage();
    expect(container.textContent).toContain("Loading");
  });
});

describe("/calendar — page structure", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
    mockCanAccessCalendar = true;
    mockApiGet.mockResolvedValue(EMPTY_DAY_VIEW);
  });

  it("renders 'Calendar' heading", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("Calendar")).toBeInTheDocument());
  });

  it("renders subtitle", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/Browse daily and same-month range shifts/i)).toBeInTheDocument()
    );
  });

  it("renders city selector", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByDisplayValue("Dubai")).toBeInTheDocument()
    );
  });

  it("renders Store selector with All stores", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByDisplayValue("All stores")).toBeInTheDocument()
    );
  });

  it("renders Selected Day panel", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getAllByText("Selected Day").length).toBeGreaterThan(0)
    );
  });

  it("renders Selected Range panel", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Selected Range")).toBeInTheDocument()
    );
  });

  it("renders week day headers M T W T F S S", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("Calendar")).toBeInTheDocument());
    // 7 single-letter day headers rendered in the grid
    const allM = screen.getAllByText("M");
    expect(allM.length).toBeGreaterThan(0);
  });

  it("renders legend items", async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText("Work shift")).toBeInTheDocument();
      expect(screen.getByText("Absence")).toBeInTheDocument();
      expect(screen.getByText("Selected")).toBeInTheDocument();
      expect(screen.getByText("Today")).toBeInTheDocument();
    });
  });

  it("renders previous month button", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByLabelText("Previous month")).toBeInTheDocument()
    );
  });

  it("renders next month button", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByLabelText("Next month")).toBeInTheDocument()
    );
  });
});

describe("/calendar — month navigation", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
    mockCanAccessCalendar = true;
    mockApiGet.mockResolvedValue(EMPTY_DAY_VIEW);
  });

  it("clicking Next then Prev returns to original month", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("Calendar")).toBeInTheDocument());
    const monthPicker = screen.getByTestId("month-picker") as HTMLInputElement;
    const originalMonth = monthPicker.value;

    fireEvent.click(screen.getByLabelText("Next month"));
    await waitFor(() =>
      expect((screen.getByTestId("month-picker") as HTMLInputElement).value).not.toBe(originalMonth)
    );

    fireEvent.click(screen.getByLabelText("Previous month"));
    await waitFor(() =>
      expect((screen.getByTestId("month-picker") as HTMLInputElement).value).toBe(originalMonth)
    );
  });

  it("clicking next month advances month key by 1", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("Calendar")).toBeInTheDocument());
    const before = (screen.getByTestId("month-picker") as HTMLInputElement).value;
    const [y, m] = before.split("-").map(Number);

    fireEvent.click(screen.getByLabelText("Next month"));

    await waitFor(() => {
      const after = (screen.getByTestId("month-picker") as HTMLInputElement).value;
      const [ay, am] = after.split("-").map(Number);
      // Month advanced by 1 (wrapping year if needed)
      const expectedMonth = m === 12 ? 1 : m + 1;
      const expectedYear = m === 12 ? y + 1 : y;
      expect(am).toBe(expectedMonth);
      expect(ay).toBe(expectedYear);
    });
  });

  it("clicking previous month decrements month by 1", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("Calendar")).toBeInTheDocument());
    const before = (screen.getByTestId("month-picker") as HTMLInputElement).value;
    const [y, m] = before.split("-").map(Number);

    fireEvent.click(screen.getByLabelText("Previous month"));

    await waitFor(() => {
      const after = (screen.getByTestId("month-picker") as HTMLInputElement).value;
      const [ay, am] = after.split("-").map(Number);
      const expectedMonth = m === 1 ? 12 : m - 1;
      const expectedYear = m === 1 ? y - 1 : y;
      expect(am).toBe(expectedMonth);
      expect(ay).toBe(expectedYear);
    });
  });

  it("clicking a day cell updates selectedDate display", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("Calendar")).toBeInTheDocument());
    // Find a day button that doesn't have blank content (pick one with a number)
    const dayBtns = screen.getAllByRole("button").filter(
      (b) => /^\d+$/.test(b.textContent?.trim() ?? "")
    );
    expect(dayBtns.length).toBeGreaterThan(0);
    // Click the last available day button
    const lastDay = dayBtns[dayBtns.length - 1];
    fireEvent.click(lastDay);
    // Selected day display should update — it exists somewhere in the DOM
    await waitFor(() => {
      const displayed = screen.getAllByText(/\d{4}-\d{2}-\d{2}/);
      expect(displayed.length).toBeGreaterThan(0);
    });
  });
});

describe("/calendar — city toggle", () => {
  beforeEach(() => {
    mockApiGet.mockResolvedValue(EMPTY_DAY_VIEW);
    mockCanAccessCalendar = true;
  });

  it("defaults to auth city (dubai)", async () => {
    mockAuth = staffAuth({ city: "dubai" });
    await renderPage();
    await waitFor(() =>
      expect(screen.getByDisplayValue("Dubai")).toBeInTheDocument()
    );
  });

  it("defaults to manila when auth city is manila", async () => {
    mockAuth = staffAuth({ city: "manila" });
    await renderPage();
    await waitFor(() =>
      expect(screen.getByDisplayValue("Manila")).toBeInTheDocument()
    );
  });

  it("switching city triggers additional fetch", async () => {
    mockAuth = staffAuth({ city: "dubai" });
    await renderPage();
    await waitFor(() => screen.getByText("Calendar"));
    const callsBefore = mockApiGet.mock.calls.length;
    fireEvent.change(screen.getByDisplayValue("Dubai"), {
      target: { value: "manila" },
    });
    await waitFor(() =>
      expect(mockApiGet.mock.calls.length).toBeGreaterThan(callsBefore)
    );
  });
});

describe("/calendar — day view", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
    mockCanAccessCalendar = true;
  });

  it("shows loading text while day fetch is pending", async () => {
    mockApiGet.mockReturnValue(new Promise(() => {}));
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/Loading selected day/i)).toBeInTheDocument()
    );
  });

  it("shows error message when day fetch fails", async () => {
    mockApiGet.mockRejectedValue(new Error("Network error"));
    await renderPage();
    // Both day and range fetches fail so there may be multiple error elements
    await waitFor(() =>
      expect(screen.getAllByText(/Network error/i).length).toBeGreaterThan(0)
    );
  });

  it("shows 'No shift data.' when day returns empty rows", async () => {
    mockApiGet.mockResolvedValue(EMPTY_DAY_VIEW);
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("No shift data.")).toBeInTheDocument()
    );
  });

  it("renders branch code from day data", async () => {
    mockApiGet.mockResolvedValue({
      ...EMPTY_DAY_VIEW,
      rows: [makeShiftRow({ branch_code: "JLT" })],
    });
    await renderPage();
    await waitFor(() => expect(screen.getByText("JLT")).toBeInTheDocument());
  });

  it("renders staff name from day data", async () => {
    mockApiGet.mockResolvedValue({
      ...EMPTY_DAY_VIEW,
      rows: [makeShiftRow({ staff_name: "Carlos Reyes" })],
    });
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Carlos Reyes")).toBeInTheDocument()
    );
  });

  it("renders formatted shift hours", async () => {
    mockApiGet.mockResolvedValue({
      ...EMPTY_DAY_VIEW,
      rows: [makeShiftRow({ start_hour: 9, end_hour: 17, role: "CHEF" })],
    });
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/CHEF • 9:00 - 17:00/)).toBeInTheDocument()
    );
  });

  it("renders absence row role without hour range", async () => {
    mockApiGet.mockResolvedValue({
      ...EMPTY_DAY_VIEW,
      rows: [makeAbsenceRow("DAY_OFF")],
    });
    await renderPage();
    await waitFor(() => expect(screen.getByText("DAY_OFF")).toBeInTheDocument());
    expect(screen.queryByText(/0:00 - 0:00/)).not.toBeInTheDocument();
  });

  it("Refresh day button triggers re-fetch", async () => {
    mockApiGet.mockResolvedValue(EMPTY_DAY_VIEW);
    await renderPage();
    await waitFor(() => screen.getByText("No shift data."));
    const callsBefore = mockApiGet.mock.calls.length;
    fireEvent.click(screen.getByText("Refresh day"));
    await waitFor(() =>
      expect(mockApiGet.mock.calls.length).toBeGreaterThan(callsBefore)
    );
  });
});

describe("/calendar — range view", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
    mockCanAccessCalendar = true;
  });

  it("shows range loading text while pending", async () => {
    mockApiGet
      .mockResolvedValueOnce(EMPTY_DAY_VIEW)
      .mockReturnValueOnce(new Promise(() => {}));
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/Loading range/i)).toBeInTheDocument()
    );
  });

  it("shows error when range fetch fails", async () => {
    mockApiGet
      .mockResolvedValueOnce(EMPTY_DAY_VIEW)
      .mockRejectedValueOnce(new Error("Range unavailable"));
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/Range unavailable/)).toBeInTheDocument()
    );
  });

  it("shows 'No shifts found in this range.' when range empty", async () => {
    mockApiGet.mockResolvedValue(EMPTY_DAY_VIEW);
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("No shifts found in this range.")).toBeInTheDocument()
    );
  });

  it("renders range day title when data present", async () => {
    const rangeWithData = {
      ...EMPTY_RANGE_VIEW,
      days: [{
        work_date: "2026-05-12",
        city: "dubai", count: 1,
        rows: [makeShiftRow({ staff_name: "Diana Cruz" })],
      }],
    };
    mockApiGet
      .mockResolvedValueOnce(EMPTY_DAY_VIEW)
      .mockResolvedValueOnce(rangeWithData);
    await renderPage();
    await waitFor(() =>
      expect(screen.getAllByText("Diana Cruz").length).toBeGreaterThan(0)
    );
  });
});

describe("/calendar — shift grouping", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
    mockCanAccessCalendar = true;
  });

  it("groups multiple staff under the same branch", async () => {
    mockApiGet.mockResolvedValue({
      ...EMPTY_DAY_VIEW,
      rows: [
        makeShiftRow({ branch_code: "BB", staff_name: "Alice" }),
        makeShiftRow({ branch_code: "BB", staff_name: "Bob" }),
      ],
    });
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });
  });

  it("shows staff count label", async () => {
    mockApiGet.mockResolvedValue({
      ...EMPTY_DAY_VIEW,
      rows: [
        makeShiftRow({ branch_code: "JLT", staff_name: "Alice" }),
        makeShiftRow({ branch_code: "JLT", staff_name: "Bob" }),
      ],
    });
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("2 staff")).toBeInTheDocument()
    );
  });

  it("strips Japanese parenthetical annotations from staff names", async () => {
    mockApiGet.mockResolvedValue({
      ...EMPTY_DAY_VIEW,
      rows: [makeShiftRow({ staff_name: "Alice Smith（テスト）" })],
    });
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Alice Smith")).toBeInTheDocument()
    );
    expect(screen.queryByText(/テスト/)).not.toBeInTheDocument();
  });

  it("deduplicates identical shift rows for same staff", async () => {
    mockApiGet.mockResolvedValue({
      ...EMPTY_DAY_VIEW,
      rows: [
        makeShiftRow({ staff_name: "Alice", start_hour: 9, end_hour: 17, role: "CHEF" }),
        makeShiftRow({ staff_name: "Alice", start_hour: 9, end_hour: 17, role: "CHEF" }),
      ],
    });
    await renderPage();
    await waitFor(() => screen.getByText("Alice"));
    // Only one "CHEF • 9:00 - 17:00" row should appear
    expect(screen.getAllByText(/CHEF • 9:00 - 17:00/).length).toBe(1);
  });

  it("keeps ASCII parentheses in staff names (e.g. '(PH)')", async () => {
    mockApiGet.mockResolvedValue({
      ...EMPTY_DAY_VIEW,
      rows: [makeShiftRow({ staff_name: "Alice (PH)" })],
    });
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Alice (PH)")).toBeInTheDocument()
    );
  });
});

describe("/calendar — branch options", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
    mockCanAccessCalendar = true;
    mockApiGet.mockResolvedValue(EMPTY_DAY_VIEW);
  });

  it("includes base options: All stores, Business Bay, JLT, CK", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("Calendar")).toBeInTheDocument());
    const select = screen.getByDisplayValue("All stores") as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toContain("ALL");
    expect(values).toContain("Business Bay");
    expect(values).toContain("JLT");
    expect(values).toContain("CK");
  });

  it("appends newly discovered branch from API data", async () => {
    mockApiGet.mockResolvedValue({
      ...EMPTY_DAY_VIEW,
      rows: [makeShiftRow({ branch_code: "SPECIAL_BRANCH" })],
    });
    await renderPage();
    await waitFor(() => {
      const select = screen.getByDisplayValue("All stores") as HTMLSelectElement;
      const values = Array.from(select.options).map((o) => o.value);
      expect(values).toContain("SPECIAL_BRANCH");
    });
  });
});

describe("/calendar — hoursLabel bug regression (overnight shifts)", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
    mockCanAccessCalendar = true;
  });

  it("normal shift: 9:00 - 17:00", async () => {
    mockApiGet.mockResolvedValue({
      ...EMPTY_DAY_VIEW,
      rows: [makeShiftRow({ start_hour: 9, end_hour: 17, role: "CHEF" })],
    });
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/CHEF • 9:00 - 17:00/)).toBeInTheDocument()
    );
  });

  it("overnight shift with end_hour >= 24 (backend +24): shows 22:00 - 6:00(+1)", async () => {
    mockApiGet.mockResolvedValue({
      ...EMPTY_DAY_VIEW,
      rows: [makeShiftRow({ start_hour: 22, end_hour: 30, role: "CLOSER" })],
    });
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/22:00 - 6:00\(\+1\)/)).toBeInTheDocument()
    );
  });

  it("overnight shift with raw end < start: shows 22:00 - 6:00(+1) — bug regression", async () => {
    // Before fix: hoursLabel(22, 6) → "22:00 - 6:00"   (missing +1)
    // After fix:  hoursLabel(22, 6) → "22:00 - 6:00(+1)"
    mockApiGet.mockResolvedValue({
      ...EMPTY_DAY_VIEW,
      rows: [makeShiftRow({ start_hour: 22, end_hour: 6, role: "CLOSER" })],
    });
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/22:00 - 6:00\(\+1\)/)).toBeInTheDocument()
    );
  });

  it("start 0 end 8 is NOT overnight: shows 0:00 - 8:00", async () => {
    mockApiGet.mockResolvedValue({
      ...EMPTY_DAY_VIEW,
      rows: [makeShiftRow({ start_hour: 0, end_hour: 8, role: "PREP" })],
    });
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/PREP • 0:00 - 8:00/)).toBeInTheDocument()
    );
  });

  it("late overnight: start 23, end 2 → 23:00 - 2:00(+1)", async () => {
    mockApiGet.mockResolvedValue({
      ...EMPTY_DAY_VIEW,
      rows: [makeShiftRow({ start_hour: 23, end_hour: 2, role: "NIGHT" })],
    });
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/NIGHT • 23:00 - 2:00\(\+1\)/)).toBeInTheDocument()
    );
  });
});

describe("/calendar — isAbsenceRow: all absence roles", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
    mockCanAccessCalendar = true;
  });

  const ABSENCE_ROLES = [
    "DAY_OFF", "VL", "VACATION_LEAVE", "MATERNITY_LEAVE",
    "MEDICAL_LEAVE", "INJURY", "HOSPITAL", "ABSENT", "BEREAVEMENT_LEAVE",
  ];

  for (const role of ABSENCE_ROLES) {
    it(`${role} shows as absence (no hour range displayed)`, async () => {
      mockApiGet.mockResolvedValue({
        ...EMPTY_DAY_VIEW,
        rows: [makeAbsenceRow(role)],
      });
      await renderPage();
      await waitFor(() => screen.getByText(role));
      expect(screen.queryByText(/0:00 - 0:00/)).not.toBeInTheDocument();
    });
  }

  it("CHEF with non-zero hours is NOT absence", async () => {
    mockApiGet.mockResolvedValue({
      ...EMPTY_DAY_VIEW,
      rows: [makeShiftRow({ role: "CHEF", start_hour: 10, end_hour: 18 })],
    });
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/CHEF • 10:00 - 18:00/)).toBeInTheDocument()
    );
  });
});
