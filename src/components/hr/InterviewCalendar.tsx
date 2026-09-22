"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, CalendarPlus, RefreshCw, Phone, MonitorSmartphone, ArrowRight, FileText, Mic, MessageSquare, Copy, Check, Send } from "lucide-react";
import {
  BADGE_INFO,
  BADGE_SUCCESS,
  BADGE_WARNING,
  GLASS_CARD,
  PRIMARY_BUTTON,
  SMALL_BUTTON,
  T_CAPTION,
  T_LABEL,
  T_SECTION,
} from "@/lib/ui-tokens";
import { downloadIcs } from "@/lib/interview-ics";
import OutcomeRecorder from "@/components/hr/OutcomeRecorder";

/**
 * When the interviews are.
 *
 * Booking existed only as a seven-day list. A list answers "who is next"; it
 * does not answer "what does next week look like" or "when is there room",
 * which is most of what arranging an interview is. Putting a time in the system
 * and then not being able to see it on a calendar is what made the whole thing
 * feel unusable.
 *
 * Each day carries the two facts that decide anything: what is booked, and how
 * many slots are still free. The free number is the server's own count of the
 * slots an applicant would be offered, not a second calculation — the day this
 * says "3 free" and the booking page offers two is the day nobody trusts it.
 *
 * A week of the past is included. An interview that happened and has no outcome
 * recorded cannot be seen in a forward-only list, and last week's gap is
 * exactly the one that never gets found.
 */

type Interview = {
  id: string;
  applicant_id: string;
  full_name: string;
  position_applied: string | null;
  time: string;
  starts_at: string;
  ends_at: string | null;
  interviewer: string;
  contact_via: string;
  reach_with: string;
  location: string;
  phone: string;
  /** Which screening holds the CV and the recording. Files never travel in
   *  this payload -- only the name, the size and the count (lesson 29). */
  screening_id: number | null;
  resume_filename: string;
  resume_bytes: number;
  voice_answers: number;
  /** What they typed on the form. The three a transcript gets wrong most
   *  often -- employer, position, how long -- in their own spelling. */
  last_employer: string;
  last_position: string;
  last_duration: string;
  home_area: string;
  experience_level: string;
  available_from: string;
  attended: boolean | null;
  recorded: boolean;
};

type Day = {
  date: string;
  is_today: boolean;
  is_past: boolean;
  interviews: Interview[];
  open_slots: number;
  /** The roster does not reach this day yet, so the standard back-office
   *  weekday is being used. Bookable, but it can change when shifts are
   *  published. Saying so beats presenting a guess as a roster. */
  assumed: boolean;
  unrecorded: number;
};

type Payload = {
  from: string;
  to: string;
  today: string;
  interviewers: string[];
  days: Day[];
  total_booked: number;
  total_open: number;
};

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Monday-based index, so the grid starts where a working week starts. */
function mondayIndex(iso: string): number {
  const d = new Date(`${iso}T00:00:00`);
  return (d.getDay() + 6) % 7;
}

function dayNum(iso: string): string {
  return String(Number(iso.slice(8, 10)));
}

function monthLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    month: "short",
  });
}

function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long",
  });
}

const EXPERIENCE_LABEL: Record<string, string> = {
  none: "No experience", under_1y: "Under 1 year",
  "1_3y": "1–3 years", over_3y: "Over 3 years",
};

const fileSize = (b: number) =>
  !b ? "" : b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;

