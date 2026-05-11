import { describe, it, expect, vi } from "vitest";

// Use a factory that returns an object, not a Proxy
vi.mock("lucide-react", () => ({
  ChevronDown: () => null, ChevronRight: () => null, Clock: () => null,
  AlertTriangle: () => null, Users: () => null, Building2: () => null,
  Search: () => null, TrendingUp: () => null, RefreshCw: () => null,
  Download: () => null, XCircle: () => null, AlertCircle: () => null,
  CheckCircle: () => null, BarChart2: () => null, Calendar: () => null,
  Filter: () => null, ArrowUpDown: () => null, Info: () => null,
}));
vi.mock("recharts", () => ({ BarChart: () => null, Bar: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null, ResponsiveContainer: () => null, Cell: () => null }));
vi.mock("@/components/DateRangePicker", () => ({ default: () => null }));
vi.mock("@/lib/api", () => ({ apiGet: vi.fn(async () => ({})), qs: () => "" }));

import OvertimeTab from "@/app/admin/analytics/OvertimeTab";

describe("min test", () => {
  it("works", () => { expect(OvertimeTab).toBeDefined(); });
});
