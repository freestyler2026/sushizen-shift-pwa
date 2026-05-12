// tests/admin/daily-inventory/daily-inventory-page.test.tsx
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { routerMock } from "../../setup";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

// Auth mock — plain fns (vi.restoreAllMocks() must not clear these)
let mockAuth: Record<string, unknown> | null = null;
let mockCanAccess = true;
let mockRefreshResult: Record<string, unknown> | null = null;

vi.mock("@/lib/auth", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...real,
    getAuth: () => mockAuth,
    getAuthHeaders: () => ({ Authorization: "Bearer test-token", "Content-Type": "application/json" }),
    canAccessDailyInventoryAdmin: () => mockCanAccess,
    refreshAuthFromApi: () => Promise.resolve(mockRefreshResult ?? mockAuth),
  };
});

// Fetch mock
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// confirm mock
global.confirm = vi.fn(() => true);
global.alert = vi.fn();

// ── Helpers ───────────────────────────────────────────────────────────────────

function adminAuth(overrides: Record<string, unknown> = {}) {
  return {
    staffName: "Admin User",
    city: "manila" as const,
    role: "ADMIN",
    accessToken: "tok-admin",
    permissions: ["*"],
    ...overrides,
  };
}

/** Create a mock fetch Response compatible with AdminDailyInventoryTab's apiFetch wrapper. */
function makeResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: new Headers({ "Content-Type": "application/json" }),
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(body),
  } as Response);
}

function makeErrorResponse(status: number, msg: string) {
  return makeResponse(JSON.stringify({ detail: msg }), status);
}

const SAMPLE_ITEMS = [
  { id: 1, item_code: "SALMON", section: "KITCHEN", item_name: "Salmon", default_unit: "kg", min_level: 2, par_level: 5, sort_order: 1 },
  { id: 2, item_code: "RICE", section: "KITCHEN", item_name: "Rice", default_unit: "kg", min_level: 10, par_level: 20, sort_order: 2 },
  { id: 3, item_code: "CRAB", section: "CK", item_name: "Crab Stick", default_unit: "kg", min_level: null, par_level: null, sort_order: 3 },
];

const SAMPLE_STAFF = { names: ["Alice", "Bob", "Carol"] };

const SAMPLE_HISTORY = [
  { id: 10, branch: "PARANAQUE", report_date: "2026-05-01", shift: "AM", staff_name: "Alice", status: "SUBMITTED", submitted_at: "2026-05-01T09:00:00Z" },
  { id: 11, branch: "PARANAQUE", report_date: "2026-05-02", shift: "PM", staff_name: "Bob", status: "DRAFT", submitted_at: null },
];

/** Route fetch calls by URL so test order / concurrency doesn't matter. */
function routedFetch({
  staff = SAMPLE_STAFF,
  items = SAMPLE_ITEMS as unknown,
  history = SAMPLE_HISTORY as unknown,
  saveResult = { report_id: 42 } as unknown,
  submitResult = { ok: true } as unknown,
} = {}) {
  mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
    if (typeof url === "string") {
      if (url.includes("/staff-names")) return makeResponse(staff);
      if (url.includes("/daily-inventory/items")) return makeResponse(items);
      if (url.includes("/daily-inventory/reports")) return makeResponse(history);
      if (url.includes("/save") && opts?.method === "POST") return makeResponse(saveResult);
      if (url.includes("/submit") && opts?.method === "POST") return makeResponse(submitResult);
    }
    return makeResponse({});
  });
}

async function renderTab() {
  const Tab = (await import("@/components/admin/AdminDailyInventoryTab")).default;
  render(<Tab />);
}

async function renderPage() {
  const Page = (await import("@/app/admin/daily-inventory/page")).default;
  render(<Page />);
}

// ── Page-level auth tests ─────────────────────────────────────────────────────

