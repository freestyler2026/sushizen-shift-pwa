// tests/apply/voice-send-retry.test.tsx
//
// What happens to an answer that has been recorded but that the server has not
// taken yet. The window this matters in is a backend deploy: Heroku restarts
// the dyno and everything sent during those seconds comes back 503. Before
// this, the recording was dropped and the applicant was told to say it again,
// which made "we deployed" and "you lost your answer" the same event.
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

// Consent given and the CV step settled, so load() opens straight on the
// recorder -- the same place somebody re-opening their invite link lands.
const READY = {
  name: "Test Applicant", language: "en", status: "invited",
  consent_given: true, consent_version: "v1", retain_days: 180,
  questions: QUESTIONS, answered: [], resume: { uploaded: false, skipped: true, filename: "", bytes: 0 },
};

function reply(status: number, body: unknown = {}) {
  return Promise.resolve({
    ok: status >= 200 && status < 300, status,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as Response);
}

/** Bodies of every POST to the answer endpoint, in order. */
let posted: FormData[] = [];
/** Statuses the answer endpoint returns, consumed one per call; the last one
 *  repeats once the list runs out. */
let answerStatuses: number[] = [];

class FakeRecorder {
  static isTypeSupported() { return true; }
  mimeType = "audio/webm;codecs=opus";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  start() { this.ondataavailable?.({ data: new Blob(["audio"], { type: "audio/webm" }) }); }
  stop() { this.onstop?.(); }
}

beforeEach(() => {
  posted = [];
  answerStatuses = [200];
  mockFetch.mockReset();
  mockFetch.mockImplementation((url: unknown, init?: { body?: unknown }) => {
    const u = String(url);
    if (u.includes("/answer/")) {
      posted.push(init?.body as FormData);
      return reply(answerStatuses.length > 1 ? answerStatuses.shift()! : answerStatuses[0]);
    }
    if (u === "/api/voice/tok") return reply(200, READY);
    return reply(200, {});
  });
  (global as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeRecorder;
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [] })) },
    configurable: true,
  });
});

afterEach(() => { vi.useRealTimers(); vi.resetModules(); });

async function recordOneAnswer() {
  const Voice = (await import("@/components/apply/VoiceScreening")).default;
  render(<Voice token="tok" lang="en" />);
  fireEvent.click(await screen.findByText("Start recording"));
  fireEvent.click(await screen.findByText("● Stop and send"));
}

