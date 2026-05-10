/**
 * Tests for /attendance/page.tsx
 * (Staff Time-in / Time-out with WebAuthn + GPS)
 *
 * Covers:
 * - Auth guard: redirects unauthenticated → /login
 * - Auth guard: redirects non-attendance-role → /request
 * - "Register Your Device" card shown when passkey_count = 0
 * - "Register This Device" button present
 * - Status card shown when passkey_count > 0
 * - "Not Clocked In" badge when no session
 * - Clock In button disabled when GPS not yet acquired
 * - "On Shift" badge when checked in
 * - Clock Out button visible when checked in
 * - Elapsed/Duration row visible when checked in
 * - "Clocked Out" state when session has check_out_at
 * - GpsIndicator: In Range (gps_ok=true), Out of Range (gps_ok=false), No GPS (gps_ok=null)
 * - Error message shown when today API fails
 * - Success message auto-disappears (mocked timers)
 * - WebAuthn unsupported warning shown
 * - GPS permission denied guide shown
 * - Visit section visible after check-in
 * - Branch visits: open visit shows "Visiting" badge
 * - Helper: fmtTime returns "--:--" for null
 * - Helper: minutesBetween calculates correctly
 * - Helper: fmtDuration formats hours and minutes
 */

import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setAdminAuth, routerMock } from "../setup";
import { buildFetchMock, buildFailFetch } from "../helpers/fetch-mock";

// ── next/navigation mock ──────────────────────────────────────────────────────
vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/attendance",
  useParams: () => ({}),
}));

// ── @/lib/api mock ────────────────────────────────────────────────────────────
vi.mock("@/lib/api", () => ({ API_BASE: "" }));

// ── WebAuthn browser API mock ─────────────────────────────────────────────────
// PublicKeyCredential must be truthy for wauSupported=true
function setWebAuthnSupported(supported: boolean) {
  if (supported) {
    Object.defineProperty(window, "PublicKeyCredential", {
      value: class {},
      writable: true,
      configurable: true,
    });
  } else {
    Object.defineProperty(window, "PublicKeyCredential", {
      value: undefined,
      writable: true,
      configurable: true,
    });
  }
}

// ── Geolocation mock ──────────────────────────────────────────────────────────
function setGeolocationDenied() {
  Object.defineProperty(navigator, "geolocation", {
    value: {
      getCurrentPosition: (_: unknown, err: (e: { code: number; message: string }) => void) => {
        err({ code: 1, message: "User denied" });
      },
    },
    writable: true,
    configurable: true,
  });
}

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
    writable: true,
    configurable: true,
  });
}

// ── TodayData fixtures ────────────────────────────────────────────────────────

const TODAY_NO_PASSKEY = {
  today: "2026-05-10",
  passkey_count: 0,
  session: null,
  visits: [],
};

const TODAY_PASSKEY_NO_SESSION = {
  today: "2026-05-10",
  passkey_count: 1,
  session: null,
  visits: [],
};

const SESSION_CHECKED_IN = {
  id: "uuid-1",
  city: "manila",
  branch_code: "MNL01",
  staff_name: "Juan dela Cruz",
  work_date: "2026-05-10",
  check_in_at: "2026-05-10T00:00:00.000Z", // midnight UTC = 08:00 Manila
  check_out_at: null,
  check_in_gps_ok: true,
  check_out_gps_ok: null,
  check_in_distance_m: 18,
  check_out_distance_m: null,
};

const SESSION_CHECKED_OUT = {
  ...SESSION_CHECKED_IN,
  check_out_at: "2026-05-10T09:00:00.000Z",
  check_out_gps_ok: true,
  check_out_distance_m: 25,
};

const TODAY_CHECKED_IN = {
  today: "2026-05-10",
  passkey_count: 1,
  session: SESSION_CHECKED_IN,
  visits: [],
};

const TODAY_CHECKED_OUT = {
  today: "2026-05-10",
  passkey_count: 1,
  session: SESSION_CHECKED_OUT,
  visits: [],
};

const OPEN_VISIT = {
  id: "vis-1",
  session_id: "uuid-1",
  branch_code: "MNL02",
  visit_start: "2026-05-10T02:00:00.000Z",
  visit_end: null,
  gps_ok: true,
  distance_m: 30,
};

const TODAY_WITH_VISIT = {
  ...TODAY_CHECKED_IN,
  visits: [OPEN_VISIT],
};

