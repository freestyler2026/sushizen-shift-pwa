// tests/admin/inventory/inventory-page.test.tsx
// Tests for src/app/admin/inventory/page.tsx
// Covers: auth guard, module visibility by role, duplicate module bug, navigation links.

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AdminInventoryPage from "@/app/admin/inventory/page";

// ── Next.js mocks ─────────────────────────────────────────────────────────────
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/inventory",
  useParams: () => ({}),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, className }: any) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

// ── Framer motion ─────────────────────────────────────────────────────────────
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    section: ({ children, ...props }: any) => <section {...props}>{children}</section>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// ── lucide-react ──────────────────────────────────────────────────────────────
vi.mock("lucide-react", () => ({
  CheckCircle2: () => <span data-testid="check-icon" />,
}));

// ── Spinner ───────────────────────────────────────────────────────────────────
vi.mock("@/components/ui/Spinner", () => ({
  Spinner: () => <div data-testid="spinner">Loading...</div>,
}));

// ── InventoryTabs / InventoryRegistrationHelp ─────────────────────────────────
vi.mock("@/components/InventoryTabs", () => ({
  default: () => <div data-testid="inventory-tabs">InventoryTabs</div>,
}));

vi.mock("@/components/InventoryRegistrationHelp", () => ({
  default: () => <div data-testid="inventory-reg-help">InventoryRegistrationHelp</div>,
}));

// ── Auth mock ─────────────────────────────────────────────────────────────────
let mockAuthReturn: any = null;
let mockRefreshReturn: any = null;

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getAuth: vi.fn(() => mockAuthReturn),
    refreshAuthFromApi: vi.fn(async () => mockRefreshReturn ?? mockAuthReturn),
    canAccessInventoryWorkspace: actual.canAccessInventoryWorkspace,
    canAccessCountTemplatesAdmin: actual.canAccessCountTemplatesAdmin,
  };
});

// ── Auth helpers ──────────────────────────────────────────────────────────────
function makeAuth(permissions: string[], role = "ADMIN", city = "manila") {
  return {
    accessToken: "tok",
    role,
    city,
    staffName: "Test User",
    permissions,
  };
}

