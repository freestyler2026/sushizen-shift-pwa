"use client";

// Who has asked for which days off, a month at a time (HQ, 2026-11-26).
//
// The red list above only names approved days still on the roster, from two
// weeks back to three weeks ahead, so December showed nothing and the reviewer
// could not see who else was off before answering a request. This lists every
// day asked off in the month, approved or still waiting; a refused request is
// not here because the person is expected at work.
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getAuthHeaders } from "@/lib/auth";
import { isoToday } from "@/lib/date";

export type DayOffMonthItem = {
  request_id: string;
  staff_name: string;
  branch: string;
  request_type: string;
  work_date: string;
  request_span: string;
  days: number;
  state: "approved" | "pending";
  manager_status: string;
  hq_status: string;
  requested_on: string | null;
  still_rostered: boolean;
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

function dayLabel(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}`;
}

/** Which stage it is waiting on, in the words the inbox already uses. */
function waitingOn(i: DayOffMonthItem) {
  if ((i.manager_status || "").toUpperCase() !== "APPROVED") return "waiting: Manager";
  return "waiting: HQ";
}

export default function DayOffMonth({ city, refreshKey }: { city: string; refreshKey?: unknown }) {
  const [month, setMonth] = useState(() => isoToday().slice(0, 7));
  const [items, setItems] = useState<DayOffMonthItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let dead = false;
    setFailed(false);
    fetch(`/api/admin/day-off-month?city=${encodeURIComponent(city)}&month=${month}`,
      { headers: getAuthHeaders() })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { items?: DayOffMonthItem[] }) => { if (!dead) setItems(d.items ?? []); })
      .catch(() => { if (!dead) { setItems([]); setFailed(true); } });
    return () => { dead = true; };
  }, [city, month, refreshKey]);

  const byDay = new Map<string, DayOffMonthItem[]>();
  for (const i of items ?? []) {
    const list = byDay.get(i.work_date) ?? [];
    list.push(i);
    byDay.set(i.work_date, list);
  }
  const approved = (items ?? []).filter(i => i.state === "approved").length;
  const pending = (items ?? []).filter(i => i.state === "pending").length;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4" data-testid="day-off-month">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-zinc-100">Days off by month</p>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" aria-label="Previous month" onClick={() => setMonth(m => shiftMonth(m, -1))}
            className="rounded-md border border-white/10 bg-white/5 p-1 text-zinc-300 hover:text-white">
            <ChevronLeft size={14} />
          </button>
          <span className="min-w-[8.5rem] text-center text-xs font-semibold text-zinc-200" data-testid="day-off-month-label">
            {monthLabel(month)}
          </span>
          <button type="button" aria-label="Next month" onClick={() => setMonth(m => shiftMonth(m, 1))}
            className="rounded-md border border-white/10 bg-white/5 p-1 text-zinc-300 hover:text-white">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
      <p className="mt-0.5 text-xs text-zinc-500">
        Every day asked off in {city === "dubai" ? "Dubai" : "Manila"}, approved or waiting. Refused requests are not listed.
        {items && items.length > 0 && <> {approved} approved · {pending} waiting (person-days).</>}
      </p>

      {items === null ? (
        <p className="mt-3 text-xs text-zinc-500">Loading…</p>
      ) : failed ? (
        <p className="mt-3 text-xs text-red-400">Could not load this month. Press Refresh to try again.</p>
      ) : byDay.size === 0 ? (
        <p className="mt-3 text-xs text-zinc-500">Nobody has asked for a day off in {monthLabel(month)}.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {[...byDay.entries()].map(([day, list]) => (
            <li key={day} className="flex gap-3 text-xs">
              <span className="w-12 flex-none tabular-nums text-zinc-400">{dayLabel(day)}</span>
              <span className="flex flex-wrap gap-x-3 gap-y-1">
                {list.map(i => (
                  <span key={i.request_id + day} className="whitespace-nowrap" title={i.request_span}>
                    <span className="font-semibold text-white">{i.staff_name}</span>
                    {i.branch ? <span className="text-zinc-500"> {i.branch}</span> : null}
                    {" · "}
                    <span className={i.state === "approved" ? "text-emerald-300" : "text-amber-300"}>
                      {i.state === "approved" ? "approved" : waitingOn(i)}
                    </span>
                    {i.days > 1 && <span className="text-zinc-400"> · {i.days} days</span>}
                    {i.still_rostered && <span className="text-rose-300"> · still rostered</span>}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
