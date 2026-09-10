"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { formatBytes, prepareIfImage, readError, UPLOAD_LIMIT_BYTES } from "@/lib/image-compress";

/**
 * Async voice screening, shown the moment the application is sent.
 *
 * No link is posted for the main path. Of 135 applicants not one has an email
 * and no record names Viber, WhatsApp or Facebook -- only a mobile number -- so
 * anything delivered later leaks candidates at every step. Offered here, the
 * applicant still has the phone in their hand.
 *
 * One question at a time, uploaded as soon as it is recorded. A dropped
 * connection then costs one answer rather than all of them, and the server
 * reports which are already in so this resumes instead of restarting.
 *
 * Nothing here scores anything. Speech scoring is accent scoring, and Manila's
 * kitchens are staffed from Visayan and Ilocano-speaking provinces.
 */

interface Question { seq: number; text_en: string; text_tl: string; limit_seconds: number }
interface IntroVideo { url: string; kind: "youtube" | "vimeo" | "file"; seconds: number }
interface Loaded {
  name: string; language: string; status: string;
  consent_given: boolean; consent_version: string; retain_days: number;
  questions: Question[]; answered: number[];
  /** Empty object when none is configured, and then the step does not exist. */
  intro_video?: IntroVideo | Record<string, never>;
  /** Whether a CV is already in, or the applicant said no. Both mean the step
   *  is not shown again to somebody who comes back on a dropped connection. */
  resume?: { uploaded: boolean; skipped: boolean; filename: string; bytes: number };
}

type Lang = "en" | "tl";

