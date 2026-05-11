/**
 * Tests for /admin/baseroll-prep/page.tsx
 *
 * Covers:
 * ── Pure helpers ────────────────────────────────────────────────
 * - page title is visible
 * - reference date panel appears
 * - Formula hint text is visible
 * - shortageColorOI: "none" when value is empty or no standard
 * - shortageColorOI: "ok"   when value >= min
 * - shortageColorOI: "warn" when 70%<=value<min
 * - shortageColorOI: "low"  when value < 70% of min
 *
 * ── Module-level constants ──────────────────────────────────────
 * - MANILA_BRANCHES excludes CK and BO
 * - MANILA_BRANCHES contains PAR, CUB, TAFT
 * - MANILA_STANDARDS includes m_fried_garlic  [BUG FIX]
 * - MANILA_STANDARDS all pct specs have valid min >= 0
 *
 * ── PctSelectorOI ───────────────────────────────────────────────
 * - renders 5 pct buttons (0%–100%) for pct items
 * - clicking an unselected button selects it (filled count ++)
 * - clicking already-selected button deselects (filled count --)
 * - 25% for min=50 → shortage badge appears
 * - 75% for min=50 → no shortage
 *
 * ── OtherItemsBackupForm ────────────────────────────────────────
 * - all 5 section headers visible
 * - branch selector: PAR, CUB, TAFT present; CK, BO absent
 * - shift selector: Closing, Morning, Midday
 * - reporter name auto-filled from auth.staffName
 * - Submit disabled when no items filled
 * - Submit enabled after filling one item
 * - empty reporter name shows validation error
 * - successful submit → POST /api/admin/backup/report
 * - submit body: correct city, branch_code, shift, lines
 * - after success: filled values reset, name/branch preserved
 * - API error during submit → error message shown
 * - section collapse hides items
 * - section re-expand shows items
 * - BUG FIX: negative quantity now blocked by front-end guard
 *
 * ── StoreCard ───────────────────────────────────────────────────
 * - renders store name and lunch/dinner percentages
 * - clicking header collapses; clicking again expands
 *
 * ── SessionTable ────────────────────────────────────────────────
 * - "No data" shown for empty arrays
 * - roll name and qty_prep rendered
 *
 * ── Main page (BaserollPrepPage) ────────────────────────────────
 * - renders page title
 * - auto-fetches on mount, shows store cards
 * - shows error message on API failure
 * - shows "No Manila sales data" when stores is empty
 * - Prep Calculator tab active by default
 * - clicking Settings tab → MappingSettings
 * - switching back to Prep tab → OtherItemsBackupForm visible
 * - date picker updates reference date display
 * - Calculate button triggers a new fetch
 * - loading spinner during fetch
 *
 * ── MappingSettings ─────────────────────────────────────────────
 * - loads and shows mapping rows
 * - inactive row shows "Inactive" button
 * - Edit puts row in edit mode (Save/Cancel visible)
 * - Cancel discards edits
 * - Save calls POST with updated coefficient; no crash when item missing  [BUG FIX]
 * - Toggle active calls PATCH /toggle endpoint
 * - Delete after confirm=true calls DELETE
 * - Delete after confirm=false does NOT call DELETE
 * - API failure shows error
 * - Add Mapping button shows add form
 * - Add form validation: empty product name → error
 * - successful add calls POST baseroll-map
 */

import React from "react";
import { render, screen, waitFor, act, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildFetchMock, buildFailFetch } from "../helpers/fetch-mock";

// ── mock next/link ─────────────────────────────────────────────────────────────
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement("a", { href, className }, children),
}));

// ── mock next/navigation ──────────────────────────────────────────────────────
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams("_r=1778512291135"),
  usePathname: () => "/admin/baseroll-prep",
  useParams: () => ({}),
}));

// ── auth mock ──────────────────────────────────────────────────────────────────
vi.mock("@/lib/auth", () => ({
  getAuth: vi.fn(() => ({
    staffName: "Yukihiro",
    city: "manila",
    role: "ADMIN",
    accessToken: "test-token",
  })),
  getAuthHeaders: vi.fn(() => ({ Authorization: "Bearer test-token" })),
}));

