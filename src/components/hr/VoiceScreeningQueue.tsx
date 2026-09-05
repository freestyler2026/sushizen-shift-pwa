"use client";

import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw, Play, Check, PauseCircle, X, Undo2, AlertTriangle, Mic, Send,
} from "lucide-react";
import {
  GLASS_CARD, PRIMARY_BUTTON, SMALL_BUTTON, TEXTAREA_CLASS,
  T_SECTION, T_BODY, T_CAPTION, T_LABEL,
  BADGE_SUCCESS, BADGE_WARNING, BADGE_INFO,
} from "@/lib/ui-tokens";

/**
 * Listen to a first-round voice screening and decide, in the same view.
 *
 * The evidence and the decision were on different screens for the in-person
 * interviews, and that is why 92 candidates reached "interviewed" on the
 * strength of 3 interview records. Here the players and the three buttons sit
 * together, so recording the decision is not a second job.
 *
 * Shortlist is one tap -- moving somebody forward is never questioned later.
 * Hold and pass take a reason chip, because a hold is what becomes a 49-day
 * silence and a pass is what gets asked about.
 *
 * Nothing here scores anything. There is no rating field and no ranking: the
 * reasons name what a recording can actually show, and how somebody speaks is
 * not on the list.
 */

type Phone = { raw: string; e164: string; usable: boolean };

type Row = {
  /** null for an applicant who has no screening yet. */
  id: number | null;
  applicant_id: string;
  full_name: string;
  phone: string;
  position_group: string | null;
  position_applied: string | null;
  assigned_branch: string | null;
  experience_level: string | null;
  available_from: string | null;
  applicant_status: string;
  contact_apps: string[];
  form_language: string | null;
  applied_date: string | null;
  referrer_name: string | null;
  notes: string | null;
  answered: number;
  total_questions: number;
  complete: boolean;
  bucket: State;
  superseded: boolean;
  invited_at: string | null;
  invite_count: number;
  invited_by: string | null;
  phones: Phone[];
  decision: string | null;
  decision_reason: string | null;
  decision_notes: string | null;
  decided_by: string | null;
  decided_at: string | null;
  consent_at: string | null;
  completed_at: string | null;
  last_answer_at: string | null;
  token_expires_at: string | null;
  retain_until: string | null;
  created_at: string;
};

type Reason = { key: string; label: string };

type Item = {
  seq: number;
  text_en: string;
  text_tl: string;
  limit_seconds: number;
  answer: {
    seq: number;
    duration_seconds: number | null;
    bytes: number;
    mime_type: string;
    uploaded_at: string;
    has_audio: boolean;
  } | null;
};

type Detail = Row & { items: Item[] };

type State = "to_invite" | "waiting" | "to_review" | "done";

type Invite = {
  url: string;
  reissued: boolean;
  invite_count: number;
  answers_kept: number;
  expires_in_days: number;
  full_name: string;
  phones: Phone[];
  messages: { en: string; tl: string };
};

// Labelled by what you do with them, not by the state they are in. A count
// under a verb has to be the count you can perform that verb on.
const TABS: { key: State; label: string; hint: string }[] = [
  { key: "to_invite", label: "To invite",      hint: "Applied, no screening sent yet — oldest application first" },
  { key: "waiting",   label: "Waiting on them", hint: "Link sent, nothing recorded yet" },
  { key: "to_review", label: "To review",      hint: "Recordings in, waiting on you — longest wait first" },
  { key: "done",      label: "Done",           hint: "Decided, or already interviewed in person" },
];

const EXPERIENCE_LABEL: Record<string, string> = {
  none: "No experience", under_1y: "Under 1 year",
  "1_3y": "1–3 years", over_3y: "Over 3 years",
};

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

function waitedLabel(row: Row): string {
  const d = daysSince(row.last_answer_at || row.created_at);
  if (d === null) return "";
  if (d <= 0) return "today";
  if (d === 1) return "1 day";
  return `${d} days`;
}

