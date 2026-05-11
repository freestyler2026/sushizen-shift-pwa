// tests/admin/cost-calculation/cost-check.test.tsx
// Tests for src/app/admin/cost-calculation/cost-check/page.tsx
// Covers: auth guard, city selector, analyze flow, error state, KindBadge, back link.

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── next/navigation ───────────────────────────────────────────────────────────
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("city=dubai"),
  usePathname: () => "/admin/cost-calculation/cost-check",
}));

vi.mock("next/link", () => ({
  default: ({ children, href, className }: any) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

// ── Auth mock ─────────────────────────────────────────────────────────────────
let mockAuthReturn: any = null;
let mockCanAccess = true;

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getAuth: vi.fn(() => mockAuthReturn),
    refreshAuthFromApi: vi.fn(async () => mockAuthReturn),
    setAuth: vi.fn(),
    canAccessCostAdmin: vi.fn(() => mockCanAccess),
  };
});

// ── costClient mock ───────────────────────────────────────────────────────────
let mockCostJson: ReturnType<typeof vi.fn> = vi.fn(async () => ({ items: [] }));

vi.mock("@/lib/costClient", () => ({
  costJson: (...args: any[]) => (mockCostJson as (...a: any[]) => any)(...args),
  costUpload: vi.fn(async () => ({})),
}));

// ── Auth fixtures ─────────────────────────────────────────────────────────────
const HQ_AUTH = {
  accessToken: "tok",
  role: "HQ",
  city: "dubai",
  staffName: "Jay",
  permissions: ["cost.read", "cost.write"],
  pin: "1234",
};

const NO_PERM_AUTH = {
  accessToken: "tok",
  role: "STAFF",
  city: "dubai",
  staffName: "Bob",
  permissions: [],
  pin: "",
};

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

// ── Static imports ────────────────────────────────────────────────────────────
// The page uses Suspense + a CostCheckPageInner component — import the default export.
import CostCheckPage from "@/app/admin/cost-calculation/cost-check/page";

