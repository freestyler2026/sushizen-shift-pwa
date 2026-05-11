import React from "react";
import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("framer-motion", () => ({
  motion: { div: ({ children, ...p }: any) => <div {...p}>{children}</div> },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));
vi.mock("recharts", () => ({
  BarChart: ({ children }: any) => <div>{children}</div>,
  Bar: () => null, XAxis: () => null, YAxis: () => null,
  Tooltip: () => null, CartesianGrid: () => null,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  Cell: () => null,
}));
// NOTE: Proxy mock deadlocks with static imports — use explicit named exports
vi.mock("lucide-react", () => ({
  ChevronDown: () => null, ChevronRight: () => null, Clock: () => null,
  AlarmClock: () => null, AlertTriangle: () => null, Users: () => null,
  Building2: () => null, Search: () => null, TrendingUp: () => null,
  TrendingDown: () => null, Download: () => null, RefreshCw: () => null,
  CheckCircle2: () => null, XCircle: () => null, AlertCircle: () => null,
  ShieldCheck: () => null, CalendarX: () => null, BarChart2: () => null,
  Info: () => null, Filter: () => null,
}));
vi.mock("@/components/DateRangePicker", () => ({ default: () => <div /> }));

let mockApiGet = vi.fn(async () => ({ ok: true, rows: [] }));
vi.mock("@/lib/api", () => ({
  apiGet: (...args: any[]) => (mockApiGet as (...a: any[]) => any)(...args),
  qs: (p: Record<string, any>) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries(p)) if (v != null) s.set(k, String(v));
    return s.toString() ? "?" + s.toString() : "";
  },
}));

import OvertimeTab from "@/app/admin/analytics/OvertimeTab";

describe("Static import test", () => {
  beforeEach(() => {
    mockApiGet = vi.fn(async () => ({ ok: true, rows: [] }));
  });

  it("renders OvertimeTab", async () => {
    render(<OvertimeTab city="dubai" dateFrom="2026-05-01" dateTo="2026-05-31" approverName="Jay" pin="1234" />);
    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
  });
});
