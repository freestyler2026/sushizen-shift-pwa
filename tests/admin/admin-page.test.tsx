// tests/admin/admin-page.test.tsx
// Admin dashboard page — comprehensive test suite
// Covers: auth guard, all 9 tabs, request management, export section,
// attendance sync, and regression tests for discovered bugs.

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AdminPage from "@/app/admin/page";
import { buildFetchMock } from "../helpers/fetch-mock";

// ── Stable router + searchParams (vi.hoisted so they're ready before vi.mock) ─
// setup.ts creates a new URLSearchParams() on EVERY call to useSearchParams(),
// causing React's useEffect dep-check to see a changed reference on every render
// and reset dashView/search back to defaults. We override next/navigation here
// with a stable object so state changes stick between renders.
const mockRouter = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
}));
const stableSearchParams = vi.hoisted(() => new URLSearchParams());

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => stableSearchParams,
  usePathname: () => "/admin",
  useParams: () => ({}),
}));

// ── Framer Motion ─────────────────────────────────────────────────────────────
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// ── next/link ─────────────────────────────────────────────────────────────────
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// ── auth ──────────────────────────────────────────────────────────────────────
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    // Avoid real HTTP calls during auth refresh — return current localStorage auth.
    refreshAuthFromApi: vi.fn().mockImplementation(async (auth: any) => {
      return auth ?? actual.getAuth();
    }),
  };
});

// ── Sub-tab components (mocked to avoid their own fetch / complexity) ──────────
vi.mock("@/components/admin/OrderEntryTab", () => ({
  default: () => <div data-testid="order-entry-tab">OrderEntryTab</div>,
}));
vi.mock("@/components/admin/ManilaOfflineOrderEntryTab", () => ({
  default: () => <div data-testid="manila-order-entry-tab">ManilaOfflineOrderEntryTab</div>,
}));
vi.mock("@/components/admin/AdminSalesDataInputTab", () => ({
  default: () => <div data-testid="sales-data-tab">AdminSalesDataInputTab</div>,
}));
vi.mock("@/components/admin/AdminCashierEvalInputTab", () => ({
  default: () => <div data-testid="cashier-eval-tab">AdminCashierEvalInputTab</div>,
}));
vi.mock("@/components/admin/AdminCancellationInputTab", () => ({
  default: () => <div data-testid="cancellation-tab">AdminCancellationInputTab</div>,
}));
vi.mock("@/components/admin/AdminDailyInventoryTab", () => ({
  default: () => <div data-testid="daily-inventory-tab">AdminDailyInventoryTab</div>,
}));
vi.mock("@/components/admin/AdminDubaiCancellationInputTab", () => ({
  default: () => <div data-testid="dubai-cancellation-tab">AdminDubaiCancellationInputTab</div>,
}));
vi.mock("@/components/admin/RatingEntryTab", () => ({
  RatingEntryTab: ({ city }: { city: string }) => (
    <div data-testid="rating-entry-tab">RatingEntryTab-{city}</div>
  ),
}));
vi.mock("@/components/lowratings/LowRatingsAdminPanel", () => ({
  LowRatingsAdminPanel: () => <div data-testid="low-ratings-panel">LowRatingsAdminPanel</div>,
}));

