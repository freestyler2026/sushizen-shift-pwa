// tests/hr/offer-approval.test.tsx
//
// The approval used to happen in Discord. Peter asked "are you ok to hire
// this one for TAFT", the owner answered there, and the reason a person was
// hired lived in a chat log that the CV, the interview notes and the offer
// could not reach.
//
// Three properties this board has to hold, and none of them can be seen from
// the API alone — they are all about what the person looking at the card can
// do next:
//
//   1. A card waiting for approval offers the decision, not a button that
//      moves it along without one.
//   2. Somebody without the permission is told whose move it is, rather than
//      given a button that fails when pressed.
//   3. "Proceed to offer" asks for approval. It must not post the outcome,
//      because the server needs a salary the outcome form does not collect
//      and the 400 would come back as a dead end.
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { setAdminAuth } from "../setup";

vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));
vi.mock("@/lib/interview-ics", () => ({ downloadIcs: vi.fn() }));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const WAITING = {
  id: "app-appr",
  city: "manila",
  requisition_id: null,
  full_name: "Ronidel S. Sanciangco",
  position_applied: "Commissary Manager",
  phone: "",
  email: "",
  source: "facebook",
  status: "approval",
  applied_date: "2026-09-20",
  assigned_branch: "CUB",
  notes: "",
  rejection_reason: "",
  created_at: "2026-09-20T00:00:00Z",
  updated_at: "2026-09-23T00:00:00Z",
  approval_requested_by: "Peter Villafuerte",
  approval_requested_at: "2026-09-23T02:00:00Z",
  approval_decision: "",
  has_offer_letter: true,
  offer_letter_filename: "offer.pdf",
  comment_count: 2,
  resume_screening_id: 77,
};

function routeJson(url: string) {
  if (url.includes("/applicants")) return { applicants: [WAITING] };
  if (url.includes("/requisitions")) return { requisitions: [] };
  if (url.includes("/overview")) return { plans: [], stalled: [], stalled_count: 0, awaiting_offer: [] };
  return {};
}

function install(perms: string[], role = "ADMIN") {
  setAdminAuth("manila");
  localStorage.setItem("sushizen_shift_auth", JSON.stringify({
    staffName: "Test User", city: "manila", role,
    accessToken: "test-token", permissions: perms,
  }));
  mockFetch.mockImplementation(async (url: string) =>
    new Response(JSON.stringify(routeJson(String(url))),
                 { status: 200, headers: { "Content-Type": "application/json" } }));
}

async function mount() {
  const { default: Page } = await import("@/app/admin/hr/recruitment/page");
  render(<Page />);
  await waitFor(() => expect(screen.getByText("Ronidel S. Sanciangco")).toBeTruthy());
}

/** Waited past the stale threshold, so the board files it under
 *  "Needs a decision" instead of the Awaiting approval column. */
const STALE = { ...WAITING, id: "app-stale", full_name: "Stale Approval",
                days_since_move: 30, days_in_pipeline: 30 };

