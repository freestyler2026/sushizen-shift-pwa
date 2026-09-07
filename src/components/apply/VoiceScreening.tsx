"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
}

type Lang = "en" | "tl";

const T = {
  en: {
    heading: "One more step (optional)",
    lead: "Answer five short questions by voice, in your own time. About five minutes. No appointment, nothing to attend.",
    startNow: "Answer now by voice",
    introTitle: "First, a minute about Sushi ZEN",
    introBody: "Watch if you like — it uses mobile data. You can skip it and it makes no difference to your application.",
    introPlay: "Play the video",
    introSkip: "Skip and continue",
    introNext: "Continue",
    later: "I will do it later",
    laterNote: "We will message you the link on the number you gave.",
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
    heading: "Isa pang hakbang (opsyonal)",
    lead: "Sagutin ang limang maikling tanong gamit ang boses mo, kahit anong oras. Mga limang minuto. Walang appointment, walang pupuntahan.",
    startNow: "Sumagot ngayon gamit ang boses",
    introTitle: "Una, isang minuto tungkol sa Sushi ZEN",
    introBody: "Panoorin kung gusto mo — gumagamit ito ng mobile data. Pwede mo rin itong laktawan, at walang epekto ito sa application mo.",
    introPlay: "I-play ang video",
    introSkip: "Laktawan at magpatuloy",
    introNext: "Magpatuloy",
    later: "Mamaya na lang",
    laterNote: "Ipapadala namin ang link sa numerong ibinigay mo.",
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
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /\bFBAN\b|\bFBAV\b|\bFB_IAB\b|Instagram|\bLine\/|Messenger|Viber/i.test(ua);
}

const BTN = "w-full rounded-xl px-4 py-4 text-base font-semibold transition disabled:opacity-60";

export default function VoiceScreening({
  token,
  lang: initial,
  startAt = "offer",
  onUnavailable,
}: {
  token: string;
  lang: Lang;
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
  const [stage, setStage] = useState<"offer" | "intro" | "consent" | "miccheck" | "record" | "later" | "done">(startAt);
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

  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const meterRef = useRef<Meter | null>(null);
  const barTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => { setFixTab(guessPlatform()); setInApp(inAppBrowser()); }, []);
  // Investigated once already: a loop left running after the screen is gone
  // keeps calling setState on something that no longer exists (lesson 94).
  useEffect(() => () => {
    aliveRef.current = false;
    meterRef.current?.stop();
    if (barTimer.current) clearInterval(barTimer.current);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/voice/${token}`);
      if (!res.ok) {
        // Inside /apply there is nothing useful to say, so this stays hidden.
        // On a page reached from an invite link, a blank screen is a dead end
        // with no way out, so the reason is handed up.
        onUnavailable?.(res.status === 503 ? "off"
          : res.status === 404 ? "expired" : "error");
        return;
      }
      const d: Loaded = await res.json();
      setData(d);
      // Resume where the connection dropped rather than starting over.
      const first = d.questions.findIndex((q) => !d.answered.includes(q.seq));
      setIdx(first < 0 ? 0 : first);
      if (d.consent_given && first >= 0) setStage("record");
    } catch {
      onUnavailable?.("error");
    }
  }, [token, onUnavailable]);

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

  if (!data || !data.questions.length) return null;

  const q = data.questions[idx];
  const total = data.questions.length;
  // Both languages, always. Showing only the chosen one meant an applicant who
  // reads Tagalog could be looking at an English question with no way to check
  // what it asked -- and answering the wrong question wastes their ninety
  // seconds, not ours. The chosen language leads; the other sits under it.
  const primary = lang === "tl" && q?.text_tl ? q.text_tl : q?.text_en;
  const secondary = lang === "tl" ? q?.text_en : q?.text_tl;

  async function agree() {
    setErr("");
    await fetch(`/api/voice/${token}/consent`, { method: "POST" });
    setStage("miccheck");
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
      void upload(new Blob(chunks.current, { type }), type, peak);
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

  async function upload(blob: Blob, type = "audio/webm", peak: number | null = null) {
    setBusy(true); setErr(""); setSilent(false);
    try {
      const fd = new FormData();
      // Named for what it is: Safari produces mp4, not webm, and a file whose
      // extension contradicts its contents is a thing somebody has to untangle
      // later on Drive.
      const ext = type === "audio/mp4" ? "m4a" : type === "audio/ogg" ? "ogg" : "webm";
      fd.append("audio", blob, `q${q.seq}.${ext}`);
      fd.append("duration_seconds",
        String(Math.round((Date.now() - startedAt.current) / 1000)));
      // Sent so the level is on the record, not only in the moment. A silent
      // answer has to be visible to HR from the list, without opening it.
      if (peak !== null) fd.append("peak_dbfs", peak.toFixed(1));
      // No Content-Type header: setting it would overwrite the multipart
      // boundary the browser generates and the server would see no file.
      const res = await fetch(`/api/voice/${token}/answer/${q.seq}`, {
        method: "POST", body: fd,
      });
      if (!res.ok) { setErr(t.failed); return; }
      setSaved(true);
    } catch {
      setErr(t.failed);
    } finally {
      setBusy(false);
    }
  }

  function next() {
    setSaved(false); setRetries(0); setErr("");
    if (idx + 1 >= total) { setStage("done"); return; }
    setIdx(idx + 1);
  }

  const iv = data.intro_video as IntroVideo | undefined;
  const intro = iv && iv.url ? iv : null;

  const card = "rounded-2xl border border-white/10 bg-white/5 p-5";

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
  const fx = T[fixLang];
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
        <p className="mb-5 text-sm leading-relaxed text-zinc-300">{t.lead}</p>
        <button type="button" onClick={() => setStage(intro ? "intro" : "consent")}
          className={`${BTN} bg-violet-500/90 text-white hover:bg-violet-500`}>
          {t.startNow}
        </button>
        <button type="button" onClick={() => setStage("later")}
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
        <p className="mb-4 text-sm leading-relaxed text-zinc-300">{t.introBody}</p>

        {!playing ? (
          <button type="button" onClick={() => setPlaying(true)}
            className={`${BTN} bg-violet-500/90 text-white hover:bg-violet-500`}>
            ▶ {t.introPlay}
          </button>
        ) : intro && intro.kind === "file" ? (
          // playsInline, or iOS takes the video fullscreen and drops them out
          // of the form when it ends.
          <video src={embed} controls autoPlay playsInline
            className="w-full rounded-xl bg-black" />
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
        <button type="button" onClick={() => void agree()}
          className={`${BTN} bg-violet-500/90 text-white hover:bg-violet-500`}>
          {t.agree}
        </button>
        <button type="button" onClick={() => setStage("later")}
          className="mt-3 w-full py-2 text-sm text-zinc-400 underline">
          {t.decline}
        </button>
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

      {!recording && !saved && !silent && (
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
