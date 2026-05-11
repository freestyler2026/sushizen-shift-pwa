// tests/admin/analytics/analytics-tabs.test.tsx
// Tests for the 6 stand-alone Analytics tab components:
//   OvertimeTab, LateTab, AbsenceTab, AdherenceTab, LeanShiftTab, InventoryGapTab
// Uses STATIC imports (not vi.resetModules) — avoids jsdom collection-phase hang
// that occurs when the lucide-react Proxy mock is combined with dynamic imports.

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── lucide-react: enumerate all icons used by analytics tabs ──────────────────
// NOTE: vi.mock("lucide-react", () => new Proxy(...)) deadlocks with static
// imports in this vitest/jsdom setup. Always use an explicit object here.
vi.mock("lucide-react", () => ({
  ChevronDown: () => null,
  ChevronRight: () => null,
  Clock: () => null,
  AlarmClock: () => null,
  AlertTriangle: () => null,
  Users: () => null,
  Building2: () => null,
  Search: () => null,
  TrendingUp: () => null,
  TrendingDown: () => null,
  Download: () => null,
  RefreshCw: () => null,
  CheckCircle2: () => null,
  XCircle: () => null,
  AlertCircle: () => null,
  ShieldCheck: () => null,
  CalendarX: () => null,
  BarChart2: () => null,
  Info: () => null,
  Filter: () => null,
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...p }: any) => <div {...p}>{children}</div>,
    section: ({ children, ...p }: any) => <section {...p}>{children}</section>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock("recharts", () => ({
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  Cell: () => null,
  LineChart: ({ children }: any) => <div>{children}</div>,
  Line: () => null,
  PieChart: ({ children }: any) => <div>{children}</div>,
  Pie: () => null,
}));

vi.mock("@/components/DateRangePicker", () => ({
  default: ({ value, onChange }: any) => (
    <div data-testid="date-range-picker">
      <input
        data-testid="date-from"
        value={value?.from ?? ""}
        onChange={(e) => onChange({ from: e.target.value, to: value?.to ?? "" })}
      />
    </div>
  ),
}));

vi.mock("@/components/ui/Spinner", () => ({
  Spinner: () => <div data-testid="spinner">loading</div>,
}));
vi.mock("@/components/ui/EmptyState", () => ({
  EmptyState: ({ message }: any) => <div>{message}</div>,
}));

// ── apiGet mock (shared) ──────────────────────────────────────────────────────
let mockApiGet = vi.fn(async () => ({ ok: true, rows: [] }));

vi.mock("@/lib/api", () => ({
  apiGet: (...args: any[]) => (mockApiGet as (...a: any[]) => any)(...args),
  qs: (p: Record<string, any>) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries(p)) if (v != null) s.set(k, String(v));
    return s.toString() ? `?${s.toString()}` : "";
  },
}));

// ── inventoryGet mock (shared) ────────────────────────────────────────────────
let mockInventoryGet = vi.fn(async () => ({ ok: true, store_gaps: [], ck_gaps: [] }));

vi.mock("@/lib/inventoryClient", () => ({
  inventoryGet: (...args: any[]) => (mockInventoryGet as (...a: any[]) => any)(...args),
}));

// ── Static imports — loaded once with mocks applied ───────────────────────────
import OvertimeTab from "@/app/admin/analytics/OvertimeTab";
import LateTab from "@/app/admin/analytics/LateTab";
import AbsenceTab from "@/app/admin/analytics/AbsenceTab";
import AdherenceTab from "@/app/admin/analytics/AdherenceTab";
import LeanShiftTab from "@/app/admin/analytics/LeanShiftTab";
import InventoryGapTab from "@/app/admin/analytics/InventoryGapTab";

// ── Default props ─────────────────────────────────────────────────────────────
const DEFAULT_PROPS = {
  city: "dubai",
  dateFrom: "2026-05-01",
  dateTo: "2026-05-31",
  approverName: "Jay",
  pin: "1234",
};

