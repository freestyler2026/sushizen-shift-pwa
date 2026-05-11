// tests/admin/menu/menu-pages.test.tsx
// Tests for:
//   Products  (src/app/admin/menu/products/page.tsx)
//   Tags      (src/app/admin/menu/tags/page.tsx)
//   Modifier Groups  (src/app/admin/menu/modifier-groups/page.tsx)
//   Modifier Options (src/app/admin/menu/modifier-options/page.tsx)
//   Groups    (src/app/admin/menu/groups/page.tsx)
//   Combos    (src/app/admin/menu/combos/page.tsx)
//
// NOTE on heading duplication: every page has both <h1>PageName</h1> AND
// <h2>PageName</h2> (the table panel heading).  To avoid "multiple elements"
// errors we anchor on the FORM PANEL title which is unique:
//   Products → "New Product"  Tags → "New Tag"  Groups → "New Group"
//   Modifier Groups → "New Modifier Group"   Modifier Options → "New Modifier Option"
//   Combos → "New Combo"
//
// Products Edit navigates to /admin/menu/products/[id] via router.push —
// there is NO in-page "Edit Product" mode.  Delete button is "✕" (not "Delete").

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── next/navigation ────────────────────────────────────────────────────────────
const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => new URLSearchParams("city=dubai"),
  usePathname: () => "/admin/menu/products",
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
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
    failures.length ? <div data-testid="import-failures">{failures.length} failures</div> : null,
}));

vi.mock("@/components/menu/MenuPaginationControls", () => ({
  default: ({ page, total }: any) => (
    <div data-testid="pagination">Page {page} / {total}</div>
  ),
}));

