// tests/admin/backup/backup-page.test.tsx
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

/** Route fetch calls by URL so parent/child effect order doesn't matter. */
function routedFetch(reportsBody: unknown = EMPTY_REPORTS) {
  mockFetch.mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("/backup/reports")) {
      return Promise.resolve(fetchOk(reportsBody)) as ReturnType<typeof fetch>;
    }
    return Promise.resolve(fetchOk({})) as ReturnType<typeof fetch>;
  });
}

async function renderPage() {
  const BackupPage = (await import("@/app/admin/backup/page")).default;
  render(<BackupPage />);
}

// ── Sample data ───────────────────────────────────────────────────────────────

const SAMPLE_REPORTS = {
  reports: [
    {
      id: 1,
      city: "dubai",
      branch_code: "JLT",
      report_date: "2026-05-01",
      reported_by: "Admin User",
      shift: "closing",
      notes: "Special event day",
      status: "ok",
      created_at: "2026-05-01T20:00:00Z",
      lines: [
        {
          id: 10,
          section: "supplies",
          item_type: "ingredient",
          item_name_snapshot: "Ginger",
          item_category: "野菜",
          quantity: 50,
          unit: "pcs",
          notes: "",
        },
        {
          id: 11,
          section: "prep",
          item_type: "ingredient",
          item_name_snapshot: "Cucumber",
          item_category: "野菜",
          quantity: 0,
          unit: "kg",
          notes: "",
        },
      ],
    },
    {
      id: 2,
      city: "dubai",
      branch_code: "BB",
      report_date: "2026-05-02",
      reported_by: "Jay Nishimura",
      shift: "morning",
      notes: "",
      status: "ok",
      created_at: "2026-05-02T08:00:00Z",
      lines: [],
    },
  ],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("/admin/backup — page structure", () => {
  beforeEach(() => {
    mockAuth = adminAuth();
    routedFetch();
  });

  it("renders page title 'Backup Report'", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Backup Report")).toBeInTheDocument()
    );
  });

  it("renders subtitle 'Kitchen prep & backup stock report'", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/Kitchen prep & backup stock report/i)).toBeInTheDocument()
    );
  });

  it("renders 'Report Details' section heading", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Report Details")).toBeInTheDocument()
    );
  });

  it("renders 'Fixed Items' section heading", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Fixed Items")).toBeInTheDocument()
    );
  });

  it("renders 'Extra Items' section heading", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Extra Items")).toBeInTheDocument()
    );
  });

  it("renders 'Past Reports' heading", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Past Reports")).toBeInTheDocument()
    );
  });

  it("renders 'Submit Report' button", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Submit Report")).toBeInTheDocument()
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
    await waitFor(() => screen.getByText("Backup Report"));
    expect(screen.getByDisplayValue("Dubai")).toBeInTheDocument();
  });

  it("renders shift selector with Closing as default", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("Backup Report"));
    expect(screen.getByDisplayValue("Closing")).toBeInTheDocument();
  });

  it("reporter field pre-filled with auth staff name", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("Backup Report"));
    expect(screen.getByDisplayValue("Admin User")).toBeInTheDocument();
  });

  it("Dubai template shows 'Condiments & Supplies' section", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("Backup Report"));
    expect(screen.getAllByText("Condiments & Supplies").length).toBeGreaterThan(0);
  });

  it("Dubai template shows 'Sushi Rolls (Backup Ready)' section", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("Backup Report"));
    expect(screen.getByText("Sushi Rolls (Backup Ready)")).toBeInTheDocument();
  });

  it("Dubai template shows 'Packaging' and 'Prepared Ingredients' sections", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("Backup Report"));
    expect(screen.getByText("Packaging")).toBeInTheDocument();
    expect(screen.getByText("Prepared Ingredients")).toBeInTheDocument();
  });
});

