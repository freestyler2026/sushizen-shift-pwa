"use client";

/**
 * Back-office days: presence against engagement.
 *
 * Built to answer one question the owners asked plainly -- is somebody signed
 * in and going through the motions. The only thing a system can see is the
 * difference between being present and being engaged, so that gap is what the
 * page is arranged around, and everything else on it exists to stop that gap
 * being read as more than it is.
 *
 * Three refusals are deliberate and should survive future edits:
 *   - No score. One number reads as a verdict, and the same figure means
 *     opposite things for a reviewer and for a data-entry role.
 *   - Nothing is called missing unless the clock was running. A row whose day
 *     began before the recording did carries no absence flag at all.
 *   - Every threshold is printed next to the flag it produced. A rule nobody
 *     can read is a rule nobody trusts, and this one decides what a person is
 *     accused of.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { getAuth, getAuthHeaders } from "@/lib/auth";
import {
  GLASS_CARD, KPI_CARD, KPI_LABEL, KPI_VALUE, SMALL_BUTTON, INPUT_CLASS,
  TABLE_HEADER, TABLE_ROW, T_PAGE_TITLE, T_SECTION, T_BODY, T_CAPTION, T_LABEL,
} from "@/lib/ui-tokens";

// The same two names the server enforces. Kept here only so the page can say
// "not available" instead of rendering an empty table -- a hidden screen is
// not access control, the 403 is.
const VIEWERS = ["Yukihiro Nishimura", "Ayako Nishimura"];

type Row = {
  staff_name: string; city: string; branch_code: string; role: string;
  signed_in: boolean; sessions: number;
  login_at: string | null; first_action_at: string | null; last_action_at: string | null;
  span_minutes: number; active_minutes: number; idle_minutes: number;
  longest_idle_minutes: number;
  events: number; screens: number; reads: number; writes: number;
  distinct_screens: number; buckets: number[]; busiest_slot_share: number;
  partial: boolean; observed_from: string | null;
  shift: { start_hour: number; end_hour: number } | null;
  rostered: boolean | null;
  day_complete: boolean;
  clock_in: string | null; clock_out: string | null;
  flags: string[];
};

type Report = {
  date: string;
  idle_gap_minutes: number;
  rules: Record<string, { says: string } & Record<string, unknown>>;
  selection: { roles: string[]; city: string; individuals: string[] };
  coverage: {
    log_from: string | null; log_to: string | null; log_rows: number;
    partial_rows: number; people: number; day_in_progress: number;
    with_shift_reference: number; without_shift_reference: number;
  };
  rows: Row[];
};

type ScreenRow = { screen: string; events: number; writes: number; first_at: string; last_at: string };

const TZ: Record<string, string> = { manila: "Asia/Manila", dubai: "Asia/Dubai" };

function clock(iso: string | null, city: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-GB", {
      hour: "2-digit", minute: "2-digit", timeZone: TZ[city] || "Asia/Dubai",
    });
  } catch { return "—"; }
}

function hm(min: number): string {
  if (!min) return "0m";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

/** The day as 48 half hours. The shape answers "was this one flurry or a day"
 *  faster than any of the numbers beside it. */
