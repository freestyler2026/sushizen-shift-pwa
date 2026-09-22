/**
 * 応募者が開くページに、社内アプリの枠を出さない。
 *
 * この一覧は2回書き忘れられている。/book/ は出荷当日、/assessment/ は
 * 2026-09-21。どちらも API は正常で、**画面を開いて初めて分かった** ——
 * 応募者にログイン中のアバターと Time-in タブが見えている状態だった。
 * 覚えておく代わりに、ここで落とす。
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

let path = "/";
vi.mock("next/navigation", () => ({ usePathname: () => path }));
// 枠の中身はどれも認証を前提にしており、単体では立ち上がらない。
// 見たいのは「出るか出ないか」だけなので、名前の分かる印に置き換える。
vi.mock("@/components/NavBar", () => ({ default: () => <nav data-testid="staff-nav" /> }));
vi.mock("@/components/AutoReload", () => ({ default: () => null }));
vi.mock("@/components/ActivityBeacon", () => ({ default: () => null }));
vi.mock("@/components/SessionGuard", () => ({ default: () => null }));
vi.mock("@/components/ImpersonationBanner", () => ({ default: () => null }));

const APPLICANT_ROUTES = [
  "/apply",
  "/voice/abc123",
  "/book/abc123",
  "/assessment/abc123",
  "/login",
  "/setup-pin",
];

const STAFF_ROUTES = ["/my-shift", "/admin/hr/recruitment", "/attendance"];

async function renderAt(p: string) {
  path = p;
  const LayoutShell = (await import("@/components/LayoutShell")).default;
  const { unmount } = render(<LayoutShell><p>body</p></LayoutShell>);
  return unmount;
}

describe("LayoutShell — 応募者が開くページ", () => {
  it.each(APPLICANT_ROUTES)("%s には社内ナビを出さない", async (p) => {
    const unmount = await renderAt(p);
    expect(screen.queryByTestId("staff-nav")).toBeNull();
    expect(screen.getByText("body")).toBeInTheDocument();
    unmount();
  });

  it.each(STAFF_ROUTES)("%s には社内ナビを出す", async (p) => {
    const unmount = await renderAt(p);
    expect(screen.getByTestId("staff-nav")).toBeInTheDocument();
    unmount();
  });
});
