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
  // The CV now arrives with the application form, so the ordinary token
  // reaching this component already has one. Tests about the CV step itself
  // pass `cvIn: false` and get the step.
  render(<Voice token="tok" lang="en" cvIn {...props} />);
  // Whichever screen this token opens on -- offer, consent, or the video.
  await screen.findByText(/This is your first interview|Before you record|First, a minute about/);
}

/** Consent leads straight to the microphone check for anybody whose CV is
 *  already in, which since 2026-09-10 is everybody arriving from the form. */
async function agreeAndSkipCv() {
  fireEvent.click(screen.getByText("I understand and agree"));
  await screen.findByText("Start the check");
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
    await agreeAndSkipCv();
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
    await agreeAndSkipCv();
    fireEvent.click(await screen.findByText("Start the check"));
    expect(await screen.findByText(/Buksan muna ito sa browser/)).toBeTruthy();
    expect(screen.getByText(/Kopyahin ang link/)).toBeTruthy();
  });

  it("does not claim a webview when it is an ordinary browser", async () => {
    setUA("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36");
    await renderVoice(loaded(), { startAt: "consent" });
    await agreeAndSkipCv();
    fireEvent.click(await screen.findByText("Start the check"));
    await screen.findByText(/Paano ayusin ang mikropono/);
    expect(screen.queryByText(/Buksan muna ito sa browser/)).toBeNull();
  });

  it("warns about the Facebook browser on the first screen, not after the mic check", async () => {
    // On 2026-09-08 this warning lived behind the microphone check: four of the
    // ten applicants who agreed to be recorded produced no answer at all, and
    // the explanation was three taps past where they stopped. The link is
    // posted on Facebook, so its in-app browser is the default way in.
    setUA("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 [FB_IAB/FB4A;FBAV/440.0;]");
    await renderVoice();
    expect(await screen.findByText(/Buksan muna ito sa browser/)).toBeTruthy();
    // and the way out is on the same screen
    expect(screen.getByRole("button", { name: /Kopyahin ang link/ })).toBeTruthy();
  });

  it("says nothing about browsers when it is an ordinary one", async () => {
    setUA("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36");
    await renderVoice();
    expect(screen.queryByText(/Buksan muna ito sa browser/)).toBeNull();
  });

  it("reports which browser opened the page, before any decision is made", async () => {
    // Recorded on load rather than at consent: most of the drop-off happens
    // before consent, so recording it there would miss the people we cannot
    // otherwise explain.
    setUA("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 [FB_IAB/FB4A;FBAV/440.0;]");
    await renderVoice();
    const call = mockFetch.mock.calls.find((c) => String(c[0]).endsWith("/client"));
    expect(call).toBeTruthy();
    expect(JSON.parse(String(call?.[1]?.body)).kind).toBe("facebook");
  });

  it("records 'not now', because the next screen promises to send the link", async () => {
    // The screen said "we will message you the link on the number you gave"
    // while the press left no trace anywhere, so nobody could send it. On
    // 2026-09-08 nine of nineteen applicants left on this screen and none of
    // them could be followed up.
    await renderVoice();
    mockFetch.mockClear();
    fireEvent.click(screen.getByText("Not now — send me the link"));
    expect(await screen.findByText(/We will message the link/)).toBeTruthy();
    expect(mockFetch.mock.calls.some(
      (c) => String(c[0]).endsWith("/later"))).toBe(true);
  });

  it("asks for the CV after consent when none is in, and offers no way past it", async () => {
    await renderVoice(loaded(), { startAt: "consent", cvIn: false });
    fireEvent.click(screen.getByText("I understand and agree"));
    // Required since 2026-09-10. HR cannot shortlist without it, and while
    // this step said "optional" it sat behind consent, where half the
    // applicants never reached it.
    expect(await screen.findByText("Attach your CV")).toBeTruthy();
    expect(screen.queryByText(/optional/i)).toBeNull();
    // The old skip is gone. Nothing here reaches the microphone.
    expect(screen.queryByText("Start the check")).toBeNull();
    expect(screen.getByText("Choose a file")).toBeTruthy();
  });

  it("does not trap somebody whose CV is on another phone", async () => {
    // Not a way past the CV: the same recorded "send me the link" path as the
    // other screens, so they come back to this step rather than skipping it.
    await renderVoice(loaded(), { startAt: "consent", cvIn: false });
    fireEvent.click(screen.getByText("I understand and agree"));
    await screen.findByText("Attach your CV");

    mockFetch.mockClear();
    fireEvent.click(screen.getByText("No CV on this phone? Send it later"));
    expect(await screen.findByText(/We will message the link/)).toBeTruthy();
    expect(mockFetch.mock.calls.some(
      (c) => String(c[0]).endsWith("/later"))).toBe(true);
    expect(mockFetch.mock.calls.some(
      (c) => String(c[0]).endsWith("/resume/skip"))).toBe(false);
  });

  it("does not ask again when the form already sent the CV", async () => {
    // The prop, not the server: the load is a round trip the applicant would
    // spend looking at a step they have just finished.
    mockFetch.mockImplementation(() => fetchOk(loaded({ consent_given: false })));
    const Voice = (await import("@/components/apply/VoiceScreening")).default;
    render(<Voice token="tok" lang="en" startAt="consent" cvIn />);
    fireEvent.click(await screen.findByText("I understand and agree"));
    expect(await screen.findByText("Start the check")).toBeTruthy();
    expect(screen.queryByText("Attach your CV")).toBeNull();
  });

  it.each([
    ["a CV is already in", { uploaded: true, skipped: false, filename: "cv.pdf", bytes: 1024 }],
    ["they said they have none", { uploaded: false, skipped: true, filename: "", bytes: 0 }],
  ])("does not ask for a CV again once %s", async (_label, resume) => {
    // A dropped connection brings people back here. Being asked again for the
    // file they just sent reads as the upload having failed.
    mockFetch.mockImplementation(() => fetchOk(loaded({ consent_given: true, resume })));
    const Voice = (await import("@/components/apply/VoiceScreening")).default;
    render(<Voice token="tok" lang="en" startAt="consent" cvIn={false} />);
    // Straight to the questions, which is where a consented token belongs.
    expect(await screen.findByText(/What did you do in your last job/)).toBeTruthy();
    expect(screen.queryByText("Attach your CV")).toBeNull();
  });

  it("shows the video step only when one is configured, and loads nothing until asked", async () => {
    // A file served by this app, not YouTube: the CSP is default-src 'self'
    // with no frame-src, so an embed can never play in production. Testing the
    // embed would be asserting behaviour the browser refuses.
    await renderVoice(loaded({
      intro_video: { url: "/media/voice-intro.mp4", kind: "file", seconds: 62 },
    }));
    fireEvent.click(screen.getByText("Start the interview"));
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
    fireEvent.click(screen.getByText("Start the interview"));
    expect(await screen.findByText(/about 3 minutes/)).toBeTruthy();
  });

  it("lets somebody skip the video in one tap", async () => {
    await renderVoice(loaded({
      intro_video: { url: "/media/voice-intro.mp4", kind: "file", seconds: 62 },
    }));
    fireEvent.click(screen.getByText("Start the interview"));
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
    fireEvent.click(screen.getByText("Start the interview"));
    expect(await screen.findByText(/Before you record/)).toBeTruthy();
    expect(screen.queryByText(/First, a minute about/)).toBeNull();
  });
});

