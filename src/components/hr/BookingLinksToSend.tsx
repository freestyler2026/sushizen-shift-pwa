"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link2, Send, Copy, Check, Clock, RefreshCw, Phone } from "lucide-react";
import {
  GLASS_CARD, PRIMARY_BUTTON, SMALL_BUTTON, BADGE_INFO, BADGE_SUCCESS,
  BADGE_WARNING, T_CAPTION, T_LABEL, T_SECTION,
} from "@/lib/ui-tokens";

/**
 * Who has passed the voice round and still has no way to book an interview.
 *
 * The link used to be issued in one place only: the instant somebody pressed
 * "Shortlist" in the voice queue. The decision buttons stop rendering once a
 * decision exists, and the panel holding the link is component state, so a
 * reload threw it away. That left sixteen shortlisted candidates with no screen
 * anywhere that could produce their link -- the only route back was to undo the
 * decision and shortlist them again, which rewrites the record of the decision.
 *
 * The endpoint behind this list was written for exactly this and then never
 * called from anywhere.
 *
 * Two groups, not one. "Needs a link" is the work; "has a link, not booked" is
 * what you are waiting on. Keeping them in one count means the number never
 * falls and stops meaning anything.
 *
 * It holds anyone at Screened, not only the voice round's shortlist. Being read
 * by a person is the same qualification -- MICHAEL A. BRAGAT was screened by
 * Peter on the day he applied and had no screening row, so an INNER JOIN on the
 * voice table left him out of the one list that could reach him.
 */

type Row = {
  id: string;
  full_name: string;
  phone: string | null;
  position_applied: string | null;
  decision: string;
  booking_invited_at: string | null;
  link_live: boolean;
  contact_via: string;
  copied_at: string | null;
  copied_by: string | null;
  /** When the applicant first opened the newest link. The only evidence from
   *  this side that the message actually arrived -- "sent" is a button we
   *  press after pasting, and on 2026-09-16 one row read sent while nothing
   *  had reached the applicant's phone. */
  link_opened_at: string | null;
};

type Invite = {
  token: string;
  url: string;
  full_name: string;
  phone: string;
  expires_days: number;
  contact_via: string;
  language: string;
  messages: { en: string; tl: string };
};

function reachWord(via: string): string {
  return via === "call" ? "phone call" : via;
}