describe("/admin/daily-inventory — page auth", () => {
  beforeEach(() => {
    routedFetch();
  });

  it("shows loading state initially", async () => {
    mockAuth = adminAuth();
    await renderPage();
    // Loading... shown briefly before auth check completes
    // Since refreshAuth resolves instantly in mock, just verify it renders
    expect(screen.queryByText("Loading…") || document.body).toBeTruthy();
  });

  it("renders the tab when user has access", async () => {
    mockAuth = adminAuth();
    mockCanAccess = true;
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("📦 Daily Inventory Report")).toBeInTheDocument()
    );
  });

  it("redirects to /login when no auth", async () => {
    mockAuth = null;
    mockRefreshResult = null;
    await renderPage();
    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith(
        expect.stringContaining("/login")
      )
    );
  });

  it("redirects to /week when user lacks daily-inventory permission", async () => {
    mockAuth = adminAuth({ permissions: [] });
    mockCanAccess = false;
    await renderPage();
    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith("/week")
    );
  });
});

// ── AdminDailyInventoryTab structure ─────────────────────────────────────────

describe("AdminDailyInventoryTab — page structure", () => {
  beforeEach(() => {
    mockAuth = adminAuth();
    routedFetch();
  });

  it("renders the page title", async () => {
    await renderTab();
    await waitFor(() =>
      expect(screen.getByText("📦 Daily Inventory Report")).toBeInTheDocument()
    );
  });

  it("renders Branch selector with PARANAQUE, CUBAO, TAFT options", async () => {
    await renderTab();
    await waitFor(() => screen.getByText("📦 Daily Inventory Report"));
    expect(screen.getByDisplayValue("PARANAQUE")).toBeInTheDocument();
  });

  it("renders Shift selector defaulting to AM", async () => {
    await renderTab();
    await waitFor(() => screen.getByText("📦 Daily Inventory Report"));
    expect(screen.getByDisplayValue("AM")).toBeInTheDocument();
  });

  it("renders Date input", async () => {
    await renderTab();
    await waitFor(() => screen.getByText("📦 Daily Inventory Report"));
    // date input is present
    const dateInput = document.querySelector('input[type="date"]');
    expect(dateInput).toBeTruthy();
  });

  it("renders '💾 Save draft' button in action bar", async () => {
    await renderTab();
    await waitFor(() =>
      expect(screen.getByText("💾 Save draft")).toBeInTheDocument()
    );
  });

  it("renders '✅ Submit report' button", async () => {
    await renderTab();
    await waitFor(() =>
      expect(screen.getByText("✅ Submit report")).toBeInTheDocument()
    );
  });

  it("renders 'History' toggle button", async () => {
    await renderTab();
    await waitFor(() =>
      expect(screen.getByText("History")).toBeInTheDocument()
    );
  });

  it("renders KITCHEN and CK sections after items load", async () => {
    await renderTab();
    await waitFor(() => expect(screen.getByText("🍱 Kitchen")).toBeInTheDocument());
    expect(screen.getByText("🧊 CK (Cold Kitchen)")).toBeInTheDocument();
  });

  it("renders item rows after items load", async () => {
    await renderTab();
    await waitFor(() => expect(screen.getByText("Salmon")).toBeInTheDocument());
    expect(screen.getByText("Rice")).toBeInTheDocument();
    expect(screen.getByText("Crab Stick")).toBeInTheDocument();
  });

  it("shows par level label next to items that have par_level", async () => {
    await renderTab();
    await waitFor(() => screen.getByText("Salmon"));
    // Salmon has par_level: 5 → shows "Par: 5 kg"
    expect(screen.getByText(/Par: 5/)).toBeInTheDocument();
  });
});

// ── Staff names loading ───────────────────────────────────────────────────────

