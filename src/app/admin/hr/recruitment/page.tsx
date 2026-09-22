"use client";

import { isoToday } from "@/lib/date";
import { facebookLink } from "@/lib/facebook";
import { reasonLabel, isNoShow, LAPSE_REASONS, LAPSE_ONLY } from "@/lib/hr-outcome";
import { cvStateOf, openedSinceAsk } from "@/lib/cv-request";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Plus, ChevronRight, ChevronLeft, RefreshCw, Star, Calendar, ClipboardList, FileText, Undo2, Link2, ArrowRight } from "lucide-react";
import ModalScrim from "@/components/ModalScrim";
import { getAuth, refreshAuthFromApi, getAuthHeaders, getUploadHeaders, clearAuth, hasRouteAccess } from "@/lib/auth";
import { prepareIfImage } from "@/lib/image-compress";
import { API_BASE } from "@/lib/api";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SMALL_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  TEXTAREA_CLASS,
  TAB_CONTAINER,
  TAB_ACTIVE,
  TAB_INACTIVE,
  T_PAGE_TITLE,
  T_SECTION,
  T_CARD_TITLE,
  T_LABEL,
  T_BODY,
  T_CAPTION,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_ERROR,
  BADGE_INFO,
  BADGE_ACCENT,
  TABLE_ROW,
  TABLE_HEADER,
} from "@/lib/ui-tokens";
import SelectDark from "@/components/SelectDark";
import VoiceScreeningQueue from "@/components/hr/VoiceScreeningQueue";
import InterviewDay from "@/components/hr/InterviewDay";
import BookingLinksToSend from "@/components/hr/BookingLinksToSend";
import InterviewCalendar from "@/components/hr/InterviewCalendar";

// ─── Types ───────────────────────────────────────────────────────────────────

type KanbanStatus =
  | "new"
  | "screened"
  | "scheduled"
  | "interviewed"
  | "offer_sent"
  | "hired"
  | "rejected";

type Applicant = {
  id: string;
  city: string;
  requisition_id: string | null;
  full_name: string;
  position_applied: string;
  phone: string;
  email: string;
  source: string;
  referrer_name: string;
  status: KanbanStatus;
  rejection_reason: string;
  notes: string;
  applied_date: string;
  days_in_pipeline: number;
  assigned_branch?: string;
  latest_score?: number;
  latest_recommendation?: string;
  latest_outcome_reason?: string;
  /** Days since anything happened to them, as opposed to days since they
   *  applied. Someone interviewed yesterday who applied six weeks ago is not
   *  stalled; the two numbers say different things. */
  days_since_move?: number;
  never_moved?: boolean;
  prior_applications?: number;
  prior_last_applied?: string | null;
  /** Duplicates folded into this person. Same phone, same application done
   *  over -- the rows still exist, they are just out of the queue. Shown so
   *  the undo sits in the same place as the thing it undoes (lesson 22). */
  merged_count?: number;
  /** The booking link, and how far it actually got.
   *
   *  Three different situations wore one button. Measured 2026-09-15 across the
   *  43 on Screened: 19 had no link, 24 had a live one, and the message had been
   *  copied for 1. Those 22 in the middle looked exactly like the ones that had
   *  been sent, and nothing had reached them.
   *
   *  `booking_copied_at` is the honest end of it. The OS never sends the
   *  message -- somebody copies it into Viber or SMS -- so copying is the last
   *  moment it can see, and it is not the same as sending. */
  /** Whether the offer letter's figures are on file. A yes or no — the board
   *  never carries the amounts, and this list is not behind the salary
   *  boundary. */
  offer_recorded?: boolean;
  offer_sent_at?: string | null;
  booking_invited_at?: string | null;
  booking_token_expires_at?: string | null;
  booking_sent_at?: string | null;
  booking_sent_by?: string | null;
  /** 'booking_copied' when a person took the wording away, 'booking_sent' when
   *  the OS itself got a text out. Both count as sent. */
  booking_sent_how?: string | null;
  /** Where the resume is. The file itself is never in this payload -- only
   *  which screening holds it, so the panel can offer to open that one
   *  (lesson 29). Null means none on file. */
  resume_screening_id?: number | null;
  resume_filename?: string;
  /** Whether anybody has asked this person for a CV. `cv_link_made_at` is the
   *  link being built, which is not the same as the message going out --
   *  measured 2026-09-16, eight of the nine people with no CV had a link and
   *  none of them had a send on record, because Done used to only close the
   *  dialog. `cv_asked_how` is 'cv_copied' (the wording left the page) or
   *  'cv_sent' (a person said they sent it). */
  cv_asked_at?: string | null;
  /** When the CV actually landed. The board knew a CV existed but not when,
   *  so the card fell silent at the one moment there was news to report. */
  cv_received_at?: string | null;
  cv_asked_by?: string | null;
  cv_asked_how?: string | null;
  cv_link_made_at?: string | null;
  cv_link_live?: boolean | null;
  /** Last time the applicant opened their link -- something the server saw,
   *  unlike the send, which is somebody's account of it. Recorded from
   *  2026-09-16 only, so absence means "no open on record", never "they did
   *  not open it". */
  link_opened_at?: string | null;
  resume_bytes?: number;
  /** What they typed on the application form. All of it has been stored since
   *  the form went up and all of it reaches this payload -- none of it was on
   *  the screen where somebody decides. Fill rates across the 84 form
   *  applications on 2026-09-15: employer and position 100%, experience 100%,
   *  start date 89%, home area 86%, how long 78%, Facebook 39%. */
  last_employer?: string | null;
  last_position?: string | null;
  last_duration?: string | null;
  home_area?: string | null;
  experience_level?: string | null;
  available_from?: string | null;
  contact_apps?: string[] | null;
  facebook_url?: string | null;
  form_language?: string | null;
};

/** The wording the applicant saw, so the answer is read against the question
 *  that produced it rather than a label invented here. */
const EXPERIENCE_LABEL: Record<string, string> = {
  none: "None",
  under_1y: "Less than 1 year",
  "1_3y": "1 to 3 years",
  over_3y: "More than 3 years",
};

/** After this long with nothing happening, an open application is not being
 *  worked on -- it is waiting for somebody to decide. Measured 2026-09-07:
 *  63 of 152 were past it, 45 of them sitting at "interviewed". */
const STALE_DAYS = 14;

type Lane = "active" | "decide" | "closed";

/** Which of the three screens a person belongs on.
 *
 *  Splitting on the decision rather than on the status: "interviewed" holds
 *  both somebody seen yesterday and somebody nobody has touched for 45 days,
 *  and putting them in one column is what made the board unreadable.
 */
function laneOf(a: Applicant): Lane {
  if (a.status === "hired" || a.status === "rejected") return "closed";
  const idle = a.days_since_move ?? a.days_in_pipeline ?? 0;
  return idle > STALE_DAYS ? "decide" : "active";
}

const LANE_LABEL: Record<Lane, string> = {
  active: "Working on",
  // Named for what has to happen, not for how the pile looks. A screen called
  // "stalled" invites you to look at it; one called "needs a decision" tells
  // you the row is only leaving when somebody decides something.
  decide: "Needs a decision",
  closed: "Closed",
};

/** The two points where a decision is actually made. Past these, moving someone
 *  on without saying why is what left 55 candidates undecided for up to 49 days. */
/** The resume is served one file at a time from the screening that holds it.
 *  Relative path on purpose: the httpOnly cookie only reaches the Vercel
 *  domain, and the proxy is what turns it into a Bearer header (lesson 13). */
function resumeHref(screeningId: number): string {
  return `/api/admin/hr/voice-screenings/${screeningId}/resume`;
}

function isImageName(name: string): boolean {
  return /\.(jpe?g|png|gif|webp|heic)$/i.test(name.trim());
}

/** The stage before this one, so a move made by mistake has a way back.
 *  The board's one-tap button only ever moves forward, and until now the only
 *  route back was a dropdown two clicks inside a panel nobody had opened. */
function getPrevStatus(status: KanbanStatus): KanbanStatus | null {
  const order: KanbanStatus[] = ["new", "screened", "scheduled", "interviewed", "offer_sent"];
  const i = order.indexOf(status);
  return i > 0 ? order[i - 1] : null;
}

/** Readable size for a resume. A filename on its own does not say whether the
 *  thing is a real CV or a screenshot of one. */
function fileSize(bytes: number): string {
  if (!bytes) return "";
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

function needsOutcome(status: KanbanStatus) {
  return status === "scheduled" || status === "interviewed";
}

type Requisition = {
  id: string;
  city: string;
  branch: string;
  position: string;
  reason: string;
  resigned_staff_name: string;
  target_start_date: string;
  priority: string;
  status: string;
  requested_by: string;
  notes: string;
  created_at: string;
  openings?: number;
  candidate_count?: number;
  filled_count?: number;
  offer_count?: number;
  interviewed_count?: number;
  remaining?: number;
  days_to_target?: number | null;
};

type InterviewSchedule = {
  id: string;
  applicant_id: string;
  interview_date: string;
  interview_time: string;
  location: string;
  interviewer: string;
  interview_type: string;
  status: string;
  notes: string;
};

type Evaluation = {
  id: string;
  applicant_id: string;
  schedule_id: string | null;
  interviewer: string;
  score_communication: number;
  score_experience: number;
  score_attitude: number;
  score_availability: number;
  total_score: number;
  recommendation: string;
  strengths: string;
  areas_for_improvement: string;
  notes: string;
  created_at: string;
};

// ─── Kanban columns ──────────────────────────────────────────────────────────

/** What the offer letter says.
 *
 *  Both cities' allowance lines live on one row; a city only ever fills its
 *  own. Manila's four are the BIR de minimis benefits, which are tax-free up
 *  to a monthly cap — the caps are printed beside the fields because an offer
 *  written above them costs the employee tax nobody intended. */
type Offer = {
  applicant_id: string;
  city: string;
  position: string;
  branch_code: string;
  employment_type: string;
  start_date: string | null;
  currency: string;
  basic_monthly: string | number;
  allow_rice: string | number;
  allow_clothing: string | number;
  allow_laundry: string | number;
  allow_medical: string | number;
  allow_accommodation: string | number;
  allow_transport: string | number;
  allow_other: string | number;
  notes: string;
  sent_at: string | null;
  sent_by: string;
  applied_to_payroll_at: string | null;
  applied_to_payroll_by: string;
};

const ALLOWANCE_KEYS = [
  "rice", "clothing", "laundry", "medical",
  "accommodation", "transport", "other",
] as const;
type AllowanceKey = (typeof ALLOWANCE_KEYS)[number];

type OfferForm = {
  position: string; branch_code: string; employment_type: string;
  start_date: string; basic_monthly: string; notes: string;
} & Record<AllowanceKey, string>;

const BLANK_OFFER: OfferForm = {
  position: "", branch_code: "", employment_type: "", start_date: "",
  basic_monthly: "", notes: "",
  rice: "", clothing: "", laundry: "", medical: "",
  accommodation: "", transport: "", other: "",
};

const MANILA_ALLOWANCES: { key: AllowanceKey; label: string; cap?: string }[] = [
  { key: "rice",     label: "Rice allowance",     cap: "₱2,000" },
  { key: "clothing", label: "Clothing allowance", cap: "₱500" },
  { key: "laundry",  label: "Laundry allowance",  cap: "₱300" },
  { key: "medical",  label: "Medical allowance",  cap: "₱250" },
];

const DUBAI_ALLOWANCES: { key: AllowanceKey; label: string; cap?: string }[] = [
  { key: "accommodation", label: "Accommodation" },
  { key: "transport",     label: "Transport" },
  { key: "other",         label: "Other allowances" },
];

/** A zero reads as "we agreed nothing", which is not what an empty field
 *  means. Blank stays blank so the form does not put figures in the letter. */
function money(v: string | number | null | undefined): string {
  const n = Number(v ?? 0);
  return !n ? "" : String(n);
}

function offerToForm(o: Offer): OfferForm {
  return {
    position: o.position || "",
    branch_code: o.branch_code || "",
    employment_type: o.employment_type || "",
    start_date: (o.start_date || "").slice(0, 10),
    basic_monthly: money(o.basic_monthly),
    notes: o.notes || "",
    rice: money(o.allow_rice),
    clothing: money(o.allow_clothing),
    laundry: money(o.allow_laundry),
    medical: money(o.allow_medical),
    accommodation: money(o.allow_accommodation),
    transport: money(o.allow_transport),
    other: money(o.allow_other),
  };
}

const KANBAN_COLUMNS: { id: KanbanStatus; label: string; color: string }[] = [
  { id: "new",         label: "New",               color: "border-neutral-600" },
  { id: "screened",    label: "Screened",           color: "border-blue-600" },
  { id: "scheduled",   label: "Interview Sched.",   color: "border-amber-600" },
  { id: "interviewed", label: "Interviewed",        color: "border-violet-600" },
  { id: "offer_sent",  label: "Offer Sent",         color: "border-emerald-600" },
  { id: "hired",       label: "Hired ✓",       color: "border-green-500" },
  { id: "rejected",    label: "Rejected",           color: "border-red-800" },
];

const ALL_STATUSES: KanbanStatus[] = KANBAN_COLUMNS.map((c) => c.id);

/** The board shows only the states somebody is still working. Hired and
 *  rejected are 50 of the 152 cards and nothing is ever done to them again;
 *  they belong on the Closed screen where they can be searched. */
const OPEN_COLUMNS = KANBAN_COLUMNS.filter(
  (c) => c.id !== "hired" && c.id !== "rejected");

// ─── Source badge helper ─────────────────────────────────────────────────────

function sourceBadge(source: string) {
  const s = (source || "").toLowerCase();
  if (s === "referral")
    return (
      <span className={BADGE_SUCCESS} style={{ fontSize: "10px", padding: "1px 6px" }}>
        Referral
      </span>
    );
  if (s === "jobstreet")
    return (
      <span className={BADGE_INFO} style={{ fontSize: "10px", padding: "1px 6px" }}>
        JobStreet
      </span>
    );
  if (s === "facebook")
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 border border-indigo-500/25 px-1.5 py-0.5 text-indigo-400"
        style={{ fontSize: "10px" }}
      >
        Facebook
      </span>
    );
  if (s === "walk_in")
    return (
      <span className={BADGE_WARNING} style={{ fontSize: "10px", padding: "1px 6px" }}>
        Walk-in
      </span>
    );
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-zinc-500/15 border border-zinc-500/25 px-1.5 py-0.5 text-zinc-400"
      style={{ fontSize: "10px" }}
    >
      {source || "Other"}
    </span>
  );
}

// ─── Score display helper ─────────────────────────────────────────────────────

function scoreDisplay(score?: number) {
  if (score === undefined || score === null) return null;
  const filled = Math.round((score / 20) * 5);
  const color =
    score >= 16 ? "text-emerald-400" : score >= 12 ? "text-amber-400" : "text-red-400";
  return (
    <span className={`flex items-center gap-0.5 text-xs ${color}`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className="h-3 w-3"
          fill={i < filled ? "currentColor" : "none"}
          stroke="currentColor"
        />
      ))}
      <span className="ml-1 tabular-nums">{score}/20</span>
    </span>
  );
}

// ─── Days badge helper ───────────────────────────────────────────────────────

/** How far this person's booking link got. The three are different jobs, and
 *  they were all wearing the same button. */
type LinkState = "none" | "made" | "copied" | "sent" | "expired";

