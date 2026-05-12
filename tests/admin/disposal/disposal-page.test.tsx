// tests/admin/disposal/disposal-page.test.tsx
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { routerMock } from "../../setup";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

vi.mock("lucide-react", () => {
  const Icon = () => null;
  return { Loader2: Icon };
});

// Auth mock — plain fns
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

// Fetch mock
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// window.confirm / alert mocks
global.confirm = vi.fn(() => false);
global.alert = vi.fn();

// ── Helpers ───────────────────────────────────────────────────────────────────

function adminAuth(overrides: Record<string, unknown> = {}) {
  return {
    staffName: "Admin User",
    city: "dubai" as const,
    role: "ADMIN",
    accessToken: "tok-admin",
    ...overrides,
  };
}

function staffAuth(overrides: Record<string, unknown> = {}) {
  return {
    staffName: "Jay Nishimura",
    city: "dubai" as const,
    role: "STAFF",
    accessToken: "tok-staff",
    ...overrides,
  };
}

function fetchOk(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as Response);
}

function fetchErr(status: number, msg: string, isJson = false) {
  const body = isJson ? JSON.stringify({ detail: msg }) : msg;
  return Promise.resolve({
    ok: false,
    status,
    text: () => Promise.resolve(body),
    json: () => Promise.reject(new Error("not json")),
  } as Response);
}

const EMPTY_REPORTS = { reports: [] };
const EMPTY_STAFF = { names: [] };
const EMPTY_SEARCH = { items: [] };

/** Most calls are: staff names (on city change) + past reports + item search (optional) */
function defaultFetchMocks() {
  mockFetch.mockResolvedValue(fetchOk(EMPTY_STAFF));
}

async function renderPage() {
  const DisposalPage = (await import("@/app/admin/disposal/page")).default;
  render(<DisposalPage />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("/admin/disposal — page structure", () => {
  beforeEach(() => {
    mockAuth = adminAuth();
    defaultFetchMocks();
  });

  it("renders page title 'Disposal Report'", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Disposal Report")).toBeInTheDocument()
    );
  });

  it("renders 'Report Details' section heading", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Report Details")).toBeInTheDocument()
    );
  });

  it("renders 'Disposal Items' section heading", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Disposal Items")).toBeInTheDocument()
    );
  });

  it("renders 'Submit Disposal Report' button", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Submit Disposal Report")).toBeInTheDocument()
    );
  });

  it("renders 'Clear' button", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Clear")).toBeInTheDocument()
    );
  });

  it("renders '← My Shift' link", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/My Shift/)).toBeInTheDocument()
    );
  });

  it("renders city selector with Dubai and Manila options", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("Disposal Report"));
    const citySelect = screen.getByDisplayValue("Dubai");
    expect(citySelect).toBeInTheDocument();
  });

  it("renders shift selector with Closing option", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("Disposal Report"));
    expect(screen.getByDisplayValue("Closing")).toBeInTheDocument();
  });

  it("renders '+ Add manually' button", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("+ Add manually")).toBeInTheDocument()
    );
  });

  it("renders 'Past Reports' heading", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/Past Reports/)).toBeInTheDocument()
    );
  });

  it("reporter field pre-filled with auth staff name", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("Disposal Report"));
    expect(screen.getByDisplayValue("Admin User")).toBeInTheDocument();
  });
});

describe("/admin/disposal — initial line state", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
    defaultFetchMocks();
  });

  it("starts with one empty line", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("Disposal Report"));
    // One line means one Qty input
    const qtyInputs = screen.getAllByPlaceholderText("Qty");
    expect(qtyInputs.length).toBe(1);
  });

  it("shows '+ Add manually' button adds another line", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("+ Add manually"));
    fireEvent.click(screen.getByText("+ Add manually"));
    await waitFor(() => {
      const qtyInputs = screen.getAllByPlaceholderText("Qty");
      expect(qtyInputs.length).toBe(2);
    });
  });

  it("remove button (✕) removes a line", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("Disposal Report"));
    const removeBtn = screen.getByText("✕");
    fireEvent.click(removeBtn);
    await waitFor(() =>
      expect(screen.queryByPlaceholderText("Qty")).not.toBeInTheDocument()
    );
    expect(screen.getByText("Search above to add items")).toBeInTheDocument();
  });
});

