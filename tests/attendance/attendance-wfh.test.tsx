/**
 * Tests for WFH Mode (Option C) on /attendance/page.tsx
 *
 * Covers:
 *  - WFH button shown when not yet checked in and WFH not active
 *  - WFH button hidden once WFH is active
 *  - WFH badge shown when WFH active (pre-clock-in)
 *  - GPS required block hidden when WFH active
 *  - Clock In enabled without GPS when WFH active
 *  - Clock Out enabled without GPS when WFH active
 *  - wfh_status fetched on page load (initial state = false)
 *  - wfh_status fetched on page load (initial state = true → badge shown immediately)
 *  - Clicking "Today is WFH" calls POST /api/attendance/wfh_declare
 *  - After successful declare, WFH badge appears + button disappears
 *  - After successful declare, success toast shown
 *  - Error shown when wfh_declare returns 4xx
 *  - Existing Clock In flow unbroken (GPS required when WFH is off)
 *  - WFH badge hidden once checked out
 */

import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildFetchMock } from "../helpers/fetch-mock";
import { routerMock } from "../setup";

// ── next/navigation ───────────────────────────────────────────────────────────
vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/attendance",
  useParams: () => ({}),
}));

vi.mock("@/lib/api", () => ({ API_BASE: "" }));

// ── WebAuthn support ──────────────────────────────────────────────────────────
function setWebAuthnSupported(v: boolean) {
  Object.defineProperty(window, "PublicKeyCredential", {
    value: v ? class {} : undefined,
    writable: true, configurable: true,
  });
}

// ── Geolocation: blocked (no GPS) ────────────────────────────────────────────
function setGeolocationBlocked() {
  Object.defineProperty(navigator, "geolocation", {
    value: {
      getCurrentPosition: (_: unknown, err: (e: { code: number; message: string }) => void) => {
        err({ code: 1, message: "User denied" });
      },
    },
    writable: true, configurable: true,
  });
}

// ── Geolocation: available ────────────────────────────────────────────────────
function setGeolocationSuccess(lat = 14.5995, lng = 120.9842) {
  Object.defineProperty(navigator, "geolocation", {
    value: {
      getCurrentPosition: (ok: (pos: GeolocationPosition) => void) => {
        ok({
          coords: { latitude: lat, longitude: lng, accuracy: 15 },
          timestamp: Date.now(),
        } as GeolocationPosition);
      },
    },
    writable: true, configurable: true,
  });
}

// ── Auth helper ───────────────────────────────────────────────────────────────
function setStaffAuth(city: "manila" | "dubai" = "manila") {
  window.localStorage.setItem("sushizen_shift_auth", JSON.stringify({
    staffName: "Camilla Santos",
    city,
    role: "STAFF",
    accessToken: "test-token",
    permissions: [],
  }));
}

// ── Fixtures ──────────────────────────────────────────────────────────────────
const TODAY_NO_SESSION = {
  today: "2026-05-16",
  passkey_count: 1,
  session: null,
  visits: [],
};

const TODAY_CHECKED_IN = {
  today: "2026-05-16",
  passkey_count: 1,
  session: {
    id: "uuid-1",
    city: "manila",
    branch_code: "MNL01",
    staff_name: "Camilla Santos",
    work_date: "2026-05-16",
    check_in_at: "2026-05-16T01:00:00.000Z",
    check_out_at: null,
    check_in_gps_ok: null,
    check_out_gps_ok: null,
    check_in_distance_m: null,
    check_out_distance_m: null,
  },
  visits: [],
};

const TODAY_CHECKED_OUT = {
  ...TODAY_CHECKED_IN,
  session: {
    ...TODAY_CHECKED_IN.session,
    check_out_at: "2026-05-16T10:00:00.000Z",
    check_out_gps_ok: null,
  },
};

const WFH_OFF = { ok: true, wfh_today: false, date: "2026-05-16" };
const WFH_ON  = { ok: true, wfh_today: true,  date: "2026-05-16" };

/** Build fetch mock: today + wfh_status + optional branch-gps */
function mkFetch(
  todayData: object = TODAY_NO_SESSION,
  wfhData: object = WFH_OFF,
  extraRoutes: Array<{ match: string; body: object; status?: number; method?: string }> = [],
) {
  return buildFetchMock([
    { match: "/api/attendance/today",      body: todayData },
    { match: "/api/attendance/wfh_status", body: wfhData },
    { match: "/api/admin/attendance/branch-gps", body: { branches: [] } },
    ...extraRoutes,
  ]);
}

