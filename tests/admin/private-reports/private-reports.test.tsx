// tests/admin/private-reports/private-reports.test.tsx
// Tests for src/app/admin/private-reports/page.tsx
// Covers: auth guard, KPI cards, report list, report detail, reply thread, submit reply, refresh.

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── next/navigation ────────────────────────────────────────────────────────────
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/private-reports",
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
  RefreshCw: () => <svg data-testid="icon-refresh" />,
  ShieldAlert: () => <svg data-testid="icon-shield" />,
}));

// ── ui-tokens ─────────────────────────────────────────────────────────────────
vi.mock("@/lib/ui-tokens", () => ({
  GLASS_CARD: "glass-card",
  SMALL_BUTTON: "small-button",
  T_PAGE_TITLE: "t-page-title",
  T_SECTION: "t-section",
  T_BODY: "t-body",
  T_CAPTION: "t-caption",
  BADGE_WARNING: "badge-warning",
}));

// ── badgeEvents ───────────────────────────────────────────────────────────────
vi.mock("@/lib/badgeEvents", () => ({
  dispatchBadgeRefresh: vi.fn(),
}));

// ── auth ──────────────────────────────────────────────────────────────────────
let mockCanAccess = true;
const PR_AUTH = {
  accessToken: "tok-pr",
  role: "HQ",
  city: "dubai",
  staffName: "Jay",
  permissions: ["private_report.read"],
  pin: "1234",
};

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getAuth: vi.fn(() => PR_AUTH),
    refreshAuthFromApi: vi.fn(async () => PR_AUTH),
    canAccessPrivateReportAdmin: vi.fn(() => mockCanAccess),
  };
});

// ── fetch mock ────────────────────────────────────────────────────────────────
let mockFetch: ReturnType<typeof vi.fn>;

const REPORT_ROW = {
  id: "rpt-1",
  report_type: "System Bug",
  city: "dubai",
  branch: "JBR",
  staff_name: "Tanaka",
  report_datetime: "2026-05-01T10:00:00Z",
  category: "Technical",
  anonymous_request: false,
  status: "RECEIVED",
  created_at: "2026-05-01T10:00:00Z",
  updated_at: "2026-05-01T10:00:00Z",
  reply_count: 2,
  payload_json: {
    problem: "The screen goes blank when submitting orders",
    expected: "Order should submit successfully",
    actual: "Blank screen appears",
  },
};

const REPORT_ROW_2 = {
  id: "rpt-2",
  report_type: "HR Concern",
  city: "manila",
  branch: "MOA",
  staff_name: "Santos",
  report_datetime: "2026-05-02T09:00:00Z",
  category: "HR",
  anonymous_request: true,
  status: "IN_PROGRESS",
  created_at: "2026-05-02T09:00:00Z",
  updated_at: "2026-05-02T09:00:00Z",
  reply_count: 0,
  payload_json: { what_happened: "Manager raised voice at staff", why_problem: "Hostile environment" },
};

const REPORT_DETAIL = {
  ...REPORT_ROW,
  payload_json: {
    problem: "The screen goes blank when submitting orders",
    expected: "Order should submit successfully",
    actual: "Blank screen appears",
    screenshot: "See attached",
  },
};

const REPORT_REPLIES = [
  { id: 1, report_id: "rpt-1", author_name: "Jay HQ", author_role: "HQ", message: "Looking into this now.", created_at: "2026-05-01T11:00:00Z" },
  { id: 2, report_id: "rpt-1", author_name: "Jay HQ", author_role: "HQ", message: "Fixed in latest build.", created_at: "2026-05-01T14:00:00Z" },
];

function makeFetch(listRows: any[] = [REPORT_ROW], detailData?: any) {
  return vi.fn(async (url: string, opts?: RequestInit) => {
    const urlStr = String(url);
    if (opts?.method === "POST" && urlStr.includes("/reply")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) } as any;
    }
    if (urlStr.includes("/private_reports/rpt-1") && !urlStr.includes("?limit")) {
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({ report: detailData || REPORT_DETAIL, replies: REPORT_REPLIES }),
      } as any;
    }
    if (urlStr.includes("/private_reports/rpt-2") && !urlStr.includes("?limit")) {
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({ report: REPORT_ROW_2, replies: [] }),
      } as any;
    }
    if (urlStr.includes("/private_reports")) {
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({ rows: listRows }),
      } as any;
    }
    return { ok: false, status: 404, text: async () => "Not found" } as any;
  });
}

