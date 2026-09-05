"use client";

import { useState } from "react";

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
const BRANCHES = [
  { code: "TAFT", label: "Taft" },
  { code: "PAR", label: "Parañaque" },
  { code: "CUB", label: "Cubao" },
  { code: "CK", label: "Central Kitchen" },
  { code: "BO", label: "Office" },
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
    website: "",   // honeypot
  });
  const [apps, setApps] = useState<string[]>([]);
  const [bad, setBad] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

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
        <button
          type="button"
          onClick={() => {
            setDone(false);
            setForm({
              full_name: "", phone: "", position_group: "", branch: "",
              experience_level: "", available_from: "", referrer_name: "",
              notes: "", facebook_url: "", website: "",
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
              <option key={b.code} value={b.code}>{b.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm text-zinc-300">{t.experience}</label>
          <select
            value={form.experience_level}
            onChange={(e) => set("experience_level", e.target.value)}
            className={FIELD}
          >
            <option value="">{t.choose}</option>
            {EXPERIENCE.map((x) => (
              <option key={x} value={x}>{t.experiences[x]}</option>
            ))}
          </select>
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
