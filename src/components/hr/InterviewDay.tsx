"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, CalendarPlus, Phone, MonitorSmartphone, Check, PauseCircle, X, UserX, CalendarSync, Trash2, FileText } from "lucide-react";
import {
  GLASS_CARD, PRIMARY_BUTTON, SMALL_BUTTON, BADGE_INFO, BADGE_SUCCESS,
  BADGE_WARNING, DANGER_BUTTON, T_CAPTION, T_LABEL, T_SECTION,
} from "@/lib/ui-tokens";
import { downloadIcs } from "@/lib/interview-ics";
import { reasonsFor } from "@/lib/hr-outcome";

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
  /** The CV, when the applicant sent one. Only the pointer is here — the file
   *  is fetched by the link when it is pressed, never with the list. */
  screening_id?: string | null;
  resume_filename?: string | null;
  resume_bytes?: number;
  has_resume?: boolean;
  attended: boolean | null;
  recorded: boolean;
  /** Set locally after HR cancels, so the row stays visible saying what happened. */
  cancelled?: boolean;
};

type FreeSlot = {
  starts_at: string;
  interviewer: string;
  branch: string;
  assumed: boolean;
};

const MNL = "Asia/Manila";
const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { timeZone: MNL, hour: "2-digit", minute: "2-digit" });
const dayOf = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { timeZone: MNL, weekday: "long", day: "numeric", month: "long" });

/** Free slots grouped by day, in the order the server returned them. */
function groupByDay(slots: FreeSlot[]): [string, FreeSlot[]][] {
  const out: [string, FreeSlot[]][] = [];
  for (const s of slots) {
    const d = dayOf(s.starts_at);
    const last = out[out.length - 1];
    if (last && last[0] === d) last[1].push(s);
    else out.push([d, [s]]);
  }
  return out;
}

/** Written the way the interviewer will act, not the way it is stored. */
// `no_show` is turned into a lapse by the server, which supplies its own
// reason — so only hold and pass have to ask for one here.
const OUTCOMES = [
  { key: "proceed", label: "Move to offer", icon: Check, needsReason: false },
  { key: "hold", label: "Hold — decide later", icon: PauseCircle, needsReason: true },
  { key: "pass", label: "Not for this role", icon: X, needsReason: true },
  { key: "no_show", label: "Did not turn up", icon: UserX, needsReason: false },
] as const;

type OutcomeReason = { key: string; label: string };


/** One interview.
 *
 *  Module scope on purpose. This was declared inside InterviewDay, which makes
 *  it a NEW component type on every render of the parent — so each keystroke in
 *  the note box re-rendered the parent, React unmounted the whole row and built
 *  it again, and the textarea lost focus after one character. Pressing space
 *  then scrolled the page, because nothing had focus. Reported twice from
 *  Manila as "you cannot type; space jumps out of the box" (2026-09-16).
 *
 *  A re-render is fine and keeps the caret. A remount is what breaks it, and a
 *  component declared in a render body remounts every time.
 */