describe("the panel shown before the first answer", () => {
  // It exists because applicants met the timer for the first time with the
  // recording already running. Its numbers come from the question set, so the
  // thing worth locking is that they follow the set rather than the copy.
  // A consented screening with the CV step settled opens straight on the
  // question, so it never shows the headings renderVoice waits for.
  async function onQuestion(extra: Record<string, unknown> = {}) {
    const data = loaded({ consent_given: true, resume: { skipped: true }, ...extra });
    mockFetch.mockImplementation(() => fetchOk(data));
    const Voice = (await import("@/components/apply/VoiceScreening")).default;
    render(<Voice token="tok" lang="en" />);
    await screen.findByRole("button", { name: /Start recording|Simulan ang pag-record/ });
  }

  it("counts the questions and the seconds from the set, not from the copy", async () => {
    await onQuestion();
    expect(await screen.findByText(/Before you start/)).toBeTruthy();
    // Two 90s questions in this fixture -- a single figure, not a range.
    expect(screen.getByText(/2 questions, 90 seconds each/)).toBeTruthy();
  });

  it("gives the range when the set mixes limits", async () => {
    await onQuestion({
      questions: [
        { seq: 1, text_en: "A", text_tl: "A", limit_seconds: 60 },
        { seq: 2, text_en: "B", text_tl: "B", limit_seconds: 90 },
        { seq: 3, text_en: "C", text_tl: "C", limit_seconds: 90 },
      ],
    });
    expect(await screen.findByText(/3 questions, 60–90 seconds each/)).toBeTruthy();
  });

  it("asks for a floor of 30 seconds, never for a short answer", async () => {
    // Every answer recorded so far ran 1-82s against a 60-90s allowance, median
    // 19, and not one has hit the limit. Thin answers are the problem here, so
    // copy that rewards brevity must not come back.
    await onQuestion();
    expect(await screen.findByText(/Aim for 30 seconds or more/)).toBeTruthy();
    expect(screen.queryByText(/Short and clear is better than long|too little to go on.*Short/)).toBeNull();
  });

  it("is gone once an answer is on file, so it does not sit above every question", async () => {
    await onQuestion({ answered: [1] });
    // Resumes on question 2 of 2.
    expect(await screen.findByText(/QUESTION 2 OF 2|Question 2 of 2/i)).toBeTruthy();
    expect(screen.queryByText(/Before you start/)).toBeNull();
  });

  it("stays hidden for somebody back on question 1 who has already answered another", async () => {
    // The position alone does not settle it: an applicant who answered Q2 and
    // came back resumes at Q1, and has already met the timer. This is the case
    // the answered-count check exists for -- the index check does not cover it.
    await onQuestion({ answered: [2] });
    expect(await screen.findByText(/QUESTION 1 OF 2|Question 1 of 2/i)).toBeTruthy();
    expect(screen.queryByText(/Before you start/)).toBeNull();
  });

  it("keeps the line above the record button short, whatever the advice below says", async () => {
    // jsdom computes no layout, so this cannot assert pixels. What it can
    // assert is the thing that made the pixels wrong. Measured on the deployed
    // page at 375x667 (an iPhone SE / 8, common in Manila): with the whole
    // panel above the button it sat at 761px in English and 809px in Tagalog,
    // and trimming the copy only got Tagalog to 680 -- still under a 667px
    // fold. The bullets now sit below the button, so only this one line can
    // push it down, and the question text above it varies by set.
    //
    // Tagalog runs longer than English and sets the worst case.
    const { __prepCopyForTest } = await import("@/components/apply/VoiceScreening");
    for (const lang of ["en", "tl"] as const) {
      const { lead } = __prepCopyForTest(lang);
      expect(lead.length, `${lang} lead is ${lead.length} characters`).toBeLessThanOrEqual(110);
    }
  });

  it("speaks Tagalog when the applicant does", async () => {
    await onQuestion();
    await screen.findByText(/Before you start/);
    fireEvent.click(screen.getByRole("button", { name: "Tagalog" }));
    expect(await screen.findByText(/Bago ka magsimula/)).toBeTruthy();
    expect(screen.getByText(/30 segundo pataas/)).toBeTruthy();
  });
});
