"use client";

import { useState } from "react";
import VoiceScreening from "@/components/apply/VoiceScreening";

/**
 * Public application form.
 *
 * Every one of the 135 applications on record was typed in by HR from Messenger.
 * That is why only 19 carry a requisition link, why position arrives as free text
 * like "PIC new QC store", and why applied_date is the day HR typed it. Taking
 * applications here fixes all of that and removes the typing.
 *
 * Written for a phone on a prepaid connection: no images, no fonts to fetch, no
 * client-side libraries. Everything below is text and native form controls.
 *
 * English and Tagalog, because the people applying for kitchen work read one or
 * the other and a form nobody understands is a form nobody finishes.
 */

type Lang = "en" | "tl";

const T = {
  en: {
    title: "Work at Sushi ZEN",
    intro: "Fill this in and we will message you. It takes about two minutes.",
    name: "Full name",
    namePh: "Juan Dela Cruz",
    phone: "Mobile number",
    phonePh: "0917 123 4567",
    phoneHelp: "We will contact you on this number.",
    position: "What work are you applying for?",
    branch: "Which branch do you prefer?",
    experience: "Experience in food service",
    lastEmployer: "Where did you work last?",
    lastEmployerHint: "The company name, as it is written",
    firstJob: "This is my first job",
    firstJobHint: "Tick this and you can leave the two boxes above blank.",
    lastPosition: "What was your position there?",
    lastDuration: "How long were you there? (optional)",
    homeArea: "Which area do you live in? (optional)",
    homeAreaHint: "So we can suggest a branch near you",
    availableFrom: "When can you start?",
    apps: "Which of these do you use on this number?",
    appsHelp: "So we can send you the next step. Leave blank if you are not sure — we will text you.",
    fb: "Facebook profile link (optional)",
    fbPh: "facebook.com/yourname",
    referrer: "Who referred you? (optional)",
    referrerPh: "Name of the person",
    notes: "Anything else? (optional)",
    submit: "Send application",
    sending: "Sending…",
    choose: "— Choose —",
    doneTitle: "Thank you",
    doneBody: "We have your application. Someone from Sushi ZEN will message you on the number you gave.",
    doneAgain: "Send another application",
    errRequired: "Please complete the highlighted fields.",
    errNetwork: "Could not send. Check your connection and try again.",
    errBusy: "Too many applications from this connection. Please try later, or message us on Facebook.",
    positions: {
      kitchen: "Kitchen", cashier: "Cashier", pic: "Person in charge",
      driver: "Driver", back_office: "Office",
    } as Record<string, string>,
    experiences: {
      none: "None", under_1y: "Less than 1 year",
      "1_3y": "1 to 3 years", over_3y: "More than 3 years",
    } as Record<string, string>,
    appNames: { viber: "Viber", whatsapp: "WhatsApp", sms: "SMS only" } as Record<string, string>,
  },
  tl: {
    title: "Magtrabaho sa Sushi ZEN",
    intro: "Punan ito at kami ang mag-me-message sa iyo. Mga dalawang minuto lang.",
    name: "Buong pangalan",
    namePh: "Juan Dela Cruz",
    phone: "Numero ng cellphone",
    phonePh: "0917 123 4567",
    phoneHelp: "Dito ka namin kokontakin.",
    position: "Anong trabaho ang inaaplayan mo?",
    branch: "Aling branch ang gusto mo?",
    experience: "Karanasan sa food service",
    lastEmployer: "Saan ka huling nagtrabaho?",
    lastEmployerHint: "Ang pangalan ng kompanya, kung paano ito nakasulat",
    firstJob: "Ito ang una kong trabaho",
    firstJobHint: "Lagyan ito ng tsek at pwede mong iwang blangko ang dalawang kahon sa itaas.",
    lastPosition: "Ano ang posisyon mo doon?",
    lastDuration: "Gaano ka katagal doon? (opsyonal)",
    homeArea: "Saang lugar ka nakatira? (opsyonal)",
    homeAreaHint: "Para makapagmungkahi kami ng branch na malapit sa iyo",
    availableFrom: "Kailan ka pwedeng magsimula?",
    apps: "Alin sa mga ito ang gamit mo sa numerong ito?",
    appsHelp: "Para maipadala namin ang susunod na hakbang. Pwedeng iwanang blangko — ite-text ka namin.",
    fb: "Link ng Facebook profile (opsyonal)",
    fbPh: "facebook.com/pangalanmo",
    referrer: "Sino ang nag-refer sa iyo? (opsyonal)",
    referrerPh: "Pangalan ng tao",
    notes: "May iba ka pang sasabihin? (opsyonal)",
    submit: "Ipadala ang aplikasyon",
    sending: "Ipinapadala…",
    choose: "— Pumili —",
    doneTitle: "Salamat",
    doneBody: "Natanggap na namin ang aplikasyon mo. May mag-me-message sa iyo mula sa Sushi ZEN sa numerong ibinigay mo.",
    doneAgain: "Magpadala ng panibagong aplikasyon",
    errRequired: "Pakikumpleto ang mga naka-highlight na bahagi.",
    errNetwork: "Hindi naipadala. Pakicheck ang koneksyon at subukan ulit.",
    errBusy: "Masyadong maraming aplikasyon mula sa koneksyong ito. Subukan mamaya, o mag-message sa Facebook.",
    positions: {
      kitchen: "Kusina", cashier: "Cashier", pic: "Person in charge",
      driver: "Driver", back_office: "Opisina",
    } as Record<string, string>,
    experiences: {
      none: "Wala", under_1y: "Wala pang 1 taon",
      "1_3y": "1 hanggang 3 taon", over_3y: "Higit 3 taon",
    } as Record<string, string>,
    appNames: { viber: "Viber", whatsapp: "WhatsApp", sms: "SMS lang" } as Record<string, string>,
  },
};

