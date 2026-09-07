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
  it("splits on how long since anything happened, not on status", async () => {
    await renderPage();
    // Both a2 and a1 are 'interviewed'; only the stale one is a decision.
    const decide = screen.getByRole("button", { name: /Needs a decision/ });
    expect(within(decide).getByText("2")).toBeTruthy();
    const active = screen.getByRole("button", { name: /Working on/ });
    expect(within(active).getByText("1")).toBeTruthy();
    const closed = screen.getByRole("button", { name: /Closed/ });
    expect(within(closed).getByText("1")).toBeTruthy();
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

    // And the tab counts work remaining, not rows on screen.
    const decide = screen.getByRole("button", { name: /Needs a decision/ });
    await waitFor(() => expect(within(decide).getByText("1")).toBeTruthy());
  });

  it("searches the closed list", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Closed/ }));
    const box = await screen.findByPlaceholderText("Search name, position or phone…");
    fireEvent.change(box, { target: { value: "zzz" } });
    expect(await screen.findByText("Nothing matches that.")).toBeTruthy();
  });
});