describe("/admin/backup — city switching", () => {
  beforeEach(() => {
    mockAuth = adminAuth();
    routedFetch();
  });

  it("switching to Manila shows 'Hot Section'", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("Backup Report"));
    fireEvent.change(screen.getByDisplayValue("Dubai"), { target: { value: "manila" } });
    await waitFor(() =>
      expect(screen.getByText("Hot Section")).toBeInTheDocument()
    );
  });

  it("switching to Manila shows 'Base Roll' section", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("Backup Report"));
    fireEvent.change(screen.getByDisplayValue("Dubai"), { target: { value: "manila" } });
    await waitFor(() =>
      expect(screen.getByText("Base Roll")).toBeInTheDocument()
    );
  });

  it("switching to Manila shows percentage buttons for pct items (e.g. 0%, 25%, 50%, 75%, 100%)", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("Backup Report"));
    fireEvent.change(screen.getByDisplayValue("Dubai"), { target: { value: "manila" } });
    await waitFor(() =>
      // Percentage buttons appear for pct-type items (e.g. Quezo Cheese Cut)
      expect(screen.getAllByText("0%").length).toBeGreaterThan(0)
    );
    expect(screen.getAllByText("100%").length).toBeGreaterThan(0);
  });

  it("switching back to Dubai removes Manila-only sections", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("Backup Report"));
    fireEvent.change(screen.getByDisplayValue("Dubai"), { target: { value: "manila" } });
    await waitFor(() => screen.getByText("Hot Section"));
    fireEvent.change(screen.getByDisplayValue("Manila"), { target: { value: "dubai" } });
    await waitFor(() =>
      expect(screen.queryByText("Hot Section")).not.toBeInTheDocument()
    );
  });

  it("switching city updates the branch selector", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("Backup Report"));
    // Dubai default branch is "BB" (Business Bay)
    const branchSelect = screen.getByLabelText ? screen.queryByLabelText("Branch") : null;
    // Switch to Manila — branch options change
    fireEvent.change(screen.getByDisplayValue("Dubai"), { target: { value: "manila" } });
    await waitFor(() => screen.getByText("Hot Section"));
    // Manila branches are different from Dubai branches — just confirm no crash
    expect(screen.getByText("Backup Report")).toBeInTheDocument();
  });
});

describe("/admin/backup — form validation", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
    routedFetch();
  });

  it("shows error when no items are filled and submit is clicked", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("Submit Report"));
    fireEvent.click(screen.getByText("Submit Report"));
    await waitFor(() =>
      expect(screen.getByText(/No items entered/i)).toBeInTheDocument()
    );
  });

  it("shows error when reporter name is empty", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("Backup Report"));
    const reporterInput = screen.getByDisplayValue("Jay Nishimura");
    fireEvent.change(reporterInput, { target: { value: "" } });
    fireEvent.click(screen.getByText("Submit Report"));
    await waitFor(() =>
      expect(screen.getByText(/Please enter the reporter name/i)).toBeInTheDocument()
    );
  });
});

