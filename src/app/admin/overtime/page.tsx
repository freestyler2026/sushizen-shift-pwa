"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, Banknote, CheckCircle, Clock, Download, UserCheck, XCircle } from "lucide-react";
import { getAuth, refreshAuthFromApi } from "@/lib/auth";
import { BRANCHES } from "@/lib/branches";
import SelectDark from "@/components/SelectDark";
import ModalScrim, { BodyScrollLock } from "@/components/ModalScrim";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  INPUT_CLASS,
  SELECT_CLASS,
  TEXTAREA_CLASS,
  T_PAGE_TITLE,
  T_SECTION,
  T_CAPTION,
  T_LABEL,
  BADGE_SUCCESS,
  BADGE_WARNING,
  BADGE_ERROR,
  BADGE_INFO,
  TAB_ACTIVE,
  TAB_INACTIVE,
  TABLE_HEADER,
  TABLE_ROW,
  TABLE_CELL,
} from "@/lib/ui-tokens";

type OTRequest = {
  id: string;
  staff_name: string;
  branch_code: string;
  work_date: string;
  request_type: "pre" | "post";
  ot_start_hour: number;
  ot_end_hour: number;
  ot_minutes: number;
  reason: string;
  status: "pending" | "manager_approved" | "paid" | "approved" | "rejected";
  reviewed_by: string;
  reviewed_at: string | null;
  review_note: string;
  manager_approved_by: string;
  manager_approved_at: string | null;
  manager_note: string;
  paid_by: string;
  paid_at: string | null;
  submitted_at: string;
  workload?: Workload;
  ot_facts?: OtFacts;
  review_reason_code?: string;
  cause_codes?: string;
  ot_context?: OtContext;
  asked_after_start_minutes?: number | null;
  /** Whether the same person arrived late that day, from the roster and the
      punch. The claim and the punch live in different places, so a request for
      fifty minutes used to carry no hint that the shift had started
      thirty-two minutes before the person did. */
  late_minutes_that_day?: number | null;
  late_that_day?: boolean;
  shift_start_that_day?: number | null;
  clock_in_that_day?: string | null;
  /** Set when the claimed hours belong to the shift of the day BEFORE the one
      on the request — a closing shift that ran past midnight is filed on the
      following date, because the form fills in the calendar date at the moment
      of filing. Null when they are the same day. */
  ot_shift_day?: string | null;
  ot_minutes_original?: number | null;
  ot_minutes_source?: string;
  ot_minutes_set_by?: string;
  ot_minutes_reason?: string;
  disputed_at?: string | null;
  dispute_note?: string;
  dispute_closed_at?: string | null;
};

/** Whether the night was actually busy — advisory, never blocks an approval. */
type Workload = {
  level: "ok" | "watch" | "check" | "unknown";
  headline: string;
  demand: { orders: number; usual: number; pct: number; sample_days: number } | null;
  staffing: { rostered: number; usual: number } | null;
  hour_detail: { orders_in_window: number; hours: number[] } | null;
  same_night_requests: number;
  basis?: string;
};

/**
 * What the roster and the clock say, for Manila. Read-only: nothing here
 * blocks or changes an approval, it just puts the two numbers the reviewer
 * never had on the screen beside the one they were given.
 */
type OtFacts = {
  shift_segments: number[][];
  punch_in: number | null;
  punch_out: number | null;
  before_minutes: number | null;
  after_minutes: number | null;
  gap_minutes: number | null;
  computed_minutes: number | null;
  claimed_minutes: number | null;
  delta_minutes: number | null;
  unavailable: string | null;
};

type ModalAction = "manager_approve" | "mark_paid" | "remove_from_payroll" | "reject";

/**
 * The grounds a refusal can stand on. Mirrors OT_REJECT_REASONS on the server,
 * which validates them — this list only builds the picker.
 *
 * These are not invented: they are what reviewers actually wrote in the free
 * text ("There was no request in advance.", "There is no post on Discord and
 * preapproval form the manager", "The OT hours is wrongly submitted"). The
 * other 18 of 25 rejections said nothing at all.
 */
const REJECT_REASONS: { code: string; label: string; needsNote: boolean; hint: string }[] = [
  { code: "no_advance_request", label: "No request or approval before it started",
    needsNote: false, hint: "Nothing was sent or agreed before the hours were worked." },
  { code: "clock_mismatch", label: "The hours do not match the clock",
    needsNote: false, hint: "The shift and the punches are shown above, and the employee sees them too." },
  { code: "inside_shift", label: "The hours are inside the rostered shift",
    needsNote: false, hint: "Those hours are already paid as the ordinary day." },
  { code: "avoidable", label: "Could have been finished within the shift",
    needsNote: true, hint: "Say what should have been done differently. This is a judgement, so it needs a sentence." },
  { code: "other", label: "Something else", needsNote: true, hint: "" },
];

/** What the branch was like that night — Manila stores. See
 *  app/db_manila_ot_context.py for why it is these three and why nothing is
 *  pooled across branches. */
type OtContext = {
  level: "explained" | "ordinary" | "unknown";
  headline: string;
  orders: { count: number; usual: number; pct: number; sample_days: number } | null;
  crew: { on: number; usual: number; incomplete?: boolean } | null;
  backup: { items: number; below: number; pct: number } | null;
  crew_note: string | null;
  basis?: string;
  unavailable: string | null;
};

/**
 * The three facts, on the row.
 *
 * "Ordinary" is deliberately neutral, never red. It is the absence of an
 * automatic explanation, not evidence of anything — a row marked as a fault
 * for being unremarkable is how a queue fills with noise and the cases that
 * matter get lost in it.
 */
function ContextCell({ c }: { c?: OtContext }) {
  const [open, setOpen] = useState(false);
  if (!c) return null;
  if (c.unavailable) {
    return <span className="block text-[11px] text-white/30">{c.unavailable}</span>;
  }
  const style =
    c.level === "explained"
      ? "border-emerald-500/40 bg-emerald-900/25 text-emerald-300"
      : "border-white/15 bg-white/5 text-zinc-400";
  const label = c.level === "explained" ? "the night accounts for it" : "nothing unusual";
  return (
    <div className="min-w-[160px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-80 ${style}`}
      >
        {label}
      </button>
      {open && (
        <div className="mt-2 space-y-1 rounded-lg border border-white/10 bg-black/30 p-2 text-[11px] leading-relaxed text-white/70">
          <p className="font-medium text-white/90">{c.headline}</p>
          {c.orders && (
            <p>
              Orders: <span className="text-white">{c.orders.count}</span> · usual{" "}
              <span className="text-white">{c.orders.usual}</span>{" "}
              ({c.orders.pct >= 0 ? "+" : ""}{c.orders.pct}%)
            </p>
          )}
          {c.crew ? (
            <p>
              On across these hours: <span className="text-white">{c.crew.on}</span> · usual{" "}
              <span className="text-white">{c.crew.usual}</span>
              {c.crew.incomplete && (
                <span className="ml-2 text-amber-300/80">
                  — that evening&apos;s roster looks incomplete, not thin
                </span>
              )}
            </p>
          ) : c.crew_note ? (
            <p className="text-white/40">{c.crew_note}</p>
          ) : null}
          {c.backup ? (
            <p>
              Morning prep: <span className="text-white">{c.backup.below}</span> of{" "}
              <span className="text-white">{c.backup.items}</span> items under par
              ({c.backup.pct}%)
            </p>
          ) : (
            <p className="text-white/40">No morning backup report that day</p>
          )}
          {c.basis && <p className="text-white/40">Compared against the {c.basis}.</p>}
          <p className="text-white/40">
            Facts about that night, not a prediction — the pattern behind them holds at one
            branch and not the others. This never blocks an approval.
          </p>
        </div>
      )}
    </div>
  );
}

