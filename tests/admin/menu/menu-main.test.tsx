// tests/admin/menu/menu-main.test.tsx
// Tests for src/app/admin/menu/page.tsx
// Covers: auth guard, city picker, CityMenuBuilder view, back navigation.

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── next/navigation ────────────────────────────────────────────────────────────
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/menu",
}));

// ── next/link ─────────────────────────────────────────────────────────────────
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// ── framer-motion ─────────────────────────────────────────────────────────────
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// ── lucide-react ──────────────────────────────────────────────────────────────
vi.mock("lucide-react", () => ({
  ArrowRight: () => <svg data-testid="icon-arrow-right" />,
  CheckCircle2: () => <svg data-testid="icon-check" />,
  ChevronRight: () => <svg data-testid="icon-chevron" />,
  FolderOpen: () => <svg data-testid="icon-folder" />,
  LayoutDashboard: () => <svg data-testid="icon-dashboard" />,
  Package: () => <svg data-testid="icon-package" />,
  ShoppingBag: () => <svg data-testid="icon-bag" />,
  Tag: () => <svg data-testid="icon-tag" />,
  User: () => <svg data-testid="icon-user" />,
  UtensilsCrossed: () => <svg data-testid="icon-utensils" />,
}));

// ── auth ──────────────────────────────────────────────────────────────────────
let mockCanAccess = true;
const MENU_AUTH = {
  accessToken: "tok", role: "HQ", city: "dubai",
  staffName: "Jay", permissions: ["menu.read", "menu.write"], pin: "1234",
};

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getAuth: vi.fn(() => MENU_AUTH),
    refreshAuthFromApi: vi.fn(async () => MENU_AUTH),
    canAccessMenuAdmin: vi.fn(() => mockCanAccess),
  };
});

// ── ui-tokens (stubbed so they don't crash jsdom) ─────────────────────────────
vi.mock("@/lib/ui-tokens", () => ({
  HIGHLIGHT_CARD: "highlight-card",
  PRIMARY_BUTTON: "primary-button",
  SECONDARY_BUTTON: "secondary-button",
  STATUS_CARD: "status-card",
  T_BODY: "t-body",
  T_CAPTION: "t-caption",
  T_CARD_TITLE: "t-card-title",
  T_PAGE_TITLE: "t-page-title",
  BADGE_INFO: "badge-info",
  DIVIDER: "divider",
}));

import AdminMenuPage from "@/app/admin/menu/page";

// ════════════════════════════════════════════════════════════════════════════════
describe("AdminMenuPage — auth guard", () => {
  beforeEach(() => { mockCanAccess = true; });

  it("shows permission error when user lacks menu access", async () => {
    mockCanAccess = false;
    render(<AdminMenuPage />);
    await screen.findByText(/You do not have permission/i);
  });

  it("shows Menu Builder heading for authorized user", async () => {
    mockCanAccess = true;
    render(<AdminMenuPage />);
    await screen.findByText("Menu Builder");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("AdminMenuPage — city picker", () => {
  beforeEach(() => { mockCanAccess = true; });

  it("renders Dubai and Manila city buttons", async () => {
    render(<AdminMenuPage />);
    await screen.findByText("Menu Builder");
    expect(screen.getByRole("button", { name: /Dubai/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Manila/i })).toBeInTheDocument();
  });

  it("shows staff name and role badge", async () => {
    render(<AdminMenuPage />);
    await screen.findByText("Menu Builder");
    expect(screen.getByText(/Jay/)).toBeInTheDocument();
    expect(screen.getByText(/HQ/)).toBeInTheDocument();
  });

  it("shows Back to Admin Dashboard and Open Inventory links", async () => {
    render(<AdminMenuPage />);
    await screen.findByText("Menu Builder");
    expect(screen.getByText(/Back to Admin Dashboard/i)).toBeInTheDocument();
    expect(screen.getByText(/Open Inventory/i)).toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("AdminMenuPage — CityMenuBuilder view", () => {
  beforeEach(() => { mockCanAccess = true; });

  it("clicking Dubai button shows Dubai Menu Builder", async () => {
    render(<AdminMenuPage />);
    await screen.findByText("Menu Builder");
    fireEvent.click(screen.getByRole("button", { name: /Dubai/i }));
    await screen.findByText(/Dubai Menu Builder/i);
  });

  it("clicking Manila button shows Manila Menu Builder", async () => {
    render(<AdminMenuPage />);
    await screen.findByText("Menu Builder");
    fireEvent.click(screen.getByRole("button", { name: /Manila/i }));
    await screen.findByText(/Manila Menu Builder/i);
  });

  it("CityMenuBuilder shows Categories, Products, Tags module links", async () => {
    render(<AdminMenuPage />);
    await screen.findByText("Menu Builder");
    fireEvent.click(screen.getByRole("button", { name: /Dubai/i }));
    await screen.findByText(/Dubai Menu Builder/i);
    expect(screen.getByText("Categories")).toBeInTheDocument();
    expect(screen.getByText("Products")).toBeInTheDocument();
    expect(screen.getByText("Tags")).toBeInTheDocument();
  });

  it("back button from city view returns to city picker", async () => {
    render(<AdminMenuPage />);
    await screen.findByText("Menu Builder");
    fireEvent.click(screen.getByRole("button", { name: /Dubai/i }));
    await screen.findByText(/Dubai Menu Builder/i);
    fireEvent.click(screen.getByText(/← Menu Builder/i));
    // City picker is restored
    await screen.findByRole("button", { name: /Dubai/i });
    expect(screen.getByRole("button", { name: /Manila/i })).toBeInTheDocument();
  });

  it("Categories link points to correct URL with city param", async () => {
    render(<AdminMenuPage />);
    await screen.findByText("Menu Builder");
    fireEvent.click(screen.getByRole("button", { name: /Dubai/i }));
    await screen.findByText("Categories");
    // Multiple links contain "categories" in their accessible name (Products description
    // also mentions "categories").  Find the <a> that wraps the h3 "Categories" heading.
    const heading = screen.getByRole("heading", { name: "Categories" });
    const link = heading.closest("a");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toContain("/admin/menu/categories");
    expect(link!.getAttribute("href")).toContain("city=dubai");
  });

  it("Products link points to correct URL with city param", async () => {
    render(<AdminMenuPage />);
    await screen.findByText("Menu Builder");
    fireEvent.click(screen.getByRole("button", { name: /Manila/i }));
    await screen.findByText("Products");
    const heading = screen.getByRole("heading", { name: "Products" });
    const link = heading.closest("a");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toContain("/admin/menu/products");
    expect(link!.getAttribute("href")).toContain("city=manila");
  });
});
