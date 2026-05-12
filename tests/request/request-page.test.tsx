// tests/request/request-page.test.tsx
import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { routerMock } from "../setup";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// DatePicker → simple input to avoid portal/DOM complexity
vi.mock("@/components/DatePicker", () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input data-testid="date-picker" value={value} onChange={e => onChange(e.target.value)} />
  ),
}));

// Lucide icons → plain spans
vi.mock("lucide-react", () => {
  const Icon = ({ "data-testid": tid }: { "data-testid"?: string }) =>
    <span data-testid={tid ?? "icon"} />;
  return {
    AlertCircle: Icon, Bell: Icon, BellRing: Icon, CalendarDays: Icon,
    CheckCircle2: Icon, ClipboardList: Icon, Clock: Icon, FileText: Icon,
    Loader2: Icon, RefreshCw: Icon, Send: Icon, XCircle: Icon,
  };
});

// Auth mock
let mockAuth: Record<string, unknown> | null = null;

vi.mock("@/lib/auth", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...real,
    getAuth: () => mockAuth,
    refreshAuthFromApi: vi.fn().mockResolvedValue(null),
  };
});

// Fetch mock
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// ── Helpers ───────────────────────────────────────────────────────────────────

function staffAuth(overrides: Record<string, unknown> = {}) {
  return {
    staffName: "Test Staff",
    city: "manila",
    role: "STAFF",
    accessToken: "tok-staff",
    permissions: [],
    ...overrides,
  };
}

function adminAuth(overrides: Record<string, unknown> = {}) {
  return {
    staffName: "Test Admin",
    city: "manila",
    role: "ADMIN",
    accessToken: "tok-admin",
    permissions: ["*"],
    ...overrides,
  };
}

function okJson(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response);
}

function errorResponse(status: number, text = "Server error") {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.reject(new Error(text)),
    text: () => Promise.resolve(text),
  } as Response);
}

async function renderPage() {
  const { default: RequestPage } = await import("@/app/request/page");
  const utils = render(<RequestPage />);
  return utils;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("/request page — auth guard", () => {
  it("redirects to /login when no auth", async () => {
    mockAuth = null;
    await renderPage();
    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith("/login?next=%2Frequest")
    );
  });

  it("redirects when accessToken is missing", async () => {
    mockAuth = { staffName: "Alice", city: "manila", role: "STAFF" };
    await renderPage();
    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith("/login?next=%2Frequest")
    );
  });

  it("does NOT redirect when fully authenticated", async () => {
    mockAuth = staffAuth();
    // fetch for staff names + leave balances
    mockFetch.mockResolvedValue(okJson({ names: [] }));
    await renderPage();
    await waitFor(() =>
      expect(routerMock.replace).not.toHaveBeenCalled()
    );
  });
});

describe("/request page — page structure", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
    mockFetch.mockResolvedValue(okJson({ names: [], balances: [] }));
  });

  it("renders page heading", async () => {
    await renderPage();
    expect(screen.getByText("Request")).toBeInTheDocument();
  });

  it("renders subtitle text", async () => {
    await renderPage();
    expect(screen.getByText(/Submit shift changes/i)).toBeInTheDocument();
  });

  it("renders Form tab", async () => {
    await renderPage();
    expect(screen.getByText("Form")).toBeInTheDocument();
  });

  it("renders My History tab", async () => {
    await renderPage();
    expect(screen.getByText("My History")).toBeInTheDocument();
  });

  it("does NOT show Inbox tab for STAFF role", async () => {
    await renderPage();
    expect(screen.queryByText("Inbox")).not.toBeInTheDocument();
  });

  it("shows Inbox tab for ADMIN role", async () => {
    mockAuth = adminAuth();
    mockFetch.mockResolvedValue(okJson({ items: [] }));
    await renderPage();
    expect(screen.getByText("Inbox")).toBeInTheDocument();
  });

  it("shows Inbox tab for HQ role", async () => {
    mockAuth = staffAuth({ role: "HQ" });
    mockFetch.mockResolvedValue(okJson({ items: [] }));
    await renderPage();
    expect(screen.getByText("Inbox")).toBeInTheDocument();
  });

  it("shows Inbox tab for MANAGER role", async () => {
    mockAuth = staffAuth({ role: "MANAGER" });
    mockFetch.mockResolvedValue(okJson({ items: [] }));
    await renderPage();
    expect(screen.getByText("Inbox")).toBeInTheDocument();
  });

  it("shows 'Self submit' badge for STAFF", async () => {
    await renderPage();
    expect(screen.getByText("Self submit")).toBeInTheDocument();
  });

  it("shows 'Manager mode' badge for ADMIN", async () => {
    mockAuth = adminAuth();
    mockFetch.mockResolvedValue(okJson({ names: [], balances: [] }));
    await renderPage();
    expect(screen.getByText("Manager mode")).toBeInTheDocument();
  });
});