// Kept in step with app/db_public_apply.py. Hardcoded rather than fetched: one
// request fewer on a prepaid connection, and the form still opens if the API is
// briefly down -- the applicant only finds out when they press Send.
const POSITIONS = ["kitchen", "cashier", "pic", "driver", "back_office"];
// Every option carries where it is. "Central Kitchen" and "Office" say nothing
// about the city, and an applicant who picks one and then finds out it is an
// hour away has been wasted -- which is what the store asked us to fix.
// `area` is the short locator shown in the dropdown; `address` is the full line
// shown once a branch is picked, so the exact place is on screen before sending.
// Addresses are the ones on file in proc_branch_delivery_addresses -- not typed
// from memory. The office has no address on file, so it shows the area only.
const BRANCHES = [
  { code: "TAFT", label: "Taft", area: "Malate, Manila",
    address: "The Sundry Food Hall Taft, 2661 Dominga Street, Malate, Manila" },
  { code: "PAR", label: "Parañaque", area: "Don Bosco",
    address: "The Sundry Food Hall Parañaque, 88 Doña Soledad Ave, Better Living Subdivision, Don Bosco, Parañaque" },
  { code: "CUB", label: "Cubao", area: "Quezon City",
    address: "Cubao, Quezon City" },
  { code: "CK", label: "Central Kitchen", area: "Quezon City",
    address: "20 1st Ave., Brgy. Bagong Lipunan Ng Crame, Quezon City" },
  { code: "BO", label: "Office", area: "Taguig", address: "" },
];
const EXPERIENCE = ["none", "under_1y", "1_3y", "over_3y"];
// Viber first: it is the common one in the Philippines, and an app nobody uses
// sitting at the top is an app somebody taps by mistake.
const CONTACT_APPS = ["viber", "whatsapp", "sms"];

const FIELD =
  "w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-base text-white " +
  "placeholder:text-zinc-500 focus:border-violet-400/60 focus:outline-none";
const BAD = "border-red-400/70";