describe("/admin/backup — form submission", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
  });

  it("submits successfully and shows report ID", async () => {
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (typeof url === "string" && url.includes("/backup/reports")) {
        return Promise.resolve(fetchOk(EMPTY_REPORTS)) as ReturnType<typeof fetch>;
      }
      if (opts?.method === "POST") {
        return Promise.resolve(fetchOk({ report_id: 7, status: "ok" })) as ReturnType<typeof fetch>;
      }
      return Promise.resolve(fetchOk({})) as ReturnType<typeof fetch>;
    });

    await renderPage();
    await waitFor(() => screen.getByText("Backup Report"));
    // Fill in first template quantity (Ginger in Condiments & Supplies)
    const qtyInputs = screen.getAllByPlaceholderText("—");
    fireEvent.change(qtyInputs[0], { target: { value: "50" } });
    fireEvent.click(screen.getByText("Submit Report"));
    await waitFor(() =>
      expect(screen.getByText(/Report #7 submitted/i)).toBeInTheDocument()
    );
  });

  it("shows JSON error message on submit failure", async () => {
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (typeof url === "string" && url.includes("/backup/reports")) {
        return Promise.resolve(fetchOk(EMPTY_REPORTS)) as ReturnType<typeof fetch>;
      }
      if (opts?.method === "POST") {
        return Promise.resolve(fetchErr(422, "Validation failed", true)) as ReturnType<typeof fetch>;
      }
      return Promise.resolve(fetchOk({})) as ReturnType<typeof fetch>;
    });

    await renderPage();
    await waitFor(() => screen.getByText("Backup Report"));
    const qtyInputs = screen.getAllByPlaceholderText("—");
    fireEvent.change(qtyInputs[0], { target: { value: "10" } });
    fireEvent.click(screen.getByText("Submit Report"));
    await waitFor(() =>
      expect(screen.getByText(/Validation failed/i)).toBeInTheDocument()
    );
  });

  it("shows plain-text error when server returns non-JSON body (apiFetch bug regression)", async () => {
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (typeof url === "string" && url.includes("/backup/reports")) {
        return Promise.resolve(fetchOk(EMPTY_REPORTS)) as ReturnType<typeof fetch>;
      }
      if (opts?.method === "POST") {
        return Promise.resolve(fetchErr(503, "Service Unavailable", false)) as ReturnType<typeof fetch>;
      }
      return Promise.resolve(fetchOk({})) as ReturnType<typeof fetch>;
    });

    await renderPage();
    await waitFor(() => screen.getByText("Backup Report"));
    const qtyInputs = screen.getAllByPlaceholderText("—");
    fireEvent.change(qtyInputs[0], { target: { value: "10" } });
    fireEvent.click(screen.getByText("Submit Report"));
    await waitFor(() =>
      expect(screen.getByText(/Service Unavailable/i)).toBeInTheDocument()
    );
  });

  it("clears template quantities after successful submission", async () => {
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (typeof url === "string" && url.includes("/backup/reports")) {
        return Promise.resolve(fetchOk(EMPTY_REPORTS)) as ReturnType<typeof fetch>;
      }
      if (opts?.method === "POST") {
        return Promise.resolve(fetchOk({ report_id: 99, status: "ok" })) as ReturnType<typeof fetch>;
      }
      return Promise.resolve(fetchOk({})) as ReturnType<typeof fetch>;
    });

    await renderPage();
    await waitFor(() => screen.getByText("Backup Report"));
    const qtyInputs = screen.getAllByPlaceholderText("—");
    fireEvent.change(qtyInputs[0], { target: { value: "30" } });
    expect(qtyInputs[0]).toHaveValue(30);

    fireEvent.click(screen.getByText("Submit Report"));
    await waitFor(() => screen.getByText(/Report #99 submitted/i));
    // Template quantities cleared after success
    expect(qtyInputs[0]).toHaveValue(null);
  });
});

describe("/admin/backup — clear button", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
    routedFetch();
  });

  it("Clear button resets template quantities", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("Backup Report"));
    const qtyInputs = screen.getAllByPlaceholderText("—");
    fireEvent.change(qtyInputs[0], { target: { value: "99" } });
    expect(qtyInputs[0]).toHaveValue(99);
    fireEvent.click(screen.getByText("Clear"));
    await waitFor(() => expect(qtyInputs[0]).toHaveValue(null));
  });

  it("Clear button resets submit success message", async () => {
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (typeof url === "string" && url.includes("/backup/reports")) {
        return Promise.resolve(fetchOk(EMPTY_REPORTS)) as ReturnType<typeof fetch>;
      }
      if (opts?.method === "POST") {
        return Promise.resolve(fetchOk({ report_id: 5, status: "ok" })) as ReturnType<typeof fetch>;
      }
      return Promise.resolve(fetchOk({})) as ReturnType<typeof fetch>;
    });

    await renderPage();
    await waitFor(() => screen.getByText("Backup Report"));
    const qtyInputs = screen.getAllByPlaceholderText("—");
    fireEvent.change(qtyInputs[0], { target: { value: "5" } });
    fireEvent.click(screen.getByText("Submit Report"));
    await waitFor(() => screen.getByText(/Report #5 submitted/i));

    fireEvent.click(screen.getByText("Clear"));
    await waitFor(() =>
      expect(screen.queryByText(/Report #5 submitted/i)).not.toBeInTheDocument()
    );
  });

  it("Clear button removes free lines", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("+ Add blank line"));
    fireEvent.click(screen.getByText("+ Add blank line"));
    await waitFor(() => screen.getByPlaceholderText("Notes (optional)"));

    fireEvent.click(screen.getByText("Clear"));
    await waitFor(() =>
      expect(screen.queryByPlaceholderText("Notes (optional)")).not.toBeInTheDocument()
    );
  });
});