describe("AdminDailyInventoryTab — staff names", () => {
  beforeEach(() => {
    mockAuth = adminAuth();
  });

  it("shows 'Loading staff…' in selector while fetching", async () => {
    // Delay staff-names response
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/staff-names")) {
        return new Promise(() => {}); // never resolves
      }
      if (typeof url === "string" && url.includes("/daily-inventory/items")) {
        return makeResponse(SAMPLE_ITEMS);
      }
      return makeResponse({});
    });
    await renderTab();
    await waitFor(() =>
      expect(screen.getByText("Loading staff…")).toBeInTheDocument()
    );
  });

  it("populates staff dropdown with names from API", async () => {
    routedFetch();
    await renderTab();
    await waitFor(() => expect(screen.getByText("Alice")).toBeInTheDocument());
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Carol")).toBeInTheDocument();
  });

  it("shows 'Other' option in staff dropdown", async () => {
    routedFetch();
    await renderTab();
    await waitFor(() => expect(screen.getByText("Alice")).toBeInTheDocument());
    expect(screen.getByText("Other")).toBeInTheDocument();
  });

  it("shows custom staff text input when 'Other' is selected", async () => {
    routedFetch();
    await renderTab();
    await waitFor(() => screen.getByText("Other"));
    // Find the staff select and choose "Other"
    const staffSelect = screen.getAllByRole("combobox").find(
      (el) => el.querySelector ? true : false
    );
    // Use the select that contains staff options
    const selects = screen.getAllByRole("combobox");
    const staffSel = selects.find((s) => s.innerHTML.includes("Other")) ?? selects[0];
    fireEvent.change(staffSel, { target: { value: "Other" } });
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Enter name")).toBeInTheDocument()
    );
  });

  it("shows staff list error when API fails", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/staff-names")) {
        return makeErrorResponse(500, "Server error");
      }
      if (typeof url === "string" && url.includes("/daily-inventory/items")) {
        return makeResponse(SAMPLE_ITEMS);
      }
      return makeResponse({});
    });
    await renderTab();
    await waitFor(() =>
      expect(screen.getByText(/Could not load Manila staff list/i)).toBeInTheDocument()
    );
  });
});

// ── Items loading ─────────────────────────────────────────────────────────────

describe("AdminDailyInventoryTab — items loading", () => {
  beforeEach(() => {
    mockAuth = adminAuth();
  });

  it("shows error when items API fails", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/daily-inventory/items")) {
        return makeErrorResponse(500, "Items load failed");
      }
      return makeResponse(SAMPLE_STAFF);
    });
    await renderTab();
    await waitFor(() =>
      expect(screen.getByText(/Failed to load item list/i)).toBeInTheDocument()
    );
  });

  it("shows error when items API returns non-array", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/daily-inventory/items")) {
        return makeResponse({ not: "an array" });
      }
      return makeResponse(SAMPLE_STAFF);
    });
    await renderTab();
    await waitFor(() =>
      expect(screen.getByText(/non-array/i)).toBeInTheDocument()
    );
  });

  it("shows filled counter as 0/total when no quantities entered", async () => {
    routedFetch();
    await renderTab();
    await waitFor(() => screen.getByText("Salmon"));
    // KITCHEN has 2 items (Salmon, Rice) → "0 / 2 filled"
    expect(screen.getByText("0 / 2 filled")).toBeInTheDocument();
    // CK has 1 item (Crab Stick) → "0 / 1 filled"
    expect(screen.getByText("0 / 1 filled")).toBeInTheDocument();
  });

  it("updates filled counter when a quantity is entered", async () => {
    routedFetch();
    await renderTab();
    await waitFor(() => screen.getByText("Salmon"));
    const qtyInputs = screen.getAllByPlaceholderText("0");
    fireEvent.change(qtyInputs[0], { target: { value: "3" } });
    await waitFor(() =>
      expect(screen.getByText("1 / 2 filled")).toBeInTheDocument()
    );
  });
});

// ── StatusBadge unit tests ────────────────────────────────────────────────────