describe("/admin/disposal — form validation", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
    defaultFetchMocks();
  });

  it("shows error when no valid lines on submit", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("Submit Disposal Report"));
    // Default line has no item name
    fireEvent.click(screen.getByText("Submit Disposal Report"));
    await waitFor(() =>
      expect(
        screen.getByText(/Please add at least one item with a valid quantity/i)
      ).toBeInTheDocument()
    );
  });

  it("shows error when reporter name is empty", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("Disposal Report"));

    // Clear reporter name
    const reporterInput = screen.getByDisplayValue("Jay Nishimura");
    fireEvent.change(reporterInput, { target: { value: "" } });

    // Type an item name so line is valid
    const itemInput = screen.getByPlaceholderText("Type item name…");
    fireEvent.change(itemInput, { target: { value: "Salmon" } });

    fireEvent.click(screen.getByText("Submit Disposal Report"));
    await waitFor(() =>
      expect(
        screen.getByText(/Please enter the reporter name/i)
      ).toBeInTheDocument()
    );
  });
});

describe("/admin/disposal — form submission", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
  });

  it("submits successfully and shows report ID", async () => {
    mockFetch
      .mockResolvedValueOnce(fetchOk(EMPTY_STAFF))    // staff names
      .mockResolvedValueOnce(fetchOk(EMPTY_REPORTS))  // past reports
      .mockResolvedValueOnce(fetchOk({ report_id: 42, status: "ok" }))  // POST
      .mockResolvedValueOnce(fetchOk(EMPTY_REPORTS)); // reload after submit

    await renderPage();
    await waitFor(() => screen.getByText("Disposal Report"));

    // Fill item name and quantity
    const itemInput = screen.getByPlaceholderText("Type item name…");
    fireEvent.change(itemInput, { target: { value: "Salmon" } });
    const qtyInput = screen.getByPlaceholderText("Qty");
    fireEvent.change(qtyInput, { target: { value: "5" } });

    fireEvent.click(screen.getByText("Submit Disposal Report"));

    await waitFor(() =>
      expect(screen.getByText(/Report #42 submitted/i)).toBeInTheDocument()
    );
  });

  it("shows error message when submit fails with JSON error", async () => {
    mockFetch
      .mockResolvedValueOnce(fetchOk(EMPTY_STAFF))
      .mockResolvedValueOnce(fetchOk(EMPTY_REPORTS))
      .mockResolvedValueOnce(fetchErr(500, "Duplicate report", true));

    await renderPage();
    await waitFor(() => screen.getByText("Disposal Report"));

    const itemInput = screen.getByPlaceholderText("Type item name…");
    fireEvent.change(itemInput, { target: { value: "Tuna" } });
    const qtyInput = screen.getByPlaceholderText("Qty");
    fireEvent.change(qtyInput, { target: { value: "3" } });

    fireEvent.click(screen.getByText("Submit Disposal Report"));

    await waitFor(() =>
      expect(screen.getByText(/Duplicate report/i)).toBeInTheDocument()
    );
  });

  it("shows plain-text error when server returns non-JSON body (apiFetch bug regression)", async () => {
    // Server returns HTML (e.g. Heroku 503 page) — not JSON
    const htmlError = "<html><body>Service Unavailable</body></html>";
    mockFetch
      .mockResolvedValueOnce(fetchOk(EMPTY_STAFF))
      .mockResolvedValueOnce(fetchOk(EMPTY_REPORTS))
      .mockResolvedValueOnce(fetchErr(503, htmlError, false)); // non-JSON

    await renderPage();
    await waitFor(() => screen.getByText("Disposal Report"));

    const itemInput = screen.getByPlaceholderText("Type item name…");
    fireEvent.change(itemInput, { target: { value: "Rice" } });
    const qtyInput = screen.getByPlaceholderText("Qty");
    fireEvent.change(qtyInput, { target: { value: "2" } });

    fireEvent.click(screen.getByText("Submit Disposal Report"));

    // Should show the HTML string as the error message, NOT throw an unhandled exception
    await waitFor(() =>
      expect(screen.getByText(/Service Unavailable/i)).toBeInTheDocument()
    );
  });

  it("clears lines after successful submission", async () => {
    mockFetch
      .mockResolvedValueOnce(fetchOk(EMPTY_STAFF))
      .mockResolvedValueOnce(fetchOk(EMPTY_REPORTS))
      .mockResolvedValueOnce(fetchOk({ report_id: 7, status: "ok" }))
      .mockResolvedValueOnce(fetchOk(EMPTY_REPORTS));

    await renderPage();
    await waitFor(() => screen.getByText("Disposal Report"));

    const itemInput = screen.getByPlaceholderText("Type item name…");
    fireEvent.change(itemInput, { target: { value: "Nori" } });
    const qtyInput = screen.getByPlaceholderText("Qty");
    fireEvent.change(qtyInput, { target: { value: "10" } });

    fireEvent.click(screen.getByText("Submit Disposal Report"));
    await waitFor(() => screen.getByText(/Report #7 submitted/i));

    // Lines should be cleared
    expect(screen.queryByPlaceholderText("Qty")).not.toBeInTheDocument();
  });
});

describe("/admin/disposal — clear button", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
    defaultFetchMocks();
  });

  it("Clear button removes all lines", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("Disposal Report"));
    // Add a line to make it non-empty
    fireEvent.click(screen.getByText("+ Add manually"));
    await waitFor(() =>
      expect(screen.getAllByPlaceholderText("Qty").length).toBe(2)
    );
    fireEvent.click(screen.getByText("Clear"));
    await waitFor(() =>
      expect(screen.queryByPlaceholderText("Qty")).not.toBeInTheDocument()
    );
  });

  it("Clear button removes submit success message", async () => {
    mockFetch
      .mockResolvedValueOnce(fetchOk(EMPTY_STAFF))
      .mockResolvedValueOnce(fetchOk(EMPTY_REPORTS))
      .mockResolvedValueOnce(fetchOk({ report_id: 99, status: "ok" }))
      .mockResolvedValueOnce(fetchOk(EMPTY_REPORTS));

    await renderPage();
    await waitFor(() => screen.getByText("Disposal Report"));

    const itemInput = screen.getByPlaceholderText("Type item name…");
    fireEvent.change(itemInput, { target: { value: "Wasabi" } });
    fireEvent.change(screen.getByPlaceholderText("Qty"), { target: { value: "1" } });
    fireEvent.click(screen.getByText("Submit Disposal Report"));
    await waitFor(() => screen.getByText(/Report #99/i));

    fireEvent.click(screen.getByText("Clear"));
    await waitFor(() =>
      expect(screen.queryByText(/Report #99/i)).not.toBeInTheDocument()
    );
  });
});

describe("/admin/disposal — draft restore", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
    defaultFetchMocks();
  });

  it("shows draft banner when valid draft exists in localStorage", async () => {
    const draft = {
      city: "dubai",
      branchCode: "JLT",
      reportDate: "2026-05-01",
      reportedBy: "Jay Nishimura",
      shift: "closing",
      headerNotes: "",
      lines: [
        {
          _key: "line_1", item_type: "menu_item", item_id: 5,
          item_name_snapshot: "Salmon Roll", item_category: "Fish",
          quantity: "3", unit: "pcs", disposal_reason: "eod_leftover", notes: "",
        },
      ],
      savedAt: Date.now(),
    };
    localStorage.setItem("disposal_draft_v1", JSON.stringify(draft));

    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/Draft restored/i)).toBeInTheDocument()
    );
  });

  it("does NOT show draft banner when draft has no named items", async () => {
    const draft = {
      city: "dubai", branchCode: "BB", reportDate: "2026-05-01",
      reportedBy: "Jay", shift: "closing", headerNotes: "",
      lines: [
        { _key: "line_1", item_type: "menu_item", item_id: null,
          item_name_snapshot: "", item_category: "", quantity: "1",
          unit: "pcs", disposal_reason: "eod_leftover", notes: "" },
      ],
      savedAt: Date.now(),
    };
    localStorage.setItem("disposal_draft_v1", JSON.stringify(draft));

    await renderPage();
    await waitFor(() => screen.getByText("Disposal Report"));
    expect(screen.queryByText(/Draft restored/i)).not.toBeInTheDocument();
  });

  it("does NOT show draft banner when draft is older than 24 hours", async () => {
    const old = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
    const draft = {
      city: "dubai", branchCode: "BB", reportDate: "2026-05-01",
      reportedBy: "Jay", shift: "closing", headerNotes: "",
      lines: [
        { _key: "line_1", item_type: "menu_item", item_id: 1,
          item_name_snapshot: "Tuna", item_category: "Fish", quantity: "2",
          unit: "pcs", disposal_reason: "eod_leftover", notes: "" },
      ],
      savedAt: old,
    };
    localStorage.setItem("disposal_draft_v1", JSON.stringify(draft));

    await renderPage();
    await waitFor(() => screen.getByText("Disposal Report"));
    expect(screen.queryByText(/Draft restored/i)).not.toBeInTheDocument();
  });

  it("discarding draft removes the banner", async () => {
    const draft = {
      city: "dubai", branchCode: "JLT", reportDate: "2026-05-01",
      reportedBy: "Jay", shift: "closing", headerNotes: "",
      lines: [
        { _key: "line_1", item_type: "menu_item", item_id: 3,
          item_name_snapshot: "Ebi", item_category: "Seafood", quantity: "5",
          unit: "pcs", disposal_reason: "eod_leftover", notes: "" },
      ],
      savedAt: Date.now(),
    };
    localStorage.setItem("disposal_draft_v1", JSON.stringify(draft));

    await renderPage();
    await waitFor(() => screen.getByText(/Draft restored/i));
    fireEvent.click(screen.getByText("Discard"));
    await waitFor(() =>
      expect(screen.queryByText(/Draft restored/i)).not.toBeInTheDocument()
    );
  });

  it("auto-save does NOT overwrite draft on first render (draft race regression)", async () => {
    // Pre-save a valid draft
    const draft = {
      city: "manila", branchCode: "MOA", reportDate: "2026-05-01",
      reportedBy: "Maria", shift: "morning", headerNotes: "Test note",
      lines: [
        { _key: "line_1", item_type: "menu_item", item_id: 10,
          item_name_snapshot: "Salmon Sashimi", item_category: "Fish", quantity: "4",
          unit: "pcs", disposal_reason: "eod_leftover", notes: "" },
      ],
      savedAt: Date.now(),
    };
    localStorage.setItem("disposal_draft_v1", JSON.stringify(draft));

    await renderPage();

    // After render, the draft banner should appear (not overwritten by defaults)
    await waitFor(() =>
      expect(screen.getByText(/Draft restored/i)).toBeInTheDocument()
    );

    // The restored draft item should be visible
    await waitFor(() =>
      expect(screen.getByText("Salmon Sashimi")).toBeInTheDocument()
    );
  });
});