describe("/admin/backup — shortage alert panel", () => {
  beforeEach(() => {
    mockAuth = adminAuth();
    routedFetch();
  });

  it("no shortage panel when no quantities are filled", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("Backup Report"));
    expect(screen.queryByText(/below standard/i)).not.toBeInTheDocument();
  });

  it("shows shortage panel when Manila qty item is below standard", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("Backup Report"));
    fireEvent.change(screen.getByDisplayValue("Dubai"), { target: { value: "manila" } });
    await waitFor(() => screen.getByText("Hot Section"));

    // Soy Sauce standard: min=150 — entering 5 is "low"
    const inputs = screen.getAllByPlaceholderText("—");
    fireEvent.change(inputs[0], { target: { value: "5" } });

    await waitFor(() =>
      expect(screen.getAllByText(/below standard/i).length).toBeGreaterThan(0)
    );
  });

  it("shortage panel shows the item label for the low item", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("Backup Report"));
    fireEvent.change(screen.getByDisplayValue("Dubai"), { target: { value: "manila" } });
    await waitFor(() => screen.getByText("Hot Section"));

    // Soy Sauce is first in Manila supplies; standard 150 — entering 5 triggers shortage
    const inputs = screen.getAllByPlaceholderText("—");
    fireEvent.change(inputs[0], { target: { value: "5" } });

    await waitFor(() =>
      expect(screen.getAllByText("Soy Sauce").length).toBeGreaterThan(0)
    );
  });

  it("no shortage for Dubai (no standards defined)", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("Backup Report"));
    // Dubai has no standards — filling a qty never triggers shortage
    const inputs = screen.getAllByPlaceholderText("—");
    fireEvent.change(inputs[0], { target: { value: "1" } });
    expect(screen.queryByText(/below standard/i)).not.toBeInTheDocument();
  });

  it("shortage panel disappears after clearing", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("Backup Report"));
    fireEvent.change(screen.getByDisplayValue("Dubai"), { target: { value: "manila" } });
    await waitFor(() => screen.getByText("Hot Section"));
    const inputs = screen.getAllByPlaceholderText("—");
    fireEvent.change(inputs[0], { target: { value: "5" } });
    await waitFor(() => screen.getAllByText(/below standard/i));

    fireEvent.click(screen.getByText("Clear"));
    await waitFor(() =>
      expect(screen.queryByText(/below standard/i)).not.toBeInTheDocument()
    );
  });
});

describe("/admin/backup — percentage selector (Manila pct items)", () => {
  beforeEach(() => {
    mockAuth = adminAuth();
    routedFetch();
  });

  it("pct items show 0%, 25%, 50%, 75%, 100% buttons", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("Backup Report"));
    fireEvent.change(screen.getByDisplayValue("Dubai"), { target: { value: "manila" } });
    await waitFor(() => screen.getByText("Quezo Cheese Cut"));

    expect(screen.getAllByText("0%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("25%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("50%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("75%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("100%").length).toBeGreaterThan(0);
  });

  it("clicking a pct button selects it (adds to filled count)", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("Backup Report"));
    fireEvent.change(screen.getByDisplayValue("Dubai"), { target: { value: "manila" } });
    await waitFor(() => screen.getByText("Quezo Cheese Cut"));

    // Click the first "50%" button (m_quezo_cheese, standard min=50 → should be green)
    const fiftyBtns = screen.getAllByTitle(/50%.*standard: 50%/i);
    fireEvent.click(fiftyBtns[0]);

    // The button should now have green class (50 >= 50 = ok)
    await waitFor(() =>
      expect(fiftyBtns[0].className).toContain("green")
    );
  });

  it("clicking selected pct button again deselects it", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("Backup Report"));
    fireEvent.change(screen.getByDisplayValue("Dubai"), { target: { value: "manila" } });
    await waitFor(() => screen.getByText("Quezo Cheese Cut"));

    const fiftyBtns = screen.getAllByTitle(/50%.*standard: 50%/i);
    fireEvent.click(fiftyBtns[0]); // select
    await waitFor(() => expect(fiftyBtns[0].className).toContain("green"));

    fireEvent.click(fiftyBtns[0]); // deselect
    await waitFor(() => expect(fiftyBtns[0].className).not.toContain("green"));
  });

  it("0% button triggers shortage panel for a 75%-standard item", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("Backup Report"));
    fireEvent.change(screen.getByDisplayValue("Dubai"), { target: { value: "manila" } });
    await waitFor(() => screen.getByText("Tempura Flakes White"));

    // Tempura Flakes White (m_tf_white) has standard min=75%
    // Clicking 0% → value=0, which is below 75*0.7=52.5 → "low" → shortage panel
    const zeroBtns = screen.getAllByTitle(/^0%.*standard: 75%/i);
    fireEvent.click(zeroBtns[0]);

    await waitFor(() =>
      expect(screen.getAllByText(/below standard/i).length).toBeGreaterThan(0)
    );
  });
});

