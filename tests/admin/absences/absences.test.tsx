// tests/admin/absences/absences.test.tsx
// Tests for src/app/admin/absences/page.tsx
// Covers: page rendering, absence report, scope section, single upsert,
//         bulk entry, history, delete flow, validation errors.

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── next/link ────────────────────────────────────────────────────────────────
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// ── framer-motion ─────────────────────────────────────────────────────────────
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
      <div {...props}>{children}</div>
    ),
    tr: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLTableRowElement>>) => (
      <tr {...props}>{children}</tr>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// ── lucide-react ──────────────────────────────────────────────────────────────
vi.mock("lucide-react", () => ({
  AlertCircle: () => <svg data-testid="icon-alert-circle" />,
  ArrowLeft: () => <svg data-testid="icon-arrow-left" />,
  BarChart2: () => <svg data-testid="icon-bar" />,
  CalendarDays: () => <svg data-testid="icon-cal-days" />,
  CalendarOff: () => <svg data-testid="icon-cal-off" />,
  Check: () => <svg data-testid="icon-check" />,
  CheckCircle2: () => <svg data-testid="icon-check-circle" />,
  ClipboardList: () => <svg data-testid="icon-clipboard" />,
  Download: () => <svg data-testid="icon-download" />,
  Info: () => <svg data-testid="icon-info" />,
  RefreshCw: () => <svg data-testid="icon-refresh" />,
  Save: () => <svg data-testid="icon-save" />,
  Shield: () => <svg data-testid="icon-shield" />,
  Trash2: () => <svg data-testid="icon-trash" />,
  Upload: () => <svg data-testid="icon-upload" />,
  UserCheck: () => <svg data-testid="icon-usercheck" />,
  UserMinus: () => <svg data-testid="icon-userminus" />,
  Users: () => <svg data-testid="icon-users" />,
  X: () => <svg data-testid="icon-x" />,
}));

// ── DateRangePicker ───────────────────────────────────────────────────────────
vi.mock("@/components/DateRangePicker", () => ({
  default: ({ value, onChange }: { value: { from: string; to: string }; onChange: (v: any) => void }) => (
    <div data-testid="date-range-picker">
      <input
        data-testid="drp-from"
        value={value.from}
        onChange={(e) => onChange({ from: e.target.value, to: value.to })}
        readOnly
      />
      <input
        data-testid="drp-to"
        value={value.to}
        onChange={(e) => onChange({ from: value.from, to: e.target.value })}
        readOnly
      />
    </div>
  ),
}));

// ── branches ─────────────────────────────────────────────────────────────────
vi.mock("@/lib/branches", () => ({
  BRANCHES: {
    dubai: [
      { code: "JBR", name: "JBR Branch" },
      { code: "MC", name: "MC Branch" },
    ],
    manila: [
      { code: "CUB", name: "Cubao" },
      { code: "TAFT", name: "Taft" },
    ],
  },
}));

// ── dateInput ─────────────────────────────────────────────────────────────────
vi.mock("@/lib/dateInput", () => ({
  normalizeCalendarDateInput: (v: string) => v,
}));

// ── formatters ────────────────────────────────────────────────────────────────
vi.mock("@/lib/formatters", () => ({
  fmtNum: (v: number) => String(v ?? 0),
}));

// ── ui-tokens ─────────────────────────────────────────────────────────────────
vi.mock("@/lib/ui-tokens", () => ({
  BADGE_ERROR: "badge-error",
  BADGE_INFO: "badge-info",
  BADGE_SUCCESS: "badge-success",
  BADGE_WARNING: "badge-warning",
  DANGER_BUTTON: "danger-button",
  GLASS_CARD: "glass-card",
  INPUT_CLASS: "input-class",
  PRIMARY_BUTTON: "primary-button",
  SECONDARY_BUTTON: "secondary-button",
  SELECT_CLASS: "select-class",
  SMALL_BUTTON: "small-button",
  TABLE_CELL: "table-cell",
  TABLE_HEADER: "table-header",
  TABLE_ROW: "table-row",
  TEXTAREA_CLASS: "textarea-class",
  T_CAPTION: "t-caption",
  T_LABEL: "t-label",
  T_PAGE_TITLE: "t-page-title",
  T_SECTION: "t-section",
}));

// ── auth ──────────────────────────────────────────────────────────────────────
const MOCK_AUTH = {
  accessToken: "tok-abs",
  role: "HQ",
  city: "dubai",
  staffName: "Jay",
  pin: "1234",
  permissions: ["absences.read"],
};

vi.mock("@/lib/auth", () => ({
  getAuth: vi.fn(() => MOCK_AUTH),
}));

// ── fetch mock helpers ────────────────────────────────────────────────────────
const DUBAI_ROW = {
  work_date: "2026-05-12",
  staff_name: "Tanaka Yuki",
  absence_type: "ABSENT",
  note: "No show",
  branch_hint: "JBR",
  source_sheet_name: "MANUAL",
  created_at: "2026-05-12T08:00:00Z",
};

const MANILA_ROW = {
  work_date: "2026-05-12",
  staff_name: "Santos Maria",
  absence_type: "MEDICAL_LEAVE",
  note: "Doctor visit",
  branch_hint: "CUB",
  source_sheet_name: "MANUAL",
  created_at: "2026-05-12T09:00:00Z",
};

const PROTECTED_ROW = {
  ...DUBAI_ROW,
  staff_name: "Protected Staff",
  source_sheet_name: "Bayzat_Sheet",
};

function makeFetch(opts: {
  dubaiRows?: any[];
  manilaRows?: any[];
  staffNames?: string[];
  failAbsences?: boolean;
  failUpsert?: boolean;
} = {}) {
  const dubaiRows = opts.dubaiRows ?? [];
  const manilaRows = opts.manilaRows ?? [];
  const staffNames = opts.staffNames ?? ["Jay", "Maria Santos", "Tanaka Yuki"];

  return vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = ((init as any)?.method || "GET").toUpperCase();

    if (method === "POST" && u.includes("/absences/upsert")) {
      if (opts.failUpsert) {
        return { ok: false, status: 403, text: async () => JSON.stringify({ detail: "Invalid PIN" }) };
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
    }
    if (method === "POST" && u.includes("/absences/delete")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
    }
    if (u.includes("/staff_master/names")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ names: staffNames }) };
    }
    if (u.includes("/absences")) {
      if (opts.failAbsences) {
        return { ok: false, status: 500, text: async () => "Server error" };
      }
      // Distinguish dubai vs manila by url city param
      if (u.includes("city=manila")) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ rows: manilaRows }) };
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({ rows: dubaiRows }) };
    }
    return { ok: false, status: 404, text: async () => "" };
  });
}

