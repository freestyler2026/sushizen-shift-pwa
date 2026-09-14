"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, CalendarPlus, Phone, MonitorSmartphone, Check, PauseCircle, X, UserX } from "lucide-react";
import {
  GLASS_CARD, PRIMARY_BUTTON, SMALL_BUTTON, BADGE_INFO, BADGE_SUCCESS,
  BADGE_WARNING, T_CAPTION, T_LABEL, T_SECTION,
} from "@/lib/ui-tokens";
import { downloadIcs } from "@/lib/interview-ics";

/**
 * What the interviewer opens on the day.
 *
 * Before this there was nowhere that answered "who is next and how do I reach
 * them". Recruitment carried 63 interview evaluations against 4 schedules, and
 * every one of those 63 had a NULL schedule_id -- nobody could say which
 * booking an evaluation belonged to.
 *
 * One line per interview carries everything the call needs, because sending
 * somebody to another screen for the phone number is how the recording stops
 * happening. Deciding is recording: one button writes the evaluation, moves
 * the applicant, and marks whether they turned up.
 *
 * "Did not turn up" is not a judgement of the person, so it files as a lapse
 * and never as a rejection. It is also the first time this system can count
 * no-shows at all.
 */

type Row = {
  id: string;
  applicant_id: string;
  full_name: string;
  phone: string;
  position_applied: string | null;
  position_group: string | null;
  experience_level: string | null;
  starts_at: string;
  ends_at: string | null;
  day: string;
  is_today: boolean;
  interviewer_staff: string;
  contact_via: string | null;
  reach_with: string;
  location?: string | null;
  voice_decision: string | null;
  voice_summary: string | null;
  attended: boolean | null;
  recorded: boolean;
};

const MNL = "Asia/Manila";
const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { timeZone: MNL, hour: "2-digit", minute: "2-digit" });
const dayOf = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { timeZone: MNL, weekday: "long", day: "numeric", month: "long" });

/** Written the way the interviewer will act, not the way it is stored. */
const OUTCOMES = [
  { key: "proceed", label: "Move to offer", icon: Check },
  { key: "hold", label: "Hold — decide later", icon: PauseCircle },
  { key: "pass", label: "Not for this role", icon: X },
  { key: "no_show", label: "Did not turn up", icon: UserX },
] as const;

