"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, CalendarPlus, Phone, MonitorSmartphone, CalendarSync, Trash2, FileText } from "lucide-react";
import {
  GLASS_CARD, SMALL_BUTTON, BADGE_INFO, BADGE_SUCCESS,
  BADGE_WARNING, DANGER_BUTTON, T_CAPTION, T_LABEL, T_SECTION,
} from "@/lib/ui-tokens";
import { downloadIcs } from "@/lib/interview-ics";
import OutcomeRecorder from "@/components/hr/OutcomeRecorder";

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
 * "Did not turn up" closes the applicant as rejected, the same as any other
 * close -- but it is filed as a lapse with the reason no_show, so it is never
 * counted as a verdict on the person, and the row carries that reason wherever
 * the applicant is shown. It is also the first time this system can count
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
  /** What was recorded, not just that something was. 'hire' and 'consider'
   *  keep the person in the running; 'no_hire' and 'not_assessed' close them.
   *  Empty when nothing has been recorded yet. */
  recommendation?: string;
  /** Set locally after HR cancels, so the row stays visible saying what happened. */
  cancelled?: boolean;
  /** Only on the outstanding list: how long this has waited for a result. */
  days_late?: number;
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
// The outcome panel lives in OutcomeRecorder. It used to be copied here as
// well, which is the shape the file's own header warns about: the copy in the
// calendar and the copy here drifted, and only one of them learned to send a
// reason. One component, both screens — and it is the component that knows how
// to read back what is already recorded.


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
  row, openId, setOpenId, moveId, openMove, onRecorded, done,
  freeSlots, slotsErr, moving, doMove, doCancel, reason, setReason,
}: {
  row: Row;
  openId: string;
  setOpenId: (v: string) => void;
  moveId: string;
  openMove: (row: Row) => void;
  onRecorded: (row: Row, label: string) => void;
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
    // Still in the running. A grey "Recorded" badge said the same thing about
    // the person we are hiring and the person we turned down, so the one
    // screen that shows the day's interviews could not show who is left.
    const keep = row.recommendation === "hire" || row.recommendation === "consider";
    const keepLabel = row.recommendation === "hire" ? "Move to offer" : "Hold — decide later";
    return (
      <div
        id={`iv-${row.id}`}
        className={`${GLASS_CARD} overflow-hidden ${
          keep
            ? row.recommendation === "hire"
              ? "border-emerald-500/50 bg-emerald-500/5"
              : "border-amber-500/50 bg-amber-500/5"
            : ""
        }`}
      >
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
          {row.recorded && (
            keep ? (
              <span
                className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                  row.recommendation === "hire"
                    ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                    : "border-amber-500/50 bg-amber-500/15 text-amber-300"
                }`}
              >
                {keepLabel}
              </span>
            ) : (
              <span className={BADGE_SUCCESS}>Recorded</span>
            )
          )}
          {row.cancelled && <span className={BADGE_WARNING}>Cancelled</span>}
          {!row.cancelled && (
            <>
              {/* 記録済みでも出す。押すと入っている評価が見える。
                  隠している間、何が入っているかを確かめる手段が画面に無く、
                  過去分を埋める作業がそのまま二重入力になる。 */}
              <OutcomeRecorder
                scheduleId={row.id}
                open={openId === row.id}
                onToggle={() => setOpenId(openId === row.id ? "" : row.id)}
                onRecorded={(label) => onRecorded(row, label)}
              />
              {!row.recorded && (
                /* Somebody rings to say they cannot make it. Before this there
                   was nothing to press: the applicant could cancel their own
                   slot, HR could not. */
                <button className={SMALL_BUTTON} onClick={() => openMove(row)}>
                  <span className="flex items-center gap-1.5">
                    <CalendarSync className="h-4 w-4" />
                    {moveId === row.id ? "Close" : "Move or cancel"}
                  </span>
                </button>
              )}
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
  // ⚠️ 下書き・保存中・理由待ち・保存の失敗は OutcomeRecorder が持つ。
  //    ここに置くと1文字ごとに一覧全体が再描画される（そしてかつて
  //    フォーカスを失わせていたのがこの形）。
  // ⚠️ 鍵は **applicant_id**。日程変更は新しい枠を作るので、枠のIDで持つと
  //    再取得のあとに行のIDが変わり、「動かしました」が画面に出ない
  //    （実機で押して発覚。保存は成功しているのに何も言わない画面になる）。
  const [done, setDone] = useState<Record<string, string>>({});
  // 動かす・取り消す。**応募者は自分で取り消せるのに HR は取り消せなかった。**
  const [moveId, setMoveId] = useState<string>("");
  const [reason, setReason] = useState("");
  // 時刻が過ぎたのに結果が入っていない面接。upcoming は今日からしか返さないので、
  // 記録されないまま日をまたいだものは、これが無いとどの画面にも出ない。
  const [lateRows, setLateRows] = useState<Row[]>([]);
  const [lateBy, setLateBy] = useState<Record<string, number>>({});
  const [lateOldest, setLateOldest] = useState(0);
  const [lateErr, setLateErr] = useState("");
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

  const loadLate = useCallback(async () => {
    setLateErr("");
    try {
      const res = await fetch(`/api/admin/hr/interviews/outstanding?mine=${mine ? 1 : 0}`,
        { cache: "no-store" });
      if (!res.ok) {
        // Swallowing this is how a queue of 26 shows as nothing at all: the
        // first call on a cold page races the session refresh and comes back
        // 401, and an empty section looks exactly like a cleared one.
        setLateErr("Could not load the ones past their time.");
        return;
      }
      const j = await res.json();
      setLateRows(j.rows || []);
      setLateBy(j.by_interviewer || {});
      setLateOldest(Number(j.oldest_days_late || 0));
    } catch {
      setLateErr("Could not load the ones past their time.");
    }
  }, [mine]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadLate(); }, [loadLate]);

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

  /** The panel saved it. Mark the row and leave it on screen with its result
   *  showing -- a row that vanishes the moment you press the button gives you
   *  nowhere to notice you pressed the wrong one (lesson 56). */
  function onRecorded(row: Row, label: string) {
    setDone((p) => ({ ...p, [row.applicant_id]: `Recorded — ${label}` }));
    setRows((p) => p.map((r) => (r.id === row.id ? { ...r, recorded: true } : r)));
    setLateRows((p) => p.map((r) => (r.id === row.id ? { ...r, recorded: true } : r)));
    setOpenId("");
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
        <button
          className={SMALL_BUTTON}
          onClick={() => { void load(); void loadLate(); }}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {err && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          {err}
        </p>
      )}

      {!loading && rows.length === 0 && lateRows.length === 0 && (
        <p className={T_CAPTION}>
          Nothing booked yet. Applicants book their own time from the link that
          Shortlist hands you on the Voice screening tab.
        </p>
      )}

      {lateErr && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          {lateErr}{" "}
          <button className="underline" onClick={() => void loadLate()}>Try again</button>
        </p>
      )}

      {lateRows.length > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className={T_LABEL}>
              Past their time, nothing recorded — {lateRows.length}
            </p>
            {lateOldest > 0 && (
              <span className="text-xs text-amber-200/90">
                oldest {lateOldest} day{lateOldest === 1 ? "" : "s"} ago
              </span>
            )}
            {Object.keys(lateBy).length > 0 && (
              <span className={T_CAPTION}>
                {Object.entries(lateBy)
                  .sort((a, b) => b[1] - a[1])
                  .map(([who, n]) => `${who || "unassigned"} ${n}`)
                  .join(" · ")}
              </span>
            )}
          </div>
          <p className={T_CAPTION}>
            These dropped off the list when the day turned. Say what happened —
            it is the same three buttons, and it moves the applicant on.
          </p>
          {lateRows.map((r) => (
            <div key={r.id}>
              {/* Line prints the time only. On a row from last week that is not
                  enough to know which day is being recorded. */}
              <p className={`${T_CAPTION} mb-1 mt-2`}>
                {dayOf(r.starts_at)}
                {typeof r.days_late === "number" && r.days_late > 0
                  ? ` · ${r.days_late} day${r.days_late === 1 ? "" : "s"} ago`
                  : ""}
              </p>
              <Line row={r}
              openId={openId} setOpenId={setOpenId}
              moveId={moveId} openMove={openMove}
              onRecorded={onRecorded} done={done}
              freeSlots={freeSlots} slotsErr={slotsErr} moving={moving}
              doMove={(rw, sl) => void doMove(rw, sl)}
              doCancel={(rw) => void doCancel(rw)}
              reason={reason} setReason={setReason} />
            </div>
          ))}
        </div>
      )}

      {today.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className={T_LABEL}>Today</p>
          {today.map((r) => <Line key={r.id} row={r}
              openId={openId} setOpenId={setOpenId}
              moveId={moveId} openMove={openMove}
              onRecorded={onRecorded} done={done}
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
              onRecorded={onRecorded} done={done}
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
              onRecorded={onRecorded} done={done}
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
