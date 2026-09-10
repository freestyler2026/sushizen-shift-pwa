// tests/hr/voice-invite-dito.test.tsx
//
// Our sender name clears Globe and Smart on its own. DITO whitelists separately
// and wants a signed authorisation, which is still with the provider. Nineteen
// of 198 applicants with a reachable number are on DITO — about one in ten.
//
// So SMS goes live for ninety per cent before it works for everyone, and the
// thing that must not happen is HR finding out which is which by pressing a
// button and reading a failure. The warning replaces the button, and the two
// free channels sit right under it.
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function ok(body: unknown) {
  return Promise.resolve({
    ok: true, status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as Response);
}

function row() {
  return {
    id: 1, applicant_id: "a1", full_name: "Test Applicant", phone: "0994 000 0000",
    position_group: "crew", position_applied: "Crew", assigned_branch: null,
    experience_level: null, available_from: null, applicant_status: "new",
    contact_apps: [], form_language: "en", applied_date: "2026-09-01",
    referrer_name: null, notes: null, answered: 0, total_questions: 5,
    complete: false, bucket: "waiting", superseded: false, invited_at: null,
    invite_count: 0, invited_by: null, phones: [], decision: null,
    decision_reason: null, decision_notes: null, decided_by: null,
    decided_at: null, consent_at: null, completed_at: null, last_answer_at: null,
    token_expires_at: null, retain_until: null, created_at: "2026-09-01T00:00:00Z",
  };
}

/** The gateway switched on — the state this whole test is about. */
const GATE_ON = { provider: "semaphore", configured: true, enabled: true,
                  sender_name: "SUSHIZEN", blocked_by: "" };

function invite(phones: Record<string, unknown>[]) {
  return {
    ok: true, screening_id: 9, token: "tok", reissued: false, invite_count: 1,
    answers_kept: 0, expires_in_days: 14, full_name: "Test Applicant",
    position: "Crew", language: "en", phones,
    url: "https://example.test/voice/tok",
    messages: { en: "Hi Test, link: https://example.test/voice/tok", tl: "Kumusta" },
  };
}

const DITO = { raw: "09940000000", e164: "+639940000000", usable: true,
               network: "dito", sms_ready: false };
const GLOBE = { raw: "09170000000", e164: "+639170000000", usable: true,
                network: "globe_smart", sms_ready: true };

let PHONES: Record<string, unknown>[] = [];

beforeEach(() => {
  PHONES = [DITO];
  mockFetch.mockReset();
  mockFetch.mockImplementation((u: unknown, init?: RequestInit) => {
    const url = String(u);
    if (String(init?.method || "GET").toUpperCase() === "POST" && url.includes("voice-invite")) {
      return ok(invite(PHONES));
    }
    if (url.includes("/sms/status")) return ok(GATE_ON);
    if (url.includes("/reasons")) return ok({ reasons: [] });
    if (/\/voice-screenings\/\d+$/.test(url)) return ok({ items: [] });
    if (url.includes("/voice-screenings")) {
      return ok({ rows: [row()], counts: { waiting: 1 }, can_decide: true, storage_ok: true });
    }
    return ok({});
  });
});

async function openInvite() {
  const Queue = (await import("@/components/hr/VoiceScreeningQueue")).default;
  render(<Queue city="manila" />);
  await screen.findByText(/Test Applicant/);
  fireEvent.click(screen.getByRole("button", { name: /Get invite link|New link/ }));
  await screen.findByText(/Link ready for/);
}

describe("a DITO number, while the sender name is not cleared there", () => {
  it("does not offer the button that would fail", async () => {
    await openInvite();
    expect(screen.queryByRole("button", { name: /Send by SMS/ })).toBeNull();
  });

  it("says so before the press, and says what to use instead", async () => {
    await openInvite();
    expect(await screen.findByText(/not cleared on DITO yet/)).toBeTruthy();
    expect(screen.getByText(/Send it on Viber or WhatsApp below/)).toBeTruthy();
  });

  it("still offers the two free channels — the link is not withheld", async () => {
    // The point is to route the message, not to stop it.
    await openInvite();
    expect(screen.getByRole("link", { name: "WhatsApp" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Viber/ })).toBeTruthy();
  });

  it("admits the network is a guess, because a ported number keeps its prefix", async () => {
    await openInvite();
    expect(screen.getByText(/only a guess/)).toBeTruthy();
  });
});

describe("a Globe or Smart number, on the same screen", () => {
  it("still gets the button", async () => {
    PHONES = [GLOBE];
    await openInvite();
    expect(await screen.findByRole("button", { name: /Send by SMS/ })).toBeTruthy();
    expect(screen.queryByText(/not cleared on DITO yet/)).toBeNull();
  });

  it("is judged per number when one applicant has both", async () => {
    // One field, two numbers — a real shape in this data. One is sendable.
    PHONES = [GLOBE, DITO];
    await openInvite();
    expect(await screen.findByRole("button", { name: /Send by SMS/ })).toBeTruthy();
    expect(screen.getByText(/not cleared on DITO yet/)).toBeTruthy();
  });
  it("does not put the word DITO on a number we did not classify as DITO", async () => {
    // Which networks are held back is a setting. If it ever widens, the screen
    // must not tell HR a Globe number is on DITO.
    PHONES = [{ ...GLOBE, sms_ready: false }];
    await openInvite();
    expect(await screen.findByText(/network is not cleared there|not cleared there/)).toBeTruthy();
    expect(screen.queryByText(/DITO/)).toBeNull();
  });
});