function linkStateOf(a: Applicant): LinkState {
  if (!a.booking_token_expires_at) return "none";
  const t = Date.parse(a.booking_token_expires_at);
  if (Number.isFinite(t) && t <= Date.now()) return "expired";
  if (!a.booking_sent_at) return "made";
  // Copy is "taken away"; Done is "sent". People do copy and then stop, so the
  // two are not the same row of work.
  return a.booking_sent_how === "booking_sent" ? "sent" : "copied";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "15 Sep". Built by hand on purpose: toLocaleDateString follows the reader's
 *  browser, so the same card read "9月15日" on a Japanese device and something
 *  else again on a Filipino one. Every screen in this OS is English. */
function shortDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** What the button on a Screened card should say, given where the link got to.
 *  "Send interview link" on all three reads as "nothing has happened yet" for
 *  the 22 people who already have one. */
/** What still needs doing, most first. Expired sits with the untouched ones:
 *  that person cannot act either, and somebody has to issue them a new link. */
const LINK_RANK: Record<LinkState, number> = {
  none: 0,
  expired: 1,
  made: 2,
  copied: 3,
  sent: 4,
};

/** Past this, sending is not worth the message. **Not the same thing as
 *  STALE_DAYS above**, which counts days since anything last happened and
 *  decides which lane somebody lands in. This counts days since they applied,
 *  which is the number printed on the card.
 *
 *  Measured on the 48 people sitting at Screened: 46 applied within a week,
 *  then nothing at all until 53 and 64 days. Anywhere between 7 and 50 would
 *  pick out the same two, so the line can sit at 30 without flapping as new
 *  people arrive.
 *
 *  It only reveals an action -- nothing closes itself. Somebody looks at the
 *  name and decides.
 */
const TOO_OLD_TO_SEND_DAYS = 30;

const LINK_ACTION: Record<LinkState, string> = {
  none: "Send interview link",
  // Not "Open message". The wording cannot be shown again -- only the hash of
  // the token is kept -- so the panel makes a fresh link. That is free here:
  // nobody ever copied the old one, so there is nothing in anybody's hands to
  // invalidate.
  made: "Send it now",
  copied: "Open message",
  sent: "Send again",
  expired: "New link",
};

function daysBadge(days: number) {
  const cls =
    days > 30
      ? "text-red-400"
      : days > 14
      ? "text-amber-400"
      : "text-zinc-500";
  return <span className={`text-xs ${cls}`}>{days}d</span>;
}

// ─── Kanban Card ─────────────────────────────────────────────────────────────

function KanbanCard({
  applicant,
  onSelect,
  onQuickStatus,
  onRecordOutcome,
  onSendLink,
  onCloseStale,
  onAskForCv,
  onRecordOffer,
  nextStatus,
}: {
  applicant: Applicant;
  onSelect: () => void;
  onQuickStatus: (id: string, status: KanbanStatus) => void;
  onRecordOutcome: (a: Applicant) => void;
  onSendLink: (a: Applicant) => void;
  onCloseStale: (a: Applicant) => void;
  onAskForCv: (a: Applicant) => void;
  onRecordOffer: (a: Applicant) => void;
  nextStatus: KanbanStatus | null;
}) {
  return (
    <div
      className={`${GLASS_CARD} p-3 cursor-pointer hover:border-violet-500/30 transition-all duration-150`}
      onClick={onSelect}
    >
      {/* Position badge */}
      <div className="mb-1.5">
        <span
          className={BADGE_ACCENT}
          style={{ fontSize: "10px", padding: "1px 6px" }}
        >
          {applicant.position_applied || "Position N/A"}
        </span>
      </div>

      {/* Name */}
      <p className="font-semibold text-sm text-white truncate">{applicant.full_name}</p>

      {/* Source + days */}
      <div className="mt-1 flex items-center justify-between gap-1">
        {sourceBadge(applicant.source)}
        {daysBadge(applicant.days_in_pipeline)}
      </div>

      {/* Assigned branch (shown when set) */}
      {applicant.assigned_branch && (
        <p className="mt-1 text-[10px] text-emerald-400 font-medium truncate">
          📍 {applicant.assigned_branch}
        </p>
      )}

      {/* Score */}
      {applicant.latest_score !== undefined && applicant.latest_score !== null && (
        <div className="mt-1.5">{scoreDisplay(applicant.latest_score)}</div>
      )}

      {/* Decision point: say what happened rather than just moving the card */}
      {needsOutcome(applicant.status) ? (
        <div className="mt-2">
          <button
            className={`${SMALL_BUTTON} w-full text-center justify-center flex items-center gap-1`}
            onClick={(e) => {
              e.stopPropagation();
              onRecordOutcome(applicant);
            }}
          >
            <ClipboardList className="h-3 w-3" />
            {applicant.status === "scheduled" ? "Record outcome" : "Decide"}
          </button>
        </div>
      ) : (
        applicant.status === "screened" ? (
          /* An interview is not something this button can declare.
             It used to write status='scheduled', which put the card under
             Interview Sched. with no date, no schedule row and no link -- and
             worse, 'scheduled' drops the person out of the booking-link list
             and makes issue_invite refuse them, so pressing it took away the
             only route to an interview. The applicant picks their own time;
             this hands over the link that lets them, and the card moves by
             itself when they book. */
          (() => {
            const ls = linkStateOf(applicant);
            return (
              <div className="mt-2">
                {/* Say where it got to. Without this the card cannot tell
                    "nobody has done anything" from "a link exists but nobody
                    has taken the message away to send it" -- and the second is
                    the one that quietly goes nowhere. */}
                {ls === "made" && (
                  <p
                    className="mb-1.5 text-[10px] font-medium text-amber-400"
                    title="A link exists but the message has never been copied or texted, so nothing has gone out to them yet."
                  >
                    link made {shortDate(applicant.booking_invited_at)} · not sent
                  </p>
                )}
                {ls === "copied" && (
                  <p
                    className="mb-1.5 text-[10px] font-medium text-amber-400"
                    title={`The message was copied${applicant.booking_sent_by ? ` by ${applicant.booking_sent_by}` : ""} but Done was never pressed, so it is not confirmed as sent. Open it and press Done once it has gone out.`}
                  >
                    copied {shortDate(applicant.booking_sent_at)} · not confirmed
                  </p>
                )}
                {ls === "sent" && (
                  <p
                    className="mb-1.5 flex items-center gap-1 text-[10px] font-medium text-emerald-400"
                    title={
                      (applicant.booking_sent_how === "booking_sent"
                        ? "The OS texted this one."
                        : "The message was copied to be sent by hand.")
                      + (applicant.booking_sent_by ? ` By ${applicant.booking_sent_by}.` : "")
                    }
                  >
                    ✓ sent {shortDate(applicant.booking_sent_at)}
                    {applicant.booking_sent_by ? ` · ${applicant.booking_sent_by.split(" ")[0]}` : ""}
                  </p>
                )}
                {ls === "expired" && (
                  <p
                    className="mb-1.5 text-[10px] font-medium text-amber-400"
                    title="Their link no longer opens. It cannot be revived — a new one has to be issued."
                  >
                    link expired
                  </p>
                )}
                <button
                  className={`${SMALL_BUTTON} w-full text-center justify-center flex items-center gap-1`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSendLink(applicant);
                  }}
                >
                  <Link2 className="h-3 w-3" />
                  {LINK_ACTION[ls]}
                </button>
                {/* Only on the ones old enough that a message is not worth
                    sending. Kept quiet and second: closing somebody is the
                    rarer action, and the undo bar at the top of the board
                    covers it (lesson 22 -- the way back has to be on screen). */}
                {(applicant.days_in_pipeline ?? 0) >= TOO_OLD_TO_SEND_DAYS && (
                  <button
                    className="mt-1 w-full rounded-lg px-2 py-1 text-[10px] text-zinc-500 hover:bg-white/5 hover:text-zinc-300 transition-colors"
                    title={`Applied ${applicant.days_in_pipeline} days ago. Closes them as "We did not get back to them in time" and takes the card off this column. Nothing is deleted — the record stays on Closed, and Undo is at the top of the board.`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseStale(applicant);
                    }}
                  >
                    Too old — close as late
                  </button>
                )}
              </div>
            );
          })()
        ) : (
        nextStatus && (
          <div className="mt-2">
            {/* The letter has gone out, so this is the moment the agreed money
                exists and the only moment somebody still remembers it. Once the
                card moves to Hired it leaves the board, and payroll meets the
                figure again at the staff profile with nothing to check it
                against. So the gap is said on the card, not left to be found. */}
            {applicant.status === "offer_sent" && (
              applicant.offer_recorded ? (
                <button
                  className="mb-1.5 w-full rounded-lg px-2 py-1 text-left text-[10px] font-medium text-emerald-400 hover:bg-white/5 transition-colors"
                  title="The offer letter's terms are on file. Payroll fills the staff profile from them. Open it to change what was agreed."
                  onClick={(e) => { e.stopPropagation(); onRecordOffer(applicant); }}
                >
                  ✓ offer on file{applicant.offer_sent_at ? ` ${shortDate(applicant.offer_sent_at)}` : ""} · change
                </button>
              ) : (
                <button
                  className={`${SMALL_BUTTON} mb-1.5 w-full text-center justify-center flex items-center gap-1 border-amber-500/40 text-amber-300`}
                  title="Nothing about the pay has been recorded for this offer. Enter what the letter says and payroll fills the staff profile from it, so the salary is typed once."
                  onClick={(e) => { e.stopPropagation(); onRecordOffer(applicant); }}
                >
                  <ClipboardList className="h-3 w-3" />
                  Record the offer
                </button>
              )
            )}
            <button
              className={`${SMALL_BUTTON} w-full text-center justify-center flex items-center gap-1`}
              onClick={(e) => {
                e.stopPropagation();
                onQuickStatus(applicant.id, nextStatus);
              }}
            >
              <ChevronRight className="h-3 w-3" />
              {KANBAN_COLUMNS.find((c) => c.id === nextStatus)?.label}
            </button>
            {/* No CV, so there is nothing to screen on. The form requires one,
                but that only covers people who applied themselves: measured
                2026-09-15, every one of the 132 from Facebook and 9 from
                JobStreet has none, because HR typed them in and there was no
                way for them to send one. */}
            {applicant.status === "new" && (() => {
              const cs = cvStateOf(applicant);
              // Every one of these opens the same panel. What changes is what
              // the card says has already happened, because "nobody has done
              // anything" and "it went out and they have not replied" are
              // different pieces of work and were sharing one line.
              if (cs === "arrived" || cs === "on_file") {
                // Not a button. The CV is read in the panel, and the card
                // already opens it -- a button here would swallow that click
                // and offer to ask again for something already received.
                const when = applicant.cv_received_at;
                return cs === "arrived" ? (
                  <p
                    className="mt-1 flex items-center justify-center gap-1 rounded-lg bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-300"
                    title={`The CV they were asked for came in${when ? ` on ${shortDate(when)}` : ""}${applicant.resume_filename ? `: ${applicant.resume_filename}` : ""}. Open the card to read it.`}
                  >
                    <FileText className="h-3 w-3" />
                    CV arrived{when ? ` ${shortDate(when)}` : ""}
                  </p>
                ) : (
                  <p
                    className="mt-1 w-full px-2 py-1 text-center text-[10px] text-zinc-500"
                    title={`Sent with the application${when ? ` on ${shortDate(when)}` : ""}${applicant.resume_filename ? `: ${applicant.resume_filename}` : ""}. Open the card to read it.`}
                  >
                    CV on file
                  </p>
                );
              }
              // An open is the only sign of life between asking and the CV
              // landing. Without it the work has no feedback at all: twelve
              // requests had gone out and nothing on this board could say
              // whether a single one had reached anybody.
              const seen = openedSinceAsk(applicant) ? " · opened" : "";
              const label =
                cs === "sent"
                  ? `✓ CV asked ${shortDate(applicant.cv_asked_at)}${seen}`
                  : cs === "copied"
                  ? `CV asked ${shortDate(applicant.cv_asked_at)} · not confirmed${seen}`
                  : cs === "made"
                  ? `CV link made ${shortDate(applicant.cv_link_made_at)} · not sent${seen}`
                  : "No CV — ask for one";
              const tone = cs === "sent" ? "text-emerald-400/90 hover:text-emerald-300"
                                         : "text-amber-400/80 hover:text-amber-300";
              const tip =
                cs === "sent"
                  ? `They were asked for a CV${applicant.cv_asked_by ? ` by ${applicant.cv_asked_by}` : ""} and it has not arrived. `
                    + (openedSinceAsk(applicant)
                        ? `They opened the link on ${shortDate(applicant.link_opened_at)} and did not send one, so the message reached them.`
                        : "No open is on record. Opens were first recorded on 16 Sep, so for anything asked before then this says nothing either way.")
                  : cs === "copied"
                  ? `The wording was copied${applicant.cv_asked_by ? ` by ${applicant.cv_asked_by}` : ""} but nobody confirmed sending it. Open and press "I sent it" once it has gone out.`
                  : cs === "made"
                  ? "A link was built but the message was never copied or confirmed, so nothing has reached them. Open it to send."
                  : "No CV on file. Makes a link that asks for one and nothing else — they upload it and it lands on this applicant.";
              return (
                <button
                  className={`mt-1 w-full rounded-lg px-2 py-1 text-[10px] transition-colors hover:bg-white/5 ${tone}`}
                  title={tip}
                  onClick={(e) => { e.stopPropagation(); onAskForCv(applicant); }}
                >
                  {label}
                </button>
              );
            })()}
          </div>
        )
        )
      )}
    </div>
  );
}

/** Ask one applicant for their CV.
 *
 *  The same shape as the interview link: the OS makes the wording, somebody
 *  copies it and sends it from Viber or SMS themselves. Nothing is sent from
 *  here -- there is no gateway, and a button that claims to send would be the
 *  third screen this month to say "sent" about something that was not.
 *
 *  ⚠️ Opening this used to issue a link straight away, and issuing replaces
 *  `token_hash` on the screening row. So coming back to record "I already sent
 *  this" would have killed the link the applicant was holding (lesson 118).
 *  It now reads the state first and only builds a link when there isn't a live
 *  one, or when somebody asks for a new one knowing what that costs.
 */
type CvRequestState = {
  has_resume: boolean; resume_filename: string;
  link_live: boolean; link_made_at: string | null; link_made_by: string;
  link_expires_at: string | null;
  asked_at: string | null; asked_by: string; asked_how: string;
};
type CvLink = {
  url: string; phone: string; expires_days: number;
  already_has_resume?: boolean; resume_filename?: string;
  messages: { en: string; tl: string };
};

