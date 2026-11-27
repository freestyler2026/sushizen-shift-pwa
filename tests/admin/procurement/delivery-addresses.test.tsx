/**
 * Purchasing, 2026-11-27: Manila's Lion Tower address was saved as
 * "WEAREHOUSE"; requests are filed under "WH", so no PO used it and they took
 * Dubai's Warehouse address. The branch is now picked from the city's list,
 * and a row whose code names no branch says it is not used.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lucideMock } from "../../lucide-mock";

vi.mock("lucide-react", () => lucideMock());
vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ staffName: "Yuri Yamada", role: "HQ", accessToken: "t" }),
  getAuthHeaders: () => ({}),
  refreshAuthFromApi: async () => null,
}));

const MANILA = {
  rows: [
    { id: "1", city: "manila", store_code: "WEAREHOUSE", display_name: "WH", address: "Lion Tower", active: true, updated_at: "", branch: "" },
    { id: "2", city: "manila", store_code: "TAFT", display_name: "Taft", address: "Sundry Taft", active: true, updated_at: "", branch: "Taft" },
  ],
  store_codes: { manila: [{ code: "PAR", branch: "Paranaque" }, { code: "WH", branch: "Warehouse (WH)" }] },
};

afterEach(() => { vi.unstubAllGlobals(); });

describe("Branch Delivery Addresses", () => {
  it("says which rows no PO uses, and offers the city's branches to add", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => MANILA, text: async () => "" })));
    const { default: Page } = await import("@/app/admin/procurement/delivery-addresses/page");
    render(<Page />);
    fireEvent.click(screen.getAllByText("Dubai")[0]);
    fireEvent.click(await screen.findByText("Manila"));
    const used = await screen.findAllByTestId("used-for");
    await waitFor(() => expect(used[0].textContent).toMatch(/Not used: WEAREHOUSE is not a Manila branch code/));
    expect(used[1].textContent).toBe("Taft");
    fireEvent.click(screen.getByText("+ Add Address"));
    // The form opens on the page's city; its branch list is that city's.
    fireEvent.click(screen.getByLabelText("Branch"));
    expect(await screen.findByText("Warehouse (WH)")).toBeTruthy();
  });
});
