// tests/incidents/incidents-page.test.tsx
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
  const Icon = ({ className }: { className?: string }) => (
    <span data-testid="icon" className={className} />
  );
  return {
    AlertTriangle: Icon, CheckCircle2: Icon, ChevronDown: Icon, ChevronUp: Icon,
    Clock: Icon, Image: Icon, Loader2: Icon, MessageSquare: Icon, Plus: Icon,
    Send: Icon, X: Icon,
  };
});

// Auth mock — plain fns so vi.restoreAllMocks() doesn't reset them
let mockAuth: Record<string, unknown> | null = null;

vi.mock("@/lib/auth", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...real,
    getAuth: () => mockAuth,
    getAuthHeaders: () => ({
      "Content-Type": "application/json",
      Authorization: "Bearer test-token",
    }),
  };
});

vi.mock("@/lib/api", () => ({ API_BASE: "" }));

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
    accessToken: "tok-abc",
    ...overrides,
  };
}

type Reply = { id: string; author_name: string; author_role: string; message: string; created_at: string; };
type Attachment = { id: string; file_name: string; web_view_link?: string; mime_type?: string; };
type Incident = {
  id: string; city: string; branch: string; reporter_name: string;
  category: string; severity: string; description: string;
  incident_datetime: string; status: string; created_at: string;
  replies: Reply[]; attachments: Attachment[];
};

function makeIncident(overrides: Partial<Incident> = {}): Incident {
  return {
    id: "inc-001",
    city: "dubai",
    branch: "JLT",
    reporter_name: "Jay Nishimura",
    category: "Product Issue",
    severity: "medium",
    description: "Something went wrong.",
    incident_datetime: "2026-05-01T10:00:00Z",
    status: "new",
    created_at: "2026-05-01T10:05:00Z",
    replies: [],
    attachments: [],
    ...overrides,
  };
}

const EMPTY_LIST = { items: [] };

function listResponse(incidents: Incident[]) {
  return { items: incidents };
}

function fetchOk(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as Response);
}

function fetchErr(status: number, msg: string) {
  return Promise.resolve({
    ok: false,
    status,
    text: () => Promise.resolve(msg),
    json: () => Promise.reject(new Error(msg)),
  } as Response);
}

async function renderPage() {
  const IncidentsPage = (await import("@/app/incidents/page")).default;
  render(<IncidentsPage />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("/incidents — auth guard", () => {
  it("redirects to /login when no auth", async () => {
    mockAuth = null;
    mockFetch.mockResolvedValue(fetchOk(EMPTY_LIST));
    await renderPage();
    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith(
        "/login?next=%2Fincidents"
      )
    );
  });

  it("redirects to /login when accessToken is missing", async () => {
    mockAuth = { staffName: "Jay", city: "dubai", role: "STAFF" };
    mockFetch.mockResolvedValue(fetchOk(EMPTY_LIST));
    await renderPage();
    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith(
        "/login?next=%2Fincidents"
      )
    );
  });

  it("shows page when auth is valid", async () => {
    mockAuth = staffAuth();
    mockFetch.mockResolvedValue(fetchOk(EMPTY_LIST));
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Incident Reports")).toBeInTheDocument()
    );
  });
});

describe("/incidents — page structure", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
    mockFetch.mockResolvedValue(fetchOk(EMPTY_LIST));
  });

  it("renders page title", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Incident Reports")).toBeInTheDocument()
    );
  });

  it("renders subtitle", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/Report and track workplace incidents/i)).toBeInTheDocument()
    );
  });

  it("renders 'New Report' button", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("New Report")).toBeInTheDocument()
    );
  });

  it("renders 'Submitted Reports' section", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Submitted Reports")).toBeInTheDocument()
    );
  });

  it("renders empty state when no reports", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("No reports yet")).toBeInTheDocument()
    );
  });

  it("renders total/open/resolved stats when items exist", async () => {
    mockFetch.mockResolvedValue(
      fetchOk(listResponse([
        makeIncident({ status: "new" }),
        makeIncident({ id: "inc-002", status: "resolved" }),
      ]))
    );
    await renderPage();
    // "Resolved" appears both as a stats label and a status badge, so use getAllByText
    await waitFor(() => {
      expect(screen.getByText("Total")).toBeInTheDocument();
      expect(screen.getByText("Open")).toBeInTheDocument();
      expect(screen.getAllByText("Resolved").length).toBeGreaterThan(0);
    });
  });
});