async function importPage() {
  const { default: Page } = await import("../../src/app/attendance/page");
  return Page;
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("AttendancePage — WFH Mode", () => {

  beforeEach(() => {
    setWebAuthnSupported(true);
    setGeolocationBlocked();   // no GPS by default in WFH tests
    setStaffAuth("manila");
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  // ── 1. WFH button visible before clock-in ──────────────────────────────────

  it("shows 'Today is WFH' button when not checked in and WFH is off", async () => {
    vi.stubGlobal("fetch", mkFetch(TODAY_NO_SESSION, WFH_OFF));
    const Page = await importPage();
    render(<Page />);
    await waitFor(() => {
      expect(screen.getByText(/Today is WFH/i)).toBeInTheDocument();
    });
  });

  // ── 2. WFH button hidden when already active ───────────────────────────────

  it("hides 'Today is WFH' button when WFH is already active", async () => {
    vi.stubGlobal("fetch", mkFetch(TODAY_NO_SESSION, WFH_ON));
    const Page = await importPage();
    render(<Page />);
    await waitFor(() => {
      expect(screen.queryByText(/Today is WFH/i)).not.toBeInTheDocument();
    });
  });

  // ── 3. WFH badge when WFH active + not checked out ────────────────────────

  it("shows WFH badge when wfh_status is true and not yet checked out", async () => {
    vi.stubGlobal("fetch", mkFetch(TODAY_NO_SESSION, WFH_ON));
    const Page = await importPage();
    render(<Page />);
    await waitFor(() => {
      expect(screen.getByText(/Working From Home Today/i)).toBeInTheDocument();
    });
  });

  // ── 4. WFH badge hidden when checked out ─────────────────────────────────

  it("hides WFH badge once staff is checked out", async () => {
    vi.stubGlobal("fetch", mkFetch(TODAY_CHECKED_OUT, WFH_ON));
    const Page = await importPage();
    render(<Page />);
    await waitFor(() => {
      expect(screen.queryByText(/Working From Home Today/i)).not.toBeInTheDocument();
    });
  });

  // ── 5. GPS required block hidden when WFH active ─────────────────────────

  it("hides GPS required block when WFH is active", async () => {
    vi.stubGlobal("fetch", mkFetch(TODAY_NO_SESSION, WFH_ON));
    const Page = await importPage();
    render(<Page />);
    await waitFor(() => {
      // The GPS call-to-action heading
      expect(screen.queryByText(/Step 1: Get Your Location/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Get My Location/i)).not.toBeInTheDocument();
    });
  });

  // ── 6. Clock In enabled without GPS when WFH active ─────────────────────

  it("enables Clock In button without GPS when WFH is active", async () => {
    vi.stubGlobal("fetch", mkFetch(TODAY_NO_SESSION, WFH_ON));
    const Page = await importPage();
    render(<Page />);
    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /clock in/i });
      expect(btn).not.toBeDisabled();
    });
  });

  // ── 7. Clock In disabled without GPS when WFH is NOT active ─────────────

  it("disables Clock In button without GPS when WFH is off", async () => {
    vi.stubGlobal("fetch", mkFetch(TODAY_NO_SESSION, WFH_OFF));
    const Page = await importPage();
    render(<Page />);
    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /clock in/i });
      expect(btn).toBeDisabled();
    });
  });

  // ── 8. Clock Out enabled without GPS when WFH active ────────────────────

  it("enables Clock Out button without GPS when WFH is active", async () => {
    vi.stubGlobal("fetch", mkFetch(TODAY_CHECKED_IN, WFH_ON));
    const Page = await importPage();
    render(<Page />);
    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /clock out/i });
      expect(btn).not.toBeDisabled();
    });
  });

  // ── 9. Clock Out disabled without GPS when WFH is off ───────────────────

  it("disables Clock Out button without GPS when WFH is off", async () => {
    vi.stubGlobal("fetch", mkFetch(TODAY_CHECKED_IN, WFH_OFF));
    const Page = await importPage();
    render(<Page />);
    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /clock out/i });
      expect(btn).toBeDisabled();
    });
  });

  // ── 10. Clicking WFH button calls the declare API ─────────────────────────

  it("calls POST /api/attendance/wfh_declare when button is clicked", async () => {
    const fetchMock = mkFetch(TODAY_NO_SESSION, WFH_OFF, [
      { match: "/api/attendance/wfh_declare", method: "POST", body: WFH_ON },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    const Page = await importPage();
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText(/Today is WFH/i)).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText(/Today is WFH/i));
    });

    await waitFor(() => {
      const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls;
      const declareCalls = calls.filter(
        ([url, opts]: [string, RequestInit]) =>
          url.includes("/api/attendance/wfh_declare") && opts?.method === "POST"
      );
      expect(declareCalls.length).toBeGreaterThan(0);
    });
  });

  // ── 11. WFH badge appears after successful declare ────────────────────────

  it("shows WFH badge after successful declare", async () => {
    const fetchMock = mkFetch(TODAY_NO_SESSION, WFH_OFF, [
      { match: "/api/attendance/wfh_declare", method: "POST", body: WFH_ON },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    const Page = await importPage();
    render(<Page />);

    await waitFor(() => screen.getByText(/Today is WFH/i));

    await act(async () => {
      fireEvent.click(screen.getByText(/Today is WFH/i));
    });

    await waitFor(() => {
      expect(screen.getByText(/Working From Home Today/i)).toBeInTheDocument();
    });
  });

  // ── 12. WFH button disappears after successful declare ────────────────────

  it("hides 'Today is WFH' button after successful declare", async () => {
    const fetchMock = mkFetch(TODAY_NO_SESSION, WFH_OFF, [
      { match: "/api/attendance/wfh_declare", method: "POST", body: WFH_ON },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    const Page = await importPage();
    render(<Page />);

    await waitFor(() => screen.getByText(/Today is WFH/i));

    await act(async () => {
      fireEvent.click(screen.getByText(/Today is WFH/i));
    });

    await waitFor(() => {
      expect(screen.queryByText(/Today is WFH/i)).not.toBeInTheDocument();
    });
  });

  // ── 13. Success toast after declare ──────────────────────────────────────

  it("shows success toast after WFH declared", async () => {
    const fetchMock = mkFetch(TODAY_NO_SESSION, WFH_OFF, [
      { match: "/api/attendance/wfh_declare", method: "POST", body: WFH_ON },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    const Page = await importPage();
    render(<Page />);

    await waitFor(() => screen.getByText(/Today is WFH/i));

    await act(async () => {
      fireEvent.click(screen.getByText(/Today is WFH/i));
    });

    await waitFor(() => {
      expect(screen.getByText(/WFH mode activated/i)).toBeInTheDocument();
    });
  });

  // ── 14. Error shown when declare fails ────────────────────────────────────

  it("shows error when wfh_declare returns 500", async () => {
    const fetchMock = buildFetchMock([
      { match: "/api/attendance/today",      body: TODAY_NO_SESSION },
      { match: "/api/attendance/wfh_status", body: WFH_OFF },
      { match: "/api/attendance/wfh_declare", method: "POST",
        body: { detail: "Database error" }, status: 500 },
      { match: "/api/admin/attendance/branch-gps", body: { branches: [] } },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    const Page = await importPage();
    render(<Page />);

    await waitFor(() => screen.getByText(/Today is WFH/i));

    await act(async () => {
      fireEvent.click(screen.getByText(/Today is WFH/i));
    });

    await waitFor(() => {
      expect(screen.getByText(/Database error/i)).toBeInTheDocument();
    });
  });

  // ── 15. Clock In still requires GPS when WFH is off ─────────────────────

  it("shows GPS required block (not WFH) when WFH is off and no GPS", async () => {
    vi.stubGlobal("fetch", mkFetch(TODAY_NO_SESSION, WFH_OFF));
    const Page = await importPage();
    render(<Page />);
    await waitFor(() => {
      expect(screen.getByText(/Step 1: Get Your Location/i)).toBeInTheDocument();
    });
  });

  // ── 16. GPS works normally when WFH is off + GPS acquired ────────────────

  it("enables Clock In when WFH is off but GPS acquired", async () => {
    setGeolocationSuccess();   // override to give GPS
    vi.stubGlobal("fetch", mkFetch(TODAY_NO_SESSION, WFH_OFF));
    const Page = await importPage();
    render(<Page />);

    // Trigger GPS acquisition
    await waitFor(() => screen.getByText(/Get My Location/i));
    await act(async () => {
      fireEvent.click(screen.getByText(/Get My Location/i));
    });

    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /clock in/i });
      expect(btn).not.toBeDisabled();
    });
  });

  // ── 17. wfh_status fetch happens on initial load ─────────────────────────

  it("fetches wfh_status on initial page load", async () => {
    const fetchMock = mkFetch(TODAY_NO_SESSION, WFH_OFF);
    vi.stubGlobal("fetch", fetchMock);
    const Page = await importPage();
    render(<Page />);

    await waitFor(() => {
      const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls;
      const wfhCalls = calls.filter(([url]: [string]) =>
        url.includes("/api/attendance/wfh_status")
      );
      expect(wfhCalls.length).toBeGreaterThan(0);
    });
  });

  // ── 18. WFH button NOT shown when already checked in ─────────────────────

  it("does not show WFH button when staff is already checked in", async () => {
    vi.stubGlobal("fetch", mkFetch(TODAY_CHECKED_IN, WFH_OFF));
    const Page = await importPage();
    render(<Page />);
    await waitFor(() => {
      // Checked-in state should show Clock Out, not WFH button
      expect(screen.queryByText(/Today is WFH/i)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /clock out/i })).toBeInTheDocument();
    });
  });
});
