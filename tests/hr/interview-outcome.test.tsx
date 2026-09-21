// tests/hr/interview-outcome.test.tsx
//
// Manila reported the same screen twice on 2026-09-16: "the comment box is
// malfunctioning, you can't type — press space and it goes out of the box",
// and "Not for this role" doing nothing.
//
// Two separate faults on one panel:
//
//   1. `Line` was declared inside InterviewDay's render body, so it was a new
//      component type on every render. Each keystroke re-rendered the parent,
//      React unmounted the row and rebuilt it, and the textarea lost focus
//      after ONE character. With nothing focused, space scrolls the page.
//
//   2. The save posted {outcome, notes} and never a `reason`. The server
//      requires one for hold and pass, so those two buttons could never
//      succeed — and the 400 was drawn in a banner at the top of a very long
//      page, out of sight of the button that caused it.
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));
vi.mock("@/lib/interview-ics", () => ({ downloadIcs: vi.fn() }));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import InterviewDay from "@/components/hr/InterviewDay";

const ROW = {
  id: "iv-1",
  applicant_id: "app-1",
  full_name: "Gilbert Limbo",
  phone: "09126071140",
  position_applied: "kitchen",
  position_group: "kitchen",
  experience_level: "1_3y",
  starts_at: "2026-09-16T01:45:00Z",
  ends_at: null,
  day: "2026-09-16",
  is_today: true,
  interviewer_staff: "Peter Villafuerte",
  contact_via: "viber",
  reach_with: "Viber on the PC",
  voice_decision: null,
  voice_summary: null,
  attended: null,
  recorded: false,
};

const REASONS = [
  { key: "no_experience", label: "Not enough experience" },
  { key: "salary", label: "Salary too high" },
  { key: "unreachable", label: "Could not be reached" },
];

let posted: { url: string; body: Record<string, unknown> }[] = [];

function serve(outcomeStatus = 200, outcomeDetail = "",
               existing: Record<string, unknown> | null = null) {
  posted = [];
  mockFetch.mockImplementation((url: string, init?: RequestInit) => {
    const u = String(url);
    // What is already on file for this interview. Read before the panel lets
    // anybody write: every one of the 87 evaluations in production is tied to
    // the applicant and not to a booking, so a panel that only looked at the
    // booking said "nothing recorded" about 13 answered interviews.
    if (init?.method !== "POST" && /\/interviews\/[^/]+\/outcome$/.test(u)) {
      return Promise.resolve(new Response(JSON.stringify({ outcome: existing }),
        { status: 200, headers: { "content-type": "application/json" } }));
    }
    if (init?.method === "POST" && u.includes("/outcome")) {
      posted.push({ url: u, body: JSON.parse(String(init.body)) });
      return Promise.resolve(new Response(
        outcomeStatus === 200 ? JSON.stringify({ ok: true })
                              : JSON.stringify({ detail: outcomeDetail }),
        { status: outcomeStatus, headers: { "content-type": "application/json" } }));
    }
    if (u.includes("interview-outcome-reasons")) {
      return Promise.resolve(new Response(JSON.stringify({ reasons: REASONS }),
        { status: 200, headers: { "content-type": "application/json" } }));
    }
    if (u.includes("/interviews/upcoming")) {
      return Promise.resolve(new Response(JSON.stringify({ rows: [ROW] }),
        { status: 200, headers: { "content-type": "application/json" } }));
    }
    return Promise.resolve(new Response(JSON.stringify({ rows: [] }),
      { status: 200, headers: { "content-type": "application/json" } }));
  });
}

async function openThePanel() {
  render(<InterviewDay />);
  await screen.findByText("Gilbert Limbo");
  fireEvent.click(screen.getByRole("button", { name: /how did it go\?/i }));
  return await screen.findByPlaceholderText(/one line is enough/i);
}

beforeEach(() => { vi.clearAllMocks(); serve(); });

describe("the note box keeps focus while you type", () => {
  it("survives a whole sentence, spaces included", async () => {
    const box = await openThePanel();
    box.focus();
    expect(document.activeElement).toBe(box);

    // One character was enough to lose it before. Type a sentence with spaces,
    // checking after every single key — that is what the person at the desk did.
    const sentence = "good fit for kitchen";
    let sofar = "";
    for (const ch of sentence) {
      sofar += ch;
      fireEvent.change(box, { target: { value: sofar } });
      expect(document.activeElement).toBe(
        screen.getByPlaceholderText(/one line is enough/i));
    }
    expect(screen.getByPlaceholderText(/one line is enough/i)).toHaveValue(sentence);
  });

  it("is the same DOM node from the first key to the last", async () => {
    const box = await openThePanel();
    fireEvent.change(box, { target: { value: "a" } });
    fireEvent.change(screen.getByPlaceholderText(/one line is enough/i),
                     { target: { value: "ab" } });
    // A remount would hand back a different element for the same box.
    expect(screen.getByPlaceholderText(/one line is enough/i)).toBe(box);
  });
});