describe("/request page — form fields", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
    mockFetch.mockResolvedValue(okJson({ names: [], balances: [] }));
  });

  it("renders City and Branch selects", async () => {
    await renderPage();
    expect(screen.getByDisplayValue("Manila")).toBeInTheDocument();
    // default manila branch is PAR
    expect(screen.getByDisplayValue("Paranaque")).toBeInTheDocument();
  });

  it("renders Request type select with default Time Change", async () => {
    await renderPage();
    expect(screen.getByDisplayValue("Time Change")).toBeInTheDocument();
  });

  it("renders Reason textarea", async () => {
    await renderPage();
    expect(screen.getByPlaceholderText(/At least 5 characters/i)).toBeInTheDocument();
  });

  it("renders Submit button", async () => {
    await renderPage();
    expect(screen.getByText("Submit")).toBeInTheDocument();
  });

  it("renders Clear button", async () => {
    await renderPage();
    expect(screen.getByText("Clear")).toBeInTheDocument();
  });

  it("shows time change From/To fields when request type is time_change", async () => {
    await renderPage();
    expect(screen.getByPlaceholderText("e.g. 9-16")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. 10-18")).toBeInTheDocument();
  });

  it("shows leave sub-type and days when type is paid_leave", async () => {
    await renderPage();
    const select = screen.getByDisplayValue("Time Change");
    fireEvent.change(select, { target: { value: "paid_leave" } });
    await waitFor(() =>
      expect(screen.getByDisplayValue("Annual Leave")).toBeInTheDocument()
    );
    expect(screen.getByDisplayValue("1")).toBeInTheDocument();
  });

  it("shows OT hours field when type is overtime_request", async () => {
    await renderPage();
    fireEvent.change(screen.getByDisplayValue("Time Change"), {
      target: { value: "overtime_request" },
    });
    await waitFor(() =>
      expect(screen.getByPlaceholderText("e.g. 2.5")).toBeInTheDocument()
    );
  });

  it("shows swap fields when type is swap", async () => {
    await renderPage();
    fireEvent.change(screen.getByDisplayValue("Time Change"), {
      target: { value: "swap" },
    });
    await waitFor(() =>
      expect(screen.getByText("My new time")).toBeInTheDocument()
    );
    expect(screen.getByText("Their new time")).toBeInTheDocument();
  });

  it("hides medical document section for overtime_request", async () => {
    await renderPage();
    // medical doc present for time_change
    expect(screen.getByText("I have a medical document")).toBeInTheDocument();
    // switch to overtime
    fireEvent.change(screen.getByDisplayValue("Time Change"), {
      target: { value: "overtime_request" },
    });
    await waitFor(() =>
      expect(screen.queryByText("I have a medical document")).not.toBeInTheDocument()
    );
  });

  it("city change updates branch options", async () => {
    await renderPage();
    fireEvent.change(screen.getByDisplayValue("Manila"), {
      target: { value: "dubai" },
    });
    await waitFor(() =>
      expect(screen.getByDisplayValue("Business Bay")).toBeInTheDocument()
    );
  });

  it("shows staff name field pre-filled with auth name", async () => {
    await renderPage();
    expect(screen.getByDisplayValue("Test Staff")).toBeInTheDocument();
  });
});

describe("/request page — form validation", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
    mockFetch.mockResolvedValue(okJson({ names: [], balances: [] }));
  });

  it("shows error when reason is empty", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("Submit"));
    await waitFor(() =>
      expect(screen.getByText(/Reason must be at least 5 characters/i)).toBeInTheDocument()
    );
  });

  it("shows error when reason is too short (< 5 chars)", async () => {
    await renderPage();
    fireEvent.change(screen.getByPlaceholderText(/At least 5 characters/i), {
      target: { value: "hi" },
    });
    fireEvent.click(screen.getByText("Submit"));
    await waitFor(() =>
      expect(screen.getByText(/Reason must be at least 5 characters/i)).toBeInTheDocument()
    );
  });

  it("shows error when swap missing counterparty", async () => {
    await renderPage();
    // switch to swap
    fireEvent.change(screen.getByDisplayValue("Time Change"), {
      target: { value: "swap" },
    });
    fireEvent.change(screen.getByPlaceholderText(/At least 5 characters/i), {
      target: { value: "need to swap shift please" },
    });
    fireEvent.click(screen.getByText("Submit"));
    await waitFor(() =>
      expect(screen.getByText(/Counterparty staff name is required/i)).toBeInTheDocument()
    );
  });

  it("clears error when Clear is clicked", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("Submit"));
    await waitFor(() =>
      expect(screen.getByText(/Reason must be at least 5 characters/i)).toBeInTheDocument()
    );
    fireEvent.click(screen.getByText("Clear"));
    await waitFor(() =>
      expect(screen.queryByText(/Reason must be at least 5 characters/i)).not.toBeInTheDocument()
    );
  });
});