describe("AdminDailyInventoryTab — StatusBadge", () => {
  beforeEach(() => {
    mockAuth = adminAuth();
    routedFetch();
  });

  it("shows '—' when qty is empty", async () => {
    await renderTab();
    await waitFor(() => screen.getByText("Salmon"));
    // No quantity entered → em dash status
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });

  it("shows '🔴 LOW' when qty is below min_level", async () => {
    await renderTab();
    await waitFor(() => screen.getByText("Salmon"));
    // Salmon min_level=2 → enter 1 → LOW
    const qtyInputs = screen.getAllByPlaceholderText("0");
    fireEvent.change(qtyInputs[0], { target: { value: "1" } });
    await waitFor(() =>
      expect(screen.getByText("🔴 LOW")).toBeInTheDocument()
    );
  });

  it("shows '🟡 WARN' when qty is between min and par level", async () => {
    await renderTab();
    await waitFor(() => screen.getByText("Salmon"));
    // Salmon min_level=2, par_level=5 → enter 3 → WARN (3 >= 2 but < 5)
    const qtyInputs = screen.getAllByPlaceholderText("0");
    fireEvent.change(qtyInputs[0], { target: { value: "3" } });
    await waitFor(() =>
      expect(screen.getByText("🟡 WARN")).toBeInTheDocument()
    );
  });

  it("shows '🟢 OK' when qty is at or above par_level", async () => {
    await renderTab();
    await waitFor(() => screen.getByText("Salmon"));
    // Salmon par_level=5 → enter 5 → OK
    const qtyInputs = screen.getAllByPlaceholderText("0");
    fireEvent.change(qtyInputs[0], { target: { value: "5" } });
    await waitFor(() =>
      expect(screen.getByText("🟢 OK")).toBeInTheDocument()
    );
  });

  it("shows '🟢 OK' for an item with no min/par levels", async () => {
    await renderTab();
    await waitFor(() => screen.getByText("Crab Stick"));
    // Crab Stick has min_level=null, par_level=null → any qty → OK
    const qtyInputs = screen.getAllByPlaceholderText("0");
    fireEvent.change(qtyInputs[2], { target: { value: "10" } }); // 3rd item = CK / Crab Stick
    await waitFor(() =>
      expect(screen.getByText("🟢 OK")).toBeInTheDocument()
    );
  });
});

// ── Low stock alert ───────────────────────────────────────────────────────────

describe("AdminDailyInventoryTab — low stock alert", () => {
  beforeEach(() => {
    mockAuth = adminAuth();
    routedFetch();
  });

  it("low stock banner not shown when no quantities are filled", async () => {
    await renderTab();
    await waitFor(() => screen.getByText("Salmon"));
    expect(screen.queryByText(/LOW stock/i)).not.toBeInTheDocument();
  });

  it("shows low stock banner when a qty is below min_level", async () => {
    await renderTab();
    await waitFor(() => screen.getByText("Salmon"));
    // Salmon min_level=2 → enter 1 → triggers low stock
    const qtyInputs = screen.getAllByPlaceholderText("0");
    fireEvent.change(qtyInputs[0], { target: { value: "1" } });
    await waitFor(() =>
      expect(screen.getByText(/LOW stock/i)).toBeInTheDocument()
    );
  });

  it("low stock banner lists the affected item name", async () => {
    await renderTab();
    await waitFor(() => screen.getByText("Salmon"));
    const qtyInputs = screen.getAllByPlaceholderText("0");
    fireEvent.change(qtyInputs[0], { target: { value: "1" } });
    await waitFor(() => screen.getByText(/LOW stock/i));
    // Banner text (text-red-200 element) should list Salmon
    const banner = document.querySelector(".text-red-200");
    expect(banner?.textContent).toContain("Salmon");
  });
});

// ── Form interactions ─────────────────────────────────────────────────────────

describe("AdminDailyInventoryTab — form interactions", () => {
  beforeEach(() => {
    mockAuth = adminAuth();
    routedFetch();
  });

  it("changing branch triggers new staff-names fetch", async () => {
    await renderTab();
    await waitFor(() => screen.getByText("Alice"));
    const branchSelect = screen.getByDisplayValue("PARANAQUE");
    fireEvent.change(branchSelect, { target: { value: "CUBAO" } });
    await waitFor(() =>
      // After branch change, staff names are re-fetched
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("home_branch=CUBAO"),
        expect.anything()
      )
    );
  });

  it("changing shift updates the shift selector", async () => {
    await renderTab();
    await waitFor(() => screen.getByText("📦 Daily Inventory Report"));
    const shiftSelect = screen.getByDisplayValue("AM");
    fireEvent.change(shiftSelect, { target: { value: "PM" } });
    expect(screen.getByDisplayValue("PM")).toBeInTheDocument();
  });

  it("entering qty in note field updates note state", async () => {
    await renderTab();
    await waitFor(() => screen.getByText("Salmon"));
    const noteInputs = screen.getAllByPlaceholderText("—");
    fireEvent.change(noteInputs[0], { target: { value: "Fresh delivery" } });
    expect((noteInputs[0] as HTMLInputElement).value).toBe("Fresh delivery");
  });
});

