/**
 * The SLSP section says what stands between the page and the files, and
 * offers no download a validator would refuse.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lucideMock } from "../lucide-mock";

vi.mock("lucide-react", () => lucideMock());
vi.mock("@/lib/auth", () => ({ getAuth: () => ({ role: "HQ" }), getAuthHeaders: () => ({}) }));

const BUILD = {
  year: 2026, quarter: 3, owner_tin: "457994635",
  profile: { tin: "457994635", rdo_code: "", registered_name: "", last_name: "OMACHI", first_name: "JANINE THERESE",
    middle_name: "DIAZ", trade_name: "SUSHIZEN JAPANESE RESTAURANT", address1: "", address2: "", fiscal_month_end: 12,
    saved: false, updated_by: null, updated_at: null, missing: ["RDO code"] },
  sales: [{ month: "2026-07", exempt: "3067.85", taxable: "5440341.33", tax: "652840.96" }],
  purchases: [{ month: "2026-07", lines: [{ tin: "008165582", name: "McAsia", documents: 2 }], exempt: "0", services: "0",
    other: "0", capital: "0", tax: "42671.55", creditable: "42606.55", non_creditable: "65.00" }],
  checks: [{ ok: true, what: "Sales: output tax (item 31B)", lists: "1931397.09", return: "1931397.09", difference: "0.00" }],
  no_address: [{ tin: "008767585", name: "Delivery Hero Philippines Inc.", documents: 195, address: "", from: "", photos: [] }],
  address_to_check: [{ tin: "009617404", name: "SHIN MIKANA PHILIPPINES INC.", documents: 1, address: "SAGFOOIR", from: "proc_receivings #1",
    photos: [{ source: "proc_receivings", source_id: "1" }] }],
  tin_merged: [], not_listed: {},
  blocking: { S: ["RDO code"], P: ["RDO code", "1 supplier(s) have no registered address"] },
  ready: { S: false, P: false }, files: [], can_manage: true,
};

afterEach(() => { vi.unstubAllGlobals(); });

describe("Slsp", () => {
  it("names what blocks each list and keeps its download off", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => BUILD })));
    const Slsp = (await import("@/components/vat/Slsp")).default;
    render(<Slsp year={2026} quarter={3} />);
    expect(await screen.findByText("1 supplier(s) have no registered address")).toBeTruthy();
    for (const b of screen.getAllByRole("button", { name: /files \(3 \+ check workbook\)/ })) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
    }
    // a supplier with no photo cannot be read, only typed; a reading must be confirmed
    expect(screen.queryAllByRole("button", { name: "Read from photo" })).toHaveLength(0);
    expect(screen.getByText(/read from a receiving photo — check/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeTruthy();
  });
});

describe("Slsp taxpayer form", () => {
  it("keeps what is being typed when the lists reload", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => BUILD })));
    const { fireEvent } = await import("@testing-library/react");
    const Slsp = (await import("@/components/vat/Slsp")).default;
    const { rerender } = render(<Slsp year={2026} quarter={3} refreshKey={0} />);
    fireEvent.click(await screen.findByRole("button", { name: "Check and save" }));
    const rdo = screen.getByPlaceholderText("3 digits, on the COR") as HTMLInputElement;
    fireEvent.change(rdo, { target: { value: "052" } });
    rerender(<Slsp year={2026} quarter={3} refreshKey={1} />);
    await new Promise((r) => setTimeout(r, 50));
    expect((screen.getByPlaceholderText("3 digits, on the COR") as HTMLInputElement).value).toBe("052");
  });
});