const CAUSE_LABELS: Record<string, string> = {
  orders: "More orders",
  short_staffed: "Short-staffed",
  equipment: "Equipment",
  delivery: "Delivery / stock",
  closing: "Closing ran long",
  deadline: "A deadline",
  prep_unfinished: "Prep not finished",
  carry_over: "Earlier shift's work",
};
/** The two that point at how the shift was run, not at what happened to it.
 *  Marked so the pattern is visible; it decides nothing by itself. */
const AVOIDABLE_CAUSES = new Set(["prep_unfinished", "carry_over"]);

/**
 * When the request actually arrived, relative to the overtime starting.
 *
 * The Pre/Post badge is self-declared and wrong more often than not: of 22
 * Manila requests marked "pre", five were sent before the hours began. This is
 * computed from submitted_at, and it is what the ground "no request or approval
 * before it started" has to rest on.
 */
function AskedWhen({ minutes }: { minutes?: number | null }) {
  if (minutes === null || minutes === undefined) return null;
  if (minutes < 0) {
    return (
      <span className="mt-0.5 block text-[11px] text-emerald-300">
        asked in advance
      </span>
    );
  }
  const label = minutes < 60
    ? `asked ${Math.round(minutes)}m after it started`
    : minutes < 60 * 12
    ? `asked ${formatMinutes(Math.round(minutes))} after it started`
    : "asked the next day or later";
  return <span className="mt-0.5 block text-[11px] text-amber-300/80">{label}</span>;
}

/** Late that day, beside the claim.
 *
 *  Dubai asked whether a claim had been made to offset a late arrival. This is
 *  the number that answers it, and it is only a number: nothing is blocked and
 *  no request is scored. Of 235 requests since July, four have a claim close
 *  enough to the lateness to look like a trade, and the one that prompted the
 *  question is not among the people who do it — he was late once in
 *  twenty-four days and leaves most of his overtime unclaimed. The reviewer
 *  decides; the screen just stops hiding half of it.
 */
/** The claim was filed on the day after the shift it extends.
 *
 *  Jheymar Fabros worked 15:00–24:00 on the 17th, clocked out at 01:30 and
 *  filed 00:00–01:30 against the 18th — so the 18th reads as 140 minutes of
 *  overtime for a man who stayed 50 minutes over that day. The hours are
 *  right; the date is the one the form filled in at 02:03.
 */
function OvernightTail({ r }: { r: OTRequest }) {
  if (!r.ot_shift_day) return null;
  return (
    <span className="mt-0.5 block text-[11px] text-sky-300">
      these hours extend the {r.ot_shift_day} shift
    </span>
  );
}

function LateThatDay({ r }: { r: OTRequest }) {
  if (!r.late_that_day || r.late_minutes_that_day == null) return null;
  const covers = r.ot_minutes >= r.late_minutes_that_day;
  return (
    <span className="mt-0.5 block text-[11px] text-amber-300">
      clocked in {r.late_minutes_that_day}m late that day
      {r.clock_in_that_day && r.shift_start_that_day != null && (
        <span className="text-white/40">
          {" "}({formatHour(r.shift_start_that_day)} shift, in at {r.clock_in_that_day})
        </span>
      )}
      {covers && (
        <span className="text-white/40"> · the claim covers it</span>
      )}
    </span>
  );
}

/** Quarter of an hour. Below this the typed time and the clock agree well
 *  enough that saying so would be noise -- people walk to the terminal. */
const CLOCK_TOLERANCE_MIN = 15;

function signedMinutes(m: number): string {
  return `${m > 0 ? "+" : "−"}${formatMinutes(Math.abs(m))}`;
}

/**
 * The claim against the clock.
 *
 * Short claims are not drawn as a fault. Over sixty days 56 Manila requests
 * were below what the roster and the punches show and 50 of them were
 * approved or paid unchanged, because no way to correct one upward exists --
 * that is work already done and not asked for, and colouring it like an
 * overclaim would tell the wrong story to the person who lost the hours.
 */
