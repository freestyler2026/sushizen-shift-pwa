"use client";

import { useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/auth";

type ApplyBlocked = {
  days: number;
  blocked_people: number;
  recovered_people: number;
  gave_up: number;
  rows_ever: number;
  recording_since: string | null;
  // Arrivals are counted in their own table and started later than the
  // blocked half, so they are optional here: an older backend answers
  // without them and the card must still draw.
  arrivals?: number;
  arrivals_submitted?: number;
  arrivals_blocked?: number;
  // Counted by network rather than by page load, so one person who reloads
  // three times is one visitor. The tiles read as people, so they use these.
  arrival_ips?: number;
  arrival_ips_submitted?: number;
  views_since?: string | null;
  by_field: { field: string; people: number; gave_up: number }[];
};

/** Field names as the applicant sees them, so the row reads as the screen. */
const BLOCKED_LABEL: Record<string, string> = {
  full_name: "Full name",
  phone: "Mobile number",
  position_group: "What work are you applying for?",
  branch: "Which branch do you prefer?",
  experience_level: "Experience in food service",
  facebook_url: "Facebook profile link",
  last_employer: "Where did you work last?",
  last_position: "What was your position there?",
  cv: "Your CV",
};

/** How many people reached the form, how many sent it, and what stopped the rest.
 *
 *  It sits on the Pipeline because "who applied" and "who tried and could not"
 *  are the same question asked twice, and the second one had no answer at all
 *  until 24 Sep: the only record of a submission is written when one succeeds.
 *
 *  The top row is arrivals, added 27 Sep. Without it a drop in applications
 *  could not be split into "fewer people came" and "the same people came and
 *  could not send" -- the question actually asked when the count fell, and the
 *  one the blocked half alone can only answer by elimination.
 *
 *  Counted by form id, not by row — somebody who fixes two fields and sends
 *  produces three rows and was never lost. The column that matters is the one
 *  headed "gave up".
 */
export default function FormFunnel() {
  const [data, setData] = useState<ApplyBlocked | null>(null);
  const [error, setError] = useState("");
  const [days, setDays] = useState(14);

  useEffect(() => {
    let dead = false;
    setError("");
    fetch(`/api/admin/hr/apply-blocked?days=${days}`, { headers: getAuthHeaders(), cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: ApplyBlocked) => { if (!dead) setData(d); })
      // Never "0 people were stopped" when the truth is "we could not ask".
      .catch((e) => { if (!dead) { setData(null); setError(String(e)); } });
    return () => { dead = true; };
  }, [days]);

  const since = data?.recording_since
    ? new Date(data.recording_since).toLocaleDateString(undefined, { day: "numeric", month: "short" })
    : null;
  const viewsSince = data?.views_since
    ? new Date(data.views_since).toLocaleDateString(undefined, { day: "numeric", month: "short" })
    : null;
  const loads = data?.arrivals ?? 0;
  // People, not page loads: a form id is minted per load, so somebody who
  // reloads twice before sending would otherwise show up as two losses.
  // The other direction is a shared shop wifi counting several people once,
  // which is why the page-load figure is still printed under the tiles.
  const arrivals = data?.arrival_ips ?? 0;
  const sent = data?.arrival_ips_submitted ?? 0;
  // Everyone who opened the form and never sent it. Bigger than "gave up"
  // below on purpose: that one counts only the people the form stopped, and
  // most of the people who leave are never stopped by anything.
  const left = Math.max(arrivals - sent, 0);

  return (
    <div className="mx-3 mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-200">
          Who reached the form, and who sent it
        </h3>
        <div className="flex items-center gap-1">
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`rounded-lg px-2 py-0.5 text-[11px] transition ${
                days === d ? "bg-violet-500/25 text-violet-100" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="mt-2 text-xs text-rose-300">
          Could not read it ({error}). This is not the same as nobody being stopped.
        </p>
      )}

      {!error && data && arrivals > 0 && (
        <>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {([
              ["Opened the form", arrivals, "text-zinc-200"],
              ["Sent it", sent, "text-emerald-300"],
              ["Left without sending", left, "text-amber-300"],
            ] as const).map(([label, n, tone]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <div className={`text-xl font-semibold tabular-nums ${tone}`}>{n}</div>
                <div className="text-[11px] leading-tight text-zinc-500">{label}</div>
              </div>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-zinc-600">
            Counted{viewsSince ? ` since ${viewsSince}` : ""} by network, so one
            person who reloads counts once and a shared shop connection counts
            several people once. {loads} page load{loads === 1 ? "" : "s"} in total.
            Leaving without sending does not mean the form stopped them &mdash;
            most who leave are never stopped by anything.
          </p>
        </>
      )}

      {!error && data && arrivals === 0 && (
        <p className="mt-2 text-xs italic text-zinc-500">
          Arrivals are not counted yet for this window. Until they are, a quiet week
          cannot be told apart from a form nobody can send.
        </p>
      )}

      {!error && data && data.rows_ever === 0 && (
        <p className="mt-2 text-xs italic text-zinc-500">
          Nothing recorded yet. Counting started on 24 Sep — before that a send that
          failed left no trace anywhere, which is why last week&rsquo;s drop could not be
          explained.
        </p>
      )}

      {!error && data && data.rows_ever > 0 && (
        <>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {([
              ["Gave up", data.gave_up, "text-rose-300"],
              ["Fixed it and sent", data.recovered_people, "text-emerald-300"],
              ["Stopped at least once", data.blocked_people, "text-zinc-200"],
            ] as const).map(([label, n, tone]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <div className={`text-xl font-semibold tabular-nums ${tone}`}>{n}</div>
                <div className="text-[11px] leading-tight text-zinc-500">{label}</div>
              </div>
            ))}
          </div>

          {data.by_field.length > 0 && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-500">
                    <th className="py-1 text-left font-normal">Field</th>
                    <th className="py-1 text-right font-normal w-20">Stopped</th>
                    {/* Not "Gave up" again: the tile above counts people and
                        this counts them per field, and one card cannot use the
                        same two words for two different scopes. */}
                    <th className="py-1 text-right font-normal w-20">Never sent</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_field.map((f) => (
                    <tr key={f.field} className="border-t border-white/5">
                      <td className="py-1 text-zinc-300">{BLOCKED_LABEL[f.field] ?? f.field}</td>
                      <td className="py-1 text-right tabular-nums text-zinc-400">{f.people}</td>
                      <td className={`py-1 text-right tabular-nums ${f.gave_up > 0 ? "text-rose-300" : "text-zinc-600"}`}>
                        {f.gave_up}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-2 text-[11px] text-zinc-600">
            Counted per person, not per attempt{since ? `, since ${since}` : ""}. One
            person who fixes two fields and sends is one row here, not three.
          </p>
        </>
      )}
    </div>
  );
}