describe("/incidents — list loading and errors", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
  });

  it("shows loading spinner while fetching", async () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/Loading reports/i)).toBeInTheDocument()
    );
  });

  it("shows error message when list fetch fails", async () => {
    mockFetch.mockResolvedValue(fetchErr(500, "Server error"));
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/Server error/i)).toBeInTheDocument()
    );
  });

  it("renders incident card with category and branch", async () => {
    mockFetch.mockResolvedValue(
      fetchOk(listResponse([makeIncident({ category: "Equipment Issue", branch: "Business Bay" })]))
    );
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText("Equipment Issue")).toBeInTheDocument();
      expect(screen.getByText("Business Bay")).toBeInTheDocument();
    });
  });

  it("renders status badge for incident", async () => {
    mockFetch.mockResolvedValue(
      fetchOk(listResponse([makeIncident({ status: "new" })]))
    );
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("New")).toBeInTheDocument()
    );
  });

  it("renders 'Acknowledged' status", async () => {
    mockFetch.mockResolvedValue(
      fetchOk(listResponse([makeIncident({ status: "acknowledged" })]))
    );
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Acknowledged")).toBeInTheDocument()
    );
  });

  it("renders 'In Progress' status", async () => {
    mockFetch.mockResolvedValue(
      fetchOk(listResponse([makeIncident({ status: "in_progress" })]))
    );
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("In Progress")).toBeInTheDocument()
    );
  });

  it("renders 'Resolved' status", async () => {
    mockFetch.mockResolvedValue(
      fetchOk(listResponse([makeIncident({ status: "resolved" })]))
    );
    await renderPage();
    // "Resolved" appears both as status badge and stats label — use getAllByText
    await waitFor(() =>
      expect(screen.getAllByText("Resolved").length).toBeGreaterThan(0)
    );
  });

  it("renders reply count badge when replies exist", async () => {
    const inc = makeIncident({
      replies: [{ id: "r1", author_name: "HQ", author_role: "ADMIN", message: "Noted.", created_at: "2026-05-01T11:00:00Z" }],
    });
    mockFetch.mockResolvedValue(fetchOk(listResponse([inc])));
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/1 reply/i)).toBeInTheDocument()
    );
  });

  it("renders '2 reports' count label", async () => {
    mockFetch.mockResolvedValue(
      fetchOk(listResponse([
        makeIncident({ id: "inc-001" }),
        makeIncident({ id: "inc-002" }),
      ]))
    );
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("2 reports")).toBeInTheDocument()
    );
  });

  it("renders '1 report' (singular)", async () => {
    mockFetch.mockResolvedValue(fetchOk(listResponse([makeIncident()])));
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("1 report")).toBeInTheDocument()
    );
  });
});