const T = {
  en: {
    // ⚠️ Do NOT write "you will not have to come in". Shortlisting a candidate
    // moves them to Screened, "ready for you to book an interview the normal
    // way" -- an in-person interview still follows. Promising otherwise would
    // be a promise the process cannot keep.
    //
    // The old heading was "One more step (optional)": it led with more work and
    // with permission to leave, and said nothing about what it is. On
    // 2026-09-08, nine of nineteen applicants stopped on this screen.
    heading: "This is your first interview",
    lead: "Five short questions, answered out loud on your phone — about five minutes, whenever suits you. No appointment, nothing to attend. It is how the hiring manager hears you, instead of only reading your form.",
    leadQuiet: "Somewhere quiet works best.",
    startNow: "Start the interview",
    introTitle: "First, a minute about Sushi ZEN",
    introBody: "Watch if you like{len}. It uses mobile data, and you can skip it — that makes no difference to your application.",
    introLen: " — about {n} minute{s}",
    introPlay: "Play the video",
    introSkip: "Skip and continue",
    introNext: "Continue",
    // Kept, and kept honest: skipping this rejects nobody. But it now asks for
    // something we can act on, instead of being a silent exit.
    later: "Not now — send me the link",
    laterNote: "Noted. We will message the link to the number you gave, so you can do this whenever you like.",
    cvTitle: "Attach your CV",
    cvBody: "A PDF, a Word file, or a clear photo of a printed one. A photo taken with this phone is fine. We need it to review your application.",
    cvPick: "Choose a file",
    cvChange: "Choose a different file",
    cvSend: "Attach and continue",
    cvSending: "Sending…",
    cvDone: "Attached",
    cvContinue: "Continue",
    cvTooBig: "That file is {size}. The limit is {max} — send a photo of it instead, or a smaller PDF.",
    cvBadType: "Send a PDF, a Word file, or a photo.",
    cvFailed: "It did not send. Check your connection and try again.",
    cvNone: "No CV on this phone? Send it later",
    consentTitle: "Before you record",
    consentBody: [
      "We record your voice answering the questions below.",
      "Only Sushi ZEN HR and the hiring manager listen to it.",
      "It is stored in Sushi ZEN's private Google Drive.",
      "If you are not hired, we begin deleting it after {days} days and it is fully removed within 30 days after that.",
      "You can stop at any time. You do not have to do this to apply.",
    ],
    agree: "I understand and agree",
    decline: "No thanks",
    question: "Question",
    of: "of",
    record: "Start recording",
    stop: "Stop and send",
    again: "Record again",
    // Asked for by Manila HR on 2026-09-09: applicants were meeting the timer
    // for the first time with the recording already running. The count and the
    // times are read from the live question set, never written here -- an
    // instruction saying "six questions, one minute each" while the set holds
    // five at 60-90s teaches the applicant that this screen cannot be trusted.
    //
    // ⚠️ Keep these SHORT. At 375x667 -- an iPhone SE / 8, common in Manila --
    // the first draft pushed "Start recording" to 761px (English) and 809px
    // (Tagalog) in a 667px viewport: the button that starts the interview sat
    // below the fold, behind a wall of advice, on a funnel that already loses
    // people. Tagalog runs longer than English and sets the worst case, so
    // measure THAT one after any edit.
    //
    // ⚠️ The 30 seconds is a FLOOR, not a limit, and it is the point of this
    // panel. All 35 answers recorded so far run 1-82s, median 19, against a
    // 60-90s allowance: THREE used even half of it and NOT ONE has ever hit the
    // limit. Running out of time is not the problem here -- answers too thin to
    // judge anybody on is. The first draft of this panel said "short and clear
    // is better than long", which pushed the one behaviour already hurting
    // these applicants. Do not reinstate it without measuring again.
    prepTitle: "Before you start",
    prepLead: "{n} questions, {time} each. The time starts only when you tap record.",
    prepSteps: [
      "Read the question and decide what to say before you tap record.",
      "Aim for 30 seconds or more. One sentence is too little to go on, and you will not run out of time.",
      "Write a few words on paper first if it helps.",
      "You can re-record any answer once.",
    ],
    uploading: "Sending…",
    saved: "Saved",
    next: "Next question",
    finish: "Finish",
    doneTitle: "All done",
    doneBody: "Thank you. Someone from Sushi ZEN will message you.",
    micDenied: "This browser is not letting us use the microphone. Allow it for this site (tap the lock or ⚙ icon in the address bar), then try again.",
    micNone: "No microphone was found on this device. Try a phone with a microphone, or do this later.",
    micBusy: "The microphone is being used by another app. Close it and try again.",
    micUnsupported: "This browser cannot record audio. Chrome works. You can also do this later — your application is already sent.",
    micOther: "The microphone could not be started.",
    laterHere: "Do this later instead",
    failed: "Could not send that answer. Try recording it again.",
    sendAgain: "Send it again",
    holding: "That did not send. Your answer is still on this phone — trying again…",
    holdingStuck: "Still could not send it. Your answer is still on this phone — check your signal, then send it again.",
    consentFailed: "We could not save that just now. Nothing is lost — wait a moment and press it again.",
    slowTitle: "Still loading…",
    slowBody: "This is taking longer than usual. Stay on this page — it will open by itself.",
    left: "left",
    againLeft: "You can re-record this answer once.",

    checkTitle: "First, let us check your microphone",
    checkBody: "Say your name out loud. The bar should move.",
    checkStart: "Start the check",
    checkListening: "Listening… keep talking",
    checkGood: "We can hear you.",
    checkContinue: "Continue",
    checkFail: "We could not hear anything.",
    checkRetry: "Try again",
    checkWhy: "Almost always one of these ↓",
    silentAnswer: "That answer had no sound in it, so it was not sent. Your microphone did not pick anything up.",
    silentRetry: "Record this answer again",
    meterHint: "The bar moves while you speak.",
    inAppTitle: "Open this in your browser first",
    inAppBody: "You opened this inside Facebook / Messenger. That window is not allowed to use the microphone. Tap the ••• (or ⋮) at the top and choose \u201cOpen in browser\u201d — Chrome or Safari — then this page will work.",
    inAppCopy: "Copy the link",
    inAppCopied: "Copied — paste it into Chrome or Safari",
    fixLangTl: "Tagalog",
    fixLangEn: "English",
    fixTitle: "How to fix the microphone",
    fixIos: "iPhone / iPad",
    fixAndroid: "Android",
    fixIosSteps: [
      "**Bluetooth earphones are the usual cause.** If earbuds or a headset are connected, the phone records from those, not from the phone. Take them out of the case and put them in your ear — or turn Bluetooth off in Control Centre and use the phone itself.",
      "**Allow the microphone for Safari.** Settings → Safari → Microphone → Allow. Then close this page and open the link again.",
      "**Close anything else using the microphone** — a call, Voice Memos, Messenger or WhatsApp left on a call.",
      "**Do not cover the bottom edge.** The microphone is beside the charging port. A thick case or a finger over it is enough.",
      "Still nothing: close Safari completely (swipe up), open the link again, and run the check once more.",
    ],
    fixAndroidSteps: [
      "**Bluetooth earphones are the usual cause.** If earbuds or a headset are connected, the phone records from those, not from the phone. Put them in your ear — or turn Bluetooth off and use the phone itself.",
      "**Allow the microphone for this site.** Tap the lock or ⚙ icon to the left of the address bar → Permissions → Microphone → Allow. Then reload the page.",
      "**Allow it for Chrome itself.** Settings → Apps → Chrome → Permissions → Microphone → Allow.",
      "**Close anything else using the microphone** — a call, a voice recorder, Messenger or WhatsApp left on a call.",
      "**Do not cover the bottom edge.** The microphone is beside the charging port.",
      "Still nothing: close Chrome completely, open the link again, and run the check once more.",
    ],
  },
  tl: {
    heading: "Ito na ang unang interview mo",
    lead: "Limang maikling tanong, sasagutin gamit ang boses mo sa cellphone — mga limang minuto, kahit anong oras. Walang appointment, walang pupuntahan. Dito ka maririnig ng hiring manager, hindi lang babasahin ang form mo.",
    leadQuiet: "Mas maganda kung tahimik ang lugar.",
    startNow: "Simulan ang interview",
    introTitle: "Una, isang minuto tungkol sa Sushi ZEN",
    introBody: "Panoorin kung gusto mo{len}. Gumagamit ito ng mobile data, at pwede mo rin itong laktawan — walang epekto ito sa application mo.",
    introLen: " — mga {n} minuto",
    introPlay: "I-play ang video",
    introSkip: "Laktawan at magpatuloy",
    introNext: "Magpatuloy",
    later: "Mamaya na lang — ipadala ang link",
    laterNote: "Naitala na. Ipapadala namin ang link sa numerong ibinigay mo, para magawa mo ito kahit anong oras.",
    cvTitle: "Ilakip ang CV mo",
    cvBody: "Pwedeng PDF, Word, o malinaw na litrato ng naka-print na CV. Okay ang litratong kuha sa telepono mo. Kailangan namin ito para masuri ang aplikasyon mo.",
    cvPick: "Pumili ng file",
    cvChange: "Pumili ng ibang file",
    cvSend: "Ilakip at magpatuloy",
    cvSending: "Ipinapadala…",
    cvDone: "Nailakip na",
    cvContinue: "Magpatuloy",
    cvTooBig: "Ang file na iyan ay {size}. Ang limit ay {max} — magpadala na lang ng litrato nito, o mas maliit na PDF.",
    cvBadType: "Magpadala ng PDF, Word, o litrato.",
    cvFailed: "Hindi naipadala. Pakicheck ang koneksyon at subukan ulit.",
    cvNone: "Wala ang CV sa telepono mo? Ipadala mamaya",
    consentTitle: "Bago ka mag-record",
    consentBody: [
      "Ire-record namin ang boses mo habang sinasagot ang mga tanong sa ibaba.",
      "Ang HR ng Sushi ZEN at ang hiring manager lang ang makikinig.",
      "Naka-imbak ito sa pribadong Google Drive ng Sushi ZEN.",
      "Kung hindi ka matanggap, sisimulan naming burahin ito pagkatapos ng {days} araw, at tuluyang mabubura sa loob ng 30 araw mula noon.",
      "Pwede kang huminto anumang oras. Hindi ito kailangan para makapag-apply.",
    ],
    agree: "Naiintindihan ko at sumasang-ayon",
    decline: "Huwag na lang",
    question: "Tanong",
    of: "sa",
    record: "Simulan ang pag-record",
    stop: "Itigil at ipadala",
    again: "Mag-record ulit",
    prepTitle: "Bago ka magsimula",
    prepLead: "{n} tanong, {time} bawat isa. Magsisimula lang ang oras kapag pinindot mo ang record.",
    prepSteps: [
      "Basahin ang tanong at isipin ang sagot bago pumindot ng record.",
      "Puntiryahin ang 30 segundo pataas. Kulang ang isang pangungusap, at hindi ka mauubusan ng oras.",
      "Kung makakatulong, isulat muna sa papel.",
      "Pwedeng i-record ulit ang isang sagot nang isang beses.",
    ],
    uploading: "Ipinapadala…",
    saved: "Na-save",
    next: "Susunod na tanong",
    finish: "Tapusin",
    doneTitle: "Tapos na",
    doneBody: "Salamat. May mag-me-message sa iyo mula sa Sushi ZEN.",
    micDenied: "Hindi pinapayagan ng browser na ito ang mikropono. I-allow po ito para sa site na ito (pindutin ang lock o ⚙ icon sa address bar), tapos subukan ulit.",
    micNone: "Walang nakitang mikropono sa device na ito. Subukan sa telepono na may mikropono, o gawin na lang mamaya.",
    micBusy: "Ginagamit ng ibang app ang mikropono. Isara po ito at subukan ulit.",
    micUnsupported: "Hindi makapag-record ang browser na ito. Gumagana ang Chrome. Pwede rin gawin mamaya — naipadala na po ang application mo.",
    micOther: "Hindi masimulan ang mikropono.",
    laterHere: "Mamaya na lang gawin ito",
    failed: "Hindi naipadala ang sagot na iyon. Subukang i-record ulit.",
    sendAgain: "Ipadala ulit",
    holding: "Hindi naipadala. Nasa telepono mo pa po ang sagot — sinusubukan ulit…",
    holdingStuck: "Hindi pa rin naipadala. Nasa telepono mo pa po ang sagot — pakicheck ang signal, tapos ipadala ulit.",
    consentFailed: "Hindi po ito na-save ngayon. Walang nawala — sandali lang, tapos pindutin ulit.",
    slowTitle: "Naglo-load pa po…",
    slowBody: "Mas matagal ito kaysa karaniwan. Manatili lang po sa page na ito — bubukas ito nang kusa.",
    left: "natitira",
    againLeft: "Pwede mong i-record ulit ang sagot na ito nang isang beses.",

    checkTitle: "Una, subukan muna natin ang mikropono mo",
    checkBody: "Sabihin nang malakas ang pangalan mo. Dapat gumalaw ang bar.",
    checkStart: "Simulan ang pagsubok",
    checkListening: "Nakikinig… magsalita lang po",
    checkGood: "Naririnig ka namin.",
    checkContinue: "Magpatuloy",
    checkFail: "Wala kaming narinig na kahit ano.",
    checkRetry: "Subukan ulit",
    checkWhy: "Halos palagi, isa sa mga ito ↓",
    silentAnswer: "Walang tunog ang sagot na iyon, kaya hindi ito naipadala. Walang nakuha ang mikropono mo.",
    silentRetry: "I-record ulit ang sagot na ito",
    meterHint: "Gumagalaw ang bar habang nagsasalita ka.",
    inAppTitle: "Buksan muna ito sa browser",
    inAppBody: "Nabuksan mo ito sa loob ng Facebook / Messenger. Hindi pinapayagan ng window na iyon ang mikropono. Pindutin ang ••• (o ⋮) sa itaas at piliin ang \u201cOpen in browser\u201d — Chrome o Safari — tapos gagana na ang page na ito.",
    inAppCopy: "Kopyahin ang link",
    inAppCopied: "Nakopya na — i-paste sa Chrome o Safari",
    fixLangTl: "Tagalog",
    fixLangEn: "English",
    fixTitle: "Paano ayusin ang mikropono",
    fixIos: "iPhone / iPad",
    fixAndroid: "Android",
    fixIosSteps: [
      "**Kadalasan ay ang Bluetooth earphones.** Kung may naka-connect na earbuds o headset, doon nagre-record ang telepono, hindi sa telepono mismo. Ilabas sa case at isuot sa tenga — o i-off ang Bluetooth sa Control Centre at gamitin ang telepono mismo.",
      "**Payagan ang mikropono para sa Safari.** Settings → Safari → Microphone → Allow. Tapos isara ang page na ito at buksan ulit ang link.",
      "**Isara ang ibang app na gumagamit ng mikropono** — tawag, Voice Memos, Messenger o WhatsApp na naiwang naka-call.",
      "**Huwag takpan ang ibaba ng telepono.** Nasa tabi ng charging port ang mikropono. Sapat na ang makapal na case o daliri para matakpan.",
      "Kung wala pa rin: isara nang tuluyan ang Safari (i-swipe pataas), buksan ulit ang link, at ulitin ang pagsubok.",
    ],
    fixAndroidSteps: [
      "**Kadalasan ay ang Bluetooth earphones.** Kung may naka-connect na earbuds o headset, doon nagre-record ang telepono. Isuot sa tenga — o i-off ang Bluetooth at gamitin ang telepono mismo.",
      "**Payagan ang mikropono para sa site na ito.** Pindutin ang lock o ⚙ icon sa kaliwa ng address bar → Permissions → Microphone → Allow. Tapos i-reload ang page.",
      "**Payagan din para sa Chrome mismo.** Settings → Apps → Chrome → Permissions → Microphone → Allow.",
      "**Isara ang ibang app na gumagamit ng mikropono** — tawag, voice recorder, Messenger o WhatsApp na naiwang naka-call.",
      "**Huwag takpan ang ibaba ng telepono.** Nasa tabi ng charging port ang mikropono.",
      "Kung wala pa rin: isara nang tuluyan ang Chrome, buksan ulit ang link, at ulitin ang pagsubok.",
    ],
  },
};

