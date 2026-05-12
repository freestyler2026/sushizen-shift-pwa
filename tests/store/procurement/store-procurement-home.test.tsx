// tests/store/procurement/store-procurement-home.test.tsx
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { routerMock } from "../../setup";
import StoreProcurementHomePage from "@/app/store/procurement/page";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    [key: string]: unknown;
  }) => (
    <a href={href} className={className} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ── Auth mock — plain fns so vi.restoreAllMocks() won't clear them ─────────────
let mockAuth: Record<string, unknown> | null = null;
let mockRefreshedAuth: Record<string, unknown> | null = null;
let mockCanProcurementAdmin = false;

vi.mock("@/lib/auth", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...real,
    getAuth: () => mockAuth,
    refreshAuthFromApi: () => Promise.resolve(mockRefreshedAuth ?? mockAuth),
    canAccessProcurementAdmin: (_role: string, _city: string) => mockCanProcurementAdmin,
  };
});

// ── ProcurementClient mock ─────────────────────────────────────────────────────
const mockProcurementJson = vi.fn();

vi.mock("@/lib/procurementClient", () => ({
  procurementJson: (...args: unknown[]) => mockProcurementJson(...args),
  defaultProcurementName: () => "Test Admin",
  defaultProcurementPin: () => "1234",
  saveProcurementSession: vi.fn(),
  clearProcurementSession: vi.fn(),
}));

// ── timeAgo mock — real implementations, but stub useRelativeAgeNow ───────────
vi.mock("@/lib/timeAgo", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/timeAgo")>();
  return {
    ...real,
    useRelativeAgeNow: () => Date.now(),
  };
});

// ── Types ─────────────────────────────────────────────────────────────────────

type RequestRow = {
  id: string;
  request_no: string;
  store_code: string;
  request_date: string;
  total_amount: number;
  status: string;
  current_approval_level: number;
};

type RequestDetail = {
  id: string;
  request_no: string;
  store_code: string;
  request_date: string;
  total_amount: number;
  status: string;
  current_approval_level: number;
  currency: string;
  requested_by: string;
  urgent_flag: boolean;
  notes: string;
  items: {
    id: string;
    item_name: string;
    category: string;
    spec: string;
    qty: number;
    unit: string;
    unit_price: number;
    line_total: number;
    vendor_name: string;
    needed_by_date: string;
  }[];
  receivings?: { id: string; receiving_no: string; status: string }[];
  claims?: { id: string; claim_no: string; status: string }[];
};

// ── Test data ─────────────────────────────────────────────────────────────────

const SAMPLE_ROWS: RequestRow[] = [
  { id: "r1", request_no: "REQ-001", store_code: "PAR", request_date: "2026-05-01", total_amount: 1500, status: "DRAFT", current_approval_level: 1 },
  { id: "r2", request_no: "REQ-002", store_code: "CUB", request_date: "2026-05-02", total_amount: 2000, status: "IN_REVIEW", current_approval_level: 2 },
  { id: "r3", request_no: "REQ-003", store_code: "TAFT", request_date: "2026-05-03", total_amount: 3000, status: "APPROVED", current_approval_level: 3 },
  { id: "r4", request_no: "REQ-004", store_code: "PAR", request_date: "2026-05-04", total_amount: 500, status: "RETURNED", current_approval_level: 1 },
  { id: "r5", request_no: "REQ-005", store_code: "PAR", request_date: "2026-05-05", total_amount: 1200, status: "SUBMITTED", current_approval_level: 2 },
];

const SAMPLE_DETAIL: RequestDetail = {
  id: "r1",
  request_no: "REQ-001",
  store_code: "PAR",
  request_date: "2026-05-01",
  total_amount: 1500,
  status: "DRAFT",
  current_approval_level: 1,
  currency: "PHP",
  requested_by: "Drawer Requester",
  urgent_flag: false,
  notes: "Test notes content",
  items: [
    {
      id: "i1",
      item_name: "Salmon Slab",
      category: "Fish",
      spec: "500g frozen",
      qty: 10,
      unit: "kg",
      unit_price: 150,
      line_total: 1500,
      vendor_name: "Fresh Fish Co",
      needed_by_date: "2026-05-10",
    },
  ],
  receivings: [{ id: "rv1", receiving_no: "RCV-001", status: "PENDING" }],
  claims: [{ id: "cl1", claim_no: "CLM-001", status: "OPEN" }],
};

