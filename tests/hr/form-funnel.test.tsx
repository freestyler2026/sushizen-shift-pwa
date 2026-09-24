// tests/hr/form-funnel.test.tsx
//
// The count of people the application form turned away existed only as a
// heroku one-liner. That is the shape this repo keeps recording as a failure —
// a detector nothing is wired to (lessons 55, 58) — so it has a panel, and the
// panel has to be honest about the two ways it can be empty.
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));
vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/lib/auth");
  return { ...actual, getAuthHeaders: () => ({ Authorization: "Bearer test" }) };
});

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import FormFunnel from "@/components/hr/FormFunnel";

const FULL = {
  days: 14, blocked_people: 31, recovered_people: 19, gave_up: 12, rows_ever: 57,
  recording_since: "2026-09-24T00:00:00Z",
  by_field: [
    { field: "cv", people: 22, gave_up: 9 },
    { field: "facebook_url", people: 7, gave_up: 3 },
    { field: "phone", people: 2, gave_up: 0 },
  ],
};

function ok(body: unknown) {
  return { ok: true, json: async () => body } as unknown as Response;
}

describe("HR recruitment — stopped before they could send", () => {
  beforeEach(() => mockFetch.mockReset());

  it("leads with how many were lost, not how many were stopped", async () => {
    mockFetch.mockResolvedValue(ok(FULL));
    render(<FormFunnel />);
    expect(await screen.findByText("12")).toBeTruthy();
    expect(screen.getByText("Gave up")).toBeTruthy();
    expect(screen.getByText("19")).toBeTruthy();
    expect(screen.getByText("31")).toBeTruthy();
  });

  it("names the fields the way the applicant sees them", async () => {
    mockFetch.mockResolvedValue(ok(FULL));
    render(<FormFunnel />);
    expect(await screen.findByText("Your CV")).toBeTruthy();
    expect(screen.getByText("Facebook profile link")).toBeTruthy();
    // never the column name
    expect(screen.queryByText("facebook_url")).toBeNull();
  });

  it("says nothing has been recorded rather than implying nobody is stopped", async () => {
    mockFetch.mockResolvedValue(ok({ ...FULL, rows_ever: 0, blocked_people: 0, gave_up: 0,
                                     recovered_people: 0, by_field: [], recording_since: null }));
    render(<FormFunnel />);
    expect(await screen.findByText(/Nothing recorded yet/i)).toBeTruthy();
    expect(screen.queryByText("Gave up")).toBeNull();
  });

  it("does not report a failed read as zero people stopped", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as unknown as Response);
    render(<FormFunnel />);
    expect(await screen.findByText(/not the same as nobody being stopped/i)).toBeTruthy();
    expect(screen.queryByText("Gave up")).toBeNull();
    expect(screen.queryByText(/Nothing recorded yet/i)).toBeNull();
  });

  it("asks again for a different window", async () => {
    mockFetch.mockResolvedValue(ok(FULL));
    render(<FormFunnel />);
    await screen.findByText("Gave up");
    fireEvent.click(screen.getByText("30d"));
    await waitFor(() =>
      expect(mockFetch.mock.calls.some((c) => String(c[0]).includes("days=30"))).toBe(true),
    );
  });
});