function Strip({ buckets, shift }: { buckets: number[]; shift: Row["shift"] }) {
  const peak = Math.max(1, ...buckets);
  return (
    <div className="flex h-6 w-full items-end gap-[1px]" aria-hidden="true">
      {buckets.map((n, i) => {
        const rostered = shift && i >= shift.start_hour * 2 && i < shift.end_hour * 2;
        const h = n ? Math.max(3, Math.round((n / peak) * 24)) : 0;
        return (
          <div key={i} className="relative flex-1" style={{ height: 24 }}>
            {rostered && <div className="absolute inset-x-0 bottom-0 h-full rounded-[1px] bg-white/6" />}
            {h > 0 && (
              <div
                className="absolute inset-x-0 bottom-0 rounded-[1px] bg-violet-400"
                style={{ height: h }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

const FLAG_TONE: Record<string, string> = {
  NEVER_SIGNED_IN: "border-red-500/30 bg-red-500/10 text-red-300",
  NO_OS_ACTIVITY: "border-red-500/30 bg-red-500/10 text-red-300",
  MOSTLY_IDLE: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  LONG_IDLE: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  ONE_BURST: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  NO_DECISIONS: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  NO_SHIFT_REFERENCE: "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
};

const ROLE_LABEL: Record<string, string> = {
  HR_MANAGER: "HR Manager", MANILA_MANAGEMENT: "Manila Management",
  MANILA_MANAGER: "Manila Manager", HR_STAFF: "HR Staff", ADMIN: "Admin",
  INVENTORY_PURCHASING: "Inventory & Purchasing", HQ: "HQ",
};

export default function BackOfficeActivityPage() {
  // Prerendered HTML is the same for everybody and has no localStorage, so a
  // page that decides access on the first render tells every reader they are
  // not allowed, for a frame (lesson 42).
  const [mounted, setMounted] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<Report | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string>("");
  const [screens, setScreens] = useState<Record<string, ScreenRow[]>>({});

  useEffect(() => { setMounted(true); }, []);
  const me = mounted ? (getAuth()?.staffName || "") : "";
  const allowed = VIEWERS.includes(me);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const res = await fetch(`/api/admin/back-office/activity?date=${date}`,
        { headers: getAuthHeaders(), cache: "no-store" });
      if (!res.ok) {
        setErr(res.status === 403 ? "This page is not available to your account."
          : `Could not load (${res.status}).`);
        setData(null);
        return;
      }
      setData(await res.json());
    } catch {
      setErr("Could not load. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { if (allowed) void load(); }, [allowed, load]);

  async function toggle(r: Row) {
    const key = r.staff_name;
    if (open === key) { setOpen(""); return; }
    setOpen(key);
    if (screens[key]) return;
    try {
      const res = await fetch(
        `/api/admin/back-office/screens?staff_name=${encodeURIComponent(key)}&date=${date}&city=${r.city}`,
        { headers: getAuthHeaders(), cache: "no-store" });
      if (res.ok) {
        const j = await res.json();
        setScreens((s) => ({ ...s, [key]: j.rows || [] }));
      }
    } catch { /* the row still shows its numbers */ }
  }

  const totals = useMemo(() => {
    const rows = data?.rows || [];
    return {
      people: rows.length,
      flagged: rows.filter((r) => r.flags.length).length,
      partial: rows.filter((r) => r.partial).length,
      silent: rows.filter((r) => r.signed_in && r.events === 0 && !r.partial).length,
    };
  }, [data]);

  if (!mounted) return null;

  if (!allowed) {
    return (
      <div className="mx-auto max-w-md pt-16">
        <div className={`${GLASS_CARD} p-6 text-center`}>
          <h1 className={T_SECTION}>Not available</h1>
          <p className={`${T_BODY} mt-2`}>This page is limited to specific accounts.</p>
        </div>
      </div>
    );
  }

  const cov = data?.coverage;

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={T_PAGE_TITLE}>Back office — the shape of the day</h1>
          <p className={`${T_BODY} mt-1 max-w-2xl`}>
            Each row is how one person used this system on that date: when they were
            here, how much of that window they were engaged, and what they opened.
          </p>
          {data?.selection && (
            <p className={`${T_CAPTION} mt-2 max-w-2xl`}>
              Who is on this report: everyone in <strong>{data.selection.city}</strong> whose
              role is {data.selection.roles.map((r) => ROLE_LABEL[r] || r).join(", ")}
              {data.selection.individuals.length > 0 && (
                <> — plus <strong>{data.selection.individuals.join(", ")}</strong> by name.</>
              )}
            </p>
          )}
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className={T_LABEL} htmlFor="d">Date</label>
            <input id="d" type="date" value={date} className={`${INPUT_CLASS} mt-1`}
              onChange={(e) => setDate(e.target.value)} />
          </div>
          <button type="button" className={SMALL_BUTTON} onClick={() => void load()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* What this cannot tell you. First, not last: a reader who takes a low
          row as proof of idleness before reaching a footnote has already made
          the mistake this panel exists to prevent. */}
      <div className={`${GLASS_CARD} border-amber-500/20 bg-amber-500/5 p-4`}>
        <p className="text-sm font-semibold text-amber-200">Read this before acting on a row</p>
        <ul className={`${T_BODY} mt-2 list-disc space-y-1 pl-5`}>
          <li>This measures <strong>use of the OS</strong>. Work done on the phone, in a
            meeting, in a spreadsheet or on paper leaves nothing here, and a quiet row is
            not evidence of a quiet day.</li>
          {cov && cov.without_shift_reference > 0 && (
            <li><strong>{cov.without_shift_reference} of {cov.people}</strong> have no published
              shift at all, so for them a quiet day and a day off cannot be told apart. Those
              rows say so instead of being called absent.</li>
          )}
          {cov?.log_from && (
            <li>Recording began <strong>{new Date(cov.log_from).toLocaleString()}</strong>.
              Anything before that was never watched. Rows marked <em>partial</em> started
              their day outside the recorded window and carry no absence flag.</li>
          )}
          <li><strong>Nothing is flagged until the day is over for that person</strong> —
            a past date, or today once their shift has ended. Manila midnight is early
            evening in Dubai, so without this the whole roster would read as absent every
            morning. The numbers are live all day; only the verdicts wait.</li>
          <li>Writing nothing is not the same as doing nothing. A reviewer who checks
            forty cases and finds them all correct writes nothing at all.</li>
          <li><strong>Inventory &amp; Purchasing people work at store branches.</strong> Most
            of their day is on the floor, not in here, so a short engaged time is what a
            normal day looks like for them — read them against each other, not against
            the office rows.</li>
          <li>Reads and changes are <strong>observed by the server</strong>. The screen
            count is <strong>reported by the browser</strong>, so it is the one figure a
            person could inflate by clicking around. Judge on engaged time and on what
            was changed.</li>
        </ul>
      </div>

      {err && (
        <div className={`${GLASS_CARD} border-red-500/30 bg-red-500/5 p-4 text-sm text-red-200`}>{err}</div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className={KPI_CARD}><p className={KPI_LABEL}>Back office</p><p className={KPI_VALUE}>{totals.people}</p></div>
        <div className={KPI_CARD}><p className={KPI_LABEL}>Rows with a flag</p><p className={KPI_VALUE}>{totals.flagged}</p></div>
        <div className={KPI_CARD}><p className={KPI_LABEL}>Signed in, nothing done</p><p className={KPI_VALUE}>{totals.silent}</p></div>
        <div className={KPI_CARD}><p className={KPI_LABEL}>Day still in progress</p><p className={KPI_VALUE}>{cov?.day_in_progress ?? 0}</p></div>
      </div>

      <div className={`${GLASS_CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead>
              <tr>
                {["Person", "In", "Last action", "Here for", "Engaged", "Longest gap",
                  "Screens", "Reads", "Changes", "The day", ""].map((h) => (
                  <th key={h} className={`${TABLE_HEADER} px-4 text-left`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.rows || []).map((r) => (
                <Fragment key={r.staff_name}>
                  <tr className={TABLE_ROW}>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-white">{r.staff_name}</div>
                      <div className={T_CAPTION}>{r.city} · {r.branch_code} · {r.role}</div>
                      {r.flags.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {r.flags.map((f) => (
                            <span key={f}
                              title={data?.rules?.[f]?.says || ""}
                              className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${FLAG_TONE[f] || "border-white/15 bg-white/5 text-zinc-300"}`}>
                              {f.replace(/_/g, " ").toLowerCase()}
                            </span>
                          ))}
                        </div>
                      )}
                      {r.partial && (
                        <div className="mt-1 text-[10px] text-zinc-500">
                          partial — their day began before recording did
                        </div>
                      )}
                      {r.rostered === false && (
                        <div className="mt-1 text-[10px] text-zinc-500">not rostered this day</div>
                      )}
                      {!r.day_complete && (
                        <div className="mt-1 text-[10px] text-zinc-500">
                          day in progress — nothing judged yet
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums text-zinc-300">{clock(r.login_at, r.city)}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-zinc-300">{clock(r.last_action_at, r.city)}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-zinc-300">{hm(r.span_minutes)}</td>
                    <td className="px-4 py-3 text-sm font-semibold tabular-nums text-white">{hm(r.active_minutes)}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-zinc-400">{hm(r.longest_idle_minutes)}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-zinc-300">{r.screens}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-zinc-300">{r.reads}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-zinc-300">{r.writes}</td>
                    <td className="w-52 px-4 py-3"><Strip buckets={r.buckets} shift={r.shift} /></td>
                    <td className="px-4 py-3">
                      <button type="button" className={SMALL_BUTTON} onClick={() => void toggle(r)}>
                        {open === r.staff_name ? "Hide" : "Screens"}
                      </button>
                    </td>
                  </tr>
                  {open === r.staff_name && (
                    <tr className="border-t border-white/5 bg-black/20">
                      <td colSpan={11} className="px-4 py-4">
                        {(screens[r.staff_name] || []).length === 0 ? (
                          <p className={T_BODY}>No screens recorded for this person on this date.</p>
                        ) : (
                          <div className="space-y-1">
                            {(screens[r.staff_name] || []).map((s) => (
                              <div key={s.screen} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                                <span className="w-64 font-mono text-xs text-violet-200">{s.screen}</span>
                                <span className="tabular-nums text-zinc-400">
                                  {clock(s.first_at, r.city)}–{clock(s.last_at, r.city)}
                                </span>
                                <span className="tabular-nums text-zinc-500">{s.events} events</span>
                                <span className="tabular-nums text-zinc-500">{s.writes} changes</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* The rules, in full. Whoever reads a flag has to be able to check what
          produced it without asking anyone. */}
      {data?.rules && (
        <div className={`${GLASS_CARD} p-5`}>
          <h2 className={T_SECTION}>What each flag means</h2>
          <p className={`${T_CAPTION} mt-1`}>
            A gap of {data.idle_gap_minutes} minutes or more counts as away, not as thinking.
          </p>
          <dl className="mt-3 space-y-2">
            {Object.entries(data.rules).map(([k, v]) => (
              <div key={k} className="flex flex-wrap gap-x-3 gap-y-1">
                <dt className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${FLAG_TONE[k] || "border-white/15 bg-white/5 text-zinc-300"}`}>
                  {k.replace(/_/g, " ").toLowerCase()}
                </dt>
                <dd className={`${T_BODY} flex-1 min-w-[16rem]`}>{v.says}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