describe("the buttons that need a reason", () => {
  it("asks for one instead of posting a save the server will refuse", async () => {
    await openThePanel();
    fireEvent.click(screen.getByRole("button", { name: /not for this role/i }));

    // Nothing sent yet — it asks first.
    expect(posted).toHaveLength(0);
    await screen.findByText(/why\? — not for this role/i);

    // And only the reasons that fit a judgement: "could not be reached" says
    // nobody assessed them, which is a lapse, not a pass.
    expect(screen.getByRole("button", { name: /not enough experience/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /could not be reached/i })).toBeNull();
  });

  it("carries the reason to the server", async () => {
    await openThePanel();
    fireEvent.click(screen.getByRole("button", { name: /not for this role/i }));
    fireEvent.click(await screen.findByRole("button", { name: /not enough experience/i }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].body).toMatchObject({ outcome: "pass", reason: "no_experience" });
  });

  it("does not ask for a reason where the server does not want one", async () => {
    await openThePanel();
    fireEvent.click(screen.getByRole("button", { name: /move to offer/i }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].body).toMatchObject({ outcome: "proceed" });
  });
});

describe("a refusal is shown where the button is", () => {
  it("puts the server's words inside the panel", async () => {
    serve(400, "a reason is required when holding, passing or closing a candidate");
    await openThePanel();
    fireEvent.click(screen.getByRole("button", { name: /not for this role/i }));
    fireEvent.click(await screen.findByRole("button", { name: /not enough experience/i }));

    const msg = await screen.findByText(/a reason is required when holding/i);
    // Next to the buttons, not in the page-level banner far above them.
    const panel = screen.getByPlaceholderText(/one line is enough/i).closest("div");
    expect(panel?.contains(msg)).toBe(true);
  });
});


describe("what is already recorded, before anything is written", () => {
  const ON_FILE = {
    recommendation: "no_hire",
    reason: "experience_short",
    notes: "no experience in kitchen, all previous jobs were marketing",
    interviewer: "Peter Villafuerte",
    recorded_at: "2026-09-18T21:51:06+08:00",
    tied: false,
    total: 1,
  };

  it("shows the decision in the words the buttons use, with its reason", async () => {
    serve(200, "", ON_FILE);
    await openThePanel();
    // Scoped to the block, because "Not for this role" is also a button: the
    // point is that the past decision reads as that phrase and not as the
    // column's own word, `no_hire`.
    const block = (await screen.findByText(/already recorded/i)).parentElement!;
    expect(block.textContent).toContain("Not for this role");
    expect(block.textContent).toContain("Not enough experience");
    expect(block.textContent).toContain("all previous jobs were marketing");
    expect(block.textContent).not.toContain("no_hire");
  });

  it("says who and when in the store's clock, not the reader's", async () => {
    serve(200, "", ON_FILE);
    await openThePanel();
    // 21:51 as sent. Passing it through new Date() would redraw it in the
    // timezone of whichever PC is reading, which is how one screen once showed
    // the same moment four hours apart.
    await screen.findByText(/Peter Villafuerte on 2026-09-18 at 21:51/);
  });

  it("says when the outcome names no booking, because that is every one today",
     async () => {
    serve(200, "", ON_FILE);
    await openThePanel();
    await screen.findByText(/recorded against the applicant, with no booking named/i);
  });

  it("offers to write only as a correction once something is there", async () => {
    serve(200, "", ON_FILE);
    await openThePanel();
    await screen.findByText(/record a different outcome/i);
    expect(screen.getByText(/only if the one above is wrong/i)).toBeTruthy();
  });

  it("says nothing about a past outcome when there is none", async () => {
    serve();
    await openThePanel();
    await screen.findByText(/record the outcome/i);
    expect(screen.queryByText(/already recorded/i)).toBeNull();
  });

  it("does not let a failed lookup read as 'nothing recorded'", async () => {
    serve();
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method !== "POST" && /\/interviews\/[^/]+\/outcome$/.test(u)) {
        return Promise.resolve(new Response("nope", { status: 500 }));
      }
      if (u.includes("interview-outcome-reasons")) {
        return Promise.resolve(new Response(JSON.stringify({ reasons: REASONS }),
          { status: 200, headers: { "content-type": "application/json" } }));
      }
      if (u.includes("/interviews/upcoming")) {
        return Promise.resolve(new Response(JSON.stringify({ rows: [ROW] }),
          { status: 200, headers: { "content-type": "application/json" } }));
      }
      return Promise.resolve(new Response(JSON.stringify({ rows: [] }),
        { status: 200, headers: { "content-type": "application/json" } }));
    });
    await openThePanel();
    await screen.findByText(/could not check whether this one already has an outcome/i);
  });
});
