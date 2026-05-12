// tests/admin/baseroll-prep/baseroll-prep-page.test.tsx
// Comprehensive tests for src/app/admin/baseroll-prep/page.tsx
// Covers: prep tab, store cards, session tables, mapping settings CRUD,
//         other items backup form, validation, submission.

import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── next/link ─────────────────────────────────────────────────────────────────
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) =>
    React.createElement("a", { href, ...props }, children),
}));

// ── Auth ───────────────────────────────────────────────────────────────────────
const BASE_AUTH = {
  staffName: "Jay Test",
  city: "manila" as const,
  role: "ADMIN",
  accessToken: "tok-test",
  permissions: ["*"],
};

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getAuth: vi.fn(() => BASE_AUTH),
    getAuthHeaders: vi.fn(() => ({
      Authorization: "Bearer tok-test",
      "Content-Type": "application/json",
    })),
  };
});

import BaserollPrepPage from "@/app/admin/baseroll-prep/page";

// ══════════════════════════════════════════════════════════════════════════════
// Fixtures
// ══════════════════════════════════════════════════════════════════════════════

const STORE_RESULT_TAFT = {
  store: "Taft",
  reference_date: "2026-05-05",
  total_orders: 100,
  lunch_orders: 60,
  lunch_ratio: 0.6,
  dinner_orders: 40,
  dinner_ratio: 0.4,
  matched_products: [{ name: "California Roll (8pcs)", daily_qty: 50 }],
  lunch: [{ roll: "California Base Roll", qty_raw: 30, qty_prep: 27 }],
  dinner: [{ roll: "Shrimp Tempura Base Roll", qty_raw: 20, qty_prep: 18 }],
};

const STORE_RESULT_PAR = {
  store: "Paranaque",
  reference_date: "2026-05-05",
  total_orders: 80,
  lunch_orders: 40,
  lunch_ratio: 0.5,
  dinner_orders: 40,
  dinner_ratio: 0.5,
  matched_products: [],
  lunch: [{ roll: "Crunchy Fish Base Roll", qty_raw: 15, qty_prep: 14 }],
  dinner: [],
};

const MAP_ROW_1 = {
  id: 1,
  product_name: "California Roll (8pcs)",
  base_roll_name: "California Base Roll",
  coefficient: 1.0,
  is_active: true,
  notes: "flagship product",
  updated_at: null,
};

const MAP_ROW_2 = {
  id: 2,
  product_name: "Spicy Tuna Roll (8pcs)",
  base_roll_name: "Spicy Tuna & Quezo Base Roll",
  coefficient: 0.5,
  is_active: false,
  notes: "",
  updated_at: null,
};

const PREP_API_RESPONSE = {
  ok: true,
  prep_date: "2026-05-12",
  reference_date: "2026-05-05",
  stores: [STORE_RESULT_TAFT],
};

const PREP_API_EMPTY = {
  ok: true,
  prep_date: "2026-05-12",
  reference_date: "2026-05-05",
  stores: [],
};

