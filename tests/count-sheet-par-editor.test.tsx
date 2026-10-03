/**
 * The count sheet par editor: what it sends, and what it refuses to claim.
 *
 * Replacing the Excel round trip is only worth anything if the screen tells the
 * truth about what was saved. The old pattern panel reloaded the list whether
 * the request worked or not, so a 403 looked exactly like a 200 (lesson 46).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CountSheetParEditor from "@/components/admin/CountSheetParEditor";

const PATTERNS = { patterns: ["TAFT_Sunday", "WAREHOUSE_Sunday"] };
const ITEMS = {
  items: [
    { item_code: "CK001", item_name: "Tonkotsu Broth", default_unit: "PKT", par_level: 10 },
    { item_code: "CK002", item_name: "Chashu", default_unit: "PC", par_level: null },
  ],
};

function mockFetch(saveResponse: { status: number; body?: unknown }) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (init?.method === "PUT") {
      return new Response(JSON.stringify(saveResponse.body ?? {}), { status: saveResponse.status });
    }
    const body = url.includes("/items") ? ITEMS : PATTERNS;
    return new Response(JSON.stringify(body), { status: 200 });
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("count sheet par editor", () => {
  it("names which city it is asking about", async () => {
    const calls = mockFetch({ status: 200 });
    render(<CountSheetParEditor />);
    await screen.findByText("Tonkotsu Broth");
    expect(calls.every((c) => c.url.includes("city="))).toBe(true);
  });

  it("sends only the rows whose number was changed", async () => {
    const calls = mockFetch({ status: 200, body: { written: 1, unchanged: 0, refused: [] } });
    render(<CountSheetParEditor />);
    await screen.findByText("Tonkotsu Broth");

    fireEvent.change(screen.getByLabelText("Par level for Chashu"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: /Save 1 change/ }));

    await waitFor(() => expect(calls.some((c) => c.init?.method === "PUT")).toBe(true));
    const put = calls.find((c) => c.init?.method === "PUT")!;
    const sent = JSON.parse(String(put.init!.body));
    expect(sent.items).toEqual([{ item_code: "CK002", par_level: 4 }]);
  });

  it("will not offer to save when nothing was changed", async () => {
    mockFetch({ status: 200 });
    render(<CountSheetParEditor />);
    await screen.findByText("Tonkotsu Broth");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("retyping the same number is not a change", async () => {
    mockFetch({ status: 200 });
    render(<CountSheetParEditor />);
    await screen.findByText("Tonkotsu Broth");
    fireEvent.change(screen.getByLabelText("Par level for Tonkotsu Broth"), { target: { value: "10" } });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("reports the server's count, not the number of rows it sent", async () => {
    mockFetch({ status: 200, body: { written: 0, unchanged: 1, refused: [] } });
    render(<CountSheetParEditor />);
    await screen.findByText("Tonkotsu Broth");
    fireEvent.change(screen.getByLabelText("Par level for Chashu"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: /Save 1 change/ }));
    expect(await screen.findByText(/Saved 0\./)).toBeInTheDocument();
  });

  it("names the rows the server refused", async () => {
    mockFetch({ status: 200, body: { written: 0, unchanged: 0, refused: ["DXB-0007"] } });
    render(<CountSheetParEditor />);
    await screen.findByText("Tonkotsu Broth");
    fireEvent.change(screen.getByLabelText("Par level for Chashu"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: /Save 1 change/ }));
    expect(await screen.findByText(/DXB-0007/)).toBeInTheDocument();
  });

  it("says a failed save failed", async () => {
    mockFetch({ status: 403 });
    render(<CountSheetParEditor />);
    await screen.findByText("Tonkotsu Broth");
    fireEvent.change(screen.getByLabelText("Par level for Chashu"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: /Save 1 change/ }));
    expect(await screen.findByText(/Save failed \(403\)/)).toBeInTheDocument();
  });
});
