/**
 * The Vendors page works per city (VAT plan 4-8): Manila's own TIN can be seen,
 * added and removed here, not only Dubai's TRNs.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lucideMock } from "../../lucide-mock";

vi.mock("lucide-react", () => lucideMock());
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
let city = "dubai";
vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ role: "HQ", city, permissions: ["*"] }), getAuthHeaders: () => ({}), canAccessAdminNav: () => true,
}));

function stub() {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("own-tax-numbers") && (!init || !init.method || init.method === "GET")) {
      return { ok: true, status: 200, json: async () => ({ rows: u.includes("city=manila")
        ? [{ city: "manila", tin: "457994635000000", label: "SUSHIZEN JAPANESE RESTAURANT" }] : [] }) };
    }
    return { ok: true, status: 200, json: async () => ({ vendors: [], ok: true, created: 0, updated: 0 }) };
  });
  vi.stubGlobal("fetch", f);
  return f;
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Vendors by city", () => {
  it("opens on the login city and asks for it", async () => {
    city = "manila";
    const f = stub();
    const Page = (await import("@/app/admin/finance/vendors/page")).default;
    render(<Page />);
    expect(await screen.findByText("457994635000000")).toBeTruthy();
    expect(f.mock.calls.some((c) => String(c[0]) === "/api/admin/finance/vendors?city=manila")).toBe(true);
    expect(screen.getByPlaceholderText("TIN, 9 to 14 digits")).toBeTruthy();
  });

  it("switches to Manila and adds the number to Manila", async () => {
    city = "dubai";
    const f = stub();
    const Page = (await import("@/app/admin/finance/vendors/page")).default;
    render(<Page />);
    fireEvent.click(await screen.findByRole("tab", { name: "Manila" }));
    await screen.findByText("457994635000000");
    fireEvent.change(screen.getByPlaceholderText("TIN, 9 to 14 digits"), { target: { value: "457994635" } });
    fireEvent.click(screen.getByRole("button", { name: /^Add/ }));
    await waitFor(() => expect(f.mock.calls.some((c) => (c[1] as RequestInit)?.method === "POST"
      && String((c[1] as RequestInit).body).includes('"city":"manila"'))).toBe(true));
  });

  it("asks before removing one of our numbers, and says what it changes", async () => {
    city = "manila";
    const f = stub();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const Page = (await import("@/app/admin/finance/vendors/page")).default;
    render(<Page />);
    await screen.findByText("457994635000000");
    fireEvent.click(screen.getByTitle("Remove"));
    expect(confirm.mock.calls[0][0]).toMatch(/VAT Ledger/);
    expect(f.mock.calls.some((c) => (c[1] as RequestInit)?.method === "DELETE")).toBe(false);
  });
});
