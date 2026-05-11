// tests/admin/menu/menu-categories.test.tsx
// Tests for src/app/admin/menu/categories/page.tsx
// Covers: auth guard, city switcher, data loading, create form, edit form,
// delete, bulk actions, status tabs, error banner, pagination component.

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── next/navigation ────────────────────────────────────────────────────────────
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("city=dubai"),
  usePathname: () => "/admin/menu/categories",
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// ── auth ──────────────────────────────────────────────────────────────────────
let mockCanAccess = true;
const MENU_AUTH = {
  accessToken: "tok", role: "HQ", city: "manila",
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

// ── menuClient ────────────────────────────────────────────────────────────────
let mockMenuGet: ReturnType<typeof vi.fn>;
let mockMenuPost: ReturnType<typeof vi.fn>;
let mockMenuPatch: ReturnType<typeof vi.fn>;
let mockMenuGetText: ReturnType<typeof vi.fn>;

vi.mock("@/lib/menuClient", () => ({
  menuGet: (...args: any[]) => mockMenuGet(...args),
  menuPost: (...args: any[]) => mockMenuPost(...args),
  menuPatch: (...args: any[]) => mockMenuPatch(...args),
  menuGetText: (...args: any[]) => mockMenuGetText(...args),
}));

// ── child component stubs ─────────────────────────────────────────────────────
vi.mock("@/components/menu/MenuImportFailures", () => ({
  default: ({ failures }: { failures: any[] }) =>
    failures.length ? <div data-testid="import-failures">Import failures: {failures.length}</div> : null,
}));

vi.mock("@/components/menu/MenuPaginationControls", () => ({
  default: ({ page, total, hasPrev, hasNext, onPrev, onNext }: any) => (
    <div data-testid="pagination">
      <span>Page {page}</span>
      <span>Total {total}</span>
      {hasPrev && <button onClick={onPrev}>Prev</button>}
      {hasNext && <button onClick={onNext}>Next</button>}
    </div>
  ),
}));

// ── window.confirm ────────────────────────────────────────────────────────────
const mockConfirm = vi.fn(() => true);
Object.defineProperty(window, "confirm", { value: mockConfirm, writable: true });

// ── localStorage mock ─────────────────────────────────────────────────────────
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock });

// ── Sample data fixtures ───────────────────────────────────────────────────────
const CATEGORY_ROW = {
  id: "cat-1", city: "manila", name: "Sushi", name_localized: "寿司",
  reference: "SUS", image_url: "", sort_order: 1, status: "ACTIVE", product_count: 5,
};
const PAGINATED_EMPTY = { rows: [], total: 0, page: 1, page_size: 50, has_next: false, has_prev: false };
const PAGINATED_ONE = { rows: [CATEGORY_ROW], total: 1, page: 1, page_size: 50, has_next: false, has_prev: false };

// NOTE: The page has two elements saying "Categories":
//   - <h1>Categories</h1>  (page heading)
//   - <h2>Categories</h2>  (table panel heading)
// We use "New Category" (unique to the form panel) as the ready sentinel.
import MenuCategoriesPage from "@/app/admin/menu/categories/page";

