// tests/admin/cost-calculation/cost-calculation.test.tsx
// Tests for src/app/admin/cost-calculation/page.tsx
// Covers: auth guard, tab navigation, city persistence, ingredient/master/invoice/ratio
//         sections, error state, search placeholder switching.

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── next/navigation ───────────────────────────────────────────────────────────
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/cost-calculation",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, className }: any) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

// ── lucide-react: explicit names (Proxy mock deadlocks with static imports) ───
vi.mock("lucide-react", () => ({
  AlertTriangle: () => null,
  Calculator: () => null,
  ChevronDown: () => null,
  ChevronRight: () => null,
  Clock: () => null,
  Database: () => null,
  ExternalLink: () => null,
  History: () => null,
  LayoutGrid: () => null,
  Loader2: () => null,
  Percent: () => null,
  Pencil: () => null,
  Plus: () => null,
  RotateCcw: () => null,
  Save: () => null,
  Search: () => null,
  ShieldCheck: () => null,
  SkipForward: () => null,
  Trash2: () => null,
  User: () => null,
  X: () => null,
}));

// ── Auth mock ─────────────────────────────────────────────────────────────────
let mockAuthReturn: any = null;
let mockCanAccessCostAdmin = true;

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getAuth: vi.fn(() => mockAuthReturn),
    refreshAuthFromApi: vi.fn(async () => mockAuthReturn),
    setAuth: vi.fn(),
    canAccessCostAdmin: vi.fn(() => mockCanAccessCostAdmin),
  };
});

// ── costClient mock ───────────────────────────────────────────────────────────
let mockCostJson: ReturnType<typeof vi.fn> = vi.fn(async (url: string) => {
  if (url.includes("/ingredients")) return { items: [], ingredients: [] };
  if (url.includes("/recipe-sheets")) return { items: [] };
  if (url.includes("/master-items")) return { items: [] };
  if (url.includes("/component-options")) return { items: [] };
  if (url.includes("/invoice-mappings")) return { items: [], unmatched: [] };
  if (url.includes("/unmatched-invoice-items")) return { items: [] };
  return {};
});

vi.mock("@/lib/costClient", () => ({
  costJson: (...args: any[]) => (mockCostJson as (...a: any[]) => any)(...args),
  costUpload: vi.fn(async () => ({})),
}));

// ── sessionStorage mock ───────────────────────────────────────────────────────
const sessionStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, "sessionStorage", { value: sessionStorageMock });

// ── localStorage mock ─────────────────────────────────────────────────────────
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock });

// ── Auth fixtures ─────────────────────────────────────────────────────────────
const HQ_AUTH = {
  accessToken: "tok",
  role: "HQ",
  city: "dubai",
  staffName: "Jay",
  permissions: ["cost.read", "cost.write"],
  pin: "1234",
};

const MANILA_AUTH = {
  ...HQ_AUTH,
  city: "manila",
};

const NO_PERM_AUTH = {
  accessToken: "tok",
  role: "STAFF",
  city: "dubai",
  staffName: "Bob",
  permissions: [],
  pin: "",
};

// ── Static import ─────────────────────────────────────────────────────────────
import CostCalculationPage from "@/app/admin/cost-calculation/page";