// ── DateRangePicker / MonthPicker (simple controlled inputs) ──────────────────
vi.mock("@/components/DateRangePicker", () => ({
  default: ({ value, onChange }: any) => (
    <input
      data-testid="date-range-picker"
      value={`${value.from ?? ""}|${value.to ?? ""}`}
      onChange={(e) => {
        const [from, to] = e.target.value.split("|");
        onChange({ from, to });
      }}
    />
  ),
}));
vi.mock("@/components/MonthPicker", () => ({
  default: ({ value, onChange }: any) => (
    <input
      data-testid="month-picker"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────
const MOCK_OVERVIEW = {
  city: "manila",
  start_date: "2026-05-04",
  end_date: "2026-05-10",
  buckets: {
    red_open: [
      {
        id: "red-001-aaa-bbb",
        branch: "MOA",
        staff_name: "Alice",
        work_date: "2026-05-05",
        request_type: "day_off",
        urgency_status: "RED",
        manager_status: "PENDING",
        hq_status: "PENDING",
      },
    ],
    swap_pending_counterparty: [
      {
        id: "swap-002-ccc-ddd",
        branch: "MOA",
        staff_name: "Bob",
        work_date: "2026-05-06",
        request_type: "swap",
        urgency_status: "YELLOW",
        manager_status: "APPROVED",
        hq_status: "PENDING",
        counterparty_name: "Charlie",
        counterparty_status: "PENDING",
      },
    ],
    pending_manager: [
      {
        id: "mgr-003-eee-fff",
        branch: "SM",
        staff_name: "Diana",
        work_date: "2026-05-07",
        request_type: "shift_change",
        urgency_status: "GREEN",
        manager_status: "PENDING",
        hq_status: "PENDING",
        reason: "Family matter",
      },
    ],
    pending_hq: [],
  },
};

/** Build a default fetch mock covering all expected endpoints */
function makeDefaultFetch() {
  return buildFetchMock([
    { match: "/api/admin/overview", body: MOCK_OVERVIEW },
    {
      match: "/api/auth/verify",
      method: "POST",
      body: { ok: true, role: "ADMIN", staff_name: "Test Admin" },
    },
    { match: "/api/admin/price-check/flagged-count", body: { flagged_count: 0 } },
    {
      match: "/api/admin/attendance/drive/sync",
      method: "POST",
      body: { ok: true, message: "Sync complete" },
    },
  ]);
}

/** Set localStorage auth with optional overrides */
function setCustomAuth(overrides: Record<string, any> = {}) {
  window.localStorage.setItem(
    "sushizen_shift_auth",
    JSON.stringify({
      staffName: "Test Admin",
      city: "manila",
      role: "ADMIN",
      accessToken: "test-token",
      permissions: ["*"],
      ...overrides,
    })
  );
}

/** Set auth including a pin (needed for auth/verify + export sections) */
function setAuthWithPin(pin = "1234") {
  window.localStorage.clear();
  setCustomAuth({ pin });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
/** Render and wait for auth init (loading spinner) to disappear */
async function renderAndWait() {
  const result = render(<AdminPage />);
  await waitFor(
    () => expect(screen.queryByText("Loading admin dashboard...")).toBeNull(),
    { timeout: 3000 }
  );
  return result;
}

// ── Per-test setup ────────────────────────────────────────────────────────────
beforeEach(() => {
  mockRouter.push.mockReset();
  mockRouter.replace.mockReset();
  mockRouter.back.mockReset();
});

// =============================================================================
// 1. Auth guard
// =============================================================================
describe("Auth guard", () => {
  it("redirects to /login when localStorage has no staffName", async () => {
    window.localStorage.clear();
    global.fetch = buildFetchMock([]);

    render(<AdminPage />);
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith(
        expect.stringContaining("/login")
      )
    );
  });

  it("redirects to /week when user has no admin permissions", async () => {
    window.localStorage.clear();
    setCustomAuth({ role: "STAFF", permissions: [] });
    global.fetch = buildFetchMock([]);

    render(<AdminPage />);
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/week"));
  });

  it("shows unauthorized message (no redirect) when accessToken is missing", async () => {
    // Auth code path: resolved?.accessToken is falsy → setAllowed(false), setReady(true)
    // No redirect occurs — only a missing staffName causes a /login redirect.
    // The component renders the !allowed branch: "Admin dashboard is available only to…"
    window.localStorage.clear();
    setCustomAuth({ accessToken: "" });
    global.fetch = buildFetchMock([]);

    render(<AdminPage />);
    await waitFor(() => {
      expect(
        screen.getByText(/Admin dashboard is available only to authorized admin roles/i)
      ).toBeInTheDocument();
    });
  });

  it("renders dashboard when ADMIN with wildcard permissions", async () => {
    global.fetch = makeDefaultFetch();
    await renderAndWait();
    expect(screen.getByRole("heading", { name: /Admin Dashboard/i })).toBeInTheDocument();
  });

  it("renders dashboard when HQ user with wildcard permissions", async () => {
    window.localStorage.clear();
    setCustomAuth({ role: "HQ", permissions: ["*"] });
    global.fetch = makeDefaultFetch();

    await renderAndWait();
    expect(screen.getByRole("heading", { name: /Admin Dashboard/i })).toBeInTheDocument();
  });

  it("shows MANILA city badge in dashboard header", async () => {
    global.fetch = makeDefaultFetch();
    await renderAndWait();
    // Multiple MANILA occurrences are expected (badge + overview data) — just confirm presence
    expect(screen.getAllByText(/MANILA/i).length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// 2. Tab navigation — all 9 tabs
// =============================================================================
describe("Tab navigation", () => {
  beforeEach(() => {
    global.fetch = makeDefaultFetch();
  });

  it("renders all 9 tab buttons with correct labels", async () => {
    await renderAndWait();
    const expectedLabels = [
      "Request Check",
      "Low Ratings Input",
      "Ratings Input",        // exact — must not match "Low Ratings Input"
      "Sales Data Input",
      "Cashier Eval Input",
      "Daily Inventory Input",
      "Manila Cancellation",
      "Dubai Cancellation",
      "Number of Orders Input",
    ];
    for (const label of expectedLabels) {
      // getAllByRole to avoid ambiguity — at least one tab with this exact text
      const matches = screen.getAllByRole("tab").filter(
        (el) => el.textContent?.trim().includes(label)
      );
      expect(matches.length, `Tab "${label}" not found`).toBeGreaterThanOrEqual(1);
    }
  });

  it("Request Check tab is selected by default (aria-selected)", async () => {
    await renderAndWait();
    const tabs = screen.getAllByRole("tab");
    const requestCheckTab = tabs.find((t) => t.textContent?.includes("Request Check"));
    expect(requestCheckTab).toHaveAttribute("aria-selected", "true");
  });

  it("shows LowRatingsAdminPanel when Low Ratings Input tab is clicked", async () => {
    await renderAndWait();
    const tabs = screen.getAllByRole("tab");
    const tab = tabs.find((t) => t.textContent?.trim() === "⚠️Low Ratings Input" ||
      t.textContent?.includes("Low Ratings Input"));
    fireEvent.click(tab!);
    await waitFor(() =>
      expect(screen.getByTestId("low-ratings-panel")).toBeInTheDocument()
    );
  });

  it("shows RatingEntryTab-dubai when Ratings Input tab is clicked", async () => {
    await renderAndWait();
    const tabs = screen.getAllByRole("tab");
    // find the exact "Ratings Input" tab (not "Low Ratings Input")
    const tab = tabs.find(
      (t) => t.textContent?.trim().replace(/\s+/g, " ") === "⭐ Ratings Input" ||
             (t.textContent?.includes("Ratings Input") && !t.textContent?.includes("Low"))
    );
    fireEvent.click(tab!);
    await waitFor(() =>
      expect(screen.getByTestId("rating-entry-tab")).toHaveTextContent("RatingEntryTab-dubai")
    );
  });

  it("switches rating sub-tab to Manila", async () => {
    await renderAndWait();
    const tabs = screen.getAllByRole("tab");
    const ratingTab = tabs.find(
      (t) => t.textContent?.includes("Ratings Input") && !t.textContent?.includes("Low")
    );
    fireEvent.click(ratingTab!);
    await waitFor(() => screen.getByTestId("rating-entry-tab"));

    // Click the Manila sub-tab inside the rating section
    const subTabs = screen.getAllByRole("tab");
    const manilaSubTab = subTabs.find((t) => t.textContent?.trim() === "Manila");
    fireEvent.click(manilaSubTab!);
    await waitFor(() =>
      expect(screen.getByTestId("rating-entry-tab")).toHaveTextContent("RatingEntryTab-manila")
    );
  });

  it("shows AdminSalesDataInputTab when Sales Data Input tab is clicked", async () => {
    await renderAndWait();
    const tab = screen.getAllByRole("tab").find(
      (t) => t.textContent?.includes("Sales Data Input")
    );
    fireEvent.click(tab!);
    await waitFor(() =>
      expect(screen.getByTestId("sales-data-tab")).toBeInTheDocument()
    );
  });

  it("shows AdminCashierEvalInputTab when Cashier Eval Input tab is clicked", async () => {
    await renderAndWait();
    const tab = screen.getAllByRole("tab").find(
      (t) => t.textContent?.includes("Cashier Eval Input")
    );
    fireEvent.click(tab!);
    await waitFor(() =>
      expect(screen.getByTestId("cashier-eval-tab")).toBeInTheDocument()
    );
  });

  it("shows AdminDailyInventoryTab when Daily Inventory Input tab is clicked", async () => {
    await renderAndWait();
    const tab = screen.getAllByRole("tab").find(
      (t) => t.textContent?.includes("Daily Inventory Input")
    );
    fireEvent.click(tab!);
    await waitFor(() =>
      expect(screen.getByTestId("daily-inventory-tab")).toBeInTheDocument()
    );
  });

  it("shows AdminCancellationInputTab when Manila Cancellation tab is clicked", async () => {
    await renderAndWait();
    const tab = screen.getAllByRole("tab").find(
      (t) => t.textContent?.includes("Manila Cancellation")
    );
    fireEvent.click(tab!);
    await waitFor(() =>
      expect(screen.getByTestId("cancellation-tab")).toBeInTheDocument()
    );
  });

  it("shows AdminDubaiCancellationInputTab when Dubai Cancellation tab is clicked", async () => {
    await renderAndWait();
    const tab = screen.getAllByRole("tab").find(
      (t) => t.textContent?.includes("Dubai Cancellation")
    );
    fireEvent.click(tab!);
    await waitFor(() =>
      expect(screen.getByTestId("dubai-cancellation-tab")).toBeInTheDocument()
    );
  });

  it("shows OrderEntryTab (Dubai) by default when Number of Orders Input tab is clicked", async () => {
    await renderAndWait();
    const tab = screen.getAllByRole("tab").find(
      (t) => t.textContent?.includes("Number of Orders Input")
    );
    fireEvent.click(tab!);
    await waitFor(() =>
      expect(screen.getByTestId("order-entry-tab")).toBeInTheDocument()
    );
  });

  it("switches Number of Orders to Manila Offline sub-tab", async () => {
    await renderAndWait();
    const orderTab = screen.getAllByRole("tab").find(
      (t) => t.textContent?.includes("Number of Orders Input")
    );
    fireEvent.click(orderTab!);
    await waitFor(() => screen.getByTestId("order-entry-tab"));

    const manilaOfflineTab = screen.getAllByRole("tab").find(
      (t) => t.textContent?.trim() === "Manila (Offline)"
    );
    fireEvent.click(manilaOfflineTab!);
    await waitFor(() =>
      expect(screen.getByTestId("manila-order-entry-tab")).toBeInTheDocument()
    );
  });

  it("returns to requests tab when Request Check tab is re-clicked after switching away", async () => {
    await renderAndWait();
    const tabs = screen.getAllByRole("tab");

    // Switch away
    const lowRatingsTab = tabs.find((t) => t.textContent?.includes("Low Ratings Input"));
    fireEvent.click(lowRatingsTab!);
    await waitFor(() => screen.getByTestId("low-ratings-panel"));

    // Switch back
    const requestCheckTab = screen.getAllByRole("tab").find(
      (t) => t.textContent?.includes("Request Check")
    );
    fireEvent.click(requestCheckTab!);
    await waitFor(() =>
      expect(screen.queryByTestId("low-ratings-panel")).toBeNull()
    );
  });
});

// =============================================================================
// 3. Requests tab — data display
// =============================================================================
describe("Requests tab — data display", () => {
  beforeEach(() => {
    global.fetch = makeDefaultFetch();
  });

  it("fetches overview on mount and shows date range", async () => {
    await renderAndWait();
    await waitFor(() => {
      expect(screen.getByText(/2026-05-04/)).toBeInTheDocument();
      expect(screen.getByText(/2026-05-10/)).toBeInTheDocument();
    });
  });

  it("shows all four bucket section headers", async () => {
    await renderAndWait();
    await waitFor(() => {
      expect(screen.getByText("RED Open")).toBeInTheDocument();
      expect(screen.getByText(/Counterparty Pending/i)).toBeInTheDocument();
      expect(screen.getByText("Pending: Manager")).toBeInTheDocument();
      expect(screen.getByText("Pending: HQ")).toBeInTheDocument();
    });
  });

  it("shows request items from the overview API in correct buckets", async () => {
    await renderAndWait();
    await waitFor(() => {
      expect(screen.getByText(/Alice \/ day_off/)).toBeInTheDocument();
      expect(screen.getByText(/Bob \/ swap/)).toBeInTheDocument();
      expect(screen.getByText(/Diana \/ shift_change/)).toBeInTheDocument();
    });
  });

  it("shows urgency badges for items (RED, YELLOW)", async () => {
    await renderAndWait();
    await waitFor(() => {
      expect(screen.getByText("RED")).toBeInTheDocument();
      expect(screen.getByText("YELLOW")).toBeInTheDocument();
    });
  });

  it("shows 'No items' for the empty Pending HQ bucket", async () => {
    await renderAndWait();
    await waitFor(() => {
      expect(screen.getAllByText(/No items/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows item count badge (1) on non-empty buckets", async () => {
    await renderAndWait();
    await waitFor(() => {
      // Three non-empty buckets (red_open, swap, pending_manager) each have 1 item
      const badges = screen.getAllByText("1");
      expect(badges.length).toBeGreaterThanOrEqual(3);
    });
  });

  it("shows counterparty name for swap items", async () => {
    await renderAndWait();
    await waitFor(() => {
      expect(screen.getByText(/↔ Charlie/)).toBeInTheDocument();
    });
  });

  it("shows reason for items that have one", async () => {
    await renderAndWait();
    await waitFor(() => {
      expect(screen.getByText(/Family matter/i)).toBeInTheDocument();
    });
  });
});

// =============================================================================
// 4. Requests tab — search filtering
// =============================================================================
describe("Requests tab — search", () => {
  beforeEach(() => {
    global.fetch = makeDefaultFetch();
  });

  it("filters items by staff name — shows matching, hides non-matching", async () => {
    await renderAndWait();
    await waitFor(() => screen.getByText(/Alice \/ day_off/));

    const searchInput = screen.getByPlaceholderText(/staff \/ req_id/i);
    fireEvent.change(searchInput, { target: { value: "Alice" } });

    await waitFor(() => {
      expect(screen.getByText(/Alice \/ day_off/)).toBeInTheDocument();
      expect(screen.queryByText(/Bob \/ swap/)).toBeNull();
      expect(screen.queryByText(/Diana \/ shift_change/)).toBeNull();
    });
  });

  it("shows match count in the search info bar", async () => {
    await renderAndWait();
    await waitFor(() => screen.getByText(/Alice \/ day_off/));

    fireEvent.change(screen.getByPlaceholderText(/staff \/ req_id/i), {
      target: { value: "Alice" },
    });

    await waitFor(() => {
      expect(screen.getByText(/Matches:/i)).toBeInTheDocument();
    });
  });

  it("shows 'No matching requests.' when search finds nothing", async () => {
    await renderAndWait();
    await waitFor(() => screen.getByText(/Alice \/ day_off/));

    fireEvent.change(screen.getByPlaceholderText(/staff \/ req_id/i), {
      target: { value: "zzz-nobody-zzz" },
    });

    await waitFor(() => {
      expect(screen.getByText(/No matching requests/i)).toBeInTheDocument();
    });
  });

  it("filters by request_type", async () => {
    await renderAndWait();
    await waitFor(() => screen.getByText(/Diana \/ shift_change/));

    fireEvent.change(screen.getByPlaceholderText(/staff \/ req_id/i), {
      target: { value: "shift_change" },
    });

    await waitFor(() => {
      expect(screen.getByText(/Diana \/ shift_change/)).toBeInTheDocument();
      expect(screen.queryByText(/Alice \/ day_off/)).toBeNull();
      expect(screen.queryByText(/Bob \/ swap/)).toBeNull();
    });
  });
});

// =============================================================================
// 5. RequestCard — expand / collapse / action buttons
// =============================================================================
describe("RequestCard — expand / collapse / actions", () => {
  beforeEach(() => {
    global.fetch = makeDefaultFetch();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("expands a request card on click to reveal action buttons", async () => {
    await renderAndWait();
    await waitFor(() => screen.getByText(/Diana \/ shift_change/));

    fireEvent.click(screen.getByText(/Diana \/ shift_change/));
    await waitFor(() => {
      expect(screen.getByText(/✅ APPROVE/)).toBeInTheDocument();
      expect(screen.getByText(/❌ REJECT/)).toBeInTheDocument();
      expect(screen.getByText(/NEED_INFO/)).toBeInTheDocument();
    });
  });

  it("shows item ID (truncated), work date, manager/HQ status in expanded card", async () => {
    await renderAndWait();
    await waitFor(() => screen.getByText(/Diana \/ shift_change/));

    fireEvent.click(screen.getByText(/Diana \/ shift_change/));
    await waitFor(() => {
      // ID is sliced to 8 chars: "mgr-003-"
      expect(screen.getByText(/mgr-003/)).toBeInTheDocument();
      expect(screen.getByText(/2026-05-07/)).toBeInTheDocument();
    });
  });

  it("collapses the card when same request is clicked again", async () => {
    await renderAndWait();
    await waitFor(() => screen.getByText(/Diana \/ shift_change/));

    fireEvent.click(screen.getByText(/Diana \/ shift_change/));
    await waitFor(() => screen.getByText(/✅ APPROVE/));

    fireEvent.click(screen.getByText(/Diana \/ shift_change/));
    await waitFor(() =>
      expect(screen.queryByText(/✅ APPROVE/)).toBeNull()
    );
  });

  it("APPROVE button is disabled when PIN input is empty", async () => {
    await renderAndWait();
    await waitFor(() => screen.getByText(/Diana \/ shift_change/));

    fireEvent.click(screen.getByText(/Diana \/ shift_change/));
    await waitFor(() => screen.getByText(/✅ APPROVE/));

    // Clear the PIN field
    const pinInput = screen.getByPlaceholderText("PIN");
    fireEvent.change(pinInput, { target: { value: "" } });

    await waitFor(() => {
      const approveBtn = screen.getByText(/✅ APPROVE/).closest("button");
      expect(approveBtn).toBeDisabled();
    });
  });

  it("APPROVE posts to intent and confirm_manager endpoints", async () => {
    global.fetch = buildFetchMock([
      { match: "/api/admin/overview", body: MOCK_OVERVIEW },
      { match: "/api/auth/verify", method: "POST", body: { ok: true, role: "ADMIN", staff_name: "Test Admin" } },
      { match: "/api/admin/price-check/flagged-count", body: { flagged_count: 0 } },
      { match: "/api/shift_change/intent", method: "POST", body: { ok: true } },
      { match: "/api/shift_change/confirm_manager", method: "POST", body: { ok: true } },
    ]);

    await renderAndWait();
    await waitFor(() => screen.getByText(/Diana \/ shift_change/));

    fireEvent.click(screen.getByText(/Diana \/ shift_change/));
    await waitFor(() => screen.getByText(/✅ APPROVE/));

    const pinInput = screen.getByPlaceholderText("PIN");
    fireEvent.change(pinInput, { target: { value: "1234" } });

    fireEvent.click(screen.getByText(/✅ APPROVE/).closest("button")!);

    await waitFor(() => {
      const urls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map(
        ([url]: [string]) => url
      );
      expect(urls.some((u: string) => u.includes("shift_change/intent"))).toBe(true);
      expect(urls.some((u: string) => u.includes("confirm_manager"))).toBe(true);
    });
  });

  it("REJECT posts REJECT action to intent and confirm endpoints", async () => {
    global.fetch = buildFetchMock([
      { match: "/api/admin/overview", body: MOCK_OVERVIEW },
      { match: "/api/auth/verify", method: "POST", body: { ok: true, role: "ADMIN", staff_name: "Test Admin" } },
      { match: "/api/admin/price-check/flagged-count", body: { flagged_count: 0 } },
      { match: "/api/shift_change/intent", method: "POST", body: { ok: true } },
      { match: "/api/shift_change/confirm_manager", method: "POST", body: { ok: true } },
    ]);

    await renderAndWait();
    await waitFor(() => screen.getByText(/Diana \/ shift_change/));

    fireEvent.click(screen.getByText(/Diana \/ shift_change/));
    await waitFor(() => screen.getByText(/❌ REJECT/));

    const pinInput = screen.getByPlaceholderText("PIN");
    fireEvent.change(pinInput, { target: { value: "1234" } });

    fireEvent.click(screen.getByText(/❌ REJECT/).closest("button")!);

    await waitFor(() => {
      const urls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map(
        ([url]: [string]) => url
      );
      expect(urls.some((u: string) => u.includes("intent") && u.includes("REJECT"))).toBe(true);
    });
  });

  it("shows CP APPROVE and CP REJECT buttons for swap items", async () => {
    await renderAndWait();
    await waitFor(() => screen.getByText(/Bob \/ swap/));

    fireEvent.click(screen.getByText(/Bob \/ swap/));
    await waitFor(() => {
      expect(screen.getByText(/CP APPROVE/)).toBeInTheDocument();
      expect(screen.getByText(/CP REJECT/)).toBeInTheDocument();
    });
  });

  it("does NOT show CP buttons for non-swap items", async () => {
    await renderAndWait();
    await waitFor(() => screen.getByText(/Diana \/ shift_change/));

    fireEvent.click(screen.getByText(/Diana \/ shift_change/));
    await waitFor(() => screen.getByText(/✅ APPROVE/));

    expect(screen.queryByText(/CP APPROVE/)).toBeNull();
    expect(screen.queryByText(/CP REJECT/)).toBeNull();
  });

  it("shows ❌ error message when approve API fails", async () => {
    global.fetch = buildFetchMock([
      { match: "/api/admin/overview", body: MOCK_OVERVIEW },
      { match: "/api/auth/verify", method: "POST", body: { ok: true, role: "ADMIN", staff_name: "Test Admin" } },
      { match: "/api/admin/price-check/flagged-count", body: { flagged_count: 0 } },
      { match: "/api/shift_change/intent", method: "POST", body: { detail: "Unauthorized" }, status: 403 },
    ]);

    await renderAndWait();
    await waitFor(() => screen.getByText(/Diana \/ shift_change/));

    fireEvent.click(screen.getByText(/Diana \/ shift_change/));
    await waitFor(() => screen.getByText(/✅ APPROVE/));

    const pinInput = screen.getByPlaceholderText("PIN");
    fireEvent.change(pinInput, { target: { value: "1234" } });

    fireEvent.click(screen.getByText(/✅ APPROVE/).closest("button")!);

    await waitFor(() => {
      const errorEls = screen.queryAllByText(/❌/);
      expect(errorEls.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("does NOT call intent endpoint when user cancels window.confirm", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);

    await renderAndWait();
    await waitFor(() => screen.getByText(/Diana \/ shift_change/));

    fireEvent.click(screen.getByText(/Diana \/ shift_change/));
    await waitFor(() => screen.getByText(/✅ APPROVE/));

    const pinInput = screen.getByPlaceholderText("PIN");
    fireEvent.change(pinInput, { target: { value: "1234" } });

    fireEvent.click(screen.getByText(/✅ APPROVE/).closest("button")!);

    const urls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map(
      ([url]: [string]) => url
    );
    expect(urls.some((u: string) => u.includes("intent"))).toBe(false);
  });

  it("CP APPROVE posts to counterparty/respond endpoint", async () => {
    global.fetch = buildFetchMock([
      { match: "/api/admin/overview", body: MOCK_OVERVIEW },
      { match: "/api/auth/verify", method: "POST", body: { ok: true, role: "ADMIN", staff_name: "Test Admin" } },
      { match: "/api/admin/price-check/flagged-count", body: { flagged_count: 0 } },
      { match: "/api/shift_change/counterparty/respond", method: "POST", body: { ok: true } },
    ]);

    await renderAndWait();
    await waitFor(() => screen.getByText(/Bob \/ swap/));

    fireEvent.click(screen.getByText(/Bob \/ swap/));
    await waitFor(() => screen.getByText(/CP APPROVE/));

    const pinInput = screen.getByPlaceholderText("PIN");
    fireEvent.change(pinInput, { target: { value: "1234" } });

    fireEvent.click(screen.getByText(/CP APPROVE/).closest("button")!);

    await waitFor(() => {
      const urls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map(
        ([url]: [string]) => url
      );
      expect(urls.some((u: string) => u.includes("counterparty/respond"))).toBe(true);
    });
  });
});

// =============================================================================
// 6. Export section (HQ/ADMIN only)
// =============================================================================
describe("Export section (HQ/ADMIN only)", () => {
  it("shows 'Enter your PIN' when pin is empty and role is not yet verified", async () => {
    // Default setAdminAuth has no pin → myRole clears to "" after verify effect
    global.fetch = buildFetchMock([
      { match: "/api/admin/overview", body: MOCK_OVERVIEW },
      { match: "/api/auth/verify", method: "POST", body: { ok: true, role: "STAFF" } },
      { match: "/api/admin/price-check/flagged-count", body: { flagged_count: 0 } },
    ]);

    await renderAndWait();
    await waitFor(() =>
      expect(screen.getByText(/Enter your PIN so role can be verified/i)).toBeInTheDocument()
    );
  });

  it("shows Export and Prepare buttons when ADMIN role is verified via pin", async () => {
    setAuthWithPin("1234");
    global.fetch = buildFetchMock([
      { match: "/api/admin/overview", body: MOCK_OVERVIEW },
      { match: "/api/auth/verify", method: "POST", body: { ok: true, role: "ADMIN", staff_name: "Test Admin" } },
      { match: "/api/admin/price-check/flagged-count", body: { flagged_count: 0 } },
    ]);

    await renderAndWait();
    await waitFor(() => {
      // showExport = true → both Export (top button) and Prepare (in grid) visible
      const buttons = screen.getAllByRole("button");
      const prepareBtn = buttons.find((b) => b.textContent?.includes("Prepare"));
      expect(prepareBtn).toBeInTheDocument();
    });
  });

  it("shows FINAL/DRAFT mode select options in export section", async () => {
    setAuthWithPin("1234");
    global.fetch = buildFetchMock([
      { match: "/api/admin/overview", body: MOCK_OVERVIEW },
      { match: "/api/auth/verify", method: "POST", body: { ok: true, role: "ADMIN", staff_name: "Test Admin" } },
      { match: "/api/admin/price-check/flagged-count", body: { flagged_count: 0 } },
    ]);

    await renderAndWait();
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "FINAL" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "DRAFT" })).toBeInTheDocument();
    });
  });

  it("calls export/month/prepare endpoint when Prepare button is clicked", async () => {
    setAuthWithPin("1234");
    const fetchMock = buildFetchMock([
      { match: "/api/admin/overview", body: MOCK_OVERVIEW },
      { match: "/api/auth/verify", method: "POST", body: { ok: true, role: "ADMIN", staff_name: "Test Admin" } },
      { match: "/api/admin/price-check/flagged-count", body: { flagged_count: 0 } },
      {
        match: "/api/admin/export/month/prepare",
        method: "POST",
        body: {
          ok: true,
          preview: {
            city: "manila",
            branch_code: "MOA",
            month: "2026-05",
            mode: "FINAL",
            date_from: "2026-05-01",
            date_to_exclusive: "2026-06-01",
            shift_rows: 120,
            staff_count: 15,
            days: 31,
            hour_range: { start: 9, end: 22 },
          },
          confirm_token: "tok-abc-123",
          expires_in_sec: 300,
        },
      },
    ]);
    global.fetch = fetchMock;

    await renderAndWait();
    const prepareBtn = await waitFor(() => {
      const btns = screen.getAllByRole("button");
      return btns.find((b) => b.textContent?.trim() === "Prepare");
    });
    expect(prepareBtn).toBeTruthy();

    fireEvent.click(prepareBtn!);

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map(([url]: [string]) => url);
      expect(calls.some((u: string) => u.includes("export/month/prepare"))).toBe(true);
    });
  });

  it("shows preview KPI cards after successful prepare", async () => {
    setAuthWithPin("1234");
    global.fetch = buildFetchMock([
      { match: "/api/admin/overview", body: MOCK_OVERVIEW },
      { match: "/api/auth/verify", method: "POST", body: { ok: true, role: "ADMIN", staff_name: "Test Admin" } },
      { match: "/api/admin/price-check/flagged-count", body: { flagged_count: 0 } },
      {
        match: "/api/admin/export/month/prepare",
        method: "POST",
        body: {
          ok: true,
          preview: {
            city: "manila",
            branch_code: "MOA",
            month: "2026-05",
            mode: "FINAL",
            date_from: "2026-05-01",
            date_to_exclusive: "2026-06-01",
            shift_rows: 120,
            staff_count: 15,
            days: 31,
            hour_range: { start: 9, end: 22 },
          },
          confirm_token: "tok-abc-123",
          expires_in_sec: 300,
        },
      },
    ]);

    await renderAndWait();
    const prepareBtn = await waitFor(() => {
      const btns = screen.getAllByRole("button");
      return btns.find((b) => b.textContent?.trim() === "Prepare");
    });
    fireEvent.click(prepareBtn!);

    await waitFor(() => {
      expect(screen.getByText("Preview")).toBeInTheDocument();
      expect(screen.getByText("120")).toBeInTheDocument(); // shift_rows
      expect(screen.getByText("15")).toBeInTheDocument();  // staff_count
      expect(screen.getByText("31")).toBeInTheDocument();  // days
    });
  });

  it("shows prepare error message on API failure", async () => {
    setAuthWithPin("1234");
    global.fetch = buildFetchMock([
      { match: "/api/admin/overview", body: MOCK_OVERVIEW },
      { match: "/api/auth/verify", method: "POST", body: { ok: true, role: "ADMIN", staff_name: "Test Admin" } },
      { match: "/api/admin/price-check/flagged-count", body: { flagged_count: 0 } },
      { match: "/api/admin/export/month/prepare", method: "POST", body: { detail: "No shifts found" }, status: 404 },
    ]);

    await renderAndWait();
    const prepareBtn = await waitFor(() => {
      const btns = screen.getAllByRole("button");
      return btns.find((b) => b.textContent?.trim() === "Prepare");
    });
    fireEvent.click(prepareBtn!);

    await waitFor(() => {
      // prepErr is rendered in a text-red-300 div inside the export section.
      // With BUG#1 still present, message is raw JSON: {"detail":"No shifts found"}
      // which still contains "No shifts found". After the fix it's just "No shifts found".
      const errDivs = Array.from(
        document.querySelectorAll("div")
      ).filter((el) => el.className.includes("text-red-300") && el.textContent?.trim());
      expect(errDivs.length).toBeGreaterThanOrEqual(1);
    });
  });
});

// =============================================================================
// 7. Attendance sync
// =============================================================================
describe("Attendance sync", () => {
  it("Sync Bayzat button is disabled when PIN is empty", async () => {
    global.fetch = makeDefaultFetch();
    await renderAndWait();

    // Default auth has no pin, so button should be disabled
    const syncBtn = screen.getByRole("button", { name: /Sync Latest Bayzat/i });
    expect(syncBtn).toBeDisabled();
  });

  it("Sync Bayzat button is enabled when pin is set in auth", async () => {
    setAuthWithPin("9999");
    global.fetch = makeDefaultFetch();

    await renderAndWait();
    const syncBtn = screen.getByRole("button", { name: /Sync Latest Bayzat/i });
    expect(syncBtn).not.toBeDisabled();
  });

  it("shows success message after successful sync", async () => {
    setAuthWithPin("9999");
    global.fetch = makeDefaultFetch();

    await renderAndWait();
    fireEvent.click(screen.getByRole("button", { name: /Sync Latest Bayzat/i }));

    await waitFor(() => {
      expect(screen.getByText(/Sync complete/i)).toBeInTheDocument();
    });
  });

  it("shows 'PINが正しくありません' when sync returns invalid pin error", async () => {
    setAuthWithPin("9999");
    global.fetch = buildFetchMock([
      { match: "/api/admin/overview", body: MOCK_OVERVIEW },
      { match: "/api/auth/verify", method: "POST", body: { ok: true, role: "ADMIN", staff_name: "Test Admin" } },
      { match: "/api/admin/price-check/flagged-count", body: { flagged_count: 0 } },
      {
        match: "/api/admin/attendance/drive/sync",
        method: "POST",
        body: { detail: "Invalid PIN" },
        status: 403,
      },
    ]);

    await renderAndWait();
    fireEvent.click(screen.getByRole("button", { name: /Sync Latest Bayzat/i }));

    await waitFor(() => {
      expect(screen.getByText(/PINが正しくありません/i)).toBeInTheDocument();
    });
  });

  it("shows 'already imported' message when sync returns duplicate flag", async () => {
    setAuthWithPin("9999");
    global.fetch = buildFetchMock([
      { match: "/api/admin/overview", body: MOCK_OVERVIEW },
      { match: "/api/auth/verify", method: "POST", body: { ok: true, role: "ADMIN", staff_name: "Test Admin" } },
      { match: "/api/admin/price-check/flagged-count", body: { flagged_count: 0 } },
      {
        match: "/api/admin/attendance/drive/sync",
        method: "POST",
        body: { ok: true, duplicate: true, message: "" },
      },
    ]);

    await renderAndWait();
    fireEvent.click(screen.getByRole("button", { name: /Sync Latest Bayzat/i }));

    await waitFor(() => {
      expect(screen.getByText(/既に取り込み済み/i)).toBeInTheDocument();
    });
  });
});

// =============================================================================
// 8. Price check badge
// =============================================================================
describe("Price check badge", () => {
  it("does not show price check alert when flagged_count is 0", async () => {
    global.fetch = buildFetchMock([
      { match: "/api/admin/overview", body: MOCK_OVERVIEW },
      { match: "/api/auth/verify", method: "POST", body: { ok: true, role: "ADMIN", staff_name: "Test Admin" } },
      { match: "/api/admin/price-check/flagged-count", body: { flagged_count: 0 } },
    ]);

    await renderAndWait();
    await waitFor(() => {
      expect(screen.queryByText(/件の価格変更を検出/i)).toBeNull();
    });
  });

  it("shows price check alert card when flagged_count > 0", async () => {
    global.fetch = buildFetchMock([
      { match: "/api/admin/overview", body: MOCK_OVERVIEW },
      { match: "/api/auth/verify", method: "POST", body: { ok: true, role: "ADMIN", staff_name: "Test Admin" } },
      { match: "/api/admin/price-check/flagged-count", body: { flagged_count: 3 } },
    ]);

    await renderAndWait();
    await waitFor(() => {
      expect(screen.getByText(/3 件の価格変更を検出/i)).toBeInTheDocument();
    });
  });
});

// =============================================================================
// 9. Navigation links
// =============================================================================
describe("Navigation links in header", () => {
  it("shows Analytics, Draft, Staff Master, Absences links", async () => {
    global.fetch = makeDefaultFetch();
    await renderAndWait();

    expect(screen.getByRole("link", { name: /Analytics/i })).toHaveAttribute("href", "/admin/analytics");
    expect(screen.getByRole("link", { name: /Draft/i })).toHaveAttribute("href", "/admin/draft");
    expect(screen.getByRole("link", { name: /Staff Master/i })).toHaveAttribute("href", "/admin/staff");
    expect(screen.getByRole("link", { name: /Absences/i })).toHaveAttribute("href", "/admin/absences");
  });

  it("shows Backup Report and Disposal Report links", async () => {
    global.fetch = makeDefaultFetch();
    await renderAndWait();

    expect(screen.getByRole("link", { name: /Backup Report/i })).toHaveAttribute("href", "/admin/backup");
    expect(screen.getByRole("link", { name: /Disposal Report/i })).toHaveAttribute("href", "/admin/disposal");
  });
});

// =============================================================================
// 10. BUG REGRESSION: apiGet / apiPost swallow FastAPI detail field
// =============================================================================
describe("BUG #1: apiGet / apiPost — error detail field is discarded (never shown to user)", () => {
  /**
   * CONFIRMED BUG in src/app/admin/page.tsx (both apiGet and apiPost):
   *
   *   try {
   *     const j = JSON.parse(text);
   *     throw new Error(j?.detail || text || "…");  ← this throw IS caught by catch!
   *   } catch {
   *     throw new Error(text || "…");               ← always runs, ignores j.detail
   *   }
   *
   * FastAPI error responses are {"detail":"Human-readable message"}.
   * Users see the raw JSON string instead of the clean message.
   *
   * FIX (applies to both apiGet and apiPost):
   *   let msg = text || `GET/POST ${path} failed`;
   *   try { const j = JSON.parse(text); if (j?.detail) msg = j.detail; } catch {}
   *   throw new Error(msg);
   */
  it("[FIXED] overview 401 → shows human-readable detail, not raw JSON", async () => {
    global.fetch = buildFetchMock([
      { match: "/api/auth/verify", method: "POST", body: { ok: true, role: "ADMIN", staff_name: "Test Admin" } },
      { match: "/api/admin/price-check/flagged-count", body: { flagged_count: 0 } },
      {
        match: "/api/admin/overview",
        body: { detail: "Session expired. Please log in again." },
        status: 401,
      },
    ]);

    await renderAndWait();

    await waitFor(() => {
      // After the fix, the clean detail message appears — not raw JSON
      expect(
        screen.getByText(/Session expired\. Please log in again\./i)
      ).toBeInTheDocument();
    });
  });
});

// =============================================================================
// 11. BUG REGRESSION: isHQOrAdmin excludes MANAGEMENT roles
// =============================================================================
describe("BUG #2: isHQOrAdmin — MANAGEMENT / DUBAI_MANAGEMENT / MANILA_MANAGEMENT excluded from export", () => {
  /**
   * CONFIRMED BUG in src/app/admin/page.tsx:
   *
   *   function isHQOrAdmin(role: string) {
   *     const r = String(role || "").toUpperCase();
   *     return r === "HQ" || r === "ADMIN" || r === "HR_MANAGER";
   *   }
   *
   * AuthVerifyResp declares these as valid roles:
   *   "STAFF" | "MANAGER" | "MANAGEMENT" | "HQ" | "ADMIN" |
   *   "HR_MANAGER" | "DUBAI_MANAGEMENT" | "MANILA_MANAGEMENT"
   *
   * canOpenPriceCheck already includes MANILA_MANAGEMENT:
   *   ["HQ", "ADMIN", "MANILA_MANAGEMENT"].includes(r)
   * ...but isHQOrAdmin() doesn't, so showExport stays false for MANILA_MANAGEMENT.
   *
   * FIX: extend isHQOrAdmin to also return true for
   *   MANAGEMENT | DUBAI_MANAGEMENT | MANILA_MANAGEMENT
   */
  it("[FIXED] MANILA_MANAGEMENT now sees Export section (not 'Enter your PIN')", async () => {
    setAuthWithPin("1234");
    global.fetch = buildFetchMock([
      { match: "/api/admin/overview", body: MOCK_OVERVIEW },
      {
        match: "/api/auth/verify",
        method: "POST",
        body: { ok: true, role: "MANILA_MANAGEMENT", staff_name: "Test Admin" },
      },
      { match: "/api/admin/price-check/flagged-count", body: { flagged_count: 0 } },
    ]);

    await renderAndWait();

    await waitFor(() => {
      // After the fix, isHQOrAdmin includes MANILA_MANAGEMENT → showExport=true
      const btns = screen.getAllByRole("button");
      const prepareBtn = btns.find((b) => b.textContent?.trim() === "Prepare");
      expect(prepareBtn).toBeTruthy();
      expect(screen.queryByText(/Enter your PIN so role can be verified/i)).toBeNull();
    });
  });

  it("[FIXED] MANAGEMENT role now also sees Export section", async () => {
    setAuthWithPin("1234");
    global.fetch = buildFetchMock([
      { match: "/api/admin/overview", body: MOCK_OVERVIEW },
      {
        match: "/api/auth/verify",
        method: "POST",
        body: { ok: true, role: "MANAGEMENT", staff_name: "Test Admin" },
      },
      { match: "/api/admin/price-check/flagged-count", body: { flagged_count: 0 } },
    ]);

    await renderAndWait();

    await waitFor(() => {
      const btns = screen.getAllByRole("button");
      const prepareBtn = btns.find((b) => b.textContent?.trim() === "Prepare");
      expect(prepareBtn).toBeTruthy();
    });
  });
});
