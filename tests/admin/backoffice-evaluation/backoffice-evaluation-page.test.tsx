// tests/admin/backoffice-evaluation/backoffice-evaluation-page.test.tsx
// Comprehensive tests for src/app/admin/backoffice-evaluation/page.tsx
// Covers: access control, page structure, scoring criteria, evaluation context,
//         loadSummary, Bayzat Sync, Sync+Score, staff scores table, improvement actions.

import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── framer-motion ─────────────────────────────────────────────────────────────
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, className, style, ...rest }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement("div", { className, style }, children),
  },
}));

// ── lucide-react ─────────────────────────────────────────────────────────────
vi.mock("lucide-react", () => ({
  BarChart3: () => null,
  ClipboardCheck: () => null,
  InboxIcon: () => null,
  Lightbulb: () => null,
  Plus: () => null,
  RefreshCw: () => null,
  Settings2: () => null,
  TrendingUp: () => null,
  Users: () => null,
  Zap: () => null,
}));

// ── Auth mocks ────────────────────────────────────────────────────────────────
const BASE_AUTH = {
  staffName: "Alice Manager",
  city: "manila" as const,
  role: "HQ",
  accessToken: "tok-test",
  pin: "1234",
  permissions: ["channel.admin.backoffice_evaluation.view"],
};

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getAuth: vi.fn(),
    refreshAuthFromApi: vi.fn(),
    canAccessBackofficeEvaluationAdmin: vi.fn(),
  };
});

// ── Test fixtures ─────────────────────────────────────────────────────────────
const API_BASE = "https://api.test";

const DEFAULT_ATTENDANCE_STATUS = {
  city: "manila",
  month_key: "2026-05",
  attendance_last_date: "2026-05-10",
  attendance_date_count: 10,
  attendance_staff_count: 5,
  matched_staff_count: 4,
};

const SCORE_ROWS = [
  {
    city: "manila",
    month_key: "2026-05",
    staff_name: "Alice Garcia",
    role_name: "Data Entry",
    workload_score: 70,
    speed_score: 80,
    quality_score: 75,
    progress_score: 72,
    total_score: 74.5,
    issue_points_json: [],
    improvement_points_json: [],
    status: "scored",
    scored_by: "admin",
  },
  {
    city: "manila",
    month_key: "2026-05",
    staff_name: "Bob Santos",
    role_name: "Finance",
    workload_score: 65,
    speed_score: 78,
    quality_score: 80,
    progress_score: 73,
    total_score: 76.5,
    issue_points_json: [],
    improvement_points_json: [],
    status: "scored",
    scored_by: "admin",
  },
];

const DEFAULT_SUMMARY = {
  summary: {
    staff_count: 2,
    avg_total_score: 75.5,
    avg_workload_score: 67.5,
    avg_speed_score: 79.0,
    avg_quality_score: 77.5,
    avg_progress_score: 72.5,
    by_role: [
      { role_name: "Data Entry", staff_count: 1, avg_total_score: 74.5 },
    ],
  },
  attendance_status: DEFAULT_ATTENDANCE_STATUS,
  rows: SCORE_ROWS,
};

const SAMPLE_ACTIONS = [
  {
    id: 1,
    city: "manila",
    month_key: "2026-05",
    staff_name: "Alice Garcia",
    action_title: "Reduce error rate",
    action_detail: "Review submission checklist daily",
    action_owner: "Alice Manager",
    due_date: "2026-05-31",
    status: "OPEN",
    updated_by: "Alice Manager",
    updated_at: "2026-05-01T00:00:00Z",
  },
  {
    id: 2,
    city: "manila",
    month_key: "2026-05",
    staff_name: "Alice Garcia",
    action_title: "Speed improvement",
    action_detail: "Complete tasks within the same day",
    action_owner: "Alice Manager",
    due_date: "2026-05-15",
    status: "DONE",
    updated_by: "Alice Manager",
    updated_at: "2026-05-10T00:00:00Z",
  },
];

// ── Fetch factory ─────────────────────────────────────────────────────────────
type MockOverride = {
  match?: string | RegExp;
  method?: string;
  status?: number;
  body?: unknown;
};