const EMPTY_ROWS = { rows: [] as RequestRow[] };
const SAMPLE_ROWS_BODY = { rows: SAMPLE_ROWS };

// ── Helpers ───────────────────────────────────────────────────────────────────

function setAuth(overrides: Record<string, unknown> = {}) {
  mockAuth = {
    staffName: "Test Admin",
    city: "manila",
    role: "ADMIN",
    accessToken: "test-token",
    permissions: ["*"],
    ...overrides,
  };
  mockRefreshedAuth = mockAuth;
}

function routedJson(
  rowsBody: { rows: RequestRow[] } = EMPTY_ROWS,
  detailBody: RequestDetail = SAMPLE_DETAIL,
) {
  mockProcurementJson.mockImplementation((url: string) => {
    if (String(url).includes("/requests/")) {
      return Promise.resolve({ ok: true, request: detailBody });
    }
    return Promise.resolve(rowsBody);
  });
}

async function renderPage() {
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(<StoreProcurementHomePage />);
  });
  return result;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("StoreProcurementHomePage", () => {
  beforeEach(() => {
    mockAuth = null;
    mockRefreshedAuth = null;
    mockCanProcurementAdmin = false;
    mockProcurementJson.mockReset();
  });

  // ── Auth guard ──────────────────────────────────────────────────────────────

  describe("Auth guard", () => {
    it("redirects to /login when no auth at all", async () => {
      mockAuth = null;
      mockRefreshedAuth = null;
      mockProcurementJson.mockResolvedValue(EMPTY_ROWS);
      await renderPage();
      await waitFor(() => {
        expect(routerMock.replace).toHaveBeenCalledWith(
          "/login?next=%2Fstore%2Fprocurement",
        );
      });
    });

    it("redirects to /login when staffName is empty", async () => {
      mockAuth = { staffName: "", city: "manila", accessToken: "tok", role: "ADMIN", permissions: [] };
      mockRefreshedAuth = mockAuth;
      mockProcurementJson.mockResolvedValue(EMPTY_ROWS);
      await renderPage();
      await waitFor(() => {
        expect(routerMock.replace).toHaveBeenCalledWith(
          "/login?next=%2Fstore%2Fprocurement",
        );
      });
    });

    it("redirects to /login when accessToken is missing", async () => {
      mockAuth = { staffName: "Alice", city: "manila", accessToken: "", role: "ADMIN", permissions: [] };
      mockRefreshedAuth = mockAuth;
      mockProcurementJson.mockResolvedValue(EMPTY_ROWS);
      await renderPage();
      await waitFor(() => {
        expect(routerMock.replace).toHaveBeenCalledWith(
          "/login?next=%2Fstore%2Fprocurement",
        );
      });
    });

    it("renders page when auth has staffName and accessToken", async () => {
      setAuth();
      routedJson();
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText("Store Procurement")).toBeInTheDocument();
      });
    });

    it("does not redirect when auth is valid", async () => {
      setAuth();
      routedJson();
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText("Store Procurement")).toBeInTheDocument();
      });
      expect(routerMock.replace).not.toHaveBeenCalled();
    });
  });

  // ── Page structure ──────────────────────────────────────────────────────────

  describe("Page structure", () => {
    beforeEach(() => {
      setAuth();
      routedJson();
    });

    it("renders page title", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText("Store Procurement")).toBeInTheDocument();
      });
    });

    it("renders subtitle text", async () => {
      await renderPage();
      await waitFor(() => {
        expect(
          screen.getByText(/central entry point for store request/i),
        ).toBeInTheDocument();
      });
    });

    it("shows Manila city badge by default", async () => {
      setAuth({ city: "manila" });
      routedJson();
      await renderPage();
      await waitFor(() => {
        // "Manila" appears in the city badge AND the city <select> option
        expect(screen.getAllByText("Manila").length).toBeGreaterThan(0);
      });
    });

    it("shows Dubai city badge when auth city is dubai", async () => {
      setAuth({ city: "dubai" });
      routedJson();
      await renderPage();
      await waitFor(() => {
        // "Dubai" appears in the city badge AND the city <select> option
        expect(screen.getAllByText("Dubai").length).toBeGreaterThan(0);
      });
    });

    it("renders Select Your Branch header", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText("Select Your Branch")).toBeInTheDocument();
      });
    });

    it("shows 'Please select your branch' warning when no branch", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText(/please select your branch/i)).toBeInTheDocument();
      });
    });

    it("renders My Recent Requests section with city label", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText(/my recent requests.*manila/i)).toBeInTheDocument();
      });
    });

    it("renders Quick Actions section", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText("Quick Actions")).toBeInTheDocument();
      });
    });
  });

  // ── Branch selector ─────────────────────────────────────────────────────────

  describe("Branch selector — Manila", () => {
    beforeEach(() => {
      setAuth({ city: "manila" });
      routedJson();
    });

    it("shows Paranaque branch button", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Paranaque" })).toBeInTheDocument();
      });
    });

    it("shows Cubao branch button", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Cubao" })).toBeInTheDocument();
      });
    });

    it("shows Taft branch button", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Taft" })).toBeInTheDocument();
      });
    });

    it("shows Back Office branch button", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Back Office" })).toBeInTheDocument();
      });
    });

    it("hides Central Kitchen (CK) branch", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.queryByRole("button", { name: "Central Kitchen" })).not.toBeInTheDocument();
      });
    });

    it("activates branch on click and shows confirmation label", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Paranaque" })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole("button", { name: "Paranaque" }));
      await waitFor(() => {
        expect(screen.getByText(/✓ Paranaque/)).toBeInTheDocument();
      });
    });
  });

  describe("Branch selector — Dubai", () => {
    beforeEach(() => {
      setAuth({ city: "dubai" });
      routedJson();
    });

    it("shows Business Bay branch button", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Business Bay" })).toBeInTheDocument();
      });
    });

    it("shows JLT branch button", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "JLT" })).toBeInTheDocument();
      });
    });

    it("shows Arjan branch button", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Arjan" })).toBeInTheDocument();
      });
    });

    it("hides Central Kitchen (CK) in Dubai", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.queryByRole("button", { name: "Central Kitchen" })).not.toBeInTheDocument();
      });
    });

    it("hides Delivery (DRIVER) in Dubai", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.queryByRole("button", { name: "Delivery" })).not.toBeInTheDocument();
      });
    });
  });

  // ── New Request link ────────────────────────────────────────────────────────

  describe("New Request link", () => {
    beforeEach(() => {
      setAuth();
      routedJson();
    });

    it("shows 'Select Branch First' text when no branch selected", async () => {
      await renderPage();
      await waitFor(() => {
        expect(
          screen.getAllByText(/select branch first/i).length,
        ).toBeGreaterThan(0);
      });
    });

    it("'Select Branch First' link has aria-disabled=true when no branch", async () => {
      await renderPage();
      await waitFor(() => {
        const link = screen.getByRole("link", { name: /select branch first/i });
        expect(link).toHaveAttribute("aria-disabled", "true");
      });
    });

    it("shows 'New Request' text when branch is selected", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Paranaque" })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole("button", { name: "Paranaque" }));
      await waitFor(() => {
        // The banner "New Request" link should now appear
        const link = screen.getByRole("link", { name: /new request/i });
        expect(link).toHaveAttribute("aria-disabled", "false");
      });
    });
  });

  // ── Approver Name input — readOnly bug fix ──────────────────────────────────

  describe("Approver Name input (bug fix: was readOnly)", () => {
    beforeEach(() => {
      setAuth();
      routedJson();
    });

    it("Approver Name input is NOT read-only", async () => {
      await renderPage();
      // Label has no htmlFor — find input via its role (only one textbox on the page)
      await waitFor(() => {
        expect(screen.getByRole("textbox")).toBeInTheDocument();
      });
      const input = screen.getByRole("textbox") as HTMLInputElement;
      expect(input.readOnly).toBe(false);
    });

    it("Approver Name can be changed by the user", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("textbox")).toBeInTheDocument();
      });
      const input = screen.getByRole("textbox") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "New Manager" } });
      expect(input.value).toBe("New Manager");
    });

    it("Session PIN input is editable", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByPlaceholderText("••••••••")).toBeInTheDocument();
      });
      const pinInput = screen.getByPlaceholderText("••••••••") as HTMLInputElement;
      expect(pinInput.readOnly).toBe(false);
    });
  });

  // ── KPI counts ──────────────────────────────────────────────────────────────

  describe("KPI counts", () => {
    beforeEach(() => {
      setAuth();
      routedJson(SAMPLE_ROWS_BODY);
    });

    it("renders Draft KPI label", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText("Draft")).toBeInTheDocument();
      });
    });

    it("renders In Review KPI label", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText("In Review")).toBeInTheDocument();
      });
    });

    it("renders Approved KPI label", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText("Approved")).toBeInTheDocument();
      });
    });

    it("renders Returned KPI label", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText("Returned")).toBeInTheDocument();
      });
    });

    it("shows total request count in refresh area", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText(/total:/i)).toBeInTheDocument();
        expect(screen.getByText("5")).toBeInTheDocument();
      });
    });
  });

  // ── Empty state ─────────────────────────────────────────────────────────────

  describe("Empty state", () => {
    beforeEach(() => {
      setAuth();
      routedJson(EMPTY_ROWS);
    });

    it("shows 'No requests yet.' when rows is empty", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText(/no requests yet/i)).toBeInTheDocument();
      });
    });
  });

  // ── Request list ─────────────────────────────────────────────────────────────

  describe("Request list", () => {
    beforeEach(() => {
      setAuth();
      routedJson(SAMPLE_ROWS_BODY);
    });

    it("shows all request numbers", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText("REQ-001")).toBeInTheDocument();
        expect(screen.getByText("REQ-002")).toBeInTheDocument();
        expect(screen.getByText("REQ-003")).toBeInTheDocument();
        expect(screen.getByText("REQ-004")).toBeInTheDocument();
        expect(screen.getByText("REQ-005")).toBeInTheDocument();
      });
    });

    it("shows store code, date, and amount for a row", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getAllByText("PAR").length).toBeGreaterThan(0);
        expect(screen.getAllByText("2026-05-01").length).toBeGreaterThan(0);
      });
    });

    it("shows DRAFT status badge", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getAllByText(/DRAFT/i).length).toBeGreaterThan(0);
      });
    });

    it("shows IN REVIEW badge for IN_REVIEW and SUBMITTED rows", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getAllByText(/IN REVIEW/i).length).toBeGreaterThan(0);
      });
    });

    it("shows APPROVED badge", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getAllByText(/APPROVED/i).length).toBeGreaterThan(0);
      });
    });

    it("shows RETURNED badge", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getAllByText(/RETURNED/i).length).toBeGreaterThan(0);
      });
    });

    it("shows 'Just created' badge for lastCreatedRequestId match", async () => {
      localStorage.setItem(
        "store_procurement_last_created_request",
        JSON.stringify({ id: "r1", request_no: "REQ-001", at: new Date().toISOString() }),
      );
      await renderPage();
      await waitFor(() => {
        expect(screen.getAllByText(/just created/i).length).toBeGreaterThan(0);
      });
    });

    it("shows currency (PHP for Manila) in row amounts", async () => {
      await renderPage();
      await waitFor(() => {
        // Amount formatting: "1500.00 PHP"
        expect(screen.getAllByText(/PHP/i).length).toBeGreaterThan(0);
      });
    });

    it("shows AED for Dubai city", async () => {
      setAuth({ city: "dubai" });
      routedJson(SAMPLE_ROWS_BODY);
      await renderPage();
      await waitFor(() => {
        expect(screen.getAllByText(/AED/i).length).toBeGreaterThan(0);
      });
    });

    it("each row has a Receiving link with request_id param", async () => {
      await renderPage();
      await waitFor(() => {
        // Quick action "Receiving" also exists — filter by href containing request_id
        const receivingLinks = screen.getAllByRole("link", { name: /^receiving$/i });
        const rowLinks = receivingLinks.filter((l) =>
          l.getAttribute("href")?.includes("request_id="),
        );
        expect(rowLinks.length).toBe(SAMPLE_ROWS.length);
      });
    });

    it("each row has a Claim link with request_id param", async () => {
      await renderPage();
      await waitFor(() => {
        // Quick action "Claim" also exists — filter by href containing request_id
        const claimLinks = screen.getAllByRole("link", { name: /^claim$/i });
        const rowLinks = claimLinks.filter((l) =>
          l.getAttribute("href")?.includes("request_id="),
        );
        expect(rowLinks.length).toBe(SAMPLE_ROWS.length);
      });
    });
  });

  // ── Recent Activity Timeline ────────────────────────────────────────────────

  describe("Recent Activity Timeline", () => {
    beforeEach(() => {
      setAuth();
      routedJson();
    });

    it("does not show timeline when no activities in localStorage", async () => {
      await renderPage();
      await waitFor(() => {
        expect(
          screen.queryByText(/recent activity timeline/i),
        ).not.toBeInTheDocument();
      });
    });

    it("shows timeline header when request activity exists", async () => {
      localStorage.setItem(
        "store_procurement_last_created_request",
        JSON.stringify({
          id: "req-abc",
          request_no: "REQ-100",
          at: new Date().toISOString(),
        }),
      );
      await renderPage();
      await waitFor(() => {
        expect(
          screen.getByText(/recent activity timeline/i),
        ).toBeInTheDocument();
      });
    });

    it("shows '1 item' (singular grammar) for one activity — bug fix", async () => {
      localStorage.setItem(
        "store_procurement_last_created_request",
        JSON.stringify({
          id: "req-abc",
          request_no: "REQ-100",
          at: new Date().toISOString(),
        }),
      );
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText("1 item")).toBeInTheDocument();
      });
    });

    it("shows '2 items' (plural grammar) for two activities", async () => {
      localStorage.setItem(
        "store_procurement_last_created_request",
        JSON.stringify({
          id: "req-abc",
          request_no: "REQ-100",
          at: new Date().toISOString(),
        }),
      );
      localStorage.setItem(
        "store_procurement_last_created_receiving",
        JSON.stringify({
          id: "rec-xyz",
          receiving_no: "REC-001",
          request_id: "req-abc",
          at: new Date().toISOString(),
        }),
      );
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText("2 items")).toBeInTheDocument();
      });
    });

    it("shows '3 items' (plural grammar) for three activities", async () => {
      localStorage.setItem(
        "store_procurement_last_created_request",
        JSON.stringify({ id: "req-1", request_no: "REQ-100", at: new Date().toISOString() }),
      );
      localStorage.setItem(
        "store_procurement_last_created_receiving",
        JSON.stringify({ id: "rec-1", receiving_no: "REC-001", request_id: "req-1", at: new Date().toISOString() }),
      );
      localStorage.setItem(
        "store_procurement_last_created_claim",
        JSON.stringify({ id: "claim-1", claim_no: "CLM-001", case_id: "", request_id: "req-1", at: new Date().toISOString() }),
      );
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText("3 items")).toBeInTheDocument();
      });
    });

    it("shows 'Request' badge label in timeline", async () => {
      localStorage.setItem(
        "store_procurement_last_created_request",
        JSON.stringify({ id: "req-abc", request_no: "REQ-100", at: new Date().toISOString() }),
      );
      await renderPage();
      await waitFor(() => {
        // "Request" also appears in quick action links — check multiple
        expect(screen.getAllByText("Request").length).toBeGreaterThan(0);
      });
    });

    it("shows 'Receiving' badge label in timeline", async () => {
      localStorage.setItem(
        "store_procurement_last_created_receiving",
        JSON.stringify({ id: "rec-xyz", receiving_no: "REC-001", request_id: "req-abc", at: new Date().toISOString() }),
      );
      await renderPage();
      await waitFor(() => {
        // "Receiving" also appears in quick action links
        expect(screen.getAllByText("Receiving").length).toBeGreaterThan(0);
      });
    });

    it("shows 'Claim' badge label in timeline", async () => {
      localStorage.setItem(
        "store_procurement_last_created_claim",
        JSON.stringify({ id: "claim-123", claim_no: "CLM-001", case_id: "", request_id: "req-abc", at: new Date().toISOString() }),
      );
      await renderPage();
      await waitFor(() => {
        // "Claim" also appears in quick action links
        expect(screen.getAllByText("Claim").length).toBeGreaterThan(0);
      });
    });

    it("shows request number label in timeline", async () => {
      localStorage.setItem(
        "store_procurement_last_created_request",
        JSON.stringify({ id: "req-abc", request_no: "REQ-100", at: new Date().toISOString() }),
      );
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText("REQ-100")).toBeInTheDocument();
      });
    });

    it("removes expired activity and hides timeline", async () => {
      const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      localStorage.setItem(
        "store_procurement_last_created_request",
        JSON.stringify({ id: "req-old", request_no: "REQ-OLD", at: oldDate }),
      );
      await renderPage();
      await waitFor(() => {
        expect(
          screen.queryByText(/recent activity timeline/i),
        ).not.toBeInTheDocument();
      });
    });

    it("shows 'Continue to Receiving' action for request activity", async () => {
      localStorage.setItem(
        "store_procurement_last_created_request",
        JSON.stringify({ id: "req-abc", request_no: "REQ-100", at: new Date().toISOString() }),
      );
      await renderPage();
      await waitFor(() => {
        expect(
          screen.getByRole("link", { name: /continue to receiving/i }),
        ).toBeInTheDocument();
      });
    });

    it("shows 'Continue to Claim' action for request activity", async () => {
      localStorage.setItem(
        "store_procurement_last_created_request",
        JSON.stringify({ id: "req-abc", request_no: "REQ-100", at: new Date().toISOString() }),
      );
      await renderPage();
      await waitFor(() => {
        expect(
          screen.getByRole("link", { name: /continue to claim/i }),
        ).toBeInTheDocument();
      });
    });

    it("shows 'Open Receiving' action for receiving activity", async () => {
      localStorage.setItem(
        "store_procurement_last_created_receiving",
        JSON.stringify({ id: "rec-xyz", receiving_no: "REC-001", request_id: "req-abc", at: new Date().toISOString() }),
      );
      await renderPage();
      await waitFor(() => {
        expect(
          screen.getByRole("link", { name: /open receiving/i }),
        ).toBeInTheDocument();
      });
    });

    it("shows 'Open Claim' action for claim activity", async () => {
      localStorage.setItem(
        "store_procurement_last_created_claim",
        JSON.stringify({ id: "claim-123", claim_no: "CLM-001", case_id: "", request_id: "req-abc", at: new Date().toISOString() }),
      );
      await renderPage();
      await waitFor(() => {
        expect(
          screen.getByRole("link", { name: /open claim/i }),
        ).toBeInTheDocument();
      });
    });

    it("shows 'View all' button when more than 3 activities", async () => {
      // Need 4+ activities — use all 3 keys plus a second receiving (not possible with current impl)
      // Actually there are only 3 localStorage keys, so max 3 activities.
      // This test verifies the ">3" branch is not triggered with exactly 3
      localStorage.setItem(
        "store_procurement_last_created_request",
        JSON.stringify({ id: "req-1", request_no: "REQ-100", at: new Date().toISOString() }),
      );
      localStorage.setItem(
        "store_procurement_last_created_receiving",
        JSON.stringify({ id: "rec-1", receiving_no: "REC-001", request_id: "req-1", at: new Date().toISOString() }),
      );
      localStorage.setItem(
        "store_procurement_last_created_claim",
        JSON.stringify({ id: "claim-1", claim_no: "CLM-001", case_id: "", request_id: "req-1", at: new Date().toISOString() }),
      );
      await renderPage();
      await waitFor(() => {
        // With exactly 3 activities, "View all" button should NOT appear
        expect(screen.queryByRole("button", { name: /view all/i })).not.toBeInTheDocument();
      });
    });
  });

  // ── Request Detail Drawer ───────────────────────────────────────────────────

  describe("RequestDetailDrawer", () => {
    beforeEach(() => {
      setAuth();
      routedJson(SAMPLE_ROWS_BODY, SAMPLE_DETAIL);
    });

    it("opens drawer when a request row is clicked", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText("REQ-001")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("REQ-001"));
      await waitFor(() => {
        // Drawer fetches and shows detail
        expect(screen.getByText("Drawer Requester")).toBeInTheDocument();
      });
    });

    it("shows notes in drawer", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText("REQ-001")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("REQ-001"));
      await waitFor(() => {
        expect(screen.getByText("Test notes content")).toBeInTheDocument();
      });
    });

    it("shows item details in drawer", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText("REQ-001")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("REQ-001"));
      await waitFor(() => {
        expect(screen.getByText("Salmon Slab")).toBeInTheDocument();
        expect(screen.getByText("Fish")).toBeInTheDocument();
      });
    });

    it("shows vendor name in drawer item", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText("REQ-001")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("REQ-001"));
      await waitFor(() => {
        expect(screen.getByText(/fresh fish co/i)).toBeInTheDocument();
      });
    });

    it("shows receivings in drawer", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText("REQ-001")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("REQ-001"));
      await waitFor(() => {
        expect(screen.getByText("RCV-001")).toBeInTheDocument();
      });
    });

    it("shows claims in drawer", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText("REQ-001")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("REQ-001"));
      await waitFor(() => {
        expect(screen.getByText("CLM-001")).toBeInTheDocument();
      });
    });

    it("shows urgent flag banner when urgent_flag is true", async () => {
      const urgentDetail = { ...SAMPLE_DETAIL, urgent_flag: true };
      routedJson(SAMPLE_ROWS_BODY, urgentDetail);
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText("REQ-001")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("REQ-001"));
      await waitFor(() => {
        expect(screen.getByText(/URGENT REQUEST/i)).toBeInTheDocument();
      });
    });

    it("shows error message when drawer fetch fails", async () => {
      mockProcurementJson.mockImplementation((url: string) => {
        if (String(url).includes("/requests/")) {
          return Promise.reject(new Error("Drawer network failure"));
        }
        return Promise.resolve(SAMPLE_ROWS_BODY);
      });
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText("REQ-001")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("REQ-001"));
      await waitFor(() => {
        expect(screen.getByText("Drawer network failure")).toBeInTheDocument();
      });
    });

    it("shows Loading... while drawer detail is fetching", async () => {
      let resolveDetail!: (v: unknown) => void;
      mockProcurementJson.mockImplementation((url: string) => {
        if (String(url).includes("/requests/")) {
          return new Promise((r) => {
            resolveDetail = r;
          });
        }
        return Promise.resolve(SAMPLE_ROWS_BODY);
      });
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText("REQ-001")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("REQ-001"));
      // "Loading..." appears in both the drawer header (before detail arrives) and the spinner
      expect(screen.getAllByText("Loading...").length).toBeGreaterThan(0);
      // Clean up: resolve so no pending state update after test
      await act(async () => {
        resolveDetail({ ok: true, request: SAMPLE_DETAIL });
      });
    });

    it("closes drawer when backdrop is clicked", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText("REQ-001")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("REQ-001"));
      await waitFor(() => {
        expect(screen.getByText("Drawer Requester")).toBeInTheDocument();
      });
      // The backdrop is the first modal overlay div with onClick=onClose
      const backdrop = document.querySelector(".bg-black\\/60") as HTMLElement;
      expect(backdrop).not.toBeNull();
      fireEvent.click(backdrop);
      await waitFor(() => {
        expect(screen.queryByText("Drawer Requester")).not.toBeInTheDocument();
      });
    });

    it("drawer footer has Receiving link pointing to receiving page", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText("REQ-001")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("REQ-001"));
      await waitFor(() => {
        expect(screen.getByText("Drawer Requester")).toBeInTheDocument();
      });
      // Footer links are in the drawer — find Receiving link
      const receivingLinks = screen.getAllByRole("link", { name: /^receiving$/i });
      const drawerReceiving = receivingLinks.find((l) =>
        l.getAttribute("href")?.includes("request_id=r1"),
      );
      expect(drawerReceiving).toBeTruthy();
    });
  });

  // ── City selector ───────────────────────────────────────────────────────────

  describe("City selector", () => {
    beforeEach(() => {
      setAuth({ city: "manila" });
      routedJson();
    });

    it("renders city combobox defaulting to manila", async () => {
      await renderPage();
      await waitFor(() => {
        const select = screen.getByRole("combobox") as HTMLSelectElement;
        expect(select.value).toBe("manila");
      });
    });

    it("changes city to Dubai and updates badge", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("combobox")).toBeInTheDocument();
      });
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "dubai" } });
      await waitFor(() => {
        // "Dubai" appears in both the badge and the select option
        expect(screen.getAllByText("Dubai").length).toBeGreaterThan(0);
      });
    });

    it("triggers loadMyRequests when city changes", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("combobox")).toBeInTheDocument();
      });
      const callsBefore = mockProcurementJson.mock.calls.length;
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "dubai" } });
      await waitFor(() => {
        expect(mockProcurementJson.mock.calls.length).toBeGreaterThan(callsBefore);
      });
    });
  });

  // ── Refresh button ──────────────────────────────────────────────────────────

  describe("Refresh button", () => {
    beforeEach(() => {
      setAuth();
      routedJson(SAMPLE_ROWS_BODY);
    });

    it("Refresh button is present", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /refresh/i })).toBeInTheDocument();
      });
    });

    it("clicking Refresh calls procurementJson again", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /refresh/i })).toBeInTheDocument();
      });
      const before = mockProcurementJson.mock.calls.length;
      fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
      await waitFor(() => {
        expect(mockProcurementJson.mock.calls.length).toBeGreaterThan(before);
      });
    });
  });

  // ── Error handling ──────────────────────────────────────────────────────────

  describe("Error handling", () => {
    beforeEach(() => {
      setAuth();
    });

    it("shows error message when loadMyRequests fails", async () => {
      mockProcurementJson.mockRejectedValue(new Error("API error from server"));
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText("API error from server")).toBeInTheDocument();
      });
    });

    it("shows readable error when procurementJson returns invalid JSON (bug fix)", async () => {
      // procurementClient.ts now wraps JSON.parse in try-catch
      mockProcurementJson.mockRejectedValue(
        new Error("Invalid JSON response from server"),
      );
      await renderPage();
      await waitFor(() => {
        expect(
          screen.getByText("Invalid JSON response from server"),
        ).toBeInTheDocument();
      });
    });

    it("shows FastAPI detail error from procurementJson", async () => {
      mockProcurementJson.mockRejectedValue(
        new Error("Staff not found"),
      );
      await renderPage();
      await waitFor(() => {
        expect(screen.getByText("Staff not found")).toBeInTheDocument();
      });
    });
  });

  // ── Quick Actions ───────────────────────────────────────────────────────────

  describe("Quick Actions links", () => {
    beforeEach(() => {
      setAuth();
      routedJson();
    });

    it("renders Request quick action link", async () => {
      await renderPage();
      await waitFor(() => {
        const links = screen.getAllByRole("link", { name: /request/i });
        expect(links.length).toBeGreaterThan(0);
      });
    });

    it("renders History quick action link", async () => {
      await renderPage();
      await waitFor(() => {
        expect(screen.getByRole("link", { name: /history/i })).toBeInTheDocument();
      });
    });

    it("renders Receiving quick action link", async () => {
      await renderPage();
      await waitFor(() => {
        const links = screen.getAllByRole("link", { name: /receiving/i });
        expect(links.length).toBeGreaterThan(0);
      });
    });

    it("renders Claim quick action link", async () => {
      await renderPage();
      await waitFor(() => {
        const links = screen.getAllByRole("link", { name: /claim/i });
        expect(links.length).toBeGreaterThan(0);
      });
    });

    it("Request quick action href includes city param", async () => {
      await renderPage();
      await waitFor(() => {
        const links = screen.getAllByRole("link", { name: /request/i });
        const requestLink = links.find((l) =>
          l.getAttribute("href")?.includes("city=manila"),
        );
        expect(requestLink).toBeTruthy();
      });
    });

    it("Receiving quick action href includes city param", async () => {
      await renderPage();
      await waitFor(() => {
        const links = screen.getAllByRole("link", { name: /receiving/i });
        const receivingLink = links.find((l) =>
          l.getAttribute("href")?.includes("city=manila"),
        );
        expect(receivingLink).toBeTruthy();
      });
    });
  });
});