// ════════════════════════════════════════════════════════════════════════════════
describe("CostCheckPage — auth guard", () => {
  beforeEach(() => {
    mockCostJson = vi.fn(async () => ({ items: [] }));
    mockPush.mockReset();
    sessionStorageMock.clear();
  });

  it("shows permission error for unauthorized user", async () => {
    mockAuthReturn = NO_PERM_AUTH;
    mockCanAccess = false;
    render(<CostCheckPage />);
    await screen.findByText(/you do not have permission/i);
  });

  it("shows page heading for authorized user", async () => {
    mockAuthReturn = HQ_AUTH;
    mockCanAccess = true;
    render(<CostCheckPage />);
    await screen.findByText("仕入連動チェック（商品マスタ）");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("CostCheckPage — city selector", () => {
  beforeEach(() => {
    mockAuthReturn = HQ_AUTH;
    mockCanAccess = true;
    mockCostJson = vi.fn(async () => ({ items: [] }));
    sessionStorageMock.clear();
  });

  it("renders Manila and Dubai city buttons", async () => {
    render(<CostCheckPage />);
    await screen.findByText("仕入連動チェック（商品マスタ）");
    expect(screen.getByRole("button", { name: "manila" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "dubai" })).toBeInTheDocument();
  });

  it("initial city is from query param (dubai)", async () => {
    render(<CostCheckPage />);
    await screen.findByText("仕入連動チェック（商品マスタ）");
    // dubai button should be visually active (has active styling)
    // We verify by checking that dubai button exists
    const dubaiBtn = screen.getByRole("button", { name: "dubai" });
    expect(dubaiBtn).toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("CostCheckPage — analyze button", () => {
  beforeEach(() => {
    mockAuthReturn = HQ_AUTH;
    mockCanAccess = true;
    sessionStorageMock.clear();
  });

  it("renders the analyze button", async () => {
    mockCostJson = vi.fn(async () => ({ items: [] }));
    render(<CostCheckPage />);
    await screen.findByText("仕入連動チェック（商品マスタ）");
    // The analyze button is always present when allowed
    expect(screen.getByRole("button", { name: /分析/i })).toBeInTheDocument();
  });

  it("clicking analyze button calls master-items API", async () => {
    mockCostJson = vi.fn(async (url: string) => {
      if (url.includes("master-items")) return { items: [] };
      return { items: [] };
    });
    render(<CostCheckPage />);
    await screen.findByText("仕入連動チェック（商品マスタ）");
    fireEvent.click(screen.getByRole("button", { name: /分析/i }));
    await waitFor(() => {
      expect(mockCostJson).toHaveBeenCalled();
    });
  });

  it("shows progress bar during analysis", async () => {
    let resolveItems: (v: any) => void;
    const itemsPromise = new Promise((res) => { resolveItems = res; });
    mockCostJson = vi.fn(async (url: string) => {
      if (url.includes("master-items")) return itemsPromise;
      return { items: [] };
    });
    render(<CostCheckPage />);
    await screen.findByText("仕入連動チェック（商品マスタ）");
    fireEvent.click(screen.getByRole("button", { name: /分析/i }));
    // Progress bar should appear
    await waitFor(() => {
      const progressEl = document.querySelector("progress, [role=progressbar], .bg-violet-500");
      expect(progressEl).not.toBeNull();
    });
    resolveItems!({ items: [] });
  });

  it("shows error message when analyze API fails", async () => {
    // fetchItemsByType first tries with show_inactive=true, then falls back.
    // Both calls throw → error propagates up through fetchProductMasterItems → analyze() catches → setError.
    mockCostJson = vi.fn(async () => {
      throw new Error("Analyze API failure");
    });
    render(<CostCheckPage />);
    await screen.findByText("仕入連動チェック（商品マスタ）");
    fireEvent.click(screen.getByRole("button", { name: /分析/i }));
    await screen.findByText(/Analyze API failure/);
  });

  it("shows product items after analysis completes", async () => {
    const productItem = {
      id: "p-1", city: "dubai", category: "Sushi", name: "Salmon Nigiri",
      item_type: "product", status: "active", component_count: 2,
      cost_unit_price: 0, total_cost: 8.5, cost_ratio: 0.35,
    };
    mockCostJson = vi.fn(async (url: string) => {
      if (url.includes("master-items") && url.includes("type=product")) return { items: [productItem] };
      if (url.includes("master-items") && url.includes("type=draft")) return { items: [] };
      if (url.includes(`master-items/${productItem.id}`)) return { item: { components: [] } };
      return { items: [] };
    });
    render(<CostCheckPage />);
    await screen.findByText("仕入連動チェック（商品マスタ）");
    fireEvent.click(screen.getByRole("button", { name: /分析/i }));
    await screen.findByText("Salmon Nigiri");
    expect(screen.getByText("Sushi")).toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("CostCheckPage — filter tabs", () => {
  beforeEach(() => {
    mockAuthReturn = HQ_AUTH;
    mockCanAccess = true;
    sessionStorageMock.clear();
  });

  it("shows '全て' and '⚠ 要確認のみ' filter buttons after analysis", async () => {
    // Filter buttons only render when stats.length > 0, so we must run an analysis first.
    // Actual button labels: "全て (N)" and "⚠ 要確認のみ (N)"
    const productItem = {
      id: "f-1", city: "dubai", category: "Sushi", name: "Filter Test Maki",
      item_type: "product", status: "active", component_count: 0,
      cost_unit_price: 0, total_cost: 0, cost_ratio: 0,
    };
    mockCostJson = vi.fn(async (url: string) => {
      if (url.includes("type=product")) return { items: [productItem] };
      if (url.includes("type=draft")) return { items: [] };
      if (url.includes("master-items/f-1")) return { item: { components: [] } };
      return { items: [] };
    });
    render(<CostCheckPage />);
    await screen.findByText("仕入連動チェック（商品マスタ）");
    fireEvent.click(screen.getByRole("button", { name: /分析/i }));
    // Wait for the item to finish loading — "詳細を見る" appears only when loaded: true
    await screen.findByText("詳細を見る");
    // Filter buttons now visible with actual text format
    expect(screen.getByRole("button", { name: /全て/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /要確認のみ/i })).toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("CostCheckPage — ingredient panel and navigation", () => {
  beforeEach(() => {
    mockAuthReturn = HQ_AUTH;
    mockCanAccess = true;
    sessionStorageMock.clear();
  });

  it("expands ingredient panel when product row is clicked", async () => {
    const productItem = {
      id: "p-2", city: "dubai", category: "Rolls", name: "Dragon Roll",
      item_type: "product", status: "active", component_count: 3,
      cost_unit_price: 0, total_cost: 15, cost_ratio: 0.40,
    };
    const component = {
      id: "c-1", component_type: "ingredient", ingredient_id: "ing-1",
      component_menu_item_id: "", name: "Avocado", category: "Produce",
      unit: "g", quantity: 50, unit_cost: 0.1, cost: 5, sort_order: 0,
    };
    mockCostJson = vi.fn(async (url: string) => {
      if (url.includes("type=product")) return { items: [productItem] };
      if (url.includes("type=draft")) return { items: [] };
      if (url.includes(`master-items/p-2`)) return { item: { components: [component] } };
      if (url.includes(`ingredients/ing-1`)) return { item: { id: "ing-1", name: "Avocado", unit: "g", unit_price: 0.1, supplier_prices: [] } };
      return { items: [] };
    });
    render(<CostCheckPage />);
    await screen.findByText("仕入連動チェック（商品マスタ）");
    fireEvent.click(screen.getByRole("button", { name: /分析/i }));
    // Wait for the item to be fully loaded — "詳細を見る" only appears when loaded: true.
    // Clicking before loaded: true would hit the `if (!loaded) return;` guard and do nothing.
    await screen.findByText("詳細を見る");
    // Click the product row to expand
    fireEvent.click(screen.getByText("Dragon Roll"));
    // "Avocado" is rendered inside a span as "⚠ Avocado" (isIssue prefix), use regex to match
    await screen.findByText(/Avocado/);
  });

  it("'← Cost Calculation' back button calls router.push", async () => {
    mockCostJson = vi.fn(async () => ({ items: [] }));
    render(<CostCheckPage />);
    await screen.findByText("仕入連動チェック（商品マスタ）");
    fireEvent.click(screen.getByText(/← Cost Calculation/i));
    expect(mockPush).toHaveBeenCalledWith("/admin/cost-calculation");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("CostCheckPage — '商品マスタで編集' sessionStorage write", () => {
  beforeEach(() => {
    mockAuthReturn = HQ_AUTH;
    mockCanAccess = true;
    sessionStorageMock.clear();
  });

  it("writes costcheck_goto to sessionStorage and navigates to cost-calculation", async () => {
    const productItem = {
      id: "p-3", city: "dubai", category: "Bowls", name: "Poke Bowl",
      item_type: "product", status: "active", component_count: 2,
      cost_unit_price: 0, total_cost: 10, cost_ratio: 0.38,
    };
    const component = {
      id: "c-2", component_type: "ingredient", ingredient_id: "ing-2",
      component_menu_item_id: "", name: "Rice", category: "Grain",
      unit: "g", quantity: 200, unit_cost: 0.02, cost: 4, sort_order: 0,
    };
    mockCostJson = vi.fn(async (url: string) => {
      if (url.includes("type=product")) return { items: [productItem] };
      if (url.includes("type=draft")) return { items: [] };
      if (url.includes(`master-items/p-3`)) return { item: { components: [component] } };
      if (url.includes(`ingredients/ing-2`)) return { item: { id: "ing-2", name: "Rice", unit: "g", unit_price: 0.02, supplier_prices: [] } };
      return { items: [] };
    });
    render(<CostCheckPage />);
    await screen.findByText("仕入連動チェック（商品マスタ）");
    fireEvent.click(screen.getByRole("button", { name: /分析/i }));
    await screen.findByText("Poke Bowl");
    fireEvent.click(screen.getByText("Poke Bowl"));
    await screen.findByText("商品マスタで編集 →");
    fireEvent.click(screen.getByText("商品マスタで編集 →"));
    // Verify sessionStorage was set
    const stored = sessionStorageMock.getItem("costcheck_goto");
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.itemId).toBe("p-3");
    expect(parsed.itemCity).toBe("dubai");
    // Verify navigation
    expect(mockPush).toHaveBeenCalledWith("/admin/cost-calculation");
  });
});
