/**
 * Mahalo, 2026-11-27: the landlord complained three times that the trash bins
 * were not put back after the morning collection. The Cubao / CK opening report
 * now carries a required bins item: it is ticked, or its note says why, before
 * the report submits. Submitting also saves the latest ticks every time (once a
 * draft existed, Submit used to send only the report id).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lucideMock } from "../../lucide-mock";

vi.mock("lucide-react", () => lucideMock());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/travel-path",
}));
vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ staffName: "Rommel S. Pineda", role: "MANAGER", accessToken: "t", city: "manila" }),
  getAuthHeaders: () => ({}),
  refreshAuthFromApi: async (a: unknown) => a,
}));

const BINS = { id: 1, item_code: "CB_OP_BINS", branch_group: "CUBAO", section: "OPENING", sort_order: 35,
  item_text: "Return the trash bins to the designated area on the Tonkotsu Kitchen side after the morning garbage collection.",
  is_active: true, item_type: "CHECKBOX", unit_labels_json: [], is_required: true };
const KEYS = { ...BINS, id: 2, item_code: "CB_OP_001", sort_order: 10, item_text: "Secure Store keys and locks.", is_required: false };

function serve(existingDraft: boolean) {
  const calls: { url: string; method: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method || "GET").toUpperCase();
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : {} });
    let body: unknown = {};
    if (url.includes("/staff-names")) body = { names: ["Rommel S. Pineda"] };
    else if (url.includes("/items")) body = [KEYS, BINS];
    else if (url.includes("/reports?")) body = existingDraft ? [{ id: 7, status: "DRAFT" }] : [];
    else if (url.includes("/reports/7")) body = { id: 7, status: "DRAFT", entries: [] };
    else if (url.includes("/save")) body = { ok: true, report_id: 7, status: "DRAFT" };
    else if (url.includes("/submit")) body = { ok: true, report_id: 7, status: "SUBMITTED" };
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
  }));
  return calls;
}

async function open() {
  const { default: Page } = await import("@/app/admin/travel-path/page");
  render(<Page />);
  await screen.findByText(/Tonkotsu Kitchen/);
  fireEvent.click(await screen.findByText("— Select —"));
  fireEvent.click(await screen.findByRole("option", { name: "Rommel S. Pineda" }));
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("Travel Path: a required item", () => {
  it("is marked, and the report does not go without a tick or a reason", async () => {
    const calls = serve(true);
    await open();
    expect(screen.getAllByTestId("required-badge")).toHaveLength(1);
    fireEvent.click(screen.getAllByRole("button", { name: "Submit" })[0]);
    await screen.findByText(/Required: tick this item, or write in its note why/);
    expect(calls.some((c) => c.url.includes("/submit"))).toBe(false);
    fireEvent.change(screen.getByPlaceholderText("Add a note…"), { target: { value: "Not collected yet at 9:30" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Submit" })[0]);
    await waitFor(() => expect(calls.some((c) => c.url.includes("/submit"))).toBe(true));
    // The draft already existed: the note is saved before submitting.
    const save = calls.filter((c) => c.url.includes("/save")).pop()!;
    const bins = (save.body.entries as { item_code: string; note: string }[]).find((e) => e.item_code === "CB_OP_BINS")!;
    expect(bins.note).toBe("Not collected yet at 9:30");
    expect(calls.findIndex((c) => c.url.includes("/save"))).toBeLessThan(calls.findIndex((c) => c.url.includes("/submit")));
  });
});
