// tests/hr/kept-highlight.test.tsx
//
// A grey "Recorded" badge said exactly the same thing about the person we are
// hiring and the person we turned down. So the three screens that show an
// interviewed candidate — the day's interviews, the calendar, and the
// Interviewed column — could not show who was still in the running, which is
// the one question anyone opens them to answer.
//
// "Hold — decide later" and above is what counts as still in the running:
// 'consider' and 'hire'. 'no_hire' and 'not_assessed' close the person.
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));
vi.mock("@/lib/interview-ics", () => ({ downloadIcs: vi.fn() }));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import InterviewDay from "@/components/hr/InterviewDay";

const ROW = {
  id: "iv-1",
  applicant_id: "app-1",
  full_name: "Fuena Mae Tolin",
  phone: "09943365344",
  position_applied: "cashier",
  position_group: "cashier",
  experience_level: "1_3y",
  starts_at: "2026-09-23T07:00:00Z",
  ends_at: null,
  day: "2026-09-23",
  is_today: true,
  interviewer_staff: "Peter Villafuerte",
  contact_via: "call",
  reach_with: "Office phone",
  voice_decision: null,
  voice_summary: null,
  attended: true,
  recorded: true,
};

function serve(recommendation: string) {
  mockFetch.mockImplementation((url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method !== "POST" && /\/interviews\/[^/]+\/outcome$/.test(u)) {
      return Promise.resolve(new Response(JSON.stringify({ outcome: null }),
        { status: 200, headers: { "content-type": "application/json" } }));
    }
    if (u.includes("interview-outcome-reasons")) {
      return Promise.resolve(new Response(JSON.stringify({ reasons: [] }),
        { status: 200, headers: { "content-type": "application/json" } }));
    }
    if (u.includes("/interviews/upcoming")) {
      return Promise.resolve(new Response(
        JSON.stringify({ rows: [{ ...ROW, recommendation }] }),
        { status: 200, headers: { "content-type": "application/json" } }));
    }
    return Promise.resolve(new Response(JSON.stringify({ rows: [] }),
      { status: 200, headers: { "content-type": "application/json" } }));
  });
}

async function mount() {
  render(<InterviewDay />);
  await waitFor(() => expect(screen.getByText("Fuena Mae Tolin")).toBeTruthy());
}

describe("An interviewed candidate who is still in the running", () => {
  beforeEach(() => mockFetch.mockReset());

  it("says 'Move to offer' rather than a grey Recorded", async () => {
    serve("hire");
    await mount();
    expect(screen.getByText("Move to offer")).toBeTruthy();
    expect(screen.queryByText("Recorded")).toBeNull();
  });

  it("says 'Hold — decide later' for a hold", async () => {
    serve("consider");
    await mount();
    expect(screen.getByText("Hold — decide later")).toBeTruthy();
    expect(screen.queryByText("Recorded")).toBeNull();
  });

  it("leaves a rejected candidate as a plain Recorded", async () => {
    // The point of the highlight is that it marks a smaller set than
    // "something was recorded". If a rejection lit up too, it would mark
    // everything and single out nobody.
    serve("no_hire");
    await mount();
    expect(screen.getByText("Recorded")).toBeTruthy();
    expect(screen.queryByText("Move to offer")).toBeNull();
    expect(screen.queryByText("Hold — decide later")).toBeNull();
  });

  it("leaves a no-show as a plain Recorded", async () => {
    serve("not_assessed");
    await mount();
    expect(screen.getByText("Recorded")).toBeTruthy();
  });

  it("colours the row so it can be picked out without reading it", async () => {
    serve("hire");
    await mount();
    const card = document.getElementById("iv-iv-1");
    expect(card?.className).toContain("emerald");
  });

  it("colours a hold differently from a hire", async () => {
    serve("consider");
    await mount();
    const card = document.getElementById("iv-iv-1");
    expect(card?.className).toContain("amber");
    expect(card?.className).not.toContain("emerald");
  });

  it("does not colour a rejection", async () => {
    serve("no_hire");
    await mount();
    const card = document.getElementById("iv-iv-1");
    expect(card?.className).not.toContain("emerald");
    expect(card?.className).not.toContain("amber");
  });
});