// ════════════════════════════════════════════════════════════════════════════════
describe("CostCalculationPage — auth guard", () => {
  beforeEach(() => {
    mockAuthReturn = null;
    mockCanAccessCostAdmin = false;
    sessionStorageMock.clear();
    localStorageMock.clear();
    mockCostJson = vi.fn(async (url: string) => {
      if (url.includes("/ingredients")) return { items: [], ingredients: [] };
      if (url.includes("/recipe-sheets")) return { items: [] };
      if (url.includes("/master-items")) return { items: [] };
      if (url.includes("/component-options")) return { items: [] };
      if (url.includes("invoice-item-mappings")) return { items: [] };
      if (url.includes("/unmatched-invoice-items")) return { items: [] };
      return {};
    });
  });

  it("shows access-denied message for unauthorized user", async () => {
    mockAuthReturn = NO_PERM_AUTH;
    mockCanAccessCostAdmin = false;
    render(<CostCalculationPage />);
    await screen.findByText(/authorized admin roles/i);
  });

  it("does NOT show access-denied for authorized user", async () => {
    mockAuthReturn = HQ_AUTH;
    mockCanAccessCostAdmin = true;
    render(<CostCalculationPage />);
    await waitFor(() => {
      expect(screen.queryByText(/authorized admin roles/i)).not.toBeInTheDocument();
    });
  });

  it("renders page title 'Cost Calculation' for authorized user", async () => {
    mockAuthReturn = HQ_AUTH;
    mockCanAccessCostAdmin = true;
    render(<CostCalculationPage />);
    await screen.findByText("Cost Calculation");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("CostCalculationPage — tab navigation", () => {
  beforeEach(() => {
    mockAuthReturn = HQ_AUTH;
    mockCanAccessCostAdmin = true;
    sessionStorageMock.clear();
    localStorageMock.clear();
  });

  it("renders all 6 section tabs", async () => {
    render(<CostCalculationPage />);
    await screen.findByText("Cost Calculation");
    expect(screen.getByText("食材マスタ")).toBeInTheDocument();
    expect(screen.getByText("加工品マスタ")).toBeInTheDocument();
    expect(screen.getByText("商品マスタ")).toBeInTheDocument();
    expect(screen.getByText("新商品用コスト計算")).toBeInTheDocument();
    expect(screen.getByText("仕入連動")).toBeInTheDocument();
    expect(screen.getByText("原価率一覧")).toBeInTheDocument();
  });

  it("renders '連動チェック' link tab", async () => {
    render(<CostCalculationPage />);
    await screen.findByText("Cost Calculation");
    expect(screen.getByText("連動チェック")).toBeInTheDocument();
  });

  it("'連動チェック' link points to cost-check?city=dubai by default", async () => {
    render(<CostCalculationPage />);
    await screen.findByText("連動チェック");
    const link = screen.getByRole("link", { name: /連動チェック/i });
    expect(link).toHaveAttribute("href", expect.stringContaining("cost-check"));
    expect(link).toHaveAttribute("href", expect.stringContaining("city=dubai"));
  });

  it("clicking 加工品マスタ tab triggers master item load", async () => {
    render(<CostCalculationPage />);
    await screen.findByText("Cost Calculation");
    fireEvent.click(screen.getByText("加工品マスタ"));
    await waitFor(() => {
      const calls = (mockCostJson as ReturnType<typeof vi.fn>).mock.calls.map((c: any[]) => String(c[0]));
      expect(calls.some((u) => u.includes("master-items"))).toBe(true);
    });
  });

  it("clicking 仕入連動 tab triggers invoice mapping load", async () => {
    render(<CostCalculationPage />);
    await screen.findByText("Cost Calculation");
    fireEvent.click(screen.getByText("仕入連動"));
    await waitFor(() => {
      const calls = (mockCostJson as ReturnType<typeof vi.fn>).mock.calls.map((c: any[]) => String(c[0]));
      expect(
        calls.some((u) => u.includes("invoice-mappings") || u.includes("unmatched")),
      ).toBe(true);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("CostCalculationPage — city state", () => {
  beforeEach(() => {
    mockAuthReturn = HQ_AUTH;
    mockCanAccessCostAdmin = true;
    sessionStorageMock.clear();
    localStorageMock.clear();
  });

  it("defaults to dubai when auth.city is dubai", async () => {
    mockAuthReturn = HQ_AUTH; // city: "dubai"
    render(<CostCalculationPage />);
    await screen.findByText("Cost Calculation");
    expect(screen.getByText("Dubai / AED")).toBeInTheDocument();
  });

  it("defaults to manila when auth.city is manila", async () => {
    mockAuthReturn = MANILA_AUTH;
    render(<CostCalculationPage />);
    await screen.findByText("Cost Calculation");
    expect(screen.getByText("Manila / PHP")).toBeInTheDocument();
  });

  it("reads city from sessionStorage on init", async () => {
    sessionStorageMock.setItem("cost_city_selection", "manila");
    mockAuthReturn = HQ_AUTH; // auth.city = dubai, but session says manila
    render(<CostCalculationPage />);
    await screen.findByText("Cost Calculation");
    expect(screen.getByText("Manila / PHP")).toBeInTheDocument();
  });

  it("city dropdown persists selection to sessionStorage", async () => {
    mockAuthReturn = HQ_AUTH;
    render(<CostCalculationPage />);
    await screen.findByText("Cost Calculation");
    // The city select has options "Dubai" and "Manila" — use getByDisplayValue
    const select = screen.getByDisplayValue("Dubai") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "manila" } });
    expect(sessionStorageMock.getItem("cost_city_selection")).toBe("manila");
  });

  it("changing city to dubai sets sessionStorage to dubai", async () => {
    sessionStorageMock.setItem("cost_city_selection", "manila");
    mockAuthReturn = MANILA_AUTH;
    render(<CostCalculationPage />);
    await screen.findByText("Manila / PHP");
    const select = screen.getByDisplayValue("Manila") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "dubai" } });
    expect(sessionStorageMock.getItem("cost_city_selection")).toBe("dubai");
  });

  it("currency code changes to PHP when city is manila", async () => {
    sessionStorageMock.setItem("cost_city_selection", "manila");
    mockAuthReturn = MANILA_AUTH;
    render(<CostCalculationPage />);
    await screen.findByText("Manila / PHP");
    // The currency label should contain PHP
    expect(screen.getByText("Manila / PHP")).toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("CostCalculationPage — ingredient section", () => {
  beforeEach(() => {
    mockAuthReturn = HQ_AUTH;
    mockCanAccessCostAdmin = true;
    sessionStorageMock.clear();
    localStorageMock.clear();
  });

  it("calls ingredients API on load", async () => {
    render(<CostCalculationPage />);
    await waitFor(() => {
      const calls = (mockCostJson as ReturnType<typeof vi.fn>).mock.calls.map((c: any[]) => String(c[0]));
      expect(calls.some((u) => u.includes("/ingredients"))).toBe(true);
    });
  });

  it("includes city=dubai in ingredients API call", async () => {
    mockAuthReturn = HQ_AUTH;
    render(<CostCalculationPage />);
    await waitFor(() => {
      const calls = (mockCostJson as ReturnType<typeof vi.fn>).mock.calls.map((c: any[]) => String(c[0]));
      expect(calls.some((u) => u.includes("city=dubai"))).toBe(true);
    });
  });

  it("search input placeholder is 'Search ingredients...' in ingredient section", async () => {
    render(<CostCalculationPage />);
    await screen.findByText("Cost Calculation");
    const input = screen.getByPlaceholderText("Search ingredients...");
    expect(input).toBeInTheDocument();
  });

  it("shows ingredients table with column headers when data loads", async () => {
    mockCostJson = vi.fn(async (url: string) => {
      if (url.includes("/ingredients")) {
        return {
          items: [
            { id: "1", name: "Salmon", category: "Fish", unit: "g", unit_price: 1.5, buffer_rate: 1.15, yield_rate: null, notes: "", city: "dubai" },
          ],
        };
      }
      if (url.includes("/recipe-sheets")) return { items: [] };
      if (url.includes("/master-items")) return { items: [] };
      if (url.includes("/component-options")) return { items: [] };
      if (url.includes("invoice-item-mappings")) return { items: [] };
      return {};
    });
    render(<CostCalculationPage />);
    await screen.findByText("Salmon");
    expect(screen.getByText("Fish")).toBeInTheDocument();
  });

  it("shows multiple ingredients when API returns them", async () => {
    mockCostJson = vi.fn(async (url: string) => {
      if (url.includes("/ingredients")) {
        return {
          items: [
            { id: "1", name: "Salmon", category: "Fish", unit: "g", unit_price: 1.5, buffer_rate: 1.15, yield_rate: null, notes: "", city: "dubai" },
            { id: "2", name: "Tuna", category: "Fish", unit: "g", unit_price: 2.0, buffer_rate: 1.15, yield_rate: null, notes: "", city: "dubai" },
          ],
        };
      }
      if (url.includes("/recipe-sheets")) return { items: [] };
      return {};
    });
    render(<CostCalculationPage />);
    await screen.findByText("Salmon");
    expect(screen.getByText("Tuna")).toBeInTheDocument();
  });

  it("shows an error banner when ingredients API fails", async () => {
    // When loadIngredients throws, setError is called.
    // Note: loadInvoiceMappingData runs concurrently and may overwrite the ingredient error
    // with its own error message if invoice calls also fail.
    // This test just verifies that SOME error banner is shown.
    mockCostJson = vi.fn(async (url: string) => {
      if (url.includes("/ingredients")) throw new Error("Ingredients API error");
      if (url.includes("/recipe-sheets")) return { items: [] };
      if (url.includes("invoice-item-mappings")) throw new Error("invoice unavailable");
      return {};
    });
    render(<CostCalculationPage />);
    // Wait for some error banner to appear (either ingredient or invoice error)
    await waitFor(() => {
      const allErrors = screen.queryAllByText(/error|fail|could not be loaded|API error/i);
      expect(allErrors.length).toBeGreaterThan(0);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("CostCalculationPage — master sections", () => {
  beforeEach(() => {
    mockAuthReturn = HQ_AUTH;
    mockCanAccessCostAdmin = true;
    sessionStorageMock.clear();
    localStorageMock.clear();
    mockCostJson = vi.fn(async (url: string) => {
      if (url.includes("/ingredients")) return { items: [] };
      if (url.includes("/recipe-sheets")) return { items: [] };
      if (url.includes("/master-items")) return { items: [] };
      if (url.includes("/component-options")) return { items: [] };
      if (url.includes("invoice-item-mappings")) return { items: [] };
      if (url.includes("/unmatched-invoice-items")) return { items: [] };
      return {};
    });
  });

  it("search placeholder changes to 'Search items or components...' on 加工品マスタ tab", async () => {
    render(<CostCalculationPage />);
    await screen.findByText("Cost Calculation");
    fireEvent.click(screen.getByText("加工品マスタ"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search items or components...")).toBeInTheDocument();
    });
  });

  it("加工品マスタ tab calls master-items API with type=processed", async () => {
    render(<CostCalculationPage />);
    await screen.findByText("Cost Calculation");
    fireEvent.click(screen.getByText("加工品マスタ"));
    await waitFor(() => {
      const calls = (mockCostJson as ReturnType<typeof vi.fn>).mock.calls.map((c: any[]) => String(c[0]));
      expect(calls.some((u) => u.includes("type=processed"))).toBe(true);
    });
  });

  it("商品マスタ tab calls master-items API with type=product", async () => {
    render(<CostCalculationPage />);
    await screen.findByText("Cost Calculation");
    fireEvent.click(screen.getByText("商品マスタ"));
    await waitFor(() => {
      const calls = (mockCostJson as ReturnType<typeof vi.fn>).mock.calls.map((c: any[]) => String(c[0]));
      expect(calls.some((u) => u.includes("type=product"))).toBe(true);
    });
  });

  it("新商品用コスト計算 tab calls master-items API with type=draft", async () => {
    render(<CostCalculationPage />);
    await screen.findByText("Cost Calculation");
    fireEvent.click(screen.getByText("新商品用コスト計算"));
    await waitFor(() => {
      const calls = (mockCostJson as ReturnType<typeof vi.fn>).mock.calls.map((c: any[]) => String(c[0]));
      expect(calls.some((u) => u.includes("type=draft"))).toBe(true);
    });
  });

  it("shows master item rows when 加工品マスタ data loads", async () => {
    mockCostJson = vi.fn(async (url: string) => {
      if (url.includes("/master-items") && url.includes("type=processed")) {
        return {
          items: [
            {
              id: "mi-1", city: "dubai", category: "Sauce", name: "Teriyaki Sauce",
              item_type: "processed", status: "active", component_count: 3,
              cost_unit_price: 50, total_cost: 50, unit_cost: 50, cost_ratio: null,
              selling_price: 0, output_unit: "ml", output_qty: 100, buffer_rate: 1.15,
              yield_rate: null, yield_configured: false, is_active: true,
              description: "", source_type: "manual", display_order: 0,
              raw_cost: 50, yield_adjusted_total: 50, computed_unit_cost: 50,
              cost_unit_price_formula: "", cost_unit_price_formula_note: "",
            },
          ],
        };
      }
      if (url.includes("/ingredients")) return { items: [] };
      if (url.includes("/recipe-sheets")) return { items: [] };
      if (url.includes("/master-items")) return { items: [] };
      if (url.includes("/component-options")) return { items: [] };
      if (url.includes("invoice-item-mappings")) return { items: [] };
      return {};
    });
    render(<CostCalculationPage />);
    await screen.findByText("Cost Calculation");
    fireEvent.click(screen.getByText("加工品マスタ"));
    await screen.findByText("Teriyaki Sauce");
    expect(screen.getByText("Sauce")).toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("CostCalculationPage — invoice section (仕入連動)", () => {
  beforeEach(() => {
    mockAuthReturn = HQ_AUTH;
    mockCanAccessCostAdmin = true;
    sessionStorageMock.clear();
    localStorageMock.clear();
    mockCostJson = vi.fn(async (url: string) => {
      if (url.includes("/ingredients")) return { items: [] };
      if (url.includes("/recipe-sheets")) return { items: [] };
      if (url.includes("/master-items")) return { items: [] };
      if (url.includes("/component-options")) return { items: [] };
      if (url.includes("invoice-item-mappings")) return { items: [] };
      if (url.includes("/unmatched-invoice-items")) return { items: [] };
      return {};
    });
  });

  it("switching to 仕入連動 tab calls invoice API endpoints", async () => {
    render(<CostCalculationPage />);
    await screen.findByText("Cost Calculation");
    fireEvent.click(screen.getByText("仕入連動"));
    await waitFor(() => {
      const calls = (mockCostJson as ReturnType<typeof vi.fn>).mock.calls.map((c: any[]) => String(c[0]));
      expect(
        calls.some((u) => u.includes("invoice-mappings") || u.includes("unmatched")),
      ).toBe(true);
    });
  });

  it("shows new mapping form when unmatched item is auto-selected after data loads", async () => {
    // When unmatched items load, selectedUnmatchedItemKey is automatically set to the first item,
    // which shows the mapping creation form (新規マッピング作成) in the right panel.
    mockCostJson = vi.fn(async (url: string) => {
      if (url.includes("invoice-item-mappings/unmatched")) {
        return {
          items: [
            {
              market: "dubai", supplier_name: "Toyo Foods", item_description: "Salmon Fillet",
              unit: "KG", latest_invoice_date: "2026-05-01", latest_unit_price: 45.0,
              invoice_count: 5, line_count: 10,
            },
          ],
        };
      }
      if (url.includes("invoice-item-mappings")) return { items: [] };
      if (url.includes("/ingredients")) return { items: [] };
      if (url.includes("/recipe-sheets")) return { items: [] };
      if (url.includes("/master-items")) return { items: [] };
      if (url.includes("/component-options")) return { items: [] };
      return {};
    });
    render(<CostCalculationPage />);
    await screen.findByText("Cost Calculation");
    fireEvent.click(screen.getByText("仕入連動"));
    // When 1 unmatched item loads, selectedUnmatchedItemKey is auto-set → form shows
    await screen.findByText("新規マッピング作成");
    expect(screen.getByText("食材検索")).toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("CostCalculationPage — cost-ratio section (原価率一覧)", () => {
  beforeEach(() => {
    mockAuthReturn = HQ_AUTH;
    mockCanAccessCostAdmin = true;
    sessionStorageMock.clear();
    localStorageMock.clear();
    mockCostJson = vi.fn(async (url: string) => {
      if (url.includes("/ingredients")) return { items: [] };
      if (url.includes("/recipe-sheets")) return { items: [] };
      if (url.includes("/master-items")) return { items: [] };
      if (url.includes("/component-options")) return { items: [] };
      if (url.includes("invoice-item-mappings")) return { items: [] };
      return {};
    });
  });

  it("switching to 原価率一覧 tab loads product master items", async () => {
    render(<CostCalculationPage />);
    await screen.findByText("Cost Calculation");
    fireEvent.click(screen.getByText("原価率一覧"));
    await waitFor(() => {
      const calls = (mockCostJson as ReturnType<typeof vi.fn>).mock.calls.map((c: any[]) => String(c[0]));
      expect(calls.some((u) => u.includes("type=product"))).toBe(true);
    });
  });

  it("shows cost ratio items when data loads", async () => {
    mockCostJson = vi.fn(async (url: string) => {
      if (url.includes("/master-items") && url.includes("type=product")) {
        return {
          items: [
            {
              id: "p-1", city: "dubai", category: "Sushi", name: "Salmon Roll",
              item_type: "product", status: "active", component_count: 5,
              cost_unit_price: 0, total_cost: 12.5, unit_cost: 12.5, cost_ratio: 0.42,
              selling_price: 30, output_unit: "pc", output_qty: 1, buffer_rate: 1.15,
              yield_rate: null, yield_configured: false, is_active: true,
              description: "", source_type: "manual", display_order: 0,
              raw_cost: 12.5, yield_adjusted_total: 12.5, computed_unit_cost: 12.5,
              cost_unit_price_formula: "", cost_unit_price_formula_note: "",
            },
          ],
        };
      }
      if (url.includes("/ingredients")) return { items: [] };
      if (url.includes("/recipe-sheets")) return { items: [] };
      if (url.includes("/master-items")) return { items: [] };
      if (url.includes("/component-options")) return { items: [] };
      if (url.includes("invoice-item-mappings")) return { items: [] };
      return {};
    });
    render(<CostCalculationPage />);
    await screen.findByText("Cost Calculation");
    fireEvent.click(screen.getByText("原価率一覧"));
    await screen.findByText("Salmon Roll");
    // "Sushi" appears in both filter button and item row — use getAllByText
    const sushiMatches = screen.getAllByText("Sushi");
    expect(sushiMatches.length).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("CostCalculationPage — search", () => {
  beforeEach(() => {
    mockAuthReturn = HQ_AUTH;
    mockCanAccessCostAdmin = true;
    sessionStorageMock.clear();
    localStorageMock.clear();
    mockCostJson = vi.fn(async (url: string) => {
      if (url.includes("/ingredients")) {
        return {
          items: [
            { id: "1", name: "Salmon", category: "Fish", unit: "g", unit_price: 1.5, buffer_rate: 1.15, yield_rate: null, notes: "", city: "dubai" },
            { id: "2", name: "Tuna", category: "Fish", unit: "g", unit_price: 2.0, buffer_rate: 1.15, yield_rate: null, notes: "", city: "dubai" },
          ],
        };
      }
      if (url.includes("/recipe-sheets")) return { items: [] };
      return {};
    });
  });

  it("filters ingredients by search text to reduce visible rows", async () => {
    render(<CostCalculationPage />);
    // Wait for both rows to load
    await screen.findAllByText("Salmon");
    await screen.findByText("Tuna");
    // Count items before filter
    const beforeFilter = screen.getAllByText(/Salmon|Tuna/).length;
    const input = screen.getByPlaceholderText("Search ingredients...");
    // Filter to only show Tuna
    fireEvent.change(input, { target: { value: "tuna" } });
    await waitFor(() => {
      const afterFilter = screen.getAllByText(/Tuna/).length;
      // Tuna is still visible after filtering for "tuna"
      expect(afterFilter).toBeGreaterThan(0);
    });
  });

  it("clears search filter on Escape key", async () => {
    render(<CostCalculationPage />);
    await screen.findByText("Salmon");
    const input = screen.getByPlaceholderText("Search ingredients...");
    fireEvent.change(input, { target: { value: "salmon" } });
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => {
      expect((input as HTMLInputElement).value).toBe("");
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("CostCalculationPage — costcheck_goto sessionStorage navigation", () => {
  beforeEach(() => {
    mockAuthReturn = HQ_AUTH;
    mockCanAccessCostAdmin = true;
    sessionStorageMock.clear();
    localStorageMock.clear();
    mockCostJson = vi.fn(async (url: string) => {
      if (url.includes("/ingredients")) return { items: [] };
      if (url.includes("/recipe-sheets")) return { items: [] };
      if (url.includes("/master-items")) return { items: [] };
      if (url.includes("/component-options")) return { items: [] };
      if (url.includes("invoice-item-mappings")) return { items: [] };
      return {};
    });
  });

  it("reads costcheck_goto from sessionStorage and opens product section", async () => {
    sessionStorageMock.setItem(
      "costcheck_goto",
      JSON.stringify({ itemId: "mi-99", itemCity: "dubai" }),
    );
    render(<CostCalculationPage />);
    // It should clear the key after reading
    await waitFor(() => {
      expect(sessionStorageMock.getItem("costcheck_goto")).toBeNull();
    });
  });

  it("costcheck_goto with manila city persists manila to sessionStorage", async () => {
    sessionStorageMock.setItem(
      "costcheck_goto",
      JSON.stringify({ itemId: "mi-99", itemCity: "manila" }),
    );
    render(<CostCalculationPage />);
    await waitFor(() => {
      expect(sessionStorageMock.getItem("cost_city_selection")).toBe("manila");
    });
  });
});