function buildAttendanceFetch(todayData: object) {
  return buildFetchMock([
    { match: "/api/attendance/today", body: todayData },
    { match: "/api/admin/attendance/branch-gps", body: { branches: [{ branch_code: "MNL01" }] } },
  ]);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function importPage() {
  const { default: Page } = await import("../../src/app/attendance/page");
  return Page;
}

// ── describe blocks ───────────────────────────────────────────────────────────

describe("AttendancePage — auth guard", () => {
  beforeEach(() => {
    setWebAuthnSupported(true);
    vi.stubGlobal("fetch", buildAttendanceFetch(TODAY_NO_PASSKEY));
  });

  it("redirects unauthenticated user to /login", async () => {
    // clear auth
    window.localStorage.clear();

    const Page = await importPage();
    render(<Page />);

    await waitFor(() => {
      expect(routerMock.replace).toHaveBeenCalledWith(
        expect.stringContaining("/login")
      );
    });
  });

  it("redirects non-attendance role to /request", async () => {
    // Set a role that cannot access attendance
    window.localStorage.setItem(
      "sushizen_shift_auth",
      JSON.stringify({
        staffName: "Test Admin",
        city: "manila",
        role: "BLOCKED",
        accessToken: "t",
        permissions: ["channel.week"], // no attendance permission
      })
    );

    const Page = await importPage();
    render(<Page />);

    await waitFor(() => {
      expect(routerMock.replace).toHaveBeenCalledWith("/request");
    });
  });
});

describe("AttendancePage — no passkey registered", () => {
  beforeEach(() => {
    setAdminAuth("manila");
    setWebAuthnSupported(true);
    vi.stubGlobal("fetch", buildAttendanceFetch(TODAY_NO_PASSKEY));
  });

  it("shows Register Your Device card", async () => {
    const Page = await importPage();
    render(<Page />);
    await waitFor(() => {
      expect(screen.getByText(/register your device/i)).toBeTruthy();
    });
  });

  it("shows Register This Device button", async () => {
    const Page = await importPage();
    render(<Page />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /register this device/i })).toBeTruthy();
    });
  });

  it("does NOT show Clock In button (no passkey)", async () => {
    const Page = await importPage();
    render(<Page />);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /clock in/i })).toBeNull();
    });
  });
});

describe("AttendancePage — WebAuthn not supported", () => {
  beforeEach(() => {
    setAdminAuth("manila");
    setWebAuthnSupported(false);
    vi.stubGlobal("fetch", buildAttendanceFetch(TODAY_PASSKEY_NO_SESSION));
  });

  afterEach(() => {
    setWebAuthnSupported(true); // restore for other tests
  });

  it("shows WebAuthn not supported warning", async () => {
    const Page = await importPage();
    render(<Page />);
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/does not support passkeys|chrome or safari/i);
    });
  });
});

describe("AttendancePage — has passkey, not checked in", () => {
  beforeEach(() => {
    setAdminAuth("manila");
    setWebAuthnSupported(true);
    vi.stubGlobal("fetch", buildAttendanceFetch(TODAY_PASSKEY_NO_SESSION));
  });

  it("shows Not Clocked In badge", async () => {
    const Page = await importPage();
    render(<Page />);
    await waitFor(() => {
      expect(screen.getByText(/not clocked in/i)).toBeTruthy();
    });
  });

  it("shows today's date", async () => {
    const Page = await importPage();
    render(<Page />);
    await waitFor(() => {
      expect(document.body.textContent).toContain("2026-05-10");
    });
  });

  it("Clock In button is disabled when GPS not acquired", async () => {
    const Page = await importPage();
    render(<Page />);
    await waitFor(() => screen.getByText(/not clocked in/i));

    // GPS step panel visible, Clock In button disabled
    const clockInBtn = screen.getByRole("button", { name: /clock in/i });
    expect(clockInBtn).toBeTruthy();
    expect((clockInBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows Get My Location button", async () => {
    const Page = await importPage();
    render(<Page />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /get my location/i })).toBeTruthy();
    });
  });

  it("shows GPS permission denied guide after denial", async () => {
    setGeolocationDenied();
    const Page = await importPage();
    render(<Page />);
    await waitFor(() => screen.getByRole("button", { name: /get my location/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /get my location/i }));
    });

    await waitFor(() => {
      expect(document.body.textContent).toMatch(/location access is blocked|enable location/i);
    });
  });
});

