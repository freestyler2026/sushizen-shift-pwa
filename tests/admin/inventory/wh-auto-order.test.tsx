// tests/admin/inventory/wh-auto-order.test.tsx
/**
 * Auto Order は**押しただけでは発注を作らない**。
 *
 * 直す前は Generate Purchase Orders の1クリックで仕入先ごとの Direct Purchase が
 * そのまま Approval Inbox に入り、数量を見る機会も直す機会も無かった
 * （2026-09-21 に倉庫担当から報告）。数量はサーバが par − 理論在庫から計算し、
 * 画面の値は一切見ていなかった。
 *
 * ここで守るのは3つ。押しても作られないこと、確認に出るのが画面で直した数量で
 * あること、チェックを外した行が入らないこと。
 */
import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/inventory/wh-inventory",
  useParams: () => ({}),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));
vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));
vi.mock("@/components/InventoryTabs", () => ({ default: () => null }));
vi.mock("@/components/InventoryDueBanner", () => ({ default: () => null }));
vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ staffName: "Tester", role: "ADMIN", city: "manila", permissions: ["*"] }),
  refreshAuthFromApi: async () => ({ staffName: "Tester", role: "ADMIN", city: "manila", permissions: ["*"] }),
  canAccessInventoryWorkspace: () => true,
}));

const ROWS = [
  { id: "i-black", name: "Hair Net BLACK", category: "Warehouse", unit: "PKT", cost: 155,
    theoretical_qty: 0, last_count_qty: 0, last_count_date: null, adj_qty_total: 0,
    par_level: 10, need_qty: 10, supplier_id: "s1", supplier_name: "Multi Crystal Packaging",
    order_unit: "PKT", purchase_cost: 155 },
  { id: "i-glove", name: "Gloves M", category: "Warehouse", unit: "BOX", cost: 80,
    theoretical_qty: 1, last_count_qty: 1, last_count_date: null, adj_qty_total: 0,
    par_level: 5, need_qty: 4, supplier_id: "s1", supplier_name: "Multi Crystal Packaging",
    order_unit: "BOX", purchase_cost: 80 },
];

const post = vi.fn(async () => ({ ok: true, created: [], skipped_no_supplier: [] }));
vi.mock("@/lib/inventoryClient", () => ({
  inventoryGet: vi.fn(async (path: string) => {
    if (path.includes("/wh-stock?")) return { ok: true, rows: ROWS };
    return { ok: true, rows: [] };
  }),
  inventoryPost: (...a: unknown[]) => post(...(a as [])),
  inventoryPatch: vi.fn(async () => ({ ok: true })),
}));

async function openAutoOrder() {
  const Page = (await import("@/app/admin/inventory/wh-inventory/page")).default;
  render(<Page />);
  const tab = await screen.findByRole("button", { name: /Auto Order/i }, { timeout: 4000 });
  fireEvent.click(tab);
  await screen.findByText("Hair Net BLACK", {}, { timeout: 4000 });
}

function generate() {
  fireEvent.click(screen.getByRole("button", { name: /Generate Purchase Orders/i }));
}

describe("WH Auto Order — 押しただけでは発注しない", () => {
  beforeEach(() => { post.mockClear(); });

  it("Generate を押しても発注は作られず、確認が出る", async () => {
    await openAutoOrder();
    generate();
    await screen.findByRole("dialog", {}, { timeout: 3000 });
    expect(screen.getByText("これを発注します")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("戻るを押すと何も作られない", async () => {
    await openAutoOrder();
    generate();
    const dlg = await screen.findByRole("dialog", {}, { timeout: 3000 });
    fireEvent.click(within(dlg).getByRole("button", { name: "戻る" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(post).not.toHaveBeenCalled();
  });

  it("Confirm で初めて送られ、画面で直した数量が入る", async () => {
    await openAutoOrder();
    const qty = screen.getByLabelText("Order quantity for Hair Net BLACK");
    fireEvent.change(qty, { target: { value: "3" } });
    generate();
    const dlg = await screen.findByRole("dialog", {}, { timeout: 3000 });
    fireEvent.click(within(dlg).getByRole("button", { name: /Confirm/ }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const body = post.mock.calls[0][1] as { items: { item_id: string; qty: number }[] };
    expect(body.items).toEqual(
      expect.arrayContaining([{ item_id: "i-black", qty: 3 }, { item_id: "i-glove", qty: 4 }]));
  });

  it("チェックを外した行は送られない", async () => {
    await openAutoOrder();
    fireEvent.click(screen.getByLabelText("Order Hair Net BLACK"));
    generate();
    const dlg = await screen.findByRole("dialog", {}, { timeout: 3000 });
    expect(within(dlg).queryByText("Hair Net BLACK")).toBeNull();
    fireEvent.click(within(dlg).getByRole("button", { name: /Confirm/ }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const body = post.mock.calls[0][1] as { items: { item_id: string }[] };
    expect(body.items.map((i) => i.item_id)).toEqual(["i-glove"]);
  });

  it("全部外すと Confirm は押せない", async () => {
    await openAutoOrder();
    fireEvent.click(screen.getByLabelText("Order Hair Net BLACK"));
    fireEvent.click(screen.getByLabelText("Order Gloves M"));
    generate();
    const dlg = await screen.findByRole("dialog", {}, { timeout: 3000 });
    expect(within(dlg).getByRole("button", { name: /Confirm/ })).toBeDisabled();
    expect(post).not.toHaveBeenCalled();
  });
});