function ClockCheck({ f, compact = false }: { f?: OtFacts; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!f) return null;

  if (f.unavailable || f.computed_minutes === null || f.delta_minutes === null) {
    return (
      <span className="mt-1 block text-[11px] text-white/35">
        {f.unavailable || "clock not available"}
      </span>
    );
  }

  const d = f.delta_minutes;
  const agrees = Math.abs(d) <= CLOCK_TOLERANCE_MIN;
  const style = agrees
    ? "border-emerald-500/40 bg-emerald-900/25 text-emerald-300"
    : d > 0
    ? "border-amber-500/40 bg-amber-900/25 text-amber-300"
    : "border-sky-500/40 bg-sky-900/25 text-sky-300";
  const label = agrees
    ? "matches the clock"
    : d > 0
    ? `${signedMinutes(d)} vs clock`
    : `${signedMinutes(d)} — worked more`;

  return (
    <div className={compact ? "" : "mt-1"}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-80 ${style}`}
      >
        {label}
      </button>
      {open && (
        <div className="mt-2 space-y-1 rounded-lg border border-white/10 bg-black/30 p-2 text-[11px] leading-relaxed text-white/70">
          <p>
            Rostered:{" "}
            <span className="text-white">
              {f.shift_segments.length
                ? f.shift_segments.map((g) => `${formatHour(g[0])}–${formatHour(g[1])}`).join(" · ")
                : "—"}
            </span>
          </p>
          <p>
            Clocked:{" "}
            <span className="text-white">
              {f.punch_in !== null ? formatHour(f.punch_in) : "—"} →{" "}
              {f.punch_out !== null ? formatHour(f.punch_out) : "—"}
            </span>
          </p>
          <p>
            Outside the shift:{" "}
            <span className="text-white">{formatMinutes(f.before_minutes ?? 0)}</span> before +{" "}
            <span className="text-white">{formatMinutes(f.after_minutes ?? 0)}</span> after ={" "}
            <span className="text-white">{formatMinutes(f.computed_minutes)}</span>
          </p>
          <p>
            Asked for: <span className="text-white">{formatMinutes(f.claimed_minutes ?? 0)}</span>
          </p>
          {f.gap_minutes ? (
            <p className="text-amber-300/80">
              Split shift — {formatMinutes(f.gap_minutes)} worked through the unpaid gap. Not counted
              above; decide whether it is overtime.
            </p>
          ) : null}
          <p className="text-white/40">
            An early clock-in counts: payroll runs regular hours from the shift start, so time
            before it is payable only as overtime. Within {CLOCK_TOLERANCE_MIN} minutes counts as
            agreeing. This never blocks an approval.
          </p>
        </div>
      )}
    </div>
  );
}

const REVIEWER_ROLES = new Set(["ADMIN", "HQ", "DUBAI_MANAGEMENT", "MANILA_MANAGEMENT", "MANAGER", "HR_MANAGER"]);
const STAGE1_ROLES   = new Set(["ADMIN", "HQ", "MANILA_MANAGEMENT", "HR_MANAGER"]);
const STAGE2_ROLES   = new Set(["ADMIN", "HQ"]);

function statusBadge(status: string) {
  if (status === "paid")             return <span className={BADGE_SUCCESS}><Banknote className="h-3 w-3" />In payroll</span>;
  if (status === "approved")         return <span className={BADGE_SUCCESS}><CheckCircle className="h-3 w-3" />Approved</span>;
  // "Mgr Confirmed" did not say the part that matters: the hours are not in
  // payroll yet and will not be paid until someone adds them.
  if (status === "manager_approved") return <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/40 bg-blue-900/30 px-2 py-0.5 text-xs font-medium text-blue-300"><UserCheck className="h-3 w-3" />Approved · not in payroll</span>;
  if (status === "rejected")         return <span className={BADGE_ERROR}><XCircle className="h-3 w-3" />Rejected</span>;
  return <span className={BADGE_WARNING}><Clock className="h-3 w-3" />Pending</span>;
}

function formatHour(h: number): string {
  const hh = Math.floor(h) % 24;
  const mm = Math.round((h - Math.floor(h)) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function formatMinutes(m: number): string {
  return `${Math.floor(m / 60)}h${m % 60 > 0 ? `${m % 60}m` : ""}`;
}

const WORKLOAD_STYLE: Record<string, string> = {
  ok: "border-emerald-500/40 bg-emerald-900/25 text-emerald-300",
  watch: "border-amber-500/40 bg-amber-900/25 text-amber-300",
  check: "border-red-500/40 bg-red-900/25 text-red-300",
  unknown: "border-white/15 bg-white/5 text-white/45",
};

/**
 * How busy the night actually was. Expands on click, because a colour nobody
 * can interrogate gets ignored, and the numbers behind it are the whole point.
 */
function WorkloadCell({ w }: { w?: Workload }) {
  const [open, setOpen] = useState(false);
  if (!w) return <span className="text-xs text-white/30">—</span>;
  const d = w.demand;
  const label =
    w.level === "unknown" ? "No data"
      : d ? `${d.pct >= 0 ? "+" : ""}${d.pct}% orders`
      : "—";

  return (
    <div className="min-w-[150px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-80 ${WORKLOAD_STYLE[w.level] ?? WORKLOAD_STYLE.unknown}`}
      >
        {label}
      </button>
      {w.same_night_requests > 1 && (
        <span className="mt-1 block text-[11px] text-amber-300/80">
          {w.same_night_requests} people extended here that night
        </span>
      )}
      {open && (
        <div className="mt-2 space-y-1 rounded-lg border border-white/10 bg-black/30 p-2 text-[11px] leading-relaxed text-white/70">
          <p className="font-medium text-white/90">{w.headline}</p>
          {d && (
            <p>
              Orders that day: <span className="text-white">{d.orders}</span> · usual{" "}
              <span className="text-white">{d.usual}</span>
            </p>
          )}
          {w.staffing ? (
            <p>
              On shift during these hours: <span className="text-white">{w.staffing.rostered}</span> ·
              usual <span className="text-white">{w.staffing.usual}</span>
            </p>
          ) : (
            <p className="text-white/40">Roster for these hours not available</p>
          )}
          {w.hour_detail && (
            <p>
              Orders inside the overtime hours: <span className="text-white">{w.hour_detail.orders_in_window}</span>
            </p>
          )}
          {w.basis && <p className="text-white/40">Compared against the {w.basis}.</p>}
          <p className="text-white/40">
            Busy ≥ +15%, quiet ≤ −15%. This never blocks an approval.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * What was decided and what the employee said back. Both belong next to the
 * reason, because that is where a reviewer looking at the row is already
 * reading.
 */
function DecisionNotes({ r, onCloseDispute }: {
  r: OTRequest;
  onCloseDispute: (id: string) => void;
}) {
  const ground = REJECT_REASONS.find((x) => x.code === r.review_reason_code);
  const open = r.disputed_at && !r.dispute_closed_at;
  const causes = (r.cause_codes || "").split(",").filter(Boolean);
  return (
    <>
      {causes.length > 0 && (
        <span className="mt-1 flex flex-wrap gap-1">
          {causes.map((c) => (
            <span
              key={c}
              className={`rounded-full border px-1.5 py-0.5 text-[10px] ${
                AVOIDABLE_CAUSES.has(c)
                  ? "border-amber-500/40 bg-amber-900/20 text-amber-200"
                  : "border-white/10 bg-white/5 text-zinc-400"
              }`}
            >
              {CAUSE_LABELS[c] || c}
            </span>
          ))}
        </span>
      )}
      {r.ot_minutes_source === "clock" && r.ot_minutes_original != null && (
        <span className="mt-1 block text-[11px] text-sky-300/90">
          Settled on the clock by {r.ot_minutes_set_by} — asked for{" "}
          {formatMinutes(r.ot_minutes_original)}
        </span>
      )}
      {/* A person decided this amount, so the reason travels with it. It used
          to live in the comment box, where payroll paid the claim instead. */}
      {r.ot_minutes_source === "manual" && r.ot_minutes_original != null && (
        <span className="mt-1 block text-[11px] text-amber-200/90">
          {r.ot_minutes < r.ot_minutes_original ? "Shortened" : "Raised"} to{" "}
          {formatMinutes(r.ot_minutes)} by {r.ot_minutes_set_by} — asked for{" "}
          {formatMinutes(r.ot_minutes_original)}
          {r.ot_minutes_reason ? <>. {r.ot_minutes_reason}</> : null}
        </span>
      )}
      {r.status === "rejected" && (
        <span className="mt-1 block text-[11px] text-red-300/80">
          {ground ? ground.label : "No reason was recorded"}
        </span>
      )}
      {open && (
        <span className="mt-1 block rounded-md border border-amber-500/40 bg-amber-900/25 px-2 py-1 text-[11px] text-amber-200">
          <span className="font-medium">They say the clock is wrong:</span>{" "}
          {r.dispute_note}
          <button
            type="button"
            onClick={() => onCloseDispute(r.id)}
            className="ml-2 underline underline-offset-2 hover:text-amber-100"
          >
            Mark as read
          </button>
        </span>
      )}
    </>
  );
}

export default function AdminOvertimePage() {
  const [auth] = useState(getAuth);
  // getAuth() reads localStorage, which the server does not have, so the first
  // client render disagrees with the prerendered HTML (React #418) and the
  // refusal below flashes before the session is known.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const apiBase = "";
  const userCity = (auth?.city || "dubai").toLowerCase() as "dubai" | "manila";
  const role = (auth?.role || "").toUpperCase();
  const canSwitchCity = ["ADMIN", "HQ"].includes(role);
  // The role list alone is a lie: it omitted DUBAI_MANAGEMENT, so Manila
  // management could confirm Dubai overtime while Dubai management could not.
  // Keep the list, but let the permission open the same door, so Role
  // Management actually decides who reviews.
  const perms = auth?.permissions || [];
  const canStage1 = STAGE1_ROLES.has(role) || perms.includes("channel.admin.overtime.manage");
  const canStage2 = STAGE2_ROLES.has(role);

  const [activeCity, setActiveCity] = useState<"dubai" | "manila">(userCity);
  const city = activeCity;
  const branches = BRANCHES[city] ?? BRANCHES.dubai;

  const tokenHeaders = useCallback(async () => {
    const freshAuth = getAuth();
    const refreshed = await refreshAuthFromApi(freshAuth);
    const accessToken = refreshed?.accessToken || freshAuth?.accessToken;
    const hasSession = refreshed?.hasSession || freshAuth?.hasSession;
    if (!accessToken && !hasSession) throw new Error("Please log in again.");
    return { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), "Content-Type": "application/json" };
  }, []);

  const [filterBranch, setFilterBranch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterMonth, setFilterMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [requests, setRequests] = useState<OTRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Modal state
  const [reviewing, setReviewing] = useState<OTRequest | null>(null);
  const [modalAction, setModalAction] = useState<ModalAction>("manager_approve");
  const [actionNote, setActionNote] = useState("");
  const [rejectCode, setRejectCode] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  // Approving a different number of hours than were asked for. Shared by the
  // approve dialog and the standalone one, which are never open together.
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjH, setAdjH] = useState("");
  const [adjM, setAdjM] = useState("");
  const [adjWhy, setAdjWhy] = useState("");
  const [setHoursFor, setSetHoursFor] = useState<OTRequest | null>(null);
  const [setHoursBusy, setSetHoursBusy] = useState(false);
  const [setHoursError, setSetHoursError] = useState("");

  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await tokenHeaders();
      const params = new URLSearchParams({ city, limit: "200" });
      if (filterBranch) params.set("branch_code", filterBranch);
      if (filterStatus) params.set("status", filterStatus);
      if (filterMonth)  params.set("month", filterMonth);
      const res = await fetch(`${apiBase}/api/admin/overtime/list?${params}`, {
        headers: new Headers(headers),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
      setRequests(data.requests ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [tokenHeaders, apiBase, city, filterBranch, filterStatus, filterMonth]);

  useEffect(() => { load(); }, [load]);

  /** Say the note was read. A save that fails must not look like one that
   *  worked — the badge stays and the reason is on the screen (lesson 46). */
  async function closeDispute(id: string) {
    setActionError("");
    try {
      const headers = await tokenHeaders();
      const res = await fetch(`${apiBase}/api/admin/overtime/${id}/close-dispute`, {
        method: "PATCH",
        headers: new Headers(headers),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.detail || "Could not mark it read — nothing was saved.");
        return;
      }
      await load();
    } catch {
      setError("Could not reach the server — nothing was saved.");
    }
  }

  /** Correct an approved-but-not-paid request to the clock.
   *
   *  The approve dialog only reaches pending rows, and that is not where the
   *  short claims are: of 56 below the clock, four are pending and seventeen
   *  sit here. The server recomputes the minutes — the page never sends them.
   */
  async function settleToClock(r: OTRequest) {
    const f = r.ot_facts;
    if (!f || f.computed_minutes === null) return;
    if (!window.confirm(
      `Set ${r.staff_name}'s hours for ${r.work_date} to ${formatMinutes(f.computed_minutes)}`
      + ` — what the roster and the clock show?\n\nThey asked for ${formatMinutes(r.ot_minutes)}.`
      + ` They will be told.`)) return;
    setError("");
    try {
      const headers = await tokenHeaders();
      const res = await fetch(`${apiBase}/api/admin/overtime/${r.id}/settle-to-clock`, {
        method: "PATCH",
        headers: new Headers(headers),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.detail || "Nothing was changed.");
        return;
      }
      await load();
    } catch {
      setError("Could not reach the server — nothing was changed.");
    }
  }

  function openModal(r: OTRequest, action: ModalAction) {
    setReviewing(r);
    setModalAction(action);
    setActionNote("");
    setActionError("");
    setRejectCode("");
    setAdjOpen(false);
    // Pre-filled with the claim so the reviewer edits a number rather than
    // composing one, and a stray Enter cannot approve zero.
    setAdjH(String(Math.floor(r.ot_minutes / 60)));
    setAdjM(String(r.ot_minutes % 60));
    setAdjWhy("");
  }

  /** The typed amount, or null when it is not usable yet. */
  function adjMinutes(): number | null {
    const h = Number(adjH || 0);
    const m = Number(adjM || 0);
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || m < 0) return null;
    const total = Math.round(h * 60 + m);
    if (total <= 0 || total > 24 * 60) return null;
    return total;
  }

  function openSetHours(r: OTRequest) {
    setSetHoursFor(r);
    setSetHoursError("");
    setAdjH(String(Math.floor(r.ot_minutes / 60)));
    setAdjM(String(r.ot_minutes % 60));
    setAdjWhy("");
  }

  /** Approve a different number of hours on a request that is already approved.
   *
   *  Reported from Manila: a two-hour claim where one hour is approved has come
   *  up several times, and the amount was going into the comment box while the
   *  record kept the claim — so payroll paid the claim.
   */
  async function submitSetHours() {
    const r = setHoursFor;
    if (!r) return;
    const minutes = adjMinutes();
    if (minutes === null) {
      setSetHoursError("Give the hours as a number between 1 minute and 24 hours.");
      return;
    }
    if (minutes === r.ot_minutes) {
      setSetHoursError(`That is already the approved amount (${formatMinutes(r.ot_minutes)}).`);
      return;
    }
    if (adjWhy.trim().length < 3) {
      setSetHoursError("Say why — the employee sees this, and payroll reads it later.");
      return;
    }
    setSetHoursBusy(true);
    setSetHoursError("");
    try {
      const headers = await tokenHeaders();
      const res = await fetch(`${apiBase}/api/admin/overtime/${r.id}/set-hours`, {
        method: "PATCH",
        headers: new Headers(headers),
        body: JSON.stringify({ minutes, reason: adjWhy.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Nothing was changed.");
      setSetHoursFor(null);
      await load();
    } catch (e) {
      setSetHoursError(e instanceof Error ? e.message : "Nothing was changed.");
    } finally {
      setSetHoursBusy(false);
    }
  }

  async function submitAction(useClock = false) {
    if (!reviewing) return;
    setActionBusy(true);
    setActionError("");
    try {
      const headers = await tokenHeaders();
      let endpoint = "";
      let body: Record<string, string> = {};
      let bodyJson: Record<string, string | number | boolean> | null = null;
      if (modalAction === "manager_approve") {
        endpoint = `/api/admin/overtime/${reviewing.id}/manager-approve`;
        if (adjOpen) {
          // Here the number does come from the browser, because nothing else
          // could produce it — the reviewer is deciding, not measuring. What
          // makes it answerable is the reason, so it is required.
          const minutes = adjMinutes();
          if (minutes === null) {
            setActionError("Give the hours as a number between 1 minute and 24 hours.");
            setActionBusy(false);
            return;
          }
          if (adjWhy.trim().length < 3) {
            setActionError("Say why the hours were changed — the employee sees this.");
            setActionBusy(false);
            return;
          }
          bodyJson = { note: actionNote, set_minutes: minutes, set_reason: adjWhy.trim() };
        } else {
          // A flag, not a number. The server recomputes the minutes from the
          // roster and the punches — money posted from a browser is not evidence.
          bodyJson = { note: actionNote, use_clock: useClock };
        }
      } else if (modalAction === "remove_from_payroll") {
        endpoint = `/api/admin/overtime/${reviewing.id}/remove-from-payroll`;
        body = { note: actionNote };
      } else if (modalAction === "mark_paid") {
        endpoint = `/api/admin/overtime/${reviewing.id}/mark-paid`;
        body = { note: actionNote };
      } else {
        // The server refuses a rejection with no ground; catching it here
        // means the reviewer is told before the round trip, not after.
        const ground = REJECT_REASONS.find((x) => x.code === rejectCode);
        if (!ground) {
          setActionError("Pick a reason — the employee is shown it.");
          setActionBusy(false);
          return;
        }
        if (ground.needsNote && !actionNote.trim()) {
          setActionError(`"${ground.label}" needs a sentence saying what happened.`);
          setActionBusy(false);
          return;
        }
        endpoint = `/api/admin/overtime/${reviewing.id}/review`;
        body = { status: "rejected", review_note: actionNote, reason_code: rejectCode };
      }
      const res = await fetch(`${apiBase}${endpoint}`, {
        method: "PATCH",
        headers: new Headers(headers),
        body: JSON.stringify(bodyJson ?? body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Action failed");
      setReviewing(null);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setActionBusy(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const headers = await tokenHeaders();
      const params = new URLSearchParams({ city, month: filterMonth });
      const res = await fetch(`${apiBase}/api/admin/overtime/export?${params}`, {
        headers: new Headers(headers),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Export failed");
      const rows: OTRequest[] = data.rows ?? [];
      const csv = [
        "Staff,Branch,Date,Type,OT Start,OT End,OT Minutes,Reason,Mgr Approved By,Paid By",
        ...rows.map((r) =>
          [r.staff_name, r.branch_code, r.work_date, r.request_type,
           formatHour(r.ot_start_hour), formatHour(r.ot_end_hour),
           r.ot_minutes, `"${r.reason}"`, r.manager_approved_by || "", r.paid_by || ""].join(",")
        ),
      ].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `overtime_paid_${city}_${filterMonth}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  // This page's HTML is prerendered and served from the edge cache, identical
  // for everyone, so the server always renders it as a signed-out visitor. Say
  // nothing until the browser has read the session: rendering the refusal
  // straight away put "Access denied — Manager or above required." on screen
  // for a moment on every cold load, telling managers they had lost access
  // they still had.
  if (!mounted) {
    return <div className="min-h-screen" aria-busy="true" />;
  }

  if (!auth || !REVIEWER_ROLES.has(auth.role ?? "")) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-white/60">Access denied — Manager or above required.</p>
      </div>
    );
  }

  const pending         = requests.filter((r) => r.status === "pending");
  const mgrApproved     = requests.filter((r) => r.status === "manager_approved");
  const paid            = requests.filter((r) => r.status === "paid" || r.status === "approved");
  const totalPaidMin    = paid.reduce((s, r) => s + r.ot_minutes, 0);

  const modalTitle = modalAction === "manager_approve" ? "Approve this overtime"
    : modalAction === "mark_paid" ? "Add this overtime to payroll"
    : modalAction === "remove_from_payroll" ? "Take this overtime out of payroll"
    : "Reject OT Request";

  const modalConfirmLabel = modalAction === "manager_approve" ? "Approve"
    : modalAction === "mark_paid" ? "Add to Payroll"
    : modalAction === "remove_from_payroll" ? "Remove from Payroll"
    : "Reject";

  const modalConfirmClass = modalAction === "reject"
    ? "flex-1 rounded-xl border border-red-700/50 bg-red-950/40 py-2 text-sm font-semibold text-red-300 hover:bg-red-950/60 transition disabled:opacity-50"
    : `${PRIMARY_BUTTON} flex-1`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 p-4 pb-24">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className={T_PAGE_TITLE}>Overtime Management</h1>
          <div className="flex items-center gap-2">
            {canSwitchCity && (
              <div className="flex rounded-xl overflow-hidden border border-zinc-700">
                {(["dubai", "manila"] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => { setActiveCity(c); setFilterBranch(""); }}
                    className={`px-4 py-2 text-xs font-semibold transition-colors ${activeCity === c ? TAB_ACTIVE : TAB_INACTIVE}`}
                  >
                    {c === "dubai" ? "Dubai" : "Manila"}
                  </button>
                ))}
              </div>
            )}
            {canStage2 && (
              <button
                onClick={handleExport}
                disabled={exporting}
                className={`${SECONDARY_BUTTON} flex items-center gap-2`}
              >
                <Download className="h-4 w-4" />
                {exporting ? "Exporting…" : "Export CSV"}
              </button>
            )}
          </div>
        </div>

        {/* Flow explanation. The second step is the one that moves money, so it
            says so — "Mark Paid" read like bookkeeping after the fact. */}
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs text-zinc-400 flex-wrap">
            <span className="flex items-center gap-1 text-amber-300 font-medium"><Clock className="h-3 w-3" />Pending</span>
            <span>→</span>
            <span className="flex items-center gap-1 text-blue-300 font-medium"><UserCheck className="h-3 w-3" />Approved</span>
            <span className="text-zinc-600">(Uejima / Yamada / Richard / Peter / Ayako)</span>
            <span>→</span>
            <span className="flex items-center gap-1 text-green-300 font-medium"><Banknote className="h-3 w-3" />In payroll</span>
            <span className="text-zinc-600">(Yamada / Ayako)</span>
            <span className="ml-auto text-zinc-500">Staff notified at each step</span>
          </div>
          <p className="mt-1.5 text-[11px] text-zinc-500">
            Approving does not pay anything. Overtime reaches payroll only when it is
            added, and it lands in the period containing the work date — so it can be
            approved as it comes in and added after the cut-off.
          </p>
          <p className="mt-1.5 text-[11px] text-zinc-500">
            <span className="text-zinc-400">How busy</span> compares that day&apos;s orders,
            and the people rostered across the overtime hours, against the same weekday at
            the same branch over the previous 9 weeks. Green is a night at least 15% busier
            than usual; amber is an ordinary night, and says so more firmly when the branch
            was also fully staffed. Tap a badge for the numbers. It is there to inform the
            decision, not to make it — nothing is blocked or rejected by it.
          </p>
        </div>

        {/* KPI summary */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Awaiting Stage 1", value: pending.length, color: "text-amber-400" },
            { label: "Awaiting Payroll", value: mgrApproved.length, color: "text-blue-300" },
            { label: "Total Paid OT", value: formatMinutes(totalPaidMin), color: "text-green-300" },
          ].map((k) => (
            <div key={k.label} className={`${GLASS_CARD} p-3 sm:p-4 text-center`}>
              <p className={`text-lg sm:text-2xl font-bold ${k.color}`}>{k.value}</p>
              <p className={`${T_CAPTION} text-[10px] sm:text-xs leading-tight mt-0.5`}>{k.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className={`${GLASS_CARD} p-4`}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className={T_LABEL}>Month</label>
              <input
                type="month"
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className={`${INPUT_CLASS} mt-1`}
              />
            </div>
            <div>
              <label className={T_LABEL}>Branch</label>
              <SelectDark
                className={`${SELECT_CLASS} mt-1`}
                value={filterBranch}
                onChange={setFilterBranch}
                placeholder="All branches"
                clearable={true}
                options={branches.map((b) => ({ value: b.code, label: b.name }))}
              />
            </div>
            <div>
              <label className={T_LABEL}>Status</label>
              <SelectDark
                className={`${SELECT_CLASS} mt-1`}
                value={filterStatus}
                onChange={setFilterStatus}
                placeholder="All"
                clearable={true}
                options={[
                  { value: "pending",          label: "Pending (Stage 1)" },
                  { value: "manager_approved", label: "Approved · not in payroll" },
                  { value: "paid",             label: "Paid" },
                  { value: "rejected",         label: "Rejected" },
                ]}
              />
            </div>
            <div className="flex items-end">
              <button onClick={load} className={`${PRIMARY_BUTTON} w-full`}>Refresh</button>
            </div>
          </div>
        </div>

        {/* List */}
        <div className={`${GLASS_CARD} p-0 overflow-hidden`}>
          {error && (
            <div className="flex items-center gap-2 p-4 text-sm text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />{error}
            </div>
          )}
          {loading ? (
            <p className={`${T_CAPTION} p-6`}>Loading…</p>
          ) : error ? null : requests.length === 0 ? (
            <p className={`${T_CAPTION} p-6`}>No overtime requests found.</p>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="divide-y divide-white/5 sm:hidden">
                {requests.map((r) => (
                  <div key={r.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-white text-sm">{r.staff_name}</p>
                        <p className="text-xs text-white/50 mt-0.5">{r.work_date} · {r.branch_code}</p>
                      </div>
                      {statusBadge(r.status)}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className={r.request_type === "pre" ? BADGE_INFO : "text-white/50 text-xs"}>
                        {r.request_type === "pre" ? "Pre" : "Post"}
                      </span>
                      <span className="text-white">{formatHour(r.ot_start_hour)}–{formatHour(r.ot_end_hour)}</span>
                      <span className="text-white/50 text-xs">{formatMinutes(r.ot_minutes)}</span>
                      <ClockCheck f={r.ot_facts} compact />
                      <AskedWhen minutes={r.asked_after_start_minutes} />
                      <OvernightTail r={r} />
                      <LateThatDay r={r} />
                    </div>
                    <p className="text-sm text-white/70">{r.reason}</p>
                    <DecisionNotes r={r} onCloseDispute={closeDispute} />
                    <WorkloadCell w={r.workload} />
                    <ContextCell c={r.ot_context} />
                    {r.manager_approved_by && (
                      <p className="text-xs text-blue-400">Stage 1: {r.manager_approved_by}</p>
                    )}
                    {r.paid_by && (
                      <p className="text-xs text-green-400">Paid by: {r.paid_by}</p>
                    )}
                    <div className="flex gap-2 pt-1">
                      {r.status === "pending" && canStage1 && (
                        <button
                          onClick={() => openModal(r, "manager_approve")}
                          className="flex-1 rounded-xl border border-blue-500/30 bg-blue-900/20 px-3 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-900/40 transition"
                        >
                          Approve
                        </button>
                      )}
                      {r.status === "manager_approved" && canStage1 && r.ot_facts
                        && !r.ot_facts.unavailable
                        && r.ot_facts.computed_minutes !== null
                        && r.ot_facts.delta_minutes !== null
                        && Math.abs(r.ot_facts.delta_minutes) > CLOCK_TOLERANCE_MIN && (
                        <button
                          onClick={() => settleToClock(r)}
                          title="Approved, but the hours do not match the roster and the clock."
                          className="rounded-xl border border-sky-500/30 bg-sky-900/20 px-3 py-2 text-xs font-semibold text-sky-300 hover:bg-sky-900/40 transition whitespace-nowrap"
                        >
                          Set to {formatMinutes(r.ot_facts.computed_minutes)}
                        </button>
                      )}
                      {/* Approved, but for a different number of hours than was
                          asked for. This was going into the comment box while
                          the record kept the claim, so payroll paid the claim. */}
                      {r.status === "manager_approved" && canStage1 && (
                        <button
                          onClick={() => openSetHours(r)}
                          className="rounded-xl border border-amber-500/25 bg-amber-900/10 px-3 py-2 text-xs text-amber-300 hover:bg-amber-900/30 transition whitespace-nowrap"
                        >
                          Change hours
                        </button>
                      )}
                      {r.status === "manager_approved" && canStage2 && (
                        <button
                          onClick={() => openModal(r, "mark_paid")}
                          className="flex-1 rounded-xl border border-green-500/30 bg-green-900/20 px-3 py-2 text-xs font-semibold text-green-300 hover:bg-green-900/40 transition"
                        >
                          Add to Payroll
                        </button>
                      )}
                      {/* The one action here that moves money, so it gets a way
                          back. Fixing the attendance record by hand does not
                          work — the next sync rewrites it from the request. */}
                      {r.status === "paid" && canStage2 && (
                        <button
                          onClick={() => openModal(r, "remove_from_payroll")}
                          className="rounded-xl border border-amber-500/25 bg-amber-900/10 px-3 py-2 text-xs text-amber-300 hover:bg-amber-900/30 transition"
                        >
                          Remove from Payroll
                        </button>
                      )}
                      {(r.status === "pending" || r.status === "manager_approved") && canStage1 && (
                        <button
                          onClick={() => openModal(r, "reject")}
                          className="rounded-xl border border-red-500/20 bg-red-900/10 px-3 py-2 text-xs text-red-400 hover:bg-red-900/30 transition"
                        >
                          Reject
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={TABLE_HEADER}>
                      <th className={TABLE_CELL}>Staff</th>
                      <th className={TABLE_CELL}>Branch</th>
                      <th className={TABLE_CELL}>Date</th>
                      <th className={TABLE_CELL}>Type</th>
                      <th className={TABLE_CELL}>OT Time</th>
                      <th className={TABLE_CELL}>Reason</th>
                      <th className={TABLE_CELL}>How busy</th>
                      <th className={TABLE_CELL}>Status</th>
                      <th className={TABLE_CELL}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((r) => (
                      <tr key={r.id} className={TABLE_ROW}>
                        <td className={TABLE_CELL}><span className="font-medium text-white">{r.staff_name}</span></td>
                        <td className={TABLE_CELL}>{r.branch_code}</td>
                        <td className={TABLE_CELL}>{r.work_date}</td>
                        <td className={TABLE_CELL}>
                          <span className={r.request_type === "pre" ? BADGE_INFO : "text-white/50 text-xs"}>
                            {r.request_type === "pre" ? "Pre" : "Post"}
                          </span>
                          <AskedWhen minutes={r.asked_after_start_minutes} />
                      <OvernightTail r={r} />
                      <LateThatDay r={r} />
                        </td>
                        <td className={TABLE_CELL}>
                          {formatHour(r.ot_start_hour)}–{formatHour(r.ot_end_hour)}
                          <br /><span className="text-white/50">{formatMinutes(r.ot_minutes)}</span>
                          <ClockCheck f={r.ot_facts} />
                        </td>
                        <td className={TABLE_CELL}>
                          <span className="max-w-[260px] break-words whitespace-pre-wrap">{r.reason}</span>
                          {r.manager_approved_by && (
                            <span className="block text-blue-400 text-xs mt-0.5">✓ {r.manager_approved_by}</span>
                          )}
                          {r.paid_by && (
                            <span className="block text-green-400 text-xs mt-0.5">💳 {r.paid_by}</span>
                          )}
                          <DecisionNotes r={r} onCloseDispute={closeDispute} />
                        </td>
                        <td className={TABLE_CELL}>
                          <WorkloadCell w={r.workload} />
                          <ContextCell c={r.ot_context} />
                        </td>
                        <td className={TABLE_CELL}>{statusBadge(r.status)}</td>
                        <td className={TABLE_CELL}>
                          <div className="flex flex-col gap-1">
                            {r.status === "pending" && canStage1 && (
                              <button
                                onClick={() => openModal(r, "manager_approve")}
                                className="rounded-lg border border-blue-500/30 bg-blue-900/20 px-2 py-1 text-xs text-blue-300 hover:bg-blue-900/40 transition whitespace-nowrap"
                              >
                                Approve
                              </button>
                            )}
                            {r.status === "manager_approved" && canStage1 && r.ot_facts
                              && !r.ot_facts.unavailable
                              && r.ot_facts.computed_minutes !== null
                              && r.ot_facts.delta_minutes !== null
                              && Math.abs(r.ot_facts.delta_minutes) > CLOCK_TOLERANCE_MIN && (
                              <button
                                onClick={() => settleToClock(r)}
                                title="Approved, but the hours do not match the roster and the clock."
                                className="rounded-xl border border-sky-500/30 bg-sky-900/20 px-3 py-2 text-xs font-semibold text-sky-300 hover:bg-sky-900/40 transition whitespace-nowrap"
                              >
                                Set to {formatMinutes(r.ot_facts.computed_minutes)}
                              </button>
                            )}
                            {r.status === "manager_approved" && canStage1 && (
                              <button
                                onClick={() => openSetHours(r)}
                                className="rounded-lg border border-amber-500/25 bg-amber-900/10 px-2 py-1 text-xs text-amber-300 hover:bg-amber-900/30 transition whitespace-nowrap"
                              >
                                Change hours
                              </button>
                            )}
                            {r.status === "manager_approved" && canStage2 && (
                              <button
                                onClick={() => openModal(r, "mark_paid")}
                                className="rounded-lg border border-green-500/30 bg-green-900/20 px-2 py-1 text-xs text-green-300 hover:bg-green-900/40 transition whitespace-nowrap"
                              >
                                Add to Payroll
                              </button>
                            )}
                            {r.status === "paid" && canStage2 && (
                              <button
                                onClick={() => openModal(r, "remove_from_payroll")}
                                className="rounded-lg border border-amber-500/25 bg-amber-900/10 px-2 py-1 text-xs text-amber-300 hover:bg-amber-900/30 transition whitespace-nowrap"
                              >
                                Remove from Payroll
                              </button>
                            )}
                            {(r.status === "pending" || r.status === "manager_approved") && canStage1 && (
                              <button
                                onClick={() => openModal(r, "reject")}
                                className="rounded-lg border border-red-500/20 bg-red-900/10 px-2 py-1 text-xs text-red-400 hover:bg-red-900/30 transition"
                              >
                                Reject
                              </button>
                            )}
                            {(r.status === "paid" || r.status === "approved" || r.status === "rejected") && (
                              <span className="text-white/40 text-xs">{r.paid_by || r.reviewed_by || "—"}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Action Modal */}
      {reviewing && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
          <BodyScrollLock />
          <div className={`${GLASS_CARD} w-full sm:max-w-md p-4 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto rounded-b-none sm:rounded-2xl pb-safe`}>
            <h3 className={T_SECTION}>{modalTitle}</h3>
            <div className="space-y-1 rounded-lg bg-white/5 p-3 text-sm">
              <p><span className="text-white/50">Staff:</span> <strong className="text-white">{reviewing.staff_name}</strong></p>
              <p><span className="text-white/50">Date:</span> {reviewing.work_date} ({reviewing.branch_code})</p>
              <p><span className="text-white/50">OT:</span> {formatHour(reviewing.ot_start_hour)}–{formatHour(reviewing.ot_end_hour)} ({formatMinutes(reviewing.ot_minutes)})</p>
              {/* Open, not behind a click. This is the moment the decision is
                  made, and the reason 50 short claims were approved unchanged
                  is that nobody deciding had these two numbers in front of
                  them. */}
              {reviewing.ot_facts && !reviewing.ot_facts.unavailable
                && reviewing.ot_facts.computed_minutes !== null && (
                <div className="rounded-lg border border-white/10 bg-black/30 p-2 space-y-0.5 text-xs">
                  <p>
                    <span className="text-white/50">Rostered:</span>{" "}
                    {reviewing.ot_facts.shift_segments
                      .map((g) => `${formatHour(g[0])}–${formatHour(g[1])}`).join(" · ") || "—"}
                  </p>
                  <p>
                    <span className="text-white/50">Clocked:</span>{" "}
                    {reviewing.ot_facts.punch_in !== null ? formatHour(reviewing.ot_facts.punch_in) : "—"}
                    {" → "}
                    {reviewing.ot_facts.punch_out !== null ? formatHour(reviewing.ot_facts.punch_out) : "—"}
                  </p>
                  <p>
                    <span className="text-white/50">Outside the shift:</span>{" "}
                    <span className="text-white">{formatMinutes(reviewing.ot_facts.computed_minutes)}</span>
                    {reviewing.ot_facts.delta_minutes !== null
                      && Math.abs(reviewing.ot_facts.delta_minutes) > CLOCK_TOLERANCE_MIN && (
                      <span className={reviewing.ot_facts.delta_minutes > 0
                        ? "ml-2 text-amber-300" : "ml-2 text-sky-300"}>
                        {reviewing.ot_facts.delta_minutes > 0
                          ? `asked for ${formatMinutes(reviewing.ot_facts.delta_minutes)} more`
                          : `worked ${formatMinutes(-reviewing.ot_facts.delta_minutes)} more than asked for`}
                      </span>
                    )}
                  </p>
                </div>
              )}
              {reviewing.ot_facts?.unavailable && (
                <p className="text-xs text-white/40">Clock: {reviewing.ot_facts.unavailable}</p>
              )}
              <p><span className="text-white/50">Reason:</span> {reviewing.reason}</p>
              {reviewing.manager_approved_by && (
                <p><span className="text-white/50">Stage 1 by:</span> <span className="text-blue-300">{reviewing.manager_approved_by}</span></p>
              )}
            </div>
            {/* More than the clock supports — said in full, at the moment of
                deciding, with the company's money named.

                The claim used to be the only number on this screen, and the
                form arrives pre-filled with 21:00–23:00: 49 of Dubai's 78
                requests are that exact window untouched. So "2h" is often the
                default rather than a claim, and approving it as asked pays for
                hours the record does not show. */}
            {modalAction === "manager_approve"
              && reviewing.ot_facts
              && !reviewing.ot_facts.unavailable
              && reviewing.ot_facts.computed_minutes !== null
              && (reviewing.ot_facts.delta_minutes ?? 0) > CLOCK_TOLERANCE_MIN && (
              <div className="rounded-lg border border-amber-500/50 bg-amber-950/30 p-3 space-y-2">
                <div className="flex items-start gap-2 text-xs text-amber-200">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    They asked for <strong>{formatMinutes(reviewing.ot_minutes)}</strong>.
                    The roster and the clock show{" "}
                    <strong>{formatMinutes(reviewing.ot_facts.computed_minutes)}</strong>{" "}
                    outside the shift. Approving as asked pays{" "}
                    <strong>{formatMinutes(reviewing.ot_facts.delta_minutes ?? 0)}</strong>{" "}
                    more than the record supports.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const m = reviewing.ot_facts?.computed_minutes ?? 0;
                    setAdjH(String(Math.floor(m / 60)));
                    setAdjM(String(m % 60));
                    setAdjOpen(true);
                    setActionError("");
                  }}
                  className="w-full rounded-lg border border-amber-500/40 bg-amber-900/30 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-900/50 transition"
                >
                  Approve {formatMinutes(reviewing.ot_facts.computed_minutes)} instead — what the clock shows
                </button>
              </div>
            )}
            {modalAction === "mark_paid" && (
              <div className="flex items-start gap-2 rounded-lg border border-green-800/40 bg-green-950/20 p-3 text-xs text-green-300">
                <Banknote className="h-4 w-4 shrink-0 mt-0.5" />
                This will mark the OT as paid and added to payroll. The staff member will be notified via Inbox.
              </div>
            )}
            {modalAction === "manager_approve" && (
              <div className="flex items-start gap-2 rounded-lg border border-blue-800/40 bg-blue-950/20 p-3 text-xs text-blue-300">
                <UserCheck className="h-4 w-4 shrink-0 mt-0.5" />
                Approving does not pay anything. The hours reach payroll only when
                someone adds them, which can be after the cut-off — they land in the
                period containing the work date either way.
              </div>
            )}
            {modalAction === "mark_paid" && (
              <div className="flex items-start gap-2 rounded-lg border border-green-800/40 bg-green-950/20 p-3 text-xs text-green-300">
                <Banknote className="h-4 w-4 shrink-0 mt-0.5" />
                This puts the hours on the payslip for the period containing the work
                date. It can be undone with Remove from Payroll while that period is
                still open.
              </div>
            )}
            {modalAction === "remove_from_payroll" && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-800/40 bg-amber-950/20 p-3 text-xs text-amber-300">
                <Banknote className="h-4 w-4 shrink-0 mt-0.5" />
                The hours come off the attendance record and the request goes back to
                approved, so it can be added to a later period. The staff member is told.
              </div>
            )}
            {modalAction === "reject" && (
              <div>
                <label className={T_LABEL}>Why not?</label>
                <div className="mt-1 flex flex-col gap-1">
                  {REJECT_REASONS.map((x) => (
                    <button
                      key={x.code}
                      type="button"
                      onClick={() => { setRejectCode(x.code); setActionError(""); }}
                      className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                        rejectCode === x.code
                          ? "border-red-500/50 bg-red-900/25 text-red-200"
                          : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
                      }`}
                    >
                      {x.label}
                      {x.needsNote && (
                        <span className="ml-2 text-[11px] text-amber-300/80">needs a sentence</span>
                      )}
                      {rejectCode === x.code && x.hint && (
                        <span className="mt-1 block text-[11px] text-white/50">{x.hint}</span>
                      )}
                    </button>
                  ))}
                </div>
                {/* The employee is shown the ground and the sentence, on the
                    same screen that shows them the shift and their punches.
                    A ground they cannot check is not a ground. */}
                <p className="mt-2 text-[11px] text-white/40">
                  {reviewing.staff_name} sees this, with the shift and the clock beside it.
                </p>
              </div>
            )}
            <div>
              <label className={T_LABEL}>
                {modalAction === "reject"
                  ? (REJECT_REASONS.find((x) => x.code === rejectCode)?.needsNote
                      ? "What happened (required)"
                      : "Anything to add (optional)")
                  : "Comment (optional)"}
              </label>
              <textarea
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
                rows={2}
                placeholder={modalAction === "reject" ? "The employee reads this…" : "Add a comment…"}
                className={`${TEXTAREA_CLASS} mt-1`}
              />
            </div>
            {modalAction === "manager_approve" && (
              adjOpen ? (
                <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-900/15 p-3">
                  <div className="flex items-center justify-between">
                    <span className={T_LABEL}>Approve this much instead</span>
                    <button
                      type="button"
                      onClick={() => setAdjOpen(false)}
                      className="text-xs text-white/45 hover:text-white/80"
                    >
                      Keep {formatMinutes(reviewing.ot_minutes)} as asked
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number" min={0} max={24} inputMode="numeric"
                      value={adjH}
                      onChange={(e) => { setAdjH(e.target.value); setActionError(""); setSetHoursError(""); }}
                      className={`${INPUT_CLASS} w-16 text-center`}
                      aria-label="Hours approved"
                    />
                    <span className="text-sm text-white/60">h</span>
                    <input
                      type="number" min={0} max={59} inputMode="numeric"
                      value={adjM}
                      onChange={(e) => { setAdjM(e.target.value); setActionError(""); setSetHoursError(""); }}
                      className={`${INPUT_CLASS} w-16 text-center`}
                      aria-label="Minutes approved"
                    />
                    <span className="text-sm text-white/60">m</span>
                  </div>
                  <p className="text-xs text-white/45">
                    They asked for {formatMinutes(reviewing.ot_minutes)}.
                  </p>
                  <div>
                    <label className={T_LABEL}>Why it was changed (required)</label>
                    <textarea
                      value={adjWhy}
                      onChange={(e) => { setAdjWhy(e.target.value); setActionError(""); setSetHoursError(""); }}
                      rows={2}
                      placeholder="e.g. Prep was already done; one hour covers the delivery."
                      className={`${TEXTAREA_CLASS} mt-1`}
                    />
                    <p className={`${T_CAPTION} mt-1`}>
                      The employee is told this, and it stays on the record for payroll.
                    </p>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAdjOpen(true)}
                  className="text-sm text-amber-300/90 underline underline-offset-2 hover:text-amber-200"
                >
                  Approve a different number of hours…
                </button>
              )
            )}
            {actionError && <p className="text-sm text-red-400">{actionError}</p>}
            {/* Two buttons only when the clock and the claim actually differ,
                and each says the number it will approve. A single "Approve"
                with a silent basis is how 56 short claims went through. */}
            {modalAction === "manager_approve" && adjOpen ? (
              <div className="flex gap-3">
                <button
                  onClick={() => setReviewing(null)}
                  className={`${SECONDARY_BUTTON} flex-1`}
                  disabled={actionBusy}
                >
                  Cancel
                </button>
                <button
                  onClick={() => submitAction(false)}
                  disabled={actionBusy}
                  className={`${PRIMARY_BUTTON} flex-1`}
                >
                  {actionBusy
                    ? "Saving…"
                    : `Approve ${adjMinutes() === null ? "—" : formatMinutes(adjMinutes() as number)}`}
                </button>
              </div>
            ) : modalAction === "manager_approve"
              && reviewing.ot_facts
              && !reviewing.ot_facts.unavailable
              && reviewing.ot_facts.computed_minutes !== null
              && reviewing.ot_facts.delta_minutes !== null
              && Math.abs(reviewing.ot_facts.delta_minutes) > CLOCK_TOLERANCE_MIN ? (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => submitAction(true)}
                  disabled={actionBusy}
                  className={PRIMARY_BUTTON}
                >
                  {actionBusy
                    ? "Saving…"
                    : `Approve ${formatMinutes(reviewing.ot_facts.computed_minutes)} — what the clock shows`}
                </button>
                <button
                  onClick={() => submitAction(false)}
                  disabled={actionBusy}
                  className={SECONDARY_BUTTON}
                >
                  Approve {formatMinutes(reviewing.ot_minutes)} as asked
                </button>
                <button
                  onClick={() => setReviewing(null)}
                  className="text-sm text-white/45 hover:text-white/80"
                  disabled={actionBusy}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex gap-3">
                <button onClick={() => setReviewing(null)} className={`${SECONDARY_BUTTON} flex-1`} disabled={actionBusy}>
                  Cancel
                </button>
                <button onClick={() => submitAction(false)} disabled={actionBusy} className={modalConfirmClass}>
                  {actionBusy ? "Saving…" : modalConfirmLabel}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Change the approved hours on a request that is already approved.
          Reported from Manila: "a two-hour request where only one hour was
          approved has come up several times, and we have been writing it in
          the comment box." The record kept the claim, so payroll paid it. */}
      {setHoursFor && (
        <ModalScrim className="z-[80] bg-black/60 backdrop-blur-sm">
          <div className={`${GLASS_CARD} mx-auto my-4 w-full sm:max-w-md space-y-4 p-4 sm:p-6`}>
            <h3 className={T_SECTION}>Change the approved hours</h3>
            <div className="space-y-1 rounded-lg bg-white/5 p-3 text-sm">
              <p>
                <span className="text-white/50">Staff:</span>{" "}
                <strong className="text-white">{setHoursFor.staff_name}</strong>
              </p>
              <p>
                <span className="text-white/50">Date:</span> {setHoursFor.work_date}
              </p>
              <p>
                <span className="text-white/50">They asked for:</span>{" "}
                <span className="text-white">{formatMinutes(setHoursFor.ot_minutes)}</span>
              </p>
            </div>
            <div>
              <label className={T_LABEL}>Approve this much</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="number" min={0} max={24} inputMode="numeric"
                  value={adjH}
                  onChange={(e) => { setAdjH(e.target.value); setActionError(""); setSetHoursError(""); }}
                  className={`${INPUT_CLASS} w-16 text-center`}
                  aria-label="Hours approved"
                />
                <span className="text-sm text-white/60">h</span>
                <input
                  type="number" min={0} max={59} inputMode="numeric"
                  value={adjM}
                  onChange={(e) => { setAdjM(e.target.value); setActionError(""); setSetHoursError(""); }}
                  className={`${INPUT_CLASS} w-16 text-center`}
                  aria-label="Minutes approved"
                />
                <span className="text-sm text-white/60">m</span>
              </div>
            </div>
            <div>
              <label className={T_LABEL}>Why it was changed (required)</label>
              <textarea
                value={adjWhy}
                onChange={(e) => { setAdjWhy(e.target.value); setActionError(""); setSetHoursError(""); }}
                rows={3}
                placeholder="e.g. Prep was already done; one hour covers the delivery."
                className={`${TEXTAREA_CLASS} mt-1`}
              />
              <p className={`${T_CAPTION} mt-1`}>
                The employee is told this, and it stays on the record so payroll
                pays the approved amount rather than the claim.
              </p>
            </div>
            {setHoursError && <p className="text-sm text-red-400">{setHoursError}</p>}
            <div className="flex gap-3">
              <button
                onClick={() => setSetHoursFor(null)}
                className={`${SECONDARY_BUTTON} flex-1`}
                disabled={setHoursBusy}
              >
                Cancel
              </button>
              <button
                onClick={submitSetHours}
                disabled={setHoursBusy}
                className={`${PRIMARY_BUTTON} flex-1`}
              >
                {setHoursBusy
                  ? "Saving…"
                  : `Approve ${adjMinutes() === null ? "—" : formatMinutes(adjMinutes() as number)}`}
              </button>
            </div>
          </div>
        </ModalScrim>
      )}
    </div>
  );
}