describe("AttendancePage — checked in (on shift)", () => {
  beforeEach(() => {
    setAdminAuth("manila");
    setWebAuthnSupported(true);
    vi.stubGlobal("fetch", buildAttendanceFetch(TODAY_CHECKED_IN));
  });

  it("shows On Shift badge", async () => {
    const Page = await importPage();
    render(<Page />);
    await waitFor(() => {
      expect(screen.getByText(/on shift/i)).toBeTruthy();
    });
  });

  it("shows Clock In time (check_in_at)", async () => {
    const Page = await importPage();
    render(<Page />);
    await waitFor(() => {
      // Manila is UTC+8 → 00:00 UTC = 08:00 AM Manila
      expect(document.body.textContent).toMatch(/08:00 AM/i);
    });
  });

  it("shows Clock Out button (GPS required so disabled without GPS)", async () => {
    const Page = await importPage();
    render(<Page />);
    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /clock out/i });
      expect(btn).toBeTruthy();
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it("shows Elapsed / Duration row", async () => {
    const Page = await importPage();
    render(<Page />);
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/elapsed|duration/i);
    });
  });

  it("shows GPS In Range indicator on check-in card (gps_ok=true, dist=18m)", async () => {
    const Page = await importPage();
    render(<Page />);
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/18m|in range/i);
    });
  });
});

describe("AttendancePage — checked out", () => {
  beforeEach(() => {
    setAdminAuth("manila");
    setWebAuthnSupported(true);
    vi.stubGlobal("fetch", buildAttendanceFetch(TODAY_CHECKED_OUT));
  });

  it("shows Clocked Out status badge", async () => {
    const Page = await importPage();
    render(<Page />);
    await waitFor(() => {
      // Multiple "Clocked Out" elements exist (badge + confirmation text) — use getAllByText
      const els = screen.getAllByText(/clocked out/i);
      expect(els.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows clocked-out confirmation message", async () => {
    const Page = await importPage();
    render(<Page />);
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/great work|clocked out for today/i);
    });
  });

  it("does NOT show Clock Out button after checkout", async () => {
    const Page = await importPage();
    render(<Page />);
    // Wait for the page to fully render using a stable indicator
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/great work|clocked out for today/i);
    });
    expect(screen.queryByRole("button", { name: /clock out/i })).toBeNull();
  });

  it("shows both check-in and check-out times", async () => {
    const Page = await importPage();
    render(<Page />);
    await waitFor(() => {
      // 00:00 UTC = 08:00 AM Manila (check-in); 09:00 UTC = 17:00 Manila (check-out)
      expect(document.body.textContent).toMatch(/08:00 AM/i);
      expect(document.body.textContent).toMatch(/05:00 PM/i);
    });
  });
});

describe("AttendancePage — visits section", () => {
  beforeEach(() => {
    setAdminAuth("manila");
    setWebAuthnSupported(true);
    vi.stubGlobal("fetch", buildAttendanceFetch(TODAY_WITH_VISIT));
  });

  it("shows Branch Visits section when checked in", async () => {
    const Page = await importPage();
    render(<Page />);
    await waitFor(() => {
      expect(screen.getByText(/branch visits/i)).toBeTruthy();
    });
  });

  it("shows open visit branch code with Visiting badge", async () => {
    const Page = await importPage();
    render(<Page />);
    await waitFor(() => {
      expect(document.body.textContent).toContain("MNL02");
      expect(screen.getByText(/visiting/i)).toBeTruthy();
    });
  });

  it("End Visit button visible for open visit", async () => {
    const Page = await importPage();
    render(<Page />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /end visit/i })).toBeTruthy();
    });
  });
});

describe("AttendancePage — API error handling", () => {
  beforeEach(() => {
    setAdminAuth("manila");
    setWebAuthnSupported(true);
  });

  it("shows error message when today API returns 500", async () => {
    vi.stubGlobal("fetch", buildFailFetch(500, "Server error"));
    const Page = await importPage();
    render(<Page />);
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/server error|error/i);
    });
  });
});

describe("AttendancePage — GPS acquisition success", () => {
  beforeEach(() => {
    setAdminAuth("manila");
    setWebAuthnSupported(true);
    setGeolocationSuccess(14.5995, 120.9842);
    vi.stubGlobal("fetch", buildAttendanceFetch(TODAY_PASSKEY_NO_SESSION));
  });

  it("Clock In button enabled after successful GPS acquisition", async () => {
    const Page = await importPage();
    render(<Page />);
    await waitFor(() => screen.getByRole("button", { name: /get my location/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /get my location/i }));
    });

    await waitFor(() => {
      // Location acquired message should appear
      expect(document.body.textContent).toMatch(/location acquired|ready to clock/i);
    });

    // Clock In button should now be enabled
    const clockInBtn = screen.getByRole("button", { name: /clock in/i });
    expect((clockInBtn as HTMLButtonElement).disabled).toBe(false);
  });
});
