// tests/admin/attendance/attendance-subpages.test.tsx
// Tests for: employees, locations, history, import, monthly-closing pages.

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── next/navigation ────────────────────────────────────────────────────────────
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/attendance/sub",
}));

// ── next/link ─────────────────────────────────────────────────────────────────
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));

// ── framer-motion ─────────────────────────────────────────────────────────────
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// ── lucide-react ──────────────────────────────────────────────────────────────
vi.mock("lucide-react", () => ({
  CalendarCheck: () => <svg data-testid="icon-cal" />,
  Copy: () => <svg data-testid="icon-copy" />,
  Download: () => <svg data-testid="icon-download" />,
  CheckCircle: () => <svg data-testid="icon-check-circle" />,
  CheckCircle2: () => <svg data-testid="icon-check2" />,
  FolderSearch: () => <svg data-testid="icon-folder" />,
  History: () => <svg data-testid="icon-history" />,
  MapPin: () => <svg data-testid="icon-map" />,
  RefreshCw: () => <svg data-testid="icon-refresh" />,
  Upload: () => <svg data-testid="icon-upload" />,
  Users: () => <svg data-testid="icon-users" />,
  XCircle: () => <svg data-testid="icon-x" />,
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
  KPI_CARD: "kpi-card",
  KPI_LABEL: "kpi-label",
  KPI_VALUE: "kpi-value",
  PRIMARY_BUTTON: "primary-button",
  SECONDARY_BUTTON: "secondary-button",
  SELECT_CLASS: "select-class",
  SMALL_BUTTON: "small-button",
  TABLE_CELL: "table-cell",
  TABLE_HEADER: "table-header",
  TABLE_ROW: "table-row",
  T_BODY: "t-body",
  T_CAPTION: "t-caption",
  T_LABEL: "t-label",
  T_PAGE_TITLE: "t-page-title",
  T_SECTION: "t-section",
}));

// ── formatters ────────────────────────────────────────────────────────────────
vi.mock("@/lib/formatters", () => ({
  fmtNum: (v: number) => String(v ?? 0),
}));

// ── dateInput ─────────────────────────────────────────────────────────────────
vi.mock("@/lib/dateInput", () => ({
  normalizeCalendarDateInput: (v: string) => v,
}));

// ── auth ──────────────────────────────────────────────────────────────────────
const ATT_AUTH = {
  accessToken: "tok-att",
  role: "HQ",
  city: "dubai",
  staffName: "Jay",
  permissions: ["attendance.read"],
  pin: "1234",
};
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getAuth: vi.fn(() => ATT_AUTH),
    refreshAuthFromApi: vi.fn(async () => ATT_AUTH),
    canAccessAdminNav: vi.fn(() => true),
    getAuthHeaders: vi.fn(() => ({ Authorization: "Bearer tok-att" })),
  };
});

// ── fetch mock helper ─────────────────────────────────────────────────────────
let mockFetch: ReturnType<typeof vi.fn>;

// ══════════════════════════════════════════════════════════════════════════════
// ── EMPLOYEES PAGE ────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const EMP_ITEM = {
  employee_unique_key: "emp-key-1",
  employee_name_raw: "Tanaka Yuki",
  employee_id_raw: "EMP001",
  city: "dubai",
  suggested_staff_name: "Tanaka",
  mapped_staff_name: null,
  observed_row_count: 10,
  first_seen_at: "2026-05-01T08:00:00Z",
  last_seen_at: "2026-05-10T17:00:00Z",
};

const EMP_ITEM_MATCHED = {
  ...EMP_ITEM,
  employee_unique_key: "emp-key-2",
  employee_name_raw: "Santos Maria",
  employee_id_raw: "EMP002",
  suggested_staff_name: "Maria Santos",
  mapped_staff_name: "Maria Santos",
};

import AttendanceEmployeesPage from "@/app/admin/attendance/employees/page";

function makeEmployeesFetch(items: any[] = [EMP_ITEM]) {
  return vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("/employee-matches")) {
      return { ok: true, status: 200, json: async () => ({ items }) } as any;
    }
    if (u.includes("/staff_master/names")) {
      return { ok: true, status: 200, json: async () => ({ names: ["Tanaka", "Maria Santos", "Jay"] }) } as any;
    }
    return { ok: false, status: 404, json: async () => ({}) } as any;
  });
}