// URL-routing mock helper for tests that need PastReports data
function routedFetch(reportsBody: unknown, staffBody: unknown = EMPTY_STAFF) {
  mockFetch.mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("/disposal/reports")) {
      return Promise.resolve(fetchOk(reportsBody)) as ReturnType<typeof fetch>;
    }
    return Promise.resolve(fetchOk(staffBody)) as ReturnType<typeof fetch>;
  });
}

describe("/admin/disposal — Past Reports panel", () => {
  beforeEach(() => {
    mockAuth = adminAuth();
  });

  it("shows 'No reports found' when empty", async () => {
    routedFetch(EMPTY_REPORTS);
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/No reports found for this period/i)).toBeInTheDocument()
    );
  });

  it("shows loading while fetching past reports", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/disposal/reports")) {
        return new Promise(() => {}) as ReturnType<typeof fetch>; // never resolves
      }
      return Promise.resolve(fetchOk(EMPTY_STAFF)) as ReturnType<typeof fetch>;
    });
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/Loading\.\.\./i)).toBeInTheDocument()
    );
  });

  it("shows error when past reports fetch fails", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/disposal/reports")) {
        return Promise.resolve(fetchErr(500, "DB error", true)) as ReturnType<typeof fetch>;
      }
      return Promise.resolve(fetchOk(EMPTY_STAFF)) as ReturnType<typeof fetch>;
    });
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/DB error/i)).toBeInTheDocument()
    );
  });

  it("renders report row with date, branch, shift, reporter", async () => {
    routedFetch({
      reports: [{
        id: 1, city: "dubai", branch_code: "JLT",
        report_date: "2026-05-10", reported_by: "Jay",
        shift: "closing", notes: "", status: "submitted",
        created_at: "2026-05-10T22:30:00Z",
        lines: [],
      }],
    });

    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("2026-05-10")).toBeInTheDocument()
    );
    // JLT also appears in the branch selector options — use getAllByText
    expect(screen.getAllByText("JLT").length).toBeGreaterThan(0);
    expect(screen.getByText(/Jay/)).toBeInTheDocument();
  });

  it("expanding a report shows its line items", async () => {
    routedFetch({
      reports: [{
        id: 2, city: "dubai", branch_code: "BB",
        report_date: "2026-05-09", reported_by: "Kim",
        shift: "closing", notes: "", status: "submitted",
        created_at: "2026-05-09T22:00:00Z",
        lines: [{
          id: 10, item_type: "menu_item",
          item_name_snapshot: "Salmon Nigiri",
          item_category: "Fish",
          quantity: 8, unit: "pcs", disposal_reason: "eod_leftover", notes: "",
        }],
      }],
    });

    await renderPage();
    await waitFor(() => screen.getByText("2026-05-09"));
    fireEvent.click(screen.getByText("2026-05-09"));
    // Both mobile-card and desktop-table views render, so text may appear twice
    await waitFor(() =>
      expect(screen.getAllByText("Salmon Nigiri").length).toBeGreaterThan(0)
    );
  });

  it("shows 'Delete All' button for admin users", async () => {
    routedFetch({
      reports: [{
        id: 3, city: "dubai", branch_code: "BB",
        report_date: "2026-05-08", reported_by: "Test",
        shift: "closing", notes: "", status: "submitted",
        created_at: "2026-05-08T22:00:00Z",
        lines: [],
      }],
    });

    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Delete All")).toBeInTheDocument()
    );
  });

  it("does NOT show 'Delete All' button for non-admin staff", async () => {
    mockAuth = staffAuth();
    routedFetch({
      reports: [{
        id: 4, city: "dubai", branch_code: "BB",
        report_date: "2026-05-07", reported_by: "Test",
        shift: "closing", notes: "", status: "submitted",
        created_at: "2026-05-07T22:00:00Z", lines: [],
      }],
    });

    await renderPage();
    await waitFor(() => screen.getByText("2026-05-07"));
    expect(screen.queryByText("Delete All")).not.toBeInTheDocument();
  });
});

