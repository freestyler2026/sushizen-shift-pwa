// tests/admin/inventory/inventory-tabs.test.tsx
// Tests for src/components/InventoryTabs.tsx
// Covers: role-based tab filtering, active state, and tab visibility rules.

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import InventoryTabs from "@/components/InventoryTabs";

// ── Stable pathname mock ──────────────────────────────────────────────────────
const mockPathname = vi.hoisted(() => ({ current: "/admin/inventory" }));

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, className }: any) => (
    <a href={href} className={className} role="link">
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
  };
});

// ── Auth fixtures ─────────────────────────────────────────────────────────────
function makeAuth(permissions: string[], role = "ADMIN", city = "manila") {
  return {
    accessToken: "tok",
    role,
    city,
    staffName: "Test User",
    permissions,
  };
}

const ADMIN_AUTH = makeAuth(["channel.admin.inventory.write", "inventory.write"]);
const LIMITED_AUTH = makeAuth(["channel.admin.inventory.view", "inventory.read"]);
const DAILY_INV_AUTH = makeAuth([
  "channel.admin.inventory.write",
  "inventory.write",
  "channel.admin.daily_inventory.view",
]);
const NO_PERM_AUTH = makeAuth([]);

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("InventoryTabs", () => {
  beforeEach(() => {
    mockPathname.current = "/admin/inventory";
  });

  // ── PRIMARY tabs ────────────────────────────────────────────────────────────
  describe("Primary tabs (staff-accessible)", () => {
    beforeEach(() => {
      mockAuthReturn = ADMIN_AUTH;
    });

    it("shows Full Inventory Count tab", () => {
      render(<InventoryTabs />);
      expect(screen.getByText("Full Inventory Count")).toBeInTheDocument();
    });

    it("shows Transfer Orders tab", () => {
      render(<InventoryTabs />);
      expect(screen.getByText("Transfer Orders")).toBeInTheDocument();
    });

    it("shows CK Production tab", () => {
      render(<InventoryTabs />);
      expect(screen.getByText("CK Production")).toBeInTheDocument();
    });

    it("shows CK Inventory tab", () => {
      render(<InventoryTabs />);
      expect(screen.getByText("CK Inventory")).toBeInTheDocument();
    });

    it("shows WH Inventory tab", () => {
      render(<InventoryTabs />);
      expect(screen.getByText("WH Inventory")).toBeInTheDocument();
    });

    it("hides Daily Inventory Input when user lacks the permission", () => {
      mockAuthReturn = ADMIN_AUTH; // no daily_inventory permission
      render(<InventoryTabs />);
      expect(screen.queryByText("Daily Inventory Input")).not.toBeInTheDocument();
    });

    it("shows Daily Inventory Input when user has the permission", () => {
      mockAuthReturn = DAILY_INV_AUTH;
      render(<InventoryTabs />);
      expect(screen.getByText("Daily Inventory Input")).toBeInTheDocument();
    });
  });

  // ── SECONDARY tabs ──────────────────────────────────────────────────────────
  describe("Secondary tabs (admin/advanced)", () => {
    it("shows secondary tabs for admin user", () => {
      mockAuthReturn = ADMIN_AUTH;
      render(<InventoryTabs />);
      expect(screen.getByText("Overview")).toBeInTheDocument();
      expect(screen.getByText("Ingredients / Products")).toBeInTheDocument();
      expect(screen.getByText("Sales Menu BOM")).toBeInTheDocument();
      expect(screen.getByText("Quick Spot Check")).toBeInTheDocument();
      expect(screen.getByText("Quantity Adjustments")).toBeInTheDocument();
      expect(screen.getByText("Cost Adjustments")).toBeInTheDocument();
      expect(screen.getByText("POS Sync")).toBeInTheDocument();
      expect(screen.getByText("Ledger")).toBeInTheDocument();
    });

    it("hides ALL secondary tabs for limited user (view only)", () => {
      mockAuthReturn = LIMITED_AUTH;
      render(<InventoryTabs />);
      expect(screen.queryByText("Overview")).not.toBeInTheDocument();
      expect(screen.queryByText("Ingredients / Products")).not.toBeInTheDocument();
      expect(screen.queryByText("Sales Menu BOM")).not.toBeInTheDocument();
      expect(screen.queryByText("POS Sync")).not.toBeInTheDocument();
      expect(screen.queryByText("Ledger")).not.toBeInTheDocument();
    });

    it("hides Count Templates tab for limited user", () => {
      mockAuthReturn = LIMITED_AUTH;
      render(<InventoryTabs />);
      expect(screen.queryByText("Count Templates")).not.toBeInTheDocument();
    });

    it("shows Count Templates tab for admin user with inventory.write", () => {
      mockAuthReturn = ADMIN_AUTH;
      render(<InventoryTabs />);
      expect(screen.getByText("Count Templates")).toBeInTheDocument();
    });

    it("hides all secondary tabs when user has no permissions", () => {
      mockAuthReturn = NO_PERM_AUTH;
      render(<InventoryTabs />);
      expect(screen.queryByText("Overview")).not.toBeInTheDocument();
      expect(screen.queryByText("Ledger")).not.toBeInTheDocument();
    });
  });

  // ── Active state ────────────────────────────────────────────────────────────
  describe("Active tab highlighting", () => {
    beforeEach(() => {
      mockAuthReturn = ADMIN_AUTH;
    });

    it("Overview tab is active on exact /admin/inventory path", () => {
      mockPathname.current = "/admin/inventory";
      render(<InventoryTabs />);
      const overviewLink = screen.getByText("Overview").closest("a")!;
      expect(overviewLink.className).toContain("violet");
    });

    it("Overview tab is NOT active on /admin/inventory/items path", () => {
      mockPathname.current = "/admin/inventory/items";
      render(<InventoryTabs />);
      const overviewLink = screen.getByText("Overview").closest("a")!;
      expect(overviewLink.className).not.toContain("violet-500/20");
    });

    it("Full Inventory Count tab is active when on /admin/inventory/counts", () => {
      mockPathname.current = "/admin/inventory/counts";
      render(<InventoryTabs />);
      const countsLink = screen.getByText("Full Inventory Count").closest("a")!;
      expect(countsLink.className).toContain("emerald-500/25");
    });

    it("Ingredients tab is active when on /admin/inventory/items", () => {
      mockPathname.current = "/admin/inventory/items";
      render(<InventoryTabs />);
      const itemsLink = screen.getByText("Ingredients / Products").closest("a")!;
      expect(itemsLink.className).toContain("violet");
    });
  });

  // ── Link hrefs ──────────────────────────────────────────────────────────────
  describe("Tab link hrefs", () => {
    beforeEach(() => {
      mockAuthReturn = ADMIN_AUTH;
    });

    it("Full Inventory Count links to /admin/inventory/counts", () => {
      render(<InventoryTabs />);
      const link = screen.getByText("Full Inventory Count").closest("a")!;
      expect(link.getAttribute("href")).toBe("/admin/inventory/counts");
    });

    it("Count Templates links to /admin/inventory/count-sheets", () => {
      render(<InventoryTabs />);
      const link = screen.getByText("Count Templates").closest("a")!;
      expect(link.getAttribute("href")).toBe("/admin/inventory/count-sheets");
    });

    it("Overview links to /admin/inventory", () => {
      render(<InventoryTabs />);
      const link = screen.getByText("Overview").closest("a")!;
      expect(link.getAttribute("href")).toBe("/admin/inventory");
    });

    it("Transfer Orders links to /admin/inventory/transfer-orders", () => {
      render(<InventoryTabs />);
      const link = screen.getByText("Transfer Orders").closest("a")!;
      expect(link.getAttribute("href")).toBe("/admin/inventory/transfer-orders");
    });
  });
});
