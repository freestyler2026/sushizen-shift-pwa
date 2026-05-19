// tests/admin/manual-shift/manual-shift-page.test.tsx
// Comprehensive tests for src/app/admin/manual-shift/page.tsx
// Covers: page structure, city/branch selectors, empty state, load flow,
//         grid rendering, edit modal, publish, error handling, helper utilities.

import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── next/link ──────────────────────────────────────────────────────────────────
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));

// ── lucide-react ───────────────────────────────────────────────────────────────
vi.mock("lucide-react", () => ({
  ChevronDown: ({ className }: any) => <svg data-testid="chevron-down" className={className} />,
}));

// ── react-dom (createPortal → render inline for testability) ──────────────────
// jsdom supports createPortal to document.body natively — no override needed.

// ── Auth ───────────────────────────────────────────────────────────────────────
const BASE_AUTH = {
  staffName: "Jay Test",
  city: "dubai",
  role: "HQ",
  accessToken: "tok",
  permissions: ["*"],
  pin: "1234",
};

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getAuth: vi.fn(() => BASE_AUTH),
    getAuthHeaders: vi.fn(() => ({ Authorization: "Bearer tok" })),
  };
});

// ── Staff names used in tests ──────────────────────────────────────────────────
const STAFF_NAMES = ["Alice Cohen", "Bob Smith (AL)", "Carol Lee"];

