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
interface Loaded {
  name: string; language: string; status: string;
  consent_given: boolean; consent_version: string; retain_days: number;
  questions: Question[]; answered: number[];
}

type Lang = "en" | "tl";

const T = {
  en: {
    heading: "One more step (optional)",
    lead: "Answer a few questions by voice, in your own time. About ten minutes. No appointment, nothing to attend.",
    startNow: "Answer now by voice",
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
    micDenied: "This browser is not letting us use the microphone. Allow it for this site (tap the icon in the address bar), then press Start recording again.",
    micNone: "No microphone was found on this device. Try a phone with a microphone, or do this later.",
    micBusy: "The microphone is being used by another app. Close it and try again.",
    micUnsupported: "This browser cannot record audio. Chrome works. You can also do this later — your application is already sent.",
    micOther: "The microphone could not be started.",
    laterHere: "Do this later instead",
    failed: "Could not send that answer. Try recording it again.",
    left: "left",
    againLeft: "You can re-record this answer once.",
  },
  tl: {
    heading: "Isa pang hakbang (opsyonal)",
    lead: "Sagutin ang ilang tanong gamit ang boses mo, kahit anong oras. Mga sampung minuto. Walang appointment, walang pupuntahan.",
    startNow: "Sumagot ngayon gamit ang boses",
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
    micDenied: "Hindi pinapayagan ng browser na ito ang mikropono. I-allow po ito para sa site na ito (pindutin ang icon sa address bar), tapos pindutin ulit ang Mag-record.",
    micNone: "Walang nakitang mikropono sa device na ito. Subukan sa telepono na may mikropono, o gawin na lang mamaya.",
    micBusy: "Ginagamit ng ibang app ang mikropono. Isara po ito at subukan ulit.",
    micUnsupported: "Hindi makapag-record ang browser na ito. Gumagana ang Chrome. Pwede rin gawin mamaya — naipadala na po ang application mo.",
    micOther: "Hindi masimulan ang mikropono.",
    laterHere: "Mamaya na lang gawin ito",
    failed: "Hindi naipadala ang sagot na iyon. Subukang i-record ulit.",
    left: "natitira",
    againLeft: "Pwede mong i-record ulit ang sagot na ito nang isang beses.",
  },
};

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
  const [stage, setStage] = useState<"offer" | "consent" | "record" | "later" | "done">(startAt);
  const [idx, setIdx] = useState(0);
  const [recording, setRecording] = useState(false);
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [retries, setRetries] = useState(0);
  const [err, setErr] = useState("");

  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

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
  useEffect(() => stopTimer, []);

  if (!data || !data.questions.length) return null;

  const q = data.questions[idx];
  const total = data.questions.length;
  const text = lang === "tl" && q?.text_tl ? q.text_tl : q?.text_en;

  async function agree() {
    setErr("");
    await fetch(`/api/voice/${token}/consent`, { method: "POST" });
    setStage("record");
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
    setErr(""); setSaved(false);

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
    rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    rec.onstop = () => {
      stream.getTracks().forEach((tr) => tr.stop());
      // The recorder's own mimeType is the truth once the options were dropped.
      const type = (rec.mimeType || mime || "audio/webm").split(";")[0];
      void upload(new Blob(chunks.current, { type }), type);
    };
    rec.onerror = () => {
      stopTimer();
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

  async function upload(blob: Blob, type = "audio/webm") {
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      // Named for what it is: Safari produces mp4, not webm, and a file whose
      // extension contradicts its contents is a thing somebody has to untangle
      // later on Drive.
      const ext = type === "audio/mp4" ? "m4a" : type === "audio/ogg" ? "ogg" : "webm";
      fd.append("audio", blob, `q${q.seq}.${ext}`);
      fd.append("duration_seconds",
        String(Math.round((Date.now() - startedAt.current) / 1000)));
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

  const card = "rounded-2xl border border-white/10 bg-white/5 p-5";

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
        <button type="button" onClick={() => setStage("consent")}
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
        <p className="text-sm text-zinc-300">{t.laterNote}</p>
      </div>
    );
  }

  if (stage === "consent") {
    return (
      <div className={`${card} mt-8`}>
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

  if (stage === "done") {
    return (
      <div className={`${card} mt-8 text-center`}>
        <h2 className="text-lg font-semibold text-white">{t.doneTitle}</h2>
        <p className="mt-2 text-sm text-zinc-300">{t.doneBody}</p>
      </div>
    );
  }

  return (
    <div className={`${card} mt-8`}>
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

      <p className="mb-5 text-base leading-relaxed text-white">{text}</p>

      {!recording && !saved && (
        <button type="button" onClick={() => void start()} disabled={busy}
          className={`${BTN} bg-violet-500/90 text-white hover:bg-violet-500`}>
          {busy ? t.uploading : t.record}
        </button>
      )}

      {recording && (
        <button type="button" onClick={stop}
          className={`${BTN} bg-red-500/90 text-white hover:bg-red-500`}>
          ● {t.stop}
        </button>
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
