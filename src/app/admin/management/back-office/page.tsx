"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Send,
  X,
  ChevronDown,
  ChevronUp,
  BookOpen,
  MessageSquare,
} from "lucide-react";
import { getAuth, getAuthHeaders, canAccessAdminNav } from "@/lib/auth";
import {
  GLASS_CARD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SMALL_BUTTON,
  T_PAGE_TITLE,
  T_LABEL,
  T_CAPTION,
  KPI_CARD,
  KPI_LABEL,
  KPI_VALUE,
  BADGE_ERROR,
  BADGE_WARNING,
  BADGE_INFO,
  BADGE_SUCCESS,
  TABLE_ROW,
  TABLE_CELL,
  INPUT_CLASS,
  TABLE_HEADER,
} from "@/lib/ui-tokens";
import { MgmtChannelTabBar } from "../MgmtChannelTabs";
import { fillTemplate, shortfallSummary, fmtExceptionType } from "@/lib/management";
import { MANAGEMENT_CHANNEL_CITY } from "@/lib/management-channel";
import SelectDark from "@/components/SelectDark";

// ─── Types ───────────────────────────────────────────────────────────────────

type Severity = "red" | "yellow" | "green";
type TaskStatus = "open" | "sent" | "responded" | "closed" | "escalated";

interface ManagementTask {
  id: number;
  city: string;
  branch: string;
  type: string;
  source_id: string | null;
  severity: Severity;
  status: TaskStatus;
  bo_assignee: string | null;
  template_key: string | null;
  sent_message: string | null;
  manager_name: string | null;
  response: string | null;
  response_action: string | null;
  response_note: string | null;
  context: Record<string, unknown> | null;
  missed_by_manager: boolean;
  // null = the OS has not checked the claim; false = it checked and the report
  // the store says it filed does not exist.
  claim_verified: boolean | null;
  created_at: string;
  sent_at: string | null;
  responded_at: string | null;
  closed_by: string | null;
  closed_at: string | null;
  escalated_at: string | null;
}

interface JobRun {
  job: string;
  city: string;
  ran_at: string;
  seconds_ago: number;
  created: number;
  escalated: number;
  missed: number;
  skipped: number;
  errors: { detector: string; error: string }[];
}

interface ActionTemplate {
  exception_type: string;
  severity: Severity;
  title_en: string;
  title_ja: string;
  message_en: string;
  message_ja: string;
  response_options: ResponseOption[];
  /** Second stage — empty when the cause is the whole answer. */
  action_options: ResponseOption[];
  response_label: string | null;
  action_label: string | null;
}

interface ResponseOption {
  key: string;
  label_en: string;
  type: "done" | "cannot" | "neutral";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────


/** Today's date in the store's own timezone — never the browser's. */
function storeToday(city: string): string {
  const tz = city === "dubai" ? "Asia/Dubai" : "Asia/Manila";
  // en-CA gives YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

/**
 * Whether the automatic sweep is still running, and when it last did.
 *
 * Everything in this channel — detection, the 30-minute escalation, the SLA
 * miss log, the weekly score — depends on that job. If it stops, the dashboard
 * goes quiet and looks exactly like a good day, which is how the channel sat
 * dead from 2026-08-22 without anyone noticing.
 */
function AutoCheckBanner({ runs, city }: { runs: JobRun[]; city: string }) {
  const relevant = runs.filter(r => r.job === "detect" && (city === "all" || r.city === city));
  if (relevant.length === 0) {
    return (
      <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-2.5 text-sm text-amber-100/90 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-400" />
        <span>
          The automatic check has not reported yet. Until it does, tasks appear only
          when someone presses Run Detection.
        </span>
      </div>
    );
  }

  const stalest = relevant.reduce((a, b) => (a.seconds_ago > b.seconds_ago ? a : b));
  const failing = relevant.filter(r => r.errors?.length > 0);
  // The job runs every 15 minutes; an hour of silence means it stopped.
  const stale = stalest.seconds_ago > 3600;
  const mins = Math.round(stalest.seconds_ago / 60);
  const ago = mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)}h ago`;

  if (stale || failing.length) {
    return (
      <div className="mb-4 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-2.5 text-sm text-red-100 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-red-400" />
        <div>
          {stale ? (
            <>Automatic checks have not run for {ago}. Exceptions are not being detected.</>
          ) : (
            <>
              Automatic check ran {ago}, but {failing.length} detector(s) failed:{" "}
              {failing.flatMap(r => r.errors.map(e => `${r.city}/${e.detector}`)).join(", ")}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 flex items-center gap-2 text-xs text-zinc-500">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
      <span>
        Automatic check ran {ago}
        {stalest.skipped > 0 && (
          <span className="text-amber-400"> · {stalest.skipped} item(s) not judged</span>
        )}
      </span>
    </div>
  );
}


/**
 * Rows whose status says they went out but that carry no sent_at.
 *
 * sent_at is the clock the rest of the channel runs on — the 30-minute
 * escalation, the missed-by-manager log and the Area Manager score all start
 * from it. A row without it drops out of all three and nothing looks wrong,
 * which is exactly how this went unnoticed the first time. Silent when there is
 * nothing to say.
 */
function SentStampBanner({ city }: { city: string }) {
  const [gap, setGap] = useState<{ count: number; rows: { id: number; type: string; branch: string }[] } | null>(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/management/integrity?city=${encodeURIComponent(city === "all" ? "" : city)}`,
          { headers: getAuthHeaders(getAuth()), cache: "no-store" },
        );
        if (!res.ok) return;
        const j = await res.json();
        if (!dead) setGap({ count: j.count || 0, rows: j.rows || [] });
      } catch {
        /* the banner is a safety net, not a feature — never break the page */
      }
    })();
    return () => { dead = true; };
  }, [city]);

  if (!gap || gap.count === 0) return null;
  return (
    <div className="mb-4 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-2.5 text-sm text-red-100 flex items-start gap-2">
      <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-red-400" />
      <div>
        <b>{gap.count} task(s) are marked as sent but carry no send time.</b> Escalation,
        the missed-by-manager log and the Area Manager score all count from that
        time, so these are being left out of every one of them. Tell the OS team.
        <div className="mt-1 text-xs text-red-200/80">
          {gap.rows.slice(0, 8).map(r => `#${r.id} ${r.branch} ${r.type}`).join(" · ")}
          {gap.count > 8 ? ` · +${gap.count - 8} more` : ""}
        </div>
      </div>
    </div>
  );
}

type FarRow = {
  staff_name: string; branch_code: string; far_days: number;
  min_m: number; max_m: number; avg_m: number;
  branch_p90: number | null; threshold_m: number; dates: string[];
};

/**
 * "Someone will just photograph the QR and scan it from home."
 *
 * They can. The poster is on a wall; nothing stops a camera. What a copied
 * code cannot do is be used from inside the store — it still gets scanned
 * somewhere, and the somewhere is recorded. That is what this shows.
 *
 * One reading from far away is a bad GPS fix and is not worth anyone's
 * morning. The same person, several days running, is not a GPS fix.
 *
 * It also reports the size of what it looked at. Before the posters go up
 * there are no confirmations at all, and a silent banner would read as
 * "nobody is doing this" when the truth is "nothing has been measured yet".
 */