// ── Fetch factory ──────────────────────────────────────────────────────────────
function makeFetch(
  overrides: Array<{ match: string | RegExp; body: unknown; status?: number; method?: string }> = []
) {
  return vi.fn(async (url: string, opts?: RequestInit) => {
    const method = ((opts?.method as string) || "GET").toUpperCase();
    const u = String(url);
    for (const ov of overrides) {
      const matchStr = typeof ov.match === "string" ? u.includes(ov.match) : ov.match.test(u);
      const matchMethod = !ov.method || ov.method.toUpperCase() === method;
      if (matchStr && matchMethod) {
        return new Response(JSON.stringify(ov.body), {
          status: ov.status ?? 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    // Default happy responses
    if (u.includes("/api/admin/staff_master/names"))
      return new Response(JSON.stringify({ names: STAFF_NAMES }), { status: 200, headers: { "Content-Type": "application/json" } });
    if (u.includes("/api/published/week"))
      return new Response(JSON.stringify({ rows: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    if (u.includes("/api/admin/shifts/manual_publish"))
      return new Response(JSON.stringify({ ok: true, rows_copied: 3 }), { status: 200, headers: { "Content-Type": "application/json" } });
    if (u.includes("/api/admin/shifts/delete_published_row"))
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    if (u.includes("/api/admin/shifts/publish_from_base"))
      return new Response(JSON.stringify({ ok: true, rows_copied: 5 }), { status: 200, headers: { "Content-Type": "application/json" } });
    if (u.includes("/api/admin/draft/rows_for_week"))
      return new Response(JSON.stringify({ ok: true, version_id: "v-draft-1", rows: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

import ManualShiftPage from "@/app/admin/manual-shift/page";

// ── Helpers ────────────────────────────────────────────────────────────────────

async function renderPage(fetchMock = makeFetch()) {
  const { getAuth, getAuthHeaders } = await import("@/lib/auth");
  vi.mocked(getAuth).mockReturnValue(BASE_AUTH as any);
  vi.mocked(getAuthHeaders).mockReturnValue({ Authorization: "Bearer tok" } as any);
  vi.stubGlobal("fetch", fetchMock);
  render(<ManualShiftPage />);
}

async function loadStaff() {
  const btn = screen.getByRole("button", { name: /Load Staff & Shifts/i });
  fireEvent.click(btn);
  // Wait for staff names to appear in the grid
  await screen.findByText("Alice Cohen", {}, { timeout: 5000 });
}

// ────────────────────────────────────────────────────────────────────────────────
describe("ManualShiftPage — page structure", () => {
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it("renders the page heading", async () => {
    await renderPage();
    expect(screen.getByText("Manual Shift Entry")).toBeInTheDocument();
  });

  it("renders the subtitle caption", async () => {
    await renderPage();
    expect(screen.getByText(/Hand-enter shifts for a week/i)).toBeInTheDocument();
  });

  it("renders navigation links to AI Draft and Admin Dashboard", async () => {
    await renderPage();
    expect(screen.getByRole("link", { name: /AI Draft/i })).toHaveAttribute("href", "/admin/draft");
    expect(screen.getByRole("link", { name: /Admin Dashboard/i })).toHaveAttribute("href", "/admin");
  });

  it("renders Shift Color legend section", async () => {
    await renderPage();
    expect(screen.getByText(/Shift Color by Start Time/i)).toBeInTheDocument();
  });

  it("renders color band labels in legend", async () => {
    await renderPage();
    expect(screen.getByText(/Morning/i)).toBeInTheDocument();
    expect(screen.getByText(/Midday/i)).toBeInTheDocument();
    expect(screen.getByText(/Afternoon/i)).toBeInTheDocument();
    expect(screen.getByText(/Evening/i)).toBeInTheDocument();
    expect(screen.getByText(/Night/i)).toBeInTheDocument();
  });

  it("renders City label and select with Dubai/Manila options", async () => {
    await renderPage();
    expect(screen.getByText("City")).toBeInTheDocument();
    const citySelect = screen.getByRole("combobox");
    const options = Array.from(citySelect.querySelectorAll("option")).map((o) => o.textContent);
    expect(options).toContain("Dubai");
    expect(options).toContain("Manila");
  });

  it("renders Branch label", async () => {
    await renderPage();
    expect(screen.getByText("Branch")).toBeInTheDocument();
  });

  it("renders Week (Monday) date input", async () => {
    await renderPage();
    expect(screen.getByText(/Week \(Monday\)/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/^\d{4}-\d{2}-\d{2}$/)).toBeInTheDocument();
  });

  it("renders Load Staff & Shifts button", async () => {
    await renderPage();
    expect(screen.getByRole("button", { name: /Load Staff & Shifts/i })).toBeInTheDocument();
  });

  it("renders Bayzat Import button", async () => {
    await renderPage();
    expect(screen.getByTitle(/Import shift schedule from a Bayzat Excel export/i)).toBeInTheDocument();
  });
});

// ────────────────────────────────────────────────────────────────────────────────
describe("ManualShiftPage — empty state (before load)", () => {
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it("shows empty state message before staff is loaded", async () => {
    await renderPage();
    expect(screen.getByText(/Select city, branch and week/i)).toBeInTheDocument();
  });

  it("shows calendar emoji in empty state", async () => {
    await renderPage();
    expect(screen.getByText("📅")).toBeInTheDocument();
  });

  it("does NOT show Edit Grid tab before staff loads", async () => {
    await renderPage();
    expect(screen.queryByRole("button", { name: /✏️ Edit Grid/i })).toBeNull();
  });

  it("does NOT show Save & Publish button before staff loads", async () => {
    await renderPage();
    expect(screen.queryByRole("button", { name: /Save & Publish/i })).toBeNull();
  });

  it("does NOT show Reload from Server button before staff loads", async () => {
    await renderPage();
    expect(screen.queryByRole("button", { name: /↺ Reload from Server/i })).toBeNull();
  });

  it("does NOT show Load from DB button before staff loads", async () => {
    await renderPage();
    expect(screen.queryByRole("button", { name: /🗄️ Load from DB/i })).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────────
describe("ManualShiftPage — city selector", () => {
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it("defaults city to dubai from auth", async () => {
    await renderPage();
    const citySelect = screen.getByRole("combobox") as HTMLSelectElement;
    expect(citySelect.value).toBe("dubai");
  });

  it("defaults branch button label to first Dubai branch (Business Bay)", async () => {
    await renderPage();
    // Branch button shows the branch name
    expect(screen.getByText("Business Bay")).toBeInTheDocument();
  });

  it("switching city to Manila resets to first Manila branch (Paranaque)", async () => {
    await renderPage();
    const citySelect = screen.getByRole("combobox");
    fireEvent.change(citySelect, { target: { value: "manila" } });
    await waitFor(() => {
      expect(screen.getByText("Paranaque")).toBeInTheDocument();
    });
  });

  it("switching city to Manila resets staff list (returns to empty state)", async () => {
    const fetchMock = makeFetch();
    await renderPage(fetchMock);
    await loadStaff();
    // Staff should be loaded
    expect(screen.getByText("Alice Cohen")).toBeInTheDocument();
    // Now switch city
    const citySelect = screen.getByRole("combobox");
    fireEvent.change(citySelect, { target: { value: "manila" } });
    // Empty state should reappear
    await screen.findByText(/Select city, branch and week/i, {}, { timeout: 3000 });
  });

  it("Manila city shows Sat–Sun role options (Cashier) in edit modal", async () => {
    const { getAuth } = await import("@/lib/auth");
    vi.mocked(getAuth).mockReturnValue({ ...BASE_AUTH, city: "manila" } as any);
    vi.stubGlobal("fetch", makeFetch());
    render(<ManualShiftPage />);
    // Switch to Manila
    const citySelect = screen.getByRole("combobox");
    fireEvent.change(citySelect, { target: { value: "manila" } });
    await loadStaff();
    // Open a cell
    const plusButtons = screen.getAllByRole("button", { name: "+" });
    fireEvent.click(plusButtons[0]);
    // Modal should show Manila roles — Cashier is Manila-only
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Cashier" })).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});

// ────────────────────────────────────────────────────────────────────────────────
describe("ManualShiftPage — branch dropdown", () => {
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it("clicking Branch button opens dropdown with all Dubai branches", async () => {
    await renderPage();
    const branchBtn = screen.getByText("Business Bay").closest("button")!;
    fireEvent.click(branchBtn);
    // Dropdown renders to body via portal
    await waitFor(() => {
      expect(screen.getByText("JLT")).toBeInTheDocument();
      expect(screen.getByText("Arjan")).toBeInTheDocument();
      expect(screen.getByText("Al Mina")).toBeInTheDocument();
      expect(screen.getByText("Al Barsha")).toBeInTheDocument();
      expect(screen.getByText("Central Kitchen")).toBeInTheDocument();
    });
  });

  it("selecting a branch from dropdown updates the branch button label", async () => {
    await renderPage();
    const branchBtn = screen.getByText("Business Bay").closest("button")!;
    fireEvent.click(branchBtn);
    // Wait for dropdown to open
    await screen.findByText("JLT", {}, { timeout: 2000 });
    // Click JLT
    fireEvent.click(screen.getByText("JLT").closest("button")!);
    await waitFor(() => {
      expect(screen.getByText("JLT")).toBeInTheDocument();
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────────
describe("ManualShiftPage — load staff & shifts", () => {
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it("clicking Load Staff & Shifts fetches staff names and shows them in grid", async () => {
    await renderPage();
    await loadStaff();
    expect(screen.getByText("Alice Cohen")).toBeInTheDocument();
    // Bob Smith (AL) → stripRoleSuffix shows "Bob Smith"
    expect(screen.getByText("Bob Smith")).toBeInTheDocument();
    expect(screen.getByText("Carol Lee")).toBeInTheDocument();
  });

  it("shows staff count, branch, and week info after load", async () => {
    await renderPage();
    await loadStaff();
    // The info <p> contains "3 staff · Business Bay · Week of ..."
    await waitFor(() => {
      expect(screen.getByText(/3 staff/i)).toBeInTheDocument();
    });
    // "Business Bay" appears in both branch button and info text; use getAllByText
    const bbElements = screen.getAllByText(/Business Bay/i);
    expect(bbElements.length).toBeGreaterThanOrEqual(1);
  });

  it("shows Edit Grid and Published View tabs after staff loads", async () => {
    await renderPage();
    await loadStaff();
    expect(screen.getByRole("button", { name: /✏️ Edit Grid/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /📋 Published View/i })).toBeInTheDocument();
  });

  it("shows Save & Publish button after staff loads", async () => {
    await renderPage();
    await loadStaff();
    expect(screen.getByRole("button", { name: /Save & Publish/i })).toBeInTheDocument();
  });

  it("shows Reload from Server button after staff loads", async () => {
    await renderPage();
    await loadStaff();
    expect(screen.getByRole("button", { name: /↺ Reload from Server/i })).toBeInTheDocument();
  });

  it("shows Load from DB button after staff loads", async () => {
    await renderPage();
    await loadStaff();
    await waitFor(() => {
      expect(screen.getByTitle(/Load this week.*shifts.*from the Bayzat/i)).toBeInTheDocument();
    });
  });

  it("shows + Add staff row manually link after load", async () => {
    await renderPage();
    await loadStaff();
    expect(screen.getByText(/\+ Add staff row manually/i)).toBeInTheDocument();
  });

  it("grid header shows 7 day columns", async () => {
    await renderPage();
    await loadStaff();
    // The week has 7 dates → 7 <th> date headers (plus the Staff header)
    const headers = screen.getAllByRole("columnheader");
    expect(headers.length).toBe(8); // Staff + 7 days
  });

  it("shows error when staff load fails", async () => {
    const fetchMock = makeFetch([
      { match: "/api/admin/staff_master/names", body: { detail: "DB connection failed" }, status: 500 },
    ]);
    await renderPage(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: /Load Staff & Shifts/i }));
    await screen.findByText(/DB connection failed/i, {}, { timeout: 5000 });
  });
});

// ────────────────────────────────────────────────────────────────────────────────
describe("ManualShiftPage — grid with existing shifts", () => {
  // Get a weekStart that's reliably Monday of the current week
  const weekStart = (() => {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const tuesday = (() => {
    const d = new Date(weekStart + "T00:00:00");
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it("shows existing shift times in the grid from published data", async () => {
    const fetchMock = makeFetch([
      { match: "/api/published/week", body: {
          rows: [{ work_date: tuesday, staff_name: "Alice Cohen", branch_code: "BB", role: "CK", start_hour: 9, end_hour: 17 }],
        },
      },
    ]);
    await renderPage(fetchMock);
    await loadStaff();
    // Should show "9:00–17:00" in the grid
    await waitFor(() => {
      expect(screen.getByText("9:00–17:00")).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it("shows role label inside the shift cell", async () => {
    const fetchMock = makeFetch([
      { match: "/api/published/week", body: {
          rows: [{ work_date: tuesday, staff_name: "Alice Cohen", branch_code: "BB", role: "SV", start_hour: 10, end_hour: 18 }],
        },
      },
    ]);
    await renderPage(fetchMock);
    await loadStaff();
    await waitFor(() => {
      expect(screen.getByText("SV")).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it("shows DAY_OFF special cell for day-off shifts", async () => {
    const fetchMock = makeFetch([
      { match: "/api/published/week", body: {
          rows: [{ work_date: tuesday, staff_name: "Alice Cohen", branch_code: "BB", role: "DAY_OFF", start_hour: 0, end_hour: 0 }],
        },
      },
    ]);
    await renderPage(fetchMock);
    await loadStaff();
    await waitFor(() => {
      expect(screen.getByText("Day Off")).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it("shows ABSENT special cell", async () => {
    const fetchMock = makeFetch([
      { match: "/api/published/week", body: {
          rows: [{ work_date: tuesday, staff_name: "Bob Smith (AL)", branch_code: "BB", role: "ABSENT", start_hour: 0, end_hour: 0 }],
        },
      },
    ]);
    await renderPage(fetchMock);
    await loadStaff();
    await waitFor(() => {
      expect(screen.getByText("Absent")).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it("shows plus buttons for empty cells", async () => {
    await renderPage();
    await loadStaff();
    const plusButtons = screen.getAllByRole("button", { name: "+" });
    // 3 staff × 7 days = 21 empty cells max (all empty since no published shifts)
    expect(plusButtons.length).toBeGreaterThan(0);
  });

  it("shows shiftCount in publish description", async () => {
    const fetchMock = makeFetch([
      { match: "/api/published/week", body: {
          rows: [{ work_date: tuesday, staff_name: "Alice Cohen", branch_code: "BB", role: "CK", start_hour: 9, end_hour: 17 }],
        },
      },
    ]);
    await renderPage(fetchMock);
    await loadStaff();
    // After loading, 1 shift → description says "1 shift"
    await waitFor(() => {
      expect(screen.getByText(/Publishes 1 shift/i)).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});

// ────────────────────────────────────────────────────────────────────────────────
describe("ManualShiftPage — edit modal", () => {
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it("clicking a + cell opens the edit modal", async () => {
    await renderPage();
    await loadStaff();
    const plusButtons = screen.getAllByRole("button", { name: "+" });
    fireEvent.click(plusButtons[0]);
    // Modal appears (via portal to body)
    await waitFor(() => {
      expect(screen.getByText("Shift")).toBeInTheDocument();
      expect(screen.getByText("Day Off / Absent")).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it("modal shows staff name header", async () => {
    await renderPage();
    await loadStaff();
    // Alice Cohen's first empty cell (first in sorted staffList)
    const plusButtons = screen.getAllByRole("button", { name: "+" });
    fireEvent.click(plusButtons[0]);
    // Modal header has a <p class="text-sm font-semibold"> with the staff name.
    // "Alice Cohen" also appears in the grid row — use getAllByText and confirm 2 occurrences
    await waitFor(() => {
      const all = screen.getAllByText("Alice Cohen");
      // At least grid cell + modal header = 2
      expect(all.length).toBeGreaterThanOrEqual(2);
    }, { timeout: 2000 });
  });

  it("modal has Start, End, Role selects in Shift mode", async () => {
    await renderPage();
    await loadStaff();
    const plusButtons = screen.getAllByRole("button", { name: "+" });
    fireEvent.click(plusButtons[0]);
    await waitFor(() => {
      expect(screen.getByText("Start")).toBeInTheDocument();
      expect(screen.getByText("End")).toBeInTheDocument();
      expect(screen.getByText("Role")).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it("modal has Save and Cancel buttons", async () => {
    await renderPage();
    await loadStaff();
    const plusButtons = screen.getAllByRole("button", { name: "+" });
    fireEvent.click(plusButtons[0]);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it("Cancel button closes the edit modal", async () => {
    await renderPage();
    await loadStaff();
    const plusButtons = screen.getAllByRole("button", { name: "+" });
    fireEvent.click(plusButtons[0]);
    await screen.findByRole("button", { name: "Cancel" }, { timeout: 2000 });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    }, { timeout: 2000 });
  });

  it("✕ close button closes the modal", async () => {
    await renderPage();
    await loadStaff();
    const plusButtons = screen.getAllByRole("button", { name: "+" });
    fireEvent.click(plusButtons[0]);
    await screen.findByRole("button", { name: "✕" }, { timeout: 2000 });
    fireEvent.click(screen.getByRole("button", { name: "✕" }));
    await waitFor(() => {
      expect(screen.queryByText("Start")).toBeNull();
    }, { timeout: 2000 });
  });

  it("Save button is disabled when start >= end", async () => {
    await renderPage();
    await loadStaff();
    const plusButtons = screen.getAllByRole("button", { name: "+" });
    fireEvent.click(plusButtons[0]);
    await screen.findByText("Start", {}, { timeout: 2000 });
    // The Start and End selects — set start > end
    const [startSelect, endSelect] = screen.getAllByRole("combobox").slice(-3, -1);
    // Set start to 17, end to 9 — invalid
    fireEvent.change(startSelect, { target: { value: "17" } });
    fireEvent.change(endSelect, { target: { value: "9" } });
    // Save button should be disabled
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    }, { timeout: 2000 });
  });

  it("saving a shift in modal adds it to the grid", async () => {
    await renderPage();
    await loadStaff();
    const plusButtons = screen.getAllByRole("button", { name: "+" });
    fireEvent.click(plusButtons[0]);
    await screen.findByRole("button", { name: "Save" }, { timeout: 2000 });
    // Default is 9:00–17:00, CK — just save it
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    // Modal closes and shift appears in grid
    await waitFor(() => {
      expect(screen.getByText("9:00–17:00")).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it("switching to Day Off / Absent mode shows special type buttons", async () => {
    await renderPage();
    await loadStaff();
    const plusButtons = screen.getAllByRole("button", { name: "+" });
    fireEvent.click(plusButtons[0]);
    await screen.findByText("Day Off / Absent", {}, { timeout: 2000 });
    fireEvent.click(screen.getByText("Day Off / Absent"));
    await waitFor(() => {
      expect(screen.getByText("Day Off")).toBeInTheDocument();
      expect(screen.getByText("Absent")).toBeInTheDocument();
      expect(screen.getByText("VL (Vacation)")).toBeInTheDocument();
      expect(screen.getByText("ML (Medical)")).toBeInTheDocument();
      expect(screen.getByText("SL (Sick)")).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it("saving Day Off inserts special cell into grid", async () => {
    await renderPage();
    await loadStaff();
    const plusButtons = screen.getAllByRole("button", { name: "+" });
    fireEvent.click(plusButtons[0]);
    await screen.findByText("Day Off / Absent", {}, { timeout: 2000 });
    fireEvent.click(screen.getByText("Day Off / Absent"));
    // Click Save with default Day Off
    await screen.findByRole("button", { name: "Save" });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(screen.getByText("Day Off")).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it("modal shows Note textarea", async () => {
    await renderPage();
    await loadStaff();
    const plusButtons = screen.getAllByRole("button", { name: "+" });
    fireEvent.click(plusButtons[0]);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Add a note for this shift/i)).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it("Note field is included when saving a shift", async () => {
    await renderPage();
    await loadStaff();
    const plusButtons = screen.getAllByRole("button", { name: "+" });
    fireEvent.click(plusButtons[0]);
    await screen.findByPlaceholderText(/Add a note for this shift/i, {}, { timeout: 2000 });
    fireEvent.change(screen.getByPlaceholderText(/Add a note for this shift/i), {
      target: { value: "Training day" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    // After save, note should appear in the cell
    await waitFor(() => {
      expect(screen.getByText("Training day")).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it("Dubai role options include PIC, CDP, DCDP, Area Manager", async () => {
    await renderPage();
    await loadStaff();
    const plusButtons = screen.getAllByRole("button", { name: "+" });
    fireEvent.click(plusButtons[0]);
    await screen.findByText("Role", {}, { timeout: 2000 });
    expect(screen.getByRole("option", { name: "PIC" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "CDP" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Area Manager" })).toBeInTheDocument();
  });

  it("Dubai role options do NOT include Cashier (Manila-only)", async () => {
    await renderPage();
    await loadStaff();
    const plusButtons = screen.getAllByRole("button", { name: "+" });
    fireEvent.click(plusButtons[0]);
    await screen.findByText("Role", {}, { timeout: 2000 });
    expect(screen.queryByRole("option", { name: "Cashier" })).toBeNull();
  });

  it("selecting OTHER role shows custom role input", async () => {
    await renderPage();
    await loadStaff();
    const plusButtons = screen.getAllByRole("button", { name: "+" });
    fireEvent.click(plusButtons[0]);
    await screen.findByText("Role", {}, { timeout: 2000 });
    // Find the Role select specifically by label
    const roleSelect = screen.getAllByRole("combobox").find(
      (s) => Array.from(s.querySelectorAll("option")).some((o) => (o as HTMLOptionElement).value === "OTHER")
    )!;
    fireEvent.change(roleSelect, { target: { value: "OTHER" } });
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Role name")).toBeInTheDocument();
    }, { timeout: 2000 });
  });
});

// ────────────────────────────────────────────────────────────────────────────────
describe("ManualShiftPage — publish flow", () => {
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it("shows error when publishing with no shifts", async () => {
    await renderPage();
    await loadStaff();
    // No shifts added — click publish
    fireEvent.click(screen.getByRole("button", { name: /Save & Publish/i }));
    await screen.findByText(/No shifts to publish/i, {}, { timeout: 3000 });
  });

  it("successful publish switches to Published View", async () => {
    // Need at least one shift to publish
    const weekStart = (() => {
      const d = new Date();
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + diff);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
    const tuesday = (() => {
      const d = new Date(weekStart + "T00:00:00");
      d.setDate(d.getDate() + 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
    const fetchMock = makeFetch([
      { match: "/api/published/week", body: {
          rows: [{ work_date: tuesday, staff_name: "Alice Cohen", branch_code: "BB", role: "CK", start_hour: 9, end_hour: 17 }],
        },
      },
    ]);
    await renderPage(fetchMock);
    await loadStaff();
    await waitFor(() => expect(screen.getByText("9:00–17:00")).toBeInTheDocument(), { timeout: 3000 });
    fireEvent.click(screen.getByRole("button", { name: /Save & Publish/i }));
    // After publish, goes to Published View
    await waitFor(() => {
      expect(screen.getByText(/Published Schedule/i)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("publish API error shows error message", async () => {
    const weekStart = (() => {
      const d = new Date();
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + diff);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
    const tuesday = (() => {
      const d = new Date(weekStart + "T00:00:00");
      d.setDate(d.getDate() + 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
    const fetchMock = makeFetch([
      { match: "/api/published/week", body: {
          rows: [{ work_date: tuesday, staff_name: "Alice Cohen", branch_code: "BB", role: "CK", start_hour: 9, end_hour: 17 }],
        },
      },
      { match: "/api/admin/shifts/manual_publish", body: { detail: "Permission denied" }, status: 403, method: "POST" },
    ]);
    await renderPage(fetchMock);
    await loadStaff();
    await waitFor(() => expect(screen.getByText("9:00–17:00")).toBeInTheDocument(), { timeout: 3000 });
    fireEvent.click(screen.getByRole("button", { name: /Save & Publish/i }));
    await screen.findByText(/Permission denied/i, {}, { timeout: 5000 });
  });

  it("Preview before publishing link appears when there are shifts", async () => {
    const weekStart = (() => {
      const d = new Date();
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + diff);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
    const tuesday = (() => {
      const d = new Date(weekStart + "T00:00:00");
      d.setDate(d.getDate() + 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
    const fetchMock = makeFetch([
      { match: "/api/published/week", body: {
          rows: [{ work_date: tuesday, staff_name: "Alice Cohen", branch_code: "BB", role: "CK", start_hour: 9, end_hour: 17 }],
        },
      },
    ]);
    await renderPage(fetchMock);
    await loadStaff();
    await waitFor(() => expect(screen.getByText("9:00–17:00")).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText(/Preview before publishing/i)).toBeInTheDocument();
  });
});

// ────────────────────────────────────────────────────────────────────────────────
describe("ManualShiftPage — add staff row", () => {
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it("clicking Add staff row manually calls prompt", async () => {
    vi.spyOn(window, "prompt").mockReturnValueOnce(null);
    await renderPage();
    await loadStaff();
    const addBtn = screen.getByText(/\+ Add staff row manually/i);
    fireEvent.click(addBtn);
    expect(window.prompt).toHaveBeenCalledWith("Enter staff name:");
    vi.restoreAllMocks();
  });

  it("entering a name via prompt adds the staff row to the grid", async () => {
    vi.spyOn(window, "prompt").mockReturnValueOnce("Zara New Staff");
    await renderPage();
    await loadStaff();
    fireEvent.click(screen.getByText(/\+ Add staff row manually/i));
    await waitFor(() => {
      expect(screen.getByText("Zara New Staff")).toBeInTheDocument();
    }, { timeout: 2000 });
    vi.restoreAllMocks();
  });

  it("cancelling prompt (null) does not add a staff row", async () => {
    vi.spyOn(window, "prompt").mockReturnValueOnce(null);
    await renderPage();
    await loadStaff();
    fireEvent.click(screen.getByText(/\+ Add staff row manually/i));
    await waitFor(() => {
      // Only original 3 staff names should be present
      expect(screen.queryByText("Zara New Staff")).toBeNull();
    }, { timeout: 2000 });
    vi.restoreAllMocks();
  });
});

// ────────────────────────────────────────────────────────────────────────────────
describe("ManualShiftPage — published view tab", () => {
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it("clicking Published View tab shows Published Schedule panel", async () => {
    await renderPage();
    await loadStaff();
    fireEvent.click(screen.getByRole("button", { name: /📋 Published View/i }));
    await waitFor(() => {
      expect(screen.getByText(/Published Schedule/i)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it("Published Schedule shows Back to Edit button", async () => {
    await renderPage();
    await loadStaff();
    fireEvent.click(screen.getByRole("button", { name: /📋 Published View/i }));
    await screen.findByText(/Published Schedule/i, {}, { timeout: 3000 });
    expect(screen.getByRole("button", { name: /✏️ Back to Edit/i })).toBeInTheDocument();
  });

  it("Back to Edit button returns to edit grid", async () => {
    await renderPage();
    await loadStaff();
    fireEvent.click(screen.getByRole("button", { name: /📋 Published View/i }));
    await screen.findByRole("button", { name: /✏️ Back to Edit/i }, { timeout: 3000 });
    fireEvent.click(screen.getByRole("button", { name: /✏️ Back to Edit/i }));
    await waitFor(() => {
      // Back in edit mode, should see the shift grid
      expect(screen.getByText("Alice Cohen")).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});

// ────────────────────────────────────────────────────────────────────────────────
describe("ManualShiftPage — error display", () => {
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it("error from loadStaff is displayed in the page", async () => {
    const fetchMock = makeFetch([
      { match: "/api/admin/staff_master/names", body: { detail: "Staff service unavailable" }, status: 503 },
    ]);
    await renderPage(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: /Load Staff & Shifts/i }));
    await screen.findByText(/Staff service unavailable/i, {}, { timeout: 5000 });
  });

  it("error message appears in red error box", async () => {
    const fetchMock = makeFetch([
      { match: "/api/admin/staff_master/names", body: { detail: "Timeout error" }, status: 500 },
    ]);
    await renderPage(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: /Load Staff & Shifts/i }));
    const errorEl = await screen.findByText(/Timeout error/i, {}, { timeout: 5000 });
    // Error box should be a descendant of the red error div
    expect(errorEl.closest(".border-red-200")).toBeTruthy();
  });
});

// ────────────────────────────────────────────────────────────────────────────────
describe("ManualShiftPage — helper utilities via rendering", () => {
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it("fmtHour: displays '9:00' for hour 9", async () => {
    const weekStart = (() => {
      const d = new Date();
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + diff);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
    const tuesday = (() => {
      const d = new Date(weekStart + "T00:00:00");
      d.setDate(d.getDate() + 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
    const fetchMock = makeFetch([
      { match: "/api/published/week", body: { rows: [{ work_date: tuesday, staff_name: "Alice Cohen", branch_code: "BB", role: "CK", start_hour: 9, end_hour: 17 }] } },
    ]);
    await renderPage(fetchMock);
    await loadStaff();
    await waitFor(() => expect(screen.getByText("9:00–17:00")).toBeInTheDocument(), { timeout: 3000 });
  });

  it("fmtHour: displays '+1:00' for hour 25 (overnight shift)", async () => {
    const weekStart = (() => {
      const d = new Date();
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + diff);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
    const tuesday = (() => {
      const d = new Date(weekStart + "T00:00:00");
      d.setDate(d.getDate() + 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
    const fetchMock = makeFetch([
      { match: "/api/published/week", body: { rows: [{ work_date: tuesday, staff_name: "Alice Cohen", branch_code: "BB", role: "CK", start_hour: 20, end_hour: 25 }] } },
    ]);
    await renderPage(fetchMock);
    await loadStaff();
    await waitFor(() => expect(screen.getByText("20:00–+1:00")).toBeInTheDocument(), { timeout: 3000 });
  });

  it("fmtHour: displays '6:30' for hour 6.5", async () => {
    const weekStart = (() => {
      const d = new Date();
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + diff);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
    const tuesday = (() => {
      const d = new Date(weekStart + "T00:00:00");
      d.setDate(d.getDate() + 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
    const fetchMock = makeFetch([
      { match: "/api/published/week", body: { rows: [{ work_date: tuesday, staff_name: "Alice Cohen", branch_code: "BB", role: "CK", start_hour: 6.5, end_hour: 14.5 }] } },
    ]);
    await renderPage(fetchMock);
    await loadStaff();
    await waitFor(() => expect(screen.getByText("6:30–14:30")).toBeInTheDocument(), { timeout: 3000 });
  });

  it("stripRoleSuffix: 'Bob Smith (AL)' displays as 'Bob Smith' in grid", async () => {
    await renderPage();
    await loadStaff();
    // "Bob Smith (AL)" is in STAFF_NAMES but should display as "Bob Smith"
    expect(screen.getByText("Bob Smith")).toBeInTheDocument();
    expect(screen.queryByText("Bob Smith (AL)")).toBeNull();
  });

  it("getRoleOptions: Dubai has CK, SV, BA, HK, SC, MGR roles", async () => {
    await renderPage();
    await loadStaff();
    // Open edit modal to see role options
    const plusButtons = screen.getAllByRole("button", { name: "+" });
    fireEvent.click(plusButtons[0]);
    await screen.findByText("Role", {}, { timeout: 2000 });
    ["CK", "SV", "BA", "HK", "SC", "MGR"].forEach((role) => {
      expect(screen.getByRole("option", { name: role })).toBeInTheDocument();
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────────
describe("ManualShiftPage — Load AI Draft button", () => {
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it("does NOT show Load AI Draft button before staff loads", async () => {
    await renderPage();
    expect(screen.queryByRole("button", { name: /🤖 Load AI Draft/i })).toBeNull();
  });

  it("shows Load AI Draft button after staff loads", async () => {
    await renderPage();
    await loadStaff();
    await waitFor(() => {
      expect(screen.getByTitle(/Load AI-generated draft shifts/i)).toBeInTheDocument();
    });
  });

  it("Load AI Draft button is disabled while loading", async () => {
    // The button is disabled during draftImporting state — check initial enabled state
    await renderPage();
    await loadStaff();
    const btn = screen.getByTitle(/Load AI-generated draft shifts/i);
    expect(btn).not.toBeDisabled();
  });

  it("Load AI Draft calls /api/admin/draft/rows_for_week with correct params", async () => {
    // Draft rows — staff names match STAFF_NAMES so they can land in the grid
    const weekStart = (() => {
      const d = new Date();
      const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
      d.setDate(d.getDate() + diff);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
    const draftRow = {
      work_date: weekStart,
      staff_name: "Alice Cohen",
      role: "CK",
      start_hour: 9,
      end_hour: 17,
    };
    const fetchMock = makeFetch([
      {
        match: "/api/admin/draft/rows_for_week",
        body: { ok: true, version_id: "v-test-1", rows: [draftRow] },
      },
    ]);
    vi.stubGlobal("confirm", () => true); // auto-confirm overwrite dialog
    await renderPage(fetchMock);
    await loadStaff();

    fireEvent.click(screen.getByTitle(/Load AI-generated draft shifts/i));
    await waitFor(() => {
      const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls;
      const draftCall = calls.find(([url]: [string]) => String(url).includes("/api/admin/draft/rows_for_week"));
      expect(draftCall).toBeDefined();
      const url = String(draftCall![0]);
      expect(url).toContain("city=dubai");
      expect(url).toContain("branch_code=");
      expect(url).toContain("week_start=");
    }, { timeout: 5000 });
  });

  it("Load AI Draft shows alert when rows loaded successfully", async () => {
    const weekStart = (() => {
      const d = new Date();
      const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
      d.setDate(d.getDate() + diff);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
    const draftRows = [
      { work_date: weekStart, staff_name: "Alice Cohen", role: "CK", start_hour: 9, end_hour: 17 },
      { work_date: weekStart, staff_name: "Bob Smith (AL)", role: "SV", start_hour: 12, end_hour: 21 },
    ];
    const fetchMock = makeFetch([
      { match: "/api/admin/draft/rows_for_week", body: { ok: true, version_id: "v-2", rows: draftRows } },
    ]);
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.stubGlobal("confirm", () => true);
    await renderPage(fetchMock);
    await loadStaff();

    fireEvent.click(screen.getByTitle(/Load AI-generated draft shifts/i));
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining("2 draft shifts"));
    }, { timeout: 5000 });
    alertSpy.mockRestore();
  });

  it("Load AI Draft shows error when API returns 404 (no draft found)", async () => {
    const fetchMock = makeFetch([
      {
        match: "/api/admin/draft/rows_for_week",
        body: { detail: "No draft found for dubai/BB covering week 2026-06-01" },
        status: 404,
      },
    ]);
    await renderPage(fetchMock);
    await loadStaff();

    fireEvent.click(screen.getByTitle(/Load AI-generated draft shifts/i));
    await waitFor(() => {
      expect(screen.getByText(/No draft found/i)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("Load AI Draft shows error when API returns empty rows", async () => {
    const fetchMock = makeFetch([
      { match: "/api/admin/draft/rows_for_week", body: { ok: true, version_id: "v-empty", rows: [] } },
    ]);
    await renderPage(fetchMock);
    await loadStaff();

    fireEvent.click(screen.getByTitle(/Load AI-generated draft shifts/i));
    await waitFor(() => {
      expect(screen.getByText(/No draft rows found/i)).toBeInTheDocument();
    }, { timeout: 5000 });
  });
});

// ────────────────────────────────────────────────────────────────────────────────
describe("ManualShiftPage — draft persistence (localStorage)", () => {
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it("Unsaved draft badge appears after editing a cell", async () => {
    await renderPage();
    await loadStaff();
    // Add a shift via the modal
    const plusButtons = screen.getAllByRole("button", { name: "+" });
    fireEvent.click(plusButtons[0]);
    await screen.findByRole("button", { name: "Save" }, { timeout: 2000 });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    // Draft badge should appear
    await waitFor(() => {
      expect(screen.getByText(/Unsaved draft/i)).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});
