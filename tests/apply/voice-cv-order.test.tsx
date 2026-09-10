// tests/apply/voice-cv-order.test.tsx
//
// The CV must never stand between an applicant and the microphone.
//
// For half an hour on 2026-09-10 it did. Making the CV required put the step
// straight after consent, which is fine for somebody arriving from the form —
// they attached one there — but an invite link goes to the backlog: people
// already in the pipeline, being chased by HR precisely because they have not
// recorded yet, and the ones least likely to have a CV file on the phone. They
// would have hit a wall with no way through, and we would have lost the
// recording, which is the only reason that visit exists.
//
// So the order is: consent → microphone → the five answers → the CV. By then
// the answers are saved and asking can cost nothing.
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const QUESTIONS = [
  { seq: 1, text_en: "What did you do in your last job?", text_tl: "Ano ang ginawa mo?", limit_seconds: 90 },
  { seq: 2, text_en: "Hardest thing at work?", text_tl: "Pinakamahirap?", limit_seconds: 90 },
];

/** An invite link: consent not given yet, and no CV anywhere. */
function invited(resume = { uploaded: false, skipped: false, filename: "", bytes: 0 }) {
  return {
    name: "Test Applicant", language: "en", status: "invited",
    consent_given: false, consent_version: "v1", retain_days: 180,
    questions: QUESTIONS, answered: [], resume,
  };
}

function reply(status: number, body: unknown = {}) {
  return Promise.resolve({
    ok: status >= 200 && status < 300, status,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as Response);
}

class FakeRecorder {
  static isTypeSupported() { return true; }
  mimeType = "audio/webm;codecs=opus";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  start() { this.ondataavailable?.({ data: new Blob(["audio"], { type: "audio/webm" }) }); }
  stop() { this.onstop?.(); }
}

let calls: string[] = [];

beforeEach(() => {
  calls = [];
  mockFetch.mockReset();
  mockFetch.mockImplementation((url: unknown) => {
    const u = String(url);
    calls.push(u);
    if (u === "/api/voice/tok") return reply(200, invited(currentResume));
    return reply(200, {});
  });
  (global as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeRecorder;
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [] })) },
    configurable: true,
  });
});
afterEach(() => { vi.resetModules(); });

let currentResume = { uploaded: false, skipped: false, filename: "", bytes: 0 };

async function openInviteLink() {
  const Voice = (await import("@/components/apply/VoiceScreening")).default;
  render(<Voice token="tok" lang="en" startAt="consent" />);
  fireEvent.click(await screen.findByText("I understand and agree"));
}

/** Record every question and press through to the end. */
async function answerEverything() {
  for (let i = 0; i < QUESTIONS.length; i++) {
    fireEvent.click(await screen.findByText("Start recording"));
    fireEvent.click(await screen.findByText("● Stop and send"));
    const last = i === QUESTIONS.length - 1;
    fireEvent.click(await screen.findByText(last ? "Finish" : "Next question"));
  }
}

describe("where the CV sits in the interview", () => {
  beforeEach(() => { currentResume = { uploaded: false, skipped: false, filename: "", bytes: 0 }; });

  it("does not put the CV between consent and the microphone", async () => {
    await openInviteLink();
    // The microphone, not a file picker. This is the whole defect.
    expect(await screen.findByText("Start the check")).toBeTruthy();
    expect(screen.queryByText(/your CV/i)).toBeNull();
    expect(screen.queryByText("Choose a file")).toBeNull();
  });

  it("asks for it after the last answer, once nothing can be lost", async () => {
    await openInviteLink();
    await screen.findByText("Start the check");
    // No AudioContext here, so the check cannot measure — it lets them through.
    fireEvent.click(screen.getByText("Start the check"));
    await answerEverything();

    expect(await screen.findByText("One last thing — your CV")).toBeTruthy();
    expect(screen.getByText(/Your answers are saved/)).toBeTruthy();
    // And the answers really did go up before the ask.
    expect(calls.filter((c) => c.includes("/answer/")).length).toBe(QUESTIONS.length);
  });

  it("lets somebody with no file finish, and records that they were asked", async () => {
    // Not a skip button restored by the back door: HR has to be able to tell
    // an applicant who was asked and had nothing from one never asked, or they
    // chase everybody or nobody.
    await openInviteLink();
    fireEvent.click(await screen.findByText("Start the check"));
    await answerEverything();
    await screen.findByText("One last thing — your CV");

    fireEvent.click(screen.getByText("I do not have it on this phone — finish"));
    expect(await screen.findByText("All done")).toBeTruthy();
    await waitFor(() => expect(calls.some((c) => c.endsWith("/resume/skip"))).toBe(true));
  });

  it("does not ask an applicant who already sent one on the form", async () => {
    currentResume = { uploaded: true, skipped: false, filename: "cv.pdf", bytes: 900 };
    await openInviteLink();
    fireEvent.click(await screen.findByText("Start the check"));
    await answerEverything();

    expect(await screen.findByText("All done")).toBeTruthy();
    expect(screen.queryByText(/your CV/i)).toBeNull();
  });
});