/** Peak below this counts as "nothing was recorded". Matches the server's
 *  VOICE_SILENT_PEAK_DBFS. Measured 2026-09-07 on three back-office staff: the
 *  seven silent answers peaked between -72 and -60 dBFS, the fourteen with
 *  speech between -8.7 and -0.4. Fifty decibels of empty space in between, so
 *  the exact line does not matter -- only that there is one. */
const SILENT_PEAK_DBFS = -45;

/** An answer that was recorded but that the server has not accepted yet.
 *  Held so a failed send costs a re-send and not a re-recording. */
type Held = { blob: Blob; type: string; peak: number | null; seq: number; seconds: number };

/** Waits before the automatic re-sends. Sized for a backend deploy: Heroku
 *  restarts the dyno and its router answers 503 until the new one is up, so a
 *  single quick retry would land inside the same gap. 4 + 12 + 25 seconds
 *  spans it. Anything still failing after that is not a deploy, and the
 *  applicant is told to send it themselves rather than left watching a
 *  spinner. */
const SEND_RETRY_MS = [4000, 12000, 25000];

/** Waits before re-reading the screening. Same reason as SEND_RETRY_MS, at the
 *  other end of the interview: while the API restarts it answers 503, and 503
 *  is also how the API says "voice screening is switched off". Retrying first
 *  is what tells the two apart -- a restart heals inside this window and an
 *  interview that is genuinely off does not -- so no guess about the response
 *  body is needed. */
const LOAD_RETRY_MS = [3000, 8000, 20000];

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Whether re-sending the same recording could plausibly succeed.
 *  `null` means the request never reached the server -- offline, or the dyno
 *  restarting. 4xx are the server's verdict on this file (bad type, too big,
 *  no sound, dead link) and re-sending it would only fail identically. */
function sendWorthRetrying(status: number | null): boolean {
  return status === null || status === 429 || status >= 500;
}

/** "1 minute" / "90 seconds" / "60-90 seconds", in the applicant's language.
 *
 *  Read from the question set rather than written into the copy. The active set
 *  has held 4, 5 and 7 questions at 60s and 90s at different times, and a
 *  sentence that names a count is wrong the day somebody edits the set. */
function perQuestionTime(seconds: number[], lang: Lang): string {
  const lo = Math.min(...seconds), hi = Math.max(...seconds);
  const one = (s: number) => {
    if (s % 60 === 0) {
      const m = s / 60;
      return lang === "tl" ? `${m} minuto` : `${m} minute${m > 1 ? "s" : ""}`;
    }
    return lang === "tl" ? `${s} segundo` : `${s} seconds`;
  };
  if (lo === hi) return one(lo);
  return lang === "tl" ? `${lo}–${hi} segundo` : `${lo}–${hi} seconds`;
}

function dbfs(amplitude: number) {
  return amplitude <= 0 ? -120 : Math.max(-120, 20 * Math.log10(amplitude));
}

type Meter = {
  /** Loudest sample seen since the meter was attached, in dBFS. */
  peak: () => number;
  /** Loudest sample in the last frame, 0..1, for the bar. */
  now: () => number;
  stop: () => void;
};

/** Watch the live microphone stream.
 *
 * Reading the stream rather than decoding the finished file: every browser that
 * can record can also analyse, decodeAudioData cannot read every container it
 * just wrote, and a bar that moves while you speak is the part that tells the
 * applicant the microphone works. A number they never see would not have helped
 * the person who recorded seven silent answers.
 */