function Line({
  row, openId, setOpenId, moveId, openMove, note, setNote, saving, record,
  pending, setPending, outcomeErr, setOutcomeErr, reasons, done,
  freeSlots, slotsErr, moving, doMove, doCancel, reason, setReason,
}: {
  row: Row;
  openId: string;
  setOpenId: (v: string) => void;
  moveId: string;
  openMove: (row: Row) => void;
  note: string;
  setNote: (v: string) => void;
  saving: boolean;
  record: (row: Row, outcome: string, reasonKey?: string) => void;
  pending: string;
  setPending: (v: string) => void;
  outcomeErr: string;
  setOutcomeErr: (v: string) => void;
  reasons: OutcomeReason[];
  done: Record<string, string>;
  freeSlots: FreeSlot[] | null;
  slotsErr: string;
  moving: boolean;
  doMove: (row: Row, slot: FreeSlot) => void;
  doCancel: (row: Row) => void;
  reason: string;
  setReason: (v: string) => void;
}) {
    const byPhone = !row.contact_via || row.contact_via === "call";
    return (
      <div id={`iv-${row.id}`} className={`${GLASS_CARD} overflow-hidden`}>
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
            {row.reach_with}
          </span>
          <span className="font-mono text-sm text-zinc-300">{row.phone}</span>
          {row.interviewer_staff && (
            <span className={T_CAPTION}>with {row.interviewer_staff}</span>
          )}
          {/* The CV belongs on the screen the interviewer opens before the
              call. It used to live only on the Calendar day panel, so today's
              list showed nothing and looked out of date. */}
          {row.has_resume && row.screening_id && (
            <a
              href={`/api/admin/hr/voice-screenings/${row.screening_id}/resume`}
              target="_blank"
              rel="noreferrer"
              title={row.resume_filename || "CV"}
              className="inline-flex items-center gap-1 rounded-md border border-violet-400/25 bg-violet-400/10 px-2 py-0.5 text-[11px] font-medium text-violet-200 hover:bg-violet-400/20"
            >
              <FileText className="h-3 w-3" />
              CV
              {row.resume_bytes ? (
                <span className="tabular-nums text-violet-300/60">
                  {Math.max(1, Math.round(row.resume_bytes / 1024))}KB
                </span>
              ) : null}
            </a>
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
          ) : row.cancelled ? (
            <span className={BADGE_WARNING}>Cancelled</span>
          ) : (
            <>
              <button
                className={SMALL_BUTTON}
                onClick={() => {
                  setOpenId(openId === row.id ? "" : row.id);
                  setNote(""); setPending(""); setOutcomeErr("");
                }}
              >
                {openId === row.id ? "Close" : "How did it go?"}
              </button>
              {/* Somebody rings to say they cannot make it. Before this there was
                  nothing to press: the applicant could cancel their own slot,
                  HR could not. */}
              <button className={SMALL_BUTTON} onClick={() => openMove(row)}>
                <span className="flex items-center gap-1.5">
                  <CalendarSync className="h-4 w-4" />
                  {moveId === row.id ? "Close" : "Move or cancel"}
                </span>
              </button>
            </>
          )}
        </div>

        {row.voice_summary && (
          <p className={`${T_CAPTION} border-t border-white/8 px-4 py-2`}>
            From the voice screening: {row.voice_summary}
          </p>
        )}

        {done[row.applicant_id] && (
          <p className="border-t border-white/8 bg-emerald-500/8 px-4 py-2 text-sm text-emerald-200">
            {done[row.applicant_id]}
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
                  className={
                    pending === o.key
                      ? `${SMALL_BUTTON} border-violet-400/60 bg-violet-500/20 text-violet-100`
                      : o.key === "proceed" ? PRIMARY_BUTTON : SMALL_BUTTON
                  }
                  disabled={saving}
                  onClick={() => {
                    setOutcomeErr("");
                    // Two of these need a reason before the server will take
                    // them. Ask here rather than let the save be refused.
                    if (o.needsReason) { setPending(pending === o.key ? "" : o.key); return; }
                    setPending("");
                    void record(row, o.key);
                  }}
                >
                  <o.icon className="mr-1.5 inline h-4 w-4" />
                  {o.label}
                </button>
              ))}
            </div>

            {pending && (
              <div className="mt-3 rounded-lg border border-violet-400/25 bg-violet-500/5 p-3">
                <p className={`${T_LABEL} mb-2`}>
                  Why? — {OUTCOMES.find((o) => o.key === pending)?.label}
                </p>
                {reasons.length === 0 ? (
                  <p className={T_CAPTION}>
                    The reasons did not load. Press Refresh above and try again —
                    this one cannot be saved without one.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {reasonsFor(reasons, pending).map((r) => (
                      <button
                        key={r.key}
                        className={SMALL_BUTTON}
                        disabled={saving}
                        onClick={() => void record(row, pending, r.key)}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                )}
                <p className={`${T_CAPTION} mt-2`}>
                  One tap saves it. This is the question that gets asked weeks
                  later, which is why it is not optional.
                </p>
              </div>
            )}

            {outcomeErr && (
              <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-sm text-amber-200">
                {outcomeErr}
              </p>
            )}

            <p className={`${T_CAPTION} mt-2`}>
              We do not ask who you are or what time it is — you are signed in and
              the booking already says both. &quot;Did not turn up&quot; is filed as a
              lapse, never as a rejection.
            </p>
          </div>
        )}

        {moveId === row.id && !row.recorded && !row.cancelled && (
          <div className="border-t border-white/8 bg-white/[0.03] px-4 py-3">
            <p className={`${T_LABEL} mb-1`}>Move it — pick a new time</p>
            <p className={`${T_CAPTION} mb-2`}>
              {row.interviewer_staff || "The interviewer"} is told either way. Pick a
              time with somebody else and the person losing the slot is told too, so
              nobody keeps a candidate who is not coming.
            </p>
            {slotsErr && (
              <p className="mb-2 text-sm text-amber-200">{slotsErr}</p>
            )}
            {freeSlots === null && !slotsErr && (
              <p className={T_CAPTION}>Loading the open times…</p>
            )}
            {freeSlots !== null && freeSlots.length === 0 && (
              <p className={T_CAPTION}>
                No open times in the next three weeks. Publish the roster further
                out, or cancel below and send a new link when it is up.
              </p>
            )}
            {freeSlots !== null && freeSlots.length > 0 && (
              <div className="max-h-64 overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-2">
                {groupByDay(freeSlots).map(([day, times]) => (
                  <div key={day} className="mb-2 last:mb-0">
                    <p className={`${T_CAPTION} mb-1`}>{day}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {times.map((sl) => (
                        <button
                          key={`${sl.starts_at}-${sl.interviewer}`}
                          disabled={moving}
                          onClick={() => void doMove(row, sl)}
                          title={`${sl.interviewer} · ${sl.branch === "CUB" ? "Cubao" : sl.branch}`
                            + (sl.assumed ? " · roster not published this far yet" : "")}
                          className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm tabular-nums text-zinc-200 hover:bg-violet-500/20 disabled:opacity-50"
                        >
                          {timeOf(sl.starts_at)}
                          <span className="ml-1.5 text-[11px] text-zinc-400">
                            {sl.interviewer.split(" ")[0]}{sl.assumed ? "*" : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className={`${T_LABEL} mb-1 mt-4`}>Or cancel it</p>
            <p className={`${T_CAPTION} mb-2`}>
              {row.full_name} goes back to <span className="text-zinc-300">Screened</span> and
              reappears in <span className="text-zinc-300">Waiting for a booking link</span> above.
              Their link is <strong>not</strong> cancelled, so they can still pick another time
              themselves. <strong>This cannot be undone</strong> — if it was a mistake, use a time
              above instead, or book them again from their link.
            </p>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why, in a few words. Goes to the interviewer. Optional."
              className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-200"
            />
            <button
              className={`${DANGER_BUTTON} mt-2 text-sm`}
              disabled={moving}
              onClick={() => void doCancel(row)}
            >
              <span className="flex items-center gap-1.5">
                <Trash2 className="h-4 w-4" />
                Cancel this interview
              </span>
            </button>
          </div>
        )}
      </div>
    );
}

export default function InterviewDay({ focusId = "", onFocusHandled }: {
  /** Interview to open straight away — set when arriving from the calendar. */
  focusId?: string;
  onFocusHandled?: () => void;
} = {}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [mine, setMine] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [openId, setOpenId] = useState<string>("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  /** Outcome chosen but not saved yet, because it still needs a reason. */
  const [pending, setPending] = useState<string>("");
  /** Kept apart from `err`: a failed save and a failed list load shared one
   *  banner, so refreshing wiped the refusal that explained the last press. */
  const [outcomeErr, setOutcomeErr] = useState("");
  const [reasons, setReasons] = useState<OutcomeReason[]>([]);
  // ⚠️ 鍵は **applicant_id**。日程変更は新しい枠を作るので、枠のIDで持つと
  //    再取得のあとに行のIDが変わり、「動かしました」が画面に出ない
  //    （実機で押して発覚。保存は成功しているのに何も言わない画面になる）。
  const [done, setDone] = useState<Record<string, string>>({});
  // 動かす・取り消す。**応募者は自分で取り消せるのに HR は取り消せなかった。**
  const [moveId, setMoveId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [freeSlots, setFreeSlots] = useState<FreeSlot[] | null>(null);
  const [slotsErr, setSlotsErr] = useState("");
  const [moving, setMoving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      // 30日。応募者は14日先まで自分で取れるので、7日で切ると
      // **8〜14日先に入った予約がこのタブのどこにも出ない。**
      const res = await fetch(`/api/admin/hr/interviews/upcoming?days=30&mine=${mine ? 1 : 0}`,
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

  // The same list the board's outcome dialog uses. Asking for a reason without
  // offering the reasons would just move the dead end one step later.
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/hr/interview-outcome-reasons", { cache: "no-store" });
        if (res.ok) setReasons(((await res.json())?.reasons ?? []) as OutcomeReason[]);
      } catch { /* the panel says so when the list is empty */ }
    })();
  }, []);

  // カレンダーで選んだ面接を開いた状態で見せる。**そこへ着いたのに探させない。**
  useEffect(() => {
    if (!focusId || loading) return;
    if (!rows.some((r) => r.id === focusId)) return;
    setMoveId(focusId);
    if (freeSlots === null) void loadSlots();
    const el = document.getElementById(`iv-${focusId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    onFocusHandled?.();
    // freeSlots/loadSlots は初回だけ見れば足りる。依存に入れると開き直すたびに走る。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, loading, rows]);

  // 空き枠は開いたときに1回だけ取る。行ごとに取ると、開き直すたびに
  // 同じ問い合わせが走る。
  const loadSlots = useCallback(async () => {
    setSlotsErr("");
    try {
      const res = await fetch("/api/admin/hr/interviews/open-slots?days=21&limit=60",
        { cache: "no-store" });
      if (!res.ok) { setSlotsErr("Could not load the open times."); return; }
      const j = await res.json();
      setFreeSlots(j.rows || []);
    } catch {
      setSlotsErr("Could not load the open times.");
    }
  }, []);

  function openMove(row: Row) {
    const next = moveId === row.id ? "" : row.id;
    setMoveId(next);
    setOpenId("");
    setReason("");
    setErr("");
    if (next && freeSlots === null) void loadSlots();
  }

  async function doCancel(row: Row) {
    if (moving) return;
    setMoving(true);
    setErr("");
    try {
      const res = await fetch(`/api/admin/hr/interviews/${row.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const text = await res.text();
      if (!res.ok) {
        let msg = text;
        try { msg = JSON.parse(text)?.detail || text; } catch { /* text/plain */ }
        setErr(String(msg).slice(0, 240));
        return;
      }
      // 行は消さずに、消えた事実をその場に残す。消すと「取り消せたのか」を
      // 確かめる場所が画面から消える（教訓56）。
      setDone((p) => ({
        ...p,
        [row.applicant_id]: `Cancelled. ${row.full_name} is back in “Waiting for a booking link” above — `
          + "their link still works, so they can take another time themselves.",
      }));
      setRows((p) => p.map((r) => (r.id === row.id ? { ...r, cancelled: true } : r)));
      setMoveId("");
      setReason("");
      void loadSlots();
    } catch {
      setErr("Could not cancel. Nothing changed — try again.");
    } finally {
      setMoving(false);
    }
  }

  async function doMove(row: Row, slot: FreeSlot) {
    if (moving) return;
    setMoving(true);
    setErr("");
    try {
      const res = await fetch(`/api/admin/hr/interviews/${row.id}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ starts_at: slot.starts_at, interviewer: slot.interviewer }),
      });
      const text = await res.text();
      if (!res.ok) {
        let msg = text;
        try { msg = JSON.parse(text)?.detail || text; } catch { /* text/plain */ }
        setErr(String(msg).slice(0, 240));
        return;
      }
      setDone((p) => ({
        ...p,
        [row.applicant_id]: `Moved to ${dayOf(slot.starts_at)} at ${timeOf(slot.starts_at)} `
          + `with ${slot.interviewer}. They have been told.`,
      }));
      setMoveId("");
      await load();
      void loadSlots();
    } catch {
      setErr("Could not move it. Nothing changed — try again.");
    } finally {
      setMoving(false);
    }
  }

  async function record(row: Row, outcome: string, reasonKey = "") {
    if (saving) return;
    setSaving(true);
    setErr("");
    setOutcomeErr("");
    try {
      const res = await fetch(`/api/admin/hr/interviews/${row.id}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `reason` was never sent. The server requires one for hold and pass,
        // so both came back 400 every time, and the refusal was drawn in a
        // banner at the top of a very long page where nobody saw it: from the
        // desk it looked like the button did nothing.
        body: JSON.stringify({ outcome, reason: reasonKey, notes: note.trim() }),
      });
      const text = await res.text();
      if (!res.ok) {
        // A save that failed must not look like one that worked.
        let msg = text;
        try { msg = JSON.parse(text)?.detail || text; } catch { /* text/plain */ }
        // Next to the buttons, not at the top of the page.
        setOutcomeErr(String(msg).slice(0, 240));
        return;
      }
      const label = OUTCOMES.find((o) => o.key === outcome)?.label || outcome;
      setDone((p) => ({ ...p, [row.applicant_id]: `Recorded — ${label}` }));
      setRows((p) => p.map((r) => (r.id === row.id ? { ...r, recorded: true } : r)));
      setOpenId("");
      setNote("");
      setPending("");
      setOutcomeErr("");
    } catch {
      setOutcomeErr("Could not save. Nothing was recorded — try again.");
    } finally {
      setSaving(false);
    }
  }

  const today = rows.filter((r) => r.is_today);
  const weekEnd = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const week = rows.filter((r) => !r.is_today && r.day <= weekEnd);
  const later = rows.filter((r) => !r.is_today && r.day > weekEnd);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className={T_SECTION}>
          <CalendarClock className="mr-1.5 inline h-4 w-4" />
          Interviews — everything booked from today
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
          {today.map((r) => <Line key={r.id} row={r}
              openId={openId} setOpenId={setOpenId}
              moveId={moveId} openMove={openMove}
              note={note} setNote={setNote}
              saving={saving} record={(rw, o, rk) => void record(rw, o, rk)}
              pending={pending} setPending={setPending}
              outcomeErr={outcomeErr} setOutcomeErr={setOutcomeErr}
              reasons={reasons} done={done}
              freeSlots={freeSlots} slotsErr={slotsErr} moving={moving}
              doMove={(rw, sl) => void doMove(rw, sl)}
              doCancel={(rw) => void doCancel(rw)}
              reason={reason} setReason={setReason} />)}
        </div>
      )}
      {week.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className={T_LABEL}>Coming up — next 7 days</p>
          {week.map((r) => (
            <div key={r.id}>
              <p className={`${T_CAPTION} mb-1 mt-2`}>{dayOf(r.starts_at)}</p>
              <Line row={r}
              openId={openId} setOpenId={setOpenId}
              moveId={moveId} openMove={openMove}
              note={note} setNote={setNote}
              saving={saving} record={(rw, o, rk) => void record(rw, o, rk)}
              pending={pending} setPending={setPending}
              outcomeErr={outcomeErr} setOutcomeErr={setOutcomeErr}
              reasons={reasons} done={done}
              freeSlots={freeSlots} slotsErr={slotsErr} moving={moving}
              doMove={(rw, sl) => void doMove(rw, sl)}
              doCancel={(rw) => void doCancel(rw)}
              reason={reason} setReason={setReason} />
            </div>
          ))}
        </div>
      )}
      {later.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className={T_LABEL}>Later this month</p>
          {later.map((r) => (
            <div key={r.id}>
              <p className={`${T_CAPTION} mb-1 mt-2`}>{dayOf(r.starts_at)}</p>
              <Line row={r}
              openId={openId} setOpenId={setOpenId}
              moveId={moveId} openMove={openMove}
              note={note} setNote={setNote}
              saving={saving} record={(rw, o, rk) => void record(rw, o, rk)}
              pending={pending} setPending={setPending}
              outcomeErr={outcomeErr} setOutcomeErr={setOutcomeErr}
              reasons={reasons} done={done}
              freeSlots={freeSlots} slotsErr={slotsErr} moving={moving}
              doMove={(rw, sl) => void doMove(rw, sl)}
              doCancel={(rw) => void doCancel(rw)}
              reason={reason} setReason={setReason} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