export default function BookingLinksToSend({
  focusApplicantId = "",
  onFocusHandled,
  onlyApplicantId = "",
  autoOpen = false,
  compact = false,
}: {
  /** Sent here by the board's "Send interview link" button. The row is pulled
   *  to the top and marked, so nobody has to find the name again. */
  focusApplicantId?: string;
  onFocusHandled?: () => void;
  /** Show this one person only. The board opens the same panel over the card
   *  instead of sending somebody to another tab to find the name again — and
   *  it is this component, not a second copy of it, so the re-issue warning,
   *  the copy trace and the SMS gate all come with it. */
  onlyApplicantId?: string;
  /** Make the link straight away so the wording is on screen in one press.
   *  Only ever fires for somebody who has no live link: issuing replaces the
   *  token, and doing that unasked would kill a link already in their hands. */
  autoOpen?: boolean;
  /** Drop the list's own heading and bulk button when it is inside a dialog. */
  compact?: boolean;
} = {}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // Which person's link panel is open, and the link itself.
  const [openFor, setOpenFor] = useState<string>("");
  const [invite, setInvite] = useState<Invite | null>(null);
  // 発行済みの文面。**再発行すると相手の手元のリンクが死ぬ**ので、一度受け取った
  // ものは持っておき、開き直すだけなら作り直さない。
  const [issued, setIssued] = useState<Record<string, Invite>>({});
  const [bulking, setBulking] = useState(false);
  const [bulkNote, setBulkNote] = useState("");
  const [lang, setLang] = useState<"en" | "tl">("en");
  const [copied, setCopied] = useState("");
  // Whether anything has been copied out of the panel that is open now. Reset
  // every time a panel opens, so yesterday's copy cannot mark today's as sent.
  const [copiedOnce, setCopiedOnce] = useState(false);
  const [smsNote, setSmsNote] = useState("");

  // Whether "Send by SMS" is offered at all, and when it is not, why -- a
  // disabled button with no reason reads as the screen being broken.
  const [smsGate, setSmsGate] = useState<{ enabled: boolean; blocked_by: string } | null>(null);

  // Made in this session. The server still lists them (it reports link_live
  // rather than hiding them), but the person working the list needs to see the
  // queue shrink as they go.
  const [justIssued, setJustIssued] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/hr/booking-invites/pending");
      if (!res.ok) {
        setErr(res.status === 401
          ? "Your session has expired — reload the page and log in again."
          : `Could not load the list (${res.status}).`);
        return;
      }
      const j = await res.json();
      setRows(Array.isArray(j.rows) ? j.rows : []);
    } catch {
      setErr("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/hr/sms/status");
        if (!res.ok) return;
        const j = await res.json();
        if (alive) {
          setSmsGate({
            enabled: !!j.enabled && !!j.configured,
            blocked_by: String(j.blocked_by || ""),
          });
        }
      } catch { /* the rest of the panel does not depend on this */ }
    })();
    return () => { alive = false; };
  }, []);

  // Let the highlight go after a while, so a later Refresh does not keep
  // marking somebody who was dealt with ten minutes ago.
  useEffect(() => {
    if (!focusApplicantId || loading) return;
    if (!rows.some((r) => r.id === focusApplicantId)) return;
    const t = setTimeout(() => onFocusHandled?.(), 20000);
    return () => clearTimeout(t);
  }, [focusApplicantId, loading, rows, onFocusHandled]);

  // Open the wording without a second press, but only for somebody with no
  // live link. createLink would otherwise POST a new token for a link that may
  // already be in the applicant's hands, and the warning that guards that is a
  // confirm() -- firing one at a dialog the person just opened is how warnings
  // get clicked through (2026-09-15: all 18 live links had been copied zero
  // times and everyone saw a warning that was untrue of their case).
  const autoTried = useRef(false);
  useEffect(() => {
    if (!autoOpen || !onlyApplicantId || loading || busy || autoTried.current) return;
    const row = rows.find((r) => r.id === onlyApplicantId);
    if (!row || row.link_live) return;
    autoTried.current = true;
    void createLink(row);
    // createLink is stable for this purpose -- it only reads state the guard
    // above has already settled, and the ref stops a second run either way.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen, onlyApplicantId, loading, busy, rows]);

  async function createLink(row: Row) {
    if (busy) return;
    // 既に受け取っている文面があるなら、そのまま開く。ここで作り直すと、
    // さっき一括で配ったリンクが本人の手元で死ぬ。
    const have = issued[row.id];
    if (have) {
      setInvite(have);
      setOpenFor(row.id);
      setLang(have.language === "tl" ? "tl" : "en");
      setSmsNote("");
      setCopied("");
      setCopiedOnce(false);
      return;
    }
    // Re-issuing replaces the token, so a link already in somebody's hands
    // stops working. Say that before it happens, not after.
    //
    // **Only when it could actually be in their hands.** The link is not sent by
    // the OS; it reaches an applicant because somebody copied the message. If
    // nobody has, the old link exists only in the database and replacing it
    // costs nothing. Asking anyway is how a warning gets clicked through: on
    // 2026-09-15 all 18 live links had been copied zero times, so every single
    // person saw a warning that was not true of their case.
    // There used to be a confirmation here, because a second link replaced the
    // first and whoever was holding it got an error. Links are rows now and
    // every unexpired one keeps working, so making another costs nothing and
    // the question would be asking about a consequence that no longer exists.
    setBusy(true);
    setErr("");
    setSmsNote("");
    setCopied("");
    setCopiedOnce(false);
    try {
      const res = await fetch(`/api/admin/hr/applicants/${row.id}/booking-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const text = await res.text();
      let j: Record<string, unknown> = {};
      try { j = JSON.parse(text); } catch { /* text/plain */ }
      if (!res.ok) {
        setErr(String(j.detail || text).slice(0, 240));
        return;
      }
      const inv = j as unknown as Invite;
      setInvite(inv);
      setOpenFor(row.id);
      setLang(inv.language === "tl" ? "tl" : "en");
      setIssued((m) => ({ ...m, [row.id]: inv }));
      setJustIssued((s) => new Set(s).add(row.id));
    } catch {
      setErr("The link could not be created.");
    } finally {
      setBusy(false);
    }
  }

  /** Every waiting link at once.
   *
   *  The messages come back with them and are kept here, so working through the
   *  list afterwards is Copy, Copy, Copy -- no second round of presses, and no
   *  re-issue, which would kill the links just handed out.
   */
  async function issueAll() {
    if (bulking || busy) return;
    const n = needLink.length;
    if (!n) return;
    if (!window.confirm(
      `Create a booking link for all ${n}? Nothing is sent — you still copy each ` +
      `message and send it yourself. Anyone who already has a live link is left alone.`)) return;
    setBulking(true);
    setBulkNote("");
    setErr("");
    try {
      const res = await fetch("/api/admin/hr/booking-invites/issue-all", { method: "POST" });
      const text = await res.text();
      let j: Record<string, unknown> = {};
      try { j = JSON.parse(text); } catch { /* text/plain */ }
      if (!res.ok) {
        setErr(String(j.detail || text).slice(0, 240));
        return;
      }
      const list = (j.issued as (Invite & { id?: string })[]) || [];
      const failed = (j.failed as { full_name?: string }[]) || [];
      const map: Record<string, Invite> = {};
      const done = new Set(justIssued);
      // **id で対応づける。** 順番で割り当てると、画面が並び替えられている
      // ときに別人のリンクを渡すことになる。
      list.forEach((inv) => {
        if (inv.id) { map[inv.id] = inv; done.add(inv.id); }
      });
      setIssued((m) => ({ ...m, ...map }));
      setJustIssued(done);
      setBulkNote(
        `${list.length} link${list.length === 1 ? "" : "s"} made. Open each row to copy` +
        ` its message — nothing has been sent.` +
        (failed.length ? ` ${failed.length} failed: ${failed.map((f) => f.full_name).join(", ")}.` : ""));
      await load();
    } catch {
      setErr("Could not create the links.");
    } finally {
      setBulking(false);
    }
  }

  async function sendSms(applicantId: string, token: string) {
    if (busy) return;
    setBusy(true);
    setSmsNote("");
    try {
      const res = await fetch(`/api/admin/hr/applicants/${applicantId}/booking-invite/sms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, lang }),
      });
      const text = await res.text();
      let j: Record<string, unknown> = {};
      try { j = JSON.parse(text); } catch { /* text/plain */ }
      if (!res.ok) {
        // A send that failed must never read as a send that worked.
        setSmsNote(`Not sent — ${String(j.detail || text).slice(0, 160)}`);
        return;
      }
      setSmsNote(`Sent to ${String(j.sent_to || "")}.`);
    } catch {
      setSmsNote("Not sent — could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  /** Copy, and leave a trace that it was taken.
   *
   *  There is no "Mark as sent" button on purpose. It would be one more tap
   *  after the work is done, so it would not get pressed, and a record nobody
   *  writes is no record. Copying is what the person actually does before
   *  leaving for Viber, so that is the moment worth keeping.
   *
   *  2026-09-15, the owner's call: copying the message is sending, and every
   *  screen says so. Strictly the two differ, but the OS has no way to check
   *  and a third state ("we are not sure") leaves both piles unworked. Do not
   *  put the old wording back on one screen only -- the board reads the same
   *  event and would then disagree with this one about the same person.
   */
  async function copy(text: string, what: string, applicantId: string) {
    // The clipboard call goes first and is not awaited behind anything else:
    // it only works while the browser still counts this as the user's click.
    let clipboardWorked = true;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      // Blocked outside a secure context, or the permission was refused.
      clipboardWorked = false;
      setErr("Could not copy. Select the text above and copy it by hand.");
    }

    // Recorded either way. When the clipboard is refused the person selects the
    // text and copies it themselves -- they have still taken it away, and that
    // is the whole point of the marker. Only recording the successful path
    // would leave exactly those people invisible, which is the failure this
    // marker exists to prevent.
    try {
      await fetch(`/api/admin/hr/applicants/${applicantId}/booking-invite/copied`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ what: clipboardWorked ? what : `${what} (by hand)`, lang }),
      });
      setRows((rs) => rs.map((r) => r.id === applicantId
        ? { ...r, copied_at: new Date().toISOString(), copied_by: "you" }
        : r));
      setCopiedOnce(true);
    } catch { /* the trace is a convenience, the copy is the job */ }
  }

  /** Close the panel, and when the wording was copied out of it first, record
   *  that it went out. Nothing is sent from here -- this is the person telling
   *  the OS that they have sent it. */
  async function finishSend(applicantId: string) {
    const close = () => {
      setInvite(null); setOpenFor(""); setSmsNote(""); setCopied(""); setCopiedOnce(false);
    };
    if (!copiedOnce) { close(); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/hr/applicants/${applicantId}/booking-invite/sent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ how: "copied the message and sent it" }),
      });
      // ⚠️ Do not close on a failure. The first version swallowed it, and the
      // panel closing looked exactly like it had worked -- a mark that did not
      // land, on a row that then reads "not sent", with nobody any the wiser
      // (lesson 46). Caught in testing when a deploy restart 500'd this call
      // and the screen said nothing at all.
      if (!res.ok) {
        setErr("Marked nothing — the send was not recorded. Press Done again.");
        return;
      }
      close();
      await load();
    } catch {
      setErr("Marked nothing — could not reach the server. Press Done again.");
    } finally {
      setBusy(false);
    }
  }

  // The board sends somebody here by name. Put them first and mark the row --
  // arriving at a list of fifteen and having to find the name again is the
  // reason the board grew its own (wrong) button in the first place.
  const focusFirst = (list: Row[]) =>
    focusApplicantId
      ? [...list].sort((a, b) =>
          (b.id === focusApplicantId ? 1 : 0) - (a.id === focusApplicantId ? 1 : 0))
      : list;

  const visible = onlyApplicantId ? rows.filter((r) => r.id === onlyApplicantId) : rows;
  const needLink = focusFirst(visible.filter((r) => !r.link_live && !justIssued.has(r.id)));
  const waiting = focusFirst(visible.filter((r) => r.link_live || justIssued.has(r.id)));

  /** One candidate.
   *
   *  `sent` means a link exists, and the badge says "link made" rather than
   *  "link sent" on purpose: issue_invite writes the token and sends nothing.
   *  Whether it reached the candidate depends on somebody pressing send, and
   *  over Viber it leaves no record at all. Calling it "sent" would repeat the
   *  voice queue's "Invited" bucket, where sixty of sixty-one rows were never
   *  invited by anyone.
   */
  function line(row: Row, sent: boolean) {
    const open = openFor === row.id && invite;
    return (
      <div
        key={row.id}
        className={`border-t border-white/8 first:border-t-0 ${
          row.id === focusApplicantId ? "bg-violet-500/10 ring-1 ring-inset ring-violet-400/40" : ""
        }`}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
          <span className="text-sm font-medium text-zinc-100">{row.full_name}</span>
          {row.position_applied && (
            <span className={T_CAPTION}>{row.position_applied}</span>
          )}
          {row.phone && (
            <span className={`${T_CAPTION} flex items-center gap-1`}>
              <Phone className="h-3 w-3" />{row.phone}
            </span>
          )}
          <span className={BADGE_INFO}>{reachWord(row.contact_via)}</span>
          {sent && (
            <span className={BADGE_SUCCESS}>
              link made{row.booking_invited_at ? ` ${row.booking_invited_at.slice(0, 10)}` : ""}
            </span>
          )}
          {row.copied_at && (
            <span className={BADGE_SUCCESS} title="The message was taken away to be sent. The board counts this as sent.">
              ✓ sent by {row.copied_by || "someone"}
              {row.copied_at.length > 15 ? ` ${row.copied_at.slice(11, 16)}` : ""}
            </span>
          )}
          {/* Sent is what we did; opened is what happened. A row that says
              sent and has never been opened is the one worth a second look --
              it is how a message that never left the phone looks from here. */}
          {row.link_opened_at ? (
            <span className={BADGE_SUCCESS} title="They opened the link.">
              opened {row.link_opened_at.slice(0, 10)}
              {row.link_opened_at.length > 15 ? ` ${row.link_opened_at.slice(11, 16)}` : ""}
            </span>
          ) : row.copied_at ? (
            <span
              className={BADGE_WARNING}
              title="Marked sent, but the link has never been opened. Check the message actually went out."
            >
              not opened yet
            </span>
          ) : null}
          <span className="ml-auto">
            <button
              className={sent ? SMALL_BUTTON : PRIMARY_BUTTON}
              disabled={busy}
              onClick={() => void createLink(row)}
            >
              <span className="flex items-center gap-1.5">
                {issued[row.id]
                  ? <Copy className="h-4 w-4" />
                  : sent ? <RefreshCw className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                {issued[row.id]
                  ? "Open message"
                  /* "New link" only when there is a link somebody could be
                     holding. A live link nobody ever copied is in no one's
                     hands, so making the wording costs nothing and should not
                     be dressed up as a replacement. */
                  : sent ? (row.copied_at ? "New link" : "Make the message")
                  : "Create link"}
              </span>
            </button>
          </span>
        </div>

        {open && invite && (
          <div className="border-t border-white/8 bg-emerald-500/8 px-4 py-3">
            <p className="text-sm text-emerald-200">
              Send {invite.full_name.split(" ")[0]} this link and they pick their own
              interview time — you do not set a date.
            </p>
            <p className={`${T_CAPTION} mt-1`}>
              Works for {invite.expires_days} days.{" "}
              {invite.contact_via === "call"
                ? "They did not name an app, so the interview will be a phone call."
                : `They asked to be reached on ${invite.contact_via}, and the interviewer will see that.`}
            </p>
            <div className="mt-2 flex items-center gap-2">
              {(["en", "tl"] as const).map((l) => (
                <button
                  key={l}
                  className={lang === l ? BADGE_INFO : SMALL_BUTTON}
                  onClick={() => setLang(l)}
                >
                  {l === "en" ? "English" : "Tagalog"}
                </button>
              ))}
              {invite.phone && <span className={T_CAPTION}>{invite.phone}</span>}
            </div>
            <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-xs text-zinc-200">
{invite.messages[lang]}
            </pre>
            <div className="mt-2 flex flex-wrap gap-2">
              {smsGate?.enabled && (
                <button
                  className={PRIMARY_BUTTON}
                  disabled={busy}
                  onClick={() => void sendSms(row.id, invite.token)}
                >
                  <span className="flex items-center gap-1.5">
                    <Send className="h-4 w-4" />
                    Send by SMS{invite.phone ? ` to ${invite.phone}` : ""}
                  </span>
                </button>
              )}
              <button
                className={smsGate?.enabled ? SMALL_BUTTON : PRIMARY_BUTTON}
                onClick={() => void copy(invite.messages[lang], "message", row.id)}
              >
                <span className="flex items-center gap-1.5">
                  {copied === "message" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied === "message" ? "Copied" : "Copy message"}
                </span>
              </button>
              <button className={SMALL_BUTTON} onClick={() => void copy(invite.url, "link", row.id)}>
                {copied === "link" ? "Copied" : "Copy link only"}
              </button>
              {/* Done is the end of the job, not just a way to close a panel:
                  copy the wording, leave, send it, come back, press Done. That
                  press already happens, so the record costs no extra tap --
                  and a button that exists only to log something is a button
                  nobody presses (design note 1).

                  It only counts as sent when something was copied first.
                  Opening the panel and closing it again has sent nothing, and
                  marking that as sent would put people out of the queue who
                  never heard from us. */}
              <button
                className={copiedOnce ? PRIMARY_BUTTON : SMALL_BUTTON}
                disabled={busy}
                onClick={() => void finishSend(row.id)}
              >
                {copiedOnce ? "Done — sent" : "Close"}
              </button>
            </div>
            {smsNote && (
              <p className={`${T_CAPTION} mt-2 ${smsNote.startsWith("Sent") ? "text-emerald-300" : "text-amber-300"}`}>
                {smsNote}
              </p>
            )}
            {smsGate && !smsGate.enabled && smsGate.blocked_by && (
              <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
                {/* The instructions live here rather than in the manual, because
                    this is the moment somebody needs them: they have just
                    copied the wording and are about to leave the OS. A button
                    would not help -- on a desktop there is no Viber app behind
                    a viber:// link to open. */}
                <p className={`${T_CAPTION} text-amber-300`}>
                  The OS cannot text this itself yet — {smsGate.blocked_by}. Send it
                  yourself; it costs nothing.
                </p>
                <p className={`${T_LABEL} mt-2`}>From Viber on this PC</p>
                <ol className={`${T_CAPTION} mt-1 list-decimal space-y-0.5 pl-4`}>
                  <li>Press <b>Copy message</b> above — it copies the language showing now.</li>
                  <li>Open Viber on this computer.</li>
                  <li>
                    Search{invite.phone ? ` ${invite.phone}` : " their number"} in the box at the top.
                  </li>
                  <li>Their chat opens → click the message box → <b>Ctrl+V</b> → <b>Enter</b>.</li>
                  <li>
                    No result? They are not on Viber — send it as a normal text from a phone.
                  </li>
                </ol>
                <p className={`${T_LABEL} mt-2`}>From your own phone</p>
                <p className={`${T_CAPTION} mt-1`}>
                  Open this page on your phone, <b>Copy message</b>, then paste it into
                  {invite.contact_via === "call" ? " a text message" : ` ${invite.contact_via}`}.
                </p>
                <p className={`${T_CAPTION} mt-2`}>
                  Paste the link whole — retyping or shortening it stops it working.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={compact ? "overflow-hidden" : `${GLASS_CARD} mb-6 overflow-hidden`}>
      {!compact && (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
        <h3 className={T_SECTION}>Waiting for a booking link</h3>
        <span className={needLink.length ? BADGE_WARNING : BADGE_SUCCESS}>
          {needLink.length}
        </span>
        {waiting.length > 0 && (
          <span className={`${T_CAPTION} flex items-center gap-1`}>
            <Clock className="h-3 w-3" />
            {waiting.length} with a link, not booked yet
          </span>
        )}
        {needLink.length > 1 && (
          <button
            className={`${PRIMARY_BUTTON} ml-auto`}
            onClick={() => void issueAll()}
            disabled={bulking || busy || loading}
          >
            <span className="flex items-center gap-1.5">
              <Link2 className="h-4 w-4" />
              {bulking ? "Making links…" : `Create all ${needLink.length} links`}
            </span>
          </button>
        )}
        <button
          className={`${SMALL_BUTTON} ${needLink.length > 1 ? "" : "ml-auto"}`}
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      )}

      {bulkNote && !compact && (
        <p className="px-4 pb-2 text-sm text-emerald-300">{bulkNote}</p>
      )}

      {!compact && (
      <p className={`${T_CAPTION} -mt-1 px-4 pb-3`}>
        Everyone who has been screened — by the voice round or by a person — and has
        no interview booked. They leave this list when they pick a time.
      </p>
      )}

      {err && <p className="px-4 pb-3 text-sm text-amber-300">{err}</p>}

      {loading && compact && (
        <p className={`${T_CAPTION} px-4 py-4`}>Making the link…</p>
      )}

      {/* Only when the list actually loaded. A failed fetch leaves rows empty
          too, and saying "nobody is waiting" because the server did not answer
          is the worst thing this panel can say -- it reports work as done when
          it could not see the work at all. */}
      {!loading && !err && visible.length === 0 && (
        <p className={`${T_CAPTION} ${compact ? "" : "border-t border-white/8"} px-4 py-4`}>
          {onlyApplicantId
            ? "This person is no longer waiting for a link — they have booked a time, or their status moved off Screened."
            : "Nobody is waiting. Anyone you move to Screened — from the Voice screening tab or from the board — appears here."}
        </p>
      )}

      {needLink.length > 0 && (
        <div className="border-t border-white/8">{needLink.map((r) => line(r, false))}</div>
      )}

      {waiting.length > 0 && (
        <>
          <p className={`${T_LABEL} border-t border-white/8 px-4 pt-3`}>
            Link made — waiting for them to pick a time
          </p>
          <div>{waiting.map((r) => line(r, true))}</div>
        </>
      )}
    </div>
  );
}