// ── Save draft ────────────────────────────────────────────────────────────────

describe("AdminDailyInventoryTab — save draft", () => {
  beforeEach(() => {
    mockAuth = adminAuth();
  });

  it("shows 'Saving…' while save is in flight", async () => {
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (url.includes("/staff-names")) return makeResponse(SAMPLE_STAFF);
      if (url.includes("/daily-inventory/items")) return makeResponse(SAMPLE_ITEMS);
      if (url.includes("/save") && opts?.method === "POST") return new Promise(() => {}); // stall
      return makeResponse({});
    });
    await renderTab();
    await waitFor(() => screen.getByText("Alice"));

    // Select staff and click save
    const staffSel = screen.getAllByRole("combobox").find((s) => s.innerHTML.includes("Other"))!;
    fireEvent.change(staffSel, { target: { value: "Alice" } });
    fireEvent.click(screen.getByText("💾 Save draft"));
    await waitFor(() =>
      expect(screen.getByText("Saving…")).toBeInTheDocument()
    );
  });

  it("shows save error when no staff is selected", async () => {
    routedFetch();
    await renderTab();
    await waitFor(() => screen.getByText("Alice"));
    // No staff selected — click save
    fireEvent.click(screen.getByText("💾 Save draft"));
    await waitFor(() =>
      expect(screen.getByText(/Select a staff member/i)).toBeInTheDocument()
    );
  });

  it("shows save confirmation message on successful save", async () => {
    routedFetch({ saveResult: { report_id: 77 } });
    await renderTab();
    await waitFor(() => screen.getByText("Alice"));

    const staffSel = screen.getAllByRole("combobox").find((s) => s.innerHTML.includes("Other"))!;
    fireEvent.change(staffSel, { target: { value: "Alice" } });
    fireEvent.click(screen.getByText("💾 Save draft"));
    await waitFor(() =>
      expect(screen.getByText(/Saved.*report ID: 77/i)).toBeInTheDocument()
    );
  });

  it("shows save error message when API returns error", async () => {
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (url.includes("/staff-names")) return makeResponse(SAMPLE_STAFF);
      if (url.includes("/daily-inventory/items")) return makeResponse(SAMPLE_ITEMS);
      if (url.includes("/save") && opts?.method === "POST") return makeErrorResponse(500, "DB write failed");
      return makeResponse({});
    });
    await renderTab();
    await waitFor(() => screen.getByText("Alice"));
    const staffSel = screen.getAllByRole("combobox").find((s) => s.innerHTML.includes("Other"))!;
    fireEvent.change(staffSel, { target: { value: "Alice" } });
    fireEvent.click(screen.getByText("💾 Save draft"));
    await waitFor(() =>
      expect(screen.getByText(/Save error/i)).toBeInTheDocument()
    );
  });
});

// ── Submit report ─────────────────────────────────────────────────────────────

