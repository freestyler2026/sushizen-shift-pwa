"use client";

/** Who was hired, and what became of each month's applicants.
 *
 *  The 29 hires used to sit inside a flat list of 1,061 closed rows, in the
 *  same typeface as the rejections, searchable only by name -- so "who did we
 *  hire" could only be answered by somebody who already knew the names.
 *
 *  The cohort table underneath follows the people, not the columns. A board
 *  column holds whoever is sitting in it today, so a finished month reads zero
 *  on the board however many it hired.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, Search, UserPlus } from "lucide-react";
import { getAuthHeaders } from "@/lib/auth";
import type { Auth } from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import {
  GLASS_CARD, T_CARD_TITLE, T_CAPTION, TABLE_HEADER, TABLE_ROW,
} from "@/lib/ui-tokens";
import {
  monthLabel, dayLabel, notOnRoster, daysToHireLine, cohortTotals,
  toRegister, toCheckFirst, waitedLabel,
  type Outcomes, type HiredRow,
} from "@/lib/hr-hires";
import { isoToday } from "@/lib/date";

export default function HiredOutcomes({
  auth,
  onSelectName,
}: {
  auth: Auth | null;
  /** The hire's own card still holds the interview, the resume and the notes,
   *  so a name here reaches it rather than being a dead end. */
  onSelectName?: (name: string) => void;
}) {
  const [data, setData] = useState<Outcomes | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!auth) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        // Manila, like the board above it. Every one of the 1,200 applicants is
        // Manila; Dubai has never had one, so a city switch here would be a
        // permanently empty second view. Change both together if that changes.
        const res = await fetch(
          `${API_BASE}/api/admin/hr/recruitment/outcomes?city=manila`,
          { headers: getAuthHeaders(auth), cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        if (alive) setData(j as Outcomes);
      } catch (e: unknown) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [auth]);

  if (!auth) {
    // Never an empty panel. The page redirects an unauthenticated viewer to
    // login, so this is the instant before that happens -- and saying so beats
    // a blank rectangle that looks like "no hires".
    return <p className="p-4 text-sm text-zinc-500">Signing in…</p>;
  }
  if (loading && !data) {
    return <p className="p-4 text-sm text-zinc-500">Loading…</p>;
  }
  if (error) {
    // A failed load must say so. A screen that shows "0 hired" because the
    // request failed is reporting a business fact that is not true.
    return (
      <p className="p-4 text-sm text-rose-300">
        Could not load the hires: {error}
      </p>
    );
  }
  if (!data) return null;

  const hired = data.hired || [];
  const missing = notOnRoster(hired);
  const totals = cohortTotals(data.cohorts || []);
  const pace = daysToHireLine(data.days_to_hire);
  // Hires with no hired event in the log. Their `hired_on` is the day the row
  // was last touched, which is not a hire date and therefore not a duration.
  const approximate = hired.filter((h) => !h.hired_date_is_recorded).length;

  return (
    <div className="flex flex-col gap-4 p-3">
      {/* ── The one number this tab exists for ───────────────────────────── */}
      <div className={`${GLASS_CARD} p-4`}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-3xl font-bold tabular-nums text-emerald-300">
            {hired.length}
          </span>
          <span className="text-sm text-zinc-300">
            hired{totals.applied
              ? ` from ${totals.applied.toLocaleString()} applications (${totals.hire_rate}%)`
              : ""}
          </span>
        </div>
        {pace && <p className={`${T_CAPTION} mt-2`}>{pace}</p>}
        {data.events_from && (
          /* The honest boundary. Anything before this date carries a final
             status and nothing else -- no hire date, so no time to hire. The
             count is here because it is 17 of 29: large enough that leaving
             the reader to notice it row by row would be hiding it. */
          <p className={`${T_CAPTION} mt-1`}>
            Stage history begins {dayLabel(data.events_from)}{" "}
            {String(data.events_from).slice(0, 4)}.{" "}
            {approximate > 0 && `${approximate} of ${hired.length} hires were decided before
             then, so their record carries no hire date — those rows show the day
             the record was last touched instead, and no day count.`}
          </p>
        )}
      </div>

      {/* ── Hired, with no staff record ──────────────────────────────────── */}
      {missing.length > 0 && <UnregisteredHires rows={missing} />}

      {/* ── What became of each month's applicants ───────────────────────── */}
      <div className={`${GLASS_CARD} p-4`}>
        <h3 className={T_CARD_TITLE}>By the month they applied</h3>
        <p className={`${T_CAPTION} mt-0.5`}>
          Following the people, not the columns — a month that has finished
          reads zero on the board however many it hired. &ldquo;Deciding&rdquo;
          is applicants from that month who are still on the board.
        </p>
        <div className="mt-3 -mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-left">
                <th className={TABLE_HEADER}>Month</th>
                <th className={`${TABLE_HEADER} text-right`}>Applied</th>
                <th className={`${TABLE_HEADER} text-right`}>Hired</th>
                <th className={`${TABLE_HEADER} text-right`}>Rejected</th>
                <th className={`${TABLE_HEADER} text-right`}>Deciding</th>
                <th className={`${TABLE_HEADER} text-right`}>Rate</th>
              </tr>
            </thead>
            <tbody>
              {(data.cohorts || []).map((c) => (
                <tr key={c.month} className={TABLE_ROW}>
                  <td className="py-2 text-zinc-200">{monthLabel(c.month)}</td>
                  <td className="py-2 text-right tabular-nums text-zinc-300">
                    {c.applied.toLocaleString()}
                  </td>
                  <td className="py-2 text-right tabular-nums font-semibold text-emerald-300">
                    {c.hired}
                  </td>
                  <td className="py-2 text-right tabular-nums text-zinc-500">{c.rejected}</td>
                  <td className="py-2 text-right tabular-nums text-zinc-400">
                    {c.still_open || "—"}
                  </td>
                  <td className="py-2 text-right tabular-nums text-zinc-200">
                    {c.hire_rate}%
                    {/* A month still being decided can only go up, and without
                        this an unfinished month reads as the worst one. */}
                    {!c.complete && (
                      <span
                        className="ml-1 text-[10px] text-amber-300/80"
                        title={`${c.still_open} of these applicants are still being decided, so this rate can only rise.`}
                      >
                        so far
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── The hires themselves ─────────────────────────────────────────── */}
      <div className={`${GLASS_CARD} p-4`}>
        <h3 className={T_CARD_TITLE}>Everyone hired</h3>
        <p className={`${T_CAPTION} mt-0.5`}>Most recent first.</p>
        <div className="mt-3 -mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="text-left">
                <th className={`${TABLE_HEADER} pr-3`}>Name</th>
                <th className={`${TABLE_HEADER} pr-3`}>Position</th>
                <th className={`${TABLE_HEADER} pr-3`}>Branch</th>
                <th className={`${TABLE_HEADER} pr-3`}>Applied</th>
                <th className={`${TABLE_HEADER} pr-3`}>Hired</th>
                <th className={`${TABLE_HEADER} pr-3 text-right`}>Days</th>
                <th className={TABLE_HEADER}>Source</th>
              </tr>
            </thead>
            <tbody>
              {hired.map((h) => <HireRow key={h.id} h={h} onSelectName={onSelectName} />)}
            </tbody>
          </table>
        </div>
        {hired.length === 0 && (
          <p className="mt-2 text-sm text-zinc-500">Nobody has been hired yet.</p>
        )}
      </div>
    </div>
  );
}

/** Hired, with nothing on the staff roster to pay them from.
 *
 *  Being hired and being registered are two separate acts, and the second is
 *  the one that makes a shift, a payslip and a login exist. So this is a job,
 *  not a statistic, and it is written as one: who, since when, and what to
 *  press.
 *
 *  It is in two parts because on 2026-10-04 two of the five were already on the
 *  roster under a different spelling — Joefferson Sucia and Cedie Mamauag. A
 *  flat "register these five" would have asked for two duplicate staff records,
 *  and a duplicate splits somebody's shifts and their pay, which is far harder
 *  to undo than a spelling.
 */
function UnregisteredHires({ rows }: { rows: HiredRow[] }) {
  const today = isoToday();
  const register = toRegister(rows);
  const check = toCheckFirst(rows);

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/8 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-100">
        <AlertTriangle size={15} />
        {rows.length} {rows.length === 1 ? "hire" : "hires"} did not match a staff record
      </h3>
      <p className="mt-1 text-xs text-amber-200/75">
        Being hired and being registered are two separate acts, and the second is
        the one that makes a shift, a payslip and a login exist
        {check.length > 0
          ? " — but a name can also simply be spelled differently, so the two lists are not the same job."
          : "."}
      </p>

      {register.length > 0 && (
        <section className="mt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-300/90">
            Register these {register.length === 1 ? "" : `${register.length} `}
            — nobody on the roster resembles them
          </h4>
          <div className="mt-2 flex flex-col gap-2">
            {register.map((h) => (
              <div
                key={h.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-amber-500/25 bg-black/20 px-3 py-2"
              >
                <span className="font-semibold text-amber-50">{h.full_name.trim()}</span>
                <span className="text-xs text-amber-200/70">
                  {[h.position_applied, h.assigned_branch].filter(Boolean).join(" · ") || "—"}
                </span>
                {h.phone && (
                  <span className="text-xs tabular-nums text-amber-200/60">{h.phone.trim()}</span>
                )}
                <span className="ml-auto text-xs text-amber-200/60" title={
                  h.hired_date_is_recorded
                    ? "The day the hire was recorded."
                    : "Their hire date is not in the log — this is the day the record was last touched, so they have been waiting at least this long."}>
                  hired {dayLabel(h.hired_on)}
                  {waitedLabel(h, today) ? ` · ${waitedLabel(h, today)}` : ""}
                </span>
                {/* Straight to the form, carrying what it needs to be filled
                    in. Sending somebody to "the Staff page" is a second search
                    for a name they are already looking at. */}
                <a
                  href={`/admin/staff/create?city=manila&name=${encodeURIComponent(h.full_name.trim())}`}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-100 hover:bg-amber-500/25 transition-colors"
                >
                  <UserPlus size={13} /> Register
                </a>
              </div>
            ))}
          </div>
          {/* The other reading of an old row, and the only one where
              registering them would be wrong. */}
          <p className="mt-2 text-xs text-amber-200/60">
            If somebody here never actually started, do not register them — open
            their name in the table below and change the status instead.
          </p>
        </section>
      )}

      {check.length > 0 && (
        <section className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-300/90">
            Look {check.length === 1 ? "this one" : "these"} up first — the
            roster has a name this close
          </h4>
          <p className="mt-1 text-xs text-amber-200/70">
            Probably the same person, spelled differently. A second record splits
            their shifts and their pay, so fix the spelling on one of the two
            rather than creating anything.
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {check.map((h) => (
              <div
                key={h.id}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm"
              >
                <span className="font-medium text-zinc-100">{h.full_name.trim()}</span>
                <span className="text-zinc-500">on the roster as</span>
                {(h.roster_candidates || []).map((c) => (
                  <span key={c.staff_name} className="font-medium text-zinc-100">
                    {c.staff_name}
                    <span className="ml-1.5 text-xs font-normal text-zinc-500">
                      {[c.status, c.branch_code].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                ))}
                <a
                  href="/admin/staff"
                  className="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-semibold text-zinc-200 hover:bg-white/10 transition-colors"
                >
                  <Search size={13} /> Open Staff
                </a>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function HireRow({
  h,
  onSelectName,
}: {
  h: HiredRow;
  onSelectName?: (name: string) => void;
}) {
  // When the log has no hired event, `hired_on` is the day the row was last
  // touched. Printing that as a hire date would make the number next to it a
  // measurement of nothing, so both are marked.
  const guessed = !h.hired_date_is_recorded;
  const near = h.roster_candidates || [];
  return (
    <tr className={TABLE_ROW}>
      <td className="py-2 pr-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {onSelectName ? (
            <button
              type="button"
              onClick={() => onSelectName(h.full_name)}
              className="text-left font-medium text-zinc-100 underline decoration-white/20 underline-offset-2 hover:decoration-violet-400"
            >
              {h.full_name}
            </button>
          ) : (
            <span className="font-medium text-zinc-100">{h.full_name}</span>
          )}
          {!h.on_roster && (
            near.length > 0 ? (
              <span
                className="shrink-0 rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[11px] text-zinc-300"
                title={`The roster has ${near.map((c) => c.staff_name).join(" or ")}, which may be the same person spelled differently. Look before creating anything.`}
              >
                Check spelling
              </span>
            ) : (
              <span
                className="shrink-0 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-200"
                title="Hired, and nobody on the staff roster resembles them — so no shift, no payslip and no login."
              >
                No staff record
              </span>
            )
          )}
        </div>
      </td>
      <td className="py-2 pr-3 text-zinc-300">{h.position_applied || "—"}</td>
      <td className="py-2 pr-3 text-zinc-400">{h.assigned_branch || "—"}</td>
      <td className="py-2 pr-3 tabular-nums text-zinc-400">{dayLabel(h.applied_date)}</td>
      <td className="py-2 pr-3 tabular-nums text-zinc-300">
        {dayLabel(h.hired_on)}
        {guessed && (
          <span
            className="ml-1 text-[10px] text-zinc-500"
            title="No hired event in the log for this person. This is the day their record was last touched, which is the closest the data gets — it is not the day they were hired."
          >
            last touched
          </span>
        )}
      </td>
      {/* No day count without a hire date. Subtracting the day somebody last
          opened the record gives a number that looks like a duration and
          measures nothing -- one June hire's row was last touched in
          September, which would have read as 90 days to hire. */}
      <td className="py-2 pr-3 text-right tabular-nums text-zinc-300">
        {guessed || h.days_to_hire == null ? (
          <span className="text-zinc-600" title={guessed
            ? "Their hire date is not in the log, so how long it took cannot be measured."
            : "No application date on this record."}>—</span>
        ) : h.days_to_hire}
      </td>
      <td className="py-2 text-zinc-400">
        {h.source || "—"}
        {h.referrer_name ? ` · ${h.referrer_name}` : ""}
      </td>
    </tr>
  );
}
