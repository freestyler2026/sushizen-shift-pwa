// tests/admin/hr/recruitment-lanes.test.tsx
//
// The board became three screens on 2026-09-07 because one board of 152 cards
// hid the 63 nobody had decided on. These cover the split itself and the two
// things that only go wrong once a row is actually clicked -- both of which
// were broken in the first version and neither of which an API test can see.
import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...real,
    getAuth: () => ({ staffName: "Admin User", city: "manila", role: "ADMIN", accessToken: "tok" }),
    getAuthHeaders: () => ({ "Content-Type": "application/json", Authorization: "Bearer tok" }),
    canAccessAdminNav: () => true,
    isAdmin: () => true,
  };
});

vi.mock("@/lib/api", () => ({ API_BASE: "" }));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function fetchOk(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as Response);
}

/** One person per lane, plus the two shapes that behave differently:
 *  somebody nobody ever replied to, and a repeat application. */
const APPLICANTS = [
  {
    id: "a1", city: "manila", requisition_id: null, full_name: "Fresh Candidate",
    position_applied: "kitchen", phone: "0900", email: "", source: "facebook",
    referrer_name: "", status: "interviewed", rejection_reason: "", notes: "",
    applied_date: "2026-09-05", days_in_pipeline: 2, days_since_move: 2,
    never_moved: false, prior_applications: 0, prior_last_applied: null,
  },
  {
    id: "a2", city: "manila", requisition_id: null, full_name: "Long Wait",
    position_applied: "store manager", phone: "0901", email: "", source: "facebook",
    referrer_name: "", status: "interviewed", rejection_reason: "", notes: "",
    applied_date: "2026-06-11", days_in_pipeline: 88, days_since_move: 88,
    never_moved: false, prior_applications: 1, prior_last_applied: "2026-05-02",
  },
  {
    id: "a3", city: "manila", requisition_id: null, full_name: "Never Answered",
    position_applied: "kitchen", phone: "0902", email: "", source: "referral",
    referrer_name: "", status: "new", rejection_reason: "", notes: "",
    applied_date: "2026-07-10", days_in_pipeline: 59, days_since_move: 59,
    never_moved: true, prior_applications: 0, prior_last_applied: null,
  },
  {
    id: "a4", city: "manila", requisition_id: null, full_name: "Was Hired",
    position_applied: "kitchen", phone: "0903", email: "", source: "referral",
    referrer_name: "", status: "hired", rejection_reason: "", notes: "",
    applied_date: "2026-08-01", days_in_pipeline: 37, days_since_move: 37,
    never_moved: false, prior_applications: 0, prior_last_applied: null,
  },
  /* The five shapes the lane used to get wrong. Measured 2026-09-25: the
     "Needs a decision" screen held 0 people while 22 cards carried a decision
     somebody had written down and nobody had acted on. */
  {
    // A scored review says reject. submit_evaluation moves nobody, so this
    // person stays open, and the card used to show no colour and no chip at
    // all -- less than a card nobody had opened.
    id: "a5", city: "manila", requisition_id: null, full_name: "Said No To",
    position_applied: "kitchen", phone: "0904", email: "", source: "facebook",
    referrer_name: "", status: "interviewed", rejection_reason: "", notes: "",
    applied_date: "2026-09-18", days_in_pipeline: 7, days_since_move: 2,
    never_moved: false, prior_applications: 0, prior_last_applied: null,
    latest_recommendation: "reject",
  },
  {
    // Held to decide later, and the later never came.
    id: "a6", city: "manila", requisition_id: null, full_name: "Held Eight Days",
    position_applied: "server", phone: "0905", email: "", source: "facebook",
    referrer_name: "", status: "interviewed", rejection_reason: "", notes: "",
    applied_date: "2026-09-10", days_in_pipeline: 15, days_since_move: 8,
    never_moved: false, prior_applications: 0, prior_last_applied: null,
    latest_recommendation: "consider",
  },
  {
    // Held yesterday. Somebody deliberately postponed this one, so asking them
    // to decide again today is not a reminder, it is noise.
    id: "a7", city: "manila", requisition_id: null, full_name: "Held Yesterday",
    position_applied: "server", phone: "0906", email: "", source: "facebook",
    referrer_name: "", status: "interviewed", rejection_reason: "", notes: "",
    applied_date: "2026-09-20", days_in_pipeline: 5, days_since_move: 1,
    never_moved: false, prior_applications: 0, prior_last_applied: null,
    latest_recommendation: "consider",
  },
  {
    // Reviewed as a hire and still sitting at 'interviewed'. Same hole as the
    // rejects, opposite direction: the review moves nobody.
    id: "a8", city: "manila", requisition_id: null, full_name: "Hire Not Sent",
    position_applied: "kitchen", phone: "0907", email: "", source: "walk_in",
    referrer_name: "", status: "interviewed", rejection_reason: "", notes: "",
    applied_date: "2026-09-24", days_in_pipeline: 1, days_since_move: 0,
    never_moved: false, prior_applications: 0, prior_last_applied: null,
    latest_recommendation: "hire",
  },
  {
    // An old "consider" on somebody whose offer is already out. Somebody has
    // acted since; the review is history, not an open question, and dragging
    // this card onto the decide screen would be the board contradicting itself.
    id: "a9", city: "manila", requisition_id: null, full_name: "Offer Already Out",
    position_applied: "cashier", phone: "0908", email: "", source: "facebook",
    referrer_name: "", status: "offer_sent", rejection_reason: "", notes: "",
    applied_date: "2026-09-19", days_in_pipeline: 6, days_since_move: 0,
    never_moved: false, prior_applications: 0, prior_last_applied: null,
    latest_recommendation: "consider", approval_decision: "approved",
  },
  {
    // The last day of a hold. Exactly on the line, so still on the board --
    // the card has to say the clock runs out today rather than looking the
    // same as day one.
    id: "a10", city: "manila", requisition_id: null, full_name: "Hold Last Day",
    position_applied: "server", phone: "0909", email: "", source: "facebook",
    referrer_name: "", status: "interviewed", rejection_reason: "", notes: "",
    applied_date: "2026-09-15", days_in_pipeline: 10, days_since_move: 3,
    never_moved: false, prior_applications: 0, prior_last_applied: null,
    latest_recommendation: "consider",
  },
  {
    // A review saying reject on somebody whose offer is already being approved.
    // Nobody is in this state in production today, which is exactly why the
    // card has to speak when somebody gets here -- the contradiction is the
    // whole message. It stays on the board because a person has acted since.
    id: "a11", city: "manila", requisition_id: null, full_name: "Approving Despite No",
    position_applied: "cashier", phone: "0910", email: "", source: "facebook",
    referrer_name: "", status: "approval", rejection_reason: "", notes: "",
    applied_date: "2026-09-22", days_in_pipeline: 3, days_since_move: 1,
    never_moved: false, prior_applications: 0, prior_last_applied: null,
    latest_recommendation: "reject", approval_requested_by: "HR Staff",
  },
];