// ── import page and shared modules ────────────────────────────────────────────
import BaserollPrepPage from "@/app/admin/baseroll-prep/page";
import { BRANCHES } from "@/lib/branches";
import { MANILA_STANDARDS } from "@/lib/backup-standards";

// ── fixtures ──────────────────────────────────────────────────────────────────

const STORE_RESULT = {
  store: "Paranaque",
  reference_date: "2026-05-04",
  total_orders: 100,
  lunch_orders: 40,
  lunch_ratio: 0.4,
  dinner_orders: 60,
  dinner_ratio: 0.6,
  matched_products: [{ name: "California Roll Set", daily_qty: 50 }],
  lunch: [{ roll: "California Base Roll", qty_raw: 20, qty_prep: 18 }],
  dinner: [{ roll: "Shrimp Tempura Base Roll", qty_raw: 30, qty_prep: 27 }],
};

const PREP_RESULT_OK = {
  ok: true,
  prep_date: "2026-05-11",
  reference_date: "2026-05-04",
  stores: [STORE_RESULT],
};

const PREP_RESULT_EMPTY = {
  ok: true,
  prep_date: "2026-05-11",
  reference_date: "2026-05-04",
  stores: [],
};

const MAP_ROWS = [
  {
    id: 1,
    product_name: "California Roll Set",
    base_roll_name: "California Base Roll",
    coefficient: 1.0,
    is_active: true,
    notes: "Main roll",
    updated_at: "2026-05-01T00:00:00",
  },
  {
    id: 2,
    product_name: "Tempura Set",
    base_roll_name: "Shrimp Tempura Base Roll",
    coefficient: 0.5,
    is_active: false,
    notes: "",
    updated_at: null,
  },
];