export default function InterviewDay() {
  const [rows, setRows] = useState<Row[]>([]);
  const [mine, setMine] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [openId, setOpenId] = useState<string>("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`/api/admin/hr/interviews/upcoming?days=7&mine=${mine ? 1 : 0}`,
        { cache: "no-store" });
      if (!res.ok) { setErr("Could not load the interviews."); return; }
      const j = await res.json();
      setRows(j.rows || []);
    } catch {
      setErr("Could not load the interviews.");
    } finally {
      setLoading(false);
    }
  }, [mine]);

  useEffect(() => { void load(); }, [load]);

  async function record(row: Row, outcome: string) {
    if (saving) return;
    setSaving(true);
    setErr("");
    try {
      const res = await fetch(`/api/admin/hr/interviews/${row.id}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome, notes: note.trim() }),
      });
      const text = await res.text();
      if (!res.ok) {
        // A save that failed must not look like one that worked.
        let msg = text;
        try { msg = JSON.parse(text)?.detail || text; } catch { /* text/plain */ }
        setErr(String(msg).slice(0, 240));
        return;
      }
      const label = OUTCOMES.find((o) => o.key === outcome)?.label || outcome;
      setDone((p) => ({ ...p, [row.id]: `Recorded — ${label}` }));
      setRows((p) => p.map((r) => (r.id === row.id ? { ...r, recorded: true } : r)));
      setOpenId("");
      setNote("");
    } catch {
      setErr("Could not save. Nothing was recorded — try again.");
    } finally {
      setSaving(false);
    }
  }

  const today = rows.filter((r) => r.is_today);
  const later = rows.filter((r) => !r.is_today);

  const Line = ({ row }: { row: Row }) => {
    const byPhone = !row.contact_via || row.contact_via === "call";
    return (
      <div className={`${GLASS_CARD} overflow-hidden`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
          <span className="text-lg font-bold tabular-nums text-violet-200">
            {timeOf(row.starts_at)}
          </span>
          <span className="font-semibold text-white">{row.full_name}</span>
          <span className={T_CAPTION}>
            {row.position_group || row.position_applied || "—"}
            {row.experience_level ? ` · ${row.experience_level}` : ""}
          </span>
          {/* The one thing the interviewer has to decide before dialling. */}
          <span className={byPhone ? BADGE_WARNING : BADGE_INFO}>
            {byPhone ? <Phone className="mr-1 inline h-3 w-3" />
                     : <MonitorSmartphone className="mr-1 inline h-3 w-3" />}
            {byPhone ? "Office phone" : `${row.contact_via} on the PC`}
          </span>
          <span className="font-mono text-sm text-zinc-300">{row.phone}</span>
          {row.interviewer_staff && (
            <span className={T_CAPTION}>with {row.interviewer_staff}</span>
          )}
          <button
            className={`${SMALL_BUTTON} ml-auto`}
            title="Puts it in your own phone or Google calendar, with a reminder 15 minutes before."
            onClick={() => downloadIcs({ ...row, interviewer: row.interviewer_staff })}
          >
            <span className="flex items-center gap-1.5">
              <CalendarPlus className="h-4 w-4" />
              Add to my calendar
            </span>
          </button>
          {row.recorded ? (
            <span className={BADGE_SUCCESS}>Recorded</span>
          ) : (
            <button
              className={SMALL_BUTTON}
              onClick={() => { setOpenId(openId === row.id ? "" : row.id); setNote(""); }}
            >
              {openId === row.id ? "Close" : "How did it go?"}
            </button>
          )}
        </div>

        {row.voice_summary && (
          <p className={`${T_CAPTION} border-t border-white/8 px-4 py-2`}>
            From the voice screening: {row.voice_summary}
          </p>
        )}

        {done[row.id] && (
          <p className="border-t border-white/8 bg-emerald-500/8 px-4 py-2 text-sm text-emerald-200">
            {done[row.id]}
          </p>
        )}

        {openId === row.id && !row.recorded && (
          <div className="border-t border-white/8 bg-white/[0.03] px-4 py-3">
            <p className={`${T_LABEL} mb-2`}>How did it go?</p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="One line is enough. Optional."
              className="w-full rounded-lg border border-white/10 bg-black/30 p-2 text-sm text-zinc-200"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {OUTCOMES.map((o) => (
                <button
                  key={o.key}
                  className={o.key === "proceed" ? PRIMARY_BUTTON : SMALL_BUTTON}
                  disabled={saving}
                  onClick={() => void record(row, o.key)}
                >
                  <o.icon className="mr-1.5 inline h-4 w-4" />
                  {o.label}
                </button>
              ))}
            </div>
            <p className={`${T_CAPTION} mt-2`}>
              We do not ask who you are or what time it is — you are signed in and
              the booking already says both. &quot;Did not turn up&quot; is filed as a
              lapse, never as a rejection.
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className={T_SECTION}>
          <CalendarClock className="mr-1.5 inline h-4 w-4" />
          Interviews — today and the next 7 days
        </p>
        <button className={SMALL_BUTTON} onClick={() => setMine((m) => !m)}>
          {mine ? "Showing mine" : "Showing everyone"}
        </button>
        <button className={SMALL_BUTTON} onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      </div>

      {err && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          {err}
        </p>
      )}

      {!loading && rows.length === 0 && (
        <p className={T_CAPTION}>
          Nothing booked yet. Applicants book their own time from the link that
          Shortlist hands you on the Voice screening tab.
        </p>
      )}

      {today.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className={T_LABEL}>Today</p>
          {today.map((r) => <Line key={r.id} row={r} />)}
        </div>
      )}
      {later.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className={T_LABEL}>Coming up</p>
          {later.map((r) => (
            <div key={r.id}>
              <p className={`${T_CAPTION} mb-1 mt-2`}>{dayOf(r.starts_at)}</p>
              <Line row={r} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
