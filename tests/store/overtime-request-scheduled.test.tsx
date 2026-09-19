// The overtime request form, when the roster already holds overtime.
//
// Every request filed against a shift longer than a standard day so far has
// been a copy of the schedule: roster 09:00-20:00, request 18:00-20:00, twice a
// week. Those hours are the company's own, paid with the shift, and the form
// has to say so before it asks for anything.

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/store/overtime-request",
}));
vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock());

const AUTH = {
  staffName: "Rachelle Ann Caubat", city: "manila", role: "STAFF",
  accessToken: "tok", permissions: [], branch_code: "CUB",
};
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getAuth: vi.fn(() => AUTH),
    getAuthHeaders: vi.fn(() => ({ Authorization: "Bearer tok" })),
    refreshAuthFromApi: vi.fn(async () => AUTH),
  };
});

import OvertimeRequestPage from "@/app/store/overtime-request/page";

function mockApi(clockWindow: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    const u = String(url);
    const json = (b: unknown) =>
      new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
    if (u.includes("/api/store/overtime/clock-window")) return json({ ok: true, ...clockWindow });
    if (u.includes("/api/store/overtime/my-requests")) return json({ ok: true, requests: [] });
    return json({ ok: true });
  });
}

async function renderForm(clockWindow: Record<string, unknown>) {
  vi.stubGlobal("fetch", mockApi(clockWindow));
  render(<OvertimeRequestPage />);
  await screen.findByText(/OT Start Time/i, {}, { timeout: 4000 });
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("Overtime request — hours the roster already holds", () => {
  it("says the shift already includes them, and that they need no request", async () => {
    await renderForm({ scheduled_ot_hours: 2, shift_segments: [[9, 20]] });
    await waitFor(() =>
      expect(screen.getByText(/already includes 2 hours of overtime/i)).toBeInTheDocument(),
      { timeout: 4000 },
    );
    expect(screen.getByText(/You do not need to ask for those/i)).toBeInTheDocument();
  });

  it("says what the form is then for — time after the shift was due to end", async () => {
    await renderForm({ scheduled_ot_hours: 2, shift_segments: [[9, 20]] });
    await screen.findByText(/already includes/i, {}, { timeout: 4000 });
    expect(screen.getByText(/after/i)).toBeInTheDocument();
  });

  it("says one hour, not 1 hours", async () => {
    await renderForm({ scheduled_ot_hours: 1, shift_segments: [[9, 19]] });
    await waitFor(() =>
      expect(screen.getByText(/already includes 1 hour of overtime/i)).toBeInTheDocument(),
      { timeout: 4000 },
    );
  });

  it("writes a half hour as 1.5, not 1.5000000001", async () => {
    await renderForm({ scheduled_ot_hours: 1.5, shift_segments: [[9, 19.5]] });
    await waitFor(() =>
      expect(screen.getByText(/already includes 1.5 hours of overtime/i)).toBeInTheDocument(),
      { timeout: 4000 },
    );
  });

  it("stays quiet on an ordinary nine-hour day", async () => {
    // 95% of Manila person-days. Saying something here would be noise on a form
    // that is otherwise correct to fill in.
    await renderForm({ scheduled_ot_hours: 0, shift_segments: [[9, 18]] });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/already includes/i)).toBeNull();
  });

  it("stays quiet when the day has no roster at all", async () => {
    await renderForm({ shift_segments: [], unavailable: "no published shift for that day" });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/already includes/i)).toBeNull();
  });
});
