// tests/admin/incidents/incidents-pages.test.tsx
// Comprehensive tests for:
//   - src/app/admin/incidents/page.tsx         (list)
//   - src/app/admin/incidents/[id]/page.tsx    (detail)
// Analytics Dashboard page is excluded per spec.

import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Hoisted mocks (needed in vi.mock factories before any imports) ────────────
const { mockRouter } = vi.hoisted(() => ({
  mockRouter: { push: vi.fn(), replace: vi.fn(), back: vi.fn() },
}));

// ── next/navigation (overrides setup.ts; useParams needed for detail page) ───
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/incidents",
  useParams: () => ({ id: "INC-001" }),
}));

// ── next/link ─────────────────────────────────────────────────────────────────
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) =>
    React.createElement("a", { href, ...props }, children),
}));

// ── lucide-react ──────────────────────────────────────────────────────────────
vi.mock("lucide-react", () => ({
  AlertTriangle: () => null,
  ArrowLeft: () => null,
  BarChart3: () => null,
  Building2: () => null,
  Calendar: () => null,
  CheckCircle2: () => null,
  ChevronRight: () => null,
  Clock: () => null,
  Filter: () => null,
  Image: () => null,
  Loader2: () => null,
  Lock: () => null,
  MapPin: () => null,
  MessageSquare: () => null,
  RefreshCw: () => null,
  Send: () => null,
  TrendingUp: () => null,
  User: () => null,
  XCircle: () => null,
}));

// ── Auth ──────────────────────────────────────────────────────────────────────
const BASE_AUTH = {
  staffName: "Jay Test",
  city: "manila" as const,
  role: "HQ",
  accessToken: "tok-test",
  pin: "1234",
  permissions: ["*"],
  cityLock: "",
};

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getAuth: vi.fn(() => BASE_AUTH),
    getAuthHeaders: vi.fn(() => ({
      "Content-Type": "application/json",
      Authorization: "Bearer tok-test",
    })),
  };
});

// ── API_BASE (module-level constant — must be mocked at import time) ──────────
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, API_BASE: "https://api.test" };
});

// ── Badge events ──────────────────────────────────────────────────────────────
vi.mock("@/lib/badgeEvents", () => ({
  dispatchBadgeRefresh: vi.fn(),
  BADGE_EVENTS: {
    privateReports: "sushizen:private-reports:badge:refresh",
    adminIncidents: "sushizen:admin-incidents:badge:refresh",
    incidents: "sushizen:incidents:badge:refresh",
  },
}));

// ── Page imports ──────────────────────────────────────────────────────────────
import AdminIncidentsPage from "@/app/admin/incidents/page";
import AdminIncidentDetailPage from "@/app/admin/incidents/[id]/page";

// ══════════════════════════════════════════════════════════════════════════════
// Test fixtures
// ══════════════════════════════════════════════════════════════════════════════

const INCIDENT_ROWS = [
  {
    id: "INC-001",
    city: "manila",
    branch: "BGC",
    reporter_name: "Maria Santos",
    category: "Product Issue",
    severity: "medium",
    description: "Food quality problem",
    incident_datetime: "2026-05-10T10:00:00Z",
    status: "new",
    created_at: "2026-05-10T10:30:00Z",
    replies: [],
    attachments: [],
    has_notes: false,
  },
  {
    id: "INC-002",
    city: "manila",
    branch: "Makati",
    reporter_name: "Jose Cruz",
    category: "Equipment Issue",
    severity: "high",
    description: "Oven malfunction",
    incident_datetime: "2026-05-09T14:00:00Z",
    status: "in_progress",
    created_at: "2026-05-09T14:30:00Z",
    replies: [{ id: "R-1" }, { id: "R-2" }],
    attachments: [],
    has_notes: true,
  },
  {
    id: "INC-003",
    city: "dubai",
    branch: "Business Bay",
    reporter_name: "Ahmed Ali",
    category: "Delivery Issue",
    severity: "low",
    description: "Late delivery",
    incident_datetime: "2026-05-08T09:00:00Z",
    status: "resolved",
    created_at: "2026-05-08T09:30:00Z",
    replies: [],
    attachments: [],
    has_notes: false,
  },
];

const INCIDENT_DETAIL = {
  id: "INC-001",
  city: "manila",
  branch: "BGC",
  reporter_name: "Maria Santos",
  category: "Product Issue",
  severity: "medium",
  description: "Food quality problem at counter — the rice was undercooked.",
  incident_datetime: "2026-05-10T10:00:00Z",
  status: "new",
  created_at: "2026-05-10T10:30:00Z",
  updated_at: "2026-05-10T10:30:00Z",
  replies: [],
  attachments: [],
  internal_notes: [],
};

// ── Fetch factory ─────────────────────────────────────────────────────────────
type MockOverride = { match?: string | RegExp; method?: string; status?: number; body?: unknown };