// ════════════════════════════════════════════════════════════════════════════════
// OvertimeTab
// ════════════════════════════════════════════════════════════════════════════════
describe("OvertimeTab", () => {
  beforeEach(() => {
    mockApiGet = vi.fn(async () => ({ ok: true, rows: [] }));
  });

  it("renders without crashing", async () => {
    mockApiGet = vi.fn(async () => ({
      ok: true,
      total_incidents: 0, total_staff: 0, total_overtime_minutes: 0,
      avg_overtime_minutes: 0, max_overtime_minutes: 0, rows: [],
    }));
    render(<OvertimeTab {...DEFAULT_PROPS} />);
    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
  });

  it("calls overtime/summary with correct city param", async () => {
    render(<OvertimeTab {...DEFAULT_PROPS} city="manila" />);
    await waitFor(() => {
      const urls = (mockApiGet as ReturnType<typeof vi.fn>).mock.calls
        .map((c: any[]) => String(c[0] || ""));
      expect(urls.some((u) => u.includes("overtime/summary") && u.includes("city=manila"))).toBe(true);
    });
  });

  it("shows overtime data for a staff member", async () => {
    mockApiGet = vi.fn(async (url: string) => {
      if (url.includes("/summary"))
        return {
          ok: true,
          total_incidents: 5, total_staff: 3, total_overtime_minutes: 240,
          avg_overtime_minutes: 48, max_overtime_minutes: 90,
        };
      if (url.includes("/by_branch"))
        return {
          ok: true,
          rows: [{ branch_code: "BR-01", incidents: 3, staff_count: 2,
                   total_overtime_minutes: 120, avg_overtime_minutes: 40 }],
        };
      if (url.includes("/by_staff"))
        return {
          ok: true,
          rows: [{ staff_name: "Alice", branch_code: "BR-01", ot_days: 3,
                   total_overtime_minutes: 120, avg_overtime_minutes: 40, max_overtime_minutes: 60 }],
        };
      return { ok: true, rows: [] };
    });
    render(<OvertimeTab {...DEFAULT_PROPS} />);
    // Staff rows appear in the "By Staff" view — click it first
    fireEvent.click(screen.getByText("By Staff"));
    await screen.findByText("Alice");
  });

  it("shows error message when API fails", async () => {
    mockApiGet = vi.fn(async () => { throw new Error("OT service unavailable"); });
    render(<OvertimeTab {...DEFAULT_PROPS} />);
    await screen.findByText("OT service unavailable");
  });

  it("shows no data message when rows are empty", async () => {
    mockApiGet = vi.fn(async (url: string) => {
      if (url.includes("/summary"))
        return {
          ok: true,
          total_incidents: 0, total_staff: 0, total_overtime_minutes: 0,
          avg_overtime_minutes: 0, max_overtime_minutes: 0,
        };
      return { ok: true, rows: [] };
    });
    render(<OvertimeTab {...DEFAULT_PROPS} />);
    await screen.findByText(/No overtime recorded/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// LateTab
// ════════════════════════════════════════════════════════════════════════════════
describe("LateTab", () => {
  beforeEach(() => {
    mockApiGet = vi.fn(async () => ({ ok: true, rows: [] }));
  });

  it("renders without crashing", async () => {
    render(<LateTab {...DEFAULT_PROPS} />);
    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
  });

  it("calls late/by_branch with city from props", async () => {
    render(<LateTab {...DEFAULT_PROPS} city="dubai" />);
    await waitFor(() => {
      const urls = (mockApiGet as ReturnType<typeof vi.fn>).mock.calls
        .map((c: any[]) => String(c[0] || ""));
      expect(urls.some((u) => u.includes("late/by_branch") && u.includes("city=dubai"))).toBe(true);
    });
  });

  it("shows late branch data", async () => {
    mockApiGet = vi.fn(async (url: string) => {
      if (url.includes("/by_branch"))
        return {
          ok: true,
          rows: [{ branch_code: "BR-01", incidents: 4, staff_count: 2,
                   total_late_minutes: 80, avg_late_minutes: 20, max_late_minutes: 35 }],
        };
      return { ok: true, rows: [] };
    });
    render(<LateTab {...DEFAULT_PROPS} />);
    const matches = await screen.findAllByText("BR-01");
    expect(matches.length).toBeGreaterThan(0);
  });

  it("shows error message when API fails", async () => {
    mockApiGet = vi.fn(async () => { throw new Error("Late API error"); });
    render(<LateTab {...DEFAULT_PROPS} />);
    await screen.findByText("Late API error");
  });

  it("shows city switcher buttons (Dubai / Manila)", async () => {
    render(<LateTab {...DEFAULT_PROPS} />);
    expect(screen.getByText("Dubai")).toBeInTheDocument();
    expect(screen.getByText("Manila")).toBeInTheDocument();
  });

  it("[FIXED] initial load uses city from props — not hardcoded", async () => {
    render(<LateTab {...DEFAULT_PROPS} city="manila" />);
    await waitFor(() => {
      const urls = (mockApiGet as ReturnType<typeof vi.fn>).mock.calls
        .map((c: any[]) => String(c[0] || ""));
      expect(urls.some((u) => u.includes("city=manila"))).toBe(true);
    });
  });

  it("shows no data message when rows empty", async () => {
    render(<LateTab {...DEFAULT_PROPS} />);
    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
    // Actual component text: "No late incidents recorded in this period."
    await screen.findByText(/No late incidents/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// AbsenceTab
// ════════════════════════════════════════════════════════════════════════════════
describe("AbsenceTab", () => {
  beforeEach(() => {
    mockApiGet = vi.fn(async () => ({ ok: true, rows: [] }));
  });

  it("renders without crashing", async () => {
    render(<AbsenceTab {...DEFAULT_PROPS} />);
    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
  });

  it("calls absence/by_branch with city from props", async () => {
    render(<AbsenceTab {...DEFAULT_PROPS} city="dubai" />);
    await waitFor(() => {
      const urls = (mockApiGet as ReturnType<typeof vi.fn>).mock.calls
        .map((c: any[]) => String(c[0] || ""));
      expect(urls.some((u) => u.includes("absence/by_branch") && u.includes("city=dubai"))).toBe(true);
    });
  });

  it("shows absence branch data", async () => {
    mockApiGet = vi.fn(async (url: string) => {
      if (url.includes("/by_branch"))
        return {
          ok: true,
          rows: [{ branch_code: "BR-01", incidents: 2, staff_count: 1, absent_days: 2 }],
        };
      return { ok: true, rows: [] };
    });
    render(<AbsenceTab {...DEFAULT_PROPS} />);
    await screen.findByText("BR-01");
  });

  it("shows error message when API fails", async () => {
    mockApiGet = vi.fn(async () => { throw new Error("Absence load error"); });
    render(<AbsenceTab {...DEFAULT_PROPS} />);
    await screen.findByText("Absence load error");
  });

  it("shows city switcher", async () => {
    render(<AbsenceTab {...DEFAULT_PROPS} />);
    expect(screen.getByText("Dubai")).toBeInTheDocument();
    expect(screen.getByText("Manila")).toBeInTheDocument();
  });

  it("shows no data message when rows empty", async () => {
    render(<AbsenceTab {...DEFAULT_PROPS} />);
    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
    // Actual text: "No absence records in this period."
    await screen.findByText(/No absence records/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// AdherenceTab
// ════════════════════════════════════════════════════════════════════════════════
describe("AdherenceTab", () => {
  beforeEach(() => {
    mockApiGet = vi.fn(async () => ({ ok: true, rows: [] }));
  });

  it("renders without crashing", async () => {
    render(<AdherenceTab {...DEFAULT_PROPS} />);
    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
  });

  it("calls adherence/by_branch on initial render", async () => {
    render(<AdherenceTab {...DEFAULT_PROPS} />);
    await waitFor(() => {
      const urls = (mockApiGet as ReturnType<typeof vi.fn>).mock.calls
        .map((c: any[]) => String(c[0] || ""));
      expect(urls.some((u) => u.includes("adherence/by_branch"))).toBe(true);
    });
  });

  it("shows branch adherence data", async () => {
    mockApiGet = vi.fn(async () => ({
      ok: true,
      rows: [{
        branch_code: "DXBMALL", scheduled_shifts: 20, attended_shifts: 18,
        no_show_count: 2, late_shifts: 1, adherence_rate: 90,
      }],
    }));
    render(<AdherenceTab {...DEFAULT_PROPS} />);
    await screen.findByText("DXBMALL");
  });

  it("shows error message when API fails", async () => {
    mockApiGet = vi.fn(async () => { throw new Error("Adherence load failed"); });
    render(<AdherenceTab {...DEFAULT_PROPS} />);
    await screen.findByText("Adherence load failed");
  });

  it("shows By Branch and By Staff view tabs", async () => {
    render(<AdherenceTab {...DEFAULT_PROPS} />);
    expect(screen.getByText("By Branch")).toBeInTheDocument();
    expect(screen.getByText("By Staff")).toBeInTheDocument();
  });

  it("switches to By Staff view on click", async () => {
    render(<AdherenceTab {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByText("By Staff"));
    await waitFor(() => {
      const urls = (mockApiGet as ReturnType<typeof vi.fn>).mock.calls
        .map((c: any[]) => String(c[0] || ""));
      expect(urls.some((u) => u.includes("adherence/by_staff"))).toBe(true);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// LeanShiftTab
// ════════════════════════════════════════════════════════════════════════════════
describe("LeanShiftTab", () => {
  beforeEach(() => {
    mockApiGet = vi.fn(async () => ({ ok: true, rows: [], total_rows: 0 }));
  });

  it("renders without crashing", async () => {
    render(<LeanShiftTab {...DEFAULT_PROPS} />);
    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
  });

  it("calls lean_shift endpoint with correct city", async () => {
    render(<LeanShiftTab {...DEFAULT_PROPS} city="manila" />);
    await waitFor(() => {
      const urls = (mockApiGet as ReturnType<typeof vi.fn>).mock.calls
        .map((c: any[]) => String(c[0] || ""));
      expect(urls.some((u) => u.includes("lean_shift") && u.includes("city=manila"))).toBe(true);
    });
  });

  it("shows lean shift rows", async () => {
    mockApiGet = vi.fn(async () => ({
      ok: true,
      rows: [{
        branch_code: "MNL-01", dow: 1, day_name: "Mon", shift_count: 8,
        avg_checkout_hour: 19.5, avg_checkin_hour: 10.5, lean_start_hour: 10.5,
        avg_hours_worked: 9.0, avg_ot_minutes: 30, avg_scheduled_hours: 9.0,
        reducible_ot_per_shift: 30,
      }],
      summary: { total_reducible_ot_minutes: 240, branches_with_builtin_ot: 1, total_branches: 1 },
    }));
    render(<LeanShiftTab {...DEFAULT_PROPS} />);
    const matches = await screen.findAllByText("MNL-01");
    expect(matches.length).toBeGreaterThan(0);
  });

  it("shows error when API fails", async () => {
    mockApiGet = vi.fn(async () => { throw new Error("Lean shift error"); });
    render(<LeanShiftTab {...DEFAULT_PROPS} />);
    await screen.findByText("Lean shift error");
  });

  it("shows empty state when no rows", async () => {
    render(<LeanShiftTab {...DEFAULT_PROPS} />);
    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
    // Component text (English, fixed from Japanese): "No lean shift data found..."
    await screen.findByText(/No lean shift data found/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// InventoryGapTab
// ════════════════════════════════════════════════════════════════════════════════
describe("InventoryGapTab", () => {
  beforeEach(() => {
    mockInventoryGet = vi.fn(async () => ({ ok: true, store_gaps: [], ck_gaps: [] }));
  });

  it("renders without crashing", async () => {
    render(<InventoryGapTab city="dubai" />);
    await waitFor(() => expect(mockInventoryGet).toHaveBeenCalled());
  });

  it("calls gap-summary with correct city", async () => {
    render(<InventoryGapTab city="manila" />);
    await waitFor(() => {
      const urls = (mockInventoryGet as ReturnType<typeof vi.fn>).mock.calls
        .map((c: any[]) => String(c[0] || ""));
      expect(urls.some((u) => u.includes("gap-summary") && u.includes("city=manila"))).toBe(true);
    });
  });

  it("[FIXED] uses city=dubai — not hardcoded to manila", async () => {
    render(<InventoryGapTab city="dubai" />);
    await waitFor(() => {
      const urls = (mockInventoryGet as ReturnType<typeof vi.fn>).mock.calls
        .map((c: any[]) => String(c[0] || ""));
      expect(urls.some((u) => u.includes("city=dubai"))).toBe(true);
      expect(urls.every((u) => !u.includes("city=manila"))).toBe(true);
    });
  });

  it("shows store gap data", async () => {
    mockInventoryGet = vi.fn(async () => ({
      ok: true,
      store_gaps: [{
        branch_code: "DXBMALL", business_date: "2026-05-10", count_no: "1",
        count_id: "cnt-1", item_count: 50, shortage_count: 3,
        surplus_count: 0, total_abs_gap: 5.5, net_gap: -5.5,
      }],
      ck_gaps: [],
    }));
    render(<InventoryGapTab city="dubai" />);
    await waitFor(() => expect(screen.getByText(/3 short/i)).toBeInTheDocument());
  });

  it("shows empty state when no store gaps", async () => {
    render(<InventoryGapTab city="dubai" />);
    await screen.findByText(/No submitted counts found/i);
  });

  it("shows error message when inventoryGet fails", async () => {
    mockInventoryGet = vi.fn(async () => { throw new Error("Inventory gap API error"); });
    render(<InventoryGapTab city="dubai" />);
    // Component renders: ❌ {error} — use regex to match within the combined text
    await screen.findByText(/Inventory gap API error/i);
  });
});