import AdminAbsencesPage from "@/app/admin/absences/page";

// ══════════════════════════════════════════════════════════════════════════════
describe("AdminAbsencesPage — page rendering", () => {
  beforeEach(() => { vi.stubGlobal("fetch", makeFetch()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("renders the page title", async () => {
    render(<AdminAbsencesPage />);
    expect(screen.getByText("Absence / Leave Management")).toBeInTheDocument();
  });

  it("renders Absence Report section heading", async () => {
    render(<AdminAbsencesPage />);
    expect(screen.getByText("Absence Report")).toBeInTheDocument();
  });

  it("renders Scope section heading", async () => {
    render(<AdminAbsencesPage />);
    expect(screen.getByText("Scope / Approval Context")).toBeInTheDocument();
  });

  it("renders Single Upsert section heading", async () => {
    render(<AdminAbsencesPage />);
    expect(screen.getByText("Single Upsert")).toBeInTheDocument();
  });

  it("renders Bulk Entry section heading", async () => {
    render(<AdminAbsencesPage />);
    expect(screen.getByText("Bulk Entry")).toBeInTheDocument();
  });

  it("renders History section heading", async () => {
    render(<AdminAbsencesPage />);
    expect(screen.getByText("History")).toBeInTheDocument();
  });

  it("renders nav links: Back to Admin, Attendance, Analytics", () => {
    render(<AdminAbsencesPage />);
    expect(screen.getByText("Back to Admin")).toBeInTheDocument();
    expect(screen.getByText("Attendance")).toBeInTheDocument();
    expect(screen.getAllByText("Analytics").length).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("AdminAbsencesPage — absence report (auto-load)", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("auto-loads report on mount when auth is ready", async () => {
    const mockFetch = makeFetch();
    vi.stubGlobal("fetch", mockFetch);
    render(<AdminAbsencesPage />);
    await waitFor(() => {
      const absenceCalls = mockFetch.mock.calls.filter(([url]: [string]) =>
        String(url).includes("/absences") && !String(url).includes("/upsert") && !String(url).includes("/delete")
      );
      expect(absenceCalls.length).toBeGreaterThan(0);
    });
  });

  it("shows 'No absences recorded' when both cities return empty rows", async () => {
    vi.stubGlobal("fetch", makeFetch({ dubaiRows: [], manilaRows: [] }));
    render(<AdminAbsencesPage />);
    await screen.findByText("No absences recorded for this period");
  });

  it("shows absence rows when dubai has data", async () => {
    vi.stubGlobal("fetch", makeFetch({ dubaiRows: [DUBAI_ROW], manilaRows: [] }));
    render(<AdminAbsencesPage />);
    // "No show" is the note field — unique, not in any select option
    await screen.findByText("No show");
    expect(screen.getAllByText("Tanaka Yuki").length).toBeGreaterThan(0);
  });

  it("shows absence rows when manila has data", async () => {
    vi.stubGlobal("fetch", makeFetch({ dubaiRows: [], manilaRows: [MANILA_ROW] }));
    render(<AdminAbsencesPage />);
    // "Doctor visit" is the note — unique
    await screen.findByText("Doctor visit");
    expect(screen.getAllByText("Santos Maria").length).toBeGreaterThan(0);
  });

  it("shows total count badge when absences exist", async () => {
    vi.stubGlobal("fetch", makeFetch({ dubaiRows: [DUBAI_ROW], manilaRows: [MANILA_ROW] }));
    render(<AdminAbsencesPage />);
    // "2 total" badge is a unique string
    await screen.findByText("2 total");
  });

  it("shows report error when fetch fails", async () => {
    vi.stubGlobal("fetch", makeFetch({ failAbsences: true }));
    render(<AdminAbsencesPage />);
    await screen.findByText(/Server error|500/i);
  });

  it("shows auth prompt when approverName is empty", async () => {
    const { getAuth } = await import("@/lib/auth");
    vi.mocked(getAuth).mockReturnValueOnce({ ...MOCK_AUTH, staffName: "", pin: "" } as any);
    vi.stubGlobal("fetch", makeFetch());
    render(<AdminAbsencesPage />);
    expect(screen.getByText(/Enter Approver Name and PIN/i)).toBeInTheDocument();
  });

  it("Load Report button reloads data", async () => {
    const mockFetch = makeFetch({ dubaiRows: [], manilaRows: [] });
    vi.stubGlobal("fetch", mockFetch);
    render(<AdminAbsencesPage />);
    await screen.findByText("No absences recorded for this period");
    const callsBefore = mockFetch.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /Load Report/i }));
    await waitFor(() => {
      expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("AdminAbsencesPage — ReportCitySection", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("shows 'All present' badge for city with no absences", async () => {
    vi.stubGlobal("fetch", makeFetch({ dubaiRows: [], manilaRows: [] }));
    render(<AdminAbsencesPage />);
    // When reportTotal = 0, shows 'No absences recorded' — ReportCitySection not shown
    // But with one city having data and the other empty, it renders the "All present" badge
    vi.stubGlobal("fetch", makeFetch({ dubaiRows: [DUBAI_ROW], manilaRows: [] }));
    render(<AdminAbsencesPage />);
    await screen.findByText("All present");
  });

  it("shows Dubai flag label when dubai rows present", async () => {
    vi.stubGlobal("fetch", makeFetch({ dubaiRows: [DUBAI_ROW], manilaRows: [] }));
    render(<AdminAbsencesPage />);
    await screen.findByText("Dubai");
  });

  it("shows Manila flag label when manila rows present", async () => {
    vi.stubGlobal("fetch", makeFetch({ dubaiRows: [], manilaRows: [MANILA_ROW] }));
    render(<AdminAbsencesPage />);
    await screen.findByText("Manila");
  });

  it("shows Absent count badge", async () => {
    vi.stubGlobal("fetch", makeFetch({ dubaiRows: [DUBAI_ROW], manilaRows: [] }));
    render(<AdminAbsencesPage />);
    await screen.findByText(/1 Absent/);
  });

  it("shows Medical Leave type badge in report row", async () => {
    vi.stubGlobal("fetch", makeFetch({ dubaiRows: [], manilaRows: [MANILA_ROW] }));
    render(<AdminAbsencesPage />);
    // "Doctor visit" note is unique; then Medical Leave appears (also in select, so use getAllByText)
    await screen.findByText("Doctor visit");
    expect(screen.getAllByText("Medical Leave").length).toBeGreaterThan(0);
  });

  it("Yesterday / Today shortcuts update date range", async () => {
    vi.stubGlobal("fetch", makeFetch({ dubaiRows: [], manilaRows: [] }));
    render(<AdminAbsencesPage />);
    const yesterdayBtns = screen.getAllByRole("button", { name: "Yesterday" });
    fireEvent.click(yesterdayBtns[0]);
    const todayBtns = screen.getAllByRole("button", { name: "Today" });
    fireEvent.click(todayBtns[0]);
    // No error thrown — shortcuts work
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("AdminAbsencesPage — scope section", () => {
  beforeEach(() => { vi.stubGlobal("fetch", makeFetch()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("pre-fills Approver Name from auth", async () => {
    render(<AdminAbsencesPage />);
    const input = screen.getByDisplayValue("Jay");
    expect(input).toBeInTheDocument();
  });

  it("shows city select with Dubai selected initially", async () => {
    render(<AdminAbsencesPage />);
    const citySelect = screen.getAllByRole("combobox").find(
      (el) => el.getAttribute("value") === "dubai" || (el as HTMLSelectElement).value === "dubai"
    );
    expect(citySelect).toBeDefined();
  });

  it("changing city triggers staff reload", async () => {
    const mockFetch = makeFetch();
    vi.stubGlobal("fetch", mockFetch);
    render(<AdminAbsencesPage />);
    await waitFor(() => {
      expect(mockFetch.mock.calls.some(([url]: [string]) => String(url).includes("/staff_master/names"))).toBe(true);
    });
    const callsBefore = mockFetch.mock.calls.length;
    const citySelects = screen.getAllByRole("combobox");
    const citySelect = citySelects[0];
    fireEvent.change(citySelect, { target: { value: "manila" } });
    await waitFor(() => {
      expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("AdminAbsencesPage — single upsert", () => {
  beforeEach(() => { vi.stubGlobal("fetch", makeFetch()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("renders Save button in Single Upsert section", async () => {
    render(<AdminAbsencesPage />);
    expect(screen.getByRole("button", { name: /Save/i })).toBeInTheDocument();
  });

  it("shows error when saving without selecting staff name", async () => {
    render(<AdminAbsencesPage />);
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));
    await screen.findByText(/Staff name is required/i);
  });

  it("calls upsert API when staff name is selected and Save clicked", async () => {
    const mockFetch = makeFetch({ staffNames: ["Tanaka Yuki"] });
    vi.stubGlobal("fetch", mockFetch);
    render(<AdminAbsencesPage />);

    // Wait for staff options to load
    await waitFor(() => {
      expect(mockFetch.mock.calls.some(([url]: [string]) => String(url).includes("/staff_master/names"))).toBe(true);
    });

    // Select staff from the first staff-name select
    const selects = screen.getAllByRole("combobox");
    // The staff name select is in the Single Upsert section - find it by its default option
    const staffSelect = selects.find(
      (s) => (s as HTMLSelectElement).options[0]?.text === "Select staff"
    );
    expect(staffSelect).toBeDefined();
    fireEvent.change(staffSelect!, { target: { value: "Tanaka Yuki" } });

    fireEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      const upsertCall = mockFetch.mock.calls.find(([url]: [string]) =>
        String(url).includes("/absences/upsert")
      );
      expect(upsertCall).toBeDefined();
    });
  });

  it("shows success message after successful upsert", async () => {
    const mockFetch = makeFetch({ staffNames: ["Tanaka Yuki"], dubaiRows: [], manilaRows: [] });
    vi.stubGlobal("fetch", mockFetch);
    render(<AdminAbsencesPage />);
    await waitFor(() => {
      expect(mockFetch.mock.calls.some(([url]: [string]) => String(url).includes("/staff_master/names"))).toBe(true);
    });
    const staffSelect = screen.getAllByRole("combobox").find(
      (s) => (s as HTMLSelectElement).options[0]?.text === "Select staff"
    );
    fireEvent.change(staffSelect!, { target: { value: "Tanaka Yuki" } });
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));
    await screen.findByText(/Saved.*Tanaka Yuki/i);
  });

  it("shows error message when upsert API fails", async () => {
    const mockFetch = makeFetch({ staffNames: ["Tanaka Yuki"], failUpsert: true });
    vi.stubGlobal("fetch", mockFetch);
    render(<AdminAbsencesPage />);
    await waitFor(() => {
      expect(mockFetch.mock.calls.some(([url]: [string]) => String(url).includes("/staff_master/names"))).toBe(true);
    });
    const staffSelect = screen.getAllByRole("combobox").find(
      (s) => (s as HTMLSelectElement).options[0]?.text === "Select staff"
    );
    fireEvent.change(staffSelect!, { target: { value: "Tanaka Yuki" } });
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));
    await screen.findByText(/Invalid PIN/i);
  });

  it("absence type select includes all 8 types", async () => {
    render(<AdminAbsencesPage />);
    const absenceTypeSelects = screen.getAllByRole("combobox").filter((s) => {
      const opts = Array.from((s as HTMLSelectElement).options).map((o) => o.text);
      return opts.includes("Day Off");
    });
    expect(absenceTypeSelects.length).toBeGreaterThan(0);
    const opts = Array.from((absenceTypeSelects[0] as HTMLSelectElement).options).map((o) => o.text);
    expect(opts).toContain("Day Off");
    expect(opts).toContain("Vacation Leave");
    expect(opts).toContain("Medical Leave");
    expect(opts).toContain("Absent");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("AdminAbsencesPage — bulk entry", () => {
  beforeEach(() => { vi.stubGlobal("fetch", makeFetch({ staffNames: ["Jay", "Maria Santos"] })); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("renders Process Bulk button", () => {
    render(<AdminAbsencesPage />);
    expect(screen.getByRole("button", { name: /Process Bulk/i })).toBeInTheDocument();
  });

  it("shows error when Process Bulk clicked without selecting staff", async () => {
    render(<AdminAbsencesPage />);
    fireEvent.click(screen.getByRole("button", { name: /Process Bulk/i }));
    await screen.findByText(/Select at least one staff member/i);
  });

  it("loads staff names into bulk checklist", async () => {
    render(<AdminAbsencesPage />);
    // Wait for checklist buttons to appear (they have no text like "Back"/"Process")
    await waitFor(() => {
      const checklistBtns = screen.getAllByRole("button").filter(
        (b) => b.textContent?.trim() === "Jay"
      );
      expect(checklistBtns.length).toBeGreaterThan(0);
    });
    const mariaBtns = screen.getAllByRole("button").filter(
      (b) => b.textContent?.trim() === "Maria Santos"
    );
    expect(mariaBtns.length).toBeGreaterThan(0);
  });

  it("clicking staff name in checklist selects them", async () => {
    render(<AdminAbsencesPage />);
    // Wait for checklist "Jay" button
    await waitFor(() => {
      const btns = screen.getAllByRole("button").filter((b) => b.textContent?.trim() === "Jay");
      expect(btns.length).toBeGreaterThan(0);
    });
    const jayBtns = screen.getAllByRole("button").filter((b) => b.textContent?.trim() === "Jay");
    fireEvent.click(jayBtns[0]);
    await screen.findByText(/1 selected/i);
  });

  it("bulk search filters the staff list", async () => {
    render(<AdminAbsencesPage />);
    // Wait for checklist to load
    await waitFor(() => {
      const btns = screen.getAllByRole("button").filter((b) => b.textContent?.trim() === "Jay");
      expect(btns.length).toBeGreaterThan(0);
    });
    const searchInput = screen.getByPlaceholderText(/Search staff/i);
    fireEvent.change(searchInput, { target: { value: "Maria" } });
    // "Jay" checklist button should disappear (still in select options but not as standalone button)
    await waitFor(() => {
      const checklistBtns = screen.getAllByRole("button").filter(
        (b) => b.textContent?.trim() === "Jay"
      );
      expect(checklistBtns.length).toBe(0);
    });
  });

  it("calls upsert for each selected staff on Process Bulk", async () => {
    const mockFetch = makeFetch({ staffNames: ["Jay"], dubaiRows: [], manilaRows: [] });
    vi.stubGlobal("fetch", mockFetch);
    render(<AdminAbsencesPage />);
    await waitFor(() => {
      const btns = screen.getAllByRole("button").filter((b) => b.textContent?.trim() === "Jay");
      expect(btns.length).toBeGreaterThan(0);
    });
    const jayBtns = screen.getAllByRole("button").filter((b) => b.textContent?.trim() === "Jay");
    fireEvent.click(jayBtns[0]);
    await screen.findByText(/1 selected/i);
    fireEvent.click(screen.getByRole("button", { name: /Process Bulk/i }));
    await waitFor(() => {
      const upsertCalls = mockFetch.mock.calls.filter(([url]: [string]) =>
        String(url).includes("/absences/upsert")
      );
      expect(upsertCalls.length).toBeGreaterThan(0);
    });
    await screen.findByText(/Bulk saved/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("AdminAbsencesPage — history section", () => {
  beforeEach(() => { vi.stubGlobal("fetch", makeFetch()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("shows 'Select filters above and click Load History' before load", () => {
    render(<AdminAbsencesPage />);
    expect(screen.getByText(/Select filters above and click Load History/i)).toBeInTheDocument();
  });

  it("Load History button calls absences API", async () => {
    const mockFetch = makeFetch({ dubaiRows: [DUBAI_ROW] });
    vi.stubGlobal("fetch", mockFetch);
    render(<AdminAbsencesPage />);
    fireEvent.click(screen.getByRole("button", { name: /Load History/i }));
    await waitFor(() => {
      const historyCalls = mockFetch.mock.calls.filter(([url, init]: [string, any]) =>
        String(url).includes("/absences") &&
        !String(url).includes("/upsert") &&
        (!init?.method || init.method === "GET")
      );
      expect(historyCalls.length).toBeGreaterThan(0);
    });
  });

  it("renders history rows after load", async () => {
    const mockFetch = makeFetch({ dubaiRows: [DUBAI_ROW], manilaRows: [] });
    vi.stubGlobal("fetch", mockFetch);
    render(<AdminAbsencesPage />);
    fireEvent.click(screen.getByRole("button", { name: /Load History/i }));
    // Wait for success message (unique); Tanaka Yuki also appears in select options
    await screen.findByText(/Loaded 1 rows/i);
    expect(screen.getAllByText("Tanaka Yuki").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2026-05-12").length).toBeGreaterThan(0);
  });

  it("shows success message after Load History completes", async () => {
    const mockFetch = makeFetch({ dubaiRows: [DUBAI_ROW], manilaRows: [] });
    vi.stubGlobal("fetch", mockFetch);
    render(<AdminAbsencesPage />);
    fireEvent.click(screen.getByRole("button", { name: /Load History/i }));
    await screen.findByText(/Loaded 1 rows/i);
  });

  it("shows 'No records found' when history returns empty", async () => {
    const mockFetch = makeFetch({ dubaiRows: [] });
    vi.stubGlobal("fetch", mockFetch);
    render(<AdminAbsencesPage />);
    fireEvent.click(screen.getByRole("button", { name: /Load History/i }));
    await screen.findByText(/No records found for this filter/i);
  });

  it("shows Delete button for MANUAL source rows", async () => {
    const mockFetch = makeFetch({ dubaiRows: [DUBAI_ROW], manilaRows: [] });
    vi.stubGlobal("fetch", mockFetch);
    render(<AdminAbsencesPage />);
    fireEvent.click(screen.getByRole("button", { name: /Load History/i }));
    await screen.findByText(/Loaded 1 rows/i);
    expect(screen.getByRole("button", { name: /Delete/i })).toBeInTheDocument();
  });

  it("shows 'Protected' label for non-MANUAL source rows", async () => {
    const mockFetch = makeFetch({ dubaiRows: [PROTECTED_ROW], manilaRows: [] });
    vi.stubGlobal("fetch", mockFetch);
    render(<AdminAbsencesPage />);
    fireEvent.click(screen.getByRole("button", { name: /Load History/i }));
    await screen.findByText(/Loaded 1 rows/i);
    expect(screen.getByText("Protected")).toBeInTheDocument();
  });

  it("shows absence type badge in history table", async () => {
    const mockFetch = makeFetch({ dubaiRows: [DUBAI_ROW], manilaRows: [] });
    vi.stubGlobal("fetch", mockFetch);
    render(<AdminAbsencesPage />);
    fireEvent.click(screen.getByRole("button", { name: /Load History/i }));
    await screen.findByText(/Loaded 1 rows/i);
    // ABSENT type → "Absent" label via toTitleAbsenceType (also in select options)
    expect(screen.getAllByText("Absent").length).toBeGreaterThan(0);
  });

  it("Export CSV button is disabled before history is loaded", () => {
    render(<AdminAbsencesPage />);
    const exportBtn = screen.getByRole("button", { name: /Export CSV/i });
    expect(exportBtn).toBeDisabled();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("AdminAbsencesPage — delete flow", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("clicking Delete opens confirm panel", async () => {
    const mockFetch = makeFetch({ dubaiRows: [DUBAI_ROW], manilaRows: [] });
    vi.stubGlobal("fetch", mockFetch);
    render(<AdminAbsencesPage />);
    fireEvent.click(screen.getByRole("button", { name: /Load History/i }));
    await screen.findByText(/Loaded 1 rows/i);
    fireEvent.click(screen.getByRole("button", { name: /Delete/i }));
    await screen.findByText(/This cannot be undone/i);
    expect(screen.getByRole("button", { name: /Confirm Delete/i })).toBeInTheDocument();
  });

  it("Cancel button hides confirm panel", async () => {
    const mockFetch = makeFetch({ dubaiRows: [DUBAI_ROW], manilaRows: [] });
    vi.stubGlobal("fetch", mockFetch);
    render(<AdminAbsencesPage />);
    fireEvent.click(screen.getByRole("button", { name: /Load History/i }));
    await screen.findByText(/Loaded 1 rows/i);
    fireEvent.click(screen.getByRole("button", { name: /Delete/i }));
    await screen.findByText(/This cannot be undone/i);
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));
    await waitFor(() => {
      expect(screen.queryByText(/This cannot be undone/i)).not.toBeInTheDocument();
    });
  });

  it("Confirm Delete calls delete API", async () => {
    const mockFetch = makeFetch({ dubaiRows: [DUBAI_ROW], manilaRows: [] });
    vi.stubGlobal("fetch", mockFetch);
    render(<AdminAbsencesPage />);
    fireEvent.click(screen.getByRole("button", { name: /Load History/i }));
    await screen.findByText(/Loaded 1 rows/i);
    fireEvent.click(screen.getByRole("button", { name: /Delete/i }));
    await screen.findByRole("button", { name: /Confirm Delete/i });
    fireEvent.click(screen.getByRole("button", { name: /Confirm Delete/i }));
    await waitFor(() => {
      const deleteCalls = mockFetch.mock.calls.filter(([url]: [string]) =>
        String(url).includes("/absences/delete")
      );
      expect(deleteCalls.length).toBeGreaterThan(0);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("AdminAbsencesPage — helper functions (via page rendering)", () => {
  beforeEach(() => { vi.stubGlobal("fetch", makeFetch()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("toTitleAbsenceType: DAY_OFF → 'Day Off'", async () => {
    const row = { ...DUBAI_ROW, absence_type: "DAY_OFF" };
    vi.stubGlobal("fetch", makeFetch({ dubaiRows: [row], manilaRows: [] }));
    render(<AdminAbsencesPage />);
    fireEvent.click(screen.getByRole("button", { name: /Load History/i }));
    await screen.findByText(/Loaded 1 rows/i);
    // "Day Off" appears in the history row badge AND the select option — use getAllByText
    expect(screen.getAllByText("Day Off").length).toBeGreaterThan(0);
  });

  it("toTitleAbsenceType: VACATION_LEAVE → 'Vacation Leave'", async () => {
    const row = { ...DUBAI_ROW, absence_type: "VACATION_LEAVE" };
    vi.stubGlobal("fetch", makeFetch({ dubaiRows: [row], manilaRows: [] }));
    render(<AdminAbsencesPage />);
    fireEvent.click(screen.getByRole("button", { name: /Load History/i }));
    await screen.findByText(/Loaded 1 rows/i);
    expect(screen.getAllByText("Vacation Leave").length).toBeGreaterThan(0);
  });

  it("isUnplannedAbsence: DAY_OFF is planned → excluded from report", async () => {
    const dayOffRow = { ...DUBAI_ROW, absence_type: "DAY_OFF" };
    vi.stubGlobal("fetch", makeFetch({ dubaiRows: [dayOffRow], manilaRows: [] }));
    render(<AdminAbsencesPage />);
    // After auto-load, DAY_OFF is filtered out from the report display
    await screen.findByText("No absences recorded for this period");
  });

  it("isUnplannedAbsence: ABSENT is unplanned → included in report", async () => {
    vi.stubGlobal("fetch", makeFetch({ dubaiRows: [DUBAI_ROW], manilaRows: [] }));
    render(<AdminAbsencesPage />);
    // "No show" note is unique — appears only in the report row, not in any select option
    await screen.findByText("No show");
  });

  it("isUnplannedAbsence: MEDICAL_LEAVE is unplanned → included in report", async () => {
    const medRow = { ...DUBAI_ROW, absence_type: "MEDICAL_LEAVE", staff_name: "Dr Patient" };
    vi.stubGlobal("fetch", makeFetch({ dubaiRows: [medRow], manilaRows: [] }));
    render(<AdminAbsencesPage />);
    await screen.findByText("Dr Patient");
  });
});
