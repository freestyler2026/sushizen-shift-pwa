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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

describe("sending the invite link", () => {
  const UA = navigator.userAgent;
  beforeEach(() => {
    smsGate = { provider: "semaphore", configured: false, enabled: false,
                blocked_by: "no API key — set SEMAPHORE_API_KEY" };
  });
  function setUA(ua: string, touch = 0, platform = "") {
    Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
    Object.defineProperty(navigator, "maxTouchPoints", { value: touch, configurable: true });
    if (platform) Object.defineProperty(navigator, "platform", { value: platform, configurable: true });
  }
  afterEach(() => setUA(UA, 0, "MacIntel"));

  const INVITE = {
    ok: true, screening_id: 9, token: "tok", reissued: false, invite_count: 1,
    answers_kept: 0, expires_in_days: 14, full_name: "Test Applicant",
    position: "Crew", language: "en",
    phones: [{ raw: "09178987620", e164: "+639178987620", usable: true }],
    url: "https://example.test/voice/tok",
    messages: { en: "Hi Test, link: https://example.test/voice/tok", tl: "Kumusta" },
  };

  // What /api/admin/hr/sms/status says. Off by default: the gateway is not
  // configured in production yet, and the button must not appear until it is.
  let smsGate: Record<string, unknown> = {
    provider: "semaphore", configured: false, enabled: false,
    blocked_by: "no API key — set SEMAPHORE_API_KEY",
  };

  function serveInvite(rows: Record<string, unknown>[]) {
    return (u: unknown, init?: RequestInit) => {
      const url = String(u);
      if (String(init?.method || "GET").toUpperCase() === "POST" && url.includes("voice-invite")) {
        return ok(INVITE);
      }
      if (url.includes("/sms/status")) return ok(smsGate);
      if (url.includes("/reasons")) return ok({ reasons: REASONS });
      if (/\/voice-screenings\/\d+$/.test(url)) return ok({ items: [] });
      if (url.includes("/voice-screenings")) {
        return ok({ rows, counts: { to_review: rows.length }, can_decide: true, storage_ok: true });
      }
      return ok({});
    };
  }

  async function openInvite() {
    await screen.findByText(/Test Applicant/);
    fireEvent.click(screen.getByRole("button", { name: /Get invite link|New link/ }));
    await screen.findByText(/Link ready for/);
  }

  it("offers SMS on a phone, with the body separator that platform understands", async () => {
    // Android takes ?body=. Sending an iPhone that form opens Messages empty,
    // which is indistinguishable from the feature being broken.
    setUA("Mozilla/5.0 (Linux; Android 13; SM-A536E) AppleWebKit/537.36", 5, "Linux armv8l");
    mockFetch.mockImplementation(serveInvite([row({ bucket: "waiting", answered: 0, contact_apps: ["sms"] })]));
    const Queue = (await import("@/components/hr/VoiceScreeningQueue")).default;
    render(<Queue city="manila" />);
    await openInvite();
    const sms = await screen.findByRole("link", { name: "Messages" });
    expect(sms.getAttribute("href")).toMatch(/^sms:\+639178987620\?body=/);
  });

  it("uses & on an iPhone", async () => {
    setUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15", 5, "iPhone");
    mockFetch.mockImplementation(serveInvite([row({ bucket: "waiting", answered: 0, contact_apps: ["sms"] })]));
    const Queue = (await import("@/components/hr/VoiceScreeningQueue")).default;
    render(<Queue city="manila" />);
    await openInvite();
    const sms = await screen.findByRole("link", { name: "Messages" });
    expect(sms.getAttribute("href")).toMatch(/^sms:\+639178987620&body=/);
  });

  it("shows no SMS button on a computer, and says why", async () => {
    setUA("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36", 0, "MacIntel");
    mockFetch.mockImplementation(serveInvite([row({ bucket: "waiting", answered: 0, contact_apps: ["sms"] })]));
    const Queue = (await import("@/components/hr/VoiceScreeningQueue")).default;
    render(<Queue city="manila" />);
    await openInvite();
    expect(screen.queryByRole("link", { name: "Messages" })).toBeNull();
    expect(screen.getByText(/a computer cannot send a text/)).toBeTruthy();
  });

  it("says which channel the applicant asked for", async () => {
    setUA("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36", 0, "MacIntel");
    mockFetch.mockImplementation(serveInvite([row({ bucket: "waiting", answered: 0, contact_apps: ["sms"] })]));
    const Queue = (await import("@/components/hr/VoiceScreeningQueue")).default;
    render(<Queue city="manila" />);
    await openInvite();
    expect(screen.getByText(/They asked to be reached on/)).toBeTruthy();
  });

  it("does not offer server-side sending until the gateway is configured", async () => {
    // A button that only fails when pressed is worse than no button, and the
    // reason has to be on screen or nobody can fix it.
    setUA("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36", 0, "MacIntel");
    mockFetch.mockImplementation(serveInvite([row({ bucket: "waiting", answered: 0, contact_apps: ["sms"] })]));
    const Queue = (await import("@/components/hr/VoiceScreeningQueue")).default;
    render(<Queue city="manila" />);
    await openInvite();
    expect(screen.queryByRole("button", { name: /Send by SMS/ })).toBeNull();
    expect(await screen.findByText(/cannot send texts itself yet/)).toBeTruthy();
  });

  it("offers it once the gateway is on, and reports a refusal instead of swallowing it", async () => {
    setUA("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36", 0, "MacIntel");
    smsGate = { provider: "semaphore", configured: true, enabled: true, blocked_by: "" };
    const rows = [row({ bucket: "waiting", answered: 0, contact_apps: ["sms"] })];
    mockFetch.mockImplementation((u: unknown, init?: RequestInit) => {
      const url = String(u);
      if (url.includes("voice-invite/sms")) {
        // The gateway refused. The screen must say so, not say "sent".
        return Promise.resolve({
          ok: false, status: 502,
          text: () => Promise.resolve(JSON.stringify({ sms: { ok: false, error: "the gateway refused it (402): insufficient credits" } })),
          json: () => Promise.resolve({}),
        } as Response);
      }
      return serveInvite(rows)(u, init);
    });
    const Queue = (await import("@/components/hr/VoiceScreeningQueue")).default;
    render(<Queue city="manila" />);
    await openInvite();
    fireEvent.click(await screen.findByRole("button", { name: /Send by SMS/ }));
    expect(await screen.findByText(/insufficient credits/)).toBeTruthy();
    expect(screen.queryByText(/^Sent to/)).toBeNull();
  });
});
