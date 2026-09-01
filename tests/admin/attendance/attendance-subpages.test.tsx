// tests/admin/attendance/attendance-subpages.test.tsx
// Tests for: employees, locations, history, import, monthly-closing pages.

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── next/navigation ────────────────────────────────────────────────────────────
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/attendance/sub",
}));

// ── next/link ─────────────────────────────────────────────────────────────────
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
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
vi.mock("lucide-react", async () =>
  (await import("#tests/lucide-mock")).lucideMock({
  CalendarCheck: () => <svg data-testid="icon-cal" />,
  Copy: () => <svg data-testid="icon-copy" />,
  Download: () => <svg data-testid="icon-download" />,
  CheckCircle: () => <svg data-testid="icon-check-circle" />,
  CheckCircle2: () => <svg data-testid="icon-check2" />,
  FolderSearch: () => <svg data-testid="icon-folder" />,
  History: () => <svg data-testid="icon-history" />,
  MapPin: () => <svg data-testid="icon-map" />,
  RefreshCw: () => <svg data-testid="icon-refresh" />,
  Upload: () => <svg data-testid="icon-upload" />,
  Users: () => <svg data-testid="icon-users" />,
  XCircle: () => <svg data-testid="icon-x" />,
}));

// ── ui-tokens ─────────────────────────────────────────────────────────────────
vi.mock("@/lib/ui-tokens", () => ({
  BADGE_ERROR: "badge-error",
  BADGE_INFO: "badge-info",
  BADGE_SUCCESS: "badge-success",
  BADGE_WARNING: "badge-warning",
  DANGER_BUTTON: "danger-button",
  GLASS_CARD: "glass-card",
  INPUT_CLASS: "input-class",
  KPI_CARD: "kpi-card",
  KPI_LABEL: "kpi-label",
  KPI_VALUE: "kpi-value",
  PRIMARY_BUTTON: "primary-button",
  SECONDARY_BUTTON: "secondary-button",
  SELECT_CLASS: "select-class",
  SMALL_BUTTON: "small-button",
  TABLE_CELL: "table-cell",
  TABLE_HEADER: "table-header",
  TABLE_ROW: "table-row",
  T_BODY: "t-body",
  T_CAPTION: "t-caption",
  T_LABEL: "t-label",
  T_PAGE_TITLE: "t-page-title",
  T_SECTION: "t-section",
}));

// ── formatters ────────────────────────────────────────────────────────────────
vi.mock("@/lib/formatters", () => ({
  fmtNum: (v: number) => String(v ?? 0),
}));

// ── dateInput ─────────────────────────────────────────────────────────────────
vi.mock("@/lib/dateInput", () => ({
  normalizeCalendarDateInput: (v: string) => v,
}));

// ── auth ──────────────────────────────────────────────────────────────────────
const ATT_AUTH = {
  accessToken: "tok-att",
  role: "HQ",
  city: "dubai",
  staffName: "Jay",
  permissions: ["attendance.read"],
  pin: "1234",
};
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getAuth: vi.fn(() => ATT_AUTH),
    refreshAuthFromApi: vi.fn(async () => ATT_AUTH),
    canAccessAdminNav: vi.fn(() => true),
    getAuthHeaders: vi.fn(() => ({ Authorization: "Bearer tok-att" })),
  };
});

// ── fetch mock helper ─────────────────────────────────────────────────────────
let mockFetch: ReturnType<typeof vi.fn>;

// ══════════════════════════════════════════════════════════════════════════════
// The Employees, Locations, History and Import pages were removed along with
// Bayzat (commit 7801164b, "remove all Bayzat-related code from frontend").
// Their tests went with them -- there is nothing left for them to cover, and
// they could not even resolve their imports. Monthly Closing survives.
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// ── MONTHLY CLOSING PAGE ──────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

import AttendanceMonthlyClosingPage from "@/app/admin/attendance/monthly-closing/page";

describe("AttendanceMonthlyClosingPage", () => {
  it("renders page heading", () => {
    render(<AttendanceMonthlyClosingPage />);
    expect(screen.getByText("Attendance Monthly Closing")).toBeInTheDocument();
  });

  it("shows month status rows: Current Month, Previous Month, Older Periods", () => {
    render(<AttendanceMonthlyClosingPage />);
    expect(screen.getByText("Current Month")).toBeInTheDocument();
    expect(screen.getByText("Previous Month")).toBeInTheDocument();
    expect(screen.getByText("Older Periods")).toBeInTheDocument();
  });

  it("shows status labels: In review, Closed, Open", () => {
    render(<AttendanceMonthlyClosingPage />);
    // each status renders in both a <p> and a badge <span>
    expect(screen.getAllByText("In review").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Closed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Open").length).toBeGreaterThan(0);
  });

  it("back link points to /admin/attendance", () => {
    render(<AttendanceMonthlyClosingPage />);
    expect(screen.getByRole("link", { name: /Back to Attendance/i })).toHaveAttribute("href", "/admin/attendance");
  });

  it("confirm dialog initially hidden", () => {
    render(<AttendanceMonthlyClosingPage />);
    expect(screen.queryByText(/Are you sure/i)).not.toBeInTheDocument();
  });
});