describe("/request page — submit success & form reset", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
    // staff names + balances OK, then submit OK
    mockFetch
      .mockResolvedValueOnce(okJson({ names: [] }))
      .mockResolvedValueOnce(okJson({ balances: [] }))
      .mockResolvedValueOnce(okJson({ request_id: "abc-123-def-456" }));
  });

  it("shows success banner after submit", async () => {
    await renderPage();
    fireEvent.change(screen.getByPlaceholderText(/At least 5 characters/i), {
      target: { value: "Need to change my shift time please" },
    });
    fireEvent.click(screen.getByText("Submit"));
    await waitFor(() =>
      expect(screen.getByText("Request submitted")).toBeInTheDocument()
    );
  });

  it("resets reason field after successful submit (bug regression)", async () => {
    await renderPage();
    const reasonField = screen.getByPlaceholderText(/At least 5 characters/i);
    fireEvent.change(reasonField, {
      target: { value: "Need to change my shift time please" },
    });
    fireEvent.click(screen.getByText("Submit"));
    await waitFor(() =>
      expect(screen.getByText("Request submitted")).toBeInTheDocument()
    );
    // Reason should be reset to empty
    expect((reasonField as HTMLTextAreaElement).value).toBe("");
  });
});

describe("/request page — submit error", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
    mockFetch
      .mockResolvedValueOnce(okJson({ names: [] }))
      .mockResolvedValueOnce(okJson({ balances: [] }))
      .mockResolvedValueOnce(errorResponse(500, "Internal Server Error"));
  });

  it("shows error message on failed submit", async () => {
    await renderPage();
    fireEvent.change(screen.getByPlaceholderText(/At least 5 characters/i), {
      target: { value: "Need to change my shift time please" },
    });
    fireEvent.click(screen.getByText("Submit"));
    await waitFor(() =>
      expect(screen.getByText(/Submit failed/i)).toBeInTheDocument()
    );
  });
});

describe("/request page — overtime submit", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
    mockFetch
      .mockResolvedValueOnce(okJson({ names: [] }))
      .mockResolvedValueOnce(okJson({ balances: [] }))
      .mockResolvedValueOnce(okJson({ ok: true })); // /api/request/notify
  });

  it("submits overtime via /api/request/notify and shows success", async () => {
    await renderPage();
    fireEvent.change(screen.getByDisplayValue("Time Change"), {
      target: { value: "overtime_request" },
    });
    fireEvent.change(screen.getByPlaceholderText(/At least 5 characters/i), {
      target: { value: "Worked extra hours covering for absent staff" },
    });
    fireEvent.click(screen.getByText("Submit"));
    await waitFor(() =>
      expect(screen.getByText("Request submitted")).toBeInTheDocument()
    );
    // Notification sent
    expect(screen.getByText("Notification sent.")).toBeInTheDocument();
  });

  it("resets reason after overtime submit (bug regression)", async () => {
    await renderPage();
    fireEvent.change(screen.getByDisplayValue("Time Change"), {
      target: { value: "overtime_request" },
    });
    const reasonField = screen.getByPlaceholderText(/At least 5 characters/i);
    fireEvent.change(reasonField, {
      target: { value: "Worked extra hours covering for absent staff" },
    });
    fireEvent.click(screen.getByText("Submit"));
    await waitFor(() =>
      expect(screen.getByText("Request submitted")).toBeInTheDocument()
    );
    expect((reasonField as HTMLTextAreaElement).value).toBe("");
  });
});

describe("/request page — tab switching", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
    mockFetch.mockResolvedValue(okJson({ names: [], balances: [], items: [] }));
  });

  it("switches to History tab and shows header", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("My History"));
    await waitFor(() =>
      expect(screen.getByText("My Request History")).toBeInTheDocument()
    );
  });

  it("History tab shows empty state when no items", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("My History"));
    await waitFor(() =>
      expect(screen.getByText("No requests submitted yet.")).toBeInTheDocument()
    );
  });

  it("can switch back to Form tab", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("My History"));
    fireEvent.click(screen.getByText("Form"));
    await waitFor(() =>
      expect(screen.getByText("Request Form")).toBeInTheDocument()
    );
  });
});

