// tests/admin/price-check/price-check-page.test.tsx
// Comprehensive tests for src/app/admin/price-check/page.tsx
// Covers: auth guard, page structure, TAFT/PAR/DUBAI tabs, KPIs,
//         Run Check, Reset Baseline, Manual Entry, Confirm Item, Dubai confirmation.

import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Hoisted mocks (needed in vi.mock factories before any imports) ─────────────
const { mockRouter } = vi.hoisted(() => ({
  mockRouter: { push: vi.fn(), replace: vi.fn(), back: vi.fn() },
}));

// ── next/navigation ────────────────────────────────────────────────────────────
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/price-check",
  useParams: () => ({}),
}));

// ── framer-motion ──────────────────────────────────────────────────────────────
vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      children,
      className,
    }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement("div", { className }, children),
  },
}));

// ── lucide-react ───────────────────────────────────────────────────────────────
vi.mock("lucide-react", () => ({
  AlertTriangle: () => null,
  Building2: () => null,
  CheckCircle2: () => null,
  Clock: () => null,
  PencilLine: () => null,
  RefreshCw: () => null,
  ShieldCheck: () => null,
  Tag: () => null,
  TrendingDown: () => null,
  TrendingUp: () => null,
  Zap: () => null,
}));

// ── Auth ───────────────────────────────────────────────────────────────────────
const BASE_AUTH = {
  staffName: "Jay Test",
  city: "manila" as const,
  role: "HQ",
  accessToken: "tok-test",
  permissions: ["*"],
};

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getAuth: vi.fn(() => BASE_AUTH),
    refreshAuthFromApi: vi.fn(async () => ({ ...BASE_AUTH })),
  };
});

// ── Badge events ───────────────────────────────────────────────────────────────
vi.mock("@/lib/badgeEvents", () => ({
  dispatchBadgeRefresh: vi.fn(),
  BADGE_EVENTS: {
    priceCheck: "sushizen:price-check:badge:refresh",
  },
}));

// ── Page import ────────────────────────────────────────────────────────────────
import PriceCheckPage from "@/app/admin/price-check/page";

// ══════════════════════════════════════════════════════════════════════════════
// Types & Fixtures
// ══════════════════════════════════════════════════════════════════════════════

type PriceCheckResult = {
  id: number;
  store_code: string;
  product_id: string;
  product_name: string;
  category: string;
  baseline_price: number | null;
  current_price: number | null;
  discount_rate: number | null;
  status: "ok" | "changed" | "confirmed" | "pending_manual";
  confirmed_by: string | null;
  confirmed_at: string | null;
  memo: string;
  last_seen: string | null;
  checked_at: string;
  source: string;
};

const RESULT_CHANGED: PriceCheckResult = {
  id: 1,
  store_code: "TAFT",
  product_id: "P001",
  product_name: "Salmon Bowl",
  category: "Main",
  baseline_price: 350,
  current_price: 380,
  discount_rate: 0.0857,
  status: "changed",
  confirmed_by: null,
  confirmed_at: null,
  memo: "",
  last_seen: null,
  checked_at: "2026-05-10T08:00:00Z",
  source: "storehub",
};

const RESULT_OK: PriceCheckResult = {
  id: 2,
  store_code: "TAFT",
  product_id: "P002",
  product_name: "Tuna Roll",
  category: "Roll",
  baseline_price: 200,
  current_price: 200,
  discount_rate: 0,
  status: "ok",
  confirmed_by: null,
  confirmed_at: null,
  memo: "",
  last_seen: null,
  checked_at: "2026-05-10T08:00:00Z",
  source: "storehub",
};

const RESULT_CONFIRMED: PriceCheckResult = {
  id: 3,
  store_code: "TAFT",
  product_id: "P003",
  product_name: "Ebi Tempura",
  category: "Tempura",
  baseline_price: 280,
  current_price: 290,
  discount_rate: 0.036,
  status: "confirmed",
  confirmed_by: "Jay Test",
  confirmed_at: "2026-05-10T09:00:00Z",
  memo: "Approved price change",
  last_seen: null,
  checked_at: "2026-05-10T08:00:00Z",
  source: "storehub",
};

const DUBAI_STATUS_EMPTY = {
  check_date: "2026-05-11",
  discount_rate: 0.5,
  items: [],
  confirmation: {
    discount_rate_ok: false,
    menu_ok: false,
    confirmed_by: null,
    confirmed_at: null,
    memo: "",
  },
  baselines: [],
  summary: { total_items: 0, within_5pct: 0, outside_5pct: 0, no_baseline: 0 },
};

// ── Fetch factory ──────────────────────────────────────────────────────────────
type MockOverride = {
  match?: string | RegExp;
  method?: string;
  status?: number;
  body?: unknown;
};

