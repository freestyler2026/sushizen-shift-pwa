// tests/inbox/inbox-page.test.tsx
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { routerMock } from "../setup";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock("lucide-react", () => {
  const Icon = (props: { className?: string }) => (
    <span data-testid="icon" className={props.className} />
  );
  return { Bell: Icon, MailOpen: Icon, ClipboardList: Icon };
});

// Auth mock — plain fns so vi.restoreAllMocks() doesn't reset them
let mockAuth: Record<string, unknown> | null = null;

vi.mock("@/lib/auth", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...real,
    getAuth: () => mockAuth,
    refreshAuthFromApi: () => Promise.resolve(mockAuth),
  };
});

// badgeEvents mock
const mockDispatchBadgeRefresh = vi.fn();
vi.mock("@/lib/badgeEvents", () => ({
  dispatchBadgeRefresh: (...args: unknown[]) => mockDispatchBadgeRefresh(...args),
}));

// Fetch mock
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// ── Helpers ───────────────────────────────────────────────────────────────────

function staffAuth(overrides: Record<string, unknown> = {}) {
  return {
    staffName: "Jay Nishimura",
    city: "dubai" as const,
    role: "STAFF",
    accessToken: "tok-123",
    ...overrides,
  };
}

type InboxRow = {
  id: number;
  report_id: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

function makeRow(overrides: Partial<InboxRow> = {}): InboxRow {
  return {
    id: 1,
    report_id: "rpt-001",
    message: "Hello from HQ.",
    is_read: false,
    created_at: "2026-05-01T10:00:00Z",
    ...overrides,
  };
}

const EMPTY_INBOX = { rows: [], unread_count: 0 };

function inboxResponse(rows: InboxRow[], unread_count = 0) {
  return { rows, unread_count };
}

function fetchOk(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);
}

function fetchErr(status: number, msg: string) {
  return Promise.resolve({
    ok: false,
    status,
    text: () => Promise.resolve(msg),
  } as Response);
}

async function renderPage() {
  const InboxPage = (await import("@/app/inbox/page")).default;
  render(<InboxPage />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("/inbox — auth guard", () => {
  it("redirects to /login when no auth", async () => {
    mockAuth = null;
    mockFetch.mockResolvedValue(fetchOk(EMPTY_INBOX));
    await renderPage();
    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith(
        "/login?next=%2Finbox"
      )
    );
  });

  it("redirects to /login when accessToken is missing", async () => {
    mockAuth = { staffName: "Jay", city: "dubai", role: "STAFF" };
    mockFetch.mockResolvedValue(fetchOk(EMPTY_INBOX));
    await renderPage();
    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith(
        "/login?next=%2Finbox"
      )
    );
  });

  it("shows page when auth is valid", async () => {
    mockAuth = staffAuth();
    mockFetch.mockResolvedValue(fetchOk(EMPTY_INBOX));
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Inbox")).toBeInTheDocument()
    );
  });
});

describe("/inbox — page structure", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
    mockFetch.mockResolvedValue(fetchOk(EMPTY_INBOX));
  });

  it("renders page title", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("Inbox")).toBeInTheDocument());
  });

  it("renders subtitle", async () => {
    await renderPage();
    await waitFor(() =>
      expect(
        screen.getByText(/Submitted requests and private replies/i)
      ).toBeInTheDocument()
    );
  });

  it("renders 'Message Center' section header", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Message Center")).toBeInTheDocument()
    );
  });

  it("renders Refresh button", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Refresh")).toBeInTheDocument()
    );
  });

  it("renders 'Mark all unread as read' button", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Mark all unread as read")).toBeInTheDocument()
    );
  });

  it("renders '0 unread' badge when inbox is empty", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/0 unread/i)).toBeInTheDocument()
    );
  });
});

describe("/inbox — loading and error states", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
  });

  it("shows error when fetch fails", async () => {
    mockFetch.mockResolvedValue(fetchErr(500, "Server error"));
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/Server error/i)).toBeInTheDocument()
    );
  });

  it("shows empty state when no messages", async () => {
    mockFetch.mockResolvedValue(fetchOk(EMPTY_INBOX));
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("No messages.")).toBeInTheDocument()
    );
  });
});

describe("/inbox — rendering messages", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
  });

  it("renders a plain (non-request) message body", async () => {
    const row = makeRow({ message: "Hello from HQ." });
    mockFetch.mockResolvedValue(fetchOk(inboxResponse([row])));
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Hello from HQ.")).toBeInTheDocument()
    );
  });

  it("renders 'Mark read' button for unread messages", async () => {
    const row = makeRow({ is_read: false });
    mockFetch.mockResolvedValue(fetchOk(inboxResponse([row], 1)));
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Mark read")).toBeInTheDocument()
    );
  });

  it("renders 'Read' badge for already-read messages", async () => {
    const row = makeRow({ is_read: true });
    mockFetch.mockResolvedValue(fetchOk(inboxResponse([row], 0)));
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Read")).toBeInTheDocument()
    );
  });

  it("shows correct unread count badge", async () => {
    const rows = [
      makeRow({ id: 1, is_read: false }),
      makeRow({ id: 2, is_read: false }),
    ];
    mockFetch.mockResolvedValue(fetchOk(inboxResponse(rows, 2)));
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/2 unread/i)).toBeInTheDocument()
    );
  });

  it("renders multiple messages", async () => {
    const rows = [
      makeRow({ id: 1, message: "Message one" }),
      makeRow({ id: 2, message: "Message two" }),
    ];
    mockFetch.mockResolvedValue(fetchOk(inboxResponse(rows)));
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText("Message one")).toBeInTheDocument();
      expect(screen.getByText("Message two")).toBeInTheDocument();
    });
  });
});