describe("HistoryTab — items display", () => {
  const historyItem = {
    id: "notif-1",
    sender_name: "Test Staff",
    sender_city: "manila",
    notification_type: "paid_leave",
    request_date: "2026-05-01",
    target_date: "2026-05-10",
    leave_type: "annual_leave",
    leave_days: 2,
    overtime_hours: null,
    reason: "Family vacation",
    status: "pending",
    reviewed_by: null,
    reviewed_at: null,
    review_note: null,
    created_at: "2026-05-01T08:00:00Z",
  };

  beforeEach(() => {
    mockAuth = staffAuth();
    mockFetch
      .mockResolvedValueOnce(okJson({ names: [] }))
      .mockResolvedValueOnce(okJson({ balances: [] }))
      .mockResolvedValueOnce(okJson({ items: [historyItem] }));
  });

  it("shows notification type", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("My History"));
    await waitFor(() =>
      expect(screen.getByText("paid leave")).toBeInTheDocument()
    );
  });

  it("shows reason text", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("My History"));
    await waitFor(() =>
      expect(screen.getByText("Family vacation")).toBeInTheDocument()
    );
  });

  it("shows leave_days when leave_days > 0", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("My History"));
    await waitFor(() =>
      expect(screen.getByText(/2 day\(s\)/i)).toBeInTheDocument()
    );
  });

  it("shows leave_days when leave_days = 0 (bug regression)", async () => {
    // Reload with leave_days: 0
    mockFetch.mockReset();
    mockFetch
      .mockResolvedValueOnce(okJson({ names: [] }))
      .mockResolvedValueOnce(okJson({ balances: [] }))
      .mockResolvedValueOnce(okJson({ items: [{ ...historyItem, leave_days: 0 }] }));
    await renderPage();
    fireEvent.click(screen.getByText("My History"));
    await waitFor(() =>
      expect(screen.getByText(/0 day\(s\)/i)).toBeInTheDocument()
    );
  });

  it("shows target_date in item", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("My History"));
    await waitFor(() =>
      expect(screen.getByText("2026-05-10")).toBeInTheDocument()
    );
  });

  it("shows review note when present", async () => {
    mockFetch.mockReset();
    mockFetch
      .mockResolvedValueOnce(okJson({ names: [] }))
      .mockResolvedValueOnce(okJson({ balances: [] }))
      .mockResolvedValueOnce(okJson({
        items: [{ ...historyItem, review_note: "Approved by manager" }],
      }));
    await renderPage();
    fireEvent.click(screen.getByText("My History"));
    await waitFor(() =>
      expect(screen.getByText("Approved by manager")).toBeInTheDocument()
    );
  });

  it("shows error when API fails", async () => {
    mockFetch.mockReset();
    mockFetch
      .mockResolvedValueOnce(okJson({ names: [] }))
      .mockResolvedValueOnce(okJson({ balances: [] }))
      .mockResolvedValueOnce(errorResponse(500, "Server error"));
    await renderPage();
    fireEvent.click(screen.getByText("My History"));
    await waitFor(() =>
      expect(screen.getByText(/Error/i)).toBeInTheDocument()
    );
  });
});

