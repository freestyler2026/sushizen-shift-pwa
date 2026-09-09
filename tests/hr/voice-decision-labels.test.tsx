// tests/hr/voice-decision-labels.test.tsx
//
// The Paranaque manager asked on 2026-09-09 whether the "Pass" button meant the
// applicant had passed or been turned down, and asked for a reject button --
// which was that same button. In English "pass" reads both ways, and he was
// being asked to turn people down with a word he could not resolve.
//
// The stored keys did not change (renaming them would orphan every decision
// already recorded); only the words on screen did. What this locks is that the
// two never drift apart again: the button a reviewer presses to reject has to
// say reject, and the recorded decision has to read back the same way.
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const REASONS = [
  { key: "experience_short", label: "Not enough experience for this role" },
  { key: "other", label: "Other" },
];

function row(extra: Record<string, unknown> = {}) {
  return {
    id: 1, applicant_id: "a1", full_name: "Test Applicant", phone: "0917 000 0000",
    position_group: "crew", position_applied: "Crew", assigned_branch: null,
    experience_level: null, available_from: null, applicant_status: "new",
    contact_apps: [], form_language: "en", applied_date: "2026-09-01",
    referrer_name: null, notes: null,
    answered: 5, total_questions: 5, complete: true, bucket: "to_review",
    superseded: false, invited_at: null, invite_count: 0, invited_by: null,
    phones: [], decision: null, decision_reason: null, decision_notes: null,
    decided_by: null, decided_at: null, consent_at: null, completed_at: null,
    last_answer_at: null, token_expires_at: null, retain_until: null,
    created_at: "2026-09-01T00:00:00Z",
    ...extra,
  };
}

function ok(body: unknown) {
  return Promise.resolve({
    ok: true, status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as Response);
}

function serve(rows: Record<string, unknown>[]) {
  return (u: unknown) => {
    const url = String(u);
    if (url.includes("/reasons")) return ok({ reasons: REASONS });
    // The row detail: /voice-screenings/1 (no query string).
    if (/\/voice-screenings\/\d+$/.test(url)) return ok({ items: [] });
    if (url.includes("/voice-screenings")) {
      return ok({ rows, counts: { to_review: rows.length }, can_decide: true, storage_ok: true });
    }
    return ok({});
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockImplementation(serve([row()]));
});

async function renderQueue() {
  const Queue = (await import("@/components/hr/VoiceScreeningQueue")).default;
  render(<Queue city="manila" />);
  await screen.findByText(/Test Applicant/);
}

/** Open the row, the way a reviewer does: the Listen button. */
async function openRow() {
  fireEvent.click(screen.getByText(/Listen/));
  await screen.findByRole("button", { name: /Shortlist/ });
}

describe("the voice screening decision buttons say what they do", () => {
  it('never offers a button labelled only "Pass"', async () => {
    await renderQueue();
    await openRow();
    // The bare word is the thing the manager could not resolve.
    expect(screen.queryByRole("button", { name: /^Pass$/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Reject/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Hold/ })).toBeTruthy();
  });

  it("says what each of the three does, not only the obvious one", async () => {
    await renderQueue();
    await openRow();
    const caption = await screen.findByText(/Shortlist moves them to Screened/);
    // Hold and Reject used to carry no explanation at all.
    expect(caption.textContent).toMatch(/Hold leaves them where they are/);
    expect(caption.textContent).toMatch(/Reject moves them to Rejected/);
  });

  it("reads a recorded 'pass' back as Rejected, not as the stored key", async () => {
    mockFetch.mockImplementation(serve([
      row({ decision: "pass", decision_reason: "experience_short", bucket: "done" }),
    ]));
    await renderQueue();
    expect(await screen.findByText(/Rejected/)).toBeTruthy();
    // The stored key must not surface anywhere the reviewer reads.
    expect(screen.queryByText(/^pass\b/)).toBeNull();
  });
});
