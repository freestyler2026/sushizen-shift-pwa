"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import {
  ClipboardCheck, CheckCircle2, Clock, RefreshCw, Undo2, AlertTriangle, Camera,
} from "lucide-react";
import {
  GLASS_CARD, PRIMARY_BUTTON, SMALL_BUTTON, TEXTAREA_CLASS,
  T_SECTION, T_BODY, T_CAPTION, T_LABEL,
  BADGE_SUCCESS, BADGE_WARNING, BADGE_ERROR, BADGE_INFO,
} from "@/lib/ui-tokens";

/**
 * Yesterday's Operation Review.
 *
 * Product scores of C used to arrive one alert at a time in the same inbox as
 * "the rush hour check is missing", and were sixty per cent of everything there.
 * They come here now: once a morning, per branch, with the photos open and time
 * to look at them.
 *
 * Assessment first, and two of its four answers end the item. On the old
 * channel 19 of 52 answers said "no issue" -- making somebody work through four
 * questions to record that a photo was fine is how a queue becomes something to
 * clear rather than something to read.
 */

type Opt = { key: string; label: string; ends?: boolean };

type Answer = {
  assessment: string | null;
  issue_type: string[];
  root_cause: string[];
  action_taken: string[];
  staff: string[];
  note: string;
};

type Item = {
  id: number;
  kind: "quality" | "prep_time";
  source_id: string;
  payload: Record<string, string | number | boolean | null>;
  answer: Answer | null;
  answered_by: string | null;
};

type Summary = {
  quality: {
    photos: number; graded: number; not_a_dish: number; below_c: number;
    issue_rate: number | null;
    grades: { s: number; a: number; b: number; c: number; d: number; f: number };
  };
  prep: {
    measurable: boolean; reason?: string; threshold?: number;
    measured_orders?: number; over_threshold?: number; asked_about?: number;
    over_threshold_plus10?: number; worst?: number | null; average?: number | null;
  };
  backup: { filed: boolean; reports: number; shortage_alerts: number };
  rush: { completed: number; missed: number };
  disposal: { filed: boolean };
};

type Review = {
  id: number; city: string; branch: string; review_date: string;
  status: "open" | "completed"; assigned_to: string;
  summary: Summary; manager_comment: string;
  completed_by: string | null;
  items: Item[];
  options: {
    assessments: Opt[]; issue_types: Opt[]; root_causes: Opt[]; actions: Opt[];
    prep_causes: Opt[]; prep_actions: Opt[]; prep_threshold: number;
  };
};

type ReviewRow = {
  id: number; branch: string; review_date: string; status: string;
  items: number; answered: number;
};

const BRANCH_LABEL: Record<string, string> = {
  TAFT: "Taft", PAR: "Parañaque", CUB: "Cubao", CK: "Commissary Kitchen",
  BB: "Business Bay", JLT: "JLT", ARJ: "Arjan", AM: "Al Mina", AB: "Al Barsha",
};

function longDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** One row of chips. Multi-select for the questions that genuinely take more
 *  than one answer -- a dish can be both badly cut and under-portioned. */