const MAP_API_RESPONSE = {
  ok: true,
  items: [MAP_ROW_1, MAP_ROW_2],
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

    // Defaults
    if (u.includes("/baseroll-prep") && method === "GET") {
      return new Response(JSON.stringify(PREP_API_RESPONSE), { status: 200 });
    }
    if (u.includes("/baseroll-map") && method === "GET") {
      return new Response(JSON.stringify(MAP_API_RESPONSE), { status: 200 });
    }
    if (u.includes("/baseroll-map") && u.includes("/toggle") && method === "PATCH") {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (u.includes("/baseroll-map/") && method === "DELETE") {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (u.includes("/baseroll-map") && method === "POST") {
      return new Response(
        JSON.stringify({ ok: true, item: { ...MAP_ROW_1, id: 99 } }),
        { status: 200 }
      );
    }
    if (u.includes("/backup/report") && method === "POST") {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  });
}

async function setupAuth(override?: Partial<typeof BASE_AUTH>) {
  const { getAuth } = await import("@/lib/auth");
  vi.mocked(getAuth).mockReturnValue({ ...BASE_AUTH, ...override } as any);
}

// ══════════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════════

describe("BaserollPrepPage", () => {
  beforeEach(async () => {
    await setupAuth();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function renderPage(fetchMock = makeFetch()) {
    vi.stubGlobal("fetch", fetchMock);
    render(<BaserollPrepPage />);
  }

  async function renderAndLoad(fetchMock = makeFetch()) {
    await renderPage(fetchMock);
    // Wait for the initial fetch to complete (store card or empty state appear)
    await waitFor(() => {
      const hasStore = screen.queryByText("Taft") !== null;
      const hasEmpty = screen.queryByText(/No Manila sales data found/i) !== null;
      const hasError = screen.queryByText(/HTTP|error/i) !== null;
      expect(hasStore || hasEmpty || hasError).toBe(true);
    }, { timeout: 5000 });
  }

  // ── Page header ──────────────────────────────────────────────────────────────
  describe("page header", () => {
    it("renders page title with sushi emoji", async () => {
      await renderPage();
      expect(screen.getByText(/Base Roll Prep Instructions/i)).toBeInTheDocument();
    });

    it("renders subtitle about automatic calculation", async () => {
      await renderPage();
      expect(screen.getByText(/automatically calculates/i)).toBeInTheDocument();
    });

    it("renders '← Admin' back link", async () => {
      await renderPage();
      const link = screen.getByRole("link", { name: /← Admin/i });
      expect(link).toHaveAttribute("href", "/admin");
    });
  });

  // ── Tab navigation ────────────────────────────────────────────────────────────
  describe("tab navigation", () => {
    it("renders 'Prep Calculator' tab button", async () => {
      await renderPage();
      expect(
        screen.getByRole("button", { name: /Prep Calculator/i })
      ).toBeInTheDocument();
    });

    it("renders 'Mapping Settings' tab button", async () => {
      await renderPage();
      expect(
        screen.getByRole("button", { name: /Mapping Settings/i })
      ).toBeInTheDocument();
    });

    it("Prep Calculator is active by default — shows date input", async () => {
      await renderPage();
      expect(
        screen.getByLabelText(/Prep Date/i)
      ).toBeInTheDocument();
    });

    it("clicking Mapping Settings tab shows mappings content", async () => {
      const fetchMock = makeFetch();
      await renderPage(fetchMock);
      fireEvent.click(screen.getByRole("button", { name: /Mapping Settings/i }));
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /\+ Add/i })).toBeInTheDocument();
      });
    });

    it("clicking Prep Calculator tab after Settings restores prep content", async () => {
      await renderPage();
      fireEvent.click(screen.getByRole("button", { name: /Mapping Settings/i }));
      fireEvent.click(screen.getByRole("button", { name: /Prep Calculator/i }));
      expect(screen.getByLabelText(/Prep Date/i)).toBeInTheDocument();
    });
  });

  // ── Prep Calculator tab ───────────────────────────────────────────────────────
  describe("Prep Calculator tab", () => {
    it("shows Prep Date input", async () => {
      await renderPage();
      expect(screen.getByLabelText(/Prep Date/i)).toBeInTheDocument();
    });

    it("shows Reference Date label", async () => {
      await renderPage();
      expect(screen.getByText(/Reference Date/i)).toBeInTheDocument();
    });

    it("reference date is 7 days before prep date", async () => {
      await renderPage();
      const dateInput = screen.getByLabelText(/Prep Date/i) as HTMLInputElement;
      const prepDate = dateInput.value; // e.g. "2026-05-12"
      // Build expected ref date (prepDate - 7 days)
      const d = new Date(prepDate + "T00:00:00");
      d.setDate(d.getDate() - 7);
      const month = d.toLocaleDateString("en-US", { month: "short" });
      const day = d.getDate();
      // Reference date label should contain the formatted date
      expect(screen.getByText(new RegExp(`${month}.*${day}|${day}.*${month}`))).toBeInTheDocument();
    });

    it("shows '🔄 Calculate' button", async () => {
      await renderAndLoad();
      expect(screen.getByRole("button", { name: /Calculate/i })).toBeInTheDocument();
    });

    it("shows formula explanation box", async () => {
      await renderPage();
      expect(screen.getByText(/Formula/i)).toBeInTheDocument();
    });

    it("shows 'Lunch = orders 11–14h' in formula box", async () => {
      await renderPage();
      expect(screen.getByText(/Lunch.*11/i)).toBeInTheDocument();
    });

    it("auto-fetches on mount — calls GET /baseroll-prep", async () => {
      const fetchMock = makeFetch();
      await renderPage(fetchMock);
      await waitFor(() => {
        const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls;
        const prepCall = calls.find((args: unknown[]) =>
          String(args[0]).includes("/baseroll-prep")
        );
        expect(prepCall).toBeTruthy();
      });
    });

    it("shows 'Fetching data…' loading spinner during fetch", async () => {
      // Use a delayed fetch to observe loading state
      let resolveFetch!: () => void;
      const slowFetch = vi.fn(async (url: string) => {
        if (String(url).includes("/baseroll-prep")) {
          await new Promise<void>((res) => { resolveFetch = res; });
          return new Response(JSON.stringify(PREP_API_EMPTY), { status: 200 });
        }
        return new Response("{}", { status: 200 });
      });
      vi.stubGlobal("fetch", slowFetch);
      render(<BaserollPrepPage />);
      await waitFor(() => {
        expect(screen.getByText(/Fetching data/i)).toBeInTheDocument();
      });
      resolveFetch();
    });

    it("clicking Calculate triggers new fetch", async () => {
      const fetchMock = makeFetch();
      await renderAndLoad(fetchMock);
      const before = (fetchMock as ReturnType<typeof vi.fn>).mock.calls.filter(
        (a: unknown[]) => String(a[0]).includes("/baseroll-prep")
      ).length;
      fireEvent.click(screen.getByRole("button", { name: /Calculate/i }));
      await waitFor(() => {
        const after = (fetchMock as ReturnType<typeof vi.fn>).mock.calls.filter(
          (a: unknown[]) => String(a[0]).includes("/baseroll-prep")
        ).length;
        expect(after).toBeGreaterThan(before);
      });
    });

    it("shows error message when API fails", async () => {
      const fetchMock = makeFetch([
        {
          match: "/baseroll-prep",
          method: "GET",
          status: 500,
          body: { detail: "Backend is down" },
        },
      ]);
      await renderPage(fetchMock);
      await waitFor(() => {
        expect(screen.getByText(/Backend is down/i)).toBeInTheDocument();
      });
    });

    it("shows empty state when stores array is empty", async () => {
      const fetchMock = makeFetch([
        { match: "/baseroll-prep", method: "GET", body: PREP_API_EMPTY },
      ]);
      await renderPage(fetchMock);
      await waitFor(() => {
        expect(screen.getByText(/No Manila sales data found/i)).toBeInTheDocument();
      });
    });

    it("shows 'Please select a different date' hint on empty state", async () => {
      const fetchMock = makeFetch([
        { match: "/baseroll-prep", method: "GET", body: PREP_API_EMPTY },
      ]);
      await renderPage(fetchMock);
      await waitFor(() => {
        expect(screen.getByText(/select a different date/i)).toBeInTheDocument();
      });
    });

    it("shows store card with store name when data is returned", async () => {
      await renderAndLoad();
      expect(screen.getByText("Taft")).toBeInTheDocument();
    });

    it("shows multiple store cards when API returns multiple stores", async () => {
      const fetchMock = makeFetch([
        {
          match: "/baseroll-prep",
          method: "GET",
          body: {
            ...PREP_API_RESPONSE,
            stores: [STORE_RESULT_TAFT, STORE_RESULT_PAR],
          },
        },
      ]);
      await renderPage(fetchMock);
      await waitFor(() => {
        expect(screen.getByText("Taft")).toBeInTheDocument();
        expect(screen.getByText("Paranaque")).toBeInTheDocument();
      });
    });

    it("prep_date query param matches the date picker value", async () => {
      const fetchMock = makeFetch();
      await renderPage(fetchMock);
      await waitFor(() => {
        const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls;
        const prepCall = calls.find((args: unknown[]) =>
          String(args[0]).includes("/baseroll-prep?prep_date=")
        );
        expect(prepCall).toBeTruthy();
      });
    });
  });

  // ── StoreCard ─────────────────────────────────────────────────────────────────
  describe("StoreCard", () => {
    async function renderWithStore(fetchMock = makeFetch()) {
      await renderPage(fetchMock);
      await screen.findByText("Taft", {}, { timeout: 5000 });
    }

    it("shows store name in card header", async () => {
      await renderWithStore();
      expect(screen.getByText("Taft")).toBeInTheDocument();
    });

    it("shows lunch percentage in header", async () => {
      await renderWithStore();
      // 60% lunch ratio → "Lunch 60%"
      expect(screen.getByText(/Lunch 60%/i)).toBeInTheDocument();
    });

    it("shows dinner percentage in header", async () => {
      await renderWithStore();
      expect(screen.getByText(/Dinner 40%/i)).toBeInTheDocument();
    });

    it("shows total orders count", async () => {
      await renderWithStore();
      expect(screen.getByText(/100 orders/i)).toBeInTheDocument();
    });

    it("shows reference date in card header", async () => {
      await renderWithStore();
      expect(screen.getByText(/Ref:/i)).toBeInTheDocument();
    });

    it("shows Lunch Prep roll data by default (expanded)", async () => {
      await renderWithStore();
      expect(screen.getByText("California Base Roll")).toBeInTheDocument();
    });

    it("shows Dinner Prep roll data by default (expanded)", async () => {
      await renderWithStore();
      expect(screen.getByText("Shrimp Tempura Base Roll")).toBeInTheDocument();
    });

    it("shows qty_prep value as the main number", async () => {
      await renderWithStore();
      // STORE_RESULT_TAFT.lunch[0].qty_prep = 27
      expect(screen.getByText("27")).toBeInTheDocument();
    });

    it("shows calculation formula (qty_raw × 0.9 =)", async () => {
      await renderWithStore();
      // "30 × 0.9 ="
      expect(screen.getByText(/30 × 0\.9 =/i)).toBeInTheDocument();
    });

    it("clicking store header collapses the card", async () => {
      await renderWithStore();
      const storeHeader = screen.getByRole("button", { name: /🏪 Taft/i });
      fireEvent.click(storeHeader);
      await waitFor(() => {
        expect(screen.queryByText("California Base Roll")).not.toBeInTheDocument();
      });
    });

    it("clicking header again re-expands the card", async () => {
      await renderWithStore();
      const storeHeader = screen.getByRole("button", { name: /🏪 Taft/i });
      fireEvent.click(storeHeader);
      fireEvent.click(storeHeader);
      await waitFor(() => {
        expect(screen.getByText("California Base Roll")).toBeInTheDocument();
      });
    });

    it("shows matched products count in collapsible details", async () => {
      await renderWithStore();
      // "Products used in calculation (1 items)"
      expect(screen.getByText(/Products used in calculation \(1 item/i)).toBeInTheDocument();
    });

    it("shows 'Lunch — No data' when lunch array is empty", async () => {
      const fetchMock = makeFetch([
        {
          match: "/baseroll-prep",
          method: "GET",
          body: {
            ...PREP_API_RESPONSE,
            stores: [STORE_RESULT_PAR], // dinner is []
          },
        },
      ]);
      await renderPage(fetchMock);
      await waitFor(() => {
        expect(screen.getByText(/Dinner Prep.*No data/i)).toBeInTheDocument();
      });
    });
  });

  // ── Mapping Settings tab ──────────────────────────────────────────────────────
  describe("Mapping Settings tab", () => {
    async function switchToSettings(fetchMock = makeFetch()) {
      await renderPage(fetchMock);
      fireEvent.click(screen.getByRole("button", { name: /Mapping Settings/i }));
      // Wait for mappings to load
      await waitFor(() => {
        const hasRows = screen.queryByText("California Roll (8pcs)") !== null;
        const hasEmpty = screen.queryByText(/No mappings found/i) !== null;
        const hasLoading = screen.queryByText(/Loading mappings/i) !== null;
        expect(hasRows || hasEmpty || hasLoading).toBe(true);
      }, { timeout: 5000 });
    }

    async function switchAndLoad(fetchMock = makeFetch()) {
      await renderPage(fetchMock);
      fireEvent.click(screen.getByRole("button", { name: /Mapping Settings/i }));
      await screen.findByText("California Roll (8pcs)", {}, { timeout: 5000 });
    }

    it("shows '+ Add' button in settings tab", async () => {
      await switchToSettings();
      expect(screen.getByRole("button", { name: /\+ Add/i })).toBeInTheDocument();
    });

    it("shows 'No mappings found' when items are empty", async () => {
      const fetchMock = makeFetch([
        { match: "/baseroll-map", method: "GET", body: { ok: true, items: [] } },
      ]);
      await switchToSettings(fetchMock);
      await waitFor(() => {
        expect(screen.getByText(/No mappings found/i)).toBeInTheDocument();
      });
    });

    it("shows product name in mapping rows", async () => {
      await switchAndLoad();
      expect(screen.getByText("California Roll (8pcs)")).toBeInTheDocument();
      expect(screen.getByText("Spicy Tuna Roll (8pcs)")).toBeInTheDocument();
    });

    it("shows base roll name in mapping rows", async () => {
      await switchAndLoad();
      expect(screen.getByText("California Base Roll")).toBeInTheDocument();
    });

    it("shows coefficient value", async () => {
      await switchAndLoad();
      expect(screen.getByText("1")).toBeInTheDocument(); // coefficient 1.0
    });

    it("shows Active/Inactive toggle for each row", async () => {
      await switchAndLoad();
      const activeBtn = screen.getAllByRole("button", { name: /Active|Inactive/i });
      expect(activeBtn.length).toBeGreaterThanOrEqual(2);
    });

    it("MAP_ROW_1 shows 'Active' (is_active=true)", async () => {
      await switchAndLoad();
      const rows = screen.getAllByRole("button", { name: /^Active$/i });
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });

    it("MAP_ROW_2 shows 'Inactive' (is_active=false)", async () => {
      await switchAndLoad();
      const rows = screen.getAllByRole("button", { name: /^Inactive$/i });
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });

    it("clicking Active/Inactive toggle calls PATCH toggle endpoint", async () => {
      const fetchMock = makeFetch();
      await switchAndLoad(fetchMock);
      const [toggleBtn] = screen.getAllByRole("button", { name: /^Active$/i });
      fireEvent.click(toggleBtn);
      await waitFor(() => {
        const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls;
        const patchCall = calls.find(
          (args: unknown[]) =>
            String(args[0]).includes("/toggle") &&
            String((args[1] as RequestInit)?.method).toUpperCase() === "PATCH"
        );
        expect(patchCall).toBeTruthy();
      });
    });

    it("shows delete button for each row", async () => {
      await switchAndLoad();
      const deleteBtns = screen.getAllByTitle("Delete");
      expect(deleteBtns.length).toBeGreaterThanOrEqual(2);
    });

    it("delete with confirmed dialog calls DELETE endpoint", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const fetchMock = makeFetch();
      await switchAndLoad(fetchMock);
      const [deleteBtn] = screen.getAllByTitle("Delete");
      fireEvent.click(deleteBtn);
      await waitFor(() => {
        const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls;
        const deleteCall = calls.find(
          (args: unknown[]) =>
            String(args[0]).includes("/baseroll-map/") &&
            String((args[1] as RequestInit)?.method).toUpperCase() === "DELETE"
        );
        expect(deleteCall).toBeTruthy();
      });
    });

    it("delete cancelled by confirm dialog does NOT call DELETE", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(false);
      const fetchMock = makeFetch();
      await switchAndLoad(fetchMock);
      const before = (fetchMock as ReturnType<typeof vi.fn>).mock.calls.length;
      const [deleteBtn] = screen.getAllByTitle("Delete");
      fireEvent.click(deleteBtn);
      await new Promise((r) => setTimeout(r, 100));
      const after = (fetchMock as ReturnType<typeof vi.fn>).mock.calls.length;
      expect(after).toBe(before);
    });

    it("row disappears from list after successful delete", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const fetchMock = makeFetch();
      await switchAndLoad(fetchMock);
      // Delete row with id=1 (California Roll)
      // The confirm mock accepts, delete runs, row is removed from state
      const allDeleteBtns = screen.getAllByTitle("Delete");
      // First delete button belongs to MAP_ROW_1 (California Roll)
      fireEvent.click(allDeleteBtns[0]);
      await waitFor(() => {
        expect(screen.queryByText("California Roll (8pcs)")).not.toBeInTheDocument();
      });
    });

    it("shows 'Edit' button for each mapping row", async () => {
      await switchAndLoad();
      const editBtns = screen.getAllByRole("button", { name: /^Edit$/i });
      expect(editBtns.length).toBeGreaterThanOrEqual(2);
    });

    it("clicking Edit shows coefficient input field", async () => {
      await switchAndLoad();
      const [editBtn] = screen.getAllByRole("button", { name: /^Edit$/i });
      fireEvent.click(editBtn);
      await waitFor(() => {
        // After click, an editable number input replaces the static coefficient display
        const inputs = screen.getAllByDisplayValue(/1(\.\d+)?|0(\.\d+)?/);
        expect(inputs.length).toBeGreaterThanOrEqual(1);
      });
    });

    it("clicking Cancel in edit mode restores row to view mode", async () => {
      await switchAndLoad();
      const [editBtn] = screen.getAllByRole("button", { name: /^Edit$/i });
      fireEvent.click(editBtn);
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /^Cancel$/i })).toBeInTheDocument()
      );
      fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));
      await waitFor(() => {
        expect(screen.queryByRole("button", { name: /^Cancel$/i })).not.toBeInTheDocument();
      });
    });

    // ── Add form ──────────────────────────────────────────────────────────────
    describe("Add form", () => {
      async function openAddForm(fetchMock = makeFetch()) {
        await switchToSettings(fetchMock);
        fireEvent.click(screen.getByRole("button", { name: /\+ Add/i }));
        await waitFor(() => {
          expect(screen.getByText("Add New Mapping")).toBeInTheDocument();
        });
      }

      it("clicking '+ Add' shows 'Add New Mapping' form", async () => {
        await openAddForm();
        expect(screen.getByText("Add New Mapping")).toBeInTheDocument();
      });

      it("shows Product Name input in add form", async () => {
        await openAddForm();
        expect(
          screen.getByPlaceholderText(/e\.g\. California Roll/i)
        ).toBeInTheDocument();
      });

      it("shows Base Roll select with all options", async () => {
        await openAddForm();
        const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
        const baseRollSelect = selects.find((s) =>
          Array.from(s.querySelectorAll("option")).some(
            (o) => (o as HTMLOptionElement).text === "California Base Roll"
          )
        );
        expect(baseRollSelect).toBeTruthy();
      });

      it("shows Coefficient input", async () => {
        await openAddForm();
        expect(
          screen.getByDisplayValue("1.0")
        ).toBeInTheDocument();
      });

      it("shows Save and Cancel buttons", async () => {
        await openAddForm();
        expect(screen.getByRole("button", { name: /^Save$/i })).toBeInTheDocument();
        expect(
          screen.getAllByRole("button", { name: /^Cancel$/i }).length
        ).toBeGreaterThanOrEqual(1);
      });

      it("shows error 'Product name is required' when saving with empty name", async () => {
        await openAddForm();
        fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
        await waitFor(() => {
          expect(screen.getByText(/Product name is required/i)).toBeInTheDocument();
        });
      });

      it("shows error when coefficient is negative", async () => {
        await openAddForm();
        fireEvent.change(screen.getByPlaceholderText(/e\.g\. California Roll/i), {
          target: { value: "Test Product" },
        });
        fireEvent.change(screen.getByDisplayValue("1.0"), {
          target: { value: "-1" },
        });
        fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
        await waitFor(() => {
          expect(screen.getByText(/Coefficient must be a number/i)).toBeInTheDocument();
        });
      });

      it("submits valid form calling POST /baseroll-map", async () => {
        const fetchMock = makeFetch();
        await openAddForm(fetchMock);
        fireEvent.change(screen.getByPlaceholderText(/e\.g\. California Roll/i), {
          target: { value: "New Product" },
        });
        fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
        await waitFor(() => {
          const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls;
          const postCall = calls.find(
            (args: unknown[]) =>
              String(args[0]).includes("/baseroll-map") &&
              !String(args[0]).includes("/toggle") &&
              !String(args[0]).includes("/baseroll-map/") &&
              String((args[1] as RequestInit)?.method).toUpperCase() === "POST"
          );
          expect(postCall).toBeTruthy();
          const body = JSON.parse((postCall![1] as RequestInit).body as string);
          expect(body.product_name).toBe("New Product");
        });
      });

      it("hides add form after successful submission", async () => {
        await openAddForm();
        fireEvent.change(screen.getByPlaceholderText(/e\.g\. California Roll/i), {
          target: { value: "New Product" },
        });
        fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
        await waitFor(() => {
          expect(screen.queryByText("Add New Mapping")).not.toBeInTheDocument();
        });
      });

      it("clicking Cancel hides the add form", async () => {
        await openAddForm();
        // Find the Cancel button in the add form area
        fireEvent.click(
          screen.getAllByRole("button", { name: /^Cancel$/i })[0]
        );
        await waitFor(() => {
          expect(screen.queryByText("Add New Mapping")).not.toBeInTheDocument();
        });
      });

      it("shows add error on API failure", async () => {
        const fetchMock = makeFetch([
          {
            match: "/baseroll-map",
            method: "POST",
            status: 500,
            body: { detail: "Duplicate mapping" },
          },
        ]);
        await openAddForm(fetchMock);
        fireEvent.change(screen.getByPlaceholderText(/e\.g\. California Roll/i), {
          target: { value: "New Product" },
        });
        fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
        await waitFor(() => {
          expect(screen.getByText(/Duplicate mapping/i)).toBeInTheDocument();
        });
      });
    });
  });

  // ── Other Items Backup Form ───────────────────────────────────────────────────
  describe("OtherItemsBackupForm", () => {
    async function renderPrepTab(fetchMock = makeFetch()) {
      await renderPage(fetchMock);
      // Wait for the "Other Items Backup" heading (unique selector — avoids matching the divider span)
      await screen.findByRole("heading", { name: /Other Items Backup/i }, { timeout: 5000 });
    }

    it("shows 'Other Items Backup' heading", async () => {
      await renderPrepTab();
      expect(screen.getByText(/Other Items Backup/i)).toBeInTheDocument();
    });

    it("shows Branch selector with Manila branches (PAR, CUB, TAFT)", async () => {
      await renderPrepTab();
      const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
      const branchSelect = selects.find((s) =>
        Array.from(s.querySelectorAll("option")).some(
          (o) => (o as HTMLOptionElement).value === "PAR"
        )
      );
      expect(branchSelect).toBeTruthy();
      const opts = Array.from(branchSelect!.querySelectorAll("option")).map(
        (o) => (o as HTMLOptionElement).value
      );
      expect(opts).toContain("PAR");
      expect(opts).toContain("CUB");
      expect(opts).toContain("TAFT");
    });

    it("does NOT include Central Kitchen (CK) or Back Office (BO) in branches", async () => {
      await renderPrepTab();
      const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
      const branchSelect = selects.find((s) =>
        Array.from(s.querySelectorAll("option")).some(
          (o) => (o as HTMLOptionElement).value === "PAR"
        )
      );
      const opts = Array.from(branchSelect!.querySelectorAll("option")).map(
        (o) => (o as HTMLOptionElement).value
      );
      expect(opts).not.toContain("CK");
      expect(opts).not.toContain("BO");
    });

    it("shows Shift selector with Closing, Morning, Midday options", async () => {
      await renderPrepTab();
      const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
      const shiftSelect = selects.find((s) =>
        Array.from(s.querySelectorAll("option")).some(
          (o) => (o as HTMLOptionElement).text === "Closing"
        )
      );
      expect(shiftSelect).toBeTruthy();
      const opts = Array.from(shiftSelect!.querySelectorAll("option")).map(
        (o) => (o as HTMLOptionElement).text
      );
      expect(opts).toContain("Closing");
      expect(opts).toContain("Morning");
      expect(opts).toContain("Midday");
    });

    it("pre-fills 'Your Name' field from auth.staffName", async () => {
      await renderPrepTab();
      await waitFor(() => {
        const nameInputs = screen.getAllByPlaceholderText(/Staff name/i) as HTMLInputElement[];
        expect(nameInputs[0].value).toBe("Jay Test");
      });
    });

    it("shows 'Condiments & Supplies' section", async () => {
      await renderPrepTab();
      expect(screen.getByText(/Condiments & Supplies/i)).toBeInTheDocument();
    });

    it("shows 'Packaging' section", async () => {
      await renderPrepTab();
      expect(screen.getByText(/Packaging/i)).toBeInTheDocument();
    });

    it("shows 'Prepared Ingredients' section", async () => {
      await renderPrepTab();
      expect(screen.getByText(/Prepared Ingredients/i)).toBeInTheDocument();
    });

    it("shows 'Hot Section' section", async () => {
      await renderPrepTab();
      expect(screen.getByText(/Hot Section/i)).toBeInTheDocument();
    });

    it("shows 'Toppings & Flakes' section", async () => {
      await renderPrepTab();
      expect(screen.getByText(/Toppings & Flakes/i)).toBeInTheDocument();
    });

    it("shows 'Submit Backup' button", async () => {
      await renderPrepTab();
      expect(
        screen.getByRole("button", { name: /Submit Backup/i })
      ).toBeInTheDocument();
    });

    it("Submit Backup button is disabled when no items are filled", async () => {
      await renderPrepTab();
      expect(
        screen.getByRole("button", { name: /Submit Backup/i })
      ).toBeDisabled();
    });

    it("Submit Backup button becomes enabled after entering a value", async () => {
      await renderPrepTab();
      // Enter a value in the Soy Sauce field (first numeric input in Condiments section)
      const inputs = screen.getAllByPlaceholderText("—");
      fireEvent.change(inputs[0], { target: { value: "200" } });
      expect(
        screen.getByRole("button", { name: /Submit Backup/i })
      ).not.toBeDisabled();
    });

    it("shows 'N filled' badge when items are entered", async () => {
      await renderPrepTab();
      const inputs = screen.getAllByPlaceholderText("—");
      fireEvent.change(inputs[0], { target: { value: "100" } });
      await waitFor(() => {
        expect(screen.getByText(/1 filled/i)).toBeInTheDocument();
      });
    });

    it("shows '⚠ N below standard' badge when qty is below standard", async () => {
      await renderPrepTab();
      // Soy Sauce standard is 150 pcs. Enter 50 (below standard).
      const inputs = screen.getAllByPlaceholderText("—");
      fireEvent.change(inputs[0], { target: { value: "50" } });
      await waitFor(() => {
        // "below standard" appears in both the header badge and the submit area
        expect(screen.getAllByText(/below standard/i).length).toBeGreaterThanOrEqual(1);
      });
    });

    it("shows error 'Please enter your name' when name field is cleared", async () => {
      await renderPrepTab();
      const inputs = screen.getAllByPlaceholderText("—");
      fireEvent.change(inputs[0], { target: { value: "200" } });
      // Clear the name field
      const nameInput = screen.getByPlaceholderText(/Staff name/i);
      fireEvent.change(nameInput, { target: { value: "" } });
      fireEvent.click(screen.getByRole("button", { name: /Submit Backup/i }));
      await waitFor(() => {
        expect(screen.getByText(/Please enter your name/i)).toBeInTheDocument();
      });
    });

    it("clicking section header collapses the section", async () => {
      await renderPrepTab();
      // "Soy Sauce" is in the Condiments section; collapse it
      const condimentsBtn = screen.getByRole("button", {
        name: /Condiments & Supplies/i,
      });
      fireEvent.click(condimentsBtn);
      await waitFor(() => {
        // After collapse, "Soy Sauce" should not be visible in the DOM
        // (the section is hidden)
        expect(screen.queryByText("Soy Sauce")).not.toBeInTheDocument();
      });
    });

    it("clicking section header again re-expands it", async () => {
      await renderPrepTab();
      const condimentsBtn = screen.getByRole("button", {
        name: /Condiments & Supplies/i,
      });
      fireEvent.click(condimentsBtn);
      fireEvent.click(condimentsBtn);
      await waitFor(() => {
        expect(screen.getByText("Soy Sauce")).toBeInTheDocument();
      });
    });

    it("submits backup report calling POST /api/admin/backup/report", async () => {
      const fetchMock = makeFetch();
      await renderPrepTab(fetchMock);
      const inputs = screen.getAllByPlaceholderText("—");
      fireEvent.change(inputs[0], { target: { value: "200" } });
      fireEvent.click(screen.getByRole("button", { name: /Submit Backup/i }));
      await waitFor(() => {
        const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls;
        const backupCall = calls.find(
          (args: unknown[]) =>
            String(args[0]).includes("/backup/report") &&
            String((args[1] as RequestInit)?.method).toUpperCase() === "POST"
        );
        expect(backupCall).toBeTruthy();
      });
    });

    it("backup request body includes city=manila", async () => {
      const fetchMock = makeFetch();
      await renderPrepTab(fetchMock);
      const inputs = screen.getAllByPlaceholderText("—");
      fireEvent.change(inputs[0], { target: { value: "200" } });
      fireEvent.click(screen.getByRole("button", { name: /Submit Backup/i }));
      await waitFor(() => {
        const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls;
        const backupCall = calls.find((args: unknown[]) =>
          String(args[0]).includes("/backup/report")
        );
        const body = JSON.parse((backupCall![1] as RequestInit).body as string);
        expect(body.city).toBe("manila");
        expect(body.reported_by).toBe("Jay Test");
      });
    });

    it("shows success message after successful submission", async () => {
      await renderPrepTab();
      const inputs = screen.getAllByPlaceholderText("—");
      fireEvent.change(inputs[0], { target: { value: "200" } });
      fireEvent.click(screen.getByRole("button", { name: /Submit Backup/i }));
      await waitFor(() => {
        expect(
          screen.getByText(/Backup report submitted successfully/i)
        ).toBeInTheDocument();
      });
    });

    it("clears all filled values after successful submission", async () => {
      await renderPrepTab();
      const inputs = screen.getAllByPlaceholderText("—") as HTMLInputElement[];
      fireEvent.change(inputs[0], { target: { value: "200" } });
      fireEvent.click(screen.getByRole("button", { name: /Submit Backup/i }));
      await waitFor(() => {
        expect(screen.getByText(/submitted successfully/i)).toBeInTheDocument();
      });
      expect((screen.getAllByPlaceholderText("—")[0] as HTMLInputElement).value).toBe("");
    });

    it("shows error message on submission API failure", async () => {
      const fetchMock = makeFetch([
        {
          match: "/backup/report",
          method: "POST",
          status: 500,
          body: { detail: "Backup server error" },
        },
      ]);
      await renderPrepTab(fetchMock);
      const inputs = screen.getAllByPlaceholderText("—");
      fireEvent.change(inputs[0], { target: { value: "200" } });
      fireEvent.click(screen.getByRole("button", { name: /Submit Backup/i }));
      await waitFor(() => {
        expect(screen.getByText(/Backup server error/i)).toBeInTheDocument();
      });
    });

    it("Submit Backup button re-enables after error", async () => {
      const fetchMock = makeFetch([
        {
          match: "/backup/report",
          method: "POST",
          status: 500,
          body: { detail: "Error" },
        },
      ]);
      await renderPrepTab(fetchMock);
      const inputs = screen.getAllByPlaceholderText("—");
      fireEvent.change(inputs[0], { target: { value: "200" } });
      fireEvent.click(screen.getByRole("button", { name: /Submit Backup/i }));
      await waitFor(() => {
        expect(screen.getByText(/Error/i)).toBeInTheDocument();
      });
      expect(
        screen.getByRole("button", { name: /Submit Backup/i })
      ).not.toBeDisabled();
    });

    it("shows pct selector buttons (0%/25%/50%/75%/100%) for pct-type items", async () => {
      await renderPrepTab();
      // pct items (e.g. Quezo Cheese) show 0%/25%/50%/75%/100% buttons
      // These buttons are inside the "Prepared Ingredients" section
      const pctBtns = screen.getAllByRole("button", { name: /^0%$/ });
      expect(pctBtns.length).toBeGreaterThanOrEqual(1);
    });

    it("clicking a pct button selects it and enables submit", async () => {
      await renderPrepTab();
      const pct50Btns = screen.getAllByRole("button", { name: /^50%$/ });
      fireEvent.click(pct50Btns[0]);
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /Submit Backup/i })
        ).not.toBeDisabled();
      });
    });
  });
});