function makeFetch(overrides: MockOverride[] = []) {
  return vi.fn(async (url: string, opts?: RequestInit) => {
    const method = ((opts?.method as string) || "GET").toUpperCase();
    const u = String(url);

    for (const ov of overrides) {
      if (ov.match) {
        const hit = typeof ov.match === "string" ? u.includes(ov.match) : ov.match.test(u);
        if (!hit) continue;
      }
      if (ov.method && ov.method.toUpperCase() !== method) continue;
      const status = ov.status ?? 200;
      const body = ov.body !== undefined ? JSON.stringify(ov.body) : "{}";
      return new Response(body, { status, headers: { "Content-Type": "application/json" } });
    }

    // Default list
    if (u.includes("/api/admin/incidents") && !u.match(/\/INC-\d+/) && method === "GET")
      return new Response(JSON.stringify({ items: INCIDENT_ROWS }), { status: 200 });

    // Default detail GET
    if (u.includes("/api/admin/incidents/INC-001") && method === "GET")
      return new Response(JSON.stringify({ item: INCIDENT_DETAIL }), { status: 200 });

    // Default PATCH /status
    if (u.includes("/status") && method === "PATCH")
      return new Response(JSON.stringify({ ok: true }), { status: 200 });

    // Default POST /notes
    if (u.includes("/notes") && method === "POST")
      return new Response(JSON.stringify({ ok: true }), { status: 200 });

    // Default POST /replies
    if (u.includes("/replies") && method === "POST")
      return new Response(JSON.stringify({ ok: true }), { status: 200 });

    return new Response("{}", { status: 200 });
  });
}

// ── Auth helpers ──────────────────────────────────────────────────────────────
async function setupAuth(authOverride?: Partial<typeof BASE_AUTH>) {
  const { getAuth, getAuthHeaders } = await import("@/lib/auth");
  vi.mocked(getAuth).mockReturnValue({ ...BASE_AUTH, ...authOverride } as any);
  vi.mocked(getAuthHeaders).mockReturnValue({
    "Content-Type": "application/json",
    Authorization: "Bearer tok-test",
  } as any);
}

// ══════════════════════════════════════════════════════════════════════════════
// LIST PAGE
// ══════════════════════════════════════════════════════════════════════════════

