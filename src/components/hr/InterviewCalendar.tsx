"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, CalendarPlus, RefreshCw, Phone, MonitorSmartphone } from "lucide-react";
import {
  GLASS_CARD, SMALL_BUTTON, BADGE_INFO, BADGE_SUCCESS, BADGE_WARNING,
  T_CAPTION, T_LABEL, T_SECTION,
} from "@/lib/ui-tokens";
import { downloadIcs } from "@/lib/interview-ics";

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

export default function InterviewCalendar() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [openDay, setOpenDay] = useState<string>("");

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
                  {iv.interviewer && <span className={T_CAPTION}>with {iv.interviewer}</span>}
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
                      interviewer: iv.interviewer,
                    })}
                  >
                    <span className="flex items-center gap-1.5">
                      <CalendarPlus className="h-4 w-4" />
                      Add to my calendar
                    </span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