function Chips({
  label, options, value, onChange, single = false, disabled,
}: {
  label: string; options: Opt[]; value: string[];
  onChange: (v: string[]) => void; single?: boolean; disabled?: boolean;
}) {
  return (
    <div>
      <p className={`${T_LABEL} mb-1.5`}>{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value.includes(o.key);
          return (
            <button
              key={o.key}
              type="button"
              disabled={disabled}
              onClick={() =>
                onChange(single ? [o.key] : on ? value.filter((v) => v !== o.key) : [...value, o.key])
              }
              className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors disabled:opacity-50 ${
                on
                  ? "border-violet-400/50 bg-violet-500/20 text-violet-100"
                  : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function MorningReviewPage() {
  const auth = getAuth();
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [staff, setStaff] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(0);
  const [err, setErr] = useState("");
  const [comment, setComment] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [draft, setDraft] = useState<Record<number, Answer>>({});

  const loadList = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/store/ops-review?status=open", {
        headers: getAuthHeaders(auth), cache: "no-store",
      });
      if (!res.ok) {
        // A raw status code is a dead end. Say which of the two it is.
        setErr(res.status === 403
          ? "This page is for the managers on the branch duty roster. If that should include you, ask the office to add Morning Review to your role."
          : `Could not load (HTTP ${res.status})`);
        return;
      }
      const d = await res.json();
      setRows(d.reviews || []);
      if ((d.reviews || []).length) await loadOne(d.reviews[0].id);
      else setReview(null);
    } catch {
      setErr("Could not load. Check your connection.");
    } finally {
      setLoading(false);
    }
    // loadOne is stable enough for this: it only reads auth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth]);

  async function loadOne(id: number) {
    const res = await fetch(`/api/store/ops-review/${id}`, {
      headers: getAuthHeaders(auth), cache: "no-store",
    });
    if (!res.ok) { setErr(`Could not open review ${id}`); return; }
    const d: Review = await res.json();
    setReview(d);
    setComment(d.manager_comment || "");
    setDraft({});
    setOpen(d.items.find((i) => !i.answer)?.id ?? null);
  }

  useEffect(() => { void loadList(); }, [loadList]);

  useEffect(() => {
    const city = review?.city || auth?.city;
    if (!city) return;
    fetch(`/api/staff/names?city=${encodeURIComponent(city)}`, { headers: getAuthHeaders(auth) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setStaff(d?.names || []))
      .catch(() => setStaff([]));
  }, [review?.city, auth]);

  const blank = (): Answer => ({
    assessment: null, issue_type: [], root_cause: [], action_taken: [], staff: [], note: "",
  });
  const cur = (id: number): Answer => draft[id] ?? blank();
  const patch = (id: number, p: Partial<Answer>) =>
    setDraft((d) => ({ ...d, [id]: { ...cur(id), ...p } }));

  async function save(item: Item, body: Record<string, unknown> | null) {
    setBusy(item.id);
    setErr("");
    try {
      const res = await fetch(`/api/store/ops-review/item/${item.id}`, {
        method: "POST",
        headers: { ...getAuthHeaders(auth), "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const text = await res.text();
      if (!res.ok) {
        let msg = text;
        try { msg = JSON.parse(text)?.detail || text; } catch { /* text/plain */ }
        setErr(String(msg).slice(0, 200));
        return;
      }
      if (review) await loadOne(review.id);
    } catch {
      setErr("Could not save. Nothing was recorded — try again.");
    } finally {
      setBusy(0);
    }
  }

  async function complete(force = false) {
    if (!review) return;
    setBusy(-1);
    setErr("");
    try {
      const res = await fetch(`/api/store/ops-review/${review.id}/complete`, {
        method: "POST",
        headers: { ...getAuthHeaders(auth), "Content-Type": "application/json" },
        body: JSON.stringify({ comment, force }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d?.detail || `${d?.remaining} still unanswered`); return; }
      await loadList();
    } catch {
      setErr("Could not complete. Nothing was changed.");
    } finally {
      setBusy(0);
    }
  }

  const quality = useMemo(() => review?.items.filter((i) => i.kind === "quality") ?? [], [review]);
  const preps   = useMemo(() => review?.items.filter((i) => i.kind === "prep_time") ?? [], [review]);
  const left    = useMemo(() => review?.items.filter((i) => !i.answer).length ?? 0, [review]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="p-6"><p className={T_BODY}>Loading…</p></div>;
  }

  if (!review) {
    return (
      <div className="mx-auto max-w-2xl p-4 md:p-6">
        <div className={`${GLASS_CARD} p-6 text-center`}>
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500/60" />
          <p className={T_SECTION}>Nothing to review</p>
          <p className={`${T_BODY} mt-1`}>
            Yesterday&rsquo;s review is done, or there was nothing at your branch
            worth looking at. A review is only made on a day that has something in it.
          </p>
          <button className={`${SMALL_BUTTON} mt-4`} onClick={() => void loadList()}>Refresh</button>
        </div>
        {err && <p className="mt-3 text-xs text-red-400">{err}</p>}
      </div>
    );
  }

  const s = review.summary;
  const g = s.quality.grades;

  return (
    <div className="mx-auto max-w-2xl p-4 pb-24 md:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <ClipboardCheck className="h-5 w-5 text-violet-400" />
        <h1 className="text-xl font-semibold text-white">
          {BRANCH_LABEL[review.branch] || review.branch}
        </h1>
        <span className={T_CAPTION}>{longDate(review.review_date)}</span>
        <button className={`${SMALL_BUTTON} ml-auto`} onClick={() => void loadList()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {rows.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {/* Oldest first, from the server. A review left from two days ago is
              the one that needs doing. */}
          {rows.map((r) => (
            <button
              key={r.id}
              onClick={() => void loadOne(r.id)}
              className={`rounded-xl border px-3 py-2 text-left text-xs ${
                r.id === review.id
                  ? "border-violet-400/50 bg-violet-500/15"
                  : "border-white/10 bg-white/4 hover:bg-white/8"
              }`}
            >
              <span className="block text-zinc-200">
                {BRANCH_LABEL[r.branch] || r.branch} · {r.review_date}
              </span>
              <span className={T_CAPTION}>{r.answered} of {r.items} answered</span>
            </button>
          ))}
        </div>
      )}

      {err && (
        <p className="mb-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {err}
        </p>
      )}

      {/* ── Summary. These are the figures as they stood when the review was
             made, not a fresh count — so this page says the same thing next
             week as it does today. ── */}
      <div className={`${GLASS_CARD} mb-4 p-4`}>
        <p className={`${T_LABEL} mb-2`}>Operation summary</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm md:grid-cols-3">
          <div><span className={T_CAPTION}>Photos graded</span><br /><span className="tabular-nums text-white">{s.quality.graded}</span></div>
          <div><span className={T_CAPTION}>A / B</span><br /><span className="tabular-nums text-white">{g.a + g.s} / {g.b}</span></div>
          <div>
            <span className={T_CAPTION}>C / D / F</span><br />
            <span className="tabular-nums text-white">{g.c} / {g.d} / {g.f}</span>
          </div>
          <div>
            <span className={T_CAPTION}>Issue rate</span><br />
            <span className="tabular-nums text-white">
              {s.quality.issue_rate === null ? "—" : `${s.quality.issue_rate}%`}
            </span>
          </div>
          {s.quality.not_a_dish > 0 && (
            <div>
              <span className={T_CAPTION}>Not a dish</span><br />
              <span className="tabular-nums text-zinc-400">{s.quality.not_a_dish}</span>
            </div>
          )}
        </div>

        <div className="mt-3 border-t border-white/8 pt-3">
          <p className={`${T_LABEL} mb-1.5`}>Prep time</p>
          {s.prep.measurable ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm md:grid-cols-4">
              <div><span className={T_CAPTION}>Measured</span><br /><span className="tabular-nums text-white">{s.prep.measured_orders}</span></div>
              <div><span className={T_CAPTION}>Over {s.prep.threshold} min</span><br /><span className="tabular-nums text-white">{s.prep.over_threshold}</span></div>
              <div><span className={T_CAPTION}>Over {(s.prep.threshold ?? 30) + 10} min</span><br /><span className="tabular-nums text-white">{s.prep.over_threshold_plus10}</span></div>
              <div><span className={T_CAPTION}>Worst / avg</span><br /><span className="tabular-nums text-white">{s.prep.worst ?? "—"} / {s.prep.average ?? "—"}</span></div>
            </div>
          ) : (
            /* Not "0 orders over 30 minutes". Saying a source cannot be read is
               the difference between a quiet day and a broken measurement. */
            <p className={T_BODY}>
              <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-amber-400" />
              Not measurable here. {s.prep.reason}
            </p>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-white/8 pt-3 text-sm md:grid-cols-3">
          <div>
            <span className={T_CAPTION}>Backup report</span><br />
            <span className={s.backup.filed ? "text-emerald-300" : "text-amber-300"}>
              {s.backup.filed ? "Filed" : "Not filed"}
            </span>
            {s.backup.shortage_alerts > 0 && (
              <span className={T_CAPTION}> · {s.backup.shortage_alerts} shortage</span>
            )}
          </div>
          <div>
            <span className={T_CAPTION}>Rush hour checks</span><br />
            <span className="tabular-nums text-white">{s.rush.completed}</span>
            {s.rush.missed > 0 && <span className="text-amber-300"> · {s.rush.missed} missed</span>}
          </div>
          <div>
            <span className={T_CAPTION}>Disposal report</span><br />
            <span className={s.disposal.filed ? "text-emerald-300" : "text-amber-300"}>
              {s.disposal.filed ? "Filed" : "Not filed"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Quality ── */}
      {quality.length > 0 && (
        <div className="mb-4">
          <p className={`${T_LABEL} mb-2`}>Product quality — {quality.length} to look at</p>
          <div className="flex flex-col gap-2">
            {quality.map((it) => {
              const a = it.answer;
              const d = cur(it.id);
              const isOpen = open === it.id;
              const grade = String(it.payload.grade ?? "");
              return (
                <div key={it.id} className={`${GLASS_CARD} overflow-hidden`}>
                  <button
                    className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 text-left hover:bg-white/4"
                    onClick={() => setOpen(isOpen ? null : it.id)}
                  >
                    <span className={grade === "C" ? BADGE_WARNING : BADGE_ERROR}>{grade}</span>
                    <span className={T_CAPTION}>{String(it.payload.at ?? "")}</span>
                    <span className={T_CAPTION}>{String(it.payload.posted_by ?? "")}</span>
                    {a ? (
                      <span className={BADGE_SUCCESS}>
                        {a.assessment?.replace(/_/g, " ")}
                      </span>
                    ) : (
                      <span className={`${T_CAPTION} ml-auto text-violet-300`}>Answer</span>
                    )}
                  </button>

                  {isOpen && (
                    <div className="border-t border-white/8 px-4 py-3">
                      {it.payload.has_photo ? (
                        // One request per photo, only when the row is open.
                        <img
                          src={`/api/store/ops-review/item/${it.id}/photo`}
                          alt={`Product graded ${grade}`}
                          loading="lazy"
                          className="mb-3 max-h-80 w-full rounded-xl object-contain"
                        />
                      ) : (
                        <p className={`${T_CAPTION} mb-3`}>
                          <Camera className="mr-1 inline h-3.5 w-3.5" />
                          The photo is no longer stored.
                        </p>
                      )}
                      <p className={`${T_BODY} mb-3`}>{String(it.payload.feedback ?? "")}</p>

                      {a ? (
                        <div className="flex flex-wrap items-center gap-3">
                          <span className={T_BODY}>
                            {a.assessment?.replace(/_/g, " ")}
                            {a.issue_type.length ? ` — ${a.issue_type.join(", ")}` : ""}
                            {a.staff.length ? ` · ${a.staff.join(", ")}` : ""}
                          </span>
                          <button
                            className={`${SMALL_BUTTON} flex items-center gap-1.5`}
                            disabled={busy === it.id}
                            onClick={() => void save(it, null)}
                          >
                            <Undo2 className="h-3.5 w-3.5" /> Undo
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          {/* Two of these end the item here. */}
                          <Chips
                            label="This photo"
                            options={review.options.assessments}
                            value={d.assessment ? [d.assessment] : []}
                            single
                            disabled={busy === it.id}
                            onChange={(v) => {
                              const k = v[0];
                              const ends = review.options.assessments.find((x) => x.key === k)?.ends;
                              patch(it.id, { assessment: k });
                              if (ends) void save(it, { assessment: k });
                            }}
                          />
                          {d.assessment && !review.options.assessments.find((x) => x.key === d.assessment)?.ends && (
                            <>
                              <Chips label="What was wrong" options={review.options.issue_types}
                                     value={d.issue_type} disabled={busy === it.id}
                                     onChange={(v) => patch(it.id, { issue_type: v })} />
                              <Chips label="Why" options={review.options.root_causes}
                                     value={d.root_cause} disabled={busy === it.id}
                                     onChange={(v) => patch(it.id, { root_cause: v })} />
                              <Chips label="What you did" options={review.options.actions}
                                     value={d.action_taken} disabled={busy === it.id}
                                     onChange={(v) => patch(it.id, { action_taken: v })} />
                              {staff.length > 0 && (
                                <Chips label="Staff involved"
                                       options={staff.slice(0, 60).map((n) => ({ key: n, label: n }))}
                                       value={d.staff} disabled={busy === it.id}
                                       onChange={(v) => patch(it.id, { staff: v })} />
                              )}
                              <textarea
                                className={TEXTAREA_CLASS} rows={2}
                                placeholder="Note (required only for Other)"
                                value={d.note}
                                onChange={(e) => patch(it.id, { note: e.target.value })}
                              />
                              <button
                                className={PRIMARY_BUTTON}
                                disabled={busy === it.id}
                                onClick={() => void save(it, { ...d })}
                              >
                                Save
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Prep time ── */}
      {preps.length > 0 && (
        <div className="mb-4">
          <p className={`${T_LABEL} mb-2`}>
            Prep time — the {preps.length} longest
          </p>
          {/* The count stays true even though the asking is capped. Nineteen
              orders in one evening rush share one answer; typing it nineteen
              times makes nineteen copies of it, not more insight. */}
          <p className={`${T_CAPTION} mb-2`}>
            {s.prep.over_threshold} order{s.prep.over_threshold === 1 ? "" : "s"} went
            over {s.prep.threshold} minutes yesterday
            {preps.length < (s.prep.over_threshold ?? 0)
              ? `. You are asked about the ${preps.length} slowest; the rest are in the summary above.`
              : "."}
          </p>
          <div className="flex flex-col gap-2">
            {preps.map((it) => {
              const a = it.answer;
              const d = cur(it.id);
              const isOpen = open === it.id;
              const mins = Number(it.payload.prep_minutes ?? 0);
              return (
                <div key={it.id} className={`${GLASS_CARD} overflow-hidden`}>
                  <button
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-white/4"
                    onClick={() => setOpen(isOpen ? null : it.id)}
                  >
                    <Clock className="h-4 w-4 text-amber-400" />
                    <span className="font-mono text-sm tabular-nums text-white">{mins} min</span>
                    <span className={T_CAPTION}>{String(it.payload.order_no ?? "")}</span>
                    <span className={T_CAPTION}>
                      {String(it.payload.accepted ?? "")} → {String(it.payload.ready ?? "")}
                    </span>
                    {a ? <span className={BADGE_INFO}>{a.root_cause.join(", ")}</span>
                       : <span className={`${T_CAPTION} ml-auto text-violet-300`}>Answer</span>}
                  </button>
                  {isOpen && (
                    <div className="border-t border-white/8 px-4 py-3">
                      {a ? (
                        <div className="flex flex-wrap items-center gap-3">
                          <span className={T_BODY}>
                            {a.root_cause.join(", ")} — {a.action_taken.join(", ")}
                          </span>
                          <button className={`${SMALL_BUTTON} flex items-center gap-1.5`}
                                  disabled={busy === it.id} onClick={() => void save(it, null)}>
                            <Undo2 className="h-3.5 w-3.5" /> Undo
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          {/* No "no issue" here: an order that took 47 minutes
                              took 47 minutes. */}
                          <Chips label="Why it took this long" options={review.options.prep_causes}
                                 value={d.root_cause} disabled={busy === it.id}
                                 onChange={(v) => patch(it.id, { root_cause: v })} />
                          <Chips label="What you did" options={review.options.prep_actions}
                                 value={d.action_taken} disabled={busy === it.id}
                                 onChange={(v) => patch(it.id, { action_taken: v })} />
                          <textarea className={TEXTAREA_CLASS} rows={2}
                                    placeholder="Note (required only for Other)"
                                    value={d.note}
                                    onChange={(e) => patch(it.id, { note: e.target.value })} />
                          <button className={PRIMARY_BUTTON} disabled={busy === it.id}
                                  onClick={() => void save(it, { ...d, kind: "prep_time" })}>
                            Save
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── One comment for the whole morning, then done ── */}
      <div className={`${GLASS_CARD} p-4`}>
        <p className={`${T_LABEL} mb-1.5`}>What happened and what you did</p>
        <textarea
          className={TEXTAREA_CLASS} rows={3}
          placeholder="A few lines covering both quality and prep time."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button className={PRIMARY_BUTTON} disabled={busy === -1 || left > 0}
                  onClick={() => void complete(false)}>
            Complete morning review
          </button>
          {left > 0 && (
            <span className={T_CAPTION}>
              {left} still to answer
            </span>
          )}
          {left > 0 && (
            /* A way to finish anyway, because a manager pulled onto the floor
               mid-review should not be stuck with a button that refuses. What
               was skipped stays visible on the record. */
            <button className={SMALL_BUTTON} disabled={busy === -1}
                    onClick={() => void complete(true)}>
              Finish without the rest
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