describe("/inbox — structured request messages", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
  });

  function requestMessage(fields: Record<string, string> = {}) {
    const header = "[Request Submitted] Overtime Request";
    const lines = Object.entries(fields).map(([k, v]) => `${k}: ${v}`);
    return [header, ...lines].join("\n");
  }

  it("renders structured title for [Request Submitted] messages", async () => {
    const row = makeRow({ message: requestMessage() });
    mockFetch.mockResolvedValue(fetchOk(inboxResponse([row])));
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Overtime Request")).toBeInTheDocument()
    );
  });

  it("renders Date field from parsed message", async () => {
    const row = makeRow({ message: requestMessage({ Date: "2026-05-10" }) });
    mockFetch.mockResolvedValue(fetchOk(inboxResponse([row])));
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("2026-05-10")).toBeInTheDocument()
    );
  });

  it("renders Urgency field from parsed message", async () => {
    const row = makeRow({ message: requestMessage({ Urgency: "High" }) });
    mockFetch.mockResolvedValue(fetchOk(inboxResponse([row])));
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("High")).toBeInTheDocument()
    );
  });

  it("renders Status field from parsed message", async () => {
    const row = makeRow({ message: requestMessage({ Status: "Pending" }) });
    mockFetch.mockResolvedValue(fetchOk(inboxResponse([row])));
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Pending")).toBeInTheDocument()
    );
  });

  it("renders Reason field from parsed message", async () => {
    const row = makeRow({ message: requestMessage({ Reason: "Need overtime pay" }) });
    mockFetch.mockResolvedValue(fetchOk(inboxResponse([row])));
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Need overtime pay")).toBeInTheDocument()
    );
  });

  it("renders 'Requested time' field from parsed message", async () => {
    const row = makeRow({
      message: requestMessage({ "Requested time": "18:00 - 22:00" }),
    });
    mockFetch.mockResolvedValue(fetchOk(inboxResponse([row])));
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("18:00 - 22:00")).toBeInTheDocument()
    );
  });

  it("renders Request ID from parsed message", async () => {
    const row = makeRow({
      message: requestMessage({ "Request ID": "REQ-9999" }),
    });
    mockFetch.mockResolvedValue(fetchOk(inboxResponse([row])));
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/REQ-9999/)).toBeInTheDocument()
    );
  });

  it("does NOT render raw message body for parsed messages", async () => {
    const raw = "[Request Submitted] Overtime Request\nDate: 2026-05-10";
    const row = makeRow({ message: raw });
    mockFetch.mockResolvedValue(fetchOk(inboxResponse([row])));
    await renderPage();
    await waitFor(() => screen.getByText("Overtime Request"));
    // The raw string should not appear as a single block
    expect(screen.queryByText(raw)).not.toBeInTheDocument();
  });
});