describe("an answer the server has not taken yet", () => {
  it("holds the recording when the API is restarting instead of asking for it again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    answerStatuses = [503, 503];
    await recordOneAnswer();

    // The whole point: not "record it again", and no button offering to.
    expect(await screen.findByText(/Your answer is still on this phone/)).toBeTruthy();
    expect(screen.queryByText(/Try recording it again/)).toBeNull();
    expect(screen.queryByText("Start recording")).toBeNull();
    expect(screen.getByText("Send it again")).toBeTruthy();
  });

  it("re-sends by itself once the API is back, with no tap from the applicant", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    answerStatuses = [503, 200];
    await recordOneAnswer();
    await screen.findByText(/trying again/);
    expect(posted.length).toBe(1);

    await vi.advanceTimersByTimeAsync(4000);

    expect(posted.length).toBe(2);
    await waitFor(() => expect(screen.getByText("✓ Saved")).toBeTruthy());
    expect(screen.queryByText(/still on this phone/)).toBeNull();
  });

  it("sends the same audio again, not a new empty one", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    answerStatuses = [503, 200];
    await recordOneAnswer();
    await screen.findByText(/trying again/);
    await vi.advanceTimersByTimeAsync(4000);

    const first = posted[0].get("audio") as File;
    const again = posted[1].get("audio") as File;
    expect(again.size).toBe(first.size);
    expect(again.size).toBeGreaterThan(0);
    expect(posted[1].get("duration_seconds")).toBe(posted[0].get("duration_seconds"));
  });

  it("keeps the answer's own length on the retry rather than the wait", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    answerStatuses = [503, 200];
    const Voice = (await import("@/components/apply/VoiceScreening")).default;
    render(<Voice token="tok" lang="en" />);
    fireEvent.click(await screen.findByText("Start recording"));
    await vi.advanceTimersByTimeAsync(20_000);   // they talk for 20 seconds
    fireEvent.click(await screen.findByText("● Stop and send"));
    await screen.findByText(/trying again/);
    await vi.advanceTimersByTimeAsync(4000);     // and the retry lands 4s later

    expect(posted[0].get("duration_seconds")).toBe("20");
    expect(posted[1].get("duration_seconds")).toBe("20");
  });

  it("hands it back to the applicant once the retries are used up", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    answerStatuses = [503];
    await recordOneAnswer();
    await screen.findByText(/trying again/);

    await vi.advanceTimersByTimeAsync(4000 + 12_000 + 25_000);

    expect(await screen.findByText(/check your signal/)).toBeTruthy();
    expect(posted.length).toBe(4);              // the first, and three retries
    // Still held: the answer is on the phone and one tap from the server.
    expect(screen.getByText("Send it again")).toBeTruthy();
    expect(screen.queryByText("Start recording")).toBeNull();
  });

  it("sends it when the applicant taps Send it again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    answerStatuses = [503, 200];
    await recordOneAnswer();
    await screen.findByText(/still on this phone/);

    fireEvent.click(screen.getByText("Send it again"));

    await waitFor(() => expect(screen.getByText("✓ Saved")).toBeTruthy());
    expect(posted.length).toBe(2);
  });

  it("does not retry what the server has already judged", async () => {
    // 415 is a verdict on this file -- an audio type the server will not take.
    // Sending the identical bytes three more times only wastes the applicant's
    // data, so this one does go back to the microphone.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    answerStatuses = [415];
    await recordOneAnswer();

    expect(await screen.findByText(/Try recording it again/)).toBeTruthy();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(posted.length).toBe(1);
    // and the way forward is offered again
    expect(screen.getByText("Start recording")).toBeTruthy();
    expect(screen.queryByText("Send it again")).toBeNull();
  });

  it("does not send twice when the applicant taps while a retry is already due", async () => {
    // The scheduled retry and the button are two paths to the same send. If the
    // tap did not cancel the timer, the server would get the answer twice and
    // the applicant would watch it fail again after it had already worked.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // Nothing gets through, so nothing collapses the two chains for us: the
    // tap has to cancel the retry it is standing in for, or both run.
    answerStatuses = [503];
    await recordOneAnswer();
    await screen.findByText(/still on this phone/);

    fireEvent.click(screen.getByText("Send it again"));
    await waitFor(() => expect(posted.length).toBe(2));
    await vi.advanceTimersByTimeAsync(60_000);

    // The first send, the tap, and the tap's three retries. One chain.
    expect(posted.length).toBe(5);
    expect(await screen.findByText(/check your signal/)).toBeTruthy();
  });

  it("does not let anything stale fire once they re-record the answer", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    answerStatuses = [503, 200, 200];
    await recordOneAnswer();
    await screen.findByText(/still on this phone/);
    fireEvent.click(screen.getByText("Send it again"));
    await waitFor(() => expect(screen.getByText("✓ Saved")).toBeTruthy());

    fireEvent.click(screen.getByText("Record again"));
    fireEvent.click(await screen.findByText("Start recording"));
    fireEvent.click(await screen.findByText("● Stop and send"));
    await waitFor(() => expect(screen.getByText("✓ Saved")).toBeTruthy());
    await vi.advanceTimersByTimeAsync(60_000);

    expect(posted.length).toBe(3);
  });

  it("says the same thing in Tagalog", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    answerStatuses = [503];
    const Voice = (await import("@/components/apply/VoiceScreening")).default;
    render(<Voice token="tok" lang="tl" />);
    fireEvent.click(await screen.findByText("Simulan ang pag-record"));
    fireEvent.click(await screen.findByText("● Itigil at ipadala"));

    expect(await screen.findByText(/Nasa telepono mo pa po ang sagot/)).toBeTruthy();
    expect(screen.getByText("Ipadala ulit")).toBeTruthy();
  });
});