/** Where a row belongs once it has no decision on it. Mirrors the server so an
 *  undo puts the row back in the tab it came from, not the one you are standing
 *  in -- undoing from Decided sends somebody back to To review. */
function bucketWithoutDecision(row: Row): State {
  if (row.id === null) return "to_invite";
  return row.answered > 0 ? "to_review" : "waiting";
}

function mmss(sec: number | null): string {
  if (!sec || sec < 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m}:${String(s).padStart(2, "0")}` : `0:${String(s).padStart(2, "0")}`;
}

export default function VoiceScreeningQueue({ city = "manila" }: { city?: string }) {
  const [state, setState] = useState<State>("to_review");
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [storageOk, setStorageOk] = useState(true);
  const [canDecide, setCanDecide] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [openId, setOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Which decision the reviewer picked but has not saved -- hold and pass wait
  // for a reason chip.
  const [pending, setPending] = useState<"hold" | "pass" | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Rows decided in this sitting. They stay on the list with their Undo, in the
  // place the reviewer is already looking. Telling somebody the undo is on a
  // different tab is the same as not offering one.
  const [justDecided, setJustDecided] = useState<Record<number, string>>({});

  // The invite panel for one applicant. Held open until it is dismissed: the
  // link is shown once and re-issuing kills the previous one, so it must not
  // disappear behind a re-render before it has been sent.
  const [invite, setInvite] = useState<Invite | null>(null);
  const [inviteFor, setInviteFor] = useState<string>("");
  const [inviteLang, setInviteLang] = useState<"en" | "tl">("en");
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(
        `/api/admin/hr/voice-screenings?city=${encodeURIComponent(city)}&state=${state}`,
        { cache: "no-store" },
      );
      const text = await res.text();
      if (!res.ok) {
        let detailMsg = text;
        try { detailMsg = JSON.parse(text)?.detail || text; } catch { /* text/plain */ }
        setErr(String(detailMsg).slice(0, 300));
        setRows([]);
        return;
      }
      const data = JSON.parse(text);
      setRows(data.rows || []);
      setCounts(data.counts || {});
      setReasons(data.reasons || []);
      setStorageOk(data.storage_configured !== false);
      setCanDecide(data.can_decide !== false);
    } catch {
      setErr("Could not load the queue. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [city, state]);

  useEffect(() => { void load(); }, [load]);

  async function open(row: Row) {
    if (openId === row.id) { setOpenId(null); setDetail(null); return; }
    setOpenId(row.id);
    setDetail(null);
    setPending(null);
    setNote("");
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/admin/hr/voice-screenings/${row.id}`, { cache: "no-store" });
      if (!res.ok) { setErr("Could not open this screening."); return; }
      setDetail(await res.json());
    } catch {
      setErr("Could not open this screening.");
    } finally {
      setLoadingDetail(false);
    }
  }

  async function sendInvite(row: Row) {
    if (saving) return;
    setSaving(true);
    setErr("");
    setCopied("");
    try {
      const res = await fetch(
        `/api/admin/hr/applicants/${row.applicant_id}/voice-invite`,
        { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}) });
      const text = await res.text();
      if (!res.ok) {
        let msg = text;
        try { msg = JSON.parse(text)?.detail || text; } catch { /* text/plain */ }
        setErr(String(msg).slice(0, 300));
        return;
      }
      setInvite(JSON.parse(text));
      setInviteFor(row.applicant_id);
      setInviteLang(row.form_language === "tl" ? "tl" : "en");
    } catch {
      setErr("Could not create the link. Nothing was sent — try again.");
    } finally {
      setSaving(false);
    }
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      // Clipboard is blocked outside a secure context or without permission.
      // Saying so beats a button that looks like it worked.
      setErr("Could not copy. Select the text and copy it by hand.");
    }
  }

  async function decide(row: Row, decision: string, reason = "") {
    if (saving || row.id === null) return;
    setSaving(true);
    setErr("");
    try {
      const res = await fetch(`/api/admin/hr/voice-screenings/${row.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reason, notes: note.trim() }),
      });
      const text = await res.text();
      if (!res.ok) {
        // A save that fails must not look like a save that worked.
        let msg = text;
        try { msg = JSON.parse(text)?.detail || text; } catch { /* text/plain */ }
        setErr(String(msg).slice(0, 300));
        return;
      }
      const out = JSON.parse(text);
      setJustDecided((p) => ({
        ...p,
        [row.id]: out.moved_to
          ? `${decision} — moved to ${out.moved_to.replace("_", " ")}`
          : `${decision} — stage unchanged (${out.previous_status.replace("_", " ")})`,
      }));
      setRows((p) => p.map((r) => (r.id === row.id
        ? { ...r, decision, decision_reason: reason || null, bucket: "done" }
        : r)));
      setCounts((c) => ({
        ...c,
        [state]: Math.max(0, (c[state] || 0) - 1),
        done: (c.done || 0) + 1,
      }));
      setPending(null);
      setNote("");
      setOpenId(null);
      setDetail(null);
    } catch {
      setErr("Could not save. Nothing was recorded — try again.");
    } finally {
      setSaving(false);
    }
  }

  async function undo(row: Row) {
    if (row.id === null) return;
    setSaving(true);
    setErr("");
    try {
      const res = await fetch(`/api/admin/hr/voice-screenings/${row.id}/decision`,
        { method: "DELETE" });
      const text = await res.text();
      if (!res.ok) {
        let msg = text;
        try { msg = JSON.parse(text)?.detail || text; } catch { /* text/plain */ }
        setErr(String(msg).slice(0, 300));
        return;
      }
      const back = bucketWithoutDecision(row);
      setJustDecided((p) => { const n = { ...p }; delete n[row.id]; return n; });
      setRows((p) => p.map((r) => (r.id === row.id
        ? { ...r, decision: null, decision_reason: null, decision_notes: null,
            decided_by: null, decided_at: null, bucket: back }
        : r)));
      setCounts((c) => ({
        ...c,
        [back]: (c[back] || 0) + 1,
        done: Math.max(0, (c.done || 0) - 1),
      }));
    } catch {
      setErr("Could not undo. The decision is still recorded.");
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6">
      {/* An empty queue and a feature that is switched off must not look the
          same. Say which one this is. */}
      {!storageOk && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div>
            <p className="text-sm font-semibold text-amber-300">
              Voice screening is not switched on
            </p>
            <p className={T_CAPTION}>
              No storage folder is configured, so applicants are not being offered
              the interview and nothing new will arrive here.
            </p>
          </div>
        </div>
      )}

      {!canDecide && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
          <p className={T_BODY}>
            You can listen to these recordings but not record a decision. That
            needs <span className="text-zinc-300">Manage HR Recruitment</span>.
          </p>
        </div>
      )}

      {/* Counts, each under the thing you would do with it. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setState(t.key); setOpenId(null); setDetail(null); }}
            title={t.hint}
            className={`rounded-xl border px-4 py-2 text-left transition-colors ${
              state === t.key
                ? "border-violet-500/40 bg-violet-500/15"
                : "border-white/8 bg-white/4 hover:bg-white/8"
            }`}
          >
            <span className={`block ${T_LABEL}`}>{t.label}</span>
            <span className="text-xl font-bold tabular-nums text-white">
              {counts[t.key] ?? 0}
            </span>
          </button>
        ))}
        <button
          className={`${SMALL_BUTTON} ml-auto flex items-center gap-1.5`}
          onClick={() => { setJustDecided({}); void load(); }}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <p className={`${T_CAPTION} mb-3`}>
        {TABS.find((t) => t.key === state)?.hint}
        {state === "to_review" && rows.length > 1 && " — longest wait first."}
      </p>

      {err && (
        <p className="mb-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {err}
        </p>
      )}

      {loading && rows.length === 0 && <p className={T_BODY}>Loading…</p>}

      {!loading && rows.length === 0 && (
        <div className={`${GLASS_CARD} p-6`}>
          <p className={T_SECTION}>Nothing here</p>
          <p className={`${T_BODY} mt-1`}>
            {state === "to_review"
              ? (counts.to_invite || counts.waiting)
                ? "No recordings are waiting. There are people under the other tabs who have not recorded yet."
                : "No applicant has recorded yet. The interview is offered on the application form the moment it is sent, and you can send a link from To invite."
              : state === "to_invite"
              ? "Everyone at New or Screened has already been sent a link."
              : "No one is in this state."}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {rows.map((row) => {
          const isOpen = row.id !== null && openId === row.id;
          const done = row.id !== null ? justDecided[row.id] : undefined;
          const noScreening = row.id === null;
          const showingInvite = inviteFor === row.applicant_id && invite !== null;
          return (
            <div key={row.id ?? `a-${row.applicant_id}`} className={`${GLASS_CARD} overflow-hidden`}>
              <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <Mic className="h-4 w-4 shrink-0 text-violet-400" />
                <span className="font-semibold text-white">{row.full_name}</span>
                <span className={T_CAPTION}>
                  {row.position_group || row.position_applied || "—"}
                  {row.assigned_branch ? ` · ${row.assigned_branch}` : ""}
                  {row.experience_level ? ` · ${EXPERIENCE_LABEL[row.experience_level] || row.experience_level}` : ""}
                </span>

                {noScreening ? (
                  <span className={T_CAPTION}>
                    applied {row.applied_date || "—"}
                  </span>
                ) : (
                  <span className={row.complete ? BADGE_SUCCESS : BADGE_WARNING}>
                    {row.answered} of {row.total_questions} answers
                  </span>
                )}

                {row.bucket === "to_review" && (
                  <span className={T_CAPTION}>waiting {waitedLabel(row)}</span>
                )}
                {row.bucket === "waiting" && (
                  <span className={T_CAPTION}>
                    {row.consent_at ? "opened it, not finished" : "not opened yet"}
                    {row.invite_count > 1 ? ` · sent ${row.invite_count}×` : ""}
                  </span>
                )}
                {row.superseded && (
                  <span className={T_CAPTION}>
                    interviewed in person — no screening decision needed
                  </span>
                )}
                {row.decision && (
                  <span className={BADGE_INFO}>
                    {row.decision}
                    {row.decision_reason ? ` · ${row.decision_reason.replace(/_/g, " ")}` : ""}
                  </span>
                )}

                <span className="ml-auto flex items-center gap-2">
                  {(noScreening || row.bucket === "waiting") && canDecide && (
                    <button
                      className={`${SMALL_BUTTON} flex items-center gap-1.5`}
                      onClick={() => void sendInvite(row)}
                      disabled={saving}
                    >
                      <Send className="h-3.5 w-3.5" />
                      {row.invite_count > 0 ? "New link" : "Get invite link"}
                    </button>
                  )}
                  {!noScreening && row.answered > 0 && (
                    <button
                      className="flex items-center gap-1 text-xs text-violet-300 hover:text-violet-200"
                      onClick={() => void open(row)}
                    >
                      <Play className="h-3.5 w-3.5" />
                      {isOpen ? "Close" : "Listen"}
                    </button>
                  )}
                </span>
              </div>

              {showingInvite && invite && (
                <div className="border-t border-white/8 bg-violet-500/8 px-4 py-3">
                  <p className="text-sm text-violet-200">
                    Link ready for {invite.full_name}. Nothing has been sent —
                    open one of these, then press send yourself.
                  </p>
                  {invite.reissued && (
                    <p className={`${T_CAPTION} mt-1`}>
                      This replaces their previous link, which no longer works.
                      {invite.answers_kept > 0
                        ? ` The ${invite.answers_kept} answer${invite.answers_kept > 1 ? "s" : ""} already recorded are kept, and they resume where they stopped.`
                        : ""}
                    </p>
                  )}
                  <p className={`${T_CAPTION} mt-1`}>
                    Works for {invite.expires_in_days} days.
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {(["en", "tl"] as const).map((l) => (
                      <button
                        key={l}
                        className={inviteLang === l ? BADGE_INFO : SMALL_BUTTON}
                        onClick={() => setInviteLang(l)}
                      >
                        {l === "en" ? "English" : "Tagalog"}
                      </button>
                    ))}
                  </div>
                  <pre className="mt-2 max-w-2xl whitespace-pre-wrap rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-zinc-300">
{invite.messages[inviteLang]}
                  </pre>

                  {invite.phones.length === 0 && (
                    <p className={`${T_CAPTION} mt-2`}>
                      No phone number on this applicant — copy the message and
                      send it however you normally reach them.
                    </p>
                  )}
                  {invite.phones.length > 1 && (
                    <p className={`${T_CAPTION} mt-2`}>
                      Two numbers are recorded for this person. Pick the right
                      one — we will not guess.
                    </p>
                  )}

                  {invite.phones.map((ph) => (
                    <div key={ph.raw} className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={`${T_CAPTION} min-w-[9rem]`}>{ph.raw}</span>
                      {ph.usable ? (
                        <>
                          <a
                            className={SMALL_BUTTON}
                            href={`https://wa.me/${ph.e164.replace("+", "")}?text=${encodeURIComponent(invite.messages[inviteLang])}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            WhatsApp
                          </a>
                          {/* Viber takes no message body, so the text is copied
                              at the same time -- otherwise the chat opens empty
                              and the link has to be typed from the screen. */}
                          <a
                            className={SMALL_BUTTON}
                            href={`viber://chat?number=${encodeURIComponent(ph.e164)}`}
                            onClick={() => void copy(invite.messages[inviteLang], "viber")}
                          >
                            Viber (copies the text)
                          </a>
                        </>
                      ) : (
                        <span className={T_CAPTION}>
                          not a number these apps can open — copy the message instead
                        </span>
                      )}
                    </div>
                  ))}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      className={SMALL_BUTTON}
                      onClick={() => void copy(invite.messages[inviteLang], "message")}
                    >
                      Copy message
                    </button>
                    <button
                      className={SMALL_BUTTON}
                      onClick={() => void copy(invite.url, "link")}
                    >
                      Copy link only
                    </button>
                    {copied && (
                      <span className="text-xs text-emerald-300">
                        Copied the {copied}
                      </span>
                    )}
                    <button
                      className={`${SMALL_BUTTON} ml-auto`}
                      onClick={() => { setInvite(null); setInviteFor(""); setCopied(""); void load(); }}
                    >
                      Sent — close
                    </button>
                  </div>
                  {/* Text messages cannot be sent from a computer, so SMS is a
                      copy rather than a button that would do nothing. */}
                  <p className={`${T_CAPTION} mt-2`}>
                    For SMS, copy the message and send it from your phone — a
                    computer cannot send one.
                  </p>
                </div>
              )}

              {/* Decided in this sitting: the undo stays right here. */}
              {done && (
                <div className="flex flex-wrap items-center gap-3 border-t border-white/8 bg-emerald-500/8 px-4 py-2.5">
                  <Check className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm text-emerald-300">Recorded — {done}</span>
                  <button
                    className={`${SMALL_BUTTON} flex items-center gap-1.5`}
                    onClick={() => void undo(row)}
                    disabled={saving}
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    Undo
                  </button>
                </div>
              )}

              {isOpen && (
                <div className="border-t border-white/8 px-4 py-4">
                  {loadingDetail && <p className={T_BODY}>Loading recordings…</p>}

                  {detail && (
                    <>
                      <div className={`${T_CAPTION} mb-3 flex flex-wrap gap-x-4 gap-y-1`}>
                        <span>{row.phone || "no number"}</span>
                        {row.contact_apps.length > 0 && (
                          <span>on {row.contact_apps.join(", ")}</span>
                        )}
                        {row.available_from && <span>can start {row.available_from}</span>}
                        {row.referrer_name && <span>referred by {row.referrer_name}</span>}
                        <span>applied {row.applied_date || "—"}</span>
                        {row.retain_until && <span>recordings kept until {row.retain_until}</span>}
                      </div>
                      {row.notes && (
                        <p className={`${T_BODY} mb-3`}>&ldquo;{row.notes}&rdquo;</p>
                      )}

                      <div className="flex flex-col gap-3">
                        {detail.items.map((it) => (
                          <div key={it.seq} className="rounded-xl border border-white/8 bg-white/3 p-3">
                            <p className="text-sm text-zinc-200">
                              <span className="mr-2 tabular-nums text-zinc-500">{it.seq}.</span>
                              {it.text_en}
                            </p>
                            {it.answer?.has_audio ? (
                              <div className="mt-2 flex flex-wrap items-center gap-3">
                                {/* One request per question. Audio never travels
                                    with the list. */}
                                <audio
                                  controls
                                  preload="none"
                                  className="h-9 w-full max-w-md"
                                  src={`/api/admin/hr/voice-screenings/${row.id}/answers/${it.seq}/audio`}
                                />
                                <span className={T_CAPTION}>
                                  {mmss(it.answer.duration_seconds)} of {mmss(it.limit_seconds)}
                                </span>
                              </div>
                            ) : (
                              <p className={`${T_CAPTION} mt-1.5`}>
                                {it.answer ? "Recording no longer held" : "Not answered"}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>

                      {canDecide && !row.decision && (
                        <div className="mt-4 border-t border-white/8 pt-4">
                          {!pending ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                className={`${PRIMARY_BUTTON} flex items-center gap-1.5`}
                                onClick={() => void decide(row, "shortlist")}
                                disabled={saving}
                              >
                                <Check className="h-4 w-4" />
                                Shortlist — invite to interview
                              </button>
                              <button
                                className={`${SMALL_BUTTON} flex items-center gap-1.5`}
                                onClick={() => setPending("hold")}
                                disabled={saving}
                              >
                                <PauseCircle className="h-4 w-4" />
                                Hold
                              </button>
                              <button
                                className={`${SMALL_BUTTON} flex items-center gap-1.5`}
                                onClick={() => setPending("pass")}
                                disabled={saving}
                              >
                                <X className="h-4 w-4" />
                                Pass
                              </button>
                              <span className={`${T_CAPTION} basis-full`}>
                                Shortlisting moves them to Screened, ready to book
                                an interview. You can undo any of these.
                              </span>
                            </div>
                          ) : (
                            <div>
                              <p className={`${T_LABEL} mb-2`}>
                                Why {pending === "hold" ? "hold" : "pass"}?
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {reasons.map((r) => (
                                  <button
                                    key={r.key}
                                    className={SMALL_BUTTON}
                                    disabled={saving || (r.key === "other" && !note.trim())}
                                    onClick={() => void decide(row, pending, r.key)}
                                  >
                                    {r.label}
                                  </button>
                                ))}
                              </div>
                              <textarea
                                className={`${TEXTAREA_CLASS} mt-3`}
                                rows={2}
                                placeholder="Note (required only for Other)"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                              />
                              <button
                                className={`${SMALL_BUTTON} mt-2`}
                                onClick={() => { setPending(null); setNote(""); }}
                                disabled={saving}
                              >
                                Back
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {row.decision && (
                        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/8 pt-4">
                          <span className={T_BODY}>
                            {row.decision}
                            {row.decision_reason ? ` — ${row.decision_reason.replace(/_/g, " ")}` : ""}
                            {row.decided_by ? ` · ${row.decided_by}` : ""}
                          </span>
                          {canDecide && (
                            <button
                              className={`${SMALL_BUTTON} flex items-center gap-1.5`}
                              onClick={() => void undo(row)}
                              disabled={saving}
                            >
                              <Undo2 className="h-3.5 w-3.5" />
                              Undo
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