// Admin: full inventory access
const ADMIN_AUTH = makeAuth(["channel.admin.inventory.write", "inventory.write"], "ADMIN");
// HQ: wildcard permissions
const HQ_AUTH = makeAuth(["*"], "HQ");
// Limited: view only
const LIMITED_AUTH = makeAuth(["channel.admin.inventory.view", "inventory.read"], "STAFF");
// No access
const NO_AUTH = makeAuth([]);

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("AdminInventoryPage", () => {

  // ── Loading state ───────────────────────────────────────────────────────────
  describe("Loading state", () => {
    it("shows spinner while loading", () => {
      mockAuthReturn = ADMIN_AUTH;
      mockRefreshReturn = ADMIN_AUTH;
      render(<AdminInventoryPage />);
      // During initial render before useEffect resolves, spinner should be shown
      // The spinner appears initially then resolves
      expect(screen.getByTestId("spinner")).toBeInTheDocument();
    });
  });

  // ── Auth guard ──────────────────────────────────────────────────────────────
  describe("Auth guard", () => {
    it("shows permission error when user has no inventory access", async () => {
      mockAuthReturn = NO_AUTH;
      mockRefreshReturn = NO_AUTH;
      render(<AdminInventoryPage />);
      await screen.findByText(/You do not have permission to open the inventory workspace/i);
    });

    it("shows inventory page when user has workspace access", async () => {
      mockAuthReturn = ADMIN_AUTH;
      mockRefreshReturn = ADMIN_AUTH;
      render(<AdminInventoryPage />);
      await screen.findByText("Inventory");
    });

    it("shows inventory page for HQ user with wildcard permissions", async () => {
      mockAuthReturn = HQ_AUTH;
      mockRefreshReturn = HQ_AUTH;
      render(<AdminInventoryPage />);
      await screen.findByText("Inventory");
    });

    it("shows InventoryTabs after auth resolves", async () => {
      mockAuthReturn = ADMIN_AUTH;
      mockRefreshReturn = ADMIN_AUTH;
      render(<AdminInventoryPage />);
      await screen.findByTestId("inventory-tabs");
    });
  });

  // ── Module cards visibility ─────────────────────────────────────────────────
  describe("Module cards — admin user", () => {
    beforeEach(() => {
      mockAuthReturn = ADMIN_AUTH;
      mockRefreshReturn = ADMIN_AUTH;
    });

    it("shows Ingredients / Products module", async () => {
      render(<AdminInventoryPage />);
      await screen.findByText("Ingredients / Products");
    });

    it("shows Full Inventory Count module", async () => {
      render(<AdminInventoryPage />);
      await screen.findByText("Full Inventory Count");
    });

    it("shows Transfer Orders module", async () => {
      render(<AdminInventoryPage />);
      await screen.findByText("Transfer Orders");
    });

    it("shows Quick Spot Check module", async () => {
      render(<AdminInventoryPage />);
      await screen.findByText("Quick Spot Check");
    });

    it("shows Count Templates module for admin (has inventory.write)", async () => {
      render(<AdminInventoryPage />);
      await screen.findByText("Count Templates");
    });

    it("shows POS Sync module", async () => {
      render(<AdminInventoryPage />);
      await screen.findByText("POS Sync");
    });

    it("shows Ledger / Balances module", async () => {
      render(<AdminInventoryPage />);
      await screen.findByText("Ledger / Balances");
    });
  });

  // ── Module cards — limited user (STAFF/MANAGER) ─────────────────────────────
  describe("Module cards — limited user (STAFF role)", () => {
    beforeEach(() => {
      const staffAuth = makeAuth(["channel.admin.inventory.view", "inventory.read"], "STAFF");
      mockAuthReturn = staffAuth;
      mockRefreshReturn = staffAuth;
    });

    it("shows Full Inventory Count module for limited user", async () => {
      render(<AdminInventoryPage />);
      await screen.findByText("Full Inventory Count");
    });

    it("shows Transfer Orders module for limited user", async () => {
      render(<AdminInventoryPage />);
      await screen.findByText("Transfer Orders");
    });

    it("shows Quick Spot Check module for limited user", async () => {
      render(<AdminInventoryPage />);
      await screen.findByText("Quick Spot Check");
    });

    it("shows CK Production module for limited user", async () => {
      render(<AdminInventoryPage />);
      await screen.findByText("CK Production / Adjustments");
    });

    it("hides Ingredients / Products module from limited user", async () => {
      render(<AdminInventoryPage />);
      await screen.findByText("Full Inventory Count");
      expect(screen.queryByText("Ingredients / Products")).not.toBeInTheDocument();
    });

    it("hides POS Sync module from limited user", async () => {
      render(<AdminInventoryPage />);
      await screen.findByText("Full Inventory Count");
      expect(screen.queryByText("POS Sync")).not.toBeInTheDocument();
    });

    it("hides Ledger / Balances module from limited user", async () => {
      render(<AdminInventoryPage />);
      await screen.findByText("Full Inventory Count");
      expect(screen.queryByText("Ledger / Balances")).not.toBeInTheDocument();
    });

    it("hides Count Templates module from limited user", async () => {
      render(<AdminInventoryPage />);
      await screen.findByText("Full Inventory Count");
      expect(screen.queryByText("Count Templates")).not.toBeInTheDocument();
    });
  });

  // ── REGRESSION: Duplicate module bug ───────────────────────────────────────
  describe("Bug regression: Duplicate module entries for /admin/inventory/count-sheets", () => {
    it("[FIXED] count-sheets href appears only once (no duplicate card) for admin user", async () => {
      mockAuthReturn = ADMIN_AUTH;
      mockRefreshReturn = ADMIN_AUTH;
      render(<AdminInventoryPage />);
      await screen.findByText("Count Templates");

      // If the bug existed, both "Count Templates" AND "Count Sheets / Order Consumptions"
      // would appear as separate module cards — count-sheets href duplicated.
      // After fix: only "Count Templates" card appears.
      const countSheetsCards = screen
        .getAllByRole("link")
        .filter((el) => el.getAttribute("href") === "/admin/inventory/count-sheets");

      expect(countSheetsCards.length).toBe(1); // should be exactly 1 — not 2
    });

    it("[FIXED] 'Count Sheets / Order Consumptions' duplicate entry is removed", async () => {
      mockAuthReturn = ADMIN_AUTH;
      mockRefreshReturn = ADMIN_AUTH;
      render(<AdminInventoryPage />);
      await screen.findByText("Count Templates");
      // The duplicate entry with this title should not appear
      expect(screen.queryByText("Count Sheets / Order Consumptions")).not.toBeInTheDocument();
    });
  });

  // ── User info display ───────────────────────────────────────────────────────
  describe("User info badge", () => {
    it("shows staff name, role, and city in header badge", async () => {
      const auth = makeAuth(["inventory.write"], "ADMIN", "dubai");
      auth.staffName = "Jay Nishimura";
      mockAuthReturn = auth;
      mockRefreshReturn = auth;
      render(<AdminInventoryPage />);
      await screen.findByText(/Jay Nishimura/);
      expect(screen.getByText(/ADMIN/)).toBeInTheDocument();
      expect(screen.getByText(/DUBAI/)).toBeInTheDocument();
    });

    it("shows 'Role session active' when staff name is empty", async () => {
      const auth = makeAuth(["inventory.write"], "ADMIN", "manila");
      auth.staffName = "";
      mockAuthReturn = auth;
      mockRefreshReturn = auth;
      render(<AdminInventoryPage />);
      await screen.findByText("Role session active");
    });
  });

  // ── Navigation links ────────────────────────────────────────────────────────
  describe("Navigation links", () => {
    beforeEach(() => {
      mockAuthReturn = ADMIN_AUTH;
      mockRefreshReturn = ADMIN_AUTH;
    });

    it("has 'Back to Admin Dashboard' link pointing to /admin", async () => {
      render(<AdminInventoryPage />);
      const link = await screen.findByText("Back to Admin Dashboard");
      expect(link.closest("a")?.getAttribute("href")).toBe("/admin");
    });

    it("has 'Open Procurement' link pointing to /admin/procurement", async () => {
      render(<AdminInventoryPage />);
      const link = await screen.findByText("Open Procurement");
      expect(link.closest("a")?.getAttribute("href")).toBe("/admin/procurement");
    });
  });
});