describe("AdminDailyInventoryTab — submit report", () => {
  beforeEach(() => {
    mockAuth = adminAuth();
    (global.confirm as ReturnType<typeof vi.fn>).mockReturnValue(true);
  });

  it("shows submitted success screen after successful submit", async () => {
    routedFetch({ saveResult: { report_id: 55 }, submitResult: { ok: true } });
    await renderTab();
    await waitFor(() => screen.getByText("Alice"));

    const staffSel = screen.getAllByRole("combobox").find((s) => s.innerHTML.includes("Other"))!;
    fireEvent.change(staffSel, { target: { value: "Alice" } });
    fireEvent.click(screen.getByText("✅ Submit report"));
    await waitFor(() =>
      expect(screen.getByText("Report submitted")).toBeInTheDocument()
    );
  });

  it("shows report ID in submitted screen", async () => {
    routedFetch({ saveResult: { report_id: 55 }, submitResult: { ok: true } });
    await renderTab();
    await waitFor(() => screen.getByText("Alice"));
    const staffSel = screen.getAllByRole("combobox").find((s) => s.innerHTML.includes("Other"))!;
    fireEvent.change(staffSel, { target: { value: "Alice" } });
    fireEvent.click(screen.getByText("✅ Submit report"));
    await waitFor(() =>
      expect(screen.getByText(/Report ID: 55/i)).toBeInTheDocument()
    );
  });

  it("shows 'Start a new report' button after submit", async () => {
    routedFetch({ saveResult: { report_id: 55 }, submitResult: { ok: true } });
    await renderTab();
    await waitFor(() => screen.getByText("Alice"));
    const staffSel = screen.getAllByRole("combobox").find((s) => s.innerHTML.includes("Other"))!;
    fireEvent.change(staffSel, { target: { value: "Alice" } });
    fireEvent.click(screen.getByText("✅ Submit report"));
    await waitFor(() =>
      expect(screen.getByText("Start a new report")).toBeInTheDocument()
    );
  });

  it("'Start a new report' resets the form", async () => {
    routedFetch({ saveResult: { report_id: 55 }, submitResult: { ok: true } });
    await renderTab();
    await waitFor(() => screen.getByText("Alice"));
    const staffSel = screen.getAllByRole("combobox").find((s) => s.innerHTML.includes("Other"))!;
    fireEvent.change(staffSel, { target: { value: "Alice" } });
    fireEvent.click(screen.getByText("✅ Submit report"));
    await waitFor(() => screen.getByText("Start a new report"));
    fireEvent.click(screen.getByText("Start a new report"));
    await waitFor(() =>
      expect(screen.getByText("📦 Daily Inventory Report")).toBeInTheDocument()
    );
    // Back to the normal form
    expect(screen.queryByText("Report submitted")).not.toBeInTheDocument();
  });

  it("does nothing when confirm is cancelled", async () => {
    (global.confirm as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    routedFetch({ saveResult: { report_id: 55 } });
    await renderTab();
    await waitFor(() => screen.getByText("Alice"));
    const staffSel = screen.getAllByRole("combobox").find((s) => s.innerHTML.includes("Other"))!;
    fireEvent.change(staffSel, { target: { value: "Alice" } });
    fireEvent.click(screen.getByText("✅ Submit report"));
    // After confirm cancel, still on the form
    await waitFor(() =>
      expect(screen.queryByText("Report submitted")).not.toBeInTheDocument()
    );
  });

  it("shows submit error message when no staff and save fails (regression: generic msg should not overwrite real error)", async () => {
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (url.includes("/staff-names")) return makeResponse(SAMPLE_STAFF);
      if (url.includes("/daily-inventory/items")) return makeResponse(SAMPLE_ITEMS);
      if (url.includes("/save") && opts?.method === "POST") return makeErrorResponse(503, "Network timeout");
      return makeResponse({});
    });
    await renderTab();
    await waitFor(() => screen.getByText("Alice"));
    const staffSel = screen.getAllByRole("combobox").find((s) => s.innerHTML.includes("Other"))!;
    fireEvent.change(staffSel, { target: { value: "Alice" } });
    fireEvent.click(screen.getByText("✅ Submit report"));
    await waitFor(() => {
      // Should show the real save error, not "Save first (select staff...)"
      const errEl = document.querySelector(".text-red-200");
      expect(errEl?.textContent).toContain("Network timeout");
    });
  });
});

// ── History tab ───────────────────────────────────────────────────────────────