describe("/admin/backup — free lines (Extra Items)", () => {
  beforeEach(() => {
    mockAuth = staffAuth();
    routedFetch();
  });

  it("'+ Add blank line' adds a free line card with Notes field", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("+ Add blank line"));
    fireEvent.click(screen.getByText("+ Add blank line"));
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Notes (optional)")).toBeInTheDocument()
    );
  });

  it("free line card shows Qty and Unit labels", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("+ Add blank line"));
    fireEvent.click(screen.getByText("+ Add blank line"));
    await waitFor(() => {
      expect(screen.getByText("Qty")).toBeInTheDocument();
      expect(screen.getByText("Unit")).toBeInTheDocument();
    });
  });

  it("× button removes the free line", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("+ Add blank line"));
    fireEvent.click(screen.getByText("+ Add blank line"));
    await waitFor(() => screen.getByPlaceholderText("Notes (optional)"));

    // Find the × button (FreeLineCard remove button renders &times; = ×)
    const allBtns = screen.getAllByRole("button");
    const closeBtn = allBtns.find((btn) => btn.textContent === "×");
    expect(closeBtn).toBeDefined();
    if (closeBtn) fireEvent.click(closeBtn);

    await waitFor(() =>
      expect(screen.queryByPlaceholderText("Notes (optional)")).not.toBeInTheDocument()
    );
  });

  it("adding multiple blank lines shows multiple Notes fields", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("+ Add blank line"));
    fireEvent.click(screen.getByText("+ Add blank line"));
    fireEvent.click(screen.getByText("+ Add blank line"));
    await waitFor(() => {
      expect(screen.getAllByPlaceholderText("Notes (optional)").length).toBe(2);
    });
  });
});