function makeFetch(overrides: MockOverride[] = []) {
  return vi.fn(async (url: string, opts?: RequestInit) => {
    const method = ((opts?.method as string) || "GET").toUpperCase();
    const u = String(url);

    for (const ov of overrides) {
      if (ov.match) {
        const hit = typeof ov.match === "string" ? u.includes(ov.match) : ov.match.test(u);
        if (!hit) continue;
      }
      if (ov.method && ov.method.toUpperCase() !== method) continue;
      const status = ov.status ?? 200;
      const body = ov.body !== undefined ? JSON.stringify(ov.body) : "{}";
      return new Response(body, { status, headers: { "Content-Type": "application/json" } });
    }

    // Default happy responses
    if (u.includes("/attendance-status"))
      return new Response(JSON.stringify({ attendance_status: DEFAULT_ATTENDANCE_STATUS }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    if (u.includes("/summary"))
      return new Response(JSON.stringify(DEFAULT_SUMMARY), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    if (u.includes("/actions/upsert"))
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    if (u.includes("/actions"))
      return new Response(JSON.stringify({ rows: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    if (u.includes("/bayzat-sync"))
      return new Response(JSON.stringify({ attendance_status: DEFAULT_ATTENDANCE_STATUS }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    if (u.includes("/sync-from-sheet"))
      return new Response(JSON.stringify({ attendance_status: DEFAULT_ATTENDANCE_STATUS }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

import AdminBackofficeEvaluationPage from "@/app/admin/backoffice-evaluation/page";

// ── Render helpers ────────────────────────────────────────────────────────────
async function setupMocks() {
  const { getAuth, refreshAuthFromApi, canAccessBackofficeEvaluationAdmin } = await import("@/lib/auth");
  vi.mocked(getAuth).mockReturnValue(BASE_AUTH as any);
  vi.mocked(refreshAuthFromApi).mockResolvedValue(BASE_AUTH as any);
  vi.mocked(canAccessBackofficeEvaluationAdmin).mockReturnValue(true);
}

async function renderPage(fetchMock = makeFetch()) {
  await setupMocks();
  vi.stubGlobal("fetch", fetchMock);
  render(<AdminBackofficeEvaluationPage />);
}

/** Render page and wait until allowed=true (page title appears). */
async function renderAndLoad(fetchMock = makeFetch()) {
  await renderPage(fetchMock);
  await screen.findByText("Backoffice Daily Evaluation", {}, { timeout: 5000 });
}

/** Render page and wait for summary data to be populated. */
async function renderWithData(fetchMock = makeFetch()) {
  await renderAndLoad(fetchMock);
  await screen.findByText("Alice Garcia", {}, { timeout: 5000 });
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("AdminBackofficeEvaluationPage", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = API_BASE;
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
  });

  // ── Access Control ──────────────────────────────────────────────────────────
  describe("access control", () => {
    it("shows access denied when canAccessBackofficeEvaluationAdmin returns false", async () => {
      const { getAuth, refreshAuthFromApi, canAccessBackofficeEvaluationAdmin } = await import("@/lib/auth");
      vi.mocked(getAuth).mockReturnValue(BASE_AUTH as any);
      vi.mocked(refreshAuthFromApi).mockResolvedValue(BASE_AUTH as any);
      vi.mocked(canAccessBackofficeEvaluationAdmin).mockReturnValue(false);
      vi.stubGlobal("fetch", makeFetch());

      render(<AdminBackofficeEvaluationPage />);

      await waitFor(() => {
        expect(
          screen.getByText(/Backoffice Evaluation page is available only to HQ\/HR Manager/i)
        ).toBeInTheDocument();
      });
    });

    it("does not render the main page content when access is denied", async () => {
      const { getAuth, refreshAuthFromApi, canAccessBackofficeEvaluationAdmin } = await import("@/lib/auth");
      vi.mocked(getAuth).mockReturnValue(BASE_AUTH as any);
      vi.mocked(refreshAuthFromApi).mockResolvedValue(BASE_AUTH as any);
      vi.mocked(canAccessBackofficeEvaluationAdmin).mockReturnValue(false);
      vi.stubGlobal("fetch", makeFetch());

      render(<AdminBackofficeEvaluationPage />);

      await waitFor(() => {
        expect(screen.queryByText("Backoffice Daily Evaluation")).not.toBeInTheDocument();
        expect(screen.queryByText("Evaluation Context")).not.toBeInTheDocument();
      });
    });

    it("renders the full page when access is granted", async () => {
      await renderAndLoad();
      expect(screen.getByText("Backoffice Daily Evaluation")).toBeInTheDocument();
    });
  });

  // ── Page Structure ──────────────────────────────────────────────────────────
  describe("page structure", () => {
    it("shows the page title", async () => {
      await renderAndLoad();
      expect(screen.getByText("Backoffice Daily Evaluation")).toBeInTheDocument();
    });

    it("shows the subtitle caption", async () => {
      await renderAndLoad();
      expect(screen.getByText(/HQ \/ HR Manager only/i)).toBeInTheDocument();
    });

    it("shows Scoring Criteria section", async () => {
      await renderAndLoad();
      expect(screen.getByText("Scoring Criteria")).toBeInTheDocument();
    });

    it("shows Evaluation Context section", async () => {
      await renderAndLoad();
      expect(screen.getByText("Evaluation Context")).toBeInTheDocument();
    });

    it("shows Score Summary section", async () => {
      await renderAndLoad();
      expect(screen.getByText("Score Summary")).toBeInTheDocument();
    });

    it("shows Staff Scores section", async () => {
      await renderAndLoad();
      expect(screen.getByText("Staff Scores")).toBeInTheDocument();
    });

    it("shows Improvement Actions section", async () => {
      await renderAndLoad();
      expect(screen.getByText(/Improvement Actions/i)).toBeInTheDocument();
    });

    it("shows Bayzat Sync button", async () => {
      await renderAndLoad();
      expect(screen.getByRole("button", { name: /Bayzat Sync/i })).toBeInTheDocument();
    });

    it("shows Sync + Score button", async () => {
      await renderAndLoad();
      expect(screen.getByRole("button", { name: /Sync \+ Score/i })).toBeInTheDocument();
    });

    it("shows Refresh button in Score Summary", async () => {
      await renderAndLoad();
      expect(screen.getByRole("button", { name: /Refresh/i })).toBeInTheDocument();
    });
  });

  // ── Scoring Criteria ────────────────────────────────────────────────────────
  describe("scoring criteria", () => {
    it("shows all four criteria labels", async () => {
      await renderAndLoad();
      const workloads = screen.getAllByText(/Workload/i);
      const speeds = screen.getAllByText(/Speed/i);
      const qualities = screen.getAllByText(/Quality/i);
      const progresses = screen.getAllByText(/Progress/i);
      expect(workloads.length).toBeGreaterThanOrEqual(1);
      expect(speeds.length).toBeGreaterThanOrEqual(1);
      expect(qualities.length).toBeGreaterThanOrEqual(1);
      expect(progresses.length).toBeGreaterThanOrEqual(1);
    });

    it("shows Workload at 10%", async () => {
      await renderAndLoad();
      const pcts = screen.getAllByText("10%");
      expect(pcts.length).toBeGreaterThanOrEqual(1);
    });

    it("shows Quality at 35%", async () => {
      await renderAndLoad();
      expect(screen.getByText("35%")).toBeInTheDocument();
    });

    it("shows Progress at 45%", async () => {
      await renderAndLoad();
      expect(screen.getByText("45%")).toBeInTheDocument();
    });

    it("shows English description for Workload", async () => {
      await renderAndLoad();
      expect(screen.getByText(/submission \/ work volume/i)).toBeInTheDocument();
    });

    it("shows English description for Speed", async () => {
      await renderAndLoad();
      expect(screen.getByText(/on-time \/ same-day handling/i)).toBeInTheDocument();
    });

    it("shows English description for Quality", async () => {
      await renderAndLoad();
      expect(screen.getByText(/low error rate/i)).toBeInTheDocument();
    });

    it("shows English description for Progress", async () => {
      await renderAndLoad();
      expect(screen.getByText(/completion against plan/i)).toBeInTheDocument();
    });
  });

  // ── Evaluation Context Controls ─────────────────────────────────────────────
  describe("evaluation context controls", () => {
    it("defaults to manila city", async () => {
      await renderAndLoad();
      const allSelects = screen.getAllByRole("combobox") as HTMLSelectElement[];
      const citySelect = allSelects.find((s) =>
        Array.from(s.querySelectorAll("option")).some(
          (o) => (o as HTMLOptionElement).value === "manila"
        ) &&
        Array.from(s.querySelectorAll("option")).some(
          (o) => (o as HTMLOptionElement).value === "dubai"
        )
      );
      expect(citySelect).toBeTruthy();
      expect(citySelect!.value).toBe("manila");
    });

    it("can change city to dubai", async () => {
      await renderAndLoad();
      const allSelects = screen.getAllByRole("combobox") as HTMLSelectElement[];
      const citySelect = allSelects.find((s) =>
        Array.from(s.querySelectorAll("option")).some(
          (o) => (o as HTMLOptionElement).value === "dubai"
        )
      )!;
      fireEvent.change(citySelect, { target: { value: "dubai" } });
      expect(citySelect.value).toBe("dubai");
    });

    it("shows city options: manila and dubai", async () => {
      await renderAndLoad();
      const allSelects = screen.getAllByRole("combobox") as HTMLSelectElement[];
      const citySelect = allSelects.find((s) =>
        Array.from(s.querySelectorAll("option")).some(
          (o) => (o as HTMLOptionElement).value === "dubai"
        )
      )!;
      const options = Array.from(citySelect.querySelectorAll("option")).map(
        (o) => (o as HTMLOptionElement).value
      );
      expect(options).toContain("manila");
      expect(options).toContain("dubai");
    });

    it("approver name field is read-only", async () => {
      await renderAndLoad();
      // Find the read-only text input (approver name)
      const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
      const readOnlyInput = inputs.find((i) => i.hasAttribute("readonly") || i.readOnly);
      expect(readOnlyInput).toBeTruthy();
      expect(readOnlyInput!.value).toBe("Alice Manager");
    });

    it("approver name shows staff name from auth", async () => {
      await renderAndLoad();
      const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
      const approverInput = inputs.find((i) => i.readOnly && i.value === "Alice Manager");
      expect(approverInput).toBeTruthy();
    });

    it("PIN field is type password", async () => {
      await renderAndLoad();
      const pinInput = document.querySelector('input[type="password"]') as HTMLInputElement;
      expect(pinInput).toBeTruthy();
      expect(pinInput.value).toBe("1234");
    });

    it("month input is type month", async () => {
      await renderAndLoad();
      const monthInput = document.querySelector('input[type="month"]') as HTMLInputElement;
      expect(monthInput).toBeTruthy();
    });

    it("action status select has OPEN, IN_PROGRESS, DONE, HOLD options", async () => {
      await renderAndLoad();
      const allSelects = screen.getAllByRole("combobox") as HTMLSelectElement[];
      const statusSelect = allSelects.find((s) =>
        Array.from(s.querySelectorAll("option")).some(
          (o) => (o as HTMLOptionElement).value === "IN_PROGRESS"
        )
      );
      expect(statusSelect).toBeTruthy();
      const values = Array.from(statusSelect!.querySelectorAll("option")).map(
        (o) => (o as HTMLOptionElement).value
      );
      expect(values).toContain("OPEN");
      expect(values).toContain("IN_PROGRESS");
      expect(values).toContain("DONE");
      expect(values).toContain("HOLD");
    });
  });

  // ── Sync + Score disabled state ─────────────────────────────────────────────
  describe("Sync + Score disabled state", () => {
    it("Sync + Score is disabled when attendance_staff_count is 0 and no bayzat session", async () => {
      const noAttendanceFetch = makeFetch([
        {
          match: "/attendance-status",
          body: {
            attendance_status: {
              ...DEFAULT_ATTENDANCE_STATUS,
              attendance_staff_count: 0,
            },
          },
        },
        {
          match: "/summary",
          body: { summary: null, attendance_status: null, rows: [] },
        },
      ]);

      await renderAndLoad(noAttendanceFetch);

      await waitFor(() => {
        const syncScoreBtn = screen.getByRole("button", { name: /Sync \+ Score/i });
        expect(syncScoreBtn).toBeDisabled();
      });
    });

    it("Sync + Score is enabled when attendance_staff_count > 0", async () => {
      await renderAndLoad();

      await waitFor(() => {
        const syncScoreBtn = screen.getByRole("button", { name: /Sync \+ Score/i });
        expect(syncScoreBtn).not.toBeDisabled();
      });
    });

    it("shows informational text when attendance is not ready", async () => {
      const noAttendanceFetch = makeFetch([
        {
          match: "/attendance-status",
          body: {
            attendance_status: { ...DEFAULT_ATTENDANCE_STATUS, attendance_staff_count: 0 },
          },
        },
        { match: "/summary", body: { summary: null, attendance_status: null, rows: [] } },
      ]);

      await renderAndLoad(noAttendanceFetch);

      await waitFor(() => {
        expect(
          screen.getByText(/run Bayzat Sync, then run Sync \+ Score/i)
        ).toBeInTheDocument();
      });
    });

    it("shows 'Attendance is already on the server' message when server has attendance", async () => {
      await renderAndLoad();

      await waitFor(() => {
        expect(
          screen.getByText(/Attendance is already on the server for this month/i)
        ).toBeInTheDocument();
      });
    });
  });

  // ── loadSummary ─────────────────────────────────────────────────────────────
  describe("loadSummary", () => {
    it("shows 'No evaluation data found' when summary and rows are empty", async () => {
      const emptyFetch = makeFetch([
        {
          match: "/summary",
          body: { summary: null, attendance_status: DEFAULT_ATTENDANCE_STATUS, rows: [] },
        },
      ]);

      await renderAndLoad(emptyFetch);

      await waitFor(() => {
        expect(
          screen.getByText(/No evaluation data found for this city and month/i)
        ).toBeInTheDocument();
      });
    });

    it("shows 'No score rows yet' in Staff Scores panel when rows are empty", async () => {
      const emptyFetch = makeFetch([
        {
          match: "/summary",
          body: { summary: null, attendance_status: DEFAULT_ATTENDANCE_STATUS, rows: [] },
        },
      ]);

      await renderAndLoad(emptyFetch);

      await waitFor(() => {
        expect(screen.getByText(/No score rows yet/i)).toBeInTheDocument();
      });
    });

    it("renders KPI cards with summary data", async () => {
      await renderWithData();

      await waitFor(() => {
        // "Staff" appears in both the KPI label and the table header — use getAllByText
        const staffLabels = screen.getAllByText("Staff");
        expect(staffLabels.length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText("Avg Total")).toBeInTheDocument();
        // "Workload"/"Speed"/"Quality" appear in scoring criteria + KPI cards + table headers
        const workloadEls = screen.getAllByText("Workload");
        expect(workloadEls.length).toBeGreaterThanOrEqual(1);
      });
    });

    it("renders by_role summary entries", async () => {
      await renderWithData();

      await waitFor(() => {
        expect(screen.getByText(/Data Entry/i)).toBeInTheDocument();
      });
    });

    it("shows error on API failure", async () => {
      const errorFetch = makeFetch([
        {
          match: "/summary",
          status: 500,
          body: "Internal Server Error",
        },
      ]);

      await renderAndLoad(errorFetch);

      await waitFor(() => {
        expect(screen.getByText(/Internal Server Error|Failed \(500\)/i)).toBeInTheDocument();
      });
    });

    it("shows 'API base URL is not configured' error when env var is missing", async () => {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
      await renderPage(makeFetch());

      await waitFor(() => {
        expect(
          screen.getByText(/API base URL is not configured/i)
        ).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it("calls loadSummary again when Refresh button is clicked", async () => {
      const fetchMock = makeFetch();
      await renderWithData(fetchMock);

      const refreshBtn = screen.getByRole("button", { name: /Refresh/i });
      fireEvent.click(refreshBtn);

      await waitFor(() => {
        const summaryCallCount = (fetchMock as ReturnType<typeof vi.fn>).mock.calls.filter(
          (args: unknown[]) => String(args[0]).includes("/summary")
        ).length;
        expect(summaryCallCount).toBeGreaterThanOrEqual(2);
      });
    });
  });

  // ── Staff Scores Table ──────────────────────────────────────────────────────
  describe("staff scores table", () => {
    it("renders staff names in score rows", async () => {
      await renderWithData();

      expect(screen.getByText("Alice Garcia")).toBeInTheDocument();
      expect(screen.getByText("Bob Santos")).toBeInTheDocument();
    });

    it("renders table headers: Staff, Workload, Speed, Quality, Progress, Total", async () => {
      await renderWithData();

      await waitFor(() => {
        expect(screen.getByRole("columnheader", { name: /Staff/i })).toBeInTheDocument();
        expect(screen.getByRole("columnheader", { name: /Workload/i })).toBeInTheDocument();
        expect(screen.getByRole("columnheader", { name: /Speed/i })).toBeInTheDocument();
        expect(screen.getByRole("columnheader", { name: /Quality/i })).toBeInTheDocument();
        expect(screen.getByRole("columnheader", { name: /Progress/i })).toBeInTheDocument();
        expect(screen.getByRole("columnheader", { name: /Total/i })).toBeInTheDocument();
      });
    });

    it("clicking a staff row selects that staff", async () => {
      const actionsFetch = makeFetch([
        {
          match: "/actions",
          body: { rows: SAMPLE_ACTIONS },
        },
      ]);
      await renderWithData(actionsFetch);

      const bobRow = screen.getByText("Bob Santos").closest("tr")!;
      fireEvent.click(bobRow);

      await waitFor(() => {
        expect(screen.getByText(/Improvement Actions.*Bob Santos/i)).toBeInTheDocument();
      });
    });

    it("first staff is auto-selected when rows load", async () => {
      const actionsFetch = makeFetch([
        {
          match: "/actions",
          body: { rows: [] },
        },
      ]);
      await renderWithData(actionsFetch);

      // The Improvement Actions heading should show the first staff name
      await waitFor(() => {
        expect(screen.getByText(/Improvement Actions.*Alice Garcia/i)).toBeInTheDocument();
      });
    });

    it("shows score values in table cells", async () => {
      await renderWithData();

      await waitFor(() => {
        // Alice Garcia total_score = 74.5 → fmtNum → "74.5"
        expect(screen.getByText("74.5")).toBeInTheDocument();
      });
    });
  });

  // ── Bayzat Sync ─────────────────────────────────────────────────────────────
  describe("Bayzat Sync", () => {
    it("shows attendanceError when PIN is empty and Bayzat Sync is clicked", async () => {
      await renderAndLoad();

      // Clear the PIN field
      const pinInput = document.querySelector('input[type="password"]') as HTMLInputElement;
      fireEvent.change(pinInput, { target: { value: "" } });

      fireEvent.click(screen.getByRole("button", { name: /Bayzat Sync/i }));

      await waitFor(() => {
        expect(screen.getByText(/Approver Name and PIN are required/i)).toBeInTheDocument();
      });
    });

    it("calls the bayzat-sync API endpoint", async () => {
      const fetchMock = makeFetch();
      await renderAndLoad(fetchMock);

      fireEvent.click(screen.getByRole("button", { name: /Bayzat Sync/i }));

      await waitFor(() => {
        const bayzatCalls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls.filter(
          (args: unknown[]) => String(args[0]).includes("/bayzat-sync")
        );
        expect(bayzatCalls.length).toBeGreaterThanOrEqual(1);
      });
    });

    it("sends correct payload to bayzat-sync API", async () => {
      const fetchMock = makeFetch();
      await renderAndLoad(fetchMock);

      fireEvent.click(screen.getByRole("button", { name: /Bayzat Sync/i }));

      await waitFor(() => {
        const bayzatCalls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls.filter(
          (args: unknown[]) => String(args[0]).includes("/bayzat-sync")
        );
        expect(bayzatCalls.length).toBeGreaterThanOrEqual(1);
        const body = JSON.parse(bayzatCalls[0][1].body as string);
        expect(body.city).toBe("manila");
        expect(body.approver_name).toBe("Alice Manager");
        expect(body.pin).toBe("1234");
      });
    });

    it("shows attendanceError when bayzat-sync API returns 500", async () => {
      const errorFetch = makeFetch([
        { match: "/bayzat-sync", method: "POST", status: 500, body: "Bayzat sync failed" },
      ]);
      await renderAndLoad(errorFetch);

      fireEvent.click(screen.getByRole("button", { name: /Bayzat Sync/i }));

      await waitFor(() => {
        expect(screen.getByText(/Bayzat sync failed|Failed \(500\)/i)).toBeInTheDocument();
      });
    });

    it("enables Sync + Score button after successful Bayzat Sync (even with 0 server attendance)", async () => {
      const zeroAttendanceFetch = makeFetch([
        {
          match: "/attendance-status",
          body: { attendance_status: { ...DEFAULT_ATTENDANCE_STATUS, attendance_staff_count: 0 } },
        },
        { match: "/summary", body: { summary: null, attendance_status: null, rows: [] } },
        {
          match: "/bayzat-sync",
          method: "POST",
          body: { attendance_status: { ...DEFAULT_ATTENDANCE_STATUS, attendance_staff_count: 0 } },
        },
      ]);

      await renderAndLoad(zeroAttendanceFetch);

      // Initially Sync + Score should be disabled
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Sync \+ Score/i })).toBeDisabled();
      });

      // Click Bayzat Sync to set the session key
      fireEvent.click(screen.getByRole("button", { name: /Bayzat Sync/i }));

      // After success, Sync + Score should be enabled
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Sync \+ Score/i })).not.toBeDisabled();
      });
    });
  });

  // ── Sync + Score ─────────────────────────────────────────────────────────────
  describe("Sync + Score", () => {
    it("calls sync-from-sheet API with correct payload when attendance exists", async () => {
      const fetchMock = makeFetch();
      await renderAndLoad(fetchMock);

      // Wait for attendance to load (staff_count > 0 enables the button)
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Sync \+ Score/i })).not.toBeDisabled();
      });

      fireEvent.click(screen.getByRole("button", { name: /Sync \+ Score/i }));

      await waitFor(() => {
        const syncCalls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls.filter(
          (args: unknown[]) => String(args[0]).includes("/sync-from-sheet")
        );
        expect(syncCalls.length).toBeGreaterThanOrEqual(1);
        const body = JSON.parse(syncCalls[0][1].body as string);
        expect(body.city).toBe("manila");
        expect(body.approver_name).toBe("Alice Manager");
        expect(body.pin).toBe("1234");
        expect(body.dry_run).toBe(false);
      });
    });

    it("shows error when sync-from-sheet API returns 500", async () => {
      const errorFetch = makeFetch([
        { match: "/sync-from-sheet", method: "POST", status: 500, body: "Sheet sync failed" },
      ]);
      await renderAndLoad(errorFetch);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Sync \+ Score/i })).not.toBeDisabled();
      });

      fireEvent.click(screen.getByRole("button", { name: /Sync \+ Score/i }));

      await waitFor(() => {
        expect(screen.getByText(/Sheet sync failed|Failed \(500\)/i)).toBeInTheDocument();
      });
    });

    it("shows 'Syncing...' label while sync-from-sheet is in-flight", async () => {
      let resolveSync!: (v: Response) => void;
      const hangingFetch = vi.fn(async (url: string, opts?: RequestInit) => {
        if (String(url).includes("/sync-from-sheet")) {
          return new Promise<Response>((res) => {
            resolveSync = res;
          });
        }
        return makeFetch()(url, opts);
      });

      await renderAndLoad(hangingFetch);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Sync \+ Score/i })).not.toBeDisabled();
      });

      fireEvent.click(screen.getByRole("button", { name: /Sync \+ Score/i }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Syncing\.\.\./i })).toBeInTheDocument();
      });

      // Resolve so the component doesn't hang after test
      resolveSync(new Response("{}", { status: 200 }));
    });
  });

  // ── Improvement Actions ─────────────────────────────────────────────────────
  describe("improvement actions", () => {
    it("Save Action button is disabled when no staff is selected", async () => {
      // Render with empty rows so no staff is auto-selected
      const emptyFetch = makeFetch([
        { match: "/summary", body: { summary: null, attendance_status: DEFAULT_ATTENDANCE_STATUS, rows: [] } },
      ]);
      await renderAndLoad(emptyFetch);

      await waitFor(() => {
        const saveBtn = screen.getByRole("button", { name: /Save Action/i });
        expect(saveBtn).toBeDisabled();
      });
    });

    it("Save Action button is enabled after a staff row is clicked", async () => {
      await renderWithData();

      const aliceRow = screen.getByText("Alice Garcia").closest("tr")!;
      fireEvent.click(aliceRow);

      await waitFor(() => {
        const saveBtn = screen.getByRole("button", { name: /Save Action/i });
        expect(saveBtn).not.toBeDisabled();
      });
    });

    it("shows 'Action title is required' error when title is empty", async () => {
      await renderWithData();

      // Select staff via row click
      const aliceRow = screen.getByText("Alice Garcia").closest("tr")!;
      fireEvent.click(aliceRow);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Save Action/i })).not.toBeDisabled();
      });

      // Leave action title empty and click Save
      fireEvent.click(screen.getByRole("button", { name: /Save Action/i }));

      await waitFor(() => {
        expect(screen.getByText(/Action title is required/i)).toBeInTheDocument();
      });
    });

    it("shows 'Approver Name and PIN are required' when PIN is cleared", async () => {
      await renderWithData();

      // Select staff
      const aliceRow = screen.getByText("Alice Garcia").closest("tr")!;
      fireEvent.click(aliceRow);

      // Fill title
      const titleInput = screen.getByPlaceholderText(/Action title/i);
      fireEvent.change(titleInput, { target: { value: "Improve accuracy" } });

      // Clear PIN
      const pinInput = document.querySelector('input[type="password"]') as HTMLInputElement;
      fireEvent.change(pinInput, { target: { value: "" } });

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Save Action/i })).not.toBeDisabled();
      });
      fireEvent.click(screen.getByRole("button", { name: /Save Action/i }));

      await waitFor(() => {
        expect(screen.getByText(/Approver Name and PIN are required/i)).toBeInTheDocument();
      });
    });

    it("calls upsert API with correct payload on valid submission", async () => {
      const fetchMock = makeFetch();
      await renderWithData(fetchMock);

      // Select staff
      const aliceRow = screen.getByText("Alice Garcia").closest("tr")!;
      fireEvent.click(aliceRow);

      // Fill in the form
      fireEvent.change(screen.getByPlaceholderText(/Action title/i), {
        target: { value: "Improve accuracy" },
      });
      fireEvent.change(screen.getByPlaceholderText(/Action detail/i), {
        target: { value: "Check each entry before submitting" },
      });
      fireEvent.change(screen.getByPlaceholderText(/Owner/i), {
        target: { value: "Alice Manager" },
      });

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Save Action/i })).not.toBeDisabled();
      });
      fireEvent.click(screen.getByRole("button", { name: /Save Action/i }));

      await waitFor(() => {
        const upsertCalls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls.filter(
          (args: unknown[]) => String(args[0]).includes("/actions/upsert")
        );
        expect(upsertCalls.length).toBeGreaterThanOrEqual(1);
        const body = JSON.parse(upsertCalls[0][1].body as string);
        expect(body.staff_name).toBe("Alice Garcia");
        expect(body.action_title).toBe("Improve accuracy");
        expect(body.city).toBe("manila");
        expect(body.approver_name).toBe("Alice Manager");
        expect(body.pin).toBe("1234");
      });
    });

    it("clears form fields after successful upsert", async () => {
      await renderWithData();

      const aliceRow = screen.getByText("Alice Garcia").closest("tr")!;
      fireEvent.click(aliceRow);

      const titleInput = screen.getByPlaceholderText(/Action title/i) as HTMLInputElement;
      fireEvent.change(titleInput, { target: { value: "My action" } });

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Save Action/i })).not.toBeDisabled();
      });
      fireEvent.click(screen.getByRole("button", { name: /Save Action/i }));

      await waitFor(() => {
        expect(titleInput.value).toBe("");
      });
    });

    it("renders existing action items in the list", async () => {
      const withActionsFetch = makeFetch([
        { match: "/actions", body: { rows: SAMPLE_ACTIONS } },
      ]);
      await renderWithData(withActionsFetch);

      // Auto-selects first staff (Alice Garcia) → loads actions
      await waitFor(() => {
        expect(screen.getByText("Reduce error rate")).toBeInTheDocument();
        expect(screen.getByText("Speed improvement")).toBeInTheDocument();
      });
    });

    it("shows DONE badge on completed action", async () => {
      const withActionsFetch = makeFetch([
        { match: "/actions", body: { rows: SAMPLE_ACTIONS } },
      ]);
      await renderWithData(withActionsFetch);

      await waitFor(() => {
        // "DONE" and "OPEN" also appear as <option> text in the status select, so use getAllByText
        const doneEls = screen.getAllByText("DONE");
        expect(doneEls.length).toBeGreaterThanOrEqual(2); // option element + badge
        const openEls = screen.getAllByText("OPEN");
        expect(openEls.length).toBeGreaterThanOrEqual(2); // option element + badge
      });
    });

    it("shows action details and owner", async () => {
      const withActionsFetch = makeFetch([
        { match: "/actions", body: { rows: SAMPLE_ACTIONS } },
      ]);
      await renderWithData(withActionsFetch);

      await waitFor(() => {
        expect(screen.getByText(/Review submission checklist daily/i)).toBeInTheDocument();
      });
    });

    it("shows 'No action items yet' when actions list is empty", async () => {
      await renderWithData();

      await waitFor(() => {
        expect(screen.getByText(/No action items yet/i)).toBeInTheDocument();
      });
    });

    it("loads actions for newly selected staff when row is clicked", async () => {
      const fetchMock = makeFetch([
        { match: "/actions", body: { rows: [] } },
      ]);
      await renderWithData(fetchMock);

      const bobRow = screen.getByText("Bob Santos").closest("tr")!;
      fireEvent.click(bobRow);

      await waitFor(() => {
        const actionCalls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls.filter(
          (args: unknown[]) => String(args[0]).includes("/actions") && String(args[0]).includes("Bob+Santos")
        );
        expect(actionCalls.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  // ── Attendance Status display ────────────────────────────────────────────────
  describe("attendance status display", () => {
    it("shows attendance coverage staff count", async () => {
      await renderAndLoad();

      await waitFor(() => {
        expect(screen.getByText(/5 staff/i)).toBeInTheDocument();
      });
    });

    it("shows the attendance last date", async () => {
      await renderAndLoad();

      await waitFor(() => {
        expect(screen.getByText("2026-05-10")).toBeInTheDocument();
      });
    });

    it("shows '-' when no attendance status", async () => {
      const noStatusFetch = makeFetch([
        {
          match: "/attendance-status",
          body: { attendance_status: null },
        },
        { match: "/summary", body: { summary: null, attendance_status: null, rows: [] } },
      ]);
      await renderAndLoad(noStatusFetch);

      await waitFor(() => {
        // attendance_last_date defaults to "-" when null
        const dashElements = screen.getAllByText("-");
        expect(dashElements.length).toBeGreaterThanOrEqual(1);
      });
    });
  });
});