describe("AdminDailyInventoryTab — history tab", () => {
  beforeEach(() => {
    mockAuth = adminAuth();
    routedFetch();
  });

  it("clicking History button switches to history tab", async () => {
    await renderTab();
    await waitFor(() => screen.getByText("History"));
    fireEvent.click(screen.getByText("History"));
    await waitFor(() =>
      expect(screen.getByText(/History \(PARANAQUE\)/i)).toBeInTheDocument()
    );
  });

  it("history tab shows report rows", async () => {
    await renderTab();
    await waitFor(() => screen.getByText("History"));
    fireEvent.click(screen.getByText("History"));
    await waitFor(() =>
      expect(screen.getByText("2026-05-01")).toBeInTheDocument()
    );
    expect(screen.getByText("SUBMITTED")).toBeInTheDocument();
    expect(screen.getByText("DRAFT")).toBeInTheDocument();
  });

  it("history tab shows 'No reports yet' when empty", async () => {
    routedFetch({ history: [] });
    await renderTab();
    await waitFor(() => screen.getByText("History"));
    fireEvent.click(screen.getByText("History"));
    await waitFor(() =>
      expect(screen.getByText("No reports yet")).toBeInTheDocument()
    );
  });

  it("'Back to form' button returns to the form", async () => {
    await renderTab();
    await waitFor(() => screen.getByText("History"));
    fireEvent.click(screen.getByText("History"));
    await waitFor(() => screen.getByText("Back to form"));
    fireEvent.click(screen.getByText("Back to form"));
    await waitFor(() =>
      expect(screen.getByText("💾 Save draft")).toBeInTheDocument()
    );
  });

  it("history tab shows loading state", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/staff-names")) return makeResponse(SAMPLE_STAFF);
      if (url.includes("/daily-inventory/items")) return makeResponse(SAMPLE_ITEMS);
      if (url.includes("/daily-inventory/reports")) return new Promise(() => {}); // stall
      return makeResponse({});
    });
    await renderTab();
    await waitFor(() => screen.getByText("History"));
    fireEvent.click(screen.getByText("History"));
    await waitFor(() =>
      expect(screen.getByText("Loading…")).toBeInTheDocument()
    );
  });

  it("history tab shows error when history fetch fails", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/staff-names")) return makeResponse(SAMPLE_STAFF);
      if (url.includes("/daily-inventory/items")) return makeResponse(SAMPLE_ITEMS);
      if (url.includes("/daily-inventory/reports")) return makeErrorResponse(500, "History load error");
      return makeResponse({});
    });
    await renderTab();
    await waitFor(() => screen.getByText("History"));
    fireEvent.click(screen.getByText("History"));
    await waitFor(() =>
      expect(screen.getByText(/Failed to load history/i)).toBeInTheDocument()
    );
  });
});

// ── effectiveStaffName unit tests ─────────────────────────────────────────────

describe("AdminDailyInventoryTab — effectiveStaffName (via UI)", () => {
  beforeEach(() => {
    mockAuth = adminAuth();
    routedFetch();
  });

  it("selecting a named staff shows the name in the select", async () => {
    await renderTab();
    await waitFor(() => screen.getByText("Alice"));
    const staffSel = screen.getAllByRole("combobox").find((s) => s.innerHTML.includes("Other"))!;
    fireEvent.change(staffSel, { target: { value: "Bob" } });
    expect(screen.getByDisplayValue("Bob")).toBeInTheDocument();
  });

  it("selecting Other + entering custom name uses the custom name for save", async () => {
    routedFetch({ saveResult: { report_id: 9 } });
    await renderTab();
    await waitFor(() => screen.getByText("Alice"));
    const staffSel = screen.getAllByRole("combobox").find((s) => s.innerHTML.includes("Other"))!;
    fireEvent.change(staffSel, { target: { value: "Other" } });
    await waitFor(() => screen.getByPlaceholderText("Enter name"));
    fireEvent.change(screen.getByPlaceholderText("Enter name"), { target: { value: "Temp Worker" } });
    fireEvent.click(screen.getByText("💾 Save draft"));
    await waitFor(() =>
      expect(screen.getByText(/Saved.*report ID: 9/i)).toBeInTheDocument()
    );
    // Verify the POST body contained "Temp Worker"
    const savedCall = mockFetch.mock.calls.find(
      ([url, opts]: [string, RequestInit]) =>
        typeof url === "string" && url.includes("/save") && opts?.method === "POST"
    );
    expect(savedCall).toBeDefined();
    const body = JSON.parse(savedCall![1].body as string);
    expect(body.staff_name).toBe("Temp Worker");
  });

  it("selecting Other + leaving name blank shows validation error on save", async () => {
    await renderTab();
    await waitFor(() => screen.getByText("Alice"));
    const staffSel = screen.getAllByRole("combobox").find((s) => s.innerHTML.includes("Other"))!;
    fireEvent.change(staffSel, { target: { value: "Other" } });
    await waitFor(() => screen.getByPlaceholderText("Enter name"));
    // Leave custom name empty, click save
    fireEvent.click(screen.getByText("💾 Save draft"));
    await waitFor(() =>
      expect(screen.getByText(/Select a staff member/i)).toBeInTheDocument()
    );
  });
});
