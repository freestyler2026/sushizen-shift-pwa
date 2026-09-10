// tests/apply/voice-restart-window.test.tsx
//
// The seconds while the API restarts. Everything sent then comes back 503, and
// 503 is also how the API says "voice screening is switched off" -- so the two
// places that read a response during that window used to reach the wrong
// conclusion, quietly. One told an applicant their interview was closed; the
// other let them past the consent screen without recording the consent, which
// made every answer they went on to record fail permanently.
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));
vi.mock("next/navigation", () => ({ useParams: () => ({ token: "tok" }) }));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const QUESTIONS = [
  { seq: 1, text_en: "What did you do in your last job?", text_tl: "Ano ang ginawa mo?", limit_seconds: 90 },
];

const LOADED = {
  name: "Test Applicant", language: "en", status: "invited",
  consent_given: false, consent_version: "v1", retain_days: 180,
  questions: QUESTIONS, answered: [],
};

function reply(status: number, body: unknown = {}) {
  return Promise.resolve({
    ok: status >= 200 && status < 300, status,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as Response);
}

/** Statuses the GET returns, one per call; the last repeats. */
let loadStatuses: number[] = [];
/** Statuses the consent POST returns, one per call; the last repeats. */
let consentStatuses: number[] = [];
/** How many times the screening was read. */
let loads = 0;
let consents = 0;

function next(list: number[]): number {
  return list.length > 1 ? list.shift()! : list[0];
}

beforeEach(() => {
  loadStatuses = [200];
  consentStatuses = [200];
  loads = 0;
  consents = 0;
  mockFetch.mockReset();
  mockFetch.mockImplementation((url: unknown) => {
    const u = String(url);
    if (u.endsWith("/consent")) { consents++; return reply(next(consentStatuses)); }
    if (u === "/api/voice/tok") {
      loads++;
      const st = next(loadStatuses);
      return st === 200 ? reply(200, LOADED) : reply(st);
    }
    return reply(200, {});
  });
});

afterEach(() => { vi.useRealTimers(); vi.resetModules(); });

async function renderVoice(props: Record<string, unknown> = {}) {
  const Voice = (await import("@/components/apply/VoiceScreening")).default;
  render(<Voice token="tok" lang="en" startAt="consent" {...props} />);
}

describe("opening the link while the API is restarting", () => {
  it("does not tell them the interview is closed — it waits and opens", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const unavailable = vi.fn();
    loadStatuses = [503, 503, 200];
    await renderVoice({ onUnavailable: unavailable });

    // Not a dead end, and not a blank card either.
    expect(await screen.findByText("Still loading…")).toBeTruthy();
    expect(unavailable).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(8000);

    expect(await screen.findByText(/Before you record/)).toBeTruthy();
    expect(unavailable).not.toHaveBeenCalled();
    expect(loads).toBe(3);
  });

  it("only calls it switched off once it has outlasted a restart", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const unavailable = vi.fn();
    loadStatuses = [503];
    await renderVoice({ onUnavailable: unavailable });
    await screen.findByText("Still loading…");

    await vi.advanceTimersByTimeAsync(3000 + 8000 + 20_000);

    await waitFor(() => expect(unavailable).toHaveBeenCalledWith("off"));
    expect(loads).toBe(4);
  });

  it("answers a dead link at once rather than making them wait", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const unavailable = vi.fn();
    loadStatuses = [404];
    await renderVoice({ onUnavailable: unavailable });

    await waitFor(() => expect(unavailable).toHaveBeenCalledWith("expired"));
    expect(loads).toBe(1);
    expect(screen.queryByText("Still loading…")).toBeNull();
  });

  it("retries a connection that never reached the server", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const unavailable = vi.fn();
    let first = true;
    mockFetch.mockImplementation((url: unknown) => {
      if (String(url) === "/api/voice/tok") {
        loads++;
        if (first) { first = false; return Promise.reject(new Error("offline")); }
        return reply(200, LOADED);
      }
      return reply(200, {});
    });
    await renderVoice({ onUnavailable: unavailable });
    await screen.findByText("Still loading…");

    await vi.advanceTimersByTimeAsync(3000);

    expect(await screen.findByText(/Before you record/)).toBeTruthy();
    expect(unavailable).not.toHaveBeenCalled();
  });
});

describe("agreeing while the API is restarting", () => {
  it("does not move on when the consent did not reach the server", async () => {
    consentStatuses = [503];
    await renderVoice();
    fireEvent.click(await screen.findByText("I understand and agree"));

    expect(await screen.findByText(/Nothing is lost/)).toBeTruthy();
    // Still on the consent screen — not on the CV step, and nowhere near
    // recording an answer the server would refuse.
    expect(screen.getByText("I understand and agree")).toBeTruthy();
    expect(screen.queryByText("Attach your CV")).toBeNull();
  });

  it("does not move on when the request never left the phone", async () => {
    // This one used to fail silently: the rejected promise was thrown away and
    // the button simply did nothing.
    mockFetch.mockImplementation((url: unknown) => {
      if (String(url).endsWith("/consent")) return Promise.reject(new Error("offline"));
      if (String(url) === "/api/voice/tok") return reply(200, LOADED);
      return reply(200, {});
    });
    await renderVoice();
    fireEvent.click(await screen.findByText("I understand and agree"));

    expect(await screen.findByText(/Nothing is lost/)).toBeTruthy();
    expect(screen.queryByText("Attach your CV")).toBeNull();
  });

  it("goes through when they press it again after the API is back", async () => {
    consentStatuses = [503, 200];
    await renderVoice();
    fireEvent.click(await screen.findByText("I understand and agree"));
    await screen.findByText(/Nothing is lost/);

    fireEvent.click(screen.getByText("I understand and agree"));

    // Consent leads to the microphone. The CV comes after the answers.
    expect(await screen.findByText("Start the check")).toBeTruthy();
    expect(consents).toBe(2);
  });

  it("says it in Tagalog too", async () => {
    consentStatuses = [503];
    await renderVoice({ lang: "tl" });
    fireEvent.click(await screen.findByText("Naiintindihan ko at sumasang-ayon"));
    expect(await screen.findByText(/Walang nawala/)).toBeTruthy();
  });
});

describe("the page an invite link opens", () => {
  it("leaves a way back on when it says the interview is not open", async () => {
    // Reached only after the retries have run out, so it is either genuinely
    // off or a deploy that ran long. The second one is the reason the button
    // is there: without it the applicant's only move is to message HR.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    loadStatuses = [503];
    const Page = (await import("@/app/voice/[token]/page")).default;
    render(<Page />);

    await vi.advanceTimersByTimeAsync(3000 + 8000 + 20_000);
    expect(await screen.findByText("Not available right now")).toBeTruthy();

    const retry = screen.getByRole("button", { name: "Try again" });
    loadStatuses = [200];
    fireEvent.click(retry);

    expect(await screen.findByText(/Before you record/)).toBeTruthy();
  });

  it("offers nothing to press on a link that is genuinely dead", async () => {
    loadStatuses = [404];
    const Page = (await import("@/app/voice/[token]/page")).default;
    render(<Page />);

    expect(await screen.findByText("This link has expired")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});
