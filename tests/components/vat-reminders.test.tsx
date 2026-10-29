/** Deadline reminders on the VAT Ledger (VAT plan 6-3). */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lucideMock } from "../lucide-mock";

vi.mock("lucide-react", () => lucideMock());
vi.mock("@/lib/auth", () => ({ getAuth: () => ({ role: "HQ" }), getAuthHeaders: () => ({}) }));

afterEach(() => { vi.unstubAllGlobals(); });

function serve(body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => body })));
}

describe("Reminders", () => {
  it("says nobody gets them while the list is empty, and shows the next dates", async () => {
    serve({ recipients: [], recent: [], can_manage: true,
      next: [{ date: "2026-12-31", year: 2026, quarter: 4, kind: "quarter_end" },
             { date: "2027-01-15", year: 2026, quarter: 4, kind: "due_minus_10" }] });
    const R = (await import("@/components/vat/Reminders")).default;
    render(<R />);
    expect(await screen.findByText(/Nobody gets the reminders yet/)).toBeTruthy();
    expect(screen.getByText(/2027-01-15 \(2026 Q4, 10 days before the due date\)/)).toBeTruthy();
  });

  it("asks for a Discord id when a recipient has none, and shows sends on Manila's clock", async () => {
    serve({ recipients: [{ staff_name: "Yuri", discord_user_id: "", added_by: "Yukihiro" }], can_manage: true, next: [],
      recent: [{ year: 2026, quarter: 4, kind: "quarter_end", staff_name: "Yuri", status: "no_discord_id", detail: "",
        at: "2026-12-31 01:00:00.5+00" }] });
    const R = (await import("@/components/vat/Reminders")).default;
    render(<R />);
    expect(await screen.findByText(/the reminder cannot reach them/)).toBeTruthy();
    expect(screen.getByLabelText("Discord user id for Yuri")).toBeTruthy();
    expect(screen.getByText(/2026-12-31 09:00 Manila/)).toBeTruthy();
  });

  it("offers no changes without VAT management", async () => {
    serve({ recipients: [], recent: [], can_manage: false, next: [] });
    const R = (await import("@/components/vat/Reminders")).default;
    render(<R />);
    await screen.findByText(/Nobody gets the reminders yet/);
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Send me a test" })).toBeNull();
  });
  it("confirms the name it matched, not the one typed", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true, status: 200,
      json: async () => (init?.method === "POST" ? { ok: true, staff_name: "Yukihiro Nishimura" }
        : { recipients: [], recent: [], can_manage: true, next: [] }) })));
    const R = (await import("@/components/vat/Reminders")).default;
    render(<R />);
    fireEvent.change(await screen.findByLabelText("Staff name to add"), { target: { value: "yukihiro nishimura" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Yukihiro Nishimura added.")).toBeTruthy();
  });
});