export default function InterviewCalendar({ onOpenInterview, onOpenVoice }: {
  /** Take the user to that interview on the Interviews tab, ready to act on it. */
  onOpenInterview?: (id: string) => void;
  /** Take them to the recording and transcripts for that screening. */
  onOpenVoice?: (screeningId: number) => void;
} = {}) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [openDay, setOpenDay] = useState<string>("");

  /** The reminder panel, per interview row. The wording is composed by the
   *  server so this and the booking invite cannot drift apart, and so the GSM-7
   *  rule lives in one place (one wide dash turns 160 characters into 67).
   *  Nothing is sent from here: somebody copies it into Viber or WhatsApp. */
  const [remindFor, setRemindFor] = useState<string>("");
  const [remindMsg, setRemindMsg] = useState<{ en: string; tl: string } | null>(null);
  const [remindLang, setRemindLang] = useState<"en" | "tl">("en");
  const [remindErr, setRemindErr] = useState("");
  const [remindBusy, setRemindBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // 面接官はカレンダーで日を開き、応募者を読んで電話をかける。そこで結果を
  // 書けないと、記録は別画面に行った人だけがすることになる。
  const [outcomeFor, setOutcomeFor] = useState<string>("");
  const [justRecorded, setJustRecorded] = useState<Record<string, string>>({});
  /** Whether the OS can text at all, and the result of pressing Send. Read
   *  once per panel: a button that is offered and then fails is worse than no
   *  button, so it is only drawn when the gateway says it can send. */
  const [smsGate, setSmsGate] = useState<{ enabled: boolean; blocked_by: string } | null>(null);
  const [smsBusy, setSmsBusy] = useState(false);
  const [smsSentTo, setSmsSentTo] = useState("");
  const [smsFail, setSmsFail] = useState("");

  const openReminder = async (id: string) => {
    if (remindFor === id) { setRemindFor(""); return; }
    setRemindFor(id); setRemindMsg(null); setRemindErr(""); setCopied(false);
    setRemindLang("en"); setRemindBusy(true);
    setSmsSentTo(""); setSmsFail("");
    void fetch("/api/admin/hr/sms/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSmsGate(d ? { enabled: !!d.enabled, blocked_by: String(d.blocked_by || "") } : null))
      .catch(() => setSmsGate(null));
    try {
      const res = await fetch(`/api/admin/hr/interviews/${id}/reminder`, { cache: "no-store" });
      const text = await res.text();
      if (!res.ok) {
        let msg = text;
        try { msg = JSON.parse(text)?.detail || text; } catch { /* text/plain */ }
        setRemindErr(String(msg).slice(0, 200));
        return;
      }
      const d = JSON.parse(text) as { messages?: { en: string; tl: string }; language?: string };
      setRemindMsg(d.messages ?? null);
      // Their own choice on the application form decides which one opens.
      if (String(d.language || "").toLowerCase() === "tl") setRemindLang("tl");
    } catch {
      setRemindErr("Could not build the message. Try again.");
    } finally {
      setRemindBusy(false);
    }
  };

  /** Text the reminder. The wording sent is the short one the server builds
   *  for SMS -- the panel's version runs to three segments, so sending what is
   *  on screen would cost three credits a person. */
  const sendReminderSms = async (id: string) => {
    if (smsBusy) return;
    setSmsBusy(true); setSmsFail(""); setSmsSentTo("");
    try {
      const res = await fetch(`/api/admin/hr/interviews/${id}/reminder/sms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: remindLang }),
      });
      const text = await res.text();
      let j: Record<string, unknown> = {};
      try { j = JSON.parse(text); } catch { /* text/plain */ }
      if (!res.ok) {
        // A send that failed must never read as a send that worked.
        setSmsFail(String(j.detail || text).slice(0, 200));
        return;
      }
      setSmsSentTo(String(j.sent_to || ""));
    } catch {
      setSmsFail("Could not reach the server. Nothing was sent.");
    } finally {
      setSmsBusy(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/hr/interviews/calendar?weeks=4");
      if (!res.ok) {
        setErr(`Could not load the calendar (${res.status}).`);
        return;
      }
      setData(await res.json());
    } catch {
      setErr("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading && !data) {
    return <div className={`${GLASS_CARD} mb-6 p-4`}><p className={T_CAPTION}>Loading…</p></div>;
  }
  if (!data) {
    return (
      <div className={`${GLASS_CARD} mb-6 p-4`}>
        <p className="text-sm text-amber-300">{err || "No calendar."}</p>
      </div>
    );
  }

  // Blank cells before the first day, so dates land under the right weekday.
  const pad = mondayIndex(data.days[0]?.date || data.today);
  const cells: (Day | null)[] = [...Array(pad).fill(null), ...data.days];
  const selected = data.days.find((d) => d.date === openDay) || null;

  return (
    <div className={`${GLASS_CARD} mb-6 overflow-hidden`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
        <CalendarDays className="h-4 w-4 text-violet-400" />
        <h3 className={T_SECTION}>Interview calendar</h3>
        <span className={data.total_booked ? BADGE_INFO : T_CAPTION}>
          {data.total_booked} booked
        </span>
        <span className={T_CAPTION}>{data.total_open} slots free</span>
        <span className={`${T_CAPTION} hidden sm:inline`}>
          {data.interviewers.join(" · ")}
        </span>
        <button className={`${SMALL_BUTTON} ml-auto`} onClick={() => void load()} disabled={loading}>
          <span className="flex items-center gap-1.5">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </span>
        </button>
      </div>

      <p className={`${T_CAPTION} -mt-1 px-4 pb-3`}>
        Free slots come from the interviewers&apos; published shifts, so a day with
        none means nobody is rostered to interview — not that it is fully booked.
        Interviews are only offered Monday to Friday. Past the end of the published
        roster, weekdays fall back to the standard back-office day (09:00–18:00);
        a <span className="text-zinc-300">*</span> means some of that day&apos;s slots
        are still that fallback. They can be booked, and they firm up when the
        shifts go out.
      </p>

      {err && <p className="px-4 pb-2 text-sm text-amber-300">{err}</p>}

      <div className="border-t border-white/8 px-2 py-2">
        <div className="grid grid-cols-7 gap-1">
          {DOW.map((d) => (
            <div key={d} className={`${T_LABEL} px-1 pb-1 text-center`}>{d}</div>
          ))}
          {cells.map((day, i) => {
            if (!day) return <div key={`pad-${i}`} />;
            const has = day.interviews.length > 0;
            return (
              <button
                key={day.date}
                onClick={() => setOpenDay(openDay === day.date ? "" : day.date)}
                className={[
                  "min-h-[4.5rem] rounded-lg border p-1.5 text-left align-top transition-colors",
                  day.is_today
                    ? "border-violet-400/60 bg-violet-500/10"
                    : "border-white/8 hover:border-white/20",
                  day.is_past ? "opacity-55" : "",
                  openDay === day.date ? "ring-1 ring-inset ring-violet-400/50" : "",
                ].join(" ")}
              >
                <div className="flex items-baseline gap-1">
                  <span className={`text-xs font-semibold ${day.is_today ? "text-violet-200" : "text-zinc-300"}`}>
                    {dayNum(day.date)}
                  </span>
                  {day.date.slice(8, 10) === "01" && (
                    <span className="text-[10px] text-zinc-500">{monthLabel(day.date)}</span>
                  )}
                  {day.unrecorded > 0 && (
                    <span
                      className="ml-auto h-1.5 w-1.5 rounded-full bg-amber-400"
                      title={`${day.unrecorded} interview${day.unrecorded > 1 ? "s" : ""} with no outcome recorded`}
                    />
                  )}
                </div>

                {day.interviews.slice(0, 2).map((iv) => (
                  <div
                    key={iv.id}
                    className="mt-0.5 truncate rounded bg-violet-500/20 px-1 text-[10px] leading-4 text-violet-100"
                  >
                    {iv.time} {iv.full_name.split(" ")[0]}
                  </div>
                ))}
                {day.interviews.length > 2 && (
                  <div className="mt-0.5 text-[10px] text-zinc-400">
                    +{day.interviews.length - 2} more
                  </div>
                )}

                {!has && !day.is_past && (
                  <div className="mt-0.5 text-[10px] text-zinc-500">
                    {day.open_slots > 0
                      ? `${day.open_slots} free${day.assumed ? "*" : ""}`
                      : day.is_today
                      ? "from tomorrow"
                      : "\u2014"}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="border-t border-white/8 bg-black/20 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-sm font-medium text-zinc-100">{longDate(selected.date)}</span>
            {selected.open_slots > 0 && !selected.is_past && (
              <span className={T_CAPTION}>
                {selected.open_slots} slots still free
                {selected.assumed ? " — standard back-office day, the roster does not reach here yet" : ""}
              </span>
            )}
            <button className={`${SMALL_BUTTON} ml-auto`} onClick={() => setOpenDay("")}>
              Close
            </button>
          </div>

          {selected.interviews.length === 0 ? (
            <p className={`${T_CAPTION} mt-2`}>
              {selected.is_past
                ? "No interviews that day."
                : selected.open_slots > 0
                ? "Nothing booked. Applicants with a link can still take one of these slots."
                : selected.is_today
                ? "The earliest an applicant can book is tomorrow, so today shows no slots."
                : "Nobody is rostered to interview that day, so no slots are offered."}
            </p>
          ) : (
            <>
            {/* Who is on at the same time, read across. The rows below carry
                everything a call needs -- number, CV, what they wrote -- but
                they are one long list, and the thing you cannot see in a list
                is that two interviews start at once and who is taking each.
                Ordered by the interviewer list, so the first column is the one
                who takes a slot first. */}
            <div className="mt-2 overflow-x-auto rounded-lg border border-white/8 bg-black/20 p-2">
              {/* Width follows the content, so the two columns sit next to each
                    other. Stretched to the full width the pair reads as two
                    separate lists rather than one time running across. */}
              <table className="w-auto border-separate border-spacing-y-0.5 text-sm">
                <tbody>
                  {(() => {
                    const rank = (n: string) => {
                      const i = data.interviewers.indexOf(n);
                      return i < 0 ? 99 : i;
                    };
                    const byTime = new Map<string, Interview[]>();
                    for (const iv of selected.interviews) {
                      const at = byTime.get(iv.time);
                      if (at) at.push(iv);
                      else byTime.set(iv.time, [iv]);
                    }
                    const rows = [...byTime.entries()]
                      .sort((a, b) => a[0].localeCompare(b[0]))
                      .map(([time, list]) => [
                        time,
                        [...list].sort((x, y) => rank(x.interviewer) - rank(y.interviewer)),
                      ] as const);
                    // Every row gets the same number of cells, so the columns
                    // line up and the times read straight down. Without the
                    // padding a row holding one interview stretches across the
                    // width and the eye loses the column.
                    const cols = Math.max(1, ...rows.map(([, list]) => list.length));
                    return rows.map(([time, list]) => (
                      <tr key={time} className="align-top">
                        {list.map((iv) => (
                          <td key={iv.id} className="whitespace-nowrap pr-6">
                            <span className="font-mono text-violet-200">{time}</span>
                            <span className="ml-3 font-medium text-zinc-300">
                              {(iv.interviewer || "—").split(" ")[0]}
                            </span>
                            <span className="ml-3 text-zinc-100">{iv.full_name}</span>
                          </td>
                        ))}
                        {Array.from({ length: cols - list.length }, (_, i) => (
                          <td key={`pad-${i}`} />
                        ))}
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>

            <div className="mt-2 flex flex-col gap-1.5">
              {selected.interviews.map((iv) => (
                <div
                  key={iv.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-white/8 px-3 py-2"
                >
                  <span className="font-mono text-sm text-violet-200">{iv.time}</span>
                  <span className="text-sm font-medium text-zinc-100">{iv.full_name}</span>
                  {iv.position_applied && <span className={T_CAPTION}>{iv.position_applied}</span>}
                  <span className={BADGE_INFO}>
                    <span className="inline-flex items-center gap-1">
                      {iv.contact_via && iv.contact_via !== "call"
                        ? <MonitorSmartphone className="h-3 w-3" />
                        : <Phone className="h-3 w-3" />}
                      {iv.reach_with}
                    </span>
                  </span>
                  {/* The number, on the row somebody is about to dial from.
                      tel: so a phone dials it and a desktop can still copy it. */}
                  {iv.phone && (
                    <a href={`tel:${iv.phone.replace(/[^\d+]/g, "")}`}
                       className="font-mono text-sm text-zinc-300 hover:text-violet-200">
                      {iv.phone}
                    </a>
                  )}
                  {iv.interviewer && <span className={T_CAPTION}>with {iv.interviewer}</span>}
                  {/* The CV opens straight from here. The recording lives on
                      the Voice screening tab and is one press away rather than
                      a hunt through a hundred and sixty rows. */}
                  {iv.screening_id && iv.resume_filename && (
                    <a
                      href={`/api/admin/hr/voice-screenings/${iv.screening_id}/resume`}
                      target="_blank" rel="noreferrer"
                      title={iv.resume_filename}
                      className="inline-flex items-center gap-1 rounded-md border border-violet-400/25 bg-violet-400/10 px-2 py-0.5 text-[11px] font-medium text-violet-200 hover:bg-violet-400/20"
                    >
                      <FileText className="h-3 w-3" />
                      CV
                      {iv.resume_bytes ? (
                        <span className="tabular-nums text-violet-300/60">
                          {fileSize(iv.resume_bytes)}
                        </span>
                      ) : null}
                    </a>
                  )}
                  {onOpenVoice && iv.screening_id && iv.voice_answers > 0 && (
                    <button
                      onClick={() => onOpenVoice(iv.screening_id as number)}
                      className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-zinc-300 hover:bg-white/10"
                    >
                      <Mic className="h-3 w-3" />
                      {iv.voice_answers} answers
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  )}
                  {iv.recorded ? (
                    <span className={BADGE_SUCCESS}>Recorded</span>
                  ) : selected.is_past ? (
                    <span className={BADGE_WARNING}>No outcome yet</span>
                  ) : null}
                  <button
                    className={`${SMALL_BUTTON} ml-auto`}
                    title="Puts it in your own phone or Google calendar, with a reminder 15 minutes before."
                    onClick={() => downloadIcs({
                      id: iv.id,
                      full_name: iv.full_name,
                      position_applied: iv.position_applied,
                      starts_at: iv.starts_at,
                      ends_at: iv.ends_at,
                      reach_with: iv.reach_with,
                      location: iv.location,
                      phone: iv.phone,
                      interviewer: iv.interviewer,
                    })}
                  >
                    <span className="flex items-center gap-1.5">
                      <CalendarPlus className="h-4 w-4" />
                      Add to my calendar
                    </span>
                  </button>
                  {/* The applicant hears nothing between booking and the call.
                      Nothing is sent from here -- the OS has no gateway -- so
                      this hands over the wording and somebody sends it, the same
                      shape as the booking link. */}
                  {!selected.is_past && !iv.recorded && (
                    <button
                      className={SMALL_BUTTON}
                      title="Writes the reminder for this applicant. Nothing is sent: copy it and send it from Viber or WhatsApp."
                      onClick={() => void openReminder(iv.id)}
                    >
                      <span className="flex items-center gap-1.5">
                        <MessageSquare className="h-4 w-4" />
                        {remindFor === iv.id ? "Close" : "Reminder"}
                      </span>
                    </button>
                  )}

                  {/* 結果はここで書ける。別のタブに送ると、送られた先で
                      書かれないまま日をまたぐ。移動と取り消しだけが向こう。 */}
                  {/* 記録済みの行にも出す。押すと入っている評価が見える。
                      隠していたので「何が入っているか」を確かめる手段が
                      画面に無く、過去分を埋める作業では二重入力になる。 */}
                  {!justRecorded[iv.id] && (
                    <OutcomeRecorder
                      scheduleId={iv.id}
                      open={outcomeFor === iv.id}
                      onToggle={() => setOutcomeFor(outcomeFor === iv.id ? "" : iv.id)}
                      onRecorded={(label) => {
                        setJustRecorded((p) => ({ ...p, [iv.id]: label }));
                        setOutcomeFor("");
                        void load();
                      }}
                    />
                  )}
                  {justRecorded[iv.id] && (
                    <span className={BADGE_SUCCESS}>
                      Recorded — {justRecorded[iv.id]}
                    </span>
                  )}
                  {onOpenInterview && !selected.is_past && !iv.recorded && (
                    <button
                      className={SMALL_BUTTON}
                      onClick={() => onOpenInterview(iv.id)}
                    >
                      <span className="flex items-center gap-1.5">
                        Move or cancel
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </button>
                  )}

                  {/* What they typed on the form. The interviewer is about to
                      ask about exactly this, and the alternative is opening
                      another screen while the call connects. Employer, position
                      and how long are in their own spelling -- a transcript
                      turned one employer into "Donuts" when it was McDonald's. */}
                  {remindFor === iv.id && (
                    <div className="basis-full rounded-xl border border-violet-400/25 bg-violet-500/5 p-3">
                      {remindBusy && <p className={T_CAPTION}>Writing it…</p>}
                      {remindErr && (
                        <p className="text-sm text-amber-200">{remindErr}</p>
                      )}
                      {remindMsg && (
                        <>
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            {(["en", "tl"] as const).map((l) => (
                              <button
                                key={l}
                                className={l === remindLang
                                  ? `${SMALL_BUTTON} border-violet-400/60 bg-violet-500/20 text-violet-100`
                                  : SMALL_BUTTON}
                                onClick={() => { setRemindLang(l); setCopied(false); }}
                              >
                                {l === "en" ? "English" : "Tagalog"}
                              </button>
                            ))}
                            <span className={`${T_CAPTION} ml-auto`}>
                              {iv.reach_with}
                              {iv.phone ? ` · ${iv.phone}` : ""}
                            </span>
                          </div>
                          <p className="whitespace-pre-wrap rounded-lg border border-white/10 bg-black/30 p-2 font-mono text-[13px] leading-relaxed text-zinc-200">
                            {remindMsg[remindLang]}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                              className={PRIMARY_BUTTON}
                              onClick={() => {
                                const text = remindMsg[remindLang];
                                void navigator.clipboard.writeText(text)
                                  .then(() => setCopied(true))
                                  .catch(() => {
                                    // Clipboard refused (an insecure context, or
                                    // permission denied). Select it instead of
                                    // saying nothing: a button that reports
                                    // success it did not have is worse.
                                    setRemindErr("Could not copy. Select the text above and copy it by hand.");
                                  });
                              }}
                            >
                              <span className="flex items-center gap-1.5">
                                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                {copied ? "Copied" : "Copy message"}
                              </span>
                            </button>
                            {/* Texting is offered only when the gateway says it
                                can send. The wording that goes out is the short
                                one built for SMS -- what is on screen is three
                                segments, and sending that would cost three
                                credits a person. */}
                            {smsGate?.enabled && iv.phone && (
                              <button
                                className={smsSentTo ? SMALL_BUTTON : PRIMARY_BUTTON}
                                disabled={smsBusy}
                                onClick={() => void sendReminderSms(iv.id)}
                              >
                                <span className="flex items-center gap-1.5">
                                  <Send className="h-4 w-4" />
                                  {smsBusy ? "Sending…"
                                    : smsSentTo ? "Send it again"
                                    : `Send by SMS to ${iv.phone}`}
                                </span>
                              </button>
                            )}
                            {!smsSentTo && !smsFail && (
                              <span className={T_CAPTION}>
                                Nothing has been sent yet. Paste it into{" "}
                                {iv.contact_via === "whatsapp" ? "WhatsApp"
                                  : iv.contact_via === "viber" ? "Viber" : "the chat"}
                                {" "}yourself, or text it with the button.
                              </span>
                            )}
                          </div>
                          {smsSentTo && (
                            <div className="mt-2 rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-3 py-2">
                              <p className="text-sm font-semibold text-emerald-200">
                                Text sent to {smsSentTo}
                              </p>
                              <p className="mt-0.5 text-xs text-emerald-200/70">
                                One message, sent as SUSHIZEN. Pressing again sends
                                a second one and costs another credit. The wording
                                texted is the short version — what is above is what
                                you would paste into {iv.contact_via === "whatsapp"
                                  ? "WhatsApp" : iv.contact_via === "viber" ? "Viber" : "chat"}.
                              </p>
                            </div>
                          )}
                          {smsFail && (
                            <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-2">
                              <p className="text-sm font-semibold text-amber-200">Not sent — {smsFail}</p>
                              <p className="mt-0.5 text-xs text-amber-200/70">
                                Nothing went out. Copy the message and send it yourself.
                              </p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {(iv.last_employer || iv.last_position || iv.home_area
                    || iv.experience_level || iv.available_from) && (
                    <p className={`${T_CAPTION} basis-full`}>
                      {[
                        [iv.last_employer, iv.last_position].filter(Boolean).join(" · "),
                        iv.last_duration && `for ${iv.last_duration}`,
                        EXPERIENCE_LABEL[iv.experience_level] || iv.experience_level,
                        iv.home_area && `lives in ${iv.home_area}`,
                        iv.available_from && `can start ${iv.available_from}`,
                      ].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