function CvRequestModal({
  applicant,
  onClose,
}: {
  applicant: Applicant;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState("");
  const [lang, setLang] = useState<"en" | "tl">("en");
  const [copied, setCopied] = useState("");
  const [marked, setMarked] = useState("");
  const [state, setState] = useState<CvRequestState | null>(null);
  const [out, setOut] = useState<CvLink | null>(null);

  const issue = useCallback(async () => {
    setBusy(true); setErr("");
    try {
      const res = await fetch(
        `/api/admin/hr/applicants/${applicant.id}/resume-request`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const text = await res.text();
      let j: Record<string, unknown> = {};
      try { j = JSON.parse(text); } catch { /* text/plain */ }
      if (!res.ok) { setErr(String(j.detail || text).slice(0, 240)); return; }
      setOut(j as unknown as CvLink);
    } catch {
      setErr("The link could not be created.");
    } finally {
      setBusy(false);
    }
  }, [applicant.id]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/hr/applicants/${applicant.id}/resume-request`,
          { cache: "no-store" });
        if (!alive) return;
        if (!res.ok) { setErr("Could not read where this request stands."); setBusy(false); return; }
        const j = (await res.json()) as CvRequestState;
        if (!alive) return;
        setState(j);
        if (applicant.form_language === "tl") setLang("tl");
        // Nobody has a working link, so there is nothing to protect -- build
        // one now and keep the common path at one tap.
        if (!j.link_live) { void issue(); } else { setBusy(false); }
      } catch {
        if (alive) { setErr("Could not read where this request stands."); setBusy(false); }
      }
    })();
    return () => { alive = false; };
  }, [applicant.id, applicant.form_language, issue]);

  /** Say out loud that the wording left this page, or that a person sent it.
   *  Failing to record must not look like failing to send, so it says so. */
  async function mark(kind: "copied" | "sent") {
    try {
      const res = await fetch(
        `/api/admin/hr/applicants/${applicant.id}/resume-request/mark`,
        { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind }) });
      if (!res.ok) { setErr("Sent, but recording it failed. The board will still say not sent."); return false; }
      setMarked(kind);
      return true;
    } catch {
      setErr("Sent, but recording it failed. The board will still say not sent.");
      return false;
    }
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      if (what === "message") void mark("copied");
    } catch {
      setErr("Could not copy. Select the text above and copy it by hand.");
    }
  }

  const asked = marked || state?.asked_how?.replace("cv_", "") || "";

  return (
    <ModalScrim className="bg-black/60">
      <div className={`${GLASS_CARD} w-full max-w-lg mx-auto my-4 p-6 space-y-3`}>
        <div className="flex items-center justify-between">
          <p className={T_SECTION}>Ask for a CV — {applicant.full_name}</p>
          <button
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {busy && <p className={T_CAPTION}>Checking…</p>}
        {err && <p className="text-sm text-amber-300">{err}</p>}

        {state?.has_resume && (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            They already sent one{state.resume_filename ? `: ${state.resume_filename}` : ""}.
            Asking again asks for it a second time.
          </p>
        )}

        {/* What the record already says. Written before the wording so that
            somebody who only came to confirm an old send can stop here. */}
        {state && (asked || state.link_made_at) && (
          <p className={`rounded-lg px-3 py-2 text-xs ${
            asked ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                  : "border border-white/10 bg-white/5 text-zinc-300"}`}>
            {asked === "sent"
              ? `Recorded as sent${state.asked_by ? ` by ${state.asked_by}` : ""}${state.asked_at ? ` on ${shortDate(state.asked_at)}` : ""}.`
              : asked === "copied"
              ? `The wording was copied${state.asked_by ? ` by ${state.asked_by}` : ""}${state.asked_at ? ` on ${shortDate(state.asked_at)}` : ""}, but nobody confirmed sending it.`
              : `A link was built ${shortDate(state.link_made_at)}${state.link_made_by ? ` by ${state.link_made_by}` : ""}, but no message has been recorded as going out.`}
          </p>
        )}

        {/* A live link exists. It cannot be shown again -- only its hash is
            kept -- so the honest options are to confirm an earlier send, or to
            replace it and pay the price of the old one dying. */}
        {!busy && state?.link_live && !out && (
          <>
            <p className={T_CAPTION}>
              Their link works until {shortDate(state.link_expires_at)}. The link
              itself cannot be shown again — only a scrambled copy is kept — so
              if they still have it, nothing needs to be re-sent.
            </p>
            <div className="flex flex-wrap gap-2">
              {asked !== "sent" && (
                <button className={PRIMARY_BUTTON} onClick={async () => {
                  if (await mark("sent")) onClose();
                }}>
                  I sent it — mark this asked
                </button>
              )}
              <button
                className={SMALL_BUTTON}
                title="Builds a new link and the one they already have stops working. Only do this if it never reached them."
                onClick={() => void issue()}
              >
                They never got it — make a new link
              </button>
              <button className={SMALL_BUTTON} onClick={onClose}>Close</button>
            </div>
          </>
        )}

        {out && (
          <>
            <p className={T_CAPTION}>
              Opens a page with one thing on it — send your CV. No questions, no
              recording. Works for {out.expires_days} days, and what they upload
              lands on this applicant.
            </p>
            <div className="flex items-center gap-2">
              {(["en", "tl"] as const).map((l) => (
                <button key={l} className={lang === l ? BADGE_INFO : SMALL_BUTTON}
                  onClick={() => setLang(l)}>
                  {l === "en" ? "English" : "Tagalog"}
                </button>
              ))}
              {out.phone && <span className={T_CAPTION}>{out.phone}</span>}
            </div>
            <pre className="whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-xs text-zinc-200">
{out.messages[lang]}
            </pre>
            <div className="flex flex-wrap gap-2">
              <button className={PRIMARY_BUTTON} onClick={() => void copy(out.messages[lang], "message")}>
                {copied === "message" ? "Copied" : "Copy message"}
              </button>
              <button className={SMALL_BUTTON} onClick={() => void copy(out.url, "link")}>
                {copied === "link" ? "Copied" : "Copy link only"}
              </button>
              {/* Done used to close and record nothing, so the board could not
                  tell an asked person from an untouched one. It now says what
                  it does. */}
              <button className={PRIMARY_BUTTON} onClick={async () => {
                if (await mark("sent")) onClose();
              }}>
                I sent it
              </button>
              <button className={SMALL_BUTTON} onClick={onClose}>Close without sending</button>
            </div>
          </>
        )}
      </div>
    </ModalScrim>
  );
}

// ─── Interview Schedule Form ──────────────────────────────────────────────────

function InterviewForm({
  applicantId,
  onBooked,
  onCancel,
}: {
  applicantId: string;
  onBooked: () => void;
  onCancel: () => void;
}) {
  /* This used to be seven free-text boxes -- date, a time typed as text,
     location, interviewer, type, status, notes -- and it wrote a row with no
     start time. Nothing reads such a row: not the interviews list, not the
     calendar, not the day-before reminder, not the interviewer. Its one real
     effect was to take the person off "Waiting for a booking link", so the
     only thing scheduling somebody did was make them uninvitable.

     Booking on their behalf now picks from the times that are actually free,
     the same list the applicant's own link offers. */
  const [slots, setSlots] = useState<{ starts_at: string; interviewer: string; branch: string; assumed: boolean }[] | null>(null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  /* The list above is where a time normally comes from. It is not every time an
     interview can be held: weekends, and hours outside the interviewer's roster,
     are missing from it by design. Those cases are real -- on 2026-09-18 we
     offered a Saturday phone call to somebody whose interview call we missed --
     and until now there was no way to enter one, so it would have been agreed on
     the phone and then never appear anywhere.

     Kept behind a link so the list stays the obvious path, and the reason is
     required: somebody is being asked to work outside their shift. */
  const [special, setSpecial] = useState(false);
  const [people, setPeople] = useState<string[]>([]);
  const [sDate, setSDate] = useState("");
  const [sTime, setSTime] = useState("");
  const [sWho, setSWho] = useState("");
  const [sReason, setSReason] = useState("");
  const [sErr, setSErr] = useState("");

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/admin/hr/interviews/open-slots?days=21&limit=60",
          { cache: "no-store" });
        if (!alive) return;
        if (!res.ok) { setErr("Could not load the open times."); return; }
        const j = await res.json();
        setSlots(j.rows || []);
      } catch {
        if (alive) setErr("Could not load the open times.");
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!special || people.length) return;
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/admin/hr/interviews/interviewers",
          { cache: "no-store" });
        if (!alive || !res.ok) return;
        const j = await res.json();
        const rows: string[] = j.rows || [];
        setPeople(rows);
        // 並び順が優先順位なので、既定は先頭。
        setSWho((w) => w || rows[0] || "");
      } catch { /* the panel still works if they type nothing; Book will say so */ }
    })();
    return () => { alive = false; };
  }, [special, people.length]);

  async function bookSpecial() {
    if (saving) return;
    if (!sDate || !sTime) { setSErr("Pick the date and the time you agreed."); return; }
    if (!sWho) { setSErr("Pick who is taking it."); return; }
    if (!sReason.trim()) { setSErr("Say in one line why it is outside the usual times."); return; }
    setSaving(true);
    setSErr("");
    try {
      const res = await fetch(`/api/admin/hr/applicants/${applicantId}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Manila wall clock -- the server reads it in the store's timezone.
          starts_at: `${sDate}T${sTime}:00`,
          interviewer: sWho,
          reason: sReason.trim(),
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        let msg = text;
        try { msg = JSON.parse(text)?.detail || text; } catch { /* text/plain */ }
        setSErr(String(msg).slice(0, 240));
        return;
      }
      onBooked();
    } catch {
      setSErr("Could not book it. Nothing changed — try again.");
    } finally {
      setSaving(false);
    }
  }

  async function take(s: { starts_at: string; interviewer: string }) {
    if (saving) return;
    setSaving(true);
    setErr("");
    try {
      const res = await fetch(`/api/admin/hr/applicants/${applicantId}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(s),
      });
      const text = await res.text();
      if (!res.ok) {
        let msg = text;
        try { msg = JSON.parse(text)?.detail || text; } catch { /* text/plain */ }
        setErr(String(msg).slice(0, 240));
        return;
      }
      onBooked();
    } catch {
      setErr("Could not book it. Nothing changed — try again.");
    } finally {
      setSaving(false);
    }
  }

  const byDay: [string, typeof slots extends null ? never : NonNullable<typeof slots>][] = [];
  for (const s of slots || []) {
    const d = new Date(s.starts_at).toLocaleDateString("en-GB", {
      timeZone: "Asia/Manila", weekday: "long", day: "numeric", month: "long",
    });
    const last = byDay[byDay.length - 1];
    if (last && last[0] === d) last[1].push(s);
    else byDay.push([d, [s]]);
  }

  return (
    <div className={`${GLASS_CARD} p-4 space-y-3`}>
      <p className={T_SECTION}>Book a time for them</p>
      <p className={T_CAPTION}>
        Only for a time agreed on the phone. Otherwise send the booking link and let
        them pick — that is the whole point of the link. The interviewer is told
        either way, and it appears on the Interviews and Calendar tabs.
      </p>
      {err && <p className="text-sm text-amber-300">{err}</p>}
      {slots === null && !err && <p className={T_CAPTION}>Loading the open times…</p>}
      {slots !== null && slots.length === 0 && (
        <p className={T_CAPTION}>
          No open times in the next three weeks. Publish the roster further out first.
        </p>
      )}
      {byDay.length > 0 && (
        <div className="max-h-72 overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-2">
          {byDay.map(([day, times]) => (
            <div key={day} className="mb-2 last:mb-0">
              <p className={`${T_CAPTION} mb-1`}>{day}</p>
              <div className="flex flex-wrap gap-1.5">
                {times.map((s) => (
                  <button
                    key={`${s.starts_at}-${s.interviewer}`}
                    disabled={saving}
                    onClick={() => void take(s)}
                    title={`${s.interviewer} · ${s.branch === "CUB" ? "Cubao" : s.branch}`}
                    className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm tabular-nums text-zinc-200 hover:bg-violet-500/20 disabled:opacity-50"
                  >
                    {new Date(s.starts_at).toLocaleTimeString("en-GB", {
                      timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit",
                    })}
                    <span className="ml-1.5 text-[11px] text-zinc-400">
                      {s.interviewer.split(" ")[0]}{s.assumed ? "*" : ""}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {!special && (
        <button
          onClick={() => { setSpecial(true); setSErr(""); }}
          className="text-left text-xs text-violet-300 underline underline-offset-2 hover:text-violet-200"
        >
          The time we agreed is not on this list
        </button>
      )}

      {special && (
        <div className="space-y-2 rounded-lg border border-amber-400/25 bg-amber-400/5 p-3">
          <p className={T_SECTION}>Outside the usual times</p>
          <p className={T_CAPTION}>
            Use this for an arrangement made by hand — a weekend phone call, or an
            hour outside the interviewer&apos;s shift. It books exactly like any other
            interview: the interviewer is told, and it shows on Interviews and
            Calendar. They are being asked to work outside their roster, so say why.
          </p>
          {sErr && <p className="text-sm text-amber-300">{sErr}</p>}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={T_LABEL}>Date</label>
              <input
                type="date"
                min={isoToday()}
                value={sDate}
                onChange={(e) => setSDate(e.target.value)}
                className={`${INPUT_CLASS} mt-1`}
              />
            </div>
            <div>
              <label className={T_LABEL}>Time (Manila)</label>
              <input
                type="time"
                value={sTime}
                onChange={(e) => setSTime(e.target.value)}
                className={`${INPUT_CLASS} mt-1`}
              />
            </div>
          </div>
          <div>
            <label className={T_LABEL}>Interviewer</label>
            <SelectDark
              value={sWho}
              onChange={setSWho}
              aria-label="Interviewer"
              options={people.map((n) => ({ value: n, label: n }))}
            />
          </div>
          <div>
            <label className={T_LABEL}>Why this time</label>
            <input
              value={sReason}
              onChange={(e) => setSReason(e.target.value)}
              placeholder="e.g. we missed her interview call, offered Saturday"
              className={`${INPUT_CLASS} mt-1`}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button className={PRIMARY_BUTTON} disabled={saving}
                    onClick={() => void bookSpecial()}>
              {saving ? "Booking…" : "Book this time"}
            </button>
            <button className={SECONDARY_BUTTON} disabled={saving}
                    onClick={() => { setSpecial(false); setSErr(""); }}>
              Back to the open times
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button className={SECONDARY_BUTTON} onClick={onCancel}>
          Close
        </button>
      </div>
    </div>
  );
}

// ─── Evaluation Form ─────────────────────────────────────────────────────────

function EvaluationForm({
  onSave,
  onCancel,
  saving,
}: {
  onSave: (data: Partial<Evaluation>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    interviewer: "",
    score_communication: 3,
    score_experience: 3,
    score_attitude: 3,
    score_availability: 3,
    recommendation: "consider",
    strengths: "",
    areas_for_improvement: "",
    notes: "",
  });
  const set = (k: string, v: string | number) => setForm((p) => ({ ...p, [k]: v }));
  const total =
    form.score_communication +
    form.score_experience +
    form.score_attitude +
    form.score_availability;

  const scoreColor =
    total >= 16 ? "text-emerald-400" : total >= 12 ? "text-amber-400" : "text-red-400";

  return (
    <div className={`${GLASS_CARD} p-4 space-y-3`}>
      <p className={T_SECTION}>Add Evaluation</p>
      <div>
        <label className={T_LABEL}>Interviewer</label>
        <input
          type="text"
          className={`${INPUT_CLASS} mt-1`}
          value={form.interviewer}
          onChange={(e) => set("interviewer", e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {(
          [
            ["score_communication", "Communication"],
            ["score_experience", "Experience"],
            ["score_attitude", "Attitude"],
            ["score_availability", "Availability"],
          ] as [string, string][]
        ).map(([key, label]) => (
          <div key={key}>
            <label className={T_LABEL}>{label}</label>
            <SelectDark
              className={`${SELECT_CLASS} mt-1`}
              value={String(form[key as keyof typeof form])}
              onChange={v => set(key, Number(v))}
              options={[1, 2, 3, 4, 5].map(n => ({ value: String(n), label: String(n) }))}
            />
          </div>
        ))}
      </div>

      <div
        className={`rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-center font-bold text-lg ${scoreColor}`}
      >
        Total: {total} / 20
      </div>

      <div>
        <label className={T_LABEL}>Recommendation</label>
        <SelectDark
          className={`${SELECT_CLASS} mt-1`}
          value={form.recommendation}
          onChange={v => set("recommendation", v)}
          options={[
            { value: "hire", label: "Hire" },
            { value: "consider", label: "Consider" },
            { value: "reject", label: "Reject" },
          ]}
        />
      </div>
      <div>
        <label className={T_LABEL}>Strengths</label>
        <textarea
          className={`${TEXTAREA_CLASS} mt-1`}
          rows={2}
          value={form.strengths}
          onChange={(e) => set("strengths", e.target.value)}
        />
      </div>
      <div>
        <label className={T_LABEL}>Areas for Improvement</label>
        <textarea
          className={`${TEXTAREA_CLASS} mt-1`}
          rows={2}
          value={form.areas_for_improvement}
          onChange={(e) => set("areas_for_improvement", e.target.value)}
        />
      </div>
      <div>
        <label className={T_LABEL}>Notes</label>
        <textarea
          className={`${TEXTAREA_CLASS} mt-1`}
          rows={2}
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </div>
      <div className="flex gap-2 pt-1">
        <button
          className={PRIMARY_BUTTON}
          disabled={saving}
          onClick={() =>
            onSave({
              ...form,
              total_score: total,
            })
          }
        >
          {saving ? "Saving..." : "Save Evaluation"}
        </button>
        <button className={SECONDARY_BUTTON} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

/** Statuses that will not move without a reason.
 *
 *  Mirrors _STATUS_NEEDS_REASON on the server, which is where it is enforced --
 *  this only decides whether to ask before sending, so the person sees chips
 *  instead of a 400. Rejected is the one on the list because 59 of the 76
 *  rejections on file have no reason at all, all of them filed through this
 *  dropdown while the caption underneath said it recorded none. */
const STATUS_NEEDS_REASON: KanbanStatus[] = ["rejected"];

const EVENT_KIND_LABEL: Record<string, string> = {
  created: "Added to the list",
  status: "Moved",
  interview_set: "Interview booked",
  outcome: "Interview result recorded",
  voice_decision: "Voice screening decision",
  invite: "Invite link issued",
};

function statusLabel(s: string): string {
  return KANBAN_COLUMNS.find((c) => c.id === s)?.label || s;
}

/** A duplicate application folded into this person. The row is not deleted --
 *  deleting it would cascade into hr_interview_evaluations and strand the
 *  voice answers, which have no foreign key (lesson 43). */
type MergedRow = {
  id: string; full_name: string; position_applied: string; source: string;
  status: string; applied_date: string; voice_status: string | null;
  answers: number; merged_at: string | null; merged_by: string | null;
};

type ApplicantEvent = {
  id: number; kind: string; from_status: string; to_status: string;
  reason: string; note: string; actor: string; origin: string; created_at: string;
};

type DetailTab = "info" | "interview" | "evaluation" | "offer";

function DetailPanel({
  applicant,
  onClose,
  onStatusChange,
  onRecordOutcome,
  onRefresh,
  reasons,
  initialTab = "info",
}: {
  applicant: Applicant;
  onClose: () => void;
  onStatusChange: (id: string, status: KanbanStatus) => void;
  onRecordOutcome: (a: Applicant) => void;
  onRefresh: () => void;
  reasons: OutcomeReason[];
  initialTab?: DetailTab;
}) {
  // Only the opening tab. The panel is keyed on it, so pressing a card's
  // "Record the offer" remounts here on Offer; the tabs then work as normal.
  const [tab, setTab] = useState<DetailTab>(initialTab);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [offerForm, setOfferForm] = useState<OfferForm>(BLANK_OFFER);
  const [offerBusy, setOfferBusy] = useState(false);
  const [offerSaved, setOfferSaved] = useState("");
  // The server says whether the figures are readable. Reading it off an empty
  // box instead would confuse "not agreed yet" with "not yours to see", and
  // saving on that guess is how an agreed salary gets wiped (lesson 67).
  const [salaryVisible, setSalaryVisible] = useState(true);
  const [interviews, setInterviews] = useState<InterviewSchedule[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [loadingInterviews, setLoadingInterviews] = useState(false);
  const [loadingEvaluations, setLoadingEvaluations] = useState(false);
  const [showInterviewForm, setShowInterviewForm] = useState(false);
  const [showEvalForm, setShowEvalForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localStatus, setLocalStatus] = useState<KanbanStatus>(applicant.status);
  const [statusChanging, setStatusChanging] = useState(false);
  // A move that needs explaining waits here until a chip is picked. Sending it
  // and letting the server refuse would show a 400 where a question belongs.
  const [pendingStatus, setPendingStatus] = useState<KanbanStatus | null>(null);
  const [events, setEvents] = useState<ApplicantEvent[]>([]);
  const [mergedRows, setMergedRows] = useState<MergedRow[]>([]);
  const [unmerging, setUnmerging] = useState("");
  const [error, setError] = useState("");
  const [assignedBranch, setAssignedBranch] = useState(applicant.assigned_branch || "");
  const [savingBranch, setSavingBranch] = useState(false);

  const handleSaveBranch = async () => {
    setSavingBranch(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/hr/applicants/${applicant.id}`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_branch: assignedBranch }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingBranch(false);
    }
  };

  const loadInterviews = useCallback(async () => {
    setLoadingInterviews(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/admin/hr/applicants/${applicant.id}/interviews`,
        { headers: getAuthHeaders(), cache: "no-store" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setInterviews(Array.isArray(data) ? data : data?.interviews || []);
    } catch {
      setInterviews([]);
    } finally {
      setLoadingInterviews(false);
    }
  }, [applicant.id]);

  const loadEvaluations = useCallback(async () => {
    setLoadingEvaluations(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/admin/hr/applicants/${applicant.id}/evaluations`,
        { headers: getAuthHeaders(), cache: "no-store" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEvaluations(Array.isArray(data) ? data : data?.evaluations || []);
    } catch {
      setEvaluations([]);
    } finally {
      setLoadingEvaluations(false);
    }
  }, [applicant.id]);

  const loadMerged = useCallback(async () => {
    try {
      const res = await fetch(
        `${API_BASE}/api/admin/hr/applicants/${applicant.id}/merged`,
        { headers: getAuthHeaders(), cache: "no-store" });
      if (!res.ok) return;
      setMergedRows(((await res.json())?.rows ?? []) as MergedRow[]);
    } catch { setMergedRows([]); }
  }, [applicant.id]);

  const loadOffer = useCallback(async () => {
    try {
      const res = await fetch(
        `${API_BASE}/api/admin/hr/applicants/${applicant.id}/offer`,
        { headers: getAuthHeaders(), cache: "no-store" });
      if (!res.ok) return;
      const d = await res.json() as { offer?: Offer | null; salary_visible?: boolean };
      const o = (d?.offer ?? null) as Offer | null;
      setOffer(o);
      setSalaryVisible(d?.salary_visible !== false);
      // The form opens on what was last sent, so a revision is an edit rather
      // than a re-type. Blank fields would invite typing the salary twice,
      // which is the thing this screen exists to stop.
      setOfferForm(o ? offerToForm(o) : {
        ...BLANK_OFFER,
        position: applicant.position_applied || "",
        branch_code: applicant.assigned_branch || "",
      });
    } catch { /* leave what is on screen */ }
  }, [applicant.id, applicant.position_applied, applicant.assigned_branch]);

  useEffect(() => {
    if (tab === "interview") void loadInterviews();
    if (tab === "evaluation") void loadEvaluations();
    if (tab === "offer") void loadOffer();
    if (tab === "info" && (applicant.merged_count ?? 0) > 0) void loadMerged();
  }, [tab, loadInterviews, loadEvaluations, loadOffer, loadMerged, applicant.merged_count]);

  const saveOffer = async () => {
    setOfferBusy(true); setError(""); setOfferSaved("");
    try {
      const res = await fetch(
        `${API_BASE}/api/admin/hr/applicants/${applicant.id}/offer`,
        {
          method: "PUT",
          headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({
            position: offerForm.position,
            branch_code: offerForm.branch_code,
            employment_type: offerForm.employment_type,
            start_date: offerForm.start_date,
            notes: offerForm.notes,
            ...(salaryVisible ? {
              basic_monthly: Number(offerForm.basic_monthly || 0),
              ...Object.fromEntries(
                ALLOWANCE_KEYS.map((k) => [k, Number(offerForm[k] || 0)])),
            } : {}),
          }),
        });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d as { detail?: string }).detail || "Could not save");
      setOffer((d as { offer: Offer }).offer);
      setOfferSaved("Saved. Payroll can fill the profile from this.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally { setOfferBusy(false); }
  };

  // Undo lives beside the thing it undoes, and the row comes back into the
  // queue immediately -- not behind a filter the reader has to know about
  // (lesson 56).
  const handleUnmerge = async (id: string) => {
    setUnmerging(id);
    try {
      const res = await fetch(
        `${API_BASE}/api/admin/hr/applicants/${id}/unmerge`,
        { method: "POST", headers: getAuthHeaders() });
      if (!res.ok) throw new Error(await res.text());
      setMergedRows((prev) => prev.filter((r) => r.id !== id));
      onRefresh();
    } catch {
      setError("Could not separate that application. Nothing was changed.");
    } finally {
      setUnmerging("");
    }
  };

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch(
        `${API_BASE}/api/admin/hr/applicants/${applicant.id}/events`,
        { headers: getAuthHeaders(), cache: "no-store" });
      if (!res.ok) return;
      setEvents(((await res.json())?.events ?? []) as ApplicantEvent[]);
    } catch { /* the history is context, not the job */ }
  }, [applicant.id]);
  useEffect(() => { void loadEvents(); }, [loadEvents]);

  const commitStatus = async (newStatus: KanbanStatus, reason = "") => {
    setStatusChanging(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/hr/applicants/${applicant.id}`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(reason ? { status: newStatus, reason } : { status: newStatus }),
      });
      if (!res.ok) {
        // The server says what is missing. Show that, not "HTTP 400".
        const text = await res.text();
        let detail = text;
        try { detail = JSON.parse(text)?.detail || text; } catch { /* text/plain */ }
        throw new Error(String(detail).slice(0, 300));
      }
      setLocalStatus(newStatus);
      setPendingStatus(null);
      onStatusChange(applicant.id, newStatus);
      void loadEvents();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStatusChanging(false);
    }
  };

  const handleStatusChange = async (newStatus: KanbanStatus) => {
    if (STATUS_NEEDS_REASON.includes(newStatus) && newStatus !== localStatus) {
      setError("");
      setPendingStatus(newStatus);
      return;
    }
    await commitStatus(newStatus);
  };

  const handleSaveEvaluation = async (data: Partial<Evaluation>) => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/hr/evaluations`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ applicant_id: applicant.id, ...data }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setShowEvalForm(false);
      void loadEvaluations();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-white/10">
        <div className="min-w-0">
          <p className={T_SECTION + " truncate"}>{applicant.full_name}</p>
          <p className={`${T_BODY} truncate`}>{applicant.position_applied}</p>
        </div>
        <button
          className="shrink-0 rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className={`${TAB_CONTAINER} mt-3 shrink-0`}>
        {(["info", "interview", "evaluation", "offer"] as const).map((t) => (
          <button
            key={t}
            className={tab === t ? TAB_ACTIVE : TAB_INACTIVE}
            onClick={() => setTab(t)}
          >
            {t === "info" ? "Info" : t === "interview" ? "Interview"
              : t === "evaluation" ? "Evaluation" : "Offer"}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <p className="mt-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto mt-3 space-y-4 pr-1">
        {/* ── Info Tab ── */}
        {tab === "info" && (
          <div className="space-y-3">
            <div className={`${GLASS_CARD} p-4 space-y-2`}>
              {[
                ["Phone", applicant.phone],
                ["Email", applicant.email],
                ["Source", applicant.source],
                ...(applicant.referrer_name ? [["Referrer", applicant.referrer_name]] : []),
                ["Applied", applicant.applied_date],
                ["Days in pipeline", String(applicant.days_in_pipeline)],
                ...(assignedBranch ? [["Assigned Branch", assignedBranch]] : []),
              ].map(([label, val]) => (
                <div key={label} className="flex gap-2 text-sm">
                  <span className="text-zinc-500 shrink-0 w-28">{label}</span>
                  <span className="text-zinc-200 break-all">{val || "—"}</span>
                </div>
              ))}
            </div>

            {/* What they wrote on the form.
                Every one of these has been collected since the form went up and
                every one of them reaches this payload -- none of them were on
                this screen, the one where somebody decides. For an applicant
                with no recording, this and the CV are the whole case.

                Labelled with the questions the applicant actually saw. An
                answer read against a label invented here is a different answer:
                "2" under "How long were you there?" is a period, under
                "Experience" it would be a level. */}
            {(applicant.last_employer || applicant.last_position
              || applicant.last_duration || applicant.home_area
              || applicant.experience_level || applicant.available_from
              || applicant.facebook_url
              || (applicant.contact_apps?.length ?? 0) > 0) && (
              <div className={`${GLASS_CARD} p-4`}>
                <p className={`${T_LABEL} mb-2`}>What they wrote on the form</p>
                <div className="space-y-2">
                  {([
                    ["Where did you work last?", applicant.last_employer],
                    ["What was your position there?", applicant.last_position],
                    ["How long were you there?", applicant.last_duration],
                    ["Experience in food service",
                      applicant.experience_level
                        ? EXPERIENCE_LABEL[applicant.experience_level] || applicant.experience_level
                        : ""],
                    ["Which area do you live in?", applicant.home_area],
                    ["When can you start?", applicant.available_from],
                    ["Which apps do you use on this number?",
                      (applicant.contact_apps || []).join(", ")],
                  ] as [string, string | null | undefined][]).map(([q, val]) => (
                    <div key={q} className="flex gap-2 text-sm">
                      <span className="w-52 shrink-0 text-zinc-500">{q}</span>
                      <span className="break-all text-zinc-200">{val || "—"}</span>
                    </div>
                  ))}
                  {/* What they typed is not always a link. 87 of the 120 who
                      filled this in wrote a name, a handle, or facebook.com
                      without the scheme, and the raw value in an href resolved
                      against our own domain — every one of those 404'd. */}
                  {(() => {
                    const fb = facebookLink(applicant.facebook_url);
                    if (!fb) return null;
                    return (
                      <div className="flex gap-2 text-sm">
                        <span className="w-52 shrink-0 text-zinc-500">Facebook</span>
                        <span className="break-all">
                          <a
                            href={fb.href}
                            target="_blank"
                            rel="noreferrer"
                            className="text-violet-300 underline underline-offset-2"
                          >
                            {fb.label}
                          </a>
                          {fb.isSearch && (
                            /* A display name cannot be turned into a profile
                               URL. Say that the link searches, so nobody reads
                               a wrong result as the wrong person. */
                            <span className="ml-1.5 whitespace-nowrap text-[11px] text-zinc-500">
                              — searches Facebook (they gave a name, not a link)
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })()}
                </div>
                {applicant.form_language === "tl" && (
                  <p className="mt-2 text-xs text-zinc-500">
                    They filled the form in Tagalog — send them the Tagalog message.
                  </p>
                )}
              </div>
            )}

            {/* Same phone, same application done over. The duplicates are out
                of the queue but not gone, and the way back is here rather than
                behind a filter nobody knows about. */}
            {(applicant.merged_count ?? 0) > 0 && (
              <div className={`${GLASS_CARD} p-4 space-y-2`}>
                <p className={T_LABEL}>
                  Folded in &mdash; {applicant.merged_count} duplicate
                  {(applicant.merged_count ?? 0) > 1 ? "s" : ""}
                </p>
                <p className="text-xs text-zinc-500">
                  Same phone number. These applications were the same person
                  starting over, so they are kept out of the queue. Nothing was
                  deleted &mdash; separate one to put it back.
                </p>
                {mergedRows.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2 border-t border-zinc-800 pt-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-zinc-200 truncate">
                        {m.full_name}
                        <span className="text-zinc-500">
                          {" "}&middot; {m.applied_date}
                        </span>
                      </p>
                      <p className="text-xs text-zinc-500">
                        {m.position_applied || "—"} &middot; {m.source}
                        {m.voice_status
                          ? ` · voice ${m.voice_status}${m.answers ? ` (${m.answers} answers)` : ""}`
                          : " · no voice screening"}
                      </p>
                    </div>
                    <button
                      className="shrink-0 rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 disabled:opacity-50"
                      disabled={unmerging === m.id}
                      onClick={() => void handleUnmerge(m.id)}
                    >
                      {unmerging === m.id ? "Separating…" : "Separate"}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Resume. It is asked for at application time and 72 of the 101
                people waiting in New have sent one, but until now the pipeline
                could not say so -- the file sits on the voice-screening row,
                and nothing on this screen pointed at it. Only the name and
                size travel here; the file is fetched when it is opened. */}
            <div className={`${GLASS_CARD} p-4`}>
              <p className={T_LABEL}>Resume 履歴書</p>
              {applicant.resume_screening_id ? (
                <>
                  <p className="mt-1 text-sm text-zinc-200 break-all">
                    {applicant.resume_filename || "resume"}
                    {applicant.resume_bytes ? (
                      <span className="ml-2 text-zinc-500">
                        {fileSize(applicant.resume_bytes)}
                      </span>
                    ) : null}
                  </p>
                  {isImageName(applicant.resume_filename || "") && (
                    // Most of them are a photo of a printed CV. A thumbnail
                    // answers "is this readable at all" without a round trip
                    // to another tab.
                    <a
                      href={resumeHref(applicant.resume_screening_id)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 block overflow-hidden rounded-lg border border-white/10"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={resumeHref(applicant.resume_screening_id)}
                        alt={applicant.resume_filename || "Resume"}
                        className="max-h-56 w-full object-cover object-top"
                      />
                    </a>
                  )}
                  <a
                    href={resumeHref(applicant.resume_screening_id)}
                    target="_blank"
                    rel="noreferrer"
                    className={`${PRIMARY_BUTTON} mt-2 flex w-full items-center justify-center gap-2`}
                  >
                    <FileText className="h-4 w-4" />
                    Open resume
                  </a>
                </>
              ) : (
                // Two different situations, and we cannot tell them apart from
                // here, so say both rather than pick one and be wrong half the
                // time.
                <p className={`${T_CAPTION} mt-1`}>
                  Nothing on file — either they never sent one, or it is past
                  its retention date.
                </p>
              )}
            </div>

            {applicant.notes && (
              <div className={`${GLASS_CARD} p-4`}>
                <p className={T_LABEL}>Notes</p>
                <p className={`${T_BODY} mt-1`}>{applicant.notes}</p>
              </div>
            )}

            <div className={`${GLASS_CARD} p-4 space-y-3`}>
              {/* Status */}
              <div>
                <p className={T_LABEL}>Status</p>
                {needsOutcome(localStatus) && (
                  <button
                    className={`${PRIMARY_BUTTON} mt-2 flex w-full items-center justify-center gap-2`}
                    onClick={() => onRecordOutcome(applicant)}
                  >
                    <ClipboardList className="h-4 w-4" />
                    Record interview outcome
                  </button>
                )}
                <SelectDark
                  className={`${SELECT_CLASS} mt-2`}
                  value={localStatus}
                  onChange={v => void handleStatusChange(v as KanbanStatus)}
                  options={ALL_STATUSES.map(s => ({ value: s, label: KANBAN_COLUMNS.find(c => c.id === s)?.label || s }))}
                />
                {/* A named way back. The dropdown could already do this, but it
                    reads as "set the stage", not as "I pressed the wrong
                    button" -- so a move made by accident had no obvious
                    undo and people asked for one (lesson 22). */}
                {getPrevStatus(localStatus) && !pendingStatus && (
                  <button
                    className={`${SMALL_BUTTON} mt-2 flex w-full items-center justify-center gap-1`}
                    disabled={statusChanging}
                    onClick={() => void handleStatusChange(getPrevStatus(localStatus) as KanbanStatus)}
                  >
                    <ChevronLeft className="h-3 w-3" />
                    Move back to {KANBAN_COLUMNS.find(c => c.id === getPrevStatus(localStatus))?.label}
                  </button>
                )}
                {pendingStatus && (
                  <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-950/20 p-3">
                    <p className={`${T_LABEL} mb-2`}>Why are we turning them down?</p>
                    <div className="flex flex-wrap gap-2">
                      {reasons.map((r) => (
                        <button
                          key={r.key}
                          className={SMALL_BUTTON}
                          disabled={statusChanging}
                          onClick={() => void commitStatus(pendingStatus, r.key)}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                    <button
                      className={`${SMALL_BUTTON} mt-3`}
                      disabled={statusChanging}
                      onClick={() => { setPendingStatus(null); setLocalStatus(applicant.status); }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {needsOutcome(localStatus) && !pendingStatus && (
                  <p className={`${T_CAPTION} mt-1`}>
                    This dropdown only moves them. Use the button above to say what
                    happened at the interview.
                  </p>
                )}
                {statusChanging && (
                  <p className={`${T_CAPTION} mt-1`}>Updating...</p>
                )}
                {error && (
                  <p className="mt-2 rounded-lg border border-red-500/30 bg-red-950/20 p-2 text-xs text-red-200">
                    {error}
                  </p>
                )}
              </div>

              {/* History. Recording it and leaving it unreadable is how the
                  question "who moved this person, and when?" ends up being
                  answered by opening the database (lesson 6). It starts on
                  2026-09-09 -- nothing before that was ever written down, and
                  inventing it from updated_at would be a made-up number. */}
              <div className="border-t border-white/10 pt-3">
                <p className={T_LABEL}>History</p>
                {events.length === 0 ? (
                  <p className={`${T_CAPTION} mt-2`}>
                    Nothing recorded yet. Anything done from here on is listed here
                    with who did it.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {events.map((ev) => (
                      <li key={ev.id} className="flex gap-2 text-xs leading-relaxed">
                        <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-violet-400" />
                        <span className="text-zinc-300">
                          {ev.from_status && ev.to_status
                            ? `${statusLabel(ev.from_status)} → ${statusLabel(ev.to_status)}`
                            : ev.to_status
                              ? statusLabel(ev.to_status)
                              : EVENT_KIND_LABEL[ev.kind] || ev.kind}
                          {ev.reason ? ` · ${ev.reason.replace(/_/g, " ")}` : ""}
                          <span className="block text-zinc-500">
                            {new Date(ev.created_at).toLocaleString()}
                            {ev.actor ? ` · ${ev.actor}` : " · (no name recorded)"}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Assigned Branch */}
              <div className="border-t border-white/10 pt-3">
                <p className={T_LABEL}>Assigned Branch <span className="text-zinc-500 font-normal">配属先</span></p>
                <div className="flex gap-2 mt-2">
                  <input
                    list="branch-options"
                    type="text"
                    className={`${INPUT_CLASS} flex-1`}
                    placeholder="e.g. CK, Taft, Paranaque..."
                    value={assignedBranch}
                    onChange={(e) => setAssignedBranch(e.target.value)}
                  />
                  <datalist id="branch-options">
                    <option value="Central Kitchen (CK)" />
                    <option value="Taft" />
                    <option value="Paranaque" />
                    <option value="Cubao" />
                    <option value="Al Barsha" />
                    <option value="Business Bay" />
                    <option value="Al Mina" />
                    <option value="M City" />
                  </datalist>
                  <button
                    className={`${PRIMARY_BUTTON} shrink-0`}
                    disabled={savingBranch}
                    onClick={() => void handleSaveBranch()}
                  >
                    {savingBranch ? "..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Interview Tab ── */}
        {tab === "interview" && (
          <div className="space-y-3">
            {!showInterviewForm && (
              <button
                className={`${PRIMARY_BUTTON} flex items-center gap-2`}
                onClick={() => setShowInterviewForm(true)}
              >
                <Plus className="h-4 w-4" />
                Book a time for them
              </button>
            )}
            {showInterviewForm && (
              <InterviewForm
                applicantId={applicant.id}
                onBooked={() => { setShowInterviewForm(false); void loadInterviews(); onRefresh(); }}
                onCancel={() => setShowInterviewForm(false)}
              />
            )}
            {loadingInterviews ? (
              <p className={T_BODY}>Loading...</p>
            ) : interviews.length === 0 ? (
              <p className={T_BODY}>No interviews scheduled yet.</p>
            ) : (
              interviews.map((iv) => (
                <div key={iv.id} className={`${GLASS_CARD} p-3 space-y-1`}>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                    <span className="text-sm text-white font-medium">
                      {iv.interview_date} {iv.interview_time && `at ${iv.interview_time}`}
                    </span>
                  </div>
                  <p className={`${T_CAPTION} ml-5`}>
                    {iv.interview_type} &bull; {iv.location || "Location TBD"} &bull;{" "}
                    {iv.interviewer || "Interviewer TBD"}
                  </p>
                  <p className={`${T_CAPTION} ml-5 capitalize`}>Status: {iv.status}</p>
                  {iv.notes && <p className={`${T_BODY} ml-5`}>{iv.notes}</p>}
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Evaluation Tab ── */}
        {tab === "evaluation" && (
          <div className="space-y-3">
            {!showEvalForm && (
              <button
                className={`${PRIMARY_BUTTON} flex items-center gap-2`}
                onClick={() => setShowEvalForm(true)}
              >
                <Plus className="h-4 w-4" />
                Add Evaluation
              </button>
            )}
            {showEvalForm && (
              <EvaluationForm
                onSave={handleSaveEvaluation}
                onCancel={() => setShowEvalForm(false)}
                saving={saving}
              />
            )}
            {loadingEvaluations ? (
              <p className={T_BODY}>Loading...</p>
            ) : evaluations.length === 0 ? (
              <p className={T_BODY}>No evaluations yet.</p>
            ) : (
              evaluations.map((ev) => (
                <div key={ev.id} className={`${GLASS_CARD} p-3 space-y-2`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white font-medium">{ev.interviewer}</span>
                    {scoreDisplay(ev.total_score)}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {[
                      ["Communication", ev.score_communication],
                      ["Experience", ev.score_experience],
                      ["Attitude", ev.score_attitude],
                      ["Availability", ev.score_availability],
                    ].map(([label, val]) => (
                      <div key={String(label)} className="flex justify-between text-xs">
                        <span className="text-zinc-500">{label}</span>
                        <span className="text-zinc-300">{val}/5</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={T_LABEL}>Recommendation:</span>
                    <span
                      className={
                        ev.recommendation === "hire"
                          ? BADGE_SUCCESS
                          : ev.recommendation === "reject"
                          ? BADGE_ERROR
                          : BADGE_WARNING
                      }
                      style={{ fontSize: "10px", padding: "1px 6px" }}
                    >
                      {ev.recommendation}
                    </span>
                  </div>
                  {ev.strengths && (
                    <div>
                      <p className={T_LABEL}>Strengths</p>
                      <p className={`${T_BODY} mt-0.5`}>{ev.strengths}</p>
                    </div>
                  )}
                  {ev.areas_for_improvement && (
                    <div>
                      <p className={T_LABEL}>Areas for Improvement</p>
                      <p className={`${T_BODY} mt-0.5`}>{ev.areas_for_improvement}</p>
                    </div>
                  )}
                  {ev.notes && (
                    <div>
                      <p className={T_LABEL}>Notes</p>
                      <p className={`${T_BODY} mt-0.5`}>{ev.notes}</p>
                    </div>
                  )}
                  <p className={`${T_CAPTION} text-right`}>{ev.created_at?.slice(0, 10) || ""}</p>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Offer Tab ──
            What the letter says, typed once. The final interview gets skipped;
            the offer letter never does, so this is where the agreed money can
            be recorded without a stage that might not happen. Payroll fills the
            profile from it rather than the figure being typed a second time. */}
        {tab === "offer" && (
          <div className="space-y-3">
            <p className={T_BODY}>
              The figures on the offer letter. Payroll fills{" "}
              {applicant.city === "dubai" ? "the salary config" : "the staff profile"}{" "}
              from these, so they are typed once.
            </p>

            {offer?.sent_at && (
              <p className={T_CAPTION}>
                Last sent {String(offer.sent_at).slice(0, 10)}
                {offer.sent_by ? ` by ${offer.sent_by}` : ""}
                {offer.applied_to_payroll_at
                  ? ` · used for payroll ${String(offer.applied_to_payroll_at).slice(0, 10)}`
                  : " · not yet used for payroll"}
              </p>
            )}

            {!salaryVisible && (
              <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                The money on this offer is not yours to see. You can still record
                the position, branch, employment type and start date — the
                figures stay as they are. Someone with payroll access, or HR,
                sets them.
              </p>
            )}

            <div className={`${GLASS_CARD} p-3 space-y-3`}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={T_LABEL}>Position</label>
                  <input className={`${INPUT_CLASS} mt-1`} value={offerForm.position}
                    onChange={(e) => setOfferForm({ ...offerForm, position: e.target.value })} />
                </div>
                <div>
                  <label className={T_LABEL}>Branch</label>
                  <input className={`${INPUT_CLASS} mt-1`} value={offerForm.branch_code}
                    onChange={(e) => setOfferForm({ ...offerForm, branch_code: e.target.value })} />
                </div>
                <div>
                  <label className={T_LABEL}>Employment type</label>
                  <input className={`${INPUT_CLASS} mt-1`} placeholder="probationary"
                    value={offerForm.employment_type}
                    onChange={(e) => setOfferForm({ ...offerForm, employment_type: e.target.value })} />
                </div>
                <div>
                  <label className={T_LABEL}>Start date</label>
                  <input type="date" className={`${INPUT_CLASS} mt-1`} value={offerForm.start_date}
                    onChange={(e) => setOfferForm({ ...offerForm, start_date: e.target.value })} />
                </div>
              </div>

              <div>
                <label className={T_LABEL}>
                  Basic salary — monthly ({applicant.city === "dubai" ? "AED" : "PHP"})
                </label>
                <input type="number" inputMode="decimal" min={0}
                  disabled={!salaryVisible}
                  placeholder={salaryVisible ? "" : "••••"}
                  className={`${INPUT_CLASS} mt-1 ${salaryVisible ? "" : "opacity-60"}`}
                  value={salaryVisible ? offerForm.basic_monthly : ""}
                  onChange={(e) => setOfferForm({ ...offerForm, basic_monthly: e.target.value })} />
                <p className={`${T_CAPTION} mt-1`}>This is the figure payroll pays from.</p>
              </div>

              {/* Only the lines that city has. Showing Manila's rice allowance
                  to Dubai would invite a number that no engine reads. */}
              <div className="grid grid-cols-2 gap-3">
                {(applicant.city === "dubai" ? DUBAI_ALLOWANCES : MANILA_ALLOWANCES)
                  .map(({ key, label, cap }) => (
                    <div key={key}>
                      <label className={T_LABEL}>{label}</label>
                      <input type="number" inputMode="decimal" min={0}
                        disabled={!salaryVisible}
                        placeholder={salaryVisible ? "" : "••••"}
                        className={`${INPUT_CLASS} mt-1 ${salaryVisible ? "" : "opacity-60"}`}
                        value={salaryVisible ? offerForm[key] : ""}
                        onChange={(e) => setOfferForm({ ...offerForm, [key]: e.target.value })} />
                      {cap && <p className={T_CAPTION}>Tax-free up to {cap}/month</p>}
                    </div>
                  ))}
              </div>

              <div>
                <label className={T_LABEL}>Anything else the letter says</label>
                <textarea rows={2} className={`${TEXTAREA_CLASS} mt-1`} value={offerForm.notes}
                  onChange={(e) => setOfferForm({ ...offerForm, notes: e.target.value })} />
              </div>

              {offerSaved && <p className="text-xs text-emerald-400">{offerSaved}</p>}
              <button className={PRIMARY_BUTTON} disabled={offerBusy}
                      onClick={() => void saveOffer()}>
                {offerBusy ? "Saving…" : offer ? "Update the offer" : "Record the offer"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Hiring plans ─────────────────────────────────────────────────────────────

type PlanPosition = {
  id: string;
  position: string;
  branch: string;
  priority: string;
  status: string;
  openings: number;
  target_start_date: string | null;
  candidate_count: number;
  filled_count: number;
  offer_count: number;
  interviewed_count: number;
  remaining: number;
};

type HiringPlan = {
  id: string;
  name: string;
  branch: string;
  opening_date: string | null;
  status: string;
  created_by: string;
  days_to_opening: number | null;
  positions: PlanPosition[];
  headcount: number;
  filled: number;
  remaining: number;
  at_risk: string[];
};

type Overview = {
  plans: HiringPlan[];
  stalled: { full_name: string; position_applied: string; days_waiting: number; since: string }[];
  stalled_count: number;
  stalled_shown?: number;
  awaiting_offer: { full_name: string; position_applied: string; days_waiting: number }[];
  openings_with_no_candidates: {
    position: string; branch: string; openings: number;
    target_start_date: string | null; days_to_target: number | null;
  }[];
  overdue_requisitions: number;
};

function ProgressBar({ filled, total }: { filled: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((filled / total) * 100)) : 0;
  const tone =
    pct >= 100 ? "bg-emerald-500" : pct >= 50 ? "bg-violet-500" : "bg-amber-500";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** The owner's screen: will these stores be staffed in time.
 *
 *  Built because the answer used to live across nineteen requisition rows that
 *  nobody closed, a hundred and thirty applicant cards, and several dozen
 *  spreadsheets. A red bar is the only reason to open anything.
 */
function PlansView({
  data,
  loading,
  onReload,
  onNewPlan,
  onClosePlan,
}: {
  data: Overview | null;
  loading: boolean;
  onReload: () => void;
  onNewPlan: () => void;
  onClosePlan: (p: HiringPlan) => void;
}) {
  if (loading && !data) return <p className={`${T_BODY} p-6`}>Loading…</p>;
  if (!data) return null;

  const { plans, stalled, awaiting_offer, openings_with_no_candidates } = data;

  return (
    <div className="space-y-6 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className={T_SECTION}>Hiring Plans</h2>
        <button className={SMALL_BUTTON} onClick={onReload}>
          <RefreshCw className="mr-1 inline h-3.5 w-3.5" /> Reload
        </button>
        <button
          className={`${PRIMARY_BUTTON} ml-auto flex items-center gap-1.5`}
          onClick={onNewPlan}
        >
          <Plus className="h-4 w-4" />
          New Hiring Plan
        </button>
      </div>

      {plans.length === 0 ? (
        <div className={`${GLASS_CARD} p-6`}>
          <p className={T_BODY}>
            No active hiring plan. A plan is one store opening or expansion — its
            roles, how many of each, and the date it has to be ready by.
          </p>
        </div>
      ) : (
        plans.map((p) => (
          <div key={p.id} className={`${GLASS_CARD} p-5 space-y-4`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className={T_CARD_TITLE}>{p.name}</p>
                <p className={T_CAPTION}>
                  {p.branch || "—"}
                  {p.opening_date ? ` · opens ${p.opening_date}` : ""}
                  {p.days_to_opening !== null && p.days_to_opening !== undefined
                    ? p.days_to_opening >= 0
                      ? ` · ${p.days_to_opening} days to go`
                      : ` · ${Math.abs(p.days_to_opening)} days overdue`
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-sm tabular-nums text-zinc-300">
                  <span className="text-lg font-bold text-white">{p.filled}</span>
                  <span className="text-zinc-500"> / {p.headcount} filled</span>
                  {p.remaining > 0 && (
                    <span className="ml-2 text-amber-300">{p.remaining} to go</span>
                  )}
                </p>
                <button className={SMALL_BUTTON} onClick={() => onClosePlan(p)}>
                  Mark done
                </button>
              </div>
            </div>

            <ProgressBar filled={p.filled} total={p.headcount} />

            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-[13px]">
                <thead>
                  <tr className={TABLE_HEADER}>
                    <th className="px-3 py-2 text-left">Position</th>
                    <th className="px-3 py-2 text-right">Filled</th>
                    <th className="px-3 py-2 text-right">Candidates</th>
                    <th className="px-3 py-2 text-right">Interviewed</th>
                    <th className="px-3 py-2 text-right">Offers out</th>
                    <th className="px-3 py-2 text-left">State</th>
                  </tr>
                </thead>
                <tbody>
                  {p.positions.map((i) => {
                    const atRisk = i.remaining > 0 && i.offer_count === 0;
                    return (
                      <tr key={i.id} className={TABLE_ROW}>
                        <td className="px-3 py-2 font-medium text-white">
                          {i.position}
                          {i.priority === "urgent" && (
                            <span className="ml-2 text-[10px] uppercase tracking-wide text-red-400">
                              urgent
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {i.filled_count}/{i.openings}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {i.candidate_count || <span className="text-white/25">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {i.interviewed_count || <span className="text-white/25">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {i.offer_count || <span className="text-white/25">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          {i.status === "closed" ? (
                            <span className={BADGE_SUCCESS}>Filled</span>
                          ) : atRisk ? (
                            <span className={BADGE_WARNING}>
                              {i.candidate_count === 0 ? "No candidates" : "No offer out"}
                            </span>
                          ) : (
                            <span className={BADGE_INFO}>In progress</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {p.at_risk.length > 0 && (
              <p className="text-sm text-amber-300">
                At risk for the opening date: {p.at_risk.join(", ")}
              </p>
            )}
          </div>
        ))
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${GLASS_CARD} p-5`}>
          <p className={T_SECTION}>Waiting on a decision</p>
          <p className={`${T_CAPTION} mb-3`}>
            Interviewed more than a week ago and still not decided.
          </p>
          {stalled.length === 0 ? (
            <p className={T_BODY}>Nobody is waiting. </p>
          ) : (
            <>
              <p className="mb-2 text-2xl font-bold tabular-nums text-amber-300">
                {data.stalled_count}
              </p>
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {stalled.slice(0, 40).map((s) => (
                  <div
                    key={`${s.full_name}-${s.since}`}
                    className="flex items-baseline justify-between gap-3 border-b border-white/5 py-1"
                  >
                    <span className="truncate text-sm text-white">{s.full_name}</span>
                    <span className={`${T_CAPTION} truncate`}>{s.position_applied}</span>
                    <span className="shrink-0 text-xs tabular-nums text-amber-400">
                      {s.days_waiting}d
                    </span>
                  </div>
                ))}
              </div>
              {data.stalled_count > Math.min(stalled.length, 40) && (
                <p className={`${T_CAPTION} mt-2`}>
                  and {data.stalled_count - Math.min(stalled.length, 40)} more
                </p>
              )}
            </>
          )}
        </div>

        <div className="space-y-4">
          <div className={`${GLASS_CARD} p-5`}>
            <p className={T_SECTION}>Offers out</p>
            {awaiting_offer.length === 0 ? (
              <p className={`${T_BODY} mt-2`}>None.</p>
            ) : (
              <div className="mt-2 space-y-1">
                {awaiting_offer.map((a) => (
                  <div key={a.full_name} className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm text-white">{a.full_name}</span>
                    <span className={`${T_CAPTION} truncate`}>{a.position_applied}</span>
                    <span className="shrink-0 text-xs tabular-nums text-zinc-400">
                      {a.days_waiting}d
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={`${GLASS_CARD} p-5`}>
            <p className={T_SECTION}>Openings with nobody in the running</p>
            <p className={`${T_CAPTION} mb-2`}>
              {data.overdue_requisitions} open requisition
              {data.overdue_requisitions === 1 ? " is" : "s are"} past their target date.
            </p>
            {openings_with_no_candidates.length === 0 ? (
              <p className={T_BODY}>None.</p>
            ) : (
              <div className="max-h-52 space-y-1 overflow-y-auto">
                {openings_with_no_candidates.map((o, i) => (
                  <div
                    key={`${o.branch}-${o.position}-${i}`}
                    className="flex items-baseline justify-between gap-3 border-b border-white/5 py-1"
                  >
                    <span className="truncate text-sm text-white">{o.position}</span>
                    <span className={`${T_CAPTION} truncate`}>{o.branch}</span>
                    {o.days_to_target !== null && o.days_to_target < 0 && (
                      <span className="shrink-0 text-xs tabular-nums text-red-400">
                        {Math.abs(o.days_to_target)}d late
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

type PlanPositionDraft = { position: string; openings: string; priority: string };

function NewPlanModal({
  onSave,
  onClose,
  saving,
}: {
  onSave: (data: {
    name: string; branch: string; opening_date: string;
    positions: { position: string; openings: number; priority: string }[];
  }) => Promise<string | null>;
  onClose: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState("");
  const [branch, setBranch] = useState("");
  const [openingDate, setOpeningDate] = useState("");
  const [rows, setRows] = useState<PlanPositionDraft[]>([
    { position: "", openings: "1", priority: "normal" },
  ]);
  const [error, setError] = useState("");

  const setRow = (i: number, patch: Partial<PlanPositionDraft>) =>
    setRows((prev) => {
      const next = prev.map((r, j) => (j === i ? { ...r, ...patch } : r));
      if (i === next.length - 1 && next[i].position.trim()) {
        next.push({ position: "", openings: "1", priority: "normal" });
      }
      return next;
    });

  const valid = rows.filter((r) => r.position.trim());
  const headcount = valid.reduce((n, r) => n + Math.max(1, Number(r.openings) || 1), 0);

  const submit = async () => {
    setError("");
    const err = await onSave({
      name,
      branch,
      opening_date: openingDate,
      positions: valid.map((r) => ({
        position: r.position.trim(),
        openings: Math.max(1, Number(r.openings) || 1),
        priority: r.priority,
      })),
    });
    if (err) setError(err);
    else onClose();
  };

  return (
    <ModalScrim className="bg-black/60">
      <div className={`${GLASS_CARD} w-full max-w-2xl mx-auto my-4 p-6 space-y-4`}>
        <div className="flex items-center justify-between">
          <p className={T_SECTION}>New Hiring Plan</p>
          <button
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className={T_CAPTION}>
          One store opening or expansion. Every role below becomes its own
          requisition, so you raise them once instead of one at a time.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={T_LABEL}>Plan name *</label>
            <input
              type="text"
              className={`${INPUT_CLASS} mt-1`}
              placeholder="e.g. Cubao (QC) opening"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className={T_LABEL}>Branch</label>
            <input
              type="text"
              className={`${INPUT_CLASS} mt-1`}
              placeholder="e.g. Cubao"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
            />
          </div>
          <div>
            <label className={T_LABEL}>Opening date</label>
            <input
              type="date"
              className={`${INPUT_CLASS} mt-1`}
              value={openingDate}
              onChange={(e) => setOpeningDate(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className={T_LABEL}>Roles and how many of each</label>
          <div className="mt-1 space-y-1.5">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  className={INPUT_CLASS}
                  placeholder={i === 0 ? "e.g. Store Manager" : ""}
                  value={r.position}
                  onChange={(e) => setRow(i, { position: e.target.value })}
                />
                <input
                  type="number"
                  min={1}
                  className={`${INPUT_CLASS} w-20 shrink-0`}
                  value={r.openings}
                  onChange={(e) => setRow(i, { openings: e.target.value })}
                />
                <div className="w-32 shrink-0">
                  <SelectDark
                    value={r.priority}
                    onChange={(v) => setRow(i, { priority: v })}
                    options={[
                      { value: "normal", label: "Normal" },
                      { value: "urgent", label: "Urgent" },
                    ]}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className={`${T_CAPTION} mt-2`}>
            {valid.length} role{valid.length === 1 ? "" : "s"} · {headcount} people
          </p>
        </div>

        {error && (
          <p className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            className={PRIMARY_BUTTON}
            disabled={saving || !name.trim() || valid.length === 0}
            onClick={submit}
          >
            {saving ? "Saving…" : `Create ${valid.length} requisition${valid.length === 1 ? "" : "s"}`}
          </button>
          <button className={SECONDARY_BUTTON} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </ModalScrim>
  );
}

// ─── Interview Outcome ────────────────────────────────────────────────────────

type OutcomeReason = { key: string; label: string };


const OUTCOME_BUTTONS: {
  key: "proceed" | "hold" | "pass" | "lapse";
  label: string;
  hint: string;
  cls: string;
}[] = [
  {
    key: "proceed",
    label: "Proceed to offer",
    hint: "Moves them to Offer Sent",
    cls: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25",
  },
  {
    key: "hold",
    label: "Hold",
    hint: "Stays in Interviewed, with the reason on record",
    cls: "border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25",
  },
  {
    key: "pass",
    label: "Not proceeding",
    hint: "Moves them to Rejected",
    cls: "border-red-500/40 bg-red-500/15 text-red-300 hover:bg-red-500/25",
  },
  {
    key: "lapse",
    label: "Close — nobody assessed them",
    hint: "For an application that ran out of time, or someone who stopped replying",
    cls: "border-zinc-400/40 bg-zinc-400/15 text-zinc-200 hover:bg-zinc-400/25",
  },
];

/** The decision and the record, in one action.
 *
 *  Setting the status was one click; recording the interview was a six-field
 *  form and evaluating it an eight-field one. Everyone took the click, so 92
 *  people sat at or past "interviewed" backed by 3 interview records and 5
 *  evaluations, and all 16 rejections were filed without a reason.
 *
 *  Interviewer and date are not asked for -- the signed-in user and today are
 *  already known, and a field that is asked for is a field that gets skipped.
 */
function InterviewOutcomeModal({
  applicant,
  reasons,
  onSubmit,
  onClose,
  saving,
}: {
  applicant: Applicant;
  reasons: OutcomeReason[];
  onSubmit: (data: { outcome: string; reason: string; notes: string }) => Promise<string | null>;
  onClose: () => void;
  saving: boolean;
}) {
  const [outcome, setOutcome] = useState<"" | "proceed" | "hold" | "pass" | "lapse">("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  // 18 of the people on the decision list are still at "new" -- nobody has met
  // them. Offering "Proceed to offer" or "Hold" there would be offering to skip
  // the interview, so those two only appear once there has been one.
  const interviewed = applicant.status === "scheduled" || applicant.status === "interviewed";
  const buttons = OUTCOME_BUTTONS.filter(
    (b) => interviewed || b.key === "pass" || b.key === "lapse");

  const reasonRequired = outcome === "hold" || outcome === "pass" || outcome === "lapse";
  // Only the reasons that fit what was chosen. Offering all of them and then
  // refusing the save teaches people to distrust the chips.
  const shownReasons = reasons.filter((r) =>
    outcome === "lapse" ? LAPSE_REASONS.has(r.key) : !LAPSE_ONLY.has(r.key));
  const noteRequired = reason === "other";
  const ready =
    !!outcome &&
    (!reasonRequired || !!reason) &&
    (!noteRequired || !!notes.trim());

  const submit = async () => {
    setError("");
    const err = await onSubmit({ outcome, reason, notes });
    if (err) setError(err);
    else onClose();
  };

  return (
    <ModalScrim className="bg-black/60">
      <div className={`${GLASS_CARD} w-full max-w-lg mx-auto my-4 p-6 space-y-4`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={T_SECTION}>{applicant.full_name}</p>
            <p className={T_CAPTION}>{applicant.position_applied}</p>
          </div>
          <button
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div>
          <p className={T_LABEL}>
            {interviewed
              ? "How did the interview go?"
              : "This application never reached an interview. What happened?"}
          </p>
          <div className="mt-2 grid gap-2">
            {buttons.map((b) => (
              <button
                key={b.key}
                type="button"
                onClick={() => {
                  setOutcome(b.key);
                  setReason("");
                }}
                className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                  outcome === b.key ? b.cls : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
                }`}
              >
                <span className="block text-sm font-semibold">{b.label}</span>
                <span className="block text-xs opacity-70">{b.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {outcome && (
          <div>
            <p className={T_LABEL}>
              Reason {reasonRequired ? "*" : <span className="opacity-60">(optional)</span>}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {shownReasons.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setReason(reason === r.key ? "" : r.key)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    reason === r.key
                      ? "border-violet-500/50 bg-violet-500/20 text-violet-200"
                      : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {outcome && (
          <div>
            <p className={T_LABEL}>
              Note {noteRequired ? "*" : <span className="opacity-60">(optional)</span>}
            </p>
            <textarea
              className={`${TEXTAREA_CLASS} mt-1`}
              rows={2}
              value={notes}
              placeholder={noteRequired ? "Say what happened" : ""}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button className={PRIMARY_BUTTON} disabled={!ready || saving} onClick={submit}>
            {saving ? "Saving…" : "Save outcome"}
          </button>
          <button className={SECONDARY_BUTTON} onClick={onClose}>Cancel</button>
        </div>
        <p className={T_CAPTION}>
          Recorded against you, dated today. A full scored evaluation can still be
          added from the candidate&apos;s Evaluation tab.
        </p>
      </div>
    </ModalScrim>
  );
}

// ─── Add Applicant Modal ──────────────────────────────────────────────────────

type AddApplicantForm = {
  full_name: string;
  position_applied: string;
  position_group: string;
  phone: string;
  email: string;
  source: string;
  referrer_name: string;
  requisition_id: string;
  assigned_branch: string;
  notes: string;
  applied_date: string;
};

const OTHER_POSITION = "__other";

/** The six the job post advertises and the public form offers.
 *
 *  ⚠️ Must stay in step with POSITION_GROUPS in db_public_apply.py and
 *  POSITIONS in /apply. A key here that the server does not know is rejected;
 *  one missing here means hand-entered applicants cannot be counted alongside
 *  the ones who filled the form in themselves.
 *
 *  Why a list at all: `position_applied` is free text and 186 applicants had
 *  reached the database under 88 distinct spellings -- "store manager",
 *  "Store manager", "store maanger", "Manager", "L0-3", "L0-L3". None of them
 *  can be counted together, so "how many applied to be a store manager" had no
 *  answer. The free text stays for the exact wording of a requisition; this
 *  puts every applicant into one of six countable buckets as well. */
const POSITION_GROUPS: { key: string; label: string }[] = [
  { key: "pic", label: "Store Manager / Person in charge" },
  { key: "head_chef", label: "Head Chef / Chef de Partie" },
  { key: "kitchen", label: "Cook / Assistant Cook" },
  { key: "cashier", label: "Cashier" },
  { key: "driver", label: "Driver" },
  { key: "back_office", label: "Office staff" },
];

/** One field for "what are they applying for", instead of two.
 *
 *  It used to be a free-text Position box with an optional Requisition dropdown
 *  underneath it. People fill a form from the top, so the box that had to be
 *  typed got typed and the one that was useful got skipped: 115 of 132
 *  applicants are tied to no requisition, and "store manager" reached the
 *  database spelt five different ways.
 *
 *  Picking the requisition now sets the position and the branch, so this is
 *  fewer keystrokes than before rather than more.
 */
function PositionPicker({
  requisitions,
  requisitionId,
  positionApplied,
  onChange,
}: {
  requisitions: Requisition[];
  requisitionId: string;
  positionApplied: string;
  onChange: (patch: {
    requisition_id: string;
    position_applied: string;
    assigned_branch: string;
  }) => void;
}) {
  // Held here rather than inferred from the values, so choosing "Other" and then
  // clearing the text does not silently snap back to "nothing selected".
  const [isOther, setIsOther] = useState(!requisitionId && positionApplied !== "");

  const pick = (v: string) => {
    if (v === OTHER_POSITION) {
      setIsOther(true);
      onChange({ requisition_id: "", position_applied: "", assigned_branch: "" });
      return;
    }
    setIsOther(false);
    if (!v) {
      onChange({ requisition_id: "", position_applied: "", assigned_branch: "" });
      return;
    }
    const r = requisitions.find((x) => x.id === v);
    onChange({
      requisition_id: v,
      position_applied: r?.position ?? "",
      assigned_branch: r?.branch ?? "",
    });
  };

  return (
    <div className="space-y-2">
      <SelectDark
        className={`${SELECT_CLASS} mt-1`}
        value={requisitionId || (isOther ? OTHER_POSITION : "")}
        onChange={pick}
        options={[
          { value: "", label: "— Select an open position —" },
          ...requisitions.map((r) => ({
            value: r.id,
            label: `${r.position} — ${r.branch}${r.priority === "urgent" ? "  (urgent)" : ""}`,
          })),
          { value: OTHER_POSITION, label: "Other — not on the list" },
        ]}
      />
      {isOther && (
        <input
          type="text"
          autoFocus
          placeholder="Type the position"
          className={INPUT_CLASS}
          value={positionApplied}
          onChange={(e) =>
            onChange({
              requisition_id: "",
              position_applied: e.target.value,
              assigned_branch: "",
            })
          }
        />
      )}
      {requisitionId && (
        <p className={T_CAPTION}>
          Linked to this requisition, so it counts toward that opening.
        </p>
      )}
      {isOther && (
        <p className={T_CAPTION}>
          Not linked to any requisition — this candidate will not appear against an
          opening. Raise a requisition if this role is really being hired for.
        </p>
      )}
    </div>
  );
}

function AddApplicantModal({
  requisitions,
  onSave,
  onClose,
  saving,
}: {
  requisitions: Requisition[];
  onSave: (data: AddApplicantForm, cv: File) => Promise<string | null>;
  onClose: () => void;
  saving: boolean;
}) {
  const today = isoToday();
  /** Required, like the public form. Everyone who applied themselves sends one;
   *  the only applicants arriving without a CV are the ones typed in here. */
  const [cv, setCv] = useState<File | null>(null);
  const [form, setForm] = useState<AddApplicantForm>({
    full_name: "",
    position_applied: "",
    position_group: "",
    phone: "",
    email: "",
    source: "referral",
    referrer_name: "",
    requisition_id: "",
    assigned_branch: "",
    notes: "",
    applied_date: today,
  });
  const [submitError, setSubmitError] = useState("");
  const set = (k: keyof AddApplicantForm, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));
  const handleSubmit = async () => {
    setSubmitError("");
    if (!cv) {
      setSubmitError("Attach their CV. It is required on the form applicants "
        + "fill in themselves, and an applicant with no CV cannot be screened "
        + "— nine arrived that way today and every one was typed in here.");
      return;
    }
    if (!form.position_group) {
      setSubmitError("Pick which kind of role this is — it is what makes this "
        + "applicant countable alongside the ones who used the form.");
      return;
    }
    // With no requisition and nothing typed in, the card would read
    // "Position N/A". The group label is the honest thing to show there.
    const label = POSITION_GROUPS.find((g) => g.key === form.position_group)?.label ?? "";
    const err = await onSave({
      ...form,
      position_applied: form.position_applied || label,
    }, cv);
    if (err) setSubmitError(err);
  };

  return (
    <ModalScrim className="bg-black/60">
      <div
        className={`${GLASS_CARD} w-full max-w-lg mx-auto my-4 p-6 space-y-4`}
      >
        <div className="flex items-center justify-between">
          <p className={T_SECTION}>Add Applicant</p>
          <button
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={T_LABEL}>Full Name *</label>
            <input
              type="text"
              className={`${INPUT_CLASS} mt-1`}
              value={form.full_name}
              onChange={(e) => set("full_name", e.target.value)}
            />
          </div>
          <div className="col-span-2">
            <label className={T_LABEL}>Applying for *</label>
            <PositionPicker
              requisitions={requisitions}
              requisitionId={form.requisition_id}
              positionApplied={form.position_applied}
              onChange={(patch) => setForm((p) => ({ ...p, ...patch }))}
            />
          </div>
          {/* Asked separately from the requisition, and always. The requisition
              carries the exact wording of one opening; this is the bucket the
              applicant can be counted in alongside everybody who filled the
              form in themselves. Without it a hand-entered candidate is
              uncountable -- which is how 186 applicants ended up under 88
              spellings. */}
          <div className="col-span-2">
            <label className={T_LABEL}>Which kind of role? *</label>
            <SelectDark
              className={`${SELECT_CLASS} mt-1`}
              value={form.position_group}
              onChange={(v) => set("position_group", v)}
              options={[
                { value: "", label: "— Select —" },
                ...POSITION_GROUPS.map((g) => ({ value: g.key, label: g.label })),
              ]}
            />
            <p className={`${T_CAPTION} mt-1`}>
              The same six the job post lists and the applicant sees on the form.
              This is what makes &ldquo;how many applied for kitchen&rdquo; answerable.
            </p>
          </div>
          <div>
            <label className={T_LABEL}>Phone</label>
            <input
              type="text"
              className={`${INPUT_CLASS} mt-1`}
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </div>
          <div>
            <label className={T_LABEL}>Email</label>
            <input
              type="email"
              className={`${INPUT_CLASS} mt-1`}
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </div>
          <div>
            <label className={T_LABEL}>Source</label>
            <SelectDark
              className={`${SELECT_CLASS} mt-1`}
              value={form.source}
              onChange={v => set("source", v)}
              options={[
                { value: "referral", label: "Referral" },
                { value: "jobstreet", label: "JobStreet" },
                { value: "facebook", label: "Facebook" },
                { value: "walk_in", label: "Walk-in" },
                { value: "other", label: "Other" },
              ]}
            />
          </div>
          {form.source === "referral" && (
            <div>
              <label className={T_LABEL}>Referrer Name</label>
              <input
                type="text"
                className={`${INPUT_CLASS} mt-1`}
                value={form.referrer_name}
                onChange={(e) => set("referrer_name", e.target.value)}
              />
            </div>
          )}
          <div>
            <label className={T_LABEL}>Applied Date</label>
            <input
              type="date"
              className={`${INPUT_CLASS} mt-1`}
              value={form.applied_date}
              onChange={(e) => set("applied_date", e.target.value)}
            />
          </div>
          {/* Required, and placed before Notes so it is not the thing scrolled
              past. The public form has asked for a CV since 2026-09-10 and
              every applicant who used it has one; this is where the ones
              without arrive. */}
          <div className="col-span-2">
            <label className={T_LABEL}>CV *</label>
            <input
              type="file"
              className={`${INPUT_CLASS} mt-1 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-500/20 file:px-3 file:py-1 file:text-violet-200`}
              accept="application/pdf,image/*,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => setCv(e.target.files?.[0] ?? null)}
            />
            <p className={`${T_CAPTION} mt-1`}>
              PDF, Word, or a clear photo of a printed CV. If you do not have it
              yet, add them without one from{" "}
              <span className="text-zinc-400">Add Several</span> and the card
              will offer <span className="text-zinc-400">No CV — ask for one</span>.
            </p>
          </div>
          <div className="col-span-2">
            <label className={T_LABEL}>Notes</label>
            <textarea
              className={`${TEXTAREA_CLASS} mt-1`}
              rows={2}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>
        </div>

        {submitError && (
          <p className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
            {submitError}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            className={PRIMARY_BUTTON}
            /* The CV is in here too, so "required" is visible before the
               press rather than only after it. The message in handleSubmit
               stays -- a disabled button says nothing about why. */
            disabled={saving || !form.full_name.trim()
                      || !form.position_applied.trim() || !cv}
            onClick={handleSubmit}
          >
            {saving ? "Saving..." : "Add Applicant"}
          </button>
          <button className={SECONDARY_BUTTON} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </ModalScrim>
  );
}

// ─── Add Requisition Modal ────────────────────────────────────────────────────

type AddRequisitionForm = {
  branch: string;
  position: string;
  reason: string;
  resigned_staff_name: string;
  target_start_date: string;
  priority: string;
  requested_by: string;
  notes: string;
  openings: string;
};

// ─── Add Several Modal ────────────────────────────────────────────────────────

type BulkAddResult = { created_count: number; skipped: string[] };

/** A stack of resumes is one event, not fifteen separate ones.
 *
 *  Fifteen candidates were entered through the single-applicant modal on
 *  2026-08-26 and ten more on 08-31. The position, the source and the date are
 *  the same for the whole stack, so they are asked once here and only the names
 *  are typed -- which is fewer keystrokes than the spreadsheet this replaces.
 */
function BulkAddModal({
  requisitions,
  onSave,
  onClose,
  saving,
}: {
  requisitions: Requisition[];
  onSave: (data: {
    names: string[];
    position_applied: string;
    requisition_id: string;
    assigned_branch: string;
    source: string;
    referrer_name: string;
    applied_date: string;
  }) => Promise<{ error: string | null; result: BulkAddResult | null }>;
  onClose: () => void;
  saving: boolean;
}) {
  const today = isoToday();
  const [position, setPosition] = useState({
    requisition_id: "",
    position_applied: "",
    assigned_branch: "",
  });
  const [source, setSource] = useState("walk_in");
  const [referrer, setReferrer] = useState("");
  const [appliedDate, setAppliedDate] = useState(today);
  const [names, setNames] = useState<string[]>([""]);
  const [submitError, setSubmitError] = useState("");
  const [result, setResult] = useState<BulkAddResult | null>(null);
  const rowRefs = useRef<(HTMLInputElement | null)[]>([]);

  const filled = names.map((n) => n.trim()).filter(Boolean);

  const setName = (i: number, v: string) =>
    setNames((prev) => {
      const next = [...prev];
      next[i] = v;
      // Always keep one empty row at the end, the way a spreadsheet does.
      if (i === next.length - 1 && v.trim()) next.push("");
      return next;
    });

  // Pasting a column of names from a spreadsheet fills a row each, rather than
  // dropping the whole block into one field.
  const handlePaste = (i: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (!/[\n\t]/.test(text)) return;
    e.preventDefault();
    const parts = text.split(/[\n\t]+/).map((x) => x.trim()).filter(Boolean);
    setNames((prev) => {
      const next = [...prev];
      next.splice(i, 1, ...parts);
      if (next[next.length - 1]?.trim()) next.push("");
      return next;
    });
  };

  const removeRow = (i: number) =>
    setNames((prev) => (prev.length === 1 ? [""] : prev.filter((_, j) => j !== i)));

  const handleSubmit = async () => {
    setSubmitError("");
    setResult(null);
    const r = await onSave({
      names: filled,
      position_applied: position.position_applied,
      requisition_id: position.requisition_id,
      assigned_branch: position.assigned_branch,
      source,
      referrer_name: referrer,
      applied_date: appliedDate,
    });
    if (r.error) setSubmitError(r.error);
    else setResult(r.result);
  };

  if (result) {
    return (
      <ModalScrim className="bg-black/60">
        <div className={`${GLASS_CARD} w-full max-w-lg mx-auto my-4 p-6 space-y-4`}>
          <p className={T_SECTION}>
            {result.created_count} candidate{result.created_count === 1 ? "" : "s"} added
          </p>
          {result.skipped.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
              <p className="text-sm font-medium text-amber-300">
                {result.skipped.length} skipped — already in the pipeline for this position
              </p>
              <p className="mt-1 text-xs text-amber-200/70">{result.skipped.join(", ")}</p>
            </div>
          )}
          <button className={PRIMARY_BUTTON} onClick={onClose}>Done</button>
        </div>
      </ModalScrim>
    );
  }

  return (
    <ModalScrim className="bg-black/60">
      <div className={`${GLASS_CARD} w-full max-w-2xl mx-auto my-4 p-6 space-y-4`}>
        <div className="flex items-center justify-between">
          <p className={T_SECTION}>Add Several Candidates</p>
          <button
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className={T_CAPTION}>
          Set the position once, then type the names. Paste a column from a
          spreadsheet and it fills a row each.
        </p>

        <div>
          <label className={T_LABEL}>Applying for *</label>
          <PositionPicker
            requisitions={requisitions}
            requisitionId={position.requisition_id}
            positionApplied={position.position_applied}
            onChange={setPosition}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={T_LABEL}>Source</label>
            <SelectDark
              className={`${SELECT_CLASS} mt-1`}
              value={source}
              onChange={setSource}
              options={[
                { value: "walk_in", label: "Walk-in" },
                { value: "referral", label: "Referral" },
                { value: "jobstreet", label: "JobStreet" },
                { value: "facebook", label: "Facebook" },
                { value: "other", label: "Other" },
              ]}
            />
          </div>
          <div>
            <label className={T_LABEL}>Applied Date</label>
            <input
              type="date"
              className={`${INPUT_CLASS} mt-1`}
              value={appliedDate}
              onChange={(e) => setAppliedDate(e.target.value)}
            />
          </div>
          {source === "referral" && (
            <div className="col-span-2">
              <label className={T_LABEL}>Referrer Name</label>
              <input
                type="text"
                className={`${INPUT_CLASS} mt-1`}
                value={referrer}
                onChange={(e) => setReferrer(e.target.value)}
              />
            </div>
          )}
        </div>

        <div>
          <label className={T_LABEL}>Names</label>
          <div className="mt-1 space-y-1.5">
            {names.map((n, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-white/30">
                  {i + 1}
                </span>
                <input
                  ref={(el) => { rowRefs.current[i] = el; }}
                  type="text"
                  className={INPUT_CLASS}
                  value={n}
                  placeholder={i === 0 ? "Full name" : ""}
                  onChange={(e) => setName(i, e.target.value)}
                  onPaste={(e) => handlePaste(i, e)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      rowRefs.current[i + 1]?.focus();
                    }
                  }}
                />
                <button
                  type="button"
                  className="shrink-0 rounded-lg p-1.5 text-zinc-500 hover:bg-white/10 hover:text-white"
                  onClick={() => removeRow(i)}
                  aria-label={`Remove row ${i + 1}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {submitError && (
          <p className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
            {submitError}
          </p>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            className={PRIMARY_BUTTON}
            disabled={saving || filled.length === 0 || !position.position_applied.trim()}
            onClick={handleSubmit}
          >
            {saving
              ? "Saving…"
              : `Add ${filled.length} candidate${filled.length === 1 ? "" : "s"}`}
          </button>
          <button className={SECONDARY_BUTTON} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </ModalScrim>
  );
}

function AddRequisitionModal({
  onSave,
  onClose,
  saving,
}: {
  onSave: (data: AddRequisitionForm) => Promise<string | null>;
  onClose: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<AddRequisitionForm>({
    branch: "",
    position: "",
    reason: "replacement",
    resigned_staff_name: "",
    target_start_date: "",
    priority: "normal",
    requested_by: "",
    notes: "",
    openings: "1",
  });
  const [submitError, setSubmitError] = useState("");
  const set = (k: keyof AddRequisitionForm, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));
  const handleSubmit = async () => {
    setSubmitError("");
    const err = await onSave(form);
    if (err) setSubmitError(err);
  };

  return (
    <ModalScrim className="bg-black/60">
      <div
        className={`${GLASS_CARD} w-full max-w-lg mx-auto my-4 p-6 space-y-4`}
      >
        <div className="flex items-center justify-between">
          <p className={T_SECTION}>Add Requisition</p>
          <button
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={T_LABEL}>Branch *</label>
            <input
              type="text"
              className={`${INPUT_CLASS} mt-1`}
              value={form.branch}
              onChange={(e) => set("branch", e.target.value)}
            />
          </div>
          <div>
            <label className={T_LABEL}>Position *</label>
            <input
              type="text"
              className={`${INPUT_CLASS} mt-1`}
              value={form.position}
              onChange={(e) => set("position", e.target.value)}
            />
          </div>
          <div>
            <label className={T_LABEL}>Reason</label>
            <SelectDark
              className={`${SELECT_CLASS} mt-1`}
              value={form.reason}
              onChange={v => set("reason", v)}
              options={[
                { value: "replacement", label: "Replacement" },
                { value: "new_hire", label: "New Hire" },
                { value: "expansion", label: "Expansion" },
                { value: "buffer", label: "Buffer" },
              ]}
            />
          </div>
          {form.reason === "replacement" && (
            <div>
              <label className={T_LABEL}>Resigned Staff Name</label>
              <input
                type="text"
                className={`${INPUT_CLASS} mt-1`}
                value={form.resigned_staff_name}
                onChange={(e) => set("resigned_staff_name", e.target.value)}
              />
            </div>
          )}
          <div>
            <label className={T_LABEL}>Target Start Date</label>
            <input
              type="date"
              className={`${INPUT_CLASS} mt-1`}
              value={form.target_start_date}
              onChange={(e) => set("target_start_date", e.target.value)}
            />
          </div>
          <div>
            <label className={T_LABEL}>How many people</label>
            <input
              type="number"
              min={1}
              className={`${INPUT_CLASS} mt-1`}
              value={form.openings}
              onChange={(e) => set("openings", e.target.value)}
            />
          </div>
          <div>
            <label className={T_LABEL}>Priority</label>
            <SelectDark
              className={`${SELECT_CLASS} mt-1`}
              value={form.priority}
              onChange={v => set("priority", v)}
              options={[
                { value: "urgent", label: "Urgent" },
                { value: "normal", label: "Normal" },
                { value: "low", label: "Low" },
              ]}
            />
          </div>
          <div className="col-span-2">
            <label className={T_LABEL}>Requested By</label>
            <input
              type="text"
              className={`${INPUT_CLASS} mt-1`}
              value={form.requested_by}
              onChange={(e) => set("requested_by", e.target.value)}
            />
          </div>
          <div className="col-span-2">
            <label className={T_LABEL}>Notes</label>
            <textarea
              className={`${TEXTAREA_CLASS} mt-1`}
              rows={2}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>
        </div>

        {submitError && (
          <p className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
            {submitError}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            className={PRIMARY_BUTTON}
            disabled={saving || !form.branch.trim() || !form.position.trim()}
            onClick={handleSubmit}
          >
            {saving ? "Saving..." : "Add Requisition"}
          </button>
          <button className={SECONDARY_BUTTON} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </ModalScrim>
  );
}

// ─── Needs a decision ────────────────────────────────────────────────────────

/** One list, oldest first, not a board.
 *
 *  Columns are for work in progress. These 63 are not in progress -- they are
 *  waiting on somebody, and the only question the screen has to answer is who
 *  has been waiting longest. A column layout puts that person somewhere in the
 *  middle of one of five stacks.
 */
function DecisionList({
  rows,
  decided,
  onSelect,
  onRecordOutcome,
}: {
  rows: Applicant[];
  decided: Record<string, string>;
  onSelect: (a: Applicant) => void;
  onRecordOutcome: (a: Applicant) => void;
}) {
  if (!rows.length) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-zinc-400">Nothing has been waiting more than {STALE_DAYS} days.</p>
      </div>
    );
  }
  const open = rows.filter((a) => !decided[a.id]);
  const byStatus = open.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1; return acc;
  }, {});
  // People we never replied to at all. Worth its own number: it is the one
  // thing on this screen that is our doing rather than the candidate's.
  const silent = open.filter((a) => a.never_moved).length;

  return (
    <div className="p-3">
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {Object.entries(byStatus).map(([k, n]) => (
          <span key={k} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-300">
            {KANBAN_COLUMNS.find((c) => c.id === k)?.label ?? k}
            <span className="ml-1.5 tabular-nums text-zinc-500">{n}</span>
          </span>
        ))}
        {silent > 0 && (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-200">
            {silent} never had a reply from us
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {rows.map((a) => {
          const waited = a.days_since_move ?? a.days_in_pipeline ?? 0;
          const done = decided[a.id];
          return (
            <div
              key={a.id}
              className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border px-3 py-2.5 ${
                done
                  ? "border-emerald-500/25 bg-emerald-500/5"
                  : "border-white/8 bg-white/3"}`}
            >
              {/* The wait leads the row, in one column, so the eye can run down
                  it. It is the whole sort order and the whole reason to act. */}
              <span className={`w-14 shrink-0 text-right text-sm font-bold tabular-nums ${
                waited > 60 ? "text-red-300" : waited > 30 ? "text-amber-300" : "text-zinc-400"}`}>
                {waited}d
              </span>

              <button
                type="button"
                onClick={() => onSelect(a)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-sm font-medium text-zinc-100">{a.full_name}</p>
                <p className="truncate text-xs text-zinc-500">
                  {a.position_applied || "—"}
                  {a.never_moved
                    ? " · applied and never heard back from us"
                    : ` · last moved ${waited} days ago`}
                  {(a.prior_applications ?? 0) > 0 && (
                    ` · applied before (${a.prior_last_applied ?? "earlier"})`
                  )}
                </p>
              </button>

              <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-zinc-400">
                {KANBAN_COLUMNS.find((c) => c.id === a.status)?.label ?? a.status}
              </span>

              {/* Why it closed, next to the fact that it closed. A no-show is
                  still a rejection, but it says nobody judged them -- and until
                  now the difference was stored and shown nowhere. */}
              {a.rejection_reason && (
                <span
                  className={
                    isNoShow(a.rejection_reason)
                      ? "shrink-0 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-xs text-amber-200"
                      : "shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-zinc-400"
                  }
                  title={isNoShow(a.rejection_reason)
                    ? "They did not turn up for the interview. Closed, but not a judgement of them."
                    : "Why this applicant was closed"}
                >
                  {reasonLabel(a.rejection_reason)}
                </span>
              )}

              {done ? (
                // What was recorded, in words, next to the person it was
                // recorded about. Open them to change it if it was the wrong
                // row -- and the row is still here to be opened.
                <span className="shrink-0 text-xs font-medium text-emerald-300">
                  ✓ {done}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onRecordOutcome(a)}
                  className="shrink-0 rounded-lg border border-violet-500/40 bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-200 hover:bg-violet-500/25 transition-colors"
                >
                  Decide
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Closed ──────────────────────────────────────────────────────────────────

/** Hired and rejected, off the working board but not deleted.
 *
 *  Deleting them would cost three things that are already in use: which source
 *  actually produces hires (Facebook 113 applications, 11 hired; referrals 32
 *  and 3; JobStreet 6 and none), whether somebody has applied before, and any
 *  answer to "what happened to that candidate".
 */
function ClosedList({
  rows,
  total,
  query,
  onQuery,
  onSelect,
}: {
  rows: Applicant[];
  total: number;
  query: string;
  onQuery: (v: string) => void;
  onSelect: (a: Applicant) => void;
}) {
  return (
    <div className="p-3">
      <input
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Search name, position or phone…"
        className="mb-3 w-full max-w-md rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-500/50"
      />
      <p className="mb-2 text-xs text-zinc-500">
        {query ? `${rows.length} of ${total}` : `${total} closed`}
      </p>
      <div className="flex flex-col gap-1">
        {rows.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onSelect(a)}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-white/8 bg-white/3 px-3 py-2 text-left hover:bg-white/6 transition-colors"
          >
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
              a.status === "hired"
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-zinc-500/15 text-zinc-400"}`}>
              {a.status === "hired" ? "Hired" : "Rejected"}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">{a.full_name}</span>
            <span className="truncate text-xs text-zinc-500">{a.position_applied || "—"}</span>
            {/* Why it closed. This is the only screen a rejected applicant
                still appears on, so it is the only place a no-show can be
                told apart from a judgement -- and a no-show is 3 of 559, so
                colouring it is a signal and not a wall of amber.
                Read BOTH columns: closing from the board writes
                rejection_reason and no evaluation row, so one of the three
                no-shows had latest_outcome_reason empty and showed nothing
                here at all. */}
            {(() => {
              const why = a.latest_outcome_reason || a.rejection_reason;
              if (!why) return null;
              return (
                <span
                  className={isNoShow(why)
                    ? "shrink-0 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-xs text-amber-200"
                    : "truncate text-xs text-zinc-600"}
                  title={isNoShow(why)
                    ? "They did not turn up for the interview. Closed, but not a judgement of them."
                    : "Why this applicant was closed"}
                >
                  {reasonLabel(why)}
                </span>
              );
            })()}
            <span className="shrink-0 text-xs tabular-nums text-zinc-600">{a.applied_date}</span>
          </button>
        ))}
        {!rows.length && (
          <p className="py-6 text-center text-sm text-zinc-500">Nothing matches that.</p>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const ALLOWED_ROLES = ["ADMIN", "HQ", "HR_MANAGER", "MANILA_MANAGEMENT", "MANILA_MANAGER"];

export default function HRRecruitmentPage() {
  const router = useRouter();
  const [accessReady, setAccessReady] = useState(false);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedApplicant, setSelectedApplicant] = useState<Applicant | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("info");
  /** The last one-tap stage move, kept so it can be taken back. It stays until
   *  it is used, dismissed, or replaced by the next move -- a bar that fades
   *  after a few seconds is the same as not having one, because the card has
   *  already jumped to another column by then (lesson 56). */
  const [lastMove, setLastMove] =
    useState<{ id: string; name: string; from: KanbanStatus; to: KanbanStatus } | null>(null);
  const [showAddApplicant, setShowAddApplicant] = useState(false);
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [savingBulk, setSavingBulk] = useState(false);
  const [outcomeFor, setOutcomeFor] = useState<Applicant | null>(null);
  const [savingOutcome, setSavingOutcome] = useState(false);
  const [outcomeReasons, setOutcomeReasons] = useState<OutcomeReason[]>([]);
  const [view, setView] = useState<"pipeline" | "plans" | "voice" | "interviews" | "calendar">("pipeline");
  // カレンダーから「この面接を動かす」で飛んできたときの行き先。
  const [focusInterview, setFocusInterview] = useState("");
  // カレンダーの「N answers →」で録音を見に行くときの行き先。
  const [focusVoice, setFocusVoice] = useState(0);
  // Which candidate the board sent us here for, so the Interviews tab opens on
  // them instead of making somebody find the name again in a list of fifteen.
  // The board's own "Send interview link" opens the wording over the card.
  // It used to jump to the Interviews tab, where the name had to be found
  // again in a list of fifteen -- the link was two screens away from the
  // moment somebody decided to send it.
  const [linkFor, setLinkFor] = useState<Applicant | null>(null);
  /** The applicant we are asking for a CV, and the message once it is made. */
  const [cvFor, setCvFor] = useState<Applicant | null>(null);
  const [lane, setLane] = useState<Lane>("active");
  const [closedSearch, setClosedSearch] = useState("");
  // Rows decided during this sitting. On the board a decision moved a card to
  // another column and you saw it happen; in a list the row simply stops
  // existing, which reads the same as a mis-click. They stay until Refresh,
  // which is the explicit "I am done with these" (the same shape as justClosed
  // on the BO Dashboard).
  const [justDecided, setJustDecided] = useState<Record<string, string>>({});
  // The tab carries its own count, and it counts both jobs that are waiting on
  // HR: recordings to listen to, and applicants with no link sent. Counting only
  // the recordings would leave the badge at zero while twenty people sit
  // uninvited, and a badge at zero is a tab nobody opens.
  const [voiceToDo, setVoiceToDo] = useState<{ review: number; invite: number } | null>(null);
  // The Interviews tab carried no number at all, so an interviewer had nothing
  // telling them to open it -- and nothing else tells them either: a booking
  // sends no message to anybody. Two counts, because "today" is the one that
  // cannot wait and "this week" is the one worth knowing about.
  const [interviewsToDo, setInterviewsToDo] = useState<{ today: number; week: number } | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [showAddRequisition, setShowAddRequisition] = useState(false);
  const [showRequisitionsList, setShowRequisitionsList] = useState(false);
  const [savingApplicant, setSavingApplicant] = useState(false);
  const [savingRequisition, setSavingRequisition] = useState(false);

  const authRef = useRef(getAuth());
  /** Read inside a callback without putting the whole list in its deps -- the
   *  undo needs the stage a card was on the instant it was clicked. */
  const applicantsRef = useRef<Applicant[]>([]);

  // ── Auth check ────────────────────────────────────────────────────────────
  useEffect(() => {
    const current = getAuth();
    if (!current) {
      router.replace("/login?next=/admin/hr/recruitment");
      return;
    }
    void refreshAuthFromApi(current).then((resolved) => {
      const auth = resolved || current;
      const role = String(auth?.role || "").toUpperCase();
      if (!ALLOWED_ROLES.includes(role) && !hasRouteAccess("/admin/hr/recruitment", auth)) {
        router.replace("/week");
        return;
      }
      authRef.current = auth;
      setAccessReady(true);
    });
  }, [router]);

  // ── Session-expiry handling ───────────────────────────────────────────────
  // A 401 means the access token expired/was rejected. Clearing the stale auth
  // and sending the user back to login is the only real fix — otherwise every
  // call silently fails behind a tiny banner (and modals look like they hang).
  const redirectToLogin = useCallback(() => {
    clearAuth();
    router.replace("/login?next=/admin/hr/recruitment");
  }, [router]);

  // ── Data load ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    const auth = authRef.current;
    if (!auth) return;
    setLoading(true);
    setError("");
    try {
      const headers = getAuthHeaders(auth);
      const [appRes, reqRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/hr/applicants?city=manila`, {
          headers,
          cache: "no-store",
        }),
        fetch(`${API_BASE}/api/admin/hr/requisitions?city=manila&status=open`, {
          headers,
          cache: "no-store",
        }),
      ]);
      if (appRes.status === 401 || reqRes.status === 401) {
        redirectToLogin();
        return;
      }
      if (!appRes.ok) throw new Error(`Applicants: HTTP ${appRes.status}`);
      const appData = await appRes.json();
      setApplicants(Array.isArray(appData) ? appData : appData?.applicants || []);

      if (reqRes.ok) {
        const reqData = await reqRes.json();
        setRequisitions(Array.isArray(reqData) ? reqData : reqData?.requisitions || []);
      }

      // The voice tab's badge. Fetched here rather than inside the tab, or the
      // number only appears once you have already opened the thing it was
      // meant to send you to. Its own failure is not the pipeline's failure,
      // so it never throws.
      try {
        const vRes = await fetch(
          `${API_BASE}/api/admin/hr/voice-screenings?city=manila&state=to_review&limit=1`,
          { headers, cache: "no-store" });
        if (vRes.ok) {
          const v = await vRes.json();
          setVoiceToDo({
            review: Number(v?.counts?.to_review || 0),
            invite: Number(v?.counts?.to_invite || 0),
          });
        }
      } catch { /* the badge is not worth breaking the page for */ }

      try {
        const iRes = await fetch(
          `${API_BASE}/api/admin/hr/interviews/upcoming?days=7`,
          { headers, cache: "no-store" });
        if (iRes.ok) {
          const iv = await iRes.json();
          setInterviewsToDo({
            today: Number(iv?.today || 0),
            week: Number(iv?.count || 0),
          });
        }
      } catch { /* same: a missing badge must not take the page down */ }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [redirectToLogin]);

  const loadOverview = useCallback(async () => {
    const auth = authRef.current;
    if (!auth) return;
    setLoadingOverview(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/hr/recruitment-overview?city=manila`, {
        cache: "no-store",
        headers: getAuthHeaders(auth),
      });
      if (res.ok) setOverview((await res.json()) as Overview);
    } catch { /* the pipeline view still works */ } finally {
      setLoadingOverview(false);
    }
  }, []);

  useEffect(() => {
    if (accessReady) void loadData();
  }, [accessReady, loadData]);

  useEffect(() => {
    if (accessReady && view === "plans") void loadOverview();
  }, [accessReady, view, loadOverview]);

  /** Coming back to the board reloads it.
   *
   *  The other tabs move people. Shortlisting in Voice screening sends the
   *  applicant from New to Screened on the server and issues their booking
   *  link in the same breath -- but the board was still holding the list it
   *  fetched when the page opened, so switching back showed them sitting in
   *  New as though nothing had happened. Maevelyn Teanchon was screened and
   *  invited at 07:32:31 on 17 Sep and still drawn in the New column
   *  afterwards.
   *
   *  That is worse than a stale number: the next person reads "New" and does
   *  the work again -- sends a second link, or scores a second time. The board
   *  has to be true the moment it is looked at, and a reload on arrival is the
   *  only version of that which cannot miss a change made in a tab that does
   *  not know this one exists.
   *
   *  Skipped on the first mount, where the effect above has just loaded it. */
  const boardLoadedOnce = useRef(false);
  useEffect(() => {
    if (!accessReady) return;
    if (view !== "pipeline") { boardLoadedOnce.current = true; return; }
    if (!boardLoadedOnce.current) return;
    void loadData();
  }, [accessReady, view, loadData]);

  // Fetched rather than hard-coded, so the chips shown here are exactly the
  // values the database will accept.
  useEffect(() => {
    if (!accessReady) return;
    const auth = authRef.current;
    if (!auth) return;
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/admin/hr/interview-outcome-reasons`, {
          headers: getAuthHeaders(auth),
        });
        if (res.ok) setOutcomeReasons(((await res.json())?.reasons ?? []) as OutcomeReason[]);
      } catch { /* the modal still works; the reason chips just stay empty */ }
    })();
  }, [accessReady]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  // Extract a human-readable detail from a failed JSON response (backend
  // returns {"detail": "..."} on validation errors).
  const errorDetail = async (res: Response): Promise<string> => {
    try {
      const data = await res.json();
      if (data?.detail) return String(data.detail);
    } catch {
      /* not JSON */
    }
    return `HTTP ${res.status}`;
  };

  // Both Add modals share the same contract: return null on success (modal
  // closes), or an error string to show inside the still-open modal.
  const handleAddApplicant = async (
    form: AddApplicantForm,
    cv: File,
  ): Promise<string | null> => {
    const auth = authRef.current;
    if (!auth) return "Not signed in.";
    setSavingApplicant(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/hr/applicants`, {
        method: "POST",
        headers: getAuthHeaders(auth),
        body: JSON.stringify({ city: "manila", ...form }),
      });
      if (res.status === 401) {
        redirectToLogin();
        return "Your session has expired. Redirecting to login…";
      }
      if (!res.ok) return `Failed to save applicant: ${await errorDetail(res)}`;
      const created = (await res.json().catch(() => ({}))) as { id?: string };

      // The applicant exists now, so a failed CV must not read as a failed
      // save -- it says which half worked and what is left to do (lesson 46).
      if (created?.id) {
        const fd = new FormData();
        // prepareIfImage shrinks a photo and leaves a PDF alone; a phone photo
        // of a printed CV is several MB and Vercel rejects the request at
        // about 4.3MB before it reaches us (lesson 24).
        const small = await prepareIfImage(cv);
        fd.append("resume", small, small.name);
        // ⚠️ getUploadHeaders, never getAuthHeaders -- the latter pins
        // Content-Type: application/json and the multipart boundary is lost,
        // so the server sees no file at all (lesson 23).
        const up = await fetch(
          `${API_BASE}/api/admin/hr/applicants/${created.id}/resume`,
          { method: "POST", headers: getUploadHeaders(auth), body: fd });
        if (!up.ok) {
          setShowAddApplicant(false);
          void loadData();
          return `${form.full_name} was added, but the CV did not upload `
            + `(${await errorDetail(up)}). Open their card and use `
            + `"No CV — ask for one", or try attaching it again.`;
        }
      }
      setShowAddApplicant(false);
      void loadData();
      return null;
    } catch (e: unknown) {
      return e instanceof Error ? e.message : String(e);
    } finally {
      setSavingApplicant(false);
    }
  };

  const handleClosePlan = async (p: HiringPlan) => {
    const auth = authRef.current;
    if (!auth) return;
    // Says what else moved: closing a plan closes the openings under it, and
    // that should not happen behind the user's back.
    if (!window.confirm(
      `Mark "${p.name}" as done? Any of its openings that are still active will ` +
      `be closed too.`
    )) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/hr/hiring-plans/${p.id}`, {
        method: "PATCH",
        headers: getAuthHeaders(auth),
        body: JSON.stringify({ status: "done" }),
      });
      if (!res.ok) { setError(await errorDetail(res)); return; }
      const body = await res.json().catch(() => ({}));
      const n = Number(body?.requisitions_changed || 0);
      if (n > 0) setError("");
      void loadOverview();
      void loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleCreatePlan = async (data: {
    name: string; branch: string; opening_date: string;
    positions: { position: string; openings: number; priority: string }[];
  }): Promise<string | null> => {
    const auth = authRef.current;
    if (!auth) return "Not signed in.";
    setSavingPlan(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/hr/hiring-plans`, {
        method: "POST",
        headers: getAuthHeaders(auth),
        body: JSON.stringify({ city: "manila", ...data }),
      });
      if (res.status === 401) {
        redirectToLogin();
        return "Your session has expired. Redirecting to login\u2026";
      }
      if (!res.ok) return await errorDetail(res);
      void loadOverview();
      void loadData();
      return null;
    } catch (e: unknown) {
      return e instanceof Error ? e.message : String(e);
    } finally {
      setSavingPlan(false);
    }
  };

  const handleRecordOutcome = async (
    data: { outcome: string; reason: string; notes: string }
  ): Promise<string | null> => {
    const auth = authRef.current;
    if (!auth || !outcomeFor) return "Not signed in.";
    setSavingOutcome(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/admin/hr/applicants/${outcomeFor.id}/interview-outcome`,
        { method: "POST", headers: getAuthHeaders(auth), body: JSON.stringify(data) },
      );
      if (res.status === 401) {
        redirectToLogin();
        return "Your session has expired. Redirecting to login\u2026";
      }
      if (!res.ok) return await errorDetail(res);
      const label = OUTCOME_BUTTONS.find((b) => b.key === data.outcome)?.label
        ?? data.outcome;
      const why = outcomeReasons.find((r) => r.key === data.reason)?.label ?? "";
      setJustDecided((m) => ({ ...m, [outcomeFor.id]: why ? `${label} — ${why}` : label }));
      void loadData();
      return null;
    } catch (e: unknown) {
      return e instanceof Error ? e.message : String(e);
    } finally {
      setSavingOutcome(false);
    }
  };

  const handleBulkAdd = async (data: {
    names: string[];
    position_applied: string;
    requisition_id: string;
    assigned_branch: string;
    source: string;
    referrer_name: string;
    applied_date: string;
  }): Promise<{ error: string | null; result: BulkAddResult | null }> => {
    const auth = authRef.current;
    if (!auth) return { error: "Not signed in.", result: null };
    setSavingBulk(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/hr/applicants/bulk`, {
        method: "POST",
        headers: getAuthHeaders(auth),
        body: JSON.stringify({ city: "manila", ...data }),
      });
      if (res.status === 401) {
        redirectToLogin();
        return { error: "Your session has expired. Redirecting to login\u2026", result: null };
      }
      if (!res.ok) return { error: `Failed to save: ${await errorDetail(res)}`, result: null };
      const body = await res.json();
      return {
        error: null,
        result: {
          created_count: Number(body?.created_count || 0),
          skipped: (body?.skipped || []) as string[],
        },
      };
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e), result: null };
    } finally {
      setSavingBulk(false);
    }
  };

  const handleAddRequisition = async (
    form: AddRequisitionForm
  ): Promise<string | null> => {
    const auth = authRef.current;
    if (!auth) return "Not signed in.";
    setSavingRequisition(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/hr/requisitions`, {
        method: "POST",
        headers: getAuthHeaders(auth),
        body: JSON.stringify({
          city: "manila",
          ...form,
          openings: Math.max(1, Number(form.openings) || 1),
        }),
      });
      if (res.status === 401) {
        redirectToLogin();
        return "Your session has expired. Redirecting to login…";
      }
      if (!res.ok) return `Failed to save requisition: ${await errorDetail(res)}`;
      setShowAddRequisition(false);
      void loadData();
      return null;
    } catch (e: unknown) {
      return e instanceof Error ? e.message : String(e);
    } finally {
      setSavingRequisition(false);
    }
  };

  useEffect(() => { applicantsRef.current = applicants; }, [applicants]);

  const handleStatusChange = useCallback(
    (id: string, status: KanbanStatus) => {
      setApplicants((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status } : a))
      );
      if (selectedApplicant?.id === id) {
        setSelectedApplicant((prev) => (prev ? { ...prev, status } : prev));
      }
    },
    [selectedApplicant]
  );

  const patchStatus = useCallback(
    async (id: string, newStatus: KanbanStatus, origin: string) => {
      const auth = authRef.current;
      if (!auth) return;
      // Optimistic update
      handleStatusChange(id, newStatus);
      try {
        const res = await fetch(`${API_BASE}/api/admin/hr/applicants/${id}`, {
          method: "PATCH",
          headers: getAuthHeaders(auth),
          // The history is only worth reading if it says where the move came
          // from. Left unset this defaults to "detail_panel", which is untrue
          // for every card on the board.
          body: JSON.stringify({ status: newStatus, origin_screen: origin }),
        });
        if (!res.ok) {
          // Revert on error by reloading
          void loadData();
        }
      } catch {
        void loadData();
      }
    },
    [handleStatusChange, loadData]
  );

  const handleQuickStatus = useCallback(
    async (id: string, newStatus: KanbanStatus) => {
      const from = applicantsRef.current.find((a) => a.id === id);
      if (from) {
        setLastMove({ id, name: from.full_name, from: from.status, to: newStatus });
      }
      await patchStatus(id, newStatus, "board");
    },
    [patchStatus]
  );

  /** Close somebody nobody is going to message now.
   *
   *  Not a delete. The row is what tells us they already applied -- the board
   *  matches on phone to catch the same person applying twice, and Closed is
   *  where the history is read from. Deleting cannot be undone and takes that
   *  with it; this only moves them out of the working column, and the reason
   *  is recorded so the record says why rather than just going quiet.
   */
  const handleCloseStale = useCallback(
    async (a: Applicant) => {
      const auth = authRef.current;
      if (!auth) return;
      if (!window.confirm(
        `Close ${a.full_name}? They applied ${a.days_in_pipeline} days ago and will `
        + `move to Closed as "no answer". Undo is at the top of the board.`)) return;
      setLastMove({ id: a.id, name: a.full_name, from: a.status, to: "rejected" });
      handleStatusChange(a.id, "rejected");
      setError("");
      try {
        const res = await fetch(`${API_BASE}/api/admin/hr/applicants/${a.id}`, {
          method: "PATCH",
          headers: getAuthHeaders(auth),
          body: JSON.stringify({
            status: "rejected",
            // `lapsed` -- "We did not get back to them in time". That is what
            // happened: they applied two months ago and the first message went
            // out today. It has to be one of the keys the server knows, and a
            // count of this one is the number the hiring process should be
            // judged on, so it is worth being honest about.
            rejection_reason: "lapsed",
            origin_screen: "board_stale_close",
          }),
        });
        if (!res.ok) {
          // Never close the card on a failure. The optimistic move already put
          // it in Closed; without this the person reads as closed and the
          // server still has them open.
          const text = await res.text().catch(() => "");
          setError(`${a.full_name} was not closed — ${text.slice(0, 160) || res.status}`);
          void loadData();
        }
      } catch {
        setError(`${a.full_name} was not closed — could not reach the server.`);
        void loadData();
      }
    },
    [handleStatusChange, loadData],
  );

  const handleUndoMove = useCallback(async () => {
    if (!lastMove) return;
    const m = lastMove;
    setLastMove(null);
    await patchStatus(m.id, m.from, "board_undo");
  }, [lastMove, patchStatus]);

  // ── Kanban grouping ───────────────────────────────────────────────────────

  const lanes = applicants.reduce(
    (acc, a) => { acc[laneOf(a)].push(a); return acc; },
    { active: [] as Applicant[], decide: [] as Applicant[], closed: [] as Applicant[] }
  );

  const grouped = OPEN_COLUMNS.reduce(
    (acc, col) => {
      const cards = lanes.active.filter((a) => a.status === col.id);
      // Screened is a worklist, so it is ordered by what is left to do: the
      // people with no link, then the ones holding one nobody sent, then the
      // ones only copied, and the finished ones last. It used to come back in
      // the server's order, which mixed them -- with 43 cards the ones needing
      // a message sat below ones already done and were simply missed.
      //
      // Longest wait first inside each group, so the person who has been
      // waiting 53 days is above the one who applied on Tuesday.
      acc[col.id] = col.id === "screened"
        ? cards
            .map((a, i) => ({ a, i, rank: LINK_RANK[linkStateOf(a)] }))
            .sort((x, y) =>
              (x.rank - y.rank)
              // The badge on the card shows days_in_pipeline, so the order
              // uses the same number. days_since_move is 0 for everybody here
              // -- sending the link touched the row today -- so sorting on it
              // did nothing at all.
              || ((y.a.days_in_pipeline ?? 0) - (x.a.days_in_pipeline ?? 0))
              || (x.i - y.i))
            .map((x) => x.a)
        : cards;
      return acc;
    },
    {} as Record<KanbanStatus, Applicant[]>
  );

  // Oldest first, and the oldest is the first row -- the point of this screen
  // is being able to name the longest-waiting person without scrolling.
  const decideRows = [
    ...lanes.decide,
    // Decided a moment ago and therefore no longer stalled -- kept in place so
    // the person who pressed the button can see what they recorded.
    ...applicants.filter((a) => justDecided[a.id] && laneOf(a) !== "decide"),
  ].sort(
    (a, b) => (b.days_since_move ?? b.days_in_pipeline ?? 0)
            - (a.days_since_move ?? a.days_in_pipeline ?? 0));

  const closedQuery = closedSearch.trim().toLowerCase();
  const closedRows = [...lanes.closed]
    .filter((a) => !closedQuery
      || a.full_name.toLowerCase().includes(closedQuery)
      || (a.position_applied || "").toLowerCase().includes(closedQuery)
      || (a.phone || "").includes(closedQuery))
    .sort((a, b) => (b.applied_date || "").localeCompare(a.applied_date || ""));

  const getNextStatus = (current: KanbanStatus): KanbanStatus | null => {
    const idx = ALL_STATUSES.indexOf(current);
    if (idx < 0 || current === "hired" || current === "rejected") return null;
    return ALL_STATUSES[idx + 1] || null;
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (!accessReady) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className={T_BODY}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* ── Page Header ── */}
      <div className="shrink-0 border-b border-white/10 bg-[#0d1117]/80 backdrop-blur px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className={T_PAGE_TITLE}>HR Recruitment Pipeline</h1>
            {/* 日本人店長の検査は別経路（派遣会社経由・応募フォームを通らない）
                なのでタブではなくリンク。ここに置かないと URL を知る人しか
                辿り着けない。 */}
            <a href="/admin/hr/manager-assessment"
                  className="rounded-full border border-white/12 px-3 py-1 text-xs text-zinc-300 transition hover:border-violet-400/50 hover:text-violet-300">
              店長適性検査（日本人）
            </a>
            <div className={TAB_CONTAINER}>
              {([["pipeline", "Pipeline"], ["plans", "Plans"], ["voice", "Voice screening"], ["interviews", "Interviews"], ["calendar", "Calendar"]] as const).map(([k, label]) => (
                <button
                  key={k}
                  className={view === k ? TAB_ACTIVE : TAB_INACTIVE}
                  onClick={() => setView(k)}
                >
                  {label}
                  {k === "voice" && voiceToDo && (voiceToDo.review + voiceToDo.invite) > 0 ? (
                    <span
                      className="ml-1.5 rounded-full bg-violet-500/25 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-violet-200"
                      title={`${voiceToDo.review} to review, ${voiceToDo.invite} to invite`}
                    >
                      {voiceToDo.review + voiceToDo.invite}
                    </span>
                  ) : null}
                  {k === "interviews" && interviewsToDo && interviewsToDo.week > 0 ? (
                    <span
                      className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                        interviewsToDo.today > 0
                          ? "bg-amber-500/25 text-amber-200"
                          : "bg-violet-500/25 text-violet-200"
                      }`}
                      title={interviewsToDo.today > 0
                        ? `${interviewsToDo.today} today, ${interviewsToDo.week} in the next 7 days`
                        : `${interviewsToDo.week} in the next 7 days`}
                    >
                      {interviewsToDo.today > 0 ? interviewsToDo.today : interviewsToDo.week}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className={`${SECONDARY_BUTTON} flex items-center gap-1.5`}
              onClick={() => { setJustDecided({}); void loadData(); }}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              className={`${SECONDARY_BUTTON} flex items-center gap-1.5`}
              onClick={() => setShowAddRequisition(true)}
            >
              <ClipboardList className="h-4 w-4" />
              + Requisition
            </button>
            <button
              className={`${SECONDARY_BUTTON} flex items-center gap-1.5`}
              onClick={() => setShowBulkAdd(true)}
            >
              <Plus className="h-4 w-4" />
              Add Several
            </button>
            <button
              className={`${PRIMARY_BUTTON} flex items-center gap-1.5`}
              onClick={() => setShowAddApplicant(true)}
            >
              <Plus className="h-4 w-4" />
              Add Applicant
            </button>
          </div>
        </div>

        {/* KPI summary */}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className={`${T_CAPTION} text-zinc-400`}>
            Total:{" "}
            <span className="font-semibold text-white">{applicants.length}</span>
          </span>
          {KANBAN_COLUMNS.filter((c) => c.id !== "rejected").map((col) => {
            const count = grouped[col.id]?.length || 0;
            if (count === 0) return null;
            return (
              <span key={col.id} className={`${T_CAPTION} text-zinc-400`}>
                {col.label}:{" "}
                <span className="font-semibold text-white">{count}</span>
              </span>
            );
          })}
          {/* A CV landing is the one thing on this board that happens without
              anybody here doing it, so it is the one thing you cannot find by
              remembering what you did. Counted only while they are still in
              New -- past that the CV is not what the row is waiting on. */}
          {(() => {
            const n = (grouped.new || []).filter(
              (a) => cvStateOf(a) === "arrived").length;
            if (n === 0) return null;
            return (
              <span className={`${T_CAPTION} flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2 py-0.5 text-emerald-300`}>
                <FileText className="h-3 w-3" />
                CV arrived: <span className="font-semibold">{n}</span>
              </span>
            );
          })()}
          <button
            onClick={() => setShowRequisitionsList((v) => !v)}
            className={`ml-auto flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all ${
              showRequisitionsList
                ? "border-violet-500/40 bg-violet-500/15 text-violet-300"
                : "border-white/10 bg-white/5 text-zinc-400 hover:text-white"
            }`}
          >
            <ClipboardList className="h-3 w-3" />
            Open Requisitions ({requisitions.length})
            <span className="ml-0.5">{showRequisitionsList ? "▲" : "▼"}</span>
          </button>
        </div>

        {/* Requisitions list panel */}
        {showRequisitionsList && (
          <div className="mt-3 border-t border-white/10 pt-3">
            {requisitions.length === 0 ? (
              <p className="text-xs text-zinc-500">No open requisitions.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {requisitions.map((r) => (
                  <div key={r.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs min-w-[160px]">
                    <p className="font-semibold text-white">{r.branch} — {r.position}</p>
                    <p className="text-zinc-400 capitalize">{r.reason?.replace("_", " ")} · {r.priority}</p>
                    <p className="mt-1 tabular-nums text-zinc-300">
                      {r.filled_count ?? 0}/{r.openings ?? 1} filled
                      {(r.candidate_count ?? 0) > 0 && (
                        <span className="text-zinc-500"> · {r.candidate_count} candidates</span>
                      )}
                    </p>
                    {(r.candidate_count ?? 0) === 0 && (
                      <p className="mt-0.5 text-amber-400">No candidates yet</p>
                    )}
                    <p className="text-zinc-500 mt-0.5">by {r.requested_by}</p>
                    {r.target_start_date && (
                      <p className={`mt-0.5 ${(r.days_to_target ?? 0) < 0 ? "text-red-400" : "text-zinc-600"}`}>
                        Start: {r.target_start_date}
                        {(r.days_to_target ?? 0) < 0 &&
                          ` · ${Math.abs(r.days_to_target ?? 0)}d late`}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="mt-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
            {error}
          </p>
        )}
      </div>

      {view === "calendar" ? (
        /* Its own tab. Sitting above the Interviews list, it was something you
           found by scrolling on a tab named after something else -- "where is
           the calendar" is not a question a calendar should provoke. */
        <InterviewCalendar
          onOpenInterview={(id) => { setFocusInterview(id); setView("interviews"); }}
          onOpenVoice={(sid) => { setFocusVoice(sid); setView("voice"); }}
        />
      ) : view === "interviews" ? (
        <>
          {/* Two panels sit on this tab and nothing said how they relate.
              One line, no counts -- the counts are on the panels themselves and
              a second copy of a number is a second chance to disagree with it. */}
          <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-zinc-400">
            <span className="text-zinc-300">Screened</span>
            <ArrowRight className="mx-2 inline h-3.5 w-3.5 text-zinc-600" />
            <span className="text-zinc-300">you send them a link</span>
            <span className="text-zinc-600"> (first panel — nothing is sent for you)</span>
            <ArrowRight className="mx-2 inline h-3.5 w-3.5 text-zinc-600" />
            <span className="text-zinc-300">they pick their own time</span>
            <ArrowRight className="mx-2 inline h-3.5 w-3.5 text-zinc-600" />
            <span className="text-zinc-300">it appears below</span>
            <span className="text-zinc-600">
              {" "}and on the <span className="text-zinc-400">Calendar</span> tab. Moving,
              cancelling and recording the outcome all happen on the interview itself, below.
            </span>
          </div>
          <BookingLinksToSend />
          <InterviewDay
            focusId={focusInterview}
            onFocusHandled={() => setFocusInterview("")}
          />
        </>
      ) : view === "voice" ? (
        <VoiceScreeningQueue
          focusScreeningId={focusVoice}
          onFocusHandled={() => setFocusVoice(0)}
          onApplicantMoved={() => void loadData()}
        />
      ) : view === "plans" ? (
        <PlansView
          data={overview}
          loading={loadingOverview}
          onReload={() => void loadOverview()}
          onNewPlan={() => setShowNewPlan(true)}
          onClosePlan={handleClosePlan}
        />
      ) : (
        <>
          {/* Three screens rather than one board of 152 cards. The counts are on
              the tabs because the number of people waiting on a decision is the
              reason to open that screen, and it has to be readable without
              opening it. */}
          <div className="flex flex-wrap items-center gap-1.5 px-3 pt-3">
            {(["active", "decide", "closed"] as Lane[]).map((k) => {
              // The decide count is what is left to do, so a decision taken a
              // moment ago comes off it even while its row is still on screen.
              const n = k === "decide"
                ? lanes.decide.filter((a) => !justDecided[a.id]).length
                : lanes[k].length;
              const urgent = k === "decide" && n > 0;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setLane(k)}
                  className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors ${
                    lane === k
                      ? "border-violet-500/50 bg-violet-500/20 text-violet-100"
                      : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10"
                  }`}
                >
                  {LANE_LABEL[k]}
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-xs tabular-nums ${
                    urgent ? "bg-amber-500/25 text-amber-200" : "bg-white/10 text-zinc-300"}`}>
                    {n}
                  </span>
                </button>
              );
            })}
            <p className="ml-1 text-xs text-zinc-500">
              {lane === "active"
                ? `Moved within the last ${STALE_DAYS} days`
                : lane === "decide"
                ? `Nothing has happened for over ${STALE_DAYS} days`
                : "Hired and rejected — kept so the source figures and repeat applications still work"}
            </p>
          </div>

          {/* Taking back the last move. The one-tap button only goes forward
              and the card leaves the column as it is pressed, so without this
              the way back was: find the card in its new column, open it, find
              a dropdown, pick the old stage. Four steps for a slip. */}
          {lastMove && (
            <div className="mx-3 mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-950/20 px-3 py-2">
              <p className="text-xs text-amber-100">
                Moved <span className="font-semibold">{lastMove.name}</span> to{" "}
                {KANBAN_COLUMNS.find((c) => c.id === lastMove.to)?.label}
              </p>
              <button
                className={`${SMALL_BUTTON} flex items-center gap-1`}
                onClick={() => void handleUndoMove()}
              >
                <Undo2 className="h-3 w-3" />
                Undo — back to {KANBAN_COLUMNS.find((c) => c.id === lastMove.from)?.label}
              </button>
              <button
                className="ml-auto text-xs text-zinc-500 hover:text-zinc-300"
                onClick={() => setLastMove(null)}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* One row: whichever screen is selected, plus the detail panel beside
              it. The panel sits outside the choice on purpose -- when it lived
              inside the board branch, clicking a name on either of the other two
              screens set the selection and drew nothing. */}
          <div className="flex">
            <div className="min-w-0 flex-1 overflow-x-auto">
            {lane === "decide" ? (
              <DecisionList
                rows={decideRows}
                decided={justDecided}
                onSelect={setSelectedApplicant}
                onRecordOutcome={setOutcomeFor}
              />
            ) : lane === "closed" ? (
              <ClosedList
                rows={closedRows}
                total={lanes.closed.length}
                query={closedSearch}
                onQuery={setClosedSearch}
                onSelect={setSelectedApplicant}
              />
            ) : (
              <div className="grid gap-2 p-3" style={{ gridTemplateColumns: `repeat(${OPEN_COLUMNS.length}, minmax(0, 1fr))` }}>
                {OPEN_COLUMNS.map((col) => {
                  const cards = grouped[col.id] || [];
                  return (
                    <div
                      key={col.id}
                      className={`flex min-w-0 flex-col rounded-2xl border-t-2 ${col.color} border border-white/8 bg-white/3`}
                    >
                      {/* Column header */}
                      <div className="shrink-0 flex items-center justify-between px-3 py-2.5 border-b border-white/8">
                        <span className="text-sm font-semibold text-zinc-200">{col.label}</span>
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold text-zinc-300 tabular-nums">
                          {cards.length}
                        </span>
                      </div>

                      {/* Screened only, and only the two numbers worth acting
                          on. Forty-three cards is too many to read one by one
                          to find out who still needs sending. */}
                      {col.id === "screened" && cards.length > 0 && (() => {
                        const none = cards.filter((a) => linkStateOf(a) === "none").length;
                        const made = cards.filter((a) => linkStateOf(a) === "made").length;
                        const half = cards.filter((a) => linkStateOf(a) === "copied").length;
                        if (!none && !made && !half) return null;
                        return (
                          <p className="shrink-0 px-3 py-1.5 text-[10px] text-amber-400 border-b border-white/8">
                            {[
                              none > 0 ? `${none} need a link` : "",
                              made > 0 ? `${made} have one, not sent` : "",
                              half > 0 ? `${half} copied, not confirmed` : "",
                            ].filter(Boolean).join(" · ")}
                          </p>
                        );
                      })()}

                      <div className="space-y-2 p-2">
                        {cards.length === 0 ? (
                          <p className="text-center text-xs text-zinc-600 pt-6">Empty</p>
                        ) : (
                          cards.map((applicant) => (
                            <KanbanCard
                              key={applicant.id}
                              applicant={applicant}
                              onSelect={() => {
                                setDetailTab("info");
                                setSelectedApplicant(applicant);
                              }}
                              onQuickStatus={handleQuickStatus}
                              onRecordOutcome={setOutcomeFor}
                              onSendLink={(a) => setLinkFor(a)}
                              onCloseStale={handleCloseStale}
                              onAskForCv={setCvFor}
                              onRecordOffer={(a) => {
                                setDetailTab("offer");
                                setSelectedApplicant(a);
                              }}
                              nextStatus={getNextStatus(applicant.status)}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            </div>

            {/* Detail panel. It follows the page now: it used to sit at the top
                of a very long row, so clicking somebody near the bottom of a
                101-card column drew their details off-screen and you had to
                scroll back up to read them. self-start is required — a
                stretched flex item has no room to move. */}
            {selectedApplicant && (
              <div className="hidden md:flex w-[360px] shrink-0 border-l border-white/10 bg-[#0d1117]/95 p-4 flex-col sticky top-4 self-start h-[calc(100vh-5rem)]">
                <DetailPanel
                  key={`${selectedApplicant.id}:${detailTab}`}
                  applicant={selectedApplicant}
                  onClose={() => setSelectedApplicant(null)}
                  onStatusChange={handleStatusChange}
                  onRecordOutcome={setOutcomeFor}
                  onRefresh={() => void loadData()}
                  reasons={outcomeReasons}
                  initialTab={detailTab}
                />
              </div>
            )}
          </div>

          {/* Mobile detail panel: bottom sheet */}
          {selectedApplicant && (
            <div className="md:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setSelectedApplicant(null)}>
              <div
                className="absolute bottom-0 left-0 right-0 h-[85vh] overflow-hidden flex flex-col rounded-t-2xl border-t border-white/10 bg-[#0d1117] p-4"
                onClick={(e) => e.stopPropagation()}
              >
                <DetailPanel
                  key={`${selectedApplicant.id}:${detailTab}`}
                  applicant={selectedApplicant}
                  onClose={() => setSelectedApplicant(null)}
                  onStatusChange={handleStatusChange}
                  onRecordOutcome={setOutcomeFor}
                  onRefresh={() => void loadData()}
                  reasons={outcomeReasons}
                  initialTab={detailTab}
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showAddApplicant && (
        <AddApplicantModal
          requisitions={requisitions}
          onSave={handleAddApplicant}
          onClose={() => setShowAddApplicant(false)}
          saving={savingApplicant}
        />
      )}
      {showNewPlan && (
        <NewPlanModal
          onSave={handleCreatePlan}
          onClose={() => setShowNewPlan(false)}
          saving={savingPlan}
        />
      )}
      {cvFor && (
        <CvRequestModal
          applicant={cvFor}
          onClose={() => { setCvFor(null); void loadData(); }}
        />
      )}
      {linkFor && (
        <ModalScrim className="bg-black/60">
          <div className={`${GLASS_CARD} w-full max-w-2xl mx-auto my-4 p-6 space-y-3`}>
            <div className="flex items-center justify-between">
              <p className={T_SECTION}>Interview link — {linkFor.full_name}</p>
              <button
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
                onClick={() => { setLinkFor(null); void loadData(); }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className={T_CAPTION}>
              Copy the wording below and send it from SMS or Viber yourself — the OS
              does not send it. They pick their own time, and the card moves to
              Interview Sched. by itself once they book.
            </p>
            {/* The same component the Interviews tab uses, filtered to this one
                person. Writing a second copy of the issue-and-copy path here
                would put the re-issue warning, the copy trace and the SMS gate
                in one of them only. */}
            <BookingLinksToSend onlyApplicantId={linkFor.id} autoOpen compact />
          </div>
        </ModalScrim>
      )}
      {outcomeFor && (
        <InterviewOutcomeModal
          applicant={outcomeFor}
          reasons={outcomeReasons}
          onSubmit={handleRecordOutcome}
          onClose={() => setOutcomeFor(null)}
          saving={savingOutcome}
        />
      )}
      {showBulkAdd && (
        <BulkAddModal
          requisitions={requisitions}
          onSave={handleBulkAdd}
          onClose={() => { setShowBulkAdd(false); void loadData(); }}
          saving={savingBulk}
        />
      )}
      {showAddRequisition && (
        <AddRequisitionModal
          onSave={handleAddRequisition}
          onClose={() => setShowAddRequisition(false)}
          saving={savingRequisition}
        />
      )}
    </div>
  );
}
