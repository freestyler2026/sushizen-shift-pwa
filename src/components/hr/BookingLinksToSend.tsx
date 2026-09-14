"use client";

import { useCallback, useEffect, useState } from "react";
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

export default function BookingLinksToSend() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // Which person's link panel is open, and the link itself.
  const [openFor, setOpenFor] = useState<string>("");
  const [invite, setInvite] = useState<Invite | null>(null);
  const [lang, setLang] = useState<"en" | "tl">("en");
  const [copied, setCopied] = useState("");
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
        setErr(`Could not load the list (${res.status}).`);
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

  async function createLink(row: Row) {
    if (busy) return;
    // Re-issuing replaces the token, so a link already in somebody's hands
    // stops working. Say that before it happens, not after.
    if (row.link_live && !justIssued.has(row.id)) {
      const ok = window.confirm(
        `${row.full_name} already has a working link. Making a new one stops the ` +
        `old one from opening — if they have it on their phone, it will fail. Continue?`,
      );
      if (!ok) return;
    }
    setBusy(true);
    setErr("");
    setSmsNote("");
    setCopied("");
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
      setJustIssued((s) => new Set(s).add(row.id));
    } catch {
      setErr("The link could not be created.");
    } finally {
      setBusy(false);
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

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      setErr("Could not copy. Select the text and copy it by hand.");
    }
  }

  const needLink = rows.filter((r) => !r.link_live && !justIssued.has(r.id));
  const waiting = rows.filter((r) => r.link_live || justIssued.has(r.id));

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
      <div key={row.id} className="border-t border-white/8 first:border-t-0">
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
          <span className="ml-auto">
            <button
              className={sent ? SMALL_BUTTON : PRIMARY_BUTTON}
              disabled={busy}
              onClick={() => void createLink(row)}
            >
              <span className="flex items-center gap-1.5">
                {sent ? <RefreshCw className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                {sent ? "New link" : "Create link"}
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
                onClick={() => void copy(invite.messages[lang], "msg")}
              >
                <span className="flex items-center gap-1.5">
                  {copied === "msg" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied === "msg" ? "Copied" : "Copy message"}
                </span>
              </button>
              <button className={SMALL_BUTTON} onClick={() => void copy(invite.url, "link")}>
                {copied === "link" ? "Copied" : "Copy link only"}
              </button>
              <button
                className={SMALL_BUTTON}
                onClick={() => { setInvite(null); setOpenFor(""); setSmsNote(""); setCopied(""); }}
              >
                Done
              </button>
            </div>
            {smsNote && (
              <p className={`${T_CAPTION} mt-2 ${smsNote.startsWith("Sent") ? "text-emerald-300" : "text-amber-300"}`}>
                {smsNote}
              </p>
            )}
            {smsGate && !smsGate.enabled && smsGate.blocked_by && (
              <p className={`${T_CAPTION} mt-2`}>
                The OS cannot text this itself yet — {smsGate.blocked_by}. Until then,
                copy the message and send it where they asked.
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`${GLASS_CARD} mb-6 overflow-hidden`}>
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
        <button className={`${SMALL_BUTTON} ml-auto`} onClick={() => void load()} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <p className={`${T_CAPTION} -mt-1 px-4 pb-3`}>
        Everyone shortlisted in the voice round who has not been interviewed and has
        no interview booked. They leave this list when they pick a time.
      </p>

      {err && <p className="px-4 pb-3 text-sm text-amber-300">{err}</p>}

      {!loading && rows.length === 0 && (
        <p className={`${T_CAPTION} border-t border-white/8 px-4 py-4`}>
          Nobody is waiting. Shortlisting someone in the Voice screening tab puts
          them here.
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