describe("InboxTab — display and review", () => {
  const inboxItem = {
    id: "inbox-1",
    sender_name: "Alice Cruz",
    sender_city: "manila",
    notification_type: "leave",
    request_date: "2026-05-01",
    target_date: "2026-05-15",
    leave_type: "annual_leave",
    leave_days: 1,
    overtime_hours: null,
    reason: "Day off request",
    status: "pending",
    reviewed_by: null,
    reviewed_at: null,
    review_note: null,
    created_at: "2026-05-01T09:00:00Z",
  };

  beforeEach(() => {
    mockAuth = adminAuth();
    mockFetch
      .mockResolvedValueOnce(okJson({ names: [] }))
      .mockResolvedValueOnce(okJson({ balances: [] }))
      .mockResolvedValueOnce(okJson({ items: [inboxItem] }));
  });

  it("shows Pending Inbox heading", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("Inbox"));
    await waitFor(() =>
      expect(screen.getByText("Pending Inbox")).toBeInTheDocument()
    );
  });

  it("shows sender name", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("Inbox"));
    await waitFor(() =>
      expect(screen.getByText("Alice Cruz")).toBeInTheDocument()
    );
  });

  it("shows reason text", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("Inbox"));
    await waitFor(() =>
      expect(screen.getByText("Day off request")).toBeInTheDocument()
    );
  });

  it("shows leave_days count", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("Inbox"));
    await waitFor(() =>
      expect(screen.getByText("1 day(s)")).toBeInTheDocument()
    );
  });

  it("shows inbox count badge", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("Inbox"));
    await waitFor(() =>
      expect(screen.getByText("1")).toBeInTheDocument()
    );
  });

  it("shows Review button", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("Inbox"));
    await waitFor(() =>
      expect(screen.getByText("Review")).toBeInTheDocument()
    );
  });

  it("clicking Review shows Approve/Reject/Cancel buttons", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("Inbox"));
    await waitFor(() => screen.getByText("Review"));
    fireEvent.click(screen.getByText("Review"));
    expect(screen.getByText("Approve")).toBeInTheDocument();
    expect(screen.getByText("Reject")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("Cancel closes the review panel", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("Inbox"));
    await waitFor(() => screen.getByText("Review"));
    fireEvent.click(screen.getByText("Review"));
    expect(screen.getByText("Approve")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Cancel"));
    await waitFor(() =>
      expect(screen.queryByText("Approve")).not.toBeInTheDocument()
    );
  });

  it("Approve calls PATCH and removes item from list", async () => {
    mockFetch.mockResolvedValueOnce(okJson({ ok: true })); // PATCH review
    await renderPage();
    fireEvent.click(screen.getByText("Inbox"));
    await waitFor(() => screen.getByText("Review"));
    fireEvent.click(screen.getByText("Review"));
    await waitFor(() => screen.getByText("Approve"));
    fireEvent.click(screen.getByText("Approve"));
    await waitFor(() =>
      expect(screen.queryByText("Alice Cruz")).not.toBeInTheDocument()
    );
    // Should show empty state
    await waitFor(() =>
      expect(screen.getByText("No pending requests.")).toBeInTheDocument()
    );
  });

  it("Reject calls PATCH with rejected status and removes item", async () => {
    mockFetch.mockResolvedValueOnce(okJson({ ok: true })); // PATCH review
    await renderPage();
    fireEvent.click(screen.getByText("Inbox"));
    await waitFor(() => screen.getByText("Review"));
    fireEvent.click(screen.getByText("Review"));
    await waitFor(() => screen.getByText("Reject"));
    fireEvent.click(screen.getByText("Reject"));
    await waitFor(() =>
      expect(screen.queryByText("Alice Cruz")).not.toBeInTheDocument()
    );
  });

  it("shows error when review API fails", async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(500, "Review failed")); // PATCH fails
    await renderPage();
    fireEvent.click(screen.getByText("Inbox"));
    await waitFor(() => screen.getByText("Review"));
    fireEvent.click(screen.getByText("Review"));
    await waitFor(() => screen.getByText("Approve"));
    fireEvent.click(screen.getByText("Approve"));
    await waitFor(() =>
      expect(screen.getByText(/Review failed/i)).toBeInTheDocument()
    );
  });

  it("shows empty inbox state when no items", async () => {
    mockFetch.mockReset();
    mockFetch
      .mockResolvedValueOnce(okJson({ names: [] }))
      .mockResolvedValueOnce(okJson({ balances: [] }))
      .mockResolvedValueOnce(okJson({ items: [] }));
    await renderPage();
    fireEvent.click(screen.getByText("Inbox"));
    await waitFor(() =>
      expect(screen.getByText("No pending requests.")).toBeInTheDocument()
    );
  });
});

describe("/request page — leave balance display", () => {
  it("shows leave balance badges when API returns balances", async () => {
    mockAuth = staffAuth();
    mockFetch
      .mockResolvedValueOnce(okJson({ names: [] }))
      .mockResolvedValueOnce(
        okJson({
          balances: [
            { id: 1, leave_type: "annual_leave", entitled_days: 15, used_days: 3, remaining_days: 12 },
            { id: 2, leave_type: "sick_leave", entitled_days: 10, used_days: 0, remaining_days: 10 },
          ],
        })
      );
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("annual leave")).toBeInTheDocument()
    );
    expect(screen.getByText("12")).toBeInTheDocument();
  });
});

describe("/request page — visibilitychange listener (bug regression)", () => {
  it("registers and removes visibilitychange listener without leak", async () => {
    mockAuth = staffAuth();
    mockFetch.mockResolvedValue(okJson({ names: [], balances: [] }));

    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");

    const { unmount } = await renderPage();

    // visibilitychange should have been registered
    const addCalls = addSpy.mock.calls.map(c => c[0]);
    expect(addCalls).toContain("visibilitychange");

    unmount();

    // visibilitychange should have been removed
    const removeCalls = removeSpy.mock.calls.map(c => c[0]);
    expect(removeCalls).toContain("visibilitychange");
  });
});
