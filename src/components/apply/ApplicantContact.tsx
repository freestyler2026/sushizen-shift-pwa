"use client";

import { useEffect, useState } from "react";

/**
 * How an applicant reaches us, on the screens where they are stuck.
 *
 * Both dead ends say some version of "reply to the message Sushi ZEN sent
 * you". That works when a person pasted it into Viber or WhatsApp. It is a
 * dead end when it arrived by SMS: those go out under the sender name
 * SUSHIZEN, so the handset has no number to reply to, and nothing on our side
 * is listening for one.
 *
 * The number is not written here. It comes from the server so that changing it
 * is one setting, and so that these screens go quiet by themselves the day it
 * is unset — an unreachable contact is worse than none.
 */

type Contact = { number?: string; app?: string; link?: string };

const T = {
  en: {
    lead: (app: string) => `Need to reach us? Message us on ${app}.`,
    leadPlain: "You can reach us on this number:",
    open: (app: string) => `Open ${app}`,
  },
  tl: {
    lead: (app: string) => `May kailangan po? Mag-message sa ${app}.`,
    leadPlain: "Pwede po ninyo kaming kontakin dito:",
    open: (app: string) => `Buksan ang ${app}`,
  },
};

export default function ApplicantContact({ lang = "en" }: { lang?: "en" | "tl" }) {
  const [c, setC] = useState<Contact | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/applicant-contact", { cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as Contact;
        // No number configured, or the request came back with nothing usable:
        // render nothing at all rather than an empty heading.
        if (alive && j && j.number) setC(j);
      } catch {
        /* Offer nothing rather than a contact we could not confirm. */
      }
    })();
    return () => { alive = false; };
  }, []);

  if (!c?.number) return null;
  const t = T[lang] ?? T.en;
  const app = c.app || "";
  // `link` only exists for an app we can open directly. Without one, show the
  // number and let them choose -- do not invent an `sms:` link to a foreign
  // number, which is charged at international rates on a Philippine prepaid
  // line and is the reason this says "message" and not "text".
  const href = c.link ? `https://${c.link}` : "";

  return (
    <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4">
      <p className="text-sm text-zinc-300">
        {app ? t.lead(app) : t.leadPlain}
      </p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 block rounded-xl bg-emerald-600/90 py-3 text-center text-sm font-semibold text-white"
        >
          {t.open(app)} — {c.number}
        </a>
      ) : (
        <p className="mt-2 select-all font-mono text-base text-white">{c.number}</p>
      )}
    </div>
  );
}