describe("/inbox — mark read", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
  });

  it("calls mark-read API and reloads inbox on 'Mark read' click", async () => {
    const row = makeRow({ id: 42, is_read: false });
    mockFetch
      .mockResolvedValueOnce(fetchOk(inboxResponse([row], 1)))   // initial load
      .mockResolvedValueOnce(fetchOk({ ok: true }))              // mark-read POST
      .mockResolvedValueOnce(fetchOk(inboxResponse([{ ...row, is_read: true }], 0))); // reload

    await renderPage();
    await waitFor(() => screen.getByText("Mark read"));

    fireEvent.click(screen.getByText("Mark read"));

    await waitFor(() =>
      expect(screen.getByText("Read")).toBeInTheDocument()
    );
  });

  it("dispatches badge refresh after mark-read", async () => {
    const row = makeRow({ id: 5, is_read: false });
    mockFetch
      .mockResolvedValueOnce(fetchOk(inboxResponse([row], 1)))
      .mockResolvedValueOnce(fetchOk({ ok: true }))
      .mockResolvedValueOnce(fetchOk(inboxResponse([{ ...row, is_read: true }], 0)));

    await renderPage();
    await waitFor(() => screen.getByText("Mark read"));
    fireEvent.click(screen.getByText("Mark read"));

    await waitFor(() =>
      expect(mockDispatchBadgeRefresh).toHaveBeenCalledWith("inbox")
    );
  });

  it("shows error when mark-read POST fails", async () => {
    const row = makeRow({ id: 7, is_read: false });
    mockFetch
      .mockResolvedValueOnce(fetchOk(inboxResponse([row], 1)))
      .mockResolvedValueOnce(fetchErr(500, "Mark read failed"));

    await renderPage();
    await waitFor(() => screen.getByText("Mark read"));
    fireEvent.click(screen.getByText("Mark read"));

    await waitFor(() =>
      expect(screen.getByText(/Mark read failed/i)).toBeInTheDocument()
    );
  });

  it("'Mark all unread as read' button is disabled when no unread messages", async () => {
    const row = makeRow({ is_read: true });
    mockFetch.mockResolvedValue(fetchOk(inboxResponse([row], 0)));
    await renderPage();
    await waitFor(() => screen.getByText("Mark all unread as read"));
    expect(screen.getByText("Mark all unread as read")).toBeDisabled();
  });

  it("'Mark all unread as read' button is enabled when there are unread messages", async () => {
    const row = makeRow({ is_read: false });
    mockFetch.mockResolvedValue(fetchOk(inboxResponse([row], 1)));
    await renderPage();
    await waitFor(() => screen.getByText("Mark all unread as read"));
    expect(screen.getByText("Mark all unread as read")).not.toBeDisabled();
  });

  it("calls mark-read with all unread IDs when 'Mark all' is clicked", async () => {
    const rows = [
      makeRow({ id: 10, is_read: false }),
      makeRow({ id: 11, is_read: false }),
    ];
    mockFetch
      .mockResolvedValueOnce(fetchOk(inboxResponse(rows, 2)))
      .mockResolvedValueOnce(fetchOk({ ok: true }))
      .mockResolvedValueOnce(fetchOk(EMPTY_INBOX));

    await renderPage();
    await waitFor(() => screen.getByText("Mark all unread as read"));
    fireEvent.click(screen.getByText("Mark all unread as read"));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));

    const markReadCall = mockFetch.mock.calls[1];
    const body = JSON.parse(markReadCall[1].body);
    expect(body.notification_ids).toEqual(expect.arrayContaining([10, 11]));
  });

  it("shows 'Marking...' on 'Mark all' button while busy", async () => {
    const row = makeRow({ is_read: false });
    let resolve!: (v: Response) => void;
    const pending = new Promise<Response>((res) => { resolve = res; });

    mockFetch
      .mockResolvedValueOnce(fetchOk(inboxResponse([row], 1)))
      .mockReturnValueOnce(pending);

    await renderPage();
    await waitFor(() => screen.getByText("Mark all unread as read"));
    fireEvent.click(screen.getByText("Mark all unread as read"));

    await waitFor(() =>
      expect(screen.getByText("Marking...")).toBeInTheDocument()
    );
    resolve(fetchOk({ ok: true }) as unknown as Response);
  });
});

describe("/inbox — Refresh button", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
  });

  it("Refresh button re-fetches inbox", async () => {
    mockFetch.mockResolvedValue(fetchOk(EMPTY_INBOX));
    await renderPage();
    await waitFor(() => screen.getByText("No messages."));

    const callsBefore = mockFetch.mock.calls.length;
    fireEvent.click(screen.getByText("Refresh"));

    await waitFor(() =>
      expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore)
    );
  });

  it("Refresh button is disabled while loading", async () => {
    let resolve!: (v: Response) => void;
    const pending = new Promise<Response>((res) => { resolve = res; });
    mockFetch.mockReturnValueOnce(pending);

    await renderPage();
    const btn = screen.getByText("Refresh");
    await waitFor(() => expect(btn).toBeDisabled());
    resolve(fetchOk(EMPTY_INBOX) as unknown as Response);
  });
});

describe("/inbox — visibilitychange regression", () => {
  it("removes the correct visibilitychange handler on unmount (no leak)", async () => {
    mockAuth = staffAuth();
    mockFetch.mockResolvedValue(fetchOk(EMPTY_INBOX));

    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");

    const { unmount } = render(
      React.createElement((await import("@/app/inbox/page")).default)
    );

    await waitFor(() => screen.getByText("Inbox"));

    const addedHandler = addSpy.mock.calls.find(
      ([event]) => event === "visibilitychange"
    )?.[1];

    unmount();

    const removedHandler = removeSpy.mock.calls.find(
      ([event]) => event === "visibilitychange"
    )?.[1];

    // The exact same function reference must be used for both add and remove
    expect(addedHandler).toBeDefined();
    expect(removedHandler).toBeDefined();
    expect(addedHandler).toBe(removedHandler);
  });
});

describe("/inbox — parseRequestMessage (unit)", () => {
  it("returns null for non-request messages", async () => {
    // We test this indirectly: a plain message should render as whitespace-pre text
    mockAuth = staffAuth();
    mockFetch.mockResolvedValue(
      fetchOk(inboxResponse([makeRow({ message: "Plain text message" })]))
    );
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Plain text message")).toBeInTheDocument()
    );
    expect(screen.queryByText(/Overtime Request/)).not.toBeInTheDocument();
  });

  it("parses key-value pairs with colons in values correctly", async () => {
    mockAuth = staffAuth();
    const msg = "[Request Submitted] Shift Change\nRequested time: 09:00 - 17:00";
    mockFetch.mockResolvedValue(
      fetchOk(inboxResponse([makeRow({ message: msg })]))
    );
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("09:00 - 17:00")).toBeInTheDocument()
    );
  });
});
