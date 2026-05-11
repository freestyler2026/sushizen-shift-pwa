// tests/admin/procurement/procurement-tabs.test.tsx
// Tests for src/components/ProcurementTabs.tsx
// Covers: group rendering, role-based tab visibility, active group detection,
//         badge display, group switching.

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ProcurementTabs from "@/components/ProcurementTabs";

// ── Pathname mock ─────────────────────────────────────────────────────────────
const mockPathname = vi.hoisted(() => ({ current: "/admin/procurement" }));

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, className }: any) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

// ── Auth mock ─────────────────────────────────────────────────────────────────
let mockAuthReturn: any = null;

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getAuth: vi.fn(() => mockAuthReturn),
    refreshAuthFromApi: vi.fn(async () => mockAuthReturn),
  };
});

function makeAuth(role: string, city = "manila") {
  return {
    accessToken: "tok",
    role,
    city,
    staffName: "Test",
    permissions: role === "HQ" ? ["*"] : [],
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("ProcurementTabs", () => {
  beforeEach(() => {
    mockPathname.current = "/admin/procurement";
    mockAuthReturn = makeAuth("HQ");
    // Mock fetch for badge summary
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          incoming_requests_count: 0,
          issue_count: 0,
          issue_critical_count: 0,
          price_check_pending_count: 0,
          price_check_overdue_count: 0,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
  });

  // ── Group buttons ────────────────────────────────────────────────────────────
  describe("Group buttons", () => {
    it("shows Operations group button", () => {
      render(<ProcurementTabs />);
      expect(screen.getByText("Operations")).toBeInTheDocument();
    });

    it("shows Financials group button", () => {
      render(<ProcurementTabs />);
      expect(screen.getByText("Financials")).toBeInTheDocument();
    });

    it("shows Analytics group button", () => {
      render(<ProcurementTabs />);
      expect(screen.getByText("Analytics")).toBeInTheDocument();
    });

    it("shows Admin group button for full-access user", () => {
      render(<ProcurementTabs />);
      expect(screen.getByText("Admin")).toBeInTheDocument();
    });

    it("Operations group is open by default on /admin/procurement", () => {
      render(<ProcurementTabs />);
      expect(screen.getByText("Requests")).toBeInTheDocument();
    });
  });

  // ── Tab visibility — full access (HQ) ────────────────────────────────────────
  describe("Tabs visible for HQ (full access)", () => {
    beforeEach(() => {
      mockAuthReturn = makeAuth("HQ");
    });

    it("shows Requests tab in Operations", () => {
      render(<ProcurementTabs />);
      expect(screen.getByText("Requests")).toBeInTheDocument();
    });

    it("shows Needs My Approval tab in Operations", () => {
      render(<ProcurementTabs />);
      expect(screen.getByText("Needs My Approval")).toBeInTheDocument();
    });

    it("shows Item Price Search tab in Operations", () => {
      render(<ProcurementTabs />);
      expect(screen.getByText("Item Price Search")).toBeInTheDocument();
    });

    it("shows Quotes in Operations group (not visible for staff)", async () => {
      render(<ProcurementTabs />);
      // HQ sees Quotes in Operations group
      expect(screen.getByText("Quotes")).toBeInTheDocument();
    });

    it("shows Vendors when Admin group is opened", async () => {
      render(<ProcurementTabs />);
      const adminBtn = screen.getByText("Admin");
      fireEvent.click(adminBtn);
      await waitFor(() => {
        expect(screen.getByText("Vendors")).toBeInTheDocument();
      });
    });

    it("shows Approval Matrix in Admin group", async () => {
      render(<ProcurementTabs />);
      fireEvent.click(screen.getByText("Admin"));
      await waitFor(() => {
        expect(screen.getByText("Approval Matrix")).toBeInTheDocument();
      });
    });

    it("shows Alerts (exceptions) in Admin group", async () => {
      render(<ProcurementTabs />);
      fireEvent.click(screen.getByText("Admin"));
      await waitFor(() => {
        expect(screen.getByText("Alerts")).toBeInTheDocument();
      });
    });

    it("shows Invoices in Financials group", async () => {
      render(<ProcurementTabs />);
      fireEvent.click(screen.getByText("Financials"));
      await waitFor(() => {
        expect(screen.getByText("Invoices")).toBeInTheDocument();
      });
    });

    it("shows KPI in Analytics group", async () => {
      render(<ProcurementTabs />);
      fireEvent.click(screen.getByText("Analytics"));
      await waitFor(() => {
        expect(screen.getByText("KPI")).toBeInTheDocument();
      });
    });
  });

  // ── Tab visibility — staff role ───────────────────────────────────────────────
  describe("Tabs visible for STAFF role", () => {
    beforeEach(() => {
      mockAuthReturn = makeAuth("STAFF");
    });

    it("shows Requests tab (staff can see)", () => {
      render(<ProcurementTabs />);
      expect(screen.getByText("Requests")).toBeInTheDocument();
    });

    it("shows Needs My Approval tab (staff can see)", () => {
      render(<ProcurementTabs />);
      expect(screen.getByText("Needs My Approval")).toBeInTheDocument();
    });

    it("shows Item Price Search tab (staff can see)", () => {
      render(<ProcurementTabs />);
      expect(screen.getByText("Item Price Search")).toBeInTheDocument();
    });

    it("hides Quotes from Operations (manager/full only)", () => {
      render(<ProcurementTabs />);
      expect(screen.queryByText("Quotes")).not.toBeInTheDocument();
    });

    it("hides Financials group entirely (no tabs visible for staff)", () => {
      render(<ProcurementTabs />);
      // Financials group has no staff-visible tabs → group button hidden
      expect(screen.queryByText("Financials")).not.toBeInTheDocument();
    });

    it("hides Analytics group entirely for staff", () => {
      render(<ProcurementTabs />);
      expect(screen.queryByText("Analytics")).not.toBeInTheDocument();
    });

    it("hides Admin group entirely for staff", () => {
      render(<ProcurementTabs />);
      expect(screen.queryByText("Admin")).not.toBeInTheDocument();
    });
  });

  // ── Tab visibility — manager role ─────────────────────────────────────────────
  describe("Tabs visible for MANAGER role", () => {
    beforeEach(() => {
      mockAuthReturn = makeAuth("MANAGER");
    });

    it("shows Quotes tab (manager can see)", () => {
      render(<ProcurementTabs />);
      expect(screen.getByText("Quotes")).toBeInTheDocument();
    });

    it("shows PO tab (manager can see)", () => {
      render(<ProcurementTabs />);
      expect(screen.getByText("PO")).toBeInTheDocument();
    });

    it("hides Admin group from managers", () => {
      render(<ProcurementTabs />);
      expect(screen.queryByText("Admin")).not.toBeInTheDocument();
    });
  });

  // ── Active state ─────────────────────────────────────────────────────────────
  describe("Active group detection", () => {
    it("Operations group is active on /admin/procurement", () => {
      mockPathname.current = "/admin/procurement";
      render(<ProcurementTabs />);
      const btn = screen.getAllByRole("button").find((b) => b.textContent?.includes("Operations"));
      expect(btn?.className).toContain("violet");
    });

    it("Admin group opens when navigating to /admin/procurement/vendors", async () => {
      mockPathname.current = "/admin/procurement/vendors";
      render(<ProcurementTabs />);
      await waitFor(() => {
        expect(screen.getByText("Vendors")).toBeInTheDocument();
      });
    });

    it("Financials group opens when navigating to /admin/procurement/invoices", async () => {
      mockPathname.current = "/admin/procurement/invoices";
      render(<ProcurementTabs />);
      await waitFor(() => {
        expect(screen.getByText("Invoices")).toBeInTheDocument();
      });
    });
  });

  // ── Badge display ─────────────────────────────────────────────────────────────
  describe("Badge counts", () => {
    it("shows badge on Needs My Approval when incoming_requests_count > 0", async () => {
      global.fetch = vi.fn(async () =>
        new Response(
          JSON.stringify({
            incoming_requests_count: 3,
            issue_count: 0,
            issue_critical_count: 0,
            price_check_pending_count: 0,
            price_check_overdue_count: 0,
          }),
          { status: 200 },
        ),
      );
      render(<ProcurementTabs />);
      await waitFor(() => {
        // Badge "3" should appear near Operations group
        const badges = screen.queryAllByText("3");
        expect(badges.length).toBeGreaterThan(0);
      });
    });

    it("shows 9+ when badge count exceeds 9", async () => {
      global.fetch = vi.fn(async () =>
        new Response(
          JSON.stringify({
            incoming_requests_count: 15,
            issue_count: 0,
            issue_critical_count: 0,
            price_check_pending_count: 0,
            price_check_overdue_count: 0,
          }),
          { status: 200 },
        ),
      );
      render(<ProcurementTabs />);
      await waitFor(() => {
        const badges = screen.queryAllByText("9+");
        expect(badges.length).toBeGreaterThan(0);
      });
    });
  });

  // ── Tab hrefs ─────────────────────────────────────────────────────────────────
  describe("Tab link hrefs", () => {
    it("Requests tab links to /admin/procurement", () => {
      render(<ProcurementTabs />);
      const link = screen.getByText("Requests").closest("a");
      expect(link?.getAttribute("href")).toBe("/admin/procurement");
    });

    it("Needs My Approval links to /admin/procurement/approval-inbox", () => {
      render(<ProcurementTabs />);
      const link = screen.getByText("Needs My Approval").closest("a");
      expect(link?.getAttribute("href")).toBe("/admin/procurement/approval-inbox");
    });
  });

  // ── Group switching ───────────────────────────────────────────────────────────
  describe("Group switching", () => {
    it("clicking Analytics group shows Dashboard tab", async () => {
      render(<ProcurementTabs />);
      fireEvent.click(screen.getByText("Analytics"));
      await waitFor(() => {
        expect(screen.getByText("Dashboard")).toBeInTheDocument();
      });
    });

    it("clicking a different group hides current group's tabs", async () => {
      render(<ProcurementTabs />);
      // Initially Operations is open showing Requests
      expect(screen.getByText("Requests")).toBeInTheDocument();
      // Switch to Analytics
      fireEvent.click(screen.getByText("Analytics"));
      await waitFor(() => {
        expect(screen.getByText("Dashboard")).toBeInTheDocument();
      });
    });
  });
});