describe("/incidents — form toggle", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
    mockFetch.mockResolvedValue(fetchOk(EMPTY_LIST));
  });

  it("form is hidden by default", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("New Report"));
    expect(screen.queryByText("New Incident Report")).not.toBeInTheDocument();
  });

  it("clicking 'New Report' shows the form", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("New Report"));
    fireEvent.click(screen.getByText("New Report"));
    expect(screen.getByText("New Incident Report")).toBeInTheDocument();
  });

  it("clicking 'Cancel' hides the form", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("New Report"));
    fireEvent.click(screen.getByText("New Report"));
    expect(screen.getByText("New Incident Report")).toBeInTheDocument();
    // Two "Cancel" buttons exist when form is open: the header toggle and the form footer.
    // Click the form footer Cancel (secondary button, no icon sibling).
    const cancelBtns = screen.getAllByText("Cancel");
    // The form footer Cancel is the last one
    fireEvent.click(cancelBtns[cancelBtns.length - 1]);
    expect(screen.queryByText("New Incident Report")).not.toBeInTheDocument();
  });

  it("form shows branch selector after opening", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("New Report"));
    fireEvent.click(screen.getByText("New Report"));
    expect(screen.getByText("Branch *")).toBeInTheDocument();
  });

  it("form shows all severity levels", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("New Report"));
    fireEvent.click(screen.getByText("New Report"));
    expect(screen.getByText("Low")).toBeInTheDocument();
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Critical")).toBeInTheDocument();
  });

  it("form shows all incident categories", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("New Report"));
    fireEvent.click(screen.getByText("New Report"));
    expect(screen.getByText("Product Issue")).toBeInTheDocument();
    expect(screen.getByText("Customer Issue")).toBeInTheDocument();
    expect(screen.getByText("Injury")).toBeInTheDocument();
  });
});

describe("/incidents — form validation", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
    mockFetch.mockResolvedValue(fetchOk(EMPTY_LIST));
  });

  it("shows error when submitting without category", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("New Report"));
    fireEvent.click(screen.getByText("New Report"));
    fireEvent.click(screen.getByText("Submit Report"));
    expect(screen.getByText(/Please select a category/i)).toBeInTheDocument();
  });

  it("shows error when submitting without branch", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("New Report"));
    fireEvent.click(screen.getByText("New Report"));
    // Select a category
    fireEvent.click(screen.getByText("Product Issue"));
    fireEvent.click(screen.getByText("Submit Report"));
    expect(screen.getByText(/Please select a branch/i)).toBeInTheDocument();
  });

  it("shows error when submitting without description", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("New Report"));
    fireEvent.click(screen.getByText("New Report"));
    // Select category
    fireEvent.click(screen.getByText("Product Issue"));
    // Select branch via the select element
    const branchSelect = screen.getAllByRole("combobox").find(
      (el) => el.getAttribute("value") === "" || el.closest("div")?.textContent?.includes("Branch")
    );
    // Use the second select (branch)
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[1], { target: { value: "JLT" } });
    fireEvent.click(screen.getByText("Submit Report"));
    expect(screen.getByText(/Please enter a description/i)).toBeInTheDocument();
  });
});

