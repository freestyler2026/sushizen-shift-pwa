"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

/**
 * Where a booking link lands.
 *
 * The applicant passed the voice round and now picks a time. Nobody on our
 * side types a date -- that is the whole point. Recruitment held 63 interview
 * evaluations against 4 schedules, because an evaluation decides whether to
 * hire and a schedule returned nothing for the typing.
 *
 * Everything here happens on a phone, held one-handed, probably on data. Six
 * buttons, one tap, done. No login, no install, no account.
 *
 * We never ask how to reach them: they already answered that on the form, so
 * the confirmation tells them which app we will call on rather than asking.
 */

type Lang = "en" | "tl";
type Slot = { starts_at: string; interviewer: string };
type Booked = {
  starts_at: string;
  interviewer: string;
  contact_via: string;
  location: string;
};

const MNL = "Asia/Manila";

const T = {
  en: {
    hi: "Hi",
    lead: "You passed the first round. Pick a time that works for you.",
    pick: "Choose a time",
    none: "None of these work — show me more",
    noMore: "That is everything we have open. Reply to our message and we will find another time.",
    confirmQ: "Book this time?",
    confirm: "Yes, book it",
    back: "Go back",
    booked: "You are booked",
    withWho: "Interviewer",
    how: "How we will reach you",
    where: "Where",
    change: "Change or cancel",
    cancelQ: "Cancel this interview?",
    cancelYes: "Yes, cancel",
    cancelled: "Cancelled. Open this link again to pick a new time.",
    taken: "Sorry, someone just took that time. Here are the next ones.",
    expired: "This link has expired",
    expiredBody:
      "Booking links stop working after 7 days. Reply to the message Sushi ZEN sent you and ask for a new one — your application is still on file.",
    errTitle: "Could not load",
    errBody: "Check your connection and open the link again.",
    retry: "Try again",
    loading: "Loading…",
    via: {
      viber: "We will call you on Viber",
      whatsapp: "We will call you on WhatsApp",
      messenger: "We will message you on Messenger",
      telegram: "We will call you on Telegram",
      call: "We will call your phone",
    } as Record<string, string>,
    note: "It takes about 30 minutes. No need to install anything.",
  },
  tl: {
    hi: "Hi",
    lead: "Pasado ka po sa unang round. Pumili ng oras na kaya mo.",
    pick: "Pumili ng oras",
    none: "Walang bagay sa akin — magpakita pa",
    noMore: "Iyan na po ang lahat ng bukas. I-reply lang ang message namin at maghahanap kami ng ibang oras.",
    confirmQ: "I-book ang oras na ito?",
    confirm: "Oo, i-book",
    back: "Bumalik",
    booked: "Naka-book ka na po",
    withWho: "Kausap mo",
    how: "Paano ka namin kokontakin",
    where: "Saan",
    change: "Baguhin o kanselahin",
    cancelQ: "Kanselahin ang interview na ito?",
    cancelYes: "Oo, kanselahin",
    cancelled: "Nakansela po. Buksan ulit ang link para pumili ng bagong oras.",
    taken: "Pasensya po, may kumuha lang ng oras na iyon. Eto po ang susunod.",
    expired: "Expired na po ang link na ito",
    expiredBody:
      "Ang mga booking link ay tumitigil pagkatapos ng 7 araw. I-reply lang po ang message ng Sushi ZEN at humingi ng bago — nasa amin pa rin ang application mo.",
    errTitle: "Hindi ma-load",
    errBody: "I-check ang connection at buksan ulit ang link.",
    retry: "Subukan ulit",
    loading: "Naglo-load…",
    via: {
      viber: "Tatawagan ka namin sa Viber",
      whatsapp: "Tatawagan ka namin sa WhatsApp",
      messenger: "Mame-message ka namin sa Messenger",
      telegram: "Tatawagan ka namin sa Telegram",
      call: "Tatawagan namin ang phone mo",
    } as Record<string, string>,
    note: "Mga 30 minuto po. Walang kailangang i-install.",
  },
};