describe("AdminIncidentsPage (list)", () => {
  async function renderPage(fetchMock = makeFetch()) {
    await setupAuth();
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminIncidentsPage />);
  }

  async function renderAndLoad(fetchMock = makeFetch()) {
    await renderPage(fetchMock);
    await screen.findByText("Product Issue", {}, { timeout: 5000 });
  }

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  // ── Page structure ──────────────────────────────────────────────────────────
  describe("page structure", () => {
    it("renders the page title", async () => {
      await renderPage();
      expect(screen.getByText("Incident Reports")).toBeInTheDocument();
    });

    it("renders the subtitle caption", async () => {
      await renderPage();
      expect(screen.getByText(/Monitor and manage reports/i)).toBeInTheDocument();
    });

    it("renders the Analytics Dashboard link", async () => {
      await renderPage();
      const link = screen.getByRole("link", { name: /Analytics Dashboard/i });
      expect(link).toHaveAttribute("href", "/admin/incidents/dashboard");
    });

    it("renders the Refresh button", async () => {
      await renderPage();
      expect(screen.getByRole("button", { name: /Refresh/i })).toBeInTheDocument();
    });
  });

  // ── KPI strip ──────────────────────────────────────────────────────────────
  describe("KPI strip", () => {
    it("shows Total, New, In Progress, Resolved labels", async () => {
      await renderAndLoad();
      // "Total" is unique; "New"/"In Progress"/"Resolved" also appear in the status select and
      // status badges, so use getAllByText for those.
      await waitFor(() => {
        expect(screen.getByText("Total")).toBeInTheDocument();
        expect(screen.getAllByText("New").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("In Progress").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("Resolved").length).toBeGreaterThanOrEqual(1);
      });
    });

    it("Total count matches number of items", async () => {
      await renderAndLoad();
      // Total = 3, New = 1, In Progress = 1, Resolved = 1
      const cells = screen.getAllByText("3");
      expect(cells.length).toBeGreaterThanOrEqual(1);
    });

    it("New count = 1 (INC-001 is new)", async () => {
      await renderAndLoad();
      await waitFor(() => {
        const ones = screen.getAllByText("1");
        expect(ones.length).toBeGreaterThanOrEqual(1); // New=1, InProgress=1, Resolved=1
      });
    });
  });

  // ── Filters ─────────────────────────────────────────────────────────────────
  describe("filters", () => {
    it("shows city select when user is not city-locked", async () => {
      await renderPage();
      const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
      const citySelect = selects.find((s) =>
        Array.from(s.querySelectorAll("option")).some(
          (o) => (o as HTMLOptionElement).text.includes("All Cities")
        )
      );
      expect(citySelect).toBeTruthy();
    });

    it("city select has All Cities, Dubai, Manila options", async () => {
      await renderPage();
      const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
      const citySelect = selects.find((s) =>
        Array.from(s.querySelectorAll("option")).some(
          (o) => (o as HTMLOptionElement).text.includes("All Cities")
        )
      )!;
      const opts = Array.from(citySelect.querySelectorAll("option")).map(
        (o) => (o as HTMLOptionElement).value
      );
      expect(opts).toContain("");
      expect(opts).toContain("dubai");
      expect(opts).toContain("manila");
    });

    it("shows locked-city chip when user has cityLock=dubai", async () => {
      await setupAuth({ cityLock: "dubai" });
      vi.stubGlobal("fetch", makeFetch());
      render(<AdminIncidentsPage />);
      await waitFor(() => {
        expect(screen.getByText(/Dubai.*only/i)).toBeInTheDocument();
      });
    });

    it("shows locked-city chip when user has cityLock=manila", async () => {
      await setupAuth({ cityLock: "manila" });
      vi.stubGlobal("fetch", makeFetch());
      render(<AdminIncidentsPage />);
      await waitFor(() => {
        expect(screen.getByText(/Manila.*only/i)).toBeInTheDocument();
      });
    });

    it("city-locked user does NOT see city select", async () => {
      await setupAuth({ cityLock: "dubai" });
      vi.stubGlobal("fetch", makeFetch());
      render(<AdminIncidentsPage />);
      await waitFor(() => {
        const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
        const hasCitySelect = selects.some((s) =>
          Array.from(s.querySelectorAll("option")).some(
            (o) => (o as HTMLOptionElement).text.includes("All Cities")
          )
        );
        expect(hasCitySelect).toBe(false);
      });
    });

    it("status select has All Statuses, New, Acknowledged, In Progress, Resolved options", async () => {
      await renderPage();
      const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
      const statusSelect = selects.find((s) =>
        Array.from(s.querySelectorAll("option")).some(
          (o) => (o as HTMLOptionElement).text === "Acknowledged"
        )
      )!;
      expect(statusSelect).toBeTruthy();
      const opts = Array.from(statusSelect.querySelectorAll("option")).map(
        (o) => (o as HTMLOptionElement).text
      );
      expect(opts).toContain("All Statuses");
      expect(opts).toContain("New");
      expect(opts).toContain("Acknowledged");
      expect(opts).toContain("In Progress");
      expect(opts).toContain("Resolved");
    });

    it("category select includes Product Issue and Equipment Issue", async () => {
      await renderPage();
      const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
      const catSelect = selects.find((s) =>
        Array.from(s.querySelectorAll("option")).some(
          (o) => (o as HTMLOptionElement).text === "Product Issue"
        )
      )!;
      expect(catSelect).toBeTruthy();
    });

    it("notes select has All, Has HQ Notes, No Notes", async () => {
      await renderPage();
      const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
      const notesSelect = selects.find((s) =>
        Array.from(s.querySelectorAll("option")).some(
          (o) => (o as HTMLOptionElement).text === "Has HQ Notes"
        )
      )!;
      expect(notesSelect).toBeTruthy();
    });

    it("changing status filter triggers a new fetch", async () => {
      const fetchMock = makeFetch();
      await renderAndLoad(fetchMock);

      const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
      const statusSelect = selects.find((s) =>
        Array.from(s.querySelectorAll("option")).some(
          (o) => (o as HTMLOptionElement).text === "Acknowledged"
        )
      )!;

      const prevCount = (fetchMock as ReturnType<typeof vi.fn>).mock.calls.length;
      fireEvent.change(statusSelect, { target: { value: "new" } });

      await waitFor(() => {
        const newCount = (fetchMock as ReturnType<typeof vi.fn>).mock.calls.length;
        expect(newCount).toBeGreaterThan(prevCount);
      });
    });

    it("changing city filter triggers a new fetch", async () => {
      const fetchMock = makeFetch();
      await renderAndLoad(fetchMock);

      const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
      const citySelect = selects.find((s) =>
        Array.from(s.querySelectorAll("option")).some(
          (o) => (o as HTMLOptionElement).text.includes("All Cities")
        )
      )!;

      const prevCount = (fetchMock as ReturnType<typeof vi.fn>).mock.calls.length;
      fireEvent.change(citySelect, { target: { value: "dubai" } });

      await waitFor(() => {
        const newCount = (fetchMock as ReturnType<typeof vi.fn>).mock.calls.length;
        expect(newCount).toBeGreaterThan(prevCount);
      });
    });

    it("category filter is client-side (no extra API call)", async () => {
      const fetchMock = makeFetch();
      await renderAndLoad(fetchMock);

      const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
      const catSelect = selects.find((s) =>
        Array.from(s.querySelectorAll("option")).some(
          (o) => (o as HTMLOptionElement).text === "Product Issue"
        )
      )!;

      const prevCount = (fetchMock as ReturnType<typeof vi.fn>).mock.calls.length;
      fireEvent.change(catSelect, { target: { value: "Product Issue" } });

      // Category is filtered client-side — no new API call should fire
      await new Promise((r) => setTimeout(r, 150));
      expect((fetchMock as ReturnType<typeof vi.fn>).mock.calls.length).toBe(prevCount);
    });

    it("category filter hides non-matching rows", async () => {
      await renderAndLoad();

      const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
      const catSelect = selects.find((s) =>
        Array.from(s.querySelectorAll("option")).some(
          (o) => (o as HTMLOptionElement).text === "Product Issue"
        )
      )!;

      fireEvent.change(catSelect, { target: { value: "Product Issue" } });

      await waitFor(() => {
        // Branch names are unique (not in any select options)
        expect(screen.getByText("BGC")).toBeInTheDocument(); // Product Issue row stays
        expect(screen.queryByText("Makati")).not.toBeInTheDocument(); // Equipment Issue hidden
        expect(screen.queryByText("Business Bay")).not.toBeInTheDocument(); // Delivery Issue hidden
      });
    });
  });

  // ── Table content ────────────────────────────────────────────────────────────
  describe("incident table", () => {
    it("shows incident rows after loading", async () => {
      await renderAndLoad();
      // Category names appear in both select options and table — count ≥ 2 proves table rendered
      expect(screen.getAllByText("Product Issue").length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText("Equipment Issue").length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText("Delivery Issue").length).toBeGreaterThanOrEqual(2);
    });

    it("shows branch names in table", async () => {
      await renderAndLoad();
      expect(screen.getByText("BGC")).toBeInTheDocument();
      expect(screen.getByText("Makati")).toBeInTheDocument();
      expect(screen.getByText("Business Bay")).toBeInTheDocument();
    });

    it("shows reporter names in table", async () => {
      await renderAndLoad();
      expect(screen.getByText("Maria Santos")).toBeInTheDocument();
      expect(screen.getByText("Jose Cruz")).toBeInTheDocument();
      expect(screen.getByText("Ahmed Ali")).toBeInTheDocument();
    });

    it("shows New status badge in the BGC row", async () => {
      await renderAndLoad();
      // Branch names are unique — use them to scope the badge lookup
      const { within: rtlWithin } = await import("@testing-library/react");
      const bgcCell = screen.getByText("BGC");
      const bgcRow = bgcCell.closest("tr")!;
      expect(rtlWithin(bgcRow).getByText("New")).toBeInTheDocument();
    });

    it("shows In Progress status badge in the Makati row", async () => {
      await renderAndLoad();
      const { within: rtlWithin } = await import("@testing-library/react");
      const makatiCell = screen.getByText("Makati");
      const makatiRow = makatiCell.closest("tr")!;
      expect(rtlWithin(makatiRow).getByText("In Progress")).toBeInTheDocument();
    });

    it("shows Resolved status badge in the Business Bay row", async () => {
      await renderAndLoad();
      const { within: rtlWithin } = await import("@testing-library/react");
      const bbCell = screen.getByText("Business Bay");
      const bbRow = bbCell.closest("tr")!;
      expect(rtlWithin(bbRow).getByText("Resolved")).toBeInTheDocument();
    });

    it("shows reply count for items with replies", async () => {
      await renderAndLoad();
      // INC-002 has 2 replies
      await waitFor(() => {
        expect(screen.getByText("2")).toBeInTheDocument();
      });
    });

    it("View links point to correct incident detail URLs", async () => {
      await renderAndLoad();
      const viewLinks = screen.getAllByRole("link", { name: /View/i });
      const hrefs = viewLinks.map((l) => l.getAttribute("href"));
      expect(hrefs).toContain("/admin/incidents/INC-001");
      expect(hrefs).toContain("/admin/incidents/INC-002");
      expect(hrefs).toContain("/admin/incidents/INC-003");
    });

    it("shows 'No incidents found' when list is empty", async () => {
      const emptyFetch = makeFetch([
        { match: "/api/admin/incidents", method: "GET", body: { items: [] } },
      ]);
      await renderPage(emptyFetch);
      await waitFor(() => {
        expect(screen.getByText(/No incidents found/i)).toBeInTheDocument();
      });
    });

    it("shows 'Try adjusting your filters' hint when empty", async () => {
      const emptyFetch = makeFetch([
        { match: "/api/admin/incidents", method: "GET", body: { items: [] } },
      ]);
      await renderPage(emptyFetch);
      await waitFor(() => {
        expect(screen.getByText(/Try adjusting your filters/i)).toBeInTheDocument();
      });
    });
  });

  // ── Error / API ──────────────────────────────────────────────────────────────
  describe("API errors", () => {
    it("shows error message when fetch returns 500", async () => {
      const errorFetch = makeFetch([
        { match: "/api/admin/incidents", method: "GET", status: 500, body: "Internal server error" },
      ]);
      await renderPage(errorFetch);
      await waitFor(() => {
        expect(screen.getByText(/Internal server error|Failed to load/i)).toBeInTheDocument();
      });
    });

    it("Refresh button triggers fetchList", async () => {
      const fetchMock = makeFetch();
      await renderAndLoad(fetchMock);

      const prevCount = (fetchMock as ReturnType<typeof vi.fn>).mock.calls.length;
      fireEvent.click(screen.getByRole("button", { name: /Refresh/i }));

      await waitFor(() => {
        expect((fetchMock as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(prevCount);
      });
    });

    it("fetch is called with correct status filter when status is changed", async () => {
      const fetchMock = makeFetch();
      await renderAndLoad(fetchMock);

      const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
      const statusSelect = selects.find((s) =>
        Array.from(s.querySelectorAll("option")).some(
          (o) => (o as HTMLOptionElement).text === "Acknowledged"
        )
      )!;

      fireEvent.change(statusSelect, { target: { value: "resolved" } });

      await waitFor(() => {
        const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls;
        const resolvedCall = calls.find((args) => String(args[0]).includes("status=resolved"));
        expect(resolvedCall).toBeTruthy();
      });
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// DETAIL PAGE
// ══════════════════════════════════════════════════════════════════════════════

describe("AdminIncidentDetailPage (detail)", () => {
  async function renderDetailPage(fetchMock = makeFetch()) {
    await setupAuth();
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminIncidentDetailPage />);
  }

  async function renderAndLoad(fetchMock = makeFetch(), waitForText = "Product Issue") {
    await renderDetailPage(fetchMock);
    await screen.findByText(waitForText, {}, { timeout: 5000 });
  }

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
    mockRouter.back.mockReset();
    mockRouter.push.mockReset();
  });

  // ── Loading / error states ───────────────────────────────────────────────────
  describe("loading and error states", () => {
    it("shows error when fetch returns 404", async () => {
      const errorFetch = makeFetch([
        { match: "/api/admin/incidents/INC-001", method: "GET", status: 404, body: "Not found" },
      ]);
      await renderDetailPage(errorFetch);
      await waitFor(() => {
        expect(screen.getByText(/Not found|Incident not found/i)).toBeInTheDocument();
      });
    });

    it("shows error when fetch returns 500", async () => {
      const errorFetch = makeFetch([
        { match: "/api/admin/incidents/INC-001", method: "GET", status: 500, body: "Server error" },
      ]);
      await renderDetailPage(errorFetch);
      await waitFor(() => {
        expect(screen.getByText(/Server error|Failed to load/i)).toBeInTheDocument();
      });
    });

    it("shows 'Incident not found' when item is null", async () => {
      const nullFetch = makeFetch([
        { match: "/api/admin/incidents/INC-001", method: "GET", body: { item: null } },
      ]);
      await renderDetailPage(nullFetch);
      await waitFor(() => {
        expect(screen.getByText(/Incident not found/i)).toBeInTheDocument();
      });
    });
  });

  // ── Incident details display ─────────────────────────────────────────────────
  describe("incident details", () => {
    it("shows category as heading", async () => {
      await renderAndLoad();
      expect(screen.getByText("Product Issue")).toBeInTheDocument();
    });

    it("shows severity label", async () => {
      await renderAndLoad();
      expect(screen.getByText(/Medium severity/i)).toBeInTheDocument();
    });

    it("shows branch in meta grid", async () => {
      await renderAndLoad();
      expect(screen.getByText("BGC")).toBeInTheDocument();
    });

    it("shows city in meta grid", async () => {
      await renderAndLoad();
      expect(screen.getByText(/Manila/i)).toBeInTheDocument();
    });

    it("shows reporter name in meta grid", async () => {
      await renderAndLoad();
      expect(screen.getByText("Maria Santos")).toBeInTheDocument();
    });

    it("shows description text", async () => {
      await renderAndLoad();
      expect(
        screen.getByText(/Food quality problem at counter/i)
      ).toBeInTheDocument();
    });

    it("shows 'Description' label", async () => {
      await renderAndLoad();
      expect(screen.getByText("Description")).toBeInTheDocument();
    });
  });

  // ── Status stepper ───────────────────────────────────────────────────────────
  describe("status stepper", () => {
    it("renders Progress label (uppercase via CSS, DOM text is 'Progress')", async () => {
      await renderAndLoad();
      // The label is rendered with CSS `uppercase` class — DOM text remains "Progress"
      expect(screen.getByText("Progress")).toBeInTheDocument();
    });

    it("renders all 4 step labels (New/Acknowledged/In Progress/Resolved)", async () => {
      await renderAndLoad();
      // Steps are hidden on small screens but rendered (hidden via CSS class, not conditional)
      expect(screen.getAllByText(/New/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Acknowledged/i).length).toBeGreaterThanOrEqual(1);
    });

    it("status step 1 is current (new) — shows step number 1", async () => {
      await renderAndLoad();
      expect(screen.getByText("1")).toBeInTheDocument();
    });
  });

  // ── Navigation ───────────────────────────────────────────────────────────────
  describe("navigation", () => {
    it("Back to List button calls router.back()", async () => {
      await renderAndLoad();
      const backBtn = screen.getByRole("button", { name: /Back to List/i });
      fireEvent.click(backBtn);
      expect(mockRouter.back).toHaveBeenCalledTimes(1);
    });
  });

  // ── Status update ────────────────────────────────────────────────────────────
  describe("status update", () => {
    it("renders all four status buttons", async () => {
      await renderAndLoad();
      expect(screen.getByRole("button", { name: /^New$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Acknowledged$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^In Progress$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Resolved$/i })).toBeInTheDocument();
    });

    it("current status (New) button is disabled", async () => {
      await renderAndLoad();
      expect(screen.getByRole("button", { name: /^New$/i })).toBeDisabled();
    });

    it("non-current status buttons are enabled", async () => {
      await renderAndLoad();
      expect(screen.getByRole("button", { name: /^Acknowledged$/i })).not.toBeDisabled();
      expect(screen.getByRole("button", { name: /^In Progress$/i })).not.toBeDisabled();
      expect(screen.getByRole("button", { name: /^Resolved$/i })).not.toBeDisabled();
    });

    it("clicking Acknowledged calls PATCH /status with correct payload", async () => {
      const fetchMock = makeFetch();
      await renderAndLoad(fetchMock);

      fireEvent.click(screen.getByRole("button", { name: /^Acknowledged$/i }));

      await waitFor(() => {
        const patchCalls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls.filter(
          (args: unknown[]) =>
            String(args[0]).includes("/status") &&
            String((args[1] as RequestInit)?.method).toUpperCase() === "PATCH"
        );
        expect(patchCalls.length).toBeGreaterThanOrEqual(1);
        const body = JSON.parse((patchCalls[0][1] as RequestInit).body as string);
        expect(body.status).toBe("acknowledged");
      });
    });

    it("clicking Resolved calls PATCH /status with status=resolved", async () => {
      const fetchMock = makeFetch();
      await renderAndLoad(fetchMock);

      fireEvent.click(screen.getByRole("button", { name: /^Resolved$/i }));

      await waitFor(() => {
        const patchCalls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls.filter(
          (args: unknown[]) => String(args[0]).includes("/status") && String((args[1] as RequestInit)?.method).toUpperCase() === "PATCH"
        );
        const body = JSON.parse((patchCalls[0][1] as RequestInit).body as string);
        expect(body.status).toBe("resolved");
      });
    });

    it("successful status change updates the item state (current button changes)", async () => {
      const fetchMock = makeFetch();
      await renderAndLoad(fetchMock);

      fireEvent.click(screen.getByRole("button", { name: /^Acknowledged$/i }));

      await waitFor(() => {
        // After update, "Acknowledged" should now be the current (disabled) button
        expect(screen.getByRole("button", { name: /^Acknowledged$/i })).toBeDisabled();
        // "New" should no longer be disabled
        expect(screen.getByRole("button", { name: /^New$/i })).not.toBeDisabled();
      });
    });

    it("dispatchBadgeRefresh called with 'adminIncidents' after status change", async () => {
      const { dispatchBadgeRefresh } = await import("@/lib/badgeEvents");
      vi.mocked(dispatchBadgeRefresh).mockClear();

      await renderAndLoad();

      fireEvent.click(screen.getByRole("button", { name: /^Resolved$/i }));

      await waitFor(() => {
        expect(vi.mocked(dispatchBadgeRefresh)).toHaveBeenCalledWith("adminIncidents");
      });
    });

    it("shows status error on PATCH failure", async () => {
      const errorFetch = makeFetch([
        { match: "/status", method: "PATCH", status: 500, body: "Status update failed" },
      ]);
      await renderAndLoad(errorFetch);

      fireEvent.click(screen.getByRole("button", { name: /^Acknowledged$/i }));

      await waitFor(() => {
        expect(screen.getByText(/Status update failed|Failed to update/i)).toBeInTheDocument();
      });
    });
  });

  // ── HQ Internal Notes ────────────────────────────────────────────────────────
  describe("HQ internal notes", () => {
    it("shows 'HQ Internal Notes' section header", async () => {
      await renderAndLoad();
      expect(screen.getByText("HQ Internal Notes")).toBeInTheDocument();
    });

    it("shows 'No internal notes yet' when notes array is empty", async () => {
      await renderAndLoad();
      expect(screen.getByText(/No internal notes yet/i)).toBeInTheDocument();
    });

    it("Save Note button is disabled when textarea is empty", async () => {
      await renderAndLoad();
      expect(screen.getByRole("button", { name: /Save Note/i })).toBeDisabled();
    });

    it("Save Note button is enabled after typing", async () => {
      await renderAndLoad();
      const textarea = screen.getByPlaceholderText(/Record observations/i);
      fireEvent.change(textarea, { target: { value: "Root cause: training gap" } });
      expect(screen.getByRole("button", { name: /Save Note/i })).not.toBeDisabled();
    });

    it("Save Note calls POST /notes with correct payload", async () => {
      const fetchMock = makeFetch();
      await renderAndLoad(fetchMock);

      const textarea = screen.getByPlaceholderText(/Record observations/i);
      fireEvent.change(textarea, { target: { value: "Root cause: training gap" } });
      fireEvent.click(screen.getByRole("button", { name: /Save Note/i }));

      await waitFor(() => {
        const postCalls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls.filter(
          (args: unknown[]) =>
            String(args[0]).includes("/notes") &&
            String((args[1] as RequestInit)?.method).toUpperCase() === "POST"
        );
        expect(postCalls.length).toBeGreaterThanOrEqual(1);
        const body = JSON.parse((postCalls[0][1] as RequestInit).body as string);
        expect(body.note).toBe("Root cause: training gap");
      });
    });

    it("Save Note shows success message after saving", async () => {
      await renderAndLoad();
      const textarea = screen.getByPlaceholderText(/Record observations/i);
      fireEvent.change(textarea, { target: { value: "Some note text" } });
      fireEvent.click(screen.getByRole("button", { name: /Save Note/i }));

      await waitFor(() => {
        expect(screen.getByText(/Note saved/i)).toBeInTheDocument();
      });
    });

    it("Save Note clears textarea after success", async () => {
      await renderAndLoad();
      const textarea = screen.getByPlaceholderText(/Record observations/i) as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: "Some note text" } });
      fireEvent.click(screen.getByRole("button", { name: /Save Note/i }));

      await waitFor(() => {
        expect(textarea.value).toBe("");
      });
    });

    it("Save Note shows error on API failure", async () => {
      const errorFetch = makeFetch([
        { match: "/notes", method: "POST", status: 500, body: "Note save failed" },
      ]);
      await renderAndLoad(errorFetch);

      const textarea = screen.getByPlaceholderText(/Record observations/i);
      fireEvent.change(textarea, { target: { value: "Some note" } });
      fireEvent.click(screen.getByRole("button", { name: /Save Note/i }));

      await waitFor(() => {
        expect(screen.getByText(/Note save failed|Failed to save/i)).toBeInTheDocument();
      });
    });

    it("renders existing internal notes", async () => {
      const detailWithNotes = {
        ...INCIDENT_DETAIL,
        internal_notes: [
          {
            id: 1,
            report_id: "INC-001",
            author_name: "Jay Test",
            note: "This is an important HQ observation.",
            created_at: "2026-05-10T11:00:00Z",
          },
        ],
      };
      const fetchMock = makeFetch([
        {
          match: "/api/admin/incidents/INC-001",
          method: "GET",
          body: { item: detailWithNotes },
        },
      ]);
      await renderAndLoad(fetchMock);
      await waitFor(() => {
        expect(screen.getByText("This is an important HQ observation.")).toBeInTheDocument();
        expect(screen.getByText("Jay Test")).toBeInTheDocument();
      });
    });

    it("shows note count badge when notes exist", async () => {
      const detailWithNotes = {
        ...INCIDENT_DETAIL,
        internal_notes: [
          { id: 1, report_id: "INC-001", author_name: "Jay Test", note: "Note one", created_at: "2026-05-10T11:00:00Z" },
          { id: 2, report_id: "INC-001", author_name: "Jay Test", note: "Note two", created_at: "2026-05-10T12:00:00Z" },
        ],
      };
      const fetchMock = makeFetch([
        { match: "/api/admin/incidents/INC-001", method: "GET", body: { item: detailWithNotes } },
      ]);
      await renderAndLoad(fetchMock, "Product Issue");
      await waitFor(() => {
        expect(screen.getByText(/2 notes/i)).toBeInTheDocument();
      });
    });
  });

  // ── HQ Comments & Replies ────────────────────────────────────────────────────
  describe("HQ comments and replies", () => {
    it("shows 'HQ Comments & Replies' section", async () => {
      await renderAndLoad();
      expect(screen.getByText(/HQ Comments.*Replies/i)).toBeInTheDocument();
    });

    it("shows 'No replies yet' when replies array is empty", async () => {
      await renderAndLoad();
      expect(screen.getByText(/No replies yet/i)).toBeInTheDocument();
    });

    it("Send Reply button is disabled when textarea is empty", async () => {
      await renderAndLoad();
      expect(screen.getByRole("button", { name: /Send Reply/i })).toBeDisabled();
    });

    it("Send Reply button is enabled after typing", async () => {
      await renderAndLoad();
      const textarea = screen.getByPlaceholderText(/Write a comment/i);
      fireEvent.change(textarea, { target: { value: "Thank you for reporting." } });
      expect(screen.getByRole("button", { name: /Send Reply/i })).not.toBeDisabled();
    });

    it("Send Reply calls POST /replies with correct payload", async () => {
      const fetchMock = makeFetch();
      await renderAndLoad(fetchMock);

      const textarea = screen.getByPlaceholderText(/Write a comment/i);
      fireEvent.change(textarea, { target: { value: "Thank you for reporting." } });
      fireEvent.click(screen.getByRole("button", { name: /Send Reply/i }));

      await waitFor(() => {
        const postCalls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls.filter(
          (args: unknown[]) =>
            String(args[0]).includes("/replies") &&
            String((args[1] as RequestInit)?.method).toUpperCase() === "POST"
        );
        expect(postCalls.length).toBeGreaterThanOrEqual(1);
        const body = JSON.parse((postCalls[0][1] as RequestInit).body as string);
        expect(body.message).toBe("Thank you for reporting.");
        expect(body.author_role).toBe("HQ");
      });
    });

    it("Send Reply shows success message", async () => {
      await renderAndLoad();
      const textarea = screen.getByPlaceholderText(/Write a comment/i);
      fireEvent.change(textarea, { target: { value: "We will investigate." } });
      fireEvent.click(screen.getByRole("button", { name: /Send Reply/i }));

      await waitFor(() => {
        expect(screen.getByText(/Reply sent/i)).toBeInTheDocument();
      });
    });

    it("Send Reply clears textarea after success", async () => {
      await renderAndLoad();
      const textarea = screen.getByPlaceholderText(/Write a comment/i) as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: "We will investigate." } });
      fireEvent.click(screen.getByRole("button", { name: /Send Reply/i }));

      await waitFor(() => {
        expect(textarea.value).toBe("");
      });
    });

    it("Send Reply shows error on API failure", async () => {
      const errorFetch = makeFetch([
        { match: "/replies", method: "POST", status: 500, body: "Reply failed" },
      ]);
      await renderAndLoad(errorFetch);

      const textarea = screen.getByPlaceholderText(/Write a comment/i);
      fireEvent.change(textarea, { target: { value: "Some reply" } });
      fireEvent.click(screen.getByRole("button", { name: /Send Reply/i }));

      await waitFor(() => {
        expect(screen.getByText(/Reply failed|Failed to send reply/i)).toBeInTheDocument();
      });
    });

    it("renders existing replies", async () => {
      const detailWithReplies = {
        ...INCIDENT_DETAIL,
        replies: [
          {
            id: "R-1",
            author_name: "Jay Test",
            author_role: "HQ",
            message: "We are looking into this issue.",
            created_at: "2026-05-10T12:00:00Z",
          },
        ],
      };
      const fetchMock = makeFetch([
        { match: "/api/admin/incidents/INC-001", method: "GET", body: { item: detailWithReplies } },
      ]);
      await renderAndLoad(fetchMock);
      await waitFor(() => {
        expect(screen.getByText("We are looking into this issue.")).toBeInTheDocument();
      });
    });
  });

  // ── Attachments ───────────────────────────────────────────────────────────────
  describe("attachments", () => {
    it("does NOT show Attachments section when no attachments", async () => {
      await renderAndLoad();
      expect(screen.queryByText("Attachments")).not.toBeInTheDocument();
    });

    it("shows Attachments section when attachments exist", async () => {
      const detailWithAttachment = {
        ...INCIDENT_DETAIL,
        attachments: [
          {
            id: "ATT-1",
            file_name: "photo.jpg",
            web_view_link: "https://drive.google.com/file/1/view",
            mime_type: "image/jpeg",
            uploader_name: "Maria Santos",
          },
        ],
      };
      const fetchMock = makeFetch([
        { match: "/api/admin/incidents/INC-001", method: "GET", body: { item: detailWithAttachment } },
      ]);
      await renderAndLoad(fetchMock);
      await waitFor(() => {
        expect(screen.getByText("Attachments")).toBeInTheDocument();
      });
    });

    it("renders non-image attachment as a link with filename", async () => {
      const detailWithPdf = {
        ...INCIDENT_DETAIL,
        attachments: [
          {
            id: "ATT-2",
            file_name: "report.pdf",
            web_view_link: "https://drive.google.com/file/2/view",
            mime_type: "application/pdf",
            uploader_name: "Maria Santos",
          },
        ],
      };
      const fetchMock = makeFetch([
        { match: "/api/admin/incidents/INC-001", method: "GET", body: { item: detailWithPdf } },
      ]);
      await renderAndLoad(fetchMock);
      await waitFor(() => {
        expect(screen.getByText("report.pdf")).toBeInTheDocument();
      });
    });
  });
});