export default function ApplyPage() {
  const [lang, setLang] = useState<Lang>("en");
  const t = T[lang];

  const [form, setForm] = useState({
    full_name: "", phone: "", position_group: "", branch: "",
    experience_level: "", available_from: "", referrer_name: "", notes: "",
    facebook_url: "",
    // Typed by the applicant rather than said into a microphone. These are the
    // three things the transcript gets wrong most often -- a previous employer
    // came back as "Donuts" when it was McDonald's -- and the person applying
    // knows how to spell them.
    last_employer: "", last_position: "", last_duration: "", home_area: "",
    website: "",   // honeypot
  });
  const [apps, setApps] = useState<string[]>([]);
  const [bad, setBad] = useState<string[]>([]);
  // Whether we ask for a former employer. Driven by an explicit "first job"
  // tick, not by the experience dropdown: that one asks about **food service**,
  // so somebody who spent two years in retail would answer "None" and skip the
  // employer we actually want. Drives both the * and the validation, so the
  // mark and the rule cannot disagree.
  const [firstJob, setFirstJob] = useState(false);
  const needsLastJob = !firstJob;
  const branchPicked = BRANCHES.find((b) => b.code === form.branch);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  // Returned by /api/apply so the interview opens straight away. Null when the
  // storage folder is not configured -- then nothing is offered, rather than
  // asking someone to record into nowhere.
  const [voiceToken, setVoiceToken] = useState("");

  const set = (k: string, v: string) => {
    setForm((p) => ({ ...p, [k]: v }));
    setBad((p) => p.filter((x) => x !== k));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");

    // Checked here as well as on the server so a mistake costs no data.
    const missing: string[] = [];
    if (form.full_name.trim().length < 2) missing.push("full_name");
    if (form.phone.replace(/\D/g, "").length < 7) missing.push("phone");
    if (!form.position_group) missing.push("position_group");
    if (!form.branch) missing.push("branch");
    // Required only for somebody who has worked. Asking a first-time job
    // seeker for a former employer just puts "N/A" in the field, and then
    // "no experience" and "could not be bothered" look the same.
    if (!form.experience_level) missing.push("experience_level");
    if (needsLastJob) {
      if (!form.last_employer.trim()) missing.push("last_employer");
      if (!form.last_position.trim()) missing.push("last_position");
    }
    if (missing.length) { setBad(missing); setErr(t.errRequired); return; }

    setBusy(true);
    try {
      // Relative URL: the request must go through the Next proxy (lesson 13).
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, contact_apps: apps, language: lang }),
      });
      if (res.status === 429) { setErr(t.errBusy); return; }
      if (!res.ok) {
        // Read the body before checking ok -- a 413 comes back as text/plain and
        // res.json() would throw, losing the reason (lesson 24).
        const text = await res.text();
        let fields: string[] = [];
        try { fields = JSON.parse(text)?.detail?.invalid_fields || []; } catch { /* text */ }
        if (fields.length) { setBad(fields); setErr(t.errRequired); }
        else setErr(t.errNetwork);
        return;
      }
      try { setVoiceToken(JSON.parse(await res.text())?.voice?.token || ""); }
      catch { setVoiceToken(""); }
      setDone(true);
    } catch {
      setErr(t.errNetwork);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="py-10 text-center">
        <h1 className="text-2xl font-semibold text-white">{t.doneTitle}</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-300">{t.doneBody}</p>
        {voiceToken && <VoiceScreening token={voiceToken} lang={lang} />}

        <button
          type="button"
          onClick={() => {
            setDone(false);
            setVoiceToken("");
            setForm({
              full_name: "", phone: "", position_group: "", branch: "",
              experience_level: "", available_from: "", referrer_name: "",
              notes: "", facebook_url: "",
              last_employer: "", last_position: "", last_duration: "",
              home_area: "", website: "",
            });
            setApps([]);
          }}
          className="mt-8 text-sm text-violet-300 underline"
        >
          {t.doneAgain}
        </button>
      </div>
    );
  }

  return (
    <div className="py-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">{t.title}</h1>
        <div className="flex gap-1 text-xs">
          {(["en", "tl"] as const).map((l) => (
            <button
              key={l} type="button" onClick={() => setLang(l)}
              className={`rounded-lg px-2.5 py-1.5 ${
                lang === l ? "bg-violet-500/25 text-violet-100" : "text-zinc-500"}`}
            >
              {l === "en" ? "English" : "Tagalog"}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-6 text-sm text-zinc-400">{t.intro}</p>

      <form onSubmit={submit} className="space-y-5" noValidate>
        <div>
          <label className="mb-1.5 block text-sm text-zinc-300">{t.name}</label>
          <input
            value={form.full_name} onChange={(e) => set("full_name", e.target.value)}
            placeholder={t.namePh} autoComplete="name" enterKeyHint="next"
            className={`${FIELD} ${bad.includes("full_name") ? BAD : ""}`}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm text-zinc-300">{t.phone}</label>
          <input
            value={form.phone} onChange={(e) => set("phone", e.target.value)}
            placeholder={t.phonePh} type="tel" inputMode="tel" autoComplete="tel"
            className={`${FIELD} ${bad.includes("phone") ? BAD : ""}`}
          />
          <p className="mt-1.5 text-xs text-zinc-500">{t.phoneHelp}</p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm text-zinc-300">{t.position}</label>
          <select
            value={form.position_group} onChange={(e) => set("position_group", e.target.value)}
            className={`${FIELD} ${bad.includes("position_group") ? BAD : ""}`}
          >
            <option value="">{t.choose}</option>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>{t.positions[p]}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm text-zinc-300">{t.branch}</label>
          <select
            value={form.branch} onChange={(e) => set("branch", e.target.value)}
            className={`${FIELD} ${bad.includes("branch") ? BAD : ""}`}
          >
            <option value="">{t.choose}</option>
            {BRANCHES.map((b) => (
              <option key={b.code} value={b.code}>{b.label} — {b.area}</option>
            ))}
          </select>
          {branchPicked && (
            <div className="mt-1.5 text-xs text-zinc-400">
              {branchPicked.address || branchPicked.area}
            </div>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm text-zinc-300">{t.experience}</label>
          <select
            value={form.experience_level}
            onChange={(e) => set("experience_level", e.target.value)}
            className={`${FIELD} ${bad.includes("experience_level") ? BAD : ""}`}
          >
            <option value="">{t.choose}</option>
            {EXPERIENCE.map((x) => (
              <option key={x} value={x}>{t.experiences[x]}</option>
            ))}
          </select>
        </div>

        {/* Required once somebody says they have experience, and never before
            that. This is the field the voice interview stopped asking for,
            because the machine mis-hears company names — blank here puts that
            problem back. */}
        <div>
          <label className="mb-1.5 block text-sm text-zinc-300">
            {t.lastEmployer}{needsLastJob && <span className="text-rose-400"> *</span>}
          </label>
          <input
            value={form.last_employer}
            onChange={(e) => set("last_employer", e.target.value)}
            className={`${FIELD} ${bad.includes("last_employer") ? BAD : ""}`}
            autoComplete="organization"
          />
          <p className="mt-1 text-xs text-zinc-500">{t.lastEmployerHint}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm text-zinc-300">
              {t.lastPosition}{needsLastJob && <span className="text-rose-400"> *</span>}
            </label>
            <input
              value={form.last_position}
              onChange={(e) => set("last_position", e.target.value)}
              className={`${FIELD} ${bad.includes("last_position") ? BAD : ""}`}
              autoComplete="organization-title"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm text-zinc-300">{t.lastDuration}</label>
            <input
              value={form.last_duration}
              onChange={(e) => set("last_duration", e.target.value)}
              className={FIELD}
              placeholder="2 years"
            />
          </div>
        </div>

        <div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={firstJob}
              onChange={(e) => {
                setFirstJob(e.target.checked);
                setBad((b) => b.filter((x) => x !== "last_employer" && x !== "last_position"));
              }}
              className="h-4 w-4 accent-violet-500"
            />
            {t.firstJob}
          </label>
          <p className="mt-1 text-xs text-zinc-500">{t.firstJobHint}</p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm text-zinc-300">{t.homeArea}</label>
          <input
            value={form.home_area}
            onChange={(e) => set("home_area", e.target.value)}
            className={FIELD}
            autoComplete="address-level2"
          />
          <p className="mt-1 text-xs text-zinc-500">{t.homeAreaHint}</p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm text-zinc-300">{t.apps}</label>
          <div className="flex flex-wrap gap-2">
            {CONTACT_APPS.map((a) => {
              const on = apps.includes(a);
              return (
                <button
                  key={a} type="button"
                  onClick={() => setApps((p) => on ? p.filter((x) => x !== a) : [...p, a])}
                  aria-pressed={on}
                  className={`rounded-xl border px-4 py-3 text-sm transition ${
                    on ? "border-violet-400/60 bg-violet-500/20 text-violet-100"
                       : "border-white/15 text-zinc-400"}`}
                >
                  {on ? "✓ " : ""}{t.appNames[a]}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-zinc-500">{t.appsHelp}</p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm text-zinc-300">{t.fb}</label>
          <input
            value={form.facebook_url} onChange={(e) => set("facebook_url", e.target.value)}
            placeholder={t.fbPh} inputMode="url" autoComplete="off" className={FIELD}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm text-zinc-300">{t.availableFrom}</label>
          <input
            value={form.available_from} onChange={(e) => set("available_from", e.target.value)}
            type="date" className={FIELD}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm text-zinc-300">{t.referrer}</label>
          <input
            value={form.referrer_name} onChange={(e) => set("referrer_name", e.target.value)}
            placeholder={t.referrerPh} className={FIELD}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm text-zinc-300">{t.notes}</label>
          <textarea
            value={form.notes} onChange={(e) => set("notes", e.target.value)}
            rows={3} maxLength={1000} className={FIELD}
          />
        </div>

        {/* Honeypot. Off-screen rather than display:none, which some form-fillers
            skip, and never announced to screen readers. */}
        <div className="absolute left-[-9999px]" aria-hidden="true">
          <label>
            Website
            <input
              value={form.website} onChange={(e) => set("website", e.target.value)}
              tabIndex={-1} autoComplete="off"
            />
          </label>
        </div>

        {err && (
          <p className="rounded-xl border border-red-500/30 bg-red-950/20 p-3 text-sm text-red-200">
            {err}
          </p>
        )}

        <button
          type="submit" disabled={busy}
          className="w-full rounded-xl bg-violet-500/90 px-4 py-4 text-base font-semibold text-white transition hover:bg-violet-500 disabled:opacity-60"
        >
          {busy ? t.sending : t.submit}
        </button>
      </form>
    </div>
  );
}