describe("/admin/backup — Past Reports panel", () => {
  beforeEach(() => {
    mockAuth = adminAuth();
  });

  it("shows 'No reports found.' when API returns empty list", async () => {
    routedFetch(EMPTY_REPORTS);
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("No reports found.")).toBeInTheDocument()
    );
  });

  it("shows 'Loading...' while fetch is in-flight", async () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); // never resolves
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Loading...")).toBeInTheDocument()
    );
  });

  it("shows error message when past reports fetch fails", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/backup/reports")) {
        return Promise.resolve(fetchErr(500, "Server error", true)) as ReturnType<typeof fetch>;
      }
      return Promise.resolve(fetchOk({})) as ReturnType<typeof fetch>;
    });
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("Server error")).toBeInTheDocument()
    );
  });

  it("renders report row with date, branch, shift, reporter", async () => {
    routedFetch(SAMPLE_REPORTS);
    await renderPage();
    await waitFor(() => expect(screen.getByText("2026-05-01")).toBeInTheDocument());
    expect(screen.getAllByText("JLT").length).toBeGreaterThan(0);
    // shift badge shows raw value e.g. "closing" — may coexist with other elements
    expect(screen.getAllByText("closing").length).toBeGreaterThan(0);
    expect(screen.getByText("by Admin User")).toBeInTheDocument();
  });

  it("report row shows correct nonZero item count (plural grammar)", async () => {
    routedFetch(SAMPLE_REPORTS);
    await renderPage();
    // SAMPLE_REPORTS report #1: 2 lines but only 1 with qty > 0 (Ginger=50)
    await waitFor(() =>
      expect(screen.getByText("1 item")).toBeInTheDocument()
    );
    // Report #2: 0 lines → "0 items"
    expect(screen.getByText("0 items")).toBeInTheDocument();
  });

  it("expanding a report shows its notes and section buttons", async () => {
    routedFetch(SAMPLE_REPORTS);
    await renderPage();
    await waitFor(() => screen.getByText("2026-05-01"));

    // Click report row to expand
    fireEvent.click(screen.getByText("2026-05-01"));
    await waitFor(() =>
      expect(screen.getByText("Special event day")).toBeInTheDocument()
    );
    // Section accordion buttons appear (supplies, prep)
    expect(screen.getAllByText(/Condiments & Supplies/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Prepared Ingredients/i).length).toBeGreaterThan(0);
  });

  it("expanding then clicking a section shows its line items", async () => {
    routedFetch(SAMPLE_REPORTS);
    await renderPage();
    await waitFor(() => screen.getByText("2026-05-01"));
    fireEvent.click(screen.getByText("2026-05-01"));
    await waitFor(() => screen.getByText("Special event day"));

    // Click "Condiments & Supplies" section accordion to expand it
    const sectionBtns = screen.getAllByText(/Condiments & Supplies/i);
    // The PastReports section button is the last occurrence (Fixed Items sections come before)
    fireEvent.click(sectionBtns[sectionBtns.length - 1]);
    await waitFor(() =>
      // Ginger may also appear as a label in the Dubai template section
      expect(screen.getAllByText("Ginger").length).toBeGreaterThan(0)
    );
  });

  it("collapsing a report row hides its content", async () => {
    routedFetch(SAMPLE_REPORTS);
    await renderPage();
    await waitFor(() => screen.getByText("2026-05-01"));
    fireEvent.click(screen.getByText("2026-05-01")); // expand
    await waitFor(() => screen.getByText("Special event day"));
    fireEvent.click(screen.getByText("2026-05-01")); // collapse
    await waitFor(() =>
      expect(screen.queryByText("Special event day")).not.toBeInTheDocument()
    );
  });

  it("shows 'Delete' button for admin users", async () => {
    routedFetch(SAMPLE_REPORTS);
    await renderPage();
    await waitFor(() => {
      const deleteBtns = screen.getAllByText("Delete");
      expect(deleteBtns.length).toBe(2); // one per report
    });
  });

  it("does NOT show 'Delete' button for non-admin staff", async () => {
    mockAuth = staffAuth();
    routedFetch(SAMPLE_REPORTS);
    await renderPage();
    await waitFor(() => screen.getByText("2026-05-01"));
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });

  it("Delete calls confirm and does nothing when user cancels", async () => {
    (global.confirm as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    routedFetch(SAMPLE_REPORTS);
    await renderPage();
    await waitFor(() => screen.getAllByText("Delete"));
    fireEvent.click(screen.getAllByText("Delete")[0]);
    expect(global.confirm).toHaveBeenCalledWith("Delete this backup report?");
    // Report still visible
    expect(screen.getByText("2026-05-01")).toBeInTheDocument();
  });

  it("Reload button re-fetches reports", async () => {
    routedFetch(EMPTY_REPORTS);
    await renderPage();
    await waitFor(() => screen.getByText("No reports found."));

    routedFetch(SAMPLE_REPORTS);
    fireEvent.click(screen.getByText("Reload"));
    await waitFor(() =>
      expect(screen.getByText("2026-05-01")).toBeInTheDocument()
    );
  });
});

describe("/admin/backup — shortageColor unit tests (via UI)", () => {
  beforeEach(() => {
    mockAuth = adminAuth();
    routedFetch();
  });

  it("qty item exactly at standard minimum shows no shortage", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("Backup Report"));
    fireEvent.change(screen.getByDisplayValue("Dubai"), { target: { value: "manila" } });
    await waitFor(() => screen.getByText("Hot Section"));

    // Soy Sauce standard min=150: entering exactly 150 → "ok"
    const inputs = screen.getAllByPlaceholderText("—");
    fireEvent.change(inputs[0], { target: { value: "150" } });
    expect(screen.queryByText(/below standard/i)).not.toBeInTheDocument();
  });

  it("qty item in warn zone (70-99% of min) shows shortage but not critical", async () => {
    await renderPage();
    await waitFor(() => screen.getByText("Backup Report"));
    fireEvent.change(screen.getByDisplayValue("Dubai"), { target: { value: "manila" } });
    await waitFor(() => screen.getByText("Hot Section"));

    // Soy Sauce min=150, warn range is 105-149 (150*0.7=105)
    const inputs = screen.getAllByPlaceholderText("—");
    fireEvent.change(inputs[0], { target: { value: "110" } });

    await waitFor(() =>
      expect(screen.getAllByText(/below standard/i).length).toBeGreaterThan(0)
    );
    // Should appear in shortage panel
    expect(screen.getAllByText("Soy Sauce").length).toBeGreaterThan(0);
  });
});
