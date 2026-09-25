// tests/hr/offer-sent-card.test.tsx
//
// Four cards sat in Offer Sent. Three had been approved and not one of them
// said so, because the chip the card showed was the INTERVIEW recommendation,
// which by then was stale:
//
//   Jhon Albert   hire      not approved   green "Move to offer"
//   Nikka         hire      approved       green "Move to offer"  ← identical
//   Roczelle      consider  approved       amber "Hold — decide later"
//   RONIDEL       —         approved       nothing at all
//
// So an approved candidate looked exactly like an unapproved one, and an
// approved one with an offer already out was wearing "still deciding".
import React from "react";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { setAdminAuth } from "../setup";

vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));
vi.mock("@/lib/interview-ics", () => ({ downloadIcs: vi.fn() }));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const BASE = {
  city: "manila", requisition_id: null, position_applied: "Kitchen",
  phone: "", email: "", source: "referral", applied_date: "2026-09-16",
  assigned_branch: "PAR", notes: "", rejection_reason: "",
  created_at: "2026-09-16T00:00:00Z", updated_at: "2026-09-25T00:00:00Z",
  comment_count: 0,
};

const NIKKA = {
  ...BASE, id: "nikka", full_name: "Nikka Capawing", status: "offer_sent",
  latest_recommendation: "hire", offer_recorded: true,
  offer_sent_at: "2026-09-25T00:00:00Z",
  approval_decision: "approved", approval_decided_by: "Yukihiro Nishimura",
};
const JHON = {
  ...BASE, id: "jhon", full_name: "Jhon Albert Traquena", status: "offer_sent",
  latest_recommendation: "hire", offer_recorded: false,
  approval_decision: "", approval_decided_by: "",
};
const ROCZELLE = {
  ...BASE, id: "rocz", full_name: "Roczelle D. Lucena", status: "offer_sent",
  latest_recommendation: "consider", offer_recorded: true,
  offer_sent_at: "2026-09-25T00:00:00Z",
  approval_decision: "approved", approval_decided_by: "Yusuke Uejima",
};
/** A hold whose clock is still running. This is what "at the interview stage"
 *  now means on the board: from 2026-09-25 a review saying hire or reject moves
 *  the card to the decide screen, because recording the review moves nobody and
 *  10 people were sitting at 'interviewed' with a reject on file. A hold under
 *  the line is the one interview-stage card still on the board. */
const INTERVIEWED = {
  ...BASE, id: "iv", full_name: "Still Interviewing", status: "interviewed",
  latest_recommendation: "consider", approval_decision: "",
};
/** Reviewed as a hire and never sent on. Owes a decision, so it is counted on
 *  the decide screen rather than sitting quietly in the Interviewed column. */
const HIRE_NOT_SENT = {
  ...BASE, id: "hns", full_name: "Hire Not Sent", status: "interviewed",
  latest_recommendation: "hire", approval_decision: "",
};