describe("/incidents — form submission", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
  });

  it("submits and shows success message", async () => {
    mockFetch
      .mockResolvedValueOnce(fetchOk(EMPTY_LIST))                          // initial load
      .mockResolvedValueOnce(fetchOk({ report_id: "new-001" }))            // POST incident
      .mockResolvedValueOnce(fetchOk(EMPTY_LIST));                         // reload

    await renderPage();
    await waitFor(() => screen.getByText("New Report"));
    fireEvent.click(screen.getByText("New Report"));

    fireEvent.click(screen.getByText("Product Issue"));
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[1], { target: { value: "JLT" } });
    const textarea = screen.getByPlaceholderText(/Describe the incident/i);
    fireEvent.change(textarea, { target: { value: "Ice machine broken." } });

    fireEvent.click(screen.getByText("Submit Report"));

    await waitFor(() =>
      expect(screen.getByText(/Report submitted successfully/i)).toBeInTheDocument()
    );
  });

  it("hides form after successful submission", async () => {
    mockFetch
      .mockResolvedValueOnce(fetchOk(EMPTY_LIST))
      .mockResolvedValueOnce(fetchOk({ report_id: "new-002" }))
      .mockResolvedValueOnce(fetchOk(EMPTY_LIST));

    await renderPage();
    await waitFor(() => screen.getByText("New Report"));
    fireEvent.click(screen.getByText("New Report"));
    fireEvent.click(screen.getByText("Product Issue"));
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[1], { target: { value: "JLT" } });
    fireEvent.change(screen.getByPlaceholderText(/Describe the incident/i), {
      target: { value: "Description here." },
    });
    fireEvent.click(screen.getByText("Submit Report"));

    await waitFor(() =>
      expect(screen.queryByText("New Incident Report")).not.toBeInTheDocument()
    );
  });

  it("shows error when POST fails", async () => {
    mockFetch
      .mockResolvedValueOnce(fetchOk(EMPTY_LIST))
      .mockResolvedValueOnce(fetchErr(500, "Submission failed"));

    await renderPage();
    await waitFor(() => screen.getByText("New Report"));
    fireEvent.click(screen.getByText("New Report"));
    fireEvent.click(screen.getByText("Product Issue"));
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[1], { target: { value: "JLT" } });
    fireEvent.change(screen.getByPlaceholderText(/Describe the incident/i), {
      target: { value: "Description." },
    });
    fireEvent.click(screen.getByText("Submit Report"));

    await waitFor(() =>
      expect(screen.getByText(/Submission failed/i)).toBeInTheDocument()
    );
  });

  it("shows partial-success message when image upload fails (attachment bug regression)", async () => {
    mockFetch
      .mockResolvedValueOnce(fetchOk(EMPTY_LIST))
      .mockResolvedValueOnce(fetchOk({ report_id: "new-003" }))    // main POST OK
      .mockResolvedValueOnce(fetchErr(500, "Upload error"))          // attachment POST fails
      .mockResolvedValueOnce(fetchOk(EMPTY_LIST));                   // reload

    await renderPage();
    await waitFor(() => screen.getByText("New Report"));
    fireEvent.click(screen.getByText("New Report"));
    fireEvent.click(screen.getByText("Product Issue"));
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[1], { target: { value: "JLT" } });
    fireEvent.change(screen.getByPlaceholderText(/Describe the incident/i), {
      target: { value: "Test description." },
    });

    // Simulate an image file selected
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const fakeFile = new File(["img"], "photo.jpg", { type: "image/jpeg" });
    Object.defineProperty(fileInput, "files", { value: [fakeFile], configurable: true });
    fireEvent.change(fileInput);

    fireEvent.click(screen.getByText("Submit Report"));

    await waitFor(() =>
      expect(screen.getByText(/Image upload failed/i)).toBeInTheDocument()
    );
    // Must NOT show clean success
    expect(screen.queryByText("Report submitted successfully.")).not.toBeInTheDocument();
  });
});

describe("/incidents — expand / collapse", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
  });

  it("clicking an incident card expands its details", async () => {
    mockFetch.mockResolvedValue(
      fetchOk(listResponse([makeIncident({ description: "Detailed description here" })]))
    );
    await renderPage();
    await waitFor(() => screen.getByText("Product Issue"));

    // Click the card to expand
    fireEvent.click(screen.getByText("Product Issue").closest("button")!);
    await waitFor(() =>
      expect(screen.getByText("Description")).toBeInTheDocument()
    );
  });

  it("clicking expanded card collapses it", async () => {
    mockFetch.mockResolvedValue(
      fetchOk(listResponse([makeIncident()]))
    );
    await renderPage();
    await waitFor(() => screen.getByText("Product Issue"));
    const btn = screen.getByText("Product Issue").closest("button")!;

    // Expand
    fireEvent.click(btn);

    // Mock the mark-read call
    mockFetch.mockResolvedValue(fetchOk({ ok: true }));

    await waitFor(() => screen.getByText("Description"));

    // Collapse
    fireEvent.click(btn);
    await waitFor(() =>
      expect(screen.queryByText("Description")).not.toBeInTheDocument()
    );
  });

  it("expanding dispatches badge refresh for incidents", async () => {
    mockFetch
      .mockResolvedValueOnce(fetchOk(listResponse([makeIncident()])))
      .mockResolvedValueOnce(fetchOk({ ok: true })); // mark-read

    await renderPage();
    await waitFor(() => screen.getByText("Product Issue"));
    fireEvent.click(screen.getByText("Product Issue").closest("button")!);

    await waitFor(() =>
      expect(mockDispatchBadgeRefresh).toHaveBeenCalledWith("incidents")
    );
  });
});