describe("Awaiting approval", () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it("gives the board a column for it", async () => {
    install(["*"]);
    await mount();
    expect(screen.getByText("Awaiting approval")).toBeTruthy();
  });

  it("says who asked, so the card does not just sit there anonymously", async () => {
    install(["*"]);
    await mount();
    expect(screen.getByText(/Peter Villafuerte asked for approval/)).toBeTruthy();
  });

  it("offers the decision instead of a button that moves it along", async () => {
    install(["*"]);
    await mount();
    expect(screen.getByText("Approve or send back")).toBeTruthy();
    // "Offer Sent" is also the next column's heading, so look for it as a
    // BUTTON: that is the generic move-it-along control, and pressing it
    // would advance the card without anybody deciding anything.
    const asButton = screen.getAllByText("Offer Sent")
      .filter((el) => el.closest("button") !== null);
    expect(asButton).toHaveLength(0);
  });

  it("puts the CV and the letter one tap from the decision", async () => {
    install(["*"]);
    await mount();
    const cv = screen.getByText("CV").closest("a");
    expect(cv?.getAttribute("href")).toContain("/voice-screenings/77/resume");
    const letter = screen.getByText("Offer letter").closest("a");
    expect(letter?.getAttribute("href")).toContain("/offer-approval/letter");
  });

  it("tells somebody who cannot approve whose move it is", async () => {
    // A button that fails when pressed is worse than no button (lesson 21).
    install(["channel.admin.hr_recruitment.view"], "HR_MANAGER");
    await mount();
    expect(screen.getByText(/Someone with approval rights decides this one/)).toBeTruthy();
    expect(screen.queryByText("Approve or send back")).toBeNull();
  });

  it("opens the decision panel with both outcomes named", async () => {
    install(["*"]);
    await mount();
    fireEvent.click(screen.getByText("Approve or send back"));
    await waitFor(() => expect(screen.getByText("Approve")).toBeTruthy());
    expect(screen.getByText("Send back")).toBeTruthy();
    expect(screen.getByText(/Returns to Interviewed/)).toBeTruthy();
  });

  it("does not post the decision until a button is pressed", async () => {
    install(["*"]);
    await mount();
    fireEvent.click(screen.getByText("Approve or send back"));
    await waitFor(() => expect(screen.getByText("Approve")).toBeTruthy());
    expect(mockFetch.mock.calls.some(
      (c) => String(c[0]).includes("/offer-approval/decide"))).toBe(false);
  });

  it("sends the decision with the comment when Approve is pressed", async () => {
    install(["*"]);
    await mount();
    fireEvent.click(screen.getByText("Approve or send back"));
    await waitFor(() => expect(screen.getByText("Approve")).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText(/We can proceed/), {
      target: { value: "Agreed, go ahead." },
    });
    fireEvent.click(screen.getByText("Approve"));
    await waitFor(() => {
      const call = mockFetch.mock.calls.find(
        (c) => String(c[0]).includes("/offer-approval/decide"));
      expect(call).toBeTruthy();
      const body = JSON.parse(String((call?.[1] as RequestInit)?.body));
      expect(body.decision).toBe("approved");
      expect(body.note).toBe("Agreed, go ahead.");
    });
  });

  it("can still be approved once it has waited past the stale threshold", async () => {
    // These are the approvals the feature exists for. They used to land in
    // "Needs a decision", whose only control opens the interview-outcome
    // panel — which offers reject and lapse and nothing else.
    install(["*"]);
    mockFetch.mockImplementation(async (url: string) =>
      new Response(JSON.stringify(
        String(url).includes("/applicants") ? { applicants: [STALE] } : routeJson(String(url))),
        { status: 200, headers: { "Content-Type": "application/json" } }));
    const { default: Page } = await import("@/app/admin/hr/recruitment/page");
    render(<Page />);
    await waitFor(() => expect(screen.getByText(/Needs a decision/)).toBeTruthy());
    fireEvent.click(screen.getByText(/Needs a decision/));
    await waitFor(() => expect(screen.getByText("Stale Approval")).toBeTruthy());
    expect(screen.getByText("Approve or send back")).toBeTruthy();
    // "Decide" is the interview-outcome panel; it must not be the only way out.
    expect(screen.queryByText("Decide")).toBeNull();
  });

  it("does not offer a stale approval to somebody who cannot approve", async () => {
    install(["channel.admin.hr_recruitment.view"], "HR_MANAGER");
    mockFetch.mockImplementation(async (url: string) =>
      new Response(JSON.stringify(
        String(url).includes("/applicants") ? { applicants: [STALE] } : routeJson(String(url))),
        { status: 200, headers: { "Content-Type": "application/json" } }));
    const { default: Page } = await import("@/app/admin/hr/recruitment/page");
    render(<Page />);
    await waitFor(() => expect(screen.getByText(/Needs a decision/)).toBeTruthy());
    fireEvent.click(screen.getByText(/Needs a decision/));
    await waitFor(() => expect(screen.getByText("Stale Approval")).toBeTruthy());
    expect(screen.getByText("waiting on an approver")).toBeTruthy();
    expect(screen.queryByText("Approve or send back")).toBeNull();
  });
});