function FarConfirmBanner({ city }: { city: string }) {
  const [data, setData] = useState<{
    rows: FarRow[]; checked: number; photo_confirmations: number; qr_without_gps: number;
  } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/attendance/far-confirmations?city=${encodeURIComponent(city === "all" ? "manila" : city)}&days=30`,
          { headers: getAuthHeaders(getAuth()), cache: "no-store" },
        );
        if (!res.ok) return;
        const j = await res.json();
        if (!dead) setData({
          rows: j.rows || [], checked: j.checked || 0,
          photo_confirmations: j.photo_confirmations || 0,
          qr_without_gps: j.qr_without_gps || 0,
        });
      } catch {
        /* a watch, not a feature — never break the dashboard */
      }
    })();
    return () => { dead = true; };
  }, [city]);

  if (!data) return null;

  // Nothing has been measured yet. Say so rather than showing a clean result.
  if (data.checked === 0 && data.photo_confirmations === 0) return null;

  if (data.rows.length === 0) {
    return (
      <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-white/55 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-emerald-300/80">✓</span>
        <span>
          <b className="text-white/75">{data.checked}</b> QR confirmation(s) checked over 30 days —
          all scanned from inside their branch.
        </span>
        {data.photo_confirmations > 0 && (
          <span className="text-white/40">· {data.photo_confirmations} confirmed by photo instead</span>
        )}
        {data.qr_without_gps > 0 && (
          <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-amber-200">
            {data.qr_without_gps} scan(s) arrived with no location — those cannot be checked
          </span>
        )}
      </div>
    );
  }

  const worst = data.rows[0];
  return (
    <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-100">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-400" />
        <div className="flex-1">
          <b>
            {data.rows.length} {data.rows.length === 1 ? "person is" : "people are"} scanning
            the branch QR from outside the branch.
          </b>{" "}
          The poster is on a wall inside. A code being used from {worst.avg_m}m away means
          the code left the building — most likely photographed.
          <div className="mt-1 text-xs text-amber-200/75">
            Flagged when a scan lands further out than that branch&apos;s own clock-ins
            normally do, on three or more days. One stray reading is a GPS glitch
            and is not shown here.
          </div>
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="mt-1.5 text-xs text-amber-200 underline underline-offset-2 hover:text-amber-100"
          >
            {open ? "Hide" : `Show ${data.rows.length}`}
          </button>
          {open && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="text-amber-200/60">
                  <tr>
                    <th className="pr-3 pb-1 font-medium">Who</th>
                    <th className="pr-3 pb-1 font-medium">Branch</th>
                    <th className="pr-3 pb-1 font-medium text-right">Days</th>
                    <th className="pr-3 pb-1 font-medium text-right">Distance</th>
                    <th className="pr-3 pb-1 font-medium text-right">Normal here</th>
                    <th className="pb-1 font-medium">Dates</th>
                  </tr>
                </thead>
                <tbody className="text-amber-100/90">
                  {data.rows.map(r => (
                    <tr key={`${r.staff_name}-${r.branch_code}`} className="border-t border-amber-400/15">
                      <td className="pr-3 py-1">{r.staff_name}</td>
                      <td className="pr-3 py-1">{r.branch_code}</td>
                      <td className="pr-3 py-1 text-right tabular-nums">{r.far_days}</td>
                      <td className="pr-3 py-1 text-right tabular-nums">
                        {r.min_m === r.max_m ? `${r.avg_m}m` : `${r.min_m}–${r.max_m}m`}
                      </td>
                      <td className="pr-3 py-1 text-right tabular-nums text-amber-200/60">
                        under {r.threshold_m}m
                      </td>
                      <td className="py-1 text-amber-200/60">{r.dates.slice(0, 5).join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2 text-xs text-amber-200/60">
                Before treating this as dishonesty: check the branch pin is right
                (Attendance → Branch GPS) and that the poster is where it should be.
                A poster near a door, or a pin set a street away, produces this too.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type BreakRow = {
  staff_name: string; branches: string[]; times?: number; days?: number;
  avg_over?: number; max_over?: number; total_over?: number;
  allowance_min?: number; any_split?: boolean; max_breaks?: number;
  avg_span_h?: number; dates?: string[];
};
type BreakData = {
  tolerance_min: number; default_break_min: number;
  coverage: { sessions: number; with_break: number; rate: number | null; split_days: number };
  over_allowance: BreakRow[]; unclosed_breaks: BreakRow[];
  many_breaks: BreakRow[]; no_break_recorded: BreakRow[];
};

/**
 * Breaks.
 *
 * The standard is not a setting anyone maintains: on a split day the roster
 * already says when the second segment starts, and that is when the person is
 * due back. Everywhere else it is 60 minutes. So the line can never be stale,
 * and it is printed next to every name.
 *
 * Coverage is shown whether or not anything is flagged. Manila records no
 * break at all on nearly two thirds of worked days, so an exceptions-only
 * panel would say "nothing wrong" while looking at a third of the shifts.
 */
function BreakBanner({ city }: { city: string }) {
  const [data, setData] = useState<BreakData | null>(null);
  const [open, setOpen] = useState<string>("");

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/attendance/break-exceptions?city=${encodeURIComponent(city === "all" ? "manila" : city)}&days=30`,
          { headers: getAuthHeaders(getAuth()), cache: "no-store" },
        );
        if (!res.ok) return;
        const j = await res.json();
        if (!dead) setData(j);
      } catch {
        /* a watch, not a feature — never break the dashboard */
      }
    })();
    return () => { dead = true; };
  }, [city]);

  if (!data) return null;
  const c = data.coverage;
  if (!c || !c.sessions) return null;

  const rate = c.rate ?? 0;
  const poor = rate < 80;
  const sections: { key: string; label: string; rows: BreakRow[]; tone: string }[] = [
    { key: "over",     label: "Back late from break",        rows: data.over_allowance,    tone: "amber" },
    { key: "many",     label: "Three or more breaks in a shift", rows: data.many_breaks,   tone: "amber" },
    { key: "none",     label: "Long shift, no break recorded",   rows: data.no_break_recorded, tone: "slate" },
    { key: "unclosed", label: "Break never closed — fix the record", rows: data.unclosed_breaks, tone: "slate" },
  ];
  const flagged = data.over_allowance.length + data.many_breaks.length;

  const toneCls = (t: string) =>
    t === "amber"
      ? "border-amber-400/40 bg-amber-500/10 text-amber-100"
      : "border-white/10 bg-white/[0.03] text-white/70";

  return (
    <div className={`mb-4 rounded-xl border px-4 py-2.5 text-sm ${
      flagged > 0 ? "border-amber-500/40 bg-amber-500/[0.07]" : "border-white/10 bg-white/[0.03]"
    }`}>
      {/* Coverage first. The findings mean nothing without it. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className={poor ? "text-amber-300" : "text-emerald-300/80"}>{poor ? "▲" : "✓"}</span>
        <span className="text-white/70">
          Breaks recorded on <b className="text-white/90">{c.with_break}</b> of {c.sessions} shifts
          over 30 days — <b className={poor ? "text-amber-200" : "text-emerald-200"}>{rate}%</b>
        </span>
        {poor && (
          <span className="text-white/45">
            · the checks below can only see those {rate}%
          </span>
        )}
        {c.split_days > 0 && (
          <span className="text-white/40">· {c.split_days} split-shift days, break taken from the roster gap</span>
        )}
        <span className="ml-auto rounded-full border border-white/10 px-2 py-0.5 text-white/45">
          Due back at the second shift&apos;s start, otherwise {data.default_break_min} min · {data.tolerance_min} min grace
        </span>
      </div>

      {sections.filter(s => s.rows.length > 0).map(s => (
        <div key={s.key} className="mt-2">
          <button
            type="button"
            onClick={() => setOpen(o => (o === s.key ? "" : s.key))}
            className={`rounded-full border px-2.5 py-1 text-xs ${toneCls(s.tone)} hover:brightness-125`}
          >
            {s.label}: <b>{s.rows.length}</b> {open === s.key ? "▾" : "▸"}
          </button>
          {open === s.key && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="text-white/40">
                  <tr>
                    <th className="pr-3 pb-1 font-medium">Who</th>
                    <th className="pr-3 pb-1 font-medium">Branch</th>
                    <th className="pr-3 pb-1 font-medium text-right">
                      {s.key === "none" ? "Days" : "Times"}
                    </th>
                    {s.key === "over" && <>
                      <th className="pr-3 pb-1 font-medium text-right">Avg over</th>
                      <th className="pr-3 pb-1 font-medium text-right">Worst</th>
                      <th className="pr-3 pb-1 font-medium text-right">Due</th>
                    </>}
                    {s.key === "many" && <th className="pr-3 pb-1 font-medium text-right">Most in a shift</th>}
                    {s.key === "none" && <th className="pr-3 pb-1 font-medium text-right">Avg shift</th>}
                    {s.key === "unclosed" && <th className="pr-3 pb-1 font-medium text-right">Recorded as</th>}
                    <th className="pb-1 font-medium">Dates</th>
                  </tr>
                </thead>
                <tbody className="text-white/75">
                  {s.rows.map(r => (
                    <tr key={r.staff_name} className="border-t border-white/10">
                      <td className="pr-3 py-1 whitespace-nowrap">{r.staff_name}</td>
                      <td className="pr-3 py-1 text-white/50">{(r.branches || []).join(" / ")}</td>
                      <td className="pr-3 py-1 text-right tabular-nums">{r.days ?? r.times}</td>
                      {s.key === "over" && <>
                        <td className="pr-3 py-1 text-right tabular-nums">+{r.avg_over}m</td>
                        <td className="pr-3 py-1 text-right tabular-nums">+{r.max_over}m</td>
                        <td className="pr-3 py-1 text-right tabular-nums text-white/45">
                          {r.allowance_min}m{r.any_split ? " ·split" : ""}
                        </td>
                      </>}
                      {s.key === "many" && <td className="pr-3 py-1 text-right tabular-nums">{r.max_breaks}</td>}
                      {s.key === "none" && <td className="pr-3 py-1 text-right tabular-nums">{r.avg_span_h}h</td>}
                      {s.key === "unclosed" && (
                        <td className="pr-3 py-1 text-right tabular-nums text-white/45">
                          {(r.max_over ?? 0) + (r.allowance_min ?? 0)}m
                        </td>
                      )}
                      <td className="py-1 text-white/45">{(r.dates || []).slice(0, 4).join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {s.key === "unclosed" && (
                <div className="mt-2 text-xs text-white/45">
                  Longer than three times what was due. That is a Break Out nobody pressed,
                  not a break anyone took — the shift ended and the timer was still running.
                  Fix the day in DTR Records rather than raising it with the person.
                </div>
              )}
              {s.key === "none" && (
                <div className="mt-2 text-xs text-white/45">
                  No break was recorded on these shifts. It does not follow that none was taken —
                  it means nothing above can see these people. Back office is already excluded.
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function fmtLabel(type: string) {
  return fmtExceptionType(type);
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin <= 0) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── Severity / Status UI ─────────────────────────────────────────────────────

function SevBadge({ sev }: { sev: Severity }) {
  if (sev === "red")    return <span className="text-base">🔴</span>;
  if (sev === "yellow") return <span className="text-base">🟠</span>;
  return <span className="text-base">🟢</span>;
}

/**
 * What to do with this row, not what state it is in.
 *
 * "Responded" is the name of a state. It does not say that a manager has
 * answered and the row is now waiting on you to read it and close it — and 81
 * of them sat that way for a median of three days while the words on screen
 * described a condition rather than asking for anything.
 *
 * The state is kept next to the instruction for anyone who wants it.
 */
function StatusBadge({ status, missed }: { status: TaskStatus; missed?: boolean }) {
  if (status === "open")
    return <span className={BADGE_INFO}>Send it</span>;
  if (status === "sent")
    return missed
      ? <span className={BADGE_ERROR}>No reply — chase</span>
      : <span className={BADGE_WARNING}>Waiting for reply</span>;
  if (status === "responded")
    return <span className={BADGE_SUCCESS}>Reply in — read &amp; close</span>;
  if (status === "closed")    return <span className={BADGE_SUCCESS}>Closed</span>;
  if (status === "escalated") return <span className={BADGE_ERROR}>Escalated</span>;
  return <span className={BADGE_INFO}>{status}</span>;
}

// ─── Answer rates ─────────────────────────────────────────────────────────────

type RateRow = {
  type: string;
  generated: number;
  per_day: number;
  sent: number;
  answered: number;
  answer_rate: number | null;
  scored: boolean;
};

/** Which exception types are worth sending, measured rather than assumed.
 *
 *  Types get added over time and nobody looks back. product_score_c grew to
 *  three quarters of everything the channel raised and was answered twice in
 *  eleven sends, while rush_check_missing was answered three times out of three.
 *  Read this monthly: a type that stops being answered should stop being sent.
 */
function AnswerRates({ city }: { city: string }) {
  const [rows, setRows] = useState<RateRow[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/management/type-response-rates?city=${encodeURIComponent(city)}&days=30`,
          { headers: getAuthHeaders(getAuth()) },
        );
        if (!res.ok) return;
        const d = await res.json();
        if (!cancelled) setRows(d.rows || []);
      } catch { /* the page works without it */ }
    })();
    return () => { cancelled = true; };
  }, [city]);

  if (!rows || rows.length === 0) return null;
  const perDay = rows.reduce((n, r) => n + r.per_day, 0);
  const neverSent = rows.filter(r => r.sent === 0);

  return (
    <div className={GLASS_CARD + " mb-5 p-4"}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <div className="text-sm font-semibold text-zinc-100">
            What this channel sends — last 30 days
          </div>
          <div className={T_CAPTION + " mt-0.5"}>
            {perDay.toFixed(1)} raised per day
            {neverSent.length > 0
              ? ` · ${neverSent.length} type${neverSent.length === 1 ? "" : "s"} never sent`
              : ""}
          </div>
        </div>
        <span className="text-xs text-zinc-400">{open ? "Hide" : "Show"}</span>
      </button>

      {open ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-zinc-500">
                <th className="pb-2 pr-3 font-medium">Type</th>
                <th className="pb-2 pr-3 text-right font-medium">Per day</th>
                <th className="pb-2 pr-3 text-right font-medium">Sent</th>
                <th className="pb-2 pr-3 text-right font-medium">Answered</th>
                <th className="pb-2 pr-3 text-right font-medium">Rate</th>
                <th className="pb-2 font-medium">Scored</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {rows.map(r => (
                <tr key={r.type} className="border-t border-white/5">
                  <td className="py-1.5 pr-3 text-zinc-200">{fmtLabel(r.type)}</td>
                  <td className="py-1.5 pr-3 text-right text-zinc-300">{r.per_day}</td>
                  <td className="py-1.5 pr-3 text-right text-zinc-300">{r.sent}</td>
                  <td className="py-1.5 pr-3 text-right text-zinc-300">{r.answered}</td>
                  <td className={`py-1.5 pr-3 text-right font-semibold ${
                    r.answer_rate === null ? "text-zinc-500"
                      : r.answer_rate >= 0.6 ? "text-emerald-300"
                      : r.answer_rate >= 0.3 ? "text-amber-300" : "text-rose-300"
                  }`}>
                    {/* Never sent is not a zero answer rate. One is the back
                        office's to explain, the other the manager's. */}
                    {r.answer_rate === null ? "never sent" : `${Math.round(r.answer_rate * 100)}%`}
                  </td>
                  <td className="py-1.5 text-zinc-400">{r.scored ? "yes" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={T_CAPTION + " mt-3"}>
            A type nobody answers is not reaching anyone in a form they can act on.
            Fix the wording or stop sending it — leaving it in place is how a channel
            becomes something people ignore.
          </p>
        </div>
      ) : null}
    </div>
  );
}

// ─── Send Modal ───────────────────────────────────────────────────────────────

interface SendModalProps {
  task: ManagementTask;
  template: ActionTemplate | null;
  customMessage: string;
  onChangeMessage: (v: string) => void;
  onConfirm: () => void;
  onClose: () => void;
  sending: boolean;
}

type OwnerPreview = {
  staff_name: string;
  substitute: string;
  on_shift: boolean | null;
  discord_user_id: string;
  reason: string;
};

function SendModal({ task, template, customMessage, onChangeMessage, onConfirm, onClose, sending }: SendModalProps) {
  const [owner, setOwner] = useState<OwnerPreview | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const date = String(task.context?.date || "");
        const params = new URLSearchParams({ city: task.city, branch: task.branch });
        if (date) params.set("on_date", date);
        const res = await fetch(`/api/admin/management/owner-preview?${params}`, {
          headers: getAuthHeaders(getAuth()),
        });
        if (!res.ok) return;
        const d = await res.json();
        if (!cancelled) setOwner(d);
      } catch { /* the modal still works without it */ }
    })();
    return () => { cancelled = true; };
  }, [task.id]);

  // on_shift === false is the only case worth raising. null means there is no
  // published shift to read, which is not the same as "off", and treating it as
  // one would put a warning on every task.
  const offShift = owner?.on_shift === false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={GLASS_CARD + " w-full max-w-lg p-6"}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <SevBadge sev={task.severity} />
              <span className="font-semibold text-white text-sm">{fmtLabel(task.type)}</span>
            </div>
            <div className="text-xs text-zinc-400 mt-0.5">
              {task.branch} · Manager: {task.manager_name || "Unknown"}
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white p-1">
            <X className="h-4 w-4" />
          </button>
        </div>

        {owner && !owner.staff_name ? (
          <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-950/20 p-3">
            <p className="text-sm font-semibold text-rose-200">No manager rostered</p>
            <p className="mt-1 text-[13px] text-rose-100/80">
              {owner.reason || `${task.branch} has nobody on duty for this day.`} Sending is
              blocked until someone is set under Management → Assignments.
            </p>
          </div>
        ) : null}

        {offShift ? (
          <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-950/15 p-3">
            <p className="text-sm font-semibold text-amber-200">
              {owner?.staff_name} is not on the published shift for this day
            </p>
            <p className="mt-1 text-[13px] text-amber-100/80">
              {owner?.substitute
                ? `The stand-in for ${task.branch} is ${owner.substitute}.`
                : `No stand-in is set for ${task.branch}.`}{" "}
              Nothing is switched automatically — the published shift is not always
              right, and a silent switch delivers to someone whose branch it is not.
            </p>
          </div>
        ) : null}

        {owner?.staff_name && !owner.discord_user_id ? (
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-950/10 p-3 text-[13px] text-amber-100/80">
            {owner.staff_name} has no Discord ID recorded, so no notification will
            be posted. They would have to open the page themselves.
          </div>
        ) : null}

        {template ? (
          <div className="mb-4">
            <div className={T_LABEL + " mb-2"}>Pre-written instruction (from template)</div>
            <div className="rounded-lg border border-violet-500/20 bg-violet-950/20 p-3 text-sm text-zinc-200 leading-relaxed italic">
              {fillTemplate(template.message_en, task.context)}
            </div>
            {template.response_options.length > 0 && (
              <div className="mt-2">
                <div className={T_LABEL + " mb-1.5"}>
                  {template.response_label || "Manager will respond with"}
                </div>
                <OptionChips options={template.response_options} />
              </div>
            )}
            {template.action_options && template.action_options.length > 0 && (
              <div className="mt-3">
                <div className={T_LABEL + " mb-1.5 text-sky-400/80"}>
                  Then: {template.action_label || "Action Taken"}
                </div>
                <OptionChips options={template.action_options} />
                <div className={T_CAPTION + " mt-1.5"}>
                  The manager cannot submit until both stages are answered.
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mb-4">
            <div className={T_LABEL + " mb-2"}>Custom message (no template found)</div>
            <textarea
              className="w-full rounded-xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 resize-none"
              rows={4}
              placeholder="Type an instruction for the manager..."
              value={customMessage}
              onChange={e => onChangeMessage(e.target.value)}
            />
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            disabled={sending || (!template && !customMessage.trim())
                       || (owner !== null && !owner.staff_name)}
            className={PRIMARY_BUTTON + " flex-1 flex items-center justify-center gap-2"}
          >
            <Send className="h-4 w-4" />
            {sending
              ? "Sending…"
              : owner?.staff_name
                ? `Send to ${owner.staff_name}`
                : "Send Instruction"}
          </button>
          <button onClick={onClose} className={SECONDARY_BUTTON}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Task Thread ──────────────────────────────────────────────────────────────

interface TaskMessage {
  id: number;
  task_id: number;
  author_name: string;
  author_role: string;
  body: string;
  created_at: string;
}

interface TaskThreadProps {
  taskId: number;
}

function TaskThread({ taskId }: TaskThreadProps) {
  const [messages, setMessages] = useState<TaskMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const headers = getAuthHeaders(getAuth());
      const res = await fetch(`/api/admin/management/tasks/${taskId}/messages`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages || []);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!body.trim() || sending) return;
    setSending(true);
    try {
      const auth = getAuth();
      const headers = getAuthHeaders(auth);
      const res = await fetch(`/api/admin/management/tasks/${taskId}/messages`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          body: body.trim(),
          author_name: auth?.staffName || "BO Staff",
          author_role: "bo",
        }),
      });
      if (!res.ok) return;
      const msg = await res.json();
      setMessages(prev => [...prev, msg]);
      setBody("");
    } finally {
      setSending(false);
    }
  }

  const rolePill = (role: string) => {
    if (role === "manager") return "bg-amber-500/15 text-amber-300 border border-amber-500/30";
    if (role === "bo")      return "bg-violet-500/15 text-violet-300 border border-violet-500/30";
    return "bg-blue-500/15 text-blue-300 border border-blue-500/30";
  };
  const roleLabel = (role: string) => {
    if (role === "manager")      return "Manager";
    if (role === "bo")           return "BO";
    if (role === "area_manager") return "Area Mgr";
    return "HQ";
  };

  return (
    <div className="mt-3 border-t border-white/8 pt-3">
      <div className="flex items-center gap-1.5 mb-2">
        <MessageSquare className="h-3.5 w-3.5 text-zinc-500" />
        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Thread</span>
        {messages.length > 0 && (
          <span className="text-xs text-zinc-600">({messages.length})</span>
        )}
      </div>

      {/* Message list */}
      <div className="max-h-48 overflow-y-auto space-y-2 mb-2 pr-1">
        {loading ? (
          <div className="text-xs text-zinc-600 py-2">Loading…</div>
        ) : messages.length === 0 ? (
          <div className="text-xs text-zinc-600 py-1 italic">No messages yet. Start the thread to follow up.</div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className="flex gap-2 items-start">
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${rolePill(msg.author_role)}`}>
                {roleLabel(msg.author_role)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-medium text-zinc-200 truncate">{msg.author_name}</span>
                  <span className="text-[10px] text-zinc-600 flex-shrink-0">{fmtTime(msg.created_at)}</span>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed mt-0.5 break-words">{msg.body}</p>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Add a follow-up note…"
          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white placeholder:text-zinc-600 outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20"
        />
        <button
          onClick={handleSend}
          disabled={sending || !body.trim()}
          className="rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed px-2.5 py-1.5 text-white transition-colors"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/** The response choices a manager will see, rendered as read-only chips. */
function OptionChips({ options }: { options: ResponseOption[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(opt => (
        <span
          key={opt.key}
          className={
            opt.type === "done"
              ? "text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
              : opt.type === "cannot"
              ? "text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30"
              : "text-xs px-2 py-0.5 rounded-full bg-white/8 text-zinc-300 border border-white/15"
          }
        >
          {opt.label_en}
        </span>
      ))}
    </div>
  );
}

// ─── Task Row ─────────────────────────────────────────────────────────────────



/**
 * The photo a product-score alert is about.
 *
 * The alert identifies it only by the time it was scored. Showing it on the task
 * is what lets a reviewer judge the score rather than take it on trust.
 */
function TaskPhoto({ taskId }: { taskId: number }) {
  const [failed, setFailed] = useState(false);
  const [full, setFull] = useState(false);
  if (failed) return null;
  const src = `/api/admin/management/tasks/${taskId}/photo`;
  const thumb = `${src}?size=thumb`;
  return (
    <>
      <button
        type="button"
        onClick={() => setFull(true)}
        className="block w-full overflow-hidden rounded-lg border border-white/10 bg-black/20"
        title="Click to enlarge"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb}
          alt="Scored product"
          loading="lazy"
          onError={() => setFailed(true)}
          className="max-h-48 w-full object-contain"
        />
      </button>
      {full && (
        <div
          onClick={() => setFull(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="Scored product" className="max-h-full max-w-full object-contain" />
        </div>
      )}
    </>
  );
}

// ─── Per-photo answers ────────────────────────────────────────────────────────

interface ScoredItem {
  score_id?: string | number;
  scored_at?: string;
  total_score?: string | number;
  grade?: string;
  posted_by?: string;
}
interface ItemAnswer {
  cause?: string;
  action?: string;
  note?: string;
  feedback_discord?: boolean;
  feedback_kitchen?: boolean;
  answered_by?: string;
}

/**
 * What the manager said about each scored photo, and where they said it.
 *
 * The rolled-up Manager Response below can only show one line for a task that
 * covers a whole day of photos, and it never showed the channel at all — so
 * "feedback given" gave the back office nothing to go and read. Reviewing
 * whether feedback is actually reaching Discord starts here.
 */
function PerPhotoAnswers({ task }: { task: ManagementTask }) {
  const items = (task.context?.items as ScoredItem[] | undefined) || [];
  const answers = (task.context?.answers as Record<string, ItemAnswer> | undefined) || {};
  if (items.length === 0 || Object.keys(answers).length === 0) return null;

  return (
    <div>
      <div className={T_LABEL + " mb-1.5"}>Per-photo answers</div>
      <div className="space-y-1.5">
        {items.map((it, i) => {
          const key = String(it.score_id ?? i);
          const a = answers[key];
          return (
            <div
              key={key}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-white/8 bg-white/4 px-2.5 py-1.5 text-xs"
            >
              <span className="font-semibold tabular-nums text-white">{it.scored_at || "—"}</span>
              <span className="tabular-nums text-amber-300">
                {it.grade || "C"} {it.total_score ?? ""}
              </span>
              {a ? (
                <>
                  <span className="text-emerald-300">{(a.cause || "").replace(/_/g, " ")}</span>
                  {a.action && (
                    <>
                      <span className="text-zinc-500">→</span>
                      <span className="text-sky-300">{a.action.replace(/_/g, " ")}</span>
                    </>
                  )}
                  {a.feedback_discord && (
                    <span className="rounded-full border border-violet-400/50 bg-violet-500/20 px-2 py-0.5 font-semibold text-violet-200">
                      Discord
                    </span>
                  )}
                  {a.feedback_kitchen && (
                    <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 font-semibold text-zinc-300">
                      Kitchen
                    </span>
                  )}
                  {a.note && <span className="text-zinc-400">{a.note}</span>}
                </>
              ) : (
                <span className="text-amber-400/80">not answered yet</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Handling record ──────────────────────────────────────────────────────────

interface Handling {
  photo_checked?: boolean;
  issue_found?: boolean | null;
  issue_category?: string;
  issue_detail?: string;
  feedback_discord?: boolean;
  feedback_kitchen?: boolean;
  training_done?: boolean;
  training_note?: string;
  handled_by?: string;
  handled_at?: string;
}

const ISSUE_CATEGORIES: { key: string; label: string }[] = [
  { key: "portioning",     label: "Portioning / quantity" },
  { key: "freshness",      label: "Freshness" },
  { key: "temperature",    label: "Temperature" },
  { key: "presentation",   label: "Presentation / plating" },
  { key: "packaging",      label: "Packaging" },
  { key: "wrong_item",     label: "Wrong item" },
  { key: "foreign_object", label: "Foreign object" },
  { key: "other",          label: "Other" },
];

function Check({
  checked, onChange, label,
}: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-white/20 bg-white/5 accent-violet-500"
      />
      {label}
    </label>
  );
}

const CLOSE_OUTCOMES: { key: string; label: string; hint: string }[] = [
  { key: "done",       label: "Handled",         hint: "The store's answer settles it" },
  { key: "not_needed", label: "No action needed", hint: "It should not have been raised" },
  { key: "unresolved", label: "Couldn't resolve", hint: "Nothing further we can do" },
];

/**
 * Close, in one tap.
 *
 * 41 answered tasks had nowhere to go: the only close control was a checkbox at
 * the bottom of the eight-field form below, used 8 times in 277 tasks and never
 * once to close anything. So the queue never drained -- of 204 closed tasks,
 * not one had ever been answered first.
 *
 * Who and when are not asked for. They are the signed-in person and now, and a
 * field you ask for is a field that gets skipped.
 */
function CloseBar({
  task, onChanged, justClosed,
}: { task: ManagementTask; onChanged: (t: ManagementTask) => void; justClosed?: boolean }) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const closed = task.status === "closed";
  const info = (task.context?.close ?? null) as
    { outcome?: string; by?: string; at?: string } | null;

  const post = async (path: string, body?: unknown) => {
    setBusy(path);
    setErr("");
    try {
      const res = await fetch(`/api/admin/management/tasks/${task.id}/${path}`, {
        method: "POST",
        headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      // Read the body before checking ok: an error here is text, and calling
      // json() first turns a 403 into an exception that hides the reason.
      const text = await res.text();
      if (!res.ok) throw new Error(text.slice(0, 200) || `Failed (${res.status})`);
      onChanged(JSON.parse(text).task as ManagementTask);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };

  if (closed) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs">
        <span className="text-emerald-300">
          Closed{info?.outcome ? ` — ${CLOSE_OUTCOMES.find(o => o.key === info.outcome)?.label ?? info.outcome}` : ""}
        </span>
        {task.closed_by && <span className="text-zinc-500">by {task.closed_by}</span>}
        {justClosed && (
          <span className="text-[11px] text-zinc-500">
            · kept here until you press Refresh
          </span>
        )}
        {/* Every one-tap action needs a way back, or people stop using it for
            fear of the tap they cannot take back. */}
        <button
          type="button"
          onClick={() => void post("reopen")}
          disabled={!!busy}
          className="ml-auto rounded-md border border-white/15 bg-white/5 px-2 py-0.5 font-semibold text-zinc-300 hover:bg-white/10 hover:text-white disabled:opacity-50"
        >
          {busy ? "Working…" : "Reopen"}
        </button>
        {err && <div className="w-full text-red-400">{err}</div>}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className={T_LABEL}>Close</div>
        {CLOSE_OUTCOMES.map((o) => (
          <button
            key={o.key}
            type="button"
            title={o.hint}
            onClick={() => void post("close", { outcome: o.key })}
            disabled={!!busy}
            className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-semibold text-zinc-200 transition-colors hover:border-violet-400/50 hover:bg-violet-500/20 hover:text-white disabled:opacity-50"
          >
            {busy === "close" ? "Closing…" : o.label}
          </button>
        ))}
        <span className="text-[11px] text-zinc-500">
          Recorded as you, now. Reopen if you pick the wrong one.
        </span>
      </div>
      {/* The record already disagrees with what the store said. Say so before
          the tap, not after -- the audit line records it either way. */}
      {task.claim_verified === false && (
        <div className="mt-1.5 text-[11px] text-amber-300">
          The report this claims was filed does not exist. &quot;Handled&quot; will be recorded
          with that noted.
        </div>
      )}
      {err && <div className="mt-1.5 text-xs text-red-400">{err}</div>}
    </div>
  );
}

/**
 * What was done about this exception.
 *
 * Closing a task used to record nothing at all, so a week later there was no way
 * to tell a handled one from an ignored one. These are the steps as the work
 * actually happens: look at the photo, decide whether there is a problem, tell
 * the team, train if it needs training.
 */
function HandlingPanel({
  task, onSaved,
}: { task: ManagementTask; onSaved: (t: ManagementTask) => void }) {
  const saved = (task.context?.handling ?? null) as Handling | null;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState<Handling>({
    photo_checked: saved?.photo_checked ?? false,
    issue_found: saved?.issue_found ?? null,
    issue_category: saved?.issue_category ?? "",
    issue_detail: saved?.issue_detail ?? "",
    feedback_discord: saved?.feedback_discord ?? false,
    feedback_kitchen: saved?.feedback_kitchen ?? false,
    training_done: saved?.training_done ?? false,
    training_note: saved?.training_note ?? "",
  });
  const [closeTask, setCloseTask] = useState(false);

  const submit = async () => {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/admin/management/tasks/${task.id}/handling`, {
        method: "POST",
        headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, close_task: closeTask }),
      });
      if (!res.ok) throw new Error((await res.text()).slice(0, 200) || `Save failed (${res.status})`);
      const data = await res.json();
      onSaved(data.task as ManagementTask);
      setOpen(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Named so the split from the one-tap Close above is obvious: this is
            the detailed record, kept for the cases that need photo / issue /
            training detail. The heavy form is not removed, it is moved off the
            common path. */}
        <div className={T_LABEL}>Full handling record</div>
        {saved?.handled_at ? (
          <span className="text-[11px] text-emerald-300">
            {saved.handled_by} · {fmtTime(saved.handled_at)}
          </span>
        ) : (
          <span className="text-[11px] text-amber-300">Not recorded</span>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-zinc-300 hover:bg-white/10 hover:text-white"
        >
          {open ? "Cancel" : saved?.handled_at ? "Update" : "Record"}
        </button>
      </div>

      {!open && task.response_note && (
        <div className="mt-1.5 text-xs text-zinc-300">{task.response_note}</div>
      )}

      {open && (
        <div className="mt-3 space-y-3">
          <Check
            checked={!!form.photo_checked}
            onChange={(v) => setForm((f) => ({ ...f, photo_checked: v }))}
            label="Checked the submitted photo"
          />

          <div className="space-y-1.5">
            <div className={T_LABEL}>Anything wrong?</div>
            <div className="flex flex-wrap items-center gap-3">
              {[
                { v: false, l: "Nothing wrong" },
                { v: true,  l: "Found an issue" },
              ].map((o) => (
                <label key={String(o.v)} className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-300">
                  <input
                    type="radio"
                    checked={form.issue_found === o.v}
                    onChange={() => setForm((f) => ({ ...f, issue_found: o.v }))}
                    className="h-3.5 w-3.5 accent-violet-500"
                  />
                  {o.l}
                </label>
              ))}
            </div>
            {form.issue_found === true && (
              <div className="space-y-2 pt-1">
                <SelectDark
                  value={form.issue_category ?? ""}
                  onChange={(v) => setForm((f) => ({ ...f, issue_category: v }))}
                  options={[
                    { value: "", label: "— Issue category —" },
                    ...ISSUE_CATEGORIES.map((c) => ({ value: c.key, label: c.label })),
                  ]}
                />
                <textarea
                  value={form.issue_detail ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, issue_detail: e.target.value }))}
                  rows={2}
                  placeholder="What was wrong"
                  className={INPUT_CLASS + " w-full text-xs"}
                />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <div className={T_LABEL}>Feedback / Training</div>
            <Check
              checked={!!form.feedback_discord}
              onChange={(v) => setForm((f) => ({ ...f, feedback_discord: v }))}
              label="Gave feedback on Discord"
            />
            <Check
              checked={!!form.feedback_kitchen}
              onChange={(v) => setForm((f) => ({ ...f, feedback_kitchen: v }))}
              label="Gave feedback in the kitchen"
            />
            <Check
              checked={!!form.training_done}
              onChange={(v) => setForm((f) => ({ ...f, training_done: v }))}
              label="Ran training"
            />
            {form.training_done && (
              <textarea
                value={form.training_note ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, training_note: e.target.value }))}
                rows={2}
                placeholder="What the training covered"
                className={INPUT_CLASS + " w-full text-xs"}
              />
            )}
          </div>

          {err && <div className="text-xs text-red-400">{err}</div>}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Check checked={closeTask} onChange={setCloseTask} label="Close — this is handled" />
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy}
              className="ml-auto rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-400 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save handling"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Task row ─────────────────────────────────────────────────────────────────


interface BoPageManualRow { signal: string; means: string; do: string }
interface BoPage {
  key: string;
  slot: string;
  label: string;
  types: string[];
  manual: BoPageManualRow[];
  owner: string;
  owner_conflict: string[];
  red: number;
  yellow: number;
  open_total: number;
}

/**
 * What the colours on this page mean and what to send.
 *
 * The design has back-office staff "look at the colour, open the manual, send
 * the template" — three steps, of which only the middle one required leaving the
 * screen. Printing it here is what makes the job the zero-judgement script it was
 * meant to be.
 */
function ActionManual({ page }: { page: BoPage }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        <BookOpen className="h-3.5 w-3.5 text-violet-300" />
        <span className="text-xs font-bold uppercase tracking-wider text-violet-200">Action Manual</span>
        <span className="text-xs text-zinc-500">{page.label}</span>
        {open ? <ChevronUp className="ml-auto h-3.5 w-3.5 text-zinc-500" />
              : <ChevronDown className="ml-auto h-3.5 w-3.5 text-zinc-500" />}
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {page.manual.map((m, i) => (
            <div key={i} className="grid grid-cols-[minmax(140px,auto)_1fr] gap-x-3 gap-y-0.5 text-xs">
              <div className="font-semibold text-white">{m.signal}</div>
              <div className="text-zinc-300">{m.do}</div>
              <div className="text-zinc-500">{m.means}</div>
              <div />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface TaskRowProps {
  task: ManagementTask;
  template: ActionTemplate | null;
  onSend: (task: ManagementTask) => void;
  expanded: boolean;
  onToggle: () => void;
  onClaim?: (task: ManagementTask) => void;
  currentUser?: string;
  onHandled?: (task: ManagementTask) => void;
  justClosed?: boolean;
}

function TaskRow({ task, template, onSend, expanded, onToggle, onClaim, currentUser, onHandled, justClosed }: TaskRowProps) {
  const shortfall = shortfallSummary(task.context);
  return (
    <div className={TABLE_ROW + " border-white/8"}>
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <SevBadge sev={task.severity} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-white truncate">{fmtLabel(task.type)}</span>
            <span className="text-xs text-zinc-500">{task.branch}</span>
            {/* Name the person it went to. "Escalated" on its own says
                something happened somewhere else; the point of escalating is
                that it is now someone's, and the row should say whose. */}
            {task.escalated_at && (
              <span
                className="text-[10px] font-bold uppercase tracking-wide text-red-300 bg-red-500/15 border border-red-500/30 rounded px-1.5 py-0.5"
                title={`Escalated ${fmtTime(task.escalated_at)}`}
              >
                Escalated
                {typeof task.context?.escalated_to === "string" && task.context.escalated_to
                  ? ` → ${task.context.escalated_to}`
                  : ""}
              </span>
            )}
            {task.missed_by_manager && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-orange-300 bg-orange-500/15 border border-orange-500/30 rounded px-1.5 py-0.5">
                Missed
              </span>
            )}
          </div>
          {shortfall && (
            <div className="text-xs text-amber-300 mt-0.5 tabular-nums truncate">{shortfall}</div>
          )}
          <div className="flex items-center gap-3 mt-0.5">
            {/* manager_name is who the task is addressed to, not who answered
                it. This read "Replied by: <name>" on every row — harmless while
                almost no task had an addressee, and wrong on all of them once
                the duty roster started filling it in. */}
            <span className={T_CAPTION}>
              {task.response ? (
                <>Replied by: <span className="text-zinc-300">{task.manager_name || "the store"}</span></>
              ) : task.status === "open" ? (
                task.manager_name
                  ? <>Not sent yet — goes to <span className="text-zinc-300">{task.manager_name}</span></>
                  : <>Not sent yet</>
              ) : !task.sent_at ? (
                // Closed without ever going out — the auto-close sweep when the
                // report turned up, the seven-day expiry, or a bulk clear. 208
                // of these read "Sent … awaiting reply", which is wrong twice:
                // nothing was sent, and nothing is being awaited.
                <>Closed without being sent</>
              ) : task.status === "closed" ? (
                <>Sent to <span className="text-zinc-300">{task.manager_name || "the store"}</span> · closed</>
              ) : task.manager_name ? (
                <>Sent to <span className="text-zinc-300">{task.manager_name}</span> · awaiting reply</>
              ) : (
                <>Awaiting the store’s reply</>
              )}
            </span>
            <span className={T_CAPTION}>{fmtTime(task.created_at)}</span>
            {/* Whose queue this sits in. Without it on the row, a task owned by
                someone who is off today looks the same as one being worked on. */}
            <span className={T_CAPTION}>
              {task.bo_assignee ? (
                <>Owner: <span className="text-zinc-300">{task.bo_assignee}</span></>
              ) : (
                <span className="text-red-300">No owner</span>
              )}
            </span>
            {onClaim && task.status !== "closed" && task.bo_assignee !== currentUser && (
              <button
                onClick={() => onClaim(task)}
                className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
              >
                {task.bo_assignee ? "Take over" : "Take this"}
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge status={task.status} missed={!!task.missed_by_manager} />
          {task.status === "responded" && !expanded && (
            <button
              onClick={onToggle}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
            >
              Read reply &amp; close
            </button>
          )}
          {task.status === "open" && (
            <button
              onClick={() => onSend(task)}
              className="flex items-center gap-1.5 rounded-lg bg-violet-500 hover:bg-violet-400 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
            >
              <Send className="h-3.5 w-3.5" />
              Send
            </button>
          )}
          <button onClick={onToggle} className="text-zinc-500 hover:text-zinc-300 transition-colors p-1">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-3 space-y-2 border-t border-white/5 pt-3">
          {task.sent_message && (
            <div>
              <div className={T_LABEL + " mb-1"}>Sent Instruction</div>
              <div className="text-xs text-zinc-300 leading-relaxed bg-white/5 rounded-lg p-3 italic">
                {fillTemplate(task.sent_message, task.context)}
              </div>
              {task.sent_at && (
                <div className={T_CAPTION + " mt-1"}>Sent: {fmtTime(task.sent_at)}</div>
              )}
            </div>
          )}
          <PerPhotoAnswers task={task} />
          {task.response && (
            <div>
              <div className={T_LABEL + " mb-1"}>Manager Response</div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-2.5 py-0.5">
                  {task.response.replace(/_/g, " ")}
                </span>
                {task.response_action && (
                  <>
                    <span className="text-zinc-500 text-xs">→</span>
                    <span className="text-xs font-semibold text-sky-300 bg-sky-500/10 border border-sky-500/25 rounded-full px-2.5 py-0.5">
                      {task.response_action.replace(/_/g, " ")}
                    </span>
                  </>
                )}
                {task.responded_at && (
                  <span className={T_CAPTION}>at {fmtTime(task.responded_at)}</span>
                )}
              </div>
              {task.response_note && (
                <div className="text-xs text-zinc-400 mt-1">{task.response_note}</div>
              )}
              {/* The exit sits at the end of the reply, because finishing with
                  it is what closing means. It used to be further down, past a
                  photo block and an eight-field form, and 81 answered tasks sat
                  a median of three days without anyone reaching it. */}
              {onHandled && <CloseBar task={task} onChanged={onHandled} justClosed={justClosed} />}
            </div>
          )}
          {task.status === "sent" && !task.response && (
            <div className="flex items-center gap-2 text-xs text-amber-400">
              <Clock className="h-3.5 w-3.5" />
              Awaiting manager response…
            </div>
          )}
          {task.type === "product_score_c" && <TaskPhoto taskId={task.id} />}
          {/* Still offered when there is no reply to sit under — a task closed
              without one is rare but must not be impossible. */}
          {onHandled && !task.response && (
            <CloseBar task={task} onChanged={onHandled} justClosed={justClosed} />
          )}
          {onHandled && <HandlingPanel task={task} onSaved={onHandled} />}
          <TaskThread taskId={task.id} />
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BODashboardPage() {
  const router = useRouter();
  const auth = getAuth();

  const [tasks, setTasks] = useState<ManagementTask[]>([]);
  const [templates, setTemplates] = useState<Record<string, ActionTemplate>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [seeding, setSeeding] = useState(false);
  const [jobRuns, setJobRuns] = useState<JobRun[]>([]);
  const [detecting, setDetecting] = useState(false);

  // Filters
  // Arriving from a count on the Owners page means you want to see that whole
  // count, so a ?type= link opens on every status rather than the usual Open.
  // The page defaulting to Open + my pages is why the Owners figure and this
  // table disagreed with nothing on screen to explain it.
  // Opens on the work, not on "Open".
  //
  // The default was status=open, which on Manila showed one row while 81
  // replies waited to be closed and 23 sent instructions waited for an answer.
  // Someone opened this page, saw a single item and concluded there was
  // nothing to do — and the loop has completed end to end exactly zero times.
  const [statusFilter, setStatusFilter] = useState<string>("todo");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [pages, setPages] = useState<BoPage[]>([]);
  // Defaults to the pages this person owns. The design gives each back-office
  // member specific pages and says they "see only their exceptions"; a list of
  // everyone's is a list nobody treats as theirs.
  const [pageFilter, setPageFilter] = useState<string>("mine");
  const [justClosed, setJustClosed] = useState<Set<number>>(new Set());
  // Exception types whose data source has stopped, from the score API.
  const [blockedTypes, setBlockedTypes] = useState<string[]>([]);
  const [cityFilter, setCityFilter] = useState<string>(MANAGEMENT_CHANNEL_CITY);

  // Send modal
  const [sendingTask, setSendingTask] = useState<ManagementTask | null>(null);
  const [customMessage, setCustomMessage] = useState("");
  const [sending, setSending] = useState(false);

  // Expanded rows
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // How many tasks exist, against how many arrived. A list that is short
  // without saying so is why the counts and the table disagreed.
  const [taskTotal, setTaskTotal] = useState<number | null>(null);

  // Read straight from the URL rather than useSearchParams(): this page is
  // prerendered, and that hook forces a Suspense boundary around the whole
  // 1,700-line component. The effect only ever runs in the browser.
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const t = searchParams.get("type");
    const pg = searchParams.get("page");
    if (!t && !pg) return;
    if (t) { setTypeFilter(t); setPageFilter("all"); }
    if (pg) setPageFilter(pg);
    setStatusFilter(searchParams.get("status") || "all");
    const c = searchParams.get("city");
    if (c) setCityFilter(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!auth) { router.replace("/login?next=%2Fadmin%2Fmanagement%2Fback-office"); return; }
    if (!canAccessAdminNav(auth)) { router.replace("/"); return; }
  }, []);

  const loadTemplates = useCallback(async () => {
    const headers = getAuthHeaders(getAuth());
    const res = await fetch("/api/admin/management/templates", { headers });
    if (!res.ok) return;
    const data = await res.json();
    const map: Record<string, ActionTemplate> = {};
    for (const t of data.templates || []) {
      map[t.exception_type] = t;
    }
    setTemplates(map);
  }, []);

  const loadTasks = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    setError("");
    try {
      const headers = getAuthHeaders(getAuth());
      // Always fetch all statuses so KPI cards show accurate totals across all statuses
      // 200 was short. Manila alone holds 275 tasks, so 75 never reached this
      // page — 63 product_score_c, 10 disposal_missing, and both KPI tasks,
      // which had never once been visible. The KPI cards above are counted
      // from this same array, so a capped fetch quietly understated them too.
      const params = new URLSearchParams({ city: cityFilter, limit: "2000" });
      const res = await fetch(`/api/admin/management/tasks?${params}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTasks(data.tasks || []);
      // Refresh is the deliberate "I am finished with those" action.
      setJustClosed(new Set());
      // If it is ever short again, say so rather than looking complete.
      setTaskTotal(typeof data.total === "number" ? data.total : null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load tasks");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cityFilter]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/admin/management/bo-pages?city=${cityFilter}`, {
          headers: getAuthHeaders(getAuth()), cache: "no-store",
        });
        if (res.ok) setPages(((await res.json())?.pages ?? []) as BoPage[]);
      } catch { /* the dashboard still works without the manual */ }
    })();
  }, [cityFilter]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    loadTasks();
    loadJobRuns();
    void loadBlockedSources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadTasks]);

  // KPI counts
  const openCount      = tasks.filter(t => t.status === "open").length;
  const sentCount      = tasks.filter(t => t.status === "sent").length;
  const respondedCount = tasks.filter(t => t.status === "responded").length;
  const closedCount    = tasks.filter(t => t.status === "closed").length;
  const sentMissedCount = tasks.filter(t => t.status === "sent" && t.missed_by_manager).length;

  // Tasks closed in this sitting. Held in the list so their Reopen stays
  // reachable; cleared by Refresh, which is the deliberate "I'm done" action.
  const handleTaskChanged = (t: ManagementTask) => {
    setTasks((prev) => prev.map((x) => (x.id === t.id ? t : x)));
    setJustClosed((prev) => {
      const next = new Set(prev);
      if (t.status === "closed") next.add(t.id);
      else next.delete(t.id);
      return next;
    });
  };

  // Filter by status client-side (tasks are always fetched for all statuses for accurate KPI counts)
  const me = getAuth()?.staffName || "";
  const myPages = pages.filter((p) => p.owner && p.owner === me);
  const activePages =
    pageFilter === "all" ? pages
    : pageFilter === "mine" ? (myPages.length > 0 ? myPages : pages)
    : pages.filter((p) => p.key === pageFilter);
  const allowedTypes = new Set(activePages.flatMap((p) => p.types));

  const pageFilteredTasks = pages.length === 0
    ? tasks
    : tasks.filter((t) => allowedTypes.has(t.type));

  const typeFilteredTasks = typeFilter
    ? pageFilteredTasks.filter(t => t.type === typeFilter)
    : pageFilteredTasks;

  // A row you just closed stays put until the next Refresh, so the Reopen it
  // offers is still there when you realise you picked the wrong outcome.
  //
  // Without this the row vanishes the instant you tap a chip -- while the chip
  // is sitting under the words "Reopen if you pick the wrong one". The undo
  // exists, but you would have to know to go and find it under Closed, which
  // is a promise the screen makes and then breaks.
  const keptVisible = (t: ManagementTask) => justClosed.has(t.id);
  // What is waiting on a person right now: a reply to read and close, an
  // instruction nobody answered, or one not sent yet. A sent instruction still
  // inside its SLA is not on anybody's hands, so it is not in this list.
  const needsMe = (t: ManagementTask) =>
    t.status === "responded" ||
    t.status === "open" ||
    t.status === "escalated" ||
    (t.status === "sent" && !!t.missed_by_manager);

  const byStatus = (list: ManagementTask[]) =>
    statusFilter === "todo"
      ? list.filter(t => needsMe(t) || keptVisible(t))
    // The card says "to chase". Pressing it must land on the ones that can be
    // chased, not on all 23 sent — 15 of which are still inside their SLA and
    // are waiting on the manager, not on anybody here.
    : statusFilter === "chase"
      ? list.filter(t => (t.status === "sent" && !!t.missed_by_manager) || keptVisible(t))
    : statusFilter === "not_closed"
      ? list.filter(t => t.status !== "closed" || keptVisible(t))
    : statusFilter && statusFilter !== "all"
      ? list.filter(t => t.status === statusFilter || keptVisible(t))
    : list;

  const filteredTasks = byStatus(typeFilteredTasks);

  // The number on a page chip is how many rows pressing it shows -- counted
  // from the same array the list renders, under the same status filter.
  //
  // It used to come from the API's open_total, which counts everything not
  // closed. So the chips read 25 / - / 30 / 18 while the list, filtered to
  // Open, held 10. Three numbers on one screen for the same four pages, none
  // of them wrong on its own, and no way to tell that from looking.
  const statusOnlyTasks = byStatus(tasks);
  const pageChipCount = (key: string) => {
    const pg = pages.find((x) => x.key === key);
    if (!pg) return 0;
    const types = new Set(pg.types);
    return statusOnlyTasks.filter((t) => types.has(t.type)).length;
  };

  // A task whose type is on no page is invisible: the page filter drops it and
  // no chip counts it. Five of the seven cost alert types were in that state.
  const pagedTypes = new Set(pages.flatMap((p) => p.types));
  const orphanTasks = pages.length === 0
    ? []
    : statusOnlyTasks.filter((t) => !pagedTypes.has(t.type));

  // Order: cost first, then severity, then the one that has waited longest.
  //
  // It used to be severity then NEWEST first, which buries the oldest item at
  // the bottom of the list — the same shape that left a Clearance case waiting
  // 74 days out of sight. Every one of the 22 sent tasks is already past its
  // SLA, so "what has been waiting longest" is the only ordering that answers
  // the question the page is open to answer.
  //
  // kpi_* is pinned above severity because it is not one store's chore: it is
  // the company's food and prime cost. Two of them were raised, never sent, and
  // swept out with 80 product-score notices without anyone reading them.
  const isCost = (t: ManagementTask) => t.type.startsWith("kpi_");
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    const ca = Number(isCost(b)) - Number(isCost(a));
    if (ca !== 0) return ca;
    const sevOrd: Record<string, number> = { red: 0, yellow: 1, green: 2 };
    const so = (sevOrd[a.severity] ?? 9) - (sevOrd[b.severity] ?? 9);
    if (so !== 0) return so;
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    // Closed work reads newest-first — it is a record, not a queue.
    return a.status === "closed" && b.status === "closed" ? tb - ta : ta - tb;
  });

  // Which components the score API says it cannot measure, mapped back to the
  // exception types this page groups by, so a page with a dead source does not
  // report itself as clear.
  async function loadBlockedSources() {
    try {
      const res = await fetch(`/api/admin/management/manager-score?city=${cityFilter}`, {
        headers: getAuthHeaders(getAuth()),
      });
      if (!res.ok) return;
      const j = await res.json();
      const keys: string[] = (j?.blocked_components ?? []).map((b: { key: string }) => b.key);
      // The score's component keys and this page's exception types are two
      // different vocabularies; only attendance currently spans both.
      const TYPES: Record<string, string[]> = { attendance: ["attendance_unverified"] };
      setBlockedTypes(keys.flatMap((k) => TYPES[k] ?? []));
    } catch {
      /* a diagnostic that fails must not take the page with it */
    }
  }

  async function loadJobRuns() {
    try {
      const res = await fetch("/api/admin/management/job-runs", {
        headers: getAuthHeaders(getAuth()),
      });
      if (!res.ok) return;
      const d = await res.json();
      setJobRuns(d.runs || []);
    } catch {
      /* the banner degrades to "unknown", which is the honest reading */
    }
  }

  async function handleSeedTemplates() {
    setSeeding(true);
    try {
      const headers = getAuthHeaders(getAuth());
      const res = await fetch("/api/admin/management/seed-templates", {
        method: "POST",
        headers,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadTemplates();
    } catch {
      alert("Failed to seed templates. Please try again.");
    } finally {
      setSeeding(false);
    }
  }

  async function handleDetect() {
    if (cityFilter === "all") {
      alert("Please select a specific city (Manila or Dubai) to run detection.");
      return;
    }
    setDetecting(true);
    try {
      const headers = getAuthHeaders(getAuth());
      const res = await fetch("/api/admin/management/detect", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        // The date is the STORE's, not the browser's. toISOString() is UTC, so
        // a Manila morning run would have scanned yesterday.
        body: JSON.stringify({ city: cityFilter, date: storeToday(cityFilter) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      await loadTasks(true);

      // A failed detector must not read as a clean scan. The API reports which
      // ones broke and which items it declined to judge; showing only the
      // created count is how "0 new tasks" hides a dead rule.
      const errs: { detector: string; error: string }[] = data.errors || [];
      const skipped: { branch: string; item: string; reason: string }[] = data.skipped || [];
      const lines = [
        `Detection complete — ${data.created} new task${data.created !== 1 ? "s" : ""}.`,
      ];
      if (data.escalated) lines.push(`${data.escalated} task(s) escalated to red.`);
      if (data.missed) lines.push(`${data.missed} task(s) past SLA marked as missed.`);
      if (skipped.length) {
        lines.push(
          "",
          `${skipped.length} item(s) could NOT be judged:`,
          ...skipped.slice(0, 5).map(s => `  • ${s.branch} ${s.item} — ${s.reason}`),
          ...(skipped.length > 5 ? [`  • …and ${skipped.length - 5} more`] : []),
        );
      }
      if (errs.length) {
        lines.push(
          "",
          `⚠️ ${errs.length} detector(s) FAILED — those exceptions were not scanned:`,
          ...errs.map(e => `  • ${e.detector}: ${e.error}`),
        );
      }
      alert(lines.join("\n"));
    } catch (e) {
      alert(`Detection failed: ${e}`);
    } finally {
      setDetecting(false);
    }
  }

  function openSendModal(task: ManagementTask) {
    setSendingTask(task);
    setCustomMessage(fillTemplate(templates[task.type]?.message_en || "", task.context));
  }

  /** Take a task into your own queue.
   *
   *  HQ names an owner per exception type, which is right until that person is
   *  off — and then their queue is the only place the task appears. Anyone can
   *  pick it up; the name is what the dashboard filters and reports on.
   */
  async function claimTask(task: ManagementTask) {
    const me = getAuth()?.staffName || "";
    if (!me) return;
    try {
      const res = await fetch(`/api/admin/management/tasks/${task.id}`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(getAuth()), "Content-Type": "application/json" },
        body: JSON.stringify({ bo_assignee: me }),
      });
      if (!res.ok) throw new Error(`Could not take this task (${res.status})`);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, bo_assignee: me } : t)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleSend() {
    if (!sendingTask) return;
    setSending(true);
    try {
      const template = templates[sendingTask.type];
      // Send the substituted text, not the raw template — the stored
      // sent_message is what the manager and every later reader sees.
      const message = template
        ? fillTemplate(template.message_en, sendingTask?.context)
        : customMessage.trim();
      const headers = getAuthHeaders(getAuth());
      const res = await fetch(`/api/admin/management/tasks/${sendingTask.id}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "sent",
          sent_message: message,
          template_key: sendingTask.type,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The server refuses to send a Manila task with no owner. Say which
        // branch and what to do — "Failed, try again" would send the person
        // round the same loop, and retrying cannot help.
        throw new Error(data?.detail || `HTTP ${res.status}`);
      }
      // The task is recorded either way; a ping that did not leave is worth
      // knowing about rather than assuming.
      if (data?.notified && data.notified.sent === false) {
        setError(`Sent, but Discord was not notified — ${data.notified.reason}.`);
      }
      setSendingTask(null);
      setCustomMessage("");
      await loadTasks(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send instruction.");
    } finally {
      setSending(false);
    }
  }

  function toggleExpand(id: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0f1e] via-[#0d1526] to-[#0a0f1e] pb-24">
      <div className="mx-auto max-w-5xl px-4 pt-6">
        <MgmtChannelTabBar active="bo" />
        <AutoCheckBanner runs={jobRuns} city={cityFilter} />
        <SentStampBanner city={cityFilter} />
        <FarConfirmBanner city={cityFilter} />
        <BreakBanner city={cityFilter} />
        <AnswerRates city={cityFilter} />


        {/* Header */}
        <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className={T_PAGE_TITLE}>Management Back Office</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Review store exceptions and send pre-written instructions to managers.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDetect}
              disabled={detecting || cityFilter === "all"}
              className={SMALL_BUTTON + " flex items-center gap-2"}
              title={cityFilter === "all" ? "Select a city first" : "Scan for new exceptions"}
            >
              <AlertTriangle className={`h-3.5 w-3.5 ${detecting ? "animate-pulse" : ""}`} />
              {detecting ? "Detecting…" : "Run Detection"}
            </button>
            <button
              onClick={() => loadTasks(true)}
              disabled={refreshing}
              className={SMALL_BUTTON + " flex items-center gap-2"}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Says so when the list is short, instead of looking complete. */}
        {taskTotal != null && taskTotal > tasks.length && (
          <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-200">
            Showing {tasks.length} of {taskTotal} tasks — the counts above and the
            Owners page cover all {taskTotal}. Narrow by city or status to see the rest.
          </div>
        )}

        {/* KPI Row — pressing one filters the table to it. A number you can
            read but not reach is how the Owners count and this table came to
            disagree with no way to see which rows made it up. */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          {[
            // Each card names the job, not the state. Closed 215 used to be the
            // biggest number on the screen and the only one nobody can act on.
            { key: "responded", label: "Replies to close", value: respondedCount, color: "text-emerald-400",
              note: respondedCount > 0 ? "a manager answered — read it and close" : "" },
            { key: "open",      label: "To send", value: openCount, color: "text-violet-400",
              note: "" },
            // "Awaiting" reads as "the clock is still running". For all 22 of
            // Manila's it had already stopped -- every one was past its SLA,
            // the oldest by thirteen days -- and no number on this screen said
            // so. The card now says how many are overdue, or nothing when none
            // are, so the word only appears when it means something.
            // The number is the one you can act on. It used to be all 23 sent
            // under the word "chase", while only 8 were past their SLA and the
            // list below showed those 8 — the card and the list disagreeing on
            // the same screen about the same thing.
            { key: sentMissedCount > 0 ? "chase" : "sent",
              label: sentMissedCount > 0 ? "To chase" : "Waiting for reply",
              value: sentMissedCount > 0 ? sentMissedCount : sentCount,
              color: "text-amber-400",
              note: sentMissedCount > 0
                ? (sentMissedCount === sentCount
                    ? "every sent instruction is past its SLA"
                    : `${sentCount - sentMissedCount} more still inside their SLA`)
                : "" },
            { key: "closed",    label: "Done", value: closedCount, color: "text-zinc-400",
              note: "" },
          ].map(({ key, label, value, color, note }) => (
            <button
              key={label}
              type="button"
              onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}
              className={`${KPI_CARD} text-left transition-colors hover:bg-white/[0.07] ${
                statusFilter === key ? "ring-1 ring-violet-400/60" : ""
              }`}
            >
              <div className={KPI_LABEL}>{label}</div>
              <div className={KPI_VALUE + " " + color}>{value}</div>
              {note && (
                <div className={`text-[11px] font-semibold ${
                  key === "sent" ? "text-red-300" : "text-zinc-500"
                }`}>
                  {note}
                </div>
              )}
            </button>
          ))}
        </div>

        {/* What the table below is actually showing, said plainly. The page
            opens filtered to Open and to your own pages, which is useful and
            was invisible: a count of 26 elsewhere against 12 here looks like a
            fault rather than a filter. */}
        <div className="mb-5 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-white/45">Showing</span>
          <span className="font-semibold text-white">{sortedTasks.length}</span>
          <span className="text-white/45">of {tasks.length} loaded —</span>
          <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-white/70">
            {/* The words people chose, not the key the code stores. "todo only"
                was reaching the screen. */}
            {statusFilter === "all" ? "every status"
              : statusFilter === "not_closed" ? "not closed — the Owners figure"
              : statusFilter === "todo" ? "waiting on you"
              : statusFilter === "chase" ? "no reply past SLA"
              : statusFilter === "open" ? "not sent yet"
              : statusFilter === "sent" ? "sent, awaiting reply"
              : statusFilter === "responded" ? "replied, not closed"
              : statusFilter === "closed" ? "closed"
              : `${statusFilter} only`}
          </span>
          {pageFilter !== "all" && (
            <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-white/70">
              {/* "mine" falls back to every page when you own none. It used to
                  still say "my pages", so the screen claimed a filter it was
                  not applying. */}
              {pageFilter === "mine"
                ? (myPages.length > 0 ? "my pages" : "all pages — none assigned to you")
                : pageFilter}
            </span>
          )}
          {typeFilter && (
            <button
              type="button"
              onClick={() => setTypeFilter("")}
              className="rounded-full border border-sky-400/40 bg-sky-500/10 px-2 py-0.5 text-sky-200 hover:bg-sky-500/20"
            >
              {typeFilter} ✕
            </button>
          )}
          {(statusFilter !== "all" || pageFilter !== "all" || typeFilter) && (
            <button
              type="button"
              onClick={() => { setStatusFilter("all"); setPageFilter("all"); setTypeFilter(""); }}
              className="text-violet-300 underline underline-offset-2 hover:text-violet-200"
            >
              show everything
            </button>
          )}
          {/* The order is a rule, so it is written down. An ordering nobody can
              see is one nobody trusts, and it gets worked around. */}
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-white/50">
            Cost first, then red, then longest waiting
          </span>
          <span className="ml-auto text-white/35">
            The Owners page counts every task that is not Closed.
          </span>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="flex items-center gap-2">
            <span className={T_LABEL}>City</span>
            <SelectDark
              value={cityFilter}
              onChange={v => setCityFilter(v)}
              options={[
                { value: "manila", label: "Manila" },
                { value: "dubai",  label: "Dubai" },
              ]}
              className="w-32 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className={T_LABEL}>Status</span>
            <SelectDark
              value={statusFilter}
              onChange={v => setStatusFilter(v)}
              options={[
                // First, and the default: everything sitting on a person.
                { value: "todo",       label: "Needs me" },
                { value: "open",       label: "Open" },
                { value: "sent",       label: "Sent" },
                { value: "responded",  label: "Responded" },
                { value: "closed",     label: "Closed" },
                // The category the Owners counts use. Without it, clicking a
                // count of 26 landed on 33 rows because the seven closed ones
                // came too — the same mismatch, one screen later.
                { value: "not_closed", label: "Not closed (open+sent+responded)" },
                { value: "all",        label: "All" },
              ]}
              className="w-36 text-sm"
            />
          </div>
        </div>

        {/* Task List */}
        {pages.length > 0 && (
          <div className="mb-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={T_LABEL}>Page</span>
              {[{ key: "mine", label: myPages.length > 0 ? "My pages" : "My pages (none assigned)" },
                ...pages.map((p) => ({ key: p.key, label: p.label })),
                { key: "all", label: "All" }].map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setPageFilter(o.key)}
                  className={`rounded-lg border px-3 py-1 text-xs font-semibold transition-colors ${
                    pageFilter === o.key
                      ? "border-violet-500/50 bg-violet-500/20 text-white"
                      : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10"
                  }`}
                >
                  {o.label}
                  {o.key !== "mine" && o.key !== "all" && (() => {
                    const n = pageChipCount(o.key);
                    return n > 0
                      ? <span className="ml-1.5 tabular-nums text-zinc-400">{n}</span>
                      : null;
                  })()}
                </button>
              ))}
            </div>

            {/* A type on no page cannot be reached from any chip and is not in
                any count. Two red company-wide cost alerts sat in that state
                for eight days and were bulk-closed unread. Say so instead of
                letting it be silent. */}
            {orphanTasks.length > 0 && (
              <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                <b>{orphanTasks.length} task(s) belong to no page</b> and are hidden unless
                Page is set to All: {[...new Set(orphanTasks.map((t) => t.type))].join(", ")}.
                <button
                  type="button"
                  onClick={() => setPageFilter("all")}
                  className="ml-2 underline underline-offset-2 hover:text-white"
                >
                  Show them
                </button>
              </div>
            )}

            {/* The manual for whatever is being worked, on the page being worked. */}
            {activePages.map((p) => (
              <div key={p.key} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-white">{p.label}</span>
                  <span className="text-zinc-500">{p.slot}</span>
                  {p.owner
                    ? <span className="text-zinc-400">Owner: <span className="text-zinc-200">{p.owner}</span></span>
                    : <span className="text-red-300">No owner set</span>}
                  {p.owner_conflict.length > 0 && (
                    <span className="text-amber-300">
                      Split between: {p.owner_conflict.join(" / ")}
                    </span>
                  )}
                  {/* Counted the same way as the chip and the list. These came
                      from the API's not-closed figures, so once the chip was
                      fixed this line sat next to it saying "19 red 6 yellow"
                      against a chip of 3 -- the same disease one row down. */}
                  {(() => {
                    const types = new Set(p.types);
                    const mine = statusOnlyTasks.filter((t) => types.has(t.type));
                    const red = mine.filter((t) => t.severity === "red").length;
                    const yellow = mine.filter((t) => t.severity === "yellow").length;
                    return (
                      <>
                        {red > 0 && <span className="text-red-300">{red} red</span>}
                        {yellow > 0 && <span className="text-amber-300">{yellow} yellow</span>}
                        {mine.length === 0 && (
                          // "nothing to do" is only true if we are able to
                          // look. Attendance & HR has raised nothing since the
                          // feed behind it stopped in July, and saying
                          // "nothing to do" about a blind spot is the worst
                          // thing this page could say.
                          blockedTypes.some((t) => p.types.includes(t))
                            ? <span className="text-amber-300">not measurable — see Weekly Review</span>
                            : <span className="text-zinc-500">nothing to do</span>
                        )}
                      </>
                    );
                  })()}
                </div>
                <ActionManual page={p} />
              </div>
            ))}
          </div>
        )}

        <div className={GLASS_CARD + " overflow-hidden"}>
          {loading ? (
            <div className="flex items-center justify-center py-16 text-zinc-500">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading…
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-red-400 p-6">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          ) : sortedTasks.length === 0 ? (
            <div className="py-16 text-center text-zinc-500">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-zinc-600" />
              <div className="text-sm">No tasks for the selected filters.</div>
              {statusFilter === "open" && (
                <div className="text-xs mt-1 text-zinc-600">No open exceptions — all clear! ✅</div>
              )}
            </div>
          ) : (
            <div>
              {/* Table header */}
              <div className="hidden sm:flex items-center gap-3 px-4 py-2 border-b border-white/8">
                <div className="w-6" />
                <div className={TABLE_HEADER + " flex-1"}>Exception</div>
                <div className={TABLE_HEADER + " w-28"}>Branch</div>
                <div className={TABLE_HEADER + " w-28"}>Detected</div>
                <div className={TABLE_HEADER + " w-28"}>Status</div>
                <div className={TABLE_HEADER + " w-20 text-right"}>Action</div>
              </div>
              {sortedTasks.map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  template={templates[task.type] || null}
                  onSend={openSendModal}
                  expanded={expanded.has(task.id)}
                  onToggle={() => toggleExpand(task.id)}
                  onClaim={claimTask}
                  currentUser={getAuth()?.staffName || ""}
                  onHandled={handleTaskChanged}
                  justClosed={justClosed.has(task.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* No templates warning */}
        {Object.keys(templates).length === 0 && !loading && (
          <div className="mt-4 rounded-xl border border-amber-800/40 bg-amber-950/20 p-4 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-amber-300">⚠️ No action templates loaded</div>
                <div className="text-amber-400/80 mt-1 text-xs">
                  Seed the default templates to enable pre-written instructions for all exception types.
                </div>
              </div>
              <button
                onClick={handleSeedTemplates}
                disabled={seeding}
                className="shrink-0 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
              >
                {seeding ? "Seeding…" : "Seed Default Templates"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Send Modal */}
      {sendingTask && (
        <SendModal
          task={sendingTask}
          template={templates[sendingTask.type] || null}
          customMessage={customMessage}
          onChangeMessage={setCustomMessage}
          onConfirm={handleSend}
          onClose={() => { setSendingTask(null); setCustomMessage(""); }}
          sending={sending}
        />
      )}
    </div>
  );
}
