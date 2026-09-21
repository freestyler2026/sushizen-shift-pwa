"use client";

import { useEffect, useState } from "react";
import { Check, PauseCircle, X, UserX } from "lucide-react";
import { PRIMARY_BUTTON, SMALL_BUTTON, T_CAPTION, T_LABEL } from "@/lib/ui-tokens";
import { reasonsFor, reasonLabel, outcomeLabel, isNoShow } from "@/lib/hr-outcome";

/**
 * "How did it go?" — the one place the interview result is written.
 *
 * It was inline in the interview list. The calendar shows the same bookings and
 * is where the interviewer actually is when they ring — they pick a day, read
 * the applicant, and call — but it had no way to say what happened, so the
 * result had to be recorded on a different screen and mostly was not: of 52
 * interviews whose time had passed, 15 carried an evaluation and none recorded
 * whether the person turned up.
 *
 * Copying the panel into the calendar would put the rules in two places, and
 * that is how both screens spent a week sending no reason and taking a 400 for
 * every hold and every pass. One component, both screens.
 */

export const OUTCOMES = [
  { key: "proceed", label: "Move to offer", icon: Check, needsReason: false },
  { key: "hold", label: "Hold — decide later", icon: PauseCircle, needsReason: true },
  { key: "pass", label: "Not for this role", icon: X, needsReason: true },
  { key: "no_show", label: "Did not turn up", icon: UserX, needsReason: false },
] as const;

export type OutcomeReason = { key: string; label: string };

/** The server sends the store's own clock (`…T21:51:06+08:00`). Reading it
 *  with `new Date()` would redraw it in whatever timezone the reader's PC is
 *  set to, which is how one incident showed two times four hours apart on the
 *  same screen. Take the wall clock as sent. */
function whenText(iso: string): string {
  const s = String(iso || "");
  return s.length >= 16 ? `${s.slice(0, 10)} at ${s.slice(11, 16)}` : s;
}

/** Fetched once for the page, not once per row. Twenty rows on a calendar day
 *  each asking for the same fixed list is twenty requests for one answer. */
let reasonCache: OutcomeReason[] | null = null;
let reasonInFlight: Promise<OutcomeReason[]> | null = null;

async function loadReasons(): Promise<OutcomeReason[]> {
  if (reasonCache) return reasonCache;
  if (!reasonInFlight) {
    reasonInFlight = (async () => {
      try {
        const res = await fetch("/api/admin/hr/interview-outcome-reasons", { cache: "no-store" });
        if (!res.ok) return [];
        const j = await res.json();
        const list: OutcomeReason[] = j.reasons || [];
        if (list.length) reasonCache = list;
        return list;
      } catch {
        return [];
      } finally {
        reasonInFlight = null;
      }
    })();
  }
  return reasonInFlight;
}

/** What is already on file for this interview. */
export type RecordedOutcome = {
  recommendation: string;
  reason: string;
  notes: string;
  interviewer: string;
  recorded_at: string;
  /** False = recorded against the applicant, with no booking named. Every one
   *  of the 87 evaluations on file is like this: the board writes no
   *  schedule_id. It is still this interview's answer, and saying "nothing
   *  recorded" about it is how the same decision gets entered twice. */
  tied: boolean;
  total: number;
};

