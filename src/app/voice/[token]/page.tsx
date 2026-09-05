"use client";

import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import VoiceScreening from "@/components/apply/VoiceScreening";

/**
 * Where an invite link lands.
 *
 * Applicants who chose to record later, and the ones already in the pipeline
 * from before the form existed, get here from a message rather than from
 * sending the form. They arrive having already decided -- opening the link is
 * the choice the offer screen would ask for -- so this starts at consent.
 *
 * The recorder renders nothing when the token is dead, which is right inside
 * /apply and wrong here: a link somebody tapped from a message must never open
 * a blank page. It says what happened and what to do instead.
 */

type Lang = "en" | "tl";

const T = {
  en: {
    expiredTitle: "This link has expired",
    expiredBody:
      "Voice interview links stop working after a couple of weeks. Reply to the message Sushi ZEN sent you and ask for a new one — your application is still on file.",
    offTitle: "Not available right now",
    offBody:
      "The voice interview is not open at the moment. Nothing is wrong with your application. Reply to the message Sushi ZEN sent you.",
    errTitle: "Could not load",
    errBody: "Check your connection and open the link again.",
    retry: "Try again",
  },
  tl: {
    expiredTitle: "Expired na po ang link na ito",
    expiredBody:
      "Ang mga link para sa voice interview ay tumitigil pagkatapos ng ilang linggo. I-reply lang po ang message na ipinadala ng Sushi ZEN at humingi ng bago — nasa amin pa rin ang application mo.",
    offTitle: "Hindi pa po available",
    offBody:
      "Sarado po ang voice interview sa ngayon. Walang problema sa application mo. I-reply lang po ang message ng Sushi ZEN.",
    errTitle: "Hindi ma-load",
    errBody: "Pakicheck ang koneksyon at buksan ulit ang link.",
    retry: "Subukan ulit",
  },
};

export default function VoiceInvitePage() {
  const params = useParams<{ token: string }>();
  const token = String(params?.token || "");
  const [lang, setLang] = useState<Lang>("en");
  const [dead, setDead] = useState<"expired" | "off" | "error" | null>(null);
  // Changing this remounts the recorder, which is how "Try again" retries.
  const [attempt, setAttempt] = useState(0);
  const t = T[lang];

  // Stable across renders: the recorder lists it as an effect dependency, and a
  // new function every render would refetch the token in a loop.
  const unavailable = useCallback(
    (reason: "expired" | "off" | "error") => setDead(reason),
    [],
  );

  if (dead) {
    const title = dead === "expired" ? t.expiredTitle
      : dead === "off" ? t.offTitle : t.errTitle;
    const body = dead === "expired" ? t.expiredBody
      : dead === "off" ? t.offBody : t.errBody;
    return (
      <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-white">{title}</h1>
          <div className="flex gap-1 text-xs">
            {(["en", "tl"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className={`rounded-lg px-2 py-1 ${
                  lang === l ? "bg-violet-500/25 text-violet-100" : "text-zinc-500"
                }`}
              >
                {l === "en" ? "English" : "Tagalog"}
              </button>
            ))}
          </div>
        </div>
        <p className="text-sm leading-relaxed text-zinc-300">{body}</p>
        {dead === "error" && (
          <button
            type="button"
            onClick={() => { setDead(null); setAttempt((a) => a + 1); }}
            className="mt-4 w-full rounded-xl bg-violet-500/90 py-3 text-sm font-semibold text-white"
          >
            {t.retry}
          </button>
        )}
      </div>
    );
  }

  return (
    <VoiceScreening
      key={attempt}
      token={token}
      lang={lang}
      startAt="consent"
      onUnavailable={unavailable}
    />
  );
}