/** Always show Manila time, whatever the phone is set to. */
function dayLabel(iso: string, lang: Lang) {
  return new Date(iso).toLocaleDateString(lang === "tl" ? "en-PH" : "en-GB", {
    timeZone: MNL,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: MNL,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BookPage() {
  const params = useParams();
  const token = String(params?.token || "");
  const [lang, setLang] = useState<Lang>("en");
  const [state, setState] = useState<"loading" | "ok" | "expired" | "error">("loading");
  const [name, setName] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [booked, setBooked] = useState<Booked | null>(null);
  const [confirming, setConfirming] = useState<Slot | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState("");
  const t = T[lang];

  const load = useCallback(
    async (after?: string) => {
      try {
        const qs = after ? `?after=${encodeURIComponent(after)}` : "";
        const res = await fetch(`/api/book/${token}${qs}`);
        if (res.status === 404) return setState("expired");
        if (!res.ok) return setState("error");
        const d = await res.json();
        setName(String(d.full_name || "").split(" ")[0] || "");
        if (d.language === "tl" && !after) setLang("tl");
        setBooked(d.booked || null);
        setSlots(d.slots || []);
        setHasMore(Boolean(d.has_more));
        setState("ok");
      } catch {
        setState("error");
      }
    },
    [token],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function confirm(slot: Slot) {
    setBusy(true);
    setFlash("");
    try {
      const res = await fetch(`/api/book/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ starts_at: slot.starts_at, interviewer: slot.interviewer }),
      });
      if (res.status === 409) {
        setFlash(t.taken);
        setConfirming(null);
        await load();
        return;
      }
      const d = await res.json();
      setBooked({
        starts_at: d.starts_at,
        interviewer: d.interviewer,
        contact_via: d.contact_via,
        location: d.location,
      });
      setConfirming(null);
    } catch {
      setFlash(t.errBody);
    } finally {
      setBusy(false);
    }
  }

  async function doCancel() {
    setBusy(true);
    try {
      await fetch(`/api/book/${token}/cancel`, { method: "POST" });
      setBooked(null);
      setCancelling(false);
      setFlash(t.cancelled);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-5 py-8">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <span className="text-sm font-semibold tracking-wide text-violet-300">SUSHI ZEN</span>
          <div className="flex gap-1 rounded-full bg-zinc-900 p-1">
            {(["en", "tl"] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`rounded-full px-3 py-1 text-xs ${
                  lang === l ? "bg-violet-500/25 text-violet-100" : "text-zinc-500"
                }`}
              >
                {l === "en" ? "English" : "Tagalog"}
              </button>
            ))}
          </div>
        </div>
        {children}
      </div>
    </main>
  );

  if (state === "loading") return <Shell><p className="text-zinc-400">{t.loading}</p></Shell>;
  if (state === "expired")
    return (
      <Shell>
        <h1 className="text-xl font-semibold">{t.expired}</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">{t.expiredBody}</p>
      </Shell>
    );
  if (state === "error")
    return (
      <Shell>
        <h1 className="text-xl font-semibold">{t.errTitle}</h1>
        <p className="mt-3 text-sm text-zinc-400">{t.errBody}</p>
        <button
          onClick={() => void load()}
          className="mt-5 rounded-xl bg-violet-600 px-5 py-3 text-sm font-medium"
        >
          {t.retry}
        </button>
      </Shell>
    );

  if (booked)
    return (
      <Shell>
        <h1 className="text-2xl font-semibold text-violet-200">{t.booked}</h1>
        <div className="mt-5 rounded-2xl border border-violet-500/30 bg-violet-500/10 p-5">
          <p className="text-lg font-semibold">{dayLabel(booked.starts_at, lang)}</p>
          <p className="text-3xl font-bold tracking-tight">{timeLabel(booked.starts_at)}</p>
          <p className="mt-1 text-xs text-zinc-400">Philippine time</p>
        </div>
        <dl className="mt-5 space-y-3 text-sm">
          <div>
            <dt className="text-zinc-500">{t.withWho}</dt>
            <dd className="font-medium">{booked.interviewer}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">{t.how}</dt>
            <dd className="font-medium text-violet-200">
              {t.via[booked.contact_via] || t.via.call}
            </dd>
          </div>
        </dl>
        <p className="mt-5 text-sm text-zinc-400">{t.note}</p>
        {!cancelling ? (
          <button
            onClick={() => setCancelling(true)}
            className="mt-8 text-sm text-zinc-500 underline underline-offset-4"
          >
            {t.change}
          </button>
        ) : (
          <div className="mt-8 rounded-xl border border-zinc-800 p-4">
            <p className="text-sm">{t.cancelQ}</p>
            <div className="mt-3 flex gap-2">
              <button
                disabled={busy}
                onClick={() => void doCancel()}
                className="rounded-xl bg-zinc-800 px-4 py-2 text-sm"
              >
                {t.cancelYes}
              </button>
              <button
                onClick={() => setCancelling(false)}
                className="rounded-xl px-4 py-2 text-sm text-zinc-400"
              >
                {t.back}
              </button>
            </div>
          </div>
        )}
      </Shell>
    );

  if (confirming)
    return (
      <Shell>
        <h1 className="text-xl font-semibold">{t.confirmQ}</h1>
        <div className="mt-5 rounded-2xl border border-violet-500/30 bg-violet-500/10 p-5">
          <p className="text-lg font-semibold">{dayLabel(confirming.starts_at, lang)}</p>
          <p className="text-3xl font-bold tracking-tight">{timeLabel(confirming.starts_at)}</p>
          <p className="mt-2 text-sm text-zinc-300">{confirming.interviewer}</p>
        </div>
        <button
          disabled={busy}
          onClick={() => void confirm(confirming)}
          className="mt-6 w-full rounded-2xl bg-violet-600 px-5 py-4 text-base font-semibold disabled:opacity-50"
        >
          {t.confirm}
        </button>
        <button
          onClick={() => setConfirming(null)}
          className="mt-3 w-full rounded-2xl px-5 py-3 text-sm text-zinc-400"
        >
          {t.back}
        </button>
      </Shell>
    );

  return (
    <Shell>
      <h1 className="text-2xl font-semibold">
        {t.hi} {name}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">{t.lead}</p>
      {flash && (
        <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          {flash}
        </p>
      )}
      <h2 className="mt-7 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        {t.pick}
      </h2>
      <div className="mt-3 space-y-2">
        {slots.map((s) => (
          <button
            key={`${s.starts_at}-${s.interviewer}`}
            onClick={() => setConfirming(s)}
            className="flex w-full items-baseline justify-between rounded-2xl border border-zinc-800 bg-zinc-900 px-5 py-4 text-left active:bg-zinc-800"
          >
            <span className="text-sm text-zinc-300">{dayLabel(s.starts_at, lang)}</span>
            <span className="text-xl font-semibold tabular-nums">{timeLabel(s.starts_at)}</span>
          </button>
        ))}
      </div>
      {slots.length === 0 && <p className="mt-4 text-sm text-zinc-400">{t.noMore}</p>}
      {hasMore && (
        <button
          onClick={() => void load(slots[slots.length - 1]?.starts_at)}
          className="mt-5 w-full rounded-2xl border border-zinc-800 px-5 py-3 text-sm text-zinc-400"
        >
          {t.none}
        </button>
      )}
      <p className="mt-8 text-xs text-zinc-500">{t.note}</p>
    </Shell>
  );
}