// ════════════════════════════════════════════════════════════════════════════════
describe("MenuCategoriesPage — auth guard", () => {
  beforeEach(() => {
    mockCanAccess = true;
    mockMenuGet = vi.fn(async () => PAGINATED_EMPTY);
    mockMenuPost = vi.fn(async () => ({}));
    mockMenuPatch = vi.fn(async () => ({}));
    mockMenuGetText = vi.fn(async () => "");
  });

  it("shows permission error for unauthorized user", async () => {
    mockCanAccess = false;
    render(<MenuCategoriesPage />);
    await screen.findByText(/You do not have permission/i);
  });

  it("shows New Category form for authorized user", async () => {
    render(<MenuCategoriesPage />);
    // "New Category" is unique to the form panel — confirms page loaded and allowed
    await screen.findByText("New Category");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("MenuCategoriesPage — city switcher", () => {
  beforeEach(() => {
    mockCanAccess = true;
    mockMenuGet = vi.fn(async () => PAGINATED_EMPTY);
    mockMenuPost = vi.fn(async () => ({}));
    mockMenuPatch = vi.fn(async () => ({}));
  });

  it("renders manila and dubai city buttons", async () => {
    render(<MenuCategoriesPage />);
    await screen.findByText("New Category");
    expect(screen.getByRole("button", { name: "manila" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "dubai" })).toBeInTheDocument();
  });

  it("switching city triggers a new data load", async () => {
    render(<MenuCategoriesPage />);
    await screen.findByText("New Category");
    const callsBefore = mockMenuGet.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "dubai" }));
    await waitFor(() => {
      expect(mockMenuGet.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("MenuCategoriesPage — data loading", () => {
  beforeEach(() => {
    mockCanAccess = true;
    mockMenuPost = vi.fn(async () => ({}));
    mockMenuPatch = vi.fn(async () => ({}));
  });

  it("calls menuGet on mount with categories URL", async () => {
    mockMenuGet = vi.fn(async () => PAGINATED_EMPTY);
    render(<MenuCategoriesPage />);
    await screen.findByText("New Category");
    expect(mockMenuGet).toHaveBeenCalled();
    expect(mockMenuGet.mock.calls[0][0]).toContain("/api/admin/menu/categories");
  });

  it("renders category rows in table", async () => {
    mockMenuGet = vi.fn(async () => PAGINATED_ONE);
    render(<MenuCategoriesPage />);
    await screen.findByText("Sushi");
    expect(screen.getByText("SUS")).toBeInTheDocument();
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
  });

  it("shows 'No categories found.' when rows is empty", async () => {
    mockMenuGet = vi.fn(async () => PAGINATED_EMPTY);
    render(<MenuCategoriesPage />);
    await screen.findByText("No categories found.");
  });

  it("shows error banner when API fails", async () => {
    mockMenuGet = vi.fn(async () => { throw new Error("Categories API error"); });
    render(<MenuCategoriesPage />);
    await screen.findByText(/Categories API error/i);
  });

  it("shows total count in stats strip", async () => {
    mockMenuGet = vi.fn(async () => PAGINATED_ONE);
    render(<MenuCategoriesPage />);
    await screen.findByText("Sushi");
    // Stats strip — "Total" label + value "1"
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
  });

  it("shows pagination component", async () => {
    mockMenuGet = vi.fn(async () => PAGINATED_ONE);
    render(<MenuCategoriesPage />);
    await screen.findByText("Sushi");
    expect(screen.getByTestId("pagination")).toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("MenuCategoriesPage — create form", () => {
  beforeEach(() => {
    mockCanAccess = true;
    mockMenuGet = vi.fn(async () => PAGINATED_EMPTY);
    mockMenuPost = vi.fn(async () => ({}));
    mockMenuPatch = vi.fn(async () => ({}));
  });

  it("shows 'New Category' form panel by default", async () => {
    render(<MenuCategoriesPage />);
    await screen.findByText("New Category");
    expect(screen.getByText("Create Category")).toBeInTheDocument();
  });

  it("shows error when name is empty on save", async () => {
    render(<MenuCategoriesPage />);
    await screen.findByText("Create Category");
    fireEvent.click(screen.getByText("Create Category"));
    await screen.findByText(/Please enter category name/i);
  });

  it("calls menuPost when creating category with a name", async () => {
    render(<MenuCategoriesPage />);
    await screen.findByText("Create Category");
    const nameInput = screen.getAllByRole("textbox")[0];
    fireEvent.change(nameInput, { target: { value: "Rolls" } });
    fireEvent.click(screen.getByText("Create Category"));
    await waitFor(() => {
      expect(mockMenuPost).toHaveBeenCalledWith(
        "/api/admin/menu/categories",
        expect.objectContaining({ name: "Rolls" }),
      );
    });
  });

  it("shows success message after successful create", async () => {
    render(<MenuCategoriesPage />);
    await screen.findByText("Create Category");
    const nameInput = screen.getAllByRole("textbox")[0];
    fireEvent.change(nameInput, { target: { value: "Nigiri" } });
    fireEvent.click(screen.getByText("Create Category"));
    await screen.findByText(/Category created/i);
  });

  it("shows error banner when create API fails", async () => {
    mockMenuPost = vi.fn(async () => { throw new Error("Create failed"); });
    render(<MenuCategoriesPage />);
    await screen.findByText("Create Category");
    const nameInput = screen.getAllByRole("textbox")[0];
    fireEvent.change(nameInput, { target: { value: "Rolls" } });
    fireEvent.click(screen.getByText("Create Category"));
    await screen.findByText(/Create failed/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("MenuCategoriesPage — edit form", () => {
  beforeEach(() => {
    mockCanAccess = true;
    mockMenuGet = vi.fn(async () => PAGINATED_ONE);
    mockMenuPost = vi.fn(async () => ({}));
    mockMenuPatch = vi.fn(async () => ({}));
  });

  it("clicking Edit fills form and switches to 'Edit Category' mode", async () => {
    render(<MenuCategoriesPage />);
    await screen.findByText("Sushi");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await screen.findByText("Edit Category");
    const nameInput = screen.getAllByRole("textbox")[0];
    expect((nameInput as HTMLInputElement).value).toBe("Sushi");
  });

  it("'+ New' button resets form to New Category mode", async () => {
    render(<MenuCategoriesPage />);
    await screen.findByText("Sushi");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await screen.findByText("Edit Category");
    fireEvent.click(screen.getByRole("button", { name: "+ New" }));
    await screen.findByText("New Category");
  });

  it("calls menuPatch when saving edited category", async () => {
    render(<MenuCategoriesPage />);
    await screen.findByText("Sushi");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await screen.findByText("Edit Category");
    fireEvent.click(screen.getByText("Save Changes"));
    await waitFor(() => {
      expect(mockMenuPatch).toHaveBeenCalledWith(
        expect.stringContaining("/api/admin/menu/categories/cat-1"),
        expect.objectContaining({ name: "Sushi" }),
      );
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("MenuCategoriesPage — delete", () => {
  beforeEach(() => {
    mockCanAccess = true;
    mockMenuGet = vi.fn(async () => PAGINATED_ONE);
    mockMenuPost = vi.fn(async () => ({}));
    mockMenuPatch = vi.fn(async () => ({}));
    mockConfirm.mockReset();
  });

  it("clicking Delete calls window.confirm", async () => {
    mockConfirm.mockReturnValue(true);
    render(<MenuCategoriesPage />);
    await screen.findByText("Sushi");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalledWith("Delete this category?");
    });
  });

  it("confirmed delete calls menuPost with /delete endpoint", async () => {
    mockConfirm.mockReturnValue(true);
    render(<MenuCategoriesPage />);
    await screen.findByText("Sushi");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(mockMenuPost).toHaveBeenCalledWith(
        expect.stringContaining("/delete"),
        expect.any(Object),
      );
    });
  });

  it("cancelled delete does NOT call menuPost", async () => {
    mockConfirm.mockReturnValue(false);
    render(<MenuCategoriesPage />);
    await screen.findByText("Sushi");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    expect(mockMenuPost).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("MenuCategoriesPage — bulk actions", () => {
  beforeEach(() => {
    mockCanAccess = true;
    mockMenuGet = vi.fn(async () => PAGINATED_ONE);
    mockMenuPost = vi.fn(async () => ({ success_count: 1, failed_count: 0 }));
    mockMenuPatch = vi.fn(async () => ({}));
  });

  it("'Apply' button is disabled when no rows selected", async () => {
    render(<MenuCategoriesPage />);
    await screen.findByText("Sushi");
    const applyBtn = screen.getByRole("button", { name: /Apply/i });
    expect(applyBtn).toBeDisabled();
  });

  it("selecting a row enables the Apply button", async () => {
    render(<MenuCategoriesPage />);
    await screen.findByText("Sushi");
    const checkboxes = screen.getAllByRole("checkbox");
    // First checkbox = select-all; second = row checkbox
    fireEvent.click(checkboxes[1]);
    await waitFor(() => {
      const applyBtn = screen.getByRole("button", { name: /Apply \(1\)/i });
      expect(applyBtn).not.toBeDisabled();
    });
  });

  it("'select all' checkbox selects all rows", async () => {
    render(<MenuCategoriesPage />);
    await screen.findByText("Sushi");
    fireEvent.click(screen.getAllByRole("checkbox")[0]); // select-all
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Apply \(1\)/i })).not.toBeDisabled();
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
describe("MenuCategoriesPage — status tabs", () => {
  beforeEach(() => {
    mockCanAccess = true;
    mockMenuGet = vi.fn(async () => PAGINATED_EMPTY);
    mockMenuPost = vi.fn(async () => ({}));
    mockMenuPatch = vi.fn(async () => ({}));
  });

  it("renders 'All' and 'Deleted' tabs", async () => {
    render(<MenuCategoriesPage />);
    await screen.findByText("New Category");
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deleted" })).toBeInTheDocument();
  });

  it("clicking Deleted tab triggers reload with tab=DELETED", async () => {
    render(<MenuCategoriesPage />);
    await screen.findByText("New Category");
    const callsBefore = mockMenuGet.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Deleted" }));
    await waitFor(() => {
      expect(mockMenuGet.mock.calls.length).toBeGreaterThan(callsBefore);
    });
    const latestCall = mockMenuGet.mock.calls[mockMenuGet.mock.calls.length - 1][0] as string;
    expect(latestCall).toContain("tab=DELETED");
  });
});