function route(url: string) {
  if (url.includes("/applicants?")) return fetchOk({ applicants: APPLICANTS });
  if (url.includes("/requisitions")) return fetchOk({ requisitions: [] });
  if (url.includes("outcome-reasons"))
    return fetchOk({ reasons: [
      { key: "lapsed", label: "We did not get back to them in time" },
      { key: "better_candidate", label: "Another candidate is stronger" },
    ] });
  return fetchOk({});
}

async function renderPage() {
  const Page = (await import("@/app/admin/hr/recruitment/page")).default;
  render(<Page />);
  // Wait on something that is on the default screen -- "Working on".
  await screen.findByText("Fresh Candidate");
}

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockImplementation((u: string) => route(String(u)));
});

describe("recruitment — three screens", () => {
  it("counts a decision that was recorded and not acted on, not just an old card", async () => {
    await renderPage();
    // Five owe something: the 88-day wait, the 59-day silence, the reject
    // nobody closed, the hold that passed three days, and the hire nobody
    // sent. Under the old rule -- idle days alone -- this number was 2, and
    // in production it was 0 while 22 cards owed a decision.
    const decide = screen.getByRole("button", { name: /Needs a decision/ });
    expect(within(decide).getByText("5")).toBeTruthy();
    // Three owe nothing yet: seen two days ago, held yesterday, offer out.
    const active = screen.getByRole("button", { name: /Working on/ });
    expect(within(active).getByText("5")).toBeTruthy();
    const closed = screen.getByRole("button", { name: /Closed/ });
    expect(within(closed).getByText("1")).toBeTruthy();
  });

  it("leaves a hold alone until it passes the line, then asks", async () => {
    // The pair that makes the threshold real rather than decorative: same
    // status, same recommendation, one day versus eight.
    await renderPage();
    expect(screen.getByText("Held Yesterday")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Needs a decision/ }));
    const list = await screen.findByText("Held Eight Days");
    expect(list).toBeTruthy();
    expect(screen.queryByText("Held Yesterday")).toBeNull();
  });

  it("does not drag a card back for a review somebody already acted on", async () => {
    // a9 carries an old "consider" and has an offer out. The review is not an
    // open question and the decide screen must not claim it is.
    await renderPage();
    expect(screen.getByText("Offer Already Out")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Needs a decision/ }));
    await screen.findByText("Held Eight Days");
    expect(screen.queryByText("Offer Already Out")).toBeNull();
  });

  it("names the next action per row rather than repeating the wait", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Needs a decision/ }));
    await screen.findByText("Said No To");
    // Scoped to the row each sentence belongs to. Asserting the four strings
    // are on the screen somewhere passes even with the sentences swapped
    // between people, which is the only way this can actually be wrong.
    const rowFor = (name: string) => screen.getByText(name).closest("div")!;
    expect(within(rowFor("Said No To"))
      .getByText("Close them, or overturn the review.")).toBeTruthy();
    expect(within(rowFor("Hire Not Sent"))
      .getByText("Send the offer for approval.")).toBeTruthy();
    expect(within(rowFor("Held Eight Days"))
      .getByText("Held 8 days ago. Decide, or close it.")).toBeTruthy();
    expect(within(rowFor("Long Wait"))
      .getByText("88 days with nothing happening. Move it on, or close it.")).toBeTruthy();
  });

  it("filters the decision list by what is owed", async () => {
    // The counts used to be captions. A readable number that cannot be
    // pressed is what made "Active Notices: 21" useless (lesson 7).
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Needs a decision/ }));
    await screen.findByText("Said No To");
    fireEvent.click(screen.getByRole("button", { name: /Review says reject/ }));
    expect(screen.getByText("Said No To")).toBeTruthy();
    expect(screen.queryByText("Held Eight Days")).toBeNull();
    expect(screen.queryByText("Long Wait")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /show all/ }));
    expect(await screen.findByText("Held Eight Days")).toBeTruthy();
  });

  it("puts the longest wait first and says who never got a reply", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Needs a decision/ }));
    expect(await screen.findByText("88d")).toBeTruthy();
    expect(screen.getByText("1 never had a reply from us")).toBeTruthy();
    expect(screen.getByText(/applied and never heard back from us/)).toBeTruthy();
    expect(screen.getByText(/applied before \(2026-05-02\)/)).toBeTruthy();
  });

  it("opens the detail panel from the decision list", async () => {
    // The panel used to live inside the board branch, so this click set the
    // selection and drew nothing.
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Needs a decision/ }));
    fireEvent.click(await screen.findByText("Long Wait"));
    await waitFor(() => expect(screen.getAllByText("Long Wait").length).toBeGreaterThan(1));
  });

  it("opens the detail panel from the closed list", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Closed/ }));
    fireEvent.click(await screen.findByText("Was Hired"));
    await waitFor(() => expect(screen.getAllByText("Was Hired").length).toBeGreaterThan(1));
  });

  it("does not offer an offer to somebody nobody interviewed", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Needs a decision/ }));
    // closest("div") from the name is already the row -- the name sits in a
    // button, and the button's parent is the row.
    const row = (await screen.findByText("Never Answered")).closest("div")!;
    fireEvent.click(within(row).getByText("Decide"));
    expect(await screen.findByText(/never reached an interview/)).toBeTruthy();
    expect(screen.queryByText("Proceed to offer")).toBeNull();
    expect(screen.getByText("Close — nobody assessed them")).toBeTruthy();
  });

  it("keeps a decided row on screen and drops it from the count", async () => {
    // On the board a decision moved the card in front of you. In a list the
    // row just stops existing, which looks the same as closing the wrong
    // person -- so it stays, with what was recorded, until Refresh.
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Needs a decision/ }));
    const row = (await screen.findByText("Never Answered")).closest("div")!;
    fireEvent.click(within(row).getByText("Decide"));

    fireEvent.click(await screen.findByText("Close — nobody assessed them"));
    fireEvent.click(await screen.findByText("We did not get back to them in time"));
    fireEvent.click(screen.getByRole("button", { name: /^Save$|Record|Save outcome/ }));

    // The POST actually went, with the outcome kept apart from a judgement.
    await waitFor(() => {
      // Not the reasons GET, whose URL contains this one as a prefix.
      const call = mockFetch.mock.calls.find(
        (c) => String(c[0]).endsWith("/interview-outcome"));
      expect(call).toBeTruthy();
      expect(JSON.parse(String(call![1].body))).toMatchObject(
        { outcome: "lapse", reason: "lapsed" });
    });
    // And the modal is gone -- otherwise the reason chip inside it would
    // satisfy every text assertion below and this would pass for nothing.
    await waitFor(() =>
      expect(screen.queryByText("Close — nobody assessed them")).toBeNull());

    // Still listed, now showing the outcome rather than a Decide button.
    const still = screen.getByText("Never Answered").closest("div")!;
    expect(within(still).getByText(/We did not get back to them in time/)).toBeTruthy();
    expect(within(still).queryByText("Decide")).toBeNull();

    // And the tab counts work remaining, not rows on screen. Five owed a
    // decision, one has just been taken, so four are left while all five rows
    // are still on screen.
    const decide = screen.getByRole("button", { name: /Needs a decision/ });
    await waitFor(() => expect(within(decide).getByText("4")).toBeTruthy());
  });

  it("runs the hold's clock on the card, so the backlog is seen coming", async () => {
    // Same status, same recommendation, three different days. Before this the
    // three cards were identical and the first warning anybody got was the
    // card having already moved to another screen.
    await renderPage();
    const yesterday = screen.getByText("Held Yesterday").closest("div")!;
    expect(within(yesterday).getByText("Decide within 2 days")).toBeTruthy();
    const lastDay = screen.getByText("Hold Last Day").closest("div")!;
    expect(within(lastDay).getByText(
      "Decide today, or it moves to Needs a decision")).toBeTruthy();
    // And the card that owes nothing says nothing.
    const fresh = screen.getByText("Fresh Candidate").closest("div")!;
    expect(within(fresh).queryByText(/^Decide (within|today)/)).toBeNull();
  });

  it("says so when a review says reject and the card moved on anyway", async () => {
    await renderPage();
    const card = screen.getByText("Approving Despite No").closest("div")!;
    expect(within(card).getByText("Reject — still open")).toBeTruthy();
    // Not dressed as a candidate being kept: the colour has to differ from the
    // hire and hold cards or the chip is the only thing carrying it.
    expect(within(card).queryByText("Move to offer")).toBeNull();
  });

  it("searches the closed list", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Closed/ }));
    const box = await screen.findByPlaceholderText("Search name, position or phone…");
    fireEvent.change(box, { target: { value: "zzz" } });
    expect(await screen.findByText("Nothing matches that.")).toBeTruthy();
  });
});