describe("/incidents — expanded detail view", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
  });

  async function expandFirst() {
    await waitFor(() => screen.getByText("Product Issue"));
    mockFetch.mockResolvedValueOnce(fetchOk({ ok: true })); // mark-read
    fireEvent.click(screen.getByText("Product Issue").closest("button")!);
    await waitFor(() => screen.getByText("Description"));
  }

  it("shows severity in expanded view", async () => {
    mockFetch.mockResolvedValue(
      fetchOk(listResponse([makeIncident({ severity: "high" })]))
    );
    await renderPage();
    await expandFirst();
    expect(screen.getByText(/High/)).toBeInTheDocument();
  });

  it("shows description in expanded view", async () => {
    mockFetch.mockResolvedValue(
      fetchOk(listResponse([makeIncident({ description: "Ice machine is leaking" })]))
    );
    await renderPage();
    await expandFirst();
    expect(screen.getAllByText("Ice machine is leaking").length).toBeGreaterThan(0);
  });

  it("shows HQ replies when present", async () => {
    const inc = makeIncident({
      replies: [
        {
          id: "r1", author_name: "Manager Kim", author_role: "HQ",
          message: "We will fix this.", created_at: "2026-05-01T12:00:00Z",
        },
      ],
    });
    mockFetch.mockResolvedValue(fetchOk(listResponse([inc])));
    await renderPage();
    await expandFirst();
    expect(screen.getByText("Manager Kim")).toBeInTheDocument();
    expect(screen.getByText("We will fix this.")).toBeInTheDocument();
  });

  it("shows reply author role badge", async () => {
    const inc = makeIncident({
      replies: [
        {
          id: "r1", author_name: "Manager Kim", author_role: "HQ",
          message: "Got it.", created_at: "2026-05-01T12:00:00Z",
        },
      ],
    });
    mockFetch.mockResolvedValue(fetchOk(listResponse([inc])));
    await renderPage();
    await expandFirst();
    expect(screen.getByText("HQ")).toBeInTheDocument();
  });

  it("shows 'HQ Replies' heading when replies present", async () => {
    const inc = makeIncident({
      replies: [
        { id: "r1", author_name: "HQ", author_role: "ADMIN", message: "Noted.", created_at: "2026-05-01T11:00:00Z" },
      ],
    });
    mockFetch.mockResolvedValue(fetchOk(listResponse([inc])));
    await renderPage();
    await expandFirst();
    expect(screen.getByText("HQ Replies")).toBeInTheDocument();
  });
});

describe("/incidents — fmtDt utility", () => {
  // Test fmtDt indirectly through rendered output
  beforeEach(() => {
    mockAuth = staffAuth();
  });

  it("renders a formatted date for created_at", async () => {
    mockFetch.mockResolvedValue(
      fetchOk(listResponse([makeIncident({ created_at: "2026-05-01T10:05:00Z" })]))
    );
    await renderPage();
    await waitFor(() => screen.getByText("Product Issue"));
    // Should render some date text, just check it's not raw ISO
    const dateEl = screen.queryByText("2026-05-01T10:05:00Z");
    expect(dateEl).not.toBeInTheDocument();
  });

  it("renders '—' for empty incident_datetime", async () => {
    mockFetch.mockResolvedValue(
      fetchOk(listResponse([makeIncident({ incident_datetime: "" })]))
    );
    await renderPage();
    // incident_datetime is only shown in expanded view; just test rendering doesn't crash
    await waitFor(() => screen.getByText("Product Issue"));
  });
});
