// tests/apply/voice-screening.test.tsx
//
// The paths a phone takes that a browser here cannot: an in-app webview, a
// configured intro video, and the language somebody reads the microphone
// instructions in. All three were wrong in ways nobody could have seen by
// opening the page on a laptop.
import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("lucide-react", async () => (await import("#tests/lucide-mock")).lucideMock({}));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const QUESTIONS = [
  { seq: 1, text_en: "What did you do in your last job?", text_tl: "Ano ang ginawa mo?", limit_seconds: 90 },
  { seq: 2, text_en: "Hardest thing at work?", text_tl: "Pinakamahirap?", limit_seconds: 90 },
];

function loaded(extra: Record<string, unknown> = {}) {
  return {
    name: "Test Applicant", language: "en", status: "invited",
    consent_given: false, consent_version: "v1", retain_days: 180,
    questions: QUESTIONS, answered: [], ...extra,
  };
}

function fetchOk(body: unknown) {
  return Promise.resolve({
    ok: true, status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as Response);
}

const REAL_UA = navigator.userAgent;
function setUA(ua: string) {
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
}

async function renderVoice(data: Record<string, unknown> = loaded(),
                           props: Record<string, unknown> = {}) {
  mockFetch.mockImplementation(() => fetchOk(data));
  const Voice = (await import("@/components/apply/VoiceScreening")).default;
  render(<Voice token="tok" lang="en" {...props} />);
  // Whichever screen this token opens on -- offer, consent, or the video.
  await screen.findByText(/One more step|Before you record|First, a minute about/);
}

beforeEach(() => { mockFetch.mockReset(); });
afterEach(() => { setUA(REAL_UA); vi.resetModules(); });

describe("voice screening on a phone", () => {
  it("offers the language switch on the consent screen, not only the first one", async () => {
    // Somebody arriving from an invite link starts here and never saw the
    // offer screen, so this is the only switch they will ever be given.
    await renderVoice(loaded(), { startAt: "consent" });
    expect(screen.getByRole("button", { name: "Tagalog" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tagalog" }));
    expect(await screen.findByText(/Bago ka mag-record/)).toBeTruthy();
  });

  it("shows the microphone instructions in Tagalog by default", async () => {
    await renderVoice(loaded(), { startAt: "consent" });
    fireEvent.click(screen.getByText("I understand and agree"));
    fireEvent.click(await screen.findByText("Start the check"));
    // No getUserMedia in this environment, so the failure path opens.
    expect(await screen.findByText(/Paano ayusin ang mikropono/)).toBeTruthy();
    expect(screen.getByText(/Kadalasan ay ang Bluetooth earphones/)).toBeTruthy();
    // and English is one tap away, on a button that says so in English
    fireEvent.click(screen.getByRole("button", { name: "Read in English" }));
    expect(await screen.findByText(/How to fix the microphone/)).toBeTruthy();
  });

  it("says the webview is the problem before listing six steps that cannot help", async () => {
    setUA("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 [FB_IAB/FB4A;FBAV/440.0;]");
    await renderVoice(loaded(), { startAt: "consent" });
    fireEvent.click(screen.getByText("I understand and agree"));
    fireEvent.click(await screen.findByText("Start the check"));
    expect(await screen.findByText(/Buksan muna ito sa browser/)).toBeTruthy();
    expect(screen.getByText(/Kopyahin ang link/)).toBeTruthy();
  });

  it("does not claim a webview when it is an ordinary browser", async () => {
    setUA("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36");
    await renderVoice(loaded(), { startAt: "consent" });
    fireEvent.click(screen.getByText("I understand and agree"));
    fireEvent.click(await screen.findByText("Start the check"));
    await screen.findByText(/Paano ayusin ang mikropono/);
    expect(screen.queryByText(/Buksan muna ito sa browser/)).toBeNull();
  });

  it("shows the video step only when one is configured, and loads nothing until asked", async () => {
    // A file served by this app, not YouTube: the CSP is default-src 'self'
    // with no frame-src, so an embed can never play in production. Testing the
    // embed would be asserting behaviour the browser refuses.
    await renderVoice(loaded({
      intro_video: { url: "/media/voice-intro.mp4", kind: "file", seconds: 62 },
    }));
    fireEvent.click(screen.getByText("Answer now by voice"));
    expect(await screen.findByText(/First, a minute about Sushi ZEN/)).toBeTruthy();
    // Nothing is downloaded before they press play — the screen has just told
    // them it costs them data.
    expect(document.querySelector("video")).toBeNull();
    fireEvent.click(screen.getByText(/Play the video/));
    await waitFor(() => expect(document.querySelector("video")).toBeTruthy());
    const v = document.querySelector("video")!;
    expect(v.getAttribute("src")).toBe("/media/voice-intro.mp4");
    // iOS takes an inline-less video fullscreen and drops them out of the form.
    expect(v.hasAttribute("playsinline")).toBe(true);
  });

  it("says how long the video is, from the setting", async () => {
    // Hardcoded copy would go on saying "a minute" after somebody swaps in a
    // three-minute film, on the one screen that owes an honest data cost.
    await renderVoice(loaded({
      intro_video: { url: "/media/voice-intro.mp4", kind: "file", seconds: 195 },
    }));
    fireEvent.click(screen.getByText("Answer now by voice"));
    expect(await screen.findByText(/about 3 minutes/)).toBeTruthy();
  });

  it("lets somebody skip the video in one tap", async () => {
    await renderVoice(loaded({
      intro_video: { url: "/media/voice-intro.mp4", kind: "file", seconds: 62 },
    }));
    fireEvent.click(screen.getByText("Answer now by voice"));
    fireEvent.click(await screen.findByText("Skip and continue"));
    expect(await screen.findByText(/Before you record/)).toBeTruthy();
  });

  it("shows the video to somebody who arrived from an invite link", async () => {
    // The link is what gets sent over Messenger, so this is the common path --
    // and it opens at the consent screen, past where the video used to live.
    await renderVoice(loaded({
      intro_video: { url: "/media/voice-intro.mp4", kind: "file", seconds: 62 },
    }), { startAt: "consent" });
    expect(await screen.findByText(/First, a minute about Sushi ZEN/)).toBeTruthy();
    fireEvent.click(screen.getByText("Skip and continue"));
    expect(await screen.findByText(/Before you record/)).toBeTruthy();
  });

  it("has no video step when none is configured", async () => {
    await renderVoice(loaded());
    fireEvent.click(screen.getByText("Answer now by voice"));
    expect(await screen.findByText(/Before you record/)).toBeTruthy();
    expect(screen.queryByText(/First, a minute about/)).toBeNull();
  });
});