function makeFetch(overrides: MockOverride[] = []) {
  return vi.fn(async (url: string, opts?: RequestInit) => {
    const method = ((opts?.method as string) || "GET").toUpperCase();
    const u = String(url);

    for (const ov of overrides) {
      if (ov.match) {
        const hit =
          typeof ov.match === "string" ? u.includes(ov.match) : ov.match.test(u);
        if (!hit) continue;
      }
      if (ov.method && ov.method.toUpperCase() !== method) continue;
      const status = ov.status ?? 200;
      const body =
        ov.body !== undefined
          ? typeof ov.body === "string"
            ? ov.body
            : JSON.stringify(ov.body)
          : "{}";
      return new Response(body, {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Default responses
    if (u.includes("/api/admin/price-check/dubai/status")) {
      return new Response(JSON.stringify(DUBAI_STATUS_EMPTY), { status: 200 });
    }
    if (u.includes("/api/admin/price-check/dubai/confirm") && method === "POST") {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (u.includes("/api/admin/price-check/status")) {
      return new Response(
        JSON.stringify({ results: [], last_run: null, flagged_count: 0 }),
        { status: 200 }
      );
    }
    if (u.includes("/api/admin/price-check/run") && method === "POST") {
      return new Response(
        JSON.stringify({ items_checked: 5, items_flagged: 0 }),
        { status: 200 }
      );
    }
    if (u.includes("/api/admin/price-check/init-baseline") && method === "POST") {
      return new Response(
        JSON.stringify({ products_snapshotted: 10 }),
        { status: 200 }
      );
    }
    if (u.includes("/api/admin/price-check/confirm") && method === "POST") {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (u.includes("/api/admin/price-check/manual-entry") && method === "POST") {
      return new Response(
        JSON.stringify({ status: "ok", baseline_price: 350, current_price: 350 }),
        { status: 200 }
      );
    }
    return new Response("{}", { status: 200 });
  });
}

// ── Auth helper ────────────────────────────────────────────────────────────────
async function setupAuth(override?: Partial<typeof BASE_AUTH>) {
  const { getAuth, refreshAuthFromApi } = await import("@/lib/auth");
  const merged = { ...BASE_AUTH, ...override };
  vi.mocked(getAuth).mockReturnValue(merged as any);
  vi.mocked(refreshAuthFromApi).mockResolvedValue(merged as any);
}

// ══════════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════════

describe("PriceCheckPage", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.test";
    mockRouter.replace.mockReset();
    mockRouter.push.mockReset();
    mockRouter.back.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // ── Render helpers ───────────────────────────────────────────────────────────
  async function renderPage(fetchMock = makeFetch()) {
    await setupAuth();
    vi.stubGlobal("fetch", fetchMock);
    render(<PriceCheckPage />);
  }

  /** Wait for the page title "Price Check" to appear — proves initial render */
  async function renderAndLoad(fetchMock = makeFetch()) {
    await renderPage(fetchMock);
    await screen.findByText("Price Check", {}, { timeout: 5000 });
  }

  // ── Auth guard ───────────────────────────────────────────────────────────────
  describe("auth guard", () => {
    it("redirects to /login when auth is null", async () => {
      const { getAuth } = await import("@/lib/auth");
      vi.mocked(getAuth).mockReturnValue(null as any);
      vi.stubGlobal("fetch", makeFetch());
      render(<PriceCheckPage />);
      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith(
          expect.stringContaining("/login")
        );
      });
    });

    it("redirects to /login when accessToken is missing", async () => {
      await setupAuth({ accessToken: undefined } as any);
      vi.stubGlobal("fetch", makeFetch());
      render(<PriceCheckPage />);
      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith(
          expect.stringContaining("/login")
        );
      });
    });

    it("redirects to /admin when role is STAFF (not in allowed list)", async () => {
      await setupAuth({ role: "STAFF" });
      vi.stubGlobal("fetch", makeFetch());
      render(<PriceCheckPage />);
      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith("/admin");
      });
    });

    it("redirects to /admin when role is MANAGER (not in allowed list)", async () => {
      await setupAuth({ role: "MANAGER" });
      vi.stubGlobal("fetch", makeFetch());
      render(<PriceCheckPage />);
      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith("/admin");
      });
    });

    it("does NOT redirect when role is HQ", async () => {
      await renderPage();
      await screen.findByText("Price Check");
      expect(mockRouter.replace).not.toHaveBeenCalled();
    });

    it("does NOT redirect when role is ADMIN", async () => {
      await setupAuth({ role: "ADMIN" });
      vi.stubGlobal("fetch", makeFetch());
      render(<PriceCheckPage />);
      await screen.findByText("Price Check");
      expect(mockRouter.replace).not.toHaveBeenCalled();
    });

    it("does NOT redirect when role is MANILA_MANAGEMENT", async () => {
      await setupAuth({ role: "MANILA_MANAGEMENT" });
      vi.stubGlobal("fetch", makeFetch());
      render(<PriceCheckPage />);
      await screen.findByText("Price Check");
      expect(mockRouter.replace).not.toHaveBeenCalled();
    });
  });

  // ── Page structure ────────────────────────────────────────────────────────────
  describe("page structure", () => {
    it("renders page title 'Price Check'", async () => {
      await renderPage();
      expect(screen.getByText("Price Check")).toBeInTheDocument();
    });

    it("renders subtitle about monitoring selling prices", async () => {
      await renderPage();
      expect(screen.getByText(/Monitor selling prices/i)).toBeInTheDocument();
    });

    it("renders three tab buttons: Taft, Parañaque, Dubai", async () => {
      await renderPage();
      expect(screen.getByRole("button", { name: /Taft/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Parañaque/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Dubai/i })).toBeInTheDocument();
    });

    it("TAFT tab is active by default — KPI strip is visible", async () => {
      await renderAndLoad();
      await waitFor(() => {
        expect(screen.getByText("Flagged")).toBeInTheDocument();
      });
    });
  });

  // ── KPI strip (Manila tabs) ───────────────────────────────────────────────────
  describe("KPI strip (TAFT / PAR tabs)", () => {
    it("shows Flagged label", async () => {
      await renderAndLoad();
      expect(screen.getByText("Flagged")).toBeInTheDocument();
    });

    it("shows Confirmed label", async () => {
      await renderAndLoad();
      expect(screen.getByText("Confirmed")).toBeInTheDocument();
    });

    it("shows Monitored Items label", async () => {
      await renderAndLoad();
      expect(screen.getByText("Monitored Items")).toBeInTheDocument();
    });

    it("shows Last Check label", async () => {
      await renderAndLoad();
      expect(screen.getByText("Last Check")).toBeInTheDocument();
    });

    it("shows 'Never run' when last_run is null", async () => {
      await renderAndLoad();
      await waitFor(() => {
        expect(screen.getByText("Never run")).toBeInTheDocument();
      });
    });

    it("shows 'All OK' badge when flaggedCount = 0", async () => {
      await renderAndLoad();
      await waitFor(() => {
        expect(screen.getByText("All OK")).toBeInTheDocument();
      });
    });

    it("shows '1 change detected' badge when flaggedCount = 1", async () => {
      const fetchMock = makeFetch([
        {
          match: "/api/admin/price-check/status",
          method: "GET",
          body: { results: [RESULT_CHANGED], last_run: null, flagged_count: 1 },
        },
      ]);
      await renderAndLoad(fetchMock);
      await waitFor(() => {
        expect(screen.getByText(/1 change detected/i)).toBeInTheDocument();
      });
    });

    it("uses plural 'changes' when flaggedCount > 1", async () => {
      const fetchMock = makeFetch([
        {
          match: "/api/admin/price-check/status",
          method: "GET",
          body: {
            results: [RESULT_CHANGED, { ...RESULT_CHANGED, id: 99, product_id: "P099" }],
            last_run: null,
            flagged_count: 2,
          },
        },
      ]);
      await renderAndLoad(fetchMock);
      await waitFor(() => {
        expect(screen.getByText(/2 changes detected/i)).toBeInTheDocument();
      });
    });
  });

  // ── Controls panel (TAFT) ─────────────────────────────────────────────────────
  describe("controls panel — TAFT tab", () => {
    it("shows 'Taft — Controls' heading", async () => {
      await renderAndLoad();
      expect(screen.getByText(/Taft.*Controls/)).toBeInTheDocument();
    });

    it("shows 'Run Check Now' button", async () => {
      await renderAndLoad();
      expect(
        screen.getAllByRole("button", { name: /Run Check Now/i }).length
      ).toBeGreaterThanOrEqual(1);
    });

    it("shows 'Reset Baseline to Current Prices' button", async () => {
      await renderAndLoad();
      expect(
        screen.getByRole("button", { name: /Reset Baseline/i })
      ).toBeInTheDocument();
    });

    it("shows 'Refresh' button", async () => {
      await renderAndLoad();
      expect(
        screen.getByRole("button", { name: /Refresh/i })
      ).toBeInTheDocument();
    });

    it("shows auto-check note", async () => {
      await renderAndLoad();
      expect(screen.getByText(/Auto-check runs every 3 hours/i)).toBeInTheDocument();
    });
  });

  // ── Run Check ─────────────────────────────────────────────────────────────────
  describe("Run Check Now", () => {
    it("calls POST /api/admin/price-check/run on click", async () => {
      const fetchMock = makeFetch();
      await renderAndLoad(fetchMock);

      // Use the first "Run Check Now" button (controls panel)
      fireEvent.click(screen.getAllByRole("button", { name: /Run Check Now/i })[0]);

      await waitFor(() => {
        const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls;
        const runCall = calls.find(
          (args: unknown[]) =>
            String(args[0]).includes("/price-check/run") &&
            String((args[1] as RequestInit)?.method).toUpperCase() === "POST"
        );
        expect(runCall).toBeTruthy();
      });
    });

    it("sends store_code TAFT in request body", async () => {
      const fetchMock = makeFetch();
      await renderAndLoad(fetchMock);

      fireEvent.click(screen.getAllByRole("button", { name: /Run Check Now/i })[0]);

      await waitFor(() => {
        const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls;
        const runCall = calls.find((args: unknown[]) =>
          String(args[0]).includes("/price-check/run")
        );
        expect(runCall).toBeTruthy();
        const body = JSON.parse((runCall![1] as RequestInit).body as string);
        expect(body.store_code).toBe("TAFT");
      });
    });

    it("shows success message with item counts after run", async () => {
      const fetchMock = makeFetch([
        {
          match: "/price-check/run",
          method: "POST",
          body: { items_checked: 5, items_flagged: 2 },
        },
      ]);
      await renderAndLoad(fetchMock);
      fireEvent.click(screen.getAllByRole("button", { name: /Run Check Now/i })[0]);

      await waitFor(() => {
        expect(screen.getByText(/5.*items? checked.*2 flagged|Check complete/i)).toBeInTheDocument();
      });
    });

    it("dispatches 'priceCheck' badge refresh after run", async () => {
      const { dispatchBadgeRefresh } = await import("@/lib/badgeEvents");
      vi.mocked(dispatchBadgeRefresh).mockClear();

      await renderAndLoad();
      fireEvent.click(screen.getAllByRole("button", { name: /Run Check Now/i })[0]);

      await waitFor(() => {
        expect(vi.mocked(dispatchBadgeRefresh)).toHaveBeenCalledWith("priceCheck");
      });
    });

    it("shows error message on run failure", async () => {
      const fetchMock = makeFetch([
        {
          match: "/price-check/run",
          method: "POST",
          status: 500,
          body: "Check service unavailable",
        },
      ]);
      await renderAndLoad(fetchMock);
      fireEvent.click(screen.getAllByRole("button", { name: /Run Check Now/i })[0]);

      await waitFor(() => {
        expect(screen.getByText(/Check service unavailable/i)).toBeInTheDocument();
      });
    });
  });

  // ── Reset Baseline ────────────────────────────────────────────────────────────
  describe("Reset Baseline to Current Prices", () => {
    it("calls window.confirm before issuing API request", async () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      await renderAndLoad();
      fireEvent.click(screen.getByRole("button", { name: /Reset Baseline/i }));
      expect(confirmSpy).toHaveBeenCalledTimes(1);
      confirmSpy.mockRestore();
    });

    it("does NOT call /init-baseline if user cancels the confirm dialog", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(false);
      const fetchMock = makeFetch();
      await renderAndLoad(fetchMock);

      const before = (fetchMock as ReturnType<typeof vi.fn>).mock.calls.length;
      fireEvent.click(screen.getByRole("button", { name: /Reset Baseline/i }));
      await new Promise((r) => setTimeout(r, 100));

      expect((fetchMock as ReturnType<typeof vi.fn>).mock.calls.length).toBe(before);
      vi.restoreAllMocks();
    });

    it("calls POST /api/admin/price-check/init-baseline when user confirms", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const fetchMock = makeFetch();
      await renderAndLoad(fetchMock);
      fireEvent.click(screen.getByRole("button", { name: /Reset Baseline/i }));

      await waitFor(() => {
        const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls;
        const call = calls.find(
          (args: unknown[]) =>
            String(args[0]).includes("/init-baseline") &&
            String((args[1] as RequestInit)?.method).toUpperCase() === "POST"
        );
        expect(call).toBeTruthy();
      });
      vi.restoreAllMocks();
    });

    it("shows success message with snapshot count after baseline reset", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const fetchMock = makeFetch([
        {
          match: "/init-baseline",
          method: "POST",
          body: { products_snapshotted: 10 },
        },
      ]);
      await renderAndLoad(fetchMock);
      fireEvent.click(screen.getByRole("button", { name: /Reset Baseline/i }));

      await waitFor(() => {
        expect(screen.getByText(/10 product.*snapshotted|Baseline updated/i)).toBeInTheDocument();
      });
      vi.restoreAllMocks();
    });

    it("shows error message when init-baseline API fails", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const fetchMock = makeFetch([
        {
          match: "/init-baseline",
          method: "POST",
          status: 500,
          body: "Baseline update failed",
        },
      ]);
      await renderAndLoad(fetchMock);
      fireEvent.click(screen.getByRole("button", { name: /Reset Baseline/i }));

      await waitFor(() => {
        expect(screen.getByText(/Baseline update failed/i)).toBeInTheDocument();
      });
      vi.restoreAllMocks();
    });
  });

  // ── Refresh ───────────────────────────────────────────────────────────────────
  describe("Refresh button", () => {
    it("clicking Refresh triggers another loadStatus call", async () => {
      const fetchMock = makeFetch();
      await renderAndLoad(fetchMock);
      const before = (fetchMock as ReturnType<typeof vi.fn>).mock.calls.length;

      fireEvent.click(screen.getByRole("button", { name: /Refresh/i }));

      await waitFor(() => {
        expect((fetchMock as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(before);
      });
    });
  });

  // ── PAR tab (Parañaque — manual entry) ──────────────────────────────────────
  describe("PAR tab — Parañaque (manual entry)", () => {
    async function switchToPAR(fetchMock = makeFetch()) {
      await renderPage(fetchMock);
      fireEvent.click(screen.getByRole("button", { name: /Parañaque/i }));
      await screen.findByText("Manual Price Entry", {}, { timeout: 5000 });
    }

    it("shows 'Manual Price Entry' section heading after switching to PAR", async () => {
      await switchToPAR();
      expect(screen.getByText("Manual Price Entry")).toBeInTheDocument();
    });

    it("hides 'Run Check Now' button on PAR tab", async () => {
      await switchToPAR();
      // "Run Check Now" should not appear (PAR does not have StoreHub connection)
      expect(screen.queryByRole("button", { name: /Run Check Now/i })).not.toBeInTheDocument();
    });

    it("hides 'Reset Baseline' button on PAR tab", async () => {
      await switchToPAR();
      expect(screen.queryByRole("button", { name: /Reset Baseline/i })).not.toBeInTheDocument();
    });

    it("shows note that Parañaque is not connected to StoreHub", async () => {
      await switchToPAR();
      expect(screen.getByText(/Parañaque is not connected to StoreHub/i)).toBeInTheDocument();
    });

    it("shows 'Parañaque — Controls' heading", async () => {
      await switchToPAR();
      expect(screen.getByText(/Parañaque.*Controls/)).toBeInTheDocument();
    });

    it("shows Product ID required label", async () => {
      await switchToPAR();
      expect(screen.getByText(/Product ID \*/)).toBeInTheDocument();
    });

    it("shows Current Selling Price label", async () => {
      await switchToPAR();
      // "current selling price" also appears in the subtitle paragraph, so use getAllByText
      expect(screen.getAllByText(/Current Selling Price/i).length).toBeGreaterThanOrEqual(1);
    });

    it("shows Product Name label", async () => {
      await switchToPAR();
      expect(screen.getByText("Product Name")).toBeInTheDocument();
    });

    it("shows 'Save & Check Price' submit button", async () => {
      await switchToPAR();
      expect(
        screen.getByRole("button", { name: /Save & Check Price/i })
      ).toBeInTheDocument();
    });

    it("shows error 'Product ID is required' when submitted with empty product ID", async () => {
      await switchToPAR();
      fireEvent.click(screen.getByRole("button", { name: /Save & Check Price/i }));
      await waitFor(() => {
        expect(screen.getByText(/Product ID is required/i)).toBeInTheDocument();
      });
    });

    it("shows error 'valid price' when price is negative", async () => {
      await switchToPAR();
      fireEvent.change(screen.getByPlaceholderText(/e\.g\. PROD-001/i), {
        target: { value: "P001" },
      });
      fireEvent.change(screen.getByPlaceholderText(/e\.g\. 350\.00/i), {
        target: { value: "-50" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Save & Check Price/i }));
      await waitFor(() => {
        expect(screen.getByText(/valid price/i)).toBeInTheDocument();
      });
    });

    it("shows error 'valid price' when price is zero", async () => {
      await switchToPAR();
      fireEvent.change(screen.getByPlaceholderText(/e\.g\. PROD-001/i), {
        target: { value: "P001" },
      });
      fireEvent.change(screen.getByPlaceholderText(/e\.g\. 350\.00/i), {
        target: { value: "0" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Save & Check Price/i }));
      await waitFor(() => {
        expect(screen.getByText(/valid price/i)).toBeInTheDocument();
      });
    });

    it("calls POST /api/admin/price-check/manual-entry with correct payload", async () => {
      const fetchMock = makeFetch();
      await switchToPAR(fetchMock);

      fireEvent.change(screen.getByPlaceholderText(/e\.g\. PROD-001/i), {
        target: { value: "P001" },
      });
      fireEvent.change(screen.getByPlaceholderText(/e\.g\. Salmon Bowl/i), {
        target: { value: "Salmon Bowl" },
      });
      fireEvent.change(screen.getByPlaceholderText(/e\.g\. 350\.00/i), {
        target: { value: "350" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Save & Check Price/i }));

      await waitFor(() => {
        const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls;
        const manualCall = calls.find(
          (args: unknown[]) =>
            String(args[0]).includes("/manual-entry") &&
            String((args[1] as RequestInit)?.method).toUpperCase() === "POST"
        );
        expect(manualCall).toBeTruthy();
        const body = JSON.parse((manualCall![1] as RequestInit).body as string);
        expect(body.product_id).toBe("P001");
        expect(body.product_name).toBe("Salmon Bowl");
        expect(body.current_price).toBe(350);
        expect(body.store_code).toBe("PAR");
      });
    });

    it("shows 'no price change' success message when status=ok", async () => {
      const fetchMock = makeFetch([
        {
          match: "/manual-entry",
          method: "POST",
          body: { status: "ok", baseline_price: 350, current_price: 350 },
        },
      ]);
      await switchToPAR(fetchMock);

      fireEvent.change(screen.getByPlaceholderText(/e\.g\. PROD-001/i), {
        target: { value: "P001" },
      });
      fireEvent.change(screen.getByPlaceholderText(/e\.g\. 350\.00/i), {
        target: { value: "350" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Save & Check Price/i }));

      await waitFor(() => {
        expect(screen.getByText(/saved.*no price change|P001.*saved/i)).toBeInTheDocument();
      });
    });

    it("shows 'Price change detected' message when status=changed", async () => {
      const fetchMock = makeFetch([
        {
          match: "/manual-entry",
          method: "POST",
          body: { status: "changed", baseline_price: 350, current_price: 380 },
        },
      ]);
      await switchToPAR(fetchMock);

      fireEvent.change(screen.getByPlaceholderText(/e\.g\. PROD-001/i), {
        target: { value: "P001" },
      });
      fireEvent.change(screen.getByPlaceholderText(/e\.g\. 350\.00/i), {
        target: { value: "380" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Save & Check Price/i }));

      await waitFor(() => {
        expect(screen.getByText(/Price change detected/i)).toBeInTheDocument();
      });
    });

    it("clears form fields after successful submission", async () => {
      await switchToPAR();

      const productInput = screen.getByPlaceholderText(
        /e\.g\. PROD-001/i
      ) as HTMLInputElement;
      fireEvent.change(productInput, { target: { value: "P001" } });
      fireEvent.change(screen.getByPlaceholderText(/e\.g\. 350\.00/i), {
        target: { value: "350" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Save & Check Price/i }));

      await waitFor(() => {
        expect(productInput.value).toBe("");
      });
    });

    it("shows 'No prices recorded yet' empty state on PAR", async () => {
      await switchToPAR();
      expect(screen.getByText(/No prices recorded yet/i)).toBeInTheDocument();
    });
  });

  // ── DUBAI tab ─────────────────────────────────────────────────────────────────
  describe("DUBAI tab", () => {
    async function switchToDubai(fetchMock = makeFetch()) {
      await renderPage(fetchMock);
      fireEvent.click(screen.getByRole("button", { name: /Dubai/i }));
      // DubaiTab always renders "Dubai — Controls" section
      await screen.findByText(/Dubai.*Controls/, {}, { timeout: 5000 });
    }

    it("renders 'Dubai — Controls' section heading", async () => {
      await switchToDubai();
      expect(screen.getByText(/Dubai.*Controls/)).toBeInTheDocument();
    });

    it("does NOT show Manila 'Flagged' KPI label on Dubai tab", async () => {
      await switchToDubai();
      expect(screen.queryByText("Flagged")).not.toBeInTheDocument();
    });

    it("does NOT show 'All OK' badge on Dubai tab", async () => {
      await switchToDubai();
      expect(screen.queryByText("All OK")).not.toBeInTheDocument();
    });

    it("shows Dubai 'Menu Items' KPI label", async () => {
      await switchToDubai();
      expect(screen.getByText("Menu Items")).toBeInTheDocument();
    });

    it("shows Dubai 'Total Net Sales' KPI label", async () => {
      await switchToDubai();
      expect(screen.getByText("Total Net Sales")).toBeInTheDocument();
    });

    it("shows Dubai 'Discount Rate' KPI label", async () => {
      await switchToDubai();
      expect(screen.getByText("Discount Rate")).toBeInTheDocument();
    });

    it("shows Dubai 'Confirmed' KPI label", async () => {
      await switchToDubai();
      expect(screen.getByText("Confirmed")).toBeInTheDocument();
    });

    it("calls GET /api/admin/price-check/dubai/status on load", async () => {
      const fetchMock = makeFetch();
      await switchToDubai(fetchMock);
      await waitFor(() => {
        const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls;
        const dubaiCall = calls.find((args: unknown[]) =>
          String(args[0]).includes("/dubai/status")
        );
        expect(dubaiCall).toBeTruthy();
      });
    });

    it("shows date picker input on Dubai tab", async () => {
      await switchToDubai();
      // Date input should be present (value is yesterday's date)
      const dateInput = screen.getByDisplayValue(/\d{4}-\d{2}-\d{2}/);
      expect(dateInput).toBeInTheDocument();
    });

    it("shows 'Refresh' button on Dubai tab", async () => {
      await switchToDubai();
      expect(screen.getByRole("button", { name: /Refresh/i })).toBeInTheDocument();
    });

    it("shows 'Daily Confirmation' section", async () => {
      await switchToDubai();
      expect(screen.getByText(/Daily Confirmation/i)).toBeInTheDocument();
    });

    it("shows 'Discount Rate OK' checkbox label", async () => {
      await switchToDubai();
      expect(screen.getByText("Discount Rate OK")).toBeInTheDocument();
    });

    it("shows 'Menu OK' checkbox label", async () => {
      await switchToDubai();
      expect(screen.getByText("Menu OK")).toBeInTheDocument();
    });

    it("shows 'Save Confirmation' button", async () => {
      await switchToDubai();
      expect(
        screen.getByRole("button", { name: /Save Confirmation/i })
      ).toBeInTheDocument();
    });

    it("shows 'Not yet' when confirmation.confirmed_by is null", async () => {
      await switchToDubai();
      await waitFor(() => {
        expect(screen.getByText("Not yet")).toBeInTheDocument();
      });
    });

    it("shows confirmed_by name when confirmation data is populated", async () => {
      const dubaiStatusConfirmed = {
        ...DUBAI_STATUS_EMPTY,
        confirmation: {
          discount_rate_ok: true,
          menu_ok: true,
          confirmed_by: "Jay Test",
          confirmed_at: "2026-05-11T09:00:00Z",
          memo: "",
        },
      };
      const fetchMock = makeFetch([
        { match: "/dubai/status", body: dubaiStatusConfirmed },
      ]);
      await switchToDubai(fetchMock);
      await waitFor(() => {
        expect(screen.getByText("Jay Test")).toBeInTheDocument();
      });
    });

    it("shows Dubai item table when items are present in API response", async () => {
      const dubaiStatusWithItems = {
        ...DUBAI_STATUS_EMPTY,
        items: [
          {
            item_name: "Salmon Nigiri",
            qty_sold: 10,
            net_sales: 500,
            actual_unit_price: 50,
            baseline_price: 50,
            expected_price: 50,
            variance_pct: 0,
            status: "within",
          },
        ],
        summary: { total_items: 1, within_5pct: 1, outside_5pct: 0, no_baseline: 0 },
      };
      const fetchMock = makeFetch([
        { match: "/dubai/status", body: dubaiStatusWithItems },
      ]);
      await switchToDubai(fetchMock);
      await waitFor(() => {
        expect(screen.getByText("Salmon Nigiri")).toBeInTheDocument();
      });
    });

    it("shows table headers when Dubai items are present", async () => {
      const dubaiStatusWithItems = {
        ...DUBAI_STATUS_EMPTY,
        items: [
          {
            item_name: "Tuna Maki",
            qty_sold: 5,
            net_sales: 250,
            actual_unit_price: 50,
            baseline_price: 50,
            expected_price: 50,
            variance_pct: 0,
            status: "within",
          },
        ],
        summary: { total_items: 1, within_5pct: 1, outside_5pct: 0, no_baseline: 0 },
      };
      const fetchMock = makeFetch([
        { match: "/dubai/status", body: dubaiStatusWithItems },
      ]);
      await switchToDubai(fetchMock);
      await waitFor(() => {
        expect(screen.getByText("Item")).toBeInTheDocument();
        expect(screen.getByText("Qty Sold")).toBeInTheDocument();
        expect(screen.getByText("Net Sales")).toBeInTheDocument();
      });
    });

    it("calls POST /api/admin/price-check/dubai/confirm on Save Confirmation click", async () => {
      const fetchMock = makeFetch();
      await switchToDubai(fetchMock);

      fireEvent.click(screen.getByRole("button", { name: /Save Confirmation/i }));

      await waitFor(() => {
        const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls;
        const confirmCall = calls.find(
          (args: unknown[]) =>
            String(args[0]).includes("/dubai/confirm") &&
            String((args[1] as RequestInit)?.method).toUpperCase() === "POST"
        );
        expect(confirmCall).toBeTruthy();
      });
    });

    it("shows 'Dubai confirmation saved' success message after save", async () => {
      const fetchMock = makeFetch([
        { match: "/dubai/confirm", method: "POST", body: { ok: true } },
      ]);
      await switchToDubai(fetchMock);
      fireEvent.click(screen.getByRole("button", { name: /Save Confirmation/i }));

      await waitFor(() => {
        expect(screen.getByText(/Dubai confirmation saved/i)).toBeInTheDocument();
      });
    });

    it("shows error message when Dubai confirm API fails", async () => {
      const fetchMock = makeFetch([
        {
          match: "/dubai/confirm",
          method: "POST",
          status: 500,
          body: "Dubai save error",
        },
      ]);
      await switchToDubai(fetchMock);
      fireEvent.click(screen.getByRole("button", { name: /Save Confirmation/i }));

      await waitFor(() => {
        expect(screen.getByText(/Dubai save error/i)).toBeInTheDocument();
      });
    });

    it("shows error message when Dubai status load fails", async () => {
      const fetchMock = makeFetch([
        {
          match: "/dubai/status",
          status: 500,
          body: "Dubai API down",
        },
      ]);
      await switchToDubai(fetchMock);

      await waitFor(() => {
        expect(screen.getByText(/Dubai API down/i)).toBeInTheDocument();
      });
    });
  });

  // ── Flagged items (Price Changes Detected) ────────────────────────────────────
  describe("flagged items table", () => {
    function makeChangedFetch() {
      return makeFetch([
        {
          match: "/api/admin/price-check/status",
          method: "GET",
          body: { results: [RESULT_CHANGED], last_run: null, flagged_count: 1 },
        },
      ]);
    }

    it("shows 'Price Changes Detected' heading when flagged items exist", async () => {
      await renderAndLoad(makeChangedFetch());
      await waitFor(() => {
        expect(screen.getByText(/Price Changes Detected/i)).toBeInTheDocument();
      });
    });

    it("shows the flagged product name in the table", async () => {
      await renderAndLoad(makeChangedFetch());
      await waitFor(() => {
        expect(screen.getByText("Salmon Bowl")).toBeInTheDocument();
      });
    });

    it("shows product ID under product name", async () => {
      await renderAndLoad(makeChangedFetch());
      await waitFor(() => {
        expect(screen.getByText("P001")).toBeInTheDocument();
      });
    });

    it("shows 'Confirm' button for flagged items", async () => {
      await renderAndLoad(makeChangedFetch());
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Confirm/i })).toBeInTheDocument();
      });
    });

    it("clicking Confirm calls POST /api/admin/price-check/confirm", async () => {
      const fetchMock = makeChangedFetch();
      await renderAndLoad(fetchMock);
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /Confirm/i })).toBeInTheDocument()
      );

      fireEvent.click(screen.getByRole("button", { name: /Confirm/i }));

      await waitFor(() => {
        const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls;
        const confirmCall = calls.find(
          (args: unknown[]) =>
            String(args[0]).includes("/price-check/confirm") &&
            String((args[1] as RequestInit)?.method).toUpperCase() === "POST"
        );
        expect(confirmCall).toBeTruthy();
      });
    });

    it("confirm request includes store_code and product_id", async () => {
      const fetchMock = makeChangedFetch();
      await renderAndLoad(fetchMock);
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /Confirm/i })).toBeInTheDocument()
      );

      fireEvent.click(screen.getByRole("button", { name: /Confirm/i }));

      await waitFor(() => {
        const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls;
        const confirmCall = calls.find((args: unknown[]) =>
          String(args[0]).includes("/price-check/confirm")
        );
        const body = JSON.parse((confirmCall![1] as RequestInit).body as string);
        expect(body.store_code).toBe("TAFT");
        expect(body.product_id).toBe("P001");
      });
    });

    it("dispatches 'priceCheck' badge refresh after confirming item", async () => {
      const { dispatchBadgeRefresh } = await import("@/lib/badgeEvents");
      vi.mocked(dispatchBadgeRefresh).mockClear();

      const fetchMock = makeChangedFetch();
      await renderAndLoad(fetchMock);
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /Confirm/i })).toBeInTheDocument()
      );

      fireEvent.click(screen.getByRole("button", { name: /Confirm/i }));

      await waitFor(() => {
        expect(vi.mocked(dispatchBadgeRefresh)).toHaveBeenCalledWith("priceCheck");
      });
    });

    it("shows success message after confirming item", async () => {
      const fetchMock = makeChangedFetch();
      await renderAndLoad(fetchMock);
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /Confirm/i })).toBeInTheDocument()
      );

      fireEvent.click(screen.getByRole("button", { name: /Confirm/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/Salmon Bowl.*marked as confirmed|marked as confirmed/i)
        ).toBeInTheDocument();
      });
    });

    it("shows error when confirm API fails", async () => {
      const fetchMock = makeFetch([
        {
          match: "/api/admin/price-check/status",
          method: "GET",
          body: { results: [RESULT_CHANGED], last_run: null, flagged_count: 1 },
        },
        {
          match: "/price-check/confirm",
          method: "POST",
          status: 500,
          body: "Confirm failed",
        },
      ]);
      await renderAndLoad(fetchMock);
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /Confirm/i })).toBeInTheDocument()
      );

      fireEvent.click(screen.getByRole("button", { name: /Confirm/i }));

      await waitFor(() => {
        expect(screen.getByText(/Confirm failed/i)).toBeInTheDocument();
      });
    });
  });

  // ── Monitored Items table (OK / Confirmed) ────────────────────────────────────
  describe("monitored items table (OK / Confirmed)", () => {
    it("shows 'Monitored Items' section heading when ok/confirmed items exist", async () => {
      const fetchMock = makeFetch([
        {
          match: "/api/admin/price-check/status",
          method: "GET",
          body: { results: [RESULT_OK], last_run: null, flagged_count: 0 },
        },
      ]);
      await renderAndLoad(fetchMock);
      await waitFor(() => {
        // "Monitored Items" appears in both the KPI label and the section heading
        expect(screen.getAllByText(/Monitored Items/i).length).toBeGreaterThanOrEqual(2);
      });
    });

    it("shows OK product name in the table", async () => {
      const fetchMock = makeFetch([
        {
          match: "/api/admin/price-check/status",
          method: "GET",
          body: { results: [RESULT_OK], last_run: null, flagged_count: 0 },
        },
      ]);
      await renderAndLoad(fetchMock);
      await waitFor(() => {
        expect(screen.getByText("Tuna Roll")).toBeInTheDocument();
      });
    });

    it("does NOT show 'Confirm' button for OK items (showConfirm=false)", async () => {
      const fetchMock = makeFetch([
        {
          match: "/api/admin/price-check/status",
          method: "GET",
          body: { results: [RESULT_OK], last_run: null, flagged_count: 0 },
        },
      ]);
      await renderAndLoad(fetchMock);
      await waitFor(() => expect(screen.getByText("Tuna Roll")).toBeInTheDocument());
      expect(screen.queryByRole("button", { name: /^Confirm$/i })).not.toBeInTheDocument();
    });

    it("shows confirmed product in the monitored table", async () => {
      const fetchMock = makeFetch([
        {
          match: "/api/admin/price-check/status",
          method: "GET",
          body: {
            results: [RESULT_CONFIRMED],
            last_run: null,
            flagged_count: 0,
          },
        },
      ]);
      await renderAndLoad(fetchMock);
      await waitFor(() => {
        expect(screen.getByText("Ebi Tempura")).toBeInTheDocument();
      });
    });

    it("count in 'Monitored Items (N)' heading matches ok + confirmed items", async () => {
      const fetchMock = makeFetch([
        {
          match: "/api/admin/price-check/status",
          method: "GET",
          body: {
            results: [RESULT_OK, RESULT_CONFIRMED],
            last_run: null,
            flagged_count: 0,
          },
        },
      ]);
      await renderAndLoad(fetchMock);
      await waitFor(() => {
        expect(screen.getByText(/Monitored Items \(2\)/i)).toBeInTheDocument();
      });
    });
  });

  // ── Empty state ───────────────────────────────────────────────────────────────
  describe("empty state", () => {
    it("shows 'No price data yet' on TAFT tab with empty results", async () => {
      await renderAndLoad();
      await waitFor(() => {
        expect(screen.getByText(/No price data yet/i)).toBeInTheDocument();
      });
    });

    it("shows 'No prices recorded yet' on PAR tab with empty results", async () => {
      const fetchMock = makeFetch();
      await renderPage(fetchMock);
      fireEvent.click(screen.getByRole("button", { name: /Parañaque/i }));
      await waitFor(() => {
        expect(screen.getByText(/No prices recorded yet/i)).toBeInTheDocument();
      });
    });

    it("does NOT show 'Run Check Now' empty-state button on PAR tab", async () => {
      const fetchMock = makeFetch();
      await renderPage(fetchMock);
      fireEvent.click(screen.getByRole("button", { name: /Parañaque/i }));
      await screen.findByText("Manual Price Entry");
      // PAR empty state should NOT include a run-check button
      expect(screen.queryByRole("button", { name: /Run Check Now/i })).not.toBeInTheDocument();
    });
  });

  // ── API error handling ─────────────────────────────────────────────────────────
  describe("API error handling", () => {
    it("shows error message when loadStatus returns 500", async () => {
      const fetchMock = makeFetch([
        {
          match: "/api/admin/price-check/status",
          method: "GET",
          status: 500,
          body: "Internal server error",
        },
      ]);
      await renderPage(fetchMock);
      await waitFor(() => {
        expect(screen.getByText(/Internal server error/i)).toBeInTheDocument();
      });
    });

    it("shows error message when loadStatus network fails", async () => {
      const failFetch = vi.fn(async (url: string) => {
        if (String(url).includes("/api/admin/price-check/status")) {
          throw new Error("Network failure");
        }
        return new Response("{}", { status: 200 });
      });
      await setupAuth();
      vi.stubGlobal("fetch", failFetch);
      render(<PriceCheckPage />);
      await waitFor(() => {
        expect(screen.getByText(/Network failure/i)).toBeInTheDocument();
      });
    });
  });

  // ── Tab switch triggers correct store_code ────────────────────────────────────
  describe("tab switching — correct store_code in requests", () => {
    it("fetches store_code=TAFT on initial load", async () => {
      const fetchMock = makeFetch();
      await renderAndLoad(fetchMock);
      await waitFor(() => {
        const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls;
        const taftCall = calls.find((args: unknown[]) =>
          String(args[0]).includes("store_code=TAFT")
        );
        expect(taftCall).toBeTruthy();
      });
    });

    it("fetches store_code=PAR when PAR tab is clicked", async () => {
      const fetchMock = makeFetch();
      await renderPage(fetchMock);
      fireEvent.click(screen.getByRole("button", { name: /Parañaque/i }));
      await waitFor(() => {
        const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls;
        const parCall = calls.find((args: unknown[]) =>
          String(args[0]).includes("store_code=PAR")
        );
        expect(parCall).toBeTruthy();
      });
    });

    it("does NOT fetch /price-check/status when DUBAI tab is clicked", async () => {
      const fetchMock = makeFetch();
      await renderPage(fetchMock);

      // Wait for initial TAFT load
      await screen.findByText("Price Check");
      const callsBefore = (fetchMock as ReturnType<typeof vi.fn>).mock.calls.filter(
        (args: unknown[]) => String(args[0]).includes("/price-check/status")
      ).length;

      fireEvent.click(screen.getByRole("button", { name: /Dubai/i }));

      await new Promise((r) => setTimeout(r, 150));
      const callsAfter = (fetchMock as ReturnType<typeof vi.fn>).mock.calls.filter(
        (args: unknown[]) => String(args[0]).includes("/price-check/status")
      ).length;

      // No new /price-check/status calls after switching to Dubai
      expect(callsAfter).toBe(callsBefore);
    });
  });
});
