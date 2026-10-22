/**
 * The 2550Q section: what a manager can press, and when.
 *
 * Close freezes the figures the next quarter carries over from, so it must not
 * be offered before the quarter ends, nor to someone without VAT management;
 * and an excess of input tax is written in brackets, as on the form.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lucideMock } from "../lucide-mock";

vi.mock("lucide-react", () => lucideMock());
vi.mock("@/lib/auth", () => ({ getAuth: () => ({ role: "HQ" }), getAuthHeaders: () => ({}) }));

const RETURN = {
  year: 2026, quarter: 3, from: "2026-07-01", to: "2026-09-30", closed: false,
  carried_over_note: "previous quarter not closed in this ledger: nothing carried over",
  items: [
    { item: "35", label: "Total Sales & Output Tax Due", A: "1010.00", B: "120.00" },
    { item: "56", label: "Net VAT Payable/(Excess Input Tax) (Item 35B Less Item 55B)", A: null, B: "-54.41" },
  ],
  warnings: ["10 invoices to check hold 11785.42 of VAT that is not in item 42B until checked."],
  form: "BIR Form 2550Q January 2023 (ENCS) numbering", deadline: "2026-10-25",
};

function mockFetch(body: unknown, ok = true) {
  const f = vi.fn(async () => ({ ok, status: ok ? 200 : 409, json: async () => body }));
  vi.stubGlobal("fetch", f);
  return f;
}

async function show(props: { canManage: boolean; quarterEnded: boolean }) {
  const Form2550Q = (await import("@/components/vat/Form2550Q")).default;
  render(<Form2550Q year={2026} quarter={3} {...props} />);
  await screen.findByText("Total Sales & Output Tax Due");
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Form2550Q", () => {
  it("shows the items, the warnings, and an excess in brackets", async () => {
    mockFetch(RETURN);
    await show({ canManage: false, quarterEnded: true });
    expect(screen.getByText("(54.41)")).toBeTruthy();
    expect(screen.getByText(/10 invoices to check/)).toBeTruthy();
    expect(screen.getByText(/Not closed/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Close 2026 Q3/ })).toBeNull();
  });

  it("offers Close only after the quarter ends", async () => {
    mockFetch(RETURN);
    await show({ canManage: true, quarterEnded: false });
    expect(screen.queryByRole("button", { name: /Close 2026 Q3/ })).toBeNull();
    expect(screen.getByText(/Close becomes available after 2026-09-30/)).toBeTruthy();
  });

  it("asks before closing and names what is still open", async () => {
    const f = mockFetch(RETURN);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await show({ canManage: true, quarterEnded: true });
    fireEvent.click(screen.getByRole("button", { name: "Close 2026 Q3" }));
    expect(confirm.mock.calls[0][0]).toMatch(/10 invoices to check/);
    // declined: nothing was posted
    expect(f.mock.calls.every((c) => !String(c[0]).includes("/vat/close"))).toBe(true);
  });

  it("will not reopen without a reason", async () => {
    const f = mockFetch({ ...RETURN, closed: true, closed_by: "Yukihiro Nishimura", closed_at: "2026-10-23T02:00:00+00:00" });
    await show({ canManage: true, quarterEnded: true });
    expect(screen.getByText(/Closed by Yukihiro Nishimura/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reopen…" }));
    fireEvent.click(screen.getByRole("button", { name: "Reopen" }));
    await waitFor(() => expect(screen.getByText(/Say why the quarter is reopened/)).toBeTruthy());
    expect(f.mock.calls.every((c) => !String(c[0]).includes("/vat/reopen"))).toBe(true);
  });
});

describe("Form2550Q failures and refresh", () => {
  it("says so when the network fails on Close", async () => {
    const f = vi.fn(async (url: string) => {
      if (String(url).includes("/vat/close")) throw new TypeError("Failed to fetch");
      return { ok: true, status: 200, json: async () => RETURN };
    });
    vi.stubGlobal("fetch", f);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const Form2550Q = (await import("@/components/vat/Form2550Q")).default;
    render(<Form2550Q year={2026} quarter={3} canManage quarterEnded />);
    fireEvent.click(await screen.findByRole("button", { name: "Close 2026 Q3" }));
    expect(await screen.findByText(/Network error/)).toBeTruthy();
  });

  it("reloads when the page says the figures changed", async () => {
    const f = mockFetch(RETURN);
    const Form2550Q = (await import("@/components/vat/Form2550Q")).default;
    const { rerender } = render(<Form2550Q year={2026} quarter={3} canManage={false} quarterEnded refreshKey={0} />);
    await screen.findByText("Total Sales & Output Tax Due");
    const before = f.mock.calls.length;
    rerender(<Form2550Q year={2026} quarter={3} canManage={false} quarterEnded refreshKey={1} />);
    await waitFor(() => expect(f.mock.calls.length).toBeGreaterThan(before));
  });
});