describe("/admin/disposal — normaliseCategory (unit)", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
  });

  it("translates Japanese category 野菜 to 'Vegetables'", async () => {
    routedFetch({
      reports: [{
        id: 5, city: "dubai", branch_code: "JLT",
        report_date: "2026-05-01", reported_by: "Test",
        shift: "closing", notes: "", status: "submitted",
        created_at: "2026-05-01T22:00:00Z",
        lines: [{
          id: 20, item_type: "ingredient", item_name_snapshot: "Lettuce",
          item_category: "野菜", quantity: 2, unit: "kg", disposal_reason: "spoilage", notes: "",
        }],
      }],
    });

    await renderPage();
    await waitFor(() => screen.getByText("2026-05-01"));
    fireEvent.click(screen.getByText("2026-05-01"));
    await waitFor(() =>
      expect(screen.getAllByText("Vegetables").length).toBeGreaterThan(0)
    );
  });

  it("leaves non-mapped categories unchanged", async () => {
    routedFetch({
      reports: [{
        id: 6, city: "dubai", branch_code: "JLT",
        report_date: "2026-04-30", reported_by: "Test",
        shift: "closing", notes: "", status: "submitted",
        created_at: "2026-04-30T22:00:00Z",
        lines: [{
          id: 21, item_type: "ingredient", item_name_snapshot: "Salmon",
          item_category: "CustomCat", quantity: 1, unit: "kg", disposal_reason: "spoilage", notes: "",
        }],
      }],
    });

    await renderPage();
    await waitFor(() => screen.getByText("2026-04-30"));
    fireEvent.click(screen.getByText("2026-04-30"));
    await waitFor(() =>
      expect(screen.getAllByText("CustomCat").length).toBeGreaterThan(0)
    );
  });
});