export default function OutcomeRecorder({
  scheduleId, open, onToggle, onRecorded,
}: {
  scheduleId: string;
  open: boolean;
  onToggle: () => void;
  /** Called once the server has taken it, with the label to show on the row. */
  onRecorded: (label: string) => void;
}) {
  const [reasons, setReasons] = useState<OutcomeReason[]>([]);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [had, setHad] = useState<RecordedOutcome | null>(null);
  // Three states, not two: still asking, asked and there is none, asked and
  // it failed. "Nothing recorded" and "we could not find out" must not look
  // the same on a screen whose whole job is to say what was recorded.
  const [hadState, setHadState] = useState<"idle" | "loading" | "done" | "error">("idle");

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void loadReasons().then((r) => { if (alive) setReasons(r); });
    setHadState("loading");
    void (async () => {
      try {
        const res = await fetch(`/api/admin/hr/interviews/${scheduleId}/outcome`,
                                { cache: "no-store" });
        if (!alive) return;
        if (!res.ok) { setHadState("error"); return; }
        const j = await res.json();
        if (!alive) return;
        setHad(j.outcome || null);
        setHadState("done");
      } catch {
        if (alive) setHadState("error");
      }
    })();
    return () => { alive = false; };
  }, [open, scheduleId]);

  async function record(outcome: string, reasonKey = "") {
    if (saving) return;
    setSaving(true);
    setErr("");
    try {
      const res = await fetch(`/api/admin/hr/interviews/${scheduleId}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome, reason: reasonKey, notes: note.trim() }),
      });
      const text = await res.text();
      if (!res.ok) {
        // A save that failed must not look like one that worked, and the
        // refusal belongs next to the buttons rather than at the top of a long
        // page where nobody scrolls back to find it.
        let msg = text;
        try { msg = JSON.parse(text)?.detail || text; } catch { /* text/plain */ }
        setErr(String(msg).slice(0, 240));
        return;
      }
      onRecorded(OUTCOMES.find((o) => o.key === outcome)?.label || outcome);
      setNote("");
      setPending("");
      setErr("");
    } catch {
      setErr("Could not save. Nothing was recorded — try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button className={SMALL_BUTTON} onClick={onToggle}>
        How did it go?
      </button>
    );
  }

  return (
    <div className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className={T_LABEL}>How did it go?</p>
        <button className={SMALL_BUTTON} onClick={onToggle}>Close</button>
      </div>

      {/* 既に入っているものを、書く欄より先に出す。無いことを確かめてから
          書くのと、入っていることに気づかず上書きするのは別の作業。 */}
      {hadState === "loading" && (
        <p className={`${T_CAPTION} mb-2`}>Checking what is already on file…</p>
      )}
      {hadState === "error" && (
        <p className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-sm text-amber-200">
          Could not check whether this one already has an outcome. It may
          already be answered — close this and open it again before recording.
        </p>
      )}
      {hadState === "done" && had && (
        <div className="mb-3 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] p-3">
          <p className={`${T_LABEL} mb-1`}>Already recorded</p>
          <p className="text-sm text-zinc-100">
            <span className={isNoShow(had.reason) ? "font-semibold text-amber-200" : "font-semibold"}>
              {outcomeLabel(had.recommendation, had.reason)}
            </span>
            {had.reason && <span className="text-zinc-300"> — {reasonLabel(had.reason)}</span>}
          </p>
          {had.notes && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{had.notes}</p>
          )}
          <p className={`${T_CAPTION} mt-1`}>
            {had.interviewer || "Somebody"} on {whenText(had.recorded_at)}
            {!had.tied && " · recorded against the applicant, with no booking named"}
            {had.total > 1 && ` · ${had.total} outcomes on file for them, this is the latest`}
          </p>
        </div>
      )}

      <p className={`${T_LABEL} mb-1`}>
        {hadState === "done" && had ? "Record a different outcome" : "Record the outcome"}
      </p>
      {hadState === "done" && had && (
        <p className={`${T_CAPTION} mb-2`}>
          Only if the one above is wrong. It adds a new entry and moves the
          applicant again — the old one stays on their history.
        </p>
      )}
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
              setErr("");
              // Two of these need a reason before the server will take them.
              // Ask here rather than let the save be refused.
              if (o.needsReason) { setPending(pending === o.key ? "" : o.key); return; }
              setPending("");
              void record(o.key);
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
              The reasons did not load. Reload the page and try again — this one
              cannot be saved without one.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {reasonsFor(reasons, pending).map((r) => (
                <button
                  key={r.key}
                  className={SMALL_BUTTON}
                  disabled={saving}
                  onClick={() => void record(pending, r.key)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
          <p className={`${T_CAPTION} mt-2`}>
            One tap saves it. This is the question that gets asked weeks later,
            which is why it is not optional.
          </p>
        </div>
      )}

      {err && (
        <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-sm text-amber-200">
          {err}
        </p>
      )}

      <p className={`${T_CAPTION} mt-2`}>
        We do not ask who you are or what time it is — you are signed in and the
        booking already says both. &quot;Did not turn up&quot; closes the applicant
        as rejected like any other close, but it is filed as a no-show rather
        than a judgement, and the row says so afterwards.
      </p>
    </div>
  );
}