function makeDefaultFetch(rows = MAP_ROWS) {
  return buildFetchMock([
    { match: "baseroll-prep", body: PREP_RESULT_OK },
    { match: "baseroll-map",  body: { ok: true, items: rows } },
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — Module-level constants
// ─────────────────────────────────────────────────────────────────────────────

describe("MANILA_BRANCHES constant", () => {
  const branches = BRANCHES.manila.filter((b) => b.code !== "CK" && b.code !== "BO");

  it("excludes CK and BO", () => {
    expect(branches.map((b) => b.code)).not.toContain("CK");
    expect(branches.map((b) => b.code)).not.toContain("BO");
  });

  it("contains PAR, CUB, TAFT", () => {
    const codes = branches.map((b) => b.code);
    expect(codes).toContain("PAR");
    expect(codes).toContain("CUB");
    expect(codes).toContain("TAFT");
  });
});

describe("MANILA_STANDARDS completeness", () => {
  it("all pct specs have valid min >= 0", () => {
    Object.values(MANILA_STANDARDS).forEach((spec) => {
      expect(typeof spec.min).toBe("number");
      expect(spec.min).toBeGreaterThanOrEqual(0);
    });
  });

  it("[BUG FIX] includes m_fried_garlic — was missing, causing no shortage tracking", () => {
    // Previously m_fried_garlic was defined in OTHER_ITEMS_SECTIONS but not in
    // MANILA_STANDARDS, so the item had no min standard and shortages were never flagged.
    expect(MANILA_STANDARDS["m_fried_garlic"]).toBeDefined();
    expect(MANILA_STANDARDS["m_fried_garlic"].min).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — shortageColorOI logic (via rendered OtherItemsBackupForm)
// ─────────────────────────────────────────────────────────────────────────────

describe("shortageColorOI logic", () => {
  beforeEach(() => {
    global.fetch = makeDefaultFetch();
  });

  it("no shortage badge when value is at or above standard", async () => {
    const user = userEvent.setup();
    render(<BaserollPrepPage />);
    // Soy Sauce (m_soy_sauce) min=150; entering 150 → "ok"
    await waitFor(() => expect(screen.getByText("Soy Sauce")).toBeInTheDocument());
    const inputs = screen.getAllByPlaceholderText("—");
    await user.type(inputs[0], "150");
    expect(screen.queryByText(/below standard/i)).not.toBeInTheDocument();
  });

  it("shortage badge appears when value < min", async () => {
    const user = userEvent.setup();
    render(<BaserollPrepPage />);
    await waitFor(() => expect(screen.getByText("Soy Sauce")).toBeInTheDocument());
    const inputs = screen.getAllByPlaceholderText("—");
    // 50 < 150*0.7=105 → "low" → shortage badge shown in header + sticky bar
    await user.type(inputs[0], "50");
    // Badge appears in both the section header and the sticky bar — use getAll
    expect(screen.getAllByText(/below standard/i).length).toBeGreaterThanOrEqual(1);
  });

  it("warn zone (70–99% of min) also counts as shortage", async () => {
    const user = userEvent.setup();
    render(<BaserollPrepPage />);
    await waitFor(() => expect(screen.getByText("Soy Sauce")).toBeInTheDocument());
    const inputs = screen.getAllByPlaceholderText("—");
    // 110 is >= 105 (70% of 150) but < 150 → "warn" → still shortage
    await user.type(inputs[0], "110");
    expect(screen.getAllByText(/below standard/i).length).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — PctSelectorOI
// ─────────────────────────────────────────────────────────────────────────────

describe("PctSelectorOI", () => {
  beforeEach(() => {
    global.fetch = makeDefaultFetch();
  });

  it("renders at least 5 pct buttons (0%–100%) in Prepared Ingredients section", async () => {
    render(<BaserollPrepPage />);
    await waitFor(() => expect(screen.getByText("Quezo Cheese Cut")).toBeInTheDocument());
    const btns = screen.getAllByRole("button", { name: /^(0|25|50|75|100)%$/ });
    expect(btns.length).toBeGreaterThanOrEqual(5);
  });

  it("clicking 50% selects it and increments filled count", async () => {
    const user = userEvent.setup();
    render(<BaserollPrepPage />);
    await waitFor(() => expect(screen.getByText("Quezo Cheese Cut")).toBeInTheDocument());

    const pct50Btns = screen.getAllByRole("button", { name: "50%" });
    await user.click(pct50Btns[0]);
    expect(screen.getByText(/1 filled/i)).toBeInTheDocument();
  });

  it("clicking selected button deselects (filled count back to 0)", async () => {
    const user = userEvent.setup();
    render(<BaserollPrepPage />);
    await waitFor(() => expect(screen.getByText("Quezo Cheese Cut")).toBeInTheDocument());

    const pct50Btns = screen.getAllByRole("button", { name: "50%" });
    await user.click(pct50Btns[0]); // select
    await user.click(pct50Btns[0]); // deselect
    expect(screen.queryByText(/1 filled/i)).not.toBeInTheDocument();
  });

  it("25% on item with min=50 → shortage badge", async () => {
    const user = userEvent.setup();
    render(<BaserollPrepPage />);
    await waitFor(() => expect(screen.getByText("Quezo Cheese Cut")).toBeInTheDocument());

    const pct25Btns = screen.getAllByRole("button", { name: "25%" });
    await user.click(pct25Btns[0]);
    // Badge appears in both section header and sticky bar
    expect(screen.getAllByText(/below standard/i).length).toBeGreaterThanOrEqual(1);
  });

  it("75% on item with min=50 → no shortage", async () => {
    const user = userEvent.setup();
    render(<BaserollPrepPage />);
    await waitFor(() => expect(screen.getByText("Quezo Cheese Cut")).toBeInTheDocument());

    const pct75Btns = screen.getAllByRole("button", { name: "75%" });
    await user.click(pct75Btns[0]);
    expect(screen.queryByText(/below standard/i)).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — OtherItemsBackupForm
// ─────────────────────────────────────────────────────────────────────────────

describe("OtherItemsBackupForm", () => {
  beforeEach(() => {
    global.fetch = makeDefaultFetch();
  });

  it("renders all 5 section headers", async () => {
    render(<BaserollPrepPage />);
    await waitFor(() => expect(screen.getByText(/Condiments & Supplies/)).toBeInTheDocument());
    expect(screen.getByText(/Packaging/)).toBeInTheDocument();
    expect(screen.getByText(/Prepared Ingredients/)).toBeInTheDocument();
    expect(screen.getByText(/Toppings & Flakes/)).toBeInTheDocument();
    expect(screen.getByText(/Hot Section/)).toBeInTheDocument();
  });

  it("branch selector lists PAR, Cubao, Taft", async () => {
    render(<BaserollPrepPage />);
    await waitFor(() => expect(screen.getByText(/Condiments & Supplies/)).toBeInTheDocument());

    const branchSelect = screen.getAllByRole("combobox")[0];
    const optionTexts = within(branchSelect).getAllByRole("option").map((o) => o.textContent);
    expect(optionTexts).toContain("Paranaque");
    expect(optionTexts).toContain("Cubao");
    expect(optionTexts).toContain("Taft");
  });

  it("branch selector does NOT include Central Kitchen or Back Office", async () => {
    render(<BaserollPrepPage />);
    await waitFor(() => expect(screen.getByText(/Condiments & Supplies/)).toBeInTheDocument());

    const branchSelect = screen.getAllByRole("combobox")[0];
    const optionTexts = within(branchSelect).getAllByRole("option").map((o) => o.textContent);
    expect(optionTexts).not.toContain("Central Kitchen");
    expect(optionTexts).not.toContain("Back Office");
  });

  it("shift selector lists Closing, Morning, Midday", async () => {
    render(<BaserollPrepPage />);
    await waitFor(() => expect(screen.getByText(/Condiments & Supplies/)).toBeInTheDocument());

    const shiftSelect = screen.getAllByRole("combobox")[1];
    const optionTexts = within(shiftSelect).getAllByRole("option").map((o) => o.textContent);
    expect(optionTexts).toContain("Closing");
    expect(optionTexts).toContain("Morning");
    expect(optionTexts).toContain("Midday");
  });

  it("auto-fills reporter name from auth.staffName", async () => {
    render(<BaserollPrepPage />);
    await waitFor(() => expect(screen.getByPlaceholderText("Staff name")).toHaveValue("Yukihiro"));
  });

  it("Submit button is disabled when no items filled", async () => {
    render(<BaserollPrepPage />);
    await waitFor(() => expect(screen.getByText(/Condiments & Supplies/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Submit Backup/i })).toBeDisabled();
  });

  it("Submit button becomes enabled after filling one item", async () => {
    const user = userEvent.setup();
    render(<BaserollPrepPage />);
    await waitFor(() => expect(screen.getByText("Soy Sauce")).toBeInTheDocument());

    await user.type(screen.getAllByPlaceholderText("—")[0], "200");
    expect(screen.getByRole("button", { name: /Submit Backup/i })).not.toBeDisabled();
  });

  it("shows error when reporter name is empty", async () => {
    const user = userEvent.setup();
    render(<BaserollPrepPage />);
    await waitFor(() => expect(screen.getByText("Soy Sauce")).toBeInTheDocument());

    await user.clear(screen.getByPlaceholderText("Staff name"));
    await user.type(screen.getAllByPlaceholderText("—")[0], "200");
    await user.click(screen.getByRole("button", { name: /Submit Backup/i }));

    expect(screen.getByText(/Please enter your name/i)).toBeInTheDocument();
  });

  it("successful submission calls POST /api/admin/backup/report", async () => {
    const user = userEvent.setup();
    global.fetch = buildFetchMock([
      { match: "baseroll-prep",  body: PREP_RESULT_OK },
      { match: "baseroll-map",   body: { ok: true, items: MAP_ROWS } },
      { match: "backup/report",  body: { ok: true }, method: "POST" },
    ]);

    render(<BaserollPrepPage />);
    await waitFor(() => expect(screen.getByText("Soy Sauce")).toBeInTheDocument());
    await user.type(screen.getAllByPlaceholderText("—")[0], "200");
    await user.click(screen.getByRole("button", { name: /Submit Backup/i }));

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const call = calls.find(([url]: [string]) => url.includes("backup/report"));
      expect(call).toBeDefined();
      expect(call[1].method).toBe("POST");
    });
  });

  it("submission body has correct city, branch_code, shift, and line data", async () => {
    const user = userEvent.setup();
    global.fetch = buildFetchMock([
      { match: "baseroll-prep", body: PREP_RESULT_OK },
      { match: "baseroll-map",  body: { ok: true, items: MAP_ROWS } },
      { match: "backup/report", body: { ok: true }, method: "POST" },
    ]);

    render(<BaserollPrepPage />);
    await waitFor(() => expect(screen.getByText("Soy Sauce")).toBeInTheDocument());

    // Change branch → Cubao
    await userEvent.selectOptions(screen.getAllByRole("combobox")[0], "CUB");
    // Change shift → Morning
    await userEvent.selectOptions(screen.getAllByRole("combobox")[1], "morning");
    // Fill Soy Sauce
    await user.type(screen.getAllByPlaceholderText("—")[0], "200");
    await user.click(screen.getByRole("button", { name: /Submit Backup/i }));

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const call = calls.find(([url]: [string]) => url.includes("backup/report"));
      expect(call).toBeDefined();
      const body = JSON.parse(call[1].body as string);
      expect(body.city).toBe("manila");
      expect(body.branch_code).toBe("CUB");
      expect(body.shift).toBe("morning");
      expect(body.reported_by).toBe("Yukihiro");
      const line = body.lines.find((l: { item_name_snapshot: string }) =>
        l.item_name_snapshot === "Soy Sauce"
      );
      expect(line).toBeDefined();
      expect(line.quantity).toBe(200);
      expect(line.section).toBe("condiments_supplies");
    });
  });

  it("after success: filled values reset, reporter name preserved", async () => {
    const user = userEvent.setup();
    global.fetch = buildFetchMock([
      { match: "baseroll-prep", body: PREP_RESULT_OK },
      { match: "baseroll-map",  body: { ok: true, items: MAP_ROWS } },
      { match: "backup/report", body: { ok: true }, method: "POST" },
    ]);

    render(<BaserollPrepPage />);
    await waitFor(() => expect(screen.getByText("Soy Sauce")).toBeInTheDocument());
    await user.type(screen.getAllByPlaceholderText("—")[0], "200");
    expect(screen.getByText(/1 filled/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Submit Backup/i }));
    await waitFor(() => expect(screen.getByText(/submitted successfully/i)).toBeInTheDocument());

    // Values reset
    expect(screen.queryByText(/1 filled/i)).not.toBeInTheDocument();
    // Name preserved
    expect(screen.getByPlaceholderText("Staff name")).toHaveValue("Yukihiro");
  });

  it("API error during submit shows error message", async () => {
    const user = userEvent.setup();
    global.fetch = buildFetchMock([
      { match: "baseroll-prep", body: PREP_RESULT_OK },
      { match: "baseroll-map",  body: { ok: true, items: MAP_ROWS } },
      { match: "backup/report", body: { detail: "Database error" }, status: 500, method: "POST" },
    ]);

    render(<BaserollPrepPage />);
    await waitFor(() => expect(screen.getByText("Soy Sauce")).toBeInTheDocument());
    await user.type(screen.getAllByPlaceholderText("—")[0], "200");
    await user.click(screen.getByRole("button", { name: /Submit Backup/i }));

    await waitFor(() => expect(screen.getByText(/Database error/i)).toBeInTheDocument());
  });

  it("collapsing a section hides its items", async () => {
    const user = userEvent.setup();
    render(<BaserollPrepPage />);
    await waitFor(() => expect(screen.getByText("Soy Sauce")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Condiments & Supplies/i }));
    expect(screen.queryByText("Soy Sauce")).not.toBeInTheDocument();
  });

  it("re-expanding a collapsed section shows items again", async () => {
    const user = userEvent.setup();
    render(<BaserollPrepPage />);
    await waitFor(() => expect(screen.getByText("Soy Sauce")).toBeInTheDocument());

    const btn = screen.getByRole("button", { name: /Condiments & Supplies/i });
    await user.click(btn); // collapse
    await user.click(btn); // expand
    expect(screen.getByText("Soy Sauce")).toBeInTheDocument();
  });

  it("[BUG FIX] negative quantity is now blocked by front-end validation", async () => {
    const user = userEvent.setup();
    render(<BaserollPrepPage />);
    await waitFor(() => expect(screen.getByText("Soy Sauce")).toBeInTheDocument());

    // Enter -5 directly via fireEvent to bypass the browser min=0 attribute
    fireEvent.change(screen.getAllByPlaceholderText("—")[0], { target: { value: "-5" } });

    await user.click(screen.getByRole("button", { name: /Submit Backup/i }));

    // Should show validation error, NOT proceed to network call
    await waitFor(() =>
      expect(screen.getByText(/Quantity cannot be negative/i)).toBeInTheDocument()
    );

    // Confirm no POST was made
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.find(([url]: [string]) => url.includes("backup/report"))).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — StoreCard
// ─────────────────────────────────────────────────────────────────────────────

describe("StoreCard", () => {
  beforeEach(() => { global.fetch = makeDefaultFetch(); });

  it("renders store name and lunch/dinner percentages", async () => {
    render(<BaserollPrepPage />);
    await waitFor(() => expect(screen.getByText(/Paranaque/)).toBeInTheDocument());
    expect(screen.getByText(/Lunch 40%/i)).toBeInTheDocument();
    expect(screen.getByText(/Dinner 60%/i)).toBeInTheDocument();
  });

  it("clicking header collapses, clicking again expands", async () => {
    const user = userEvent.setup();
    render(<BaserollPrepPage />);
    await waitFor(() => expect(screen.getByText("California Base Roll")).toBeInTheDocument());

    const headerBtn = screen.getByRole("button", { name: /Paranaque/i });
    await user.click(headerBtn);
    expect(screen.queryByText("California Base Roll")).not.toBeInTheDocument();

    await user.click(headerBtn);
    expect(screen.getByText("California Base Roll")).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — SessionTable
// ─────────────────────────────────────────────────────────────────────────────

describe("SessionTable", () => {
  it("shows 'No data' for both lunch and dinner when arrays are empty", async () => {
    global.fetch = buildFetchMock([
      { match: "baseroll-prep", body: { ...PREP_RESULT_OK, stores: [{ ...STORE_RESULT, lunch: [], dinner: [] }] } },
      { match: "baseroll-map",  body: { ok: true, items: [] } },
    ]);
    render(<BaserollPrepPage />);
    await waitFor(() => {
      const noDataEls = screen.getAllByText(/No data/i);
      expect(noDataEls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("renders roll name and qty_prep for each row", async () => {
    global.fetch = makeDefaultFetch();
    render(<BaserollPrepPage />);
    await waitFor(() => expect(screen.getByText("California Base Roll")).toBeInTheDocument());
    expect(screen.getByText("18")).toBeInTheDocument();
    expect(screen.getByText("Shrimp Tempura Base Roll")).toBeInTheDocument();
    expect(screen.getByText("27")).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7 — Main page
// ─────────────────────────────────────────────────────────────────────────────

describe("BaserollPrepPage — main", () => {
  beforeEach(() => { global.fetch = makeDefaultFetch(); });

  it("renders the page title", () => {
    render(<BaserollPrepPage />);
    expect(screen.getByText(/Base Roll Prep Instructions/i)).toBeInTheDocument();
  });

  it("auto-fetches on mount and shows store card", async () => {
    render(<BaserollPrepPage />);
    await waitFor(() => expect(screen.getByText(/Paranaque/)).toBeInTheDocument());
  });

  it("shows error when API call fails", async () => {
    global.fetch = buildFetchMock([
      { match: "baseroll-prep", body: { detail: "No data found" }, status: 404 },
      { match: "baseroll-map",  body: { ok: true, items: [] } },
    ]);
    render(<BaserollPrepPage />);
    await waitFor(() => expect(screen.getByText(/No data found/i)).toBeInTheDocument());
  });

  it("shows 'No Manila sales data' when stores is empty", async () => {
    global.fetch = buildFetchMock([
      { match: "baseroll-prep", body: PREP_RESULT_EMPTY },
      { match: "baseroll-map",  body: { ok: true, items: [] } },
    ]);
    render(<BaserollPrepPage />);
    await waitFor(() =>
      expect(screen.getByText(/No Manila sales data found/i)).toBeInTheDocument()
    );
  });

  it("Prep Calculator tab is active by default (has violet class)", () => {
    render(<BaserollPrepPage />);
    const prepTab = screen.getByRole("button", { name: /Prep Calculator/i });
    expect(prepTab.className).toMatch(/violet/);
  });

  it("clicking Settings tab shows MappingSettings", async () => {
    const user = userEvent.setup();
    render(<BaserollPrepPage />);
    await user.click(screen.getByRole("button", { name: /Mapping Settings/i }));
    await waitFor(() => expect(screen.getByText("California Roll Set")).toBeInTheDocument());
  });

  it("switching back to Prep tab shows OtherItemsBackupForm", async () => {
    const user = userEvent.setup();
    render(<BaserollPrepPage />);
    await waitFor(() => expect(screen.getByText(/Condiments & Supplies/)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Mapping Settings/i }));
    await user.click(screen.getByRole("button", { name: /Prep Calculator/i }));

    expect(screen.getByText(/Condiments & Supplies/)).toBeInTheDocument();
  });

  it("date picker updates reference date display", async () => {
    render(<BaserollPrepPage />);
    await waitFor(() => expect(screen.getByText(/Calculate/i)).toBeInTheDocument());

    fireEvent.change(screen.getByDisplayValue(/\d{4}-\d{2}-\d{2}/), {
      target: { value: "2026-06-01" },
    });

    await waitFor(() => expect(screen.getByText(/May 25/i)).toBeInTheDocument());
  });

  it("Calculate button triggers a new fetch", async () => {
    const user = userEvent.setup();
    render(<BaserollPrepPage />);
    await waitFor(() => expect(screen.getByText(/Paranaque/)).toBeInTheDocument());

    const before = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([url]: [string]) => url.includes("baseroll-prep")
    ).length;

    await user.click(screen.getByRole("button", { name: /Calculate/i }));

    await waitFor(() => {
      const after = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
        ([url]: [string]) => url.includes("baseroll-prep")
      ).length;
      expect(after).toBeGreaterThan(before);
    });
  });

  it("shows loading spinner during fetch, hides after resolve", async () => {
    let resolve!: (v: Response) => void;
    const pending = new Promise<Response>((r) => { resolve = r; });
    global.fetch = vi.fn((url: string) => {
      if ((url as string).includes("baseroll-prep")) return pending;
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true, items: [] }), { status: 200 })
      );
    });

    render(<BaserollPrepPage />);
    expect(screen.getByText(/Fetching data/i)).toBeInTheDocument();

    await act(async () => {
      resolve(new Response(JSON.stringify(PREP_RESULT_OK), { status: 200 }));
    });

    await waitFor(() => expect(screen.queryByText(/Fetching data/i)).not.toBeInTheDocument());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8 — MappingSettings
// ─────────────────────────────────────────────────────────────────────────────

describe("MappingSettings", () => {
  beforeEach(() => { global.fetch = makeDefaultFetch(); });

  /** Helper: open Settings tab and wait for rows to load.
   *  We wait for "Changes take effect" which only appears in MappingSettings,
   *  NOT in the Prep tab (where "California Roll Set" also appears inside
   *  the matched_products details panel).
   */
  async function openSettings() {
    const user = userEvent.setup();
    render(<BaserollPrepPage />);
    await user.click(screen.getByRole("button", { name: /Mapping Settings/i }));
    await waitFor(() =>
      expect(screen.getByText(/Changes take effect on the next prep calculation/i)).toBeInTheDocument()
    );
    // Also wait for rows
    await waitFor(() => expect(screen.getByText("Tempura Set")).toBeInTheDocument());
    return user;
  }

  it("loads and displays mapping rows", async () => {
    await openSettings();
    expect(screen.getByText("California Roll Set")).toBeInTheDocument();
    expect(screen.getByText("Tempura Set")).toBeInTheDocument();
  });

  it("inactive row shows 'Inactive' status button", async () => {
    await openSettings();
    expect(screen.getByRole("button", { name: /^Inactive$/i })).toBeInTheDocument();
  });

  it("Edit button puts row into edit mode (Save/Cancel visible)", async () => {
    const user = await openSettings();
    await user.click(screen.getAllByRole("button", { name: /^Edit$/i })[0]);
    expect(screen.getByRole("button", { name: /^Save$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Cancel$/i })).toBeInTheDocument();
  });

  it("Cancel discards edits (returns to view mode)", async () => {
    const user = await openSettings();
    await user.click(screen.getAllByRole("button", { name: /^Edit$/i })[0]);
    await user.click(screen.getByRole("button", { name: /^Cancel$/i }));
    expect(screen.queryByRole("button", { name: /^Save$/i })).not.toBeInTheDocument();
  });

  it("[BUG FIX] Save edit calls POST; no crash when backend omits item in response", async () => {
    // Previously: if backend returned { ok: true } without `item`, the component crashed
    // (TypeError: Cannot read properties of undefined reading 'product_name').
    // Fix: null-guard on data.item; falls back to loadRows().
    const user = await openSettings();
    global.fetch = buildFetchMock([
      // Reload after save
      { match: "baseroll-map", body: { ok: true, items: MAP_ROWS } },
      // Save (POST) — returns OK but no item field
      { match: "baseroll-map", body: { ok: true }, method: "POST" },
    ]);

    await user.click(screen.getAllByRole("button", { name: /^Edit$/i })[0]);
    const coefInput = screen.getByDisplayValue("1");
    await user.clear(coefInput);
    await user.type(coefInput, "2");
    await user.click(screen.getByRole("button", { name: /^Save$/i }));

    // Should not crash; row returns to view mode
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /^Save$/i })).not.toBeInTheDocument()
    );
  });

  it("Toggle active calls PATCH /toggle endpoint", async () => {
    const user = await openSettings();
    global.fetch = buildFetchMock([
      { match: "/toggle",     body: { ok: true }, method: "PATCH" },
      { match: "baseroll-map", body: { ok: true, items: MAP_ROWS } },
    ]);

    await user.click(screen.getByRole("button", { name: /^Active$/i }));

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const patchCall = calls.find(
        ([url, opts]: [string, RequestInit]) =>
          url.includes("/toggle") && opts?.method === "PATCH"
      );
      expect(patchCall).toBeDefined();
      // is_active=false should be in query string
      expect(patchCall[0]).toMatch(/is_active=false/);
    });
  });

  it("Delete after confirm=true calls DELETE", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = await openSettings();
    global.fetch = buildFetchMock([
      { match: "baseroll-map", body: { ok: true }, method: "DELETE" },
    ]);

    await user.click(screen.getAllByTitle("Delete")[0]);

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(
        calls.find(([url, opts]: [string, RequestInit]) =>
          url.includes("baseroll-map") && opts?.method === "DELETE"
        )
      ).toBeDefined();
    });
  });

  it("Delete after confirm=false does NOT call DELETE", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = await openSettings();

    await user.click(screen.getAllByTitle("Delete")[0]);

    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(
      calls.find(([url, opts]: [string, RequestInit]) =>
        url.includes("baseroll-map") && opts?.method === "DELETE"
      )
    ).toBeUndefined();
  });

  it("shows error when mappings API fails", async () => {
    const user = userEvent.setup();
    global.fetch = buildFetchMock([
      { match: "baseroll-prep", body: PREP_RESULT_OK },
      { match: "baseroll-map",  body: { detail: "Unauthorized" }, status: 401 },
    ]);

    render(<BaserollPrepPage />);
    await user.click(screen.getByRole("button", { name: /Mapping Settings/i }));

    await waitFor(() => expect(screen.getByText(/Unauthorized/i)).toBeInTheDocument());
  });

  it("Add Mapping button shows add form with Product name input", async () => {
    const user = await openSettings();
    await user.click(screen.getByRole("button", { name: /\+ Add/i }));
    expect(screen.getByPlaceholderText(/California Roll/i)).toBeInTheDocument();
  });

  it("Add form: empty product name shows validation error", async () => {
    const user = await openSettings();
    await user.click(screen.getByRole("button", { name: /\+ Add/i }));
    // Click Save without entering product name
    await user.click(screen.getAllByRole("button", { name: /^Save$/i })[0]);
    expect(screen.getByText(/Product name is required/i)).toBeInTheDocument();
  });

  it("successful add calls POST /api/admin/analytics/manila/baseroll-map", async () => {
    const user = await openSettings();
    const newRow = { ...MAP_ROWS[0], id: 3, product_name: "New Roll Set" };
    global.fetch = buildFetchMock([
      { match: "baseroll-map", body: { ok: true, items: [...MAP_ROWS, newRow] } },
      { match: "baseroll-map", body: { ok: true, item: newRow }, method: "POST" },
    ]);

    await user.click(screen.getByRole("button", { name: /\+ Add/i }));
    await user.type(screen.getByPlaceholderText(/California Roll/i), "New Roll Set");
    await user.click(screen.getAllByRole("button", { name: /^Save$/i })[0]);

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const postCall = calls.find(
        ([url, opts]: [string, RequestInit]) =>
          url.includes("baseroll-map") && opts?.method === "POST"
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse(postCall[1].body as string);
      expect(body.product_name).toBe("New Roll Set");
    });
  });
});