describe("/admin/disposal — reason badges", () => {
  beforeEach(() => {
    mockAuth = adminAuth();
  });

  async function renderWithLineReason(reason: string) {
    routedFetch({
      reports: [{
        id: 99, city: "dubai", branch_code: "BB",
        report_date: "2026-05-01", reported_by: "Test",
        shift: "closing", notes: "", status: "submitted",
        created_at: "2026-05-01T22:00:00Z",
        lines: [{
          id: 30, item_type: "menu_item", item_name_snapshot: "Item",
          item_category: "", quantity: 1, unit: "pcs",
          disposal_reason: reason, notes: "",
        }],
      }],
    });
    await renderPage();
    await waitFor(() => screen.getByText("2026-05-01"));
    fireEvent.click(screen.getByText("2026-05-01"));
  }

  it("spoilage renders 'Spoilage' badge", async () => {
    await renderWithLineReason("spoilage");
    // Both mobile-card and desktop-table render, text may appear twice
    await waitFor(() =>
      expect(screen.getAllByText("Spoilage").length).toBeGreaterThan(0)
    );
  });

  it("staff_meal renders 'Staff Meal' badge", async () => {
    await renderWithLineReason("staff_meal");
    await waitFor(() =>
      expect(screen.getAllByText("Staff Meal").length).toBeGreaterThan(0)
    );
  });

  it("eod_leftover renders 'End-of-Day Leftover' badge", async () => {
    await renderWithLineReason("eod_leftover");
    await waitFor(() =>
      expect(screen.getAllByText("End-of-Day Leftover").length).toBeGreaterThan(0)
    );
  });

  it("unknown reason renders as-is", async () => {
    await renderWithLineReason("mystery_reason");
    await waitFor(() =>
      expect(screen.getAllByText("mystery_reason").length).toBeGreaterThan(0)
    );
  });
});