function install(applicants: unknown[]) {
  setAdminAuth("manila");
  localStorage.setItem("sushizen_shift_auth", JSON.stringify({
    staffName: "Test User", city: "manila", role: "ADMIN",
    accessToken: "test-token", permissions: ["*"],
  }));
  mockFetch.mockImplementation(async (url: string) => {
    const u = String(url);
    const body = u.includes("/applicants") ? { applicants }
      : u.includes("/requisitions") ? { requisitions: [] }
      : u.includes("/overview") ? { plans: [], stalled: [], stalled_count: 0, awaiting_offer: [] }
      : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

async function board(applicants: unknown[], firstName: string) {
  install(applicants);
  const { default: Page } = await import("@/app/admin/hr/recruitment/page");
  render(<Page />);
  await waitFor(() => expect(screen.getByText(firstName)).toBeTruthy());
}

describe("Offer Sent のカード", () => {
  beforeEach(() => { mockFetch.mockReset(); localStorage.clear(); });

  it("承認済みであることが一目で分かる", async () => {
    await board([NIKKA], "Nikka Capawing");
    expect(screen.getByText(/Approved/)).toBeTruthy();
    expect(screen.getByText(/Yukihiro Nishimura/)).toBeTruthy();
  });

  it("未承認の人に承認の印は出さない", async () => {
    await board([JHON], "Jhon Albert Traquena");
    expect(screen.queryByText(/Approved/)).toBeNull();
  });

  it("面接の評価チップは、オファーまで来たら消える", async () => {
    // 承認済みの Roczelle が「Hold — decide later」を着ていた。
    await board([ROCZELLE, JHON], "Roczelle D. Lucena");
    expect(screen.queryByText("Hold — decide later")).toBeNull();
    expect(screen.queryByText("Move to offer")).toBeNull();
  });

  it("面接の段階の保留は、盤面に残って残り日数を出す", async () => {
    await board([INTERVIEWED], "Still Interviewing");
    expect(screen.getByText("Hold — decide later")).toBeTruthy();
    expect(screen.getByText("Decide within 3 days")).toBeTruthy();
  });

  it("hire と記録されたのに送られていない人は、判断待ちの画面で数える", async () => {
    // 評価を書いただけでは誰も動かない。盤面に静かに残すのをやめた。
    await board([INTERVIEWED, HIRE_NOT_SENT], "Still Interviewing");
    const decide = screen.getByRole("button", { name: /Needs a decision/ });
    expect(within(decide).getByText("1")).toBeTruthy();
    expect(screen.queryByText("Hire Not Sent")).toBeNull();
    fireEvent.click(decide);
    expect(await screen.findByText("Hire Not Sent")).toBeTruthy();
    expect(screen.getByText("Send the offer for approval.")).toBeTruthy();
  });

  it("承認済みのカードと未承認のカードが、同じ見た目にならない", async () => {
    // これが元の状態だった。Nikka(承認済) と Jhon(未承認) が見分けられない。
    await board([NIKKA, JHON], "Nikka Capawing");
    const cardOf = (name: string) =>
      screen.getByText(name).closest("div[class*='cursor-pointer']")!;
    expect(cardOf("Nikka Capawing").className)
      .not.toBe(cardOf("Jhon Albert Traquena").className);
    expect(cardOf("Nikka Capawing").className).toContain("sky");
  });

  it("金額が未記録なら、それが次だと書く", async () => {
    await board([JHON], "Jhon Albert Traquena");
    // 「在る」ではなく「見えている」を見る。hidden を付けただけの変更が
    // getByText を通ってしまう。
    const line = screen.getByText(/Next: write down what the letter offers/);
    expect(line.closest("[hidden]")).toBeNull();
    expect(window.getComputedStyle(line).display).not.toBe("none");
    expect(screen.getByRole("button", { name: /Record the offer/ })).toBeTruthy();
  });

  it("金額が未記録のとき、Hired は主ボタンにしない", async () => {
    // 合意額が残らないまま Hired に送ると、給与が推測で埋まる。
    await board([JHON], "Jhon Albert Traquena");
    const record = screen.getByRole("button", { name: /Record the offer/ });
    const hired = screen.getByRole("button", { name: /Accepted already\?/ });
    expect(record.className).toContain("amber");
    expect(hired.className).toContain("text-zinc-500");
    expect(hired.className).not.toContain("amber");
  });

  it("金額が記録済みなら、次は Hired だと書く", async () => {
    await board([NIKKA], "Nikka Capawing");
    const line = screen.getByText(/Next: when they accept, move them to Hired/);
    expect(line.closest("[hidden]")).toBeNull();
    expect(screen.getByText(/✓ offer on file/)).toBeTruthy();
  });

  it("金額が未記録でも Hired には行ける", async () => {
    await board([JHON], "Jhon Albert Traquena");
    expect(screen.getByRole("button", { name: /Accepted already\? Move to Hired/ })).toBeTruthy();
  });
});