describe("AttendanceEmployeesPage — data loading", () => {
  beforeEach(() => {
    mockFetch = makeEmployeesFetch();
    vi.stubGlobal("fetch", mockFetch);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("shows 'Loading...' while fetching", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<AttendanceEmployeesPage />);
    await screen.findByText("Loading...");
  });

  it("renders employee rows after load", async () => {
    render(<AttendanceEmployeesPage />);
    await screen.findByText("Tanaka Yuki");
    expect(screen.getByText(/EMP001/)).toBeInTheDocument();
  });

  it("shows 'No employees found.' when list is empty", async () => {
    vi.stubGlobal("fetch", makeEmployeesFetch([]));
    render(<AttendanceEmployeesPage />);
    await screen.findByText("No employees found.");
  });

  it("shows error banner when API fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/employee-matches"))
        return { ok: false, status: 500, json: async () => ({}) } as any;
      return { ok: true, status: 200, json: async () => ({ names: [] }) } as any;
    }));
    render(<AttendanceEmployeesPage />);
    await screen.findByText(/Failed to load employee matches/i);
  });

  it("shows 'Unmatched' badge for unmatched employee", async () => {
    render(<AttendanceEmployeesPage />);
    await screen.findByText("Tanaka Yuki");
    // mapped_staff_name is null → Unmatched badge appears
    expect(screen.getAllByText("Unmatched").length).toBeGreaterThan(0);
  });

  it("shows 'Matched' badge for matched employee", async () => {
    vi.stubGlobal("fetch", makeEmployeesFetch([EMP_ITEM_MATCHED]));
    render(<AttendanceEmployeesPage />);
    // page defaults to unmatchedOnly=true — toggle it off to show all employees
    await waitFor(() => expect(screen.queryByText("Loading...")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("checkbox"));
    await screen.findByText("Santos Maria");
    expect(screen.getAllByText("Matched").length).toBeGreaterThan(0);
  });

  it("Save button calls upsert endpoint with correct payload", async () => {
    render(<AttendanceEmployeesPage />);
    await screen.findByText("Tanaka Yuki");
    // Change select to "Tanaka"
    const select = screen.getAllByRole("combobox")[1]; // city select is first
    fireEvent.change(select, { target: { value: "Tanaka" } });
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));
    await waitFor(() => {
      const upsertCall = mockFetch.mock.calls.find(([url]: [string]) =>
        String(url).includes("/employee-matches/upsert")
      );
      expect(upsertCall).toBeDefined();
      const body = JSON.parse(upsertCall![1].body as string);
      expect(body.canonical_staff_name).toBe("Tanaka");
      expect(body.employee_name_raw).toBe("Tanaka Yuki");
    });
  });

  it("shows error when saving without selecting staff name", async () => {
    vi.stubGlobal("fetch", makeEmployeesFetch([{ ...EMP_ITEM, suggested_staff_name: null, mapped_staff_name: null }]));
    render(<AttendanceEmployeesPage />);
    await screen.findByText("Tanaka Yuki");
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));
    await screen.findByText(/Canonical staff name is required/i);
  });

  it("shows page title and back link", async () => {
    render(<AttendanceEmployeesPage />);
    await screen.findByText("Attendance Employee Matching");
    expect(screen.getByRole("link", { name: /Back to Attendance/i })).toHaveAttribute("href", "/admin/attendance");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// ── LOCATIONS PAGE ────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const LOC_MAPPED = {
  id: 1,
  raw_location: "JBR Office",
  city: "dubai",
  canonical_branch_code: "JBR",
  seen_count: 15,
  first_seen_at: "2026-04-01T08:00:00Z",
  last_seen_at: "2026-05-10T17:00:00Z",
};

const LOC_UNMAPPED = {
  id: 2,
  raw_location: "New Location",
  city: "dubai",
  canonical_branch_code: null,
  seen_count: 3,
  first_seen_at: "2026-05-01T08:00:00Z",
  last_seen_at: "2026-05-10T17:00:00Z",
};

import AttendanceLocationsPage from "@/app/admin/attendance/locations/page";

function makeLocationsFetch(items: any[] = [LOC_MAPPED]) {
  return vi.fn(async () => ({
    ok: true, status: 200,
    json: async () => ({ items }),
  }) as any);
}

describe("AttendanceLocationsPage — data loading", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", makeLocationsFetch());
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("shows 'Loading...' initially", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<AttendanceLocationsPage />);
    await screen.findByText("Loading...");
  });

  it("renders location rows after load", async () => {
    render(<AttendanceLocationsPage />);
    await screen.findByText("JBR Office");
  });

  it("shows 'No locations found.' when list is empty", async () => {
    vi.stubGlobal("fetch", makeLocationsFetch([]));
    render(<AttendanceLocationsPage />);
    await screen.findByText("No locations found.");
  });

  it("shows error banner when API fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false, status: 500, json: async () => ({}),
    })));
    render(<AttendanceLocationsPage />);
    await screen.findByText(/Failed to load locations/i);
  });

  it("shows mapped branch code badge for mapped location", async () => {
    render(<AttendanceLocationsPage />);
    await screen.findByText("JBR Office");
    expect(screen.getByText("JBR")).toBeInTheDocument();
  });

  it("shows 'Unmapped' warning badge for unmapped location", async () => {
    vi.stubGlobal("fetch", makeLocationsFetch([LOC_UNMAPPED]));
    render(<AttendanceLocationsPage />);
    await screen.findByText("New Location");
    expect(screen.getByText("Unmapped")).toBeInTheDocument();
  });

  it("shows page title and back link", async () => {
    render(<AttendanceLocationsPage />);
    await screen.findByText("Attendance Locations");
    expect(screen.getByRole("link", { name: /Back to Attendance/i })).toHaveAttribute("href", "/admin/attendance");
  });

  it("total count updates after load", async () => {
    vi.stubGlobal("fetch", makeLocationsFetch([LOC_MAPPED, LOC_UNMAPPED]));
    render(<AttendanceLocationsPage />);
    await screen.findByText("JBR Office");
    expect(screen.getByText(/Total: 2/i)).toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// ── HISTORY PAGE ──────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const HISTORY_ROW = {
  id: "batch-1",
  batch_id: "BATCH-001",
  city: "dubai",
  source_system: "bayzat",
  file_name: "attendance_dubai_2026-05.xlsx",
  file_type: "xlsx",
  status: "SUCCESS",
  imported_rows: 42,
  skipped_rows: 0,
  duplicate_rows: 0,
  error_rows: 0,
  created_by: "Jay",
  created_by_role: "HQ",
  notes: "",
  started_at: "2026-05-10T09:00:00Z",
  finished_at: "2026-05-10T09:01:00Z",
  created_at: "2026-05-10T09:00:00Z",
  file_hash: "abc123",
  target_date: "2026-05-10",
  date_from: "2026-05-01",
  date_to: "2026-05-10",
};

const HISTORY_ROW_FAILED = {
  ...HISTORY_ROW,
  id: "batch-2",
  batch_id: "BATCH-002",
  status: "FAILED",
  imported_rows: 0,
  error_rows: 5,
  file_name: "bad_file.xlsx",
};

import AttendanceHistoryPage from "@/app/admin/attendance/history/page";

function makeHistoryFetch(rows: any[] = [HISTORY_ROW]) {
  return vi.fn(async () => ({
    ok: true, status: 200,
    text: async () => JSON.stringify({ ok: true, rows }),
  }) as any);
}

describe("AttendanceHistoryPage — data loading", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", makeHistoryFetch());
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("renders page heading", async () => {
    render(<AttendanceHistoryPage />);
    await screen.findByText("Attendance Import History");
  });

  it("renders history rows in table after load", async () => {
    render(<AttendanceHistoryPage />);
    await screen.findByText("attendance_dubai_2026-05.xlsx");
    expect(screen.getByText("BATCH-001")).toBeInTheDocument();
  });

  it("shows SUCCESS status badge for successful import", async () => {
    render(<AttendanceHistoryPage />);
    await screen.findByText("attendance_dubai_2026-05.xlsx");
    expect(screen.getAllByText("SUCCESS").length).toBeGreaterThan(0);
  });

  it("shows FAILED status badge for failed import", async () => {
    vi.stubGlobal("fetch", makeHistoryFetch([HISTORY_ROW_FAILED]));
    render(<AttendanceHistoryPage />);
    await screen.findByText("bad_file.xlsx");
    expect(screen.getAllByText("FAILED").length).toBeGreaterThan(0);
  });

  it("shows error when API fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false, status: 500, text: async () => "Server error",
    })));
    render(<AttendanceHistoryPage />);
    await screen.findByText(/Server error/i);
  });

  it("shows KPI summary cards: Total, Success, Failed, Duplicates", async () => {
    render(<AttendanceHistoryPage />);
    await screen.findByText("attendance_dubai_2026-05.xlsx");
    expect(screen.getByText("Total Batches")).toBeInTheDocument();
    expect(screen.getByText("Success")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Duplicate Related")).toBeInTheDocument();
  });

  it("Refresh button triggers reload", async () => {
    const mockFetchSpy = makeHistoryFetch();
    vi.stubGlobal("fetch", mockFetchSpy);
    render(<AttendanceHistoryPage />);
    await screen.findByText("attendance_dubai_2026-05.xlsx");
    const callsBefore = mockFetchSpy.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /Refresh/i }));
    await waitFor(() => {
      expect(mockFetchSpy.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it("back link points to /admin/attendance", async () => {
    render(<AttendanceHistoryPage />);
    await screen.findByText("Attendance Import History");
    expect(screen.getByRole("link", { name: /Back to Attendance/i })).toHaveAttribute("href", "/admin/attendance");
  });
});

describe("AttendanceHistoryPage — duplicate filter", () => {
  beforeEach(() => {
    const rows = [
      HISTORY_ROW,
      { ...HISTORY_ROW_FAILED, id: "dup", status: "DUPLICATE", duplicate_rows: 5 },
    ];
    vi.stubGlobal("fetch", makeHistoryFetch(rows));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("'Show duplicates only' checkbox filters to duplicate rows", async () => {
    render(<AttendanceHistoryPage />);
    await screen.findByText("attendance_dubai_2026-05.xlsx");
    expect(screen.getByText("attendance_dubai_2026-05.xlsx")).toBeInTheDocument();
    expect(screen.getByText("bad_file.xlsx")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Show duplicates only/i }));
    await waitFor(() => {
      expect(screen.queryByText("attendance_dubai_2026-05.xlsx")).not.toBeInTheDocument();
    });
    expect(screen.getByText("bad_file.xlsx")).toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// ── IMPORT PAGE ───────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

import AttendanceImportPage from "@/app/admin/attendance/import/page";

describe("AttendanceImportPage — form and buttons", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("renders page heading", () => {
    render(<AttendanceImportPage />);
    expect(screen.getByText("Attendance Drive Sync")).toBeInTheDocument();
  });

  it("pre-fills Approver Name from auth", () => {
    render(<AttendanceImportPage />);
    const nameInput = screen.getByPlaceholderText(/HQ \/ ADMIN name/i) as HTMLInputElement;
    expect(nameInput.value).toBe("Jay");
  });

  it("'Sync All' button is disabled when approver name is empty", () => {
    render(<AttendanceImportPage />);
    const nameInput = screen.getByPlaceholderText(/HQ \/ ADMIN name/i);
    fireEvent.change(nameInput, { target: { value: "" } });
    const syncBtn = screen.getByRole("button", { name: /Sync All/i });
    expect(syncBtn).toBeDisabled();
  });

  it("'Drive File List' button is enabled when credentials are filled", async () => {
    render(<AttendanceImportPage />);
    // Jay is pre-filled, just need PIN
    const pinInput = screen.getByPlaceholderText(/PIN/i);
    fireEvent.change(pinInput, { target: { value: "1234" } });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Drive File List/i })).not.toBeDisabled();
    });
  });

  it("clicking 'Sync All' calls sync-all API", async () => {
    const mockFetchSpy = vi.fn(async () => ({
      ok: true, status: 200,
      text: async () => JSON.stringify({
        ok: true, files_checked: 3, files_imported: 1, files_skipped: 2, items: [],
      }),
    }));
    vi.stubGlobal("fetch", mockFetchSpy);
    render(<AttendanceImportPage />);
    const syncBtn = screen.getByRole("button", { name: /Sync All/i });
    fireEvent.click(syncBtn);
    await waitFor(() => {
      const syncCall = mockFetchSpy.mock.calls.find(([url]: [string]) =>
        String(url).includes("/drive/sync-all")
      );
      expect(syncCall).toBeDefined();
      expect(syncCall![1].method).toBe("POST");
    });
  });

  it("shows Sync All result after successful sync", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, status: 200,
      text: async () => JSON.stringify({
        ok: true,
        files_checked: 2,
        files_imported: 1,
        files_skipped: 1,
        items: [
          { file_id: "f1", file_name: "dubai_may.xlsx", duplicate: false, imported_count: 42 },
          { file_id: "f2", file_name: "old_file.xlsx", duplicate: true, imported_count: 0 },
        ],
      }),
    })));
    render(<AttendanceImportPage />);
    fireEvent.click(screen.getByRole("button", { name: /Sync All/i }));
    await screen.findByText("Sync All Result");
    expect(screen.getByText("dubai_may.xlsx")).toBeInTheDocument();
    expect(screen.getByText("old_file.xlsx")).toBeInTheDocument();
    expect(screen.getByText("Imported")).toBeInTheDocument();
    expect(screen.getByText("Skip")).toBeInTheDocument();
  });

  it("shows error when sync fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false, status: 403,
      text: async () => "Permission denied",
    })));
    render(<AttendanceImportPage />);
    fireEvent.click(screen.getByRole("button", { name: /Sync All/i }));
    await screen.findByText(/Permission denied|permission|forbidden/i);
  });

  it("clicking 'Drive File List' shows file list", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, status: 200,
      text: async () => JSON.stringify({
        items: [
          { id: "file-1", name: "bayzat_dubai.xlsx", mimeType: "application/xlsx", modifiedTime: "2026-05-10" },
        ],
      }),
    })));
    render(<AttendanceImportPage />);
    fireEvent.click(screen.getByRole("button", { name: /Drive File List/i }));
    // The heading also says "Drive File List" after load — just verify the file name appears
    await screen.findByText("bayzat_dubai.xlsx");
  });

  it("shows folder ID in the UI", () => {
    render(<AttendanceImportPage />);
    expect(screen.getByText("0AJRy_FdAYDp2Uk9PVA")).toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// ── MONTHLY CLOSING PAGE ──────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

import AttendanceMonthlyClosingPage from "@/app/admin/attendance/monthly-closing/page";

describe("AttendanceMonthlyClosingPage", () => {
  it("renders page heading", () => {
    render(<AttendanceMonthlyClosingPage />);
    expect(screen.getByText("Attendance Monthly Closing")).toBeInTheDocument();
  });

  it("shows month status rows: Current Month, Previous Month, Older Periods", () => {
    render(<AttendanceMonthlyClosingPage />);
    expect(screen.getByText("Current Month")).toBeInTheDocument();
    expect(screen.getByText("Previous Month")).toBeInTheDocument();
    expect(screen.getByText("Older Periods")).toBeInTheDocument();
  });

  it("shows status labels: In review, Closed, Open", () => {
    render(<AttendanceMonthlyClosingPage />);
    // each status renders in both a <p> and a badge <span>
    expect(screen.getAllByText("In review").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Closed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Open").length).toBeGreaterThan(0);
  });

  it("back link points to /admin/attendance", () => {
    render(<AttendanceMonthlyClosingPage />);
    expect(screen.getByRole("link", { name: /Back to Attendance/i })).toHaveAttribute("href", "/admin/attendance");
  });

  it("confirm dialog initially hidden", () => {
    render(<AttendanceMonthlyClosingPage />);
    expect(screen.queryByText(/Are you sure/i)).not.toBeInTheDocument();
  });
});
