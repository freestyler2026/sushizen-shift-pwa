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
    { item_code: "CK001", item_name: "Tonkotsu Broth", default_unit: "PKT", par_level: 10,
      order_step: 6 },
    // 刻みのキーが無い行。「指定なし」で、0（丸めない）とは別。
    { item_code: "CK002", item_name: "Chashu", default_unit: "PC", par_level: null },
    // CK品。支店ごとの刻みを取らない（CKの小分け単位はカタログ行が持つ）。
    { item_code: "CK003", item_name: "Poke Sauce", default_unit: "kg", par_level: 2,
      order_step: null, is_commissary: true },
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

describe("the branch's order step", () => {
  // 刻みは画面が**受け取っていながら出していなかった**。効いている設定が
  // どの画面にも無い状態は、使われなくなる型 #9（ルールが画面に無い）。
  function cells(name: string) {
    const row = screen.getAllByRole("row").find((r) => r.textContent?.includes(name));
    return row!.querySelectorAll("td");
  }

  it("shows a step that is set, and a dash for one that is not", async () => {
    mockFetch({ status: 200 });
    render(<CountSheetParEditor />);
    await screen.findByText("Tonkotsu Broth");
    expect(cells("Tonkotsu Broth")[3].textContent).toContain("6");
    expect(cells("Chashu")[3].textContent).toContain("\u2014");
  });

  it("writes zero out in words, because it is not the same as blank", async () => {
    // null = この支店に固有の刻みは無い（カタログのを使う）／0 = 丸めない。
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      new Response(JSON.stringify(url.includes("/items")
        ? { items: [{ item_code: "X", item_name: "Sake", default_unit: "BTL",
                      par_level: 2, order_step: 0 }] }
        : { patterns: ["TAFT_Sunday"] }), { status: 200 })));
    render(<CountSheetParEditor />);
    await screen.findByText("Sake");
    expect(cells("Sake")[3].textContent).toContain("no rounding");
  });

  it("says where the step is set, so the column is not a mystery", async () => {
    mockFetch({ status: 200 });
    render(<CountSheetParEditor />);
    await screen.findByText("Tonkotsu Broth");
    expect(screen.getByText(/read-only here/i)).toBeTruthy();
    expect(screen.getByText(/Order Step column/i)).toBeTruthy();
  });

  it("does not send the step, so saving a par cannot erase it", async () => {
    // 送ると Pydantic の既定値が「消せ」になる。画面に刻みの欄が無いので、
    // ここが送る理由も無い。
    const calls = mockFetch({ status: 200, body: { written: 1 } });
    render(<CountSheetParEditor />);
    await screen.findByText("Tonkotsu Broth");
    fireEvent.change(screen.getAllByRole("spinbutton")[0], { target: { value: "15" } });
    fireEvent.click(screen.getByText(/Save 1 change/));
    await waitFor(() => expect(calls.some((c) => c.init?.method === "PUT")).toBe(true));
    const put = calls.find((c) => c.init?.method === "PUT")!;
    const body = JSON.parse(put.init!.body as string);
    expect(body.items[0]).toEqual({ item_code: "CK001", par_level: 15 });
    expect("order_step" in body.items[0]).toBe(false);
  });

  it("names a blanked par instead of reporting a save that wrote nothing", async () => {
    // par_level は NOT NULL なので行が作れない。以前はここが 500 だった。
    const calls = mockFetch({ status: 200, body: { written: 0, no_par: ["CK001"] } });
    render(<CountSheetParEditor />);
    await screen.findByText("Tonkotsu Broth");
    fireEvent.change(screen.getAllByRole("spinbutton")[0], { target: { value: "" } });
    fireEvent.click(screen.getByText(/Save 1 change/));
    await waitFor(() => expect(calls.some((c) => c.init?.method === "PUT")).toBe(true));
    expect(await screen.findByText(/a par is required here/i)).toBeTruthy();
  });
});

describe("Central Kitchen rows do not take a branch step", () => {
  // 刻みを持つカタログ行は、両都市で1つの例外もなく order_type='CK'
  // （2026-10-12 実測）。あれは仕入先の梱包単位ではなくCKの小分け単位で、
  // どの支店が頼んでも同じ。ドバイのParパターンは支店あたり113〜123行がCK品
  // なので、刻み欄を出して黙って無視すれば、埋めても効かない欄を120個渡す。
  function cells(name: string) {
    const row = screen.getAllByRole("row").find((r) => r.textContent?.includes(name));
    return row!.querySelectorAll("td");
  }

  it("reads n/a, not a dash — a dash means the catalogue decides", async () => {
    mockFetch({ status: 200 });
    render(<CountSheetParEditor />);
    await screen.findByText("Poke Sauce");
    expect(cells("Poke Sauce")[3].textContent).toContain("n/a");
    expect(cells("Chashu")[3].textContent).toContain("\u2014");
  });

  it("says why, so the empty cell is not read as a missing setting", async () => {
    mockFetch({ status: 200 });
    render(<CountSheetParEditor />);
    await screen.findByText("Poke Sauce");
    expect(screen.getByText(/pack size is one number/i)).toBeTruthy();
  });

  it("names a step the server refused to store on a CK item", async () => {
    // 黙って無視すると「設定したのに効かない」になる。
    const calls = mockFetch({
      status: 200,
      body: { written: 1, step_not_applicable: ["CK003"] },
    });
    render(<CountSheetParEditor />);
    await screen.findByText("Poke Sauce");
    fireEvent.change(screen.getAllByRole("spinbutton")[0], { target: { value: "15" } });
    fireEvent.click(screen.getByText(/Save 1 change/));
    await waitFor(() => expect(calls.some((c) => c.init?.method === "PUT")).toBe(true));
    expect(await screen.findByText(/pack size lives on its catalogue row/i)).toBeTruthy();
  });
});
