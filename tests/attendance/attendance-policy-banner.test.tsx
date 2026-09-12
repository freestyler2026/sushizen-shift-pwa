/**
 * The policy banner on /attendance.
 *
 * Published policies used to live only behind a menu item. Four reached their
 * deadline with 1 of 62 acknowledged and a fifth sat at 0 with two days left,
 * while the one person who did find the page cleared four documents in ninety
 * seconds. Reading was never the expensive part; arriving was. So the count
 * now sits on the screen everybody opens twice a day.
 *
 * What these tests hold in place:
 * - it shows only what is actually outstanding for this person
 * - the deadline wording matches how far past or short of it they are
 * - tapping reaches the page that can clear it
 * - a failure to load it never costs anybody their clock-in
 */

import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { routerMock } from "../setup";
import { buildFetchMock } from "../helpers/fetch-mock";

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/attendance",
  useParams: () => ({}),
}));
vi.mock("@/lib/api", () => ({ API_BASE: "" }));

function signIn() {
  window.localStorage.setItem(
    "sushizen_shift_auth",
    JSON.stringify({
      staffName: "Juan dela Cruz", city: "manila", role: "STAFF",
      accessToken: "t", permissions: ["channel.week"],
    }),
  );
}

/** A date `offset` days from now, as the API sends it (YYYY-MM-DD). */
function deadline(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

const TODAY = { today: "2026-05-10", passkey_count: 1, session: null, visits: [] };

function mountWith(documents: unknown[], policyStatus = 200) {
  vi.stubGlobal("fetch", buildFetchMock([
    { match: "/api/store/policy-docs", body: { documents }, status: policyStatus },
    { match: "/api/attendance/today", body: TODAY },
    { match: "/api/admin/attendance/branch-gps", body: { branches: [] } },
  ]));
}

async function renderPage() {
  const { default: Page } = await import("../../src/app/attendance/page");
  render(<Page />);
}

const OUTSTANDING = {
  id: 38, title: "Official Attendance Recording Policy",
  requires_acknowledgement: true, acknowledged: false,
};

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  Object.defineProperty(window, "PublicKeyCredential", {
    value: class {}, writable: true, configurable: true,
  });
  signIn();
});

describe("attendance — policies waiting to be read", () => {
  it("names what is outstanding, and how many", async () => {
    mountWith([
      { ...OUTSTANDING, acknowledgement_deadline: deadline(5) },
      { id: 39, title: "Prohibition on Pre-Making Boxed Sushi",
        requires_acknowledgement: true, acknowledged: false,
        acknowledgement_deadline: deadline(5) },
    ]);
    await renderPage();

    expect(await screen.findByText("2 policies to read")).toBeTruthy();
    expect(screen.getByText(/Official Attendance Recording Policy/)).toBeTruthy();
  });

  it("stays silent once everything is acknowledged", async () => {
    mountWith([
      { ...OUTSTANDING, acknowledged: true, acknowledgement_deadline: deadline(5) },
    ]);
    await renderPage();

    await waitFor(() => expect(screen.queryByText(/policy to read/)).toBeNull());
    expect(screen.queryByText(/policies to read/)).toBeNull();
  });

  it("ignores documents that were never meant to be signed", async () => {
    // A reference document with requires_acknowledgement false is published to
    // be available, not to be chased. Counting it would make the badge lie.
    mountWith([
      { id: 2, title: "Internal communications memo",
        requires_acknowledgement: false, acknowledged: false,
        acknowledgement_deadline: null },
    ]);
    await renderPage();

    await waitFor(() => expect(screen.queryByText(/to read/)).toBeNull());
  });

  it("says how far past the deadline it is", async () => {
    mountWith([{ ...OUTSTANDING, acknowledgement_deadline: deadline(-12) }]);
    await renderPage();

    expect(await screen.findByText("1 policy to read")).toBeTruthy();
    expect(screen.getByText("12 days overdue")).toBeTruthy();
  });

  it("says due today on the day itself", async () => {
    mountWith([{ ...OUTSTANDING, acknowledgement_deadline: deadline(0) }]);
    await renderPage();

    expect(await screen.findByText("Due today")).toBeTruthy();
  });

  it("takes them to the page that can clear it", async () => {
    mountWith([{ ...OUTSTANDING, acknowledgement_deadline: deadline(2) }]);
    await renderPage();

    fireEvent.click(await screen.findByText("1 policy to read"));
    expect(routerMock.push).toHaveBeenCalledWith("/store/policy-docs");
  });

  it("a policy that will not load never costs anybody their clock-in", async () => {
    mountWith([], 500);
    await renderPage();

    // No banner, and the screen they came for is still there.
    await waitFor(() => expect(screen.queryByText(/to read/)).toBeNull());
    expect(screen.queryAllByText(/Time-in|Clock In|Not Clocked In/i).length).toBeGreaterThan(0);
  });
});