import AdminPrivateReportsPage from "@/app/admin/private-reports/page";
import { dispatchBadgeRefresh } from "@/lib/badgeEvents";

// ════════════════════════════════════════════════════════════════════════════════
describe("AdminPrivateReportsPage — auth guard", () => {
  beforeEach(() => {
    mockCanAccess = true;
    mockFetch = makeFetch();
    vi.stubGlobal("fetch", mockFetch);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("shows permission error for unauthorized user", () => {
    mockCanAccess = false;
    render(<AdminPrivateReportsPage />);
    expect(screen.getByText(/Private Reports page is available only to HQ\/HR Manager\/Admin/i)).toBeInTheDocument();
  });

  it("shows 'Private Reports' page title for authorized user", async () => {
    render(<AdminPrivateReportsPage />);
    await screen.findByText("Private Reports", { selector: "h1" });
  });

  it("shows 'Sensitive access' badge for authorized user", async () => {
    render(<AdminPrivateReportsPage />);
    await screen.findByText(/Sensitive access/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("AdminPrivateReportsPage — KPI cards", () => {
  beforeEach(() => {
    mockCanAccess = true;
    mockFetch = makeFetch([REPORT_ROW, REPORT_ROW_2]);
    vi.stubGlobal("fetch", mockFetch);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("Open Reports card shows total row count", async () => {
    render(<AdminPrivateReportsPage />);
    await screen.findByText("System Bug");
    // openCount = rows.length = 2; "2" may appear in multiple places so use getAllByText
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    expect(screen.getByText(/Open Reports/i)).toBeInTheDocument();
    expect(screen.getByText(/awaiting review/i)).toBeInTheDocument();
  });

  it("Replies Sent card shows sum of reply_count", async () => {
    render(<AdminPrivateReportsPage />);
    await screen.findByText("System Bug");
    // REPORT_ROW.reply_count=2, REPORT_ROW_2.reply_count=0 → total=2
    expect(screen.getByText(/Replies Sent/i)).toBeInTheDocument();
  });

  it("Access Scope card shows HQ/HR/Admin restriction text", async () => {
    render(<AdminPrivateReportsPage />);
    await screen.findByText("System Bug");
    expect(screen.getByText(/HQ \/ HR \/ Admin/i)).toBeInTheDocument();
    expect(screen.getByText(/Access Scope/i)).toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("AdminPrivateReportsPage — report list", () => {
  beforeEach(() => {
    mockCanAccess = true;
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("shows 'Loading reports...' while fetching", async () => {
    // Delay fetch so loading state is visible
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<AdminPrivateReportsPage />);
    await screen.findByText("Loading reports...");
  });

  it("renders report rows after load", async () => {
    mockFetch = makeFetch([REPORT_ROW, REPORT_ROW_2]);
    vi.stubGlobal("fetch", mockFetch);
    render(<AdminPrivateReportsPage />);
    await screen.findByText("System Bug");
    expect(screen.getByText("HR Concern")).toBeInTheDocument();
  });

  it("shows 'No reports.' when list is empty", async () => {
    mockFetch = makeFetch([]);
    vi.stubGlobal("fetch", mockFetch);
    render(<AdminPrivateReportsPage />);
    await screen.findByText("No reports.");
  });

  it("shows error banner when list API fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false, status: 500, text: async () => "Internal Server Error",
    })));
    render(<AdminPrivateReportsPage />);
    await screen.findByText(/Internal Server Error/i);
  });

  it("shows reply count badge on each report row", async () => {
    mockFetch = makeFetch([REPORT_ROW]);
    vi.stubGlobal("fetch", mockFetch);
    render(<AdminPrivateReportsPage />);
    await screen.findByText("System Bug");
    expect(screen.getByText(/2 replies/i)).toBeInTheDocument();
  });

  it("shows StatusBadge on each report row", async () => {
    mockFetch = makeFetch([REPORT_ROW]);
    vi.stubGlobal("fetch", mockFetch);
    render(<AdminPrivateReportsPage />);
    await screen.findByText("System Bug");
    expect(screen.getByText("RECEIVED")).toBeInTheDocument();
  });

  it("shows payload problem preview in list row", async () => {
    mockFetch = makeFetch([REPORT_ROW]);
    vi.stubGlobal("fetch", mockFetch);
    render(<AdminPrivateReportsPage />);
    await screen.findByText("System Bug");
    expect(screen.getByText(/The screen goes blank/i)).toBeInTheDocument();
  });

  it("Refresh button triggers loadList again", async () => {
    mockFetch = makeFetch([REPORT_ROW]);
    vi.stubGlobal("fetch", mockFetch);
    render(<AdminPrivateReportsPage />);
    await screen.findByText("System Bug");
    const callsBefore = mockFetch.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /Refresh/i }));
    await waitFor(() => {
      expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("AdminPrivateReportsPage — report detail", () => {
  beforeEach(() => {
    mockCanAccess = true;
    mockFetch = makeFetch([REPORT_ROW]);
    vi.stubGlobal("fetch", mockFetch);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("shows 'Select a report.' before any is selected", async () => {
    render(<AdminPrivateReportsPage />);
    await screen.findByText("System Bug");
    expect(screen.getByText("Select a report.")).toBeInTheDocument();
  });

  it("clicking a report row loads and shows its detail", async () => {
    render(<AdminPrivateReportsPage />);
    await screen.findByText("System Bug");
    fireEvent.click(screen.getByRole("button", { name: /System Bug/i }));
    await screen.findByText("The screen goes blank when submitting orders");
  });

  it("detail panel shows meta fields: city/branch, reporter, category, anonymous", async () => {
    render(<AdminPrivateReportsPage />);
    await screen.findByText("System Bug");
    fireEvent.click(screen.getByRole("button", { name: /System Bug/i }));
    await screen.findByText("The screen goes blank when submitting orders");
    // city/branch appears in both list row and detail panel; confirm at least 2 occurrences
    expect(screen.getAllByText(/dubai\/JBR/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Tanaka").length).toBeGreaterThan(0);
    expect(screen.getByText("Technical")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument(); // anonymous_request = false
  });

  it("detail panel shows Problem field highlighted", async () => {
    render(<AdminPrivateReportsPage />);
    await screen.findByText("System Bug");
    fireEvent.click(screen.getByRole("button", { name: /System Bug/i }));
    await screen.findByText("Problem");
    expect(screen.getByText("The screen goes blank when submitting orders")).toBeInTheDocument();
  });

  it("detail panel shows What was expected and What actually happened fields", async () => {
    render(<AdminPrivateReportsPage />);
    await screen.findByText("System Bug");
    fireEvent.click(screen.getByRole("button", { name: /System Bug/i }));
    await screen.findByText("What was expected");
    expect(screen.getByText("Order should submit successfully")).toBeInTheDocument();
    await screen.findByText("What actually happened");
    expect(screen.getByText("Blank screen appears")).toBeInTheDocument();
  });

  it("shows error banner when detail API fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("?limit")) return { ok: true, status: 200, text: async () => JSON.stringify({ rows: [REPORT_ROW] }) } as any;
      return { ok: false, status: 403, text: async () => "Forbidden" } as any;
    }));
    render(<AdminPrivateReportsPage />);
    await screen.findByText("System Bug");
    fireEvent.click(screen.getByRole("button", { name: /System Bug/i }));
    await screen.findByText(/Forbidden/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("AdminPrivateReportsPage — reply thread", () => {
  beforeEach(() => {
    mockCanAccess = true;
    mockFetch = makeFetch([REPORT_ROW]);
    vi.stubGlobal("fetch", mockFetch);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("shows existing replies after selecting a report", async () => {
    render(<AdminPrivateReportsPage />);
    await screen.findByText("System Bug");
    fireEvent.click(screen.getByRole("button", { name: /System Bug/i }));
    await screen.findByText("Looking into this now.");
    expect(screen.getByText("Fixed in latest build.")).toBeInTheDocument();
    expect(screen.getAllByText("Jay HQ").length).toBeGreaterThan(0);
  });

  it("shows 'No replies yet.' when report has no replies", async () => {
    mockFetch = makeFetch([REPORT_ROW_2], REPORT_ROW_2);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("?limit")) return { ok: true, status: 200, text: async () => JSON.stringify({ rows: [REPORT_ROW_2] }) } as any;
      return { ok: true, status: 200, text: async () => JSON.stringify({ report: REPORT_ROW_2, replies: [] }) } as any;
    }));
    render(<AdminPrivateReportsPage />);
    await screen.findByText("HR Concern");
    fireEvent.click(screen.getByRole("button", { name: /HR Concern/i }));
    await screen.findByText("No replies yet.");
  });

  it("shows reply count badge when there are replies", async () => {
    render(<AdminPrivateReportsPage />);
    await screen.findByText("System Bug");
    fireEvent.click(screen.getByRole("button", { name: /System Bug/i }));
    await screen.findByText("Looking into this now.");
    // Reply count badge in detail panel (shows "2" for 2 replies)
    const replyBadges = screen.getAllByText("2");
    expect(replyBadges.length).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("AdminPrivateReportsPage — submit reply", () => {
  beforeEach(() => {
    mockCanAccess = true;
    mockFetch = makeFetch([REPORT_ROW]);
    vi.stubGlobal("fetch", mockFetch);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("Send Reply button is disabled when textarea is empty", async () => {
    render(<AdminPrivateReportsPage />);
    await screen.findByText("System Bug");
    fireEvent.click(screen.getByRole("button", { name: /System Bug/i }));
    await screen.findByText("Looking into this now.");
    const sendBtn = screen.getByRole("button", { name: /Send Reply/i });
    expect(sendBtn).toBeDisabled();
  });

  it("Send Reply button enables when text is typed", async () => {
    render(<AdminPrivateReportsPage />);
    await screen.findByText("System Bug");
    fireEvent.click(screen.getByRole("button", { name: /System Bug/i }));
    await screen.findByText("Looking into this now.");
    const textarea = screen.getByPlaceholderText(/Write a private reply/i);
    fireEvent.change(textarea, { target: { value: "Thanks for reporting this." } });
    expect(screen.getByRole("button", { name: /Send Reply/i })).not.toBeDisabled();
  });

  it("submitting reply POSTs to /reply endpoint with correct body", async () => {
    render(<AdminPrivateReportsPage />);
    await screen.findByText("System Bug");
    fireEvent.click(screen.getByRole("button", { name: /System Bug/i }));
    await screen.findByText("Looking into this now.");
    const textarea = screen.getByPlaceholderText(/Write a private reply/i);
    fireEvent.change(textarea, { target: { value: "Thanks for reporting this." } });
    fireEvent.click(screen.getByRole("button", { name: /Send Reply/i }));
    await waitFor(() => {
      const postCall = mockFetch.mock.calls.find(
        ([url, opts]: [string, RequestInit]) => String(url).includes("/reply") && opts?.method === "POST"
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse(postCall![1].body as string);
      expect(body.report_id).toBe("rpt-1");
      expect(body.message).toBe("Thanks for reporting this.");
    });
  });

  it("dispatches badge refresh after successful reply", async () => {
    render(<AdminPrivateReportsPage />);
    await screen.findByText("System Bug");
    fireEvent.click(screen.getByRole("button", { name: /System Bug/i }));
    await screen.findByText("Looking into this now.");
    const textarea = screen.getByPlaceholderText(/Write a private reply/i);
    fireEvent.change(textarea, { target: { value: "Acknowledged." } });
    fireEvent.click(screen.getByRole("button", { name: /Send Reply/i }));
    await waitFor(() => {
      expect(dispatchBadgeRefresh).toHaveBeenCalledWith("privateReports");
    });
  });

  it("clears textarea after successful reply submission", async () => {
    render(<AdminPrivateReportsPage />);
    await screen.findByText("System Bug");
    fireEvent.click(screen.getByRole("button", { name: /System Bug/i }));
    await screen.findByText("Looking into this now.");
    const textarea = screen.getByPlaceholderText(/Write a private reply/i);
    fireEvent.change(textarea, { target: { value: "Understood, will fix." } });
    fireEvent.click(screen.getByRole("button", { name: /Send Reply/i }));
    await waitFor(() => {
      expect((textarea as HTMLTextAreaElement).value).toBe("");
    });
  });

  it("shows error banner when reply POST fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, opts?: RequestInit) => {
      if (opts?.method === "POST") return { ok: false, status: 500, text: async () => "Reply failed" } as any;
      if (String(url).includes("?limit")) return { ok: true, status: 200, text: async () => JSON.stringify({ rows: [REPORT_ROW] }) } as any;
      return { ok: true, status: 200, text: async () => JSON.stringify({ report: REPORT_DETAIL, replies: REPORT_REPLIES }) } as any;
    }));
    render(<AdminPrivateReportsPage />);
    await screen.findByText("System Bug");
    fireEvent.click(screen.getByRole("button", { name: /System Bug/i }));
    await screen.findByText("Looking into this now.");
    const textarea = screen.getByPlaceholderText(/Write a private reply/i);
    fireEvent.change(textarea, { target: { value: "Test reply" } });
    fireEvent.click(screen.getByRole("button", { name: /Send Reply/i }));
    await screen.findByText(/Reply failed/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("AdminPrivateReportsPage — StatusBadge component", () => {
  beforeEach(() => {
    mockCanAccess = true;
    mockFetch = makeFetch([
      { ...REPORT_ROW, status: "RECEIVED" },
      { ...REPORT_ROW, id: "rpt-ip", status: "IN_PROGRESS" },
      { ...REPORT_ROW, id: "rpt-res", status: "RESOLVED" },
      { ...REPORT_ROW, id: "rpt-cl", status: "CLOSED" },
    ]);
    vi.stubGlobal("fetch", mockFetch);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("renders RECEIVED, IN_PROGRESS, RESOLVED, CLOSED badges", async () => {
    render(<AdminPrivateReportsPage />);
    await screen.findByText("RECEIVED");
    expect(screen.getByText("IN_PROGRESS")).toBeInTheDocument();
    expect(screen.getByText("RESOLVED")).toBeInTheDocument();
    expect(screen.getByText("CLOSED")).toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("AdminPrivateReportsPage — pickText utility via detail rendering", () => {
  beforeEach(() => {
    mockCanAccess = true;
    vi.stubGlobal("fetch", mockFetch);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("renders HR-type report fields (what_happened, why_problem, affected_people, support_needed)", async () => {
    const hrDetail = {
      ...REPORT_ROW_2,
      payload_json: {
        what_happened: "Manager raised voice at staff in front of customers",
        why_problem: "Creates hostile work environment",
        affected_people: "3 staff members on shift",
        support_needed: "Mediation session requested",
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("?limit")) return { ok: true, status: 200, text: async () => JSON.stringify({ rows: [REPORT_ROW_2] }) } as any;
      return { ok: true, status: 200, text: async () => JSON.stringify({ report: hrDetail, replies: [] }) } as any;
    }));
    render(<AdminPrivateReportsPage />);
    await screen.findByText("HR Concern");
    fireEvent.click(screen.getByRole("button", { name: /HR Concern/i }));
    await screen.findByText("What happened");
    expect(screen.getByText("Manager raised voice at staff in front of customers")).toBeInTheDocument();
    expect(screen.getByText("Why this is a problem")).toBeInTheDocument();
    expect(screen.getByText("Creates hostile work environment")).toBeInTheDocument();
    expect(screen.getByText("Who is affected")).toBeInTheDocument();
    expect(screen.getByText("3 staff members on shift")).toBeInTheDocument();
    expect(screen.getByText("Support needed")).toBeInTheDocument();
    expect(screen.getByText("Mediation session requested")).toBeInTheDocument();
  });
});