function attachMeter(stream: MediaStream): Meter | null {
  type Ctor = typeof AudioContext;
  const Ctx: Ctor | undefined =
    window.AudioContext || (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
  if (!Ctx) return null;
  let ctx: AudioContext;
  try {
    ctx = new Ctx();
  } catch {
    return null;
  }
  // iOS starts the context suspended unless it was created inside the tap. It
  // is, but resume() is still required after the permission prompt.
  void ctx.resume?.();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  let peak = 0;
  let last = 0;
  let raf = 0;
  const tick = () => {
    try {
      analyser.getFloatTimeDomainData(buf);
      let frame = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = Math.abs(buf[i]);
        if (v > frame) frame = v;
      }
      last = frame;
      if (frame > peak) peak = frame;
    } catch { /* context died with the track; keep the last reading */ }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return {
    peak: () => dbfs(peak),
    now: () => last,
    stop: () => { cancelAnimationFrame(raf); void ctx.close?.(); },
  };
}

/** Which set of instructions to lead with. Only used to order them -- both are
 *  reachable, because a wrong guess must not hide the one that would work. */
function guessPlatform(): "ios" | "android" {
  if (typeof navigator === "undefined") return "android";
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod/i.test(ua) ? "ios" : "android";
}

/** Opened inside an app's own browser rather than Chrome or Safari.
 *
 *  This is the likely case, not an edge one: the invite is sent over Messenger,
 *  WhatsApp or Viber, and tapping a link in those opens a webview. Several of
 *  them refuse getUserMedia outright, so the applicant meets "we could not hear
 *  anything" for a reason no microphone setting will fix. Worth saying plainly
 *  before they work through six steps that cannot help.
 */
function inAppBrowser(): boolean {
  return clientKind() !== "browser";
}

/** A short label for which app opened the page. Only this label is sent -- not
 *  the user agent -- because the only question is "can this window record", and
 *  the full string identifies a person more precisely than that needs. */
function clientKind(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent || "";
  if (/\bFBAN\b|\bFBAV\b|\bFB_IAB\b/i.test(ua)) return "facebook";
  if (/Messenger/i.test(ua)) return "messenger";
  if (/Instagram/i.test(ua)) return "instagram";
  if (/Viber/i.test(ua)) return "viber";
  if (/\bLine\//i.test(ua)) return "line";
  return "browser";
}

const BTN = "w-full rounded-xl px-4 py-4 text-base font-semibold transition disabled:opacity-60";

/** The prep panel's copy, for the budget test. It sits directly above the
 *  record button, so its length is a layout constraint, not a style question --
 *  and jsdom cannot measure the layout that would otherwise catch it. */
export function __prepCopyForTest(lang: Lang) {
  return { lead: T[lang].prepLead, steps: T[lang].prepSteps as readonly string[] };
}

export default function VoiceScreening({
  token,
  lang: initial,
  startAt = "offer",
  cvIn = false,
  onUnavailable,
}: {
  token: string;
  lang: Lang;
  /** The CV was already taken on the application form and is on the server.
   *  Set so the step is not put in front of somebody who has just done it --
   *  the load below reaches the same conclusion from the server, but only
   *  after a round trip the applicant would spend looking at the step. */
  cvIn?: boolean;
  /** Straight to consent when they arrived by clicking an invite -- the choice
   *  the offer screen asks for was already made by opening the link. */
  startAt?: "offer" | "consent";
  /** Told why nothing can be shown, so a standalone page can say so instead of
   *  rendering blank. Inside /apply there is nothing to say and it is omitted. */
  onUnavailable?: (reason: "expired" | "off" | "error") => void;
}) {
  const [lang, setLang] = useState<Lang>(initial);
  const t = T[lang];

  const [data, setData] = useState<Loaded | null>(null);
  const [stage, setStage] = useState<"offer" | "intro" | "consent" | "resume" | "miccheck" | "record" | "later" | "done">(startAt);
  const [playing, setPlaying] = useState(false);
  const [idx, setIdx] = useState(0);
  const [recording, setRecording] = useState(false);
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [retries, setRetries] = useState(0);
  const [err, setErr] = useState("");
  // The microphone check, and the same check applied to every answer after it.
  const [mic, setMic] = useState<"idle" | "listening" | "good" | "bad">("idle");
  const [bar, setBar] = useState(0);
  const [showFix, setShowFix] = useState(false);
  const [fixTab, setFixTab] = useState<"ios" | "android">("android");
  // The fix steps carry their own language, starting in Tagalog whatever the
  // rest of the page is set to: everybody applying is Filipino, and this panel
  // only appears when something has already gone wrong.
  const [fixLang, setFixLang] = useState<Lang>("tl");
  const [inApp, setInApp] = useState(false);
  const [copied, setCopied] = useState(false);
  const [silent, setSilent] = useState(false);
  // An answer is recorded and waiting to reach the server. Not an error
  // state: nothing has been lost while this is set, and the applicant must
  // not be shown the record button, or they will say it all over again.
  const [held, setHeld] = useState<null | "retrying" | "stuck">(null);
  // The first read of the screening did not come back. Says so rather than
  // leaving a blank card while the retries run.
  const [slowLoad, setSlowLoad] = useState(false);
  // The CV step. `cvFile` is what they picked but have not sent yet, so the
  // button can say what it will do rather than firing on the file input.
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvDone, setCvDone] = useState(cvIn);
  // Only ever set from the server, for the rows written while the step could
  // be skipped. Nothing in the app can produce it any more.
  const [cvSkipped, setCvSkipped] = useState(false);
  const cvInput = useRef<HTMLInputElement | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const meterRef = useRef<Meter | null>(null);
  const barTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const aliveRef = useRef(true);
  const heldRef = useRef<Held | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setFixTab(guessPlatform()); setInApp(inAppBrowser()); }, []);
  // Reported on load, not at consent: most of the drop-off is before consent,
  // so recording it there would miss exactly the people we cannot explain.
  // Failure here must never affect the interview.
  useEffect(() => {
    const canRecord = typeof MediaRecorder !== "undefined"
      && !!navigator.mediaDevices?.getUserMedia;
    void fetch(`/api/voice/${token}/client`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: clientKind(), can_record: canRecord }),
    }).catch(() => { /* measurement must not break the page */ });
  }, [token]);
  // Investigated once already: a loop left running after the screen is gone
  // keeps calling setState on something that no longer exists (lesson 94).
  useEffect(() => () => {
    aliveRef.current = false;
    meterRef.current?.stop();
    if (barTimer.current) clearInterval(barTimer.current);
    if (retryTimer.current) clearTimeout(retryTimer.current);
  }, []);

  const load = useCallback(async () => {
    // Retried before anything is concluded. A deploy restarts the API, and for
    // those seconds every request comes back 503 -- which used to be read as
    // "the interview is not open", on a screen with no button on it. Somebody
    // opening their invite link at the wrong moment was told their interview
    // was closed and given nothing to press.
    for (let attempt = 0; ; attempt++) {
      let status: number | null = null;
      let d: Loaded | null = null;
      try {
        const res = await fetch(`/api/voice/${token}`);
        status = res.status;
        if (res.ok) d = (await res.json()) as Loaded;
      } catch {
        // Never reached the server.
        status = null;
      }
      if (!aliveRef.current) return;
      if (!d) {
        // A link that is really dead does not heal, so this one is answered at
        // once rather than making them wait through the retries.
        if (status === 404) { onUnavailable?.("expired"); return; }
        if (attempt < LOAD_RETRY_MS.length) {
          setSlowLoad(true);
          await wait(LOAD_RETRY_MS[attempt]);
          if (!aliveRef.current) return;
          continue;
        }
        setSlowLoad(false);
        // Still refusing after half a minute: longer than a restart. A 503 now
        // is the API's own answer -- screening is switched off. Anything else
        // goes to the screen that offers Try again.
        onUnavailable?.(status === 503 ? "off" : "error");
        return;
      }
      setSlowLoad(false);
      setData(d);
      // Resume where the connection dropped rather than starting over.
      const first = d.questions.findIndex((q) => !d.answered.includes(q.seq));
      setIdx(first < 0 ? 0 : first);
      const hasIntro = !!(d.intro_video as IntroVideo | undefined)?.url;
      // Somebody who already dealt with the CV step does not see it again --
      // neither the one who sent a file nor the one who said they have none.
      const cvSettled = !!(d.resume?.uploaded || d.resume?.skipped);
      if (d.resume?.uploaded) setCvDone(true);
      if (d.resume?.skipped) setCvSkipped(true);
      if (d.consent_given && first >= 0) setStage(cvSettled ? "record" : "resume");
      // An invite link opens at the consent screen, so somebody who arrived
      // that way would never be shown the company video at all -- and that is
      // most people, because the link is what gets sent over Messenger.
      else if (!d.consent_given && hasIntro && startAt === "consent") setStage("intro");
      return;
    }
  }, [token, onUnavailable, startAt]);

  useEffect(() => { void load(); }, [load]);

  const stopTimer = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
  const stopMeter = () => {
    if (barTimer.current) { clearInterval(barTimer.current); barTimer.current = null; }
    meterRef.current?.stop();
    meterRef.current = null;
  };
  /** Drives the bar. Ten frames a second is enough to read as live and cheap
   *  enough not to matter on the phones these are recorded on. */
  const watchBar = () => {
    if (barTimer.current) clearInterval(barTimer.current);
    barTimer.current = setInterval(() => {
      if (!aliveRef.current) return;
      setBar(meterRef.current?.now() ?? 0);
    }, 100);
  };
  useEffect(() => stopTimer, []);

  if (!data || !data.questions.length) {
    // Blank until the first read comes back -- that is normally instant. Once a
    // read has failed, silence for half a minute reads as a broken link, so the
    // wait is named and they are told to stay put.
    if (!slowLoad) return null;
    return (
      <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-base font-semibold text-white">{t.slowTitle}</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-300">{t.slowBody}</p>
      </div>
    );
  }

  const q = data.questions[idx];
  const total = data.questions.length;
  // Both languages, always. Showing only the chosen one meant an applicant who
  // reads Tagalog could be looking at an English question with no way to check
  // what it asked -- and answering the wrong question wastes their ninety
  // seconds, not ours. The chosen language leads; the other sits under it.
  const answerTime = perQuestionTime(data.questions.map((x) => x.limit_seconds), lang);
  // Only before the very first answer of the screening: after that the applicant
  // has met the timer and repeating this is noise above the question.
  const showPrep = idx === 0 && retries === 0 && data.answered.length === 0
    && !recording && !saved && !silent && !held;
  const primary = lang === "tl" && q?.text_tl ? q.text_tl : q?.text_en;
  const secondary = lang === "tl" ? q?.text_en : q?.text_tl;

  /** Records the consent, and only moves on once the server has it.
   *
   *  This used to fire and forget. During a deploy the API answers 503, the
   *  screen advanced anyway, and the server had no consent -- so every answer
   *  they then recorded came back 403 "Consent is required before recording",
   *  which is a 4xx and therefore not retried. The applicant was told to record
   *  it again, and recording it again failed identically. The whole interview
   *  was lost to a request nobody looked at. Pressing again is safe: the server
   *  keeps the first consent_at it wrote. */
  async function agree() {
    setErr("");
    setBusy(true);
    let ok = false;
    try {
      const res = await fetch(`/api/voice/${token}/consent`, { method: "POST" });
      ok = res.ok;
    } catch {
      ok = false;
    }
    if (!aliveRef.current) return;
    setBusy(false);
    if (!ok) { setErr(t.consentFailed); return; }
    // The CV comes after consent for anybody who has not already given one:
    // a CV is personal data kept under the same retention the consent screen
    // just described. Applicants coming from the form have sent it there, and
    // are told on that screen where it is kept and who reads it; putting the
    // step in front of them again would only be an extra press.
    setStage(cvDone || cvSkipped ? "miccheck" : "resume");
  }

  /** Prove the microphone works before asking anybody to answer seven questions
   *  into it. On 2026-09-07 one of three back-office staff recorded all seven
   *  answers at -90 dBFS -- fifty minutes of nothing -- and every screen said
   *  it had been sent. Six seconds here is the whole cost of never doing that
   *  to somebody again. */
  async function runMicCheck() {
    setErr(""); setShowFix(false); setBar(0);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      // No recorder at all -- which is exactly what a Facebook or Viber webview
      // looks like. Saying "this browser cannot record" and stopping leaves the
      // one person who most needs the way out without it, so the panel opens
      // here too and leads with how to leave the webview.
      setErr(t.micUnsupported);
      setMic("bad");
      setShowFix(true);
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      setErr(micMessage(e));
      setMic("bad"); setShowFix(true);
      return;
    }
    const meter = attachMeter(stream);
    if (!meter) {
      // No AudioContext: we cannot measure anything, so we must not claim the
      // microphone is broken. Let them through and rely on the per-answer
      // check, which will also say "unmeasured" rather than "silent".
      stream.getTracks().forEach((tr) => tr.stop());
      setStage("record");
      return;
    }
    meterRef.current = meter;
    setMic("listening");
    watchBar();
    window.setTimeout(() => {
      if (!aliveRef.current) return;
      const peak = meterRef.current?.peak() ?? -120;
      stopMeter();
      stream.getTracks().forEach((tr) => tr.stop());
      setBar(0);
      const ok = peak > SILENT_PEAK_DBFS;
      setMic(ok ? "good" : "bad");
      setShowFix(!ok);
    }, 6000);
  }

  /** Says which thing went wrong instead of blaming permissions for all of
   *  them. An explanation that does not match what actually happened is how
   *  people learn to stop reading explanations. */
  function micMessage(e: unknown): string {
    const name = (e as { name?: string })?.name || "";
    if (name === "NotAllowedError" || name === "SecurityError") return t.micDenied;
    if (name === "NotFoundError" || name === "OverconstrainedError") return t.micNone;
    if (name === "NotReadableError" || name === "AbortError") return t.micBusy;
    if (name === "TypeError") return t.micUnsupported;
    // Unknown: show the browser's own word for it. Useless to the applicant,
    // but it is the only thing that reaches us when they report the problem.
    return name ? `${t.micOther} (${name})` : t.micOther;
  }

  async function start() {
    setErr(""); setSaved(false); setSilent(false); setShowFix(false);
    // Recording again replaces whatever was held, so a pending retry must not
    // land afterwards and overwrite the new answer with the old one.
    clearHold();

    // Old browsers, and any page that is somehow not on https, have no
    // mediaDevices at all -- reading .getUserMedia off undefined would throw
    // something unrelated to microphones.
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setErr(t.micUnsupported);
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      setErr(micMessage(e));
      return;
    }

    // Opus keeps 90 seconds near 270 KB, which matters on a prepaid plan and
    // keeps every upload far below the 4.3 MB the proxy will carry. Safari
    // records mp4 instead and rejects webm outright.
    let mime = "";
    for (const c of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]) {
      try {
        if (MediaRecorder.isTypeSupported(c)) { mime = c; break; }
      } catch { /* isTypeSupported itself is missing on some builds */ }
    }

    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 24000 } : {});
    } catch {
      // The options were refused rather than the recording. Retry bare before
      // telling somebody their browser cannot do this -- the default settings
      // work in browsers that reject an explicit bitrate.
      try {
        rec = new MediaRecorder(stream);
        mime = "";
      } catch {
        stream.getTracks().forEach((tr) => tr.stop());
        setErr(t.micUnsupported);
        return;
      }
    }

    chunks.current = [];
    // Watched for the whole answer, not sampled: a peak is only meaningful if
    // nothing was missed.
    meterRef.current = attachMeter(stream);
    if (meterRef.current) watchBar();

    rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    rec.onstop = () => {
      const peak = meterRef.current?.peak() ?? null;
      stopMeter();
      setBar(0);
      stream.getTracks().forEach((tr) => tr.stop());
      // The recorder's own mimeType is the truth once the options were dropped.
      const type = (rec.mimeType || mime || "audio/webm").split(";")[0];

      if (peak !== null && peak <= SILENT_PEAK_DBFS) {
        // Not sent. Uploading it would put a file nobody can hear into the
        // queue and tell the applicant it worked -- which is exactly what
        // happened before this check existed.
        setSilent(true);
        setShowFix(true);
        return;
      }
      void send({
        blob: new Blob(chunks.current, { type }),
        type, peak, seq: q.seq,
        seconds: Math.round((Date.now() - startedAt.current) / 1000),
      });
    };
    rec.onerror = () => {
      stopTimer();
      stopMeter();
      setBar(0);
      setRecording(false);
      stream.getTracks().forEach((tr) => tr.stop());
      setErr(t.micOther);
    };
    recRef.current = rec;
    try {
      rec.start();
    } catch (e) {
      stream.getTracks().forEach((tr) => tr.stop());
      setErr(micMessage(e));
      return;
    }
    startedAt.current = Date.now();
    setRecording(true);
    setLeft(q.limit_seconds);
    timer.current = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) { stop(); return 0; }
        return s - 1;
      });
    }, 1000);
  }

  function stop() {
    stopTimer();
    setRecording(false);
    try { recRef.current?.stop(); } catch { /* already stopped */ }
  }

  function clearHold() {
    if (retryTimer.current) { clearTimeout(retryTimer.current); retryTimer.current = null; }
    heldRef.current = null;
    setHeld(null);
  }

  /** Sends one recorded answer, keeping the recording until the server has it.
   *
   *  It used to be sent once and dropped, and a failure said "record it again".
   *  The window that failure fits in is a backend deploy -- the dyno restarts
   *  and everything sent in those seconds comes back 503 -- so the one thing
   *  reliably able to make an applicant re-record a good answer was us
   *  deploying while they were mid-interview. The audio is already in memory;
   *  the only thing missing was asking twice. */
  async function send(h: Held, attempt = 0) {
    if (retryTimer.current) { clearTimeout(retryTimer.current); retryTimer.current = null; }
    heldRef.current = h;
    setBusy(true); setErr(""); setSilent(false);
    let status: number | null = null;
    try {
      const fd = new FormData();
      // Named for what it is: Safari produces mp4, not webm, and a file whose
      // extension contradicts its contents is a thing somebody has to untangle
      // later on Drive.
      const ext = h.type === "audio/mp4" ? "m4a" : h.type === "audio/ogg" ? "ogg" : "webm";
      fd.append("audio", h.blob, `q${h.seq}.${ext}`);
      // Measured when they stopped talking, not when the send happened: on a
      // retry the second one is minutes longer and would go on the record as
      // the length of their answer.
      fd.append("duration_seconds", String(h.seconds));
      // Sent so the level is on the record, not only in the moment. A silent
      // answer has to be visible to HR from the list, without opening it.
      if (h.peak !== null) fd.append("peak_dbfs", h.peak.toFixed(1));
      // No Content-Type header: setting it would overwrite the multipart
      // boundary the browser generates and the server would see no file.
      const res = await fetch(`/api/voice/${token}/answer/${h.seq}`, {
        method: "POST", body: fd,
      });
      status = res.status;
    } catch {
      // Never reached the server. Distinct from any status it could return.
      status = null;
    }
    if (!aliveRef.current) return;
    setBusy(false);

    if (status !== null && status >= 200 && status < 300) {
      clearHold();
      setSaved(true);
      return;
    }
    if (!sendWorthRetrying(status)) {
      // The server has looked at this file and will say the same thing again.
      clearHold();
      setErr(t.failed);
      return;
    }
    if (attempt < SEND_RETRY_MS.length) {
      setHeld("retrying");
      retryTimer.current = setTimeout(() => {
        if (!aliveRef.current) return;
        void send(h, attempt + 1);
      }, SEND_RETRY_MS[attempt]);
    } else {
      setHeld("stuck");
    }
  }

  function pickCv(file: File | null) {
    setErr("");
    // Cancelling the picker must change nothing. Clearing "Attached" on the
    // click instead meant the common case -- opening the picker and backing
    // out -- left the screen saying no CV had been sent while one was already
    // on the server, and the applicant either sent it twice or skipped.
    if (!file) return;
    if (file.size > UPLOAD_LIMIT_BYTES && file.type !== "application/pdf"
        && !file.type.startsWith("image/")) {
      // Word files cannot be shrunk here, so an oversized one is reported now
      // rather than after a Vercel 413 that arrives as plain text (lesson 24).
      setErr(t.cvTooBig.replace("{size}", formatBytes(file.size))
                       .replace("{max}", formatBytes(UPLOAD_LIMIT_BYTES)));
      setCvFile(null);
      return;
    }
    setCvFile(file);
    setCvDone(false);
  }

  async function sendCv() {
    if (!cvFile) return;
    setBusy(true); setErr("");
    try {
      // Photos are shrunk in the browser; a phone camera shot is routinely
      // over the 4.3 MB Vercel body limit and would never reach Heroku.
      const file = await prepareIfImage(cvFile);
      if (file.size > UPLOAD_LIMIT_BYTES) {
        setErr(t.cvTooBig.replace("{size}", formatBytes(file.size))
                         .replace("{max}", formatBytes(UPLOAD_LIMIT_BYTES)));
        return;
      }
      const fd = new FormData();
      fd.append("resume", file, file.name);
      // No Content-Type header: setting it overwrites the multipart boundary
      // and the server sees no file at all (lesson 23).
      const res = await fetch(`/api/voice/${token}/resume`, {
        method: "POST", body: fd,
      });
      if (!res.ok) {
        setErr(res.status === 415 ? t.cvBadType
                                  : await readError(res, t.cvFailed));
        return;
      }
      setCvDone(true);
      setCvFile(null);
    } catch {
      setErr(t.cvFailed);
    } finally {
      setBusy(false);
    }
  }

  async function askLater() {
    // Recorded, because the next screen promises "we will message you the
    // link" and nobody could keep that promise while the press left no trace.
    // The screen must still move even if the write fails -- the applicant has
    // said what they want and should not be held on a failed request.
    try { await fetch(`/api/voice/${token}/later`, { method: "POST" }); }
    catch { /* the note matters less than not trapping them here */ }
    setStage("later");
  }

  function next() {
    setSaved(false); setRetries(0); setErr("");
    if (idx + 1 >= total) { setStage("done"); return; }
    setIdx(idx + 1);
  }

  const iv = data.intro_video as IntroVideo | undefined;
  const intro = iv && iv.url ? iv : null;

  const card = "rounded-2xl border border-white/10 bg-white/5 p-5";
  // The fix instructions carry their own language, starting in Tagalog.
  const fx = T[fixLang];
  /* Shown at the top of the first screen when the page was opened inside
     Facebook, Messenger, Viber or Instagram -- windows that are not allowed to
     use the microphone.

     ⚠️ This used to appear only after the microphone check had already failed,
     which is three taps and a consent screen too late. On 2026-09-08, four of
     the ten applicants who agreed to be recorded produced no answer at all, and
     the panel that explains why was behind the wall they hit. The link is
     posted on Facebook, so its in-app browser is the default way in. */
  const inAppBanner = inApp ? (
    <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3">
      <p className="text-sm font-semibold text-amber-100">{fx.inAppTitle}</p>
      <p className="mt-1 text-sm leading-relaxed text-zinc-200">{fx.inAppBody}</p>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(window.location.href);
            setCopied(true);
          } catch { /* clipboard blocked: the instructions above still work */ }
        }}
        className="mt-2 rounded-lg border border-amber-300/40 px-3 py-1.5 text-sm text-amber-100"
      >
        {copied ? fx.inAppCopied : fx.inAppCopy}
      </button>
    </div>
  ) : null;

  /** On every screen, not just the first one. Somebody who arrives from an
   *  invite link starts at the consent screen and never saw the offer screen's
   *  switch -- so until now they had no way to read any of this in Tagalog,
   *  including the instructions for when the microphone will not work. */
  const langBar = (
    <div className="mb-3 flex justify-end gap-1 text-xs">
      {(["en", "tl"] as const).map((l) => (
        <button key={l} type="button" onClick={() => setLang(l)}
          className={`rounded-lg px-2 py-1 ${lang === l
            ? "bg-violet-500/25 text-violet-100" : "text-zinc-500"}`}>
          {l === "en" ? "English" : "Tagalog"}
        </button>
      ))}
    </div>
  );

  /** The bar. It is the whole point: a number in a database would not have told
   *  the person recording that nothing was going in. */
  const meterBar = (
    <div className="mt-4">
      <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-[width] duration-100 ${
            bar * 100 > 1 ? "bg-emerald-400" : "bg-white/20"}`}
          // Square root, so ordinary speech fills a useful part of the bar
          // instead of sitting near the left edge where it reads as "nothing".
          style={{ width: `${Math.min(100, Math.sqrt(bar) * 130)}%` }}
        />
      </div>
      <p className="mt-1.5 text-center text-xs text-zinc-500">{t.meterHint}</p>
    </div>
  );

  /** Steps, in the order they actually solve it. Bluetooth first because a
   *  headset in a bag records the bag. Both platforms stay reachable — leading
   *  with the wrong one would be an inconvenience, hiding the right one would
   *  be a dead end. */
  const fixPanel = (
    <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-950/15 p-4">
      {/* Said before the six steps, because none of the six can help here. */}
      {inApp && (
        <div className="mb-3 rounded-lg border border-amber-400/40 bg-amber-500/10 p-3">
          <p className="text-sm font-semibold text-amber-100">{fx.inAppTitle}</p>
          <p className="mt-1 text-sm leading-relaxed text-zinc-200">{fx.inAppBody}</p>
          <button
            type="button"
            onClick={() => {
              // Not every in-app webview grants clipboard access; if it refuses,
              // the address bar is still there to copy from by hand.
              void navigator.clipboard?.writeText(window.location.href)
                .then(() => setCopied(true)).catch(() => setCopied(false));
            }}
            className="mt-2 rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-100"
          >
            {copied ? fx.inAppCopied : fx.inAppCopy}
          </button>
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-amber-100">{fx.fixTitle}</h3>
        <div className="flex gap-1 text-xs">
          {/* One button naming the language you would get, written in that
              language. A pair labelled English / Tagalog sat next to the page's
              own pair and read as the same control twice. */}
          <button type="button" onClick={() => setFixLang(fixLang === "tl" ? "en" : "tl")}
            className="rounded-lg border border-amber-500/30 px-2 py-1 text-amber-100">
            {fixLang === "tl" ? "Read in English" : "Basahin sa Tagalog"}
          </button>
          <span className="px-1 text-zinc-600">|</span>
          {(["ios", "android"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setFixTab(k)}
              className={`rounded-lg px-2 py-1 ${fixTab === k
                ? "bg-amber-500/25 text-amber-100" : "text-zinc-500"}`}>
              {k === "ios" ? fx.fixIos : fx.fixAndroid}
            </button>
          ))}
        </div>
      </div>
      <ol className="space-y-2.5 text-sm leading-relaxed text-zinc-300">
        {(fixTab === "ios" ? fx.fixIosSteps : fx.fixAndroidSteps).map((step, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-xs font-bold text-amber-200">
              {i + 1}
            </span>
            <span>
              {step.split("**").map((part, j) =>
                j % 2 ? <strong key={j} className="text-white">{part}</strong>
                      : <span key={j}>{part}</span>)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );

  if (stage === "offer") {
    return (
      <div className={`${card} mt-8`}>
        {inAppBanner}
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{t.heading}</h2>
          <div className="flex gap-1 text-xs">
            {(["en", "tl"] as const).map((l) => (
              <button key={l} type="button" onClick={() => setLang(l)}
                className={`rounded-lg px-2 py-1 ${lang === l ? "bg-violet-500/25 text-violet-100" : "text-zinc-500"}`}>
                {l === "en" ? "English" : "Tagalog"}
              </button>
            ))}
          </div>
        </div>
        <p className="mb-2 text-sm leading-relaxed text-zinc-300">{t.lead}</p>
        <p className="mb-5 text-sm text-zinc-500">{t.leadQuiet}</p>
        <button type="button" onClick={() => setStage(intro ? "intro" : "consent")}
          className={`${BTN} bg-violet-500/90 text-white hover:bg-violet-500`}>
          {t.startNow}
        </button>
        <button type="button" onClick={() => void askLater()}
          className="mt-3 w-full py-2 text-sm text-zinc-400 underline">
          {t.later}
        </button>
      </div>
    );
  }

  if (stage === "later") {
    return (
      <div className={`${card} mt-8`}>
        {langBar}
        <p className="text-sm text-zinc-300">{t.laterNote}</p>
      </div>
    );
  }

  if (stage === "intro") {
    // Nothing loads until they press play. A page that spends thirty megabytes
    // on its own is the page people stop opening.
    // ⚠️ A YouTube or Vimeo URL will not play here. next.config.ts sets
    // `default-src 'self'` with no frame-src or media-src, so the browser
    // blocks both the embed iframe and any cross-origin file. Host the video
    // with the app (public/media) and give VOICE_INTRO_VIDEO_URL a path such
    // as /media/voice-intro.mp4 — same origin, so it is allowed.
    const mins = intro && intro.seconds > 0 ? Math.max(1, Math.round(intro.seconds / 60)) : 0;
    const introLen = mins
      ? t.introLen.replace("{n}", String(mins)).replace("{s}", mins === 1 ? "" : "s")
      : "";
    const embed = intro && (intro.kind === "youtube"
      ? intro.url.replace("youtu.be/", "www.youtube.com/embed/")
                 .replace("watch?v=", "embed/")
      : intro.kind === "vimeo"
      ? intro.url.replace("vimeo.com/", "player.vimeo.com/video/")
      : intro.url);
    return (
      <div className={`${card} mt-8`}>
        {langBar}
        <h2 className="mb-2 text-lg font-semibold text-white">{t.introTitle}</h2>
        {/* The length comes from the setting, not from the copy. It is the one
            number this screen owes somebody who is paying for the data, and a
            hardcoded "a minute" would go on saying that after the video is
            replaced with a longer one. */}
        <p className="mb-4 text-sm leading-relaxed text-zinc-300">
          {t.introBody.replace("{len}", introLen)}
        </p>

        {!playing ? (
          <button type="button" onClick={() => setPlaying(true)}
            className={`${BTN} bg-violet-500/90 text-white hover:bg-violet-500`}>
            ▶ {t.introPlay}
          </button>
        ) : intro && intro.kind === "file" ? (
          // playsInline, or iOS takes the video fullscreen and drops them out
          // of the form when it ends.
          // The company video is shot vertically. At 70vh it filled the screen
          // and pushed Continue below the fold on a normal phone -- somebody
          // who has just watched a minute of video should not have to go
          // looking for the way on. 46vh leaves the button visible.
          <video src={embed} controls autoPlay playsInline
            className="max-h-[46vh] w-full rounded-xl bg-black object-contain" />
        ) : (
          <div className="relative w-full overflow-hidden rounded-xl bg-black"
            style={{ paddingTop: "56.25%" }}>
            <iframe
              src={`${embed}${embed?.includes("?") ? "&" : "?"}autoplay=1&playsinline=1`}
              title={t.introTitle}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
            />
          </div>
        )}

        <button type="button" onClick={() => setStage("consent")}
          className={`${BTN} mt-3 ${playing
            ? "bg-violet-500/90 text-white hover:bg-violet-500"
            : "border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"}`}>
          {playing ? t.introNext : t.introSkip}
        </button>
      </div>
    );
  }

  if (stage === "consent") {
    return (
      <div className={`${card} mt-8`}>
        {inAppBanner}
        {langBar}
        <h2 className="mb-3 text-lg font-semibold text-white">{t.consentTitle}</h2>
        <ul className="mb-5 space-y-2 text-sm leading-relaxed text-zinc-300">
          {t.consentBody.map((line, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-zinc-600">•</span>
              <span>{line.replace("{days}", String(data.retain_days))}</span>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => void agree()} disabled={busy}
          className={`${BTN} bg-violet-500/90 text-white hover:bg-violet-500`}>
          {t.agree}
        </button>
        <button type="button" onClick={() => setStage("later")}
          className="mt-3 w-full py-2 text-sm text-zinc-400 underline">
          {t.decline}
        </button>
        {err && (
          <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-sm text-amber-100">
            {err}
          </p>
        )}
      </div>
    );
  }

  if (stage === "resume") {
    return (
      <div className={`${card} mt-8`}>
        {langBar}
        <h2 className="mb-2 text-lg font-semibold text-white">{t.cvTitle}</h2>
        <p className="mb-4 text-sm leading-relaxed text-zinc-300">{t.cvBody}</p>

        <input
          ref={cvInput}
          type="file"
          className="hidden"
          accept="application/pdf,image/*,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => pickCv(e.target.files?.[0] ?? null)}
        />

        {cvDone ? (
          <>
            <div className="mb-4 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-3 text-sm text-emerald-200">
              ✓ {t.cvDone}
            </div>
            <button type="button" onClick={() => setStage("miccheck")}
              className={`${BTN} bg-violet-500/90 text-white hover:bg-violet-500`}>
              {t.cvContinue}
            </button>
            <button type="button" onClick={() => cvInput.current?.click()}
              className="mt-3 w-full py-2 text-sm text-zinc-400 underline">
              {t.cvChange}
            </button>
          </>
        ) : (
          <>
            {cvFile && (
              <div className="mb-4 truncate rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-200">
                {cvFile.name}
                <span className="ml-2 text-zinc-500">{formatBytes(cvFile.size)}</span>
              </div>
            )}
            {cvFile ? (
              <button type="button" disabled={busy} onClick={() => void sendCv()}
                className={`${BTN} bg-violet-500/90 text-white hover:bg-violet-500`}>
                {busy ? t.cvSending : t.cvSend}
              </button>
            ) : (
              <button type="button" onClick={() => cvInput.current?.click()}
                className={`${BTN} border border-white/15 bg-white/5 text-white hover:bg-white/10`}>
                {t.cvPick}
              </button>
            )}
            {cvFile && (
              <button type="button" disabled={busy} onClick={() => cvInput.current?.click()}
                className="mt-3 w-full py-2 text-sm text-zinc-400 underline">
                {t.cvChange}
              </button>
            )}
            {/* Not a way past the CV -- it is the same "send me the link"
                path as the other screens, recorded, so somebody whose CV is
                on a different phone is not left with nothing to press
                (lesson 10). They come back to this screen from the link. */}
            <button type="button" disabled={busy} onClick={() => void askLater()}
              className="mt-3 w-full py-2 text-sm text-zinc-400 underline">
              {t.cvNone}
            </button>
          </>
        )}

        {err && <p className="mt-4 text-sm text-red-300">{err}</p>}
      </div>
    );
  }

  if (stage === "miccheck") {
    return (
      <div className={`${card} mt-8`}>
        {langBar}
        <h2 className="mb-2 text-lg font-semibold text-white">{t.checkTitle}</h2>
        <p className="mb-4 text-sm leading-relaxed text-zinc-300">{t.checkBody}</p>

        {mic === "listening" && (
          <>
            <p className="text-center text-sm font-medium text-emerald-300">
              {t.checkListening}
            </p>
            {meterBar}
          </>
        )}

        {mic === "idle" && (
          <button type="button" onClick={() => void runMicCheck()}
            className={`${BTN} bg-violet-500/90 text-white hover:bg-violet-500`}>
            {t.checkStart}
          </button>
        )}

        {mic === "good" && (
          <>
            <p className="mb-4 text-center text-sm font-medium text-emerald-300">
              ✓ {t.checkGood}
            </p>
            <button type="button" onClick={() => setStage("record")}
              className={`${BTN} bg-violet-500/90 text-white hover:bg-violet-500`}>
              {t.checkContinue}
            </button>
          </>
        )}

        {mic === "bad" && (
          <>
            <p className="text-sm font-medium text-amber-200">{t.checkFail}</p>
            <p className="mt-1 text-xs text-zinc-400">{t.checkWhy}</p>
            {fixPanel}
            <button type="button" onClick={() => { setMic("idle"); setShowFix(false); }}
              className={`${BTN} mt-4 bg-violet-500/90 text-white hover:bg-violet-500`}>
              {t.checkRetry}
            </button>
          </>
        )}

        {/* The way out stays on this screen. Somebody whose microphone will not
            work must not be trapped on the step that tests it. */}
        <button type="button" onClick={() => setStage("later")}
          className="mt-3 w-full py-2 text-sm text-zinc-400 underline">
          {t.laterHere}
        </button>

        {err && (
          <p className="mt-4 rounded-xl border border-red-500/30 bg-red-950/20 p-3 text-sm text-red-200">
            {err}
          </p>
        )}
      </div>
    );
  }

  if (stage === "done") {
    return (
      <div className={`${card} mt-8 text-center`}>
        {langBar}
        <h2 className="text-lg font-semibold text-white">{t.doneTitle}</h2>
        <p className="mt-2 text-sm text-zinc-300">{t.doneBody}</p>
      </div>
    );
  }

  return (
    <div className={`${card} mt-8`}>
      {langBar}
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider text-zinc-500">
          {t.question} {idx + 1} {t.of} {total}
        </span>
        {recording && (
          <span className="text-sm font-semibold tabular-nums text-red-300">
            {left}s {t.left}
          </span>
        )}
      </div>

      {/* "Q." so the question is unmistakably the question, and not the
          instruction above it or the button below it. */}
      <p className="mb-1.5 text-base leading-relaxed text-white">
        <span className="mr-1.5 font-semibold text-violet-300">Q.</span>
        {primary}
      </p>
      {secondary && secondary !== primary && (
        <p className="mb-5 text-sm leading-relaxed text-zinc-400">{secondary}</p>
      )}
      {(!secondary || secondary === primary) && <div className="mb-5" />}

      {/* Shown once, on the first question -- the moment the advice is about.
          Not a screen of its own: five screens already stand between the offer
          and the first answer, and not on the microphone check either, because
          two of the three routes into recording skip it (no AudioContext, and
          anyone returning to a consented screening).
          ⚠️ Split around the button ON PURPOSE. Trimming the copy to keep the
          whole panel above it did not hold: Tagalog still landed the button at
          680px in a 667px viewport, and the question text varies by set, so the
          height was never ours to predict. Above the button goes ONE bounded
          line -- the timer, which is the fact that changes what they do. The
          rest sits under it, on the same screen, where its length costs
          nothing. */}
      {showPrep && (
        <p className="mb-3 text-sm leading-relaxed text-zinc-300">
          <span className="font-semibold text-violet-200">{t.prepTitle}: </span>
          {t.prepLead.replace("{n}", String(total)).replace("{time}", answerTime)}
        </p>
      )}

      {!recording && !saved && !silent && !held && (
        <button type="button" onClick={() => void start()} disabled={busy}
          className={`${BTN} bg-violet-500/90 text-white hover:bg-violet-500`}>
          {busy ? t.uploading : t.record}
        </button>
      )}

      {recording && (
        <>
          <button type="button" onClick={stop}
            className={`${BTN} bg-red-500/90 text-white hover:bg-red-500`}>
            ● {t.stop}
          </button>
          {meterBar}
        </>
      )}

      {showPrep && (
        <ul className="mt-4 space-y-1.5">
          {t.prepSteps.map((line) => (
            <li key={line} className="flex gap-2 text-sm leading-relaxed text-zinc-400">
              <span className="text-violet-400">•</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}

      {/* The microphone message offers to do this later, so the way out has to
          be on this screen. Telling somebody to take a door that is not there
          is worse than saying nothing. */}
      {!recording && !saved && (
        <button type="button" onClick={() => setStage("later")}
          className="mt-3 w-full py-2 text-sm text-zinc-400 underline">
          {t.laterHere}
        </button>
      )}

      {silent && (
        <div className="mt-4">
          <p className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-sm text-amber-100">
            {t.silentAnswer}
          </p>
          {showFix && fixPanel}
          {/* Not counted against the single retake: that allowance exists so
              answers stay comparable, and this is not a second attempt at
              answering -- the first one never reached us. */}
          <button type="button" onClick={() => void start()} disabled={busy}
            className={`${BTN} mt-4 bg-violet-500/90 text-white hover:bg-violet-500`}>
            {t.silentRetry}
          </button>
        </div>
      )}

      {/* Recorded, not yet accepted. Amber and not red on purpose: nothing has
          been lost, and the one thing this screen must not do is imply the
          answer is gone -- that is what sends somebody back to the microphone
          to repeat an answer we are already holding. */}
      {held && (
        <div className="mt-4">
          <p className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-sm text-amber-100">
            {held === "retrying" ? t.holding : t.holdingStuck}
          </p>
          <button type="button"
            onClick={() => { const h = heldRef.current; if (h) void send(h); }}
            disabled={busy}
            className={`${BTN} mt-4 bg-violet-500/90 text-white hover:bg-violet-500`}>
            {busy ? t.uploading : t.sendAgain}
          </button>
        </div>
      )}

      {saved && (
        <>
          <p className="mb-3 text-sm text-emerald-300">✓ {t.saved}</p>
          <button type="button" onClick={next}
            className={`${BTN} bg-violet-500/90 text-white hover:bg-violet-500`}>
            {idx + 1 >= total ? t.finish : t.next}
          </button>
          {retries < 1 && (
            <>
              <button type="button"
                onClick={() => { setRetries(retries + 1); setSaved(false); }}
                className="mt-3 w-full py-2 text-sm text-zinc-400 underline">
                {t.again}
              </button>
              {/* Once, not unlimited: unlimited retakes turn this into reading a
                  script, and then the answers no longer compare with each other. */}
              <p className="mt-1 text-center text-xs text-zinc-600">{t.againLeft}</p>
            </>
          )}
        </>
      )}

      {err && (
        <p className="mt-4 rounded-xl border border-red-500/30 bg-red-950/20 p-3 text-sm text-red-200">
          {err}
        </p>
      )}
    </div>
  );
}