vi.mock("@/components/menu/IngredientItemSearch", () => ({
  default: ({ onSelect }: any) => (
    <div data-testid="ingredient-search">
      <button type="button" onClick={() => onSelect({ id: "ing-1", name: "Tuna", sku: "TUN001", storage_unit: "g", ingredient_unit: "g", cost: 5 })}>
        Select Tuna
      </button>
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

// ── Common fixtures ────────────────────────────────────────────────────────────
const PAGED_EMPTY = { rows: [], total: 0, page: 1, page_size: 50, has_next: false, has_prev: false };
const CATEGORY_ROW = { id: "cat-1", city: "dubai", name: "Sushi", status: "ACTIVE" };

const PRODUCT_ROW = {
  id: "prod-1", city: "dubai", category_id: "cat-1", category_name: "Sushi",
  name: "Salmon Nigiri", name_localized: "", sku: "SN001", barcode: "", image_url: "",
  description: "", price: 45, pricing_method: "FIXED_PRICE", selling_method: "UNIT",
  costing_method: "FROM_INGREDIENTS", fixed_cost: 0, tax_group_id: "", preparation_time: 0,
  walk_time: 0, calories: 0, high_salt_content: false, sort_order: 1, status: "ACTIVE",
};

const TAG_ROW = {
  id: "tag-1", city: "dubai", name: "Bestseller", name_localized: "",
  reference: "BEST", color: "#A16207", status: "ACTIVE", sort_order: 1, usage_count: 10,
};

const MODIFIER_GROUP_ROW = {
  id: "mg-1", city: "dubai", name: "Sauce Options", name_localized: "", reference: "SAUCE",
  description: "", status: "ACTIVE", option_count: 3, linked_product_count: 5, sort_order: 1,
};

const MODIFIER_OPTION_ROW = {
  id: "mo-1", city: "dubai", modifier_group_id: "mg-1", modifier_group_name: "Sauce Options",
  name: "Soy Sauce", name_localized: "", sku: "", barcode: "", image_url: "", description: "",
  price_delta: 0, costing_method: "FIXED_COST", fixed_cost: 0, tax_group_id: "",
  calories: 0, status: "ACTIVE", sort_order: 1,
};

const GROUP_ROW = {
  id: "grp-1", city: "dubai", name: "Lunch Set", name_localized: "", reference: "LS",
  description: "", status: "ACTIVE", sort_order: 1, product_count: 3, combo_count: 1,
};

const COMBO_ROW = {
  id: "cmb-1", city: "dubai", name: "Party Pack", name_localized: "", sku: "PP001",
  barcode: "", image_url: "", description: "", price: 120, pricing_method: "FIXED_PRICE",
  costing_method: "FROM_INGREDIENTS", fixed_cost: 0, status: "ACTIVE", sort_order: 1,
  product_count: 4,
};

// ── page imports ──────────────────────────────────────────────────────────────
import MenuProductsPage from "@/app/admin/menu/products/page";
import MenuTagsPage from "@/app/admin/menu/tags/page";
import MenuModifierGroupsPage from "@/app/admin/menu/modifier-groups/page";
import MenuModifierOptionsPage from "@/app/admin/menu/modifier-options/page";
import MenuGroupsPage from "@/app/admin/menu/groups/page";
import MenuCombosPage from "@/app/admin/menu/combos/page";

// ── Products menuGet mock helper ───────────────────────────────────────────────
function makeProductsGet(rows: any[] = []) {
  return vi.fn(async (url: string) => {
    if (url.includes("/sku/next")) return { sku: "SN002" };
    if (url.includes("/categories")) return { rows: [CATEGORY_ROW], total: 1, page: 1, page_size: 500, has_next: false, has_prev: false };
    if (url.includes("/products")) return { rows, total: rows.length, page: 1, page_size: 50, has_next: false, has_prev: false };
    return PAGED_EMPTY;
  });
}

// ════════════════════════════════════════════════════════════════════════════════
// ── PRODUCTS ─────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════════
describe("MenuProductsPage — auth guard", () => {
  beforeEach(() => {
    mockMenuPost = vi.fn(async () => ({}));
    mockMenuPatch = vi.fn(async () => ({}));
    mockMenuGetText = vi.fn(async () => "");
  });

  it("shows permission error when user lacks menu access", async () => {
    mockCanAccess = false;
    mockMenuGet = makeProductsGet();
    render(<MenuProductsPage />);
    await screen.findByText(/You do not have permission/i);
    mockCanAccess = true;
  });

  it("shows 'New Product' form for authorized user", async () => {
    mockCanAccess = true;
    mockMenuGet = makeProductsGet();
    render(<MenuProductsPage />);
    // "New Product" is unique — the form panel heading
    await screen.findByText("New Product");
  });
});

describe("MenuProductsPage — data loading", () => {
  beforeEach(() => {
    mockCanAccess = true;
    mockMenuPost = vi.fn(async () => ({}));
    mockMenuPatch = vi.fn(async () => ({}));
    mockMenuGetText = vi.fn(async () => "");
  });

  it("renders product rows in table", async () => {
    mockMenuGet = makeProductsGet([PRODUCT_ROW]);
    render(<MenuProductsPage />);
    await screen.findByText("Salmon Nigiri");
    expect(screen.getByText("SN001")).toBeInTheDocument();
  });

  it("shows 'No products found.' when rows are empty", async () => {
    mockMenuGet = makeProductsGet([]);
    render(<MenuProductsPage />);
    await screen.findByText("No products found.");
  });

  it("shows error banner when products API fails", async () => {
    mockMenuGet = vi.fn(async (url: string) => {
      if (url.includes("/sku/next")) return { sku: "" };
      if (url.includes("/categories")) return { rows: [CATEGORY_ROW], total: 1, page: 1, page_size: 500, has_next: false, has_prev: false };
      throw new Error("Products API error");
    });
    render(<MenuProductsPage />);
    await screen.findByText(/Products API error/i);
  });

  it("calls SKU next endpoint on mount", async () => {
    const mockGet = makeProductsGet();
    mockMenuGet = mockGet;
    render(<MenuProductsPage />);
    await screen.findByText("New Product");
    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining("/sku/next"));
  });
});

describe("MenuProductsPage — form validation", () => {
  beforeEach(() => {
    mockCanAccess = true;
    mockMenuGet = makeProductsGet();
    mockMenuPost = vi.fn(async () => ({}));
    mockMenuPatch = vi.fn(async () => ({}));
  });

  it("shows error when trying to create product without name", async () => {
    render(<MenuProductsPage />);
    await screen.findByText("Create Product");
    fireEvent.click(screen.getByText("Create Product"));
    await screen.findByText(/Please enter product name/i);
  });

  it("shows error when category is not selected", async () => {
    // Make categories return empty so no category_id is pre-selected
    mockMenuGet = vi.fn(async (url: string) => {
      if (url.includes("/sku/next")) return { sku: "SN002" };
      if (url.includes("/categories")) return { rows: [], total: 0, page: 1, page_size: 500, has_next: false, has_prev: false };
      return PAGED_EMPTY;
    });
    render(<MenuProductsPage />);
    await screen.findByText("Create Product");
    const nameInput = screen.getAllByRole("textbox")[0];
    fireEvent.change(nameInput, { target: { value: "Test Product" } });
    fireEvent.click(screen.getByText("Create Product"));
    await screen.findByText(/Please select category/i);
  });
});

describe("MenuProductsPage — product row actions", () => {
  beforeEach(() => {
    mockCanAccess = true;
    mockMenuGet = makeProductsGet([PRODUCT_ROW]);
    mockMenuPost = vi.fn(async () => ({}));
    mockMenuPatch = vi.fn(async () => ({}));
    mockPush.mockReset();
  });

  it("clicking Edit navigates to product detail page via router.push", async () => {
    render(<MenuProductsPage />);
    await screen.findByText("Salmon Nigiri");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("/admin/menu/products/prod-1"),
    );
  });

  it("Delete button (✕) triggers confirm dialog for ACTIVE product", async () => {
    mockConfirm.mockReturnValue(false);
    render(<MenuProductsPage />);
    await screen.findByText("Salmon Nigiri");
    // Delete button text is "✕" for non-deleted rows
    fireEvent.click(screen.getByRole("button", { name: "✕" }));
    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalledWith("Delete this product?");
    });
  });

  it("'Off' button sets product status to INACTIVE", async () => {
    render(<MenuProductsPage />);
    await screen.findByText("Salmon Nigiri");
    fireEvent.click(screen.getByRole("button", { name: "Off" }));
    await waitFor(() => {
      expect(mockMenuPost).toHaveBeenCalledWith(
        expect.stringContaining("/status"),
        expect.objectContaining({ status: "INACTIVE" }),
      );
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// ── TAGS ─────────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════════
describe("MenuTagsPage — auth guard", () => {
  beforeEach(() => {
    mockMenuPost = vi.fn(async () => ({}));
    mockMenuPatch = vi.fn(async () => ({}));
    mockMenuGetText = vi.fn(async () => "");
  });

  it("shows permission error when user lacks access", async () => {
    mockCanAccess = false;
    mockMenuGet = vi.fn(async () => PAGED_EMPTY);
    render(<MenuTagsPage />);
    await screen.findByText(/You do not have permission/i);
    mockCanAccess = true;
  });

  it("shows 'New Tag' form for authorized user", async () => {
    mockCanAccess = true;
    mockMenuGet = vi.fn(async () => PAGED_EMPTY);
    render(<MenuTagsPage />);
    await screen.findByText("New Tag");
  });
});

describe("MenuTagsPage — data loading", () => {
  beforeEach(() => {
    mockCanAccess = true;
    mockMenuPost = vi.fn(async () => ({}));
    mockMenuPatch = vi.fn(async () => ({}));
    mockMenuGetText = vi.fn(async () => "");
  });

  it("renders tag rows in table", async () => {
    mockMenuGet = vi.fn(async () => ({ rows: [TAG_ROW], total: 1, page: 1, page_size: 50, has_next: false, has_prev: false }));
    render(<MenuTagsPage />);
    await screen.findByText("Bestseller");
    expect(screen.getByText("BEST")).toBeInTheDocument();
  });

  it("shows 'No tags found.' when rows are empty", async () => {
    mockMenuGet = vi.fn(async () => PAGED_EMPTY);
    render(<MenuTagsPage />);
    await screen.findByText("No tags found.");
  });

  it("shows error banner when tags API fails", async () => {
    mockMenuGet = vi.fn(async () => { throw new Error("Tags API error"); });
    render(<MenuTagsPage />);
    await screen.findByText(/Tags API error/i);
  });
});

describe("MenuTagsPage — create form", () => {
  beforeEach(() => {
    mockCanAccess = true;
    mockMenuGet = vi.fn(async () => PAGED_EMPTY);
    mockMenuPost = vi.fn(async () => ({}));
    mockMenuPatch = vi.fn(async () => ({}));
  });

  it("shows 'New Tag' form panel with Create Tag button", async () => {
    render(<MenuTagsPage />);
    await screen.findByText("New Tag");
    expect(screen.getByText("Create Tag")).toBeInTheDocument();
  });

  it("shows error when name is empty on save", async () => {
    render(<MenuTagsPage />);
    await screen.findByText("Create Tag");
    fireEvent.click(screen.getByText("Create Tag"));
    await screen.findByText(/Please enter tag name/i);
  });

  it("calls menuPost with correct payload on valid create", async () => {
    render(<MenuTagsPage />);
    await screen.findByText("Create Tag");
    const nameInput = screen.getAllByRole("textbox")[0];
    fireEvent.change(nameInput, { target: { value: "New Tag Name" } });
    fireEvent.click(screen.getByText("Create Tag"));
    await waitFor(() => {
      expect(mockMenuPost).toHaveBeenCalledWith(
        "/api/admin/menu/tags",
        expect.objectContaining({ name: "New Tag Name" }),
      );
    });
  });

  it("shows success message after creating tag", async () => {
    render(<MenuTagsPage />);
    await screen.findByText("Create Tag");
    const nameInput = screen.getAllByRole("textbox")[0];
    fireEvent.change(nameInput, { target: { value: "Vegan" } });
    fireEvent.click(screen.getByText("Create Tag"));
    await screen.findByText(/Tag created/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// ── MODIFIER GROUPS ────────────────────────────────────────────────────────────
// BUG FIXED: button was "Create Group" → now "Create Modifier Group"
// ════════════════════════════════════════════════════════════════════════════════
describe("MenuModifierGroupsPage — auth guard", () => {
  beforeEach(() => {
    mockMenuPost = vi.fn(async () => ({}));
    mockMenuPatch = vi.fn(async () => ({}));
    mockMenuGetText = vi.fn(async () => "");
  });

  it("shows permission error for unauthorized user", async () => {
    mockCanAccess = false;
    mockMenuGet = vi.fn(async () => PAGED_EMPTY);
    render(<MenuModifierGroupsPage />);
    await screen.findByText(/You do not have permission/i);
    mockCanAccess = true;
  });

  it("shows 'New Modifier Group' form for authorized user", async () => {
    mockCanAccess = true;
    mockMenuGet = vi.fn(async () => PAGED_EMPTY);
    render(<MenuModifierGroupsPage />);
    await screen.findByText("New Modifier Group");
  });
});

describe("MenuModifierGroupsPage — data loading", () => {
  beforeEach(() => {
    mockCanAccess = true;
    mockMenuPost = vi.fn(async () => ({}));
    mockMenuPatch = vi.fn(async () => ({}));
    mockMenuGetText = vi.fn(async () => "");
  });

  it("renders modifier group rows", async () => {
    mockMenuGet = vi.fn(async () => ({ rows: [MODIFIER_GROUP_ROW], total: 1, page: 1, page_size: 50, has_next: false, has_prev: false }));
    render(<MenuModifierGroupsPage />);
    await screen.findByText("Sauce Options");
    expect(screen.getByText("SAUCE")).toBeInTheDocument();
  });

  it("shows 'No modifier groups found.' when empty", async () => {
    mockMenuGet = vi.fn(async () => PAGED_EMPTY);
    render(<MenuModifierGroupsPage />);
    await screen.findByText("No modifier groups found.");
  });

  it("shows error banner when API fails", async () => {
    mockMenuGet = vi.fn(async () => { throw new Error("Modifier groups API error"); });
    render(<MenuModifierGroupsPage />);
    await screen.findByText(/Modifier groups API error/i);
  });
});

describe("MenuModifierGroupsPage — form", () => {
  beforeEach(() => {
    mockCanAccess = true;
    mockMenuGet = vi.fn(async () => PAGED_EMPTY);
    mockMenuPost = vi.fn(async () => ({}));
    mockMenuPatch = vi.fn(async () => ({}));
  });

  it("shows 'Create Modifier Group' button", async () => {
    render(<MenuModifierGroupsPage />);
    await screen.findByText("Create Modifier Group");
  });

  it("shows name required error on empty create", async () => {
    render(<MenuModifierGroupsPage />);
    await screen.findByText("Create Modifier Group");
    fireEvent.click(screen.getByText("Create Modifier Group"));
    await screen.findByText(/Please enter modifier group name/i);
  });

  it("calls menuPost with correct data on valid create", async () => {
    render(<MenuModifierGroupsPage />);
    await screen.findByText("Create Modifier Group");
    const nameInput = screen.getAllByRole("textbox")[0];
    fireEvent.change(nameInput, { target: { value: "Rice Options" } });
    fireEvent.click(screen.getByText("Create Modifier Group"));
    await waitFor(() => {
      expect(mockMenuPost).toHaveBeenCalledWith(
        "/api/admin/menu/modifier-groups",
        expect.objectContaining({ name: "Rice Options" }),
      );
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// ── MODIFIER OPTIONS ────────────────────────────────────────────────────────────
// BUG FIXED: button was "Create Option" → now "Create Modifier Option"
// ════════════════════════════════════════════════════════════════════════════════
const MODIFIER_GROUPS_PAGED = {
  rows: [{ id: "mg-1", name: "Sauce Options", status: "ACTIVE" }],
  total: 1, page: 1, page_size: 500, has_next: false, has_prev: false,
};

function makeModifierOptionsGet(optionRows: any[] = []) {
  return vi.fn(async (url: string) => {
    if (url.includes("/modifier-groups") && !url.includes("modifier-options")) {
      return MODIFIER_GROUPS_PAGED;
    }
    return { rows: optionRows, total: optionRows.length, page: 1, page_size: 50, has_next: false, has_prev: false };
  });
}

describe("MenuModifierOptionsPage — auth guard", () => {
  beforeEach(() => {
    mockMenuPost = vi.fn(async () => ({}));
    mockMenuPatch = vi.fn(async () => ({}));
    mockMenuGetText = vi.fn(async () => "");
  });

  it("shows permission error for unauthorized user", async () => {
    mockCanAccess = false;
    mockMenuGet = makeModifierOptionsGet();
    render(<MenuModifierOptionsPage />);
    await screen.findByText(/You do not have permission/i);
    mockCanAccess = true;
  });

  it("shows 'New Modifier Option' form for authorized user", async () => {
    mockCanAccess = true;
    mockMenuGet = makeModifierOptionsGet();
    render(<MenuModifierOptionsPage />);
    await screen.findByText("New Modifier Option");
  });
});

describe("MenuModifierOptionsPage — data loading", () => {
  beforeEach(() => {
    mockCanAccess = true;
    mockMenuPost = vi.fn(async () => ({}));
    mockMenuPatch = vi.fn(async () => ({}));
    mockMenuGetText = vi.fn(async () => "");
  });

  it("renders modifier option rows in table", async () => {
    mockMenuGet = makeModifierOptionsGet([MODIFIER_OPTION_ROW]);
    render(<MenuModifierOptionsPage />);
    // Table rows for "Soy Sauce" — use getAllByText since it also appears in filter dropdown
    await waitFor(() => {
      expect(screen.getAllByText("Soy Sauce").length).toBeGreaterThan(0);
    });
  });

  it("shows 'No modifier options found.' when empty", async () => {
    mockMenuGet = makeModifierOptionsGet();
    render(<MenuModifierOptionsPage />);
    await screen.findByText("No modifier options found.");
  });

  it("shows error banner when API fails", async () => {
    mockMenuGet = vi.fn(async (url: string) => {
      if (url.includes("/modifier-groups") && !url.includes("options")) return MODIFIER_GROUPS_PAGED;
      throw new Error("Modifier options API error");
    });
    render(<MenuModifierOptionsPage />);
    await screen.findByText(/Modifier options API error/i);
  });
});

describe("MenuModifierOptionsPage — form", () => {
  beforeEach(() => {
    mockCanAccess = true;
    mockMenuGet = makeModifierOptionsGet();
    mockMenuPost = vi.fn(async () => ({}));
    mockMenuPatch = vi.fn(async () => ({}));
  });

  it("shows 'Create Modifier Option' button", async () => {
    render(<MenuModifierOptionsPage />);
    await screen.findByText("Create Modifier Option");
  });

  it("shows group required error when no group is selected", async () => {
    render(<MenuModifierOptionsPage />);
    await screen.findByText("Create Modifier Option");
    // Click save before groups load — modifier_group_id is empty → group required error
    fireEvent.click(screen.getByText("Create Modifier Option"));
    await screen.findByText(/Please select modifier group/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// ── GROUPS ────────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════════
describe("MenuGroupsPage — auth guard", () => {
  beforeEach(() => {
    mockMenuPost = vi.fn(async () => ({}));
    mockMenuPatch = vi.fn(async () => ({}));
    mockMenuGetText = vi.fn(async () => "");
  });

  it("shows permission error for unauthorized user", async () => {
    mockCanAccess = false;
    mockMenuGet = vi.fn(async () => PAGED_EMPTY);
    render(<MenuGroupsPage />);
    await screen.findByText(/You do not have permission/i);
    mockCanAccess = true;
  });

  it("shows 'New Group' form for authorized user", async () => {
    mockCanAccess = true;
    mockMenuGet = vi.fn(async () => PAGED_EMPTY);
    render(<MenuGroupsPage />);
    await screen.findByText("New Group");
  });
});

describe("MenuGroupsPage — data loading", () => {
  beforeEach(() => {
    mockCanAccess = true;
    mockMenuPost = vi.fn(async () => ({}));
    mockMenuPatch = vi.fn(async () => ({}));
    mockMenuGetText = vi.fn(async () => "");
  });

  it("renders group rows in table", async () => {
    mockMenuGet = vi.fn(async () => ({ rows: [GROUP_ROW], total: 1, page: 1, page_size: 50, has_next: false, has_prev: false }));
    render(<MenuGroupsPage />);
    await screen.findByText("Lunch Set");
    expect(screen.getByText("LS")).toBeInTheDocument();
  });

  it("shows 'No groups found.' when rows are empty", async () => {
    mockMenuGet = vi.fn(async () => PAGED_EMPTY);
    render(<MenuGroupsPage />);
    await screen.findByText("No groups found.");
  });

  it("shows error banner when API fails", async () => {
    mockMenuGet = vi.fn(async () => { throw new Error("Groups API error"); });
    render(<MenuGroupsPage />);
    await screen.findByText(/Groups API error/i);
  });
});

describe("MenuGroupsPage — form", () => {
  beforeEach(() => {
    mockCanAccess = true;
    mockMenuGet = vi.fn(async () => PAGED_EMPTY);
    mockMenuPost = vi.fn(async () => ({}));
    mockMenuPatch = vi.fn(async () => ({}));
  });

  it("shows name required error on empty create", async () => {
    render(<MenuGroupsPage />);
    await screen.findByText("Create Group");
    fireEvent.click(screen.getByText("Create Group"));
    await screen.findByText(/Please enter group name/i);
  });

  it("calls menuPost when creating a group", async () => {
    render(<MenuGroupsPage />);
    await screen.findByText("Create Group");
    const nameInput = screen.getAllByRole("textbox")[0];
    fireEvent.change(nameInput, { target: { value: "Dinner Set" } });
    fireEvent.click(screen.getByText("Create Group"));
    await waitFor(() => {
      expect(mockMenuPost).toHaveBeenCalledWith(
        "/api/admin/menu/groups",
        expect.objectContaining({ name: "Dinner Set" }),
      );
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// ── COMBOS ────────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════════
describe("MenuCombosPage — auth guard", () => {
  beforeEach(() => {
    mockMenuPost = vi.fn(async () => ({}));
    mockMenuPatch = vi.fn(async () => ({}));
    mockMenuGetText = vi.fn(async () => "");
  });

  it("shows permission error for unauthorized user", async () => {
    mockCanAccess = false;
    mockMenuGet = vi.fn(async () => PAGED_EMPTY);
    render(<MenuCombosPage />);
    await screen.findByText(/You do not have permission/i);
    mockCanAccess = true;
  });

  it("shows 'New Combo' form for authorized user", async () => {
    mockCanAccess = true;
    mockMenuGet = vi.fn(async () => PAGED_EMPTY);
    render(<MenuCombosPage />);
    await screen.findByText("New Combo");
  });
});

describe("MenuCombosPage — data loading", () => {
  beforeEach(() => {
    mockCanAccess = true;
    mockMenuPost = vi.fn(async () => ({}));
    mockMenuPatch = vi.fn(async () => ({}));
    mockMenuGetText = vi.fn(async () => "");
  });

  it("renders combo rows in table", async () => {
    mockMenuGet = vi.fn(async () => ({ rows: [COMBO_ROW], total: 1, page: 1, page_size: 50, has_next: false, has_prev: false }));
    render(<MenuCombosPage />);
    await screen.findByText("Party Pack");
    expect(screen.getByText("PP001")).toBeInTheDocument();
  });

  it("shows 'No combos found.' when rows are empty", async () => {
    mockMenuGet = vi.fn(async () => PAGED_EMPTY);
    render(<MenuCombosPage />);
    await screen.findByText("No combos found.");
  });

  it("shows error banner when API fails", async () => {
    mockMenuGet = vi.fn(async () => { throw new Error("Combos API error"); });
    render(<MenuCombosPage />);
    await screen.findByText(/Combos API error/i);
  });
});

describe("MenuCombosPage — form", () => {
  beforeEach(() => {
    mockCanAccess = true;
    mockMenuPost = vi.fn(async () => ({}));
    mockMenuPatch = vi.fn(async () => ({}));
  });

  it("shows name required error on empty create", async () => {
    mockMenuGet = vi.fn(async () => PAGED_EMPTY);
    render(<MenuCombosPage />);
    await screen.findByText("Create Combo");
    fireEvent.click(screen.getByText("Create Combo"));
    await screen.findByText(/Please enter combo name/i);
  });

  it("calls menuPost when creating a combo with name", async () => {
    mockMenuGet = vi.fn(async () => PAGED_EMPTY);
    render(<MenuCombosPage />);
    await screen.findByText("Create Combo");
    const nameInput = screen.getAllByRole("textbox")[0];
    fireEvent.change(nameInput, { target: { value: "Family Pack" } });
    fireEvent.click(screen.getByText("Create Combo"));
    await waitFor(() => {
      expect(mockMenuPost).toHaveBeenCalledWith(
        "/api/admin/menu/combos",
        expect.objectContaining({ name: "Family Pack" }),
      );
    });
  });

  it("Delete combo button triggers confirm dialog", async () => {
    mockMenuGet = vi.fn(async () => ({ rows: [COMBO_ROW], total: 1, page: 1, page_size: 50, has_next: false, has_prev: false }));
    render(<MenuCombosPage />);
    await screen.findByText("Party Pack");
    mockConfirm.mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalledWith("Delete this combo?");
    });
  });
});
